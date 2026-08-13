// 一次性:琥珀树 589 结构终验(干/顶/枝帧完整性)——默认 skip,SW_AUDIT=1 手动跑
import { describe, it } from 'vitest';
const AUDIT = !!process.env.SW_AUDIT;
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

(AUDIT ? describe : describe.skip)('amber tree structure', () => {
  it('589 tree at seed 12345: trunk/top/branch frames', async () => {
    let st: TileStore | undefined;
    try {
      await generateWorld({
        width: 4200, height: 1200, seedText: '12345', evil: 0,
        onWorldPartial: (w, _i, name) => { if (name === '宝石系统') st = w.store; },
      });
    } catch { /* 后段 pass 中途态容忍 */ }
    if (!st) throw new Error('no snapshot');
    const S = st;
    const T589 = TILE_BY_KEY['v_589_amber_tree']!;
    const cells: Array<{ x: number; y: number; fx: number; fy: number }> = [];
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const i = S.idx(x, y);
      if (S.flags[i] && S.type[i] === T589) cells.push({ x, y, fx: S.frameX[i], fy: S.frameY[i] });
    }
    const tops = cells.filter(c => c.fy >= 198);
    const branches = cells.filter(c => c.fy < 198 && c.fx >= 22);
    const trunks = cells.filter(c => c.fy < 198 && c.fx < 22);
    const byX = new Map<number, number>();
    for (const c of cells) byX.set(c.x, (byX.get(c.x) ?? 0) + 1);
    console.log(JSON.stringify({
      total: cells.length, trees: byX.size, xSample: [...byX.keys()].slice(0, 6),
      tops: tops.length, topFxs: [...new Set(tops.map(c => c.fx))],
      branches: branches.length, branchFxs: [...new Set(branches.map(c => c.fx))],
      trunks: trunks.length, trunkFyMax: trunks.length ? Math.max(...trunks.map(c => c.fy)) : -1,
    }));
  }, 240000);
});
