// Ojos para BBS: skin -> modelo de ojos (geometría + textura + poses) ajustado a esos ojos.
import { pngDeRGBA } from '../mocap/paquete_modelos.js';
import { guardarSalida, esPC } from '../comun/plataforma.js';
import * as N from './nucleo.js';

const $ = (s) => document.querySelector(s);
const estado = (t, cl = '') => { const e = $('#estado'); e.textContent = t; e.className = cl; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const deHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const PIEZAS = [['ojo', 'Ojo', '#6fd16a'], ['pupila', 'Pupila', '#ffd23f'], ['ceja', 'Ceja', '#4fc3f7']];
let skin = null;        // { nombre, w, h, rgba }
let cara = null;        // cara 8x8 con el sombrero encima (bytes RGBA)
let caraCv = null;      // la misma cara en un lienzo de 8x8
let cfg = null;         // { a, b, saliente, avisos }
let res = null;         // lo último que se generó
let poseActiva = null;  // nombre de la pose que se ve en grande (null = reposo)
let activo = { lado: 'a', pieza: 'ojo' };
let pendiente = 0;

// ------------------------------------------------------------------ cargar la skin
async function cargarSkin(archivo) {
  try {
    const img = await createImageBitmap(archivo);
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, img.width, img.height);
    if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) {
      estado(`Esa imagen mide ${img.width}×${img.height}. Una skin de Minecraft mide 64×64 (o 64×32). Probá con otra.`, 'mal'); return;
    }
    const base = archivo.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'personaje';
    skin = { nombre: base, w: img.width, h: img.height, rgba: new Uint8Array(d.data.buffer) };
    cara = N.caraDeSkin(skin.rgba, skin.w, skin.h);
    caraCv = lienzoDe(8, 8, cara);
    $('#inNombre').value = 'eyes_' + base;
    buscar();
    $('#panelOjos').hidden = false; $('#vacio').hidden = true; $('#grande').hidden = false; $('#notaVista').hidden = false;
    estado('');
  } catch (e) { estado('No pude leer esa imagen: ' + (e.message || e), 'mal'); }
}

function buscar() {
  const o = N.detectarOjos(cara);
  const colores = N.coloresDeCara(cara, o);
  cfg = { a: o.a, b: o.b, saliente: 0, avisos: o.avisos };
  $('#rgSaliente').value = 0; $('#txSaliente').textContent = '0 px';
  $('#chkColores').checked = false; $('#chkLisos').checked = false;
  $('#colPiel').value = hex(colores.piel); $('#colBlanco').value = hex(colores.blanco); $('#colCeja').value = hex(colores.ceja);
  armarPiezas(); armarGrilla('a'); armarGrilla('b');
  refrescar();
}

// ------------------------------------------------------------------ elegir qué corregir
function armarPiezas() {
  const g = $('#piezas'); g.textContent = '';
  const celda = (html) => { const d = document.createElement('div'); d.className = 'det'; d.innerHTML = html; g.append(d); };
  celda('');
  for (const [, nombre, color] of PIEZAS) celda(`<i style="background:${color}"></i>${nombre}`);
  for (const lado of ['a', 'b']) {
    celda(lado === 'a' ? 'Izquierda' : 'Derecha');
    for (const [pieza, nombre] of PIEZAS) {
      const b = document.createElement('button'); b.textContent = nombre; b.dataset.lado = lado; b.dataset.pieza = pieza;
      b.onclick = () => { activo = { lado, pieza }; marcarActivo(); dibujarEditor(); };
      g.append(b);
    }
  }
  marcarActivo();
}
function marcarActivo() {
  for (const b of $('#piezas').querySelectorAll('button')) b.classList.toggle('activo', b.dataset.lado === activo.lado && b.dataset.pieza === activo.pieza);
}

// ------------------------------------------------------------------ editar dibujando sobre la cara
const espejoCaja = (b) => ({ c0: 7 - b.c1, c1: 7 - b.c0, r0: b.r0, r1: b.r1 });
const otro = (lado) => (lado === 'a' ? 'b' : 'a');

