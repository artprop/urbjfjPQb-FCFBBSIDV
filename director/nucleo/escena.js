// Guion de escena (port de escena.py del Director de la PC): un texto simple que anima un film de BBS que ya
// tiene a los actores ubicados en el set.
//
//   Vegetta camina hasta FranSauce
//   + FranSauce mira a Vegetta        ("+" = al mismo tiempo que la línea anterior)
//   espera 1s
//   @ 10s                             (salta el reloj a 10 segundos)
//   #7 desaparece                     (#7 o 7 = el actor número 7 de la lista)
//
// Los modelos player de BBS mueven piernas y brazos solos cuando el actor se desplaza ("procedural"), y la cabeza
// sigue headYaw (tope 45°). Por eso acá solo se escriben posición (x, y, z) y giros (yaw, bodyYaw, headYaw).
// Si hay mapa del mundo (mundo.js), al caminar buscan un camino y siguen el piso (escaleras, paredes, esquinas).
// Coordenadas del mundo = props + relative_coordinates del film (verificado con los films del usuario).
// Minecraft: yaw 0 = mirando hacia +Z, yaw 90 = hacia -X.
import { B, D, F, I, num, clonar } from '../../mocap/nucleo/bbsdat.js';
import * as capas from './capas.js';
import { pyRound, pyMod, radians, degrees, hypot, interp, arange } from './py.js';

const TICKS = capas.TICKS;
export const VELOCIDAD = { camina: 4.317 / TICKS, corre: 5.612 / TICKS };   // bloques por tick (los de Minecraft)
export const GIRO = 4;                    // ticks que tarda en girar antes de caminar
export const DISTANCIA_A_ACTOR = 1.0;     // se frena a esta distancia de otro actor (a una marca llega justo)
export const LIMITE_CABEZA = 45;          // grados que gira la cabeza sin el cuerpo
export const POSE_ANTES = 8, POSE_DESPUES = 8, POSE_SOSTENER = 30;
export const SALTO_ALTO = 1.25, SALTO_TICKS = 12;
export const SALTO_AGACHE = 2;            // ticks agachado al despegar y al caer (sneaking), dentro del salto
export const QUIETO = 3 * TICKS;          // "X queda quieto": cuánto dura si no se dice
export const ENTRA_DISTANCIA = 8;         // "X entra": desde cuántos bloques atrás llega
// Cámaras automáticas (clips bbs:movement de BBS 2.2, en coordenadas del film como los actores)
export const TOMAS = {
  general: { fov: 50, nombre: 'plano general' },
  cerca: { fov: 50, nombre: 'primer plano' },
  abajo: { fov: 60, nombre: 'desde abajo' },
  giro: { fov: 55, nombre: 'giro alrededor' },
  sigue: { fov: 55, nombre: 'seguimiento' },
};
const CAMARA_MIN = 20, CAMARA_PASO = 5, OJOS = 1.55;

export class ErrorGuion extends Error {
  constructor(linea, msg) { super(`Línea ${linea}: ${msg}`); this.linea = linea; this.msg = msg; }
}

export const sinTildes = (s) => String(s).toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
const tiene = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const esDict = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !('code' in v && 'v' in v);

// ---------------------------------------------------------------- actores
export function nombreCorto(rep, i) {
  const form = rep.form || {};
  return String(form.name || rep.label || rep.name_tag || '').trim() || `#${i + 1}`;
}

// Actores que sirven de marca (sin modelo de persona): se llega justo encima, no a un bloque
export function esMarca(rep) {
  const form = rep.form || {};
  const id = String(form.id ?? '');
  return id === 'bbs:anchor' || id === '' || (!form.model && id !== 'bbs:mob');
}

export function buscarActor(film, txt, linea) {
  const reps = film.replays || [];
  const t = txt.trim();
  const cands = [];
  reps.forEach((r, k) => { if (sinTildes(nombreCorto(r, k)) === sinTildes(t)) cands.push(k); });
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) throw new ErrorGuion(linea, `hay ${cands.length} actores "${t}": usá el número, ` + cands.map((k) => String(k + 1)).join(', ') + '.');
  const m = t.match(/^#?(\d+)$/);
  if (m) {
    const k = parseInt(m[1], 10) - 1;
    if (k >= 0 && k < reps.length) return k;
    throw new ErrorGuion(linea, `no hay un actor ${m[1]} (hay ${reps.length}).`);
  }
  throw new ErrorGuion(linea, `no encuentro el actor "${t}". Usá el nombre de la lista o su número.`);
}

// Grupos de poses de un modelo: el suyo y, si es *_bends, el de player/steve (pose_group)
export function gruposDePoses(rep) {
  const modelo = String((rep.form || {}).model || '');
  const g = [modelo];
  if (modelo.endsWith('_bends')) g.push(modelo.slice(0, -'_bends'.length));
  return g;
}

// Poses del modelo del actor: primero las que trae BBS y encima las del usuario. {nombre: {hueso: transform}}
// leer(grupo) -> [poses.json de BBS o null, poses.json del usuario o null] (ya cargados)
export function posesDisponibles(rep, leer) {
  const grupos = gruposDePoses(rep);
  const out = {};
  for (const fuente of [0, 1]) {
    for (const g of grupos) {
      const datos = (leer(g) || [])[fuente];
      if (!datos) continue;
      for (const [k, v] of Object.entries(datos)) out[k] = esDict(v) && tiene(v, 'pose') ? v.pose : v;
    }
  }
  return out;
}

// ---------------------------------------------------------------- pistas de props
function pista(rep, clave) {
  const props = (rep.props ??= {});
  let p = props[clave];
  if (!esDict(p) || !tiene(p, '$anim')) { p = { $anim: { v: D(0.0), track: { keyframes: [], type: 'double' } } }; props[clave] = p; }
  const tr = (p.$anim.track ??= { keyframes: [], type: 'double' });
  tr.keyframes ??= [];
  return tr;
}
const ordenarKf = (kf) => kf.sort((a, b) => num(a.tick) - num(b.tick));

