// "Servidor" local: responde las mismas rutas /api/... que app.py del programa de PC, pero dentro del navegador.
// Asi la interfaz es la misma en la PC y en el celular, y toda la logica vive en nucleo/ (un solo codigo).
import * as A from './almacen.js';
import * as C from './carpeta.js';
import * as bbs from '../nucleo/bbsdat.js';
import * as mocap from '../nucleo/mocap.js';
import * as manual from '../nucleo/manual.js';
import * as posesLib from '../nucleo/poses_lib.js';
import * as emoticons from '../nucleo/emoticons.js';
import * as ojos from '../nucleo/ojos.js';
import * as boca from '../nucleo/boca.js';
import * as bocaPx from '../nucleo/boca_pixel.js';
import { analizarPose, analizarCara } from './deteccion.js';
import * as psmove from '../nucleo/psmove.js';
import { leerAnimacion, aPose } from './importar.js';

const BASE = new URL('..', import.meta.url).href;
const TICKS = 20;
const VIDEO_EXT = ['.webm', '.mp4', '.mov', '.mkv', '.avi', '.m4v', '.3gp'];

// ---------- datos fijos del programa ----------
let fijos = null;
async function datosFijos() {
  if (!fijos) {
    const bin = async (p) => new Uint8Array(await (await fetch(BASE + p)).arrayBuffer());
    const json = async (p) => (await fetch(BASE + p)).json();
    const [plantilla, posesCuerpo, armadura, pEyes, pEyes1] = await Promise.all([
      bin('datos/plantilla.dat'), json('datos/poses_cuerpo.json'), json('datos/emoticons_steve.armadura.json'),
      json('datos/ojos/eyes/poses.json'), json('datos/ojos/eyes_1px/poses.json'),
    ]);
    emoticons.ponerArmadura(armadura);
    fijos = { plantilla, posesCuerpo, posesOjos: { eyes: pEyes, eyes_1px: pEyes1 } };
  }
  return fijos;
}

// ---------- ajustes ----------
const CAMPOS = Object.keys(mocap.OPCIONES);
async function leerConfig() {
  const c = (await A.leerKV('config')) || {};
  const op = { ...mocap.OPCIONES };
  for (const k of CAMPOS) if (k in c) op[k] = c[k];
  return op;
}
async function guardarConfig(cambios) {
  const op = await leerConfig();
  for (const [k, v] of Object.entries(cambios)) {
    if (!CAMPOS.includes(k)) continue;
    const tipo = typeof mocap.OPCIONES[k];
    op[k] = tipo === 'boolean' ? [true, 'true', 'si', 1].includes(v) : tipo === 'number' ? Number(v) : String(v);
  }
  await A.guardarKV('config', op);
  return op;
}

async function biblioteca() {
  const f = await datosFijos();
  return posesLib.biblioteca([[f.posesCuerpo, ''], [(await A.leerKV('poses_bbs')) || {}, 'BBS: ']]);
}

// ---------- tomas ----------
const dosD = (n) => String(n).padStart(2, '0');
function sello(d = new Date()) {
  return `${d.getFullYear()}${dosD(d.getMonth() + 1)}${dosD(d.getDate())}_${dosD(d.getHours())}${dosD(d.getMinutes())}${dosD(d.getSeconds())}`;
}
async function listarTomas() {
  const ts = await A.todos('tomas');
  ts.sort((a, b) => (a.nombre < b.nombre ? 1 : -1));
  return ts.map((t) => {
    const d = new Date(t.fecha);
    return { nombre: t.nombre, duracion: t.info.duracion, titulo: t.info.titulo || '', convertida: t.info.convertida || '',
      fecha: `${dosD(d.getDate())}/${dosD(d.getMonth() + 1)} ${dosD(d.getHours())}:${dosD(d.getMinutes())}` };
  });
}
async function toma(nombre) {
  const t = await A.obtener('tomas', nombre);
  if (!t) throw new Error('No encuentro esa toma.');
  return t;
}
async function guardarInfo(nombre, cambios) {
  const t = await toma(nombre);
  t.info = { ...t.info, ...cambios };
  await A.poner('tomas', t);
}

const urls = new Map();
export async function urlToma(nombre) {
  if (!urls.has(nombre)) urls.set(nombre, URL.createObjectURL((await toma(nombre)).blob));
  return urls.get(nombre);
}

