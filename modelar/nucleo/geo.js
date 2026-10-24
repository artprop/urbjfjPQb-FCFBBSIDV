// Modelos de Bedrock / GeckoLib (.geo.json, el formato que usan los mods con GeckoLib y que Blockbench abre y exporta) pasados al
// formato de BBS (model.bbs.json). Como hace Blockbench al importarlos, la X va al revés: from.x = -(origin.x + size.x), los
// pivotes con -x y los giros con -x y -y.

const v3 = (a, d = [0, 0, 0]) => (Array.isArray(a) && a.length >= 3 ? [+a[0] || 0, +a[1] || 0, +a[2] || 0] : d.slice());
const CARA = { north: 'front', south: 'back', east: 'right', west: 'left', up: 'top', down: 'bottom' };

/** Las geometrías de un .geo.json (formato 1.12+ «minecraft:geometry» o el viejo «geometry.nombre»). */
export function geometrias(json) {
  if (Array.isArray(json['minecraft:geometry'])) return json['minecraft:geometry'];
  return Object.entries(json).filter(([k, v]) => k.startsWith('geometry.') && v && v.bones).map(([k, v]) => ({ ...v, description: { identifier: k, texture_width: v.texturewidth, texture_height: v.textureheight } }));
}

/** Una geometría -> { version, model: { groups, texture } } como model.bbs.json. */
export function geoABBS(geo) {
  const d = geo.description || {}, tw = d.texture_width || 64, th = d.texture_height || 64;
  const groups = {};
  for (const b of geo.bones || []) {
    const piv = v3(b.pivot), rot = v3(b.rotation);
    const g = { origin: [-piv[0], piv[1], piv[2]], rotate: [-rot[0], -rot[1], rot[2]], cubes: [] };
    if (b.parent) g.parent = b.parent;
    for (const c of b.cubes || []) {
      const o = v3(c.origin), s = v3(c.size), cp = c.pivot ? v3(c.pivot) : piv, cr = v3(c.rotation);
      const cubo = { from: [-(o[0] + s[0]), o[1], o[2]], size: s, origin: [-cp[0], cp[1], cp[2]] };
      if (cr[0] || cr[1] || cr[2]) cubo.rotate = [-cr[0], -cr[1], cr[2]];
      if (c.inflate) cubo.offset = +c.inflate;
      if (Array.isArray(c.uv)) { cubo.box_uv = true; cubo.box_uv_offset = [+c.uv[0] || 0, +c.uv[1] || 0]; if (c.mirror ?? b.mirror) cubo.box_uv_mirror = true; }
      else if (c.uv && typeof c.uv === 'object') {
        cubo.uvs = {};
        for (const [lado, f] of Object.entries(c.uv)) {
          if (!f || !CARA[lado] || !f.uv) continue;
          const [u, v] = f.uv, [w, h] = f.uv_size || [0, 0];
          cubo.uvs[CARA[lado]] = [u, v, u + w, v + h];
        }
      }
      g.cubes.push(cubo);
    }
    groups[b.name] = g;
  }
  return { version: '0.7.2', animations: {}, model: { groups, texture: [tw, th] } };
}

/** UV en caja (como setupBoxUV de BBS, ver visor/bbs.js): de un cubo con box_uv a las 6 caras con nombres de BBS. */
export function uvCaja(size, off, mir) {
  const [w, h, d] = size.map(Math.floor), [bx, by] = off, r = (a, b, c, e) => [a, b, c, e], u = {};
  const a = bx + d, b = by + d;
  u.front = mir ? r(a + w, b, a, b + h) : r(a, b, a + w, b + h);
  u.right = mir ? r(bx + d + w + d, by + d, bx + d + w, by + d + h) : r(bx, by + d, bx + d, by + d + h);
  u.back = mir ? r(bx + 2 * d + w + w, by + d, bx + 2 * d + w, by + d + h) : r(bx + 2 * d + w, by + d, bx + 2 * d + w + w, by + d + h);
  u.left = mir ? r(bx + d, by + d, bx, by + d + h) : r(bx + d + w, by + d, bx + d + w + d, by + d + h);
  let t0 = bx + d, t1 = t0 + w; if (mir) [t0, t1] = [t1, t0];
  u.top = r(t1, by + d, t0, by);
  let q0 = bx + d + w, q1 = q0 + w; if (mir) [q0, q1] = [q1, q0];
  u.bottom = r(q1, by, q0, by + d);
  return u;
}

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
const LADO = { front: 'north', back: 'south', right: 'east', left: 'west', top: 'up', bottom: 'down' };

