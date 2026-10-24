// Modo «Modelar → Blockbench»: un modelo 3D (.glb) pasado a cubos de Minecraft con textura pixelada, como .bbmodel o carpeta de BBS.
// Dos estilos: «cajas giradas» (el modelo se arma con cajas que pueden girar, de a una: salen versiones de 1, 2, 3… cajas y se elige
// una; ver nucleo/ajuste.js, corre en ajuste_worker.js) y «cubitos» (vóxeles derechos, nucleo/cajas.js). Todo son cuentas, sin IA
// entrenada: se muestrea la superficie en una grilla (nucleo/voxel.js) y de ahí sale todo.
import * as THREE from '../mocap/three.module.min.js';
import { leerGLB } from './nucleo/glb.js';
import { voxelizar, giroDeFrente } from './nucleo/voxel.js';
import { juntarCajas, armarTextura } from './nucleo/cajas.js';
import { armarBBModel, armarBBS, cubosDeVoxeles } from './nucleo/bbmodel.js';
import { solidoDe } from './nucleo/ajuste.js';
import { cubosGirados, CARAS_L } from './nucleo/giradas.js';
import { geometrias, geoABBS } from './nucleo/geo.js';
import { mallaBBS } from './mod.js';
import { Vista } from './vista.js';
import { guardarSalida } from '../comun/plataforma.js';

const $ = (s) => document.querySelector(s);
const LADO_TEX = 512;   // las texturas del modelo se achican a esto para tomar los colores (alcanza y sobra para cubitos)

const vOrig = new Vista($('#vOrig')), vCubos = new Vista($('#vCubos'));
document.body.dataset.estilo = $('#selEstilo').value;
let modelo = null;        // { nombre, partes, texturas: [{ datos: ImageData, lienzo }] }
let resultado = null;     // la versión que se ve: { g, cubos, ancho, alto, lienzoTex, altoPx, nombres }
let giro = 0, visibles = [];

function estado(txt, mal = false) { const e = $('#estado'); e.hidden = !txt; e.textContent = txt || ''; e.classList.toggle('mal', mal); }
const espera = () => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
const altoBloques = () => Number($('#selAlto').value);
const nombreCorto = (n) => {
  const pref = modelo.partes.map((p) => p.nombre).reduce((a, b) => { let k = 0; while (k < a.length && a[k] === b[k]) k++; return a.slice(0, k); });
  const s = modelo.partes.length > 1 && /[_\- ]$/.test(pref) ? n.slice(pref.length) : n;
  return s || n;
};

/* ---------- abrir ---------- */
async function abrir(archivo) {
  try {
    estado('Leyendo ' + archivo.name + '…'); await espera();
    let bytes = new Uint8Array(await archivo.arrayBuffer()), nombre = archivo.name;
    if (/\.json$/i.test(nombre)) return abrirMod({ [nombre]: bytes }, nombre);   // un .geo.json o model.bbs.json suelto
    if (/\.(zip|jar)$/i.test(nombre) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
      const { unzipSync } = await import('../mocap/importar_lib/libs/fflate.module.js');
      const todo = unzipSync(bytes);
      // un mod (.jar) o un zip con modelos de Blockbench/BBS: se miran sus modelos
      if (Object.keys(todo).some((n) => /\.geo\.json$|\.bbs\.json$/i.test(n))) return abrirMod(todo, nombre);
      const glbs = Object.entries(todo).filter(([n]) => /\.glb$/i.test(n)).sort((a, b) => b[1].length - a[1].length);
      if (!glbs.length) throw new Error('El archivo no trae ningún .glb ni modelos de Blockbench (.geo.json).');
      [nombre, bytes] = glbs[0];
    }
    document.body.dataset.modo = 'glb';
    const { partes, imagenes } = leerGLB(bytes);
    if (!partes.length) throw new Error('El archivo no trae mallas.');
    estado('Leyendo las texturas…'); await espera();
    const texturas = await Promise.all(imagenes.map(async (im, i) => {
      if (!im || !partes.some((p) => p.imagen === i)) return null;
      try {
        const bmp = await createImageBitmap(new Blob([im.bytes], { type: im.mime }));
        const lienzo = document.createElement('canvas'); lienzo.width = lienzo.height = LADO_TEX;
        const g = lienzo.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, LADO_TEX, LADO_TEX); bmp.close && bmp.close();
        return { datos: g.getImageData(0, 0, LADO_TEX, LADO_TEX), lienzo };
      } catch { return null; }
    }));
    modelo = { nombre: nombre.split('/').pop().replace(/\.[^.]+$/, ''), partes, texturas };
    visibles = partes.map(() => true); giro = giroDeFrente(partes);
    $('#nombreArchivo').textContent = nombre.split('/').pop();
    $('#vacioOrig').hidden = true; $('#vacioCubos').hidden = true;
    const tris = partes.reduce((s, p) => s + p.idx.length / 3, 0);
    $('#detOrig').textContent = `${partes.length} partes · ${Math.round(tris / 1000)} mil triángulos` + (texturas.some(Boolean) ? '' : ' · sin texturas');
    pintarPartes();
    Vista.encuadrar(altoBloques());
    await convertir();
  } catch (e) { console.error(e); estado('No se pudo abrir: ' + e.message, true); }
}

