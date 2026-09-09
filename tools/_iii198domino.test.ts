// IIII198: 前几个罐杀簇的邻域全变化显影——找首块多米诺(非罐变化)
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198DOMINO=1 npx vitest run tools/_iii198domino.test.ts
const RUN = process.env.SW_I198DOMINO === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';

const D4 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/104_Remove_Broken_Traps`;
const D5 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/105_Final_Cleanup`;
const W = 4200, H = 1200, N = W * H;

it('iii198 domino windows', () => {
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const rdu8 = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, N);
  const t4 = rd16(`${D4}.typ`), a4 = rdu8(`${D4}.act`), l4 = rd16(`${D4}.liq`), w4 = rd16(`${D4}.wal`);
  const t5 = rd16(`${D5}.typ`), a5 = rdu8(`${D5}.act`), l5 = rd16(`${D5}.liq`), w5 = rd16(`${D5}.wal`);
  const changed = (i: number) => (a4[i] & 1) !== (a5[i] & 1) || (a4[i] & 1) && t4[i] !== t5[i] || l4[i] !== l5[i] || w4[i] !== w5[i];

  const killed: number[] = [];
  for (let i = 0; i < N; i++) if ((a4[i] & 1) && !(a5[i] & 1) && t4[i] === 28) killed.push(i);
  killed.sort((p, q) => (p % W) * H + ((p / W) | 0) - ((q % W) * H + ((q / W) | 0)));

  const R = 4;
  for (let s = 0; s < 6; s++) {
    const c = killed[s * Math.max(1, ((killed.length / 6) | 0))];
    const cx = c % W, cy = (c / W) | 0;
    console.log(`\n=== 簇 s=${s} 中心=(${cx},${cy})`);
    for (let y = cy - R; y <= cy + R; y++) {
      let row = '';
      for (let x = cx - R; x <= cx + R; x++) {
        const i = y * W + x;
        const ch = changed(i) ? '*' : ' ';
        const v = (a4[i] & 1) ? (a5[i] & 1 ? (t4[i] === t5[i] ? String(t4[i]).padStart(3) : t4[i] + '>' + t5[i]) : 'X' + String(t4[i]).padStart(3)) : ((a5[i] & 1) ? 'A' + String(t5[i]).padStart(3) : '  .');
        row += ch + v.padStart(6);
      }
      console.log(`y=${String(y).padStart(4)} ${row}`);
    }
  }
}, 600_000);
