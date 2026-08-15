// L2 真金标比对（最终裁决器）：JS generateWorld 终态 vs 原版服务器 .wld 全网格对拍。
// 输出：分深度带/分类型差异统计 + 首分歧区定位——量化"离一模一样还有多远"。
// 用法：npx vitest run tools/_l2compare.test.ts（数据 /tmp/vserver/，tools/convergence-matrix.sh gen 采集）
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const V = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') V[i] = s; }

it('L2: full-grid JS vs vanilla wld', async () => {
  const seeds = readdirSync('/tmp/vserver').filter((f) => /^s\d+\.wld$/.test(f)).map((f) => f.replace(/^s(\d+)\.wld$/, '$1')).sort().slice(0, 3);
  for (const seed of seeds) {
    const g = parseWld(new Uint8Array(readFileSync(`/tmp/vserver/s${seed}.wld`))).tiles;
    const world = await generateWorld({ width: 4200, height: 1200, seedText: seed, evil: 0 });
    const st = world.store;
    const n = g.type.length;
    let actMis = 0, typeMis = 0, bothActTypeMis = 0, ghostDiff = 0;
    const bandMis = new Array(12).fill(0);   // y/100 分带
    const pairHist = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const aJ = st.flags[i] !== 0, aC = g.active[i] !== 0;
      const y = (i / 4200) | 0;
      if (aJ !== aC) { actMis++; bandMis[Math.min(11, (y / 100) | 0)]++; continue; }
      if (aJ) {
        const jv = V[st.type[i]] < 0 ? 0x7fff : V[st.type[i]];
        if (jv !== g.type[i]) { typeMis++; bothActTypeMis++; bandMis[Math.min(11, (y / 100) | 0)]++;
          const k = `${jv}>${g.type[i]}`; pairHist.set(k, (pairHist.get(k) ?? 0) + 1); }
      } else {
        // 幽灵 parity：原版保留 type，我们 finalize 清 0——只统计不计分
        const jv = st.type[i] === 0 ? 0 : V[st.type[i]] < 0 ? 0x7fff : V[st.type[i]];
        if (jv !== g.type[i]) ghostDiff++;
      }
    }
    const top = [...pairHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k}×${c}`).join(' ');
    const bands = bandMis.map((c, b) => `y${b * 100}-${b * 100 + 99}:${c}`).filter((s2) => !s2.endsWith(':0')).join(' ');
    console.log(`L2 seed=${seed}: actMis=${actMis} typeMis=${typeMis} ghostDiff=${ghostDiff} | bands ${bands} | top ${top}`);
  }
}, 900000);
