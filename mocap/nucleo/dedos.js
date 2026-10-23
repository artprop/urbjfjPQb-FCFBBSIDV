// Dedos: cuánto está cerrado cada dedo (0 = estirado, 1 = cerrado) -> pistas de la parte de dedos de un film de BBS.
// Sirve para las tres entradas: los huesos de una animacion importada, los 21 puntos de mano de MediaPipe (camara) y el
// gatillo del PS Move. Cada dedo va de la pose «abierta» a la «cerrada» del modelo de dedos (las poses del usuario), asi
// el movimiento respeta su estilo. No sabe nada de archivos ni de three.js.
import { F, I, num, clonar } from './bbsdat.js';
import { simplify } from './retarget.js';
import { PARTE_DEDOS } from '../../ojos/plantilla_form.js';

export const DEDOS = ['pulgar', 'indice', 'medio', 'anular', 'menique'];
const TICKS = 20;

// Modelos de dedos. huesos: los de cada dedo (de la base a la punta). abierta / cerrada: poses de su poses.json por lado.
export const MODELOS_DEDOS = {
  dedos: {
    nombre: 'dedos (el tuyo)', id: () => 'player/dedos', carpeta: () => 'dedos/dedos', archivo: 'dedos.bbs.json', texturaPropia: false,
    huesos: { pulgar: ['1thumb'], indice: ['2index'], medio: ['3middl'], anular: ['4anular'], menique: ['5pinki'] },
    defecto: { L: ['L_Standing', 'L_PunchCerrado'], R: ['R_Standing', 'R_PunchCerrado'] },
  },
  fingers_steve: {
    nombre: 'Fingers (Steve)', id: (l) => `Fingers/Steve_${l === 'L' ? 'left' : 'right'}`, carpeta: (l) => `dedos/Fingers/Steve_${l === 'L' ? 'left' : 'right'}`,
    archivo: 'model.bbs.json', texturaPropia: true,
    huesos: { pulgar: ['Thumb', 'Thumb2'], indice: ['Index', 'Index2'], medio: ['Middle', 'Middle2'], anular: ['Ring', 'Ring2'], menique: ['Pinky', 'Pinky2'] },
    defecto: { L: ['Idle', 'Fist'], R: ['Idle', 'Fist'] },
  },
  fingers_alex: {
    nombre: 'Fingers (Alex)', id: (l) => `Fingers/Alex_${l === 'L' ? 'left' : 'right'}`, carpeta: (l) => `dedos/Fingers/Alex_${l === 'L' ? 'left' : 'right'}`,
    archivo: 'model.bbs.json', texturaPropia: true,
    huesos: { pulgar: ['Thumb', 'Thumb2'], indice: ['Index', 'Index2'], medio: ['Middle', 'Middle2'], anular: ['Ring', 'Ring2'], menique: ['Pinky', 'Pinky2'] },
    defecto: { L: ['Idle', 'Fist'], R: ['Idle', 'Fist'] },
  },
};

/** 'fingers' = Fingers de Steve o de Alex según el cuerpo (los demás quedan como están). */
export function modeloDedosPara(id, modeloCuerpo) {
  if (id !== 'fingers') return MODELOS_DEDOS[id] ? id : 'dedos';
  return /alex/i.test(String(modeloCuerpo)) ? 'fingers_alex' : 'fingers_steve';
}

/** Clave del cuerpo para las poses ajustadas: steve_bends, alex_bends, emoticons_steve o emoticons_alex. */
export function cuerpoDe(modeloCuerpo) {
  const m = String(modeloCuerpo || '').toLowerCase();
  if (m.includes('emoticons')) return m.includes('alex') ? 'emoticons_alex' : 'emoticons_steve';
  return m.includes('alex') ? 'alex_bends' : 'steve_bends';
}

/**
 * Poses de una mano: { abierta, cerrada, transform }. Si no se eligió una pose a mano (''), van las AJUSTADAS para ese
 * cuerpo y lado (mocap/datos/dedos/ajustes.json: con los dedos en su lugar y la mano derecha como espejo de la izquierda);
 * si se eligió, la de la biblioteca del modelo, tal cual.
 * datos: de cargarModeloDedos (con poses y ajustes); elegidaA / elegidaC: nombres de pose o ''.
 */
export function posesMano(datos, modeloCuerpo, lado, elegidaA = '', elegidaC = '') {
  const aj = (datos.ajustes || {})[cuerpoDe(modeloCuerpo)];
  const deAjuste = aj && aj[lado];
  const pose = (n, ext) => (n && datos.poses[n] ? datos.poses[n].pose || datos.poses[n]
    : deAjuste ? deAjuste[ext] : (datos.poses[datos.cfg.defecto[lado][ext === 'abierta' ? 0 : 1]] || {}).pose);
  return { abierta: pose(elegidaA, 'abierta'), cerrada: pose(elegidaC, 'cerrada'), transform: deAjuste ? deAjuste.transform || {} : {} };
}

