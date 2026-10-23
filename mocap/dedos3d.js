// Dedos en la vista 3D: el modelo de dedos (player/dedos del usuario, o Fingers) armado desde su .bbs.json y colgado de
// la mano del muñeco, como lo pone BBS (una parte del form en left_arm_item / right_arm_item, o en la punta del brazo de
// emoticons). Se arma con las mismas cuentas del Visor (visor/bbs.js, que copia a BBS): cada grupo es
// T(-t.x, t.y, t.z) · pivote · Rz·Ry·Rx (rotate del modelo + r de la pose, y r2) · escala · -pivote, en bloques, y los
// cubos y mallas van en coordenadas absolutas del modelo. La parte queda en el pivote del hueso, sin giro (BBS la gira
// 180° y el modelo hijo se gira otros 180°), con el transform propio de la parte encima.
import * as THREE from './three.module.min.js';
import { MODELOS_DEDOS } from './nucleo/dedos.js';

const D2R = Math.PI / 180;
const DATOS = new URL('./datos/', import.meta.url).href;
const cache = new Map();
const v3 = (a, def = [0, 0, 0]) => (Array.isArray(a) && a.length >= 3 ? [+a[0] || 0, +a[1] || 0, +a[2] || 0] : def.slice());
const rotZYX = (rx, ry, rz) => new THREE.Matrix4().makeRotationZ(rz).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeRotationX(rx));

// poses ajustadas de cada modelo, cuerpo y mano (herramientas/ajustes_dedos.mjs)
let _ajustes = null;
const ajustes = () => (_ajustes ??= fetch(DATOS + 'dedos/ajustes.json').then((r) => r.json()).catch(() => ({})));

/** { cfg, grupos (del .bbs.json), tam, poses, ajustes, textura (url de la propia o null = la skin) } de un modelo de dedos y lado. */
export function cargarModeloDedos(id, lado) {
  const cfg = MODELOS_DEDOS[id];
  if (!cfg) return Promise.reject(new Error('No conozco ese modelo de dedos: ' + id));
  const k = id + ':' + (cfg.texturaPropia ? lado : '');
  if (!cache.has(k)) {
    const carpeta = DATOS + cfg.carpeta(lado) + '/';
    cache.set(k, Promise.all([fetch(carpeta + cfg.archivo).then((r) => r.json()), fetch(carpeta + 'poses.json').then((r) => r.json()), ajustes()])
      .then(([m, poses, aj]) => ({ cfg, grupos: m.model.groups, tam: m.model.texture || [64, 64], poses, ajustes: aj[id] || null,
        textura: cfg.texturaPropia ? carpeta + 'texture.png' : null })));
  }
  return cache.get(k);
}

/** Matriz del transform de una parte de BBS ({t (bloques), r (radianes), s, r2}). */
export function matrizTransform(t) {
  if (!t || typeof t !== 'object') return new THREE.Matrix4();
  const tr = v3(t.t), sc = v3(t.s, [1, 1, 1]), r = v3(t.r), r2 = v3(t.r2);
  const rot = rotZYX(r[0], r[1], r[2]);
  if (r2[0] || r2[1] || r2[2]) rot.multiply(rotZYX(r2[0], r2[1], r2[2]));
  return new THREE.Matrix4().makeTranslation(tr[0], tr[1], tr[2]).multiply(rot).multiply(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]));
}

// ---- geometria (como geometriaCubos / geometriaMalla del Visor) ----
function quadUV(r) {
  const pts = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
  for (let i = 0; i < (+r[4] || 0) / 90; i++) pts.unshift(pts.pop());
  return pts;
}
function geometriaCubos(cubos, tw, th) {
  const pos = [], uv = [], nor = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const c0 of cubos) {
    const c = { from: v3(c0.from), size: v3(c0.size), pivot: v3(c0.origin), rotate: v3(c0.rotate), inflate: +c0.offset || 0, uvs: c0.uvs || {} };
    const i = c.inflate;
    const x0 = (c.from[0] - i) / 16, y0 = (c.from[1] - i) / 16, z0 = (c.from[2] - i) / 16;
    const x1 = (c.from[0] + c.size[0] + i) / 16, y1 = (c.from[1] + c.size[1] + i) / 16, z1 = (c.from[2] + c.size[2] + i) / 16;
    const p = c.pivot.map((q) => q / 16);
    if (c.rotate[0] || c.rotate[1] || c.rotate[2]) m.makeTranslation(p[0], p[1], p[2]).multiply(rotZYX(c.rotate[0] * D2R, c.rotate[1] * D2R, c.rotate[2] * D2R)).multiply(new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
    else m.identity();
    nm.getNormalMatrix(m);
    const cara = (nombre, verts, orden, normal) => {
      const r = c.uvs[nombre]; if (!r) return;
      const q = quadUV(r);
      for (const k of [0, 1, 2, 0, 2, 3]) {
        v.set(...verts[k]).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        const pq = q[orden[k]]; uv.push(pq[0] / tw, 1 - pq[1] / th);
        n.set(...normal).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
      }
    };
    cara('front', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [3, 2, 1, 0], [0, 0, -1]);
    cara('right', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [3, 2, 1, 0], [1, 0, 0]);
    cara('back', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [3, 2, 1, 0], [0, 0, 1]);
    cara('left', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [3, 2, 1, 0], [-1, 0, 0]);
    cara('top', [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], [1, 0, 3, 2], [0, 1, 0]);
    cara('bottom', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [3, 2, 1, 0], [0, -1, 0]);
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}
function geometriaMalla(m0, tw, th) {
  const m = { origin: v3(m0.origin), rotate: v3(m0.rotate), pos: m0.vertices || [], uv: m0.uvs || [] };
  const n = Math.floor(m.pos.length / 3);
  if (!n || m.uv.length / 2 < n) return null;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = (m.pos[i * 3 + k] + m.origin[k]) / 16;
    uv[i * 2] = m.uv[i * 2] / tw; uv[i * 2 + 1] = 1 - m.uv[i * 2 + 1] / th;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  if (m.rotate[0] || m.rotate[1] || m.rotate[2]) {
    const p = m.origin.map((q) => q / 16);
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]).multiply(rotZYX(m.rotate[0] * D2R, m.rotate[1] * D2R, m.rotate[2] * D2R)).multiply(new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2])));
  }
  return geo;
}

