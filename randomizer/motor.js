// Motor del randomizer: la misma cuenta que el programa de Windows (Motor/Generador.cs y Modelos.cs).
// Con la misma semilla, los mismos prefabs y los mismos archivos da EXACTAMENTE el mismo archivo.
// No usa nada del navegador: también corre en Node (para las pruebas).
import { FORMA_BASE } from './forma_base.js';

const INT_MAX = 2147483647;

// ---------- System.Random de .NET con semilla (el de .NET 8 para "new Random(semilla)") ----------
// Es el algoritmo viejo de Knuth (resta). Copiado paso a paso para que salgan los mismos números.
export class RandomNet {
  constructor(semilla) {
    const s = new Int32Array(56);
    const resta = semilla === -2147483648 ? INT_MAX : Math.abs(semilla | 0);
    let mj = 161803398 - resta;
    s[55] = mj;
    let mk = 1, ii = 0;
    for (let i = 1; i < 55; i++) {
      if ((ii += 21) >= 55) ii -= 55;
      s[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += INT_MAX;
      mj = s[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        let n = i + 30;
        if (n >= 55) n -= 55;
        s[i] = s[i] - s[1 + n];
        if (s[i] < 0) s[i] += INT_MAX;
      }
    }
    this.s = s; this.inext = 0; this.inextp = 21;
  }
  _sample() {
    let a = this.inext, b = this.inextp;
    if (++a >= 56) a = 1;
    if (++b >= 56) b = 1;
    let r = this.s[a] - this.s[b];
    if (r === INT_MAX) r--;
    if (r < 0) r += INT_MAX;
    this.s[a] = r; this.inext = a; this.inextp = b;
    return r;
  }
  _doble() { return this._sample() * (1.0 / INT_MAX); }
  _dobleGrande() {
    let r = this._sample();
    if (this._sample() % 2 === 0) r = -r;
    let d = r;
    d += INT_MAX - 1;
    d /= 2 * INT_MAX - 1;
    return d;
  }
  // Next() / Next(max) / Next(min, max) como en .NET
  next(a, b) {
    if (a === undefined) return this._sample();
    if (b === undefined) {
      if (a < 0) throw new RangeError('max negativo');
      return Math.trunc(this._doble() * a);
    }
    if (a > b) throw new RangeError('min > max');
    const rango = b - a;
    if (rango <= INT_MAX) return Math.trunc(this._doble() * rango) + a;
    return Math.trunc(this._dobleGrande() * rango) + a;
  }
  nextDouble() { return this._doble(); }
}

// ---------- prefabs: leer con claves en minúscula o en PascalCase (como el lector de C#) ----------
function campo(o, nombre) {
  if (!o || typeof o !== 'object') return undefined;
  const low = nombre.toLowerCase();
  let v;
  for (const k of Object.keys(o)) if (k.toLowerCase() === low) v = o[k];
  return v;
}
const texto = (v, def) => (v === undefined ? def : v === null ? null : String(v));
const numero = (v, def) => (v === undefined || v === null || v === '' || isNaN(+v) ? def : +v);
const entero = (v, def) => (v === undefined || v === '' ? def : v === null ? null : isNaN(+v) ? def : Math.trunc(+v));
const lista = (v) => (Array.isArray(v) ? v : []);

export function colorDesde(o) {
  return {
    Modo: texto(campo(o, 'Modo'), 'ninguno') ?? 'ninguno',
    Paleta: lista(campo(o, 'Paleta')).map((x) => ({ Hex: texto(campo(x, 'Hex'), '#FFFFFF'), Peso: numero(campo(x, 'Peso'), 1) })),
    AlfaMin: entero(campo(o, 'AlfaMin'), 128) ?? 128,
    FijoR: entero(campo(o, 'FijoR'), null),
    FijoG: entero(campo(o, 'FijoG'), null),
    FijoB: entero(campo(o, 'FijoB'), null),
    FijoA: entero(campo(o, 'FijoA'), null),
    GrisMin: entero(campo(o, 'GrisMin'), 0) ?? 0,
    GrisMax: entero(campo(o, 'GrisMax'), 255) ?? 255,
  };
}

export function grupoDesde(o) {
  const cp = campo(o, 'ColoresPropios');
  const propios = {};
  if (cp && typeof cp === 'object') for (const [k, v] of Object.entries(cp)) propios[k] = v === null ? null : colorDesde(v);
  const col = campo(o, 'Color');
  return {
    Nombre: texto(campo(o, 'Nombre'), '') ?? '',
    Prob: numero(campo(o, 'Prob'), 1),
    Archivos: lista(campo(o, 'Archivos')).map(String),
    Carpetas: lista(campo(o, 'Carpetas')).map((c) => ({ Ruta: texto(campo(c, 'Ruta'), '') ?? '', Recursivo: !!campo(c, 'Recursivo') })),
    Excluidos: lista(campo(o, 'Excluidos')).map(String),
    ColoresPropios: propios,
    Color: colorDesde(col && typeof col === 'object' ? col : {}),
    Erase: !!campo(o, 'Erase'),
    ShiftY: entero(campo(o, 'ShiftY'), null),
  };
}

// Prefab "limpio" (claves en PascalCase, como lo guarda la app de Windows)
export function leerPrefab(o) {
  if (typeof o === 'string') o = JSON.parse(o);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('No es un prefab.');
  return {
    Nombre: texto(campo(o, 'Nombre'), '') ?? '',
    Prefijo: texto(campo(o, 'Prefijo'), 'X') ?? 'X',
    Modelo: texto(campo(o, 'Modelo'), 'player/steve') ?? 'player/steve',
    Textura: texto(campo(o, 'Textura'), '64x64') ?? '64x64',
    Raiz: texto(campo(o, 'Raiz'), 'models/player/_LosSaucera') ?? 'models/player/_LosSaucera',
    Grupos: lista(campo(o, 'Grupos')).map(grupoDesde),
  };
}

export const nuevoGrupo = (nombre = 'Nuevo grupo') => grupoDesde({ Nombre: nombre });
export const nuevoPrefab = () => leerPrefab({ Nombre: 'Nuevo prefab', Prefijo: 'X', Modelo: 'player/steve', Grupos: [{ Nombre: 'Piel base' }] });

// Resumen de candidatos de un grupo (columna "Candidatos" de la tabla)
export function resumenGrupo(g) {
  const partes = [];
  if (g.Archivos.length) partes.push(`${g.Archivos.length} archivo(s)`);
  for (const c of g.Carpetas) partes.push('carpeta ' + c.Ruta);
  if (g.Excluidos.length) partes.push(`${g.Excluidos.length} excluido(s)`);
  return partes.length ? partes.join(' + ') : '(vacío)';
}

// ---------- colores ----------
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

// BBS guarda el color como entero CON SIGNO en formato ARGB.
export const argb = (a, r, g, b) => ((a << 24) | (r << 16) | (g << 8) | b) | 0;

// "#RRGGBB" o "#AARRGGBB" → entero ARGB con signo (#000000 = -16777216). Tira error si no es válido.
export function parseHex(hex) {
  if (typeof hex !== 'string') throw new Error('color vacío');
  const h = hex.trim().replace(/^#+/, '');
  const m = /^[\t-\r ]*([0-9A-Fa-f]+)[\t-\r ]*$/.exec(h);
  if (!m) throw new Error('color no válido');
  const dig = m[1].replace(/^0+/, '');
  if (dig.length > 8) throw new Error('color demasiado largo');
  let v = parseInt(dig || '0', 16);
  if (h.length <= 6) v = (v | 0xff000000) >>> 0;
  return v | 0;
}

// Entero ARGB → "#RRGGBB" (o "#AARRGGBB" si no es opaco)
export function hexDe(c) {
  const u = c >>> 0, a = u >>> 24;
  const rgb = (u & 0xffffff).toString(16).padStart(6, '0').toUpperCase();
  return a === 255 ? '#' + rgb : '#' + a.toString(16).padStart(2, '0').toUpperCase() + rgb;
}

const canal = (fijo, azar) => (fijo !== null && fijo !== undefined ? clamp(fijo, 0, 255) : azar);

function hexSeguro(hex, avisos, donde) {
  try { return parseHex(hex); } catch { avisos.push(`${donde}: el color «${hex}» no es válido (usá #RRGGBB).`); return null; }
}

export function elegirColor(c, rng, avisos, donde) {
  switch (String(c.Modo || 'ninguno').toLowerCase()) {
    case 'rgb': {
      // Se sortean siempre los tres canales para que fijar uno no cambie los otros.
      const r = rng.next(256), g = rng.next(256), b = rng.next(256);
      return argb(255, canal(c.FijoR, r), canal(c.FijoG, g), canal(c.FijoB, b));
    }
    case 'rgba': {
      const a = rng.next(clamp(c.AlfaMin, 0, 255), 256), r = rng.next(256), g = rng.next(256), b = rng.next(256);
      return argb(canal(c.FijoA, a), canal(c.FijoR, r), canal(c.FijoG, g), canal(c.FijoB, b));
    }
    case 'grises': {
      const lo = clamp(Math.min(c.GrisMin, c.GrisMax), 0, 255), hi = clamp(Math.max(c.GrisMin, c.GrisMax), 0, 255);
      const v = rng.next(lo, hi + 1);
      return argb(255, v, v, v);
    }
    case 'paleta': {
      if (!c.Paleta.length) { avisos.push(`${donde}: paleta vacía.`); return null; }
      let total = 0;
      for (const x of c.Paleta) total += Math.max(0, x.Peso);
      let t = rng.nextDouble() * total;
      for (const x of c.Paleta) {
        t -= Math.max(0, x.Peso);
        if (t < 0) return hexSeguro(x.Hex, avisos, donde);
      }
      return hexSeguro(c.Paleta[c.Paleta.length - 1].Hex, avisos, donde);
    }
    default:
      return null;
  }
}

// Color propio de un archivo (sin importar mayúsculas ni el tipo de barra), o undefined
export function colorPropio(g, rel) {
  const low = rel.toLowerCase();
  for (const k of Object.keys(g.ColoresPropios)) if (k.replace(/\\/g, '/').toLowerCase() === low) return g.ColoresPropios[k];
  return undefined;
}

// ---------- archivos ----------
// "disco" = lo que hay adentro de la carpeta assets: { existe(ruta), listar(carpeta, recursivo) }
// Rutas relativas a assets, con "/". Sin mayúsculas/minúsculas (como Windows).
export function discoDeRutas(rutas) {
  const archivos = new Map();   // minúscula → ruta real
  const carpetas = new Set();
  for (const r of rutas) {
    archivos.set(r.toLowerCase(), r);
    const partes = r.split('/');
    for (let i = 1; i < partes.length; i++) carpetas.add(partes.slice(0, i).join('/').toLowerCase());
  }
  carpetas.add('');
  return {
    existe: (ruta) => archivos.has(limpiarRuta(ruta).toLowerCase()),
    existeCarpeta: (ruta) => carpetas.has(limpiarRuta(ruta).toLowerCase()),
    // PNG de una carpeta: devuelve el resto de la ruta (lo de adentro de la carpeta), tal como está en el disco
    listar(ruta, recursivo) {
      const pre = limpiarRuta(ruta).toLowerCase();
      const out = [];
      for (const [low, real] of archivos) {
        if (pre && !low.startsWith(pre + '/')) continue;
        const resto = real.slice(pre ? pre.length + 1 : 0);
        if (!recursivo && resto.includes('/')) continue;
        if (!low.endsWith('.png')) continue;
        out.push(resto);
      }
      return out;
    },
    carpetasDe(ruta) {
      const pre = limpiarRuta(ruta).toLowerCase();
      const hijos = new Map();
      for (const real of archivos.values()) {
        const low = real.toLowerCase();
        if (pre && !low.startsWith(pre + '/')) continue;
        const resto = real.slice(pre ? pre.length + 1 : 0);
        const i = resto.indexOf('/');
        if (i > 0) hijos.set(resto.slice(0, i).toLowerCase(), resto.slice(0, i));
      }
      return [...hijos.values()];
    },
  };
}

// Quita barras repetidas, "." y barras al principio/final; usa "/"
export const limpiarRuta = (r) => String(r || '').replace(/\\/g, '/').split('/').filter((x) => x && x !== '.').join('/');
const unir = (...p) => p.map(limpiarRuta).filter(Boolean).join('/');
const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// PNG de una carpeta candidata, relativos a la raíz del prefab (ordenados como en C#: ordinal)
export function archivosDeCarpeta(p, c, disco) {
  const dir = unir(p.Raiz, c.Ruta);
  if (!disco || !disco.existeCarpeta(dir)) return [];
  const pre = limpiarRuta(c.Ruta);
  return disco.listar(dir, c.Recursivo).map((f) => (pre ? pre + '/' + f : f)).sort(ordinal);
}

export function candidatos(p, g, disco, cache, avisos) {
  let l = [];
  for (const a of g.Archivos) {
    const rel = a.replace(/\\/g, '/').replace(/^\/+/, '');
    if (disco && !disco.existe(unir(p.Raiz, rel))) avisos.push(`${p.Nombre} / ${g.Nombre}: no existe ${rel}`);
    l.push(rel);
  }
  for (const c of g.Carpetas) {
    if (!disco) continue;
    const clave = `${p.Raiz}|${c.Ruta}|${c.Recursivo}`;
    let archivos = cache.get(clave);
    if (!archivos) {
      if (!disco.existeCarpeta(unir(p.Raiz, c.Ruta))) {
        avisos.push(`${p.Nombre} / ${g.Nombre}: no existe la carpeta ${c.Ruta}`);
        archivos = [];
      } else archivos = archivosDeCarpeta(p, c, disco);
      cache.set(clave, archivos);
    }
    l.push(...archivos);
  }
  if (g.Excluidos.length) {
    const fuera = new Set(g.Excluidos.map((e) => e.replace(/\\/g, '/').toLowerCase()));
    l = l.filter((x) => !fuera.has(x.toLowerCase()));
  }
  return [...new Set(l)];
}

// ---------- generar ----------
const d6 = (n) => (n < 0 ? '-' + String(-n).padStart(6, '0') : String(n).padStart(6, '0'));
export const tituloDe = (sem) => `Cameos Random [semilla: ${d6(sem)}]`;

function sortear(p, n, rng, disco, cache, avisos) {
  const capas = [];
  for (const g of p.Grupos) {
    // Siempre se consumen los mismos sorteos, aparezca o no el grupo.
    const dado = rng.nextDouble();
    const dadoCand = rng.nextDouble();
    if (dado >= g.Prob) continue;
    const cands = candidatos(p, g, disco, cache, avisos);
    if (!cands.length) { avisos.push(`${p.Nombre} / ${g.Nombre}: no hay candidatos, se saltea el grupo.`); continue; }
    const rel = cands[Math.min(Math.trunc(dadoCand * cands.length), cands.length - 1)];
    const ruta = `assets:${p.Raiz.replace(/^\/+|\/+$/g, '')}/${rel}`;
    const donde = `${p.Nombre} / ${g.Nombre}`;
    let color = elegirColor(g.Color, rng, avisos, donde);
    // El color propio de un archivo reemplaza al del grupo sin tocar los demás sorteos.
    const propio = Object.keys(g.ColoresPropios).length ? colorPropio(g, rel) : undefined;
    if (propio) color = elegirColor(propio, new RandomNet(Math.trunc(dadoCand * INT_MAX)), avisos, donde + ' / ' + rel);
    capas.push({ ruta, color, erase: !!g.Erase, shiftY: g.ShiftY ?? null, sorteo: { grupo: g.Nombre, dado: dadoCand, de: cands.length } });
  }
  return { nombre: `${p.Prefijo}:${String(n).padStart(2, '0')}`, modelo: p.Modelo, capas };
}

// pedido: [{ prefab, cantidad }]; semilla: número o null (= al azar); disco: ver discoDeRutas (o null)
export function generar(pedido, semilla, disco, idArchivo = null) {
  const sem = semilla ?? Math.floor(Math.random() * 1000000);
  const titulo = tituloDe(sem);
  const cache = new Map();
  const avisos = [], personajes = [], forms = [];
  pedido.forEach(({ prefab, cantidad }, pi) => {
    for (let n = 1; n <= cantidad; n++) {
      // Un sorteo propio por personaje: pedir más no cambia los anteriores.
      const rng = new RandomNet(Math.imul(sem, 73856093) ^ Math.imul(pi + 1, 19349663) ^ Math.imul(n, 83492791));
      const pj = sortear(prefab, n, rng, disco, cache, avisos);
      personajes.push(pj);
      forms.push(armarForma(pj));
    }
  });
  const raiz = { id: idArchivo || uuid(), title: titulo, forms };
  return { semilla: sem, titulo, json: aJson(raiz), personajes, avisos: [...new Set(avisos)] };
}

// Nombre del archivo de salida: CameosRandom_<semilla>_<M10_F5>.json
export function nombreArchivo(sem, pedido) {
  const sufijo = pedido.map(({ prefab, cantidad }) => prefab.Prefijo.replace(/[^\p{L}\p{Mn}\p{Nd}\p{Pc}]/gu, '') + cantidad).join('_');
  return `CameosRandom_${d6(sem)}_${sufijo}.json`;
}

function uuid() {
  const c = globalThis.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- JSON igual al de C# ----------
// Los números de la plantilla se guardan tal cual vienen escritos ("20.0" sigue siendo "20.0").
class NumeroCrudo { constructor(t) { this.t = t; } }

function leerJsonCrudo(txt) {
  let i = 0;
  const esp = () => { while (i < txt.length && ' \t\r\n'.includes(txt[i])) i++; };
  const valor = () => {
    esp();
    const ch = txt[i];
    if (ch === '{') {
      i++; const o = {}; esp();
      if (txt[i] === '}') { i++; return o; }
      for (;;) { esp(); const k = valor(); esp(); i++; /* : */ o[k] = valor(); esp(); if (txt[i++] === '}') return o; }
    }
    if (ch === '[') {
      i++; const a = []; esp();
      if (txt[i] === ']') { i++; return a; }
      for (;;) { a.push(valor()); esp(); if (txt[i++] === ']') return a; }
    }
    if (ch === '"') {
      let j = i + 1;
      while (txt[j] !== '"') j += txt[j] === '\\' ? 2 : 1;
      const s = JSON.parse(txt.slice(i, j + 1)); i = j + 1; return s;
    }
    const m = /^(true|false|null|-?\d+(\.\d+)?([eE][+-]?\d+)?)/.exec(txt.slice(i, i + 40));
    if (!m) throw new Error('JSON roto en ' + i);
    i += m[0].length;
    return m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'null' ? null : new NumeroCrudo(m[0]);
  };
  return valor();
}

const ESC = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
const cadena = (s) => '"' + s.replace(/["\\\u0000-\u001f]/g, (c) => ESC[c] || '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')) + '"';

// Igual que System.Text.Json con WriteIndented (2 espacios, saltos de línea de Windows)
export function aJson(v, sangria = '', nl = '\r\n') {
  if (v === null || v === undefined) return 'null';
  if (v instanceof NumeroCrudo) return v.t;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return cadena(v);
  const s2 = sangria + '  ';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return '[' + nl + v.map((x) => s2 + aJson(x, s2, nl)).join(',' + nl) + nl + sangria + ']';
  }
  const ks = Object.keys(v);
  if (!ks.length) return '{}';
  return '{' + nl + ks.map((k) => s2 + cadena(k) + ': ' + aJson(v[k], s2, nl)).join(',' + nl) + nl + sangria + '}';
}

// Una forma de BBS (bbs:model) a partir de la plantilla del usuario
export function armarForma(pj) {
  const forma = leerJsonCrudo(FORMA_BASE);
  forma.model = pj.modelo;
  forma.name = pj.nombre;
  forma.texture = pj.capas.map((c) => {
    const o = { path: c.ruta };
    if (c.color !== null && c.color !== undefined) o.color = c.color;
    if (c.erase) o.erase = true;
    if (c.shiftY !== null && c.shiftY !== undefined) o.shiftY = c.shiftY;
    return o;
  });
  return forma;
}

// La misma forma pero con números comunes (para dibujarla en el visor)
export function formaSimple(pj) { return JSON.parse(aJson(armarForma(pj), '', '\n')); }
