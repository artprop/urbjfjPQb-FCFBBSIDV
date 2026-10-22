// Editor BBS: animar personajes, poses, cámaras y escenas como en el mod BBS, pero en el celu o la PC.
// Guarda films de BBS 2.2 (.dat) que se copian a saves\<mundo>\bbs\films en la PC.
import * as THREE from '../visor/lib/three.module.min.js';
import { Fuente } from '../visor/fuente.js';
import { Texturas, Modelos, Forms, nombreForm } from '../visor/bbs.js';
import { Miniaturas } from '../visor/escena.js';
import { leer, escribir, clonar, num, F, D, I, Num } from '../mocap/nucleo/bbsdat.js';
import { guardarSalida, avisarMenu } from '../comun/plataforma.js';
import * as FM from './nucleo/film.js';
import * as P from './nucleo/pistas.js';
import * as A from './almacen.js';
import { Vista } from './vista.js';
import { Linea } from './linea.js';
import { panelDirector, reiniciarDirector } from './director.js';
import * as FSM from './nucleo/fs.js';
import * as auto from './autocam.js';

const $ = (s) => document.querySelector(s);
const D2R = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100;
// cambia un número del film conservando su tipo de BBS (int, float, double)
function fijar(o, k, v, tipo = D) { o[k] = o[k] instanceof Num ? new Num(o[k].code, v) : tipo(v); }
const cmp = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) e.append(h.nodeType ? h : document.createTextNode(String(h)));
  return e;
}

// ------------------------------------------------------------------ motores (los del Visor)
const fuente = new Fuente();
let tex, modelos, forms;
function motores() { tex = new Texturas(fuente); modelos = new Modelos(fuente, tex); forms = new Forms(modelos, tex); }
async function cargarInterno() {
  const base = new URL('../visor/builtin/', location.href);
  try {
    const lista = await (await fetch(new URL('index.json', base))).json();
    for (const p of lista) fuente.interno.set('assets/' + p, () => fetch(new URL(p.split('/').map(encodeURIComponent).join('/'), base)).then((r) => (r.ok ? r.blob() : null)));
  } catch { /* sin modelos internos */ }
  fuente._rutas = null;
}
motores();
const recursos = { get forms() { return forms; }, get modelos() { return modelos; } };
const minis = new Miniaturas(128);

// ------------------------------------------------------------------ estado
const E = {
  film: null, plantilla: null, id: null, nombre: 'mi_escena', fs: null,   // fs: si el film abierto es de BBS FS (ver nucleo/fs.js)
  t: 0, i: -1, hueso: null, toma: null, key: null,
  modo: 'mover', panel: 'actores', eje: 'xz', play: false, porCamara: false, iman: false,
};
const rep = () => (E.film && E.film.replays[E.i]) || null;
const tk = () => Math.round(E.t);

const vista = new Vista($('#escena'), recursos);
const linea = new Linea($('#linea'), {
  tick: (t) => irA(t),
  elegir: (s) => { E.key = s; herramientasKey(); },
  mover: (fila, desde, hasta) => moverKeys(fila, desde, hasta),
  fila: (id) => tocarFila(id),
});

function aviso(txt, error = false, ms = 3500) {
  const a = $('#aviso'); a.textContent = txt; a.classList.toggle('error', error); a.hidden = false;
  clearTimeout(aviso._t); aviso._t = setTimeout(() => { a.hidden = true; }, ms);
}

// ------------------------------------------------------------------ deshacer
const pila = [], pilaRehacer = [];
function foto() { return { film: clonar(E.film), i: E.i, toma: (E.film.camera || []).indexOf(E.toma) }; }
function guardarDeshacer() { pila.push(foto()); if (pila.length > 60) pila.shift(); pilaRehacer.length = 0; botonesDeshacer(); }
async function volver(de, a) {
  const f = de.pop(); if (!f) return;
  a.push(foto());
  E.film = f.film; E.i = f.i; E.toma = f.toma >= 0 ? E.film.camera[f.toma] : null; E.key = null;
  if (!rep()) { E.i = -1; E.hueso = null; }
  auto.alDeshacer();
  await refrescar({ rearmar: true });
  botonesDeshacer();
}
function botonesDeshacer() { $('#btnDeshacer').disabled = !pila.length; $('#btnRehacer').disabled = !pilaRehacer.length; }

// ------------------------------------------------------------------ dibujar
function fin() { return Math.max(60, Math.ceil(FM.duracion(E.film))); }
function aplicar() {
  vista.aplicar(E.film, E.t);
  const act = FM.tomaActiva(E.film, E.t);
  vista.ponerTomas(FM.tomas(E.film).map((c) => ({ c, vista: FM.vistaToma(c, E.t), activa: c === act, elegida: c === E.toma })));
  vista.porToma = E.porCamara && act ? FM.vistaToma(act, E.t) : null;
  $('#reloj').textContent = (E.t / FM.TICKS).toFixed(2) + ' s';
  const r = rep();
  let info = '';
  if (E.porCamara) info = act ? `🎥 ${act.title || 'Cámara'}` : '🎥 No hay cámara en este momento';
  else if (r) info = `${FM.nombre(r, E.i)}${E.hueso ? ' · ' + E.hueso : ''}`;
  $('#infoSel').textContent = info;
}
function dibujarLinea() {
  const filas = [];
  const act = FM.tomaActiva(E.film, E.t);
  const ts = FM.tomas(E.film);
  filas.push({
    id: 'tomas', nombre: '🎥 Cámaras', titulo: true, color: '#ffd640',
    ticks: E.toma ? FM.ticksToma(E.toma) : [],
    barras: ts.map((c) => ({ a: num(c.tick ?? 0), b: num(c.tick ?? 0) + num(c.duration ?? 0), activa: c === act, elegida: c === E.toma, titulo: c.title || '' })),
  });
  if (auto.activo()) filas.push({ id: 'cortes', nombre: '✂ Cortes', titulo: true, color: '#ff7ab0', ticks: auto.ticksCortes() });
  const r = rep();
  if (r) {
    const fs = FM.filas(r);
    filas.push({ id: 'actor', nombre: '👤 ' + FM.nombre(r, E.i), titulo: true, ticks: [...new Set(fs.flatMap((f) => f.ticks))].sort((a, b) => a - b), color: '#9fd0ff' });
    for (const f of fs) filas.push({ ...f, sub: true, marca: f.id === 'pose:' + E.hueso });
  } else {
    E.film.replays.forEach((x, i) => filas.push({ id: 'a:' + i, nombre: '👤 ' + FM.nombre(x, i), ticks: [...new Set(FM.filas(x).flatMap((f) => f.ticks))].sort((a, b) => a - b), color: '#9fd0ff' }));
  }
  linea.poner(filas, E.t, fin(), E.key);
}
async function refrescar({ rearmar = false, panel = true } = {}) {
  if (rearmar) { await vista.sincronizar(E.film); ponerPiso(); }
  vista.pasosViejos();
  vista.elegir(rep(), E.hueso);
  aplicar(); dibujarLinea(); herramientasKey();
  if (panel) dibujarPanel();
  autoguardar();
}
function irA(t) {
  E.t = Math.max(0, t);
  aplicar(); linea.ponerTick(E.t);
  if (audio && !E.play) audio.currentTime = E.t / FM.TICKS;
  refrescarValores();
}

