// Ojos para BBS: skin -> modelo de ojos (geometría + textura + poses) ajustado a esos ojos.
import { zipSync, strToU8 } from '../visor/lib/fflate.js';
import { pngDeRGBA } from '../mocap/paquete_modelos.js';
import { guardarSalida } from '../comun/plataforma.js';
import * as N from './nucleo.js';

const $ = (s) => document.querySelector(s);
const estado = (t, cl = '') => { const e = $('#estado'); e.textContent = t; e.className = cl; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const deHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let skin = null;        // { nombre, w, h, rgba }
let cara = null;        // cara 8x8 con el sombrero encima
let cfg = null;         // { a, b, saliente, colores }
let res = null;         // lo último que se generó
let poseActiva = null;  // nombre de la pose que se ve en grande (null = reposo)
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
    $('#inNombre').value = 'eyes_' + base;
    buscar();
    $('#panelOjos').hidden = false; $('#vacio').hidden = true; $('#grande').hidden = false;
    estado('');
  } catch (e) { estado('No pude leer esa imagen: ' + (e.message || e), 'mal'); }
}

function buscar() {
  const o = N.detectarOjos(cara);
  const colores = N.coloresDeCara(cara, o);
  cfg = { a: o.a, b: o.b, saliente: 0, colores: null, avisos: o.avisos };
  $('#rgSaliente').value = 0; $('#txSaliente').textContent = '0 px';
  $('#chkColores').checked = false; $('#chkLisos').checked = false;
  $('#colPiel').value = hex(colores.piel); $('#colBlanco').value = hex(colores.blanco); $('#colCeja').value = hex(colores.ceja);
  armarGrilla('a'); armarGrilla('b');
  recalcular();
}

// ------------------------------------------------------------------ campos de los ojos
function armarGrilla(lado) {
  const g = $(lado === 'a' ? '#gridA' : '#gridB'); g.textContent = '';
  const celda = (t, cl = 'tit') => { const d = document.createElement('div'); d.className = cl; d.textContent = t; g.append(d); return d; };
  celda(''); celda('col desde'); celda('col hasta'); celda('fila desde'); celda('fila hasta');
  const num = (obj, k, luego = null) => {
    const i = document.createElement('input'); i.type = 'number'; i.min = 0; i.max = 7; i.step = 1; i.value = obj[k];
    i.onchange = () => { obj[k] = clamp(Math.round(+i.value || 0), 0, 7); i.value = obj[k]; if (luego) luego(); else { ordenar(lado); recalcular(); } };
    g.append(i); return i;
  };
  const o = cfg[lado];
  celda('Ojo', 'det'); num(o, 'c0'); num(o, 'c1'); num(o, 'r0'); num(o, 'r1');
  celda('Pupila', 'det'); num(o.p, 'c0'); num(o.p, 'c1'); num(o.p, 'r0'); num(o.p, 'r1');
  const lc = document.createElement('label'); lc.className = 'det';
  const ck = document.createElement('input'); ck.type = 'checkbox'; ck.checked = !!o.ceja; lc.append(ck, ' Ceja'); g.append(lc);
  const c = o.ceja || { c0: o.c0, c1: o.c1, r: Math.max(0, o.r0 - 1) };
  const caja = { c0: c.c0, c1: c.c1, r: c.r };
  const aplicar = () => {
    if (caja.c1 < caja.c0) [caja.c0, caja.c1] = [caja.c1, caja.c0];
    o.ceja = ck.checked ? { c0: caja.c0, c1: caja.c1, r: caja.r } : null;
    campos.forEach((i) => (i.disabled = !ck.checked));
    recalcular();
  };
  const campos = [num(caja, 'c0', aplicar), num(caja, 'c1', aplicar), num(caja, 'r', aplicar)];
  g.append(document.createElement('div'));
  ck.onchange = aplicar;
  campos.forEach((i) => (i.disabled = !ck.checked));
}

// que los números tengan sentido: desde <= hasta y la pupila adentro del ojo
function ordenar(lado) {
  const o = cfg[lado];
  if (o.c1 < o.c0) [o.c0, o.c1] = [o.c1, o.c0];
  if (o.r1 < o.r0) [o.r0, o.r1] = [o.r1, o.r0];
  const p = o.p;
  if (p.c1 < p.c0) [p.c0, p.c1] = [p.c1, p.c0];
  if (p.r1 < p.r0) [p.r0, p.r1] = [p.r1, p.r0];
  p.c0 = clamp(p.c0, o.c0, o.c1); p.c1 = clamp(p.c1, o.c0, o.c1); p.r0 = clamp(p.r0, o.r0, o.r1); p.r1 = clamp(p.r1, o.r0, o.r1);
  armarGrilla(lado);
}

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

