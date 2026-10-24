// Dibuja un modelo de cubos de BBS (model.bbs.json, o un .geo.json pasado con geoABBS) con su textura: grupos anidados que giran
// sobre su pivote, cubos (con su propio giro e inflado) y UV por cara o en caja. Las mismas cuentas del Visor (visor/bbs.js), con la
// orientación de cada cara de CARAS_L. Unidades: 16 píxeles = 1 bloque.
import * as THREE from '../mocap/three.module.min.js';
import { CARAS_L } from './nucleo/giradas.js';
import { uvCaja } from './nucleo/geo.js';

const D2R = Math.PI / 180;
const NOMBRE = { north: 'front', south: 'back', east: 'right', west: 'left', up: 'top', down: 'bottom' };
const rotZYX = (r) => new THREE.Matrix4().makeRotationZ(r[2] * D2R).multiply(new THREE.Matrix4().makeRotationY(r[1] * D2R)).multiply(new THREE.Matrix4().makeRotationX(r[0] * D2R));
const sobre = (p, M) => new THREE.Matrix4().makeTranslation(p[0] / 16, p[1] / 16, p[2] / 16).multiply(M).multiply(new THREE.Matrix4().makeTranslation(-p[0] / 16, -p[1] / 16, -p[2] / 16));

function geometria(cubos, tw, th) {
  const pos = [], uv = [], ind = [], v = new THREE.Vector3();
  for (const c of cubos) {
    const i = +c.offset || 0, size = c.size || [0, 0, 0], from = c.from || [0, 0, 0];
    const h = size.map((s) => s / 2 + i), centro = from.map((f, k) => f + size[k] / 2);
    const uvs = c.box_uv && (!c.uvs || !Object.keys(c.uvs).length) ? uvCaja(size, c.box_uv_offset || [0, 0], !!c.box_uv_mirror) : c.uvs || {};
    const r = c.rotate || [0, 0, 0], M = r[0] || r[1] || r[2] ? sobre(c.origin || [0, 0, 0], rotZYX(r)) : null;
    for (const [lado, f] of Object.entries(CARAS_L)) {
      const q = uvs[NOMBRE[lado]]; if (!q) continue;
      const esq = f.esq(h), w = 2 * h[f.ej[0]], hh = 2 * h[f.ej[1]];
      const pts = [esq, esq.map((x, a) => x + f.U[a] * w), esq.map((x, a) => x + f.U[a] * w + f.V[a] * hh), esq.map((x, a) => x + f.V[a] * hh)];
      const base = pos.length / 3;
      for (const p of pts) { v.set((centro[0] + p[0]) / 16, (centro[1] + p[1]) / 16, (centro[2] + p[2]) / 16); if (M) v.applyMatrix4(M); pos.push(v.x, v.y, v.z); }
      const [u0, v0, u1, v1] = q;
      uv.push(u0 / tw, 1 - v0 / th, u1 / tw, 1 - v0 / th, u1 / tw, 1 - v1 / th, u0 / tw, 1 - v1 / th);
      const cr = [f.U[1] * f.V[2] - f.U[2] * f.V[1], f.U[2] * f.V[0] - f.U[0] * f.V[2], f.U[0] * f.V[1] - f.U[1] * f.V[0]];
      if (cr[0] * f.n[0] + cr[1] * f.n[1] + cr[2] * f.n[2] > 0) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(ind);
  geo.computeVertexNormals();
  return geo;
}

/** bbs: { model: { groups, texture } }; lienzo: canvas/imagen de la textura (o null = gris). Devuelve { obj, cubos, alto (bloques) }. */
export function mallaBBS(bbs, lienzo) {
  const m = bbs.model || bbs, [tw, th] = m.texture || [64, 64];
  const mat = new THREE.MeshLambertMaterial({ color: lienzo ? 0xffffff : 0x9aa3b2, alphaTest: 0.1, side: THREE.DoubleSide });
  if (lienzo) { const t = new THREE.CanvasTexture(lienzo); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; mat.map = t; }
  const raiz = new THREE.Group(), nodos = {};
  let cubos = 0;
  for (const [id, g] of Object.entries(m.groups || {})) {
    const o = new THREE.Group(); o.name = id; o.matrixAutoUpdate = false;
    o.matrix.copy(sobre(g.origin || [0, 0, 0], rotZYX(g.rotate || [0, 0, 0])));
    const geo = geometria(g.cubes || [], tw, th); if (geo) o.add(new THREE.Mesh(geo, mat));
    cubos += (g.cubes || []).length;
    nodos[id] = o;
  }
  for (const [id, g] of Object.entries(m.groups || {})) (g.parent && nodos[g.parent] ? nodos[g.parent] : raiz).add(nodos[id]);
  raiz.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(raiz);
  return { obj: raiz, cubos, alto: Math.max(0.5, caja.max.y - Math.min(0, caja.min.y)), caja };
}