/** Hueso del muñeco del que cuelga la mano: el del ítem (steve/alex_bends) o la punta del antebrazo (emoticons). */
export function huesoMano(modeloCuerpo, lado) {
  const l = lado === 'L' ? 'left' : 'right';
  return /emoticons/.test(String(modeloCuerpo)) ? `low_${l}_arm.end` : `${l}_arm_item`;
}

// ---------------------------------------------------------------- cuánto está cerrado cada dedo
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const largo = (a) => Math.hypot(a[0], a[1], a[2]);
const ang = (a, b) => { const la = largo(a), lb = largo(b); if (la < 1e-9 || lb < 1e-9) return 0; return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)))); };
const GRADO = Math.PI / 180, clip01 = (x) => Math.max(0, Math.min(1, x));

/**
 * mano: { muneca: [x,y,z], dedos: { pulgar: [p0..p3], indice: [p0..p3], ... } } (de la base a la punta; pueden faltar
 * puntos o dedos). Devuelve [pulgar, indice, medio, anular, menique] de 0 (estirado) a 1 (cerrado); null si falta el dedo.
 * Dedos largos: lo que se doblan los tres nudillos (desde la palma). Pulgar: lo que se doblan sus nudillos y lo que se
 * acerca su punta a la base del meñique (cruzando la palma).
 */
export function curlsDeMano(mano) {
  const out = [];
  const d = mano.dedos || {};
  for (const k of DEDOS) {
    const p = (d[k] || []).filter(Boolean);
    if (p.length < 2) { out.push(null); continue; }
    const segs = []; for (let i = 1; i < p.length; i++) segs.push(sub(p[i], p[i - 1]));
    let tot = 0;
    if (k !== 'pulgar') {
      tot += ang(sub(p[0], mano.muneca), segs[0]);   // nudillo de la palma
      for (let i = 1; i < segs.length; i++) tot += ang(segs[i - 1], segs[i]);
      out.push(clip01((tot / GRADO - 25) / 190));
    } else {
      for (let i = 1; i < segs.length; i++) tot += ang(segs[i - 1], segs[i]);
      let c = clip01((tot / GRADO - 15) / 95);
      const im = (d.indice || [])[0], mm = (d.menique || [])[0];
      if (im && mm) {   // la punta cruzando la palma hacia el meñique
        const ancho = largo(sub(im, mm)) || 1;
        c = Math.max(c, 0.9 * clip01((1.6 - largo(sub(p[p.length - 1], mm)) / ancho) / 0.9));
      }
      out.push(c);
    }
  }
  return out;
}

/** Suaviza una serie de N x 5 (con nulls = mano no vista: se mantiene el último valor, o abierta al empezar). */
export function suavizar(serie, ventana = 2) {
  const n = serie.length, lleno = [];
  let ult = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) { const f = serie[i]; ult = f ? f.map((v, k) => (v === null || v === undefined || Number.isNaN(v) ? ult[k] : v)) : ult; lleno.push(ult); }
  if (ventana <= 0) return lleno;
  return lleno.map((_, i) => [0, 1, 2, 3, 4].map((k) => {
    const v = []; for (let j = Math.max(0, i - ventana); j <= Math.min(n - 1, i + ventana); j++) v.push(lleno[j][k]);
    v.sort((a, b) => a - b); return v[v.length >> 1];   // mediana: borra saltos sueltos sin achatar los gestos
  }));
}

// ---------------------------------------------------------------- de cuánto cerrado a la pose del modelo
const vec = (v, d) => (v ? v.map(num) : d.slice());
function transf(p) { return { t: vec(p && p.t, [0, 0, 0]), s: vec(p && p.s, [1, 1, 1]), r: vec(p && p.r, [0, 0, 0]) }; }

/** Pose del modelo con cada dedo entre abierta y cerrada: { hueso: {t, s, r} }. curls: [pulgar..menique] de 0 a 1. */
export function poseMezcla(cfg, abierta, cerrada, curls) {
  const ab = (abierta && abierta.pose) || abierta || {}, ce = (cerrada && cerrada.pose) || cerrada || {};
  const dueño = {};
  DEDOS.forEach((k, i) => (cfg.huesos[k] || []).forEach((h) => (dueño[h] = i)));
  const out = {};
  for (const h of new Set([...Object.keys(ab), ...Object.keys(ce), ...Object.keys(dueño)])) {
    const a = transf(ab[h]), c = transf(ce[h]);
    const k = dueño[h] === undefined ? 0 : clip01(curls[dueño[h]] ?? 0);
    const mix = (x, y) => x.map((v, j) => v + (y[j] - v) * k);
    out[h] = { t: mix(a.t, c.t), s: mix(a.s, c.s), r: mix(a.r, c.r) };
  }
  return out;
}

