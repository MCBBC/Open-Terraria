/**
 * SW-AU2 2026-09-06 —— Alt/Shift/Ctrl+左键 槽位动作路由（原版 1:1 数据面）。
 *
 * 权威：Terarria1457/Terraria.UI/ItemSlot.cs（1458 与 1457 本文件 diff 为空，零增量变更）：
 *  · 静态语境表   = 静态构造器 :316-429
 *  · 动作路由     = GetAlternateClickAction :601-700
 *  · 执行分派     = OverrideLeftClick cursorOverride 6/7/8/9/10 :702-843
 *  · 光标语境分配 = Main.cs 绘制点（见 slotContext 注）
 *
 * Options 缺省（:28-30）：DisableLeftShiftTrashCan=true、DisableQuickTrash=false
 * ——即 IngameOptions "Quick Trash" 三态（menu[223] Left Shift / menu[224] Left
 * Control / menu[253] Disabled）的【缺省档 = Left Control】。桌面缺省语义：
 *  · Shift+左键 = 仅快移（背包→箱 / 箱→背包 / 装备卸下 / 垃圾桶→背包）；
 *    无去处时【无动作 → 回落普通点击（拾取/选中）】——不丢垃圾桶！
 *  · Ctrl+左键  = Quick Trash：商店开着=整叠卖出（钱币豁免）、无店=丢垃圾桶。
 *  · Alt+左键   = FavoriteKey（Main.cs:67607 缺省 LeftAlt）：收藏/取消收藏 +
 *    配装共享开关；聊天输入开着=插物品 tag。
 *  · 收藏物/空格恒无任何替代动作（:604 `item.IsAir || item.favorited → null`）
 *    ——点击一律回落普通面。
 *
 * SW-AY1 2026-09-06 备案项清偿：
 *  · R1 canMergeStack = Item.CanStack（Item.cs:49870-49877）单源合并谓词；
 *  · R2 onlyNeedOneInInventory + canTakeToPersonalInventory favorited 拒收
 *    （Player.cs:39536 CanItemSlotAcceptPickup）+ :39495-39500 非弹药门同型扫；
 *  · R7 chestContainerContext：ChestUI.cs:330-355 世界箱=3 / 银行族=4 /
 *    虚空保险库(-5)=32（canFavoriteAt[32]/retainFavoriteOnMoveAt[32] 生效面）；
 *  · 研究/向导菜单 Shift 特化支（ItemSlot.cs:631-651）进路由；重铸支不可达
 *    （UI.showReforge 全屏 overlay 拦截槽点击，证据结案不建模）。
 */
import { ITEM_DEFS, ITEM_ONLY_NEED_ONE_OVERRIDE } from '../data/items';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import { viIdFromKey } from '../data/vanillaItemCombat';
import { armorSlotIndexOfInternal, statOfInternal } from '../data/vanillaItemStats';
import { equipKindOfInternal } from '../data/vanillaEquip';

/** ItemSlot.Options 缺省（ItemSlot.cs:28-30）= IngameOptions "Quick Trash" 三态的
 *  【缺省档 Left Control】（Main.cs:51444-51466 menu[224]） */
export interface QuickTrashOptions {
  /** :28 DisableLeftShiftTrashCan——true = Shift 不做垃圾桶/卖出（缺省） */
  disableLeftShiftTrashCan: boolean;
  /** :30 DisableQuickTrash——true = 连 Ctrl 快捷垃圾桶也关（缺省 false） */
  disableQuickTrash: boolean;
}

export const QUICK_TRASH_DEFAULTS: QuickTrashOptions = {
  disableLeftShiftTrashCan: true,
  disableQuickTrash: false,
};

/** Quick Trash 三态（IngameOptions menu[223]=Left Shift / menu[224]=Left Control /
 *  menu[253]=Disabled）→ ItemSlot.Options 布尔对映射（Main.cs:51454-51466 循环切换
 *  终态：LeftShift={DLS:false,DQT:false} / LeftControl={true,false} / Disabled={false,true}）。
 *  消费=Options.quickTrashMode（SW-AY1 #10 设置 UI）→ UI.altMoveClick env.opts */
