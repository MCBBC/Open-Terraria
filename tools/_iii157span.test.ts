// IIII157 批一次性探针：dungeon 段主流掷账 + C|箱调用行 + STREAM 指纹（oracle 对拍用）
// 用法：cd game && SW_157_RUN=1 SW_STREAM_PROBE=1 SW_DG_CHEST_TRACE=1 SW_157_ROLL=1 \
//         SW_157_SEED=9293480 npx vitest run tools/_iii157span.test.ts
// 产出（stdout，grep 归档）：
//   STREAM <ckpt>|<fnv>            —— chainCheckpoints 内建（SW_STREAM_PROBE=1）
//   C|ix|jy|main|style|tile|fnv    —— DungeonPass SW_DG_CHEST_TRACE（oracle DG_CHEST_TRACE 同构）
//   DGROLL <n> <op> -> <v>         —— 本探针账本（自 dungeonB snap 起计数；oracle DG_ROLL_LOG
//                                     的 n 侧加 156041 对齐；RESEED 行=位点标记）
import { it } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
import { UnifiedRandom } from '../src/core/rng';

const RUN = !!process.env.SW_157_RUN;
const SEED = process.env.SW_157_SEED ?? '9293480';
const EVIL = Number(process.env.SW_157_EVIL ?? '0') as 0 | 1;
const OUT = process.env.SW_157_OUT ?? '/tmp/iii157-out/js-span.log';

// —— 掷账账本（SW_157_ROLL=1）——
//   主流实例识别：RNG.reseed(seed) → ur.setSeed(seed)；seed===世界种子即主流
//   （私有结构流 seed=掷值，命中世界种子概率 ~2^-32 量级，忽略）。
//   账本门：globalThis.__sw157roll（__cavesTrace 于 dungeonB snap 置位）。
let mainUr: UnifiedRandom | null = null;
let ledgerN = 0;

(RUN ? it : it.skip)(`iii157 dungeon span seed=${SEED}`, async () => {
  if (process.env.SW_157_ROLL) {
    const proto = UnifiedRandom.prototype as unknown as Record<string, (...a: never[]) => unknown>;
    const origSetSeed = proto.setSeed;
    proto.setSeed = function (this: UnifiedRandom, seed: number) {
      if (seed === Number(SEED)) { mainUr = this; }
      return origSetSeed.call(this, seed);
    } as never;
    const log = (op: string, v: number) => {
      // 门=globalThis.__sw157roll（dungeonB snap 置位，永不关）——dungeonG..dungeon
      //   计 ~85k 行，130k 行后只计数不落盘（后链不再需要）
      if (!(globalThis as { __sw157roll?: boolean }).__sw157roll) return;
      if (ledgerN < 130000) appendFileSync(OUT, `DGROLL ${ledgerN} ${op} -> ${v}\n`);
      ledgerN++;
    };
    const origNext = proto.next;
    proto.next = function (this: UnifiedRandom) {
      const v = origNext.call(this) as number;
      if (this === mainUr) log('Next()', v);
      return v;
    } as never;
    const origNextInt = proto.nextInt;
    proto.nextInt = function (this: UnifiedRandom, maxValue: number) {
      const v = origNextInt.call(this, maxValue) as number;
      if (this === mainUr) log(`Next(${maxValue})`, v);
      return v;
    } as never;
    const origNextIntRange = proto.nextIntRange;
    proto.nextIntRange = function (this: UnifiedRandom, minValue: number, maxValue: number) {
      const v = origNextIntRange.call(this, minValue, maxValue) as number;
      if (this === mainUr) log(`Next(${minValue},${maxValue})`, v);
      return v;
    } as never;
    const origNextDouble = proto.nextDouble;
    proto.nextDouble = function (this: UnifiedRandom) {
      const v = origNextDouble.call(this) as number;
      if (this === mainUr) log('NextDouble()', v);
      return v;
    } as never;
    (globalThis as { __cavesTrace?: { onAt: string; flag: string } }).__cavesTrace =
      { onAt: 'dungeonB', flag: '__sw157roll' };
    writeFileSync(OUT, '');
  }
  try {
    const res = chainCheckpoints(SEED, EVIL);
    for (const n of ['dungeonB', 'dungeonG', 'dungeonI', 'dungeonT', 'dungeonF', 'dungeonPa', 'dungeonBa', 'dungeon', 'gems', 'shimmer']) {
      console.log(`III157GRID ${n} ${res.grids.get(n)}`);
    }
  } finally {
    (globalThis as { __cavesTrace?: unknown }).__cavesTrace = undefined;
  }
}, 600000);
