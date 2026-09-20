// ============================================================================
// 旅程物品浏览器纯逻辑（M8）——过滤/排序/搜索三件 1:1 移植。
// 标杆（Terarria1456）：
//   Terraria.GameContent.Creative/ItemFilters.cs        —— 10 过滤器 + MiscFallback
//   Terraria.GameContent.Creative/SortingSteps.cs       —— ByUnlockStatus/
//     ByCreativeSortingId/Alphabetical 三步链（UICreativeInfiniteItemsDisplay.cs:94-100
//     固定装配，无用户可选排序 UI——本仓同款固定链）
//   Terraria.DataStructures/EntrySorter.cs              —— 多步比较器（prioritized=0，
//     等价顺序链：unlock → creativeId → alphabetical）
//   Terraria.DataStructures/EntryFilterer.cs            —— 搜索 AND + 活动过滤器 OR
//   Terraria.ID/ContentSamples.cs CreativeHelper.GetItemGroup（:117-675）—— 分组+组内序
//   Terraria.UI/UIDynamicItemCollection.cs              —— 44px 槽位网格 + 视口裁剪滚动
// 数据源 = src/data/vanilla-journeycat.json（tools/extract-journey-browser.mjs 产物，
//   字段缺省即反编译默认——damage -1 / createTile·createWall·tileWand -1 / fishingPole 1）。
// 本模块无 DOM——UI 装配在 JourneyPowersUI category 1（虚拟滚动同 UIDynamicItemCollection
//   的视口裁剪语义：只渲染可见行 ±1 行）。
// ============================================================================
import catRaw from '../data/vanilla-journeycat.json';
import { ITEM_NAME_BY_ID, ITEM_NAME_EN_BY_ID } from '../i18n/idNames.generated';
import { Lang } from '../i18n/Lang';
import { PLATFORMS_SHEETS, CONV_GRASS_SHEETS } from '../data/tiles';

// ---------------------------------------------------------------------------
// 数据表（vanilla-journeycat.json 形状）
// ---------------------------------------------------------------------------

/** 逐 vid 原始字段（缺省 = 反编译默认；键名见提取器注释） */
interface CatEntry {
  dmg?: number;     // damage（缺省 -1）
  ct?: number;      // createTile（缺省 -1）
  cw?: number;      // createWall（缺省 -1）
  ps?: number;      // placeStyle（缺省 0）
  tw?: number;      // tileWand（缺省 -1）
  mnpc?: number;    // makeNPC
  van?: 1;          // vanity
  r?: number;       // rare
  df?: number;      // defense
  acc?: 0 | 1;      // accessory（1=功能 / 0=社交）
  hs?: 1; bs?: 1; ls?: 1;   // headSlot/bodySlot/legSlot >= 0
  mt?: 1;           // mountType >= 0
  cart?: 1;         // MountID.Sets.Cart
  pet?: 1;          // Main.vanityPet[buffType]
  light?: 1;        // Main.lightPet[buffType]
  hook?: 1;         // Main.projHook[shoot]
  bt?: number;      // buffType
  bft?: number;     // buffTime
  hl?: number;      // healLife
  hm?: number;      // healMana
  pick?: number; axe?: number; hammer?: number;
  fp?: number;      // fishingPole（缺省 1）
  bait?: number;
  shoot?: number;
  dye?: 1;          // dye != 0（DyeInitializer BindShader 表）
  hd?: 1;           // hairDye != -1
  m?: 1; rg?: 1; mg?: 1; sm?: 1;   // melee/ranged/magic/summon
  am?: number;      // ammo
  nam?: 1;          // notAmmo
  cons?: 1;         // consumable
  us?: number;      // useStyle（缺省 0）
  mat?: 1;          // material（IsAMaterial，配方派生）
  exp?: 1;          // expert
  qi?: 1;           // questItem
  pc?: 1;           // PaintOrCoating
}

interface CatDoc {
  meta: { source: string; itemCount: number; damageDefault: number; fishingPoleDefault: number; note: string };
  items: Record<string, CatEntry>;
  tileSolid: Record<string, number>;
  tileSolidTop: Record<string, number>;
  tileFrameImportant: number[];
}

const CAT = catRaw as unknown as CatDoc;
const ENTRIES = CAT.items;

const entry = (vid: number): CatEntry => ENTRIES[String(vid)] ?? {};
const dmgOf = (e: CatEntry): number => e.dmg ?? -1;             // 默认 -1（Item.cs:48609）
const ctOf = (e: CatEntry): number => e.ct ?? -1;
const cwOf = (e: CatEntry): number => e.cw ?? -1;
const twOf = (e: CatEntry): number => e.tw ?? -1;
const psOf = (e: CatEntry): number => e.ps ?? 0;
const fpOf = (e: CatEntry): number => e.fp ?? 1;                 // 默认 1（Item.cs:104）
const ammoOf = (e: CatEntry): number => e.am ?? 0;               // AmmoID.None = 0
const defOf = (e: CatEntry): number => e.df ?? 0;
const rareOf = (e: CatEntry): number => e.r ?? 0;

