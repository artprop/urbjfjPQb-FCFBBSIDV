// Estilo "A mano": cada fotograma marcado se vuelve una pose de 4 keyframes. Port de manual.py.
//   [exterior antes] [interior A] [interior B] [exterior despues]
//       default        la pose      la pose        default
// Si una pose se une con la siguiente, entre ambas no hay pose por defecto.
// (Guardar y leer las marcas lo hace el almacen local; aca solo esta la logica.)
import * as M from './mat.js';
import { keyframe } from './pistas.js';

export const TICKS = 20;
export const POR_DEFECTO = { sostener: 10, antes: 8, despues: 8, unir: false };

export function normalizar(poses) {
  const out = [];
  for (const p of poses || []) {
    const t = Number(p?.t);
    if (p == null || p.t == null || !Number.isFinite(t)) continue;
    const q = { t: Math.max(0, M.roundTo(t, 3)) };
    for (const k of ['sostener', 'antes', 'despues']) {
      const v = Number(p[k] ?? POR_DEFECTO[k]);
      q[k] = Number.isFinite(v) ? Math.max(1, M.roundHalfEven(v)) : POR_DEFECTO[k];
    }
    q.unir = Boolean(p.unir);
    out.push(q);
  }
  out.sort((a, b) => a.t - b.t);
  if (out.length) out[out.length - 1].unir = false;
  return out;
}

// Ticks (desde el inicio del video) de cada pose: A, B y los exteriores (null si se une con la vecina).
export function disposicion(posesIn) {
  const poses = normalizar(posesIn);
  const out = poses.map((p) => {
    const c = M.roundHalfEven(p.t * TICKS);
    const a = Math.max(0, c - Math.floor(p.sostener / 2));
    return { t: p.t, A: a, B: a + p.sostener, antes: p.antes, despues: p.despues, unir: p.unir };
  });
  for (let i = 1; i < out.length; i++) {
    if (out[i].A <= out[i - 1].B) { out[i].A = out[i - 1].B + 1; out[i].B = Math.max(out[i].B, out[i].A); }
  }
  out.forEach((p, i) => {
    p.ext_antes = (i > 0 && out[i - 1].unir) ? null : Math.max(0, p.A - p.antes);
    p.ext_despues = p.unir ? null : p.B + p.despues;
  });
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i], b = out[i + 1];
    if (a.ext_despues !== null && b.ext_antes !== null && a.ext_despues > b.ext_antes) {
      const m = Math.floor((a.B + b.A) / 2);
      a.ext_despues = b.ext_antes = (b.A - a.B > 1) ? Math.max(a.B + 1, Math.min(m, b.A - 1)) : null;
    }
  }
  return out;
}

export function construir(result, poses, desde = 0, interp = 'sine_inout') {
  const disp = disposicion(poses);
  if (!disp.length) throw new Error('No hay poses marcadas.');
  const cero = [0, 0, 0];
  const tracks = {}, stats = {};
  for (const [bone, r] of Object.entries(result)) {
    const comp = [0, 1, 2].map((k) => r.eul.map((e) => e[k]));
    const kfs = new Map();
    for (const p of disp) {
      const val = comp.map((c) => M.interp(p.t, r.t, c));
      if (p.ext_antes !== null) kfs.set(p.ext_antes, cero);
      kfs.set(p.A, val); kfs.set(p.B, val);
      if (p.ext_despues !== null && !kfs.has(p.ext_despues)) kfs.set(p.ext_despues, cero);
    }
    if (Math.min(...kfs.keys()) > 0) kfs.set(0, cero);
    const out = [...kfs.keys()].sort((a, b) => a - b).map((tick) => {
      const k = keyframe(tick + desde, kfs.get(tick)); k.interp = interp; return k;
    });
    tracks['pose/' + bone] = { keyframes: out, type: 'pose_transform' };
    stats[bone] = [r.t.length, out.length];
  }
  return { tracks, stats, nPoses: disp.length };
}
