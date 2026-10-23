// Reune los controles Move conectados: orientacion de cada uno, calibracion de los brazos, botones con acciones y grabacion de datos junto con cada toma.
import { Orientacion, MapaBrazo, calibrarGanancia, GANANCIA_GIRO, botonesDe, bateriaNivel, BOTONES } from '../nucleo/psmove.js';
import { elegirControles, controlesPermitidos, hidDisponible } from './psmove_hid.js';

const COLORES = [[255, 0, 160], [0, 200, 255], [255, 200, 0], [60, 255, 60]];
const guardado = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export const ACCIONES = {
  paso: { texto: 'Calibrar el brazo (siguiente pose)', defecto: 'PS' },
  grabar: { texto: 'Grabar / parar la toma', defecto: 'MOVE' },
  marcar: { texto: 'Marcar un momento (queda guardado con la toma)', defecto: 'CUADRADO' },
  recentrar: { texto: 'Recentrar (brazo adelante)', defecto: 'TRIANGULO' },
};

class Concentrador {
  constructor() {
    this.controles = []; this.alCambio = () => {}; this.alAccion = () => {}; this.aviso = () => {};
    this.acciones = { ...Object.fromEntries(Object.entries(ACCIONES).map(([k, v]) => [k, v.defecto])), ...guardado('psmove_acciones', {}) };
    this.toma = null; this._pend = false;
  }
  get hay() { return this.controles.length > 0; }
  get disponible() { return hidDisponible(); }

  async conectar() {
    const nuevos = await elegirControles();
    for (const c of nuevos) await this.agregar(c);
    return nuevos.length;
  }
  async reconectar() { for (const c of await controlesPermitidos()) await this.agregar(c).catch(() => {}); }

  async agregar(ctl) {
    if (this.controles.some((e) => e.ctl.hid === ctl.hid)) return;
    const n = this.controles.length;
    const mano = guardado('psmove_mano_' + n, n === 0 ? 'izq' : 'der');
    ctl.color = COLORES[n % COLORES.length];
    await ctl.abrir();
    const e = {
      ctl, mano, filtro: new Orientacion({ ganancia: guardado('psmove_k_' + mano, GANANCIA_GIRO) }), mapa: new MapaBrazo(),
      estado: { botones: 0, gatillo: 0, bateria: null, d: null, hz: 0, calGiro: null }, _n: 0, _tHz: performance.now(), _ultRec: 0,
    };
    ctl.alDato = (r) => this._dato(e, r);
    ctl.alCerrar = () => { this.controles = this.controles.filter((x) => x !== e); this._cambio(); };
    this.controles.push(e);
    this._cambio();
  }
  async quitar(e) { await e.ctl.cerrar(); }
  ponerMano(e, mano) {
    e.mano = mano; e.filtro.k = guardado('psmove_k_' + mano, e.filtro.k);
    guardar('psmove_mano_' + this.controles.indexOf(e), mano); this._cambio();
  }
  ponerAccion(nombre, boton) { this.acciones[nombre] = boton; guardar('psmove_acciones', this.acciones); }

  _dato(e, r) {
    const ant = e.estado.botones;
    e.filtro.actualizar(r.dt, r.giro, r.acel);
    Object.assign(e.estado, { botones: r.botones, gatillo: r.gatillo, bateria: bateriaNivel(r.bateria) });
    e.estado.d = e.mapa.listo ? e.mapa.direccion(e.filtro.q) : null;
    if (++e._n % 30 === 0) { const ahora = performance.now(); e.estado.hz = 30000 / (ahora - e._tHz); e._tHz = ahora; }
    if (e.estado.calGiro) e.estado.calGiro.muestras.push({ t: r.t, a: r.acel, g: r.giro });
    // botones: solo al apretar (no mientras se mantiene)
    for (const b of botonesDe(r.botones & ~ant)) this._boton(e, b);
    // datos para la toma: a unos 60 por segundo
    if (this.toma && e.estado.d && r.t - e._ultRec >= 1 / 60) {
      e._ultRec = r.t;
      // d: orientacion; g: gatillo de 0 (suelto) a 1 (apretado), para cerrar los dedos
      (this.toma[e.mano] = this.toma[e.mano] || []).push({ t: +(r.t - this.toma.t0).toFixed(4), d: e.estado.d.map((x) => +x.toFixed(4)), g: +(e.estado.gatillo / 255).toFixed(3) });
    }
    this._cambio();
  }
  _boton(e, b) {
    const accion = Object.keys(this.acciones).find((a) => this.acciones[a] === b);
    if (this.toma) this.toma.eventos.push({ t: +(performance.now() / 1000 - this.toma.t0).toFixed(3), mano: e.mano, boton: b });
    if (!accion) return;
    if (accion === 'paso') this.pasoCalibracion(e);
    else if (accion === 'recentrar') this.recentrar(e);
    else if (accion === 'marcar') this.marcar(e);
    else this.alAccion(accion, e);
  }

