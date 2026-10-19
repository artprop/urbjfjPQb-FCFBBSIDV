// Importar animacion: lee la animacion de un modelo humanoide (FBX de Mixamo, GLB/GLTF, BVH) y la convierte en los
// mismos 33 puntos que da MediaPipe al mirar un video. Asi pasa por el mismo camino que el Mocap (retarget, estilos,
// film de BBS) sin rehacer nada: es como si una camara perfecta filmara al modelo de frente.
import * as THREE from '../three.module.min.js';

const LIB = '../importar_lib/loaders/';
const norm = (s) => String(s).replace(/^.*[:|]/, '').replace(/^mixamorig\d*/i, '').replace(/[\s_.\-]/g, '').toLowerCase();

// nombres posibles de cada hueso (ya normalizados). {L} = izquierdo, {R} = derecho
const NOMBRES = {
  hips: ['hips', 'hip', 'pelvis', 'bip01pelvis', 'root'],
  neck: ['neck', 'neck1', 'neck01'],
  head: ['head'],
  brazo: ['{l}arm', '{l}upperarm', '{l}shldr', 'upperarm{s}', 'arm{s}', '{l}shoulderjoint', 'bip01{l}upperarm'],
  antebrazo: ['{l}forearm', '{l}lowerarm', 'lowerarm{s}', 'forearm{s}', '{l}elbow', 'bip01{l}forearm'],
  mano: ['{l}hand', 'hand{s}', '{l}wrist', 'bip01{l}hand'],
  muslo: ['{l}upleg', '{l}thigh', '{l}upperleg', 'thigh{s}', 'upperleg{s}', '{l}hip', 'bip01{l}thigh'],
  pierna: ['{l}leg', '{l}shin', '{l}lowerleg', '{l}calf', 'calf{s}', 'lowerleg{s}', 'shin{s}', '{l}knee', 'bip01{l}calf'],
  pie: ['{l}foot', 'foot{s}', '{l}ankle', 'bip01{l}foot'],
  dedo_pie: ['{l}toebase', '{l}toe', '{l}toes', 'toe{s}', 'ball{s}', 'bip01{l}toe0'],
  indice: ['{l}handindex1', '{l}index1', 'index01{s}', '{l}handindex2', 'indexfinger1{s}'],
  menique: ['{l}handpinky1', '{l}pinky1', 'pinky01{s}', '{l}handring1', '{l}mid1'],
  pulgar: ['{l}handthumb2', '{l}thumb2', 'thumb02{s}', '{l}handthumb1', '{l}thumb1'],
};
const LADOS = { L: { l: ['left', 'l'], s: ['l', 'left'] }, R: { l: ['right', 'r'], s: ['r', 'right'] } };

function buscarHuesos(raiz) {
  const todos = [];
  raiz.traverse((o) => { if (o.isBone || o.type === 'Bone' || (o.isObject3D && o.children.length && !o.isMesh && !o.isSkinnedMesh)) todos.push(o); });
  const porNombre = new Map();
  for (const o of todos) { const k = norm(o.name); if (k && !porNombre.has(k)) porNombre.set(k, o); }
  const uno = (cands) => { for (const c of cands) if (porNombre.has(c)) return porNombre.get(c); return null; };
  const h = {};
  for (const k of ['hips', 'neck', 'head']) h[k] = uno(NOMBRES[k]);
  for (const [lado, v] of Object.entries(LADOS)) {
    for (const k of Object.keys(NOMBRES)) {
      if (['hips', 'neck', 'head'].includes(k)) continue;
      const cands = NOMBRES[k].flatMap((p) => (p.includes('{l}') ? v.l.map((x) => p.replace('{l}', x)) : p.includes('{s}') ? v.s.map((x) => p.replace('{s}', x)) : [p]));
      h[k + lado] = uno(cands);
    }
  }
  return h;
}

export const IMPRESCINDIBLES = ['hips', 'head', 'brazoL', 'antebrazoL', 'manoL', 'brazoR', 'antebrazoR', 'manoR', 'musloL', 'piernaL', 'pieL', 'musloR', 'piernaR', 'pieR'];

/** Lee el archivo y devuelve { raiz, clips, huesos, faltan, tipo }. */
export async function leerAnimacion(nombre, bytes) {
  const ext = String(nombre).toLowerCase().split('.').pop();
  const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let raiz, clips;
  if (ext === 'fbx') {
    const { FBXLoader } = await import(LIB + 'FBXLoader.js');
    raiz = new FBXLoader().parse(buf, '');
    clips = raiz.animations || [];
  } else if (ext === 'glb' || ext === 'gltf') {
    const { GLTFLoader } = await import(LIB + 'GLTFLoader.js');
    const data = ext === 'gltf' ? new TextDecoder().decode(buf) : buf;
    const g = await new GLTFLoader().parseAsync(data, '');
    raiz = g.scene; clips = g.animations || [];
  } else if (ext === 'bvh') {
    const { BVHLoader } = await import(LIB + 'BVHLoader.js');
    const r = new BVHLoader().parse(new TextDecoder().decode(buf));
    raiz = new THREE.Group(); raiz.add(r.skeleton.bones[0]);
    clips = [r.clip];
  } else throw new Error('Formato no soportado: usá FBX, GLB, GLTF o BVH.');
  if (!clips.length) throw new Error('El archivo no trae ninguna animación.');
  const huesos = buscarHuesos(raiz);
  const faltan = IMPRESCINDIBLES.filter((k) => !huesos[k]);
  if (faltan.length) throw new Error('No encuentro estos huesos del humanoide: ' + faltan.join(', ') + '. Por ahora sirven esqueletos tipo Mixamo, BVH (CMU/DAZ) o similares.');
  return { raiz, clips, huesos, faltan, tipo: ext };
}

