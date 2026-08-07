// 物品栏：0-39 背包（首行 0-9 快捷栏）+ 40-44 配饰 + 45-47 盔甲 + 48-50 时装 + 51-53 金钱（铜/银/金）
import { ITEM_DEFS, ITEM_BY_KEY, type ArmorSlot } from '../data/items';

export const INV_COLS = 10;
export const INV_ROWS = 4;
export const ACCESSORY_SLOTS = 5;
export const ARMOR_SLOTS = 3;   // 头盔/胸甲/胫甲
export const VANITY_SLOTS = 3;  // 同部位时装
export const COIN_SLOTS = 3;    // 铜币/银币/金币
export const ACCESSORY_START = INV_COLS * INV_ROWS; // 40
export const ARMOR_START = ACCESSORY_START + ACCESSORY_SLOTS; // 45
export const VANITY_START = ARMOR_START + ARMOR_SLOTS; // 48
export const COIN_START = VANITY_START + VANITY_SLOTS; // 51
export const INV_SIZE = COIN_START + COIN_SLOTS; // 54
export const COIN_KEYS = ['coin_copper', 'coin_silver', 'coin_gold'] as const;

export function isCoinSlot(i: number): boolean {
  return i >= COIN_START && i < INV_SIZE;
}

/** 金钱格只收对应币种 */
export function coinSlotAccepts(i: number, id: number): boolean {
  if (!isCoinSlot(i)) return false;
  return id === ITEM_BY_KEY[COIN_KEYS[i - COIN_START]];
}

/** 是否任一币种 */
export function coinIndexOf(id: number): number {
  return COIN_KEYS.findIndex((k) => ITEM_BY_KEY[k] === id);
}

export function isAccessorySlot(i: number): boolean {
  return i >= ACCESSORY_START && i < ARMOR_START;
}

export function isAccessoryItem(id: number): boolean {
  return !!ITEM_DEFS[id]?.accessory;
}

/** 盔甲/时装格（45-50）。返回该格要求的部位，非盔甲格返回 null */
export function armorSlotReq(i: number): ArmorSlot | null {
  if (i >= ARMOR_START && i < VANITY_START) return (i - ARMOR_START) as ArmorSlot; // 0头1胸2腿
  if (i >= VANITY_START && i < INV_SIZE) return (i - VANITY_START) as ArmorSlot;
  return null;
}

export function isArmorItem(id: number): boolean {
  return !!ITEM_DEFS[id]?.armor;
}

export class Inventory {
  slots: Array<{ id: number; stack: number } | null>;
  selected = 0; // 快捷栏选中格

  constructor() {
    this.slots = Array(INV_SIZE).fill(null);
  }

  heldItem(): { id: number; stack: number } | null {
    return this.slots[this.selected];
  }

  heldDef() {
    const it = this.heldItem();
    return it ? ITEM_DEFS[it.id] : null;
  }

  /** 已装备的配饰列表（扫描配饰栏） */
  equippedAccessories(): number[] {
    const out: number[] = [];
    for (let i = ACCESSORY_START; i < ARMOR_START; i++) {
      const s = this.slots[i];
      if (s && ITEM_DEFS[s.id]?.accessory) out.push(s.id);
    }
    return out;
  }

  /** 已穿戴的盔甲 id（45-47，时装不计防御） */
  equippedArmor(): Array<number | null> {
    return [0, 1, 2].map((k) => this.slots[ARMOR_START + k]?.id ?? null);
  }

  /** 显示用部位贴图：时装格优先，为空回落装备格 */
  displayArmor(): Array<number | null> {
    return [0, 1, 2].map((k) => {
      const v = this.slots[VANITY_START + k];
      if (v) return v.id;
      return this.slots[ARMOR_START + k]?.id ?? null;
    });
  }

  /** 添加物品（不进配饰/盔甲/时装栏；币种自动进金钱格），返回未能放入的数量（0 = 全部放入） */
  add(id: number, count: number): number {
    const max = ITEM_DEFS[id].maxStack;
    // 币种优先入金钱格（合并→空格）
    const ci = coinIndexOf(id);
    if (ci >= 0) {
      const slot = COIN_START + ci;
      const s = this.slots[slot];
      if (s) {
        const put = Math.min(max - s.stack, count);
        s.stack += put;
        count -= put;
      } else {
        const put = Math.min(max, count);
        this.slots[slot] = { id, stack: put };
        count -= put;
      }
      return count;
    }
    for (let i = 0; i < ACCESSORY_START && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.stack < max) {
        const put = Math.min(max - s.stack, count);
        s.stack += put;
        count -= put;
      }
    }
    for (let i = 0; i < ACCESSORY_START && count > 0; i++) {
      if (!this.slots[i]) {
        const put = Math.min(max, count);
        this.slots[i] = { id, stack: put };
        count -= put;
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

  /** 某格能否接收物品（配饰位只收配饰；盔甲/时装位只收对应部位；金钱位只收对应币种） */
  canAccept(i: number, id: number): boolean {
    if (isAccessorySlot(i)) return isAccessoryItem(id);
    if (isCoinSlot(i)) return coinSlotAccepts(i, id);
    const req = armorSlotReq(i);
    if (req !== null) return ITEM_DEFS[id]?.armor?.slot === req;
    return true;
  }

  /** 交换/合并格子（UI 拖拽）。带装备位校验。 */
  swap(i: number, j: number) {
    const a = this.slots[i], b = this.slots[j];
    if (a && !this.canAccept(j, a.id)) return; // 拒绝
    if (b && !this.canAccept(i, b.id)) return; // 反向也要合法（交换）
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
}
