// Mocap de la boca: la forma REAL de la boca en el video (hablando, callado o haciendo muecas) -> capas de los modelos
// de boca de BBS (boca_Man 2x4, boca_Woman 1x4). No escucha el audio: mira la boca cuadro por cuadro.
//
// Los dos modelos tienen 8 capas hijas de "head": a e i o u s s2 s3. Cada capa es un dibujo 8x8 sobre el frente de la
// cabeza; se muestra con s = [1,1,1] y se esconde con s = [0,0,0]. Sin ninguna capa = boca cerrada (se ve la piel).
//   a  = muy abierta            e  = abierta media          i  = apenas abierta y estirada
//   o  = redonda abierta        u  = piquito                s  = dientes apretados (mueca, enojo)
//   s2 = se asoman los dientes  s3 = sonrisa con dientes    cerrada = labios juntos
import * as M from './mat.js';
import { F, I, num } from './bbsdat.js';

export const TICKS = 20;
export const CAPAS = ['a', 'e', 'i', 'o', 'u', 's', 's2', 's3'];
export const FORMAS = ['cerrada', ...CAPAS];
export const NOMBRES_FORMA = {
  cerrada: 'cerrada', a: 'A (muy abierta)', e: 'E (abierta)', i: 'I (estirada)', o: 'O (redonda)', u: 'U (piquito)',
  s: 'dientes apretados', s2: 'dientes', s3: 'sonrisa con dientes',
};

// Puntos de la malla de 478 de MediaPipe que se guardan por cuadro para la boca (x, y normalizados a la imagen, z).
export const PUNTOS_BOCA = {
  comisura_iz: 61, comisura_de: 291, sup_int: 13, inf_int: 14, sup_ext: 0, inf_ext: 17, ojo_iz: 33, ojo_de: 263,
};
const PB = Object.keys(PUNTOS_BOCA);
const K = Object.fromEntries(PB.map((n, i) => [n, i]));

// Parte de boca de un actor: {idx, modelo, reposo} o null. Se reconoce por el nombre del modelo o por sus capas.
export function parteBoca(rep) {
  const partes = (rep.form && rep.form.parts) || [];
  for (let idx = 0; idx < partes.length; idx++) {
    const fm = partes[idx].form || {};
    const m = String(fm.model || '');
    const pose = fm.pose || {};
    const tieneCapas = ['a', 'o', 'u', 's2'].every((b) => b in pose);
    if (!/boca|mouth/i.test(m) && !tieneCapas) continue;
    const reposo = {};
    for (const [b, v] of Object.entries(pose)) {
      reposo[b] = {
        t: v.t ? v.t.map(num) : [0, 0, 0], r: v.r ? v.r.map(num) : [0, 0, 0],
        color: 'color' in v ? Math.trunc(num(v.color)) : -1,
      };
    }
    return { idx, modelo: /woman/i.test(m) ? 'boca_Woman' : 'boca_Man', nombreModelo: m, reposo };
  }
  return null;
}

// ---------------------------------------------------------------- medidas por cuadro
const dist = (p, q, asp) => Math.hypot((p[0] - q[0]) * asp, p[1] - q[1]);

function colBs(cara, ...nombres) {
  const idx = nombres.map((n) => cara.nombres.indexOf(n)).filter((k) => k >= 0);
  if (!idx.length) return cara.bs.map(() => 0);
  return cara.bs.map((fila) => idx.reduce((s, k) => s + fila[k], 0) / idx.length);
}

/**
 * Medidas de la boca en cada cuadro, todas relativas a la distancia entre los ojos (no dependen de lo cerca que estés):
 *  abre   = separacion entre los labios por dentro     ancho = de comisura a comisura (1 = tu boca en reposo)
 *  jaw    = mandibula abierta (blendshape)              redondo = labios en trompa / redondos
 *  sonrisa, estira (labios estirados hacia los costados), muestra (labios que se separan sin bajar la mandibula = dientes)
 */
