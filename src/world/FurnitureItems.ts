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
//   锚桩 724（1×1）      TECritterAnchor.cs（TELeashedEntityAnchorWithItem 子类）
//     —— 1.4.4+ 捕获小动物拴绳锚桩：TE 存物品 id（WriteExtraData short itemType），
//        放置钩 PlaceFromPlayerPlacementHook :43-58 直接写手持物（InsertItem →
//        RespawnLeashedEntity 生成拴绳小动物）。等价记录见文末 critter_anchor 段；
//        ★刻意不入 FURNITURE_TILE_KIND（右键放入/取出与两段式破坏都是挂物族语义，
//        锚桩原版无 OnPlayerInteraction、破坏 = 同击掉物+碎块，走 Game 侧专用分支）
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
import { equipKindOfAnyVid } from '../data/vanillaEquip';   // ★R-A-D7:vid 域收口
import { ITEM_DEFS } from '../data/items';
import { ITEM_ACCESSORY_INCOMPATIBILITY_TYPE } from '../data/vanillaSets1457';

/** 挂物族类别 */
export type FurnitureKind = 'item_frame' | 'weapon_rack' | 'display_doll' | 'hat_rack' | 'food_platter' | 'display_jar' | 'critter_anchor' | 'kite_anchor';

/** 槽位内物品实例（id 为内部 item id；prefix 为重铸词缀，0/缺省=无） */
export interface FurnitureSlotItem {
  id: number;
  stack: number;
  prefix?: number;
}

export type FurnitureSlot = FurnitureSlotItem | null;

/** 一件挂物家具的存放记录。锚点 = 物件左上格（与 chests/signs 同约定）。
 *  ★SW-BO1 2026-09-07（SW-BL1 P1）：模特姿态 TEDisplayDoll._pose（byte,私有字段
 *  TEDisplayDoll.cs:40）入库——原版 WriteExtraData 随位图落盘（WorldFile v307+,
 *  TEDisplayDoll.cs:184）；仅 display_doll 记录消费,其余 kind 恒 undefined */
