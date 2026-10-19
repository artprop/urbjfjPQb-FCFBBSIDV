// En vivo (modo Cara): mientras la camara esta prendida, muestra una cara de BBS con los ojos y/o la boca copiando los tuyos al instante,
// sin grabar ni convertir. Es la misma cuenta que usa la conversion (nucleo/ojos_vivo.js y nucleo/boca_pixel.js).
import * as BP from './nucleo/boca_pixel.js';
import * as OJ from './nucleo/ojos_vivo.js';
import { landmarkerVivo } from './local/deteccion.js';

const $ = (s) => document.querySelector(s);
const CALIBRAR = 40;            // cuadros con la cara quieta para medir tu boca y tus ojos en reposo
let lm = null, activo = false, reloj = 0, ultima = 0, base = null, baseOjos = null, juntar = [], historia = [], skin = null, piel = '#ffa854', raf = 0;
let ultBoca = null, estOjos = OJ.nuevoEstado();

const ver = () => ({ ojos: $('#vivo-ojos').checked, boca: $('#vivo-boca').checked });
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
  const p = d.data.subarray((5 * 8 + 1) * 4);   // piel de la mejilla: con este color se tapan los ojos pintados y se cierran los parpados
  piel = `rgb(${p[0]},${p[1]},${p[2]})`;
  skin = d;
  return skin;
}

// Dibuja la cara completa: skin, y encima la boca y/o los ojos que se hayan elegido ver.
function pintar() {
  if (!skin) return;
  const cv = $('#vivo-lienzo'), ctx = cv.getContext('2d'), u = cv.width / 8, v = ver();
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = skin.data.subarray((y * 8 + x) * 4);
    ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; ctx.fillRect(x * u, y * u, u, u);
  }
  if (v.ojos) OJ.dibujar(ctx, u, estOjos, $('#vivo-ojos-modelo').value, piel);
  const g = v.boca ? (ultBoca || BP.reposo(forma())) : null;
  if (!g) return;
  const f = forma(), n = f.k, C = BP.COLS * n, e = u / n, fila0 = (f.filas === 2 ? 6 : 7) * n;
  for (let r = 0; r < f.filas * n; r++) for (let c = 0; c < C; c++) {
    const x = g[r * C + c]; if (!x) continue;
    ctx.fillStyle = `rgb(${BP.COLORES[x].join(',')})`; ctx.fillRect((n + c) * e, (fila0 + r) * e, e, e);
  }
}

function estado(t) { $('#vivo-estado').textContent = t; }
const LISTO = 'En vivo. Si algo no queda bien con la cara quieta, tocá "Recalibrar".';

export function recalibrar() {
  base = null; baseOjos = null; juntar = []; historia = []; ultBoca = null; estOjos = OJ.nuevoEstado();
  estado('Mirá de frente, con la boca cerrada y quieta un momento…');
}

function bucle(ts) {
  raf = 0;
  if (!activo) return;
  const video = $('#cam');
  if (lm && video.readyState >= 2 && ts - ultima > 33) {
    ultima = ts;
    reloj = Math.max(reloj + 1, Math.round(ts));
    const r = lm.detectForVideo(video, reloj);
    const l = r.faceLandmarks && r.faceLandmarks[0], cats = r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories;
    if (l && cats) {
      const labios = BP.PUNTOS_LABIOS.map((k) => [l[k].x, l[k].y]), pts = OJ.puntos(l), bs = cats.map((c) => c.score);
      const nombres = cats.map((c) => c.categoryName), aspecto = video.videoWidth / video.videoHeight;
      if (!base) {
        juntar.push({ labios, pts, bs });
        if (juntar.length >= CALIBRAR) {
          try { base = BP.calibrarVivo(juntar, nombres, aspecto); baseOjos = OJ.calibrar(juntar, nombres); estado(LISTO); }
          catch (e) { juntar = []; estado('No pude medir tu cara quieta: mirá de frente, cerrá la boca y quedate quieto.'); }
        } else estado(`Midiendo tu cara quieta… ${Math.round((juntar.length / CALIBRAR) * 100)} %`);
      } else {
        const f = forma();
        let g = BP.grillaVivo(base, labios, bs, { ...f, sens: Number($('#boca_sens')?.value || 1) });
        // cada pedacito: mayoria de los ultimos 3 cuadros (igual que la conversion)
        historia.push(g); if (historia.length > 3) historia.shift();
        if (historia.length === 3 && historia.every((h) => h.length === g.length)) {
          const [a, b, c] = historia;
          g = c.map((x, j) => (a[j] === b[j] || a[j] === x ? a[j] : b[j] === x ? b[j] : x));
        }
        ultBoca = g;
        OJ.actualizar(estOjos, OJ.senal(baseOjos, pts, bs, { mirada: Number($('#ojos_mirada')?.value || 1) }),
          { umbral: Number($('#ojos_parpadeo')?.value || 0.5), cejas: $('#ojos_cejas') ? $('#ojos_cejas').checked : true });
        pintar();
        if (!$('#vivo-estado').textContent.startsWith('En vivo')) estado(LISTO);
      }
    } else if (base) estado('No veo tu cara: ponete de frente a la cámara.');
  }
  raf = requestAnimationFrame(bucle);
}

export async function prender(si) {
  activo = si;
  $('#vivo-lado').hidden = !si; $('#vivo-panel').hidden = !si;
  $('#vivo-fab').setAttribute('aria-pressed', String(si)); $('#vivo-fab').classList.toggle('on', si);
  if (!si) { if (raf) cancelAnimationFrame(raf); raf = 0; estado(''); return; }
  await cargarSkin(); pintar();
  if (!$('#cam').srcObject) estado('Prendé la cámara para ver tu cara en vivo.');
  try { estado('Cargando…'); lm = lm || (await landmarkerVivo()); } catch (e) { estado('No se pudo iniciar la detección de la cara: ' + e.message); return; }
  recalibrar();
  if (!raf) raf = requestAnimationFrame(bucle);
}

const GUARDAR = ['vivo-ojos', 'vivo-boca', 'vivo-espejo'];
export function iniciarVivo() {
  try { for (const id of GUARDAR) { const v = localStorage.getItem('mocap_' + id); if (v !== null) $('#' + id).checked = v === '1'; } } catch { /* sin almacenamiento */ }
  const espejo = () => $('#vivo-lienzo').classList.toggle('espejo', $('#vivo-espejo').checked);
  espejo();
  for (const id of GUARDAR) $('#' + id).addEventListener('change', () => {
    try { localStorage.setItem('mocap_' + id, $('#' + id).checked ? '1' : '0'); } catch { /* sin almacenamiento */ }
    espejo(); pintar();
  });
  $('#vivo-fab').addEventListener('click', () => prender(!activo));
  $('#vivo-recalibrar').addEventListener('click', recalibrar);
  $('#vivo-modelo').addEventListener('change', () => { historia = []; ultBoca = null; pintar(); });
  $('#vivo-ojos-modelo').addEventListener('change', () => pintar());
}
