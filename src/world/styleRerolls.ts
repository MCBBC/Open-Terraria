// 世界样式重掷纯函数层（孤儿武器 B3 波：树球 4765 / 世界球 4766 / 月亮球 5285）。
// 原版三弹 Kill 三重掷（Projectile.cs:75111-75131，1458 行号）：
//   · 868 TreeTops.RandomizeTreeStyleBasedOnWorldPosition(rand, Center)
//     （Terraria.GameContent/TreeTopsInfo.cs RandomizeTreeStyleBasedOnWorldPosition
//      :69-99 + RandomizeTreeStyle :101-149）
//   · 869 WorldGen.RandomizeBackgroundBasedOnPlayer(rand, player)（WorldGen.cs:7742-7895）
//   · 996 WorldGen.RandomizeMoonState(rand, guaranteeNewStyle:true)（WorldGen.cs:7732-7739）
// 全部为「掷到新值为止」的 guarantee-new 语义（moonType 由参数保证；其余用 while !=
// 旧值循环——树 styles 用等价 do-while + flag 出口，背景用 while 同值再掷）。
//
// 本仓落点（Game.onProjectileDeath 持 renderer/world 权，消费端在 Game；本模块只出
// 纯计算与表）：树冠 = world.treeTops[area]（VanillaTiler.crownStyleFor/WindSway 实时
// 消费）；月样 = world.moonType（SkyRenderer.moonType 需 Game 手动回写同步）；背景 =
// BiomeBackground 私有变体位（经 setBiomeVariant 公共口写入并预热贴图）。

/** UnifiedRandom 最小形状（调用方传 Math.random 包装或探针桩） */
export interface Rng {
  next(max?: number): number;
}

/** Math.random 包装（Main.rand 非种子对齐场景——原版此处也是 Main.rand 运行时流） */
export const mathRng: Rng = {
  next(max?: number): number {
    return max === undefined ? Math.random() : Math.floor(Math.random() * max);
  },
};

// ---------------------------------------------------------------------------
// 月亮球 996 —— RandomizeMoonState(WorldGen.cs:7732-7739)
// ---------------------------------------------------------------------------

/** Main.moonType ∈ Next(9)，guaranteeNewStyle=true 时旧值必不重复（do-while）。
 *  ★原版语义：这是【月亮贴图样式】0-8（灰月/橙月/沙尘暴血月…8 表盘），不是
 *  moonPhase 相位 0-7（相位由日夜钟独立推进）——工单描述把两者混了，以源码为准。 */
export function rollMoonType(current: number, rng: Rng = mathRng): number {
  let mt = current;
  do {
    mt = rng.next(9);                                   // Main.moonType = random.Next(9)
  } while (mt === current);                             // guaranteeNewStyle: true 门
  return mt;
}

// ---------------------------------------------------------------------------
// 树球 868 —— TreeTopsInfo.RandomizeTreeStyleBasedOnWorldPosition
// ---------------------------------------------------------------------------

/** 弹心下一格草地/tile 判 areaId（TreeTopsInfo.cs:71-92 直移）。键 = 原版 TileID：
 *  70 蘑菇草→11 / 53 沙(oceanDepths 内海→10，否则沙漠→9) / 23 腐化草→4 /
 *  199 猩红草→8 / 109·492 神圣草→7 / 147 雪块→6 / 60 丛林草→5 / 633 地狱石→12 /
 *  2·477 普通草→按 Main.treeX[0..2] 四分段取 0..3。本仓 tile id 域不同，
 *  消费端（Game）须先经 VANILLA_TILE_ID 反查成 our id 再比对。 */
export const TREE_AREA_BY_GROUND_TILE: Record<number, number> = {
  70: 11, 53: -2 /* 沙分海/漠双档 */, 23: 4, 199: 8, 109: 7, 492: 7,
  147: 6, 60: 5, 633: 12,
};

/** forest 双档.tile 键（2/477 草），forest 分段走 treeX */
export const FOREST_GROUND_VANILLA_TILES = [2, 477];

/** oceanDepths(WorldGen.cs:10990-10998)：y ≤ oceanLevel 且 x < beachDistance 或
 *  x > maxTilesX−beachDistance = 深海滩。beachDistance=Main.beachDistance（世界宽
 *  相关小世界 380？——WorldGen.beachDistance 在生成器里赋值，本仓近似 maxTilesX/20
 *  与海洋生成段同量级；仅影响「沙滩上树下 reroll 归海组」一档，登记近似）
 *  oceanLevel = surface 液面 ≈ world.groundLevel（Y 帧线）。 */
