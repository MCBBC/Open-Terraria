import { it } from 'vitest';
import { TILE_BY_KEY } from '../src/data/tiles';
it('dbg5', async () => {
  const m = await import('../src/world/Banners');
  const t = TILE_BY_KEY['v_91_banners'];
  const map = new Map<string, { t: number; fx: number; fy: number }>();
  map.set('10,10', { t, fx: 1944, fy: 0 });
  const store = {
    idx: (x: number, y: number) => x * 100000 + y,
    isActive: (x: number, y: number) => map.has(`${x},${y}`),
    type: new Proxy({}, { get: (_t: unknown, p: string | symbol) => map.get(String(p))?.t ?? 0 }),
    frameX: new Proxy({}, { get: (_t: unknown, p: string | symbol) => map.get(String(p))?.fx ?? 0 }),
    frameY: new Proxy({}, { get: (_t: unknown, p: string | symbol) => map.get(String(p))?.fy ?? 0 }),
  } as never;
  console.log('type read:', store.type[store.idx(10,10)], 'expect', t);
  const out = m.scanBannerNpcs(store as never, 0, 0, 20, 20);
  console.log('out:', [...out]);
});
