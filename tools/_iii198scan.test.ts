// IIII198: 扫全部带 frx 链的 104→105 罐杀形态(x86),找有杀量的链做机制实证
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198SCAN=1 npx vitest run tools/_iii198scan.test.ts
const RUN = process.env.SW_I198SCAN === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

it('iii198 scan chains', () => {
  const dirs = execSync(`ls -d ${process.env.HOME}/GoldenChains/*/`).toString().trim().split('\n');
  for (const d of dirs) {
    try {
      if (!readFileSync(`${d}105_Final_Cleanup.frx`)) continue;
    } catch { continue; }
    try {
      const W = 4200, H = 1200, N = W * H;
      const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
      const a4 = new Uint8Array(readFileSync(`${d}104_Remove_Broken_Traps.act`).buffer, 0, N);
      const a5 = new Uint8Array(readFileSync(`${d}105_Final_Cleanup.act`).buffer, 0, N);
      const t4 = rd16(`${d}104_Remove_Broken_Traps.typ`);
      let kills = 0;
      for (let i = 0; i < N; i++) if ((a4[i] & 1) && !(a5[i] & 1) && t4[i] === 28) kills++;
      if (kills > 0) console.log(`[scan] ${d.split('/').slice(-2)[0]}: 罐杀=${kills}`);
    } catch { /* 尺寸不符等 */ }
  }
}, 600_000);
