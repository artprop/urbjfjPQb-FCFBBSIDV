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
   * Muestra un modelo de ojos solo. o: { carpeta (nombre del modelo), modelo (.bbs.json), obj (texto del OBJ o null), config, png (bytes), pose ({hueso: {r, s, t}} o null) }
   */
  async function mostrar(o) {
    const mia = ++ronda;
    const base = `assets/models/player/${o.carpeta}/`;
    const archivos = {
      [base + 'config.json']: JSON.stringify({ ...o.config, texture: `assets:models/player/${o.carpeta}/textura.png` }),
      [base + o.carpeta + '.bbs.json']: JSON.stringify(o.modelo),
      [base + 'textura.png']: new Blob([o.png], { type: 'image/png' }),
    };
    if (o.obj) archivos[base + 'base.obj'] = o.obj;
    const fuente = { rutas: () => Object.keys(archivos), texto: async (p) => archivos[p], blob: async (p) => archivos[p], existe: (p) => p in archivos };
    const modelos = new Modelos(fuente, new Texturas(fuente));
    const m = await modelos.construir('player/' + o.carpeta, { pose: o.pose ? { pose: o.pose } : null });
    if (mia !== ronda) { liberar(m.obj); return; }     // llegó otro pedido más nuevo
    if (modelo) { escena.remove(modelo); liberar(modelo); }
    modelo = m.obj; escena.add(modelo); dibujar();
  }
  function liberar(o) { o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } }); }
  return { mostrar, ajustar, dibujar };
}
