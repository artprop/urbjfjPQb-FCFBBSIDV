// Randomizer de cameos: arma grupos de personajes de fondo al azar para BBS (como el programa de Windows).
import {
  leerPrefab, nuevoPrefab, nuevoGrupo, resumenGrupo, generar, nombreArchivo, tituloDe, discoDeRutas,
  archivosDeCarpeta, colorPropio, colorDesde, parseHex, argb, hexDe, limpiarRuta, aJson,
} from './motor.js';
import { PREFABS_INICIALES } from './prefabs_iniciales.js';
import * as almacen from './almacen.js';
import { FuenteRandomizer, Vista } from './vista.js';
import { guardarSalida, abrirCarpetaSalida, esPC, avisarMenu } from '../comun/plataforma.js';
import { zipSync, unzipSync, strToU8, strFromU8 } from '../visor/lib/fflate.js';

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...hijos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined) e.append(h.nodeType ? h : document.createTextNode(String(h)));
  return e;
};
const sinMayus = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
const tactil = matchMedia('(pointer: coarse)').matches;
const MODOS = ['ninguno', 'rgb', 'rgba', 'grises', 'paleta'];

// ---------------- estado ----------------
let prefabs = [];          // [{ id, orden, datos }]
let actualId = null;       // el que se edita
let marcados = new Set();  // prefabs marcados (para Duplicar / Eliminar)
let grupoIdx = -1;
let cantidades = {};       // id → cantidad
let candMarcados = new Set(); // ids de filas de Candidatos marcadas (también las que la búsqueda esconde)
let anclaCand = null;
let itemsCand = [];
let ultimo = null;         // { nombre, json } del último archivo generado
let resultado = null;
const fuente = new FuenteRandomizer();
let disco = null;          // archivos de la carpeta assets del usuario (solo lectura)
const vista = new Vista($('#vista3d'), $('#lienzo'));

const actual = () => prefabs.find((p) => p.id === actualId) || null;
const grupo = () => { const p = actual(); return p && p.datos.Grupos[grupoIdx] ? p.datos.Grupos[grupoIdx] : null; };

// ---------------- guardar en el navegador ----------------
const pendientes = new Set();
let tGuardar = 0;
function cambio(p = actual()) {
  if (!p) return;
  pendientes.add(p);
  clearTimeout(tGuardar);
  tGuardar = setTimeout(guardarPendientes, 300);
}
async function guardarPendientes() {
  const lista = [...pendientes]; pendientes.clear();
  for (const p of lista) await almacen.poner('prefabs', { id: p.id, orden: p.orden, datos: p.datos });
}
const guardarCantidades = () => almacen.guardar('cantidades', cantidades);
addEventListener('pagehide', guardarPendientes);
addEventListener('visibilitychange', () => { if (document.hidden) guardarPendientes(); });

function estadoFuente(txt, error = false) { const e = $('#estadoFuente'); e.textContent = txt; e.classList.toggle('error', error); }
function estado(txt, tipo = '') { const e = $('#estado'); e.textContent = txt; e.className = 'estado ' + tipo; }

