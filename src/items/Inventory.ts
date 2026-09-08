// 物品栏：原版 1456 布局 1:1（Player.cs:1462-1380 / GetItem :38657-38736）：
//   slots[0-9]   快捷栏（selected）
//   slots[10-49] 背包主体（10 列 × 4 行，UI 与 0-9 同画为 10×5）
//   slots[50-53] 钱币栏（铜71/银72/金73/铂74，maxStack=100）
//   slots[54-57] 弹药栏 ×4（ammo>0 且非 notAmmo）
//   armor[20]    0-2 盔甲 / 3-9 配饰（8 恶魔之心 9 大师解锁）/ 10-12 时装盔甲 / 13-19 时装配饰
//   dye[10]      0-2 盔甲染料 / 3-9 配饰染料
//   trash        垃圾桶持久槽（Player.trashItem——关背包保留，死亡清空）
// 旧版（2026-08-11 前）自创布局 0-39 背包/40-44 配饰/45-47 盔甲/48-50 时装/51-53 钱币
// 的存档迁移见 SaveFile.loadSaveData 的 legacyInventoryMigrate。
import { ITEM_DEFS, ITEM_BY_KEY } from '../data/items';
import { canMergeStack, onlyNeedOneInInventory } from '../ui/SlotActions';   // ★SW-AY1 R1 合并谓词单源（Item.CanStack）
import { VI_KEY } from '../data/itemKeys';
import { isDyeItem, miscSlotAccepts } from '../data/vanillaEquip';
import { armorSlotIndexOfInternal, statOfInternal } from '../data/vanillaItemStats';
import { itemCombat, viIdFromKey } from '../data/vanillaItemCombat';
import { itemFuncOfVid } from '../data/vanillaItemFunc';

export const INV_COLS = 10;
/** 背包主体行数（不含快捷栏行） */
export const INV_ROWS = 4;
/** 原版拾取/合成扫描范围：0-49 背包 + 50-53 钱币 + 54-57 弹药 = 58（Player.cs 多处 58 字面量） */
export const INV_SIZE = 58;
/** 背包格数（拾取空槽扫描范围，Player.GetItem 用 num=50/58） */
export const BAG_SIZE = 50;
export const COIN_START = 50;
export const COIN_SLOTS = 4;
export const AMMO_START = 54;
export const AMMO_SLOTS = 4;
export const ARMOR_SLOTS = 10;        // armor[20] 前半（功能），后半 10 为时装镜像
export const ARMOR_TOTAL = 20;
export const DYE_SLOTS = 10;
/** 杂项装备[5]：0 宠物 / 1 光源 / 2 矿车 / 3 坐骑 / 4 钩爪（Player.cs:1376-1379） */
export const MISC_SLOTS = 5;
/** 三套 Loadout（Player.Loadouts :5421；EquipmentLoadout = armor[20]+dye[10]+hide[10]） */
export const LOADOUT_COUNT = 3;
/** armor[3] 起 = 配饰槽（原版 InitialAccSlotCount=5，index 3-7；8/9 需解锁） */
export const ACC_ARMOR_START = 3;
/** armor[10] 起 = 时装（镜像 index 差 10） */
export const VANITY_ARMOR_START = 10;
// 原版钱币 vi_71-74 单轨(本地 coin_* 已退役;消费点一律经本表派生)
export const COIN_KEYS = [
  VI_KEY.COIN.COPPER, VI_KEY.COIN.SILVER, VI_KEY.COIN.GOLD, VI_KEY.COIN.PLATINUM,
] as const;
/** 钱币面额（Item.cs:42-48：铜1/银100/金10000/铂1000000） */
export const COIN_VALUES = [1, 100, 10000, 1000000];

// ---- 旧布局常量（存档迁移与过渡期兼容，勿在新代码使用） ----
export const LEGACY_ACCESSORY_START = 40;
export const LEGACY_ARMOR_START = 45;
export const LEGACY_VANITY_START = 48;
export const LEGACY_COIN_START = 51;
export const LEGACY_INV_SIZE = 54;

export interface InvItem { id: number; stack: number; favorited?: boolean; /** 重铸词缀（Item.prefix，0/缺省=无） */ prefix?: number; /** 实例级放置样式（旗 bannerId 等） */ placeStyle?: number }

export function isCoinSlot(i: number): boolean {
  return i >= COIN_START && i < COIN_START + COIN_SLOTS;
}

export function isAmmoSlot(i: number): boolean {
  return i >= AMMO_START && i < AMMO_START + AMMO_SLOTS;
}

/** 金钱格收任意币种（ItemSlot context1：type 0/71-74 全通过,ItemSlot.cs:1338-1343——
 *  原版钱币槽【不锁面额】,任意币可放任意格。曾按槽位锁面额=误读该行） */
export function coinSlotAccepts(i: number, id: number): boolean {
  if (!isCoinSlot(i)) return false;
  return coinIndexOf(id) >= 0;
}

/** 弹药格校验（Item.FitsAmmoSlot 1:1，Item.cs:1351-1367）：
 *  ```csharp
 *  if ((type != 0 && ammo <= 0 && bait <= 0 && type != 530 && type != 849 && !PaintOrCoating) || notAmmo)
 *      return type == 353;
 *  return true;
 *  ```
 *  即：vid==353（信号枪本体，ammo=353+notAmmo 双设但豁免）恒收；
 *  其余 = (ammo>0 || bait>0 || vid∈{530,849} || 涂料) 且非 notAmmo。
 *  530=导线、849=油漆喷枪用填充物的原版硬编码豁免。
 *  PaintOrCoating（Item.cs:334：paint/paintCoating>0）提取表无 paint 字段，
 *  集合取 Item.cs paint=1..30 的 case 段（1073-1099 涂料 + 1966-1968/4668/5344 涂层） */
const PAINT_OR_COATING = new Set([
  ...Array.from({ length: 1099 - 1073 + 1 }, (_, i) => 1073 + i),
  1966, 1967, 1968, 4668, 5344,
]);

