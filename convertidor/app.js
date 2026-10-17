// Modo "Armourer's → BBS": arregla .obj de Armourer's Workshop 1.20.1 y los deja listos para BBS.
import * as THREE from '../visor/lib/three.module.min.js';
import { OrbitControls } from '../visor/lib/OrbitControls.js';
import { zipSync } from '../visor/lib/fflate.js';
import { parseOBJ } from '../visor/bbs.js';
import { guardarSalida, esPC, abrirCarpetaSalida } from '../comun/plataforma.js';
import { arreglarOBJ, nombreLimpio } from './nucleo.js';

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...hijos) => { const e = Object.assign(document.createElement(tag), props); e.append(...hijos.flat()); return e; };
const base = (n) => n.replace(/\.[^.]+$/, '');

// modelos: { nombre, obj: File, png: File|null, crudo: texto original, resultado: {texto, info} | null, error }
let modelos = [];
let activo = null;

// ---------- archivos ----------
async function agregar(archivos) {
  const objs = [], pngs = new Map();
  for (const f of archivos) {
    const n = f.name.toLowerCase();
    if (n.endsWith('.obj')) objs.push(f);
    else if (n.endsWith('.png')) pngs.set(base(f.name).toLowerCase(), f);
  }
  // un .png suelto que llega después se pega al modelo que no tenía
  for (const [k, png] of pngs) {
    const m = modelos.find((x) => base(x.obj.name).toLowerCase() === k);
    if (m) m.png = png;
  }
  for (const obj of objs) {
    const k = base(obj.name).toLowerCase();
    let png = pngs.get(k) || null;
    if (!png && objs.length === 1 && pngs.size === 1) png = [...pngs.values()][0];
    const m = { nombre: nombreLimpio(base(obj.name)), obj, png, crudo: await obj.text(), resultado: null, error: '' };
    convertir(m);
    modelos = modelos.filter((x) => x.obj.name !== obj.name);
    modelos.push(m);
    activo = m;
  }
  if (!objs.length && !pngs.size) estado('Esos archivos no son .obj ni .png.', 'mal');
  else estado('');
  dibujarLista();
  mostrar(activo);
}

function opciones() { return { escala: $('#selEscala').value, apoyar: $('#chkApoyar').checked }; }
function convertir(m) {
  m.error = ''; m.resultado = null;
  try { m.resultado = arreglarOBJ(m.crudo, m.nombre, opciones()); } catch (e) { m.error = e.message || String(e); }
}

function detalle(m) {
  if (m.error) return el('div', { className: 'det mal' }, '✖ ' + m.error);
  const i = m.resultado.info;
  const lineas = [];
  lineas.push(el('div', { className: 'det' }, `${i.caras} caras · ${i.vertices} vértices`));
  if (i.comas) lineas.push(el('div', { className: 'det ok' }, `✔ Arreglé ${i.comas} números escritos con coma`));
  else lineas.push(el('div', { className: 'det' }, '✔ Los números ya estaban bien (con punto)'));
  if (i.enPixeles && i.escala !== 1) lineas.push(el('div', { className: 'det ok' }, '✔ Venía en píxeles (16 veces más grande): lo pasé a bloques'));
  lineas.push(el('div', { className: 'det' }, `Tamaño: ${i.tamano.join(' × ')} bloques` + (i.movido ? ' · apoyado en el piso' : '')));
  if (i.sinObjeto) lineas.push(el('div', { className: 'det ok' }, '✔ Le agregué el nombre de pieza que BBS necesita'));
  if (i.carasRotas) lineas.push(el('div', { className: 'det av' }, `⚠ Saqué ${i.carasRotas} caras rotas (menos de 3 puntas)`));
  lineas.push(m.png ? el('div', { className: 'det ok' }, '✔ Textura: ' + m.png.name)
    : el('div', { className: 'det av' }, '⚠ Falta el .png con el mismo nombre: en BBS se va a ver sin colores. Soltalo acá.'));
  return lineas;
}

