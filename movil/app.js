// «Celu en movimiento»: graba cómo se mueve el celular (giro y aceleración) y lo reproduce en una simulación 3D.
// Los sensores se leen con los eventos del navegador (deviceorientation / devicemotion): hace falta un celular y una
// página segura (https o localhost). Las grabaciones quedan en el aparato y se pueden pasar a otro como archivo .json.
import * as A from '../mocap/local/almacen.js';
import { guardarSalida } from '../comun/plataforma.js';
import { Escena } from './escena.js';
import { cuaternionMundo, rumboDe, girarY, recorrido, recortar, alcance, grabacion, leerGrabacion, sinGravedad, matrizDe, frecuencia } from './nucleo.js';

const $ = (s) => document.querySelector(s);
const fmt = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let escena = null;
let activo = false;                       // sensores prendidos
let ultQ = null, rumboVivo = null;        // última orientación y cuánto se giró para que «adelante» mire al frente
let hayMovimiento = false, nOri = 0, nMov = 0, ultAcel = null, ritmo = { n: 0, desde: 0, hz: 0 };
let signoG = 1, sumaG = 0, factorAcc = 1, sumaAcc = 0;   // el sensor del iPhone marca la gravedad al revés que el de Android
let grab = null, wake = null;             // grabación en curso
let toma = null;                          // la que se está mirando: { id, nombre, muestras, hz, rec, rumbo, path, dur }
let indice = [];
let jugando = false, t = 0, ult = 0, dibujoPend = false;

function estado(txt, clase = '') { const e = $('#estado'); e.textContent = txt; e.className = clase; e.title = txt; }
function aviso(html) { const a = $('#aviso'); a.hidden = !html; a.innerHTML = html || ''; }
function chips(lista) { $('#chips').innerHTML = lista.map(([txt, cl]) => `<span class="${cl || ''}">${esc(txt)}</span>`).join(''); }

// ---------- giro para que «adelante» mire al frente ----------
const rotY = (p, ang) => [p[0] * Math.cos(ang) + p[2] * Math.sin(ang), p[1], -p[0] * Math.sin(ang) + p[2] * Math.cos(ang)];
function normalizar(q) { const n = Math.hypot(...q) || 1; return q.map((x) => x / n); }
function entre(a, b, f) {   // interpolación de giros (cerca de los dos, normalizada)
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  return normalizar(a.map((x, k) => x * (1 - f) + b[k] * s * f));
}

// ---------- sensores ----------
function alOrientacion(e) {
  if (e.alpha === null || e.beta === null || e.gamma === null || e.alpha === undefined) return;
  nOri++;
  ultQ = cuaternionMundo(e.alpha, e.beta, e.gamma);
  if (rumboVivo === null) rumboVivo = rumboDe(ultQ);
  if (grab && !hayMovimiento) agregar(null, null);   // el aparato no da aceleración: se graba solo el giro
  pedirDibujo();
}
function alMovimiento(e) {
  if (!ultQ) return;
  const l = e.acceleration, cg = e.accelerationIncludingGravity, ok = (v) => v && v.x !== null && v.y !== null && v.z !== null && v.x !== undefined;
  if (!ok(l) && !ok(cg)) return;
  hayMovimiento = true; nMov++;
  const ahora = performance.now(); ritmo.n++;
  if (ahora - ritmo.desde > 1000) { ritmo.hz = ritmo.n * 1000 / (ahora - ritmo.desde); ritmo.n = 0; ritmo.desde = ahora; }
  let a = null;
  if (ok(cg)) {
    const w = matrizDe(ultQ), f = [cg.x, cg.y, cg.z];
    sumaG += w[1][0] * f[0] + w[1][1] * f[1] + w[1][2] * f[2];   // ¿la gravedad marca hacia arriba (Android) o hacia abajo (iPhone)?
    signoG = sumaG < 0 ? -1 : 1;
  }
  if (ok(l)) {
    // el sensor ya le sacó la gravedad; si da el signo contrario al que sale de restarla, se da vuelta
    if (ok(cg)) { const alt = sinGravedad([cg.x, cg.y, cg.z], ultQ, signoG); sumaAcc += l.x * alt[0] + l.y * alt[1] + l.z * alt[2]; factorAcc = sumaAcc < 0 ? -1 : 1; }
    a = [l.x * factorAcc, l.y * factorAcc, l.z * factorAcc];
  } else a = sinGravedad([cg.x, cg.y, cg.z], ultQ, signoG);
  const r = e.rotationRate;
  const g = r && r.alpha !== null && r.alpha !== undefined ? [r.beta || 0, r.gamma || 0, r.alpha || 0] : null;
  ultAcel = a;
  if (grab) agregar(a, g);
  pedirDibujo();
}
function agregar(a, g) {
  const ahora = performance.now() / 1000;
  if (grab.t0 === null) grab.t0 = ahora;
  grab.muestras.push({ t: ahora - grab.t0, q: ultQ.slice(), a, g });
}

