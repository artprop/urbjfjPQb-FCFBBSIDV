// Página "Capas automáticas": actores, voces (quién dice cada parte) y generar boca, parpadeos y mirada.
import { $, esc, color, estado, app, audio, guardarFilm, abrirSalida } from './app.js';
import * as A from './local/almacen.js';
import { Fuentes } from './local/fuentes.js';
import * as capas from './nucleo/capas.js';
import { segmentosVoz } from './nucleo/audio.js';
import { cortarWav, esWav, hacerWav } from './nucleo/wav.js';
import { rhubarb } from '../comun/plataforma.js';

let C = null;                    // lo abierto: {actores, clips, extras, defecto}
const posesOjos = {};            // eyes / eyes_1px -> poses.json (para la pose 'closed')
const formas = new Map();        // clave del audio -> formas de Rhubarb

const seg2txt = (s) => { const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); };
const nombreAudio = (id) => Fuentes.nombreAudio(id);

export function iniciar() {
  for (const m of ['eyes', 'eyes_1px']) fetch(`../mocap/datos/ojos/${m}/poses.json`).then((r) => r.json()).then((d) => { posesOjos[m] = d; }).catch(() => {});
  $('actores').addEventListener('change', guardarPlan);
  $('clips').addEventListener('click', clic);
  $('clips').addEventListener('change', cambio);
  $('inExtra').onchange = agregarExtra;
  $('btnGenerarCapas').onclick = generar;
  $('btnSalidaCapas').onclick = abrirSalida;
  for (const id of ['pmin', 'pmax', 'semilla']) $(id).addEventListener('change', guardarPlan);
}

// ---------------------------------------------------------------- abrir (como app.abrir de la PC)
async function tramosDe(archivo, a, z) {
  try { return segmentosVoz(await audio(archivo), a, z); } catch (e) { console.warn(e); return null; }
}

export async function abrir() {
  const film = app.film;
  if (!film) return;
  estado('estadoCapas', '');
  const reps = film.replays || [];
  const actores = reps.map((r, i) => {
    const pb = capas.parteBoca(r, app.bocas), po = capas.parteOjos(r);
    const modelo = String((r.form || {}).model || '');
    return { i, nombre: capas.nombreActor(r, i), boca: pb ? pb.modelo.split('/').pop() : null, ojos: po ? po.modelo : null,
      boca_animada: Boolean(pb) && capas.tienePistas(r, `${pb.idx}/pose/`),
      ojos_animados: Boolean(po) && capas.tienePistas(r, `${po.idx}/pose/`, capas.HUESOS_OJOS),
      cabeza_ok: ['steve', 'alex'].some((m) => modelo.includes(m)), cabeza_animada: capas.cabezaAnimada(r) };
  });
  const conBoca = actores.filter((a) => a.boca).map((a) => a.i);
  const defecto = conBoca.length === 1 ? conBoca[0] : -1;
  estado('estadoCapas', 'Buscando las partes con voz…');
  const clips = [];
  for (const c of capas.clipsAudio(film, (a) => app.fuentes.archivoDe(a))) {
    const [desde, hasta] = capas.rangoAudio(c);
    const segs = c.archivo ? await tramosDe(c.archivo, desde, hasta) : [];
    clips.push({ ...c, desde, hasta, segmentos: segs || [], error: segs === null });
  }
  C = { actores, clips, extras: [], defecto };
  const p = await A.leerKV('plan:' + app.filmNombre).catch(() => null);
  if (p) {               // lo que se eligió la última vez para este film
    for (const c of C.clips) {
      const mios = (p.tramos || []).filter((t) => String(t.clip) === String(c.i));
      if (mios.length) { c.segmentos = mios.map((t) => [t.a, t.z]); c.quien = mios.map((t) => t.actor); if (mios[0].archivo) c.archivo = mios[0].archivo; }
    }
    for (const [k, e] of (p.extras || []).entries()) {
      const mios = (p.tramos || []).filter((t) => t.clip === 'x' + k);
      let segundos = 0;
      try { const au = await audio(e.archivo); segundos = au.d.length / au.sr; } catch { /* ya no está */ }
      C.extras.push({ ...e, segundos, segmentos: mios.map((t) => [t.a, t.z]), quien: mios.map((t) => t.actor) });
    }
    $('pmin').value = p.parpadeo_min ?? 1.2; $('pmax').value = p.parpadeo_max ?? 3.5; $('semilla').value = p.semilla ?? 1;
  }
  for (const c of [...C.clips, ...C.extras]) if (!c.quien) c.quien = c.segmentos.map(() => defecto);
  pintarActores(p);
  pintarClips();
  $('capasTrabajo').hidden = false;
  estado('estadoCapas', C.clips.length || C.extras.length ? '' : 'Este film no tiene audios. Agregá uno con "+ Agregar un audio".');
}

