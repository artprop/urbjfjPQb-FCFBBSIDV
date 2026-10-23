// Reconocer las partes de un esqueleto humanoide cualquiera (Mixamo, Unreal, Unity/VRM, Rigify, DAZ, 3ds Max Biped,
// Character Creator, Second Life, MMD, BVH de CMU...). Primero por el nombre de cada hueso (entendiendo como cada
// programa marca el lado: LeftArm, upperarm_l, Arm.L, lShldr, Bip01 L UpperArm, 左腕...), y lo que falte, por la forma
// del esqueleto (donde se separan las piernas, de donde salen los brazos, donde nacen los dedos).
// No sabe nada de three.js: recibe [{ nombre, padre (indice o -1), pos: [x, y, z] en la pose de reposo }].

export const CENTRO = ['hips', 'neck', 'head'];
export const LADO = ['brazo', 'antebrazo', 'mano', 'muslo', 'pierna', 'pie', 'dedo_pie', 'indice', 'menique', 'pulgar'];
export const PARTES = [...CENTRO, ...['L', 'R'].flatMap((l) => LADO.map((p) => p + l))];
export const IMPRESCINDIBLES = ['hips', 'head', 'brazoL', 'antebrazoL', 'manoL', 'brazoR', 'antebrazoR', 'manoR',
  'musloL', 'piernaL', 'pieL', 'musloR', 'piernaR', 'pieR'];

// nombre "nucleo" de cada parte, de mas a menos seguro (sin el lado ni prefijos)
const SINONIMOS = {
  hips: ['hips', 'hip', 'pelvis', 'cog', 'root', '下半身', 'センター', 'center'],
  neck: ['neck', 'neck1', 'neck01', 'neck0', '首'],
  head: ['head', '頭'],
  brazo: ['upperarm', 'uparm', 'arm', 'shldrbend', 'shldr', 'humerus', '腕', 'shoulder'],
  antebrazo: ['forearm', 'lowerarm', 'forearmbend', 'elbow', 'radius', 'ulna', 'ひじ', '肘'],
  mano: ['hand', 'wrist', '手首', '手'],
  muslo: ['upleg', 'upperleg', 'thigh', 'thighbend', 'femur', 'hip', '足', '脚'],
  pierna: ['lowerleg', 'shin', 'calf', 'leg', 'knee', 'ひざ', '膝'],
  pie: ['ankle', 'foot', '足首'],   // si hay los dos (Second Life), «foot» es la punta
  dedo_pie: ['toebase', 'toe', 'toes', 'toe0', 'ball', 'つま先'],
  indice: ['handindex1', 'index1', 'index01', 'indexfinger1', 'finger1', '人指１', '人差指１'],
  menique: ['handpinky1', 'pinky1', 'pinky01', 'little1', 'littlefinger1', 'finger4', 'handring1', 'ring1', 'ring01', '小指１'],
  pulgar: ['handthumb2', 'thumb2', 'thumb02', 'handthumb1', 'thumb1', 'thumb01', 'finger0', '親指１'],
};
// palabras que no dicen nada de la parte (prefijos de cada programa)
const RELLENO = new Set(['bip', 'bip01', 'bip001', 'def', 'org', 'mch', 'j', 'cc', 'base', 'valvebiped', 'bn', 'b', 'm', 'sk', 'c', 'rig', 'armature', 'mixamorig']);
const IZQ = new Set(['l', 'left', 'lft']), DER = new Set(['r', 'right', 'rt', 'rgt']);

/** "mixamorig:LeftForeArm" -> { lado: 'L', nucleo: 'forearm' }; "upperarm_r" -> { lado: 'R', nucleo: 'upperarm' }. */
export function partirNombre(nombre) {
  let s = String(nombre).replace(/^.*[:|]/, '').replace(/^mixamorig\d*_?/i, '').trim();
  let lado = '';
  if (/^左/.test(s)) { lado = 'L'; s = s.slice(1); } else if (/^右/.test(s)) { lado = 'R'; s = s.slice(1); }
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  let tok = s.toLowerCase().split(/[\s_.\-]+/).filter(Boolean);
  const lados = new Set();
  tok = tok.flatMap((t) => {
    if (IZQ.has(t)) { lados.add('L'); return []; }
    if (DER.has(t)) { lados.add('R'); return []; }
    const m = t.match(/^(left|right)(.+)$/) || t.match(/^(.+?)(left|right)$/);   // "LEFTARM", "shoulderleft"
    if (m) { const [lad, resto] = m[1] === 'left' || m[1] === 'right' ? [m[1], m[2]] : [m[2], m[1]]; lados.add(lad === 'left' ? 'L' : 'R'); return [resto]; }
    return [t];
  });
  if (!lado && lados.size === 1) lado = [...lados][0];
  const util = tok.filter((t) => !RELLENO.has(t) && !/^bip0*1$/.test(t));
  return { lado, nucleo: (util.length ? util : tok).join('') };
}