async function subir(blob, nombreOriginal, duracion) {
  const nombre = decodeURIComponent(nombreOriginal || '');
  const ext = (nombre.match(/\.[^.]+$/) || ['.webm'])[0].toLowerCase();
  if (!VIDEO_EXT.includes(ext)) throw new Error('Ese archivo no es un video compatible (webm, mp4, mov, mkv, avi).');
  const base = nombre.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
  let final = 'toma_' + sello() + (base && !base.startsWith('toma') ? '_' + base : '') + ext;
  while (await A.obtener('tomas', final)) final = final.replace(ext, '_b' + ext);
  const info = {};
  if (duracion) info.duracion = Number(duracion);
  await A.poner('tomas', { nombre: final, blob, info, fecha: Date.now() });
  return { nombre: final, tomas: await listarTomas() };
}

async function borrarToma(nombre) {
  await A.borrar('tomas', nombre);
  for (const k of await A.claves('kv')) if (typeof k === 'string' && k.includes(':' + nombre)) await A.borrarKV(k);
  if (urls.has(nombre)) { URL.revokeObjectURL(urls.get(nombre)); urls.delete(nombre); }
  return { ok: true, tomas: await listarTomas() };
}

// ---------- analisis guardados (como los .npz del programa de PC) ----------
async function poseDe(nombre, op, reanalizar, log, progreso) {
  if (op.usar_move) {   // controles PlayStation Move: se usan los datos guardados con la toma (no se mira el video)
    const m = await A.leerKV('psmove:' + nombre);
    if (!m) throw new Error('Esta toma no tiene datos de los controles Move. Grabala con los controles conectados y calibrados (panel «Controles PlayStation Move»).');
    const t = await toma(nombre);
    const r = psmove.construirPose(m, { duracion: Math.max(m.duracion || 0, t.info.duracion || 0) });
    log(`Controles Move: ${(m.izq || []).length} datos del izquierdo y ${(m.der || []).length} del derecho` + (m.marcas && m.marcas.length ? `, ${m.marcas.length} momentos marcados.` : '.'));
    progreso && progreso(1);
    return r;
  }
  const k = `pose_${op.calidad}${op.espejo ? '_espejo' : ''}:${nombre}`;
  const g = !reanalizar && (await A.leerKV(k));
  if (g) { log('Usando el analisis ya guardado de este video.'); return g; }
  const t = await toma(nombre);
  const r = await analizarPose(t.blob, { calidad: op.calidad, espejo: op.espejo, progreso, log, duracion: t.info.duracion || 0 });
  await A.guardarKV(k, r);
  return r;
}
async function caraDe(nombre, op, reanalizar, log, progreso, conBoca = false, conLabios = false) {
  const k = `cara${op.espejo ? '_espejo' : ''}:${nombre}`;
  const g = !reanalizar && (await A.leerKV(k));
  if (g && (!conBoca || g.boca) && (!conLabios || g.labios)) { log('Usando el analisis de cara ya guardado de este video.'); return g; }
  if (g) log('El analisis guardado de este video no tiene la boca: lo hago de nuevo.');
  const t = await toma(nombre);
  const r = await analizarCara(t.blob, { espejo: op.espejo, progreso, log, duracion: t.info.duracion || 0 });
  await A.guardarKV(k, r);
  return r;
}

// ---------- films ----------
async function cargarFilm(nombre) { return bbs.leer(await C.leerFilm(nombre)); }

async function actores(nombre) {
  const f = await cargarFilm(nombre);
  return (f.replays || []).map((r, i) => {
    const form = r.form || {};
    return { indice: i, nombre: String(form.name || r.label || `Actor ${i}`), modelo: String(form.model || '') };
  });
}

const HUESOS_3D = ['anchor', 'low_body', 'head', 'right_arm', 'right_elbow', 'left_arm', 'left_elbow',
  'right_leg', 'right_knee', 'left_leg', 'left_knee', 'body', 'low_right_arm', 'low_left_arm', 'low_leg_right', 'low_left_leg'];
const HUESOS_OJOS = ['anchor', 'eye_l', 'eye_r', 'pupil_l', 'pupil_r', 'eyelid_lt', 'eyelid_lb', 'eyelid_rt', 'eyelid_rb',
  'eyebrow_l', 'eyebrow_r', 'eyebrow_el', 'eyebrow_er'];
const tr = (v, d) => (v ? v.map(bbs.num) : d.slice());

