// Núcleo del visor: lee modelos y forms de BBS y los arma en three.js igual que el mod.
// Reglas copiadas del código de BBS 2.2 (ModelManager, CubicModelLoader, ModelCube, ICubicRenderer,
// FormRenderer, ModelFormRenderer, TextureProcessor, BillboardFormRenderer).
// Unidades: 1 = un bloque. Los modelos cúbicos vienen en píxeles (/16).
import * as THREE from './lib/three.module.min.js';

const D2R = Math.PI / 180;
const RELOADABLE = ['.bbs.json', '.geo.json', '.bobj', '.obj', '.vox'];

// ---------- utilidades ----------
export function argb(c) {
  if (c === undefined || c === null) return [1, 1, 1, 1];
  c = c >>> 0;
  return [((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255, (c & 255) / 255, ((c >>> 24) & 255) / 255];
}
const v3 = (a, def = [0, 0, 0]) => (Array.isArray(a) && a.length >= 3 ? [+a[0] || 0, +a[1] || 0, +a[2] || 0] : def.slice());
const rotZYX = (rx, ry, rz) => new THREE.Matrix4().makeRotationZ(rz).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeRotationX(rx));

// Transform de BBS {t, s, r (radianes), r2}: T * Rz*Ry*Rx * S
export function transformMatrix(t) {
  if (!t || typeof t !== 'object') return new THREE.Matrix4();
  const tr = v3(t.t), sc = v3(t.s, [1, 1, 1]);
  let r = v3(t.r);
  const r2 = v3(t.r2);
  let rot = rotZYX(r[0], r[1], r[2]);
  if (r2[0] || r2[1] || r2[2]) rot.multiply(rotZYX(r2[0], r2[1], r2[2]));
  return new THREE.Matrix4().makeTranslation(tr[0], tr[1], tr[2]).multiply(rot).multiply(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]));
}
// rotación final de una pose en grados (suma r + r2 como hace Transform.fromData)
function poseRotDeg(p) {
  let r = v3(p.r);
  const r2 = v3(p.r2);
  if (r2[0] || r2[1] || r2[2]) {
    const m = rotZYX(r[0], r[1], r[2]).multiply(rotZYX(r2[0], r2[1], r2[2]));
    const e = new THREE.Euler().setFromRotationMatrix(m, 'ZYX');
    r = [e.x, e.y, e.z];
  }
  return r.map((x) => x / D2R);
}

// ---------- texturas ----------
export class Texturas {
  constructor(fuente) { this.fuente = fuente; this.cache = new Map(); this.imgs = new Map(); }

  // Link de BBS en texto ("assets:models/x.png", "models/x.png", "color:ff00ff00")
  static ruta(link) {
    if (typeof link !== 'string' || !link) return null;
    const i = link.indexOf(':');
    const src = i < 0 ? 'assets' : link.slice(0, i), path = i < 0 ? link : link.slice(i + 1);
    return { src, path };
  }

  async imagen(link) {
    if (this.imgs.has(link)) return this.imgs.get(link);
    const p = (async () => {
      const r = Texturas.ruta(link);
      if (!r) return null;
      let blob = null;
      if (r.src === 'assets') blob = await this.fuente.blob('assets/' + r.path);
      else if (r.src === 'http' || r.src === 'https') { try { blob = await (await fetch(link)).blob(); } catch { blob = null; } }
      if (!blob) return null;
      try { return await createImageBitmap(blob); } catch { return null; }
    })();
    this.imgs.set(link, p);
    return p;
  }

  // valor de textura de BBS: texto, lista de capas (MultiLink) o null
  clave(valor) { return typeof valor === 'string' ? valor : JSON.stringify(valor); }

