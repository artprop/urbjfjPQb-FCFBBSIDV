// Buscar los modelos de un mod (.jar) o paquete (.zip): los .geo.json (GeckoLib / Bedrock) y model.bbs.json, cada uno con SUS texturas
// y animaciones. Para saber qué va con qué se lee el código del mod (los .class nombran juntas las rutas del modelo, sus texturas y
// sus animaciones: «geo/entity/pekka.geo.json», «textures/entity/pekka.png»…); lo que no aparece en el código se asigna por el nombre
// (la textura «pekka_star.png» es del modelo «pekka»).
import { geometrias, geoABBS } from './geo.js';

export const base = (ruta) => ruta.split('/').pop().replace(/\.(geo|bbs)\.json$|\.animation\.json$|\.json$|\.png$/i, '');
const txt = (b) => new TextDecoder().decode(b);

// textos de un .class (como el comando «strings»): las rutas de recursos que nombra
function rutasEnClase(bytes) {
  const out = []; let s = '';
  for (let i = 0; i <= bytes.length; i++) {
    const c = i < bytes.length ? bytes[i] : 0;
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
    else { if (s.length >= 6 && /\.(png|json)$/i.test(s)) out.push(s.replace(/^.*?([a-z0-9_.-]+:)?((textures|geo|animations|models)\/)/i, '$2')); s = ''; }
  }
  return out;
}

/** archivos: { ruta: Uint8Array }. Devuelve { modelos: [{ ruta, nombre, bbs, original, texturas: [ruta], animaciones: [ruta] }], texturas: { ruta: bytes }, animaciones: { ruta: bytes } }. */
export function analizarMod(archivos) {
  const rutas = Object.keys(archivos);
  const texturas = {}, animaciones = {};
  for (const r of rutas) {
    if (/\.png$/i.test(r) && !/\/(gui|particle|particles|mob_effect|font|painting|environment)\//i.test(r)) texturas[r] = archivos[r];
    else if (/\.animation\.json$/i.test(r)) animaciones[r] = archivos[r];
  }
  // modelos
  const modelos = [];
  for (const r of rutas) {
    if (!/\.json$/i.test(r) || /\.animation\.json$/i.test(r)) continue;
    if (!/\.geo\.json$|\.bbs\.json$|\/geo\//i.test(r) && !/models?\//i.test(r)) continue;
    let j; try { j = JSON.parse(txt(archivos[r])); } catch { continue; }
    if (j && j.model && j.model.groups) modelos.push({ ruta: r, nombre: base(r) === 'model' ? r.split('/').slice(-2, -1)[0] : base(r), bbs: j, original: archivos[r], texturas: [], animaciones: [] });
    else if (j && (j['minecraft:geometry'] || Object.keys(j).some((k) => k.startsWith('geometry.')))) {
      const gs = geometrias(j);
      gs.forEach((g, i) => modelos.push({ ruta: r, nombre: base(r) + (gs.length > 1 ? '_' + (i + 1) : ''), bbs: geoABBS(g), original: archivos[r], texturas: [], animaciones: [] }));
    }
  }
  // lo que nombra el código del mod: cada .class con un modelo se queda con las texturas y animaciones que nombra
  const porFin = (ref, lista) => lista.find((r) => r.toLowerCase().endsWith('/' + ref.toLowerCase()));
  const listaT = Object.keys(texturas), listaA = Object.keys(animaciones);
  const asignar = (m, ruta, campo) => { if (ruta && !m[campo].includes(ruta)) m[campo].push(ruta); };
  // de varios modelos posibles, el de nombre más largo que sea el comienzo del nombre del archivo (pekka_evo.png -> pekka_evo)
  const mejorPorNombre = (cands, ruta) => {
    const b = base(ruta).toLowerCase();
    const ok = cands.filter((m) => b.startsWith(base(m.ruta).toLowerCase())).sort((x, y) => base(y.ruta).length - base(x.ruta).length);
    return ok.length ? [ok[0]] : null;
  };
  for (const r of rutas) {
    if (!/\.class$/i.test(r)) continue;
    const refs = rutasEnClase(archivos[r]); if (!refs.length) continue;
    const mods = refs.map((x) => modelos.filter((m) => m.ruta.toLowerCase().endsWith('/' + x.toLowerCase()))).flat();
    if (!mods.length) continue;
    for (const x of refs) {
      const t = porFin(x, listaT), a = porFin(x, listaA), cual = t || a; if (!cual) continue;
      for (const m of mejorPorNombre(mods, cual) || mods) asignar(m, cual, t ? 'texturas' : 'animaciones');
    }
  }
  // lo que quedó sin dueño: por el nombre (overlays, variantes) o, si no, por el tamaño de la textura
  const usadas = new Set(modelos.flatMap((m) => [...m.texturas, ...m.animaciones]));
  for (const t of listaT) if (!usadas.has(t) && !/\/(item|items|block|blocks)\//i.test(t)) {   // (las de ítems y bloques, solo si el código las nombra)
    const m = mejorPorNombre(modelos, t); if (m) asignar(m[0], t, 'texturas'); }
  for (const a of listaA) if (!usadas.has(a)) { const m = mejorPorNombre(modelos, a); if (m) asignar(m[0], a, 'animaciones'); }
  // la textura principal primero: la que se llama igual que el modelo
  for (const m of modelos) m.texturas.sort((x, y) => (base(x) === base(m.ruta) ? -1 : 0) - (base(y) === base(m.ruta) ? -1 : 0) || base(x).length - base(y).length);
  modelos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { modelos, texturas, animaciones };
}
