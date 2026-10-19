// Mocap BBS - interfaz
import { crearVista } from './vista.js';
// Toda la logica corre en el navegador (PC y celular): las rutas /api/... las responde local/servidor.js
import { api, post, urlToma, importarFilm, exportarFilm, clipsDeAnimacion, importarAnimacion } from './local/servidor.js';
import { landmarkerPose } from './local/deteccion.js';
import { iniciarVivo, prender as prenderVivo, sincronizar as sincronizarVivo, estaPrendido as vivoPrendido } from './envivo.js';
import { iniciarCel } from './cel.js';
import { persistir } from './local/almacen.js';
const $ = (s) => document.querySelector(s);
const fmt = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');

let cfg = {};
let tomaSel = null;
let tomasLista = [], filmsLista = [], posesLista = [], vista = null;
let grabando = false, recorder = null, chunks = [], tRec = 0, timerRec = null;
let stream = null, landmarker = null, ultimaDeteccion = 0, relojEsqueleto = 0;

/* ---------- ajustes ---------- */
const SLIDERS = {
  transicion_min: ['#out-trans', () => `${cfg.transicion_min}–${cfg.transicion_max} ticks`],
  transicion_max: ['#out-trans', () => `${cfg.transicion_min}–${cfg.transicion_max} ticks`],
  velocidad_transicion: ['#out-vel', () => `${Math.round(cfg.velocidad_transicion * 100)} %`],
  quietud_gps: ['#out-quietud', () => `${cfg.quietud_gps} °/s`],
  detalle_grados: ['#out-detalle', () => `${cfg.detalle_grados}°`],
  cambio_min_grados: ['#out-cambio', () => `${cfg.cambio_min_grados}°`],
  suavizado: ['#out-suav', () => `${fmt(cfg.suavizado, 2)} s`],
  simplificar_grados: ['#out-simp', () => (cfg.simplificar_grados == 0 ? 'no reducir' : `${fmt(cfg.simplificar_grados)}°`)],
  manual_sostener: ['#out-m-sost', () => `${cfg.manual_sostener} ticks`],
  manual_antes: ['#out-m-antes', () => `${cfg.manual_antes} ticks`],
  manual_despues: ['#out-m-desp', () => `${cfg.manual_despues} ticks`],
  torso: ['#out-torso', () => (cfg.torso <= 0 ? 'torso quieto' : `${Math.round(cfg.torso * 100)} %`)],
  ojos_mirada: ['#out-ojos-mirada', () => `${Math.round(cfg.ojos_mirada * 100)} %`],
  ojos_parpadeo: ['#out-ojos-parpadeo', () => `${Math.round(cfg.ojos_parpadeo * 100)} % cerrado`],
  boca_sens: ['#out-boca-sens', () => `${Math.round(cfg.boca_sens * 100)} %`],
  boca_min_ticks: ['#out-boca-min', () => `${cfg.boca_min_ticks} ticks`],
};
const CHECKS = ['sin_piernas', 'sin_giro', 'espejo', 'ojos_cejas', 'cara_ojos', 'cara_boca', 'boca_labios'];
let guardarTimer = null, pendiente = {};
// junta los cambios y los guarda un instante despues (no se pierde ninguno si se tocan varios ajustes seguidos)
function guardar(campos) {
  Object.assign(pendiente, campos);
  clearTimeout(guardarTimer);
  guardarTimer = setTimeout(() => guardarYa().catch(mostrarError), 250);
}
async function guardarYa() {
  clearTimeout(guardarTimer);
  const campos = pendiente; pendiente = {};
  if (Object.keys(campos).length) await post('/api/config', campos);
}

// modo cara: los ajustes de ojos y de boca se ven solo si esa parte esta marcada
function verPartesCara() {
  $('#ajustes-ojos').hidden = !cfg.cara_ojos;
  $('#ajustes-boca').hidden = !cfg.cara_boca;
}

