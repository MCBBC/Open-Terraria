// 挂物族（存放展示家具）数据结构与存取 API——原版 TileEntity 体系的最小等价。
//
// 原版走 TEItemFrame / TEWeaponsRack / TEDisplayDoll / TEHatRack / TEFoodPlatter /
// TEDeadCellsDisplayJar（Terraria.GameContent.Tile_Entities/，TileEntity 按 锚点(x,y)
// 挂 ByPosition 表）。本作无 TileEntity 框架：等价为 World 上的记录数组
// （锚点 → 槽位数组），随世界存档持久化（serialize.ts 的 furniture 段）。
//
// 原版语义对照（全部以 1456 反编译源为准，行号注释随函数）：
//   物品框 395（2×2）   TEItemFrame.cs        FitsItemFrame: 任何 stack>0（:170）
//   武器架 471（3×3）    TEWeaponsRack.cs      FitsWeaponFrame（:182-193）
//     —— 334 是 1.4.4 前的 legacy（tiles.ts 标 _legacy_do_not_use），现行 = 471，
//        放置物品 2699（Item.cs:26028 createTile = 471）
//   模特 470（2×3）      TEDisplayDoll.cs      CanQuickSwapIntoDisplayDoll（:664-679）
//   帽架 475（3×4）      TEHatRack.cs          CanQuickSwapIntoHatRack: headSlot>0（:331-334）
//   食物盘 520（1×1）    TEFoodPlatter.cs      FitsFoodPlatter: Sets.IsFood（:112-119）
//   展示罐 698（1×2）    TEDeadCellsDisplayJar.cs  FitsJar: 任何 stack>0（:126-129）
//     —— 展示罐与物品框同构（无专属物品交互，FitsJar 只看 stack），复杂度不高于物品框，
//        故一并移植（决策：移植，不备案跳过）
//
// 槽位布局（镜像原版 WriteExtraData 持久化形状）：
//   单槽族（框/架/盘/罐）：slots[0]
//   模特：slots[0..8]=equip（0头/1身/2腿/3-7配饰/8坐骑）、slots[9]=misc（持握展示）、
//         slots[10..18]=dyes（TEDisplayDoll.cs:156-278，9+1+9）
//   帽架：slots[0..1]=hat、slots[2..3]=dye（TEHatRack.cs:62-86，2+2）
//   染料槽在原版只能经专属槽位 UI 填充（右键快速换装不接受染料：CanQuickSwapInto*
//   均不含 dye 判定），本作保留槽位用于数据往返与未来 UI，右键链路 1:1 不写染料。

import { TILE_BY_KEY } from '../data/tiles';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { itemCombat } from '../data/vanillaItemCombat';
import { vanillaStatOfVid } from '../data/vanillaItemStats';
import { equipKindOfVid } from '../data/vanillaEquip';

/** 挂物族类别 */
export type FurnitureKind = 'item_frame' | 'weapon_rack' | 'display_doll' | 'hat_rack' | 'food_platter' | 'display_jar';

/** 槽位内物品实例（id 为内部 item id；prefix 为重铸词缀，0/缺省=无） */
export interface FurnitureSlotItem {
  id: number;
  stack: number;
  prefix?: number;
}

export type FurnitureSlot = FurnitureSlotItem | null;

/** 一件挂物家具的存放记录。锚点 = 物件左上格（与 chests/signs 同约定） */
export interface FurnitureItemRecord {
  x: number;
  y: number;
  kind: FurnitureKind;
  slots: FurnitureSlot[];
}

/** 锚点化所需的最小 store 视图（TileStore 结构兼容；测试可伪造） */
export interface FurnitureStoreView {
  frameX: Uint16Array;
  frameY: Uint16Array;
  idx(x: number, y: number): number;
}

