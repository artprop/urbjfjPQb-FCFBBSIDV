// «Cajas giradas»: el modelo se arma con cajas que pueden estar giradas, de a una por vez. Empieza con una sola caja que envuelve
// todo y en cada paso parte en dos la caja que peor encaja (la que más vacío tapa o más volumen deja afuera), y ajusta las cajas
// nuevas a prueba y error (mover, estirar, girar: se queda con el cambio si se parece más). Así salen versiones de 1, 2, 3… cajas.
// Todo son cuentas sobre una grilla: cada celda del modelo (sólido) tiene que quedar tapada y cada celda vacía, destapada.

// ---------------------------------------------------------------- el volumen (relleno) del modelo
/** De la grilla de voxelizar: 1 = adentro del modelo. Cierra agujeritos (engorda 1, rellena desde afuera, adelgaza 1). */
export function solidoDe(g) {
  const { nx, ny, nz, parte } = g, N = nx * ny * nz;
  const ocup = new Uint8Array(N); for (let v = 0; v < N; v++) ocup[v] = parte[v] >= 0 ? 1 : 0;
  const vecinos = (v, f) => {
    const x = v % nx, z = Math.floor(v / nx) % nz, y = Math.floor(v / (nx * nz));
    if (x > 0) f(v - 1); if (x < nx - 1) f(v + 1); if (z > 0) f(v - nx); if (z < nz - 1) f(v + nx); if (y > 0) f(v - nx * nz); if (y < ny - 1) f(v + nx * nz);
  };
  const gordo = new Uint8Array(N);
  for (let v = 0; v < N; v++) if (ocup[v]) { gordo[v] = 1; vecinos(v, (w) => { gordo[w] = 1; }); }
  const afuera = new Uint8Array(N), cola = new Int32Array(N); let a = 0, b = 0;
  afuera[0] = 1; cola[b++] = 0;
  while (a < b) { const v = cola[a++]; vecinos(v, (w) => { if (!afuera[w] && !gordo[w]) { afuera[w] = 1; cola[b++] = w; } }); }
  const sol = new Uint8Array(N);
  for (let v = 0; v < N; v++) if (!afuera[v]) { let toca = false; vecinos(v, (w) => { if (afuera[w]) toca = true; }); sol[v] = toca && !ocup[v] ? 0 : 1; }
  return sol;
}

const MEZCLA = 1.5;   // cuánto pesa que una caja junte partes distintas del modelo

// ---------------------------------------------------------------- álgebra chiquita
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function rotar(R, eje, ang) {   // R: 3 filas (los ejes de la caja); gira los 3 ejes alrededor de «eje» (unitario)
  const c = Math.cos(ang), s = Math.sin(ang), [x, y, z] = eje, t = 1 - c;
  const M = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  return [0, 1, 2].map((i) => { const r = R[i]; return [M[0] * r[0] + M[1] * r[1] + M[2] * r[2], M[3] * r[0] + M[4] * r[1] + M[5] * r[2], M[6] * r[0] + M[7] * r[1] + M[8] * r[2]]; });
}
// autovectores de una matriz simétrica 3x3 (Jacobi)
function autovectores(A) {
  const a = [[A[0], A[1], A[2]], [A[1], A[3], A[4]], [A[2], A[4], A[5]]], V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 40; it++) {
    let p = 0, q = 1; if (Math.abs(a[0][2]) > Math.abs(a[p][q])) { p = 0; q = 2; } if (Math.abs(a[1][2]) > Math.abs(a[p][q])) { p = 1; q = 2; }
    if (Math.abs(a[p][q]) < 1e-10) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
  }
  return [0, 1, 2].map((i) => [V[0][i], V[1][i], V[2][i]]);
}

