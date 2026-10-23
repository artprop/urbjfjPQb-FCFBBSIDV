// Deteccion con MediaPipe dentro del navegador (PC y celular, sin internet): cuerpo (PoseLandmarker), cara
// (FaceLandmarker) y manos (HandLandmarker) sobre un video. Hace lo mismo que pose_video.py y cara_video.py del programa de PC.
import { PUNTOS } from '../nucleo/ojos.js';
import { PUNTOS_BOCA } from '../nucleo/boca.js';
import { PUNTOS_LABIOS } from '../nucleo/boca_pixel.js';
import { recorrerCuadros } from './cuadros.js';
import { curlsDeMano, DEDOS } from '../nucleo/dedos.js';

const BASE = new URL('..', import.meta.url).href;   // carpeta www/
const MODELOS = { rapida: 'pose_landmarker_lite.task', normal: 'pose_landmarker_full.task', alta: 'pose_landmarker_heavy.task' };
let vision = null, archivos = null;
const cache = {};

async function cargarVision() {
  if (!vision) {
    vision = await import(BASE + 'mediapipe/vision_bundle.mjs');
    archivos = await vision.FilesetResolver.forVisionTasks(BASE + 'mediapipe/wasm');
  }
  return vision;
}

async function crear(tipo, opciones) {
  const v = await cargarVision();
  const Clase = tipo === 'cara' ? v.FaceLandmarker : tipo === 'manos' ? v.HandLandmarker : v.PoseLandmarker;
  try {
    return await Clase.createFromOptions(archivos, { ...opciones, baseOptions: { ...opciones.baseOptions, delegate: 'GPU' } });
  } catch (e) {
    return Clase.createFromOptions(archivos, { ...opciones, baseOptions: { ...opciones.baseOptions, delegate: 'CPU' } });
  }
}

