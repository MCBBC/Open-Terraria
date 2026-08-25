// NTBB3 一次性探针：RNG.int 实参录制——神庙槽内 (min,max) 即 bbox（用完即删）
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_NTROLL === '1';
(RUN ? it : it.skip)('record rng.int args', async () => {
  const h = openSync('/tmp/qqq-out/ntargs.txt', 'w');
  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const origSample = proto.internalSample as (this: UnifiedRandom) => number;
  let n = 0;
  let inWin = false;
  proto.internalSample = function (this: UnifiedRandom) {
    const v = origSample.call(this);
    if (n === 93_436_773) inWin = true;
    if (n === 93_438_740) inWin = false;
    n++;
    return v;
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oInt = RNGp.int as (this: RNG, a: number, b: number) => number;
  RNGp.int = function (this: RNG, a: number, b: number) {
    if (inWin) writeSync(h, `int(${a},${b})\n`);
    return oInt.call(this, a, b);
  };
  const oIntNext = RNGp.nextInt as (this: RNG, m: number) => number;
  RNGp.nextInt = function (this: RNG, m: number) {
    if (inWin) writeSync(h, `nextInt(${m})\n`);
    return oIntNext.call(this, m);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1896728457', evil: 1,
      seedFlags: { noTraps: true },
    });
  } finally {
    RNGp.int = oInt;
    RNGp.nextInt = oIntNext;
    proto.internalSample = origSample;
    closeSync(h);
  }
}, 600_000);
