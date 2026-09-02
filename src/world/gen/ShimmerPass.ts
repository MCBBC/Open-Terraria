// 原版 pass "Shimmer"(WorldGen.cs:15256-15308)+ ShimmerMakeBiome(cs:34889-35083)
// 1:1 移植:以太生物群系——圆形石壳(型 1)+ 腔体挖空 + 底部微光液 +
// 两侧隧道开口 + (num==0 时)地表石笋柱 + aether 宝石树。
// ★checkpoint 金标对账:tools/golden/caves-oracle.cs Shimmer 段(1456 注册序
//   Gems(15109)<GravitatingSand(15198)<OceanCaves(15228)<Shimmer(15256))+
//   tests/shimmer-checkpoint.test.ts——全链与"状态恢复"双通道,四段落检查点
//   (shimmershell/shimmerpillars/shimmeropen/shimmer)+RNG 流指纹+落点坐标逐项全等。
// 位置(cs:15274-15275):地牢异侧 dungeonSide<Right → Next(0.89w, w-200),
// 否则 Next(200, 0.11w);y∈[(ws+rl)/2+50, ((h-250)*2+rl)/3](失败重掷见下)。
// 失败重试(cs:15283-15300):前 1e4 次不变 x 带;>20000 次放宽到 0.8/0.2 带,
// y 下限改为 ws+120;成功后 GenVars.shimmerPosition → gs.shimmerX/Y。
// aether 树(cs:35057-35083):500 次 X±70 / Y±2 采样,两侧整砖即种
// TryGrowingTreeByType(583-589 宝石树)——实现见 TreePass.growGemTree(GrowTreeWithSettings
// 1:1,含 GemTreeGroundTest 石/苔 + WallTest 洞穴墙)。砍伐掉落与树苗再生长均已接:
// Game.fellImportedTree(KillTile_GetItemDrops :65754-65802 + SetGemTreeDrops,1/10 宝石
// /9/10 石块,干基 50% gemcorn 4851-4857)与 Game.growSaplings(590 树苗地下 1/5,
// :72924-72960)。(2026-08-12 头注曾过时声称未接,已核正)
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { addProtectedStructure } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';
import { genSolidType } from './GenSolid';
import { solidTile, registerTileFrame165 } from './HalfBrickPass';
import { growGemTree } from './TreePass';

// TileFrame case165（cs:85996）注册：killTile 尾 SquareTileFrame 级联的钟乳石失锚
// 链杀（TTTTTT 批 2026-08-23,CONST LavaLayerCaverer 带 38 格定罪）。注册制防
// HalfBrickPass⇄ShimmerPass 循环依赖;生成期模块体先于全部 pass 执行,时序安全。
registerTileFrame165(checkStalactite);

/** Main.tileMoss（TileID.cs）：苔藓族 sheet 集（石族钟乳石帧判定用） */
const MOSS_SHEETS = new Set<number>(Array.from(idsByVanillaSheet(182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627)).map((id) => TILE_DEFS[id]?.vanilla?.sheet ?? -1));

const STONE = TILE_BY_KEY['stone']!;         // 原版 type 1
const STALACTITE = TILE_BY_KEY['v_165_cave_decos']!; // 原版 type 165(PlaceTight)
const CRIMSTONE = TILE_BY_KEY['v_203_crimstone_block']!;
const EBONSTONE = TILE_BY_KEY['v_25_ebonstone_block']!;
const LIQ_SHIMMER = 4; // 原版 liquidType 3(shimmer)→ 本仓库 +1 编码
/** aether 宝石树 tile 表（cs:35063-35079 num24=0..6 → treeTileType） */
const GEM_TREES = [
  TILE_BY_KEY['v_583_topaz_tree']!,
  TILE_BY_KEY['v_584_amethyst_tree']!,
  TILE_BY_KEY['v_585_sapphire_tree']!,
  TILE_BY_KEY['v_586_emerald_tree']!,
  TILE_BY_KEY['v_587_ruby_tree']!,
  TILE_BY_KEY['v_588_diamond_tree']!,
  TILE_BY_KEY['v_589_amber_tree']!,
];

/**
 * 段落检查点回调（tests/shimmer-checkpoint.test.ts 消费；C# oracle 的
 * Checkpoint("shimmershell"/…) 同名落点）。失败重掷的 ShimmerMakeBiome 调用在
 * 越界/邪化石门即 return false——先于一切写格段，故回调只在成功尝试内触发，
 * 与 oracle 单次成功尝试内的检查点一一对应。
 */
