// Ojos automáticos para BBS: de la skin de un personaje arma el modelo de ojos (geometría + textura + poses + animación).
// Sin dependencias del navegador (se prueba con node). Basado en el modelo de ojos de BBS (player/eyes, player/eyes_1px).
//
// Mapa de la cara (8x8 píxeles de la skin, frente de la cabeza) al modelo de la cabeza (en píxeles, cabeza de 8 de ancho):
//   columna c (0 = izquierda de la IMAGEN) ocupa x desde 3-c hasta 4-c (la izquierda de la imagen es +x del modelo)
//   fila f (0 = arriba) ocupa y desde 7-f hasta 8-f
// El ojo de la izquierda de la imagen es "eye_r" (x positivo) y el de la derecha es "eye_l", como en el modelo original.

export const NOMBRES_POSES = ['no_eyes', 'look_up', 'look_down', 'look_left', 'look_right', 'shock', 'thinking_left', 'thinking_right', 'i_figure', 'angry', 'annoyed',
  'cute', 'melancholy', 'sus', 'relaxed', 'pleading', 'sad', 'closed', 'huh', 'sleepy'];

// Poses del modelo de 2 píxeles de alto (las del modelo original). Solo lo que no es neutro: t = [x, y] en píxeles, s = [x, y], r = giro en Z (rad).
const REF = {"no_eyes":{"pupil_l":{"s":[0.0,0.0]},"pupil_r":{"s":[0.0,0.0]}},"look_up":{"pupil_l":{"t":[0.0,0.625]},"pupil_r":{"t":[0.0,0.625]}},"look_right":{"pupil_l":{"t":[1.0,0.0]},"pupil_r":{"t":[0.25,0.0]}},"shock":{"eyebrow_r":{"t":[0.0,-0.125],"r":-0.122173056},"pupil_l":{"s":[0.6,0.6]},"eyelid_lb":{"t":[0.0,0.125]},"eyelid_rb":{"t":[0.0,0.125]},"pupil_r":{"s":[0.6,0.6]},"eyebrow_l":{"t":[0.0,-0.125],"r":0.122173056}},"thinking_right":{"eyebrow_r":{"t":[0.0,-0.719]},"eyebrow_l":{"t":[0.0,0.594]}},"i_figure":{"pupil_l":{"t":[0.0,0.5]},"eyelid_lb":{"t":[0.0,0.281]},"pupil_r":{"t":[0.0,0.5]},"eyebrow_l":{"t":[0.0,-0.375]}},"angry":{"eyelid_lt":{"t":[0.0,-0.75],"s":[1.05,1.0],"r":-0.06981318},"eyebrow_r":{"t":[0.156,-0.687],"r":0.20943953},"eyelid_lb":{"t":[0.0,0.5],"s":[1.1,1.0],"r":0.13962635},"eyelid_rb":{"t":[0.0,0.5],"s":[1.1,1.0],"r":-0.13962635},"eyelid_rt":{"t":[0.0,-0.75],"s":[1.05,1.0],"r":0.06981318},"eyebrow_l":{"t":[-0.156,-0.687],"r":-0.20943953}},"cute":{"eyelid_lt":{"t":[0.0,-0.25],"s":[1.1,1.0],"r":0.08726647},"eyebrow_r":{"t":[0.0,0.25],"r":-0.08726647},"pupil_l":{"s":[2.0,1.0]},"eyelid_lb":{"t":[0.0,0.25],"r":-0.08726647},"eyelid_rb":{"t":[0.0,0.25],"r":0.08726647},"pupil_r":{"s":[2.0,1.0]},"eyelid_rt":{"t":[0.0,-0.25],"s":[1.1,1.0],"r":-0.08726647},"eyebrow_l":{"t":[0.0,0.25],"r":0.08726647}},"thinking_left":{"eyebrow_r":{"t":[0.0,0.594]},"eyebrow_l":{"t":[0.0,-0.719]}},"melancholy":{"eyelid_lt":{"t":[0.0,-0.812]},"eyebrow_r":{"t":[0.0,0.25],"r":-0.052359883},"eyelid_lb":{"t":[0.0,0.156],"s":[1.2,1.0],"r":0.03490659},"eyelid_rb":{"t":[0.0,0.156],"s":[1.2,1.0],"r":-0.03490659},"eyelid_rt":{"t":[0.0,-0.812]},"eyebrow_l":{"t":[0.0,0.25],"r":0.052359883}},"sus":{"eyelid_lt":{"t":[0.0,-0.5]},"eyebrow_r":{"t":[0.0,-0.625]},"eyelid_lb":{"t":[0.0,0.5]},"eyelid_rb":{"t":[0.0,0.5]},"eyelid_rt":{"t":[0.0,-0.5]},"eyebrow_l":{"t":[0.0,-0.625]}},"relaxed":{"eyebrow_r":{"t":[0.0,0.25],"r":-0.017453294},"pupil_l":{"t":[0.0,-0.125]},"eyelid_lb":{"t":[0.0,0.469],"s":[1.1,1.0],"r":-0.03490659},"eyelid_rb":{"t":[0.0,0.469],"s":[1.1,1.0],"r":0.03490659},"pupil_r":{"t":[0.0,-0.125]},"eyebrow_l":{"t":[0.0,0.25],"r":0.03490659}},"pleading":{"eyebrow_r":{"t":[0.0,0.625],"r":-0.08726647},"pupil_l":{"t":[0.0,0.125],"s":[2.0,1.0]},"pupil_r":{"t":[0.0,0.125],"s":[2.0,1.0]},"eyebrow_l":{"t":[0.0,0.625],"r":0.08726647}},"look_down":{"pupil_l":{"t":[0.0,-0.625]},"pupil_r":{"t":[0.0,-0.625]}},"sad":{"eyebrow_r":{"t":[0.0,-0.375],"r":-0.13962635},"pupil_l":{"s":[1.45,1.0]},"eyelid_lb":{"t":[0.0,0.273],"s":[1.2,1.0],"r":-0.06981318},"eyelid_rb":{"t":[0.0,0.273],"s":[1.2,1.0],"r":0.06981318},"pupil_r":{"s":[1.45,1.0]},"eyebrow_l":{"t":[0.0,-0.375],"r":0.13962635}},"closed":{"eyebrow_er":{"t":[0.0,2.0]},"eyelid_lt":{"t":[0.0,-0.945],"s":[1.0,1.15]},"eyebrow_r":{"t":[0.0,-2.0]},"eyelid_lb":{"t":[0.0,0.945],"s":[1.0,1.15]},"eyebrow_el":{"t":[0.0,2.0]},"eyelid_rb":{"t":[0.0,0.945],"s":[1.0,1.15]},"eyelid_rt":{"t":[0.0,-0.945],"s":[1.0,1.15]},"eyebrow_l":{"t":[0.0,-2.0]}},"annoyed":{"eyelid_lt":{"t":[0.0,-0.75],"s":[1.05,1.0],"r":-0.06981318},"eyebrow_r":{"t":[0.156,-0.531],"r":0.20943953},"eyelid_rt":{"t":[0.0,-0.75],"s":[1.05,1.0],"r":0.06981318},"eyebrow_l":{"t":[-0.156,-0.531],"r":-0.20943953}},"huh":{"eyebrow_r":{"t":[0.031,-0.719],"r":0.08726647},"eyelid_lb":{"t":[0.0,0.305]},"eyebrow_l":{"t":[0.0,-0.125]}},"sleepy":{"eyelid_lt":{"t":[0.0,-1.156],"s":[1.1,1.0],"r":0.052359883},"eyebrow_r":{"t":[0.0,-0.5]},"pupil_l":{"t":[0.0,-0.25],"s":[1.5,1.0]},"eyelid_lb":{"t":[0.0,0.625]},"eyelid_rb":{"t":[0.0,0.625]},"pupil_r":{"t":[0.0,-0.25],"s":[1.5,1.0]},"eyelid_rt":{"t":[0.0,-1.156],"s":[1.1,1.0],"r":-0.052359883},"eyebrow_l":{"t":[0.0,-0.5]}},"look_left":{"pupil_l":{"t":[-0.25,0.0]},"pupil_r":{"t":[-1.0,0.0]}}};

