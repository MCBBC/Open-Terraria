// 道具功能画像运行时（tools/extract-itemfunc.mjs 从 Item.cs 提取;提取器结构绑定 SetDefaults1-5=1456 布局,存量字段两版同值,1457 新物品段走手补）。
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
  useTime?: number;     // 数据表当前未提取（Game.ts:12113 用 ?? 15 兜底）；提取器补键后即生效
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

// 悠悠球族 useStyle 5 提取缺口（Item.cs case 3262 起共享 case 块 `useStyle = 5;
// noUseGraphic = true; noMelee = true`——跨 id 大块提取器漏列；3292/3389/5294 三件
// 已在表）。useSwing 持姿路由（heldUseStyle）与 useStyleBodyRow 身体行（:35986-36011
// 瞄准向行 2/3/4 分档）消费；缺省回退 1 会把悠悠球挥舞画成三段挥砍姿势。
for (const yoyoVid of [3262, 3278, 3279, 3280, 3281, 3282, 3283, 3284, 3285, 3286,
  3287, 3288, 3289, 3290, 3291, 3315, 3316, 3317]) {
  if (!FUNC[String(yoyoVid)]) FUNC[String(yoyoVid)] = {};
  FUNC[String(yoyoVid)].useStyle = 5;
}

// R32（2026-08-25）：血肉抛竿 2421 提取缺口——Item.cs:23071-23100 `type >= 2421 &&
// type <= 2422` 共享 SetDefaults 块（useStyle 1 / useAnimation 8 / useTime 8 /
// shoot = 381 + type - 2421），提取器只落了 2422。2421 数值支：fishingPole=22 /
// shootSpeed 13.5 / rare 1（物品本体暂未入库 items.ts，功能画像先补全=钓竿族判定/
// 浮漂弹配对/静持门在册即生效）。
FUNC['2421'] = { useStyle: 1, shoot: 381, fishingPole: 22 };

// R32（2026-08-25）：竿族 shoot 键补全——Item.cs:23001 `shoot = 361 + type - 2291`
// （2291-2296 共享块）/:23074（2421-2422 块）。提取器只落了 2289/4325/4442 三支的
// shoot，其余五支缺键（消费端存活门已改读 bobberProjIdFor 移植表，此处补全供
// 其他 shoot 消费方对齐 SetDefaults 终值）。
FUNC['2291'] = { ...FUNC['2291'], shoot: 361 };
FUNC['2292'] = { ...FUNC['2292'], shoot: 362 };
FUNC['2293'] = { ...FUNC['2293'], shoot: 363 };
FUNC['2294'] = { ...FUNC['2294'], shoot: 364 };
FUNC['2295'] = { ...FUNC['2295'], shoot: 365 };
FUNC['2296'] = { ...FUNC['2296'], shoot: 366 };
FUNC['2422'] = { ...FUNC['2422'], shoot: 382 };

/** 内部 item id（vi_ key）→ 功能画像 */
export function itemFuncOfInternal(id: number, key: string): ItemFunc | null {
  const m = /^vi_(\d+)_/.exec(key);
  return m ? FUNC[m[1]] ?? null : null;
}