function pintarPartes() {
  const p = $('#panelPartes');
  p.innerHTML = '<b>Partes</b>' + modelo.partes.map((x, i) => `<label><input type="checkbox" data-i="${i}" ${visibles[i] ? 'checked' : ''}> ${nombreCorto(x.nombre)}</label>`).join('');
  p.querySelectorAll('input').forEach((c) => c.addEventListener('change', () => { visibles[Number(c.dataset.i)] = c.checked; convertirPronto(); }));
}

/* ---------- mirar los modelos de un mod (.jar) o de Blockbench (.geo.json / model.bbs.json) ---------- */
let mod = null;   // { nombre, modelos: [{ ruta, nombre, bbs }], texturas: [{ ruta, nombre, bytes, w, h }], lienzos: Map }
const tamPNG = (b) => (b.length > 24 && b[1] === 0x50 ? [(b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0] : [0, 0]);
const base = (ruta) => ruta.split('/').pop().replace(/\.(geo|bbs)\.json$|\.json$|\.png$/i, '');
async function abrirMod(archivos, nombre) {
  pararAjuste(); modelo = null; resultado = null;
  const txt = (b) => JSON.parse(new TextDecoder().decode(b));
  const modelos = [];
  for (const [ruta, b] of Object.entries(archivos)) {
    if (!/\.json$/i.test(ruta) || /\.animation\.json$/i.test(ruta)) continue;
    let j; try { j = txt(b); } catch { continue; }
    if (j && j.model && j.model.groups) modelos.push({ ruta, nombre: ruta.split('/').slice(-2).join('/'), bbs: j });
    else if (j && (j['minecraft:geometry'] || Object.keys(j).some((k) => k.startsWith('geometry.')))) {
      const gs = geometrias(j);
      gs.forEach((g, i) => modelos.push({ ruta, nombre: base(ruta) + (gs.length > 1 ? ' · ' + ((g.description && g.description.identifier) || i + 1) : ''), bbs: geoABBS(g) }));
    }
  }
  if (!modelos.length) throw new Error('No encontré modelos (.geo.json o model.bbs.json) en ' + nombre + '.');
  const texturas = Object.entries(archivos).filter(([r]) => /\.png$/i.test(r) && !/\/(gui|particle|mob_effect|item|font)\//i.test(r))
    .map(([ruta, bytes]) => { const [w, h] = tamPNG(bytes); return { ruta, nombre: ruta.split('/').pop(), bytes, w, h }; });
  mod = { nombre: nombre.split('/').pop().replace(/\.[^.]+$/, ''), modelos, texturas, lienzos: new Map() };
  document.body.dataset.modo = 'mod';
  $('#nombreArchivo').textContent = nombre.split('/').pop();
  $('#vacioOrig').hidden = true; $('#panelPartes').hidden = true; estado('');
  $('#selModMod').innerHTML = modelos.map((m, i) => `<option value="${i}">${m.nombre}</option>`).join('');
  $('#btnBBS').disabled = false;
  await elegirModelo(0);
}
async function elegirModelo(i) {
  const m = mod.modelos[i], [tw, th] = m.bbs.model.texture || [64, 64], b = base(m.ruta);
  // texturas: primero la que se llama como el modelo, después las que empiezan igual, después las del mismo tamaño
  const puntaje = (t) => (base(t.ruta) === b ? 0 : base(t.ruta).startsWith(b) ? 1 : t.w === tw && t.h === th ? 2 : 3);
  const lista = mod.texturas.map((t, k) => ({ t, k })).sort((x, y) => puntaje(x.t) - puntaje(y.t) || x.t.nombre.localeCompare(y.t.nombre));
  $('#selModTex').innerHTML = '<option value="-1">(sin textura)</option>' + lista.map(({ t, k }) => `<option value="${k}">${t.nombre}${t.w ? ` (${t.w}×${t.h})` : ''}</option>`).join('');
  $('#selModTex').value = lista.length && puntaje(lista[0].t) < 3 ? String(lista[0].k) : '-1';
  await dibujarModelo();
}
async function lienzoDe(k) {
  if (k < 0) return null;
  if (!mod.lienzos.has(k)) {
    const t = mod.texturas[k], bmp = await createImageBitmap(new Blob([t.bytes], { type: 'image/png' }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
    mod.lienzos.set(k, c);
  }
  return mod.lienzos.get(k);
}
async function dibujarModelo() {
  const m = mod.modelos[Number($('#selModMod').value)], k = Number($('#selModTex').value);
  const r = mallaBBS(m.bbs, await lienzoDe(k));
  vOrig.poner(r.obj);
  Vista.encuadrar(r.alto);
  const grupos = Object.keys(m.bbs.model.groups).length, [tw, th] = m.bbs.model.texture;
  $('#detOrig').textContent = `${r.cubos} cubos · ${grupos} grupos · textura ${tw}×${th} · ${(r.alto * 16).toFixed(0)} px de alto`;
}
async function guardarModBBS() {
  const m = mod.modelos[Number($('#selModMod').value)], k = Number($('#selModTex').value);
  const carpeta = (base(m.ruta) || 'modelo').toLowerCase().replace(/[^a-z0-9_\-]+/g, '_');
  const { zipSync, strToU8 } = await import('../mocap/importar_lib/libs/fflate.module.js');
  const arch = { [carpeta + '/model.bbs.json']: strToU8(JSON.stringify(m.bbs)) };
  if (k >= 0) arch[carpeta + '/texture.png'] = [mod.texturas[k].bytes, { level: 0 }];
  estado(await guardarSalida('modelar', carpeta + '_bbs.zip', new Blob([zipSync(arch)], { type: 'application/zip' }), 'application/zip'));
  setTimeout(() => estado(''), 4000);
}

/* ---------- color de la textura en una UV ---------- */
function colorEn(p, i, u, v) {
  const f = p.color, t = p.imagen >= 0 && modelo.texturas[p.imagen];
  if (!t) return [f[0] * 255, f[1] * 255, f[2] * 255];
  const W = t.datos.width, H = t.datos.height;
  const x = Math.min(W - 1, Math.floor((u - Math.floor(u)) * W)), y = Math.min(H - 1, Math.floor((v - Math.floor(v)) * H)), o = (y * W + x) * 4, d = t.datos.data;
  return [d[o] * f[0], d[o + 1] * f[1], d[o + 2] * f[2]];
}

/* ---------- convertir ---------- */
const estilo = () => $('#selEstilo').value;
let reloj = 0;
function convertirPronto() { clearTimeout(reloj); reloj = setTimeout(convertir, 150); }
async function convertir() {
  if (!modelo) return;
  if (!visibles.some(Boolean)) { estado('Elegí al menos una parte.', true); return; }
  document.body.dataset.estilo = estilo();
  estado('Armando los cubos…'); await espera();
  try {
    if (estilo() === 'voxel') convertirVoxeles(); else await convertirGiradas();
  } catch (e) { console.error(e); estado('No se pudo convertir: ' + e.message, true); }
}

// cubitos derechos (vóxeles)
function convertirVoxeles() {
  pararAjuste();
  const altoPx = altoBloques() * 16, res = Math.max(4, Math.round(altoPx / Number($('#selDetalle').value)));
  const t0 = performance.now();
  const g = voxelizar(modelo.partes, { res, giro, rellenar: $('#chkRellenar').checked, color: colorEn, visibles });
  const todas = juntarCajas(g), tex = armarTextura(g, todas);
  // las cajas que no se ven por ningún lado (todas sus caras tapadas) no hacen falta
  const ve = todas.map((c, k) => Object.values(tex.caras[k]).some(Boolean));
  const cajas = todas.filter((_, k) => ve[k]); tex.caras = tex.caras.filter((_, k) => ve[k]);
  mostrar({ g, cubos: cubosDeVoxeles(g, cajas, tex, altoPx), ancho: tex.ancho, alto: tex.alto, rgba: tex.rgba, altoPx, nombres: modelo.partes.map((p) => nombreCorto(p.nombre)) });
  $('#detCubos').textContent = `${cajas.length} cubos · textura ${tex.ancho}×${tex.alto} · ${Math.round(performance.now() - t0)} ms`;
  estado('');
}

// cajas giradas: el ajuste corre aparte y va mandando versiones
let trabajador = null, giradas = null;   // giradas: { g, solido, altoPx, versiones: [{ cajas, parecido }], sugeridas, elegida, listo }
function pararAjuste() { if (trabajador) { trabajador.terminate(); trabajador = null; } $('#versiones').hidden = true; }
async function convertirGiradas() {
  pararAjuste();
  const altoPx = altoBloques() * 16, res = Math.max(40, Math.min(72, Math.round(altoPx * 1.5)));
  const g = voxelizar(modelo.partes, { res, giro, rellenar: true, color: colorEn, visibles });
  const solido = solidoDe(g);
  giradas = { g, solido, altoPx, versiones: [], sugeridas: [], elegida: 0, listo: false, max: Number($('#selMax').value) };
  vOrig.poner(mallaOriginal(g));
  vCubos.poner(null);
  $('#versiones').hidden = false; $('#verLista').innerHTML = ''; $('#verRango').max = 1; $('#verRango').value = 1;
  estado('Buscando las cajas…');
  trabajador = new Worker(new URL('./ajuste_worker.js', import.meta.url), { type: 'module' });
  trabajador.onmessage = (e) => alMensaje(e.data);
  trabajador.onerror = (e) => estado('No se pudo armar: ' + (e.message || 'error'), true);
  trabajador.postMessage({ tipo: 'empezar', solido, partes: g.parte, nx: g.nx, ny: g.ny, nz: g.nz, girar: $('#chkGirar').checked, espejo: $('#chkEspejo').checked, max: giradas.max });
}
function alMensaje(m) {
  if (!giradas) return;
  if (m.tipo === 'armando') estado(`Buscando las cajas… ${m.n} de ${m.max}`);
  else if (m.tipo === 'version') {
    if (!(giradas.versiones[m.n - 1] || {}).pulida) giradas.versiones[m.n - 1] = { cajas: m.cajas, parecido: m.parecido };
    giradas.sugeridas = m.sugeridas;
    $('#verRango').max = m.total;
    estado('');
    $('#verEstado').textContent = m.n < m.total ? `puliendo ${m.n} de ${m.total}…` : '';
    pintarSugeridas();
    // mientras se arma, se ve la última sugerida (hasta que el usuario elija una)
    if (!giradas.tocada) elegirVersion(m.sugeridas[m.sugeridas.length - 1] || m.n, false);
  } else if (m.tipo === 'listo') { giradas.listo = true; $('#verEstado').textContent = ''; }
  else if (m.tipo === 'pulida') {
    giradas.versiones[m.n - 1] = { cajas: m.cajas, parecido: m.parecido, pulida: true };
    if (giradas.listo) $('#verEstado').textContent = '';
    if (giradas.elegida === m.n) elegirVersion(m.n, false);
    pintarSugeridas();
  }
}
function pintarSugeridas() {
  const l = $('#verLista');
  const cuantos = (n) => giradas.versiones[n - 1].cajas.length;
  l.innerHTML = giradas.sugeridas.filter((n) => giradas.versiones[n - 1]).map((n) => `<button data-n="${n}" class="${n === giradas.elegida ? 'activo' : ''}"><b>${cuantos(n)}</b> cubo${cuantos(n) > 1 ? 's' : ''} · ${Math.round(giradas.versiones[n - 1].parecido * 100)}%</button>`).join('');
  l.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { giradas.tocada = true; elegirVersion(Number(b.dataset.n)); }));
}
let relojPulir = 0;
function elegirVersion(n, pulir = true) {
  const v = giradas.versiones[n - 1]; if (!v) return;
  giradas.elegida = n; $('#verRango').value = n;
  const t0 = performance.now();
  const r = cubosGirados(v.cajas, giradas.g, giradas.solido, giradas.altoPx);
  mostrar({ g: giradas.g, cubos: r.cubos, ancho: r.ancho, alto: r.alto, rgba: r.rgba, altoPx: giradas.altoPx, nombres: [modelo.nombre] }, false);
  const k = v.cajas.length;
  $('#detCubos').textContent = `${k} cubo${k > 1 ? 's' : ''} · parecido ${Math.round(v.parecido * 100)}%${v.pulida ? ' (pulido)' : ''} · textura ${r.ancho}×${r.alto} · ${Math.round(performance.now() - t0)} ms`;
  $('#verLista').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', Number(b.dataset.n) === n));
  // la elegida se pule más (a prueba y error, un rato más largo)
  clearTimeout(relojPulir);
  if (pulir && !v.pulida && trabajador) relojPulir = setTimeout(() => { $('#verEstado').textContent = 'puliendo la elegida…'; trabajador.postMessage({ tipo: 'pulir', n }); }, 400);
}

// pone una versión en la vista y la deja lista para guardar
function mostrar(sal, conOriginal = true) {
  const lienzoTex = document.createElement('canvas'); lienzoTex.width = sal.ancho; lienzoTex.height = sal.alto;
  lienzoTex.getContext('2d').putImageData(new ImageData(sal.rgba, sal.ancho, sal.alto), 0, 0);
  resultado = { ...sal, lienzoTex };
  if (conOriginal) vOrig.poner(mallaOriginal(sal.g));
  vCubos.poner(mallaCubos());
  $('#btnGuardar').disabled = $('#btnPng').disabled = $('#btnBBS').disabled = false;
}

// el original, en el mismo lugar y tamaño que los cubos (en bloques), con el mismo giro
function mallaOriginal(g) {
  const grupo = new THREE.Group(), esc = altoBloques() / ((g.ny - 2) * g.celda);
  // centro de lo ocupado (como en el .bbmodel): se calcula en la grilla
  const [cx, cz, y0] = centroGrilla(g);
  modelo.partes.forEach((p, i) => {
    if (!visibles[i]) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
    if (p.uv) geo.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2));
    geo.setIndex(new THREE.BufferAttribute(p.idx, 1)); geo.computeVertexNormals();
    const t = p.imagen >= 0 && modelo.texturas[p.imagen];
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(...p.color), side: THREE.DoubleSide });
    if (t) { const tx = new THREE.CanvasTexture(t.lienzo); tx.flipY = false; tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; mat.map = tx; }
    grupo.add(new THREE.Mesh(geo, mat));
  });
  // mundo -> grilla girada -> bloques
  const piv = new THREE.Group(); piv.add(grupo);
  grupo.rotation.y = giro * Math.PI / 180;
  const fuera = new THREE.Group(); fuera.add(piv);
  piv.position.set(-g.origen[0], -g.origen[1], -g.origen[2]);   // (la grilla empieza en origen)
  fuera.scale.setScalar(esc);
  fuera.position.set(-cx * g.celda * esc, -y0 * g.celda * esc, -cz * g.celda * esc);
  return fuera;
}
function centroGrilla(g) {
  const { nx, nz, parte } = g;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity;
  for (let v = 0; v < parte.length; v++) if (parte[v] >= 0) { const x = v % nx, z = Math.floor(v / nx) % nz, y = Math.floor(v / (nx * nz)); x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); z0 = Math.min(z0, z); z1 = Math.max(z1, z + 1); y0 = Math.min(y0, y); }
  return [(x0 + x1) / 2, (z0 + z1) / 2, y0];
}