  async canvas(valor) {
    if (!valor) return null;
    if (typeof valor === 'string') {
      if (valor.startsWith('color:')) {
        const c = document.createElement('canvas'); c.width = c.height = 1;
        const x = c.getContext('2d'); const n = argb(parseInt(valor.slice(6), 16));
        x.fillStyle = `rgba(${n[0] * 255},${n[1] * 255},${n[2] * 255},1)`; x.fillRect(0, 0, 1, 1); return c;
      }
      const img = await this.imagen(valor);
      if (!img) return null;
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0); return c;
    }
    if (Array.isArray(valor)) return this.multi(valor);
    if (typeof valor === 'object' && valor.path) return this.multi([valor]);
    return null;
  }

  // TextureProcessor.process: capas encimadas, con tinte (multiplica), escala, corrimiento, pixelado y borrado
  async multi(capas) {
    const items = [];
    let w = 0, h = 0;
    for (const raw of capas) {
      const c = typeof raw === 'string' ? { path: raw } : raw || {};
      const img = c.path ? await this.imagen(c.path) : null;
      if (!img) continue;
      const sw = c.sizeW > 0 && !c.autoSize ? c.sizeW : img.width, sh = c.sizeH > 0 && !c.autoSize ? c.sizeH : img.height;
      w = Math.max(w, sw); h = Math.max(h, sh);
      items.push({ c, img });
    }
    if (!items.length) return null;
    const out = new ImageData(w, h);
    const o = out.data;
    for (const { c, img } of items) {
      let iw = img.width, ih = img.height;
      if (c.scaleToLargest) { iw = w; ih = h; } else if (c.scale > 0) { iw = Math.floor(iw * c.scale); ih = Math.floor(ih * c.scale); }
      if (iw <= 0 || ih <= 0) continue;
      const tmp = document.createElement('canvas'); tmp.width = img.width; tmp.height = img.height;
      const tx = tmp.getContext('2d'); tx.drawImage(img, 0, 0);
      const src = tx.getImageData(0, 0, img.width, img.height).data;
      const col = c.color !== undefined && c.color !== -1 ? argb(c.color) : null;
      const px = c.pixelate > 1 ? c.pixelate | 0 : 1;
      const sx = c.shiftX | 0, sy = c.shiftY | 0;
      const get = (x, y) => { const k = (y * img.width + x) * 4; return [src[k] / 255, src[k + 1] / 255, src[k + 2] / 255, src[k + 3] / 255]; };
      for (let i = Math.max(sx, 0); i < Math.min(sx + iw, w); i++) {
        for (let j = Math.max(sy, 0); j < Math.min(sy + ih, h); j++) {
          let X = Math.floor(img.width * ((i - sx) / iw)), Y = Math.floor(img.height * ((j - sy) / ih));
          if (px > 1) { X -= X % px; Y -= Y % px; }
          const t = get(X, Y);
          const k = (j * w + i) * 4;
          if (c.erase) { if (t[3] > 0.999) o[k + 3] = 0; continue; }
          if (col) { t[0] *= col[0]; t[1] *= col[1]; t[2] *= col[2]; t[3] *= col[3]; }
          const sa = o[k + 3] / 255, ta = t[3], a = 1 - (1 - ta) * (1 - sa);
          if (a > 0) {
            for (let q = 0; q < 3; q++) o[k + q] = Math.round(255 * (t[q] * ta / a + (o[k + q] / 255) * sa * (1 - ta) / a));
          }
          o[k + 3] = Math.round(a * 255);
        }
      }
    }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').putImageData(out, 0, 0);
    return cv;
  }

  async textura(valor) {
    if (!valor) return null;
    const k = this.clave(valor);
    if (this.cache.has(k)) return this.cache.get(k);
    const p = this.canvas(valor).then((cv) => {
      if (!cv) return null;
      const t = new THREE.CanvasTexture(cv);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
      t.userData.w = cv.width; t.userData.h = cv.height;
      return t;
    });
    this.cache.set(k, p);
    return p;
  }
}

// ---------- modelos ----------
export class Modelos {
  constructor(fuente, texturas) { this.fuente = fuente; this.tex = texturas; this.cache = new Map(); }

