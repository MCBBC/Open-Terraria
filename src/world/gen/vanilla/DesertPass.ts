// 原版 pass 18 "Full Desert" 移植(WorldGen.cs:5525 + GameContent/Biomes/Desert/*)。
// 沙丘:SandMound.Place 1:1——sqrt(1-t⁴) 四次超椭圆剖面 + ±10 双随机游走噪声,
// 中心削平,整柱纯沙(53)填充到 desert2.Bottom(无硬化沙分层——硬化沙只来自蜂巢壳)。
// 蜂巢(Sub-B):DesertHive 1:1——椭圆散点→深度2 DFS 簇→AttemptClaim 合并→
// 场强 Σ1/d² 前二大分层(3.5/1.8/0.7/0.25)；shell 骰与 0.25 门走 FastRandom 独立流。
// 入口(Sub-C):33%(Configuration.json 覆盖为 0.5)+Next(4) 四形状
// Chambers/Anthill/LarvaHole/Pit。记录 gs.undergroundDesert。
import type { TileStore } from '../../TileStore';
import { FastRandom } from '../../../core/rng';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS, TILE_CUT_SHEETS, BREAKABLE_WHEN_PLACING_SHEETS, BOULDERS_IDS, CLOUDS_IDS } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';
import { placeTight } from './ShimmerPass';
import { placeTilePrologueClear } from './WorldGenTileHelpers';
import { flipGenSolid, genSolidType } from './GenSolid';
import { smoothSlope } from './HalfBrickPass';

const CLOUDS = CLOUDS_IDS;   // ★BJ210 收编单源 data/tiles.ts:CLOUDS_IDS（内部 id 域,§6i）

/** SurfaceMap.FromArea（Desert/SurfaceMap.cs 1:1）：全列首实心扫描（云族重置），
 *  Bottom 统计钳到 (int)worldSurface-10，Average=原始均值 */
function surfaceMapFromArea(st: TileStore, startX: number, width: number) {
  const half = Math.floor(st.h / 2);
  const hs = new Int16Array(width);
  let sum = 0, mn = 0x7fffffff, mx = 0;
  for (let i = 0; i < width; i++) {
    const x = startX + i;
    let flag = false, y = half + 50;
    if (x >= 0 && x < st.w) {
      for (let j = 50; j < 50 + half; j++) {
        const ti = st.idx(x, j);
        if (st.flags[ti]) {
          if (CLOUDS.has(st.type[ti])) flag = false;
          else if (!flag) { y = j; flag = true; }
        }
        if (!flag) y = half + 50;
      }
    }
    hs[i] = y; sum += y;
    if (y < mn) mn = y;
    if (y > mx) mx = y;
  }
  const cap = Math.floor(stWorldSurface(st)) - 10;
  if (mx > cap) mx = cap;
  return { heights: hs, average: sum / width, bottom: mx };
}
// GenState 没存 Main.worldSurface 引用——由调用方传 gs；为省参数用模块级钩子
let _wsRef: () => number = () => 300;
function stWorldSurface(_st: TileStore): number { return _wsRef(); }

export interface DesertDesc {
  combX: number; combY: number; combW: number; combH: number;
  hiveTop: number; hiveH: number;
  desertH: number;
  blockCols: number; blockRows: number;
  surface: Int16Array; surfaceX: number;
  surface2: Int16Array; surface2X: number;
}

/** RowHasInvalidTiles（DesertDescription.cs:96-110）：Bottom 行整列查 59/60/161/147
 *  ★UUUUUU（:101 `(!notTheBees || remix)` 门）：NTB/Remix 豁免 59/60 泥/丛林草支
 *  ——蜂蜜世界全域泥化，沙漠选址只拒冰雪带（缺门=沙漠被泥带顶飞重掷=全图漂移）。 */
function rowHasInvalidTiles(st: TileStore, ntbSkipMud: boolean, startX: number, bottomY: number, width: number): boolean {
  for (let i = startX; i < startX + width; i++) {
    if (i < 0 || i >= st.w) continue;
    const t = st.type[st.idx(i, bottomY)];
    if (!ntbSkipMud && (t === MUD || t === JUNGLE_GRASS)) return true;
    if (t === ICE || t === SNOW) return true;
  }
  return false;
}

/** DesertDescription.CreateFromPlacement + SandMound.Place（1:1，Sub-A）。
 *  返回 null = 无效（RowHasInvalidTiles 命中）——blockRows 掷骰已消耗（原版语义） */
export function desertPlaceMound(st: TileStore, rng: RNG, x: number, worldSurface: number, skipCheck = false,
  ntbSkipMud = false, seedFlagsRef?: GenState['seedFlags']): DesertDesc | null {
  _wsRef = () => worldSurface;
  const { w, h } = st;
  const factor = w / 4200;
  const blockCols = Math.trunc(80 * factor);
  // NextDouble 恒掷（remix 下结果被覆写弃用，仅占流位——cs:67-71）
  let blockRows = Math.trunc((rng.next() * 0.5 + 1.5) * 170 * factor);
  if (seedFlagsRef?.remix) blockRows = Math.trunc(340 * factor);   // cs:70-72：固定行数
  const width = Math.trunc(4 * blockCols);   // BlockScale.X=4
  const height = Math.trunc(2 * blockRows);  // BlockScale.Y=2
  const ox = x - Math.trunc(width / 2);      // origin.X -= num4/2（int 除）
  const sm = surfaceMapFromArea(st, ox - 5, width + 10);
  if (!skipCheck && rowHasInvalidTiles(st, ntbSkipMud, ox, sm.bottom, width)) return null;
  // num6 = (int)(Average + Bottom) / 2 —— 先截断再 int 除（DesertDescription.cs:81）
  const topY = Math.trunc(sm.average + sm.bottom) / 2 | 0;
  const hiveTop = topY + rng.int(40, 59);    // Next(40,60)
  // ★SSS-CELEB（1458 DesertDescription.cs:84-93）：tenth → num7=(int)(20*num)
  //   （小世界=20）。矩形整体下移/加深：Hive=(X, Y+num7, w, h-num7)、
  //   Desert.Height+=num7、CombinedArea 不变。后续入口/Hive/Cleanup 全部消费
  //   该偏移后的矩形（vanilla 在 CreateFromPlacement 内一次成型）。
  const celbNum7 = seedFlagsRef?.tenthAnniversary ? Math.trunc(20 * factor) : 0;
  const desertH = hiveTop + Math.trunc(height / 2) - topY + celbNum7; // Desert.Height（未封顶）
  // ---- SandMound.Place（SandMound.cs 1:1）----
  //   ★SSS-CELEB：vanilla SandMound 读的是【已含 num7 的 description】——
  //   moundH=min(Desert.Height+7, ⌊(Hive.Height-7)/2⌋)（Hive 高度同步被削 num7）
  let moundH = Math.min(desertH, Math.trunc((height - celbNum7) / 2)); // min(Desert.Height, Hive.Height/2)
  const moundBottom = topY + moundH;                        // capped desert.Bottom
  const sandBottom = topY + desertH;                        // Desert.Bottom（沙柱底）
  let coarse = 0, fine = 0;
  for (let i = -5; i < width + 5; i++) {
    const cx = ox + i;
    let t = Math.abs((i + 5) / (width + 10)) * 2 - 1;
    t = Math.max(-1, Math.min(1, t));
    if (i % 3 === 0) coarse = Math.max(-10, Math.min(10, coarse + rng.int(-1, 1)));
    fine = Math.max(-10, Math.min(10, fine + rng.int(-1, 1)));
    const profile = Math.sqrt(1 - t * t * t * t);
    const surfY = moundBottom - Math.trunc(profile * moundH) + coarse;
    if (Math.abs(t) < 1 && cx >= 0 && cx < w) {
      // UnclampedSmoothStep=纯线性斜坡（Utils.cs:141-144），再立方——非平滑曲线
      const ramp = (Math.abs(t) - 0.5) / 0.3;
      const val = Math.min(10 + Math.trunc(topY - ramp * ramp * ramp * 20) + fine, surfY);
      const si = Math.max(0, Math.min(sm.heights.length - 1, i + 5)); // Surface[cx]=heights[cx-(ox-5)]
      const jStart = sm.heights[si] - 1;
      for (let j = jStart; j < val; j++) {
        if (j < 0 || j >= h) continue;
        const ti = st.idx(cx, j);
        st.flags[ti] = 0;          // active(false)（type 保留=幽灵，原版语义）
        st.wall[ti] = 0;
      }
    }
    // PlaceSandColumn：从 surfY 填到 sandBottom（沙/激活；height 可为负→零次）
    // ★IIIII48 REMIX（SandMound.cs:59-62）：非 remix 才清液体——remix「dont dig up」
    //   沙柱保留原地液量（水袋），Y 通道对拍的油源之一。
    const keepLiquid = !!seedFlagsRef?.remix || (!!seedFlagsRef?.surfaceIsDesert && !!seedFlagsRef?.noSurface);
    // ★IIIII111 勘误（SandMound.cs:58-63）：clear 门=`!remix && !(sandEnabled && noSurface)`——
    //   双旗组合(sandy britches+mole people)沙柱保留液体；此前注释误写为 rem 专有保留。
    for (let y = surfY + (sandBottom - surfY) - 1; y >= surfY; y--) {
      if (y < 0 || y >= h) continue;
      const ti = st.idx(cx, y);
      st.type[ti] = SAND; st.flags[ti] = 1;
      if (!keepLiquid) { st.liquid[ti] = 0; st.liquidType[ti] = 0; }
      // PlaceSandColumn 尾的 SquareWallFrame（SandMound.cs:73）——有墙格掷骰
      squareWallFrameDraw(st, rng, cx, y);
    }
  }
  // UpdateSurfaceMap（mound 后重扫，入口/Hive 消费）
  const sm2 = surfaceMapFromArea(st, ox - 5, width + 10);
  return {
    combX: ox, combY: topY, combW: width, combH: hiveTop + height - topY, // CombinedArea 不含 num7
    hiveTop: hiveTop + celbNum7, hiveH: height - celbNum7, desertH,
    blockCols, blockRows,
    surface: sm.heights, surfaceX: ox - 5,
    surface2: sm2.heights, surface2X: ox - 5,
  };
}

