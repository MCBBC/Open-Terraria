// IIII24 批诊断 f：全程样本值流（j-allvals）——与 x86 rig SW_ROLLALL 同口径
// （每个 InternalSample 一行），输出文本流 + 里程碑（里程碑行单独文件，避免污染数值流）。
// 用法：cd game && SW_III24F=1 npx vitest run tools/_iii24f.test.ts
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const OUT = '/tmp/iii24-out';

it('allvals js stream', async () => {
  const fd = openSync(`${OUT}/j-allvals.txt`, 'w');
  const fdM = openSync(`${OUT}/j-marks.txt`, 'w');
  let seq = 0;
  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (...a: unknown[]) => number;
  proto.internalSample = function (this: unknown, ...args: unknown[]): number {
    const v = orig.apply(this, args) as number;
    writeSync(fd, `${v}\n`);
    seq++;
    return v;
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1372357239', evil: -1 as const,
      seedFlags: { notTheBees: true },
      onWorldPartial: (w, i, pn) => {
        writeSync(fdM, `SLOT ${seq} #${i} ${pn}\n`);
      },
    });
  } finally {
    proto.internalSample = orig;
    closeSync(fd);
    closeSync(fdM);
  }
  console.log(`total samples=${seq}`);
}, 900_000);
