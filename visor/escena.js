// Visor 3D grande (girar con el mouse o el dedo) y fábrica de miniaturas.
import * as THREE from './lib/three.module.min.js';
import { OrbitControls } from './lib/OrbitControls.js';

function luces(escena) {
  escena.add(new THREE.AmbientLight(0xffffff, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(0.6, 1, 0.9); escena.add(d);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-0.8, 0.4, -0.7); escena.add(d2);
}

function caja(obj) {
  const b = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (o.isMesh && o.geometry && o.visible) {
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (isFinite(bb.min.x) && isFinite(bb.max.x)) b.union(bb);
    }
  });
  if (b.isEmpty()) b.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  return b;
}

export function encuadrar(cam, obj, controles = null) {
  const b = caja(obj);
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  const r = Math.max(0.25, s.length() / 2);
  const dist = r / Math.sin((cam.fov * Math.PI) / 360) * 1.05;
  const dir = new THREE.Vector3(0.55, 0.3, 1).normalize();
  cam.position.copy(c).addScaledVector(dir, dist);
  cam.near = dist / 100; cam.far = dist * 100; cam.updateProjectionMatrix();
  cam.lookAt(c);
  if (controles) { controles.target.copy(c); controles.update(); }
}

export function liberar(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) { if (m.map && m.map.userData && m.map.userData.propia) m.map.dispose(); m.dispose(); }
  });
}

export class Visor {
  constructor(contenedor) {
    this.cont = contenedor;
    this.render = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.render.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.render.outputColorSpace = THREE.SRGBColorSpace;
    contenedor.appendChild(this.render.domElement);
    this.escena = new THREE.Scene();
    luces(this.escena);
    this.piso = new THREE.GridHelper(8, 8, 0x667788, 0x3a4250); this.escena.add(this.piso);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    this.ctrl = new OrbitControls(this.cam, this.render.domElement);
    this.ctrl.enableDamping = true;
    this.obj = null;
    const loop = () => { requestAnimationFrame(loop); this.ajustar(); this.ctrl.update(); this.render.render(this.escena, this.cam); };
    loop();
  }
  ajustar() {
    const w = this.cont.clientWidth, h = this.cont.clientHeight;
    if (!w || !h) return;
    const c = this.render.domElement;
    if (c.width !== Math.floor(w * this.render.getPixelRatio()) || c.height !== Math.floor(h * this.render.getPixelRatio())) {
      this.render.setSize(w, h, false); c.style.width = w + 'px'; c.style.height = h + 'px';
      this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    }
  }
  mostrar(obj, reencuadrar = true) {
    if (this.obj) { this.escena.remove(this.obj); liberar(this.obj); }
    this.obj = obj;
    if (obj) { this.escena.add(obj); if (reencuadrar) { this.ajustar(); encuadrar(this.cam, obj, this.ctrl); } }
  }
  recentrar() { if (this.obj) encuadrar(this.cam, this.obj, this.ctrl); }
}

// Miniaturas: un solo renderer chico, de a una por vez
export class Miniaturas {
  constructor(tam = 160) {
    this.tam = tam;
    this.render = null;
    this.cola = [];
    this.trabajando = false;
    this.cache = new Map();
    this.generacion = 0;
  }
  _init() {
    if (this.render) return;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = this.tam;
    this.render = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.render.outputColorSpace = THREE.SRGBColorSpace;
    this.render.setSize(this.tam, this.tam, false);
    this.escena = new THREE.Scene(); luces(this.escena);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
  }
  cancelar() { this.generacion++; this.cola = []; }
  // clave: para no repetir; crear: async () => Object3D; listo: (url) => void
  pedir(clave, crear, listo) {
    if (this.cache.has(clave)) { listo(this.cache.get(clave)); return; }
    this.cola.push({ clave, crear, listo, gen: this.generacion });
    this._siguiente();
  }
  async _siguiente() {
    if (this.trabajando) return;
    const t = this.cola.shift();
    if (!t) return;
    if (t.gen !== this.generacion) { this._siguiente(); return; }
    this.trabajando = true;
    try {
      this._init();
      const obj = await t.crear();
      this.escena.add(obj);
      encuadrar(this.cam, obj);
      this.render.render(this.escena, this.cam);
      const url = await new Promise((r) => this.canvas.toBlob((b) => r(b ? URL.createObjectURL(b) : null), 'image/png'));
      this.escena.remove(obj); liberar(obj);
      this.cache.set(t.clave, url);
      t.listo(url);
    } catch (e) {
      console.warn('miniatura', t.clave, e);
      t.listo(null);
    }
    this.trabajando = false;
    setTimeout(() => this._siguiente(), 0);
  }
}
