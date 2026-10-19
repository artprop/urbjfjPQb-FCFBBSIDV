// Línea de tiempo del Editor (dibujada en un canvas para que ande liviana en el celu).
// Filas: cámaras arriba y las pistas del actor elegido. Rombos = keyframes.
// Dedo: tocar la regla mueve el tiempo; tocar un rombo lo elige; arrastrarlo lo mueve;
// arrastrar en vacío desplaza; dos dedos (o rueda con Ctrl) hacen zoom.
const ALTO_REGLA = 24, ALTO_FILA = 30, ANCHO_NOMBRE = 92, RADIO = 7;

export class Linea {
  constructor(canvas, cb) {
    this.cv = canvas; this.cb = cb;   // cb: {tick(t), elegir(sel|null), mover(fila, desde, hasta), fila(id)}
    this.ppt = 5;          // píxeles por tick
    this.x0 = 0;           // primer tick visible
    this.y0 = 0;           // desplazamiento vertical de las filas (px)
    this.filas = [];       // [{id, nombre, ticks:[], barras:[{a, b, elegida, activa}], marca}]
    this.t = 0; this.fin = 200;
    this.sel = null;       // {fila, tick}
    this.punteros = new Map();
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => this._abajo(e));
    canvas.addEventListener('pointermove', (e) => this._mover(e));
    canvas.addEventListener('pointerup', (e) => this._arriba(e));
    canvas.addEventListener('pointercancel', (e) => this._arriba(e, true));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) this.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.offsetX);
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { this.x0 = Math.max(0, this.x0 + (e.deltaX || e.deltaY) / this.ppt); this.dibujar(); }
      else { this.y0 = this._limY(this.y0 + e.deltaY); this.dibujar(); }
    }, { passive: false });
    new ResizeObserver(() => this.dibujar()).observe(canvas);
  }

  poner(filas, t, fin, sel) { this.filas = filas; this.t = t; this.fin = fin; this.sel = sel; this.y0 = this._limY(this.y0); this.dibujar(); }
  ponerTick(t) {
    this.t = t;
    // que el cabezal no se salga de la vista mientras se reproduce
    const w = this.cv.clientWidth - ANCHO_NOMBRE, x = (t - this.x0) * this.ppt;
    if (x > w - 20) this.x0 = t - (w * 0.2) / this.ppt; else if (x < 0) this.x0 = Math.max(0, t - 2);
    this.dibujar();
  }
  zoom(f, px = null) {
    const cx = px === null ? (this.cv.clientWidth - ANCHO_NOMBRE) / 2 : px - ANCHO_NOMBRE;
    const tc = this.x0 + cx / this.ppt;
    this.ppt = Math.max(0.6, Math.min(40, this.ppt * f));
    this.x0 = Math.max(0, tc - cx / this.ppt); this.dibujar();
  }
  _limY(y) { return Math.max(0, Math.min(y, this.filas.length * ALTO_FILA - (this.cv.clientHeight - ALTO_REGLA))); }
  _xDe(t) { return ANCHO_NOMBRE + (t - this.x0) * this.ppt; }
  _tDe(x) { return this.x0 + (x - ANCHO_NOMBRE) / this.ppt; }
  _filaEn(y) { const i = Math.floor((y - ALTO_REGLA + this.y0) / ALTO_FILA); return y < ALTO_REGLA ? -1 : i < this.filas.length ? i : -2; }
  _rombo(x, y) {
    const i = this._filaEn(y); if (i < 0) return null;
    const f = this.filas[i]; let mejor = null, d = RADIO + 7;
    for (const t of f.ticks) { const dx = Math.abs(this._xDe(t) - x); if (dx < d) { d = dx; mejor = t; } }
    return mejor === null ? null : { fila: f.id, tick: mejor, i };
  }

  _pos(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  _abajo(e) {
    this.cv.setPointerCapture(e.pointerId);
    const p = this._pos(e);
    this.punteros.set(e.pointerId, p);
    if (this.punteros.size === 2) { const [a, b] = [...this.punteros.values()]; this.pinza = { d: Math.hypot(a.x - b.x, a.y - b.y), ppt: this.ppt, cx: (a.x + b.x) / 2 }; this.arr = null; return; }
    if (p.x < ANCHO_NOMBRE && p.y >= ALTO_REGLA) { const i = this._filaEn(p.y); this.arr = { tipo: 'nombre', p, i, movio: false, y0: this.y0 }; return; }
    if (p.y < ALTO_REGLA) { this.arr = { tipo: 'regla' }; this.cb.tick(Math.max(0, Math.round(this._tDe(p.x)))); return; }
    const r = this._rombo(p.x, p.y);
    if (r) { this.sel = r; this.cb.elegir(r); this.arr = { tipo: 'rombo', r, p, hasta: r.tick, movio: false }; this.dibujar(); return; }
    this.arr = { tipo: 'vacio', p, x0: this.x0, y0: this.y0, movio: false };
  }
  _mover(e) {
    if (!this.punteros.has(e.pointerId)) return;
    const p = this._pos(e); this.punteros.set(e.pointerId, p);
    if (this.pinza && this.punteros.size === 2) {
      const [a, b] = [...this.punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = this.pinza.cx - ANCHO_NOMBRE, tc = this.x0 + cx / this.ppt;
      this.ppt = Math.max(0.6, Math.min(40, this.pinza.ppt * d / Math.max(10, this.pinza.d)));
      this.x0 = Math.max(0, tc - cx / this.ppt); this.dibujar(); return;
    }
    const a = this.arr; if (!a) return;
    if (a.tipo === 'regla') { this.cb.tick(Math.max(0, Math.round(this._tDe(p.x)))); return; }
    if (a.tipo === 'rombo') {
      if (Math.abs(p.x - a.p.x) > 6) a.movio = true;
      if (!a.movio) return;
      a.hasta = Math.max(0, Math.round(this._tDe(p.x)));
      this.dibujar(); return;
    }
    if (a.tipo === 'vacio' || a.tipo === 'nombre') {
      const dx = p.x - a.p.x, dy = p.y - a.p.y;
      if (Math.hypot(dx, dy) > 6) a.movio = true;
      if (!a.movio) return;
      if (a.tipo === 'vacio') this.x0 = Math.max(0, a.x0 - dx / this.ppt);
      this.y0 = this._limY(a.y0 - dy); this.dibujar();
    }
  }
  _arriba(e, cancelado = false) {
    this.punteros.delete(e.pointerId);
    if (this.pinza) { if (this.punteros.size < 2) this.pinza = null; this.arr = null; return; }
    const a = this.arr; this.arr = null;
    if (!a || cancelado) { this.dibujar(); return; }
    if (a.tipo === 'rombo' && a.movio && a.hasta !== a.r.tick) {
      this.cb.mover(a.r.fila, a.r.tick, a.hasta);
      this.sel = { ...a.r, tick: a.hasta };
    } else if (a.tipo === 'rombo') this.cb.tick(a.r.tick);
    else if (a.tipo === 'vacio' && !a.movio) {
      const i = this._filaEn(a.p.y);
      this.sel = null; this.cb.elegir(null);
      this.cb.tick(Math.max(0, Math.round(this._tDe(a.p.x))));
      if (i >= 0 && this.cb.fila) this.cb.fila(this.filas[i].id);
    } else if (a.tipo === 'nombre' && !a.movio && a.i >= 0 && this.cb.fila) this.cb.fila(this.filas[a.i].id);
    this.dibujar();
  }

  dibujar() {
    const cv = this.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(cv);
    const C = (n, d) => css.getPropertyValue(n).trim() || d;
    const fondo = C('--lt-fondo', '#1b1d22'), fila2 = C('--lt-fila', '#22252b'), texto = C('--lt-texto', '#d8dbe2'), tenue = C('--lt-tenue', '#7d828c'), acento = C('--lt-acento', '#ffb340');
    g.fillStyle = fondo; g.fillRect(0, 0, w, h);
    // fin del film
    const xf = this._xDe(this.fin);
    g.save(); g.beginPath(); g.rect(ANCHO_NOMBRE, 0, w - ANCHO_NOMBRE, h); g.clip();
    if (xf < w) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(Math.max(ANCHO_NOMBRE, xf), ALTO_REGLA, w, h); }
    // filas
    for (let i = 0; i < this.filas.length; i++) {
      const y = ALTO_REGLA + i * ALTO_FILA - this.y0; if (y > h || y + ALTO_FILA < ALTO_REGLA) continue;
      const f = this.filas[i];
      if (i % 2) { g.fillStyle = fila2; g.fillRect(ANCHO_NOMBRE, y, w, ALTO_FILA); }
      if (f.marca) { g.fillStyle = 'rgba(255,179,64,0.08)'; g.fillRect(ANCHO_NOMBRE, y, w, ALTO_FILA); }
      for (const b of f.barras || []) {
        const xa = this._xDe(b.a), xb = this._xDe(b.b);
        g.fillStyle = b.elegida ? 'rgba(255,90,54,0.55)' : b.activa ? 'rgba(255,214,64,0.45)' : 'rgba(150,140,90,0.4)';
        g.fillRect(xa, y + 5, Math.max(2, xb - xa), ALTO_FILA - 10);
        if (b.titulo && xb - xa > 30) { g.fillStyle = texto; g.font = '11px system-ui, sans-serif'; g.fillText(b.titulo, xa + 4, y + 19, xb - xa - 8); }
      }
      const cy = y + ALTO_FILA / 2;
      for (const t of f.ticks) {
        let tt = t;
        const elegido = this.sel && this.sel.fila === f.id && this.sel.tick === t;
        if (elegido && this.arr && this.arr.tipo === 'rombo' && this.arr.movio) tt = this.arr.hasta;
        const x = this._xDe(tt); if (x < ANCHO_NOMBRE - RADIO || x > w + RADIO) continue;
        g.beginPath(); g.moveTo(x, cy - RADIO); g.lineTo(x + RADIO, cy); g.lineTo(x, cy + RADIO); g.lineTo(x - RADIO, cy); g.closePath();
        g.fillStyle = elegido ? '#ff5a36' : f.color || '#e8e2c8'; g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1; g.stroke();
      }
    }
    // regla
    g.fillStyle = fila2; g.fillRect(ANCHO_NOMBRE, 0, w, ALTO_REGLA);
    const paso = [1, 2, 5, 10, 20, 40, 100, 200, 400, 1000].find((p) => p * this.ppt >= 46) || 2000;
    g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
    for (let t = Math.floor(this.x0 / paso) * paso; this._xDe(t) < w; t += paso) {
      const x = this._xDe(t); if (x < ANCHO_NOMBRE) continue;
      g.fillStyle = tenue; g.fillRect(x, ALTO_REGLA - 7, 1, 7);
      g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x, ALTO_REGLA, 1, h);
      g.fillStyle = texto; g.fillText(t % 20 === 0 ? `${t / 20}s` : String(t), x + 3, 9);
    }
    // cabezal
    const xc = this._xDe(this.t);
    g.fillStyle = acento; g.fillRect(xc - 1, 0, 2, h);
    g.beginPath(); g.moveTo(xc - 6, 0); g.lineTo(xc + 6, 0); g.lineTo(xc, 9); g.fill();
    g.restore();
    // nombres
    g.fillStyle = fila2; g.fillRect(0, 0, ANCHO_NOMBRE, h);
    g.fillStyle = tenue; g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(`tick ${Math.round(this.t)}`, 6, 12);
    g.save(); g.beginPath(); g.rect(0, ALTO_REGLA, ANCHO_NOMBRE, h); g.clip(); g.textBaseline = 'middle';
    for (let i = 0; i < this.filas.length; i++) {
      const y = ALTO_REGLA + i * ALTO_FILA - this.y0; if (y > h || y + ALTO_FILA < ALTO_REGLA) continue;
      const f = this.filas[i];
      g.fillStyle = f.marca ? acento : f.sub ? tenue : texto;
      g.font = (f.titulo ? 'bold ' : '') + '12px system-ui, sans-serif';
      g.fillText(f.nombre, f.sub ? 14 : 6, y + ALTO_FILA / 2, ANCHO_NOMBRE - (f.sub ? 18 : 10));
    }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(ANCHO_NOMBRE - 1, 0, 1, h);
  }
}
