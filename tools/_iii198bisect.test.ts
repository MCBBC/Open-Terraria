// IIII198: FC pass 段标 bisect——罐簇在各段标处的活性
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198BISECT=1 npx vitest run tools/_iii198bisect.test.ts
const RUN = process.env.SW_I198BISECT === '1';
const it = RUN ? itRaw : itRaw.skip;

import { generateWorld, onGenStateCreated } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

it('iii198 fc bisect', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  let store: { type: Uint16Array; flags: Uint8Array; w: number } | null = null;
  const dump = (tag: string) => {
    if (!store) return;
    const cells = [[1435, 520], [1436, 520], [1435, 521], [1436, 521], [20, 832], [21, 832], [20, 833], [21, 833]];
    console.log(`[bisect] ${tag}: ${cells.map(([x, y]) => { const i = y * store!.w + x; return `(${x},${y})a${store!.flags[i] & 1}t${SHEET[store!.type[i]]}`; }).join(' ')}`);
  };
  (globalThis as unknown as { __swSeg?: (n: string) => void; __swFCMark?: (t: string) => void }).__swSeg = (n: string) => {
    if (n === 'FC-LOOP-END' || n === 'FC-668-END') dump(n);
  };
  try {
    (globalThis as unknown as { __swFCMark?: (t: string) => void }).__swFCMark = (t: string) => {
      if (t === 'FSIN' || t === 'FSOUT' || t === 'SCIN' || t === 'SCOUT') dump(t);
    };
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
      onWorldPartial: (w) => { if (!store) store = w.store as never; },
    });
  } finally {
      (globalThis as unknown as { __swSeg?: undefined }).__swSeg = undefined;
      (globalThis as unknown as { __swFCMark?: undefined }).__swFCMark = undefined;
    }
}, 900_000);
