// IIII198: 箱内物品 id 的 EW_INTERNAL_TO_VID 覆盖普查
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198MAP=1 npx vitest run tools/_iii198map.test.ts
const RUN = process.env.SW_I198MAP === '1';
const it = RUN ? itRaw : itRaw.skip;

import { generateWorld } from '../src/world/gen/WorldGen';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from '../src/data/items';
import { ITEM_BY_KEY } from '../src/data/items';

it('iii198 ew map coverage', async () => {
  const m = new Map<number, number>();
  for (const [vidStr, k] of Object.entries(VANILLA_ITEM_KEY_BY_ID as Record<string, string>)) {
    const iid = (ITEM_BY_KEY as Record<string, number | undefined>)[k];
    if (iid !== undefined && !m.has(iid)) m.set(iid, Number(vidStr));
  }
  let out = '';
  await generateWorld({
    width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
    onWorldPartial: (w, i) => {
      if (i !== 57) return;
      const chests = (w as unknown as { chests: Array<{ items: Array<{ id: number; stack: number } | null> } | null> }).chests;
      const unmapped = new Map<number, number>();
      let totalItems = 0, immuneHits = 0;
      for (const c of chests) {
        if (!c) continue;
        for (const it of c.items) {
          if (!it || it.id === 0) continue;
          totalItems++;
          if (!m.has(it.id)) unmapped.set(it.id, (unmapped.get(it.id) ?? 0) + 1);
          else {
            const vid = m.get(it.id)!;
            if ([0, 1156, 1571, 1569, 1260, 1572, 4607].includes(vid)) immuneHits++;
          }
        }
      }
      out = `items=${totalItems} unmapped=${unmapped.size} [${[...unmapped.entries()].slice(0, 10).map(([k, v]) => `${k}×${v}`).join(' ')}] immune=${immuneHits}`;
    },
  });
  console.log('[map]', out);
}, 900_000);
