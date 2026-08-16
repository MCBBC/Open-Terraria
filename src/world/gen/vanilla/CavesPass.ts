// 原版 pass 8-14 移植（1456 注册序对齐：RocksInDirt 11922 / DirtInRocks 11952 /
// Clay 11985 / DirtLayerCaves 12094 / RockLayerCaves 12135 / SurfaceCaves 12191；
// SmallHoles 12034 已拆到 MissingCavesPass——本文件不再重复执行）。
// 2026-08-11 种子等价重写：DirtLayer/RockLayer 恢复 TileRunner 直呼（原版就是直线
// runner，曾自创 digTunnel 蜿蜒改型=掷骰序列分叉）；Caverer 首掷顺序改回
// 「段数→方向」；首实心行上界用 GenVars raw double；计数一律 (int) 截断。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner, digTunnel } from './TileRunner';

const DIRT = T.DIRT;
const CLAY = TILE_BY_KEY['clay']!;

/** pass 8-10:泥石混合 + 粘土（cs:11922-12033）。三段各自是独立 GenPass
 *  （RocksInDirt 11922 / DirtInRocks 11952 / Clay 11985）——RunPass 每 pass 前重播
 *  种子（WorldGenerator.cs:497），函数头与两处内部边界各 reseed 一次。 */
export function runRocksAndClayPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const area = w * h;
  rng.reseed(gs.seed); // ▶RocksInDirt cs:11922（pass 头）
  const run = (count: number, yMin: number, yMax: number, type: number, sMin: number, sMax: number, stMin: number, stMax: number) => {
    for (let n = 0; n < count; n++) {
      tileRunner(st, rng, gs, rng.int(0, w - 1), rng.int(Math.max(0, Math.floor(yMin)), Math.min(h - 1, Math.floor(yMax))), {
        strength: rng.int(sMin, sMax), steps: rng.int(stMin, stMax), type,
      });
    }
  };
  // Rocks In Dirt（cs:11922）：三档密度带，石嵌泥
  run(area * 0.00015, 0, gs.worldSurfaceLow, T.STONE, 4, 14, 5, 39);
  for (let n = 0; n < area * 0.0002; n++) { // 中带:起点上方 10 格须为实心否则重掷一次
    const i = rng.int(0, w - 1);
    let j = rng.int(gs.worldSurfaceLow, gs.worldSurfaceHigh);
    if (!st.flags[st.idx(i, Math.max(0, j - 10))]) j = rng.int(gs.worldSurfaceLow, gs.worldSurfaceHigh);
    tileRunner(st, rng, gs, i, j, { strength: rng.int(4, 9), steps: rng.int(5, 29), type: T.STONE });
  }
  run(area * 0.0045, gs.worldSurfaceHigh, gs.rockLevelHigh, T.STONE, 2, 6, 2, 22);
  rng.reseed(gs.seed); // ▶DirtInRocks cs:11952（内部 pass 边界）
  // Dirt In Rocks（cs:11952）：泥嵌石
  run(area * 0.005, gs.rockLevelLow, h, DIRT, 2, 5, 2, 39);
  // Clay（cs:11985）：三带 + 表层粘土清除。
  // ★计数 (int) 截断（cs:11990/11997/12009）：area*2e-5=100.8 → 100 次，
  //  此前浮点上界多跑 1 发 runner → 其后 RNG 流永久漂移
  rng.reseed(gs.seed); // ▶Clay cs:11985（内部 pass 边界）
  run(Math.trunc(area * 0.00002), 0, gs.worldSurfaceLow - 1, CLAY, 4, 13, 10, 49);
  run(Math.trunc(area * 0.00005), gs.worldSurfaceLow, gs.worldSurfaceHigh, CLAY, 8, 13, 15, 44);
  run(Math.trunc(area * 0.00002), gs.worldSurfaceHigh, gs.rockLevelHigh, CLAY, 8, 14, 5, 49);
  // 表层粘土清除（cs:12023-12025）：type=0（原版 0=泥土）保持 active——转泥而非挖空
  for (let x = 5; x < w - 5; x++) {
    for (let y = 1; y < gs.worldSurface - 1; y++) {
      if (!st.flags[st.idx(x, y)]) continue;
      for (let y2 = y; y2 < y + 5; y2++) {
        if (y2 < h && st.get(x, y2) === CLAY) st.type[st.idx(x, y2)] = DIRT;
      }
      break;
    }
  }
}

