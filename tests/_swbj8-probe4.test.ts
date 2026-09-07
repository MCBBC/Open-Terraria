import { describe, it, expect } from 'vitest';
import { prefixValueMul } from '../src/data/vanillaPrefixes';
import { computeSellValue, itemValueWithPrefix, itemStoreValue } from '../src/stats/SellChain';

describe('SW-BJ8 probe4: prefix/sell math sanity', () => {
  it('prefixValueMul finite for common prefixes 1-84', () => {
    for (let p = 1; p <= 84; p++) expect(Number.isFinite(prefixValueMul(p)), `prefix ${p}`).toBe(true);
  });
  it('sell math for a spread of vids', () => {
    for (const vid of [8, 23, 39, 75, 132, 3507, 757]) {
      const v = itemStoreValue(vid);
      const q = computeSellValue(vid, 1);
      console.log('vid', vid, 'value', v, 'quote', q.copper, q.sellable);
      expect(Number.isFinite(q.copper)).toBe(true);
    }
  });
});
