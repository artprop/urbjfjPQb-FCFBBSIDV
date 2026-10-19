// Pistas de keyframes como las guarda BBS 2.2: [{interp, tick, value}] ordenadas por tick.
// value es un número (props y canales de cámara) o un transform de hueso {t, s, r, ...} (pistas "pose/<hueso>").
// Las curvas (interp) llevan los nombres de BBS; acá se calculan igual para la vista previa.
import { D, F, num } from '../../mocap/nucleo/bbsdat.js';

const PI = Math.PI;
const c1 = 1.70158, c2 = c1 * 1.525, c3 = c1 + 1, c4 = (2 * PI) / 3, c5 = (2 * PI) / 4.5;
function rebote(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
export const CURVAS = {
  constant: { nombre: 'Salto (sin transición)', f: () => 0 },
  linear: { nombre: 'Lineal', f: (x) => x },
  sine_in: { nombre: 'Suave al empezar', f: (x) => 1 - Math.cos((x * PI) / 2) },
  sine_out: { nombre: 'Suave al terminar', f: (x) => Math.sin((x * PI) / 2) },
  sine_inout: { nombre: 'Suave (recomendada)', f: (x) => -(Math.cos(PI * x) - 1) / 2 },
  quad_in: { nombre: 'Acelera', f: (x) => x * x },
  quad_out: { nombre: 'Frena', f: (x) => 1 - (1 - x) * (1 - x) },
  quad_inout: { nombre: 'Acelera y frena', f: (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2) },
  cubic_in: { nombre: 'Acelera fuerte', f: (x) => x ** 3 },
  cubic_out: { nombre: 'Frena fuerte', f: (x) => 1 - (1 - x) ** 3 },
  cubic_inout: { nombre: 'Acelera y frena fuerte', f: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2) },
  back_in: { nombre: 'Toma impulso', f: (x) => c3 * x ** 3 - c1 * x * x },
  back_out: { nombre: 'Se pasa y vuelve', f: (x) => 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2 },
  back_inout: { nombre: 'Impulso y rebote', f: (x) => (x < 0.5 ? ((2 * x) ** 2 * ((c2 + 1) * 2 * x - c2)) / 2 : ((2 * x - 2) ** 2 * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2) },
  elastic_out: { nombre: 'Elástico', f: (x) => (x === 0 ? 0 : x === 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1) },
  elastic_in: { nombre: 'Elástico al empezar', f: (x) => (x === 0 ? 0 : x === 1 ? 1 : -(2 ** (10 * x - 10)) * Math.sin((x * 10 - 10.75) * c4)) },
  elastic_inout: { nombre: 'Elástico doble', f: (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? -(2 ** (20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2 : (2 ** (-20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1) },
  bounce_out: { nombre: 'Rebota al llegar', f: rebote },
  bounce_in: { nombre: 'Rebota al salir', f: (x) => 1 - rebote(1 - x) },
  bounce_inout: { nombre: 'Rebota doble', f: (x) => (x < 0.5 ? (1 - rebote(1 - 2 * x)) / 2 : (1 + rebote(2 * x - 1)) / 2) },
};
export const curva = (nombre) => (CURVAS[nombre] || CURVAS.linear).f;

export const ordenar = (kf) => kf.sort((a, b) => num(a.tick) - num(b.tick));

// índice del último keyframe con tick <= t (-1 si no hay)
function anterior(kf, t) {
  let lo = 0, hi = kf.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (num(kf[m].tick) <= t + 1e-9) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

// fracción (ya con curva) entre el keyframe a y el siguiente, en el tick t
function fraccion(a, b, t) {
  const t0 = num(a.tick), t1 = num(b.tick);
  if (t1 <= t0) return 1;
  return curva(a.interp || 'linear')(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
}

// valor numérico de una pista en el tick t (como BBS: antes del primero, el primero; después del último, el último)
export function valorNum(kf, t, defecto = 0) {
  if (!kf || !kf.length) return defecto;
  const i = anterior(kf, t);
  if (i < 0) return num(kf[0].value);
  if (i >= kf.length - 1) return num(kf[kf.length - 1].value);
  const a = kf[i], b = kf[i + 1];
  const va = num(a.value), vb = num(b.value);
  return va + (vb - va) * fraccion(a, b, t);
}

const vec = (v, d) => (Array.isArray(v) && v.length >= 3 ? [num(v[0]), num(v[1]), num(v[2])] : d.slice());
export const transformDe = (v) => ({ t: vec(v && v.t, [0, 0, 0]), s: vec(v && v.s, [1, 1, 1]), r: vec(v && v.r, [0, 0, 0]) });

// transform de un hueso en el tick t: null si la pista está vacía
export function valorPose(kf, t) {
  if (!kf || !kf.length) return null;
  const i = anterior(kf, t);
  if (i < 0) return transformDe(kf[0].value);
  if (i >= kf.length - 1) return transformDe(kf[kf.length - 1].value);
  const a = transformDe(kf[i].value), b = transformDe(kf[i + 1].value), f = fraccion(kf[i], kf[i + 1], t);
  const mix = (x, y) => x.map((v, k) => v + (y[k] - v) * f);
  return { t: mix(a.t, b.t), s: mix(a.s, b.s), r: mix(a.r, b.r) };
}

// transform en el formato que guarda BBS (el que usan el Mocap y el Director)
export function transformBBS({ t = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0] } = {}) {
  return { color: -1, fix: 0, lighting: 0, r: r.map(Number), s: s.map(Number), t: t.map(Number) };
}

// Pone (o reemplaza) el keyframe del tick. interp: la curva desde este keyframe al siguiente.
// Si ya había uno en ese tick conserva su curva salvo que se pida otra.
export function poner(kf, tick, value, interp = null, numerico = true) {
  tick = Math.round(tick);
  const i = kf.findIndex((k) => Math.round(num(k.tick)) === tick);
  const v = numerico ? D(Number(value)) : value;
  if (i >= 0) { kf[i].value = v; if (interp) kf[i].interp = interp; return kf[i]; }
  const k = { interp: interp || 'sine_inout', tick: F(tick), value: v };
  kf.push(k); ordenar(kf);
  return k;
}
export function quitar(kf, tick) {
  const i = kf.findIndex((k) => Math.round(num(k.tick)) === Math.round(tick));
  if (i >= 0) kf.splice(i, 1);
  return i >= 0;
}
// mueve el keyframe de 'desde' a 'hasta' (si en 'hasta' había otro, lo pisa)
export function mover(kf, desde, hasta) {
  desde = Math.round(desde); hasta = Math.max(0, Math.round(hasta));
  const k = kf.find((x) => Math.round(num(x.tick)) === desde);
  if (!k || desde === hasta) return false;
  const j = kf.findIndex((x) => x !== k && Math.round(num(x.tick)) === hasta);
  if (j >= 0) kf.splice(j, 1);
  k.tick = F(hasta); ordenar(kf);
  return true;
}
export const hay = (kf, tick) => !!kf && kf.some((k) => Math.round(num(k.tick)) === Math.round(tick));
export const ticks = (kf) => (kf || []).map((k) => Math.round(num(k.tick)));
