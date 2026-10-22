// Cámaras automáticas en el Editor: el usuario marca dónde cambia la cámara (a mano con la tecla S mientras se reproduce la escena, o con los cortes que
// elige el programa), el programa propone varias tomas para cada tramo (miniaturas dibujadas con la escena 3D de verdad) y el usuario elige la que
// le gusta. Lo elegido se pone como cámaras del film (title «Auto: …»), que se pueden retocar como cualquier otra.
import { F, num } from '../mocap/nucleo/bbsdat.js';
import * as planos from '../director/nucleo/planos.js';
import * as formato from '../director/nucleo/formato.js';

export const S = { fase: 'inicio', cortes: [], tramos: null, avisos: [], solo: null, semilla: 1, ronda: 0 };
let api = null;
export function iniciar(a) { api = a; }
export const ticksCortes = () => S.cortes.map((k) => Math.round(num(k.tick)));
/** Se deshizo o rehizo algo: las propuestas de tomas ya no coinciden con el film, se vuelve a los cortes (que se conservan). */
export function alDeshacer() { if (S.fase === 'elegir') { S.fase = 'cortes'; S.tramos = null; } }
/** Otro film: lo de antes ya no vale. */
export function reiniciar() { S.fase = 'inicio'; S.cortes = []; S.tramos = null; S.avisos = []; S.solo = null; S.semilla = 1; }
export const activo = () => S.fase === 'cortes' || S.fase === 'elegir';
const vf = () => formato.vistaParaCamaras(api.E.film, 'b22', S.solo);
const seg = (t) => (t / 20).toFixed(1) + ' s';
const esAuto = (c) => String(c.title || '').startsWith('Auto:');

// ---------------------------------------------------------------- cortes
function ordenar() { S.cortes.sort((a, b) => num(a.tick) - num(b.tick)); }
/** Pone un corte en el tick de ahora (la tecla S). */
export function marcar() {
  if (S.fase !== 'cortes') return false;
  const t = Math.round(api.E.t);
  if (t <= 0 || ticksCortes().some((x) => Math.abs(x - t) < 3)) return false;
  S.cortes.push({ tick: F(t) }); ordenar();
  api.dibujarLinea();
  const n = document.getElementById('autoN'); if (n) n.textContent = `${S.cortes.length} corte(s)`;
  api.aviso(`✂ Corte en ${seg(t)}`, false, 900);
  return true;
}
function cortesAutomaticos() {
  S.solo ??= formato.actoresPorDefecto(api.E.film, 'b22');
  const v = vf();
  S.cortes = planos.cortesAuto(v, api.fin()).map((t) => ({ tick: F(t) }));
}
/** Se movió o borró un corte en la línea de tiempo. */
export function cambioCortes() {
  ordenar();
  if (S.fase === 'elegir') proponer(false);
}

// ---------------------------------------------------------------- proponer y elegir
function ponerElegidas() {
  const film = api.E.film;
  film.camera = (film.camera || []).filter((c) => !esAuto(c));
  let capa = formato.capaLibre(film, 'Auto');
  if (api.E.fs) capa = Math.max(capa, ...api.E.fs.resto.map((c) => num(c.layer ?? 0) + 1));     // arriba también de los clips de FS que el Editor no muestra
  film.camera.push(...planos.clipsDe(vf(), S.tramos, 'b22', capa));
  api.E.toma = null;
}
async function proponer(conPila = true) {
  S.solo ??= formato.actoresPorDefecto(api.E.film, 'b22');
  if (!S.solo.length) return api.aviso('Elegí al menos un actor para filmar.', true);
  if (conPila && S.fase !== 'elegir') api.guardarDeshacer();
  const r = planos.proponer(vf(), { cortes: ticksCortes(), hasta: api.fin(), semilla: S.semilla });
  S.tramos = r.tramos; S.avisos = r.avisos; S.fase = 'elegir';
  if (!S.tramos.length) { S.fase = 'cortes'; api.aviso('No pude armar cámaras (¿hay actores?).', true); return api.dibujarPanel(); }
  ponerElegidas();
  api.porCamara(true);
  await api.refrescar();
}
function elegir(k, j, mover = true) {
  const t = S.tramos[k]; t.elegida = j;
  ponerElegidas();
  if (mover) api.irA(Math.round(t.desde + (t.hasta - t.desde) * 0.4));
  api.porCamara(true);
  api.refrescar({ panel: false });
}

