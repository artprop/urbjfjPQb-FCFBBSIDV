// Los dos formatos de film que maneja el Director para las cámaras:
//  - 'fs'  = BBS FS: cada actor guarda sus pistas en `keyframes` (x, y, z, yaw…) y las cámaras son clips propios (bbs:idle, bbs:keyframe, bbs:dolly, bbs:orbit…).
//  - 'b22' = el formato que ya leía el Editor (BBS 2.2): pistas en `props`/`animation` y cámaras `bbs:movement`.
// (El formato de BBS 2.0 queda por hacer: hace falta un film de ejemplo.)
import { B, D, F, I, num } from '../../mocap/nucleo/bbsdat.js';
import { clipDe } from './camaras_auto.js';

export const FORMATOS = {
  fs: 'BBS FS',
  b22: 'BBS 2.2 (el del Editor)',
};

/** Qué formato tiene un film ya leído: 'fs', 'b22' o null si no se reconoce. */
export function detectar(film) {
  const reps = film.replays || [];
  if (reps.some((r) => r && r.animation !== undefined && r.props !== undefined)) return 'b22';
  if (reps.some((r) => r && r.keyframes !== undefined)) return 'fs';
  return reps.length ? null : 'fs';
}

const PISTAS = ['x', 'y', 'z', 'yaw', 'bodyYaw', 'headYaw', 'pitch'];

/**
 * Una copia liviana del film con la forma que entienden las cámaras automáticas (props con $anim), sin tocar el original.
 * solo: lista de actores a filmar (índices) o null para todos los que se mueven o son personajes.
 */
export function vistaParaCamaras(film, formato, solo = null) {
  if (formato === 'b22') return { replays: film.replays, camera: film.camera, _solo: solo };
  const replays = (film.replays || []).map((r) => {
    const props = {};
    for (const k of PISTAS) {
      const tr = (r.keyframes || {})[k];
      if (tr && (tr.keyframes || []).length) props[k] = { $anim: { v: D(num(tr.keyframes[0].value)), track: { keyframes: tr.keyframes, type: 'double' } } };
    }
    return { form: r.form, label: r.label, name_tag: r.name_tag, props, animation: {} };
  });
  return { replays, camera: film.camera, _solo: solo };
}

/** Qué actores se filman por defecto: los personajes (player/…) y todo lo que se mueve. */
export function actoresPorDefecto(film, formato) {
  const v = vistaParaCamaras(film, formato);
  const out = [];
  v.replays.forEach((r, i) => {
    const form = r.form || {};
    if (!form.model && String(form.id ?? '') !== 'bbs:mob') return;
    const mueve = ['x', 'z'].some((k) => (((((r.props || {})[k] || {}).$anim || {}).track || {}).keyframes || []).length > 1);
    if (String(form.model || '').startsWith('player/') || mueve) out.push(i);
  });
  return out;
}

// ---------------------------------------------------------------- clips de cámara de BBS FS
const envFS = () => ({
  mode: I(0), keyframes: B(0), pre: 'linear', fadeOut: F(10.0), post: 'linear', fadeIn: F(10.0),
  channel: { keyframes: [{ tick: F(0), value: D(0) }, { tick: F(30), value: D(1) }], type: 'double' }, enabled: B(0),
});
const r4 = (v) => Math.round(v * 10000) / 10000;
const pista = (puntos, k, interp = 'linear') => ({ keyframes: puntos.map((q) => ({ interp, tick: F(Math.round(q[0] * 1000) / 1000), value: D(r4(q[k])) })), type: 'double' });

/** ¿La toma casi no se mueve? Entonces alcanza con un clip «idle» (cámara quieta). */
export function esQuieta(puntos, tolPos = 0.03, tolAng = 0.3) {
  const a = puntos[0];
  return puntos.every((q) => Math.hypot(q[1] - a[1], q[2] - a[2], q[3] - a[3]) < tolPos && Math.abs(q[4] - a[4]) < tolAng && Math.abs(q[5] - a[5]) < tolAng);
}