// Reemplaza la pista desde el tick 'desde' en adelante por 'puntos' [[tick, valor, interp]]
function ponerProps(rep, clave, puntos, desde) {
  const tr = pista(rep, clave);
  const kf = tr.keyframes.filter((k) => num(k.tick) < desde - 1e-6);
  for (const [t, v, it] of puntos) kf.push({ interp: it, tick: F(pyRound(Number(t), 3)), value: D(Number(v)) });
  tr.keyframes = ordenarKf(kf);
}

// ---------------------------------------------------------------- lectura del guion
const VERBOS = new Map(Object.entries({
  camina: 'camina', caminar: 'camina', anda: 'camina', va: 'camina',
  corre: 'corre', correr: 'corre',
  mira: 'mira', mirar: 'mira',
  gira: 'gira', girar: 'gira', se: null,
  aparece: 'aparece', desaparece: 'desaparece',
  pose: 'pose', hace: 'pose',
  senala: 'senala', apunta: 'senala',
  salta: 'salta', saltar: 'salta',
  quieto: 'quieto', queda: 'quieto', respira: 'quieto',
  entra: 'entra', entrar: 'entra',
}));

// "cámara primer plano de X": cada palabra clave -> la toma
const PALABRAS_TOMA = [
  [/^(plano\s+)?general|^lejos|^de\s+lejos|^abierta/, 'general'],
  [/^(primer\s*plano|cerca|de\s+cerca|primerisimo)/, 'cerca'],
  [/^(desde\s+abajo|abajo|contrapicad[ao])/, 'abajo'],
  [/^(giro|gira|orbita|vuelta|da\s+vuelta|alrededor)/, 'giro'],
  [/^(sigue|seguimiento|acompana|siguiendo)/, 'sigue'],
];

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const UNIDAD = 's|seg|segundos?|t|ticks?';

function duracion(txt, linea) {
  const m = txt.trim().match(new RegExp(`^(${NUM})\\s*(${UNIDAD})?$`));
  if (!m) throw new ErrorGuion(linea, `no entiendo el tiempo "${txt}" (ejemplos: 2s, 1.5s, 30t).`);
  const v = parseFloat(m[1].replace(',', '.'));
  return (m[2] || 's').startsWith('t') ? v : v * TICKS;
}

const strip = (s) => s.replace(/^\s+|\s+$/g, '');

// "cámara <toma> [de|a|sobre <actor>] [duración]". Sin actor: encuadra a todos los actores con modelo.
// orig: el texto original (con mayúsculas) después de "cámara"; sl: lo mismo sin tildes.
function leerCamara(orig, sl, n, film, paralelo) {
  const o = { linea: n, tipo: 'camara', paralelo, foco: null };
  let txt = strip(orig);
  const dur = (' ' + txt).match(new RegExp(`\\s(${NUM}\\s*(?:${UNIDAD}))$`));
  if (dur) { o.dur = duracion(dur[1], n); txt = strip(txt.slice(0, Math.max(0, dur.index - 1))); }
  const tl = sinTildes(txt);
  const ayuda = 'tomas: "cámara general", "cámara primer plano de X", "cámara desde abajo a X", "cámara giro alrededor de X", "cámara sigue a X".';
  const p = PALABRAS_TOMA.find(([re]) => re.test(tl));
  if (!p) throw new ErrorGuion(n, `no entiendo la toma "${txt}". ${ayuda}`);
  o.toma = p[1];
  const largo = tl.match(p[0])[0].length;
  let resto = strip(txt.slice(largo));
  resto = resto.replace(/^(alrededor\s+)?(de\s+la|del|de|a\s+la|al|a|sobre|hacia|en)\s+/i, '');
  if (resto) o.foco = buscarActor(film, resto, n);
  else if (o.toma !== 'general') throw new ErrorGuion(n, `falta a quién: por ejemplo "cámara ${TOMAS[o.toma].nombre} de FranSauce".`);
  return o;
}

