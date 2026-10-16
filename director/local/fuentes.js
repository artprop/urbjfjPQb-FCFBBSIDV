// De dónde salen los films, los audios y las poses.
//  - PC (Chrome/Edge): la carpeta de Minecraft, SOLO LECTURA (nunca se escribe ahí). Sirve la carpeta 1.20.1
//    (la que tiene "saves" y "config"), .apepedata, o una carpeta de adentro (config\bbs, saves\<mundo>\bbs...).
//    Films: saves\<mundo>\bbs\films\** de todos los mundos + config\bbs\data\films, sin las copias
//    automáticas de BBS (nombre.AAAA_MM_DD_HH_MM.dat). Audios y poses: config\bbs\assets.
//  - Celu (o PC sin esa opción): films .dat, audios y un .zip de bbs importados a la app.
// Ids: 'c:<ruta>' = de la carpeta, 'i:<nombre>' = importado, 's:<nombre>' = generado por el Director.
import * as A from './almacen.js';
import { unzipSync } from '../../visor/lib/fflate.js';

const RESPALDO = /\.\d{4}_\d{2}_\d{2}_\d{2}_\d{2}\.dat$/i;
const EXT_AUDIO = /\.(wav|ogg|mp3|m4a|flac)$/i;

async function hijo(dir, nombre) {
  if (!dir) return null;
  try { return await dir.getDirectoryHandle(nombre); } catch { /* sigue */ }
  try {   // Windows no distingue mayúsculas
    for await (const [n, h] of dir.entries()) if (h.kind === 'directory' && n.toLowerCase() === nombre.toLowerCase()) return h;
  } catch { /* nada */ }
  return null;
}
async function camino(dir, partes) { for (const p of partes) { dir = await hijo(dir, p); if (!dir) return null; } return dir; }

// Mira qué carpeta eligió y arma {mundos: [[nombre, carpeta films]], filmsConfig, assets, aviso}
async function detectar(raiz) {
  let inst = raiz;
  if (!((await hijo(inst, 'saves')) && (await hijo(inst, 'config')))) {
    // .apepedata u otra de más arriba: buscar adentro una que tenga saves y config
    let encontrada = null;
    for await (const [, h] of raiz.entries()) {
      if (h.kind === 'directory' && (await hijo(h, 'saves')) && (await hijo(h, 'config'))) { encontrada = h; break; }
    }
    inst = encontrada;
  }
  const out = { mundos: [], dirMundos: new Map(), filmsConfig: null, assets: null, aviso: '' };
  if (inst) {
    const saves = await hijo(inst, 'saves');
    const nombres = [];
    for await (const [n, h] of saves.entries()) if (h.kind === 'directory') nombres.push(n);
    for (const n of nombres.sort()) {
      const f = await camino(saves, [n, 'bbs', 'films']);
      if (f) { out.mundos.push([n, f]); out.dirMundos.set(n, await hijo(saves, n)); }
    }
    const bbs = await camino(inst, ['config', 'bbs']);
    out.filmsConfig = await camino(bbs, ['data', 'films']);
    out.assets = await hijo(bbs, 'assets');
    return out;
  }
  // una carpeta de adentro: no se puede subir, se usa lo que haya
  const n = raiz.name.toLowerCase();
  const bbsCfg = n === 'config' ? await hijo(raiz, 'bbs') : raiz;
  if (bbsCfg && ((await hijo(bbsCfg, 'assets')) || (await camino(bbsCfg, ['data', 'films'])))) {
    out.assets = await hijo(bbsCfg, 'assets');
    out.filmsConfig = await camino(bbsCfg, ['data', 'films']);
  }
  const filmsMundo = (await hijo(raiz, 'films')) || (await camino(raiz, ['bbs', 'films']));
  if (filmsMundo && !out.filmsConfig) {
    const nombre = raiz.name === 'bbs' ? 'mundo' : raiz.name;
    out.mundos.push([nombre, filmsMundo]);
    if (raiz.name !== 'bbs' && (await hijo(raiz, 'region'))) out.dirMundos.set(nombre, raiz);   // eligió la carpeta del mundo
  }
  if (n === 'saves') {
    for await (const [m, h] of raiz.entries()) if (h.kind === 'directory') {
      const f = await camino(h, ['bbs', 'films']);
      if (f) { out.mundos.push([m, f]); out.dirMundos.set(m, h); }
    }
  }
  if (!out.mundos.length && !out.filmsConfig && !out.assets) return null;
  out.aviso = 'Para ver los films de todos tus mundos y sus audios, elegí la carpeta 1.20.1 (la que tiene "saves" y "config").';
  return out;
}