async function activar() {
  if (activo) return;
  try {
    for (const C of [window.DeviceMotionEvent, window.DeviceOrientationEvent]) {
      if (C && typeof C.requestPermission === 'function') { const r = await C.requestPermission(); if (r !== 'granted') throw new Error('Diste permiso denegado: en Ajustes → Safari → Movimiento y orientación, permitilo.'); }
    }
  } catch (e) { aviso(`<b class="mal">No se pudo activar</b>${esc(e.message || e)}`); return; }
  addEventListener('deviceorientation', alOrientacion);
  addEventListener('devicemotion', alMovimiento);
  estado('Esperando datos de los sensores…');
  await new Promise((ok) => setTimeout(ok, 1500));
  if (!nOri && !nMov) {
    removeEventListener('deviceorientation', alOrientacion); removeEventListener('devicemotion', alMovimiento);
    aviso(`<b class="mal">No llegan datos de movimiento</b>${!window.isSecureContext
      ? 'Esta página no es segura (http): el celular bloquea los sensores. Abrila con https (la página de GitHub) o desde la misma compu (localhost).'
      : 'Este aparato no manda datos de movimiento (¿lo abriste en la compu?). Abrí el Estudio BBS en el celular. Mientras tanto podés ver grabaciones con 📂.'}`);
    estado('Sin sensores', 'mal');
    return;
  }
  activo = true;
  $('#ayuda').textContent = 'Para grabar bien: dejá el celu quieto donde va a empezar, tocá ⏺, hacé el movimiento, tocá ⏹ y volvé al mismo lugar, quieto.';
  $('#btnActivar').hidden = true; $('#btnGrabar').disabled = false; aviso('');
  estado(hayMovimiento ? 'Sensores listos: movimiento y giro' : 'Sensores listos: solo giro (este aparato no da aceleración)', 'ok');
  if (!toma) vivo();
}

