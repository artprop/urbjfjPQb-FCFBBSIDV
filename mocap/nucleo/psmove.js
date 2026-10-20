// Controles PlayStation Move (PS3) por Bluetooth o USB: datos del control, orientacion con el giroscopio y el acelerometro,
// y de ahi la direccion de cada brazo (que entra a la conversion del cuerpo igual que el mocap con la camara).
//
// El formato de los datos sale de la libreria abierta psmoveapi (psmove.c): el reporte de entrada 0x01 de 49 bytes (con el byte del tipo adelante).
//   botones: bytes 1 a 4 | gatillo: 5 y 6 | bateria: 12 | acelerometro: 13-18 y 19-24 | giroscopio: 25-30 y 31-36   (cada eje: 2 bytes, el de abajo primero)
// El acelerometro mide "hacia arriba" (con la esfera hacia arriba el eje Y de la lectura es positivo) y el eje largo del control (de la mano a la esfera) es el Y.
import * as M from './mat.js';

export const VID = 0x054c;
export const PID_ZCM1 = 0x03d5;   // el Move original (tiene magnetometro)
export const PID_ZCM2 = 0x0c5e;   // el Move de PS4 (sin magnetometro)
export const modeloDe = (pid) => (pid === PID_ZCM2 ? 'ZCM2' : 'ZCM1');

export const BOTONES = {
  TRIANGULO: 1 << 4, CIRCULO: 1 << 5, CRUZ: 1 << 6, CUADRADO: 1 << 7,
  SELECT: 1 << 8, START: 1 << 11, PS: 1 << 16, MOVE: 1 << 19, GATILLO: 1 << 20,
};
export const NOMBRES_BOTON = {
  TRIANGULO: '▲ Triángulo', CIRCULO: '● Círculo', CRUZ: '✕ Cruz', CUADRADO: '■ Cuadrado', SELECT: 'Select', START: 'Start', PS: 'PS', MOVE: 'Move (el grande)', GATILLO: 'Gatillo (T)',
};
export const botonesDe = (mascara) => Object.keys(BOTONES).filter((b) => mascara & BOTONES[b]);

/**
 * Decodifica un reporte de entrada. d: bytes del reporte CON el byte del tipo adelante (49 en total); modelo: 'ZCM1' o 'ZCM2'.
 * Devuelve { botones (mascara), gatillo (0 a 255), bateria, acel: [x, y, z], giro: [x, y, z] } (acel y giro en unidades crudas del sensor).
 */
export function decodificar(d, modelo = 'ZCM1') {
  if (!d || d.length < 37) throw new Error('El reporte del control Move es demasiado corto.');
  const botones = d[2] | (d[1] << 8) | ((d[3] & 0x01) << 16) | ((d[4] & 0xf0) << 13);
  const eje = (base, k) => {
    const o = base + 2 * k, o2 = base + 6 + 2 * k;
    if (modelo === 'ZCM2') { const v = d[o] | (d[o + 1] << 8); return v & 0x8000 ? v - 0x10000 : v; }
    return ((d[o] + d[o2]) + ((d[o + 1] + d[o2 + 1]) << 8)) / 2 - 0x8000;   // ZCM1: promedio de las dos mitades del cuadro
  };
  return {
    botones, gatillo: (d[5] + d[6]) / 2, bateria: d[12],
    acel: [eje(13, 0), eje(13, 1), eje(13, 2)], giro: [eje(25, 0), eje(25, 1), eje(25, 2)],
  };
}
/** Nivel de bateria de 0 a 1 (null si no se sabe). 0xEE = cargando por USB, 0xEF = carga completa. */
export function bateriaNivel(b) { return b === 0xef ? 1 : b === 0xee ? null : b <= 5 ? b / 5 : null; }

/** Reporte de salida 0x06 (sin el byte del tipo, como lo pide WebHID): color de la esfera y vibracion, 0 a 255. */
export const reporteLed = (r, g, b, vibrar = 0) => new Uint8Array([0x00, r, g, b, 0x00, vibrar, 0x00, 0x00]);