// Texto -> lista de órdenes {linea, paralelo, actor, tipo, ...}. Tira ErrorGuion con el número de línea.
export function leer(texto, film) {
  const ordenes = [];
  const lineas = texto.split(/\r\n|\r|\n/);
  if (lineas.length && lineas[lineas.length - 1] === '' && /[\r\n]$/.test(texto)) lineas.pop();
  lineas.forEach((crudo, k) => {
    const n = k + 1;
    let s = strip(crudo.split('//')[0]);
    if (!s || s.startsWith(';')) return;
    const paralelo = s.startsWith('+');
    if (paralelo) s = strip(s.slice(1));
    const sl = sinTildes(s);
    let m = s.match(/^@\s*(.+)$/);
    if (m) { ordenes.push({ linea: n, tipo: 'reloj', tick: duracion(m[1], n), paralelo: false }); return; }
    m = sl.match(/^espera\s+(.+)$/);
    if (m) { ordenes.push({ linea: n, tipo: 'espera', dur: duracion(m[1], n), paralelo }); return; }
    m = sl.match(/^camara\b\s*(.*)$/);
    if (m) { ordenes.push(leerCamara(s.slice(s.length - m[1].length), m[1], n, film, paralelo)); return; }
    // "<actor> <verbo> ...": el actor puede tener espacios, se busca el primer verbo conocido
    const palabras = s.split(/\s+/).filter(Boolean);
    let kv = null;
    for (let j = 1; j < palabras.length; j++) if (VERBOS.has(sinTildes(palabras[j]))) { kv = j; break; }
    if (kv === null) throw new ErrorGuion(n, 'no encuentro qué hace el actor. Verbos: camina, corre, salta, mira, gira, aparece, desaparece, pose, señala, queda quieto, entra, espera, cámara.');
    const actor = buscarActor(film, palabras.slice(0, kv).join(' '), n);
    let verbo = sinTildes(palabras[kv]);
    let resto = palabras.slice(kv + 1);
    if (verbo === 'se') {                                 // "se da vuelta hacia X" / "se gira hacia X"
      verbo = 'gira';
      while (resto.length && ['da', 'vuelta', 'gira'].includes(sinTildes(resto[0]))) resto = resto.slice(1);
    }
    const tipo = VERBOS.get(verbo);
    const o = { linea: n, actor, tipo, paralelo };
    if (verbo === 'queda' && resto.length && sinTildes(resto[0]) === 'quieto') resto = resto.slice(1);
    let restoTxt = resto.join(' ');
    const conEsp = ' ' + restoTxt;
    const dur = conEsp.match(new RegExp(`\\s(${NUM}\\s*(?:${UNIDAD}))$`));
    if (dur && ['pose', 'senala', 'mira', 'aparece', 'desaparece', 'quieto', 'entra'].includes(tipo)) {
      o.dur = duracion(dur[1], n); restoTxt = strip(restoTxt.slice(0, dur.index));
    }
    const rl = sinTildes(restoTxt);
    const PREP = /^(hasta|hacia|a|al|a la|para)\s+/;
    if (tipo === 'camina' || tipo === 'corre') {
      m = rl.match(new RegExp(`^(${NUM})\\s*(?:bloques?)?\\s*(adelante|atras|para atras)$`));
      if (m) o.adelante = parseFloat(m[1].replace(',', '.')) * (m[2].includes('atras') ? -1 : 1);
      else {
        const rl2 = rl.replace(PREP, ''), rt = restoTxt.replace(new RegExp(PREP.source, 'i'), '');
        m = rl2.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
        if (m) o.coords = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
        else if (rt) o.hacia = buscarActor(film, rt, n);
        else throw new ErrorGuion(n, 'falta a dónde: "hasta <actor>", "hasta X Y Z" o "3 bloques adelante".');
      }
    } else if (tipo === 'mira' || tipo === 'gira' || tipo === 'senala') {
      const rt = strip(restoTxt.replace(/^(a|al|a la|hacia|para)\s+/i, ''));
      if (!rt) throw new ErrorGuion(n, 'falta a quién: por ejemplo "mira a FranSauce".');
      o.hacia = buscarActor(film, rt, n);
    } else if (tipo === 'aparece' || tipo === 'desaparece') {
      if (rl.startsWith('titil') || rl.startsWith('parpade')) { o.titila = tiene(o, 'dur') ? o.dur : TICKS; delete o.dur; }
      else if (rl) throw new ErrorGuion(n, `no entiendo "${restoTxt}". Se puede: "desaparece" o "desaparece titilando 2s".`);
    } else if (tipo === 'salta') {
      m = rl.match(new RegExp(`^(${NUM})\\s*(?:bloques?)?\\s*adelante$`));
      if (m) o.adelante = parseFloat(m[1].replace(',', '.'));
      else if (rl) throw new ErrorGuion(n, 'se puede "salta" (en el lugar) o "salta 2 bloques adelante".');
    } else if (tipo === 'quieto') {
      if (rl) throw new ErrorGuion(n, 'se puede "X queda quieto 3s" (o "X respira 3s"): respira y mueve un poco la cabeza.');
    } else if (tipo === 'entra') {
      m = rl.match(new RegExp(`^(?:desde\\s+)?(${NUM})\\s*(?:bloques?)?$`));
      if (m) o.distancia = parseFloat(m[1].replace(',', '.'));
      else if (rl) throw new ErrorGuion(n, 'se puede "X entra" o "X entra desde 10 bloques": llega frenando hasta donde está parado.');
    } else if (tipo === 'pose') {
      const nombre = strip(restoTxt);
      if (!nombre) throw new ErrorGuion(n, 'falta el nombre de la pose.');
      o.pose = nombre;
    }
    ordenes.push(o);
  });
  return ordenes;
}

// ---------------------------------------------------------------- estado y armado
// Posición y giro de cada actor en cualquier tick: antes de que el guion lo mueva, lo del film; después, los
// puntos que va agregando el guion (así "mira a X" apunta a donde está X en ese momento).
class Estado {
  constructor(film) { this.film = film; this.pts = new Map(); }
  delFilm(i, tick) {
    const rep = this.film.replays[i];
    const y = capas.valorProp(rep, 'yaw', tick);
    const by = capas.valorProp(rep, 'bodyYaw', tick, y), hy = capas.valorProp(rep, 'headYaw', tick, y);
    return { x: capas.valorProp(rep, 'x', tick), y: capas.valorProp(rep, 'y', tick), z: capas.valorProp(rep, 'z', tick), yaw: by, head: hy };
  }
  en(i, tick) {
    const pts = this.pts.get(i);
    if (!pts || tick < pts[0][0]) return this.delFilm(i, tick);
    for (let k = 0; k + 1 < pts.length; k++) {
      const [t0, e0] = pts[k], [t1, e1] = pts[k + 1];
      if (t0 <= tick && tick <= t1) {
        const f = t1 > t0 ? (tick - t0) / (t1 - t0) : 1.0;
        const out = {};
        for (const c of Object.keys(e0)) out[c] = e0[c] + (e1[c] - e0[c]) * f;
        return out;
      }
    }
    return { ...pts[pts.length - 1][1] };
  }
  agregar(i, tick, e, it = 'linear') {
    if (!this.pts.has(i)) this.pts.set(i, []);
    const l = this.pts.get(i);
    l.push([tick, { ...e }, it]);
    l.sort((a, b) => a[0] - b[0]);
  }
}

