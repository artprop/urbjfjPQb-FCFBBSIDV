// Vista del mundo para el guion de escena: el mapa desde arriba (como Xaero o Mineways) con los actores como puntos,
// y una vista 3D simple de la zona que elijas, donde se reproduce la escena y se ponen cámaras.
// Es un componente suelto: lo usan el Director de Estudio BBS y el Director de la PC (que lo carga desde acá).
//
//   const v = new VistaMundo(contenedor, { insertar: (texto) => ..., color: (i) => '#4fa3ff' });
//   await v.cargar({ leerRegion, rel, nombreMundo, actores, posiciones });   // posiciones: [[x, y, z]] del film en el tick 0
//   v.escena({ recorridos, acciones });     // lo que devuelve "Probar"
//   v.tiempo(t);                            // tick a mostrar
//
// Coordenadas: las del mundo (F3) = las del film + relative_coordinates. En el 3D, x/y/z de three.js = las del mundo.
import * as THREE from '../visor/lib/three.module.min.js';
import { OrbitControls } from '../visor/lib/OrbitControls.js';
import * as mundo from './nucleo/mundo.js';
import { colorBloque } from './nucleo/colores.js';

const MAX_ZONA = 64;            // lado máximo de la zona 3D (bloques)
const MAX_MAPA = 320;           // lado máximo del mapa desde arriba
const ALTO_ZONA = 40;           // cuántos bloques para abajo se arma el 3D desde la altura de corte

const CSS = `
.vm { display: flex; flex-direction: column; gap: 8px; }
.vm-barra { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; font-size: 14px; }
.vm-barra input[type=range] { width: 160px; padding: 0; }
.vm-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
@media (max-width: 900px) { .vm-cols { grid-template-columns: 1fr; } }
.vm-caja { position: relative; min-width: 0; }
.vm-caja canvas { width: 100%; height: 440px; display: block; background: #0f1217; border: 1px solid var(--borde, #3a4150); border-radius: 8px; touch-action: none; }
.vm-info { position: absolute; left: 8px; bottom: 8px; font-size: 12px; color: #cfd5de; background: #0f1217cc; padding: 2px 6px; border-radius: 4px; pointer-events: none; }
.vm-ayuda { position: absolute; left: 0; right: 0; top: 40%; text-align: center; color: #9aa3b2; font-size: 14px; pointer-events: none; padding: 0 20px; }
.vm-boton-activo { outline: 2px solid var(--acento, #4fa3ff); }
.vm-sub { font-size: 13px; color: var(--suave, #9aa3b2); }
`;

const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const deg = (r) => r * 180 / Math.PI, rad = (d) => d * Math.PI / 180;

