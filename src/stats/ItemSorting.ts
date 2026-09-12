// ★SW-FX29：Sort 钮功能——Terraria.UI/ItemSorting.cs 整库移植（1457 终值）。
// 反编译基准 = Terarria1457/Terraria.UI/ItemSorting.cs（1458 同文件逐字节相同,
// diff 零输出;行号即 1457）。数据 = vanilla-itemsorting.json v2（tools/extract-
// itemsorting.mjs 自 1457 直提：52 层白名单 layers + 21 张 SortingPriority 集 prio/
// buffFoodPrio + bools + frameImportant + 逐 vid 稀疏属性 attrs）。
//
// 结构定谳（ItemSorting.cs）：
//  · ItemSortingLayer 集(:37-1175)——52 层,每层=谓词(itemsToSort 筛选+自摘除)+
//    比较器(SortIndicesStable :1142,x-y 兜底=稳定);前 4 层(近战/远程/魔法/召唤)
//    排序时按玩家四系伤害倍率降序换位(AddSortingPrioritiesBasedOnPlayerDamage
//    :1356-1379,倍率平序按固定下标),白名单构建期(:1278-1281)固定 Melee→Ranged→
//    Magic→Minions 序。
//  · SetupWhiteLists(:1272-1354)——加载期对全物品宇宙逐层跑谓词,先到先得;产物=
//    每层白名单+_layerIndexForItemType;★不变量(:1353 Invariant.Assert)——
//    LastNotTrash 白名单必须为空(所有原版物品都被 0-49 层认领;Last Not Trash/
//    Last Trash 两层是「白名单外物品」的运行时尾接面, Validate(:23-29) 会把
//    非本层白名单物品退回 itemsToSort,多职业物品因此永远归属白名单层)。
//  · Sort(:1436-1541)——①收集 itemsToSort(非收藏非空非air,跳过 ignoreSlots);
//    ②同型并叠(j 有空位则向 k>j 吸收,CanStack=同型+同词缀 Item.cs:49870);
//    ③可用槽=待排槽+空槽升序;④逐层 谓词→Validate→摘除→层内排序;⑤剩余
//    itemsToSort 尾接(:1517,白名单外物品);⑥整段缓存后按 availableSortingSlots[0]
//    依序落位,withFeedback 时 ItemSlot.SetGlow(slot, hue, chest!= -1)逐层扫色带
//    (hue=(层内序+0.5)/非空层数,:1523-1537;贴图换 Back13+hslToRgb(hue,1,.5)
//    Lerp 渐隐 300t,ItemSlot.cs:2291——仓内呈现=UI.setSlotGlow CSS 近似,已存在)。
//  · SortInventory(:1560-1571)——HasLockedInventory 门(:1562)→无钱袋(905)则
//    SortCoins(:1715-1824 币种合并:99/100 进位,铂金 9999 封顶,币槽 50-53 优先,
//    溢出 QuickSpawnItem)→SortAmmo(:1626-1629=ClearAmmoSlotSpaces+FillAmmoFrom
//    Inventory)→Sort(true, inventory, 0-9,50-58)——只排背包主体 10-49。
//  · SortInventory(Chest, withSync, withFeedback)(:1599-1624)——容器面 Sort +
//    MemoryStamp 逐槽差异 net 同步(32)(单人仓无 net 面, stamps 略,行为面等价);
//    调用方 = SortChest(:1573-1597)←ChestUI 按钮 case4(ChestUI.cs:300);本仓箱面
//    按钮未建(债,见报告),引擎面先行。
//  · 消费链(Main.cs:42587-42620)——Sort 钮(534,244) chest==-1 && npcShop==0 时
//    绘制;左键释放 → ItemSorting.SortInventory() + PlaySound(12)(menuTick);
//    悬停 MouseTextNoOverride("GameUI.SortInventory")。仓内 = UI.ts vinvSortBtn。
//  · 原版无逐件飞行动画——唯一反馈=槽位 hue 色带渐隐(SetGlow 300t)+音效 12。
import rawJson from '../data/vanilla-itemsorting.json';
import { ITEM_DEFS } from '../data/items';
import { internalIdOfVanilla, vanillaIdOfItem } from './Shimmer';
import { itemMatchKey } from './QuickStacking';

/** 仓内槽位物品形状（Inventory.InvItem 的引擎视图域） */
export type SortSlot = { id: number; stack: number; prefix?: number; favorited?: boolean; placeStyle?: number } | null;

// ============ 数据面（vanilla-itemsorting.json v2） ============

interface PrioSet { def: number; map: Map<number, number> }
interface AttrRecord { [k: string]: number | string | undefined }
interface SortData {
  layers: Map<number, number>;
  /** 层下标 → 白名单 vid 集（SetupWhiteLists 产物;Validate 消费面） */
  whitelists: Set<number>[];
  prio: Record<string, PrioSet>;
  buffFood: PrioSet;
  isFood: Set<number>;
  isCrate: Set<number>;
  isBasicFish: Set<number>;
  frameImportant: Set<number>;
  attrs: Map<number, AttrRecord>;
  itemCount: number;
}

const prioOf = (pairs: readonly [number, number][]): PrioSet => ({
  def: -1,
  map: new Map(pairs),
});

function buildData(raw: typeof rawJson): SortData {
  const layers = new Map<number, number>();
  for (const [k, v] of Object.entries(raw.layers)) layers.set(Number(k), v as number);
  const whitelists: Set<number>[] = Array.from({ length: 52 }, () => new Set<number>());
  for (const [vid, layer] of layers) whitelists[layer]?.add(vid);
  const prio: Record<string, PrioSet> = {};
  for (const [name, pairs] of Object.entries(raw.prio)) prio[name] = prioOf(pairs as [number, number][]);
  const attrs = new Map<number, AttrRecord>();
  for (const [k, v] of Object.entries(raw.attrs)) attrs.set(Number(k), v as AttrRecord);
  return {
    layers, whitelists, prio,
    buffFood: prioOf(raw.buffFoodPrio as [number, number][]),
    isFood: new Set(raw.bools.IsFood),
    isCrate: new Set(raw.bools.IsFishingCrate),
    isBasicFish: new Set(raw.bools.IsBasicFish),
    frameImportant: new Set(raw.frameImportant),
    attrs,
    itemCount: raw.meta.itemCount,
  };
}

