// De las cajas giradas del ajuste (en celdas de la grilla) a cubos de Blockbench/BBS en píxeles, con su textura: cada píxel de
// cada cara toma el color del modelo que tiene justo debajo (se busca hacia adentro desde la cara).
import { empacar } from './cajas.js';
import { red } from './bbmodel.js';

const D = 180 / Math.PI;
// las 6 caras en el marco de la caja (medias medidas h): la esquina de arriba a la izquierda de su imagen, hacia dónde crecen u y v,
// la normal y qué ejes miden el ancho y el alto (la misma orientación que las caras derechas: ver CARAS en cajas.js)
const CARAS_L = {
  north: { esq: (h) => [h[0], h[1], -h[2]], U: [-1, 0, 0], V: [0, -1, 0], n: [0, 0, -1], ej: [0, 1] },
  south: { esq: (h) => [-h[0], h[1], h[2]], U: [1, 0, 0], V: [0, -1, 0], n: [0, 0, 1], ej: [0, 1] },
  east: { esq: (h) => [h[0], h[1], h[2]], U: [0, 0, -1], V: [0, -1, 0], n: [1, 0, 0], ej: [2, 1] },
  west: { esq: (h) => [-h[0], h[1], -h[2]], U: [0, 0, 1], V: [0, -1, 0], n: [-1, 0, 0], ej: [2, 1] },
  up: { esq: (h) => [-h[0], h[1], -h[2]], U: [1, 0, 0], V: [0, 0, 1], n: [0, 1, 0], ej: [0, 2] },
  down: { esq: (h) => [-h[0], -h[1], h[2]], U: [1, 0, 0], V: [0, 0, -1], n: [0, -1, 0], ej: [0, 2] },
};
export { CARAS_L };

// matriz (columnas = ejes de la caja) -> ángulos Rz·Ry·Rx (como el rotate de Blockbench y BBS)
function euler(M) {   // M[fila][col]
  const b = Math.asin(Math.max(-1, Math.min(1, -M[2][0])));
  let a, c;
  if (Math.abs(M[2][0]) < 0.9999) { a = Math.atan2(M[2][1], M[2][2]); c = Math.atan2(M[1][0], M[0][0]); }
  else { a = Math.atan2(-M[1][2], M[1][1]); c = 0; }
  return [a, b, c];
}
// de las 24 maneras de nombrar los ejes de una caja (es la misma caja), la de giros más chicos: más cómoda para editar
function mejorOrientacion(R, h) {
  let mejor = null;
  for (const p of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) for (let sg = 0; sg < 8; sg++) {
    const ej = p.map((i, k) => R[i].map((x) => x * ((sg >> k) & 1 ? -1 : 1)));
    const det = ej[0][0] * (ej[1][1] * ej[2][2] - ej[1][2] * ej[2][1]) - ej[0][1] * (ej[1][0] * ej[2][2] - ej[1][2] * ej[2][0]) + ej[0][2] * (ej[1][0] * ej[2][1] - ej[1][1] * ej[2][0]);
    if (det < 0) continue;
    const M = [0, 1, 2].map((f) => [ej[0][f], ej[1][f], ej[2][f]]), ang = euler(M), costo = Math.abs(ang[0]) + Math.abs(ang[1]) + Math.abs(ang[2]);
    if (!mejor || costo < mejor.costo - 1e-9) mejor = { costo, M, ang, h: p.map((i) => h[i]) };
  }
  return mejor;
}

/**
 * cajas: [{ c, R, h }] en celdas; g: la grilla de voxelizar (para los colores); solido: el volumen; altoPx: alto del modelo.
 * Devuelve { cubos (para armarBBModel/armarBBS), ancho, alto, rgba, px }.
 */
