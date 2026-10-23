// Modo "Animaciones → BBS": una animacion 3D (FBX, GLB, BVH o .zip) pasada a un film de BBS, viendo las dos a la vez.
// Izquierda: la original con sus huesos. Derecha: el muñeco de Minecraft con el resultado. Una sola linea de tiempo.
// La conversion es la misma de «Importar animación» del Mocap (importar.js -> puntos tipo MediaPipe -> mocap.procesarCuerpo).
import { cargarAnimacion, aPose } from '../mocap/local/importar.js';
import * as mocap from '../mocap/nucleo/mocap.js';
import * as bbs from '../mocap/nucleo/bbsdat.js';
import * as emoticons from '../mocap/nucleo/emoticons.js';
import { Escena, TICKS_POR_S } from '../mocap/escena3d.js';
import { guardarSalida, esPC, abrirCarpetaSalida } from '../comun/plataforma.js';
import { VistaOriginal } from './original.js';
import { opcionesConversion, pistasDeActor, tipoDeRig, nombreSalida, NOMBRES_ORIGEN } from './nucleo.js';

const $ = (s) => document.querySelector(s);
const fmt = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const MODELOS_MC = { steve_bends: 'steve_bends', emoticons_steve: 'emoticons/steve' };

let an = null, archivo = '', clip = 0, resultado = null, base = null;   // base: { nombre, film } (film de BBS ya leido)
let t = 0, dur = 0, jugando = false, ult = 0;
let orig = null, mc = null;

function estado(txt, clase = '') { const e = $('#estado'); e.textContent = txt; e.className = clase; e.title = txt; }
function avisos(lista) { $('#avisos').replaceChildren(...lista.map((a) => Object.assign(document.createElement('div'), { textContent: '⚠ ' + a }))); }

// ---------- datos fijos (plantilla del film nuevo y armadura de emoticons) ----------
let fijos = null;
async function datosFijos() {
  if (!fijos) {
    const url = (p) => new URL('../mocap/datos/' + p, import.meta.url);
    const [plantilla, armadura] = await Promise.all([
      fetch(url('plantilla.dat')).then((r) => r.arrayBuffer()).then((b) => bbs.leer(new Uint8Array(b))),
      fetch(url('emoticons_steve.armadura.json')).then((r) => r.json()),
    ]);
    emoticons.ponerArmadura(armadura);
    fijos = { plantilla };
  }
  return fijos;
}

// ---------- vistas ----------
function iniciarVistas() {
  if (orig) return true;
  try {
    orig = new VistaOriginal($('#vOrig'));
    mc = new Escena($('#vMC'));
    let skin = null; try { skin = localStorage.getItem('anim_skin'); } catch { /* sin almacenamiento */ }
    if (skin) mc.ponerSkin(skin).catch(() => {});
    return true;
  } catch (e) { estado('Este navegador no pudo iniciar el 3D: ' + e.message, 'mal'); return false; }
}

// ---------- abrir la animacion ----------
async function abrir(f) {
  if (!f) return;
  if (!iniciarVistas()) return;
  pausa();
  estado('Leyendo ' + f.name + '…');
  try {
    const nuevo = await cargarAnimacion(f.name, await f.arrayBuffer());
    if (!nuevo.clips.length) throw new Error('El archivo no trae ninguna animación (solo el modelo quieto).');
    an = nuevo; archivo = an.archivo && an.archivo !== f.name ? an.archivo : f.name;
  } catch (e) { estado('No se pudo abrir: ' + (e.message || e), 'mal'); return; }
  $('#nombreArchivo').textContent = f.name; $('#nombreArchivo').title = f.name + (archivo !== f.name ? ' → ' + archivo : '');
  // el clip mas largo suele ser el de verdad
  clip = an.clips.reduce((m, c, i) => (c.duration > an.clips[m].duration ? i : m), 0);
  $('#selClip').innerHTML = an.clips.map((c, i) => `<option value="${i}">${(c.name || 'animación ' + (i + 1)).replace(/^.*\|/, '').replace(/[<>&]/g, '')} (${fmt(c.duration)} s)</option>`).join('');
  $('#selClip').value = String(clip);
  $('#filaClip').hidden = an.clips.length < 2;
  $('#vacioOrig').hidden = true; $('#leyOrig').hidden = false;
  orig.poner(an, an.clips[clip]); orig.verMalla($('#chkMalla').checked);
  $('#chkMalla').parentElement.hidden = !orig.mallas.length;   // un BVH no trae malla, solo huesos
  const rig = tipoDeRig(orig.esqueleto.bones.map((b) => b.name), an.tipo);
  $('#detOrig').textContent = `${rig} · ${orig.nHuesos} huesos · ${an.tipo.toUpperCase()}`;
  await convertir();
}