// ------------------------------------------------------------------ cara de la skin
/** Cara 8x8 (RGBA, 256 bytes) de una skin RGBA de w x h: el frente de la cabeza con la capa de arriba (sombrero) encima. */
export function caraDeSkin(rgba, w, h) {
  const out = new Uint8Array(8 * 8 * 4);
  const leer = (x, y) => { const i = (y * w + x) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]; };
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let p = (8 + x < w && 8 + y < h) ? leer(8 + x, 8 + y) : [0, 0, 0, 0];
    if (40 + x < w && 8 + y < h) { const s = leer(40 + x, 8 + y); if (s[3] >= 128) p = s; }
    if (p[3] < 255) p = [p[0], p[1], p[2], p[3] >= 128 ? 255 : 0];
    out.set(p, (y * 8 + x) * 4);
  }
  return out;
}

const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
const sat = (p) => { const mx = Math.max(p[0], p[1], p[2]), mn = Math.min(p[0], p[1], p[2]); return mx ? (mx - mn) / mx : 0; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const pix = (cara, f, c) => { const i = (f * 8 + c) * 4; return [cara[i], cara[i + 1], cara[i + 2], cara[i + 3]]; };
const esBlanco = (p) => Math.min(p[0], p[1], p[2]) >= 222 && Math.max(p[0], p[1], p[2]) >= 250 && lum(p) >= 225;
const esOscuro = (p) => lum(p) < 60;

/** Qué es cada píxel de la cara: 'B' blanco (esclerótica), 'O' oscuro (pupila o ceja), 'C' color fuerte (iris), '' piel/otra cosa. */
export function clasesDeCara(cara) {
  const base = [0, 1, 2].map((k) => mediana(Array.from({ length: 24 }, (_, i) => cara[((2 + (i / 8 | 0)) * 8 + (i % 8)) * 4 + k])));
  const clase = [];
  for (let f = 0; f < 8; f++) for (let c = 0; c < 8; c++) {
    const p = pix(cara, f, c);
    clase.push(p[3] < 128 ? '' : esBlanco(p) ? 'B' : esOscuro(p) ? 'O' : (sat(p) >= 0.5 && dist(p, base) > 100) ? 'C' : '');
  }
  return { base, clase };
}

const caja = (pts) => ({ c0: Math.min(...pts.map((p) => p.c)), c1: Math.max(...pts.map((p) => p.c)), r0: Math.min(...pts.map((p) => p.f)), r1: Math.max(...pts.map((p) => p.f)) });
const espejoCaja = (b) => ({ c0: 7 - b.c1, c1: 7 - b.c0, r0: b.r0, r1: b.r1 });
const espejoOjo = (o) => ({ ...espejoCaja(o), p: espejoCaja(o.p), ceja: o.ceja ? { c0: 7 - o.ceja.c1, c1: 7 - o.ceja.c0, r: o.ceja.r } : null });

/**
 * Busca los dos ojos en la cara. Devuelve { a, b, avisos }: a = el de la izquierda de la imagen, b = el de la derecha.
 * Cada ojo: { c0, c1, r0, r1 (caja del ojo, en columnas/filas de la cara), p: {c0,c1,r0,r1} (pupila o iris), ceja: {c0,c1,r} | null }.
 */
export function detectarOjos(cara) {
  const { clase, base } = clasesDeCara(cara);
  const FMIN = 2, FMAX = 5;
  const k = (f, c) => (f >= FMIN && f <= FMAX ? clase[f * 8 + c] : '');
  const visto = new Set(), comps = [];
  for (let f = FMIN; f <= FMAX; f++) for (let c = 0; c < 8; c++) {
    if (!k(f, c) || visto.has(f * 8 + c)) continue;
    const pts = [], pila = [[f, c]]; visto.add(f * 8 + c);
    while (pila.length) {
      const [y, x] = pila.pop(); pts.push({ f: y, c: x, k: k(y, x) });
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy, nx = x + dx;
        if (nx < 0 || nx > 7 || !k(ny, nx) || visto.has(ny * 8 + nx)) continue;
        visto.add(ny * 8 + nx); pila.push([ny, nx]);
      }
    }
    comps.push(pts);
  }
  const lados = { a: null, b: null };
  for (let pts of comps) {
    const cols = pts.map((p) => p.c);
    if (Math.min(...cols) <= 3 && Math.max(...cols) >= 4) continue;   // cruza el centro (nariz o boca)
    // una fila de arriba que es solo oscura, con blanco o color abajo, es la ceja
    let ceja = null;
    const top = Math.min(...pts.map((p) => p.f)), fila = pts.filter((p) => p.f === top);
    if (fila.every((p) => p.k === 'O') && pts.some((p) => p.f > top && (p.k === 'B' || p.k === 'C'))) {
      ceja = { c0: Math.min(...fila.map((p) => p.c)), c1: Math.max(...fila.map((p) => p.c)), r: top };
      pts = pts.filter((p) => p.f !== top);
    }
    const puntaje = 4 * pts.some((p) => p.k === 'B') + 3 * pts.some((p) => p.k === 'C') + pts.some((p) => p.k === 'O') - 0.05 * pts.length;
    const lado = Math.max(...cols) <= 3 ? 'a' : 'b';
    if (!lados[lado] || puntaje > lados[lado].puntaje) lados[lado] = { pts, ceja, puntaje };
  }
  const avisos = [];
  const armar = (d, lado) => {
    // un iris de varios colores: un píxel pegado a la pupila, distinto a la piel y no claro, también es pupila
    const hay = new Set(d.pts.map((p) => p.f * 8 + p.c));
    for (const p of d.pts.filter((q) => q.k === 'O' || q.k === 'C')) for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const f = p.f + dy, c = p.c + dx;
      if (f < FMIN || f > FMAX || c < 0 || c > 7 || hay.has(f * 8 + c)) continue;
      const q = pix(cara, f, c);
      if (q[3] < 128 || dist(q, base) <= 150 || lum(q) >= 200 || (sat(q) < 0.3 && lum(q) >= 90)) continue;
      hay.add(f * 8 + c); d.pts.push({ f, c, k: 'C' });
    }
    const ojo = caja(d.pts), pup = d.pts.filter((p) => p.k === 'O' || p.k === 'C');
    const p = pup.length ? caja(pup) : { c0: lado === 'a' ? ojo.c1 : ojo.c0, c1: lado === 'a' ? ojo.c1 : ojo.c0, r0: ojo.r0, r1: ojo.r1 };
    return { ...ojo, p, ceja: d.ceja };
  };
  let a = lados.a && armar(lados.a, 'a'), b = lados.b && armar(lados.b, 'b');
  if (a && !b) { b = espejoOjo(a); avisos.push('Solo encontré el ojo de la izquierda de la imagen: copié el otro en espejo.'); }
  else if (b && !a) { a = espejoOjo(b); avisos.push('Solo encontré el ojo de la derecha de la imagen: copié el otro en espejo.'); }
  else if (!a && !b) {
    const perfil = detectarPerfil(cara);
    if (perfil) { a = perfil; b = espejoOjo(a); avisos.push('Encontré los ojos por el contraste (blanco afuera, iris adentro). Revisalos sobre la cara.'); }
    else {
      a = { c0: 1, c1: 2, r0: 3, r1: 4, p: { c0: 2, c1: 2, r0: 3, r1: 4 }, ceja: null }; b = espejoOjo(a);
      avisos.push('No pude encontrar los ojos en esta skin: dejé los de Steve. Ajustalos a mano.');
    }
  }
  return { a, b, avisos };
}

/**
 * Ojos del modelo estándar (columnas 1-2 y 5-6: esclerótica en la de afuera, iris en la de adentro) buscados por contraste, para pieles que la otra
 * búsqueda no resuelve (pelo muy oscuro, esclerótica gris…). Una o dos filas donde la columna de afuera es bastante más clara que la de adentro.
 */
