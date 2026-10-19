// Boca de "pixeles flexibles": copia la forma REAL de la boca del video (abierta, torcida, en trompa, sonrisa, muecas)
// en una grilla de pixeles chiquitos dentro del espacio de la boca de la skin (6 de ancho x 2 de alto en la boca de
// hombre, 6 x 1 en la de mujer). Cada pixel de la cara se parte en k x k pedacitos (k = 1, 2 o 4).
//
// El modelo (boca_pixel_Man_x2, boca_pixel_Woman_x4, ...) no cambia de textura: en cada fila de pedacitos tiene piezas
// de un color (hueco oscuro, dientes, labio) que se corren (t.x) y se estiran (s.x) de a pedacitos enteros. Para el que
// mira parece un cambio de textura, siempre encajado en la grilla.
import * as M from './mat.js';
import { F, I } from './bbsdat.js';

export const TICKS = 20;
const SUP = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];   // labio de arriba, por dentro (de izquierda a derecha)
const INF = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];   // labio de abajo, por dentro
const POLY = [...SUP, ...INF.slice(1, -1).reverse()];               // la abertura de la boca
// puntos de la malla de MediaPipe que se guardan por cuadro (cara.labios = N x 25 x [x, y])
export const PUNTOS_LABIOS = [...new Set([...SUP, ...INF, 61, 291, 33, 263, 1])];
const P = Object.fromEntries(PUNTOS_LABIOS.map((k, i) => [k, i]));

export const HUECO = 1, DIENTE = 2, LENGUA = 3, LABIO = 4;
export const COLORES = { 1: [0, 0, 0], 2: [196, 188, 172], 3: [200, 70, 90], 4: [204, 134, 67] };
// piezas por fila: el hueco va atras (cubre tambien donde estan los dientes), los dientes adelante, el labio mas adelante
export const PIEZAS = [
  { tipo: 'hueco', valores: [HUECO, DIENTE], cant: 2, z: 0.01, u: 0 },
  { tipo: 'diente', valores: [DIENTE], cant: 2, z: 0.015, u: 1 },
  { tipo: 'labio', valores: [LABIO], cant: 3, z: 0.02, u: 3 },
];
const LETRAS = 'abc';
export const COLS = 6;   // ancho de la boca en pixeles de la cara (columnas 1 a 6 de la cara)

// ---------------------------------------------------------------- que boca tiene el actor
// Se reconoce por el nombre del modelo: boca_pixel_Man_x2, boca_pixel_Woman_x4, ... (sin _xN = x1)
export function describir(nombre) {
  const m = String(nombre || '');
  const k = Number((/_x([124])\b/i.exec(m) || [])[1] || 1);
  const mujer = /woman|mujer/i.test(m);
  return { k, filas: mujer ? 1 : 2, labios: !mujer, modelo: `boca_pixel_${mujer ? 'Woman' : 'Man'}_x${k}` };
}
export function partePixel(rep) {
  const partes = (rep.form && rep.form.parts) || [];
  for (let idx = 0; idx < partes.length; idx++) {
    const m = String((partes[idx].form || {}).model || '');
    if (/boca|mouth/i.test(m) && /pixel/i.test(m)) return { idx, nombreModelo: m, ...describir(m) };
  }
  return null;
}
export const nombresHuesos = (k, filas) => {
  const out = [];
  for (let r = 0; r < filas * k; r++) for (const p of PIEZAS) for (let j = 0; j < p.cant; j++) out.push(`${p.tipo}${r}${LETRAS[j]}`);
  return out;
};