let DATA: SortData = buildData(rawJson);

/** 变异实验注入口（红蓝自审:层表错位/比较器反序判别力验证后必须复原） */
export function useSortDataForTests(d: SortData | null): void {
  DATA = d ?? buildData(rawJson);
}

/** 仅供测试/金标读取当前数据面 */
export function getSortDataForTests(): SortData {
  return DATA;
}

// ============ 物品视图（attrs 稀疏记录 → 全量默认值视图） ============

export interface SortView {
  type: number;            // 原版 vid（自定义物品=负域编码,见 itemMatchKey）
  internalId: number;
  stack: number;
  prefix: number;
  favorited: boolean;
  maxStack: number;
  name: string;
  // ---- attrs 面（缺省=0/false/-1,与 Item.cs 字段缺省对齐） ----
  damage: number; defense: number; pick: number; axe: number; hammer: number;
  ammo: number; fishingPole: number; bait: number; buffType: number;
  healLife: number; healMana: number; paint: number; paintCoating: number;
  dye: number; hairDye: number; makeNPC: number; rare: number; value: number;
  mountType: number; headSlot: number; bodySlot: number; legSlot: number;
  createTile: number; createWall: number;
  melee: boolean; ranged: boolean; magic: boolean; summon: boolean;
  consumable: boolean; notAmmo: boolean; questItem: boolean; accessory: boolean;
  vanity: boolean; mech: boolean; hook: boolean; lightPet: boolean; vanityPet: boolean;
  cart: boolean; isFood: boolean; isCrate: boolean; isBasicFish: boolean;
  /** 白名单层下标;-1 = 白名单外（原版语义:模组/未载入物品→排序尾接面） */
  layer: number;
}

const n = (a: AttrRecord, k: string): number => (typeof a[k] === 'number' ? (a[k] as number) : 0);
const b = (a: AttrRecord, k: string): boolean => a[k] !== undefined;

function viewOfSlot(item: NonNullable<SortSlot>): SortView {
  const vid = vanillaIdOfItem(item.id);
  const a = vid >= 0 ? DATA.attrs.get(vid) : undefined;
  const def = ITEM_DEFS[item.id];
  const type = itemMatchKey(item.id);
  if (a) {
    return {
      type, internalId: item.id, stack: item.stack, prefix: item.prefix ?? 0,
      favorited: !!item.favorited, maxStack: def?.maxStack ?? 1,
      name: typeof a.nm === 'string' ? a.nm : (def?.name ?? ''),
      damage: n(a, 'd'), defense: n(a, 'df'), pick: n(a, 'pk'), axe: n(a, 'ax'), hammer: n(a, 'ha'),
      ammo: n(a, 'am'), fishingPole: n(a, 'fp'), bait: n(a, 'bt'), buffType: n(a, 'bf'),
      healLife: n(a, 'hl'), healMana: n(a, 'hm'), paint: n(a, 'pt'), paintCoating: n(a, 'pc'),
      dye: n(a, 'dy'), hairDye: a.hd !== undefined ? (a.hd as number) : -1,
      makeNPC: n(a, 'mn'), rare: n(a, 'r'), value: n(a, 'vl'),
      mountType: a.mt !== undefined ? (a.mt as number) : -1,
      headSlot: a.hs !== undefined ? (a.hs as number) : -1,
      bodySlot: a.bs !== undefined ? (a.bs as number) : -1,
      legSlot: a.ls !== undefined ? (a.ls as number) : -1,
      createTile: a.ct !== undefined ? (a.ct as number) : -1,
      createWall: n(a, 'cw'),
      melee: b(a, 'm'), ranged: b(a, 'rg'), magic: b(a, 'g'), summon: b(a, 's'),
      consumable: b(a, 'c'), notAmmo: b(a, 'na'), questItem: b(a, 'q'), accessory: b(a, 'ac'),
      vanity: b(a, 'v'), mech: b(a, 'me'), hook: b(a, 'fk'), lightPet: b(a, 'lp'),
      vanityPet: b(a, 'vp'), cart: b(a, 'ca'), isFood: b(a, 'fo'), isCrate: b(a, 'fc'),
      isBasicFish: b(a, 'fb'),
      layer: DATA.layers.get(vid) ?? -1,
    };
  }
  // 白名单外物品（本仓 place_v_* 等 vid<0 def）——原版对宇宙外物品的行为面=全部
  // 层谓词虽可能命中但 Validate 白名单退回,最终走尾接面(:1517)。属性面给最小值:
  // 谓词按 def 字段降级（damage>0 仍会命中 WeaponsAssorted 但 Validate 拦回）。
  return {
    type, internalId: item.id, stack: item.stack, prefix: item.prefix ?? 0,
    favorited: !!item.favorited, maxStack: def?.maxStack ?? 1,
    name: def?.name ?? '',
    damage: def?.tool?.damage ?? def?.magic?.damage ?? def?.ranged?.damage ?? 0,
    defense: 0, pick: def?.tool?.pickPower ?? 0, axe: def?.axePower ?? def?.tool?.axePower ?? 0,
    hammer: def?.tool?.hammerPower ?? 0, ammo: def?.ammoId ?? 0,
    fishingPole: 0, bait: 0, buffType: 0, healLife: def?.heal ?? 0, healMana: 0,
    paint: 0, paintCoating: 0, dye: 0, hairDye: -1, makeNPC: 0,
    rare: 0, value: def?.value ?? 0, mountType: -1, headSlot: -1, bodySlot: -1, legSlot: -1,
    createTile: def?.tile !== undefined ? 1 : -1, createWall: def?.wallId !== undefined ? 1 : 0,
    melee: false, ranged: false, magic: false, summon: false, consumable: false,
    notAmmo: false, questItem: false, accessory: false, vanity: false, mech: false,
    hook: false, lightPet: false, vanityPet: false, cart: false,
    isFood: false, isCrate: false, isBasicFish: false,
    layer: -1,
  };
}