// ---------------------------------------------------------------- el ajuste
export class Ajuste {
  /** solido: Uint8Array (1 = adentro); nx, ny, nz: tamaño de la grilla. opciones: girar (true = cajas giradas; false = todas derechas). */
  constructor(solido, nx, ny, nz, { girar = true, semilla = 1, partes = null } = {}) {
    // partes (opcional): de qué parte del modelo es cada celda (cabeza, saco…): se prefiere que cada caja sea de una sola parte
    Object.assign(this, { solido, nx, ny, nz, girar, partes });
    this.N = nx * ny * nz; this.tapa = new Uint16Array(this.N);
    this.total = 0; for (let v = 0; v < this.N; v++) this.total += solido[v];
    this.falta = this.total; this.sobra = 0;   // celdas del modelo sin tapar / celdas vacías tapadas
    this.cajas = [];
    this.rnd = (() => { let s = semilla >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  }
  get error() { return this.falta + this.sobra; }
  /** Qué tanto se parece (0 a 1): celdas bien / (modelo + lo que sobra). */
  get parecido() { return (this.total - this.falta) / (this.total + this.sobra); }

  // las celdas que tapa una caja { c, R (3 ejes), h (medias medidas) }
  celdas(b) {
    const { nx, ny, nz } = this, ext = [0, 1, 2].map((a) => Math.abs(b.R[0][a]) * b.h[0] + Math.abs(b.R[1][a]) * b.h[1] + Math.abs(b.R[2][a]) * b.h[2]);
    const lo = [0, 1, 2].map((a) => Math.max(0, Math.floor(b.c[a] - ext[a] - 0.5))), hi = [nx, ny, nz].map((n, a) => Math.min(n - 1, Math.ceil(b.c[a] + ext[a] - 0.5)));
    const out = [], [u, v, w] = b.R, [hu, hv, hw] = b.h;
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
      const dx = x + 0.5 - b.c[0], dy = y + 0.5 - b.c[1], dz = z + 0.5 - b.c[2];
      if (Math.abs(dx * u[0] + dy * u[1] + dz * u[2]) <= hu && Math.abs(dx * v[0] + dy * v[1] + dz * v[2]) <= hv && Math.abs(dx * w[0] + dy * w[1] + dz * w[2]) <= hw) out.push((y * nz + z) * nx + x);
    }
    return Int32Array.from(out);
  }
  _poner(b, signo) {
    const { tapa, solido } = this;
    if (signo > 0) for (const v of b.cel) { if (tapa[v]++ === 0) { if (solido[v]) this.falta--; else this.sobra++; } }
    else for (const v of b.cel) { if (--tapa[v] === 0) { if (solido[v]) this.falta++; else this.sobra--; } }
  }
  // la caja que mejor envuelve un grupo de celdas: ejes principales (o derechos), medidas sin las puntas sueltas
  _envolver(cel) {
    const { nx, nz } = this, n = cel.length;
    const P = new Float32Array(n * 3);
    let m = [0, 0, 0];
    for (let k = 0; k < n; k++) { const v = cel[k], x = v % nx + 0.5, z = Math.floor(v / nx) % nz + 0.5, y = Math.floor(v / (nx * nz)) + 0.5; P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z; m[0] += x; m[1] += y; m[2] += z; }
    m = m.map((s) => s / n);
    const corte = n > 400 ? Math.floor(n * 0.002) : 0;   // (casi sin recortar: lo recortado se pierde en cada partida)
    const proy = new Float32Array(n);
    const caja = (R) => {
      const c = [0, 0, 0], h = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < n; k++) proy[k] = (P[k * 3] - m[0]) * R[i][0] + (P[k * 3 + 1] - m[1]) * R[i][1] + (P[k * 3 + 2] - m[2]) * R[i][2];
        const s = Float32Array.from(proy).sort(), a = s[corte] - 0.5, b = s[n - 1 - corte] + 0.5;
        h[i] = Math.max(0.5, (b - a) / 2);
        const medio = (a + b) / 2; for (let q = 0; q < 3; q++) c[q] += R[i][q] * medio;
      }
      return { c: [m[0] + c[0], m[1] + c[1], m[2] + c[2]], R, h, vol: h[0] * h[1] * h[2] };
    };
    const derecha = caja([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    if (!this.girar || n <= 3) return derecha;
    const C = [0, 0, 0, 0, 0, 0];
    for (let k = 0; k < n; k++) { const x = P[k * 3] - m[0], y = P[k * 3 + 1] - m[1], z = P[k * 3 + 2] - m[2]; C[0] += x * x; C[1] += x * y; C[2] += x * z; C[3] += y * y; C[4] += y * z; C[5] += z * z; }
    const girada = caja(autovectores(C));
    // girada solo si de verdad encaja mejor (si no, quedan cajas en diagonal sin motivo)
    return girada.vol < derecha.vol * 0.85 ? girada : derecha;
  }
  _nueva(cel) { const b = this._envolver(cel); b.propias = cel; b.cel = this.celdas(b); return b; }

  /** Primer paso: una sola caja que envuelve todo el modelo. */
  empezar() {
    const cel = []; for (let v = 0; v < this.N; v++) if (this.solido[v]) cel.push(v);
    if (!cel.length) throw new Error('El modelo está vacío.');
    const b = this._nueva(Int32Array.from(cel)); this._poner(b, 1); this.cajas = [b];
  }

  // cuántas celdas de una caja son de otras partes del modelo (no de la parte que más tiene)
  _mezcla(propias) {
    if (!this.partes) return 0;
    const cuenta = new Map(); let max = 0;
    for (const v of propias) { const p = this.partes[v]; if (p < 0) continue; const c = (cuenta.get(p) || 0) + 1; cuenta.set(p, c); if (c > max) max = c; }
    let total = 0; for (const c of cuenta.values()) total += c;
    return total - max;
  }
  // qué tan mal encaja una caja: vacío que tapa + volumen suyo que queda afuera + mezcla de partes
  _maldad(b) {
    let s = 0; for (const v of b.cel) if (!this.solido[v]) s++;
    for (const v of b.propias) if (!this.tapa[v]) s++;
    return s + MEZCLA * this._mezcla(b.propias);
  }
  // maneras de partir una caja (sus celdas propias en dos): por la mitad de cada uno de sus 3 ejes, y en dos montones (2-medias:
  // separa, por ejemplo, las dos piernas aunque estén a la misma altura)
  _particiones(b) {
    const { nx, nz } = this, n = b.propias.length, P = new Float32Array(n * 3);
    b.propias.forEach((v, k) => { P[k * 3] = v % nx + 0.5; P[k * 3 + 1] = Math.floor(v / (nx * nz)) + 0.5; P[k * 3 + 2] = Math.floor(v / nx) % nz + 0.5; });
    const out = [];
    // por cada eje de la caja: el corte donde las dos cajas que quedan (en ese marco) suman menos volumen
    const pr = b.R.map((e) => { const q = new Float32Array(n); for (let k = 0; k < n; k++) q[k] = P[k * 3] * e[0] + P[k * 3 + 1] * e[1] + P[k * 3 + 2] * e[2]; return q; });
    for (let i = 0; i < 3; i++) {
      const ord = Array.from({ length: n }, (_, k) => k).sort((x, y) => pr[i][x] - pr[i][y]);
      const vol = (mn, mx) => (mx[0] - mn[0] + 1) * (mx[1] - mn[1] + 1) * (mx[2] - mn[2] + 1);
      const izq = new Float64Array(n);
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let j = 0; j < n; j++) { const k = ord[j]; for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pr[a][k]); mx[a] = Math.max(mx[a], pr[a][k]); } izq[j] = vol(mn, mx); }
      mn = [Infinity, Infinity, Infinity]; mx = [-Infinity, -Infinity, -Infinity];
      let mejor = Infinity, corte = n >> 1;
      for (let j = n - 1; j >= 1; j--) {
        const k = ord[j]; for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pr[a][k]); mx[a] = Math.max(mx[a], pr[a][k]); }
        if (pr[i][ord[j]] === pr[i][ord[j - 1]]) continue;   // (no cortar en medio de una misma capa)
        const c = izq[j - 1] + vol(mn, mx); if (c < mejor) { mejor = c; corte = j; }
      }
      const lado = new Uint8Array(n); for (let j = corte; j < n; j++) lado[ord[j]] = 1;
      out.push(lado);
    }
    // 2-medias: arranca con el punto más lejos del centro y el más lejos de ese
    const d2 = (k, q) => (P[k * 3] - q[0]) ** 2 + (P[k * 3 + 1] - q[1]) ** 2 + (P[k * 3 + 2] - q[2]) ** 2;
    let k1 = 0; for (let k = 0; k < n; k++) if (d2(k, b.c) > d2(k1, b.c)) k1 = k;
    let q1 = [P[k1 * 3], P[k1 * 3 + 1], P[k1 * 3 + 2]], k2 = 0; for (let k = 0; k < n; k++) if (d2(k, q1) > d2(k2, q1)) k2 = k;
    let q2 = [P[k2 * 3], P[k2 * 3 + 1], P[k2 * 3 + 2]];
    const lado = new Uint8Array(n);
    for (let it = 0; it < 8; it++) {
      const s = [[0, 0, 0, 0], [0, 0, 0, 0]];
      for (let k = 0; k < n; k++) { const l = d2(k, q1) <= d2(k, q2) ? 0 : 1; lado[k] = l; s[l][0] += P[k * 3]; s[l][1] += P[k * 3 + 1]; s[l][2] += P[k * 3 + 2]; s[l][3]++; }
      if (!s[0][3] || !s[1][3]) break;
      q1 = s[0].slice(0, 3).map((x) => x / s[0][3]); q2 = s[1].slice(0, 3).map((x) => x / s[1][3]);
    }
    out.push(lado);
    // separar la parte que más tiene del resto (la cabeza del saco, por ejemplo)
    if (this.partes) {
      const cuenta = new Map(); for (const v of b.propias) { const p = this.partes[v]; cuenta.set(p, (cuenta.get(p) || 0) + 1); }
      if (cuenta.size > 1) for (const [p] of [...cuenta].sort((a, c) => c[1] - a[1]).slice(0, 3)) out.push(Uint8Array.from(b.propias, (v) => (this.partes[v] === p ? 1 : 0)));
    }
    return out.map((l) => {
      const A = [], B = []; b.propias.forEach((v, k) => (l[k] ? B : A).push(v));
      return A.length >= 2 && B.length >= 2 ? [this._nueva(Int32Array.from(A)), this._nueva(Int32Array.from(B))] : null;
    }).filter(Boolean);
  }

  // el pedazo más grande del modelo que todavía no tapa ninguna caja (celdas vecinas sin tapar)
  _mayorHueco() {
    const { N, nx, nz, ny, solido, tapa } = this, visto = new Uint8Array(N), cola = new Int32Array(N);
    let mejor = null;
    for (let v0 = 0; v0 < N; v0++) {
      if (!solido[v0] || tapa[v0] || visto[v0]) continue;
      let a = 0, b = 0; cola[b++] = v0; visto[v0] = 1;
      while (a < b) {
        const v = cola[a++], x = v % nx, z = Math.floor(v / nx) % nz, y = Math.floor(v / (nx * nz));
        for (const w of [x > 0 ? v - 1 : -1, x < nx - 1 ? v + 1 : -1, z > 0 ? v - nx : -1, z < nz - 1 ? v + nx : -1, y > 0 ? v - nx * nz : -1, y < ny - 1 ? v + nx * nz : -1])
          if (w >= 0 && !visto[w] && solido[w] && !tapa[w]) { visto[w] = 1; cola[b++] = w; }
      }
      if (!mejor || b > mejor.length) mejor = cola.slice(0, b);
    }
    return mejor;
  }

  /** Un paso: una caja más (se parte en dos la caja con la que más se gana). Devuelve false si ya no se puede. */
  paso() {
    const orden = this.cajas.map((b, k) => [this._maldad(b), k]).filter(([m, k]) => m > 0 && this.cajas[k].propias.length >= 2).sort((a, b) => b[0] - a[0]).slice(0, 8);
    let mejor = null;
    for (const [, k] of orden) for (const par of this._particiones(this.cajas[k])) {
      const b = this.cajas[k], e0 = this.error;
      this._poner(b, -1); this._poner(par[0], 1); this._poner(par[1], 1);
      const d = this.error - e0 + MEZCLA * (this._mezcla(par[0].propias) + this._mezcla(par[1].propias) - this._mezcla(b.propias));
      this._poner(par[1], -1); this._poner(par[0], -1); this._poner(b, 1);
      if (!mejor || d < mejor.d) mejor = { d, k, par };
    }
    if (!mejor) return false;
    this._poner(this.cajas[mejor.k], -1); this.cajas.splice(mejor.k, 1, ...mejor.par);
    for (const b of mejor.par) this._poner(b, 1);
    return true;
  }

  /**
   * Pule una versión: con las cajas puestas, cada una se ajusta a prueba y error (más chica donde tapa vacío, más grande donde
   * falta), varias vueltas. No cambia el estado del ajuste: devuelve { cajas, parecido }.
   */
  pulir(foto, vueltas = 3, intentos = 30) {
    const otro = new Ajuste(this.solido, this.nx, this.ny, this.nz, { girar: this.girar, semilla: foto.length * 7 + 1, partes: this.partes });
    otro.cajas = foto.map((b) => { const c = { c: b.c.slice(), R: b.R.map((r) => r.slice()), h: b.h.slice() }; c.cel = otro.celdas(c); otro._poner(c, 1); return c; });
    for (let v = 0; v < vueltas; v++) for (const b of otro.cajas) otro.afinar(b, intentos);
    return { cajas: otro.foto(), parecido: otro.parecido };
  }

  /** Prueba y error sobre una caja: mover, estirar, girar; se queda con lo que mejora. */
  afinar(b, intentos) {
    const rnd = this.rnd;
    for (let t = 0; t < intentos; t++) {
      const esc = 1 - 0.7 * (t / intentos);   // pasos cada vez más chicos
      const n = { c: b.c.slice(), R: b.R, h: b.h.slice() };
      const q = rnd();
      if (q < 0.35) { const a = Math.floor(rnd() * 3); n.c[a] += (rnd() * 2 - 1) * Math.max(0.5, b.h[Math.floor(rnd() * 3)] * 0.25) * esc; }
      else if (q < 0.75) { const a = Math.floor(rnd() * 3), d = (rnd() * 2 - 1) * Math.max(0.5, b.h[a] * 0.25) * esc; n.h[a] = Math.max(0.5, b.h[a] + d); if (rnd() < 0.5) for (let k = 0; k < 3; k++) n.c[k] += b.R[a][k] * d * (rnd() < 0.5 ? 1 : -1); }
      else if (this.girar) { const eje = b.R[Math.floor(rnd() * 3)]; n.R = rotar(b.R, eje, (rnd() * 2 - 1) * 0.25 * esc); }
      else continue;
      n.cel = this.celdas(n);
      const e0 = this.error;
      this._poner(b, -1); this._poner(n, 1);
      if (this.error < e0) { b.c = n.c; b.R = n.R; b.h = n.h; b.cel = n.cel; }
      else { this._poner(n, -1); this._poner(b, 1); }
    }
  }

  /** Copia liviana de las cajas actuales (para guardar cada versión). */
  foto() { return this.cajas.map((b) => ({ c: b.c.slice(), R: b.R.map((r) => r.slice()), h: b.h.slice() })); }
}