export interface FurnitureItemRecord {
  x: number;
  y: number;
  kind: FurnitureKind;
  slots: FurnitureSlot[];
  pose?: number;
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
    // ★七批备案④收尾（2026-09-02）：334 = 1.4 前的 legacy 武器架（TileID.cs:1105
    //  WeaponsRack=334；现行 471=WeaponsRack2 :1379，放置物品 2699 createTile=471）。
    //  与 471 是【同一件家具的两种存物通道】（471=TEWeaponsRack.item 单槽 TE，
    //  334=帧内嵌标记 PlaceWeapon Player.cs:54721 写 5000 系 frameX），槽位模型
    //  1:1 同构 → 并入 weapon_rack（区别于 128/269 legacy 模特：那是 19 槽模特的
    //  异构帧编码，无单记录模型对应，故不进本表——system-coverage.test.ts 锁定）。
    //  本仓无 334 写入面（无物品 createTile=334），此登记只服务 WldImport 老世界
    //  导入的持武还原（WldImport ★334 段解码落记录）与破坏/右键/渲染链。
    ['v_334_weapon_rack_legacy_do_not_use', 'weapon_rack'],
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
    default: return 1;              // 框/武器架/食物盘/展示罐/锚桩/风筝桩 单槽
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
    // TECritterAnchor.IsTileValidForEntity（TECritterAnchor.cs:23-31）：1×1，TE 即挂
    // 在命中格本身，无帧归一；TEKiteAnchor（TEKiteAnchor.cs:24-32）同构
    case 'critter_anchor': case 'kite_anchor': return [x, y];
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

/** Item.useStyle（itemfunc 表 + USE_STYLE_PATCH 补丁）
 *  ★SW-BN6 2026-09-08 导出：假人渲染 IsValidPose 消费（src/render/DisplayDoll.ts
 *  → isValidDollPose 持握槽 useStyle 判定,TEDisplayDoll.cs:142-153 同源） */
export function vanillaUseStyle(vid: number): number {
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
  const k = equipKindOfAnyVid(vid);
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
    // 锚桩/风筝桩无右键放入语义（TECritterAnchor/TEKiteAnchor 无 OnPlayerInteraction；
    // FitsItem（TECritterAnchor.cs:48-51 / TEKiteAnchor.cs:48-50）仅 OnWorldLoaded
    // 存档校验用，放置链由物品侧 createTile=724/723 结构性保证）
    case 'critter_anchor': case 'kite_anchor': return false;
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

/** 槽内存量 id（内部 id）→ 原版 vid（★方案 A：vid 直读,internal≡vid 恒等域;未收录 = -1） */
function slotVid(id: number): number {
  return ITEM_DEFS[id]?.vid ?? -1;
}

/** ItemID.Sets.AccessoryIncompatibilityType（★1457 ItemID.cs:58，缺省 -1）——
 *  四件 AmmoCycler 互斥组 6168（vanillaSets1457.ITEM_ACCESSORY_INCOMPATIBILITY_TYPE） */
function incompatGroupOf(vid: number): number {
  return ITEM_ACCESSORY_INCOMPATIBILITY_TYPE[vid] ?? -1;
}

/** GetAccessoryTargetSlot（★1457 TEDisplayDoll.cs:747-761）：HasIncompatibleAccessory
 *  （ItemSlot.CanEquipBothAccessories :3470-3489：同 id / 双翼 / ★1457
 *  AccessoryIncompatibilityType 同组）命中 → 冲突槽（TryFitting 整体交换）；
 *  否则 3..7 首空；全满 → 3。★修：槽内存量为内部 id,比较前经 slotVid 归一到
 *  vid 空间（原 `cur.id === vid` 跨 id 空间恒假 = 同 id/双翼冲突分支死代码） */
function dollAccessoryTargetSlot(rec: FurnitureItemRecord, vid: number): number {
  const g = incompatGroupOf(vid);
  for (let i = 3; i <= 7; i++) {
    const cur = rec.slots[i];
    if (!cur) continue;
    const cv = slotVid(cur.id);
    if (cv === vid || (vanillaWingSlot(cv) > 0 && vanillaWingSlot(vid) > 0)
      || (g !== -1 && g === incompatGroupOf(cv))) return i;
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

/** legacy 武器架 334 内部 tile id（TileID.cs:1105 WeaponsRack；现行 471=WeaponsRack2）
 *  ——破坏链一击双掉特化判据用 */
const RACK334_TILE = TILE_BY_KEY['v_334_weapon_rack_legacy_do_not_use'];

/**
 * 破坏判定（WorldGen.KillTile 前置特例）：
 *  单槽族有物 → 'pop'（先弹物、本次不破坏，KillTile_DropItems :63703 提前 return 语义）；
 *  模特/帽架有物 → 'blocked'（IsBreakable=false，WorldGen.cs:62540-62560
 *    CheckTileBreakability2_ShouldTileSurvive：有物整件不可破坏）；
 *  其余 → 'break'（正常破坏，调用方清格后 removeFurnitureAt）
 * @param tileType 命中格内部 tile id（调用方可选提供）——★七批备案④-c（2026-09-02）
 *   legacy 334 一击双掉特化判据：原版 334 的武器嵌在帧里（PlaceWeapon 帧标记,非 TE），
 *   KillTile_DropItems 对 334 只读帧掉武器【无 early return】（WorldGen.cs:64117-64165：
 *   :64151 Item.NewItem 掉武器 + :64153-64156 帧还原裸架后继续走完破坏链）,随后
 *   TileFrame case 334（:86786）→ CheckWeaponsRack :46855 同击掉架体 2699——两段式
 *   pop 的 early-return 是 471 TE 专属（:64186-64192 result3.DropItem()+return）。
 *   故 tileType==334 时返回 'break' 并带出存物（调用方先弹武器再落 object 路径碎架+
 *   def.drop 2699,同击完成）;471 与其余 kind 维持原判（两段式=原版同款）。
 */
export function furnitureTryBreak(
  records: FurnitureItemRecord[], kind: FurnitureKind, ax: number, ay: number,
  tileType?: number,
): { result: 'pop' | 'blocked' | 'break'; item: FurnitureSlot } {
  const rec = getFurniture(records, kind, ax, ay);
  if (!rec || !furnitureContainsItems(rec)) return { result: 'break', item: null };
  if (tileType !== undefined && tileType === RACK334_TILE) {
    const item = rec.slots[0];
    rec.slots[0] = null;
    return { result: 'break', item };
  }
  switch (kind) {
    case 'display_doll': case 'hat_rack':
      return { result: 'blocked', item: null };
    // 锚桩/风筝桩不走两段式：存物随破同击掉落（WorldGen.cs:63739-63744
    // DropItemForTileBreak，两 TE 同基类 TELeashedEntityAnchorWithItem :26-40），
    // 调用方继续碎块——正常链路经 Game.breakTile 的 723/724 专用分支（本表无此
    // 两 tile，此 case 仅为防未来误入 furnitureTryBreak 时语义不错）
    case 'critter_anchor': case 'kite_anchor': {
      const item = rec.slots[0];
      rec.slots[0] = null;
      return { result: 'break', item };
    }
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
 *  占位+多叠 → null；多叠 → 克隆 1 并手持 -1；单叠 → 整体交换（Utils.Swap——
 *  手持格收到原槽内容，空槽即空气，故置 item.stack=0 由调用方清手持格） */
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
  item.stack = 0; // 手持格交出整件（原槽为空 → Swap 后手持=空气）
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

/** 存档形状（SaveData.furniture；旧档缺省无）。★SW-BO1（SW-BL1 P1）：pose 为可选
 *  新字段（旧档缺省 undefined = 原版 0 Standing 档）——JSON 序列化自动版本兼容 */
export interface FurnitureSaveEntry {
  x: number;
  y: number;
  kind: FurnitureKind;
  slots: Array<{ id: number; stack: number; prefix?: number } | null>;
  pose?: number;
}

/** 运行时记录 → 存档条目（mapId = 内部 id → 磁盘稳定 id） */
export function furnitureToSave(records: FurnitureItemRecord[], mapId: (id: number) => number): FurnitureSaveEntry[] {
  return records.map((r) => ({
    x: r.x, y: r.y, kind: r.kind,
    slots: r.slots.map((s) => (s ? { id: mapId(s.id), stack: s.stack, prefix: s.prefix } : null)),
    pose: r.pose,
  }));
}

/** 存档条目 → 运行时记录（mapId = 磁盘稳定 id → 内部 id；防御：未知 id 归 0 → 置空槽） */
export function furnitureFromSave(entries: FurnitureSaveEntry[] | undefined, mapId: (id: number) => number): FurnitureItemRecord[] {
  if (!entries) return [];
  const out: FurnitureItemRecord[] = [];
  for (const e of entries) {
    const n = furnitureSlotCount(e.kind);
    const slots: FurnitureSlot[] = [];
    for (let i = 0; i < n; i++) {
      const s = e.slots[i];
      const mapped = s ? mapId(s.id) : 0;
      if (s && mapped > 0) slots.push({ id: mapped, stack: s.stack, prefix: s.prefix });
      else slots.push(null);
    }
    out.push({ x: e.x, y: e.y, kind: e.kind, slots, pose: e.pose });
  }
  return out;
}

// ============================================================================
// 模特姿态（★SW-BO1 2026-09-07 SW-BL1 P2：ChangePose + SupportedUseStylePoses 移植
//   TEDisplayDoll.cs:53-89 注册表 / :918-923 ChangePose / :135-153 IsValidPose。
//   渲染消费（P3 玩家形体合成器）单列未接——pose 数据在档,渲染仍图标近似）
// ============================================================================

/** DisplayDollPoseID（TEDisplayDoll.cs 枚举）：0 Standing / 1 Sitting / 2 Jumping /
 *  3 Walking / 4-8 Use1-Use5 */
const POSE_USE1 = 4;

/**
 * SupportedUseStylePoses 注册表（TEDisplayDoll.cs:53-89 RegisterUsePose 逐条 1:1，
 * 键 = Item.useStyle、值 = 该 useStyle 合法姿态 id 集（itemAnimationPercent/
 * ItemAimRadians 是渲染参数,P3 前无消费面不建模）：
 *   1 剑/工具族 Use1-5、5 锤/投掷弧族 Use1-5、13 短剑族 Use1-5、12 回旋镖族 Use1-3、
 *   其余（2 枪/3 弓/4 魔法/6 甩链/7 长柄/8 挥持/9 召唤/11/14/15）单 Use1。
 */
export const DOLL_SUPPORTED_USE_STYLE_POSES: Readonly<Record<number, readonly number[]>> = {
  1: [4, 5, 6, 7, 8],
  5: [4, 5, 6, 7, 8],
  13: [4, 5, 6, 7, 8],
  12: [4, 5, 6],
  2: [POSE_USE1], 7: [POSE_USE1], 3: [POSE_USE1], 4: [POSE_USE1], 6: [POSE_USE1],
  8: [POSE_USE1], 9: [POSE_USE1], 11: [POSE_USE1], 14: [POSE_USE1], 15: [POSE_USE1],
};

/**
 * TEDisplayDoll.ChangePose（:918-923）1:1：_pose++ 后 IsValidPose 判——
 * `<=3`（Standing..Walking）恒合法（IsValidPose :138-141 `(uint)testedPose <= 3u`）；
 * 4+ 仅当持握展示槽（slots[9] = _misc[0],IsValidPose :142 `_misc[0]`）的物品
 * useStyle ∈ 注册表且新 pose 在其列表内才合法，否则回 0。
 * 纯函数：返回新 pose（调用方写回 rec.pose）。
 */
export function dollNextPose(rec: FurnitureItemRecord): number {
  const next = (rec.pose ?? 0) + 1;
  if (next <= 3) return next;
  const held = rec.slots[9];
  const vid = held ? slotVid(held.id) : -1;
  const poses = vid > 0 ? DOLL_SUPPORTED_USE_STYLE_POSES[vanillaUseStyle(vid)] : undefined;
  return poses && poses.includes(next) ? next : 0;
}

// ============================================================================
// TECritterAnchor（tile 724 捕获小动物锚桩）/ TEKiteAnchor（tile 723 风筝锚桩），
//   1.4.4+ ——TELeashedEntityAnchorWithItem 等价的专用存取
//   原版链：放置捕获小动物/风筝物品（DefaultToCapturedCritter createTile=724 /
//     DefaultToKite createTile=723）→ PlaceFromPlayerPlacementHook（:43-58）把手持物
//     写入 TE（InsertItem :60-64 → RespawnLeashedEntity 生成拴绳实体）；
//     破坏 → KillTile_DropItems :63739-63744 DropItemForTileBreak（同击掉物+碎块，
//     与物品框两段式 pop 不同），tile 本体无掉落（GetItemDrop case 723/724
//     WorldGen.cs:66141-66145 break）。
//   本仓等价：furnitureItems 里 kind='critter_anchor'/'kite_anchor' 的单槽记录
//   （持久化走 serialize furniture 段对 kind 透传，无需改存档）；拴绳实体本体
//   = entities/LeashedCritter.ts（LeashedEntity 族 + Main.cs:17895/22163 消费）
// ============================================================================

/** 放置：写入手持物（InsertItem 1:1）。锚桩 1×1，锚点 = 放置格本身 */
export function leashedAnchorPlace(
  records: FurnitureItemRecord[], kind: 'critter_anchor' | 'kite_anchor', x: number, y: number,
  item: { id: number; stack: number; prefix?: number },
): FurnitureItemRecord {
  removeFurnitureAt(records, x, y);
  const rec: FurnitureItemRecord = {
    x, y, kind,
    slots: [{ id: item.id, stack: 1, prefix: item.prefix }],
  };
  records.push(rec);
  return rec;
}

/** 命中格 → 锚桩记录（1×1 无归一） */
export function leashedAnchorAt(
  records: FurnitureItemRecord[], kind: 'critter_anchor' | 'kite_anchor', x: number, y: number,
): FurnitureItemRecord | undefined {
  return records.find((r) => r.x === x && r.y === y && r.kind === kind);
}

/**
 * 破坏：取出并存清空存物（DropItemForTileBreak :26-40——itemType>0 才掉）。
 * @returns 被掉落的存物（null = 空桩/无记录）；调用方随后清格 + removeFurnitureAt
 */
export function leashedAnchorBreakDrop(
  records: FurnitureItemRecord[], kind: 'critter_anchor' | 'kite_anchor', x: number, y: number,
): FurnitureSlot {
  const rec = leashedAnchorAt(records, kind, x, y);
  if (!rec) return null;
  const item = rec.slots[0];
  rec.slots[0] = null;
  return item;
}

/** 捕获小动物锚桩（critter_anchor）便捷别名——Game 放置/破坏与 cage-placement 测试沿用 */
export function critterAnchorPlace(
  records: FurnitureItemRecord[], x: number, y: number,
  item: { id: number; stack: number; prefix?: number },
): FurnitureItemRecord {
  return leashedAnchorPlace(records, 'critter_anchor', x, y, item);
}

export function critterAnchorAt(records: FurnitureItemRecord[], x: number, y: number): FurnitureItemRecord | undefined {
  return leashedAnchorAt(records, 'critter_anchor', x, y);
}

export function critterAnchorBreakDrop(records: FurnitureItemRecord[], x: number, y: number): FurnitureSlot {
  return leashedAnchorBreakDrop(records, 'critter_anchor', x, y);
}

/** 风筝锚桩（kite_anchor）便捷别名（TEKiteAnchor 等价） */
export function kiteAnchorPlace(
  records: FurnitureItemRecord[], x: number, y: number,
  item: { id: number; stack: number; prefix?: number },
): FurnitureItemRecord {
  return leashedAnchorPlace(records, 'kite_anchor', x, y, item);
}

export function kiteAnchorAt(records: FurnitureItemRecord[], x: number, y: number): FurnitureItemRecord | undefined {
  return leashedAnchorAt(records, 'kite_anchor', x, y);
}

export function kiteAnchorBreakDrop(records: FurnitureItemRecord[], x: number, y: number): FurnitureSlot {
  return leashedAnchorBreakDrop(records, 'kite_anchor', x, y);
}
