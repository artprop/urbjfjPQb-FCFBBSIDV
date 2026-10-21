// Director: arranque, pestañas, elegir y abrir el film (compartido por "Capas automáticas" y "Guion de escena"),
// audios y guardar lo que sale. Lo de cada página está en ui_capas.js y ui_escena.js.
import * as bbsdat from '../mocap/nucleo/bbsdat.js';
import { esPC, hayRhubarb, guardarSalida, abrirCarpetaSalida } from '../comun/plataforma.js';
import { Fuentes } from './local/fuentes.js';
import * as A from './local/almacen.js';
import * as capas from './nucleo/capas.js';
import { leerAudio } from './nucleo/wav.js';
import * as uiCapas from './ui_capas.js';
import * as uiEscena from './ui_escena.js';
import * as uiCamaras from './ui_camaras.js';
import * as formato from './nucleo/formato.js';

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const COLORES = ['#4fa3ff', '#f2994a', '#3fbf7f', '#c86bdf', '#e0574f', '#e8d44d', '#4dd0c8', '#a0a8b8'];
export const color = (i) => (i < 0 ? '#555' : COLORES[i % COLORES.length]);
export function estado(id, txt, cls = '') { const e = $(id); e.textContent = txt; e.className = 'estado ' + cls; }

// lo que comparten las dos páginas
export const app = {
  fuentes: new Fuentes(),
  pc: false, rhubarb: false,
  bocas: {},
  film: null, filmId: '', filmNombre: '', formato: 'b22',       // film abierto (sin tocar) y su nombre de archivo sin .dat
  audios: new Map(),                              // id -> {sr, d} ya leído
};

// ---------------------------------------------------------------- audios
export async function audio(id) {
  if (!app.audios.has(id)) {
    const { bytes } = await app.fuentes.leerAudio(id);
    app.audios.set(id, await leerAudio(bytes));
  }
  return app.audios.get(id);
}

// ---------------------------------------------------------------- guardar lo que sale
// nombre = nombre del archivo (.dat). Se guarda en Salida (PC) o se descarga/comparte (celu), y queda en la app para encadenar.
export async function guardarFilm(nombre, film) {
  const bytes = await bbsdat.escribir(film);
  await bbsdat.leer(bytes);                       // se vuelve a leer para asegurarse de que quedó sano
  await A.guardarSalidaLocal(nombre, bytes, await app.fuentes.mundoDeFilm(app.filmId));
  const donde = await guardarSalida('director', nombre, bytes);
  await listarFilms(app.filmId);         // aparece arriba de la lista, pero sigue elegido el film abierto
  return donde;
}
export const abrirSalida = () => abrirCarpetaSalida();

// ---------------------------------------------------------------- films
async function listarFilms(elegir = null) {
  const sel = $('films'), antes = elegir || sel.value;
  const lista = await app.fuentes.listarFilms().catch((e) => { estado('estadoFilm', 'No pude leer la carpeta: ' + e.message, 'mal'); return []; });
  sel.innerHTML = lista.length ? lista.map((f) => `<option value="${esc(f.id)}">${esc(f.nombre)}</option>`).join('')
    : '<option value="">(no hay films: elegí la carpeta o importá uno)</option>';
  if (antes && lista.some((f) => f.id === antes)) sel.value = antes;
  $('btnAbrir').disabled = !lista.length;
}

export async function abrirFilm(id, pestana = null) {
  if (!id) return;
  estado('estadoFilm', 'Abriendo…');
  try {
    const crudo = await bbsdat.leer(await app.fuentes.leerFilm(id));
    app.formato = formato.detectar(crudo);
    const film = app.formato === 'fs' ? crudo : capas.revisarFilm(crudo);
    app.film = film; app.filmId = id; app.filmNombre = Fuentes.nombreArchivo(id);
    $('films').value = id;
    try { localStorage.setItem('director_film', id); } catch { /* sin almacenamiento */ }
    estado('estadoFilm', `Abierto: ${app.filmNombre} · ${(film.replays || []).length} actores`, 'ok');
    if (app.formato === 'fs') {
      // BBS FS: por ahora solo las cámaras (las otras páginas trabajan con el formato 2.2)
      $('capasTrabajo').hidden = $('escenaTrabajo').hidden = true;
      mostrar('camaras'); uiCamaras.abrir();
      estado('estadoFilm', `Abierto: ${app.filmNombre} · ${(film.replays || []).length} actores · formato BBS FS (por ahora solo la página Cámaras)`, 'ok');
      return;
    }
    if (pestana) mostrar(pestana);
    await Promise.all([uiEscena.abrir(), uiCapas.abrir(), uiCamaras.abrir()]);
  } catch (e) {
    console.warn(e);
    estado('estadoFilm', 'No se pudo abrir: ' + e.message, 'mal');
  }
}