export function quickTrashOptionsOf(mode: 'leftControl' | 'leftShift' | 'disabled'): QuickTrashOptions {
  if (mode === 'leftShift') return { disableLeftShiftTrashCan: false, disableQuickTrash: false };
  if (mode === 'disabled') return { disableLeftShiftTrashCan: false, disableQuickTrash: true };
  return { disableLeftShiftTrashCan: true, disableQuickTrash: false };
}

/** canFavoriteAt（:358-361）：0 背包（含开包快捷栏）/ 1 钱币 / 2 弹药 / 32 虚空袋 */
export const CAN_FAVORITE_AT: readonly number[] = [0, 1, 2, 32];

/** IsBlockedFromTransferIntoChest（★SW-BJ1 2026-09-06 单源,ChestUI.cs:1287-1298）：
 *  收藏钱槽 3213 → 存钱罐（bank,本仓 openChest.x=-2）、收藏虚空袋 4131/5325 →
 *  虚空袋（bank4,openChest.x=-5）——拒转入"自身"。消费面两处：①拖放/快捷移入臂
 *  （PickItemMovementAction case 4/32 :1483-1492 → UI 槽移动守卫）②收藏自锁
 *  tooltip 行（Main.cs:20846-20852 IsBlockedFromTransferIntoChest →
 *  UI.ItemCannotBePlacedInsideItself）。世界箱（context 3）无此门（case 3 直通） */
export function blockedFromTransferIntoChest(chestX: number, itemVid: number): boolean {
  return (chestX === -2 && itemVid === 3213)
    || (chestX === -5 && (itemVid === 4131 || itemVid === 5325));
}

/** canLoadoutShareAt（:367-371）：8 装备 / 9 时装装备 / 10 配饰 / 11 时装配饰 / 12 染料
 *  ——Alt+点 = 跨配装共享开关（ToggleLoadoutShare :851-861） */
export const CAN_LOADOUT_SHARE_AT: readonly number[] = [8, 9, 10, 11, 12];

/** retainFavoriteOnMoveAt（:362-366）：MouseItemSwap（:1227-1235）里移动/交换后
 *  【保留】favorited 标记的语境——背包族 + 重铸格。箱(3)/银行(4)/垃圾桶(6)/装备
 *  (8-12)/杂项(16-20/33) 面进出即清（双端清：槽端+光标端 :1232-1233） */
export const RETAIN_FAVORITE_ON_MOVE_AT: readonly number[] = [0, 1, 2, 32, 5];

/** canShareAt（:372-408，去重后）：Alt 按下 + 聊天输入开着 → 点格插物品 tag 的语境域
 *  （:583-587 → cursorOverride 2 → OverrideLeftClick :709-716）。快排抄录，13/14/21/
 *  22 例外族单列核对过：13 快捷栏不在域内（关包快捷栏无任何 ItemSlot 语义） */
export const CAN_SHARE_AT: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19, 20,
  22, 23, 24, 25, 26, 27, 29, 30, 32, 33, 34, 35, 38, 39, 41, 42, 43,
];

/** SW 槽位面（UI.SlotWhere）→ 原版 ItemSlot context。绘制/Handle 分配点：
 *  · 背包 0-49 = 0（Main.cs:41746，开包时快捷栏 0-9 同数组同语境）；
 *    钱币 50-53 = 1（:42474）；弹药 54-57 = 2（:42492）
 *  · 【关包快捷栏 = 13】（:44374 只 Draw 不 Handle——点击=changeItem 选中，
 *    无 Alt/Shift/Ctrl 任何语义）
 *  · 容器面 = chestContainerContext（SW-AY1 R7）：世界箱 3（:41997）/ 银行族 4 /
 *    虚空保险库 32（ChestUI.cs:330-355；本仓 openChest.x=-2..-5 承载银行来源）
 *  · armor 0-2 = 8 / 3-9 = 10（:42161 context2）；armor 10-12 = 9 / 13-19 = 11
 *    （:42202 context3）；dye 0-9 = 12（:42230）
 *  · 杂项族（宠物/光源/矿车/坐骑/钩爪）= 16-20、杂项染料 = 33——路由行为全同，
 *    本仓统一映射 16 / 33（Draw 分派 :2387-2454 逐槽语境，行为面无差异） */