// ---- TileID.Sets / Main tile 表（TileID.cs / Main.cs 字面量 + journeycat 三表）----
const TILE_TORCHES = new Set<number>([4]);                        // TileID.Sets.Torches :401
// ★BJ182b 收编单源 data/tiles.ts:PLATFORMS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const TILE_PLATFORMS = PLATFORMS_SHEETS;
const TILE_GRASS = CONV_GRASS_SHEETS;  // Sets.Conversion.Grass :18——★BJ210 收编单源（§6i）
const FRAME_IMPORTANT = new Set(CAT.tileFrameImportant);          // Main.cs 402 处

const tileSolid = (t: number): boolean => !!CAT.tileSolid[String(t)];
const tileSolidTop = (t: number): boolean => !!CAT.tileSolidTop[String(t)];
const tileFrameImportant = (t: number): boolean => FRAME_IMPORTANT.has(t);

// ---- ItemID.Sets 字面量（ItemID.cs）----
/** SortingPriorityWiring（:1146，CreateIntSet(-1, id, prio, ...)） */
const SORT_WIRING: Record<number, number> = (() => {
  const t: Record<number, number> = {};
  const pairs = [
    510, 103, 3625, 102, 509, 101, 851, 100, 850, 99, 3612, 98, 849, 97, 4485, 96,
    4484, 95, 583, 94, 584, 93, 585, 92, 538, 91, 513, 90, 3545, 90, 853, 89, 541, 88,
    529, 88, 1151, 87, 852, 87, 543, 87, 542, 87, 3707, 87, 2492, 86, 530, 85, 581, 84,
    582, 84, 1263, 83,
  ];
  for (let i = 0; i + 1 < pairs.length; i += 2) t[pairs[i]] = pairs[i + 1];
  return t;
})();
const sortWiringOf = (vid: number): number => SORT_WIRING[vid] ?? -1;

/** SortingPriorityPainting（:1154） */
const SORT_PAINTING: Record<number, number> = { 1543: 100, 1544: 99, 1545: 98, 1071: 97, 1072: 96, 1100: 95 };
const sortPaintingOf = (vid: number): number => SORT_PAINTING[vid] ?? -1;

/** Glowsticks（:1198） */
const GLOWSTICKS = new Set<number>([282, 286, 3112, 3002, 4776, 5643]);
/** BossBag（:1209） */
const BOSS_BAGS = new Set<number>([
  3318, 3319, 3320, 3321, 3322, 3323, 3324, 3325, 3326, 3327, 3328, 3329, 3330, 3331, 3332,
  3860, 3861, 3862, 4782, 4957, 5111,
]);

/** BuffID.Sets.IsWellFed（BuffID.cs:14） */
const BUFF_WELL_FED = new Set<number>([26, 206, 207]);
/** BuffID.Sets.IsAFlaskBuff（:26） */
const BUFF_FLASK = new Set<number>([71, 72, 73, 74, 75, 76, 77, 78, 79]);

// ---- CreativeHelper 手表（ContentSamples.cs:110-115）----
const MANUAL_EVENT_ORDER = [361, 1315, 2767, 602, 1844, 1958];
const MANUAL_BOSS_SPAWN_ORDER = [43, 560, 70, 1331, 1133, 5120, 1307, 267, 3828, 4988, 5334, 544, 557, 556, 1293, 2673, 4961, 3601];
const MANUAL_CRAFTING_STATIONS = [33, 35, 716, 221, 524, 1221, 525, 1220, 3549, 398, 1120, 1430, 1551, 345, 1791, 5008, 332, 352, 487, 995, 363, 2172, 2196, 2194, 2198, 2204, 998, 2197, 996, 4142, 2193, 2192, 2203, 2195];
const MANUAL_GOLF_ORDER = [
  4095, 4596, 4597, 4595, 4598, 4592, 4593, 4591, 4594, 4092, 4093, 4039, 4094, 4588, 4589,
  4587, 4590, 3989, 4242, 4243, 4244, 4245, 4246, 4247, 4248, 4249, 4250, 4251, 4252, 4253,
  4254, 4255, 4040, 4086, 4085, 4088, 4084, 4083, 4087,
];

