// 原版 WorldGen.SpreadGrass 移植（WorldGen.cs:75210）——生成期草皮传播。
// 泥/石完全被包住（3×3 全实心）不转；岩浆邻格把 enclosed 拉回 true 但只断内层列循环
// （后续列仍可再拉回 false）；CanBeClearedDuringGeneration=false 不转。
import type { TileStore } from '../../TileStore';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { NOT_CLEARABLE } from './TileRunner';
import { vanGenSolidType } from './GenSolid';
// 与 MushroomPass.spreadGrassOnce 共用同一洪水计数器（原版 grassSpread 是单一静态字段，
// cs:75305-75316——限的是整场洪水总量，非单链深度）
import { grassSpreadState } from './MushroomPass';

/** 把 (x,y) 及相邻同源 tile 转 grass 类型；repeat=true 时 3×3 邻格递归扩散。
 *  ★M3（2026-08-13）：旧实现是陈旧分叉，对齐 MushroomPass.spreadGrassOnce 同款：
 *  ① 补 !active 门（cs:75218）——本仓 inactive 格保留残留 type（幽灵语义），
 *    只比 type 不比 active 会误转已挖除格；
 *  ② InWorld(i,j,10) padding（cs:75218），旧版只查 inBounds；
 *  ③ 岩浆邻格 = `flag=true; break` 只断内层（cs:75260-75264），旧版硬 return
 *    且外层循环一并断——双重偏离；
 *  ④ 递归上限换全局计数器 grassSpread<1000（cs:75305-75316），旧版 depth>400
 *    是自创近似。
 *  enclosed 判定（cs:75251）只查 active && tileSolid（无 half/slope/solidTop），
 *  与 SolidTile 不同族，勿"顺手统一"。
 *  cs:75223-75244 邪恶草族滩带门 / dirt==0 地表门：本入口调用方（MossPass 苔藓、
 *  GrassWallPass/WorldGen 草皮）dirt 恒非 0、grass 恒非邪恶草族（邪恶草走
 *  MushroomPass.spreadGrassOnce，含该门），零影响故不复制。 */
export function spreadGrass(st: TileStore, x: number, y: number, dirt: number, grass: number, repeat = true): void {
  // InWorld(i,j,10)（cs:75218）
  if (x < 10 || x >= st.w - 10 || y < 10 || y >= st.h - 10) return;
  const i = st.idx(x, y);
  if (!st.flags[i] || st.type[i] !== dirt) return;   // active && type==dirt（cs:75218）
  // 3×3 窗口 clamp 到世界界（cs:75240-75247）
  const x0 = Math.max(0, x - 1), x1 = Math.min(st.w, x + 2);
  const y0 = Math.max(0, y - 1), y1 = Math.min(st.h, y + 2);
  let enclosed = true;
  for (let k = x0; k < x1; k++) {
    for (let l = y0; l < y1; l++) {
      const wi = st.idx(k, l);
      // ★MMMMM：cs:75251 `!Main.tileSolid[type]` 读的是**生成期可变表**（LifeCrystals
      // 尾 cs:16944 翻 225=false、Piles 尾 cs:19591 才还原——Moss pass 窗口期蜂巢块/
      // 发光蘑菇块等按非实心算）；静态 TILE_DEFS.solid 曾把 225 当实心 → 尾段洪水
      // enclosed 误判 → 蜂巢贴面石头漏转（#65 残差 T179>1×4 ow=64 族）。走 vanGenSolidType
      // （含 19/239/380/427/435-439 原版 tileSolid=true 的碰撞 false 差集，尾部清剿批同源）
      if (!st.flags[wi] || !vanGenSolidType(st.type[wi])) enclosed = false;
      // ★岩浆只 break 内层（cs:75260-75264）——后续列可再把 enclosed 拉回 false
      if (st.liquidType[wi] === 2 && st.liquid[wi] > 0) { enclosed = true; break; }
    }
  }
  if (enclosed) return;
  // CanBeClearedDuringGeneration=false 的泥（沙漠沙岩族等）不转（cs:75265）
  if (NOT_CLEARABLE.has(st.type[i])) return;
  st.type[i] = grass;
  if (!repeat) return;
  // cs:75305-75316：邻格 active && 同 dirt，grassSpread<1000 才递归
  for (let m = x0; m < x1; m++) {
    for (let n = y0; n < y1; n++) {
      const ni = st.idx(m, n);
      if (st.flags[ni] && st.type[ni] === dirt && grassSpreadState.n < 1000) {
        grassSpreadState.n++;
        spreadGrass(st, m, n, dirt, grass, true);
        grassSpreadState.n--;
      }
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
