# Estudio BBS — documento de traspaso (al 20/10/2026, versión v.026)

Para quien siga este trabajo (otra sesión de Claude o una persona). Leelo entero antes de tocar nada.

## 1. Quién es el usuario y cómo hay que tratarlo
- **Francisco** (no programador, español rioplatense). Quiere lenguaje simple, sin jerga, y **honestidad sobre qué se probó y qué no**.
- Usa herramientas para el mod de Minecraft **BBS** (films `.dat`, modelos, poses). Trabaja en PC y celular.
- **Protocolo de trabajo (importante):**
  - Cuando dice **«anotá»** o lista cosas: solo las anota y muestra una **lista numerada**; no las hace hasta que dé la señal («hacelo», «inicia», «haz todo lo que quedó»).
  - Cuando dice «hacé eso», se hace todo junto, en **una sola versión**.
  - En cada respuesta final: qué se hizo, **qué NO se probó**, y la lista actualizada.
- **Subir el número de versión en cada actualización**, por mínima que sea: etiqueta `Estudio BBS <small>v.0NN - …` en `index.html` (raíz). Última: **v.026**; la próxima es **v.027**.
- La carpeta de Minecraft del usuario es **solo lectura**: nunca se escribe en ella.
- **No publicar** el código de «Move con webcam» (se descartó). Lo de PS Move es solo Bluetooth/WebHID.

## 2. Flujo de Git (obligatorio)
- Se trabaja en la rama `ccr-70c0962a-mtkhx7` y se publica en `main` (GitHub Pages) con **PR + squash merge** (el usuario lo autorizó cada vez).
- Después del merge: `git fetch origin main && git checkout -B ccr-70c0962a-mtkhx7 origin/main && git push -f origin ccr-70c0962a-mtkhx7` (deja la rama igual a main; lo exige el hook de «commit sin pushear»).
- Commits terminan con las líneas de atribución (Co-Authored-By + Claude-Session) y los PR con «🤖 Generated with Claude Code» + URL de sesión (ver el recordatorio de atribución vigente).
- El repo es `artprop/urbjfjPQb-FCFBBSIDV`. **No crear PR si no lo piden**; en este proyecto lo piden siempre al publicar.
- **Nunca** usar `pkill -f <patrón>` ni `ps | grep … | xargs kill` con un patrón que aparezca en el comando mismo: mata la shell (pasó 3 veces). Usar PIDs.

