// IIII198: slot104 态的 roll-相关翻转精确普查(双方 slot104 dump 直接对拍)
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198GFLIP=1 npx vitest run tools/_iii198gflip.test.ts
const RUN = process.env.SW_I198GFLIP === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const W = 4200, H = 1200, N = W * H;
const MOSS = new Set([179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]);

it('iii198 precise slot104 flips', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const G4 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/104_Remove_Broken_Traps`;
  const gt = rd16(`${G4}.typ`), ga = new Uint8Array(readFileSync(`${G4}.act`).buffer, 0, N);
  const jt = new Uint16Array(readFileSync('/tmp/iii198-out/js-slot104/base_type.bin').buffer);
  const jf = new Uint8Array(readFileSync('/tmp/iii198-out/js-slot104/base_flags.bin').buffer);
  let mossFlip = 0; const samples: string[] = [];
  let firstLoop = -1;
  for (let y = 20; y < H - 20; y++) for (let x = 20; x < W - 20; x++) {
    const i = y * W + x;
    const va = ga[i] & 1, ja = jf[i] & 1;
    if (va || ja) continue;                       // 非活性侧才读幽灵
    const vMoss = MOSS.has(gt[i]);
    const jMoss = SHEET[jt[i]] >= 0 && MOSS.has(SHEET[jt[i]]);
    if (vMoss !== jMoss) {
      mossFlip++;
      if (firstLoop < 0) firstLoop = x * H + y;
      if (samples.length < 10) samples.push(`(${x},${y}) x86ghost=${gt[i]} jsghost=${SHEET[jt[i]]}`);
    }
  }
  console.log(`[gflip] slot104 苔藓幽灵门翻转=${mossFlip} 首个循环序位=${firstLoop >= 0 ? `(${firstLoop % W},${(firstLoop / W) | 0})` : '无'}`);
  for (const s of samples) console.log('  ' + s);
}, 600_000);
