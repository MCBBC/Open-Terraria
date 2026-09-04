// IIII100g 仪②：rig(gfb 再跑,SW_EVIL=0) w.wld ↔ 金标 w.wld 全格对拍。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = !!process.env.SW_I100GWLD;
(RUN ? it : it.skip)('iii100g rig w.wld vs golden w.wld', { timeout: 600_000 }, () => {
  const a = parseWld(new Uint8Array(readFileSync(`${process.env.HOME}/GoldenChains/golden-gfb-c/w.wld`)));
  const b = parseWld(new Uint8Array(readFileSync('/tmp/iii131-out/rig-gfb/w.wld')));
  console.log('golden:', a.tilesWide, 'x', a.tilesHigh, 'crimson', a.isCrimson, 'spawn', a.spawnX, a.spawnY);
  console.log('rig   :', b.tilesWide, 'x', b.tilesHigh, 'crimson', b.isCrimson, 'spawn', b.spawnX, b.spawnY);
  if (a.tilesWide !== b.tilesWide || a.tilesHigh !== b.tilesHigh) { console.log('SIZE MISMATCH'); return; }
  const n = a.tilesWide * a.tilesHigh;
  let t = 0, ac = 0, wal = 0, liq = 0, first = -1;
  const pairs: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const va = a.tiles.active[i] === 1, vb = b.tiles.active[i] === 1;
    if (va !== vb) { ac++; if (first < 0) first = i; }
    if (va && vb && a.tiles.type[i] !== b.tiles.type[i]) {
      t++; const k = `${a.tiles.type[i]}>${b.tiles.type[i]}`; pairs[k] = (pairs[k] ?? 0) + 1;
      if (first < 0) first = i;
    }
    if (a.tiles.wall[i] !== b.tiles.wall[i]) { wal++; if (first < 0) first = i; }
    if (a.tiles.liquid[i] !== b.tiles.liquid[i]) { liq++; if (first < 0) first = i; }
  }
  console.log('actDiff=%d activeTypeDiff=%d walDiff=%d liqDiff=%d firstIdx=%d(x=%d,y=%d)',
    ac, t, wal, liq, first, first % a.tilesWide, Math.floor(first / a.tilesWide));
  console.log('top pairs:', Object.entries(pairs).sort((x, y) => y[1] - x[1]).slice(0, 8));
});