// ---------------- pestañas (celu) ----------------
function irA(panel) {
  document.querySelectorAll('#pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.panel === panel));
  document.querySelectorAll('main > .panel').forEach((s) => s.classList.toggle('activa', s.dataset.panel === panel));
}
document.querySelectorAll('#pestanas button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.panel)));
const esCelu = () => matchMedia('(max-width: 900px)').matches;

// ======================= PREFABS =======================
function ordenados() { return prefabs.slice().sort((a, b) => a.orden - b.orden); }

function renderPrefabs() {
  const l = $('#listaPrefabs'); l.innerHTML = '';
  for (const p of ordenados()) {
    const chk = el('input', { type: 'checkbox', checked: marcados.has(p.id), title: 'Marcar', onclick: (e) => { e.stopPropagation(); alternarMarca(p.id); } });
    l.append(el('div', {
      class: 'item' + (p.id === actualId ? ' actual' : marcados.has(p.id) ? ' marcado' : ''), 'data-id': p.id,
      onclick: (e) => (e.shiftKey || e.ctrlKey || e.metaKey ? alternarMarca(p.id) : elegirPrefab(p.id)),
    }, chk, el('span', { class: 'nom' }, p.datos.Nombre || '(sin nombre)')));
  }
  const n = marcados.size;
  $('#txtMarcados').textContent = n > 1 ? `${n} marcados. «Eliminar» los saca a todos. Shift + clic marca o desmarca.` : 'Shift o Ctrl + clic (o la casilla) para marcar varios.';
  renderCantidades();
}

function elegirPrefab(id, irEditor = true) {
  marcados = new Set([id]);
  if (actualId !== id) { actualId = id; grupoIdx = actual() && actual().datos.Grupos.length ? 0 : -1; renderEditor(); }
  renderPrefabs();
  if (irEditor && esCelu()) irA('editor');
}

// Shift (o Ctrl) + clic marca o desmarca un prefab sin cambiar el que se está editando.
function alternarMarca(id) {
  if (marcados.has(id)) marcados.delete(id); else marcados.add(id);
  if (!marcados.has(actualId)) {
    const primero = ordenados().find((p) => marcados.has(p.id));
    actualId = primero ? primero.id : null;
    grupoIdx = actual() && actual().datos.Grupos.length ? 0 : -1;
    renderEditor();
  }
  renderPrefabs();
}

function marcadosOActual() {
  const l = ordenados().filter((p) => marcados.has(p.id));
  if (!l.length && actual()) l.push(actual());
  return l;
}

async function agregarPrefab(datos) {
  const max = prefabs.reduce((m, p) => Math.max(m, p.orden), 0);
  const p = { id: almacen.nuevoId(), orden: max + 1, datos };
  prefabs.push(p);
  await almacen.poner('prefabs', p);
  return p;
}

$('#btnNuevo').addEventListener('click', async () => {
  const p = await agregarPrefab(nuevoPrefab());
  elegirPrefab(p.id);
  // Listo para escribirle el nombre.
  setTimeout(() => { $('#inNombre').focus(); $('#inNombre').select(); }, 50);
});

$('#btnDuplicar').addEventListener('click', async () => {
  const lista = marcadosOActual();
  if (!lista.length) return;
  await guardarPendientes();
  let abrir = null;
  for (const p of lista) {
    const c = leerPrefab(JSON.parse(JSON.stringify(p.datos)));
    c.Nombre += ' (copia)';
    const nuevo = await agregarPrefab(c);
    cantidades[nuevo.id] = cantidades[p.id] ?? 5;
    if (!abrir || p.id === actualId) abrir = nuevo;
  }
  guardarCantidades();
  elegirPrefab(abrir.id, false);
  if (lista.length > 1) estado(`Dupliqué ${lista.length} prefabs.`);
});

async function eliminarMarcados() {
  const lista = marcadosOActual();
  if (!lista.length) return;
  const pregunta = lista.length === 1
    ? `¿Sacar el prefab «${lista[0].datos.Nombre}» de la lista?\n\nNo se borra: queda en la papelera (🗑️) y se puede recuperar.`
    : `¿Sacar estos ${lista.length} prefabs de la lista?\n\n• ` + lista.slice(0, 15).map((p) => p.datos.Nombre).join('\n• ')
      + (lista.length > 15 ? `\n… y ${lista.length - 15} más` : '') + '\n\nNo se borran: quedan en la papelera (🗑️) y se pueden recuperar.';
  if (!confirm(pregunta)) return;
  await guardarPendientes();
  const queda = actual() && !lista.includes(actual()) ? actualId : null;
  for (const p of lista) {
    await almacen.poner('eliminados', { id: p.id, fecha: Date.now(), datos: p.datos, cantidad: cantidades[p.id] });
    await almacen.sacar('prefabs', p.id);
    prefabs = prefabs.filter((x) => x !== p);
  }
  actualId = null; marcados.clear();
  const sig = queda || (ordenados()[0] && ordenados()[0].id);
  if (sig) elegirPrefab(sig, false); else { renderEditor(); renderPrefabs(); }
  actualizarPapelera();
}
$('#btnEliminar').addEventListener('click', eliminarMarcados);
$('#listaPrefabs').addEventListener('keydown', (e) => { if (e.key === 'Delete') { e.preventDefault(); eliminarMarcados(); } });

// ---------------- papelera ----------------
async function actualizarPapelera() {
  const n = (await almacen.todos('eliminados')).length;
  $('#btnPapelera').textContent = '🗑️ Papelera' + (n ? ` (${n})` : '');
}
async function renderPapelera() {
  const l = $('#listaPapelera'); l.innerHTML = '';
  const lista = (await almacen.todos('eliminados')).sort((a, b) => b.fecha - a.fecha);
  if (!lista.length) l.append(el('div', { class: 'item sub' }, 'La papelera está vacía.'));
  for (const x of lista) {
    l.append(el('div', { class: 'item' },
      el('span', { class: 'nom' }, x.datos.Nombre || '(sin nombre)', ' ', el('span', { class: 'sub' }, '· eliminado el ' + new Date(x.fecha).toLocaleString())),
      el('button', { onclick: async () => {
        const p = await agregarPrefab(x.datos);
        if (x.cantidad !== undefined) { cantidades[p.id] = x.cantidad; guardarCantidades(); }
        await almacen.sacar('eliminados', x.id);
        elegirPrefab(p.id, false); renderPapelera(); actualizarPapelera();
      } }, 'Recuperar'),
      el('button', { title: 'Borrar para siempre', onclick: async () => {
        if (!confirm(`¿Borrar «${x.datos.Nombre}» para siempre? No se puede deshacer.`)) return;
        await almacen.sacar('eliminados', x.id); renderPapelera(); actualizarPapelera();
      } }, '✕')));
  }
}
$('#btnPapelera').addEventListener('click', async () => { await renderPapelera(); $('#dlgPapelera').showModal(); });
$('#btnPapeleraCerrar').addEventListener('click', () => $('#dlgPapelera').close());

// ---------------- exportar / importar ----------------
const nombreSeguro = (n) => (n.replace(/[^\p{L}\p{Mn}\p{Nd}\p{Pc}\- ]/gu, '_').trim() || 'prefab');
$('#btnExportar').addEventListener('click', async () => {
  await guardarPendientes();
  const arbol = {}, usados = new Set();
  for (const p of ordenados()) {
    let base = nombreSeguro(p.datos.Nombre), n = base, i = 2;
    while (usados.has(n.toLowerCase())) n = `${base}_${i++}`;
    usados.add(n.toLowerCase());
    arbol['Prefabs/' + n + '.json'] = strToU8(aJson(p.datos));
  }
  const hoy = new Date(), f = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;
  try {
    const txt = await guardarSalida('randomizer', `Prefabs_randomizer_${f}.zip`, new Blob([zipSync(arbol)], { type: 'application/zip' }), 'application/zip');
    estado(`${txt} (${Object.keys(arbol).length} prefabs).`);
  } catch (e) { estado('No pude guardar: ' + (e.message || e), 'error'); }
});

$('#inImportar').addEventListener('change', async (e) => {
  const archivos = [...e.target.files]; e.target.value = '';
  const textos = [];
  for (const f of archivos) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) { // un .zip empieza con "PK"
      const z = unzipSync(bytes);
      for (const [n, d] of Object.entries(z)) if (/\.json$/i.test(n) && !/(^|\/)_eliminados\//i.test(n)) textos.push([n.split('/').pop(), strFromU8(d)]);
    } else textos.push([f.name, strFromU8(bytes)]);
  }
  let ok = 0; const malos = [];
  let ultimoP = null;
  for (const [n, t] of textos) {
    try {
      const o = JSON.parse(t.replace(/^﻿/, ''));
      if (!o || typeof o !== 'object' || !Object.keys(o).some((k) => k.toLowerCase() === 'grupos')) throw new Error('no es un prefab');
      const d = leerPrefab(o);
      const nombres = new Set(prefabs.map((p) => p.datos.Nombre.toLowerCase()));
      if (nombres.has(d.Nombre.toLowerCase())) { let i = 2; while (nombres.has(`${d.Nombre} (${i})`.toLowerCase())) i++; d.Nombre = `${d.Nombre} (${i})`; }
      ultimoP = await agregarPrefab(d); ok++;
    } catch (err) { malos.push(n); }
  }
  if (ultimoP) elegirPrefab(ultimoP.id, false); else renderPrefabs();
  estado(`Importé ${ok} prefab(s).` + (malos.length ? `\nNo pude leer: ${malos.join(', ')}` : ''), malos.length ? 'avisos' : '');
});

// ======================= EDITOR =======================
const campos = { inNombre: 'Nombre', inPrefijo: 'Prefijo', inModelo: 'Modelo', inTextura: 'Textura', inRaiz: 'Raiz' };
for (const [id, k] of Object.entries(campos)) {
  $('#' + id).addEventListener('input', (e) => {
    const p = actual(); if (!p) return;
    p.datos[k] = e.target.value; cambio(p);
    if (k === 'Raiz') renderCandidatos();
  });
}
$('#inNombre').addEventListener('change', renderPrefabs);
$('#inPrefijo').addEventListener('change', renderCantidades);

function renderEditor() {
  const p = actual();
  $('#editor').hidden = !p; $('#editorVacio').hidden = !!p;
  if (!p) return;
  for (const [id, k] of Object.entries(campos)) $('#' + id).value = p.datos[k];
  renderGrupos();
  renderPanelGrupo();
}

function renderGrupos() {
  const p = actual(), t = $('#tablaGrupos'); t.innerHTML = '';
  t.append(el('div', { class: 'fila-g cab' }, el('span', {}, 'Grupo'), el('span', {}, 'Aparece %'), el('span', { class: 'res' }, 'Candidatos'), el('span', {}, 'Color'), el('span', { class: 'borra', title: 'Capa que borra (máscara de ojos)' }, 'Borra')));
  p.datos.Grupos.forEach((g, i) => {
    const fila = el('div', { class: 'fila-g' + (i === grupoIdx ? ' activa' : ''), onclick: () => { if (grupoIdx !== i) { grupoIdx = i; renderGrupos(); renderPanelGrupo(); } } },
      el('input', { value: g.Nombre, oninput: (e) => { g.Nombre = e.target.value; cambio(); actualizarTituloCands(); } }),
      el('input', { type: 'number', min: 0, max: 100, step: 'any', value: Math.round(g.Prob * 1000) / 10, onchange: (e) => {
        const v = parseFloat(String(e.target.value).replace(',', '.'));
        if (isNaN(v)) { e.target.value = Math.round(g.Prob * 1000) / 10; return; }
        g.Prob = Math.min(Math.max(v, 0), 100) / 100; cambio();
      } }),
      el('span', { class: 'res', title: resumenGrupo(g) }, resumenGrupo(g)),
      el('select', { onchange: (e) => { g.Color.Modo = e.target.value; cambio(); if (i === grupoIdx) renderColor(); } },
        MODOS.map((m) => el('option', { value: m, ...(m === String(g.Color.Modo).toLowerCase() ? { selected: true } : {}) }, m))),
      el('span', { class: 'borra' }, el('input', { type: 'checkbox', checked: g.Erase, onchange: (e) => { g.Erase = e.target.checked; cambio(); } })));
    t.append(fila);
  });
}

function moverGrupo(d) {
  const p = actual(); if (!p || !grupo()) return;
  const j = grupoIdx + d; if (j < 0 || j >= p.datos.Grupos.length) return;
  const [g] = p.datos.Grupos.splice(grupoIdx, 1); p.datos.Grupos.splice(j, 0, g); grupoIdx = j;
  cambio(); renderGrupos();
}
$('#btnSubir').addEventListener('click', () => moverGrupo(-1));
$('#btnBajar').addEventListener('click', () => moverGrupo(1));
$('#btnGrupoNuevo').addEventListener('click', () => {
  const p = actual(); if (!p) return;
  p.datos.Grupos.push(nuevoGrupo()); grupoIdx = p.datos.Grupos.length - 1;
  cambio(); renderGrupos(); renderPanelGrupo();
  const filas = $('#tablaGrupos').querySelectorAll('.fila-g:not(.cab)'); filas[filas.length - 1].scrollIntoView({ block: 'nearest' });
});
$('#btnGrupoQuitar').addEventListener('click', () => {
  const p = actual(), g = grupo(); if (!p || !g) return;
  if (!confirm(`¿Quitar el grupo «${g.Nombre}»?`)) return;
  p.datos.Grupos.splice(grupoIdx, 1);
  grupoIdx = p.datos.Grupos.length ? Math.min(grupoIdx, p.datos.Grupos.length - 1) : -1;
  cambio(); renderGrupos(); renderPanelGrupo();
});

// ---------------- candidatos ----------------
function renderPanelGrupo() {
  const g = grupo();
  $('#panelGrupo').style.opacity = g ? '' : '.5';
  $('#panelGrupo').inert = !g;
  $('#inBuscar').value = ''; // la búsqueda se vacía al cambiar de grupo
  candMarcados.clear(); anclaCand = null;
  renderCandidatos();
  renderColor();
}

const dirCapas = (p) => limpiarRuta(p.datos.Raiz);
const rutaAssets = (p, rel) => 'assets/' + dirCapas(p) + '/' + limpiarRuta(rel);

function armarItems() {
  const p = actual(), g = grupo(), l = [];
  if (!p || !g) return l;
  g.Carpetas.forEach((c, i) => l.push({ id: 'c:' + i, carpeta: c, texto: '▸ carpeta: ' + c.Ruta + (c.Recursivo ? '  (con subcarpetas)' : '') }));
  for (const a of g.Archivos) l.push({ id: 'a:' + a, archivo: a, rel: a, clave: a });
  if (disco) {
    const fuera = new Set(g.Excluidos.map((x) => x.toLowerCase()));
    const vistos = new Set();
    for (const c of g.Carpetas) {
      for (const f of archivosDeCarpeta(p.datos, c, disco)) {
        if (vistos.has(f.toLowerCase())) continue;
        vistos.add(f.toLowerCase());
        const ex = fuera.has(f.toLowerCase());
        l.push({ id: 'f:' + f, deCarpeta: f, rel: f, excluido: ex, clave: ex ? null : f });
      }
    }
  }
  return l;
}

function pasaFiltro(it) {
  const t = $('#inBuscar').value.trim().toLowerCase();
  return !t || !!it.carpeta || (it.rel || '').toLowerCase().includes(t);
}

// Miniaturas: cada PNG se lee una sola vez
const minis = new Map();
function miniatura(ruta) {
  if (!minis.has(ruta)) minis.set(ruta, fuente.blob(ruta).then((b) => (b ? URL.createObjectURL(b) : null)));
  return minis.get(ruta);
}
let observador = null;
function observar(raiz) {
  if (observador) observador.disconnect();
  observador = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { observador.unobserve(e.target); e.target._cargar(); }
  }, { root: raiz, rootMargin: '200px' });
  return observador;
}
function cajaMini(ruta, obs) {
  const caja = el('span', { class: 'mini' });
  caja._cargar = async () => { const u = await miniatura(ruta); if (u) caja.append(el('img', { src: u, alt: '', loading: 'lazy' })); };
  obs.observe(caja);
  return caja;
}