/** CanFillEmptyAmmoSlot（Item.cs:1360-1369 1:1）：拾取时能否落进【空的】弹药格。
 *  ```csharp
 *  if (bait <= 0 && !PaintOrCoating && type != 353 && type != 849 && type != 169
 *      && type != 75 && type != 23 && type != 408 && type != 370 && type != 1246)
 *      return !notAmmo;
 *  return false;
 *  ```
 *  即普通弹药（箭/子弹/火箭/飞镖）可自动填空格；凝胶(23 喷火器)/沙(169 沙
 *  枪)/坠星(75 星炮)/黑檀沙(370)/珍珠沙(408)/猩红沙(1246)/麦酒(353)/致动器
 *  (849) 这些"特殊弹药"不自动填——拾取落背包，仅手动拖入或合并弹药栏已有堆
 *  （FillAmmo 第一趟合并全部弹药、第二趟空格只收本表，Player.cs:38591-38655）。
 *  ★曾 fillRange 无差别合并+填空——凝胶从第一只史莱姆起就进弹药栏 = 用户
 *  实报"没到获得枪的阶段凝胶就归弹药"根因（2026-08-19） */
const NO_AUTO_FILL_AMMO = new Set([353, 849, 169, 75, 23, 408, 370, 1246]);

export function canFillEmptyAmmoSlot(id: number): boolean {
  const d = ITEM_DEFS[id];
  if (!d) return false;
  const vid = d.vid ?? viIdFromKey(d.key);
  if (vid < 0) return false;
  if (NO_AUTO_FILL_AMMO.has(vid)) return false;
  const f = itemFuncOfVid(vid);
  if (f?.notAmmo) return false;
  if ((f?.bait ?? 0) > 0 || PAINT_OR_COATING.has(vid)) return true;
  return (itemCombat(vid)?.ammo ?? 0) > 0;
}

export function ammoSlotAccepts(id: number): boolean {
  const d = ITEM_DEFS[id];
  if (!d) return false;
  const vid = d.vid ?? viIdFromKey(d.key);
  if (vid < 0) return d.ammoId !== undefined && d.ammoId > 0; // legacy 注册表自带 ammoId
  if (vid === 353) return true;
  const f = itemFuncOfVid(vid);
  if (f?.notAmmo) return false;
  if (vid === 530 || vid === 849 || PAINT_OR_COATING.has(vid)) return true;
  if ((f?.bait ?? 0) > 0) return true;
  return (itemCombat(vid)?.ammo ?? 0) > 0;
}

/** 是否任一币种 */
export function coinIndexOf(id: number): number {
  return COIN_KEYS.findIndex((k) => ITEM_BY_KEY[k] === id);
}

export function isAccessoryItem(id: number): boolean {
  return !!ITEM_DEFS[id]?.accessory || statOfInternal(id)?.acc !== undefined;
}

export function isArmorItem(id: number): boolean {
  // ★d.armor 死前腿已移除（2026-09-02:字段全仓零写入,部位真值源=itemstats 部位表）
  return armorSlotIndexOfInternal(id) >= 0;
}

export class Inventory {
  /** 0-49 背包（首行快捷栏）/ 50-53 钱币 / 54-57 弹药 */
  slots: Array<InvItem | null>;
  /** armor[20]：0-2 盔甲 / 3-9 配饰 / 10-12 时装盔甲 / 13-19 时装配饰（Player.cs:1372） */
  armor: Array<InvItem | null>;
  /** dye[10]：0-2 盔甲染料 / 3-9 配饰染料（Player.cs:1374） */
  dye: Array<InvItem | null>;
  /** miscEquips[5]：宠物/光源/矿车/坐骑/钩爪（Player.cs:1376） */
  miscEquips: Array<InvItem | null>;
  /** miscDyes[5]：杂项装备染料（Player.cs:1378） */
  miscDyes: Array<InvItem | null>;
  /** 三套 Loadout（EquipmentLoadout = armor[20]+dye[10]+hide[10]，Swap :65-82 三段
   *  元素级互换——R4-12 补 hide 段：配饰可见性随套记忆） */
  loadouts: Array<{ armor: Array<InvItem | null>; dye: Array<InvItem | null>; hide: boolean[] }>;
  /** 当前 Loadout 序号（0-2） */
  currentLoadout = 0;
  /** 恶魔之心 3335(Player.cs:44575-44583 ItemCheck_UseDemonHeart)解锁第六配饰槽
   *  (armor[8];基座 5=3-7)。世界难度旗仍存——经典世界旗在但格不生效(cs:18402) */
  extraAccessory = false;
  /** 世界难度门镜像（Game 每帧回写自 world.isExpert/isMaster——旅程滑杆改档即时生效） */
  gateExpert = false;
  gateMaster = false;
  /** 功能配饰槽上界(不含)——★2026-08-28 翻案旧"不设门偏差备案"：门可达
   *  （.sbw 世界导出/玩家跨世界携带),按原版 1:1 设门：
   *  cs:18402-18409 `extraAccessory && (expertMode||gameMenu) → extraAccessorySlots=1`
   *  + cs:IsItemSlotUnlockedAndUsable(9) 大师世界原生第 7 格(9 号槽,无需道具) */
  get accSlotMax(): number {
    return ACC_ARMOR_START + 5
      + ((this.extraAccessory && (this.gateExpert || this.gateMaster)) ? 1 : 0)
      + (this.gateMaster ? 1 : 0);
  }
  /** 绘制格数（Player.cs:4279 GetAmountOfExtraAccessorySlotsToShow：解锁【或】格内
   *  有物即显示——经典世界带专家档存物也显示,只是不生效）。hasAt(slot,dyeSlot)=
   *  格/染料格非空判定,由 UI 注入（读自身数组,避免 Inventory←UI 反向依赖） */
  shownExtraCount(hasAt: (slot: number, dyeSlot: number) => boolean): number {
    let n = 0;
    const heartUsable = this.extraAccessory && (this.gateExpert || this.gateMaster);
    if (heartUsable || hasAt(ACC_ARMOR_START + 5, 8)) n++;
    if (this.gateMaster || hasAt(ACC_ARMOR_START + 6, 9)) n++;
    return n;
  }
  /** 垃圾桶持久槽（Player.trashItem :1380——关背包保留、死亡清空 :53394） */
  trash: InvItem | null = null;
  selected = 0; // 快捷栏选中格

  constructor() {
    this.slots = Array(INV_SIZE).fill(null);
    this.armor = Array(ARMOR_TOTAL).fill(null);
    this.dye = Array(DYE_SLOTS).fill(null);
    this.miscEquips = Array(MISC_SLOTS).fill(null);
    this.miscDyes = Array(MISC_SLOTS).fill(null);
    this.loadouts = Array.from({ length: LOADOUT_COUNT }, () => ({
      armor: Array(ARMOR_TOTAL).fill(null),
      dye: Array(DYE_SLOTS).fill(null),
      hide: Array(10).fill(false),   // EquipmentLoadout.Hide = new bool[10]（:18）
    }));
  }

