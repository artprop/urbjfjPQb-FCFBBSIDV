// Lee TODOS los cuadros de un video, uno por uno y en orden, con su marca de tiempo real (como OpenCV en la PC).
// Usa WebCodecs (decodifica mas rapido que reproducir el video): WebM (lo que graba el navegador) y MP4 (camara del celular).
// Si el dispositivo no puede, devuelve null y se usa el metodo de reproducir el video (deteccion.js).

const BASE = new URL('..', import.meta.url).href;

// ---------------------------------------------------------------- WebM (EBML)
function leerVint(u8, i, conMarca) {
  const b = u8[i];
  let largo = 1, m = 0x80;
  while (largo <= 8 && !(b & m)) { largo++; m >>= 1; }
  if (largo > 8) throw new Error('WebM dañado');
  let v = conMarca ? b : b & (m - 1);
  let desconocido = (b & (m - 1)) === m - 1;
  for (let k = 1; k < largo; k++) { v = v * 256 + u8[i + k]; if (u8[i + k] !== 0xff) desconocido = false; }
  return { v, largo, desconocido: !conMarca && desconocido };
}

const ID = { SEGMENT: 0x18538067, CLUSTER: 0x1F43B675, TRACKS: 0x1654AE6B, TRACK: 0xAE, NUM: 0xD7, TIPO: 0x83, CODEC: 0x86, PRIV: 0x63A2,
  VIDEO: 0xE0, ANCHO: 0xB0, ALTO: 0xBA, INFO: 0x1549A966, ESCALA: 0x2AD7B1, TIEMPO: 0xE7, SIMPLE: 0xA3, GRUPO: 0xA0, BLOQUE: 0xA1 };
const ENTRAR = new Set([ID.SEGMENT, ID.CLUSTER, ID.TRACKS, ID.TRACK, ID.VIDEO, ID.INFO, ID.GRUPO]);

function demuxWebm(u8) {
  const pistas = {}; let pista = null, escala = 1e6, cluster = 0;
  const muestras = [];
  const uint = (i, n) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + u8[i + k]; return v; };
  let i = 0;
  while (i < u8.length - 2) {
    const id = leerVint(u8, i, true); i += id.largo;
    const tam = leerVint(u8, i, false); i += tam.largo;
    const ini = i, fin = tam.desconocido ? u8.length : i + tam.v;
    if (fin > u8.length + 1 && !ENTRAR.has(id.v)) break;   // archivo cortado
    if (ENTRAR.has(id.v)) {
      if (id.v === ID.TRACK) { pista = {}; }
      continue;   // los hijos se leen en el mismo bucle
    }
    switch (id.v) {
      case ID.NUM: pista && (pista.num = uint(ini, tam.v), pistas[pista.num] = pista); break;
      case ID.TIPO: pista && (pista.tipo = uint(ini, tam.v)); break;
      case ID.CODEC: pista && (pista.codec = new TextDecoder().decode(u8.subarray(ini, fin))); break;
      case ID.PRIV: pista && (pista.priv = u8.slice(ini, fin)); break;
      case ID.ANCHO: pista && (pista.ancho = uint(ini, tam.v)); break;
      case ID.ALTO: pista && (pista.alto = uint(ini, tam.v)); break;
      case ID.ESCALA: escala = uint(ini, tam.v); break;
      case ID.TIEMPO: cluster = uint(ini, tam.v); break;
      case ID.SIMPLE: case ID.BLOQUE: {
        const n = leerVint(u8, ini, false);
        let rel = (u8[ini + n.largo] << 8) | u8[ini + n.largo + 1]; if (rel & 0x8000) rel -= 0x10000;
        const flags = u8[ini + n.largo + 2];
        muestras.push({ pista: n.v, us: (cluster + rel) * escala / 1000, clave: id.v === ID.SIMPLE ? Boolean(flags & 0x80) : null,
          datos: u8.subarray(ini + n.largo + 3, fin) });
        break;
      }
      default: break;
    }
    i = fin;
  }
  const v = Object.values(pistas).find((p) => p.tipo === 1);
  if (!v) throw new Error('el WebM no tiene video');
  const c = v.codec;
  let codec, description;
  if (c === 'V_VP8') codec = 'vp8';
  else if (c === 'V_VP9') codec = 'vp09.00.10.08';
  else if (c === 'V_AV1') codec = 'av01.0.04M.08';
  else if (c === 'V_MPEG4/ISO/AVC' && v.priv) { codec = avcCodec(v.priv); description = v.priv; }
  else throw new Error('codec no soportado: ' + c);
  const ms = muestras.filter((m) => m.pista === v.num);
  ms.forEach((m, k) => { if (m.clave === null) m.clave = k === 0; });
  return { codec, description, ancho: v.ancho, alto: v.alto, rotacion: 0, muestras: ms };
}

const hex2 = (n) => n.toString(16).padStart(2, '0');
const avcCodec = (avcC) => `avc1.${hex2(avcC[1])}${hex2(avcC[2])}${hex2(avcC[3])}`;