// ---------------------------------------------------------------- carpeta de Minecraft
async function pintarCarpeta(est) {
  const F = app.fuentes;
  $('btnCarpeta').hidden = !F.puedeCarpeta();
  $('btnPermiso').hidden = est !== 'pedir_permiso';
  if (est === 'pedir_permiso') $('btnPermiso').textContent = `📂 Volver a abrir "${F.nombreCarpeta()}"`;
  $('btnCarpeta').textContent = F.nombreCarpeta() ? '📂 Cambiar carpeta' : '📂 Elegir carpeta de Minecraft';
  $('txtCarpeta').textContent = est === 'ok' ? `Carpeta: ${F.nombreCarpeta()} (solo se lee)` + (F.aviso() ? ' · ' + F.aviso() : '')
    : (F.puedeCarpeta() ? (est === 'pedir_permiso' ? 'El navegador pide permiso otra vez para leerla.' : 'Elegí la carpeta 1.20.1 de tu Minecraft (la que tiene "saves" y "config").')
      : 'Importá el film y sus audios (abajo, "Traer archivos a la app").');
  if (!F.puedeCarpeta()) $('importar').open = true;
}

// ---------------------------------------------------------------- pestañas
function mostrar(tab) {
  for (const b of document.querySelectorAll('#pestanas button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  $('tabCapas').hidden = tab !== 'capas'; $('tabEscena').hidden = tab !== 'escena'; $('tabCamaras').hidden = tab !== 'camaras';
  try { localStorage.setItem('director_tab', tab); } catch { /* nada */ }
  if (tab === 'escena') uiEscena.dibujar();
}

// ---------------------------------------------------------------- arranque
async function iniciar() {
  for (const b of document.querySelectorAll('#pestanas button')) b.onclick = () => mostrar(b.dataset.tab);
  let tab = 'capas';
  try { tab = localStorage.getItem('director_tab') || 'capas'; } catch { /* nada */ }
  mostrar(tab);

  const bocas = await (await fetch('nucleo/bocas.json')).json();
  app.bocas = Object.fromEntries(Object.entries(bocas).filter(([k]) => !k.startsWith('_')));
  [app.pc, app.rhubarb] = await Promise.all([esPC(), hayRhubarb()]);
  const mb = $('modoBoca');
  mb.textContent = app.rhubarb ? 'Boca exacta (Rhubarb)' : (app.pc ? 'Boca simple (no encontré Rhubarb)' : 'Boca simple (en la PC sale exacta)');
  mb.className = 'etiqueta ' + (app.rhubarb ? 'exacta' : 'simple');
  mb.title = app.rhubarb ? 'Las bocas se calculan con Rhubarb, como en el Director de la PC.'
    : 'Sin Rhubarb (celular o página suelta): la boca se abre y se cierra con el volumen de la voz. En la PC (abrir.bat) sale exacta.';
  $('btnSalidaCapas').hidden = $('btnSalidaEscena').hidden = $('btnSalidaCam').hidden = !app.pc;
  A.persistir();

  pintarCarpeta(await app.fuentes.iniciar().catch(() => 'sin_carpeta'));
  uiCapas.iniciar(); uiEscena.iniciar(); uiCamaras.iniciar();
  await listarFilms();
  let ultimo = '';
  try { ultimo = localStorage.getItem('director_film') || ''; } catch { /* nada */ }
  if (ultimo && [...$('films').options].some((o) => o.value === ultimo)) $('films').value = ultimo;

  $('btnAbrir').onclick = () => abrirFilm($('films').value);
  $('films').ondblclick = $('btnAbrir').onclick;
  $('btnCarpeta').onclick = async () => {
    try { await app.fuentes.elegirCarpeta(); pintarCarpeta('ok'); await listarFilms(); estado('estadoFilm', ''); } catch (e) {
      if (e.name !== 'AbortError') estado('estadoFilm', e.message, 'mal');
    }
  };
  $('btnPermiso').onclick = async () => {
    if (await app.fuentes.pedirPermiso().catch(() => false)) { pintarCarpeta('ok'); await listarFilms(); } else estado('estadoFilm', 'Sin permiso no puedo leer la carpeta.', 'mal');
  };
  $('inFilm').onchange = async (ev) => {
    let id = null;
    for (const f of ev.target.files) id = await app.fuentes.importarFilm(f);
    ev.target.value = '';
    if (id) { await listarFilms(id); await abrirFilm(id); }
  };
  $('inAudios').onchange = async (ev) => {
    const n = ev.target.files.length;
    for (const f of ev.target.files) await app.fuentes.importarAudio(f);
    ev.target.value = '';
    estado('estadoFilm', `${n} audio(s) importado(s).`, 'ok');
    if (app.film) await uiCapas.abrir();
  };
  $('inZip').onchange = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    estado('estadoFilm', 'Leyendo el .zip…');
    try {
      const r = await app.fuentes.importarZip(f);
      estado('estadoFilm', `Del .zip: ${r.nPoses} archivo(s) de poses y ${r.nAudios} audio(s).`, 'ok');
      if (app.film) await Promise.all([uiEscena.abrir(), uiCapas.abrir()]);
    } catch (e) { estado('estadoFilm', 'No se pudo leer el .zip: ' + e.message, 'mal'); }
  };
}

iniciar().catch((e) => { console.error(e); estado('estadoFilm', 'Error al arrancar: ' + e.message, 'mal'); });
