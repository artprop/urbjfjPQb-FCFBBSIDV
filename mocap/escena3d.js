// Vista previa 3D: un Steve de bloques que repite las rotaciones del film de BBS.
// Ejes de BBS = ejes de three.js (X derecha del personaje, Y arriba, Z espalda) y R = Rz*Ry*Rx = Euler 'ZYX',
// asi que los angulos del .dat se usan tal cual. Unidades: 1 bloque = 16 pixeles del modelo.
import * as THREE from './three.module.min.js';
import { Ojos3D } from './ojos3d.js';
import { Boca3D, capasEn, grillaEn } from './boca3d.js';
import { crearModelo } from './modelo3d.js';

const TICKS_POR_S = 20;
const SKIN_DEFECTO = './skin_default.png';

// interpolacion entre keyframes (como BBS): cada keyframe manda en el tramo que empieza en el
const CURVAS = {
  constant: () => 0,
  linear: (u) => u,
  sine_in: (u) => 1 - Math.cos((u * Math.PI) / 2),
  sine_out: (u) => Math.sin((u * Math.PI) / 2),
  sine_inout: (u) => 0.5 - 0.5 * Math.cos(u * Math.PI),
  hermite: (u) => u * u * (3 - 2 * u),
};
export function muestrear(kfs, tick, out) {
  const n = kfs.length;
  if (tick <= kfs[0].t) return out.set(...kfs[0].r);
  if (tick >= kfs[n - 1].t) return out.set(...kfs[n - 1].r);
  let i = 0;
  while (i < n - 2 && kfs[i + 1].t <= tick) i++;
  const a = kfs[i], b = kfs[i + 1];
  const u = (tick - a.t) / (b.t - a.t);
  const k = (CURVAS[a.i] || CURVAS.linear)(u);
  return out.set(a.r[0] + (b.r[0] - a.r[0]) * k, a.r[1] + (b.r[1] - a.r[1]) * k, a.r[2] + (b.r[2] - a.r[2]) * k);
}

function muestrearArr(kfs, tick, campo) {
  const n = kfs.length;
  if (tick <= kfs[0].t) return kfs[0][campo];
  if (tick >= kfs[n - 1].t) return kfs[n - 1][campo];
  let i = 0;
  while (i < n - 2 && kfs[i + 1].t <= tick) i++;
  const a = kfs[i], b = kfs[i + 1];
  const k = (CURVAS[a.i] || CURVAS.linear)((tick - a.t) / (b.t - a.t));
  return a[campo].map((v, j) => v + (b[campo][j] - v) * k);
}