  // Lista de claves de modelos (ModelManager.getAvailableKeys)
  claves() {
    const keys = new Set();
    for (const p of this.fuente.rutas()) {
      if (!p.startsWith('assets/models/')) continue;
      const path = p.slice('assets/'.length);
      if (path.includes('/animations/') || path.includes('/shapes/')) continue;
      const low = path.toLowerCase();
      if (!RELOADABLE.some((e) => low.endsWith(e)) && !low.endsWith('.animation.json')) continue;
      const a = path.indexOf('/'), b = path.lastIndexOf('/');
      if (a === b) continue;
      keys.add(path.slice(a + 1, b));
    }
    return [...keys].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }));
  }

  links(key) {
    const pre = 'assets/models/' + key + '/';
    return this.fuente.rutas().filter((p) => p.startsWith(pre)).sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }));
  }

  async datos(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const p = this._cargar(key).catch((e) => ({ key, error: String(e && e.message || e) }));
    this.cache.set(key, p);
    return p;
  }

  async _cargar(key) {
    const base = 'assets/models/' + key + '/';
    const links = this.links(key);
    const pick = (nombre, suf) => (links.includes(base + nombre) ? base + nombre : links.find((l) => l.toLowerCase().endsWith(suf)) || null);
    let config = null;
    if (links.includes(base + 'config.json')) { try { config = JSON.parse(await this.fuente.texto(base + 'config.json')); } catch { config = null; } }
    const pngTex = pick('model.png', '.png');
    const d = { key, links, config: config || {}, texDefault: config && config.texture ? config.texture : (pngTex ? 'assets:' + pngTex.slice(7) : null), tipo: null, materiales: {}, poses: null };
    const matTex = (mat) => { const l = links.find((x) => x.includes('/' + mat + '/') && x.toLowerCase().endsWith('.png')); return l ? 'assets:' + l.slice(7) : null; };

    // 1) BOBJ
    const bobj = links.includes(base + 'model.bobj') ? base + 'model.bobj' : links.find((l) => l.toLowerCase().endsWith('.bobj'));
    if (bobj) {
      d.tipo = 'bobj';
      d.bobj = parseBOBJ(await this.fuente.texto(bobj));
      for (const m of d.bobj.mallas) { const t = matTex(m.nombre); if (t) d.materiales[m.nombre] = t; }
    } else {
      // 2) cúbico (.bbs.json) + OBJ de primer nivel
      const bbs = pick('model.bbs.json', '.bbs.json');
      let modelo = null;
      if (bbs) { try { modelo = parseCubic(JSON.parse(await this.fuente.texto(bbs)).model); } catch { modelo = null; } }
      const obj = links.find((l) => l.toLowerCase().endsWith('.obj') && !l.slice(base.length).includes('/'));
      if (obj) {
        const mtlPath = obj.replace(/\.obj$/i, '.mtl');
        const mtl = links.includes(mtlPath) ? await this.fuente.texto(mtlPath) : '';
        const o = parseOBJ(await this.fuente.texto(obj), mtl);
        if (!modelo) modelo = { tw: 1, th: 1, grupos: new Map(), top: [] };
        for (const [nombre, mallas] of o) {
          let g = modelo.grupos.get(nombre);
          if (!g) { g = nuevoGrupo(nombre); modelo.grupos.set(nombre, g); modelo.top.push(nombre); }
          for (const m of mallas) {
            g.meshes.push({ origin: [0, 0, 0], rotate: [0, 0, 0], material: m.material ? m.material.nombre : '', obj: true,
              pos: m.pos.map((x) => x * 16), uv: m.uv.map((x, i) => x * (i % 2 ? modelo.th : modelo.tw)) });
            if (m.material && !d.materiales[m.material.nombre]) {
              const t = matTex(m.material.nombre);
              d.materiales[m.material.nombre] = t || 'color:' + colorHex(m.material.kd);
            }
          }
        }
      }
      if (modelo && modelo.top.length) { d.tipo = 'cubic'; d.modelo = modelo; }
      else if (links.some((l) => /\.(geo\.json|vox)$/i.test(l))) d.tipo = 'otro';
    }
    // poses del grupo de poses
    const pg = (config && config.pose_group) || key;
    const posesPath = 'assets/models/' + pg + '/poses.json';
    if (this.fuente.existe(posesPath)) { try { d.poses = JSON.parse(await this.fuente.texto(posesPath)); } catch { d.poses = null; } }
    return d;
  }

  // Arma el objeto 3D del modelo con una pose y textura. Devuelve {obj, huesos:Map(id → Object3D), pivotes}
  async construir(key, { textura = null, pose = null, color = -1, materiales = null } = {}) {
    const d = await this.datos(key);
    const raiz = new THREE.Group(); raiz.name = 'modelo:' + key;
    const huesos = new Map(), pivotes = new Map();
    if (!d || d.error || !d.tipo || d.tipo === 'otro') { raiz.add(cajaFaltante(key)); return { obj: raiz, huesos, pivotes, datos: d }; }
    const col = argb(color);
    const sinTextura = new THREE.Color(0.75, 0.6, 0.5);
    const hacerMat = async (valor, doble) => {
      const t = valor ? await this.tex.textura(valor) : null;
      const m = new THREE.MeshLambertMaterial({ map: t, color: t ? new THREE.Color(col[0], col[1], col[2]) : sinTextura, alphaTest: 0.1, transparent: col[3] < 1, opacity: col[3], side: doble ? THREE.DoubleSide : THREE.FrontSide });
      return m;
    };
    const culling = d.config.culling !== false;
    const texPrincipal = textura || d.texDefault;
    if (d.tipo === 'bobj') {
      // la malla de BOBJ ya mira hacia +Z (BBS la gira 180° y el form la gira otros 180°)
      // como BBS: con un solo material manda la textura del form; con varios, cada material la suya
      const varios = d.bobj.mallas.length > 1;
      const mallasPiel = [];
      const esqueleto = d.bobj.huesos.length ? armarEsqueleto(d.bobj.huesos, raiz) : null;
      for (const m of d.bobj.mallas) {
        const tval = varios ? (materiales && materiales[m.nombre]) || d.materiales[m.nombre] || d.texDefault : texPrincipal;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
        if (m.nor.some((x) => x)) geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor, 3)); else geo.computeVertexNormals();
        const mat = await hacerMat(tval, !culling);
        if (esqueleto && m.si) {
          geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.si, 4));
          geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.sw, 4));
          const malla = new THREE.SkinnedMesh(geo, mat); malla.frustumCulled = false;
          malla.userData.bobj = true;
          raiz.add(malla); mallasPiel.push(malla);
        } else raiz.add(new THREE.Mesh(geo, mat));
      }
      if (esqueleto) {
        raiz.updateMatrixWorld(true);
        const sk = new THREE.Skeleton(esqueleto.lista);
        for (const mm of mallasPiel) mm.bind(sk, mm.matrixWorld);
        raiz.userData.bones = esqueleto.mapa;       // nombre -> {b: Bone, reposo: Quaternion}
        raiz.userData.padres = Object.fromEntries(d.bobj.huesos.map((h) => [h.n, h.p]));
      }
      return { obj: raiz, huesos, pivotes, datos: d };
    }
    const M = d.modelo;
    // tamaño de textura: el del modelo; si falta (0), el de la imagen
    let tw = M.tw, th = M.th;
    if (!(tw > 0 && th > 0)) {
      const t = texPrincipal ? await this.tex.textura(texPrincipal) : null;
      tw = t ? t.userData.w : 64; th = t ? t.userData.h : 64;
    }
    const usarMateriales = Object.keys(d.materiales).length > 1;
    const matCache = new Map();
    const matDe = async (material) => {
      const tval = usarMateriales ? (materiales && materiales[material]) || d.materiales[material] || d.texDefault : texPrincipal;
      const k = String(tval);
      if (!matCache.has(k)) matCache.set(k, hacerMat(tval, !culling));
      return matCache.get(k);
    };
    const giro = new THREE.Group(); giro.name = 'giro'; giro.rotation.y = Math.PI; raiz.add(giro);
    const P = (pose && pose.pose) || pose || {};
    const armar = async (id, padre) => {
      const g = M.grupos.get(id);
      const o = new THREE.Group(); o.name = id; o.matrixAutoUpdate = false;
      const pt = P[id] && typeof P[id] === 'object' ? P[id] : null;
      const t = pt ? v3(pt.t) : [0, 0, 0];
      const rot = g.rotate.slice();
      const sc = g.scale.slice();
      if (pt) {
        const r = poseRotDeg(pt); rot[0] += r[0]; rot[1] += r[1]; rot[2] += r[2];
        const s = v3(pt.s, [1, 1, 1]); sc[0] += s[0] - 1; sc[1] += s[1] - 1; sc[2] += s[2] - 1;
      }
      const piv = g.origin.map((x) => x / 16);
      // ICubicRenderer: translate(-dx, dy, dz) · pivote · Rz·Ry·Rx · escala · -pivote
      o.matrix.makeTranslation(-t[0] / 16, t[1] / 16, t[2] / 16)
        .multiply(new THREE.Matrix4().makeTranslation(piv[0], piv[1], piv[2]))
        .multiply(rotZYX(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R))
        .multiply(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]))
        .multiply(new THREE.Matrix4().makeTranslation(-piv[0], -piv[1], -piv[2]));
      padre.add(o); huesos.set(id, o); pivotes.set(id, piv);
      if (g.cubes.length) {
        const geo = geometriaCubos(g.cubes, tw, th);
        if (geo) o.add(new THREE.Mesh(geo, await matDe('')));
      }
      for (const m of g.meshes) {
        const geo = geometriaMalla(m, m.obj ? 1 : tw, m.obj ? 1 : th);
        if (geo) o.add(new THREE.Mesh(geo, await matDe(m.material)));
      }
      for (const c of g.hijos) await armar(c, o);
    };
    for (const id of M.top) await armar(id, giro);
    raiz.updateMatrixWorld(true);
    return { obj: raiz, huesos, pivotes, datos: d };
  }
}

