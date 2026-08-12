// 原版 WorldGen.SpreadGrass 移植(WorldGen.cs:45236)——生成期草皮传播。
// 泥/石完全被包住(3×3 全实心)不转;岩浆邻接不转;向日葵上方不转腐化/猩红/神圣草。
import type { TileStore } from '../../TileStore';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { NOT_CLEARABLE } from './TileRunner';

/** 把 (x,y) 及相邻同源 tile 转 grass 类型;repeat=true 时 BFS 式向四周扩散 */
export function spreadGrass(st: TileStore, x: number, y: number, dirt: number, grass: number, repeat = true, depth = 0): void {
  if (depth > 400) return;
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (st.type[i] !== dirt) return;
  // 完全封闭(3×3 全实心)不转;岩浆邻接恒不转(cs L45269-45273:flag 强制 true)
  let enclosed = true;
  let lavaNear = false;
  for (let dx = -1; dx <= 1 && !lavaNear; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if (!st.inBounds(nx, ny)) continue;
      const j = st.idx(nx, ny);
      if (st.liquidType[j] === 2 && st.liquid[j] > 0) { lavaNear = true; break; }
      if (dx === 0 && dy === 0) continue;
      if ((!st.flags[j] || !TILE_DEFS[st.type[j]]?.solid)) enclosed = false;
    }
  }
  if (lavaNear) return;
  if (enclosed) return;
  // 原版:CanBeClearedDuringGeneration 为 false 的泥(沙漠沙岩族等)不转
  if (NOT_CLEARABLE.has(st.type[i])) return;
  st.type[i] = grass;
  if (!repeat) return;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!st.inBounds(nx, ny)) continue;
      const ni = st.idx(nx, ny);
      if (st.type[ni] === dirt) spreadGrass(st, nx, ny, dirt, grass, true, depth + 1);
    }
  }
}

/** 全图传播(对应原版逐 tile 调用 SpreadGrass 的 pass,如 Mud Caves To Grass)。
 * centerX/maxDist 可选:仅转换距中心 maxDist 内的泥(参考世界正是泥迹全图、
 * 丛林草紧贴丛林核心——远离核心的泥保持泥色) */
export function spreadGrassAll(st: TileStore, dirt: number, grass: number, centerX = -1, maxDist = 0): void {
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      if (centerX >= 0 && Math.abs(x - centerX) > maxDist) continue;
      if (st.type[st.idx(x, y)] === dirt) spreadGrass(st, x, y, dirt, grass, false);
    }
  }
  // 单格不扩散传播力弱,重复两轮让草皮连通。
  // 关键:必须以"轮初快照"判定邻草——同轮内边扫边转会在扫描方向上链式雪崩,
  // 把整条连通泥网全部转成草(丛林"全草无泥"与远程草带的根因)
  for (let round = 0; round < 2; round++) {
    const targets: number[] = [];
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== dirt) continue;
        let touch = false;
        for (let dx = -1; dx <= 1 && !touch; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (!st.inBounds(x + dx, y + dy)) continue;
            if (st.type[st.idx(x + dx, y + dy)] === grass) { touch = true; break; }
          }
        }
        if (touch) targets.push(i);
      }
    }
    for (const i of targets) st.type[i] = grass;
  }
  void T; void TILE_BY_KEY;
}

/**
 * 原版 MudCavesToJungleGrass pass（cs:12499-12530）1:1——替代自创 spreadGrassAll 近似：
 *  ① 全图逐 tile SpreadGrass(59, 60)（递归洪水，grassSpread 全局深度 ≤1000，
 *     InWorld(i,j,10) 门禁，3×3 封闭/岩浆判定，CanBeCleared 门禁）；
 *  ② ScanTileColumnAndRemoveClumps（cs:10164）：逐列竖向连续段 <20 且连通域 <20 → 清除。
 * 原版泥→丛林草无中心限距（自创 centerX/maxDist 与 2 轮快照扩散均偏离原版）。
 * 零 RNG——纯状态机，与掷骰流无关。
 */
