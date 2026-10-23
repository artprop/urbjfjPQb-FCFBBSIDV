// Modo "Animaciones → BBS": lo que no depende del navegador (se puede probar en node).
// La conversion en si es la del Mocap (mocap/nucleo/mocap.js); aca solo se arman las opciones y se leen las pistas.
import { OPCIONES, OPCIONES_IMPORTADA } from '../mocap/nucleo/mocap.js';
import { num, D } from '../mocap/nucleo/bbsdat.js';
import { simplify } from '../mocap/nucleo/retarget.js';
import * as FM from '../editor/nucleo/film.js';
import * as PI from '../editor/nucleo/pistas.js';

// largo de la pierna de steve_bends / emoticons (muslo + pierna = 12 píxeles = 0,75 bloques): el desplazamiento de la
// animación viene medido en largos de pierna, así los pasos miden lo mismo que las piernas del muñeco (los pies no patinan)
export const PIERNA_MC = 0.75;
const TICKS_S = 20;

// huesos del muñeco de Minecraft que dibuja la vista (steve_bends y emoticons/steve)
export const HUESOS_MC = ['anchor', 'low_body', 'head', 'right_arm', 'right_elbow', 'left_arm', 'left_elbow',
  'right_leg', 'right_knee', 'left_leg', 'left_knee', 'body', 'low_right_arm', 'low_left_arm', 'low_leg_right', 'low_left_leg',
  'low_right_arm.end', 'low_left_arm.end'];

// nombres para mostrar de las partes que se buscan en la animacion original (claves de mocap/nucleo/esqueleto.js)
export const NOMBRE_PARTE = { hips: 'Cadera', neck: 'Cuello', head: 'Cabeza', brazo: 'Brazo', antebrazo: 'Antebrazo', mano: 'Mano',
  pulgar: 'Pulgar', indice: 'Índice', medio: 'Medio', anular: 'Anular', menique: 'Meñique', muslo: 'Muslo', pierna: 'Pierna', pie: 'Pie', dedo_pie: 'Punta del pie' };
export function nombreParte(k) {
  const m = k.match(/^(.+?)([LR])$/);
  return m ? `${NOMBRE_PARTE[m[1]] || m[1]} ${m[2] === 'L' ? 'izq.' : 'der.'}` : NOMBRE_PARTE[k] || k;
}
// orden del panel de huesos: [parte del centro] o [parte, con lado]
export const FILAS_PANEL = [['head'], ['neck'], ['hips'], ['brazo', 1], ['antebrazo', 1], ['mano', 1], ['pulgar', 1], ['indice', 1], ['medio', 1], ['anular', 1], ['menique', 1],
  ['muslo', 1], ['pierna', 1], ['pie', 1], ['dedo_pie', 1]];
/** Las partes en el orden en que se eligen (para pasar sola a la siguiente después de tocar un hueso). */
export const ORDEN_PARTES = FILAS_PANEL.flatMap(([p, lado]) => (lado ? [p + 'L', p + 'R'] : [p]));

/** Nombre corto de un hueso para mostrar (sin «mixamorig:» ni prefijos de espacio de nombres). */
export const nombreCorto = (n) => String(n || '').replace(/^.*[:|]/, '').replace(/^mixamorig\d*_?/i, '');

/** Opciones para mocap.procesarCuerpo: las de una animación importada (las mismas que «Importar animación» del Mocap). */
export function opcionesConversion({ estilo = 'realista', modelo = 'steve_bends', actor = 0, hayFilm = false } = {}) {
  return { ...OPCIONES, ...OPCIONES_IMPORTADA, estilo, actor, modelo: hayFilm && modelo === 'auto' ? 'auto' : modelo };
}