// que la pupila quede adentro del ojo
function encajar(o) {
  const p = o.p;
  if (p.c1 < p.c0) [p.c0, p.c1] = [p.c1, p.c0];
  if (p.r1 < p.r0) [p.r0, p.r1] = [p.r1, p.r0];
  p.c0 = clamp(p.c0, o.c0, o.c1); p.c1 = clamp(p.c1, o.c0, o.c1); p.r0 = clamp(p.r0, o.r0, o.r1); p.r1 = clamp(p.r1, o.r0, o.r1);
}

function poner(lado, pieza, c0, c1, f0, f1) {
  const o = cfg[lado];
  if (pieza === 'ojo') { Object.assign(o, { c0, c1, r0: f0, r1: f1 }); encajar(o); }
  else if (pieza === 'pupila') { o.p = { c0, c1, r0: f0, r1: f1 }; encajar(o); }
  else o.ceja = { c0, c1, r: f0 };
}
function aplicarRect(c0, f0, c1, f1) {
  const a = Math.min(c0, c1), b = Math.max(c0, c1), t = Math.min(f0, f1), u = Math.max(f0, f1);
  poner(activo.lado, activo.pieza, a, b, t, u);
  if ($('#chkEspejo').checked) { const m = espejoCaja({ c0: a, c1: b, r0: t, r1: u }); poner(otro(activo.lado), activo.pieza, m.c0, m.c1, m.r0, m.r1); }
  cambio();
}

function mover(dx, dy) {
  const lados = $('#chkAmbos').checked ? ['a', 'b'] : [activo.lado];
  for (const lado of lados) {
    const o = cfg[lado];
    if (activo.pieza === 'ojo') {
      if (o.c0 + dx < 0 || o.c1 + dx > 7 || o.r0 + dy < 0 || o.r1 + dy > 7) continue;
      o.c0 += dx; o.c1 += dx; o.r0 += dy; o.r1 += dy;
      o.p.c0 += dx; o.p.c1 += dx; o.p.r0 += dy; o.p.r1 += dy;
      if (o.ceja && o.ceja.c0 + dx >= 0 && o.ceja.c1 + dx <= 7 && o.ceja.r + dy >= 0 && o.ceja.r + dy <= 7) { o.ceja.c0 += dx; o.ceja.c1 += dx; o.ceja.r += dy; }
    } else if (activo.pieza === 'pupila') {
      if (o.p.c0 + dx < o.c0 || o.p.c1 + dx > o.c1 || o.p.r0 + dy < o.r0 || o.p.r1 + dy > o.r1) continue;
      o.p.c0 += dx; o.p.c1 += dx; o.p.r0 += dy; o.p.r1 += dy;
    } else if (o.ceja && o.ceja.c0 + dx >= 0 && o.ceja.c1 + dx <= 7 && o.ceja.r + dy >= 0 && o.ceja.r + dy <= 7) {
      o.ceja.c0 += dx; o.ceja.c1 += dx; o.ceja.r += dy;
    }
  }
  cambio();
}

let arrastre = null;   // { c, f } celda donde empezó el dibujo
const lienzoEd = $('#cvEditor');
const celdaDe = (e) => {
  const r = lienzoEd.getBoundingClientRect();
  return { c: clamp(Math.floor(((e.clientX - r.left) / r.width) * 8), 0, 7), f: clamp(Math.floor(((e.clientY - r.top) / r.height) * 8), 0, 7) };
};
lienzoEd.addEventListener('pointerdown', (e) => {
  if (!cfg) return;
  lienzoEd.setPointerCapture(e.pointerId);
  const c = celdaDe(e); arrastre = c; aplicarRect(c.c, c.f, c.c, c.f);
});
lienzoEd.addEventListener('pointermove', (e) => { if (arrastre) { const c = celdaDe(e); aplicarRect(arrastre.c, arrastre.f, c.c, c.f); } });
for (const ev of ['pointerup', 'pointercancel']) lienzoEd.addEventListener(ev, () => { arrastre = null; });

