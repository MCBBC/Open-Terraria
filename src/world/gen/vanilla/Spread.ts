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