// ---------------------------------------------------------------- cuaterniones [w, x, y, z]
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
export const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
const qnorm = (q) => { const n = Math.hypot(...q) || 1; return q.map((x) => x / n); };
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
export function rotar(q, v) {   // v' = q v q*
  const t = cruz(q.slice(1), v).map((x) => 2 * x);
  const c = cruz(q.slice(1), t);
  return [v[0] + q[0] * t[0] + c[0], v[1] + q[0] * t[1] + c[1], v[2] + q[0] * t[2] + c[2]];
}
/** Rotacion mas corta que lleva el vector a sobre el b. */
export function arco(a, b) {
  a = unit(a); b = unit(b);
  const d = punto(a, b);
  if (d > 1 - 1e-9) return [1, 0, 0, 0];
  if (d < -1 + 1e-9) { const o = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const e = unit(cruz(a, o)); return [0, e[0], e[1], e[2]]; }
  const c = cruz(a, b);
  return qnorm([1 + d, c[0], c[1], c[2]]);
}

// ---------------------------------------------------------------- orientacion (giroscopio + gravedad)
export const GANANCIA_GIRO = 6e-4;   // rad/s por unidad cruda: un valor aproximado hasta que se calibre (calibrarGanancia)

/**
 * Orientacion del control respecto del mundo (z hacia arriba, el giro alrededor de la vertical empieza en cualquier lado).
 * Integra el giroscopio y se corrige con la gravedad que mide el acelerometro (filtro de Mahony).
 */
export class Orientacion {
  constructor({ kp = 1.5, ganancia = GANANCIA_GIRO } = {}) {
    this.kp = kp; this.k = ganancia;
    this.q = [1, 0, 0, 0]; this.sesgo = [0, 0, 0]; this.g0 = null; this.listo = false; this.quieto = 0;
  }
  /** Con la primera lectura quieta: la orientacion arranca alineada con la gravedad y se mide cuanto vale 1 g. */
  iniciar(a, giro) {
    this.q = arco(unit(a), [0, 0, 1]);
    this.g0 = Math.hypot(...a); this.sesgo = giro.slice(); this.listo = true;
  }
  actualizar(dt, giro, a) {
    if (!this.listo) return this.iniciar(a, giro);
    dt = M.clip(dt, 0, 0.1);
    const w = giro.map((g, i) => (g - this.sesgo[i]) * this.k);
    const na = Math.hypot(...a);
    const confianza = this.g0 ? M.clip(1 - Math.abs(na / this.g0 - 1) / 0.25, 0, 1) : 0;   // moviendo fuerte, el acelerometro no mide solo la gravedad
    if (na > 1e-6 && confianza > 0) {
      const v = rotar(qconj(this.q), [0, 0, 1]);        // "arriba" segun la orientacion actual, en el sistema del control
      const e = cruz(a.map((x) => x / na), v);
      for (let i = 0; i < 3; i++) w[i] += this.kp * confianza * e[i];
    }
    // si esta quieto, el giroscopio deberia leer 0: se va corrigiendo el sesgo
    if (confianza > 0.9 && Math.hypot(...w) < 0.06) { this.quieto += dt; if (this.quieto > 0.3) for (let i = 0; i < 3; i++) this.sesgo[i] += 0.01 * (giro[i] - this.sesgo[i]); } else this.quieto = 0;
    const dq = qmul(this.q, [0, w[0], w[1], w[2]]).map((x) => 0.5 * dt * x);
    this.q = qnorm(this.q.map((x, i) => x + dq[i]));
  }
}

/**
 * Calibra el giroscopio con un movimiento de inclinacion (mover el control hacia adelante y atras, de costado, sin girarlo en el lugar).
 * muestras: [{ t (segundos), a: [x, y, z], g: [x, y, z] }]. Devuelve { k, sesgo, inclinado } con k en rad/s por unidad cruda (con signo).
 * La idea: cuando el control se inclina, la direccion de la gravedad que mide el acelerometro cambia justo como dice el giroscopio.
 */
