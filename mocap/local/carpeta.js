// Films: en la PC (Chrome/Edge) se puede elegir la carpeta de films de BBS y la app lee y guarda ahi directo.
// En el celular no se puede tocar esa carpeta: los films se importan a la app y el resultado se exporta (descargar/compartir).
import * as A from './almacen.js';

export const puedeCarpeta = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

let manija = null;   // FileSystemDirectoryHandle de la carpeta de films

export async function cargarCarpeta() {
  if (!puedeCarpeta()) return null;
  manija = (await A.leerKV('carpeta_films').catch(() => null)) || null;
  return manija;
}
export const nombreCarpeta = () => (manija ? manija.name : '');

// true si ya hay permiso; si se pasa pedir=true (tiene que venir de un clic) lo pide
export async function permisoCarpeta(pedir = false) {
  if (!manija) return false;
  const o = { mode: 'readwrite' };
  if ((await manija.queryPermission(o)) === 'granted') return true;
  if (pedir) return (await manija.requestPermission(o)) === 'granted';
  return false;
}

export async function elegirCarpeta() {
  manija = await window.showDirectoryPicker({ id: 'films-bbs', mode: 'readwrite' });
  await A.guardarKV('carpeta_films', manija);
  return manija;
}
export async function olvidarCarpeta() { manija = null; await A.borrarKV('carpeta_films'); }

async function carpetaLista() { return manija && (await permisoCarpeta()) ? manija : null; }

// ---------- films (carpeta si hay, si no el almacen interno) ----------
export async function listarFilms() {
  const c = await carpetaLista();
  if (c) {
    const out = [];
    for await (const [nombre, h] of c.entries()) {
      if (h.kind === 'file' && nombre.toLowerCase().endsWith('.dat')) out.push({ nombre, fecha: (await h.getFile()).lastModified });
    }
    return out.sort((a, b) => b.fecha - a.fecha).map((f) => f.nombre);
  }
  const fs = await A.todos('films');
  return fs.sort((a, b) => b.fecha - a.fecha).map((f) => f.nombre);
}

export async function leerFilm(nombre) {
  const c = await carpetaLista();
  if (c) {
    try { return new Uint8Array(await (await (await c.getFileHandle(nombre)).getFile()).arrayBuffer()); } catch (e) { /* puede estar en el almacen */ }
  }
  const f = await A.obtener('films', nombre);
  if (!f) throw new Error(`No encuentro el film "${nombre}".`);
  return f.bytes;
}

export async function existeFilm(nombre) {
  const c = await carpetaLista();
  if (c) { try { await c.getFileHandle(nombre); return true; } catch (e) { /* no esta */ } }
  return Boolean(await A.obtener('films', nombre));
}

// guarda sin pisar: si ya existe, agrega _2, _3...
export async function guardarFilm(nombre, bytes) {
  const base = nombre.replace(/\.dat$/i, '');
  let final = nombre, n = 2;
  while (await existeFilm(final)) final = `${base}_${n++}.dat`;
  const c = await carpetaLista();
  if (c) {
    const w = await (await c.getFileHandle(final, { create: true })).createWritable();
    await w.write(bytes); await w.close();
  } else {
    await A.poner('films', { nombre: final, bytes, fecha: Date.now() });
  }
  return { nombre: final, enCarpeta: Boolean(c) };
}

export async function importarFilm(nombre, bytes) {
  return guardarFilm(nombre.toLowerCase().endsWith('.dat') ? nombre : nombre + '.dat', bytes);
}

export async function borrarFilmInterno(nombre) { await A.borrar('films', nombre); }
