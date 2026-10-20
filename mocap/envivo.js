// En vivo (modo Cara): mientras la camara esta prendida, muestra una cara de BBS con los ojos y/o la boca copiando los tuyos al instante,
// sin grabar ni convertir. Es la misma cuenta que usa la conversion (nucleo/ojos_vivo.js y nucleo/boca_pixel.js).
import * as BP from './nucleo/boca_pixel.js';
import * as OJ from './nucleo/ojos_vivo.js';
import * as BO from './nucleo/boca.js';
import * as MU from './nucleo/muecas.js';
import * as AR from './nucleo/arrugas.js';
import * as UI from './muecas_ui.js';
import { landmarkerVivo } from './local/deteccion.js';

const $ = (s) => document.querySelector(s);
const COLS_BOCA = BP.COLS;
const CALIBRAR = 40;            // cuadros con la cara quieta para medir tu boca y tus ojos en reposo
let lm = null, activo = false, reloj = 0, ultima = 0, base = null, baseOjos = null, baseForma = null, juntar = [], historia = [], formas = [], forma0 = 'cerrada', skin = null, skin0 = null, capa2 = null, offOjos = [0, 0], imBoca = null, piel = '#ffa854', raf = 0;
let ultBoca = null, estOjos = OJ.nuevoEstado(), baseBs = null, estArr = AR.nuevoEstado(), ultRasgos = null, muecaId = null, votosMueca = [];

const escalaArrugas = () => { const e = $('#vivo-arrugas-escala'); const k = e ? Number(e.value) : 0; return k === 2 || k === 4 ? k : 0; };   // 0 = sin arrugas (nunca x1)
const ver = () => ({ ojos: $('#vivo-ojos').checked, boca: $('#vivo-boca').checked, arrugas: $('#vivo-arrugas') ? $('#vivo-arrugas').checked : false });
/** El gesto de la boca que estas haciendo ahora (rasgos de MediaPipe sin tu cara en reposo), para guardarlo en una mueca. */
export const gestoActual = () => (activo && base && ultRasgos ? { ...ultRasgos } : null);
const medianaPorColumna = (filas) => filas[0].map((_, j) => { const v = filas.map((f) => f[j]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; });
const modoBoca = () => $('#vivo-boca-modo').value;           // 'pre' = formas prediseñadas (boca_Man / boca_Woman), 'vivo' = boca de pixeles, 'muecas' = la mueca de referencia que mas se parece
const modoOjos = () => $('#ojos_modo').value || 'poses';      // 'poses' = prediseñadas (a saltos), 'vivo' = siguen tu cara
function forma() {
  const [tipo, k] = ($('#vivo-modelo').value || 'Man_2').split('_');
  const f = BP.describir(`boca_pixel_${tipo}_x${k}`);
  return { ...f, labios: f.labios && $('#vivo-labios').checked };
}
// dibujo de cada forma de boca en Boca.png (64x16, un cuadro de 8x8 por forma); el de mujer esta en la fila de abajo
const UV_BOCA = {
  Man: { a: [0, 0], e: [8, 0], i: [16, 0], o: [24, 0], u: [32, 0], s: [40, 0], s2: [48, 0], s3: [56, 0] },
  Woman: { a: [0, 8], e: [8, 8], i: [16, 8], o: [24, 8], u: [32, 8], s: [40, 8], s2: [48, 8], s3: [48, 8] },
};
// una forma prediseñada ('a', 'e', ... ; 'cerrada' = nada) de boca_Man / boca_Woman encima de la cara; ctx = lienzo de la cara, ancho = su lado
export function dibujarFormaBoca(ctx, im, tipo, formaBoca, ancho) {
  const uv = (UV_BOCA[tipo] || UV_BOCA.Man)[formaBoca];
  if (!im || !uv) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, uv[0], uv[1], 8, 8, 0, 0, ancho, ancho);
}
async function cargarBoca() {
  if (imBoca) return;
  const im = new Image(); im.src = new URL('./datos/boca/Boca.png', import.meta.url).href;
  await im.decode(); imBoca = im;
}

