// Guía de la cámara (modo Dedos): la silueta de una mano humana abierta, con la palma hacia la cámara y los dedos arriba, que
// muestra dónde poner la mano. Es una guía flexible (no hace falta calzar justo). Si se ve la mano, la silueta verde se mueve
// con los dedos: cada dedo se acorta y el pulgar cruza la palma según cuánto lo cerrás. Se dibuja como lo ve la cámara (sin
// espejar: la mano derecha a la izquierda de la imagen); el lienzo se espeja por CSS como el video.
const LARGOS = [0.8, 0.92, 0.84, 0.66];   // índice, medio, anular, meñique (en anchos de palma)

function capsula(g, x0, y0, x1, y1, ancho) {
  g.lineCap = 'round'; g.lineWidth = ancho;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}

// dibuja una mano: (cx, cy) = centro de la palma, W = ancho de la palma, dir = hacia dónde está el pulgar (+1 derecha de la imagen)
function mano(g, cx, cy, W, dir, curls) {
  const c = curls || [0, 0, 0, 0, 0];
  const ancho = W * 0.21;
  // palma
  g.beginPath();
  const x = cx - W / 2, y = cy - W * 0.45, w = W, h = W * 0.9, r = W * 0.22;
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  g.fill(); g.stroke();
  // dedos: del lado del pulgar al otro
  for (let k = 0; k < 4; k++) {
    const fx = cx + dir * W * (0.3 - 0.2 * k), largo = LARGOS[k] * W * (1 - 0.68 * c[k + 1]);
    capsula(g, fx, cy - W * 0.35, fx, cy - W * 0.35 - largo, ancho);
  }
  // pulgar: sale de abajo del lado de adentro y al cerrarse cruza la palma
  const ang = (58 - 115 * c[0]) * Math.PI / 180, lp = W * 0.62 * (1 - 0.2 * c[0]);
  const bx = cx + dir * W * 0.46, by = cy + W * 0.25;
  capsula(g, bx, by, bx + dir * Math.sin(ang) * lp, by - Math.cos(ang) * lp, ancho * 1.1);
}

/** Dibuja la guía en el lienzo. lados: ['R','L'] | ['L'] | ['R']; curls: { L: [5]|null, R: [5]|null }. */
export function dibujarGuiaHumana(canvas, lados, curls = {}) {
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  const dos = lados.length === 2, W = Math.min(0.4 * h, (dos ? 0.25 : 0.34) * w);
  for (const lado of lados) {
    const dir = lado === 'R' ? 1 : -1;   // la derecha de la persona está a la izquierda de la imagen y el pulgar apunta hacia adentro
    const cx = dos ? (lado === 'R' ? 0.27 : 0.73) * w : 0.5 * w, cy = h * 0.62;
    const vivo = curls[lado];
    // la referencia: contorno punteado de la mano abierta
    g.save();
    g.setLineDash([W * 0.08, W * 0.08]); g.lineJoin = 'round';
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(2, W * 0.03);
    // los dedos y el pulgar son líneas gruesas: se dibujan como relleno tenue, y la palma con el contorno
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.22)'; g.setLineDash([]); mano(g, cx, cy, W, dir, null); g.restore();
    g.restore();
    if (vivo) {   // lo que lee la cámara ahora
      g.save(); g.fillStyle = 'rgba(111,178,74,0.55)'; g.strokeStyle = 'rgba(111,178,74,0.95)'; g.lineJoin = 'round'; g.lineWidth = Math.max(2, W * 0.03);
      mano(g, cx, cy, W, dir, vivo); g.restore();
    }
  }
}