/**
 * De todas las versiones (parecido de cada una), las que conviene mostrar: donde el parecido pasa ciertos niveles, o donde
 * da un salto. Devuelve los índices (cantidad de cajas - 1).
 */
export function versionesSugeridas(parecidos) {
  const out = new Set([0]);
  for (const nivel of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.88, 0.91, 0.94, 0.96, 0.98]) {
    const i = parecidos.findIndex((p) => p >= nivel); if (i >= 0) out.add(i);
  }
  // saltos: cuando una caja más mejora mucho más que el promedio de las anteriores
  for (let i = 3; i < parecidos.length; i++) {
    const salto = parecidos[i] - parecidos[i - 1], antes = (parecidos[i - 1] - parecidos[Math.max(0, i - 6)]) / Math.min(5, i - 1);
    if (salto > 0.02 && salto > 2.5 * antes) out.add(i);
  }
  out.add(parecidos.length - 1);
  return [...out].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- simetría
/** Dónde está el plano del medio (en x, en celdas) y la mitad derecha del volumen (x >= medio). */
export function mitad(solido, nx, ny, nz) {
  let x0 = Infinity, x1 = -Infinity;
  for (let v = 0; v < solido.length; v++) if (solido[v]) { const x = v % nx; x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); }
  const medio = (x0 + x1) / 2, media = new Uint8Array(solido.length);
  for (let v = 0; v < solido.length; v++) if (solido[v] && v % nx + 0.5 >= medio) media[v] = 1;
  return { medio, media };
}
/**
 * Copia espejada de las cajas de una mitad. Las cajas derechas (sin giro en x) que llegan al medio se juntan con su copia en una
 * sola caja (el torso, la cabeza); las demás se duplican del otro lado.
 */
