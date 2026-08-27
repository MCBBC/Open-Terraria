// 洞穴段缺失 pass 补齐（2026-08-11 种子等价 L1；1456 注册序：
// OceanSand(11603) → SandPatches(11712) → Tunnels(11743) → MountainCaves(11809)
// → DirtWallBackgrounds(11883) → RocksInDirt…Clay → SmallHoles(12034) → 洞穴系）。
// WavyCaves(12301) 仅饥荒世界启用（普通世界零掷骰跳过）——不移植。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { tileRunner } from './TileRunner';
import { T } from '../../../data/tiles';

/** SandPatches（cs:11712-11737）：地下沙团（tile 53）。中心避开出生点 ±4-6% 且
 *  y < worldSurface+150 的浅层（拒绝采样）——沙漠雏形之一。 */
export function runSandPatchesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w } = st;
  const num = Math.trunc(w * 0.013); // 4200 → 54
  for (let i = 0; i < num; i++) {
    let num2 = rng.nextIntRange(0, w);
    let num3 = rng.nextIntRange(gs.worldSurface, gs.rockLevel); // (int)Main.worldSurface/rockLayer
    while (num2 > w * 0.46 && num2 < w * 0.54 && num3 < gs.worldSurface + 150) {
      num2 = rng.nextIntRange(0, w);
      num3 = rng.nextIntRange(gs.worldSurface, gs.rockLevel);
    }
    const num4 = rng.nextIntRange(15, 70);
    const steps = rng.nextIntRange(20, 130);
    // ★type 是本仓库内部 id（原版 53 沙 = T.SAND；曾直传 53 = 内部表恰好沙漠化石!）
    tileRunner(st, rng, gs, num2, num3, { strength: num4, steps, type: T.SAND });
  }
}

/** Tunnels（cs:11745-11808）：地表隧道——10 列锚点列扫描到地表，向上抬 11-15 格
 *  后双向 dirt runner 填充（type 0 + addTile）。array[5] 记入 GenVars.tunnelX。 */
export function runTunnelsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w } = st;
  const maxTunnels = 50; // GenVars.maxTunnels（cs:232）
  const num = Math.trunc(w * 0.0015); // 4200 → 6
  for (let i = 0; i < num; i++) {
    if (gs.numTunnels >= maxTunnels - 1) break;
    const array = new Array<number>(10);
    const array2 = new Array<number>(10);
    let num2 = rng.nextIntRange(450, w - 450);
    // 避开中部 40%-60%（出生点带）
    // ★SSS-CELEB（1458 cs:11779-11786）：tenth&&!remix → 单掷改走 [0.2w,0.8w)
    //   带无拒绝环（Next((int)(w*0.2), (int)(w*0.8))，**流位=替换而非追加**：
    //   vanilla 是 if/else 二选一，非先掷后覆写）
    const celbTun = !!gs.seedFlags?.tenthAnniversary && !gs.seedFlags?.remix;
    if (celbTun) num2 = rng.nextIntRange(Math.trunc(w * 0.2), Math.trunc(w * 0.8));
    else while (num2 > w * 0.4 && num2 < w * 0.6) num2 = rng.nextIntRange(450, w - 450);
    let j = 0;
    let flag: boolean;
    do {
      flag = false;
      for (let k = 0; k < 10; k++) {
        num2 %= w;
        while (!st.flags[st.idx(num2, j)]) j++; // 列扫描到首个实心格
        if (st.type[st.idx(num2, j)] === T.SAND) flag = true; // 锚在沙上 → 整组重掷（原版 id 53=沙;内部 53 恰是沙漠化石,曾直传 53 致重掷永假）
        array[k] = num2;
        array2[k] = j - rng.nextIntRange(11, 16);
        num2 += rng.nextIntRange(5, 11);
      }
    } while (flag);
    gs.tunnelX[gs.numTunnels] = array[5];
    gs.numTunnels++;
    for (let l = 0; l < 10; l++) {
      // 原版 type 0 = 泥土 = 本仓库 T.DIRT（内部 0 是空气!）
      tileRunner(st, rng, gs, array[l], array2[l], {
        strength: rng.nextIntRange(5, 8), steps: rng.nextIntRange(6, 9), type: T.DIRT,
        addTile: true, speedX: -2, speedY: -0.3,
      });
      tileRunner(st, rng, gs, array[l], array2[l], {
        strength: rng.nextIntRange(5, 8), steps: rng.nextIntRange(6, 9), type: T.DIRT,
        addTile: true, speedX: 2, speedY: -0.3,
      });
    }
  }
}