export class VistaMundo {
  constructor(raiz, { insertar = () => {}, color = () => '#4fa3ff', alTiempo = null, reproducir = null } = {}) {
    this.insertar = insertar; this.color = color; this.alTiempo = alTiempo; this.reproducir = reproducir;
    this.mapa = null; this.rel = { x: 0, y: 0, z: 0 }; this.actores = []; this.t = 0;
    this.recorridos = null; this.acciones = [];
    if (!document.getElementById('vm-estilo')) { const s = document.createElement('style'); s.id = 'vm-estilo'; s.textContent = CSS; document.head.append(s); }
    raiz.innerHTML = `
      <div class="vm">
        <div class="vm-barra">
          <span class="vm-mundo vm-sub"></span>
          <label>Altura de corte <input type="range" class="vm-corte" min="-64" max="320" step="1"> <b class="vm-corte-txt"></b></label>
          <button class="vm-zona" title="Arrastrá sobre el mapa para elegir la zona que se arma en 3D">▭ Elegir zona para el 3D</button>
          <label>Clic en un bloque del 3D: <select class="vm-clic"></select></label>
        </div>
        <div class="vm-cols">
          <div class="vm-caja"><canvas class="vm-mapa"></canvas><div class="vm-info"></div><div class="vm-ayuda vm-ayuda-mapa"></div></div>
          <div class="vm-caja"><canvas class="vm-3d"></canvas><div class="vm-info vm-info3d"></div><div class="vm-ayuda vm-ayuda-3d">Elegí una zona en el mapa (botón ▭) para verla en 3D.</div></div>
        </div>
        <div class="vm-barra">
          <button class="vm-play" aria-label="Reproducir">▶</button>
          <input type="range" class="vm-tiempo" min="0" max="100" value="0" step="1" aria-label="Tiempo" style="flex: 1 1 200px; width: auto">
          <span class="vm-tiempo-txt vm-sub"></span>
        </div>
        <div class="vm-barra">
          <button class="vm-cam" title="Escribe en el guion una cámara puesta donde estás mirando en el 3D">📷 Agregar cámara desde esta vista</button>
          <label title="El 3D muestra lo que ve la cámara del guion en ese momento"><input type="checkbox" class="vm-vercam"> Ver por la cámara</label>
          <span class="vm-sub">Mapa: rueda = zoom, arrastrar = mover. 3D: arrastrar = girar, rueda = zoom, clic derecho = mover.</span>
        </div>
      </div>`;
    this.$ = (c) => raiz.querySelector(c);
    this.cvMapa = this.$('.vm-mapa'); this.cv3d = this.$('.vm-3d');
    this.vista = { cx: 0, cz: 0, esc: 3 };       // centro del mapa (mundo) y píxeles por bloque
    this.zona = null;                            // {x0, z0, x1, z1} en bloques del mundo
    this._eventosMapa(); this._iniciar3d();
    this.$('.vm-corte').oninput = () => { this.$('.vm-corte-txt').textContent = this.$('.vm-corte').value; clearTimeout(this._tc); this._tc = setTimeout(() => { this._terreno(); if (this.zona) this._armarZona(); }, 250); };
    this.$('.vm-zona').onclick = () => { this.modoZona = !this.modoZona; this.$('.vm-zona').classList.toggle('vm-boton-activo', this.modoZona); };
    this.$('.vm-cam').onclick = () => this._agregarCamara();
    this.$('.vm-vercam').onchange = () => this._actualizar3d();
    this.$('.vm-tiempo').oninput = () => { const t = +this.$('.vm-tiempo').value; if (this.alTiempo) this.alTiempo(t); else this.tiempo(t); };
    this.$('.vm-play').onclick = () => { if (this.reproducir) this.reproducir(); };
    const ro = new ResizeObserver(() => { this._dibujarMapa(); this._tam3d(); });
    ro.observe(this.cvMapa); ro.observe(this.cv3d);
    this._sinMapa('Abrí un film para ver su mundo.');
  }

  _sinMapa(msg) { this.$('.vm-ayuda-mapa').textContent = msg; this.$('.vm-mundo').textContent = ''; }