function keyframe(tick, v) {
  return { tick: F(Number(tick)), interp: 'linear',
    value: { color: I(-1), fix: F(0.0), lighting: F(0.0), r: v.r.map((x) => F(x)), s: v.s.map((x) => F(x)), t: v.t.map((x) => F(x)) } };
}

/**
 * Pistas de una mano: { hueso: {keyframes, type} } (sin el prefijo de la parte). times: segundos; curls: N x 5.
 * desde: tick donde empieza; tol: error permitido al simplificar (radianes).
 */
export function pistasMano(cfg, abierta, cerrada, times, curls, { desde = 0, tol = 0.02 } = {}) {
  if (!times.length) return {};
  const fin = Math.round(times[times.length - 1] * TICKS);
  const ticks = [], poses = [];
  let j = 0;
  for (let k = 0; k <= fin; k++) {
    const t = k / TICKS;
    while (j < times.length - 2 && times[j + 1] <= t) j++;
    const a = curls[j], b = curls[Math.min(j + 1, curls.length - 1)];
    const u = times[j + 1] > times[j] ? clip01((t - times[j]) / (times[j + 1] - times[j])) : 0;
    ticks.push(desde + k); poses.push(poseMezcla(cfg, abierta, cerrada, a.map((v, i) => v + (b[i] - v) * u)));
  }
  const pistas = {};
  for (const h of Object.keys(poses[0])) {
    const r = poses.map((p) => p[h].r), t = poses.map((p) => p[h].t);
    const quedan = new Set([...simplify(ticks, r, tol), ...simplify(ticks, t, 0.02)]);
    pistas[h] = { keyframes: [...quedan].sort((a, b) => a - b).map((i) => keyframe(ticks[i], poses[i][h])), type: 'pose_transform' };
  }
  return pistas;
}

/**
 * La parte de dedos de una mano del actor: la busca (colgada de esa mano) o la agrega. Devuelve su indice.
 * modeloCuerpo: el modelo del actor (para saber de qué hueso cuelga la mano).
 */
export function parteMano(rep, cfg, lado, abierta, modeloCuerpo, transform = {}) {
  const form = (rep.form ??= {}); const partes = (form.parts ??= []);
  const hueso = huesoMano(modeloCuerpo || form.model, lado);
  let idx = partes.findIndex((p) => p && p.bone === hueso && /dedos|fingers/i.test(String((p.form || {}).model || '')));
  if (idx < 0) {
    const m = clonar(PARTE_DEDOS);
    const nom = lado === 'L' ? 'ManoIzq' : 'ManoDer';
    m.bone = hueso; m.form.name = nom; m.form.track_name = nom.toLowerCase();
    partes.push(m); idx = partes.length - 1;
  }
  const p = partes[idx];
  p.form.model = cfg.id(lado);
  // el modelo dedos toma la textura de la skin del actor; Fingers trae la suya
  p.form.texture = cfg.texturaPropia ? '' : clonar(form.texture ?? '');
  p.form.pose = { pose: clonar((abierta && abierta.pose) || abierta || {}) };
  p.transform = clonar(transform || {});   // (vacío en los bends; en emoticons, lo que haga falta para la punta del brazo)
  return idx;
}

/**
 * Escribe los dedos de una mano en el actor (agrega la parte si no está). Devuelve { parte, keyframes }.
 * mano: { cfg, abierta, cerrada } (poses del modelo), serie: { times, curls }.
 */
export function ponerMano(rep, lado, mano, serie, { desde = 0, modeloCuerpo = '' } = {}) {
  const idx = parteMano(rep, mano.cfg, lado, mano.abierta, modeloCuerpo, mano.transform);
  const pistas = pistasMano(mano.cfg, mano.abierta, mano.cerrada, serie.times, serie.curls, { desde });
  rep.animation ??= {};
  for (const k of Object.keys(rep.animation)) if (k.startsWith(idx + '/pose/')) delete rep.animation[k];   // las de antes
  let n = 0;
  for (const [h, p] of Object.entries(pistas)) { rep.animation[`${idx}/pose/${h}`] = p; n += p.keyframes.length; }
  return { parte: idx, keyframes: n, pistas };
}

/** Pistas de BBS de una mano -> como las usa la vista 3D: { hueso: [{t (tick), tr, s, r, i}] }. */
export function pistasParaVista(pistas) {
  const out = {};
  for (const [h, p] of Object.entries(pistas || {})) {
    out[h] = (p.keyframes || []).map((k) => ({ t: num(k.tick), tr: vec(k.value && k.value.t, [0, 0, 0]), s: vec(k.value && k.value.s, [1, 1, 1]), r: vec(k.value && k.value.r, [0, 0, 0]), i: String(k.interp || 'linear') }))
      .sort((a, b) => a.t - b.t);
  }
  return out;
}
/** Pose de reposo para la vista: { hueso: {t, s, r} }. */
export function reposoParaVista(pose) {
  const p = (pose && pose.pose) || pose || {};
  return Object.fromEntries(Object.entries(p).map(([h, v]) => [h, transf(v)]));
}
