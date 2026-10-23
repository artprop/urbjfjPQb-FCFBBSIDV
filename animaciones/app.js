// Modo "Animaciones → BBS": una animacion 3D (FBX, GLB, BVH, DAE o .zip) pasada a un film de BBS, viendo las dos a la vez.
// Izquierda: la original con sus huesos. Derecha: el muñeco de Minecraft con el resultado. Una sola linea de tiempo.
// La conversion es la misma de «Importar animación» del Mocap (importar.js -> puntos tipo MediaPipe -> mocap.procesarCuerpo).
// Los huesos se reconocen solos (mocap/nucleo/esqueleto.js) y se pueden corregir a mano en el panel «Huesos».
import { cargarAnimacion, aPose, aplicarMapa, elegirPersonaje, PARTES } from '../mocap/local/importar.js';
import * as mocap from '../mocap/nucleo/mocap.js';
import * as bbs from '../mocap/nucleo/bbsdat.js';
import * as emoticons from '../mocap/nucleo/emoticons.js';
import { Escena, TICKS_POR_S } from '../mocap/escena3d.js';
import { guardarSalida, esPC, abrirCarpetaSalida } from '../comun/plataforma.js';
import { VistaOriginal } from './original.js';
import { cargarModeloDedos } from '../mocap/dedos3d.js';
import { MODELOS_DEDOS, ponerMano, suavizar, pistasParaVista, reposoParaVista } from '../mocap/nucleo/dedos.js';
import { opcionesConversion, pistasDeActor, tipoDeRig, nombreSalida, nombreParte, nombreCorto, FILAS_PANEL, ORDEN_PARTES,
  desplazamiento, ponerDesplazamiento } from './nucleo.js';

const $ = (s) => document.querySelector(s);
const fmt = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const MODELOS_MC = { steve_bends: 'steve_bends', emoticons_steve: 'emoticons/steve' };

let an = null, archivo = '', clip = 0, resultado = null, base = null;   // base: { nombre, film } (film de BBS ya leido)
let t = 0, dur = 0, jugando = false, ult = 0;
let orig = null, mc = null;
let manual = {}, parteActiva = null, convPendiente = 0;   // manual: {parte: nombre del hueso | ''} elegido a mano

function estado(txt, clase = '') { const e = $('#estado'); e.textContent = txt; e.className = clase; e.title = txt; }
function avisos(lista) { $('#avisos').replaceChildren(...lista.map((a) => Object.assign(document.createElement('div'), { textContent: '⚠ ' + a }))); }

// ---------- datos fijos (plantilla del film nuevo y armadura de emoticons) ----------
let fijos = null;
async function datosFijos() {
  if (!fijos) {
    const url = (p) => new URL('../mocap/datos/' + p, import.meta.url);
    const [plantilla, armadura] = await Promise.all([
      fetch(url('plantilla.dat')).then((r) => r.arrayBuffer()).then((b) => bbs.leer(new Uint8Array(b))),
      fetch(url('emoticons_steve.armadura.json')).then((r) => r.json()),
    ]);
    emoticons.ponerArmadura(armadura);
    fijos = { plantilla };
  }
  return fijos;
}

// ---------- vistas ----------
function iniciarVistas() {
  if (orig) return true;
  try {
    orig = new VistaOriginal($('#vOrig'));
    orig.alElegir = (h) => an && alTocarHueso(h);
    mc = new Escena($('#vMC'));
    mc.usarOjos('ninguno');   // sin los dos cuadritos azules de ojos (el film no lleva ojos)
    let skin = null; try { skin = localStorage.getItem('anim_skin'); } catch { /* sin almacenamiento */ }
    if (skin) mc.ponerSkin(skin).catch(() => {});
    return true;
  } catch (e) { estado('Este navegador no pudo iniciar el 3D: ' + e.message, 'mal'); return false; }
}

