// Pantalla de los controles PlayStation Move: conectar, calibrar, ver botones y brazos en vivo, y elegir que hace cada boton.
import { moveHub, ACCIONES } from './local/psmove_hub.js';
import { NOMBRES_BOTON, botonesDe, BOTONES } from './nucleo/psmove.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
const HOMBRO = [0.19, 0.5];   // x, y (hacia abajo) de cada hombro desde la cadera, en metros

function dibujarFigura() {
  const cv = $('#psm-figura'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const vista = (cx, etiqueta, xDe) => {   // frente (x, y) y costado (z, y)
    const esc_ = 150, sy = 28;
    g.strokeStyle = '#6a7380'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, sy - 14); g.lineTo(cx, sy + 0.5 * esc_ + 20); g.stroke();   // cuerpo
    g.beginPath(); g.arc(cx, sy - 8, 9, 0, 7); g.stroke();
    g.fillStyle = '#9aa3b2'; g.font = '11px sans-serif'; g.textAlign = 'center'; g.fillText(etiqueta, cx, H - 4);
    for (const e of moveHub.controles) {
      const d = e.estado.d; if (!d) continue;
      const lado = e.mano === 'izq' ? 1 : -1, largo = 0.55 * esc_;
      const x0 = cx + (xDe === 'x' ? lado * HOMBRO[0] * esc_ * 0.7 : 0), y0 = sy;
      const dx = xDe === 'x' ? d[0] : d[2];
      g.strokeStyle = hex(e.ctl.color); g.lineWidth = 6;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + dx * largo, y0 + d[1] * largo); g.stroke();
      g.fillStyle = hex(e.ctl.color); g.beginPath(); g.arc(x0 + dx * largo, y0 + d[1] * largo, 7, 0, 7); g.fill();
    }
  };
  vista(W * 0.27, 'de frente', 'x'); vista(W * 0.75, 'de costado (adelante →)', 'z');
}

const info = (e) => `· ${e.ctl.nombre}${e.estado.bateria === null ? '' : ` · batería ${Math.round(e.estado.bateria * 100)} %`} · ${Math.round(e.estado.hz || 0)} datos/s`;
function tarjeta(e, i) {
  const b = botonesDe(e.estado.botones), p = e.mapa.paso;
  return `<div class="psm-card" data-i="${i}">
    <div class="psm-cab"><b style="color:${hex(e.ctl.color)}">●</b> <b>Control ${i + 1}</b> <span class="psm-info">${esc(info(e))}</span>
      <select class="psm-mano" aria-label="Mano"><option value="izq"${e.mano === 'izq' ? ' selected' : ''}>Mano izquierda</option><option value="der"${e.mano === 'der' ? ' selected' : ''}>Mano derecha</option></select></div>
    <div class="psm-botones">${Object.keys(BOTONES).map((n) => `<span class="psm-bot${b.includes(n) ? ' on' : ''}">${esc(NOMBRES_BOTON[n])}</span>`).join('')}</div>
    <div class="psm-gatillo"><span style="width:${Math.round((e.estado.gatillo / 255) * 100)}%"></span></div>
    <div class="vivo-cab">
      <button class="btn btn-chico psm-paso${p === 'abajo' ? ' pide' : ''}" data-paso="abajo">1 · Brazo abajo ${p !== 'abajo' ? '✓' : ''}</button>
      <button class="btn btn-chico psm-paso${p === 'adelante' ? ' pide' : ''}" data-paso="adelante" ${p === 'abajo' ? 'disabled' : ''}>2 · Brazo adelante ${p === 'listo' ? '✓' : ''}</button>
      <button class="btn btn-chico psm-giro" ${e.estado.calGiro ? 'disabled' : ''}>${e.estado.calGiro ? 'Calibrando…' : 'Calibrar giroscopio'}</button>
      <label class="campo-inline">Esfera <input type="color" class="psm-color" value="${hex(e.ctl.color)}"></label>
      <button class="btn btn-chico psm-vibrar">Vibrar</button>
      <button class="btn btn-chico psm-quitar">Desconectar</button>
    </div></div>`;
}

