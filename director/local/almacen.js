// Almacén local del Director (IndexedDB 'estudio_director'): films y audios importados, lo que se generó
// (para encadenar Guion -> Capas), lo elegido por film (planes), los guiones y la carpeta de Minecraft elegida.
// Funciona igual en la PC y en el celular.

const DB = 'estudio_director', VERSION = 1;
const STORES = ['films', 'audios', 'salidas', 'kv'];
let dbp = null;

function abrir() {
  if (dbp) return dbp;
  dbp = new Promise((ok, mal) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, s === 'kv' ? undefined : { keyPath: 'nombre' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  return dbp;
}

async function tx(store, modo, fn) {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const t = db.transaction(store, modo), s = t.objectStore(store);
    let res;
    const req = fn(s);
    if (req) req.onsuccess = () => { res = req.result; };
    t.oncomplete = () => ok(res);
    t.onerror = () => mal(t.error);
    t.onabort = () => mal(t.error || new Error('No se pudo guardar (¿falta espacio en el dispositivo?)'));
  });
}

export const obtener = (store, clave) => tx(store, 'readonly', (s) => s.get(clave));
export const poner = (store, valor) => tx(store, 'readwrite', (s) => s.put(valor));
export const borrar = (store, clave) => tx(store, 'readwrite', (s) => s.delete(clave));
export const todos = (store) => tx(store, 'readonly', (s) => s.getAll());

export const leerKV = (k) => tx('kv', 'readonly', (s) => s.get(k));
export const guardarKV = (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k));
export const borrarKV = (k) => tx('kv', 'readwrite', (s) => s.delete(k));

// lo generado: se guardan los últimos 20 (los más viejos se borran solos). mundo = de qué mundo viene el film
// (para seguir el piso si se vuelve a abrir), o null
export async function guardarSalidaLocal(nombre, bytes, mundo = null) {
  await poner('salidas', { nombre, bytes, fecha: Date.now(), mundo });
  const lista = (await todos('salidas')).sort((a, b) => b.fecha - a.fecha);
  for (const v of lista.slice(20)) await borrar('salidas', v.nombre);
}

export async function persistir() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* no importa */ }
}