// los cubos, con la misma textura, UV y giros que van al archivo (el giro se rearma desde los grados, como lo hacen Blockbench y BBS)
function mallaCubos() {
  const { cubos, ancho, alto, lienzoTex } = resultado;
  const pos = [], uv = [], ind = [], lineas = [];
  for (const c of cubos) {
    const [ax, ay, az] = c.rotation.map((g) => g * Math.PI / 180);
    const M = new THREE.Matrix4().makeRotationZ(az).multiply(new THREE.Matrix4().makeRotationY(ay)).multiply(new THREE.Matrix4().makeRotationX(ax)).elements;   // (por columnas)
    const centro = [0, 1, 2].map((i) => (c.from[i] + c.to[i]) / 2), h = [0, 1, 2].map((i) => (c.to[i] - c.from[i]) / 2);
    const mundo = (l) => { const p = [centro[0] + l[0] - c.origin[0], centro[1] + l[1] - c.origin[1], centro[2] + l[2] - c.origin[2]];
      return [0, 1, 2].map((f) => (c.origin[f] + M[f] * p[0] + M[4 + f] * p[1] + M[8 + f] * p[2]) / 16); };
    for (const [nombre, f] of Object.entries(CARAS_L)) {
      const r = c.uvs[nombre]; if (!r) continue;
      const esq = f.esq(h), w = 2 * h[f.ej[0]], hh = 2 * h[f.ej[1]];
      const q = [esq, esq.map((v, a) => v + f.U[a] * w), esq.map((v, a) => v + f.U[a] * w + f.V[a] * hh), esq.map((v, a) => v + f.V[a] * hh)];
      const base = pos.length / 3;
      q.forEach((p) => pos.push(...mundo(p)));
      const [u0, v0, u1, v1] = r.map((x, i) => x / (i % 2 ? alto : ancho));
      uv.push(u0, 1 - v0, u1, 1 - v0, u1, 1 - v1, u0, 1 - v1);
      // que la cara mire hacia afuera
      const cr = [f.U[1] * f.V[2] - f.U[2] * f.V[1], f.U[2] * f.V[0] - f.U[0] * f.V[2], f.U[0] * f.V[1] - f.U[1] * f.V[0]];
      if (cr[0] * f.n[0] + cr[1] * f.n[1] + cr[2] * f.n[2] > 0) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    // bordes de la caja
    const e = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]].map((s) => mundo(s.map((x, i) => x * h[i])));
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) lineas.push(...e[i], ...e[j]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(ind);
  geo.computeVertexNormals();
  const t = new THREE.CanvasTexture(lienzoTex); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: t })));
  const bordes = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lineas, 3)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
  bordes.visible = $('#chkBordes').checked; bordes.name = 'bordes';
  grupo.add(bordes);
  return grupo;
}

