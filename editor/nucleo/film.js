// El film de BBS 2.2 tal como lo edita el Editor: actores (replays) con sus pistas de props y de poses,
// cámaras (clips bbs:movement) y lo demás tal cual vino. Se lee y escribe con bbsdat.js (el mismo del Mocap).
import { B, D, F, I, num, clonar } from '../../mocap/nucleo/bbsdat.js';
import * as P from './pistas.js';

export const TICKS = 20;
const esDict = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !('code' in v && 'v' in v);

// ---------------------------------------------------------------- film
// Film nuevo y vacío a partir de la plantilla (un film real de BBS 2.2): sin actores ni cámaras.
export function filmNuevo(plantilla) {
  const f = clonar(plantilla);
  f._modelo = clonar((plantilla.replays || [])[0] || null);   // actor de muestra para crear actores nuevos
  f.replays = []; f.camera = []; f.markers = [];
  return f;
}
// lo que no se guarda en el .dat
export function paraGuardar(film) { const f = clonar(film); delete f._modelo; return f; }

export function duracion(film) {
  let fin = 0;
  for (const c of film.camera || []) fin = Math.max(fin, num(c.tick ?? 0) + num(c.duration ?? 0));
  for (const r of film.replays || []) {
    for (const v of Object.values(r.animation || {})) for (const k of (v && v.keyframes) || []) fin = Math.max(fin, num(k.tick));
    for (const v of Object.values(r.props || {})) if (esDict(v) && v.$anim) for (const k of ((v.$anim.track || {}).keyframes) || []) fin = Math.max(fin, num(k.tick));
  }
  return fin;
}

// ---------------------------------------------------------------- actores
export function nombre(rep, i) {
  const f = rep.form || {};
  return String(rep.label || f.name || rep.name_tag || '').trim() || (f.model ? String(f.model).split('/').pop() : `Actor ${i + 1}`);
}

// form de personaje nuevo (un player de BBS con esa skin)
export function formPersonaje(film, modelo = 'player/steve_bends', textura = null, nombreForm = '') {
  const base = film._modelo && film._modelo.form && film._modelo.form.id === 'bbs:model' ? clonar(film._modelo.form) : { id: 'bbs:model', visible: B(1), color: I(-1), transform: {}, pose: {}, parts: [] };
  base.model = modelo; base.name = nombreForm;
  base.texture = textura ? [{ path: textura }] : (modelo.startsWith('player/') ? [{ path: `assets:models/${modelo}/${modelo.split('/').pop().replace(/_bends|_3d/g, '')}.png` }] : '');
  base.pose = {}; base.parts = (base.parts || []).filter((p) => p && p.form && /eyes|boca|mouth/.test(String(p.form.model || '')));
  return base;
}

export function nuevoActor(film, form, etiqueta, x = 0, y = 0, z = 0) {
  const base = film._modelo ? clonar(film._modelo) : { shadow: B(1), enabled: B(1), props: {}, animation: {}, actions: [], layers: [], sections: [] };
  base.label = etiqueta; base.name_tag = ''; base.form = clonar(form); base.animation = {}; base.actions = [];
  // props: todos los que traía la muestra, quietos en 0, y la posición pedida
  const props = {};
  for (const [k, v] of Object.entries(base.props || {})) {
    if (esDict(v) && v.$anim) props[k] = { $anim: { v: clonar(v.$anim.v ?? D(0)), track: { keyframes: [], type: (v.$anim.track || {}).type || 'double' } } };
    else props[k] = clonar(v);
    if (esDict(props[k]) && props[k].$anim && ['x', 'y', 'z', 'yaw', 'bodyYaw', 'headYaw', 'pitch', 'roll'].includes(k)) props[k].$anim.v = D(0);
  }
  base.props = props;
  for (const [k, v] of [['x', x], ['y', y], ['z', z]]) ponerProp(base, k, 0, v, 'linear');
  film.replays.push(base);
  return film.replays.length - 1;
}
export function duplicarActor(film, i) {
  const r = clonar(film.replays[i]); r.label = nombre(film.replays[i], i) + ' 2';
  film.replays.push(r); return film.replays.length - 1;
}
export function borrarActor(film, i) { film.replays.splice(i, 1); }

