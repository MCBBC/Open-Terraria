// FFF 批一次性探针：NOTRAPS 链 BuriedChests 窗掷流重摄（ZZZZ jspan-buried2 同构）
// 用法：cd game && SW_FFF=1 npx vitest run tools/_ffffff1.test.ts
// 产物：/tmp/ffffff-jspan.txt（b <min> <maxEx> v=<res> 行 + RESEED 标记）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_FFF === '1';
(RUN ? it : it.skip)('FFF span re-shoot (BuriedChests window)', async () => {
  const lines: string[] = [];
  let on = false;
  const Rp = RNG.prototype as unknown as Record<string, (this: unknown, ...a: never[]) => unknown>;
  const oInt = Rp.int as (this: unknown, min: number, max: number) => number;
  const oReseed = Rp.reseed as (this: unknown, s: number) => void;
  Rp.int = function (this: unknown, min: number, max: number) {
    const r = oInt.call(this, min, max);
    if (on) lines.push(`b ${min} ${max + 1} v=${r}`);
    return r;
  };
  Rp.reseed = function (this: unknown, s: number) {
    if (on) lines.push(`RESEED ${s}`);
    return oReseed.call(this, s);
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1896728457', evil: 1,
      seedFlags: { noTraps: true },
      onWorldPartial: (_w, i, name) => {
        if (name === '雕像宝箱') on = false;
        else if (i === 4) on = true;
      },
    });
  } finally {
    Rp.int = oInt; Rp.reseed = oReseed;
  }
  writeFileSync('/tmp/ffffff-jspan.txt', lines.join('\n') + '\n');
  console.log(`fff span lines: ${lines.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 600_000);