// ---------- grabar ----------
// Como la pose en T del Mocap: la grabación empieza y termina con el celu QUIETO en el MISMO lugar. Por eso hay una cuenta
// al empezar (para soltarlo quieto después de tocar la pantalla) y otra al parar (para volver al lugar y dejarlo quieto);
// con eso el programa mide el error del sensor y hace que el recorrido termine donde empezó.
const CUENTA = 3;   // segundos
let cuenta = null;  // { tipo, ya, cancelar } mientras corre una cuenta regresiva
function vibrar(ms = 180) { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* sin vibración */ } }
function cuentaRegresiva(tipo, seg, mensaje) {
  return new Promise((ok) => {
    let resto = seg;
    const pintar = () => aviso(`<b style="font-size:44px;line-height:1.1;margin:0">${resto}</b>${mensaje}`);
    const fin = (v) => { clearInterval(id); cuenta = null; aviso(''); ok(v); };
    cuenta = { tipo, ya: () => fin(true), cancelar: () => fin(false) };
    pintar();
    const id = setInterval(() => { resto--; if (resto <= 0) fin(true); else pintar(); }, 1000);
  });
}
function botonGrabar(estadoBoton) {
  const b = $('#btnGrabar');
  b.classList.toggle('grabando', estadoBoton === 'grabando'); b.classList.toggle('grabar', estadoBoton !== 'grabando');
  b.innerHTML = estadoBoton === 'grabando' ? '⏹<span class="txt"> Parar</span>' : estadoBoton === 'cuenta' ? '✖<span class="txt"> Cancelar</span>' : '⏺<span class="txt"> Grabar</span>';
}
async function alternarGrabacion() {
  if (!activo) return;
  if (cuenta) { cuenta.tipo === 'fin' ? cuenta.ya() : cuenta.cancelar(); return; }   // (tocar de nuevo: parar ya / cancelar)
  if (!grab) return empezar();
  return terminar();
}
async function empezar() {
  jugando = false; $('#btnPlay').textContent = '▶';
  for (const id of ['#selToma', '#btnBorrar', '#btnExportar', '#btnPlay']) $(id).disabled = true;
  $('#t').disabled = true; toma = null; $('#selToma').value = ''; escena.ponerRecorrido([]); $('#ayuda').textContent = '';
  botonGrabar('cuenta'); chips([['Preparate', 'tit'], ['el celu tiene que estar quieto en su lugar de partida']]);
  const sigue = await cuentaRegresiva('inicio', CUENTA, 'Dejá el celu <strong>quieto</strong> en el lugar donde va a <strong>empezar y terminar</strong>.');
  if (!sigue) { botonGrabar('listo'); $('#selToma').disabled = false; vivo(); estado('Cancelado'); return; }
  vibrar();
  grab = { muestras: [], t0: null };
  botonGrabar('grabando');
  try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch { wake = null; }   // que no se apague la pantalla
  estado('Grabando… hacé el movimiento y al terminar tocá ⏹ y volvé al mismo lugar'); pedirDibujo();
}
async function terminar() {
  await cuentaRegresiva('fin', CUENTA, 'Volvé con el celu al <strong>mismo lugar</strong> de donde salió y dejalo <strong>quieto</strong>.');
  vibrar(260);
  const g = grab; grab = null;
  botonGrabar('listo'); $('#selToma').disabled = false;
  try { if (wake) { await wake.release(); wake = null; } } catch { /* ya soltada */ }
  if (!g || g.muestras.length < 5) { estado('La grabación quedó vacía (muy corta)', 'mal'); vivo(); return; }
  // se saca el rato quieto de sobra del principio y del final (queda medio segundo de cada lado)
  const completa = g.muestras, recortadas = recortar(completa, recorrido(completa, { cerrar: false }).quieto, 0.5);
  const n = indice.length + 1;
  const dato = grabacion(recortadas, { nombre: 'Toma ' + n, aparato: navigator.userAgent.slice(0, 90), hz: frecuencia(completa) });
  const id = await guardarToma(dato);
  await pintarTomas(id);
  await abrirToma(id, dato);
  estado(`Grabado: ${fmt(dato.duracion)} s`, 'ok');
}