// Huesos de un BOBJ (armadura de Blender): cada hueso cuelga de su padre con la orientacion de reposo del archivo.
// Pose de BBS = reposo * rotacion (ZYX); en reposo el modelo queda igual que sin huesos.
function armarEsqueleto(hs, raiz) {
  const bones = hs.map((h) => { const b = new THREE.Bone(); b.name = h.n; return b; });
  const idx = new Map(hs.map((h, i) => [h.n, i]));
  const qs = hs.map((h) => {
    const r = h.rot;
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1));
  });
  const mapa = {};
  hs.forEach((h, i) => {
    const b = bones[i], pi = idx.get(h.p);
    if (pi === undefined) { b.position.set(...h.cabeza); b.quaternion.copy(qs[i]); raiz.add(b); }
    else {
      const qp = qs[pi].clone().invert();
      b.position.set(...h.cabeza).sub(new THREE.Vector3(...hs[pi].cabeza)).applyQuaternion(qp);
      b.quaternion.copy(qp).multiply(qs[i]); bones[pi].add(b);
    }
    mapa[h.n] = { b, reposo: b.quaternion.clone() };
  });
  return { lista: bones, mapa };
}

function nuevoGrupo(id) { return { id, parent: '', origin: [0, 0, 0], rotate: [0, 0, 0], scale: [1, 1, 1], cubes: [], meshes: [], hijos: [] }; }
function colorHex(kd) { const h = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0'); return 'ff' + h(kd[0]) + h(kd[1]) + h(kd[2]); }

export function parseCubic(m) {
  if (!m || !m.groups) return null;
  const tex = Array.isArray(m.texture) ? m.texture : [];
  const M = { tw: tex[0] | 0, th: tex[1] | 0, grupos: new Map(), top: [] };
  const orden = Object.keys(m.groups);
  for (const id of orden) {
    const s = m.groups[id] || {};
    const g = nuevoGrupo(id);
    g.parent = s.parent || '';
    g.origin = v3(s.origin); g.rotate = v3(s.rotate); g.scale = v3(s.scale, [1, 1, 1]);
    g.cubes = (s.cubes || []).map((c) => ({ from: v3(c.from), size: v3(c.size), pivot: v3(c.origin), rotate: v3(c.rotate), inflate: +c.offset || 0, uvs: c.uvs || {}, box: c.box_uv ? { off: c.box_uv_offset || [0, 0], mirror: !!c.box_uv_mirror } : null }));
    g.meshes = (s.meshes || []).map((x) => ({ origin: v3(x.origin), rotate: v3(x.rotate), material: x.material || '', pos: x.vertices || [], uv: x.uvs || [] }));
    M.grupos.set(id, g);
  }
  for (const id of orden) {
    const g = M.grupos.get(id);
    if (g.parent && M.grupos.has(g.parent)) M.grupos.get(g.parent).hijos.push(id); else M.top.push(id);
  }
  return M;
}

// UV en caja (setupBoxUV), solo si el cubo no trae uvs
function boxUV(c) {
  const [w, h, d] = c.size.map(Math.floor), [bx, by] = c.box.off, mir = c.box.mirror;
  const r = (x1, y1, x2, y2) => [x1, y1, x2, y2];
  let u = {};
  let a = bx + d, b = by + d;
  u.front = mir ? r(a + w, b, a, b + h) : r(a, b, a + w, b + h);
  u.right = mir ? r(bx + d + w + d, by + d, bx + d + w, by + d + h) : r(bx, by + d, bx + d, by + d + h);
  u.back = mir ? r(bx + 2 * d + w + w, by + d, bx + 2 * d + w, by + d + h) : r(bx + 2 * d + w, by + d, bx + 2 * d + w + w, by + d + h);
  u.left = mir ? r(bx + d, by + d, bx, by + d + h) : r(bx + d + w, by + d, bx + d + w + d, by + d + h);
  let tminX = bx + d, tmaxX = tminX + w; if (mir) [tminX, tmaxX] = [tmaxX, tminX];
  u.top = r(tmaxX, by + d, tminX, by);
  let qminX = bx + d + w, qmaxX = qminX + w; if (mir) [qminX, qmaxX] = [qmaxX, qminX];
  u.bottom = r(qmaxX, by, qminX, by + d);
  return u;
}

// ModelUV.createQuad: p1..p4 con rotación de a 90°
function quadUV(r) {
  let pts = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
  const rot = +r[4] || 0;
  for (let i = 0; i < rot / 90; i++) pts.unshift(pts.pop());
  return pts;
}

// ModelCube.generateQuads + rotación del cubo sobre su pivote
function geometriaCubos(cubos, tw, th) {
  const pos = [], uv = [], nor = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const c of cubos) {
    const uvs = c.box && !Object.keys(c.uvs).length ? boxUV(c) : c.uvs;
    const i = c.inflate;
    const x0 = (c.from[0] - i) / 16, y0 = (c.from[1] - i) / 16, z0 = (c.from[2] - i) / 16;
    const x1 = (c.from[0] + c.size[0] + i) / 16, y1 = (c.from[1] + c.size[1] + i) / 16, z1 = (c.from[2] + c.size[2] + i) / 16;
    const p = c.pivot.map((q) => q / 16);
    const giro = c.rotate[0] || c.rotate[1] || c.rotate[2];
    if (giro) m.makeTranslation(p[0], p[1], p[2]).multiply(rotZYX(c.rotate[0] * D2R, c.rotate[1] * D2R, c.rotate[2] * D2R)).multiply(new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
    else m.identity();
    nm.getNormalMatrix(m);
    const cara = (nombre, verts, orden, normal) => {
      const r = uvs[nombre]; if (!r) return;
      const q = quadUV(r);
      const tri = [0, 1, 2, 0, 2, 3];
      for (const k of tri) {
        v.set(...verts[k]).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        const pq = q[orden[k]]; uv.push(pq[0] / tw, pq[1] / th);
        n.set(...normal).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
      }
    };
    // índice de punto de UV para cada vértice (p1=0, p2=1, p3=2, p4=3)
    cara('front', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [3, 2, 1, 0], [0, 0, -1]);
    cara('right', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [3, 2, 1, 0], [1, 0, 0]);
    cara('back', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [3, 2, 1, 0], [0, 0, 1]);
    cara('left', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [3, 2, 1, 0], [-1, 0, 0]);
    cara('top', [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], [1, 0, 3, 2], [0, 1, 0]);
    cara('bottom', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [3, 2, 1, 0], [0, -1, 0]);
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

// ModelMesh (vértices en píxeles + origen, uv en píxeles) u OBJ (ya convertido a píxeles)
function geometriaMalla(m, tw, th) {
  const n = Math.floor(m.pos.length / 3);
  if (!n || m.uv.length / 2 < n) return null;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (m.pos[i * 3] + m.origin[0]) / 16; pos[i * 3 + 1] = (m.pos[i * 3 + 1] + m.origin[1]) / 16; pos[i * 3 + 2] = (m.pos[i * 3 + 2] + m.origin[2]) / 16;
    uv[i * 2] = m.uv[i * 2] / tw; uv[i * 2 + 1] = m.uv[i * 2 + 1] / th;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  if (m.rotate[0] || m.rotate[1] || m.rotate[2]) {
    const p = m.origin.map((q) => q / 16);
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]).multiply(rotZYX(m.rotate[0] * D2R, m.rotate[1] * D2R, m.rotate[2] * D2R)).multiply(new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2])));
  }
  return geo;
}

