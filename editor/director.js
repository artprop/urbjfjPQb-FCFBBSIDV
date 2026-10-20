// Pestaña "Director" del Editor: el guion de escena del Director (quién camina adónde, quién mira a quién, poses, saltos...) se arma
// directamente sobre la escena que está abierta, y después todo se retoca con las herramientas del Editor (la línea de tiempo,
// las poses, las cámaras). El guion es la base; el Editor es el detalle. También arma cámaras automáticas con reglas de composición.
import * as escena from '../director/nucleo/escena.js';
import * as camaras from '../director/nucleo/camaras_auto.js';
import * as capas from '../director/nucleo/capas.js';
import { bocaSimple } from '../director/nucleo/audio.js';

// lo que hay que recordar entre una vez y otra que se dibuja el panel
const D = {
  guion: null, base: null, acciones: [], plan: [], avisos: [], error: '',
  tipos: new Set(camaras.TODAS), semilla: 1, inicioGeneral: true, cierreGeneral: false, camarasAlGenerar: true,
};
const claveGuion = (api) => 'editor_guion_' + (api.E.id || 'nuevo');
const leerGuion = (api) => { try { return localStorage.getItem(claveGuion(api)) || ''; } catch { return ''; } };
const guardarGuion = (api, t) => { try { localStorage.setItem(claveGuion(api), t); } catch { /* sin almacenamiento */ } };

/** Cuando se abre o se crea otro film: lo generado antes ya no vale como base. */
export function reiniciarDirector() { D.guion = null; D.base = null; D.acciones = []; D.plan = []; D.avisos = []; D.error = ''; }

const EJEMPLO = `// Un guion, una orden por línea. "+" al principio = al mismo tiempo que la línea anterior.
// Usá los nombres de los actores (tocalos abajo) o su número (#2).
Steve mira a Alex
espera 1s
Steve camina hasta Alex
+ Alex mira a Steve
Alex pose saludar 2s`;

const VERBOS = [
  ['camina hasta', 'camina hasta '], ['corre hasta', 'corre hasta '], ['mira a', 'mira a '], ['gira hacia', 'gira hacia '], ['salta', 'salta'],
  ['pose', 'pose '], ['señala a', 'senala a '], ['entra', 'entra'], ['aparece', 'aparece'], ['desaparece', 'desaparece'],
  ['queda quieto 3s', 'queda quieto 3s'], ['espera 2s', 'espera 2s'], ['+ al mismo tiempo', '+ '],
];

async function cargarPoses(api, film) {
  const cache = {}, extra = {};
  for (const rep of film.replays || []) {
    for (const g of escena.gruposDePoses(rep)) {
      if (!g || g in cache) continue;
      try { const d = await api.modelos.datos(g); cache[g] = (d && d.poses) || null; } catch { cache[g] = null; }
    }
  }
  try { for (const p of await api.A.presets('pose')) extra[p.nombre] = p.datos; } catch { /* sin presets */ }
  return (rep) => ({ ...escena.posesDisponibles(rep, (g) => [cache[g] || null, null]), ...extra });
}

D.semillaParp = 1;
let TABLA_BOCAS = {};
fetch(new URL('../director/nucleo/bocas.json', import.meta.url)).then((r) => r.json()).then((j) => { delete j._ayuda; TABLA_BOCAS = j; }).catch(() => {});
const posesOjosCache = {};
async function posesOjos(modelo) {
  if (!posesOjosCache[modelo]) posesOjosCache[modelo] = await fetch(new URL(`../mocap/datos/ojos/${modelo}/poses.json`, import.meta.url)).then((r) => r.json()).catch(() => ({}));
  return posesOjosCache[modelo];
}

async function parpadeos(api) {
  const { E } = api;
  const conOjos = E.film.replays.map((r, i) => i).filter((i) => capas.parteOjos(E.film.replays[i]));
  if (!conOjos.length) return api.aviso('Ningún actor tiene ojos (player/eyes o eyes_1px) como parte del modelo.', true, 5000);
  const cache = {}; for (const i of conOjos) { const m = capas.parteOjos(E.film.replays[i]).modelo; cache[m] = await posesOjos(m); }
  api.guardarDeshacer();
  const plan = { tramos: [], extras: [], actores: Object.fromEntries(conOjos.map((i) => [String(i), { parpadeo: true }])), semilla: D.semillaParp };
  try {
    const [nuevo, resumen] = capas.aplicar(E.film, plan, { audio: () => ({ sr: 1, d: [] }), posesOjos: (m) => cache[m] || {}, bocas: TABLA_BOCAS });
    E.film = api.adoptar(nuevo, true);
    const n = Object.values(resumen).reduce((s, r) => s + (r.parpadeos || 0), 0);
    await api.refrescar({ rearmar: true });
    api.aviso(`Parpadeos puestos: ${n} en ${conOjos.length} actor(es).`);
  } catch (e) { api.aviso('No se pudo: ' + (e.message || e), true, 6000); }
}