const esAncestro = (H, a, b) => { for (let k = b; k >= 0; k = H[k].padre) if (k === a) return true; return false; };
function camino(H, a, b) {   // de a hasta b (a tiene que ser ancestro de b)
  const c = [];
  for (let k = b; k >= 0; k = H[k].padre) { c.push(k); if (k === a) return c.reverse(); }
  return null;
}
function ancestroComun(H, a, b) {
  const s = new Set(); for (let k = a; k >= 0; k = H[k].padre) s.add(k);
  for (let k = b; k >= 0; k = H[k].padre) if (s.has(k)) return k;
  return -1;
}

/** Por nombre: { parte: indice }. */
export function porNombre(H) {
  const partidos = H.map((h) => partirNombre(h.nombre));
  const m = {};
  const buscar = (cands, lado) => {
    for (const c of cands) { const i = partidos.findIndex((p) => p.nucleo === c && p.lado === lado); if (i >= 0) return i; }
    return -1;
  };
  for (const p of CENTRO) { const i = buscar(SINONIMOS[p], ''); if (i >= 0) m[p] = i; }
  for (const l of ['L', 'R']) for (const p of LADO) { const i = buscar(SINONIMOS[p], l); if (i >= 0) m[p + l] = i; }
  // cadenas coherentes: el antebrazo cuelga del brazo, la mano del antebrazo... si no, se descarta (lo arregla la forma)
  for (const l of ['L', 'R']) {
    for (const cad of [['brazo', 'antebrazo', 'mano'], ['muslo', 'pierna', 'pie', 'dedo_pie']]) {
      for (let k = 1; k < cad.length; k++) {
        const a = m[cad[k - 1] + l], b = m[cad[k] + l];
        if (a !== undefined && b !== undefined && !esAncestro(H, a, b)) for (const q of cad.slice(k)) delete m[q + l];
      }
    }
  }
  return m;
}