// OBJParser de BBS: agrupa por "o"/"g", y dentro por material
export function parseOBJ(texto, mtl) {
  const mats = new Map();
  let actual = null;
  for (const raw of (mtl || '').split(/\r?\n/)) {
    const t = raw.trim().split(/\s+/); if (!t[0]) continue;
    if (t[0] === 'newmtl' && t[1]) { actual = { nombre: t[1].replace(/[/|\\]+/g, '-'), kd: [1, 1, 1] }; mats.set(actual.nombre, actual); }
    else if (actual && t[0] === 'Kd' && t.length === 4) actual.kd = [+t[1], +t[2], +t[3]];
  }
  const V = [], T = [], N = [];
  const objetos = new Map();
  let malla = null, mat = null;
  const idx = (s, len) => { const k = parseInt(s, 10); return isNaN(k) ? -1 : (k < 0 ? len + k : k - 1); };
  for (const raw of texto.split(/\r?\n/)) {
    const t = raw.trim().split(/\s+/); const f = t[0]; if (!f) continue;
    if ((f === 'o' || f === 'g') && t.length >= 2) { const nm = t[1]; if (!objetos.has(nm)) objetos.set(nm, new Map()); malla = objetos.get(nm); }
    if (f === 'v' && t.length >= 4) V.push(+t[1], +t[2], +t[3]);
    else if (f === 'vt' && t.length >= 2) T.push(+t[1], t.length >= 3 ? +t[2] : 0);
    else if (f === 'vn' && t.length >= 4) N.push(+t[1], +t[2], +t[3]);
    else if (f === 'usemtl' && t.length >= 2) mat = mats.get(t[1].replace(/[/|\\]+/g, '-')) || null;
    else if (f === 'f') {
      if (!malla) { objetos.set('default', new Map()); malla = objetos.get('default'); }
      if (!malla.has(mat)) malla.set(mat, { material: mat, pos: [], uv: [] });
      const dst = malla.get(mat);
      const caras = t.slice(1);
      const vert = (s) => {
        const p = s.split('/');
        const vi = idx(p[0], V.length / 3), ti = p[1] ? idx(p[1], T.length / 2) : -1;
        dst.pos.push(V[vi * 3] || 0, V[vi * 3 + 1] || 0, V[vi * 3 + 2] || 0);
        if (ti >= 0) dst.uv.push(T[ti * 2] || 0, 1 - (T[ti * 2 + 1] || 0)); else dst.uv.push(0, 0);
      };
      for (let i = 0; i + 2 < caras.length; i++) { vert(caras[0]); vert(caras[i + 1]); vert(caras[i + 2]); }
    }
  }
  const out = new Map();
  for (const [nm, porMat] of objetos) out.set(nm, [...porMat.values()]);
  return out;
}