export type ShimmerStageCallback = (name: 'shimmershell' | 'shimmerpillars' | 'shimmeropen' | 'shimmer') => void;

export function runShimmerPass(st: TileStore, rng: RNG, gs: GenState, onStage?: ShimmerStageCallback): void {
  const w = st.w, h = st.h;
  const ws = Math.floor(gs.worldSurface), rl = Math.floor(gs.rockLevel);
  // cs:15259-15268:深度带
  const yLoBase = Math.trunc((ws + rl) / 2) + 50;
  let yHi = Math.trunc(((h - 250) * 2 + rl) / 3);
  if (yHi > h - 330 - 100 - 30) yHi = h - 330 - 100 - 30;
  if (yHi <= yLoBase) yHi = yLoBase + 50;
  const pickX = (wide: boolean): number =>
    gs.dungeonSide < 1
      ? rng.int(Math.trunc(w * (wide ? 0.8 : 0.89)), w - 201)
      : rng.int(200, Math.trunc(w * (wide ? 0.2 : 0.11)) - 1);
  // ★SSS-CELEB（1458 cs:15294-15310）：tenth 世界微光强制浅带——num6=(int)ws+150、
  //   num7=((int)(rl+ws+200))/2（下限钳制 num6+50）；首掷 num4 改 Next(num6,num7)
  //   （x 带不变，标准带先掷后仅覆写 y），重试环 num8<10000 时同带重掷 y+x，
  //   ≥10000 落回普通 else 支（y 下限 (ws+rl)/2+20）、>20000 才进放宽支。
  // ★IIIII173（2026-09-02）：tenth 浅带门=纯 tenthAnniversary（1457/1458 cs:15293 无 !remix
  //   排除；镜像副本同步修——本文件为 gen/vanilla/ShimmerPass.ts 的旧镜像,以彼为准）
  const celbShim = !!gs.seedFlags?.tenthAnniversary;
  const shimYLo = Math.floor(gs.worldSurface) + 150;
  const shimYHiRaw = Math.trunc((gs.rockLevel + gs.worldSurface + 200) / 2);
  const celbYHi = Math.max(shimYHiRaw, shimYLo + 50);   // cs:15290 if(num7<=num6) num7=num6+50
  // ★cs:15273-15274 首掷是 Y 先 X 后(与重试环内的顺序一致;重试环 cs:15291-15292 同为 Y 先)
  let y = rng.int(yLoBase, yHi - 1);
  let x = pickX(false);
  if (celbShim) y = rng.int(shimYLo, celbYHi - 1);
  let tries = 0;
  while (!shimmerMakeBiome(st, rng, gs, x, y, onStage)) {
    tries++;
    if (celbShim && tries < 10000) {
      // cs:15300-15303:tenth 浅带重掷——Y 先 X 后,x 用标准窄带
      y = rng.int(shimYLo, celbYHi - 1);
      x = pickX(false);
    } else if (tries > 20000) {
      // cs:15292-15295:放宽 x 带(0.8w/w-200 或 200/0.2w),y 下限 ws+100+20
      y = rng.int(ws + 100 + 20, yHi - 1);
      x = pickX(true);
    } else {
      // cs:15297-15300:y 下限 (ws+rl)/2+20,x 带不变
      y = rng.int(Math.trunc((ws + rl) / 2) + 20, yHi - 1);
      x = pickX(false);
    }
  }
  gs.shimmerX = x;
  gs.shimmerY = y;
  // ★cs:15307 structures.AddProtectedStructure(Rectangle(num5-100, num4-100, 200, 200))
  //   （pad 默认 0）：微光以太 200×200 登记为保护区——蜂巢主巢/蜂蜜斑/神龛/地下小屋
  //   等后续结构的 CanPlace 与之互斥（num5=X/num4=Y,矩形中心即落点）。
  addProtectedStructure(gs, { x0: x - 100, y0: y - 100, x1: x + 100, y1: y + 100 }, 0);
}

