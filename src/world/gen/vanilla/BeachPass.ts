// 原版 pass 3 "Ocean Sand"(L4962) + pass 33 "Beaches"(L6639) 移植。
// Ocean Sand:海滩区地表按深度随机走铺沙(50-200),顺手记录金字塔候选;
// Beaches:从海滩边缘挖出斜坡海盆( TuneOceanDepth 深度曲线),灌水,清墙,盆底铺沙。
// 原版固定 tile 常量按 4200 宽设计,此处按 w/4200 线性缩放保持比例(大世界 = 精确原版)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T } from '../../../data/tiles';

/** Ocean Sand:海滩铺沙 + 金字塔候选(L4962-5042) */
export function runOceanSandPass(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w;
  for (let i = 0; i < 3; i++) {
    // 拒绝采样:中部 40%-60% 区间的起点重掷(原版 while 循环)
    let x0 = rng.int(0, w - 1);
    while (x0 > w * 0.40 && x0 < w * 0.60) x0 = rng.int(0, w - 1);
    let left = rng.int(35, 89);
    if (i === 1) left += Math.floor(rng.int(20, 39) * (w / 4200));
    if (rng.next() * 3 < 1) left *= 2;
    if (i === 1) left *= 2;
    let right = rng.int(35, 89);
    if (rng.next() * 3 < 1) right *= 2;
    if (i === 1) right *= 2;
    let x1 = x0 - left, x2 = x0 + right;
    if (x1 < 0) x1 = 0;
    if (x2 > w) x2 = w;
    if (i === 1) continue; // 中段跳过(原版 case 1: continue)
    if (i === 0) { x1 = 0; x2 = gs.beachLeftEnd; }
    if (i === 2) { x1 = gs.beachRightStart; x2 = w; }
    // 沙层厚度随机走(50-200)
    let depth = rng.int(50, 99);
    for (let x = x1; x < x2; x++) {
      if (rng.next() < 0.5) {
        depth += rng.int(-1, 1);
        if (depth < 50) depth = 50;
        if (depth > 200) depth = 200;
      }
      // 列深度上界（cs:11682）：double 比较 (wS+rockLayer)/2.0，奇和时多扫一行
      const depthScan = (gs.worldSurface + gs.rockLevel) / 2;
      for (let y = 0; y < depthScan; y++) {
        const ii = st.idx(x, y);
        if (!st.flags[ii]) continue;
        // 中点列金字塔候选（cs:11685-11691）：Next(6)==0 时登记 PyrX/PyrY
        //（此前缺失→每侧少 1 颗骰 + 海洋金字塔候选丢失=流错位+内容缺）
        if (x === Math.trunc((x1 + x2) / 2) && rng.nextIntRange(0, 6) === 0) {
          gs.pyramidSpots.push({ x, y });
        }
        const edge = Math.min(depth, x - x1, x2 - x);
        const thick = edge + rng.int(0, 4);
        for (let y2 = y; y2 < y + thick && y2 < st.h; y2++) {
          const jj = st.idx(x, y2);
          if (x > x1 + rng.int(0, 4) && x < x2 - rng.int(0, 4)) {
            st.type[jj] = T.SAND;
          }
        }
        break;
      }
    }
  }
}

/** TuneOceanDepth(L11682):逐列深度增量曲线,阈值按世界宽度比例缩放 */
function tuneOceanDepth(rng: RNG, count: number, depth: number, van: number, floridaStyle: boolean): number {
  const inc = (f: number) => depth + rng.int(10, 19) * f;
  const t = (n: number) => Math.max(1, Math.floor(n * van));
  if (!floridaStyle) {
    if (count < t(3)) return inc(0.2);
    if (count < t(6)) return inc(0.15);
    if (count < t(9)) return inc(0.1);
    if (count < t(15)) return inc(0.07);
    if (count < t(50)) return inc(0.05);
    if (count < t(75)) return inc(0.04);
    if (count < t(100)) return inc(0.03);
    if (count < t(125)) return inc(0.02);
    if (count < t(150)) return inc(0.01);
    if (count < t(175)) return inc(0.005);
    if (count < t(200)) return inc(0.001);
    if (count < t(230)) return inc(0.01);
    if (count < t(235)) return inc(0.05);
    if (count < t(240)) return inc(0.1);
    if (count < t(245)) return inc(0.05);
    if (count < t(255)) return inc(0.01);
    return depth;
  }
  // florida 变体:同阈值曲线,近岸增量极小、远岸陡增(L11719-11748)
  if (count < t(3)) return inc(0.001);
  if (count < t(6)) return inc(0.002);
  if (count < t(9)) return inc(0.004);
  if (count < t(15)) return inc(0.007);
  if (count < t(50)) return inc(0.01);
  if (count < t(75)) return inc(0.014);
  if (count < t(100)) return inc(0.019);
  if (count < t(125)) return inc(0.027);
  if (count < t(150)) return inc(0.038);
  if (count < t(175)) return inc(0.052);
  if (count < t(200)) return inc(0.08);
  if (count < t(230)) return inc(0.12);
  if (count < t(235)) return inc(0.16);
  if (count < t(240)) return inc(0.27);
  if (count < t(245)) return inc(0.43);
  if (count < t(255)) return inc(0.6);
  return depth;
}