/* ---------- guardar ---------- */
async function guardar() {
  if (!resultado) return;
  try {
    const { cubos, ancho, alto, lienzoTex, nombres } = resultado;
    const bb = armarBBModel({ cubos, ancho, alto, nombres, pngDataURL: lienzoTex.toDataURL('image/png'), nombre: modelo.nombre });
    estado(await guardarSalida('modelar', modelo.nombre + '.bbmodel', JSON.stringify(bb), 'application/json'));
    setTimeout(() => estado(''), 3000);
  } catch (e) { estado('No se pudo guardar: ' + e.message, true); }
}
// para BBS: un .zip con la carpeta del modelo (model.bbs.json + texture.png, y el .bbmodel para seguir editándolo en Blockbench)
async function guardarBBS() {
  if (!resultado) return;
  try {
    const { cubos, ancho, alto, lienzoTex, nombres } = resultado;
    const carpeta = modelo.nombre.toLowerCase().replace(/[^a-z0-9_\-]+/g, '_') || 'modelo';
    const { zipSync, strToU8 } = await import('../mocap/importar_lib/libs/fflate.module.js');
    const png = new Uint8Array(await (await new Promise((ok) => lienzoTex.toBlob(ok, 'image/png'))).arrayBuffer());
    const bb = armarBBModel({ cubos, ancho, alto, nombres, pngDataURL: lienzoTex.toDataURL('image/png'), nombre: carpeta, rutaTextura: 'texture.png' });
    const zip = zipSync({
      [carpeta + '/model.bbs.json']: strToU8(JSON.stringify(armarBBS({ cubos, ancho, alto, nombres }))),
      [carpeta + '/texture.png']: [png, { level: 0 }],
      [carpeta + '/model.bbmodel']: strToU8(JSON.stringify(bb)),
    });
    estado(await guardarSalida('modelar', carpeta + '_bbs.zip', new Blob([zip], { type: 'application/zip' }), 'application/zip'));
    setTimeout(() => estado(''), 4000);
  } catch (e) { estado('No se pudo guardar: ' + e.message, true); }
}
async function guardarPng() {
  if (!resultado) return;
  const blob = await new Promise((ok) => resultado.lienzoTex.toBlob(ok, 'image/png'));
  estado(await guardarSalida('modelar', modelo.nombre + '.png', blob, 'image/png'));
  setTimeout(() => estado(''), 3000);
}