  /** 切换 Loadout（Player.TrySwitchingLoadout :5430-5434：先 Swap 当前套装备份仓、
   *  再 Swap 目标仓——玩家身上即换上目标套装，原套装入当前备份仓） */
  /** R4-12（EquipmentLoadout.cs:63-80）：hideVisible ↔ Hide[k] 第三段互换——
   *  配饰可见性随套记忆。hideVisible 由调用侧传入（Player 字段,Inventory 不持有） */
  trySwitchingLoadout(idx: number, hideVisible?: boolean[]): void {
    if (idx === this.currentLoadout || idx < 0 || idx >= LOADOUT_COUNT) return;
    const swap = (a: Array<InvItem | null>, b: Array<InvItem | null>, n: number) => {
      for (let i = 0; i < n; i++) { const t = a[i]; a[i] = b[i]; b[i] = t; }
    };
    const cur = this.loadouts[this.currentLoadout];
    const next = this.loadouts[idx];
    swap(this.armor, cur.armor, ARMOR_TOTAL);
    swap(this.dye, cur.dye, DYE_SLOTS);
    swap(this.armor, next.armor, ARMOR_TOTAL);
    swap(this.dye, next.dye, DYE_SLOTS);
    if (hideVisible) {
      for (let k = 0; k < 10 && k < hideVisible.length && k < cur.hide.length; k++) {
        const t0 = hideVisible[k]; hideVisible[k] = cur.hide[k]; cur.hide[k] = t0;
      }
      for (let k = 0; k < 10 && k < hideVisible.length && k < next.hide.length; k++) {
        const t0 = hideVisible[k]; hideVisible[k] = next.hide[k]; next.hide[k] = t0;
      }
    }
    this.currentLoadout = idx;
  }

  /** 光标持物镜像槽 58（SW-AZ1 2026-09-06）。vanilla 三件套：dropItemCheck（Player.cs:5122
   *  `inventory[58] = Main.mouseItem.Clone()`，每 tick）+ PickItemSelectionOverride
   *  （:17526-17548 mouseItem 非空 → 伪选中 58）→ HeldItem = inventory[selectedItem=58] =
   *  光标物——背包开着+光标捏物时，左键点世界 = 直接使用/放置光标物。
   *  本仓形态：UI.heldStack 活对象直挂（Game.syncCursorMirror 每 tick 同步/清端），
   *  消耗经 removeHeld() 直写 stack = 回写光标物（vanilla 消费点 :43659/:53421
   *  `Main.mouseItem = inventory[58].Clone()` 同步支同语义）。null = 未激活
   *  （光标空手 / 背包关 / CanChangeSelectedItemImmediately=false 窗——:415-421）。
   *  ★不入存档（SaveFile 只序列化 slots）不参与 collectOwnedItems（CollectItems
   *  Recipe.cs:418-433 槽帽 58 = 0-57，58 号镜像槽在原版同样不计材料） */
  cursorMirror: InvItem | null = null;

  heldItem(): InvItem | null {
    // 伪选中支（PickItemSelectionOverride Player.cs:17528-17532）：镜像非空即 HeldItem
    return this.cursorMirror ?? this.slots[this.selected];
  }

  /** 手持消耗统一入口（removeAt(selected) 的 HeldItem 语义版，SW-AZ1 2026-09-06）：
   *  镜像激活（光标持物伪选中）→ 扣镜像（共享对象，stack 变更即回写 UI 光标物，
   *  归零由 Game.syncCursorMirror 检出并清光标）；否则扣选中槽。
   *  原版全部 inventory[selectedItem].stack-- 消费点（放置 :43612-43651 族/
   *  消耗品/召唤物）在 selectedItem==58 期间都落在光标物上——本仓 56 处
   *  removeAt(selected) 消费点经本方法统一改道 */
  removeHeld(count = 1): boolean {
    const m = this.cursorMirror;
    if (m) {
      if (m.stack < count) return false;
      m.stack -= count;
      return true;
    }
    return this.removeAt(this.selected, count);
  }

  /** GetEffectiveArmor（1457 Player.cs:5679-5734,LoadoutShare"收藏装备跨配装共享"）：
   *  当前 Loadout 槽位为空时,跨三套 Loadout 同槽找【收藏】件共享——甲/配饰/时装全槽。
   *  ★消费面裁决（R4-19,1457 P57:13015-13048 逐行核实）：属性聚合
   *  （GrantPrefixBenefits+GrantArmorBenefits k=0..9 / ApplyEquipFunctional m=3..9）
   *  【全走 GetEffectiveArmor——共享件给全部属性】;"防空槽白嫖"由"只填空槽"+
   *  CanShareArmor（:5699-5727 槽型门 + CanEquipBothAccessories 配件互斥）承担,
   *  不存在"属性走裸 armor[]"的例外。视觉族（Main.cs:17552 头身腿帧/Player.cs:9696
   *  UpdateItemDye/UpdateVisibleAccessories）同样走 effective。
   *  CanShareArmor 的配件互斥深检（ItemSlot.CanEquipBothAccessories 物品对表）
   *  未建模,只做槽型门 armorAccepts（登记）;sharedFromLoadout 幽灵绘制/角标/空槽
   *  悬停代打已接（UI.paintLoadoutShare + showTooltipFor,ItemSlot.Draw :2454-2473） */
  getEffectiveArmor(slot: number): InvItem | null {
    const cur = this.armor[slot] ?? null;
    if (cur) return cur;
    for (const lo of this.loadouts) {
      const item = lo.armor[slot];
      if (item && item.favorited) {
        if (this.armorAccepts(slot, item.id)) return item;   // CanShareArmor 槽型门
        break;                                               // :5688-5691 不兼容 → break
      }
    }
    return cur;
  }

  /** GetEffectiveDye（1457 Player.cs:5736-5758）：染料槽同语义,无兼容门（原版直取） */
  getEffectiveDye(slot: number): InvItem | null {
    const cur = this.dye[slot] ?? null;
    if (cur) return cur;
    for (const lo of this.loadouts) {
      const item = lo.dye[slot];
      if (item && item.favorited) return item;
    }
    return cur;
  }

