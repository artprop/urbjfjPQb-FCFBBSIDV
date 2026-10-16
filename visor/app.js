// Visor BBS: mirar forms, modelos y texturas de BBS fuera del juego (PC y celu).
import { Fuente } from './fuente.js';
import { Texturas, Modelos, Forms, nombreForm } from './bbs.js';
import { Visor, Miniaturas } from './escena.js';

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...hijos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined) e.append(h.nodeType ? h : document.createTextNode(String(h)));
  return e;
};
const cmp = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

const fuente = new Fuente();
let tex, modelos, forms;
const minis = new Miniaturas(160);
let visor = null;
const estado = { tab: 'forms', carpeta: {}, seleccion: null, buscar: '' };
let datosForms = null;   // [{ruta, grupo, titulo, forms:[]}]
let token = 0;           // para descartar detalles viejos

function aviso(txt, error = false) { const e = $('#estado'); e.innerHTML = txt; e.classList.toggle('error', error); }
function reiniciarMotores() {
  tex = new Texturas(fuente); modelos = new Modelos(fuente, tex); forms = new Forms(modelos, tex);
  minis.cancelar(); minis.cache.clear(); datosForms = null;
}

// ---------------- recordar la carpeta (IndexedDB) ----------------
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('visor-bbs', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function guardar(k, v) { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch { /* sin memoria */ } }
async function leer(k) { try { const db = await idb(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch { return null; } }

// ---------------- carga de datos ----------------
async function cargarForms() {
  if (datosForms) return datosForms;
  const rutas = fuente.rutas().filter((p) => p.startsWith('settings/forms/') && p.toLowerCase().endsWith('.json')).sort(cmp);
  const out = [];
  for (const ruta of rutas) {
    try {
      const j = JSON.parse(await fuente.texto(ruta));
      if (!j || !Array.isArray(j.forms)) continue;
      const rel = ruta.slice('settings/forms/'.length);
      const grupo = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      out.push({ ruta, grupo, titulo: j.title || rel, forms: j.forms });
    } catch { /* json roto */ }
  }
  // orden: primero la carpeta principal por número de archivo
  out.sort((a, b) => (a.grupo === b.grupo ? cmp(a.ruta, b.ruta) : a.grupo === '' ? -1 : b.grupo === '' ? 1 : cmp(a.grupo, b.grupo)));
  datosForms = out;
  return out;
}

function gruposModelos() {
  const g = new Map();
  for (const k of modelos.claves()) {
    const i = k.indexOf('/');
    const grupo = i < 0 ? '(sueltos)' : k.slice(0, i);
    if (!g.has(grupo)) g.set(grupo, []);
    g.get(grupo).push(k);
  }
  return g;
}

function carpetasTexturas() {
  const g = new Map();
  for (const p of fuente.rutas()) {
    if (!p.startsWith('assets/models/') || !p.toLowerCase().endsWith('.png')) continue;
    const rel = p.slice('assets/models/'.length);
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '(raíz)';
    if (!g.has(dir)) g.set(dir, []);
    g.get(dir).push(p);
  }
  for (const v of g.values()) v.sort(cmp);
  return g;
}

// ---------------- barra lateral ----------------
async function armarLateral() {
  const arbol = $('#arbol'), sel = $('#selLateral');
  arbol.innerHTML = ''; sel.innerHTML = '';
  const items = [];   // {clave, texto, cuenta, grupo}
  if (estado.tab === 'forms') {
    const fs = await cargarForms();
    fs.forEach((f, i) => items.push({ clave: String(i), texto: f.titulo, cuenta: f.forms.length, grupo: f.grupo ? 'Carpeta ' + f.grupo : 'Categorías' }));
  } else if (estado.tab === 'modelos') {
    for (const [g, ks] of [...gruposModelos()].sort((a, b) => cmp(a[0], b[0]))) items.push({ clave: g, texto: g, cuenta: ks.length });
  } else {
    for (const [d, ps] of [...carpetasTexturas()].sort((a, b) => cmp(a[0], b[0]))) items.push({ clave: d, texto: d, cuenta: ps.length });
  }
  if (!items.length) { arbol.append(el('div', { class: 'vacioTxt' }, 'Nada para mostrar todavía.')); renderGrilla([]); return; }
  let actual = estado.carpeta[estado.tab];
  if (!items.some((x) => x.clave === actual)) {
    actual = estado.tab === 'texturas' ? (items.find((x) => x.clave === 'player/_LosSaucera') || items[0]).clave : items[0].clave;
    if (estado.tab === 'modelos') actual = (items.find((x) => x.clave === 'player') || items[0]).clave;
    estado.carpeta[estado.tab] = actual;
  }
  const filtro = $('#filtroLateral').value.trim().toLowerCase();
  let grupoPrevio = null;
  for (const it of items) {
    if (it.grupo && it.grupo !== grupoPrevio) { arbol.append(el('div', { class: 'grupo' }, it.grupo)); grupoPrevio = it.grupo; }
    const div = el('div', { class: 'item' + (it.clave === actual ? ' activo' : ''), title: it.texto, onclick: () => elegirCarpeta(it.clave) }, it.texto, ' ', el('small', {}, '(' + it.cuenta + ')'));
    if (filtro && !it.texto.toLowerCase().includes(filtro)) div.style.display = 'none';
    arbol.append(div);
    sel.append(el('option', { value: it.clave, ...(it.clave === actual ? { selected: '' } : {}) }, (it.grupo && it.grupo !== 'Categorías' ? it.grupo.replace('Carpeta ', '') + ' / ' : '') + it.texto + ' (' + it.cuenta + ')'));
  }
  await mostrarCarpeta();
}

function elegirCarpeta(clave) {
  estado.carpeta[estado.tab] = clave;
  armarLateral();
}

// ---------------- grilla ----------------
let observador = null;
function renderGrilla(tarjetas) {
  const g = $('#grilla');
  g.innerHTML = '';
  minis.cancelar();
  if (observador) observador.disconnect();
  observador = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { observador.unobserve(e.target); e.target._cargar && e.target._cargar(); }
  }, { root: g, rootMargin: '200px' });
  const q = estado.buscar.toLowerCase();
  let n = 0;
  for (const t of tarjetas) {
    if (q && !t.busqueda.toLowerCase().includes(q)) continue;
    n++;
    const mini = el('div', { class: 'mini' }, el('div', { class: 'cargando' }));
    const card = el('div', { class: 'tarjeta' + (estado.seleccion === t.clave ? ' activa' : ''), title: t.titulo, onclick: () => { document.querySelectorAll('.tarjeta.activa').forEach((x) => x.classList.remove('activa')); card.classList.add('activa'); estado.seleccion = t.clave; t.abrir(); } },
      mini, el('div', { class: 'nombre' }, t.nombre), t.sub ? el('div', { class: 'sub' }, t.sub) : null);
    card._cargar = () => t.mini((url) => { mini.innerHTML = ''; if (url) mini.append(el('img', { src: url, alt: '' })); else mini.append(el('span', { class: 'sub' }, 'sin vista')); });
    g.append(card); observador.observe(card);
  }
  if (!n) g.append(el('div', { class: 'vacioTxt' }, tarjetas.length ? 'No hay resultados para esa búsqueda.' : 'Esta carpeta está vacía.'));
  $('#cuenta').textContent = n + (n === 1 ? ' elemento' : ' elementos');
}

async function mostrarCarpeta() {
  const c = estado.carpeta[estado.tab];
  if (estado.tab === 'forms') {
    const cat = (await cargarForms())[+c];
    if (!cat) return renderGrilla([]);
    renderGrilla(cat.forms.map((f, i) => {
      const clave = 'f:' + cat.ruta + ':' + i;
      const nom = nombreForm(f);
      return {
        clave, nombre: nom, titulo: nom, sub: subForm(f), busqueda: nom + ' ' + JSON.stringify(f.texture || '') + ' ' + (f.model || ''),
        mini: (listo) => minis.pedir(clave, () => forms.construir(f), listo),
        abrir: () => abrirForm(f, cat, i),
      };
    }));
  } else if (estado.tab === 'modelos') {
    const ks = gruposModelos().get(c) || [];
    renderGrilla(ks.map((k) => {
      const corto = c === '(sueltos)' ? k : k.slice(c.length + 1);
      const interno = !modelos.links(k).some((p) => fuente.esDelUsuario(p) && !/\.(json|png)$/i.test(p) || fuente.esDelUsuario(p) && /\.bbs\.json$/i.test(p));
      return {
        clave: 'm:' + k, nombre: corto, titulo: k, sub: interno ? 'del mod' : '', busqueda: k,
        mini: (listo) => minis.pedir('m:' + k, async () => (await modelos.construir(k)).obj, listo),
        abrir: () => abrirModelo(k),
      };
    }));
  } else {
    const ps = carpetasTexturas().get(c) || [];
    renderGrilla(ps.map((p) => {
      const nom = p.split('/').pop();
      return {
        clave: 't:' + p, nombre: nom.replace(/\.png$/i, ''), titulo: p, sub: '', busqueda: nom,
        mini: async (listo) => { const b = await fuente.blob(p); listo(b ? URL.createObjectURL(b) : null); },
        abrir: () => abrirTextura(p),
      };
    }));
  }
}

function subForm(f) {
  const id = (f.id || '').replace('bbs:', '');
  if (f.id === 'bbs:model') {
    const capas = Array.isArray(f.texture) ? f.texture.length + ' capas' : f.texture ? '1 textura' : '';
    return [capas, (f.parts || []).length ? (f.parts.length + ' partes') : ''].filter(Boolean).join(' · ') || 'modelo';
  }
  return id;
}

// ---------------- detalle ----------------
function abrirDetalle(titulo) {
  const d = $('#detalle'); d.classList.remove('vacio');
  $('#detTitulo').textContent = titulo;
  if (!visor) visor = new Visor($('#vista3d'));
  $('#controles').innerHTML = ''; $('#info').innerHTML = '';
  return ++token;
}
const fila = (k, v) => el('div', { class: 'fila' }, el('span', {}, k), el('span', {}, v));
const hex = (c) => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const linkAruta = (l) => { const r = Texturas.ruta(l); return r && r.src === 'assets' ? 'assets/' + r.path : null; };

async function miniImg(link) {
  const p = linkAruta(link);
  const b = p ? await fuente.blob(p) : null;
  return b ? el('img', { src: URL.createObjectURL(b), alt: '' }) : el('img', { alt: 'falta' });
}

async function bloqueTexturas(valor, titulo = 'Textura') {
  const cont = el('div');
  cont.append(el('h4', {}, titulo));
  if (!valor) { cont.append(el('div', { class: 'fila' }, 'La del modelo (por defecto)')); return cont; }
  const capas = Array.isArray(valor) ? valor : [typeof valor === 'string' ? { path: valor } : valor];
  for (const c0 of capas) {
    const c = typeof c0 === 'string' ? { path: c0 } : c0 || {};
    const p = linkAruta(c.path || '');
    const existe = p ? fuente.existe(p) : false;
    const col = c.color !== undefined && c.color !== -1 ? c.color : null;
    cont.append(el('div', { class: 'capa' }, await miniImg(c.path || ''),
      col !== null ? el('span', { class: 'muestra', style: 'background:' + hex(col), title: 'Color ' + hex(col) }) : null,
      el('div', {}, el('div', {}, (c.path || '').replace('assets:models/', '')), el('div', { class: 'sub', style: 'color:' + (existe ? 'var(--suave)' : 'var(--peligro)') }, existe ? (col !== null ? 'tinte ' + hex(col) : 'sin tinte') : 'NO se encontró el archivo'))));
  }
  return cont;
}

async function abrirForm(f, cat, i) {
  const t = abrirDetalle(nombreForm(f));
  const obj = await forms.construir(f);
  if (t !== token) return;
  visor.mostrar(obj);
  const info = $('#info');
  info.append(el('h4', {}, 'Form'), fila('Tipo', (f.id || '?').replace('bbs:', '')), fila('Categoría', cat.titulo + ' (#' + i + ')'));
  if (f.name) info.append(fila('Nombre', f.name));
  if (f.model) info.append(fila('Modelo', f.model));
  if (f.color !== undefined && f.color !== -1) info.append(el('div', { class: 'fila' }, el('span', {}, 'Color'), el('span', { class: 'muestra', style: 'background:' + hex(f.color) }), el('span', {}, hex(f.color))));
  if (f.id === 'bbs:model' || f.texture) info.append(await bloqueTexturas(f.texture));
  const mt = f.material_textures && typeof f.material_textures === 'object' ? Object.entries(f.material_textures) : [];
  if (mt.length) {
    const porTex = new Map();
    for (const [m, l] of mt) { if (!porTex.has(l)) porTex.set(l, []); porTex.get(l).push(m); }
    info.append(await bloqueTexturas([...porTex.keys()], 'Texturas por material (' + mt.length + ' materiales)'));
  }
  const pose = f.pose && (f.pose.pose || f.pose);
  if (pose && Object.keys(pose).length) info.append(fila('Pose', Object.keys(pose).length + ' huesos movidos'));
  if (Array.isArray(f.parts) && f.parts.length) {
    info.append(el('h4', {}, 'Partes (' + f.parts.length + ')'));
    for (const p of f.parts) info.append(fila(p.bone ? 'en ' + p.bone : 'suelta', nombreForm(p.form) + ' · ' + ((p.form && p.form.id) || '').replace('bbs:', '')));
  }
  info.append(el('details', {}, el('summary', {}, 'Ver JSON del form'), el('pre', {}, JSON.stringify(f, null, 1))));
}

async function abrirModelo(k, opciones = {}) {
  const t = abrirDetalle(k);
  const d = await modelos.datos(k);
  if (t !== token) return;
  const ctr = $('#controles');
  // texturas posibles: las .png del modelo
  const pngs = d.links.filter((p) => p.toLowerCase().endsWith('.png')).map((p) => 'assets:' + p.slice(7));
  if (d.texDefault && !pngs.includes(d.texDefault)) pngs.unshift(d.texDefault);
  const selTex = el('select', {}, pngs.map((p) => el('option', { value: p, ...(p === (opciones.textura || d.texDefault) ? { selected: '' } : {}) }, p.split('/').slice(-2).join('/'))));
  const poses = d.poses && typeof d.poses === 'object' ? Object.keys(d.poses).sort(cmp) : [];
  const selPose = el('select', {}, el('option', { value: '' }, '(sin pose)'), poses.map((p) => el('option', { value: p }, p)));
  const redibujar = async (reencuadrar) => {
    const tt = ++token;
    const pose = selPose.value ? d.poses[selPose.value] : null;
    const r = await modelos.construir(k, { textura: selTex.value || null, pose: pose && (pose.pose || pose) });
    if (tt !== token) return;
    const sc = d.config && d.config.scale; if (Array.isArray(sc)) r.obj.scale.set(sc[0], sc[1], sc[2]);
    visor.mostrar(r.obj, reencuadrar);
  };
  selTex.onchange = () => redibujar(false); selPose.onchange = () => redibujar(false);
  if (pngs.length > 1) ctr.append(el('label', {}, 'Textura', selTex));
  if (poses.length) ctr.append(el('label', {}, 'Pose', selPose));
  await redibujar(true);
  const info = $('#info');
  info.append(el('h4', {}, 'Modelo'), fila('Clave', k), fila('Tipo', { cubic: 'cubos / mallas (.bbs.json u .obj)', bobj: 'BOBJ (con huesos)', otro: 'no soportado todavía (.geo.json / .vox)' }[d.tipo] || (d.error ? 'error: ' + d.error : 'sin modelo')));
  if (d.modelo) {
    info.append(fila('Huesos', String(d.modelo.grupos.size)), fila('Tamaño textura', d.modelo.tw + '×' + d.modelo.th));
    info.append(el('details', {}, el('summary', {}, 'Lista de huesos'), el('pre', {}, [...d.modelo.grupos.values()].map((g) => (g.parent ? g.parent + ' › ' : '') + g.id + (g.cubes.length ? '  [' + g.cubes.length + ' cubos]' : '') + (g.meshes.length ? '  [' + g.meshes.length + ' mallas]' : '')).join('\n'))));
  }
  if (poses.length) info.append(fila('Poses', String(poses.length)));
  info.append(await bloqueTexturas(d.texDefault, 'Textura por defecto'));
  info.append(el('details', {}, el('summary', {}, 'Archivos (' + d.links.length + ')'), el('pre', {}, d.links.map((p) => p.slice(('assets/models/' + k + '/').length) + (fuente.esDelUsuario(p) ? '' : '   (del mod)')).join('\n'))));
  if (Object.keys(d.config).length) info.append(el('details', {}, el('summary', {}, 'config.json'), el('pre', {}, JSON.stringify(d.config, null, 1))));
}

const BASES = ['player/steve', 'player/alex', 'player/steve_bends', 'player/alex_bends', 'player/steve_3d', 'player/alex_3d'];
async function abrirTextura(p) {
  const t = abrirDetalle(p.split('/').pop());
  const link = 'assets:' + p.slice(7);
  const ctr = $('#controles');
  const guardada = localStorage.getItem('visorbbs.base') || 'player/steve';
  const selBase = el('select', {}, BASES.filter((b) => modelos.claves().includes(b)).map((b) => el('option', { value: b, ...(b === guardada ? { selected: '' } : {}) }, b.replace('player/', ''))));
  ctr.append(el('label', {}, 'Ver puesta en', selBase));
  const redibujar = async (re) => {
    const tt = ++token;
    try { localStorage.setItem('visorbbs.base', selBase.value); } catch { /* nada */ }
    const r = await modelos.construir(selBase.value, { textura: link });
    if (tt !== token) return;
    const sc = r.datos && r.datos.config && r.datos.config.scale; if (Array.isArray(sc)) r.obj.scale.set(sc[0], sc[1], sc[2]);
    visor.mostrar(r.obj, re);
  };
  selBase.onchange = () => redibujar(false);
  await redibujar(true);
  const b = await fuente.blob(p);
  const info = $('#info');
  const img = el('img', { class: 'imgGrande', src: b ? URL.createObjectURL(b) : '', alt: '' });
  img.onload = () => info.querySelector('.tam') && (info.querySelector('.tam').textContent = img.naturalWidth + '×' + img.naturalHeight + ' px');
  info.append(img, el('h4', {}, 'Archivo'), fila('Ruta', p.slice('assets/'.length)), el('div', { class: 'fila' }, el('span', {}, 'Tamaño'), el('span', { class: 'tam' }, '…')), fila('Link en BBS', link));
}

// ---------------- pestañas y botones ----------------
document.querySelectorAll('#pestanas button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#pestanas button').forEach((x) => x.classList.toggle('activa', x === b));
  estado.tab = b.dataset.tab; estado.seleccion = null; $('#buscar').value = ''; estado.buscar = ''; $('#filtroLateral').value = '';
  armarLateral();
}));
$('#selLateral').addEventListener('change', (e) => elegirCarpeta(e.target.value));
$('#filtroLateral').addEventListener('input', () => {
  const q = $('#filtroLateral').value.trim().toLowerCase();
  document.querySelectorAll('#arbol .item').forEach((d) => { d.style.display = !q || d.title.toLowerCase().includes(q) ? '' : 'none'; });
});
let tBuscar = 0;
$('#buscar').addEventListener('input', () => { clearTimeout(tBuscar); tBuscar = setTimeout(() => { estado.buscar = $('#buscar').value.trim(); mostrarCarpeta(); }, 200); });
$('#btnCerrar').addEventListener('click', () => $('#detalle').classList.add('vacio'));
$('#btnCentrar').addEventListener('click', () => visor && visor.recentrar());