// ---------- abrir la animacion ----------
async function abrir(f) {
  if (!f) return;
  if (!iniciarVistas()) return;
  pausa();
  estado('Leyendo ' + f.name + '…');
  try {
    const nuevo = await cargarAnimacion(f.name, await f.arrayBuffer());
    if (!nuevo.clips.length) throw new Error('El archivo no trae ninguna animación (solo el modelo quieto).');
    an = nuevo; archivo = an.archivo && an.archivo !== f.name ? an.archivo : f.name;
  } catch (e) { estado('No se pudo abrir: ' + (e.message || e), 'mal'); return; }
  $('#nombreArchivo').textContent = f.name; $('#nombreArchivo').title = f.name + (archivo !== f.name ? ' → ' + archivo : '');
  // el clip mas largo suele ser el de verdad
  clip = an.clips.reduce((m, c, i) => (c.duration > an.clips[m].duration ? i : m), 0);
  $('#selClip').innerHTML = an.clips.map((c, i) => `<option value="${i}">${(c.name || 'animación ' + (i + 1)).replace(/^.*\|/, '').replace(/[<>&]/g, '')} (${fmt(c.duration)} s)</option>`).join('');
  $('#selClip').value = String(clip);
  $('#filaClip').hidden = an.clips.length < 2;
  $('#vacioOrig').hidden = true; $('#leyOrig').hidden = false;
  orig.poner(an, an.clips[clip]); orig.verMalla($('#chkMalla').checked);
  $('#chkMalla').parentElement.hidden = !orig.mallas.length;   // un BVH no trae malla, solo huesos
  // varios personajes en el archivo: se puede elegir cuál
  $('#filaPersonaje').hidden = an.personajes.length < 2;
  $('#selPersonaje').innerHTML = an.personajes.map((p, i) => `<option value="${i}">${nombreCorto(p.nombre).replace(/[<>&]/g, '') || 'Personaje ' + (i + 1)} (${p.huesos} huesos)</option>`).join('');
  $('#selPersonaje').value = String(an.personaje);
  cargarMapaManual();
  const rig = tipoDeRig(orig.esqueleto.bones.map((b) => b.name), an.tipo);
  $('#detOrig').textContent = `${rig} · ${orig.nHuesos} huesos · ${an.tipo.toUpperCase()}`;
  $('#btnHuesos').hidden = false; pintarHuesos();
  if (an.faltan.length) abrirPanel(an.faltan[0]);   // que se vea enseguida qué falta
  await convertir();
}