function marcaColor(g, rel) {
  const c = colorPropio(g, rel);
  if (!c) return null;
  if (c.Modo === 'paleta' && c.Paleta.length) {
    let fondo = '#800'; try { fondo = hexCss(parseHex(c.Paleta[0].Hex)); } catch { /* inválido */ }
    return el('span', { class: 'sub' }, el('i', { class: 'bola', style: 'background:' + fondo }), ' ' + c.Paleta[0].Hex);
  }
  return el('span', { class: 'sub' }, el('i', { class: 'bola', style: 'background:#fff' }), ' sin color');
}
const hexCss = (c) => { const u = c >>> 0; return `rgba(${(u >>> 16) & 255},${(u >>> 8) & 255},${u & 255},${((u >>> 24) & 255) / 255})`; };

function renderCandidatos() {
  const p = actual(), g = grupo(), l = $('#listaCands');
  itemsCand = armarItems();
  // lo marcado se conserva por id (si sigue existiendo)
  const ids = new Set(itemsCand.map((i) => i.id));
  for (const id of [...candMarcados]) if (!ids.has(id)) candMarcados.delete(id);
  l.innerHTML = '';
  const obs = observar(l);
  for (const it of itemsCand) {
    if (!pasaFiltro(it)) continue;
    const fila = el('div', {
      class: 'cand' + (candMarcados.has(it.id) ? ' marcado' : '') + (it.excluido ? ' excluido' : '') + (it.deCarpeta ? ' de-carpeta' : ''),
      'data-id': it.id, title: it.rel || it.carpeta.Ruta,
      onclick: (e) => clicCand(it, e),
    },
    it.carpeta ? null : cajaMini(rutaAssets(p, it.rel), obs),
    el('span', { class: 'txt' }, it.carpeta ? it.texto : (it.excluido ? '✗ excluido: ' : it.deCarpeta ? '· ' : '') + it.rel),
    !it.carpeta && !it.excluido ? marcaColor(g, it.rel) : null);
    l.append(fila);
  }
  if (g && !itemsCand.length) l.append(el('div', { class: 'item sub' }, 'Sin candidatos. Usá «+ Archivos / carpeta…».'));
  if (g && !disco && g.Carpetas.length) l.append(el('div', { class: 'item sub' }, 'Abrí tu carpeta bbs (o un .zip) para ver los archivos de las carpetas.'));
  actualizarOcultos();
  actualizarTituloCands();
  actualizarColorProp();
}