// ---------------------------------------------------------------- geometria
const mediana = (a) => (a.length ? M.median(a) : 0);
function percentil(a, q) {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return 0;
  const p = (s.length - 1) * q, i = Math.floor(p);
  return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i);
}
function colBs(cara, ...nombres) {
  const idx = nombres.map((n) => cara.nombres.indexOf(n)).filter((k) => k >= 0);
  if (!idx.length) return cara.bs.map(() => 0);
  return cara.bs.map((fila) => idx.reduce((s, k) => s + fila[k], 0) / idx.length);
}
// marco de la cara en un cuadro: x = de ojo a ojo, y = hacia abajo, origen en la nariz, 1 = distancia entre los ojos
function marco(L, asp) {
  const p = (k) => [L[P[k]][0] * asp, L[P[k]][1]];
  const a = p(33), b = p(263), o = p(1);
  const ex = [b[0] - a[0], b[1] - a[1]], D = Math.hypot(ex[0], ex[1]) || 1e-6;
  const ux = [ex[0] / D, ex[1] / D], uy = [-ux[1], ux[0]];
  return (k) => { const q = p(k); const d = [q[0] - o[0], q[1] - o[1]]; return [(d[0] * ux[0] + d[1] * ux[1]) / D, (d[0] * uy[0] + d[1] * uy[1]) / D]; };
}
function adentro(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// altura de una cadena de puntos (ordenada por x) en x; afuera de los extremos, la del extremo
function alturaEn(cadena, x) {
  if (x <= cadena[0][0]) return cadena[0][1];
  for (let i = 1; i < cadena.length; i++) {
    if (x <= cadena[i][0]) {
      const [x0, y0] = cadena[i - 1], [x1, y1] = cadena[i];
      return x1 - x0 < 1e-9 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return cadena[cadena.length - 1][1];
}

// Tu boca en reposo (cuadros con los labios juntos): centro, ancho y altura de la linea de los labios.
export function calibrar(cara) {
  if (!cara.labios || !cara.labios.length) throw new Error('El analisis de la cara es viejo y no tiene los labios: hay que analizar el video de nuevo.');
  const asp = cara.aspecto || 1, N = cara.labios.length;
  const ok = cara.ok.map(Boolean);
  const locs = cara.labios.map((L) => marco(L, asp));
  const abre = locs.map((loc) => { const a = loc(13), b = loc(14); return Math.hypot(a[0] - b[0], a[1] - b[1]); });
  const lim = percentil(abre.filter((_, i) => ok[i]), 0.3);
  const quietos = [];
  for (let i = 0; i < N; i++) if (ok[i] && abre[i] <= lim) quietos.push(i);
  if (quietos.length < 3) throw new Error('No se vio la cara con la boca cerrada: hace falta un momento con la boca quieta.');
  const c = quietos.map((i) => { const a = locs[i](61), b = locs[i](291); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1])]; });
  const linea = mediana(quietos.map((i) => (locs[i](13)[1] + locs[i](14)[1]) / 2));
  const PUCK = colBs(cara, 'mouthPucker'), FUN = colBs(cara, 'mouthFunnel');
  return {
    locs, ok, centro: [mediana(c.map((v) => v[0])), mediana(c.map((v) => v[1]))], ancho0: mediana(c.map((v) => v[2])), linea,
    JAW: colBs(cara, 'jawOpen'), SMILE: colBs(cara, 'mouthSmileLeft', 'mouthSmileRight'), PUCK, FUN,
    puck0: mediana(quietos.map((i) => PUCK[i])), fun0: mediana(quietos.map((i) => FUN[i])),
  };
}

// boca cerrada en reposo: 4 pixeles de labio en la fila de arriba (columnas 2 a 5 de la cara)
export function reposo({ k, filas, labios }) {
  const C = COLS * k, g = new Uint8Array(filas * k * C);
  if (labios) for (let r = 0; r < k; r++) for (let c = k; c < 5 * k; c++) g[r * C + c] = LABIO;
  return g;
}

