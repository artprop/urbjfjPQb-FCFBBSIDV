// Ojos en vivo: la misma cuenta que la conversion (nucleo/ojos.js, con los puntos del iris y los parpados), pero de un cuadro suelto de la
// camara. La base (ojos abiertos, mirando al frente) se mide con los cuadros de calibracion. Despues se dibuja la cara de 8x8 con los ojos
// de BBS (eyes 2x2 o eyes_1px) siguiendo las mismas poses que usa la conversion: mirada a saltos de 0,5, parpadeo, entrecerrar y cejas.
import * as M from './mat.js';
import { PUNTOS, ladoGeo } from './ojos.js';

export const INDICES = Object.values(PUNTOS);
const CEJA_ARRIBA = 0.625, CEJA_ABAJO = 0.70, RECORRIDO_V = 0.625, HOLGURA_NARIZ = 0.25;
const NIV = [-1, -0.5, 0, 0.5, 1];
const COLOR = { ojo: '#faf5f7', pupila: '#523d89', ceja: '#2b1e0d', parpado: '#2b1e0d' };

const clip = (x, a, b) => Math.min(Math.max(x, a), b);
const prom = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const cuantizar = (v, zona) => (Math.abs(v) < zona ? 0 : NIV.reduce((m, n) => (Math.abs(n - v) < Math.abs(m - v) ? n : m), NIV[0]));

/** Puntos de un cuadro (landmarks de MediaPipe) en el orden de ojos.js: [[x, y], ...]. */
export const puntos = (l) => INDICES.map((k) => [l[k].x, l[k].y]);

const bsDe = (nombres, bs, ...n) => { const v = n.map((x) => nombres.indexOf(x)).filter((k) => k >= 0).map((k) => bs[k]); return v.length ? prom(v) : 0; };

function geo(pts) {
  const R = ladoGeo([pts], 'iz', 'esq_ext', 'esq_int'), L = ladoGeo([pts], 'de', 'esq_int', 'esq_ext');
  return { R, L, abierto: (R.abierto[0] + L.abierto[0]) / 2, irisX: (R.iris_x[0] + L.iris_x[0]) / 2, irisY: (R.iris_y[0] + L.iris_y[0]) / 2 };
}
const gyBs = (nombres, bs) => bsDe(nombres, bs, 'eyeLookUpLeft', 'eyeLookUpRight') - bsDe(nombres, bs, 'eyeLookDownLeft', 'eyeLookDownRight');

/** Base a partir de los cuadros de calibracion [{pts, bs}]: ojos abiertos y mirando al frente. */
export function calibrar(cuadros, nombres) {
  const G = cuadros.map((c) => geo(c.pts));
  const orden = G.map((g) => g.abierto).sort((a, b) => a - b), p30 = orden[Math.floor((orden.length - 1) * 0.3)];
  const buenos = cuadros.map((_, i) => i).filter((i) => G[i].abierto >= p30);   // sin el 30 % mas cerrado (parpadeos)
  const m = (f) => M.median(buenos.map(f));
  const lado = (k, nom) => ({ ceja: Math.max(m((i) => G[i][k].ceja[0]), 1e-3), bd: m((i) => bsDe(nombres, cuadros[i].bs, 'browDown' + nom)) });
  return {
    nombres, abierto: Math.max(m((i) => G[i].abierto), 1e-3), irisX: m((i) => G[i].irisX), irisY: m((i) => G[i].irisY),
    gyBs: m((i) => gyBs(nombres, cuadros[i].bs)), l: lado('L', 'Left'), r: lado('R', 'Right'),
  };
}

/** Senales crudas de un cuadro: cierre (0 abierto, 1 cerrado), mirada gx/gy (-1 a 1), squint y cejas (-1 bajas, 1 altas). */
export function senal(base, pts, bs, { mirada = 1 } = {}) {
  const g = geo(pts), esc = Math.max(mirada, 0.05);
  const cierre = clip(1 - g.abierto / base.abierto, 0, 1);
  const gx = clip((g.irisX - base.irisX) / (0.22 / esc), -1, 1);
  const gyGeo = clip(-(g.irisY - base.irisY) / (0.35 / esc), -1, 1);
  const gyB = clip((gyBs(base.nombres, bs) - base.gyBs) / (0.5 / esc), -1, 1);
  const out = { cierre, gx, gy: clip(0.5 * gyGeo + 0.5 * gyB, -1, 1), squint: clip((cierre - 0.2) / 0.3, 0, 1) };
  for (const [lado, o, nom] of [['l', g.L, 'Left'], ['r', g.R, 'Right']]) {
    const arriba = clip((o.ceja[0] / base[lado].ceja - 1) / 0.28, 0, 1);
    const bajar = clip((bsDe(base.nombres, bs, 'browDown' + nom) - base[lado].bd) / 0.3, 0, 1);
    out['ceja_' + lado] = bajar > arriba ? -bajar : arriba;
  }
  return out;
}

