// IIII99e:rainbow #76 巨石选型账本(VID 事件全量)
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_RBVID === '1';

(RUN ? it : it.skip)('boulder vid ledger', async () => {
  const evs: string[] = [];
  (globalThis as unknown as { __swTrapEv?: (k: string, a: number, b: number, v: number) => void })
    .__swTrapEv = (k, a, b, v) => { if (k === 'VID') evs.push(`${a},${b},${v}`); };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '771006', evil: 0, seedFlags: { rainbowStuff: true }, onWorldPartial: () => {} });
  } finally {
    (globalThis as unknown as { __swTrapEv?: unknown }).__swTrapEv = undefined;
  }
  console.log(`VID events=${evs.length}`);
  writeFileSync('/tmp/iii118-out/rbalt/js-vid.txt', evs.join('\n') + '\n');
}, 900_000);
