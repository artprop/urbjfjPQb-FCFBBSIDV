// Arma los archivos de salida a partir de una lista de cubos { parte, from, to, origin, rotation (grados), uvs: { north: [u0,v0,u1,v1] | null, … } }
// en píxeles de Blockbench/BBS (16 = 1 bloque): el .bbmodel de Blockbench (formato «Generic Model» / free, UV por cara, la textura
// adentro como PNG en base64, un grupo por parte) y el model.bbs.json de BBS. El modelo queda parado en y = 0, centrado en x y z,
// mirando a -Z (north).

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
export const red = (v) => Math.round(v * 10000) / 10000;

/** Los cubos de la versión en cajitas (vóxeles): g = la grilla, cajas = juntarCajas, tex = armarTextura. */
export function cubosDeVoxeles(g, cajas, tex, altoPx) {
  const px = altoPx / (g.ny - 2);   // tamaño de un vóxel en píxeles (la grilla tiene una celda vacía de cada lado)
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity;
  for (const c of cajas) { x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); z0 = Math.min(z0, c.z0); z1 = Math.max(z1, c.z1); y0 = Math.min(y0, c.y0); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const P = (x, y, z) => [red((x - cx) * px), red((y - y0) * px), red((z - cz) * px)];
  return cajas.map((c, k) => ({ parte: c.parte, from: P(c.x0, c.y0, c.z0), to: P(c.x1, c.y1, c.z1), origin: [0, 0, 0], rotation: [0, 0, 0], uvs: tex.caras[k] }));
}

/** cubos; ancho/alto de la textura; nombres: de cada parte; pngDataURL: la textura. */
export function armarBBModel({ cubos, ancho, alto, nombres, pngDataURL, nombre = 'modelo', rutaTextura = '' }) {
  const grupos = nombres.map((n) => ({ name: n, origin: [0, 0, 0], color: 0, uuid: uuid(), export: true, mirror_uv: false, isOpen: false, locked: false, visibility: true, autouv: 0, children: [] }));
  const elements = cubos.map((c) => {
    const faces = {};
    for (const [lado, uv] of Object.entries(c.uvs)) faces[lado] = uv ? { uv, texture: 0 } : { uv: [0, 0, 0, 0], texture: null };
    const e = { name: 'cubo', box_uv: false, rescale: false, locked: false, light_emission: 0, render_order: 'default', allow_mirror_modeling: true,
      from: c.from, to: c.to, autouv: 0, color: c.parte % 8, origin: c.origin, faces, type: 'cube', uuid: uuid() };
    if (c.rotation.some((r) => r)) e.rotation = c.rotation;
    grupos[c.parte].children.push(e.uuid);
    return e;
  });
  return {
    meta: { format_version: '4.10', model_format: 'free', box_uv: false },
    name: nombre, model_identifier: '', visible_box: [1, 1, 0], variable_placeholders: '', variable_placeholder_buttons: [], timeline_setups: [], unhandled_root_fields: {},
    resolution: { width: ancho, height: alto },
    elements,
    outliner: grupos.filter((gr) => gr.children.length),
    textures: [{ path: '', name: rutaTextura || nombre + '.png', folder: '', namespace: '', id: '0', width: ancho, height: alto, uv_width: ancho, uv_height: alto,
      particle: false, use_as_default: false, layers_enabled: false, sync_to_project: '', render_mode: 'default', render_sides: 'auto', frame_time: 1,
      frame_order_type: 'loop', frame_order: '', frame_interpolate: false, visible: true, internal: true, saved: false, uuid: uuid(), relative_path: rutaTextura, source: pngDataURL }],
  };
}

/**
 * El mismo modelo en el formato propio de BBS (model.bbs.json, el que exporta el plugin de BBS para Blockbench): grupos con cubos
 * (from, size, origin = pivote, rotate) y las UV por cara con los nombres de BBS (north = front, south = back, east = right,
 * west = left, up = top, down = bottom). Las caras tapadas no se ponen (BBS no las dibuja).
 */
export function armarBBS({ cubos, ancho, alto, nombres }) {
  const NOMBRE = { north: 'front', south: 'back', east: 'right', west: 'left', up: 'top', down: 'bottom' };
  const groups = {}, usados = new Set();
  const clave = (n) => { let k = n || 'parte', i = 2; while (usados.has(k)) k = `${n}_${i++}`; usados.add(k); return k; };
  const claves = nombres.map((n) => clave(n));
  for (const c of cubos) {
    const gr = (groups[claves[c.parte]] ??= { origin: [0, 0, 0], cubes: [] }), uvs = {};
    for (const [lado, uv] of Object.entries(c.uvs)) if (uv) uvs[NOMBRE[lado]] = uv;
    const cubo = { origin: c.origin, from: c.from, size: [0, 1, 2].map((i) => red(c.to[i] - c.from[i])), uvs };
    if (c.rotation.some((r) => r)) cubo.rotate = c.rotation;
    gr.cubes.push(cubo);
  }
  return { version: '0.7.2', animations: {}, model: { groups, texture: [ancho, alto] } };
}