  // ---- calibracion de la posicion del brazo
  pasoCalibracion(e) {
    try {
      if (e.mapa.paso === 'abajo') { e.mapa.fijarAbajo(e.filtro.q); this.aviso(`Brazo ${e.mano === 'izq' ? 'izquierdo' : 'derecho'}: listo "abajo". Ahora estirá el brazo hacia adelante y repetí.`); e.ctl.vibrar(120).catch(() => {}); }
      else if (e.mapa.paso === 'adelante') { e.mapa.fijarAdelante(e.filtro.q); this.aviso(`Brazo ${e.mano === 'izq' ? 'izquierdo' : 'derecho'} calibrado. Ya podés moverlo.`); e.ctl.vibrar(250).catch(() => {}); }
      else { e.mapa = new MapaBrazo(); this.pasoCalibracion(e); return; }   // ya estaba listo: se empieza de nuevo
    } catch (err) { this.aviso(err.message); }
    this._cambio();
  }
  recentrar(e) {
    try {
      if (!e.mapa.eje) return this.aviso('Primero calibrá el brazo (pose abajo y adelante).');
      e.mapa.fijarAdelante(e.filtro.q); this.aviso('Recentrado (brazo adelante).'); e.ctl.vibrar(120).catch(() => {});
    } catch (err) { this.aviso(err.message); }
    this._cambio();
  }
  marcar(e) { this.aviso('Momento marcado.'); e.ctl.vibrar(80).catch(() => {}); if (this.toma) this.toma.marcas.push(+(performance.now() / 1000 - this.toma.t0).toFixed(3)); }

  // ---- giroscopio: 1 s quieto y despues se inclina el control de un lado a otro unos 6 s
  calibrarGiro(e, seg = 7) {
    return new Promise((ok, mal) => {
      if (e.estado.calGiro) return mal(new Error('Ya se está calibrando.'));
      e.estado.calGiro = { muestras: [] };
      this.aviso(`Giroscopio (${e.mano === 'izq' ? 'izquierdo' : 'derecho'}): dejalo quieto 1 segundo y después inclinalo hacia adelante, atrás y a los costados, sin girarlo en el lugar.`);
      e.ctl.vibrar(150).catch(() => {});
      this._cambio();
      setTimeout(() => {
        const m = e.estado.calGiro.muestras; e.estado.calGiro = null; e.ultCal = m;   // (ultCal: para revisar la calibracion)
        try {
          const r = calibrarGanancia(m);
          e.filtro.k = r.k; e.filtro.sesgo = r.sesgo.slice(); guardar('psmove_k_' + e.mano, r.k);
          this.aviso(`Giroscopio calibrado (${e.mano === 'izq' ? 'izquierdo' : 'derecho'}).`); e.ctl.vibrar(250).catch(() => {}); ok(r);
        } catch (err) { this.aviso(err.message); mal(err); }
        this._cambio();
      }, seg * 1000);
    });
  }

  // ---- toma: se guardan las direcciones de los brazos con el tiempo
  iniciarToma() { this.toma = { t0: performance.now() / 1000, eventos: [], marcas: [] }; for (const e of this.controles) e._ultRec = 0; }
  terminarToma() {
    const t = this.toma; this.toma = null;
    if (!t || !(t.izq?.length || t.der?.length)) return null;
    const datos = { version: 1, izq: t.izq || [], der: t.der || [], eventos: t.eventos, marcas: t.marcas };
    datos.duracion = Math.max(0, ...[...datos.izq, ...datos.der].map((m) => m.t));
    return datos;
  }

  _cambio() { if (this._pend) return; this._pend = true; requestAnimationFrame(() => { this._pend = false; this.alCambio(); }); }
}
export const moveHub = new Concentrador();
export { BOTONES };
