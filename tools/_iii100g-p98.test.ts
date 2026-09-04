// IIII100g 仪④：#98 前沿 13 格 T0>9999 定性——pass98 末态(=pass99 头 reseed 时)枚举
// 全域「active 且 vanilla.sheet 无映射」的 JS type id 及坐标。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I100GP98 === '1';
const OUT = '/tmp/iii100g-out';
const CELLS: Array<[number, number]> = [[395,737],[1010,785],[1010,786],[684,787],[662,788],[684,788],[662,789],[663,789]];

(RUN ? it : it.skip)('iii100g pass98 frontier unmapped-tile census', { timeout: 3_600_000 }, async () => {
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: RNG, s: number) => void;
  let sawMbEnd = false;
  let captured = false;
  let st: TileStore | null = null;
  const g0 = globalThis as { __swMbCap?: (gs: unknown, s: TileStore, c?: unknown) => void };
  const oCap = g0.__swMbCap;
  g0.__swMbCap = (gs, s, c) => { st = s; oCap?.(gs, s, c); };
  const g = globalThis as { __swSeg?: (name: string, detail?: unknown) => void };
  const oSeg = g.__swSeg;
  g.__swSeg = (name) => { if (name === 'mbEnd') sawMbEnd = true; oSeg?.(name); };
  RNGp.reseed = function (this: RNG, s: number) {
    const r = oReseed.call(this, s);
    if (sawMbEnd && !captured && st) {
      captured = true;
      const lines: string[] = [];
      for (const [x, y] of CELLS) {
        const i = st.idx(x, y);
        lines.push(`(${x},${y}) flags=${st.flags[i]} type=${st.type[i]} sheet=${TILE_DEFS[st.type[i]!]?.vanilla?.sheet} wall=${st.wall[i]} liquid=${st.liquid[i]} ltype=${st.liquidType[i]}`);
      }
      // 全域枚举 active+unmapped
      const W = st.w, H = st.h;
      const byType = new Map<number, Array<string>>();
      for (let i = 0; i < W * H; i++) {
        if (!(st.flags[i]! & 1)) continue;
        const t = st.type[i]!;
        if (TILE_DEFS[t]?.vanilla?.sheet !== undefined) continue;
        const x = i % W, y = (i / W) | 0;
        const arr = byType.get(t) ?? [];
        if (arr.length < 6) arr.push(`(${x},${y})`);
        byType.set(t, arr);
      }
      lines.push('全域 active+无 sheet 映射 type 分布: ' + [...byType.entries()].sort((a,b)=>b[1].length-a[1].length).map(([t, a]) => `type${t}(sheet=${TILE_DEFS[t]?.vanilla?.sheet})x?@${a.join(' ')}`).slice(0, 10).join(' | '));
      writeFileSync(`${OUT}/p98-census.txt`, lines.join('\n') + '\n');
      console.log(lines.join('\n'));
    }
    return r;
  };
  await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true } } as Parameters<typeof generateWorld>[0]);
  RNGp.reseed = oReseed; g.__swSeg = oSeg; g0.__swMbCap = oCap;
});
