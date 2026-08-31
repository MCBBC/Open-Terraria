// 原版 TerrainPass 移植（1456 Terraria.GameContent.Biomes/TerrainPass.cs 1:1，
// 2026-08-11 种子等价对账修正：num3/num4 是 double 非 float——此前误加 fround
// float32 每步舍入，整条随机游走被腐蚀；小世界 clamp 缺 +0.02（GetWorldSize()==0）；
// 填柱空气边界是 trunc(num3) 非 ceil（原版 dirt 循环从 (int)num3 起覆盖小数格））。
// 逐列随机走 5 种地形特征(Plateau/Hill/Dale/Mountain/Valley)驱动 worldSurface/rockLayer;
// 输出 worldSurfaceHigh/Low、rockLevelHigh/Low、waterLine、lavaLine 到 GenState;
// 海滩区按 Reset 掷的 beachLeftEnd/beachRightStart 平坦化,右海滩入口 Retarget 收平。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T } from '../../../data/tiles';

const enum Feature { Plateau, Hill, Dale, Mountain, Valley }

// GenerateWorldSurfaceOffset（1456 cs:293-401）：双分支全量移植。
// ★IIIII14：drunk/getGood/remix 世界且 Next(2)==0 → 走夸张长爬升表
// （1457 TerrainPass.cs:296-359——Plateau 阈 6/Hill·Dale 阈 3/Mountain·Valley 先
// `!=0` 短跳再长补）；否则普通表。判定骰只在特殊旗标世界消耗（普通短路不掷，
// 流零扰动）。曾只实现普通分支并备案。
function genSurfaceOffset(rng: RNG, f: Feature, specialPossible: boolean): number {
  // ★ilspycmd 对真 exe 的权威反汇编（2026-08-13）：本函数有两个分支——
  // drunk/getGood/remix 世界（且 Next(2)==0）才是 6/3/!=0 长爬升表；
  // 普通世界走 else：Plateau Next(0,7)、Hill/Dale Next(0,4)、Mountain/Valley
  // Next(0,2)==0（短爬升）。曾误把特殊分支当普通世界表"修复"过，已回滚。
  if (specialPossible && rng.nextIntRange(0, 2) === 0) {
    // ★IIIII14 特殊长爬升表（TerrainPass.cs:300-358）
    let n = 0;
    switch (f) {
      case Feature.Plateau:
        while (rng.next() * 6 < 1) n += rng.int(-1, 1);
        break;
      case Feature.Hill:
        while (rng.next() * 3 < 1) n--;
        while (rng.next() * 10 < 1) n++;
        break;
      case Feature.Dale:
        while (rng.next() * 3 < 1) n++;
        while (rng.next() * 10 < 1) n--;
        break;
      case Feature.Mountain:
        while (rng.next() * 3 >= 1) n--;   // Next(0,3)!=0 → 非 0 继续
        while (rng.next() * 6 < 1) n++;
        break;
      case Feature.Valley:
        while (rng.next() * 3 >= 1) n++;
        while (rng.next() * 5 < 1) n--;
        break;
    }
    return n;
  }
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

export function runTerrainPass(st: TileStore, rng: RNG, gs: GenState, flatBeachPadding = 5,
  // ★进度对齐：TerrainPass.cs 内 progress.Set((double)i/(double)maxTilesX) 逐列锚
  gp?: import('../GenProgress').GenProgress): void {
  const { w, h } = st;
  const leftBeach = gs.beachLeftEnd, rightBeach = w - gs.beachRightStart;
  // num10（cs:117-131）：0.17 基线，小世界（GetWorldSize()==0，maxTilesX==4200）+0.02
  // ★IIIII14（1457 TerrainPass.cs:123-127）：drunk → num10=0.15 / num11=0.28
  // ★IIIII80（2026-08-30，1458 TerrainPass.cs:119-121）：surfaceIsInSpace（such great
  //   heights）分支在 drunk **之前**——num11→(float)0.22（二进制 double 字面量照录
  //   0.2199999988079071；JS 的 0.22 是另一个 double，边界列会翻），num10 不变。
  const pLo = gs.seedFlags.drunkWorld && !gs.seedFlags.surfaceIsInSpace ? 0.15 : 0.17;
  const pHi = gs.seedFlags.surfaceIsInSpace
    ? 0.2199999988079071
    : (gs.seedFlags.drunkWorld ? 0.28 : 0.26);
  const surfLo = h * (pLo + (w === 4200 ? 0.02 : 0));
  const surfHi = h * pHi;
  // ★IIIII14：drunk/getGood/remix 世界走长爬升表的可能位（判定骰在 genSurfaceOffset 内）
  const specialOffset = !!(gs.seedFlags.drunkWorld || gs.seedFlags.getGoodWorld || gs.seedFlags.remix);
  let feature: Feature = Feature.Plateau;
  let num2 = h * 0.3 * (rng.int(90, 109) * 0.005);            // num3 worldSurface(逐列游走,double)
  let num3 = (num2 + h * 0.2) * (rng.int(90, 109) * 0.01);      // num4 rockLayer(逐列游走,double)
  // ★IIIII43 REMIX（1457 TerrainPass.cs:66-73）：remix 岩层初值整体替换——
  //   num4 = maxTilesY*0.5（maxTilesX>2500 时 *0.6）×Next(95,106)*0.01
  //   （Next(95,106) 与普通 Next(90,110) 消耗骰数相同但值域不同 ⇒ 下游整流移位）
  if (gs.seedFlags.remix) {
    num3 = h * (w > 2500 ? 0.6 : 0.5) * (rng.int(95, 105) * 0.01);
  }
  let loSurf = num2, hiSurf = num2, loRock = num3, hiRock = num3;
  const maxSurf = h * 0.23;
  const history: number[] = []; // 近 500 列地表(右海滩 Retarget 用)

  let runLen = leftBeach + flatBeachPadding;
  for (let x = 0; x < w; x++) {
    gp?.set(x / w);   // ≡ cs:11576 同型逐列 Set((double)i / maxTilesX)
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
    // 原版：double 累加（整数偏移），无任何 float 舍入——IEEE754 double 与 C# 位级一致
    num2 += genSurfaceOffset(rng, feature, specialOffset);
    if (x < leftBeach + flatBeachPadding || x > w - rightBeach - flatBeachPadding) {
      num2 = Math.max(surfLo, Math.min(num2, maxSurf)); // Utils.Clamp(海滩区)
    } else if (num2 < surfLo) { num2 = surfLo; runLen = 0; }
    else if (num2 > surfHi) { num2 = surfHi; runLen = 0; }
    while (rng.int(0, 2) === 0) num3 += rng.int(-2, 2);
    // ★IIIII43 REMIX（1457 TerrainPass.cs:163-176）：逐列顶棚分支替换——remix 无
    //   下限吸附（`num4<num3+0.06H → num4++` 不执行），仅上限削减（>0.7H 或 >0.6H 逐列 -1）
    if (gs.seedFlags.remix) {
      if (w > 2500) { if (num3 > h * 0.7) num3--; }
      else if (num3 > h * 0.6) num3--;
    } else {
      if (num3 < num2 + h * 0.06) num3++;
      if (num3 > num2 + h * 0.35) num3--;
    }
    history.push(num2);
    if (history.length > 500) history.shift();
    // 填列（FillColumn cs:246-271）：air 循环 i<num3，dirt 循环从 (int)num3 起覆盖
    // → 最终态 y < trunc(num3) 空气、[trunc(num3), num4) 泥土、≥num4 石头。
    // （此前按 y<num3 空气 = ceil 边界，小数列整体低一格）
    // ★IIIII80（1458 TerrainPass.cs:189-192）：surfaceIsInSpace && !noSurface →
    //   FillColumn(i, num3 - maxTilesY*0.08, num4)：整列实心从「地表-8%H」起；
    //   且 `continue` 跳过右海滩 Retarget/Plateau 段（cs:194-204 整块在该 continue 之后）。
    //   注意 Main.worldSurface 终值仍 = max(num3)+25（未含 -0.08 位移）。
    const sSpace = !!gs.seedFlags.surfaceIsInSpace && !gs.seedFlags.noSurface;
    const surfTrunc = sSpace ? Math.trunc(num2 - h * 0.08) : Math.trunc(num2);
    for (let y = 0; y < h; y++) {
      const i = st.idx(x, y);
      if (y < surfTrunc) {
        st.type[i] = 0; st.flags[i] = 0;
      } else if (y < num3) {
        // ★原版 FillColumn 只写 active+type 不刷墙（地下自然墙全部来自后置 pass：
        // DirtWallBackgrounds 近地表 + CaveWallsInEnclosedSpaces(17819) 封闭腔 +
        // digTunnel 无墙 + mudWall 丛林）。自刷渲染墙曾致 mudWall 分支短路分叉
        st.type[i] = T.DIRT; st.flags[i] = 1;
      } else {
        st.type[i] = T.STONE; st.flags[i] = 1;
      }
    }
    // 右海滩入口:若地表高于 maxSurf,回溯改写近 500 列向下收平(cs:196-204)
    // （IIIII80：sgis 臂 continue 到下一列，此块整段跳过）
    if (!sSpace && x === w - rightBeach - flatBeachPadding) {
      if (num2 > maxSurf) retargetSurfaceHistory(st, history, x, maxSurf);
      feature = Feature.Plateau;
      runLen = w - x;
    }
  }

  // 输出常量(TerrainPass.cs:109-132)
  const worldSurface = Math.floor(hiSurf + 25);
  const rockLayer = Math.floor(worldSurface + Math.floor((hiRock - worldSurface) / 6) * 6);
  gs.waterLine = Math.floor((rockLayer + h) / 2) + rng.int(-100, 19);
  let lavaLine = gs.waterLine + rng.int(50, 79);
  // ★IIIII43 REMIX（1457 TerrainPass.cs:218-221）：lavaLine=(int)(worldSurface*4+num4终值)/5
  //   ——Next(50,80) 在普通行已照常消耗，remix 仅覆写值（cs 顺序如此）
  if (gs.seedFlags.remix) {
    lavaLine = Math.trunc(Math.trunc(worldSurface * 4.0 + num3) / 5);
  }
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
  gs.lavaLine = lavaLine;
  // ★IIIII43 REMIX（1457 TerrainPass.cs:240-243）：四条 remix 带常量**无条件**赋值
  //   （非 remix 世界同样写入，仅无消费者）。UnderworldLayer = maxTilesY-200（Main.cs:2886）
  gs.remixMushroomLayerLow = h - 350;
  gs.remixMushroomLayerHigh = h - 200;
  gs.remixSurfaceLayerLow = Math.floor(gs.rockLevelLow);
  gs.remixSurfaceLayerHigh = gs.remixMushroomLayerLow;
  // GenVars 终值（cs:232-237：游走最后一列的 num3/num4 double——注意 ≠ Main.worldSurface）
  gs.genWorldSurface = num2;
  gs.genRockLayer = num3;
  gs.genWorldSurfaceHigh = hiSurf; // num6 校正后 raw double（cs:236）
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
  const surfTrunc = Math.trunc(worldSurface); // 同 FillColumn：dirt 循环 (int) 起覆盖小数格
  for (let y = 0; y < st.h; y++) {
    const i = st.idx(x, y);
    if (y < surfTrunc) {
      st.type[i] = 0; st.flags[i] = 0;
    } else if (!(st.type[i] === T.STONE && st.flags[i])) {
      st.type[i] = T.DIRT; st.flags[i] = 1;
    }
  }
}
