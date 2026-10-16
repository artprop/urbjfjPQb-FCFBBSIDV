// Modo "Estilo Minecraft": captura continua -> animacion pose a pose. Port de estilo.py.
// Todo el cuerpo cambia de pose a la vez, cada pose se sostiene, transiciones cortas sine_inout que llegan
// a la pose en el mismo momento que el actor real (sincronia con la voz).
import * as M from './mat.js';
import { eulerNear, fromEuler } from './retarget.js';
import { keyframe } from './pistas.js';

export const TICKS = 20;

export const OPCIONES_ESTILO = {
  transicion_min: 6, transicion_max: 12, velocidad_transicion: 0.6, quietud_gps: 60.0, pose_min: 4,
  detalle_grados: 15.0, cambio_min_grados: 6.0, neutral_grados: 8.0, interp: 'sine_inout',
};

function grid(result) {
  const vals = Object.values(result);
  const tEnd = Math.max(...vals.map((r) => r.t[r.t.length - 1]));
  const T = Math.floor(tEnd * TICKS) + 1;
  const ticks = Array.from({ length: T }, (_, i) => i);
  const curves = {};
  for (const [b, r] of Object.entries(result)) {
    const comp = [0, 1, 2].map((k) => r.eul.map((e) => e[k]));
    curves[b] = ticks.map((tk) => [0, 1, 2].map((k) => M.interp(tk / TICKS, r.t, comp[k])));
  }
  return { ticks, curves };
}

function rdpMulti(v, tol) {
  const n = v.length;
  if (n <= 2) return [0, n - 1];
  const keep = new Set([0, n - 1]); const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    let k = -1, errMax = -Infinity;
    for (let i = a + 1; i < b; i++) {
      const u = (i - a) / (b - a);
      let e = 0;
      for (let c = 0; c < v[i].length; c++) e = Math.max(e, Math.abs(v[i][c] - (v[a][c] + u * (v[b][c] - v[a][c]))));
      if (e > errMax) { errMax = e; k = i; }
    }
    if (errMax > tol) { keep.add(k); stack.push([a, k], [k, b]); }
  }
  return [...keep].sort((x, y) => x - y);
}

const medianaFilas = (rows) => rows[0].map((_, c) => M.median(rows.map((r) => r[c])));

export function posesClave(ticks, curves, op) {
  const bones = Object.keys(curves);
  const T = ticks.length;
  const Mx = ticks.map((_, i) => bones.flatMap((b) => curves[b][i]));
  const D = Mx[0].length;
  let vel = new Float64Array(T);
  for (let c = 0; c < D; c++) {
    const g = M.gradient(Mx.map((r) => r[c]));
    for (let i = 0; i < T; i++) vel[i] = Math.max(vel[i], Math.abs(M.degrees(g[i])));
  }
  vel = M.uniform3(vel.map((x) => x * TICKS));
  const quieto = Array.from(vel, (x) => x < op.quietud_gps);

  const holds = [];
  let i = 0;
  while (i < T) {
    if (quieto[i]) {
      let j = i;
      while (j + 1 < T && quieto[j + 1]) j++;
      if (j - i + 1 >= op.pose_min || i === 0 || j === T - 1) holds.push([i, j]);
      i = j + 1;
    } else i++;
  }
  if (!holds.length || holds[0][0] !== 0) holds.unshift([0, 0]);
  if (holds[holds.length - 1][1] !== T - 1) holds.push([T - 1, T - 1]);

  const tol = M.radians(op.detalle_grados);
  const out = [];
  holds.forEach(([a, b], n) => {
    const pose = medianaFilas(Mx.slice(a, b + 1));
    out.push([a, b, pose]);
    if (n + 1 < holds.length) {
      const c = holds[n + 1][0];
      if (c - b > 2) {
        const seg = Mx.slice(b, c + 1).map((r) => r.slice());
        seg[0] = pose; seg[seg.length - 1] = medianaFilas(Mx.slice(c, holds[n + 1][1] + 1));
        let ult = b;
        for (const k of rdpMulti(seg, tol).slice(1, -1)) {
          if (b + k - ult >= op.transicion_min && c - (b + k) >= op.transicion_min) {
            out.push([b + k, b + k, Mx[b + k]]); ult = b + k;
          }
        }
      }
    }
  });
  return out.map(([a, b, pose]) => [a, b, Object.fromEntries(bones.map((bn, k) => [bn, pose.slice(3 * k, 3 * k + 3)]))]);
}

// result: salida de retarget.compute. Devuelve { tracks, stats, nPoses }.
export function construir(result, opIn = {}, desde = 0) {
  const op = { ...OPCIONES_ESTILO, ...opIn };
  const { ticks, curves } = grid(result);
  const poses = posesClave(ticks, curves, op);
  const bones = Object.keys(curves);
  const minC = M.radians(op.cambio_min_grados), neu = M.radians(op.neutral_grados);
  const angulo = (Ra, Rb) => M.magnitude(M.mm(M.T(Ra), Rb));

  const valores = {};
  for (const b of bones) {
    valores[b] = [];
    let prevV = [0, 0, 0], prevR = M.eye(), first = true;
    for (const [, , pose] of poses) {
      let R = fromEuler(pose[b]), v;
      if (M.magnitude(R) < neu) { v = [0, 0, 0]; R = M.eye(); }
      else if (!first && angulo(prevR, R) < minC) { v = prevV; R = prevR; }
      else v = eulerNear(R, prevV);
      valores[b].push(v); prevV = v; prevR = R; first = false;
    }
  }

  const llegada = poses.map((p) => p[0]), salida = poses.map((p) => p[1]);
  const tiempos = [];
  for (let i = 1; i < poses.length; i++) {
    const real = llegada[i] - salida[i - 1];
    let d = M.roundHalfEven(M.clip(real * op.velocidad_transicion, op.transicion_min, op.transicion_max));
    d = Math.max(1, Math.min(d, llegada[i] - llegada[i - 1]));
    tiempos.push([llegada[i] - d, llegada[i]]);
  }

  const tracks = {}, stats = {};
  for (const b of bones) {
    const vals = valores[b];
    const keys = [[0, vals[0]]];
    for (let i = 1; i < poses.length; i++) {
      if (Math.max(...vals[i].map((x, c) => Math.abs(x - vals[i - 1][c]))) < 1e-9) continue;
      const [ini, fin] = tiempos[i - 1];
      if (ini > keys[keys.length - 1][0]) keys.push([ini, vals[i - 1]]);
      keys.push([fin, vals[i]]);
    }
    const kfs = keys.map(([tk, v]) => { const k = keyframe(tk + desde, v); k.interp = op.interp; return k; });
    tracks['pose/' + b] = { keyframes: kfs, type: 'pose_transform' };
    stats[b] = [ticks.length, kfs.length];
  }
  return { tracks, stats, nPoses: poses.length };
}