export type SlotWhereLike = 'inv' | 'chest' | 'armor' | 'dye' | 'misc' | 'miscDye';

export function slotContext(where: SlotWhereLike, i: number, panelOpen: boolean, chestX?: number): number {
  switch (where) {
    case 'inv':
      if (i < 10 && !panelOpen) return 13;   // 关包快捷栏（HotbarItem）
      if (i >= 54) return 2;                 // 弹药（InventoryAmmo）
      if (i >= 50) return 1;                 // 钱币（InventoryCoin）
      return 0;                              // 背包（InventoryItem）
    case 'chest':
      return chestContainerContext(chestX);  // ★SW-AY1 R7：按容器来源分 3/4/32
    case 'armor':
      return i >= 13 ? 11 : i >= 10 ? 9 : i >= 3 ? 10 : 8;
    case 'dye':
      return 12;                             // EquipDye
    case 'misc':
      return 16;                             // EquipGrapple 族代表（16-20 同行为）
    case 'miscDye':
      return 33;                             // EquipMiscDye
  }
}

/** ★SW-AY1 R7 容器来源 → ItemSlot context（ChestUI.cs:330-355 逐支）：
 *  player.chest > -1（世界箱）= 3 ChestItem / -2..-4（存钱罐/保险箱/守护者熔炉）
 *  = 4 BankItem / -5（虚空保险库）= 32 VoidItem。32 与 3/4 的行为差 =
 *  canFavoriteAt[32]（:361 Alt 可收藏）与 retainFavoriteOnMoveAt[32]（:365 移动
 *  保留收藏）——BankItem(4) 与 ChestItem(3) 行为面全同（:664-671 同 case 组） */
export function chestContainerContext(x: number | undefined): number {
  if (x === -5) return 32;
  if (x === -2 || x === -3 || x === -4) return 4;
  return 3;
}

/** OverrideLeftClick cursorOverride 值（:731/:749/:772/:785/:823） */
export const CURSOR_TRASH = 6;
export const CURSOR_TRANSFER = 7;
export const CURSOR_FROM_CHEST = 8;
export const CURSOR_TO_CHEST = 9;
export const CURSOR_SELL = 10;

export type AltClickKind = 'sell' | 'trash' | 'toBackpack' | 'fromChest' | 'toChest' | 'unequip' | 'creativeDupe';

export interface AltClickPlan {
  kind: AltClickKind;
  cursorOverride: number;
}

export interface AltClickEnv {
  context: number;
  itemAir: boolean;
  favorited: boolean;
  /** Item.type 71-74（GetSellOrTrash 店开时 null :192-195） */
  isCoin: boolean;
  /** Main.npcShop > 0 */
  shopOpen: boolean;
  /** player.chest != -1（银行/虚空袋打开也算） */
  chestOpen: boolean;
  /** ChestUI.TryPlacingInChest(justCheck:true) 结果（ChestUI.cs:1205-1284） */
  chestCanTake: boolean;
  /** ItemSpace(...).CanTakeItemToPersonalInventory（Player.cs:39463-39507/:246-256） */
  canTakeToInventory: boolean;
  controlDown: boolean;
  shiftDown: boolean;
  opts?: QuickTrashOptions;
  /** ★SW-AY1 R5 Main.CreativeMenu.IsShowingResearchMenu()（:631）——旅程研究菜单在显 */
  researchMenuOpen?: boolean;
  /** ★SW-AY1 R5 Main.InGuideCraftMenu（:645）——向导反查浮层在显 */
  guideMenuOpen?: boolean;
  /** ★SW-AY1 R5 item.material（:647）——向导支材料判别（本仓=配方原料反查集近似） */
  itemMaterial?: boolean;
}

