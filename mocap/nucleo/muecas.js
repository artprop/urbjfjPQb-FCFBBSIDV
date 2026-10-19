// Muecas de referencia: una lista de gestos de la boca (sonrisa, sorpresa, trompa, desprecio...), cada uno con
//  - una boca de pixeles lista para la boca "boca_pixel" (la misma grilla que dibuja boca_pixel.js: hueco, dientes, labios),
//  - los valores de blendshapes de MediaPipe que describen ese gesto (para reconocerlo en tu cara),
//  - un dibujo de referencia (se arma con los mismos parametros).
// Las bocas se pueden editar y se guardan en "presets" (ver cargarPresets / guardarPresets).
// La grilla base es la de x4 (24 x 8 pedacitos en la boca de hombre) y las de x2 y x1 se sacan de ahi, salvo que se hayan editado.
import { HUECO, DIENTE, LABIO, COLS } from './boca_pixel.js';

export const MAXK = 4;

// Parametros de cada boca, en pedacitos de la grilla x4 (24 columnas x 8 filas):
//  cm/W: centro y ancho de la boca; A: apertura (alto del hueco); pw: 2 = redonda ... 8 = cuadrada; curv: comisuras (negativo = suben, sonrisa);
//  incl: un lado mas alto que el otro (+ = derecha mas baja); lift: toda la boca baja o sube; tl: grosor de cada labio; dt/dl: filas de dientes de arriba/abajo
const base = (o) => ({ cm: 12, W: 16, A: 0, pw: 2, curv: 0, incl: 0, lift: 0, tl: 2, dt: 0, dl: 0, ...o });