/** Cuál es la herramienta de BBS que se usa para una toma (en BBS FS). */
export const herramientaFS = (puntos) => (esQuieta(puntos) ? 'idle' : 'keyframe');

/**
 * Un clip de cámara de BBS FS. puntos: [[tick relativo, x, y, z, yaw, pitch]]. Quieta: bbs:idle; con movimiento: bbs:keyframe.
 */
export function clipFS({ titulo, capa, desde, hasta, puntos, fov }) {
  const base = { title: titulo, enabled: B(1), layer: I(capa), tick: I(Math.round(desde)), duration: I(Math.max(1, Math.round(hasta - desde))), envelope: envFS() };
  const a = puntos[0];
  if (esQuieta(puntos)) {
    return { type: 'bbs:idle', ...base, position: { angle: { roll: F(0), pitch: F(r4(a[5])), fov: F(fov), yaw: F(r4(a[4])) }, point: { x: D(r4(a[1])), y: D(r4(a[2])), z: D(r4(a[3])) } } };
  }
  const un = (v) => ({ keyframes: [{ tick: F(0), value: D(v) }], type: 'double' });
  return {
    type: 'bbs:keyframe', ...base, additive: B(0),
    x: pista(puntos, 1), y: pista(puntos, 2), z: pista(puntos, 3), yaw: pista(puntos, 4), pitch: pista(puntos, 5),
    roll: un(0), fov: un(fov), distance: { keyframes: [], type: 'double' },
  };
}

/**
 * Un clip de BBS FS a partir de canales con sus propias curvas: canales = { x, y, z, yaw, pitch, fov: [{tick, value, interp}] }, roll (número).
 * Si ningún canal se mueve es un «idle»; si no, un «keyframe». Ticks relativos al comienzo del clip.
 */
export function clipFSCanales({ titulo, capa, desde, dur, canales, roll = 0 }) {
  const base = { title: titulo, enabled: B(1), layer: I(capa), tick: I(Math.round(desde)), duration: I(Math.max(1, Math.round(dur))), envelope: envFS() };
  const v0 = (k) => canales[k][0].value;
  if (['x', 'y', 'z', 'yaw', 'pitch', 'fov'].every((k) => canales[k].length <= 1)) {
    return { type: 'bbs:idle', ...base, position: { angle: { roll: F(r4(roll)), pitch: F(r4(v0('pitch'))), fov: F(r4(v0('fov'))), yaw: F(r4(v0('yaw'))) }, point: { x: D(r4(v0('x'))), y: D(r4(v0('y'))), z: D(r4(v0('z'))) } } };
  }
  const track = (k) => ({ keyframes: canales[k].map((q, n) => { const o = { tick: F(Math.round(q.tick * 1000) / 1000), value: D(r4(q.value)) }; if (n && q.interp && q.interp !== 'linear') o.interp = q.interp; else if (n) o.interp = 'linear'; return o; }), type: 'double' });
  return {
    type: 'bbs:keyframe', ...base, additive: B(0),
    x: track('x'), y: track('y'), z: track('z'), yaw: track('yaw'), pitch: track('pitch'), fov: track('fov'),
    roll: { keyframes: [{ tick: F(0), value: D(r4(roll)) }], type: 'double' }, distance: { keyframes: [], type: 'double' },
  };
}

/** El clip en el formato de destino. */
export function clipDeToma(formato, datos) { return formato === 'fs' ? clipFS(datos) : clipDe(datos); }

/** Pone los clips en el film: saca los de una pasada anterior (mismo prefijo de título) y deja los demás. Devuelve la capa usada. */
export function ponerCamaras(film, clips, prefijo = 'Auto') {
  const resto = (film.camera || []).filter((c) => !String(c.title || '').startsWith(prefijo + ':'));
  film.camera = [...resto, ...clips];
}
export function capaLibre(film, prefijo = 'Auto') {
  return Math.max(-1, ...(film.camera || []).filter((c) => !String(c.title || '').startsWith(prefijo + ':')).map((c) => num(c.layer ?? 0))) + 1;
}