/** cs:34889-35056 ShimmerMakeBiome 主体 */
function shimmerMakeBiome(st: TileStore, rng: RNG, gs: GenState, X: number, Y: number, onStage?: ShimmerStageCallback): boolean {
  void gs;
  const variant = rng.int(0, 1); // genRand.Next(2)
  let n2 = 0.6, n3 = 1.3, n4 = 0.3;
  if (variant === 0) { n2 = 0.55; n3 = 2.0; }
  n2 *= 1.05 - rng.next() * 0.1;
  n3 *= 1.05 - rng.next() * 0.1;
  n4 *= 1.0 - rng.next() * 0.1;
  const n5 = rng.int(105, 124); // Next(105,125)
  const n6 = Math.trunc(n5 * n4);
  const n7 = Math.trunc(n5 * n2);
  const n8 = rng.int(9, 12);    // Next(9,13)
  let x0 = X - n5, x1 = X + n5, y0 = Y - n5, y1 = Y + n5;
  // cs:34912-34924:越界(50 边距)或含猩红/腐化石 → false
  for (let k = y0; k <= y1; k++) {
    for (let l = x0; l <= x1; l++) {
      if (!st.inBounds(l, k) || l < 50 || k < 50 || l >= st.w - 50 || k >= st.h - 50) return false;
      const t = st.type[st.idx(l, k)];
      if (t === CRIMSTONE || t === EBONSTONE) return false;
    }
  }
  let n13 = Y, n14 = Y - n8;
  // cs:34925-34934:主体塑形前的 num13/num14 预掷(各 1×Next(4),命中再补 1×Next(2);
  // ★num14 预掷是减号 Y-n8-Next(2),环内是加号 Y-n8+Next(2))
  if (rng.int(0, 3) === 0) n13 = Y - rng.int(0, 1);
  if (rng.int(0, 3) === 0) n14 = Y - n8 - rng.int(0, 1);
  // cs:34935-35050:主体塑形
  for (let k = y0; k <= y1; k++) {
    for (let l = x0; l <= x1; l++) {
      const i = st.idx(l, k);
      st.liquid[i] = 0;
      if (rng.int(0, 3) === 0) n13 = Y - rng.int(0, 1);
      if (rng.int(0, 3) === 0) n14 = Y - n8 + rng.int(0, 1);
      // num15:上半纵压 1.4 / 下半 1.2(各 ±2% 抖动)
      let n15 = Math.trunc(Math.sqrt(
        (Math.abs(l - X) * (1 + rng.next() * 0.02)) ** 2 +
        (Math.abs(k - Y) * (k <= Y ? 1.4 : 1.2) * (1 + rng.next() * 0.02)) ** 2,
      ));
      if (n15 < n5) {
        st.slope[i] = 0; st.half[i] = 0;
        st.type[i] = STONE;
        if (l > x0 + 5 + rng.int(0, 1) && l < x1 - 5 - rng.int(0, 1)) st.flags[i] = 1;
        if (n15 < n5 * 0.9) st.wall[i] = 0;
      }
      n15 = Math.trunc(Math.sqrt(
        (Math.abs(l - X) * (1 + rng.next() * 0.02)) ** 2 +
        (Math.abs(k - Y) * n3 * (1 + rng.next() * 0.02)) ** 2,
      ));
      if (k > n14 && k < n13) st.flags[i] = 0;
      if (k < n13 && n15 < Math.trunc(n7 * (1 + rng.next() * 0.02))) st.flags[i] = 0;
      n15 = Math.trunc(Math.sqrt(
        (Math.abs(l - X) * (1 + rng.next() * 0.02)) ** 2 +
        (Math.abs(k - Y) * 2 * (1 + rng.next() * 0.02)) ** 2,
      ));
      if (k < Y - 1 || n15 >= Math.trunc(n6 * (1 + rng.next() * 0.025))) continue;
      if (k <= Y + 2 || n15 !== n6 - 1 || rng.int(0, 1) !== 0) st.flags[i] = 0;
      if (k >= Y) {
        st.liquid[i] = k === Y ? 127 : 255;
        st.liquidType[i] = LIQ_SHIMMER;
      }
    }
  }
  // 检查点：主体塑形环完（cs:34996 环出口 = oracle Checkpoint("shimmershell")）
  onStage?.('shimmershell');
  // cs:35020-35046:variant==0 的地表石柱列(两侧聚拢的土丘+石笋)
  if (variant === 0) {
    x0 = Math.trunc(X - n5 * n4) - rng.int(-15, 0) - 5;
    x1 = Math.trunc(X + n5 * n4) + rng.int(0, 15);
    let num16 = 0;
    for (let m = x0; m < x1; m += rng.int(9, 13)) {
      let n17 = Y - 3;
      while (st.inBounds(m, n17) && !st.flags[st.idx(m, n17)]) n17--;
      if (!st.inBounds(m, n17)) continue;
      n17 -= 4;
      let n18 = rng.int(5, 9);   // Next(5,10)
      let n19 = rng.int(15, 20); // Next(15,21)
      // cs:35013:n 在 while 前初始化、每轮内层 for 重赋 m-n18——
      // 退出时保留最后一轮内层 for 的初值(而非循环后的 n18)
      let n = m - n18;
      while (n18 > 0) {
        for (n = m - n18; n < m + n18; n++) {
          if (!st.inBounds(n, n17)) continue;
          const ti = st.idx(n, n17);
          st.type[ti] = STONE; st.flags[ti] = 1;
        }
        num16++;
        if (rng.int(0, 2) < num16) { num16 = 0; n18--; m += rng.int(-1, 1); }
        if (n19 <= 0) n18--;
        n19--;
        n17++;
      }
      n -= rng.int(1, 2); // cs:35035:末轮内层 for 的 n 再退 Next(1,3)
      if (st.inBounds(n, n17 - 2)) { const ti = st.idx(n, n17 - 2); st.type[ti] = STONE; st.flags[ti] = 1; }
      if (st.inBounds(n, n17 - 1)) { const ti = st.idx(n, n17 - 1); st.type[ti] = STONE; st.flags[ti] = 1; }
      if (st.inBounds(n, n17)) { const ti = st.idx(n, n17); st.type[ti] = STONE; st.flags[ti] = 1; }
      if (rng.int(0, 1) === 0) {
        if (st.inBounds(n, n17 + 1)) { const ti = st.idx(n, n17 + 1); st.type[ti] = STONE; st.flags[ti] = 1; }
        placeTight(st, rng, n, n17 + 2);
      } else {
        placeTight(st, rng, n, n17 + 1);
      }
    }
  }
  // 检查点：石柱列完（variant≠0 时同态跳过 = oracle Checkpoint("shimmerpillars")）
  onStage?.('shimmerpillars');
  // cs:35054-35055:两侧隧道开口
  shimmerOpening(st, rng, -1, X - n5, Y, n8);
  shimmerOpening(st, rng, 1, X + n5, Y, n8);
  // 检查点：两侧隧道开口完（cs:35055 后 = oracle Checkpoint("shimmeropen")）
  onStage?.('shimmeropen');
  // cs:35057-35083:aether 宝石树——500 次 X±70/Y±2 采样,两侧 SolidTile 才种。
  // ★tileSolid 走 GenSolid：659 以太石块自 Reset（cs:11500）起生成期恒非实心——
  //   原版 cs:35091 `SolidTile(num22±1, num23)` 读可变数组,**不会**把树种在以太
  //   石块上;静态 TILE_DEFS.solid 会（v_659 数据仍 solid:true）,已校正
  const solidTile = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const d = TILE_DEFS[st.type[i]];
    return genSolidType(st.type[i]) && !!d && !d.platform && !st.half[i] && st.slope[i] === 0;
  };
  for (let n = 0; n < 500; n++) {
    const tx = rng.int(X - 70, X + 69);              // Next(X-70, X+70)
    const ty = rng.int(Y - 2, Y + 2);                // Next(Y-2, Y+3)
    const treeType = GEM_TREES[rng.int(0, 6)];       // num24=Next(7)（SolidTile 判定前消耗，保持流位）
    if (!solidTile(tx - 1, ty) || !solidTile(tx + 1, ty)) continue;
    growGemTree(st, rng, tx, ty, treeType);
  }
  // 检查点：aether 宝石树种完（cs:35091 循环出口 = oracle Checkpoint("shimmer")）
  onStage?.('shimmer');
  return true;
}

