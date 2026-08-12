// 原版物品 id → 注册 key/内部 id 的统一查表入口(本地物品退役后全库唯一物品字面量源)。
// ★ 严禁手拼 vi_ 键字符串:蛇形/驼峰双注册下唯一权威是 VANILLA_ITEM_KEY_BY_ID(驼峰)。
// 后续 dual-key 清理(蛇形/驼峰归一)只需改本文件,消费点无感。
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from './items';

/** 原版物品 id → 注册 key(查不到返回 '') */
export function VI(vid: number): string {
  return VANILLA_ITEM_KEY_BY_ID[vid] ?? '';
}

/** 原版物品 id → 内部 id(查不到返回 0) */
export function VI_ID(vid: number): number {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  return k !== undefined ? (ITEM_BY_KEY[k] ?? 0) : 0;
}

/** 高频消费点语义常量(grep 唯一入口;数值 = 原版 item id 权威) */
export const VI_KEY = {
  // 基础方块/材料
  DIRT: VI(2), STONE: VI(3), WOOD: VI(9), SAND: VI(169), SNOW: VI(593),
  CLAY: VI(133), GLASS: VI(170), MUD: VI(176), OBSIDIAN: VI(173), SILT: VI(424),
  ICE: VI(664), GRAY_BRICK: VI(129), RED_BRICK: VI(131),
  GEL: VI(23), ACORN: VI(27), MUSHROOM: VI(5), LENS: VI(38), ROPE: VI(965),
  BOMB: VI(166), WIRE: VI(530),
  // 放置/功能物
  TORCH: VI(8), PLATFORM: VI(94), DOOR: VI(25), WORKBENCH: VI(36), FURNACE: VI(33),
  ANVIL: VI(35), CHEST: VI(48), SIGN: VI(171),
  TABLE: VI(32), CHAIR: VI(34), BED: VI(224), TOMBSTONE: VI(321), LIFE_CRYSTAL: VI(29),
  // 桶族/水蜡
  EMPTY_BUCKET: VI(205), WATER_BUCKET: VI(206), LAVA_BUCKET: VI(207), HONEY_BUCKET: VI(1128),
  WATER_CANDLE: VI(148),
  // 药水(常用)
  LESSER_HEAL: VI(28), HEAL: VI(188),
  // Boss/入侵召唤
  SUSPICIOUS_EYE: VI(43), WORM_FOOD: VI(70), BLOODY_SPINE: VI(1331), SLIME_CROWN: VI(560),
  GOBLIN_STANDARD: VI(361), SNOW_GLOBE: VI(602), PIRATE_MAP: VI(1315),
  MECH_WORM: VI(556), MECH_EYE: VI(544), MECH_SKULL: VI(557),
  // 开局三件套(原版新玩家:Copper Pickaxe/Shortsword/Axe)
  STARTER: { PICK: VI(3509), SHORTSWORD: VI(3507), AXE: VI(3506) },
  // 钱币(单轨,Inventory.COIN_KEYS 同源)
  COIN: { COPPER: VI(71), SILVER: VI(72), GOLD: VI(73), PLATINUM: VI(74) },
  // 饰品(退役本地 accessory 枚举的继任)
  LUCKY_HORSESHOE: VI(158), FERAL_CLAWS: VI(211),
  // 预览盔甲(铁三件)
  IRON_HELMET: VI(90), IRON_CHAINMAIL: VI(81), IRON_GREAVES: VI(77),
  // 草种(蘑菇 194 等)
  MUSHROOM_GRASS_SEEDS: VI(194),
} as const;
