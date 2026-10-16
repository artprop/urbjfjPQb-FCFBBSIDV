// Mocap facial de los ojos: señales de la cara -> pistas de la parte de ojos de un film de BBS. Port de ojos.py.
// Estilo del usuario: interpolacion 'constant' (pasos secos), parpadeos de pocos ticks, mirada a saltos, cejas por estados.
// Convenciones de BBS: t.x positivo = hacia la IZQUIERDA del personaje; "l" = izquierda de la persona (video sin espejar).
import * as M from './mat.js';
import { F, I, num } from './bbsdat.js';

export const TICKS = 20;
export const HUESOS = ['pupil_l', 'pupil_r', 'eyelid_lt', 'eyelid_lb', 'eyelid_rt', 'eyelid_rb', 'eyebrow_l', 'eyebrow_r'];
const HOLGURA_NARIZ = 0.25, RECORRIDO_V = 0.625;
const CEJA_ARRIBA = 0.625, CEJA_ABAJO = 0.70, INCL_ENOJO = 0.209, INCL_RUEGO = 0.087;
const PROF_PARPADO_CERRADO = 0.0625, ENTRECERRAR = 0.5;

// Puntos de la malla de 478 que se guardan por cuadro (mismo orden que cara_video.py). iz/de = lado de la IMAGEN.
export const PUNTOS = {
  iz_esq_ext: 33, iz_esq_int: 133, iz_parpado_sup: 159, iz_parpado_inf: 145, iz_iris: 468,
  de_esq_int: 362, de_esq_ext: 263, de_parpado_sup: 386, de_parpado_inf: 374, de_iris: 473,
  nariz: 1, frente: 10, menton: 152, iz_ceja: 105, iz_ceja_int: 66, de_ceja: 334, de_ceja_int: 296,
};
const PN = Object.keys(PUNTOS);

const vec = (v, d) => (v ? v.map(num) : d.slice());

// Parte de ojos de un actor: {idx, modelo, reposo: {hueso: {t, s, r, color}}} o null si no tiene.
export function parteOjos(rep) {
  const partes = (rep.form && rep.form.parts) || [];
  for (let idx = 0; idx < partes.length; idx++) {
    const fm = partes[idx].form || {};
    const m = String(fm.model || '');
    if (!m.includes('eyes')) continue;
    const reposo = {};
    for (const [b, v] of Object.entries(fm.pose || {})) {
      reposo[b] = { t: vec(v.t, [0, 0, 0]), s: vec(v.s, [1, 1, 1]), r: vec(v.r, [0, 0, 0]), color: 'color' in v ? Math.trunc(num(v.color)) : -1 };
    }
    return { idx, modelo: m.includes('eyes_1px') ? 'eyes_1px' : 'eyes', reposo };
  }
  return null;
}

// ---------------------------------------------------------------- utilidades
function percentile(arr, q) {
  const s = Float64Array.from(arr).sort(), n = s.length;
  const p = (n - 1) * q / 100, lo = Math.floor(p), hi = Math.ceil(p);
  return s[lo] + (s[hi] - s[lo]) * (p - lo);
}
const pick = (arr, mask) => arr.filter((_, i) => mask[i]);
const medMask = (x, mask) => (mask.some(Boolean) ? M.median(pick(x, mask)) : 0.0);
const clipA = (arr, a, b) => arr.map((x) => M.clip(x, a, b));

function col(cara, ...nombres) {
  const idx = nombres.map((n) => cara.nombres.indexOf(n));
  return cara.bs.map((fila) => idx.reduce((s, k) => s + fila[k], 0) / idx.length);
}

