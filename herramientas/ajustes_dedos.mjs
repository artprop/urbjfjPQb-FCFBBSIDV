// Genera mocap/datos/dedos/ajustes.json: las poses de mano abierta y cerrada de cada modelo de dedos, para cada cuerpo
// (steve_bends, alex_bends, emoticons/steve, emoticons/alex) y cada mano, con los dedos en su lugar:
//  - dedos (el del usuario): la referencia es su form real (mano izquierda en alex_bends): cerrada = su puño; abierta =
//    lo mismo con los dedos estirados (así nada se desliza al abrir y cerrar). La derecha es el ESPEJO exacto de la
//    izquierda, dedo por dedo (el modelo es uno solo para las dos manos: con las poses de la derecha que había, los dedos
//    quedaban 1 px adelante, se cerraban hacia afuera y el pulgar cruzaba la mano).
//  - Fingers (Steve / Alex): las poses del autor (Idle / Fist) de cada mano, con la mano en el lugar donde el autor la
//    diseñó (el pivote del ítem, centrado en la mano). En steve_bends el ítem derecho está 1 px adelante: se corrige.
//  - En otro cuerpo (o en emoticons, que tiene otros ejes) se mueve y se gira el Anchor para que la mano quede igual
//    respecto del centro de la cara de abajo de la mano.
// Las cuentas son las de la vista (mocap/dedos3d.js = Visor = BBS). Uso: node herramientas/ajustes_dedos.mjs
import * as THREE from '../mocap/three.module.min.js';
import { crearModelo } from '../mocap/modelo3d.js';
import { MODELOS } from '../mocap/modelo_datos.js';
import { EMOTICONS } from '../mocap/modelo_emoticons.js';
import { Mano3D, matrizTransform } from '../mocap/dedos3d.js';
import { MODELOS_DEDOS } from '../mocap/nucleo/dedos.js';
import { readFileSync, writeFileSync } from 'node:fs';

const RAIZ = new URL('../', import.meta.url).pathname;
const leer = (p) => JSON.parse(readFileSync(RAIZ + p, 'utf8'));
const D2R = Math.PI / 180;
const CUERPOS = ['steve_bends', 'alex_bends', 'emoticons_steve', 'emoticons_alex'];
const LADOS = ['L', 'R'];
const nl = (l) => (l === 'L' ? 'left' : 'right');

// ---------------------------------------------------------------- cuerpos
// marco de la mano en reposo: { nodo (de donde cuelga la parte), centro (centro de la cara de abajo de la mano, mundo), escala }
function cuerpo(nombre, lado) {
  const emot = nombre.startsWith('emoticons');
  const mod = crearModelo(emot ? 'emoticons_steve' : nombre);
  mod.raiz.updateMatrixWorld(true);
  if (!emot) {
    // el cubo base del antebrazo (sin la capa de la chaqueta, que está inflada): centro de su cara de abajo, en bloques
    const nodo = mod.todos[`${nl(lado)}_arm_item`], c = MODELOS[nombre].grupos[`${nl(lado)}_elbow`].c[0];
    return { mod, nodo, centro: new THREE.Vector3(c.from[0] + c.size[0] / 2, c.from[1], c.from[2] + c.size[2] / 2).divideScalar(16), escala: 1 };
  }
  // emoticons: la mano es la punta del brazo (low_*_arm.end); su cola es la punta de la mano. emoticons/alex tiene el brazo
  // más fino: su ítem va medio píxel hacia adentro (config del modelo), lo mismo el centro de la mano
  const nodo = mod.huesos[`low_${nl(lado)}_arm.end`];
  const h = EMOTICONS.huesos.find((x) => x.n === `low_${nl(lado)}_arm.end`);
  const cola = new THREE.Vector3(...h.cola);
  if (nombre === 'emoticons_alex') cola.x += (lado === 'L' ? -1 : 1) * 0.03125;   // en coordenadas del bobj (izq = +x)
  return { mod, nodo, centro: cola.applyMatrix4(mod.raiz.matrixWorld), escala: EMOTICONS.escala };
}

// ---------------------------------------------------------------- manos
function montar(datos, c, pose, transform = null) {
  const m = new Mano3D(datos, null, transform);
  c.nodo.add(m.raiz); m.aplicar(pose || {}); c.mod.raiz.updateMatrixWorld(true);
  return m;
}
const datosDe = (id, lado) => {
  const cfg = MODELOS_DEDOS[id], carpeta = 'mocap/datos/' + cfg.carpeta(lado) + '/';
  const m = leer(carpeta + cfg.archivo);
  return { cfg, grupos: m.model.groups, tam: m.model.texture || [64, 64], poses: leer(carpeta + 'poses.json'), textura: null };
};
// orden: padres antes que hijos
function ordenGrupos(grupos) {
  const out = [], hecho = new Set();
  const ir = (n) => { if (hecho.has(n)) return; const p = grupos[n].parent; if (p && grupos[p]) ir(p); hecho.add(n); out.push(n); };
  Object.keys(grupos).forEach(ir);
  return out;
}

