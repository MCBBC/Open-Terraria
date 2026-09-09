// IIII198: (2655,486) 箱格 tile 态(x86 slot105)——registry 差 vs tile 差判定
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198CTILE=1 npx vitest run tools/_iii198ctile.test.ts
const RUN = process.env.SW_I198CTILE === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';

it('iii198 chest tile at 2655,486', () => {
  const W = 4200, N = 4200 * 1200;
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const G5 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/105_Final_Cleanup`;
  const gt = rd16(`${G5}.typ`), ga = new Uint8Array(readFileSync(`${G5}.act`).buffer, 0, N);
  // 箱族 21/3234?——Chest=21, LargeChest=467?? — 打印 (2655,486) 2×2 邻域的活格型
  for (let y = 485; y <= 488; y++) {
    let s = '';
    for (let x = 2654; x <= 2657; x++) {
      const i = y * W + x;
      s += ` (${x},${y})${ga[i] & 1 ? `t${gt[i]}` : '.'}`;
    }
    console.log('[ct]', s);
  }
  // 全图找该坐标是否 chest 型(21)
  const i = 486 * W + 2655;
  console.log(`[ct] (2655,486) x86=${ga[i] & 1 ? `t${gt[i]}` : 'off'}`);
}, 600_000);