function visibles() { return itemsCand.filter(pasaFiltro); }
function clicCand(it, e) {
  const vis = visibles();
  const antes = new Set(candMarcados);
  if (e.shiftKey && anclaCand) {
    const a = vis.findIndex((x) => x.id === anclaCand), b = vis.findIndex((x) => x.id === it.id);
    if (a >= 0 && b >= 0) { if (!e.ctrlKey) candMarcados.clear(); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) candMarcados.add(vis[i].id); }
  } else if (e.ctrlKey || e.metaKey || tactil) {
    if (candMarcados.has(it.id)) candMarcados.delete(it.id); else candMarcados.add(it.id);
    anclaCand = it.id;
  } else { candMarcados = new Set([it.id]); anclaCand = it.id; }
  document.querySelectorAll('#listaCands .cand').forEach((d) => d.classList.toggle('marcado', candMarcados.has(d.dataset.id)));
  actualizarOcultos();
  actualizarColorProp();
  // Se muestra el último archivo marcado (o, si se desmarcó, el primero que quede).
  const nuevo = [...candMarcados].filter((id) => !antes.has(id)).map((id) => itemsCand.find((x) => x.id === id)).find((x) => x && x.rel);
  const ver = nuevo ? nuevo.rel : (itemsCand.find((x) => candMarcados.has(x.id) && x.clave) || {}).clave;
  if (ver) mostrarCandidato(ver);
}

function actualizarOcultos() {
  const ocultos = itemsCand.filter((i) => candMarcados.has(i.id) && !pasaFiltro(i)).length;
  const t = $('#txtOcultos');
  t.textContent = ocultos ? `${ocultos} marcado(s) oculto(s)` : '';
  t.title = ocultos ? 'Siguen marcados pero la búsqueda los esconde; Quitar y los colores solo actúan sobre lo que se ve.' : '';
}

function actualizarTituloCands() {
  const g = grupo();
  if (!g) { $('#tituloCands').textContent = 'CANDIDATOS (SE ELIGE UNO)'; return; }
  const fuera = new Set(g.Excluidos.map((x) => x.replace(/\\/g, '/').toLowerCase()));
  const n = new Set(itemsCand.map((i) => i.clave && i.clave.replace(/\\/g, '/')).filter((k) => k && !fuera.has(k.toLowerCase()))).size;
  $('#tituloCands').textContent = `CANDIDATOS DE «${g.Nombre}»: ${n} (SE ELIGE UNO)`;
}

let tBuscar = 0;
$('#inBuscar').addEventListener('input', () => { clearTimeout(tBuscar); tBuscar = setTimeout(renderCandidatos, 150); });

const marcadosVisibles = () => visibles().filter((i) => candMarcados.has(i.id));

function quitarCandidatos() {
  const g = grupo(); if (!g) return;
  const lista = marcadosVisibles(); if (!lista.length) return;
  for (const it of lista) {
    if (it.archivo !== undefined) g.Archivos.splice(g.Archivos.indexOf(it.archivo), 1);
    else if (it.carpeta) g.Carpetas.splice(g.Carpetas.indexOf(it.carpeta), 1);
    else if (it.deCarpeta && !it.excluido && !g.Excluidos.includes(it.deCarpeta)) g.Excluidos.push(it.deCarpeta);
  }
  cambio(); renderCandidatos(); renderGrupos();
}
$('#btnQuitarCand').addEventListener('click', quitarCandidatos);
$('#listaCands').addEventListener('keydown', (e) => { if (e.key === 'Delete') { e.preventDefault(); quitarCandidatos(); } });
$('#btnRestaurar').addEventListener('click', () => {
  const g = grupo(); if (!g) return;
  for (const it of itemsCand.filter((i) => candMarcados.has(i.id) && i.excluido)) {
    const k = g.Excluidos.indexOf(it.deCarpeta);
    if (k >= 0) g.Excluidos.splice(k, 1);
    else g.Excluidos = g.Excluidos.filter((x) => x.toLowerCase() !== it.deCarpeta.toLowerCase());
  }
  cambio(); renderCandidatos(); renderGrupos();
});

