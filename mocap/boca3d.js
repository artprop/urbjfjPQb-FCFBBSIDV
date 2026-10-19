// Boca de BBS en la vista 3D: modelos boca_Man (2x4) y boca_Woman (1x4). Cada capa (a e i o u s s2 s3) es un
// dibujo de 8x8 de la textura (Boca.png 64x16, o BocaConejo.png 128x32) pegado adelante de la cara; se ven las
// capas visibles en ese tick, una encima de otra. Sin capas visibles = boca cerrada (se ve la skin).
import * as THREE from './three.module.min.js';
import * as BP from './nucleo/boca_pixel.js';

const PX = 1 / 16;
export const CAPAS = ['a', 'e', 'i', 'o', 'u', 's', 's2', 's3'];
// esquina de cada dibujo en la textura de 64x16 (de face.bbs.json de cada modelo)
const UV = {
  boca_Man: { a: [0, 0], e: [8, 0], i: [16, 0], o: [24, 0], u: [32, 0], s: [40, 0], s2: [48, 0], s3: [56, 0] },
  boca_Woman: { a: [0, 8], e: [8, 8], i: [16, 8], o: [24, 8], u: [32, 8], s: [40, 8], s2: [48, 8], s3: [48, 8] },
};
const BASE = new URL('.', import.meta.url).href;
const TEXTURAS = { normal: ['datos/boca/Boca.png', 1], conejo: ['datos/boca/BocaConejo.png', 2] };
const imagenes = {};
function cargar(nombre) {
  if (!imagenes[nombre]) {
    imagenes[nombre] = new Promise((ok, mal) => {
      const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(new Error('no se pudo cargar la textura de boca'));
      im.src = BASE + TEXTURAS[nombre][0];
    });
  }
  return imagenes[nombre];
}

export class Boca3D {
  constructor(cabeza) {
    this.lienzo = document.createElement('canvas');
    this.lienzo.width = 32; this.lienzo.height = 32;   // 32: alcanza para la boca de pixeles x4
    this.g = this.lienzo.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.lienzo);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: this.tex, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    this.plano = new THREE.Mesh(new THREE.PlaneGeometry(8 * PX, 8 * PX), mat);
    this.plano.rotation.y = Math.PI;   // mira hacia -Z (el frente de la persona)
    this.plano.position.set(0, 4 * PX, -4.02 * PX);
    this.plano.visible = false;
    cabeza.add(this.plano);
    this.modelo = null; this.textura = 'normal'; this.visibles = []; this.pixel = null; this.grilla = '';
    this.alCambiar = null;
  }

  // modelo: 'boca_Man' | 'boca_Woman' | null (sin boca)
  // pixel: { k, filas } si es la boca de pixeles flexibles
  usar(modelo, textura = this.textura, pixel = null) {
    this.pixel = pixel; this.grilla = '';
    if (pixel) {
      this.modelo = modelo; this.plano.visible = true;
      this.aplicarGrilla(BP.reposo(pixel));
      return;
    }
    this.modelo = UV[modelo] ? modelo : null;
    this.textura = TEXTURAS[textura] ? textura : 'normal';
    this.plano.visible = Boolean(this.modelo);
    this._pintar();
  }

  // visibles: lista de capas que se ven en este tick
  aplicar(visibles) {
    const k = visibles.join(',');
    if (k === this.visibles.join(',')) return;
    this.visibles = visibles.slice();
    this._pintar();
  }

  // grilla de la boca de pixeles (ver nucleo/boca_pixel.js)
  aplicarGrilla(g) {
    const k = g.join('');
    if (!this.pixel || k === this.grilla) return;
    this.grilla = k;
    const { k: n, filas } = this.pixel, C = BP.COLS * n, e = 32 / (8 * n), fila0 = (filas === 2 ? 6 : 7) * n;
    this.g.clearRect(0, 0, 32, 32);
    for (let r = 0; r < filas * n; r++) for (let c = 0; c < C; c++) {
      const v = g[r * C + c]; if (!v) continue;
      this.g.fillStyle = `rgb(${BP.COLORES[v].join(',')})`;
      this.g.fillRect((n + c) * e, (fila0 + r) * e, e, e);
    }
    this.tex.needsUpdate = true;
    if (this.alCambiar) this.alCambiar();
  }

  async _pintar() {
    if (!this.modelo || this.pixel) return;
    const [, esc] = TEXTURAS[this.textura];
    let im;
    try { im = await cargar(this.textura); } catch (e) { return; }
    // el lienzo es de 32x32 (cada pixel de la cara = 4x4; la textura de 64x16 se dibuja sin suavizar)
    this.g.imageSmoothingEnabled = false;
    this.g.clearRect(0, 0, 32, 32);
    for (const c of CAPAS) {
      if (!this.visibles.includes(c)) continue;
      const [u, v] = UV[this.modelo][c];
      this.g.drawImage(im, u * esc, v * esc, 8 * esc, 8 * esc, 0, 0, 32, 32);
    }
    this.tex.needsUpdate = true;
    if (this.alCambiar) this.alCambiar();
  }
}

// (tambien la boca de pixeles flexibles: boca_pixel_Man_x2, etc. Ahi se pinta la grilla de pedacitos de ese tick.)
// capas visibles en un tick: datos = { reposo: {capa: bool}, pistas: {capa: [{t, v}]} } (pasos secos)
export function capasEn(datos, tick) {
  const out = [];
  for (const c of CAPAS) {
    const kfs = datos.pistas[c];
    let v = datos.reposo[c] ?? true;
    if (kfs && kfs.length) {
      v = kfs[0].v;
      for (const k of kfs) { if (k.t <= tick) v = k.v; else break; }
    }
    if (v) out.push(c);
  }
  return out;
}

// boca de pixeles en un tick: datos = { k, filas, reposo: {hueso: [desde, largo] o null}, pistas: {hueso: [{t, v}]} }
export function grillaEn(datos, tick) {
  const pz = {};
  for (const [b, r] of Object.entries(datos.reposo)) {
    const kfs = datos.pistas[b];
    let v = r;
    if (kfs && kfs.length) { v = kfs[0].v; for (const k of kfs) { if (k.t <= tick) v = k.v; else break; } }
    pz[b] = v;
  }
  return BP.dibujar(pz, datos);
}
