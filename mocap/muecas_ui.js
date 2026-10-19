// Pantalla "Muecas y bocas de referencia": una tarjeta por gesto (dibujo de referencia o tu foto + la boca de pixeles), editor de pixeles,
// presets propios (se guardan en el navegador) y el reconocimiento del gesto en vivo.
import * as MU from './nucleo/muecas.js';
import { dibujoSVG } from './nucleo/muecas_dibujo.js';
import { HUECO, DIENTE, LABIO, COLORES, COLS } from './nucleo/boca_pixel.js';

const $ = (s) => document.querySelector(s);
const PIEL = '#f0a85a';
const COL = { 0: PIEL, [HUECO]: '#000', [DIENTE]: `rgb(${COLORES[DIENTE]})`, [LABIO]: `rgb(${COLORES[LABIO]})` };
let datos = MU.cargarPresets();
let capturar = () => null;   // la manda envivo: el gesto que estas haciendo ahora
let resaltada = null;

const preset = () => datos.presets[datos.activo];
const guardar = () => { if (!MU.guardarPresets(datos)) aviso('No se pudo guardar en este navegador.'); };
const aviso = (t) => { const e = $('#mu-aviso'); if (e) e.textContent = t || ''; };
export function modelo() {   // {k, filas} del modelo de boca elegido arriba
  const [tipo, k] = ($('#vivo-modelo').value || 'Man_2').split('_');
  return { k: +k, filas: tipo === 'Woman' ? 1 : 2, tipo };
}
/** Muecas del preset activo con su gesto ya aplicado (las editadas con "Usar mi gesto" pisan el de fabrica). */
export function listaReconocimiento() {
  const p = preset();
  return MU.listaDe(p).map((m) => ({ id: m.id, bs: (p.bsEd && p.bsEd[m.id]) || m.bs }));
}
export const grillaDe = (id) => {
  const { k, filas } = modelo(), m = MU.listaDe(preset()).find((x) => x.id === id);
  return m ? MU.grillaPreset(preset(), m, k, filas) : null;
};
export function resaltar(id) {
  if (id === resaltada) return;
  resaltada = id;
  document.querySelectorAll('.mu-card').forEach((c) => c.classList.toggle('viva', c.dataset.id === id));
}

function pintarGrilla(cv, g, k, filas, celda) {
  const C = COLS * k, R = filas * k;
  cv.width = (COLS + 2) * k * celda; cv.height = (filas === 2 ? 4 : 3) * k * celda;   // la boca ocupa las columnas 1 a 6 de la cara de 8 de ancho
  const x = cv.getContext('2d');
  x.fillStyle = PIEL; x.fillRect(0, 0, cv.width, cv.height);
  const fila0 = filas === 2 ? k : k;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const v = g[r * C + c]; if (!v) continue;
    x.fillStyle = COL[v]; x.fillRect((k + c) * celda, (fila0 + r) * celda, celda, celda);
  }
}
const urlSVG = (m) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(dibujoSVG(m));

function tarjeta(m) {
  const p = preset(), { k, filas } = modelo();
  const div = document.createElement('div'); div.className = 'mu-card'; div.dataset.id = m.id;
  const foto = p.fotos && p.fotos[m.id];
  const img = document.createElement('img'); img.className = 'mu-ref'; img.alt = 'Referencia: ' + m.nombre; img.src = foto || urlSVG({ ...m, bs: (p.bsEd && p.bsEd[m.id]) || m.bs });
  const cv = document.createElement('canvas'); cv.className = 'mu-px';
  pintarGrilla(cv, MU.grillaPreset(p, m, k, filas), k, filas, Math.max(2, Math.floor(160 / ((COLS + 2) * k))));
  const editada = p.ed[MU.claveEd(m.id, k, filas)] ? ' · boca editada' : '';
  const nom = document.createElement('div'); nom.className = 'mu-nombre'; nom.textContent = m.nombre;
  const sub = document.createElement('div'); sub.className = 'mu-sub'; sub.textContent = (m.extra ? 'tuya' : 'de fábrica') + editada + ((p.bsEd && p.bsEd[m.id]) ? ' · gesto tuyo' : '');
  const fila = document.createElement('div'); fila.className = 'mu-botones';
  const b = (t, tit, f) => { const e = document.createElement('button'); e.type = 'button'; e.className = 'btn btn-chico'; e.textContent = t; e.title = tit; e.addEventListener('click', f); fila.append(e); return e; };
  b('Editar boca', 'Dibujá la boca de esta mueca, pixel por pixel', () => abrirEditor(m));
  b('Mi gesto', 'Con la cámara prendida: hacé este gesto y tocá acá para que se reconozca con tu cara', () => {
    const r = capturar();
    if (!r) return aviso('Prendé la cámara y la vista en vivo (🙂), hacé el gesto y tocá de nuevo.');
    p.bsEd = p.bsEd || {}; p.bsEd[m.id] = { ...r }; guardar(); dibujarLista(); aviso(`Listo: «${m.nombre}» ahora se reconoce con tu gesto.`);
  });
  b('Foto', 'Una foto tuya o de referencia para esta mueca (queda en este navegador)', () => elegirFoto(m));
  if (foto) b('Sin foto', 'Volver al dibujo de referencia', () => { delete p.fotos[m.id]; guardar(); dibujarLista(); });
  if (p.ed[MU.claveEd(m.id, k, filas)]) b('Restaurar', 'Volver a la boca original en esta escala', () => { delete p.ed[MU.claveEd(m.id, k, filas)]; guardar(); dibujarLista(); });
  if (m.extra) b('Quitar', 'Borrar esta mueca', () => { p.extra = p.extra.filter((x) => x.id !== m.id); guardar(); dibujarLista(); });
  div.append(img, cv, nom, sub, fila);
  if (m.id === resaltada) div.classList.add('viva');
  return div;
}

