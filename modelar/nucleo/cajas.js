// De cubitos a cajas: los vóxeles vecinos de la misma parte se juntan en cajas lo más grandes posible (menos cubos en Blockbench),
// y cada cara que se ve recibe un pedazo de textura pixelada (1 píxel de textura = 1 vóxel). Las caras tapadas no llevan textura.

/** Junta los vóxeles en cajas: [{ parte, x0, y0, z0, x1, y1, z1 }] (x1/y1/z1 exclusivos). */
export function juntarCajas(g) {
  const { nx, ny, nz, parte } = g, usado = new Uint8Array(parte.length), cajas = [];
  const id = (x, y, z) => (y * nz + z) * nx + x;
  const libre = (x, y, z, p) => parte[id(x, y, z)] === p && !usado[id(x, y, z)];
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const p = parte[id(x, y, z)];
    if (p < 0 || usado[id(x, y, z)]) continue;
    let x1 = x + 1; while (x1 < nx && libre(x1, y, z, p)) x1++;
    let z1 = z + 1;
    fila: while (z1 < nz) { for (let a = x; a < x1; a++) if (!libre(a, y, z1, p)) break fila; z1++; }
    let y1 = y + 1;
    capa: while (y1 < ny) { for (let c = z; c < z1; c++) for (let a = x; a < x1; a++) if (!libre(a, y1, c, p)) break capa; y1++; }
    for (let b = y; b < y1; b++) for (let c = z; c < z1; c++) for (let a = x; a < x1; a++) usado[id(a, b, c)] = 1;
    cajas.push({ parte: p, x0: x, y0: y, z0: z, x1, y1, z1 });
  }
  return cajas;
}

// Las 6 caras con la orientación de la textura de Minecraft/Blockbench: para el texel (i, j) de la cara (i hacia la derecha, j hacia
// abajo en la imagen), qué vóxel es y cuál es el vecino de afuera. ancho/alto = tamaño de la cara en vóxeles.
export const CARAS = {
  north: { lado: 5, n: [0, 0, -1], tam: (c) => [c.x1 - c.x0, c.y1 - c.y0], vox: (c, i, j) => [c.x1 - 1 - i, c.y1 - 1 - j, c.z0] },
  south: { lado: 4, n: [0, 0, 1], tam: (c) => [c.x1 - c.x0, c.y1 - c.y0], vox: (c, i, j) => [c.x0 + i, c.y1 - 1 - j, c.z1 - 1] },
  east: { lado: 0, n: [1, 0, 0], tam: (c) => [c.z1 - c.z0, c.y1 - c.y0], vox: (c, i, j) => [c.x1 - 1, c.y1 - 1 - j, c.z1 - 1 - i] },
  west: { lado: 1, n: [-1, 0, 0], tam: (c) => [c.z1 - c.z0, c.y1 - c.y0], vox: (c, i, j) => [c.x0, c.y1 - 1 - j, c.z0 + i] },
  up: { lado: 2, n: [0, 1, 0], tam: (c) => [c.x1 - c.x0, c.z1 - c.z0], vox: (c, i, j) => [c.x0 + i, c.y1 - 1, c.z0 + j] },
  down: { lado: 3, n: [0, -1, 0], tam: (c) => [c.x1 - c.x0, c.z1 - c.z0], vox: (c, i, j) => [c.x0 + i, c.y0, c.z1 - 1 - j] },
};

/**
 * Arma la textura: { ancho, alto, rgba (Uint8ClampedArray), caras: por caja { north: [u0,v0,u1,v1] | null, ... } }.
 * Una cara lleva textura si al menos un vóxel suyo da al vacío.
 */
export function armarTextura(g, cajas) {
  const { nx, ny, nz, parte, rgb } = g;
  const id = (x, y, z) => (y * nz + z) * nx + x;
  const vacio = (x, y, z) => x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz || parte[id(x, y, z)] < 0;
  const pedidos = [];
  const caras = cajas.map((c, k) => {
    const out = {};
    for (const [nombre, f] of Object.entries(CARAS)) {
      const [w, h] = f.tam(c);
      let ve = false;
      for (let j = 0; j < h && !ve; j++) for (let i = 0; i < w && !ve; i++) { const [x, y, z] = f.vox(c, i, j); if (vacio(x + f.n[0], y + f.n[1], z + f.n[2])) ve = true; }
      out[nombre] = null;
      if (ve) pedidos.push({ k, nombre, w, h });
    }
    return out;
  });
  const { ancho, alto: H } = empacar(pedidos);
  const rgba = new Uint8ClampedArray(ancho * H * 4);
  for (const p of pedidos) {
    const c = cajas[p.k], f = CARAS[p.nombre];
    for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
      const [x, y, z] = f.vox(c, i, j), v = id(x, y, z), o = ((p.v + j) * ancho + p.u + i) * 4;
      const col = g.colorLado ? g.colorLado(v, f.lado) : [rgb[v * 3], rgb[v * 3 + 1], rgb[v * 3 + 2]];
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255;
    }
    caras[p.k][p.nombre] = [p.u, p.v, p.u + p.w, p.v + p.h];
  }
  return { ancho, alto: H, rgba, caras };
}

/** Acomoda rectángulos { w, h } en estantes (de los más altos a los más bajos) en una textura de lado potencia de 2; les pone u, v. */
export function empacar(pedidos) {
  const area = pedidos.reduce((s, p) => s + p.w * p.h, 0);
  pedidos.sort((a, b) => b.h - a.h || b.w - a.w);
  let ancho = 16; while (ancho * ancho < area * 1.25) ancho *= 2;
  const acomodar = (W) => { let x = 0, y = 0, fila = 0; for (const p of pedidos) { if (p.w > W) return null; if (x + p.w > W) { y += fila; x = 0; fila = 0; } p.u = x; p.v = y; x += p.w; fila = Math.max(fila, p.h); } return y + fila; };
  let alto = acomodar(ancho);
  while (alto === null || alto > ancho * 2) { ancho *= 2; alto = acomodar(ancho); }
  let H = 16; while (H < alto) H *= 2;
  return { ancho, alto: H };
}