function pintar() {
  const lista = $('#psm-lista'); if (!lista) return;
  // las tarjetas se vuelven a armar solo si cambia algo que no sean los datos en vivo
  const firma = moveHub.controles.map((e) => `${e.mano}|${e.mapa.paso}|${!!e.estado.calGiro}|${hex(e.ctl.color)}`).join(';');
  if (lista.dataset.firma !== firma) {
    lista.dataset.firma = firma;
    lista.innerHTML = moveHub.controles.length ? moveHub.controles.map(tarjeta).join('') : '<p class="ayuda">Todavía no hay controles conectados.</p>';
  } else {
    moveHub.controles.forEach((e, i) => {
      const c = lista.querySelector(`.psm-card[data-i="${i}"]`); if (!c) return;
      const b = botonesDe(e.estado.botones);
      c.querySelectorAll('.psm-bot').forEach((el, k) => el.classList.toggle('on', b.includes(Object.keys(BOTONES)[k])));
      c.querySelector('.psm-gatillo span').style.width = Math.round((e.estado.gatillo / 255) * 100) + '%';
      c.querySelector('.psm-info').textContent = info(e);
    });
  }
  dibujarFigura();
}

export function iniciarMoveUI({ grabar }) {
  const sinSoporte = !moveHub.disponible;
  $('#psm-conectar').disabled = sinSoporte;
  if (sinSoporte) $('#psm-aviso').textContent = 'Este navegador no puede hablar con los controles Move: usá Chrome o Edge en la compu.';
  // botones -> acciones
  const sel = $('#psm-acciones');
  sel.innerHTML = Object.entries(ACCIONES).map(([k, a]) => `<label class="campo-inline">${esc(a.texto)}
    <select data-accion="${k}">${Object.entries(NOMBRES_BOTON).map(([b, t]) => `<option value="${b}"${moveHub.acciones[k] === b ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`).join('');
  sel.addEventListener('change', (e) => { const a = e.target.dataset.accion; if (a) moveHub.ponerAccion(a, e.target.value); });
  moveHub.alAccion = (accion) => { if (accion === 'grabar') grabar(); };
  moveHub.aviso = (t) => { $('#psm-aviso').textContent = t; };
  moveHub.alCambio = pintar;

  $('#psm-conectar').addEventListener('click', async () => {
    try { const n = await moveHub.conectar(); $('#psm-aviso').textContent = n ? 'Conectado. Probá apretando botones: se tienen que iluminar acá abajo.' : 'No se eligió ningún control.'; }
    catch (err) { $('#psm-aviso').textContent = err.name === 'NotFoundError' ? 'No se eligió ningún control.' : 'No se pudo abrir: ' + (err.message || err); }
  });
  $('#psm-lista').addEventListener('click', async (ev) => {
    const c = ev.target.closest('.psm-card'); if (!c) return;
    const e = moveHub.controles[Number(c.dataset.i)]; if (!e) return;
    try {
      if (ev.target.closest('.psm-paso')) moveHub.pasoCalibracion(e);
      else if (ev.target.closest('.psm-giro')) await moveHub.calibrarGiro(e);
      else if (ev.target.closest('.psm-vibrar')) await e.ctl.vibrar();
      else if (ev.target.closest('.psm-quitar')) await moveHub.quitar(e);
    } catch (err) { /* el aviso ya lo muestra el concentrador */ }
  });
  $('#psm-lista').addEventListener('change', async (ev) => {
    const c = ev.target.closest('.psm-card'); if (!c) return;
    const e = moveHub.controles[Number(c.dataset.i)]; if (!e) return;
    if (ev.target.classList.contains('psm-mano')) moveHub.ponerMano(e, ev.target.value);
    if (ev.target.classList.contains('psm-color')) { const h = ev.target.value; await e.ctl.poner({ color: [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)) }); pintar(); }
  });
  moveHub.reconectar().catch(() => {});   // los controles que ya se habian permitido
  pintar();
}