export function dibujarLista() {
  const lista = $('#mu-lista'); if (!lista) return;
  lista.innerHTML = '';
  for (const m of MU.listaDe(preset())) lista.append(tarjeta(m));
  const sel = $('#mu-preset'); sel.innerHTML = '';
  for (const n of Object.keys(datos.presets)) sel.append(new Option(n, n, false, n === datos.activo));
  $('#mu-borrar').disabled = Object.keys(datos.presets).length < 2;
  const { k, filas } = modelo();
  $('#mu-escala').textContent = `${filas === 1 ? 'Mujer' : 'Hombre'} x${k}: ${COLS * k} × ${filas * k} pedacitos. Las bocas que edites quedan guardadas para esta escala.`;
}

// ---------------------------------------------------------------- foto de referencia
function elegirFoto(m) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.addEventListener('change', () => {
    const f = inp.files[0]; if (!f) return;
    const im = new Image(), url = URL.createObjectURL(f);
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = 240; c.height = 140;
      const x = c.getContext('2d'), e = Math.max(240 / im.width, 140 / im.height);
      x.drawImage(im, (240 - im.width * e) / 2, (140 - im.height * e) / 2, im.width * e, im.height * e);
      URL.revokeObjectURL(url);
      const p = preset(); p.fotos = p.fotos || {}; p.fotos[m.id] = c.toDataURL('image/jpeg', 0.8); guardar(); dibujarLista();
    };
    im.onerror = () => aviso('No se pudo leer esa imagen.');
    im.src = url;
  });
  inp.click();
}