// pose de un grupo para que quede con matriz de mundo W, colgado de padre (mundo P): matriz local = T(tt)·T(piv)·R·T(-piv)
// de los ángulos equivalentes, el más parecido a pista (así abrir y cerrar no da vueltas de más)
function eulerCerca(R, pista) {
  const e = new THREE.Euler().setFromRotationMatrix(R, 'ZYX');
  const cands = [[e.x, e.y, e.z], [e.x + Math.PI, Math.PI - e.y, e.z + Math.PI]];
  const cerca = (a, b) => a + 2 * Math.PI * Math.round((b - a) / (2 * Math.PI));
  let mejor = null, dmin = Infinity;
  for (const c of cands) {
    const v = c.map((a, k) => cerca(a, pista[k]));
    const d = v.reduce((s, a, k) => s + Math.abs(a - pista[k]), 0);
    if (d < dmin) { dmin = d; mejor = v; }
  }
  return mejor;
}

function resolver(W, P, g, pista = [0, 0, 0]) {
  const L = new THREE.Matrix4().copy(P).invert().multiply(W);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  L.decompose(pos, q, s);
  const R = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const piv = new THREE.Vector3(...(g.origin || [0, 0, 0])).divideScalar(16);
  const tt = pos.clone().sub(piv).add(piv.clone().applyMatrix4(R));
  const rot = (g.rotate || [0, 0, 0]).map((x) => x * D2R);
  // pose r = (giro total) - (rotate del modelo); se elige la escritura de ángulos más cercana a la pista
  const total = eulerCerca(R, pista.map((x, k) => x + rot[k]));
  const r = total.map((x, k) => x - rot[k]);
  return { t: [-tt.x * 16, tt.y * 16, tt.z * 16], r, s: [1, 1, 1], escala: s.x };
}

const redondo = (v, d = 4) => v.map((x) => { const y = +x.toFixed(d); return Object.is(y, -0) ? 0 : y; });
const limpiar = (pose) => Object.fromEntries(Object.entries(pose).map(([h, v]) => [h, { t: redondo(v.t), r: redondo(v.r, 5), s: redondo(v.s || [1, 1, 1]) }]));

/**
 * Lleva una mano de referencia (modelo de ese lado, cuerpo de referencia, pose) a otro cuerpo y lado.
 * espejo: la mano destino es el espejo de la de referencia (dedos en la otra mano: se resuelve grupo por grupo);
 * si no, solo se mueve y se gira el Anchor (los dedos quedan igual entre sí).
 */
function llevar({ datosRef, cRef, poseRef, datosDst, cDst, espejo }) {
  const ref = montar(datosRef, cRef, poseRef);
  const k = cDst.escala / cRef.escala;
  const X = new THREE.Matrix4().makeTranslation(cDst.centro.x, cDst.centro.y, cDst.centro.z)
    .multiply(new THREE.Matrix4().makeScale(espejo ? -k : k, k, k))
    .multiply(new THREE.Matrix4().makeTranslation(-cRef.centro.x, -cRef.centro.y, -cRef.centro.z));
  const dst = montar(datosDst, cDst, {});
  const pose = {};
  const orden = ordenGrupos(datosDst.grupos);
  const raices = orden.filter((n) => !datosDst.grupos[n].parent || !datosDst.grupos[datosDst.grupos[n].parent]);
  for (const n of orden) {
    const g = datosDst.grupos[n];
    const esRaiz = raices.includes(n);
    if (!espejo && !esRaiz) { pose[n] = poseRef[n] ? { t: poseRef[n].t || [0, 0, 0], r: poseRef[n].r || [0, 0, 0], s: poseRef[n].s || [1, 1, 1] } : { t: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }; dst.aplicar(pose); continue; }
    // mundo deseado: X · mundo de referencia (· espejo en el plano del pivote del grupo: el cubo es simétrico ahí)
    let W = new THREE.Matrix4().multiplyMatrices(X, ref.G[n].matrixWorld);
    if (espejo) {
      const piv = new THREE.Vector3(...(datosRef.grupos[n].origin || [0, 0, 0])).divideScalar(16);
      W.multiply(new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z).multiply(new THREE.Matrix4().makeScale(-1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z)));
    }
    cDst.mod.raiz.updateMatrixWorld(true);
    const P = (dst.G[n].parent || dst.raiz).matrixWorld;
    const p = resolver(W, P, g, (poseRef[n] && poseRef[n].r) || [0, 0, 0]);
    if (Math.abs(p.escala - 1) > 1e-3) throw new Error(`escala ${p.escala} en ${n}`);
    pose[n] = p; dst.aplicar(pose);
  }
  ref.raiz.parent.remove(ref.raiz); dst.raiz.parent.remove(dst.raiz);
  return limpiar(pose);
}