function pintarCara(ctx, E) {
  ctx.imageSmoothingEnabled = false;
  const fondo = lienzoDe(8, 8, cara);
  ctx.drawImage(fondo, 0, 0, 8 * E, 8 * E);
}

function dibujar() {
  if (!res) return;
  const tex = lienzoDe(res.textura.w, res.textura.h, res.textura.rgba);
  const pose = (n) => (n && res.poses[n] ? res.poses[n].pose : null);
  const pintar = (cv, E, n) => {
    const cx = cv.getContext('2d'); cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
    pintarCara(cx, E); N.dibujarFrente(cx, tex, res.modelo, pose(n), E);
  };
  pintar($('#cvGrande'), 40, poseActiva);
  $('#txPose').textContent = poseActiva || 'Reposo';
  const s = $('#cvSkin').getContext('2d'); s.clearRect(0, 0, 320, 320); pintarCara(s, 40);
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

// ------------------------------------------------------------------ guardar
function archivos() {
  const nombre = nombreModelo(), base = `assets/models/player/${nombre}/`;
  const json = (o) => strToU8(JSON.stringify(o, null, '\t'));
  return {
    [base + 'config.json']: json(res.config),
    [base + nombre + '.bbs.json']: json(res.modelo),
    [base + 'poses.json']: json(res.poses),
    [base + 'textura.png']: pngDeRGBA(res.textura.w, res.textura.h, res.textura.rgba),
    'LEEME.txt': strToU8([
      `Ojos para BBS (Estudio BBS): ${nombre}`, '',
      'Copiá la carpeta "assets" de este zip adentro de tu carpeta bbs (la que tiene "assets" y "settings"). Se suma, no pisa nada tuyo.',
      `Queda: assets/models/player/${nombre}/`, '',
      `En BBS: al personaje agregale una parte hija de "head" con el modelo player/${nombre}. Las 20 poses (parpadeo, enojo, mirar a los costados...) aparecen en ese modelo.`,
      'Las poses se calcularon con reglas a partir de las del modelo original de ojos: probalas y retocá las que no te gusten.',
    ].join('\r\n')),
  };
}

async function guardar() {
  if (!res) return;
  try {
    const zip = zipSync(archivos(), { level: 6 });
    estado(await guardarSalida('ojos', nombreModelo() + '.zip', new Blob([zip], { type: 'application/zip' })), 'ok');
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

async function guardarEnCarpeta() {
  if (!res) return;
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'ojos-bbs', mode: 'readwrite' }); } catch (e) { if (e.name !== 'AbortError') estado('No se pudo abrir la carpeta: ' + e.message, 'mal'); return; }
  try {
    for (const [ruta, bytes] of Object.entries(archivos())) {
      if (ruta === 'LEEME.txt') continue;
      const partes = ruta.split('/'); let d = dir;
      for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(partes.at(-1), { create: true })).createWritable(); await w.write(bytes); await w.close();
    }
    estado(`Listo: quedó en "${dir.name}/assets/models/player/${nombreModelo()}". Si BBS estaba abierto, recargá los modelos.`, 'ok');
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

// ------------------------------------------------------------------ eventos
$('#inSkin').onchange = (e) => { if (e.target.files[0]) cargarSkin(e.target.files[0]); e.target.value = ''; };
const zona = $('#zona');
for (const ev of ['dragenter', 'dragover']) document.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); });
for (const ev of ['dragleave', 'drop']) document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === document.documentElement) zona.classList.remove('encima'); });
document.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) cargarSkin(f); });
$('#btnReanalizar').onclick = () => { if (cara) buscar(); };
$('#btnEspejo').onclick = () => {
  if (!cfg) return;
  const a = cfg.a, esp = (b) => ({ c0: 7 - b.c1, c1: 7 - b.c0, r0: b.r0, r1: b.r1 });
  cfg.b = { ...esp(a), p: esp(a.p), ceja: a.ceja ? { c0: 7 - a.ceja.c1, c1: 7 - a.ceja.c0, r: a.ceja.r } : null };
  armarGrilla('b'); recalcular();
};
$('#rgSaliente').oninput = (e) => { cfg.saliente = +e.target.value; $('#txSaliente').textContent = cfg.saliente + ' px'; recalcular(); };
$('#chkColores').onchange = () => recalcular();
$('#chkLisos').onchange = () => recalcular();
for (const id of ['#colPiel', '#colBlanco', '#colCeja']) $(id).oninput = () => { $('#chkColores').checked = true; recalcular(); };
$('#inNombre').oninput = () => recalcular();
$('#btnGuardar').onclick = guardar;
$('#btnCarpeta').onclick = guardarEnCarpeta;
$('#btnCarpeta').hidden = !window.showDirectoryPicker;
window.__ojos = { N, get res() { return res; }, get cfg() { return cfg; }, cargarSkin, recalcular };   // para las pruebas
