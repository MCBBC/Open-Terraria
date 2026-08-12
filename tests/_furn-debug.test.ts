import { it } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { getOrCreateFurniture } from '../src/world/FurnitureItems';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_STABLE_OF_INTERNAL, ITEM_INTERNAL_OF_STABLE } from '../src/data/items';

it('debug stable roundtrip', () => {
  const vid = 4;
  const iid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  const stable = ITEM_STABLE_OF_INTERNAL[iid];
  console.log('iid', iid, 'stable', stable, 'back', ITEM_INTERNAL_OF_STABLE.get(stable));
  console.log('stableOf4', ITEM_STABLE_OF_INTERNAL[4], 'backOf4', ITEM_INTERNAL_OF_STABLE.get(4));
  const w = new World(20, 20, 1, 'dbg');
  const rec = getOrCreateFurniture(w.furnitureItems, 'item_frame', 1, 1);
  rec.slots[0] = { id: iid, stack: 1, prefix: 2 };
  const json = saveGame(w, new Player(0, 0, new Inventory()), 0);
  const saved = JSON.parse(json).furniture;
  console.log('saved furniture', JSON.stringify(saved));
  const { world: w2 } = loadSave(json);
  console.log('loaded', JSON.stringify(w2.furnitureItems));
});
