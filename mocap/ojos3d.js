// Ojos de BBS en 3D con la geometria REAL de los modelos player/eyes y player/eyes_1px (sacados de los mods BBS).
// Datos en ojos_datos.js (generado por herramientas/generar_ojos_datos.py). Unidades: 1 px del modelo = 1/16 de bloque.
//
// El espacio del modelo de ojos es el mismo que el de steve_bends (x+ = derecha del personaje, el frente es -Z).
// Convenciones de las poses de BBS (verificadas con el video de referencia):
//   t.x positivo = hacia la IZQUIERDA del personaje (= -x del modelo), t.y positivo = arriba, t.z positivo = hacia adentro
//   s y r (radianes, eje Z) se aplican alrededor del origen de cada grupo; todas las piezas cuelgan de "anchor".
// Las piezas del ojo estan hundidas ~0.2 px dentro de la cabeza y la piel se borra en el hueco de cada ojo,
// por eso se dibuja la cara de la cabeza con agujeros.
import * as THREE from './three.module.min.js';
import { MODELOS, TEXTURAS, POSES } from './ojos_datos.js';

const PX = 1 / 16;
export { POSES as POSES_OJOS };
export const NOMBRES_MODELO = { eyes: 'Ojos 2×2 (eyes)', eyes_1px: 'Ojos de 1 píxel (eyes_1px)' };
export const HUESOS_OJOS = Object.keys(MODELOS.eyes);