export function runMudCavesPass(st: TileStore, dirt: number, grass: number): void {
  const { w, h } = st;
  let grassSpread = 0;
  // 热循环局部化 + solid LUT(定义同源=原判定式逐 id 预计算;洪水逐格 3×3 窗判定)
  const ty = st.type, tf = st.flags, tlt = st.liquidType, tl = st.liquid;
  const SOLID = new Uint8Array(TILE_DEFS.length);
  for (let id = 0; id < TILE_DEFS.length; id++) {
    if (TILE_DEFS[id]?.solid) SOLID[id] = 1;
  }

  const spread = (x: number, y: number): void => {
    // InWorld(i,j,10)（cs:75218）
    if (x < 10 || x >= w - 10 || y < 10 || y >= h - 10) return;
    const ci = y * w + x;
    if (!tf[ci] || ty[ci] !== dirt) return;
    // 生成期 dirt==0 的地表限高门禁：dirt=59 不触发；type==dirt && active → 不 return
    // 3×3 窗口（clamp 到世界界，cs:75240-75251）
    const x0 = Math.max(0, x - 1), x1 = Math.min(w, x + 2);
    const y0 = Math.max(0, y - 1), y1 = Math.min(h, y + 2);
    let enclosed = true;
    for (let k = x0; k < x1; k++) {
      for (let l = y0; l < y1; l++) {
        const wi = l * w + k;
        if (!tf[wi] || !SOLID[ty[wi]]) enclosed = false;
        // ★岩浆只 break 内层循环（cs:75260-75264）——后续列可再把 enclosed 拉回 false；
        // 曾实现为"遇岩浆直接 return"≠原版
        if (tlt[wi] === 2 && tl[wi] > 0) { enclosed = true; break; }
      }
    }
    if (enclosed) return;
    if (NOT_CLEARABLE.has(ty[ci])) return;
    // flag2（Conversion.Grass[dirt]）的 Convert 分支仅 grass=23/199/109——本调用 grass=60 直写
    ty[ci] = grass;
    for (let m = x0; m < x1; m++) {
      for (let n = y0; n < y1; n++) {
        const ni = n * w + m;
        if (tf[ni] && ty[ni] === dirt && grassSpread < 1000) {
          grassSpread++;
          spread(m, n);
          grassSpread--;
        }
      }
    }
  };

  // ① 全图逐 tile 播种（cs:12510-12520）
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (st.flags[st.idx(x, y)]) {
        grassSpread = 0;
        spread(x, y);
      }
    }
  }

  // ② 散块清除（cs:12522-12529 + ScanTileColumnAndRemoveClumps cs:10164）
  const MAX = 20; // tileCounterMax（cs:4307）
  const solidClearable = (i: number): boolean => {
    const t = st.type[i];
    return st.flags[i] !== 0 && !!TILE_DEFS[t]?.solid && !NOT_CLEARABLE.has(t);
  };
  const counted = new Int32Array(MAX);
  let countN = 0;
  const flood = (x: number, y: number): void => {
    if (countN >= MAX) return;
    if (x < 5 || x >= w - 5 || y < 5 || y >= h - 5) return;
    const i = st.idx(x, y);
    if (!solidClearable(i)) return;
    for (let n = 0; n < countN; n++) if (counted[n] === i) return;
    counted[countN++] = i;
    flood(x - 1, y); flood(x + 1, y); flood(x, y - 1); flood(x, y + 1);
  };
  for (let x = 10; x < w - 10; x++) {
    let run = 0, runY = 0;
    for (let y = 10; y < h - 10; y++) {
      if (solidClearable(st.idx(x, y))) {
        if (run === 0) runY = y;
        run++;
        continue;
      }
      if (run > 0 && run < MAX) {
        countN = 0;
        flood(x, runY);
        if (countN < MAX) {
          for (let n = 0; n < countN; n++) st.flags[counted[n]] = 0;
        }
      }
      run = 0;
    }
  }
}
