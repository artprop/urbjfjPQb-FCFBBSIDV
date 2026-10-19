// Arrugas de la boca: pequeñas marcas que salen cuando el gesto arruga la piel de alrededor de la boca. No se "ven" en el video
// (una cara de 8x8 no tiene detalle para eso): se deducen del gesto, con las mismas medidas de MediaPipe.
//   boca hacia un lado  -> arruga al lado de la boca, del lado al que va (izquierda de la persona = derecha de la cara dibujada)
//   boca hacia arriba   -> arruga por debajo (el mentón); boca hacia abajo -> se tensan los costados
//   sonrisa             -> pliegue en la comisura de cada lado
//   boca triste         -> mentón y costados
// Viven SOLO dentro del segmento de la boca (6 x 2 pixeles de la cara en el hombre, 6 x 1 en la mujer), con su propia escala:
// x2 o x4 pedacitos por pixel (nunca x1). La escala es independiente de la de la boca: puede ser una boca x1 con arrugas x4.
// El color es la piel más oscura: un negro translúcido (en BBS, el color del hueso), así sirve con cualquier skin.
import * as M from './mat.js';
import { F, I, num } from './bbsdat.js';
import * as MU from './muecas.js';
import * as BP from './boca_pixel.js';

export const TICKS = 20;
export const NOMBRES = ['lado_i', 'lado_d', 'sonrisa_i', 'sonrisa_d', 'menton'];
export const COLS = 6;
export const ESCALAS = [2, 4];
const clip = (x, a, b) => Math.min(Math.max(x, a), b);
const ramp = (x, desde, hasta) => clip((x - desde) / (hasta - desde), 0, 1);
// negro con transparencia (ARGB): suave y marcada
export const COLOR_ARRUGA = { 1: 0x24000000, 2: 0x40000000 };

// ---------------------------------------------------------------- dónde van (celdas [columna, fila] de la grilla de la escala kw)
// grilla de 6*kw columnas por (filas*kw) filas; la boca cerrada ocupa las columnas kw a 5*kw-1 de la primera fila de pixeles
const BASE = {
  2: { lado_i: [[0, 1], [0, 2]], sonrisa_i: [[0, 0], [1, 0]], menton: [[5, 3], [6, 3]] },
  4: { lado_i: [[1, 3], [1, 4], [2, 5], [2, 6]], sonrisa_i: [[3, 0], [2, 0], [1, 1], [0, 2]], menton: [[10, 6], [11, 6], [12, 6], [13, 6]] },
};
/** Celdas de una arruga en la grilla de la escala kw (2 o 4) y las filas del modelo (2 hombre, 1 mujer). Siempre adentro del segmento. */
export function celdas(nombre, kw, filas = 2) {
  if (!BASE[kw]) return [];
  const C = COLS * kw, R = filas * kw;
  const esD = nombre.endsWith('_d'), id = nombre.replace(/_d$/, '_i');
  const base = BASE[kw][id];
  if (!base) return [];
  return base.map(([c, r]) => [esD ? C - 1 - c : c, r]).filter(([c, r]) => c >= 0 && c < C && r >= 0 && r < R);
}

// ---------------------------------------------------------------- cuánto se arruga (0 a 1) con el gesto
/**
 * r = rasgos del gesto (ver muecas.rasgos); dx hacia la derecha de la cara dibujada y dy hacia abajo: cuánto se corrió la boca
 * (en distancias entre los ojos).
 */
export function intensidades(r, dx = 0, dy = 0) {
  const der = Math.max(r.shift, 0) + Math.max(dx, 0) * 3, izq = Math.max(-r.shift, 0) + Math.max(-dx, 0) * 3;
  const arriba = Math.max(r.upper * 0.8, r.shrugU, Math.max(-dy, 0) * 8);
  const tira = Math.max(r.frown * 0.8, r.jaw * 0.45);   // boca triste o muy abierta: se tensan las mejillas
  return {
    lado_i: ramp(Math.max(izq, tira), 0.25, 0.75),
    lado_d: ramp(Math.max(der, tira), 0.25, 0.75),
    sonrisa_i: ramp(r.smileR, 0.3, 0.8),   // la mejilla derecha de la persona cae a la izquierda de la cara dibujada
    sonrisa_d: ramp(r.smileL, 0.3, 0.8),
    menton: ramp(Math.max(arriba, r.frown, r.press * 0.7, r.shrugL), 0.3, 0.8),
  };
}
export function deCuadro(bs, nombres, base, dx = 0, dy = 0) { return intensidades(MU.rasgos(bs, nombres, base), dx, dy); }