export const yawHacia = (dx, dz) => degrees(Math.atan2(-dx, dz));
// El ángulo equivalente a 'objetivo' más cercano a 'actual' (los yaw del film no se envuelven: 559 = 199)
export const cercano = (actual, objetivo) => actual + (pyMod(objetivo - actual + 180, 360) - 180);

// Recorrido de una caminata en coordenadas del film: [[distancia, x, z, y, esEsquina]], solo con los puntos que hacen
// falta (esquinas y cambios de altura). null si ya está ahí.
// Con mapa (mundo.Mundo): busca un camino caminando por el mundo (escaleras, rodeando paredes) y sigue el piso.
// Sin mapa: línea recta y la altura cambia de a poco hasta la del destino.
function rutaCaminata(mapa, rel, e, dest, destY, parar, o, rep, i, avisos) {
  const rx = num(rel.x ?? 0), ry = num(rel.y ?? 0), rz = num(rel.z ?? 0);
  let muestras, esq = [];
  if (mapa && (tiene(o, 'adelante') ? o.adelante : 1) > 0) {          // para atrás va en línea recta
    let pts = mapa.camino(e.x + rx, e.y + ry, e.z + rz, dest[0] + rx, destY + ry, dest[1] + rz);
    if (pts === null) {
      // no hay camino: avanza en línea recta hasta donde pueda (se frena en la pared)
      const x0 = e.x + rx, z0 = e.z + rz, x1 = dest[0] + rx, z1 = dest[1] + rz;
      let g = e.y + ry, hasta = [x0, z0, g];
      const largo = hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(largo / 0.25));
      for (let k = 1; k <= n; k++) {
        const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
        const g2 = mapa.apoyo(Math.floor(x), Math.floor(z), g);
        if (g2 === null) break;
        g = g2; hasta = [x, z, g];
      }
      avisos.push(`Línea ${o.linea}: no hay un camino caminando para ${nombreCorto(rep, i)} hasta ahí `
        + '(pared, pozo o fuera del mapa): avanza en línea recta y se frena donde no puede seguir.');
      if (hypot(hasta[0] - x0, hasta[1] - z0) < 0.05) return null;
      pts = [[x0, z0, e.y + ry], hasta];
      parar = 0.0;
    }
    muestras = mapa.perfil(pts).map(([d, x, z, y]) => [d, x - rx, z - rz, y - ry]);
    let acum = 0.0;
    for (let k = 0; k + 1 < pts.length; k++) { acum += hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); esq.push(acum); }
    esq = esq.slice(0, -1);
  } else {
    const largo = hypot(dest[0] - e.x, dest[1] - e.z);
    muestras = [[0.0, e.x, e.z, e.y], [largo, dest[0], dest[1], destY]];
  }
  const total = muestras[muestras.length - 1][0] - parar;
  if (total < 0.05) return null;
  // recortar el final (se frena antes de llegar a otro actor)
  const out = [];
  for (const m of muestras) {
    if (m[0] <= total + 1e-9) out.push(m);
    else {
      const a = out[out.length - 1], f = (total - a[0]) / Math.max(1e-9, m[0] - a[0]);
      out.push([total, a[1] + (m[1] - a[1]) * f, a[2] + (m[2] - a[2]) * f, a[3]]);
      break;
    }
  }
  if (muestras.length === 2 && parar) { const u = out[out.length - 1]; out[out.length - 1] = [u[0], u[1], u[2], destY]; }   // sin mapa: termina a la altura del destino
  // solo los puntos necesarios: esquinas y donde cambia la altura
  const ruta = [[out[0][0], out[0][1], out[0][2], out[0][3], false]];
  for (let k = 1; k < out.length - 1; k++) {
    const [d, x, z, y] = out[k];
    const esEsq = esq.some((q) => Math.abs(d - q) < 0.13);
    const cambia = Math.abs(y - out[k - 1][3]) > 1e-6 || Math.abs(y - out[k + 1][3]) > 1e-6;
    if (esEsq || cambia) ruta.push([d, x, z, y, esEsq]);
  }
  const u = out[out.length - 1];
  ruta.push([u[0], u[1], u[2], u[3], false]);
  return ruta;
}

