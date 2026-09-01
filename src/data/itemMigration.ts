// 本地自制物品退役迁移层(2026-08:184 键全量切原版 vi_ 空间)。
// ★ 冻结数据表:与 PRIV_ITEM_STABLE 同级,一经定格【永不重生成】——原先从
//   idNames.ITEM_KEY_TO_ID 派生,但该表由 build-l10n 从"当前注册表"再生成,
//   本地定义删除后本地键即从表中消失(578→419 实证),派生链断裂。此处的
//   本地键→原版 id 映射是删除前最后一次完整对账的结果,作为字面量冻结。
// 数据源:legacyItemIndex.generated.json = 删除前构建的 index→key 快照
// (v3 存档 armor/dye/trash/misc 段裸内部下标的解码表)。
import legacyIndexJson from './legacyItemIndex.generated.json';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY, PRIV_ITEM_STABLE, ITEM_INTERNAL_OF_STABLE } from './items';

/** 快照:迁移前构建的 内部下标→key(v3 存档裸下标段解码表) */
export const LEGACY_KEY_OF_INTERNAL_V3: string[] = legacyIndexJson as string[];

/** 本地自制键全量(快照过滤;vi_/place_v_ 除外) */
export const LEGACY_LOCAL_KEYS: string[] = LEGACY_KEY_OF_INTERNAL_V3.filter(
  (k) => !k.startsWith('vi_') && !k.startsWith('place_v_'),
);

/** 冻结迁移表:本地键 → 原版 item id(184 键 = 170 迁移 + 12 盔甲 + 2 删除) */
const RETIRED_VID_TABLE: Record<string, number> = {
  // 基础方块/材料
  dirt_block: 2, stone_block: 3, wood: 9, sand_block: 169, snow_block: 593,
  platform: 94, torch: 8, door: 25, workbench: 36, furnace: 33, anvil: 35, chest: 48,
  gel: 23, acorn: 27, mushroom_item: 5, lens: 38, rope: 965, bomb: 166,
  // 矿石/锭(基础+替代+高阶)
  copper_ore: 12, iron_ore: 11, silver_ore: 14, gold_ore: 13,
  copper_bar: 20, iron_bar: 22, silver_bar: 21, gold_bar: 19,
  tin_ore: 699, lead_ore: 700, tungsten_ore: 701, platinum_ore: 702,
  tin_bar: 703, lead_bar: 704, tungsten_bar: 705, platinum_bar: 706,
  demonite_ore: 56, meteorite: 116, hellstone: 174, crimtane_ore: 880,
  cobalt_ore: 364, mythril_ore: 365, adamantite_ore: 366,
  palladium_ore: 1104, orichalcum_ore: 1105, titanium_ore: 1106, chlorophyte_ore: 947,
  // 宝石
  sapphire: 177, ruby: 178, emerald: 179, topaz: 180, amethyst: 181, diamond: 182,
  // 方块加工
  ice_block: 664, ice_brick: 883, snow_brick: 594, sandstone_block: 3271,
  hardened_sand_block: 3272, desert_fossil: 3347, clay_block: 133, glass: 170,
  obsidian: 173, gray_brick: 129, red_brick: 131, mud_block: 176, silt_block: 424,
  // 家具
  table: 32, chair: 34, bed: 224, bookcase: 354, grandfather_clock: 359,
  piano: 333, dresser: 334, bench: 335, bathtub: 336, keg: 352, cooking_pot: 345,
  clay_pot: 222, tombstone: 321, life_crystal: 29, candle: 105, chandelier: 106,
  lantern: 136, candelabra: 349, chinese_lantern: 344, skull_lantern: 347, water_candle: 148,
  // 药水
  lesser_healing_potion: 28, heal_potion: 188, agility_potion: 290, ironskin_potion: 292,
  thorns_potion: 301, regen_potion: 289, obsidian_skin_potion: 288, gills_potion: 291,
  mana_regen_potion: 293, magic_power_potion: 294, featherfall_potion: 295,
  water_walking_potion: 302, archery_potion: 303, night_owl_potion: 299,
  // 饰品
  lucky_horseshoe: 158, feral_claws: 211,
  // 工具/武器(铜/铁/银/金/替代金属 + 木系有原版者)
  copper_pickaxe: 3509, copper_axe: 3506, copper_sword: 3508, copper_hammer: 3505,
  iron_pickaxe: 1, iron_axe: 10, iron_sword: 4, iron_hammer: 7,
  silver_pickaxe: 3515, silver_axe: 3512, silver_sword: 3514, silver_hammer: 3511,
  gold_pickaxe: 3521, gold_axe: 3518, gold_sword: 3520, gold_hammer: 3517,
  tin_pickaxe: 3503, tin_axe: 3500, tin_sword: 3502,
  lead_pickaxe: 3497, lead_axe: 3494, lead_sword: 3496,
  tungsten_pickaxe: 3491, tungsten_axe: 3488, tungsten_sword: 3490,
  platinum_pickaxe: 3485, platinum_axe: 3482, platinum_sword: 3484,
  wood_sword: 24, wood_hammer: 196,
  // 弓箭/法杖
  wooden_bow: 39, wooden_arrow: 40, flaming_arrow: 41, iron_bow: 99,
  wand_of_sparking: 3069, amethyst_bolt: 739,
  // Boss/入侵召唤
  suspicious_eye: 43, worm_food: 70, bloody_spine: 1331, slime_crown: 560,
  goblin_battle_standard: 361, snow_globe: 602, pirate_map: 1315,
  mechanical_worm: 556, mechanical_eye: 544, mechanical_skull: 557,
  // 电路
  wire: 530, red_wrench: 509, blue_wrench: 850, green_wrench: 851, yellow_wrench: 3612,
  wire_cutter: 510, actuator_item: 849, actuation_rod: 3620,
  multicolor_wrench: 3625, grand_design: 3611,   // 3625=Multicolor Wrench/The Grand Design=3611
  // 桶
  empty_bucket: 205, water_bucket: 206, lava_bucket: 207, honey_bucket: 1128,
  // 草种/矿车
  corrupt_grass_seeds: 59, crimson_grass_seeds: 2171, jungle_grass_seeds: 195,
  mushroom_grass_seeds: 194, minecart_item: 2343,
  // 钱币
  coin_copper: 71, coin_silver: 72, coin_gold: 73, coin_platinum: 74,
  // 循环盔甲(vanilla:头 89-92 / 胸 80-83 / 腿 76-79)
  copper_helmet: 89, copper_chainmail: 80, copper_greaves: 76,
  iron_helmet: 90, iron_chainmail: 81, iron_greaves: 77,
  silver_helmet: 91, silver_chainmail: 82, silver_greaves: 78,
  gold_helmet: 92, gold_chainmail: 83, gold_greaves: 79,
};

