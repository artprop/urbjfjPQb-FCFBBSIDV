// De malla a cubitos: la superficie del modelo se muestrea en una grilla (cada celda = un vóxel) y se le toma el color de la textura;
// después se rellena el interior de cada parte (lo que no se alcanza desde afuera). Es todo cuentas, sin IA entrenada.

/**
 * partes: de leerGLB (pos en el mundo, uv, idx). opciones:
 *   res: vóxeles de alto (el detalle); giro: 0/90/180/270 (grados, alrededor del eje vertical); rellenar: true/false;
 *   color(parte, i, u, v): [r,g,b] 0-255 (el color de la textura en esa UV; sin textura, el color liso).
 * Devuelve { nx, ny, nz, celda (tamaño de un vóxel en unidades del modelo), parte (Int16Array: -1 vacío), rgb (Uint8Array), tieneColor (Uint8Array) }.
 */
export function voxelizar(partes, { res = 64, giro = 0, rellenar = true, color = (p) => [200, 200, 200], visibles = null } = {}) {
  const usar = partes.map((p, i) => (visibles ? visibles[i] !== false : true));
  // giro alrededor de Y, y la caja de todo el modelo
  const c = Math.round(Math.cos(giro * Math.PI / 180)), s = Math.round(Math.sin(giro * Math.PI / 180));
  const rot = (x, z) => [c * x + s * z, -s * x + c * z];
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const posR = partes.map((p, i) => {
    const out = new Float32Array(p.pos.length);
    for (let k = 0; k < p.pos.length; k += 3) {
      const [x, z] = rot(p.pos[k], p.pos[k + 2]); out[k] = x; out[k + 1] = p.pos[k + 1]; out[k + 2] = z;
      if (!usar[i]) continue;
      for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], out[k + a]); mx[a] = Math.max(mx[a], out[k + a]); }
    }
    return out;
  });
  if (!isFinite(mn[0])) throw new Error('No hay ninguna parte para convertir.');
  const celda = (mx[1] - mn[1]) / res;
  const pad = 1;   // una celda vacía alrededor (para rellenar desde afuera)
  const nx = Math.ceil((mx[0] - mn[0]) / celda) + 2 * pad, ny = res + 2 * pad, nz = Math.ceil((mx[2] - mn[2]) / celda) + 2 * pad;
  const N = nx * ny * nz, P = partes.length;
  if (N > 4e6) throw new Error('Es demasiado detalle para ese tamaño: elegí un cubito más grande o un alto menor.');
  const votos = new Uint16Array(N * P), suma = new Float32Array(N * 3), cuenta = new Uint32Array(N);
  // color por lado: cada muestra suma en los lados hacia donde mira su triángulo (así el forro de adentro no mancha lo de afuera)
  const porLado = new Map();   // celda -> Float32Array(24): por cada lado (east, west, up, down, south, north) r, g, b, peso
  const id = (x, y, z) => (y * nz + z) * nx + x;
  const celdaDe = (v, a) => Math.min([nx, ny, nz][a] - 1 - pad, Math.max(pad, Math.floor((v - mn[a]) / celda) + pad));
  // muestreo de cada triángulo: puntos separados ~1/3 de celda, así no quedan huecos en la superficie
  for (let i = 0; i < P; i++) {
    if (!usar[i]) continue;
    const p = partes[i], pos = posR[i], uv = p.uv, idx = p.idx;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, d = idx[t + 2] * 3;
      const largo = Math.max(Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]),
        Math.hypot(pos[b] - pos[d], pos[b + 1] - pos[d + 1], pos[b + 2] - pos[d + 2]), Math.hypot(pos[d] - pos[a], pos[d + 1] - pos[a + 1], pos[d + 2] - pos[a + 2]));
      const k = Math.max(1, Math.ceil(largo / (celda / 3)));
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[d] - pos[a], vy = pos[d + 1] - pos[a + 1], vz = pos[d + 2] - pos[a + 2];
      let nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx; const nl = Math.hypot(nX, nY, nZ) || 1; nX /= nl; nY /= nl; nZ /= nl;
      const pesos = [nX, -nX, nY, -nY, nZ, -nZ].map((w) => (w > 0.15 ? w : 0));
      for (let q = 0; q <= k; q++) for (let r = 0; r <= k - q; r++) {
        // (con k = 1 son los 3 vértices; se agrega el centro para los triángulos chicos)
        let w1 = q / k, w2 = r / k;
        if (k === 1 && q === 0 && r === 0) { w1 = w2 = 1 / 3; }
        const w0 = 1 - w1 - w2;
        const X = w0 * pos[a] + w1 * pos[b] + w2 * pos[d], Y = w0 * pos[a + 1] + w1 * pos[b + 1] + w2 * pos[d + 1], Z = w0 * pos[a + 2] + w1 * pos[b + 2] + w2 * pos[d + 2];
        const v = id(celdaDe(X, 0), celdaDe(Y, 1), celdaDe(Z, 2));
        if (votos[v * P + i] < 65535) votos[v * P + i]++;
        let col;
        if (uv) {
          const ia = idx[t] * 2, ib = idx[t + 1] * 2, id_ = idx[t + 2] * 2;
          col = color(p, i, w0 * uv[ia] + w1 * uv[ib] + w2 * uv[id_], w0 * uv[ia + 1] + w1 * uv[ib + 1] + w2 * uv[id_ + 1]);
        } else col = color(p, i, 0, 0);
        if (col) {
          suma[v * 3] += col[0]; suma[v * 3 + 1] += col[1]; suma[v * 3 + 2] += col[2]; cuenta[v]++;
          let L = porLado.get(v); if (!L) porLado.set(v, (L = new Float32Array(24)));
          for (let l = 0; l < 6; l++) { const w = pesos[l]; if (w) { L[l * 4] += col[0] * w; L[l * 4 + 1] += col[1] * w; L[l * 4 + 2] += col[2] * w; L[l * 4 + 3] += w; } }
        }
      }
    }
  }
  // cada celda es de la parte que más la tocó
  const parte = new Int16Array(N).fill(-1);
  for (let v = 0; v < N; v++) {
    let mejor = -1, m = 0;
    for (let i = 0; i < P; i++) if (votos[v * P + i] > m) { m = votos[v * P + i]; mejor = i; }
    parte[v] = mejor;
  }
  const rgb = new Uint8Array(N * 3), tieneColor = new Uint8Array(N);
  for (let v = 0; v < N; v++) if (cuenta[v]) { tieneColor[v] = 1; for (let a = 0; a < 3; a++) rgb[v * 3 + a] = Math.round(suma[v * 3 + a] / cuenta[v]); }
  // relleno: por cada parte, lo que no se alcanza desde afuera sin cruzar su cáscara es su interior
  if (rellenar) {
    const afuera = new Uint8Array(N), cola = new Int32Array(N);
    for (let i = 0; i < P; i++) {
      if (!usar[i]) continue;
      afuera.fill(0); let ini = 0, fin = 0;
      afuera[0] = 1; cola[fin++] = 0;
      while (ini < fin) {
        const v = cola[ini++], x = v % nx, z = Math.floor(v / nx) % nz, y = Math.floor(v / (nx * nz));
        const vec = [x > 0 && v - 1, x < nx - 1 && v + 1, z > 0 && v - nx, z < nz - 1 && v + nx, y > 0 && v - nx * nz, y < ny - 1 && v + nx * nz];
        for (const w of vec) if (w !== false && !afuera[w] && parte[w] !== i) { afuera[w] = 1; cola[fin++] = w; }
      }
      for (let v = 0; v < N; v++) if (!afuera[v] && parte[v] === -1) parte[v] = i;
    }
  }
  // color para las celdas sin muestras (el interior): el de las vecinas, de a capas
  let pend = [];
  for (let v = 0; v < N; v++) if (parte[v] >= 0 && !tieneColor[v]) pend.push(v);
  for (let vuelta = 0; pend.length && vuelta < 200; vuelta++) {
    const listos = [], resto = [];
    for (const v of pend) {
      const x = v % nx, z = Math.floor(v / nx) % nz, y = Math.floor(v / (nx * nz));
      let r = 0, g = 0, b = 0, n = 0;
      for (const w of [x > 0 && v - 1, x < nx - 1 && v + 1, z > 0 && v - nx, z < nz - 1 && v + nx, y > 0 && v - nx * nz, y < ny - 1 && v + nx * nz]) {
        if (w !== false && tieneColor[w]) { r += rgb[w * 3]; g += rgb[w * 3 + 1]; b += rgb[w * 3 + 2]; n++; }
      }
      if (n) listos.push([v, r / n, g / n, b / n]); else resto.push(v);
    }
    for (const [v, r, g, b] of listos) { rgb[v * 3] = r; rgb[v * 3 + 1] = g; rgb[v * 3 + 2] = b; tieneColor[v] = 1; }
    pend = resto;
  }
  // el color de un lado de una celda (lado: 0 east +x, 1 west -x, 2 up +y, 3 down -y, 4 south +z, 5 north -z)
  const colorLado = (v, l) => {
    const L = porLado.get(v);
    if (L && L[l * 4 + 3] > 0) { const w = L[l * 4 + 3]; return [L[l * 4] / w, L[l * 4 + 1] / w, L[l * 4 + 2] / w]; }
    return [rgb[v * 3], rgb[v * 3 + 1], rgb[v * 3 + 2]];
  };
  return { nx, ny, nz, celda, origen: [mn[0] - pad * celda, mn[1] - pad * celda, mn[2] - pad * celda], parte, rgb, colorLado };
}

