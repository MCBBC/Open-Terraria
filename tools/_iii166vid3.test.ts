import { it } from 'vitest';
import { ITEM_DEFS } from '../src/data/items';
it('sw87 and friends', () => {
  for (const id of [87, 88, 85, 86, 76, 144, 1843]) {
    const d = ITEM_DEFS[id] as unknown as { key?: string; vid?: number };
    console.log(`I166V3 sw=${id} key=${d?.key} vid=${d?.vid}`);
  }
});
