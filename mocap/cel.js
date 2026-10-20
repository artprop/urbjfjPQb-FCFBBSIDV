// Celular (pantalla angosta): en vez de una pagina larga, una barra de pestañas abajo (Cámara, Tomas, Ajustes, Guardar, Vista 3D).
// Se ve un solo panel a la vez; los paneles son los mismos de la version de PC (data-panel), asi que nada se duplica.
const $ = (s) => document.querySelector(s);
const mq = matchMedia('(max-width: 700px)');
let tab = 'cam';

// el estilo (Minecraft / Realista / A mano) y el resultado viven en otros lugares en la compu; en el celu se mudan al panel donde se usan
const mudables = [['.modo', '#estilo-lugar'], ['.salida', '#salida-lugar']].map(([que, dest]) => {
  const el = document.querySelector(que);
  return { el, dest, padre: el.parentNode, sig: el.nextSibling };
});

function ponerTab(t, abrirVista = true) {
  tab = t;
  document.body.dataset.tab = t;
  document.querySelectorAll('#barra-cel button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  if (abrirVista) {   // la barra de arriba (Grabar y convertir / Vista 3D) sigue siendo la que cambia de pantalla
    const quiere = t === '3d' ? '3d' : 'grabar';
    const b = document.querySelector(`.vistas button[data-vista="${quiere}"]`);
    if (b && b.getAttribute('aria-selected') !== 'true') b.click();
  }
  window.scrollTo(0, 0);
}

function aplicar() {
  const cel = mq.matches;
  document.body.classList.toggle('cel', cel);
  for (const m of mudables) {
    if (cel) $(m.dest).append(m.el);
    else m.padre.insertBefore(m.el, m.sig && m.sig.parentNode === m.padre ? m.sig : null);
  }
  const d = $('#vivo-panel');
  if (d && cel && !d.dataset.visto) { d.open = false; d.dataset.visto = '1'; }   // en el celu las opciones arrancan cerradas
  if (cel) ponerTab(tab, false); else delete document.body.dataset.tab;
}

export function iniciarCel() {
  $('#barra-cel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ponerTab(b.dataset.tab); });
  // si la pantalla cambia sola (por ejemplo, despues de convertir) la barra lo acompaña
  new MutationObserver(() => {
    const en3d = !$('#vista3d').hidden;
    if (mq.matches && en3d !== (tab === '3d')) ponerTab(en3d ? '3d' : 'cam', false);
  }).observe($('#vista3d'), { attributes: true, attributeFilter: ['hidden'] });
  // los textos de ayuda largos se ven en una linea; un toque los abre
  document.addEventListener('click', (e) => { const a = e.target.closest('.cel .campo .ayuda, body[data-ptab] .campo .ayuda'); if (a) a.classList.toggle('abierta'); });
  mq.addEventListener('change', aplicar);
  aplicar();
}
export const verTab = ponerTab;
