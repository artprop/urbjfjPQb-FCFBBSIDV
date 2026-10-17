// Página "Guion de escena": escribir el guion, probarlo (vista de arriba) y generar el film.
import { $, esc, color, estado, app, guardarFilm, abrirSalida, abrirFilm } from './app.js';
import * as A from './local/almacen.js';
import * as escena from './nucleo/escena.js';
import * as mundo from './nucleo/mundo.js';
import * as capas from './nucleo/capas.js';
import { num } from '../mocap/nucleo/bbsdat.js';
import { VistaMundo } from './vista_mundo.js';

let V = null;                        // mapa desde arriba + 3D (vista_mundo.js)

let E = null, R = null, jugando = null, tGuardar = null;
const poses = new Map();             // grupo de modelo -> [poses de BBS, poses del usuario]

// nombre del film sin lo que agrega el Director (así el guion de 'X_auto' es el mismo que el de 'X')
function base(nombre) {
  let b = nombre;
  for (let cambio = true; cambio;) { cambio = false; for (const s of ['_auto', '_escena']) if (b.endsWith(s)) { b = b.slice(0, -s.length); cambio = true; } }
  return b;
}
const posesDe = (rep) => escena.posesDisponibles(rep, (g) => poses.get(g));
const seg = (t) => (t / 20).toFixed(1) + ' s';

export function iniciar() {
  $('btnProbar').onclick = probar;
  $('btnGenerarEscena').onclick = generar;
  $('btnSalidaEscena').onclick = abrirSalida;
  $('posesDe').onchange = pintarPoses;
  $('tiempo').oninput = dibujar;
  $('btnPlay').onclick = reproducir;
  addEventListener('resize', dibujar);
  $('guion').addEventListener('keydown', (ev) => { if (ev.key === 'F5' || (ev.ctrlKey && ev.key === 'Enter')) { ev.preventDefault(); probar(); } });
  $('guion').addEventListener('input', () => { clearTimeout(tGuardar); tGuardar = setTimeout(guardarGuion, 600); });
  // lo que se toca en el 3D (un bloque, "agregar cámara") se escribe en el guion y se vuelve a probar
  V = new VistaMundo($('vistaMundo'), {
    insertar: (txt) => { insertar(txt); probar(); }, color,
    alTiempo: (t) => { $('tiempo').value = t; dibujar(); }, reproducir: () => reproducir(),
  });
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-ins],[data-pose],[data-linea]');
    if (!el || !el.closest('#tabEscena')) return;
    const d = el.dataset;
    if (d.ins) insertar(d.ins + ' ');
    else if (d.pose) {
      const a = E.actores.find((x) => String(x.i) === $('posesDe').value);
      const unico = a.nombre && E.actores.filter((x) => x.nombre === a.nombre).length === 1;
      insertar(`${unico ? a.nombre : a.i + 1} pose ${d.pose} 2s\n`);
    } else if (d.linea) marcarLinea(+d.linea);
  });
}

const guardarGuion = () => { if (E) A.guardarKV('guion:' + base(app.filmNombre), $('guion').value).catch(() => {}); };

export async function abrir() {
  const film = app.film;
  if (!film) return;
  const reps = film.replays || [];
  // poses de cada modelo (las de BBS que copió el Visor + las tuyas de la carpeta o del .zip)
  for (const r of reps) for (const g of escena.gruposDePoses(r)) if (g) poses.set(g, await app.fuentes.posesDe(g));
  E = {
    actores: reps.map((r, i) => {
      const form = r.form || {};
      return { i, num: `#${i + 1}`, nombre: escena.nombreCorto(r, i), modelo: String(form.model || form.id || ''), marca: escena.esMarca(r),
        poses: Object.keys(posesDe(r)).sort((a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }) };
    }),
  };
  const guion = await A.leerKV('guion:' + base(app.filmNombre)).catch(() => null);
  $('guion').value = guion || '';
  $('tablaActores').innerHTML = '<tr><th></th><th>#</th><th>Nombre</th><th>Modelo</th></tr>' + E.actores.map((a) =>
    `<tr><td><span class="chip" style="background:${color(a.i)}"></span></td><td class="clic" data-ins="${a.i + 1}">${a.i + 1}</td>
     <td class="clic" data-ins="${esc(a.nombre)}">${esc(a.nombre)}</td><td class="suave">${esc(a.modelo)}${a.marca ? ' (marca)' : ''}</td></tr>`).join('');
  $('posesDe').innerHTML = E.actores.filter((a) => a.poses.length).map((a) => `<option value="${a.i}">${a.num} ${esc(a.nombre)}</option>`).join('');
  pintarPoses();
  $('escenaTrabajo').hidden = false;
  estado('estadoEscena', ''); R = null; $('acciones').innerHTML = '';
  dibujar();
  cargarVista();                     // el mapa del mundo se lee mientras tanto (no frena el resto)
  if (guion) probar();
}