// Devuelve [film nuevo, acciones con sus ticks (para mostrar), avisos]. poses(rep) -> {nombre: pose}
// mapa: mundo.Mundo del mundo del film (si está, al caminar se sigue el piso de verdad)
export function armar(film, texto, poses = () => ({}), mapa = null) {
  const ordenes = leer(texto, film);
  const nuevo = clonar(film);
  const reps = nuevo.replays;
  const rel = nuevo.relative_coordinates || {};
  const est = new Estado(film);
  let reloj = 0.0, ultimoIni = 0.0;
  const acciones = [], avisos = [], saltos = [], camaras = [];

  for (const o of ordenes) {
    const ini = o.paralelo ? ultimoIni : reloj;
    const t = o.tipo;
    if (t === 'reloj') { reloj = ultimoIni = o.tick; continue; }
    if (t === 'espera') { reloj = ini + o.dur; ultimoIni = ini; continue; }
    if (t === 'camara') {          // no corre el reloj: la toma dura hasta la próxima cámara (o hasta el final)
      camaras.push({ ...o, desde: ini });
      ultimoIni = ini;
      continue;
    }
    const i = o.actor, rep = reps[i];
    const e = est.en(i, ini);
    let fin = ini;
    if (t === 'camina' || t === 'corre') {
      let dest, parar, destY;
      if (tiene(o, 'adelante')) {
        const a = radians(e.yaw);
        dest = [e.x - Math.sin(a) * o.adelante, e.z + Math.cos(a) * o.adelante]; parar = 0.0; destY = e.y;
      } else if (tiene(o, 'coords')) {
        const [cx, cy, cz] = o.coords;
        dest = [cx - num(rel.x ?? 0), cz - num(rel.z ?? 0)]; parar = 0.0; destY = cy - num(rel.y ?? 0);
      } else {
        const ob = est.en(o.hacia, ini); dest = [ob.x, ob.z]; destY = ob.y;
        parar = esMarca(film.replays[o.hacia]) ? 0.0 : DISTANCIA_A_ACTOR;
      }
      const ruta = rutaCaminata(mapa, rel, e, dest, destY, parar, o, rep, i, avisos);
      if (ruta === null) avisos.push(`Línea ${o.linea}: ${nombreCorto(rep, i)} ya está ahí, no camina.`);
      else {
        const atras = tiene(o, 'adelante') && o.adelante < 0;          // para atrás: no se da vuelta
        const rumbo = (k) => (atras ? e.yaw : yawHacia(ruta[k + 1][1] - ruta[k][1], ruta[k + 1][2] - ruta[k][2]));
        const hacia = cercano(e.yaw, rumbo(0));
        est.agregar(i, ini, e, 'sine_inout');
        const giro = Math.abs(hacia - e.yaw) > 2 ? GIRO : 0;
        const t0 = ini + giro, vel = VELOCIDAD[t];
        let actual = hacia;
        est.agregar(i, t0, { ...e, yaw: hacia, head: hacia }, 'linear');
        for (let k = 1; k < ruta.length; k++) {
          const [d, x, z, y, esquina] = ruta[k];
          if (esquina && k + 1 < ruta.length) {
            const nuevoRumbo = cercano(actual, rumbo(k));
            // dobla en la esquina: medio bloque antes todavía mira para donde venía
            const d0 = Math.max(ruta[k - 1][0], d - 0.4);
            const f = (d0 - ruta[k - 1][0]) / Math.max(1e-9, d - ruta[k - 1][0]);
            const [px, pz, py] = [1, 2, 3].map((j) => ruta[k - 1][j] + (ruta[k][j] - ruta[k - 1][j]) * f);
            if (d0 > ruta[k - 1][0] + 1e-6) est.agregar(i, t0 + d0 / vel, { ...e, x: px, z: pz, y: py, yaw: actual, head: actual }, 'linear');
            actual = nuevoRumbo;
          }
          const ultimo = k === ruta.length - 1;
          est.agregar(i, t0 + d / vel, { ...e, x, z, y, yaw: actual, head: actual }, ultimo ? 'sine_inout' : 'linear');
        }
        fin = t0 + ruta[ruta.length - 1][0] / vel;
        if (t === 'corre') ponerCorriendo(reps[i], t0, fin);
      }
    } else if (t === 'mira' || t === 'gira' || t === 'senala') {
      const ob = est.en(o.hacia, ini);
      const obj = yawHacia(ob.x - e.x, ob.z - e.z);
      const cabeza = cercano(e.head, obj);
      let cuerpo = e.yaw;
      if (t === 'gira' || t === 'senala' || Math.abs(pyMod(obj - e.yaw + 180, 360) - 180) > LIMITE_CABEZA) cuerpo = cercano(e.yaw, obj);
      est.agregar(i, ini, e, 'sine_inout');
      est.agregar(i, ini + GIRO, { ...e, yaw: cuerpo, head: cabeza }, 'sine_inout');
      fin = ini + GIRO;
      if (t === 'senala') {
        const sost = tiene(o, 'dur') ? o.dur : POSE_SOSTENER;
        fin = ponerPose(reps[i], { right_arm: { r: [1.45, 0.0, 0.0] } }, ini + GIRO, sost);   // brazo derecho adelante
      }
    } else if (t === 'aparece' || t === 'desaparece') {
      if (o.titila) {
        // titila cada 2 ticks y termina en el estado pedido
        fin = ini + o.titila;
        let k = 0, tk = ini;
        while (tk < fin - 1e-6) {
          ponerVisible(reps[i], tk, t === 'desaparece' ? k % 2 === 1 : k % 2 === 0);
          tk += 2; k++;
        }
        ponerVisible(reps[i], fin, t === 'aparece');
      } else { ponerVisible(reps[i], ini, t === 'aparece'); fin = ini; }
    } else if (t === 'salta') {
      fin = ini + SALTO_TICKS;
      saltos.push([i, ini]);
      if (o.adelante) {
        const a = radians(e.yaw);
        const e2 = { ...e, x: e.x - Math.sin(a) * o.adelante, z: e.z + Math.cos(a) * o.adelante };
        est.agregar(i, ini, e, 'linear'); est.agregar(i, fin, e2, 'sine_inout');
      }
    } else if (t === 'quieto') {
      // respira y mueve un poco la cabeza (tomado de la receta "idle" del mod BBS con IA, más visible)
      const largo = tiene(o, 'dur') ? o.dur : QUIETO;
      fin = ini + largo;
      est.agregar(i, ini, e, 'sine_inout');
      const giros = [0, 6, 0, -5, 0], cabeceo = [0, -3, 0, 2, 0];
      const ciclo = 3 * TICKS, puntosPitch = [];
      const p0 = capas.valorProp(rep, 'pitch', ini);
      for (let tk = 0, k = 0; tk <= largo + 1e-6; tk += ciclo / 4, k++) {
        const f = k % 4;
        if (tk > 0) est.agregar(i, ini + tk, { ...e, head: e.head + giros[f] }, 'sine_inout');
        puntosPitch.push([ini + tk, p0 + cabeceo[f]]);
      }
      if (Math.abs(est.en(i, fin).head - e.head) > 1e-6) est.agregar(i, fin, e, 'sine_inout');
      puntosPitch.push([fin, p0]);
      ponerTramo(rep, 'pitch', puntosPitch, 'sine_inout');
    } else if (t === 'entra') {
      // entrada dramática (receta del mod BBS con IA): arranca N bloques atrás y llega frenando a donde está
      const dist = tiene(o, 'distancia') ? o.distancia : ENTRA_DISTANCIA;
      const largo = tiene(o, 'dur') ? o.dur : Math.max(2 * TICKS, Math.round(dist * 7.5));
      const a = radians(e.yaw), ax = -Math.sin(a), az = Math.cos(a);
      const pasos = [[0, -1, 15], [1 / 3, -0.5, 10], [2 / 3, -0.1, 5], [5 / 6, -0.02, 2], [11 / 12, 0, 0], [1, 0, 0]];
      for (const [f, d, giro] of pasos) {
        est.agregar(i, ini + largo * f, { ...e, x: e.x + ax * d * dist, z: e.z + az * d * dist, yaw: e.yaw + giro, head: e.yaw + giro }, f === 1 ? 'linear' : 'cubic_out');
      }
      fin = ini + largo;
    } else if (t === 'pose') {
      const todas = poses(rep) || {};
      const clave = Object.keys(todas).find((k) => sinTildes(k) === sinTildes(o.pose));
      if (clave === undefined) {
        const parecidas = Object.keys(todas).filter((k) => sinTildes(k).includes(sinTildes(o.pose).slice(0, 4))).slice(0, 6);
        throw new ErrorGuion(o.linea, `no encuentro la pose "${o.pose}"` + (parecidas.length ? `. Parecidas: ${parecidas.join(', ')}` : '') + '.');
      }
      fin = ponerPose(reps[i], todas[clave], ini, tiene(o, 'dur') ? o.dur : POSE_SOSTENER);
    }
    acciones.push({ linea: o.linea, actor: i, nombre: nombreCorto(rep, i), tipo: t, desde: pyRound(ini, 2), hasta: pyRound(fin, 2) });
    ultimoIni = ini;
    reloj = o.paralelo ? Math.max(reloj, fin) : fin;
  }

  // escribir el movimiento
  for (const [i, pts] of est.pts) {
    const desde = pts[0][0], rep = reps[i];
    for (const [k, clave] of [['x', 'x'], ['y', 'y'], ['z', 'z'], ['yaw', 'bodyYaw'], ['yaw', 'yaw'], ['head', 'headYaw']]) {
      ponerProps(rep, clave, pts.map(([tt, e, it]) => [tt, e[k], it]), desde);
    }
  }
  // los saltos van después, sobre la altura que quedó en ese momento
  for (const [i, ini] of saltos) ponerSalto(reps[i], ini, est.en(i, ini).y);
  if (camaras.length) armarCamaras(nuevo, camaras, est, acciones, avisos, reloj);
  return [nuevo, acciones, avisos];
}

