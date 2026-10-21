// Crafteo de personajes (por ahora: ojos, cejas y máscaras de borrado): de la skin arma lo que le falta al personaje para animarlo.
import { pngDeRGBA } from '../mocap/paquete_modelos.js';
import { guardarSalida, esPC, abrirCarpetaSalida } from '../comun/plataforma.js';
import * as N from './nucleo.js';
import { crearVista3D } from './vista3d.js';

const $ = (s) => document.querySelector(s);
let tAviso = 0;
const estado = (t, cl = '') => { const e = $('#estado'); e.textContent = t; e.className = cl; clearTimeout(tAviso); if (t) tAviso = setTimeout(() => { e.textContent = ''; }, 9000); };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const deHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const PIEZAS = [['ojo', 'Ojo', '#6fd16a'], ['pupila', 'Pupila', '#ffd23f'], ['ceja', 'Ceja', '#4fc3f7']];
const CAPAS = [['boca', 'Boca', '#ff6ad5'], ['pestanas', 'Pestañas', '#ff9f43']];
let skin = null;        // { nombre, w, h, rgba, bytes }
let cara = null;        // cara 8x8 con el sombrero encima (bytes RGBA)
let caraCv = null;      // la misma cara en un lienzo de 8x8
let cfg = null;         // { a, b, saliente, avisos, mascaras: { ojos, boca, pestanas: [celdas] } }
let tocados = {};       // colores que el usuario cambió a mano (el resto sale de la skin)
let res = null;         // lo último que se generó
let poseActiva = null;  // nombre de la pose que se ve en grande (null = reposo)
let activo = { lado: 'a', pieza: 'ojo' };
let pendiente = 0, t3d = 0;
let estandar = null;    // { variante, dy } si los ojos son los de tu modelo estándar (eyes / eyes_1px)
const STOCK = {};       // los modelos estándar (para repintar la textura en su formato)
fetch(new URL('../mocap/datos/ojos/eyes/eyes.bbs.json', import.meta.url)).then((r) => r.json()).then((j) => { STOCK.eyes = j; recalcular(); }).catch(() => {});
fetch(new URL('../mocap/datos/ojos/eyes_1px/eyes_1px.bbs.json', import.meta.url)).then((r) => r.json()).then((j) => { STOCK.eyes_1px = j; recalcular(); }).catch(() => {});
let vista3d = null;

// ------------------------------------------------------------------ cargar la skin
async function cargarSkin(archivo) {
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, img.width, img.height);
    if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) {
      estado(`Esa imagen mide ${img.width}×${img.height}. Una skin de Minecraft mide 64×64 (o 64×32). Probá con otra.`, 'mal'); return;
    }
    const base = archivo.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'personaje';
    skin = { nombre: base, w: img.width, h: img.height, rgba: new Uint8Array(d.data.buffer), bytes };
    cara = N.caraDeSkin(skin.rgba, skin.w, skin.h);
    caraCv = lienzoDe(8, 8, cara);
    $('#inNombre').value = 'eyes_' + base;
    $('#inRutaSkin').value = `${N.USUARIO.carpeta}/${archivo.name.replace(/[^A-Za-z0-9_.\-]+/g, '_')}`;
    $('#selCuerpo').value = N.brazosFinos(skin.rgba, skin.w, skin.h) ? 'player/alex' : 'player/steve';
    if (!vista3d) vista3d = crearVista3D($('#cv3d'));
    buscar();
    $('#panelOjos').hidden = false; $('#vacio').hidden = true;
    for (const id of ['#btnPng', '#btnModelo', '#btnPersonaje', '#btnAjustes']) $(id).disabled = false;
    estado('');
  } catch (e) { estado('No pude leer esa imagen: ' + (e.message || e), 'mal'); }
}

function buscar() {
  const o = N.detectarOjos(cara);
  cfg = { a: o.a, b: o.b, saliente: 0, avisos: o.avisos, mascaras: { ojos: true, boca: null, pestanas: [] }, bocaSugerida: N.detectarBoca(cara, o) };   // la máscara de la boca arranca apagada: la prendés vos
  tocados = {};
  $('#rgSaliente').value = 0; $('#txSaliente').textContent = '0 px';
  $('#chkLisos').checked = false;
  armarPiezas(); armarGrilla('a'); armarGrilla('b'); sincronizarMascaras();
  refrescar();
}