/** cs:35095-35125 ShimmerMakeBiomeOpening */
function shimmerOpening(st: TileStore, rng: RNG, dir: number, X: number, Y: number, size: number): void {
  let num = X;
  let y = Y;
  size--;
  // 原版此处是 WorldGen.SolidTile（cs:35102/35112,读可变 tileSolid）——659 以太石块
  // 生成期非实心（cs:11500）,隧道开口可穿以太石本体。旧近似只查 active（flags）,
  // 已校正为 GenSolid 口径（active && 生成期 tileSolid）
  const solidAt = (x: number, yy: number) =>
    st.inBounds(x, yy) && st.flags[st.idx(x, yy)] !== 0 && genSolidType(st.type[st.idx(x, yy)]);
  for (;;) {
    num += dir;
    let open = true;
    for (let i = y - size + 1; i < y - 1; i++) {
      if (solidAt(num, i)) open = false;
      if (solidAt(num + dir, i)) open = false;
      if (solidAt(num + dir * 2, i)) open = false;
      if (st.inBounds(num, i)) st.flags[st.idx(num, i)] = 0;
    }
    for (let j = y - size; j < y; j++) {
      if (st.inBounds(num - dir, j)) st.flags[st.idx(num - dir, j)] = 0;
    }
    if (solidAt(num - dir, y - size - 1) && st.inBounds(num - dir, y - size - 1)) st.wall[st.idx(num - dir, y - size - 1)] = 0;
    if (solidAt(num - dir, y) && st.inBounds(num - dir, y)) st.wall[st.idx(num - dir, y)] = 0;
    if (rng.int(0, 1) === 0) y += rng.int(-1, 1);
    if (open || num < 50 || num > st.w - 50 || Math.abs(num - X) > 100) break;
  }
}