export function cubosGirados(cajas, g, solido, altoPx) {
  const { nx, ny, nz, parte } = g, px = altoPx / (ny - 2);
  // el marco: parado en el piso y centrado (lo ocupado)
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity;
  for (let v = 0; v < solido.length; v++) if (solido[v]) { const x = v % nx, z = Math.floor(v / nx) % nz, y = Math.floor(v / (nx * nz)); x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); z0 = Math.min(z0, z); z1 = Math.max(z1, z + 1); y0 = Math.min(y0, y); }
  const base = [(x0 + x1) / 2, y0, (z0 + z1) / 2];
  const cajasP = cajas.map((b) => {
    const o = mejorOrientacion(b.R, b.h);
    return { M: o.M, h: o.h, hp: o.h.map((x) => x * px), c: b.c, cp: [0, 1, 2].map((i) => (b.c[i] - base[i]) * px), ang: o.ang };
  });
  const local = (b, l) => [0, 1, 2].map((f) => b.c[f] + b.M[f][0] * l[0] + b.M[f][1] * l[1] + b.M[f][2] * l[2]);   // marco de la caja (celdas) -> grilla
  const adentro = (b, p) => { for (let i = 0; i < 3; i++) { const d = (p[0] - b.c[0]) * b.M[0][i] + (p[1] - b.c[1]) * b.M[1][i] + (p[2] - b.c[2]) * b.M[2][i]; if (Math.abs(d) > b.h[i]) return false; } return true; };
  const celda = (p) => { const x = Math.floor(p[0]), y = Math.floor(p[1]), z = Math.floor(p[2]); return x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? -1 : (y * nz + z) * nx + x; };
  const ladoDe = (n) => { const a = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])], i = a.indexOf(Math.max(...a)); return i === 0 ? (n[0] > 0 ? 0 : 1) : i === 1 ? (n[1] > 0 ? 2 : 3) : (n[2] > 0 ? 4 : 5); };
  const colorEn = (p, n, fondo) => {
    // desde un poco afuera de la cara hacia adentro: la primera celda del modelo
    for (let t = 2; t >= -fondo; t -= 0.5) {
      const v = celda([p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t]);
      if (v >= 0 && parte[v] >= 0) return g.colorLado(v, ladoDe(n));
    }
    return null;
  };
  // cada cara: tamaño en píxeles de textura, si se ve y sus colores
  const pedidos = [];
  cajasP.forEach((b, k) => {
    for (const [nombre, f] of Object.entries(CARAS_L)) {
      const W = Math.max(1, Math.round(2 * b.hp[f.ej[0]])), H = Math.max(1, Math.round(2 * b.hp[f.ej[1]]));
      const nW = [0, 1, 2].map((r) => b.M[r][0] * f.n[0] + b.M[r][1] * f.n[1] + b.M[r][2] * f.n[2]);
      const esq = f.esq(b.h), du = 2 * b.h[f.ej[0]] / W, dv = 2 * b.h[f.ej[1]] / H, fondo = Math.min(8, 2 * b.h[f.n.findIndex((x) => x)] + 1);
      const cols = new Array(W * H); let ve = false;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const l = [0, 1, 2].map((a) => esq[a] + f.U[a] * (i + 0.5) * du + f.V[a] * (j + 0.5) * dv), p = local(b, l);
        // ¿esta parte de la cara queda tapada por otra caja?
        const afuera = [p[0] + nW[0] * 0.3, p[1] + nW[1] * 0.3, p[2] + nW[2] * 0.3];
        if (!cajasP.some((o, q) => q !== k && adentro(o, afuera))) ve = true;
        cols[j * W + i] = colorEn(p, nW, fondo);
      }
      if (!ve) continue;
      // los píxeles sin color: el promedio de los que sí tienen (o gris)
      let s = [0, 0, 0], n = 0; for (const c of cols) if (c) { s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++; }
      const prom = n ? s.map((x) => x / n) : [128, 128, 128];
      const pd = { k, nombre, w: W, h: H, cols: cols.map((c) => c || prom) };
      pedidos.push(pd);
    }
  });
  const { ancho, alto } = empacar(pedidos);
  const rgba = new Uint8ClampedArray(ancho * alto * 4);
  for (const p of pedidos) for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
    const c = p.cols[j * p.w + i], o = ((p.v + j) * ancho + p.u + i) * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
  }
  const cubos = cajasP.map((b, k) => {
    const uvs = {};
    for (const nombre of Object.keys(CARAS_L)) { const p = pedidos.find((q) => q.k === k && q.nombre === nombre); uvs[nombre] = p ? [p.u, p.v, p.u + p.w, p.v + p.h] : null; }
    return { parte: 0, from: b.cp.map((x, i) => red(x - b.hp[i])), to: b.cp.map((x, i) => red(x + b.hp[i])), origin: b.cp.map(red), rotation: b.ang.map((a) => red(a * D)), uvs, M: b.M };
  });
  return { cubos, ancho, alto, rgba, px };
}
