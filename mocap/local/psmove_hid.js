// Controles PlayStation Move por Bluetooth o USB, desde el navegador (WebHID): no hace falta instalar nada en la compu.
// Funciona en Chrome o Edge de escritorio (la ventana de Estudio BBS en la PC). El control tiene que estar conectado a Windows antes (ver la ayuda de la pantalla).
import { VID, PID_ZCM1, PID_ZCM2, modeloDe, decodificar, reporteLed } from '../nucleo/psmove.js';

export const hidDisponible = () => typeof navigator !== 'undefined' && 'hid' in navigator;
const FILTROS = [{ vendorId: VID, productId: PID_ZCM1 }, { vendorId: VID, productId: PID_ZCM2 }];

export class ControlMove {
  constructor(dispositivo) {
    this.hid = dispositivo; this.modelo = modeloDe(dispositivo.productId); this.id = Math.random().toString(36).slice(2, 8);
    this.color = [255, 0, 255]; this.vibracion = 0; this.alDato = null; this.alCerrar = null; this._timer = 0; this._ult = 0; this.reportes = 0;
    this._oyente = (e) => this._reporte(e);
  }
  get nombre() { return `${this.modelo === 'ZCM2' ? 'Move (PS4)' : 'Move (PS3)'}`; }
  async abrir() {
    if (!this.hid.opened) await this.hid.open();
    this.hid.addEventListener('inputreport', this._oyente);
    await this.mandarLed();
    this._timer = setInterval(() => this.mandarLed().catch(() => {}), 2000);   // la esfera se apaga sola si no se le recuerda su color
  }
  _reporte(e) {
    if (e.reportId !== 1) return;
    const datos = new Uint8Array(e.data.byteLength + 1); datos[0] = 1; datos.set(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), 1);
    let r; try { r = decodificar(datos, this.modelo); } catch { return; }
    this.reportes++;
    const t = (e.timeStamp || performance.now()) / 1000;
    const dt = this._ult ? t - this._ult : 0.01; this._ult = t;
    if (this.alDato) this.alDato({ ...r, t, dt, crudo: datos });
  }
  async mandarLed() { await this.hid.sendReport(0x06, reporteLed(...this.color, this.vibracion)); }
  async poner({ color, vibracion } = {}) {
    if (color) this.color = color;
    if (vibracion !== undefined) this.vibracion = vibracion;
    await this.mandarLed();
  }
  async vibrar(ms = 300) { await this.poner({ vibracion: 200 }); setTimeout(() => this.poner({ vibracion: 0 }).catch(() => {}), ms); }
  async cerrar() {
    clearInterval(this._timer);
    this.hid.removeEventListener('inputreport', this._oyente);
    try { await this.poner({ color: [0, 0, 0], vibracion: 0 }); } catch { /* ya desconectado */ }
    try { await this.hid.close(); } catch { /* idem */ }
    if (this.alCerrar) this.alCerrar();
  }
}

/** Abre el cuadro de Chrome/Edge para elegir los controles Move (se pueden elegir los dos juntos). */
export async function elegirControles() {
  if (!hidDisponible()) throw new Error('Este navegador no puede hablar con los controles. Usá Chrome o Edge en la compu (no sirve en el celular).');
  const dispositivos = await navigator.hid.requestDevice({ filters: FILTROS });
  return dispositivos.map((d) => new ControlMove(d));
}
/** Los controles que ya se permitieron antes (para reconectar sin preguntar). */
export async function controlesPermitidos() {
  if (!hidDisponible()) return [];
  return (await navigator.hid.getDevices()).filter((d) => d.vendorId === VID && (d.productId === PID_ZCM1 || d.productId === PID_ZCM2)).map((d) => new ControlMove(d));
}