function caraDelActor(rep) {
  const partes = (rep.form && rep.form.parts) || [];
  for (let idx = 0; idx < partes.length; idx++) {
    const fm = partes[idx].form || {};
    if (!String(fm.model || '').includes('eyes')) continue;
    const reposo = {};
    for (const [b, v] of Object.entries(fm.pose || {})) {
      if (HUESOS_OJOS.includes(b)) reposo[b] = { t: tr(v.t, [0, 0, 0]), s: tr(v.s, [1, 1, 1]), r: tr(v.r, [0, 0, 0]) };
    }
    const pistas = {};
    for (const b of HUESOS_OJOS) {
      const p = (rep.animation || {})[`${idx}/pose/${b}`];
      if (!p) continue;
      const kfs = (p.keyframes || []).map((k) => {
        const v = k.value || {};
        return { t: bbs.num(k.tick), tr: tr(v.t, [0, 0, 0]), s: tr(v.s, [1, 1, 1]), r: tr(v.r, [0, 0, 0]), i: String(k.interp || 'linear') };
      }).sort((a, b) => a.t - b.t);
      if (kfs.length) pistas[b] = kfs;
    }
    return { parte: idx, modelo: String(fm.model || ''), reposo, pistas };
  }
  return null;
}

// boca del actor para la vista 3D: { parte, modelo, reposo: {capa: visible}, pistas: {capa: [{t, v}]} } o null
function bocaDelActor(rep) {
  const pp = bocaPx.partePixel(rep);
  if (pp) return bocaPixelDelActor(rep, pp);
  const pb = boca.parteBoca(rep);
  if (!pb) return null;
  const fm = rep.form.parts[pb.idx].form || {};
  const visible = (s) => !s || s.map(bbs.num).every((x) => Math.abs(x) > 1e-3);
  const reposo = {}, pistas = {};
  for (const c of boca.CAPAS) {
    reposo[c] = visible((fm.pose || {})[c]?.s);
    const p = (rep.animation || {})[`${pb.idx}/pose/${c}`];
    if (!p) continue;
    const kfs = (p.keyframes || []).map((k) => ({ t: bbs.num(k.tick), v: visible((k.value || {}).s) })).sort((a, b) => a.t - b.t);
    if (kfs.length) pistas[c] = kfs;
  }
  const textura = /conejo/i.test(JSON.stringify(fm)) ? 'conejo' : 'normal';
  return { parte: pb.idx, modelo: pb.modelo, nombreModelo: pb.nombreModelo, textura, reposo, pistas };
}

// boca de pixeles flexibles: { tipo: 'pixel', modelo, k, filas, reposo: {hueso: [desde, largo] o null}, pistas: {hueso: [{t, v}]} }
function bocaPixelDelActor(rep, pp) {
  const fm = rep.form.parts[pp.idx].form || {};
  const pieza = (v) => {
    const s = v.s ? v.s.map(bbs.num) : [1, 1, 1], t = v.t ? v.t.map(bbs.num) : [0, 0, 0];
    return s[0] > 1e-3 && s[1] > 1e-3 ? [Math.round(t[0] * pp.k), Math.round(s[0])] : null;
  };
  const reposo = {}, pistas = {};
  for (const b of bocaPx.nombresHuesos(pp.k, pp.filas)) {
    if (!pp.labios && b.startsWith('labio')) continue;
    const v = (fm.pose || {})[b];
    reposo[b] = v ? pieza(v) : [0, 1];   // sin pose, BBS muestra la pieza como esta en el modelo (1 pedacito)
    const p = (rep.animation || {})[`${pp.idx}/pose/${b}`];
    if (!p) continue;
    const kfs = (p.keyframes || []).map((k) => ({ t: bbs.num(k.tick), v: pieza(k.value || {}) })).sort((a, b) => a.t - b.t);
    if (kfs.length) pistas[b] = kfs;
  }
  return { tipo: 'pixel', parte: pp.idx, modelo: pp.modelo, nombreModelo: pp.nombreModelo, k: pp.k, filas: pp.filas, labios: pp.labios, reposo, pistas };
}