/** Por la forma: completa lo que falte en m (no toca lo que ya está). Devuelve las partes que agregó. */
export function porForma(H, m) {
  const n = H.length, agregadas = [];
  if (n < 5) return agregadas;
  const hijos = H.map(() => []); H.forEach((h, i) => { if (h.padre >= 0) hijos[h.padre].push(i); });
  const P = (i) => H[i].pos;
  let minY = Infinity, maxY = -Infinity; const c = [0, 0, 0];
  for (const h of H) { minY = Math.min(minY, h.pos[1]); maxY = Math.max(maxY, h.pos[1]); c[0] += h.pos[0] / n; c[2] += h.pos[2] / n; }
  const alto = maxY - minY || 1;
  const poner = (k, i) => { if (m[k] === undefined && i !== undefined && i >= 0) { m[k] = i; agregadas.push(k); } };

  // hacia donde mira: de los tobillos a la punta de los pies (sin eso, +Z como en Mixamo/glTF). izquierda = arriba x adelante
  let adelante = [0, 0, 1];
  const puntas = H.map((h, i) => i).filter((i) => !hijos[i].length && H[i].padre >= 0 && P(i)[1] < minY + 0.06 * alto);
  let fx = 0, fz = 0;
  for (const i of puntas) { const p = P(i), q = P(H[i].padre); fx += p[0] - q[0]; fz += p[2] - q[2]; }
  if (Math.hypot(fx, fz) > 0.02 * alto) adelante = [fx / Math.hypot(fx, fz), 0, fz / Math.hypot(fx, fz)];
  const izq = [adelante[2], 0, -adelante[0]];
  const lateral = (i) => (P(i)[0] - c[0]) * izq[0] + (P(i)[2] - c[2]) * izq[2];   // + = izquierda del personaje
  const signo = { L: 1, R: -1 };

  // cadera: donde se juntan los dos pies
  const masBajo = (lado, filtro = () => true) => {
    let mejor = -1;
    for (let i = 0; i < n; i++) if (lateral(i) * signo[lado] > 0.01 * alto && filtro(i) && (mejor < 0 || P(i)[1] < P(mejor)[1])) mejor = i;
    return mejor;
  };
  if (m.hips === undefined) {
    const a = masBajo('L'), b = masBajo('R');
    if (a >= 0 && b >= 0) poner('hips', ancestroComun(H, a, b));
  }
  const cad = m.hips;
  if (cad === undefined) return agregadas;

  // piernas
  for (const l of ['L', 'R']) {
    if (['musloL', 'piernaL', 'pieL'].every((k) => m[k.replace('L', l)] !== undefined)) continue;
    const hoja = masBajo(l, (i) => i !== cad && esAncestro(H, cad, i));
    const cam = hoja >= 0 ? camino(H, cad, hoja) : null;
    if (!cam || cam.length < 4) continue;
    const resto = cam.slice(1);
    const muslo = m['muslo' + l] ?? resto.find((i) => Math.abs(lateral(i)) > 0.02 * alto) ?? resto[0];
    const tras = resto.slice(resto.indexOf(muslo) + 1);
    // el tobillo: la ultima articulacion antes de que la cadena se vuelva horizontal (del tobillo a la punta del pie);
    // si no hay tramo horizontal, la que esta a la altura tipica de un tobillo
    const horizontal = (k) => { const a = P(tras[k]), b = P(tras[k + 1]); return Math.hypot(b[0] - a[0], b[2] - a[2]) > Math.abs(b[1] - a[1]); };
    const kPie = tras.findIndex((_, k) => k + 1 < tras.length && horizontal(k));
    const objetivoPie = minY + 0.055 * alto;
    const pie = m['pie' + l] ?? (kPie >= 1 ? tras[kPie]
      : tras.filter((i) => P(i)[1] >= minY + 0.02 * alto).sort((a, b) => Math.abs(P(a)[1] - objetivoPie) - Math.abs(P(b)[1] - objetivoPie))[0]);
    if (pie === undefined) continue;
    const medio = (P(muslo)[1] + P(pie)[1]) / 2;
    const entre = tras.slice(0, Math.max(0, tras.indexOf(pie)));
    const rodilla = m['pierna' + l] ?? entre.sort((a, b) => Math.abs(P(a)[1] - medio) - Math.abs(P(b)[1] - medio))[0];
    poner('muslo' + l, muslo); poner('pierna' + l, rodilla); poner('pie' + l, pie);
    const despues = cam[cam.indexOf(pie) + 1];
    if (despues !== undefined) poner('dedo_pie' + l, despues);
  }

  // brazos: las puntas mas a los costados que no son de las piernas (en pose A o con los brazos caidos, las manos
  // quedan a la altura de la cadera o mas abajo); el pecho es donde se juntan
  const arriba = (i) => i !== cad && P(i)[1] > minY + 0.3 * alto && !['L', 'R'].some((l) => m['muslo' + l] !== undefined && esAncestro(H, m['muslo' + l], i));
  const punta = {};
  for (const l of ['L', 'R']) {
    let mejor = -1;
    for (let i = 0; i < n; i++) if (arriba(i) && (mejor < 0 || lateral(i) * signo[l] > lateral(mejor) * signo[l])) mejor = i;
    punta[l] = mejor;
  }
  const pecho = punta.L >= 0 && punta.R >= 0 ? ancestroComun(H, punta.L, punta.R) : -1;
  if (pecho >= 0) {
    for (const l of ['L', 'R']) {
      if (lateral(punta[l]) * signo[l] < 0.1 * alto) continue;   // no hay brazo de ese lado
      const cam = camino(H, pecho, punta[l]);
      if (!cam || cam.length < 4) continue;
      const resto = cam.slice(1);
      const mano = m['mano' + l] ?? resto.find((i) => hijos[i].length >= 3) ?? resto[resto.length - 1];
      const k = cam.indexOf(mano);
      const ante = m['antebrazo' + l] ?? (k >= 2 ? cam[k - 1] : undefined);
      const kb = cam.indexOf(ante);
      const brazo = m['brazo' + l] ?? (kb >= 2 ? cam[kb - 1] : undefined);
      poner('mano' + l, mano); poner('antebrazo' + l, ante); poner('brazo' + l, brazo);
    }
    // cuello y cabeza: subiendo desde el pecho hacia el hueso mas alto
    let tope = 0; for (let i = 1; i < n; i++) if (P(i)[1] > P(tope)[1]) tope = i;
    const cam = esAncestro(H, pecho, tope) ? camino(H, pecho, tope).slice(1) : [];
    const d = (a, b) => Math.hypot(P(a)[0] - P(b)[0], P(a)[1] - P(b)[1], P(a)[2] - P(b)[2]);
    // sin cuello, el segundo es la punta de la cabeza (largo); con cuello, la cabeza queda cerca del cuello
    const sinCuello = cam.length === 2 && !hijos[cam[1]].length && d(cam[0], cam[1]) > 0.7 * d(pecho, cam[0]);
    if (cam.length >= 2 && !sinCuello) { poner('neck', cam[0]); poner('head', cam[1]); }
    else if (cam.length >= 1) poner('head', cam[0]);
  }
  return agregadas;
}

/** Todo junto: { mapa: {parte: indice}, origen: {parte: 'nombre' | 'forma'} }. */
export function reconocer(H) {
  const mapa = porNombre(H), origen = {};
  for (const k of Object.keys(mapa)) origen[k] = 'nombre';
  for (const k of porForma(H, mapa)) origen[k] = 'forma';
  return { mapa, origen };
}

/** Firma de un esqueleto (para recordar lo que el usuario corrigió a mano en ese mismo esqueleto). */
export function firma(H) {
  let h = 2166136261;
  for (const c of H.map((x) => x.nombre).sort().join('|')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return H.length + ':' + h.toString(36);
}
