// 盔甲/配饰基础属性运行时（tools/extract-equip-prefix.mjs → vanilla-itemstats.json）。
// vi_ 批次物品注册期无 armor/accessory 字段——槽位归属与防御值以本表为权威：
//   s: 'h'|'b'|'l' 盔甲部位（headSlot/bodySlot/legSlot 赋值即归属，Item.cs SetDefaults）
//   def: 防御值（defense = N 字面量）
//   acc: 1 功能配饰 / 0 社交配饰（vanity=true；无功能效果）
import statsJson from './vanilla-itemstats.json';
import { ITEM_DEFS } from './items';

export interface VanillaItemStat {
  s?: 'h' | 'b' | 'l';
  def?: number;
  acc?: 0 | 1;
  van?: 1;         // Item.vanity=true（tools/patch-vanity-stats.mjs 从 Item.cs 提取 390 件;
                   // SwapEquip 社交槽路由依据 ArmorSwap :3289）
  life?: number;   // 生命回复（Item.lifeRegen，再生手环族）
  wing?: number;   // 翅膀槽（Item.wingSlot>0 即翅膀；飞行属性查 vanilla-wingstats）
  hs?: number; bs?: number; ls?: number; // 盔甲绘制槽序号（套装匹配键，Player.cs UpdateArmorSets）

  str?: number;    // 悠悠球线（Item.stringColor>0 → yoyoString，Player.cs:14170）

}

const STATS = statsJson as Record<string, VanillaItemStat>;

// 提取器缺口手补（生成数据勿手改 JSON，代码层并表——vanillaAccFx BEHAVIOR_FX 同法）：
// 3309-3314 彩色配重球（黑/蓝/绿/紫/红/黄）在 Item.cs SetDefaults 的 switch return
// 之后独立 if 块（:30233-30240）——与 2214-17 同类漏提段：width/height 24、rare 2、
// buyPrice 5 银、accessory = true（无 stringColor——非线饰品，Player 侧走
// UpdateEquips :14219-14222 counterWeight 直置 + ApplyEquipVanity :13800-13803 虚荣档）
for (let _v = 3309; _v <= 3314; _v++) STATS[String(_v)] ??= { acc: 1 };

/** 原版 item id → 盔甲/配饰属性 */
export function vanillaStatOfVid(vid: number): VanillaItemStat | null {
  return STATS[String(vid)] ?? null;
}

/** 内部 item id → 属性（ITEM_DEFS 缓存） */
const STAT_BY_IID = (() => {
  const m = new Map<number, VanillaItemStat>();
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    const vid = d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    if (vid < 0) continue;
    const s = STATS[String(vid)];
    if (s) m.set(i, s);
  }
  return m;
})();

export function statOfInternal(id: number): VanillaItemStat | null {
  return STAT_BY_IID.get(id) ?? null;
}

/** 盔甲部位槽序（0 头 / 1 身 / 2 腿；非盔甲 -1） */
export function armorSlotIndexOfInternal(id: number): number {
  const s = STAT_BY_IID.get(id)?.s;
  return s === 'h' ? 0 : s === 'b' ? 1 : s === 'l' ? 2 : -1;
}

/** 功能配饰判定（ItemSlot context 10：accessory && !vanity） */
export function isFunctionalAccessory(id: number): boolean {
  return STAT_BY_IID.get(id)?.acc === 1;
}

/** 任意配饰（含社交）判定 */
export function isAnyAccessory(id: number): boolean {
  const acc = STAT_BY_IID.get(id)?.acc;
  return acc !== undefined;
}
