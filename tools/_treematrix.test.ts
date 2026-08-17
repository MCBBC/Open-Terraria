// 矩阵基线树差异定位探针（SW_PARITY 门控）：s5555/s4444 JS 多 15%/12% 的树在哪。
// 干列算法同 _treeparity（列内连续 vanilla-5 active ≥5 行 = 一棵干）。
// 输出：两侧树数、按 x 分带（500 格/带）的差、JS-only 树的地面 tile/wall 分布
// （定位雪/沙混布等特定地表组合的门分歧）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

const RUN = process.env.SW_PARITY === '1';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Trunk { x: number; yBase: number }
function trunksOf(w: number, h: number, act: Uint8Array, van: Int32Array): Trunk[] {
  const out: Trunk[] = [];
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const i = y * w + x;
      if (act[i] && van[i] === 5 && (y === 0 || !(act[i - w] && van[i - w] === 5))) {
        let len = 0;
        while (y + len < h) {
          const j = (y + len) * w + x;
          if (act[j] && van[j] === 5) len++; else break;
        }
        if (len >= 5) out.push({ x, yBase: y + len - 1 });
        y += len;
      } else y++;
    }
  }
  return out;
}

(RUN ? it : it.skip)('matrix tree diff localization', async () => {
  for (const file of (process.env.SW_TREE_FILES ?? 's5555.wld,s4444.wld').split(',')) {
    const wld = parseWld(new Uint8Array(readFileSync(`/tmp/vserver/${file}`)));
    const W = wld.tilesWide, H = wld.tilesHigh, N = W * H;
    const seed = file.match(/s(\d+)\.wld/)![1];
    const world: World = await generateWorld({
      size: 0, width: W, height: H, seedText: seed, evil: wld.isCrimson ? 1 : 0,
    });
    const st = world.store;
    const vAct = wld.tiles.active, vVan = wld.tiles.type;
    const jAct = new Uint8Array(N), jVan = new Int32Array(N);
    for (let i = 0; i < N; i++) { jAct[i] = st.flags[i] ? 1 : 0; jVan[i] = SHEET[st.type[i]] ?? -1; }
    const vt = trunksOf(W, H, vAct, vVan), jt = trunksOf(W, H, jAct, jVan);
    const vX = new Set(vt.map((t) => t.x)), jX = new Set(jt.map((t) => t.x));
    const jOnly = jt.filter((t) => !vX.has(t.x));
    const vOnly = vt.filter((t) => !jX.has(t.x));
    console.log(`\n== ${file} (seed ${seed}) ==`);
    console.log(`  trunk v=${vt.length} j=${jt.length}  同列=${jt.length - jOnly.length}  js-only=${jOnly.length} van-only=${vOnly.length}`);
    // x 分带差
    const band = 500;
    const bmap = new Map<number, { v: number; j: number }>();
    for (const t of vt) { const k = (t.x / band) | 0; bmap.set(k, { ...(bmap.get(k) ?? { v: 0, j: 0 }), v: (bmap.get(k)?.v ?? 0) + 1 }); }
    for (const t of jt) { const k = (t.x / band) | 0; const e = bmap.get(k) ?? { v: 0, j: 0 }; e.j++; bmap.set(k, e); }
    const bands = [...bmap.entries()].sort((a, b) => b[1].j - b[1].v - (a[1].j - a[1].v)).slice(0, 6);
    console.log(`  差异最重带（${band}格/带）: ` + bands.map(([k, e]) => `x[${k * band}-${k * band + band - 1}] v=${e.v} j=${e.j} Δ=${e.j - e.v}`).join('  '));
    // js-only 树的地面组合（van .wld 与 js 终态两侧的地表 tile/wall）
    const gcount = new Map<string, number>();
    for (const t of jOnly) {
      const i = (t.yBase + 1) * W + t.x;
      const jg = jAct[i] ? jVan[i] : -1, vg = vAct[i] ? vVan[i] : -1;
      const vw2 = wld.tiles.wall[i], jw2 = st.wall[i];
      const key = `ground v:${vg}/j:${jg} wall v:${vw2}/j:${jw2}`;
      gcount.set(key, (gcount.get(key) ?? 0) + 1);
    }
    console.log('  js-only 树基座组合 top10:');
    for (const [k, c] of [...gcount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`    ${String(c).padStart(4)}  ${k}`);
  }
}, 3_600_000);
