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
import { ITEM_DEFS, ITEM_BY_KEY, type ArmorSlot } from '../data/items';
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
  return !!ITEM_DEFS[id]?.armor || armorSlotIndexOfInternal(id) >= 0;
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
  /** 恶魔之心 3335(Player.cs:44575-44583)解锁第六配饰槽(armor[8];基座 5=3-7) */
  extraAccessory = false;
  /** 功能配饰槽上界(不含):基座 5,恶魔之心 6(UpdateEquipAccessories 语义)。
   *  ★偏差备案(2026-08-22 补 C 审计 3335 批):原版第 6 槽有世界难度门——
   *  UpdateAccessories :18139-18145 `extraAccessory && (Main.expertMode ||
   *  Main.gameMenu) → extraAccessorySlots=1,否则 0`(经典世界不生效,旗标仍存)。
   *  本仓不设门:玩家档与世界档同槽共存亡(quicksave 单键/WldImport 重置玩家
   *  WldImport.ts:616),extraAccessory=true 不可能跨难度世界携带,门结构不可达 */
  get accSlotMax(): number { return ACC_ARMOR_START + 5 + (this.extraAccessory ? 1 : 0); }
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

  heldItem(): InvItem | null {
    return this.slots[this.selected];
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
   *  未建模,只做槽型门 armorAccepts（登记）;sharedFromLoadout 幽灵绘制登记未接 */
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
      const ok = d.armor ? d.armor.slot === (part as ArmorSlot) : armorSlotIndexOfInternal(id) === part;
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
   *  ⑤ 钱币满 100 自动合大（DoCoins :38573-38589） */
  /** noCoinMerge（R14-B4）：钱币入包跳过 doCoins 自动升面额（GetItemSettings.cs:25
   *  ReturnItemShowAsNewNoCoinMerge——合成 1 银→100 铜不被瞬时合回） */
  addNoCoinMerge(id: number, count: number): number {
    return this.add(id, count, undefined, undefined, true);
  }

  add(id: number, count: number, prefix?: number, placeStyle?: number, noCoinMerge = false): number { // prefix/placeStyle 随新放置槽写入（合并已有堆保留现有）
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
        count = this.fillRange(0, BAG_SIZE, id, count, max, placeStyle);
        for (let i = BAG_SIZE - 1; i >= 0 && count > 0; i--) {
          if (!this.slots[i]) {
            const put = Math.min(max, count);
            this.slots[i] = { id, stack: put, ...(prefix ? { prefix } : {}), ...(placeStyle !== undefined ? { placeStyle } : {}) };
            count -= put;
          }
        }
      }
      return count;
    }
    // ② 弹药（FillAmmo :38591-38655 两趟 1:1）：第一趟合并 54-57 已有堆（全部
    //    FitsAmmoSlot 物——凝胶并入弹药栏已有凝胶堆是原版行为）；第二趟填空格
    //    仅 CanFillEmptyAmmoSlot 物（凝胶/沙/坠星等特殊弹药不自动入栏）
    if (ammoSlotAccepts(id)) {
      // 第一趟只合并（FillAmmo :38594-38630——全部弹药并已有堆,凝胶亦然）
      count = this.fillRange(AMMO_START, AMMO_SLOTS, id, count, max, placeStyle, true);
      // 第二趟空格仅 CanFillEmptyAmmoSlot（:38632-38651）
      if (count > 0 && canFillEmptyAmmoSlot(id)) {
        for (let i = AMMO_START; i < AMMO_START + AMMO_SLOTS && count > 0; i++) {
          if (!this.slots[i]) {
            const put = Math.min(max, count);
            this.slots[i] = { id, stack: put, ...(prefix ? { prefix } : {}), ...(placeStyle !== undefined ? { placeStyle } : {}) };
            count -= put;
          }
        }
      }
    }
    // ③ 合并 0-49 已有堆
    count = this.fillRange(0, BAG_SIZE, id, count, max, placeStyle);
    // ④ 空槽降序（原版非 favorited 降序从背包尾填，:38711-38730）
    for (let i = BAG_SIZE - 1; i >= 0 && count > 0; i--) {
      if (!this.slots[i]) {
        const put = Math.min(max, count);
        this.slots[i] = { id, stack: put, ...(prefix ? { prefix } : {}), ...(placeStyle !== undefined ? { placeStyle } : {}) };
        count -= put;
      }
    }
    return count;
  }

  /** 范围内先合并后空格填充 */
  private fillRange(start: number, len: number, id: number, count: number, max: number,
    placeStyle?: number, mergeOnly = false): number {
    for (let i = start; i < start + len && count > 0; i++) {
      const s = this.slots[i];
      // placeStyle 匹配门(2026-08-13):不同敌旗(bannerId)不并入已有堆——
      // 原版每旗独立 item id 天然隔离,本仓单物品+实例 style 需此门防混堆
      if (s && s.id === id && s.stack < max
        && (placeStyle === undefined || s.placeStyle === undefined || s.placeStyle === placeStyle)) {
        const put = Math.min(max - s.stack, count);
        s.stack += put;
        count -= put;
      }
    }
    if (!mergeOnly) {
      for (let i = start; i < start + len && count > 0; i++) {
        if (!this.slots[i]) {
          const put = Math.min(max, count);
          this.slots[i] = { id, stack: put };
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
