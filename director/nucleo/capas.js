// Capas automáticas (port de capas.py del Director de la PC): boca, parpadeos y mirada sobre un film de BBS.
// Entra un film (formato nuevo de BBS 2.x) y sale una copia con pistas nuevas. El original no se toca.
//
// Convenciones (verificadas en el mocap): 20 ticks por segundo; en la parte de ojos t.x positivo = hacia la
// IZQUIERDA del personaje. Minecraft: yaw 0 = mira hacia +Z; mirando hacia +Z, +X queda a la izquierda.
import { F, I, D, num, clonar } from '../../mocap/nucleo/bbsdat.js';
import { Azar } from './azar.js';
import { pyRound, pyMod, radians, degrees, copysign, clip as recortar, searchRight } from './py.js';
import { cerrarPorVolumen, bocaSimple } from './audio.js';

export { num, clonar };
export const TICKS = 20;
export const HOLGURA_NARIZ = 0.25;
export const PROF_PARPADO_CERRADO = 0.0625;
export const HUESOS_OJOS = ['pupil_l', 'pupil_r', 'eyelid_lt', 'eyelid_lb', 'eyelid_rt', 'eyelid_rb'];
export const CABEZA_FACTOR = 1.0, CABEZA_MAX = radians(45), CABEZA_TRANS = 6;

const esDict = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !('code' in v && 'v' in v);
const tiene = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
export const vec = (v, porDefecto) => (v && v.length ? v.map(num) : porDefecto.slice());

// ---------------------------------------------------------------- film
export function revisarFilm(film) {
  const reps = film.replays || [];
  if (reps.length && !reps.some((r) => tiene(r, 'animation'))) {
    throw new Error('Este film está en el formato viejo de BBS. Abrilo en BBS 2.2, guardalo y probá de nuevo.');
  }
  return film;
}

export function nombreActor(rep, i) {
  const form = rep.form || {};
  const nombre = String(form.name || rep.label || rep.name_tag || '').trim();
  const modelo = String(form.model || form.id || '?');
  return `${i + 1}. ${nombre || '(sin nombre)'} — ${modelo}`;
}

// tabla = bocas.json (sin la clave _ayuda)
export function parteBoca(rep, tabla) {
  const partes = (rep.form || {}).parts || [];
  for (let idx = 0; idx < partes.length; idx++) {
    const m = String((partes[idx].form || {}).model || '');
    if (tiene(tabla, m) && !m.startsWith('_')) return { idx, modelo: m, ...tabla[m] };
  }
  return null;
}

export function parteOjos(rep) {
  const partes = (rep.form || {}).parts || [];
  for (let idx = 0; idx < partes.length; idx++) {
    const fm = partes[idx].form || {};
    const m = String(fm.model || '');
    if (m !== 'player/eyes' && m !== 'player/eyes_1px') continue;
    const reposo = {};
    for (const [b, v] of Object.entries(fm.pose || {})) {
      if (esDict(v)) {
        reposo[b] = { t: vec(v.t, [0, 0, 0]), s: vec(v.s, [1, 1, 1]), r: vec(v.r, [0, 0, 0]), color: tiene(v, 'color') ? Math.trunc(num(v.color)) : -1 };
      }
    }
    return { idx, modelo: m.split('/').pop(), reposo };
  }
  return null;
}

export function tienePistas(rep, prefijo, huesos = null) {
  for (const [k, v] of Object.entries(rep.animation || {})) {
    if (k.startsWith(prefijo) && (huesos === null || huesos.includes(k.slice(prefijo.length))) && ((v && v.keyframes) || []).length) return true;
  }
  return false;
}

export const cabezaAnimada = (rep) => (((rep.animation || {})['pose/head'] || {}).keyframes || []).length > 0;

export function valorProp(rep, clave, tick, defecto = 0.0) {
  const p = (rep.props || {})[clave];
  if (!esDict(p) || !tiene(p, '$anim')) return defecto;
  const a = p.$anim;
  const kf = ((a.track || {}).keyframes) || [];
  if (!kf.length) return tiene(a, 'v') ? num(a.v) : defecto;
  const ts = kf.map((k) => num(k.tick)), vs = kf.map((k) => num(k.value));
  if (tick <= ts[0]) return vs[0];
  if (tick >= ts[ts.length - 1]) return vs[vs.length - 1];
  const j = searchRight(ts, tick);
  const t0 = ts[j - 1], t1 = ts[j], v0 = vs[j - 1], v1 = vs[j];
  return v0 + (v1 - v0) * (t1 > t0 ? (tick - t0) / (t1 - t0) : 0);
}