export function oceanDepths(x: number, y: number, maxTilesX: number, oceanLevel: number): boolean {
  if (y > oceanLevel) return false;
  const beach = Math.max(80, Math.round(maxTilesX / 20)); // beachDistance 近似（登记）
  return x < beach || x > maxTilesX - beach;
}

/** 各 areaId 变体数（TreeTopsInfo.RandomizeTreeStyle switch :109-138）：
 *  0-3 森林 Next(6) / 4 腐化 Next(5) / 5 丛林 Next(6) / 6 雪 NextFromList(14 元素)
 *  / 7 神圣 Next(5) / 8 猩红 Next(6) / 9 沙漠 Next(5) / 10 海洋 Next(6) /
 *  11 蘑菇 Next(4) / 12 地狱 Next(6)。雪组是显式清单非连续 Next。 */
export function treeTopVariationPool(areaId: number): number[] | { kind: 'next'; n: number } | null {
  switch (areaId) {
    case 0: case 1: case 2: case 3: return { kind: 'next', n: 6 };
    case 4: return { kind: 'next', n: 5 };
    case 5: return { kind: 'next', n: 6 };
    case 6: return [0, 1, 2, 21, 22, 3, 31, 32, 4, 41, 42, 5, 6, 7]; // :121
    case 7: return { kind: 'next', n: 5 };
    case 8: return { kind: 'next', n: 6 };
    case 9: return { kind: 'next', n: 5 };
    case 10: return { kind: 'next', n: 6 };
    case 11: return { kind: 'next', n: 4 };
    case 12: return { kind: 'next', n: 6 };
    default: return null;                               // :139-142 flag 出口
  }
}

/** 惰性补全 13 位 treeTops（首次改动前现状即渲染真态：森林四段=header treeStyle、
 *  其余=0 ≡ 本仓 areaStyle 兜底 treeStyle[≥4] undefined ?? 0 的现观感；懒补只在
 *  目标 area 被掷时发生，非目标位保持兜底观感不变——避免顺手改掉雪丛丛林冠）。 */
export function ensureTreeTops13(treeTops: number[], headerTreeStyle: number[]): number[] {
  if (treeTops.length >= 13) return treeTops;
  const out = [
    headerTreeStyle[0] ?? 0, headerTreeStyle[1] ?? 0, headerTreeStyle[2] ?? 0, headerTreeStyle[3] ?? 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
  ];
  for (let i = 0; i < 13 && i < treeTops.length; i++) out[i] = treeTops[i];
  return out;
}

/** 重掷树上区变体（RandomizeTreeStyle :101-149 等价 do-while；返回新值或 null=
 *  areaId 无池（default flag 分支））。写侧由消费端把新值放回 world.treeTops[area]。 */
export function rollTreeTopVariation(areaId: number, oldVal: number, rng: Rng = mathRng): number | null {
  const pool = treeTopVariationPool(areaId);
  if (!pool) return null;
  let v = oldVal;
  if ('kind' in pool) {
    do {
      v = rng.next(pool.n);                             // rand.Next(N)
    } while (v === oldVal);                             // while(_variations[area]==num) 循环
  } else {
    do {
      v = pool[(rng.next() * pool.length) | 0];         // rand.NextFromList(...)
    } while (v === oldVal);
  }
  return v;
}

// ---------------------------------------------------------------------------
// 世界球 869 —— WorldGen.RandomizeBackgroundBasedOnPlayer(WorldGen.cs:7742-7895)
// ---------------------------------------------------------------------------

/** setBG(bg, style) 的 bg 槽位号（消费端映射 BiomeBackground 变体位） */
export type BgAreaKind =
  | 'mushroom'      // setBG(8, Next(5))       :7749-7753
  | 'underworld'    // setBG(9, Next(3))       :7754-7758
  | 'desert'        // setBG(6, Desert())      :7759-7766
  | 'hallow'        // setBG(4, Next(6))       :7767-7771
  | 'corrupt'       // setBG(1, Corruption())  :7772-7779
  | 'crimson'       // setBG(5, Next(7))       :7780-7784
  | 'jungle'        // setBG(2, Next(7))       :7785-7790
  | 'snow'          // setBG(3, SnowRoll)      :7791-7847
  | 'ocean'         // setBG(7, Next(8))       :7849-7853
  | 'forest';       // setBG(0/10/11/12, ForestRoll) :7855-7892