function pintarAjustes() {
  for (const [id, [out, txt]] of Object.entries(SLIDERS)) {
    const el = $('#' + id); el.value = cfg[id]; $(out).textContent = txt();
  }
  CHECKS.forEach((id) => ($('#' + id).checked = !!cfg[id]));
  verPartesCara();
  $('#calidad').value = cfg.calidad;
  $('#ojos_modo').value = cfg.ojos_modo || 'poses';
  sincronizarVivo();
  $('#modelo').value = cfg.modelo || 'auto';
  const elegidas = (cfg.partes || '').split(',').map((s) => s.trim());
  document.querySelectorAll('#partes input').forEach((c) => (c.checked = elegidas.includes(c.dataset.parte)));
  $('#poses_fijas').value = (cfg.poses_fijas || '').split(';').map((s) => s.trim()).filter(Boolean).join('\n');
  ponerModo(cfg.estilo || 'minecraft', false);
}

function ponerModo(estilo, save = true) {
  cfg.estilo = estilo;
  document.querySelectorAll('.modo button').forEach((b) => b.setAttribute('aria-selected', b.dataset.estilo === estilo));
  $('#ajustes-minecraft').hidden = estilo !== 'minecraft';
  $('#ajustes-realista').hidden = estilo !== 'realista';
  $('#ajustes-manual').hidden = estilo !== 'manual';
  if (vista) vista.alCambiarEstilo();
  if (save) guardar({ estilo });
}

function enlazarAjustes() {
  document.querySelectorAll('.modo button').forEach((b) => b.addEventListener('click', () => ponerModo(b.dataset.estilo)));
  for (const [id, [out, txt]] of Object.entries(SLIDERS)) {
    $('#' + id).addEventListener('input', (e) => {
      cfg[id] = Number(e.target.value);
      if (id === 'transicion_min' && cfg.transicion_min > cfg.transicion_max) { cfg.transicion_max = cfg.transicion_min; $('#transicion_max').value = cfg.transicion_max; }
      if (id === 'transicion_max' && cfg.transicion_max < cfg.transicion_min) { cfg.transicion_min = cfg.transicion_max; $('#transicion_min').value = cfg.transicion_min; }
      $(out).textContent = txt();
      guardar({ transicion_min: cfg.transicion_min, transicion_max: cfg.transicion_max, [id]: cfg[id] });
    });
  }
  CHECKS.forEach((id) => $('#' + id).addEventListener('change', (e) => { cfg[id] = e.target.checked; verPartesCara(); guardar({ [id]: cfg[id] }); }));
  $('#calidad').addEventListener('change', (e) => { cfg.calidad = e.target.value; guardar({ calidad: cfg.calidad }); });
  $('#ojos_modo').addEventListener('change', (e) => { cfg.ojos_modo = e.target.value; guardar({ ojos_modo: cfg.ojos_modo }); });
  $('#modelo').addEventListener('change', (e) => { cfg.modelo = e.target.value; guardar({ modelo: cfg.modelo }); });
  document.querySelectorAll('#partes input').forEach((c) => c.addEventListener('change', () => {
    cfg.partes = [...document.querySelectorAll('#partes input:checked')].map((x) => x.dataset.parte).join(',');
    guardar({ partes: cfg.partes });
  }));
  // poses prefabricadas: el texto se guarda en una sola linea separada por ";"
  const guardarPoses = () => { cfg.poses_fijas = $('#poses_fijas').value.split('\n').map((s) => s.trim()).filter(Boolean).join('; '); guardar({ poses_fijas: cfg.poses_fijas }); };
  $('#poses_fijas').addEventListener('input', guardarPoses);
  $('#pf-agregar').addEventListener('click', () => {
    const pose = $('#pf-pose').value, a = $('#pf-desde').value, b = $('#pf-hasta').value;
    if (!pose || !(Number(b) > Number(a))) return mostrarError(new Error('Elegí una pose y un tramo donde "hasta" sea mayor que "desde".'));
    const t = $('#poses_fijas'); t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + `${a}-${b}: ${pose}`;
    guardarPoses();
  });
  document.querySelectorAll('#modos button').forEach((b) => b.addEventListener('click', () => ponerModoApp(b.dataset.modo)));
}

