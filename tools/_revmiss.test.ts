// 一次性：dump066 活性格 vanilla id 有多少不在 TILE_DEFS（REV 缺）→ rig 幽灵塌缩审计。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

(RUN ? it : it.skip)('dump066 REV missing active types', () => {
  const VG = '/tmp/sw-num4/van_x86_g';
  const W = 4200;
  const t = new Uint16Array(readFileSync(`${VG}/066_Temple.typ`).buffer.slice(0));
  const a = readFileSync(`${VG}/066_Temple.act`);
  const have = new Set<number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') have.add(s);
  }
  const miss = new Map<number, number>();
  const cells: Array<[number, number, number]> = [];
  for (let i = 0; i < t.length; i++) {
    if (!a[i]) continue;
    const v = t[i];
    if (v !== 0 && !have.has(v)) {
      miss.set(v, (miss.get(v) ?? 0) + 1);
      if (cells.length < 40) cells.push([i % W, (i / W) | 0, v]);
    }
  }
  console.log('missing active vanilla ids:', JSON.stringify([...miss.entries()].sort((p, q) => q[1] - p[1])));
  console.log('sample cells:', cells.map(([x, y, v]) => `(${x},${y})v${v}`).join(' '));
  // (775,565) 腔周围 ±25 内的缺失格
  const near = cells.filter(([x, y]) => Math.abs(x - 775) <= 25 && Math.abs(y - 565) <= 25);
  console.log('near 775,565:', near.map(([x, y, v]) => `(${x},${y})v${v}`).join(' ') || '(无)');
}, 120000);
