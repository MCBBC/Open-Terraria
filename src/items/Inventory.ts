// 物品栏：45 格（前 40 为背包 4×10，首行为快捷栏；40-44 为配饰栏，移植自 Maples 布局）
import { ITEM_DEFS } from '../data/items';

export const INV_COLS = 10;
export const INV_ROWS = 4;
export const ACCESSORY_SLOTS = 5;
export const INV_SIZE = INV_COLS * INV_ROWS + ACCESSORY_SLOTS; // 45
export const ACCESSORY_START = INV_COLS * INV_ROWS; // 40

export function isAccessorySlot(i: number): boolean {
  return i >= ACCESSORY_START && i < INV_SIZE;
}

export function isAccessoryItem(id: number): boolean {
  return !!ITEM_DEFS[id]?.accessory;
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
    for (let i = ACCESSORY_START; i < INV_SIZE; i++) {
      const s = this.slots[i];
      if (s && ITEM_DEFS[s.id]?.accessory) out.push(s.id);
    }
    return out;
  }

  /** 添加物品（不进配饰栏），返回未能放入的数量（0 = 全部放入） */
  add(id: number, count: number): number {
    const max = ITEM_DEFS[id].maxStack;
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

  /** 交换/合并格子（UI 拖拽）。带配饰栏校验：非配饰不能进配饰位。 */
  swap(i: number, j: number) {
    const a = this.slots[i], b = this.slots[j];
    const intoAccessory = isAccessorySlot(j) && a && !isAccessoryItem(a.id);
    if (intoAccessory) return; // 拒绝
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