async function decodificar(archivo) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const c = new Ctx();
  try { const b = await c.decodeAudioData(await archivo.arrayBuffer()); return { sr: b.sampleRate, d: b.getChannelData(0) }; } finally { c.close && c.close(); }
}
async function bocaConAudio(api, i, tickIni) {
  const { E } = api, archivo = api.audioArchivo();
  if (!archivo) return api.aviso('Primero cargá un audio: pestaña 📁 Film → Audio de referencia.', true, 5000);
  const rep = E.film.replays[i], pb = rep && capas.parteBoca(rep, TABLA_BOCAS);
  if (!pb) return api.aviso('Ese actor no tiene una boca conocida (boca_Man o boca_Woman) como parte del modelo.', true, 6000);
  try {
    const au = await decodificar(archivo), seg = au.d.length / au.sr;
    const cues = bocaSimple(au, 0, seg);
    if (!cues.length) return api.aviso('No encontré voz en ese audio.', true);
    api.guardarDeshacer();
    const [pistas, total] = capas.bocaVarios(pb, [[{ tick: tickIni * 20, offset: 0 }, 0, seg, cues]]);
    const an = (rep.animation ??= {});
    for (const k of Object.keys(an)) if (k.startsWith(`${pb.idx}/pose/`)) delete an[k];
    Object.assign(an, pistas);
    await api.refrescar({ rearmar: true });
    api.aviso(`Boca puesta: ${total} formas siguiendo la voz (${seg.toFixed(1)} s).`);
  } catch (e) { api.aviso('No se pudo leer ese audio: ' + (e.message || e), true, 6000); }
}

const quitarAuto = (film) => { film.camera = (film.camera || []).filter((c) => !String(c.title || '').startsWith('Auto:')); };

function opcionesCamaras() {
  return { tipos: [...D.tipos], semilla: D.semilla, inicioGeneral: D.inicioGeneral, cierreGeneral: D.cierreGeneral, acciones: D.acciones.length ? D.acciones : null };
}
function ponerCamaras(film) {
  quitarAuto(film);
  const r = camaras.camarasAuto(film, opcionesCamaras());
  film.camera ??= [];
  film.camera.push(...r.clips);
  D.plan = r.plan; D.avisos = [...D.avisos, ...r.avisos];
  return r;
}

async function generar(api, guion) {
  const { E, FM } = api;
  D.error = ''; D.avisos = [];
  guardarGuion(api, guion);
  if (!E.film.replays.length) { D.error = 'La escena no tiene actores: agregá al menos uno en 👥 Actores.'; return api.dibujarPanel(); }
  if (D.base && !confirm('Esta escena ya se generó una vez. Si volvés a generar, se arma de nuevo desde cómo estaba antes y se pierden los retoques que hiciste después. ¿Seguir? (Se puede deshacer con ↶.)')) return;
  const base = D.base || api.clonar(E.film);
  let poses;
  try { poses = await cargarPoses(api, base); } catch { poses = () => ({}); }
  let resultado;
  try { resultado = escena.armar(base, guion, poses, null); }
  catch (e) {
    D.error = e.message || String(e);
    if (e.linea) marcarLinea(e.linea);
    return api.dibujarPanel();
  }
  const [nuevo, acciones, avisos] = resultado;
  api.guardarDeshacer();
  D.base = D.base || base;
  D.acciones = acciones.filter((a) => a.actor >= 0 && !String(a.tipo || '').startsWith('cámara'));
  D.avisos = [...avisos];
  D.plan = [];
  api.E.film = api.adoptar(nuevo, true);
  if (D.camarasAlGenerar && !(nuevo.camera || []).some((c) => String(c.title || '').startsWith('Director:'))) ponerCamaras(api.E.film);
  api.E.toma = null; api.E.i = -1; api.E.hueso = null; api.E.key = null;
  await api.refrescar({ rearmar: true });
  api.enfocar(null, true);
  api.irA(0);
  api.aviso(`Escena armada: ${acciones.length} acciones` + (D.plan.length ? ` y ${D.plan.length} cámaras.` : '.'), false, 4000);
}

function marcarLinea(n) {
  const t = document.getElementById('dirGuion'); if (!t) return;
  const lineas = t.value.split('\n'); let a = 0;
  for (let k = 0; k < n - 1; k++) a += lineas[k].length + 1;
  t.focus(); t.setSelectionRange(a, a + (lineas[n - 1] || '').length);
}

