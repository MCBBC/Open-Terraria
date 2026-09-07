// SW-BJ8 probe: post-shrink registration integrity across key ranges
import { describe, it, expect } from 'vitest';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

describe('SW-BJ8 probe: registration integrity', () => {
  it('banners/blocks/walls/late items all resolve + count', () => {
    const missing: number[] = [];
    const probes = [1615, 1630, 1650, 2762, 3262, 4254, 4851, 4857, 4858, 5000, 5126, 5355, 5358, 5359, 5360, 5453, 5555];
    for (const vid of probes) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      const iid = key !== undefined ? ITEM_BY_KEY[key] : undefined;
      if (!key || iid === undefined || !ITEM_DEFS[iid]) missing.push(vid);
    }
    console.log('ITEM_DEFS.length =', ITEM_DEFS.length);
    console.log('missing probes =', missing);
    expect(missing).toEqual([]);
  });
});