  // ------------------------------------------------------------ carga
  // leerRegion(rx, rz) -> Promise<bytes|null>; posiciones: [[x, y, z]] del film en el tick 0 (uno por actor)
  async cargar({ leerRegion, rel, nombreMundo, actores, posiciones }) {
    this.rel = { x: rel.x || 0, y: rel.y || 0, z: rel.z || 0 };
    this.actores = actores;
    this.posiciones = posiciones.map(([x, y, z]) => [x + this.rel.x, y + this.rel.y, z + this.rel.z]);
    this._opcionesClic();
    this.recorridos = null; this.acciones = []; this.zona = null;
    const conMapa = (si) => { for (const c of ['.vm-corte', '.vm-zona']) { const el = this.$(c); (el.closest('label') || el).hidden = !si; } };
    conMapa(!!leerRegion);
    if (!leerRegion) {
      // sin mapa: el 3D muestra a los actores sobre una grilla (igual se reproduce la escena y se ven las cámaras)
      this.mapa = null; this.terreno = null;
      if (this.bloques) { this.esc3.remove(this.bloques); this.bloques = null; }
      this._sinMapa('Este film no tiene mapa del mundo (en el celu, o un film importado suelto): el 3D muestra solo a los actores.');
      const xs = this.posiciones.map((p) => p[0]), zs = this.posiciones.map((p) => p[2]), ys = this.posiciones.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, cy = Math.min(...ys);
      const lado = Math.max(16, Math.max(...xs) - Math.min(...xs) + 10, Math.max(...zs) - Math.min(...zs) + 10);
      if (this.grilla) this.esc3.remove(this.grilla);
      this.grilla = new THREE.GridHelper(Math.ceil(lado / 2) * 2, Math.ceil(lado / 2) * 2, 0x3a4150, 0x262b35);
      this.grilla.position.set(Math.round(cx), cy, Math.round(cz)); this.esc3.add(this.grilla);
      this.vista = { cx, cz, esc: Math.max(2, Math.min(16, (this.cvMapa.clientWidth || 500) / lado)) };
      this.$('.vm-ayuda-3d').textContent = '';
      this.ctl.target.set(cx, cy, cz); this.cam3.position.set(cx + lado * 0.4, cy + lado * 0.6, cz + lado * 0.7); this.ctl.update();
      this._dibujarMapa(); this._tam3d(); this._actualizar3d();
      return false;
    }
    if (this.grilla) { this.esc3.remove(this.grilla); this.grilla = null; }
    this._sinMapa('Leyendo el mapa del mundo…');
    const xs = this.posiciones.map((p) => p[0]), zs = this.posiciones.map((p) => p[2]), ys = this.posiciones.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const lado = Math.min(MAX_MAPA, Math.max(96, Math.max(...xs) - Math.min(...xs) + 96, Math.max(...zs) - Math.min(...zs) + 96));
    this.area = { x0: Math.floor(cx - lado / 2), z0: Math.floor(cz - lado / 2), lado: Math.ceil(lado) };
    const puntos = [[this.area.x0, this.area.z0], [this.area.x0 + this.area.lado, this.area.z0], [this.area.x0, this.area.z0 + this.area.lado], [this.area.x0 + this.area.lado, this.area.z0 + this.area.lado], ...this.posiciones.map((p) => [p[0], p[2]])];
    this.mapa = new mundo.Mundo(await mundo.cargarRegiones(leerRegion, puntos, 0));
    this.$('.vm-mundo').innerHTML = nombreMundo ? `Mundo: <b>${nombreMundo.replace(/[<>&]/g, '')}</b>` : '';
    const corte = Math.floor(Math.max(...ys)) + 3;
    this.$('.vm-corte').value = corte; this.$('.vm-corte-txt').textContent = corte;
    this.vista = { cx, cz, esc: Math.max(1, Math.min(8, (this.cvMapa.clientWidth || 500) / lado)) };
    this.$('.vm-ayuda-mapa').textContent = '';
    this._terreno();
    // zona inicial: alrededor de los actores
    const zx = Math.max(...xs) - Math.min(...xs), zz = Math.max(...zs) - Math.min(...zs);
    const m = Math.max(8, Math.min(MAX_ZONA, Math.max(zx, zz) + 16)) / 2;
    this.zona = { x0: Math.floor(cx - m), z0: Math.floor(cz - m), x1: Math.floor(cx + m), z1: Math.floor(cz + m) };
    this._armarZona();
    return true;
  }

