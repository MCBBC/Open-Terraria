// 原版两个高可见小件 pass（1456 WorldGen.cs）1:1：
//   RemoveSurfaceWaterAboveSand（cs:16295-16326）：地表沙柱上方悬空水清除，
//     注册序 SettleLiquids(16215) < 本 pass < Oasis(16327)——须在贝壳堆之前。
//   FragileIceOverIceBiomeWater（cs:16756-16785 + MakeWateryIceThing cs:80206）：
//     冰原水面上铺 BreakableIce 162（薄冰），注册序 Waterfalls(16697) < 本 pass <
//     CaveWallVariety(16786)。
// 两 pass 均零掷骰（纯扫描），不影响 RNG 流。
import { TileStore } from '../../TileStore';
import type { GenState } from './GenState';
import type { RNG } from '../../../core/rng';
import { TILE_BY_KEY, TILE_DEFS, ICES_SNOW_SHEETS } from '../../../data/tiles';
import { flipGenSolid } from './GenSolid';
import { genSquareTileFrame } from './FinalCleanupPass';
import { doWorldIsFrozenSweep } from './SecretSeedDoEndsPass';   // ★IIIII110 冻结重放

const SAND = TILE_BY_KEY['sand']!;                 // 53
const SAND_HARD = TILE_BY_KEY['hardened_sand']!;   // 397
const SANDSTONE = TILE_BY_KEY['sandstone']!;       // 396？原版 404=Sandstone，见下
const THIN_ICE = TILE_BY_KEY['thin_ice']!;         // tile 162 BreakableIce

// 内部 tile id → 原版 sheet id
const SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
/** TileID.Sets.Snow（TileID.cs:291）= {147}；Sets.Ices（:293）= {161,200,163,164}
 *  ——★BJ218 收编单源 data/tiles.ts:ICES_SNOW_SHEETS（TileID.cs:297=两表并值,§6j;cs:80759） */
const SNOW_OR_ICE = ICES_SNOW_SHEETS;

/** RemoveSurfaceWaterAboveSand（cs:16295-16326）：
 *  x∈[400,w-400]，自 y=100 下扫到首个 active 格即停（break 在任何分支后），
 *  沙族 {53,396,397,404,407,151} → 向上清液体直到遇到 active。零掷骰。
 *  ★UUUUUU：NTB 跳过（cs:16329 头门 `!roundLandmasses && !noSurface &&
 *  (!notTheBees || dontStarve)`——蜂蜜世界沙已变蜂蜜块，纯 NTB 恒跳过）。 */
export function runRemoveSurfaceWaterAboveSandPass(st: TileStore, gs: GenState): void {
  // ★ZZZZZZ（NTB #50 定罪）：原版门（cs:16297）= `!Skyblock.denySomeGeneration &&
  //   !SecretSeed.extraLiquid.Enabled`——**无 notTheBees/theConstant 支**（1405 无本
  //   pass,系 1.4.4+ 新增;extraLiquid 系独立哈希名种子 cs:392,JS 未建模）。曾自加
  //   `ntb&&!theConstant&&…` 早退 → NTB 沙上清液整段跳过：vanilla 050 抹掉 (1373,249)
  //   蜜×2+水×1（沙柱上方残液）,JS 保留 = #50 Y0>3×2/Y0>1×1 首差。denySome=skyblock
  //   族（WorldGen.cs:3130）,JS 支持种子集内仅 skyblock 需跳过。
  if (gs.seedFlags.skyblock) return;
  for (let x = 400; x < st.w - 400; x++) {
    for (let y = 100; y < gs.worldSurface - 1; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const s = SHEET[st.type[i]];
      if (s === 53 || s === 396 || s === 397 || s === 404 || s === 407 || s === 151) {
        let num = y;
        while (num > 100) {
          num--;
          if (st.flags[st.idx(x, num)]) break;
          st.liquid[st.idx(x, num)] = 0;
        }
      }
      break;   // cs:16321：首格判定后无论命中与否都结束该列
    }
  }
  // ★pass 尾 tileSolid 翻转（cs:16324 `Main.tileSolid[192] = true`）：活树叶自
  //   LivingTrees 尾（cs:15789）的非实心态短暂回实心——SmoothWorld 尾（cs:16694,
  //   HalfBrickPass 接线）再翻回 false。本仓 TILE_DEFS 已预翻 192 为 solid:false,
  //   GenSolid 在此窗口内表达 true（本 pass 判定不查 solid,存档时间线）。
  flipGenSolid([192], true);
  void SAND; void SAND_HARD; void SANDSTONE;
}