// ---------- convertir (cada vez que cambia algo) ----------
async function convertir() {
  if (!an) return;
  resultado = null; $('#btnGuardar').disabled = true; avisos([]);
  const c = an.clips[clip];
  dur = c.duration; $('#t').max = String(dur); $('#t').disabled = false; $('#btnPlay').disabled = false;
  if (an.faltan.length) {
    const lista = an.faltan.map((k) => NOMBRES_ORIGEN[k] || k).join(', ');
    $('#vacioMC').hidden = false;
    $('#vacioMC').innerHTML = `<b class="mal">No se puede pasar a Minecraft</b><span>No encuentro estos huesos: ${lista}.</span><span>Sirven esqueletos humanoides tipo Mixamo, BVH (CMU/DAZ) o parecidos.</span>`;
    $('#detMC').textContent = '';
    estado('Faltan huesos del humanoide', 'mal');
    ir(0); return;
  }
  estado('Convirtiendo…');
  await new Promise((r) => setTimeout(r, 20));   // que se vea el mensaje
  try {
    const f = await datosFijos();
    const actor = base ? Number($('#selActor').value || 0) : 0;
    const op = opcionesConversion({ estilo: $('#selEstilo').value, modelo: $('#selModelo').value, actor, hayFilm: !!base });
    const pose = aPose(an, c);
    const log = [];
    const r = mocap.procesarCuerpo(op, { pose, film: base ? base.film : null, plantilla: f.plantilla, biblioteca: {}, manual: [] }, (l) => log.push(l));
    const p = pistasDeActor(r.rep);
    resultado = { film: r.film, resumen: r.resumen, pistas: p };
    const modelo = r.resumen.usaEmot || /emoticons/.test(p.modelo) ? 'emoticons_steve' : 'steve_bends';
    mc.ponerModelo(modelo);
    mc.ponerAnimacion(p.huesos);
    const kf = Object.values(r.resumen.stats).reduce((s, [, k]) => s + k, 0);
    $('#detMC').textContent = `${MODELOS_MC[modelo]} · ${Math.round(dur * TICKS_POR_S)} ticks · ${kf} keyframes` + (r.resumen.poses ? ` · ${r.resumen.poses} poses` : '');
    $('#vacioMC').hidden = true;
    avisos(r.resumen.avisos || []);
    $('#btnGuardar').disabled = false;
    estado(`Listo: ${fmt(dur)} s` + (base ? ` → actor ${actor} de ${base.nombre}` : ''), 'ok');
  } catch (e) {
    $('#vacioMC').hidden = false; $('#vacioMC').innerHTML = '';
    $('#vacioMC').append(Object.assign(document.createElement('span'), { className: 'mal', textContent: 'No se pudo convertir: ' + (e.message || e) }));
    estado('No se pudo convertir', 'mal');
  }
  orig.ponerClip(c);   // aPose movio el esqueleto: se vuelve al momento que se estaba mirando
  ir(Math.min(t, dur));
}

// ---------- linea de tiempo ----------
function ir(nt) {
  t = Math.max(0, Math.min(dur, nt));
  if (orig && an) orig.ir(t);
  if (mc && resultado) mc.ir(t * TICKS_POR_S);
  $('#t').value = String(t);
  $('#lectura').textContent = `${fmt(t)} s · tick ${Math.round(t * TICKS_POR_S)}`;
}
function cuadro(ahora) {
  if (!jugando) return;
  const dt = Math.min(0.1, (ahora - ult) / 1000) * Number($('#selVel').value); ult = ahora;
  let nt = t + dt; if (nt > dur) nt = 0;   // se repite
  ir(nt);
  requestAnimationFrame(cuadro);
}
function play() { if (!an || jugando) return; jugando = true; ult = performance.now(); $('#btnPlay').textContent = '⏸'; requestAnimationFrame(cuadro); }
function pausa() { jugando = false; $('#btnPlay').textContent = '▶'; }
$('#btnPlay').onclick = () => (jugando ? pausa() : play());
$('#t').oninput = (e) => { pausa(); ir(Number(e.target.value)); };
addEventListener('keydown', (e) => {
  if (e.target.closest('input, select') && e.target.type !== 'range') return;
  if (e.code === 'Space') { e.preventDefault(); jugando ? pausa() : play(); }
  else if (e.code === 'ArrowRight') ir(t + 1 / TICKS_POR_S);
  else if (e.code === 'ArrowLeft') ir(t - 1 / TICKS_POR_S);
});