// ---------------------------------------------------------------- pistas de props
// keyframes de un prop (crea la pista si no existe)
export function pista(rep, clave) {
  const props = (rep.props ??= {});
  let p = props[clave];
  if (!esDict(p) || !p.$anim) {
    const v = p === undefined ? 0 : num(p);
    p = { $anim: { v: D(Number.isFinite(v) ? v : 0), track: { keyframes: [], type: 'double' } } };
    props[clave] = p;
  }
  p.$anim.track ??= { keyframes: [], type: 'double' };
  p.$anim.track.keyframes ??= [];
  return p.$anim.track.keyframes;
}
export function prop(rep, clave, t, defecto = 0) {
  const p = (rep.props || {})[clave];
  if (p === undefined) return defecto;
  if (!esDict(p)) return num(p);
  if (!p.$anim) return defecto;
  const kf = (p.$anim.track || {}).keyframes || [];
  return kf.length ? P.valorNum(kf, t) : num(p.$anim.v ?? defecto);
}
// La primera vez que se anima algo después del tick 0, se deja también un keyframe en 0 con cómo estaba,
// así el cambio se ve como movimiento y no cambia todo el film para atrás.
export function ponerProp(rep, clave, tick, valor, interp = null) {
  const kf = pista(rep, clave);
  if (!kf.length && Math.round(tick) > 0) P.poner(kf, 0, prop(rep, clave, 0, clave === 'headYaw' ? estado(rep, 0).cuerpo : 0), 'linear');
  P.poner(kf, tick, valor, interp);
  if (Math.round(tick) === 0 || kf.length === 1) rep.props[clave].$anim.v = D(Number(valor));
}

// grupos de pistas que se muestran en la línea de tiempo
export const GRUPOS = {
  pos: { nombre: 'Posición', claves: ['x', 'y', 'z'] },
  giro: { nombre: 'Giro', claves: ['yaw', 'bodyYaw'] },
  cabeza: { nombre: 'Cabeza', claves: ['headYaw', 'pitch'] },
};

export function estado(rep, t) {
  const by = ((((rep.props || {}).bodyYaw) || {}).$anim || {}).track || {};
  const cuerpo = prop(rep, (by.keyframes || []).length ? 'bodyYaw' : 'yaw', t);
  return {
    x: prop(rep, 'x', t), y: prop(rep, 'y', t), z: prop(rep, 'z', t),
    cuerpo, cabeza: prop(rep, 'headYaw', t, cuerpo), pitch: prop(rep, 'pitch', t), visible: visible(rep, t),
  };
}

// ---------------------------------------------------------------- poses de huesos
export function pistaPose(rep, hueso, crear = false) {
  const an = (rep.animation ??= {});
  const k = 'pose/' + hueso;
  if (!an[k]) { if (!crear) return null; an[k] = { keyframes: [], type: 'pose_transform' }; }
  an[k].keyframes ??= [];
  return an[k].keyframes;
}
export const huesosAnimados = (rep) => Object.keys(rep.animation || {}).filter((k) => k.startsWith('pose/') && (rep.animation[k].keyframes || []).length).map((k) => k.slice(5));

// pose fija del form: BBS la guarda como {static, pose:{hueso:...}} (a veces sin el envoltorio)
export function poseForm(rep) {
  const p = (rep.form || {}).pose;
  if (!esDict(p)) return {};
  const q = esDict(p.pose) ? p.pose : p;
  const out = {};
  for (const [k, v] of Object.entries(q)) if (esDict(v)) out[k] = v;
  return out;
}
// transform del hueso en el tick: la pista, o la pose fija del form, o nada
export function pose(rep, hueso, t) {
  const v = P.valorPose(pistaPose(rep, hueso), t);
  if (v) return v;
  const base = poseForm(rep)[hueso];
  return base && esDict(base) ? P.transformDe(base) : null;
}
export function ponerPose(rep, hueso, tick, tr, interp = null) {
  const kf = pistaPose(rep, hueso, true);
  if (!kf.length && Math.round(tick) > 0) P.poner(kf, 0, P.transformBBS(pose(rep, hueso, 0) || {}), 'sine_inout', false);
  P.poner(kf, tick, P.transformBBS(tr), interp, false);
}
// pose completa en ese tick {hueso: {t,s,r}} de los huesos que tienen algo
export function poseCompleta(rep, t) {
  const out = {};
  const huesos = new Set([...huesosAnimados(rep), ...Object.keys(poseForm(rep))]);
  for (const h of huesos) { const v = pose(rep, h, t); if (v) out[h] = v; }
  return out;
}

// ---------------------------------------------------------------- visible
export function visible(rep, t) {
  const kf = ((((rep.animation || {}).visible) || {}).keyframes || []);
  let v = true;
  for (const k of kf) if (num(k.tick) <= t + 1e-6) v = Boolean(num(k.value));
  return v;
}
export function ponerVisible(rep, tick, v) {
  const an = (rep.animation ??= {});
  const tr = (an.visible ??= { keyframes: [], type: 'boolean' });
  // en BBS antes del primer keyframe vale el primero: si no hay, se deja "se ve" en el 0
  if (!tr.keyframes.length && Math.round(tick) > 0) P.poner(tr.keyframes, 0, B(1), 'constant', false);
  P.poner(tr.keyframes, tick, B(v ? 1 : 0), 'constant', false);
}

