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
