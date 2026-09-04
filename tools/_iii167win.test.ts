// IIII167 一次性诊断仪：winter 10ch 帧差 208 格「逐 pass 写入源窗口」探针。
// 复用 _iii163fx 的种子/旗标/标签语义；差异点：只在 208 个终态帧差坐标（+3×3 邻域）
// 上采样 (act, typeSheet, fx, fy)，在每个 reseed 标签边界 + SLOT_END + 终态落 JSON。
// 产物：/tmp/iii167-out/js-window.json
//   cd game && SW_I167=1 SW_I167_SEED='1.1.1.0.winteriscoming|20260914' \
//     npx vitest run tools/_iii167win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I167 === '1';
const SEED = process.env.SW_I167_SEED ?? '1.1.1.0.winteriscoming|20260914';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const OUT = process.env.SW_I167_OUT ?? '/tmp/iii167-out';
const COORDS_FILE = process.env.SW_I167_COORDS ?? '/tmp/iii163-out/winter-final-fx-coords.json';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Snap { label: string; kind: 'reseed' | 'slotend' | 'final'; rows: number[] }
const snaps: Snap[] = [];
let coords: Array<[number, number]> = [];
let curStore: Parameters<typeof sample>[0] | null = null;

type Store = {
  w: number; h: number;
  idx(x: number, y: number): number;
  flags: Uint8Array; type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array;
};

function sample(st: Store): number[] {
  const rows: number[] = [];
  for (const [x, y] of coords) {
    // 3×3 邻域 + 自格：每格 4 值
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) { rows.push(0, 0, 0, 0); continue; }
        const k = st.idx(nx, ny);
        rows.push(st.flags[k]!, SHEET[st.type[k]] ?? 9999, st.frameX[k]!, st.frameY[k]!);
      }
    }
  }
  return rows;
}

(RUN ? it : it.skip)('IIIII167 per-pass window sampler', async () => {
  const led = JSON.parse(readFileSync(COORDS_FILE, 'utf8')) as Array<{ x: number; y: number }>;
  coords = led.map((e) => [e.x, e.y] as [number, number]);
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (curStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii167win')) {
          const src = readFileSync(m[1], 'utf8').split('\n');
          let lab = `${m[1].split('/').pop()}:${m[2]}`;
          for (let l = Math.min(Number(m[2]), src.length) - 1; l >= 0 && l >= Number(m[2]) - 40; l--) {
            const mm = src[l]!.match(/▶([^（(]+?)[（(\s]/);
            if (mm) { lab = mm[1]!.trim(); break; }
          }
          snaps.push({ label: lab, kind: 'reseed', rows: sample(curStore) });
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1 as -1 | 0 | 1,
      onWorldPartial: (w, i, pn) => {
        if (!curStore) curStore = w.store as never as typeof curStore;
        snaps.push({ label: `slotend#${i}_${pn}`, kind: 'slotend', rows: sample(curStore) });
      },
    });
  } finally { RNGp.reseed = oReseed; }
  if (curStore) snaps.push({ label: 'final', kind: 'final', rows: sample(curStore) });
  writeFileSync(`${OUT}/js-window.json`, JSON.stringify({
    seed: SEED, coords, snaps: snaps.map((s) => ({ label: s.label, kind: s.kind, rows: s.rows })),
  }));
  console.log(`i167win: coords=${coords.length} snaps=${snaps.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 900_000);