// ---------------------------------------------------------------- referencias
const formUsuario = leer('ojos/referencia/form_ejemplo_alex_bends.json').forms[0];
const poseForm = (hueso) => formUsuario.parts.find((p) => p.bone === hueso).form.pose.pose;
const sinGiroDeDedos = (pose) => Object.fromEntries(Object.entries(pose).map(([h, v]) => [h, h === 'Anchor' ? v : { ...v, r: [0, 0, 0], r2: [0, 0, 0] }]));
const transf = (v) => ({ t: v.t || [0, 0, 0], r: v.r || [0, 0, 0], s: v.s || [1, 1, 1] });
const soloT = (pose) => Object.fromEntries(Object.entries(pose).map(([h, v]) => [h, transf(v)]));

// centro del conjunto de dedos respecto del centro de la mano, en el mundo (bloques), con x hacia afuera del cuerpo
function centroDedos(datos, c, pose, transform) {
  const m = montar(datos, c, pose, transform);
  const bb = new THREE.Box3();
  Object.values(m.G).forEach((g) => g.children.filter((x) => x.isMesh).forEach((x) => { x.geometry.computeBoundingBox(); bb.union(x.geometry.boundingBox.clone().applyMatrix4(x.matrixWorld)); }));
  m.raiz.parent.remove(m.raiz);
  const v = bb.getCenter(new THREE.Vector3()).sub(c.centro).divideScalar(c.escala);
  if (c.centro.x < 0) v.x = -v.x;   // la mano izquierda está en -x
  return v;
}
// corre el Anchor para que el conjunto de dedos quede donde está el de la referencia (d: diferencia en el mundo, bloques)
function correrAnchor(pose, c, d) {
  const q = new THREE.Quaternion(); c.mod.raiz.updateMatrixWorld(true); c.nodo.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  const local = d.clone().applyQuaternion(q.invert()).multiplyScalar(16 / c.escala);   // en el marco del que cuelga, píxeles
  const a = pose.Anchor;
  a.t = [a.t[0] - local.x, a.t[1] + local.y, a.t[2] + local.z].map((x) => +x.toFixed(4));
}

const salida = { _nota: 'Generado por herramientas/ajustes_dedos.mjs (no editar a mano). Poses de BBS: t en píxeles, r en radianes.' };
for (const id of Object.keys(MODELOS_DEDOS)) {
  salida[id] = {};
  for (const cuerpoDst of CUERPOS) {
    salida[id][cuerpoDst] = {};
    for (const lado of LADOS) {
      const out = {};
      for (const ext of ['abierta', 'cerrada']) {
        let datosRef, cRef, poseRef, espejo = false;
        if (id === 'dedos') {
          datosRef = datosDe('dedos', 'L'); cRef = cuerpo('alex_bends', 'L');
          const cerr = soloT(poseForm('left_arm_item'));
          poseRef = ext === 'cerrada' ? cerr : sinGiroDeDedos(cerr);
          espejo = lado === 'R';
        } else {
          // Fingers: las poses del autor de ESE lado, en su cuerpo (Steve o Alex) y con el ítem en el centro de la mano
          datosRef = datosDe(id, lado);
          const cuerpoRef = id === 'fingers_alex' ? 'alex_bends' : 'steve_bends';
          cRef = cuerpo(cuerpoRef, lado);
          // el autor la armó sobre el pivote del ítem; el destino es el centro de la mano (en steve_bends el ítem derecho
          // está 1 px adelante del centro: así queda centrada)
          cRef.centro = new THREE.Vector3().setFromMatrixPosition(cRef.nodo.matrixWorld);
          poseRef = soloT(datosRef.poses[ext === 'abierta' ? 'Idle' : 'Fist'].pose);
        }
        const datosDst = datosDe(id, lado), cDst = cuerpo(cuerpoDst, lado);
        out[ext] = llevar({ datosRef, cRef, poseRef, datosDst, cDst, espejo });
        // Fingers: el modelo derecho del autor no es exactamente el espejo del izquierdo (en Alex está medio píxel
        // corrido y asoma del brazo): se lo corre para que quede como el espejo de la mano izquierda
        if (id !== 'dedos' && lado === 'R') {
          const cL = cuerpo(cuerpoDst, 'L'), izq = centroDedos(datosDe(id, 'L'), cL, salida[id][cuerpoDst].L[ext]);
          const der = centroDedos(datosDst, cDst, out[ext]);
          const d = izq.clone().sub(der).multiplyScalar(cDst.escala);   // (en la mano derecha, afuera = +x del mundo)
          if (d.length() > 1e-4) { correrAnchor(out[ext], cDst, d); out[ext] = limpiar(out[ext]); }
        }
      }
      out.transform = {};
      salida[id][cuerpoDst][lado] = out;
    }
  }
}
writeFileSync(RAIZ + 'mocap/datos/dedos/ajustes.json', JSON.stringify(salida));
console.log('Listo: mocap/datos/dedos/ajustes.json');