function dibujarEditor() {
  if (!cfg) return;
  const E = 44, cx = lienzoEd.getContext('2d');
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, 8 * E, 8 * E);
  cx.imageSmoothingEnabled = false; cx.drawImage(caraCv, 0, 0, 8 * E, 8 * E);
  cx.strokeStyle = 'rgba(255,255,255,.14)'; cx.lineWidth = 1;
  for (let i = 1; i < 8; i++) { cx.beginPath(); cx.moveTo(i * E + .5, 0); cx.lineTo(i * E + .5, 8 * E); cx.moveTo(0, i * E + .5); cx.lineTo(8 * E, i * E + .5); cx.stroke(); }
  for (const lado of ['a', 'b']) {
    const o = cfg[lado];
    const cajas = { ojo: o, pupila: o.p, ceja: o.ceja ? { c0: o.ceja.c0, c1: o.ceja.c1, r0: o.ceja.r, r1: o.ceja.r } : null };
    for (const [pieza, , color] of PIEZAS) {
      const b = cajas[pieza]; if (!b) continue;
      const sel = lado === activo.lado && pieza === activo.pieza;
      const inset = pieza === 'ojo' ? 1 : pieza === 'pupila' ? 4 : 7;
      cx.lineWidth = sel ? 3 : 2; cx.strokeStyle = color; cx.setLineDash(sel ? [] : [5, 3]);
      cx.strokeRect(b.c0 * E + inset, b.r0 * E + inset, (b.c1 - b.c0 + 1) * E - 2 * inset, (b.r1 - b.r0 + 1) * E - 2 * inset);
      if (sel) { cx.fillStyle = color + '1c'; cx.fillRect(b.c0 * E + inset, b.r0 * E + inset, (b.c1 - b.c0 + 1) * E - 2 * inset, (b.r1 - b.r0 + 1) * E - 2 * inset); }
    }
  }
  cx.setLineDash([]);
}

// ------------------------------------------------------------------ números (avanzado)
function armarGrilla(lado) {
  const g = $(lado === 'a' ? '#gridA' : '#gridB'); g.textContent = '';
  const celda = (t, cl = 'tit') => { const d = document.createElement('div'); d.className = cl; d.textContent = t; g.append(d); return d; };
  celda(''); celda('col desde'); celda('col hasta'); celda('fila desde'); celda('fila hasta');
  const o = cfg[lado];
  const num = (obj, k, luego) => {
    const i = document.createElement('input'); i.type = 'number'; i.min = 0; i.max = 7; i.step = 1; i.value = obj[k];
    i.onchange = () => { obj[k] = clamp(Math.round(+i.value || 0), 0, 7); luego(); };
    g.append(i); return i;
  };
  const normal = () => {
    if (o.c1 < o.c0) [o.c0, o.c1] = [o.c1, o.c0];
    if (o.r1 < o.r0) [o.r0, o.r1] = [o.r1, o.r0];
    encajar(o); cambio();
  };
  celda('Ojo', 'det'); num(o, 'c0', normal); num(o, 'c1', normal); num(o, 'r0', normal); num(o, 'r1', normal);
  celda('Pupila', 'det'); num(o.p, 'c0', normal); num(o.p, 'c1', normal); num(o.p, 'r0', normal); num(o.p, 'r1', normal);
  const c = o.ceja || { c0: o.c0, c1: o.c1, r: Math.max(0, o.r0 - 1) };
  const caja = { c0: c.c0, c1: c.c1, r: c.r };
  const lc = document.createElement('label'); lc.className = 'det';
  const ck = document.createElement('input'); ck.type = 'checkbox'; ck.checked = !!o.ceja; lc.append(ck, ' Ceja'); g.append(lc);
  const aplicar = () => {
    if (caja.c1 < caja.c0) [caja.c0, caja.c1] = [caja.c1, caja.c0];
    o.ceja = ck.checked ? { c0: caja.c0, c1: caja.c1, r: caja.r } : null;
    campos.forEach((i) => (i.disabled = !ck.checked));
    refrescar();
  };
  const campos = [num(caja, 'c0', aplicar), num(caja, 'c1', aplicar), num(caja, 'r', aplicar)];
  g.append(document.createElement('div'));
  ck.onchange = aplicar;
  campos.forEach((i) => (i.disabled = !ck.checked));
}

