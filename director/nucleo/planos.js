// Planos para una escena: por cada tramo, VARIAS tomas posibles (plano entero, americano, medio, primer plano, picado, contrapicado,
// sobre el hombro, de los dos, seguimiento, general, cenital…) para que el usuario elija la que le gusta, en vez de armar cada cámara a mano.
// Usa las reglas de composición de camaras_auto.js (tercios, 180°, 30°, sin tapar al sujeto).
import * as C from './camaras_auto.js';
import { clipDeToma, herramientaFS, capaLibre } from './formato.js';

const TICKS = 20;
const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

// Qué planos se ofrecen según cuántos actores hay en el tramo y qué hacen. [tipo, con empuje (dolly in)?]
const OFERTA = {
  uno: ['entero', 'americano', 'medio_corto', 'primer_plano', 'tres_cuartos_e', 'contra', 'picado', 'detalle'],
  dos: ['hombro', 'lateral_dos', 'americano', 'medio_corto', 'primer_plano', 'contra', 'general', 'picado'],
  grupo: ['general', 'cenital', 'lateral_dos', 'picado', 'entero'],
  camina: ['sigue', 'atras', 'entero', 'general', 'cenital', 'contra', 'americano'],
  salta: ['contra', 'sigue', 'entero', 'picado', 'general'],
};
// qué tan «típico» es cada plano para arrancar (más alto = se propone antes)
const GUSTO = { general: 3, entero: 2.6, americano: 2.8, medio_corto: 3, primer_plano: 2.4, tres_cuartos_e: 2.2, hombro: 3, lateral_dos: 2.4, sigue: 2.8, atras: 2.2, contra: 1.6, picado: 1.5, cenital: 1.1, detalle: 0.9 };
export const EMPUJABLES = new Set(['entero', 'americano', 'medio_corto', 'primer_plano', 'tres_cuartos_e', 'contra', 'picado']);

const nombreActor = (film, i) => { const r = film.replays[i] || {}; return String((r.form || {}).name || r.label || '').trim() || `#${i + 1}`; };

/** Hasta qué tick llega lo que hacen los actores filmados (sus pistas de posición y giro). */
export function finSugerido(v) {
  let fin = 0;
  for (const i of C.actores(v)) for (const k of Object.keys(v.replays[i].props || {})) {
    for (const q of ((((v.replays[i].props[k] || {}).$anim || {}).track || {}).keyframes) || []) fin = Math.max(fin, Number(q.tick?.v ?? q.tick));
  }
  return Math.max(60, Math.ceil(fin));
}

/**
 * Propone los planos de toda la escena. Devuelve { tramos: [{ desde, hasta, sujetos, cat, titulo, opciones: [...], elegida }], avisos }.
 * Cada opción: { id, tipo, nombre, empuje, herramienta, toma {puntos, fov, azimut}, oclusion, lado }.
 * v = la vista del film (formato.vistaParaCamaras). opciones: semilla, minTicks, maxTicks, aspecto, cuantas (por tramo), conEmpuje.
 */