// ---------------------------------------------------------------- en el tiempo (vista en vivo)
export function nuevoEstado() { return Object.fromEntries(NOMBRES.map((k) => [k, 0])); }
/** Sube rápido y baja de a poco (la piel no se alisa de golpe). */
export function actualizar(est, inten) {
  for (const k of Object.keys(est)) {
    const v = inten[k] || 0;
    est[k] = v > est[k] ? est[k] + (v - est[k]) * 0.6 : est[k] + (v - est[k]) * 0.25;
  }
  return est;
}
export const nivel = (v) => (v > 0.7 ? 2 : v >= 0.3 ? 1 : 0);
/** Celdas a oscurecer: [{c, r, n}] con n = 1 (suave) o 2 (marcada). */
export function pixeles(est, kw, filas = 2) {
  const out = [];
  for (const k of NOMBRES) {
    const n = nivel(est[k]);
    if (!n) continue;
    for (const [c, r] of celdas(k, kw, filas)) out.push({ c, r, n });
  }
  return out;
}
/** Color de la piel más oscuro: n = 1 o 2 (para dibujar en pantalla). */
export function oscurecer([r, g, b], n) {
  const f = n >= 2 ? 0.75 : 0.88;
  return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
}

// ---------------------------------------------------------------- el modelo de BBS (arrugas_Man_x2, arrugas_Woman_x4...)
export const nombreModelo = (mujer, kw) => `arrugas_${mujer ? 'Woman' : 'Man'}_x${kw}`;
export function describir(nombre) {
  const m = String(nombre || '');
  const kw = Number((/_x([24])\b/i.exec(m) || [])[1] || 2);
  return { kw, filas: /woman|mujer/i.test(m) ? 1 : 2, modelo: m };
}
/** Parte de arrugas del actor: {idx, nombreModelo, kw, filas} o null. */
export function parteArrugas(rep) {
  const partes = (rep.form && rep.form.parts) || [];
  for (let idx = 0; idx < partes.length; idx++) {
    const m = String((partes[idx].form || {}).model || '');
    if (/arrugas|wrinkle/i.test(m)) return { idx, nombreModelo: m, ...describir(m) };
  }
  return null;
}
/** face.bbs.json y poses.json del modelo: un hueso por arruga, con sus cuadraditos; escondido (escala 0) en reposo. La textura es 1 pixel blanco. */
export function modeloBBS({ kw, filas }) {
  const groups = { head: { origin: [0, 0, 0], cubes: [] } };
  const d = 1 / kw, R = (x) => Math.round(x * 1e4) / 1e4;
  const arriba = filas === 2 ? 2 : 1;   // misma referencia que boca_pixel: borde de arriba de la boca
  const z = R(-4 - 0.005);              // detrás del hueco y los labios de la boca
  for (const n of NOMBRES) {
    const cs = celdas(n, kw, filas);
    if (!cs.length) continue;
    groups['arruga_' + n] = {
      origin: [3, R(arriba), z], parent: 'head',
      cubes: cs.map(([c, r]) => ({ origin: [3, R(arriba), z], from: [R(3 - d + c * d), R(arriba - r * d - d), z], size: [R(d), R(d), 0], uvs: { front: [0, 0, 1, 1] } })),
    };
  }
  const pose = {};
  for (const n of NOMBRES) if (groups['arruga_' + n]) pose['arruga_' + n] = { t: [0, 0, 0], r: [0, 0, 0], s: [0, 0, 0], fix: 0, color: -1, lighting: 0 };
  return { modelo: { version: '0.7.2', animations: { standing: { groups: {}, duration: 0 } }, model: { groups, texture: [16, 16] } }, poses: { cerrada: { pose } } };
}
export function texturaRGBA() { const px = new Uint8Array(16 * 16 * 4); px.set([255, 255, 255, 255], 0); return px; }

