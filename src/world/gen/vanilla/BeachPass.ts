// 原版 pass 3 "Ocean Sand"(L4962) + pass 33 "Beaches"(L6639) 移植。
// Ocean Sand:海滩区地表按深度随机走铺沙(50-200),顺手记录金字塔候选;
// Beaches:从海滩边缘挖出斜坡海盆( TuneOceanDepth 深度曲线),灌水,清墙,盆底铺沙。
// 原版固定 tile 常量(220/260/275/50/30 与深度曲线阈值)按 1456 源码为**宽度无关**固定值。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T } from '../../../data/tiles';
import { genSolidType } from './GenSolid';

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

/** TuneOceanDepth(cs:27104-27249):逐列深度增量曲线。阈值 3/6/9/15/50/75/100/125/
 *  150/175/200/230/235/240/245/255 与增量系数全部**与世界宽度无关**(固定常量)。
 *  曾按 w/4200 缩放阈值(注释还写反成"大世界=精确原版"——恰只有 4200 宽精确) */
function tuneOceanDepth(rng: RNG, count: number, depth: number, floridaStyle: boolean): number {
  const inc = (f: number) => depth + rng.int(10, 19) * f;
  if (!floridaStyle) {
    if (count < 3) return inc(0.2);
    if (count < 6) return inc(0.15);
    if (count < 9) return inc(0.1);
    if (count < 15) return inc(0.07);
    if (count < 50) return inc(0.05);
    if (count < 75) return inc(0.04);
    if (count < 100) return inc(0.03);
    if (count < 125) return inc(0.02);
    if (count < 150) return inc(0.01);
    if (count < 175) return inc(0.005);
    if (count < 200) return inc(0.001);
    if (count < 230) return inc(0.01);
    if (count < 235) return inc(0.05);
    if (count < 240) return inc(0.1);
    if (count < 245) return inc(0.05);
    if (count < 255) return inc(0.01);
    return depth;
  }
  // florida 变体:同阈值曲线,近岸增量极小、远岸陡增(cs:27177-27231)
  if (count < 3) return inc(0.001);
  if (count < 6) return inc(0.002);
  if (count < 9) return inc(0.004);
  if (count < 15) return inc(0.007);
  if (count < 50) return inc(0.01);
  if (count < 75) return inc(0.014);
  if (count < 100) return inc(0.019);
  if (count < 125) return inc(0.027);
  if (count < 150) return inc(0.038);
  if (count < 175) return inc(0.052);
  if (count < 200) return inc(0.08);
  if (count < 230) return inc(0.12);
  if (count < 235) return inc(0.16);
  if (count < 240) return inc(0.27);
  if (count < 245) return inc(0.43);
  if (count < 255) return inc(0.6);
  return depth;
}

/** Beaches:挖海盆灌水(cs:14958-15120)。
 *  海洋固定常量(GenVars.cs 赋值 WorldGen.cs:11211-11213 + cs:14959/14994/15054)
 *  全部**与宽度无关**:220/260/275/50/30——曾按 w/4200 缩放(中/大世界水线/边缘
 *  带/深度曲线全偏) */
