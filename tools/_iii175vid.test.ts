import { it } from 'vitest';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
(it)('voice family vid check', () => {
  for (const v of [5499, 5500, 5501, 5502, 5503, 5504, 5505, 5506, 5507, 5508, 5509, 5484, 5485, 5534]) {
    const k = VANILLA_ITEM_KEY_BY_ID[v];
    const iid = k ? ITEM_BY_KEY[k] : undefined;
    console.log(`voice ${v} -> ${k ?? 'MISSING'} -> ${iid ?? 'MISSING'}`);
  }
});