// ---------------------------------------------------------------------------
// ItemGroup 枚举（ContentSamples.cs:26-104——值 = 排序键，1:1）
// ---------------------------------------------------------------------------
export const enum ItemGroup {
  Coin = 10, CraftingObjects = 11, Torches = 20, Glowsticks = 25, Wood = 30,
  Bombs = 40, LifePotions = 50, ManaPotions = 51, BuffPotion = 52, Flask = 53, Food = 54,
  Crates = 60, BossBags = 70, GoodieBags = 80, AlchemyPlants = 83, AlchemySeeds = 84,
  DyeMaterial = 87, BossItem = 90, EventItem = 91, ConsumableThatDoesNotDamage = 94,
  Solutions = 95, Ammo = 96, ConsumableThatDamages = 97, PlaceableObjects = 100, Blocks = 120,
  Wands = 130, Rope = 140, Walls = 150, Wiring = 200, Pickaxe = 500, Axe = 510, Hammer = 520,
  MeleeWeapon = 530, RangedWeapon = 540, MagicWeapon = 550, SummonWeapon = 560,
  Headgear = 600, Torso = 610, Pants = 620, Accessories = 630, Hook = 700, Mount = 710,
  Minecart = 720, VanityPet = 800, LightPet = 810, Golf = 900, BossSpawners = 901, Dye = 910,
  HairDye = 920, Paint = 930, FishingRods = 1000, FishingQuestFish = 1010, Fish = 1015,
  FishingBait = 1020, Critters = 1030, Keys = 2000, RemainingUseItems = 5000, Material = 10000,
  EverythingElse = 11000,
}

export interface ItemSortId { group: number; order: number }

/**
 * CreativeHelper.GetItemGroup（ContentSamples.cs:117-675）1:1。
 * 分支顺序/组内序算式逐条对齐（orderInGroup 局部变量语义 = 返回值第二位）。
 * 出口 `| 0` 归一化：C# int 无 -0，JS `-rare` 会留 -0（toEqual 坑）。
 */
export function getItemSortId(vid: number): ItemSortId {
  const s = getItemSortIdRaw(vid);
  return { group: s.group, order: s.order | 0 };
}