export class Escena {
  constructor(contenedor) {
    this.el = contenedor;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111317);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sol = new THREE.DirectionalLight(0xffffff, 1.1); sol.position.set(-2, 4, -3); this.scene.add(sol);
    // piso: grilla transparente (solo lineas), como en BBS; cada cuadro = 1 bloque
    const grilla = new THREE.GridHelper(8, 8, 0x4b4f57, 0x2c2f35); grilla.position.y = 0.002; this.scene.add(grilla);
    const fina = new THREE.GridHelper(8, 32, 0x23262b, 0x23262b); fina.position.y = 0.001; this.scene.add(fina);
    this._gizmo();
    this.anim = null; this.tmp = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.caraDatos = null; this.modoOjos = 'auto'; this.tick = 0; this.poseFija = null;
    this.skinTex = null; this.ojosPos = [0, 0]; this.ejesVisibles = false; this.nombreModelo = null;
    this.ponerModelo('steve_bends');
    this.ponerSkin(SKIN_DEFECTO).catch(() => {});
    // camara orbital
    this.objetivo = new THREE.Vector3(0, 1, 0);
    this.az = Math.PI; this.el_ = 0.12; this.dist = 4.4;
    this.vista('frente');
    this._arrastre();
    this.corriendo = false;
    this.ro = new ResizeObserver(() => this.ajustar());
    this.ro.observe(this.el);
    this.ajustar();
    this.listo = true;
    this.dibujar();
  }
  // cambia el modelo del muñeco ('steve_bends' o 'alex_bends'): se arma de nuevo, con la misma skin, ojos y animacion
  ponerModelo(nombre) {
    if (nombre === this.nombreModelo) return;
    if (this.modelo) { this.scene.remove(this.modelo.raiz); }   // (el modelo viejo se descarta)
    this.nombreModelo = nombre;
    this.modelo = crearModelo(nombre);
    this.huesos = this.modelo.huesos;
    this.scene.add(this.modelo.raiz);
    this.ejes = [];
    for (const g of Object.values(this.huesos)) { const a = new THREE.AxesHelper(0.35); a.visible = this.ejesVisibles; g.add(a); this.ejes.push(a); }
    // emoticons/steve: los ojos de BBS (parte eyes) todavia no se dibujan en la vista previa
    this.ojos = this.huesos.pielCabeza ? new Ojos3D(this.huesos.head, this.huesos.pielCabeza)
      : { modelo: null, partes: {}, usar() {}, aplicar() {}, ponerTextura() {}, mover() {} };
    if (this.skinTex) { this.modelo.ponerTextura(this.skinTex); this.ojos.ponerTextura(this.skinTex); }
    this.ojos.mover(...this.ojosPos);
    this._elegirOjos();
    this.boca = this.huesos.pielCabeza ? new Boca3D(this.huesos.head) : { usar() {}, aplicar() {}, aplicarGrilla() {} };
    this.boca.alCambiar = () => this.dibujar();
    this._elegirBoca();
    if (this.listo) this.ir(this.tick || 0);
  }
  vista(nombre) {
    // la persona mira hacia -Z: "frente" es mirarla desde -Z
    this.az = { frente: Math.PI, lado: Math.PI / 2, atras: 0, tres_cuartos: Math.PI * 0.8, cara: Math.PI }[nombre] ?? Math.PI;
    const cara = nombre === 'cara';   // primer plano de la cabeza (para revisar los ojos)
    this.objetivo.set(0, cara ? 1.73 : 1, 0);
    this.el_ = cara ? 0.04 : 0.12; this.dist = cara ? 1.05 : 4.4; this._camara(); this.dibujar();
  }
  _camara() {
    this.el_ = Math.max(-1.4, Math.min(1.4, this.el_));
    this.dist = Math.max(0.35, Math.min(12, this.dist));
    const c = Math.cos(this.el_);
    this.camera.position.set(this.objetivo.x + this.dist * Math.sin(this.az) * c,
      this.objetivo.y + this.dist * Math.sin(this.el_), this.objetivo.z + this.dist * Math.cos(this.az) * c);
    this.camera.lookAt(this.objetivo);
  }
  _arrastre() {
    const c = this.renderer.domElement; let ult = null;
    c.style.touchAction = 'none'; c.style.cursor = 'grab';
    c.addEventListener('pointerdown', (e) => { ult = [e.clientX, e.clientY]; c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'; });
    c.addEventListener('pointerup', () => { ult = null; c.style.cursor = 'grab'; });
    c.addEventListener('pointermove', (e) => {
      if (!ult) return;
      this.az -= (e.clientX - ult[0]) * 0.008; this.el_ += (e.clientY - ult[1]) * 0.008;
      ult = [e.clientX, e.clientY]; this._camara(); this.dibujar();
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.dist *= Math.exp(e.deltaY * 0.001); this._camara(); this.dibujar(); }, { passive: false });
    c.addEventListener('dblclick', () => this.vista('frente'));
  }
  ajustar() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dibujar();
  }
  // cara: { modelo, reposo, pistas } de /api/animacion, o null si el film no tiene parte de ojos.
  // modoOjos: 'auto' (el modelo del film; sin parte de ojos se dibujan dos cuadritos), 'eyes', 'eyes_1px' o 'ninguno'.
  ponerAnimacion(huesos, cara = null, modoOjos = this.modoOjos) {
    this.anim = huesos; this.caraDatos = cara; this.modoOjos = modoOjos;
    this._elegirOjos();
    this.ir(this.tick || 0);
  }
  // skin: url o dataURL de un PNG de 64x64. Devuelve una promesa (rechaza si no es una imagen valida de 64x64).
  ponerSkin(url) {
    return new Promise((ok, mal) => new THREE.TextureLoader().load(url, (tex) => {
      const im = tex.image;
      if (im.width !== 64 || im.height !== 64) { tex.dispose(); return mal(new Error(`La skin tiene que ser de 64×64 píxeles (esta es de ${im.width}×${im.height}).`)); }
      this.skinTex = tex; this.modelo.ponerTextura(tex); this.ojos.ponerTextura(tex); this.dibujar(); ok(tex);
    }, undefined, () => mal(new Error('No se pudo leer la skin.'))));
  }
  // pose fija de la biblioteca ({hueso: [rx,ry,rz]}) o null para volver a la animacion
  verPose(huesos) { this.poseFija = huesos || null; this.ir(this.tick || 0); }
  // boca: { modelo, textura, reposo, pistas } de /api/animacion, o null si el actor no tiene boca
  ponerBoca(datos) { this.bocaDatos = datos || null; this._elegirBoca(); }
  _elegirBoca() {
    const d = this.bocaDatos;
    if (this.boca) this.boca.usar(d ? d.modelo : null, d ? d.textura : 'normal', d && d.tipo === 'pixel' ? { k: d.k, filas: d.filas } : null);
  }
  usarOjos(modoOjos) { this.modoOjos = modoOjos; this._elegirOjos(); this.ir(this.tick || 0); }
  _elegirOjos() {
    const modo = this.modoOjos || 'auto', film = (this.caraDatos && this.caraDatos.modelo) || '';
    let m = null;
    if (modo === 'eyes' || modo === 'eyes_1px') m = modo;
    else if (modo === 'auto' && film) m = film.includes('eyes_1px') ? 'eyes_1px' : film.includes('eyes') ? 'eyes' : null;
    this.ojos.usar(m);
    this.huesos.ojosBasicos.forEach((o) => (o.visible = !m && modo !== 'ninguno'));
  }
  _ojos(tick) {
    if (!this.ojos.modelo) return;
    const d = this.caraDatos || { reposo: {}, pistas: {} }, st = {};
    for (const b of Object.keys(this.ojos.partes[this.ojos.modelo].cfg)) {
      const kfs = d.pistas[b], rep = d.reposo[b] || {};
      st[b] = kfs ? { t: muestrearArr(kfs, tick, 'tr'), s: muestrearArr(kfs, tick, 's'), r: muestrearArr(kfs, tick, 'r') } : rep;
    }
    this.ojos.aplicar(st);
  }
  ir(tick) {
    this.tick = tick;
    this._ojos(tick);
    if (this.bocaDatos) {
      if (this.bocaDatos.tipo === 'pixel') this.boca.aplicarGrilla(grillaEn(this.bocaDatos, tick));
      else this.boca.aplicar(capasEn(this.bocaDatos, tick));
    }
    const v = this.tmp, rel = this.modelo.restRel;   // emoticons/steve: cada hueso tiene su orientacion de reposo
    const poner = (b, g, x, y, z) => {
      if (rel) g.quaternion.copy(rel[b]).multiply(this._q.setFromEuler(new THREE.Euler(x, y, z, 'ZYX')));
      else g.rotation.set(x, y, z, 'ZYX');
    };
    for (const [b, g] of Object.entries(this.huesos)) {
      const kfs = this.anim && this.anim[b];
      if (this.poseFija) { const r = this.poseFija[b] || [0, 0, 0]; poner(b, g, r[0], r[1], r[2]); }
      else if (this.cuerpoQuieto) poner(b, g, 0, 0, 0);   // modo cara: se revisan los ojos, el cuerpo del film no importa
      else if (kfs && kfs.length) { muestrear(kfs, tick, v); poner(b, g, v.x, v.y, v.z); }
      else poner(b, g, 0, 0, 0);
    }
    this.dibujar();
  }
  mostrarEjes(si) { this.ejesVisibles = si; this.ejes.forEach((a) => (a.visible = si)); this.dibujar(); }
  // posicion de los ojos (px, visto de frente): ver Ojos3D.mover
  moverOjos(dx, dy) { this.ojosPos = [dx, dy]; this.ojos.mover(dx, dy); this.dibujar(); }
  // eje XYZ en la esquina inferior derecha (gira con la camara). X rojo, Y verde, Z azul: los ejes de BBS
  _gizmo() {
    this.escenaG = new THREE.Scene();
    this.camaraG = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10);
    const ejes = [['X', [1, 0, 0], 0xd9453f], ['Y', [0, 1, 0], 0x1f9a38], ['Z', [0, 0, 1], 0x2f55c4]];
    const etiqueta = (txt, color, tenue) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      g.beginPath(); g.arc(32, 32, 28, 0, 2 * Math.PI); g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.globalAlpha = tenue ? 0.45 : 1; g.fill();
      if (txt) { g.globalAlpha = 1; g.fillStyle = '#ffffff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 32, 34); }
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
      s.scale.setScalar(tenue ? 0.34 : 0.5); return s;
    };
    for (const [txt, d, color] of ejes) {
      const v = new THREE.Vector3(...d);
      const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), v.clone().multiplyScalar(0.95)]), new THREE.LineBasicMaterial({ color }));
      this.escenaG.add(linea);
      const mas = etiqueta(txt, color, false); mas.position.copy(v); this.escenaG.add(mas);
      const menos = etiqueta('', color, true); menos.position.copy(v.clone().multiplyScalar(-1)); this.escenaG.add(menos);
    }
  }
  dibujar() {
    const r = this.renderer;
    r.autoClear = true;
    r.setViewport(0, 0, this.el.clientWidth, this.el.clientHeight); r.setScissorTest(false);
    r.render(this.scene, this.camera);
    // eje XYZ: la misma orientacion de la camara, en una esquina
    const w = this.el.clientWidth, h = this.el.clientHeight, t = Math.max(70, Math.min(120, Math.round(Math.min(w, h) * 0.25)));
    this.camaraG.position.copy(this.camera.position).sub(this.objetivo).normalize().multiplyScalar(4);
    this.camaraG.up.copy(this.camera.up); this.camaraG.lookAt(0, 0, 0);
    r.autoClear = false; r.setScissorTest(true);
    r.setViewport(w - t - 8, 8, t, t); r.setScissor(w - t - 8, 8, t, t);
    r.clearDepth(); r.render(this.escenaG, this.camaraG);
    r.setScissorTest(false); r.autoClear = true;
  }
  destruir() { this.ro.disconnect(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
export { TICKS_POR_S };
