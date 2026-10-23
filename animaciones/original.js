// Vista de la izquierda: la animacion tal como viene (malla semitransparente + todos sus huesos).
// Cada hueso es un punto azul que se puede tocar (para elegirlo a mano); los que se pasan a Minecraft van en verde y el
// de la parte que se está eligiendo, en amarillo.
import * as THREE from '../mocap/three.module.min.js';

const COLOR_HUESO = 0x8fb3ff, COLOR_USADO = 0x6fb24a, COLOR_ACTIVO = 0xffd23f;

// textura de un punto redondo (los Points de three.js son cuadrados)
let _circulo = null;
function circulo() {
  if (_circulo) return _circulo;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.beginPath(); g.arc(16, 16, 14, 0, 2 * Math.PI); g.fillStyle = '#fff'; g.fill();
  return (_circulo = new THREE.CanvasTexture(c));
}

export class VistaOriginal {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111317);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2));
    const sol = new THREE.DirectionalLight(0xffffff, 1); sol.position.set(2, 4, 3); this.scene.add(sol);
    this.piso = new THREE.Group(); this.scene.add(this.piso);
    this.an = null; this.mixer = null; this.mallaVisible = true;
    this.objetivo = new THREE.Vector3(0, 1, 0); this.az = 0; this.el_ = 0.12; this.dist = 4;
    this.frente0 = 0;   // angulo de la camara que mira al modelo de frente
    this.alElegir = null;   // (hueso) => {}: se tocó un hueso
    this._arrastre();
    this.ro = new ResizeObserver(() => this.ajustar()); this.ro.observe(el);
    this.ajustar();
  }

  // an: lo que devuelve cargarAnimacion() (raiz de three.js, clips, huesos encontrados)
  poner(an, clip) {
    if (this.an) { this.scene.remove(this.an.raiz); this.scene.remove(this.esqueleto); this.puntos.forEach((p) => this.scene.remove(p)); }
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.an.raiz); }
    this.an = an;
    // malla: gris semitransparente (las texturas del archivo casi nunca vienen adentro)
    this.mallas = [];
    const mat = new THREE.MeshLambertMaterial({ color: 0x9aa3b2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    an.raiz.traverse((o) => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; this.mallas.push(o); } });
    this.scene.add(an.raiz);
    // esqueleto: lineas siempre visibles (por delante de la malla)
    // (sin las puntas «…_end» que agrega Blender al exportar: no son huesos de verdad y dibujan palitos sueltos)
    const puntas = [];
    an.raiz.traverse((o) => { if (o.isBone && /_end$/i.test(o.name) && !o.children.some((h) => h.isBone)) { o.isBone = false; puntas.push(o); } });
    this.esqueleto = new THREE.SkeletonHelper(an.raiz);
    puntas.forEach((o) => (o.isBone = true));
    this.esqueleto.material = new THREE.LineBasicMaterial({ color: COLOR_HUESO, depthTest: false, transparent: true, opacity: 0.95 });
    this.esqueleto.renderOrder = 2;
    this.scene.add(this.esqueleto);
    this.nHuesos = this.esqueleto.bones.length;
    // puntos (del mismo tamaño en pantalla, esté cerca o lejos): todos los huesos, los usados y el elegido
    this.visibles = an.esqueleto.map((h) => h.obj).filter((o) => !puntas.includes(o));
    const puntos = (color, tam, orden) => {
      const p = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color, size: tam, sizeAttenuation: false, map: circulo(), alphaTest: 0.5, depthTest: false }));
      p.renderOrder = orden; p.frustumCulled = false; p.lista = []; this.scene.add(p); return p;
    };
    this.puntos = [puntos(COLOR_HUESO, 6, 3), puntos(COLOR_USADO, 9, 4), puntos(COLOR_ACTIVO, 15, 5)];
    this._lista(this.puntos[0], this.visibles); this._lista(this.puntos[2], []);
    this.activo = null;
    this.actualizarUsados();
    this.mallaVisible && this.mallas.forEach((m) => (m.visible = true));
    this.ponerClip(clip);
  }

  ponerClip(clip) {
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.an.raiz); }
    this.mixer = new THREE.AnimationMixer(this.an.raiz);
    this.clip = clip;
    this.mixer.clipAction(clip).play();
    this.encuadrar();
  }

  // camara de frente al modelo y a su tamaño (sirve igual en metros que en centimetros)
  encuadrar() {
    this.c0 = null;
    this.ir(0);
    const caja = new THREE.Box3(), v = new THREE.Vector3();
    for (const b of this.esqueleto.bones) caja.expandByPoint(b.getWorldPosition(v));
    const alto = Math.max(caja.max.y - caja.min.y, 1e-3);
    const c = caja.getCenter(new THREE.Vector3());
    this.escala = alto;
    this.objetivo.set(c.x, caja.min.y + alto * 0.5, c.z);
    this.c0 = this.objetivo.clone(); this.cad0 = this.an.huesos.hips ? this.an.huesos.hips.getWorldPosition(new THREE.Vector3()) : null;
    this.dist = alto * 2.1;
    this.camera.near = alto * 0.01; this.camera.far = alto * 100; this.camera.updateProjectionMatrix();
    // de frente: la izquierda del modelo (muslos y brazos) cruzada con "arriba"
    const H = this.an.huesos, p = (o) => o.getWorldPosition(new THREE.Vector3());
    let az = 0;
    if (H.musloL && H.musloR) {
      const izq = p(H.musloL).sub(p(H.musloR));
      if (H.brazoL && H.brazoR) izq.add(p(H.brazoL).sub(p(H.brazoR)));
      izq.y = 0;
      if (izq.lengthSq() > 1e-12) { const fr = new THREE.Vector3().crossVectors(izq.normalize(), new THREE.Vector3(0, 1, 0)); az = Math.atan2(fr.x, fr.z); }
    }
    this.frente0 = az; this.az = az; this.el_ = 0.12;
    // piso a la altura de los pies, del tamaño del modelo
    this.piso.clear();
    const g = new THREE.GridHelper(alto * 4, 16, 0x4b4f57, 0x2c2f35); g.position.set(c.x, caja.min.y, c.z); this.piso.add(g);
    this._camara(); this.ir(this.t || 0);
  }

  // los huesos que usa la conversion (despues de cambiar el mapa a mano)
  actualizarUsados() { this._lista(this.puntos[1], [...new Set(Object.values(this.an.huesos).filter(Boolean))]); this.ir(this.t || 0); }
  // el hueso de la parte que se esta eligiendo (o null)
  marcarActivo(hueso) { this.activo = hueso || null; this._lista(this.puntos[2], hueso ? [hueso] : []); this.ir(this.t || 0); }
  _lista(p, objs) {
    p.lista = objs;
    p.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, objs.length) * 3), 3));
    p.geometry.setDrawRange(0, objs.length);
  }

  verMalla(si) { this.mallaVisible = si; (this.mallas || []).forEach((m) => (m.visible = si)); this.dibujar(); }
  vistaFrente() { this.az = this.frente0; this.el_ = 0.12; this.dist = (this.escala || 1) * 2.1; this._camara(); this.dibujar(); }

  ir(t) {
    this.t = t;
    if (!this.mixer) return this.dibujar();
    this.mixer.setTime(Math.min(t, Math.max(0, this.clip.duration - 1e-4)));
    this.an.raiz.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    // la camara sigue a la cadera por el piso (si el baile avanza, no se sale de cuadro)
    const cad = this.an.huesos.hips;
    if (cad && this.c0) {
      cad.getWorldPosition(v);
      this.objetivo.x = this.c0.x + v.x - this.cad0.x; this.objetivo.z = this.c0.z + v.z - this.cad0.z;
      this._camara();
    }
    for (const p of this.puntos) {
      const pos = p.geometry.attributes.position;
      p.lista.forEach((b, i) => { b.getWorldPosition(v); pos.setXYZ(i, v.x, v.y, v.z); });
      pos.needsUpdate = true;
    }
    this.dibujar();
  }

  _camara() {
    this.el_ = Math.max(-1.4, Math.min(1.4, this.el_));
    const c = Math.cos(this.el_);
    this.camera.position.set(this.objetivo.x + this.dist * Math.sin(this.az) * c,
      this.objetivo.y + this.dist * Math.sin(this.el_), this.objetivo.z + this.dist * Math.cos(this.az) * c);
    this.camera.lookAt(this.objetivo);
  }
  _arrastre() {
    const c = this.renderer.domElement; let ult = null, ini = null;
    c.style.touchAction = 'none'; c.style.cursor = 'grab';
    c.addEventListener('pointerdown', (e) => { ult = ini = [e.clientX, e.clientY]; c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'; });
    c.addEventListener('pointerup', (e) => {
      // un toque sin arrastrar: el hueso mas cercano al dedo
      if (ini && Math.hypot(e.clientX - ini[0], e.clientY - ini[1]) < 6 && this.alElegir) { const h = this.huesoEn(e.clientX, e.clientY); if (h) this.alElegir(h); }
      ult = ini = null; c.style.cursor = 'grab';
    });
    c.addEventListener('pointermove', (e) => {
      if (!ult) return;
      this.az -= (e.clientX - ult[0]) * 0.008; this.el_ += (e.clientY - ult[1]) * 0.008;
      ult = [e.clientX, e.clientY]; this._camara(); this.dibujar();
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.dist *= Math.exp(e.deltaY * 0.001); this._camara(); this.dibujar(); }, { passive: false });
    c.addEventListener('dblclick', () => this.vistaFrente());
  }
  // el hueso que se ve más cerca de ese punto de la pantalla (a menos de 24 px), o null
  huesoEn(x, y) {
    if (!this.visibles) return null;
    const r = this.renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3();
    let mejor = null, dMin = 24;
    for (const b of this.visibles) {
      b.getWorldPosition(v).project(this.camera);
      if (v.z > 1) continue;
      const d = Math.hypot(r.left + (v.x + 1) / 2 * r.width - x, r.top + (1 - v.y) / 2 * r.height - y);
      if (d < dMin) { dMin = d; mejor = b; }
    }
    return mejor;
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