// [x, z, yaw del cuerpo] del actor en ese tick
export function posicion(rep, tick) {
  const yc = (rep.props || {}).bodyYaw;
  const clave = esDict(yc) && (((yc.$anim || {}).track || {}).keyframes || []).length ? 'bodyYaw' : 'yaw';
  return [valorProp(rep, 'x', tick), valorProp(rep, 'z', tick), valorProp(rep, clave, tick)];
}

// Ángulo (radianes) desde el frente del actor hasta el otro; positivo = el otro está a su izquierda
export function anguloHacia(rep, otro, tick) {
  const [x, z, yaw] = posicion(rep, tick), [ox, oz] = posicion(otro, tick);
  const dx = ox - x, dz = oz - z;
  if (Math.abs(dx) + Math.abs(dz) < 1e-6) return 0.0;
  const y = radians(yaw);
  const frente = [-Math.sin(y), Math.cos(y)], izq = [Math.cos(y), Math.sin(y)];
  return Math.atan2(dx * izq[0] + dz * izq[1], dx * frente[0] + dz * frente[1]);
}

export function ultimoTick(film) {
  let fin = 0.0;
  for (const c of film.camera || []) {
    const v = num(c.tick ?? 0) + num(c.duration ?? 0);
    if (Number.isFinite(v)) fin = Math.max(fin, v);
  }
  for (const r of film.replays || []) {
    for (const v of Object.values(r.animation || {})) for (const k of (v && v.keyframes) || []) fin = Math.max(fin, num(k.tick));
    for (const v of Object.values(r.props || {})) {
      if (esDict(v) && tiene(v, '$anim')) for (const k of ((v.$anim.track || {}).keyframes) || []) fin = Math.max(fin, num(k.tick));
    }
  }
  return fin;
}

// Ticks donde cambia la pose del cuerpo (para pegar los parpadeos ahí, como hace él)
export function ticksDePose(rep) {
  const ts = new Set();
  for (const [k, v] of Object.entries(rep.animation || {})) if (k.startsWith('pose/')) for (const x of (v && v.keyframes) || []) ts.add(num(x.tick));
  return [...ts].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- audio
// Clips de audio del film. archivoDe('assets:audio/X.wav') -> identificador del audio (o null si no está)
export function clipsAudio(film, archivoDe = () => null) {
  const out = [];
  (film.camera || []).forEach((c, i) => {
    if (c.type !== 'bbs:audio') return;
    out.push({ i, audio: String(c.audio ?? ''), archivo: c.audio ? archivoDe(String(c.audio)) : null,
      tick: num(c.tick ?? 0), offset: num(c.offset ?? 0), dur: num(c.duration ?? 0), activo: Boolean(num(c.enabled ?? 1)) });
  });
  return out;
}

// Segundos del audio que suenan en el film según el clip (offset negativo = el audio empieza más tarde)
export function rangoAudio(clip) {
  const a = Math.max(0.0, clip.offset) / TICKS, z = (clip.offset + clip.dur) / TICKS;
  return [a, Math.max(a, z)];
}

export const tickFilm = (clip, segAudio) => clip.tick + (segAudio * TICKS - clip.offset);

// ---------------------------------------------------------------- pistas
export const kf = (tick, valor, interp = 'constant') => ({ interp, tick: F(pyRound(Number(tick), 3)), value: valor });

export function transform(t = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], color = -1) {
  return { r: r.map((x) => F(Number(x))), s: s.map((x) => F(Number(x))), t: t.map((x) => F(Number(x))), fix: F(0.0), color: I(Math.trunc(color)), lighting: F(0.0) };
}

