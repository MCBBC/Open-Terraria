import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const V = new Map<number, string>();
for (const d of TILE_DEFS) { const s = d.vanilla?.sheet; if (typeof s === 'number') V.set(s, d.key); }

it('12345 JS dungeon tower composition', async () => {
  const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
  const st = world.store;
  const dx = world.dungeonX ?? 0, dy = world.dungeonY ?? 0;
  console.log(`JS dungeon=(${dx},${dy})`);
  const typeCount = new Map<number, number>();
  for (let x = Math.max(0, dx - 30); x < Math.min(4200, dx + 30); x++) {
    for (let y = Math.max(0, dy - 60); y < Math.min(1200, dy + 10); y++) {
      const i = y * 4200 + x;
      if (st.flags[i]) {
        const t = st.type[i];
        const vs = V.get(t) ?? `unm${t}`;
        const key = `${vs}(v${t < 100 ? t : '?'})`;
        typeCount.set(key, (typeCount.get(key) ?? 0) + 1);
      }
    }
  }
  const top = [...typeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('JS tower area:', top.map(([t, c]) => `${t}x${c}`).join(' '));
}, 300000);
