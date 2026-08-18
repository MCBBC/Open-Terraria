// ZZZ 隔离探针：golden104+s56 边界 → 分别跑 165/187/28 检查，定位过杀根因
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { checkStalactite } from '../src/world/gen/vanilla/ShimmerPass';

const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}

it('isolate 165/187/28 overkill', () => {
  const b8 = (e: string) => new Uint8Array(readFileSync(`${G2}/104_Remove_Broken_Traps.${e}`).buffer.slice(0));
  const b16 = (e: string) => new Uint16Array(readFileSync(`${G2}/104_Remove_Broken_Traps.${e}`).buffer.slice(0));
  const a = b8('act'), t = b16('typ');
  const fw = new Uint32Array(readFileSync(`${BDIR}/s56/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N);
  for (let q = 0; q < fw.length; q += 4) { fx[fw[q]!] = fw[q + 1]!; fy[fw[q]!] = fw[q + 2]!; }

  // --- A: 165 计数与支撑状态
  let c165 = 0, c165noSupport = 0, c165styleMismatch = 0;
  const samples: string[] = [];
  for (let x = 6; x < W - 6; x++) {
    for (let y = 6; y < H - 6; y++) {
      const i = y * W + x;
      if (!a[i] || t[i] !== 165) continue;
      c165++;
      const jfy = fy[i]!;
      // 垂挂双格: top 格 fy=0（num=y）；solidTileSlope(x, num-1)
      if (jfy === 0 || jfy === 18 || jfy === 36 || jfy === 54) {
        const num = jfy >= 36 ? (jfy === 54 ? y - 1 : y) : (jfy === 18 ? y - 1 : y);
        // 粗查支撑: 上一格 solid?
        const ui = (num - 1) * W + x;
        const solid = a[ui] && TILE_DEFS[REV.get(t[ui]!) ?? 0]?.solid;
        if (!solid) { c165noSupport++; if (samples.length < 4) samples.push(`165@(${x},${y}) fy=${jfy} above=${t[ui]}`); }
      }
    }
  }
  console.log(`A: 165 total=${c165} noSolidAbove(pair)≈${c165noSupport} ${samples.join(' | ')}`);

  // --- B: 187 完整性抽查（golden 帧 vs JS 帧）
  let c187 = 0, c187frameMismatch = 0;
  const s2: string[] = [];
  for (let i = 0; i < N; i++) {
    if (!a[i] || t[i] !== 187) continue;
    c187++;
    if (s2.length < 4) s2.push(`187@(${i % W},${(i / W) | 0}) gfy=${fy[i]}`);
  }
  console.log(`B: 187 total=${c187} ${s2.join(' | ')}`);

  // --- C: 实跑 checkStalactite（无 reframe）统计击杀
  const st = new TileStore(W, H);
  {
    const wal = b16('wal'), hf = b8('half'), sl = b8('slope');
    for (let i = 0; i < N; i++) {
      st.flags[i] = a[i]!;
      st.type[i] = a[i] || t[i] ? (REV.get(t[i]!) ?? 0) : 0;
      st.wall[i] = wal[i]!;
      st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
      st.half[i] = hf[i]!; st.slope[i] = sl[i]!;
    }
  }
  let before = 0;
  for (let i = 0; i < N; i++) if (st.flags[i] && SHEET[st.type[i]!] === 165) before++;
  const rng = new RNG(9293480);
  for (let x = 6; x < W - 6; x++) for (let y = 6; y < H - 6; y++) {
    const i = st.idx(x, y);
    if (st.flags[i] && SHEET[st.type[i]!] === 165) checkStalactite(st, rng, x, y);
  }
  let after = 0;
  for (let i = 0; i < N; i++) if (st.flags[i] && SHEET[st.type[i]!] === 165) after++;
  console.log(`C: checkStalactite no-reframe kills=${before - after} (before=${before})`);
});
