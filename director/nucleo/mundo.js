// Lectura del mapa de un mundo de Minecraft 1.20 (archivos region/r.X.Z.mca), SOLO LECTURA, para que los actores
// caminen siguiendo el piso (port de mundo.py del Director de la PC; da lo mismo).
//
// Formato Anvil: cabecera de 1024 posiciones (4 bytes: sector de 4 KiB y cantidad), cada chunk = largo (4 bytes) +
// compresión (1 = gzip, 2 = zlib, 3 = sin comprimir) + NBT. En 1.18+ el chunk tiene 'sections', cada una con 'Y' y
// 'block_states' = {palette: [{Name, Properties}], data: longs}. Los índices no cruzan de un long al otro;
// bits = max(4, bits necesarios para la paleta); índice del bloque = y*256 + z*16 + x.
//
// Los archivos se leen antes (cargarRegiones, asíncrono) y después todo es sincrónico.
import { unzlibSync, gunzipSync } from '../../visor/lib/fflate.js';
import { pyRound, hypot } from './py.js';

// ---------------------------------------------------------------- NBT (solo lo necesario para leer)
const UTF8 = new TextDecoder('utf-8');

function leerNbt(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 0;
  const str = () => { const n = dv.getUint16(i); i += 2; const s = UTF8.decode(buf.subarray(i, i + n)); i += n; return s; };
  const valor = (t) => {
    switch (t) {
      case 1: return dv.getInt8(i++);
      case 2: { const v = dv.getInt16(i); i += 2; return v; }
      case 3: { const v = dv.getInt32(i); i += 4; return v; }
      case 4: { const v = dv.getBigInt64(i); i += 8; return v; }
      case 5: { const v = dv.getFloat32(i); i += 4; return v; }
      case 6: { const v = dv.getFloat64(i); i += 8; return v; }
      case 7: { const n = dv.getInt32(i); i += 4; const v = buf.subarray(i, i + n); i += n; return v; }
      case 8: return str();
      case 9: {
        const tt = dv.getInt8(i); const n = dv.getInt32(i + 1); i += 5;
        const out = new Array(Math.max(0, n));
        for (let k = 0; k < n; k++) out[k] = valor(tt);
        return out;
      }
      case 10: {
        const out = {};
        for (;;) { const tt = buf[i++]; if (tt === 0) return out; const nombre = str(); out[nombre] = valor(tt); }
      }
      case 11: { const n = dv.getInt32(i); i += 4; const out = new Int32Array(n); for (let k = 0; k < n; k++) { out[k] = dv.getInt32(i); i += 4; } return out; }
      case 12: {   // longs: se guardan como BigUint64 (para sacar los bits sin signo)
        const n = dv.getInt32(i); i += 4; const out = new BigUint64Array(n);
        for (let k = 0; k < n; k++) { out[k] = dv.getBigUint64(i); i += 8; }
        return out;
      }
      default: throw new Error('tipo NBT desconocido ' + t);
    }
  };
  const t = buf[i++]; str();
  return valor(t);
}

// ---------------------------------------------------------------- altura de cada bloque
// bloques que no frenan al caminar (se pasa a través): aire, plantas, carteles, antorchas, etc.
const NO_SOLIDO = new RegExp('(^|_)(air|grass|fern|flower|tulip|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|'
  + 'rose|sapling|torch|sign|banner|button|lever|rail|tripwire|string|vine|water|lava|fire|mushroom|roots|'
  + 'sprouts|wart|kelp|seagrass|sugar_cane|bush|dead_bush|pressure_plate|redstone_wire|light|structure_void|'
  + 'cobweb|tall_grass|large_fern|sunflower|lilac|peony|wheat|carrots|potatoes|beetroots|melon_stem|pumpkin_stem|'
  + 'cave_vines|glow_lichen|moss_carpet_never|painting|item_frame|ladder|scaffolding_never|pointed_dripstone|'
  + 'spore_blossom|hanging_roots|big_dripleaf_stem|small_dripleaf|twisting_vines|weeping_vines|nether_portal|'
  + 'end_portal|barrier_never)$');