// ---------------------------------------------------------------- editor de pixeles
let edit = null;   // {m, k, filas, g, pincel}
function abrirEditor(m) {
  const { k, filas } = modelo(), p = preset();
  edit = { m, k, filas, g: MU.grillaPreset(p, m, k, filas), pincel: HUECO };
  $('#mu-ed-titulo').textContent = `${m.nombre} · ${filas === 1 ? 'mujer' : 'hombre'} x${k}`;
  for (const b of document.querySelectorAll('#mu-ed-pinceles button')) b.hidden = filas === 1 && b.dataset.v === String(LABIO);
  if (filas === 1 && edit.pincel === LABIO) edit.pincel = HUECO;
  marcarPincel(); dibujarEditor();
  $('#mu-editor').showModal();
}
const marcarPincel = () => document.querySelectorAll('#mu-ed-pinceles button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === edit.pincel)));
function dibujarEditor() {
  const cv = $('#mu-ed-lienzo'), { k, filas, g } = edit, C = COLS * k, R = filas * k, celda = Math.max(10, Math.floor(540 / (C + 2 * k)));
  edit.celda = celda;
  cv.width = (C + 2 * k) * celda; cv.height = (R + 2 * k) * celda;
  const x = cv.getContext('2d');
  x.fillStyle = PIEL; x.fillRect(0, 0, cv.width, cv.height);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const v = g[r * C + c];
    if (v) { x.fillStyle = COL[v]; x.fillRect((k + c) * celda, (k + r) * celda, celda, celda); }
  }
  x.strokeStyle = '#0003'; x.lineWidth = 1;
  for (let c = 0; c <= C; c++) { x.beginPath(); x.moveTo((k + c) * celda + 0.5, k * celda); x.lineTo((k + c) * celda + 0.5, (k + R) * celda); x.stroke(); }
  for (let r = 0; r <= R; r++) { x.beginPath(); x.moveTo(k * celda, (k + r) * celda + 0.5); x.lineTo((k + C) * celda, (k + r) * celda + 0.5); x.stroke(); }
  x.strokeStyle = '#fff6'; x.strokeRect(k * celda + 0.5, k * celda + 0.5, C * celda, R * celda);
  // reglas: los pixeles de la cara (cada k pedacitos)
  x.strokeStyle = '#0006';
  for (let c = 0; c <= COLS; c++) { x.beginPath(); x.moveTo((k + c * k) * celda + 0.5, k * celda); x.lineTo((k + c * k) * celda + 0.5, (k + R) * celda); x.stroke(); }
}
function pintarEn(e) {
  const cv = $('#mu-ed-lienzo'), r = cv.getBoundingClientRect(), { k, filas, celda } = edit, C = COLS * k, R = filas * k;
  const c = Math.floor(((e.clientX - r.left) * (cv.width / r.width)) / celda) - k, f = Math.floor(((e.clientY - r.top) * (cv.height / r.height)) / celda) - k;
  if (c < 0 || c >= C || f < 0 || f >= R) return;
  if (edit.g[f * C + c] === edit.pincel) return;
  edit.g[f * C + c] = edit.pincel; dibujarEditor();
}
function iniciarEditor() {
  const cv = $('#mu-ed-lienzo'); let abajo = false;
  cv.addEventListener('pointerdown', (e) => { abajo = true; cv.setPointerCapture(e.pointerId); pintarEn(e); });
  cv.addEventListener('pointermove', (e) => { if (abajo) pintarEn(e); });
  cv.addEventListener('pointerup', () => { abajo = false; }); cv.addEventListener('pointercancel', () => { abajo = false; });
  for (const b of document.querySelectorAll('#mu-ed-pinceles button')) b.addEventListener('click', () => { edit.pincel = +b.dataset.v; marcarPincel(); });
  $('#mu-ed-limpiar').addEventListener('click', () => { edit.g.fill(0); dibujarEditor(); });
  $('#mu-ed-cancelar').addEventListener('click', () => $('#mu-editor').close());
  $('#mu-ed-guardar').addEventListener('click', () => {
    const p = preset(); p.ed[MU.claveEd(edit.m.id, edit.k, edit.filas)] = MU.aTexto(edit.g); guardar();
    $('#mu-editor').close(); dibujarLista(); aviso(`Boca de «${edit.m.nombre}» guardada para esta escala.`);
  });
}

// ---------------------------------------------------------------- presets y agregar
const nombreLibre = (base) => { let n = base, i = 2; while (datos.presets[n]) n = `${base} ${i++}`; return n; };
export function iniciarMuecas({ gesto } = {}) {
  if (!$('#mu-lista')) return;
  capturar = gesto || capturar;
  $('#mu-preset').addEventListener('change', () => { datos.activo = $('#mu-preset').value; guardar(); dibujarLista(); });
  $('#mu-nuevo').addEventListener('click', () => {
    const n = (prompt('Nombre del preset nuevo (es una copia del actual):', nombreLibre('Mis bocas')) || '').trim();
    if (!n) return;
    const nombre = datos.presets[n] ? nombreLibre(n) : n;
    datos.presets[nombre] = JSON.parse(JSON.stringify(preset())); datos.activo = nombre; guardar(); dibujarLista();
  });
  $('#mu-borrar').addEventListener('click', () => {
    if (Object.keys(datos.presets).length < 2 || !confirm(`¿Borrar el preset «${datos.activo}»?`)) return;
    delete datos.presets[datos.activo]; datos.activo = Object.keys(datos.presets)[0]; guardar(); dibujarLista();
  });
  $('#mu-agregar').addEventListener('click', () => {
    const n = (prompt('Nombre de la mueca nueva:', 'Mi mueca') || '').trim(); if (!n) return;
    const p = preset(), r = capturar();
    const id = 'u' + Date.now().toString(36);
    p.extra = p.extra || []; p.extra.push({ id, nombre: n, extra: true, base: 'neutra', bs: r ? { ...r } : {} });
    guardar(); dibujarLista(); aviso(r ? 'Mueca agregada con el gesto que estás haciendo. Editale la boca.' : 'Mueca agregada. Con la cámara prendida, hacé el gesto y tocá «Mi gesto» para que se reconozca.');
  });
  $('#vivo-modelo').addEventListener('change', dibujarLista);
  iniciarEditor();
  dibujarLista();
}
