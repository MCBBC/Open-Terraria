// NNN · 多种子 JS vs 金标 岛屋家具对拍（椅/桌/门 通过与否的分布）
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const FILES = ['20260811世界', 'SandboxWorld世界'];

describe('多种子岛屋对拍', { timeout: 600_000 }, () => {
  it('cmp', async () => {
    for (const f of FILES) {
      const g = parseWld(new Uint8Array(readFileSync(`tests/golden/wld/${f}.wld`)));
      const ours = await generateWorld({ width: g.tilesWide, height: g.tilesHigh, seedText: g.seed, name: 'nnn' });
      const st = ours.store;
      const W = g.tilesWide, H = g.tilesHigh;
      const side = (act: Uint8Array, van: ArrayLike<number>): Array<number> => {
        const a = new Array<number>(W * H);
        for (let i = 0; i < W * H; i++) a[i] = act[i] ? (van as number[])[i] : -1;
        return a;
      };
      const G = side(g.tiles.active, g.tiles.type);
      const JV = new Array<number>(W * H);
      for (let i = 0; i < W * H; i++) JV[i] = SHEET[st.type[i]] ?? -1;
      const J = side(st.flags, JV);
      // 202 聚类（同前）
      const islands = (s: Array<number>) => {
        const pts: number[] = [];
        for (let x = 0; x < W; x++) for (let y = 0; y < 300; y++) if (s[y * W + x] === 202) pts.push(x * 10000 + y);
        pts.sort((a, b) => a - b);
        const out: Array<[number, number]> = [];
        let last = -999;
        for (const p of pts) { if (p / 10000 - last > 60) out.push([Math.floor(p / 10000), p % 10000]); last = p / 10000; }
        return out;
      };
      const gi = islands(G), ji = islands(J);
      const cnt = (s: Array<number>, cx: number, r = 26): Record<string, number> => {
        const c: Record<string, number> = {};
        for (let y = 0; y < 300; y++) for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++) {
          const t = s[y * W + x];
          if (t === 14) c.T = (c.T ?? 0) + 1;
          if (t === 15) c.c = (c.c ?? 0) + 1;
          if (t === 10 || t === 11) c.D = (c.D ?? 0) + 1;
        }
        return c;
      };
      console.log(`\n=== ${f} ===`);
      for (let k = 0; k < Math.max(gi.length, ji.length); k++) {
        const a = gi[k], b = ji[k];
        console.log(` isl#${k} g@${a ? a.join(',') : '-'} ${JSON.stringify(a ? cnt(G, a[0]) : {})} | js@${b ? b.join(',') : '-'} ${JSON.stringify(b ? cnt(J, b[0]) : {})}`);
      }
    }
  });
});
