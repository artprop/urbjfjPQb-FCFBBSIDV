// Nucleo de Mocap BBS: puntos del video -> film de BBS. Port de mocap_core.py.
// No sabe nada de archivos ni de pantallas: recibe datos y devuelve el film nuevo (objeto) y un resumen.
// La app (PC o celular) se encarga de leer videos, guardar tomas y exportar el .dat.
import * as rt from './retarget.js';
import * as estilo from './estilo.js';
import * as manual from './manual.js';
import * as posesLib from './poses_lib.js';
import * as emoticons from './emoticons.js';
import { pistasRealistas } from './pistas.js';
import { B, clonar } from './bbsdat.js';
import * as M from './mat.js';

export const TICKS = 20;
export const IK_CADENAS = {
  right_arm_end: ['right_arm', 'right_elbow'], left_arm_end: ['left_arm', 'left_elbow'],
  right_leg_end: ['right_leg', 'right_knee'], left_leg_end: ['left_leg', 'left_knee'],
  low_body: ['low_body'],
};
export const PARTES = {
  torso: ['low_body'], cabeza: ['head'],
  brazo_izq: ['left_arm', 'left_elbow'], brazo_der: ['right_arm', 'right_elbow'],
  pierna_izq: ['left_leg', 'left_knee'], pierna_der: ['right_leg', 'right_knee'],
};
export const NOMBRES = {
  anchor: 'Giro del cuerpo', low_body: 'Torso', head: 'Cabeza',
  right_arm: 'Brazo derecho', right_elbow: 'Codo derecho', left_arm: 'Brazo izquierdo', left_elbow: 'Codo izquierdo',
  right_leg: 'Pierna derecha', right_knee: 'Rodilla derecha', left_leg: 'Pierna izquierda', left_knee: 'Rodilla izquierda',
};

// Opciones con sus valores por defecto (mismos nombres que config.ini del programa de PC)
export const OPCIONES = {
  estilo: 'minecraft', actor: 0, desde: 0, calidad: 'normal', espejo: false,
  sin_piernas: false, sin_giro: false, con_giro: false, neutral: 1.0,
  suavizado: 0.06, simplificar_grados: 1.2,
  transicion_min: 6, transicion_max: 12, velocidad_transicion: 0.6, quietud_gps: 60.0, pose_min: 4,
  detalle_grados: 15.0, cambio_min_grados: 6.0, neutral_grados: 8.0,
  modelo: 'auto', manual_sostener: 10, manual_antes: 8, manual_despues: 8,
  partes: 'torso,cabeza,brazo_izq,brazo_der,pierna_izq,pierna_der', torso: 0.4, poses_fijas: '',
  modo: 'cuerpo', ojos: false, ojos_mirada: 1.0, ojos_parpadeo: 0.5, ojos_cejas: true,
  cara_ojos: true, cara_boca: true, boca_sens: 1.0, boca_min_ticks: 2,
  limpio: false,      // datos sin ruido (animacion importada de un modelo 3D): ver retarget.compute
  usar_move: false,   // controles PlayStation Move en vez del cuerpo con la camara (ver nucleo/psmove.js)
  ojos_modo: 'poses', boca_labios: true, boca_muecas: false, cara_arrugas: false, arrugas_escala: 2, modelo_boca: 'Man_2', boca_estilo: 'clasico',   // ojos_modo: 'poses' (prediseñadas, a saltos) o 'vivo' (siguen tu cara)
};

// Para una animacion importada de un modelo 3D (FBX, GLB, BVH): los datos no tienen ruido, asi que van sin los filtros
// pensados para video (torso amortiguado, mediana, suavizado, codos con umbral alto) y simplificando poco: queda fiel.
// Medido con el Thriller (Mixamo): brazos y piernas a 0 grados del original (mediana y percentil 90), torso a ~4.
export const OPCIONES_IMPORTADA = { modo: 'cuerpo', desde: 0, neutral: 0, torso: null, con_giro: true, sin_giro: false,
  suavizado: 0.0001, simplificar_grados: 0.5, limpio: true, poses_fijas: '' };

/**
 * Convierte el cuerpo del video en pistas y las escribe en un film.
 * datos: { pose: {world, vis, times}, film: objeto BBS o null, plantilla: objeto BBS,
 *          biblioteca: {nombre: pose}, manual: [poses marcadas], cara: (opcional, para los ojos) }
 * Devuelve { film, resumen }.
 */