// mapa desde arriba + 3D del mundo del film (si la carpeta de Minecraft está elegida y el film es de un mundo)
async function cargarVista() {
  const film = app.film, rel = film.relative_coordinates || {};
  const nombre = await app.fuentes.mundoDeFilm(app.filmId).catch(() => null);
  const lector = nombre ? app.fuentes.lectorRegiones(nombre) : null;
  const posiciones = (film.replays || []).map((r) => ['x', 'y', 'z'].map((k) => capas.valorProp(r, k, 0)));
  await V.cargar({ leerRegion: lector, rel: { x: num(rel.x ?? 0), y: num(rel.y ?? 0), z: num(rel.z ?? 0) }, nombreMundo: nombre,
    actores: E.actores, posiciones }).catch((e) => { console.warn(e); });
  if (R) V.escena(R);
}

function pintarPoses() {
  const a = E.actores.find((x) => String(x.i) === $('posesDe').value);
  $('poses').innerHTML = a ? a.poses.map((p) => `<span class="clic" data-pose="${esc(p)}">${esc(p)}</span>`).join('')
    : '<span class="suave">Ningún actor tiene poses. Elegí la carpeta de Minecraft o importá un .zip de bbs.</span>';
}

function insertar(txt) {
  const t = $('guion'); let a = t.selectionStart, b = t.selectionEnd;
  // una orden entera (termina en salto de línea) va en su propia línea: después de la línea donde está el cursor
  if (txt.endsWith('\n') && a > 0 && t.value[a - 1] !== '\n') {
    const finLinea = t.value.indexOf('\n', a);
    a = b = finLinea < 0 ? t.value.length : finLinea + 1;
    if (finLinea < 0) txt = '\n' + txt;
  }
  t.value = t.value.slice(0, a) + txt + t.value.slice(b); t.focus(); t.selectionStart = t.selectionEnd = a + txt.length;
  guardarGuion();
}
function marcarLinea(n) {
  const t = $('guion'), l = t.value.split('\n');
  const ini = l.slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
  t.focus(); t.selectionStart = ini; t.selectionEnd = ini + (l[n - 1] || '').length;
}

// Mapa del mundo del film (para caminar siguiendo el piso): lee las regiones alrededor de los actores y de las
// coordenadas del guion. [mundo.Mundo o null, nombre del mundo o null]. Sin carpeta (celu) o film suelto: sin mapa.
async function cargarMapa() {
  const nombre = await app.fuentes.mundoDeFilm(app.filmId).catch(() => null);
  const lector = nombre && app.fuentes.lectorRegiones(nombre);
  if (!lector) return [null, null];
  const film = app.film, rel = film.relative_coordinates || {};
  const rx = num(rel.x ?? 0), rz = num(rel.z ?? 0);
  const puntos = (film.replays || []).map((r) => [capas.valorProp(r, 'x', 0) + rx, capas.valorProp(r, 'z', 0) + rz]);
  for (const m of $('guion').value.matchAll(/(-?\d+(?:\.\d+)?)\s+-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)) puntos.push([parseFloat(m[1]), parseFloat(m[2])]);
  try { return [new mundo.Mundo(await mundo.cargarRegiones(lector, puntos)), nombre]; } catch (e) { console.warn(e); return [null, null]; }
}

// arma el guion; devuelve [film nuevo, acciones, avisos, nombre del mundo] o null si hay un error (marcado en la línea)
async function armar() {
  guardarGuion();
  const [mapa, nombreMundo] = await cargarMapa();
  try { return [...escena.armar(app.film, $('guion').value, posesDe, mapa), nombreMundo]; } catch (e) {
    if (e instanceof escena.ErrorGuion) { estado('estadoEscena', '⚠ ' + e.message, 'mal'); marcarLinea(e.linea); return null; }
    console.warn(e); estado('estadoEscena', 'Error: ' + e.message, 'mal'); return null;
  }
}