/** PlaceTight（1456 cs:38329，spiders=false）1:1。
 *  门禁：!anyShimmer(x,y) && (!active(x,y) || type!=231 幼虫) → 掷 Next(2) preferSmall +
 *  Next(3) variation（门禁过即掷，放置成败都消费）。上方实心 → 垂挂钟乳石；否则下方实心
 *  且上方净空 → 地面石笋（spiders 路径在 HiveSpiderPass.placeTightWebs）。
 *  导出给 SpeleothemsAndGemTrees pass（cs:22196，GemPasses 消费）复用。 */
export function placeTight(st: TileStore, rng: RNG, x: number, y: number): void {
  const yi = st.idx(x, y);
  const liq = st.liquid[yi];
  if (liq > 0 && st.liquidType[yi] === LIQ_SHIMMER) return;
  if (st.flags[yi] && st.type[yi] === stLarva()) return;
  const preferSmall = rng.int(0, 1) === 0;   // genRand.Next(2) == 0
  const variation = rng.int(0, 2);           // genRand.Next(3)
  placeUncheckedStalactite(st, x, y, preferSmall, variation);
  // PlaceTight 尾（cs:38345）：placed 165 → CheckStalactite——本仓库 placeUncheckedStalactite
  // 直写"重定型后"的最终列（材质匹配族 style==desired 不掷）；初始列≠期望列的失配族
  // （117/25/203/163/164/200）原版 UpdateStalagtiteStyle 重掷 1×Next(3)——此处补掷
  if (st.flags[yi] && st.type[yi] === STALACTITE) {
    checkStalactite(st, rng, x, y);
  }
}

// ── CheckStalactite（cs:39022）/ UpdateStalagtiteStyle（cs:38669）/ KillTile-165 ──
// 石笋生命周期：放置即查（PlaceTight 尾）+ 后续 TileFrame 重查（TileFrameImportant
// case 165）——支撑被 SmoothSlope 上坡/半砖后 SolidTile 翻假 → 整体击杀（含双格伴生）。
// 击杀改写状态且经 SquareTileFrame 级联重查邻居 165；UpdateStalagtiteStyle 仅在
// style != desiredStyle 时掷 1×Next(3)（cs:38690）。缺失时大理石钟乳石存活数与
// 原版分叉 → SolidTile 门/SmoothSlope mask 级联放大（biome 内流整体错位）。
const STYLE_BY_FX54 = new Map<number, number>([
  [0, 7], [1, 0], [2, 11], [3, 12], [4, 1], [5, 2], [6, 3], [7, 4],
  [8, 5], [9, 6], [10, 8], [11, 9], [12, 10],
]);
/** 期望 style 的列基（UpdateStalagtiteStyle switch cs:38696-38720） */
const FX_BASE_BY_STYLE = [54, 216, 270, 324, 378, 432, 486, 0, 540, 594, 648, 108, 162];

/** GetDesiredStalagtiteStyle（cs:38746-38847）：按 frameY 形态取支撑格，
 *  return null = fail2（UpdateStalagtiteStyle 返 false → 击杀）。 */
function getDesiredStalagtiteStyle(
  st: TileStore, x: number, j: number,
): { fail: boolean; style: number; height: number; y: number } {
  const i0 = st.idx(x, j);
  const fy = st.frameY[i0]!;
  let num = 0, y = j, height = 1;
  let supSheet: number;
  if (fy === 72) {
    num = 0;
    supSheet = sheetActive(st, x, j - 1);
  } else if (fy === 90) {
    num = 1;
    supSheet = sheetActive(st, x, j + 1);
  } else if (fy >= 36) {
    if (fy === 54) y--;
    height = 2;
    num = 4;
    supSheet = sheetActive(st, x, y + 2);
  } else {
    if (fy === 18) y--;
    height = 2;
    num = 3;
    supSheet = sheetActive(st, x, y - 1);
  }
  if (supSheet === 1 || MOSS_SHEETS.has(supSheet)) {
    return { fail: false, style: num === 3 && st.wall[i0] === 62 ? 11 : 0, height, y };
  }
  switch (supSheet) {
    case 200: return { fail: false, style: 10, height, y };
    case 164: return { fail: false, style: 8, height, y };
    case 163: return { fail: false, style: 9, height, y };
    case 117: case 402: case 403: return { fail: false, style: 1, height, y };
    case 25: case 398: case 400: return { fail: false, style: 2, height, y };
    case 203: case 399: case 401: return { fail: false, style: 3, height, y };
    case 396: case 397: return { fail: false, style: 4, height, y };
    case 367: return { fail: false, style: 6, height, y };
    case 368: return { fail: false, style: 5, height, y };
    case 147: case 161: return { fail: false, style: 7, height, y };
  }
  if ((num === 0 || num === 1) && supSheet === 225) return { fail: false, style: 12, height, y };
  return { fail: true, style: 0, height, y };
}