function dibujarLista() {
  const lista = $('#lista'); lista.innerHTML = '';
  for (const m of modelos) {
    const inp = el('input', { value: m.nombre, title: 'Nombre de la carpeta en BBS' });
    inp.onclick = (e) => e.stopPropagation();
    inp.onchange = () => { m.nombre = nombreLimpio(inp.value); inp.value = m.nombre; };
    const quitar = el('button', { textContent: '✖', title: 'Sacar de la lista' });
    quitar.onclick = (e) => { e.stopPropagation(); modelos = modelos.filter((x) => x !== m); if (activo === m) activo = modelos[0] || null; dibujarLista(); mostrar(activo); };
    const tarjeta = el('div', { className: 'modelo' + (m === activo ? ' activo' : '') },
      el('div', { className: 'fila' }, '🧱', inp, quitar), detalle(m));
    tarjeta.onclick = () => { activo = m; dibujarLista(); mostrar(m); };
    lista.append(tarjeta);
  }
  $('#acciones').hidden = !modelos.length;
  $('#btnGuardar').disabled = !modelos.some((m) => m.resultado);
}

function estado(txt, clase = '') { const e = $('#estado'); e.textContent = txt; e.className = clase; }

// ---------- guardar ----------
// Cada modelo queda en una carpeta normal: <Nombre>\<Nombre>.obj y <Nombre>\<Nombre>.png
async function archivosDe(listos) {
  const usados = new Set(), salida = [];
  for (const m of listos) {
    let n = m.nombre, k = 2;
    while (usados.has(n.toLowerCase())) n = m.nombre + '_' + k++;
    usados.add(n.toLowerCase());
    const arch = [[n + '.obj', new Blob([m.resultado.texto], { type: 'text/plain' })]];
    if (m.png) arch.push([n + '.png', m.png]);
    salida.push({ carpeta: n, arch });
  }
  return salida;
}

async function guardar() {
  const listos = modelos.filter((m) => m.resultado);
  if (!listos.length) return;
  const grupos = await archivosDe(listos);
  try {
    if (await esPC()) {
      let donde = '';
      for (const g of grupos) for (const [n, b] of g.arch) donde = await guardarSalida('convertidor', n, b, b.type, g.carpeta);
      const raiz = donde.replace(/^Guardado en /, '').replace(/[\\/][^\\/]+[\\/][^\\/]+$/, '');
      estado(`Listo: ${grupos.map((g) => g.carpeta).join(', ')} en ${raiz}\nCopiá esas carpetas a config\\bbs\\assets\\models (o usá "Guardar en otra carpeta" para mandarlas directo).`, 'ok');
      return;
    }
    if (window.showDirectoryPicker) return guardarEnCarpeta();
    const arbol = {};
    for (const g of grupos) { arbol[g.carpeta] = {}; for (const [n, b] of g.arch) arbol[g.carpeta][n] = new Uint8Array(await b.arrayBuffer()); }
    const zip = zipSync(arbol, { level: 6 });
    const donde = await guardarSalida('convertidor', (grupos.length === 1 ? grupos[0].carpeta : 'Modelos_Armourers') + '_BBS.zip', new Blob([zip], { type: 'application/zip' }));
    estado(donde + '\nEn el celu no se pueden crear carpetas: va en un .zip.', 'ok');
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

// La elegís vos (por ejemplo config\bbs\assets\models\Comida) y se crea una carpeta por modelo adentro
async function guardarEnCarpeta() {
  const listos = modelos.filter((m) => m.resultado);
  if (!listos.length) return;
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'convertidor', mode: 'readwrite' }); } catch (e) { if (e.name !== 'AbortError') estado('No se pudo abrir la carpeta: ' + e.message, 'mal'); return; }
  try {
    const grupos = await archivosDe(listos);
    for (const g of grupos) {
      const sub = await dir.getDirectoryHandle(g.carpeta, { create: true });
      for (const [n, b] of g.arch) { const w = await (await sub.getFileHandle(n, { create: true })).createWritable(); await w.write(b); await w.close(); }
    }
    estado(`Listo: ${grupos.map((g) => g.carpeta).join(', ')} adentro de "${dir.name}". Si BBS estaba abierto, recargá los modelos.`, 'ok');
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
}

