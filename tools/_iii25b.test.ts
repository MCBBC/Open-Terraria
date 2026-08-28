// IIII24b 批一次性诊断：Traps pass 分组掷流账本对拍（JS 侧）。
// 注册 __swRollN/UnifiedRandom 原型计数 + __swTrapHm 落盘，输出与 x86 rig SW_HMARK
// 同名同序账本行（traps-head/-post-mainloop/-main-g{i}-att..-pt..-ptr../sand-*）。
// 用法：cd game && SW_I25B=1 npx vitest run tools/_iii25b.test.ts --reporter=basic
import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I25B === '1';
const OUT = process.env.SW_I25_OUT ?? '/tmp/iii25-out/j-hm.txt';
(RUN ? it : it.skip)('iii25b traps ledger', async () => {
  // roll counter（与 rig JJHook.RollCount 同口径：计 every sample-consuming call）
  const g = globalThis as unknown as { __swRollN?: number; __swTrapHm?: (l: string) => void };
  g.__swRollN = 0;
  const proto = UnifiedRandom.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ['next', 'nextInt', 'nextIntRange']) {
    const orig = proto[m];
    if (typeof orig !== 'function') continue;
    proto[m] = function (...args: unknown[]) {
      g.__swRollN = (g.__swRollN ?? 0) + 1;
      return orig.apply(this, args);
    };
  }
  let lines = 0;
  g.__swTrapHm = (label: string) => {
    appendFileSync(OUT, `${label}\n`);
    if (++lines % 500 === 0) console.log(`hm ${lines}`);
  };
  // 事件流（与 rig SW_TRAPSLOG 对拍；仅 mainloop 窗口 g7913..7925）
  const G_LO = Number(process.env.SW_I25_GLO ?? 7913);
  const G_HI = Number(process.env.SW_I25_GHI ?? 7925);
  const evPath = process.env.SW_I25_EV ?? '/tmp/iii25-out/j-traps.txt';
  let logging = false, evLines = 0;
  (globalThis as unknown as { __swTrapEv?: (k: string, a: number, b: number, v: number) => void }).__swTrapEv =
    (kind: string, a: number, b: number, v: number) => {
      if (!logging && kind === 'A' && a >= G_LO) logging = true;
      if (!logging) return;
      if (kind === 'A' && a > G_HI) { logging = false; return; }
      appendFileSync(evPath, `${evLines + 1}|${kind}|${a}|${b}|${v}|rc${g.__swRollN}\n`);
      evLines++;
    };
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  await generateWorld({
    width: 4200, height: 1200, seedText: '1896728457', evil: 1,
    seedFlags: { noTraps: true },
  });
  console.log('ledger written');
}, 900_000);
