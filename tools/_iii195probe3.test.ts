import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }

const RUN = process.env.SW_I195 === '1';
(RUN ? it : it.skip)('iii195 probe3 arm timeline', async () => {
  let cap: { type: Uint16Array; flags: Uint8Array; w: number } | null = null;
  const i397 = REV.get(397)!;
  const ocean397 = (): number => {
    if (!cap) return -1;
    let n = 0;
    for (let y = 272; y <= 410; y++) for (let x = 3878; x <= 4199; x++) {
      const i = y * cap.w + x;
      if ((cap.flags[i] & 1) && cap.type[i] === i397) n++;
    }
    return n;
  };
  const rows: string[] = [];
  let last = -1;
  (globalThis as unknown as { __swSeg?: unknown }).__swSeg = (n: string, d?: unknown) => {
    if (!cap) return;
    const v = ocean397();
    if (v !== last) { rows.push(`${n} ${d === undefined ? '' : (typeof d === 'object' ? JSON.stringify(d) : String(d))} ocean397=${v}`); last = v; }
  };
  (globalThis as unknown as { __swMbCap?: unknown }).__swMbCap = (gs: unknown, stt: never) => { cap = stt; };
  await generateWorld({ width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1 });
  writeFileSync('/tmp/iii195-out/ocean-timeline.txt', rows.join('\n'));
  console.log(`III195 timeline rows=${rows.length}`);
}, 900_000);