// ---------- convertir (cada vez que cambia algo) ----------
async function convertir() {
  if (!an) return;
  resultado = null; $('#btnGuardar').disabled = true; avisos([]);
  const c = an.clips[clip];
  dur = c.duration; $('#t').max = String(dur); $('#t').disabled = false; $('#btnPlay').disabled = false;
  if (an.faltan.length) {
    const lista = an.faltan.map(nombreParte).join(', ');
    $('#vacioMC').hidden = false;
    $('#vacioMC').innerHTML = `<b class="mal">Faltan partes del cuerpo</b><span>No encontré: ${lista}.</span><span>Abrí <b>🦴 Huesos</b> y elegí cuál es cada una (tocando el hueso en la vista de la izquierda).</span>`;
    mc.ponerAnimacion({}); mc.ponerDedos(null);
    $('#detMC').textContent = '';
    estado('Faltan huesos del humanoide', 'mal');
    ir(0); return;
  }
  estado('Convirtiendo…');
  await new Promise((r) => setTimeout(r, 20));   // que se vea el mensaje
  try {
    const f = await datosFijos();
    const actor = base ? Number($('#selActor').value || 0) : 0;
    const op = opcionesConversion({ estilo: $('#selEstilo').value, modelo: $('#selModelo').value, actor, hayFilm: !!base });
    const pose = aPose(an, c);
    const log = [];
    const r = mocap.procesarCuerpo(op, { pose, film: base ? base.film : null, plantilla: f.plantilla, biblioteca: {}, manual: [] }, (l) => log.push(l));
    const p = pistasDeActor(r.rep);
    // desplazamiento por el piso: a la posicion del actor en el film (y a la vista previa)
    const desp = $('#chkMover').checked ? desplazamiento(pose, { desde: op.desde }) : [];
    const kfMov = desp.length ? ponerDesplazamiento(r.rep, desp) : 0;
    // dedos: cada mano de la animación (si trae huesos de dedos) a la parte de dedos del actor
    const manos = await ponerDedos(r.rep, pose, op.desde);
    mc.ponerDedos(manos.vista);
    resultado = { film: r.film, resumen: r.resumen, pistas: p, desp, dedos: manos };
    const modelo = r.resumen.usaEmot || /emoticons/.test(p.modelo) ? 'emoticons_steve' : 'steve_bends';
    mc.ponerModelo(modelo);
    mc.ponerAnimacion(p.huesos);
    const kf = Object.values(r.resumen.stats).reduce((s, [, k]) => s + k, 0);
    const lejos = desp.reduce((m, d) => Math.max(m, Math.hypot(d.l, d.f)), 0);
    $('#detMC').textContent = `${MODELOS_MC[modelo]} · ${Math.round(dur * TICKS_POR_S)} ticks · ${kf} keyframes` + (r.resumen.poses ? ` · ${r.resumen.poses} poses` : '')
      + (kfMov && lejos > 0.05 ? ` · se mueve hasta ${fmt(lejos)} bloques` : '') + (manos.lados.length ? ` · dedos ${manos.lados.join(' y ')}` : '');
    $('#vacioMC').hidden = true;
    avisos(r.resumen.avisos || []);
    $('#btnGuardar').disabled = false;
    estado(`Listo: ${fmt(dur)} s` + (base ? ` → actor ${actor} de ${base.nombre}` : ''), 'ok');
  } catch (e) {
    $('#vacioMC').hidden = false; $('#vacioMC').innerHTML = '';
    $('#vacioMC').append(Object.assign(document.createElement('span'), { className: 'mal', textContent: 'No se pudo convertir: ' + (e.message || e) }));
    estado('No se pudo convertir', 'mal');
  }
  orig.ponerClip(c);   // aPose movio el esqueleto: se vuelve al momento que se estaba mirando
  ir(Math.min(t, dur));
}

// ---------- linea de tiempo ----------
function ir(nt) {
  t = Math.max(0, Math.min(dur, nt));
  if (orig && an) orig.ir(t);
  if (mc && resultado) {
    // el muñeco se corre por el piso como el actor en el film (adelante = -Z, izquierda = -X en la vista)
    const d = resultado.desp[Math.min(resultado.desp.length - 1, Math.round(t * TICKS_POR_S))];
    const [x, y, z] = d ? [-d.l, d.u, -d.f] : [0, 0, 0];
    const m = mc.modelo; m.base ??= m.raiz.position.clone();   // la raiz (anchor en steve_bends) ya tiene su altura
    m.raiz.position.set(m.base.x + x, m.base.y + y, m.base.z + z);
    mc.objetivo.x = x; mc.objetivo.z = z; mc._camara();
    mc.ir(t * TICKS_POR_S);
  }
  $('#t').value = String(t);
  $('#lectura').textContent = `${fmt(t)} s · tick ${Math.round(t * TICKS_POR_S)}`;
}
function cuadro(ahora) {
  if (!jugando) return;
  const dt = Math.min(0.1, (ahora - ult) / 1000) * Number($('#selVel').value); ult = ahora;
  let nt = t + dt; if (nt > dur) nt = 0;   // se repite
  ir(nt);
  requestAnimationFrame(cuadro);
}
function play() { if (!an || jugando) return; jugando = true; ult = performance.now(); $('#btnPlay').textContent = '⏸'; requestAnimationFrame(cuadro); }
function pausa() { jugando = false; $('#btnPlay').textContent = '▶'; }
$('#btnPlay').onclick = () => (jugando ? pausa() : play());
$('#t').oninput = (e) => { pausa(); ir(Number(e.target.value)); };
addEventListener('keydown', (e) => {
  if (e.target.closest('input, select') && e.target.type !== 'range') return;
  if (e.code === 'Space') { e.preventDefault(); jugando ? pausa() : play(); }
  else if (e.code === 'ArrowRight') ir(t + 1 / TICKS_POR_S);
  else if (e.code === 'ArrowLeft') ir(t - 1 / TICKS_POR_S);
});