/**
 * Un modelo de BBS (model.bbs.json, o un .geo.json pasado con geoABBS) como proyecto de Blockbench (.bbmodel, formato «Generic
 * Model»): los grupos anidados con su pivote y giro, los cubos (con giro, inflado y UV en caja o por cara) y todas las texturas
 * adentro (la primera es la que usan las caras; las otras quedan para cambiarla).
 * texturas: [{ nombre, dataURL, w, h }].
 */
export function bbsABBModel(bbs, texturas = [], nombre = 'modelo') {
  const m = bbs.model || bbs, [tw, th] = m.texture || [64, 64];
  const elements = [], nodos = {};
  const todoCaja = Object.values(m.groups || {}).every((g) => (g.cubes || []).every((c) => c.box_uv && !(c.uvs && Object.keys(c.uvs).length)));
  for (const [id, g] of Object.entries(m.groups || {})) {
    const n = { name: id, origin: g.origin || [0, 0, 0], color: 0, uuid: uuid(), export: true, mirror_uv: false, isOpen: false, locked: false, visibility: true, autouv: 0, children: [] };
    if ((g.rotate || []).some((x) => x)) n.rotation = g.rotate;
    for (const c of g.cubes || []) {
      const size = c.size || [0, 0, 0], from = c.from || [0, 0, 0], caja = c.box_uv && !(c.uvs && Object.keys(c.uvs).length);
      const uvs = caja ? uvCaja(size, c.box_uv_offset || [0, 0], !!c.box_uv_mirror) : c.uvs || {};
      const faces = {};
      for (const [bbsN, bbN] of Object.entries(LADO)) faces[bbN] = uvs[bbsN] ? { uv: uvs[bbsN], texture: 0 } : { uv: [0, 0, 0, 0], texture: null };
      const e = { name: 'cube', box_uv: caja, rescale: false, locked: false, light_emission: 0, render_order: 'default', allow_mirror_modeling: true,
        from, to: from.map((f, i) => f + size[i]), autouv: 0, color: 0, origin: c.origin || g.origin || [0, 0, 0], faces, type: 'cube', uuid: uuid() };
      if (caja) { e.uv_offset = c.box_uv_offset || [0, 0]; if (c.box_uv_mirror) e.mirror_uv = true; }
      if ((c.rotate || []).some((x) => x)) e.rotation = c.rotate;
      if (c.offset) e.inflate = c.offset;
      elements.push(e); n.children.push(e.uuid);
    }
    nodos[id] = n;
  }
  const outliner = [];
  for (const [id, g] of Object.entries(m.groups || {})) (g.parent && nodos[g.parent] ? nodos[g.parent].children : outliner).push(nodos[id]);
  return {
    meta: { format_version: '4.10', model_format: 'free', box_uv: todoCaja },
    name: nombre, model_identifier: '', visible_box: [1, 1, 0], variable_placeholders: '', variable_placeholder_buttons: [], timeline_setups: [], unhandled_root_fields: {},
    resolution: { width: tw, height: th }, elements, outliner,
    textures: texturas.map((t, i) => ({ path: '', name: t.nombre, folder: '', namespace: '', id: String(i), width: t.w || tw, height: t.h || th, uv_width: tw, uv_height: th,
      particle: false, use_as_default: i === 0, layers_enabled: false, sync_to_project: '', render_mode: 'default', render_sides: 'auto', frame_time: 1,
      frame_order_type: 'loop', frame_order: '', frame_interpolate: false, visible: true, internal: true, saved: false, uuid: uuid(), relative_path: t.nombre, source: t.dataURL })),
  };
}
