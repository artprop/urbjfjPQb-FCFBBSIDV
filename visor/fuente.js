// De dónde salen los archivos: la carpeta "bbs" de la PC (solo lectura), un paquete .zip (celu)
// y los modelos que vienen adentro del mod (steve, alex, ojos...), copiados en builtin/.
// Todas las rutas son relativas a la carpeta bbs: "assets/models/...", "settings/forms/...".
import { unzipSync, zip as zipAsync } from './lib/fflate.js';

const CARPETAS = ['assets', 'settings/forms'];
const EXT_PAQUETE = /\.(json|png|obj|mtl|bobj)$/i;

export class Fuente {
  constructor() {
    this.usuario = new Map();   // ruta → () => Promise<Blob>
    this.interno = new Map();
    this.nombre = '';
    this.tipo = '';             // 'carpeta' | 'zip' | ''
    this._rutas = null;
  }

  async cargarInterno() {
    try {
      const lista = await (await fetch('builtin/index.json')).json();
      for (const p of lista) this.interno.set('assets/' + p, () => fetch('builtin/' + p.split('/').map(encodeURIComponent).join('/')).then((r) => (r.ok ? r.blob() : null)));
    } catch { /* sin modelos internos */ }
    this._rutas = null;
  }

  rutas() {
    if (!this._rutas) this._rutas = [...new Set([...this.usuario.keys(), ...this.interno.keys()])];
    return this._rutas;
  }
  existe(p) { return this.usuario.has(p) || this.interno.has(p); }
  esDelUsuario(p) { return this.usuario.has(p); }

  async blob(p) {
    const f = this.usuario.get(p) || this.interno.get(p);
    if (!f) {
      // BBS ignora mayúsculas/minúsculas en Windows
      const low = p.toLowerCase();
      const k = this.rutas().find((x) => x.toLowerCase() === low);
      if (!k) return null;
      return this.blob(k);
    }
    try { return await f(); } catch { return null; }
  }
  async texto(p) { const b = await this.blob(p); return b ? b.text() : ''; }

  // PC (Chrome/Edge): elegir la carpeta bbs con permiso de solo lectura
  async abrirCarpeta() {
    const dir = await window.showDirectoryPicker({ id: 'carpeta-bbs', mode: 'read' });
    let raiz = dir;
    const tiene = async (d, n) => { try { await d.getDirectoryHandle(n); return true; } catch { return false; } };
    if (!(await tiene(raiz, 'assets')) && (await tiene(raiz, 'bbs'))) raiz = await raiz.getDirectoryHandle('bbs');
    if (!(await tiene(raiz, 'assets')) && !(await tiene(raiz, 'settings'))) {
      throw new Error('Esa carpeta no parece la de BBS. Elegí la carpeta "bbs" (adentro de config), la que tiene "assets" y "settings".');
    }
    await this.usarCarpeta(raiz);
    return raiz;
  }

  async usarCarpeta(raiz) {
    this.usuario = new Map(); this._rutas = null;
    const recorrer = async (d, pre) => {
      for await (const [n, h] of d.entries()) {
        const p = pre + n;
        if (h.kind === 'directory') await recorrer(h, p + '/');
        else this.usuario.set(p, () => h.getFile());
      }
    };
    for (const c of CARPETAS) {
      let d = raiz;
      try { for (const parte of c.split('/')) d = await d.getDirectoryHandle(parte); } catch { continue; }
      await recorrer(d, c + '/');
    }
    this.raiz = raiz; this.nombre = raiz.name; this.tipo = 'carpeta'; this._rutas = null;
  }

  // Celu o PC: abrir un paquete .zip (el que arma el botón "Paquete para el celu", o un zip de la carpeta bbs)
  async abrirZip(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const arch = unzipSync(buf, { filter: (f) => !f.name.endsWith('/') });
    this.usuario = new Map(); this._rutas = null;
    const nombres = Object.keys(arch);
    // buscar dónde empieza "assets/" o "settings/" (el zip puede traer carpetas de más arriba)
    let pre = '';
    for (const n of nombres) {
      const m = n.match(/^(.*?)(assets|settings)\//);
      if (m) { pre = m[1]; break; }
    }
    for (const n of nombres) {
      if (!n.startsWith(pre)) continue;
      const p = n.slice(pre.length);
      if (!/^(assets|settings)\//.test(p)) continue;
      const data = arch[n];
      this.usuario.set(p, () => Promise.resolve(new Blob([data], { type: p.endsWith('.png') ? 'image/png' : 'application/octet-stream' })));
    }
    if (!this.usuario.size) throw new Error('El .zip no tiene las carpetas "assets" ni "settings" de BBS.');
    this.nombre = file.name; this.tipo = 'zip';
  }

  // Arma un .zip liviano (modelos, texturas y forms) para pasar al celu
  async paquete(progreso = () => {}) {
    const lista = [...this.usuario.keys()].filter((p) => EXT_PAQUETE.test(p) && (p.startsWith('assets/models/') || p.startsWith('settings/forms/')));
    const arbol = {};
    let i = 0;
    for (const p of lista) {
      const b = await this.blob(p);
      if (b) arbol['bbs/' + p] = [new Uint8Array(await b.arrayBuffer()), { level: /\.png$/i.test(p) ? 0 : 6 }];
      if (++i % 50 === 0) progreso(i, lista.length);
    }
    progreso(lista.length, lista.length);
    return new Promise((res, rej) => zipAsync(arbol, (err, data) => (err ? rej(err) : res(new Blob([data], { type: 'application/zip' })))));
  }
}