// ---------------- color del archivo marcado ----------------
let actualizandoProp = false;
function actualizarColorProp() {
  const g = grupo();
  const claves = marcadosVisibles().map((i) => i.clave).filter(Boolean);
  $('#panelColorProp').hidden = !claves.length;
  if (!claves.length || !g) return;
  actualizandoProp = true;
  const c = colorPropio(g, claves[0]);
  const sel = $('#selColorProp');
  if (!c) sel.value = '0';
  else if (c.Modo === 'paleta' && c.Paleta.length) { sel.value = '2'; ponerHexProp(c.Paleta[0].Hex); }
  else sel.value = '1';
  $('#filaColorFijo').hidden = sel.value !== '2';
  actualizandoProp = false;
}
function ponerHexProp(hex) {
  $('#inColorProp').value = hex;
  try { $('#inColorPropPick').value = '#' + hexDe(parseHex(hex)).slice(-6).toLowerCase(); } catch { /* inválido */ }
}
function cambioColorProp() {
  const g = grupo(); if (actualizandoProp || !g) return;
  const claves = marcadosVisibles().map((i) => i.clave).filter(Boolean);
  if (!claves.length) return;
  const modo = $('#selColorProp').value;
  $('#filaColorFijo').hidden = modo !== '2';
  const hex = $('#inColorProp').value.trim();
  if (modo === '2') { try { parseHex(hex); } catch { estado(`El color «${hex}» no es válido (usá #RRGGBB).`, 'error'); return; } }
  for (const k of claves) {
    for (const x of Object.keys(g.ColoresPropios)) if (x.replace(/\\/g, '/').toLowerCase() === k.toLowerCase()) delete g.ColoresPropios[x];
    if (modo === '1') g.ColoresPropios[k] = colorDesde({ Modo: 'ninguno' });
    else if (modo === '2') g.ColoresPropios[k] = colorDesde({ Modo: 'paleta', Paleta: [{ Hex: hex, Peso: 1 }] });
  }
  cambio();
  const lista = $('#listaCands'), scroll = lista.scrollTop;
  renderCandidatos(); lista.scrollTop = scroll;
}
$('#selColorProp').addEventListener('change', cambioColorProp);
$('#inColorProp').addEventListener('change', () => { ponerHexProp($('#inColorProp').value.trim()); cambioColorProp(); });
$('#inColorPropPick').addEventListener('change', (e) => { $('#inColorProp').value = e.target.value.toUpperCase(); cambioColorProp(); });

// ---------------- color del grupo ----------------
const NOTAS = {
  rgb: 'Un color RGB totalmente al azar, opaco.',
  rgba: 'Un color RGB al azar con transparencia entre la opacidad mínima (abajo) y 255.',
  grises: 'Un gris al azar (rojo = verde = azul), opaco, entre los dos tonos de abajo.',
  paleta: 'Se elige un color de la lista; cuanto mayor el peso, más seguido sale.',
};
function renderColor() {
  const g = grupo();
  if (!g) { $('#tituloColor').textContent = 'COLOR'; $('#notaColor').textContent = ''; ['#panelCanales', '#panelGrises', '#panelPaleta', '#panelShift'].forEach((s) => ($(s).hidden = true)); return; }
  const c = g.Color, modo = String(c.Modo).toLowerCase();
  $('#tituloColor').textContent = 'COLOR (MODO: ' + modo.toUpperCase() + ')';
  $('#notaColor').textContent = NOTAS[modo] || 'Sin color: la capa se usa tal cual (blanca / sin teñir).';
  $('#panelCanales').hidden = !(modo === 'rgb' || modo === 'rgba');
  $('#filaA').hidden = modo !== 'rgba';
  $('#filaAlfaMin').hidden = modo !== 'rgba';
  $('#inAlfaMin').value = c.AlfaMin;
  $('#panelShift').hidden = false;
  const sy = g.ShiftY !== null && g.ShiftY !== undefined;
  $('#chkShiftY').checked = sy; $('#inShiftY').value = sy ? g.ShiftY : 0; $('#inShiftY').disabled = !sy;
  for (const k of 'RGBA') {
    const v = c['Fijo' + k];
    const chk = document.querySelector(`[data-c="${k}"]`), txt = document.querySelector(`[data-v="${k}"]`);
    chk.checked = v !== null && v !== undefined; txt.value = v ?? 255; txt.disabled = !chk.checked;
  }
  $('#panelGrises').hidden = modo !== 'grises';
  $('#inGrisMin').value = c.GrisMin; $('#inGrisMax').value = c.GrisMax;
  $('#panelPaleta').hidden = modo !== 'paleta';
  renderPaleta();
}

const valido255 = (t) => /^\s*\d+\s*$/.test(t) && +t >= 0 && +t <= 255;
const malValor = (t) => estado(`El valor «${t}» no es válido: tiene que ser un número de 0 a 255.`, 'error');
for (const k of 'RGBA') {
  const chk = document.querySelector(`[data-c="${k}"]`), txt = document.querySelector(`[data-v="${k}"]`);
  const leer = () => {
    const g = grupo(); if (!g) return;
    txt.disabled = !chk.checked;
    if (!chk.checked) g.Color['Fijo' + k] = null;
    else if (valido255(txt.value)) g.Color['Fijo' + k] = +txt.value;
    else malValor(txt.value);
    cambio();
  };
  chk.addEventListener('change', leer); txt.addEventListener('change', leer);
}
$('#inAlfaMin').addEventListener('change', (e) => {
  const g = grupo(); if (!g) return;
  if (valido255(e.target.value)) { g.Color.AlfaMin = +e.target.value; cambio(); } else malValor(e.target.value);
});
const leerShiftY = () => {
  const g = grupo(); if (!g) return;
  const t = $('#inShiftY').value.trim();
  $('#inShiftY').disabled = !$('#chkShiftY').checked;
  if (!$('#chkShiftY').checked) g.ShiftY = null;
  else if (/^-?\d+$/.test(t)) g.ShiftY = +t;
  else { estado(`El valor «${t}» no es válido: tiene que ser un número entero (puede ser negativo).`, 'error'); return; }
  cambio();
};
$('#chkShiftY').addEventListener('change', leerShiftY); $('#inShiftY').addEventListener('change', leerShiftY);
for (const [id, k] of [['#inGrisMin', 'GrisMin'], ['#inGrisMax', 'GrisMax']]) {
  $(id).addEventListener('change', (e) => {
    const g = grupo(); if (!g) return;
    if (valido255(e.target.value)) { g.Color[k] = +e.target.value; cambio(); } else malValor(e.target.value);
  });
}

