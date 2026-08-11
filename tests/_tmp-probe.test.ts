import { describe, it } from 'vitest';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { rollChestLoot } from '../src/world/gen/vanilla/BuriedChestsPass';
import { RNG } from '../src/core/rng';

describe('probe', () => {
  it('introspect 832/4281', () => {
    for (const id of [832, 4281]) {
      const k = VANILLA_ITEM_KEY_BY_ID[id];
      console.log('id', id, 'key', k, 'byKey', ITEM_BY_KEY[k ?? '']);
    }
    console.log('snake832', ITEM_BY_KEY['vi_832_living_wood_wand']);
    console.log('snake4281', ITEM_BY_KEY['vi_4281_finch_staff']);
    console.log('total items', ITEM_DEFS.length);
    // bare id path
    const loot = rollChestLoot({
      rng: new RNG(1), gs: { worldSurface: 200, rockLevel: 400, oreTiers: { copper: 0, iron: 0, silver: 0, gold: 0 } } as never,
      gy: 300, flags: {}, mainKey: null, worldH: 600,
    }, 832);
    console.log('bare-id loot ids', JSON.stringify(loot.filter(Boolean)));
    // key path
    const loot2 = rollChestLoot({
      rng: new RNG(1), gs: { worldSurface: 200, rockLevel: 400, oreTiers: { copper: 0, iron: 0, silver: 0, gold: 0 } } as never,
      gy: 300, flags: {}, mainKey: 'vi_832_living_wood_wand', worldH: 600,
    }, 832);
    console.log('key loot ids', JSON.stringify(loot2.filter(Boolean)));
    // orphan: explicit vi_N_ keys whose N is absent from vanilla.json (vid() would drop bare id)
    const orphans: string[] = [];
    for (const k of Object.keys(ITEM_BY_KEY)) {
      const m = /^vi_(\d+)_/.exec(k);
      if (!m) continue;
      if (!VANILLA_ITEM_KEY_BY_ID[Number(m[1])]) orphans.push(k);
    }
    console.log('orphan vi_ keys (id not in vanilla.json):', orphans.length, orphans.slice(0, 20).join(','));
    // duplicate registration: same vanilla id with both explicit key and canonical camel key
    let dup = 0;
    const byVid = new Map<number, string[]>();
    for (const k of Object.keys(ITEM_BY_KEY)) {
      const m = /^vi_(\d+)_/.exec(k);
      if (!m) continue;
      const id = Number(m[1]);
      byVid.set(id, [...(byVid.get(id) ?? []), k]);
    }
    for (const [, ks] of byVid) if (ks.length > 1) dup++;
    console.log('vanilla ids registered under multiple keys:', dup);
  });
});
