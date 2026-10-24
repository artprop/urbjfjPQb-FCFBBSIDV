// Modo «Modelar → Blockbench»: un modelo 3D (.glb) pasado a cubos de Minecraft con textura pixelada, como .bbmodel.
// Todo son cuentas (sin IA entrenada): se muestrea la superficie en una grilla, se rellena, se juntan los cubitos en cajas y se arma
// la textura. Ver nucleo/voxel.js y nucleo/cajas.js.
import * as THREE from '../mocap/three.module.min.js';
import { leerGLB } from './nucleo/glb.js';
import { voxelizar, giroDeFrente } from './nucleo/voxel.js';
import { juntarCajas, armarTextura, CARAS } from './nucleo/cajas.js';
import { armarBBModel, armarBBS } from './nucleo/bbmodel.js';
import { Vista } from './vista.js';
import { guardarSalida } from '../comun/plataforma.js';

const $ = (s) => document.querySelector(s);
const LADO_TEX = 512;   // las texturas del modelo se achican a esto para tomar los colores (alcanza y sobra para cubitos)

const vOrig = new Vista($('#vOrig')), vCubos = new Vista($('#vCubos'));
let modelo = null;        // { nombre, partes, texturas: [{ datos: ImageData, lienzo }] }
let resultado = null;     // { g, cajas, tex, lienzoTex }
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
    if (/\.zip$/i.test(nombre) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
      const { unzipSync } = await import('../mocap/importar_lib/libs/fflate.module.js');
      const glbs = Object.entries(unzipSync(bytes)).filter(([n]) => /\.glb$/i.test(n)).sort((a, b) => b[1].length - a[1].length);
      if (!glbs.length) throw new Error('El .zip no trae ningún .glb.');
      [nombre, bytes] = glbs[0];
    }
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

/* ---------- color de la textura en una UV ---------- */
function colorEn(p, i, u, v) {
  const f = p.color, t = p.imagen >= 0 && modelo.texturas[p.imagen];
  if (!t) return [f[0] * 255, f[1] * 255, f[2] * 255];
  const W = t.datos.width, H = t.datos.height;
  const x = Math.min(W - 1, Math.floor((u - Math.floor(u)) * W)), y = Math.min(H - 1, Math.floor((v - Math.floor(v)) * H)), o = (y * W + x) * 4, d = t.datos.data;
  return [d[o] * f[0], d[o + 1] * f[1], d[o + 2] * f[2]];
}

/* ---------- convertir ---------- */
let reloj = 0;
function convertirPronto() { clearTimeout(reloj); reloj = setTimeout(convertir, 150); }
async function convertir() {
  if (!modelo) return;
  if (!visibles.some(Boolean)) { estado('Elegí al menos una parte.', true); return; }
  estado('Armando los cubos…'); await espera();
  try {
    const altoPx = altoBloques() * 16, res = Math.max(4, Math.round(altoPx / Number($('#selDetalle').value)));
    const t0 = performance.now();
    const g = voxelizar(modelo.partes, { res, giro, rellenar: $('#chkRellenar').checked, color: colorEn, visibles });
    const todas = juntarCajas(g), tex = armarTextura(g, todas);
    // las cajas que no se ven por ningún lado (todas sus caras tapadas) no hacen falta
    const ve = todas.map((c, k) => Object.values(tex.caras[k]).some(Boolean));
    const cajas = todas.filter((_, k) => ve[k]); tex.caras = tex.caras.filter((_, k) => ve[k]);
    const lienzoTex = document.createElement('canvas'); lienzoTex.width = tex.ancho; lienzoTex.height = tex.alto;
    lienzoTex.getContext('2d').putImageData(new ImageData(tex.rgba, tex.ancho, tex.alto), 0, 0);
    resultado = { g, cajas, tex, lienzoTex, altoPx };
    vOrig.poner(mallaOriginal(g));
    vCubos.poner(mallaCubos());
    $('#detCubos').textContent = `${cajas.length} cubos · textura ${tex.ancho}×${tex.alto} · ${Math.round(performance.now() - t0)} ms`;
    $('#btnGuardar').disabled = $('#btnPng').disabled = $('#btnBBS').disabled = false;
    estado('');
  } catch (e) { console.error(e); estado('No se pudo convertir: ' + e.message, true); }
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
  const cajas = resultado ? resultado.cajas : juntarCajas(g);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity;
  for (const c of cajas) { x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); z0 = Math.min(z0, c.z0); z1 = Math.max(z1, c.z1); y0 = Math.min(y0, c.y0); }
  return [(x0 + x1) / 2, (z0 + z1) / 2, y0];
}

