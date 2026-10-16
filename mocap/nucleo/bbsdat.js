// Lector/escritor del formato binario de BBS mod (archivos .dat de films). Igual que bbsdat.py del programa de PC.
//
//   gzip( "BBS1", u16 cantidad de claves, repetir (u8 id, u16 largo, utf-8), valor raiz )
//   valor = u8 tipo + contenido (big-endian):
//     0 map i32 n, (u8 id_clave, valor)*   1 list i32 n, valor*   2 str u16 + utf-8
//     3 byte u8   4 short i16   5 int i32   6 float f32   7 long i64   8 double f64
//
// Los numeros se guardan envueltos (B, S, I, F, L, D) para reescribir el archivo con los mismos tipos.

export class Num {
  constructor(code, v) { this.code = code; this.v = v; }
  valueOf() { return Number(this.v); }
  toJSON() { return Number(this.v); }
}
export const B = (v) => new Num(3, v);
export const S = (v) => new Num(4, v);
export const I = (v) => new Num(5, v);
export const F = (v) => new Num(6, v);
export const L = (v) => new Num(7, BigInt(v));
export const D = (v) => new Num(8, v);
export const num = (v) => (v instanceof Num ? Number(v.v) : Number(v));

const enc = new TextEncoder(), dec = new TextDecoder();

// ---------- lectura ----------
export function loads(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let i = 0;
  const need = (n) => { if (i + n > u8.length) throw new Error('archivo cortado'); };
  const u8r = () => { need(1); return dv.getUint8(i++); };
  const u16 = () => { need(2); const v = dv.getUint16(i); i += 2; return v; };
  const i32 = () => { need(4); const v = dv.getInt32(i); i += 4; return v; };
  const str = (n) => { need(n); const s = dec.decode(u8.subarray(i, i + n)); i += n; return s; };

  if (str(4) !== 'BBS1') throw new Error('no es un archivo BBS');
  const table = {};
  const nk = u16();
  for (let k = 0; k < nk; k++) { const id = u8r(); table[id] = str(u16()); }

  function read() {
    const t = u8r();
    switch (t) {
      case 0: { const n = i32(), o = {}; for (let k = 0; k < n; k++) { const key = table[u8r()]; o[key] = read(); } return o; }
      case 1: { const n = i32(), a = []; for (let k = 0; k < n; k++) a.push(read()); return a; }
      case 2: return str(u16());
      case 3: return B(u8r());
      case 4: { need(2); const v = dv.getInt16(i); i += 2; return S(v); }
      case 5: return I(i32());
      case 6: { need(4); const v = dv.getFloat32(i); i += 4; return F(v); }
      case 7: { need(8); const v = dv.getBigInt64(i); i += 8; return new Num(7, v); }
      case 8: { need(8); const v = dv.getFloat64(i); i += 8; return D(v); }
      default: throw new Error(`tipo desconocido ${t} en byte ${i - 1}`);
    }
  }
  const root = read();
  if (i !== u8.length) throw new Error(`sobran ${u8.length - i} bytes`);
  return root;
}

// ---------- escritura ----------
class Out {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; this.dv = new DataView(this.buf.buffer); }
  room(k) {
    if (this.n + k <= this.buf.length) return;
    let m = this.buf.length * 2; while (m < this.n + k) m *= 2;
    const b = new Uint8Array(m); b.set(this.buf.subarray(0, this.n)); this.buf = b; this.dv = new DataView(b.buffer);
  }
  u8(v) { this.room(1); this.dv.setUint8(this.n, v); this.n += 1; }
  u16(v) { this.room(2); this.dv.setUint16(this.n, v); this.n += 2; }
  i16(v) { this.room(2); this.dv.setInt16(this.n, v); this.n += 2; }
  i32(v) { this.room(4); this.dv.setInt32(this.n, v); this.n += 4; }
  f32(v) { this.room(4); this.dv.setFloat32(this.n, v); this.n += 4; }
  f64(v) { this.room(8); this.dv.setFloat64(this.n, v); this.n += 8; }
  i64(v) { this.room(8); this.dv.setBigInt64(this.n, BigInt(v)); this.n += 8; }
  bytes(b) { this.room(b.length); this.buf.set(b, this.n); this.n += b.length; }
  result() { return this.buf.slice(0, this.n); }
}

const esObj = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Num);

function collectKeys(v, keys) {
  if (Array.isArray(v)) { for (const x of v) collectKeys(x, keys); return; }
  if (esObj(v)) for (const [k, x] of Object.entries(v)) { if (!keys.has(k)) keys.set(k, keys.size); collectKeys(x, keys); }
}

function write(v, keys, o) {
  if (Array.isArray(v)) { o.u8(1); o.i32(v.length); for (const x of v) write(x, keys, o); return; }
  if (v instanceof Num) {
    o.u8(v.code);
    switch (v.code) {
      case 3: o.u8(Number(v.v)); break;
      case 4: o.i16(Number(v.v)); break;
      case 5: o.i32(Number(v.v)); break;
      case 6: o.f32(Number(v.v)); break;
      case 7: o.i64(v.v); break;
      case 8: o.f64(Number(v.v)); break;
    }
    return;
  }
  if (typeof v === 'string') { const b = enc.encode(v); o.u8(2); o.u16(b.length); o.bytes(b); return; }
  if (typeof v === 'boolean') { o.u8(3); o.u8(v ? 1 : 0); return; }
  if (typeof v === 'number') {
    if (Number.isInteger(v)) { o.u8(5); o.i32(v); } else { o.u8(6); o.f32(v); }
    return;
  }
  if (esObj(v)) {
    const e = Object.entries(v);
    o.u8(0); o.i32(e.length);
    for (const [k, x] of e) { o.u8(keys.get(k)); write(x, keys, o); }
    return;
  }
  throw new Error('no se puede guardar ' + typeof v);
}

export function dumps(root) {
  const keys = new Map(); collectKeys(root, keys);
  if (keys.size > 255) throw new Error('mas de 255 claves distintas: formato de ids no verificado para ese caso');
  const o = new Out();
  o.bytes(enc.encode('BBS1')); o.u16(keys.size);
  for (const [k, id] of keys) { const b = enc.encode(k); o.u8(id); o.u16(b.length); o.bytes(b); }
  write(root, keys, o);
  return o.result();
}

// ---------- gzip (navegador: CompressionStream; Node: zlib) ----------
async function porStream(bytes, Stream, tipo) {
  const s = new Blob([bytes]).stream().pipeThrough(new Stream(tipo));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'undefined') return porStream(bytes, DecompressionStream, 'gzip');
  const zlib = await import('node:zlib'); return new Uint8Array(zlib.gunzipSync(bytes));
}
export async function gzip(bytes) {
  if (typeof CompressionStream !== 'undefined') return porStream(bytes, CompressionStream, 'gzip');
  const zlib = await import('node:zlib'); return new Uint8Array(zlib.gzipSync(bytes));
}

export async function leer(bytesGz) { return loads(await gunzip(bytesGz)); }
export async function escribir(root) { return gzip(dumps(root)); }

// copia profunda (para no tocar el film original cuando se convierte varias veces)
export function clonar(v) {
  if (Array.isArray(v)) return v.map(clonar);
  if (v instanceof Num) return new Num(v.code, v.v);
  if (esObj(v)) { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = clonar(x); return o; }
  return v;
}
