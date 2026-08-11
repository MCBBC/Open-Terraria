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
export const COIN_KEYS = ['coin_copper', 'coin_silver', 'coin_gold', 'coin_platinum'] as const;
/** 钱币面额（Item.cs:42-48：铜1/银100/金10000/铂1000000） */
export const COIN_VALUES = [1, 100, 10000, 1000000];

// ---- 旧布局常量（存档迁移与过渡期兼容，勿在新代码使用） ----
export const LEGACY_ACCESSORY_START = 40;
export const LEGACY_ARMOR_START = 45;
export const LEGACY_VANITY_START = 48;
export const LEGACY_COIN_START = 51;
export const LEGACY_INV_SIZE = 54;

export interface InvItem { id: number; stack: number; favorited?: boolean; /** 重铸词缀（Item.prefix，0/缺省=无） */ prefix?: number }

export function isCoinSlot(i: number): boolean {
  return i >= COIN_START && i < COIN_START + COIN_SLOTS;
}

export function isAmmoSlot(i: number): boolean {
  return i >= AMMO_START && i < AMMO_START + AMMO_SLOTS;
}

/** 金钱格只收对应币种（ItemSlot context1：type 0/71-74，ItemSlot.cs:1338-1343） */
export function coinSlotAccepts(i: number, id: number): boolean {
  if (!isCoinSlot(i)) return false;
  return id === ITEM_BY_KEY[COIN_KEYS[i - COIN_START]];
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
  /** 三套 Loadout（EquipmentLoadout = armor[20]+dye[10]，Swap :65-82 元素级互换） */
  loadouts: Array<{ armor: Array<InvItem | null>; dye: Array<InvItem | null> }>;
  /** 当前 Loadout 序号（0-2） */
  currentLoadout = 0;
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
    }));
  }

  /** 切换 Loadout（Player.TrySwitchingLoadout :5430-5434：先 Swap 当前套装备份仓、
   *  再 Swap 目标仓——玩家身上即换上目标套装，原套装入当前备份仓） */
  trySwitchingLoadout(idx: number): void {
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
    this.currentLoadout = idx;
  }

  heldItem(): InvItem | null {
    return this.slots[this.selected];
  }

  heldDef() {
    const it = this.heldItem();
    return it ? ITEM_DEFS[it.id] : null;
  }

  /** 已装备的配饰列表（armor[3-9]，原版 Player.cs:36326 循环范围） */
  equippedAccessories(): number[] {
    const out: number[] = [];
    for (let i = ACC_ARMOR_START; i < ACC_ARMOR_START + 7; i++) {
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

  /** armor[20] 下标能否接收物品（ItemSlot.PickItemMovementAction :1363-1494）：
   *  0-2/10-12 部位校验（head/body/leg slot）；3-9 功能配饰（vanity 排除）/13-19 配饰（含社交）；
   *  染料走 dye 数组。vi_ 批次物品的部位/配饰归属查 vanilla-itemstats.json（注册期无字段） */
  armorAccepts(i: number, id: number): boolean {
    if (i < 0 || i >= ARMOR_TOTAL) return false;
    const d = ITEM_DEFS[id];
    if (!d) return false;
    const part = i % VANITY_ARMOR_START; // 0-2=部位 3-9=配饰（与 10-19 镜像同判）
    if (part <= 2) {
      if (d.armor) return d.armor.slot === (part as ArmorSlot);
      return armorSlotIndexOfInternal(id) === part;
    }
    if (d.accessory) return i < VANITY_ARMOR_START; // legacy 配饰（社交槽放宽）
    if (i < VANITY_ARMOR_START) return statOfInternal(id)?.acc === 1; // 功能配饰槽：vanity 排除
    return statOfInternal(id)?.acc !== undefined; // 社交配饰槽：功能/社交都收
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
  add(id: number, count: number): number {
    const max = ITEM_DEFS[id].maxStack;
    // ① 钱币（合并→空格→DoCoins）
    const ci = coinIndexOf(id);
    if (ci >= 0) {
      count = this.fillRange(COIN_START, COIN_SLOTS, id, count, max);
      if (count > 0) count = this.doCoinsFromSlot(COIN_START, COIN_SLOTS, ci, id, count, max);
      return count;
    }
    // ② 弹药（FillAmmo :38591-38655：先合并 54-57 已有再空格）
    if (ammoSlotAccepts(id)) {
      count = this.fillRange(AMMO_START, AMMO_SLOTS, id, count, max);
    }
    // ③ 合并 0-49 已有堆
    count = this.fillRange(0, BAG_SIZE, id, count, max);
    // ④ 空槽降序（原版非 favorited 降序从背包尾填，:38711-38730）
    for (let i = BAG_SIZE - 1; i >= 0 && count > 0; i--) {
      if (!this.slots[i]) {
        const put = Math.min(max, count);
        this.slots[i] = { id, stack: put };
        count -= put;
      }
    }
    return count;
  }

  /** 范围内先合并后空格填充 */
  private fillRange(start: number, len: number, id: number, count: number, max: number): number {
    for (let i = start; i < start + len && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.stack < max) {
        const put = Math.min(max - s.stack, count);
        s.stack += put;
        count -= put;
      }
    }
    for (let i = start; i < start + len && count > 0; i++) {
      if (!this.slots[i]) {
        const put = Math.min(max, count);
        this.slots[i] = { id, stack: put };
        count -= put;
      }
    }
    return count;
  }

  /** DoCoins（Player.cs:38573-38589）：同币 stack==100 → 升一级面额并在 0-53 找同类未满堆 +1，递归 */
  private doCoinsFromSlot(start: number, len: number, ci: number, id: number, count: number, max: number): number {
    void start; void len; void ci; void max;
    // 100 铜→银（coin_copper→coin_silver）等：仅当该面额格已达 100
    for (let tier = 0; tier < 3; tier++) {
      const s = this.slots[COIN_START + tier];
      if (s && s.id === ITEM_BY_KEY[COIN_KEYS[tier]] && s.stack >= 100) {
        this.slots[COIN_START + tier] = null;
        // 升级币放入钱币格（递归走 add 保持链）
        const left = this.add(ITEM_BY_KEY[COIN_KEYS[tier + 1]], 1);
        if (left > 0) return count; // 放不下（理论不发生）
      }
    }
    return count;
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