  /** 共享来源序号（tooltip "共享自配装{0}"/ItemLoadoutSharedFrom 用,GetEffectiveArmor
   *  的 out sharedFromLoadout 位）：当前槽非空 → null;否则首个同槽收藏件（甲侧过
   *  armorAccepts 门,不兼容 break 同 :5688-5691）→ 其 Loadout 序号 */
  effectiveSharedFrom(slot: number, dye: boolean): number | null {
    if ((dye ? this.dye[slot] : this.armor[slot])) return null;
    for (let i = 0; i < this.loadouts.length; i++) {
      const item = (dye ? this.loadouts[i].dye : this.loadouts[i].armor)[slot];
      if (item && item.favorited) {
        if (!dye && !this.armorAccepts(slot, item.id)) break;
        return i;
      }
    }
    return null;
  }

  /** 该槽位是否为油漆/涂层（Item.PaintOrCoating，Item.cs:334-344：
   *  paint<=0 ? paintCoating>0 : true——两域任一即真） */
  private isPaintSlot(i: number): boolean {
    const s = this.slots[i];
    if (!s || s.stack <= 0) return false;
    const d = ITEM_DEFS[s.id];
    return (d?.paint ?? 0) > 0 || (d?.paintCoating ?? 0) > 0;
  }

  /** FindPaintOrCoating（Player.cs:41272-41289）1:1：弹药栏 54-57 优先，
   *  再全包 0-57。返回油漆/涂层所在槽位下标；无 -1 */
  findPaintSlot(): number {
    for (let i = AMMO_START; i < AMMO_START + AMMO_SLOTS; i++) {
      if (this.isPaintSlot(i)) return i;
    }
    for (let i = 0; i < INV_SIZE; i++) {
      if (this.isPaintSlot(i)) return i;
    }
    return -1;
  }

  /** 手持油漆工具时的当前油漆 id（SmartCursorHelper.cs:167-181
   *  TryFindingPaintInplayerInventory 的 paintLookup；无油漆 0） */
  heldPaintLookup(): number {
    const i = this.findPaintSlot();
    return i < 0 ? 0 : (ITEM_DEFS[this.slots[i]!.id]?.paint ?? 0);
  }

  /** 同上的涂层侧（SmartCursorHelper.cs:40 paintCoatingLookup / :177
   *  coatingLookup = item.paintCoating；FindPaintOrCoating 命中槽的涂层 id，无 0） */
  heldCoatingLookup(): number {
    const i = this.findPaintSlot();
    return i < 0 ? 0 : (ITEM_DEFS[this.slots[i]!.id]?.paintCoating ?? 0);
  }

  heldDef() {
    const it = this.heldItem();
    return it ? ITEM_DEFS[it.id] : null;
  }

  /** 已装备的配饰列表（armor[3-9]，原版 Player.cs:36326 循环范围） */
  equippedAccessories(): number[] {
    const out: number[] = [];
    for (let i = ACC_ARMOR_START; i < this.accSlotMax; i++) {
      const s = this.armor[i];
      if (s && ITEM_DEFS[s.id]?.accessory) out.push(s.id);
    }
    return out;
  }

  /** 已穿戴的盔甲 id（armor[0-2]，时装不计防御） */
  equippedArmor(): Array<number | null> {
    return [0, 1, 2].map((k) => this.armor[k]?.id ?? null);
  }

  /** 显示用部位贴图：时装格（armor[10-12]）优先，回落装备格（Player.DisplayDoll 语义） */
  displayArmor(): Array<number | null> {
    return [0, 1, 2].map((k) => this.armor[VANITY_ARMOR_START + k]?.id ?? this.armor[k]?.id ?? null);
  }

  /** ItemID.Sets.DualEquipArmor（ItemID.cs:54）：功能/时装可同穿的盔甲白名单 */
  static readonly DUAL_EQUIP_ARMOR_VIDS = new Set([205, 5004, 4955]);

  /** armor[20] 下标能否接收物品（ItemSlot.PickItemMovementAction :1363-1494 +
   *  同款唯一性 CanEquipAccessoryInSlot :1311-1327/:3238-3245 + HasSameItemInSlot :3222）：
   *  0-2/10-12 部位校验（head/body/leg slot）+ 功能/时装段同款互斥（DualEquipArmor 例外,
   *  LeftClick block :1251/:1260）;3-9 功能配饰（vanity 排除）/13-19 社交配饰——
   *  段内同 type 唯一（自身槽放行 = 换回原位）+ 双翅膀互斥（CanEquipBothAccessories
   *  :3196-3205）+ 对段（功能↔社交）同 type 互斥（:1313/:1322）。
   *  vi_ 批次物品的部位/配饰归属查 vanilla-itemstats.json（注册期无字段） */
  armorAccepts(i: number, id: number): boolean {
    if (i < 0 || i >= ARMOR_TOTAL) return false;
    const d = ITEM_DEFS[id];
    if (!d) return false;
    const part = i % VANITY_ARMOR_START; // 0-2=部位 3-9=配饰（与 10-19 镜像同判）
    if (part <= 2) {
      // ★d.armor 死分支已移除（2026-09-02：字段全仓零写入,恒走 itemstats 部位表）
      const ok = armorSlotIndexOfInternal(id) === part;
      if (!ok) return false;
      // 功能↔时装同款互斥（HasSameItemInSlot 对段扫描;DualEquipArmor 例外 :1251/:1260）
      const vid = d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      if (!Inventory.DUAL_EQUIP_ARMOR_VIDS.has(vid)) {
        const other = i < VANITY_ARMOR_START ? i + VANITY_ARMOR_START : i - VANITY_ARMOR_START;
        if (this.armor[other]?.id === id) return false;
      }
      return true;
    }
    const st = statOfInternal(id);
    if (d.accessory) {
      if (i >= VANITY_ARMOR_START) return false;   // legacy 配饰仅进功能段
    } else if (i < VANITY_ARMOR_START) {
      if (st?.acc !== 1) return false;             // 功能配饰槽：vanity 排除
    } else if (st?.acc === undefined) {
      return false;                                // 社交配饰槽：功能/社交都收
    }
    // ---- 唯一性（CanEquipAccessoryInSlot）----
    const sameSeg: [number, number] = i < VANITY_ARMOR_START
      ? [ACC_ARMOR_START, ARMOR_SLOTS] : [VANITY_ARMOR_START + ACC_ARMOR_START, VANITY_ARMOR_START + ARMOR_SLOTS];
    const otherSeg: [number, number] = i < VANITY_ARMOR_START
      ? [VANITY_ARMOR_START + ACC_ARMOR_START, VANITY_ARMOR_START + ARMOR_SLOTS] : [ACC_ARMOR_START, ARMOR_SLOTS];
    const isWing = st?.wing != null;
    const clash = (lo: number, hi: number) => {
      for (let k = lo; k < hi; k++) {
        if (k === i) continue;                      // 冲突槽=自身槽放行（:3242 slot == collisionSlot）
        const t = this.armor[k]?.id;
        if (t === undefined) continue;
        if (t === id) return true;                  // 段内同 type（:3201）
        if (isWing && statOfInternal(t)?.wing != null) return true;  // 双翅膀（:3202）
      }
      return false;
    };
    if (clash(sameSeg[0], sameSeg[1])) return false;
    for (let k = otherSeg[0]; k < otherSeg[1]; k++) {   // 对段同 type（含自身位）:1313/:1322
      if (this.armor[k]?.id === id) return false;
    }
    return true;
  }