// ------------------------------------------------------------------ ubicar la vista
// el piso va a la altura de los pies más bajos (los films de BBS están en coordenadas del mundo)
function ponerPiso() {
  const ys = E.film.replays.map((r) => FM.estado(r, 0).y).filter(Number.isFinite);
  vista.piso.position.y = ys.length ? Math.min(...ys) : 0;
}
// la vista apunta al actor (o a todos) sin cambiar desde qué lado se mira
function enfocar(r = null, todos = false) {
  const lista = r ? [r] : E.film.replays;
  if (!lista.length) return;
  const ps = lista.map((x) => FM.estado(x, E.t));
  // centro = mediana (si alguno quedó lejos, no arrastra la vista); radio = los que están cerca
  const med = (k) => { const v = ps.map((e) => e[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const c = [med('x'), med('y'), med('z')];
  const radio = Math.max(2, ...ps.map((e) => Math.hypot(e.x - c[0], e.z - c[2])).filter((d) => d < 24));
  vista.piso.position.x = Math.round(c[0]); vista.piso.position.z = Math.round(c[2]);
  const o = vista.orbita, cam = vista.camara;
  const off = cam.position.clone().sub(o.target);
  const dist = todos || r === null ? radio * 2.4 + 3 : Math.min(Math.max(off.length(), 3), 6);
  off.setLength(dist);
  o.target.set(c[0], c[1] + 1, c[2]); cam.position.copy(o.target).add(off); o.update();
}

// ------------------------------------------------------------------ autoguardado
let tGuardar = null;
function autoguardar() {
  clearTimeout(tGuardar);
  if (E.fs) return;       // los films de BBS FS no se guardan solos acá (se exportan: la copia de adentro no sabe de todo lo del film)
  tGuardar = setTimeout(async () => {
    try { E.id = await A.guardarFilm(E.id, E.nombre, FM.paraGuardar(E.film)); await A.kvGuardar('ultimo', E.id); } catch (e) { console.warn('no se pudo autoguardar', e); }
  }, 800);
}

// ------------------------------------------------------------------ reproducir
let audio = null, ultimo = 0, audioArchivo = null;
function play(si = !E.play) {
  E.play = si;
  $('#btnPlay').textContent = si ? '⏸' : '▶';
  if (si) {
    if (E.t >= fin()) E.t = 0;
    ultimo = performance.now();
    if (audio) { audio.currentTime = E.t / FM.TICKS; audio.play().catch(() => {}); }
    requestAnimationFrame(cuadro);
  } else {
    if (audio) audio.pause();
    E.t = Math.round(E.t); irA(E.t); dibujarPanel();
  }
}
function cuadro(ahora) {
  if (!E.play) return;
  const dt = Math.min(0.1, (ahora - ultimo) / 1000); ultimo = ahora;
  E.t = audio && !audio.paused ? audio.currentTime * FM.TICKS : E.t + dt * FM.TICKS;
  if (E.t >= fin()) { E.t = 0; if (audio) audio.currentTime = 0; }
  aplicar(); linea.ponerTick(E.t);
  requestAnimationFrame(cuadro);
}

// ------------------------------------------------------------------ elegir
function elegirActor(i, hueso = null) {
  const cambio = i !== E.i;
  E.i = i; E.hueso = i >= 0 ? hueso : null;
  if (cambio) E.key = null;
  if (i >= 0 && E.panel === 'camaras') E.panel = 'actores';
  vista.elegir(rep(), E.hueso);
  dibujarLinea(); dibujarPanel(); aplicar();
}
function elegirToma(c) {
  E.toma = c; E.key = null;
  if (c) { E.panel = 'camaras'; E.i = -1; E.hueso = null; vista.elegir(null); }
  aplicar(); dibujarLinea(); dibujarPanel();
}
function tocarFila(id) {
  if (id.startsWith('a:')) elegirActor(Number(id.slice(2)));
  else if (id.startsWith('pose:')) elegirActor(E.i, id.slice(5));
  else if (id === 'tomas') {
    const c = FM.tomas(E.film).filter((x) => E.t >= num(x.tick ?? 0) && E.t <= num(x.tick ?? 0) + num(x.duration ?? 0)).pop();
    if (c) elegirToma(c);
  }
}

// huesos que se muestran para posar (los ocultos de BBS y los de IK no; la punta "x.end" de los brazos de emoticons sí: es la mano)
async function huesosDe(r) {
  if (!r || !r.form || r.form.id !== 'bbs:model') return [];
  const d = await modelos.datos(r.form.model || '');
  if (!d) return [];
  const ocultos = (d.config && d.config.bones) || {};
  const sirve = (h) => !(ocultos[h] && ocultos[h].hidden) && !/^(controller_|pole_|ik_|armor_|misc_)|(_item|_end)$|^anchor/.test(h);
  if (d.bobj && d.bobj.huesos.length) return d.bobj.huesos.map((h) => h.n).filter(sirve);   // modelos con armadura (emoticons): brazo, antebrazo y punta (la mano)
  if (!d.modelo) return [];
  return [...d.modelo.grupos.keys()].filter(sirve);
}
async function huesoTocable(r, h) {
  if (!h) return null;
  const d = await modelos.datos(r.form.model || '');
  const cfg = ((d && d.config && d.config.bones) || {})[h];
  if (cfg && cfg.picking) return cfg.picking;
  const lista = await huesosDe(r);
  // subir hasta un hueso que se pueda posar
  const padre = d && d.bobj && d.bobj.huesos.length
    ? (x) => { const q = d.bobj.huesos.find((b) => b.n === x); return q && q.p; }
    : (x) => { const g = d.modelo.grupos.get(x); return g && g.parent; };
  let x = h;
  while (x && !lista.includes(x)) x = padre(x);
  return x || null;
}

// ------------------------------------------------------------------ editar (todo pone keyframe en el tick actual)
function ponerPos(r, x, y, z) {
  if (E.iman) { x = Math.round(x * 2) / 2; z = Math.round(z * 2) / 2; }
  FM.ponerProp(r, 'x', tk(), r2c(x)); FM.ponerProp(r, 'y', tk(), r2c(y)); FM.ponerProp(r, 'z', tk(), r2c(z));
}
const r2c = (v) => Math.round(v * 1000) / 1000;
function ponerGiro(r, yaw) {
  const e = FM.estado(r, E.t);
  const rel = difAng(e.cabeza, e.cuerpo);
  FM.ponerProp(r, 'yaw', tk(), r2c(yaw)); FM.ponerProp(r, 'bodyYaw', tk(), r2c(yaw)); FM.ponerProp(r, 'headYaw', tk(), r2c(yaw + rel));
}
function ponerCabeza(r, rel, pitch) {
  const e = FM.estado(r, E.t);
  FM.ponerProp(r, 'headYaw', tk(), r2c(e.cuerpo + rel)); FM.ponerProp(r, 'pitch', tk(), r2c(pitch));
}
const difAng = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;
const poseHueso = (r, h) => FM.pose(r, h, E.t) || { t: [0, 0, 0], s: [1, 1, 1], r: [0, 0, 0] };
function ponerHueso(r, h, tr) { FM.ponerPose(r, h, tk(), { t: tr.t.map(r2c), s: tr.s.map((v) => Math.round(v * 1e4) / 1e4), r: tr.r.map((v) => Math.round(v * 1e5) / 1e5) }); }
function keyActor(r) {
  const e = FM.estado(r, E.t);
  FM.ponerProp(r, 'x', tk(), e.x); FM.ponerProp(r, 'y', tk(), e.y); FM.ponerProp(r, 'z', tk(), e.z);
  FM.ponerProp(r, 'yaw', tk(), e.cuerpo); FM.ponerProp(r, 'bodyYaw', tk(), e.cuerpo);
  FM.ponerProp(r, 'headYaw', tk(), e.cabeza); FM.ponerProp(r, 'pitch', tk(), e.pitch);
}
async function keyPoseCompleta(r) {
  for (const h of await huesosDe(r)) ponerHueso(r, h, poseHueso(r, h));
}

// keyframes de una fila de la línea (para mover, borrar o cambiar la curva)
function pistasFila(fila) {
  if (fila === 'cortes') return [{ kf: auto.S.cortes, base: 0 }];
  if (fila === 'tomas') return E.toma ? FM.pistasToma(E.toma).map((kf) => ({ kf, base: num(E.toma.tick ?? 0) })) : [];
  const deActor = (r) => FM.filas(r).flatMap((f) => FM.pistasDeFila(r, f.id)).map((kf) => ({ kf, base: 0 }));
  if (fila === 'actor') return rep() ? deActor(rep()) : [];
  if (fila.startsWith('a:')) { const r = E.film.replays[Number(fila.slice(2))]; return r ? deActor(r) : []; }
  return rep() ? FM.pistasDeFila(rep(), fila).map((kf) => ({ kf, base: 0 })) : [];
}
function moverKeys(fila, desde, hasta) {
  guardarDeshacer();
  for (const { kf, base } of pistasFila(fila)) {
    let h = hasta - base;
    if (fila === 'tomas') { h = Math.max(0, h); if (h > num(E.toma.duration)) E.toma.duration = F(h); }
    P.mover(kf, desde - base, h);
  }
  E.key = { fila, tick: hasta };
  if (fila === 'cortes') { auto.cambioCortes(); return; }
  E.t = hasta;
  refrescar();
}
function keysEn(fila, tick) { return pistasFila(fila).flatMap(({ kf, base }) => kf.filter((k) => Math.round(num(k.tick)) === tick - base)); }
function borrarKey() {
  if (!E.key) return;
  guardarDeshacer();
  for (const { kf, base } of pistasFila(E.key.fila)) P.quitar(kf, E.key.tick - base);
  const eraCorte = E.key.fila === 'cortes';
  E.key = null; refrescar();
  if (eraCorte) auto.cambioCortes();
}
function herramientasKey() {
  const ks = E.key ? keysEn(E.key.fila, E.key.tick) : [];
  const sel = $('#selCurva');
  sel.disabled = !ks.length; $('#btnBorrarKey').disabled = !ks.length;
  if (ks.length) sel.value = ks[0].interp || 'linear';
}
function ponerKey() {
  if (E.panel === 'camaras' && E.toma) return keyCamara();
  const r = rep(); if (!r) return aviso('Elegí un actor o una cámara primero.');
  guardarDeshacer();
  if (E.hueso) ponerHueso(r, E.hueso, poseHueso(r, E.hueso)); else keyActor(r);
  refrescar(); aviso(E.hueso ? `Keyframe de ${E.hueso} en el tick ${tk()}` : `Keyframe del actor en el tick ${tk()}`, false, 1500);
}

// ------------------------------------------------------------------ tocar la escena 3D
let arr = null;
const contEscena = $('#escena');
contEscena.addEventListener('pointerdown', async (e) => {
  if (e.button > 0 || e.target.closest('#modos') || E.porCamara) return;
  if (arr) { arr = null; vista.orbita.enabled = true; return; }   // segundo dedo: cancelar y dejar girar la vista
  const hit = vista.tocar(e);
  if (hit && hit.rep) {
    vista.orbita.enabled = false;
    const r = hit.rep, i = E.film.replays.indexOf(r);
    const e0 = FM.estado(r, E.t);
    arr = { r, x: e.clientX, y: e.clientY, movio: false, e0 };
    if (E.modo === 'posar') {
      const h = await huesoTocable(r, hit.hueso);
      if (!arr) return;
      elegirActor(i, h || E.hueso);
      arr.hueso = h; arr.p0 = h ? clonar(poseHueso(r, h)) : null;
    } else {
      if (i !== E.i) elegirActor(i);
      const p = vista.puntoEnPlano(e, e0.y);
      arr.ang0 = p ? Math.atan2(-(p.x - e0.x), p.z - e0.z) / D2R : 0;
      arr.dx = p ? e0.x - p.x : 0; arr.dz = p ? e0.z - p.z : 0;
    }
  } else if (hit && hit.toma) {
    elegirToma(hit.toma);
  } else {
    arr = { vacio: true, x: e.clientX, y: e.clientY, movio: false };
  }
}, true);
window.addEventListener('pointermove', (e) => {
  if (!arr || arr.vacio) { if (arr && Math.hypot(e.clientX - arr.x, e.clientY - arr.y) > 6) arr.movio = true; return; }
  const dx = e.clientX - arr.x, dy = e.clientY - arr.y;
  if (!arr.movio && Math.hypot(dx, dy) < 5) return;
  if (!arr.movio) { arr.movio = true; guardarDeshacer(); }
  const r = arr.r;
  if (E.modo === 'mover') {
    const p = vista.puntoEnPlano(e, arr.e0.y); if (!p) return;
    ponerPos(r, p.x + arr.dx, arr.e0.y, p.z + arr.dz);
  } else if (E.modo === 'girar') {
    const p = vista.puntoEnPlano(e, arr.e0.y); if (!p) return;
    const ang = Math.atan2(-(p.x - arr.e0.x), p.z - arr.e0.z) / D2R;
    let yaw = arr.e0.cuerpo + difAng(ang, arr.ang0);
    if (E.iman) yaw = Math.round(yaw / 15) * 15;
    ponerGiro(r, yaw);
  } else if (E.modo === 'posar' && arr.hueso && arr.p0) {
    const q = clonar(arr.p0), k = 0.012;
    if (E.eje === 'y') q.r[1] = arr.p0.r[1] + dx * k;
    else { q.r[0] = arr.p0.r[0] + dy * k; q.r[2] = arr.p0.r[2] - dx * k; }
    ponerHueso(r, arr.hueso, q);
  }
  vista.pasosViejos(); aplicar(); dibujarLinea(); refrescarValores();
});
window.addEventListener('pointerup', () => {
  const a = arr; arr = null; vista.orbita.enabled = true;
  if (!a) return;
  if (a.vacio && !a.movio) { if (E.hueso) elegirActor(E.i, null); else if (E.i >= 0) elegirActor(-1); return; }
  if (a.movio) refrescar();
});
window.addEventListener('pointercancel', () => { arr = null; vista.orbita.enabled = true; });

// ------------------------------------------------------------------ paneles
const panelEl = $('#cuerpoPanel');
const pestanas = { actores: panelActores, pose: panelPose, camaras: panelCamaras, director: (frag) => panelDirector(frag, apiDirector()), presets: panelPresets, proyecto: panelProyecto };
// lo que usa la pestaña Director (director.js) para trabajar sobre la escena abierta
const apiDirector = () => ({ audioArchivo: () => audioArchivo, E, el, titulo, boton, FM, A, num, aviso, guardarDeshacer, refrescar, dibujarPanel, enfocar, irA, elegirToma, adoptar, clonar, modelos });
let dibujando = 0;
async function dibujarPanel() {
  const n = ++dibujando;
  for (const b of document.querySelectorAll('#pestanas button')) b.classList.toggle('activa', b.dataset.p === E.panel);
  const frag = document.createDocumentFragment();
  await pestanas[E.panel](frag);
  if (n !== dibujando) return;
  const sc = panelEl.scrollTop;
  panelEl.replaceChildren(frag); panelEl.scrollTop = sc;
}
// los deslizadores se actualizan solos cuando cambia el tiempo (sin rehacer el panel)
const enlaces = [];
function refrescarValores() { for (const f of enlaces) f(); }
function titulo(t) { return el('div', { class: 'titulo' }, t); }
function deslizador(nombre, min, max, paso, leerV, ponerV) {
  const rango = el('input', { type: 'range', min, max, step: paso });
  const caja = el('input', { type: 'number', step: paso });
  const sync = () => { const v = leerV(); if (document.activeElement !== caja) caja.value = r2(v); if (!rango.matches(':active')) rango.value = v; };
  let empezado = false;
  const poner = (v, final) => {
    if (!empezado) { guardarDeshacer(); empezado = true; }
    ponerV(Number(v)); vista.pasosViejos(); aplicar(); dibujarLinea();
    if (final) { empezado = false; refrescar({ panel: false }); }
    sync();
  };
  rango.addEventListener('input', () => poner(rango.value, false));
  rango.addEventListener('change', () => poner(rango.value, true));
  caja.addEventListener('change', () => poner(caja.value, true));
  enlaces.push(sync); sync();
  return el('div', { class: 'deslizador' }, el('label', {}, nombre), rango, caja);
}
function boton(txt, fn, attrs = {}) { return el('button', { ...attrs, onclick: fn }, txt); }

async function panelActores(frag) {
  enlaces.length = 0;
  const reps = E.film.replays;
  frag.append(titulo(`Actores (${reps.length})`));
  const lista = el('div', { class: 'lista' });
  reps.forEach((r, i) => lista.append(el('button', { class: 'item' + (i === E.i ? ' elegido' : ''), onclick: () => { if (i !== E.i) enfocar(r); elegirActor(i === E.i ? -1 : i); } },
    '👤 ' + FM.nombre(r, i), el('span', { class: 'sub' }, nombreForm(r.form)))));
  frag.append(lista);
  frag.append(el('div', { class: 'fila' }, boton('➕ Agregar personaje', () => hojaPersonajes('agregar'), { class: 'principal' })));
  if (!reps.length) frag.append(el('div', { class: 'ayuda' }, 'Agregá un personaje para empezar. Después arrastralo en la escena con ', el('b', {}, '✋ Mover'), ', giralo con ', el('b', {}, '🔄 Girar'), ' y doblale brazos y piernas con ', el('b', {}, '🦴 Posar'), '. Cada cambio pone un keyframe en el tiempo donde está la línea naranja.'));
  const r = rep(); if (!r) return;
  frag.append(titulo('Actor elegido'));
  const nombre = el('input', { value: FM.nombre(r, E.i), 'aria-label': 'Nombre' });
  nombre.addEventListener('change', () => { guardarDeshacer(); r.label = nombre.value; refrescar(); });
  frag.append(el('div', { class: 'fila' }, nombre));
  frag.append(el('div', { class: 'nota' }, `Valores en el tick ${tk()} (${(E.t / 20).toFixed(2)} s). Cambiarlos pone keyframe acá.`));
  const est = () => FM.estado(r, E.t);
  frag.append(deslizador('X', -64, 64, 0.05, () => est().x, (v) => { const e = est(); ponerPos(r, v, e.y, e.z); }));
  frag.append(deslizador('Altura (Y)', -10, 30, 0.05, () => est().y, (v) => { const e = est(); ponerPos(r, e.x, v, e.z); }));
  frag.append(deslizador('Z', -64, 64, 0.05, () => est().z, (v) => { const e = est(); ponerPos(r, e.x, e.y, v); }));
  frag.append(deslizador('Giro', -180, 180, 1, () => difAng(est().cuerpo, 0), (v) => ponerGiro(r, v)));
  frag.append(deslizador('Cabeza ↔', -75, 75, 1, () => difAng(est().cabeza, est().cuerpo), (v) => ponerCabeza(r, v, est().pitch)));
  frag.append(deslizador('Cabeza ↕', -90, 90, 1, () => est().pitch, (v) => ponerCabeza(r, difAng(est().cabeza, est().cuerpo), v)));
  const vis = FM.visible(r, E.t);
  frag.append(el('div', { class: 'fila' },
    boton(vis ? '🙈 Desaparece acá' : '👁 Aparece acá', () => { guardarDeshacer(); FM.ponerVisible(r, tk(), !vis); refrescar(); }),
    boton('◆ Keyframe de todo', () => { guardarDeshacer(); keyActor(r); refrescar(); })));
  frag.append(titulo('Personaje'));
  frag.append(el('div', { class: 'fila' },
    boton('🔁 Cambiar personaje', () => hojaPersonajes('cambiar')),
    boton('🎨 Cambiar skin', () => hojaSkins()),
    boton('⭐ Guardar como preset', () => guardarPersonaje(r))));
  frag.append(el('div', { class: 'fila' },
    boton('📄 Duplicar', () => { guardarDeshacer(); const j = FM.duplicarActor(E.film, E.i); E.i = j; refrescar({ rearmar: true }); }),
    boton('🗑 Borrar actor', () => { if (!confirm(`¿Borrar a ${FM.nombre(r, E.i)}?`)) return; guardarDeshacer(); FM.borrarActor(E.film, E.i); E.i = -1; E.hueso = null; refrescar({ rearmar: true }); }, { class: 'peligro' })));
}

async function panelPose(frag) {
  enlaces.length = 0;
  const r = rep();
  if (!r) { frag.append(el('div', { class: 'ayuda' }, 'Elegí un actor (tocándolo en la escena o en ', el('b', {}, '👥 Actores'), ') para posarlo.')); return; }
  const huesos = await huesosDe(r);
  if (!huesos.length) { frag.append(el('div', { class: 'ayuda' }, 'Este personaje no tiene partes para posar.')); return; }
  frag.append(titulo('Partes del cuerpo'));
  const anim = new Set(FM.huesosAnimados(r));
  const orden = ['head', 'body', 'low_body', 'torso_lower', 'left_arm', 'left_elbow', 'low_left_arm', 'low_left_arm.end', 'right_arm', 'right_elbow', 'low_right_arm', 'low_right_arm.end', 'left_leg', 'left_knee', 'low_left_leg', 'right_leg', 'right_knee', 'low_leg_right'];
  huesos.sort((a, b) => ((orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99)) || cmp(a, b));
  const chips = el('div', { class: 'chips' });
  for (const h of huesos) chips.append(boton(nombreHueso(h), () => elegirActor(E.i, h === E.hueso ? null : h), { class: (h === E.hueso ? 'elegido' : '') + (anim.has(h) ? ' anim' : '') }));
  frag.append(chips);
  frag.append(el('div', { class: 'fila' }, el('span', { class: 'nota' }, 'Arrastrar en la escena dobla:'),
    boton('Adelante y costado', () => { E.eje = 'xz'; dibujarPanel(); }, { class: E.eje === 'xz' ? 'principal' : '' }),
    boton('Girar', () => { E.eje = 'y'; dibujarPanel(); }, { class: E.eje === 'y' ? 'principal' : '' })));
  const h = E.hueso;
  if (h) {
    frag.append(titulo(nombreHueso(h)));
    const ph = () => poseHueso(r, h);
    const cambiar = (fn) => (v) => { const q = clonar(ph()); fn(q, v); ponerHueso(r, h, q); };
    frag.append(deslizador('Doblar X', -180, 180, 1, () => ph().r[0] / D2R, cambiar((q, v) => { q.r[0] = v * D2R; })));
    frag.append(deslizador('Girar Y', -180, 180, 1, () => ph().r[1] / D2R, cambiar((q, v) => { q.r[1] = v * D2R; })));
    frag.append(deslizador('Inclinar Z', -180, 180, 1, () => ph().r[2] / D2R, cambiar((q, v) => { q.r[2] = v * D2R; })));
    frag.append(deslizador('Mover X', -16, 16, 0.1, () => ph().t[0], cambiar((q, v) => { q.t[0] = v; })));
    frag.append(deslizador('Mover Y', -16, 16, 0.1, () => ph().t[1], cambiar((q, v) => { q.t[1] = v; })));
    frag.append(deslizador('Mover Z', -16, 16, 0.1, () => ph().t[2], cambiar((q, v) => { q.t[2] = v; })));
    frag.append(deslizador('Tamaño', 0, 3, 0.05, () => ph().s[0], cambiar((q, v) => { q.s = [v, v, v]; })));
    frag.append(el('div', { class: 'fila' },
      boton('↺ Enderezar esta parte', () => { guardarDeshacer(); ponerHueso(r, h, { t: [0, 0, 0], s: [1, 1, 1], r: [0, 0, 0] }); refrescar(); })));
  } else frag.append(el('div', { class: 'nota' }, 'Tocá una parte (acá o en la escena con 🦴 Posar) para doblarla.'));
  frag.append(titulo('Toda la pose'));
  frag.append(el('div', { class: 'fila' },
    boton('📋 Copiar', () => { portapapeles = FM.poseCompleta(r, E.t); aviso('Pose copiada. Andá a otro tick u otro actor y tocá Pegar.', false, 2000); }),
    boton('📥 Pegar', () => { if (!portapapeles) return aviso('Primero copiá una pose.'); aplicarPose(r, portapapeles); }),
    boton('🪞 Espejar', () => aplicarPose(r, espejar(FM.poseCompleta(r, E.t))))));
  frag.append(el('div', { class: 'fila' },
    boton('◆ Keyframe de toda la pose', async () => { guardarDeshacer(); await keyPoseCompleta(r); refrescar(); }),
    boton('↺ Pose neutra', () => aplicarPose(r, {})),
    boton('⭐ Guardar pose', () => guardarPose(r))));
}
let portapapeles = null;
const NOMBRES_HUESO = { head: 'Cabeza', body: 'Pecho', low_body: 'Cintura', torso_lower: 'Panza', left_arm: 'Brazo izq.', left_elbow: 'Codo izq.', right_arm: 'Brazo der.', right_elbow: 'Codo der.', left_leg: 'Pierna izq.', left_knee: 'Rodilla izq.', right_leg: 'Pierna der.', right_knee: 'Rodilla der.', low_left_arm: 'Antebrazo izq.', 'low_left_arm.end': 'Mano izq.', low_right_arm: 'Antebrazo der.', 'low_right_arm.end': 'Mano der.', low_left_leg: 'Rodilla izq.', low_leg_right: 'Rodilla der.', headwear: 'Capucha/pelo', torso: 'Torso' };
const nombreHueso = (h) => NOMBRES_HUESO[h] || h;

// pone una pose entera en el tick (las partes que no nombra vuelven a neutras)
async function aplicarPose(r, pose) {
  guardarDeshacer();
  const huesos = new Set([...(await huesosDe(r)), ...Object.keys(pose)]);
  for (const h of huesos) {
    const v = pose[h];
    ponerHueso(r, h, v ? { t: v.t || [0, 0, 0], s: v.s || [1, 1, 1], r: v.r || [0, 0, 0] } : { t: [0, 0, 0], s: [1, 1, 1], r: [0, 0, 0] });
  }
  refrescar();
}
function espejar(pose) {
  const out = {};
  for (const [h, v] of Object.entries(pose)) {
    const o = h.startsWith('left_') ? 'right_' + h.slice(5) : h.startsWith('right_') ? 'left_' + h.slice(6) : h;
    out[o] = { t: [-v.t[0], v.t[1], v.t[2]], s: v.s.slice(), r: [v.r[0], -v.r[1], -v.r[2]] };
  }
  return out;
}
// las poses de BBS (poses.json) traen a veces un segundo giro (r2): se junta en uno
function poseDeBBS(p) {
  const out = {};
  for (const [h, v] of Object.entries((p && p.pose) || p || {})) {
    if (!v || typeof v !== 'object') continue;
    const tr = P.transformDe(v);
    const s2 = Array.isArray(v.r2) ? v.r2.map(num) : [0, 0, 0];
    if (s2.some((x) => x)) {
      const m = rotZYX(tr.r).multiply(rotZYX(s2));
      const e = new THREE.Euler().setFromRotationMatrix(m, 'ZYX');
      tr.r = [e.x, e.y, e.z];
    }
    out[h] = tr;
  }
  return out;
}
const rotZYX = (r) => new THREE.Matrix4().makeRotationZ(r[2]).multiply(new THREE.Matrix4().makeRotationY(r[1])).multiply(new THREE.Matrix4().makeRotationX(r[0]));

async function panelCamaras(frag) {
  enlaces.length = 0;
  auto.panel(frag);
  const ts = FM.tomas(E.film);
  frag.append(titulo(`Cámaras (${ts.length})`));
  frag.append(el('div', { class: 'ayuda' }, 'Mové la vista con el dedo (un dedo gira, dos dedos acercan y desplazan) y tocá ', el('b', {}, '➕ Cámara desde esta vista'), '. Para que se mueva: andá a otro tiempo, acomodá la vista y tocá ', el('b', {}, '◆ Key con esta vista'), '.'));
  const lista = el('div', { class: 'lista' });
  for (const c of ts) lista.append(el('button', { class: 'item' + (c === E.toma ? ' elegido' : ''), onclick: () => elegirToma(c === E.toma ? null : c) },
    '🎥 ' + (c.title || 'Cámara'), el('span', { class: 'sub' }, `${(num(c.tick) / 20).toFixed(1)}s → ${((num(c.tick) + num(c.duration)) / 20).toFixed(1)}s`)));
  frag.append(lista);
  frag.append(el('div', { class: 'fila' }, boton('➕ Cámara desde esta vista', () => nuevaCamara(), { class: 'principal' })));
  const c = E.toma; if (!c) return;
  frag.append(titulo('Cámara elegida'));
  const nom = el('input', { value: c.title || '', placeholder: 'Nombre de la toma' });
  nom.addEventListener('change', () => { guardarDeshacer(); c.title = nom.value; refrescar(); });
  frag.append(el('div', { class: 'fila' }, nom));
  frag.append(deslizador('Empieza (s)', 0, Math.max(60, fin() / 20 + 10), 0.05, () => num(c.tick) / 20, (v) => fijar(c, 'tick', Math.max(0, Math.round(v * 20)), I)));
  frag.append(deslizador('Dura (s)', 0.05, 120, 0.05, () => num(c.duration) / 20, (v) => fijar(c, 'duration', Math.max(1, Math.round(v * 20)), I)));
  frag.append(deslizador('Zoom (FOV)', 5, 120, 1, () => FM.vistaToma(c, E.t).fov, (v) => { const vv = FM.vistaToma(c, E.t); vv.fov = v; ponerKeyCam(c, vv); }));
  frag.append(deslizador('Inclinar', -45, 45, 1, () => num(c.roll ?? 0), (v) => fijar(c, 'roll', v)));
  frag.append(el('div', { class: 'fila' },
    boton('◆ Key con esta vista', () => keyCamara(), { class: 'principal' }),
    boton('👁 Ir a la cámara', () => { if (E.porCamara) $('#btnPorCamara').click(); E.porCamara = false; vista.irA(FM.vistaToma(c, E.t)); $('#btnPorCamara').classList.remove('activo'); aplicar(); })));
  frag.append(el('div', { class: 'fila' },
    boton('📄 Duplicar', () => { guardarDeshacer(); const d = clonar(c); d.title = (c.title || 'Cámara') + ' 2'; E.film.camera.push(d); E.toma = d; refrescar(); }),
    boton('🗑 Borrar cámara', () => { guardarDeshacer(); FM.borrarToma(E.film, c); E.toma = null; refrescar(); }, { class: 'peligro' })));
  frag.append(el('div', { class: 'nota' }, 'La cámara que se ve es la de arriba en la lista de BBS (capa más alta) entre las que están activas en ese momento.'));
}
function ponerKeyCam(c, v) {
  if (!FM.ponerKeyToma(c, E.t, v)) {
    // fuera de la toma: se estira hasta acá
    const a = num(c.tick), t = tk();
    if (t > a) fijar(c, 'duration', t - a, I);
    else { // antes: se corre el principio y se corren las keys
      const d = a - t;
      for (const kf of FM.pistasToma(c)) for (const k of kf) k.tick = F(num(k.tick) + d);
      fijar(c, 'tick', t, I); fijar(c, 'duration', num(c.duration) + d, I);
    }
    FM.ponerKeyToma(c, E.t, v);
  }
}
function vistaCam() { const v = vista.vistaActual(); if (E.toma) v.fov = FM.vistaToma(E.toma, E.t).fov; return v; }
function keyCamara() {
  const c = E.toma; if (!c) return aviso('Elegí una cámara.');
  if (E.porCamara) return aviso('Salí de "ver por la cámara" para acomodar la vista y después poné el key.');
  guardarDeshacer(); ponerKeyCam(c, vistaCam()); refrescar();
  aviso(`Key de cámara en ${(E.t / 20).toFixed(2)} s`, false, 1500);
}
function nuevaCamara() {
  guardarDeshacer();
  const n = FM.tomas(E.film).length + 1;
  const ultima = FM.tomas(E.film).reduce((m, c) => Math.max(m, num(c.tick) + num(c.duration)), 0);
  const empieza = FM.tomas(E.film).length ? Math.min(tk(), ultima) : 0;
  const c = FM.nuevaToma(E.film, empieza, Math.max(40, fin() - empieza), { ...vista.vistaActual(), fov: 50 }, `Cámara ${n}`);
  if (tk() > empieza) ponerKeyCam(c, { ...vista.vistaActual(), fov: 50 });
  E.toma = c; E.panel = 'camaras'; E.i = -1; E.hueso = null;
  refrescar();
}

// ------------------------------------------------------------------ presets
async function panelPresets(frag) {
  enlaces.length = 0;
  const r = rep();
  frag.append(titulo('Poses'));
  if (!r) frag.append(el('div', { class: 'nota' }, 'Elegí un actor para ponerle una pose.'));
  const mias = await A.presets('pose');
  const gm = el('div', { class: 'chips' });
  for (const p of mias) gm.append(boton('⭐ ' + p.nombre, () => r && aplicarPose(r, normalizarPose(p.datos)), { title: 'Mantener apretado o clic derecho para borrar', oncontextmenu: (e) => { e.preventDefault(); borrarPresetPreg(p); } }));
  if (!mias.length) gm.append(el('span', { class: 'nota' }, 'Todavía no guardaste poses (🦴 Pose → ⭐ Guardar pose).'));
  frag.append(gm);
  if (r && r.form && r.form.model) {
    const d = await modelos.datos(r.form.model);
    const poses = (d && d.poses) || {};
    const nombres = Object.keys(poses).sort(cmp);
    if (nombres.length) {
      frag.append(el('div', { class: 'nota' }, 'Poses que trae BBS para este modelo:'));
      const gb = el('div', { class: 'chips' });
      for (const k of nombres) gb.append(boton(k.replace(/_/g, ' '), () => aplicarPose(r, poseDeBBS(poses[k]))));
      frag.append(gb);
    }
  }
  frag.append(titulo('Personajes'));
  const pers = await A.presets('personaje');
  if (pers.length) {
    const g = el('div', { class: 'grilla' });
    for (const p of pers) g.append(tarjetaForm(p.datos, '⭐ ' + p.nombre, () => agregarConForm(p.datos, p.nombre), () => borrarPresetPreg(p)));
    frag.append(g);
  } else frag.append(el('div', { class: 'nota' }, 'Guardá un actor como preset (👥 Actores → ⭐ Guardar como preset) para reusarlo con su skin y sus partes.'));
  frag.append(el('div', { class: 'fila' }, boton('➕ Agregar personaje…', () => hojaPersonajes('agregar'))));
  frag.append(titulo('Llevar presets a otro aparato'));
  frag.append(el('div', { class: 'fila' },
    boton('📤 Exportar presets', async () => {
      const todos = await A.presets();
      const txt = A.aJSON({ editorBBS: 1, presets: todos.map(({ tipo, nombre, datos }) => ({ tipo, nombre, datos })) });
      aviso(await guardarSalida('editor', 'presets_editor.json', txt, 'application/json'));
    }),
    boton('📥 Importar presets', () => $('#inPresets').click())));
  frag.append(el('div', { class: 'nota' }, 'Mantené apretado (o clic derecho) un preset tuyo para borrarlo.'));
}
function normalizarPose(p) { const o = {}; for (const [h, v] of Object.entries(p || {})) o[h] = P.transformDe(v); return o; }
async function borrarPresetPreg(p) { if (confirm(`¿Borrar el preset "${p.nombre}"?`)) { await A.borrarPreset(p.id); dibujarPanel(); } }
async function guardarPose(r) {
  const n = prompt('Nombre de la pose:', 'Mi pose'); if (!n) return;
  const pose = FM.poseCompleta(r, E.t);
  await A.guardarPreset('pose', n, JSON.parse(JSON.stringify(pose)));
  aviso(`Pose "${n}" guardada en ⭐ Presets.`);
}
async function guardarPersonaje(r) {
  const n = prompt('Nombre del personaje:', FM.nombre(r, E.i)); if (!n) return;
  await A.guardarPreset('personaje', n, clonar(r.form));
  aviso(`"${n}" guardado en ⭐ Presets.`);
}
$('#inPresets').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = A.deJSON(await f.text());
    if (!d || !Array.isArray(d.presets)) throw new Error('Ese archivo no es de presets del Editor.');
    for (const p of d.presets) await A.guardarPreset(p.tipo, p.nombre, p.datos);
    aviso(`${d.presets.length} presets importados.`); dibujarPanel();
  } catch (err) { aviso(String(err.message || err), true); }
});