## 3. Cómo llega el programa al usuario
- **Celular/web:** carga de GitHub Pages. El service worker `sw.js` (network-first) hace que se actualice solo.
- **PC:** el usuario tiene `CLAUDIO\EstudioBBS\` con `servir.py` + carpeta `www`. **Ya no hace falta `actualizar.bat`:** el usuario confirmó (20/10/2026) que `abrir.bat` actualiza todo solo al abrir (lo hace `servir.py`). `pc/actualizar.bat` queda como respaldo viejo (trae `main` y lo copia a `www`); no se lo recomiende al usuario. `pc/servir.py` (v.016) **se actualiza solo desde GitHub al abrir** (tecla = saltear, modo sin internet con `sin_internet.txt`, nunca deja copia a medias) y **cierra la caja negra al cerrar la ventana**. **Falta confirmar que el usuario reemplazó su `servir.py` viejo por el de `pc/servir.py`.**
- En la PC la app corre con `servir.py` (agrega `/pc/guardar`, `/pc/rhubarb`, `/pc/latido`, `/pc/adios`); en la PC el service worker se desregistra (se tragaba el aviso de cierre).

## 4. Estructura (JS puro con módulos ES, sin build)
Raíz `index.html` = menú + un `iframe` por modo (`visor`, `randomizer`, `mocap`, `director`, `editor`, `convertidor`, `ojos`).
- `visor/` Visor 3D de forms/modelos/texturas de BBS (three.js). `visor/builtin/` trae modelos del mod (`index.json`).
- `randomizer/` armado al azar de personajes de fondo: prefabs, grupos de capas, **segmentos «O»**, condiciones entre grupos, «ninguno», visor 3D de cada textura, orden de grupos con asa ☰.
- `mocap/` video → film de BBS: cuerpo (MediaPipe pose), cara (ojos + boca), PS Move (WebHID), importar animaciones FBX/GLB/BVH, simulación en vivo, muecas, arrugas.
  - `nucleo/` lógica pura (probable en node): `boca_pixel.js`, `muecas.js`, `arrugas.js`, `ojos*.js`, `psmove.js`, `emoticons.js`, `retarget.js`, `mocap.js`, `proyecto_defecto.js`…
  - `local/` lo que depende del navegador: `servidor.js` (falso «servidor» en el navegador, guarda en IndexedDB), `deteccion.js` (MediaPipe), `psmove_hub.js`.
- `director/` guion de escena, capas automáticas, mundo; `director/nucleo/camaras_auto.js` = **cámaras automáticas con reglas de composición**.
- `editor/` editor tipo BBS (actores, poses, cámaras, presets, film). **Pestaña «🎬 Director»** (`editor/director.js`): guion de escena armado directo sobre la escena + cámaras automáticas + capas automáticas (parpadeos, boca con audio).
- `convertidor/` «Armourer's → BBS»: arregla los `.obj` de Armourer's Workshop (píxeles→bloques, comas→puntos, sin `.mtl`, centrado en el piso) y guarda `Salida\convertidor\<Nombre>\`. Usa `comun/plataforma.js`. Su tarjeta del menú faltaba; se agregó en v.023. No probado con un `.obj` real ni dentro de BBS.
- `ojos/` **«Ojos para BBS»** (v.025): se suelta la skin y arma un paquete de ojos para BBS (modelo `.bbs.json` + `textura.png` + `poses.json` de 20 poses + `config.json`, en `assets/models/player/<nombre>/`). `nucleo.js` (puro, probable en node): `detectarOjos` (busca en la cara 8×8 de la skin cada ojo: caja del ojo, pupila/iris y ceja; sirve para ojos de 1 punto, saltones 3×3, con iris, etc.), `generar` (geometría paramétrica copiada de la lógica del modelo original, textura que copia los píxeles de la propia skin, animación de las pupilas y poses), `dibujarFrente` (vista previa 2D). Las poses salen de las 20 del modelo original `eyes` (2 px de alto) escaladas por reglas según el alto del ojo y el lugar de la pupila; `closed` se calcula exacto. Mapa: columna c de la cara -> x desde 3-c hasta 4-c; fila f -> y desde 7-f hasta 8-f (el ojo de la izquierda de la imagen es `eye_r`). Con el ojo de 1 px de alto reproduce la geometría de `eyes_1px` y 78 de 89 valores de pose coinciden (±0,3). La vista previa coincide píxel a píxel con el cargador 3D del Visor (probado en reposo). **No probado dentro de BBS.** No lo usa todavía el Mocap de la cara (que solo conoce `eyes` y `eyes_1px`).
- `pc/` `servir.py` (se actualiza solo al abrir con `abrir.bat`) y `actualizar.bat` (obsoleto).

## 5. Lo hecho (resumen por versión)
v.005–v.014: sincronía PC↔GitHub, versión visible, actualización sin borrar caché, Mocap en vivo (ojos/boca/dientes/labios/skin), pestañas de celular, apagar cámara, botón de carpeta en celular, PS Move por Bluetooth.
v.015: Randomizer con candidatos en visor 3D, segmentos, condiciones, «ninguno».
v.016: visor 3D en «Elegí capas candidatas», asa ☰, carga de modelos antes de dibujar, `servir.py` nuevo (se cierra y se actualiza solo).
v.017: **muecas de referencia** (25 gestos, editor de píxeles, presets, «Mi gesto», reconocimiento en vivo y al convertir), arrugas, corrección de la mirada vertical.
v.018: Editor con pestaña Director + cámaras automáticas.
v.019: arrugas dentro del segmento de la boca (escala propia x2/x4, nunca x1) en vivo y al convertir; **paquete de modelos de la cara** (`boca_pixel_*`, `arrugas_*`) descargable; **proyecto por defecto** (steve_bends + skin de la plantilla + ojos/boca/arrugas) para animar la cara sin film propio (celular); retoques en la Vista 3D; selectores de archivo sin filtro de extensión (celu).
v.020: interfaz de Mocap en PC con pestañas Toma/Ajustes/Guardar; **simulación en vivo** al lado de la cámara (muñeco steve_bends/emoticons o esqueleto, con los Move en las manos); guía de Move; Editor: parpadeos y boca con audio.
v.022: Convertidor «Armourer's → BBS» (modo nuevo).
v.023: tarjeta del convertidor en el menú (faltaba).
v.024: **mano de emoticons** (punta del brazo `low_*_arm.end`): el lector `.bobj` del Visor/Editor ahora conserva huesos y pesos de piel (malla con esqueleto), el Editor deja posar brazo, antebrazo y mano (también tocándola en la escena), y el Mocap anima la mano con el meñique y el índice de MediaPipe (solo con emoticons; giro mínimo con tope de ~75°, sin torsión).
v.025: modo **Ojos** (ver arriba).
v.021: estilo de boca **«línea fina, tono de piel»** (copiado de la animación de referencia del usuario) y arrugas de trompa.

## 6. Cosas que hay que saber (decisiones y trampas)
- **Izquierda/derecha:** en muecas y arrugas, «izquierda» es la de la **persona** (MediaPipe `mouthLeft`, `mouthSmileLeft`); en la cara dibujada de frente cae a la derecha. La arruga sale del lado al que va la boca.
- **Boca de píxeles:** grilla de `6·k` columnas × `filas·k` filas (hombre 2 filas, mujer 1); `k` = x1/x2/x4. La base de las muecas es x4 y se baja a x2/x1. Las arrugas tienen **escala propia** (2 o 4), independiente de la de la boca, y viven solo en los 6×2 (o 6×1) píxeles de la boca.
- **Modelos de BBS que hay que instalar a mano:** `boca_pixel_*` y `arrugas_*` (botón «⬇ Modelos de la cara para BBS (.zip)»). Las arrugas son un negro translúcido por `color` del hueso. **Nunca probado dentro de BBS.**
- **Skin del proyecto por defecto:** la de `mocap/datos/plantilla.dat` = `assets:models/player/_LosSaucera/001FranSauce.png`.
- **emoticons/steve:** el cuerpo (cámara y Move) se convierte a su rig (`nucleo/emoticons.js` + `datos/emoticons_steve.armadura.json`). **La mano es el hueso `low_*_arm.end`** (punta del antebrazo, con vértices propios). Resuelto en v.024 (Editor y Mocap). El Editor solo usa el giro de cada hueso del `.bobj` (no mueve ni escala partes). Nada probado dentro de BBS ni con la cámara real. Para otro modelo de la línea emoticons hace falta su armadura (huesos/ejes): hoy está fija para `emoticons/steve`.
- **Nutria de dedsafio:** se convirtió el modelo del `.jar` a `.bbs.json` y se le entregó al usuario (zip). No está en la app (pidió dejarla así).
- **No publicar fotos con copyright** (se descartó la foto stock de muecas; los dibujos de referencia son propios).
- La Vista 3D del Mocap **no dibuja** arrugas ni los ojos de emoticons; solo la vista en vivo y el film lo hacen.

## 7. Cómo se probó (para repetirlo)
- Servidor local: `cd` al repo y `python3 -m http.server 8803` (**en segundo plano**; se cae al reiniciar la shell).
- Navegador de prueba: Playwright con Chromium en `/opt/pw-browsers/chromium` (`/opt/node22/lib/node_modules/playwright/index.mjs`). Para GPU: `--use-gl=swiftshader --enable-unsafe-swiftshader`. Cámara falsa: `--use-fake-device-for-media-stream`.
- Cara falsa para Mocap: interceptar `**/mocap/local/deteccion.js` y reemplazar `landmarkerVivo()` por `window.__falso` (devuelve landmarks + blendshapes sintéticos).
- **Video real:** `ffmpeg` está instalado; MediaPipe corre en el navegador de prueba (324 cuadros ≈ 100 s).
- Scripts de prueba: en el `scratchpad` de la sesión (no están en el repo). Pruebas de lógica pura: importar los módulos de `nucleo/` desde node.
- **Nada se probó con hardware real:** PS Move, cámara real del usuario, celular real, ni dentro del juego BBS.

## 8. Pendiente / ideas
**Por confirmar por el usuario:** ojos mirando hacia abajo (v.017, ajustes sin reproducir el caso); que el selector de archivos del celu ya muestre el `.bvh` (v.019); `servir.py` nuevo en su PC; arrugas, modelos y partes de cara dentro de BBS; muecas con su cara real; Move reales (calibrar y ver la simulación).
**Pendiente de hacer:**
- Ojos: que el Mocap de la cara use los modelos de ojos generados (hoy solo `eyes`/`eyes_1px`); guardar los ajustes por personaje; probar el paquete dentro de BBS (si el nombre del modelo debe contener `eyes`, ya lo contiene).
- **Preset de muecas con los dibujos del usuario** (formas de «P», «U», «T», «O» de su animación de referencia) para que la conversión use exactamente sus bocas. Propuesto, aún no pedido.
- Editor: mover/escalar partes de un `.bobj` (hoy solo gira); las partes pegadas a un hueso de un `.bobj` (ítems en la mano) no siguen al hueso.
- Otro modelo de la línea emoticons: pedir el archivo y adaptar la armadura.
- Cámaras automáticas **con el mapa del mundo** (hoy pueden quedar tapadas por bloques).
- Retocar la grabación en la Vista 3D con más opciones (hoy: muecas, arrugas, labios, cejas).
- Boca más chica en «línea fina» (hoy copia el tamaño real; se achica con la sensibilidad).
- Modo Cara de Mocap: ordenar más los ajustes (la columna sigue larga).
- Viejas, no pedidas: marcas (Cuadrado) en la conversión, «Gente de fondo» (el zip no existe), mensaje del botón de carpeta en el Editor, APK final del 29/10 (la carpeta `apk/` no está en el repo).

## 9. Archivos del usuario mencionados
`servir.py` y `publicar.bat` (PC; `publicar.bat` se va a borrar), `NutriaDedSafio_MordoVM.lib4d` (Cinema 4D; solo se sacaron las vistas previas), `Nutrias_Dedsafio2_Mod_1.18.2.jar`, dos videos de referencia («puto» en cámara lenta: uno animado a mano en x4 con arrugas y uno real).