function detectarPerfil(cara) {
  const lu = (f, c) => lum(pix(cara, f, c));
  const s = [];
  for (let f = 1; f <= 6; f++) s[f] = ((lu(f, 1) - lu(f, 2)) + (lu(f, 6) - lu(f, 5))) / 2;
  const filas = [];
  for (let f = 1; f <= 6; f++) if (s[f] > 40) filas.push(f);
  if (!filas.length) return null;
  // la tanda de filas seguidas más fuerte (de 1 o 2 filas)
  let mejor = null;
  for (let i = 0; i < filas.length; i++) {
    const f0 = filas[i], f1 = filas[i + 1] === f0 + 1 ? f0 + 1 : f0;
    const fuerza = s[f0] + (f1 !== f0 ? s[f1] : 0);
    if (!mejor || fuerza > mejor.fuerza) mejor = { f0, f1, fuerza };
    if (f1 !== f0) i++;
  }
  if (mejor.f1 - mejor.f0 + 1 > 2) return null;
  // una esclerótica de arriba oscurecida (con la pupila aún más oscura al lado) sigue siendo parte del ojo
  if (mejor.f0 === mejor.f1 && mejor.f0 > 1) {
    const f = mejor.f0 - 1, pupArriba = Math.max(lu(f, 2), lu(f, 5));
    if (s[f] > 10 && pupArriba < 60 && Math.min(lu(f, 1), lu(f, 6)) > pupArriba + 8) mejor.f0 = f;
  }
  return { c0: 1, c1: 2, r0: mejor.f0, r1: mejor.f1, p: { c0: 2, c1: 2, r0: mejor.f0, r1: mejor.f1 }, ceja: null };
}

/** Colores sacados de la cara: piel (la más común en los costados de los ojos), blanco del ojo, color de las cejas. */
export function coloresDeCara(cara, ojos) {
  const { clase } = clasesDeCara(cara);
  const cuenta = new Map();
  for (const o of [ojos.a, ojos.b]) for (let f = Math.max(0, o.r0 - 1); f <= Math.min(7, o.r1 + 1); f++) for (let c = Math.max(0, o.c0 - 1); c <= Math.min(7, o.c1 + 1); c++) {
    if (clase[f * 8 + c]) continue;
    const p = pix(cara, f, c); if (p[3] < 128) continue;
    const key = p.slice(0, 3).join(','); cuenta.set(key, (cuenta.get(key) || 0) + 1);
  }
  let piel = null, mejor = 0;
  for (const [key, n] of cuenta) if (n > mejor) { mejor = n; piel = key.split(',').map(Number); }
  if (!piel) piel = [0, 1, 2].map((q) => mediana(Array.from({ length: 64 }, (_, i) => cara[i * 4 + q])));
  const blancos = [];
  for (const o of [ojos.a, ojos.b]) for (let f = o.r0; f <= o.r1; f++) for (let c = o.c0; c <= o.c1; c++) if (clase[f * 8 + c] === 'B') blancos.push(pix(cara, f, c));
  const blanco = blancos.length ? [0, 1, 2].map((q) => Math.round(blancos.reduce((s, p) => s + p[q], 0) / blancos.length)) : piel.slice();
  const cejas = [];
  for (const o of [ojos.a, ojos.b]) if (o.ceja) for (let c = o.ceja.c0; c <= o.ceja.c1; c++) cejas.push(pix(cara, o.ceja.r, c));
  const pelo = [0, 1, 2].map((q) => mediana(Array.from({ length: 16 }, (_, i) => cara[i * 4 + q])));   // las dos filas de arriba
  const ceja = cejas.length ? [0, 1, 2].map((q) => Math.round(cejas.reduce((s, p) => s + p[q], 0) / cejas.length)) : pelo;
  return { piel, blanco, ceja };
}

/** Texto corto para decirle al usuario qué tipo de ojo se detectó. */
export function describirOjo(o) {
  const w = o.c1 - o.c0 + 1, h = o.r1 - o.r0 + 1, pw = o.p.c1 - o.p.c0 + 1, ph = o.p.r1 - o.p.r0 + 1;
  if (w === 1 && h === 1) return 'ojo de un punto (1×1)';
  return `ojo de ${w}×${h} con pupila de ${pw}×${ph}${w === pw && h === ph ? ' (sin blanco)' : ''}`;
}

// ------------------------------------------------------------------ modelo
const r3 = (v) => Math.round(v * 1000) / 1000;
const xDe = (o) => [3 - o.c1, 4 - o.c0 + 0];      // [x desde, x hasta] de una caja de columnas
const yDe = (o) => [7 - o.r1, 8 - o.r0];          // [y desde, y hasta] de una caja de filas
const LADOS = {
  a: { s: 'r', ojo: 'eye_r', pupila: 'pupil_r', parpadoArriba: 'eyelid_rt', parpadoAbajo: 'eyelid_rb', ceja: 'eyebrow_r', puntaCeja: 'eyebrow_er', afuera: +1 },
  b: { s: 'l', ojo: 'eye_l', pupila: 'pupil_l', parpadoArriba: 'eyelid_lt', parpadoAbajo: 'eyelid_lb', ceja: 'eyebrow_l', puntaCeja: 'eyebrow_el', afuera: -1 },
};

/** Geometría de un ojo en el modelo (píxeles) + de dónde sale cada trozo de textura. */
function geometriaOjo(o, ceja) {
  const [x0, x1] = xDe(o), [y0, y1] = yDe(o), [px0, px1] = xDe(o.p), [py0, py1] = yDe(o.p);
  const g = { x0, x1, y0, y1, xc: (x0 + x1) / 2, w: x1 - x0, h: y1 - y0, px0, px1, py0, py1, pw: px1 - px0, ph: py1 - py0 };
  g.espacioMenosX = px0 - x0;       // lugar para que la pupila vaya hacia -x
  g.espacioMasX = x1 - px1;         // y hacia +x
  if (ceja) {
    const [bx0, bx1] = xDe({ c0: ceja.c0, c1: ceja.c1 }), by0 = 7 - ceja.r;
    g.ceja = { x0: bx0, x1: bx1, w: bx1 - bx0, y0: by0 - 0.025, xc: (bx0 + bx1) / 2 };
  }
  return g;
}

const cubo = (desde, tam, origen, caras) => ({ from: desde.map(r3), size: tam.map(r3), origin: origen, uvs: caras });

/**
 * Arma todo: { modelo (.bbs.json), poses, config, textura: {w, h, rgba}, info }.
 * cfg: { a, b (ojos como los da detectarOjos), saliente (px hacia afuera), colores: {piel, blanco, ceja} | null (para pisar los de la cara),
 *        parpadosLisos (párpados de un solo color), pestanas (celdas f*8+c con pestañas de la skin), nombre (del modelo) }.
 */
