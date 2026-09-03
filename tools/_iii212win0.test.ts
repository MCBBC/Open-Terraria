// IIII212 批一次性取证仪②：JS pass-0（原版地形）主实例样本流捕获（与 x86 rig 窗 0-0 对拍）。
// 用法：cd game && SW_I212W0=1 npx vitest run tools/_iii212win0.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I212W0 === '1';
const OUT = process.env.SW_I212_OUT ?? '/tmp/iii212-out';
const SEED = process.env.SW_I212_SEED ?? '9293480';

(RUN ? it : it.skip)('iii212 js pass-0 roll stream', { timeout: 1_800_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;
  mkdirSync(OUT, { recursive: true });
  const vals: number[] = [];
  let open = false;
  let closed = false;
  let firstSite = '';
  RNGp.reseed = function (this: unknown, s: number) {
    if (!open && !closed) {
      open = true;
      const st = (new Error().stack ?? '').split('\n');
      for (const line of st) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) { firstSite = `${m[1]}:${m[2]}`; break; }
      }
      console.log(`[I212W0] opened at reseed ${firstSite}`);
    }
    return oReseed.call(this, s);
  };
  g.__swOnRoll = (v: number, inst?: object) => {
    if (open && !closed) vals.push(v);
    oRoll?.(v, inst);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
      onWorldPartial: (_w2, _i, name) => {
        if (name === '原版地形' && open && !closed) {
          closed = true;
          console.log(`[I212W0] closed after slot '${name}' len=${vals.length}`);
        }
      },
    });
  } finally {
    writeFileSync(`${OUT}/js-win0.txt`, vals.map((v) => String(v >>> 0)).join('\n') + '\n');
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
  }
});