// algo cambió en los ojos: rehacer los números, la vista y todo
function cambio() { armarGrilla('a'); armarGrilla('b'); refrescar(); }
function refrescar() { dibujarEditor(); recalcular(); }

// ------------------------------------------------------------------ generar y dibujar
function recalcular() {
  if (pendiente) return;
  pendiente = requestAnimationFrame(() => { pendiente = 0; hacer(); });
}

function nombreModelo() { return ($('#inNombre').value || 'eyes_nuevo').replace(/[^A-Za-z0-9_]+/g, '_'); }

function hacer() {
  if (!cara || !cfg) return;
  const colores = $('#chkColores').checked ? { piel: deHex($('#colPiel').value), blanco: deHex($('#colBlanco').value), ceja: deHex($('#colCeja').value) } : null;
  try { res = N.generar(cara, { a: cfg.a, b: cfg.b, saliente: cfg.saliente, colores, parpadosLisos: $('#chkLisos').checked, nombre: nombreModelo() }); }
  catch (e) { estado('No pude armar los ojos con esos números: ' + (e.message || e), 'mal'); return; }
  const av = cfg.avisos.length ? '\n⚠ ' + cfg.avisos.join('\n⚠ ') : '';
  $('#detectado').textContent = `Izquierda de la imagen: ${res.info.ojoA}.\nDerecha de la imagen: ${res.info.ojoB}.\nTextura de ${res.info.textura}.` + av;
  $('#detectado').style.whiteSpace = 'pre-wrap';
  if (!$('#chkColores').checked) { $('#colPiel').value = hex(res.colores.piel); $('#colBlanco').value = hex(res.colores.blanco); $('#colCeja').value = hex(res.colores.ceja); }
  dibujar();
}

const lienzoDe = (w, h, rgba) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0); return c; };

function dibujar() {
  if (!res) return;
  const tex = lienzoDe(res.textura.w, res.textura.h, res.textura.rgba);
  const huecos = [cfg.a, cfg.b];
  const pose = (n) => (n && res.poses[n] ? res.poses[n].pose : null);
  const pintar = (cv, E, n) => {
    const cx = cv.getContext('2d'); cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
    N.dibujarEscena(cx, { cara: caraCv, textura: tex, modelo: res.modelo, pose: pose(n), E, huecos });
  };
  pintar($('#cvGrande'), 44, poseActiva);
  $('#txPose').textContent = (poseActiva || 'Reposo') + ' · así lo ve BBS';
  const t = $('#cvTextura').getContext('2d'); t.clearRect(0, 0, 128, 128); t.imageSmoothingEnabled = false; t.drawImage(tex, 0, 0, 128, 128);
  const gal = $('#galeria');
  if (!gal.children.length) {
    for (const n of [null, ...N.NOMBRES_POSES]) {
      const d = document.createElement('div'); d.className = 'pose'; d.dataset.pose = n || '';
      const cv = document.createElement('canvas'); cv.width = cv.height = 96; d.append(cv, document.createTextNode(n || 'reposo'));
      d.onclick = () => { poseActiva = n; dibujar(); };
      gal.append(d);
    }
  }
  for (const d of gal.children) { d.classList.toggle('activa', (d.dataset.pose || null) === poseActiva); pintar(d.querySelector('canvas'), 12, d.dataset.pose || null); }
}

// ------------------------------------------------------------------ exportar
const MIME = { json: 'application/json', png: 'image/png' };
const tipoDe = (n) => MIME[n.split('.').pop()] || 'application/octet-stream';
const texto = (o) => new TextEncoder().encode(JSON.stringify(o, null, '\t'));
const pngBytes = () => pngDeRGBA(res.textura.w, res.textura.h, res.textura.rgba);

/** Los archivos de la carpeta del modelo. */
function archivosModelo() {
  const nombre = nombreModelo();
  return [['config.json', texto(res.config)], [nombre + '.bbs.json', texto(res.modelo)], ['poses.json', texto(res.poses)], ['textura.png', pngBytes()]];
}

