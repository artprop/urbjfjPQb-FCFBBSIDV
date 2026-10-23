// «Celu en movimiento»: lo que no depende del navegador (se puede probar en node).
// Una grabación es una lista de muestras: { t (segundos), q: [x, y, z, w] (cómo está girado el celular), a: [x, y, z] o null
// (aceleración SIN gravedad, m/s², ejes del celular), g: [x, y, z] (giro, grados por segundo, o null) }.
// Ejes del celular: x = a la derecha de la pantalla, y = hacia arriba de la pantalla, z = saliendo de la pantalla.
// Mundo de la simulación (como three.js): x = este, y = arriba, -z = norte.

const D2R = Math.PI / 180;
const G = 9.80665;

// ---------------------------------------------------------------- giros
const mulM = (A, B) => A.map((_, i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));
const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const Ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const mulV = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
const trasp = (M) => [0, 1, 2].map((i) => [M[0][i], M[1][i], M[2][i]]);

/** Matriz del celular → este/norte/arriba, a partir de alpha, beta, gamma (grados, como los da el navegador: Z·X·Y). */
export function matrizEnu(alpha, beta, gamma) {
  return mulM(mulM(Rz(alpha * D2R), Rx(beta * D2R)), Ry(gamma * D2R));
}
// de este/norte/arriba (x, y, z) al mundo de la simulación (x, z → y, y → -z)
const S = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
/** Matriz del celular → mundo de la simulación. */
export const matrizMundo = (alpha, beta, gamma) => mulM(S, matrizEnu(alpha, beta, gamma));

/** Cuaternión [x, y, z, w] de una matriz de rotación 3×3. */
export function cuaternion(M) {
  const t = M[0][0] + M[1][1] + M[2][2];
  let x, y, z, w;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = s / 4; x = (M[2][1] - M[1][2]) / s; y = (M[0][2] - M[2][0]) / s; z = (M[1][0] - M[0][1]) / s; }
  else if (M[0][0] > M[1][1] && M[0][0] > M[2][2]) { const s = Math.sqrt(1 + M[0][0] - M[1][1] - M[2][2]) * 2; w = (M[2][1] - M[1][2]) / s; x = s / 4; y = (M[0][1] + M[1][0]) / s; z = (M[0][2] + M[2][0]) / s; }
  else if (M[1][1] > M[2][2]) { const s = Math.sqrt(1 + M[1][1] - M[0][0] - M[2][2]) * 2; w = (M[0][2] - M[2][0]) / s; x = (M[0][1] + M[1][0]) / s; y = s / 4; z = (M[1][2] + M[2][1]) / s; }
  else { const s = Math.sqrt(1 + M[2][2] - M[0][0] - M[1][1]) * 2; w = (M[1][0] - M[0][1]) / s; x = (M[0][2] + M[2][0]) / s; y = (M[1][2] + M[2][1]) / s; z = s / 4; }
  const n = Math.hypot(x, y, z, w) || 1;
  return [x / n, y / n, z / n, w / n];
}
/** Matriz de rotación de un cuaternión [x, y, z, w]. */
export function matrizDe(q) {
  const [x, y, z, w] = q;
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
}
/** Cuaternión del celular en el mundo de la simulación, desde alpha, beta, gamma. */
export const cuaternionMundo = (alpha, beta, gamma) => cuaternion(matrizMundo(alpha, beta, gamma));

/**
 * Cuánto hay que girar el celular (alrededor de la vertical, en radianes; usar con girarY) para que su «adelante» mire al
 * norte (-z, hacia donde mira la cámara de la simulación). Adelante = hacia donde apunta la cámara de atrás si el celular
 * está parado, o hacia donde apunta la parte de arriba si está acostado.
 */
export function rumboDe(q) {
  const M = matrizDe(q);
  const horiz = (v) => Math.hypot(v[0], v[2]);
  let f = mulV(M, [0, 0, -1]);   // la cámara de atrás
  if (horiz(f) < 0.5) f = mulV(M, [0, 1, 0]);   // acostado: la parte de arriba
  // ángulo de f alrededor de y medido desde -z
  return Math.atan2(f[0], -f[2]);
}
/** Gira un cuaternión alrededor de la vertical (y). */
export function girarY(q, ang) {
  const s = Math.sin(ang / 2), c = Math.cos(ang / 2), [x, y, z, w] = q;
  // (0, s, 0, c) * q
  return [c * x + s * z, c * y + s * w, c * z - s * x, c * w - s * y];
}

// ---------------------------------------------------------------- aceleración → recorrido
/** Aceleración sin gravedad, en el mundo de la simulación (m/s²), de una muestra. */
export function aceleracionMundo(m) {
  if (!m.a) return [0, 0, 0];
  return mulV(matrizDe(m.q), m.a);
}