/** Grilla de un cuadro: Uint8Array de (filas*k) x (COLS*k), fila por fila. 0 = piel. null si no se vio la cara. */
export function grilla(cal, i, { k = 2, filas = 2, labios = true, sens = 1 } = {}) {
  if (!cal.ok[i]) return null;
  const R = filas * k, C = COLS * k, g = new Uint8Array(R * C);
  const loc = cal.locs[i];
  const px = cal.ancho0 / 4, pv = ((px * 0.7) / sens) * (filas === 1 ? 1.6 : 1);   // la boca de mujer tiene 1 sola fila
  const w = px / k, x0 = cal.centro[0] - (COLS / 2) * px;
  let h = pv / k, Y0 = cal.linea - pv / 2;
  const poly = POLY.map(loc);
  const ordenar = (c) => c.map(loc).sort((a, b) => a[0] - b[0]);
  const sup = ordenar(SUP), inf = ordenar(INF);
  const ci = loc(61), cd = loc(291);
  const trompa = cal.PUCK[i] - cal.puck0 > 0.35 || cal.FUN[i] - cal.fun0 > 0.35;
  const T = pv * (trompa ? 1.5 : 1);
  const xc = (c) => x0 + (c + 0.5) * w;
  // columnas con labio (de comisura a comisura); siempre al menos 2 pixeles de la cara
  const tramo = new Array(C).fill(false);
  const xl = Math.min(ci[0], cd[0]) - 0.15 * w, xr = Math.max(ci[0], cd[0]) + 0.15 * w;
  for (let c = 0; c < C; c++) tramo[c] = xc(c) >= xl && xc(c) <= xr;
  if (tramo.filter(Boolean).length < 2 * k) {
    const mid = (ci[0] + cd[0]) / 2;
    let m = 0; for (let c = 1; c < C; c++) if (Math.abs(xc(c) - mid) < Math.abs(xc(m) - mid)) m = c;
    tramo.fill(false); for (let c = Math.max(0, m - k); c < Math.min(C, m + k); c++) tramo[c] = true;
  }
  // si la boca no entra en el espacio (sonrisa, labio levantado, boca muy abierta) se acomoda para que se vean los dos labios:
  // primero se corre la grilla (de a pedacitos enteros) y, si aun asi la boca es mas alta que el espacio, se achica el alto de cada pedacito
  let tope = Infinity, fondo = -Infinity;
  for (let c = 0; c < C; c++) {
    if (!tramo[c]) continue;
    const yu = alturaEn(sup, xc(c)), yl = alturaEn(inf, xc(c)), abierta = yl - yu > h * 0.5;
    tope = Math.min(tope, abierta ? (labios ? yu - T / 2 : yu) : labios ? (yu + yl) / 2 - T / 2 : Infinity);
    fondo = Math.max(fondo, abierta ? (labios ? yl + T / 2 : yl) : labios ? (yu + yl) / 2 + T / 2 : -Infinity);
  }
  if (tope < Infinity) {
    const alto = R * h;
    if (fondo - tope > alto) { h = (fondo - tope) / R; Y0 = tope; }
    else if (tope < Y0 - h / 2) Y0 -= Math.ceil((Y0 - tope) / h - 0.5) * h;   // menos de medio pedacito: no se mueve
    else if (fondo > Y0 + alto + h / 2) Y0 -= Math.ceil((fondo - Y0 - alto) / h - 0.5) * h;
  }
  // abertura: pedacito con al menos 35 % adentro de la boca
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      let n = 0;
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        if (adentro(poly, x0 + (c + (a + 0.5) / 4) * w, Y0 + (r + (b + 0.5) / 4) * h)) n++;
      }
      if (n >= 6) g[r * C + c] = HUECO;
    }
  }
  // labios
  if (labios) {
    const nb = Math.max(1, Math.round(T / 2 / h));
    // el hueco no baja hasta la ultima fila: ahi va el labio de abajo (si no, la boca abierta queda cortada sin labio inferior)
    for (let c = 0; c < C; c++) for (let r = Math.max(0, R - 1 - nb) + 1; r < R; r++) if (g[r * C + c] === HUECO) g[r * C + c] = 0;
    for (let c = 0; c < C; c++) {
      if (!tramo[c]) continue;
      let rt = -1, rb = -1;
      for (let r = 0; r < R; r++) if (g[r * C + c] === HUECO) { if (rt < 0) rt = r; rb = r; }
      if (rt < 0) {
        const y0 = (alturaEn(sup, xc(c)) + alturaEn(inf, xc(c))) / 2;
        for (let r = 0; r < R; r++) if (Math.abs(Y0 + (r + 0.5) * h - y0) < T / 2) g[r * C + c] = LABIO;
      } else {
        for (let r = rt - nb; r < rt; r++) if (r >= 0 && !g[r * C + c]) g[r * C + c] = LABIO;
        for (let r = rb + 1; r <= rb + nb; r++) if (r < R && !g[r * C + c]) g[r * C + c] = LABIO;
      }
    }
    // labio en las puntas de la abertura (comisuras)
    for (let r = 0; r < R; r++) {
      let a = -1, b = -1;
      for (let c = 0; c < C; c++) if (g[r * C + c] === HUECO) { if (a < 0) a = c; b = c; }
      if (a < 0) continue;
      for (const c of [a - 1, b + 1]) if (c >= 0 && c < C && !g[r * C + c] && tramo[c]) g[r * C + c] = LABIO;
    }
  }
  // dientes: apagados, solo los de arriba y en el medio de la abertura
  const apretados = cal.JAW[i] < 0.12, sonrisa = cal.SMILE[i] > 0.6;
  if (apretados || sonrisa) {
    const g0 = g.slice();
    for (let c = 1; c < C - 1; c++) {
      let rt = -1, rb = -1;
      for (let r = 0; r < R; r++) if (g[r * C + c] === HUECO) { if (rt < 0) rt = r; rb = r; }
      if (rt < 0 || g0[rt * C + c - 1] !== HUECO || g0[rt * C + c + 1] !== HUECO) continue;
      let ancho = 0; for (let cc = 0; cc < C; cc++) if (g0[rt * C + cc] === HUECO) ancho++;
      if (ancho < Math.max(3, 1.5 * k)) continue;
      const nt = apretados ? Math.ceil((rb - rt + 1) / 2) : Math.max(1, Math.round((0.3 * pv) / h));
      for (let r = rt; r < Math.min(rb + 1, rt + nt); r++) g[r * C + c] = DIENTE;
    }
  }
  return g;
}