// Skin de la cara: la que se eligio en esta pantalla o en la Vista 3D (se guarda en el navegador como "skin3d"); si no, la de por defecto.
const guardada = () => { try { return localStorage.getItem('skin3d'); } catch { return null; } };
async function imagenSkin(url) {
  const im = new Image(); im.src = url;
  await im.decode();
  if (im.width !== 64 || im.height !== 64) throw new Error(`La skin tiene que ser de 64×64 píxeles (esta es de ${im.width}×${im.height}).`);
  return im;
}
async function cargarSkin(recargar = false) {
  if (skin && !recargar) return skin;
  const propia = guardada();
  let im, usada = propia ? 'propia' : 'defecto';
  try { im = await imagenSkin(propia || new URL('./skin_default.png', import.meta.url).href); }
  catch (e) { if (!propia) throw e; im = await imagenSkin(new URL('./skin_default.png', import.meta.url).href); usada = 'defecto'; }
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const g = c.getContext('2d'); g.drawImage(im, 8, 8, 8, 8, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8);
  skin0 = new ImageData(new Uint8ClampedArray(d.data), 8, 8);   // la skin tal cual (con sus labios pintados)
  // los 4 pixeles de labio de la skin pasan a ser piel (los labios los dibuja la boca)
  for (let x = 2; x < 6; x++) for (let j = 0; j < 4; j++) d.data[(6 * 8 + x) * 4 + j] = d.data[(6 * 8 + 1) * 4 + j];
  const p = d.data.subarray((5 * 8 + 1) * 4);   // piel de la mejilla: con este color se tapan los ojos pintados y se cierran los parpados
  piel = `rgb(${p[0]},${p[1]},${p[2]})`;
  skin = d;
  capa2 = document.createElement('canvas'); capa2.width = 8; capa2.height = 8;   // segunda capa de la cara (pelo, gorro): va por encima de todo
  capa2.getContext('2d').drawImage(im, 40, 8, 8, 8, 0, 0, 8, 8);
  try { offOjos = JSON.parse(localStorage.getItem('ojospos_' + usada)) || [0, 0]; } catch { offOjos = [0, 0]; }   // los mismos ajustes de ojos de la Vista 3D
  return skin;
}

// Dibuja la cara completa: skin, y encima la boca y/o los ojos que se hayan elegido ver.
function pintar() {
  if (!skin) return;
  pintarBase();
  if (capa2) { const cv = $('#vivo-lienzo'), ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(capa2, 0, 0, cv.width, cv.height); }
}
function pintarBase() {
  const cv = $('#vivo-lienzo'), ctx = cv.getContext('2d'), u = cv.width / 8, v = ver();
  const pre = v.boca && modoBoca() === 'pre';
  const d = pre ? skin0 : skin;   // con la boca prediseñada se ven los labios pintados de la skin; con la de pixeles los dibuja la boca
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = d.data.subarray((y * 8 + x) * 4);
    ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; ctx.fillRect(x * u, y * u, u, u);
  }
  if (v.arrugas && v.boca) {   // arrugas: solo adentro del segmento de la boca (6 x 2 pixeles de la cara; 6 x 1 en la mujer), con su propia escala
    const kw = escalaArrugas(), filas = forma().filas, fila = filas === 2 ? 6 : 7;
    if (kw) for (const a of AR.pixeles(estArr, kw, filas)) {
      const px = 1 + Math.floor(a.c / kw), py = fila + Math.floor(a.r / kw), p = d.data.subarray((py * 8 + px) * 4);
      const [r, g, b] = AR.oscurecer([p[0], p[1], p[2]], a.n);
      ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect((1 + a.c / kw) * u, (fila + a.r / kw) * u, u / kw, u / kw);
    }
  }
  if (v.ojos) OJ.dibujar(ctx, u, estOjos, $('#vivo-ojos-modelo').value, piel, offOjos);
  if (pre) {
    dibujarFormaBoca(ctx, imBoca, $('#vivo-modelo').value.startsWith('Woman') ? 'Woman' : 'Man', forma0, cv.width);
    return;
  }
  const g = v.boca ? (ultBoca || BP.reposo(forma())) : null;
  if (!g) return;
  const f = forma(), n = f.k, C = BP.COLS * n, e = u / n, fila0 = (f.filas === 2 ? 6 : 7) * n;
  for (let r = 0; r < f.filas * n; r++) for (let c = 0; c < C; c++) {
    const x = g[r * C + c]; if (!x) continue;
    ctx.fillStyle = `rgb(${BP.colorDe(x).join(',')})`; ctx.fillRect((n + c) * e, (fila0 + r) * e, e, e);
  }
}

// de donde se mira la cara: la camara, o la toma grabada cuando se la esta reproduciendo (asi se ve la grabacion y la cara a la vez)
const fuente = () => { const r = $('#reproductor'); return r && !r.hidden && r.readyState >= 2 ? r : $('#cam'); };
let fuenteAnt = null;
const espejar = () => $('#vivo-lienzo').classList.toggle('espejo', $('#vivo-espejo').checked && fuente() === $('#cam'));   // la toma grabada no esta espejada

function estado(t) { $('#vivo-estado').textContent = t; }
const LISTO = 'En vivo. Si algo no queda bien con la cara quieta, tocá "Recalibrar".';