/** GetAlternateClickAction（ItemSlot.cs:601-700）1:1。返回 null = 无替代动作 →
 *  调用方回落普通点击（LeftClick → PickItemMovementAction 面） */
export function planAlternateClick(e: AltClickEnv): AltClickPlan | null {
  const opts = e.opts ?? QUICK_TRASH_DEFAULTS;
  // :608 flag = DisableLeftShiftTrashCan && !UsingGamepad（桌面无手柄 → 恒真值取反域）
  const flag = opts.disableLeftShiftTrashCan;
  if (e.itemAir || e.favorited) return null;                       // :604 收藏互斥总闸
  if ((e.controlDown && !opts.disableQuickTrash) && flag) {        // :609 Ctrl Quick Trash
    // :611 `(uint)context <= 4u || context == 7 || context == 32`（无符号技巧覆盖 0-4）
    if ((e.context >= 0 && e.context <= 4) || e.context === 7 || e.context === 32) {
      return getSellOrTrash(e);                                    // :613
    }
    return null;                                                   // 语境域外不回落 Shift
  }
  if (!e.shiftDown) return null;                                   // :616 ShiftInUse
  switch (e.context) {
    case 0: case 1: case 2: {                                      // :628-663
      // :631-651 菜单特化链（研究→重铸→向导→箱→快弃，else-if 互斥序）。
      // ★重铸支（:638-643 InReforgeMenu）本仓证据结案不建模：UI.showReforge 开
      //  全屏 overlay（inset:0 z:1150）拦截一切槽点击——:638 支在仓内不可达。
      // ★tileEntityAnchor 支（:618-625 模特/帽架槽）同结案：本仓 TE 模特/帽架
      //  走世界侧点击（Game dollPlace/hatRackPlace），无 ItemSlot 语境 23-27 槽面。
      if (e.researchMenuOpen) {                                    // :631-637
        if (e.context === 0) return { kind: 'toChest', cursorOverride: CURSOR_TO_CHEST };
        return null;                                               // context 1/2 在研究菜单下落空
      }
      if (e.guideMenuOpen) {                                       // :645-651
        if (e.context === 0 && e.itemMaterial) return { kind: 'toChest', cursorOverride: CURSOR_TO_CHEST };
        return null;
      }
      if (e.chestOpen) {
        return e.chestCanTake ? { kind: 'toChest', cursorOverride: CURSOR_TO_CHEST } : null;
      }
      if (!opts.disableQuickTrash && !flag) return getSellOrTrash(e);   // :659（缺省不可达）
      return null;
    }
    case 3: case 4: case 32:                                       // :664-671 箱/银行/虚空袋
      return e.canTakeToInventory ? { kind: 'fromChest', cursorOverride: CURSOR_FROM_CHEST } : null;
    case 8: case 9: case 10: case 11: case 12:                     // :672-687 装备/时装/配饰/染料
    case 16: case 17: case 18: case 19: case 20: case 33:
      return e.canTakeToInventory ? { kind: 'unequip', cursorOverride: CURSOR_TRANSFER } : null;
    case 5: case 6: case 7: case 29:                               // :688-696 重铸/垃圾桶/向导/旅程复制
      if (e.context === 29) return e.canTakeToInventory ? { kind: 'creativeDupe', cursorOverride: CURSOR_TRANSFER } : null;
      return e.canTakeToInventory ? { kind: 'toBackpack', cursorOverride: CURSOR_TRANSFER } : null;
  }
  return null;
}

