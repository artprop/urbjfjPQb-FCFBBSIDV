// Boca en vivo: mientras la camara esta prendida (modo Cara), muestra la boca de pixeles flexibles copiando tu boca
// al instante, sin grabar ni convertir. Es la misma cuenta que usa la conversion (nucleo/boca_pixel.js).
import * as BP from './nucleo/boca_pixel.js';
import { landmarkerVivo } from './local/deteccion.js';

const $ = (s) => document.querySelector(s);
const CALIBRAR = 40;            // cuadros con la boca quieta para medir tu boca en reposo
let lm = null, activo = false, reloj = 0, ultima = 0, base = null, juntar = [], historia = [], skin = null, raf = 0;

function forma() {
  const [tipo, k] = ($('#vivo-modelo').value || 'Man_2').split('_');
  return BP.describir(`boca_pixel_${tipo}_x${k}`);
}

async function cargarSkin() {
  if (skin) return skin;
  const im = new Image(); im.src = new URL('./skin_default.png', import.meta.url).href;
  await im.decode();
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const g = c.getContext('2d'); g.drawImage(im, 8, 8, 8, 8, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8);
  // los 4 pixeles de labio de la skin pasan a ser piel (los labios los dibuja la boca)
  for (let x = 2; x < 6; x++) for (let j = 0; j < 4; j++) d.data[(6 * 8 + x) * 4 + j] = d.data[(6 * 8 + 1) * 4 + j];
  skin = d;
  return skin;
}

function pintar(g) {
  const cv = $('#vivo-lienzo'), ctx = cv.getContext('2d'), f = forma();
  const n = f.k, C = BP.COLS * n, e = cv.width / (8 * n), fila0 = (f.filas === 2 ? 6 : 7) * n;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = skin.data.subarray((y * 8 + x) * 4);
    ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; ctx.fillRect(x * e * n, y * e * n, e * n, e * n);
  }
  if (!g) return;
  for (let r = 0; r < f.filas * n; r++) for (let c = 0; c < C; c++) {
    const v = g[r * C + c]; if (!v) continue;
    ctx.fillStyle = `rgb(${BP.COLORES[v].join(',')})`; ctx.fillRect((n + c) * e, (fila0 + r) * e, e, e);
  }
}

function estado(t) { $('#vivo-estado').textContent = t; }

export function recalibrar() { base = null; juntar = []; historia = []; estado('Dejá la boca cerrada y quieta un momento…'); }

function bucle(ts) {
  raf = 0;
  if (!activo) return;
  const v = $('#cam');
  if (lm && v.readyState >= 2 && ts - ultima > 33) {
    ultima = ts;
    reloj = Math.max(reloj + 1, Math.round(ts));
    const r = lm.detectForVideo(v, reloj);
    const l = r.faceLandmarks && r.faceLandmarks[0], cats = r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories;
    if (l && cats) {
      const labios = BP.PUNTOS_LABIOS.map((k) => [l[k].x, l[k].y]), bs = cats.map((c) => c.score);
      const nombres = cats.map((c) => c.categoryName), aspecto = v.videoWidth / v.videoHeight;
      if (!base) {
        juntar.push({ labios, bs });
        if (juntar.length >= CALIBRAR) {
          try { base = BP.calibrarVivo(juntar, nombres, aspecto); estado('En vivo. Si la boca quieta no queda bien, tocá "Recalibrar".'); }
          catch (e) { juntar = []; estado('No pude medir tu boca quieta: cerrala y quedate quieto.'); }
        } else estado(`Midiendo tu boca quieta… ${Math.round((juntar.length / CALIBRAR) * 100)} %`);
      } else {
        const f = forma();
        let g = BP.grillaVivo(base, labios, bs, { ...f, sens: Number($('#boca_sens')?.value || 1) });
        // cada pedacito: mayoria de los ultimos 3 cuadros (igual que la conversion)
        historia.push(g); if (historia.length > 3) historia.shift();
        if (historia.length === 3 && historia.every((h) => h.length === g.length)) {
          const [a, b, c] = historia;
          g = c.map((x, j) => (a[j] === b[j] || a[j] === x ? a[j] : b[j] === x ? b[j] : x));
        }
        pintar(g);
        if (!$('#vivo-estado').textContent.startsWith('En vivo')) estado('En vivo. Si la boca quieta no queda bien, tocá "Recalibrar".');
      }
    } else if (base) estado('No veo tu cara: ponete de frente a la cámara.');
  }
  raf = requestAnimationFrame(bucle);
}

export async function prender(si) {
  activo = si;
  $('#vivo-panel').classList.toggle('apagado', !si);
  if (!si) { if (raf) cancelAnimationFrame(raf); raf = 0; estado(''); return; }
  await cargarSkin(); pintar(null);
  if (!$('#cam').srcObject) { estado('Prendé la cámara para ver tu boca en vivo.'); }
  try { estado('Cargando…'); lm = lm || (await landmarkerVivo()); } catch (e) { estado('No se pudo iniciar la detección de la cara: ' + e.message); return; }
  recalibrar();
  if (!raf) raf = requestAnimationFrame(bucle);
}

export function iniciarVivo() {
  $('#vivo-chk').addEventListener('change', (e) => prender(e.target.checked));
  $('#vivo-recalibrar').addEventListener('click', recalibrar);
  $('#vivo-modelo').addEventListener('change', () => { historia = []; cargarSkin().then(() => pintar(null)); });
}