export function recalibrar() {
  base = null; baseOjos = null; baseForma = null; juntar = []; historia = []; formas = []; forma0 = 'cerrada'; ultBoca = null; estOjos = OJ.nuevoEstado(); baseBs = null; estArr = AR.nuevoEstado(); ultRasgos = null; muecaId = null; votosMueca = [];
  estado('Mirá de frente, con la boca cerrada y quieta un momento…');
}

function bucle(ts) {
  raf = 0;
  if (!activo) return;
  const video = fuente();
  if (video !== fuenteAnt) { const habia = fuenteAnt; fuenteAnt = video; espejar(); if (habia) recalibrar(); }   // otra fuente: se mide de nuevo la cara quieta
  if (lm && video.readyState >= 2 && ts - ultima > 33) {
    ultima = ts;
    reloj = Math.max(reloj + 1, Math.round(ts));
    const r = lm.detectForVideo(video, reloj);
    const l = r.faceLandmarks && r.faceLandmarks[0], cats = r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories;
    if (l && cats) {
      const labios = BP.PUNTOS_LABIOS.map((k) => [l[k].x, l[k].y]), pts = OJ.puntos(l), bs = cats.map((c) => c.score);
      const boca = Object.values(BO.PUNTOS_BOCA).map((k) => [l[k].x, l[k].y, l[k].z]);
      const nombres = cats.map((c) => c.categoryName), aspecto = video.videoWidth / video.videoHeight;
      if (!base) {
        juntar.push({ labios, pts, bs, boca });
        if (juntar.length >= CALIBRAR) {
          try { base = BP.calibrarVivo(juntar, nombres, aspecto); baseBs = medianaPorColumna(juntar.map((j) => j.bs)); baseOjos = OJ.calibrar(juntar, nombres); baseForma = BO.calibrarVivo(juntar, nombres, aspecto); estado(LISTO); }
          catch (e) { juntar = []; estado('No pude medir tu cara quieta: mirá de frente, cerrá la boca y quedate quieto.'); }
        } else estado(`Midiendo tu cara quieta… ${Math.round((juntar.length / CALIBRAR) * 100)} %`);
      } else {
        const f = forma();
        const sens = Number($('#boca_sens')?.value || 1);
        let g = BP.grillaVivo(base, labios, bs, { ...f, sens, fino: ($('#boca_estilo') || {}).value === 'fino' });
        // cada pedacito: mayoria de los ultimos 3 cuadros (igual que la conversion)
        historia.push(g); if (historia.length > 3) historia.shift();
        if (historia.length === 3 && historia.every((h) => h.length === g.length)) {
          const [a, b, c] = historia;
          g = c.map((x, j) => (a[j] === b[j] || a[j] === x ? a[j] : b[j] === x ? b[j] : x));
        }
        ultBoca = g;
        // gesto y muecas: rasgos de la boca sin tu cara en reposo
        ultRasgos = MU.rasgos(bs, nombres, baseBs);
        const [dx, dy] = BP.corrimientoVivo(base, labios);
        AR.actualizar(estArr, AR.intensidades(ultRasgos, dx, dy));
        if (modoBoca() === 'muecas') {
          const lista = UI.listaReconocimiento();
          votosMueca.push(MU.reconocer(ultRasgos, lista, muecaId)); if (votosMueca.length > 4) votosMueca.shift();
          const cuenta = {}; for (const x of votosMueca) cuenta[x] = (cuenta[x] || 0) + 1;
          muecaId = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0][0];
          const gm = UI.grillaDe(muecaId), { k, filas } = UI.modelo();
          if (gm && gm.length === filas * k * COLS_BOCA * k) ultBoca = f.labios ? gm : gm.map((x) => (x === BP.LABIO ? 0 : x));
          UI.resaltar(muecaId);
        } else UI.resaltar(null);
        // forma prediseñada (a, e, i, o, u...): la que mas se repite en los ultimos 4 cuadros
        formas.push(BO.formaVivo(baseForma, boca, bs, sens)); if (formas.length > 4) formas.shift();
        const voto = {}; for (const x of formas) voto[x] = (voto[x] || 0) + 1;
        forma0 = Object.entries(voto).sort((a, b) => b[1] - a[1])[0][0];
        OJ.actualizar(estOjos, OJ.senal(baseOjos, pts, bs, { mirada: Number($('#ojos_mirada')?.value || 1) }),
          { umbral: Number($('#ojos_parpadeo')?.value || 0.5), cejas: $('#ojos_cejas') ? $('#ojos_cejas').checked : true, modo: modoOjos() });
        pintar();
        if (!$('#vivo-estado').textContent.startsWith('En vivo')) estado(LISTO);
      }
    } else if (base) estado('No veo tu cara: ponete de frente a la cámara.');
  }
  raf = requestAnimationFrame(bucle);
}