// ---------------------------------------------------------------- en el tiempo
/** Grillas de toda la toma, ya filtradas: [{tick, g}] (pasos secos, cada uno dura al menos minTicks). */
export function tramos(cara, cal, op, { offset = 0, minTicks = 2 } = {}) {
  const N = cal.ok.length, base = reposo(op);
  let ult = base;
  const crudo = [];
  for (let i = 0; i < N; i++) { const g = grilla(cal, i, op); if (g) ult = g; crudo.push(ult); }
  // cada pedacito: mayoria de 3 cuadros (saca temblequeos de un cuadro)
  const suave = crudo.map((g, i) => {
    const a = crudo[Math.max(0, i - 1)], c = crudo[Math.min(N - 1, i + 1)];
    return g.map((v, j) => (a[j] === c[j] ? a[j] : v));
  });
  const clave = (g) => g.join('');
  let lst = [];
  for (let i = 0; i < N; i++) {
    const tk = M.roundHalfEven(Math.max(0, cara.times[i] - offset) * TICKS);
    const kk = clave(suave[i]);
    const u = lst[lst.length - 1];
    if (u && u.k === kk) continue;
    if (u && u.tick === tk) { u.k = kk; u.g = suave[i]; } else lst.push({ tick: tk, k: kk, g: suave[i] });
  }
  // pasos demasiado cortos: se quedan con el anterior
  const fin = M.roundHalfEven(Math.max(0, cara.times[N - 1] - offset) * TICKS) + 1;
  const out = [];
  for (let j = 0; j < lst.length; j++) {
    const dur = (j + 1 < lst.length ? lst[j + 1].tick : fin) - lst[j].tick;
    if (out.length && (dur < minTicks || out[out.length - 1].k === lst[j].k)) continue;
    out.push(lst[j]);
  }
  return out.map(({ tick, g }) => ({ tick, g }));
}