/* ---------- modo: cuerpo o cara (ojos) ---------- */
const textoConvertir = () => (cfg.modo === 'cara' ? 'Convertir la cara' : 'Convertir a animación');
function ponerModoApp(modo, save = true) {
  cfg.modo = modo === 'cara' ? 'cara' : 'cuerpo';
  document.body.dataset.modo = cfg.modo;
  document.querySelectorAll('#modos button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modo === cfg.modo)));
  if (!$('#btn-convertir').disabled || $('#btn-convertir').textContent.startsWith('Convertir')) $('#btn-convertir').textContent = textoConvertir();
  if (save) guardar({ modo: cfg.modo });
  if (cfg.modo !== 'cara' && $('#vivo-fab').getAttribute('aria-pressed') === 'true') prenderVivo(false);
  if (vista && vista.activa()) vista.alTerminar();   // la vista 3D se re-arma (en modo cara enfoca la cara)
}

/* ---------- carpeta de films y destino ---------- */
let carpeta = { ok: false, nombre: '', pendiente: false, puede: false };
function pintarFilms(films, ok, extra = {}) {
  filmsLista = films;
  carpeta = { ...carpeta, ok, ...extra };
  const box = $('#carpeta-box');
  box.classList.toggle('ok', ok);
  $('#carpeta-box .solo-pc').hidden = !carpeta.puede;
  $('#btn-carpeta-elegir').textContent = carpeta.nombre ? 'Cambiar carpeta' : 'Elegir carpeta de films';
  $('#btn-carpeta-reconectar').hidden = !(carpeta.nombre && !ok);
  $('#carpeta-msg').textContent = ok
    ? `Carpeta "${carpeta.nombre}": se lee y se guarda directo ahí. ${films.length} films.`
    : carpeta.nombre
      ? `Tocá "Permitir" para volver a usar la carpeta "${carpeta.nombre}".`
      : `Los films quedan dentro de la app (${films.length}). Importá un film de BBS para usarlo, y exportá el resultado para pasarlo a la compu.`;
  const sel = $('#sel-film'); const prev = sel.value;
  sel.innerHTML = '<option value="">Film nuevo</option>' + films.map((f) => `<option>${esc(f)}</option>`).join('');
  sel.disabled = !films.length;
  if (films.includes(prev)) sel.value = prev;
  actualizarDestino();
}

async function actualizarDestino() {
  const film = $('#sel-film').value; const selA = $('#sel-actor');
  if (!film) {
    selA.innerHTML = '<option value="0">Tu actor</option>'; selA.disabled = true;
    $('#destino-ayuda').textContent = 'Se crea un film nuevo con tu actor en steve_bends.';
    return;
  }
  selA.disabled = true; selA.innerHTML = '<option>Cargando…</option>';
  try {
    const acts = await api('/api/actores?film=' + encodeURIComponent(film));
    selA.innerHTML = acts.map((a) => `<option value="${a.indice}">${esc(a.nombre)}${a.modelo && a.modelo !== 'player/steve_bends' ? ' (' + esc(a.modelo.split('/').pop()) + ')' : ''}</option>`).join('');
    selA.disabled = acts.length === 0;
    $('#destino-ayuda').textContent = 'Se guarda una copia del film con la animación nueva. Tu film original no se toca; la cara y la boca del actor se conservan.';
  } catch (e) { selA.innerHTML = '<option>No se pudo leer</option>'; mostrarError(e); }
}

/* ---------- tomas ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function pintarTomas(tomas) {
  tomasLista = tomas;
  const ul = $('#tomas');
  if (!tomas.length) {
    ul.innerHTML = '<li class="vacio-lista">Todavía no hay tomas. Grabá una o subí un video.</li>';
    tomaSel = null; $('#btn-convertir').disabled = true; return;
  }
  if (!tomas.find((t) => t.nombre === tomaSel)) tomaSel = tomas[0].nombre;
  ul.innerHTML = tomas.map((t) => `
    <li role="option" aria-selected="${t.nombre === tomaSel}" data-nombre="${esc(t.nombre)}" tabindex="0">
      <span class="toma-nombre" title="${esc(t.nombre)}">${esc(t.nombre.replace(/\.[^.]+$/, ''))}</span>
      <span class="toma-meta">${esc(t.fecha)}${t.duracion ? ' · ' + fmt(t.duracion) + ' s' : ''}${t.convertida ? ' · <span class="toma-ok">convertida</span>' : ''}</span>
      <span class="toma-acc">
        ${t.convertida ? '<button class="btn btn-chico" data-3d title="Ver la animación en 3D">Ver en 3D</button>' : ''}
        <button class="btn btn-chico" data-ver title="Ver la toma">Ver</button>
        <button class="btn btn-chico" data-borrar title="Mover a la carpeta borradas">Borrar</button>
      </span>
    </li>`).join('');
  $('#btn-convertir').disabled = !tomaSel;
}

function enlazarTomas() {
  $('#tomas').addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-nombre]'); if (!li) return;
    const nombre = li.dataset.nombre;
    if (e.target.closest('[data-borrar]')) {
      if (!confirm(`¿Mover "${nombre}" a la carpeta borradas?`)) return;
      const r = await post('/api/borrar_toma', { nombre }); pintarTomas(r.tomas); return;
    }
    tomaSel = nombre;
    document.querySelectorAll('#tomas li').forEach((x) => x.setAttribute('aria-selected', x.dataset.nombre === nombre));
    $('#btn-convertir').disabled = false;
    if (e.target.closest('[data-ver]')) verToma(nombre);
    if (e.target.closest('[data-3d]')) vista.abrir();
  });
  $('#subir').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      mensaje('Subiendo video…');
      const r = await api('/api/subir', { method: 'POST', headers: { 'X-Nombre': encodeURIComponent(f.name) }, body: f });
      tomaSel = r.nombre; pintarTomas(r.tomas); limpiarMensaje();
    } catch (err) { mostrarError(err); }
    e.target.value = '';
  });
  const usarCarpeta = (datos) => async () => {
    try { const r = await post('/api/carpeta', datos); pintarFilms(r.films, r.carpeta_ok, { nombre: r.carpeta_nombre }); }
    catch (e) { if (e.name !== 'AbortError') mostrarError(e); }
  };
  $('#btn-carpeta-elegir').addEventListener('click', usarCarpeta({}));
  $('#btn-carpeta-reconectar').addEventListener('click', usarCarpeta({ reconectar: true }));
  $('#importar-film').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const r = await importarFilm(f);
      pintarFilms(r.films, carpeta.ok); $('#sel-film').value = r.nombre; actualizarDestino();
      mensaje(`Film importado: ${r.nombre}`);
    } catch (err) { mostrarError(new Error('Ese archivo no es un film de BBS (.dat): ' + err.message)); }
  });
  $('#btn-exportar-film').addEventListener('click', async () => {
    const f = $('#sel-film').value;
    if (!f) return mostrarError(new Error('Elegí un film en la lista para exportarlo.'));
    exportarFilm(f).catch(mostrarError);
  });
  $('#importar-poses').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const r = await post('/api/importar_poses', { texto: await f.text() });
      posesLista = r.poses; $('#pf-pose').innerHTML = posesLista.map((n) => `<option>${esc(n)}</option>`).join('');
      mensaje(`Poses importadas. Ahora hay ${posesLista.length} poses.`);
    } catch (err) { mostrarError(new Error('No se pudo leer ese poses.json: ' + err.message)); }
  });
  $('#sel-film').addEventListener('change', actualizarDestino);
}

async function verToma(nombre) {
  const v = $('#reproductor');
  v.src = await urlToma(nombre); v.hidden = false; v.play().catch(() => {});
  if (cfg.modo === 'cara' && !vivoPrendido()) prenderVivo(true);   // la grabacion y la cara de BBS, a la vez
  const cerrar = () => { v.pause(); v.hidden = true; $('#btn-cerrar-video').hidden = true; };
  $('#btn-cerrar-video').hidden = false; $('#btn-cerrar-video').onclick = cerrar;
  v.onended = cerrar;
}

/* ---------- camara ---------- */
async function listarCamaras() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const sel = $('#sel-camara'); const prev = sel.value;
  sel.innerHTML = devs.map((d, i) => `<option value="${d.deviceId}">${esc(d.label || 'Cámara ' + (i + 1))}</option>`).join('');
  if (prev) sel.value = prev;
}