async function animacion(nombreToma, film, actor) {
  let info = {};
  const filmPedido = film;
  if (nombreToma) {
    info = (await A.obtener('tomas', nombreToma))?.info || {};
    if (!film) { film = info.convertida || ''; if (actor === null) actor = info.actor; }
  }
  if (!film) throw new Error('Esa toma todavía no se convirtió. Convertila primero.');
  let f;
  try { f = await cargarFilm(film); } catch (e) { throw new Error(`No encuentro el film "${film}".`); }
  const reps = f.replays || [];
  actor = Number(actor || 0);
  if (!(actor >= 0 && actor < reps.length)) throw new Error('Ese film no tiene ese actor.');
  const rep = reps[actor];
  const huesos = {}; let ticks = 0;
  for (const b of HUESOS_3D) {
    const p = (rep.animation || {})['pose/' + b];
    if (!p) continue;
    const kfs = (p.keyframes || []).map((k) => {
      const v = k.value || {};
      return { t: bbs.num(k.tick), r: v.r ? v.r.map(bbs.num) : [0, 0, 0], i: String(k.interp || 'linear') };
    }).sort((a, b) => a.t - b.t);
    if (kfs.length) { huesos[b] = kfs; ticks = Math.max(ticks, kfs[kfs.length - 1].t); }
  }
  const cara = caraDelActor(rep);
  if (cara) for (const kfs of Object.values(cara.pistas)) for (const k of kfs) ticks = Math.max(ticks, k.t);
  const bocaA = bocaDelActor(rep);
  if (bocaA) for (const kfs of Object.values(bocaA.pistas)) for (const k of kfs) ticks = Math.max(ticks, k.t);
  const esDeLaToma = filmPedido === '' || filmPedido === info.convertida;
  const video = nombreToma && esDeLaToma ? nombreToma : '';
  return { film, actor, modelo: String((rep.form || {}).model || ''), huesos, cara, boca: bocaA, ticks, desde: Number(info.desde || 0), video, duracion_video: info.duracion };
}

