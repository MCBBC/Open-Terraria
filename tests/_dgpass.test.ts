import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { writeFileSync } from 'node:fs';
it('per-pass ash', async () => {
  // 借 onWorldPartial 逐 pass 数 ash
  let last = -1;
  const lines: string[] = [];
  const world = await generateWorld({
    width: 4200, height: 1200, seedText: 'registry-clear-1',
    onWorldPartial: (w, idx) => {
      const st = w.store;
      let ash = 0;
      for (let i = 0; i < st.type.length; i++) {
        if (st.flags[i] && TILE_DEFS[st.type[i]]?.vanilla?.sheet === 57) ash++;
      }
      lines.push(`${idx}: ${ash}`);
      last = idx;
    },
  } as never);
  void world; void last;
  writeFileSync('/tmp/ash-by-pass.txt', lines.join('\n'));
  console.log('written');
}, 900000);