// Pistas de la boca. tramos: [[clip, aS, zS]]. Fuera de los tramos la boca queda cerrada.
// Igual que sus films: 'constant', hueso visible = sin r/s/t, escondido = s 0.
export function construirBoca(parte, cues, tramos) {
  const { formas, huesos, idx } = parte;
  const forma = (v) => (tiene(formas, v) ? formas[v] : null);
  const cambios = [];
  const ordenados = tramos.map((x, k) => [x, k]).sort((p, q) => tickFilm(p[0][0], p[0][1]) - tickFilm(q[0][0], q[0][1]) || p[1] - q[1]).map((p) => p[0]);
  for (const [clip, a, z] of ordenados) {
    for (const c of cues) {
      const s0 = Math.max(a, c.start), s1 = Math.min(z, c.end);
      if (s1 <= s0) continue;
      cambios.push([tickFilm(clip, s0), forma(c.value)]);
    }
    cambios.push([tickFilm(clip, z), null]);
  }
  cambios.sort((p, q) => p[0] - q[0]);
  const seq = [[0.0, null]];
  for (let [tk, h] of cambios) {
    const ult = seq[seq.length - 1];
    if (tk < ult[0]) tk = ult[0];
    if (ult[0] === tk) seq[seq.length - 1] = [tk, h];
    else if (ult[1] !== h) seq.push([tk, h]);
  }
  const limpio = [seq[0]];
  for (const [tk, h] of seq.slice(1)) if (h !== limpio[limpio.length - 1][1]) limpio.push([tk, h]);
  const pistas = {};
  for (const b of huesos) pistas[`${idx}/pose/${b}`] = { keyframes: [], type: 'pose_transform' };
  const estado = {};
  for (const [tk, h] of limpio) {
    for (const b of huesos) {
      const v = b === h;
      if (estado[b] === v) continue;
      estado[b] = v;
      pistas[`${idx}/pose/${b}`].keyframes.push(kf(tk, v ? { fix: F(0.0), color: I(-1), lighting: F(0.0) } : transform(undefined, [0, 0, 0])));
    }
  }
  return [pistas, limpio.filter(([, h]) => h !== null).length];
}

// Como construirBoca pero cada tramo con sus propias formas (pueden venir de audios distintos)
export function bocaVarios(pb, todos) {
  const cambios = [];
  for (const [clip, a, z, cues] of todos) {
    for (const c of cues) {
      const s0 = Math.max(a, c.start), s1 = Math.min(z, c.end);
      if (s1 > s0) cambios.push([tickFilm(clip, s0), c.value]);
    }
    cambios.push([tickFilm(clip, z), 'X']);
  }
  cambios.sort((p, q) => p[0] - q[0]);
  if (!cambios.length) return construirBoca(pb, [], []);
  const clip0 = { tick: 0.0, offset: 0.0 };
  // los "segundos" de este clip falso son ticks/20: así tickFilm devuelve el mismo tick
  const cues = cambios.map(([tk, v], k) => ({ start: tk / TICKS, end: (k + 1 < cambios.length ? cambios[k + 1][0] : tk + 1) / TICKS, value: v }));
  return construirBoca(pb, cues, [[clip0, cues[0].start, cues[cues.length - 1].end]]);
}

// Parpadeos [[a, z]] en ticks, pegados al cambio de pose más cercano si hay uno a menos de 'cerca' ticks
export function parpadeosAuto(desde, hasta, ticksPose, rnd, minS = 1.2, maxS = 3.5, cerca = 6) {
  const out = [];
  let t = desde + rnd.uniform(0.3, 1.0) * TICKS;
  while (t < hasta - 4) {
    let a = t;
    if (ticksPose.length) {
      let j = 0;
      for (let k = 1; k < ticksPose.length; k++) if (Math.abs(ticksPose[k] - t) < Math.abs(ticksPose[j] - t)) j = k;
      if (Math.abs(ticksPose[j] - t) <= cerca) a = ticksPose[j];
    }
    a = pyRound(a);
    if (!out.length || a > out[out.length - 1][1] + 4) out.push([a, a + rnd.choice([2, 3, 3, 3, 4])]);
    t += rnd.uniform(minS, maxS) * TICKS;
  }
  return out;
}

export function nivelMirada(ang) {
  const g = Math.abs(degrees(ang));
  const lvl = g < 12 ? 0.0 : (g < 35 ? 0.5 : 1.0);
  return lvl ? copysign(lvl, ang) : 0.0;
}

