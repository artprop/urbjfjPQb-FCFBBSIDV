// Simulación en vivo (modo Cuerpo): al lado de la cámara, un muñeco de Minecraft (steve_bends o emoticons/steve) o solo el esqueleto
// que se mueve en tiempo real con lo que entra: los controles PlayStation Move (con una esfera de su color en cada mano) o tu cuerpo en la cámara.
// Usa las mismas cuentas que la conversión: puntos del cuerpo -> rotaciones de los huesos de BBS (retarget.solveFrame) -> el muñeco.
import * as THREE from './three.module.min.js';
import { Escena } from './escena3d.js';
import * as rt from './nucleo/retarget.js';
import * as emoticons from './nucleo/emoticons.js';
import { poseEnVivo } from './nucleo/psmove.js';
import { moveHub } from './local/psmove_hub.js';
import * as M from './nucleo/mat.js';

const $ = (s) => document.querySelector(s);
const CONEX = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 7], [0, 8], [7, 8]];
const ALTO_CADERA = 0.78;                         // los puntos vienen con el origen en la cadera; el muñeco la tiene a esta altura
const MAX_EDAD_CAMARA = 400;                      // ms: sin datos más nuevos que esto, la cámara no cuenta
const HUESOS = ['anchor', 'low_body', 'head', 'right_arm', 'left_arm', 'right_elbow', 'left_elbow', 'right_leg', 'left_leg', 'right_knee', 'left_knee'];
const hex = (c) => (c ? (c[0] << 16) | (c[1] << 8) | c[2] : 0xffffff);

let escena = null, grupoEsq = null, marcas = [], activa = false, raf = 0, ultCuadro = 0;
let camara = null;               // { P (33 puntos de MediaPipe), vis, t }
let armaduraCargada = false;
const ref = {};                  // último giro de cada hueso (para que no salte de 180° a -180°)
let vista = 0;

/** La cámara le pasa cada cuadro: world = worldLandmarks[0] de MediaPipe, lm = landmarks[0] (para la visibilidad). */
export function alPoseCamara(world, lm) {
  camara = world ? { P: world.map((p) => [p.x, p.y, p.z]), vis: world.map((p, i) => (lm && lm[i] ? lm[i].visibility ?? 1 : p.visibility ?? 1)), t: performance.now() } : null;
}

const modo = () => $('#sim-modelo').value;       // 'steve_bends' | 'emoticons_steve' | 'esqueleto' | 'ambos'
const fuenteElegida = () => $('#sim-fuente').value;   // 'auto' | 'move' | 'camara'

function crear() {
  const cont = $('#sim-escena');
  if (escena || !cont.clientWidth) return;
  escena = new Escena(cont);
  grupoEsq = new THREE.Group(); escena.scene.add(grupoEsq);
  // esqueleto: líneas y puntitos
  const lineas = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(CONEX.length * 6), 3)), new THREE.LineBasicMaterial({ color: 0x6fb24a }));
  lineas.frustumCulled = false; lineas.name = 'huesos'; grupoEsq.add(lineas);
  const puntos = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.045 }));
  puntos.frustumCulled = false; puntos.name = 'puntos'; grupoEsq.add(puntos);
  for (let i = 0; i < 2; i++) {   // un control por mano: esfera de su color + cuerpo del control
    const g = new THREE.Group();
    const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    palo.position.y = -0.1;
    g.add(esfera, palo); g.visible = false; grupoEsq.add(g); marcas.push({ g, esfera, palo });
  }
  escena.vista('frente'); escena.dist = 3.6; escena._camara();
  cargarSkin();
  aplicarModo();
}
async function cargarSkin() {
  let url = null; try { url = localStorage.getItem('skin3d'); } catch { /* sin almacenamiento */ }
  if (url) await escena.ponerSkin(url).catch(() => {});
}
async function cargarArmadura() {
  if (armaduraCargada) return;
  const j = await (await fetch(new URL('./datos/emoticons_steve.armadura.json', import.meta.url))).json();
  emoticons.ponerArmadura(j); armaduraCargada = true;
}
function aplicarModo() {
  if (!escena) return;
  const m = modo(), muneco = m !== 'esqueleto';
  escena.ponerModelo(m === 'emoticons_steve' ? 'emoticons_steve' : 'steve_bends');
  escena.modelo.raiz.visible = muneco;
  grupoEsq.visible = m === 'esqueleto' || m === 'ambos' || true;   // los controles se ven siempre; los huesos solo en esqueleto/ambos
  grupoEsq.getObjectByName('huesos').visible = m === 'esqueleto' || m === 'ambos';
  grupoEsq.getObjectByName('puntos').visible = m === 'esqueleto' || m === 'ambos';
  if (m === 'emoticons_steve') cargarArmadura().catch(() => {});
  escena.dibujar();
}

