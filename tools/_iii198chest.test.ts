import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

it('iii198 chest slot0 census', async () => {
  let out = '';
  await generateWorld({
    width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
    onWorldPartial: (w, i) => {
      if (i !== 57) return;
      const chests = (w as unknown as { chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> } | null> }).chests;
      let total = 0, nullFirst = 0, id0First = 0, emptyChest = 0, shortItems = 0;
      for (const c of chests) {
        if (!c) continue;
        total++;
        const it0 = c.items[0];
        if (!it0) nullFirst++;
        else if (it0.id === 0) id0First++;
        if (c.items.length === 0) emptyChest++;
        if (c.items.length < 40) shortItems++;
      }
      out = `chests=${total} nullFirst=${nullFirst} id0First=${id0First} emptyChest=${emptyChest} shortItems=${shortItems}`;
    },
  });
  console.log('[chest]', out);
}, 900_000);
