// Lo que cambia entre PC y celu, en un solo lugar para todos los modos.
// PC = abierto con abrir.bat (servir.py contesta /pc/hola). Celu/APK o página suelta = sin eso.

let _pc = null;
export async function infoPC() {
  if (_pc) return _pc;
  _pc = fetch(new URL('/pc/hola', location.href)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((d) => d || { pc: false, rhubarb: false });
  return _pc;
}
export const esPC = async () => (await infoPC()).pc;
export const hayRhubarb = async () => (await infoPC()).rhubarb;

// Guardar un resultado. PC: va a EstudioBBS\Salida\<modo>\<nombre>. Celu: se descarga o se comparte.
// Devuelve un texto para mostrarle al usuario dónde quedó.
// carpeta (opcional): subcarpeta dentro de Salida\<modo> (solo PC)
export async function guardarSalida(modo, nombre, datos, tipo = 'application/octet-stream', carpeta = '') {
  const blob = datos instanceof Blob ? datos : new Blob([datos], { type: tipo });
  if (await esPC()) {
    const sub = carpeta ? `&carpeta=${encodeURIComponent(carpeta)}` : '';
    const r = await fetch(new URL(`/pc/guardar?modo=${encodeURIComponent(modo)}&nombre=${encodeURIComponent(nombre)}${sub}`, location.href), { method: 'POST', body: blob });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || 'No se pudo guardar.');
    return 'Guardado en ' + d.ruta;
  }
  const archivo = new File([blob], nombre, { type: blob.type || tipo });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return 'Compartido: ' + nombre; } catch (e) { if (e.name === 'AbortError') return 'Cancelado.'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'Descargado: ' + nombre;
}

// Abre la carpeta de Salida en el explorador (solo PC). Con modo / carpeta abre esa subcarpeta; con nombre, la carpeta con ese archivo elegido.
export async function abrirCarpetaSalida(modo = '', nombre = '', carpeta = '') {
  if (!(await esPC())) return;
  if (typeof modo !== 'string') modo = nombre = carpeta = '';   // llamada desde un botón (el evento llega como primer argumento)
  const q = new URLSearchParams();
  if (modo) q.set('modo', modo);
  if (nombre) q.set('nombre', nombre);
  if (carpeta) q.set('carpeta', carpeta);
  await fetch(new URL('/pc/abrir_salida?' + q, location.href)).catch(() => {});
}

// Bocas exactas (solo PC): manda un .wav y devuelve el JSON de Rhubarb { mouthCues: [{start, end, value}] }
export async function rhubarb(wavBytes) {
  if (!(await hayRhubarb())) throw new Error('Las bocas exactas solo están en la PC.');
  const r = await fetch(new URL('/pc/rhubarb', location.href), { method: 'POST', body: wavBytes });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || 'Rhubarb falló.');
  return d;
}

// Avisarle al menú (si el modo está adentro de Estudio BBS) que ponga un título
export function avisarMenu(datos) {
  try { if (window.parent !== window) window.parent.postMessage({ estudio: true, ...datos }, location.origin); } catch { /* suelto */ }
}
