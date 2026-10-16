// Vista 3D y textura plana de un personaje, usando el visor (../visor) tal cual.
import { Fuente } from '../visor/fuente.js';
import { Texturas, Modelos, Forms } from '../visor/bbs.js';
import { Visor } from '../visor/escena.js';
import { formaSimple } from './motor.js';

// La misma Fuente del visor, pero los modelos del mod (steve, alex...) se buscan en ../visor/builtin
export class FuenteRandomizer extends Fuente {
  async cargarInterno() {
    const base = new URL('../visor/builtin/', import.meta.url);
    try {
      const lista = await (await fetch(new URL('index.json', base))).json();
      for (const p of lista) {
        const url = new URL(p.split('/').map(encodeURIComponent).join('/'), base);
        this.interno.set('assets/' + p, () => fetch(url).then((r) => (r.ok ? r.blob() : null)));
      }
    } catch { /* sin modelos internos */ }
    this._rutas = null;
  }
}

export class Vista {
  constructor(contenedor3d, lienzo) {
    this.cont = contenedor3d;
    this.lienzo = lienzo;
    this.visor = null;
    this.token = 0;
  }
  usarFuente(fuente) {
    this.fuente = fuente;
    this.tex = new Texturas(fuente);
    this.modelos = new Modelos(fuente, this.tex);
    this.forms = new Forms(this.modelos, this.tex);
  }
  claves() { return this.modelos ? this.modelos.claves() : []; }

  // Dibuja el personaje {nombre, modelo, capas}. Devuelve la lista de avisos.
  async mostrar(pj) {
    const t = ++this.token;
    if (!this.visor) this.visor = new Visor(this.cont);
    const forma = formaSimple(pj);
    const avisos = [];
    for (const c of pj.capas) {
      const r = c.ruta.startsWith('assets:') ? 'assets/' + c.ruta.slice(7) : null;
      if (!r || !(await this.fuente.blob(r))) avisos.push('No encontré ' + c.ruta.replace('assets:', ''));
    }
    const claves = this.claves();
    if (!claves.some((k) => k.toLowerCase() === String(pj.modelo).toLowerCase())) avisos.push(`No encontré el modelo «${pj.modelo}» para dibujarlo.`);
    const [obj, cv] = await Promise.all([this.forms.construir(forma), forma.texture.length ? this.tex.canvas(forma.texture) : null]);
    if (t !== this.token) return null;
    this.visor.mostrar(obj, !this._yaEncuadrado);
    this._yaEncuadrado = true;
    this.dibujarPlano(cv);
    return avisos;
  }

  dibujarPlano(cv) {
    const l = this.lienzo, x = l.getContext('2d');
    if (!cv) { l.width = 64; l.height = 64; x.clearRect(0, 0, 64, 64); return; }
    const k = Math.max(1, Math.floor(256 / Math.max(cv.width, cv.height)));
    l.width = cv.width * k; l.height = cv.height * k;
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, l.width, l.height);
    x.drawImage(cv, 0, 0, l.width, l.height);
  }
  recentrar() { if (this.visor) this.visor.recentrar(); }
  limpiar() { ++this.token; if (this.visor) this.visor.mostrar(null); this.dibujarPlano(null); }
}
