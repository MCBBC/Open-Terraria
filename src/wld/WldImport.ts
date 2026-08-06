// .wld → 自有存档格式转换（导入后即可进入游戏）
// tile/wall/item 的 id 映射基于 Terraria 1.4 的事实数据；未映射内容做可玩性降级。
import { parseWld, WldWorld } from './WldParser';
import { SaveData, rleTiles, rlePairs, bytesToB64 } from '../save/SaveFile';
import { TILE_BY_KEY, WALL_BY_KEY, T } from '../data/tiles';
import { ITEM_BY_KEY } from '../data/items';

// wld tile id → 内部 tile key（null = 清空丢弃；copyFrame = 原版 framed 家具，18px 帧直拷）
type MapEntry = string | { key: string; copyFrame?: boolean } | null;
const TILE_MAP: Record<number, MapEntry> = {
  0: 'dirt',          // Dirt
  1: 'stone',         // Stone
  2: 'grass',         // Grass
  3: 'tallgrass',     // Plants（地表植物）
  4: 'torch',         // Torch
  5: 'tree',          // Tree
  6: 'ore_iron',      // Iron
  7: 'ore_copper',    // Copper
  8: 'ore_gold',      // Gold
  9: 'ore_silver',    // Silver
  10: 'door_closed',  // Closed Door
  16: 'anvil',        // Anvil
  17: 'anvil',        // Mythril Anvil
  18: 'workbench',    // Work Bench
  19: 'platform',     // Wood Platform
  21: 'chest',        // Chest
  53: 'sand',         // Sand
  59: 'mud',          // Mud
  60: 'grass',        // Jungle Grass
  73: 'tallgrass',    // Plants 2
  147: 'snow',        // Snow
  // ---- 原版素材批次（Tiles_N 表 + TEdit framing） ----
  57: 'ash', 123: 'silt', 40: 'clay', 54: 'glass', 56: 'obsidian',
  38: 'gray_brick', 39: 'red_brick',
  161: 'ice', 162: 'thin_ice', 206: 'ice_brick', 148: 'snow_brick',
  396: 'sandstone', 397: 'hardened_sand', 404: 'desert_fossil',
  166: 'ore_tin', 167: 'ore_lead', 168: 'ore_tungsten', 169: 'ore_platinum',
  22: 'ore_demonite', 37: 'ore_meteorite', 58: 'ore_hellstone', 204: 'ore_crimtane',
  107: 'ore_cobalt', 108: 'ore_mythril', 111: 'ore_adamantite',
  221: 'ore_palladium', 222: 'ore_orichalcum', 223: 'ore_titanium', 211: 'ore_chlorophyte',
  63: 'gem_sapphire', 64: 'gem_ruby', 65: 'gem_emerald',
  66: 'gem_topaz', 67: 'gem_amethyst', 68: 'gem_diamond',
  // 家具（framed：18px 帧/样式直拷，渲染端原样使用）
  14: { key: 'table', copyFrame: true },
  15: { key: 'chair', copyFrame: true },
  79: { key: 'bed', copyFrame: true },
  33: { key: 'candle', copyFrame: true },
  34: { key: 'chandelier', copyFrame: true },
  42: { key: 'lantern', copyFrame: true },
  100: { key: 'candelabra', copyFrame: true },
  101: { key: 'bookcase', copyFrame: true },
  104: { key: 'grandfather_clock', copyFrame: true },
  87: { key: 'piano', copyFrame: true },
  88: { key: 'dresser', copyFrame: true },
  89: { key: 'bench', copyFrame: true },
  90: { key: 'bathtub', copyFrame: true },
  94: { key: 'keg', copyFrame: true },
  95: { key: 'chinese_lantern', copyFrame: true },
  96: { key: 'cooking_pot', copyFrame: true },
  98: { key: 'skull_lantern', copyFrame: true },
  78: { key: 'clay_pot', copyFrame: true },
  85: { key: 'tombstone_v', copyFrame: true },
  12: { key: 'crystal_heart', copyFrame: true },
  49: { key: 'water_candle', copyFrame: true },
  // 降级为 stone 的常见方块
  23: 'stone', 24: 'stone', 25: 'stone',  // corruption
  31: 'stone', 32: 'stone', 27: 'stone',  // crimson
  41: 'stone', 43: 'stone', 44: 'stone',  // dungeon bricks
  75: 'stone',
  199: 'stone', 200: 'stone', 201: 'stone', 202: 'stone', 203: 'stone',
  // 清空的装饰/不可表示物
  11: null,    // Open Door
  28: null, 29: null, 30: null,  // pots
  52: null, 55: null,  // vines
  61: null, 62: null, 69: null, // jungle plants
  70: 'grass', 71: null, 72: 'tree',   // mushroom grass / plants / mushroom tree
  74: null, 76: null, 77: null, 80: null, // plants2/bushes/cactus
  83: null, 84: null, // shiverthorn
};