// ---------- tomas guardadas ----------
async function guardarToma(dato) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await A.guardarKV('movil:' + id, dato);
  indice.push({ id, nombre: dato.nombre, creado: dato.creado, duracion: dato.duracion });
  await A.guardarKV('movil_indice', indice);
  return id;
}
async function pintarTomas(elegida = '') {
  indice = (await A.leerKV('movil_indice')) || [];
  $('#selToma').innerHTML = '<option value="">— en vivo —</option>' + indice.map((x) => `<option value="${x.id}">${esc(x.nombre)} · ${fmt(x.duracion)} s</option>`).join('');
  $('#selToma').value = elegida;
}
async function abrirToma(id, dato = null) {
  try {
    const o = leerGrabacion(dato || (await A.leerKV('movil:' + id)));
    const rec = recorrido(o.muestras, { cerrar: $('#chkCerrar').checked });
    toma = { id, nombre: o.nombre || 'Grabación', muestras: o.muestras, hz: o.hz || frecuencia(o.muestras), rec, rumbo: rumboDe(o.muestras[0].q), dur: o.muestras[o.muestras.length - 1].t };
    armarRecorrido();
    t = 0; $('#t').max = String(toma.dur); $('#t').disabled = false; $('#btnPlay').disabled = false;
    for (const x of ['#btnExportar', '#btnBorrar']) $(x).disabled = !id;
    if (!id) $('#btnBorrar').disabled = true;
    aviso(''); mostrar(0);
    $('#ayuda').textContent = 'arrastrá para girar la vista · rueda: acercar · doble toque: vista inicial';
  } catch (e) { estado('No se pudo abrir: ' + (e.message || e), 'mal'); }
}
function armarRecorrido() {
  toma.path = toma.rec.pos.map((p) => rotY(p, toma.rumbo));
  escena.ponerRecorrido($('#chkRecorrido').checked ? toma.path : []);
}
function vivo() {   // sin grabación elegida: el celu se ve en vivo
  toma = null; jugando = false; $('#btnPlay').textContent = '▶';
  $('#t').disabled = true; $('#btnPlay').disabled = true; $('#btnExportar').disabled = true; $('#btnBorrar').disabled = true; $('#lectura').textContent = '0,0 s';
  $('#ayuda').textContent = activo ? 'Para grabar bien: dejá el celu quieto donde va a empezar, tocá ⏺, hacé el movimiento, tocá ⏹ y volvé al mismo lugar, quieto.' : '';
  escena.ponerRecorrido([]); pedirDibujo();
}

// ---------- reproducir ----------
function indiceEn(ms, tt) {   // última muestra con tiempo <= tt
  let a = 0, b = ms.length - 1;
  while (a < b) { const m = (a + b + 1) >> 1; if (ms[m].t <= tt) a = m; else b = m - 1; }
  return a;
}
function mostrar(tt) {
  if (!toma) return;
  t = Math.max(0, Math.min(toma.dur, tt));
  const ms = toma.muestras, i = indiceEn(ms, t), j = Math.min(ms.length - 1, i + 1);
  const f = ms[j].t > ms[i].t ? Math.min(1, (t - ms[i].t) / (ms[j].t - ms[i].t)) : 0;
  const q = girarY(entre(ms[i].q, ms[j].q, f), toma.rumbo);
  const con = $('#chkRecorrido').checked;
  const p = con ? [0, 1, 2].map((c) => toma.path[i][c] + (toma.path[j][c] - toma.path[i][c]) * f) : [0, 0, 0];
  escena.poner(q, p, con ? i + 1 : 0);
  $('#t').value = String(t);
  $('#lectura').textContent = `${fmt(t)} / ${fmt(toma.dur)} s`;
  const acel = ms[i].a ? Math.hypot(...ms[i].a) : null;
  chips([[toma.nombre, 'tit'], [`${fmt(toma.hz, 0)} Hz`], acel !== null ? [`aceleración ${fmt(acel)} m/s²`] : ['sin aceleración (solo giro)', 'rojo'],
    con && ms.some((m) => m.a) ? [`alcance ${fmt(alcance(toma.rec.pos), 2)} m (aprox.)`, toma.rec.avisos.length ? 'rojo' : 'ok'] : ['sin recorrido'],
    ...(con && toma.rec.cierre.aplicado ? [[`cierre: terminaba a ${fmt(toma.rec.cierre.residuo * 100, 0)} cm del inicio → corregido`, 'ok']] : []),
    ...(con ? toma.rec.avisos.map((a) => [a, 'rojo']) : [])]);
}
function cuadro(ahora) {
  if (!jugando || !toma) return;
  const dt = Math.min(0.1, (ahora - ult) / 1000) * Number($('#selVel').value); ult = ahora;
  let nt = t + dt; if (nt > toma.dur) nt = 0;   // se repite
  mostrar(nt);
  requestAnimationFrame(cuadro);
}
function play() { if (!toma || jugando) return; jugando = true; ult = performance.now(); $('#btnPlay').textContent = '⏸'; requestAnimationFrame(cuadro); }
function pausa() { jugando = false; $('#btnPlay').textContent = '▶'; }