// Pistas de pupilas y párpados. miradas: [[tick, gx]] con gx de -1 a 1 (positivo = a su izquierda).
// posesOjos = poses.json del modelo de ojos (para la pose 'closed')
export function construirOjos(parte, parpadeos, miradas, posesOjos = {}) {
  const { idx, reposo } = parte;
  const cerrado = ((posesOjos || {}).closed || {}).pose || {};
  const rest = (b) => {
    const r = reposo[b] || {};
    return { t: [...(r.t || [0, 0, 0])], s: [...(r.s || [1, 1, 1])], r: [...(r.r || [0, 0, 0])], color: r.color ?? -1 };
  };
  const anchoOjo = tiene(reposo, 'eye_l') ? 2 * rest('eye_l').s[0] : 2.0;
  const recorrido = recortar(anchoOjo - rest('pupil_l').s[0], 0.5, 3.0);
  const ticks = new Set([0]);
  for (const [a, z] of parpadeos) { ticks.add(a); ticks.add(z); }
  for (const [t] of miradas) ticks.add(t);
  const pistas = {}, ultimo = {};
  for (const tk of [...ticks].sort((a, b) => a - b)) {
    let gx = 0.0;
    for (const [t, g] of miradas) if (t <= tk) gx = g;
    const cerr = parpadeos.some(([a, z]) => a <= tk && tk < z);
    const est = {};
    for (const [lado, sg] of [['l', 1], ['r', -1]]) {
      const p = rest('pupil_' + lado);
      p.t[0] += gx * (gx * sg > 0 ? recorrido : HOLGURA_NARIZ);
      est['pupil_' + lado] = p;
      for (const pos of ['t', 'b']) {
        const nombre = `eyelid_${lado}${pos}`;
        const v = rest(nombre);
        if (cerr && tiene(cerrado, nombre)) {
          const d = cerrado[nombre];
          const dt = d.t || [0, 0, 0], ds = d.s || [1, 1, 1];
          v.t = v.t.map((x, k) => x + dt[k]);
          v.s = v.s.map((x, k) => x * ds[k]);
          v.t[2] = Math.min(v.t[2], PROF_PARPADO_CERRADO);
        }
        est[nombre] = v;
      }
    }
    for (const b of HUESOS_OJOS) {
      const v = est[b];
      const clave = [v.t, v.s, v.r].map((xs) => xs.map((x) => pyRound(x, 3)).join(',')).join('|');
      if (ultimo[b] === clave) continue;
      ultimo[b] = clave;
      (pistas[`${idx}/pose/${b}`] ??= { keyframes: [], type: 'pose_transform' }).keyframes.push(kf(tk, transform(v.t, v.s, v.r, v.color)));
    }
  }
  return pistas;
}

// Gira la cabeza hacia el que habla con el prop headYaw (BBS mira según headYaw - bodyYaw, tope 45°).
// miradasAng: [[tick, ángulo en radianes, positivo = a su izquierda]]. Girar a la izquierda = bajar el yaw.
export function construirCabeza(rep, miradasAng) {
  const props = (rep.props ??= {});
  let p = props.headYaw;
  if (!esDict(p) || !tiene(p, '$anim')) p = props.headYaw = { $anim: { v: D(0.0), track: { keyframes: [], type: 'double' } } };
  const tr = (p.$anim.track ??= { keyframes: [], type: 'double' });
  if (!miradasAng.length) return 0;
  const desde = miradasAng[0][0];
  const kfs = (tr.keyframes || []).filter((k) => num(k.tick) < desde);
  let actual = null, n = 0;
  for (const [tk, ang] of miradasAng) {
    const cuerpo = posicion(rep, tk)[2];
    const ahora = actual === null ? valorProp(rep, 'headYaw', tk, cuerpo) : actual;
    let nuevo = cuerpo - degrees(recortar(ang * CABEZA_FACTOR, -CABEZA_MAX, CABEZA_MAX));
    nuevo = ahora + (pyMod(nuevo - ahora + 180, 360) - 180);
    if (actual !== null && Math.abs(nuevo - actual) < 3) continue;
    kfs.push({ interp: 'sine_inout', tick: F(Number(tk)), value: D(Number(ahora)) });
    kfs.push({ interp: 'sine_inout', tick: F(Number(tk + CABEZA_TRANS)), value: D(Number(nuevo)) });
    actual = nuevo; n++;
  }
  kfs.sort((a, b) => num(a.tick) - num(b.tick));
  tr.keyframes = kfs;
  return n;
}

