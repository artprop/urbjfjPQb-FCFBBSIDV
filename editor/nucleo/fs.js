// Films de BBS FS en el Editor. El Editor trabaja por dentro con la forma de BBS 2.2 (props/animation y cámaras bbs:movement);
// un film FS se convierte al abrirlo (para ver a los actores moverse y editar cámaras) y al exportar se vuelve a escribir en FS:
// sale el film original con las cámaras nuevas. Lo demás del film (actores, poses, audio…) se guarda tal cual vino.
import { B, D, F, I, num, clonar } from '../../mocap/nucleo/bbsdat.js';
import { clipFSCanales } from '../../director/nucleo/formato.js';
import * as FM from './film.js';

/** ¿Es un film de BBS FS? (los actores guardan sus pistas en `keyframes`, no en `props`/`animation`) */
export const esFS = (film) => (film.replays || []).some((r) => r && r.keyframes !== undefined && r.animation === undefined);

const CANALES = ['x', 'y', 'z', 'yaw', 'pitch', 'fov'];
const TIPOS_CONVERTIBLES = new Set(['bbs:idle', 'bbs:keyframe']);

function kfDe(c, k) { return ((c[k] || {}).keyframes) || []; }
const valorKf = (kf, def = 0) => (kf.length ? num(kf[0].value) : def);
function pistaEditor(kf) {
  return { $anim: { v: D(kf.length ? num(kf[0].value) : 0), track: { keyframes: kf.map((q) => ({ ...(q.interp ? { interp: q.interp } : {}), tick: F(num(q.tick)), value: D(num(q.value)) })), type: 'double' } } };
}

/** Un clip de cámara de FS (idle / keyframe) como cámara del Editor; null si no se puede. */
function camaraDeFS(c) {
  const ini = num(c.tick), dur = num(c.duration), titulo = c.title || (c.type === 'bbs:idle' ? 'Cámara quieta' : 'Cámara');
  if (c.type === 'bbs:idle') {
    const p = c.position || {}, a = p.angle || {}, pt = p.point || {};
    const m = FM.nuevaToma({ camera: [] }, ini, dur, { x: num(pt.x), y: num(pt.y), z: num(pt.z), yaw: num(a.yaw), pitch: num(a.pitch), fov: num(a.fov) || 50 }, titulo);
    m.layer = I(num(c.layer ?? 0)); m.roll = D(num(a.roll ?? 0));
    return m;
  }
  if (c.type === 'bbs:keyframe' && !num(c.additive ?? 0)) {
    const m = FM.nuevaToma({ camera: [] }, ini, dur, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 50 }, titulo);
    m.layer = I(num(c.layer ?? 0));
    for (const k of CANALES) { const kf = kfDe(c, k); m[k] = pistaEditor(kf.length ? kf : [{ tick: 0, value: k === 'fov' ? 50 : 0 }]); }
    m.roll = D(valorKf(kfDe(c, 'roll')));
    return m;
  }
  return null;
}

/** Convierte un film FS: devuelve { film (para el Editor), fs: { original, resto } }. resto = clips de cámara que el Editor no sabe mostrar (se conservan). */
export function aEditor(fs) {
  const ed = { replays: [], camera: [], markers: [] };
  for (const r of fs.replays || []) {
    const props = {};
    for (const [k, v] of Object.entries(r.keyframes || {})) {
      if (!v || v.type !== 'double') continue;
      const kf = v.keyframes || [];
      props[k] = pistaEditor(kf);
    }
    ed.replays.push({ form: clonar(r.form || {}), label: r.label ?? '', name_tag: r.name_tag ?? '', props, animation: {}, actions: [], enabled: B(num(r.enabled ?? 1)), shadow: B(1) });
  }
  const resto = [];
  for (const c of fs.camera || []) {
    const m = TIPOS_CONVERTIBLES.has(c.type) ? camaraDeFS(c) : null;
    if (m) ed.camera.push(m); else resto.push(c);
  }
  return { film: ed, fs: { original: fs, resto } };
}

/** Una cámara del Editor como clip de BBS FS. */
export function camaraAFS(c) {
  const canales = {};
  for (const k of CANALES) {
    const kf = (c[k] && c[k].$anim && c[k].$anim.track && c[k].$anim.track.keyframes) || [];
    canales[k] = kf.length ? [...kf].sort((a, b) => num(a.tick) - num(b.tick)).map((q) => ({ tick: num(q.tick), value: num(q.value), interp: q.interp })) : [{ tick: 0, value: FM.vistaToma(c, num(c.tick))[k] }];
  }
  return clipFSCanales({ titulo: c.title || '', capa: num(c.layer ?? 0), desde: num(c.tick), dur: num(c.duration), canales, roll: num(c.roll ?? 0) });
}

/** El film FS para guardar: el original con las cámaras que quedaron en el Editor. */
export function aFS(estado, editor) {
  const f = clonar(estado.original);
  f.camera = [...estado.resto.map((c) => clonar(c)), ...FM.tomas(editor).map(camaraAFS)];
  return f;
}
