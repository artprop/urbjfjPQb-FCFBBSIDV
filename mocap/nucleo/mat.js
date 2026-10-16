// Matematica comun del nucleo: vectores, matrices 3x3, rotaciones y filtros.
// Reproduce lo que el programa de PC hacia con numpy/scipy (mismos resultados, comprobado en pruebas/).
// Matrices 3x3 = arrays de 3 filas [[a,b,c],[d,e,f],[g,h,i]]. Vectores = [x,y,z].

export const PI = Math.PI;

// ---------- vectores ----------
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => Math.sqrt(dot(a, a));
export function unit(v) {
  const l = norm(v);
  return l > 1e-9 ? mul(v, 1 / l) : [0, 0, 0];
}
export const clip = (x, a, b) => Math.min(Math.max(x, a), b);

// ---------- matrices ----------
export const eye = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const T = (m) => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
export function mm(a, b) {
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return r;
}
export const mv = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
export const cols = (x, y, z) => [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
export const col = (m, j) => [m[0][j], m[1][j], m[2][j]];
export function frob(a, b) {   // norma de Frobenius de a - b
  let s = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += (a[i][j] - b[i][j]) ** 2;
  return Math.sqrt(s);
}

// ---------- rotaciones (convencion de scipy.spatial.transform.Rotation) ----------
export function fromRotvec(v) {
  const th = norm(v);
  if (th < 1e-12) return eye();
  const [x, y, z] = mul(v, 1 / th), c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
          [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
          [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
}

// matriz -> cuaternion [x, y, z, w] (algoritmo de scipy: elige la componente mayor)
export function quatFromMatrix(m) {
  const d = [m[0][0], m[1][1], m[2][2], m[0][0] + m[1][1] + m[2][2]];
  let k = 0;
  for (let i = 1; i < 4; i++) if (d[i] > d[k]) k = i;
  let q;
  if (k === 3) {
    q = [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1], 1 + d[3]];
  } else {
    const i = k, j = (i + 1) % 3, l = (j + 1) % 3;
    q = [0, 0, 0, 0];
    q[i] = 1 - d[3] + 2 * m[i][i];
    q[j] = m[j][i] + m[i][j];
    q[l] = m[l][i] + m[i][l];
    q[3] = m[l][j] - m[j][l];
  }
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return q.map((x) => x / n);
}

export function matrixFromQuat(q) {
  const [x, y, z, w] = q;
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
}

export function rotvecFromMatrix(m) {
  let q = quatFromMatrix(m);
  if (q[3] < 0) q = q.map((x) => -x);
  const s = Math.hypot(q[0], q[1], q[2]);
  const ang = 2 * Math.atan2(s, q[3]);
  let f;
  if (ang <= 1e-3) { const a2 = ang * ang; f = 2 + a2 / 12 + 7 * a2 * a2 / 2880; }
  else f = ang / Math.sin(ang / 2);
  return [q[0] * f, q[1] * f, q[2] * f];
}

export function magnitude(m) {        // angulo de la rotacion (radianes)
  const q = quatFromMatrix(m);
  return 2 * Math.atan2(Math.hypot(q[0], q[1], q[2]), Math.abs(q[3]));
}

// R = Rz(z) * Ry(y) * Rx(x)  (scipy from_euler('ZYX', [z, y, x]))
export function fromEuler(e) {
  const [x, y, z] = e;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return [[cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
          [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
          [-sy, cy * sx, cy * cx]];
}

// matriz -> [x, y, z] con R = Rz*Ry*Rx (como scipy as_euler('ZYX'), invertido a x,y,z)
export function toEuler(m) {
  const sy = clip(-m[2][0], -1, 1);
  const y = Math.asin(sy);
  if (Math.abs(Math.abs(sy) - 1) < 1e-7) {      // bloqueo de cardan: scipy deja x = 0
    const z = Math.atan2(-m[0][1], m[1][1]);
    return [0, y, z];
  }
  return [Math.atan2(m[2][1], m[2][2]), y, Math.atan2(m[1][0], m[0][0])];
}

// promedio de rotaciones (scipy Rotation.mean: autovector mayor de sum(q q^T))
export function meanRotation(mats) {
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (const m of mats) {
    const q = quatFromMatrix(m);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) A[i][j] += q[i] * q[j];
  }
  const { vals, vecs } = jacobiEigen(A);
  let k = 0;
  for (let i = 1; i < 4; i++) if (vals[i] > vals[k]) k = i;
  return matrixFromQuat([vecs[0][k], vecs[1][k], vecs[2][k], vecs[3][k]]);
}

function jacobiEigen(S) {
  const n = S.length, a = S.map((r) => r.slice()), v = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let it = 0; it < 100; it++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { vals: a.map((r, i) => r[i]), vecs: v };
}

// ---------- numeros como en numpy/Python ----------
export function roundHalfEven(x) {       // round() de Python / numpy
  const r = Math.round(x);
  return (Math.abs(x % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r;
}
export function roundTo(x, nd) {          // round(x, nd) aproximado (solo para mostrar/guardar)
  const f = 10 ** nd;
  return roundHalfEven(x * f) / f;
}
export function median(arr) {
  const s = Float64Array.from(arr).sort();
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
// np.interp (con extremos fijos)
export function interp(x, xp, fp) {
  const n = xp.length;
  if (x <= xp[0]) return fp[0];
  if (x >= xp[n - 1]) return fp[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xp[m] <= x) lo = m; else hi = m; }
  const d = xp[hi] - xp[lo];
  if (d === 0) return fp[hi];
  return fp[lo] + (x - xp[lo]) * (fp[hi] - fp[lo]) / d;
}
// np.searchsorted(a, v, side)
export function searchsorted(a, v, side = 'left') {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (side === 'left' ? a[m] < v : a[m] <= v) lo = m + 1; else hi = m;
  }
  return lo;
}

// ---------- filtros (scipy.ndimage), sobre series: arr = array de N valores numericos ----------
export function gaussianWeights(sigma, truncate = 4.0) {
  const r = Math.floor(truncate * sigma + 0.5);
  const w = [];
  let s = 0;
  for (let x = -r; x <= r; x++) { const v = Math.exp(-0.5 * x * x / (sigma * sigma)); w.push(v); s += v; }
  return { r, w: w.map((v) => v / s) };
}
// gaussian_filter1d(mode='nearest') de una serie
export function gaussian1d(arr, sigma, pesos = null) {
  const { r, w } = pesos || gaussianWeights(sigma);
  const n = arr.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += w[k + r] * arr[clip(i + k, 0, n - 1)];
    out[i] = s;
  }
  return out;
}
// median_filter(size=k, mode='nearest') de una serie
export function median1d(arr, k) {
  const n = arr.length, h = Math.floor(k / 2), out = new Float64Array(n), win = new Float64Array(k);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) win[j] = arr[clip(i - h + j, 0, n - 1)];
    out[i] = median(win);
  }
  return out;
}
// uniform_filter1d(size=3, mode='reflect')
export function uniform3(arr) {
  const n = arr.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (arr[Math.max(i - 1, 0)] + arr[i] + arr[Math.min(i + 1, n - 1)]) / 3;
  return out;
}
// binary_erosion 1D (estructura de 3, border_value=1)
export function erosion(mask, iterations) {
  let m = mask.slice();
  for (let it = 0; it < iterations; it++) {
    const n = m.length, o = new Array(n);
    for (let i = 0; i < n; i++) o[i] = (i === 0 || m[i - 1]) && m[i] && (i === n - 1 || m[i + 1]);
    m = o;
  }
  return m;
}
// np.gradient de una serie
export function gradient(arr) {
  const n = arr.length, out = new Float64Array(n);
  if (n < 2) return out;
  out[0] = arr[1] - arr[0]; out[n - 1] = arr[n - 1] - arr[n - 2];
  for (let i = 1; i < n - 1; i++) out[i] = (arr[i + 1] - arr[i - 1]) / 2;
  return out;
}
export const radians = (d) => d * PI / 180;
export const degrees = (r) => r * 180 / PI;
