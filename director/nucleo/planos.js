// Planos para una escena: por cada tramo (entre dos cortes), VARIAS tomas posibles —sobre un actor, sobre dos o sobre todos— para que el usuario
// elija la que le gusta en vez de armar cada cámara a mano. Usa las reglas de composición de camaras_auto.js (tercios, 180°, 30°, sin tapar al sujeto).
import * as C from './camaras_auto.js';
import { clipDeToma } from './formato.js';

const TICKS = 20;
const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
export const EMPUJABLES = new Set(['entero', 'americano', 'medio_corto', 'primer_plano', 'tres_cuartos_e', 'contra', 'picado']);

// qué tan «típico» es cada plano para arrancar (más alto = se propone antes)
const GUSTO = { general: 3, entero: 2.5, americano: 2.8, medio_corto: 3, primer_plano: 2.4, tres_cuartos_e: 2.2, hombro: 3, lateral_dos: 2.4, sigue: 2.8, atras: 2.2, contra: 1.6, picado: 1.5, cenital: 1.1, detalle: 0.9 };
const OFERTA = {
  uno: ['americano', 'medio_corto', 'primer_plano', 'tres_cuartos_e', 'entero', 'contra', 'detalle'],
  uno_camina: ['sigue', 'atras', 'entero', 'americano', 'contra'],
  dos: ['hombro', 'lateral_dos'],
  grupo: ['general', 'cenital', 'picado', 'lateral_dos'],
};

export const nombreActor = (film, i) => { const r = film.replays[i] || {}; return String((r.form || {}).name || r.label || '').trim() || (String((r.form || {}).model || '').split('/').pop() || `#${i + 1}`); };

/** Hasta qué tick llega lo que hacen los actores filmados (sus pistas de posición y giro). */
export function finSugerido(v) {
  let fin = 0;
  for (const i of C.actores(v)) for (const k of Object.keys(v.replays[i].props || {})) {
    for (const q of ((((v.replays[i].props[k] || {}).$anim || {}).track || {}).keyframes) || []) fin = Math.max(fin, Number(q.tick?.v ?? q.tick));
  }
  return Math.max(60, Math.ceil(fin));
}

/** Los cortes automáticos (dónde cambiaría de cámara el algoritmo): lista de ticks, sin el 0 ni el final. */
export function cortesAuto(v, hasta = null, minTicks = C.MIN_TICKS, maxTicks = C.MAX_TICKS) {
  const fin = hasta ?? finSugerido(v);
  return C.segmentar(v, null, fin, minTicks, maxTicks).map((s) => s.desde).filter((t) => t > 0);
}

/**
 * Propone los planos de toda la escena. cortes = ticks donde cambia la cámara (o null: los automáticos).
 * Devuelve { tramos: [{ desde, hasta, activos, opciones: [...], elegida }], avisos }.
 * Cada opción: { id, tipo, nombre, sujetos, empuje, toma {puntos, fov, azimut}, oclusion, lado, puntaje }.
 */
