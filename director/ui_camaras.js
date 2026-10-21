// Página "Cámaras": el Director propone varios planos por tramo de la escena y el usuario elige rápido el que le gusta.
// Después se agregan al film como clips de cámara (BBS FS o BBS 2.2) y sale un film nuevo.
import { $, esc, color, estado, app, guardarFilm, abrirSalida } from './app.js';
import * as formato from './nucleo/formato.js';
import * as planos from './nucleo/planos.js';
import * as C from './nucleo/camaras_auto.js';
import { clonar } from '../mocap/nucleo/bbsdat.js';

const R2D = 180 / Math.PI, D2R = Math.PI / 180;
const ASPECTO = 16 / 9;
let fmt = 'fs', solo = [], semilla = 1, P = null, vista = null;
const seg = (t) => (t / 20).toFixed(1) + ' s';

export function iniciar() {
  $('btnProponer').onclick = () => { semilla = 1; proponer(); };
  $('btnOtraTanda').onclick = () => { semilla++; proponer(); };
  $('btnAplicarCam').onclick = aplicar;
  $('btnSalidaCam').onclick = abrirSalida;
  $('camFormato').onchange = () => { fmt = $('camFormato').value; pintar(); };
  for (const id of ['camHasta', 'camMin', 'camMax', 'camEmpuje']) $(id).onchange = proponer;
  $('camFormato').innerHTML = Object.entries(formato.FORMATOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
}

/** Se abre un film nuevo: se detecta el formato y se eligen los actores. */
export function abrir() {
  const film = app.film;
  fmt = formato.detectar(film) || 'fs';
  $('camFormato').value = fmt;
  solo = formato.actoresPorDefecto(film, fmt);
  $('camTrabajo').hidden = false;
  $('camNombre').value = app.filmNombre + '_camaras';
  pintarActores();
  const v = formato.vistaParaCamaras(film, fmt, solo);
  $('camHasta').value = (planos.finSugerido(v) / 20).toFixed(1);
  proponer();
}

function pintarActores() {
  const reps = app.film.replays || [];
  $('camActores').innerHTML = reps.map((r, i) => {
    const f = r.form || {};
    if (!f.model && String(f.id ?? '') !== 'bbs:mob') return '';
    const nom = String(f.name || r.label || '').trim() || String(f.model || '').split('/').pop() || `#${i + 1}`;
    return `<label class="actor-chk"><input type="checkbox" data-i="${i}" ${solo.includes(i) ? 'checked' : ''}><span class="chip" style="background:${color(i)}"></span>${esc(nom)}</label>`;
  }).join('');
  for (const c of $('camActores').querySelectorAll('input')) c.onchange = () => {
    solo = [...$('camActores').querySelectorAll('input:checked')].map((x) => +x.dataset.i);
    proponer();
  };
}

function proponer() {
  if (!app.film) return;
  if (!solo.length) { $('camLista').innerHTML = ''; estado('estadoCam', 'Elegí al menos un actor para filmar.', 'aviso'); return; }
  try {
    vista = formato.vistaParaCamaras(app.film, fmt, solo);
    const hasta = Math.round((parseFloat($('camHasta').value) || 0) * 20) || null;
    P = planos.proponer(vista, {
      semilla, hasta, aspecto: ASPECTO, conEmpuje: $('camEmpuje').checked,
      minTicks: Math.round((parseFloat($('camMin').value) || 2.5) * 20), maxTicks: Math.round((parseFloat($('camMax').value) || 8) * 20),
    });
    pintar();
  } catch (e) { console.warn(e); estado('estadoCam', 'No pude armar los planos: ' + e.message, 'mal'); }
}

// ---------------------------------------------------------------- lo que se ve
function pintar() {
  if (!P) return;
  const cont = $('camLista');
  cont.innerHTML = P.tramos.map((t, k) => `
    <div class="tramo" data-k="${k}">
      <div class="cab"><b>Tramo ${k + 1}</b><span>${seg(t.desde)} – ${seg(t.hasta)}</span><span class="suave">${esc(t.titulo)}</span></div>
      <div class="opciones">${t.opciones.map((o, j) => `
        <button class="op${j === t.elegida ? ' sel' : ''}" data-j="${j}" title="${esc(o.nombre)} (clip de BBS: ${formato.FORMATOS[fmt] && fmt === 'fs' ? 'bbs:' + o.herramienta : 'bbs:movement'})${o.oclusion >= 0.35 ? ' · otro actor tapa un poco' : ''}">
          <canvas width="176" height="99"></canvas>
          <span class="nom">${esc(o.nombre)}</span>
          <span class="her">${fmt === 'fs' ? o.herramienta : 'movement'}${o.oclusion >= 0.35 ? ' · ⚠ tapado' : ''}</span>
        </button>`).join('')}
      </div>
    </div>`).join('');
  cont.querySelectorAll('.tramo').forEach((el) => {
    const t = P.tramos[+el.dataset.k];
    el.querySelectorAll('.op').forEach((b) => {
      const o = t.opciones[+b.dataset.j];
      miniatura(b.querySelector('canvas'), t, o);
      b.onclick = () => { t.elegida = +b.dataset.j; el.querySelectorAll('.op').forEach((x) => x.classList.toggle('sel', x === b)); resumen(); };
    });
  });
  resumen(P.avisos.length ? P.avisos.join('\n') : '');
}
function resumen(extra = '') {
  const n = P ? P.tramos.length : 0;
  estado('estadoCam', `${n} tramo(s). Tocá el plano que más te guste de cada uno; el recuadro verde es el elegido.` + (extra ? '\n' + extra : ''), extra ? 'aviso' : '');
  $('btnAplicarCam').disabled = !n;
}

// una miniatura: lo que vería la cámara a mitad del tramo (actores como cajas de 0,6×1,8×0,4)
function miniatura(cv, tramo, op) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const puntos = op.toma.puntos, largo = tramo.hasta - tramo.desde;
  const mid = largo / 2;
  const q = puntos.reduce((a, b) => (Math.abs(b[0] - mid) < Math.abs(a[0] - mid) ? b : a));
  const cam = [q[1], q[2], q[3]], yaw = q[4], pitch = q[5], fov = op.toma.fov, t = tramo.desde + q[0];
  const px = (n) => ((n.x + 1) / 2) * W, py = (n) => ((1 - n.y) / 2) * H;
  // cielo y piso
  const y = yaw * D2R, p = pitch * D2R;
  const lejos = [cam[0] - Math.sin(y) * 200, cam[1], cam[2] + Math.cos(y) * 200];
  const hz = C.proyectar(cam, yaw, pitch, lejos, fov, ASPECTO);
  const yh = Math.max(0, Math.min(H, py(hz)));
  ctx.fillStyle = '#26364a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2d3a2e'; ctx.fillRect(0, yh, W, H - yh);
  // tercios
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.beginPath();
  for (const k of [1, 2]) { ctx.moveTo((W * k) / 3, 0); ctx.lineTo((W * k) / 3, H); ctx.moveTo(0, (H * k) / 3); ctx.lineTo(W, (H * k) / 3); }
  ctx.stroke();
  // actores
  const todos = C.actores(vista);
  const cajas = [];
  for (const i of todos) {
    const e = C.estado(vista, i, t), a = e.yaw * D2R;
    const fr = [-Math.sin(a), Math.cos(a)], dr = [-Math.cos(a), -Math.sin(a)];
    const pts = [];
    for (const [sx, sy, sz] of [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]) {
      const lx = sx * 0.3, lz = sz * 0.2;
      pts.push([e.x + dr[0] * lx + fr[0] * lz, e.y + sy * 1.8, e.z + dr[1] * lx + fr[1] * lz]);
    }
    const cab = [];     // la cabeza: un cubo de 0,5 arriba del cuerpo
    for (const [sx, sy, sz] of [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]) {
      const lx = sx * 0.25, lz = sz * 0.25;
      cab.push([e.x + dr[0] * lx + fr[0] * lz, e.y + 1.35 + sy * 0.5, e.z + dr[1] * lx + fr[1] * lz]);
    }
    const pr = pts.map((P3) => C.proyectar(cam, yaw, pitch, P3, fov, ASPECTO));
    const prCab = cab.map((P3) => C.proyectar(cam, yaw, pitch, P3, fov, ASPECTO));
    if (pr.some((r) => r.z <= 0.05)) continue;
    const dist = Math.hypot(e.x - cam[0], e.y + 0.9 - cam[1], e.z - cam[2]);
    const ojos = [e.x, e.y + 1.6, e.z], nariz = [e.x + fr[0] * 0.7, e.y + 1.6, e.z + fr[1] * 0.7];
    cajas.push({ i, pr, prCab, dist, principal: tramo.sujetos.includes(i), mira: [C.proyectar(cam, yaw, pitch, ojos, fov, ASPECTO), C.proyectar(cam, yaw, pitch, nariz, fov, ASPECTO)] });
  }
  cajas.sort((a, b) => b.dist - a.dist);
  const caras = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  for (const c of cajas) {
    const col = color(c.i);
    ctx.globalAlpha = c.principal ? 0.9 : 0.45;
    for (const f of caras) {
      ctx.beginPath(); f.forEach((n, m) => (m ? ctx.lineTo(px(c.pr[n]), py(c.pr[n])) : ctx.moveTo(px(c.pr[n]), py(c.pr[n])))); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
    }
    ctx.fillStyle = '#f1d2b6';
    if (c.prCab.every((r) => r.z > 0.05)) for (const f of caras) {
      ctx.beginPath(); f.forEach((n, m) => (m ? ctx.lineTo(px(c.prCab[n]), py(c.prCab[n])) : ctx.moveTo(px(c.prCab[n]), py(c.prCab[n])))); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (c.mira.every((m) => m.z > 0.05)) {     // una rayita blanca hacia donde mira
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px(c.mira[0]), py(c.mira[0])); ctx.lineTo(px(c.mira[1]), py(c.mira[1])); ctx.stroke(); ctx.lineWidth = 1;
    }
  }
}

// ---------------------------------------------------------------- aplicar
async function aplicar() {
  if (!P || !P.tramos.length) return;
  estado('estadoCam', 'Armando el film…');
  try {
    const film = clonar(app.film);
    const clips = planos.clipsDe(film, P.tramos, fmt);
    formato.ponerCamaras(film, clips);
    const nombre = ($('camNombre').value || app.filmNombre + '_camaras').replace(/\.dat$/i, '');
    const donde = await guardarFilm(nombre, film);
    estado('estadoCam', `Listo: ${clips.length} cámara(s) nuevas (${fmt === 'fs' ? 'BBS FS' : 'BBS 2.2'}). El film original no se tocó.\n${donde || ''}`, 'ok');
  } catch (e) { console.warn(e); estado('estadoCam', 'No se pudo guardar: ' + e.message, 'mal'); }
}