/** RandomizeBackgrounds_Corruption(:7962-7970)：Next(6)，掷 5 → 二选一 51/52 */
export function rollCorruptBg(oldVal: number, rng: Rng = mathRng): number {
  let v = oldVal;
  do {
    v = rng.next(6);
    if (v === 5) v = rng.next(2) === 0 ? 51 : 52;       // :7965-7967
  } while (v === oldVal);
  return v;
}

/** RandomizeBackgrounds_Desert(:7972-7981)：Next(6)，掷 5 → 51+Next(5)/2 ∈{51,52,53} */
export function rollDesertBg(oldVal: number, rng: Rng = mathRng): number {
  let v = oldVal;
  do {
    v = rng.next(6);
    if (v === 5) v = 51 + Math.floor(rng.next(5) / 2);  // num2 = 51 + num2/2
  } while (v === oldVal);
  return v;
}

/** 雪组直掷（:7791-7847）：while(snowBG==旧){ snowBG=Next(9)；2 档再折 21/22、
 *  31/32、41/42 子变体（各各 Next(2)==0 才折）} */
export function rollSnowBg(oldVal: number, rng: Rng = mathRng): number {
  let v = oldVal;
  do {
    v = rng.next(9);
    if (v === 2 && rng.next(2) === 0) v = rng.next(2) === 0 ? 21 : 22;   // :7796-7804
    if (v === 3 && rng.next(2) === 0) v = rng.next(2) === 0 ? 31 : 32;
    if (v === 4 && rng.next(2) === 0) v = rng.next(2) === 0 ? 41 : 42;
  } while (v === oldVal);
  return v;
}

/** RollRandomForestBGStyle(:7983-8008)：Next(14)+五折（1/2 半率再掷、0 必再掷、
 *  3→31@1/3、5→51@1/2、7→71..73@1/4）——while IsBackgroundConsideredTheSame 循环在上层 */
export function rollForestBg(rng: Rng = mathRng): number {
  const MAX = 14;
  let v = rng.next(MAX);
  if ((v === 1 || v === 2) && rng.next(2) === 0) v = rng.next(MAX);
  if (v === 0) v = rng.next(MAX);
  if (v === 3 && rng.next(3) === 0) v = 31;
  if (v === 5 && rng.next(2) === 0) v = 51;
  if (v === 7 && rng.next(4) === 0) v = 71 + rng.next(3);  // Next(71,74)=71..73
  return v;
}

/** IsBackgroundConsideredTheSame(:8010-… ) 本仓路径涉及的等值族：3↔31、5↔51、
 *  7↔71/72/73（余者 24/25 等 setBG case 内部档，未进世界球链）。old/new 属同族 =
 *  视觉同款需重掷。 */
export function isSameBackground(oldBg: number, newBg: number): boolean {
  if (oldBg === 3 || oldBg === 31) return newBg === 3 || newBg === 31;
  if (oldBg === 5 || oldBg === 51) return newBg === 5 || newBg === 51;
  if (oldBg === 7 || oldBg >= 71) return newBg === 7 || (newBg >= 71 && newBg <= 73);
  return oldBg === newBg;
}

/** do-while 同族门（森林/腐化 51/52 族、沙漠 51-53 族用「≈ new 视觉族」判断，
 *  vanilla 森林支只拿 IsBackgroundConsideredTheSame 门；腐化/沙漠分支同样套 while(num==old)
 *  ——严格同值门，这里保持逐字面：非森林 while 是严格 != 旧值，森林是同族门）。 */
export function rollUntilDifferent(
  kind: Exclude<BgAreaKind, 'forest'>, oldVal: number, rng: Rng = mathRng,
): number {
  switch (kind) {
    case 'mushroom': case 'hallow': case 'crimson': case 'jungle': case 'ocean': {
      // Next(5)/Next(6)/Next(7)/Next(7)/Next(8) 纯档
      const counts = { mushroom: 5, hallow: 6, crimson: 7, jungle: 7, ocean: 8 } as Record<string, number>;
      const n = counts[kind];
      let v = oldVal;
      do { v = rng.next(n); } while (v === oldVal);     // while(_bg==num) 直读字段循环
      return v;
    }
    case 'underworld': {
      let v = oldVal;
      do { v = rng.next(3); } while (v === oldVal);     // setBG(9, Next(3))
      return v;
    }
    case 'desert':
      return rollDesertBg(oldVal, rng);
    case 'corrupt':
      return rollCorruptBg(oldVal, rng);
    case 'snow':
      return rollSnowBg(oldVal, rng);
  }
}