/** Estado en vivo: guarda el ultimo valor y solo cambia cuando la senal se mueve mas de 0,4 (como la conversion). */
export function nuevoEstado() { return { g: [0, 0], ceja_l: 0, ceja_r: 0, squint: 0, cerrado: false }; }
export function actualizar(est, s, { umbral = 0.5, cejas = true } = {}) {
  const salta = (a, b) => (Math.abs(b - a) > 0.4 ? b : a);
  est.g = [salta(est.g[0], s.gx), salta(est.g[1], s.gy)];
  est.ceja_l = cejas ? salta(est.ceja_l, s.ceja_l) : 0;
  est.ceja_r = cejas ? salta(est.ceja_r, s.ceja_r) : 0;
  est.squint = salta(est.squint, s.squint);
  est.cerrado = est.cerrado ? s.cierre >= umbral * 0.6 : s.cierre >= umbral;   // se cierra al pasar el umbral y se abre un poco antes
  return est;
}

/**
 * Dibuja los ojos sobre una cara ya dibujada. g = contexto 2D, u = lado de un pixel de la cara, piel = color de la piel.
 * modelo: 'eyes' (2x2) o 'eyes_1px'. Pixeles de la cara: columna 0 a 7 (izquierda de la pantalla a derecha), fila 0 (arriba) a 7.
 * El ojo derecho del personaje queda a la izquierda de la pantalla (columnas 1-2) y el izquierdo a la derecha (columnas 5-6).
 */
export function dibujar(g, u, est, modelo, piel) {
  const alto = modelo === 'eyes_1px' ? 1 : 2, fila = 4, filaCeja = 3;   // los dos modelos arrancan en la fila 4, la de los ojos pintados en la skin
  const [gx, gy] = est.g;
  const rect = (x, y, w, h, c, caja) => {   // en pixeles de la cara; si hay caja, se recorta a ella
    let x0 = x, y0 = y, x1 = x + w, y1 = y + h;
    if (caja) { x0 = Math.max(x0, caja[0]); y0 = Math.max(y0, caja[1]); x1 = Math.min(x1, caja[2]); y1 = Math.min(y1, caja[3]); }
    if (x1 <= x0 || y1 <= y0) return;
    g.fillStyle = c; g.fillRect(x0 * u, y0 * u, (x1 - x0) * u, (y1 - y0) * u);
  };
  // lo que la skin trae pintado en ese lugar (ojos y cejas) se tapa con la piel, como hace BBS
  rect(1, 4, 2, 1, piel); rect(5, 4, 2, 1, piel);
  for (const [lado, col, sg, pupCol, ceja] of [['r', 1, -1, 2, est.ceja_r], ['l', 5, 1, 5, est.ceja_l]]) {
    const caja = [col, fila, col + 2, fila + alto];
    rect(col, fila, 2, alto, COLOR.ojo);
    if (!est.cerrado) {
      const afuera = gx * sg > 0, dx = gx * (afuera ? 1 : HOLGURA_NARIZ), dy = -gy * RECORRIDO_V;   // dx > 0 = hacia la derecha de la pantalla
      rect(pupCol + dx, fila + dy, 1, alto, COLOR.pupila, caja);
    }
    // parpados: cerrado = tapa todo el ojo; entrecerrar = tapa media fila de arriba y de abajo
    if (est.cerrado) { rect(col, fila, 2, alto, piel); rect(col, fila + alto / 2 - 0.12, 2, 0.24, COLOR.parpado); }
    else if (est.squint > 0) { const t = 0.5 * est.squint; rect(col, fila, 2, t, piel); rect(col, fila + alto - t, 2, t, piel); }
    // cejas: suben o bajan (la inclinacion de enojo/ruego no se dibuja)
    const mov = -ceja * (ceja > 0 ? CEJA_ARRIBA : CEJA_ABAJO);
    rect(col, filaCeja + mov, 2, 1, COLOR.ceja, [0, 0, 8, 8]);
  }
}
