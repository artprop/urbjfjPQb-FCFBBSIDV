// Pestaña "Vista 3D": el muñeco de bloques + el video de la toma, con una sola linea de tiempo.
import { Escena, TICKS_POR_S } from './escena3d.js';
import { cargarModeloDedos } from './dedos3d.js';

const $ = (s) => document.querySelector(s);
const fmt = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const NOMBRES = { right_leg: 'pierna derecha', right_knee: 'rodilla derecha', left_leg: 'pierna izquierda', left_knee: 'rodilla izquierda',
  right_arm: 'brazo derecho', left_arm: 'brazo izquierdo', right_elbow: 'codo derecho', left_elbow: 'codo izquierdo',
  head: 'cabeza', low_body: 'torso', anchor: 'giro del cuerpo' };

export function crearVista(ctx) {
  // ctx: { api, post, tomas(), tomaSel(), elegirToma(n), films(), convertir(), modo(), estilo(), cfg(), poses() }
  let skinGuardada = null, posOjosPorSkin = () => {};
  let escena = null, datos = null, activa = false, modoVista = 'cuerpo';
  let tick = 0, max = 1, playing = false, velocidad = 1, repetir = false, ult = 0, raf = 0;
  const video = $('#v3-video');

  function mensaje(t) { $('#v3-msg').textContent = t; $('#v3-msg').hidden = !t; }

  function mostrar(si) {
    activa = si;
    $('#vista3d').hidden = !si;
    document.querySelector('main.layout').hidden = si;
    document.querySelectorAll('.vistas button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === (si ? '3d' : 'grabar'))));
    if (si) {
      if (!escena) {
        try { escena = new Escena($('#v3-escena')); }
        catch (e) { mensaje('Este navegador no pudo iniciar el 3D: ' + e.message); return; }
        const sg = skinGuardada && skinGuardada();
        if (sg) escena.ponerSkin(sg).catch(() => {});   // la skin que el usuario eligio la ultima vez
        posOjosPorSkin();
      }
      poblarTomas();
      poblarFilms();
      poblarPoses();
      cargar();
      requestAnimationFrame(() => escena && escena.ajustar());
    } else pausar();
  }

  // modelo del muñeco: "El del film" usa alex_bends si el actor lo usa, y steve_bends en cualquier otro caso
  function modeloElegido() {
    const v = $('#v3-modelo').value;
    if (v !== 'auto') return v;
    const m = (datos && datos.modelo) || '';
    return /emoticons/.test(m) ? 'emoticons_steve' : /alex_bends$/.test(m) ? 'alex_bends' : 'steve_bends';
  }

  function poblarPoses() {
    const sel = $('#v3-pose'), prev = sel.value;
    sel.innerHTML = '<option value="">(ninguna: sigue la animación)</option>' + (ctx.poses ? ctx.poses() : []).map((n) => `<option>${esc(n)}</option>`).join('');
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  function poblarTomas() {
    const conv = ctx.tomas().filter((t) => t.convertida);
    const sel = $('#v3-toma');
    sel.innerHTML = conv.length
      ? conv.map((t) => `<option value="${esc(t.nombre)}">${esc(t.nombre.replace(/\.[^.]+$/, ''))}</option>`).join('')
      : '<option value="">(ninguna convertida)</option>';
    const actual = ctx.tomaSel();
    if (conv.find((t) => t.nombre === actual)) sel.value = actual;
    else if (conv.length) ctx.elegirToma(sel.value);
  }

  function poblarFilms() {
    const sel = $('#v3-film'), prev = sel.value;
    sel.innerHTML = '<option value="">El de la toma</option>' + ctx.films().map((f) => `<option>${esc(f)}</option>`).join('');
    if (ctx.films().includes(prev)) sel.value = prev;
  }

  async function poblarActores() {
    const sel = $('#v3-actor'), film = $('#v3-film').value;
    if (!film) { sel.innerHTML = '<option value="">El de la toma</option>'; sel.disabled = true; return; }
    try {
      const acts = await ctx.api('/api/actores?film=' + encodeURIComponent(film));
      sel.innerHTML = acts.map((a) => `<option value="${a.indice}">${esc(a.nombre)}</option>`).join(''); sel.disabled = acts.length < 2;
    } catch (e) { sel.innerHTML = '<option value="0">0</option>'; sel.disabled = true; }
  }

  async function cargar() {
    pausar();
    const toma = $('#v3-toma').value, film = $('#v3-film').value;
    if (!toma && !film) { datos = null; mensaje('Todavía no convertiste ninguna toma. Convertí una en la pestaña "Grabar y convertir" y volvé acá.'); limpiar(); return; }
    mensaje('Cargando…');
    try {
      const q = new URLSearchParams({ toma, film });
      if (film) q.set('actor', $('#v3-actor').value || '0');
      datos = await ctx.api('/api/animacion?' + q);
    } catch (e) { datos = null; mensaje(e.message); limpiar(); return; }
    max = Math.max(1, Math.ceil(datos.ticks));
    escena.cuerpoQuieto = !!(ctx.modo && ctx.modo() === 'cara');
    escena.ponerModelo(modeloElegido());
    escena.ponerBoca(datos.boca);
    escena.ponerAnimacion(datos.huesos, datos.cara, $('#v3-ojos').value);
    // manos con dedos (si el actor las tiene): se cargan sus modelos y se cuelgan de las manos del muñeco
    escena.ponerDedos(null);
    if (datos.dedos) {
      const pedido = datos;
      Promise.all(Object.entries(datos.dedos).map(async ([l, d]) => [l, { ...d, datos: await cargarModeloDedos(d.modelo, l) }]))
        .then((manos) => { if (datos === pedido) { escena.ponerDedos(Object.fromEntries(manos)); escena.verManosAlto(ctx.modo && ctx.modo() === 'dedos' && $('#v3-manos-alto').checked); } })
        .catch((e) => console.warn('dedos:', e));
    }
    if (ctx.modo && ctx.modo() !== modoVista) {   // al cambiar entre cuerpo y cara, la camara se acomoda sola
      modoVista = ctx.modo(); escena.vista(modoVista === 'cara' ? 'cara' : 'frente');
    }
    const t = $('#v3-t'); t.max = max; t.value = 0;
    $('#v3-marcas').innerHTML = poseClave().map((k) => `<i style="left:${(k / max) * 100}%"></i>`).join('');
    const alias = { right_elbow: 'low_right_arm', left_elbow: 'low_left_arm', right_knee: 'low_leg_right', left_knee: 'low_left_leg' };   // nombres en emoticons/steve
    const faltan = Object.keys(NOMBRES).filter((b) => !datos.huesos[b] && !datos.huesos[alias[b]] && b !== 'anchor').map((b) => NOMBRES[b]);
    const av = [];
    if (datos.modelo && !/(steve|alex)_bends$|emoticons\/steve/.test(datos.modelo)) av.push(`El actor usa el modelo "${datos.modelo}"; el muñeco es un steve_bends (podés cambiarlo en "Modelo").`);
    if (faltan.length) av.push(`Sin animación en el film: ${faltan.join(', ')}.`);
    $('#v3-aviso').textContent = av.join(' ');
    mensaje('');
    if (datos.video) {
      $('#v3-sin-video').hidden = true; video.hidden = false;
      const src = await ctx.urlToma(datos.video);
      if (video.src !== src) {
        video.src = src;
        // los WebM del navegador no traen la duracion: hay que forzarla para poder saltar a cualquier punto
        video.onloadedmetadata = () => {
          if (!isFinite(video.duration)) {
            video.currentTime = 1e101;
            video.ontimeupdate = () => { video.ontimeupdate = null; video.currentTime = 0; irA(0); };
          }
        };
      }
    } else { video.hidden = true; $('#v3-sin-video').hidden = false; }
    irA(0);
    cargarManual();
  }

  function limpiar() { $('#v3-marcas').innerHTML = ''; $('#v3-aviso').textContent = ''; video.hidden = true; $('#v3-sin-video').hidden = true; if (escena) escena.ponerAnimacion(null); }

  function poseClave() {
    const s = new Set();
    Object.values(datos.huesos).forEach((kfs) => kfs.forEach((k) => s.add(Math.round(k.t))));
    return [...s].sort((a, b) => a - b);
  }

  /* ---------- poses a mano (estilo "A mano") ---------- */
  let manual = { poses: [], disposicion: [] }, manualTimer = null;
  const esManual = () => !!(ctx.estilo && ctx.estilo() === 'manual' && !(ctx.modo && ctx.modo() === 'cara'));
  const desdeTick = () => (datos ? datos.desde || 0 : 0);

  async function cargarManual() {
    const toma = $('#v3-toma').value;
    if (!esManual() || !toma) { manual = { poses: [], disposicion: [] }; return pintarManual(); }
    try { manual = await ctx.api('/api/manual?toma=' + encodeURIComponent(toma)); } catch (e) { manual = { poses: [], disposicion: [] }; }
    pintarManual();
  }
  function guardarManual() {   // se guarda solo, un instante despues del ultimo cambio
    clearTimeout(manualTimer);
    manualTimer = setTimeout(async () => {
      try { manual = await ctx.post('/api/manual', { toma: $('#v3-toma').value, poses: manual.poses }); pintarManual(true); }
      catch (e) { $('#v3-aviso').textContent = e.message; }
    }, 300);
  }
  function marcarFotograma() {
    if (!datos || !$('#v3-toma').value) return;
    const c = ctx.cfg();
    const t = Math.max(0, (tick - desdeTick()) / TICKS_POR_S);
    manual.poses.push({ t: Math.round(t * 1000) / 1000, sostener: c.manual_sostener, antes: c.manual_antes, despues: c.manual_despues, unir: false });
    manual.poses.sort((a, b) => a.t - b.t);
    manual.disposicion = [];
    pintarManual(true); guardarManual();
  }
  function pintarManual(soloLista = false) {
    const on = esManual();
    $('#v3-manual').hidden = !on;
    $('#v3-linea').classList.toggle('con-rojas', on);
    if (!on) { $('#v3-rojas').innerHTML = ''; return; }
    const lista = $('#v3-manual-lista');
    if (!soloLista || lista.children.length !== manual.poses.length) {
      lista.innerHTML = manual.poses.length ? manual.poses.map((p, i) => `<li data-i="${i}">
        <button type="button" class="chip-btn ir" title="Ir a este fotograma">Pose ${i + 1} · ${fmt(p.t)} s</button>
        <label>Duración <input type="number" min="1" max="200" data-k="sostener" value="${p.sostener}"> ticks</label>
        <label>Antes <input type="number" min="1" max="200" data-k="antes" value="${p.antes}"></label>
        <label>Después <input type="number" min="1" max="200" data-k="despues" value="${p.despues}"></label>
        <label class="check"><input type="checkbox" data-k="unir" ${p.unir ? 'checked' : ''} ${i === manual.poses.length - 1 ? 'disabled' : ''}> Unir con la siguiente (sin pasar por la pose por defecto)</label>
        <button type="button" class="chip-btn quitar">Quitar</button></li>`).join('')
        : '<li>Todavía no marcaste ningún fotograma.</li>';
    }
    // cinta roja: cada pose = dos puntas unidas por una cinta; circulos grises = pose por defecto
    const pct = (tk) => `${(Math.max(0, Math.min(max, tk + desdeTick())) / max) * 100}%`;
    const ancho = (a, b) => `${(Math.max(0, b - a) / max) * 100}%`;
    const d = manual.disposicion || [];
    $('#v3-rojas').innerHTML = d.map((p, i) => {
      let h = `<span class="cinta" style="left:${pct(p.A)};width:${ancho(p.A, p.B)}"></span>`;
      if (p.ext_antes != null) h += `<span class="hilo" style="left:${pct(p.ext_antes)};width:${ancho(p.ext_antes, p.A)}"></span><span class="ext" style="left:${pct(p.ext_antes)}" title="Pose por defecto"></span>`;
      if (p.ext_despues != null) h += `<span class="hilo" style="left:${pct(p.B)};width:${ancho(p.B, p.ext_despues)}"></span><span class="ext" style="left:${pct(p.ext_despues)}" title="Pose por defecto"></span>`;
      if (p.unir && d[i + 1]) h += `<span class="union" style="left:${pct(p.B)};width:${ancho(p.B, d[i + 1].A)}" title="Unidas: no pasan por la pose por defecto"></span>`;
      return h + `<button type="button" class="punta" data-tick="${p.A}" style="left:${pct(p.A)}" title="Pose ${i + 1}"></button><button type="button" class="punta" data-tick="${p.B}" style="left:${pct(p.B)}" title="Pose ${i + 1}"></button>`;
    }).join('');
  }
  function enlazarManual() {
    $('#v3-manual-marcar').addEventListener('click', marcarFotograma);
    $('#v3-rojas').addEventListener('click', (e) => { const b = e.target.closest('.punta'); if (b) { pausar(); irA(Number(b.dataset.tick) + desdeTick()); } });
    const lista = $('#v3-manual-lista');
    lista.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]'); if (!li) return;
      const i = Number(li.dataset.i);
      if (e.target.closest('.quitar')) { manual.poses.splice(i, 1); manual.disposicion = []; pintarManual(); guardarManual(); }
      else if (e.target.closest('.ir')) { pausar(); irA(Math.round(manual.poses[i].t * TICKS_POR_S) + desdeTick()); }
    });
    lista.addEventListener('change', (e) => {
      const li = e.target.closest('li[data-i]'); if (!li || !e.target.dataset.k) return;
      const p = manual.poses[Number(li.dataset.i)], k = e.target.dataset.k;
      p[k] = k === 'unir' ? e.target.checked : Math.max(1, Math.round(Number(e.target.value) || 1));
      pintarManual(true); guardarManual();
    });
  }

  function tiempoVideo() { return (tick - (datos ? datos.desde : 0)) / TICKS_POR_S; }

  function irA(t, desdeVideo = false) {
    tick = Math.max(0, Math.min(max, t));
    if (escena) escena.ir(tick);
    $('#v3-t').value = tick;
    $('#v3-lectura').textContent = `${fmt(tick / TICKS_POR_S)} s · tick ${Math.round(tick)}`;
    if (!desdeVideo && datos && datos.video && video.readyState >= 1) {
      const tv = Math.max(0, tiempoVideo());
      if (Math.abs(video.currentTime - tv) > (playing ? 0.3 : 0.02)) video.currentTime = tv;
    }
  }

  function reproducir() {
    if (!datos) return;
    if (tick >= max) irA(0);
    playing = true; ult = 0; $('#v3-play').textContent = 'Pausar';
    if (datos.video) { video.playbackRate = velocidad; if (tiempoVideo() >= 0) video.play().catch(() => {}); }
    raf = requestAnimationFrame(bucle);
  }
  function pausar() {
    playing = false; cancelAnimationFrame(raf); $('#v3-play').textContent = 'Reproducir';
    video.pause();
  }
  function alternar() { playing ? pausar() : reproducir(); }

  function bucle(ts) {
    if (!playing) return;
    if (ult) {
      // mientras el video anda, el video marca la hora (asi muñeco y video nunca se desfasan)
      const manda = datos.video && !video.paused && !video.ended && video.readyState >= 3;
      if (manda) tick = video.currentTime * TICKS_POR_S + datos.desde;
      else tick += ((ts - ult) / 1000) * TICKS_POR_S * velocidad;
      if (tick >= max) {
        if (repetir) { irA(0); if (datos.video) video.play().catch(() => {}); }
        else { irA(max); pausar(); return; }
      } else {
        irA(tick, manda);
        if (datos.video && video.paused && !video.ended && tiempoVideo() >= 0) video.play().catch(() => {});
      }
    }
    ult = ts; raf = requestAnimationFrame(bucle);
  }

  function saltarPose(dir) {
    if (!datos) return;
    pausar();
    const k = poseClave();
    const destino = dir > 0 ? k.find((x) => x > tick + 0.5) : [...k].reverse().find((x) => x < tick - 0.5);
    irA(destino ?? (dir > 0 ? max : 0));
  }

  function enlazar() {
    document.querySelectorAll('.vistas button').forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.vista === '3d')));
    $('#v3-play').addEventListener('click', alternar);
    $('#v3-ant').addEventListener('click', () => saltarPose(-1));
    $('#v3-sig').addEventListener('click', () => saltarPose(1));
    $('#v3-t').addEventListener('input', (e) => { pausar(); irA(Number(e.target.value)); });
    $('#v3-toma').addEventListener('change', (e) => { ctx.elegirToma(e.target.value); $('#v3-film').value = ''; poblarActores(); cargar(); });
    $('#v3-film').addEventListener('change', async () => { await poblarActores(); cargar(); });
    $('#v3-actor').addEventListener('change', cargar);
    try { const g = localStorage.getItem('ojos3d'); if (g && [...$('#v3-ojos').options].some((o) => o.value === g)) $('#v3-ojos').value = g; } catch (e) { /* sin memoria del navegador: queda en automatico */ }
    $('#v3-ojos').addEventListener('change', (e) => {
      try { localStorage.setItem('ojos3d', e.target.value); } catch (err) { /* idem */ }
      if (escena) escena.usarOjos(e.target.value);
    });
    $('#v3-rehacer').addEventListener('click', () => ctx.convertir());
    try { const m = localStorage.getItem('modelo3d'); if (m && [...$('#v3-modelo').options].some((o) => o.value === m)) $('#v3-modelo').value = m; } catch (e) { /* queda en automatico */ }
    $('#v3-modelo').addEventListener('change', (e) => {
      try { localStorage.setItem('modelo3d', e.target.value); } catch (err) { /* idem */ }
      if (escena) escena.ponerModelo(modeloElegido());
    });
    // skin del muñeco (se recuerda en el navegador; la de por defecto es la del usuario)
    const aviso = (t) => { $('#v3-aviso').textContent = t; };
    const leerSkin = (url, guardar) => {
      if (!escena) return Promise.resolve();
      return escena.ponerSkin(url).then(() => { aviso(''); dispatchEvent(new Event('skin-cambiada')); if (guardar !== undefined) { try { guardar ? localStorage.setItem('skin3d', url) : localStorage.removeItem('skin3d'); } catch (e) { /* sin memoria del navegador */ } } })
        .catch((e) => aviso(e.message));
    };
    $('#v3-skin-elegir').addEventListener('click', () => $('#v3-skin-archivo').click());
    $('#v3-skin-archivo').addEventListener('change', (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const lector = new FileReader();
      lector.onload = () => leerSkin(lector.result, true).then(posOjosPorSkin);
      lector.readAsDataURL(f);
    });
    $('#v3-skin-defecto').addEventListener('click', () => leerSkin('./skin_default.png', false).then(posOjosPorSkin));
    // posicion de los ojos en la vista previa: se recuerda por separado para la skin por defecto y para la propia
    const claveOjos = () => (skinGuardada() ? 'propia' : 'defecto');
    const leerPosOjos = () => { try { return JSON.parse(localStorage.getItem('ojospos_' + claveOjos())) || [0, 0]; } catch (e) { return [0, 0]; } };
    const aplicarPosOjos = (x, y, guardar = true) => {
      $('#v3-ojos-x').value = x; $('#v3-ojos-y').value = y;
      $('#v3-ojos-pos').textContent = `${fmt(x, 2)} / ${fmt(y, 2)} px`;
      if (escena) escena.moverOjos(x, y);
      if (guardar) { try { localStorage.setItem('ojospos_' + claveOjos(), JSON.stringify([x, y])); } catch (e) { /* sin memoria del navegador */ } }
    };
    posOjosPorSkin = () => { const [x, y] = leerPosOjos(); aplicarPosOjos(x, y, false); };
    const cambioOjos = () => aplicarPosOjos(Number($('#v3-ojos-x').value), Number($('#v3-ojos-y').value));
    $('#v3-ojos-x').addEventListener('input', cambioOjos); $('#v3-ojos-y').addEventListener('input', cambioOjos);
    $('#v3-ojos-reset').addEventListener('click', () => aplicarPosOjos(0, 0));
    skinGuardada = () => { try { return localStorage.getItem('skin3d'); } catch (e) { return null; } };
    // poses prefabricadas: ver una en el muñeco sin convertir nada
    $('#v3-pose').addEventListener('change', async (e) => {
      if (!escena) return;
      if (!e.target.value) { escena.verPose(null); aviso(''); return; }
      pausar();
      try { const d = await ctx.api('/api/pose?nombre=' + encodeURIComponent(e.target.value) + '&modelo=' + escena.nombreModelo); escena.verPose(d.huesos); aviso(''); }
      catch (err) { aviso(err.message); }
    });
    document.querySelectorAll('#v3-vel button').forEach((b) => b.addEventListener('click', () => {
      velocidad = Number(b.dataset.v);
      document.querySelectorAll('#v3-vel button').forEach((x) => x.classList.toggle('on', x === b));
      video.playbackRate = velocidad;
    }));
    $('#v3-repetir').addEventListener('change', (e) => (repetir = e.target.checked));
    $('#v3-manos-alto').addEventListener('change', (e) => escena && escena.verManosAlto(e.target.checked && ctx.modo && ctx.modo() === 'dedos'));
    $('#v3-ejes').addEventListener('change', (e) => escena && escena.mostrarEjes(e.target.checked));
    document.querySelectorAll('#v3-camara button').forEach((b) => b.addEventListener('click', () => escena && escena.vista(b.dataset.c)));
  }
  enlazar();
  enlazarManual();

  return {
    alCambiarEstilo: () => { if (activa) cargarManual(); },
    abrir: () => mostrar(true),
    activa: () => activa,
    alternar,
    // la conversion termino: si se esta mirando la vista 3D, mostrar el resultado nuevo
    alTerminar: () => { if (activa) { poblarTomas(); cargar(); } },
    ocupado: (si) => { const b = $('#v3-rehacer'); b.disabled = si; b.textContent = si ? 'Convirtiendo…' : 'Convertir de nuevo'; },
  };
}