// ------------------------------------------------------------------ elegir qué corregir
function armarPiezas() {
  const g = $('#piezas'); g.textContent = '';
  const boton = (lado, pieza, nombre, color, titulo) => {
    const b = document.createElement('button'); b.dataset.lado = lado; b.dataset.pieza = pieza;
    b.innerHTML = `<i style="background:${color}"></i>${nombre}`; b.title = titulo;
    b.onclick = () => { activo = { lado, pieza }; marcarActivo(); dibujarEditor(); };
    g.append(b);
  };
  for (const lado of ['a', 'b']) {
    const t = document.createElement('span'); t.textContent = lado === 'a' ? 'Izq' : 'Der'; g.append(t);
    for (const [pieza, nombre, color] of PIEZAS) boton(lado, pieza, nombre, color, `${nombre} del ojo de la ${lado === 'a' ? 'izquierda' : 'derecha'} de la imagen`);
  }
  const t = document.createElement('span'); t.textContent = 'Borrar'; g.append(t);
  for (const [pieza, nombre, color] of CAPAS) boton('x', pieza, nombre, color, pieza === 'boca' ? 'Máscara de borrado de la boca: arrastrá un rectángulo' : 'Máscara de borrado de las pestañas: pintá los píxeles (tocar de nuevo los saca)');
  marcarActivo();
}
function marcarActivo() {
  for (const b of $('#piezas').querySelectorAll('button')) b.classList.toggle('activo', b.dataset.lado === activo.lado && b.dataset.pieza === activo.pieza);
}

// ------------------------------------------------------------------ editar dibujando sobre la cara
const espejoCaja = (b) => ({ c0: 7 - b.c1, c1: 7 - b.c0, r0: b.r0, r1: b.r1 });
const otro = (lado) => (lado === 'a' ? 'b' : 'a');
const esCapa = () => activo.lado === 'x';

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
  if (activo.pieza === 'boca') { cfg.mascaras.boca = { c0: a, c1: b, r0: t, r1: u }; $('#chkMBoca').checked = true; cambio(); return; }
  poner(activo.lado, activo.pieza, a, b, t, u);
  if ($('#chkEspejo').checked) { const m = espejoCaja({ c0: a, c1: b, r0: t, r1: u }); poner(otro(activo.lado), activo.pieza, m.c0, m.c1, m.r0, m.r1); }
  cambio();
}

