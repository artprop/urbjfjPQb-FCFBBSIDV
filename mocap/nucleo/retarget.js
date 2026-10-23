// Retargeting: puntos del cuerpo (MediaPipe) -> rotaciones de huesos de BBS. Port de retarget.py.
//
// Ejes de BBS (verificados con el film de calibracion en steve_bends):
//   X = derecha del personaje, Y = arriba, Z = espalda (el personaje mira hacia -Z). R = Rz * Ry * Rx.
// Jerarquia: anchor (solo giro Y) -> pelvis; low_body -> head, brazos -> codos; piernas -> rodillas.
import * as M from './mat.js';

export const NOSE = 0, L_EAR = 7, R_EAR = 8;
export const L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16;
export const L_PINKY = 17, R_PINKY = 18, L_INDEX = 19, R_INDEX = 20;
export const L_HIP = 23, R_HIP = 24, L_KN = 25, R_KN = 26, L_AN = 27, R_AN = 28;

export const NEEDS = {
  anchor: [L_HIP, R_HIP],
  low_body: [L_SH, R_SH, L_HIP, R_HIP],
  head: [NOSE, L_EAR, R_EAR, L_SH, R_SH],
  right_arm: [R_SH, R_EL, R_WR, L_SH],
  right_elbow: [R_SH, R_EL, R_WR],
  left_arm: [L_SH, L_EL, L_WR, R_SH],
  left_elbow: [L_SH, L_EL, L_WR],
  right_leg: [R_HIP, R_KN, R_AN, L_HIP],
  right_knee: [R_HIP, R_KN, R_AN],
  left_leg: [L_HIP, L_KN, L_AN, R_HIP],
  left_knee: [L_HIP, L_KN, L_AN],
};
export const BONES = Object.keys(NEEDS);
// La mano (solo emoticons/steve: su brazo tiene un tercer hueso, la punta "low_*_arm.end"): se mide con el meñique y el índice de MediaPipe.
export const NEEDS_MANOS = {
  right_hand: [R_SH, R_EL, R_WR, L_SH, R_PINKY, R_INDEX],
  left_hand: [L_SH, L_EL, L_WR, R_SH, L_PINKY, L_INDEX],
};
export const MANOS = Object.keys(NEEDS_MANOS);
const GIRO_MAX_MUNECA = 1.3;   // radianes (~75 grados): la muñeca no dobla más

const UP = [0, 1, 0], DOWN = [0, -1, 0], BACK = [0, 0, 1];
export const UMBRAL_VIDEO = [0.15, 0.35], UMBRAL_LIMPIO = [0.03, 0.08];

function frame(x, yHint) {
  x = M.unit(x);
  const y = M.unit(M.sub(yHint, M.mul(x, M.dot(yHint, x))));
  return M.cols(x, y, M.cross(x, y));
}

function swing(a, b) {
  a = M.unit(a); b = M.unit(b);
  const c = M.dot(a, b);
  if (c > 1 - 1e-9) return M.eye();
  if (c < -1 + 1e-9) return M.fromRotvec([Math.PI, 0, 0]);
  return M.fromRotvec(M.mul(M.unit(M.cross(a, b)), Math.acos(M.clip(c, -1, 1))));
}

// Rotacion de un hueso largo (brazo o pierna) y angulo de su articulacion. bendSign: -1 codo, +1 rodilla.
// umbral: [desde, ancho] en radianes del doblez a partir del cual manda el plano del doblez (con video conviene alto:
// con codos casi rectos el plano es puro ruido; con una animacion importada los datos son limpios y puede ser bajo).
// zLocal (opcional): hacia donde mira la "espalda" del hueso, si se sabe (animacion importada: sale del giro del hueso
// original). Sin eso se adivina con el giro minimo desde abajo, que se da vuelta de golpe con el brazo arriba o recto.
export function limb(dLocal, fLocal, bendSign, umbral = UMBRAL_VIDEO, zLocal = null) {
  const d = M.unit(dLocal), f = M.unit(fLocal);
  const bend = Math.acos(M.clip(M.dot(d, f), -1, 1));
  let zRef = M.mv(swing(DOWN, d), BACK);
  if (zLocal) { const zp = M.sub(zLocal, M.mul(d, M.dot(zLocal, d))); if (M.norm(zp) > 1e-6) zRef = M.unit(zp); }
  const perp = M.sub(f, M.mul(d, M.dot(f, d)));
  let w = M.clip((bend - umbral[0]) / umbral[1], 0, 1);
  let z = zRef;
  if (M.norm(perp) > 1e-6 && w > 0) {
    const zBend = M.mul(M.unit(perp), bendSign);
    // con el giro real del hueso: el plano del codo solo manda si se parece (codo de bisagra); si el codo del original se
    // tuerce (codo casi cerrado, movimientos rapidos) se queda el giro real y el antebrazo se aproxima: si no, el brazo
    // daria vueltas de golpe para clavar el antebrazo
    if (zLocal) w *= M.clip((M.dot(zBend, zRef) - Math.cos(1.05)) / (Math.cos(0.52) - Math.cos(1.05)), 0, 1);
    z = M.unit(M.add(M.mul(zBend, w), M.mul(zRef, 1 - w)));
  }
  const y = M.mul(d, -1);
  z = M.unit(M.sub(z, M.mul(y, M.dot(z, y))));
  return [M.cols(M.cross(y, z), y, z), bend];
}

