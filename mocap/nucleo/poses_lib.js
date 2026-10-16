// Poses prefabricadas del cuerpo: se pegan encima del mocap en los tramos que el usuario indica. Port de poses_lib.py.
// Las poses vienen en el formato poses.json de BBS (las del programa y, opcionalmente, un poses.json del usuario).
import * as M from './mat.js';
import { eulerNear, fromEuler } from './retarget.js';

export const HUESOS_CUERPO = ['anchor', 'low_body', 'head', 'right_arm', 'right_elbow', 'left_arm', 'left_elbow',
  'right_leg', 'right_knee', 'left_leg', 'left_knee'];

// fuentes: [[datos de poses.json, prefijo], ...] -> nombre -> {hueso: [rx, ry, rz]}
export function biblioteca(fuentes) {
  const lib = {};
  for (const [datos, prefijo] of fuentes) {
    for (const [nombre, v] of Object.entries(datos || {})) {
      const huesos = {};
      for (const [hueso, t] of Object.entries((v && v.pose) || {})) {
        const r = t && t.r;
        if (HUESOS_CUERPO.includes(hueso) && r && r.length === 3 && r.some((x) => Math.abs(x) > 1e-9)) huesos[hueso] = r.map(Number);
      }
      if (Object.keys(huesos).length) lib[prefijo + nombre] = huesos;
    }
  }
  return lib;
}

// '18-30: Manos_atras' (una por linea o separadas por ;) -> [[18, 30, 'Manos_atras']] (segundos del video)
export function parsearRangos(texto) {
  const out = [];
  for (const linea of (texto || '').split(/[\n;]+/)) {
    const m = linea.match(/^\s*([\d.,]+)\s*[-–a]\s*([\d.,]+)\s*[:=]\s*(.+?)\s*$/);
    if (m) {
      const a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'));
      if (b > a) out.push([a, b, m[3]]);
    }
  }
  return out;
}

// Pisa, en cada tramo, los huesos que define la pose (result se modifica). Devuelve avisos.
export function aplicar(result, rangos, lib, rampa = 0.25, log = () => {}) {
  const avisos = [];
  for (const [a, b, nombre] of rangos) {
    const pose = lib[nombre];
    if (!pose) {
      avisos.push(`No existe la pose "${nombre}" (de ${a} a ${b} s). Las disponibles: ${Object.keys(lib).sort().join(', ') || 'ninguna'}.`);
      continue;
    }
    const usados = [];
    for (const [hueso, objetivo] of Object.entries(pose)) {
      if (!result[hueso]) continue;
      const { t, eul, tapada } = result[hueso];
      const w = Array.from(t, (x) => {
        let v = rampa > 0 ? M.clip(Math.min((x - a) / rampa, (b - x) / rampa), 0, 1) : ((x >= a && x <= b) ? 1 : 0);
        return v * v * (3 - 2 * v);
      });
      if (!w.some((x) => x > 0)) continue;
      const Robj = fromEuler(objetivo);
      const nuevo = eul.map((e, i) => {
        if (!(w[i] > 0)) return e.slice();
        const alvo = eulerNear(Robj, e);
        return e.map((x, c) => x * (1 - w[i]) + alvo[c] * w[i]);
      });
      result[hueso] = { t, eul: nuevo, tapada };
      usados.push(hueso);
    }
    if (usados.length) log(`  Pose "${nombre}" de ${a} a ${b} s en: ${usados.join(', ')}`);
    else avisos.push(`La pose "${nombre}" no se pudo usar de ${a} a ${b} s (no hay esos huesos animados).`);
  }
  return avisos;
}

// [[desde_s, hasta_s]] donde esos huesos no se veian (para sugerir cuando usar una pose)
export function tramosTapados(result, huesos = ['right_arm', 'left_arm'], minS = 1.0) {
  let marca = null, t = null;
  for (const h of huesos) {
    if (!result[h]) continue;
    const tap = result[h].tapada;
    marca = marca === null ? tap.slice() : marca.map((x, i) => x || tap[i]);
    t = result[h].t;
  }
  if (marca === null) return [];
  const out = [];
  let i = 0;
  while (i < marca.length) {
    if (marca[i]) {
      let j = i;
      while (j + 1 < marca.length && marca[j + 1]) j++;
      if (t[j] - t[i] >= minS) out.push([t[i], t[j]]);
      i = j + 1;
    } else i++;
  }
  return out;
}