// ---------------------------------------------------------------------------
// 世界球 B3-5 —— 可行域重掷（游戏路径实际消费式）
// ---------------------------------------------------------------------------
// 本仓重掷池 = 【渲染可达行空间】（BiomeBackground.biomeVariantRows 提供表长展开),
// 不再按 vanilla 样式号全域掷完 %表长落行（B3-5 审计:全域%表长会把「while 必异」
// 折回原档视觉——雪 42%6→0、森林 9%7→2 等）。终清波扩表后各群系表已与 setBG 可行
// 值域一一对应，该机制语义不变仍生效：
//   · 掷即渲染可达——每个候选都落在真实表行上,不靠取模折叠；
//   · 「必异」在可行域内成立——剔当前档 + 同视觉族（森林族门走 BiomeBackground.
//     sameVisual()，= IsBackgroundConsideredTheSame :8010 的行空间翻译）；
//   · 可行域剔空返回 null = 原版 while(同值) 无从满足时上层早退的等价语义。
// 全覆盖槽的边际分布 ≡ 原版 while 同值门循环的 uniform-over-others。
//
// （历史注：isSameForestRow 曾专治 FOREST_STYLES[0]/[1] 同画复制行的旧子集表，
//  扩表后全表无复制行，族判定收编进 sameVisual()，本函数已删。）

/** 可行域重掷：pool = 渲染可达档位全集（BiomeBackground 行号空间），剔 current 与
 *  sameVisual 家族成员后均匀掷一值；候选空（单值域/全族同画）返回 null=早退。 */
export function rollVariantInDomain(
  pool: readonly number[], current: number,
  sameVisual?: (a: number, b: number) => boolean,
  rng: Rng = mathRng,
): number | null {
  const cand = pool.filter((v) => v !== current && !(sameVisual && sameVisual(current, v)));
  if (!cand.length) return null;
  return cand[rng.next(cand.length)];
}

// ---------------------------------------------------------------------------
// 群系槽选择 —— RandomizeBackgroundBasedOnPlayer 优先级链(:7744-7855+)
// ---------------------------------------------------------------------------

/** SceneFlags 最小形状（world/SceneMetrics SceneFlags 结构子集，测试桩友好） */
export interface ZoneFlagsLike {
  zoneGlowshroom: boolean;
  zoneUnderworldHeight: boolean;
  zoneDesert: boolean;
  zoneHallow: boolean;
  zoneCorrupt: boolean;
  zoneCrimson: boolean;
  zoneJungle: boolean;
  zoneSnow: boolean;
  zoneBeach: boolean;
}

/** 槽判定结果：非 forest 返回 kind（含雪/礁特档）；forest 返回 0..3 分段号
 *  （setBG 0/10/11/12 对应 treeX[0..2] 左右四段）。 */
export function pickZoneArea(
  z: ZoneFlagsLike, tileX: number, treeX: number[],
): { kind: Exclude<BgAreaKind, 'forest'> } | { kind: 'forest'; seg: 0 | 1 | 2 | 3 } {
  if (z.zoneGlowshroom) return { kind: 'mushroom' };        // :7746-7753
  if (z.zoneUnderworldHeight) return { kind: 'underworld' };// :7754-7758
  if (z.zoneDesert) return { kind: 'desert' };              // :7759-7766
  if (z.zoneHallow) return { kind: 'hallow' };              // :7767-7771
  if (z.zoneCorrupt) return { kind: 'corrupt' };            // :7772-7779
  if (z.zoneCrimson) return { kind: 'crimson' };            // :7780-7784
  if (z.zoneJungle) return { kind: 'jungle' };              // :7785-7790
  if (z.zoneSnow) return { kind: 'snow' };                  // :7791-7847
  if (z.zoneBeach) return { kind: 'ocean' };                // :7849-7853
  // 森林 default 分支（:7855-7892）：Center.X/16 与 Main.treeX[0..2] 四分段
  const seg = tileX < treeX[0] ? 0 : tileX < treeX[1] ? 1 : tileX < treeX[2] ? 2 : 3;
  return { kind: 'forest', seg };
}