const MUD = TILE_BY_KEY['mud']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const SAND = T.SAND;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;
const FOSSIL = TILE_BY_KEY['desert_fossil']!;

// ★SquareWallFrame 掷骰还原(2026-08-16 #19 根因):
// Framing.WallFrame(i,j,resetFrame=true) 对每个「有墙且非大幅墙」格掷 1 次
// genRand.Next(0,3),墙 21 再掷 Next(2)(真源 TerrariaServer.exe Framing.cs:326-406
// `else if (resetFrame) { num2 = genRand.Next(0,3); if (tile.wall==21 && genRand.Next(2)==0) ... }`)。
// 墙帧位(wallFrameNumber/X/Y)不入 TileStore,但掷骰是 genRand 流的一部分——曾按
// 「哈希无关副作用省略」跳过,导致 pass 内流错位:mound 沙柱清带走带(±1 游走)→
// 入口 kind 掷 → 蜂巢簇散点全错(#19 W187>216×35926/W216>187×34902 主签名)。
// 大幅墙表(Main.cs wallLargeFrames,1=phlebas/2=lazure):走查表免掷。
const WALL_LARGE_FRAMES = new Set<number>([
  146, 147, 167, 179, 354,          // phlebas(1)
  185, 224, 274, 323, 324, 325, 326, 327, 328, 329, 330, 355, 358, 359, 362, 363, 366, // lazure(2)
]);
/** Framing.WallFrame(i,j,resetFrame=true) 的掷骰语义(边界 1..max-2;wall==0 早退) */
function wallFrameDraw(st: TileStore, rng: RNG, x: number, y: number): void {
  if (x <= 0 || y <= 0 || x >= st.w - 1 || y >= st.h - 1) return;
  const w = st.wall[st.idx(x, y)];
  if (w === 0 || WALL_LARGE_FRAMES.has(w)) return;
  rng.int(0, 2);                       // genRand.Next(0, 3)
  if (w === 21 && rng.int(0, 1) === 0) { /* frameNumber=2(帧位不建模,掷骰已还原) */ }
}
/** WorldGen.SquareWallFrame(i,j)(cs:80937-80948):九邻域 WallFrame 中**只有中心格**
 *  传 resetFrame(:80943),其余八邻走默认 resetFrame=false 的 wallFrameNumber() 存量
 *  分支——零掷。故每次调用至多 1 掷(中心格有墙且非大幅墙)。 */
function squareWallFrameDraw(st: TileStore, rng: RNG, x: number, y: number): void {
  wallFrameDraw(st, rng, x, y);
}

/** ★IIIII87 导出：WorldGen.SquareWallFrame 单点生成期镜像（=本模块 squareWallFrameDraw，
 *  上限 1 掷：中心格有墙且非大幅墙时 Next(0,3)+墙21 二掷）。消费端=Convert_ActuallyConvertWall
 *  尾级联（cs:56813）——SecretSeedDoEnds 净化/神圣转换墙写后必调；此前漏挂导致 wall 转换
 *  支整段少掷。 */
export function genSquareWallFrame(st: TileStore, rng: RNG, x: number, y: number): void {
  squareWallFrameDraw(st, rng, x, y);
}

/** 放置循环 + Description + SandMound（Sub-A；Hive/入口在 runDesertPass 续） */
export function runDesertMoundOnly(st: TileStore, rng: RNG, gs: GenState): DesertDesc {
  // ▶DesertBiome cs:12532 pass 头重播（RunPass 语义；mound/entrance/hive 三个检查点
  //   同属一个 pass，只在头重播——拆分/合并两条调用路径都经过这里）
  rng.reseed(gs.seed);
  // ★pass 头 tileSolid 翻转（cs:12537 `Main.tileSolid[484] = false`，位于本 pass
  //   首句、mound 循环之前）：滚动仙人掌 (484) 自 DesertBiome 起生成期恒非实心
  //   （此后 Gems cs:15114 / Altars cs:15831 / SettleLiquids cs:16292 均为冗余重放，
  //   生成期再无 =true）——AddTileVariance 装饰门禁的实心查询走 genSolidType 才能见到
  //   该态。放在 runDesertMoundOnly（而非 runDesertPass 包装）以覆盖 caves-checkpoint
  //   拆分调用路径。
  flipGenSolid([484], false);
  const { w } = st;
  const half = Math.floor(w / 2);
  // DesertBiome pass 放置循环（cs:12538-12562 1:1）：失败重掷**永不早退**，
  // 2 次换向后 skipDesertTileCheck 恒过（此前 tries>w/2 早退=可能整图无沙漠）
  let side = gs.dungeonSide, tries = 0, flips = 0, skipCheck = false;
  // ★IIIII83 定罪（1458 DesertDescription.cs:101 复合门反转修正）：RowHasInvalidTiles
  //   的泥/丛林草非法判据 = `(!notTheBees || remix) && (type==59||60)` —— 即「只要
  //   非 NTB 或带 remix，59/60 行一律拒」；NTB 单链（无 remix）才豁免。旧移植把
  //   豁免旗写成 `ntb||remix`＝德摩根弄反：zenith(ntb∧remix 同真)被当豁免 ⇒ 沙漠
  //   首选带一次命中 ⇒ 整个地下沙漠落在 x86 另一侧（真值侧 2100 连败+双翻后
  //   skipCheck 随机落点, jaccard=0）⇒ #19..27 全线爆窗。正确语义= !(A∧B) 仅当
  //   「NTB ∧ 非 remix」才豁免。
  const ntbSkipMud = !!gs.seedFlags.notTheBees && !gs.seedFlags.remix;
  let num4 = Math.trunc(rng.nextIntRange(0, half) / 8) + Math.trunc(half / 8);
  let x = half + num4 * -side;
  let desc: DesertDesc | null = null;
  for (;;) {
    desc = desertPlaceMound(st, rng, x, gs.worldSurface, false, ntbSkipMud, gs.seedFlags);
    if (desc) break;
    num4 = Math.trunc(rng.nextIntRange(0, half) / 2) + Math.trunc(half / 8)
      + rng.nextIntRange(0, Math.trunc(tries / 12));
    x = half + num4 * -side;
    if (++tries > Math.floor(w / 4)) {
      side = (-side) as 1 | -1;
      tries = 0;
      if (++flips >= 2) skipCheck = true;
    }
    if (skipCheck) {
      // 恒过：RowHasInvalidTiles 直接 false（GenVars.skipDesertTileCheck 语义）
      desc = desertPlaceMound(st, rng, x, gs.worldSurface, true, false, gs.seedFlags);
      break;
    }
  }
  return desc!; // skipCheck 后 RowHasInvalidTiles 恒 false → 必非 null
}

// ---- 入口 + 蜂巢（Sub-C + Sub-B）。DesertBiome.Place 顺序（cs:21-42）：
//  mound → UpdateSurfaceMap → 入口（33% 门+Next(4)） → DesertHive.Place → CleanupArea。
//  入口必须在 Hive 之前（两侧共享同一条 genRand 流，次序即流位置）。
//  afterEntrance：入口完成、Hive 之前的对账钩子（oracle 的 desertentrance 检查点） ----
/** IIII54 取证钩（默认无钩零开销）：阶段标记，供掷骰计数对拍用 */
const mark56 = (t: string) => { (globalThis as { __swD56?: (s: string) => void }).__swD56?.(t); };
/** IIII57 取证钩（缺省零开销）：__swD59v 由仪具（tools/_i59.test.ts）注册 */
const d59 = (o: Record<string, unknown>): void => {
  const f = (globalThis as { __swD59v?: (o: Record<string, unknown>) => void }).__swD59v;
  if (f) f(o);
};