/** tile 内部 id → 类别（放置/交互/破坏/渲染统一入口） */
export const FURNITURE_TILE_KIND: ReadonlyMap<number, FurnitureKind> = (() => {
  const pairs: Array<[string, FurnitureKind]> = [
    ['v_395_item_frame', 'item_frame'],
    ['v_471_weapon_rack', 'weapon_rack'],
    ['v_470_mannequins', 'display_doll'],
    ['v_475_hat_rack', 'hat_rack'],
    ['v_520_plate', 'food_platter'],
    ['v_698_item_flask', 'display_jar'],
  ];
  const m = new Map<number, FurnitureKind>();
  for (const [key, kind] of pairs) {
    const id = TILE_BY_KEY[key];
    if (id !== undefined) m.set(id, kind);
  }
  return m;
})();

/** 各类别槽位数（见文件头布局说明） */
export function furnitureSlotCount(kind: FurnitureKind): number {
  switch (kind) {
    case 'display_doll': return 19; // equip[9] + misc[1] + dye[9]（TEDisplayDoll.cs:156-278）
    case 'hat_rack': return 4;      // hat[2] + dye[2]（TEHatRack.cs:62-86）
    default: return 1;              // 框/武器架/食物盘/展示罐 单槽
  }
}

/**
 * 任意命中格 → 锚点（左上格）。逐类别对表原版锚点归一公式：
 *   item_frame   TEItemFrame.cs:100-106（frameX%36/frameY%36 各除 18 退格）
 *   weapon_rack  TEWeaponsRack.cs:166/209（frameX%54/frameY%54 各除 18 退格）
 *   food_platter TEFoodPlatter.cs:24-32（1×1 无归一）
 *   display_jar  TEDeadCellsDisplayJar.cs:126-134（frameX%18 恒 0；frameY%36 除 18）
 *   display_doll TEDisplayDoll.cs:508-514（frameX%36!=0 退 1；frameY/18 整退——样式横排）
 *   hat_rack     TEHatRack.cs:284-291（frameX%54/18 退；frameY/18 整退——样式横排）
 */
export function furnitureAnchor(st: FurnitureStoreView, kind: FurnitureKind, x: number, y: number): [number, number] {
  const i = st.idx(x, y);
  const fx = st.frameX[i], fy = st.frameY[i];
  switch (kind) {
    case 'item_frame': return [x - Math.floor((fx % 36) / 18), y - Math.floor((fy % 36) / 18)];
    case 'weapon_rack': return [x - Math.floor((fx % 54) / 18), y - Math.floor((fy % 54) / 18)];
    case 'food_platter': return [x, y];
    case 'display_jar': return [x, y - Math.floor((fy % 36) / 18)];
    case 'display_doll': return [x - (fx % 36 !== 0 ? 1 : 0), y - Math.floor(fy / 18)];
    case 'hat_rack': return [x - Math.floor((fx % 54) / 18), y - Math.floor(fy / 18)];
  }
}

/** 锚点精确取记录 */
export function getFurniture(records: FurnitureItemRecord[], kind: FurnitureKind, ax: number, ay: number): FurnitureItemRecord | undefined {
  return records.find((r) => r.x === ax && r.y === ay && r.kind === kind);
}

/** 命中格 → 记录（内部做锚点化） */
export function furnitureAt(records: FurnitureItemRecord[], st: FurnitureStoreView, kind: FurnitureKind, x: number, y: number): FurnitureItemRecord | undefined {
  const [ax, ay] = furnitureAnchor(st, kind, x, y);
  return getFurniture(records, kind, ax, ay);
}

/** 取或建记录（放置交互/放置登记共用；原版 TileEntity.Place → Hook_AfterPlacement） */
export function getOrCreateFurniture(records: FurnitureItemRecord[], kind: FurnitureKind, ax: number, ay: number): FurnitureItemRecord {
  const found = getFurniture(records, kind, ax, ay);
  if (found) return found;
  const rec: FurnitureItemRecord = { x: ax, y: ay, kind, slots: new Array(furnitureSlotCount(kind)).fill(null) };
  records.push(rec);
  return rec;
}