// bs: gesto en blendshapes (todo lo no nombrado = 0). Claves: jaw, funnel, pucker, smileL, smileR, frown, press, stretch, shift (+ = a la izquierda de la persona),
// upper, lower, rollL, rollU, shrugL, shrugU, close, dimple, puff.
// Izquierda y derecha son las de la PERSONA (mouthLeft, mouthSmileLeft...): en la cara dibujada de frente, su izquierda cae a la derecha.
export const MUECAS = [
  { id: 'neutra', nombre: 'Neutra', p: base({}), bs: {} },
  { id: 'sonrisa', nombre: 'Sonrisa cerrada', p: base({ W: 20, curv: -2, lift: 0.5 }), bs: { smileL: 0.5, smileR: 0.5 } },
  { id: 'sonrisa_dientes', nombre: 'Sonrisa con dientes', p: base({ W: 20, A: 2, pw: 4, curv: -1.5, lift: 0.5, dt: 2 }), bs: { smileL: 0.6, smileR: 0.6, jaw: 0.1, upper: 0.3, lower: 0.2 } },
  { id: 'sonrisa_grande', nombre: 'Sonrisa grande', p: base({ W: 22, A: 3, pw: 3, curv: -2, lift: 0.5, dt: 2, dl: 1 }), bs: { smileL: 0.8, smileR: 0.8, jaw: 0.3, upper: 0.4, lower: 0.4 } },
  { id: 'risa', nombre: 'Risa', p: base({ W: 22, A: 5, pw: 3, curv: -2, lift: 0.5, tl: 1, dt: 2 }), bs: { smileL: 0.9, smileR: 0.9, jaw: 0.55, upper: 0.5, lower: 0.5, stretch: 0.3 } },
  { id: 'triste', nombre: 'Triste', p: base({ W: 14, curv: 2.5, lift: 0.5 }), bs: { frown: 0.6, shrugL: 0.3 } },
  { id: 'enojo', nombre: 'Enojo (dientes apretados)', p: base({ W: 20, A: 2, pw: 8, dt: 1, dl: 1 }), bs: { jaw: 0.05, upper: 0.5, lower: 0.5, stretch: 0.3 } },
  { id: 'asco', nombre: 'Asco', p: base({ W: 16, A: 1, pw: 4, curv: 1, dt: 1 }), bs: { upper: 0.7, frown: 0.3, jaw: 0.05 } },
  { id: 'desprecio_i', nombre: 'Desprecio (izquierda de la persona)', p: base({ W: 16, incl: -1.5, curv: -1.5, lift: 1 }), bs: { smileL: 0.6, dimple: 0.4 } },
  { id: 'desprecio_d', nombre: 'Desprecio (derecha de la persona)', p: base({ W: 16, incl: 1.5, curv: -1.5, lift: 1 }), bs: { smileR: 0.6, dimple: 0.4 } },
  { id: 'sorpresa', nombre: 'Sorpresa «O»', p: base({ W: 10, A: 4, pw: 2, tl: 2 }), bs: { jaw: 0.4, funnel: 0.6, pucker: 0.2 } },
  { id: 'a', nombre: 'Letra A (abierta)', p: base({ W: 16, A: 4, pw: 3, tl: 2 }), bs: { jaw: 0.6 } },
  { id: 'e', nombre: 'Letra E', p: base({ W: 18, A: 2, pw: 5, curv: -0.5, dt: 1 }), bs: { jaw: 0.25, stretch: 0.4, smileL: 0.2, smileR: 0.2 } },
  { id: 'i', nombre: 'Letra I (ancha y fina)', p: base({ W: 22, A: 1, pw: 6, dt: 1, dl: 0, curv: -0.5 }), bs: { jaw: 0.1, stretch: 0.6, smileL: 0.3, smileR: 0.3 } },
  { id: 'u', nombre: 'Letra U (trompa)', p: base({ W: 8, A: 2, pw: 2 }), bs: { funnel: 0.5, pucker: 0.6, jaw: 0.1 } },
  { id: 'beso', nombre: 'Beso', p: base({ W: 6, A: 0 }), bs: { pucker: 0.9, funnel: 0.1 } },
  { id: 'izquierda', nombre: 'Boca a la izquierda (de la persona)', p: base({ cm: 15, W: 14 }), bs: { shift: 0.7 } },
  { id: 'derecha', nombre: 'Boca a la derecha (de la persona)', p: base({ cm: 9, W: 14 }), bs: { shift: -0.7 } },
  { id: 'labio_arriba', nombre: 'Labio de arriba levantado', p: base({ W: 16, A: 2, pw: 5, lift: -1, tl: 1, dt: 2 }), bs: { upper: 0.8, jaw: 0.05 } },
  { id: 'apretada', nombre: 'Labios apretados', p: base({ W: 14, lift: 0.5, tl: 1 }), bs: { press: 0.8, close: 0.5 } },
  { id: 'fv', nombre: 'F / V (dientes sobre el labio)', p: base({ W: 16, A: 2, pw: 4, dt: 2, tl: 2 }), bs: { rollL: 0.7, upper: 0.3, jaw: 0.1 } },
  { id: 'sonrisa_lado_i', nombre: 'Sonrisa de lado (izquierda de la persona)', p: base({ W: 18, A: 1, incl: -2, curv: -1, lift: 0.5, dt: 1 }), bs: { shift: 0.4, smileL: 0.5, jaw: 0.05 } },
  { id: 'sonrisa_lado_d', nombre: 'Sonrisa de lado (derecha de la persona)', p: base({ W: 18, A: 1, incl: 2, curv: -1, lift: 0.5, dt: 1 }), bs: { shift: -0.4, smileR: 0.5, jaw: 0.05 } },
  { id: 'mejillas', nombre: 'Mejillas infladas', p: base({ W: 10, tl: 2 }), bs: { puff: 0.8, press: 0.3 } },
  { id: 'bostezo', nombre: 'Bostezo', p: base({ W: 14, A: 6, pw: 2, tl: 1 }), bs: { jaw: 1, funnel: 0.2 } },
];

// ---------------------------------------------------------------- grilla de una boca
const clampi = (v, a, b) => Math.min(Math.max(v, a), b);

/** Perfil de la boca en cada columna de la grilla x4: {u, yu (borde de arriba del hueco), yl (de abajo)} o null fuera de la boca. */
export function perfil(p, c) {
  const u = (c + 0.5 - p.cm) / (p.W / 2);
  if (Math.abs(u) >= 1) return null;
  const prof = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), p.pw)), 0.6);
  const A = p.A * prof;
  const yu = p.tl + p.lift + p.curv * u * u + p.incl * u;
  return { u, yu, yl: yu + A, A };
}