async function activarCamara() {
  $('#cam-error').textContent = '';
  try {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const deviceId = $('#sel-camara').value;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }) },
      audio: false,
    });
    const v = $('#cam'); v.srcObject = stream; await v.play();
    $('#cam-vacio').hidden = true; $('#btn-grabar').disabled = false;
    await listarCamaras();
    iniciarEsqueleto();
  } catch (e) {
    $('#cam-vacio').hidden = false;
    $('#cam-error').textContent = e.name === 'NotAllowedError'
      ? 'El navegador no tiene permiso para usar la cámara. Hacé clic en el ícono de la cámara en la barra de direcciones y permitilo.'
      : 'No se pudo abrir la cámara: ' + e.message;
  }
}

async function iniciarEsqueleto() {
  if (landmarker) { requestAnimationFrame(bucle); return; }
  $('#esqueleto-estado').textContent = 'Cargando esqueleto…';
  try {
    landmarker = await landmarkerPose('rapida', 'VIDEO');
    $('#esqueleto-estado').textContent = '';
  } catch (e) {
    console.warn(e);
    $('#esqueleto-estado').textContent = 'Sin vista de esqueleto en este dispositivo. Igual podés grabar.';
  }
  requestAnimationFrame(bucle);
}

const CONEX = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 7], [0, 8]];
const PARTES = { cabeza: [0, 7, 8], manos: [15, 16], cadera: [23, 24], pies: [27, 28] };