export function runBeachesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // 一次性探针钩（同 WebsPass 模式）：Beaches 入口快照（债时间线用）
  const g0 = globalThis as { __swBchCap?: (gs: GenState, st: TileStore) => void };
  try { g0.__swBchCap?.(gs, st); } catch { /* probe */ }
  const w = st.w;
  const oceanWaterMin = 220, oceanWaterMax = 260, forcedJungleLen = 275, minSand = 50;
  const edgeWall = 30;

  let floridaL = false, floridaR = false;
  if (rng.next() < 0.25) {
    if (rng.next() < 0.5) floridaL = true; else floridaR = true;
  }

  for (let side = 0; side < 2; side++) {
    if (side === 0) {
      // 左海盆:从 beachLeftEnd-50 之左往世界缘挖
      let waterX = rng.int(oceanWaterMin, oceanWaterMax - 1);  // 原版 Next(220,260) 上界开
      if (gs.dungeonSide === 1) waterX = forcedJungleLen; // 丛林侧强制 275(缩放)
      const cap = gs.beachLeftEnd - minSand;
      if (waterX > cap) waterX = Math.max(2, cap);
      // 该列地表
      let surfY = 0;
      while (!st.flags[st.idx(waterX - 1, surfY)]) surfY++;
      gs.shellStartYLeft = surfY; // cs:14996：ShellPiles 锚点 Y（waterY 调整前的地表值）
      const waterY = surfY + rng.int(1, 4);
      let count = 0, depth = 1;
      for (let x = waterX - 1; x >= 0; x--) {
        if (x > edgeWall) { count++; depth = tuneOceanDepth(rng, count, depth, floridaL); }
        else depth += 1;
        const pad = rng.int(15, 19);
        // cs:15009:(double)k < j + num6 + num9 —— 纯 double 比较,depth 累积小数
        // 部分几乎恒 >0 → 每列多挖一行(曾 Math.trunc 截断,海盆底每列浅一格)
        for (let y = 0; y < waterY + depth + pad && y < st.h; y++) {
          const i = st.idx(x, y);
          if (y < waterY + depth * 0.75 - 3) {
            // 原版仅 active(false)（cs:15014）——保留 type 幽灵（曾清零，
            // 与 oracle 天空/海盆幽灵分叉 6383 格）
            st.flags[i] = 0;
            if (y > waterY) { st.liquid[i] = 255; st.liquidType[i] = 1; }
            else if (y === waterY) {
              st.liquid[i] = 127; st.liquidType[i] = 1;
              // cs:15025-15027：首个到达水线分支的列 = ShellPiles 锚点 X（仅首次）
              if (gs.shellStartXLeft === 0) gs.shellStartXLeft = x;
            }
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
      gs.shellStartXRight = 0;            // cs:15060：显式清零（左值不串扰，1:1）
      gs.shellStartYRight = surfY;        // cs:15061
      const waterY = surfY + rng.int(1, 4);
      let count = 0, depth = 1;
      for (let x = waterX; x < w; x++) {
        if (x < w - edgeWall) { count++; depth = tuneOceanDepth(rng, count, depth, floridaR); }
        else depth += 1;
        const pad = rng.int(15, 19);
        // cs:15069:(double)k < l + num11 + num9 —— 同左侧纯 double 比较(勿截断)
        for (let y = 0; y < waterY + depth + pad && y < st.h; y++) {
          const i = st.idx(x, y);
          if (y < waterY + depth * 0.75 - 3) {
            // 原版仅 active(false)（cs:15014）——保留 type 幽灵（曾清零，
            // 与 oracle 天空/海盆幽灵分叉 6383 格）
            st.flags[i] = 0;
            if (y > waterY) { st.liquid[i] = 255; st.liquidType[i] = 1; }
            else if (y === waterY) {
              st.liquid[i] = 127; st.liquidType[i] = 1;
              // cs:15090-15092：首个到达水线分支的列 = ShellPiles 锚点 X（仅首次）
              if (gs.shellStartXRight === 0) gs.shellStartXRight = x;
            }
          } else if (y > waterY) {
            st.type[i] = T.SAND; st.flags[i] = 1;
          }
          st.wall[i] = 0;
        }
      }
    }
  }
}

// ---- 原版 ShellPiles pass（WorldGen.cs:16393-16501）+ ShellPile 方法（cs:10307-10420）----
// 每侧 50% 概率；先在 shellStart±20/±10 盒内找"水线接触点"（活性沙 + 上方空且无水 +
// 海侧邻格有水），Y-=50 后以原版偏移区间最多 6 堆；ShellPile：沙面上逐像素
// 椭圆（半径每像素掷 Next(70,91)*0.01）填 tile 495（贝壳堆块），下方悬空逐层补
// 495→沙 53→硬化沙 397（cs:10350-10403）。锚点与深度门均为 worldSurface（地表内）——
// 曾放宽 +120 并自创锚点 = 深水海盆冒出孤立沙堆（2026-08-12 修复）。
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';

/** WorldGen.SolidTile：active && tileSolid（cs:70037 区；生成期无 inActive） */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  // tileSolid 走 GenSolid（本 pass 时点 484 滚动仙人掌 cs:12537 已翻非实心）
  return genSolidType(st.type[i]);
}

/** 原版只写 type/active/halfBrick/slope（cs:10350-10403），不动 frame（后续整帧 pass 刷） */
function putPile(st: TileStore, x: number, y: number, type: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = type; st.flags[i] = 1; st.half[i] = 0; st.slope[i] = 0;
}

function inactive(st: TileStore, x: number, y: number): boolean {
  return !st.inBounds(x, y) || !st.flags[st.idx(x, y)];
}

function shellPile(st: TileStore, rng: RNG, X: number, Y: number, worldSurface: number): boolean {
  if (!st.inBounds(X, Y)) return false;               // InWorld(X,Y)
  let num = Y;
  while (!solidTile(st, X, num)) {
    num++;
    if (num > worldSurface) return false;             // cs:10338：下探过 worldSurface 即弃
  }
  if (st.type[st.idx(X, num)] !== T.SAND) return false;   // 必须沙面
  if (st.wall[st.idx(X, num)] !== 0) return false;        // 无背景墙
  num--;
  const SHELL = TILE_BY_KEY['v_495_shell_pile_block'] ?? 0;
  const HARD_SAND = TILE_BY_KEY['hardened_sand'] ?? 0;
  if (!SHELL) return false;
  let cx = X, cy = num;
  let vx = rng.next() * 0.6 - 0.3, vy = rng.next() * 0.5 + 0.5;
  let radius = rng.int(2, 3);                         // Next(2,4)
  if (rng.int(0, 9) === 0) radius += 1;               // Next(10)==0
  let layers = rng.int(3, 5);                         // Next(3,6)
  while (layers-- > 0) {
    for (let i = X - radius * 4; i <= X + radius * 4; i++) {
      for (let num4 = num + radius * 4; num4 > num - radius * 4; num4--) {
        // cs:10358：每像素掷一次半径抖动（Next(70,91) 上界开）
        const r = radius * rng.int(70, 90) * 0.01;
        const dx = (cx - i) * 0.6, dy = cy - num4;    // Vector2D.X 分量 ×0.6
        if (Math.sqrt(dx * dx + dy * dy) >= r) continue;
        if (num4 <= num + 1 || rng.int(0, 5) === 0) { // Next(6)==0
          putPile(st, i, num4, SHELL);
          // 下方悬空补壳/沙/硬化沙（cs:10363-10399 三层下探，条件仅看 active）
          if (inactive(st, i, num4 + 1)) {
            putPile(st, i, num4 + 1, SHELL);
            if (inactive(st, i, num4 + 2)) {
              putPile(st, i, num4 + 2, T.SAND);
              if (inactive(st, i, num4 + 3)) putPile(st, i, num4 + 3, HARD_SAND);
            }
          }
        } else if (st.inBounds(i, num4) && st.type[st.idx(i, num4)] !== SHELL) {
          putPile(st, i, num4, T.SAND);
        }
      }
    }
    cx += vx; cy += vy;
    vx += rng.next() * 0.2 - 0.1; vy += rng.next() * 0.2 - 0.1;
    // cs:10414-10415 原版此处是两条裸 `Utils.Clamp(...)` 语句——泛型方法**返回值被
    // 丢弃**,实际不钳制(原版笔误型 no-op;1405 同款)。曾当真钳制 → 堆心漂移被回拉
  }
  return true;
}

/** 海滩装饰 = 原版 ShellPiles 段（cs:16393-16501；海藻不在此——由 Lilypads pass 的
 *  GrowCheckSeaweed 承担，cs:22177-22192 全列上扫）。
 *  注意：本 pass 在原版注册序中先于 SmoothWorld（cs:16385 < 16507），管线里须排在
 *  "半砖平滑"之前，否则堆出的散沙无人回收（两侧悬空孤立单格清理在平滑 pass）。 */
export function runBeachDecorPass(st: TileStore, rng: RNG, gs: GenState): void {
  if (gs.seedFlags.notTheBees) return;                // cs:16393：蜜蜂世界整段跳过（零掷骰）
  const spawn = (x: number, y: number) => shellPile(st, rng, x, y, gs.worldSurface);
  // ---- 左侧（cs:16399-16450）----
  if (rng.int(0, 1) === 0) {                          // genRand.Next(2)==0
    // 水线接触点盒扫描（cs:16404-16413）：活性沙 + 上方空且无液 + 海侧（左）邻格有水。
    // cs:16402-16403 先冻结局部副本再定界——盒恒定,命中只写回 gs(曾用活值做循环
    // 边界,命中即伸缩扫描盒 → 落点集分叉)
    const boxL = { x: gs.shellStartXLeft, y: gs.shellStartYLeft };
    for (let j = boxL.x - 20; j <= boxL.x + 20; j++) {
      for (let k = boxL.y - 10; k <= boxL.y + 10; k++) {
        if (!st.inBounds(j, k) || !st.inBounds(j - 1, k) || !st.inBounds(j, k - 1)) continue;
        const i = st.idx(j, k);
        if (st.flags[i] && st.type[i] === T.SAND
          && !st.flags[st.idx(j, k - 1)] && st.liquid[st.idx(j, k - 1)] === 0
          && !st.flags[st.idx(j - 1, k)] && st.liquid[st.idx(j - 1, k)] > 0) {
          gs.shellStartXLeft = j; gs.shellStartYLeft = k;  // 后命中者胜
        }
      }
    }
    gs.shellStartYLeft -= 50;                         // cs:16415
    gs.shellStartXLeft -= rng.int(0, 4);              // Next(5)
    if (rng.int(0, 1) === 0) gs.shellStartXLeft -= rng.int(0, 9);    // Next(10)
    if (rng.int(0, 2) === 0) gs.shellStartXLeft -= rng.int(0, 14);   // Next(15)
    if (rng.int(0, 3) !== 0) spawn(gs.shellStartXLeft, gs.shellStartYLeft);  // Next(4)!=0
    const maxValue = rng.int(2, 3);                   // Next(2,4)
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXLeft - rng.int(10, 34), gs.shellStartYLeft);
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXLeft - rng.int(40, 64), gs.shellStartYLeft);
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXLeft - rng.int(70, 94), gs.shellStartYLeft);
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXLeft - rng.int(100, 124), gs.shellStartYLeft);
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXLeft + rng.int(10, 24), gs.shellStartYLeft);
  }
  // ---- 右侧（cs:16451-16501）：镜像；邻格判海侧（右 = j+1）----
  if (rng.int(0, 1) === 0) {
    const boxR = { x: gs.shellStartXRight, y: gs.shellStartYRight };
    for (let j = boxR.x - 20; j <= boxR.x + 20; j++) {
      for (let k = boxR.y - 10; k <= boxR.y + 10; k++) {
        if (!st.inBounds(j, k) || !st.inBounds(j + 1, k) || !st.inBounds(j, k - 1)) continue;
        const i = st.idx(j, k);
        if (st.flags[i] && st.type[i] === T.SAND
          && !st.flags[st.idx(j, k - 1)] && st.liquid[st.idx(j, k - 1)] === 0
          && !st.flags[st.idx(j + 1, k)] && st.liquid[st.idx(j + 1, k)] > 0) {
          gs.shellStartXRight = j; gs.shellStartYRight = k;
        }
      }
    }
    gs.shellStartYRight -= 50;                        // cs:16465
    gs.shellStartXRight += rng.int(0, 4);             // Next(5)
    // cs:16468/16472 原版复制粘贴怪癖：右侧 ±10/±15 调整误写 shellStartXLeft。
    // 该值此后无人再读（全仓仅本 pass 消费），保留掷骰与写法以维持 RNG 流一致。
    if (rng.int(0, 1) === 0) gs.shellStartXLeft += rng.int(0, 9);
    if (rng.int(0, 2) === 0) gs.shellStartXLeft += rng.int(0, 14);
    if (rng.int(0, 3) !== 0) spawn(gs.shellStartXRight, gs.shellStartYRight);
    const maxValue = rng.int(2, 3);
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXRight + rng.int(10, 34), gs.shellStartYRight);
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXRight + rng.int(40, 64), gs.shellStartYRight);
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXRight + rng.int(70, 94), gs.shellStartYRight);
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXRight + rng.int(100, 124), gs.shellStartYRight);
    if (rng.int(0, maxValue - 1) === 0) spawn(gs.shellStartXRight - rng.int(10, 24), gs.shellStartYRight);
  }
}