export function calibrarGanancia(muestras, { quietoSeg = 1.0 } = {}) {
  if (muestras.length < 30) throw new Error('Faltan datos: mové el control durante unos 5 segundos.');
  const t0 = muestras[0].t, quietas = muestras.filter((m) => m.t - t0 <= quietoSeg);
  const sesgo = [0, 1, 2].map((i) => M.median(quietas.map((m) => m.g[i])));
  const g0 = M.median(quietas.map((m) => Math.hypot(...m.a)));
  let num = 0, den = 0, inclinado = 0;
  for (let i = 1; i < muestras.length; i++) {
    const p = muestras[i - 1], c = muestras[i], dt = c.t - p.t;
    if (dt <= 0 || dt > 0.1) continue;
    const ma = Math.hypot(...p.a), mb = Math.hypot(...c.a);
    if (Math.abs(ma / g0 - 1) > 0.12 || Math.abs(mb / g0 - 1) > 0.12) continue;   // aceleracion fuerte: no sirve
    const u0 = unit(p.a), u1 = unit(c.a), um = unit(u0.map((x, j) => x + u1[j]));
    const w = [0, 1, 2].map((j) => ((p.g[j] + c.g[j]) / 2 - sesgo[j]) * dt);
    const P = cruz(w, um).map((x) => -x);                   // cambio esperado de la gravedad por cada unidad de ganancia
    const D = u1.map((x, j) => x - u0[j]);                  // cambio medido
    num += punto(D, P); den += punto(P, P); inclinado += Math.hypot(...D);
  }
  if (inclinado < 1.5 || !(den > 0)) throw new Error('Casi no se movió: inclinalo bien hacia adelante, atrás y a los costados durante unos 5 segundos.');
  return { k: num / den, sesgo, inclinado };
}

// ---------------------------------------------------------------- del control al brazo
// El control se sostiene en la mano y se supone que gira junto con todo el brazo (apuntar con el control = apuntar con el brazo).
// Se calibra en dos poses: 1) brazo abajo (la gravedad dice cual es "abajo" en el control) y 2) brazo estirado hacia adelante (dice cual es "adelante").
/** Una pose por mano. fijarAbajo(q), fijarAdelante(q), direccion(q) -> [x, y, z] en el sistema de MediaPipe (x + = izquierda de la persona, y + = abajo, z + = atras). */
export class MapaBrazo {
  constructor() { this.eje = null; this.adelante = null; this.derecha = null; }
  get listo() { return Boolean(this.eje && this.adelante); }
  get paso() { return !this.eje ? 'abajo' : !this.adelante ? 'adelante' : 'listo'; }
  fijarAbajo(q) { this.eje = rotar(qconj(q), [0, 0, -1]); this.adelante = null; this.derecha = null; }   // la direccion del brazo en el sistema del control
  fijarAdelante(q) {
    if (!this.eje) throw new Error('Primero la pose con el brazo abajo.');
    const w = rotar(q, this.eje), h = [w[0], w[1], 0], n = Math.hypot(h[0], h[1]);
    if (n < 0.5) throw new Error('Estirá el brazo hacia adelante, a la altura del hombro.');
    this.adelante = [h[0] / n, h[1] / n, 0];
    this.derecha = cruz([0, 0, -1], this.adelante);   // derecha = abajo x adelante
  }
  direccion(q) {
    if (!this.listo) return null;
    const d = rotar(q, this.eje);
    return [-punto(d, this.derecha), -d[2], -punto(d, this.adelante)];
  }
}

// ---------------------------------------------------------------- de las direcciones de los brazos al cuerpo (para la conversion)
const HOMBRO = { izq: [0.19, -0.50, 0], der: [-0.19, -0.50, 0] };
const BRAZO = 0.30, ANTEBRAZO = 0.27, ALCANCE = 0.95 * (BRAZO + ANTEBRAZO);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** Codo de un brazo de dos huesos: del hombro a la muñeca; el codo cae hacia abajo y un poco hacia atras y afuera (lado = +1 izquierda, -1 derecha). */
export function codo(hombro, muneca, lado) {
  let d = sub(muneca, hombro), L = Math.hypot(...d);
  const alcance = BRAZO + ANTEBRAZO - 1e-3;
  if (L > alcance) { d = mul(d, alcance / L); L = alcance; }
  L = Math.max(L, Math.abs(BRAZO - ANTEBRAZO) + 1e-3);
  const u = mul(d, 1 / (Math.hypot(...d) || 1));
  const a = (BRAZO * BRAZO - ANTEBRAZO * ANTEBRAZO + L * L) / (2 * L), h = Math.sqrt(Math.max(BRAZO * BRAZO - a * a, 0));
  let p = [0.25 * lado, 1, 0.45];
  p = sub(p, mul(u, punto(p, u)));
  if (Math.hypot(...p) < 1e-6) p = [lado, 0, 0];
  p = mul(p, 1 / Math.hypot(...p));
  return { codo: add(add(hombro, mul(u, a)), mul(p, h)), muneca: add(hombro, mul(u, L)) };
}

