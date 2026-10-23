// Importar animacion: lee la animacion de un modelo humanoide (FBX de Mixamo, GLB/GLTF, BVH, DAE/Collada) y la convierte en los
// mismos 33 puntos que da MediaPipe al mirar un video. Asi pasa por el mismo camino que el Mocap (retarget, estilos,
// film de BBS) sin rehacer nada: es como si una camara perfecta filmara al modelo de frente.
import * as THREE from '../three.module.min.js';

import { reconocer, firma as firmaEsqueleto, IMPRESCINDIBLES, PARTES } from '../nucleo/esqueleto.js';
import { curlsDeMano, DEDOS } from '../nucleo/dedos.js';

const LIB = '../importar_lib/loaders/';
export { IMPRESCINDIBLES, PARTES };

// Los huesos del modelo, en la pose de reposo (antes de animar): [{ nombre, padre, pos, obj }]
function listarHuesos(raiz) {
  raiz.updateMatrixWorld(true);
  const objs = [];
  raiz.traverse((o) => { if (o.isBone) objs.push(o); });
  if (!objs.length) raiz.traverse((o) => { if (o !== raiz && o.isObject3D && !o.isMesh && !o.isSkinnedMesh && !o.isCamera && !o.isLight) objs.push(o); });
  const idx = new Map(objs.map((o, i) => [o, i]));
  return objs.map((o) => {
    let p = o.parent; while (p && !idx.has(p)) p = p.parent;
    return { nombre: o.name || '', padre: p ? idx.get(p) : -1, pos: o.getWorldPosition(new THREE.Vector3()).toArray(), quat: o.getWorldQuaternion(new THREE.Quaternion()), obj: o };
  });
}

/** Pone en an.huesos lo reconocido + lo que el usuario eligió a mano ({parte: nombre del hueso, o '' = ninguno}). */
export function aplicarMapa(an, manual = {}) {
  const mapa = { ...an.auto.mapa }, origen = { ...an.auto.origen };
  for (const [k, nombre] of Object.entries(manual || {})) {
    if (!PARTES.includes(k)) continue;
    // (primero entre los huesos del personaje elegido: dos personajes pueden tener huesos con el mismo nombre)
    const miembros = an.personajes ? an.personajes[an.personaje].miembros : an.esqueleto.map((_, j) => j);
    const i = nombre ? (miembros.find((j) => an.esqueleto[j].nombre === nombre) ?? -1) : -1;
    if (nombre && i < 0) continue;   // ese hueso no está en este modelo
    if (i >= 0) mapa[k] = i; else delete mapa[k];
    origen[k] = 'manual';
  }
  an.mapa = mapa; an.origen = origen;
  an.huesos = Object.fromEntries(PARTES.map((k) => [k, mapa[k] !== undefined ? an.esqueleto[mapa[k]].obj : null]));
  an.faltan = IMPRESCINDIBLES.filter((k) => !an.huesos[k]);
  return an;
}

