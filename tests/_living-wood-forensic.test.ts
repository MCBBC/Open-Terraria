// 一次性验尸:living_wood 残留的写入者追踪(seed 12345)
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

describe('living wood 残留验尸(一次性)', () => {
  it('seed 12345: 残留点形态+列扫描', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const st = world.store;
    const LW = TILE_BY_KEY['v_191_living_wood_block']!;
    const dX = world.dungeonX;
    // 全图找地牢墙内的活木
    const spots: [number, number][] = [];
    for (let y = 250; y < st.h - 200; y++) {
      for (let x = dX - 250; x < dX + 250; x++) {
        const i = st.idx(x, y);
        if (st.type[i] === LW && st.flags[i] && [7,8,9,94,95,96,97,98,99].includes(st.wall[i])) spots.push([x, y]);
      }
    }
    console.log(`dungeon=(${dX},${world.dungeonY}) 残留数=${spots.length}`);
    for (const [sx, sy] of spots.slice(0, 4)) {
      console.log(`--- 残留 (${sx},${sy}) 墙=${st.wall[st.idx(sx,sy)]} ---`);
      // 9×7 邻域
      for (let y = sy - 3; y <= sy + 3; y++) {
        let row = '';
        for (let x = sx - 4; x <= sx + 4; x++) {
          const i = st.idx(x, y);
          const t = st.type[i];
          const sh = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
          if (!st.flags[i]) row += '.';
          else if (t === LW) row += 'W';
          else if ([41, 43, 44, 481, 482, 483].includes(sh)) row += 'B';
          else if (sh === 192) row += 'L';
          else row += String(Math.min(9, sh % 10));
        }
        console.log(`  y${y} ${row}`);
      }
      // 列扫描:该列从地表往下活木分布(看是不是连续根线)
      const runs: string[] = [];
      let run = -1;
      for (let y = 0; y < st.h; y++) {
        const i = st.idx(sx, y);
        const isLW = st.type[i] === LW && st.flags[i];
        if (isLW && run < 0) run = y;
        else if (!isLW && run >= 0) { runs.push(`${run}-${y - 1}`); run = -1; }
      }
      if (run >= 0) runs.push(`${run}-${st.h - 1}`);
      console.log(`  列${sx} 活木段: ${runs.join(', ')}`);
    }
    expect(true).toBe(true);
  }, 300000);
});