async function probar() {
  if (!E) return null;
  const r = await armar();
  if (!r) return null;
  const [nuevo, acciones, avisos, nombreMundo] = r;
  const fin = Math.max(...acciones.map((a) => a.hasta), 0) + 30;     // lo que dura el guion y un segundo y medio más
  R = { acciones, avisos, fin, recorridos: escena.recorridos(nuevo, fin) };
  $('tiempo').max = Math.ceil(fin); $('tiempo').value = 0;
  $('acciones').innerHTML = '<tr><th>Línea</th><th>Actor</th><th>Qué</th><th>Desde</th><th>Hasta</th></tr>' + acciones.map((a) =>
    `<tr class="clic" data-linea="${a.linea}"><td>${a.linea}</td><td><span class="chip" style="background:${color(a.actor)}"></span>${esc(a.nombre)}</td>
     <td>${a.tipo === 'senala' ? 'señala' : a.tipo}</td><td>${seg(a.desde)}</td><td>${seg(a.hasta)}</td></tr>`).join('');
  estado('estadoEscena', `✔ ${acciones.length} órdenes, dura ${seg(Math.max(0, ...acciones.map((a) => a.hasta)))}`
    + (nombreMundo ? ` · caminan siguiendo el piso del mundo "${nombreMundo}"` : ' · sin mapa del mundo: caminan en línea recta')
    + (avisos.length ? '\n' + avisos.join('\n') : ''), avisos.length ? 'aviso' : 'ok');
  if (V) { V.rango(fin); V.escena(R); }
  dibujar();
  return r;
}

async function generar() {
  const r = await probar();
  if (!r) return;
  try {
    const nombre = app.filmNombre + '_escena.dat';
    const donde = await guardarFilm(nombre, r[0]);
    estado('estadoEscena', `✔ Listo. ${donde}\n\nCopialo a la carpeta de films de BBS. Si además querés boca y parpadeos, tocá "Seguir en Capas" (también aparece arriba de la lista como Salida/…).` + (r[2].length ? '\n\n' + r[2].join('\n') : ''), 'ok');
    const b = document.createElement('button');
    b.textContent = '➜ Seguir en Capas con este resultado'; b.className = 'primario'; b.style.marginTop = '8px';
    b.onclick = () => abrirFilm('s:' + nombre, 'capas');
    $('estadoEscena').append(document.createElement('br'), b);
  } catch (e) { estado('estadoEscena', 'No se pudo generar: ' + e.message, 'mal'); }
}

// ---------------------------------------------------------------- vista de arriba
function posEn(pts, t) { return pts.length ? pts[Math.min(pts.length - 1, Math.max(0, Math.round(t / 2)))] : null; }