function renderPaleta() {
  const g = grupo(), l = $('#listaPaleta'); l.innerHTML = '';
  if (!g) return;
  l.append(el('div', { class: 'color-fila sub' }, el('span', { style: 'width:34px' }), el('span', { class: 'hex' }, 'Color'), el('span', { class: 'peso' }, 'Peso')));
  g.Color.Paleta.forEach((x, i) => {
    let css = null; try { css = '#' + hexDe(parseHex(x.Hex)).slice(-6).toLowerCase(); } catch { /* inválido */ }
    const pick = el('input', { type: 'color', value: css || '#000000', title: 'Elegir color', style: css ? '' : 'outline:2px solid var(--peligro)' });
    const hex = el('input', { class: 'hex', value: x.Hex, title: '#RRGGBB o #AARRGGBB' });
    pick.addEventListener('input', () => { hex.value = pick.value.toUpperCase(); });
    pick.addEventListener('change', () => { x.Hex = pick.value.toUpperCase(); cambio(); renderPaleta(); });
    hex.addEventListener('change', () => { x.Hex = hex.value.trim(); cambio(); renderPaleta(); });
    l.append(el('div', { class: 'color-fila' }, pick, hex,
      el('input', { class: 'peso', type: 'number', min: 0, step: 'any', value: x.Peso, onchange: (e) => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (!isNaN(v)) { x.Peso = v; cambio(); } } }),
      el('button', { title: 'Quitar este color', onclick: () => { g.Color.Paleta.splice(i, 1); cambio(); renderPaleta(); } }, '✕')));
  });
}
$('#btnColorNuevo').addEventListener('click', () => {
  const g = grupo(); if (!g) return;
  g.Color.Paleta.push({ Hex: '#808080', Peso: 10 }); cambio(); renderPaleta();
});

// ---------------- elegir archivos de la carpeta bbs ----------------
const elegir = { ruta: '', marcados: new Set() };
$('#btnAgregar').addEventListener('click', () => {
  const p = actual(); if (!p || !grupo()) return;
  if (!disco) { alert('Abrí primero tu carpeta bbs (📂 arriba) o un .zip, para poder elegir las capas.'); return; }
  if (!disco.existeCarpeta(dirCapas(p))) { alert(`No encontré la carpeta de capas «${p.datos.Raiz}» adentro de assets. Revisá la «Raíz de capas».`); return; }
  elegir.ruta = ''; elegir.marcados = new Set(); $('#elegirBuscar').value = '';
  renderElegir();
  $('#dlgElegir').showModal();
});
$('#btnElegirCerrar').addEventListener('click', () => $('#dlgElegir').close());
$('#elegirBuscar').addEventListener('input', () => renderElegir());

function renderElegir() {
  const p = actual(), base = dirCapas(p);
  const dir = elegir.ruta ? base + '/' + elegir.ruta : base;
  // ruta: raíz › carpeta › subcarpeta
  const r = $('#elegirRuta'); r.innerHTML = '';
  const partes = elegir.ruta ? elegir.ruta.split('/') : [];
  r.append(el('button', { onclick: () => { elegir.ruta = ''; renderElegir(); } }, p.datos.Raiz.split('/').pop() || 'assets'));
  partes.forEach((n, i) => r.append(' › ', el('button', { onclick: () => { elegir.ruta = partes.slice(0, i + 1).join('/'); renderElegir(); } }, n)));
  const q = $('#elegirBuscar').value.trim().toLowerCase();
  const l = $('#elegirLista'); l.innerHTML = ''; l.scrollTop = 0;
  const obs = observar(l);
  for (const c of disco.carpetasDe(dir).sort(sinMayus)) {
    if (q && !c.toLowerCase().includes(q)) continue;
    l.append(el('div', { class: 'cand carpeta-fila', onclick: () => { elegir.ruta = elegir.ruta ? elegir.ruta + '/' + c : c; $('#elegirBuscar').value = ''; renderElegir(); } }, '📁 ' + c));
  }
  const g = grupo();
  for (const f of disco.listar(dir, false).sort(sinMayus)) {
    if (q && !f.toLowerCase().includes(q)) continue;
    const rel = elegir.ruta ? elegir.ruta + '/' + f : f;
    const ya = g.Archivos.includes(rel);
    const chk = el('input', { type: 'checkbox', checked: elegir.marcados.has(rel) || ya, disabled: ya });
    const fila = el('div', { class: 'cand' + (ya ? ' excluido' : ''), title: ya ? 'Ya es candidato' : rel, onclick: (e) => {
      if (ya) return;
      if (e.target !== chk) chk.checked = !chk.checked;
      if (chk.checked) elegir.marcados.add(rel); else elegir.marcados.delete(rel);
      cuentaElegir();
    } }, chk, cajaMini('assets/' + dir + '/' + f, obs), el('span', { class: 'txt' }, f));
    l.append(fila);
  }
  if (!l.children.length) l.append(el('div', { class: 'item sub' }, 'No hay PNG ni carpetas acá.'));
  cuentaElegir();
}
function cuentaElegir() {
  const n = elegir.marcados.size;
  $('#elegirCuenta').textContent = n ? `${n} marcado(s)` : 'Marcá archivos, o agregá la carpeta entera.';
  $('#btnElegirArchivos').disabled = !n;
}
$('#btnElegirArchivos').addEventListener('click', () => {
  const g = grupo(); if (!g) return;
  for (const rel of [...elegir.marcados].sort(sinMayus)) if (!g.Archivos.includes(rel)) g.Archivos.push(rel);
  $('#dlgElegir').close(); cambio(); renderCandidatos(); renderGrupos();
});
$('#btnElegirCarpeta').addEventListener('click', () => {
  const g = grupo(); if (!g) return;
  const ruta = elegir.ruta || '.', sub = $('#elegirSub').checked;
  if (!g.Carpetas.some((c) => c.Ruta === ruta && c.Recursivo === sub)) g.Carpetas.push({ Ruta: ruta, Recursivo: sub });
  $('#dlgElegir').close(); cambio(); renderCandidatos(); renderGrupos();
});

