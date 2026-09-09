// IIII198: x86 杀罐格的上格液体(104 与 105 末态)分布——LiquidCheck cut-kill 假说
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198LIQ=1 npx vitest run tools/_iii198liq.test.ts
const RUN = process.env.SW_I198LIQ === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
const D4 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/104_Remove_Broken_Traps`;
const D5 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/105_Final_Cleanup`;
const W = 4200, H = 1200, N = W * H;
it('iii198 liq above', () => {
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const rdu8 = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, N);
  const t4 = rd16(`${D4}.typ`), a4 = rdu8(`${D4}.act`), l4 = rd16(`${D4}.liq`), lt4 = rd16(`${D4}.lty`);
  const a5 = rdu8(`${D5}.act`), l5 = rd16(`${D5}.liq`), lt5 = rd16(`${D5}.lty`);
  const m = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    if (!((a4[i] & 1) && !(a5[i] & 1) && t4[i] === 28)) continue;
    const up = i - W, up2 = i - 2 * W;
    // cut-kill 来源:本格上格(y-1)在 LiquidCheck 扫时(末态)liquid>0 且型!=0;或上上格 case B
    const k1 = `above105: l${l5[up] > 0 ? lt5[up] + 1 : 0}`;
    const k2 = `above104: l${l4[up] > 0 ? lt4[up] + 1 : 0}`;
    m.set(k1, (m.get(k1) ?? 0) + 1);
    if (l5[up] === 0 && l5[up2] > 0) m.set('above-above105 liq', (m.get('above-above105 liq') ?? 0) + 1);
  }
  for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(`[liq] ${k} × ${v}`);
}, 600_000);
