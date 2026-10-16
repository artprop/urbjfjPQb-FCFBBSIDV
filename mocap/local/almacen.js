// Almacen local de la app (IndexedDB): tomas (videos), films, ajustes, poses a mano y analisis guardados.
// Funciona igual en la PC (navegador) y en el celular (APK). En la PC, si el navegador lo permite, los films
// se leen y se guardan directo en la carpeta de films de BBS (ver carpeta.js).

const DB = 'mocap-bbs', VERSION = 1;
let dbp = null;

function abrir() {
  if (dbp) return dbp;
  dbp = new Promise((ok, mal) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('tomas')) db.createObjectStore('tomas', { keyPath: 'nombre' });
      if (!db.objectStoreNames.contains('films')) db.createObjectStore('films', { keyPath: 'nombre' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
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
export const poner = (store, valor, clave) => tx(store, 'readwrite', (s) => (clave === undefined ? s.put(valor) : s.put(valor, clave)));
export const borrar = (store, clave) => tx(store, 'readwrite', (s) => s.delete(clave));
export const todos = (store) => tx(store, 'readonly', (s) => s.getAll());
export const claves = (store) => tx(store, 'readonly', (s) => s.getAllKeys());

// clave/valor
export const leerKV = (k) => obtener('kv', k);
export const guardarKV = (k, v) => poner('kv', v, k);
export const borrarKV = (k) => borrar('kv', k);

// pedirle al navegador que no borre los datos si falta espacio
export async function persistir() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch (e) { /* no importa */ }
}
