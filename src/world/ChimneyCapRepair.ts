// 烟囱顶帽行修复（2026-08-30）：FTW_V2 实测导入后烟囱只剩 fy∈{18,36} 两行，
// 缺 Style3x3 三行结构的顶帽行（fy=0——烟的花纹烘在帽带里，缺它即"上面少两格"观感；
// DrawTiles_EmitParticles 的烟雾门也只认帽/换带首格）。多格 frameImportant 物件正常
// 挖除时整物消失，3 行存 2 行不可能是自然游戏结果 ⇒ 导入丢失，加载末统一补齐。
// 只写【缺失的帽行】且目标格必须为空——不触碰任何既有数据。
import type { TileStore } from './TileStore';
import { TILE_DEFS } from '../data/tiles';

let chimneyInternalId = -2;
function chimId(): number {
  if (chimneyInternalId === -2) {
    chimneyInternalId = -1;
    for (let t = 0; t < TILE_DEFS.length; t++) {
      if (TILE_DEFS[t]?.vanilla?.sheet === 406) { chimneyInternalId = t; break; }
    }
  }
  return chimneyInternalId;
}

/** 全图扫描（加载期一次性 O(N)）；返回补写的格子数。 */
export function repairChimneyCaps(st: TileStore): number {
  const id = chimId();
  if (id <= 0 || !st.w || !st.h) return 0;
  const seen = new Uint8Array(st.w * st.h);
  let fixed = 0;
  for (let y = 1; y < st.h - 1; y++) {
    for (let x = 1; x < st.w - 1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] !== id || seen[i]) continue;
      // flood 收集本物件包围盒（同型连通）
      let minX = x, maxX = x, minY = y, maxY = y;
      const stack: Array<[number, number]> = [[x, y]];
      seen[i] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
          if (!st.inBounds(nx, ny)) continue;
          const ni = st.idx(nx, ny);
          if (seen[ni] || !st.flags[ni] || st.type[ni] !== id) continue;
          seen[ni] = 1;
          stack.push([nx, ny]);
        }
      }
      // 物件内 frameY 集合
      const haveFys = new Set<number>();
      for (let yy = minY; yy <= maxY; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const ci = st.idx(xx, yy);
          if (!st.flags[ci] || st.type[ci] !== id) continue;
          haveFys.add(st.frameY[ci]);
        }
      }
      if (haveFys.has(0)) continue;                       // 帽行在 → 不动
      if (!haveFys.has(18) && !haveFys.has(36)) continue; // 无可锚源行
      const srcRow = haveFys.has(18) ? 18 : 36;
      // 源行逐格：以其列 x 与 fx 写帽行（世界 y = 源y − (18→1 / 36→2)）
      for (let xx = minX; xx <= maxX; xx++) {
        for (let yy = minY; yy <= maxY; yy++) {
          const ci = st.idx(xx, yy);
          if (!st.flags[ci] || st.type[ci] !== id || st.frameY[ci] !== srcRow) continue;
          const capY = yy - (srcRow === 18 ? 1 : 2);
          if (!st.inBounds(xx, capY)) continue;
          const ciCap = st.idx(xx, capY);
          if (st.flags[ciCap]) continue;                  // 目标必须为空（含非同型）
          st.setTileSilent(xx, capY, id, st.frameX[ci], 0);
          fixed++;
        }
      }
    }
  }
  return fixed;
}
