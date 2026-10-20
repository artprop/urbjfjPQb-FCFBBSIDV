// Modelo emoticons/steve de BBS: conversion de las rotaciones del mocap (huesos de steve_bends) a este rig. Port de emoticons.py.
//   R_local = reposo(hueso)^T * P * R * P * reposo(hueso),  P = giro de 180 grados sobre Y (el modelo mira al reves).
// El torso se reparte mitad y mitad entre `body` y `low_body`; las piernas compensan la mitad que giro `body`.
import * as M from './mat.js';
import { eulerNear, fromEuler } from './retarget.js';

const P = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]];
let ARM = null;

export const NOMBRES = { right_elbow: 'low_right_arm', left_elbow: 'low_left_arm', right_hand: 'low_right_arm.end', left_hand: 'low_left_arm.end', right_knee: 'low_leg_right', left_knee: 'low_left_leg' };
export const HUESOS = ['anchor', 'body', 'low_body', 'head', 'right_arm', 'low_right_arm', 'left_arm', 'low_left_arm',
  'right_leg', 'low_leg_right', 'left_leg', 'low_left_leg', 'low_right_arm.end', 'low_left_arm.end'];
export const IK_CADENAS = {
  right_arm_end: ['right_arm', 'low_right_arm'], left_arm_end: ['left_arm', 'low_left_arm'],
  right_leg_end: ['right_leg', 'low_leg_right'], left_leg_end: ['left_leg', 'low_left_leg'],
  body_end: ['body', 'low_body'],
};

// armadura: contenido de datos/emoticons_steve.armadura.json (se carga una vez)
export function ponerArmadura(json) { ARM = Object.fromEntries(json.huesos.map((h) => [h.n, h])); }

function reposo(nombre) {
  const r = ARM[nombre].rot.map(Number);
  return [r.slice(0, 3), r.slice(3, 6), r.slice(6, 9)];
}

export const esEmoticons = (modelo) => (modelo || '').toLowerCase().includes('emoticons');

export function localDe(nombre, R) {
  const Rr = reposo(nombre);
  return M.mm(M.mm(M.mm(M.mm(M.T(Rr), P), R), P), Rr);
}

export function convertir(result) {
  if (!ARM) throw new Error('falta cargar la armadura de emoticons_steve');
  const vals = Object.values(result);
  if (!vals.length) return {};
  const N = vals[0].t.length, t = vals[0].t;
  const mats = (h) => (result[h] ? result[h].eul.map((e) => fromEuler(e)) : Array.from({ length: N }, () => M.eye()));
  const R = {};
  for (const h of ['anchor', 'low_body', 'head', 'right_arm', 'left_arm', 'right_elbow', 'left_elbow', 'right_hand', 'left_hand', 'right_leg', 'left_leg', 'right_knee', 'left_knee']) R[h] = mats(h);
  const mitad = R.low_body.map((m) => M.fromRotvec(M.mul(M.rotvecFromMatrix(m), 0.5)));
  const pierna = {};
  for (const l of ['right_leg', 'left_leg']) pierna[l] = R[l].map((m, i) => M.mm(M.T(mitad[i]), m));
  const sal = {
    anchor: R.anchor, body: mitad, low_body: mitad, head: R.head, right_arm: R.right_arm, left_arm: R.left_arm,
    low_right_arm: R.right_elbow, low_left_arm: R.left_elbow, 'low_right_arm.end': R.right_hand, 'low_left_arm.end': R.left_hand, right_leg: pierna.right_leg, left_leg: pierna.left_leg,
    low_leg_right: R.right_knee, low_left_leg: R.left_knee,
  };
  const fuente = {
    anchor: 'anchor', body: 'low_body', low_body: 'low_body', head: 'head', right_arm: 'right_arm', left_arm: 'left_arm',
    low_right_arm: 'right_elbow', low_left_arm: 'left_elbow', 'low_right_arm.end': 'right_hand', 'low_left_arm.end': 'left_hand', right_leg: 'right_leg', left_leg: 'left_leg',
    low_leg_right: 'right_knee', low_left_leg: 'left_knee',
  };
  const out = {};
  for (const [nombre, Ms] of Object.entries(sal)) {
    if (!result[fuente[nombre]]) continue;
    let ref = [0, 0, 0];
    const eul = Ms.map((m) => (ref = eulerNear(localDe(nombre, m), ref)));
    out[nombre] = { t, eul, tapada: result[fuente[nombre]].tapada };
  }
  return out;
}

// {hueso de steve_bends: [rx, ry, rz]} (pose fija) -> {hueso de emoticons: [rx, ry, rz]}
export function poseUnica(huesosRot) {
  const res = {};
  for (const [h, e] of Object.entries(huesosRot)) res[h] = { t: Float64Array.from([0, 1]), eul: [e.slice(), e.slice()], tapada: [false, false] };
  return Object.fromEntries(Object.entries(convertir(res)).map(([h, v]) => [h, v.eul[0]]));
}