// ------------------------------------------------------------------ hoja para elegir personajes y skins
function abrirHoja(tit, cuerpo) { $('#hojaTitulo').textContent = tit; $('#hojaCuerpo').replaceChildren(cuerpo); $('#hoja').hidden = false; }
function cerrarHoja() { $('#hoja').hidden = true; minis.cancelar(); }
$('#hojaCerrar').onclick = cerrarHoja;
$('#hoja').addEventListener('click', (e) => { if (e.target.id === 'hoja') cerrarHoja(); });

function tarjetaForm(form, texto, alElegir, alBorrar = null) {
  const img = el('img', { alt: '' });
  const t = el('button', { class: 'tarjeta', onclick: alElegir, title: texto }, img, el('span', {}, texto));
  if (alBorrar) t.addEventListener('contextmenu', (e) => { e.preventDefault(); alBorrar(); });
  minis.pedir('f:' + JSON.stringify(form, (k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 4000) + fuente.nombre, () => forms.construir(form), (url) => { if (url) img.src = url; });
  return t;
}
// forms de settings/forms de su BBS (presets del mod), como los muestra el Visor
async function formsDeBBS() {
  const out = [];
  const rutas = fuente.rutas().filter((p) => p.startsWith('settings/forms/') && p.toLowerCase().endsWith('.json')).sort(cmp);
  for (const ruta of rutas) {
    try {
      const j = parsearConTipos(await fuente.texto(ruta));
      if (!j || !Array.isArray(j.forms)) continue;
      out.push({ titulo: j.title || ruta.slice('settings/forms/'.length), forms: j.forms });
    } catch { /* json roto */ }
  }
  return out;
}
// JSON de BBS: los números con punto (1.0) se guardan como decimales, así el .dat sale con los tipos de BBS
function parsearConTipos(texto) {
  return JSON.parse(texto, function (k, v, ctx) { return typeof v === 'number' && ctx && ctx.source && /[.eE]/.test(ctx.source) ? F(v) : v; });
}
const MODELOS_BASE = [['player/steve_bends', 'Steve (dobla codos)'], ['player/alex_bends', 'Alex (dobla codos)'], ['player/steve', 'Steve'], ['player/alex', 'Alex']];

async function hojaPersonajes(modo) {
  const r = rep();
  const cuerpo = el('div');
  const elegir = (form, nombre) => { cerrarHoja(); if (modo === 'cambiar' && r) cambiarForm(r, form); else agregarConForm(form, nombre); };
  cuerpo.append(el('div', { class: 'fila' },
    boton('📂 Carpeta bbs de la PC', () => abrirCarpetaBBS().then(() => hojaPersonajes(modo))),
    boton('🗜️ .zip de la carpeta bbs', () => { cerrarHoja(); $('#inZip').click(); })));
  cuerpo.append(el('div', { class: 'nota' }, fuente.tipo ? `Usando: ${fuente.nombre}` : 'Para ver tus personajes y skins de BBS abrí tu carpeta bbs (PC) o el .zip que arma el Visor con "📦 Paquete para el celu".'));
  const pers = await A.presets('personaje');
  if (pers.length) {
    cuerpo.append(titulo('Mis presets'));
    const g = el('div', { class: 'grilla' });
    for (const p of pers) g.append(tarjetaForm(p.datos, p.nombre, () => elegir(clonar(p.datos), p.nombre)));
    cuerpo.append(g);
  }
  if (E.film._modelo && E.film._modelo.form) {
    cuerpo.append(titulo('Del film de muestra'));
    const g = el('div', { class: 'grilla' });
    const f0 = E.film._modelo.form;
    g.append(tarjetaForm(f0, nombreForm(f0), () => elegir(clonar(f0), nombreForm(f0))));
    cuerpo.append(g);
  }
  for (const cat of await formsDeBBS()) {
    cuerpo.append(titulo(cat.titulo));
    const g = el('div', { class: 'grilla' });
    for (const f of cat.forms) g.append(tarjetaForm(f, nombreForm(f), () => elegir(clonar(f), nombreForm(f))));
    cuerpo.append(g);
  }
  cuerpo.append(titulo('Modelos base'));
  const g = el('div', { class: 'grilla' });
  for (const [m, n] of MODELOS_BASE) { const f = FM.formPersonaje(E.film, m, null, ''); g.append(tarjetaForm(f, n, () => elegir(f, n.split(' ')[0]))); }
  cuerpo.append(g);
  abrirHoja(modo === 'cambiar' ? 'Cambiar personaje' : 'Agregar personaje', cuerpo);
}
function agregarConForm(form, nombre) {
  guardarDeshacer();
  // aparece delante de la vista, en el piso
  const v = vista.vistaActual();
  const d = 4, x = v.x - Math.sin(v.yaw * D2R) * d, z = v.z + Math.cos(v.yaw * D2R) * d;
  const etiqueta = nombre || nombreForm(form) || 'Actor';
  const i = FM.nuevoActor(E.film, form, etiqueta, r2c(Math.round(x * 2) / 2), 0, r2c(Math.round(z * 2) / 2));
  const r = E.film.replays[i];
  // que mire hacia la cámara
  const yaw = Math.round((v.yaw + 180) / 15) * 15;
  for (const k of ['yaw', 'bodyYaw', 'headYaw']) FM.ponerProp(r, k, 0, yaw, 'linear');
  E.i = i; E.hueso = null; E.panel = 'actores';
  refrescar({ rearmar: true });
}
function cambiarForm(r, form) {
  guardarDeshacer();
  const viejo = r.form || {};
  r.form = form;
  if (!form.name && viejo.name) form.name = viejo.name;
  refrescar({ rearmar: true });
}
async function hojaSkins() {
  const r = rep(); if (!r || !r.form || r.form.id !== 'bbs:model') return aviso('Elegí un actor que sea un modelo.');
  const cuerpo = el('div');
  const pngs = fuente.rutas().filter((p) => p.startsWith('assets/') && p.toLowerCase().endsWith('.png') && /(skin|player|textures\/entity)/i.test(p) && !/\/(eyes|mouth|mcmuzzle|emoticons)/i.test(p)).sort(cmp);
  if (!fuente.tipo) cuerpo.append(el('div', { class: 'nota' }, 'Abrí tu carpeta bbs o el .zip para ver tus skins.'), el('div', { class: 'fila' }, boton('📂 Carpeta bbs de la PC', () => abrirCarpetaBBS().then(() => hojaSkins())), boton('🗜️ .zip', () => { cerrarHoja(); $('#inZip').click(); })));
  const porCarpeta = new Map();
  for (const p of pngs) { const c = p.slice(0, p.lastIndexOf('/')); if (!porCarpeta.has(c)) porCarpeta.set(c, []); porCarpeta.get(c).push(p); }
  const buscar = el('input', { type: 'search', placeholder: 'Buscar skin…' });
  cuerpo.append(el('div', { class: 'fila' }, buscar));
  const cont = el('div'); cuerpo.append(cont);
  const urls = [];
  const pintar = () => {
    cont.replaceChildren();
    const q = buscar.value.toLowerCase();
    for (const [c, lista] of porCarpeta) {
      const l = lista.filter((p) => !q || p.toLowerCase().includes(q)); if (!l.length) continue;
      cont.append(titulo(c.replace(/^assets\/(models\/)?/, '')));
      const g = el('div', { class: 'grilla' });
      for (const p of l.slice(0, 120)) {
        const img = el('img', { alt: '' });
        fuente.blob(p).then((b) => { if (b) { const u = URL.createObjectURL(b); urls.push(u); img.src = u; } });
        g.append(el('button', { class: 'tarjeta', onclick: () => { cerrarHoja(); urls.forEach(URL.revokeObjectURL); guardarDeshacer(); r.form = clonar(r.form); r.form.texture = [{ path: 'assets:' + p.slice(7) }]; refrescar({ rearmar: true }); } }, img, el('span', {}, p.split('/').pop())));
      }
      cont.append(g);
    }
    if (!cont.children.length && fuente.tipo) cont.append(el('div', { class: 'nota' }, 'No encontré skins (PNG en carpetas de skins o de player).'));
  };
  buscar.addEventListener('input', pintar); pintar();
  abrirHoja('Cambiar skin', cuerpo);
  img16(cont);
}
function img16(cont) { cont.querySelectorAll('img').forEach((i) => { i.style.imageRendering = 'pixelated'; }); }

// ------------------------------------------------------------------ carpeta bbs / zip
async function abrirCarpetaBBS() {
  if (!window.showDirectoryPicker) { aviso('En el celu usá el .zip (el Visor de la PC lo arma con "📦 Paquete para el celu").', true, 6000); throw new Error('sin carpeta'); }
  try {
    const raiz = await fuente.abrirCarpeta();
    await A.kvGuardar('carpeta', raiz);
    alCambiarFuente();
  } catch (e) { if (e.name !== 'AbortError') aviso(String(e.message || e), true); throw e; }
}
$('#inZip').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { aviso('Abriendo ' + f.name + '…', false, 20000); await fuente.abrirZip(f); alCambiarFuente(); aviso(`Listo: ${f.name}`); } catch (err) { aviso(String(err.message || err), true); }
});
async function alCambiarFuente() {
  motores(); minis.cancelar(); minis.cache.clear();
  vista.inst.forEach((x) => { x.clave = ''; });   // rearmar los modelos con las texturas nuevas
  await refrescar({ rearmar: true });
}