/** 物件破坏后移除记录（原版 TileEntityType.Kill，TileEntity.cs:110-116） */
export function removeFurnitureAt(records: FurnitureItemRecord[], ax: number, ay: number): void {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].x === ax && records[i].y === ay) records.splice(i, 1);
  }
}

/** 记录是否存放有任何物品（TEDisplayDoll.ContainsItems :923 / TEHatRack.ContainsItems :374） */
export function furnitureContainsItems(rec: FurnitureItemRecord): boolean {
  return rec.slots.some((s) => s !== null);
}

// ============================================================================
// 放置限制判定（全部按原版 item 字段语义，输入为原版 item id）
// ============================================================================

/** ItemID.Sets.IsFood（ItemID.cs:258，86 id）——食物盘放置门（TEFoodPlatter.cs:112-119） */
export const VANILLA_IS_FOOD: ReadonlySet<number> = new Set<number>([
  353, 357, 1787, 1911, 1912, 1919, 1920, 2266, 2267, 2268, 2425, 2426, 2427,
  3195, 3532, 4009, 4010, 4011, 4012, 4013, 4014, 4015, 4016, 4017, 4018, 4019,
  4020, 4021, 4022, 4023, 4024, 4025, 4026, 4027, 4028, 4029, 4030, 4031, 4032,
  4033, 4034, 4035, 4036, 4037, 967, 969, 4282, 4283, 4284, 4285, 4286, 4287,
  4288, 4289, 4290, 4291, 4292, 4293, 4294, 4295, 4296, 4297, 4403, 4411, 4614,
  4615, 4616, 4617, 4618, 4619, 4620, 4621, 4622, 4623, 4624, 4625, 5009, 5042,
  5041, 5092, 5093, 5275, 5277, 5278, 5537, 5645,
]);

/** ItemID.Sets.CanBePlacedOnWeaponRacks（ItemID.cs:1086，114 id）——
 *  炸弹/雷管/油漆刷/高尔夫杆族等"有 useStyle 无 damage（或反之）"的异类，
 *  114 个成员 0 个能通过 damage>0&&useStyle!=0 规则，故集合不可省略 */
export const VANILLA_WEAPON_RACK_EXTRA: ReadonlySet<number> = new Set<number>([
  3196, 166, 235, 3115, 167, 2896, 3547, 580, 937, 4423, 4824, 4825, 4826, 4827,
  4908, 4909, 5594, 5595, 4094, 4039, 4092, 4093, 4587, 4588, 4589, 4590, 4591,
  4592, 4593, 4594, 4595, 4596, 4597, 4598, 905, 1326, 5335, 2272, 2610, 5495,
  3384, 3225, 2303, 2299, 2290, 2317, 2305, 2304, 2313, 2318, 2312, 2306, 2308,
  2319, 2314, 2302, 2315, 2307, 2310, 2301, 2298, 2316, 2309, 2321, 2297, 2300,
  2311, 2420, 2438, 2437, 2436, 4401, 4402, 2475, 2476, 2450, 2477, 2478, 2451,
  2479, 2480, 2452, 2453, 2481, 2454, 2482, 2483, 2455, 2456, 2457, 2458, 2459,
  2460, 2484, 2472, 2461, 2462, 2463, 2485, 2464, 2465, 2486, 2466, 2467, 2468,
  2487, 2469, 2488, 2470, 2471, 2473, 2474, 4393, 4394,
]);

/** useStyle 提取缺口补丁：45 个金属工具/武器族（3480-3521 铜镐族 + 3349/3351/3352）
 *  的 Item.cs case 体只调 SetDefaults1-5 helper（如 case 3509 → SetDefaults1(1)，
 *  Item.cs:31362-31372；useStyle 赋值在 helper 内 Item.cs:1369），extract-itemfunc.mjs
 *  不跟 helper → vanilla-itemfunc.json 缺 useStyle。此处按源码 helper 实测值补全：
 *  镐=1 / 斧=1 / 锤=5 / 剑=1 / 短剑=13（SetDefaults1 段逐 case 核对） */
