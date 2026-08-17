// 一次性审计：place3x3D 帧写入（2026-08-17 炼金台贴图故障修复验证）。
// 生成 seed 12345 全图，扫地牢区全部炼金台 355 / 巫惑台 354：
// ①每格 frameX/frameY ∈ {0,18,36}；②3×3 足迹恰构成完整帧矩阵
// （左上 (0,0) … 右下 (36,36)，WorldGen.cs:53610-53652 Place3x3 逐格帧）。
// 运行：npx vitest run tests/_alchemy-gen-audit.test.ts
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('地牢动画家具帧审计(一次性)', () => {
  it('seed 12345: 炼金台/巫惑台逐格帧 = Place3x3 矩阵', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const st = world.store;
    const ALCHEMY = TILE_BY_KEY['v_355_alchemy_table']!;
    const BEWITCH = TILE_BY_KEY['v_354_bewitching_table']!;
    const dX = world.dungeonX;

    const found: Array<{ x: number; y: number; t: string; bad: string[] }> = [];
    const seen = new Set<number>();
    for (let y = 0; y < st.h; y++) {
      for (let x = dX - 260; x < dX + 260; x++) {
        if (x < 0 || x >= st.w) continue;
        const i = st.idx(x, y);
        const t = st.type[i];
        if (!st.flags[i] || (t !== ALCHEMY && t !== BEWITCH) || seen.has(i)) continue;
        // 足迹锚点 = 帧矩阵左上 (0,0)：找本物体所有相连同型格
        const cells: number[][] = [];
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            const ii = st.idx(x + dx, y + dy);
            seen.add(ii);
            cells.push([st.frameX[ii], st.frameY[ii], dx, dy]);
          }
        }
        const bad = cells.filter(([fx, fy, dx, dy]) => fx !== dx * 18 || fy !== dy * 18)
          .map(([fx, fy, dx, dy]) => `(${dx},${dy})=${fx},${fy}`);
        found.push({ x, y, t: t === ALCHEMY ? 'alch' : 'bew', bad });
      }
    }
    console.log(`动画家具合计: ${found.length} 台（alch=${found.filter(f => f.t === 'alch').length} bew=${found.filter(f => f.t === 'bew').length}）`);
    for (const f of found.slice(0, 8)) console.log(`  [${f.t}] (${f.x},${f.y}) ${f.bad.length ? '帧异常: ' + f.bad.join(' ') : '帧矩阵 ✓'}`);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every(f => f.bad.length === 0)).toBe(true);
  }, 300000);
});