function sheetActive(st: TileStore, x: number, y: number): number {
  if (!st.inBounds(x, y)) return -1;
  const i = st.idx(x, y);
  return st.flags[i] ? (TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1) : -1;
}

/** UpdateStalagtiteStyle（cs:38669）：style!=desired → 掷 1×Next(3) 并重写 height 格列。
 *  本仓库 placeUncheckedStalactite 已直写最终列（材质匹配族），故此处重掷仅在
 *  失配族放置后的首次重查真实发生；重写列基取原版 switch。 */
function updateStalagtiteStyle(st: TileStore, rng: RNG, x: number, j: number): boolean {
  const i0 = st.idx(x, j);
  const style = STYLE_BY_FX54.get(Math.trunc(st.frameX[i0]! / 54));
  if (style === undefined) return false;
  const d = getDesiredStalagtiteStyle(st, x, j);
  if (d.fail) return false;
  if (style !== d.style) {
    const fx = rng.int(0, 2) * 18 + FX_BASE_BY_STYLE[d.style]!;
    for (let k = d.y; k < d.y + d.height; k++) {
      if (st.inBounds(x, k)) st.frameX[st.idx(x, k)] = fx;
    }
  }
  return true;
}

/** KillTile（生成期 noItem 路径，cs:63933-63968）：active(false)+halfBrick(false)+
 *  frameX/Y=-1+type=0 → SquareTileFrame 级联（9 邻 TileFrame，165 邻居重查）。
 *  ★SquareTileFrame（cs:80924）列主序：(x-1,j-1)(x-1,j)(x-1,j+1)(x,j-1)(x,j)(x,j+1)
 *  (x+1,j-1)(x+1,j)(x+1,j+1)——击杀级联内的重查顺序影响连环击杀，曾行主序。
 *  ZZZ 批：可选 reframe 钩子——FinalCleanup 全图扫传入完整 TileFrame 分派
 *  （邻格 184 苔藓芽等须掷骰重查）；缺省仍为本 pass 时序正确的行为（彼时
 *  全图尚无 184，165-only 重查等价）。 */
function killStalactiteTile(
  st: TileStore, rng: RNG, x: number, y: number,
  reframe?: (st: TileStore, rng: RNG, x: number, y: number) => void,
): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) return;
  st.flags[i] = 0; st.half[i] = 0;
  st.frameX[i] = 65535; st.frameY[i] = 65535;  // -1（Uint16 环回；inactive 格不读帧）
  st.type[i] = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (reframe) reframe(st, rng, x + dx, y + dy);
    else frame165(st, rng, x + dx, y + dy);
  }
}

/** 生成期 SolidTile（slope 感知）——大理石 PlaceSlab 的 SmoothSlope 之后必须如此 */
function solidTileSlope(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && genSolidType(st.type[i]) && st.half[i] === 0 && st.slope[i] === 0;
}

