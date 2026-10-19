// Escena 3D del Editor: los actores con sus modelos de BBS (los arma el Visor), posados en cada tick,
// el piso, las cámaras del film y la vista "por la cámara". Se toca con el dedo o el mouse.
import * as THREE from '../visor/lib/three.module.min.js';
import { OrbitControls } from '../visor/lib/OrbitControls.js';
import * as FM from './nucleo/film.js';

const D2R = Math.PI / 180;
const rotZYX = (rx, ry, rz) => new THREE.Matrix4().makeRotationZ(rz).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeRotationX(rx));

export class Vista {
  constructor(contenedor, recursos) {
    this.cont = contenedor; this.rec = recursos;   // {forms, modelos}
    this.render = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.render.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.render.outputColorSpace = THREE.SRGBColorSpace;
    contenedor.appendChild(this.render.domElement);
    this.render.domElement.style.touchAction = 'none';
    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color(0x8fb8e6);
    this.camara = new THREE.PerspectiveCamera(55, 1, 0.05, 600);
    this.camara.position.set(4, 3.5, 7);
    this.orbita = new OrbitControls(this.camara, this.render.domElement);
    this.orbita.target.set(0, 1, 0); this.orbita.enableDamping = true; this.orbita.update();
    this.escena.add(new THREE.HemisphereLight(0xffffff, 0x667080, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(3, 8, 4); this.escena.add(sol);
    this.piso = new THREE.Group(); this.escena.add(this.piso); this.pisoPlano();
    this.actores = new THREE.Group(); this.escena.add(this.actores);
    this.tomas = new THREE.Group(); this.escena.add(this.tomas);
    this.extras = new THREE.Group(); this.escena.add(this.extras);
    this.inst = new Map();          // replay -> {nodo, huesos: Map(id -> {o, g, piv}), clave, modelo, config}
    this.porToma = null;
    this.marco = document.createElement('div');
    Object.assign(this.marco.style, { position: 'absolute', pointerEvents: 'none', boxShadow: '0 0 0 4000px rgba(0,0,0,0.55)', outline: '1px solid rgba(255,255,255,0.5)', display: 'none', zIndex: 1 });
    contenedor.appendChild(this.marco);
    new ResizeObserver(() => this._tam()).observe(contenedor);
    this._tam();
    const bucle = () => { requestAnimationFrame(bucle); this._cuadro(); };
    bucle();
  }
  _tam() {
    const w = this.cont.clientWidth || 1, h = this.cont.clientHeight || 1;
    this.render.setSize(w, h); this.camara.aspect = w / h; this.camara.updateProjectionMatrix();
  }
  _cuadro() {
    if (this.porToma) {
      const v = this.porToma;
      this.camara.position.set(v.x, v.y, v.z);
      this.camara.lookAt(v.x + dirX(v), v.y + dirY(v), v.z + dirZ(v));
      this.camara.rotateZ(-(v.roll || 0) * D2R);
      // el video sale 16:9: se marca ese cuadro y el FOV de BBS (vertical) se aplica a ese cuadro
      const w = this.cont.clientWidth || 1, h = this.cont.clientHeight || 1;
      let fw = w, fh = w * 9 / 16;
      if (fh > h) { fh = h; fw = h * 16 / 9; }
      const fov = 2 * Math.atan(Math.tan((v.fov / 2) * D2R) * h / fh) / D2R;
      if (Math.abs(this.camara.fov - fov) > 1e-3) { this.camara.fov = fov; this.camara.updateProjectionMatrix(); }
      Object.assign(this.marco.style, { display: 'block', width: fw + 'px', height: fh + 'px', left: (w - fw) / 2 + 'px', top: (h - fh) / 2 + 'px' });
    } else {
      this.orbita.update();
      if (this.camara.fov !== 55) { this.camara.fov = 55; this.camara.updateProjectionMatrix(); }
      this.marco.style.display = 'none';
    }
    this.render.render(this.escena, this.camara);
  }

  pisoPlano() {
    this.piso.clear();
    const plano = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x6aa84f }));
    plano.rotation.x = -Math.PI / 2; plano.userData.piso = true; this.piso.add(plano);
    const g = new THREE.GridHelper(64, 64, 0x2f5a22, 0x4f8a3a); g.position.y = 0.002; this.piso.add(g);
  }

  // ---------------------------------------------------------------- actores
  // Arma (o reusa) el modelo de cada actor. Se rearma solo si cambió su form.
  async sincronizar(film) {
    const reps = film.replays || [];
    const vivos = new Set(reps);
    // los que ya no están quedan sueltos: si un actor "nuevo" tiene el mismo form (deshacer, abrir copia) se reusa su modelo
    const sueltos = [];
    for (const [r, x] of this.inst) if (!vivos.has(r)) { sueltos.push(x); this.inst.delete(r); }
    for (let i = 0; i < reps.length; i++) {
      const r = reps[i], clave = JSON.stringify(r.form || {});
      let x = this.inst.get(r);
      if (!x) {
        const j = sueltos.findIndex((s) => s.clave === clave);
        if (j >= 0) { x = sueltos.splice(j, 1)[0]; x.nodo.userData.rep = r; this.inst.set(r, x); }
      }
      if (x && x.clave === clave) { x.i = i; continue; }
      const nodo = new THREE.Group();
      const form = await this.rec.forms.construir(r.form || {});
      nodo.add(form);
      const info = { nodo, clave, i, huesos: new Map(), config: {}, form };
      if (r.form && r.form.id === 'bbs:model') {
        const d = await this.rec.modelos.datos(r.form.model || '');
        info.config = (d && d.config) || {};
        if (d && d.modelo) {
          // los huesos del modelo principal (no los de las partes pegadas, que son otros forms)
          const raiz = form.children.find((o) => o.name && o.name.startsWith('modelo:'));
          const recorrer = (o) => {
            for (const h of o.children) {
              if (h.name && h.name.startsWith('form:')) continue;
              const g = d.modelo.grupos.get(h.name);
              if (g && h.isGroup) info.huesos.set(h.name, { o: h, g, piv: g.origin.map((v) => v / 16) });
              recorrer(h);
            }
          };
          if (raiz) recorrer(raiz);
        }
      }
      nodo.userData.rep = r;
      if (x) this.actores.remove(x.nodo);
      this.actores.add(nodo); this.inst.set(r, info);
    }
    for (const x of sueltos) this.actores.remove(x.nodo);
    if (this.elegido && !this.inst.has(this.elegido)) this.elegido = null;
    this._pasos = null;
  }

  // Pone a todos como están en el tick t
  aplicar(film, t) {
    if (!this._pasos) this._pasos = calcularPasos(film);
    for (const r of film.replays || []) {
      const x = this.inst.get(r); if (!x) continue;
      const e = FM.estado(r, t);
      x.nodo.position.set(e.x, e.y, e.z);
      x.nodo.rotation.y = -e.cuerpo * D2R;
      x.nodo.visible = e.visible || this.mostrarOcultos;
      x.form.traverse((o) => { if (o.material) { o.material.transparent = !e.visible || o.material.userData.transp; o.material.opacity = e.visible ? 1 : 0.3; } });
      if (!x.huesos.size) continue;
      const cfg = x.config || {};
      const cabeza = cfg.look_at && cfg.look_at.head;
      const lim = (cfg.look_at && cfg.look_at.head_limit) || 45;
      const paso = cfg.procedural ? pasoEn(this._pasos.get(r), t) : null;
      for (const [id, h] of x.huesos) {
        const pt = FM.pose(r, id, t);
        const tr = pt ? pt.t : [0, 0, 0];
        const rot = [h.g.rotate[0], h.g.rotate[1], h.g.rotate[2]];
        const sc = h.g.scale.slice();
        if (pt) { rot[0] += pt.r[0] / D2R; rot[1] += pt.r[1] / D2R; rot[2] += pt.r[2] / D2R; sc[0] += pt.s[0] - 1; sc[1] += pt.s[1] - 1; sc[2] += pt.s[2] - 1; }
        if (id === cabeza) {
          const dy = Math.max(-lim, Math.min(lim, difAng(e.cabeza, e.cuerpo)));
          // medido contra Minecraft: headYaw mayor gira a la izquierda del mundo (-X con yaw 0) y pitch positivo mira abajo
          rot[1] -= dy; rot[0] -= e.pitch;
        }
        if (paso && paso.amp > 0.01) {
          const s = Math.cos(paso.fase * 0.6662) * paso.amp / D2R;
          if (id === 'right_leg') rot[0] += s * 1.4; else if (id === 'left_leg') rot[0] -= s * 1.4;
          else if (id === 'right_arm') rot[0] -= s; else if (id === 'left_arm') rot[0] += s;
        }
        h.o.matrix.makeTranslation(-tr[0] / 16, tr[1] / 16, tr[2] / 16)
          .multiply(new THREE.Matrix4().makeTranslation(h.piv[0], h.piv[1], h.piv[2]))
          .multiply(rotZYX(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R))
          .multiply(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]))
          .multiply(new THREE.Matrix4().makeTranslation(-h.piv[0], -h.piv[1], -h.piv[2]));
      }
      x.nodo.updateMatrixWorld(true);
    }
    this._marcarElegido();
  }
  pasosViejos() { this._pasos = null; }

  // ---------------------------------------------------------------- elegir
  elegir(rep, hueso = null) { this.elegido = rep; this.huesoElegido = hueso; this._marcarElegido(); }
  _marcarElegido() {
    vaciar(this.extras);
    const x = this.elegido && this.inst.get(this.elegido);
    if (!x) return;
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.58, 40), new THREE.MeshBasicMaterial({ color: 0xffd640, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    aro.rotation.x = -Math.PI / 2; aro.position.copy(x.nodo.position); aro.position.y += 0.02; this.extras.add(aro);
    const h = this.huesoElegido && x.huesos.get(this.huesoElegido);
    if (h) {
      const caja = new THREE.Box3();
      for (const m of h.o.children) if (m.isMesh) caja.expandByObject(m);
      if (!caja.isEmpty()) this.extras.add(new THREE.Box3Helper(caja, 0xff5a36));
      const p = new THREE.Vector3(...h.piv).applyMatrix4(h.o.matrixWorld);
      const bola = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5a36, depthTest: false }));
      bola.position.copy(p); bola.renderOrder = 20; this.extras.add(bola);
    }
  }

  _rayo(e) {
    const r = this.render.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(m, this.camara); return ray;
  }
  // qué hay bajo el dedo: {rep, hueso} | {toma} | null
  tocar(e) {
    const ray = this._rayo(e);
    const objs = [...this.actores.children.filter((o) => o.visible), ...this.tomas.children];
    for (const h of ray.intersectObjects(objs, true)) {
      let o = h.object, hueso = null, rep = null, toma = null;
      while (o) {
        if (!hueso && o.isGroup && o.name && !o.name.startsWith('form:') && !o.name.startsWith('modelo:') && o.name !== 'giro') {
          const x = this.inst.get(raizRep(o)); if (x && x.huesos.has(o.name)) hueso = o.name;
        }
        if (o.userData.rep) { rep = o.userData.rep; break; }
        if (o.userData.toma) { toma = o.userData.toma; break; }
        o = o.parent;
      }
      if (rep) return { rep, hueso };
      if (toma) return { toma };
    }
    return null;
  }
  puntoEnPlano(e, y) { const p = new THREE.Vector3(); return this._rayo(e).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null; }
  puntoEnPiso(e) { const h = this._rayo(e).intersectObjects(this.piso.children, true)[0]; return h ? h.point : null; }

  // ---------------------------------------------------------------- cámaras
  vistaActual() {
    const d = new THREE.Vector3(); this.camara.getWorldDirection(d);
    const yaw = Math.atan2(-d.x, d.z) / D2R, pitch = -Math.asin(Math.max(-1, Math.min(1, d.y))) / D2R, p = this.camara.position;
    return { x: r4(p.x), y: r4(p.y), z: r4(p.z), yaw: r4(yaw), pitch: r4(pitch), fov: 50 };
  }
  irA(v) {
    this.camara.position.set(v.x, v.y, v.z);
    this.orbita.target.set(v.x + dirX(v) * 5, v.y + dirY(v) * 5, v.z + dirZ(v) * 5); this.orbita.update();
  }
  // [{c, vista, activa, elegida}]
  ponerTomas(lista) {
    vaciar(this.tomas);
    for (const q of lista) {
      const g = new THREE.Group(), v = q.vista;
      const color = q.elegida ? 0xff5a36 : q.activa ? 0xffd640 : 0x8a7a40;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.42), new THREE.MeshLambertMaterial({ color })));
      const l = 1.2, t = Math.tan((v.fov / 2) * D2R) * l, a = t * 16 / 9;
      const pts = [[0, 0, 0], [-a, t, l], [0, 0, 0], [a, t, l], [0, 0, 0], [-a, -t, l], [0, 0, 0], [a, -t, l], [-a, t, l], [a, t, l], [a, t, l], [a, -t, l], [a, -t, l], [-a, -t, l], [-a, -t, l], [-a, t, l]];
      g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color })));
      g.position.set(v.x, v.y, v.z); g.rotation.order = 'YXZ'; g.rotation.y = -v.yaw * D2R; g.rotation.x = v.pitch * D2R;
      g.userData.toma = q.c; g.visible = !(this.porToma && q.activa);
      this.tomas.add(g);
    }
  }
  foto() { this._cuadro(); return this.render.domElement.toDataURL('image/jpeg', 0.85); }
}