export const mpToBbs = (p) => [-p[0], -p[1], p[2]];

export function pelvisYTorso(P) {
  const hipMid = M.mul(M.add(P[L_HIP], P[R_HIP]), 0.5);
  const shMid = M.mul(M.add(P[L_SH], P[R_SH]), 0.5);
  let hx = M.sub(P[R_HIP], P[L_HIP]); hx[1] = 0;
  if (M.norm(hx) < 1e-6) hx = [1, 0, 0];
  return [frame(hx, UP), frame(M.sub(P[R_SH], P[L_SH]), M.sub(shMid, hipMid))];
}

export function solveFrame(P, torsoW = null, umbral = UMBRAL_VIDEO, giros = null) {
  const out = {};
  const [pelvis, torsoMedido] = pelvisYTorso(P);
  out.anchor = pelvis;
  if (!torsoW) torsoW = torsoMedido;
  out.low_body = M.mm(M.T(pelvis), torsoW);

  const earMid = M.mul(M.add(P[L_EAR], P[R_EAR]), 0.5);
  const hx = M.unit(M.sub(P[R_EAR], P[L_EAR]));
  const fwd = M.sub(P[NOSE], earMid);
  const z = M.mul(M.unit(M.sub(fwd, M.mul(hx, M.dot(fwd, hx)))), -1);
  const headW = M.cols(hx, M.cross(z, hx), z);
  out.head = M.mm(M.T(torsoW), headW);

  const tT = M.T(torsoW), pT = M.T(pelvis);
  for (const [side, sh, el, wr] of [['right', R_SH, R_EL, R_WR], ['left', L_SH, L_EL, L_WR]]) {
    const g = giros && giros[side + '_arm'];
    const [R, bend] = limb(M.mv(tT, M.sub(P[el], P[sh])), M.mv(tT, M.sub(P[wr], P[el])), -1, umbral, g ? M.mv(tT, g) : null);
    out[side + '_arm'] = R;
    out[side + '_elbow'] = M.fromRotvec([bend, 0, 0]);
    out[side + '_hand'] = mano(R, bend, M.mv(tT, M.sub(P[side === 'right' ? R_INDEX : L_INDEX], P[wr])), M.mv(tT, M.sub(P[side === 'right' ? R_PINKY : L_PINKY], P[wr])));
  }
  for (const [side, hp, kn, an] of [['right', R_HIP, R_KN, R_AN], ['left', L_HIP, L_KN, L_AN]]) {
    const g = giros && giros[side + '_leg'];
    const [R, bend] = limb(M.mv(pT, M.sub(P[kn], P[hp])), M.mv(pT, M.sub(P[an], P[kn])), +1, umbral, g ? M.mv(pT, g) : null);
    out[side + '_leg'] = R;
    out[side + '_knee'] = M.fromRotvec([-bend, 0, 0]);
  }
  return out;
}

// Giro de la mano respecto del antebrazo: del antebrazo (que en reposo apunta hacia abajo, -Y) hacia la mano (muñeca -> medio entre meñique e índice).
// Es un giro mínimo (sin torsión), con tope. dedoI / dedoM: vectores muñeca -> índice y muñeca -> meñique en el marco del torso.
function mano(Rbrazo, bend, dedoI, dedoM) {
  const hacia = M.mul(M.add(dedoI, dedoM), 0.5);
  if (M.norm(hacia) < 1e-6) return M.eye();
  const antebrazo = M.mm(Rbrazo, M.fromRotvec([bend, 0, 0]));
  const d = M.unit(M.mv(M.T(antebrazo), hacia));
  const c = M.clip(M.dot(DOWN, d), -1, 1), ang = Math.acos(c);
  if (ang < 1e-6) return M.eye();
  let eje = M.cross(DOWN, d);
  if (M.norm(eje) < 1e-9) return M.eye();
  return M.fromRotvec(M.mul(M.unit(eje), Math.min(ang, GIRO_MAX_MUNECA)));
}