function mover(dx, dy) {
  if (esCapa()) {
    if (activo.pieza === 'boca' && cfg.mascaras.boca) {
      const m = cfg.mascaras.boca;
      if (m.c0 + dx >= 0 && m.c1 + dx <= 7 && m.r0 + dy >= 0 && m.r1 + dy <= 7) { m.c0 += dx; m.c1 += dx; m.r0 += dy; m.r1 += dy; }
    } else if (activo.pieza === 'pestanas') {
      const celdas = cfg.mascaras.pestanas.map((k) => [(k >> 3) + dy, (k & 7) + dx]);
      if (celdas.every(([f, c]) => f >= 0 && f <= 7 && c >= 0 && c <= 7)) cfg.mascaras.pestanas = celdas.map(([f, c]) => f * 8 + c);
    }
    cambio(); return;
  }
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

let arrastre = null;   // { c, f, poner } celda donde empezó el dibujo
const lienzoEd = $('#cvEditor');
const celdaDe = (e) => {
  const r = lienzoEd.getBoundingClientRect();
  return { c: clamp(Math.floor(((e.clientX - r.left) / r.width) * 8), 0, 7), f: clamp(Math.floor(((e.clientY - r.top) / r.height) * 8), 0, 7) };
};
function pintarPestana(c, f, poner) {
  const k = f * 8 + c, lista = cfg.mascaras.pestanas, i = lista.indexOf(k);
  if (poner && i < 0) lista.push(k); else if (!poner && i >= 0) lista.splice(i, 1);
  $('#chkMPest').checked = lista.length > 0;
  cambio();
}
lienzoEd.addEventListener('pointerdown', (e) => {
  if (!cfg) return;
  lienzoEd.setPointerCapture(e.pointerId);
  const c = celdaDe(e);
  if (activo.pieza === 'pestanas') { const poner = !cfg.mascaras.pestanas.includes(c.f * 8 + c.c); arrastre = { ...c, poner }; pintarPestana(c.c, c.f, poner); return; }
  arrastre = c; aplicarRect(c.c, c.f, c.c, c.f);
});
lienzoEd.addEventListener('pointermove', (e) => {
  if (!arrastre) return;
  const c = celdaDe(e);
  if (activo.pieza === 'pestanas') pintarPestana(c.c, c.f, arrastre.poner); else aplicarRect(arrastre.c, arrastre.f, c.c, c.f);
});
for (const ev of ['pointerup', 'pointercancel']) lienzoEd.addEventListener(ev, () => { arrastre = null; });

function sincronizarMascaras() {
  $('#chkMBoca').checked = !!cfg.mascaras.boca;
  $('#chkMPest').checked = cfg.mascaras.pestanas.length > 0;
  $('#chkMOjos').checked = cfg.mascaras.ojos;
}

function dibujarEditor() {
  if (!cfg) return;
  const E = 44, cx = lienzoEd.getContext('2d');
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, 8 * E, 8 * E);
  cx.imageSmoothingEnabled = false; cx.drawImage(caraCv, 0, 0, 8 * E, 8 * E);
  cx.strokeStyle = 'rgba(255,255,255,.14)'; cx.lineWidth = 1;
  for (let i = 1; i < 8; i++) { cx.beginPath(); cx.moveTo(i * E + .5, 0); cx.lineTo(i * E + .5, 8 * E); cx.moveTo(0, i * E + .5); cx.lineTo(8 * E, i * E + .5); cx.stroke(); }
  const marco = (b, color, inset, sel) => {
    const x = b.c0 * E + inset, y = b.r0 * E + inset, w = (b.c1 - b.c0 + 1) * E - 2 * inset, h = (b.r1 - b.r0 + 1) * E - 2 * inset;
    cx.lineWidth = sel ? 3 : 2; cx.strokeStyle = color; cx.setLineDash(sel ? [] : [5, 3]); cx.strokeRect(x, y, w, h);
    if (sel) { cx.fillStyle = color + '1c'; cx.fillRect(x, y, w, h); }
  };
  for (const lado of ['a', 'b']) {
    const o = cfg[lado];
    const cajas = { ojo: o, pupila: o.p, ceja: o.ceja ? { c0: o.ceja.c0, c1: o.ceja.c1, r0: o.ceja.r, r1: o.ceja.r } : null };
    for (const [pieza, , color] of PIEZAS) {
      const b = cajas[pieza]; if (!b) continue;
      marco(b, color, pieza === 'ojo' ? 1 : pieza === 'pupila' ? 4 : 7, lado === activo.lado && pieza === activo.pieza);
    }
  }
  if (cfg.mascaras.boca) marco(cfg.mascaras.boca, '#ff6ad5', 2, activo.pieza === 'boca');
  cx.setLineDash([]);
  for (const k of cfg.mascaras.pestanas) { cx.fillStyle = '#ff9f4366'; cx.fillRect((k & 7) * E + 3, (k >> 3) * E + 3, E - 6, E - 6); cx.strokeStyle = '#ff9f43'; cx.lineWidth = 2; cx.strokeRect((k & 7) * E + 3, (k >> 3) * E + 3, E - 6, E - 6); }
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
const personaje = () => nombreModelo().replace(/^eyes_/, '') || 'personaje';

/** ¿Se usa tu máscara de ojos (en vez de crear una)? */
const usaMia = () => !!(estandar && STOCK[estandar.variante] && $('#chkUsarMia').checked && $('#chkMOjos').checked);

/** Las celdas que se borran (huecos), según las máscaras que están prendidas. */
function celdasBorradas() {
  const c = N.celdasDeMascaras(cfg), todas = new Set();
  if ($('#chkMOjos').checked) (usaMia() ? N.celdasMascaraUsuario(estandar.dy) : c.ojos).forEach((k) => todas.add(k));
  if ($('#chkMBoca').checked) c.boca.forEach((k) => todas.add(k));
  if ($('#chkMPest').checked) c.pestanas.forEach((k) => todas.add(k));
  return todas;
}

function hacer() {
  if (!cara || !cfg) return;
  const colores = Object.keys(tocados).length ? { ...tocados } : null;
  try {
    res = N.generar(cara, { a: cfg.a, b: cfg.b, saliente: cfg.saliente, colores, parpadosLisos: $('#chkLisos').checked, pestanas: $('#chkMPest').checked ? cfg.mascaras.pestanas : [], nombre: nombreModelo() });
  } catch (e) { estado('No pude armar los ojos con esos números: ' + (e.message || e), 'mal'); return; }
  estandar = N.compararConEstandar(cfg);
  const av = cfg.avisos.length ? '\n⚠ ' + cfg.avisos.join('\n⚠ ') : '';
  const modo = estandar
    ? `\n✔ Ojos estándar: modelo ${estandar.variante}${estandar.dy ? ` (${Math.abs(estandar.dy)} fila${Math.abs(estandar.dy) > 1 ? 's' : ''} ${estandar.dy > 0 ? 'más abajo' : 'más arriba'})` : ''}; ${usaMia() ? `tu máscara AEsclerotica1x2${estandar.dy ? ' con shiftY ' + estandar.dy : ''}` : 'máscara nueva'}. Solo hace falta la textura.`
    : '\n• Ojos propios (no son los del modelo estándar): se arman modelo y máscara nuevos.';
  $('#detectado').textContent = `Izq: ${res.info.ojoA} · Der: ${res.info.ojoB}` + modo + av;
  for (const [k, id] of [['piel', '#colPiel'], ['blanco', '#colBlanco'], ['ceja', '#colCeja']]) if (!tocados[k]) $(id).value = hex(res.colores[k]);
  dibujar();
}

const lienzoDe = (w, h, rgba) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0); return c; };