/** MakeWateryIceThing（1457 cs:80744-80790）1:1：水柱底为雪/冰族 → 沿水面线左右铺薄冰 162。
 *  门禁：上格无液无块、前进侧邻格非半砖；越界即止。
 *  ★R9-5（2026-08-24）：函数门补 `&& !remix`（cs:80746 `|| (lava() && !Main.remixWorld)`）
 *  ——remix 世界岩浆柱两道门都放行（调用门 cs:16791 同款），岩浆面照样铺薄冰；
 *  旧注释"remix 分支不触发"判断有误。
 *  ★IIIII159（2026-09-04）：落位由 setTileSilent 改为 **PlaceTile(162,mute) 1:1**
 *  （cs:59841 主体：!active 前置清 Tile|TilePaint|Slope=Tile.Clear(TileDataType) cs:746
 *  → 内层 default 支 active+type 直写 cs:60733-60741 → **尾 SquareTileFrame cs:60760**）
 *  ——级联 TileFrame 打到邻格 165 钟乳 → CheckStalactite→UpdateStalagtiteStyle
 *  （cs:39067）样式失配即 Next(3)+重写 frameX：x86 rig 逐 pass 帧 dump 实证
 *  (2931,861) fx=72(石)→0(冰) 恰发生在本 pass（055_Ice）,JS 曾缺级联 fx 滞留 72 →
 *  Piles #1425 级联 JS 多耗 1 掷(样失配重掷) → 过渡窗采样错位 → x86 (3744,893)
 *  地牢墙 flag 独占 m+1 → m251(末段)边界相移 → 段② B 格 (1762,1106) 前置清缺失。 */
function makeWateryIceThing(st: TileStore, rng: RNG, i: number, j: number, remix = false): void {
  const inWorld = (x: number, y: number): boolean =>
    x >= 1 && y >= 1 && x < st.w - 1 && y < st.h - 1;
  if (!inWorld(i, j)) return;
  const start = st.idx(i, j);
  if (st.liquid[start] <= 0 || st.flags[start]) return;
  if (st.liquidType[start] === 2 && !remix) return; // 岩浆跳过（remix 放行，cs:80746）
  let num = j;
  while (!st.flags[st.idx(i, num)] && st.liquid[st.idx(i, num)] > 0) {
    num++;
    if (num > st.h - 50) return;
  }
  if (!st.flags[st.idx(i, num)] || !SNOW_OR_ICE.has(SHEET[st.type[st.idx(i, num)]])) return;
  num--;
  while (st.liquid[st.idx(i, num)] > 0) {
    num--;
    if (num < 10) return;
  }
  if (st.flags[st.idx(i, num)]) return;
  num++;
  if (!st.flags[st.idx(i, num)]) {
    // 水面线（num 行）：向左直到门禁破，再从 i+1 向右
    // ★IIIII159：单格落位 = PlaceTile(162,mute:true) 1:1——前置清（!active →
    //   Tile.Clear(Tile|TilePaint|Slope)：slope/half/paint/涂层块位清,液保留）+
    //   active+type 直写 + 尾 genSquareTileFrame（CheckStalactite 族掷/重写载体）。
    const placeThinIce = (x: number): void => {
      const k = st.idx(x, num);
      st.slope[k] = 0; st.half[k] = 0; st.paint[k] = 0;
      st.coat[k] &= ~TileStore.COAT_BLOCK_MASK;    // TilePaint→ClearBlockPaintAndCoating
      st.type[k] = THIN_ICE; st.flags[k] = 1;
      st.frameX[k] = 0; st.frameY[k] = 0;
      genSquareTileFrame(st, rng, x, num);         // cs:60760 尾级联（165 邻格重查掷位）
    };
    let x = i;
    for (;;) {
      if (!inWorld(x, num)) break;
      const k = st.idx(x, num);
      if (st.flags[k] || st.liquid[k] <= 0) break;
      const up = st.idx(x, num - 1);
      if (st.liquid[up] !== 0 || st.flags[up]) break;
      if (st.half[st.idx(x - 1, num)]) break;
      placeThinIce(x);
      x--;
    }
    for (let x2 = i + 1;; x2++) {
      if (!inWorld(x2, num)) break;
      const k = st.idx(x2, num);
      if (st.flags[k] || st.liquid[k] <= 0) break;
      const up = st.idx(x2, num - 1);
      if (st.liquid[up] !== 0 || st.flags[up]) break;
      if (st.half[st.idx(x2 + 1, num)]) break;
      placeThinIce(x2);
    }
  }
}