// ---------------------------------------------------------------- señales
function senalesBlendshapes(cara, offset = 0, neutralS = 1.0, ganancia = 1.0) {
  const t = cara.times.map((x) => x - offset);
  const sel = t.map((x) => x >= -1e-6), ok = cara.ok.map(Boolean);
  const blink = col(cara, 'eyeBlinkLeft', 'eyeBlinkRight');
  const gIzq = col(cara, 'eyeLookOutLeft', 'eyeLookInRight'), gDer = col(cara, 'eyeLookInLeft', 'eyeLookOutRight');
  const gArr = col(cara, 'eyeLookUpLeft', 'eyeLookUpRight'), gAba = col(cara, 'eyeLookDownLeft', 'eyeLookDownRight');
  const squint = col(cara, 'eyeSquintLeft', 'eyeSquintRight');
  const inner = col(cara, 'browInnerUp');
  const cejas = {};
  for (const [lado, L] of [['l', 'Left'], ['r', 'Right']]) {
    const outer = col(cara, 'browOuterUp' + L);
    cejas[lado] = [outer.map((x, i) => Math.max(x, 0.6 * inner[i])), col(cara, 'browDown' + L)];
  }
  const selOk = sel.map((s, i) => s && ok[i]);
  const validos = []; selOk.forEach((v, i) => { if (v) validos.push(i); });
  const tIni = validos.length ? t[validos[0]] : 0.0;
  const p70 = validos.length ? percentile(pick(blink, selOk), 70) : 0;
  let base = t.map((x, i) => selOk[i] && x >= tIni && x <= tIni + neutralS && (validos.length ? blink[i] < p70 : true));
  if (base.filter(Boolean).length < 3) base = selOk;
  const med = (x) => medMask(x, base);
  const gx = gIzq.map((x, i) => x - gDer[i]), gy = gArr.map((x, i) => x - gAba[i]);
  const n = { blink: med(blink), gx: med(gx), gy: med(gy), sq: med(squint) };
  const escala = 0.5 / Math.max(ganancia, 0.05);
  const out = {
    t: pick(t, sel), ok: pick(ok, sel),
    blink: pick(blink.map((x) => M.clip((x - n.blink) / 0.5, 0, 1)), sel),
    gx: pick(gx.map((x) => M.clip((x - n.gx) / escala, -1, 1)), sel),
    gy: pick(gy.map((x) => M.clip((x - n.gy) / escala, -1, 1)), sel),
    squint: pick(squint.map((x) => M.clip((x - n.sq) / 0.4, 0, 1)), sel),
  };
  for (const lado of ['l', 'r']) {
    const [a, b] = cejas[lado], na = med(a), nb = med(b);
    out['ceja_' + lado] = pick(a.map((x, i) => M.clip((Math.max(x - na, 0) - Math.max(b[i] - nb, 0)) / 0.35, -1, 1)), sel);
  }
  out.base = n;
  return out;
}

function ladoGeo(pts, prefijo, ext, inte) {
  const g = (n) => { const k = PN.indexOf(n); return pts.map((f) => f[k]); };
  const c1 = g(`${prefijo}_${ext}`), c2 = g(`${prefijo}_${inte}`);
  const sup = g(`${prefijo}_parpado_sup`), inf = g(`${prefijo}_parpado_inf`), iris = g(`${prefijo}_iris`), ceja = g(`${prefijo}_ceja`);
  const N = pts.length, o = { abierto: [], iris_x: [], iris_y: [], ceja: [] };
  for (let i = 0; i < N; i++) {
    const ancho = Math.max(Math.hypot(c1[i][0] - c2[i][0], c1[i][1] - c2[i][1]), 1e-6);
    const cx = (c1[i][0] + c2[i][0]) / 2, cy = (c1[i][1] + c2[i][1]) / 2;
    const apertura = Math.hypot(sup[i][0] - inf[i][0], sup[i][1] - inf[i][1]);
    o.abierto.push(apertura / ancho);
    o.iris_x.push((iris[i][0] - cx) / ancho);
    o.iris_y.push((iris[i][1] - (sup[i][1] + inf[i][1]) / 2) / Math.max(apertura, 1e-6));
    o.ceja.push((cy - ceja[i][1]) / ancho);
  }
  return o;
}