// ---------------------------------------------------------------- todo junto
// Devuelve [film nuevo, resumen por actor].
// plan = {tramos: [{clip, archivo, a, z, actor}], extras: [{archivo, tick}], actores: {i: {boca, parpadeo, mirada, cabeza}},
//         semilla, parpadeo_min, parpadeo_max, cierre_db}
// ctx = {bocas, archivoDe(audio), audio(archivo) -> {sr, d}, cues(archivo) -> formas de Rhubarb o null (= boca simple),
//        posesOjos(modelo)}
export function aplicar(film, plan, ctx) {
  const nuevo = clonar(film);
  const reps = nuevo.replays || [];
  const clips = new Map(clipsAudio(film, ctx.archivoDe || (() => null)).map((c) => [String(c.i), c]));
  (plan.extras || []).forEach((e, j) => {
    const { sr, d } = ctx.audio(e.archivo);
    clips.set(`x${j}`, { i: `x${j}`, audio: e.archivo, archivo: e.archivo, tick: Number(e.tick ?? 0), offset: 0.0, dur: d.length / sr * TICKS, activo: true });
  });
  const tramos = [];
  for (const t of plan.tramos || []) {
    if (t.actor === null || t.actor === undefined || Math.trunc(t.actor) < 0) continue;
    const base = clips.get(String(t.clip));
    if (!base) continue;
    const clip = { ...base };
    if (t.archivo) clip.archivo = t.archivo;
    if (!clip.archivo) throw new Error(`No encuentro el audio ${clip.audio}: elegilo con "Buscar archivo".`);
    tramos.push([Math.trunc(t.actor), clip, Number(t.a), Number(t.z)]);
  }
  const fin = Math.max(ultimoTick(film), ...tramos.map(([, c, , z]) => tickFilm(c, z)), 0.0);
  const habla = tramos.map(([act, c, a, z]) => [tickFilm(c, a), tickFilm(c, z), act])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const rnd = new Azar(Math.trunc(Number(plan.semilla ?? 1)));
  const actores = plan.actores || {};
  const resumen = {};
  reps.forEach((rep, i) => {
    const op = actores[String(i)] || {};
    const res = { nombre: nombreActor(rep, i) };
    const an = (rep.animation ??= {});
    if (op.boca) {
      const pb = parteBoca(rep, ctx.bocas);
      const mios = tramos.filter(([act]) => act === i).map(([, c, a, z]) => [c, a, z]);
      if (pb && mios.length) {
        const caida = Number(plan.cierre_db ?? 12.0);
        const todos = [];
        let simple = false;
        for (const [c, a, z] of mios) {
          const cues = ctx.cues(c.archivo);
          const audio = ctx.audio(c.archivo);
          if (!cues) { simple = true; todos.push([c, a, z, bocaSimple(audio, a, z)]); continue; }
          todos.push([c, a, z, caida > 0 ? cerrarPorVolumen(audio, cues, a, z, caida) : cues]);
        }
        const [pistas, total] = bocaVarios(pb, todos);
        for (const k of Object.keys(an)) if (k.startsWith(`${pb.idx}/pose/`)) delete an[k];
        Object.assign(an, pistas);
        res.boca = total;
        if (simple) res.boca_simple = true;
      } else if (!pb) res.aviso_boca = 'no tiene una boca conocida (boca_Man / boca_Woman)';
    }
    const po = parteOjos(rep);
    const miradas = [], miradasAng = [];
    if ((op.mirada || op.cabeza) && habla.length) {
      let actual = null;
      for (const [a, , act] of habla) {
        if (act === i || act === actual) continue;
        const ang = anguloHacia(rep, reps[act], a);
        const tk = pyRound(a + 2);
        miradas.push([tk, nivelMirada(ang)]); miradasAng.push([tk, ang]); actual = act;
      }
    }
    let parp = [];
    if (op.parpadeo && po) {
      parp = parpadeosAuto(0, fin, ticksDePose(rep), rnd, Number(plan.parpadeo_min ?? 1.2), Number(plan.parpadeo_max ?? 3.5));
      // un parpadeo cuando cambia la mirada, si no hay uno cerca
      for (const [tk] of miradas) if (!parp.some(([a]) => Math.abs(a - tk) <= 6)) parp.push([tk, tk + 3]);
      parp.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      parp = parp.filter((p, k) => k === 0 || p[0] > parp[k - 1][1] + 2);
    }
    if (po && (op.parpadeo || op.mirada)) {
      const pistas = construirOjos(po, parp, op.mirada ? miradas : [], ctx.posesOjos ? ctx.posesOjos(po.modelo) : {});
      for (const b of HUESOS_OJOS) delete an[`${po.idx}/pose/${b}`];
      Object.assign(an, pistas);
      res.parpadeos = op.parpadeo ? parp.length : 0;
      res.miradas = op.mirada ? miradas.length : 0;
    } else if ((op.parpadeo || op.mirada) && !po) res.aviso_ojos = 'no tiene ojos (player/eyes o eyes_1px)';
    if (op.cabeza) res.giros_cabeza = construirCabeza(rep, miradasAng);
    resumen[i] = res;
  });
  return [nuevo, resumen];
}