export class Fuentes {
  constructor() {
    this.raiz = null;          // carpeta elegida (FileSystemDirectoryHandle)
    this.det = null;           // lo que se encontró adentro
    this.filmsCarpeta = new Map();   // id -> handle del archivo
    this.audiosCarpeta = new Map();  // 'audio/x.wav' (minúsculas) -> handle
    this.audiosImportados = new Map();   // nombre en minúsculas -> nombre
    this.posesUsuario = {};    // del .zip importado: grupo -> poses.json
    this._poses = new Map();
  }

  puedeCarpeta() { return typeof window !== 'undefined' && 'showDirectoryPicker' in window; }
  nombreCarpeta() { return this.raiz ? this.raiz.name : ''; }
  aviso() { return this.det ? this.det.aviso : ''; }

  // al abrir la página: recordar la carpeta (si el navegador todavía da permiso) y lo importado
  async iniciar() {
    await this._indexarImportados();
    this.posesUsuario = (await A.leerKV('poses_usuario').catch(() => null)) || {};
    if (!this.puedeCarpeta()) return 'sin_carpeta';
    const h = await A.leerKV('instancia').catch(() => null);
    if (!h) return 'sin_carpeta';
    this.raiz = h;
    if ((await h.queryPermission({ mode: 'read' })) !== 'granted') return 'pedir_permiso';
    await this._usar(h);
    return 'ok';
  }
  async pedirPermiso() {     // tiene que venir de un clic
    if (!this.raiz) return false;
    if ((await this.raiz.requestPermission({ mode: 'read' })) !== 'granted') return false;
    await this._usar(this.raiz);
    return true;
  }
  async elegirCarpeta() {
    const h = await window.showDirectoryPicker({ id: 'minecraft', mode: 'read' });
    const det = await detectar(h);
    if (!det) throw new Error('En esa carpeta no encuentro films de BBS. Elegí la carpeta 1.20.1 de tu Minecraft (la que tiene "saves" y "config").');
    this.raiz = h;
    await A.guardarKV('instancia', h);
    await this._usar(h, det);
  }
  async olvidarCarpeta() { this.raiz = null; this.det = null; this.filmsCarpeta.clear(); this.audiosCarpeta.clear(); await A.borrarKV('instancia'); }

  async _usar(h, det = null) {
    this.det = det || (await detectar(h)) || { mundos: [], filmsConfig: null, assets: null, aviso: 'No encuentro films en esa carpeta.' };
    this._poses.clear();
    await this._indexarAudios();
  }

  async _indexarAudios() {
    this.audiosCarpeta.clear();
    const audio = await hijo(this.det && this.det.assets, 'audio');
    const recorrer = async (d, pre) => {
      for await (const [n, h] of d.entries()) {
        if (h.kind === 'directory') await recorrer(h, pre + n + '/');
        else if (EXT_AUDIO.test(n)) this.audiosCarpeta.set((pre + n).toLowerCase(), h);
      }
    };
    if (audio) await recorrer(audio, 'audio/');
  }
  async _indexarImportados() {
    this.audiosImportados.clear();
    for (const a of await A.todos('audios').catch(() => [])) this.audiosImportados.set(a.nombre.toLowerCase(), a.nombre);
  }

