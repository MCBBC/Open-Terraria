// IIII48 仪Y：抓 Reset ⑱ 丛林 origin 掷的 raw 样本 → 双带换算对照。
import { it } from 'vitest';
import { RNG } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

it.skipIf(process.env.SW_I48Y !== '1')('i48y jungle roll capture', async () => {
  let raws: number[] = [];
  const oIS = (RNG.prototype as unknown as Record<string, unknown>).nextIntRange as never;
  void oIS;
  // 钩 UnifiedRandom.internalSample 通过 __swOnRoll 计数即可；在 dungeonSide 掷后
  // 的下一次 Next(15,30)-风格调用前……更直接：从生成事件里取 gs.jungleX 新旧两算。
  const RNGp = RNG.prototype as unknown as { nextIntRange: (a: number, b: number) => number };
  const origNextIntRange = RNGp.nextIntRange;
  const hits: Array<{ a: number; b: number; v: number }> = [];
  RNGp.nextIntRange = function (this: unknown, a: number, b: number) {
    const r = origNextIntRange.call(this, a, b);
    if ((a === 20 && b === 35) || (a === 15 && b === 30)) {
      if (hits.length < 4) {
        hits.push({ a, b, v: r });
        // raw 反推：v=trunc(s*(b-a))+a ⇒ s∈[v-a,(v+1-a))/(b-a)
        console.log(`jungle-band call Next(${a},${b}) → ${r} (raw s∈[${(r - a) / (b - a)},${(r + 1 - a) / (b - a)}))`);
      }
    }
    return r;
  };
  await generateWorld({ width: 4200, height: 1200, seedText: '1138154190', evil: 0, seedFlags: { remix: true } });
  RNGp.nextIntRange = origNextIntRange;
  console.log('hits:', JSON.stringify(hits));
}, 900_000);