// ------------------------------------------------------------------ film: nuevo, abrir, exportar
async function panelProyecto(frag) {
  enlaces.length = 0;
  frag.append(titulo('Este film'));
  frag.append(el('div', { class: 'nota' }, `${E.film.replays.length} actores · ${FM.tomas(E.film).length} cámaras · dura ${(fin() / 20).toFixed(1)} s. ` + (E.fs ? 'Film de BBS FS: acá se editan las cámaras; no se guarda solo, exportalo (💾) cuando termines.' : 'Se guarda solo en este aparato mientras trabajás.')));
  frag.append(el('div', { class: 'fila' },
    boton('💾 Exportar a BBS (.dat)', exportar, { class: 'principal' }),
    boton('📂 Abrir un .dat', () => $('#inDat').click()),
    boton('🆕 Film nuevo', nuevoFilmPreg)));
  frag.append(el('div', { class: 'nota' }, fuente.tipo ? `Skins y modelos de: ${fuente.nombre}` : 'Para ver a los personajes con sus skins, indicá dónde está tu carpeta bbs (PC) o su .zip.'));
  frag.append(el('div', { class: 'fila' }, boton('📂 Carpeta bbs de la PC', () => abrirCarpetaBBS().then(() => dibujarPanel()).catch(() => {})), boton('🗜️ .zip de la carpeta bbs', () => $('#inZip').click())));
  frag.append(el('div', { class: 'ayuda' }, 'Para usarlo en el juego: copiá el .dat a ', el('b', {}, 'saves\\<tu mundo>\\bbs\\films'), ' (en la PC se guarda en EstudioBBS\\Salida\\editor). Los actores aparecen en el mismo lugar del mundo que acá: ', el('b', {}, 'X, Y, Z'), ' son coordenadas del mundo.'));
  frag.append(titulo('Ubicar en el mundo'));
  frag.append(el('div', { class: 'nota' }, 'Corré a todos los actores y cámaras juntos (por ejemplo, para llevar la escena al lugar del mundo donde vas a grabar).'));
  const cx = el('input', { type: 'number', value: 0, step: 1, 'aria-label': 'X' }), cy = el('input', { type: 'number', value: 0, step: 1, 'aria-label': 'Y' }), cz = el('input', { type: 'number', value: 0, step: 1, 'aria-label': 'Z' });
  frag.append(el('div', { class: 'fila' }, 'X', cx, 'Y', cy, 'Z', cz, boton('Correr', () => correrTodo(Number(cx.value), Number(cy.value), Number(cz.value)))));
  frag.append(titulo('Audio de referencia'));
  frag.append(el('div', { class: 'nota' }, 'Cargá las voces o la música para animar al ritmo (se escucha al reproducir; no va dentro del .dat).'));
  frag.append(el('div', { class: 'fila' }, boton(audio ? '🔁 Cambiar audio' : '🎵 Cargar audio', () => $('#inAudio').click()), audio ? boton('✕ Quitar audio', () => { audio.pause(); audio = null; audioArchivo = null; dibujarPanel(); }) : null));
  frag.append(titulo('Ajustes'));
  const iman = el('input', { type: 'checkbox', checked: E.iman });
  iman.addEventListener('change', () => { E.iman = iman.checked; });
  frag.append(el('label', { class: 'fila' }, iman, 'Imán: mover de a medio bloque y girar de a 15°'));
  frag.append(titulo('Mis films en este aparato'));
  const lista = el('div', { class: 'lista' });
  for (const f of await A.listaFilms()) {
    lista.append(el('div', { class: 'fila' },
      el('button', { class: 'item' + (f.id === E.id ? ' elegido' : ''), style: 'flex:1', onclick: () => abrirGuardado(f.id) }, '🎞 ' + f.nombre, el('span', { class: 'sub' }, new Date(f.fecha).toLocaleString())),
      f.id === E.id ? null : boton('🗑', async () => { if (confirm(`¿Borrar "${f.nombre}" de este aparato?`)) { await A.borrarFilm(f.id); dibujarPanel(); } }, { class: 'peligro', title: 'Borrar' })));
  }
  frag.append(lista);
}
function correrTodo(dx, dy, dz) {
  if (!dx && !dy && !dz) return;
  guardarDeshacer();
  for (const r of E.film.replays) for (const [k, d] of [['x', dx], ['y', dy], ['z', dz]]) {
    const p = (r.props || {})[k];
    if (p && p.$anim) { fijar(p.$anim, 'v', num(p.$anim.v) + d); for (const kf of p.$anim.track.keyframes) fijar(kf, 'value', num(kf.value) + d); }
  }
  for (const c of FM.tomas(E.film)) for (const [k, d] of [['x', dx], ['y', dy], ['z', dz]]) {
    const v = c[k];
    if (v && v.$anim) { fijar(v.$anim, 'v', num(v.$anim.v) + d); for (const kf of v.$anim.track.keyframes) fijar(kf, 'value', num(kf.value) + d); }
    else if (v !== undefined) fijar(c, k, num(v) + d);
  }
  refrescar(); aviso('Escena corrida.');
}
async function exportar() {
  try {
    const bytes = await escribir(E.fs ? FSM.aFS(E.fs, FM.paraGuardar(E.film)) : FM.paraGuardar(E.film));
    await leer(bytes);   // que se pueda volver a leer antes de darlo por bueno
    const nombre = (E.nombre || 'escena').replace(/[^\w\- ]+/g, '_').trim() || 'escena';
    aviso(await guardarSalida('editor', nombre + '.dat', bytes), false, 6000);
  } catch (e) { aviso('No se pudo exportar: ' + (e.message || e), true, 6000); }
}
async function nuevoFilmPreg() {
  if (E.film.replays.length && !confirm('¿Empezar un film nuevo? Este queda guardado en "Mis films".')) return;
  reiniciarDirector(); E.fs = null; auto.reiniciar();
  E.film = FM.filmNuevo(E.plantilla); E.id = null; E.nombre = 'escena_' + new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');
  E.i = -1; E.hueso = null; E.toma = null; E.key = null; E.t = 0; pila.length = 0; pilaRehacer.length = 0;
  $('#nombreFilm').value = E.nombre; botonesDeshacer();
  await refrescar({ rearmar: true });
}
function adoptar(film, conservar = false) {
  film.replays ??= []; film.camera ??= [];
  if (!conservar) reiniciarDirector();   // otro film: lo que se generó con el Director en el anterior ya no vale
  film._modelo ??= clonar(film.replays[0] || E.plantilla.replays[0] || null);
  return film;
}
$('#btnAbrirDat').onclick = () => $('#inDat').click();
// también se puede arrastrar el .dat sobre la pantalla (PC)
for (const ev of ['dragover', 'drop']) document.addEventListener(ev, (e) => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  if (ev === 'drop' && e.dataTransfer.files[0]) abrirDat(e.dataTransfer.files[0]);
});
$('#inDat').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) abrirDat(f); });
async function abrirDat(f) {
  try {
    let film = await leer(new Uint8Array(await f.arrayBuffer()));
    if (!film || !Array.isArray(film.replays)) throw new Error('Ese archivo no parece un film de BBS.');
    E.fs = null;
    let aviso2 = '';
    if (FSM.esFS(film)) {
      const c = FSM.aEditor(film); E.fs = c.fs; film = c.film;
      aviso2 = ' · BBS FS: acá se editan las cámaras (lo demás del film sale igual que como vino)';
      auto.reiniciar();
    }
    E.film = adoptar(film); E.id = null; E.nombre = f.name.replace(/\.dat$/i, '');
    E.i = -1; E.hueso = null; E.toma = null; E.key = null; E.t = 0; pila.length = 0; pilaRehacer.length = 0;
    $('#nombreFilm').value = E.nombre; botonesDeshacer();
    await refrescar({ rearmar: true }); enfocar(null, true);
    aviso(`Abierto: ${f.name} (${film.replays.length} actores, ${FM.tomas(film).length} cámaras)` + aviso2, false, aviso2 ? 7000 : 3500);
  } catch (err) { console.warn(err); aviso('No se pudo abrir ' + f.name + ': ' + (err.message || err), true, 9000); }
}
async function abrirGuardado(id) {
  const x = await A.leerFilm(id); if (!x) return;
  E.fs = null; auto.reiniciar();
  E.film = adoptar(x.film); E.id = id; E.nombre = x.nombre;
  E.i = -1; E.hueso = null; E.toma = null; E.key = null; E.t = 0; pila.length = 0; pilaRehacer.length = 0;
  $('#nombreFilm').value = E.nombre; botonesDeshacer();
  await refrescar({ rearmar: true }); enfocar(null, true);
}
$('#inAudio').addEventListener('change', (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (audio) audio.pause();
  audioArchivo = f; audio = new Audio(URL.createObjectURL(f)); audio.preload = 'auto';
  aviso('Audio cargado: ' + f.name); dibujarPanel();
});

