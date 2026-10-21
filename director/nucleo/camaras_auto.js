// Cámaras automáticas: arma una sucesión de tomas (clips bbs:movement) para una escena ya animada, siguiendo reglas de composición:
//  - regla de los tercios: el sujeto va sobre una línea de tercio (no al centro), del lado que deja más aire hacia donde mira o camina
//    (espacio de mirada); los ojos van en el tercio de arriba en los planos medios y primeros planos;
//  - tomas variadas: plano general al empezar, plano medio, primer plano, de tres cuartos, contrapicado, lateral de seguimiento, cenital...
//    y nunca la misma toma dos veces seguidas;
//  - regla de los 30°: entre dos tomas seguidas del mismo sujeto la cámara cambia al menos 30° de ángulo (o cambia el tamaño del plano);
//  - regla de los 180°: en una charla entre dos, todas las tomas quedan del mismo lado de la línea que los une (nadie "cambia de lado");
//  - duraciones: ni cortes de menos de 2,5 s ni tomas de más de 8 s sin cambiar;
//  - la cámara nunca queda adentro de un actor.
// Todo en coordenadas del film (las mismas de los actores) y en ticks. Sin mapa del mundo: no sabe de paredes (una toma puede quedar tapada).
import { B, D, F, I, num } from '../../mocap/nucleo/bbsdat.js';
import * as capas from './capas.js';
import { Azar } from './azar.js';

const TICKS = capas.TICKS;
const R2D = 180 / Math.PI, D2R = Math.PI / 180;
export const PASO = 5;                 // ticks entre keyframes de una toma
export const MIN_TICKS = 50, MAX_TICKS = 160;
const OJOS = 1.62;                     // altura de los ojos de un personaje de BBS
export const TERCIO = 1 / 3;

export const TOMAS = {
  general: { nombre: 'plano general', fov: 60 },
  medio: { nombre: 'plano medio', fov: 45 },
  primer: { nombre: 'primer plano', fov: 38 },
  tres_cuartos: { nombre: 'plano medio de tres cuartos', fov: 45 },
  contrapicado: { nombre: 'contrapicado', fov: 52 },
  hombro: { nombre: 'sobre el hombro', fov: 40 },
  lateral_dos: { nombre: 'plano de perfil de los dos', fov: 45 },
  sigue: { nombre: 'seguimiento lateral', fov: 50 },
  atras: { nombre: 'seguimiento por detrás', fov: 55 },
  cenital: { nombre: 'cenital', fov: 60 },
};
// Planos por encuadre: `alto` = cuántos bloques de alto entran en pantalla (un personaje mide 1,8); la distancia sale del fov.
// objY = altura (sobre los pies) a la que apunta la cámara; camY = altura de la cámara; az = ángulo hacia un costado del frente del actor.
export const ENCUADRES = {
  entero: { nombre: 'plano entero', fov: 40, alto: 2.5, objY: 0.9, camY: 1.2, az: 14, ny: 0 },
  americano: { nombre: 'plano americano', fov: 40, alto: 1.9, objY: 1.62, camY: 1.4, az: 18, ny: TERCIO },
  medio_corto: { nombre: 'plano medio', fov: 40, alto: 1.5, objY: 1.62, camY: 1.55, az: 12, ny: TERCIO },
  primer_plano: { nombre: 'primer plano', fov: 35, alto: 0.85, objY: 1.62, camY: 1.62, az: 10, ny: TERCIO },
  detalle: { nombre: 'plano detalle (ojos)', fov: 30, alto: 0.3, objY: 1.64, camY: 1.64, az: 8, ny: 0 },
  picado: { nombre: 'picado', fov: 45, alto: 2.2, objY: 0.8, camY: 3.2, az: 16, ny: 0 },
  contra: { nombre: 'contrapicado', fov: 50, alto: 2.2, objY: 1.1, camY: 0.25, az: 18, ny: -0.1 },
  tres_cuartos_e: { nombre: 'tres cuartos', fov: 40, alto: 1.5, objY: 1.62, camY: 1.55, az: 40, ny: TERCIO },
};
Object.assign(TOMAS, Object.fromEntries(Object.entries(ENCUADRES).map(([k, v]) => [k, { nombre: v.nombre, fov: v.fov }])));
export const TODAS = Object.keys(TOMAS).filter((k) => !(k in ENCUADRES));     // las tomas de siempre (las de encuadre las usa planos.js)