/**
 * Recorrido aproximado del celular: posición [x, y, z] (metros) en cada muestra, desde el origen.
 * La aceleración se suma dos veces y el error crece muy rápido, así que:
 *   0. con el celu quieto al principio y al final se mide el error del sensor (la aceleración tiene que ser 0) y se resta;
 *   1. se detectan los momentos en que el celular está quieto (casi sin aceleración ni giro, un rato seguido);
 *   2. entre dos momentos quietos, la velocidad tiene que empezar y terminar en 0: lo que sobra se reparte parejo
 *      y se resta (corrige el error de calibración del sensor);
 *   3. quieto = velocidad 0 (el celular no se va solo);
 *   4. CIERRE (si la persona empezó y terminó con el celu quieto en el mismo lugar, como la pose en T del Mocap): el
 *      celu tiene que terminar donde empezó. Lo que sobra (el error que todavía quedó) se reparte según cuánto se
 *      movió en cada momento (cuando está quieto no se corre nada) y se resta, y así el recorrido vuelve al punto de partida.
 * Devuelve { pos, quieto, calidad, avisos, cierre: { aplicado, residuo (m: a cuánto del inicio terminaba antes de corregir),
 * inicioQuieto, finQuieto, sesgo (m/s²: el error del sensor que se midió en reposo y se restó) } }. Sirve para movimientos de un par de segundos; en los largos y lentos se corre.
 * opciones: { quietoAcel (m/s²), quietoGiro (°/s), quietoSeg, cerrar }.
 */
