// Cuentas que hacen Python y numpy, copiadas para que el Director web dé exactamente lo mismo que el de la PC
// (redondeo de Python, el % de Python, math.hypot, y numpy en float32: sumas, promedio, mediana, percentil).

const f32 = Math.fround;

// round(x, nd) de Python: redondea el valor decimal exacto, y si queda justo en el medio va al par
export function pyRound(x, nd = 0) {
  if (!Number.isFinite(x)) return x;
  if (nd === 0) {
    const r = Math.round(x);                       // JS: medio hacia arriba
    return (r - x === 0.5 && r % 2 !== 0) ? r - 1 : r;
  }
  const neg = x < 0 || Object.is(x, -0);
  const s = Math.abs(x).toFixed(100);              // decimales exactos del número binario
  const [ent, dec] = s.split('.');
  const resto = dec.slice(nd);
  let digitos = ent + dec.slice(0, nd);
  const primero = resto.charCodeAt(0) - 48;
  const masDespues = /[1-9]/.test(resto.slice(1));
  const ultimo = digitos.charCodeAt(digitos.length - 1) - 48;
  const subir = primero > 5 || (primero === 5 && (masDespues || ultimo % 2 === 1));
  if (subir) digitos = (BigInt(digitos) + 1n).toString();
  digitos = digitos.padStart(nd + 1, '0');
  const v = Number(digitos.slice(0, -nd) + '.' + digitos.slice(-nd));
  return neg ? -v : v;
}

// a % b de Python (el resultado tiene el signo de b)
export function pyMod(a, b) {
  let m = a % b;
  if (m) { if ((b < 0) !== (m < 0)) m += b; } else m = b < 0 ? -0 : 0;
  return m;
}

export const radians = (x) => x * (Math.PI / 180);
export const degrees = (x) => x * (180 / Math.PI);
export const copysign = (x, y) => ((y < 0 || Object.is(y, -0)) ? -Math.abs(x) : Math.abs(x));
export const clip = (x, a, b) => Math.min(b, Math.max(a, x));

// ---- math.hypot de CPython (vector_norm con corrección, casi siempre redondeado exacto)
function mulExacto(a, b) {                       // producto exacto (Dekker), sin fma
  const p = a * b;
  const sp = 134217729;                          // 2^27 + 1
  const ca = sp * a, ah = ca - (ca - a), al = a - ah;
  const cb = sp * b, bh = cb - (cb - b), bl = b - bh;
  return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl];
}
function sumaRapida(a, b) { const hi = a + b; return [hi, (a - hi) + b]; }
export function hypot(...xs) {
  const v = xs.map(Math.abs);
  let max = 0, nan = false;
  for (const x of v) { if (Number.isNaN(x)) nan = true; else if (x > max) max = x; }
  if (max === Infinity) return Infinity;
  if (nan) return NaN;
  if (max === 0 || v.length <= 1) return max;
  const e = Math.floor(Math.log2(max)) + 1;      // frexp: max = m * 2^e con 0.5 <= m < 1
  let maxE = e;
  if (max * 2 ** -maxE >= 1) maxE += 1; else if (max * 2 ** -maxE < 0.5) maxE -= 1;
  const scale = 2 ** -maxE;
  let csum = 1, frac1 = 0, frac2 = 0;
  for (let x of v) {
    x *= scale;
    const [phi, plo] = mulExacto(x, x);
    const [shi, slo] = sumaRapida(csum, phi);
    csum = shi; frac1 += plo; frac2 += slo;
  }
  let h = Math.sqrt(csum - 1 + (frac1 + frac2));
  const [phi, plo] = mulExacto(-h, h);
  const [shi, slo] = sumaRapida(csum, phi);
  csum = shi; frac1 += plo; frac2 += slo;
  const x = csum - 1 + (frac1 + frac2);
  h += x / (2 * h);
  return h / scale;
}

// ---- numpy
// np.searchsorted(ts, x, side='right')
export function searchRight(ts, x) {
  let lo = 0, hi = ts.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (x < ts[m]) hi = m; else lo = m + 1; }
  return lo;
}

// np.interp(x, xp, fp) para un solo x (xp ordenado; con ticks repetidos usa el último)
export function interp(x, xp, fp) {
  const n = xp.length;
  if (Number.isNaN(x)) return x;
  if (x < xp[0]) return fp[0];
  if (x > xp[n - 1]) return fp[n - 1];
  const j = searchRight(xp, x) - 1;
  if (j === n - 1) return fp[j];
  if (xp[j] === x) return fp[j];
  const slope = (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
  let r = slope * (x - xp[j]) + fp[j];
  if (Number.isNaN(r)) {
    r = slope * (x - xp[j + 1]) + fp[j + 1];
    if (Number.isNaN(r) && fp[j] === fp[j + 1]) r = fp[j];
  }
  return r;
}

// np.arange(a, z, paso) en float64 (numpy usa delta = (a + paso) - a)
export function arange(a, z, paso) {
  const n = Math.max(0, Math.ceil((z - a) / paso));
  const out = new Float64Array(n);
  if (n > 0) out[0] = a;
  if (n > 1) { const delta = (a + paso) - a; for (let i = 1; i < n; i++) out[i] = a + i * delta; }
  return out;
}

// suma por pares de numpy en float32 (la misma agrupación, así da el mismo número)
export function sumaF32(a, ini = 0, n = a.length - ini) {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res = f32(res + a[ini + i]);
    return res;
  }
  if (n <= 128) {
    const r = new Float32Array(8);
    for (let j = 0; j < 8; j++) r[j] = a[ini + j];
    let i = 8;
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] = f32(r[j] + a[ini + i + j]);
    let res = f32(f32(f32(r[0] + r[1]) + f32(r[2] + r[3])) + f32(f32(r[4] + r[5]) + f32(r[6] + r[7])));
    for (; i < n; i++) res = f32(res + a[ini + i]);
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return f32(sumaF32(a, ini, n2) + sumaF32(a, ini + n2, n - n2));
}

// np.mean de un tramo float32 (vacío = NaN, como numpy)
export function promedioF32(a, ini = 0, n = a.length - ini) {
  if (n <= 0) return NaN;
  return f32(sumaF32(a, ini, n) / n);
}

// np.median de float32 (si hay NaN da NaN)
export function medianaF32(arr) {
  const n = arr.length;
  if (!n) return NaN;
  for (const x of arr) if (Number.isNaN(x)) return NaN;
  const s = Float32Array.from(arr).sort();
  if (n % 2) return s[(n - 1) / 2];
  return f32(f32(s[n / 2 - 1] + s[n / 2]) / 2);
}

// np.percentile(float32, q) método lineal
export function percentilF32(arr, q) {
  const s = Float32Array.from(arr).sort();
  const n = s.length;
  const vi = (n - 1) * (q / 100);
  const prev = Math.floor(vi), sig = Math.min(prev + 1, n - 1);
  const g = vi - prev;
  const a = s[prev], b = s[sig];
  const diff = f32(b - a);
  return f32(g >= 0.5 ? b - diff * (1 - g) : a + diff * g);
}

// np.log10 / np.sqrt en float32
export const log10F32 = (x) => f32(Math.log10(x));
export const sqrtF32 = (x) => f32(Math.sqrt(x));
