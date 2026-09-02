import { it } from 'vitest';
import { ITEM_DEFS } from '../src/data/items';
it('vid 40 vs 42', () => {
  for (const id of [40, 41, 42, 9, 72, 28, 2350, 168, 3019, 20, 8, 218, 683, 4345, 704, 2322, 290]) {
    const idx = ITEM_DEFS.findIndex((d) => (d as unknown as { vid?: number })?.vid === id
      || new RegExp(`vi_${id}_`).test(d?.key ?? ''));
    console.log(`I166V2 vanilla=${id} -> sw=${idx} key=${ITEM_DEFS[idx]?.key}`);
  }
});