// Reemplaza solo el tramo [desde, hasta] de una pista de props por 'puntos' [[tick, valor]]
function ponerTramo(rep, clave, puntos, it) {
  const tr = pista(rep, clave);
  const a = puntos[0][0], z = puntos[puntos.length - 1][0];
  const kf = tr.keyframes.filter((k) => !(a - 1e-6 <= num(k.tick) && num(k.tick) <= z + 1e-6));
  for (const [t, v] of puntos) kf.push({ interp: it, tick: F(pyRound(Number(t), 3)), value: D(Number(v)) });
  tr.keyframes = ordenarKf(kf);
}

function ponerCorriendo(rep, a, z) {
  const tr = pista(rep, 'sprinting');
  const kf = tr.keyframes.filter((k) => !(a - 1e-6 <= num(k.tick) && num(k.tick) <= z + 1e-6));
  kf.push({ interp: 'constant', tick: F(pyRound(a, 3)), value: D(1.0) }, { interp: 'constant', tick: F(pyRound(z, 3)), value: D(0.0) });
  tr.keyframes = ordenarKf(kf);
}

// Sube SALTO_ALTO bloques desde y0 y baja en SALTO_TICKS. Los keyframes de 'y' fuera del salto se respetan.
function ponerSalto(rep, ini, y0) {
  const tr = pista(rep, 'y');
  const fin = ini + SALTO_TICKS;
  const kf = tr.keyframes.filter((k) => !(ini - 1e-6 <= num(k.tick) && num(k.tick) <= fin + 1e-6));
  kf.push({ interp: 'sine_out', tick: F(pyRound(ini, 3)), value: D(y0) },
    { interp: 'sine_in', tick: F(pyRound(ini + SALTO_TICKS / 2, 3)), value: D(y0 + SALTO_ALTO) },
    { interp: 'sine_inout', tick: F(pyRound(fin, 3)), value: D(y0) });
  tr.keyframes = ordenarKf(kf);
  // como la receta "jump" del mod BBS con IA: se agacha al despegar y al caer, y en el aire no toca el piso
  const ag = SALTO_AGACHE;
  for (const clave of ['sneaking', 'grounded']) {
    const t = pista(rep, clave);
    const antes = valorEscalon(t, ini - ag, clave === 'grounded' ? 1 : 0);   // después vuelve a como estaba
    const puntos = clave === 'sneaking' ? [[ini - ag, 1], [ini + ag, antes], [fin - ag, 1], [fin + ag, antes]] : [[ini + ag, 0], [fin - ag, antes]];
    const k2 = t.keyframes.filter((k) => !(ini - ag - 1e-6 <= num(k.tick) && num(k.tick) <= fin + ag + 1e-6));
    if (!k2.some((k) => num(k.tick) < ini - ag - 1e-6)) k2.push({ interp: 'constant', tick: F(0.0), value: D(antes) });
    for (const [tk, v] of puntos) k2.push({ interp: 'constant', tick: F(pyRound(Math.max(0, tk), 3)), value: D(v) });
    t.keyframes = ordenarKf(k2);
  }
}