// Altura del piso que deja el bloque (0 = no se pisa, 1 = bloque entero). Aproximada para los que importan.
export function altoBloque(nombre, props = {}) {
  const n = String(nombre).split(':').pop();
  if (NO_SOLIDO.test(n)) return 0.0;
  if (n.endsWith('_slab')) return props.type === 'bottom' ? 0.5 : 1.0;
  if (n.endsWith('_stairs')) return props.half === 'top' ? 1.0 : 0.75;      // al subir una escalera queda una rampa pareja
  if (n.endsWith('_carpet') || n === 'moss_carpet') return 0.0625;
  if (n === 'snow') { const c = parseInt(props.layers || '1', 10); return c > 1 ? 0.125 * c : 0.0; }
  if (n === 'dirt_path' || n === 'farmland') return 0.9375;
  if (n.endsWith('_trapdoor')) return props.half === 'bottom' && props.open !== 'true' ? 0.1875 : 0.0;
  if (n.endsWith('_door') || n.endsWith('_fence_gate')) return 0.0;      // en una escena las puertas suelen abrirse
  if (n.endsWith('_bed')) return 0.5625;
  if (n === 'chest' || n === 'trapped_chest' || n === 'ender_chest') return 0.875;
  return 1.0;
}

const ALTO_PERSONA = 1.8, SUBE = 1.0, BAJA = 3.0;   // escalón máximo que sube caminando y caída máxima que acepta
const AIRE = { Name: 'minecraft:air' };

// ---------------------------------------------------------------- mundo
// regiones: Map 'rx,rz' -> bytes del .mca (o null si no existe). Lo que no está cargado cuenta como "sin mapa".
export class Mundo {
  constructor(regiones) { this.regiones = regiones; this.chunks = new Map(); this.memo = new Map(); }

  _chunk(cx, cz) {
    const clave = cx + ',' + cz;
    if (this.chunks.has(clave)) return this.chunks.get(clave);
    let secciones = null;
    const reg = this.regiones.get((cx >> 5) + ',' + (cz >> 5));
    if (reg) {
      const dv = new DataView(reg.buffer, reg.byteOffset, reg.byteLength);
      const p = 4 * ((cx & 31) + (cz & 31) * 32);
      const off = (reg[p] << 16) | (reg[p + 1] << 8) | reg[p + 2];
      if (off && off * 4096 + 5 <= reg.length) {
        const largo = dv.getInt32(off * 4096), comp = reg[off * 4096 + 4];
        const datos = reg.subarray(off * 4096 + 5, off * 4096 + 4 + largo);
        const raw = comp === 2 ? unzlibSync(datos) : comp === 1 ? gunzipSync(datos) : datos;
        const nbt = leerNbt(raw);
        secciones = new Map();
        for (const s of nbt.sections || (nbt.Level || {}).Sections || []) {
          const bs = s.block_states;
          if (bs && bs.palette && bs.palette.length) secciones.set(s.Y, [bs.palette, bs.data || null]);
        }
      }
    }
    this.chunks.set(clave, secciones);
    return secciones;
  }

  // {Name, Properties} del bloque en coordenadas enteras del mundo; null si el chunk no existe
  bloque(x, y, z) {
    const secs = this._chunk(x >> 4, z >> 4);
    if (!secs) return null;
    const sec = secs.get(y >> 4);
    if (!sec) return AIRE;
    const [paleta, datos] = sec;
    if (paleta.length === 1 || !datos) return paleta[0];
    const bits = Math.max(4, (paleta.length - 1).toString(2).length);
    const porLong = Math.floor(64 / bits);
    const idx = ((y & 15) * 256) + ((z & 15) * 16) + (x & 15);
    const v = datos[Math.floor(idx / porLong)];
    const k = Number((v >> BigInt((idx % porLong) * bits)) & ((1n << BigInt(bits)) - 1n));
    return k < paleta.length ? paleta[k] : paleta[0];
  }

  alto(x, y, z) {
    const b = this.bloque(x, y, z);
    return b === null ? null : altoBloque(b.Name || 'minecraft:air', b.Properties || {});
  }

  // true si una persona parada a la altura g en la columna (bx, bz) no choca con nada (cabeza incluida)
  libre(bx, bz, g) {
    for (let cy = Math.floor(g + 0.01); cy <= Math.floor(g + ALTO_PERSONA); cy++) {
      const a = this.alto(bx, cy, bz);
      if (a === null) return false;
      if (a > 0 && cy + a > g + 0.01 && cy < g + ALTO_PERSONA) return false;
    }
    return true;
  }