export function procesarCuerpo(opIn, datos, log = () => {}) {
  const op = { ...OPCIONES, ...opIn };
  const { world, vis, times } = datos.pose;
  const hayFilm = Boolean(datos.film);

  const elegidas = new Set(op.partes.split(',').map((p) => p.trim()).filter((p) => p in PARTES));
  if (!elegidas.size) throw new Error('No elegiste ninguna parte del cuerpo para animar. Marcá al menos una en "Qué animar".');
  let modeloFilm = '';
  if (hayFilm && op.actor >= 0 && op.actor < datos.film.replays.length) modeloFilm = String(datos.film.replays[op.actor].form?.model || '');
  const usaEmot = op.modelo === 'emoticons_steve' || (op.modelo === 'auto' && emoticons.esEmoticons(modeloFilm));
  const permitidos = new Set([...elegidas].flatMap((p) => PARTES[p]));
  const bones = rt.BONES.filter((b) =>
    (permitidos.has(b) || (b === 'anchor' && elegidas.has('torso')))
    && !(op.sin_piernas && (b.includes('leg') || b.includes('knee')))
    && !((op.sin_giro || (hayFilm && !op.con_giro)) && b === 'anchor'));
  // emoticons/steve: la punta del brazo (la mano) también se anima, con el meñique y el índice de la cámara
  if (usaEmot) for (const lado of ['left', 'right']) if (permitidos.has(lado + '_arm')) bones.push(lado + '_hand');
  const neutral = op.neutral > 0 ? ['head', 'low_body', 'anchor'] : [];
  const smooth = ['realista', 'manual'].includes(op.estilo) ? op.suavizado : Math.max(op.suavizado, 0.08);
  let { result, report } = rt.compute(world, vis, times, {
    smooth_s: smooth, neutral_s: op.neutral, neutral_bones: neutral, bones, torso: op.torso, torso_activo: elegidas.has('torso'), limpio: op.limpio,
  });
  if (!Object.keys(result).length) throw new Error('Ninguna parte del cuerpo se vio lo suficiente. Alejate de la camara o mejora la luz.');

  const avisos = [];
  const tapados = posesLib.tramosTapados(result);
  const rangos = posesLib.parsearRangos(op.poses_fijas);
  if (rangos.length) avisos.push(...posesLib.aplicar(result, rangos, datos.biblioteca || {}, 0.25, log));
  else if (tapados.length) {
    log(`  Los brazos no se veian en: ${tapados.map(([a, b]) => `${Math.round(a)}-${Math.round(b)} s`).join(', ')}. ` +
      'Ahi el programa los deja quietos; podes poner una pose prefabricada en "Poses prefabricadas".');
  }

  const filmPrevio = hayFilm ? datos.film : null;
  if (usaEmot) { result = emoticons.convertir(result); log('  Modelo: emoticons/steve' + (result['low_left_arm.end'] || result['low_right_arm.end'] ? ' (con la punta del brazo = mano, medida con el meñique y el índice de la cámara)' : '')); }

  let tracks, stats, nPoses = null;
  if (op.estilo === 'minecraft') {
    ({ tracks, stats, nPoses } = estilo.construir(result, {
      transicion_min: op.transicion_min, transicion_max: op.transicion_max, velocidad_transicion: op.velocidad_transicion,
      quietud_gps: op.quietud_gps, pose_min: op.pose_min, detalle_grados: op.detalle_grados,
      cambio_min_grados: op.cambio_min_grados, neutral_grados: op.neutral_grados,
    }, op.desde));
  } else if (op.estilo === 'manual' && manual.normalizar(datos.manual).length) {
    ({ tracks, stats, nPoses } = manual.construir(result, datos.manual, op.desde));
  } else {
    if (op.estilo === 'manual') {
      avisos.push('Todavía no marcaste poses: se generó la copia fiel del video (realista) para que la uses de guía. ' +
        'Abrí la Vista 3D, marcá los fotogramas que quieras y convertí de nuevo.');
    }
    ({ tracks, stats } = pistasRealistas(result, op.desde, M.radians(op.simplificar_grados)));
  }

  const film = clonar(hayFilm ? filmPrevio : datos.plantilla);
  const reps = film.replays;
  if (!(op.actor >= 0 && op.actor < reps.length)) throw new Error(`El film tiene ${reps.length} actores: el numero de actor va de 0 a ${reps.length - 1}.`);
  const rep = reps[op.actor];
  rep.animation = rep.animation || {};
  Object.assign(rep.animation, tracks);

  const form = rep.form || {};
  if (usaEmot && !hayFilm) form.model = 'emoticons/steve';
  const model = String(form.model || '');
  if (hayFilm && !usaEmot && model !== 'player/steve_bends') {
    avisos.push(`El actor usa el modelo "${model}"; el mocap esta pensado para steve_bends y emoticons/steve (podes forzar el modelo en "Modelo del personaje").`);
  }
  if (usaEmot && hayFilm && !emoticons.esEmoticons(model)) {
    avisos.push(`Elegiste emoticons/steve pero el actor del film usa "${model}": en el juego los huesos no van a coincidir.`);
  }
  for (const [cadena, huesos] of Object.entries(usaEmot ? emoticons.IK_CADENAS : IK_CADENAS)) {
    const c = form.ik && form.ik[cadena];
    if (c && c.enabled && Number(c.enabled.v ?? c.enabled) === 1 && huesos.some((h) => h in result)) {
      c.enabled = B(0);
      avisos.push(`IK "${cadena}" desactivado para que se vea el mocap.`);
    }
  }

  const dur = times[times.length - 1] - times[0];
  const omitidos = report.filter((l) => l.includes('omitido')).map((l) => l.trim().split(/\s+/)[0]);
  const nombreEstilo = { minecraft: 'estilo Minecraft', manual: 'a mano' }[op.estilo] || 'realista';
  log('');
  log(`LISTO  (${nombreEstilo})`);
  log(`  Duracion: ${dur.toFixed(1)} s  (${Math.trunc(dur * TICKS)} ticks), empieza en el tick ${op.desde}`);
  if (nPoses !== null) log(`  Poses detectadas: ${nPoses}`);
  log(`  Keyframes: ${Object.values(stats).reduce((s, [, k]) => s + k, 0)} en ${Object.keys(stats).length} partes del cuerpo`);
  if (omitidos.length) log('  No animado (no se veia): ' + omitidos.map((b) => NOMBRES[b] || b).join(', '));
  return { film, rep, result, resumen: { duracion: dur, stats, poses: nPoses, omitidos, avisos, usaEmot } };
}