/** CheckStalactite（cs:39022）四分支 1:1 */
export function checkStalactite(
  st: TileStore, rng: RNG, x: number, j: number,
  reframe?: (st: TileStore, rng: RNG, x: number, y: number) => void,
): void {
  if (!st.inBounds(x, j)) return;
  const i0 = st.idx(x, j);
  if (!st.flags[i0]) return;
  const fy = st.frameY[i0]!;
  if (fy === 72) {
    let flag = !solidTileSlope(st, x, j - 1);
    if (!flag && !updateStalagtiteStyle(st, rng, x, j)) flag = true;
    if (flag) killStalactiteTile(st, rng, x, j, reframe);
    return;
  }
  if (fy === 90) {
    let flag2 = !solidTileSlope(st, x, j + 1);
    // InvalidTileForPilesOrSpeleothems = TileID.Sets.Boulders（生成期此阶段无巨石）
    if (!flag2 && !updateStalagtiteStyle(st, rng, x, j)) flag2 = true;
    if (flag2) killStalactiteTile(st, rng, x, j, reframe);
    return;
  }
  if (fy >= 36) {
    let num = j;
    if (st.frameY[i0] === 54) num--;
    let flag3 = !solidTileSlope(st, x, num + 2);
    const a = st.inBounds(x, num) ? st.idx(x, num) : -1;
    const b = st.inBounds(x, num + 1) ? st.idx(x, num + 1) : -1;
    if (a < 0 || b < 0) { killStalactiteTile(st, rng, x, num, reframe); return; }
    if (!st.flags[a] || !st.flags[b] || st.type[b] !== st.type[a]) flag3 = true;
    if (st.frameX[b]! !== st.frameX[a]!) flag3 = true;
    if (!flag3 && !updateStalagtiteStyle(st, rng, x, num)) flag3 = true;
    // ★原版击杀带类型门（cs:39146-39155/39193-39202）：仅 type == 被查格（165）的
    // 格被 KillTile——num/num+1 被后续放置覆写成大理石等非 165 时**不得连带击杀**
    // （曾无条件双双击杀 → 刚放的板格被抹 → SmoothSlope/SolidTile 门级联分叉，
    // biome2 slab78 van48/js63 掷混合分歧根因）
    if (flag3) {
      if (st.type[a] === st.type[i0]) killStalactiteTile(st, rng, x, num, reframe);
      if (st.type[b] === st.type[i0]) killStalactiteTile(st, rng, x, num + 1, reframe);
    }
    return;
  }
  // 垂挂双格（frameY 0/18）
  let num = j;
  if (st.frameY[i0] === 18) num--;
  let flag4 = !solidTileSlope(st, x, num - 1);
  const a = st.inBounds(x, num) ? st.idx(x, num) : -1;
  const b = st.inBounds(x, num + 1) ? st.idx(x, num + 1) : -1;
  if (a < 0 || b < 0) { killStalactiteTile(st, rng, x, num, reframe); return; }
  if (!st.flags[a] || !st.flags[b] || st.type[b] !== st.type[a]) flag4 = true;
  if (st.frameX[b]! !== st.frameX[a]!) flag4 = true;
  if (!flag4 && !updateStalagtiteStyle(st, rng, x, num)) flag4 = true;
  // ★同上：类型门击杀（cs:39193-39202）——非 165 占位格不连带
  if (flag4) {
    if (st.type[a] === st.type[i0]) killStalactiteTile(st, rng, x, num, reframe);
    if (st.type[b] === st.type[i0]) killStalactiteTile(st, rng, x, num + 1, reframe);
  }
}

/** WorldGen.TileFrame 生成期行为 1:1（cs:82067）：!active → 清 half/slope 后返回
 *  （Tile.cs inactive 分支——对拍 MS slope 网必需）；active+165 → CheckStalactite
 *  （cs:85995）。其余类型（solid/非 165 frameImportant）生成期无副作用无掷。 */
export function frame165(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) { st.half[i] = 0; st.slope[i] = 0; return; }
  if ((TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1) === 165) checkStalactite(st, rng, x, y);
}

/** 幼虫 tile 231（蜂巢专用；以太无蜂巢，惰性查表防硬依赖） */
let _larva = -1;
function stLarva(): number {
  if (_larva < 0) _larva = TILE_BY_KEY['v_231_larva'] ?? 0;
  return _larva;
}

/** PlaceUncheckedStalactite（cs:38371，spiders=false）1:1。
 *  按上方/下方支撑块类型分派帧组（后续 if 覆盖式，与原版一致）：
 *   冰雪族 147/161/163/164/200 → fx=var*18；石族 1/苔藓/117/25/203 → fx=54+var*18；
 *   蜂巢 225 → fx=162+var*18（恒小号）；沙岩 396/397 → 378+；花岗岩 368 → 432+；大理石 367 → 486+。
 *  preferSmall=单格 fy=72（垂挂）/90（地面）；否则双格 fy=0/18（垂挂）或 36/54（地面）。 */