// wld wall id → 内部 wall key
const WALL_MAP: Record<number, string> = {
  1: 'stone_wall',   // Stone (natural)
  2: 'dirt_wall',    // Dirt (natural)
  3: 'stone_wall',   // Ebonstone
  4: 'wood_wall',    // Wood
  5: 'stone_wall', 6: 'stone_wall', 7: 'stone_wall', 8: 'stone_wall', 9: 'stone_wall',
  10: 'stone_wall', 11: 'stone_wall', 12: 'stone_wall', 13: 'stone_wall', 14: 'stone_wall',
  15: 'dirt_wall', 16: 'dirt_wall',
};

// wld item id → 内部 item key（宝箱战利品用）
const ITEM_MAP: Record<number, string> = {
  2: 'dirt_block', 8: 'torch', 9: 'wood', 175: 'stone_block',
  11: 'iron_ore', 12: 'copper_ore', 13: 'gold_ore', 14: 'silver_ore',
  20: 'copper_bar', 22: 'iron_bar', 23: 'gel',
  28: 'lesser_healing_potion', 38: 'lens',
  71: 'coin_copper', 72: 'coin_copper', 73: 'coin_copper', 74: 'coin_copper',
  // 原版批次材料
  699: 'tin_ore', 700: 'lead_ore', 701: 'tungsten_ore', 702: 'platinum_ore',
  703: 'tin_bar', 704: 'lead_bar', 705: 'tungsten_bar', 706: 'platinum_bar',
  177: 'sapphire', 178: 'ruby', 179: 'emerald', 180: 'topaz', 181: 'amethyst', 182: 'diamond',
  664: 'ice_block', 883: 'ice_brick', 594: 'snow_brick',
  133: 'clay_block', 170: 'glass', 173: 'obsidian', 129: 'gray_brick', 131: 'red_brick',
  32: 'table', 34: 'chair', 224: 'bed', 354: 'bookcase', 359: 'grandfather_clock',
  105: 'candle', 136: 'lantern', 349: 'candelabra', 222: 'clay_pot', 29: 'life_crystal',
  5: 'mushroom_item', 27: 'acorn',
};

export interface ImportResult { save: SaveData; warnings: string[]; }

