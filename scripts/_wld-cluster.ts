// 699v: island 跑 .wld 终态右缘簇 vs consolidated post 快照
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
const w = parseWld(new Uint8Array(readFileSync('/tmp/tml-golden/probe-island/golden-calamity.wld')));
const t = w.tiles;
console.log('island 跑 .wld 终态右缘簇(x4033-4038):');
for (let y = 893; y <= 898; y++) {
  const row: string[] = [];
  for (let x = 4033; x <= 4038; x++) { const i = x * 1200 + y; row.push(t.active[i] ? String(t.type[i]) : '.'); }
  console.log(`y${y}: ${row.map((v) => String(v).padStart(3)).join(' ')}`);
}