export function recorrido(muestras, { quietoAcel = 0.35, quietoGiro = 12, quietoSeg = 0.3, cerrar = true } = {}) {
  const n = muestras.length;
  const pos = Array.from({ length: n }, () => [0, 0, 0]);
  const sinCierre = { aplicado: false, residuo: 0, inicioQuieto: false, finQuieto: false };
  if (n < 3 || !muestras.some((m) => m.a)) return { pos, quieto: new Array(n).fill(true), calidad: 'sin aceleración', avisos: [], cierre: sinCierre };
  const A = muestras.map(aceleracionMundo);
  const suave = (arr, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) { s += arr[k]; c++; } return s / c; };
  const giro = muestras.map((m) => (m.g ? Math.hypot(m.g[0], m.g[1], m.g[2]) : 0));
  // 0. el error del sensor: con el celu quieto la aceleración tiene que ser 0; lo que marque (un valor fijo, o la gravedad
  //    que se le filtra por una inclinación mal medida) es error. Se mide en el rato quieto del principio y en el del final
  //    (quieto = casi no varía, aunque marque un valor distinto de 0) y se resta, repartido parejo entre los dos.
  const w = Math.max(2, Math.round(0.15 * (frecuencia(muestras) || 60)));
  const varia = A.map((_, i) => {   // cuánto varía la aceleración alrededor de cada muestra
    const a0 = Math.max(0, i - w), a1 = Math.min(n - 1, i + w), c = a1 - a0 + 1; let v = 0;
    for (let e = 0; e < 3; e++) { let s = 0, s2 = 0; for (let k = a0; k <= a1; k++) { s += A[k][e]; s2 += A[k][e] * A[k][e]; } v += Math.max(0, s2 / c - (s / c) ** 2); }
    return Math.sqrt(v);
  });
  const sesgo = { inicio: null, fin: null };
  const reposo = (de, hasta) => {   // promedio de la aceleración en n0..n1 sin los bordes (donde se toca la pantalla)
    const b = Math.round(0.1 * (frecuencia(muestras) || 60)); de += b; hasta -= b;
    if (hasta - de < 4) return null;
    const m = [0, 0, 0]; for (let k = de; k <= hasta; k++) for (let e = 0; e < 3; e++) m[e] += A[k][e] / (hasta - de + 1);
    return m;
  };
  { let k = 0; while (k < n && varia[k] < 0.15 && suave(giro, k) < quietoGiro) k++;
    if (k > 0 && muestras[k - 1].t - muestras[0].t >= quietoSeg) sesgo.inicio = reposo(0, k - 1);
    let j = n - 1; while (j >= 0 && varia[j] < 0.15 && suave(giro, j) < quietoGiro) j--;
    if (j < n - 1 && muestras[n - 1].t - muestras[j + 1].t >= quietoSeg) sesgo.fin = reposo(j + 1, n - 1); }
  if (sesgo.inicio || sesgo.fin) {
    const b0 = sesgo.inicio || sesgo.fin, b1 = sesgo.fin || sesgo.inicio;
    // en el tiempo entre el medio del rato quieto del principio y el medio del final
    const tIni = muestras[0].t, tFin = muestras[n - 1].t, dur = Math.max(1e-6, tFin - tIni);
    for (let k = 0; k < n; k++) { const f = Math.min(1, Math.max(0, (muestras[k].t - tIni) / dur)); for (let e = 0; e < 3; e++) A[k][e] -= b0[e] + (b1[e] - b0[e]) * f; }
  }
  // 1. quieto (suavizando un poco para que un temblor no corte el momento)
  const mod = A.map((a) => Math.hypot(a[0], a[1], a[2]));
  const calmo = mod.map((_, i) => suave(mod, i) < quietoAcel && suave(giro, i) < quietoGiro);
  const quieto = new Array(n).fill(false);
  for (let i = 0; i < n;) {
    if (!calmo[i]) { i++; continue; }
    let j = i; while (j < n && calmo[j]) j++;
    if (muestras[j - 1].t - muestras[i].t >= quietoSeg || i === 0 || j === n) for (let k = i; k < j; k++) quieto[k] = true;
    i = j;
  }
  // 2 y 3. tramos en movimiento entre momentos quietos
  const v = Array.from({ length: n }, () => [0, 0, 0]);
  let i = 0;
  while (i < n) {
    if (quieto[i]) { i++; continue; }
    let j = i; while (j < n && !quieto[j]) j++;   // i..j-1 en movimiento
    const dts = (k) => (k > 0 ? Math.min(0.1, muestras[k].t - muestras[k - 1].t) : 0);
    const vel = [[0, 0, 0]];
    for (let k = i; k < j; k++) { const p = vel[vel.length - 1], d = dts(k); vel.push([p[0] + A[k][0] * d, p[1] + A[k][1] * d, p[2] + A[k][2] * d]); }
    const fin = vel[vel.length - 1], largo = j - i;
    const cierra = j < n;   // si el grabado termina en movimiento no hay con qué corregir: se deja como está
    for (let k = 0; k < largo; k++) {
      const f = cierra ? (k + 1) / largo : 0;
      v[i + k] = [vel[k + 1][0] - fin[0] * f, vel[k + 1][1] - fin[1] * f, vel[k + 1][2] - fin[2] * f];
    }
    i = j;
  }
  const dtk = (k) => Math.min(0.1, muestras[k].t - muestras[k - 1].t);
  for (let k = 1; k < n; k++) {
    const d = dtk(k);
    pos[k] = [0, 1, 2].map((c) => pos[k - 1][c] + ((v[k][c] + v[k - 1][c]) / 2) * d);
  }
  // 4. cierre: empezó y terminó quieto (un rato de verdad) → tiene que terminar donde empezó
  const quietoAlInicio = (() => { let k = 0; while (k < n && quieto[k]) k++; return k > 0 && muestras[k - 1].t - muestras[0].t >= quietoSeg; })();
  const quietoAlFinal = (() => { let k = n - 1; while (k >= 0 && quieto[k]) k--; return k < n - 1 && muestras[n - 1].t - muestras[k + 1].t >= quietoSeg; })();
  const cierre = { aplicado: false, residuo: 0, inicioQuieto: quietoAlInicio, finQuieto: quietoAlFinal,
    sesgo: Math.hypot(...(sesgo.inicio || sesgo.fin || [0, 0, 0])) };   // error del sensor medido en reposo (m/s²)
  const avisos = [];
  const resto = pos[n - 1].slice();
  cierre.residuo = Math.hypot(...resto);
  if (cerrar) {
    if (quietoAlInicio && quietoAlFinal) {
      // cuánto se movió en cada momento (la velocidad ya corregida): ahí es donde se juntó el error
      const S = [0];
      for (let k = 1; k < n; k++) S.push(S[k - 1] + ((Math.hypot(...v[k]) + Math.hypot(...v[k - 1])) / 2) * dtk(k));
      const total = S[n - 1];
      if (total > 1e-6) {
        for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) pos[k][c] -= resto[c] * (S[k] / total);
        cierre.aplicado = true;
      }
    } else {
      avisos.push(!quietoAlInicio && !quietoAlFinal ? 'No estaba quieto al empezar ni al terminar: no se pudo cerrar el recorrido.'
        : !quietoAlInicio ? 'No estaba quieto al empezar: no se pudo cerrar el recorrido.' : 'No estaba quieto al terminar: no se pudo cerrar el recorrido.');
    }
  }
  const alc = Math.max(...pos.map((p) => Math.hypot(...p)));
  // si antes de corregir terminaba muy lejos de donde empezó (más de la mitad de lo que se movió), la aceleración de esta toma no sirve mucho
  if (cierre.residuo > 0.5 * Math.max(alc, 0.1) && cierre.residuo > 0.05) {
    avisos.push(`La aceleración de esta toma no es muy confiable: terminaba a ${Math.round(cierre.residuo * 100)} cm de donde empezó.`);
  }
  const movs = quieto.filter((x) => !x).length;
  if (!avisos.length && movs / n > 0.9) avisos.push('Sin momentos quietos: el recorrido se corre.');
  return { pos, quieto, calidad: avisos.length ? avisos[0] : 'ok', avisos, cierre };
}

