// IIII100g 仪④b：#98 前沿 13 格定性(v2)——经 onWorldPartial 槽末回调(i=51=二次沉降)
// 取 pass98 末态,枚举 13 格 type + 全域 active+无 sheet 映射分布。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I100GP98B === '1';
const OUT = '/tmp/iii100g-out';
const CELLS: Array<[number, number]> = [[395,737],[1010,785],[1010,786],[684,787],[662,788],[684,788],[662,789],[663,789]];

(RUN ? it : it.skip)('iii100g p98 frontier census v2 (slot-end #51)', { timeout: 3_600_000 }, async () => {
  let best: TileStore | null = null;
  let bestI = -1;
  await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
    onWorldPartial: (w, i) => { if (i === 51) { bestI = i; best = w.store as never as TileStore; } },
  } as Parameters<typeof generateWorld>[0]);
  if (!best) throw new Error('no slot-51 capture');
  const st = best;
  const lines: string[] = [`slot-51 capture i=${bestI}`];
  for (const [x, y] of CELLS) {
    const i = st.idx(x, y);
    lines.push(`(${x},${y}) flags=${st.flags[i]} type=${st.type[i]} sheet=${TILE_DEFS[st.type[i]!]?.vanilla?.sheet} wall=${st.wall[i]} liquid=${st.liquid[i]} ltype=${st.liquidType[i]}`);
  }
  const W = st.w, H = st.h;
  const byType = new Map<number, number>();
  const samples = new Map<number, string[]>();
  for (let i = 0; i < W * H; i++) {
    if (!(st.flags[i]! & 1)) continue;
    const t = st.type[i]!;
    if (TILE_DEFS[t]?.vanilla?.sheet !== undefined) continue;
    byType.set(t, (byType.get(t) ?? 0) + 1);
    const arr = samples.get(t) ?? [];
    const x = i % W, y = (i / W) | 0;
    if (arr.length < 4) arr.push(`(${x},${y})`);
    samples.set(t, arr);
  }
  lines.push('全域 active+无sheet: ' + [...byType.entries()].sort((a,b)=>b[1]-a[1]).map(([t,n]) => `type${t}x${n}@${(samples.get(t)??[]).join(' ')}`).join(' | '));
  writeFileSync(`${OUT}/p98-census2.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
});