function bucle(ts) {
  const v = $('#cam'), c = $('#overlay');
  if (v.readyState >= 2) {
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
    const ctx = c.getContext('2d');
    if (landmarker && ts - ultimaDeteccion > 45) {
      ultimaDeteccion = ts;
      const r = landmarker.detectForVideo(v, ++relojEsqueleto);
      ctx.clearRect(0, 0, c.width, c.height);
      const lm = r.landmarks && r.landmarks[0];
      for (const [parte, idx] of Object.entries(PARTES)) {
        const el = document.querySelector(`.chip[data-parte="${parte}"]`);
        const ok = lm && idx.every((i) => (lm[i].visibility ?? 1) > 0.5);
        el.classList.toggle('si', !!ok); el.classList.toggle('no', !!lm && !ok);
      }
      if (lm && $('#chk-esqueleto').checked) {
        ctx.lineWidth = Math.max(3, c.width / 250); ctx.lineCap = 'round';
        for (const [a, b] of CONEX) {
          const ok = (lm[a].visibility ?? 1) > 0.5 && (lm[b].visibility ?? 1) > 0.5;
          ctx.strokeStyle = ok ? '#6fb24a' : 'rgba(224,68,58,.8)';
          ctx.beginPath(); ctx.moveTo(lm[a].x * c.width, lm[a].y * c.height); ctx.lineTo(lm[b].x * c.width, lm[b].y * c.height); ctx.stroke();
        }
      }
    }
  }
  requestAnimationFrame(bucle);
}