/** GetSellOrTrash（:186-197）：店开=Sell（钱币 71-74 → null 不卖不扔）、店外=Trash */
function getSellOrTrash(e: AltClickEnv): AltClickPlan | null {
  if (!e.shopOpen) return { kind: 'trash', cursorOverride: CURSOR_TRASH };
  if (e.isCoin) return null;
  return { kind: 'sell', cursorOverride: CURSOR_SELL };
}

export interface InvScanItem { id: number; stack: number; favorited?: boolean; prefix?: number }

/** ★SW-AY1 R1 合并谓词单源 = Item.CanStack（Item.cs:49870-49877）：
 *  ```csharp
 *  if (item1.type == item2.type) return item1.prefix == item2.prefix;
 *  return false;
 *  ```
 *  prefix 语义：Item.prefix 缺省 0——本仓 ItemStack.prefix 缺省 undefined，按
 *  `undefined ≈ 0` 相等归一（同 grantCraftToCursor/Inventory.add preferHotbar 支
 *  既有约定）。三处合并路径（chestCanTakeJustCheck / shiftDepositToChest /
 *  placeHeld 合并算式）+ Inventory.fillRange 同吃本谓词（R1：曾只比 id，
 *  preferHotbar 支却比 prefix = 三处失同）。maxStack>1 门不在谓词内（原版在
 *  调用侧 `stack < maxStack` 先决） */
export function canMergeStack(a: { id: number; prefix?: number }, b: { id: number; prefix?: number }): boolean {
  return a.id === b.id && (a.prefix ?? 0) === (b.prefix ?? 0);
}

/** ★SW-AY1 R2 OnlyNeedOneInInventory（Item.cs:1177-1193）：
 *  ① ItemID.Sets.OnlyNeedOneInInventoryOverride（ItemID.cs:1223-1281，22 真/6 假）
 *     ——本仓数据面已备（items.ts ITEM_ONLY_NEED_ONE_OVERRIDE）；
 *  ② 缺省 = `!consumable && (useStyle == 0 ? CanBeEquipped() : true)`（:1184-1192）。
 *     消费面 = CanItemSlotAcceptPickup 的 favorited 拒收（Player.cs:39536）：收藏格
 *     只在 OnlyNeedOne 族上拒并/拒收（消耗品收藏堆照常收新件——原版收藏保护域）。 */
export function onlyNeedOneInInventory(id: number): boolean {
  const d = ITEM_DEFS[id];
  if (!d) return false;
  const vid = d.vid ?? viIdFromKey(d.key);
  if (!(vid > 0)) return false;
  const ov = ITEM_ONLY_NEED_ONE_OVERRIDE[vid];
  if (ov !== undefined) return ov;
  const f = itemFuncOfVid(vid);
  if (f?.consumable) return false;                          // :1191 消耗品恒 false
  if ((f?.useStyle ?? 0) !== 0) return true;                // :1190 非消耗品有使用姿势
  return canBeEquippedLike(id);                             // :1188 useStyle==0 → CanBeEquipped
}

/** CanBeEquipped（Item.cs:1160-1175）等价面：头/身/腿/配饰/钩爪/坐骑/宠物(含光
 *  源)=可装备。本仓以装备判定族数据近似（armorSlotIndexOfInternal/
 *  statOfInternal.acc/equipKindOfInternal）——buffType 宠物/光源由 equipKind 覆盖，
 *  纯材料 useStyle0（旗帜等）→ false 与原版一致。
 *  ★SW-RB4a 2026-09-06：染料【不在】CanBeEquipped 域——原文四个 slot/accessory/
 *  shoot-hook/mountType 检查均不含 dye>0（染料 useStyle 0 → 落 buffType==0 → false）
 *  ⇒ OnlyNeedOneInInventory(染料)=false（收藏染料堆照常收并,Item.cs:1184-1192）；
 *  曾含 'dye' 臂 = 收藏染料堆误拒拾取并堆 */