/** Grilla x4 de una boca: Uint8Array de 8 x 24 (hombre). */
export function grilla4(p) {
  const C = COLS * MAXK, R = 2 * MAXK, g = new Uint8Array(R * C);
  for (let c = 0; c < C; c++) {
    const q = perfil(p, c);
    if (!q) continue;
    const { yu, yl, A } = q;
    for (let r = 0; r < R; r++) {
      const y = r + 0.5;
      let v = 0;
      if (A >= 0.5) {
        if (y >= yu && y < yl) {
          v = HUECO;
          if (Math.abs(q.u) < 0.88) {
            if (p.dt && y < yu + Math.min(p.dt, A)) v = DIENTE;
            if (p.dl && y >= yl - Math.min(p.dl, A)) v = DIENTE;
          }
        } else if (y >= yu - p.tl && y < yu) v = LABIO;
        else if (y >= yl && y < yl + p.tl) v = LABIO;
      } else if (y >= yu - p.tl && y < yu + p.tl) v = LABIO;
      g[r * C + c] = v;
    }
  }
  return g;
}

/** De x4 a x2 o x1: en cada bloque gana lo que ocupa mas de la mitad (dientes y hueco cuentan juntos como "abertura"). */
export function bajar(g4, k) {
  if (k === MAXK) return Uint8Array.from(g4);
  const f = MAXK / k, C4 = COLS * MAXK, R4 = 2 * MAXK, C = COLS * k, R = 2 * k;
  const g = new Uint8Array(R * C);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const n = [0, 0, 0, 0, 0];
    for (let a = 0; a < f; a++) for (let b = 0; b < f; b++) n[g4[(r * f + a) * C4 + c * f + b]]++;
    const tot = f * f, abertura = n[HUECO] + n[DIENTE];
    let v = 0;
    if (abertura * 2 >= tot) v = n[DIENTE] > n[HUECO] ? DIENTE : HUECO;
    else if ((n[LABIO] + abertura) * 2 >= tot) v = n[LABIO] >= abertura ? LABIO : n[DIENTE] > n[HUECO] ? DIENTE : HUECO;
    g[r * C + c] = v;
  }
  void R4;
  return g;
}

/** Boca de mujer: una sola fila (la de arriba del mentón) y sin labios: solo hueco y dientes. */
export function aMujer(gHombre, k) {
  const C = COLS * k, g = new Uint8Array(k * C);
  // la abertura del hombre empieza debajo del labio de arriba; en la de mujer se cuenta desde la fila de arriba
  for (let c = 0; c < C; c++) {
    let alto = 0, diente = false;
    for (let r = 0; r < 2 * k; r++) { const v = gHombre[r * C + c]; if (v === HUECO || v === DIENTE) { alto++; if (v === DIENTE) diente = true; } }
    for (let r = 0; r < Math.min(alto, k); r++) g[r * C + c] = diente && r === 0 ? DIENTE : HUECO;
  }
  return g;
}

/** Grilla de una mueca en una escala: ed = grilla editada (string) o null. */
export function grillaDe(mueca, k, filas, ed) {
  if (ed && ed.length === filas * k * COLS * k) return Uint8Array.from(ed, (ch) => +ch);
  const g = bajar(grilla4(mueca.p), k);
  return filas === 1 ? aMujer(g, k) : g;
}
export const aTexto = (g) => Array.from(g).join('');

