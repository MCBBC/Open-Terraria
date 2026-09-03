import { it } from 'vitest';
it('vid probe', async () => {
  const { VI_ID } = await import('../src/data/itemKeys');
  const { VANILLA_ITEM_KEY_BY_ID } = await import('../src/data/items');
  console.log('VI_ID(5001)=', VI_ID(5001), 'VI_ID(678)=', VI_ID(678));
  console.log('key5001=', VANILLA_ITEM_KEY_BY_ID[5001], 'key678=', VANILLA_ITEM_KEY_BY_ID[678]);
});
