// 道具功能画像运行时（tools/extract-itemfunc.mjs 从 1456 Item.cs 提取）。
// 用途：vi_ 批次物品的功能桥接——工具（镐/斧/锤挖掘）、药水（治疗/魔力/Buff）。
export interface ItemFunc {
  melee?: number; ranged?: number; magic?: number; summon?: number;
  noMelee?: number; damage?: number; mana?: number;
  pick?: number; axe?: number; hammer?: number;
  createTile?: number; createWall?: number; placeStyle?: number;
  consumable?: number; potion?: number;
  healLife?: number; healMana?: number;
  buffType?: number; buffTime?: number;
  ammo?: number; useAmmo?: number; notAmmo?: number;
  shoot?: number; channel?: number; holdStyle?: number; torch?: number;
  useStyle?: number; knockBack?: number; autoReuse?: number;
  fishingPole?: number;  // 钓竿力度（9 支；抛竿入口判定）
  bait?: number;        // 鱼饵力度（29 种；消耗率 1/(1+bait/6)）
}

import funcJson from './vanilla-itemfunc.json';

const FUNC = funcJson as Record<string, ItemFunc>;

/** 原版 item id → 功能画像 */
export function itemFuncOfVid(vid: number): ItemFunc | null {
  return FUNC[String(vid)] ?? null;
}

/** 内部 item id（vi_ key）→ 功能画像 */
export function itemFuncOfInternal(id: number, key: string): ItemFunc | null {
  const m = /^vi_(\d+)_/.exec(key);
  return m ? FUNC[m[1]] ?? null : null;
}
