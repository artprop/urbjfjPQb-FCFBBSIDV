// Lo que el Editor guarda en el aparato (IndexedDB): films en curso, presets y ajustes.
// Los films y forms se guardan como bytes de BBS (dumps) para no perder los tipos de número.
import { dumps, loads, Num } from '../mocap/nucleo/bbsdat.js';

let _db = null;
function db() {
  if (!_db) _db = new Promise((res, rej) => {
    const r = indexedDB.open('editor-bbs', 1);
    r.onupgradeneeded = () => { for (const s of ['films', 'presets', 'kv']) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return _db;
}
async function op(store, modo, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, modo); const q = fn(tx.objectStore(store));
    tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error);
  });
}
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const kvLeer = (k) => op('kv', 'readonly', (s) => s.get(k)).catch(() => null);
export const kvGuardar = (k, v) => op('kv', 'readwrite', (s) => s.put(v, k)).catch(() => null);

// ---- films ----
export async function guardarFilm(id, nombre, film) {
  id = id || nuevoId();
  await op('films', 'readwrite', (s) => s.put({ id, nombre, fecha: Date.now(), datos: dumps(film) }, id));
  return id;
}
export async function listaFilms() {
  const todos = (await op('films', 'readonly', (s) => s.getAll())) || [];
  return todos.map(({ id, nombre, fecha }) => ({ id, nombre, fecha })).sort((a, b) => b.fecha - a.fecha);
}
export async function leerFilm(id) {
  const x = await op('films', 'readonly', (s) => s.get(id));
  return x ? { ...x, film: loads(x.datos) } : null;
}
export const borrarFilm = (id) => op('films', 'readwrite', (s) => s.delete(id));

// ---- presets: {id, tipo:'pose'|'personaje', nombre, datos} ----
export async function guardarPreset(tipo, nombre, datos) {
  const id = nuevoId();
  await op('presets', 'readwrite', (s) => s.put({ id, tipo, nombre, fecha: Date.now(), datos: dumps({ d: datos }) }, id));
  return id;
}
export async function presets(tipo) {
  const todos = (await op('presets', 'readonly', (s) => s.getAll())) || [];
  return todos.filter((p) => !tipo || p.tipo === tipo).sort((a, b) => a.fecha - b.fecha).map((p) => ({ ...p, datos: loads(p.datos).d }));
}
export const borrarPreset = (id) => op('presets', 'readwrite', (s) => s.delete(id));

// ---- pasar presets a un .json (para llevarlos de la PC al celu o al revés) ----
// Los números con tipo de BBS van como {"$n":[código, valor]} para que vuelvan iguales.
export function aJSON(v) {
  return JSON.stringify(v, (k, x) => (x instanceof Num ? { $n: [x.code, typeof x.v === 'bigint' ? String(x.v) : x.v] } : x));
}
export function deJSON(texto) {
  return JSON.parse(texto, (k, x) => (x && typeof x === 'object' && Array.isArray(x.$n) && Object.keys(x).length === 1 ? new Num(x.$n[0], x.$n[0] === 7 ? BigInt(x.$n[1]) : x.$n[1]) : x));
}
