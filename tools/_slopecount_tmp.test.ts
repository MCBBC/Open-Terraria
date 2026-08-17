import { it } from 'vitest';
const RUN = process.env.SW_SC === '1';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';
(RUN ? it : it.skip)('slope/half totals: vanilla wld vs our gen', async () => {
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s111.wld')));
  let vh = 0, vs = 0, vslope1 = 0;
  for (let i = 0; i < wld.tiles.half.length; i++) {
    if (wld.tiles.half[i]) vh++;
    if (wld.tiles.slope[i]) { vs++; if (wld.tiles.slope[i] === 1) vslope1++; }
  }
  console.log(`vanilla s111: half=${vh} slope=${vs} (slope1=${vslope1})`);
  const world = await generateWorld({ size: 0, width: 4200, height: 1200, seedText: '111', evil: 0 });
  const st = world.store;
  let jh = 0, js = 0, jslope1 = 0;
  for (let i = 0; i < st.w * st.h; i++) {
    if (st.half[i]) jh++;
    if (st.slope[i]) { js++; if (st.slope[i] === 1) jslope1++; }
  }
  console.log(`our s111 final: half=${jh} slope=${js} (slope1=${jslope1})`);
}, 300000);
