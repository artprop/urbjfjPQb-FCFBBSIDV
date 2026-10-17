// Color aproximado de cada bloque para el mapa desde arriba y la vista 3D (como los mapas de Xaero o Mineways).
// Primero el nombre exacto, después por color en el nombre (white_wool, red_concrete...) y por palabras.

const T = {
  grass_block: [95, 159, 53], dirt: [134, 96, 67], coarse_dirt: [119, 85, 59], podzol: [91, 63, 24], rooted_dirt: [144, 103, 76],
  dirt_path: [148, 121, 65], farmland: [110, 75, 45], mud: [60, 57, 60], clay: [160, 166, 179], gravel: [131, 127, 126],
  sand: [219, 207, 163], red_sand: [190, 102, 33], sandstone: [216, 203, 155], red_sandstone: [181, 98, 31],
  stone: [125, 125, 125], cobblestone: [122, 122, 122], mossy_cobblestone: [110, 118, 94], smooth_stone: [158, 158, 158],
  stone_bricks: [122, 121, 122], granite: [149, 103, 85], diorite: [188, 188, 188], andesite: [136, 136, 136],
  deepslate: [80, 80, 82], cobbled_deepslate: [77, 77, 80], tuff: [108, 109, 102], calcite: [223, 224, 220],
  bedrock: [85, 85, 85], obsidian: [20, 18, 30], netherrack: [97, 38, 38], end_stone: [219, 222, 158],
  water: [63, 118, 228], lava: [207, 92, 15], ice: [145, 183, 253], packed_ice: [141, 180, 250], blue_ice: [116, 167, 253],
  snow: [249, 254, 254], snow_block: [249, 254, 254], powder_snow: [248, 253, 253],
  oak_planks: [162, 130, 78], spruce_planks: [114, 84, 48], birch_planks: [192, 175, 121], jungle_planks: [160, 115, 80],
  acacia_planks: [168, 90, 50], dark_oak_planks: [66, 43, 20], mangrove_planks: [117, 54, 48], cherry_planks: [226, 178, 172],
  bamboo_planks: [193, 173, 80], crimson_planks: [101, 48, 70], warped_planks: [43, 104, 99],
  oak_log: [109, 85, 50], spruce_log: [58, 37, 16], birch_log: [216, 215, 210], jungle_log: [85, 67, 25], acacia_log: [103, 96, 86],
  dark_oak_log: [60, 46, 26], mangrove_log: [84, 66, 36], cherry_log: [54, 33, 44],
  oak_leaves: [60, 125, 30], spruce_leaves: [55, 90, 55], birch_leaves: [95, 135, 60], jungle_leaves: [48, 135, 25],
  acacia_leaves: [70, 120, 25], dark_oak_leaves: [45, 105, 20], azalea_leaves: [90, 115, 45], cherry_leaves: [229, 172, 194], mangrove_leaves: [70, 115, 35],
  bricks: [150, 97, 83], mud_bricks: [137, 103, 79], nether_bricks: [44, 21, 26], quartz_block: [235, 229, 222], smooth_quartz: [235, 229, 222],
  glass: [175, 213, 219], tinted_glass: [44, 38, 46], bookshelf: [117, 94, 59], crafting_table: [119, 73, 42], furnace: [110, 110, 110],
  hay_block: [166, 136, 38], melon: [111, 145, 30], pumpkin: [198, 118, 24], cactus: [85, 127, 43], moss_block: [89, 109, 45],
  prismarine: [99, 156, 151], sea_lantern: [172, 199, 190], glowstone: [171, 131, 84], terracotta: [152, 94, 67],
  iron_block: [220, 220, 220], gold_block: [246, 208, 61], diamond_block: [98, 237, 228], emerald_block: [42, 203, 87],
  coal_block: [16, 15, 15], redstone_block: [175, 24, 5], lapis_block: [30, 67, 140], copper_block: [192, 107, 79],
  chest: [161, 116, 46], barrel: [134, 100, 58], bell: [220, 180, 50], lantern: [100, 90, 80],
};
const COLOR_NOMBRE = {
  white: [233, 236, 236], orange: [240, 118, 19], magenta: [189, 68, 179], light_blue: [58, 175, 217], yellow: [248, 197, 39],
  lime: [112, 185, 25], pink: [237, 141, 172], gray: [62, 68, 71], light_gray: [142, 142, 134], cyan: [21, 137, 145],
  purple: [121, 42, 172], blue: [53, 57, 157], brown: [114, 71, 40], green: [84, 109, 27], red: [161, 39, 34], black: [20, 21, 25],
};
const PALABRAS = [
  [/oak|planks|_door|fence|trapdoor|sign|ladder|wood/, [150, 120, 72]], [/log|stem|hyphae/, [95, 72, 42]],
  [/leaves/, [60, 120, 35]], [/grass|fern|vine|bush|sapling|seagrass|kelp|flower|tulip|poppy|dandelion/, [80, 150, 50]],
  [/stone|cobble|andesite|tuff|slate|basalt|blackstone/, [120, 120, 122]], [/brick/, [140, 90, 78]], [/sand/, [214, 200, 155]],
  [/glass|pane/, [175, 213, 219]], [/quartz|calcite|bone/, [230, 225, 215]], [/copper/, [180, 110, 80]],
  [/iron|anvil|cauldron|hopper|rail/, [180, 180, 180]], [/snow|ice/, [230, 240, 255]], [/nether|crimson/, [110, 40, 45]],
  [/warped/, [40, 110, 100]], [/purpur|end_/, [170, 125, 170]], [/prismarine/, [99, 156, 151]], [/terracotta/, [150, 95, 70]],
  [/wool|carpet|bed|concrete|banner/, [220, 220, 220]], [/torch|lamp|lantern|glow|light/, [240, 210, 120]], [/water/, [63, 118, 228]],
];
const cache = new Map();

// [r, g, b] del bloque (nombre como 'minecraft:oak_planks')
export function colorBloque(nombre) {
  if (cache.has(nombre)) return cache.get(nombre);
  const n = String(nombre).split(':').pop();
  let c = T[n] || T[n.replace(/_(slab|stairs|wall|fence|fence_gate|button|pressure_plate)$/, '')]
    || T[n.replace(/_(slab|stairs|wall)$/, 's')] || T[n.replace(/^(cut|chiseled|polished|smooth|cracked|mossy)_/, '')];
  if (!c) {
    const col = Object.keys(COLOR_NOMBRE).sort((a, b) => b.length - a.length).find((k) => n.startsWith(k + '_'));
    if (col) {
      c = COLOR_NOMBRE[col];
      if (/terracotta/.test(n)) c = c.map((v) => Math.round(v * 0.7 + 40));        // terracota: más apagada
      else if (/glass/.test(n)) c = c.map((v) => Math.round(v * 0.6 + 90));        // vidrio: más clarito
    }
  }
  if (!c) { const p = PALABRAS.find(([re]) => re.test(n)); if (p) c = p[1]; }
  if (!c) {      // desconocido: un gris con un toque de color sacado del nombre (siempre el mismo para el mismo bloque)
    let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    c = [110 + (h % 50), 110 + ((h >> 8) % 50), 110 + ((h >> 16) % 50)];
  }
  cache.set(nombre, c);
  return c;
}
