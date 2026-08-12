// 一次性诊断：种子 12345 完整生成后，实测地牢砖/丛林泥/雪的列分布 vs 原版 wld。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const V = new Map<number, number>();
for (const d of TILE_DEFS) { const s = d.vanilla?.sheet; if (typeof s === 'number') V.set(d.id, s); }
const vOf = (t: number) => V.get(t) ?? -1;

it('dungeon side: full gen vs wld', async () => {
  const g = parseWld(new Uint8Array(readFileSync('tests/golden/wld/12345世界.wld'))).tiles;
  const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
  const st = world.store;
  const cen = (pick: (vanillaId: number) => boolean, yMin: number, yMax: number, src: 'ours' | 'wld') => {
    const cols = new Map<number, number>();
    for (let y = yMin; y < yMax; y++) for (let x = 0; x < 4200; x++) {
      const i = y * 4200 + x;
      const van = src === 'ours' ? (st.flags[i] ? vOf(st.type[i]) : -1) : (g.active[i] ? g.type[i] : -1);
      if (pick(van)) cols.set(x, (cols.get(x) ?? 0) + 1);
    }
    let sum = 0, n = 0;
    for (const [x, c] of cols) if (c >= 20) { sum += x * c; n += c; }
    return n ? Math.round(sum / n) : -1;
  };
  const isDb = (v: number) => v === 41 || v === 43 || v === 44;
  console.log(`wld   : dungeon@${cen(isDb, 0, 400, 'wld')} jungle@${cen((v) => v === 59, 300, 1000, 'wld')} snow@${cen((v) => v === 147, 0, 500, 'wld')}`);
  console.log(`ours  : dungeon@${cen(isDb, 0, 400, 'ours')} jungle@${cen((v) => v === 59, 300, 1000, 'ours')} snow@${cen((v) => v === 147, 0, 500, 'ours')}`);
  console.log(`gs    : dungeonLocation=${(world as never as { dungeonX?: number }).dungeonX ?? '?'} jungleX=${world.jungleX}`);
}, 600000);