const USE_STYLE_PATCH: Readonly<Record<number, number>> = {
  3349: 1, 3351: 1, 3352: 1,
  3480: 5, 3481: 1, 3482: 1, 3483: 13, 3484: 1, 3485: 1, 3486: 5, 3487: 1, 3488: 1,
  3489: 13, 3490: 1, 3491: 1, 3492: 5, 3493: 1, 3494: 1, 3495: 13, 3496: 1, 3497: 1,
  3498: 5, 3499: 1, 3500: 1, 3501: 13, 3502: 1, 3503: 1, 3504: 5, 3505: 1, 3506: 1,
  3507: 13, 3508: 1, 3509: 1, 3510: 5, 3511: 1, 3512: 1, 3513: 13, 3514: 1, 3515: 1,
  3516: 5, 3517: 1, 3518: 1, 3519: 13, 3520: 1, 3521: 1,
};

/** Item.damage（itemfunc 与 itemcombat 双表并集） */
function vanillaDamage(vid: number): number {
  return itemFuncOfVid(vid)?.damage ?? itemCombat(vid)?.damage ?? 0;
}

/** Item.useStyle（itemfunc 表 + USE_STYLE_PATCH 补丁） */
function vanillaUseStyle(vid: number): number {
  const f = itemFuncOfVid(vid);
  if (f?.useStyle !== undefined) return f.useStyle;
  return USE_STYLE_PATCH[vid] ?? 0;
}

/** Item.holdStyle（itemfunc 表，41 条） */
function vanillaHoldStyle(vid: number): number {
  return itemFuncOfVid(vid)?.holdStyle ?? 0;
}

/** Item.fishingPole（itemfunc 表，9 支钓竿） */
function vanillaFishingPole(vid: number): number {
  return itemFuncOfVid(vid)?.fishingPole ?? 0;
}

/** Item.headSlot/bodySlot/legSlot > 0（vanilla-itemstats.json s 字段，Item.cs 赋值即归属） */
function vanillaArmorPiece(vid: number): 'h' | 'b' | 'l' | null {
  return vanillaStatOfVid(vid)?.s ?? null;
}

/** Item.accessory（含社交配饰；vanilla-itemstats.json acc 字段存在即 true） */
function vanillaIsAccessory(vid: number): boolean {
  return vanillaStatOfVid(vid)?.acc !== undefined;
}

/** Item.mountType >= 0（vanilla-equip.json mount/cart 两组 id，Item.cs mountType 赋值） */
function vanillaMountType(vid: number): number {
  const k = equipKindOfVid(vid);
  return k === 'mount' || k === 'cart' ? 0 : -1;
}

/** Item.wingSlot > 0（vanilla-itemstats.json wing 字段） */
function vanillaWingSlot(vid: number): number {
  return vanillaStatOfVid(vid)?.wing ?? 0;
}

/** TEItemFrame.FitsItemFrame（TEItemFrame.cs:170-173）/ TEDeadCellsDisplayJar.FitsJar（:126-129）：
 *  任何 stack>0 物品均可 */
export function fitsItemFrame(vid: number): boolean {
  return vid > 0;
}

/** TEWeaponsRack.FitsWeaponFrame（TEWeaponsRack.cs:182-193）：
 *  !IsAir && (fishingPole>0 || Sets.CanBePlacedOnWeaponRacks) → true；
 *  否则 damage>0 && useStyle!=0 → stack>0 */
export function fitsWeaponRack(vid: number): boolean {
  if (vid <= 0) return false;
  if (vanillaFishingPole(vid) > 0 || VANILLA_WEAPON_RACK_EXTRA.has(vid)) return true;
  if (vanillaDamage(vid) > 0 && vanillaUseStyle(vid) !== 0) return true;
  return false;
}

/** TEFoodPlatter.FitsFoodPlatter（TEFoodPlatter.cs:112-119）：stack>0 且 Sets.IsFood */
export function fitsFoodPlatter(vid: number): boolean {
  return vid > 0 && VANILLA_IS_FOOD.has(vid);
}