/** Beaches:挖海盆灌水(L6639-6728) */
export function runBeachesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w;
  const van = w / 4200;
  const sc = (n: number) => Math.max(1, Math.floor(n * van)); // C# (int) 截断
  const oceanWaterMin = sc(220), oceanWaterMax = sc(260), forcedJungleLen = sc(275), minSand = sc(50);
  const edgeWall = Math.max(4, Math.floor(30 * van));

  let floridaL = false, floridaR = false;
  const f1 = rng.next();
  if (f1 < 0.25) {
    if (rng.next() < 0.5) floridaL = true; else floridaR = true;
  }
  console.log(`JSBH f1=${f1} fl=${floridaL} fr=${floridaR} peek=${rng.vanilla.peek()}`);

  for (let side = 0; side < 2; side++) {
    if (side === 0) {
      // 左海盆:从 beachLeftEnd-50 之左往世界缘挖
      let waterX = rng.int(oceanWaterMin, oceanWaterMax - 1);  // 原版 Next(220,260) 上界开
      console.log(`JSBW waterX=${waterX} dSide=${gs.dungeonSide} cap=${gs.beachLeftEnd - minSand}`);
      if (gs.dungeonSide === 1) waterX = forcedJungleLen; // 丛林侧强制 275(缩放)
      const cap = gs.beachLeftEnd - minSand;
      if (waterX > cap) waterX = Math.max(2, cap);
      // 该列地表
      let surfY = 0;
      while (!st.flags[st.idx(waterX - 1, surfY)]) surfY++;
      const waterY = surfY + rng.int(1, 4);
      let count = 0, depth = 1;
      for (let x = waterX - 1; x >= 0; x--) {
        if (x > edgeWall) {
          count++; depth = tuneOceanDepth(rng, count, depth, van, floridaL);
          if (side === 0 && x >= 140 && x <= 240) console.log(`JSB3 x=${x} c=${count} d=${depth}`);
        } else depth += 1;
        const pad = rng.int(15, 19);
        const yEnd = waterY + depth + pad;
        for (let y = 0; y < yEnd && y < st.h; y++) {
          const i = st.idx(x, y);
          if (y < waterY + depth * 0.75 - 3) {
            st.flags[i] = 0; st.type[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0;
            if (y > waterY) { st.liquid[i] = 255; st.liquidType[i] = 1; }
            else if (y === waterY) { st.liquid[i] = 127; st.liquidType[i] = 1; }
          } else if (y > waterY) {
            st.type[i] = T.SAND; st.flags[i] = 1;
          }
          st.wall[i] = 0;
        }
      }
    } else {
      // 右海盆:镜像
      let waterX = w - rng.int(oceanWaterMin, oceanWaterMax - 1);  // 上界开,同原版 Next
      if (gs.dungeonSide === -1) waterX = w - forcedJungleLen;
      const cap = gs.beachRightStart + minSand;
      if (waterX < cap) waterX = Math.min(w - 2, cap);
      let surfY = 0;
      while (!st.flags[st.idx(waterX, surfY)]) surfY++;
      const waterY = surfY + rng.int(1, 4);
      let count = 0, depth = 1;
      for (let x = waterX; x < w; x++) {
        if (x < w - edgeWall) { count++; depth = tuneOceanDepth(rng, count, depth, van, floridaR); }
        else depth += 1;
        const pad = rng.int(15, 19);
        const yEnd = waterY + depth + pad;
        for (let y = 0; y < yEnd && y < st.h; y++) {
          const i = st.idx(x, y);
          if (y < waterY + depth * 0.75 - 3) {
            st.flags[i] = 0; st.type[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0;
            if (y > waterY) { st.liquid[i] = 255; st.liquidType[i] = 1; }
            else if (y === waterY) { st.liquid[i] = 127; st.liquidType[i] = 1; }
          } else if (y > waterY) {
            st.type[i] = T.SAND; st.flags[i] = 1;
          }
          st.wall[i] = 0;
        }
      }
    }
  }
}

// ---- 原版 ShellPiles pass（WorldGen.cs:16385-16450 + ShellPile L10307-10420）----
// 每侧 50% 概率，最多 6 堆；ShellPile：沙面上椭圆随机漂移填 tile 495（贝壳堆块），
// 下方悬空时补 495→沙 53→硬化沙 397（原版 10350-10403 逐层下探）
import { TILE_BY_KEY } from '../../../data/tiles';

function shellPile(st: TileStore, rng: RNG, X: number, Y: number, worldSurface: number): boolean {
  if (X < 1 || Y < 1 || X >= st.w - 1 || Y >= st.h - 1) return false;
  let y = Y;
  while (y < st.h && !st.flags[st.idx(X, y)]) y++;
  if (y > worldSurface || y >= st.h) return false;          // 原版：仅地表内（海盆深度容差已放宽）
  if (st.type[st.idx(X, y)] !== T.SAND) return false;       // 必须沙面
  if (st.wall[st.idx(X, y)] !== 0) return false;            // 无背景墙
  y--;
  const SHELL = TILE_BY_KEY['v_495_shell_pile_block'] ?? 0;
  const HARD_SAND = TILE_BY_KEY['hardened_sand'] ?? 0;
  if (!SHELL) return false;
  let cx = X, cy = y;
  let vx = rng.next() * 0.6 - 0.3, vy = rng.next() * 0.5 + 0.5;
  let radius = rng.int(2, 4);
  if (rng.int(0, 9) === 0) radius += 1;
  let layers = rng.int(3, 6);
  const put = (x: number, yy: number, type: number) => {
    if (!st.inBounds(x, yy)) return;
    const i = st.idx(x, yy);
    st.type[i] = type; st.flags[i] = 1; st.frameX[i] = 0; st.frameY[i] = 0;
  };
  while (layers-- > 0) {
    const r = radius * (0.7 + rng.next() * 0.2);
    for (let x = Math.floor(X - radius * 4); x <= X + radius * 4; x++) {
      for (let yy = y + Math.floor(radius * 4); yy > y - radius * 4; yy--) {
        const dx = (cx - x) * 0.6, dyy = cy - yy;
        if (Math.hypot(dx, dyy) >= r) continue;
        if (yy <= y + 1 || rng.int(0, 5) === 0) {
          put(x, yy, SHELL);
          // 下方悬空补壳/沙/硬化沙（原版 10373-10399 三层下探）
          if (st.inBounds(x, yy + 1) && !st.flags[st.idx(x, yy + 1)]) {
            put(x, yy + 1, SHELL);
            if (st.inBounds(x, yy + 2) && !st.flags[st.idx(x, yy + 2)]) {
              put(x, yy + 2, T.SAND);
              if (st.inBounds(x, yy + 3) && !st.flags[st.idx(x, yy + 3)]) put(x, yy + 3, HARD_SAND);
            }
          }
        } else if (st.type[st.idx(x, yy)] !== SHELL) {
          put(x, yy, T.SAND);
        }
      }
    }
    cx += vx; cy += vy;
    vx = Math.max(-0.3, Math.min(0.3, vx + (rng.next() * 0.2 - 0.1)));
    vy = Math.max(0.5, Math.min(1.0, vy + (rng.next() * 0.2 - 0.1)));
  }
  return true;
}

/** 海滩装饰：贝壳堆 + 海藻（GrowCheckSeaweed 简化 1:1：沙面+上方 4 格全满水才长） */
export function runBeachDecorPass(st: TileStore, rng: RNG, gs: GenState): void {
  const SEAWEED = TILE_BY_KEY['v_549_seaweed'] ?? 0;
  const sides: Array<[number, number, number]> = [
    [1, Math.max(1, gs.beachLeftEnd - 120), gs.beachLeftEnd],
    [-1, gs.beachRightStart, Math.min(st.w - 2, gs.beachRightStart + 120)],
  ];
  for (const [dir, x0, x1] of sides) {
    // 贝壳堆：50% 概率，锚点 = 海滩边界附近沙面（原版 shellStart 扫描近似）
    if (rng.next() < 0.5) {
      const baseX = dir === 1 ? gs.beachLeftEnd - rng.int(0, 5) : gs.beachRightStart + rng.int(0, 5);
      // 全列扫沙面（真实海盆深浅不一，固定窗口会漏锚）
      let by = -1;
      for (let y = 2; y < gs.worldSurface + 120 && y < st.h - 4; y++) {
        if (st.flags[st.idx(baseX, y)] && st.type[st.idx(baseX, y)] === T.SAND) { by = y; break; }
      }
      if (by > 0) {
        const offsets = [0, 10, 40, 70, 100, 25];
        for (const off of offsets) {
          if (off !== 0 && rng.next() >= 0.5) continue; // 原版 Next(maxValue 2..3) 门
          const x = dir === 1 ? baseX - off : baseX + off;
          shellPile(st, rng, x, Math.max(2, by - 50), gs.worldSurface + 120);
        }
      }
    }
    // 海藻：每个海洋列找沙面，上方 4 格全满水 → 2/3 放（原版 GrowCheckSeaweed 深水条件）
    if (SEAWEED) {
      for (let x = x0; x < x1; x++) {
        for (let y = 2; y < st.h - 4; y++) {
          const i = st.idx(x, y);
          if (!st.flags[i] || st.type[i] !== T.SAND) continue;
          const deep = [1, 2, 3, 4].every((d) => st.liquid[st.idx(x, y - d)] === 255 && !st.flags[st.idx(x, y - d)]);
          if (deep && rng.int(0, 2) !== 0) {
            const ai = st.idx(x, y - 1);
            st.type[ai] = SEAWEED; st.flags[ai] = 1; st.frameX[ai] = Math.floor(rng.next() * 3) * 18; st.frameY[ai] = 0;
          }
          break; // 每列只处理首个沙面
        }
      }
    }
  }
}