/**
 * Pasa una animacion a "pose" como la de analizarPose(): { world (N x 33 x 3, metros, MediaPipe), vis, times, offset }.
 * fps = cuadros por segundo con que se muestrea (el Mocap despues lo pasa a ticks de BBS).
 */
export function aPose(an, clip = 0, { fps = 30, desde = 0, hasta = null } = {}) {
  const c = typeof clip === 'number' ? an.clips[clip] : clip;
  const mixer = new THREE.AnimationMixer(an.raiz);
  const accion = mixer.clipAction(c); accion.play();
  const H = an.huesos, v = () => new THREE.Vector3();
  const pos = (o) => o.getWorldPosition(v());
  const quat = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const fin = Math.min(c.duration, hasta ?? c.duration);
  const muestra = (t) => { mixer.setTime(t); an.raiz.updateMatrixWorld(true); };

  // marco de la "camara": se mira al modelo de frente, como estaba al empezar
  muestra(desde);
  const cad0 = pos(H.hips), cab0 = pos(H.head);
  const arriba = new THREE.Vector3(0, 1, 0);
  const izq = pos(H.musloL).sub(pos(H.musloR)).add(pos(H.brazoL).sub(pos(H.brazoR)));
  izq.addScaledVector(arriba, -izq.dot(arriba)).normalize();          // izquierda del modelo (horizontal)
  const frente = new THREE.Vector3().crossVectors(izq, arriba).normalize();
  const alto = cab0.distanceTo(cad0) || 1;
  const esc = 0.55 / alto;                                           // cadera a cabeza ~ 55 cm, como una persona
  const qCab0 = quat(H.head);

  const world = [], vis = [], times = [];
  const aMP = (p, cadera) => { const d = p.clone().sub(cadera).multiplyScalar(esc); return [d.dot(izq), -d.dot(arriba), -d.dot(frente)]; };
  for (let t = desde; t <= fin + 1e-6; t += 1 / fps) {
    muestra(Math.min(t, c.duration - 1e-4));
    const cad = pos(H.musloL).add(pos(H.musloR)).multiplyScalar(0.5);
    const P = new Array(33);
    // cabeza: puntos de la cara puestos alrededor del hueso de la cabeza, girados con ella
    const giro = quat(H.head).multiply(qCab0.clone().invert());
    const f = frente.clone().applyQuaternion(giro), u = arriba.clone().applyQuaternion(giro), l = izq.clone().applyQuaternion(giro);
    const m = 1 / esc;   // metros -> unidades del modelo
    const centro = pos(H.head).addScaledVector(u, 0.09 * m);
    const cara = (adelante, sube, lado) => centro.clone().addScaledVector(f, adelante * m).addScaledVector(u, sube * m).addScaledVector(l, lado * m);
    P[0] = cara(0.10, 0, 0);
    P[1] = cara(0.085, 0.03, 0.03); P[2] = cara(0.085, 0.03, 0.045); P[3] = cara(0.08, 0.03, 0.06);
    P[4] = cara(0.085, 0.03, -0.03); P[5] = cara(0.085, 0.03, -0.045); P[6] = cara(0.08, 0.03, -0.06);
    P[7] = cara(0, 0.01, 0.075); P[8] = cara(0, 0.01, -0.075);
    P[9] = cara(0.09, -0.04, 0.025); P[10] = cara(0.09, -0.04, -0.025);
    for (const [lado, k] of [['L', 0], ['R', 1]]) {
      const hombro = pos(H['brazo' + lado]), codo = pos(H['antebrazo' + lado]), muneca = pos(H['mano' + lado]);
      const dirMano = muneca.clone().sub(codo).normalize();
      const dedo = (n, extra) => (H[n + lado] ? pos(H[n + lado]) : muneca.clone().addScaledVector(dirMano, extra * m));
      P[11 + k] = hombro; P[13 + k] = codo; P[15 + k] = muneca;
      P[17 + k] = dedo('menique', 0.07); P[19 + k] = dedo('indice', 0.08); P[21 + k] = dedo('pulgar', 0.05);
      const muslo = pos(H['muslo' + lado]), rodilla = pos(H['pierna' + lado]), tobillo = pos(H['pie' + lado]);
      let punta = H['dedo_pie' + lado] ? pos(H['dedo_pie' + lado]) : null;
      if (!punta || punta.distanceTo(tobillo) < 1e-6) {
        punta = tobillo.clone().addScaledVector(frente, 0.14 * m).addScaledVector(arriba, -0.06 * m);   // sin dedo: hacia adelante
      }
      const talon = tobillo.clone().addScaledVector(punta.clone().sub(tobillo), -0.3).addScaledVector(arriba, -0.05 * m);
      P[23 + k] = muslo; P[25 + k] = rodilla; P[27 + k] = tobillo; P[29 + k] = talon; P[31 + k] = punta;
    }
    world.push(P.map((p) => aMP(p, cad)));
    vis.push(new Array(33).fill(1));
    times.push(t - desde);
  }
  mixer.stopAllAction(); mixer.uncacheRoot(an.raiz);
  return { world, vis, times, offset: 0 };
}