// ------------------------------------------------------------------ botones fijos
$('#nombreFilm').addEventListener('change', () => { E.nombre = $('#nombreFilm').value.trim() || 'escena'; autoguardar(); });
$('#btnDeshacer').onclick = () => volver(pila, pilaRehacer);
$('#btnRehacer').onclick = () => volver(pilaRehacer, pila);
$('#btnExportar').onclick = exportar;
$('#btnPlay').onclick = () => play();
$('#btnInicio').onclick = () => { play(false); irA(0); dibujarPanel(); };
$('#btnAtras').onclick = () => { play(false); irA(Math.max(0, tk() - 1)); };
$('#btnAdelante').onclick = () => { play(false); irA(tk() + 1); };
$('#btnKey').onclick = ponerKey;
$('#btnBorrarKey').onclick = borrarKey;
$('#btnZoomMas').onclick = () => linea.zoom(1.5);
$('#btnZoomMenos').onclick = () => linea.zoom(1 / 1.5);
for (const [k, c] of Object.entries(P.CURVAS)) $('#selCurva').append(el('option', { value: k }, c.nombre));
$('#selCurva').addEventListener('change', () => {
  if (!E.key) return;
  guardarDeshacer();
  for (const k of keysEn(E.key.fila, E.key.tick)) k.interp = $('#selCurva').value;
  refrescar({ panel: false });
});
for (const b of document.querySelectorAll('#modos [data-modo]')) b.onclick = () => {
  E.modo = b.dataset.modo;
  for (const x of document.querySelectorAll('#modos [data-modo]')) x.classList.toggle('activo', x === b);
  if (E.modo === 'posar' && E.panel === 'actores') { E.panel = 'pose'; dibujarPanel(); }
  if (E.modo !== 'posar' && E.hueso) elegirActor(E.i, null);
};
let vistaGuardada = null;
$('#btnCentrar').onclick = () => { if (E.porCamara) $('#btnPorCamara').click(); enfocar(rep(), !rep()); };
$('#btnPorCamara').onclick = () => {
  E.porCamara = !E.porCamara;
  // al salir de "por la cámara" se vuelve a la vista libre de antes
  if (E.porCamara) vistaGuardada = { p: vista.camara.position.clone(), t: vista.orbita.target.clone() };
  else if (vistaGuardada) { vista.camara.position.copy(vistaGuardada.p); vista.orbita.target.copy(vistaGuardada.t); vista.orbita.update(); }
  $('#btnPorCamara').classList.toggle('activo', E.porCamara);
  if (E.porCamara && !FM.tomas(E.film).length) aviso('Todavía no hay cámaras: armalas en 🎥 Cámaras.');
  aplicar();
};
for (const b of document.querySelectorAll('#pestanas button')) b.onclick = () => { E.panel = b.dataset.p; dibujarPanel(); };
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); play(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); volver(pila, pilaRehacer); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); volver(pilaRehacer, pila); }
  else if (e.key === 'ArrowLeft') irA(Math.max(0, tk() - (e.shiftKey ? 10 : 1)));
  else if (e.key === 'ArrowRight') irA(tk() + (e.shiftKey ? 10 : 1));
  else if (e.key === 'Delete' || e.key === 'Backspace') borrarKey();
  else if (e.key.toLowerCase() === 'k') ponerKey();
  else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && auto.S.fase === 'cortes') { e.preventDefault(); auto.marcar(); }
});
// por si se cierra la pestaña justo después de un cambio
window.addEventListener('pagehide', () => { if (tGuardar && !E.fs) { clearTimeout(tGuardar); A.guardarFilm(E.id, E.nombre, FM.paraGuardar(E.film)); } });