// saca y libera lo que se dibujó (aros, cámaras): se rehacen en cada cuadro y si no se libera se llena la memoria del celu
function vaciar(g) {
  for (const o of g.children) o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); });
  g.clear();
}
const r4 = (v) => Math.round(v * 10000) / 10000;
const dirX = (v) => -Math.sin(v.yaw * D2R) * Math.cos(v.pitch * D2R);
const dirY = (v) => -Math.sin(v.pitch * D2R);
const dirZ = (v) => Math.cos(v.yaw * D2R) * Math.cos(v.pitch * D2R);
const difAng = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;
function raizRep(o) { while (o && !o.userData.rep) o = o.parent; return o ? o.userData.rep : null; }

// Caminar "procedural" de BBS (como Minecraft): las piernas y brazos se balancean según lo que avanza el actor.
// Para cada actor: fase acumulada y amplitud por tick.
function calcularPasos(film) {
  const out = new Map();
  const fin = Math.ceil(FM.duracion(film)) + 2;
  for (const r of film.replays || []) {
    const fase = new Float32Array(fin + 1), amp = new Float32Array(fin + 1);
    let px = FM.prop(r, 'x', 0), pz = FM.prop(r, 'z', 0), f = 0, a = 0;
    for (let t = 1; t <= fin; t++) {
      const x = FM.prop(r, 'x', t), z = FM.prop(r, 'z', t);
      const v = Math.hypot(x - px, z - pz);
      a += (Math.min(1, v * 4) - a) * 0.4; f += a;
      fase[t] = f; amp[t] = a; px = x; pz = z;
    }
    out.set(r, { fase, amp });
  }
  return out;
}
function pasoEn(p, t) {
  if (!p) return null;
  const i = Math.max(0, Math.min(p.fase.length - 1, Math.floor(t))), j = Math.min(p.fase.length - 1, i + 1), f = t - Math.floor(t);
  return { fase: p.fase[i] + (p.fase[j] - p.fase[i]) * f, amp: p.amp[i] + (p.amp[j] - p.amp[i]) * f };
}
