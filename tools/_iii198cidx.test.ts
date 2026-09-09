// IIII198: 箱索引集对拍——JS world.chests 的索引位 vs x86 w.wld 箱表
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198CIDX=1 npx vitest run tools/_iii198cidx.test.ts
const RUN = process.env.SW_I198CIDX === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

it('iii198 chest indices', async () => {
  const buf = readFileSync('/Users/vinlic/GoldenChains/i106/x86-iamerror/w.wld');
  const wld = parseWld(new Uint8Array(buf.buffer, buf.byteOffset));
  const wc = (wld as unknown as { chests?: Array<{ x: number; y: number } | null> }).chests;
  console.log(`[cidx] wld chests=${wc ? wc.length : 'N/A'} ${wc ? `first=${wc.findIndex(Boolean)} nonnull=${wc.filter(Boolean).length}` : ''}`);
}, 600_000);
