// Simulación 3D de «Celu en movimiento»: un celular que gira y se mueve por un piso con grilla.
// Mundo: x = este, y = arriba, -z = hacia donde mira la cámara al empezar (el norte). 1 unidad = 1 metro.
import * as THREE from '../mocap/three.module.min.js';

const ALTURA0 = 1.0;   // el celular arranca a 1 metro del piso
const VISTA = [1.0, 0.3, 2.2];   // cámara inicial: de costado y un poco desde arriba (el celu avanza hacia el fondo; así se ve el movimiento)
const ESCALA = 2.2;    // el celular se dibuja más grande que de verdad (7,5 × 15 cm se ve muy chico a 2 m)

function modeloCelu() {
  const g = new THREE.Group();
  const W = 0.075, H = 0.155, D = 0.009;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshLambertMaterial({ color: 0x4a5368 })));
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, H * 0.95), new THREE.MeshBasicMaterial({ color: 0x1f5c8f }));
  pantalla.position.z = D / 2 + 0.0004; g.add(pantalla);
  const muesca = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.3, 0.006), new THREE.MeshBasicMaterial({ color: 0x0c1218 }));
  muesca.position.set(0, H * 0.43, D / 2 + 0.0007); g.add(muesca);
  // la cámara de atrás: arriba a la izquierda (vista desde atrás), para reconocer de qué lado está el celular
  const camara = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.005), new THREE.MeshLambertMaterial({ color: 0x0c1218 }));
  camara.position.set(W * 0.22, H * 0.38, -D / 2 - 0.0025); g.add(camara);
  const lente = new THREE.Mesh(new THREE.CircleGeometry(0.008, 16), new THREE.MeshBasicMaterial({ color: 0x6fb24a, side: THREE.DoubleSide }));
  lente.position.set(W * 0.22, H * 0.38, -D / 2 - 0.0056); lente.rotation.y = Math.PI; g.add(lente);
  // punta hacia arriba del celular
  const punta = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.03, 12), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  punta.position.set(0, H / 2 + 0.017, 0); g.add(punta);
  g.scale.setScalar(ESCALA);
  return g;
}