/** pass 12-14:洞穴（DirtLayer/RockLayer/Surface；SmallHoles 已在 MissingCavesPass）。
 *  三段各自是独立 GenPass（12094/12135/12191）——RunPass 每 pass 前重播种子，
 *  函数头与两处内部边界各 reseed 一次。 */
export function runCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const area = w * h;
  const avoidBeach = 340; // smallHolesBeachAvoidance = beachSandRandomCenter(320)+20
  rng.reseed(gs.seed); // ▶DirtLayerCaves cs:12094（pass 头）
  // Dirt Layer Caves（cs:12094-12134）：(int)(area*3e-5) 次；拒绝判定第一子句用
  // GenVars.worldSurfaceHigh raw double；中部 45-55% 为闭区间 >= <=
  {
    const num = Math.trunc(area * 0.00003);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(6) === 0 ? -2 : -1;
      let num2 = rng.nextIntRange(0, w);
      let num3 = rng.nextIntRange(gs.worldSurfaceLow, gs.rockLevelHigh + 1);
      while (((num2 < avoidBeach || num2 > w - avoidBeach) && num3 < gs.genWorldSurfaceHigh)
        || (num2 >= w * 0.45 && num2 <= w * 0.55 && num3 < gs.worldSurface)) {
        num2 = rng.nextIntRange(0, w);
        num3 = rng.nextIntRange(gs.worldSurfaceLow, gs.rockLevelHigh + 1);
      }
      const num4 = rng.nextIntRange(5, 15);
      const num5 = rng.nextIntRange(30, 200);
      tileRunner(st, rng, gs, num2, num3, { strength: num4, steps: num5, type });
    }
  }
  // Rock Layer Caves（cs:12135-12165）：掷序 type→strength→steps→x→y（曾错位+改 digTunnel）
  rng.reseed(gs.seed); // ▶RockLayerCaves cs:12135（内部 pass 边界）
  {
    const num = Math.trunc(area * 0.00013);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(10) === 0 ? -2 : -1;
      const num2 = rng.nextIntRange(6, 20);
      const num3 = rng.nextIntRange(50, 300);
      tileRunner(st, rng, gs, rng.nextIntRange(0, w), rng.nextIntRange(gs.rockLevelHigh, h), {
        strength: num2, steps: num3, type,
      });
    }
  }
  // Surface Caves（cs:12191-12300）：五组地表入口
  rng.reseed(gs.seed); // ▶SurfaceCaves cs:12191（内部 pass 边界）
  const beachL = gs.beachLeftEnd + 20, beachR = gs.beachRightStart - 20;
  /** 14a-14d 骨架：拒绝采样（无界 while）+ 首实心行（上界 GenVars.worldSurfaceHigh
   *  raw double；找不到则整轮跳过不掷 runner 骰——原版 for-break 语义） */
  const surfaceCave = (count: number, lo: number, hi: number, runners: Array<(x: number, y: number) => void>) => {
    for (let n = 0; n < count; n++) {
      let x = rng.nextIntRange(0, w);
      while ((x > w * lo && x < w * hi) || x < beachL || x > beachR) x = rng.nextIntRange(0, w);
      let sy = -1;
      for (let y = 0; y < gs.genWorldSurfaceHigh && y < h; y++) {
        if (st.flags[st.idx(x, y)]) { sy = y; break; }
      }
      if (sy < 0) continue;
      for (const r of runners) r(x, sy);
    }
  };
  // 14a 细入口（cs:12205-12218）
  surfaceCave(Math.trunc(w * 0.002), 0.45, 0.55, [(x, y) => {
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(3, 6), steps: rng.nextIntRange(5, 50), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 1 });
  }]);
  // 14b 中入口（cs:12227-12238）
  surfaceCave(Math.trunc(w * 0.0007), 0.43, 0.57, [(x, y) => {
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(10, 15), steps: rng.nextIntRange(50, 130), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 2 });
  }]);
  // 14c 大竖井三连（cs:12241-12261）
  surfaceCave(Math.trunc(w * 0.0003), 0.40, 0.60, [(x, y) => {
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(12, 25), steps: rng.nextIntRange(150, 500), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 4 });
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(8, 17), steps: rng.nextIntRange(60, 200), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 2 });
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(5, 13), steps: rng.nextIntRange(40, 170), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 2 });
  }]);
  // 14d noYChange 入口（cs:12266-12280）：speedX=0 不掷覆写判定外的额外骰
  surfaceCave(Math.trunc(w * 0.0004), 0.40, 0.60, [(x, y) => {
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(7, 12), steps: rng.nextIntRange(150, 250), type: -1, speedY: 1, noYChange: true });
  }]);
  // 14e Caverer 大洞穴系统（cs:12284-12299）：(int)(5*(w/4200)) 个；
  // y 上界 h-400，退化时 rockLayer 取 h-401（cs:12287-12292）
  const cavCount = Math.trunc(5 * (w / 4200));
  let yLo = gs.rockLevel;
  const yHi = h - 400;
  if (yLo >= yHi) yLo = yHi - 1;
  for (let n = 0; n < cavCount; n++) {
    caverer(st, rng, gs, rng.nextIntRange(340, w - 340), rng.nextIntRange(yLo, yHi));
  }
}