async function soloCamaras(api) {
  const { E } = api;
  if (!E.film.replays.length) return api.aviso('No hay actores en la escena.', true);
  api.guardarDeshacer();
  D.avisos = [];
  const r = ponerCamaras(E.film);
  E.toma = null;
  await api.refrescar();
  api.aviso(r.plan.length ? `${r.plan.length} cámaras puestas (están en 🎥 Cámaras, para retocarlas).` : 'No se pudo armar ninguna cámara.', !r.plan.length);
}

function insertar(texto) {
  const t = document.getElementById('dirGuion'); if (!t) return;
  const a = t.selectionStart, b = t.selectionEnd, v = t.value;
  const antes = v.slice(0, a), tail = v.slice(b);
  const sep = antes && !/\s$/.test(antes) ? ' ' : '';
  t.value = antes + sep + texto + tail;
  const p = (antes + sep + texto).length; t.focus(); t.setSelectionRange(p, p);
  t.dispatchEvent(new Event('input'));
}

export async function panelDirector(frag, api) {
  const { E, el, titulo, boton, FM } = api;
  if (D.guion === null) D.guion = leerGuion(api);
  frag.append(titulo('Guion de escena'));
  frag.append(el('div', { class: 'nota' }, 'Escribí qué hace cada actor y el Editor arma la escena directamente acá. Después la retocás con la línea de tiempo, las poses y las cámaras como siempre. Los actores tienen que estar ya ubicados.'));
  const area = el('textarea', { id: 'dirGuion', rows: 9, spellcheck: false, placeholder: EJEMPLO, 'aria-label': 'Guion de escena' });
  area.value = D.guion;
  area.addEventListener('input', () => { D.guion = area.value; guardarGuion(api, area.value); });
  frag.append(area);
  if (D.error) frag.append(el('div', { class: 'error-guion' }, '⚠ ' + D.error));
  // actores y órdenes para tocar
  const actores = E.film.replays.map((r, i) => ({ r, i })).filter(({ r }) => !escena.esMarca(r));
  const ch = el('div', { class: 'chips' });
  for (const { r, i } of actores) ch.append(boton('👤 ' + FM.nombre(r, i), () => insertar(escena.nombreCorto(r, i).includes(' ') ? `#${i + 1}` : FM.nombre(r, i))));
  frag.append(ch);
  const vb = el('div', { class: 'chips' });
  for (const [t, v] of VERBOS) vb.append(boton(t, () => insertar(v.trimEnd() + (v.endsWith(' ') ? ' ' : ''))));
  frag.append(vb);
  const r = E.film.replays[E.i];
  if (r) {
    try {
      const poses = (await cargarPoses(api, { replays: [r] }))(r);
      const nombres = Object.keys(poses).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (nombres.length) {
        const sel = el('select', { 'aria-label': 'Pose de ' + FM.nombre(r, E.i) }, el('option', { value: '' }, `Poses de ${FM.nombre(r, E.i)}…`), ...nombres.map((n) => el('option', { value: n }, n.replace(/_/g, ' '))));
        sel.addEventListener('change', () => { if (sel.value) insertar(`pose ${sel.value}`); sel.value = ''; });
        frag.append(el('div', { class: 'fila' }, sel));
      }
    } catch { /* sin poses */ }
  }
  const camAl = el('input', { type: 'checkbox', checked: D.camarasAlGenerar });
  camAl.addEventListener('change', () => { D.camarasAlGenerar = camAl.checked; });
  frag.append(el('label', { class: 'fila' }, camAl, 'Poner también cámaras automáticas'));
  frag.append(el('div', { class: 'fila' },
    boton(D.base ? '🔄 Volver a generar' : '▶ Generar en la escena', () => generar(api, area.value || ''), { class: 'principal' }),
    boton('🧹 Quitar lo generado', () => quitarGenerado(api), { disabled: !D.base }),
    boton('📌 Dejar lo de ahora como base', () => { D.base = null; D.plan = []; api.aviso('Lo que hay ahora queda como punto de partida: el próximo guion se arma encima.'); api.dibujarPanel(); }, { disabled: !D.base })));
  if (D.base) frag.append(el('div', { class: 'nota' }, 'Ya hay una escena generada. «Volver a generar» la arma otra vez desde cómo estaba antes del guion (los retoques de después se pierden; ↶ los recupera).'));
  for (const a of D.avisos) frag.append(el('div', { class: 'aviso-guion' }, '• ' + a));

  frag.append(titulo('Capas automáticas'));
  frag.append(el('div', { class: 'nota' }, 'Parpadeos solos y boca que sigue la voz de un audio (como el Director de la PC, sin Rhubarb). Quedan como animación normal del actor para retocarla.'));
  frag.append(el('div', { class: 'fila' },
    boton('👁 Parpadeos automáticos', () => parpadeos(api), { title: 'A todos los actores que tengan ojos (player/eyes o eyes_1px)' }),
    boton('🎲 Otros parpadeos', () => { D.semillaParp = (D.semillaParp % 9999) + 1; parpadeos(api); })));
  const conBoca = E.film.replays.map((r, i) => ({ r, i, pb: capas.parteBoca(r, TABLA_BOCAS) })).filter((x) => x.pb);
  const selA = el('select', { 'aria-label': 'Actor que habla' }, ...(conBoca.length ? conBoca : actores.map(({ r, i }) => ({ r, i }))).map(({ r, i }) => el('option', { value: i }, FM.nombre(r, i))));
  if (E.i >= 0) selA.value = String(E.i);
  const ini = el('input', { type: 'number', min: 0, step: 0.5, value: 0, style: 'width:5em', 'aria-label': 'Segundo del film donde empieza el audio' });
  frag.append(el('div', { class: 'fila' }, selA, el('span', { class: 'nota' }, 'empieza en (s)'), ini));
  frag.append(el('div', { class: 'fila' }, boton(api.audioArchivo() ? '🗣 Boca con el audio cargado' : '🗣 Boca con un audio…', () => bocaConAudio(api, Number(selA.value), Number(ini.value) || 0)),
    el('span', { class: 'nota' }, api.audioArchivo() ? api.audioArchivo().name : 'Cargá un audio en 📁 Film → Audio de referencia')));

  frag.append(titulo('Cámaras automáticas'));
  frag.append(el('div', { class: 'nota' }, 'Arma tomas siguiendo reglas de composición: sujeto en los tercios con aire hacia donde mira, ojos en el tercio de arriba, cortes de 2,5 a 8 s, ángulo distinto entre cortes (regla de los 30°) y del mismo lado en las charlas (regla de los 180°). Quedan como cámaras normales para retocarlas.'));
  const g = el('div', { class: 'chips' });
  for (const t of camaras.TODAS) {
    const on = D.tipos.has(t);
    g.append(boton(camaras.TOMAS[t].nombre, () => { if (on) D.tipos.delete(t); else D.tipos.add(t); api.dibujarPanel(); }, { class: on ? 'elegido' : '', title: on ? 'Se usa. Tocá para no usarla' : 'No se usa. Tocá para permitirla' }));
  }
  frag.append(g);
  const i1 = el('input', { type: 'checkbox', checked: D.inicioGeneral }), i2 = el('input', { type: 'checkbox', checked: D.cierreGeneral });
  i1.addEventListener('change', () => { D.inicioGeneral = i1.checked; }); i2.addEventListener('change', () => { D.cierreGeneral = i2.checked; });
  frag.append(el('label', { class: 'fila' }, i1, 'Empezar con un plano general'));
  frag.append(el('label', { class: 'fila' }, i2, 'Terminar con un plano general'));
  frag.append(el('div', { class: 'fila' },
    boton('🎥 Poner cámaras', () => soloCamaras(api), { class: 'principal' }),
    boton('🎲 Otra versión', () => { D.semilla = (D.semilla % 9999) + 1; soloCamaras(api); }, { title: 'Misma escena, otras elecciones de tomas' }),
    boton('🗑 Quitar automáticas', () => { api.guardarDeshacer(); quitarAuto(E.film); D.plan = []; E.toma = null; api.refrescar(); })));
  const hay = FM.tomas(E.film).filter((c) => String(c.title || '').startsWith('Auto:'));
  if (hay.length) {
    frag.append(el('div', { class: 'nota' }, `Cámaras automáticas en la escena: ${hay.length}. Versión ${D.semilla}.`));
    const lista = el('div', { class: 'lista' });
    for (const c of hay.sort((a, b) => api.num(a.tick) - api.num(b.tick))) {
      const t0 = api.num(c.tick) / 20, d = api.num(c.duration) / 20;
      lista.append(el('button', { class: 'item' + (c === E.toma ? ' elegido' : ''), onclick: () => { E.panel = 'camaras'; api.elegirToma(c); } },
        '🎥 ' + String(c.title).replace(/^Auto:\s*/, ''), el('span', { class: 'sub' }, `${t0.toFixed(1)} s · ${d.toFixed(1)} s`)));
    }
    frag.append(lista);
  }
}

async function quitarGenerado(api) {
  if (!D.base) return;
  if (!confirm('Se vuelve a la escena como estaba antes de generar (se pierde todo lo generado y retocado desde entonces). ¿Seguir? (Se puede deshacer con ↶.)')) return;
  api.guardarDeshacer();
  api.E.film = api.adoptar(api.clonar(D.base), true);
  D.base = null; D.plan = []; D.acciones = [];
  api.E.toma = null; api.E.i = -1; api.E.hueso = null;
  await api.refrescar({ rearmar: true });
}