export async function landmarkerPose(calidad = 'normal', modo = 'VIDEO') {
  // si falta el archivo de calidad alta (pesa 30 MB, puede no estar copiado) se usa la normal
  if (calidad === 'alta' && !(await fetch(BASE + 'modelos/' + MODELOS.alta, { method: 'HEAD' }).then((r) => r.ok).catch(() => false))) calidad = 'normal';
  const k = `pose_${calidad}_${modo}`;
  if (!cache[k]) {
    cache[k] = crear('pose', {
      baseOptions: { modelAssetPath: BASE + 'modelos/' + MODELOS[calidad] },
      runningMode: modo, numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
  }
  return cache[k];
}

async function landmarkerCara() {
  if (!cache.cara) {
    cache.cara = crear('cara', {
      baseOptions: { modelAssetPath: BASE + 'modelos/face_landmarker.task' },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
  }
  return cache.cara;
}

// Manos: hasta 2. modo 'VIDEO' para analizar tomas; 'vivo' es otra instancia (con su propio reloj) para la camara.
export async function landmarkerManos(modo = 'VIDEO') {
  const k = 'manos_' + modo;
  if (!cache[k]) {
    cache[k] = crear('manos', {
      baseOptions: { modelAssetPath: BASE + 'modelos/hand_landmarker.task' },
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
  }
  return cache[k];
}

/**
 * Lo que se ve de las manos en un resultado de HandLandmarker: { L: [pulgar..menique] o null, R: ... } (0 = estirado,
 * 1 = cerrado), con L/R = mano izquierda/derecha DE LA PERSONA. MediaPipe supone la imagen espejada (selfie): en un video
 * sin espejar (como los analiza el Mocap) su «Left» es la mano derecha de la persona.
 */
export function dedosDeResultado(r, espejada = false) {
  const out = { L: null, R: null };
  (r.worldLandmarks || []).forEach((w, i) => {
    const etiqueta = (((r.handednesses || r.handedness || [])[i] || [])[0] || {}).categoryName;
    if (!etiqueta) return;
    const lado = (etiqueta === 'Left') === espejada ? 'L' : 'R';
    const P = w.map((p) => [p.x, p.y, p.z]);
    out[lado] = curlsDeMano({ muneca: P[0], dedos: Object.fromEntries(DEDOS.map((k, j) => [k, j === 0 ? [P[1], P[2], P[3], P[4]] : [1, 2, 3, 4].map((q) => P[j * 4 + q])])) });
  });
  return out;
}

// Otra instancia para la boca en vivo (camara): usa su propio reloj y no se mezcla con el analisis de videos.
export async function landmarkerVivo() {
  if (!cache.vivo) {
    cache.vivo = crear('cara', {
      baseOptions: { modelAssetPath: BASE + 'modelos/face_landmarker.task' },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
  }
  return cache.vivo;
}

// Recorre los cuadros del video uno por uno: fn(lienzo, tiempo_s). El video se pausa en cada cuadro mientras se analiza.
async function recorrerVideo(blob, espejo, fn, progreso, duracionInfo = 0) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  await new Promise((ok, mal) => { video.onloadeddata = ok; video.onerror = () => mal(new Error('No se pudo abrir el video (formato no compatible con este dispositivo).')); });
  const W = video.videoWidth, H = video.videoHeight;
  const escala = Math.min(1, 1280 / Math.max(W, H));          // en el celular los videos 4K se achican
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(W * escala); lienzo.height = Math.round(H * escala);
  const g = lienzo.getContext('2d', { willReadFrequently: false });
  const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : duracionInfo;
  let ultimo = -1, n = 0;

  const procesar = (t) => {
    g.save();
    if (espejo) { g.translate(lienzo.width, 0); g.scale(-1, 1); }
    g.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    g.restore();
    fn(lienzo, t);
    n++;
    if (progreso && dur) progreso(Math.min(t / dur, 0.99));
  };

  try {
    if ('requestVideoFrameCallback' in video) {
      await new Promise((ok, mal) => {
        const cb = (_, meta) => {
          try {
            video.pause();
            const t = meta.mediaTime;
            if (t > ultimo) { procesar(t); ultimo = t; }
            if (video.ended) return ok();
            video.requestVideoFrameCallback(cb);
            video.play().catch(mal);
          } catch (e) { mal(e); }
        };
        video.onended = () => setTimeout(ok, 50);
        video.requestVideoFrameCallback(cb);
        video.play().catch(mal);
      });
    } else {
      // navegadores viejos: se salta de a 1/30 s
      const paso = 1 / 30;
      for (let t = 0; t <= dur; t += paso) {
        await new Promise((ok) => { video.onseeked = ok; video.currentTime = t; });
        procesar(t);
      }
    }
  } finally {
    video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
  }
  if (progreso) progreso(1);
  return n;
}

// Primero intenta leer cuadro por cuadro exacto (WebCodecs); si el dispositivo no puede, reproduce el video.
async function recorrer(blob, espejo, fn, progreso, duracion, log) {
  try {
    const n = await recorrerCuadros(blob, espejo, fn, progreso);
    if (n !== null) return n;
  } catch (e) {
    throw new Error('Fallo al leer el video: ' + (e.message || e));
  }
  log('Este dispositivo no puede leer el video cuadro por cuadro; uso el metodo lento (puede saltear algunos cuadros).');
  return recorrerVideo(blob, espejo, fn, progreso, duracion);
}

/**
 * Cuerpo: devuelve { world (N x 33 x 3), vis (N x 33), times (N), offset } como pose_video.extract.
 * Se descarta el tramo inicial sin persona; offset = segundo del video donde empieza la animacion.
 */
export async function analizarPose(blob, { calidad = 'normal', espejo = false, progreso = null, log = () => {}, duracion = 0 } = {}) {
  const lm = await landmarkerPose(calidad, 'VIDEO');
  const worlds = [], viss = [], times = [];
  let last = null, msPrev = -1, found = 0;
  const t0 = performance.now();
  const n = await recorrer(blob, espejo, (lienzo, t) => {
    const ms = Math.max(msPrev + 1, Math.round(t * 1000)); msPrev = ms;
    const r = lm.detectForVideo(lienzo, ms);
    let world, vis;
    if (r.worldLandmarks && r.worldLandmarks.length) {
      const w = r.worldLandmarks[0], nl = r.landmarks[0];
      world = w.map((p) => [p.x, p.y, p.z]);
      vis = nl.map((p) => Math.min(p.visibility ?? 0, p.presence ?? 1));
      last = world; found++;
    } else if (last) { world = last; vis = new Array(33).fill(0); }
    else { world = Array.from({ length: 33 }, () => [0, 0, 0]); vis = new Array(33).fill(0); }
    worlds.push(world); viss.push(vis); times.push(t);
  }, progreso, duracion, log);
  log(`Analizados ${n} cuadros en ${Math.round((performance.now() - t0) / 1000)} s; persona detectada en ${found}.`);
  if (!found) throw new Error('No se detecto ninguna persona en el video.');
  const first = viss.findIndex((v) => Math.max(...v) > 0);
  const offset = times[first];
  return {
    world: worlds.slice(first), vis: viss.slice(first), times: times.slice(first).map((t) => t - offset), offset,
  };
}

/** Cara: devuelve { times, bs (N x 52), nombres, pts (N x 17 x 2), boca (N x 8 x 3), labios (N x 25 x 2), aspecto, ok, offset: 0 }. pts como cara_video.extract. */
export async function analizarCara(blob, { espejo = false, progreso = null, log = () => {}, duracion = 0 } = {}) {
  const lm = await landmarkerCara();
  const idx = Object.values(PUNTOS), idxB = Object.values(PUNTOS_BOCA), idxL = PUNTOS_LABIOS;
  let nombres = null, lastBs = null, lastPts = null, lastBoca = null, lastLab = null, msPrev = -1, aspecto = 1;
  const bss = [], ptss = [], bocas = [], labios = [], oks = [], times = [];
  const t0 = performance.now();
  const n = await recorrer(blob, espejo, (lienzo, t) => {
    const ms = Math.max(msPrev + 1, Math.round(t * 1000)); msPrev = ms;
    const r = lm.detectForVideo(lienzo, ms);
    aspecto = lienzo.width / lienzo.height;
    let bs, pts, boca, lab;
    if (r.faceBlendshapes?.length && r.faceLandmarks?.length) {
      const cats = r.faceBlendshapes[0].categories;
      if (!nombres) nombres = cats.map((c) => c.categoryName);
      bs = cats.map((c) => c.score);
      const l = r.faceLandmarks[0];
      pts = idx.map((k) => [l[k].x, l[k].y]);
      boca = idxB.map((k) => [l[k].x, l[k].y, l[k].z]);
      lab = idxL.map((k) => [l[k].x, l[k].y]);
      lastBs = bs; lastPts = pts; lastBoca = boca; lastLab = lab; oks.push(true);
    } else {
      bs = lastBs || new Array(52).fill(0);
      pts = lastPts || idx.map(() => [0, 0]);
      boca = lastBoca || idxB.map(() => [0, 0, 0]);
      lab = lastLab || idxL.map(() => [0, 0]);
      oks.push(false);
    }
    bss.push(bs); ptss.push(pts); bocas.push(boca); labios.push(lab); times.push(t);
  }, progreso, duracion, log);
  const detectada = oks.filter(Boolean).length;
  log(`Cara: ${n} cuadros en ${Math.round((performance.now() - t0) / 1000)} s; detectada en ${detectada}.`);
  if (!detectada) throw new Error('No se detecto ninguna cara en el video.');
  return { times, bs: bss, nombres: nombres || Array.from({ length: 52 }, (_, k) => 'bs' + k), pts: ptss, boca: bocas, labios, aspecto, ok: oks, offset: 0 };
}

/** Manos: { times, L: N x 5 (o null en los cuadros sin esa mano), R, vistas: {L, R} cuadros con cada mano, offset: 0 }. */
export async function analizarManos(blob, { espejo = false, progreso = null, log = () => {}, duracion = 0 } = {}) {
  const lm = await landmarkerManos('VIDEO');
  const times = [], L = [], R = [];
  let msPrev = -1;
  const t0 = performance.now();
  const n = await recorrer(blob, espejo, (lienzo, t) => {
    const ms = Math.max(msPrev + 1, Math.round(t * 1000)); msPrev = ms;
    const d = dedosDeResultado(lm.detectForVideo(lienzo, ms));
    times.push(t); L.push(d.L); R.push(d.R);
  }, progreso, duracion, log);
  const vistas = { L: L.filter(Boolean).length, R: R.filter(Boolean).length };
  log(`Manos: ${n} cuadros en ${Math.round((performance.now() - t0) / 1000)} s; izquierda vista en ${vistas.L}, derecha en ${vistas.R}.`);
  if (!vistas.L && !vistas.R) throw new Error('No se detecto ninguna mano en el video. Mostrá las manos a la cámara, de cerca y con luz.');
  return { times, L, R, vistas, offset: 0 };
}