/** Pistas de un actor de BBS para la vista 3D: { huesos: {hueso: [{t, r, i}]}, ticks, modelo }. */
export function pistasDeActor(rep) {
  const huesos = {}; let ticks = 0;
  for (const b of HUESOS_MC) {
    const p = (rep.animation || {})['pose/' + b];
    if (!p) continue;
    const kfs = (p.keyframes || []).map((k) => {
      const v = k.value || {};
      return { t: num(k.tick), r: v.r ? v.r.map(num) : [0, 0, 0], i: String(k.interp || 'linear') };
    }).sort((a, b) => a.t - b.t);
    if (kfs.length) { huesos[b] = kfs; ticks = Math.max(ticks, kfs[kfs.length - 1].t); }
  }
  return { huesos, ticks, modelo: String((rep.form || {}).model || '') };
}

/** Qué tipo de esqueleto es, para mostrarlo arriba de la vista original. */
export function tipoDeRig(nombresHuesos, ext) {
  const t = nombresHuesos.join(' ').toLowerCase();
  if (t.includes('mixamorig')) return 'Mixamo';
  if (t.includes('bip01') || t.includes('bip001')) return '3ds Max Biped';
  if (/\bcc_base_|\bcc_/.test(t)) return 'Character Creator';
  if (ext === 'bvh') return 'BVH';
  if (t.includes('def-') || t.includes('org-')) return 'Rigify (Blender)';
  return 'Esqueleto ' + String(ext || '').toUpperCase();
}

/** Nombre del film que se guarda: «thriller_dance.dat» o «miFilm_thriller_dance.dat». */
export function nombreSalida(archivo, filmBase = '') {
  const stem = String(archivo || 'animacion').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'animacion';
  return filmBase ? String(filmBase).replace(/\.dat$/i, '') + '_' + stem + '.dat' : stem + '.dat';
}

/**
 * Desplazamiento por el piso, cuadro a cuadro en ticks: [{ tick, l, u, f }] en bloques (izquierda, arriba y adelante del
 * personaje, como estaba parado al empezar). pose = la que devuelve aPose (con times y mov).
 */
export function desplazamiento(pose, { desde = 0, conAltura = true } = {}) {
  const { times, mov } = pose, out = [];
  if (!mov || !mov.length) return out;
  const fin = Math.round(times[times.length - 1] * TICKS_S);
  let j = 0;
  for (let k = 0; k <= fin; k++) {
    const t = k / TICKS_S;
    while (j < times.length - 2 && times[j + 1] <= t) j++;
    const a = mov[j], b = mov[Math.min(j + 1, mov.length - 1)];
    const u = times[j + 1] > times[j] ? Math.min(1, Math.max(0, (t - times[j]) / (times[j + 1] - times[j]))) : 0;
    const v = [0, 1, 2].map((c) => (a[c] + (b[c] - a[c]) * u) * PIERNA_MC);
    out.push({ tick: desde + k, l: v[0], u: conAltura ? v[1] : 0, f: v[2] });
  }
  return out;
}

/** Del marco del personaje al mundo de Minecraft (yaw 0 mira hacia +Z, yaw 90 hacia -X; a su izquierda, +X con yaw 0). */
export function aMundo(d, yawGrados) {
  const y = (yawGrados * Math.PI) / 180, s = Math.sin(y), c = Math.cos(y);
  return [d.l * c - d.f * s, d.u, d.l * s + d.f * c];
}

/**
 * Escribe el desplazamiento en las pistas x, y, z del actor (reemplaza las que tenía), sumado a donde estaba parado.
 * Devuelve cuántos keyframes quedaron. tol = error permitido al simplificar (bloques).
 */
export function ponerDesplazamiento(rep, desp, { tol = 0.01 } = {}) {
  if (!desp.length) return 0;
  const e = FM.estado(rep, desp[0].tick);
  const pts = desp.map((d) => { const w = aMundo(d, e.cuerpo); return [e.x + w[0], e.y + w[1], e.z + w[2]]; });
  const ticks = desp.map((d) => d.tick);
  const quedan = simplify(ticks, pts, tol);
  for (const [c, clave] of ['x', 'y', 'z'].entries()) {
    const kf = FM.pista(rep, clave);
    kf.length = 0;
    for (const i of quedan) PI.poner(kf, ticks[i], pts[i][c], 'linear');
    rep.props[clave].$anim.v = D(pts[quedan[0]][c]);
  }
  return quedan.length;
}