function senalesGeometria(cara, offset = 0, neutralS = 1.0, ganancia = 1.0) {
  const t = cara.times.map((x) => x - offset);
  const sel = t.map((x) => x >= -1e-6), ok = cara.ok.map(Boolean);
  const ojoR = ladoGeo(cara.pts, 'iz', 'esq_ext', 'esq_int');   // ojo derecho de la persona (izquierda de la imagen)
  const ojoL = ladoGeo(cara.pts, 'de', 'esq_int', 'esq_ext');   // ojo izquierdo de la persona
  const prom = (k) => ojoR[k].map((x, i) => (x + ojoL[k][i]) / 2);
  const abierto = prom('abierto'), irisX = prom('iris_x'), irisY = prom('iris_y');
  const selOk = sel.map((s, i) => s && ok[i]);
  const validos = []; selOk.forEach((v, i) => { if (v) validos.push(i); });
  const tIni = validos.length ? t[validos[0]] : 0.0;
  let base = t.map((x, i) => selOk[i] && x >= tIni && x <= tIni + neutralS);
  if (base.filter(Boolean).length >= 4) {
    const p30 = percentile(pick(abierto, base), 30);
    base = base.map((b, i) => b && abierto[i] >= p30);
  }
  if (base.filter(Boolean).length < 3) base = selOk;
  const med = (x) => medMask(x, base);
  const a0 = Math.max(med(abierto), 1e-3);
  const cierre = abierto.map((x) => M.clip(1 - x / a0, 0, 1));
  const escalaX = 0.22 / Math.max(ganancia, 0.05);
  const mx = med(irisX), my = med(irisY);
  const gx = irisX.map((x) => M.clip((x - mx) / escalaX, -1, 1));
  const gyGeo = irisY.map((x) => M.clip(-(x - my) / (0.35 / Math.max(ganancia, 0.05)), -1, 1));
  const bs = senalesBlendshapes(cara, offset, neutralS, ganancia);
  const gyGeoSel = pick(gyGeo, sel);
  const cierreSel = pick(cierre, sel);
  const out = {
    t: pick(t, sel), ok: pick(ok, sel), blink: cierreSel, gx: pick(gx, sel),
    gy: gyGeoSel.map((x, i) => M.clip(0.5 * x + 0.5 * bs.gy[i], -1, 1)),
    squint: cierreSel.map((x) => M.clip((x - 0.2) / 0.3, 0, 1)),
  };
  for (const [lado, o, L] of [['l', ojoL, 'Left'], ['r', ojoR, 'Right']]) {
    const mc = Math.max(med(o.ceja), 1e-3);
    const k = cara.nombres.indexOf('browDown' + L);
    const bd = cara.bs.map((f) => f[k]);
    const mbd = M.median(pick(bd, base));
    const v = o.ceja.map((x, i) => {
      const arriba = M.clip((x / mc - 1) / 0.28, 0, 1);
      const bajar = M.clip((bd[i] - mbd) / 0.30, 0, 1);
      return bajar > arriba ? -bajar : arriba;
    });
    out['ceja_' + lado] = pick(v, sel);
  }
  out.base = { abierto: a0, iris_x: mx, iris_y: my };
  return out;
}

export function senales(cara, offset = 0, neutralS = 1.0, ganancia = 1.0) {
  const pts = cara.pts || [];
  const hayGeo = pts.length && pts[0].length >= PN.length && pts.some((f) => f.some((p) => Math.abs(p[0]) + Math.abs(p[1]) > 0));
  return hayGeo ? senalesGeometria(cara, offset, neutralS, ganancia) : senalesBlendshapes(cara, offset, neutralS, ganancia);
}

// ---------------------------------------------------------------- eventos
export function parpadeos(t, b, umbral = 0.5, minTicks = 2, maxTicks = 60) {
  if (t.length < 3) return [];
  const diffs = []; for (let i = 1; i < t.length; i++) diffs.push(t[i] - t[i - 1]);
  const dt = M.median(diffs);
  const cerr = []; let estado = false;
  for (const v of b) {
    if (!estado && v >= umbral) estado = true;
    else if (estado && v < umbral * 0.6) estado = false;
    cerr.push(estado);
  }
  const ini = [], fin = [];
  for (let i = 0; i <= cerr.length; i++) {
    const prev = i > 0 ? cerr[i - 1] : false, cur = i < cerr.length ? cerr[i] : false;
    if (!prev && cur) ini.push(i);
    if (prev && !cur) fin.push(i);
  }
  const out = [];
  ini.forEach((a, j) => {
    const z = fin[j];
    const t0 = a > 0 ? (t[a - 1] + t[a]) / 2 : t[a] - dt / 2;
    const t1 = z < t.length ? (t[z - 1] + t[z]) / 2 : t[z - 1] + dt / 2;
    const k0 = M.roundHalfEven(t0 * TICKS);
    let k1 = Math.max(M.roundHalfEven(t1 * TICKS), k0 + minTicks);
    if (k1 - k0 > maxTicks) k1 = k0 + maxTicks;
    if (out.length && k0 <= out[out.length - 1][1] + 1) out[out.length - 1] = [out[out.length - 1][0], Math.max(out[out.length - 1][1], k1)];
    else out.push([k0, k1]);
  });
  return out.filter(([a]) => a >= 0);
}