/** TEHatRack.CanQuickSwapIntoHatRack（TEHatRack.cs:331-334）：headSlot > 0 */
export function fitsHatRack(vid: number): boolean {
  return vanillaArmorPiece(vid) === 'h';
}

/** TEDisplayDoll.AcceptedInWeaponSlot（TEDisplayDoll.cs:673-679）：
 *  useStyle==0 || mountType!=-1 → holdStyle!=0；否则 true */
export function acceptedInWeaponSlot(vid: number): boolean {
  if (vanillaUseStyle(vid) === 0 || vanillaMountType(vid) !== -1) return vanillaHoldStyle(vid) !== 0;
  return true;
}

/** TEDisplayDoll.CanQuickSwapIntoDisplayDoll（TEDisplayDoll.cs:664-671） */
export function fitsDisplayDoll(vid: number): boolean {
  if (vanillaArmorPiece(vid) || vanillaIsAccessory(vid) || vanillaMountType(vid) >= 0) return true;
  return acceptedInWeaponSlot(vid);
}

/** 类别 → 放置判定分发（Game 侧单入口） */
export function fitsFurniture(kind: FurnitureKind, vid: number): boolean {
  switch (kind) {
    case 'item_frame': case 'display_jar': return fitsItemFrame(vid);
    case 'weapon_rack': return fitsWeaponRack(vid);
    case 'food_platter': return fitsFoodPlatter(vid);
    case 'hat_rack': return fitsHatRack(vid);
    case 'display_doll': return fitsDisplayDoll(vid);
  }
}

/**
 * 模特快速换装目标槽（TEDisplayDoll.TryFitting :680-725 的槽位选择段）：
 *  headSlot>0 → 0 / bodySlot>0 → 1 / legSlot>0 → 2 / accessory → 配饰冲突槽或
 *  3-7 首空（GetAccessoryTargetSlot :727-738 + ItemSlot.HasIncompatibleAccessory
 *  ItemSlot.cs:3208-3206：同 id 或双翅膀不可共存） / mountType>=0 → 8 /
 *  AcceptedInWeaponSlot → misc(9)；不可放 → -1
 */
export function dollTargetSlot(rec: FurnitureItemRecord, vid: number): number {
  const piece = vanillaArmorPiece(vid);
  if (piece === 'h') return 0;
  if (piece === 'b') return 1;
  if (piece === 'l') return 2;
  if (vanillaIsAccessory(vid)) return dollAccessoryTargetSlot(rec, vid);
  if (vanillaMountType(vid) >= 0) return 8;
  if (acceptedInWeaponSlot(vid)) return 9;
  return -1;
}

/** GetAccessoryTargetSlot（TEDisplayDoll.cs:727-738）：HasIncompatibleAccessory
 *  （ItemSlot.cs:3208-3220 + CanEquipBothAccessories :3195-3206）命中 → 冲突槽；
 *  否则 3..7 首空；全满 → 3 */
function dollAccessoryTargetSlot(rec: FurnitureItemRecord, vid: number): number {
  for (let i = 3; i <= 7; i++) {
    const cur = rec.slots[i];
    if (cur && (cur.id === vid || (vanillaWingSlot(cur.id) > 0 && vanillaWingSlot(vid) > 0))) return i;
  }
  for (let i = 3; i <= 7; i++) {
    if (!rec.slots[i]) return i;
  }
  return 3;
}

// ============================================================================
// 交互语义（单槽族：放入/替换/弹出；原版 TryPlacing/OnPlayerInteraction）
// ============================================================================

/**
 * 单槽族放入（TEItemFrame/TEWeaponsRack/TEFoodPlatter/TEDeadCellsDisplayJar 的
 * TryPlacing :83-100：已有物先弹出（返回 replaced 由调用方掉落），再写入新物 stack=1）。
 * @returns replaced 被替换出的旧物（null=原本为空）；fits=false 时不变更返回 null 且 ok=false
 */