export function dibujar() {
  const cv = $('mapa'); if (!cv || !cv.clientWidth) return;
  const dpr = devicePixelRatio || 1;
  cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = cv.clientWidth, H = cv.clientHeight; g.clearRect(0, 0, W, H);
  const t = +$('tiempo').value;
  $('tiempoTxt').textContent = `${seg(t)} (tick ${t})`;
  if (V) V.tiempo(t);
  if (!R) { g.fillStyle = '#9aa3b2'; g.font = '14px system-ui, sans-serif'; g.fillText('Tocá "Probar" para ver los recorridos.', 16, 28); return; }
  // encuadre: los actores que usa el guion (si no usa ninguno, todos)
  const usados = new Set(R.acciones.map((a) => String(a.actor)));
  const camaras = R.acciones.filter((a) => a.camara);
  const pts = Object.entries(R.recorridos).filter(([i]) => !usados.size || usados.has(i)).flatMap(([, p]) => p)
    .concat(camaras.flatMap((a) => a.camara.map((q) => [q[0], q[1], q[2]])));
  if (!pts.length) return;
  let x0 = Math.min(...pts.map((p) => p[1])), x1 = Math.max(...pts.map((p) => p[1]));
  let z0 = Math.min(...pts.map((p) => p[2])), z1 = Math.max(...pts.map((p) => p[2]));
  x0 -= 2; x1 += 2; z0 -= 2; z1 += 2;
  const k = Math.min(W / (x1 - x0), H / (z1 - z0));
  // +X a la derecha, +Z hacia abajo (como el mapa de Minecraft: norte arriba)
  const px = (x) => (x - x0) * k + (W - (x1 - x0) * k) / 2, pz = (z) => (z - z0) * k + (H - (z1 - z0) * k) / 2;
  g.strokeStyle = '#1f242c'; g.lineWidth = 1;
  if (k > 6) {        // grilla de 1 bloque, solo si se ve
    for (let x = Math.ceil(x0); x <= x1; x++) { g.beginPath(); g.moveTo(px(x), 0); g.lineTo(px(x), H); g.stroke(); }
    for (let z = Math.ceil(z0); z <= z1; z++) { g.beginPath(); g.moveTo(0, pz(z)); g.lineTo(W, pz(z)); g.stroke(); }
  }
  for (const [i, p] of Object.entries(R.recorridos)) {
    g.strokeStyle = color(+i) + '66'; g.lineWidth = 2; g.beginPath();
    p.forEach((q, j) => (j ? g.lineTo(px(q[1]), pz(q[2])) : g.moveTo(px(q[1]), pz(q[2])))); g.stroke();
    const q = posEn(p, t); if (!q) continue;
    const a = E.actores[+i], X = px(q[1]), Z = pz(q[2]);
    g.globalAlpha = q[4] ? 1 : 0.25;
    g.fillStyle = color(+i); g.beginPath(); g.arc(X, Z, a.marca ? 4 : 7, 0, Math.PI * 2); g.fill();
    if (!a.marca) {     // flecha: yaw 0 = +Z (abajo en el mapa), yaw 90 = -X
      const r = q[3] * Math.PI / 180;
      g.strokeStyle = color(+i); g.lineWidth = 2; g.beginPath(); g.moveTo(X, Z); g.lineTo(X - Math.sin(r) * 16, Z + Math.cos(r) * 16); g.stroke();
    }
    g.fillStyle = '#e8ebf0'; g.font = '12px system-ui, sans-serif';
    g.fillText(`${a.nombre === a.num ? a.num : a.num + ' ' + a.nombre}${q[4] ? '' : ' (oculto)'}`, X + 9, Z - 8);
    g.globalAlpha = 1;
  }
  // cámaras del guion: recorrido punteado y, la que está activa, un triángulo que muestra hacia dónde mira
  for (const a of camaras) {
    const activa = a.desde <= t && t <= a.hasta;
    g.strokeStyle = activa ? '#f2c14e' : '#f2c14e44'; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath();
    a.camara.forEach((q, j) => (j ? g.lineTo(px(q[1]), pz(q[2])) : g.moveTo(px(q[1]), pz(q[2])))); g.stroke(); g.setLineDash([]);
    if (!activa) continue;
    const q = a.camara.reduce((m, c) => (Math.abs(c[0] - t) < Math.abs(m[0] - t) ? c : m));
    const X = px(q[1]), Z = pz(q[2]), r = q[3] * Math.PI / 180, ab = 0.45;
    g.fillStyle = '#f2c14ecc'; g.beginPath(); g.moveTo(X, Z);
    g.lineTo(X - Math.sin(r - ab) * 26, Z + Math.cos(r - ab) * 26); g.lineTo(X - Math.sin(r + ab) * 26, Z + Math.cos(r + ab) * 26); g.closePath(); g.fill();
    g.fillStyle = '#e8ebf0'; g.font = '12px system-ui, sans-serif'; g.fillText('🎥 ' + a.tipo.replace('cámara ', ''), X + 9, Z + 16);
  }
}

function reproducir() {
  const boton = (txt) => { $('btnPlay').textContent = txt; if (V) V.reproduciendo(txt === '⏸'); };
  if (jugando) { clearInterval(jugando); jugando = null; boton('▶'); return; }
  if (!R) return;
  if (+$('tiempo').value >= +$('tiempo').max) $('tiempo').value = 0;
  boton('⏸');
  jugando = setInterval(() => {
    const v = +$('tiempo').value + 1; $('tiempo').value = v; dibujar();
    if (v >= +$('tiempo').max) { clearInterval(jugando); jugando = null; boton('▶'); }
  }, 50);
}