async function despuesDeCargar() {
  reiniciarMotores();
  const nForms = fuente.rutas().filter((p) => p.startsWith('settings/forms/')).length;
  const nModelos = modelos.claves().length;
  aviso(`<b>${fuente.nombre}</b>: ${nModelos} modelos, ${nForms} archivos de forms. Solo se lee: no se cambia nada de BBS.`);
  $('#btnPaquete').hidden = fuente.tipo !== 'carpeta';
  await armarLateral();
}

$('#btnCarpeta').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) { aviso('Este navegador no deja elegir carpetas (pasa en el celu). Usá <b>Abrir .zip</b>.', true); return; }
  try {
    const recordada = await leer('carpeta');
    if (recordada && (await recordada.queryPermission({ mode: 'read' })) !== 'granted' && confirm('¿Volver a abrir "' + recordada.name + '"?')) {
      if ((await recordada.requestPermission({ mode: 'read' })) === 'granted') { aviso('Leyendo ' + recordada.name + '…'); await fuente.usarCarpeta(recordada); await despuesDeCargar(); return; }
    }
    const raiz = await fuente.abrirCarpeta().catch((e) => { if (e.name !== 'AbortError') throw e; return null; });
    if (!raiz) return;
    aviso('Leyendo ' + raiz.name + '…');
    await guardar('carpeta', raiz);
    await despuesDeCargar();
  } catch (e) { aviso(e.message || String(e), true); }
});