// BOBJ (Blockbuster OBJ): mallas en pose de reposo
export function parseBOBJ(texto) {
  const V = [], T = [], N = [];
  const mallas = [];
  const huesos = [];      // armadura: {n, p, cabeza:[x,y,z], rot:[9 numeros por filas]}
  const pesos = [];       // por vertice: [[hueso, peso], ...] (lineas "vw" que siguen a cada "v")
  let m = null;
  for (const raw of texto.split(/\r?\n/)) {
    const t = raw.trim().split(/\s+/); const f = t[0];
    if (f === 'o') { m = { nombre: t[1] || '', caras: [] }; mallas.push(m); }
    else if (f === 'v') { V.push(+t[1], +t[2], +t[3]); pesos.push([]); }
    else if (f === 'vw') { if (pesos.length) pesos[pesos.length - 1].push([t[1], +t[2]]); }
    else if (f === 'vt') T.push(+t[1], +t[2]);
    else if (f === 'vn') N.push(+t[1], +t[2], +t[3]);
    else if (f === 'f' && m) m.caras.push(t[1], t[2], t[3]);
    else if (f === 'arm_bone') {
      // arm_bone nombre [padre] cola(x y z) matriz 4x4 por filas (la ultima columna es la cabeza). Los huesos raiz no traen padre.
      const sinPadre = !isNaN(+t[2]);
      const k = sinPadre ? 5 : 6, mt = t.slice(k, k + 16).map(Number);
      if (mt.length === 16 && mt.every(isFinite)) {
        huesos.push({ n: t[1], p: sinPadre ? null : t[2], cabeza: [mt[3], mt[7], mt[11]], rot: [mt[0], mt[1], mt[2], mt[4], mt[5], mt[6], mt[8], mt[9], mt[10]] });
      }
    }
  }
  // hasta 4 huesos por vertice (los de mas peso), normalizados
  const indice = new Map(huesos.map((h, i) => [h.n, i]));
  const infl = pesos.map((l) => {
    const top = l.filter(([n, w]) => w > 0 && indice.has(n)).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const suma = top.reduce((a, [, w]) => a + w, 0);
    return top.map(([n, w]) => [indice.get(n), suma ? w / suma : 0]);
  });
  const conPesos = huesos.length > 0 && infl.some((l) => l.length);
  return {
    huesos: conPesos ? huesos : [],
    mallas: mallas.map((x) => {
      const pos = [], uv = [], nor = [], si = [], sw = [];
      for (const s of x.caras) {
        const p = s.split('/').map((q) => parseInt(q, 10) - 1);
        pos.push(V[p[0] * 3] || 0, V[p[0] * 3 + 1] || 0, V[p[0] * 3 + 2] || 0);
        if (p[1] >= 0) uv.push(T[p[1] * 2] || 0, 1 - (T[p[1] * 2 + 1] || 0)); else uv.push(0, 0);
        if (p[2] >= 0) nor.push(N[p[2] * 3] || 0, N[p[2] * 3 + 1] || 0, N[p[2] * 3 + 2] || 0); else nor.push(0, 0, 0);
        if (conPesos) {
          const l = infl[p[0]] || [];
          for (let k = 0; k < 4; k++) { si.push(l[k] ? l[k][0] : 0); sw.push(l[k] ? l[k][1] : 0); }
        }
      }
      return { nombre: x.nombre, pos, uv, nor, ...(conPesos ? { si, sw } : {}) };
    }),
  };
}

