// Paquete de modelos de la cara para BBS: las bocas de píxeles (boca_pixel_Man/Woman_x1/x2/x4) y las arrugas (arrugas_Man/Woman_x2/x4),
// armadas con las mismas cuentas que usa la conversión. Se descomprime dentro de la carpeta bbs (queda en assets/models/player/<nombre>/)
// y después se agregan como partes del actor en BBS (parte de "head").
import { zipSync, zlibSync, strToU8 } from '../visor/lib/fflate.js';
import * as BP from './nucleo/boca_pixel.js';
import * as AR from './nucleo/arrugas.js';

const crcTabla = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTabla[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function trozo(tipo, datos) {
  const t = strToU8(tipo), cuerpo = new Uint8Array(t.length + datos.length); cuerpo.set(t); cuerpo.set(datos, t.length);
  const out = new Uint8Array(12 + datos.length); out.set(u32(datos.length)); out.set(cuerpo, 4); out.set(u32(crc32(cuerpo)), 8 + datos.length);
  return out;
}
/** PNG RGBA de w x h a partir de los bytes RGBA. */
export function pngDeRGBA(w, h, rgba) {
  const crudo = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { crudo[y * (w * 4 + 1)] = 0; crudo.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const ihdr = new Uint8Array(13); ihdr.set(u32(w)); ihdr.set(u32(h), 4); ihdr[8] = 8; ihdr[9] = 6;
  const partes = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr), trozo('IDAT', zlibSync(crudo)), trozo('IEND', new Uint8Array(0))];
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0)); let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}

const json = (o) => strToU8(JSON.stringify(o, null, '\t'));
/** Lista de modelos del paquete: [{nombre, modelo, poses, png}]. */
export function modelos() {
  const lista = [];
  for (const mujer of [false, true]) {
    for (const k of [1, 2, 4]) {
      const filas = mujer ? 1 : 2, { modelo, poses } = BP.modeloBBS({ k, filas, labios: !mujer });
      lista.push({ nombre: `boca_pixel_${mujer ? 'Woman' : 'Man'}_x${k}`, modelo, poses, png: pngDeRGBA(16, 16, BP.texturaRGBA()) });
    }
    for (const kw of AR.ESCALAS) {
      const { modelo, poses } = AR.modeloBBS({ kw, filas: mujer ? 1 : 2 });
      lista.push({ nombre: AR.nombreModelo(mujer, kw), modelo, poses, png: pngDeRGBA(16, 16, AR.texturaRGBA()) });
    }
  }
  return lista;
}
/** El .zip: assets/models/player/<nombre>/{config.json, <nombre>.bbs.json, poses.json, textura.png} + un LEEME. */
export function paqueteZip() {
  const archivos = {};
  for (const m of modelos()) {
    const base = `assets/models/player/${m.nombre}/`;
    archivos[base + 'config.json'] = json({ texture: `assets:models/player/${m.nombre}/textura.png` });
    archivos[base + m.nombre + '.bbs.json'] = json(m.modelo);
    archivos[base + 'poses.json'] = json(m.poses);
    archivos[base + 'textura.png'] = m.png;
  }
  archivos['LEEME.txt'] = strToU8([
    'Modelos de la cara para BBS (Estudio BBS)',
    '',
    'Copiá la carpeta "assets" de este zip adentro de tu carpeta bbs (la que tiene "assets" y "settings"): se suman los modelos nuevos sin pisar nada tuyo.',
    'Queda: assets/models/player/boca_pixel_Man_x2, boca_pixel_Woman_x1..., arrugas_Man_x2, arrugas_Woman_x4...',
    '',
    'En BBS: al actor, en el editor de forms, agregale una parte hija de "head" con el modelo que vas a usar (por ejemplo player/boca_pixel_Man_x2 y player/arrugas_Man_x2).',
    'El Mocap de Estudio BBS (modo Cara) las reconoce por el nombre del modelo y les agrega la animación de tu cara.',
    'Las arrugas son un negro translúcido arriba de la piel; viven solo adentro de los 6 x 2 pixeles de la boca (6 x 1 en mujer).',
    'Todo esto se probó en el visor de Estudio BBS; falta ver cómo lo dibuja BBS por dentro del juego.',
  ].join('\n'));
  return zipSync(archivos);
}