// ======================= GENERAR =======================
function renderCantidades() {
  const l = $('#listaCantidades'); l.innerHTML = '';
  for (const p of ordenados()) {
    if (cantidades[p.id] === undefined) cantidades[p.id] = 5;
    l.append(el('label', { class: 'fila' }, el('span', {}, p.datos.Nombre || '(sin nombre)', ' ', el('span', { class: 'sub' }, `(${p.datos.Prefijo})`)),
      el('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric', value: cantidades[p.id], onchange: (e) => {
        const v = parseInt(e.target.value, 10); cantidades[p.id] = isNaN(v) || v < 0 ? 0 : v; e.target.value = cantidades[p.id]; guardarCantidades();
      } })));
  }
}

function leerSemilla() {
  const t = $('#inSemilla').value.trim();
  if (!t.length) return { ok: true, semilla: null };
  if (/^\d+$/.test(t) && +t <= 999999) return { ok: true, semilla: +t };
  return { ok: false };
}
function actualizarTitulo() {
  const s = leerSemilla();
  $('#inTitulo').value = !s.ok ? '(la semilla va de 0 a 999999)' : s.semilla === null ? 'Cameos Random [semilla: al azar]' : tituloDe(s.semilla);
}
$('#inSemilla').addEventListener('input', actualizarTitulo);

async function generarAhora() {
  await guardarPendientes();
  document.querySelectorAll('#listaCantidades input').forEach((i) => i.dispatchEvent(new Event('change')));
  const s = leerSemilla();
  if (!s.ok) { estado('La semilla tiene que ser un número de 0 a 999999 (o quedar vacía).', 'error'); return; }
  const pedido = ordenados().filter((p) => cantidades[p.id] > 0).map((p) => ({ prefab: p.datos, cantidad: cantidades[p.id] }));
  if (!pedido.length) { estado('Poné una cantidad mayor que 0 en algún prefab.', 'error'); return; }
  const vacios = pedido.filter((x) => !x.prefab.Grupos.length).map((x) => x.prefab.Nombre);
  if (vacios.length) { estado('Estos prefabs no tienen grupos: ' + vacios.join(', '), 'error'); return; }
  let r;
  try { r = generar(pedido, s.semilla, disco); } catch (e) { estado('Error al generar: ' + (e.message || e), 'error'); return; }
  resultado = r;
  ultimo = { nombre: nombreArchivo(r.semilla, pedido), json: r.json };
  $('#btnGuardar').disabled = false;
  renderPreview();
  let donde = 'Archivo: ' + ultimo.nombre + ' (todavía sin guardar: tocá «Guardar archivo»)';
  if ($('#chkAuto').checked) donde = await guardarUltimo();
  let msg = `Listo: ${r.personajes.length} personajes. Semilla usada: ${String(r.semilla).padStart(6, '0')}\n${donde}\nCopialo a …\\config\\bbs\\settings\\forms\\ con un número libre (por ejemplo 7.json) y reiniciá BBS.`;
  if (!disco && pedido.some((x) => x.prefab.Grupos.some((g) => g.Carpetas.length))) msg += '\n\nOjo: sin la carpeta bbs abierta, las «carpetas enteras» no tienen archivos.';
  if (r.avisos.length) msg += '\n\nAvisos:\n• ' + r.avisos.join('\n• ');
  estado(msg, r.avisos.length ? 'avisos' : '');
}
async function guardarUltimo() {
  if (!ultimo) return '';
  try { const t = await guardarSalida('randomizer', ultimo.nombre, ultimo.json, 'application/json'); return t.includes(ultimo.nombre) ? t : t + ' (' + ultimo.nombre + ')'; } catch (e) { return 'No pude guardar el archivo: ' + (e.message || e); }
}
$('#btnGenerar').addEventListener('click', generarAhora);
$('#btnGuardar').addEventListener('click', async () => { const t = await guardarUltimo(); estado(t, /^No pude/.test(t) ? 'error' : ''); });
$('#btnSalida').addEventListener('click', () => abrirCarpetaSalida());
$('#chkAuto').addEventListener('change', (e) => almacen.guardar('auto', e.target.checked));
addEventListener('keydown', (e) => { if (e.key === 'F5') { e.preventDefault(); generarAhora(); } });

function renderPreview() {
  const l = $('#listaPreview'); l.innerHTML = '';
  if (!resultado) return;
  resultado.personajes.forEach((pj, i) => {
    l.append(el('div', { class: 'pj', 'data-i': i, onclick: () => elegirPj(i, true) },
      el('b', {}, `${pj.nombre}   ·   ${pj.modelo}`),
      el('div', { class: 'chips' }, pj.capas.map((c) => el('span', { class: 'chip' },
        el('i', { style: 'background:' + (c.color !== null ? hexCss(c.color) : 'transparent') }),
        c.ruta.split('/').pop().replace(/\.[^.]*$/, '') + (c.erase ? ' (borra)' : ''))))));
  });
  if (resultado.personajes.length) elegirPj(0, false);
}
async function elegirPj(i, irVista) {
  document.querySelectorAll('#listaPreview .pj').forEach((d) => d.classList.toggle('activo', +d.dataset.i === i));
  const pj = resultado.personajes[i];
  $('#visorNombre').textContent = `${pj.nombre}   ·   ${pj.modelo}`;
  if (irVista && esCelu()) irA('vista');
  await dibujar(pj);
}
async function dibujar(pj) {
  try {
    const avisos = await vista.mostrar(pj);
    if (avisos) $('#visorAviso').textContent = [...new Set(avisos)].join('\n');
  } catch (e) { $('#visorAviso').textContent = 'No pude dibujarlo: ' + (e.message || e); }
}
$('#btnCentrar').addEventListener('click', () => vista.recentrar());