// ---------------------------------------------------------------- MP4 (mp4box.js)
let mp4boxP = null;
function cargarMp4box() {
  if (!mp4boxP) {
    mp4boxP = new Promise((ok, mal) => {
      if (globalThis.MP4Box) return ok(globalThis.MP4Box);
      const s = document.createElement('script');
      s.src = BASE + 'mediapipe/mp4box.all.min.js';
      s.onload = () => ok(globalThis.MP4Box); s.onerror = () => mal(new Error('no se pudo cargar mp4box'));
      document.head.appendChild(s);
    });
  }
  return mp4boxP;
}

async function demuxMp4(buf) {
  const MP4Box = await cargarMp4box();
  return new Promise((ok, mal) => {
    const f = MP4Box.createFile();
    const muestras = []; let pista = null, info = null;
    f.onError = (e) => mal(new Error('MP4 dañado: ' + e));
    f.onReady = (inf) => {
      info = inf; pista = inf.videoTracks[0];
      if (!pista) return mal(new Error('el MP4 no tiene video'));
      f.setExtractionOptions(pista.id, null, { nbSamples: Infinity });
      f.start();
    };
    f.onSamples = (_, __, ss) => {
      for (const s of ss) muestras.push({ us: (s.cts * 1e6) / s.timescale, dts: s.dts, clave: s.is_sync, datos: s.data, dur: (s.duration * 1e6) / s.timescale });
    };
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    ab.fileStart = 0;
    f.appendBuffer(ab); f.flush();
    if (!pista) return mal(new Error('no se pudo leer el MP4'));
    const trak = f.getTrackById(pista.id);
    let description;
    for (const e of trak.mdia.minf.stbl.stsd.entries) {
      const caja = e.avcC || e.hvcC || e.vpcC || e.av1C;
      if (caja) {
        const DS = MP4Box.DataStream || globalThis.DataStream;
        const ds = new DS(undefined, 0, DS.BIG_ENDIAN);
        caja.write(ds);
        description = new Uint8Array(ds.buffer, 8);   // sin el encabezado de la caja
      }
    }
    // rotacion del celular (matriz de la pista): 90/180/270
    const m = pista.matrix || [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];
    const ang = Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI);
    const rotacion = ((ang % 360) + 360) % 360;
    muestras.sort((a, b) => a.dts - b.dts);
    ok({ codec: pista.codec, description, ancho: pista.video.width, alto: pista.video.height, rotacion, muestras });
  });
}

// ---------------------------------------------------------------- decodificar
/**
 * Recorre todos los cuadros: fn(lienzo, segundos). Devuelve la cantidad de cuadros, o null si este dispositivo no puede
 * (sin WebCodecs o formato raro): en ese caso hay que usar el otro metodo.
 */
export const _demux = (u8) => (u8[0] === 0x1a ? demuxWebm(u8) : demuxMp4(u8));   // para pruebas

export async function recorrerCuadros(blob, espejo, fn, progreso) {
  if (typeof VideoDecoder === 'undefined') return null;
  const u8 = new Uint8Array(await blob.arrayBuffer());
  let d;
  try {
    const esWebm = u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3;
    d = esWebm ? demuxWebm(u8) : await demuxMp4(u8);
  } catch (e) { console.warn('demux:', e); return null; }
  if (!d.muestras.length) return null;
  const cfg = { codec: d.codec, ...(d.description ? { description: d.description } : {}), optimizeForLatency: true };
  try {
    const s = await VideoDecoder.isConfigSupported(cfg);
    if (!s.supported) { console.warn('codec no soportado', cfg.codec); return null; }
  } catch (e) { return null; }

  const rot = d.rotacion;
  const W0 = d.ancho, H0 = d.alto, girado = rot === 90 || rot === 270;
  const escala = Math.min(1, 1280 / Math.max(W0, H0));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round((girado ? H0 : W0) * escala); lienzo.height = Math.round((girado ? W0 : H0) * escala);
  const g = lienzo.getContext('2d');
  const total = d.muestras.length, t0 = Math.min(...d.muestras.slice(0, 30).map((m) => m.us), 0) < 0 ? Math.min(...d.muestras.map((m) => m.us)) : 0;
  let n = 0, error = null;

  const dec = new VideoDecoder({
    output: (frame) => {
      try {
        if (!error) {
          g.save();
          g.translate(lienzo.width / 2, lienzo.height / 2);
          if (espejo) g.scale(-1, 1);
          g.rotate(rot * Math.PI / 180);
          const w = W0 * escala, h = H0 * escala;
          g.drawImage(frame, -w / 2, -h / 2, w, h);
          g.restore();
          fn(lienzo, (frame.timestamp - t0) / 1e6);
          n++;
          if (progreso) progreso(Math.min(n / total, 0.99));
        }
      } catch (e) { error = e; }
      frame.close();
    },
    error: (e) => { error = e; },
  });
  dec.configure(cfg);
  for (const m of d.muestras) {
    if (error) break;
    dec.decode(new EncodedVideoChunk({ type: m.clave ? 'key' : 'delta', timestamp: Math.round(m.us), duration: m.dur ? Math.round(m.dur) : undefined, data: m.datos }));
    if (dec.decodeQueueSize > 8) await new Promise((ok) => dec.addEventListener('dequeue', ok, { once: true }));
  }
  if (!error) { try { await dec.flush(); } catch (e) { error = error || e; } }
  try { dec.close(); } catch (e) { /* ya cerrado */ }
  if (error) {
    if (n === 0) { console.warn('decodificar:', error); return null; }
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (progreso) progreso(1);
  return n;
}