export function medidas(cara, offset = 0) {
  if (!cara.boca || !cara.boca.length) throw new Error('El analisis de la cara es viejo y no tiene la boca: hay que analizar el video de nuevo.');
  const asp = cara.aspecto || 1;
  const t = cara.times.map((x) => x - offset);
  const ok = cara.ok.map(Boolean);
  const ojos = cara.boca.map((f) => dist(f[K.ojo_iz], f[K.ojo_de], asp) || 1e-6);
  const abre = cara.boca.map((f, i) => dist(f[K.sup_int], f[K.inf_int], asp) / ojos[i]);
  const anchoAbs = cara.boca.map((f, i) => dist(f[K.comisura_iz], f[K.comisura_de], asp) / ojos[i]);
  const pucker = colBs(cara, 'mouthPucker');
  const crudo = {
    jaw: colBs(cara, 'jawOpen'),
    redondo: colBs(cara, 'mouthFunnel').map((x, i) => Math.max(x, pucker[i])),
    sonrisa: colBs(cara, 'mouthSmileLeft', 'mouthSmileRight'),
    estira: colBs(cara, 'mouthStretchLeft', 'mouthStretchRight'),
    labios: colBs(cara, 'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft', 'mouthLowerDownRight'),
  };
  // tu cara en reposo: cuadros con los labios juntos. Cada persona tiene otra "boca quieta" (p. ej. algo de trompa),
  // asi que todo se mide como cambio respecto de ese reposo.
  const quietos = ok.map((v, i) => v && abre[i] < 0.04);
  const hayQuietos = quietos.filter(Boolean).length >= 5;
  const enReposo = (a) => (hayQuietos ? M.median(a.filter((_, i) => quietos[i])) : 0);
  const rel = {};
  for (const [k, a] of Object.entries(crudo)) {
    const b = Math.min(enReposo(a), 0.9);
    rel[k] = a.map((x) => Math.max(0, (x - b) / (1 - b)));
  }
  const conCara = anchoAbs.filter((_, i) => ok[i]);
  const base = hayQuietos ? M.median(anchoAbs.filter((_, i) => quietos[i])) : conCara.length ? M.median(conCara) : 1;
  const ancho = anchoAbs.map((x) => x / (base || 1));
  const { jaw, redondo, sonrisa, estira, labios } = rel;
  return { t, ok, abre, ancho, jaw, redondo, sonrisa, estira, labios, anchoBase: base };
}

// ---------------------------------------------------------------- forma de cada cuadro
export const UMBRALES = {
  cerrada: 0.045,   // separacion de labios por debajo de esto = boca cerrada
  media: 0.16,      // por encima = "e"
  grande: 0.30,     // por encima = "a"
  dientesJaw: 0.12, // labios separados pero la mandibula casi cerrada = se ven los dientes
  redondo: 0.25, angosta: 0.86, sonrisa: 0.40, estira: 0.30, ancha: 1.08,   // (relativos a tu boca en reposo)
};

// sens: 0.5 (menos sensible, pide bocas mas marcadas) .. 2 (mas sensible)
export function formaCuadro(m, i, sens = 1, U = UMBRALES) {
  const abre = m.abre[i] * sens, jaw = m.jaw[i] * sens;
  const redondo = m.redondo[i] > U.redondo || (m.ancho[i] < U.angosta && abre > U.cerrada);
  if (abre < U.cerrada) return 'cerrada';
  if (jaw < U.dientesJaw && !redondo) {
    if (m.sonrisa[i] > U.sonrisa) return 's3';
    if (m.estira[i] > U.estira || abre > U.media) return 's';
    return 's2';
  }
  if (redondo) return abre > U.media ? 'o' : 'u';
  if (abre > U.grande) return 'a';
  if (abre > U.media) return m.sonrisa[i] > U.sonrisa ? 'i' : 'e';
  return m.ancho[i] > U.ancha || m.sonrisa[i] > U.sonrisa ? 'i' : 'e';
}

