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
  const sandDepthLimit = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
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
      for (let y = 0; y < sandDepthLimit; y++) {
        const ii = st.idx(x, y);
        if (!st.flags[ii]) continue;
        // 金字塔候选:区域中心 1/6 概率
        if (x === ((x1 + x2) >> 1) && rng.next() < 1 / 6) {
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
  const sc = (n: number) => Math.max(1, Math.round(n * van));
  const oceanWaterMin = sc(220), oceanWaterMax = sc(260), forcedJungleLen = sc(275), minSand = sc(50);
  const edgeWall = Math.max(4, Math.round(30 * van));

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
      const waterY = surfY + rng.int(1, 4);
      let count = 0, depth = 1;
      for (let x = waterX - 1; x >= 0; x--) {
        if (x > edgeWall) { count++; depth = tuneOceanDepth(rng, count, depth, van, floridaL); }
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