// ---------------------------------------------------------------- geometría de cámara (convenciones de Minecraft)
// yaw 0 mira hacia +Z, yaw 90 hacia -X; pitch positivo mira hacia abajo.
export const yawHacia = (dx, dz) => Math.atan2(-dx, dz) * R2D;
export const pitchHacia = (dy, horiz) => -Math.atan2(dy, Math.max(1e-6, horiz)) * R2D;
const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const cercano = (actual, objetivo) => actual + norm(objetivo - actual);

/** Dónde cae el punto P en la pantalla de la cámara: {x, y} en -1..1 (x a la derecha, y arriba) y profundidad z. */
export function proyectar(cam, yaw, pitch, P, fov, aspecto = 16 / 9) {
  const y = yaw * D2R, p = pitch * D2R;
  const f = [-Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p)];
  const r = [-Math.cos(y), 0, -Math.sin(y)];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [P[0] - cam[0], P[1] - cam[1], P[2] - cam[2]];
  const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const t = Math.tan((fov * D2R) / 2);
  return { x: (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (z * t * aspecto), y: (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (z * t), z };
}
/** yaw y pitch para que el objetivo quede en (nx, ny) de la pantalla (-1..1). */
export function apuntar(cam, objetivo, nx, ny, fov, aspecto = 16 / 9) {
  let yaw = yawHacia(objetivo[0] - cam[0], objetivo[2] - cam[2]);
  let pitch = pitchHacia(objetivo[1] - cam[1], Math.hypot(objetivo[0] - cam[0], objetivo[2] - cam[2]));
  for (let k = 0; k < 8; k++) {
    const a = proyectar(cam, yaw, pitch, objetivo, fov, aspecto);
    const ex = a.x - nx, ey = a.y - ny;
    if (Math.abs(ex) < 1e-4 && Math.abs(ey) < 1e-4) break;
    const h = 0.5;
    const bx = proyectar(cam, yaw + h, pitch, objetivo, fov, aspecto), by = proyectar(cam, yaw, pitch + h, objetivo, fov, aspecto);
    const dx = (bx.x - a.x) / h, dy = (by.y - a.y) / h;
    if (Math.abs(dx) > 1e-9) yaw -= ex / dx;
    if (Math.abs(dy) > 1e-9) pitch -= ey / dy;
  }
  return [yaw, Math.max(-90, Math.min(90, pitch))];
}

// ---------------------------------------------------------------- los actores en el tiempo
const esDict = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function visible(rep, t) {
  const kf = ((((rep.animation || {}).visible) || {}).keyframes) || [];
  let v = true;
  for (const k of [...kf].sort((a, b) => num(a.tick) - num(b.tick))) if (num(k.tick) <= t + 1e-6) v = Boolean(num(k.value));
  return v;
}
function esMarca(rep) {
  const form = rep.form || {};
  const id = String(form.id ?? '');
  return id === 'bbs:anchor' || id === '' || (!form.model && id !== 'bbs:mob');
}
export function actores(film) {
  const reps = film.replays || [];
  return reps.map((r, i) => i).filter((i) => !esMarca(reps[i]) && (!film._solo || film._solo.includes(i)));   // _solo: lista de actores a filmar (la pone el Director)
}
/** Estado de un actor en un tick: {x, y, z, yaw}. */
export function estado(film, i, t) {
  const rep = film.replays[i];
  const [x, z, yaw] = capas.posicion(rep, t);
  return { x, y: capas.valorProp(rep, 'y', t), z, yaw };
}

export function finDeEscena(film, acciones) {
  let fin = 0;
  for (const a of acciones || []) fin = Math.max(fin, a.hasta || 0);
  for (const r of film.replays || []) {
    for (const k of Object.keys(r.props || {})) {
      const kf = ((((r.props[k] || {}).$anim || {}).track || {}).keyframes) || [];
      for (const q of kf) fin = Math.max(fin, num(q.tick));
    }
  }
  return fin;
}

// ---------------------------------------------------------------- qué pasa en cada momento
/** Acciones por tramos: si no hay lista de acciones del guion, se deducen de lo que se mueve. */
function actividad(film, acciones, ids, fin) {
  const bins = [];
  for (let t = 0; t < fin; t += PASO) {
    const act = new Map();   // actor -> categoria
    for (const a of acciones || []) {
      if (a.tipo === 'camara' || a.actor < 0 || !ids.includes(a.actor)) continue;
      if (a.desde < t + PASO && a.hasta > t) act.set(a.actor, a.tipo);
    }
    if (!acciones || !acciones.length) {
      for (const i of ids) {
        const a = estado(film, i, t), b = estado(film, i, t + PASO);
        const v = Math.hypot(b.x - a.x, b.z - a.z) / PASO;
        if (v > 0.12) act.set(i, 'corre'); else if (v > 0.02) act.set(i, 'camina');
        else if (Math.abs(norm(b.yaw - a.yaw)) > 1) act.set(i, 'gira');
      }
    }
    bins.push({ t, act });
  }
  return bins;
}
const categoria = (act) => {
  const tipos = [...act.values()];
  if (tipos.some((x) => x === 'salta')) return 'salta';
  if (tipos.some((x) => x === 'camina' || x === 'corre' || x === 'entra')) return 'camina';
  if (tipos.some((x) => x === 'mira' || x === 'senala' || x === 'gira')) return 'mira';
  if (tipos.some((x) => x === 'pose')) return 'pose';
  return 'quieto';
};

/** Tramos [{desde, hasta, sujetos, cat}] con cortes de entre MIN_TICKS y MAX_TICKS. */
export function segmentar(film, acciones, fin, minTicks = MIN_TICKS, maxTicks = MAX_TICKS) {
  const ids = actores(film);
  if (!ids.length) return [];
  const bins = actividad(film, acciones, ids, fin);
  let segs = [];
  for (const b of bins) {
    const sujetos = [...b.act.keys()].sort((x, y) => x - y), cat = categoria(b.act);
    const u = segs[segs.length - 1];
    if (u && u.cat === cat && u.sujetos.join() === sujetos.join()) u.hasta = b.t + PASO;
    else segs.push({ desde: b.t, hasta: b.t + PASO, sujetos, cat });
  }
  // nadie hace nada: se queda con el sujeto anterior (o con todos al empezar)
  segs.forEach((s, k) => { if (!s.sujetos.length) s.sujetos = k ? segs[k - 1].sujetos : ids.length > 2 ? ids : ids; });
  // tramos cortos: se pegan al anterior
  const out = [];
  for (const s of segs) {
    const u = out[out.length - 1];
    if (u && s.hasta - s.desde < minTicks) { u.hasta = s.hasta; u.sujetos = [...new Set([...u.sujetos, ...s.sujetos])].sort((a, b) => a - b); }
    else out.push({ ...s });
  }
  if (out.length > 1 && out[0].hasta - out[0].desde < minTicks) { out[1].desde = out[0].desde; out.shift(); }
  // tramos largos: se cortan en partes parejas
  const res = [];
  for (const s of out) {
    const n = Math.max(1, Math.ceil((s.hasta - s.desde) / maxTicks));
    for (let k = 0; k < n; k++) res.push({ ...s, desde: Math.round(s.desde + ((s.hasta - s.desde) * k) / n), hasta: Math.round(s.desde + ((s.hasta - s.desde) * (k + 1)) / n), parte: k, partes: n });
  }
  return res;
}

// ---------------------------------------------------------------- tomas
const adelante = (yawDeg) => [-Math.sin(yawDeg * D2R), Math.cos(yawDeg * D2R)];
const centro = (film, ids, t) => {
  const ps = ids.map((i) => estado(film, i, t)), n = ps.length || 1;
  const c = { x: 0, y: 0, z: 0 };
  for (const p of ps) { c.x += p.x / n; c.y += p.y / n; c.z += p.z / n; }
  c.radio = Math.max(0, ...ps.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
  c.yaw = ps.length ? ps[0].yaw : 0;
  return c;
};
// hacia dónde se mueve el grupo (vector unitario en el piso) alrededor de t; null si está quieto
function rumbo(film, ids, t) {
  const a = centro(film, ids, t), b = centro(film, ids, t + 10);
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  return d > 0.15 ? [(b.x - a.x) / d, (b.z - a.z) / d] : null;
}

/**
 * Una toma: devuelve {puntos: [[tick relativo, x, y, z, yaw, pitch]], fov, azimut, nota}.
 * ctx: {film, aspecto, lado (de la linea de los dos: +1 o -1), azimutPrevio}
 */
export function construirToma(tipo, seg, ctx) {
  const { film } = ctx, asp = ctx.aspecto, largo = seg.hasta - seg.desde;
  const fov = TOMAS[tipo].fov;
  const ids = seg.sujetos.length ? seg.sujetos : actores(film);
  const principal = ids[0];
  const ini = estado(film, principal, seg.desde);
  const sig = ctx.lado;
  const hfovTan = Math.tan((fov * D2R) / 2) * asp;
  const puntos = [];
  // lado de la pantalla donde queda el sujeto: del lado opuesto a hacia donde mira o va (aire hacia adelante)
  const ladoAire = (yawSujeto, cam, p) => {
    const r = [-Math.cos(cam.yaw * D2R), -Math.sin(cam.yaw * D2R)];
    const f = adelante(yawSujeto);
    return f[0] * r[0] + f[1] * r[1] > 0 ? -1 : 1;   // mira hacia la derecha de la pantalla -> va a la izquierda
  };
  let azimut = 0;
  for (let tr = 0; ; tr = Math.min(largo, tr + PASO)) {
    const f = largo > 0 ? tr / largo : 1, t = seg.desde + tr;
    const p = estado(film, principal, t);
    let cam, objetivo, nx = 0, ny = 0;
    if (ENCUADRES[tipo]) {
      const E = ENCUADRES[tipo];
      const dist = (E.alto / (2 * Math.tan((fov * D2R) / 2))) * (1 - (ctx.empuje || 0) * f);     // empuje: cuánto se acerca (dolly in) hasta el final
      azimut = E.az * sig + (ctx.extraAz || 0);
      const [dx, dz] = adelante(ini.yaw + azimut);
      cam = [ini.x + dx * dist, ini.y + E.camY, ini.z + dz * dist];
      objetivo = [p.x, p.y + E.objY, p.z];
      ny = E.ny;
      nx = TERCIO * ladoAire(ini.yaw, { yaw: yawHacia(p.x - cam[0], p.z - cam[2]) }, p);
    } else if (tipo === 'general') {
      const c = centro(film, ids, t), c0 = centro(film, ids, seg.desde);
      const dist = Math.max(6.5, c0.radio * 2 + 4) * (1 - 0.08 * f);
      azimut = 35 * sig;
      const [dx, dz] = adelante(c0.yaw + azimut);
      cam = [c0.x + dx * dist, c0.y + 3.6 - f * 0.5, c0.z + dz * dist];
      objetivo = [c.x, c.y + 1.0, c.z];
      ny = -0.12;
      const yaw0 = yawHacia(objetivo[0] - cam[0], objetivo[2] - cam[2]);
      nx = TERCIO * ladoAire(c0.yaw, { yaw: yaw0 }, c);
    } else if (tipo === 'medio' || tipo === 'tres_cuartos' || tipo === 'contrapicado') {
      const base = { medio: 3.2, tres_cuartos: 3.4, contrapicado: 2.8 }[tipo] * (1 - 0.12 * f);
      azimut = (tipo === 'tres_cuartos' ? 38 : tipo === 'contrapicado' ? 22 : 8) * sig + (ctx.extraAz || 0);
      const [dx, dz] = adelante(ini.yaw + azimut);
      cam = [ini.x + dx * base, ini.y + (tipo === 'contrapicado' ? 0.35 : OJOS - 0.1), ini.z + dz * base];
      objetivo = [p.x, p.y + OJOS, p.z];
      ny = tipo === 'contrapicado' ? 0.12 : TERCIO;           // ojos en el tercio de arriba
      nx = TERCIO * ladoAire(ini.yaw, { yaw: yawHacia(p.x - cam[0], p.z - cam[2]) }, p);
    } else if (tipo === 'primer') {
      const base = 1.9 * (1 - 0.1 * f);
      azimut = 14 * sig + (ctx.extraAz || 0);
      const [dx, dz] = adelante(ini.yaw + azimut);
      cam = [ini.x + dx * base, ini.y + OJOS, ini.z + dz * base];
      objetivo = [p.x, p.y + OJOS, p.z];
      ny = TERCIO;
      nx = TERCIO * ladoAire(ini.yaw, { yaw: yawHacia(p.x - cam[0], p.z - cam[2]) }, p);
    } else if (tipo === 'hombro') {
      const otro = ids[1] ?? ctx.otro(principal, t);
      const o = estado(film, otro, t);
      const ex = o.x - p.x, ez = o.z - p.z, d = Math.hypot(ex, ez) || 1, u = [ex / d, ez / d];
      const lado = [-u[1] * sig, u[0] * sig];                    // al costado de la línea que los une, siempre del mismo lado
      cam = [p.x - u[0] * 1.1 + lado[0] * 0.45, p.y + OJOS + 0.05, p.z - u[1] * 1.1 + lado[1] * 0.45];
      objetivo = [o.x, o.y + OJOS, o.z];
      azimut = yawHacia(u[0], u[1]);
      ny = TERCIO;
      // el otro queda del lado contrario al hombro por el que se mira
      const r = [-Math.cos(azimut * D2R), -Math.sin(azimut * D2R)];
      nx = (lado[0] * r[0] + lado[1] * r[1] > 0 ? -1 : 1) * TERCIO;
    } else if (tipo === 'lateral_dos') {
      const otro = ids[1] ?? ctx.otro(principal, t);
      const o = estado(film, otro, t);
      const mx = (p.x + o.x) / 2, mz = (p.z + o.z) / 2, sep = Math.hypot(o.x - p.x, o.z - p.z);
      const ex = (o.x - p.x) / (sep || 1), ez = (o.z - p.z) / (sep || 1);
      // distancia para que cada uno caiga sobre un tercio de la pantalla
      const dist = Math.max(3.5, sep / 2 / (TERCIO * hfovTan));
      const lado = [-ez * sig, ex * sig];
      cam = [mx + lado[0] * dist, Math.max(p.y, o.y) + 1.5, mz + lado[1] * dist];
      objetivo = [mx, (p.y + o.y) / 2 + 1.1, mz];
      azimut = yawHacia(lado[0], lado[1]);
      ny = -0.05;
    } else if (tipo === 'sigue') {
      const v = rumbo(film, [principal], t) || adelante(p.yaw);
      const lado = [-v[1] * sig, v[0] * sig];
      cam = [p.x + lado[0] * 3.4, p.y + 1.5, p.z + lado[1] * 3.4];
      objetivo = [p.x, p.y + 1.25, p.z];
      azimut = yawHacia(lado[0], lado[1]);
      const yaw0 = yawHacia(objetivo[0] - cam[0], objetivo[2] - cam[2]);
      const r = [-Math.cos(yaw0 * D2R), -Math.sin(yaw0 * D2R)];
      nx = (v[0] * r[0] + v[1] * r[1] > 0 ? -1 : 1) * TERCIO;     // más aire hacia donde va
      ny = -0.05;
    } else if (tipo === 'atras') {
      const v = rumbo(film, [principal], t) || adelante(p.yaw);
      cam = [p.x - v[0] * 3.6, p.y + 2.0, p.z - v[1] * 3.6];
      objetivo = [p.x, p.y + 1.3, p.z];
      azimut = yawHacia(v[0], v[1]);
      ny = -0.1; nx = TERCIO * sig * 0.0;
    } else {   // cenital: mirando derecho hacia abajo, con el frente de la pantalla hacia donde va el grupo
      const c = centro(film, ids, t);
      const alto = Math.max(9, c.radio * 2.4 + 6);
      cam = [c.x, c.y + alto, c.z];
      const v = rumbo(film, ids, t) || adelante(c.yaw);
      puntos.push([tr, cam[0], cam[1], cam[2], cercano(puntos.length ? puntos[puntos.length - 1][4] : 0, yawHacia(v[0], v[1])), 90]);
      azimut = 0;
      if (tr >= largo) break;
      continue;
    }
    // la cámara nunca queda adentro de un actor
    for (const i of ids.length > 1 ? ids : actores(film)) {
      const a = estado(film, i, t);
      const dx = cam[0] - a.x, dz = cam[2] - a.z, dh = Math.hypot(dx, dz);
      if (dh < 0.8 && cam[1] < a.y + 2.0 && !(i === principal && tipo === 'hombro')) { const k = 0.8 / (dh || 1); cam[0] = a.x + (dh ? dx * k : k); cam[2] = a.z + (dh ? dz * k : 0); }
    }
    const [yaw, pitch] = apuntar(cam, objetivo, nx, ny, fov, asp);
    puntos.push([tr, cam[0], cam[1], cam[2], puntos.length ? cercano(puntos[puntos.length - 1][4], yaw) : yaw, pitch]);
    if (tr >= largo) break;
  }
  return { puntos, fov, azimut };
}

// cuánto de la toma tiene a otro actor tapando al sujeto (0 a 1): alguien parado entre la cámara y él
export function oclusion(film, toma, seg, principal) {
  const otros = actores(film).filter((i) => !seg.sujetos.includes(i));
  if (!otros.length) return 0;
  let malos = 0;
  for (const q of toma.puntos) {
    const t = seg.desde + q[0], s = estado(film, principal, t);
    const cam = [q[1], q[3]], obj = [s.x, s.z], d = [obj[0] - cam[0], obj[1] - cam[1]], L2 = d[0] * d[0] + d[1] * d[1] || 1;
    for (const i of otros) {
      const o = estado(film, i, t), k = ((o.x - cam[0]) * d[0] + (o.z - cam[1]) * d[1]) / L2;
      if (k <= 0.05 || k >= 0.95) continue;
      if (Math.hypot(o.x - (cam[0] + d[0] * k), o.z - (cam[1] + d[1] * k)) < 0.55) { malos++; break; }
    }
  }
  return malos / toma.puntos.length;
}

// ---------------------------------------------------------------- elegir las tomas
const CANDIDATAS = {
  camina: ['sigue', 'atras', 'cenital', 'general', 'medio'],
  dos: ['hombro', 'lateral_dos', 'medio', 'tres_cuartos'],
  grupo: ['general', 'cenital', 'lateral_dos'],
  salta: ['contrapicado', 'sigue', 'medio'],
  uno: ['medio', 'primer', 'tres_cuartos', 'contrapicado'],
};

/**
 * Arma las cámaras de la escena. Devuelve {clips, plan, avisos}. No toca el film: los clips se agregan afuera.
 * opciones: acciones (del guion), tipos (cuáles se permiten), semilla, aspecto, inicioGeneral (empieza con plano general), cierreGeneral.
 */
export function camarasAuto(film, { acciones = null, tipos = TODAS, semilla = 1, aspecto = 16 / 9, inicioGeneral = true, cierreGeneral = false, capa = null, titulo = 'Auto' } = {}) {
  const avisos = [];
  const ids = actores(film);
  if (!ids.length) return { clips: [], plan: [], avisos: ['No hay actores para filmar.'] };
  const fin = Math.max(60, Math.ceil(finDeEscena(film, acciones)) + 10);
  const segs = segmentar(film, acciones, fin);
  const azar = new Azar(semilla);
  const permitido = new Set(tipos);
  const ladoDe = new Map();          // pareja -> +1 / -1 (regla de los 180°)
  const plan = [], clips = [];
  const hay = (t) => TODAS.filter((x) => permitido.has(x)).includes(t);
  let previa = null;
  segs.forEach((s, k) => {
    // lista de tomas posibles según lo que pasa
    const suj = s.sujetos;
    let tipoEscena = suj.length >= 3 ? 'grupo' : suj.length === 2 ? 'dos' : 'uno';
    let cands = CANDIDATAS[tipoEscena];
    if (s.cat === 'camina') cands = suj.length >= 3 ? CANDIDATAS.grupo : CANDIDATAS.camina;
    else if (s.cat === 'salta') cands = CANDIDATAS.salta;
    else if (s.cat === 'mira' && suj.length === 1 && ids.length > 1) { tipoEscena = 'dos'; cands = CANDIDATAS.dos; }
    cands = cands.filter(hay);
    // un sujeto solo en una charla: se le suma el actor más cercano
    let sujetos = suj.length ? suj : [ids[0]];
    if ((tipoEscena === 'dos' || cands.some((c) => c === 'hombro' || c === 'lateral_dos')) && sujetos.length === 1 && ids.length > 1) {
      const p = estado(film, sujetos[0], s.desde);
      const otro = ids.filter((i) => i !== sujetos[0]).sort((a, b) => { const A = estado(film, a, s.desde), Bq = estado(film, b, s.desde); return Math.hypot(A.x - p.x, A.z - p.z) - Math.hypot(Bq.x - p.x, Bq.z - p.z); })[0];
      sujetos = [sujetos[0], otro];
    }
    if (!cands.length) cands = TODAS.filter(hay);
    if (!cands.length) { avisos.push('No hay ningún tipo de toma permitido.'); return; }
    // puntaje: primero las primeras de la lista, nunca la misma que la anterior, y evitar las dos últimas
    let elegida = null;
    if (k === 0 && inicioGeneral && hay('general')) elegida = 'general';
    else if (k === segs.length - 1 && cierreGeneral && hay('general') && previa !== 'general') elegida = 'general';
    else {
      const pesos = cands.map((c, j) => {
        let w = Math.max(0.3, 3 - j * 0.7);
        if (c === previa) w = 0;
        else if (plan.length > 1 && plan[plan.length - 2].tipo === c) w *= 0.35;
        return w;
      });
      let tot = pesos.reduce((a, b) => a + b, 0);
      if (tot <= 0) { const otras = TODAS.filter((c) => hay(c) && c !== previa); elegida = cands.find((c) => c !== previa) || otras[Math.floor(azar.random() * otras.length)] || cands[0]; }
      else { let r = azar.random() * tot; for (let j = 0; j < cands.length; j++) { r -= pesos[j]; if (r <= 0) { elegida = cands[j]; break; } } elegida = elegida || cands[cands.length - 1]; }
    }
    // la regla de los 180°: el lado se guarda por pareja
    const clave = sujetos.slice(0, 2).sort((a, b) => a - b).join('-');
    if (!ladoDe.has(clave)) ladoDe.set(clave, azar.random() < 0.5 ? 1 : -1);
    let lado = ladoDe.get(clave);
    if (sujetos.length < 2 && (elegida === 'medio' || elegida === 'tres_cuartos' || elegida === 'primer' || elegida === 'contrapicado')) {
      // un solo actor: se alterna el lado para variar el ángulo (regla de los 30° con la toma anterior del mismo sujeto)
      lado = previa && plan.length && plan[plan.length - 1].sujetos.join() === sujetos.join() ? -plan[plan.length - 1].lado : (azar.random() < 0.5 ? 1 : -1);
    }
    const ctx = { film, aspecto, lado, otro: (i) => ids.find((x) => x !== i) ?? i };
    const seg = { ...s, sujetos };
    let toma = construirToma(elegida, seg, ctx);
    // si otro actor tapa al sujeto, se prueba del otro lado y con otros ángulos, y se queda con el que menos tapa
    if (['medio', 'tres_cuartos', 'contrapicado', 'primer'].includes(elegida)) {
      let mejor = { toma, lado, extra: 0, o: oclusion(film, toma, seg, sujetos[0]) };
      for (const [l2, ex] of [[lado, 0], [-lado, 0], [lado, 30], [-lado, -30], [lado, -30], [-lado, 30]]) {
        if (mejor.o < 0.1) break;
        if (l2 === lado && ex === 0) continue;
        const c2 = { ...ctx, lado: l2, extraAz: ex * l2 };
        const t2 = construirToma(elegida, seg, c2), o2 = oclusion(film, t2, seg, sujetos[0]);
        if (o2 < mejor.o - 0.05) mejor = { toma: t2, lado: l2, extra: ex, o: o2 };
      }
      toma = mejor.toma; lado = mejor.lado; ctx.lado = lado; ctx.extraAz = mejor.extra * lado;
      if (mejor.o >= 0.35) avisos.push(`De ${(s.desde / TICKS).toFixed(1)} s a ${(s.hasta / TICKS).toFixed(1)} s hay otro actor que tapa un poco al sujeto (sin mapa no se puede evitar del todo).`);
    }
    // regla de los 30°: mismo sujeto y mismo tipo de plano que la anterior -> se cambia el ángulo
    const ant = plan[plan.length - 1];
    if (ant && ant.sujetos.join() === sujetos.join() && Math.abs(norm(toma.azimut - ant.azimut)) < 30 && ant.tipo !== elegida && !['cenital', 'general'].includes(elegida)) {
      ctx.lado = -lado; lado = -lado;
      toma = construirToma(elegida, seg, ctx);
    }
    const capaN = capa ?? Math.max(-1, ...(film.camera || []).filter((c) => !String(c.title || '').startsWith(titulo + ':')).map((c) => num(c.layer ?? 0))) + 1;
    const nombre = sujetos.map((i) => (film.replays[i].form || {}).name || film.replays[i].label || `#${i + 1}`).join(' y ');
    clips.push(clipDe({ titulo: `${titulo}: ${TOMAS[elegida].nombre} · ${nombre}`, capa: capaN, desde: s.desde, hasta: s.hasta, puntos: toma.puntos, fov: toma.fov }));
    plan.push({ desde: s.desde, hasta: s.hasta, tipo: elegida, nombre: TOMAS[elegida].nombre, sujetos, lado, azimut: toma.azimut });
    previa = elegida;
  });
  return { clips, plan, avisos };
}

// ---------------------------------------------------------------- clip de BBS
function canal(puntos, k) {
  const kf = puntos.map((q) => ({ interp: 'linear', tick: F(Math.round(q[0] * 1000) / 1000), value: D(Math.round(q[k] * 10000) / 10000) }));
  return { $anim: { v: D(Math.round(puntos[0][k] * 10000) / 10000), track: { keyframes: kf, type: 'double' } } };
}
export function clipDe({ titulo, capa, desde, hasta, puntos, fov }) {
  return {
    type: 'bbs:movement', title: titulo, enabled: B(1), layer: I(capa),
    tick: I(Math.round(desde)), duration: I(Math.max(1, Math.round(hasta - desde))),
    envelope: { mode: I(0), pre: 'linear', fadeOut: F(10.0), post: 'linear', fadeIn: F(10.0), factor: D(1.0), enabled: B(0) },
    active: I(127), distance: F(0.0), dolly: F(0.0),
    x: canal(puntos, 1), y: canal(puntos, 2), z: canal(puntos, 3), yaw: canal(puntos, 4), pitch: canal(puntos, 5), roll: D(0.0), fov: D(fov),
  };
}