function dibujar() {
  if (!res) return;
  const plana = estandar ? texturaDeOjos() : null;     // con tus ojos estándar se ve lo que sale: tu modelo con la textura lisa
  const tex = plana ? lienzoDe(plana.w, plana.h, plana.rgba) : lienzoDe(res.textura.w, res.textura.h, res.textura.rgba);
  const modelo = plana ? STOCK[plana.variante] : res.modelo, desvio = plana ? estandar.dy : 0;
  const huecos = [...celdasBorradas()].map((k) => ({ c0: k & 7, c1: k & 7, r0: k >> 3, r1: k >> 3 }));
  const pose = (n) => (n && res.poses[n] ? res.poses[n].pose : null);
  const pintar = (cv, E, n) => {
    const cx = cv.getContext('2d'); cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
    N.dibujarEscena(cx, { cara: caraCv, textura: tex, modelo, pose: pose(n), E, huecos, desvio });
  };
  pintar($('#cvGrande'), 44, poseActiva);
  $('#txPose').textContent = (poseActiva || 'Reposo') + ' · como en BBS';
  const t = $('#cvTextura').getContext('2d'); t.clearRect(0, 0, 128, 128); t.imageSmoothingEnabled = false; t.drawImage(tex, 0, 0, 128, 128);
  const gal = $('#galeria');
  if (!gal.children.length) {
    for (const n of [null, ...N.NOMBRES_POSES]) {
      const d = document.createElement('div'); d.className = 'pose'; d.dataset.pose = n || '';
      const cv = document.createElement('canvas'); cv.width = cv.height = 96; d.title = n || 'reposo'; d.append(cv, document.createTextNode(n ? n.replace('look_', '→').replace('thinking_', 'pienso ') : 'reposo'));
      d.onclick = () => { poseActiva = n; dibujar(); };
      gal.append(d);
    }
  }
  for (const d of gal.children) { d.classList.toggle('activa', (d.dataset.pose || null) === poseActiva); pintar(d.querySelector('canvas'), 12, d.dataset.pose || null); }
  // los ojos solos en 3D (un poco más tarde, así no se traba mientras dibujás)
  clearTimeout(t3d);
  t3d = setTimeout(() => { if (vista3d && res) vista3d.mostrar(res, nombreModelo(), poseActiva, plana ? { variante: plana.variante, modelo: STOCK[plana.variante], png: plana.bytes, dy: estandar.dy } : null).catch((e) => console.warn('vista 3D', e)); }, 150);
}