  _opcionesClic() {
    const ref = (a) => (this.actores.filter((b) => b.nombre === a.nombre).length === 1 && !/^#\d+$/.test(a.nombre) ? a.nombre : String(a.i + 1));
    const ops = ['<option value="coords">las coordenadas (X Y Z)</option>'];
    for (const a of this.actores.filter((x) => !x.marca)) {
      const r = ref(a);
      ops.push(`<option value="camina|${r}">${r} camina hasta ahí</option>`, `<option value="corre|${r}">${r} corre hasta ahí</option>`,
        `<option value="ubica|${r}">${r} se ubica ahí</option>`);
    }
    this.$('.vm-clic').innerHTML = ops.join('');
  }

  // ------------------------------------------------------------ mapa desde arriba
  _terreno() {
    if (!this.mapa) return;
    const { x0, z0, lado } = this.area, corte = +this.$('.vm-corte').value;
    const img = new ImageData(lado, lado), alt = new Float32Array(lado * lado).fill(NaN);
    for (let j = 0; j < lado; j++) {
      for (let i = 0; i < lado; i++) {
        const s = this.mapa.superficie(x0 + i, z0 + j, corte, 80);
        const p = (j * lado + i) * 4;
        if (!s) { img.data[p + 3] = 0; continue; }
        alt[j * lado + i] = s.y;
        let [r, g, b] = colorBloque(s.nombre);
        let f = 1 - Math.min(0.55, (corte - s.y) * 0.025);                  // lo más hondo, más oscuro
        const n = j > 0 ? alt[(j - 1) * lado + i] : NaN, o = i > 0 ? alt[j * lado + i - 1] : NaN;   // sombreado del relieve
        if (!Number.isNaN(n)) f *= s.y > n ? 1.12 : s.y < n ? 0.86 : 1;
        if (!Number.isNaN(o)) f *= s.y > o ? 1.06 : s.y < o ? 0.93 : 1;
        if (s.liquido) f *= 0.95;
        img.data[p] = Math.min(255, r * f); img.data[p + 1] = Math.min(255, g * f); img.data[p + 2] = Math.min(255, b * f); img.data[p + 3] = 255;
      }
    }
    this.imgAlt = alt;
    this.terreno = document.createElement('canvas'); this.terreno.width = lado; this.terreno.height = lado;
    this.terreno.getContext('2d').putImageData(img, 0, 0);
    this._dibujarMapa();
  }

  _aPantalla(x, z) { const W = this.cvMapa.clientWidth, H = this.cvMapa.clientHeight, v = this.vista; return [(x - v.cx) * v.esc + W / 2, (z - v.cz) * v.esc + H / 2]; }
  _aMundo(px, pz) { const W = this.cvMapa.clientWidth, H = this.cvMapa.clientHeight, v = this.vista; return [(px - W / 2) / v.esc + v.cx, (pz - H / 2) / v.esc + v.cz]; }

  _eventosMapa() {
    const cv = this.cvMapa;
    let arr = null;
    const pos = (ev) => { const b = cv.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
    cv.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const [px, pz] = pos(ev), [wx, wz] = this._aMundo(px, pz);
      this.vista.esc = Math.max(0.5, Math.min(24, this.vista.esc * (ev.deltaY < 0 ? 1.2 : 1 / 1.2)));
      const [nx, nz] = this._aMundo(px, pz); this.vista.cx += wx - nx; this.vista.cz += wz - nz;
      this._dibujarMapa();
    }, { passive: false });
    cv.addEventListener('pointerdown', (ev) => { cv.setPointerCapture(ev.pointerId); arr = { p: pos(ev), v: { ...this.vista }, zona: this.modoZona }; });
    cv.addEventListener('pointermove', (ev) => {
      const p = pos(ev), [wx, wz] = this._aMundo(...p);
      const s = this.mapa ? this.mapa.superficie(Math.floor(wx), Math.floor(wz), +this.$('.vm-corte').value, 80) : null;
      this.$('.vm-info').textContent = `X ${Math.floor(wx)}  Z ${Math.floor(wz)}` + (s ? `  ·  Y ${r2(s.y)}  ·  ${s.nombre.replace('minecraft:', '')}` : '');
      if (!arr) return;
      if (arr.zona) {
        const [ax, az] = this._aMundo(...arr.p);
        let x0 = Math.floor(Math.min(ax, wx)), x1 = Math.floor(Math.max(ax, wx)), z0 = Math.floor(Math.min(az, wz)), z1 = Math.floor(Math.max(az, wz));
        x1 = Math.min(x1, x0 + MAX_ZONA - 1); z1 = Math.min(z1, z0 + MAX_ZONA - 1);
        this.zonaNueva = { x0, z0, x1, z1 };
      } else {
        this.vista.cx = arr.v.cx - (p[0] - arr.p[0]) / this.vista.esc; this.vista.cz = arr.v.cz - (p[1] - arr.p[1]) / this.vista.esc;
      }
      this._dibujarMapa();
    });
    cv.addEventListener('pointerup', () => {
      if (arr && arr.zona && this.zonaNueva) {
        this.zona = this.zonaNueva; this.zonaNueva = null; this.modoZona = false;
        this.$('.vm-zona').classList.remove('vm-boton-activo');
        this._armarZona();
      }
      arr = null; this._dibujarMapa();
    });
  }