// ---------------------------------------------------------------- de grilla a piezas
// tramos seguidos de un valor en una fila: [[c0, largo], ...]; si hay mas que piezas, se juntan los mas cercanos
function tirasDe(fila, valores, cant) {
  let t = [];
  for (let c = 0; c < fila.length; c++) {
    if (!valores.includes(fila[c])) continue;
    const u = t[t.length - 1];
    if (u && u[0] + u[1] === c) u[1]++; else t.push([c, 1]);
  }
  while (t.length > cant) {
    let m = 0;
    for (let j = 1; j < t.length - 1; j++) if (t[j + 1][0] - (t[j][0] + t[j][1]) < t[m + 1][0] - (t[m][0] + t[m][1])) m = j;
    t.splice(m, 2, [t[m][0], t[m + 1][0] + t[m + 1][1] - t[m][0]]);
  }
  return t;
}
/** Grilla -> {hueso: [desde, largo] o null}. */
export function piezas(g, { k, filas }) {
  const C = COLS * k, out = {};
  for (let r = 0; r < filas * k; r++) {
    const fila = g.slice(r * C, (r + 1) * C);
    for (const p of PIEZAS) {
      const t = tirasDe(fila, p.valores, p.cant);
      for (let j = 0; j < p.cant; j++) out[`${p.tipo}${r}${LETRAS[j]}`] = t[j] || null;
    }
  }
  return out;
}
/** Al reves (para la vista 3D y las pruebas): piezas -> grilla. */
export function dibujar(pz, { k, filas }) {
  const C = COLS * k, g = new Uint8Array(filas * k * C);
  for (const p of PIEZAS) {
    for (let r = 0; r < filas * k; r++) for (let j = 0; j < p.cant; j++) {
      const t = pz[`${p.tipo}${r}${LETRAS[j]}`];
      if (!t) continue;
      for (let c = t[0]; c < Math.min(C, t[0] + t[1]); c++) g[r * C + c] = p.tipo === 'hueco' ? HUECO : p.valores[0];
    }
  }
  return g;
}

// ---------------------------------------------------------------- pistas del film
const valor = (t, k) => (t ? { t: [t[0] / k, 0, 0], s: [t[1], 1, 1] } : { t: [0, 0, 0], s: [0, 0, 0] });

/**
 * cara: analisis de la cara (con .labios); parte: de partePixel(). Devuelve { pistas, resumen, pasos }.
 * op: boca_sens (0.5..2), boca_min_ticks.
 */
export function construir(cara, parte, offset = 0, desde = 0, op = {}) {
  const forma = { k: parte.k, filas: parte.filas, labios: parte.labios, sens: op.boca_sens ?? 1 };
  const cal = calibrar(cara);
  const pasos = tramos(cara, cal, forma, { offset, minTicks: op.boca_min_ticks ?? 2 });
  const pistas = {}, ultimo = {};
  for (const { tick, g } of pasos) {
    const pz = piezas(g, forma);
    for (const [b, t] of Object.entries(pz)) {
      if (!forma.labios && b.startsWith('labio')) continue;
      const v = valor(t, forma.k), kk = JSON.stringify(v);
      if (ultimo[b] === kk) continue;
      ultimo[b] = kk;
      const key = `${parte.idx}/pose/${b}`;
      if (!pistas[key]) pistas[key] = { keyframes: [], type: 'pose_transform' };
      pistas[key].keyframes.push({
        interp: 'constant', tick: F(tick + desde),
        value: { r: [F(0), F(0), F(0)], s: v.s.map((x) => F(x)), t: v.t.map((x) => F(x)), fix: F(0.0), color: I(-1), lighting: F(0.0) },
      });
    }
  }
  const dur = cara.times[cara.times.length - 1] - offset;
  const resumen = {
    modelo: forma.k > 1 ? `${parte.nombreModelo} (x${forma.k})` : parte.nombreModelo, cambios: pasos.length - 1,
    keyframes: Object.values(pistas).reduce((s, p) => s + p.keyframes.length, 0), duracion: dur,
    cara_vista: cal.ok.filter(Boolean).length / cal.ok.length, formas: {},
  };
  return { pistas, resumen, pasos };
}