// ---------------------------------------------------------------- todas las pistas de un actor (para la línea de tiempo)
// [{id, nombre, ticks:[...], tipo}] ; id = 'grupo:pos' | 'pose:<hueso>' | 'visible'
export function filas(rep) {
  const out = [];
  for (const [id, g] of Object.entries(GRUPOS)) {
    const s = new Set();
    for (const c of g.claves) for (const t of P.ticks((((rep.props || {})[c] || {}).$anim || {}).track?.keyframes)) s.add(t);
    out.push({ id: 'grupo:' + id, nombre: g.nombre, ticks: [...s].sort((a, b) => a - b) });
  }
  const vis = (((rep.animation || {}).visible) || {}).keyframes;
  if (vis && vis.length) out.push({ id: 'visible', nombre: 'Se ve', ticks: P.ticks(vis) });
  for (const h of huesosAnimados(rep)) out.push({ id: 'pose:' + h, nombre: h, ticks: P.ticks(pistaPose(rep, h)) });
  return out;
}
// las listas de keyframes que forman una fila
export function pistasDeFila(rep, id) {
  if (id.startsWith('grupo:')) return GRUPOS[id.slice(6)].claves.map((c) => ((((rep.props || {})[c] || {}).$anim || {}).track || {}).keyframes).filter(Boolean);
  if (id === 'visible') return [(((rep.animation || {}).visible) || {}).keyframes].filter(Boolean);
  if (id.startsWith('pose:')) return [pistaPose(rep, id.slice(5))].filter(Boolean);
  return [];
}

// ---------------------------------------------------------------- cámaras (clips bbs:movement)
const CANALES = ['x', 'y', 'z', 'yaw', 'pitch', 'fov'];
export const esToma = (c) => c && c.type === 'bbs:movement';
export const tomas = (film) => (film.camera || []).filter(esToma);

function canal(c, k) {
  let v = c[k];
  if (!esDict(v) || !v.$anim) { const n = v === undefined ? (k === 'fov' ? 50 : 0) : num(v); v = { $anim: { v: D(n), track: { keyframes: [], type: 'double' } } }; c[k] = v; }
  v.$anim.track ??= { keyframes: [], type: 'double' }; v.$anim.track.keyframes ??= [];
  return v.$anim.track.keyframes;
}
function valorCanal(c, k, tr) {
  const v = c[k];
  if (v === undefined) return k === 'fov' ? 50 : 0;
  if (!esDict(v)) return num(v);
  const kf = (v.$anim && v.$anim.track && v.$anim.track.keyframes) || [];
  return kf.length ? P.valorNum(kf, tr) : num((v.$anim || {}).v ?? 0);
}
// vista de la toma en el tick del film: {x,y,z,yaw,pitch,fov}
export function vistaToma(c, t) {
  const tr = Math.min(Math.max(0, t - num(c.tick ?? 0)), num(c.duration ?? 0));
  const o = {};
  for (const k of CANALES) o[k] = valorCanal(c, k, tr);
  if (!(o.fov > 1)) o.fov = 50;
  o.roll = valorCanal(c, 'roll', tr);
  return o;
}
export function tomaActiva(film, t) {
  let mejor = null;
  for (const c of tomas(film)) {
    if (!num(c.enabled ?? 1)) continue;
    const a = num(c.tick ?? 0), d = num(c.duration ?? 0);
    if (t >= a && t < a + d && (!mejor || num(c.layer ?? 0) >= num(mejor.layer ?? 0))) mejor = c;
  }
  return mejor;
}
export function nuevaToma(film, tick, dur, vista, titulo) {
  film.camera ??= [];
  const capa = Math.max(-1, ...film.camera.map((c) => num(c.layer ?? 0))) + 1;
  const c = {
    type: 'bbs:movement', title: titulo, enabled: B(1), layer: I(capa), tick: I(Math.round(tick)), duration: I(Math.max(1, Math.round(dur))),
    envelope: { mode: I(0), pre: 'linear', fadeOut: F(10.0), post: 'linear', fadeIn: F(10.0), factor: D(1.0), enabled: B(0) },
    active: I(127), distance: F(0.0), dolly: F(0.0), roll: D(0.0),
  };
  for (const k of CANALES) c[k] = D(vista[k] ?? (k === 'fov' ? 50 : 0));
  ponerKeyToma(c, tick, vista);
  film.camera.push(c);
  return c;
}
// keyframe de cámara en el tick del film, con la vista dada
export function ponerKeyToma(c, t, vista, interp = 'sine_inout') {
  const tr = Math.round(t - num(c.tick ?? 0));
  if (tr < 0 || tr > num(c.duration ?? 0)) return false;
  for (const k of CANALES) {
    const kf = canal(c, k);
    P.poner(kf, tr, vista[k], interp);
    if (kf.length === 1 || tr === 0) c[k].$anim.v = D(Number(vista[k]));
  }
  return true;
}
export function ticksToma(c) {
  const s = new Set();
  for (const k of CANALES) { const v = c[k]; if (esDict(v) && v.$anim) for (const t of P.ticks(v.$anim.track.keyframes)) s.add(t + num(c.tick ?? 0)); }
  return [...s].sort((a, b) => a - b);
}
export function pistasToma(c) { return CANALES.map((k) => (esDict(c[k]) && c[k].$anim ? c[k].$anim.track.keyframes : null)).filter(Boolean); }
export function borrarToma(film, c) { film.camera = (film.camera || []).filter((x) => x !== c); }
