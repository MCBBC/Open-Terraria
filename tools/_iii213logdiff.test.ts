// ★IIIII213 一次性仪⑥：x86/j 指纹流逐行对拍——首个分歧迭代定位。
// 用法：cd game && SW_I213LD=1 npx vitest run tools/_iii213logdiff.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
it('iii213 liqlog stream diff', () => {
  const x86 = readFileSync('/tmp/iii213-out/x86-liqlog.txt', 'utf8').split('\n').filter(l => l.startsWith('I '));
  const js = readFileSync('/tmp/iii213-out/j-liqlog.txt', 'utf8').split('\n').filter(l => l.startsWith('I '));
  console.log(`x86 lines=${x86.length} js lines=${js.length}`);
  console.log(`x86 first: ${x86[0]} | js first: ${js[0]}`);
  console.log(`x86 last : ${x86[x86.length - 1]} | js last : ${js[js.length - 1]}`);
  let n = Math.min(x86.length, js.length);
  let firstDiff = -1;
  for (let i = 0; i < n; i++) {
    if (x86[i] !== js[i]) { firstDiff = i; break; }
  }
  if (firstDiff < 0) {
    console.log(`前 ${n} 行全等${x86.length === js.length ? '（流全等）' : '（长度不等）'}`);
    return;
  }
  console.log(`首分歧行 #${firstDiff + 1} (迭代 ${firstDiff + 1}):`);
  for (let i = Math.max(0, firstDiff - 2); i <= Math.min(n - 1, firstDiff + 6); i++) {
    console.log(`  ${i + 1}: x86=${x86[i]}  js=${js[i]}`);
  }
});