function getItemSortIdRaw(vid: number): ItemSortId {
  const e = entry(vid);
  const ct = ctOf(e), cw = cwOf(e), tw = twOf(e), ps = psOf(e);
  const dmg = dmgOf(e);
  const idx = (arr: number[]) => arr.indexOf(vid);

  // :121-125 _manualBossSpawnItemsOrder
  let i = idx(MANUAL_BOSS_SPAWN_ORDER);
  if (i !== -1) return { group: ItemGroup.BossItem, order: i };
  // :127-131 golf
  i = idx(MANUAL_GOLF_ORDER);
  if (i !== -1) return { group: ItemGroup.Golf, order: i };
  // :133-136 SortingPriorityWiring
  const wire = sortWiringOf(vid);
  if (wire !== -1) return { group: ItemGroup.Wiring, order: -wire };
  // :138-139
  if (vid === 3620) return { group: ItemGroup.Wiring, order: 0 };
  // :141-143 keys（庙钥族）
  if ([327, 329, 1141, 1533, 1537, 1536, 1534, 1535, 3092, 3091, 4714].includes(vid)) {
    return { group: ItemGroup.Keys, order: -rareOf(e) };
  }
  // :145-147 rope 直配
  if ([985, 3079, 3005, 3080].includes(vid)) return { group: ItemGroup.Rope, order: 0 };
  // :149-151 solutions
  if ([781, 783, 780, 782, 784].includes(vid)) return { group: ItemGroup.Solutions, order: 0 };
  // :153-160 glowsticks（282 冷光棒排尾）
  if (GLOWSTICKS.has(vid)) return { group: ItemGroup.Glowsticks, order: vid === 282 ? -1 : 0 };
  // :162-164 bombs
  if ([166, 3115, 235, 167, 3547, 2896, 3196, 4908, 4909, 4827, 4826, 4825, 4423, 4824].includes(vid)) {
    return { group: ItemGroup.Bombs, order: 0 };
  }
  // :166-168 crates（createTile 376）
  if (ct === 376) return { group: ItemGroup.Crates, order: 0 };
  // :170-172 goodie bags
  if ([1774, 1869, 4345, 3093, 4410, 6142].includes(vid)) return { group: ItemGroup.GoodieBags, order: 0 };
  // :174-176 boss bags
  if (BOSS_BAGS.has(vid)) return { group: ItemGroup.BossBags, order: 0 };
  // :178-181 dye 材料（明胶×13）
  if ([1115, 1114, 1110, 1112, 1108, 1107, 1116, 1109, 1111, 1118, 1117, 1113, 1119].includes(vid)) {
    return { group: ItemGroup.DyeMaterial, order: 0 };
  }
  // :183-186 深层染料 4 件
  if (vid >= 3385 && vid <= 3388) return { group: ItemGroup.DyeMaterial, order: -1 };
  // :188-190 dye != 0
  if (e.dye) return { group: ItemGroup.Dye, order: 0 };
  // :192-194 hairDye != -1
  if (e.hd) return { group: ItemGroup.HairDye, order: 0 };
  // :196-215 IsACoin（71→4 … 74→1）
  if (vid >= 71 && vid <= 74) {                                    // Item.cs:354-362
    return { group: ItemGroup.Coin, order: vid === 71 ? 4 : vid === 72 ? 3 : vid === 73 ? 2 : 1 };
  }
  // :217-219 createWall > 0
  if (cw > 0) return { group: ItemGroup.Walls, order: 0 };
  // :221-222 alchemy seeds
  if (ct === 82) return { group: ItemGroup.AlchemySeeds, order: 0 };
  // :224-226 alchemy plants
  if ([315, 313, 316, 318, 314, 2358, 317].includes(vid)) return { group: ItemGroup.AlchemyPlants, order: 0 };
  // :228-243 wood 族
  if ([30, 321, 322, 157, 158, 208, 159, 253, 311, 635].includes(ct)) {
    return { group: ItemGroup.Wood, order: ct === 30 ? 0 : ct === 311 ? 100 : 50 };
  }
  // :245-377 createTile >= 0 大族
  if (ct >= 0) {
    if (vid === 213) return { group: ItemGroup.Wands, order: 0 };
    if (vid === 5295) return { group: ItemGroup.Wands, order: 5 };
    if (tw >= 0) return { group: ItemGroup.Wands, order: 10 };
    if ([213, 353, 365, 366, 214].includes(ct)) return { group: ItemGroup.Rope, order: 0 };
    if (!tileSolid(ct) || tileSolidTop(ct) || ct === 10) {
      // PlaceableObjects 子序（:263-371）
      i = idx(MANUAL_CRAFTING_STATIONS);
      if (i !== -1) return { group: ItemGroup.CraftingObjects, order: i };
      if (TILE_TORCHES.has(ct)) return { group: ItemGroup.Torches, order: ct === 4 && ps === 0 ? 5 : 10 };
      let o = -1;
      if (ct === 178) o = 5;
      else if (ct === 239) o = 7;
      else if ([27, 4857, 4852, 4856, 4854, 4855, 4853, 4851].includes(vid)) o = 8;
      else if (TILE_PLATFORMS.has(ct)) o = ps === 0 ? 19 : 20;
      else if (ct === 18) o = ps === 0 ? 29 : 30;
      else if (ct === 16 || ct === 134) o = ps === 0 ? 39 : 40;
      else if (ct === 133 || ct === 17) o = ps === 0 ? 49 : 50;
      else if (ct === 10) o = ps === 0 ? 59 : 60;
      else if (ct === 15) o = ps === 0 ? 69 : 70;
      else if (ct === 497) o = 72;
      else if (ct === 79) o = ps === 0 ? 74 : 75;
      else if (ct === 14) o = ps === 0 ? 79 : 80;
      else if (ct === 469) o = 90;
      else if (ct === 21) o = ps === 0 ? 99 : 100;
      else if (ct === 467) o = 110;
      else if (ct === 441) o = 120;
      else if (ct === 468) o = 130;
      else o = ct + 1000;
      return { group: ItemGroup.PlaceableObjects, order: o };
    }
    // Blocks（:373-377）
    let o = TILE_GRASS.has(ct) || vid === 194 ? 5 : 10000;
    if (vid === 2) o = 10;
    else if (vid === 3) o = 20;
    else if (vid === 133) o = 30;
    else if (vid === 424) o = 40;
    else if (vid === 1103) o = 50;
    else if (vid === 169) o = 60;
    else if (vid === 170) o = 70;
    else if (vid === 176) o = 80;
    else if (vid === 276) o = 80;
    return { group: ItemGroup.Blocks, order: o };
  }
  // :379-385 mountType
  if (e.mt) return e.cart ? { group: ItemGroup.Minecart, order: 0 } : { group: ItemGroup.Mount, order: 0 };
  // :387-390 bait
  if ((e.bait ?? 0) > 0) return { group: ItemGroup.FishingBait, order: -e.bait! };
  // :392-394 makeNPC（捕获小动物）
  if ((e.mnpc ?? 0) > 0) return { group: ItemGroup.Critters, order: 0 };
  // :396-398 fishingPole > 1（默认 1——纯钓竿直配）
  if (fpOf(e) > 1) return { group: ItemGroup.FishingRods, order: -fpOf(e) };
  // :400-413 quest fish
  if (e.qi) return { group: ItemGroup.FishingQuestFish, order: 0 };
  if ((vid >= 2297 && vid <= 2321) || vid === 4402 || vid === 4401 || vid === 2290) {
    return { group: ItemGroup.FishingQuestFish, order: -rareOf(e) };
  }
  // :415-419 paint
  const paint = sortPaintingOf(vid);
  if (paint !== -1 || e.pc) return { group: ItemGroup.Paint, order: -paint };
  // :421-425 event items
  i = idx(MANUAL_EVENT_ORDER);
  if (i !== -1) return { group: ItemGroup.EventItem, order: i };
  // :427-429 hook（projHook[shoot]）
  if ((e.shoot ?? 0) !== 0 && e.hook) return { group: ItemGroup.Hook, order: 0 };
  // :431-433 手表 buff 药
  if ([2756, 2351, 4870, 2350, 2997, 2352, 2353].includes(vid)) return { group: ItemGroup.BuffPotion, order: 0 };
  // :435-453 buffType 族
  const bt = e.bt ?? 0;
  if (bt !== 0) {
    if (BUFF_WELL_FED.has(bt)) return { group: ItemGroup.Food, order: -bt * 10000000 - (e.bft ?? 0) };
    if (BUFF_FLASK.has(bt)) return { group: ItemGroup.Flask, order: 0 };
    if (e.pet) return { group: ItemGroup.VanityPet, order: 0 };
    if (e.light) return { group: ItemGroup.VanityPet, order: 0 };
    if (dmg === -1) return { group: ItemGroup.BuffPotion, order: 0 };
  }
  // :455-485 盔甲三槽（vanity +100000 押尾）
  const armorOrder = (): number => -defOf(e) - rareOf(e) * 1000 + (e.van ? 100000 : 0);
  if (e.hs) return { group: ItemGroup.Headgear, order: armorOrder() };
  if (e.bs) return { group: ItemGroup.Torso, order: armorOrder() };
  if (e.ls) return { group: ItemGroup.Pants, order: armorOrder() };
  // :487-503 accessories
  if (e.acc !== undefined) {
    let o = (e.van ? 1 : 0) - (e.exp ? 1 : 0);
    if (vid >= 3293 && vid <= 3308) o -= 200000;
    else if (vid >= 3309 && vid <= 3314) o -= 100000;
    o -= rareOf(e) * 10000;
    if (e.van) o += 100000;
    return { group: ItemGroup.Accessories, order: o };
  }
  // :505-519 三工具
  if ((e.pick ?? 0) > 0) return { group: ItemGroup.Pickaxe, order: -e.pick! };
  if ((e.axe ?? 0) > 0) return { group: ItemGroup.Axe, order: -e.axe! };
  if ((e.hammer ?? 0) > 0) return { group: ItemGroup.Hammer, order: -e.hammer! };
  // :521-547 life potions
  if ((e.hl ?? 0) > 0) {
    const o = vid === 3544 ? 0 : vid === 5496 ? 1 : vid === 499 ? 2 : vid === 188 ? 3 : vid === 28 ? 4 : -e.hl! + 1000;
    return { group: ItemGroup.LifePotions, order: o };
  }
  // :549-551 mana potions
  if ((e.hm ?? 0) > 0) return { group: ItemGroup.ManaPotions, order: -e.hm! };
  // :553-556 ammo
  if (ammoOf(e) !== 0 && !e.nam && vid !== 23 && vid !== 75) {
    return { group: ItemGroup.Ammo, order: -ammoOf(e) * 10000 - Math.max(dmg, 0) };
  }
  // :558-596 consumables
  if (e.cons) {
    if (dmg > 0) {
      return { group: ItemGroup.ConsumableThatDamages, order: [422, 423, 3477].includes(vid) ? -100000 : -dmg };
    }
    let o = 0;
    if ([4910, 4829, 4830].includes(vid)) o = 10;
    else if ([66, 2886, 67].includes(vid)) o = -10;
    else if (vid >= 1874 && vid <= 1905) o = 5;
    return { group: ItemGroup.ConsumableThatDoesNotDamage, order: o };
  }
  // :598-613 武器四类
  if (dmg > 0) {
    const o = -dmg;
    if (e.m) return { group: ItemGroup.MeleeWeapon, order: o };
    if (e.rg) return { group: ItemGroup.RangedWeapon, order: o };
    if (e.mg) return { group: ItemGroup.MagicWeapon, order: o };
    if (e.sm) return { group: ItemGroup.SummonWeapon, order: o };
  }
  // :615-622 尾段
  const o = -rareOf(e);
  if ((e.us ?? 0) !== 0) return { group: ItemGroup.RemainingUseItems, order: o };
  if (e.mat) return { group: ItemGroup.Material, order: o };
  return { group: ItemGroup.EverythingElse, order: o };
}