const medianaFilas = (rows) => rows[0].map((_, c) => M.median(rows.map((r) => r[c])));
const maxAbsDiff = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

// Cambios de estado de una señal: [[segundo_de_inicio, valor (array)]]; el nuevo valor debe sostenerse minCuadros.
export function segmentar(t, X, enmascarado, cambio, tol, minCuadros = 2) {
  const filas = X.map((x) => (Array.isArray(x) ? x : [x]));
  let actual = new Array(filas[0].length).fill(0), cand = null;
  const cambios = [];
  for (let i = 0; i < t.length; i++) {
    if (enmascarado[i]) continue;
    const x = filas[i];
    if (maxAbsDiff(x, actual) > cambio) {
      if (cand === null || maxAbsDiff(x, medianaFilas(cand[1])) > tol) cand = [i, [x]];
      else cand[1].push(x);
      if (cand[1].length >= minCuadros) {
        actual = medianaFilas(cand[1]);
        cambios.push([t[cand[0]], actual.slice()]); cand = null;
      }
    } else cand = null;
  }
  return cambios;
}

function cuantizar(v, niveles) {
  let k = 0;
  for (let i = 1; i < niveles.length; i++) if (Math.abs(niveles[i] - v) < Math.abs(niveles[k] - v)) k = i;
  return niveles[k];
}

function niveles(cambios, nivs, zonaMuerta) {
  const out = []; let prev = null;
  for (const [seg, v] of cambios) {
    const q = v.map((x) => (Math.abs(x) < zonaMuerta ? 0.0 : cuantizar(x, nivs)));
    if (prev === null) { if (!q.some((x) => x !== 0)) continue; }
    else if (q.every((x, i) => x === prev[i])) continue;
    out.push([seg, q]); prev = q;
  }
  return out;
}

function estadoEn(cambios, tick, inicial, tickDe) {
  let val = inicial;
  for (const [seg, v] of cambios) { if (tickDe(seg) <= tick) val = v; else break; }
  return val;
}

// ---------------------------------------------------------------- pistas
/**
 * cara: {times, bs (N x 52), nombres, pts (N x 17 x [x,y]), ok}; parte: de parteOjos(); posesModelo: poses.json del modelo de ojos.
 * Devuelve { pistas, resumen }.
 */
