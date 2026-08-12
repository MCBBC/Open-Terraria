// 一次性诊断:种子 1534061173 地牢入口走廊被沙子堵死 —— dump 走廊附近沙块分布
// 运行:npx vitest run tests/_dg-sand-dump.test.ts
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const SEED = '1534061173';

function keyOf(id: number): string {
  return TILE_DEFS[id]?.key ?? `id${id}`;
}

describe('地牢入口走廊沙堵诊断', () => {
  it(`种子 ${SEED}: dump 地牢入口附近沙块`, async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: SEED, evil: 0 });
    const st = world.store;
    const dx = (world as unknown as { dungeonX?: number }).dungeonX ?? 0;
    const dy = (world as unknown as { dungeonY?: number }).dungeonY ?? 0;
    console.log('dungeonX/Y =', dx, dy, 'groundLevel=', world.groundLevel, 'rockLevel=', world.rockLevel);

    // 地牢入口走廊大致在 (dx, groundLevel 附近) 向下
    // ASCII dump: x ∈ [dx-45, dx+45], y ∈ [dy-35, dy+95]
    const x0 = Math.max(1, dx - 45), x1 = Math.min(st.w - 2, dx + 45);
    const y0 = Math.max(1, dy - 35), y1 = Math.min(st.h - 2, dy + 95);
    const legend = new Map<string, number>();
    const lines: string[] = [];
    for (let y = y0; y <= y1; y++) {
      let row = '';
      for (let x = x0; x <= x1; x++) {
        const i = st.idx(x, y);
        const t = st.type[i];
        let ch = '.';
        if (st.flags[i]) {
          ch = '#';
          const key = keyOf(t);
          if (/sand/.test(key)) ch = 'S';       // 沙
          else if (/dungeon|blue.*brick|green.*brick|pink/.test(key)) ch = 'D'; // 地牢砖
          legend.set(key, (legend.get(key) ?? 0) + 1);
        } else if (st.liquid[i] > 0) ch = '~';
        legend.set(`ch:${ch}`, (legend.get(`ch:${ch}`) ?? 0) + 1);
        row += ch;
      }
      lines.push(`${y.toString().padStart(4)} ${row}`);
    }
    console.log(lines.join('\n'));
    console.log('--- top tile keys:', [...legend.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 20));

    // 全列统计:入口走廊 x±30 内,groundLevel±20 内的沙块坐标
    const sandCells: Array<[number, number]> = [];
    for (let x = dx - 60; x <= dx + 60; x++) {
      for (let y = dy - 40; y <= dy + 60; y++) {
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) continue;
        const i = st.idx(x, y);
        if (st.flags[i] && /sand/.test(keyOf(st.type[i]))) sandCells.push([x, y, ]);
      }
    }
    console.log('--- sand cells near entrance:', sandCells.length, sandCells.slice(0, 40));
  }, 300000);
});