// ---------- huesos: qué hueso de la animación es cada parte (se reconoce solo y se corrige a mano) ----------
function pintarHuesos() {
  if (!an) return;
  const g = $('#grillaHuesos'); g.replaceChildren();
  const boton = (k, ancho = false) => {
    const i = an.mapa[k], o = i === undefined ? (an.origen[k] === 'manual' ? 'manual' : 'falta') : an.origen[k] || 'nombre';
    const b = document.createElement('button');
    b.className = (ancho ? 'ancho' : '') + (k === parteActiva ? ' activo' : '');
    const n = i === undefined ? (o === 'manual' ? '(ninguno)' : '— falta —') : nombreCorto(an.esqueleto[i].nombre);
    b.innerHTML = `<i class="o-${i === undefined ? 'falta' : o}"></i><span></span>`; b.lastChild.textContent = n;
    b.title = `${nombreParte(k)}: ${i === undefined ? 'sin hueso' : an.esqueleto[i].nombre}` + (o === 'forma' ? ' (reconocido por la forma del esqueleto: revisalo)' : '');
    b.onclick = () => elegirParte(k);
    return b;
  };
  const et = (txt) => Object.assign(document.createElement('span'), { className: 'et', textContent: txt });
  const tit = (txt) => Object.assign(document.createElement('span'), { className: 'tit', textContent: txt });
  g.append(document.createElement('span'), tit('Izq. (del personaje)'), tit('Derecha'));
  for (const [p, lado] of FILAS_PANEL) {
    if (lado) g.append(et(nombreParte(p + 'L').replace(/ izq\.$/, '')), boton(p + 'L'), boton(p + 'R'));
    else g.append(et(nombreParte(p)), boton(p, true));
  }
  // la lista de huesos para la parte elegida
  const s = $('#selHueso');
  s.disabled = !parteActiva;
  if (parteActiva) {
    const i = an.mapa[parteActiva];
    s.innerHTML = `<option value="">${nombreParte(parteActiva)}: ninguno</option>` + an.esqueleto.map((h, j) => `<option value="${j}">${nombreParte(parteActiva)}: ${nombreCorto(h.nombre).replace(/[<>&]/g, '') || '(sin nombre ' + j + ')'}</option>`).join('');
    s.value = i === undefined ? '' : String(i);
  } else s.innerHTML = '<option>Elegí una parte</option>';
  const nf = an.faltan.length;
  $('#btnHuesos').textContent = nf ? `🦴 Huesos (${nf} faltan)` : '🦴 Huesos';
  $('#btnHuesos').classList.toggle('falta', nf > 0);
}
function abrirPanel(parte = null) { $('#panelDedos').hidden = true; $('#panelHuesos').hidden = false; elegirParte(parte || parteActiva || ORDEN_PARTES[0]); }
function cerrarPanel() { $('#panelHuesos').hidden = true; parteActiva = null; orig && orig.marcarActivo(null); }
function elegirParte(k) {
  parteActiva = k;
  orig.marcarActivo(k && an.mapa[k] !== undefined ? an.esqueleto[an.mapa[k]].obj : null);
  pintarHuesos();
  const b = $('#grillaHuesos button.activo'); b && b.scrollIntoView({ block: 'nearest' });
}
// cambia el hueso de una parte (indice en an.esqueleto, o -1 = ninguno)
function asignar(k, i) {
  manual[k] = i >= 0 ? an.esqueleto[i].nombre : '';
  guardarMapa();
  aplicarMapa(an, manual); orig.actualizarUsados();
  elegirParte(k);
  reconvertir();
}
// lo que el usuario ya habia corregido a mano en este mismo esqueleto
function cargarMapaManual() {
  manual = {}; try { manual = JSON.parse(localStorage.getItem('anim_mapa:' + an.firma) || '{}'); } catch { /* sin almacenamiento */ }
  aplicarMapa(an, manual); orig.actualizarUsados();
}
$('#selPersonaje').onchange = (e) => {
  if (!an) return;
  elegirPersonaje(an, Number(e.target.value));
  cargarMapaManual(); orig.poner(an, an.clips[clip]); orig.verMalla($('#chkMalla').checked); orig.actualizarUsados();
  pintarHuesos(); convertir();
};
function guardarMapa() {
  try {
    if (Object.keys(manual).length) localStorage.setItem('anim_mapa:' + an.firma, JSON.stringify(manual));
    else localStorage.removeItem('anim_mapa:' + an.firma);
  } catch { /* sin almacenamiento */ }
}
function reconvertir() { clearTimeout(convPendiente); convPendiente = setTimeout(convertir, 250); }
$('#btnHuesos').onclick = () => ($('#panelHuesos').hidden ? abrirPanel() : cerrarPanel());
$('#btnCerrarHuesos').onclick = cerrarPanel;
$('#selHueso').onchange = (e) => parteActiva && asignar(parteActiva, e.target.value === '' ? -1 : Number(e.target.value));
$('#btnAuto').onclick = () => { manual = {}; guardarMapa(); aplicarMapa(an, manual); orig.actualizarUsados(); elegirParte(parteActiva); reconvertir(); };
$('#btnLados').onclick = () => {
  const nuevo = { ...manual };
  for (const k of PARTES) {
    const m = k.match(/^(.+)([LR])$/); if (!m) continue;
    const otro = m[1] + (m[2] === 'L' ? 'R' : 'L'), i = an.mapa[otro];
    nuevo[k] = i === undefined ? '' : an.esqueleto[i].nombre;
  }
  manual = nuevo; guardarMapa(); aplicarMapa(an, manual); orig.actualizarUsados(); elegirParte(parteActiva); reconvertir();
};
// tocar un hueso en la vista original: con el panel abierto se lo asigna a la parte elegida y pasa a la siguiente
function alTocarHueso(obj) {
  const i = an.esqueleto.findIndex((h) => h.obj === obj);
  if (i < 0) return;
  if ($('#panelHuesos').hidden || !parteActiva) {
    const partes = Object.entries(an.mapa).filter(([, j]) => j === i).map(([k]) => nombreParte(k));
    estado(`Hueso: ${an.esqueleto[i].nombre}` + (partes.length ? ` (${partes.join(', ')})` : ' (no se usa)'));
    return;
  }
  const k = parteActiva;
  asignar(k, i);
  const sig = ORDEN_PARTES[ORDEN_PARTES.indexOf(k) + 1];
  if (sig) elegirParte(sig);
  estado(`${nombreParte(k)} = ${an.esqueleto[i].nombre}`);
}