// ------------------------------------------------------------------ exportar
const MIME = { json: 'application/json', png: 'image/png' };
const tipoDe = (n) => MIME[n.split('.').pop()] || 'application/octet-stream';
const texto = (o) => new TextEncoder().encode(JSON.stringify(o, null, '\t'));
const pngBytes = () => pngDeRGBA(res.textura.w, res.textura.h, res.textura.rgba);

/** Los archivos de la carpeta del modelo de ojos. */
function archivosModelo() {
  const nombre = nombreModelo();
  return [['config.json', texto(res.config)], [nombre + '.bbs.json', texto(res.modelo)], ['poses.json', texto(res.poses)], ['textura.png', pngBytes()]];
}

/** Las máscaras de borrado prendidas: [{ path (ruta en BBS), shiftY?, archivo?, bytes? }] (si hay `bytes`, es un archivo nuevo que hay que guardar) */
function archivosMascaras() {
  const c = N.celdasDeMascaras(cfg), sombrero = $('#chkMSombrero').checked, lista = [];
  const car = ($('#inCarpeta').value || N.USUARIO.carpeta).replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
  const nuevo = (sufijo, celdas) => {
    if (!celdas.size) return;
    const archivo = `${personaje()}_${sufijo}.png`;
    lista.push({ path: `assets:models/${car}/${archivo}`, archivo, bytes: pngDeRGBA(skin.w, skin.h, N.mascaraRGBA(skin.w, skin.h, skin.rgba, celdas, sombrero)) });
  };
  if ($('#chkMOjos').checked) { if (usaMia()) lista.push({ path: N.USUARIO.mascaraOjos.ruta, ...(estandar.dy ? { shiftY: estandar.dy } : {}) }); else nuevo('Ojos', c.ojos); }
  if ($('#chkMBoca').checked) nuevo('Boca', c.boca);
  if ($('#chkMPest').checked) nuevo('Pestanas', c.pestanas);
  return lista;
}

const nombreTextura = () => 'Ojos' + personaje().replace(/(^|_)([a-z0-9])/g, (m, x, b) => b.toUpperCase()).replace(/_/g, '') + '.png';

/** La textura de los ojos en el diseño de tus modelos (eyes o eyes_1px) con un color liso por pieza, como las que hacés a mano. null si todavía no cargaron los modelos. */
function texturaDeOjos() {
  const variante = estandar ? estandar.variante : ((cfg.a.r1 - cfg.a.r0 + 1) >= 2 ? 'eyes' : 'eyes_1px');
  if (!STOCK[variante]) return null;
  const col = N.coloresEstandar(cara, cfg, Object.keys(tocados).length ? { ...tocados } : null);
  const t = N.texturaPlana(STOCK[variante], col);
  return { variante, w: t.w, h: t.h, rgba: t.rgba, bytes: pngDeRGBA(t.w, t.h, t.rgba) };
}

/** Cómo van los ojos en el form: con tu modelo estándar solo cambia la textura; si no, un modelo propio. */
function ojosDelPersonaje() {
  const nombre = nombreModelo();
  const t = estandar && texturaDeOjos();
  if (t) {
    const archivo = nombreTextura();
    return { modelo: 'player/' + t.variante, textura: `assets:models/player/${t.variante}/${archivo}`, bajar: estandar.dy,
      archivos: [{ ruta: `assets/models/player/${t.variante}/${archivo}`, bytes: t.bytes }] };
  }
  return { modelo: 'player/' + nombre, textura: `assets:models/player/${nombre}/textura.png`, bajar: 0,
    archivos: archivosModelo().map(([n, b]) => ({ ruta: `assets/models/player/${nombre}/${n}`, bytes: b })) };
}