export function construir(cara, parte, offset = 0, desde = 0, op = {}, posesModelo = {}) {
  const mirada = op.ojos_mirada ?? 1.0, umbral = op.ojos_parpadeo ?? 0.5;
  const conCejas = op.ojos_cejas ?? true, neutral = op.neutral ?? 1.0;
  const S = senales(cara, offset, neutral, mirada);
  const t = S.t;
  if (t.length < 5) throw new Error('La toma es muy corta para animar los ojos.');
  const { idx, modelo, reposo } = parte;
  const cerrado = (posesModelo.closed && posesModelo.closed.pose) || {};
  const rest = (b) => {
    const r = reposo[b] || {};
    return { t: (r.t || [0, 0, 0]).slice(), s: (r.s || [1, 1, 1]).slice(), r: (r.r || [0, 0, 0]).slice(), color: r.color ?? -1 };
  };

  const blinks = parpadeos(t, S.blink, umbral);
  const enParpadeo = t.map((x) => blinks.some(([a, z]) => x * TICKS >= a - 1.5 && x * TICKS <= z + 1.5));
  const mask = enParpadeo.map((v, i) => v || !S.ok[i]);
  const noOk = S.ok.map((v) => !v);

  const diffs = []; for (let i = 1; i < t.length; i++) diffs.push(t[i] - t[i - 1]);
  const dt = M.median(diffs);
  const cuadros = (seg) => Math.max(2, M.roundHalfEven(seg / dt));
  const NIV = [-1, -0.5, 0, 0.5, 1];
  const G = S.gx.map((x, i) => [x, S.gy[i]]);
  const camG = niveles(segmentar(t, G, mask, 0.4, 0.3, cuadros(0.10)), NIV, 0.3);
  const camC = {};
  for (const lado of ['l', 'r']) {
    const c = conCejas ? segmentar(t, S['ceja_' + lado], noOk, 0.4, 0.3, cuadros(0.2)) : [];
    camC[lado] = niveles(c, NIV, 0.3);
  }
  const camS = niveles(segmentar(t, S.squint, mask, 0.4, 0.3, cuadros(0.2)), [0, 0.5, 1], 0.0);

  const tickDe = (seg) => M.roundHalfEven(seg * TICKS);
  const tset = new Set([0]);
  for (const [a, z] of blinks) { tset.add(a); tset.add(z); }
  for (const lst of [camG, camS, camC.l, camC.r]) for (const [s] of lst) tset.add(tickDe(s));
  const ticks = [...tset].sort((a, b) => a - b);

  const anchoOjo = 'eye_l' in reposo ? 2 * rest('eye_l').s[0] : 2.0;
  const anchoPupila = rest('pupil_l').s[0];
  const recorrido = M.clip(anchoOjo - anchoPupila, 0.5, 3.0);
  const factorV = rest('pupil_l').s[1] <= 1.2 ? 1.0 : 0.4;

  function estado(tick) {
    const g = estadoEn(camG, tick, [0, 0], tickDe);
    const cl = estadoEn(camC.l, tick, [0], tickDe)[0], cr = estadoEn(camC.r, tick, [0], tickDe)[0];
    const sq = estadoEn(camS, tick, [0], tickDe)[0];
    const cerradoAhora = blinks.some(([a, z]) => a <= tick && tick < z);
    const out = {};
    const [gx, gy] = g;
    for (const [lado, sg] of [['l', 1], ['r', -1]]) {
      let v = rest('pupil_' + lado);
      const afuera = gx * sg > 0;
      v.t[0] += gx * (afuera ? recorrido : HOLGURA_NARIZ);
      v.t[1] += gy * RECORRIDO_V * factorV;
      out['pupil_' + lado] = v;
      for (const pos of ['t', 'b']) {
        const nombre = `eyelid_${lado}${pos}`;
        v = rest(nombre);
        if (cerradoAhora && cerrado[nombre]) {
          const d = cerrado[nombre];
          const dtv = d.t || [0, 0, 0], dsv = d.s || [1, 1, 1];
          v.t = v.t.map((a, k) => a + dtv[k]);
          v.s = v.s.map((a, k) => a * dsv[k]);
          v.t[2] = Math.min(v.t[2], PROF_PARPADO_CERRADO);
        } else if (sq > 0) {
          v.t[1] += (pos === 't' ? -ENTRECERRAR : ENTRECERRAR) * sq;
        }
        out[nombre] = v;
      }
      const nivel = lado === 'l' ? cl : cr;
      v = rest('eyebrow_' + lado);
      v.t[1] += nivel * (nivel > 0 ? CEJA_ARRIBA : CEJA_ABAJO);
      const sL = lado === 'l' ? -1 : 1;
      v.r[2] += sL * (nivel < 0 ? INCL_ENOJO * -nivel : -INCL_RUEGO * nivel);
      out['eyebrow_' + lado] = v;
    }
    return out;
  }

  const pistas = {}, ultimo = {};
  const r3 = (a) => a.map((x) => M.roundTo(x, 3)).join(',');
  for (const tk of ticks) {
    const est = estado(tk);
    for (const b of HUESOS) {
      const v = est[b];
      const clave = r3(v.t) + '|' + r3(v.s) + '|' + r3(v.r);
      if (ultimo[b] === clave) continue;
      ultimo[b] = clave;
      const k = `${idx}/pose/${b}`;
      if (!pistas[k]) pistas[k] = { keyframes: [], type: 'pose_transform' };
      pistas[k].keyframes.push({
        interp: 'constant', tick: F(tk + desde),
        value: { r: v.r.map((x) => F(x)), s: v.s.map((x) => F(x)), t: v.t.map((x) => F(x)), fix: F(0.0), color: I(Math.trunc(v.color)), lighting: F(0.0) },
      });
    }
  }
  const resumen = {
    parpadeos: blinks.length, cambios_mirada: camG.length, cambios_cejas: camC.l.length + camC.r.length,
    entrecerrar: camS.length, modelo, keyframes: Object.values(pistas).reduce((s, p) => s + p.keyframes.length, 0),
    duracion: t[t.length - 1],
  };
  return { pistas, resumen };
}
