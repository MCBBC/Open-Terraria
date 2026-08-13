// 验尸②:残留点大邻域找树结构轨迹(竖井/隧道/密室的 W 群与活木墙244)
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

describe('living wood 残留验尸②(一次性)', () => {
  it('seed 12345: 大邻域树结构轨迹', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const st = world.store;
    const LW = TILE_BY_KEY['v_191_living_wood_block']!;
    const dX = world.dungeonX;
    // 找第一个残留
    let sx = -1, sy = -1;
    outer:
    for (let y = 250; y < st.h - 200; y++) {
      for (let x = dX - 250; x < dX + 250; x++) {
        const i = st.idx(x, y);
        if (st.type[i] === LW && st.flags[i] && [7,8,9,94,95,96,97,98,99].includes(st.wall[i])) { sx = x; sy = y; break outer; }
      }
    }
    console.log(`残留锚点=(${sx},${sy}) dungeon=(${dX},${world.dungeonY})`);
    // ±60 范围内所有 191/活木墙244 的分布(按列聚合输出)
    let lwCount = 0, wallCount = 0;
    const lwCols = new Map<number, string[]>();
    for (let x = sx - 60; x <= sx + 60; x++) {
      for (let y = sy - 60; y <= sy + 60; y++) {
        const i = st.idx(x, y);
        if (st.type[i] === LW && st.flags[i]) { lwCount++; (lwCols.get(x) ?? lwCols.set(x, []).get(x)!).push(y); }
        if (st.wall[i] === 244) wallCount++;
      }
    }
    console.log(`±60 内: 活木格=${lwCount} 活木墙244格=${wallCount}`);
    for (const [x, ys] of [...lwCols.entries()].sort((a, b) => a[0] - b[0]).slice(0, 30)) {
      console.log(`  列${x}: ${ys.length}格 y${Math.min(...ys)}-${Math.max(...ys)}`);
    }
    // 沿残留向上扫描竖井轨迹:该列附近找从上到下的连续活木墙列
    expect(true).toBe(true);
  }, 300000);
});
