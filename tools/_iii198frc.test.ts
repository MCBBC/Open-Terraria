// IIII198: JS 快照罐帧一致性 + 一致性 vs 杀格关系
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198F_J4=1 npx vitest run tools/_iii198frc.test.ts
const RUN = process.env.SW_I198F_J4 === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const JS4 = process.env.SW_I198F_J4 ?? '/tmp/iii198-out/js-slot104';
const JS5 = process.env.SW_I198F_J5 ?? '/tmp/iii195-out/js-slot105';
const W = 4200, H = 1200, N = W * H;

it('iii198 js frame consistency', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const t4 = new Uint16Array(readFileSync(`${JS4}/base_type.bin`).buffer), a4 = new Uint8Array(readFileSync(`${JS4}/base_flags.bin`).buffer);
  const fx4 = rd16(`${JS4}/base_frameX.bin`), fy4 = rd16(`${JS4}/base_frameY.bin`);
  const a5 = new Uint8Array(readFileSync(`${JS5}/base_flags.bin`).buffer);
  const wrap2 = (v: number) => { let n = Math.floor(v / 18); while (n > 1) n -= 2; return n; };
  let total = 0, consistent = 0, inco = 0, incoKilled = 0, consKilled = 0;
  const badSamples: string[] = [];
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
    const i = y * W + x;
    if (!(a4[i] & 1) || SHEET[t4[i]] !== 28) continue;
    total++;
    const x0 = x - wrap2(fx4[i]);
    let n3 = Math.floor(fy4[i] / 18), num4 = 0;
    while (n3 > 1) { n3 -= 2; num4++; }
    const y0 = y - n3;
    let ok = true;
    for (let k = x0; k < x0 + 2 && ok; k++) for (let l = y0; l < y0 + 2; l++) {
      const q = l * W + k;
      if (!((a4[q] & 1) && SHEET[t4[q]] === 28 && wrap2(fx4[q]) === k - x0 && fy4[q] === (l - y0) * 18 + num4 * 36)) ok = false;
    }
    if (ok) consistent++;
    else {
      inco++;
      if (!(a5[i] & 1)) incoKilled++;
    }
    if (!(a5[i] & 1)) consKilled += ok ? 0 : 0;
  }
  // 杀格中一致/不一致
  let killedTotal = 0, killedInco = 0;
  for (let i = 0; i < N; i++) {
    if ((a4[i] & 1) && !(a5[i] & 1) && SHEET[t4[i]] === 28) { killedTotal++; }
  }
  // 重算 killedInco 正确口径
  killedInco = 0;
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
    const i = y * W + x;
    if (!(a4[i] & 1) || SHEET[t4[i]] !== 28 || (a5[i] & 1)) continue;
    killedTotal++;
    const x0 = x - wrap2(fx4[i]);
    let n3 = Math.floor(fy4[i] / 18), num4 = 0;
    while (n3 > 1) { n3 -= 2; num4++; }
    const y0 = y - n3;
    let ok = true;
    for (let k = x0; k < x0 + 2 && ok; k++) for (let l = y0; l < y0 + 2; l++) {
      const q = l * W + k;
      if (!((a4[q] & 1) && SHEET[t4[q]] === 28 && wrap2(fx4[q]) === k - x0 && fy4[q] === (l - y0) * 18 + num4 * 36)) ok = false;
    }
    if (!ok) killedInco++;
  }
  console.log(`[frc] JS 活性罐格=${total} 帧互洽=${consistent} 不互洽=${inco}`);
  console.log(`[frc] JS 杀罐格=${killedTotal} 其中帧不互洽=${killedInco} (帧互洽被杀=${killedTotal - killedInco})`);
}, 600_000);
