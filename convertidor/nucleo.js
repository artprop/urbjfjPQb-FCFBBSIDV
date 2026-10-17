// Arregla los .obj que exporta Armourer's Workshop (1.20.1) para que BBS los cargue.
// Sin dependencias: se usa igual en la app y en las pruebas con node.
//
// Por qué fallan:
// - Armourer's 3.x (1.20.1) exporta en PÍXELES (un cubito = 1) en vez de bloques (un cubito = 0.0625),
//   así que en BBS el modelo sale 16 veces más grande y flotando: parece invisible.
// - Según el idioma de la PC puede escribir los números con coma ("0,3125") y BBS solo entiende el punto.
// - El .mtl que lo acompaña hace que BBS busque la textura en skins/basetexture/default.png;
//   sin .mtl, BBS usa el .png que está al lado del modelo.

const NUMERICAS = new Set(['v', 'vt', 'vn']);

// opciones.escala: 'auto' (píxeles → bloques si hace falta), o un número para multiplicar
// opciones.apoyar: centra en X/Z y lo apoya en el piso (Y mínimo = 0)
export function arreglarOBJ(texto, nombreObjeto = 'modelo', opciones = {}) {
  const { escala = 'auto', apoyar = true } = opciones;
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const salida = [];
  const info = { comas: 0, vertices: 0, uvs: 0, normales: 0, caras: 0, objetos: 0, carasRotas: 0, sinObjeto: false, mtllib: false };
  let hayObjeto = false;
  for (const linea of lineas) {
    const t = linea.trim();
    if (!t) continue;
    const partes = t.split(/\s+/);
    const tipo = partes[0];
    if (tipo === 'mtllib') { info.mtllib = true; continue; }
    if (NUMERICAS.has(tipo)) {
      const nums = partes.slice(1).map((n) => {
        if (n.includes(',')) { info.comas++; n = n.replace(/,/g, '.'); }
        if (n.startsWith('.')) n = '0' + n; else if (n.startsWith('-.')) n = '-0' + n.slice(1);
        return n;
      });
      const necesarios = tipo === 'vt' ? 2 : 3;
      while (nums.length < necesarios) nums.push('0');
      if (nums.some((n) => !isFinite(parseFloat(n)))) throw new Error('Número raro en la línea: ' + t);
      if (tipo === 'v') info.vertices++; else if (tipo === 'vt') info.uvs++; else info.normales++;
      salida.push(tipo + ' ' + nums.join(' '));
      continue;
    }
    if (tipo === 'o' || tipo === 'g') {
      if (partes.length < 2) continue;
      hayObjeto = true; info.objetos++;
      salida.push(tipo + ' ' + partes.slice(1).join('_'));
      continue;
    }
    if (tipo === 'f') {
      if (partes.length < 4) { info.carasRotas++; continue; }
      if (!hayObjeto) { salida.push('o ' + nombreObjeto); hayObjeto = true; info.objetos++; info.sinObjeto = true; }
      info.caras++;
      salida.push(t.replace(/\s+/g, ' '));
      continue;
    }
    salida.push(t);
  }
  if (!info.caras) throw new Error('El archivo no tiene caras: no parece un modelo .obj.');

  // tamaño y lugar
  const vs = [];
  salida.forEach((l, i) => { if (l.startsWith('v ')) vs.push(i); });
  const P = vs.map((i) => salida[i].split(' ').slice(1, 4).map(Number));
  const enPixeles = P.length > 0 && P.every((p) => p.every((x) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-4)) && P.some((p) => p.some((x) => Math.abs(x) >= 1));
  const k = escala === 'auto' ? (enPixeles ? 1 / 16 : 1) : +escala || 1;
  info.escala = k; info.enPixeles = enPixeles;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of P) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], p[j] * k); max[j] = Math.max(max[j], p[j] * k); }
  const mover = apoyar ? [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2] : [0, 0, 0];
  const num = (x) => { const r = Math.round(x * 1e6) / 1e6; return String(Object.is(r, -0) ? 0 : r); };
  vs.forEach((i, n) => { salida[i] = 'v ' + P[n].map((x, j) => num(x * k + mover[j])).join(' '); });
  info.tamano = [0, 1, 2].map((j) => Math.round((max[j] - min[j]) * 1000) / 1000);
  info.movido = mover.some((x) => Math.abs(x) > 1e-6);
  return { texto: salida.join('\n') + '\n', info };
}

// Nombre de carpeta/archivo que BBS acepta sin problemas
export function nombreLimpio(n) {
  return (n || 'modelo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'modelo';
}