// ============ 比较器原语（C# CompareTo 语义镜像） ============

const cmp = (x: number, y: number): number => (x < y ? -1 : x > y ? 1 : 0);
const cmpBool = (x: boolean, y: boolean): number => cmp(x ? 1 : 0, y ? 1 : 0);
/** string.Compare(x, y, OrdinalIgnoreCase)（:1068/:1088/:1111 名字比较器） */
function cmpName(x: string, y: string): number {
  const a = x.toUpperCase(), c = y.toUpperCase();
  return a < c ? -1 : a > c ? 1 : 0;
}
/** CompareWithPrioritySet（:1155-1174）——白名单成员优先于非成员,成员间按值升序 */
function compareWithPrioritySet(set: PrioSet, t1: number, t2: number): number {
  if (t1 < 0 || t2 < 0) return 0;
  const v1 = set.map.get(t1) ?? -1;
  const v2 = set.map.get(t2) ?? -1;
  if (v1 >= 0 && v2 < 0) return -1;
  if (v1 < 0 && v2 >= 0) return 1;
  if (v1 < 0 && v2 < 0) return 0;
  return cmp(v1, v2);
}
/** SortIndicesStable（:1142-1153）：comparison + x-y 兜底 */
const sortIndicesStable = (list: number[], cmpFn: (x: number, y: number) => number): void => {
  list.sort((x, y) => {
    const num = cmpFn(x, y);
    return num !== 0 ? num : cmp(x, y);
  });
};

// ============ 52 层谓词 + 比较器（ItemSorting.cs :39-1140 逐条对照） ============

export interface LayerDef {
  name: string;
  /** 谓词（v=槽内物品视图） */
  pred: (v: SortView) => boolean;
  /** 比较器（参数=SortViews 下标） */
  cmp: (x: SortView, y: SortView) => number;
}

const P = (name: string): PrioSet => DATA.prio[name];
const prioVal = (name: string, vid: number): number => DATA.prio[name]?.map.get(vid) ?? -1;
/** BuffID.Count（Terarria1457/Terraria.ID/BuffID.cs:973）——Potions - Food 比较器首键
 *  的 buffType 越界门（:712 buffType<0 || >=Count → 0） */
const BUFF_ID_COUNT = 401;

