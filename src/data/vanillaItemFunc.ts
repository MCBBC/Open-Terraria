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
  /** Item.cs useTurn=true（本表 1533 件有此键=1；全量 3504 件在 combat 表同名列——
   *  工具/食物/可放置族，Item.cs:170 缺省 false）。2026-08-17 提取器回填 */
  useTurn?: number;
}

import funcJson from './vanilla-itemfunc.json';

const FUNC = funcJson as Record<string, ItemFunc>;

/** 原版 item id → 功能画像 */
export function itemFuncOfVid(vid: number): ItemFunc | null {
  return FUNC[String(vid)] ?? null;
}

// 1457: 叶绿军刃 1227 重做（Terarria1457 Item.cs:15140-15158）useStyle 1→13（短剑直刺姿势）。
// 完整重做还含 shoot 228→1127（ChlorophyteSaberStab 新弹，未实装）——弹体替换随新弹批落，
// 本表先对齐 useStyle（heldUseStyle 持姿路由消费）；damage/shoot 等战斗字段以
// vanilla-itemcombat.json 为权威（本表同名字段非武器伤害取数口）。
FUNC['1227'] = { ...FUNC['1227'], useStyle: 13 };

/** 内部 item id（vi_ key）→ 功能画像 */
export function itemFuncOfInternal(id: number, key: string): ItemFunc | null {
  const m = /^vi_(\d+)_/.exec(key);
  return m ? FUNC[m[1]] ?? null : null;
}