  // altura donde queda parado al pasar a la columna (bx, bz) viniendo desde la altura g (puede subir un escalón o
  // bajar hasta 3 bloques). null si no se puede pasar (pared, pozo, o fuera del mapa)
  apoyo(bx, bz, g) {
    const clave = bx + ',' + bz + ',' + pyRound(g * 16);
    if (!this.memo.has(clave)) this.memo.set(clave, this._apoyo(bx, bz, g));
    return this.memo.get(clave);
  }
  _apoyo(bx, bz, g) {
    for (let cy = Math.floor(g + SUBE); cy >= Math.floor(g - BAJA); cy--) {
      const a = this.alto(bx, cy, bz);
      if (a === null) return null;
      if (a > 0) {
        const t = cy + a;
        if (t > g + SUBE + 1e-6) return null;          // hay algo más alto que un escalón: pared
        return this.libre(bx, bz, t) ? t : null;
      }
    }
    return null;
  }

  // true si en (x, z) hay donde pararse cerca de la altura y (si no, el destino está adentro de una pared)
  destinoPosible(x, y, z) {
    const bx = Math.floor(x), bz = Math.floor(z);
    for (const g of [y, y + 1, y + 2, y + 3]) if (this.apoyo(bx, bz, g) !== null) return true;
    return false;
  }