async function exportarPng() {
  if (!res) return;
  try { estado(await guardarSalida('ojos', nombreModelo() + '.png', new Blob([pngBytes()], { type: 'image/png' })), 'ok'); }
  catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

async function exportarModelo() {
  if (!res) return;
  const nombre = nombreModelo(), arch = archivosModelo();
  try {
    if (await esPC()) {
      let donde = '';
      for (const [n, b] of arch) donde = await guardarSalida('ojos', n, new Blob([b], { type: tipoDe(n) }), tipoDe(n), nombre);
      const carpeta = donde.replace(/^Guardado en /, '').replace(/[\\/][^\\/]+$/, '');
      estado(`Listo: la carpeta quedó en ${carpeta}\nCopiala a config\\bbs\\assets\\models\\player.`, 'ok');
      return;
    }
    if (window.showDirectoryPicker) return elegirCarpeta();
    // celu: no se pueden crear carpetas
    const files = arch.map(([n, b]) => new File([b], n, { type: tipoDe(n) }));
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: nombre }); estado(`Compartidos los ${files.length} archivos. Ponelos juntos en una carpeta llamada ${nombre}.`, 'ok'); return; } catch (e) { if (e.name === 'AbortError') { estado('Cancelado.'); return; } }
    }
    for (const f of files) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      await new Promise((r) => setTimeout(r, 400));
    }
    estado(`Se bajaron ${files.length} archivos sueltos (en el celu no se pueden crear carpetas). Ponelos juntos en una carpeta llamada ${nombre}.`, 'ok');
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

// Elegís la carpeta (por ejemplo config\bbs\assets\models\player) y adentro se crea la carpeta del modelo
async function elegirCarpeta() {
  if (!res) return;
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'ojos-bbs', mode: 'readwrite' }); } catch (e) { if (e.name !== 'AbortError') estado('No se pudo abrir la carpeta: ' + e.message, 'mal'); return; }
  try {
    const nombre = nombreModelo(), sub = await dir.getDirectoryHandle(nombre, { create: true });
    for (const [n, b] of archivosModelo()) { const w = await (await sub.getFileHandle(n, { create: true })).createWritable(); await w.write(b); await w.close(); }
    estado(`Listo: la carpeta "${nombre}" quedó adentro de "${dir.name}". Si BBS estaba abierto, recargá los modelos.`, 'ok');
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

// ------------------------------------------------------------------ eventos
$('#inSkin').onchange = (e) => { if (e.target.files[0]) cargarSkin(e.target.files[0]); e.target.value = ''; };
const zona = $('#zona');
for (const ev of ['dragenter', 'dragover']) document.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); });
for (const ev of ['dragleave', 'drop']) document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === document.documentElement) zona.classList.remove('encima'); });
document.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) cargarSkin(f); });
$('#btnReanalizar').onclick = () => { if (cara) buscar(); };
for (const b of $('#flechas').querySelectorAll('button')) b.onclick = () => { if (cfg) { const [dx, dy] = b.dataset.d.split(',').map(Number); mover(dx, dy); } };
$('#btnSinCeja').onclick = () => {
  if (!cfg) return;
  cfg[activo.lado].ceja = null; if ($('#chkEspejo').checked) cfg[otro(activo.lado)].ceja = null;
  cambio();
};
$('#rgSaliente').oninput = (e) => { cfg.saliente = +e.target.value; $('#txSaliente').textContent = cfg.saliente + ' px'; recalcular(); };
$('#chkColores').onchange = () => recalcular();
$('#chkLisos').onchange = () => recalcular();
for (const id of ['#colPiel', '#colBlanco', '#colCeja']) $(id).oninput = () => { $('#chkColores').checked = true; recalcular(); };
$('#inNombre').oninput = () => recalcular();
$('#btnPng').onclick = exportarPng;
$('#btnModelo').onclick = exportarModelo;
$('#btnOtra').onclick = elegirCarpeta;
$('#btnOtra').hidden = !window.showDirectoryPicker;
window.__ojos = { N, get res() { return res; }, get cfg() { return cfg; }, cargarSkin, recalcular };   // para las pruebas