// ------------------------------------------------------------------ arranque
async function arrancar() {
  avisarMenu({ titulo: 'Editor' });
  await cargarInterno();
  const pl = await (await fetch('../mocap/datos/plantilla.dat')).arrayBuffer();
  E.plantilla = await leer(new Uint8Array(pl));
  // carpeta bbs recordada (de este modo o del Visor): se usa si el permiso sigue vigente
  for (const [k, db] of [['carpeta', null], ['carpeta', 'visor-bbs']]) {
    try {
      const h = db ? await leerKvVisor(k) : await A.kvLeer(k);
      if (h && h.queryPermission && (await h.queryPermission({ mode: 'read' })) === 'granted') { await fuente.usarCarpeta(h); motores(); break; }
    } catch { /* sin permiso */ }
  }
  const ultimo = await A.kvLeer('ultimo');
  const x = ultimo ? await A.leerFilm(ultimo).catch(() => null) : null;
  if (x) { E.film = adoptar(x.film); E.id = x.id; E.nombre = x.nombre; }
  else {
    E.film = FM.filmNuevo(E.plantilla);
    const i = FM.nuevoActor(E.film, FM.formPersonaje(E.film, 'player/steve_bends', null, ''), 'Steve', 0, 0, 0);
    for (const k of ['yaw', 'bodyYaw', 'headYaw']) FM.ponerProp(E.film.replays[i], k, 0, 180, 'linear');
  }
  $('#nombreFilm').value = E.nombre;
  vista.camara.position.set(2.5, 2.6, -5); vista.orbita.target.set(0, 1, 0); vista.orbita.update();
  botonesDeshacer();
  await refrescar({ rearmar: true });
  if (x) enfocar(null, true);
  auto.iniciar({
    E, el, titulo, boton, vista, aviso, guardarDeshacer, refrescar, dibujarPanel, dibujarLinea, irA, aplicar, play, fin, exportar,
    audioArchivo: () => audioArchivo, cargarAudio: () => $('#inAudio').click(),
    porCamara: (on) => { if (E.porCamara !== on) $('#btnPorCamara').click(); },
  });
  window.__editor = { E, vista, FM, P, FSM, auto, refrescar, irA, A };   // para las pruebas
}
function leerKvVisor(k) {
  return new Promise((res) => {
    const q = indexedDB.open('visor-bbs', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('kv');
    q.onsuccess = () => { try { const g = q.result.transaction('kv').objectStore('kv').get(k); g.onsuccess = () => res(g.result); g.onerror = () => res(null); } catch { res(null); } };
    q.onerror = () => res(null);
  });
}
arrancar().catch((e) => { console.error(e); aviso('No arrancó el editor: ' + (e.message || e), true, 20000); });
