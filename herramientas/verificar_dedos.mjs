// Verifica mocap/datos/dedos/ajustes.json: dónde cae cada dedo respecto del centro de la cara de abajo de la mano, en
// píxeles (x = hacia AFUERA del cuerpo, z = hacia ADELANTE, y = hacia abajo de la mano). La mano derecha tiene que dar
// igual que la izquierda (espejo) y cada cuerpo igual que los otros. Uso: node herramientas/verificar_dedos.mjs
import * as THREE from '../mocap/three.module.min.js';
import { crearModelo } from '../mocap/modelo3d.js';
import { MODELOS } from '../mocap/modelo_datos.js';
import { EMOTICONS } from '../mocap/modelo_emoticons.js';
import { Mano3D } from '../mocap/dedos3d.js';
import { MODELOS_DEDOS } from '../mocap/nucleo/dedos.js';
import { readFileSync } from 'node:fs';
const RAIZ = new URL('../', import.meta.url).pathname;
const leer = (p) => JSON.parse(readFileSync(RAIZ + p, 'utf8'));
const A = leer('mocap/datos/dedos/ajustes.json');
const nl = (l) => (l === 'L' ? 'left' : 'right');
function marco(nombre, lado) {
  const emot = nombre.startsWith('emoticons');
  const mod = crearModelo(emot ? 'emoticons_steve' : nombre); mod.raiz.updateMatrixWorld(true);
  if (!emot) { const c = MODELOS[nombre].grupos[`${nl(lado)}_elbow`].c[0]; return { mod, nodo: mod.todos[`${nl(lado)}_arm_item`], centro: new THREE.Vector3(c.from[0] + c.size[0] / 2, c.from[1], c.from[2] + c.size[2] / 2).divideScalar(16), k: 1 }; }
  const h = EMOTICONS.huesos.find((x) => x.n === `low_${nl(lado)}_arm.end`); const cola = new THREE.Vector3(...h.cola);
  if (nombre === 'emoticons_alex') cola.x += (lado === 'L' ? -1 : 1) * 0.03125;
  return { mod, nodo: mod.huesos[`low_${nl(lado)}_arm.end`], centro: cola.applyMatrix4(mod.raiz.matrixWorld), k: EMOTICONS.escala };
}
export function cajas(id, cuerpo, lado, ext) {
  const cfg = MODELOS_DEDOS[id], carpeta = 'mocap/datos/' + cfg.carpeta(lado) + '/';
  const m = leer(carpeta + cfg.archivo);
  const datos = { cfg, grupos: m.model.groups, tam: m.model.texture || [64, 64], textura: null };
  const c = marco(cuerpo, lado), mano = new Mano3D(datos, null, A[id][cuerpo][lado].transform);
  c.nodo.add(mano.raiz); mano.aplicar(A[id][cuerpo][lado][ext]); c.mod.raiz.updateMatrixWorld(true);
  const afuera = c.centro.x < 0 ? -1 : 1;   // (en la vista, la mano izquierda está en -x)
  const out = {};
  for (const [n, g] of Object.entries(mano.G)) {
    const bb = new THREE.Box3();
    g.children.filter((x) => x.isMesh).forEach((x) => { x.geometry.computeBoundingBox(); bb.union(x.geometry.boundingBox.clone().applyMatrix4(x.matrixWorld)); });
    if (bb.isEmpty()) continue;
    const f = (v) => [(v.x - c.centro.x) * afuera, (c.centro.y - v.y), -(v.z - c.centro.z)].map((q) => q * 16 / c.k);
    const a = f(bb.min), b = f(bb.max);
    out[n] = [0, 1, 2].map((i) => [Math.min(a[i], b[i]), Math.max(a[i], b[i])].map((q) => +q.toFixed(2)));
  }
  return out;
}
const igual = (a, b) => Object.keys(a).every((n) => b[n] && a[n].every((r, i) => Math.abs(r[0] - b[n][i][0]) < 0.02 && Math.abs(r[1] - b[n][i][1]) < 0.02));
let fallas = 0;
for (const id of Object.keys(MODELOS_DEDOS)) for (const ext of ['abierta', 'cerrada']) {
  const ref = cajas(id, id === 'fingers_alex' ? 'alex_bends' : 'steve_bends', 'L', ext);
  for (const cuerpo of ['steve_bends', 'alex_bends', 'emoticons_steve', 'emoticons_alex']) for (const lado of ['L', 'R']) {
    const c = cajas(id, cuerpo, lado, ext);
    const ok = igual(ref, c); if (!ok) fallas++;
    if (!ok || process.argv[2] === 'todo') {
      console.log(`${ok ? '✔' : '✖'} ${id} ${cuerpo} ${lado} ${ext}`);
      for (const [n, v] of Object.entries(c)) console.log(`     ${n.padEnd(8)} afuera ${v[0][0]}..${v[0][1]}  abajo ${v[1][0]}..${v[1][1]}  adelante ${v[2][0]}..${v[2][1]}`);
    }
  }
}
console.log(fallas ? `${fallas} combinaciones distintas de la referencia` : 'Todas las combinaciones dejan los dedos igual que la referencia (izq = der espejada, en todos los cuerpos).');