  /** dye 槽能否接收（ItemSlot context 12/25/27/33：checkItem.dye > 0——染料物品白名单） */
  dyeAccepts(id: number): boolean {
    return isDyeItem(id);
  }

  /** miscEquips 槽能否接收（ItemSlot context 16-20：宠物/光源/矿车/坐骑/钩爪分类门） */
  miscAccepts(slot: number, id: number): boolean {
    return miscSlotAccepts(slot, id);
  }

  /** slots 下标能否接收物品（钱币/弹药专格校验；0-49 通用） */
  canAccept(i: number, id: number): boolean {
    if (isCoinSlot(i)) return coinSlotAccepts(i, id);
    if (isAmmoSlot(i)) return ammoSlotAccepts(id);
    return true;
  }

  /** 添加物品（Player.GetItem :38657-38736 优先级 1:1），返回未能放入的数量：
   *  ① 钱币先进 50-53；② 弹药进 54-57（先合并已有再空格）；
   *  ③ 合并 0-49 已有堆（先于空槽）；④ 空槽【降序】从背包末尾填（原版非收藏物降序）
   *  ⑤ 钱币满 100 自动合大（DoCoins :38573-38589）
   *  ★SW-BP1 2026-09-07（RB4a 债④）favorited 随行：原版 GetItem 的空格落位
   *  `inventory[i] = returnItem`（Player.cs:39873/GetItem_FillEmptyInventorySlot,
   *  FillAmmo 空格支 :39620 同式）=【整个 Item 对象】入槽——favorited/prefix/
   *  placeStyle 全随行。本仓 add 通道此前不收 favorited（落新堆丢收藏金边）。
   *  语义域=「从 UI 面流回背包的整对象」（关包光标物归位 dropItemCheck→
   *  GetOrDropItem Player.cs:5135-5140、向导材料格取回 GetOrDropItem(Main.guideItem)
   *  :5112-5114）；世界拾取链调用方不传（缺省 false）=行为不变（世界掉落本无收藏）。
   *  空格序（★SW-BN5 2026-09-08 两臂 1:1,见 fillBagArms 注）：favorited 件升序
   *  首空格（:39681-39687 favorited 臂）/ 非收藏件【降序】从背包尾填（:39688-39700,
   *  旧 ③ 空格支升序预占=BP1 登记偏差已清偿）。 */
  /** noCoinMerge（R14-B4）：钱币入包跳过 doCoins 自动升面额（GetItemSettings.cs:25
   *  ReturnItemShowAsNewNoCoinMerge——合成 1 银→100 铜不被瞬时合回） */
  addNoCoinMerge(id: number, count: number): number {
    return this.add(id, count, undefined, undefined, true);
  }

  add(id: number, count: number, prefix?: number, placeStyle?: number, noCoinMerge = false,
    preferHotbar = false, favorited = false): number { // prefix/placeStyle/favorited 随新放置槽写入（合并已有堆保留现有）；preferHotbar=授予类入包先热栏（见 ②'）
    // 未知 id 守卫(2026-08-18):裸 .maxStack 曾让一个不在定义表的掉落物在拾取瞬间
    // TypeError 炸掉整个帧循环(用户实报:砍树掉落自动收集时崩溃)——拒绝入包并
    // 留栈取证,定位是谁产出了这个 id
    if (!(id >= 0) || !ITEM_DEFS[id]) {
      console.warn(`[inv.add] 未知物品 id=${id} count=${count} — 已拒绝入包`, new Error('来源栈').stack);
      return count;
    }
    const max = ITEM_DEFS[id].maxStack;
    // ① 钱币：钱币格循环（填→转）到无进展（GetItem 每次合并后即 DoCoins :38840）,
    //    溢出再走背包合并/空格（:38701+ 通用路径——原版溢出币进 0-49,非丢弃）
    const ci = coinIndexOf(id);
    if (ci >= 0) {
      let guard = 0;
      while (count > 0 && guard++ < 100000) {   // 上限仅防呆;无进展 break 已保证收敛
        const before = count;
        count = this.fillRange(COIN_START, COIN_SLOTS, id, count, max);
        if (!noCoinMerge) this.doCoins();
        if (count === before) break;   // 无进展（格满且不再转换）→ 溢出走背包
      }
      if (count > 0) {
        // ★SW-BN5 2026-09-08：溢出币袋支与普通拾取同构（GetItem :39671-39700——
        //    favorited 升序/非收藏降序,币经 isACoin 拒支跳热栏臂 :39671,见 fillBagArms 注）
        count = this.fillBagArms(id, count, max, placeStyle, prefix, favorited, true);
      }
      return count;
    }
    // ② 弹药（FillAmmo :38591-38655 两趟 1:1）：第一趟合并 54-57 已有堆（全部
    //    FitsAmmoSlot 物——凝胶并入弹药栏已有凝胶堆是原版行为）；第二趟填空格
    //    仅 CanFillEmptyAmmoSlot 物（凝胶/沙/坠星等特殊弹药不自动入栏）
    if (ammoSlotAccepts(id)) {
      // 第一趟只合并（FillAmmo :38594-38630——全部弹药并已有堆,凝胶亦然）
      count = this.fillRange(AMMO_START, AMMO_SLOTS, id, count, max, placeStyle, true, prefix);
      // 第二趟空格仅 CanFillEmptyAmmoSlot（:38632-38651；inventory[j] = newItem 整对象——
      // ★SW-BP1 favorited 随行,FillAmmo 空格支 :39620 同式）
      if (count > 0 && canFillEmptyAmmoSlot(id)) {
        for (let i = AMMO_START; i < AMMO_START + AMMO_SLOTS && count > 0; i++) {
          if (!this.slots[i]) {
            const put = Math.min(max, count);
            this.slots[i] = { id, stack: put, ...(prefix ? { prefix } : {}), ...(placeStyle !== undefined ? { placeStyle } : {}), ...(favorited ? { favorited: true } : {}) };
            count -= put;
          }
        }
      }
    }
    // ②' preferHotbar（2026-09-02 神圣种子 UX 批）：授予类入包（旅行浏览器复制）
    //    先热栏落位——旧策略④从背包尾降序填，热栏满时新授物落背包深处，玩家手里
    //    仍是旧物继续点地（行为日志两轮：授予后 21 条 use 全是旧草块）。顺序=
    //    当前选中空槽 → 热栏空槽 0..9；溢出/非空槽族照旧走 ③④。
    if (preferHotbar) {
      const sel = Math.min(Math.max(this.selected, 0), 9);
      for (const i of [sel, ...Array.from({ length: 10 }, (_, k) => k)]) {
        if (count <= 0) break;
        if (i >= 10) continue;
        const s = this.slots[i];
        // ★SW-BM1：同 fillRange——收藏 OnlyNeedOne 堆不并（授予路径同 GetItem 门面）
        // ★SW-BP1：合并判据改 canMergeStack 单源（词缀+placeStyle 位同箱/fillRange 面）
        if (s && s.stack < max && canMergeStack(s, { id, prefix, placeStyle })
          && !(s.favorited && onlyNeedOneInInventory(s.id))) {
          const put = Math.min(max - s.stack, count);
          s.stack += put;
          count -= put;
        } else if (!s) {
          const put = Math.min(max, count);
          this.slots[i] = { id, stack: put, ...(prefix ? { prefix } : {}), ...(placeStyle !== undefined ? { placeStyle } : {}), ...(favorited ? { favorited: true } : {}) };
          count -= put;
        }
      }
      if (count <= 0) return 0;
    }
    // ③④ 袋支两臂（★SW-BN5 2026-09-08 清偿 BP1 登记偏差：旧 ③ 空格支升序对全体
    //    生效,使非收藏件降序臂（:39688-39700）常态不可达。现 favorited 升序臂由
    //    fillRange 空格支承载,非收藏件 merge-only 后由 fillDescending 降序执行）
    count = this.fillBagArms(id, count, max, placeStyle, prefix, favorited);
    return count;
  }