export const toEuler = M.toEuler;
export const fromEuler = M.fromEuler;

const pyMod = (a, n) => a - n * Math.floor(a / n);
const wrapNear = (c, ref) => c.map((v, k) => ref[k] + pyMod(v - ref[k] + Math.PI, 2 * Math.PI) - Math.PI);

// Angulos equivalentes a R lo mas parecidos a ref (sin saltos de 180/360 grados, estable cerca del bloqueo).
export function eulerNear(R, ref) {
  const [x, y, z] = M.toEuler(R);
  const cands = [[x, y, z], [x + Math.PI, Math.PI - y, z + Math.PI]];
  if (Math.abs(Math.cos(y)) < 0.25) {
    const Mx = M.mm(R, M.T(M.fromRotvec([ref[0], 0, 0])));
    const yy = Math.atan2(-Mx[2][0], Mx[2][2]), zz = Math.atan2(-Mx[0][1], Mx[1][1]);
    const c = [ref[0], yy, zz];
    if (M.frob(M.fromEuler(c), R) < 0.1) cands.push(c);
  }
  let best = null, bestD = Infinity;
  for (const c0 of cands) {
    const c = wrapNear(c0, ref);
    const d = Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

const visOk = (vis, i, idxs, vmin) => idxs.every((k) => vis[i][k] >= vmin);

/**
 * Convierte una secuencia de puntos en angulos por hueso.
 * world: N x 33 x [x,y,z] (mundo de MediaPipe); vis: N x 33; times: N segundos.
 * Devuelve { result: {hueso: {t, eul (N x 3), tapada (N bool)}}, report: [texto] }.
 */
export function compute(world, vis, times, o = {}) {
  const smoothS = o.smooth_s ?? 0.06, visMin = o.vis_min ?? 0.5, neutralS = o.neutral_s ?? 1.0;
  let neutralBones = o.neutral_bones ?? ['head', 'low_body'];
  const minCoverage = o.min_coverage ?? 0.4, holdFrames = o.hold_frames ?? 3;
  const limpio = Boolean(o.limpio);
  // giros: { left_arm: N x [x,y,z] (ejes de MediaPipe), ... } la espalda de cada hueso largo, si se sabe (animacion importada)
  const giros = o.giros ? Object.fromEntries(Object.entries(o.giros).map(([k, v]) => [k, v.map((g) => [-g[0], -g[1], g[2]])])) : null;   // datos sin ruido (animacion importada): sin mediana y codos/rodillas con umbral bajo
  const torso = o.torso ?? null, torsoActivo = o.torso_activo ?? true, torsoSuaveS = o.torso_suave_s ?? 0.4;
  const bones = o.bones || BONES;
  const N = times.length, report = [];
  if (N < 2) throw new Error('el video no tiene suficientes cuadros con una persona detectada');

  // suavizado temporal de los puntos: mediana corta (borra saltos sueltos) y despues gaussiano
  const diffs = []; for (let i = 1; i < N; i++) diffs.push(times[i] - times[i - 1]);
  const dt = M.median(diffs);
  const sigma = Math.max(smoothS / dt, 0.01), pesos = M.gaussianWeights(sigma);
  const P = Array.from({ length: N }, () => Array.from({ length: 33 }, () => [0, 0, 0]));
  for (let k = 0; k < 33; k++) for (let c = 0; c < 3; c++) {
    let serie = Float64Array.from(world, (f) => f[k][c]);
    if (N >= 5 && !limpio) serie = M.median1d(serie, 5);
    serie = M.gaussian1d(serie, sigma, pesos);
    for (let i = 0; i < N; i++) P[i][k][c] = c < 2 ? -serie[i] : serie[i];   // ejes de MediaPipe -> BBS
  }

  // Torso amortiguado: el cero es la postura mas comun de la toma, la inclinacion se multiplica por `torso`
  let torsoW = null;
  if (torso !== null && torso !== undefined) {
    const pelv = [], torsoMed = [];
    for (let i = 0; i < N; i++) { const [a, b] = pelvisYTorso(P[i]); pelv.push(a); torsoMed.push(b); }
    let Rl;
    if (torsoActivo) {
      let okT = Array.from({ length: N }, (_, i) => visOk(vis, i, NEEDS.low_body, visMin));
      if (okT.filter(Boolean).length < 3) okT = okT.map(() => true);
      const idx = []; okT.forEach((v, i) => { if (v) idx.push(i); });
      let eul = []; let ref = [0, 0, 0];
      for (const i of idx) { ref = eulerNear(M.mm(M.T(pelv[i]), torsoMed[i]), ref); eul.push(ref); }
      eul = Array.from({ length: N }, (_, i) => eul[M.clip(M.searchsorted(idx, i, 'right') - 1, 0, idx.length - 1)]);
      const med = [0, 1, 2].map((c) => M.median(eul.map((e) => e[c])));
      const gan = [torso, 1.0, Math.min(1.0, torso * 1.5)];
      const sig2 = Math.max(torsoSuaveS / dt, 0.01), pes2 = M.gaussianWeights(sig2);
      const comp = [0, 1, 2].map((c) => M.gaussian1d(Float64Array.from(eul, (e) => (e[c] - med[c]) * gan[c]), sig2, pes2));
      Rl = Array.from({ length: N }, (_, i) => M.fromEuler([comp[0][i], comp[1][i], comp[2][i]]));
    } else {
      Rl = Array.from({ length: N }, () => M.eye());
    }
    torsoW = pelv.map((p, i) => M.mm(p, Rl[i]));
    neutralBones = neutralBones.filter((b) => b !== 'low_body');
  }

  const mats = {}; for (const b of bones) mats[b] = new Array(N);
  for (let i = 0; i < N; i++) {
    const sol = solveFrame(P[i], torsoW ? torsoW[i] : null, limpio ? UMBRAL_LIMPIO : UMBRAL_VIDEO,
      giros && Object.fromEntries(Object.entries(giros).map(([k, v]) => [k, v[i]])));
    for (const b of bones) mats[b][i] = sol[b];
  }

  const result = {};
  for (const b of bones) {
    const ok = Array.from({ length: N }, (_, i) => visOk(vis, i, NEEDS[b] || NEEDS_MANOS[b], visMin));
    const cov = ok.filter(Boolean).length / N;
    if (cov < minCoverage) { report.push(`  ${b.padEnd(12)} omitido (visible solo ${Math.round(cov * 100)}% del tiempo)`); continue; }
    let Ms = mats[b];
    if (neutralBones.includes(b)) {
      const sel = []; for (let i = 0; i < N; i++) if (ok[i] && times[i] - times[0] <= neutralS) sel.push(Ms[i]);
      if (sel.length >= 3) {
        const RnT = M.T(M.meanRotation(sel));
        Ms = Ms.map((m) => M.mm(m, RnT));
      }
    }
    let okS = holdFrames > 0 ? M.erosion(ok, holdFrames) : ok;
    if (okS.filter(Boolean).length < 3) okS = ok;
    const idx = []; okS.forEach((v, i) => { if (v) idx.push(i); });
    const eulOk = []; let ref = [0, 0, 0];
    for (const i of idx) { ref = eulerNear(Ms[i], ref); eulOk.push(ref); }
    const full = Array.from({ length: N }, (_, i) => eulOk[M.clip(M.searchsorted(idx, i, 'right') - 1, 0, idx.length - 1)].slice());
    result[b] = { t: Float64Array.from(times), eul: full, tapada: okS.map((v) => !v) };
    if (cov < 0.999) report.push(`  ${b.padEnd(12)} visible ${Math.round(cov * 100)}% del tiempo (tapada: queda en su ultima pose visible)`);
  }
  return { result, report };
}

// Reduce keyframes (Ramer-Douglas-Peucker) manteniendo el error por debajo de tol radianes. Devuelve indices.
export function simplify(t, v, tol) {
  const n = t.length;
  if (n <= 2 || tol <= 0) return Array.from({ length: n }, (_, i) => i);
  const keep = new Array(n).fill(false); keep[0] = keep[n - 1] = true;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    let k = -1, errMax = -Infinity;
    for (let i = a + 1; i < b; i++) {
      const u = (t[i] - t[a]) / (t[b] - t[a]);
      let e = 0;
      for (let c = 0; c < 3; c++) e = Math.max(e, Math.abs(v[i][c] - (v[a][c] + u * (v[b][c] - v[a][c]))));
      if (e > errMax) { errMax = e; k = i; }
    }
    if (errMax > tol) { keep[k] = true; stack.push([a, k], [k, b]); }
  }
  const out = []; keep.forEach((x, i) => { if (x) out.push(i); });
  return out;
}
