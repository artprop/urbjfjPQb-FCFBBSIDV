// Memoria del randomizer en el navegador (IndexedDB "estudio_randomizer"):
// prefabs, papelera de eliminados y ajustes (cantidades, carpeta bbs recordada...).
const DB = 'estudio_randomizer';
let _db = null;

function abrir() {
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('prefabs', { keyPath: 'id' });
      db.createObjectStore('eliminados', { keyPath: 'id' });
      db.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return _db;
}

const pedir = (q) => new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
async function tienda(nombre, modo = 'readonly') { return (await abrir()).transaction(nombre, modo).objectStore(nombre); }

export async function todos(nombre) { return pedir((await tienda(nombre)).getAll()); }
export async function poner(nombre, obj) { return pedir((await tienda(nombre, 'readwrite')).put(obj)); }
export async function sacar(nombre, id) { return pedir((await tienda(nombre, 'readwrite')).delete(id)); }
export async function leer(k) { try { return await pedir((await tienda('kv')).get(k)); } catch { return undefined; } }
export async function guardar(k, v) { try { await pedir((await tienda('kv', 'readwrite')).put(v, k)); } catch { /* sin memoria */ } }

// La carpeta que recordó el Visor (para no tener que elegirla dos veces)
export async function carpetaDelVisor() {
  try {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('visor-bbs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return await pedir(db.transaction('kv').objectStore('kv').get('carpeta'));
  } catch { return null; }
}

export const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