// ---------- dedos ----------
const DEDOS_GUARDADO = 'anim_dedos';
let dedosCfg = { modelo: 'dedos', poses: {} };   // poses: { modelo: { LA, LC, RA, RC } } (nombres de pose)
try { dedosCfg = { ...dedosCfg, ...JSON.parse(localStorage.getItem(DEDOS_GUARDADO) || '{}') }; } catch { /* sin almacenamiento */ }
$('#selDedos').value = dedosCfg.modelo || '';
function guardarDedos() { try { localStorage.setItem(DEDOS_GUARDADO, JSON.stringify(dedosCfg)); } catch { /* sin almacenamiento */ } }
// nombre de la pose elegida (o la de fabrica) para un modelo, lado y extremo ('A' abierta, 'C' cerrada)
function poseElegida(id, lado, ext, poses) {
  const n = ((dedosCfg.poses || {})[id] || {})[lado + ext];
  if (n && poses[n]) return n;
  const d = MODELOS_DEDOS[id].defecto[lado][ext === 'A' ? 0 : 1];
  return poses[d] ? d : Object.keys(poses)[0];
}
// escribe los dedos en el actor; devuelve { lados: ['izq.', 'der.'], vista: {L, R} para la vista 3D, o null }
async function ponerDedos(rep, pose, desde) {
  const id = $('#selDedos').value, out = { lados: [], vista: null };
  if (!id || !pose.dedos || !Object.keys(pose.dedos).length) return out;
  out.vista = {};
  for (const [lado, serie] of Object.entries(pose.dedos)) {
    const datos = await cargarModeloDedos(id, lado);
    const abierta = datos.poses[poseElegida(id, lado, 'A', datos.poses)], cerrada = datos.poses[poseElegida(id, lado, 'C', datos.poses)];
    const r = ponerMano(rep, lado, { cfg: datos.cfg, abierta, cerrada }, { times: pose.times, curls: suavizar(serie, 0) }, { desde, modeloCuerpo: String((rep.form || {}).model || '') });
    out.vista[lado] = { datos, reposo: reposoParaVista(abierta), pistas: pistasParaVista(r.pistas) };
    out.lados.push(lado === 'L' ? 'izq.' : 'der.');
  }
  return out;
}
async function pintarPanelDedos() {
  const id = $('#selDedos').value;
  $('#btnPosesDedos').disabled = !id;
  if (!id) return;
  for (const lado of ['L', 'R']) {
    const datos = await cargarModeloDedos(id, lado);
    const otro = lado === 'L' ? 'R_' : 'L_';
    const nombres = Object.keys(datos.poses).filter((n) => !n.startsWith(otro)).sort();
    for (const ext of ['A', 'C']) {
      const s = $('#dedo' + lado + ext);
      s.innerHTML = nombres.map((n) => `<option>${n.replace(/[<>&]/g, '')}</option>`).join('');
      s.value = poseElegida(id, lado, ext, datos.poses);
    }
  }
  $('#notaDedos').textContent = an && an.clips.length && !Object.keys((aPoseDedos() || {})).length
    ? 'Esta animación no trae huesos de dedos: elegilos en 🦴 Huesos (pulgar, índice, medio, anular, meñique) o quedan quietos.'
    : `En BBS: el modelo ${MODELOS_DEDOS[id].id('L')}${id === 'dedos' ? '' : ' / ' + MODELOS_DEDOS[id].id('R')} tiene que estar en tus modelos (assets/models).`;
}
const aPoseDedos = () => (an ? Object.fromEntries(['L', 'R'].filter((l) => ['pulgar', 'indice', 'medio', 'anular', 'menique'].filter((k) => an.huesos[k + l]).length >= 2).map((l) => [l, 1])) : {});
$('#selDedos').onchange = () => { dedosCfg.modelo = $('#selDedos').value; guardarDedos(); pintarPanelDedos(); convertir(); };
$('#btnPosesDedos').onclick = () => { $('#panelDedos').hidden = !$('#panelDedos').hidden; if (!$('#panelDedos').hidden) { cerrarPanel(); pintarPanelDedos(); } };
$('#btnCerrarDedos').onclick = () => { $('#panelDedos').hidden = true; };
for (const k of ['LA', 'LC', 'RA', 'RC']) {
  $('#dedo' + k).onchange = (e) => {
    const id = $('#selDedos').value; if (!id) return;
    ((dedosCfg.poses ??= {})[id] ??= {})[k] = e.target.value; guardarDedos(); reconvertir();
  };
}
pintarPanelDedos();