/* ---------- grabacion ---------- */
function tipoGrabacion() {
  for (const t of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'])
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

async function alternarGrabacion() {
  if (!stream) return;
  if (grabando) return pararGrabacion();
  if (!$('#cuenta').hidden) { cancelarCuenta = true; return; }
  const b = $('#btn-grabar'); b.disabled = true;
  cancelarCuenta = false;
  for (const n of [3, 2, 1]) {
    $('#cuenta').hidden = false; $('#cuenta').textContent = n;
    await new Promise((r) => setTimeout(r, 1000));
    if (cancelarCuenta) { $('#cuenta').hidden = true; b.disabled = false; return; }
  }
  $('#cuenta').hidden = true;
  const tipo = tipoGrabacion();
  recorder = new MediaRecorder(stream, { mimeType: tipo, videoBitsPerSecond: 6_000_000 });
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = subirGrabacion;
  recorder.start(500);
  grabando = true; tRec = performance.now();
  b.disabled = false; b.classList.add('activo'); $('#grabar-texto').textContent = 'Terminar toma';
  $('#rec-badge').hidden = false;
  timerRec = setInterval(() => ($('#rec-tiempo').textContent = fmt((performance.now() - tRec) / 1000) + ' s'), 100);
}
let cancelarCuenta = false;

function pararGrabacion() {
  grabando = false; clearInterval(timerRec);
  recorder.stop();
  const b = $('#btn-grabar'); b.classList.remove('activo'); $('#grabar-texto').textContent = 'Grabar toma';
  $('#rec-badge').hidden = true;
}

async function subirGrabacion() {
  const dur = (performance.now() - tRec) / 1000;
  const tipo = recorder.mimeType || 'video/webm';
  const blob = new Blob(chunks, { type: tipo });
  const ext = tipo.includes('mp4') ? '.mp4' : '.webm';
  try {
    mensaje('Guardando la toma…');
    const r = await api('/api/subir', { method: 'POST', headers: { 'X-Nombre': 'toma' + ext, 'X-Duracion': dur.toFixed(2) }, body: blob });
    tomaSel = r.nombre; pintarTomas(r.tomas); limpiarMensaje();
    if ($('#chk-auto').checked) convertir();
  } catch (e) { mostrarError(e); }
}

/* ---------- conversion ---------- */
let sondeo = null;
async function convertir() {
  if (!tomaSel) return;
  if (cfg.modo === 'cara' && !$('#sel-film').value) {
    return mostrarError(new Error('Para animar la cara elegí en el paso 3 un film (y el actor) que ya tenga los ojos o la boca puestos. Si la lista está vacía, importá el film de BBS (o elegí la carpeta de films en la compu).'));
  }
  const actor = $('#sel-film').value ? Number($('#sel-actor').value || 0) : 0;
  try {
    await guardarYa();   // que los ultimos ajustes (ej. modo Cara) lleguen antes de convertir
    await post('/api/procesar', { toma: tomaSel, film: $('#sel-film').value, actor, desde: Number($('#desde').value || 0) });
  } catch (e) { return mostrarError(e); }
  $('#btn-convertir').disabled = true; $('#btn-convertir').textContent = 'Convirtiendo…'; vista.ocupado(true);
  $('#progreso').hidden = false; $('#barra').style.width = '2%';
  $('#resultado').hidden = true; $('#registro-box').hidden = false; $('#registro').textContent = '';
  clearInterval(sondeo);
  sondeo = setInterval(async () => {
    const s = await api('/api/estado').catch(() => null); if (!s) return;
    $('#barra').style.width = Math.max(2, s.progreso * 100) + '%';
    $('#registro').textContent = s.log.join('\n');
    if (!s.ocupado) {
      clearInterval(sondeo);
      $('#btn-convertir').disabled = false; $('#btn-convertir').textContent = textoConvertir();
      $('#progreso').hidden = true; vista.ocupado(false);
      if (s.error) mostrarError(new Error(s.error));
      else if (s.resultado) mostrarResultado(s.resultado);
      api('/api/tomas').then((t) => { pintarTomas(t); if (!s.error) vista.alTerminar(); }).catch(() => {});
    }
  }, 400);
}

const NOMBRES = { right_leg: 'pierna derecha', right_knee: 'rodilla derecha', left_leg: 'pierna izquierda', left_knee: 'rodilla izquierda',
  right_arm: 'brazo derecho', left_arm: 'brazo izquierdo', right_elbow: 'codo derecho', left_elbow: 'codo izquierdo', head: 'cabeza', low_body: 'torso', anchor: 'giro' };

function mostrarResultado(r) {
  const box = $('#resultado'); box.hidden = false; box.classList.remove('error');
  const partes = [];
  if (r.poses != null) partes.push(`${r.poses} poses`);
  partes.push(`${fmt(r.duracion)} s`);
  const omit = (r.omitidos || []).map((b) => NOMBRES[b] || b);
  box.innerHTML = `<h3>Animación lista</h3>
    <p>${esc(r.archivo)} · ${partes.join(' · ')}</p>
    ${omit.length ? `<p class="ayuda">Sin animar porque no se veían: ${esc(omit.join(', '))}.</p>` : ''}
    ${r.ojos ? `<p>Ojos (${esc(r.ojos.modelo)}): ${r.ojos.parpadeos} parpadeos, ${r.ojos.cambios_mirada} cambios de mirada, ${r.ojos.cambios_cejas} de cejas.</p>` : ''}
    ${r.boca ? `<p>Boca (${esc(r.boca.modelo)}): ${r.boca.cambios} cambios de forma.</p>` : ''}
    ${(r.avisos || []).map((a) => `<p class="ayuda">${esc(a)}</p>`).join('')}
    <p class="ruta">${esc(r.carpeta)}</p>
    <button class="btn btn-chico" id="btn-abrir-res">${r.enCarpeta ? 'Descargar copia' : 'Exportar .dat'}</button>
    <button class="btn btn-chico" id="btn-ver-3d">Ver en 3D</button>`;
  $('#btn-abrir-res').onclick = () => exportarFilm(r.archivo).catch(mostrarError);
  api('/api/films').then((d) => pintarFilms(d.films, d.carpeta_ok, { nombre: d.carpeta_nombre })).catch(() => {});
  $('#btn-ver-3d').onclick = () => vista.abrir();
}

function mostrarError(e) {
  const box = $('#resultado'); box.hidden = false; box.classList.add('error');
  box.innerHTML = `<h3>No se pudo completar</h3><p>${esc(e.message || e)}</p>`;
  if (vista && vista.activa()) $('#v3-aviso').textContent = 'No se pudo completar: ' + (e.message || e);
}
function mensaje(t) { const box = $('#resultado'); box.hidden = false; box.classList.remove('error'); box.innerHTML = `<p>${esc(t)}</p>`; }
function limpiarMensaje() { $('#resultado').hidden = true; }

/* ---------- inicio ---------- */
async function inicio() {
  vista = crearVista({
    api, tomas: () => tomasLista, films: () => filmsLista, tomaSel: () => tomaSel, convertir: () => convertir(), modo: () => cfg.modo,
    poses: () => posesLista, post, estilo: () => cfg.estilo, cfg: () => cfg, urlToma,
    elegirToma: (n) => { tomaSel = n; document.querySelectorAll('#tomas li').forEach((x) => x.setAttribute('aria-selected', x.dataset.nombre === n)); $('#btn-convertir').disabled = !n; },
  });
  enlazarAjustes(); enlazarTomas();
  $('#btn-activar').addEventListener('click', activarCamara);
  $('#sel-camara').addEventListener('change', activarCamara);
  $('#btn-grabar').addEventListener('click', alternarGrabacion);
  $('#btn-convertir').addEventListener('click', convertir);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('input, select, textarea, button, video')) {
      e.preventDefault();
      if (vista.activa()) vista.alternar(); else alternarGrabacion();
    }
  });
  try {
    const d = await api('/api/inicio');
    cfg = d.config; cfg._modelo_preview = d.modelo_preview;
    posesLista = d.poses || [];
    $('#pf-pose').innerHTML = posesLista.map((n) => `<option>${esc(n)}</option>`).join('');
    pintarAjustes(); ponerModoApp(cfg.modo || 'cuerpo', false); pintarTomas(d.tomas);
    pintarFilms(d.films, d.carpeta_ok, { nombre: d.carpeta_nombre, puede: d.puede_carpeta });
    persistir();
    vista.alTerminar();
  } catch (e) { mostrarError(e); }
  if (navigator.mediaDevices?.getUserMedia) {
    const perm = await navigator.permissions?.query({ name: 'camera' }).catch(() => null);
    if (perm && perm.state === 'granted') activarCamara();
  } else {
    $('#cam-error').textContent = 'Este navegador no permite usar la cámara. Usá Chrome o Edge.';
  }
}
/* ---------- importar animacion de otro modelo (FBX, GLB, BVH) ---------- */
let archivoAnim = null;
$('#imp-archivo').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  $('#imp-panel').hidden = false; $('#imp-msg').textContent = 'Leyendo…'; $('#imp-nombre').textContent = f.name;
  try {
    const clips = await clipsDeAnimacion(f);
    archivoAnim = f;
    $('#imp-clip').innerHTML = clips.map((c) => `<option value="${c.indice}">${esc(c.nombre)} (${c.duracion.toFixed(1).replace('.', ',')} s)</option>`).join('');
    const larga = clips.reduce((m, c) => (c.duracion > clips[m].duracion ? c.indice : m), 0);   // la mas larga suele ser la de verdad
    $('#imp-clip').value = String(larga);
    $('#imp-msg').textContent = '';
  } catch (err) { archivoAnim = null; $('#imp-msg').textContent = err.message; }
});
$('#imp-convertir').addEventListener('click', async () => {
  if (!archivoAnim) return;
  const b = $('#imp-convertir'); b.disabled = true; $('#imp-msg').textContent = 'Convirtiendo…';
  try {
    const film = $('#sel-film').value;
    const r = await importarAnimacion(archivoAnim, {
      clip: Number($('#imp-clip').value || 0), estilo: $('#imp-estilo').value,
      film, actor: film ? Number($('#sel-actor').value || 0) : 0, desde: Number($('#desde').value || 0),
    });
    pintarFilms(r.films, carpeta.ok);
    $('#imp-msg').textContent = `Listo: ${r.destino} (${r.duracion.toFixed(1).replace('.', ',')} s). Miralo en la Vista 3D eligiendo ese film.`;
  } catch (err) { $('#imp-msg').textContent = 'No se pudo: ' + err.message; }
  b.disabled = false;
});

iniciarVivo();
iniciarCel();
inicio();
