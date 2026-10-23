// Modo "Animaciones → BBS": lo que no depende del navegador (se puede probar en node).
// La conversion en si es la del Mocap (mocap/nucleo/mocap.js); aca solo se arman las opciones y se leen las pistas.
import { OPCIONES } from '../mocap/nucleo/mocap.js';
import { num } from '../mocap/nucleo/bbsdat.js';

// huesos del muñeco de Minecraft que dibuja la vista (steve_bends y emoticons/steve)
export const HUESOS_MC = ['anchor', 'low_body', 'head', 'right_arm', 'right_elbow', 'left_arm', 'left_elbow',
  'right_leg', 'right_knee', 'left_leg', 'left_knee', 'body', 'low_right_arm', 'low_left_arm', 'low_leg_right', 'low_left_leg',
  'low_right_arm.end', 'low_left_arm.end'];

// nombres para mostrar de los huesos que se buscan en la animacion original (claves de importar.js)
export const NOMBRES_ORIGEN = {
  hips: 'cadera', neck: 'cuello', head: 'cabeza',
  brazoL: 'brazo izq.', antebrazoL: 'antebrazo izq.', manoL: 'mano izq.', brazoR: 'brazo der.', antebrazoR: 'antebrazo der.', manoR: 'mano der.',
  musloL: 'muslo izq.', piernaL: 'pierna izq.', pieL: 'pie izq.', musloR: 'muslo der.', piernaR: 'pierna der.', pieR: 'pie der.',
};

/** Opciones para mocap.procesarCuerpo: las mismas que usa «Importar animación» del Mocap (copia fiel del esqueleto). */
export function opcionesConversion({ estilo = 'realista', modelo = 'steve_bends', actor = 0, hayFilm = false } = {}) {
  return { ...OPCIONES, modo: 'cuerpo', estilo, actor, desde: 0, modelo: hayFilm && modelo === 'auto' ? 'auto' : modelo,
    neutral: 0, torso: 1, con_giro: true, sin_giro: false, suavizado: 0.02, poses_fijas: '' };
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
