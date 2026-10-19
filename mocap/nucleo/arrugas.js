// Arrugas de la boca: pequeñas marcas en la cara de 8x8 que salen cuando la boca hace un gesto que arruga la piel de alrededor.
// No se "ven" en el video (una cara de 8x8 no tiene detalle para eso): se deducen del gesto, con las mismas medidas de MediaPipe.
//   boca hacia un lado  -> arruga al lado de la boca, del lado al que va (izquierda de la persona = derecha de la cara dibujada)
//   boca hacia arriba   -> arruga por debajo de la boca (el mentón)
//   boca hacia abajo    -> arruga por encima de la boca
//   sonrisa             -> arrugas a los lados, un poco más arriba (surcos de la sonrisa)
//   boca triste         -> arruga en el mentón y a los lados, abajo
// Cada arruga tiene una intensidad de 0 a 1; el color es el de la piel, más oscuro cuanto más intensa.
import { rasgos } from './muecas.js';

const clip = (x, a, b) => Math.min(Math.max(x, a), b);
const ramp = (x, desde, hasta) => clip((x - desde) / (hasta - desde), 0, 1);

// pixeles de la cara de 8x8 (columna x de 0 a 7, fila y de 0 a 7; la boca va en las filas 6 y 7, columnas 1 a 6)
export const LUGARES = {
  lado_i: [[0, 6], [0, 7]],          // al lado izquierdo de la boca (izquierda de la pantalla)
  lado_d: [[7, 6], [7, 7]],
  surco_i: [[0, 5]],                 // sonrisa: surco que sube hacia el ojo
  surco_d: [[7, 5]],
  menton: [[3, 7], [4, 7]],          // debajo de la boca
  encima: [[2, 5], [5, 5]],          // entre la nariz y la boca
};

/**
 * Intensidades de cada arruga (0 a 1) a partir de los rasgos del gesto (ver muecas.rasgos) y de cuanto se corrio la boca
 * respecto de su lugar en reposo: dx hacia la derecha de la pantalla y dy hacia abajo, en distancias entre los ojos.
 */
export function intensidades(r, dx = 0, dy = 0) {
  // izquierda/derecha = de la cara dibujada de frente (columna 0 y columna 7). shift > 0 y dx > 0 = la boca va hacia la derecha de esa cara
  // (la izquierda de la persona); la arruga sale del lado al que va la boca.
  const der = Math.max(r.shift, 0) + Math.max(dx, 0) * 3, izq = Math.max(-r.shift, 0) + Math.max(-dx, 0) * 3;
  const arriba = Math.max(r.upper * 0.8, r.shrugU, Math.max(-dy, 0) * 8);
  const abajo = Math.max(r.lower * 0.6, Math.max(dy, 0) * 8);
  const tira = Math.max(r.frown * 0.8, r.jaw * 0.45);   // boca triste o muy abierta: se tensan las mejillas
  return {
    lado_i: ramp(Math.max(izq, tira), 0.25, 0.75),
    lado_d: ramp(Math.max(der, tira), 0.25, 0.75),
    surco_i: ramp(r.smileR, 0.3, 0.8),   // la mejilla derecha de la persona cae a la izquierda de la cara dibujada
    surco_d: ramp(r.smileL, 0.3, 0.8),
    menton: ramp(Math.max(arriba, r.frown, r.press * 0.7, r.shrugL), 0.3, 0.8),
    encima: ramp(Math.max(abajo, r.pucker * 0.9, r.funnel * 0.7), 0.35, 0.8),
  };
}

/** Intensidades de un cuadro: bs = blendshapes, nombres, base = blendshapes en reposo, dx/dy = corrimiento de la boca. */
export function deCuadro(bs, nombres, base, dx = 0, dy = 0) {
  return intensidades(rasgos(bs, nombres, base), dx, dy);
}

/** Estado en el tiempo: la intensidad sube rapido y baja de a poco (la piel no se alisa de golpe) y aparece de a saltos de 0, 0.5, 1. */
export function nuevoEstado() { return Object.fromEntries(Object.keys(LUGARES).map((k) => [k, 0])); }
export function actualizar(est, inten) {
  for (const k of Object.keys(est)) {
    const v = inten[k] || 0;
    est[k] = v > est[k] ? est[k] + (v - est[k]) * 0.6 : est[k] + (v - est[k]) * 0.25;
  }
  return est;
}
/** Lista de pixeles a oscurecer: [{x, y, n}] con n = 1 (arruga suave) o 2 (marcada). */
export function pixeles(est) {
  const out = [];
  for (const [k, lugar] of Object.entries(LUGARES)) {
    const v = est[k];
    if (v < 0.3) continue;
    const n = v > 0.7 ? 2 : 1;
    for (const [x, y] of lugar) out.push({ x, y, n });
  }
  return out;
}
/** Color de la piel mas oscuro: n = 1 o 2. */
export function oscurecer([r, g, b], n) {
  const f = n >= 2 ? 0.78 : 0.89;
  return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
}
