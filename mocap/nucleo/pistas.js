// Keyframes de BBS y estilo "Realista" (copia fiel reducida). Port de keyframe() y pistas_realistas() de mocap_core.py.
import * as M from './mat.js';
import { F, I } from './bbsdat.js';
import { simplify } from './retarget.js';

export const TICKS = 20;

export function keyframe(tick, r) {
  return {
    tick: F(Number(tick)),
    value: { color: I(-1), fix: F(0.0), lighting: F(0.0), r: r.map((v) => F(Number(v))), s: [F(1.0), F(1.0), F(1.0)], t: [F(0.0), F(0.0), F(0.0)] },
  };
}

// Un keyframe por tick (reducido con tolerancia): copia fiel del movimiento.
export function pistasRealistas(result, desde = 0, tol = 0.02) {
  const tracks = {}, stats = {};
  for (const [bone, r] of Object.entries(result)) {
    const t = r.t;
    if (!t.length) continue;
    const comp = [0, 1, 2].map((k) => r.eul.map((e) => e[k]));
    let ticks = [];
    for (let tk = Math.ceil(t[0] * TICKS); tk <= Math.floor(t[t.length - 1] * TICKS); tk++) ticks.push(tk);
    ticks = ticks.filter((tk) => {
      const tt = tk / TICKS;
      const j = M.clip(M.searchsorted(t, tt), 0, t.length - 1);
      return Math.abs(t[j] - tt) < 0.25;
    });
    const v = ticks.map((tk) => [0, 1, 2].map((k) => M.interp(tk / TICKS, t, comp[k])));
    const keep = [];
    let ini = 0;
    for (let i = 1; i <= ticks.length; i++) {
      if (i === ticks.length || ticks[i] - ticks[i - 1] > 1) {
        const seg = ticks.slice(ini, i), vs = v.slice(ini, i);
        for (const j of simplify(seg, vs, tol)) keep.push(ini + j);
        ini = i;
      }
    }
    tracks['pose/' + bone] = { keyframes: keep.map((i) => keyframe(ticks[i] + desde, v[i])), type: 'pose_transform' };
    stats[bone] = [ticks.length, keep.length];
  }
  return { tracks, stats };
}
