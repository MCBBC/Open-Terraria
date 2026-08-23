// 一次性诊断（ZZZZZZ 批）：NOTRAPS #59 流对拍 JS 侧——BuriedChests 窗
// （▶UndergroundHousesAndBuriedChests → ▶SurfaceChests）掷签名流，格式对齐 x86 span
// （a N / b min max；d 通道剥除）。用毕即删。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_Z3 === '1';
const W = Number(process.env.SW_Z3_W ?? 4200), H = Number(process.env.SW_Z3_H ?? 1200);
const SEED = process.env.SW_Z3_SEED ?? '1896728457';
const FLAGS = (process.env.SW_Z3_FLAGS ?? 'noTraps').split(',').filter(Boolean);
const EVIL = Number(process.env.SW_Z3_EVIL ?? 1);
const OUT = process.env.SW_Z3_OUT ?? '/tmp/zzzzzz-out/jspan-buried.txt';
const LO = Number(process.env.SW_Z3_LO ?? 961), HI = Number(process.env.SW_Z3_HI ?? 980);

(RUN ? it : it.skip)('zzzzzz js span', async () => {
  const lines: string[] = [];
  let on = false;
  let done = false;
  const urp = UnifiedRandom.prototype as unknown as Record<string, (...a: never[]) => number>;
  const wrap = (m: 'nextInt' | 'nextIntRange' | 'next') => {
    const o = urp[m]!;
    urp[m] = function (this: unknown, ...a: never[]) {
      const r = o.apply(this, a);
      if (on) {
        if (m === 'nextInt') lines.push(`a ${a[0]} v=${r}`);
        else if (m === 'nextIntRange') lines.push(`b ${a[0]} ${a[1]} v=${r}`);
      }
      return r;
    };
  };
  wrap('nextInt'); wrap('nextIntRange'); wrap('next');
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (!done) {
      const stack = new Error().stack ?? '';
      const m = stack.match(/WorldGen\.ts:(\d+):\d+/);
      if (m) {
        const ln = Number(m[1]);
        if (ln >= LO && ln <= LO + 2) { on = true; lines.length = 0; }
        else if (ln >= HI - 2 && ln <= HI) { on = false; done = true; }
      }
    }
    return oReseed.call(this, s);
  };
  const seedFlags: Record<string, boolean> = {};
  for (const f of FLAGS) seedFlags[f] = true;
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(seedFlags).length ? seedFlags : undefined,
    });
  } finally {
    RNGp.reseed = oReseed;
    delete urp.nextInt; delete urp.nextIntRange; delete urp.next;
  }
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`[jspan] ${lines.length} lines → ${OUT}`);
}, 600_000);
