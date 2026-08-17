// 638/192/5/57 残余差异几何定位探针（env 门控=SW_P638=1；cd game 下
//   SW_P638=1 npx vitest run tools/_p638dump.test.ts）
// ① 生成 JS 世界 ↔ 解析 /tmp/vserver86/s111.wld
// ② 对目标 tile 族提取竖直 run（x, y0, len）与触发邻（上方格 type）
// ③ 双向 run 差集分类：同列触发差 / 长度差 / 整列缺失 / 位置漂移
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_P638 === '1';
const FILE = process.env.SW_P638F ?? 's111.wld';
const SEED = process.env.SW_P638S ?? '111';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const FAM = (process.env.SW_P638T ?? '638').split(',').map(Number);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface VRun { x: number; y0: number; len: number; anchorSheet: number; anchorActive: boolean }

(RUN ? it : it.skip)('638 family run diff dump', async () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const w = wld.tilesWide, h = wld.tilesHigh;
  const world = await generateWorld({ size: 0, width: SIZE_DIMS[0].width, height: SIZE_DIMS[0].height, seedText: SEED, evil: 0 });
  const st = world.store;
  const wt = wld.tiles, jt = st;
  const vSheet = (i: number) => (wt.active[i] === 1 ? wt.type[i] : -1);
  const jSheet = (i: number) => (jt.type[i] !== 0 ? SHEET[jt.type[i]] : -1);

  const runsOf = (sheet: (i: number) => number): VRun[] => {
    const out: VRun[] = [];
    const hit = (i: number) => FAM.includes(sheet(i));
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        const i = y * w + x;
        if (hit(i) && (y === 0 || !hit(i - w))) {
          let len = 0;
          while (y + len < h && hit((y + len) * w + x)) len++;
          const ai = (y - 1) * w + x;
          out.push({
            x, y0: y, len,
            anchorSheet: y > 0 ? vSheet(ai) : -99,   // 仅诊断用，下面重算两侧
            anchorActive: true,
          });
          y += len;
        } else y++;
      }
    }
    return out;
  };
  // anchor 重算（两侧各自）
  const anchorOf = (sheet: (i: number) => number, r: VRun): number =>
    r.y0 > 0 ? sheet((r.y0 - 1) * w + r.x) : -99;
  const vr = runsOf(vSheet);
  const jr = runsOf(jSheet);
  for (const r of vr) r.anchorSheet = anchorOf(vSheet, r);
  for (const r of jr) r.anchorSheet = anchorOf(jSheet, r);

  console.log(`家族 ${FAM}: run数 vanilla=${vr.length} js=${jr.length}; 格数 v=${vr.reduce((a, r) => a + r.len, 0)} j=${jr.reduce((a, r) => a + r.len, 0)}`);

  // run 匹配：同 x 分组，y0 对齐=同 run；统计 len 差与 anchor 差
  const key = (r: VRun) => `${r.x}:${r.y0}`;
  const vm = new Map(vr.map((r) => [key(r), r]));
  const jm = new Map(jr.map((r) => [key(r), r]));
  let both = 0, vOnly = 0, jOnly = 0, lenDiff = 0;
  const anchorDiff = new Map<string, number>();
  const vOnlyList: VRun[] = [], jOnlyList: VRun[] = [];
  const lenDiffList: Array<{ x: number; y0: number; vl: number; jl: number; va: number; ja: number }> = [];
  for (const [k, r] of vm) {
    const q = jm.get(k);
    if (!q) { vOnly++; vOnlyList.push(r); }
    else {
      both++;
      if (r.len !== q.len) {
        lenDiff++;
        lenDiffList.push({ x: r.x, y0: r.y0, vl: r.len, jl: q.len, va: r.anchorSheet, ja: q.anchorSheet });
      }
      if (r.anchorSheet !== q.anchorSheet) anchorDiff.set(`${r.anchorSheet}>${q.anchorSheet}`, (anchorDiff.get(`${r.anchorSheet}>${q.anchorSheet}`) ?? 0) + 1);
    }
  }
  for (const k of jm.keys()) if (!vm.has(k)) { jOnly++; const q = jm.get(k)!; jOnlyList.push(q); }
  console.log(`同位 run=${both} 长度差=${lenDiff} 仅vanilla=${vOnly} 仅js=${jOnly}`);
  console.log('同位 run anchor 差 top:', [...anchorDiff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
  console.log('长度差样例(x,y0,vl,jl,anchor):', lenDiffList.slice(0, 8).map((d) => `${d.x},${d.y0}:${d.vl}v${d.jl}j a${d.va}/${d.ja}`).join(' | '));

  // 仅一侧 run 的触发分析：对每根看该列 y0-1 与 y0 两侧各是谁
  const probe = (list: VRun[], tag: string) => {
    const bucket = new Map<string, number>();
    for (const r of list.slice(0, 4000)) {
      const aboveV = r.y0 > 0 ? vSheet((r.y0 - 1) * w + r.x) : -99;
      const aboveJ = r.y0 > 0 ? jSheet((r.y0 - 1) * w + r.x) : -99;
      const atV = vSheet(r.y0 * w + r.x), atJ = jSheet(r.y0 * w + r.x);
      const k = `v-above${aboveV}/at${atV} j-above${aboveJ}/at${atJ}`;
      bucket.set(k, (bucket.get(k) ?? 0) + 1);
    }
    console.log(`\n${tag} run（前4000）上下文签名 top:`);
    for (const [k, c] of [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ×${c}  ${k}`);
    // x 聚类：仅一侧的 run 是否集中在特定 x 段
    const xs = list.map((r) => r.x).sort((a, b) => a - b);
    if (xs.length) console.log(`  x范围=[${xs[0]},${xs[xs.length - 1]}] 中位=${xs[xs.length >> 1]} 样例x=${list.slice(0, 12).map((r) => `${r.x}@${r.y0}+${r.len}`).join(',')}`);
    // 长度直方
    const lh = new Map<number, number>();
    for (const r of list) lh.set(r.len, (lh.get(r.len) ?? 0) + 1);
    console.log(`  len直方 top: ${[...lh.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, c]) => `${l}:${c}`).join(' ')}`);
  };
  probe(vOnlyList, '仅vanilla');
  probe(jOnlyList, '仅js');

  // 全量 anchor 触发源统计（两侧 638 run 的 anchor 分布——诊断 633 是否同位）
  const va = new Map<number, number>(), ja2 = new Map<number, number>();
  for (const r of vr) va.set(r.anchorSheet, (va.get(r.anchorSheet) ?? 0) + 1);
  for (const r of jr) ja2.set(r.anchorSheet, (ja2.get(r.anchorSheet) ?? 0) + 1);
  console.log('\nanchor 分布 vanilla:', [...va.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
  console.log('anchor 分布 js     :', [...ja2.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
}, 600_000);