export function generar(cara, cfg) {
  const sal = cfg.saliente || 0;
  const { clase } = clasesDeCara(cara);
  const auto = coloresDeCara(cara, cfg);
  const col = { ...auto, ...(cfg.colores || {}) };
  const G = { a: geometriaOjo(cfg.a, cfg.a.ceja), b: geometriaOjo(cfg.b, cfg.b.ceja) };

  // ---- trozos de textura (cada uno: w x h píxeles RGBA)
  const trozos = [];     // { id, w, h, rgba }
  const hacer = (id, w, h, f) => { const rgba = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(f(x, y), (y * w + x) * 4); trozos.push({ id, w, h, rgba }); };
  const opaco = (c) => [c[0], c[1], c[2], 255];
  const pestanas = new Set(cfg.pestanas || []);     // celdas de la cara con pestañas de la skin: pasan a ser del párpado del modelo
  const dePiel = (f, c) => {
    if (f < 0 || f > 7 || c < 0 || c > 7) return opaco(col.piel);
    const p = pix(cara, f, c);
    if (pestanas.has(f * 8 + c) && p[3] >= 128) return p;
    return clase[f * 8 + c] || p[3] < 128 ? opaco(col.piel) : p;
  };
  const ocultaPiel = !!(cfg.parpadosLisos || (cfg.colores && cfg.colores.piel)) && !pestanas.size;   // párpados de un solo color en vez de copiar la piel de al lado
  for (const [lado, L] of Object.entries(LADOS)) {
    const o = cfg[lado], g = G[lado], w = o.c1 - o.c0 + 1, h = o.r1 - o.r0 + 1;
    const dentroPupila = (f, c) => f >= o.p.r0 && f <= o.p.r1 && c >= o.p.c0 && c <= o.p.c1;
    hacer(L.ojo, w, h, (x, y) => { const f = o.r0 + y, c = o.c0 + x; return dentroPupila(f, c) ? opaco(col.blanco) : (cfg.colores && cfg.colores.blanco && clase[f * 8 + c] === 'B' ? opaco(col.blanco) : pix(cara, f, c)); });
    const pw = o.p.c1 - o.p.c0 + 1, ph = o.p.r1 - o.p.r0 + 1;
    hacer(L.pupila, pw, ph, (x, y) => pix(cara, o.p.r0 + y, o.p.c0 + x));
    hacer(L.parpadoArriba, w, 1, (x) => (ocultaPiel ? opaco(col.piel) : dePiel(o.r0 - 1, o.c0 + x)));
    hacer(L.parpadoAbajo, w, 1, (x) => (ocultaPiel ? opaco(col.piel) : dePiel(o.r1 + 1, o.c0 + x)));
    if (o.ceja) {
      const bw = o.ceja.c1 - o.ceja.c0 + 1;
      hacer(L.ceja, bw, 1, (x) => (cfg.colores && cfg.colores.ceja ? opaco(col.ceja) : (clase[o.ceja.r * 8 + o.ceja.c0 + x] === 'O' ? pix(cara, o.ceja.r, o.ceja.c0 + x) : opaco(col.ceja))));
      hacer(L.puntaCeja, 1, 1, () => opaco(col.ceja));
    } else {
      hacer(L.ceja, 1, 1, () => [0, 0, 0, 0]);
      hacer(L.puntaCeja, 1, 1, () => [0, 0, 0, 0]);
    }
  }
  hacer('paredes', 1, 1, () => opaco(col.piel.map((v) => Math.round(v * 0.82))));

  // ---- empaquetado (estantes) en 16x16; si no entra, 32x32 o 64x64
  const orden = [...trozos].sort((p, q) => q.h - p.h || q.w - p.w);
  let T = 16, pos;
  for (; T <= 64; T *= 2) {
    pos = {}; let x = 0, y = 0, alto = 0, ok = true;
    for (const t of orden) {
      if (x + t.w > T) { x = 0; y += alto; alto = 0; }
      if (y + t.h > T) { ok = false; break; }
      pos[t.id] = { u: x, v: y }; x += t.w; alto = Math.max(alto, t.h);
    }
    if (ok) break;
  }
  const rgba = new Uint8Array(T * T * 4);
  for (const t of trozos) {
    const { u, v } = pos[t.id];
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) rgba.set(t.rgba.subarray((y * t.w + x) * 4, (y * t.w + x) * 4 + 4), ((v + y) * T + u + x) * 4);
  }
  const trozo = (id) => trozos.find((t) => t.id === id);
  // caras de un cubo: el frente usa todo el trozo; las demás usan su primer píxel
  const caras = (id) => {
    const { u, v } = pos[id], t = trozo(id), uno = [u, v, u + 1, v + 1];
    return { front: [u, v, u + t.w, v + t.h], back: uno, right: uno, left: uno, top: uno, bottom: uno };
  };

  // ---- grupos del modelo
  const grupos = {};
  const zEye = -3.8 - sal, zPup = -3.85 - sal, zLid = -3.95 - sal, zBrow = -4.05 - sal;
  const paredes = [];
  for (const [lado, L] of Object.entries(LADOS)) {
    const g = G[lado], P = caras('paredes');
    paredes.push(
      cubo([g.x0, g.y0, -4 - sal], [0, g.h, 1], [g.x0 - 1, g.y0, -3 - sal], { right: P.right }),
      cubo([g.x1, g.y0, -4 - sal], [0, g.h, 1], [g.x1 - 1, g.y0, -3 - sal], { left: P.left }),
      cubo([g.x0, g.y1, -4 - sal], [g.w, 0, 1], [g.xc, g.y1 - 0.5, -3 - sal], { bottom: P.bottom }),
      cubo([g.x0, g.y0, -4 - sal], [g.w, 0, 1], [g.xc, g.y0 + 0.5, -3 - sal], { top: P.top }),
    );
  }
  grupos.anchor = { rotate: [0, 0, 0], origin: [-2, 5.5, -3.5 - sal], cubes: paredes };
  const pieza = (padre, origen, cubos) => ({ rotate: [0, 0, 0], parent: padre, origin: origen.map(r3), cubes: cubos });
  // orden de grupos como el modelo original
  const orden2 = [['a', 'ojo'], ['b', 'ojo'], ['a', 'pupila'], ['b', 'pupila'], ['a', 'parpadoArriba'], ['b', 'parpadoAbajo'], ['a', 'parpadoAbajo'], ['b', 'parpadoArriba'],
    ['b', 'ceja'], ['b', 'puntaCeja'], ['a', 'ceja'], ['a', 'puntaCeja']];
  for (const [lado, tipo] of orden2) {
    const L = LADOS[lado], g = G[lado], nombre = L[tipo];
    if (tipo === 'ojo') grupos[nombre] = pieza('anchor', [g.xc, g.y0, -3.3 - sal], [cubo([g.x0, g.y0, zEye], [g.w, g.h, 1], [0, g.y0, -3.9 - sal], caras(nombre))]);
    else if (tipo === 'pupila') grupos[nombre] = pieza('anchor', [(g.px0 + g.px1) / 2, (g.py0 + g.py1) / 2, -3.4 - sal], [cubo([g.px0, g.py0, zPup], [g.pw, g.ph, 1], [0, g.py0, -3.9 - sal], caras(nombre))]);
    else if (tipo === 'parpadoArriba') grupos[nombre] = pieza('anchor', [g.xc, g.y1 + 0.5, -3.5 - sal], [cubo([g.x0, g.y1, zLid], [g.w, 0.9, 1], [0, g.y0, -4 - sal], caras(nombre))]);
    else if (tipo === 'parpadoAbajo') grupos[nombre] = pieza('anchor', [g.xc, g.y0 - 0.5, -3.5 - sal], [cubo([g.x0, g.y0 - 0.9, zLid], [g.w, 0.9, 1], [0, g.y0, -4 - sal], caras(nombre))]);
    else if (tipo === 'ceja') {
      const c = g.ceja || { x0: g.x0, w: g.w, xc: g.xc, y0: g.y1 - 0.025 };
      grupos[nombre] = pieza('anchor', [c.xc, c.y0 + 0.525, -3.5 - sal], [cubo([c.x0, c.y0, zBrow], [c.w, 1, 1], [0, g.y0, -4 - sal], caras(nombre))]);
    } else {
      const c = g.ceja || { x0: g.x0, x1: g.x1, w: g.w, xc: g.xc, y0: g.y1 - 0.025 };
      const x = L.afuera > 0 ? c.x1 - 0.025 : c.x0 - 0.975, y = c.y0 - 1.0;
      grupos[nombre] = pieza(L.ceja, [x + 0.5, y + 0.5, -3.55 - sal], [cubo([x, y, zBrow], [1, 1, 1], [0, g.y0, -4 - sal], caras(nombre))]);
    }
  }

  // ---- animación de las pupilas (siguen la cabeza y el joystick)
  const lim = (m, c) => (m > 0 ? m : c);
  const anim = { idle: { groups: {}, duration: 0 }, idle_control: { groups: {}, duration: 0 } };
  for (const [lado, L] of Object.entries(LADOS)) {
    const g = G[lado], H = g.h;
    const ln = lim(g.espacioMenosX, 0.25), lp = lim(g.espacioMasX, 0.25);     // cuánto se mueve hacia -x (t.x positivo) y hacia +x
    const sinLugar = g.pw >= g.w;
    const gy = 0.5 * Math.max(1, H / 2), gj = 0.25 * H;
    const num = (v) => String(r3(v));
    const xi = sinLugar ? '0' : `math.clamp(query.head_yaw, -45, 45) / (query.head_yaw < 0 ? -${num(45 / ln)} : -${num(45 / lp)})`;
    const xj = sinLugar ? '0' : `joystick.l_x * (joystick.l_x < 0 ? ${num(g.espacioMasX > 0 ? lp : gj)} : ${num(g.espacioMenosX > 0 ? ln : gj)})`;
    anim.idle.groups[L.pupila] = { translate: [[0, 'linear', xi, `(math.clamp(query.head_pitch, -45, 45) / 45) / -${num(1 / gy)}`, 0]] };
    anim.idle_control.groups[L.pupila] = { translate: [[0, 'linear', xj, `-joystick.l_y * ${num(gj)}`, 0]] };
  }
  const orden3 = (o) => ({ pupil_l: o.pupil_l, pupil_r: o.pupil_r });
  anim.idle.groups = orden3(anim.idle.groups); anim.idle_control.groups = orden3(anim.idle_control.groups);

  const modelo = { version: '0.7.2', animations: anim, model: { texture: [T, T], groups: grupos } };
  const poses = generarPoses(G);
  const nombre = cfg.nombre || 'eyes_nuevo';
  const config = {
    texture: `assets:models/player/${nombre}/textura.png`,
    bones: { eye_l: { hidden: true, opposite: 'eye_r' }, eye_r: { hidden: true }, pupil_l: { opposite: 'pupil_r' }, eyelid_lt: { opposite: 'eyelid_rt' },
      eyelid_lb: { opposite: 'eyelid_rb' }, eyebrow_l: { opposite: 'eyebrow_r' }, eyebrow_el: { opposite: 'eyebrow_er' } },
  };
  return { modelo, poses, config, textura: { w: T, h: T, rgba }, trozos, colores: col, info: { ojoA: describirOjo(cfg.a), ojoB: describirOjo(cfg.b), textura: `${T}×${T}` } };
}

