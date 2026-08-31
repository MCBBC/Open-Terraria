// IIII99b：沉降域击杀台账（__swLqKill 钩探针）——验证 Keg 级联是否落地。
// 用法：cd game && SW_MB_1457=1 SW_I08KL=1 npx vitest run tools/_iii108kl.test.ts
import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I08KL === '1';
const LOG = '/tmp/iii108-out/js-kl.txt';

(RUN ? it : it.skip)('III99b settle kill ledger probe', async () => {
  appendFileSync(LOG, '');
  let mark = '#start';
  const g = globalThis as unknown as { __swLqKill?: (x: number, y: number, sheet: number, fx: number, fy: number, liq: number, lty: number) => void };
  g.__swLqKill = (x, y, sheet, fx, fy, liq, lty) => {
    if (x >= 2690 && x <= 2745 && y >= 690 && y <= 1110) {
      appendFileSync(LOG, `${mark} KT|${x},${y}|sheet${sheet}|fx${fx},fy${fy}|l${liq}lty${lty}\n`);
    }
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '771002', evil: 0,
      seedFlags: { surfaceIsMushrooms: true },
      onWorldPartial: (_w, i, pn) => { appendFileSync(LOG, `${mark} --SLOT-END ${i}:${pn}\n`); mark = `${i}:${pn}`; },
    });
  } finally { delete g.__swLqKill; }
  console.log(`done ${LOG}`);
}, 900_000);
