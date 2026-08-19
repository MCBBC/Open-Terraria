// WWWW：s12345 墙差异 x 直方图——归因（本批 vs 并行会话在途）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

it('s12345 wall diff x-histogram', async () => {
  const van = parseWld(readFileSync('/tmp/vserver86/s12345.wld'));
  const world = await generateWorld({ seed: 12345, evil: 1, size: 'small' } as never) as unknown as {
    store: { w: number; h: number; wall: Uint16Array; flags: Uint8Array; type: Int32Array };
  };
  const st = world.store;
  const W = van.header.maxTilesX, H = van.header.maxTilesY;
  const vt = van.tiles;
  const colDiff = new Int32Array(W);
  let total = 0;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      const vw = vt[i].wall;
      const jw = st.wall[i];
      if (vw !== jw) { colDiff[x]++; total++; }
    }
  }
  console.log(`wall total diff = ${total}`);
  // 200 列桶
  const buckets = new Map<number, number>();
  for (let x = 0; x < W; x++) {
    const b = Math.floor(x / 200) * 200;
    buckets.set(b, (buckets.get(b) ?? 0) + colDiff[x]!);
  }
  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [b, n] of sorted) console.log(`x[${b},${b + 200}) : ${n}`);
}, 300_000);
