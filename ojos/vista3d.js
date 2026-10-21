// Vista 3D de los ojos solos (sin cabeza): el modelo de ojos que se está armando, dibujado con el mismo cargador del Visor, para girarlo con el dedo.
import * as THREE from '../visor/lib/three.module.min.js';
import { OrbitControls } from '../visor/lib/OrbitControls.js';
import { Modelos, Texturas } from '../visor/bbs.js';
import { pngDeRGBA } from '../mocap/paquete_modelos.js';

export function crearVista3D(canvas) {
  const render = new THREE.WebGLRenderer({ canvas, antialias: true });
  render.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const escena = new THREE.Scene(); escena.background = new THREE.Color(0x1a1e26);
  escena.add(new THREE.AmbientLight(0xffffff, 1.7));
  const sol = new THREE.DirectionalLight(0xffffff, 1.2); sol.position.set(0.6, 1.2, 1.5); escena.add(sol);
  const camara = new THREE.PerspectiveCamera(28, 1, 0.01, 20);
  camara.position.set(0.5, 0.42, 1.25);
  const control = new OrbitControls(camara, canvas);
  control.target.set(0, 0.25, 0); control.minDistance = 0.4; control.maxDistance = 4; control.update();
  let modelo = null, ronda = 0;
  const dibujar = () => render.render(escena, camara);
  control.addEventListener('change', dibujar);

  const ajustar = () => {
    const r = canvas.getBoundingClientRect(); if (!r.width) return;
    render.setSize(r.width, r.height, false); camara.aspect = r.width / r.height; camara.updateProjectionMatrix(); dibujar();
  };
  new ResizeObserver(ajustar).observe(canvas); ajustar();

  /**
   * res: lo que devuelve generar(); nombre: nombre del modelo; pose: nombre de la pose o null.
   * alt (opcional): { variante, modelo (el .bbs.json estándar), png (bytes de la textura), dy } para ver el modelo estándar con la textura lisa, bajado dy filas.
   */
  async function mostrar(res, nombre, pose = null, alt = null) {
    const mia = ++ronda;
    const carpeta = alt ? alt.variante : nombre;
    const base = `assets/models/player/${carpeta}/`;
    const png = new Blob([alt ? alt.png : pngDeRGBA(res.textura.w, res.textura.h, res.textura.rgba)], { type: 'image/png' });
    const config = { ...res.config, texture: `assets:models/player/${carpeta}/textura.png` };
    const archivos = { [base + 'config.json']: JSON.stringify(config), [base + carpeta + '.bbs.json']: JSON.stringify(alt ? alt.modelo : res.modelo), [base + 'textura.png']: png };
    const fuente = { rutas: () => Object.keys(archivos), texto: async (p) => archivos[p], blob: async (p) => archivos[p], existe: (p) => p in archivos };
    const modelos = new Modelos(fuente, new Texturas(fuente));
    const p = pose && res.poses[pose] ? { pose: res.poses[pose].pose } : null;
    const m = await modelos.construir('player/' + carpeta, { pose: p });
    if (mia !== ronda) { liberar(m.obj); return; }     // llegó otro pedido más nuevo
    if (alt && alt.dy) m.obj.position.y = -alt.dy / 16;
    if (modelo) { escena.remove(modelo); liberar(modelo); }
    modelo = m.obj; escena.add(modelo); dibujar();
  }
  function liberar(o) { o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } }); }
  return { mostrar, ajustar, dibujar };
}