export class Escena {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x111317);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.02, 60);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.1));
    const sol = new THREE.DirectionalLight(0xffffff, 0.9); sol.position.set(2, 4, 3); this.scene.add(sol);
    const grilla = new THREE.GridHelper(8, 16, 0x4b4f57, 0x2c2f35); this.scene.add(grilla);
    // dónde queda «adelante»: una flechita en el piso
    const flecha = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 3), new THREE.MeshBasicMaterial({ color: 0x6fb24a }));
    flecha.rotation.x = -Math.PI / 2; flecha.position.set(0, 0.01, -1.6); flecha.rotation.z = Math.PI; this.scene.add(flecha);
    this.celu = new THREE.Group(); this.celu.add(modeloCelu()); this.scene.add(this.celu);
    this.celu.position.set(0, ALTURA0, 0);
    // sombra y palito al piso: ayudan a ver dónde está en el espacio
    this.sombra = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
    this.sombra.rotation.x = -Math.PI / 2; this.sombra.position.y = 0.005; this.scene.add(this.sombra);
    this.palito = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0x59606e }));
    this.scene.add(this.palito);
    // el recorrido: entero (tenue) y lo ya recorrido (brillante); son tubitos finos para que se vean bien
    this.rastroTodo = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x3a4a63 }));
    this.rastro = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x6fb24a }));
    this.rastroTodo.frustumCulled = this.rastro.frustumCulled = false;
    this.scene.add(this.rastroTodo, this.rastro);
    this.pos = []; this.tramos = 0; this.seguir = false;
    this.objetivo = new THREE.Vector3(0, ALTURA0 - 0.1, 0); this.az = VISTA[0]; this.el_ = VISTA[1]; this.dist = VISTA[2];
    this._camara(); this._arrastre();
    this.ro = new ResizeObserver(() => this.ajustar()); this.ro.observe(el);
    this.ajustar();
  }

  /** Recorrido completo [[x,y,z]…] (metros, desde el punto de partida) o [] para no mostrarlo. */
  ponerRecorrido(pos) {
    this.pos = pos; this.tramos = 0;
    this.rastroTodo.geometry.dispose(); this.rastro.geometry.dispose();
    this.rastroTodo.geometry = new THREE.BufferGeometry(); this.rastro.geometry = new THREE.BufferGeometry();
    // puntos bien separados (el tubo no soporta puntos repetidos) y no más de ~220
    const pts = [];
    for (const p of pos) { const v = new THREE.Vector3(p[0], p[1] + ALTURA0, p[2]); if (!pts.length || pts[pts.length - 1].distanceTo(v) > 0.003) pts.push(v); }
    if (pts.length >= 3) {
      const paso = Math.max(1, Math.ceil(pts.length / 220)), sel = pts.filter((_, i) => i % paso === 0 || i === pts.length - 1);
      if (sel.length >= 3) {
        const curva = new THREE.CatmullRomCurve3(sel, false, 'centripetal');
        this.tramos = sel.length * 3;
        this.rastroTodo.geometry = new THREE.TubeGeometry(curva, this.tramos, 0.01, 5, false);
        this.rastro.geometry = new THREE.TubeGeometry(curva, this.tramos, 0.014, 5, false);
        this.rastro.geometry.setDrawRange(0, 0);
      }
    }
    this.dibujar();
  }

  /** Pone el celular: q [x,y,z,w], posición [x,y,z] (metros, desde el punto de partida), n = cuántos puntos del recorrido ya pasaron. */
  poner(q, p = [0, 0, 0], n = 0) {
    this.celu.quaternion.set(q[0], q[1], q[2], q[3]);
    this.celu.position.set(p[0], p[1] + ALTURA0, p[2]);
    this.sombra.position.x = p[0]; this.sombra.position.z = p[2];
    this.palito.position.set(p[0], 0, p[2]); this.palito.scale.y = Math.max(0.001, p[1] + ALTURA0);
    if (this.tramos && this.pos.length) this.rastro.geometry.setDrawRange(0, Math.floor(Math.max(0, Math.min(1, n / this.pos.length)) * this.tramos) * 5 * 6);
    if (this.seguir) { this.objetivo.set(p[0], p[1] + ALTURA0 - 0.1, p[2]); this._camara(); }
    this.dibujar();
  }

  verDesde(az, el_, dist) { this.az = az; this.el_ = el_; this.dist = dist; this._camara(); this.dibujar(); }
  _camara() {
    this.el_ = Math.max(-1.4, Math.min(1.45, this.el_)); this.dist = Math.max(0.5, Math.min(14, this.dist));
    const c = Math.cos(this.el_);
    this.camera.position.set(this.objetivo.x + this.dist * Math.sin(this.az) * c, this.objetivo.y + this.dist * Math.sin(this.el_), this.objetivo.z + this.dist * Math.cos(this.az) * c);
    this.camera.lookAt(this.objetivo);
  }
  _arrastre() {
    const c = this.renderer.domElement; let ult = null;
    c.style.touchAction = 'none'; c.style.cursor = 'grab';
    c.addEventListener('pointerdown', (e) => { ult = [e.clientX, e.clientY]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointerup', () => { ult = null; });
    c.addEventListener('pointermove', (e) => {
      if (!ult) return;
      this.az -= (e.clientX - ult[0]) * 0.008; this.el_ += (e.clientY - ult[1]) * 0.008;
      ult = [e.clientX, e.clientY]; this._camara(); this.dibujar();
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.dist *= Math.exp(e.deltaY * 0.001); this._camara(); this.dibujar(); }, { passive: false });
    c.addEventListener('dblclick', () => this.verDesde(...VISTA));
  }
  ajustar() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dibujar();
  }
  dibujar() { this.renderer.render(this.scene, this.camera); }
}