// ---------------------------------------------------------------- al convertir una toma
/** Intensidad de cada arruga en cada cuadro de la toma: { nombre: [v por cuadro] }. */
export function senales(cara) {
  const cal = BP.calibrar(cara), N = cal.ok.length, nombres = cara.nombres;
  const kj = nombres.indexOf('jawOpen');
  const orden = [...Array(N).keys()].filter((i) => cal.ok[i]).sort((a, b) => cara.bs[a][kj] - cara.bs[b][kj]);
  const quietos = orden.slice(0, Math.max(3, Math.floor(orden.length * 0.3)));
  const base = nombres.map((_, j) => M.median(quietos.map((i) => cara.bs[i][j])));
  const out = Object.fromEntries(NOMBRES.map((k) => [k, []]));
  const est = nuevoEstado();
  for (let i = 0; i < N; i++) {
    if (cal.ok[i]) {
      const a = cal.locs[i](61), b = cal.locs[i](291);
      actualizar(est, deCuadro(cara.bs[i], nombres, base, (a[0] + b[0]) / 2 - cal.centro[0], (a[1] + b[1]) / 2 - cal.centro[1]));
    }
    for (const k of NOMBRES) out[k].push(est[k]);
  }
  return out;
}
const valor = (n) => (n
  ? { r: [F(0), F(0), F(0)], s: [F(1), F(1), F(1)], t: [F(0), F(0), F(0)], fix: F(0.0), color: I(COLOR_ARRUGA[n] | 0), lighting: F(0.0) }
  : { r: [F(0), F(0), F(0)], s: [F(0), F(0), F(0)], t: [F(0), F(0), F(0)], fix: F(0.0), color: I(-1), lighting: F(0.0) });
/**
 * cara: analisis de la cara; parte: de parteArrugas(). Devuelve { pistas, resumen }. Un keyframe por cambio de nivel (0, 1 o 2) de cada arruga,
 * con pasos secos de al menos minTicks.
 */
export function construir(cara, parte, offset = 0, desde = 0, op = {}) {
  const sen = senales(cara), N = cara.times.length, minTicks = op.boca_min_ticks ?? 2;
  const modelo = describir(parte.nombreModelo);
  const pistas = {}; let cambios = 0;
  for (const k of NOMBRES) {
    if (!celdas(k, modelo.kw, modelo.filas).length) continue;
    // nivel con histeresis: sube al pasar 0,3 / 0,7 y baja un poco antes
    let actual = 0; const niveles = [];
    for (let i = 0; i < N; i++) {
      const v = sen[k][i];
      if (actual === 0 && v >= 0.3) actual = v > 0.7 ? 2 : 1;
      else if (actual === 1) actual = v > 0.7 ? 2 : v < 0.2 ? 0 : 1;
      else if (actual === 2) actual = v < 0.6 ? (v < 0.2 ? 0 : 1) : 2;
      niveles.push(actual);
    }
    const kf = []; let ult = 0, ultTick = -1e9;
    const poner = (tk, n) => { kf.push({ interp: 'constant', tick: F(tk + desde), value: valor(n) }); ult = n; ultTick = tk; cambios++; };
    for (let i = 0; i < N; i++) {
      const tk = M.roundHalfEven(Math.max(0, cara.times[i] - offset) * TICKS);
      if (niveles[i] === ult) continue;
      if (tk - ultTick < minTicks && kf.length) continue;
      poner(tk, niveles[i]);
    }
    if (kf.length) pistas[`${parte.idx}/pose/arruga_${k}`] = { keyframes: kf, type: 'pose_transform' };
  }
  void num;
  return { pistas, resumen: { modelo: parte.nombreModelo, cambios, arrugas: Object.keys(pistas).length } };
}