// Muestra un candidato con un color de muestra y, debajo, la piel del primer grupo.
function mostrarCandidato(rel) {
  const p = actual(), g = grupo(); if (!p || !g) return;
  const ruta = (r) => `assets:${p.datos.Raiz.replace(/^\/+|\/+$/g, '')}/${r}`;
  const capas = [];
  const piel = p.datos.Grupos[0];
  let relPiel = null;
  if (piel && piel !== g && !piel.Erase && (relPiel = primerCandidato(piel)) !== null) capas.push({ ruta: ruta(relPiel), color: colorMuestra(piel, relPiel), erase: false, shiftY: piel.ShiftY });
  capas.push({ ruta: ruta(rel), color: colorMuestra(g, rel), erase: g.Erase, shiftY: g.ShiftY });
  document.querySelectorAll('#listaPreview .pj.activo').forEach((d) => d.classList.remove('activo'));
  $('#visorNombre').innerHTML = '';
  $('#visorNombre').append(`Candidato: ${rel.split('/').pop()}   ·   ${p.datos.Modelo}`,
    el('small', {}, relPiel !== null ? `color de muestra, sobre ${relPiel.split('/').pop()} (${piel.Nombre})` : 'color de muestra'));
  dibujar({ nombre: 'candidato', modelo: p.datos.Modelo, capas });
}
function primerCandidato(g) {
  if (g.Archivos.length) return g.Archivos[0].replace(/\\/g, '/');
  if (!disco) return null;
  const fuera = new Set(g.Excluidos.map((x) => x.toLowerCase()));
  for (const c of g.Carpetas) for (const f of archivosDeCarpeta(actual().datos, c, disco)) if (!fuera.has(f.toLowerCase())) return f;
  return null;
}
// Un color fijo que representa al grupo (o al color propio del archivo) para la vista previa.
function colorMuestra(g, rel) {
  const c = colorPropio(g, rel) || g.Color;
  switch (String(c.Modo).toLowerCase()) {
    case 'paleta': {
      let mas = null; for (const x of c.Paleta) if (!mas || x.Peso > mas.Peso) mas = x;
      try { return mas ? parseHex(mas.Hex) : null; } catch { return null; }
    }
    case 'rgb': case 'rgba':
      return argb(String(c.Modo).toLowerCase() === 'rgba' ? c.FijoA ?? 255 : 255, c.FijoR ?? 190, c.FijoG ?? 110, c.FijoB ?? 70);
    case 'grises': { const v = Math.trunc((c.GrisMin + c.GrisMax) / 2); return argb(255, v, v, v); }
    default: return null;
  }
}

// ======================= CARPETA BBS / ZIP =======================
async function despuesDeCargar() {
  const rutas = [...fuente.usuario.keys()].filter((r) => r.startsWith('assets/')).map((r) => r.slice(7));
  disco = discoDeRutas(rutas);
  vista.usarFuente(fuente);
  minis.clear();
  const pngs = rutas.filter((r) => /\.png$/i.test(r)).length;
  estadoFuente(`${fuente.nombre}: ${pngs} PNG en assets. Solo se lee: no se cambia nada de BBS.`);
  renderModelos();
  renderCandidatos(); renderGrupos();
}
function renderModelos() {
  const d = $('#dlModelos'); d.innerHTML = '';
  for (const k of vista.claves()) d.append(el('option', { value: k }));
}

$('#btnCarpeta').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) { estadoFuente('Este navegador no deja elegir carpetas (pasa en el celu). Usá «Abrir .zip».', true); return; }
  try {
    const recordada = (await almacen.leer('carpeta')) || (await almacen.carpetaDelVisor());
    if (recordada && recordada.queryPermission && (await recordada.queryPermission({ mode: 'read' })) !== 'granted' && confirm('¿Volver a abrir "' + recordada.name + '"?')) {
      if ((await recordada.requestPermission({ mode: 'read' })) === 'granted') {
        estadoFuente('Leyendo ' + recordada.name + '…'); await fuente.usarCarpeta(recordada); await almacen.guardar('carpeta', recordada); await despuesDeCargar(); return;
      }
    }
    const raiz = await fuente.abrirCarpeta().catch((e) => { if (e.name !== 'AbortError') throw e; return null; });
    if (!raiz) return;
    estadoFuente('Leyendo ' + raiz.name + '…');
    await almacen.guardar('carpeta', raiz);
    await despuesDeCargar();
  } catch (e) { estadoFuente(e.message || String(e), true); }
});

$('#inZip').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  estadoFuente('Abriendo ' + f.name + '… (puede tardar con zips grandes)');
  try { await fuente.abrirZip(f); await despuesDeCargar(); } catch (err) { estadoFuente(err.message || String(err), true); }
  e.target.value = '';
});

// ======================= ARRANQUE =======================
(async () => {
  avisarMenu({ titulo: 'Randomizer de cameos' });
  // prefabs: la primera vez se cargan los dos del usuario (Mujer y Varón)
  prefabs = await almacen.todos('prefabs');
  if (!prefabs.length && !(await almacen.leer('iniciado'))) {
    const iniciales = PREFABS_INICIALES.map((x) => leerPrefab(x)).sort((a, b) => sinMayus(a.Nombre, b.Nombre));
    for (const d of iniciales) await agregarPrefab(d);
  }
  await almacen.guardar('iniciado', true);
  cantidades = (await almacen.leer('cantidades')) || {};
  const auto = await almacen.leer('auto');
  const pc = await esPC();
  $('#chkAuto').checked = auto ?? pc;
  $('#btnSalida').hidden = !pc;
  if (!window.showDirectoryPicker) $('#btnCarpeta').hidden = true;
  actualizarTitulo();
  actualizarPapelera();
  if (prefabs.length) elegirPrefab(ordenados()[0].id, false); else { renderPrefabs(); renderEditor(); }

  await fuente.cargarInterno();
  vista.usarFuente(fuente);
  renderModelos();
  const recordada = (await almacen.leer('carpeta')) || (await almacen.carpetaDelVisor());
  if (recordada && recordada.queryPermission && (await recordada.queryPermission({ mode: 'read' })) === 'granted') {
    estadoFuente('Leyendo ' + recordada.name + '…');
    try { await fuente.usarCarpeta(recordada); await despuesDeCargar(); } catch { estadoFuente('No pude leer ' + recordada.name + '. Tocá «📂 Abrir carpeta bbs».', true); }
  } else if (recordada && recordada.name) {
    estadoFuente(`Tocá «📂 Abrir carpeta bbs» para volver a abrir «${recordada.name}», o abrí un .zip.`);
  } else if (!window.showDirectoryPicker) {
    estadoFuente('Abrí un .zip con tu carpeta bbs (el paquete del Visor sirve) para ver las capas.');
  }
})();
