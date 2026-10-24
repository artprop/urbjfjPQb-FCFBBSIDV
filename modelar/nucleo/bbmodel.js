// Arma el archivo .bbmodel de Blockbench (formato «Generic Model» / free, con UV por cara): un grupo por parte, una caja por cubo y
// la textura adentro del archivo (como PNG en base64).

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
const red = (v) => Math.round(v * 10000) / 10000;

/**
 * g: la grilla (voxelizar); cajas; tex: armarTextura; nombres: nombre de cada parte; pngDataURL: la textura como data:image/png;
 * altoPx: alto del modelo en píxeles de Blockbench (16 = 1 bloque). El modelo queda parado en y = 0, centrado en x y z, mirando a -z (north).
 */
// de la grilla a píxeles de Blockbench/BBS: parado en y = 0 y centrado en x y z
function enPixeles(g, cajas, altoPx) {
  const px = altoPx / (g.ny - 2);   // tamaño de un vóxel en píxeles (la grilla tiene una celda vacía de cada lado)
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity;
  for (const c of cajas) { x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); z0 = Math.min(z0, c.z0); z1 = Math.max(z1, c.z1); y0 = Math.min(y0, c.y0); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  return (x, y, z) => [red((x - cx) * px), red((y - y0) * px), red((z - cz) * px)];
}

export function armarBBModel({ g, cajas, tex, nombres, pngDataURL, altoPx = 32, nombre = 'modelo', rutaTextura = '' }) {
  const P = enPixeles(g, cajas, altoPx);
  const grupos = nombres.map((n) => ({ name: n, origin: [0, 0, 0], color: 0, uuid: uuid(), export: true, mirror_uv: false, isOpen: false, locked: false, visibility: true, autouv: 0, children: [] }));
  const elements = cajas.map((c, k) => {
    const faces = {};
    for (const [lado, uv] of Object.entries(tex.caras[k])) faces[lado] = uv ? { uv, texture: 0 } : { uv: [0, 0, 0, 0], texture: null };
    const e = { name: 'cubo', box_uv: false, rescale: false, locked: false, light_emission: 0, render_order: 'default', allow_mirror_modeling: true,
      from: P(c.x0, c.y0, c.z0), to: P(c.x1, c.y1, c.z1), autouv: 0, color: c.parte % 8, origin: [0, 0, 0], faces, type: 'cube', uuid: uuid() };
    grupos[c.parte].children.push(e.uuid);
    return e;
  });
  return {
    meta: { format_version: '4.10', model_format: 'free', box_uv: false },
    name: nombre, model_identifier: '', visible_box: [1, 1, 0], variable_placeholders: '', variable_placeholder_buttons: [], timeline_setups: [], unhandled_root_fields: {},
    resolution: { width: tex.ancho, height: tex.alto },
    elements,
    outliner: grupos.filter((gr) => gr.children.length),
    textures: [{ path: '', name: rutaTextura || nombre + '.png', folder: '', namespace: '', id: '0', width: tex.ancho, height: tex.alto, uv_width: tex.ancho, uv_height: tex.alto,
      particle: false, use_as_default: false, layers_enabled: false, sync_to_project: '', render_mode: 'default', render_sides: 'auto', frame_time: 1,
      frame_order_type: 'loop', frame_order: '', frame_interpolate: false, visible: true, internal: true, saved: false, uuid: uuid(), relative_path: rutaTextura, source: pngDataURL }],
  };
}

/**
 * El mismo modelo en el formato propio de BBS (model.bbs.json, el que exporta el plugin de BBS para Blockbench): grupos con cubos
 * (from, size, origin) y las UV por cara con los nombres de BBS (north = front, south = back, east = right, west = left, up = top,
 * down = bottom). Las caras tapadas no se ponen (BBS no las dibuja).
 */
export function armarBBS({ g, cajas, tex, nombres, altoPx = 32 }) {
  const P = enPixeles(g, cajas, altoPx), NOMBRE = { north: 'front', south: 'back', east: 'right', west: 'left', up: 'top', down: 'bottom' };
  const groups = {}, usados = new Set();
  const clave = (n) => { let k = n || 'parte', i = 2; while (usados.has(k)) k = `${n}_${i++}`; usados.add(k); return k; };
  const claves = nombres.map((n) => clave(n));
  cajas.forEach((c, k) => {
    const nombre = claves[c.parte];
    const gr = (groups[nombre] ??= { origin: [0, 0, 0], cubes: [] });
    const a = P(c.x0, c.y0, c.z0), b = P(c.x1, c.y1, c.z1), uvs = {};
    for (const [lado, uv] of Object.entries(tex.caras[k])) if (uv) uvs[NOMBRE[lado]] = uv;
    gr.cubes.push({ origin: [0, 0, 0], from: a, size: [0, 1, 2].map((i) => red(b[i] - a[i])), uvs });
  });
  return { version: '0.7.2', animations: {}, model: { groups, texture: [tex.ancho, tex.alto] } };
}