// ------------------------------------------------------------------ poses
/** Las 20 poses de los ojos de BBS, ajustadas a la forma de estos ojos (alto, lugar de la pupila, tamaño de los párpados). */
export function generarPoses(G) {
  const ladoDe = (hueso) => (/_(r|er|rt|rb)$/.test(hueso) ? 'a' : 'b');
  const poses = {};
  for (const nombre of NOMBRES_POSES) {
    const ref = REF[nombre] || {}, pose = {};
    for (const [hueso, v] of Object.entries(ref)) {
      const g = G[ladoDe(hueso)], kv = Math.max(0.5, Math.min(2, g.h / 2));
      const t = (v.t || [0, 0]).slice(), s = (v.s || [1, 1]).slice();
      let r = v.r || 0;
      if (hueso.startsWith('pupil_')) {
        if (nombre === 'look_right' || nombre === 'look_left') {
          const ln = g.espacioMenosX > 0 ? g.espacioMenosX : 0.25, lp = g.espacioMasX > 0 ? g.espacioMasX : 0.25;
          t[0] = nombre === 'look_right' ? ln : -lp;
          if (g.pw >= g.w) t[0] = 0;
        }
        if (s[0] > 1) s[0] = Math.max(1, Math.min(s[0], g.w / g.pw));
        if (s[1] > 1) s[1] = Math.max(1, Math.min(s[1], g.h / g.ph));
      } else if (hueso.startsWith('eyelid_')) {
        t[1] *= kv;
        t[1] = Math.max(-g.h, Math.min(g.h, t[1]));
      } else if (hueso.startsWith('eyebrow_e')) {
        // la punta de la ceja acompaña a su ceja
      } else if (hueso.startsWith('eyebrow_')) {
        if (t[1] < 0) t[1] *= kv;
      }
      pose[hueso] = { r, s, t };
    }
    if (nombre === 'closed') {
      for (const lado of ['a', 'b']) {
        const L = LADOS[lado], g = G[lado], yc = (g.y0 + g.y1) / 2;
        const sy = Math.max(1.1, (g.h / 2 + 0.1) / 0.9);
        const arriba = { o: g.y1 + 0.5 }, abajo = { o: g.y0 - 0.5 };
        pose[L.parpadoArriba] = { r: 0, s: [1, sy], t: [0, (yc - 0.05) - (arriba.o - 0.5 * sy)] };
        pose[L.parpadoAbajo] = { r: 0, s: [1, sy], t: [0, (yc + 0.05) - (abajo.o + 0.5 * sy)] };
        pose[L.ceja] = { r: 0, s: [1, 1], t: [0, -g.h] };
        pose[L.puntaCeja] = { r: 0, s: [1, 1], t: [0, g.h] };
      }
    }
    const out = {};
    for (const [h, v] of Object.entries(pose)) {
      out[h] = { r2: [0, 0, 0], r: [0, 0, Math.round(v.r * 1e8) / 1e8], s: [r3(v.s[0]), r3(v.s[1]), 1], t: [r3(v.t[0]), r3(v.t[1]), 0], fix: 0 };
    }
    poses[nombre] = { static: false, pose: out };
  }
  return poses;
}

// ------------------------------------------------------------------ dibujo de frente (para la vista previa; sirve con cualquier lienzo 2D)
/**
 * Dibuja los ojos vistos de frente sobre la cara. ctx: contexto 2D; carga: ImageData/Canvas de la textura (T x T);
 * modelo: el .bbs.json; pose: { hueso: {r:[x,y,z], s:[x,y,z], t:[x,y,z]} } (formato de poses.json) o null; E = píxeles por píxel de skin.
 */
export function dibujarFrente(ctx, textura, modelo, pose, E, ox = 0, oy = 0, rango = null) {
  const grupos = modelo.model.groups;
  const mat = (a, b, c, d, e, f) => [a, b, c, d, e, f];
  const por = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const memo = {};
  const mundo = (id) => {
    if (memo[id]) return memo[id];
    const g = grupos[id], p = pose && pose[id];
    const t = p ? p.t : [0, 0, 0], s = p ? p.s : [1, 1, 1], rz = p ? p.r[2] : 0;
    const [px, py] = g.origin;
    let m = mat(1, 0, 0, 1, -t[0], t[1]);
    m = por(m, mat(1, 0, 0, 1, px, py));
    m = por(m, mat(Math.cos(rz), Math.sin(rz), -Math.sin(rz), Math.cos(rz), 0, 0));
    m = por(m, mat(s[0], 0, 0, s[1], 0, 0));
    m = por(m, mat(1, 0, 0, 1, -px, -py));
    if (g.parent && grupos[g.parent]) m = por(mundo(g.parent), m);
    return (memo[id] = m);
  };
  const piezas = [];
  for (const [id, g] of Object.entries(grupos)) for (const c of (g.cubes || [])) if (c.uvs.front && c.size[0] > 0 && c.size[1] > 0) piezas.push({ id, c });
  piezas.sort((p, q) => q.c.from[2] - p.c.from[2]);     // de atrás para adelante (z más negativo = más cerca)
  for (const { id, c } of piezas) {
    if (rango === 'detras' && c.from[2] <= -4) continue;      // la piel está en z = -4: lo que está atrás se ve solo por el hueco
    if (rango === 'delante' && c.from[2] > -4) continue;
    const [u0, v0, u1, v1] = c.uvs.front, uw = u1 - u0, vh = v1 - v0;
    const xmax = c.from[0] + c.size[0], ymax = c.from[1] + c.size[1];
    // píxel de textura (u,v) -> modelo (x = xmax - (u-u0)*sx, y = ymax - (v-v0)*sy) -> hueso -> pantalla (X = (4 - x) * E, Y = (8 - y) * E)
    const aModelo = mat(-c.size[0] / uw, 0, 0, -c.size[1] / vh, xmax + (u0 * c.size[0]) / uw, ymax + (v0 * c.size[1]) / vh);
    const pantalla = mat(-E, 0, 0, -E, 4 * E + ox, 8 * E + oy);
    const m = por(pantalla, por(mundo(id), aModelo));
    ctx.save(); ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(textura, u0, v0, uw, vh, u0, v0, uw, vh);
    ctx.restore();
  }
}

/**
 * La escena como la ve BBS: la skin de la cara con el hueco de los ojos borrado (la "máscara de borrado"), los ojos del modelo detrás
 * (los párpados y la pupila quedan escondidos detrás de la piel y solo se ven por el hueco) y las cejas, que van por delante de la piel.
 * cara: lienzo o imagen de 8x8 con la cara; huecos: [{c0, c1, r0, r1}] en columnas/filas de la cara.
 */
export function dibujarEscena(ctx, { cara, textura, modelo, pose, E, huecos, desvio = 0 }) {   // desvio: filas que se baja el modelo (ojos estándar más abajo en la cara)
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#16110f'; ctx.fillRect(0, 0, 8 * E, 8 * E);
  dibujarFrente(ctx, textura, modelo, pose, E, 0, desvio * E, 'detras');
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, 8 * E, 8 * E);
  for (const h of huecos) ctx.rect(h.c0 * E, h.r0 * E, (h.c1 - h.c0 + 1) * E, (h.r1 - h.r0 + 1) * E);
  ctx.clip('evenodd');
  ctx.imageSmoothingEnabled = false; ctx.drawImage(cara, 0, 0, 8 * E, 8 * E);
  ctx.restore();
  dibujarFrente(ctx, textura, modelo, pose, E, 0, desvio * E, 'delante');
  ctx.restore();
}