export function furniturePlaceSingle(
  records: FurnitureItemRecord[], kind: FurnitureKind, ax: number, ay: number,
  item: { id: number; stack: number; prefix?: number }, vid: number,
): { ok: boolean; replaced: FurnitureSlot } {
  if (!fitsFurniture(kind, vid)) return { ok: false, replaced: null };
  const rec = getOrCreateFurniture(records, kind, ax, ay);
  const replaced = rec.slots[0];
  rec.slots[0] = { id: item.id, stack: 1, prefix: item.prefix };
  return { ok: true, replaced };
}

/**
 * 单槽族取出（OnPlayerInteraction else 分支 :134-151 → WorldGen.KillTile(fail:true)
 * → KillTile_DropItems :63703-63738 提前 return：弹出存放物、方块保留不破坏）。
 * @returns 被弹出的物品（null=本来就空）
 */
export function furniturePopSingle(records: FurnitureItemRecord[], kind: FurnitureKind, ax: number, ay: number): FurnitureSlot {
  const rec = getFurniture(records, kind, ax, ay);
  if (!rec) return null;
  const item = rec.slots[0];
  rec.slots[0] = null;
  return item;
}

/**
 * 破坏判定（WorldGen.KillTile 前置特例）：
 *  单槽族有物 → 'pop'（先弹物、本次不破坏，KillTile_DropItems :63703 提前 return 语义）；
 *  模特/帽架有物 → 'blocked'（IsBreakable=false，WorldGen.cs:62540-62560
 *    CheckTileBreakability2_ShouldTileSurvive：有物整件不可破坏）；
 *  其余 → 'break'（正常破坏，调用方清格后 removeFurnitureAt）
 */
export function furnitureTryBreak(
  records: FurnitureItemRecord[], kind: FurnitureKind, ax: number, ay: number,
): { result: 'pop' | 'blocked' | 'break'; item: FurnitureSlot } {
  const rec = getFurniture(records, kind, ax, ay);
  if (!rec || !furnitureContainsItems(rec)) return { result: 'break', item: null };
  switch (kind) {
    case 'display_doll': case 'hat_rack':
      return { result: 'blocked', item: null };
    default: {
      const item = rec.slots[0];
      rec.slots[0] = null;
      return { result: 'pop', item };
    }
  }
}

/**
 * 模特放置：TryFitting 语义（TEDisplayDoll.cs:680-725）——
 *  目标槽已占用且手持 stack>1 → 不动（原版 return true 仅播声）；
 *  手持 stack>1 → 槽内放 1 个（克隆），手持 -1；
 *  手持 stack==1 → 与槽位整体交换（换出物回手持格，由调用方写回）。
 * @returns { target, swappedOut } 或 null（不可放/未动）
 */
export function dollPlace(
  records: FurnitureItemRecord[], ax: number, ay: number,
  item: { id: number; stack: number; prefix?: number }, vid: number,
): { target: number; swappedOut: FurnitureSlot } | null {
  const rec = getOrCreateFurniture(records, 'display_doll', ax, ay);
  const target = dollTargetSlot(rec, vid);
  if (target < 0) return null;
  return tryFitting(rec, target, item);
}

/** TEHatRack.TryFitting 槽位轮转（TEHatRack.cs:342-347 + 静态 hatTargetSlot :18）：
 *  0/1 首空，否则用轮转位；放置后轮转指针前移（module 级静态，对表原版 static） */
let hatTargetSlotPtr = 0;
function hatRackTargetSlot(rec: FurnitureItemRecord): number {
  for (let i = 0; i < 2; i++) {
    if (!rec.slots[i]) return i;
  }
  return hatTargetSlotPtr;
}