  // Camino caminando (A*) de (x0, y0, z0) a (x1, y1, z1), coordenadas del mundo (y = pies). Busca solo cerca de la
  // línea recta (hasta 12 bloques al costado + la mitad del largo). [[x, z, g]] o null si no encuentra.
  camino(x0, y0, z0, x1, y1, z1, maxNodos = 12000) {
    const ini = [Math.floor(x0), Math.floor(z0)], fin = [Math.floor(x1), Math.floor(z1)];
    if (ini[0] === fin[0] && ini[1] === fin[1]) return [[x0, z0, y0], [x1, z1, y1]];
    if (!this.destinoPosible(x1, y1, z1)) return null;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, radio = hypot(x1 - x0, z1 - z0) / 2 + 12;
    const clave = (bx, bz, g) => bx + ',' + bz + ',' + pyRound(g * 4);
    const heap = new Monticulo();
    const mejor = new Map(), padre = new Map(), nodo = new Map();
    const k0 = clave(ini[0], ini[1], y0);
    mejor.set(k0, 0.0); padre.set(k0, null); nodo.set(k0, [ini[0], ini[1], pyRound(y0 * 4)]);
    heap.push([0.0, 0.0, ini[0], ini[1], y0]);
    const vecinos = [[1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let n = 0, llegada = null;
    while (heap.size && n < maxNodos) {
      const [, costo, bx, bz, g] = heap.pop();
      const k = clave(bx, bz, g);
      if (costo > (mejor.has(k) ? mejor.get(k) : Infinity) + 1e-9) continue;
      n++;
      if (bx === fin[0] && bz === fin[1] && Math.abs(g - y1) < 1.6) { llegada = k; break; }
      for (const [dx, dz, d] of vecinos) {
        const nx = bx + dx, nz = bz + dz;
        if (hypot(nx + 0.5 - mx, nz + 0.5 - mz) > radio) continue;
        const g2 = this.apoyo(nx, nz, g);
        if (g2 === null) continue;
        if (dx && dz && (this.apoyo(bx + dx, bz, g) === null || this.apoyo(bx, bz + dz, g) === null)) continue;   // no cortar esquinas
        const c2 = costo + d + 0.5 * Math.abs(g2 - g);
        const k2 = clave(nx, nz, g2);
        if (c2 < (mejor.has(k2) ? mejor.get(k2) : Infinity) - 1e-9) {
          mejor.set(k2, c2); padre.set(k2, k); nodo.set(k2, [nx, nz, pyRound(g2 * 4)]);
          const h = hypot(fin[0] - nx, fin[1] - nz) + 0.5 * Math.abs(y1 - g2);
          heap.push([c2 + h, c2, nx, nz, g2]);
        }
      }
    }
    if (llegada === null) return null;
    const nodos = [];
    for (let k = llegada; k !== null; k = padre.get(k)) { const [bx, bz, gq] = nodo.get(k); nodos.push([bx + 0.5, bz + 0.5, gq / 4]); }
    nodos.reverse();
    nodos[0] = [x0, z0, y0]; nodos[nodos.length - 1] = [x1, z1, nodos[nodos.length - 1][2]];
    return this.alisar(nodos);
  }

  // true si se puede ir en línea recta de a a b ([x, z, g]) caminando: sin paredes ni cambios bruscos
  tramoOk(a, b, paso = 0.25) {
    const largo = hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(largo / paso));
    let g = a[2];
    for (let k = 1; k <= n; k++) {
      const f = k / n, x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      const g2 = this.apoyo(Math.floor(x), Math.floor(z), g);
      if (g2 === null) return false;
      for (const [ox, oz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) if (this.apoyo(Math.floor(x + ox), Math.floor(z + oz), g) === null) return false;
      g = g2;
    }
    return Math.abs(g - b[2]) < 0.6;
  }

  // saca los puntos intermedios que se pueden saltear en línea recta (camino natural, no en zigzag)
  alisar(nodos) {
    const out = [nodos[0]];
    let k = 0;
    while (k < nodos.length - 1) {
      let j = nodos.length - 1;
      while (j > k + 1 && !this.tramoOk(nodos[k], nodos[j])) j--;
      out.push(nodos[j]); k = j;
    }
    return out;
  }

  // Alturas del piso a lo largo de una línea quebrada [[x, z, g]]: [[distancia, x, z, y]] cada 'paso' bloques.
  // Antes de un escalón ya está arriba (no se hunde en el bloque) y después de un borde baja de golpe.
  perfil(puntos, paso = 0.25) {
    const muestras = [[0.0, puntos[0][0], puntos[0][1], puntos[0][2]]];
    let g = puntos[0][2], dist = 0.0;
    for (let p = 0; p + 1 < puntos.length; p++) {
      const a = puntos[p], b = puntos[p + 1];
      const largo = hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(largo / paso));
      for (let k = 1; k <= n; k++) {
        const f = k / n, x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
        const g2 = this.apoyo(Math.floor(x), Math.floor(z), g);
        if (g2 !== null) g = g2;
        muestras.push([dist + largo * f, x, z, g]);
      }
      dist += largo;
    }
    const ys = muestras.map((m) => m[3]);
    return muestras.map((m, k) => [m[0], m[1], m[2], k + 1 < ys.length ? Math.max(ys[k], ys[k + 1]) : ys[k]]);
  }
}

// cola de prioridad para el A*: igual que heapq de Python con tuplas (f, costo, (x, z), g), así los empates se
// resuelven igual y el camino sale idéntico al del Director de la PC
const menor = (a, b) => {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
  return false;
};
class Monticulo {
  constructor() { this.h = []; }
  get size() { return this.h.length; }
  push(it) {                       // heapq.heappush (_siftdown)
    const h = this.h;
    h.push(it);
    let i = h.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (!menor(it, h[j])) break;
      h[i] = h[j]; i = j;
    }
    h[i] = it;
  }
  pop() {                          // heapq.heappop (_siftup de CPython: baja hasta una hoja y después sube)
    const h = this.h;
    const ult = h.pop();
    if (!h.length) return ult;
    const top = h[0];
    const n = h.length;
    let i = 0, hijo = 1;
    while (hijo < n) {
      const der = hijo + 1;
      if (der < n && !menor(h[hijo], h[der])) hijo = der;
      h[i] = h[hijo]; i = hijo; hijo = 2 * i + 1;
    }
    h[i] = ult;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (!menor(ult, h[j])) break;
      h[i] = h[j]; i = j;
    }
    h[i] = ult;
    return top;
  }
}

// Lee (asíncrono) las regiones que cubren los puntos [[x, z]] del mundo con un margen, para usar Mundo después.
// leerRegion(rx, rz) -> Promise<Uint8Array | null>
export async function cargarRegiones(leerRegion, puntos, margen = 64) {
  const claves = new Set();
  for (const [x, z] of puntos) {
    for (const dx of [-margen, 0, margen]) for (const dz of [-margen, 0, margen]) {
      claves.add((Math.floor(x + dx) >> 9) + ',' + (Math.floor(z + dz) >> 9));
    }
  }
  const regiones = new Map();
  for (const c of claves) {
    const [rx, rz] = c.split(',').map(Number);
    regiones.set(c, await leerRegion(rx, rz).catch(() => null));
  }
  return regiones;
}