function textura(pix) {
  const d = new Uint8Array(16 * 16 * 4);
  for (const p of pix.split(';')) {
    const [x, y, hex] = p.split(',');
    const i = ((15 - Number(y)) * 16 + Number(x)) * 4;
    d[i] = parseInt(hex.slice(0, 2), 16); d[i + 1] = parseInt(hex.slice(2, 4), 16); d[i + 2] = parseInt(hex.slice(4, 6), 16); d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, 16, 16, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

// orden de las caras de BoxGeometry: +x, -x, +y, -y, +z, -z  <->  right, left, top, bottom, back, front
function asignarUV(geo, caras) {
  const orden = ['right', 'left', 'top', 'bottom', 'back', 'front'];
  const a = geo.attributes.uv;
  orden.forEach((k, i) => {
    const u = caras[k]; if (!u) return;
    const x0 = u[0] / 16, x1 = u[2] / 16, y0 = 1 - u[1] / 16, y1 = 1 - u[3] / 16, o = i * 4;
    a.setXY(o, x0, y0); a.setXY(o + 1, x1, y0); a.setXY(o + 2, x0, y1); a.setXY(o + 3, x1, y1);
  });
  a.needsUpdate = true;
}

export class Ojos3D {
  // cabeza: THREE.Group del hueso head (origen en el cuello, la cabeza va de y=0 a 8 px); pielMesh: la caja de la cabeza
  // (con un arreglo de 6 materiales) para poder borrar su cara frontal y reemplazarla por una con agujeros.
  constructor(cabeza, pielMesh) {
    this.piel = pielMesh; this.modelo = null; this.partes = {};
    for (const nombre of Object.keys(MODELOS)) {
      const cfg = MODELOS[nombre], G = {};
      const raiz = new THREE.Group(); raiz.scale.setScalar(PX); raiz.visible = false; cabeza.add(raiz);
      const mat = new THREE.MeshLambertMaterial({ map: textura(TEXTURAS[nombre]), alphaTest: 0.5, side: THREE.DoubleSide });
      for (const [n, c] of Object.entries(cfg)) {
        const g = new THREE.Group(); G[n] = g;
        for (const cb of c.c) {
          const geo = new THREE.BoxGeometry(cb.s[0], cb.s[1], cb.s[2]);
          asignarUV(geo, cb.uv);
          const m = new THREE.Mesh(geo, mat);
          m.position.set(cb.f[0] + cb.s[0] / 2 - c.o[0], cb.f[1] + cb.s[1] / 2 - c.o[1], cb.f[2] + cb.s[2] / 2 - c.o[2]);
          g.add(m);
        }
      }
      for (const [n, c] of Object.entries(cfg)) (c.p ? G[c.p] : raiz).add(G[n]);
      const plano = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: pielMesh.material[0].color, alphaTest: 0.5, side: THREE.DoubleSide }));
      plano.position.z = -4 * PX; plano.visible = false; cabeza.add(plano);
      this.partes[nombre] = { cfg, G, raiz, plano };
    }
    this.mover(0, 0);
  }

  // Corre los ojos respecto de la posicion de fabrica, en pixeles del modelo y VISTO DESDE EL FRENTE:
  // dx > 0 = hacia la derecha de la pantalla (= la izquierda del personaje), dy > 0 = hacia arriba.
  // Sirve para skins con los ojos pintados en otro lugar. Es solo de la vista previa: no cambia el film.
  mover(dx, dy) {
    this.off = [dx, dy];
    for (const p of Object.values(this.partes)) {
      p.raiz.position.set(-dx * PX, (dy - 1) * PX, 0);   // -1: la parte de ojos va 1 px mas abajo dentro de la cabeza
      // cara de la cabeza con un agujero por ojo (del tamaño del cubo del ojo), siguiendo a los ojos
      const ojo = p.cfg.eye_r.c[0], alto = ojo.s[1];
      const sh = new THREE.Shape(); sh.moveTo(-4, 0); sh.lineTo(4, 0); sh.lineTo(4, 8); sh.lineTo(-4, 8); sh.lineTo(-4, 0);
      const y0 = Math.max(0, ojo.f[1] - 1 + dy), y1 = Math.min(8, ojo.f[1] - 1 + dy + alto);
      for (const f0 of [ojo.f[0], p.cfg.eye_l.c[0].f[0]]) {
        const x0 = Math.max(-4, f0 - dx), x1 = Math.min(4, f0 - dx + 2);
        if (x1 - x0 < 0.05 || y1 - y0 < 0.05) continue;   // el ojo se salio de la cara
        const h = new THREE.Path(); h.moveTo(x0, y0); h.lineTo(x1, y0); h.lineTo(x1, y1); h.lineTo(x0, y1); h.lineTo(x0, y0);
        sh.holes.push(h);
      }
      const geo = new THREE.ShapeGeometry(sh);
      // la cara de la skin (region 8..16 x 8..16 de 64x64): u crece hacia la izquierda del personaje (-x)
      const gp = geo.attributes.position, gu = geo.attributes.uv;
      for (let i = 0; i < gp.count; i++) gu.setXY(i, (8 + (4 - gp.getX(i))) / 64, 1 - (8 + (8 - gp.getY(i))) / 64);
      geo.scale(PX, PX, PX);
      p.plano.geometry.dispose(); p.plano.geometry = geo;
    }
  }

  // la cara con agujeros usa la misma skin que el resto del muñeco
  ponerTextura(tex) {
    for (const p of Object.values(this.partes)) { p.plano.material.map = tex; p.plano.material.color.set(0xffffff); p.plano.material.needsUpdate = true; }
  }

  // nombre: 'eyes' | 'eyes_1px' | null (sin ojos: se muestra la cabeza lisa)
  usar(nombre) {
    this.modelo = nombre && this.partes[nombre] ? nombre : null;
    for (const [n, p] of Object.entries(this.partes)) { p.raiz.visible = n === this.modelo; p.plano.visible = n === this.modelo; }
    this.piel.material[5].visible = !this.modelo;   // cara frontal de la cabeza: se reemplaza por la que tiene agujeros
  }

  // st: hueso -> { t, s, r } (valores de BBS); lo que falta queda en reposo
  aplicar(st) {
    const p = this.partes[this.modelo]; if (!p) return;
    for (const [n, c] of Object.entries(p.cfg)) {
      const v = st[n] || {}, t = v.t || [0, 0, 0], s = v.s || [1, 1, 1], r = v.r || [0, 0, 0];
      const po = c.p ? p.cfg[c.p].o : [0, 0, 0], g = p.G[n];
      g.position.set(c.o[0] - po[0] - t[0], c.o[1] - po[1] + t[1], c.o[2] - po[2] + t[2]);
      g.rotation.set(0, 0, r[2]);
      g.scale.set(Math.max(s[0], 1e-4), Math.max(s[1], 1e-4), Math.max(s[2], 1e-4));
    }
  }
}