// ---------------------------------------------------------------------------
// 过滤器（ItemFilters.cs 1:1）
// ---------------------------------------------------------------------------

/** 过滤器键（UICreativeInfiniteItemsDisplay.cs:76-92 装配序 + MiscFallback） */
export const JOURNEY_FILTER_KEYS = [
  'weapon', 'armor', 'vanity', 'buildingBlock', 'furniture', 'accessories',
  'miscAccessories', 'consumables', 'tools', 'materials', 'miscFallback',
] as const;
export type JourneyFilterKey = typeof JOURNEY_FILTER_KEYS[number];

/** 各过滤器的原版 l10n 显示键（GetDisplayNameKey） */
export const FILTER_L10N: Record<JourneyFilterKey, string> = {
  weapon: 'CreativePowers.TabWeapons',
  armor: 'CreativePowers.TabArmor',
  vanity: 'CreativePowers.TabVanity',
  buildingBlock: 'CreativePowers.TabBlocks',
  furniture: 'CreativePowers.TabFurniture',
  accessories: 'CreativePowers.TabAccessories',
  miscAccessories: 'CreativePowers.TabAccessoriesMisc',
  consumables: 'CreativePowers.TabConsumables',
  tools: 'CreativePowers.TabTools',
  materials: 'CreativePowers.TabMaterials',
  miscFallback: 'CreativePowers.TabMisc',
};

