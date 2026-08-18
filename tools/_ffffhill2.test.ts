// FFFF 山丘逐行范围对拍：dirt/grass(0/2) 的逐行左右界 wld vs JS + slime hw 理论值
// SW_FFFF2=1 npx vitest run tools/_ffffhill2.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFF2;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

describe.skipIf(!RUN)('FFFF hill extents', () => {
  it('per-row', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
    });
    const st = world.store;
    const i = wld.dungeonX, n7 = wld.dungeonY, oy = n7 - 4;
    const isDirtGrass = (t: number, act: boolean): boolean => act && (t === 0 || t === 2);
    // 只看不含柱/壳的窗口上下带（142..154）：左右界按 dirt/grass 计
    for (let y = 140; y <= 196; y++) {
      let wl: number[] = [], js: number[] = [];
      for (let x = i - 50; x <= i + 50; x++) {
        const k = y * st.w + x;
        if (isDirtGrass(wld.tiles.type[k], wld.tiles.active[k] !== 0)) wl.push(x);
        const jk = st.idx(x, y);
        if (isDirtGrass(SHEET[st.type[jk]], st.flags[jk] !== 0)) js.push(x);
      }
      const dy = (y - oy) / 1.1;
      const hw = Math.trunc(Math.min(40 * 0.9, 0.9 * Math.sqrt(41 * 41 - dy * dy)));
      const ext = (a: number[]): string => a.length ? `${a[0]}..${a[a.length - 1]}(${a.length})` : '-';
      const mark = (wl.length === js.length && wl.join() === js.join()) ? ' ' : '*';
      console.log(`${mark}y=${y} dy=${dy.toFixed(3)} hw=${hw} W[${ext(wl)}] J[${ext(js)}]`);
    }
  }, 600000);
});
