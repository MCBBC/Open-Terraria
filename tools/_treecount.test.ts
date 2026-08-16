// 一次性诊断：x2369 云层复验（全管线末态,云族格在岛#2 bbox 内）
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('x2369 cloud presence', async () => {
  const world = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 } as never);
  const st = (world as unknown as { store: { w: number; h: number; type: Int16Array; flags: Uint8Array; idx(x: number, y: number): number } }).store;
  const CLOUD = new Set([189, 196, 717, 718, 719]);
  let cloudCells = 0, yMin = 9999, yMax = 0, xMin = 9999, xMax = 0;
  for (let y = 80; y < 200; y++) for (let x = 2330; x < 2400; x++) {
    const i = st.idx(x, y);
    if (st.flags[i] && CLOUD.has(SHEET[st.type[i]])) {
      cloudCells++;
      yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
      xMin = Math.min(xMin, x); xMax = Math.max(xMax, x);
    }
  }
  console.log(`x2330-2400 云族格=${cloudCells} bbox=(${xMin},${yMin})-(${xMax},${yMax})`);
  console.log(cloudCells > 500 ? 'x2369 云层存在 ✓' : '!! 云层仍缺失');
}, 480000);
