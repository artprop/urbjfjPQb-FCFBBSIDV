// Las dos vistas 3D (el modelo original y el de cubos). Comparten la cámara: girar una gira la otra.
import * as THREE from '../mocap/three.module.min.js';

const camara = { az: Math.PI, el: 0.15, dist: 3, objetivo: new THREE.Vector3(0, 1, 0) };
const todas = [];
const avisar = () => todas.forEach((v) => v.dibujar());

export class Vista {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    el.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x111317);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555560, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.1); sol.position.set(-2, 4, -3); this.scene.add(sol);
    const grilla = new THREE.GridHelper(4, 64, 0x353941, 0x24272d); this.scene.add(grilla);
    // el frente (-Z, «north» en Blockbench): una flechita en el piso
    const flecha = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 3), new THREE.MeshBasicMaterial({ color: 0x6fb24a }));
    flecha.rotation.x = -Math.PI / 2; flecha.position.set(0, 0.005, -0.75); this.scene.add(flecha);
    this.contenido = new THREE.Group(); this.scene.add(this.contenido); this.alto = 2;
    this._arrastre();
    new ResizeObserver(() => this.ajustar()).observe(el);
    todas.push(this);
    this.ajustar();
  }
  poner(obj) {
    this.contenido.clear();
    if (obj) this.contenido.add(obj);
    this.dibujar();
  }
  /** Encuadra un modelo de cierto alto (en bloques) de frente. */
  static encuadrar(alto) {
    todas.forEach((v) => (v.alto = alto));
    camara.objetivo.set(0, alto * 0.5, 0); camara.dist = alto * 2.3 + 0.5; camara.az = Math.PI; camara.el = 0.15; avisar();
  }
  _arrastre() {
    const c = this.renderer.domElement, toques = new Map(); let distPrev = 0;
    let mover = false;   // botón derecho o Shift: correr la vista en vez de girarla
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => { toques.set(e.pointerId, [e.clientX, e.clientY]); c.setPointerCapture(e.pointerId); mover = e.button === 2 || e.shiftKey; });
    const fin = (e) => { toques.delete(e.pointerId); distPrev = 0; this._medio = null; };
    c.addEventListener('pointerup', fin); c.addEventListener('pointercancel', fin);
    c.addEventListener('pointermove', (e) => {
      const ult = toques.get(e.pointerId); if (!ult) return;
      if (toques.size === 1 && mover) {
        const k = camara.dist * 0.0016, dx = (e.clientX - ult[0]) * k, dy = (e.clientY - ult[1]) * k;
        const der = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), arr = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        camara.objetivo.addScaledVector(der, -dx).addScaledVector(arr, dy);
      } else if (toques.size === 1) {
        camara.az -= (e.clientX - ult[0]) * 0.008; camara.el = Math.max(-1.4, Math.min(1.4, camara.el + (e.clientY - ult[1]) * 0.008));
      }
      toques.set(e.pointerId, [e.clientX, e.clientY]);
      if (toques.size === 2) {
        const [a, b] = [...toques.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (distPrev) camara.dist = Math.max(0.3, Math.min(40, camara.dist * distPrev / d));
        // dos dedos que se mueven juntos: correr la vista
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (this._medio && distPrev) {
          const k = camara.dist * 0.0016, der = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), arr = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
          camara.objetivo.addScaledVector(der, -(m[0] - this._medio[0]) * k).addScaledVector(arr, (m[1] - this._medio[1]) * k);
        }
        this._medio = m; distPrev = d;
      }
      avisar();
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); camara.dist = Math.max(0.3, Math.min(40, camara.dist * Math.exp(e.deltaY * 0.001))); avisar(); }, { passive: false });
    c.addEventListener('dblclick', () => { camara.az = Math.PI; camara.el = 0.15; camara.objetivo.set(0, this.alto * 0.5, 0); camara.dist = this.alto * 2.3 + 0.5; avisar(); });
  }
  ajustar() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dibujar();
  }
  dibujar() {
    const o = camara.objetivo, ce = Math.cos(camara.el);
    // de frente = mirando desde -Z (Blockbench: el frente del modelo es «north», -Z)
    this.camera.position.set(o.x + camara.dist * Math.sin(camara.az) * ce, o.y + camara.dist * Math.sin(camara.el), o.z + camara.dist * Math.cos(camara.az) * ce);
    this.camera.lookAt(o);
    this.renderer.render(this.scene, this.camera);
  }
}
