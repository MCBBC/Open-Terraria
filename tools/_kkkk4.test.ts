// 一次性诊断（KKKKKKK）：段级网格观察——每个 snap 检查点记录目标格的 sheet/act，
// 定位 JS-only 残差簇（painting 242 / books 101）的首写段。
// 用法：SW_MB_1457=1 SW_K4=1 SW_K4_SEED=1321365005 SW_K4_EVIL=0 SW_K4_FLAGS=theConstant \
//   npx vitest run tools/_kkkk4.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_K4 === '1';
const SEED = process.env.SW_K4_SEED ?? '1321365005';
const EVIL = process.env.SW_K4_EVIL !== undefined ? Number(process.env.SW_K4_EVIL) : 0;
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_K4_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const TARGETS: Array<[number, number]> = [[3277, 752], [3277, 753], [3646, 757], [3646, 758]];
const W = 4200;

(RUN ? it : it.skip)('segment watch', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const seen = new Set<string>();
  let store: { type: Uint16Array; flags: Uint8Array } | null = null;
  (globalThis as { __dgSegWatch?: unknown }).__dgSegWatch = (name: string, st: { type: Uint16Array; flags: Uint8Array }) => {
    if (!store) store = st;
    for (const [x, y] of TARGETS) {
      const i = y * W + x;
      const on = (st.flags[i]! & 1) === 1;
      const key = `${x},${y}`;
      const tag = `${name}:${key}=${on ? SHEET[st.type[i]!] : 'off'}`;
      if (!seen.has(key) || true) {
        // 每段都打印（追踪翻转历史）
        console.log(`[seg] ${tag}`);
        seen.add(tag);
      }
    }
  };
  try {
    await generateWorld({ width: W, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined });
  } finally {
    (globalThis as { __dgSegWatch?: unknown }).__dgSegWatch = undefined;
  }
}, 600_000);