// de dónde salen los puntos: los controles Move (si hay alguno calibrado) o la cámara
function fuente() {
  const e = fuenteElegida();
  const listos = moveHub.controles.filter((c) => c.mapa && c.mapa.listo && c.estado.d);
  if ((e === 'move' || e === 'auto') && listos.length) {
    const d = (mano) => { const c = listos.find((x) => x.mano === mano); return c ? c.estado.d : null; };
    return { tipo: 'move', P: poseEnVivo(d('izq'), d('der')), vis: new Array(33).fill(1) };
  }
  if ((e === 'camara' || e === 'auto') && camara && performance.now() - camara.t < MAX_EDAD_CAMARA) return { tipo: 'camara', P: camara.P, vis: camara.vis };
  return null;
}

function eulerDe(R, h) {
  const nuevo = rt.eulerNear(R, ref[h] || [0, 0, 0]);
  const v = ref[h] ? ref[h].map((x, k) => x + (nuevo[k] - x) * 0.6) : nuevo;   // un poco de suavizado
  ref[h] = v; return v;
}

function cuadro(ahora) {
  raf = 0;
  if (!activa) return;
  raf = requestAnimationFrame(cuadro);
  if (ahora - ultCuadro < 33) return;
  ultCuadro = ahora;
  if (!escena) { crear(); if (!escena) return; }
  const f = fuente();
  texto(f);
  if (!f) { pintarMarcas(null); escena.dibujar(); return; }
  const P = f.P.map((p) => rt.mpToBbs(p));   // ejes de MediaPipe -> BBS (los mismos que usa la conversión)
  // el muñeco
  if (modo() !== 'esqueleto') {
    let R;
    try { R = rt.solveFrame(P); } catch { R = null; }
    if (R) {
      const eul = {};
      for (const h of modo() === 'emoticons_steve' ? [...HUESOS, 'right_hand', 'left_hand'] : HUESOS) if (R[h]) eul[h] = eulerDe(R[h], h);
      let pose = eul;
      if (modo() === 'emoticons_steve') { if (!armaduraCargada) { pintarMarcas(P, f); escena.dibujar(); return; } try { pose = emoticons.poseUnica(eul); } catch { pose = eul; } }
      escena.verPose(pose);
    }
  }
  // el esqueleto y los controles
  const pos = grupoEsq.getObjectByName('huesos').geometry.attributes.position, pts = grupoEsq.getObjectByName('puntos').geometry.attributes.position;
  const V = (i) => [P[i][0], P[i][1] + ALTO_CADERA, P[i][2]];
  CONEX.forEach(([a, b], k) => { const A = V(a), B = V(b); pos.setXYZ(k * 2, ...A); pos.setXYZ(k * 2 + 1, ...B); });
  for (let i = 0; i < 33; i++) pts.setXYZ(i, ...V(i));
  pos.needsUpdate = true; pts.needsUpdate = true;
  pintarMarcas(P, f);
  escena.dibujar();
}