  /** ★SW-BN5 2026-09-08：GetItem 袋支三臂（Player.cs:39671-39700 1:1）——
   *  ③ 合并 0-49 已有堆（GetItem_FillIntoOccupiedSlot :39796;favorited OnlyNeedOne
   *  拒收门 :39536-39539 在 merge-only 化后经 fillRange.favoritedGate 显式保持——
   *  原 mergeOnly 一参耦合「无空格支+无拒收门」两语义：FillAmmo 首趟（:39575-39601
   *  原版无门）须无门、袋合并（:39536 有门）须有门,故解耦为独立参,既有调用位
   *  默认值 `!mergeOnly` 行为零漂移）。
   *  热栏空格臂（:39671-39680 `!isACoin && newItem.useStyle != 0` → 空热栏 0..9 升序,
   *  GetItem_FillEmptyInventorySlot :39873 整对象入槽）：useStyle 数据面 =
   *  vanilla-itemfunc.useStyle（本仓唯一逐件源,heldUseStyle Game.ts:10222 同源）。
   *  ★取数口径=exact-only（缺条目/缺键=useStyle 0=原版缺省 → 不接臂）,与
   *  heldUseStyle 的「缺数据回退 1」刻意分叉：持姿渲染错档≠落位语义错路,臂路由
   *  取保守向。提取器缺口类（共享 case 块/公式段/DefaultTo* 助手,vanillaItemFunc.ts
   *  头注在案）漏报的 useStyle≠0 件=登记残差（落降序臂代热栏臂）。
   *  ★isACoin 拒支（:39671）：币 71-74 itemfunc useStyle=1 但原版币不接本臂——
   *  钱币溢出路径经 isACoin=true 跳过。
   *  收藏空格臂（:39681-39687 favorited 臂,升序 0..49——fillRange 空格支承载,
   *  SW-BP1 收藏金边行为零回退）；非收藏【降序】臂（:39688-39700
   *  `for (num4 = num-1; num4 >= 0; num4--)`——fillDescending 唯一执行者）。 */
  private fillBagArms(id: number, count: number, max: number, placeStyle: number | undefined,
    prefix: number | undefined, favorited: boolean, isACoin = false): number {
    count = this.fillRange(0, BAG_SIZE, id, count, max, placeStyle, true, prefix, favorited, true);
    if (count > 0 && !isACoin && this.itemUseStyleOf(id) !== 0) {
      for (let j = 0; j < 10 && count > 0; j++) {
        if (!this.slots[j]) {
          const put = Math.min(max, count);
          this.slots[j] = { id, stack: put, ...(prefix ? { prefix } : {}), ...(placeStyle !== undefined ? { placeStyle } : {}), ...(favorited ? { favorited: true } : {}) };
          count -= put;
        }
      }
      if (count <= 0) return 0;
    }
    if (favorited) {
      return this.fillRange(0, BAG_SIZE, id, count, max, placeStyle, false, prefix, favorited);
    }
    return this.fillDescending(id, count, max, placeStyle, prefix, favorited);
  }

  /** useStyle 查表（:39672 判据数据面）：itemfunc.useStyle 显式值;缺条目/缺键=0 */
  private itemUseStyleOf(id: number): number {
    const def = ITEM_DEFS[id];
    if (!def) return 0;
    const vid = def.vid ?? viIdFromKey(def.key);
    if (!(vid > 0)) return 0;
    return itemFuncOfVid(vid)?.useStyle ?? 0;
  }

  /** 非收藏件空格【降序】臂（Player.cs:39688-39700 → GetItem_FillEmptyInventorySlot
   *  :39873 `inventory[i] = returnItem` 整对象入槽）——★SW-BN5 起唯一降序执行者。 */
  private fillDescending(id: number, count: number, max: number, placeStyle: number | undefined,
    prefix: number | undefined, favorited: boolean): number {
    for (let i = BAG_SIZE - 1; i >= 0 && count > 0; i--) {
      if (!this.slots[i]) {
        const put = Math.min(max, count);
        this.slots[i] = { id, stack: put, ...(prefix ? { prefix } : {}), ...(placeStyle !== undefined ? { placeStyle } : {}), ...(favorited ? { favorited: true } : {}) };
        count -= put;
      }
    }
    return count;
  }