// ------------------------------------------------------------------ máscaras de borrado (capas "erase" de BBS)
/** Una sugerencia para la máscara de la boca: la caja de lo oscuro o de color fuerte entre las columnas 2 y 5, filas 5 a 7. null si no hay. */
export function detectarBoca(cara, ojos = null) {
  const { clase } = clasesDeCara(cara);
  const enOjo = (f, c) => !!ojos && [ojos.a, ojos.b].some((o) => f >= o.r0 && f <= o.r1 && c >= o.c0 && c <= o.c1);
  const pts = [];
  for (let f = 5; f <= 7; f++) for (let c = 2; c <= 5; c++) if ((clase[f * 8 + c] === 'O' || clase[f * 8 + c] === 'C') && !enOjo(f, c)) pts.push({ f, c });
  if (!pts.length) return null;
  return { c0: Math.min(...pts.map((p) => p.c)), c1: Math.max(...pts.map((p) => p.c)), r0: Math.min(...pts.map((p) => p.f)), r1: Math.max(...pts.map((p) => p.f)) };
}

/** Celdas de la cara (f*8+c) de cada máscara: ojos (las cajas de los dos ojos), boca (una caja) y pestañas (celdas sueltas). */
export function celdasDeMascaras(cfg) {
  const caja = (b) => { const s = new Set(); if (b) for (let f = b.r0; f <= b.r1; f++) for (let c = b.c0; c <= b.c1; c++) s.add(f * 8 + c); return s; };
  return { ojos: new Set([...caja(cfg.a), ...caja(cfg.b)]), boca: caja(cfg.mascaras && cfg.mascaras.boca), pestanas: new Set((cfg.mascaras && cfg.mascaras.pestanas) || []) };
}

/**
 * PNG (RGBA) de una máscara de borrado del tamaño de la skin: píxeles opacos donde BBS tiene que borrar la textura de abajo.
 * Cada celda de la cara (columna c, fila f) está en la skin en (8+c, 8+f); con `sombrero`, también en la capa de arriba (40+c, 8+f) si ahí hay algo.
 */
export function mascaraRGBA(w, h, skinRgba, celdas, sombrero = true) {
  const out = new Uint8Array(w * h * 4);
  const poner = (x, y) => { if (x < w && y < h) out.set([255, 255, 255, 255], (y * w + x) * 4); };
  for (const k of celdas) {
    const f = k >> 3, c = k & 7;
    poner(8 + c, 8 + f);
    if (sombrero && 40 + c < w && 8 + f < h && skinRgba[((8 + f) * w + 40 + c) * 4 + 3] > 0) poner(40 + c, 8 + f);
  }
  return out;
}

// ------------------------------------------------------------------ form de BBS del personaje
import { FORM_BASE, PARTE_OJOS, PARTE_DEDOS } from './plantilla_form.js';
const clonar = (o) => JSON.parse(JSON.stringify(o));
const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

/**
 * El form del personaje, en el formato que exporta BBS (lista de forms): el modelo del cuerpo con la skin y las capas de borrado
 * ({ path, erase: true }) encima, y los ojos como parte de «head».
 * opciones: { nombre, modeloBase ('player/steve'...), rutaSkin ('assets:models/...'), capas: [{path, shiftY?}], modeloOjos ('player/eyes_x'), texturaOjos, bajarOjos (filas) }
 */
export function formPersonaje(o) {
  const f = clonar(FORM_BASE);
  f.name = o.nombre; f.model = o.modeloBase || 'player/steve';
  f.texture = [{ path: o.rutaSkin }, ...(o.capas || []).map((c) => (c.shiftY ? { path: c.path, erase: true, shiftY: c.shiftY } : { path: c.path, erase: true }))];
  const parte = clonar(PARTE_OJOS);
  parte.form.model = o.modeloOjos; parte.form.texture = o.texturaOjos || ''; parte.bone = 'head';
  if (o.poseOjos) parte.form.pose = { pose: Object.fromEntries(Object.entries(o.poseOjos).map(([h, p]) => [h, { r2: [0, 0, 0], r: p.r.slice(), s: p.s.slice(), t: p.t.slice(), fix: 0.0, color: -1, lighting: 0.0 }])) };   // el ajuste de tamaño y lugar, sin colores propios
  if (o.bajarOjos) parte.transform = { r2: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1], t: [0, -o.bajarOjos * 0.0625, 0] };   // ojos estándar más abajo en la cara: se bajan en el form, no en el modelo
  f.parts = [parte];
  // manos con dedos (opcional): o.dedos = { izq, der } con la pose de cada mano ({hueso: {r2, r, s, t, fix, color, lighting}}) o null
  for (const [lado, hueso, nom] of [['izq', 'left_arm_item', 'ManoIzq'], ['der', 'right_arm_item', 'ManoDer']]) {
    const pose = o.dedos && o.dedos[lado]; if (!pose) continue;
    const m = clonar(PARTE_DEDOS);
    m.bone = hueso; m.form.name = nom; m.form.track_name = nom.toLowerCase(); m.form.texture = o.rutaSkin; m.form.pose = { pose: clonar(pose) };
    f.parts.push(m);
  }
  return { id: uuid(), title: o.nombre, forms: [f] };
}

/** ¿Brazos finos (Alex)? En una skin de 64x64 con brazos de 3 píxeles, la última columna del brazo derecho está vacía. */
export function brazosFinos(rgba, w, h) {
  if (h < 64) return false;
  let vacios = 0, total = 0;
  for (let y = 20; y < 32; y++) for (const x of [54, 55]) { total++; if (rgba[(y * w + x) * 4 + 3] === 0) vacios++; }
  return vacios >= total * 0.9;
}

// ------------------------------------------------------------------ lo que ya usás vos (sacado de tu archivo de presets)
/**
 * Tus archivos en BBS. Todo está en assets/models/player/_LosSaucera. La máscara de borrado de los ojos que usás es AEsclerotica1x2.png:
 * 1 fila por 2 columnas por ojo, en el lugar de los ojos de Steve (columnas 1-2 y 5-6, fila 4); en las skins de brazos finos (Alex) con los ojos
 * una fila más abajo la corrés con shiftY: 1 (y los ojos del modelo se bajan 0,0625 en la parte).
 */
export const USUARIO = {
  carpeta: 'player/_LosSaucera',
  mascaraOjos: { ruta: 'assets:models/player/_LosSaucera/PelosYMisc/OjosMask/AEsclerotica1x2.png', cols: [[1, 2], [5, 6]], fila: 4 },
  carpetaMascaras: 'PelosYMisc/Mascaras',      // dónde van las máscaras nuevas (boca, pestañas…) que no son las tuyas
};
/** Las celdas que borra tu máscara de ojos corrida `dy` filas. */
export function celdasMascaraUsuario(dy = 0) {
  const s = new Set();
  for (const [c0, c1] of USUARIO.mascaraOjos.cols) for (let c = c0; c <= c1; c++) s.add((USUARIO.mascaraOjos.fila + dy) * 8 + c);
  return s;
}

/**
 * ¿Los ojos de esta skin son los del modelo estándar (player/eyes: 2×2; player/eyes_1px: 2×1), solo que más arriba o más abajo?
 * Devuelve { variante: 'eyes' | 'eyes_1px', dy } (dy = filas más abajo que los de Steve) o null si hace falta un modelo propio.
 */
export function compararConEstandar(cfg) {
  const A = cfg.a, B = cfg.b, h = A.r1 - A.r0 + 1;
  if (cfg.saliente || h < 1 || h > 2) return null;
  const bien = (o, cols, pup) => o.c0 === cols[0] && o.c1 === cols[1] && o.r1 - o.r0 + 1 === h && o.p.c0 === pup && o.p.c1 === pup && o.p.r0 === o.r0 && o.p.r1 === o.r1
    && (!o.ceja || (o.ceja.c0 === o.c0 && o.ceja.c1 === o.c1 && o.ceja.r === o.r0 - 1));
  if (!bien(A, [1, 2], 2) || !bien(B, [5, 6], 5) || A.r0 !== B.r0 || A.r1 !== B.r1) return null;
  return { variante: h === 1 ? 'eyes_1px' : 'eyes', dy: A.r1 - 4 };
}

/**
 * Los colores lisos de cada pieza de los ojos, sacados de la skin como los sacás vos: la esclerótica (lo que rodea a la pupila dentro del ojo), la pupila (los píxeles de
 * su columna, de arriba hacia abajo: puede tener dos colores), la ceja (el píxel de arriba de la pupila, si es más oscuro que la piel) y la piel (la más común al lado de la nariz).
 * tocados: { piel, blanco, ceja } si los cambió el usuario.
 */