/** ItemFilters.Tools._itemIdsThatAreAccepted（:138-146） */
const TOOL_EXTRA_IDS = new Set<number>([
  213, 5295, 509, 850, 851, 3612, 3625, 3611, 510, 849,
  3620, 1071, 1543, 1072, 1544, 1100, 1545, 50, 3199, 3124,
  5358, 5359, 5360, 5361, 5437, 1326, 5335, 3384, 4263, 4819,
  4262, 946, 4707, 205, 206, 207, 1128, 3031, 4820, 5302,
  5364, 4460, 4608, 4872, 3032, 5303, 5304, 1991, 4821, 3183,
  779, 5134, 1299, 4711, 4049, 114, 5667,
]);

/** AAccessories.IsMiscEquipment（ItemFilters.cs:296-303）：
 *  坐骑/矿车（mountType!=-1）、宠物/光源（vanityPet/lightPet[buffType]）、
 *  钩爪（projHook[shoot]） */
function isMiscEquipment(e: CatEntry): boolean {
  return !!(e.mt || e.pet || e.light || e.hook);
}

/** 单过滤器判定（ItemFilters.cs 各 FitsFilter 1:1） */
export function fitsFilter(vid: number, key: JourneyFilterKey): boolean {
  const e = entry(vid);
  switch (key) {
    case 'weapon':           // :197
      return dmgOf(e) > 0;
    case 'armor':            // AArmor.IsAnArmorThatMatchesSocialState(:218-225)
      return !!(e.hs || e.bs || e.ls) && !e.van;
    case 'vanity':
      return !!(e.hs || e.bs || e.ls) && !!e.van;
    case 'buildingBlock':    // :76-90
      if (cwOf(e) !== -1) return true;
      if (twOf(e) !== -1) return true;
      if (ctOf(e) === -1) return false;
      return !tileFrameImportant(ctOf(e));
    case 'furniture':        // :113-118
      return ctOf(e) !== -1 && tileFrameImportant(ctOf(e));
    case 'accessories':      // :282-294（NonMisc）
      return !isMiscEquipment(e) && e.acc !== undefined;
    case 'miscAccessories':  // Misc
      return isMiscEquipment(e);
    case 'consumables': {    // :355-367
      if (vid === 267 || vid === 1307) return true;
      const placeable = ctOf(e) !== -1 || cwOf(e) !== -1 || twOf(e) !== -1;
      return !!e.cons && !placeable;
    }
    case 'tools':            // :148-175
      if ((e.pick ?? 0) > 0 || (e.axe ?? 0) > 0 || (e.hammer ?? 0) > 0) return true;
      if (fpOf(e) > 0) return true;
      if (twOf(e) !== -1) return true;
      return TOOL_EXTRA_IDS.has(vid);
    case 'materials':        // :448-450
      return !!e.mat;
    case 'miscFallback': {   // :419-427（其余 10 之外的兜底桶——过滤数组序 = 装配序）
      const others: JourneyFilterKey[] = ['weapon', 'armor', 'vanity', 'buildingBlock',
        'furniture', 'accessories', 'miscAccessories', 'consumables', 'tools', 'materials'];
      return !others.some((k) => fitsFilter(vid, k));
    }
  }
}