/**
 * Saca el tramo quieto de sobra al principio y al final (deja `margen` segundos de cada lado) y vuelve a poner el tiempo en 0.
 * Devuelve una lista nueva de muestras. quieto = el que devuelve recorrido().
 */
export function recortar(muestras, quieto, margen = 0.5) {
  const n = muestras.length;
  let a = 0; while (a < n && quieto[a]) a++;
  let b = n - 1; while (b >= 0 && quieto[b]) b--;
  if (a >= n || b < a) return muestras;   // todo quieto: no hay qué recortar
  const t0 = muestras[a].t - margen, t1 = muestras[b].t + margen;
  const sel = muestras.filter((m) => m.t >= t0 && m.t <= t1);
  const base = sel[0].t;
  return sel.map((m) => ({ ...m, t: m.t - base }));
}

/** Distancia más lejos del origen (metros). */
export const alcance = (pos) => pos.reduce((m, p) => Math.max(m, Math.hypot(p[0], p[1], p[2])), 0);

// ---------------------------------------------------------------- grabaciones
const r = (x, d) => (x === null || x === undefined ? null : +Number(x).toFixed(d));
/** Muestra compacta para guardar: [t, qx, qy, qz, qw, ax, ay, az, gx, gy, gz] (a y g pueden faltar = null). */
export function aFila(m) {
  return [r(m.t, 4), ...m.q.map((x) => r(x, 5)), ...(m.a ? m.a.map((x) => r(x, 3)) : [null, null, null]), ...(m.g ? m.g.map((x) => r(x, 2)) : [null, null, null])];
}
export function deFila(f) {
  const tres = (a, b, c) => (a === null || a === undefined ? null : [a, b, c]);
  return { t: f[0], q: [f[1], f[2], f[3], f[4]], a: tres(f[5], f[6], f[7]), g: tres(f[8], f[9], f[10]) };
}
/** Una grabación lista para guardar como archivo (JSON). */
export function grabacion(muestras, { nombre = '', aparato = '', hz = 0 } = {}) {
  return { formato: 'estudio-bbs-celu', version: 1, nombre, aparato, creado: new Date().toISOString(), hz: r(hz, 1),
    duracion: muestras.length ? r(muestras[muestras.length - 1].t, 3) : 0, muestras: muestras.map(aFila) };
}
/** Lee una grabación (objeto o texto). Devuelve { nombre, aparato, hz, muestras }. */
export function leerGrabacion(dato) {
  const o = typeof dato === 'string' ? JSON.parse(dato) : dato;
  if (!o || o.formato !== 'estudio-bbs-celu' || !Array.isArray(o.muestras)) throw new Error('Ese archivo no es una grabación del celu (.json de Estudio BBS).');
  const muestras = o.muestras.map(deFila).filter((m) => m.q.every(Number.isFinite) && Number.isFinite(m.t));
  if (muestras.length < 2) throw new Error('La grabación está vacía.');
  return { nombre: o.nombre || '', aparato: o.aparato || '', hz: o.hz || 0, creado: o.creado || '', muestras };
}

/**
 * Aceleración sin gravedad desde la que da el celular con gravedad, restándole la gravedad según cómo está girado.
 * signo: +1 (Android: el celular acostado marca +9,8 en z) o -1 (iPhone: al revés).
 */
export function sinGravedad(conGravedad, q, signo = 1) {
  const enMundo = mulV(matrizDe(q), conGravedad.map((x) => x * signo));   // fuerza que siente el sensor, en el mundo
  const a = [enMundo[0], enMundo[1] - G, enMundo[2]];                       // (en reposo: marca +g hacia arriba)
  return mulV(trasp(matrizDe(q)), a);
}
/** ¿El sensor del celular marca la gravedad con el signo de Android (+1) o al revés (-1)? Con muestras casi quietas. */
export function signoGravedad(muestras) {
  let s = 0;
  for (const m of muestras) if (m.gConGrav) { const w = mulV(matrizDe(m.q), m.gConGrav); s += w[1]; }
  return s < 0 ? -1 : 1;
}

/** Frecuencia de muestreo (Hz) de una lista de muestras. */
export function frecuencia(muestras) {
  if (muestras.length < 2) return 0;
  return (muestras.length - 1) / Math.max(1e-6, muestras[muestras.length - 1].t - muestras[0].t);
}