export function coloresEstandar(cara, cfg, tocados = null) {
  const base = coloresDeCara(cara, cfg), { clase } = clasesDeCara(cara);
  // piel: la más común en las columnas de la nariz (3 y 4), de la fila de los ojos hacia abajo, sin lo oscuro
  const cuenta = new Map();
  // primero entre los ojos (filas del ojo, columnas 3-4): es el tono de piel de verdad; si no hay, de ahí hacia abajo
  const contar = (f0, f1) => { for (let f = f0; f <= f1; f++) for (const c of [3, 4]) {
    const p = pix(cara, f, c); if (p[3] < 128 || lum(p) < 80) continue;
    const k = p.slice(0, 3).join(','); cuenta.set(k, (cuenta.get(k) || 0) + 1);
  } };
  contar(cfg.a.r0, cfg.a.r1); if (!cuenta.size) contar(Math.max(0, cfg.a.r0 - 1), 7);
  let piel = base.piel, mx = 0;
  for (const [k, v] of cuenta) if (v > mx) { mx = v; piel = k.split(',').map(Number); }
  const ojo = (o) => {
    const esc = [];
    for (let f = o.r0; f <= o.r1; f++) for (let c = o.c0; c <= o.c1; c++) if (!(f >= o.p.r0 && f <= o.p.r1 && c >= o.p.c0 && c <= o.p.c1)) esc.push(pix(cara, f, c));
    const media = (l) => [0, 1, 2].map((q) => Math.round(l.reduce((s, p) => s + p[q], 0) / l.length));
    const pupila = []; for (let f = o.r0; f <= o.r1; f++) pupila.push(pix(cara, f, o.p.c0).slice(0, 3));
    let ceja = base.ceja;
    if (o.r0 > 0) { const p = pix(cara, o.r0 - 1, o.p.c0); if (p[3] >= 128 && lum(p) < lum(piel) - 20) ceja = p.slice(0, 3); }
    const filasEsc = [];
    for (let f = o.r0; f <= o.r1; f++) {
      const l = []; for (let c = o.c0; c <= o.c1; c++) if (!(f >= o.p.r0 && f <= o.p.r1 && c >= o.p.c0 && c <= o.p.c1)) l.push(pix(cara, f, c));
      filasEsc.push(l.length ? media(l) : null);
    }
    const medio = esc.length ? media(esc) : piel.slice();
    return { esclerotica: medio, escleroticaFilas: filasEsc.map((x) => x || medio), pupila, ceja };
  };
  const A = ojo(cfg.a), B = ojo(cfg.b);
  const out = { a: A, b: B, piel, ceja: A.ceja };
  if (tocados) {
    if (tocados.piel) out.piel = tocados.piel;
    if (tocados.blanco) { A.esclerotica = tocados.blanco; B.esclerotica = tocados.blanco; A.escleroticaFilas = null; B.escleroticaFilas = null; }
    if (tocados.ceja) out.ceja = tocados.ceja;
  }
  return out;
}

/**
 * La textura de los ojos como la que usás: el diseño completo del modelo estándar (eyes o eyes_1px) con un color liso por pieza
 * (esclerótica, pupila de 1 o 2 colores, ceja, piel de los párpados y de las paredes). modeloEstandar: el .bbs.json del modelo.
 */
export function texturaPlana(modeloEstandar, col, objetos = null) {
  const T = modeloEstandar.model.texture[0], rgba = new Uint8Array(T * T * 4);
  const poner = (u, v, c) => { if (u >= 0 && v >= 0 && u < T && v < T) rgba.set([c[0], c[1], c[2], 255], (v * T + u) * 4); };
  for (const [id, g] of Object.entries(modeloEstandar.model.groups)) {
    const lado = /_(r|er|rt|rb)$/.test(id) ? col.a : col.b;
    for (const c of (g.cubes || [])) for (const [cara, r] of Object.entries(c.uvs)) {
      const u0 = Math.min(r[0], r[2]), u1 = Math.max(r[0], r[2]), v0 = Math.min(r[1], r[3]), v1 = Math.max(r[1], r[3]);
      for (let v = v0; v < v1; v++) for (let u = u0; u < u1; u++) {
        if (id === 'anchor' || id.startsWith('eyelid_')) poner(u, v, col.piel);
        else if (id.startsWith('eye_')) {
          // dos colores de esclerótica (la de arriba suele ir más oscura): cada fila de las caras de costado lleva la suya; arriba y abajo, la de la fila de arriba
          const fs = lado.escleroticaFilas, lateral = cara !== 'top' && cara !== 'bottom';
          poner(u, v, !fs || fs.length < 2 ? lado.esclerotica : lateral ? (v1 - v0 === fs.length ? fs[v - v0] : lado.esclerotica) : (c.size[1] === fs.length ? fs[0] : lado.esclerotica));
        }
        else if (id.startsWith('eyebrow_')) poner(u, v, col.ceja);
        else if (id.startsWith('pupil_') && (cara === 'front' || cara === 'top')) {      // solo el frente de la pupila (los costados quedan transparentes, como en tus texturas)
          const filas = lado.pupila, alto = v1 - v0;
          if (cara === 'top') poner(u, v, filas[0]); else poner(u, v, alto === filas.length ? filas[v - v0] : filas[Math.min(filas.length - 1, Math.floor(filas.length / 2))]);
        }
      }
    }
  }
  // modelos «31»: los párpados y las cejas son formas de un OBJ; se pintan sus triángulos de UV con el color de la pieza
  if (objetos) {
    const dentro = (p, a, b, c) => {
      const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
      const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
    for (const [id, o] of Object.entries(objetos)) {
      const color = id.startsWith('eyelid_') ? col.piel : id.startsWith('eyebrow_') ? col.ceja : null; if (!color) continue;
      for (const [a, b, c] of o.tris) {
        const x0 = Math.floor(Math.min(a[0], b[0], c[0])), x1 = Math.ceil(Math.max(a[0], b[0], c[0])), y0 = Math.floor(Math.min(a[1], b[1], c[1])), y1 = Math.ceil(Math.max(a[1], b[1], c[1]));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          let toca = false;
          for (const dx of [0.1, 0.5, 0.9]) for (const dy of [0.1, 0.5, 0.9]) if (!toca && dentro([x + dx, y + dy], a, b, c)) toca = true;
          if (toca) poner(x, y, color);
        }
      }
    }
  }
  const esCubos = !objetos;
  // como en tus texturas: las filas 8 y 9 (puntas de las cejas) van llenas con el color de la ceja y las 14 y 15 (paredes) con el de la piel
  if (esCubos) for (const [v, c] of [[8, col.ceja], [9, col.ceja], [14, col.piel], [15, col.piel]]) for (let u = 0; u < 12; u++) if (!rgba[(v * T + u) * 4 + 3]) poner(u, v, c);
  return { w: T, h: T, rgba };
}

// ------------------------------------------------------------------ modelos de ojos del usuario (eyes, eyes_1px, eyes_31, eyes_31_1px) y su ajuste
export const MODELOS_OJOS = ['eyes', 'eyes_1px', 'eyes_31', 'eyes_31_1px'];
export const ARCHIVO_MODELO = { eyes: 'eyes.bbs.json', eyes_1px: 'eyes_1px.bbs.json', eyes_31: 'eyes_31.bbs.json', eyes_31_1px: 'eyes_1px.bbs.json' };
/** Qué grupo de poses usa cada modelo (los «31» usan las de eyes / eyes_1px, como dice su config). */
export const POSES_DE = { eyes: 'eyes', eyes_1px: 'eyes_1px', eyes_31: 'eyes', eyes_31_1px: 'eyes_1px' };

/**
 * Lee las piezas de un OBJ (las formas de los párpados y cejas de los modelos «31»): por objeto, su caja en píxeles de modelo y sus triángulos de UV en texeles.
 * Las coordenadas del OBJ están en bloques (1/16 = un píxel); la V va invertida, como la lee el Visor.
 */