export function proponer(v, { semilla = 1, minTicks = C.MIN_TICKS, maxTicks = C.MAX_TICKS, aspecto = 16 / 9, cuantas = 8, conEmpuje = true, hasta = null } = {}) {
  const avisos = [];
  const ids = C.actores(v);
  if (!ids.length) return { tramos: [], avisos: ['No hay actores para filmar.'] };
  const fin = hasta ?? finSugerido(v);
  const segs = C.segmentar(v, null, fin, minTicks, maxTicks);
  let ladoGlobal = semilla % 2 ? 1 : -1;       // regla de los 180°: cada pareja siempre del mismo lado
  const ladoDe = new Map();
  const tramos = [];
  let previo = null;
  segs.forEach((s, k) => {
    let sujetos = s.sujetos.length ? s.sujetos : [ids[0]];
    // un sujeto solo con otros cerca: se le suma el más cercano (para los planos de dos)
    let tipoEscena = sujetos.length >= 3 ? 'grupo' : sujetos.length === 2 ? 'dos' : 'uno';
    if (sujetos.length === 1 && ids.length > 1) {
      const p = C.estado(v, sujetos[0], s.desde);
      const otro = ids.filter((i) => i !== sujetos[0]).sort((a, b) => { const A = C.estado(v, a, s.desde), Bq = C.estado(v, b, s.desde); return Math.hypot(A.x - p.x, A.z - p.z) - Math.hypot(Bq.x - p.x, Bq.z - p.z); })[0];
      if (otro !== undefined && Math.hypot(C.estado(v, otro, s.desde).x - p.x, C.estado(v, otro, s.desde).z - p.z) < 9) sujetos = [sujetos[0], otro];
    }
    let oferta = OFERTA[tipoEscena];
    if (s.cat === 'camina') oferta = sujetos.length >= 3 ? OFERTA.grupo : OFERTA.camina;
    else if (s.cat === 'salta') oferta = OFERTA.salta;
    const clave = [...sujetos].slice(0, 2).sort((a, b) => a - b).join('-');
    if (!ladoDe.has(clave)) ladoDe.set(clave, ladoGlobal);
    const lado = ladoDe.get(clave);
    const seg = { ...s, sujetos };
    const ctxBase = { film: v, aspecto, lado, otro: (i) => ids.find((x) => x !== i) ?? i };
    const opciones = [];
    for (const tipo of oferta) {
      for (const empuje of conEmpuje && EMPUJABLES.has(tipo) ? [0, 0.3] : [0]) {
        // si hay otro actor tapando se prueba del otro lado
        let mejor = null;
        for (const [l2, ex] of [[lado, 0], [-lado, 0], [lado, 25], [-lado, -25]]) {
          const ctx = { ...ctxBase, lado: l2, extraAz: ex * l2, empuje };
          let toma;
          try { toma = C.construirToma(tipo, seg, ctx); } catch { continue; }
          if (!toma.puntos.length) continue;
          const o = C.oclusion(v, toma, seg, sujetos[0]);
          if (!mejor || o < mejor.oclusion - 0.05) mejor = { toma, oclusion: o, lado: l2 };
          if (mejor.oclusion < 0.1) break;
        }
        if (!mejor) continue;
        const nombre = (C.TOMAS[tipo] || {}).nombre || tipo;
        opciones.push({
          id: `${tipo}${empuje ? '+' : ''}`, tipo, empuje, nombre: nombre + (empuje ? ' con acercamiento' : ''),
          herramienta: herramientaFS(mejor.toma.puntos), toma: mejor.toma, oclusion: mejor.oclusion, lado: mejor.lado,
          puntaje: (GUSTO[tipo] ?? 1) - 3 * mejor.oclusion - (empuje ? 0.35 : 0),
        });
      }
    }
    opciones.sort((a, b) => b.puntaje - a.puntaje);
    const lista = opciones.slice(0, Math.max(3, cuantas));
    // la elegida de entrada: la mejor que no repite el plano anterior; el primer tramo arranca con un plano general si hay
    let elegida = 0;
    if (k === 0) { const g = lista.findIndex((o) => o.tipo === 'general'); if (g >= 0) elegida = g; }
    else { const i = lista.findIndex((o) => o.tipo !== previo); elegida = i >= 0 ? i : 0; }
    // regla de los 30°: no repetir el mismo ángulo con el mismo sujeto
    const ant = tramos[tramos.length - 1];
    if (ant && ant.sujetos.join() === sujetos.join()) {
      const prev = ant.opciones[ant.elegida];
      const j = lista.findIndex((o, n) => o.tipo !== (prev && prev.tipo) && (Math.abs(norm(o.toma.azimut - (prev ? prev.toma.azimut : 1e3))) >= 30 || ['cenital', 'general'].includes(o.tipo)) && (k !== 0 || n >= 0));
      if (j >= 0 && (lista[elegida].tipo === (prev && prev.tipo) || Math.abs(norm(lista[elegida].toma.azimut - (prev ? prev.toma.azimut : 1e3))) < 30)) elegida = j;
    }
    previo = lista[elegida] && lista[elegida].tipo;
    tramos.push({
      desde: s.desde, hasta: s.hasta, sujetos, cat: s.cat, opciones: lista, elegida,
      titulo: `${sujetos.map((i) => nombreActor(v, i)).join(' y ')}`,
    });
    if (lista[elegida] && lista[elegida].oclusion >= 0.35) avisos.push(`De ${(s.desde / TICKS).toFixed(1)} s a ${(s.hasta / TICKS).toFixed(1)} s otro actor tapa un poco al sujeto en el plano elegido.`);
  });
  return { tramos, avisos };
}

/** Los clips de BBS de lo que se eligió. formato: 'fs' | 'b22'. */
export function clipsDe(film, tramos, formato, titulo = 'Auto') {
  const capa = capaLibre(film, titulo);
  const clips = [];
  for (const t of tramos) {
    const o = t.opciones[t.elegida]; if (!o) continue;
    clips.push(clipDeToma(formato, { titulo: `${titulo}: ${o.nombre} · ${t.titulo}`, capa, desde: t.desde, hasta: t.hasta, puntos: o.toma.puntos, fov: o.toma.fov }));
  }
  return clips;
}