export function placeUncheckedStalactite(st: TileStore, x: number, y: number, preferSmall: boolean, variation: number): void {
  if (!st.inBounds(x, y) || !st.inBounds(x, y + 1)) return;
  const sheetOf = (xx: number, yy: number) => {
    if (!st.inBounds(xx, yy)) return -1;
    const i = st.idx(xx, yy);
    return st.flags[i] ? (TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1) : -1;
  };
  const put = (xx: number, yy: number, fx: number, fy: number) => {
    if (!st.inBounds(xx, yy)) return;
    const i = st.idx(xx, yy);
    // ★SSSSSSS：ClearSlope 全语义（Tile.cs:158-163 = slope(0)+halfBrick(false)）——
    //   曾只清 slope 不清 half：非活性格残留 half=1 被钟乳石继承
    //   （s22222 #103 H0>1×1 @(2012,610)：#102 幽灵苔 182/half1 上放 165 实锤）。
    st.type[i] = STALACTITE; st.flags[i] = 1; st.slope[i] = 0; st.half[i] = 0;
    st.frameX[i] = fx; st.frameY[i] = fy;
  };
  // 锚定材质 → 专属列基带（GetDesiredStalagtiteStyle :38746-38844 + style→fx
  //  switch :38690-38724 合并——PlaceUncheckedStalactite :38346 放完即调
  //  CheckStalactite→UpdateStalagtiteStyle 重定型，最终态=材质专属列）：
  //  1/苔→54｜117→216｜**25 黑檀→270 腐化款**｜**203 猩红→324 猩红款**｜
  //  396/397→378｜368 大理石→432｜367 花岗岩→486｜147/161→0｜163→594｜
  //  164→540｜200→648｜225→162（仅单格形）
  const BASE = (a: number): number => {
    if (a === 1 || mossSheet0(a)) return 54;
    if (a === 117) return 216;
    if (a === 25) return 270;    // 腐化专属
    if (a === 203) return 324;   // 猩红专属
    if (a === 396 || a === 397) return 378;
    if (a === 368) return 432;
    if (a === 367) return 486;
    if (a === 147 || a === 161) return 0;
    if (a === 163) return 594;
    if (a === 164) return 540;
    if (a === 200) return 648;
    return -1;
  };
  const mossSheet0 = (v: number) => MOSS_SHEETS.has(v);
  const hangable = (a: number): boolean => BASE(a) >= 0 && a !== 225;
  // 地面形族（cs:38540-38700 else 分支）：石/苔/117/25/203 + 396/397 + 368 + 367 +
  // 225（仅单格）——**无冰雪族**（147/161/163/164/200 只在垂挂分支 :38385-38467）。
  // 曾 groundable 与 hangable 同表 → 冰面上长出地面冰锥（原版该处不落格）。
  const ICE_FAM = new Set([147, 161, 163, 164, 200]);
  const groundable = (a: number): boolean => BASE(a) >= 0 && a !== 225 && !ICE_FAM.has(a);
  if (solidTile(st, x, y - 1) && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y + 1)]) {
    // 垂挂钟乳石（石质锚挂藤墙 62 → 108 列，:38791-38796）
    const above = sheetOf(x, y - 1);
    if (hangable(above)) {
      const wall = st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0;
      const base = (above === 1 || mossSheet0(above)) && wall === 62 ? 108 : BASE(above);
      if (preferSmall) put(x, y, base + variation * 18, 72);
      else { put(x, y, base + variation * 18, 0); put(x, y + 1, base + variation * 18, 18); }
    }
    if (above === 225) put(x, y, 162 + variation * 18, 72);
    if (above === 396 || above === 397) {
      if (preferSmall) put(x, y, 378 + variation * 18, 72);
      else { put(x, y, 378 + variation * 18, 0); put(x, y + 1, 378 + variation * 18, 18); }
    }
    if (above === 368) {
      if (preferSmall) put(x, y, 432 + variation * 18, 72);
      else { put(x, y, 432 + variation * 18, 0); put(x, y + 1, 432 + variation * 18, 18); }
    }
    if (above === 367) {
      if (preferSmall) put(x, y, 486 + variation * 18, 72);
      else { put(x, y, 486 + variation * 18, 0); put(x, y + 1, 486 + variation * 18, 18); }
    }
    return;
  }
  // 地面石笋：下方实心 + 本格/上格净空
  if (!solidTile(st, x, y + 1) || st.flags[st.idx(x, y)] || st.flags[st.idx(x, y - 1)]) return;
  const below = sheetOf(x, y + 1);
  if (groundable(below)) {
    if (preferSmall) put(x, y, BASE(below) + variation * 18, 90);
    else { put(x, y - 1, BASE(below) + variation * 18, 36); put(x, y, BASE(below) + variation * 18, 54); }
  }
  if (below === 225) put(x, y, 162 + variation * 18, 90);
}