export function parsearOBJ(texto, tw = 16, th = 16) {
  const V = [], T = [], objetos = {};
  let o = null;
  for (const raw of texto.split(/\r?\n/)) {
    const t = raw.trim().split(/\s+/);
    if (t[0] === 'o' || t[0] === 'g') { o = objetos[t[1]] = objetos[t[1]] || { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], tris: [] }; }
    else if (t[0] === 'v') V.push([+t[1] * 16, +t[2] * 16, +t[3] * 16]);
    else if (t[0] === 'vt') T.push([+t[1] * tw, (1 - +t[2]) * th]);
    else if (t[0] === 'f' && o) {
      const idx = t.slice(1).map((s) => { const p = s.split('/'); return [parseInt(p[0], 10) - 1, parseInt(p[1], 10) - 1]; });
      for (const [vi] of idx) { const p = V[vi]; for (let k = 0; k < 3; k++) { o.min[k] = Math.min(o.min[k], p[k]); o.max[k] = Math.max(o.max[k], p[k]); } }
      for (let i = 1; i + 1 < idx.length; i++) o.tris.push([idx[0], idx[i], idx[i + 1]].map(([, ti]) => T[ti] || [0, 0]));
    }
  }
  return objetos;
}

/** La caja de cada hueso de un modelo de ojos: { hueso: { desde, tam, origen, uv? } } (de su cubo, o de su forma del OBJ). */
export function cajasDeModelo(json, objetos = null) {
  const out = {};
  for (const [id, g] of Object.entries(json.model.groups)) {
    const c = (g.cubes || []).find((q) => q.size[0] > 0 && q.size[1] > 0 && q.size[2] > 0);
    if (c) out[id] = { desde: c.from.slice(), tam: c.size.slice(), origen: g.origin.slice() };
    else if (objetos && objetos[id] && objetos[id].tris.length) {
      const m = objetos[id];
      let su = 0, sv = 0, k = 0; for (const tri of m.tris) for (const [u, v] of tri) { su += u; sv += v; k++; }
      out[id] = { desde: m.min.slice(), tam: m.max.map((v, i) => Math.max(0.1, v - m.min[i])), origen: g.origin.slice(), uv: [su / k, sv / k] };
    }
  }
  return out;
}

const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const rangoCaja = (o) => ({ x0: 3 - o.c1, x1: 4 - o.c0, y0: 7 - o.r1, y1: 8 - o.r0 });

/**
 * La pose que hace que un modelo de ojos (eyes, eyes_1px, eyes_31…) quede con el tamaño y el lugar de los ojos de la skin: para cada hueso,
 * escala y traslación (en píxeles, como las poses de BBS: x al revés) que llevan su caja a la caja que corresponde. Sin colores propios.
 * cajas: cajasDeModelo(); cfg: { a, b (ojos), saliente }.
 */
export function poseAjuste(cajas, cfg) {
  const pose = {};
  const poner = (hueso, X0, X1, Y0, Y1, conEscalaY = true) => {
    const c = cajas[hueso]; if (!c) return;
    const sx = (X1 - X0) / c.tam[0], sy = conEscalaY ? (Y1 - Y0) / c.tam[1] : 1;
    const cx = c.desde[0] + c.tam[0] / 2, cy = c.desde[1] + c.tam[1] / 2;
    const px = c.origen[0], py = c.origen[1];
    const t0 = px + sx * (cx - px) - (X0 + X1) / 2;                // x va al revés: nueva x = origen + escala·(x - origen) - t
    const t1 = (conEscalaY ? (Y0 + Y1) / 2 : Y0 + c.tam[1] / 2) - (py + sy * (cy - py));
    pose[hueso] = { r: [0, 0, 0], s: [r4(sx), r4(sy), 1], t: [r4(t0), r4(t1), 0] };
  };
  for (const [lado, s] of [['a', 'r'], ['b', 'l']]) {
    const o = cfg[lado], E = rangoCaja(o), P = rangoCaja(o.p);
    poner('eye_' + s, E.x0, E.x1, E.y0, E.y1);
    poner('pupil_' + s, P.x0, P.x1, P.y0, P.y1);
    const alto = (h) => (cajas[h] ? cajas[h].tam[1] : 0.9);
    poner('eyelid_' + s + 't', E.x0, E.x1, E.y1, E.y1 + alto('eyelid_' + s + 't'), false);
    // la de abajo: su borde de arriba toca la parte de abajo del ojo
    const cb = cajas['eyelid_' + s + 'b'];
    if (cb) poner('eyelid_' + s + 'b', E.x0, E.x1, E.y0 - cb.tam[1], E.y0, false);
    if (o.ceja) { const B = rangoCaja({ c0: o.ceja.c0, c1: o.ceja.c1, r0: o.ceja.r, r1: o.ceja.r }); poner('eyebrow_' + s, B.x0, B.x1, B.y0 - 0.025, B.y0 - 0.025 + alto('eyebrow_' + s), false); }
    else poner('eyebrow_' + s, E.x0, E.x1, E.y1 - 0.025, E.y1 - 0.025 + alto('eyebrow_' + s), false);
  }
  pose.anchor = { r: [0, 0, 0], s: [1, 1, 1], t: [0, 0, -(cfg.saliente || 0)] };
  return pose;
}

/** El texto que se copia y se pega en BBS (pose de la parte de los ojos): el mismo formato que usás, con color -1 (sin teñir: el color lo trae la textura). */
export function textoPose(pose) {
  const orden = ['eye_r', 'eyelid_lt', 'eyebrow_r', 'anchor', 'pupil_l', 'eye_l', 'eyelid_lb', 'eyelid_rb', 'pupil_r', 'eyelid_rt', 'eyebrow_l'];
  const fl = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
  const ar = (a) => '[' + a.map(fl).join(', ') + ']';
  const huesos = orden.filter((h) => pose[h]).map((h) => {
    const p = completarHueso(pose[h]);
    return `        "${h}": {\n            "r": ${ar(p.r)},\n            "s": ${ar(p.s)},\n            "visible": true,\n            "t": ${ar(p.t)},\n            "fix": 0.0,\n            "color": -1,\n            "overlay": 16777215,\n            "lighting": 0.0\n        }`;
  });
  return `{\n    "_CopyPose": true,\n    "pose": {\n${huesos.join(',\n')}\n    }\n}`;
}
/** Un hueso con todos los campos que lleva una pose de BBS. */
export function completarHueso(p) {
  return { r: p.r.slice(), s: p.s.slice(), visible: true, t: p.t.slice(), fix: 0.0, color: -1, overlay: 16777215, lighting: 0.0 };
}

/** Suma el ajuste de tamaño y lugar con la pose de una expresión (escalas multiplicadas, traslaciones y giros sumados). */
export function componerPose(ajuste, expr) {
  const out = {};
  for (const h of new Set([...Object.keys(ajuste || {}), ...Object.keys(expr || {})])) {
    const a = (ajuste && ajuste[h]) || { r: [0, 0, 0], s: [1, 1, 1], t: [0, 0, 0] }, e = (expr && expr[h]) || { r: [0, 0, 0], s: [1, 1, 1], t: [0, 0, 0] };
    out[h] = { r: a.r.map((v, i) => v + e.r[i]), s: a.s.map((v, i) => v * e.s[i]), t: a.t.map((v, i) => v + e.t[i]), r2: [0, 0, 0], fix: 0 };
  }
  return out;
}

/** Una copia del modelo con las formas del OBJ convertidas en cajas, para poder dibujarlas en la vista 2D (que solo dibuja cubos). */
export function modeloVistaPrevia(json, cajas) {
  const m = JSON.parse(JSON.stringify(json));
  for (const [id, g] of Object.entries(m.model.groups)) {
    const c = cajas[id];
    if (c && c.uv && !(g.cubes || []).length) {
      const u = Math.floor(c.uv[0]), v = Math.floor(c.uv[1]);
      g.cubes = [{ from: c.desde, size: c.tam, origin: [0, 0, 0], uvs: { front: [u, v, u + 1, v + 1] } }];
    }
  }
  return m;
}

/** ¿Los ojos están donde tapa tu máscara AEsclerotica1x2 (columnas 1-2 y 5-6), corridos dy filas? Devuelve { dy } o null. */
export function coincideMascara(cfg) {
  const A = cfg.a, B = cfg.b, h = A.r1 - A.r0 + 1;
  if (h < 1 || h > 2 || A.c0 !== 1 || A.c1 !== 2 || B.c0 !== 5 || B.c1 !== 6 || A.r0 !== B.r0 || A.r1 !== B.r1) return null;
  return { dy: A.r1 - 4 };
}
