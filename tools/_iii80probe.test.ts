// IIIII80 terrain-profile 探针：JS(with/without flag) vs x86-toad dump 首活性行剖面。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I80_PROBE === '1';
const ACT = process.env.SW_I80_ACT ?? '/tmp/iii80-out/x86-toad/000_Terrain.act';
const W = Number(process.env.SW_I80_W ?? 4200);

function prof(flags?: Record<string, boolean>): number[] {
  let out: number[] = [];
  return generateWorld({
    width: W, height: 1200, seedText: String(process.env.SW_I80_SEED ?? 771002),
    evil: 0, seedFlags: flags,
    onWorldPartial: (w2, i) => {
      if (i !== 0) return;
      const st = (w2 as unknown as { store: { w: number; h: number; idx: (x: number, y: number) => number; flags: Uint8Array } }).store;
      const cols = [0, 1, 100, 1000, 2100, 3197, 4000];
      const { writeFileSync } = require('node:fs');
      const fa = new Uint8Array(st.w * st.h);
      const ft = new Uint16Array(st.w * st.h);
      for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] & 1) { fa[y * st.w + x] = 1; ft[y * st.w + x] = st.type[i]; }
      }
      try { writeFileSync('/tmp/iii80-out/js-slot0.mushroom.act', Buffer.from(fa)); writeFileSync('/tmp/iii80-out/js-slot0.mushroom.typ', Buffer.from(ft.buffer)); } catch {}
      try { writeFileSync('/tmp/iii80-out/js-slot0.' + (flags && flags.surfaceIsMushrooms ? '' : 'plain.') + 'prof', Buffer.from(JSON.stringify(cols.map((x) => { for (let y = 20; y < st.h; y++) if (st.flags[st.idx(x, y)]) return y; return -1; })))); } catch {}
    },
  }).then(() => out);
}

(RUN ? it : it.skip)('iii80 terrain profile', async () => {
  const p0 = await prof(undefined);
  const pf = await prof({ surfaceIsMushrooms: true });
  console.log('JS plain   :', p0.join(','));
  console.log('JS mushroom:', pf.join(','));
  try {
    const b = readFileSync(ACT);
    const cols = [0, 1, 100, 1000, 2100, 3197, 4000];
    const xs = cols.map((x) => {
      for (let y = 20; y < 1200; y++) if (b[y * W + x]) return y;
      return -1;
    });
    console.log(`x86(${ACT.split('/').slice(-2)[0]}):`, xs.join(','));
  } catch (e) {
    console.log('x86 dump read skipped:', (e as Error).message);
  }
}, 900_000);