export function espejar(cajas, medio) {
  const out = [];
  for (const b of cajas) {
    const ix = b.R.findIndex((r) => Math.abs(r[0]) > 0.999);   // un eje de la caja va justo en x
    if (ix >= 0) {
      const x0 = b.c[0] - b.h[ix], x1 = b.c[0] + b.h[ix];
      if (x0 <= medio + 0.75) {   // llega al medio: una sola caja centrada
        const h = b.h.slice(); h[ix] = Math.max(0.5, x1 - medio);
        out.push({ c: [medio, b.c[1], b.c[2]], R: b.R.map((r) => r.slice()), h });
        continue;
      }
    }
    out.push({ c: b.c.slice(), R: b.R.map((r) => r.slice()), h: b.h.slice() });
    out.push({ c: [2 * medio - b.c[0], b.c[1], b.c[2]], R: b.R.map((r, i) => (i === 0 ? [r[0], -r[1], -r[2]] : [-r[0], r[1], r[2]])), h: b.h.slice() });
  }
  return out;
}
/** Qué tanto se parecen unas cajas al volumen entero (0 a 1). */
export function parecidoDe(solido, nx, ny, nz, cajas) {
  const a = new Ajuste(solido, nx, ny, nz);
  for (const b of cajas) { const c = { c: b.c, R: b.R, h: b.h }; c.cel = a.celdas(c); a._poner(c, 1); }
  return a.parecido;
}
