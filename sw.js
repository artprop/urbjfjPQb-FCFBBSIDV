// Siempre pide a la red la versión nueva (pregunta si cambió, sin bajar de nuevo lo que sigue igual).
// Si no hay internet, usa la última copia guardada. Así no hace falta borrar la caché al actualizar.
const CACHE = 'estudio-bbs';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/pc/') || r.headers.has('range')) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(r, { cache: 'no-cache' });
      if (res.ok) { const c = await caches.open(CACHE); c.put(r, res.clone()).catch(() => {}); }
      return res;
    } catch (err) {
      const guardado = await caches.match(r);
      if (guardado) return guardado;
      throw err;
    }
  })());
});
