// Muñeco 3D de la Vista previa: el modelo REAL steve_bends de BBS (web/modelo_datos.js) con una skin.
// Coordenadas del modelo: absolutas en pixeles, y=0 en los pies, x+ = derecha del personaje, frente = -Z.
// Cada grupo (hueso) cuelga de su padre y gira alrededor de su "origin"; los cubos traen from/size/offset/rotate/uvs.
import * as THREE from './three.module.min.js';
import { MODELOS } from './modelo_datos.js';
import { EMOTICONS } from './modelo_emoticons.js';

const PX = 1 / 16;
export const HUESOS_ANIMABLES = ['anchor', 'low_body', 'head', 'right_arm', 'right_elbow', 'left_arm', 'left_elbow',
  'right_leg', 'right_knee', 'left_leg', 'left_knee'];
const COLOR_SIN_SKIN = 0xb0806a;

// UV de una cara a partir de la posicion de cada vertice (no depende del orden de vertices de BoxGeometry).
// rect = [u1,v1,u2,v2] en pixeles de la skin; se usa el rectangulo minimo/maximo (el orden/giro de los numeros se ignora).
// a = fraccion horizontal y b = fraccion vertical dentro de la cara, vista desde afuera (verificado con el layout de skin de Minecraft).
const FRACCIONES = {
  front:  (x, y, z, h) => [(h[0] - x) / (2 * h[0]), (h[1] - y) / (2 * h[1])],   // cara -Z
  back:   (x, y, z, h) => [(x + h[0]) / (2 * h[0]), (h[1] - y) / (2 * h[1])],   // cara +Z
  right:  (x, y, z, h) => [(h[2] - z) / (2 * h[2]), (h[1] - y) / (2 * h[1])],   // cara +X
  left:   (x, y, z, h) => [(z + h[2]) / (2 * h[2]), (h[1] - y) / (2 * h[1])],   // cara -X
  top:    (x, y, z, h) => [(h[0] - x) / (2 * h[0]), (h[2] - z) / (2 * h[2])],   // cara +Y
  bottom: (x, y, z, h) => [(h[0] - x) / (2 * h[0]), (z + h[2]) / (2 * h[2])],   // cara -Y
};
// orden de grupos de vertices de BoxGeometry: +x, -x, +y, -y, +z, -z
const CARAS = ['right', 'left', 'top', 'bottom', 'back', 'front'];

export function uvCubo(geo, uvs, tam) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, [tw, th] = tam;
  const h = [geo.parameters.width / 2, geo.parameters.height / 2, geo.parameters.depth / 2];
  CARAS.forEach((cara, i) => {
    const r = uvs[cara]; if (!r) return;
    const u0 = Math.min(r[0], r[2]), u1 = Math.max(r[0], r[2]), v0 = Math.min(r[1], r[3]), v1 = Math.max(r[1], r[3]);
    for (let k = 0; k < 4; k++) {
      const idx = i * 4 + k;
      const [a, b] = FRACCIONES[cara](pos.getX(idx), pos.getY(idx), pos.getZ(idx), h);
      uv.setXY(idx, (u0 + a * (u1 - u0)) / tw, 1 - (v0 + b * (v1 - v0)) / th);
    }
  });
  uv.needsUpdate = true;
}

export const NOMBRES_MODELO = [...Object.keys(MODELOS), 'emoticons_steve'];