/** FragileIce pass（1457 cs:16771-16799；行号勘误=1457 AddGenerationPass 位）：
 *  ★IIIII110 结构补全——pass 体（cs:16773 `!Skyblock.denySomeGeneration` 门由
 *  WorldGen.ts 槽包装承担）内序：
 *    notTheBees()（槽包装）→ num=(int)worldSurface / num2=h-100 →
 *    **worldIsFrozen 时 DoWorldIsFrozen() 全带重放再置 num=0**（cs:16781-16785）
 *    → y∈[num,h-100) 液体格 MakeWateryIceThing → 尾 tileSolid 226/162=false。 */
export function runFragileIcePass(st: TileStore, gs: GenState, rng?: RNG): void {
  // ★IIIII159 勘误：tileSolid 226/162 翻转原被置 pass 头,而原版在**扫水循环之后**
  //   （cs:16796-98=MakeWateryIceThing 循环尾）——扫水期间 162 仍实心（数据面初值），
  //   落位级联（genSquareTileFrame→CheckStalactite 支撑判定）读的就是实心态；
  //   pass 尾翻 false 后到 UndergroundHouses 头（cs:17076-79）短暂回实心、尾
  //   （cs:17220-23）再翻 false,226 到 CaveWalls 头（cs:17822）回 true,162 到
  //   BeeLarva 尾（cs:21048）回 true——窗口语义不变,仅头/尾位归位。
  let y0 = Math.floor(gs.worldSurface);                                // cs:16779
  if (gs.seedFlags.worldIsFrozen) {                                    // cs:16781-16785
    // 冻结世界：全带冰化在此重放（深层石/土/草族 → 冰/雪/冰浆糖层,单种子 count=1
    // <6 带=UnderworldLayer-H/10≈880 与 x86 实测冻结面底界 881 吻合）；水面薄冰
    // 扫描起点同时降到 0（深域液面也铺薄冰）。骰耗=每列 Next(3) 重掷流,见本体注。
    if (!rng) throw new Error('runFragileIcePass: worldIsFrozen 需要 rng（管线应传入）');
    doWorldIsFrozenSweep(st, rng, gs);
    y0 = 0;
  }
  const y1 = st.h - 100;
  // ★R9-5：调用门 `liquid>0 && (!lava || remix)`（cs:16791）——remix 世界岩浆格
  //  照样进 MakeWateryIceThing（倒置世界冰原岩浆袋表面铺薄冰）。
  const remix = !!gs.seedFlags?.remix;
  for (let x = 10; x < st.w - 10; x++) {
    for (let y = y0; y < y1; y++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && (st.liquidType[i] !== 2 || remix)) makeWateryIceThing(st, rng as RNG, x, y, remix);
    }
  }
  // cs:16796-98：扫水循环后 226 蜥蜴砖 / 162 薄冰自此非实心（GenSolid 窗口起点）
  flipGenSolid([226, 162], false);
}