// ---------- film de base (opcional) ----------
$('#inBase').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const film = await bbs.leer(new Uint8Array(await f.arrayBuffer()));
    const reps = film.replays || [];
    if (!reps.length) throw new Error('ese film no tiene actores');
    base = { nombre: f.name, film };
    $('#selActor').innerHTML = reps.map((r, i) => {
      const form = r.form || {};
      const n = String(form.name || r.label || `Actor ${i}`).replace(/[<>&]/g, '');
      return `<option value="${i}">${i}: ${n}${form.model ? ' (' + String(form.model).replace(/[<>&]/g, '') + ')' : ''}</option>`;
    }).join('');
    $('#selActor').hidden = false; $('#btnSinBase').hidden = false;
    $('#txtBase').textContent = ' ' + f.name;
    $('#selModelo').insertAdjacentHTML('afterbegin', $('#selModelo option[value=auto]') ? '' : '<option value="auto">El del actor</option>');
    $('#selModelo').value = 'auto';
    await convertir();
  } catch (err) { estado('Ese archivo no es un film de BBS (.dat): ' + (err.message || err), 'mal'); }
};
$('#btnSinBase').onclick = async () => {
  base = null; $('#selActor').hidden = true; $('#btnSinBase').hidden = true; $('#txtBase').textContent = ' Film de base…';
  $('#selModelo option[value=auto]')?.remove(); $('#selModelo').value = 'steve_bends';
  await convertir();
};

