// 一次性诊断（TTTTTT 批 2026-08-23）：LavaLayerCaverer 窗口掷流 + killTile 轨迹 dump。
// 产出 /tmp/tttttt-out/jll.txt：窗口内每掷一行（a <max> / b <min>,<max> v <val>）、
// 每列一行（col x top bot center）、killTile 经 __swSWAct 转录（K x y）、loop2/end 相。
// 用法：cd game && npx vitest run tools/_tttttt.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const OUT = process.env.SW_TT_OUT ?? '/tmp/tttttt-out/jll.txt';
const SEED = process.env.SW_TT_SEED ?? '1321365005';

(it as (n: string, f: () => Promise<void>, t?: number) => void)('dump LavaLayerCaverer roll stream', async () => {
  const lines: string[] = [];
  let on = false;
  let n = 0;
  type G = { __swLL?: (k: string, x: number, t: number, b: number, c: number) => void;
    __swSWAct?: (fn: string, x: number, y: number, e: number) => void };
  const g = globalThis as G;
  g.__swLL = (k, x, t, b, c) => {
    if (k === 'begin') { on = true; n = 0; }
    if (k === 'loop2' || k === 'end') on = false;
    lines.push(`${k} ${x} ${t} ${b} ${c}`);
  };
  g.__swSWAct = (fn, x, y) => { if (on && fn === 'K') lines.push(`K ${x} ${y}`); };
  // ★钩 UnifiedRandom 原型（RNG 包装器把 nextInt/nextIntRange 直通 this.ur,
  //   钩 RNG.prototype 会漏 nextIntRange——首跑 0 掷 b 行教训）
  const Up = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oNI = Up.nextInt as (this: UnifiedRandom, m: number) => number;
  const oNR = Up.nextIntRange as (this: UnifiedRandom, a: number, b: number) => number;
  Up.nextInt = function (this: UnifiedRandom, m: number) {
    const v = oNI.call(this, m);
    if (on) { n++; lines.push(`a ${m} v ${v}`); }
    return v;
  };
  Up.nextIntRange = function (this: UnifiedRandom, a: number, b: number) {
    const v = oNR.call(this, a, b);
    if (on) { n++; lines.push(`b ${a},${b} v ${v}`); }
    return v;
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0,
      seedFlags: { theConstant: true },
    });
  } finally {
    Up.nextInt = oNI;
    Up.nextIntRange = oNR;
    g.__swLL = undefined;
    g.__swSWAct = undefined;
  }
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`dumped ${n} rolls / ${lines.length} lines to ${OUT} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 600_000);