/* ---------- controles ---------- */
$('#inArchivo').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) abrir(f); e.target.value = ''; });
$('#selAlto').addEventListener('change', () => { Vista.encuadrar(altoBloques()); convertir(); });
$('#selDetalle').addEventListener('change', convertir);
$('#selEstilo').addEventListener('change', convertir);
$('#selMax').addEventListener('change', convertir);
$('#chkGirar').addEventListener('change', convertir);
$('#chkEspejo').addEventListener('change', convertir);
$('#verRango').addEventListener('input', (e) => { if (giradas) { giradas.tocada = true; elegirVersion(Number(e.target.value)); } });
$('#chkRellenar').addEventListener('change', convertir);
$('#btnGirar').addEventListener('click', () => { giro = (giro + 90) % 360; convertir(); });
$('#btnPartes').addEventListener('click', () => { if (modelo) $('#panelPartes').hidden = !$('#panelPartes').hidden; });
$('#chkBordes').addEventListener('change', (e) => { const b = vCubos.contenido.getObjectByName('bordes'); if (b) { b.visible = e.target.checked; vCubos.dibujar(); } });
$('#btnGuardar').addEventListener('click', guardar);
$('#btnPng').addEventListener('click', guardarPng);
$('#btnBBS').addEventListener('click', () => (document.body.dataset.modo === 'mod' ? guardarModBBS() : guardarBBS()).catch((e) => estado('No se pudo guardar: ' + e.message, true)));
$('#selModMod').addEventListener('change', (e) => elegirModelo(Number(e.target.value)));
$('#selModTex').addEventListener('change', dibujarModelo);
// soltar un archivo en cualquier parte
addEventListener('dragover', (e) => { e.preventDefault(); $('#vOrig').classList.add('encima'); });
addEventListener('dragleave', () => $('#vOrig').classList.remove('encima'));
addEventListener('drop', (e) => { e.preventDefault(); $('#vOrig').classList.remove('encima'); const f = e.dataTransfer.files[0]; if (f) abrir(f); });
