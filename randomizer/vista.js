// Vista 3D y textura plana de un personaje, usando el visor (../visor) tal cual.
import { Fuente } from '../visor/fuente.js';
import { Texturas, Modelos, Forms } from '../visor/bbs.js';
import { Visor } from '../visor/escena.js';
import { formaSimple } from './motor.js';

// La misma Fuente del visor, pero los modelos del mod (steve, alex...) se buscan en ../visor/builtin
export class FuenteRandomizer extends Fuente {
  // se carga una sola vez; mostrar() espera a que termine (si no, el primer dibujo se hacía sin modelos)
  cargarInterno() {
    if (!this.listo) this.listo = this._cargarInterno();
    return this.listo;
  }
  async _cargarInterno() {
    this.errorInterno = '';
    const base = new URL('../visor/builtin/', import.meta.url);
    try {
      let lista = null, fallo = null;
      for (let i = 0; i < 3 && !lista; i++) {   // reintenta: en el celu o con mala conexión el primer intento puede fallar
        try {
          const r = await fetch(new URL('index.json', base), { cache: i ? 'reload' : 'default' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          lista = await r.json();
        } catch (e) { fallo = e; await new Promise((ok) => setTimeout(ok, 400 * (i + 1))); }
      }
      if (!lista) throw fallo;
      for (const p of lista) {
        const url = new URL(p.split('/').map(encodeURIComponent).join('/'), base);
        this.interno.set('assets/' + p, () => fetch(url).then((r) => (r.ok ? r.blob() : null)));
      }
    } catch (e) { this.errorInterno = String((e && e.message) || e); }
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
    if (this.fuente && this.fuente.listo) await this.fuente.listo;
    if (!this.visor) this.visor = new Visor(this.cont);
    const forma = formaSimple(pj);
    const avisos = [];
    for (const c of pj.capas) {
      const r = c.ruta.startsWith('assets:') ? 'assets/' + c.ruta.slice(7) : null;
      if (!r || !(await this.fuente.blob(r))) avisos.push('No encontré ' + c.ruta.replace('assets:', ''));
    }
    const claves = this.claves();
    if (!claves.some((k) => k.toLowerCase() === String(pj.modelo).toLowerCase())) {
      const f = this.fuente, n = claves.length;
      avisos.push(`No encontré el modelo «${pj.modelo}» para dibujarlo (modelos disponibles: ${n}` +
        `${f && f.errorInterno ? '; los del mod no se pudieron cargar: ' + f.errorInterno : ''}). Probá recargar la página.`);
    }
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
