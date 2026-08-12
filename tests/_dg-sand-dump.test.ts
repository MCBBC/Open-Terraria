// 一次性诊断:地牢入口走廊沙堵(2026-08-13 根因=legacy 入口误用 Dome/Tower 专属
// ±300 预计算漂移,DungeonCrawler.cs:275/818-849)。跑法:
//   npx vitest run tests/_dg-sand-dump.test.ts                      # 多种子计数
//   DG_SEEDS=1534061173 DG_DUMP=1 npx vitest run tests/_dg-sand-dump.test.ts  # ASCII dump
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

function keyOf(id: number): string {
  return TILE_DEFS[id]?.key ?? `id${id}`;
}

const SEEDS = (process.env.DG_SEEDS ?? '1534061173,9293480,12345,SandboxWorld').split(',');
const DUMP = !!process.env.DG_DUMP;

describe('地牢入口走廊沙堵诊断', () => {
  for (const SEED of SEEDS) {
    it(`种子 ${SEED}: 入口走廊带沙块计数`, async () => {
      const world = await generateWorld({ width: 4200, height: 1200, seedText: SEED, evil: 0 });
      const st = world.store;
      const dx = (world as unknown as { dungeonX?: number }).dungeonX ?? 0;
      const dy = (world as unknown as { dungeonY?: number }).dungeonY ?? 0;
      console.log(`seed=${SEED} dungeonX=${dx} dungeonY=${dy}`);

      // 计数带:x±60、y∈[dy-40, dy+60](走廊上空+大厅带)。修复前用户种子=1831,修复后=321
      const sandCells: Array<[number, number]> = [];
      for (let x = dx - 60; x <= dx + 60; x++) {
        for (let y = dy - 40; y <= dy + 60; y++) {
          if (x < 0 || y < 0 || x >= st.w || y >= st.h) continue;
          const i = st.idx(x, y);
          if (st.flags[i] && /sand/.test(keyOf(st.type[i]))) sandCells.push([x, y]);
        }
      }
      console.log(`seed=${SEED} 走廊带沙块=${sandCells.length}`);

      if (DUMP) {
        const x0 = Math.max(1, dx - 45), x1 = Math.min(st.w - 2, dx + 45);
        const y0 = Math.max(1, dy - 35), y1 = Math.min(st.h - 2, dy + 95);
        const lines: string[] = [];
        for (let y = y0; y <= y1; y++) {
          let row = '';
          for (let x = x0; x <= x1; x++) {
            const i = st.idx(x, y);
            let ch = '.';
            if (st.flags[i]) {
              const key = keyOf(st.type[i]);
              ch = /sand/.test(key) ? 'S'
                : /dungeon|blue_brick|green_brick|pink_brick/.test(key) ? 'D' : '#';
            } else if (st.liquid[i] > 0) ch = '~';
            row += ch;
          }
          lines.push(`${y.toString().padStart(4)} ${row}`);
        }
        console.log(lines.join('\n'));
      }
    }, 300000);
  }
});