// los cubos, con la misma textura y las mismas UV que van al .bbmodel
function mallaCubos() {
  const { g, cajas, tex, lienzoTex } = resultado, b = altoBloques() / (g.ny - 2);   // un vóxel en bloques
  const [cx, cz, y0] = centroGrilla(g);
  const pos = [], uv = [], ind = [], lineas = [];
  const P = (x, y, z) => [(x - cx) * b, (y - y0) * b, (z - cz) * b];
  cajas.forEach((c, k) => {
    for (const [nombre, f] of Object.entries(CARAS)) {
      const r = tex.caras[k][nombre]; if (!r) continue;
      const [w, h] = f.tam(c), [esq, U, V] = MARCO[nombre](c);
      const q = [esq, esq.map((v, a) => v + U[a] * w), esq.map((v, a) => v + U[a] * w + V[a] * h), esq.map((v, a) => v + V[a] * h)];
      const base = pos.length / 3;
      q.forEach((p) => pos.push(...P(...p)));
      const [u0, v0, u1, v1] = r.map((x, i) => x / (i % 2 ? tex.alto : tex.ancho));
      uv.push(u0, 1 - v0, u1, 1 - v0, u1, 1 - v1, u0, 1 - v1);
      // que la cara mire hacia afuera
      const cr = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
      if (cr[0] * f.n[0] + cr[1] * f.n[1] + cr[2] * f.n[2] > 0) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    // bordes de la caja
    const A = P(c.x0, c.y0, c.z0), B = P(c.x1, c.y1, c.z1);
    const e = [[A[0], A[1], A[2]], [B[0], A[1], A[2]], [B[0], A[1], B[2]], [A[0], A[1], B[2]], [A[0], B[1], A[2]], [B[0], B[1], A[2]], [B[0], B[1], B[2]], [A[0], B[1], B[2]]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) lineas.push(...e[i], ...e[j]);
  });
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
// cada cara: la esquina de arriba a la izquierda de su imagen y hacia dónde crecen u y v (la misma orientación que CARAS)
const MARCO = {
  north: (c) => [[c.x1, c.y1, c.z0], [-1, 0, 0], [0, -1, 0]],
  south: (c) => [[c.x0, c.y1, c.z1], [1, 0, 0], [0, -1, 0]],
  east: (c) => [[c.x1, c.y1, c.z1], [0, 0, -1], [0, -1, 0]],
  west: (c) => [[c.x0, c.y1, c.z0], [0, 0, 1], [0, -1, 0]],
  up: (c) => [[c.x0, c.y1, c.z0], [1, 0, 0], [0, 0, 1]],
  down: (c) => [[c.x0, c.y0, c.z1], [1, 0, 0], [0, 0, -1]],
};

/* ---------- guardar ---------- */
async function guardar() {
  if (!resultado) return;
  try {
    const { g, cajas, tex, lienzoTex, altoPx } = resultado;
    const nombres = modelo.partes.map((p) => nombreCorto(p.nombre));
    const bb = armarBBModel({ g, cajas, tex, nombres, pngDataURL: lienzoTex.toDataURL('image/png'), altoPx, nombre: modelo.nombre });
    estado(await guardarSalida('modelar', modelo.nombre + '.bbmodel', JSON.stringify(bb), 'application/json'));
    setTimeout(() => estado(''), 3000);
  } catch (e) { estado('No se pudo guardar: ' + e.message, true); }
}
// para BBS: un .zip con la carpeta del modelo (model.bbs.json + texture.png, y el .bbmodel para seguir editándolo en Blockbench)
async function guardarBBS() {
  if (!resultado) return;
  try {
    const { g, cajas, tex, lienzoTex, altoPx } = resultado;
    const nombres = modelo.partes.map((p) => nombreCorto(p.nombre)), carpeta = modelo.nombre.toLowerCase().replace(/[^a-z0-9_\-]+/g, '_') || 'modelo';
    const { zipSync, strToU8 } = await import('../mocap/importar_lib/libs/fflate.module.js');
    const png = new Uint8Array(await (await new Promise((ok) => lienzoTex.toBlob(ok, 'image/png'))).arrayBuffer());
    const bb = armarBBModel({ g, cajas, tex, nombres, pngDataURL: lienzoTex.toDataURL('image/png'), altoPx, nombre: carpeta, rutaTextura: 'texture.png' });
    const zip = zipSync({
      [carpeta + '/model.bbs.json']: strToU8(JSON.stringify(armarBBS({ g, cajas, tex, nombres, altoPx }))),
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
$('#chkRellenar').addEventListener('change', convertir);
$('#btnGirar').addEventListener('click', () => { giro = (giro + 90) % 360; convertir(); });
$('#btnPartes').addEventListener('click', () => { if (modelo) $('#panelPartes').hidden = !$('#panelPartes').hidden; });
$('#chkBordes').addEventListener('change', (e) => { const b = vCubos.contenido.getObjectByName('bordes'); if (b) { b.visible = e.target.checked; vCubos.dibujar(); } });
$('#btnGuardar').addEventListener('click', guardar);
$('#btnPng').addEventListener('click', guardarPng);
$('#btnBBS').addEventListener('click', guardarBBS);
// soltar un archivo en cualquier parte
addEventListener('dragover', (e) => { e.preventDefault(); $('#vOrig').classList.add('encima'); });
addEventListener('dragleave', () => $('#vOrig').classList.remove('encima'));
addEventListener('drop', (e) => { e.preventDefault(); $('#vOrig').classList.remove('encima'); const f = e.dataTransfer.files[0]; if (f) abrir(f); });