// ---------------------------------------------------------------------------
// 搜索（ItemFilters.BySearch 的仓库变体：物品名 l10n 双语模糊）
// ---------------------------------------------------------------------------
// 原版 BySearch（ItemFilters.cs:30-50）对物品全部 tooltip 行做大小写不敏感子串。
// 本仓 tooltip 文本管线不落地（战斗字体/悬浮图标管线外的整行文本无数据表），
// 近似 = 当前语言物品名（Lang.itemName——12 语言官方译文）+ 英文名（ITEM_NAME_EN）
// + 内部名（ITEM_NAME_BY_ID）三源大小写不敏感子串【偏差登记】。

/** 双语搜索匹配（searchText 已 trim；空 = 全匹配——EntryFilterer.SetSearchFilter :85-94） */
export function searchMatches(vid: number, searchText: string | null): boolean {
  if (!searchText) return true;
  const q = searchText.toLowerCase();
  const internal = ITEM_NAME_BY_ID[vid] ?? '';
  if (internal.toLowerCase().includes(q)) return true;
  const en = ITEM_NAME_EN_BY_ID[vid] ?? '';
  if (en.toLowerCase().includes(q)) return true;
  const shown = Lang.itemName(vid);
  return shown !== null && shown.toLowerCase().includes(q);
}

// ---------------------------------------------------------------------------
// 排序步链（SortingSteps.cs + EntrySorter.cs :17-40，prioritized=0 等价顺序链）
// ---------------------------------------------------------------------------

/** 研究状态最小面（ByUnlockStatus :91-115 消费；Research 实现之——
 *  isResearched = IsFullyResearched） */
export interface ResearchSortView {
  isNewlyResearched(vid: number): boolean;
  isResearched(vid: number): boolean;
}

/** 排序键缓存（getItemSortId 纯函数 + Map） */
const sortIdCache = new Map<number, ItemSortId>();
export function sortIdOf(vid: number): ItemSortId {
  let s = sortIdCache.get(vid);
  if (!s) { s = getItemSortId(vid); sortIdCache.set(vid, s); }
  return s;
}

/**
 * 全链比较器：ByUnlockStatus → ByCreativeSortingId → Alphabetical。
 * Alphabetical（SortingSteps.cs:138-147）= item.Name（当前语言本地化显示名）
 * String.CompareTo（current culture 敏感）。本仓用 ITEM_NAME_BY_ID（内部英文名）
 * 按码元序比较【偏差登记 SW-FX15 勘误：旧注「中文显示名不参与」系误述——原版
 * zh-Hans 下按中文名文化序；本仓改随语言会让排序结果依赖 ICU 环境且打翻既有
 * 金标断言，故保持内部名序,组内次序差异备案】。
 */
export function makeJourneyComparator(research: ResearchSortView) {
  const nameOf = (vid: number): string => ITEM_NAME_BY_ID[vid] ?? `#${vid}`;
  return (a: number, b: number): number => {
    // ByUnlockStatus（:91-115）：newly 优先 → fully 优先
    const na = research.isNewlyResearched(a), nb = research.isNewlyResearched(b);
    if (na !== nb) return na ? -1 : 1;
    const fa = research.isResearched(a), fb = research.isResearched(b);
    if (fa !== fb) return fa ? -1 : 1;
    // ByCreativeSortingId（:124-135）
    const sa = sortIdOf(a), sb = sortIdOf(b);
    if (sa.group !== sb.group) return sa.group - sb.group;
    if (sa.order !== sb.order) return sa.order - sb.order;
    // Alphabetical（:145-151）
    const va = nameOf(a), vb = nameOf(b);
    return va < vb ? -1 : va > vb ? 1 : 0;
  };
}

// ---------------------------------------------------------------------------
// 组装管线（UICreativeInfiniteItemsDisplay.UpdateContents :541-554 1:1）
// ---------------------------------------------------------------------------

export interface BrowserQuery {
  /** 搜索词（trim 后；空/null = 不过滤——EntryFilterer.SetSearchFilter 白空门） */
  search: string | null;
  /** 活动过滤器（原版 UI 互斥单选——UICreativeItemsInfiniteFilteringOptions.singleFilterButtonClick
   *  :87-99：点非活动项先 Clear 再 Toggle；EntryFilterer 语义上允许多个 OR，此处保留数组面） */
  activeFilters: JourneyFilterKey[];
}