function canBeEquippedLike(id: number): boolean {
  if (armorSlotIndexOfInternal(id) >= 0 || statOfInternal(id)?.acc !== undefined) return true;
  const k = equipKindOfInternal(id);
  return !!k && (k === 'pet' || k === 'light' || k === 'cart' || k === 'mount' || k === 'hook');
}

/** ChestUI.TryPlacingInChest(justCheck:true)（ChestUI.cs:1205-1284）：合并面
 *  （:1219-1233 首个有位同型堆）∪ 空格面（:1258-1270）任一成立 → 可移入。
 *  IsBlockedFromTransferIntoChest（:1287-1298 收藏容器自锁）面在收藏总闸内已覆盖。
 *  ★SW-AY1 R1：合并判据改 canMergeStack（CanStack 词缀面 :1221） */
export function chestCanTakeJustCheck(
  items: readonly (InvScanItem | null)[],
  id: number,
  maxStack: number,
  prefix?: number,
): boolean {
  if (maxStack > 1) {
    for (const cs of items) {
      if (cs && cs.stack < maxStack && canMergeStack(cs, { id, prefix })) return true;
    }
  }
  for (const cs of items) {
    if (!cs) return true;
  }
  return false;
}

/** Player.ItemSpace(item).CanTakeItemToPersonalInventory（Player.cs:39463-39507 +
 *  CanItemSlotAcceptPickup :39530-39541 + ItemSpaceStatus :240-263）等价：
 *  · 钱币扫 0-53（:39474-39476 num=54）、其余扫 0-49（:39473 num=50）；
 *  · 空格 → true；同型且有余位（CanStack）→ true（:39540）；
 *  · ★R2 收藏格拒收面（:39536-39539 `theSlot.favorited && OnlyNeedOneInInventory()`
 *    → false）：收藏的 OnlyNeedOne 族堆不接受并堆——收藏保护域（消耗品例外）；
 *  · 弹药族（FitsAmmoSlot）追加 54-57 面（:39485-39494 CanGoIntoAmmoOnPickup）；
 *  · ★R2 :39495-39500 非弹药门同型扫——54-57 的无条件第二扫（不看 fitsAmmo、
 *    不看 favorited，纯 `type>0 && stack<maxStack && CanStack`）；
 *  · 虚空袋可收不计（:39502-39505 ItemIsGoingToVoidVault=true →
 *    CanTakeItemToPersonalInventory=false :246-256）——只装得进虚空袋 ≠ 能进背包。
 *  登记债（本批不动）：:39549 空弹药格须 CanFillEmptyAmmoSlot 的拒收面未接
 *  （现空弹药格恒可收）；Inventory.fillRange 拾取并堆面未接 favorited 拒收。 */
export function canTakeToPersonalInventory(
  slots: readonly (InvScanItem | null)[],
  id: number,
  maxStack: number,
  isCoin: boolean,
  fitsAmmo: boolean,
  prefix?: number,
): boolean {
  const num = isCoin ? 54 : 50;
  for (let i = 0; i < num; i++) {
    const s = slots[i];
    if (!s) return true;                                  // :39532 空格
    if (s.favorited && onlyNeedOneInInventory(s.id)) continue;   // ★R2 :39536-39539
    if (s.stack < maxStack && canMergeStack(s, { id, prefix })) return true;   // :39540 CanStack
  }
  if (fitsAmmo) {
    for (let j = 54; j < 58; j++) {
      const s = slots[j];
      if (!s) return true;
      if (s.favorited && onlyNeedOneInInventory(s.id)) continue;
      if (s.stack < maxStack && canMergeStack(s, { id, prefix })) return true;
    }
  }
  for (let k = 54; k < 58; k++) {                         // ★R2 :39495-39500 非弹药门同型扫
    const s = slots[k];
    if (s && s.stack < maxStack && canMergeStack(s, { id, prefix })) return true;
  }
  return false;                                           // 虚空袋兜底面不计（:246-256）
}
