// OOOOOOO 批·②：micro pass 独立重放 + API 级掷流账（照妖镜转录验证）。
// 从 /tmp/ooo-out/mb-<SEED>/ 快照载入，Proxy 包装 RNG 记录每次调用的
// 方法/参数/**raw 样本锚**，定位与 x86 掷流的首分歧调用。
// 用法: SW_O1=1 SW_O1_SEED=9293480 npx vitest run tools/_ooo1.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_O1 === '1';
const SEED = process.env.SW_O1_SEED ?? '9293480';
const DIR = `/tmp/ooo-out/mb-${SEED}`;
const W = Number(process.env.SW_O1_W ?? 4200), H = Number(process.env.SW_O1_H ?? 1200);
const OUT = process.env.SW_O1_OUT ?? `/tmp/ooo-out/replay-${SEED}.txt`;

(RUN ? it : it.skip)('ooo1 micro pass replay with API-level roll log', async () => {
  const st = new TileStore(W, H);
  {
    const ld = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    const ld16 = (n: string) => new Uint16Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    st.type.set(ld16('type.bin')); st.flags.set(ld('flags.bin')); st.wall.set(ld16('wall.bin'));
    st.liquid.set(ld('liquid.bin')); st.liquidType.set(ld('liquidType.bin'));
    st.half.set(ld('half.bin')); st.slope.set(ld('slope.bin'));
    st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
    st.wire.set(ld('wire.bin')); st.paint.set(ld('paint.bin'));
  }
  const gs = JSON.parse(readFileSync(`${DIR}/gs.json`, 'utf8')) as GenState;
  const chests = JSON.parse(readFileSync(`${DIR}/chests.json`, 'utf8'));

  const lines: string[] = [];
  let rawCount = 0;
  const URp = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oIS = URp.internalSample as (this: unknown) => number;
  URp.internalSample = function (this: unknown) {
    rawCount++;
    return oIS.call(this);
  };
  const base = new RNG(Number(SEED));
  const rngW = new Proxy(base, {
    get(t, p) {
      const v = Reflect.get(t, p, t);
      if (typeof v !== 'function') return v;
      return (...args: number[]) => {
        const f = String(p);
        if (f === 'reseed') { lines.push(`#RAW${rawCount} RESEED(${args[0]})`); return v.apply(t, args); }
        const before = rawCount;
        const r = (v as (...a: number[]) => unknown).apply(t, args);
        const detail = f === 'pick' ? String((args[0] as number[]).length) : args.join(',');
        const shown = typeof r === 'boolean' ? String(r) : typeof r === 'object' && r !== null ? '[obj]' : String(r);
        lines.push(`#RAW${before} ${f}(${detail})=${shown}`);
        return r;
      };
    },
  }) as unknown as RNG;
  try {
    __setGenStateForProbe(gs);
    rngW.reseed(Number(SEED));
    runMicroBiomesPass(st, rngW, gs, chests as never);
  } finally {
    __setGenStateForProbe(null);
    URp.internalSample = oIS;
  }
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`api calls=${lines.length}, raw samples=${rawCount} → ${OUT}`);
}, 900_000);