// Un .zip (como los que se bajan de Sketchfab, a veces con otro .zip adentro): se busca la animacion que trae.
const EXT_ANIM = /\.(fbx|glb|gltf|bvh|dae)$/i;
function sacarDeZip(bytes, unzipSync, prof = 0) {
  const arch = unzipSync(bytes);
  const cands = [];
  for (const [n, d] of Object.entries(arch)) {
    if (/(^|\/)__MACOSX\//.test(n)) continue;
    if (EXT_ANIM.test(n)) cands.push({ nombre: n.split('/').pop(), bytes: d });
    else if (/\.zip$/i.test(n) && prof < 3) { try { const r = sacarDeZip(d, unzipSync, prof + 1); if (r) cands.push(r); } catch { /* zip roto: se saltea */ } }
  }
  return cands.sort((a, b) => b.bytes.length - a.bytes.length)[0] || null;   // la mas grande suele ser la de verdad
}

/** Lee el archivo y devuelve { raiz, clips, huesos, faltan, tipo, archivo }. Falla si faltan huesos imprescindibles. */
export async function leerAnimacion(nombre, bytes) {
  const an = await cargarAnimacion(nombre, bytes);
  if (an.faltan.length) throw new Error('No encuentro estos huesos del humanoide: ' + an.faltan.join(', ') + '. Por ahora sirven esqueletos tipo Mixamo, BVH (CMU/DAZ) o similares.');
  return an;
}

/** Igual que leerAnimacion, pero no falla si faltan huesos (para poder mostrar el esqueleto igual). */
export async function cargarAnimacion(nombre, bytes) {
  const ext = String(nombre).toLowerCase().split('.').pop();
  if (ext === 'zip') {
    const { unzipSync } = await import(LIB + '../libs/fflate.module.js');
    const u8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    const r = sacarDeZip(u8, unzipSync);
    if (!r) throw new Error('El .zip no trae ninguna animación (FBX, GLB, BVH o DAE).');
    const an = await cargarAnimacion(r.nombre, r.bytes);
    an.archivo = r.nombre;
    return an;
  }
  const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let raiz, clips;
  if (ext === 'fbx') {
    const { FBXLoader } = await import(LIB + 'FBXLoader.js');
    // solo hacen falta los huesos: las texturas que nombra el FBX (que no vienen adentro) no se buscan
    const sinTexturas = new THREE.LoadingManager();
    sinTexturas.setURLModifier((u) => (/^(data|blob):/.test(u) ? u : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='));
    raiz = new FBXLoader(sinTexturas).parse(buf, '');
    clips = raiz.animations || [];
  } else if (ext === 'glb' || ext === 'gltf') {
    const { GLTFLoader } = await import(LIB + 'GLTFLoader.js');
    const data = ext === 'gltf' ? new TextDecoder().decode(buf) : buf;
    const g = await new GLTFLoader().parseAsync(data, '');
    raiz = g.scene; clips = g.animations || [];
  } else if (ext === 'dae') {
    const { ColladaLoader } = await import(LIB + 'ColladaLoader.js');
    const m = new THREE.LoadingManager();   // solo hacen falta los huesos: no se buscan las texturas que nombra el archivo
    m.setURLModifier((u) => (/^(data|blob):/.test(u) ? u : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='));
    const c = new ColladaLoader(m).parse(new TextDecoder().decode(buf), '');
    raiz = c.scene; clips = raiz.animations || [];
    // Collada trae el eje vertical y la escala en el propio archivo (ya aplicados por el lector): nada más que hacer
  } else if (ext === 'bvh') {
    const { BVHLoader } = await import(LIB + 'BVHLoader.js');
    const r = new BVHLoader().parse(new TextDecoder().decode(buf));
    raiz = new THREE.Group(); raiz.add(r.skeleton.bones[0]);
    clips = [r.clip];
  } else throw new Error('Formato no soportado: usá FBX, GLB, GLTF, BVH, DAE (Collada) o un .zip que los traiga.');
  if (!clips.length) throw new Error('El archivo no trae ninguna animación.');
  return prepararAnimacion(raiz, clips, ext, nombre);
}

/** Arma el objeto de la animación a partir de la escena ya leída: huesos, personajes y reconocimiento. */
export function prepararAnimacion(raiz, clips, tipo = '', archivo = '') {
  const esqueleto = listarHuesos(raiz);
  const an = { raiz, clips, esqueleto, tipo, archivo, personajes: personajes(esqueleto) };
  // varios personajes en el mismo archivo: de entrada, el que mejor se reconoce como humanoide (y el más grande)
  const mejor = an.personajes.reduce((m, p, i, a) => (p.faltan < a[m].faltan || (p.faltan === a[m].faltan && p.huesos > a[m].huesos) ? i : m), 0);
  return elegirPersonaje(an, mejor);
}

// Cada esqueleto suelto del archivo (un hueso sin padre y todo lo que cuelga de él) que puede ser un personaje.
function personajes(H) {
  const hijos = H.map(() => []); H.forEach((h, i) => { if (h.padre >= 0) hijos[h.padre].push(i); });
  const out = [];
  H.forEach((h, i) => {
    if (h.padre >= 0) return;
    const miembros = []; const pila = [i];
    while (pila.length) { const k = pila.pop(); miembros.push(k); pila.push(...hijos[k]); }
    miembros.sort((a, b) => a - b);
    const sub = miembros.map((k) => ({ ...H[k], padre: miembros.indexOf(H[k].padre) }));
    const { mapa } = reconocer(sub);
    out.push({ raiz: i, nombre: H[i].nombre || 'Personaje ' + (out.length + 1), huesos: miembros.length, miembros, faltan: IMPRESCINDIBLES.filter((k) => mapa[k] === undefined).length });
  });
  const utiles = out.filter((p) => p.huesos >= 10);
  return utiles.length ? utiles : out.length ? out : [{ raiz: -1, nombre: 'Personaje', huesos: H.length, miembros: H.map((_, i) => i), faltan: IMPRESCINDIBLES.length }];
}

/** Usa el personaje k del archivo (si trae varios): reconoce sus huesos y deja el mapa automático en an.auto. */
export function elegirPersonaje(an, k) {
  const p = an.personajes[k] || an.personajes[0];
  an.personaje = an.personajes.indexOf(p);
  const sub = p.miembros.map((i) => ({ ...an.esqueleto[i], padre: p.miembros.indexOf(an.esqueleto[i].padre) }));
  const r = reconocer(sub);
  const global = (m) => Object.fromEntries(Object.entries(m).map(([parte, i]) => [parte, p.miembros[i]]));
  an.auto = { mapa: global(r.mapa), origen: r.origen };
  an.firma = firmaEsqueleto(sub);
  return aplicarMapa(an);
}

/**
 * Pasa una animacion a "pose" como la de analizarPose(): { world (N x 33 x 3, metros, MediaPipe), vis, times, offset }.
 * fps = cuadros por segundo con que se muestrea (el Mocap despues lo pasa a ticks de BBS).
 * Ademas: dedos ({ L, R }: N x [pulgar, indice, medio, anular, menique], de 0 = estirado a 1 = cerrado; si hay huesos de dedos),
 * mov (N x [izquierda, arriba, adelante]) = cuanto se movio la cadera desde el comienzo, medido en largos de
 * pierna (muslo + pierna), para pasar el desplazamiento por el piso a la posicion del actor.
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
  // hombros pegados al pecho: si el modelo encoge los hombros (las clavículas se mueven mucho, como en la pose zombi),
  // la línea entre hombros se achica y se tuerce, y el torso convertido daba vueltas. Se usan dos puntos fijos al hueso
  // del pecho (el padre del cuello) y los brazos se corren lo mismo, así no cambia ni su dirección ni el doblez del codo.
  const pecho = [H.neck && H.neck.parent, H.head && H.head.parent].find((o) => o && o.isBone && o !== H.hips) || null;
  const enPecho = pecho && { L: pecho.worldToLocal(pos(H.brazoL)), R: pecho.worldToLocal(pos(H.brazoR)) };
  const largoPierna = ['L', 'R'].reduce((s, l) => s + pos(H['muslo' + l]).distanceTo(pos(H['pierna' + l])) + pos(H['pierna' + l]).distanceTo(pos(H['pie' + l])), 0) / 2 || 1;
  const cadIni = pos(H.musloL).add(pos(H.musloR)).multiplyScalar(0.5);
  const mov = [];
  // giro de brazos y muslos sobre su eje: hace falta saber hacia donde mira la "espalda" de cada hueso (el lado contrario
  // a donde se dobla el codo, o hacia donde se dobla la rodilla). Se aprende de la misma animacion: en los cuadros con el
  // codo bien doblado, la bisagra queda a la vista; promediada en el marco del hueso es fija. Sin eso, la de la pose de reposo.
  const LARGOS = [['left_arm', 'brazoL', 'antebrazoL', 'manoL', -1], ['right_arm', 'brazoR', 'antebrazoR', 'manoR', -1],
    ['left_leg', 'musloL', 'piernaL', 'pieL', 1], ['right_leg', 'musloR', 'piernaR', 'pieR', 1]];
  const muestras = Object.fromEntries(LARGOS.map(([k]) => [k, []]));   // [quat del hueso, espalda medida o null]
  // dedos: cada uno es su primer hueso y los que cuelgan de él (hasta 4 puntos); de ahi sale cuanto esta cerrado
  const cadena = (o) => { const c = []; for (let x = o; x && c.length < 4; x = x.children.find((h) => h.isBone || h.isObject3D && h.children.length)) c.push(x); return c; };
  const cadenas = {};
  for (const l of ['L', 'R']) {
    const cs = Object.fromEntries(DEDOS.map((k) => [k, H[k + l] ? cadena(H[k + l]) : null]));
    if (H['mano' + l] && Object.values(cs).filter(Boolean).length >= 2) cadenas[l] = cs;
  }
  const dedos = Object.fromEntries(Object.keys(cadenas).map((l) => [l, []]));
  const aDir = (d) => [d.dot(izq), -d.dot(arriba), -d.dot(frente)];

  const world = [], vis = [], times = [];
  const aMP = (p, cadera) => { const d = p.clone().sub(cadera).multiplyScalar(esc); return [d.dot(izq), -d.dot(arriba), -d.dot(frente)]; };
  for (let t = desde; t <= fin + 1e-6; t += 1 / fps) {
    muestra(Math.min(t, c.duration - 1e-4));
    const cad = pos(H.musloL).add(pos(H.musloR)).multiplyScalar(0.5);
    const dc = cad.clone().sub(cadIni).divideScalar(largoPierna);
    mov.push([dc.dot(izq), dc.dot(arriba), dc.dot(frente)]);
    for (const [l, cs] of Object.entries(cadenas)) {
      const pt = (o) => pos(o).toArray();
      dedos[l].push(curlsDeMano({ muneca: pt(H['mano' + l]), dedos: Object.fromEntries(DEDOS.map((k) => [k, cs[k] ? cs[k].map(pt) : null])) }));
    }
    for (const [k, a, b, c, signo] of LARGOS) {
      const d = pos(H[b]).sub(pos(H[a])).normalize(), f = pos(H[c]).sub(pos(H[b])).normalize();
      const perp = f.clone().addScaledVector(d, -f.dot(d));
      const doblado = Math.acos(Math.max(-1, Math.min(1, d.dot(f)))) > 0.5 && perp.lengthSq() > 1e-6;
      muestras[k].push([quat(H[a]), doblado ? perp.normalize().multiplyScalar(signo) : null]);
    }
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
      const real = pos(H['brazo' + lado]);
      const hombro = enPecho ? pecho.localToWorld(enPecho[lado].clone()) : real;
      const corrido = hombro.clone().sub(real);   // lo que se movió el hombro: el brazo entero se corre igual
      const codo = pos(H['antebrazo' + lado]).add(corrido), muneca = pos(H['mano' + lado]).add(corrido);
      const dirMano = muneca.clone().sub(codo).normalize();
      const dedo = (n, extra) => (H[n + lado] ? pos(H[n + lado]).add(corrido) : muneca.clone().addScaledVector(dirMano, extra * m));
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
  const giros = {};
  const izqR = pos(H.musloL).sub(pos(H.musloR)); izqR.y = 0; izqR.normalize();   // (para la pose de reposo, de respaldo)
  for (const [k, a] of LARGOS) {
    const suma = new THREE.Vector3(); let n = 0;
    for (const [q, e] of muestras[k]) if (e) { suma.add(e.clone().applyQuaternion(q.clone().invert())); n++; }
    let local = n >= 5 && suma.length() > 0.5 * n ? suma.normalize() : null;
    if (!local) {
      const h = an.esqueleto.find((x) => x.obj === H[a]);
      if (!h || !h.quat) continue;
      local = new THREE.Vector3().crossVectors(arriba, izqR).normalize().applyQuaternion(h.quat.clone().invert());
    }
    giros[k] = muestras[k].map(([q]) => aDir(local.clone().applyQuaternion(q)));
  }
  return { world, vis, times, offset: 0, mov, giros, dedos };
}
