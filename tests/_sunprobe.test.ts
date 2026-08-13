import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';

it('diag', async () => {
  const SF = TILE_BY_KEY['v_27_sunflower']!;
  const counts: string[] = [];
  const world = await generateWorld({
    width: 4200, height: 1200, seedText: '9293480', evil: 0,
    onWorldPartial: (w, _i, name) => {
      const st = w.store;
      let c = 0;
      for (let i = 0; i < st.type.length; i += 1) if (st.type[i] === SF) c++;
      counts.push(`${name}: ${c}`);
    },
  });
  let c = 0;
  const st = world.store;
  for (let i = 0; i < st.type.length; i++) if (st.type[i] === SF) c++;
  counts.push(`FINALIZE: ${c}`);
  console.log(counts.join(' | '));
}, 300000);