// la vista (x, y, z, yaw, pitch, fov) de una opción a mitad del tramo
function vistaDe(t, o) {
  const mid = (t.hasta - t.desde) / 2;
  const q = o.toma.puntos.reduce((a, b) => (Math.abs(b[0] - mid) < Math.abs(a[0] - mid) ? b : a));
  return { x: q[1], y: q[2], z: q[3], yaw: q[4], pitch: q[5], fov: o.toma.fov, roll: 0 };
}
// dibuja las miniaturas con la escena de verdad (de a un tramo por vez para no trabar)
async function miniaturas(canvases, ronda) {
  for (let k = 0; k < S.tramos.length; k++) {
    if (ronda !== S.ronda) return;
    const t = S.tramos[k];
    api.vista.aplicar(api.E.film, t.desde + (t.hasta - t.desde) / 2);
    t.opciones.forEach((o, j) => { const cv = canvases[k][j]; if (cv) api.vista.captura(vistaDe(t, o), cv); });
    await new Promise((r) => setTimeout(r, 0));
  }
  if (ronda === S.ronda) api.aplicar();      // todos como estaban en el tiempo de ahora
}

// ---------------------------------------------------------------- el panel
export function panel(frag) {
  const { el, titulo, boton, E } = api;
  S.ronda++;
  frag.append(titulo('🤖 Automatizar cámaras'));
  if (S.fase === 'inicio') {
    frag.append(el('div', { class: 'ayuda' }, 'Marcás dónde cambia la cámara y el programa te propone varias tomas para cada tramo; vos elegís la que te guste.'));
    frag.append(el('div', { class: 'fila' }, boton('🤖 Automatizar cámaras', () => { S.fase = 'modo'; api.dibujarPanel(); }, { class: 'principal' })));
    return;
  }
  if (S.fase === 'modo') {
    frag.append(el('div', { class: 'ayuda' }, '¿Quién decide los cortes de cámara?'));
    frag.append(el('div', { class: 'fila' },
      boton('🤖 Que los elija el programa', () => { cortesAutomaticos(); S.fase = 'cortes'; api.dibujarLinea(); api.dibujarPanel(); }, { class: 'principal' }),
      boton('✋ Los marco yo (tecla S)', () => { S.cortes = []; S.fase = 'cortes'; api.dibujarLinea(); api.dibujarPanel(); })));
    frag.append(el('div', { class: 'fila' }, boton('← Cancelar', () => { S.fase = 'inicio'; api.dibujarPanel(); })));
    return;
  }
  // actores a filmar
  S.solo ??= formato.actoresPorDefecto(E.film, 'b22');
  const quienes = el('div', { class: 'chips' });
  E.film.replays.forEach((r, i) => {
    const f = r.form || {}; if (!f.model && f.id !== 'bbs:mob') return;
    const on = S.solo.includes(i);
    quienes.append(boton((on ? '🎥 ' : '▫️ ') + planos.nombreActor(E.film, i), () => { S.solo = on ? S.solo.filter((x) => x !== i) : [...S.solo, i].sort((a, b) => a - b); if (S.fase === 'elegir') proponer(false); else api.dibujarPanel(); }, { class: on ? 'elegido' : '', title: on ? 'Se filma. Tocá para dejarlo afuera' : 'No se filma. Tocá para incluirlo' }));
  });
  if (S.fase === 'cortes') {
    frag.append(el('div', { class: 'ayuda' }, el('b', {}, 'Paso 1: los cortes. '), 'Reproducí la escena y apretá ', el('b', {}, 'S'), ' (o el botón ✂) en cada momento donde quieras otra cámara. Después los podés arrastrar en la línea de tiempo (fila ✂ Cortes). Para poner un audio, cargalo acá.'));
    frag.append(el('div', { class: 'fila' },
      boton(E.play ? '⏸ Pausa' : '▶ Reproducir', () => { api.play(); api.dibujarPanel(); }, { class: 'principal' }),
      boton('✂ Marcar corte aquí (S)', () => marcar()),
      el('span', { id: 'autoN', class: 'nota' }, `${S.cortes.length} corte(s)`)));
    frag.append(el('div', { class: 'fila' },
      boton('↶ Quitar el último', () => { S.cortes.pop(); api.dibujarLinea(); api.dibujarPanel(); }, { disabled: !S.cortes.length }),
      boton('🗑 Borrar todos', () => { S.cortes = []; api.dibujarLinea(); api.dibujarPanel(); }, { disabled: !S.cortes.length }),
      boton('🤖 Cortes del programa', () => { cortesAutomaticos(); api.dibujarLinea(); api.dibujarPanel(); }),
      boton(api.audioArchivo() ? '🎵 Cambiar audio' : '🎵 Cargar audio', () => api.cargarAudio())));
    frag.append(el('div', { class: 'nota' }, 'A quién filmar:'), quienes);
    frag.append(el('div', { class: 'fila' },
      boton('➡ Paso 2: proponer cámaras', () => proponer(), { class: 'principal' }),
      boton('← Atrás', () => { S.fase = 'modo'; api.dibujarLinea(); api.dibujarPanel(); })));
    return;
  }
  // elegir
  frag.append(el('div', { class: 'ayuda' }, el('b', {}, 'Paso 2: elegí la toma de cada tramo. '), 'Tocá una miniatura (el recuadro naranja es la elegida): la vista grande te muestra esa cámara y se pone en el film. ▶ reproduce toda la escena con las cámaras elegidas.'));
  frag.append(el('div', { class: 'fila' },
    boton(E.play ? '⏸ Pausa' : '▶ Ver todo', () => { if (!E.play) { api.porCamara(true); api.irA(0); } api.play(); api.dibujarPanel(); }, { class: 'principal' }),
    boton('🎲 Otra tanda', () => { S.semilla++; proponer(false); }),
    boton('✂ Volver a los cortes', () => { S.fase = 'cortes'; api.dibujarLinea(); api.dibujarPanel(); }),
    boton('💾 Exportar a BBS', () => api.exportar())));
  frag.append(el('div', { class: 'nota' }, 'A quién filmar:'), quienes);
  for (const a of S.avisos) frag.append(el('div', { class: 'aviso-guion' }, '• ' + a));
  const canvases = [];
  S.tramos.forEach((t, k) => {
    canvases[k] = [];
    const g = el('div', { class: 'opcionesCam' });
    t.opciones.forEach((o, j) => {
      const cv = el('canvas', { width: 320, height: 180 });
      canvases[k][j] = cv;
      const b = el('button', { class: 'opCam' + (j === t.elegida ? ' elegida' : ''), title: o.nombre, onclick: () => { g.querySelectorAll('.opCam').forEach((x, n) => x.classList.toggle('elegida', n === j)); elegir(k, j); } },
        cv, el('span', { class: 'nomCam' }, o.nombre), el('span', { class: 'subCam' }, o.sujetos.map((i) => planos.nombreActor(E.film, i)).join(' y ') + (o.oclusion >= 0.35 ? ' · ⚠ tapado' : '')));
      g.append(b);
    });
    frag.append(el('div', { class: 'tramoCam' }, el('div', { class: 'cabCam' }, el('b', {}, `Tramo ${k + 1}`), ` ${seg(t.desde)} – ${seg(t.hasta)}`, t.activos.length ? el('span', { class: 'nota' }, ' · se mueve: ' + t.activos.map((i) => planos.nombreActor(E.film, i)).join(', ')) : null), g));
  });
  const ronda = S.ronda;
  setTimeout(() => miniaturas(canvases, ronda), 30);
}