// ---------- guardar ----------
$('#btnGuardar').onclick = async () => {
  if (!resultado) return;
  const b = $('#btnGuardar'); b.disabled = true;
  try {
    const nombre = nombreSalida(archivo, base ? base.nombre : '');
    const bytes = await bbs.escribir(resultado.film);
    const r = await guardarSalida('animaciones', nombre, bytes);
    estado(r + ' · copialo a la carpeta de films de BBS', 'ok');
    if (await esPC()) $('#btnCarpeta').hidden = false;
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
  b.disabled = false;
};
$('#btnCarpeta').onclick = () => abrirCarpetaSalida('animaciones');

// ---------- el resto de los controles ----------
for (const id of ['#inArchivo', '#inArchivo2']) $(id).onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; abrir(f); };
$('#selClip').onchange = (e) => { clip = Number(e.target.value); t = 0; convertir(); };
$('#selEstilo').onchange = () => convertir();
$('#selModelo').onchange = () => convertir();
$('#selActor').onchange = () => convertir();
$('#chkMover').onchange = () => convertir();
$('#chkMalla').onchange = (e) => orig && orig.verMalla(e.target.checked);
$('#inSkin').onchange = (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !iniciarVistas()) return;
  const lector = new FileReader();
  lector.onload = () => mc.ponerSkin(lector.result).then(() => {
    try { localStorage.setItem('anim_skin', lector.result); } catch { /* sin almacenamiento */ }
    mc.ir(t * TICKS_POR_S); estado('Skin: ' + f.name);
  }).catch((err) => estado(err.message, 'mal'));
  lector.readAsDataURL(f);
};
// soltar el archivo en cualquier lado
addEventListener('dragover', (e) => { e.preventDefault(); $('#vOrig').classList.add('encima'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('#vOrig').classList.remove('encima'); });
addEventListener('drop', (e) => {
  e.preventDefault(); $('#vOrig').classList.remove('encima');
  const fs = [...(e.dataTransfer?.files || [])];
  const dat = fs.find((f) => /\.dat$/i.test(f.name)), otro = fs.find((f) => !/\.dat$/i.test(f.name));
  if (dat) { const dt = new DataTransfer(); dt.items.add(dat); $('#inBase').files = dt.files; $('#inBase').dispatchEvent(new Event('change')); }
  if (otro) abrir(otro);
});

iniciarVistas();
