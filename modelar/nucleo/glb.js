// Lectura de un .glb (glTF binario) sin librerías: las mallas (triángulos) ya puestas en el mundo, con sus UV y la imagen de color
// de su material. No hace falta el esqueleto ni las animaciones: el modelo se toma en la pose en que viene.

const TIPOS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

function leerAccesor(j, bin, i) {
  const a = j.accessors[i], n = TIPOS[a.type], [Tipo, tam] = COMP[a.componentType];
  const out = new Float32Array(a.count * n);
  if (a.bufferView == null) return out;   // (accesor vacío: todo en cero)
  const bv = j.bufferViews[a.bufferView], base = (bv.byteOffset || 0) + (a.byteOffset || 0), paso = bv.byteStride || n * tam;
  const dv = new DataView(bin.buffer, bin.byteOffset);
  const lee = { 5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true),
    5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true) }[a.componentType];
  const norm = a.normalized && NORM[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const v = lee(base + k * paso + c * tam);
    out[k * n + c] = norm ? Math.max(v / norm, -1) : v;
  }
  return out;
}

// matrices 4x4 por columnas, como glTF
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
function matrizNodo(n) {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation || [0, 0, 0], [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}

/**
 * bytes: Uint8Array del .glb. Devuelve { partes: [{ nombre, pos (Float32Array xyz en el mundo), uv (Float32Array|null), idx (Uint32Array),
 * imagen (índice en imagenes o -1), color [r,g,b] (0-1, el baseColorFactor) }], imagenes: [{ mime, bytes }] }.
 */
export function leerGLB(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('No es un archivo .glb.');
  let j = null, bin = null;
  for (let o = 12; o + 8 <= bytes.byteLength;) {
    const largo = dv.getUint32(o, true), tipo = dv.getUint32(o + 4, true), datos = bytes.subarray(o + 8, o + 8 + largo);
    if (tipo === 0x4e4f534a) j = JSON.parse(new TextDecoder().decode(datos));
    else if (tipo === 0x004e4942) bin = datos;
    o += 8 + largo;
  }
  if (!j) throw new Error('El .glb no tiene la parte JSON.');
  bin = bin || new Uint8Array(0);
  const imagenes = (j.images || []).map((im) => {
    if (im.bufferView != null) { const bv = j.bufferViews[im.bufferView]; return { mime: im.mimeType || 'image/png', bytes: bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength) }; }
    if (im.uri && im.uri.startsWith('data:')) {
      const [cab, b64] = im.uri.split(','); const s = atob(b64); const u = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k);
      return { mime: cab.slice(5).split(';')[0], bytes: u };
    }
    return null;   // (imagen en un archivo aparte: no viene en el .glb)
  });
  const partes = [];
  const recorrer = (ni, padre) => {
    const n = j.nodes[ni], m = mul(padre, matrizNodo(n));
    if (n.mesh != null) {
      const malla = j.meshes[n.mesh];
      malla.primitives.forEach((p, k) => {
        if (p.mode != null && p.mode !== 4) return;   // solo triángulos
        const crudo = leerAccesor(j, bin, p.attributes.POSITION), pos = new Float32Array(crudo.length);
        for (let v = 0; v < crudo.length; v += 3) {
          const x = crudo[v], y = crudo[v + 1], z = crudo[v + 2];
          pos[v] = m[0] * x + m[4] * y + m[8] * z + m[12]; pos[v + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; pos[v + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        const uv = p.attributes.TEXCOORD_0 != null ? leerAccesor(j, bin, p.attributes.TEXCOORD_0) : null;
        const idx = p.indices != null ? Uint32Array.from(leerAccesor(j, bin, p.indices)) : Uint32Array.from({ length: pos.length / 3 }, (_, q) => q);
        const mat = p.material != null ? j.materials[p.material] : null, pbr = (mat && mat.pbrMetallicRoughness) || {};
        const tex = pbr.baseColorTexture ? j.textures[pbr.baseColorTexture.index] : null;
        const f = pbr.baseColorFactor || [1, 1, 1, 1];
        partes.push({ nombre: (mat && mat.name) || malla.name || n.name || `parte_${partes.length + 1}`, pos, uv, idx,
          imagen: tex && tex.source != null && imagenes[tex.source] ? tex.source : -1, color: [f[0], f[1], f[2]] });
      });
    }
    for (const h of n.children || []) recorrer(h, m);
  };
  const escena = j.scenes ? j.scenes[j.scene || 0] : { nodes: j.nodes.map((_, i) => i) };
  for (const ni of escena.nodes) recorrer(ni, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // partes con el mismo nombre (material) se juntan: en Blockbench van a ser un mismo grupo
  const juntas = new Map();
  for (const p of partes) {
    const q = juntas.get(p.nombre);
    if (!q) { juntas.set(p.nombre, p); continue; }
    const base = q.pos.length / 3;
    const pos = new Float32Array(q.pos.length + p.pos.length); pos.set(q.pos); pos.set(p.pos, q.pos.length);
    const uv = q.uv && p.uv ? (() => { const u = new Float32Array(q.uv.length + p.uv.length); u.set(q.uv); u.set(p.uv, q.uv.length); return u; })() : null;
    const idx = new Uint32Array(q.idx.length + p.idx.length); idx.set(q.idx); for (let k = 0; k < p.idx.length; k++) idx[q.idx.length + k] = p.idx[k] + base;
    Object.assign(q, { pos, uv, idx });
  }
  return { partes: [...juntas.values()], imagenes };
}