export function runDesertEntrancesAndHive(st: TileStore, rng: RNG, gs: GenState, desc: DesertDesc, afterEntrance?: () => void): void {
  const W = st.w, H = st.h;
  mark56('entrance-begin');
  // UpdateSurfaceMap 后的表面图（DesertBiome.cs:22）；Surface[absoluteX]
  const surf2 = (ax: number) => desc.surface2[ax - desc.surface2X];

  // ================= WorldBuilding 微框架（入口 4 形状共用）=================
  // 与 caves-oracle.cs 的 WC/GW 逐行对应；SquareWallFrame 的掷骰见 wallFrameDraw，
  // Smooth 经 SmoothA（Actions.Smooth → Tile.SmoothSlope）落地（坡面改下游门禁）。
  // quitOnFail 恒 false → apply 返回 false 不中断遍历。
  const shapeKey = (dx: number, dy: number) => dx * 4194304 + dy + 2097152;
  abstract class Ga {
    next: Ga | null = null;
    out: Set<number> | null = null;            // GenAction.OutputData（origin 相对坐标）
    abstract apply(ox: number, oy: number, x: number, y: number): boolean;
    protected ua(ox: number, oy: number, x: number, y: number): boolean {
      if (this.out) this.out.add(shapeKey(x - ox, y - oy));
      return this.next ? this.next.apply(ox, oy, x, y) : true;
    }
  }
  function chain(...xs: Ga[]): Ga {           // Actions.Chain：串 NextAction 返回链首
    for (let i = 0; i < xs.length - 1; i++) xs[i]!.next = xs[i + 1]!;
    return xs[0]!;
  }
  function outA(a: Ga, o: Set<number>): Ga { a.out = o; return a; }   // GenAction.Output

  const inW = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  const solidAt = (x: number, y: number) => inW(x, y) && st.flags[st.idx(x, y)] !== 0
    && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;
  const clearEverything = (x: number, y: number) => {
    const i = st.idx(x, y);
    st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 0;
    st.liquid[i] = 0; st.liquidType[i] = 0; st.half[i] = 0; st.slope[i] = 0;
  };
  const resetToType = (x: number, y: number, t: number) => {   // Tile.ResetToType：墙保留，液体清零
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = 1; st.liquid[i] = 0; st.liquidType[i] = 0;
    st.half[i] = 0; st.slope[i] = 0;
  };

  // ---- Modifiers（Modifiers.cs 1:1，沙漠只用到默认 Blotches(2, 0.3)）----
  class Blotches extends Ga {
    apply(ox: number, oy: number, x: number, y: number): boolean {
      rng.next();                               // 先掷 1 次丢弃（L133）
      if (rng.next() < 0.3) {
        const a = rng.int(-1, 0), b = rng.int(0, 1), c = rng.int(-1, 0), d = rng.int(0, 1);
        for (let i = a; i <= b; i++) {
          for (let j = c; j <= d; j++) this.ua(ox, oy, x + i, y + j);
        }
        return true;
      }
      return this.ua(ox, oy, x, y);
    }
  }
  class Offset extends Ga {
    constructor(public dx: number, public dy: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      return this.ua(ox, oy, x + this.dx, y + this.dy);
    }
  }
  class Expand extends Ga {
    constructor(public e: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      for (let i = -this.e; i <= this.e; i++) {
        for (let j = -this.e; j <= this.e; j++) this.ua(ox, oy, x + i, y + j);
      }
      return true;
    }
  }
  class IsSolid extends Ga {
    apply(ox: number, oy: number, x: number, y: number): boolean {
      return solidAt(x, y) ? this.ua(ox, oy, x, y) : false;
    }
  }
  class NotInShape extends Ga {
    constructor(public d: Set<number>) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      return this.d.has(shapeKey(x - ox, y - oy)) ? false : this.ua(ox, oy, x, y);
    }
  }
  class OnlyTiles extends Ga {
    constructor(public t: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (!inW(x, y)) return false;
      const i = st.idx(x, y);
      return st.flags[i] !== 0 && st.type[i] === this.t ? this.ua(ox, oy, x, y) : false;
    }
  }
  class SkipWalls extends Ga {
    constructor(public wt: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      return inW(x, y) && st.wall[st.idx(x, y)] !== this.wt ? this.ua(ox, oy, x, y) : false;
    }
  }
  // Actions.Smooth（Actions.cs:600）→ Tile.SmoothSlope——坡面/半砖写入，供后续
  // AddTileVariance 门禁消费（不再按"哈希无关"省略）
  // 取证钩（W 批 #19 幻影坡归因;默认无钩零开销,同 HalfBrickPass.__swSWAct 约定）
  const d19 = (site: string, x: number, y: number) => {
    const h = (globalThis as { __swD19?: (s: string, x: number, y: number) => void }).__swD19;
    if (h) h(site, x, y);
  };
  class SmoothA extends Ga {
    constructor(public withNeighbors = false) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (this.withNeighbors) {              // Tile.SmoothSlope(applyToNeighbors:true) 序
        d19('L+', x + 1, y); smoothSlope(st, x + 1, y);
        d19('L-', x - 1, y); smoothSlope(st, x - 1, y);
        d19('Lv', x, y + 1); smoothSlope(st, x, y + 1);
        d19('L^', x, y - 1); smoothSlope(st, x, y - 1);
      }
      d19('Lo', x, y);
      smoothSlope(st, x, y);
      return this.ua(ox, oy, x, y);
    }
  }
  // ---- Actions（Actions.cs 1:1）----
  class Clear extends Ga {
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (inW(x, y)) clearEverything(x, y);
      return this.ua(ox, oy, x, y);
    }
  }
  class ClearTile extends Ga {                 // ClearTile()：active=false（type/wall/液体保留）
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (inW(x, y)) { st.flags[st.idx(x, y)] = 0; st.half[st.idx(x, y)] = 0; st.slope[st.idx(x, y)] = 0; }
      return this.ua(ox, oy, x, y);
    }
  }
  class SetTile extends Ga {                   // Clear(~(Wiring|Actuator)) + type + active
    constructor(public t: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (inW(x, y)) {
        const i = st.idx(x, y);
        st.type[i] = this.t; st.flags[i] = 1; st.wall[i] = 0;
        st.liquid[i] = 0; st.liquidType[i] = 0; st.half[i] = 0; st.slope[i] = 0;
      }
      return this.ua(ox, oy, x, y);
    }
  }
  class PlaceWall extends Ga {
    constructor(public wt: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (inW(x, y)) st.wall[st.idx(x, y)] = this.wt;
      // Actions.PlaceWall(Actions.cs):写墙后 SquareWallFrame(x,y) + 四邻(neighbors=true 默认)
      squareWallFrameDraw(st, rng, x, y);
      squareWallFrameDraw(st, rng, x + 1, y);
      squareWallFrameDraw(st, rng, x - 1, y);
      squareWallFrameDraw(st, rng, x, y - 1);
      squareWallFrameDraw(st, rng, x, y + 1);
      return this.ua(ox, oy, x, y);
    }
  }
  // ---- Shapes（Shapes.cs 1:1）----
  function genCircle(ox: number, oy: number, hR: number, vR: number, act: Ga): void {
    const num = (hR + 1) * (hR + 1);
    for (let i = oy - vR; i <= oy + vR; i++) {
      const n2 = hR / vR * (i - oy);
      const n3 = Math.min(hR, Math.trunc(Math.sqrt(num - n2 * n2)));
      for (let j = ox - n3; j <= ox + n3; j++) act.apply(ox, oy, j, i);
    }
  }
  function genRect(ox: number, oy: number, l: number, t: number, r: number, b: number, act: Ga): void {
    for (let i = ox + l; i < ox + r; i++) {
      for (let j = oy + t; j < oy + b; j++) act.apply(ox, oy, i, j);
    }
  }
  const genRectWH = (ox: number, oy: number, w: number, h: number, act: Ga) => genRect(ox, oy, 0, 0, w, h, act);
  // 解码必须 floor（oracle 的算术右移 >>22 同义）：trunc 对负 dx 会偏 1，
  // 令 genAll(All 形状) 的墙清零整体落空（负 dx 半区全写成界外 → 静默 no-op）
  const decode = (k: number): [number, number] => {
    const dx = Math.floor(k / 4194304);
    return [dx, k - dx * 4194304 - 2097152];
  };
  function genAll(ox: number, oy: number, d: Set<number>, act: Ga): void {   // ModShapes.All
    for (const k of d) {
      const [dx, dy] = decode(k);
      act.apply(ox, oy, ox + dx, oy + dy);
    }
  }
  const OUTLINE_OFFS = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1];
  function genOutline(ox: number, oy: number, d: Set<number>, act: Ga): void {  // OuterOutline
    for (const k of d) {
      const [dx, dy] = decode(k);
      for (let i = 0; i < 16; i += 2) {
        if (!d.has(shapeKey(dx + OUTLINE_OFFS[i]!, dy + OUTLINE_OFFS[i + 1]!))) {
          act.apply(ox, oy, ox + dx + OUTLINE_OFFS[i]!, oy + dy + OUTLINE_OFFS[i + 1]!);
        }
      }
    }
  }
  function plotLine(x0: number, y0: number, x1: number, y1: number,
    plot: (x: number, y: number) => boolean, jump: boolean): boolean {   // Utils.PlotLine
    if (x0 === x1 && y0 === y1) return plot(x0, y0);
    const flag = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (flag) { const tx = x0; x0 = y0; y0 = tx; const tx1 = x1; x1 = y1; y1 = tx1; }
    const num = Math.abs(x1 - x0), num2 = Math.abs(y1 - y0);
    let num3 = Math.trunc(num / 2), num4 = y0;
    const num5 = x0 < x1 ? 1 : -1, num6 = y0 < y1 ? 1 : -1;
    for (let i = x0; i !== x1; i += num5) {
      if (!plot(flag ? num4 : i, flag ? i : num4)) return false;
      num3 -= num2;
      if (num3 >= 0) continue;
      num4 += num6;
      if (!jump && !plot(flag ? num4 : i, flag ? i : num4)) return false;
      num3 += num;
    }
    return true;
  }
  function genTail(ox: number, oy: number, width: number, ex: number, ey: number, act: Ga): void {
    // Shapes.Tail：像素域（×16）画楔形尾迹（Utils.PlotTileTale）
    const halfWidth = width * 8;                 // (width*16)/2
    const sx = ox << 4, sy = oy << 4;
    const endX = sx + ex * 16, endY = sy + ey * 16;
    const vx = endX - sx, vy = endY - sy;
    const len = Math.sqrt(vx * vx + vy * vy);
    const px = -(vy / len), py = vx / len;       // 单位法向
    const psx = Math.trunc(sx / 16), psy = Math.trunc(sy / 16);
    const pex = Math.trunc(endX / 16), pey = Math.trunc(endY / 16);
    let length = 0;
    plotLine(psx, psy, pex, pey, () => { length++; return true; }, true);
    length--;
    let curLength = 0;
    plotLine(psx, psy, pex, pey, (x, y) => {
      const num = 1 - curLength / length;
      curLength++;
      const p2x = Math.trunc((sx - px * halfWidth * num) / 16), p2y = Math.trunc((sy - py * halfWidth * num) / 16);
      const p3x = Math.trunc((sx + px * halfWidth * num) / 16), p3y = Math.trunc((sy + py * halfWidth * num) / 16);
      return plotLine(x + p2x - psx, y + p2y - psy, x + p3x - psx, y + p3y - psy,
        (tx, ty) => { act.apply(ox, oy, tx, ty); return true; }, false);
    }, true);
  }

  // ================= Sub-C：入口（DesertBiome.cs:23-40）=================
  // ChanceOfEntrance 被 Configuration.json 覆盖为 0.5（DesertBiome.cs:11 代码默认
  // 0.3333 不生效——曾按 0.3333 写导致门判定与原版分叉）
  // ★SSS-CELEB（1458 DesertBiome.cs:23）：`!tenthAnniversaryWorld && NextDouble()<=chance`
  //   ——celeb 世界**整个入口段跳过且不消耗掷骰**（NextDouble/Next(4) 都不吃）。
  //   此处无 extraLiquid（SecretSeed 组合域）支。
  if (!gs.seedFlags?.tenthAnniversary && rng.next() <= 0.5) {
    const kind = rng.nextIntRange(0, 4);        // Next(4)：Chambers/Anthill/LarvaHole/Pit
    if (kind === 0) chambersEntrance();
    else if (kind === 1) anthillEntrance();
    else if (kind === 2) larvaHoleEntrance();
    else pitEntrance();
  }
  mark56('entrance-end');
  afterEntrance?.();

  // ---- ChambersEntrance.cs 1:1：地表沙盘 + 之字形下行隧道 ----
  function chambersEntrance(): void {
    const centerX = desc.combX + Math.trunc(desc.combW / 2);   // Desert.Center.X
    const px = centerX + rng.int(-40, 40);                     // Next(-40,41)
    const py = surf2(px);
    const shapeData = new Set<number>();
    const data = new Set<number>();
    const ox = px, oy = py + 2;
    genCircle(ox, oy, 24, 12, chain(new Blotches(), outA(new SetTile(SAND), shapeData)));
    const hnum = desc.hiveTop - py;                            // Hive.Top - position.Y
    let num2 = rng.int(0, 1) !== 0 ? 1 : -1;                   // Next(2) != 0
    const list: Array<[number, number, number]> = [[px + -num2 * 26, py - 8, num2]];
    const num3 = rng.int(2, 3);                                // Next(2,4)
    for (let i = 0; i < num3; i++) {
      const num4 = Math.trunc((i + 1) / num3 * hnum) + rng.int(-8, 8);
      const num5 = num2 * rng.int(20, 40);
      const num6 = rng.int(18, 28);
      genCircle(px, py, Math.trunc(num6 / 2), 3, chain(
        new Offset(num5, num4), new Blotches(), outA(new Clear(), data), new PlaceWall(187)));
      list.push([num5 + Math.trunc(num6 / 2) * -num2 + px, num4 + py, -num2]);
      num2 *= -1;
    }
    genOutline(px, py, data, chain(new Expand(1), new OnlyTiles(SAND), new SetTile(HARDSAND), new PlaceWall(187)));
    const pairAct = chain(new IsSolid(), new Blotches(), new Clear(), new Expand(1),
      new PlaceWall(187), new OnlyTiles(SAND), new SetTile(HARDSAND));
    for (let j = 1; j < list.length; j++) {
      const pa = list[j - 1]!, pb = list[j]!;
      const connLen = Math.abs(pb[0] - pa[0]) * 1.5;
      for (let t = 0; t <= 1; t += 0.02) {
        const ax = pa[0] + pa[2] * connLen * t, ay = pa[1];
        const bx = pb[0] + pb[2] * connLen * (1 - t), by = pb[1];
        const cx = pa[0] + (pb[0] - pa[0]) * t, cy = pa[1] + (pb[1] - pa[1]) * t;   // Lerp(p0,p1,t)
        const dx = ax + (cx - ax) * t, dy = ay + (cy - ay) * t;                      // Lerp(v,v3,t)
        const ex = cx + (bx - cx) * t, ey = cy + (by - cy) * t;                      // Lerp(v3,v2,t)
        const fx = dx + (ex - dx) * t, fy = dy + (ey - dy) * t;                      // Lerp(v4,v5,t)
        genRectWH(Math.trunc(fx), Math.trunc(fy), 2, 4, pairAct);                    // .ToPoint()
      }
    }
    genRect(ox, oy, -29, -12, 29, 0, chain(new NotInShape(shapeData), new Expand(1), new PlaceWall(0)));
  }

  // ---- AnthillEntrance.cs 1:1：蚁丘沙锥 + 螺旋下行竖井 ----
  function anthillEntrance(): void {
    const num = rng.int(2, 3);                                  // Next(2,4)
    for (let i = 0; i < num; i++) {
      const holeRadius = rng.int(15, 17);                       // Next(15,18)
      const num2 = Math.trunc((i + 1) / (num + 1) * (desc.combW + 10)) + desc.combX;  // Surface.Width
      anthillAt(num2, surf2(num2), holeRadius);
    }
  }
  function anthillAt(px: number, py: number, holeRadius: number): void {
    const data = new Set<number>();
    const ox = px, oy = py + 6;
    genTail(ox, oy, holeRadius * 2, 0, -holeRadius * 1.5, outA(new SetTile(SAND), data));
    const pairA = chain(new Blotches(), new IsSolid(), new Clear(), new PlaceWall(187));
    const pairB = chain(new IsSolid(), new Clear(), new PlaceWall(187));
    const pairC = chain(new IsSolid(), new SetTile(HARDSAND), new PlaceWall(187));
    const pairD = chain(new SkipWalls(187), new SetTile(SAND));
    const pairE = new PlaceWall(187);
    let num = px;
    for (let i = py - holeRadius - 3; i < desc.hiveTop + (py - desc.combY) * 2 + 12; i++) {
      genRectWH(num, i, 1, 1, i < py ? pairB : pairA);
      genCircle(num, i, 2, 3, pairC);
      if (i % 3 === 0 && i >= py) {
        num += rng.int(-1, 1);                                  // Next(-1,2)
        genRectWH(num, i, 1, 1, pairA);
        if (i >= py + 5) {
          genCircle(num, i, holeRadius, 3, pairD);
          genCircle(num, i, holeRadius - 2, 3, pairE);
        }
        genCircle(num, i, 2, 3, pairC);
      }
    }
    genCircle(ox, oy - Math.trunc(holeRadius * 1.5) + 3, Math.trunc(holeRadius / 2), Math.trunc(holeRadius / 3),
      chain(new ClearTile(), new Expand(1), new PlaceWall(0)));
    // AnthillEntrance.cs:52：All(data)+Smooth(applyToNeighbors=false)——尾迹沙坡面
    genAll(ox, oy, data, new SmoothA());
  }

  // ---- LarvaHoleEntrance.cs 1:1：地表空腔 + 尾迹洞 + 蜿蜒竖井 ----
  function larvaHoleEntrance(): void {
    const num = rng.int(2, 3);
    for (let i = 0; i < num; i++) {
      const holeRadius = rng.int(13, 15);                       // Next(13,16)
      const num2 = Math.trunc((i + 1) / (num + 1) * (desc.combW + 10)) + desc.combX;
      larvaAt(num2, surf2(num2), holeRadius);
    }
  }
  function larvaAt(px: number, py: number, holeRadius: number): void {
    const data = new Set<number>();
    genRect(px, py, -holeRadius, -holeRadius * 2, holeRadius, 0, outA(new Clear(), data));
    genTail(px, py, holeRadius * 2, 0, holeRadius * 1.5, outA(new Clear(), data));
    // LarvaHoleEntrance.cs:29：All(data)+Offset(0,1)+Expand(1)+IsSolid+Smooth(带邻)
    genAll(px, py, data, chain(new Offset(0, 1), new Expand(1), new IsSolid(), new SmoothA(true)));
    const pairA = chain(new Blotches(), new IsSolid(), new Clear(), new PlaceWall(187));
    const pairB = chain(new IsSolid(), new SetTile(HARDSAND), new PlaceWall(187));
    let num = px;
    for (let i = py + Math.trunc(holeRadius * 1.5); i < desc.hiveTop + (py - desc.combY) * 2 + 12; i++) {
      genRectWH(num, i, 1, 1, pairA);
      genCircle(num, i, 2, 3, pairB);
      if (i % 3 === 0) {
        num += rng.int(-1, 1);
        genRectWH(num, i, 1, 1, pairA);
        genCircle(num, i, 2, 3, pairB);
      }
    }
    genAll(px, py + 2, data, new PlaceWall(0));
  }

  // ---- PitEntrance.cs 1:1（零掷骰）：漏斗形直落竖井 ----
  function pitEntrance(): void {
    const holeRadius = rng.int(6, 8);                           // Next(6,9)
    const px = desc.combX + Math.trunc(desc.combW / 2), py = surf2(desc.combX + Math.trunc(desc.combW / 2));
    const smootherStep = (delta: number) => {
      const d = Math.min(1, Math.max(0, delta));
      return 1 - Math.cos(d * 3.1415927410125732) * 0.5 - 0.5;   // C# (float)π 常量
    };
    const scaleAt = (yProgress: number) => yProgress < 0.6 ? 1
      : (1 - smootherStep((yProgress - 0.6) / 0.4)) * 0.5 + 0.5;
    for (let i = -holeRadius - 3; i < holeRadius + 3; i++) {
      const cx = i + px;
      if (cx < 0 || cx >= W) continue;
      const sj = surf2(cx);
      for (let j = sj; j <= desc.hiveTop + 10; j++) {
        if (j < 0 || j >= H) continue;
        let value = (j - sj) / (desc.hiveTop - desc.combY);
        value = Math.min(1, Math.max(0, value));
        const n3 = Math.trunc(scaleAt(value) * holeRadius);
        if (Math.abs(i) < n3) clearEverything(cx, j);
        else if (Math.abs(i) < n3 + 3 && value > 0.35) resetToType(cx, j, HARDSAND);
        let n4 = Math.abs(i / holeRadius);
        n4 *= n4;
        if (Math.abs(i) < n3 + 3 && (j - py) > 15 - 3 * n4) {
          st.wall[st.idx(cx, j)] = 187;
          // PitEntrance.cs:墙带写后 SquareWallFrame(x, j-1)+(x, j)
          squareWallFrameDraw(st, rng, cx, j - 1);
          squareWallFrameDraw(st, rng, cx, j);
        }
      }
    }
    const hr2 = holeRadius + 4;
    for (let k = -hr2; k < hr2; k++) {
      const cx = k + px;
      if (cx < 0 || cx >= W) continue;
      let n5 = hr2 - Math.abs(k);
      n5 = Math.min(10, n5 * n5);
      for (let l = 0; l < n5; l++) {
        const y = l + surf2(cx);
        if (y < 0 || y >= H) continue;
        clearEverything(cx, y);
      }
    }
  }

  // ================= Sub-B：DesertHive（DesertHive.cs 1:1）=================
  // ---- ClusterGroup.Generate（椭圆散点→深度2 DFS→AttemptClaim→≥4 重组）----
  mark56('clustergen-begin');
  const gw = desc.blockCols, gh = desc.blockRows;
  const blockMap: boolean[][] = [];
  for (let c = 0; c < gw; c++) blockMap.push(new Array(gh).fill(false));
  {
    const num1 = Math.trunc(gw / 2) - 1, num2 = Math.trunc(gh / 2) - 1;
    const num3 = (num1 + 1) * (num1 + 1);
    for (let r = 0; r <= num2 * 2; r++) {       // 原版 i ∈ [0, 2*(H/2-1)]——末行不散点！
      const num4 = num1 / num2 * (r - num2);
      const num5 = Math.min(num1, Math.trunc(Math.sqrt(Math.max(0, num3 - num4 * num4))));
      for (let c = num1 - num5; c <= num1 + num5; c++) blockMap[c]![r] = rng.int(0, 1) === 0;
    }
  }
  const pointClusters: Array<Array<[number, number]>> = [];
  {
    const dfs = (x: number, y: number, level: number, acc: Array<[number, number]>) => {
      acc.push([x, y]);
      blockMap[x]![y] = false;
      const lv = level - 1;
      if (lv === -1) return;
      if (x > 0 && blockMap[x - 1]![y]) dfs(x - 1, y, lv, acc);
      if (x < gw - 1 && blockMap[x + 1]![y]) dfs(x + 1, y, lv, acc);
      if (y > 0 && blockMap[x]![y - 1]) dfs(x, y - 1, lv, acc);
      if (y < gh - 1 && blockMap[x]![y + 1]) dfs(x, y + 1, lv, acc);
    };
    for (let x = 0; x < gw; x++) {
      for (let y = 0; y < gh; y++) {
        if (blockMap[x]![y] && rng.int(0, 1) === 0) {
          const pc: Array<[number, number]> = [];
          dfs(x, y, 2, pc);
          if (pc.length > 2) pointClusters.push(pc);
        }
      }
    }
  }
  const idxMap: number[][] = [];
  for (let c = 0; c < gw; c++) idxMap.push(new Array(gh).fill(-1));
  pointClusters.forEach((pc, i) => { for (const [qx, qy] of pc) idxMap[qx]![qy] = i; });
  for (let ci = 0; ci < pointClusters.length; ci++) {
    for (const [px, py] of pointClusters[ci]!) {
      if (idxMap[px]![py] === -1) break;        // 原版 foreach 内 break
      const idx = idxMap[px]![py];
      const claim = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return;   // 原版由调用点边界门保证
        const other = idxMap[nx]![ny];
        if (other === -1 || other === idx) return;
        const val = rng.int(0, 1) === 0 ? -1 : idx;
        for (const [qx, qy] of pointClusters[other]!) idxMap[qx]![qy] = val;
      };
      claim(px - 1, py); claim(px + 1, py); claim(px, py - 1); claim(px, py + 1);
    }
  }
  for (const pc of pointClusters) pc.length = 0;
  for (let x = 0; x < gw; x++) {
    for (let y = 0; y < gh; y++) {
      if (idxMap[x]![y] !== -1) pointClusters[idxMap[x]![y]]!.push([x, y]);
    }
  }
  for (const pc of pointClusters) if (pc.length < 4) pc.length = 0;
  const finalClusters: Array<Array<[number, number]>> = [];
  for (const pc of pointClusters) {
    if (pc.length <= 0) continue;
    finalClusters.push(pc.map(([bx, by]) => [
      bx + (rng.next() - 0.5) * 0.5, by + (rng.next() - 0.5) * 0.5,
    ] as [number, number]));
  }

  // ---- PlaceClustersArea（场强分层）----
  mark56('clustergen-end/clustersarea-begin');
  // ★shell 类型骰与 0.25 门走 FastRandom（DesertHive.cs:253/366）——与 genRand
  //  完全独立的第二条流，曾误用 rng.int/rng.next 造成每格 1-2 次幽灵掷骰
  // ★postEffectMap（DesertHive.cs:193-198/310/314/345/361/388）：各层 ResetToType/
  //  ClearEverything 的格标 Smooth（tier3.5 恒标），循环外统一 Tile.SmoothSlope
  //  (:213-222, applyToNeighbors=false)——坡面/半砖是后续 AddTileVariance 门禁
  //  （SolidTile/SolidTile2/PlaceTight 锚）的一等输入，不可省略（#19 残余根因）
  const hiveW = desc.combW, hiveH = desc.hiveH;
  const fr = new FastRandom(gs.seed).withModifier(57005);
  const smoothMark = new Uint8Array((hiveW + 40) * (hiveH + 40));
  for (let hi = -20; hi < hiveW + 20; hi++) {
    for (let hj = -20; hj < hiveH + 20; hj++) {
      const px = desc.combX + hi, py = desc.hiveTop + hj;
      if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1) continue;   // InWorld(i,j,1)
      let shellType: number = SAND;
      if (fr.nextMax(3) === 0) shellType = HARDSAND;                  // fastRandom.Next(3)
      const vx = (hi - 2) / hiveW * gw;       // (p-BlockScale/2)/Hive*Cluster
      const vy = (hj - 1) / hiveH * gh;
      let f1 = 0, f3 = 0, f2 = -1;
      for (let k = 0; k < finalClusters.length; k++) {
        const cl = finalClusters[k]!;
        const c0 = cl[0]!;
        if (Math.abs(c0[0] - vx) > 10 || Math.abs(c0[1] - vy) > 10) continue;
        let f6 = 0;
        for (const [bx, by] of cl) {
          const ddx = bx - vx, ddy = by - vy;
          f6 += 1 / (ddx * ddx + ddy * ddy);
        }
        if (f6 > f1) { if (f1 > f3) f3 = f1; f1 = f6; f2 = k; }
        else if (f6 > f3) f3 = f6;
      }
      const field = f1 + f3;
      const ex = (hi - 2) / hiveW * 2 - 1;    // (p-BlockScale/2)/Hive*2-One
      const ey = (hj - 1) / hiveH * 2 - 1;
      const isEdge = Math.sqrt(ex * ex + ey * ey) >= 0.8;   // Vector2D.Length()
      const i = st.idx(px, py);
      // ★IIIII48 REMIX（cs:306-352 各支）：深域「岩层下」suppression——remix 世界
      //   每进入 3.5/1.8/0.7/0.25 任一支都**先掷一次 Next(-1,2)**，命中
      //   j>(int)rockLayer+掷值 时跳过 wall/fossil 写入；岩浆/清液子门在 remix 下
      //   双侧都不走（:339-344 `else if (!remixWorldGen)`）。
      // ★IIIII54：cs 尾回写只还原 **liquid 数量**——液体【类型位】跟着分支对
      //   bTileHeader 的操作走：ClearEverything/ResetToType 都把 bTileHeader 清零
      //   （Tile.cs:112-126/251-262）⇒ 类型位回到默认=水；未过这两者的格类型位
      //   保持原值。本仓 type 是显式枚举，须按 wiped 标志回填 WATER（否则水袋格
      //   变成「量 255/类型 NONE」半清除态=Y1>0×7483 的真源）。
      const remixHive = !!gs.seedFlags.remix;
      // ★IIIII111（Y2>1×833 定罪）：Variations.surfaceIsDesertSwapDesertAndSnowBiomes
      //   = surfaceIsDesert.Enabled **且** noSurface.Enabled 双旗（WorldGen.cs:317-324）——
      //   纯 sandy britches 只置 Enabled ⇒ swap=false ⇒ 本三臂的液体操作照走
      //   （DesertHive.cs:338-346/:360-362/:381-389）。旧码把「组合链不触」误建在单旗上。
      const sandyHiveSwap = !!gs.seedFlags.surfaceIsDesert && !!gs.seedFlags.noSurface;
      const liquidSaved = st.liquid[i];
      const liquidSavedTy = st.liquidType[i];
      let headerWiped = false;
      const deepSuppress = (): boolean => !remixHive ? false : (py > gs.rockLevel + rng.int(-1, 1));
      if (field > 3.5) {
        smoothMark[(hi + 20) * (hiveH + 40) + (hj + 20)] = 1;          // :314 恒标
        clearEverything(px, py);
        headerWiped = true;
        if (!deepSuppress()) {
          st.wall[i] = 187;
          if (f2 % 15 === 2) { resetToType(px, py, FOSSIL); headerWiped = true; }  // 获胜簇索引 %15==2
        }
      } else if (field > 1.8) {
        const sup = deepSuppress();
        if (!sup) st.wall[i] = 187;
        if (!sandyHiveSwap) {                                // swap 组合链不触（DesertHive.cs:338）
          if (py < gs.worldSurface) st.liquid[i] = 0;
          else if (!remixHive) st.liquidType[i] = 2;         // remix 不铺岩浆
        }
        if (!isEdge || st.flags[i]) {
          resetToType(px, py, SANDSTONE);
          headerWiped = true;
          smoothMark[(hi + 20) * (hiveH + 40) + (hj + 20)] = 1;        // :345
        }
      } else if (field > 0.7 || !isEdge) {
        const sup = deepSuppress();
        if (!sup) {
          st.wall[i] = 216;
          // ★IIIII111：liquid=0 也在 !swap 门内（DesertHive.cs:360-362）
          if (!sandyHiveSwap) st.liquid[i] = 0;
        }
        if (!isEdge || st.flags[i]) {
          resetToType(px, py, shellType);
          headerWiped = true;
          smoothMark[(hi + 20) * (hiveH + 40) + (hj + 20)] = 1;        // :361
        }
      } else if (field > 0.25) {
        const fr2 = fr.withModifierXY(hi, hj);              // fastRandom.WithModifier(x,y)
        if (fr2.nextDouble() < (field - 0.25) / 0.45) {
          const sup = deepSuppress();
          if (!sup) st.wall[i] = 187;
          if (!sandyHiveSwap) {                              // ★IIIII111（DesertHive.cs:381）
            if (py < gs.worldSurface) st.liquid[i] = 0;
            else if (!remixHive) st.liquidType[i] = 2;
          }
          if (st.flags[i]) {
            resetToType(px, py, shellType);
            headerWiped = true;
            smoothMark[(hi + 20) * (hiveH + 40) + (hj + 20)] = 1;      // :388
          }
        }
      }
      if (remixHive) {
        st.liquid[i] = liquidSaved;                          // cs:408-412 尾回写（仅数量）
        st.liquidType[i] = headerWiped ? 1 /* WATER=vanilla 默认位 */ : liquidSavedTy;
      }
      // flag2（DesertHive.cs:315 每格 true，仅末档 else 置 false）→ UpdateDesertHiveBounds
      //（cs:395-397 + WorldGen.cs:11004）：蜂巢实际雕刻范围，供沙漠箱战利品分层消费
      if (field > 0.25 || !isEdge) {
        if (py < gs.desertHiveHigh) gs.desertHiveHigh = py;
        if (py > gs.desertHiveLow) gs.desertHiveLow = py;
        if (px < gs.desertHiveLeft) gs.desertHiveLeft = px;
        if (px > gs.desertHiveRight) gs.desertHiveRight = px;
      }
    }
  }
  mark56('clustersarea-end/smooth-begin');
  // PlaceClusters 尾的 postEffect 循环（DesertHive.cs:213-222）：标记格 SmoothSlope
  //（applyToNeighbors=false；SmoothSlope 只读邻格 active/tileSolid——坡面写入不回灌，
  //  与原版逐格序等价）
  for (let hi = -20; hi < hiveW + 20; hi++) {
    for (let hj = -20; hj < hiveH + 20; hj++) {
      if (!smoothMark[(hi + 20) * (hiveH + 40) + (hj + 20)]) continue;
      d19('hive', desc.combX + hi, desc.hiveTop + hj);
      smoothSlope(st, desc.combX + hi, desc.hiveTop + hj);
    }
  }

  mark56('smooth-end/variance-begin');
  // ---- AddTileVariance（DesertHive.cs:413-499）----
  // 第一遍：沙 53（含幽灵 53，不判 active）下方 2 格有非实心 → 酥化 397。
  // ★SolidTile(Tile)（cs:70018）：nactive && tileSolid && !tileSolidTop && !half &&
  //  slope==0——PlaceClusters 尾 SmoothSlope 给壳面铺了坡面/半砖，酥化判定必须
  //  含坡位（曾裸用 TILE_DEFS.solid → 53>397×739 残差）
  const solidTileAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const ti = st.idx(x, y);
    if (!st.flags[ti]) return false;
    const t = st.type[ti];
    if (t === 0) return false;
    const d = TILE_DEFS[t];
    return genSolidType(t) && !!d && !d.platform && !st.half[ti] && st.slope[ti] === 0;
  };
  for (let vi = -20; vi < hiveW + 20; vi++) {
    for (let vj = -20; vj < hiveH + 20; vj++) {
      const px = desc.combX + vi, py = desc.hiveTop + vj;
      if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1) continue;
      const s1 = solidTileAt(px, py + 1);
      const s2 = solidTileAt(px, py + 2);
      const i = st.idx(px, py);
      if (st.type[i] === SAND && (!s1 || !s2)) st.type[i] = HARDSAND;
    }
  }
  // 第二遍：396 顶部装饰（485/751/484/165/187，DesertHive.cs:466-496）。
  // ★forced 只放行 PlaceTile 入口门（EmptyTile），各放置函数仍带自有门禁——
  // 此前两侧均无条件落格且锚点列偏 1，2026-08-13 新骰值下对拍出 13988 格分叉。
  // 1456 派发链（PlaceTile :59366）逐项对齐：
  //   485 → PlaceObject（TileObjectData.cs:3511：Origin(0,1)/2x2/SolidTile 双底锚/
  //         RandomStyleRange=4）→ 占 (px..px+1)×(py-2..py-1)；CanPlace 先掷 1×Next(4)
  //         （genRand≡Main.rand，WorldGen.cs:4391——RandomStyleRange>0 成败都掷），
  //         门禁=放置区 4 格全空且无液体（LavaPlacement 默认 NotAllowed，
  //         TileObjectData.cs:1768）+(px,py)/(px+1,py) 双底锚实心。
  //   751/484 → Place2x2（WorldGen.cs:51352）：先 x--/y-- 再写 → 占
  //         (px-1..px)×(py-2..py-1)；门禁=2x2 区全空+(px-1,py)/(px,py) 双底实心。
  //   187 → Place3x2（WorldGen.cs:52097）：占 (px-1..px+1)×(py-2..py-1)；门禁=
  //         3x2 区全空+三列底实心+底非 Boulders（:39005，TileID.cs:195）。
  //   165 → PlaceTight（placeTight 1:1，Next(2)+Next(3) 恒掷；其 SolidTile 锚门禁在
  //         ShimmerPass 内已含 slope/half——CheckStalactite(:39022) 的支撑复查与放置
  //         门禁同谓词，坡位锚在门口即拦，无后置 kill 分支）。
  // 注：SolidTile2/blockType()==0 的 slope==0 已随 PlaceClusters 尾 SmoothSlope
  // （postEffectMap 循环）落地面精确建模；tileTable 区内无表类省略。
  const T485 = TILE_BY_KEY['v_485_antlion_larva']!;
  const T751 = TILE_BY_KEY['v_751_sleeping_digtoise']!;
  const T484 = TILE_BY_KEY['v_484_rolling_cactus']!;
  const T187 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
  // TileID.Sets.Boulders——★BJ168-债2（2026-09-19）本地 idsByVanillaSheet 派生副本
  // 拆除,收编 data/tiles.ts 单源 BOULDERS_IDS（内部 id 域,与旧习语逐值全等已探针定谳;
  // 下方 InvalidTileForPiles 门消费面同名直改）
  const freeAt = (x: number, y: number) => inW(x, y) && st.flags[st.idx(x, y)] === 0;
  const dryAt = (x: number, y: number) => inW(x, y) && st.liquid[st.idx(x, y)] === 0;
  // ★实心查询走 genSolidType（cs:12537 起生成期 tileSolid[484]=false）：本遍已放置
  // 的滚动仙人掌不可当实心底座，裸 TILE_DEFS.solid（484=true）会让原版该拒放的
  // 484/485/187 混进来。入口段的 solidAt 此时图内尚无 484，两写法等价、不动。
  // ★SolidTile2（cs:70178）额外要求 slope==0 && !halfBrick（不查 tileSolidTop）：
  // PlaceClusters 尾的 SmoothSlope 壳面坡位必须拦（曾漏 → 484/485/187 多放）。
  // 帧后复查链（PlaceObject→CheckSuper / Place3x2→Check3x2 的 AnchorValid(SolidTile)
  // /SolidTileAllowBottomSlope）与放置门禁同谓词，门禁拦下即无需另建 kill 路径。
  const solidGenAt = (x: number, y: number) => {
    if (!inW(x, y)) return false;
    const ti = st.idx(x, y);
    return st.flags[ti] !== 0 && genSolidType(st.type[ti])
      && st.slope[ti] === 0 && !st.half[ti];
  };
  /** Place2x2（WorldGen.cs:51352-51445）1:1：锚=右下格，先 x--/y-- 再写，
   *  占 (ax-1..ax)×(ay-1..ay)；门禁=2x2 区全空+双底列 nactive&&(solid||tileTable) */
  const place2x2 = (ax: number, ay: number, tile: number, style: number) => {
    // ★IIIII179：PlaceTile(ax,ay,751/484,forced)（DesertHive.cs:490/494）受理序预清
    //   （cs:59966）——forced 直达 Proceed 析取,751/484 无型拒/drip/液体拒支⇒惰性即清;
    //   位在 Place2x2 自有垫界门前=vanilla「序言后、case 臂前」。受理则覆写,垫界/
    //   区空/双底锚拒时外显（rig 3424 行 100% act0 的 484/751 组）。
    placeTilePrologueClear(st, ax, ay);
    if (ax < 5 || ax > W - 5 || ay < 5 || ay > H - 5) return;   // 原版 x<5||x>max-5
    for (let k = 0; k < 2; k++) {
      for (let l = 0; l < 2; l++) if (!freeAt(ax - 1 + k, ay - 1 + l)) return;
      if (!solidGenAt(ax - 1 + k, ay + 1)) return;              // 底列逐列核
    }
    for (let k = 0; k < 2; k++) {
      for (let l = 0; l < 2; l++) {
        st.setTileSilent(ax - 1 + k, ay - 1 + l, tile, k * 18, style * 36 + l * 18);
      }
    }
  };
  /** Place3x2（WorldGen.cs:52097-52240）1:1：占 (ax-1..ax+1)×(ay-1..ay)；
   *  flag2 门禁=3x2 区全空+三列底 SolidTile2+187 专属底 Boulders 禁——任一失败整组不放 */
  const place3x2 = (ax: number, ay: number, tile: number, style: number): boolean => {
    // ★IIIII179：PlaceTile(ax,ay,187,forced)（DesertHive.cs:502）受理序预清（cs:59966）
    //   ——序言后、Place3x2 自有垫界门前（受理/Check3x2Kill 覆写,门拒时外显=187 组幽灵源）。
    placeTilePrologueClear(st, ax, ay);
    if (ax < 5 || ax > W - 5 || ay < 5 || ay > H - 5) return false;
    for (let k = -1; k <= 1; k++) {
      if (!freeAt(ax + k, ay - 1) || !freeAt(ax + k, ay)) return false;
      const bi = st.idx(ax + k, ay + 1);
      if (st.flags[bi] && BOULDERS_IDS.has(st.type[bi]!)) return false;    // InvalidTileForPiles
      if (!solidGenAt(ax + k, ay + 1)) return false;
    }
    for (let k = 0; k < 3; k++) {
      for (let l = 0; l < 2; l++) {
        st.setTileSilent(ax - 1 + k, ay - 1 + l, tile, style * 54 + k * 18, l * 18);
      }
    }
    return true;
  };
  // Check3x2 的 187 底材复核（cs:49324-49344 style 组 29-34）：PlaceTile(187) 链
  // Place3x2 后紧跟 SquareTileFrame(:60025)→TileFrameImportant case 186/187→Check3x2，
  // 三列底任一不在 Conversion.Sand∪HardenedSand∪Sandstone（TileID.cs:30-34；404 化石
  // 在外！）→ 六格整组 KillTile（active=false+type=0+清坡，cs:63933-63967，生成期
  // noItem、dust 被 isGeneratingOrLoadingWorld 拦=零掷）。首例 (2759,610) 化石/沙岩
  // 混合底：Place3x2 自身门禁（SolidTile2）放行、Check3x2 材质复核击杀。
  const SAND_FAM = idsByVanillaSheet(53, 112, 116, 234, 397, 398, 402, 399, 396, 400, 403, 401);
  const check3x2Kill187 = (ax: number, ay: number): void => {
    for (let k = -1; k <= 1; k++) {
      const bi = st.idx(ax + k, ay + 1);
      if (st.flags[bi] && !SAND_FAM.has(st.type[bi]!)) {
        for (let kk = -1; kk <= 1; kk++) {
          for (let l = -1; l <= 0; l++) {
            const ki = st.idx(ax + kk, ay + l);
            st.flags[ki] = 0; st.type[ki] = 0; st.half[ki] = 0; st.slope[ki] = 0;
            // ★IIIII169·C4（R2）：vanilla 走 KillTile（Check3x2 cs:49868-49876 逐格派发）→
            // 尾 `frameX=-1; frameY=-1`（cs:64400-64401,u16 环回 65535,CXXXVIII 口径）——
            // 裸写清型保帧会把 place3x2 的 style*54+k*18 装饰帧带进终态（x86 幽灵 65535 实证）。
            // 本杀位是内联直清,不经 killTileWholeCore,无双写风险。
            st.frameX[ki] = 65535; st.frameY[ki] = 65535;
          }
        }
        return;
      }
    }
  };
  // ★IIIII57 定罪修（TileObject.cs:174-860 + TileObjectData.cs addBaseTile(Style2x2)
  //  /addTile(485) :3461/:3517）：CanPlace 的液体门是 **LiquidPlace 模块**
  //  （TileObjectData.cs:1765-1767 基座默认：WaterPlacement=Allowed、
  //  **LavaPlacement=NotAllowed**；485 未覆写）。液体格判定逐型：
  //    有液：水/蜂蜜/微光(repo 1/3/4)放行；岩浆(repo 2)拒绝。
  //    无液：OnlyInLiquid/OnlyInFullLiquid 才拒 ⇒ 485 恒过。
  //  旧移植自加 dryAt（液体一律即拒）→ 水袋上的 485 全数拒放，而原版照常落格
  //  ——下游锚点 flag 窗（±3 行 × 双列）被「有物/无物」分叉改写，骰位调度漂移
  //  把两条窄竖带里的钟乳石/仙人掌/3x2 装饰整族镜像翻转（mile8 #19 A193/T228
  //  的真正根源；骰值双端逐位全等、差异全在受理面）。
  //  同时按 CanPlace 实际顺序校正两处：
  //  ① 早退路径不掷骰：粗界(num<0||num+W>=maxX||num2<0||num2+H>=maxY)与 5 垫界
  //     （num8<5||num8+W>maxX-5||…）失败直接 return false——RandomStyleRange 掷
  //     (:792 Main.rand.Next)在门禁求值后、函数尾才执行；旧版无条件先掷=多耗骰。
  //  ② 占用判定=active && !(tileCut∖{484,654} ∪ BreakableWhenPlacing)（cs:337-343
  //     的 flag5）——可切覆盖族（草/苗/蛛网等）不算阻挡。表与 BuriedChestsPass
  //     的 TILE_CUT_SHEETS∖{484,654}/BREAKABLE_WHEN_PLACING_SHEETS 同源。
  //     ★BJ168-债2（2026-09-19）：本地副本 AV_TILE_CUT/AV_BREAK_PLACE 拆除,收编
  //     data/tiles.ts 单源 TILE_CUT_SHEETS/BREAKABLE_WHEN_PLACING_SHEETS（逐值对拍
  //     41≡41/11≡11,tests/tile-domain-sentinel §6c 金标+§6e 结构锁）。
  const AV_LIQ_LAVA = 2;   // 原版 liquidType 1(lava)→ 本仓库 +1 编码
  const AV_CUT_KEPT = new Set([484, 654]);
  const avBlocksAt = (x: number, y: number): boolean => {
    if (!inW(x, y)) return false;
    const ti = st.idx(x, y);
    if (!st.flags[ti]) return false;
    const sh = TILE_DEFS[st.type[ti]]?.vanilla?.sheet ?? -1;
    const overwritable = (TILE_CUT_SHEETS.has(sh) && !AV_CUT_KEPT.has(sh)) || BREAKABLE_WHEN_PLACING_SHEETS.has(sh);
    return !overwritable;
  };
  /** TileObjectData.LiquidPlace（cs:1853-1899）485 视图：lava=NotAllowed。 */
  const avLiquidPlace = (x: number, y: number): boolean => {
    if (!inW(x, y)) return false;
    const ti = st.idx(x, y);
    if (st.liquid[ti] > 0 && st.liquidType[ti] === AV_LIQ_LAVA) return false;
    return true;
  };
  /** PlaceObject→TileObjectData[485] 1:1（Origin(0,1) → 占 (ax..ax+1)×(ay-1..ay)）。
   *  骰序=CanPlace 原版顺序：两条界早退（无掷）→ RandomStyleRange 掷 1×Next(4)
   *  （成败都掷）→ 门禁。液体按 LiquidPlace 默认 Allowed 放行（本函数不再查液体）。 */
  const place485 = (ax: number, ay: number, style: number) => {
    // ★IIIII179：PlaceTile(ax,ay,485,forced)（DesertHive.cs:490）受理序预清（cs:59966）
    //   ——序言后、TileObject.CanPlace 粗界前（预清零掷,与粗界早退零掷相对次序不影响
    //   骰流;CanPlace 拒时预清外显=485 组幽灵源）。
    placeTilePrologueClear(st, ax, ay);
    const fail = (r: string) => d59({ e: 'p485', x: ax, y: ay, r });
    // 粗界（cs:180-186：num<0||num+W>=maxTilesX||num2<0||num2+H>=maxTilesY）
    if (ax < 0 || ax + 2 >= W || ay - 1 < 0 || ay + 1 >= H) { fail('coarse-bounds'); return; }
    // 5 垫界（cs:270-273）
    if (ax < 5 || ax + 2 > W - 5 || ay - 1 < 5 || ay + 1 > H - 5) { fail('margin-bounds'); return; }
    // CanPlace 尾部 RandomStyleRange 掷（cs:792；AlternatesCount=0 ⇒ 每次恰 1 掷）
    { const gg = globalThis as { __swLeaf?: string | null }; gg.__swLeaf = 'cp485'; try { rng.int(0, 3); } finally { gg.__swLeaf = null; } }
    for (let k = 0; k < 2; k++) {
      for (let l = 0; l < 2; l++) {
        if (avBlocksAt(ax + k, ay - 1 + l)) { fail(`free(${ax + k},${ay - 1 + l})`); return; }
        if (!avLiquidPlace(ax + k, ay - 1 + l)) { fail(`lava(${ax + k},${ay - 1 + l})`); return; }
      }
    }
    if (!solidGenAt(ax, ay + 1)) { fail('botL'); return; }
    if (!solidGenAt(ax + 1, ay + 1)) { fail('botR'); return; }
    for (let k = 0; k < 2; k++) {
      for (let l = 0; l < 2; l++) {
        // ★YYY 批帧轴修正：485 TileObjectData StyleHorizontal=true（TileObjectData.cs
        //   :3511 条目）→ TileObject.Place 的样式偏移落 **frameX**（TileObject.cs
        //   Place：num2=FullWidth*style（StyleHorizontal 分支）、frameY=l*(16+2)）。
        //   曾按竖排样式轴写 frameY=style*36+l*18——8 通道对拍不比帧所以隐身，但
        //   LiquidSim 锚点级联的 CheckSuper（cs:48117）按 frameX/36 解样式列、按
        //   frameY==j*18 校验块帧，样式轴错位会把完好的 485 组误判残片整组误杀。
        //   （样式数值本身两侧仍不同：vanilla=(outer+inner)%4 经 StyleWrapLimit=4
        //   回卷，本仓只写 outer——帧非比对通道，对拍无影响。）
        st.setTileSilent(ax + k, ay - 1 + l, T485, style * 36 + k * 18, l * 18);
      }
    }
    d59({ e: 'p485', x: ax, y: ay, r: 'ok', style });
  };
  for (let wk = -20; wk < hiveW + 20; wk++) {
    for (let wl = -20; wl < hiveH + 20; wl++) {
      const px = desc.combX + wk, py = desc.hiveTop + wl;
      if (px < 5 || px >= W - 5 || py < 5 || py >= H - 5) continue;   // InWorld(,5)
      const i = st.idx(px, py);
      if (!st.flags[i] || st.type[i] !== SANDSTONE) continue;
      // ★IIIII48 REMIX（cs:477-480）：岩层下装饰整格跳过（零掷骰 continue）
      if (gs.seedFlags.remix && py > gs.rockLevel) continue;
      d59({ e: 'av0', x: px, y: py });
      let flag = true;
      for (let n = -1; n >= -3; n--) {
        const y = py + n;
        if (y >= 0 && ((inW(px, y) && st.flags[st.idx(px, y)]) || (inW(px + 1, y) && st.flags[st.idx(px + 1, y)]))) { flag = false; break; }
      }
      let flag2 = true;
      for (let m = 1; m <= 3; m++) {
        const y = py + m;
        if (y < H && ((inW(px, y) && st.flags[st.idx(px, y)]) || (inW(px + 1, y) && st.flags[st.idx(px + 1, y)]))) { flag2 = false; break; }
      }
      d59({ e: 'avf', x: px, y: py, f1: flag ? 1 : 0, f2: flag2 ? 1 : 0 });
      const vlog56 = (o: Record<string, unknown>) => {
        (globalThis as { __swD56v?: (o: Record<string, unknown>) => void }).__swD56v?.(o);
      };
      let br = 'none', ok = false;
      const tg = (t: string) => {
        const gg = globalThis as { __swLeaf?: string | null };
        return { int: (a: number, b: number) => { gg.__swLeaf = t; try { return rng.int(a, b); } finally { gg.__swLeaf = null; } } };
      };
      if (flag && tg('av_g20').int(0, 19) === 0) {      // Next(20)==0 → 485/751
        const style = tg('av_st4').int(0, 3);           // style = Next(4)
        if (tg('av_g30').int(0, 29) === 0) { br = '751'; ok = true; place2x2(px, py - 1, T751, 0); }   // Next(30)==0 → 751
        else { br = '485'; vlog56({ e: 'p485-pre', x: px, y: py }); ok = true; place485(px, py - 1, style); }   // 485：PlaceObject 链
      } else if (flag && tg('av_g484').int(0, 4) === 0) {          // 484
        br = '484'; place2x2(px, py - 1, T484, 0);
      } else if ((flag !== flag2) && tg('av_g165').int(0, 4) === 0) {
        // 165 冰凌（DesertHive.cs:491 → WorldGen.PlaceTile(165) → PlaceTight）：
        // placeTight（ShimmerPass 1:1）按邻接材质分派（396/397 → 沙岩列 378+var*18），
        // 帧序倒挂 0/18、地面 36/54、单格 72/90（地面形顶格列=x 勿偏）。
        // 锚点 = py+(flag?-1:+1)（:491）
        br = '165';
        // ★IIIII179：vanilla 此处走 PlaceTile(px,py±1,165,forced)（DesertHive.cs:498）
        //   →受理序预清（cs:59966）后才派发 case165→PlaceTight。ShimmerPass.placeTight
        //   本体另有四处 vanilla **直呼 PlaceTight** 点（cs:35384/35388 shimmer、
        //   22282-22309 宝石树、3688 蛛网 spiders、20180）不经过 PlaceTile 序言,故预清
        //   挂沙漠调用位而非 helper 入口（否则 shimmer/宝石/蛛网域过度移植）。
        placeTilePrologueClear(st, px, py + (flag ? -1 : 1));
        placeTight(st, rng, px, py + (flag ? -1 : 1));
      } else if (flag && tg('av_g187').int(0, 4) === 0) {          // 187：style 29+Next(6)
        br = '187';
        if (place3x2(px, py - 1, T187, 29 + tg('av_st6').int(0, 5))) check3x2Kill187(px, py - 1);
      }
      vlog56({ e: 'anchor', x: px, y: py, f1: flag ? 1 : 0, f2: flag2 ? 1 : 0, br });
    }
  }

  mark56('variance-end/cleanup-begin');
  // ---- CleanupArea（DesertBiome.cs:55-71）：Hive±20 逐格 SquareWallFrame + TileFrame。
  // TileFrame 生成期零掷（TileFrameCosmetic 被 !generatingWorld 门拦;TileFrameImportant
  // 仅 178/苔藓/仙人掌三支掷 genRand——沙漠区无涉）;SquareWallFrame 的掷骰必须还原。
  {
    const cl = desc.combX - 20, cr = desc.combX + desc.combW + 20;
    const ct = desc.hiveTop - 20, cb = desc.hiveTop + desc.hiveH + 20;
    for (let i = cl; i < cr; i++) {
      for (let j = ct; j < cb; j++) {
        if (i > 0 && i < W - 1 && j > 0 && j < H - 1) squareWallFrameDraw(st, rng, i, j);
      }
    }
  }

  mark56('cleanup-end');
  // ExportDescriptionToEngine（DesertBiome.cs:54-58）：CombinedArea.Inflate(10,10)。
  // 原版在 Place 内、CleanupArea 之前落盘——Mushroom(#20) 等后续 pass 的
  // UndergroundDesertLocation 避让依赖它（曾只在 runDesertPass 包装里设置，
  // caves-checkpoint 拆分调用时恒 null → 蘑菇采样环与 oracle 分叉）
  gs.undergroundDesert = {
    x0: Math.max(0, desc.combX - 10), y0: Math.max(0, desc.combY - 10),
    x1: Math.min(st.w, desc.combX + desc.combW + 10),
    y1: Math.min(st.h, desc.combY + desc.combH + 10),
  };
  // UndergroundDesertHiveLocation = description.Hive(DesertBiome.cs:52)——追加小屋段
  //   采样矩形(Hive=(origin.X, origin.Y+num7, num4, num5-num7)),与 Inflate 后的
  //   CombinedArea 是两个矩形,不得混用(house40 追加屋位漂根因)
  gs.undergroundDesertHive = {
    x0: Math.max(0, desc.combX), y0: Math.max(0, desc.hiveTop),
    x1: Math.min(st.w, desc.combX + desc.combW),
    y1: Math.min(st.h, desc.hiveTop + desc.hiveH),
  };
}