// ---------------------------------------------------------------- el modelo para BBS
/** face.bbs.json y poses.json del modelo de boca (k = 1, 2 o 4). La textura es de 16x16: ver texturaRGBA(). */
export function modeloBBS({ k, filas, labios }) {
  const groups = { head: { origin: [0, 0, 0], cubes: [] } };
  const arriba = filas === 2 ? 2 : 1;   // borde de arriba de la boca: fila 6 de la cara (hombre) o fila 7 (mujer)
  const d = 1 / k, R = (x) => Math.round(x * 1e4) / 1e4;
  for (let r = 0; r < filas * k; r++) {
    const y = arriba - r * d;
    for (const p of PIEZAS) {
      if (p.tipo === 'labio' && !labios) continue;
      for (let j = 0; j < p.cant; j++) {
        const z = R(-4 - p.z);
        groups[`${p.tipo}${r}${LETRAS[j]}`] = {
          origin: [3, R(y), z], parent: 'head',
          cubes: [{ origin: [3, R(y), z], from: [R(3 - d), R(y - d), z], size: [R(d), R(d), 0], uvs: { front: [p.u, 0, p.u + 1, 1] } }],
        };
      }
    }
  }
  const huesos = Object.keys(groups).filter((b) => b !== 'head');
  const pose = {};
  const g = reposo({ k, filas, labios }), pz = piezas(g, { k, filas });
  for (const b of huesos) {
    const v = valor(pz[b], k);
    pose[b] = { t: v.t, r: [0, 0, 0], s: v.s, fix: 0, color: -1, lighting: 0 };
  }
  return {
    modelo: { version: '0.7.2', animations: { standing: { groups: {}, duration: 0 } }, model: { groups, texture: [16, 16] } },
    poses: { cerrada: { pose } },
  };
}
export function texturaRGBA() {
  const px = new Uint8Array(16 * 16 * 4);
  for (const p of PIEZAS) { const c = COLORES[p.valores[0]]; px.set([...c, 255], p.u * 4); }
  px.set([...COLORES[LENGUA], 255], 2 * 4);
  return px;
}

// ---------------------------------------------------------------- en vivo (camara)
/** Calibra con cuadros sueltos de la camara: cuadros = [{labios, bs}] (labios como en cara.labios). */
export function calibrarVivo(cuadros, nombres, aspecto) {
  const cal = calibrar({ labios: cuadros.map((c) => c.labios), bs: cuadros.map((c) => c.bs), nombres, aspecto, ok: cuadros.map(() => true) });
  const { centro, ancho0, linea, puck0, fun0 } = cal;
  return { centro, ancho0, linea, puck0, fun0, nombres, aspecto };
}
/** Grilla de un cuadro de la camara, con la calibracion de calibrarVivo(). */
export function grillaVivo(base, labios, bs, op) {
  const c = { nombres: base.nombres, bs: [bs] };
  const cal = {
    ...base, locs: [marco(labios, base.aspecto)], ok: [true],
    JAW: colBs(c, 'jawOpen'), SMILE: colBs(c, 'mouthSmileLeft', 'mouthSmileRight'), PUCK: colBs(c, 'mouthPucker'), FUN: colBs(c, 'mouthFunnel'),
  };
  return grilla(cal, 0, op);
}