/**
 * Hacia dónde mira el personaje, para ponerlo de frente (-Z, «north» en Blockbench). Devuelve el giro (0/90/180/270).
 * Cuentas: los hombros marcan el ancho (el eje con más dispersión a la altura del pecho) y el frente es hacia donde se corren
 * las suelas (las puntas de los pies) y el ruedo de la ropa respecto de un poco más arriba. Si no sirve, se gira a mano.
 */
export function giroDeFrente(partes) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of partes) for (let k = 1; k < p.pos.length; k += 3) { y0 = Math.min(y0, p.pos[k]); y1 = Math.max(y1, p.pos[k]); }
  const H = y1 - y0 || 1;
  // ancho: dispersión en x y en z a la altura del pecho
  let n = 0, sx = 0, sz = 0, sxx = 0, szz = 0;
  for (const p of partes) for (let k = 0; k < p.pos.length; k += 3) {
    const t = (p.pos[k + 1] - y0) / H; if (t < 0.55 || t > 0.85) continue;
    const x = p.pos[k], z = p.pos[k + 2]; n++; sx += x; sz += z; sxx += x * x; szz += z * z;
  }
  if (!n) return 0;
  const vx = sxx / n - (sx / n) ** 2, vz = szz / n - (sz / n) ** 2;
  const eje = vx >= vz ? 2 : 0;   // el ancho va en x -> el frente está en z (y al revés)
  // frente: corrimiento de lo de más abajo de cada parte alta (suelas, ruedo) respecto de un poco más arriba
  let corr = 0;
  for (const p of partes) {
    let a = Infinity, b = -Infinity;
    for (let k = 1; k < p.pos.length; k += 3) { a = Math.min(a, p.pos[k]); b = Math.max(b, p.pos[k]); }
    const h = b - a; if (h < 0.4 * H) continue;
    let s1 = 0, n1 = 0, s2 = 0, n2 = 0;
    for (let k = 0; k < p.pos.length; k += 3) {
      const t = (p.pos[k + 1] - a) / h, v = p.pos[k + eje];
      if (t < 0.04) { s1 += v; n1++; } else if (t >= 0.06 && t < 0.14) { s2 += v; n2++; }
    }
    if (n1 && n2) corr += (s1 / n1 - s2 / n2) * Math.min(n1, n2);
  }
  if (eje === 2) return corr >= 0 ? 180 : 0;   // frente +z -> 180; frente -z -> 0
  return corr >= 0 ? 90 : 270;                 // frente +x -> 90; frente -x -> 270
}
