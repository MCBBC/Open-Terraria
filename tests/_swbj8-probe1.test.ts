// SW-BJ8 probe: vid resolution + coin registration after ITEM_DEFS shrink
import { describe, it, expect } from 'vitest';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { vanillaIdOfItemKey } from '../src/data/vanillaRecipes';

describe('SW-BJ8 probe: vid resolution', () => {
  it('coins registered under VI keys', () => {
    for (const vid of [71, 72, 73, 74]) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      console.log('vid', vid, 'key', key, 'internal', ITEM_BY_KEY[key]);
      expect(key, `VANILLA_ITEM_KEY_BY_ID[${vid}]`).toBeTruthy();
      const iid = ITEM_BY_KEY[key!];
      expect(iid, `ITEM_BY_KEY[${key}]`).toBeDefined();
      const def = ITEM_DEFS[iid!];
      expect(def).toBeDefined();
      console.log('  def.vid =', def.vid, 'key =', def.key, 'resolve =', (def.vid ?? vanillaIdOfItemKey(def.key)));
      expect(def.vid ?? vanillaIdOfItemKey(def.key)).toBe(vid);
    }
  });
  it('common sellable items resolve vid', () => {
    for (const vid of [39, 23, 8, 9, 169, 5095, 75]) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      const iid = ITEM_BY_KEY[key!];
      const def = iid !== undefined ? ITEM_DEFS[iid] : undefined;
      console.log('vid', vid, 'key', key, 'iid', iid, 'def.vid', def?.vid);
      expect(def).toBeDefined();
      expect(def!.vid ?? vanillaIdOfItemKey(def!.key)).toBe(vid);
    }
  });
});
