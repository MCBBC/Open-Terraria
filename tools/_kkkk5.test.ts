// 一次性诊断（KKKKKKK）：残差两簇的逐段邻域快照——重建 F/Pa 段放置时的局部世界态。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_K5 === '1';
const W = 4200;
const REGIONS: Array<[number, number]> = [[3277, 752], [3646, 757]]; // [cx, cy]

(RUN ? it : it.skip)('per-segment neighborhood snapshots', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  let store: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array } | null = null;
  const out: string[] = [];
  (globalThis as { __dgSegWatch?: unknown }).__dgSegWatch = (name: string, st: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array }) => {
    store = st;
    out.push(`===== snap ${name} =====`);
    for (const [cx, cy] of REGIONS) {
      out.push(`--- 簇 (${cx},${cy}) ---`);
      for (let y = cy - 4; y <= cy + 5; y++) {
        const row: string[] = [];
        for (let x = cx - 6; x <= cx + 6; x++) {
          const i = y * W + x;
          const sh = (st.flags[i]! & 1) === 1 ? SHEET[st.type[i]!] : -1;
          row.push(sh >= 0 ? String(sh) : (st.wall[i]! > 0 ? '.' : ' '));
        }
        out.push(`y${y}: ${row.join(' ')}`);
      }
    }
  };
  try {
    await generateWorld({ width: W, height: 1200, seedText: '1321365005', evil: 0, seedFlags: { theConstant: true } });
  } finally {
    (globalThis as { __dgSegWatch?: unknown }).__dgSegWatch = undefined;
  }
  writeFileSync('/tmp/kkk-out/segshots.txt', out.join('\n') + '\n');
  console.log(`[k5] ${out.length} lines → /tmp/kkk-out/segshots.txt`);
}, 600_000);
