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
  // 事件流（与 rig SW_TRAPSLOG 对拍；仅 mainloop 窗口 G_LO..G_HI）
  const G_LO = Number(process.env.SW_I25_GLO ?? -1);
  const G_HI = Number(process.env.SW_I25_GHI ?? -1);
  const evPath = process.env.SW_I25_EV ?? '/tmp/iii25-out/j-traps.txt';
  let logging = false, evLines = 0;
  const wPath = process.env.SW_I25_W ?? '/tmp/iii25-out/j-W.txt';
  (globalThis as unknown as { __swTrapEv?: (k: string, a: number, b: number, v: number) => void }).__swTrapEv =
    (kind: string, a: number, b: number, v: number) => {
      if (G_LO < 0 && kind !== 'BW' && kind !== 'BX') return;
      if (G_LO >= 0) {
        if (!logging && kind === 'A' && a >= G_LO) logging = true;
        else if (!logging && kind !== 'BW' && kind !== 'BX') return;
        if (kind === 'A' && a > G_HI) { logging = false; }
        if (!logging && kind !== 'BW' && kind !== 'BX') return;
      }
      appendFileSync(evPath, `${evLines + 1}|${kind}|${a}|${b}|${v}|rc${g.__swRollN}\n`);
      evLines++;
      if (kind === 'GW') appendFileSync(wPath, `GW ${a} ${b} st${v} rc${g.__swRollN}\n`);
      if (kind === 'BW' || kind === 'BX') appendFileSync(wPath, `${kind} ${a} ${b} r${v} rc${g.__swRollN}\n`);
    };
  const csPath = process.env.SW_I25_CS ?? '/tmp/iii25-out/j-CS.txt';
  let csOn = process.env.SW_I25_CS === '1';
  (globalThis as unknown as { __swAbEv?: (l: string) => void }).__swAbEv = (l: string) => {
    if (!csOn) return;
    if (/^CS443/.test(l)) appendFileSync(csPath, l + "\n");
  };
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  await generateWorld({
    width: 4200, height: 1200, seedText: '1896728457', evil: 1,
    seedFlags: { noTraps: true },
  });
  console.log('ledger written');
}, 900_000);
