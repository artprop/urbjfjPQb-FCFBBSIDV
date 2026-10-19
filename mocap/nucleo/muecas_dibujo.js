// Dibujo de referencia de una mueca (SVG, hecho con los mismos parametros que la boca de pixeles): la boca suave, sin pixelar,
// con los dientes y las arrugas que salen con ese gesto. Es solo para mirar; no se usa en la cara.
import { perfil, MUECAS } from './muecas.js';
import { intensidades } from './arrugas.js';

const PX = 8, X0 = 24, Y0 = 36;   // cada pedacito de la grilla x4 mide 8 px; la boca arranca en (24, 36) dentro de un cuadro de 240 x 140
const f = (n) => Math.round(n * 10) / 10;

function bordes(p) {
  const pts = [];
  for (let c = 0; c <= 24 * 4; c++) {   // columnas en pasos de un cuarto
    const q = perfil(p, c / 4 - 0.5 + 0.0001);
    if (q) pts.push({ x: X0 + (c / 4) * PX, yu: q.yu, yl: q.yl, A: q.A });
  }
  return pts;
}
const camino = (pts, y) => pts.map((q, i) => `${i ? 'L' : 'M'}${f(q.x)} ${f(Y0 + y(q) * PX)}`).join(' ');

/** SVG de una mueca. tinta = bs de la mueca; sirve tambien para las muecas agregadas por el usuario (con p de otra mueca de base). */
export function dibujoSVG(mueca) {
  const p = mueca.p || (MUECAS.find((m) => m.id === mueca.base) || MUECAS[0]).p;
  const pts = bordes(p);
  const w = intensidades(rasgosDe(mueca.bs || {}));
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140" role="img">';
  s += '<rect width="240" height="140" fill="#f0c7a6"/>';
  s += '<ellipse cx="120" cy="150" rx="110" ry="46" fill="#e8b895"/>';   // barbilla
  s += '<ellipse cx="102" cy="14" rx="7" ry="4.5" fill="#8a5a45"/><ellipse cx="138" cy="14" rx="7" ry="4.5" fill="#8a5a45"/>';   // nariz
  // arrugas (detras de la boca)
  const linea = (d, n) => `<path d="${d}" fill="none" stroke="#b97f5a" stroke-width="${n > 1 ? 3 : 2}" stroke-linecap="round" opacity="${n > 1 ? 0.95 : 0.7}"/>`;
  const niv = (v) => (v > 0.7 ? 2 : v > 0.3 ? 1 : 0);
  const xi = pts.length ? pts[0].x : 56, xd = pts.length ? pts[pts.length - 1].x : 184;
  const yc = Y0 + 2 * PX;
  if (niv(w.lado_i)) s += linea(`M${f(xi - 12)} ${f(yc - 10)} Q${f(xi - 20)} ${f(yc + 2)} ${f(xi - 12)} ${f(yc + 16)}`, niv(w.lado_i));
  if (niv(w.lado_d)) s += linea(`M${f(xd + 12)} ${f(yc - 10)} Q${f(xd + 20)} ${f(yc + 2)} ${f(xd + 12)} ${f(yc + 16)}`, niv(w.lado_d));
  if (niv(w.surco_i)) s += linea(`M${f(xi - 6)} ${f(yc - 18)} Q${f(xi - 22)} ${f(yc - 6)} ${f(xi - 16)} ${f(yc + 6)}`, niv(w.surco_i));
  if (niv(w.surco_d)) s += linea(`M${f(xd + 6)} ${f(yc - 18)} Q${f(xd + 22)} ${f(yc - 6)} ${f(xd + 16)} ${f(yc + 6)}`, niv(w.surco_d));
  if (niv(w.menton)) s += linea(`M96 ${f(Y0 + 11 * PX - 6)} Q120 ${f(Y0 + 11 * PX - 14)} 144 ${f(Y0 + 11 * PX - 6)}`, niv(w.menton));
  if (niv(w.encima)) s += linea(`M108 ${f(Y0 - 12)} L108 ${f(Y0 - 2)} M120 ${f(Y0 - 14)} L120 ${f(Y0 - 3)} M132 ${f(Y0 - 12)} L132 ${f(Y0 - 2)}`, niv(w.encima));
  if ((mueca.bs || {}).puff > 0.5) s += '<circle cx="50" cy="72" r="26" fill="#f4d2b4" opacity="0.55"/><circle cx="190" cy="72" r="26" fill="#f4d2b4" opacity="0.55"/>';
  if (pts.length) {
    const abierta = pts.some((q) => q.A >= 0.5);
    if (abierta) {
      const sup = camino(pts, (q) => q.yu), inf = [...pts].reverse().map((q, i) => `${i ? 'L' : 'M'}${f(q.x)} ${f(Y0 + q.yl * PX)}`).join(' ');
      const hueco = `${sup} ${inf.replace('M', 'L')} Z`;
      s += `<defs><clipPath id="h"><path d="${hueco}"/></clipPath></defs>`;
      // labios: se pintan primero mas grandes y el hueco encima
      const supF = pts.map((q, i) => `${i ? 'L' : 'M'}${f(q.x)} ${f(Y0 + (q.yu - p.tl) * PX)}`).join(' ');
      const infF = [...pts].reverse().map((q) => `L${f(q.x)} ${f(Y0 + (q.yl + p.tl) * PX)}`).join(' ');
      s += `<path d="${supF} ${infF} Z" fill="#c8606a" stroke="#9c3f4a" stroke-width="1.5" stroke-linejoin="round"/>`;
      s += `<path d="${hueco}" fill="#3a0d12"/>`;
      s += '<g clip-path="url(#h)">';
      if (p.dt) s += `<path d="${pts.map((q, i) => `${i ? 'L' : 'M'}${f(q.x)} ${f(Y0 + q.yu * PX)}`).join(' ')} ${[...pts].reverse().map((q) => `L${f(q.x)} ${f(Y0 + (q.yu + Math.min(p.dt, q.A)) * PX)}`).join(' ')} Z" fill="#f4efe4"/>`;
      if (p.dl) s += `<path d="${pts.map((q, i) => `${i ? 'L' : 'M'}${f(q.x)} ${f(Y0 + (q.yl - Math.min(p.dl, q.A)) * PX)}`).join(' ')} ${[...pts].reverse().map((q) => `L${f(q.x)} ${f(Y0 + q.yl * PX)}`).join(' ')} Z" fill="#f4efe4"/>`;
      s += '</g>';
    } else {
      const sup = pts.map((q, i) => `${i ? 'L' : 'M'}${f(q.x)} ${f(Y0 + (q.yu - p.tl) * PX)}`).join(' ');
      const inf = [...pts].reverse().map((q) => `L${f(q.x)} ${f(Y0 + (q.yu + p.tl) * PX)}`).join(' ');
      s += `<path d="${sup} ${inf} Z" fill="#c8606a" stroke="#9c3f4a" stroke-width="1.5" stroke-linejoin="round"/>`;
      s += `<path d="${camino(pts, (q) => q.yu)}" fill="none" stroke="#7a2a35" stroke-width="2" stroke-linecap="round"/>`;
    }
  }
  return s + '</svg>';
}

// rasgos de una mueca a partir de su bs (todo en cero lo no nombrado)
function rasgosDe(bs) {
  const z = Object.fromEntries(['jaw', 'funnel', 'pucker', 'smileL', 'smileR', 'frown', 'press', 'stretch', 'shift', 'upper', 'lower', 'rollL', 'rollU', 'shrugL', 'shrugU', 'close', 'dimple', 'puff'].map((k) => [k, 0]));
  return { ...z, ...bs };
}