// ---------------------------------------------------------------- reconocer el gesto
// vector de rasgos de un cuadro (blendshapes de MediaPipe, ya sin tu cara en reposo)
export const RASGOS = ['jaw', 'funnel', 'pucker', 'smileL', 'smileR', 'frown', 'press', 'stretch', 'shift', 'upper', 'lower', 'rollL', 'rollU', 'shrugL', 'shrugU', 'close', 'dimple', 'puff'];
const PESO = { jaw: 2, funnel: 1.5, pucker: 1.5, smileL: 1.5, smileR: 1.5, frown: 1.5, press: 1, stretch: 1, shift: 2, upper: 1, lower: 0.7, rollL: 1, rollU: 0.7, shrugL: 0.6, shrugU: 0.6, close: 0.5, dimple: 0.6, puff: 1.5 };
const prom = (bs, nombres, ...n) => { let s = 0, c = 0; for (const x of n) { const k = nombres.indexOf(x); if (k >= 0) { s += bs[k]; c++; } } return c ? s / c : 0; };
export function rasgos(bs, nombres, base = null) {
  const v = (...n) => prom(bs, nombres, ...n) - (base ? prom(base, nombres, ...n) : 0);
  const pos = (x) => Math.max(0, x);
  return {
    jaw: pos(v('jawOpen')), funnel: pos(v('mouthFunnel')), pucker: pos(v('mouthPucker')),
    smileL: pos(v('mouthSmileLeft')), smileR: pos(v('mouthSmileRight')), frown: pos(v('mouthFrownLeft', 'mouthFrownRight')),
    press: pos(v('mouthPressLeft', 'mouthPressRight')), stretch: pos(v('mouthStretchLeft', 'mouthStretchRight')),
    shift: v('mouthLeft') - v('mouthRight'), upper: pos(v('mouthUpperUpLeft', 'mouthUpperUpRight')), lower: pos(v('mouthLowerDownLeft', 'mouthLowerDownRight')),
    rollL: pos(v('mouthRollLower')), rollU: pos(v('mouthRollUpper')), shrugL: pos(v('mouthShrugLower')), shrugU: pos(v('mouthShrugUpper')),
    close: pos(v('mouthClose')), dimple: pos(v('mouthDimpleLeft', 'mouthDimpleRight')), puff: pos(v('cheekPuff')),
  };
}
export function distancia(r, objetivo) {
  let d = 0;
  for (const k of RASGOS) { const e = (r[k] || 0) - (objetivo[k] || 0); d += PESO[k] * e * e; }
  return Math.sqrt(d);
}
/** La mueca que mas se parece al gesto r. lista = [{id, bs}]; actual = la que estaba (para no cambiar por poco). */
export function reconocer(r, lista, actual = null, margen = 0.08) {
  let mejor = null, dm = Infinity, da = Infinity;
  for (const m of lista) {
    const d = distancia(r, m.bs);
    if (d < dm) { dm = d; mejor = m; }
    if (actual && m.id === actual) da = d;
  }
  return actual && da - dm < margen ? actual : mejor && mejor.id;
}

// ---------------------------------------------------------------- presets (se guardan en el navegador)
const CLAVE = 'mocap_muecas_v1';
const vacio = () => ({ activo: 'Base', presets: { Base: { ed: {}, extra: [], fotos: {} } } });
export function cargarPresets(almacen = globalThis.localStorage) {
  try {
    const d = JSON.parse(almacen.getItem(CLAVE));
    if (d && d.presets && d.presets[d.activo]) return d;
  } catch { /* sin datos guardados */ }
  return vacio();
}
export function guardarPresets(d, almacen = globalThis.localStorage) {
  try { almacen.setItem(CLAVE, JSON.stringify(d)); return true; } catch { return false; }
}
/** Lista completa de muecas de un preset: las de fabrica + las que se agregaron. */
export const listaDe = (preset) => [...MUECAS, ...(preset.extra || [])];
export const claveEd = (id, k, filas) => `${id}|${k}|${filas}`;
/** Grilla de una mueca segun el preset, la escala y el sexo del modelo. */
export function grillaPreset(preset, mueca, k, filas) {
  const ed = preset.ed[claveEd(mueca.id, k, filas)];
  const m = mueca.p ? mueca : { ...mueca, p: (MUECAS.find((x) => x.id === mueca.base) || MUECAS[0]).p };
  return grillaDe(m, k, filas, ed);
}

/**
 * Para convertir una toma: devuelve gen(i) = la grilla de la mueca que mas se parece al gesto del cuadro i.
 * El "reposo" de la cara se toma de los cuadros con la boca menos abierta.
 */
export function generador(cara, preset, k, filas, labios = true) {
  const N = cara.bs.length, nombres = cara.nombres, kj = nombres.indexOf('jawOpen');
  const orden = [...Array(N).keys()].filter((i) => cara.ok[i]).sort((a, b) => cara.bs[a][kj] - cara.bs[b][kj]);
  const quietos = orden.slice(0, Math.max(3, Math.floor(orden.length * 0.3)));
  const base = nombres.map((_, j) => { const v = quietos.map((i) => cara.bs[i][j]).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; });
  const lista = listaDe(preset).map((m) => ({ id: m.id, m, bs: (preset.bsEd && preset.bsEd[m.id]) || m.bs }));
  const grillas = new Map();
  let actual = null;
  return (i) => {
    if (!cara.ok[i]) return null;
    actual = reconocer(rasgos(cara.bs[i], nombres, base), lista, actual);
    if (!grillas.has(actual)) {
      const g = grillaPreset(preset, lista.find((x) => x.id === actual).m, k, filas);
      grillas.set(actual, labios ? g : g.map((v) => (v === LABIO ? 0 : v)));
    }
    return grillas.get(actual);
  };
}