export function proponer(v, { cortes = null, hasta = null, semilla = 1, aspecto = 16 / 9, cuantas = 10, conEmpuje = true } = {}) {
  const avisos = [];
  const ids = C.actores(v);
  if (!ids.length) return { tramos: [], avisos: ['No hay actores para filmar.'] };
  const fin = hasta ?? finSugerido(v);
  const lim = [0, ...(cortes || cortesAuto(v, fin)).filter((t) => t > 0 && t < fin), fin].sort((a, b) => a - b).filter((t, k, a) => !k || t - a[k - 1] >= 5);
  const tramosBase = [];
  for (let k = 0; k + 1 < lim.length; k++) tramosBase.push({ desde: lim[k], hasta: lim[k + 1] });
  const ladoDe = new Map();
  const tramos = [];
  let previa = null;
  for (const s of tramosBase) {
    const info = C.tramoEn(v, s.desde, s.hasta);
    const activos = info.sujetos;
    const t0 = s.desde + (s.hasta - s.desde) / 2;
    const pos = (i) => C.estado(v, i, t0);
    const dist = (a, b) => Math.hypot(pos(a).x - pos(b).x, pos(a).z - pos(b).z);
    // candidatos: (sujetos, tipos)
    const cand = [];
    if (ids.length > 1) cand.push({ sujetos: ids, tipos: OFERTA.grupo });
    const protagonistas = (activos.length ? activos : ids).slice(0, 4);
    const camina = info.cat === 'camina' || info.cat === 'salta';
    for (const i of protagonistas) cand.push({ sujetos: [i], tipos: camina && activos.includes(i) ? OFERTA.uno_camina : OFERTA.uno, activo: activos.includes(i) });
    if (ids.length === 1) cand.push({ sujetos: ids, tipos: ['general'] });
    // parejas cercanas (para los planos de dos)
    const parejas = [];
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) if (dist(ids[a], ids[b]) < 14) parejas.push([ids[a], ids[b]]);
    parejas.sort((p, q) => (q.filter((i) => activos.includes(i)).length - p.filter((i) => activos.includes(i)).length) || dist(...p) - dist(...q));
    for (const p of parejas.slice(0, 3)) cand.push({ sujetos: p, tipos: OFERTA.dos, activo: p.some((i) => activos.includes(i)) });
    const opciones = [];
    for (const c of cand) {
      const clave = [...c.sujetos].slice(0, 2).sort((a, b) => a - b).join('-');
      if (!ladoDe.has(clave)) ladoDe.set(clave, (semilla + ladoDe.size) % 2 ? 1 : -1);
      const lado = ladoDe.get(clave);
      const seg = { desde: s.desde, hasta: s.hasta, sujetos: c.sujetos, cat: info.cat };
      const ctxBase = { film: v, aspecto, lado, otro: (i) => ids.find((x) => x !== i) ?? i };
      for (const tipo of c.tipos) {
        for (const empuje of conEmpuje && EMPUJABLES.has(tipo) ? [0, 0.3] : [0]) {
          let mejor = null;
          for (const [l2, ex] of [[lado, 0], [-lado, 0], [lado, 25], [-lado, -25]]) {
            const ctx = { ...ctxBase, lado: l2, extraAz: ex * l2, empuje };
            let toma;
            try { toma = C.construirToma(tipo, seg, ctx); } catch { continue; }
            if (!toma.puntos.length) continue;
            const o = C.oclusion(v, toma, seg, c.sujetos[0]);
            if (!mejor || o < mejor.oclusion - 0.05) mejor = { toma, oclusion: o, lado: l2 };
            if (mejor.oclusion < 0.1) break;
          }
          if (!mejor) continue;
          const nombre = (C.TOMAS[tipo] || {}).nombre || tipo;
          opciones.push({
            id: `${c.sujetos.join('+')}:${tipo}${empuje ? '+' : ''}`, tipo, empuje, sujetos: c.sujetos,
            nombre: nombre + (empuje ? ' con acercamiento' : ''), toma: mejor.toma, oclusion: mejor.oclusion, lado: mejor.lado,
            puntaje: (GUSTO[tipo] ?? 1) + (c.activo ? 0.8 : 0) - 3 * mejor.oclusion - (empuje ? 0.35 : 0) - (c.sujetos.length === ids.length && ids.length > 2 && tipo !== 'general' ? 0.3 : 0),
          });
        }
      }
    }
    opciones.sort((a, b) => b.puntaje - a.puntaje);
    // la lista final: las mejores, pero con variedad (como mucho 3 por sujeto-y-plano) y siempre un plano general
    const lista = [], cuentaSuj = new Map();
    for (const o of opciones) {
      const k = o.sujetos.join('+');
      if ((cuentaSuj.get(k) || 0) >= 4) continue;
      lista.push(o); cuentaSuj.set(k, (cuentaSuj.get(k) || 0) + 1);
      if (lista.length >= cuantas) break;
    }
    if (ids.length > 1 && !lista.some((o) => o.tipo === 'general')) { const g = opciones.find((o) => o.tipo === 'general'); if (g) lista.push(g); }
    // la elegida de entrada: la mejor que no repite el plano ni el mismo ángulo con los mismos sujetos que el tramo anterior (regla de los 30°)
    const ant = tramos[tramos.length - 1], pa = ant && ant.opciones[ant.elegida];
    let elegida = 0;
    if (!tramos.length) { const g = lista.findIndex((o) => o.tipo === 'general'); if (g >= 0) elegida = g; }
    else {
      const bueno = (o) => !pa || (o.tipo !== pa.tipo && !(o.sujetos.join() === pa.sujetos.join() && Math.abs(norm(o.toma.azimut - pa.toma.azimut)) < 30 && !['cenital', 'general'].includes(o.tipo)));
      const j = lista.findIndex(bueno);
      elegida = j >= 0 ? j : 0;
    }
    previa = lista[elegida];
    tramos.push({ desde: s.desde, hasta: s.hasta, activos, cat: info.cat, opciones: lista, elegida });
    if (previa && previa.oclusion >= 0.35) avisos.push(`De ${(s.desde / TICKS).toFixed(1)} s a ${(s.hasta / TICKS).toFixed(1)} s otro actor tapa un poco al sujeto en el plano elegido.`);
  }
  void previa;
  return { tramos, avisos };
}

/** Los clips de BBS de lo que se eligió. formato: 'fs' | 'b22'. capa: la capa donde van. */
export function clipsDe(v, tramos, formato, capa, titulo = 'Auto') {
  const clips = [];
  for (const t of tramos) {
    const o = t.opciones[t.elegida]; if (!o) continue;
    clips.push(clipDeToma(formato, { titulo: `${titulo}: ${o.nombre} · ${o.sujetos.map((i) => nombreActor(v, i)).join(' y ')}`, capa, desde: t.desde, hasta: t.hasta, puntos: o.toma.puntos, fov: o.toma.fov }));
  }
  return clips;
}
