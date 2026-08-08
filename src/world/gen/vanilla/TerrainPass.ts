// 原版 TerrainPass 移植(Terrarria1405/GameContent/Biomes/TerrainPass.cs,1:1)。
// 逐列随机走 5 种地形特征(Plateau/Hill/Dale/Mountain/Valley)驱动 worldSurface/rockLayer;
// 输出 worldSurfaceHigh/Low、rockLevelHigh/Low、waterLine、lavaLine 到 GenState;
// 海滩区按 Reset 掷的 beachLeftEnd/beachRightStart 平坦化,右海滩入口 Retarget 收平。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, W } from '../../../data/tiles';

const enum Feature { Plateau, Hill, Dale, Mountain, Valley }

// GenerateWorldSurfaceOffset(TerrainPass.cs:222-251,普通模式分支)
function genSurfaceOffset(rng: RNG, f: Feature): number {
  let n = 0;
  switch (f) {
    case Feature.Plateau:
      while (rng.next() * 7 < 1) n += rng.int(-1, 1);
      break;
    case Feature.Hill:
      while (rng.next() * 4 < 1) n--;
      while (rng.next() * 10 < 1) n++;
      break;
    case Feature.Dale:
      while (rng.next() * 4 < 1) n++;
      while (rng.next() * 10 < 1) n--;
      break;
    case Feature.Mountain:
      while (rng.next() * 2 < 1) n--;
      while (rng.next() * 6 < 1) n++;
      break;
    case Feature.Valley:
      while (rng.next() * 2 < 1) n++;
      while (rng.next() * 5 < 1) n--;
      break;
  }
  return n;
}

export function runTerrainPass(st: TileStore, rng: RNG, gs: GenState, flatBeachPadding = 5): void {
  const { w, h } = st;
  const leftBeach = gs.beachLeftEnd, rightBeach = w - gs.beachRightStart;
  let feature: Feature = Feature.Plateau;
  let num2 = h * 0.3 * (rng.int(90, 109) * 0.005);            // worldSurface(逐列游走)
  let num3 = (num2 + h * 0.2) * (rng.int(90, 109) * 0.01);      // rockLayer(逐列游走)
  let loSurf = num2, hiSurf = num2, loRock = num3, hiRock = num3;
  const maxSurf = h * 0.23;
  const history: number[] = []; // 近 500 列地表(右海滩 Retarget 用)

  let runLen = leftBeach + flatBeachPadding;
  for (let x = 0; x < w; x++) {
    loSurf = Math.min(num2, loSurf);
    hiSurf = Math.max(num2, hiSurf);
    loRock = Math.min(num3, loRock);
    hiRock = Math.max(num3, hiRock);
    if (runLen <= 0) {
      feature = rng.int(0, 4);
      runLen = rng.int(5, 39);
      if (feature === Feature.Plateau) runLen *= Math.floor(rng.int(5, 29) * 0.2);
    }
    runLen--;
    // 出生点 ±2% 强制高原;±5% 内避免山/谷(原版换 0-2 低洼特征)
    if (x > w * 0.45 && x < w * 0.55 && (feature === Feature.Mountain || feature === Feature.Valley)) {
      feature = rng.int(0, 2);
    }
    if (x > w * 0.48 && x < w * 0.52) feature = Feature.Plateau;
    num2 += genSurfaceOffset(rng, feature);
    if (x < leftBeach + flatBeachPadding || x > w - rightBeach - flatBeachPadding) {
      num2 = Math.max(h * 0.17, Math.min(num2, maxSurf)); // 海滩 clamp
    } else if (num2 < h * 0.17) { num2 = h * 0.17; runLen = 0; }
    else if (num2 > h * 0.26) { num2 = h * 0.26; runLen = 0; }
    while (rng.int(0, 2) === 0) num3 += rng.int(-2, 2);
    if (num3 < num2 + h * 0.06) num3++;
    if (num3 > num2 + h * 0.35) num3--;
    history.push(num2);
    if (history.length > 500) history.shift();
    // 填列:地表以上空气,到 rockLayer 为泥土,以下石头 + 自然墙
    for (let y = 0; y < h; y++) {
      const i = st.idx(x, y);
      if (y < num2) {
        st.type[i] = 0; st.flags[i] = 0;
      } else if (y < num3) {
        st.type[i] = T.DIRT; st.flags[i] = 1;
        if (y > num2 + 3) st.wall[i] = W.DIRT;
      } else {
        st.type[i] = T.STONE; st.flags[i] = 1;
        st.wall[i] = W.STONE;
      }
    }
    // 右海滩入口:若地表高于 maxSurf,回溯改写近 500 列向下收平(TerrainPass.cs:101-107)
    if (x === w - rightBeach - flatBeachPadding) {
      if (num2 > maxSurf) retargetSurfaceHistory(st, history, x, maxSurf);
      feature = Feature.Plateau;
      runLen = w - x;
    }
  }

  // 输出常量(TerrainPass.cs:109-132)
  const worldSurface = Math.floor(hiSurf + 25);
  const rockLayer = Math.floor(worldSurface + Math.floor((hiRock - worldSurface) / 6) * 6);
  gs.waterLine = Math.floor((rockLayer + h) / 2) + rng.int(-100, 19);
  gs.lavaLine = gs.waterLine + rng.int(50, 79);
  // num11 校正:rockLayerLow 与 worldSurfaceHigh 间距 < 20 → 拉开
  const num11 = 20;
  if (loRock < hiSurf + num11) {
    const mid = (loRock + hiSurf) / 2;
    let spread = Math.abs(loRock - hiSurf);
    if (spread < num11) spread = num11;
    loRock = mid + spread / 2;
    hiSurf = mid - spread / 2;
  }
  gs.worldSurface = worldSurface;
  gs.rockLevel = rockLayer;
  gs.worldSurfaceLow = Math.floor(loSurf);
  gs.worldSurfaceHigh = Math.floor(hiSurf);
  gs.rockLevelLow = Math.floor(loRock);
  gs.rockLevelHigh = Math.floor(hiRock);
}

// RetargetSurfaceHistory(TerrainPass.cs:256-276):将历史地表逐列下压到目标高度后重写地形
function retargetSurfaceHistory(st: TileStore, history: number[], targetX: number, targetHeight: number): void {
  for (let i1 = 0; i1 < history.length / 2 && history[history.length - 1] > targetHeight; i1++) {
    for (let i2 = 0; i2 < history.length - i1 * 2; i2++) {
      const v = history[history.length - i2 - 1] - 1;
      history[history.length - i2 - 1] = v;
      if (v <= targetHeight) break;
    }
  }
  for (let i = 0; i < history.length; i++) {
    const surf = history[history.length - i - 1];
    retargetColumn(st, targetX - i, surf);
  }
}

function retargetColumn(st: TileStore, x: number, worldSurface: number): void {
  if (x < 0 || x >= st.w) return;
  for (let y = 0; y < st.h; y++) {
    const i = st.idx(x, y);
    if (y < worldSurface) {
      st.type[i] = 0; st.flags[i] = 0;
    } else if (!(st.type[i] === T.STONE && st.flags[i])) {
      st.type[i] = T.DIRT; st.flags[i] = 1;
    }
  }
}