  // ---------------------------------------------------------------- films
  // [{id, nombre, grupo, fecha}]: primero lo generado por el Director (para encadenar), después el resto
  async listarFilms() {
    const salidas = (await A.todos('salidas')).sort((a, b) => b.fecha - a.fecha)
      .map((s) => ({ id: 's:' + s.nombre, nombre: 'Salida/' + s.nombre.replace(/\.dat$/i, ''), grupo: 'salida', fecha: s.fecha }));
    const otros = [];
    this.filmsCarpeta.clear();
    if (this.det) {
      const recorrer = async (d, etiqueta, pre) => {
        for await (const [n, h] of d.entries()) {
          if (h.kind === 'directory') { if (!n.startsWith('_')) await recorrer(h, etiqueta, pre + n + '/'); continue; }
          if (!n.toLowerCase().endsWith('.dat') || RESPALDO.test(n)) continue;
          const id = `c:${etiqueta}/${pre}${n}`;
          this.filmsCarpeta.set(id, h);
          otros.push({ id, nombre: `${etiqueta} / ${pre}${n.slice(0, -4)}`, grupo: 'carpeta', fecha: (await h.getFile()).lastModified });
        }
      };
      for (const [m, f] of this.det.mundos) await recorrer(f, m, '');
      if (this.det.filmsConfig) await recorrer(this.det.filmsConfig, 'config', '');
    }
    for (const f of await A.todos('films')) otros.push({ id: 'i:' + f.nombre, nombre: 'Importado / ' + f.nombre.replace(/\.dat$/i, ''), grupo: 'importado', fecha: f.fecha });
    otros.sort((a, b) => b.fecha - a.fecha);
    return [...salidas, ...otros];
  }

  async leerFilm(id) {
    if (id.startsWith('c:')) {
      const h = this.filmsCarpeta.get(id);
      if (!h) throw new Error('Ese film ya no está en la carpeta.');
      return new Uint8Array(await (await h.getFile()).arrayBuffer());
    }
    const r = await A.obtener(id.startsWith('s:') ? 'salidas' : 'films', id.slice(2));
    if (!r) throw new Error('No encuentro ese film.');
    return r.bytes;
  }
  // nombre del archivo del film (sin .dat)
  static nombreArchivo(id) { return id.slice(2).split('/').pop().replace(/\.dat$/i, ''); }

  async importarFilm(file) {
    const nombre = file.name.toLowerCase().endsWith('.dat') ? file.name : file.name + '.dat';
    await A.poner('films', { nombre, bytes: new Uint8Array(await file.arrayBuffer()), fecha: Date.now() });
    return 'i:' + nombre;
  }