export const estaPrendido = () => activo;
export async function prender(si) {
  activo = si;
  $('#vivo-lado').hidden = !si; $('#vivo-panel').hidden = !si;
  $('#vivo-fab').setAttribute('aria-pressed', String(si)); $('#vivo-fab').classList.toggle('on', si);
  if (!si) { if (raf) cancelAnimationFrame(raf); raf = 0; estado(''); return; }
  await Promise.all([cargarSkin(), cargarBoca()]); pintar();
  if (!$('#cam').srcObject) estado('Prendé la cámara para ver tu cara en vivo.');
  try { estado('Cargando…'); lm = lm || (await landmarkerVivo()); } catch (e) { estado('No se pudo iniciar la detección de la cara: ' + e.message); return; }
  recalibrar();
  if (!raf) raf = requestAnimationFrame(bucle);
}

const GUARDAR = ['vivo-ojos', 'vivo-boca', 'vivo-espejo', 'vivo-arrugas'];
// el modo de los ojos y los labios son ajustes de la conversion (paso 2): los controles de aca arriba los copian y viceversa
const PROXY = [['vivo-boca-estilo', 'boca_estilo', 'value'], ['vivo-ojos-modo', 'ojos_modo', 'value'], ['vivo-labios', 'boca_labios', 'checked'], ['vivo-arrugas-escala', 'arrugas_escala', 'value'], ['vivo-modelo', 'modelo_boca', 'value']];
export function sincronizar() {
  for (const [vivo, paso2, prop] of PROXY) { const a = $('#' + paso2), b = $('#' + vivo); if (a && b) b[prop] = a[prop]; }
  $('#vivo-labios').disabled = modoBoca() === 'pre';
  pintar();
}
export function iniciarVivo() {
  try {
    for (const id of GUARDAR) { const v = localStorage.getItem('mocap_' + id); if (v !== null) $('#' + id).checked = v === '1'; }
    const m = localStorage.getItem('mocap_vivo-boca-modo'); if (m === 'pre' || m === 'vivo' || m === 'muecas') $('#vivo-boca-modo').value = m;
  } catch { /* sin almacenamiento */ }
  const espejo = espejar;
  espejo();
  for (const id of GUARDAR) $('#' + id).addEventListener('change', () => {
    try { localStorage.setItem('mocap_' + id, $('#' + id).checked ? '1' : '0'); } catch { /* sin almacenamiento */ }
    espejo(); pintar();
  });
  for (const [vivo, paso2, prop] of PROXY) {
    $('#' + vivo).addEventListener('change', () => { const a = $('#' + paso2); a[prop] = $('#' + vivo)[prop]; a.dispatchEvent(new Event('change', { bubbles: true })); pintar(); });
    $('#' + paso2).addEventListener('change', sincronizar);
  }
  $('#vivo-boca-modo').addEventListener('change', () => {
    try { localStorage.setItem('mocap_vivo-boca-modo', modoBoca()); } catch { /* sin almacenamiento */ }
    formas = []; sincronizar();
  });
  $('#vivo-fab').addEventListener('click', () => prender(!activo));
  // skin de la cara (compartida con la Vista 3D)
  $('#vivo-skin-elegir').addEventListener('click', () => $('#vivo-skin-archivo').click());
  $('#vivo-skin-archivo').addEventListener('change', (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const lector = new FileReader();
    lector.onload = async () => {
      try { await imagenSkin(lector.result); } catch (err) { return estado(err.message || 'No se pudo leer la skin.'); }
      try { localStorage.setItem('skin3d', lector.result); } catch { return estado('No se pudo guardar la skin en este navegador.'); }
      await cargarSkin(true); dispatchEvent(new Event('skin-cambiada')); pintar(); estado('Skin cambiada (también la usa la Vista 3D).');
    };
    lector.readAsDataURL(f);
  });
  $('#vivo-skin-defecto').addEventListener('click', async () => {
    try { localStorage.removeItem('skin3d'); } catch { /* sin almacenamiento */ }
    await cargarSkin(true); dispatchEvent(new Event('skin-cambiada')); pintar(); estado('Skin por defecto.');
  });
  $('#vivo-recalibrar').addEventListener('click', recalibrar);
  $('#vivo-modelo').addEventListener('change', () => { historia = []; ultBoca = null; pintar(); });
  $('#vivo-ojos-modelo').addEventListener('change', () => pintar());
  sincronizar();
}
