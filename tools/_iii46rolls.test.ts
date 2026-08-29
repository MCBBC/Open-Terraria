// IIIII46 掷流窗仪（JS 侧）：在指定 reseed 标签窗口内记录 internalSample 值序列，
// 与 x86 rig 的 SW_ROLLWIN 输出逐值对拍，定位 pass 内首颗错位骰。
// 用法：cd game && SW_I46_ROLL=1 SW_I46_FROM='UndergroundHousesAndBuriedChests' \
//       SW_I46_TO='SurfaceChests' npx vitest run tools/_iii46rolls.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I46_ROLL === '1';
const FROM = process.env.SW_I46_FROM ?? 'UndergroundHousesAndBuriedChests';
const TO = process.env.SW_I46_TO ?? 'SurfaceChests';
const SEED = process.env.SW_I46_SEED ?? '1999040562';

(RUN ? it : it.skip)('I46 roll window exporter', async () => {
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const URp = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oInternal = (URp.internalSample as ((this: unknown) => number) | undefined);
  if (!oInternal) throw new Error('internalSample 不可访问');
  let recording = false;
  const out: string[] = [];
  let curLabel = '';
  let curInst: unknown = null;
  let winInst: unknown = null;
  // 追踪当前主实例：任一 internalSample 时登记（首个出现的实例=主流），
  // 开窗时锁存，之后仅记录同实例样本（XTRA 子流剔除）。
  // reseed 包装：换标签；FROM→开录，TO→关录并立刻写盘
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii46')) {
        lab = labelOf(m[1], Number(m[2]));
        break;
      }
    }
    if (recording && !out.__closed) {
      writeFileSync('/tmp/iii48-out/js-rollwin.txt', out.join('\n'));
      console.log(`[i46rolls] closed @${lab} samples=${out.length}`);
      out.__closed = true as never; void 0;
    }
    if (!recording && lab === FROM) {
      recording = true;
      winInst = curInst;
      console.log(`[i46rolls] opened @${lab}`);
    }
    curLabel = lab;
    return oReseed.call(this, s);
  };
  RNGp.reseed.__rec = { get recording() { return recording; } } as never;
  URp.internalSample = function (this: unknown): number {
    const v = oInternal.call(this);
    if (recording && !(out as unknown as { __closed?: boolean }).__closed) {
      const stack = new Error().stack ?? '';
      let tag = '';
      for (const line of stack.split('\n')) {
        const m = line.match(/src\/world\/gen\/([\w./]+\.ts):\d+/);
        if (m) { tag = m[1]; break; }
      }
      out.push(`${v}|${tag}`);
    }
    return v;
  };
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: 0,
    seedFlags: { tenthAnniversary: true },
  });
  RNGp.reseed = oReseed;
  URp.internalSample = oInternal;
}, 900_000);

import { readFileSync } from 'node:fs';
function labelOf(file: string, line: number): string {
  const src = readFileSync(file, 'utf8').split('\n');
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return '';
}