  // ---------------------------------------------------------------- audios
  // 'assets:audio/X.wav' -> id del audio (o null si no está ni en la carpeta ni importado)
  archivoDe(audio) {
    const rel = String(audio).replace(/^assets:/, '');
    if (this.audiosCarpeta.has(rel.toLowerCase())) return 'c:' + rel;
    const sinAudio = rel.replace(/^audio\//i, '');
    const n = this.audiosImportados.get(sinAudio.toLowerCase()) || this.audiosImportados.get(sinAudio.split('/').pop().toLowerCase());
    return n ? 'i:' + n : null;
  }
  static nombreAudio(id) { return String(id).slice(2).split('/').pop(); }

  // {bytes, clave}: la clave cambia si cambia el archivo (para el cache de Rhubarb)
  async leerAudio(id) {
    if (id.startsWith('c:')) {
      const h = this.audiosCarpeta.get(id.slice(2).toLowerCase());
      if (!h) throw new Error('No encuentro el audio ' + id.slice(2));
      const f = await h.getFile();
      return { bytes: new Uint8Array(await f.arrayBuffer()), clave: `${id}|${f.size}|${f.lastModified}` };
    }
    const r = await A.obtener('audios', id.slice(2));
    if (!r) throw new Error('No encuentro el audio ' + id.slice(2));
    return { bytes: r.bytes, clave: `${id}|${r.bytes.length}|${r.fecha}` };
  }

  async importarAudio(file, nombre = file.name) {
    await A.poner('audios', { nombre, bytes: new Uint8Array(await file.arrayBuffer()), fecha: Date.now() });
    this.audiosImportados.set(nombre.toLowerCase(), nombre);
    return 'i:' + nombre;
  }

  // .zip de la carpeta bbs (o el paquete del Visor): se guardan solo las poses y los audios
  async importarZip(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const POSES = /(?:^|\/)assets\/models\/(.+)\/poses\.json$/i, AUDIO = /(?:^|\/)assets\/audio\/(.+)$/i;
    const arch = unzipSync(buf, { filter: (f) => POSES.test(f.name) || (AUDIO.test(f.name) && EXT_AUDIO.test(f.name)) });
    let nPoses = 0, nAudios = 0;
    const poses = { ...this.posesUsuario };
    for (const [n, datos] of Object.entries(arch)) {
      let m = n.match(POSES);
      if (m) { try { poses[m[1]] = JSON.parse(new TextDecoder().decode(datos)); nPoses++; } catch { /* poses.json roto */ } continue; }
      m = n.match(AUDIO);
      if (m) { await A.poner('audios', { nombre: m[1], bytes: datos, fecha: Date.now() }); this.audiosImportados.set(m[1].toLowerCase(), m[1]); nAudios++; }
    }
    this.posesUsuario = poses; this._poses.clear();
    await A.guardarKV('poses_usuario', poses);
    if (!nPoses && !nAudios) throw new Error('El .zip no tiene poses (assets/models/.../poses.json) ni audios (assets/audio).');
    return { nPoses, nAudios };
  }

  // ---------------------------------------------------------------- mapa del mundo (para caminar siguiendo el piso)
  // nombre del mundo del film (o null): los de la carpeta lo dicen en su id; los generados lo recuerdan
  async mundoDeFilm(id) {
    if (!id) return null;
    if (id.startsWith('c:')) {
      const m = id.slice(2).split('/')[0];
      return this.det && this.det.dirMundos && this.det.dirMundos.has(m) ? m : null;
    }
    if (id.startsWith('s:')) { const r = await A.obtener('salidas', id.slice(2)).catch(() => null); return (r && r.mundo) || null; }
    return null;
  }
  // función (rx, rz) -> bytes de saves\<mundo>\region\r.rx.rz.mca (o null). Lee una sola vez mientras no cambie
  // el archivo (el mundo se puede guardar mientras está abierto el Director). null si ese mundo no está a mano.
  lectorRegiones(mundo) {
    const dir = this.det && this.det.dirMundos && this.det.dirMundos.get(mundo);
    if (!dir) return null;
    this._regiones ??= new Map();
    return async (rx, rz) => {
      const region = await hijo(dir, 'region');
      if (!region) return null;
      let h;
      try { h = await region.getFileHandle(`r.${rx}.${rz}.mca`); } catch { return null; }
      const f = await h.getFile();
      const clave = `${mundo}/${rx},${rz}`, c = this._regiones.get(clave);
      if (c && c.fecha === f.lastModified && c.largo === f.size) return c.bytes;
      const bytes = new Uint8Array(await f.arrayBuffer());
      this._regiones.set(clave, { fecha: f.lastModified, largo: f.size, bytes });
      return bytes;
    };
  }

  // ---------------------------------------------------------------- poses
  // [poses que trae BBS (copiadas en el Visor), poses del usuario] de un grupo como 'player/steve'
  async posesDe(grupo) {
    if (this._poses.has(grupo)) return this._poses.get(grupo);
    const partes = grupo.split('/');
    let bbs = null, usuario = null;
    this._interno ??= fetch('../visor/builtin/index.json').then((r) => (r.ok ? r.json() : [])).then((l) => new Set(l)).catch(() => new Set());
    if ((await this._interno).has(`models/${grupo}/poses.json`)) try {
      const r = await fetch('../visor/builtin/models/' + partes.map(encodeURIComponent).join('/') + '/poses.json');
      if (r.ok) bbs = await r.json();
    } catch { /* no está */ }
    const dir = await camino(this.det && this.det.assets, ['models', ...partes]);
    if (dir) {
      try { usuario = JSON.parse(await (await (await dir.getFileHandle('poses.json')).getFile()).text()); } catch { /* no tiene */ }
    }
    if (!usuario && this.posesUsuario[grupo]) usuario = this.posesUsuario[grupo];
    const v = [bbs, usuario];
    this._poses.set(grupo, v);
    return v;
  }
}