export class Mano3D {
  // datos: de cargarModeloDedos; skin: la textura del muñeco (para el modelo dedos, que usa la skin);
  // transform: el de la parte en el form (en emoticons va con el ajuste del ítem)
  constructor(datos, skin, transform = null) {
    this.datos = datos;
    this.raiz = new THREE.Group(); this.raiz.matrixAutoUpdate = false; this.raiz.matrix.copy(matrizTransform(transform));
    this.mat = new THREE.MeshLambertMaterial({ color: 0xb0806a, alphaTest: 0.5, side: THREE.DoubleSide });
    if (datos.textura) new THREE.TextureLoader().load(datos.textura, (t) => this._tex(t));
    else if (skin) this._tex(skin);
    const [tw, th] = datos.tam;
    this.G = {};
    for (const [n, g] of Object.entries(datos.grupos)) {
      const o = new THREE.Group(); o.name = n; o.matrixAutoUpdate = false; this.G[n] = o;
      const gc = g.cubes && g.cubes.length ? geometriaCubos(g.cubes, tw, th) : null;
      if (gc) o.add(new THREE.Mesh(gc, this.mat));
      for (const ms of g.meshes || []) { const gm = geometriaMalla(ms, tw, th); if (gm) o.add(new THREE.Mesh(gm, this.mat)); }
    }
    for (const [n, g] of Object.entries(datos.grupos)) (g.parent && this.G[g.parent] ? this.G[g.parent] : this.raiz).add(this.G[n]);
    this.aplicar({});
  }
  _tex(t) {
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    this.mat.map = t; this.mat.color.set(0xffffff); this.mat.needsUpdate = true;
  }
  ponerSkin(t) { if (!this.datos.textura && t) this._tex(t); }
  // st: hueso -> { t (px), s, r (radianes), r2 } (lo que falta queda en reposo)
  aplicar(st) {
    for (const [n, g] of Object.entries(this.datos.grupos)) {
      const p = st[n] || {}, t = v3(p.t), piv = v3(g.origin).map((x) => x / 16);
      // como el Visor (poseRotDeg): r y r2 de la pose se combinan, y eso se suma al rotate del modelo
      let pr = v3(p.r);
      const r2 = v3(p.r2);
      if (r2[0] || r2[1] || r2[2]) { const e = new THREE.Euler().setFromRotationMatrix(rotZYX(...pr).multiply(rotZYX(...r2)), 'ZYX'); pr = [e.x, e.y, e.z]; }
      const r = v3(g.rotate).map((x, k) => x * D2R + pr[k]);
      const rot = rotZYX(r[0], r[1], r[2]);
      const sc = v3(g.scale, [1, 1, 1]).map((x, k) => x + v3(p.s, [1, 1, 1])[k] - 1);
      this.G[n].matrix.makeTranslation(-t[0] / 16, t[1] / 16, t[2] / 16)
        .multiply(new THREE.Matrix4().makeTranslation(piv[0], piv[1], piv[2])).multiply(rot)
        .multiply(new THREE.Matrix4().makeScale(Math.abs(sc[0]) < 1e-4 ? 1e-4 : sc[0], Math.abs(sc[1]) < 1e-4 ? 1e-4 : sc[1], Math.abs(sc[2]) < 1e-4 ? 1e-4 : sc[2]))
        .multiply(new THREE.Matrix4().makeTranslation(-piv[0], -piv[1], -piv[2]));
      this.G[n].matrixWorldNeedsUpdate = true;
    }
  }
}