/** 纯自创无原版对应——直接删除,不迁移(用户:只留原版 1:1) */
export const DELETED_KEYS = new Set(['wood_pickaxe', 'wood_axe']);

/** 退役键 → 原版 vid(冻结表直取;迁移+删除全表) */
export const RETIRED_KEY_TO_VID: Record<string, number> = RETIRED_VID_TABLE;

/** 退役键 → vi_ 键(VANILLA_ITEM_KEY_BY_ID 查表,驼峰权威) */
export function viKeyOfRetired(key: string): string | undefined {
  const vid = RETIRED_KEY_TO_VID[key];
  return vid !== undefined ? VANILLA_ITEM_KEY_BY_ID[vid] : undefined;
}

/** 退役键 → vi_ 内部 id(读档 remap 漏斗用)。
 *  ★2026-09-02 哨兵改 -1(见 leashedSync.internalIdOfVid 同批注)——内部 id 0 是
 *  合法位(vi_109_mana_crystal),旧 0 哨兵+消费侧 >0 门会漏掉落在 0 号位的
 *  remap 目标 */
export function viIdOfRetired(key: string): number {
  const viKey = viKeyOfRetired(key);
  return viKey !== undefined ? (ITEM_BY_KEY[viKey] ?? -1) : -1;
}

// ---- 读档 remap 单漏斗(退役定义删除后生效;删除前是 no-op) ----
// v3 存档里本地物品存的稳定 id 是 PRIV 段 10000+:定义删除后这些号没有落点,
// 此处把 旧稳定 id → 对应 vi_ 物品的内部 id 灌进 ITEM_INTERNAL_OF_STABLE,
// SaveFile 读档路径一行不改即可还原。幸存键(place_v_*)与删除键跳过。
for (const [key, stable] of Object.entries(PRIV_ITEM_STABLE)) {
  if (ITEM_BY_KEY[key] !== undefined) continue;       // 定义幸存,照旧
  if (DELETED_KEYS.has(key)) continue;                 // 纯自创删除,弃
  const viId = viIdOfRetired(key);
  if (viId >= 0 && !ITEM_INTERNAL_OF_STABLE.has(stable)) ITEM_INTERNAL_OF_STABLE.set(stable, viId);
}