  /** 范围内先合并后空格填充。★SW-AY1 R1：合并判据补词缀面（Item.CanStack
   *  Item.cs:49870-49874 同型且 prefix 相等）——经 SlotActions.canMergeStack 单源
   *  谓词（与 UI 合并三路径同源）；placeStyle 门为本仓实例样式防混堆扩展,原版无。
   *  ★SW-BP1 2026-09-07（RB4a 候⑦）：placeStyle 门并入 canMergeStack placeStyle 位
   *  （语义不变：任一侧 undefined 不设门/双侧皆存比相等——三元展开逐字等价），
   *  与箱合并三路径单源同吃。
   *  ★SW-BM1 2026-09-06（GetItem :39796-39800 CanItemSlotAcceptPickup 面拾取侧）：
   *  合并支接收藏拒收 `theSlot.favorited && OnlyNeedOneInInventory() → 不可并`
   *  （Player.cs:39536-39539 同判,SlotActions.onlyNeedOneInInventory 单源）——
   *  世界拾取/合成溢出不再并入收藏的 OnlyNeedOne 族堆;mergeOnly=true（FillAmmo
   *  :39575-39601 弹药首趟合并）原版无 favorited 门,不接;空格支原版恒收,不接。
   *  ★SW-BP1 favorited 随行：空格落位带收藏标记（GetItem_FillEmptyInventorySlot
   *  :39873 `inventory[i] = returnItem` 整对象语义,add 通道 favorited 入参透传） */
  private fillRange(start: number, len: number, id: number, count: number, max: number,
    placeStyle?: number, mergeOnly = false, prefix?: number, favorited = false,
    favoritedGate = !mergeOnly): number {
    for (let i = start; i < start + len && count > 0; i++) {
      const s = this.slots[i];
      // placeStyle 匹配门(2026-08-13):不同敌旗(bannerId)不并入已有堆——
      // 原版每旗独立 item id 天然隔离,本仓单物品+实例 style 需此门防混堆
      //（★SW-BP1 起判据在 canMergeStack placeStyle 位,此处不再内联展开）
      // ★SW-BN5 2026-09-08：favorited 拒收门与 mergeOnly 解耦（favoritedGate 独立参,
      //  缺省 !mergeOnly=旧耦合行为零漂移;fillBagArms 袋合并传 true=merge-only 仍有门）
      if (s && s.stack < max && canMergeStack(s, { id, prefix, placeStyle })
        && !(favoritedGate && s.favorited && onlyNeedOneInInventory(s.id))) {
        const put = Math.min(max - s.stack, count);
        s.stack += put;
        count -= put;
      }
    }
    if (!mergeOnly) {
      for (let i = start; i < start + len && count > 0; i++) {
        if (!this.slots[i]) {
          const put = Math.min(max, count);
          // ★SW-AY1 R1：空格落位随行词缀（原版整 Item 对象入槽,prefix 不丢）——
          // 旧实现裸 {id,stack} 曾把词缀件落成无词缀堆（词缀门建立后成数据矛盾）
          this.slots[i] = { id, stack: put, ...(prefix ? { prefix } : {}), ...(favorited ? { favorited: true } : {}) };
          count -= put;
        }
      }
    }
    return count;
  }

