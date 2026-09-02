import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
// IIII166: x86 真值箱内容取证——UW#14 (337,1063) 表层档 vs 地狱档判别
it('iii166 x86 uw chest contents', () => {
  const w = parseWld(Uint8Array.from(readFileSync('/tmp/iii160-out/x86/w.wld')));
  const near = w.chests.filter((c) => c.x >= 330 && c.x <= 345 && c.y >= 1055 && c.y <= 1075);
  console.log('I166CHEST total chests:', w.chests.length, 'near(337,1063):', near.length);
  for (const c of near) {
    console.log(`I166CHEST chest@(${c.x},${c.y}) name="${c.name}" items=`, JSON.stringify(c.items.filter(Boolean)));
  }
  // 顺带全 UW 带 (y>=995) 箱清单（前 20 只）
  const uw = w.chests.filter((c) => c.y >= 995).slice(0, 20);
  for (const c of uw) {
    console.log(`I166UW chest@(${c.x},${c.y}) items=`, JSON.stringify(c.items.filter(Boolean).map((i) => `${i!.id}x${i!.stack}`)));
  }
});
