// Dedos en vivo (modo «Dedos» del Mocap): las manos de Minecraft con la palma mirando a la cámara y los dedos hacia
// arriba, en una escena 3D chica. Sirven de REFERENCIA (dónde poner la mano) y de SIMULACIÓN en tiempo real: cada dedo va de
// la pose «abierta» a la «cerrada» según cuánto lo cerrás frente a la cámara.
// Una sola escena (un solo contexto WebGL, fuera de la pantalla) se copia a dos lienzos 2D: la capa transparente que va encima
// de la cámara y el panel de al lado (PC) o de abajo (celu). Los dos se espejan por CSS, como el video de la cámara, así que
// la mano derecha queda a la derecha de la pantalla (como en un espejo).
import * as THREE from './three.module.min.js';
import { Mano3D, cargarModeloDedos } from './dedos3d.js';
import { poseMezcla, posesMano, modeloDedosPara } from './nucleo/dedos.js';

const PX = 1 / 16;
const COLOR_PIEL = 0xb0806a;
const FOV = 30, DIST = 7;
const ALTO_VISIBLE = 2 * DIST * Math.tan((FOV * Math.PI) / 360);   // alto de lo que se ve a esa distancia
const LARGO_BRAZO = 2.5;   // píxeles de antebrazo que se dibujan debajo de los dedos