/** DirtWallBackgrounds（cs:11883-11921）：地表自然墙（wall 2 泥墙；147 雪面 → 40 冰墙）。
 *  每列一个 Next(-1,2) 随机游走定墙深（worldSurface+0..10）；从"六邻实心"首格向下刷墙。 */
export function runDirtWallBgPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w } = st;
  const wallTarget = (t: number) => (t !== T.SNOW ? 2 : 40); // 原版 147=雪→冰墙 40;内部 147 是熔岩滴,曾直传原版 id
  let num = 0;
  for (let i = 1; i < w - 1; i++) {
    let wall = 2;
    num += rng.nextIntRange(-1, 2);
    if (num < 0) num = 0;
    if (num > 10) num = 10;
    let flag = false;
    // j < worldSurface+10 && !(j > worldSurface+num)（double 比较，逐格）
    for (let j = 0; j < gs.worldSurface + 10 && !(j > gs.worldSurface + num); j++) {
      const ii = st.idx(i, j);
      if (st.flags[ii]) wall = wallTarget(st.type[ii]);
      if (flag && st.wall[ii] !== 64) st.wall[ii] = wall;
      if (st.flags[ii]
        && st.flags[st.idx(i - 1, j)] && st.flags[st.idx(i + 1, j)]
        && st.flags[st.idx(i, j + 1)] && st.flags[st.idx(i - 1, j + 1)] && st.flags[st.idx(i + 1, j + 1)]) {
        flag = true;
      }
    }
  }
}

/** SmallHoles（cs:12034-12092）：小空洞（每轮 2 发 runner：小挖 2-4×2-19 / 大挖 7-14×6-29，
 *  type -1 普通 / 1/5 挖穿地表 -2）。锚点避海滩浅层与出生点浅层（拒绝采样）。 */
export function runSmallHolesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  // 拒绝判定第一子句用 GenVars.worldSurfaceHigh **raw double**（cs:12062）——
  // floored int 会在 num3==floor(raw) 时判定翻转（每图约十数次）→ 流分叉
  const worldSurfaceHigh = gs.genWorldSurfaceHigh;
  const avoidance = 340; // GenVars.smallHolesBeachAvoidance = beachSandRandomCenter(320)+20
  const total = w * h;
  const num = Math.trunc(total * 0.0015); // 4200×1200 → 7560
  // ★SSS-CELEB（1458 cs:12065-12073）：tenth&&!remix 走"拒绝环"，但其条件是原版
  //   反编译实证的死条件（num2<0.2w **&&** num2>0.8w 恒假）→ 环体零执行=首掷必收。
  //   bug-compat 移植：直接跳过拒绝环，不加自造的 || 表达式（那会改变掷骰流）。
  const celbSkip = !!gs.seedFlags?.tenthAnniversary && !gs.seedFlags?.remix;
  for (let i = 0; i < num; i++) {
    const type = rng.nextInt(5) === 0 ? -2 : -1;
    // 发 1：小挖
    let num2 = rng.nextIntRange(0, w);
    let num3 = rng.nextIntRange(gs.worldSurfaceHigh, h);
    if (!celbSkip) while (((num2 < avoidance || num2 > w - avoidance) && num3 < worldSurfaceHigh)
      || (num2 > w * 0.45 && num2 < w * 0.55 && num3 < gs.genWorldSurface)) {
      num2 = rng.nextIntRange(0, w);
      num3 = rng.nextIntRange(gs.worldSurfaceHigh, h);
    }
    let num4 = rng.nextIntRange(2, 5);
    let num5 = rng.nextIntRange(2, 20);
    tileRunner(st, rng, gs, num2, num3, { strength: num4, steps: num5, type });
    // 发 2：大挖
    num2 = rng.nextIntRange(0, w);
    num3 = rng.nextIntRange(gs.worldSurfaceHigh, h);
    if (!celbSkip) while (((num2 < avoidance || num2 > w - avoidance) && num3 < worldSurfaceHigh)
      || (num2 > w * 0.45 && num2 < w * 0.55 && num3 < gs.genWorldSurface)) {
      num2 = rng.nextIntRange(0, w);
      num3 = rng.nextIntRange(gs.worldSurfaceHigh, h);
    }
    num4 = rng.nextIntRange(8, 15);
    num5 = rng.nextIntRange(7, 30);
    tileRunner(st, rng, gs, num2, num3, { strength: num4, steps: num5, type });
  }
}