/** Caverer（cs:79642-79751）1:1：模式 0 = 主隧道+粗支洞，模式 1 = 长细链。
 *  ★首掷顺序：mode(Next 2) → 段数 → 方向（曾方向先于段数=第 2 个样本起流错位） */
function caverer(st: TileStore, rng: RNG, gs: GenState, X: number, Y: number): void {
  const randDir = () => {
    let dx = rng.nextIntRange(0, 100) * 0.01;
    let dy = 1 - dx;
    if (rng.nextIntRange(0, 2) === 0) dx = -dx;
    if (rng.nextIntRange(0, 2) === 0) dy = -dy;
    return [dx, dy] as [number, number];
  };
  if (rng.nextIntRange(0, 2) === 0) {
    // 模式 0:先段数 Next(7,9)，再方向 3 掷
    let px = X + 0.0, py = Y + 0.0;
    const segs = rng.nextIntRange(7, 9);
    let [dx, dy] = randDir();
    for (let k = 0; k < segs; k++) {
      [px, py] = digTunnel(st, rng, px, py, dx, dy, rng.nextIntRange(6, 20), rng.nextIntRange(4, 9));
      dx += rng.nextIntRange(-20, 21) * 0.1; dy += rng.nextIntRange(-20, 21) * 0.1;
      dx = Math.max(-1.5, Math.min(1.5, dx));
      dy = Math.max(-1.5, Math.min(1.5, dy));
      const [bx, by] = randDir();
      const [ex, ey] = digTunnel(st, rng, px, py, bx, by, rng.nextIntRange(30, 50), rng.nextIntRange(3, 6));
      tileRunner(st, rng, gs, Math.trunc(ex), Math.trunc(ey), {
        strength: rng.nextIntRange(10, 20), steps: rng.nextIntRange(5, 10), type: -1,
      });
    }
  } else {
    // 模式 1:先段数 Next(15,30)，再方向 3 掷
    let px = X + 0.0, py = Y + 0.0;
    const segs = rng.nextIntRange(15, 30);
    let [dx, dy] = randDir();
    for (let k = 0; k < segs; k++) {
      [px, py] = digTunnel(st, rng, px, py, dx, dy, rng.nextIntRange(5, 15), rng.nextIntRange(2, 6), true);
      dx += rng.nextIntRange(-20, 21) * 0.1; dy += rng.nextIntRange(-20, 21) * 0.1;
      dx = Math.max(-1.5, Math.min(1.5, dx));
      dy = Math.max(-1.5, Math.min(1.5, dy));
    }
  }
}