export class DedosVivo {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(1); this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.35));
    const sol = new THREE.DirectionalLight(0xffffff, 0.8); sol.position.set(1.5, 2, 4); this.scene.add(sol);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60); this.camera.position.set(0, 0, DIST); this.camera.lookAt(0, 0, 0);
    this.manos = {};              // 'L' / 'R' -> { mano, cfg, abierta, cerrada, ext (grupo exterior), caja, materiales }
    this.curls = { L: null, R: null };
    this.lienzos = { overlay: null, panel: null };
    this.skin = null; this.cfgActual = null; this.listo = false;
  }

  /** Lienzos 2D donde se copia lo dibujado: overlay (encima de la cámara, transparente) y panel (con fondo). */
  conectar({ overlay = null, panel = null } = {}) { this.lienzos = { overlay, panel }; }
  /** La skin con la que se pintan los dedos (la del modelo «dedos» usa la skin del personaje). */
  async ponerSkin(url) {
    try {
      this.skin = await new Promise((ok, mal) => new THREE.TextureLoader().load(url, ok, undefined, mal));
      // el color del antebrazo sale de la piel (un pixel de la cara del brazo)
      try {
        const im = this.skin.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const k = im.width / 64, [r, gg, b] = g.getImageData(Math.floor(46 * k), Math.floor(26 * k), 1, 1).data;
        this.colorSkin = (r << 16) | (gg << 8) | b;
      } catch { this.colorSkin = null; }
      for (const h of Object.values(this.manos)) { h.mano.ponerSkin(this.skin); if (h.id === 'dedos' && this.colorSkin != null) h.matBrazo.color.setHex(this.colorSkin); }
      this.dibujar();
    } catch { /* se queda el color liso */ }
  }

  /**
   * Arma las manos. sel: 'dedos' o 'fingers'; cuerpo: el modelo del actor (para Steve o Alex y las poses ajustadas);
   * manos: 'ambas' | 'izq' | 'der'; elegidas: { LA, LC, RA, RC } (nombres de pose, '' = la ajustada).
   */
  async configurar({ sel = 'dedos', cuerpo = 'player/steve_bends', manos = 'ambas', elegidas = {} } = {}) {
    // la referencia usa siempre el marco del brazo colgando de steve/alex (las poses ajustadas de emoticons están en otro marco)
    const cuerpoGuia = /alex/i.test(cuerpo) ? 'player/alex_bends' : 'player/steve_bends';
    const id = modeloDedosPara(sel, cuerpoGuia);
    const lados = manos === 'izq' ? ['L'] : manos === 'der' ? ['R'] : ['R', 'L'];
    for (const h of Object.values(this.manos)) this.scene.remove(h.ext);
    this.manos = {};
    for (const lado of lados) this.manos[lado] = await this._armarMano(lado, id, cuerpoGuia, elegidas);
    this.cfgActual = { sel, cuerpo, manos };
    this.listo = true;
    this.dibujar();
  }

  async _armarMano(lado, id, cuerpo, elegidas) {
    const datos = await cargarModeloDedos(id, lado);
    const p = posesMano(datos, cuerpo, lado, elegidas[lado + 'A'] || '', elegidas[lado + 'C'] || '');
    const mano = new Mano3D(datos, this.skin);
    const estado = (pose) => Object.fromEntries(Object.entries(pose || {}).map(([h, v]) => [h, { t: v.t || [0, 0, 0], s: v.s || [1, 1, 1], r: v.r || [0, 0, 0], r2: v.r2 }]));
    // orientación: en el marco del brazo colgando, los dedos apuntan hacia abajo (-y) y al cerrarse se mueven hacia el lado de
    // la palma (d). Se gira todo para que los dedos apunten hacia arriba y la palma mire a la cámara (+z).
    const centro = (pose) => { mano.aplicar(estado(pose)); mano.raiz.updateMatrixWorld(true); return new THREE.Box3().setFromObject(mano.raiz).getCenter(new THREE.Vector3()); };
    const cAb = centro(p.abierta), cCe = centro(p.cerrada);
    const f = new THREE.Vector3(0, -1, 0);
    let d = cCe.clone().sub(cAb); d.addScaledVector(f, -d.dot(f));
    if (d.lengthSq() < 1e-8) d.set(lado === 'L' ? 1 : -1, 0, 0);   // (sin diferencia: la palma mira hacia adentro del cuerpo)
    d.normalize();
    const x = new THREE.Vector3().crossVectors(f, d).normalize();
    const giro = new THREE.Matrix4().set(x.x, x.y, x.z, 0, f.x, f.y, f.z, 0, d.x, d.y, d.z, 0, 0, 0, 0, 1);   // v -> (v·x, v·f, v·d)
    mano.aplicar(estado(p.abierta));
    const interior = new THREE.Group(); interior.matrixAutoUpdate = false; interior.matrix.copy(giro);
    interior.add(mano.raiz);
    // el antebrazo: un bloque de piel debajo de los dedos (en el marco ya girado, los dedos van hacia arriba)
    const matBrazo = new THREE.MeshLambertMaterial({ color: id === 'dedos' ? (this.colorSkin ?? COLOR_PIEL) : /alex/i.test(id) ? 0xefdabf : 0xaa7d66 });
    const ext = new THREE.Group(); ext.matrixAutoUpdate = false;
    ext.add(interior);
    ext.updateMatrixWorld(true);
    const cajaDedos = new THREE.Box3().setFromObject(interior);
    const ancho = Math.max(4 * PX, cajaDedos.max.x - cajaDedos.min.x + 0.5 * PX), prof = 4 * PX;
    const brazo = new THREE.Mesh(new THREE.BoxGeometry(ancho, LARGO_BRAZO * PX, prof), matBrazo);
    brazo.position.set((cajaDedos.min.x + cajaDedos.max.x) / 2, -LARGO_BRAZO * PX / 2 - 0.001, (cajaDedos.min.z + cajaDedos.max.z) / 2);
    ext.add(brazo);
    ext.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(ext), c = caja.getCenter(new THREE.Vector3());
    const alto = caja.max.y - caja.min.y;
    this.scene.add(ext);
    return { lado, id, mano, cfg: datos.cfg, abierta: p.abierta, cerrada: p.cerrada, ext, centro: c, alto, matBrazo, ancho: caja.max.x - caja.min.x };
  }

  /** curls: { L: [5] | null, R: [5] | null } (0 = estirado, 1 = cerrado); null = no se ve esa mano. */
  poner(curls) { this.curls = { ...this.curls, ...curls }; this.dibujar(); }

  // posiciona las manos para un lienzo de cierta proporción
  _acomodar(aspecto) {
    const lados = Object.keys(this.manos);
    const ancho = ALTO_VISIBLE * aspecto;
    for (const lado of lados) {
      const h = this.manos[lado];
      // la mano mide un poco más de la mitad del alto, y no más que lo que entra a lo ancho
      const esc = Math.min(0.6 * ALTO_VISIBLE / h.alto, (lados.length === 2 ? 0.34 : 0.6) * ancho / h.ancho);
      // en la imagen (sin espejar) la mano DERECHA de la persona está a la izquierda
      const x = lados.length === 1 ? 0 : (lado === 'R' ? -0.25 : 0.25) * ancho;
      h.ext.matrix.makeTranslation(x, 0, 0).multiply(new THREE.Matrix4().makeScale(esc, esc, esc)).multiply(new THREE.Matrix4().makeTranslation(-h.centro.x, -h.centro.y, -h.centro.z));
      h.ext.matrixWorldNeedsUpdate = true;
    }
  }

  dibujar() {
    if (!this.listo) return;
    for (const [lado, h] of Object.entries(this.manos)) {
      const c = this.curls[lado], ve = !!c;
      h.mano.aplicar(poseMezcla(h.cfg, h.abierta, h.cerrada, c || [0, 0, 0, 0, 0]));
      // si no se ve la mano, queda la referencia más tenue
      const op = ve ? 1 : 0.6;
      h.mano.mat.transparent = h.matBrazo.transparent = op < 1; h.mano.mat.opacity = h.matBrazo.opacity = op;
    }
    const r = this.renderer;
    for (const [nombre, lienzo] of Object.entries(this.lienzos)) {
      if (!lienzo || !lienzo.width || !lienzo.height) continue;
      const w = lienzo.width, hh = lienzo.height;
      if (r.domElement.width < w || r.domElement.height < hh) r.setSize(Math.max(w, r.domElement.width), Math.max(hh, r.domElement.height), false);
      this.camera.aspect = w / hh; this.camera.updateProjectionMatrix();
      this._acomodar(w / hh);
      r.setScissorTest(true); r.setViewport(0, 0, w, hh); r.setScissor(0, 0, w, hh);
      r.setClearColor(nombre === 'panel' ? 0x111317 : 0x000000, nombre === 'panel' ? 1 : 0);
      r.clear(); r.render(this.scene, this.camera);
      const g = lienzo.getContext('2d');
      g.clearRect(0, 0, w, hh);
      g.drawImage(r.domElement, 0, r.domElement.height - hh, w, hh, 0, 0, w, hh);
    }
  }
}
