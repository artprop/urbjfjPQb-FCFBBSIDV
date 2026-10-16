// Análisis del volumen de la voz (port de capas.py: segmentos_voz y cerrar_por_volumen) y la "boca simple"
// para cuando no está Rhubarb (celular). Las cuentas copian a numpy en float32 para dar los mismos números.
import { pyRound, arange, promedioF32, medianaF32, percentilF32, log10F32, sqrtF32 } from './py.js';

const f32 = Math.fround;

// volumen (dB) de d[a:z] como lo calcula numpy: 20*log10(sqrt(mean(x**2)) + extra)
function cuadrados(d, a, z) {
  const n = Math.max(0, z - a), q = new Float32Array(n);
  for (let k = 0; k < n; k++) { const v = d[a + k]; q[k] = v * v; }
  return q;
}

// Tramos con voz (segundos del audio) entre desdeS y hastaS, por energía
export function segmentosVoz({ sr, d }, desdeS, hastaS, gapMax = 0.30, minDur = 0.15, margen = 0.05) {
  const a = Math.max(0, Math.trunc(desdeS * sr)), z = Math.min(d.length, Math.trunc(hastaS * sr));
  if (z - a < sr * 0.05) return [];
  const paso = Math.trunc(sr * 0.02);
  const n = Math.floor((z - a) / paso);
  if (n < 3) return [];
  const db = new Float32Array(n), e12 = f32(1e-12);
  for (let i = 0; i < n; i++) {
    const q = cuadrados(d, a + i * paso, a + (i + 1) * paso);
    db[i] = f32(20 * log10F32(sqrtF32(f32(promedioF32(q) + e12))));
  }
  const piso = percentilF32(db, 10), alto = percentilF32(db, 98);
  const umbral = Math.max(f32(piso + f32(f32(0.35) * f32(alto - piso))), f32(alto - 45));
  const segs = [];
  for (let i = 0; i < n;) {
    if (db[i] > umbral) {
      let j = i;
      while (j < n && db[j] > umbral) j++;
      segs.push([i * 0.02, j * 0.02]); i = j;
    } else i++;
  }
  const unidos = [];
  for (const s of segs) {
    if (unidos.length && s[0] - unidos[unidos.length - 1][1] <= gapMax) unidos[unidos.length - 1][1] = s[1];
    else unidos.push(s);
  }
  const out = [];
  for (const [s0, s1] of unidos) {
    if (s1 - s0 >= minDur) out.push([pyRound(Math.max(0, desdeS + s0 - margen), 2), pyRound(Math.min(hastaS, desdeS + s1 + margen), 2)]);
  }
  return out;
}

// dB de cada paso de 1 tick (0,05 s) entre aS y zS
export function volumenPorPaso({ sr, d }, aS, zS, paso = 0.05) {
  const pasos = arange(aS, zS, paso);
  const db = new Float32Array(pasos.length), e9 = f32(1e-9);
  for (let k = 0; k < pasos.length; k++) {
    const s = pasos[k];
    const q = cuadrados(d, Math.trunc(s * sr), Math.min(d.length, Math.trunc((s + paso) * sr)));
    db[k] = f32(20 * log10F32(f32(sqrtF32(promedioF32(q)) + e9)));
  }
  return { pasos, db };
}

// Rhubarb deja la boca abierta en las pausas cortas: donde la voz cae más de caidaDb debajo de la mitad del tramo, se cierra (forma A)
export function cerrarPorVolumen(audio, cues, aS, zS, caidaDb = 12.0, paso = 0.05) {
  const { pasos, db } = volumenPorPaso(audio, aS, zS, paso);
  if (!pasos.length) return [];
  const umbral = medianaF32(db) - caidaDb;
  const out = [];
  let j = 0;
  for (let k = 0; k < pasos.length; k++) {
    const s = pasos[k], v = db[k];
    while (j < cues.length && cues[j].end <= s + paso / 2) j++;
    let forma = j < cues.length && cues[j].start <= s + paso / 2 ? cues[j].value : 'X';
    if (v < umbral && forma !== 'X') forma = 'A';
    const ult = out[out.length - 1];
    if (ult && ult.value === forma) ult.end = pyRound(Math.min(zS, s + paso), 3);
    else out.push({ start: pyRound(s, 3), end: pyRound(Math.min(zS, s + paso), 3), value: forma });
  }
  return out;
}

// Boca simple (sin Rhubarb, en el celular): en cada tick con voz alterna formas abiertas según el volumen.
// No sabe qué vocal se dice: solo abre y cierra al ritmo de la voz. Devuelve formas como las de Rhubarb.
export function bocaSimple(audio, aS, zS, paso = 0.05) {
  const { pasos, db } = volumenPorPaso(audio, aS, zS, paso);
  if (!pasos.length) return [];
  const med = medianaF32(db);
  const out = [];
  let alterna = 0, previa = 'X';
  for (let k = 0; k < pasos.length; k++) {
    const v = db[k];
    let forma;
    if (!(v >= med - 12)) forma = 'A';                  // casi silencio: cerrada
    else if (v >= med + 4) forma = 'D';                 // fuerte: bien abierta
    else if (v >= med - 3) forma = ['C', 'E', 'C', 'B'][alterna % 4];   // normal: va cambiando
    else forma = 'B';                                   // bajito: apenas abierta
    // que no quede la misma forma abierta mucho tiempo: cada 3 ticks cambia
    if (forma !== 'A' && forma === previa && k >= 2 && out.length && pasos[k] - out[out.length - 1].start >= 0.15 - 1e-9) {
      alterna++; forma = forma === 'C' ? 'E' : (forma === 'E' ? 'C' : (forma === 'D' ? 'C' : 'D'));
    }
    if (forma !== previa) alterna++;
    const ult = out[out.length - 1], fin = pyRound(Math.min(zS, pasos[k] + paso), 3);
    if (ult && ult.value === forma) ult.end = fin;
    else out.push({ start: pyRound(pasos[k], 3), end: fin, value: forma });
    previa = forma;
  }
  return out;
}