/** 过滤 + 排序全链（UpdateContents：搜索 AND → 活动过滤器 OR → sorter.Sort） */
export function runBrowserQuery(
  vids: number[],
  q: BrowserQuery,
  research: ResearchSortView,
): number[] {
  const out = vids.filter((vid) => {
    if (!searchMatches(vid, q.search)) return false;          // 搜索 AND（EntryFilterer :31-34）
    if (q.activeFilters.length === 0) return true;            // :43-45 无活动 = 全过
    return q.activeFilters.some((k) => fitsFilter(vid, k));   // :47-54 活动 OR
  });
  out.sort(makeJourneyComparator(research));
  return out;
}

/** 浏览器可展示总数上限语义 = 传入选集（原版 = 研究进度>0 的物品集） */
export function journeycatEntryCount(): number { return Object.keys(ENTRIES).length; }

// ---------------------------------------------------------------------------
// ★SW-FX15 复制面板点击臂（ItemSlot.cs 1:1——原版槽交互 = ItemSlot.Handle(ref item, 29|34)，
// UICreativeItemGrid.DrawSlot :21-27）
//   · 普点（光标空）→ PickItemMovementAction（ItemSlot.cs:1459）case 29 :1599-1603 → 臂 5；
//     LeftClick case 5（ItemSlot.cs:1215-1226）：光标收下整组 =
//     stack=OnlyNeedOneInInventory()?1:maxStack，音效 7（Grab），JourneyDuplicationItemCreationContext
//   · Shift 点 → OverrideHover/GetAlternateClickAction（:679-697）case 29 →
//     TransferToBackpack(cursorOverride 7)；LeftClick cursorOverride==7 臂（:749-765）：
//     整组经 Player.GetItem(QuickTransferFromSlot) 入包，音效 12
//   · 普点（光标非空）→ 臂 0 = 无操作（case 5 门 Main.mouseItem.IsAir）
// ---------------------------------------------------------------------------

/** ItemID.Sets.OnlyNeedOneInInventoryOverride（ItemID.cs:1223-1278，28 对） */
const ONLY_NEED_ONE_TRUE = new Set<number>([
  1522, 1523, 1524, 1525, 1526, 1527, 3643, 3103, 3104, 856, 1299, 329,
  4346, 5391, 4767, 5453, 5309, 5454, 5323, 5455, 6190, 6195,
]);
const ONLY_NEED_ONE_FALSE = new Set<number>([205, 206, 207, 1128, 267, 849]);

/** Item.CanBeEquipped（Item.cs）——甲三槽/饰品/钩爪 shoot/坐骑/宠物·光源 buff */
function canBeEquipped(e: CatEntry): boolean {
  const armored = !!(e.hs || e.bs || e.ls || e.acc !== undefined
    || ((e.shoot ?? 0) > 0 && e.hook) || e.mt);
  if (armored) return true;
  const bt = e.bt ?? 0;
  if (bt > 0) return e.pet ? true : !!e.light;
  return false;
}

/** Item.OnlyNeedOneInInventory（Item.cs:1177-1192）1:1：
 *  表覆写优先 → !consumable：（useStyle==0 → CanBeEquipped / 否则 true）→ consumable=false */
export function onlyNeedOneInInventory(vid: number): boolean {
  if (ONLY_NEED_ONE_TRUE.has(vid)) return true;
  if (ONLY_NEED_ONE_FALSE.has(vid)) return false;
  const e = entry(vid);
  if (!e.cons) {
    if ((e.us ?? 0) === 0) return canBeEquipped(e);
    return true;
  }
  return false;
}

/** 点击执行计划（纯函数——测试消费） */
export interface BrowserClickPlan {
  to: 'cursor' | 'backpack';
  stack: number;
  sound: 'pickup' | 'menuTick';
}

/**
 * 复制面板点击臂决策（UICreativeItemGrid context 29 全语义 1:1，见上锚注）。
 * @param vid          原版物品 id
 * @param shift        shift 臂（TransferToBackpack）
 * @param cursorOccupied 光标持物（arm 5 门 = Main.mouseItem.IsAir 取反）
 * @param maxStack     该物品 maxStack（调用方从 ITEM_DEFS 提供）
 */
export function browserClickPlan(
  vid: number, shift: boolean, cursorOccupied: boolean, maxStack: number,
): BrowserClickPlan | null {
  const stack = onlyNeedOneInInventory(vid) ? 1 : Math.max(1, maxStack);
  if (!shift) {
    if (cursorOccupied) return null;                       // case 5 门 mouseItem.IsAir
    return { to: 'cursor', stack, sound: 'pickup' };       // 音效 7（LeftClick :1219）
  }
  return { to: 'backpack', stack, sound: 'menuTick' };     // 音效 12（cursorOverride 7 臂 :763）
}
