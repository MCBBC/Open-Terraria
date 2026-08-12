import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

it('金标 wld 边界验尸(真原版世界边框机制)', () => {
  const buf = readFileSync('tests/golden/wld/9293480世界.wld');
  const w = parseWld(new Uint8Array(buf));
  const W = w.tilesWide, H = w.tilesHigh;
  const solid = (x: number, y: number) => (w.tiles.active[y * W + x] ? 'T' : '.');
  for (const y of [300, 500, 800]) {
    const L = Array.from({ length: 8 }, (_, i) => solid(i, y)).join('');
    const R = Array.from({ length: 8 }, (_, i) => solid(W - 8 + i, y)).join('');
    console.log(`y=${y} 左8:${L} 右8:${R}`);
  }
  const B = Array.from({ length: 5 }, (_, r) => {
    const y = H - 5 + r;
    return `y=${y}:` + Array.from({ length: 8 }, (_, i) => solid(Math.floor(W / 2) - 4 + i, y)).join('');
  }).join(' ');
  console.log(`底部5行(中部): ${B}`);
  const TP = Array.from({ length: 3 }, (_, r) =>
    `y=${r}:` + Array.from({ length: 8 }, (_, i) => solid(Math.floor(W / 2) - 4 + i, r)).join('')).join(' ');
  console.log(`顶部3行: ${TP}`);
});