// ---------- vista 3D ----------
const vista = $('#vista');
const render = new THREE.WebGLRenderer({ antialias: true });
render.setPixelRatio(Math.min(2, devicePixelRatio));
vista.prepend(render.domElement);
const escena = new THREE.Scene(); escena.background = new THREE.Color(0x2b3442);
escena.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(2, 4, 3); escena.add(sol);
const piso = new THREE.GridHelper(4, 64, 0x55607a, 0x3a4356); escena.add(piso);
const camara = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
camara.position.set(1.6, 1.4, 2.2);
const control = new OrbitControls(camara, render.domElement); control.target.set(0, 0.5, 0); control.update();
let grupo = null;

function tamano() { const r = vista.getBoundingClientRect(); render.setSize(r.width, r.height, false); camara.aspect = r.width / Math.max(1, r.height); camara.updateProjectionMatrix(); }
new ResizeObserver(tamano).observe(vista); tamano();
(function bucle() { requestAnimationFrame(bucle); render.render(escena, camara); })();

async function mostrar(m) {
  if (grupo) { escena.remove(grupo); grupo.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); grupo = null; }
  if (!m || !m.resultado) return;
  let mapa = null;
  if (m.png) {
    const img = await createImageBitmap(m.png);
    mapa = new THREE.Texture(img); mapa.flipY = false; mapa.magFilter = THREE.NearestFilter; mapa.minFilter = THREE.NearestFilter; mapa.colorSpace = THREE.SRGBColorSpace; mapa.needsUpdate = true;
  }
  const mat = new THREE.MeshLambertMaterial({ map: mapa, color: mapa ? 0xffffff : 0xc0a080, side: THREE.DoubleSide, alphaTest: 0.1 });
  grupo = new THREE.Group();
  for (const mallas of parseOBJ(m.resultado.texto, '').values()) {
    for (const ma of mallas) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ma.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(ma.uv, 2));
      g.computeVertexNormals();
      grupo.add(new THREE.Mesh(g, mat));
    }
  }
  escena.add(grupo);
  // encuadre
  const caja = new THREE.Box3().setFromObject(grupo);
  const c = caja.getCenter(new THREE.Vector3()), t = caja.getSize(new THREE.Vector3()).length() || 1;
  piso.position.y = caja.min.y;
  control.target.copy(c);
  camara.position.copy(c).add(new THREE.Vector3(0.7, 0.55, 1).normalize().multiplyScalar(t * 1.4));
  control.update();
}

// ---------- eventos ----------
$('#inArchivos').onchange = (e) => { agregar([...e.target.files]); e.target.value = ''; };
const zona = $('#zona');
for (const ev of ['dragenter', 'dragover']) document.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); });
for (const ev of ['dragleave', 'drop']) document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === document.documentElement) zona.classList.remove('encima'); });
document.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) agregar([...e.dataTransfer.files]); });
$('#btnGuardar').onclick = guardar;
$('#btnOtra').onclick = guardarEnCarpeta;
$('#btnOtra').hidden = !window.showDirectoryPicker;
for (const id of ['#selEscala', '#chkApoyar']) $(id).onchange = () => { for (const m of modelos) convertir(m); dibujarLista(); mostrar(activo); };
$('#btnLimpiar').onclick = () => { modelos = []; activo = null; dibujarLista(); mostrar(null); estado(''); };
$('#btnCarpeta').onclick = abrirCarpetaSalida;
esPC().then((pc) => { $('#btnCarpeta').hidden = !pc; });
