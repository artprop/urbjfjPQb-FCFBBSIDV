// Proyecto por defecto para animar la cara cuando no hay un film propio (por ejemplo en el celu, donde no están los .dat):
// la plantilla de Estudio BBS (un actor en steve_bends con tu skin) + las partes de la cara que se van a animar.
import { clonar } from './bbsdat.js';

const nombreBoca = (modeloBoca) => {
  const [tipo, k] = String(modeloBoca || 'Man_2').split('_');
  return { mujer: tipo === 'Woman', k: [1, 2, 4].includes(Number(k)) ? Number(k) : 2 };
};
/** Nombres de los modelos que usa el proyecto: ojos, boca de píxeles y arrugas. */
export function modelosDe(op) {
  const { mujer, k } = nombreBoca(op.modelo_boca), kw = Number(op.arrugas_escala) === 4 ? 4 : 2;
  const sexo = mujer ? 'Woman' : 'Man';
  return {
    ojos: 'player/eyes', ojosTextura: 'assets:models/player/eyes/steve.png',
    boca: `player/boca_pixel_${sexo}_x${k}`, arrugas: `player/arrugas_${sexo}_x${kw}`,
  };
}
function parte(base, modelo, textura) {
  const p = clonar(base);
  p.bone = 'head';
  p.transform = { ...(p.transform || {}), r: [0, 0, 0], s: [1, 1, 1], t: [0, 0, 0] };
  const f = p.form;
  delete f.item_stack; delete f.modelTransform;
  f.id = 'bbs:model'; f.model = modelo; f.parts = []; f.name = '';
  f.texture = [{ path: textura }];
  return p;
}
/** Film nuevo con el actor de la plantilla y las partes de cara pedidas (ojos / boca / arrugas). */
export function filmCara(plantilla, op) {
  const film = clonar(plantilla);
  const rep = film.replays[0], form = rep.form;
  const molde = (form.parts || [])[0];
  if (!molde) return film;   // sin una parte de muestra no se pueden armar las nuevas con los tipos de BBS
  const m = modelosDe(op);
  form.parts = (form.parts || []).filter((p) => !/eyes|boca|mouth|arrugas/i.test(String((p.form || {}).model || '')));
  if (op.cara_ojos) form.parts.push(parte(molde, m.ojos, m.ojosTextura));
  if (op.cara_boca) form.parts.push(parte(molde, m.boca, `assets:models/${m.boca}/textura.png`));
  if (op.cara_arrugas) form.parts.push(parte(molde, m.arrugas, `assets:models/${m.arrugas}/textura.png`));
  return film;
}