  _dibujarMapa() {
    const cv = this.cvMapa, dpr = devicePixelRatio || 1;
    if (!cv.clientWidth) return;
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
    if (this.terreno) {
      g.imageSmoothingEnabled = false;
      const [px, pz] = this._aPantalla(this.area.x0, this.area.z0);
      g.drawImage(this.terreno, px, pz, this.area.lado * this.vista.esc, this.area.lado * this.vista.esc);
    }
    const rel = this.rel;
    // recorridos y actores
    if (this.recorridos) {
      for (const [i, p] of Object.entries(this.recorridos)) {
        g.strokeStyle = this.color(+i); g.globalAlpha = 0.55; g.lineWidth = 2; g.beginPath();
        p.forEach((q, k) => { const [sx, sz] = this._aPantalla(q[1] + rel.x, q[2] + rel.z); if (k) g.lineTo(sx, sz); else g.moveTo(sx, sz); });
        g.stroke(); g.globalAlpha = 1;
      }
    }
    this.actores.forEach((a) => {
      const q = this._pos(a.i);
      if (!q) return;
      const [sx, sz] = this._aPantalla(q.x, q.z);
      g.globalAlpha = q.vis ? 1 : 0.3;
      g.fillStyle = this.color(a.i); g.strokeStyle = '#0f1217'; g.lineWidth = 2;
      g.beginPath(); g.arc(sx, sz, a.marca ? 4 : 6, 0, Math.PI * 2); g.fill(); g.stroke();
      if (!a.marca) { const r = rad(q.yaw); g.strokeStyle = this.color(a.i); g.beginPath(); g.moveTo(sx, sz); g.lineTo(sx - Math.sin(r) * 14, sz + Math.cos(r) * 14); g.stroke(); }
      g.fillStyle = '#fff'; g.font = '12px system-ui, sans-serif'; g.fillText(a.nombre === a.num ? a.num : `${a.i + 1} ${a.nombre}`, sx + 8, sz - 7);
      g.globalAlpha = 1;
    });
    // cámara activa (amarilla)
    const c = this._camara(this.t);
    if (c) {
      const [sx, sz] = this._aPantalla(c.x, c.z), r = rad(c.yaw);
      g.fillStyle = '#ffd34d'; g.beginPath(); g.moveTo(sx - Math.sin(r) * 16, sz + Math.cos(r) * 16);
      g.lineTo(sx - Math.sin(r + 2.5) * 8, sz + Math.cos(r + 2.5) * 8); g.lineTo(sx - Math.sin(r - 2.5) * 8, sz + Math.cos(r - 2.5) * 8); g.fill();
    }
    // zona del 3D
    for (const [z, col, dash] of [[this.zona, '#4fa3ff', []], [this.zonaNueva, '#ffd34d', [6, 4]]]) {
      if (!z) continue;
      const [ax, az] = this._aPantalla(z.x0, z.z0), [bx, bz] = this._aPantalla(z.x1 + 1, z.z1 + 1);
      g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dash); g.strokeRect(ax, az, bx - ax, bz - az); g.setLineDash([]);
    }
  }

  // ------------------------------------------------------------ estado en el tiempo
  // posición del actor i en el tick t (mundo): del "Probar" si lo hubo, si no la del film
  _pos(i) {
    const p = this.recorridos && this.recorridos[i];
    if (p && p.length) {
      const q = p[Math.min(p.length - 1, Math.max(0, Math.round(this.t / 2)))];
      return { x: q[1] + this.rel.x, z: q[2] + this.rel.z, y: (q[5] ?? 0) + this.rel.y, yaw: q[3], vis: q[4] };
    }
    const q = this.posiciones && this.posiciones[i];
    return q ? { x: q[0], y: q[1], z: q[2], yaw: 0, vis: true } : null;
  }

  // cámara del guion activa en el tick t: {x, y, z (mundo), yaw, pitch, fov} o null
  _camara(t) {
    const a = this.acciones.filter((x) => x.camara && x.desde <= t && t < x.hasta).pop();
    if (!a) return null;
    const pts = a.camara;
    let k = 0;
    while (k + 1 < pts.length && pts[k + 1][0] <= t) k++;
    const p = pts[k], q = pts[Math.min(pts.length - 1, k + 1)];
    const f = q[0] > p[0] ? Math.min(1, Math.max(0, (t - p[0]) / (q[0] - p[0]))) : 0;
    const L = (j) => p[j] + (q[j] - p[j]) * f;
    return { x: L(1) + this.rel.x, z: L(2) + this.rel.z, yaw: L(3), y: L(4) + this.rel.y, pitch: L(5), fov: a.fov || 70 };
  }

  escena({ recorridos, acciones }) {
    this.recorridos = recorridos; this.acciones = acciones || [];
    this._dibujarMapa(); this._actualizar3d();
  }

  tiempo(t) {
    this.t = t;
    this.$('.vm-tiempo').value = t; this.$('.vm-tiempo-txt').textContent = `${(t / 20).toFixed(1)} s (tick ${t})`;
    this._dibujarMapa(); this._actualizar3d();
  }
  rango(max) { this.$('.vm-tiempo').max = Math.ceil(max); }
  reproduciendo(si) { this.$('.vm-play').textContent = si ? '⏸' : '▶'; }

  // ------------------------------------------------------------ 3D
  _iniciar3d() {
    this.ren = new THREE.WebGLRenderer({ canvas: this.cv3d, antialias: true });
    this.ren.setPixelRatio(devicePixelRatio || 1);
    this.esc3 = new THREE.Scene(); this.esc3.background = new THREE.Color(0x0f1217);
    this.esc3.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
    const d = new THREE.DirectionalLight(0xffffff, 1.3); d.position.set(0.5, 1, 0.3); this.esc3.add(d);
    this.cam3 = new THREE.PerspectiveCamera(60, 1, 0.05, 2000);
    this.ctl = new OrbitControls(this.cam3, this.cv3d);
    this.ctl.addEventListener('change', () => this._render());
    this.grupoActores = new THREE.Group(); this.esc3.add(this.grupoActores);
    this.grupoCam = new THREE.Group(); this.esc3.add(this.grupoCam);
    // clic en un bloque (sin arrastrar) -> escribe en el guion
    let abajo = null;
    this.cv3d.addEventListener('pointerdown', (ev) => { abajo = [ev.clientX, ev.clientY, ev.button]; });
    this.cv3d.addEventListener('pointerup', (ev) => {
      if (!abajo || abajo[2] !== 0 || Math.hypot(ev.clientX - abajo[0], ev.clientY - abajo[1]) > 4) { abajo = null; return; }
      abajo = null; this._clic3d(ev);
    });
    this.cv3d.addEventListener('pointermove', (ev) => {
      const h = this._bloqueBajo(ev);
      this.$('.vm-info3d').textContent = h ? `X ${r1(h.x)}  Y ${r2(h.y)}  Z ${r1(h.z)}  ·  ${h.nombre.replace('minecraft:', '')}` : '';
    });
  }

  _tam3d() {
    const w = this.cv3d.clientWidth, h = this.cv3d.clientHeight;
    if (!w || !h) return;
    this.ren.setSize(w, h, false); this.cam3.aspect = w / h; this.cam3.updateProjectionMatrix(); this._render();
  }

  _render() { if (this.ren) this.ren.render(this.esc3, this.cam3); }

  _armarZona() {
    if (!this.mapa || !this.zona) return;
    if (this.bloques) { this.esc3.remove(this.bloques); this.bloques.geometry.dispose(); this.bloques.material.dispose(); this.bloques = null; }
    const { x0, z0, x1, z1 } = this.zona, corte = +this.$('.vm-corte').value;
    // de abajo: unos bloques debajo del piso de los actores (no hace falta todo el subsuelo)
    const ysZona = this.posiciones.filter((p) => p[0] >= x0 && p[0] <= x1 + 1 && p[2] >= z0 && p[2] <= z1 + 1).map((p) => p[1]);
    const yMin = Math.max(corte - ALTO_ZONA, Math.floor(ysZona.length ? Math.min(...ysZona) : corte - 12) - 4);
    const lista = [];
    const alto = (x, y, z) => (y > corte || x < x0 || x > x1 || z < z0 || z > z1 ? 0 : (this.mapa.alto(x, y, z) || 0));
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = yMin; y <= corte; y++) {
      const a = alto(x, y, z);
      if (a <= 0) continue;
      // solo los que se ven: con algo hueco al lado o arriba (o en el borde de la zona: se ve el corte)
      const tapado = a >= 1 && alto(x, y + 1, z) >= 1 && (y === yMin || alto(x, y - 1, z) >= 1)
        && alto(x + 1, y, z) >= 1 && alto(x - 1, y, z) >= 1 && alto(x, y, z + 1) >= 1 && alto(x, y, z - 1) >= 1;
      if (!tapado) lista.push([x, y, z, a]);
    }
    const ayuda = this.$('.vm-ayuda-3d');
    if (!lista.length) { ayuda.textContent = 'En esa zona no hay bloques (o falta el mapa). Probá otra zona o subí la altura de corte.'; this._render(); return; }
    ayuda.textContent = '';
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const m = new THREE.InstancedMesh(geo, mat, lista.length);
    const mx = new THREE.Matrix4(), col = new THREE.Color();
    this.datosBloques = lista;
    lista.forEach(([x, y, z, a], k) => {
      mx.makeScale(1, a, 1); mx.setPosition(x + 0.5, y + a / 2, z + 0.5);
      m.setMatrixAt(k, mx);
      const [r, g, b] = colorBloque(this.mapa.bloque(x, y, z).Name);
      const v = 0.92 + ((x * 7 + y * 13 + z * 5) % 9) / 100;                 // un poco de variación, como textura
      col.setRGB(r / 255 * v, g / 255 * v, b / 255 * v, THREE.SRGBColorSpace); m.setColorAt(k, col);
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.bloques = m; this.esc3.add(m);
    // encuadre: desde arriba y un costado, mirando el centro de la zona
    const cx = (x0 + x1 + 1) / 2, cz = (z0 + z1 + 1) / 2, lado = Math.max(x1 - x0, z1 - z0) + 1;
    const ys = this.posiciones.filter((p) => p[0] >= x0 && p[0] <= x1 + 1 && p[2] >= z0 && p[2] <= z1 + 1).map((p) => p[1]);
    const cy = ys.length ? Math.min(...ys) : corte - 6;
    this.ctl.target.set(cx, cy, cz);
    this.cam3.position.set(cx + lado * 0.35, cy + lado * 0.6, cz + lado * 0.65);
    this.ctl.update();
    this._tam3d(); this._actualizar3d();
  }

  _figura(a) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.color(a.i)) });
    if (a.marca) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), mat); c.position.y = 0.3; g.add(c);
    } else {
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.35, 0.3), mat); cuerpo.position.y = 0.68; g.add(cuerpo);
      const cabeza = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat); cabeza.position.y = 1.6; g.add(cabeza);
      const nariz = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      nariz.position.set(0, 1.62, 0.3); g.add(nariz);                       // marca hacia dónde mira (+Z local)
    }
    // nombre arriba
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const c2 = cv.getContext('2d'); c2.font = 'bold 34px system-ui, sans-serif'; c2.textAlign = 'center';
    c2.fillStyle = '#000a'; c2.fillRect(0, 8, 256, 48); c2.fillStyle = '#fff'; c2.fillText(a.nombre === a.num ? a.num : `${a.i + 1} ${a.nombre}`.slice(0, 16), 128, 44);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
    sp.scale.set(1.6, 0.4, 1); sp.position.y = a.marca ? 1.0 : 2.3; g.add(sp);
    return g;
  }

  _actualizar3d() {
    if (!this.ren) return;
    if (this.grupoActores.children.length !== this.actores.length) {
      this.grupoActores.clear();
      for (const a of this.actores) this.grupoActores.add(this._figura(a));
    }
    this.actores.forEach((a, k) => {
      const q = this._pos(a.i), o = this.grupoActores.children[k];
      if (!q) { o.visible = false; return; }
      o.visible = q.vis; o.position.set(q.x, q.y, q.z); o.rotation.y = -rad(q.yaw);   // yaw de Minecraft -> giro en three
    });
    // cámara del guion: marcador amarillo, o el 3D mira por ella
    this.grupoCam.clear();
    const c = this._camara(this.t), ver = this.$('.vm-vercam').checked;
    if (c && ver) {
      this.ctl.enabled = false;
      this.cam3.position.set(c.x, c.y, c.z);
      const dir = new THREE.Vector3(-Math.sin(rad(c.yaw)) * Math.cos(rad(c.pitch)), -Math.sin(rad(c.pitch)), Math.cos(rad(c.yaw)) * Math.cos(rad(c.pitch)));
      this.cam3.lookAt(this.cam3.position.clone().add(dir)); this.cam3.fov = c.fov; this.cam3.updateProjectionMatrix();
      this._vioCam = true;
    } else {
      if (this._vioCam) { this._vioCam = false; this.ctl.enabled = true; this.cam3.fov = 60; this.cam3.updateProjectionMatrix(); this.ctl.update(); }
      if (c) {
        const p = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), new THREE.MeshBasicMaterial({ color: 0xffd34d, wireframe: true }));
        p.position.set(c.x, c.y, c.z);
        p.lookAt(new THREE.Vector3(c.x - Math.sin(rad(c.yaw)), c.y - Math.sin(rad(c.pitch)), c.z + Math.cos(rad(c.yaw))));
        p.rotateX(Math.PI / 2);                                            // la punta del cono hacia donde mira
        this.grupoCam.add(p);
      }
    }
    this._render();
  }

  // bloque bajo el mouse en el 3D: {x, y (arriba del bloque), z, nombre} (mundo) o null
  _bloqueBajo(ev) {
    if (!this.bloques) return null;
    const b = this.cv3d.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1), this.cam3);
    const h = ray.intersectObject(this.bloques)[0];
    if (!h || h.instanceId == null) return null;
    const [x, y, z, a] = this.datosBloques[h.instanceId];
    return { x: x + 0.5, y: y + a, z: z + 0.5, nombre: this.mapa.bloque(x, y, z).Name };
  }

  _clic3d(ev) {
    const h = this._bloqueBajo(ev);
    if (!h) return;
    const xyz = `${r2(h.x)} ${r2(h.y)} ${r2(h.z)}`;
    const [que, quien] = this.$('.vm-clic').value.split('|');
    if (que === 'coords') this.insertar(xyz + ' ');
    else if (que === 'ubica') this.insertar(`${quien} se ubica en ${xyz}\n`);
    else this.insertar(`${quien} ${que} hasta ${xyz}\n`);
  }

  _agregarCamara() {
    if (!this.bloques && !this.grilla) { this.$('.vm-ayuda-3d').textContent = 'Primero elegí una zona en el mapa y acomodá la vista 3D donde querés la cámara.'; return; }
    const p = this.cam3.position, dir = new THREE.Vector3(); this.cam3.getWorldDirection(dir);
    const yaw = deg(Math.atan2(-dir.x, dir.z)), pitch = -deg(Math.asin(Math.max(-1, Math.min(1, dir.y))));
    this.insertar(`cámara en ${r2(p.x)} ${r2(p.y)} ${r2(p.z)} yaw ${r1(yaw)} pitch ${r1(pitch)} fov ${Math.round(this.cam3.fov)}\n`);
  }
}