// ---------- dibujo ----------
function pedirDibujo() { if (!dibujoPend) { dibujoPend = true; requestAnimationFrame(refrescar); } }
function refrescar() {
  dibujoPend = false;
  if (toma || !escena) return;   // (con una grabación elegida, dibuja mostrar())
  if (ultQ) escena.poner(girarY(ultQ, rumboVivo || 0), [0, 0, 0], 0);
  if (grab) {
    const dur = grab.muestras.length ? grab.muestras[grab.muestras.length - 1].t : 0;
    chips([['● Grabando', 'rojo tit'], [`${fmt(dur)} s`], [`${grab.muestras.length} muestras`]]);
    $('#lectura').textContent = `${fmt(dur)} s`;
  } else if (activo && !cuenta) {
    chips([['En vivo', 'tit'], [hayMovimiento ? `${fmt(ritmo.hz, 0)} datos por segundo` : 'solo giro'], ultAcel ? [`aceleración ${fmt(Math.hypot(...ultAcel))} m/s²`] : ['sin aceleración']]);
  }
}

// ---------- controles ----------
$('#btnActivar').onclick = activar;
$('#btnGrabar').onclick = alternarGrabacion;
$('#btnPlay').onclick = () => (jugando ? pausa() : play());
$('#t').oninput = (e) => { pausa(); mostrar(Number(e.target.value)); };
$('#chkRecorrido').onchange = () => { if (toma) { armarRecorrido(); mostrar(t); } };
$('#chkCerrar').onchange = () => { if (toma) { toma.rec = recorrido(toma.muestras, { cerrar: $('#chkCerrar').checked }); armarRecorrido(); mostrar(t); } };
$('#chkSeguir').onchange = (e) => { escena.seguir = e.target.checked; if (!e.target.checked) { escena.objetivo.set(0, 0.9, 0); escena._camara(); } pedirDibujo(); if (toma) mostrar(t); };
$('#btnCentrar').onclick = () => {
  if (toma) { const ms = toma.muestras, i = indiceEn(ms, t); toma.rumbo = rumboDe(ms[i].q); armarRecorrido(); mostrar(t); }
  else if (ultQ) { rumboVivo = rumboDe(ultQ); pedirDibujo(); }
};
$('#selToma').onchange = async (e) => {
  pausa();
  if (!e.target.value) return vivo();
  await abrirToma(e.target.value);
};
$('#btnBorrar').onclick = async () => {
  if (!toma || !toma.id || !confirm(`¿Borrar «${toma.nombre}»?`)) return;
  await A.borrarKV('movil:' + toma.id);
  indice = indice.filter((x) => x.id !== toma.id); await A.guardarKV('movil_indice', indice);
  await pintarTomas(''); vivo(); estado('Borrada');
};
$('#btnExportar').onclick = async () => {
  if (!toma || !toma.id) return;
  try {
    const dato = await A.leerKV('movil:' + toma.id);
    const nombre = (toma.nombre || 'grabacion').replace(/[^A-Za-z0-9_-]+/g, '_') + '.json';
    estado(await guardarSalida('movil', nombre, JSON.stringify(dato), 'application/json'), 'ok');
  } catch (e) { estado('No se pudo exportar: ' + (e.message || e), 'mal'); }
};
$('#inArchivo').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const dato = JSON.parse(await f.text());
    leerGrabacion(dato);   // (falla si no es una grabación del celu)
    dato.nombre = dato.nombre && dato.nombre !== 'Toma 1' ? dato.nombre : f.name.replace(/\.json$/i, '');
    const id = await guardarToma(dato);
    await pintarTomas(id); await abrirToma(id, dato);
    estado('Abierta: ' + f.name, 'ok');
  } catch (err) { estado('No se pudo abrir: ' + (err.message || err), 'mal'); }
};
addEventListener('keydown', (e) => {
  if (e.target.closest('input, select')) return;
  if (e.code === 'Space') { e.preventDefault(); jugando ? pausa() : play(); }
});

// ---------- inicio ----------
try { escena = new Escena($('#vista')); } catch (e) { aviso(`<b class="mal">No se pudo iniciar el 3D</b>${esc(e.message)}`); }
pintarTomas('').catch(() => {});
if (escena) escena.poner([0, 0, 0, 1], [0, 0, 0], 0);