// ---------------------------------------------------------------- de cuadros a tramos
// Voto por mayoria en una ventana corta (saca parpadeos de un cuadro) y despues se juntan los tramos cortos:
// cada forma dura al menos minTicks (estilo seco del usuario, sin temblequeo).
export function tramos(m, { sens = 1, ventana = 0.12, minTicks = 2 } = {}) {
  const N = m.t.length;
  let ult = 'cerrada';
  const crudo = m.t.map((_, i) => { if (m.ok[i]) ult = formaCuadro(m, i, sens); return ult; });
  const diffs = []; for (let i = 1; i < N; i++) diffs.push(m.t[i] - m.t[i - 1]);
  const dt = diffs.length ? M.median(diffs) : 1 / 30;
  const r = Math.max(1, Math.round(ventana / dt / 2));
  const suave = crudo.map((_, i) => {
    const c = {};
    for (let k = Math.max(0, i - r); k <= Math.min(N - 1, i + r); k++) c[crudo[k]] = (c[crudo[k]] || 0) + (k === i ? 1.5 : 1);
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  });
  // tramos en ticks
  let lst = [];
  for (let i = 0; i < N; i++) {
    const tk = M.roundHalfEven(Math.max(0, m.t[i]) * TICKS);
    if (!lst.length || lst[lst.length - 1].forma !== suave[i]) {
      if (lst.length && lst[lst.length - 1].tick === tk) lst[lst.length - 1].forma = suave[i];
      else lst.push({ tick: tk, forma: suave[i] });
    }
  }
  // tramos demasiado cortos: se los come el de al lado (el mas largo de los dos)
  const fin = M.roundHalfEven(Math.max(0, m.t[N - 1]) * TICKS) + 1;
  for (let cambio = true; cambio && lst.length > 1;) {
    cambio = false;
    for (let k = 0; k < lst.length; k++) {
      const dur = (k + 1 < lst.length ? lst[k + 1].tick : fin) - lst[k].tick;
      if (dur >= minTicks) continue;
      const durPrev = k > 0 ? lst[k].tick - lst[k - 1].tick : -1;
      const durSig = k + 1 < lst.length ? (k + 2 < lst.length ? lst[k + 2].tick : fin) - lst[k + 1].tick : -1;
      if (durPrev >= durSig && k > 0) lst.splice(k, 1);
      else { lst[k + 1].tick = lst[k].tick; lst.splice(k, 1); }
      cambio = true; break;
    }
    lst = lst.filter((x, k) => k === 0 || x.forma !== lst[k - 1].forma);
  }
  return lst;
}

// ---------------------------------------------------------------- pistas
/**
 * cara: analisis de la cara (con .boca); parte: de parteBoca(). Devuelve { pistas, resumen }.
 * op: boca_sens (0.5..2), boca_min_ticks.
 */
export function construir(cara, parte, offset = 0, desde = 0, op = {}) {
  const m = medidas(cara, offset);
  if (m.t.length < 5) throw new Error('La toma es muy corta para animar la boca.');
  const lst = tramos(m, { sens: op.boca_sens ?? 1, minTicks: op.boca_min_ticks ?? 2 });
  const { idx, modelo, reposo } = parte;
  const pistas = {}, ultimo = {};
  for (const { tick, forma } of lst) {
    for (const b of CAPAS) {
      const visible = b === forma;
      if (ultimo[b] === visible) continue;
      ultimo[b] = visible;
      const r = reposo[b] || {};
      const k = `${idx}/pose/${b}`;
      if (!pistas[k]) pistas[k] = { keyframes: [], type: 'pose_transform' };
      const s = visible ? [1, 1, 1] : [0, 0, 0];
      pistas[k].keyframes.push({
        interp: 'constant', tick: F(tick + desde),
        value: { r: (r.r || [0, 0, 0]).map((x) => F(x)), s: s.map((x) => F(x)), t: (r.t || [0, 0, 0]).map((x) => F(x)),
          fix: F(0.0), color: I(Math.trunc(r.color ?? -1)), lighting: F(0.0) },
      });
    }
  }
  const usadas = {};
  for (let k = 0; k < lst.length; k++) {
    const dur = (k + 1 < lst.length ? lst[k + 1].tick : M.roundHalfEven(m.t[m.t.length - 1] * TICKS)) - lst[k].tick;
    usadas[lst[k].forma] = (usadas[lst[k].forma] || 0) + Math.max(0, dur);
  }
  const resumen = {
    modelo, cambios: lst.length - 1, formas: usadas,
    keyframes: Object.values(pistas).reduce((s, p) => s + p.keyframes.length, 0), duracion: m.t[m.t.length - 1],
    cara_vista: m.ok.filter(Boolean).length / m.ok.length,
  };
  return { pistas, resumen, tramos: lst };
}