// ---------- conversion ----------
// "a 40 %, cerrada 35 %..." (tiempo que estuvo cada forma de boca)
function textoFormas(formas) {
  const tot = Object.values(formas).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(formas).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / tot) * 100)} %`).join(', ');
}

const ESTADO = { ocupado: false, progreso: 0, log: [], resultado: null, error: null };

async function trabajo(nombreToma, filmNombre, actor, desde, reanalizar) {
  const log = (m) => ESTADO.log.push(String(m));
  const prog = (x) => { ESTADO.progreso = x; };
  try {
    const f = await datosFijos();
    const op = { ...(await leerConfig()), actor, desde };
    if (op.usar_move && op.modo !== 'cara') op.partes = 'brazo_izq,brazo_der';   // con los controles Move solo se animan los brazos
    const film = filmNombre ? await cargarFilm(filmNombre) : null;
    let filmNuevo, resumen, destino;

    if (op.modo === 'cara') {
      if (!op.cara_ojos && !op.cara_boca) throw new Error('Marcá "Animar los ojos" o "Animar la boca" (o las dos).');
      if (!film) throw new Error('Para animar la cara elegí un film (paso 3) cuyo actor ya tenga los ojos o la boca puestos: el programa le agrega la animacion de tu cara.');
      log(`Video: ${nombreToma}  (modo cara)`);
      const reps = film.replays;
      if (!(actor >= 0 && actor < reps.length)) throw new Error(`El film tiene ${reps.length} actores: el numero de actor va de 0 a ${reps.length - 1}.`);
      const parteO = op.cara_ojos ? ojos.parteOjos(reps[actor]) : null;
      const parteP = op.cara_boca ? bocaPx.partePixel(reps[actor]) : null;
      const parteB = op.cara_boca && !parteP ? boca.parteBoca(reps[actor]) : null;
      const avisos = [];
      if (op.cara_ojos && !parteO) avisos.push('Los ojos no se animaron: el actor no tiene parte de ojos (eyes o eyes_1px).');
      if (op.cara_boca && !parteB && !parteP) avisos.push('La boca no se animó: el actor no tiene parte de boca (boca_Man, boca_Woman o boca_pixel).');
      if (!parteO && !parteB && !parteP) {
        throw new Error('El actor de ese film no tiene ' + [op.cara_ojos && 'ojos (eyes o eyes_1px)', op.cara_boca && 'boca (boca_Man, boca_Woman o boca_pixel)'].filter(Boolean).join(' ni ') +
          '. Elegí un film cuyo actor ya los tenga puestos.');
      }
      const cara = await caraDe(nombreToma, op, reanalizar, log, prog, Boolean(parteB || parteP), Boolean(parteP));
      filmNuevo = bbs.clonar(film);
      const rep = filmNuevo.replays[actor]; rep.animation = rep.animation || {};
      let rO = null, rB = null;
      if (parteO) {
        const o = ojos.construir(cara, parteO, 0, op.desde, op, f.posesOjos[parteO.modelo]);
        Object.assign(rep.animation, o.pistas); rO = o.resumen;
        if (rO.parpadeos === 0 && rO.cambios_mirada === 0) avisos.push('No se detecto ningun parpadeo ni cambio de mirada. Revisa que la cara se vea bien y con luz.');
      }
      if (parteB) {
        const b = boca.construir(cara, parteB, 0, op.desde, op);
        Object.assign(rep.animation, b.pistas); rB = b.resumen;
        if (rB.cambios === 0) avisos.push('La boca quedó siempre igual: no se vio que la abrieras. Revisá que la cara se vea de frente, cerca y con luz.');
      }
      if (parteP) {
        const b = bocaPx.construir(cara, parteP, 0, op.desde, op);
        Object.assign(rep.animation, b.pistas); rB = b.resumen;
        if (rB.cambios === 0) avisos.push('La boca quedó siempre igual: no se vio que la abrieras. Revisá que la cara se vea de frente, cerca y con luz.');
      }
      const dur = (rO || rB).duracion;
      destino = filmNombre.replace(/\.dat$/i, '') + (parteO && (parteB || parteP) ? '_cara.dat' : parteB || parteP ? '_boca.dat' : '_ojos.dat');
      resumen = { duracion: dur, stats: {}, poses: null, omitidos: [], avisos, ojos: rO, boca: rB };
      log(''); log(`LISTO  (${[rO && 'ojos', rB && 'boca'].filter(Boolean).join(' y ')} con tu cara)`);
      log(`  Duracion: ${dur.toFixed(1)} s  (${Math.trunc(dur * TICKS)} ticks), empieza en el tick ${op.desde}`);
      if (rO) log(`  Ojos (${rO.modelo}): ${rO.parpadeos} parpadeos, ${rO.cambios_mirada} cambios de mirada, ${rO.cambios_cejas} cambios de cejas, ${rO.keyframes} keyframes`);
      if (rB) log(`  Boca (${rB.modelo}): ${rB.cambios} cambios de forma, ${rB.keyframes} keyframes.` + (parteP ? ' Pixeles flexibles.' : ' ' + textoFormas(rB.formas)));
    } else {
      log(`Video: ${nombreToma}`);
      const pose = await poseDe(nombreToma, op, reanalizar, log, op.ojos ? (x) => prog(x * 0.6) : prog);
      const manualPoses = (await A.leerKV('manual:' + nombreToma)) || [];
      const r = mocap.procesarCuerpo(op, {
        pose, film, plantilla: await bbs.leer(f.plantilla), biblioteca: await biblioteca(), manual: manualPoses,
      }, log);
      filmNuevo = r.film; resumen = { ...r.resumen, ojos: null };
      if (op.ojos) {
        const parte = ojos.parteOjos(r.rep);
        if (!parte) resumen.avisos.push('Los ojos no se animaron: el actor de ese film no tiene parte de ojos (eyes o eyes_1px). Elegi un film cuyo actor ya tenga los ojos puestos.');
        else {
          try {
            log('Analizando la cara del video...');
            const cara = await caraDe(nombreToma, op, reanalizar, log, (x) => prog(0.6 + x * 0.4));
            const o = ojos.construir(cara, parte, pose.offset || 0, op.desde, op, f.posesOjos[parte.modelo]);
            Object.assign(r.rep.animation, o.pistas);
            resumen.ojos = o.resumen;
            if (o.resumen.parpadeos === 0 && o.resumen.cambios_mirada === 0) {
              resumen.avisos.push('No se detecto ningun parpadeo ni cambio de mirada. Si la cara se ve chica en el video, acercate a la camara o graba la cara aparte.');
            }
          } catch (e) { resumen.avisos.push('No se pudieron animar los ojos: ' + e.message); }
        }
      }
      const stem = nombreToma.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_');
      destino = filmNombre ? filmNombre.replace(/\.dat$/i, '') + '_mocap.dat' : `mocap_${stem}.dat`;
    }

    const bytes = await bbs.escribir(filmNuevo);
    const g = await C.guardarFilm(destino, bytes);
    for (const a of resumen.avisos) log('  Aviso: ' + a);
    log(`  Guardado: ${g.nombre}${g.enCarpeta ? ' (en tu carpeta de films)' : ' (en la app; exportalo con "Exportar .dat")'}`);
    await guardarInfo(nombreToma, { convertida: g.nombre, desde: op.desde, actor: op.actor });
    ESTADO.resultado = { ...resumen, destino: g.nombre, archivo: g.nombre, enCarpeta: g.enCarpeta,
      carpeta: g.enCarpeta ? 'Carpeta de films: ' + C.nombreCarpeta() : 'Guardado dentro de la app' };
    ESTADO.progreso = 1;
  } catch (e) {
    console.error(e);
    ESTADO.error = e.message || String(e);
  } finally {
    ESTADO.ocupado = false;
  }
}

// ---------- rutas ----------
const RUTAS = {
  'GET /api/inicio': async () => {
    await C.cargarCarpeta();
    const carpeta = await C.permisoCarpeta();
    return { config: await leerConfig(), tomas: await listarTomas(), films: await C.listarFilms(), poses: Object.keys(await biblioteca()).sort(),
      carpeta_ok: carpeta, carpeta_nombre: C.nombreCarpeta(), carpeta_pendiente: Boolean(C.nombreCarpeta()) && !carpeta,
      puede_carpeta: C.puedeCarpeta(), modelo_preview: true };
  },
  'GET /api/tomas': async () => listarTomas(),
  'GET /api/films': async () => ({ films: await C.listarFilms(), carpeta_ok: await C.permisoCarpeta(), carpeta_nombre: C.nombreCarpeta() }),
  'GET /api/actores': async (q) => actores(q.get('film')),
  'GET /api/animacion': async (q) => animacion(q.get('toma') || '', q.get('film') || '', q.get('actor') === null || q.get('actor') === '' ? null : Number(q.get('actor'))),
  'GET /api/estado': async () => ({ ...ESTADO, log: ESTADO.log.slice() }),
  'GET /api/manual': async (q) => {
    const poses = q.get('toma') ? manual.normalizar((await A.leerKV('manual:' + q.get('toma'))) || []) : [];
    return { poses, disposicion: manual.disposicion(poses) };
  },
  'POST /api/manual': async (_, d) => {
    await toma(d.toma);
    const poses = manual.normalizar(d.poses || []);
    await A.guardarKV('manual:' + d.toma, poses);
    return { poses, disposicion: manual.disposicion(poses) };
  },
  'GET /api/pose': async (q) => {
    await datosFijos();
    let pose = (await biblioteca())[q.get('nombre')];
    if (!pose) throw Object.assign(new Error('Esa pose no existe.'), { status: 404 });
    if (q.get('modelo') === 'emoticons_steve') pose = emoticons.poseUnica(pose);
    return { huesos: pose };
  },
  'POST /api/psmove': async (_, d) => { await A.guardarKV('psmove:' + d.toma, d.datos); return { ok: true }; },
  'POST /api/config': async (_, d) => { await guardarConfig(d); return { ok: true, films: await C.listarFilms(), carpeta_ok: await C.permisoCarpeta() }; },
  'POST /api/borrar_toma': async (_, d) => borrarToma(d.nombre),
  'POST /api/procesar': async (_, d) => {
    if (ESTADO.ocupado) throw Object.assign(new Error('Ya hay una conversion en curso.'), { status: 409 });
    await toma(d.toma);
    Object.assign(ESTADO, { ocupado: true, progreso: 0, log: [], resultado: null, error: null });
    trabajo(d.toma, d.film || '', Number(d.actor || 0), Number(d.desde || 0), Boolean(d.reanalizar));
    return { ok: true };
  },
  // nuevas (no estaban en la PC): elegir carpeta, importar/exportar films, importar poses de BBS
  'POST /api/carpeta': async (_, d) => {
    if (d.olvidar) await C.olvidarCarpeta();
    else if (d.reconectar) await C.permisoCarpeta(true);
    else await C.elegirCarpeta();
    return { films: await C.listarFilms(), carpeta_ok: await C.permisoCarpeta(), carpeta_nombre: C.nombreCarpeta() };
  },
  'POST /api/importar_poses': async (_, d) => {
    const datos = JSON.parse(d.texto);
    await A.guardarKV('poses_bbs', datos);
    return { poses: Object.keys(await biblioteca()).sort() };
  },
};

// Importar una animacion de otro modelo humanoide (FBX de Mixamo, GLB/GLTF, BVH) y pasarla a un film de BBS.
// Se convierte en los mismos puntos que da MediaPipe y sigue el camino del Mocap (retarget, estilo, film).
export async function clipsDeAnimacion(file) {
  const an = await leerAnimacion(file.name, await file.arrayBuffer());
  return an.clips.map((c, i) => ({ indice: i, nombre: c.name || `animacion ${i + 1}`, duracion: c.duration }));
}
export async function importarAnimacion(file, { clip = 0, estilo = 'realista', film = '', actor = 0, desde = 0 } = {}, log = () => {}) {
  const f = await datosFijos();
  const op = { ...(await leerConfig()), modo: 'cuerpo', estilo, actor, desde,
    neutral: 0, torso: 1, con_giro: true, sin_giro: false, suavizado: 0.02, poses_fijas: '' };
  const an = await leerAnimacion(file.name, await file.arrayBuffer());
  const c = an.clips[clip] || an.clips[0];
  log(`Animacion: ${file.name} (${c.name || 'sin nombre'}, ${c.duration.toFixed(1)} s)`);
  const pose = aPose(an, c);
  const r = mocap.procesarCuerpo(op, {
    pose, film: film ? await cargarFilm(film) : null, plantilla: await bbs.leer(f.plantilla), biblioteca: await biblioteca(), manual: [],
  }, log);
  const stem = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_');
  const destino = film ? film.replace(/\.dat$/i, '') + `_${stem}.dat` : `anim_${stem}.dat`;
  const g = await C.guardarFilm(destino, await bbs.escribir(r.film));
  log(`Guardado: ${g.nombre}${g.enCarpeta ? ' (en tu carpeta de films)' : ' (en la app; exportalo con "Exportar .dat")'}`);
  return { destino: g.nombre, enCarpeta: g.enCarpeta, resumen: r.resumen, clip: c.name, duracion: c.duration, films: await C.listarFilms() };
}

// Importar un film (.dat) elegido con el selector de archivos
export async function importarFilm(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await bbs.leer(bytes);   // si no es un film de BBS, falla aca
  const g = await C.importarFilm(file.name, bytes);
  return { nombre: g.nombre, films: await C.listarFilms() };
}

// Exportar un film: en el celular abre "Compartir" (OneDrive, Drive, WhatsApp...), si no, lo descarga
export async function exportarFilm(nombre) {
  const bytes = await C.leerFilm(nombre);
  const nativo = globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor.Plugins;
  if (nativo && nativo.Filesystem) return exportarNativo(nativo, nombre, bytes);
  const file = new File([bytes], nombre, { type: 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: nombre }); return 'compartido'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelado'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'descargado';
}

// En la APK (Capacitor) no hay descargas: se guarda el archivo y se abre "Compartir" (Drive, WhatsApp, Archivos...)
async function exportarNativo({ Filesystem, Share }, nombre, bytes) {
  let b = '';
  for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const data = btoa(b);
  const { uri } = await Filesystem.writeFile({ path: nombre, data, directory: 'CACHE' });
  if (Share) {
    try { await Share.share({ title: nombre, files: [uri], dialogTitle: 'Mandar el film a la PC' }); return 'compartido'; }
    catch (e) { if (/cancel/i.test(e.message || '')) return 'cancelado'; }
  }
  await Filesystem.writeFile({ path: 'MocapBBS/' + nombre, data, directory: 'DOCUMENTS', recursive: true });
  return 'guardado en Documentos/MocapBBS';
}

// Misma forma que fetch().json() del programa de PC: api(url, {method, headers, body})
export async function api(url, opts = {}) {
  const u = new URL(url, location.href);
  const metodo = (opts.method || 'GET').toUpperCase();
  if (u.pathname.endsWith('/api/subir')) {
    const h = opts.headers || {};
    return subir(opts.body, h['X-Nombre'] || opts.body.name || 'toma.webm', h['X-Duracion']);
  }
  const clave = `${metodo} ${u.pathname.replace(/^.*\/api\//, '/api/')}`;
  const fn = RUTAS[clave];
  if (!fn) throw new Error('no encontrado: ' + clave);
  const datos = opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : {};
  return fn(u.searchParams, datos);
}
export const post = (url, data) => api(url, { method: 'POST', body: JSON.stringify(data) });