// los controles Move: una esfera del color de cada uno, puesta en la mano, y el cuerpo del control hacia el lado del antebrazo
function pintarMarcas(P, f) {
  marcas.forEach((m) => { m.g.visible = false; });
  if (!P || !f || f.tipo !== 'move') return;
  moveHub.controles.slice(0, 2).forEach((c, i) => {
    const iM = c.mano === 'izq' ? 15 : 16, iC = c.mano === 'izq' ? 13 : 14;
    if (!c.mapa || !c.mapa.listo) return;
    const m = marcas[i], mu = P[iM], co = P[iC];
    m.g.position.set(mu[0], mu[1] + ALTO_CADERA, mu[2]);
    m.esfera.material.color.setHex(hex(c.ctl.color));
    const d = new THREE.Vector3(mu[0] - co[0], mu[1] - co[1], mu[2] - co[2]).normalize();
    m.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);   // el cuerpo del control sigue al antebrazo
    m.palo.position.set(0, -0.1, 0);
    m.g.visible = true;
  });
}

function texto(f) {
  const el = $('#sim-estado'); if (!el) return;
  const cs = moveHub.controles;
  let t;
  if (f && f.tipo === 'move') {
    t = 'Moviendo con los controles Move. ' + cs.map((c) => `${c.mano === 'izq' ? 'Izq' : 'Der'}: ${c.mapa.listo ? 'calibrado ✓' : 'sin calibrar'}`).join(' · ');
  } else if (f && f.tipo === 'camara') t = 'Moviendo con tu cuerpo en la cámara.';
  else if (cs.length && !cs.some((c) => c.mapa && c.mapa.listo)) {
    const c = cs.find((x) => x.mapa && x.mapa.paso) || cs[0];
    t = `Hay ${cs.length} control(es) conectados pero falta calibrarlos: ${c.mapa.paso === 'abajo' ? 'con el brazo ABAJO apretá el botón PS (paso 1)' : 'estirá el brazo ADELANTE y apretá PS (paso 2)'}.`;
  } else if (cs.length === 0 && fuenteElegida() === 'move') t = 'No hay controles Move conectados (abrí «Controles PlayStation Move» y tocá «Conectar»).';
  else t = fuenteElegida() === 'camara' ? 'Esperando tu cuerpo en la cámara…' : 'Sin datos todavía: conectá y calibrá los Move, o ponete frente a la cámara.';
  el.textContent = t;
}

const VISTAS = ['frente', 'tres_cuartos', 'lado', 'atras'];
export function iniciarSimulacion() {
  if (!$('#sim-lado')) return;
  $('#sim-modelo').addEventListener('change', () => { try { localStorage.setItem('mocap_sim_modelo', modo()); } catch { /* sin almacenamiento */ } aplicarModo(); });
  $('#sim-fuente').addEventListener('change', () => { try { localStorage.setItem('mocap_sim_fuente', fuenteElegida()); } catch { /* sin almacenamiento */ } });
  $('#sim-vista').addEventListener('click', () => { if (!escena) return; vista = (vista + 1) % VISTAS.length; escena.vista(VISTAS[vista]); escena.dist = 3.6; escena._camara(); escena.dibujar(); });
  try {
    const a = localStorage.getItem('mocap_sim_modelo'), b = localStorage.getItem('mocap_sim_fuente');
    if (a && [...$('#sim-modelo').options].some((o) => o.value === a)) $('#sim-modelo').value = a;
    if (b && [...$('#sim-fuente').options].some((o) => o.value === b)) $('#sim-fuente').value = b;
  } catch { /* sin almacenamiento */ }
  // corre solo cuando se ve (modo Cuerpo, pantalla de grabar)
  const ver = () => { const visible = $('#sim-lado').offsetParent !== null; if (visible && !activa) { activa = true; raf = requestAnimationFrame(cuadro); } else if (!visible && activa) { activa = false; } };
  new MutationObserver(ver).observe(document.body, { attributes: true, subtree: false });
  new ResizeObserver(ver).observe($('#sim-lado'));
  addEventListener('resize', ver);
  setInterval(ver, 700);   // por si cambia el modo o se muestra otra pantalla
  ver();
}
export const simulacion = { get escena() { return escena; }, get activa() { return activa; } };
void M;