// emoticons/steve: malla con huesos (skinning), en el mundo del modelo (mira hacia +Z) y a escala 0,9375;
// se gira 180 grados para que mire hacia -Z como el resto. Rotacion de cada hueso = reposo relativo * rotacion de BBS.
function crearEmoticons() {
  const D = EMOTICONS, huesos = D.huesos;
  const idx = Object.fromEntries(huesos.map((h, i) => [h.n, i]));
  const bones = huesos.map((h) => { const b = new THREE.Bone(); b.name = h.n; return b; });
  const restQ = huesos.map((h) => {
    const r = h.rot, m = new THREE.Matrix4().set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  });
  const raiz = new THREE.Group(); raiz.rotation.y = Math.PI; raiz.scale.setScalar(D.escala);
  const restRel = {};
  huesos.forEach((h, i) => {
    const b = bones[i], pi = idx[h.p];
    if (pi === undefined) { b.position.set(...h.cabeza); b.quaternion.copy(restQ[i]); raiz.add(b); }
    else {
      const qp = restQ[pi].clone().invert();
      b.position.set(...h.cabeza).sub(new THREE.Vector3(...huesos[pi].cabeza)).applyQuaternion(qp);
      b.quaternion.copy(qp).multiply(restQ[i]); bones[pi].add(b);
    }
    restRel[h.n] = b.quaternion.clone();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(D.p, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(D.uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(D.n, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(D.si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(D.sw, 4));
  geo.setIndex(D.idx);
  const mat = new THREE.MeshLambertMaterial({ color: COLOR_SIN_SKIN, alphaTest: 0.5, side: THREE.DoubleSide });
  const malla = new THREE.SkinnedMesh(geo, mat); malla.frustumCulled = false;
  raiz.add(malla); raiz.updateMatrixWorld(true);
  malla.bind(new THREE.Skeleton(bones), malla.matrixWorld);
  const animables = ['anchor', 'body', 'low_body', 'head', 'right_arm', 'low_right_arm', 'left_arm', 'low_left_arm',
    'right_leg', 'low_leg_right', 'left_leg', 'low_left_leg', 'low_right_arm.end', 'low_left_arm.end'];
  const hs = {};
  animables.forEach((n) => (hs[n] = bones[idx[n]]));
  Object.defineProperty(hs, 'pielCabeza', { value: null, enumerable: false });
  Object.defineProperty(hs, 'ojosBasicos', { value: [], enumerable: false });
  const ponerTextura = (tex) => {
    if (tex) { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace; }
    mat.map = tex || null; mat.color.set(tex ? 0xffffff : COLOR_SIN_SKIN); mat.needsUpdate = true;
  };
  return { huesos: hs, todos: hs, raiz, restRel, ponerTextura, tam: [64, 64] };
}

// nombre: 'steve_bends', 'alex_bends' (brazos finos de 3 px) o 'emoticons_steve'
export function crearModelo(nombre = 'steve_bends') {
  if (nombre === 'emoticons_steve') return crearEmoticons();
  const MODELO = MODELOS[nombre] || MODELOS.steve_bends;
  const tam = MODELO.textura;
  const mats = [];   // todos los materiales con skin (para cambiar la textura)
  const nuevoMat = (doble) => {
    const m = new THREE.MeshLambertMaterial({ color: COLOR_SIN_SKIN, alphaTest: 0.5, side: doble ? THREE.DoubleSide : THREE.FrontSide });
    mats.push(m); return m;
  };
  const matBase = nuevoMat(false), matTira = nuevoMat(true);
  const todos = {};
  for (const [nombre, g] of Object.entries(MODELO.grupos)) {
    const o = new THREE.Group(); o.name = nombre; o.rotation.order = 'ZYX'; todos[nombre] = o;
  }
  let pielCabeza = null;
  for (const [nombre, g] of Object.entries(MODELO.grupos)) {
    const grupo = todos[nombre], po = g.p ? MODELO.grupos[g.p].o : [0, 0, 0];
    grupo.position.set((g.o[0] - po[0]) * PX, (g.o[1] - po[1]) * PX, (g.o[2] - po[2]) * PX);
    if (g.p) todos[g.p].add(grupo);
    g.c.forEach((c, n) => {
      const inf = c.offset || 0, s = c.size;
      const geo = new THREE.BoxGeometry((s[0] + 2 * inf) * PX, (s[1] + 2 * inf) * PX, (s[2] + 2 * inf) * PX);
      uvCubo(geo, c.uvs, tam);
      const esCabeza = nombre === 'head' && n === 0;
      const mat = esCabeza ? Array.from({ length: 6 }, () => nuevoMat(false)) : (c.rotate ? matTira : matBase);
      const malla = new THREE.Mesh(geo, mat);
      const centro = [c.from[0] + s[0] / 2, c.from[1] + s[1] / 2, c.from[2] + s[2] / 2];
      if (c.rotate) {   // cubo girado (tiras finas que tapan codos, rodillas y cintura): gira alrededor de su propio origen
        const pivote = new THREE.Group(); pivote.rotation.order = 'ZYX';
        pivote.position.set((c.origin[0] - g.o[0]) * PX, (c.origin[1] - g.o[1]) * PX, (c.origin[2] - g.o[2]) * PX);
        pivote.rotation.set(...c.rotate.map((d) => (d * Math.PI) / 180));
        malla.position.set((centro[0] - c.origin[0]) * PX, (centro[1] - c.origin[1]) * PX, (centro[2] - c.origin[2]) * PX);
        pivote.add(malla); grupo.add(pivote);
      } else {
        malla.position.set((centro[0] - g.o[0]) * PX, (centro[1] - g.o[1]) * PX, (centro[2] - g.o[2]) * PX);
        grupo.add(malla);
      }
      if (esCabeza) pielCabeza = malla;
    });
  }
  const huesos = {};
  HUESOS_ANIMABLES.forEach((b) => (huesos[b] = todos[b]));
  // la cara mira hacia -Z; estos cuadritos se ven solo si no hay modelo de ojos
  const cuadrito = (x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6 * PX, 1.2 * PX, 0.3 * PX), new THREE.MeshLambertMaterial({ color: 0x3a4fa0 }));
    m.position.set(x * PX, 4.2 * PX, -4.05 * PX); return m;
  };
  const basicos = [cuadrito(-1.8), cuadrito(1.8)];
  basicos.forEach((m) => huesos.head.add(m));
  Object.defineProperty(huesos, 'pielCabeza', { value: pielCabeza, enumerable: false });
  Object.defineProperty(huesos, 'ojosBasicos', { value: basicos, enumerable: false });
  // raiz: 'anchor' esta en su origen absoluto del modelo
  huesos.anchor.position.set(MODELO.grupos.anchor.o[0] * PX, MODELO.grupos.anchor.o[1] * PX, MODELO.grupos.anchor.o[2] * PX);

  // skin: textura 64x64 (o null = color liso)
  const ponerTextura = (tex) => {
    if (tex) { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace; }
    for (const m of mats) { m.map = tex || null; m.color.set(tex ? 0xffffff : COLOR_SIN_SKIN); m.needsUpdate = true; }
  };
  return { huesos, todos, raiz: huesos.anchor, ponerTextura, tam };
}