/** Todo el personaje: [{ ruta, bytes }] con rutas relativas a la carpeta del personaje (assets/models/...). */
function archivosPersonaje() {
  const masc = archivosMascaras(), ojos = ojosDelPersonaje();
  const rutaSkin = ($('#inRutaSkin').value || `${N.USUARIO.carpeta}/${personaje()}.png`).replace(/^\/+/, '').replace(/\\/g, '/');
  const form = N.formPersonaje({
    nombre: personaje(), modeloBase: $('#selCuerpo').value, rutaSkin: `assets:models/${rutaSkin}`, capas: masc.map((m) => ({ path: m.path, shiftY: m.shiftY })),
    modeloOjos: ojos.modelo, texturaOjos: ojos.textura, bajarOjos: ojos.bajar,
  });
  const out = [{ ruta: 'personaje.json', bytes: texto(form) }];
  if ($('#chkIncluirSkin').checked) out.push({ ruta: `assets/models/${rutaSkin}`, bytes: skin.bytes });
  for (const m of masc) if (m.bytes) out.push({ ruta: m.path.replace(/^assets:/, 'assets/'), bytes: m.bytes });
  out.push(...ojos.archivos);
  return out;
}

async function exportarPng() {
  if (!res) return;
  const t = texturaDeOjos();
  const nombre = t ? nombreTextura() : nombreModelo() + '.png', bytes = t ? t.bytes : pngBytes();
  try {
    let msg = await guardarSalida('ojos', nombre, new Blob([bytes], { type: 'image/png' }));
    if (t) msg += `\nTextura en el diseño de ${t.variante}${estandar ? '' : ' (tus ojos no son del todo los estándar: se adaptó)'}: va en assets/models/player/${t.variante}/.`;
    estado(msg, 'ok');
    if (await esPC()) abrirCarpetaSalida('ojos', nombre);
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

// archivos: [{ ruta, bytes }] (rutas con subcarpetas); carpeta: nombre de la carpeta que se crea; ayuda: qué hacer después
async function exportar(archivos, carpeta, ayuda, forzarSelector = false) {
  try {
    if (!forzarSelector && await esPC()) {
      for (const a of archivos) {
        const partes = a.ruta.split('/'), n = partes.pop();
        await guardarSalida('ojos', n, new Blob([a.bytes], { type: tipoDe(n) }), tipoDe(n), [carpeta, ...partes].join('/'));
      }
      estado(`Listo: ${archivos.length} archivos en la carpeta Salida\\ojos\\${carpeta}\n${ayuda}`, 'ok');
      abrirCarpetaSalida('ojos', '', carpeta);
      return;
    }
    if (window.showDirectoryPicker) return elegirCarpeta(archivos, carpeta, ayuda);
    // celu: no se pueden crear carpetas
    const files = archivos.map((a) => new File([a.bytes], a.ruta.split('/').pop(), { type: tipoDe(a.ruta) }));
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: carpeta }); estado(`Compartidos ${files.length} archivos. En el celu no se arman carpetas: ordenalos como dice la ayuda.`, 'ok'); return; } catch (e) { if (e.name === 'AbortError') { estado('Cancelado.'); return; } }
    }
    for (const f of files) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      await new Promise((r) => setTimeout(r, 400));
    }
    estado(`Se bajaron ${files.length} archivos sueltos (en el celu no se pueden crear carpetas). Ordenalos como dice la ayuda.`, 'ok');
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

// Elegís una carpeta (por ejemplo tu config\bbs) y adentro se crea la del modelo/personaje
async function elegirCarpeta(archivos, carpeta, ayuda) {
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'ojos-bbs', mode: 'readwrite' }); } catch (e) { if (e.name !== 'AbortError') estado('No se pudo abrir la carpeta: ' + e.message, 'mal'); return; }
  try {
    const raiz = await dir.getDirectoryHandle(carpeta, { create: true });
    for (const a of archivos) {
      const partes = a.ruta.split('/'); let d = raiz;
      for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(partes.at(-1), { create: true })).createWritable(); await w.write(a.bytes); await w.close();
    }
    estado(`Listo: la carpeta "${carpeta}" quedó adentro de "${dir.name}".\n${ayuda}`, 'ok');
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

const AYUDA_OJOS = 'Copiala a config\\bbs\\assets\\models\\player.';
const AYUDA_PERSONAJE = 'Copiá «assets» adentro de tu carpeta bbs (la que tiene assets y settings) e importá personaje.json en BBS (forms).';
const exportarModelo = () => { if (res) exportar(archivosModelo().map(([n, b]) => ({ ruta: n, bytes: b })), nombreModelo(), AYUDA_OJOS); };
const exportarPersonaje = (forzar = false) => { if (res && skin) exportar(archivosPersonaje(), personaje(), AYUDA_PERSONAJE, forzar === true); };

