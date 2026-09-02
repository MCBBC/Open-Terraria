// #53 雪崩预分析·R0 三格定性（SW_SLP4=1）：clean 重放对 x∈[2426,2430]∪y∈[660,670]
// 与 (2678-2682,713-716) 两窗打 SWAct 事件 + golden052→053 差分窗，判 JS 未动作的分支。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_SLP4 === '1';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
// ★套件门(2026-09-02)
// ★套件门(2026-09-02):夹具目录缺省不扫
if (RUN) for (const f of readdirSync(G2)){ const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));

(RUN ? it : it.skip)('R0 cell window trace', () => {
  const t52 = rd16(52, 'typ'), a52 = rd8(52, 'act'), l52 = rd8(52, 'liq'), lt52 = rd8(52, 'lty'), hf52 = rd8(52, 'half'), sl52 = rd8(52, 'slope');
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.flags[i] = a52[i] ? 1 : 0;
    st.type[i] = REV.get(t52[i]) ?? 0;   // ghost 保真
    st.liquid[i] = l52[i]; st.liquidType[i] = l52[i] > 0 ? lt52[i] + 1 : 0;
    st.half[i] = hf52[i]; st.slope[i] = sl52[i];
    st.wire[i] = 0;
  }
  const rng = new RNG(SEED);
  const acts: string[] = [];
  (globalThis as { __swSWAct?: (fn: string, x: number, y: number, e: number) => void }).__swSWAct = (fn, x, y, e) => {
    const win = (x >= 2424 && x <= 2432 && y >= 658 && y <= 672) || (x >= 2676 && x <= 2684 && y >= 710 && y <= 718);
    if (win) acts.push(`${fn}(${x},${y})${e || ''}`);
  };
  runSmoothWorldPass(st, rng, { seed: SEED } as GenState);
  (globalThis as { __swSWAct?: unknown }).__swSWAct = undefined;
  console.log('JS clean 重放两窗事件:', acts.join(' ') || '（无任何动作）');

  // golden 052→053 两窗差分（vanilla 自己的动作足迹）
  const t53 = rd16(53, 'typ'), a53 = rd8(53, 'act'), hf53 = rd8(53, 'half'), sl53 = rd8(53, 'slope');
  const win = (x: number, y: number) => (x >= 2424 && x <= 2432 && y >= 658 && y <= 672) || (x >= 2676 && x <= 2684 && y >= 710 && y <= 718);
  const ev: string[] = [];
  for (let y = 658; y <= 718; y++) for (let x = 2424; x <= 2684; x++) {
    if (!win(x, y)) continue;
    const i = y * W + x;
    const v52 = a52[i] ? t52[i] : -1, v53 = a53[i] ? t53[i] : -1;
    if (v52 !== v53 || hf52[i] !== hf53[i] || sl52[i] !== sl53[i]) ev.push(`(${x},${y}) ${v52}h${hf52[i]}s${sl52[i]}→${v53}h${hf53[i]}s${sl53[i]}`);
  }
  console.log('golden 052→053 两窗差分:', ev.join(' ') || '（无变化）');
  // 重放输出两窗差分
  const ev2: string[] = [];
  for (let y = 658; y <= 718; y++) for (let x = 2424; x <= 2684; x++) {
    if (!win(x, y)) continue;
    const i = y * W + x;
    const j52v = st.flags[i] ? (SHEET[st.type[i]] ?? -1) : -1;
    const v52 = a52[i] ? t52[i] : -1, v53 = a53[i] ? t53[i] : -1;
    if (j52v !== v53 || st.half[i] !== hf53[i] || st.slope[i] !== sl53[i]) ev2.push(`(${x},${y}) in${v52} → js${j52v}h${st.half[i]}s${st.slope[i]} vs g53 ${v53}h${hf53[i]}s${sl53[i]}`);
  }
  console.log('重放 vs golden053 两窗差分:', ev2.join(' ') || '（无）');
}, 580_000);