// ---------------------------------------------------------------- pintar
function pintarActores(plan) {
  const op = (plan && plan.actores) || {};
  const notaBoca = app.rhubarb ? '' : ' (simple)';
  $('actores').innerHTML = C.actores.map((a) => {
    const o = op[a.i] || {};
    const cb = (k, txt, ok, def, nota, aviso) => `<label class="${ok ? '' : 'no'}"><input type="checkbox" data-a="${a.i}" data-k="${k}" ${ok ? '' : 'disabled'} ${ok && (o[k] ?? def) ? 'checked' : ''}>${txt}${nota ? ` <span class="tag ${aviso ? 'aviso' : ''}">${esc(nota)}</span>` : ''}</label>`;
    return `<div class="actor"><span class="nombre"><span class="chip" style="background:${color(a.i)}"></span>${esc(a.nombre)}</span>`
      + cb('boca', 'Boca' + (a.boca ? notaBoca : ''), !!a.boca, true, !a.boca ? 'sin boca' : (a.boca_animada ? 'ya tiene: se reemplaza' : a.boca), a.boca_animada)
      + cb('parpadeo', 'Parpadeo', !!a.ojos, !a.ojos_animados, !a.ojos ? 'sin ojos' : (a.ojos_animados ? 'ya tiene: se reemplaza' : ''), a.ojos_animados)
      + cb('mirada', 'Mirada', !!a.ojos, !a.ojos_animados, '')
      + cb('cabeza', 'Cabeza', a.cabeza_ok, false, '') + '</div>';
  }).join('') || '<p class="suave">Este film no tiene actores.</p>';
}

function opcionesActor(sel) {
  return (sel === -2 ? '<option value="-2" selected>elegir…</option>' : '') + `<option value="-1" ${sel === -1 ? 'selected' : ''}>— nadie —</option>`
    + C.actores.map((a) => `<option value="${a.i}" ${a.i === sel ? 'selected' : ''}>${esc(a.nombre)}${a.boca ? '' : ' (sin boca)'}</option>`).join('');
}

const todos = () => [...C.clips.map((c) => ({ c, id: String(c.i), extra: false })), ...C.extras.map((c, k) => ({ c, id: 'x' + k, extra: true }))];
const clipDe = (id) => (String(id).startsWith('x') ? C.extras[+String(id).slice(1)] : C.clips.find((c) => String(c.i) === String(id)));

function pintarClips() {
  $('clips').innerHTML = todos().map(({ c, id, extra }) => {
    const desde = extra ? 0 : c.desde, hasta = extra ? c.segundos : c.hasta, largo = Math.max(0.01, hasta - desde);
    const barra = c.segmentos.map((s, k) => `<div style="left:${(s[0] - desde) / largo * 100}%;width:${Math.max(0.3, (s[1] - s[0]) / largo * 100)}%;background:${color(c.quien[k])}"></div>`).join('');
    const filas = c.segmentos.map((s, k) => `<div class="seg">
        <button data-play="${id}|${k}" aria-label="Escuchar">▶</button>
        <span class="rango"><input type="number" step="0.05" value="${s[0]}" data-ed="${id}|${k}|0" inputmode="decimal" aria-label="Desde (segundos)"> a
          <input type="number" step="0.05" value="${s[1]}" data-ed="${id}|${k}|1" inputmode="decimal" aria-label="Hasta (segundos)"> s</span>
        <span class="tick">tick ${Math.round(c.tick + (s[0] * 20 - (extra ? 0 : c.offset)))}</span>
        <span class="chip" style="background:${color(c.quien[k])}"></span><select data-q="${id}|${k}" aria-label="Quién lo dice">${opcionesActor(c.quien[k])}</select>
        <span class="acc"><button data-partir="${id}|${k}" title="Parte este tramo en dos (cuando hablan dos seguidos sin pausa)">Partir</button>
          <button data-borrar="${id}|${k}" title="Sacar este tramo" aria-label="Sacar este tramo">✕</button></span></div>`).join('');
    const nombre = extra ? nombreAudio(c.archivo) : c.audio.replace('assets:audio/', '');
    return `<div class="clip">
      <div class="cab"><b>${esc(nombre)}</b>
        <span class="suave">${extra ? 'agregado a mano, ' : ''}empieza en el tick ${Math.round(c.tick)} · ${seg2txt(largo)} de audio</span>
        ${!c.archivo ? '<span class="estado mal" style="margin:0">no encuentro el archivo</span>' : ''}
        ${c.error ? '<span class="estado mal" style="margin:0">no pude leer este audio</span>' : ''}
        <label class="boton">${c.archivo ? 'Cambiar archivo…' : 'Buscar archivo…'}<input type="file" data-buscar="${id}" accept=".wav,.ogg,.mp3,audio/*" hidden></label>
        ${c.segmentos.length ? `<span class="suave">Todo este audio es de:</span><select data-todo="${id}" aria-label="Todo este audio es de">${opcionesActor(-2)}</select>` : ''}
        ${extra ? `<button data-quitar="${id.slice(1)}">Quitar este audio</button>` : ''}
      </div>
      <div class="barra">${barra}</div>
      ${c.segmentos.length ? `<div class="segs">${filas}</div>` : (c.archivo ? '<p class="suave">No encontré partes con voz en este audio.</p>' : '')}
    </div>`;
  }).join('') || '<p class="suave">Este film no tiene audios.</p>';
}

