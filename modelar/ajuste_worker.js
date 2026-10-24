// El ajuste de cajas giradas corre aparte (no traba la pantalla): primero arma todas las versiones (1, 2, 3… cajas) partiendo
// cajas, y después pule cada una y la manda apenas está. Si se pide, pule más una versión elegida. Con simetría se arma la mitad
// derecha del modelo y se copia espejada.
import { Ajuste, versionesSugeridas, mitad, espejar, parecidoDe } from './nucleo/ajuste.js';

let aj = null, fotos = [], vivo = 0, sim = null, todo = null;

// de una versión de la mitad (o del todo) a lo que se muestra: las cajas completas y su parecido con el modelo entero
function completa(q) {
  if (!sim) return q;
  const cajas = espejar(q.cajas, sim.medio);
  return { cajas, parecido: parecidoDe(todo.solido, todo.nx, todo.ny, todo.nz, cajas) };
}

onmessage = async (e) => {
  const m = e.data;
  if (m.tipo === 'empezar') {
    const id = ++vivo;
    todo = m; sim = m.espejo ? mitad(m.solido, m.nx, m.ny, m.nz) : null;
    aj = new Ajuste(sim ? sim.media : m.solido, m.nx, m.ny, m.nz, { girar: m.girar, partes: m.partes });
    aj.empezar(); fotos = [aj.foto()];
    while (aj.cajas.length < (sim ? Math.ceil(m.max / 2) : m.max) && aj.paso()) {
      fotos.push(aj.foto());
      if (fotos.length % 10 === 0) postMessage({ tipo: 'armando', n: fotos.length, max: sim ? Math.ceil(m.max / 2) : m.max });
    }
    // pulir cada versión (rápido) y mandarla
    const parecidos = [];
    for (let i = 0; i < fotos.length; i++) {
      if (id !== vivo) return;
      const q = aj.pulir(fotos[i], 3, 30); fotos[i] = q.cajas;
      const c = completa(q); parecidos.push(c.parecido);
      postMessage({ tipo: 'version', n: i + 1, cajas: c.cajas, parecido: c.parecido, total: fotos.length, sugeridas: versionesSugeridas(parecidos).map((k) => k + 1) });
      if (i % 5 === 4) await new Promise((ok) => setTimeout(ok, 0));   // (deja entrar un pedido de «pulir más»)
    }
    postMessage({ tipo: 'listo' });
  } else if (m.tipo === 'pulir' && aj) {
    const q = aj.pulir(fotos[m.n - 1], 10, 60);
    fotos[m.n - 1] = q.cajas;
    const c = completa(q);
    postMessage({ tipo: 'pulida', n: m.n, cajas: c.cajas, parecido: c.parecido });
  }
};
