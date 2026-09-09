// IIII162 一次性取证：x86 w.wld 箱内容直读（房1/房2 chest 支定谳）。
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I162WLD=1 npx vitest run tools/_iii162wld.test.ts
const RUN = process.env.SW_I162WLD === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

it('dump iamerror chests', () => {
  const buf = readFileSync('/Users/vinlic/GoldenChains/i106/x86-iamerror/w.wld');
  const w = parseWld(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  for (const c of w.chests) {
    // 房1 树 i=406 (箱锚 x≈430-436,y≈286-292) / 房2 树 i=1518 (y≈315-322)
    const nearRoom1 = c.x >= 420 && c.x <= 445 && c.y >= 280 && c.y <= 295;
    const nearRoom2 = c.x >= 1500 && c.x <= 1560 && c.y >= 305 && c.y <= 330;
    if (nearRoom1 || nearRoom2) {
      const items = c.items.map((it) => it ? `${it.id}x${it.stack}` : '-').join(',');
      console.log(`CHEST tag=${nearRoom1 ? 'room1' : 'room2'} @${c.x},${c.y} [${items}]`);
    }
  }
  console.log('total chests:', w.chests.length);
});