// ---------------------------------------------------------------- eventos
async function clic(ev) {
  const t = ev.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.play) {
    const [id, k] = d.play.split('|'); const c = clipDe(id); const s = c.segmentos[+k];
    if (!c.archivo) return estado('estadoCapas', 'Primero elegí el archivo de este audio.', 'mal');
    const a = $('audio');
    if (a.src) URL.revokeObjectURL(a.src);
    a.src = URL.createObjectURL(new Blob([cortarWav(await audio(c.archivo), s[0], s[1])], { type: 'audio/wav' }));
    a.play().catch(() => {});
  } else if (d.partir) {
    const [id, k] = d.partir.split('|'); const c = clipDe(id); const s = c.segmentos[+k]; const m = +((s[0] + s[1]) / 2).toFixed(2);
    c.segmentos.splice(+k, 1, [s[0], m], [m, s[1]]); c.quien.splice(+k, 0, c.quien[+k]); pintarClips(); guardarPlan();
  } else if (d.borrar) {
    const [id, k] = d.borrar.split('|'); const c = clipDe(id); c.segmentos.splice(+k, 1); c.quien.splice(+k, 1); pintarClips(); guardarPlan();
  } else if (d.quitar !== undefined) {
    C.extras.splice(+d.quitar, 1); pintarClips(); guardarPlan();
  }
}

async function cambio(ev) {
  const el = ev.target, d = el.dataset;
  if (d.q) { const [id, k] = d.q.split('|'); clipDe(id).quien[+k] = +el.value; pintarClips(); }
  else if (d.todo) { const c = clipDe(d.todo); const v = +el.value; if (v >= -1) { c.quien = c.segmentos.map(() => v); pintarClips(); } }
  else if (d.ed) { const [id, k, w] = d.ed.split('|'); clipDe(id).segmentos[+k][+w] = +el.value; pintarClips(); }
  else if (d.buscar) {
    const f = el.files[0]; if (!f) return;
    const id = await app.fuentes.importarAudio(f);
    const c = clipDe(d.buscar), extra = d.buscar.startsWith('x');
    c.archivo = id; c.error = false;
    app.audios.delete(id);
    let a = 0, z = c.hasta;
    if (extra) { const au = await audio(id).catch(() => null); z = c.segundos = au ? au.d.length / au.sr : 0; } else a = c.desde;
    const segs = await tramosDe(id, a, z);
    c.error = segs === null; c.segmentos = segs || []; c.quien = c.segmentos.map(() => C.defecto); pintarClips();
  } else return;
  guardarPlan();
}

async function agregarExtra(ev) {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f || !C) return;
  const id = await app.fuentes.importarAudio(f);
  app.audios.delete(id);
  try {
    const au = await audio(id);
    const segundos = au.d.length / au.sr, segmentos = segmentosVoz(au, 0, segundos);
    C.extras.push({ archivo: id, tick: +$('extraTick').value || 0, segundos, segmentos, quien: segmentos.map(() => C.defecto) });
    pintarClips(); guardarPlan();
  } catch (e) { estado('estadoCapas', 'No pude leer ese audio: ' + e.message, 'mal'); }
}

