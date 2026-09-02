import { it } from 'vitest';
import { ITEM_DEFS } from '../src/data/items';
it('vid mapping check', () => {
  const want = [86, 35, 1342, 23, 1348, 2, 1335, 1374, 1336];
  for (const id of want) {
    const d = ITEM_DEFS[id];
    console.log(`I166VID sw=${id} key=${d?.key} vanilla=${(d as unknown as {vanilla?:number})?.vanilla ?? (d as unknown as {vid?:number})?.vid}`);
  }
});
