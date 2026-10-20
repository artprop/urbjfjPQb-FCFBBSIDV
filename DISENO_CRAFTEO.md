# Crafteo de personajes — diseño (borrador vivo)

Objetivo: **lanzar una textura (skin) y un modelo de cuerpo, y que el programa deje lista, de la forma más automática posible, todo lo que ese
personaje necesita para animarse en BBS**: ojos, cejas, pestañas, boca, manos… y las capas «máscara» que simplifican el cuerpo base para que
no estorbe en la animación. Cada personaje nuevo no debería pedir dibujar nada a mano: solo revisar y corregir.

## 1. Lo que se sabe de tu sistema (sacado de `5.json`, `dedos.bbs.json` y `exported._bbs.json`)
- **Un personaje es un *form* de BBS** (`bbs:model`) con un modelo de cuerpo (`player/steve`, `alex`, `steve_bends`, `alex_bends`…).
- **La textura es una lista de capas**, de abajo hacia arriba: `[{ path, color?, erase?, shiftY? }]`.
  - capa 0: la skin base.
  - `erase: true`: esa capa **borra** lo que hay debajo donde tiene píxeles (las máscaras: ojos, boca, pestañas).
  - `shiftY` (y otros desplazamientos): mueve la capa; lo usás para reusar una máscara estándar (`AEsclerotica1x2.png`) en skins con los ojos una fila más abajo (alex: `shiftY: 1`).
  - `color`: tiñe la capa (ropa, pelo, y también el blanco del ojo: la misma máscara se vuelve a poner como capa con `color` para pintar la esclerótica).
- **Partes** (`parts`): modelos hijos de un hueso del cuerpo. `player/eyes` o `player/eyes_1px` y `player/face` (boca) van en `head`;
  `dedos` va en `left_arm_item` / `right_arm_item` (o `left_arm`), con la pose de cada dedo.
- **Poses**: cada hueso de una pose tiene también `color` y `lighting`; con `color: -1` una pose pisa el tinte (por eso «las poses no mantienen el color» si el color viene por tinte → la textura pintada lo evita).
- **Los ojos hoy**: una textura por personaje (`OjosPillo.png`, `OjosMiri.png`…), o la versión «MAKEUROWNEYETECSHTOOR» con 4 capas tintadas (`LID_BOTH`, `SCLERA`, `IBROW`, `EYEtexUp`).
- **Los dedos** (`dedos.bbs.json`): 5 cubos de 1×2 px cuya textura es **la propia skin** (píxeles de la última fila del brazo, `x 46–53, y 31` en brazo clásico); por eso toman solos el color de la mano.
  Con brazos finos (Alex, 3 px) esas columnas cambian, y la mano izquierda está en otra parte de la skin (`y 63`).

## 2. Cómo está pensado
```
Personaje = skin (png) + cuerpo (steve/alex/…)
  └─ Cara 8×8 (frente de la cabeza, con la capa de arriba encima)
       └─ Regiones editables con el dedo: Ojo (izq/der), Pupila, Ceja, Boca, Pestañas
Elementos (módulos): cada uno sabe  detectar(skin) → proponer  |  editar sobre la cara  |  generar  |  previsualizar  |  exportar
  · Ojos      → modelo (geometría paramétrica) + textura pintada con los píxeles de la skin + 20 poses calculadas        [hecho]
  · Cejas     → se asignan aunque la skin no las tenga; color propio                                                       [hecho]
  · Máscaras  → capas «erase» PNG del tamaño de la skin: ojos (las cajas de «Ojo»), boca (rectángulo), pestañas (píxeles) [hecho]
  · Pestañas  → las de la skin se borran con la máscara y pasan a los párpados del modelo (se mueven con el parpadeo)        [hecho]
  · Boca      → máscara + modelo de boca (los de Mocap: boca_pixel_*, `player/face`)                                       [falta unir]
  · Dedos     → `dedos` con UVs adaptados al tipo de brazo y a cada mano                                                  [falta]
Salidas
  · capas máscara (PNG) · modelo de ojos (carpeta) · **form del personaje** (`personaje.json`, en el formato que exporta BBS)
  · todo ordenado en `assets/models/...` listo para copiar a la carpeta bbs
```
Reglas del diseño:
1. **Todo se deduce de la skin y se corrige sobre la cara**, no con números (los números quedan como «avanzado»).
2. **Una sola fuente de verdad**: la descripción del personaje (`cfg`); el modelo, la textura, las máscaras y el form salen de ella.
3. **Lo generado reproduce la skin en reposo** (probado píxel a píxel contra el cargador 3D del Visor): el crafteo nunca cambia cómo se ve el personaje quieto.
4. Cada elemento nuevo es un módulo aparte; el editor de la cara y la exportación son comunes.

## 3. Mapa de la cara → skin
Columna `c` (0–7, de izquierda a derecha de la imagen) y fila `f` (0–7, de arriba abajo) de la cara están en la skin en `(8+c, 8+f)` y, en la capa de arriba, en `(40+c, 8+f)`.
En el modelo de la cabeza: `x` desde `3-c` hasta `4-c`; `y` desde `7-f` hasta `8-f`. La piel de la cabeza está en `z = -4`: lo que está más atrás
(ojo, pupila, párpados) solo se ve por el hueco de la máscara; las cejas (`z = -4.05`) van por delante.

## 4. Hecho / falta
Hecho: ojos (cualquier tamaño de ojo y pupila, de uno o varios colores), cejas asignables, máscaras de ojos/boca/pestañas, form del personaje con las capas `erase`,
vista 2D «como en BBS» con el hueco, vista 3D de los ojos solos, exportar textura / ojos / personaje completo.
Falta: boca (unir con los modelos de Mocap), dedos, `shiftY` en vez de una máscara nueva, esclerótica como capa tintada, lote (varios personajes), presets, probar todo dentro de BBS.

## 5. Preguntas abiertas
1. **Máscaras**: hoy los píxeles de la máscara son blancos opacos. ¿Te sirve? ¿Preferís que, cuando tus ojos están una fila más abajo, el form use tu `AEsclerotica1x2.png` con `shiftY` en vez de una máscara nueva?
2. **Boca**: ¿siempre una máscara de 4×1? ¿Qué modelo de boca va con qué cuerpo (`player/face`, `boca_Man`…)?
3. **Dedos**: ¿armo el elemento «manos» (UVs según brazo clásico/fino y mano izquierda/derecha + poses de los dedos)?
4. **Ojos tintados** (`LID_BOTH`, `SCLERA`…): ¿lo seguimos usando o alcanza con la textura pintada por personaje?
5. **Rutas**: ¿en qué carpeta de tu `assets/models` van los personajes (por ejemplo `_LosSaucera/…`) para que `personaje.json` apunte ahí directamente?

Referencias en `ojos/referencia/`: `dedos.bbs.json` y un form de ejemplo (alex_bends con dedos, boca y ojos).