/** 帽架放置（TEHatRack.TryFitting :337-369；CanQuickSwapIntoHatRack 门在外层 fitsFurniture） */
export function hatRackPlace(
  records: FurnitureItemRecord[], ax: number, ay: number,
  item: { id: number; stack: number; prefix?: number }, vid: number,
): { target: number; swappedOut: FurnitureSlot } | null {
  if (!fitsHatRack(vid)) return null;
  const rec = getOrCreateFurniture(records, 'hat_rack', ax, ay);
  const r = tryFitting(rec, hatRackTargetSlot(rec), item);
  if (r) hatTargetSlotPtr = r.target + 1 >= 2 ? 0 : r.target + 1; // hatTargetSlot++ 回绕（:363-367）
  return r;
}

/** TryFitting 共用主体（TEDisplayDoll.cs:693-718 / TEHatRack.cs:350-360）：
 *  占位+多叠 → null；多叠 → 克隆 1 并手持 -1；单叠 → 整体交换 */
function tryFitting(
  rec: FurnitureItemRecord, target: number,
  item: { id: number; stack: number; prefix?: number },
): { target: number; swappedOut: FurnitureSlot } | null {
  const cur = rec.slots[target];
  if (item.stack > 1 && cur) return null; // :693-696
  if (item.stack > 1) {
    rec.slots[target] = { id: item.id, stack: 1, prefix: item.prefix };
    item.stack -= 1; // :699-704 Clone（stack=1）+ item.stack--
    return { target, swappedOut: null };
  }
  rec.slots[target] = { id: item.id, stack: item.stack, prefix: item.prefix }; // Utils.Swap :705-709
  return { target, swappedOut: cur };
}

/**
 * 多槽族取出（模特/帽架右键且手持不可放时的最小等价）：
 *  原版此时打开槽位 UI（TileEntity.BasicOpenCloseInteraction，TileEntity.cs:250-285）
 *  由玩家在面板取物；本作无该 UI，等价为按原版槽位序（模特 equip0-8→misc→dyes，
 *  帽架 hat0-1→dye0-1）取首个非空槽。返回 { slot, item }，槽位被清空。
 */
export function furnitureTakeFirst(records: FurnitureItemRecord[], kind: FurnitureKind, ax: number, ay: number): { slot: number; item: FurnitureSlotItem } | null {
  const rec = getFurniture(records, kind, ax, ay);
  if (!rec) return null;
  for (let i = 0; i < rec.slots.length; i++) {
    const s = rec.slots[i];
    if (s) {
      rec.slots[i] = null;
      return { slot: i, item: s };
    }
  }
  return null;
}

// ============================================================================
// 持久化（serialize.ts furniture 段的纯换算；item id 映射由调用方注入，
//   与 chests 的 ITEM_STABLE_OF_INTERNAL 路径同构）
// ============================================================================

/** 存档形状（SaveData.furniture；旧档缺省无） */
export interface FurnitureSaveEntry {
  x: number;
  y: number;
  kind: FurnitureKind;
  slots: Array<{ id: number; stack: number; prefix?: number } | null>;
}

/** 运行时记录 → 存档条目（mapId = 内部 id → 磁盘稳定 id） */
export function furnitureToSave(records: FurnitureItemRecord[], mapId: (id: number) => number): FurnitureSaveEntry[] {
  return records.map((r) => ({
    x: r.x, y: r.y, kind: r.kind,
    slots: r.slots.map((s) => (s ? { id: mapId(s.id), stack: s.stack, prefix: s.prefix } : null)),
  }));
}

/** 存档条目 → 运行时记录（mapId = 磁盘稳定 id → 内部 id；防御：未知 id 归 0 置空） */
export function furnitureFromSave(entries: FurnitureSaveEntry[] | undefined, mapId: (id: number) => number): FurnitureItemRecord[] {
  if (!entries) return [];
  const out: FurnitureItemRecord[] = [];
  for (const e of entries) {
    const n = furnitureSlotCount(e.kind);
    const slots: FurnitureSlot[] = [];
    for (let i = 0; i < n; i++) {
      const s = e.slots[i];
      if (s && s.id > 0) slots.push({ id: mapId(s.id), stack: s.stack, prefix: s.prefix });
      else slots.push(null);
    }
    out.push({ x: e.x, y: e.y, kind: e.kind, slots });
  }
  return out;
}