  /** DoCoins（Player.cs:38573-38589）1:1：扫 0-53（背包+钱币格,不含弹药）,
   *  任意币堆 stack==100 且面额 71-73 → 本槽升一级面额置 1（:38578 SetDefaults(type+1)）,
   *  再找别处同型未满堆 +1 并清本槽（:38580-38588,递归 DoCoins(j)）——外层
   *  while(changed) 等价覆盖递归。铂不升（:38574 只认 71-73）。
   *  ★旧实现按"槽位=面额"锁死：第二堆铜币落 51 槽被当银币位永远不转;
   *  且合并恰好满 100 时被调用点 count>0 门跳过 = "满 100 铜不转银"双根因
   *  （2026-08-13 用户实抓,重写） */
  private doCoins(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < COIN_START + COIN_SLOTS; i++) {
        const s = this.slots[i];
        if (!s) continue;
        const tier = coinIndexOf(s.id);
        if (tier < 0 || tier > 2) continue;          // 非币/铂币不升
        if (s.stack < 100) continue;                 // :38575 stack != 100 return
        // 本槽变 1 枚上级（原位,不挪槽）
        const nextId = ITEM_BY_KEY[COIN_KEYS[tier + 1]];
        s.id = nextId;
        s.stack = 1;
        changed = true;
        // 找同型未满堆 +1 → 清本槽（原版随后递归 DoCoins(j)）
        for (let j = 0; j < COIN_START + COIN_SLOTS; j++) {
          if (j === i) continue;
          const t = this.slots[j];
          if (t && t.id === nextId && t.stack < (ITEM_DEFS[nextId]?.maxStack ?? 100)) {
            t.stack++;
            this.slots[i] = null;
            break;
          }
        }
      }
    }
  }

  /** 槽位级 DoCoins（Player.cs:39554-39570 原式，i 定点入口）：只审 slots[i]——
   *  恰 stack==100 且面额 71-73 才把本槽 SetDefaults(type+1) 升一级置 1（:39578），
   *  随后找 0-53 内别处同【升级后】面额的未满堆 +1、本槽 TurnToAir（:39581-39583）
   *  并递归 DoCoins(j)（:39584）；i 本体清空后 type==0 使后续 j 全失配 ⇒ 每次调用至多
   *  归并一处（原文同构）。铂(74)不升（:39575 只认 71/72/73）。
   *  消费面 = 虚空袋溢流通道：GetItem_FillEmptyInventorySlot_VoidBag 尾部逐槽
   *  `if (!settings.NoCoinMerge) DoCoins(i)`（Player.cs:39844-39847）——★反编译原文该
   *  调用读的是 this.inventory（主背包），而非形参 inv 数组（inv 仅承载 bank4 槽位）：
   *  【钱币升档结算在主背包同下标位发生,虚空袋自身永不换币】（2026-08-31 台账"币种
   *  兑换 DoCoins"清偿接线的原式定谳;全扫版 doCoins() 为同一谓词的全域遍历口径,
   *  与消费侧行为差 = 手改出恰 100 堆的外来状态才会被全扫多收——存档链路不可达）。 */
  public doCoinsAt(i: number): void {
    if (i < 0 || i >= COIN_START + COIN_SLOTS) return;      // 原文无上界守卫（inventory[59]）,
    const s = this.slots[i];                                // 本仓以 0..53 有效位显式等价
    if (!s) return;
    const tier = coinIndexOf(s.id);
    if (tier < 0 || tier > 2) return;                       // :39575 非 71-73 return
    if (s.stack !== 100) return;                            // :39575 stack != 100 return
    const nextId = ITEM_BY_KEY[COIN_KEYS[tier + 1]];
    s.id = nextId;
    s.stack = 1;                                            // :39578
    for (let j = 0; j < COIN_START + COIN_SLOTS; j++) {     // :39579 j < 54
      if (j === i) continue;
      const t = this.slots[j];
      if (t && t.id === nextId && t.stack < (ITEM_DEFS[nextId]?.maxStack ?? 100)) {
        t.stack++;                                          // :39582
        this.slots[i] = null;                               // :39583 TurnToAir
        this.doCoinsAt(j);                                  // :39584 递归 DoCoins(j)
        break;                                              // 清空后条件恒假,原文等价终了
      }
    }
  }

  removeAt(i: number, count = 1): boolean {
    const s = this.slots[i];
    if (!s || s.stack < count) return false;
    s.stack -= count;
    if (s.stack <= 0) this.slots[i] = null;
    return true;
  }

  countOf(id: number): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.stack;
    return n;
  }

  /** 全格扫扣（0-57；不动 armor/dye/trash） */
  remove(id: number, count: number): boolean {
    if (this.countOf(id) < count) return false;
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.stack, count);
        s.stack -= take;
        count -= take;
        if (s.stack <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  /** 交换/合并 slots 两格（UI 拖拽；钱币/弹药专格校验） */
  swap(i: number, j: number) {
    const a = this.slots[i], b = this.slots[j];
    if (a && !this.canAccept(j, a.id)) return;
    if (b && !this.canAccept(i, b.id)) return;
    if (a && b && a.id === b.id) {
      const max = ITEM_DEFS[a.id].maxStack;
      const put = Math.min(max - b.stack, a.stack);
      b.stack += put;
      a.stack -= put;
      if (a.stack <= 0) this.slots[i] = null;
    } else {
      this.slots[i] = b;
      this.slots[j] = a;
    }
  }

  /** 旧布局（≤53 槽 + 盔甲/时装/配饰内嵌）→ 新布局迁移（读档调用） */
  /** 装备族槽栈消毒（读档/联机快照恢复用，2026-08-24）：装备/时装/染料/杂项/
   *  配装数组恒容 1 件——旧档（2026-08-13 右键门/今日拖放门前产生）可携带多叠
   *  装备，切换配装/GetEffectiveArmor 共享会整叠上身。原版存档不可能出现该形态
   *  （ItemSlot case1/2 全链封顶），钳 1 无损 */
  static sanitizeEquipStacks(inv: {
    armor: Array<InvItem | null>; dye: Array<InvItem | null>;
    miscEquips: Array<InvItem | null>; miscDyes: Array<InvItem | null>;
    loadouts: Array<{ armor: Array<InvItem | null>; dye: Array<InvItem | null>; hide?: boolean[] }>;
  }): void {
    const clamp = (arr: Array<InvItem | null>) => {
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (it && it.stack > 1) it.stack = 1;
      }
    };
    clamp(inv.armor); clamp(inv.dye); clamp(inv.miscEquips); clamp(inv.miscDyes);
    for (const lo of inv.loadouts) { clamp(lo.armor); clamp(lo.dye); }
    // LoadoutShare 偏离清零（R4-15③）：misc 族原版无收藏语义（canFavoriteAt 仅
    // context 0/1/2/32,IS57:358-361）——偏离批曾可 toggle,旧档残留剥除,杜绝杂项格
    // 金边/tooltip"已共享"行假象。★armor/dye/loadouts 的收藏=共享源数据,勿动
    const stripFav = (arr: Array<InvItem | null>) => {
      for (const it of arr) if (it) it.favorited = false;
    };
    stripFav(inv.miscEquips); stripFav(inv.miscDyes);
  }

  static migrateLegacy(legacy: Array<{ id: number; stack: number } | null>): {
    slots: Array<InvItem | null>; armor: Array<InvItem | null>;
  } {
    const inv = new Inventory();
    if (legacy.length <= LEGACY_COIN_START + 3 && legacy.length > 0) {
      // 旧 54 槽布局：0-39 背包原位 / 40-44 配饰→armor[3-7] / 45-47 盔甲→armor[0-2]
      // / 48-50 时装→armor[10-12] / 51-53 钱币→slots[50-52]（铂金格留空）
      for (let i = 0; i < 40 && i < legacy.length; i++) inv.slots[i] = legacy[i] ? { ...legacy[i]! } : null;
      for (let k = 0; k < 5; k++) inv.armor[ACC_ARMOR_START + k] = legacy[LEGACY_ACCESSORY_START + k] ? { ...legacy[LEGACY_ACCESSORY_START + k]! } : null;
      for (let k = 0; k < 3; k++) inv.armor[k] = legacy[LEGACY_ARMOR_START + k] ? { ...legacy[LEGACY_ARMOR_START + k]! } : null;
      for (let k = 0; k < 3; k++) inv.armor[VANITY_ARMOR_START + k] = legacy[LEGACY_VANITY_START + k] ? { ...legacy[LEGACY_VANITY_START + k]! } : null;
      for (let k = 0; k < 3; k++) inv.slots[COIN_START + k] = legacy[LEGACY_COIN_START + k] ? { ...legacy[LEGACY_COIN_START + k]! } : null;
    } else {
      // 新布局直读
      for (let i = 0; i < INV_SIZE && i < legacy.length; i++) inv.slots[i] = legacy[i] ? { ...legacy[i]! } : null;
    }
    return { slots: inv.slots, armor: inv.armor };
  }
}

// ---- 过渡期兼容导出（供 Game/UI/Player 旧引用编译通过；语义映射到新结构） ----
/** @deprecated 用 armor[3-9] */
export const ACCESSORY_START = -1;
/** @deprecated 用 armor[0-2] */
export const ARMOR_START = -2;
/** @deprecated 用 armor[10-12] */
export const VANITY_START = -3;