$('#inZip').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  aviso('Abriendo ' + f.name + '… (puede tardar con zips grandes)');
  try { await fuente.abrirZip(f); await despuesDeCargar(); } catch (err) { aviso(err.message || String(err), true); }
  e.target.value = '';
});

$('#btnPaquete').addEventListener('click', async () => {
  try {
    const blob = await fuente.paquete((i, n) => aviso(`Armando paquete… ${i} de ${n} archivos`));
    const a = el('a', { href: URL.createObjectURL(blob), download: 'VisorBBS_paquete.zip' });
    document.body.append(a); a.click(); a.remove();
    aviso(`Paquete listo (${(blob.size / 1048576).toFixed(1)} MB). Pasalo al celu y abrilo con <b>Abrir .zip</b>.`);
  } catch (e) { aviso('No se pudo armar el paquete: ' + (e.message || e), true); }
});

// arranque: modelos del mod y, si se puede, la carpeta recordada
(async () => {
  await fuente.cargarInterno();
  reiniciarMotores();
  const recordada = await leer('carpeta');
  if (recordada && recordada.queryPermission && (await recordada.queryPermission({ mode: 'read' })) === 'granted') {
    aviso('Leyendo ' + recordada.name + '…');
    try { await fuente.usarCarpeta(recordada); await despuesDeCargar(); return; } catch { /* sigue sin carpeta */ }
  } else if (recordada) {
    aviso(`Tocá <b>📂 Abrir carpeta bbs</b> para volver a abrir <b>${recordada.name}</b>, o abrí un <b>.zip</b>. Mientras tanto se ven los modelos que trae el mod.`);
  }
  estado.tab = 'modelos';
  document.querySelectorAll('#pestanas button').forEach((x) => x.classList.toggle('activa', x.dataset.tab === 'modelos'));
  await armarLateral();
})();