function cajaFaltante(texto) {
  const g = new THREE.Group();
  const caja = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xff44aa, wireframe: true }));
  caja.position.y = 0.3; g.add(caja);
  g.add(etiqueta(texto, 0.9));
  return g;
}

export function etiqueta(texto, y = 1, color = '#ffffff', fondo = 'rgba(0,0,0,0.55)') {
  const c = document.createElement('canvas');
  const x = c.getContext('2d'); x.font = 'bold 28px sans-serif';
  const w = Math.min(1024, Math.ceil(x.measureText(texto).width) + 24);
  c.width = w; c.height = 44;
  x.font = 'bold 28px sans-serif'; x.fillStyle = fondo; x.fillRect(0, 0, w, 44);
  x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(texto, 12, 23);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(w / 44 * 0.25, 0.25, 1); s.position.y = y; s.renderOrder = 10;
  return s;
}

// ---------- forms ----------
export class Forms {
  constructor(modelos, texturas) { this.modelos = modelos; this.tex = texturas; }

  // Devuelve un Group listo para la escena (FormRenderer.render)
  async construir(form, prof = 0) {
    const nodo = new THREE.Group();
    if (!form || typeof form !== 'object' || prof > 12) return nodo;
    nodo.name = 'form:' + (form.id || '?');
    if (form.visible === false) { nodo.visible = false; }
    nodo.matrixAutoUpdate = false;
    nodo.matrix.copy(transformMatrix(form.transform));
    const id = form.id || '';
    let huesos = null, pivotes = null;
    if (id === 'bbs:model') {
      const r = await this.modelos.construir(form.model || '', { textura: form.texture || null, pose: form.pose, color: form.color, materiales: form.material_textures || null });
      const d = r.datos || {};
      const sc = v3(d.config && d.config.scale, [1, 1, 1]);
      if (sc[0] !== 1 || sc[1] !== 1 || sc[2] !== 1) nodo.matrix.multiply(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]));
      nodo.add(r.obj); huesos = r.huesos; pivotes = r.pivotes;
      nodo.userData.modelo = form.model;
    } else if (id === 'bbs:billboard') {
      nodo.add(await this.cartel(form));
    } else if (id === 'bbs:label') {
      nodo.add(etiqueta(String(form.text || form.label || 'texto'), 0.2, '#ffffff', 'rgba(0,0,0,0.25)'));
    } else if (id === 'bbs:extruded') {
      nodo.add(await this.cartel({ texture: form.texture, color: form.color }));
    } else if (id === 'bbs:anchor' || !id) {
      // solo contenedor
    } else {
      nodo.add(cajaFaltante(id.replace('bbs:', '') + (form.item ? ' ' + JSON.stringify(form.item).slice(0, 30) : '')));
    }
    // partes (BodyPart): en modelos se pegan al hueso (bone matrix · pivote · giro 180°)
    for (const parte of Array.isArray(form.parts) ? form.parts : []) {
      if (!parte || !parte.form) continue;
      const hijo = await this.construir(parte.form, prof + 1);
      const sujeto = new THREE.Group(); sujeto.matrixAutoUpdate = false;
      sujeto.matrix.copy(transformMatrix(parte.transform));
      sujeto.add(hijo);
      const hueso = huesos && parte.bone ? huesos.get(parte.bone) : null;
      if (hueso) {
        const ancla = new THREE.Group(); ancla.matrixAutoUpdate = false;
        const p = pivotes.get(parte.bone);
        ancla.matrix.makeTranslation(p[0], p[1], p[2]).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
        ancla.add(sujeto); hueso.add(ancla);
      } else {
        nodo.add(sujeto);
      }
    }
    nodo.updateMatrixWorld(true);
    return nodo;
  }

  async cartel(form) {
    const t = await this.tex.textura(form.texture);
    const g = new THREE.Group();
    if (!t) return g;
    const w = t.userData.w, h = t.userData.h;
    const rx = w > h ? h / w : 1, ry = h > w ? w / h : 1;
    const col = argb(form.color);
    const geo = new THREE.PlaneGeometry(ry, rx);
    // flipY=false: invertir V de la placa
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(col[0], col[1], col[2]), transparent: true, alphaTest: 0.05, side: THREE.DoubleSide }));
    g.add(m);
    return g;
  }
}

// Nombre corto para mostrar de un form
export function nombreForm(f) {
  if (!f) return '?';
  if (f.name) return f.name;
  if (f.id === 'bbs:model') return (f.model || 'modelo');
  if (f.id === 'bbs:billboard' || f.id === 'bbs:extruded') { const t = typeof f.texture === 'string' ? f.texture : ''; return t ? t.split('/').pop() : f.id.replace('bbs:', ''); }
  if (f.id === 'bbs:label') return 'texto: ' + (f.text || '');
  return (f.id || 'form').replace('bbs:', '');
}