// ------------------------------------------------------------------ eventos
$('#inSkin').onchange = (e) => { if (e.target.files[0]) cargarSkin(e.target.files[0]); e.target.value = ''; };
const zona = $('#zona');
for (const ev of ['dragenter', 'dragover']) document.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); });
for (const ev of ['dragleave', 'drop']) document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === document.documentElement) zona.classList.remove('encima'); });
document.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) cargarSkin(f); });
$('#btnReanalizar').onclick = () => { if (cara) buscar(); };
for (const b of $('#flechas').querySelectorAll('button')) b.onclick = () => { if (cfg) { const [dx, dy] = b.dataset.d.split(',').map(Number); mover(dx, dy); } };
$('#btnSinCeja').onclick = () => {
  if (!cfg || esCapa()) return;
  cfg[activo.lado].ceja = null; if ($('#chkEspejo').checked) cfg[otro(activo.lado)].ceja = null;
  cambio();
};
// asignar cejas a los dos ojos (aunque la skin no las tenga): arriba del ojo, del ancho del ojo
$('#btnConCeja').onclick = () => {
  if (!cfg) return;
  for (const lado of ['a', 'b']) { const o = cfg[lado]; o.ceja = { c0: o.c0, c1: o.c1, r: Math.max(0, o.r0 - 1) }; }
  activo = { lado: 'a', pieza: 'ceja' }; marcarActivo();
  cambio();
  estado('Cejas asignadas. Movelas con las flechas o dibujalas de nuevo sobre la cara; el color lo cambiás en ⚙ Ajustes.');
};
$('#rgSaliente').oninput = (e) => { cfg.saliente = +e.target.value; $('#txSaliente').textContent = cfg.saliente + ' px'; recalcular(); };
$('#chkLisos').onchange = () => recalcular();
for (const [k, id] of [['piel', '#colPiel'], ['blanco', '#colBlanco'], ['ceja', '#colCeja']]) $(id).oninput = () => { tocados[k] = deHex($(id).value); recalcular(); };
$('#btnColoresAuto').onclick = () => { tocados = {}; recalcular(); };
$('#chkMOjos').onchange = () => { cfg.mascaras.ojos = $('#chkMOjos').checked; recalcular(); };
$('#chkUsarMia').onchange = () => recalcular();
$('#chkMBoca').onchange = () => {
  if (!cfg.mascaras.boca && $('#chkMBoca').checked) cfg.mascaras.boca = cfg.bocaSugerida || { c0: 2, c1: 5, r0: 6, r1: 6 };   // la que se detectó, o 4 píxeles
  if (!$('#chkMBoca').checked) cfg.mascaras.boca = null;
  dibujarEditor(); recalcular();
};
$('#chkMPest').onchange = () => {
  if (!$('#chkMPest').checked) cfg.mascaras.pestanas = [];
  else if (!cfg.mascaras.pestanas.length) estado('Elegí «Pestañas» y pintá sobre la cara los píxeles de las pestañas de la skin.');
  dibujarEditor(); recalcular();
};
$('#chkMSombrero').onchange = () => recalcular();
$('#inNombre').oninput = () => recalcular();
$('#btnPng').onclick = exportarPng;
$('#btnModelo').onclick = exportarModelo;
$('#btnPersonaje').onclick = () => exportarPersonaje(false);
$('#btnOtra').onclick = () => exportarPersonaje(true);
$('#btnOtra').hidden = !window.showDirectoryPicker;
const hoja = $('#hoja');
$('#btnAjustes').onclick = () => { hoja.hidden = false; };
$('#btnCerrar').onclick = () => { hoja.hidden = true; };
hoja.addEventListener('pointerdown', (e) => { if (e.target === hoja) hoja.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hoja.hidden = true; });
window.__ojos = { N, get res() { return res; }, get cfg() { return cfg; }, cargarSkin, recalcular, archivosPersonaje, archivosMascaras, ojosDelPersonaje, texturaDeOjos, STOCK, get estandar() { return estandar; } };   // para las pruebas