export function parseWldToSave(buf: Uint8Array): SaveData {
  const wld: WldWorld = parseWld(buf);
  const warnings: string[] = [];

  const w = wld.tilesWide, h = wld.tilesHigh;
  const n = w * h;
  const type = new Uint16Array(n);
  const frameX = new Uint16Array(n);
  const frameY = new Uint16Array(n);
  const wall = new Uint8Array(n);
  const liquidArr = new Uint8Array(n);

  const chestAt = new Map<string, { x: number; y: number }>();
  for (const c of wld.chests) chestAt.set(`${c.x},${c.y}`, c);

  let unmapped = 0;
  for (let i = 0; i < n; i++) {
    const wt = wld.tiles.type[i];
    if (wld.tiles.active[i]) {
      const mapped = TILE_MAP[wt];
      if (mapped === undefined) {
        // 未映射：framed 物体丢弃，方块降级为 stone（保持地形完整可玩）
        unmapped++;
        type[i] = T.STONE;
      } else if (mapped === null) {
        type[i] = 0;
      } else if (typeof mapped === 'string') {
        type[i] = TILE_BY_KEY[mapped] ?? 0;
      } else {
        // 原版 framed 家具：18px 帧/样式偏移直拷（与 .wld 原生一致，渲染端零换算）
        type[i] = TILE_BY_KEY[mapped.key] ?? 0;
        if (mapped.copyFrame) {
          frameX[i] = wld.tiles.frameX[i];
          frameY[i] = wld.tiles.frameY[i];
        }
      }
    }
    const ww = wld.tiles.wall[i];
    if (ww !== 0) {
      wall[i] = WALL_BY_KEY[WALL_MAP[ww] ?? 'stone_wall'] ?? 0;
    }
    const lq = wld.tiles.liquid[i];
    if (lq > 0) liquidArr[i] = lq;
  }
  if (unmapped > 0) warnings.push(`${unmapped} 个未知 tile 已降级为石块`);

  // 宝箱：转内部格式（锚点 + 战利品）
  const chests: SaveData['chests'] = [];
  for (const c of wld.chests) {
    // 在 chest 周围找锚点（wld chest 坐标可能是左上）
    type[c.y * w + c.x] = TILE_BY_KEY['chest'];
    frameX[c.y * w + c.x] = 0;
    frameY[c.y * w + c.x] = 0;
    if (c.x + 1 < w) { type[c.y * w + c.x + 1] = TILE_BY_KEY['chest']; frameX[c.y * w + c.x + 1] = 1; frameY[c.y * w + c.x + 1] = 0; }
    if (c.y + 1 < h) { type[(c.y + 1) * w + c.x] = TILE_BY_KEY['chest']; frameX[(c.y + 1) * w + c.x] = 0; frameY[(c.y + 1) * w + c.x] = 1; }
    if (c.x + 1 < w && c.y + 1 < h) { type[(c.y + 1) * w + c.x + 1] = TILE_BY_KEY['chest']; frameX[(c.y + 1) * w + c.x + 1] = 1; frameY[(c.y + 1) * w + c.x + 1] = 1; }
    const items: Array<{ id: number; stack: number } | null> = [];
    for (const it of c.items.slice(0, 10)) {
      if (!it) { items.push(null); continue; }
      const key = ITEM_MAP[it.id];
      if (key && ITEM_BY_KEY[key] !== undefined) {
        items.push({ id: ITEM_BY_KEY[key], stack: Math.min(999, it.stack) });
      } else {
        items.push(null);
      }
    }
    while (items.length < 10) items.push(null);
    chests.push({ x: c.x, y: c.y, items });
  }

  // 时间换算：wld time 0 = 4:30AM（白天起点）
  let timeOfDay: number;
  if (wld.dayTime) {
    timeOfDay = 0.1875 + (wld.time % 1) * 0.5;
  } else {
    timeOfDay = 0.6875 + (wld.time % 1) * 0.5;
  }
  timeOfDay = timeOfDay % 1;

  const save: SaveData = {
    format: 'sandboxworld.save',
    version: 1,
    header: {
      name: wld.title || '导入的地图',
      seed: 0,
      width: w,
      height: h,
      spawn: [wld.spawnX, wld.spawnY],
      groundLevel: Math.floor(wld.groundLevel),
      rockLevel: Math.floor(wld.rockLevel),
      created: Date.now(),
      playTimeMs: 0,
      wldVersion: wld.version,
    },
    clock: { timeOfDay, dayCount: 1 },
    tiles: bytesToB64(rleTiles({ type, frameX, frameY })),
    walls: bytesToB64(rlePairs(wall)),
    liquid: bytesToB64(rlePairs(liquidArr)),
    chests,
    player: {
      hp: 100,
      x: wld.spawnX * 16 + 8,
      y: (wld.spawnY - 2) * 16,
      inventory: Array(40).fill(null),
      selected: 0,
    },
    npcs: [],
    flags: { downedEyeOfCthulhu: false },
  };
  void warnings;
  void chestAt;
  return save;
}