// Valor de una pista de estados (agachado, en el piso...) en ese tick: el último keyframe anterior
function valorEscalon(tr, tick, defecto) {
  const previos = tr.keyframes.filter((k) => num(k.tick) <= tick + 1e-6);
  return previos.length ? num(previos[previos.length - 1].value) : defecto;
}

// ---------------------------------------------------------------- cámaras
// Cada toma es un clip bbs:movement (como los que hace BBS 2.2) con keyframes cada CAMARA_PASO ticks que apuntan
// al actor donde está en ese momento (así no se escapa de cuadro si camina).
const pitchHacia = (dy, horiz) => -degrees(Math.atan2(dy, Math.max(1e-6, horiz)));

function centro(est, ids, t) {
  const ps = ids.map((i) => est.en(i, t));
  const c = { x: 0, y: 0, z: 0 };
  for (const p of ps) { c.x += p.x / ps.length; c.y += p.y / ps.length; c.z += p.z / ps.length; }
  c.radio = Math.max(0, ...ps.map((p) => hypot(p.x - c.x, p.z - c.z)));
  c.yaw = ps[0].yaw;
  return c;
}

// [ [tick relativo, x, y, z, yaw, pitch] ] de una toma
function puntosToma(c, est, ids) {
  const out = [];
  const largo = c.hasta - c.desde;
  const ini = centro(est, ids, c.desde);
  const frente = radians(ini.yaw);                         // hacia dónde mira el actor al empezar la toma
  const dir = (ang) => [-Math.sin(frente + radians(ang)), Math.cos(frente + radians(ang))];
  for (let tr = 0; ; tr = Math.min(largo, tr + CAMARA_PASO)) {
    const f = largo > 0 ? tr / largo : 1;
    const p = centro(est, ids, c.desde + tr);
    let cx, cy, cz, mira = p.y + OJOS;
    if (c.toma === 'general') {
      const dist = Math.max(8, ini.radio * 2 + 5) * (1 - 0.15 * f);    // se acerca despacio
      const [dx, dz] = dir(35);
      cx = ini.x + dx * dist; cz = ini.z + dz * dist; cy = ini.y + 4 - f; mira = p.y + 1;
    } else if (c.toma === 'cerca') {
      const dist = 1.8 - 0.3 * f;
      const [dx, dz] = dir(10);
      cx = ini.x + dx * dist; cz = ini.z + dz * dist; cy = ini.y + OJOS + 0.1;
    } else if (c.toma === 'abajo') {
      const dist = 2.6 - 0.4 * f;
      const [dx, dz] = dir(25);
      cx = ini.x + dx * dist; cz = ini.z + dz * dist; cy = ini.y + 0.3; mira = p.y + 1.4;
    } else if (c.toma === 'giro') {
      const [dx, dz] = dir(360 * f);
      cx = p.x + dx * 4; cz = p.z + dz * 4; cy = p.y + 1.8; mira = p.y + 1.2;
    } else {                                              // sigue: al costado del actor, a la par
      const a = radians(p.yaw + 70);
      cx = p.x - Math.sin(a) * 3.5; cz = p.z + Math.cos(a) * 3.5; cy = p.y + 1.6; mira = p.y + 1.2;
    }
    const yaw = yawHacia(p.x - cx, p.z - cz), pitch = pitchHacia(mira - cy, hypot(p.x - cx, p.z - cz));
    out.push([tr, cx, cy, cz, out.length ? cercano(out[out.length - 1][4], yaw) : yaw, pitch]);
    if (tr >= largo) break;
  }
  return out;
}

function canal(puntos, k, it) {
  const kf = puntos.map((q) => ({ interp: it, tick: F(pyRound(q[0], 3)), value: D(pyRound(q[k], 4)) }));
  return { $anim: { v: D(pyRound(puntos[0][k], 4)), track: { keyframes: kf, type: 'double' } } };
}

function armarCamaras(film, camaras, est, acciones, avisos, reloj) {
  const finEscena = Math.max(reloj, ...acciones.map((a) => a.hasta));
  const actores = (film.replays || []).map((r, i) => i).filter((i) => !esMarca(film.replays[i]));
  const usados = [...new Set(acciones.map((a) => a.actor))].filter((i) => actores.includes(i));
  film.camera ??= [];
  const capa = Math.max(-1, ...film.camera.map((c) => num(c.layer ?? 0))) + 1;    // arriba de las cámaras que ya había
  const tocadas = [];
  camaras.sort((a, b) => a.desde - b.desde);
  camaras.forEach((c, k) => {
    const sig = k + 1 < camaras.length ? camaras[k + 1].desde : null;
    let hasta = tiene(c, 'dur') ? c.desde + c.dur : (sig ?? finEscena + TICKS);
    if (sig !== null && hasta > sig) hasta = sig;                     // corta en la próxima cámara
    if (hasta - c.desde < CAMARA_MIN) {
      if (sig !== null && sig - c.desde < CAMARA_MIN) { avisos.push(`Línea ${c.linea}: la toma dura menos de 1 s porque enseguida viene otra cámara.`); hasta = Math.max(hasta, c.desde + 1); }
      else hasta = c.desde + CAMARA_MIN;
    }
    c.hasta = hasta;
    const ids = c.foco !== null ? [c.foco] : (usados.length ? usados : actores);
    if (!ids.length) throw new ErrorGuion(c.linea, 'no hay actores para encuadrar.');
    const pts = puntosToma(c, est, ids);
    const it = 'linear';
    const clip = {
      type: 'bbs:movement', title: 'Director: ' + TOMAS[c.toma].nombre, enabled: B(1), layer: I(capa),
      tick: I(Math.round(c.desde)), duration: I(Math.max(1, Math.round(hasta - c.desde))),
      envelope: { mode: I(0), pre: 'linear', fadeOut: F(10.0), post: 'linear', fadeIn: F(10.0), factor: D(1.0), enabled: B(0) },
      active: I(127), distance: F(0.0), dolly: F(0.0),
      x: canal(pts, 1, it), y: canal(pts, 2, it), z: canal(pts, 3, it),
      yaw: canal(pts, 4, it), pitch: canal(pts, 5, it), roll: D(0.0), fov: D(TOMAS[c.toma].fov),
    };
    film.camera.push(clip);
    tocadas.push(clip);
    const nombre = c.foco !== null ? nombreCorto(film.replays[c.foco], c.foco) : 'todos';
    acciones.push({ linea: c.linea, actor: c.foco ?? -1, nombre: '🎥 ' + nombre, tipo: 'cámara ' + TOMAS[c.toma].nombre,
      desde: pyRound(c.desde, 2), hasta: pyRound(hasta, 2), camara: pts.map((q) => [pyRound(c.desde + q[0], 1), q[1], q[3], q[4]]) });
  });
  acciones.sort((a, b) => a.linea - b.linea);
  return tocadas;
}