export function runDesertPass(st: TileStore, rng: RNG, gs: GenState,
  gp?: import('../GenProgress').GenProgress): void {
  // ★cs:12537 `Main.tileSolid[484] = false` 翻转已移入 runDesertMoundOnly 首句
  //   （caves-checkpoint 拆分调用路径同样需要，且 pass 头语义本就在 mound 循环前）。
  // DesertBiome(12532) 是单个 GenPass——mound/entrance/hive 三个检查点是其内部段，
  // 只在 pass 头（runDesertMoundOnly 头）重播一次，不中间重播。
  const desc = runDesertMoundOnly(st, rng, gs);
  gp?.set(0.45);   // 进度锚：mound 段结束（包内估计）
  mark56('mound-end');
  runDesertEntrancesAndHive(st, rng, gs, desc);
  // gs.undergroundDesert 已随 runDesertEntrancesAndHive 落盘（见其尾部）
  // ★IIIII48 REMIX 尾段（1458 cs:12575-12590）：remix 世界在 Hive/CleanupArea 后、
  //   pass 收尾处把「裸露沙岩柱」顶部翻成沙——逐列 Next(-1,2) 取起始行（消耗恒
  //   1 骰/列），行内命中 396/397/53 且上方非实心时再掷 Next(4,7)，向下把连续
  //   396/397 带翻成 53。surfaceIsDesertSwapDesertAndSnowBiomes 组合种子不触。
  gp?.set(0.95);   // 进度锚：入口+蚁穴+清理结束
  mark56('tail-begin');
  if (!!gs.seedFlags.remix && !gs.seedFlags.surfaceIsDesert) {
    const SAND = TILE_BY_KEY['sand']!;
    const SS = idsByVanillaSheet(396, 397);
    const isSandFam = (ti: number) => st.type[ti] === SAND || SS.has(st.type[ti]);
    const solidAt = (x2: number, y2: number): boolean => {
      if (y2 < 0 || y2 >= st.h) return false;
      const t2i = st.idx(x2, y2);
      return !!st.flags[t2i] && genSolidType(st.type[t2i]) && !st.half[t2i] && st.slope[t2i] === 0;
    };
    for (let i = 50; i < st.w - 50; i++) {
      let j = gs.rockLevel + rng.int(-1, 1);        // for-init：(int)Main.rockLayer + Next(-1,2)（每列一次）
      for (; j < st.h - 50; j++) {
        const ti = st.idx(i, j);
        // 条件三元组：active(j) ∧ t[j]∈{396,397,53} ∧ 上格非实心
        if (st.flags[ti] && isSandFam(ti) && !solidAt(i, j - 1)) {
          // ★IIIII54 定罪修（cs:12585-12588）：Next(4,7) 在 **for 条件**里——每次条件
          //   求值都掷一骰（含命中后每一轮迭代与失败轮），不是「命中行掷一次」。
          //   旧写法整段少耗骰且带宽不同 → 深域沙↔沙岩边界族 T53>396/T396>53。
          //   短路序：k<j+Roll() → active(k+1) → t[k]∈{396,397}（cs 逐项）。
          let k = j;
          for (;;) {
            const bound = j + rng.int(4, 6);        // Next(4,7)：每轮条件求值先掷
            if (k >= bound) break;
            if (k + 1 >= st.h) break;
            const ki = st.idx(i, k);
            const nk = st.idx(i, k + 1);
            if (!st.flags[nk]) break;
            if (!SS.has(st.type[ki])) break;
            st.type[ki] = SAND;
            k++;
          }
        }
      }
    }
  }
  mark56('tail-end');
}