// ---------------------------------------------------------------- plan y generar
function armarPlan() {
  const actores = {};
  for (const cb of document.querySelectorAll('#actores input[type=checkbox]')) (actores[cb.dataset.a] ??= {})[cb.dataset.k] = cb.checked && !cb.disabled;
  const tramos = [];
  C.clips.forEach((c) => c.segmentos.forEach((s, k) => tramos.push({ clip: c.i, archivo: c.archivo, a: s[0], z: s[1], actor: c.quien[k] })));
  C.extras.forEach((c, j) => c.segmentos.forEach((s, k) => tramos.push({ clip: 'x' + j, archivo: c.archivo, a: s[0], z: s[1], actor: c.quien[k] })));
  return { tramos, extras: C.extras.map((e) => ({ archivo: e.archivo, tick: e.tick })), actores,
    semilla: +$('semilla').value || 0, parpadeo_min: +$('pmin').value, parpadeo_max: +$('pmax').value };
}
function guardarPlan() { if (C && app.film) A.guardarKV('plan:' + app.filmNombre, armarPlan()).catch(() => {}); }

// Formas de Rhubarb de un audio entero (solo PC). Quedan guardadas en la app mientras no cambie el archivo.
async function formasDe(id) {
  const { bytes, clave } = await app.fuentes.leerAudio(id);
  if (formas.has(clave)) return formas.get(clave);
  let cues = await A.leerKV('rhubarb:' + clave).catch(() => null);
  if (!cues) {
    const wav = esWav(bytes) ? bytes : (() => { const au = app.audios.get(id); return hacerWav(au.sr, au.d); })();
    cues = (await rhubarb(wav)).mouthCues;
    await A.guardarKV('rhubarb:' + clave, cues).catch(() => {});
  }
  formas.set(clave, cues);
  return cues;
}

async function generar() {
  if (!C) return;
  const plan = armarPlan();
  const sinAsignar = plan.tramos.filter((t) => t.actor < 0).length;
  $('btnGenerarCapas').disabled = true;
  estado('estadoCapas', 'Generando…' + (app.rhubarb ? ' (la primera vez con cada audio tarda unos segundos más)' : ''));
  try {
    // audios que se usan, y las formas de Rhubarb si hay (si no: boca simple)
    const usados = [...new Set([...plan.tramos.filter((t) => t.actor >= 0).map((t) => t.archivo), ...plan.extras.map((e) => e.archivo)].filter(Boolean))];
    for (const id of usados) await audio(id);
    const cues = new Map(), avisos = [];
    const conBoca = new Set(Object.entries(plan.actores).filter(([, o]) => o.boca).map(([i]) => +i));
    if (app.rhubarb) {
      for (const id of new Set(plan.tramos.filter((t) => conBoca.has(t.actor) && t.archivo).map((t) => t.archivo))) {
        try { cues.set(id, await formasDe(id)); } catch (e) { avisos.push(`⚠ Rhubarb no pudo con ${nombreAudio(id)} (${e.message}): esa boca salió simple.`); }
      }
    }
    const ctx = { bocas: app.bocas, archivoDe: (a) => app.fuentes.archivoDe(a), audio: (id) => app.audios.get(id),
      cues: (id) => cues.get(id) || null, posesOjos: (m) => posesOjos[m] || {} };
    const [nuevo, resumen] = capas.aplicar(app.film, plan, ctx);
    await A.guardarKV('plan:' + app.filmNombre, plan);
    const donde = await guardarFilm(app.filmNombre + '_auto.dat', nuevo);
    let txt = `✔ Listo. ${donde}\n\nCopialo a la carpeta de films de BBS (con otro nombre si no querés pisar el original).\n`;
    let simple = false;
    for (const a of Object.values(resumen)) {
      const p = [];
      if (a.boca !== undefined) p.push(a.boca + ' cambios de boca' + (a.boca_simple ? ' (boca simple)' : ''));
      if (a.parpadeos) p.push(a.parpadeos + ' parpadeos');
      if (a.miradas) p.push(a.miradas + ' cambios de mirada');
      if (a.giros_cabeza) p.push(a.giros_cabeza + ' giros de cabeza');
      if (a.aviso_boca) p.push('⚠ ' + a.aviso_boca);
      if (a.aviso_ojos) p.push('⚠ ' + a.aviso_ojos);
      if (a.boca_simple) simple = true;
      if (p.length) txt += '\n' + a.nombre + ': ' + p.join(', ');
    }
    if (simple && !app.rhubarb) txt += '\n\nBoca simple: se abre y se cierra con el volumen de la voz. Para la boca exacta, generalo en la PC.';
    if (avisos.length) txt += '\n\n' + avisos.join('\n');
    if (sinAsignar) txt += `\n\n(${sinAsignar} tramo(s) de voz sin actor: no se animaron)`;
    estado('estadoCapas', txt, 'ok');
  } catch (e) {
    console.warn(e);
    estado('estadoCapas', 'No se pudo generar: ' + e.message, 'mal');
  }
  $('btnGenerarCapas').disabled = false;
}