// ---------- film de base (opcional) ----------
$('#inBase').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const film = await bbs.leer(new Uint8Array(await f.arrayBuffer()));
    const reps = film.replays || [];
    if (!reps.length) throw new Error('ese film no tiene actores');
    base = { nombre: f.name, film };
    $('#selActor').innerHTML = reps.map((r, i) => {
      const form = r.form || {};
      const n = String(form.name || r.label || `Actor ${i}`).replace(/[<>&]/g, '');
      return `<option value="${i}">${i}: ${n}${form.model ? ' (' + String(form.model).replace(/[<>&]/g, '') + ')' : ''}</option>`;
    }).join('');
    $('#selActor').hidden = false; $('#btnSinBase').hidden = false;
    $('#txtBase').textContent = ' ' + f.name;
    $('#selModelo').insertAdjacentHTML('afterbegin', $('#selModelo option[value=auto]') ? '' : '<option value="auto">El del actor</option>');
    $('#selModelo').value = 'auto';
    await convertir();
  } catch (err) { estado('Ese archivo no es un film de BBS (.dat): ' + (err.message || err), 'mal'); }
};
$('#btnSinBase').onclick = async () => {
  base = null; $('#selActor').hidden = true; $('#btnSinBase').hidden = true; $('#txtBase').textContent = ' Film de base…';
  $('#selModelo option[value=auto]')?.remove(); $('#selModelo').value = 'steve_bends';
  await convertir();
};

// ---------- guardar ----------
$('#btnGuardar').onclick = async () => {
  if (!resultado) return;
  const b = $('#btnGuardar'); b.disabled = true;
  try {
    const nombre = nombreSalida(archivo, base ? base.nombre : '');
    const bytes = await bbs.escribir(resultado.film);
    const r = await guardarSalida('animaciones', nombre, bytes);
    estado(r + ' · copialo a la carpeta de films de BBS', 'ok');
    if (await esPC()) $('#btnCarpeta').hidden = false;
  } catch (e) { estado('No se pudo guardar: ' + (e.message || e), 'mal'); }
  b.disabled = false;
};
$('#btnCarpeta').onclick = () => abrirCarpetaSalida('animaciones');

// ---------- el resto de los controles ----------
for (const id of ['#inArchivo', '#inArchivo2']) $(id).onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; abrir(f); };
$('#selClip').onchange = (e) => { clip = Number(e.target.value); t = 0; convertir(); };
$('#selEstilo').onchange = () => convertir();
$('#selModelo').onchange = () => convertir();
$('#selActor').onchange = () => convertir();
$('#chkMalla').onchange = (e) => orig && orig.verMalla(e.target.checked);
$('#inSkin').onchange = (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !iniciarVistas()) return;
  const lector = new FileReader();
  lector.onload = () => mc.ponerSkin(lector.result).then(() => {
    try { localStorage.setItem('anim_skin', lector.result); } catch { /* sin almacenamiento */ }
    mc.ir(t * TICKS_POR_S); estado('Skin: ' + f.name);
  }).catch((err) => estado(err.message, 'mal'));
  lector.readAsDataURL(f);
};
// soltar el archivo en cualquier lado
addEventListener('dragover', (e) => { e.preventDefault(); $('#vOrig').classList.add('encima'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('#vOrig').classList.remove('encima'); });
addEventListener('drop', (e) => {
  e.preventDefault(); $('#vOrig').classList.remove('encima');
  const fs = [...(e.dataTransfer?.files || [])];
  const dat = fs.find((f) => /\.dat$/i.test(f.name)), otro = fs.find((f) => !/\.dat$/i.test(f.name));
  if (dat) { const dt = new DataTransfer(); dt.items.add(dat); $('#inBase').files = dt.files; $('#inBase').dispatchEvent(new Event('change')); }
  if (otro) abrir(otro);
});

iniciarVistas();