function ponerVisible(rep, tick, visible) {
  const an = (rep.animation ??= {});
  const tr = (an.visible ??= { keyframes: [], type: 'boolean' });
  const kf = tr.keyframes.filter((k) => Math.abs(num(k.tick) - tick) > 1e-6);
  if (visible && tick > 0 && !kf.some((k) => num(k.tick) < tick)) kf.push({ interp: 'constant', tick: F(0.0), value: B(0) });   // antes de aparecer, no se ve
  kf.push({ interp: 'constant', tick: F(pyRound(Number(tick), 3)), value: B(visible ? 1 : 0) });
  tr.keyframes = ordenarKf(kf);
}

// Transform del hueso en ese tick: el último keyframe anterior de su pista, o la pose base del form
export function valorPoseEn(rep, hueso, tick) {
  const kf = ((rep.animation || {})[`pose/${hueso}`] || {}).keyframes || [];
  const previos = kf.filter((k) => num(k.tick) <= tick + 1e-6);
  const v = previos.length ? previos[previos.length - 1].value : ((((rep.form || {}).pose) || {})[hueso] || {});
  return { r: capas.vec(v.r, [0, 0, 0]), s: capas.vec(v.s, [1, 1, 1]), t: capas.vec(v.t, [0, 0, 0]) };
}

// Su estilo: de la pose actual a la nueva en POSE_ANTES ticks, la sostiene y vuelve en POSE_DESPUES
function ponerPose(rep, pose, ini, sostener) {
  const an = (rep.animation ??= {});
  const a = ini + POSE_ANTES, b = ini + POSE_ANTES + sostener, fin = b + POSE_DESPUES;
  for (const [hueso, v] of Object.entries(pose)) {
    if (!esDict(v) || hueso === 'anchor') continue;
    const antes = valorPoseEn(rep, hueso, ini), despues = valorPoseEn(rep, hueso, fin);
    const nueva = { r: capas.vec(v.r, [0, 0, 0]), s: capas.vec(v.s, [1, 1, 1]), t: capas.vec(v.t, [0, 0, 0]) };
    const tr = (an[`pose/${hueso}`] ??= { keyframes: [], type: 'pose_transform' });
    const kf = tr.keyframes.filter((k) => !(ini - 1e-6 <= num(k.tick) && num(k.tick) <= fin + 1e-6));
    for (const [t, val] of [[ini, antes], [a, nueva], [b, nueva], [fin, despues]]) kf.push(capas.kf(t, capas.transform(val.t, val.s, val.r), 'sine_inout'));
    tr.keyframes = ordenarKf(kf);
  }
  return fin;
}

// Para la vista de arriba: {actor: [[tick, x, z, yaw, visible], ...]}
export function recorridos(film, hasta = null, paso = 2) {
  const reps = film.replays || [];
  const fin = hasta || capas.ultimoTick(film);
  const ts = arange(0, fin + 1e-6, paso);
  const serie = (rep, clave) => {
    const p = (rep.props || {})[clave];
    if (!esDict(p) || !tiene(p, '$anim')) return null;
    const kf = ((p.$anim.track || {}).keyframes) || [];
    if (!kf.length) { const v = tiene(p.$anim, 'v') ? num(p.$anim.v) : 0.0; return Array.from(ts, () => v); }
    const xp = kf.map((k) => num(k.tick)), fp = kf.map((k) => num(k.value));
    return Array.from(ts, (t) => interp(t, xp, fp));
  };
  const cero = Array.from(ts, () => 0);
  const out = {};
  reps.forEach((r, i) => {
    const by = ((((r.props || {}).bodyYaw) || {}).$anim || {}).track || {};
    const x = serie(r, 'x') || cero, z = serie(r, 'z') || cero, yaw = serie(r, (by.keyframes || []).length ? 'bodyYaw' : 'yaw') || cero;
    const vis = Array.from(ts, () => true);
    const kv = [...((((r.animation || {}).visible) || {}).keyframes || [])].sort((a, b) => num(a.tick) - num(b.tick));
    for (const k of kv) { const v = Boolean(num(k.value)); ts.forEach((t, j) => { if (t >= num(k.tick)) vis[j] = v; }); }
    out[i] = Array.from(ts, (t, j) => [pyRound(t, 1), pyRound(x[j], 3), pyRound(z[j], 3), pyRound(yaw[j], 1), vis[j]]);
  });
  return out;
}
