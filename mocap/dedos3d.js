// Dedos en la vista 3D: el modelo de dedos (player/dedos del usuario, o Fingers) armado desde su .bbs.json y colgado de
// la mano del muñeco, como lo pone BBS (una parte del form en left_arm_item / right_arm_item). Se mueve con poses de BBS:
// por hueso { t (pixeles; t.x positivo = hacia la izquierda del personaje), s, r (radianes, orden ZYX) }.
import * as THREE from './three.module.min.js';
import { uvCubo } from './modelo3d.js';
import { MODELOS_DEDOS } from './nucleo/dedos.js';

const PX = 1 / 16;
const DATOS = new URL('./datos/', import.meta.url).href;
const cache = new Map();

/** { cfg, grupos (del .bbs.json), tam, poses, textura (url de la propia o null = la skin) } de un modelo de dedos y lado. */
export function cargarModeloDedos(id, lado) {
  const cfg = MODELOS_DEDOS[id];
  if (!cfg) return Promise.reject(new Error('No conozco ese modelo de dedos: ' + id));
  const k = id + ':' + (cfg.texturaPropia ? lado : '');
  if (!cache.has(k)) {
    const carpeta = DATOS + cfg.carpeta(lado) + '/';
    cache.set(k, Promise.all([fetch(carpeta + cfg.archivo).then((r) => r.json()), fetch(carpeta + 'poses.json').then((r) => r.json())])
      .then(([m, poses]) => ({ cfg, grupos: m.model.groups, tam: m.model.texture || [64, 64], poses, textura: cfg.texturaPropia ? carpeta + 'texture.png' : null })));
  }
  return cache.get(k);
}

export class Mano3D {
  // datos: de cargarModeloDedos; skin: la textura del muñeco (para el modelo dedos, que usa la skin)
  constructor(datos, skin) {
    this.datos = datos;
    this.raiz = new THREE.Group(); this.raiz.scale.setScalar(PX);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xb0806a, alphaTest: 0.5, side: THREE.DoubleSide });
    if (datos.textura) new THREE.TextureLoader().load(datos.textura, (t) => this._tex(t));
    else if (skin) this._tex(skin);
    this.G = {};
    for (const n of Object.keys(datos.grupos)) { const g = new THREE.Group(); g.rotation.order = 'ZYX'; this.G[n] = g; }
    for (const [n, g] of Object.entries(datos.grupos)) {
      const o = g.origin || [0, 0, 0];
      for (const c of g.cubes || []) {
        const s = c.size, inf = c.inflate || 0;
        const geo = new THREE.BoxGeometry(s[0] + 2 * inf, s[1] + 2 * inf, s[2] + 2 * inf);
        if (c.uvs) uvCubo(geo, c.uvs, datos.tam);
        const m = new THREE.Mesh(geo, this.mat);
        m.position.set(c.from[0] + s[0] / 2 - o[0], c.from[1] + s[1] / 2 - o[1], c.from[2] + s[2] / 2 - o[2]);
        this.G[n].add(m);
      }
      (g.parent && this.G[g.parent] ? this.G[g.parent] : this.raiz).add(this.G[n]);
    }
    this.aplicar({});
  }
  _tex(t) {
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    this.mat.map = t; this.mat.color.set(0xffffff); this.mat.needsUpdate = true;
  }
  ponerSkin(t) { if (!this.datos.textura && t) this._tex(t); }
  // st: hueso -> { t, s, r } (lo que falta queda en reposo)
  aplicar(st) {
    for (const [n, g] of Object.entries(this.datos.grupos)) {
      const v = st[n] || {}, t = v.t || [0, 0, 0], s = v.s || [1, 1, 1], r = v.r || [0, 0, 0];
      const o = g.origin || [0, 0, 0], po = g.parent && this.datos.grupos[g.parent] ? this.datos.grupos[g.parent].origin || [0, 0, 0] : [0, 0, 0];
      this.G[n].position.set(o[0] - po[0] - t[0], o[1] - po[1] + t[1], o[2] - po[2] + t[2]);
      this.G[n].rotation.set(r[0], r[1], r[2], 'ZYX');
      this.G[n].scale.set(Math.max(s[0], 1e-4), Math.max(s[1], 1e-4), Math.max(s[2], 1e-4));
    }
  }
}
