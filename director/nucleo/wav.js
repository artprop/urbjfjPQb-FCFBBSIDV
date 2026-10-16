// Leer audios: los .wav se leen directo (mismos números que scipy en la PC); otros formatos (.ogg, .mp3...)
// los decodifica el navegador. Siempre queda {sr, d}: frecuencia y audio mono en float32 de -1 a 1.

const f32 = Math.fround;

function texto(dv, i, n) { let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(dv.getUint8(i + k)); return s; }

// true si los bytes son un .wav (RIFF/WAVE)
export function esWav(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 12) return false;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return ['RIFF', 'RIFX', 'RF64'].includes(texto(dv, 0, 4)) && texto(dv, 8, 4) === 'WAVE';
}

// Como scipy.io.wavfile.read + lo que hace capas.leer_wav: pasar a float32, promediar canales y llevar a -1..1
export function leerWav(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (!esWav(u8)) throw new Error('No es un archivo .wav.');
  const big = texto(dv, 0, 4) === 'RIFX';
  let i = 12, fmt = null, datos = null;
  while (i + 8 <= u8.length) {
    const id = texto(dv, i, 4); let largo = dv.getUint32(i + 4, !big);
    if (id === 'fmt ') {
      let tag = dv.getUint16(i + 8, !big);
      const canales = dv.getUint16(i + 10, !big), sr = dv.getUint32(i + 12, !big);
      const bloque = dv.getUint16(i + 20, !big), bits = dv.getUint16(i + 22, !big);
      if (tag === 0xfffe && largo >= 40) tag = dv.getUint16(i + 32, !big);   // WAVE_FORMAT_EXTENSIBLE
      fmt = { tag, canales, sr, bloque, bits };
    } else if (id === 'data') {
      if (largo === 0xffffffff || i + 8 + largo > u8.length) largo = u8.length - i - 8;   // archivos cortados
      datos = { ini: i + 8, largo };
    }
    i += 8 + largo + (largo % 2);
  }
  if (!fmt || !datos) throw new Error('El .wav está incompleto (no tiene "fmt" o "data").');
  const { tag, canales, sr, bloque, bits } = fmt;
  if (tag !== 1 && tag !== 3) throw new Error('Este .wav está comprimido; guardalo como WAV PCM normal.');
  const bytesMuestra = bloque / canales;
  const n = Math.floor(datos.largo / bloque);
  const d = new Float32Array(n);
  const le = !big;
  const leer = (p) => {
    if (tag === 3) return bytesMuestra === 4 ? dv.getFloat32(p, le) : f32(dv.getFloat64(p, le));
    switch (bytesMuestra) {
      case 1: return dv.getUint8(p);                                     // scipy: uint8 sin centrar
      case 2: return dv.getInt16(p, le);
      case 3: {                                                          // scipy: int32 con los 24 bits arriba
        const b0 = dv.getUint8(p), b1 = dv.getUint8(p + 1), b2 = dv.getUint8(p + 2);
        const v = le ? (b0 << 8) | (b1 << 16) | (b2 << 24) : (b2 << 8) | (b1 << 16) | (b0 << 24);
        return f32(v | 0);
      }
      case 4: return f32(dv.getInt32(p, le));
      case 8: return f32(Number(dv.getBigInt64(p, le)));
      default: throw new Error(`No sé leer .wav de ${bits} bits.`);
    }
  };
  let max = 0;
  for (let k = 0; k < n; k++) {
    const p = datos.ini + k * bloque;
    let v;
    if (canales === 1) v = leer(p);
    else {
      let s = 0;
      for (let c = 0; c < canales; c++) s = f32(s + leer(p + c * bytesMuestra));
      v = f32(s / canales);
    }
    d[k] = v;
    const a = Math.abs(v); if (a > max) max = a;
  }
  if (max > 1.5) {                                                      // enteros: llevar a -1..1
    const div = max <= 32768 ? 32768 : 2147483648;
    for (let k = 0; k < n; k++) d[k] = d[k] / div;
  }
  return { sr, d };
}

// Cualquier audio: .wav directo; lo demás con el decodificador del navegador
export async function leerAudio(bytes) {
  if (esWav(bytes)) return leerWav(bytes);
  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('No puedo leer este audio: usá un .wav.');
  const ctx = new Ctx(1, 1, 48000);
  const buf = await ctx.decodeAudioData((bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes)).buffer);
  const n = buf.length, d = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const x = buf.getChannelData(c); for (let k = 0; k < n; k++) d[k] += x[k] / buf.numberOfChannels; }
  return { sr: buf.sampleRate, d };
}

// Un .wav de 16 bits con el audio dado (para escuchar un tramo o mandarle a Rhubarb un audio que no era .wav)
export function hacerWav(sr, d, a = 0, z = d.length) {
  a = Math.max(0, a); z = Math.max(a, Math.min(d.length, z));
  const n = z - a, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const str = (p, s) => { for (let k = 0; k < s.length; k++) dv.setUint8(p + k, s.charCodeAt(k)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let k = 0; k < n; k++) dv.setInt16(44 + k * 2, Math.trunc(Math.min(1, Math.max(-1, d[a + k])) * 32767), true);
  return new Uint8Array(buf);
}

// capas.cortar_wav: solo el tramo de a_s a z_s segundos
export const cortarWav = ({ sr, d }, aS, zS) => hacerWav(sr, d, Math.trunc(aS * sr), Math.trunc(zS * sr));