const LAYERS: LayerDef[] = [
  { name: 'Weapons - Melee',   // :39-57
    pred: (v) => v.damage > 0 && !v.consumable && v.ammo === 0 && v.melee && v.pick < 1 && v.hammer < 1 && v.axe < 1,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.damage, x.damage) },
  { name: 'Weapons - Ranged',  // :59-81
    pred: (v) => (v.damage > 0 && !v.consumable && v.ammo === 0 && v.ranged)
      || (v.type >= 0 && prioVal('SortingPriorityWeaponsRanged', v.type) > -1),
    cmp: (x, y) => compareWithPrioritySet(P('SortingPriorityWeaponsRanged')!, x.type, y.type)
      || cmp(y.rare, x.rare) || cmp(y.damage, x.damage) },
  { name: 'Weapons - Magic',   // :83-101
    pred: (v) => v.damage > 0 && !v.consumable && v.ammo === 0 && v.magic,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.damage, x.damage) },
  { name: 'Weapons - Minions', // :103-121
    pred: (v) => v.damage > 0 && !v.consumable && v.summon,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.damage, x.damage) },
  { name: 'Weapons - Assorted', // :123-141
    pred: (v) => v.damage > 0 && v.ammo === 0 && v.pick === 0 && v.axe === 0 && v.hammer === 0,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.damage, x.damage) },
  { name: 'Weapons - Ammo',    // :143-161
    pred: (v) => v.ammo > 0 && v.damage > 0,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.damage, x.damage) },
  { name: 'Tools - Picksaws',  // :163-173
    pred: (v) => v.pick > 0 && v.axe > 0,
    cmp: (x, y) => cmp(x.pick, y.pick) },
  { name: 'Tools - Hamaxes',   // :175-185
    pred: (v) => v.hammer > 0 && v.axe > 0,
    cmp: (x, y) => cmp(x.axe, y.axe) },
  { name: 'Tools - Pickaxes',  // :187-197
    pred: (v) => v.pick > 0,
    cmp: (x, y) => cmp(x.pick, y.pick) },
  { name: 'Tools - Axes',      // :199-209
    pred: (v) => v.axe > 0,
    cmp: (x, y) => cmp(x.axe, y.axe) },
  { name: 'Tools - Hammers',   // :211-221
    pred: (v) => v.hammer > 0,
    cmp: (x, y) => cmp(x.hammer, y.hammer) },
  { name: 'Tools - Terraforming', // :223-241
    pred: (v) => v.type > 0 && prioVal('SortingPriorityTerraforming', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityTerraforming', x.type), prioVal('SortingPriorityTerraforming', y.type)) || cmp(y.stack, x.stack) },
  { name: 'Tools - Fishing',   // :243-288
    pred: (v) => v.fishingPole > 0 || v.bait > 0 || v.questItem
      || (v.type > 0 && (DATA.isCrate.has(v.type) || DATA.isBasicFish.has(v.type) || prioVal('SortingPriorityToolsFishing', v.type) > -1)),
    cmp: (x, y) => compareWithPrioritySet(P('SortingPriorityToolsFishing')!, x.type, y.type)
      || cmp(y.fishingPole, x.fishingPole)
      || cmp(y.bait, x.bait)
      || cmp(y.questItem ? 1 : 0, x.questItem ? 1 : 0)
      || (y.type >= 0 && x.type >= 0
        ? (cmpBool(DATA.isCrate.has(y.type), DATA.isCrate.has(x.type))
          || cmpBool(DATA.isBasicFish.has(y.type), DATA.isBasicFish.has(x.type)))
        : 0)
      || cmp(y.rare, x.rare)
      || cmp(y.stack, x.stack) },
  { name: 'Tools - Golf',      // :290-312
    pred: (v) => v.type > 0 && prioVal('SortingPriorityToolsGolf', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityToolsGolf', x.type), prioVal('SortingPriorityToolsGolf', y.type)) || cmp(y.rare, x.rare) || cmp(y.stack, x.stack) },
  { name: 'Tools - Instruments', // :314-336
    pred: (v) => v.type > 0 && prioVal('SortingPriorityToolsInstruments', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityToolsInstruments', x.type), prioVal('SortingPriorityToolsInstruments', y.type)) || cmp(y.rare, x.rare) || cmp(y.stack, x.stack) },
  { name: 'Tools - Keys',      // :338-360
    pred: (v) => v.type > 0 && prioVal('SortingPriorityToolsKeys', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityToolsKeys', x.type), prioVal('SortingPriorityToolsKeys', y.type)) || cmp(y.rare, x.rare) || cmp(y.stack, x.stack) },
  { name: 'Tools - Kites',     // :362-384
    pred: (v) => v.type > 0 && prioVal('SortingPriorityToolsKites', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityToolsKites', x.type), prioVal('SortingPriorityToolsKites', y.type)) || cmp(y.rare, x.rare) || cmp(y.stack, x.stack) },
  { name: 'Weapons - Ammo Leftovers', // :386-404（ToolsAmmoLeftovers,名带 Weapons 前缀=原文如此）
    pred: (v) => v.ammo > 0 && v.type >= 0 && v.type < DATA.itemCount && !DATA.isFood.has(v.type) && prioVal('SortingPriorityMiscAcorns', v.type) === -1,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.damage, x.damage) },
  { name: 'Tools - Misc',      // :406-428
    pred: (v) => v.type > 0 && prioVal('SortingPriorityToolsMisc', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityToolsMisc', x.type), prioVal('SortingPriorityToolsMisc', y.type)) || cmp(y.rare, x.rare) || cmp(y.stack, x.stack) },
  { name: 'Armor - Combat',    // :430-452
    pred: (v) => (v.bodySlot >= 0 || v.headSlot >= 0 || v.legSlot >= 0) && !v.vanity,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.defense, x.defense) || cmp(x.type, y.type) },
  { name: 'Armor - Vanity',    // :454-472
    pred: (v) => (v.bodySlot >= 0 || v.headSlot >= 0 || v.legSlot >= 0) && v.vanity,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(x.type, y.type) },
  { name: 'Armor - Accessories', // :474-500
    pred: (v) => v.accessory,
    cmp: (x, y) => cmpBool(x.vanity, y.vanity) || cmp(y.rare, x.rare) || cmp(y.defense, x.defense) || cmp(x.type, y.type) },
  { name: 'Equip - Grapple',   // :502-520
    pred: (v) => v.hook,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(x.type, y.type) },
  { name: 'Equip - Mount',     // :522-540
    pred: (v) => v.mountType !== -1 && !v.cart,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(x.type, y.type) },
  { name: 'Equip - Cart',      // :542-560
    pred: (v) => v.mountType !== -1 && v.cart,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(x.type, y.type) },
  { name: 'Equip - Light Pet', // :562-580
    pred: (v) => v.buffType > 0 && v.lightPet,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(x.type, y.type) },
  { name: 'Equip - Vanity Pet', // :582-600
    pred: (v) => v.buffType > 0 && v.vanityPet,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(x.type, y.type) },
  { name: 'Potions - Dyes',    // :730-756
    pred: (v) => v.dye > 0 || (v.type >= 0 && prioVal('SortingPriorityPotionsDyeMaterial', v.type) > -1),
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.dye, x.dye)
      || compareWithPrioritySet(P('SortingPriorityPotionsDyeMaterial')!, x.type, y.type)
      || cmp(y.stack, x.stack) },
  { name: 'Potions - Hair Dyes', // :758-780
    pred: (v) => v.hairDye >= 0,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.hairDye, x.hairDye) || cmp(y.stack, x.stack) },
  { name: 'Potions - Life',    // :602-620
    pred: (v) => v.consumable && v.healLife > 0 && v.healMana < 1 && v.type !== 5,
    cmp: (x, y) => cmp(y.healLife, x.healLife) || cmp(y.stack, x.stack) },
  { name: 'Potions - Just The Mushroom', // :622-632
    pred: (v) => v.type === 5,
    cmp: (x, y) => cmp(y.stack, x.stack) },
  { name: 'Potions - Mana',    // :634-652
    pred: (v) => v.consumable && v.healLife < 1 && v.healMana > 0,
    cmp: (x, y) => cmp(y.healMana, x.healMana) || cmp(y.stack, x.stack) },
  { name: 'Potions - Elixirs', // :654-672
    pred: (v) => v.consumable && v.healLife > 0 && v.healMana > 0,
    cmp: (x, y) => cmp(y.healLife, x.healLife) || cmp(y.stack, x.stack) },
  { name: 'Potions - Buffs',   // :674-700
    pred: (v) => (v.consumable && v.buffType > 0 && v.type >= 0 && v.type < DATA.itemCount && !DATA.isFood.has(v.type))
      || (v.type >= 0 && prioVal('SortingPriorityPotionsBuffs', v.type) > -1),
    cmp: (x, y) => compareWithPrioritySet(P('SortingPriorityPotionsBuffs')!, x.type, y.type)
      || cmp(y.rare, x.rare) || cmp(x.type, y.type) || cmp(y.stack, x.stack) },
  { name: 'Potions - Food',    // :702-728
    pred: (v) => v.consumable && v.buffType > 0 && v.type >= 0 && v.type < DATA.itemCount && DATA.isFood.has(v.type),
    cmp: (x, y) => ((y.buffType >= 0 && y.buffType < BUFF_ID_COUNT && x.buffType >= 0)
      ? cmp(DATA.buffFood.map.get(y.buffType) ?? -1, DATA.buffFood.map.get(x.buffType) ?? -1)
      : 0)
      || cmp(y.rare, x.rare) || cmp(x.type, y.type) || cmp(y.stack, x.stack) },
  { name: 'Misc - Importants', // :782-800
    pred: (v) => v.type > 0 && prioVal('SortingPriorityMiscImportants', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityMiscImportants', x.type), prioVal('SortingPriorityMiscImportants', y.type)) || cmp(y.stack, x.stack) },
  { name: 'Misc - Painting',   // :882-908
    pred: (v) => (v.type > 0 && prioVal('SortingPriorityPainting', v.type) > -1) || v.paint > 0,
    cmp: (x, y) => cmp(prioVal('SortingPriorityPainting', y.type), prioVal('SortingPriorityPainting', x.type))
      || cmp(x.paint, y.paint) || cmp(x.paintCoating, y.paintCoating) || cmp(y.stack, x.stack) },
  { name: 'Misc - Wiring',     // :802-828
    pred: (v) => (v.type > 0 && prioVal('SortingPriorityWiring', v.type) > -1) || v.mech,
    cmp: (x, y) => cmp(prioVal('SortingPriorityWiring', y.type), prioVal('SortingPriorityWiring', x.type))
      || cmp(y.rare, x.rare) || cmp(y.type, x.type) || cmp(y.stack, x.stack) },
  { name: 'Misc - Materials',  // :830-848
    pred: (v) => v.type > 0 && prioVal('SortingPriorityMaterials', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityMaterials', y.type), prioVal('SortingPriorityMaterials', x.type)) || cmp(y.stack, x.stack) },
  { name: 'Misc - Just The Glowing Mushroom', // :850-860
    pred: (v) => v.type === 183,
    cmp: (x, y) => cmp(y.stack, x.stack) },
  { name: 'Misc - Ropes',      // :910-928
    pred: (v) => v.type > 0 && prioVal('SortingPriorityRopes', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityRopes', y.type), prioVal('SortingPriorityRopes', x.type)) || cmp(y.stack, x.stack) },
  { name: 'Misc - Herbs And Seeds', // :930-948
    pred: (v) => v.type > 0 && prioVal('SortingPriorityMiscHerbsAndSeeds', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityMiscHerbsAndSeeds', y.type), prioVal('SortingPriorityMiscHerbsAndSeeds', x.type)) || cmp(y.stack, x.stack) },
  { name: 'Misc - Acorns',     // :970-988
    pred: (v) => v.type > 0 && prioVal('SortingPriorityMiscAcorns', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityMiscAcorns', y.type), prioVal('SortingPriorityMiscAcorns', x.type)) || cmp(y.stack, x.stack) },
  { name: 'Misc - Gems',       // :950-968
    pred: (v) => v.type > 0 && prioVal('SortingPriorityMiscGems', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityMiscGems', y.type), prioVal('SortingPriorityMiscGems', x.type)) || cmp(y.stack, x.stack) },
  { name: 'Misc - Boss Bags',  // :990-1012
    pred: (v) => v.type > 0 && prioVal('SortingPriorityMiscBossBags', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityMiscBossBags', x.type), prioVal('SortingPriorityMiscBossBags', y.type)) || cmp(y.rare, x.rare) || cmp(y.stack, x.stack) },
  { name: 'Misc - Critters',   // :1014-1032
    pred: (v) => v.makeNPC > 0,
    cmp: (x, y) => cmp(x.makeNPC, y.makeNPC) || cmp(y.stack, x.stack) },
  { name: 'Misc - Extractinator', // :862-880
    pred: (v) => v.type > 0 && prioVal('SortingPriorityExtractibles', v.type) > -1,
    cmp: (x, y) => cmp(prioVal('SortingPriorityExtractibles', y.type), prioVal('SortingPriorityExtractibles', x.type)) || cmp(y.stack, x.stack) },
  { name: 'Last - Materials',  // :1034-1056
    pred: (v) => v.createTile < 0 && v.createWall < 1 && v.rare !== -1,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmp(y.value, x.value) || cmp(y.stack, x.stack) },
  { name: 'Last - Tiles (Frame Important)', // :1058-1076
    pred: (v) => v.createTile >= 0 && DATA.frameImportant.has(v.createTile),
    cmp: (x, y) => cmpName(x.name, y.name) || cmp(y.stack, x.stack) },
  { name: 'Last - Tiles (Common), Walls', // :1078-1096
    pred: (v) => v.createWall > 0 || v.createTile >= 0,
    cmp: (x, y) => cmpName(x.name, y.name) || cmp(y.stack, x.stack) },
  { name: 'Last - Not Trash',  // :1098-1120
    pred: (v) => v.rare >= 0,
    cmp: (x, y) => cmp(y.rare, x.rare) || cmpName(x.name, y.name) || cmp(y.stack, x.stack) },
  { name: 'Last - Trash',      // :1122-1140
    pred: () => true,
    cmp: (x, y) => cmp(y.value, x.value) || cmp(y.stack, x.stack) },
];

/** 层名表（原版 ItemSortingLayer.Name 字符串面;SetupWhiteLists 固定序） */
export const LAYER_NAMES = LAYERS.map((l) => l.name);

// ★SW-RB13c-e 测试接缝（金标白名单全量重放消费,引擎路径勿用）：52 层谓词/比较器
// 本体 + vid→引擎视图（与 viewOfSlot 单源;仅注册域 vid,vid<0 未注册件走 fallback 面）
export const LAYER_DEFS_FOR_TESTS: readonly LayerDef[] = LAYERS;
export function viewOfVidForTests(vid: number): SortView {
  return viewOfSlot({ id: internalIdOfVanilla(vid), stack: 1 });
}

// ============ SortCoins（:1715-1824,Utils.CoinsCount/CoinsSplit） ============

/** Utils.CoinsCount（Utils.cs:1054-1081）：ignoreSlots=58(trash)——币值合计(铜计)。
 *  ★原版 overFlowing 恒 false（CoinsCount 全文无置 true 支——置 true 只在
 *  CoinsCombineStacks）,:1719-1720 的 if(overFlowing) return 在原版即为死支,1:1 保留形状 */
function coinsCountCopper(slots: SortSlot[], ignore: number[]): { count: number; overFlowing: boolean } {
  let num = 0;
  for (let i = 0; i < slots.length; i++) {
    if (ignore.includes(i)) continue;
    const it = slots[i];
    if (!it || it.stack <= 0) continue;
    const vid = vanillaIdOfItem(it.id);
    if (vid === 71) num += it.stack;
    else if (vid === 72) num += it.stack * 100;
    else if (vid === 73) num += it.stack * 10000;
    else if (vid === 74) num += it.stack * 1000000;
  }
  return { count: num, overFlowing: false };
}

/** Utils.CoinsSplit（Utils.cs:1083-1097）：[铜, 银, 金, 铂] */
function coinsSplit(count: number): [number, number, number, number] {
  const array: [number, number, number, number] = [0, 0, 0, 0];
  let done = 0;
  let denom = 1000000;
  for (let i = 3; i >= 0; i--) {
    array[i] = Math.trunc((count - done) / denom);
    done += array[i] * denom;
    denom /= 100;
  }
  return array;
}

/** Item.CommonMaxStack（Item.cs:85） */
const COMMON_MAX_STACK = 9999;

function sortCoins(slots: SortSlot[], feedback?: SortFeedback): void {
  // HasItem(905) 门在 SortInventory(:1563-1565)——钱袋在场则整个币整理跳过
  const { count, overFlowing } = coinsCountCopper(slots, [58]);   // Utils.CoinsCount(...,58)
  if (overFlowing) return;                                        // :1720-1722（原版死支,形状保留）
  const array = coinsSplit(count);
  const commonMaxStack = COMMON_MAX_STACK;
  let needed = 0;                                                 // num:铜银金 99/堆 + 铂金 9999/堆
  for (let i = 0; i < 3; i++) {
    let num2 = array[i];
    while (num2 > 0) { num2 -= 99; needed++; }
  }
  let num3 = array[3];
  while (num3 > commonMaxStack) { num3 -= commonMaxStack; needed++; }
  let num4 = 0;                                                   // 现存币堆数（:1741-1748）
  for (let j = 0; j < slots.length; j++) {
    const it = slots[j];
    if (!it || it.stack <= 0) continue;
    const vid = vanillaIdOfItem(it.id);
    if (vid >= 71 && vid <= 74) num4++;
  }
  if (num4 < needed) return;                                      // :1749-1751 币槽不足整段放弃
  for (let k = 0; k < slots.length; k++) {                        // 清币（含收藏币,TurnToAir :1753-1759）
    const it = slots[k];
    if (!it || it.stack <= 0) continue;
    const vid = vanillaIdOfItem(it.id);
    if (vid >= 71 && vid <= 74) slots[k] = null;
  }
  let guard = 100;                                                // num5(:1760)
  for (;;) {
    let tier = -1;                                                // num6:自高档而低
    for (let t = 3; t >= 0; t--) {
      if (array[t] > 0) { tier = t; break; }
    }
    if (tier === -1) break;                                       // 全档归零=:1769-1773 break
    let num8 = array[tier];
    if (tier === 3 && num8 > commonMaxStack) num8 = commonMaxStack;
    let flag = false;                                             // 先币槽 50-53 后背包 0-49（:1781-1809）
    for (let l = 50; l < 54 && !flag; l++) {
      if (!slots[l] || slots[l]!.stack <= 0) {
        const id = internalIdOfVanilla(71 + tier);
        if (id >= 0) { slots[l] = { id, stack: num8 }; array[tier] -= num8; flag = true; }
      }
    }
    for (let m = 0; m < 50 && !flag; m++) {
      if (!slots[m] || slots[m]!.stack <= 0) {
        const id = internalIdOfVanilla(71 + tier);
        if (id >= 0) { slots[m] = { id, stack: num8 }; array[tier] -= num8; flag = true; }
      }
    }
    guard--;
    if (guard > 0) continue;
    // 溢出落地（:1815-1822 QuickSpawnItem 自高档而低）
    if (feedback?.onOverflowDrop) {
      for (let t = 3; t >= 0; t--) {
        if (array[t] > 0) feedback.onOverflowDrop(71 + t, array[t]);
      }
    }
    break;
  }
}

// ============ 弹药面（ClearAmmoSlotSpaces :1694-1713 / FillAmmoFromInventory
//  :1632-1692 / RefillItemStack :1826-1856 / TrySlidingUp :1858-1868） ============

/** Item.CanFillEmptyAmmoSlot（Item.cs:1360-1369 1:1）——bait/涂料/特殊弹药家族
 *  （凝胶23/沙169/坠星75/黑檀沙370/珍珠沙408/猩红沙1246/麦酒353/致动器849）不可自动填 */
function canFillEmptyAmmoSlot(v: SortView): boolean {
  const paintOrCoating = v.paint > 0 || v.paintCoating > 0;
  if (v.bait <= 0 && !paintOrCoating && v.type !== 353 && v.type !== 849 && v.type !== 169
    && v.type !== 75 && v.type !== 23 && v.type !== 408 && v.type !== 370 && v.type !== 1246) {
    return !v.notAmmo;
  }
  return false;
}

/** Item.FitsAmmoSlot（Item.cs:1351-1359 1:1） */
function fitsAmmoSlot(v: SortView): boolean {
  const paintOrCoating = v.paint > 0 || v.paintCoating > 0;
  if ((v.type !== 0 && v.ammo <= 0 && v.bait <= 0 && v.type !== 530 && v.type !== 849 && !paintOrCoating) || v.notAmmo) {
    return v.type === 353;
  }
  return true;
}

/** RefillItemStack（:1826-1856）——★比对域=item.type 相等（原文无 prefix 门） */
function refillItemStack(slots: SortSlot[], itemToRefill: NonNullable<SortSlot>, loopStart: number, loopEnd: number): void {
  let num = (ITEM_DEFS[itemToRefill.id]?.maxStack ?? 1) - itemToRefill.stack;
  if (num <= 0) return;
  for (let i = loopStart; i < loopEnd; i++) {
    const item = slots[i];
    if (!item || item.stack < 1) continue;
    if (itemMatchKey(item.id) !== itemMatchKey(itemToRefill.id)) continue;
    if (item.favorited) continue;
    let num2 = item.stack;
    if (num2 > num) num2 = num;
    num -= num2;
    itemToRefill.stack += num2;
    item.stack -= num2;
    if (item.stack <= 0) slots[i] = null;           // TurnToAir
    if (num <= 0) break;
  }
}

/** TrySlidingUp（:1858-1868）：向上找空位交换 */
function trySlidingUp(slots: SortSlot[], slot: number, minimumIndex: number): void {
  for (let i = minimumIndex; i < slot; i++) {
    if (!slots[i] || slots[i]!.stack <= 0) {
      const tmp = slots[i];
      slots[i] = slots[slot];
      slots[slot] = tmp;
      break;
    }
  }
}

/** SortAmmo（:1626-1629）＝ClearAmmoSlotSpaces（:1694-1713,已内联） +
 *  FillAmmoFromInventory（:1632-1692,已内联） */
function sortAmmo(slots: SortSlot[], feedback?: SortFeedback): void {
  // -- ClearAmmoSlotSpaces（:1694-1713）：不满的弹药堆自后段吸收 + 空位上滑 --
  for (let i = 54; i < 58; i++) {
    const item = slots[i];
    if (!item || item.stack <= 0) continue;
    const v = viewOfSlot(item);
    if (v.ammo === 0) continue;                     // item.ammo != AmmoID.None
    const max = ITEM_DEFS[item.id]?.maxStack ?? 1;
    if (item.stack < max) {
      const loopStart = item.favorited ? 54 : i + 1;  // :1702
      refillItemStack(slots, item, loopStart, 58);
    }
  }
  for (let j = 54; j < 58; j++) {
    const it = slots[j];
    if (it && it.stack > 0 && !it.favorited) trySlidingUp(slots, j, 54);
  }
  // -- FillAmmoFromInventory（:1632-1692） --
  const acceptedAmmoTypes: number[] = [];
  const emptyAmmoSlots: number[] = [];
  for (let i = 54; i < 58; i++) {
    if (feedback?.onGlow) feedback.onGlow(i, 0.31, false);   // SetGlow(i,0.31,false)（:1639）
    const item = slots[i];
    if (!item || item.stack <= 0) {
      emptyAmmoSlots.push(i);
      continue;
    }
    const v = viewOfSlot(item);
    if (v.ammo !== 0) {                              // item.ammo != AmmoID.None（:1646）
      if (!acceptedAmmoTypes.includes(v.type)) acceptedAmmoTypes.push(v.type);
      refillItemStack(slots, item, 0, 50);           // 自背包主段吸收（:1651）
    }
  }
  if (emptyAmmoSlots.length < 1) return;
  for (let j = 0; j < 50; j++) {                     // 一趟:已受理弹药型入空位（:1658-1672）
    const item = slots[j];
    if (!item || item.stack < 1 || item.favorited) continue;
    const v = viewOfSlot(item);
    if (!canFillEmptyAmmoSlot(v) || !acceptedAmmoTypes.includes(v.type)) continue;
    const num = emptyAmmoSlots.shift()!;
    const tmp = slots[j];
    slots[j] = slots[num];
    slots[num] = tmp;                                // Utils.Swap（:1665-1666）
    const moved = slots[num]!;
    if (moved) refillItemStack(slots, moved, 0, 50);
    if (emptyAmmoSlots.length === 0) break;
  }
  if (emptyAmmoSlots.length < 1) return;
  for (let k = 0; k < 50; k++) {                     // 二趟:任意可入弹药格物（:1677-1691）
    const item = slots[k];
    if (!item || item.stack < 1 || item.favorited) continue;
    const v = viewOfSlot(item);
    if (!canFillEmptyAmmoSlot(v) || !fitsAmmoSlot(v)) continue;
    const num = emptyAmmoSlots.shift()!;
    const tmp = slots[k];
    slots[k] = slots[num];
    slots[num] = tmp;
    const moved = slots[num]!;
    if (moved) refillItemStack(slots, moved, 0, 50);
    if (emptyAmmoSlots.length === 0) break;
  }
}

// ============ 公共入口 ============

export interface DamageMults { melee: number; ranged: number; magic: number; minion: number }

/** SortInventory（:1560-1571）——玩家背包整理（Sort 钮消费面,Main.cs:42602）。
 *  @param slots 玩家 58 槽（0-9 快捷栏/10-49 主体/50-53 币/54-57 弹药;58 trash 在仓内
 *               独立字段,原版 inventory[58] 被全链 ignore,可观测面一致）
 *  @param dmg   玩家四系伤害倍率（vanilla player.meleeDamage 等;缺省全 1=固定序） */
export function sortPlayerInventory(slots: SortSlot[], feedback?: SortFeedback, dmg?: DamageMults): void {
  // SortInventory 内部不再查 HasLockedInventory（:1562 由调用方 Game.hasLockedInventory
  // 承载——原版 Main.player[myPlayer] 直读,仓内 gate 在 Game.sortInventory）
  let moneyTrough = false;                          // HasItem(905)（:1564,Player.cs:56551 i<58）
  for (let i = 0; i < 58 && i < slots.length; i++) {
    const it = slots[i];
    if (it && it.stack > 0 && vanillaIdOfItem(it.id) === 905) { moneyTrough = true; break; }
  }
  if (!moneyTrough) sortCoins(slots, feedback);     // :1566-1568
  sortAmmo(slots, feedback);                        // :1568
  const ignore = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 50, 51, 52, 53, 54, 55, 56, 57, 58]);  // :1569
  sort({ slots, ignore, chestFeedback: false, feedback }, buildLayerOrder(dmg));
}

/** SortInventory(Chest, withSync, withFeedback)（:1599-1624）——容器面（宝箱/存钱罐/
 *  保险箱/守护者熔炉/虚空袋）。withFeedback=true 时 ItemSlot.SetGlow(..., chest!= -1)=
 *  箱槽色带;MemoryStamp net 同步面（32）单人仓无对应,略。 */
export function sortContainerItems(items: SortSlot[], feedback?: SortFeedback): void {
  sort({ slots: items, ignore: new Set<number>(), chestFeedback: true, feedback }, buildLayerOrder());
}

/** AddSortingPrioritiesBasedOnPlayerDamage(:1356-1379)：前 4 层按玩家四系倍率降序,
 *  平序按固定下标(Melee0/Ranged1/Magic2/Minions3);其余 48 层固定序(:1386-1433) */
function buildLayerOrder(dmg?: { melee: number; ranged: number; magic: number; minion: number }): number[] {
  const four = [0, 1, 2, 3];
  const mult = (i: number): number => (i === 0 ? dmg?.melee : i === 1 ? dmg?.ranged : i === 2 ? dmg?.magic : dmg?.minion) ?? 1;
  four.sort((x, y) => cmp(mult(y), mult(x)) || cmp(x, y));   // Descending(:1371-1379)
  return [...four, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];
}

// ============ ItemSorting.Sort（:1436-1541） ============

interface SortIo {
  slots: SortSlot[];
  ignore: Set<number>;
  chestFeedback: boolean;
  feedback?: SortFeedback;
}

export interface SortFeedback {
  /** ItemSlot.SetGlow(slot, hue, chest)（:1529 弹药面 :1639） */
  onGlow?: (slot: number, hue: number, chest: boolean) => void;
  /** SortCoins 溢出 QuickSpawnItem(GetItemSource_InventoryOverflow)（:1815-1822） */
  onOverflowDrop?: (vid: number, stack: number) => void;
}

function sort(io: SortIo, layerOrder: number[]): void {
  const { slots, ignore } = io;
  // 空判=stack<=0（原版 type==0/IsAir;仓内 null=air,内部 id 0 是真实物品「魔力水晶」）
  const isAir = (i: number): boolean => {
    const it = slots[i];
    return !it || it.stack <= 0;
  };
  // ---- ① 收集（:1439-1454） ----
  const itemsToSort: number[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (ignore.has(i)) continue;
    const it = slots[i];
    if (it && it.stack !== 0 && !isAir(i) && !it.favorited) itemsToSort.push(i);
  }
  // ---- ② 同型并叠（:1455-1494,CanStack=同型+同词缀 Item.cs:49870） ----
  for (let j = 0; j < itemsToSort.length; j++) {
    const jSlot = itemsToSort[j];
    const item2 = slots[jSlot]!;
    const max2 = ITEM_DEFS[item2.id]?.maxStack ?? 1;
    if (item2.stack >= max2) continue;
    let num = max2 - item2.stack;
    for (let k = j; k < itemsToSort.length; k++) {
      if (j === k) continue;
      const kSlot = itemsToSort[k];
      const item3 = slots[kSlot]!;
      if (itemMatchKey(item3.id) !== itemMatchKey(item2.id)) continue;
      if ((item3.prefix ?? 0) !== (item2.prefix ?? 0)) continue;
      const max3 = ITEM_DEFS[item3.id]?.maxStack ?? 1;
      if (item3.stack === max3) continue;
      let num2 = item3.stack;
      if (num < num2) num2 = num;
      item2.stack += num2;
      item3.stack -= num2;
      num -= num2;
      if (item3.stack === 0) {
        slots[kSlot] = null;                          // inv[k] = new Item()(:1482)
        itemsToSort.splice(k, 1);
        j--; k--;                                     // 外层 j++ 后重扫同一 j(:1484-1485)
        break;
      }
      if (num === 0) break;
    }
  }
  // ---- ③ 可用槽（:1495-1507） ----
  const available: number[] = [...itemsToSort];
  for (let l = 0; l < slots.length; l++) {
    if (ignore.has(l) || available.includes(l)) continue;
    if (isAir(l)) available.push(l);
  }
  available.sort((a, b2) => cmp(a, b2));
  // ---- ④⑤ 逐层 谓词→Validate→摘除→层内排序（:1508-1517） ----
  const sorted: number[] = [];
  const counts: number[] = [];
  const views = new Map<number, SortView>();
  const viewAt = (i: number): SortView => {
    let v = views.get(i);
    if (!v) { v = viewOfSlot(slots[i]!); views.set(i, v); }
    return v;
  };
  for (const L of layerOrder) {
    const layer = LAYERS[L];
    // Validate(:23-29) —— indexesSortable 过滤为白名单成员（layer 下标即白名单身份;
    // 白名单外物品(layer=-1)全部退回 itemsToSort → :1517 尾接）
    const indexes = itemsToSort.filter((i) => {
      const v = viewAt(i);
      return v.layer === L && layer.pred(v);
    });
    if (indexes.length > 0) {
      sortIndicesStable(indexes, (a, b2) => layer.cmp(viewAt(a), viewAt(b2)));
      for (const i of indexes) {
        const at = itemsToSort.indexOf(i);
        if (at >= 0) itemsToSort.splice(at, 1);
      }
      counts.push(indexes.length);
      sorted.push(...indexes);
    }
  }
  sorted.push(...itemsToSort);                        // :1517 白名单外尾接
  // ---- ⑥ 整段缓存 → 落位 + SetGlow 色带（:1518-1540） ----
  const cache: SortSlot[] = sorted.map((i) => slots[i]);
  for (const i of sorted) slots[i] = null;            // inv[i] = new Item()(:1521)
  const num3 = counts.length > 0 ? 1 / counts.length : 0;
  let num4 = counts.length > 0 ? num3 / 2 : 0;
  for (const it of cache) {
    const slot = available[0]!;
    if (io.feedback?.onGlow) io.feedback.onGlow(slot, num4, io.chestFeedback);
    counts[0]--;
    if (counts[0] === 0) {
      counts.shift();
      num4 += num3;
    }
    slots[slot] = it;
    available.shift();
  }
}