// cuerpo parado de frente a la camara: todo menos los brazos queda quieto
function cuerpoBase() {
  const P = Array.from({ length: 33 }, () => [0, 0, 0]);
  const set = (i, x, y, z) => { P[i] = [x, y, z]; };
  set(0, 0, -0.74, -0.10);
  for (const [i, x] of [[1, 0.03], [2, 0.05], [3, 0.07], [4, -0.03], [5, -0.05], [6, -0.07]]) set(i, x, -0.77, -0.08);
  set(7, 0.08, -0.72, 0); set(8, -0.08, -0.72, 0); set(9, 0.03, -0.68, -0.08); set(10, -0.03, -0.68, -0.08);
  set(11, HOMBRO.izq[0], HOMBRO.izq[1], 0); set(12, HOMBRO.der[0], HOMBRO.der[1], 0);
  set(23, 0.10, 0, 0); set(24, -0.10, 0, 0);
  set(25, 0.11, 0.45, 0); set(26, -0.11, 0.45, 0); set(27, 0.11, 0.88, 0); set(28, -0.11, 0.88, 0);
  set(29, 0.11, 0.92, 0.02); set(30, -0.11, 0.92, 0.02); set(31, 0.11, 0.93, -0.10); set(32, -0.11, 0.93, -0.10);
  return P;
}

/**
 * Un cuadro en vivo: los 33 puntos (mundo de MediaPipe, en metros) con los brazos puestos segun la direccion de cada control
 * (dIzq / dDer: de MapaBrazo.direccion(), o null = brazo abajo) y el resto del cuerpo parado y quieto. Es lo mismo que hace
 * construirPose() para cada cuadro de una toma, pero de a uno, para la simulacion en vivo.
 */
export function poseEnVivo(dIzq, dDer) {
  const P = cuerpoBase(), abajo = [0, 1, 0];
  for (const [d, signo, iH, iC, iM, dedos] of [[dIzq, 1, 11, 13, 15, [17, 19, 21]], [dDer, -1, 12, 14, 16, [18, 20, 22]]]) {
    const r = codo(P[iH], add(P[iH], mul(unit(d || abajo), ALCANCE)), signo);
    P[iC] = r.codo; P[iM] = r.muneca;
    for (const k of dedos) P[k] = r.muneca;
  }
  return P;
}

/**
 * muestras: { izq: [{ t, d: [x, y, z] }], der: [...] } con t en segundos desde que empezo la toma y d la direccion del brazo (ver MapaBrazo).
 * Devuelve { world, vis, times, offset } como el analisis de cuerpo con la camara (a 30 cuadros por segundo).
 */
export function construirPose(muestras, { fps = 30, duracion = null } = {}) {
  const todas = [...(muestras.izq || []), ...(muestras.der || [])];
  if (!todas.length) throw new Error('Esta toma no tiene datos de los controles Move. Grabala con los controles conectados y calibrados.');
  const fin = duracion ?? Math.max(...todas.map((m) => m.t));
  const base = cuerpoBase(), world = [], vis = [], times = [], idx = { izq: 0, der: 0 }, ult = { izq: null, der: null };
  const abajo = [0, 1, 0];
  const N = Math.max(2, Math.round(fin * fps) + 1);
  for (let i = 0; i < N; i++) {
    const t = i / fps, P = base.map((p) => p.slice()), v = new Array(33).fill(1);
    for (const [lado, signo, iH, iC, iM, dedos] of [['izq', 1, 11, 13, 15, [17, 19, 21]], ['der', -1, 12, 14, 16, [18, 20, 22]]]) {
      const lista = muestras[lado] || [];
      while (idx[lado] < lista.length && lista[idx[lado]].t <= t) { ult[lado] = lista[idx[lado]]; idx[lado]++; }
      const m = ult[lado], d = m ? m.d : abajo;
      const r = codo(P[iH], add(P[iH], mul(unit(d), ALCANCE)), signo);
      P[iC] = r.codo; P[iM] = r.muneca;
      for (const k of dedos) P[k] = r.muneca;
      const visible = m && t - m.t < 0.5 ? 1 : 0.2;   // sin datos recientes el brazo queda "tapado" (la conversion lo deja quieto)
      for (const k of [iC, iM, ...dedos]) v[k] = visible;
    }
    world.push(P); vis.push(v); times.push(t);
  }
  return { world, vis, times, offset: 0 };
}
