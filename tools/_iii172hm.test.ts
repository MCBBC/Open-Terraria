// IIII172 traps 域内段位追踪:借 runTrapsPass 的 __swTrapHm hashmark 钩,在每个段位
// 快照目标格 → 定位 y=0 残帧写手的段内相位。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I172H === '1';
const SEED = process.env.SW_I172H_SEED ?? '0';
const EVIL = process.env.SW_I172H_EVIL !== undefined ? Number(process.env.SW_I172H_EVIL) : -1;
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const PTS = (process.env.SW_I172H_POINTS ?? '').split(';').filter(Boolean).map((s) => s.split(',').map(Number));
const FLAGS: Record<string, boolean> = { noTraps: true };

(RUN ? it : it.skip)('IIIII172 traps hashmark trace', async () => {
  const marks: Array<{ m: string; cells: string[] }> = [];
  (globalThis as unknown as { __swTrapHm?: (l: string) => void }).__swTrapHm = (l: string) => {
    const st = (globalThis as unknown as { __swI172HStore?: {
      type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; idx: (x: number, y: number) => number;
    } }).__swI172HStore;
    if (!st) return;
    marks.push({ m: l, cells: PTS.map(([x, y]) => {
      const k = st.idx(x, y);
      return `(${x},${y}) a=${st.flags[k]! & 1} t=${st.type[k]!} fx=${st.frameX[k]!}`;
    }) });
  };
  let last: unknown = null;
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS,
    onWorldPartial: (w) => {
      (globalThis as unknown as { __swI172HStore?: unknown }).__swI172HStore = w.store;
      last = w.store;
    },
  });
  writeFileSync('/tmp/iii172-out/trace/hm-traps.json', JSON.stringify(marks.slice(0, 40), null, 1));
  const seen = new Set<string>();
  for (const mk of marks) {
    const key = mk.cells.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`[hm] ${mk.m} → ${mk.cells.join(' ; ')}`);
  }
  console.log(`marks=${marks.length} lastStoreSet=${!!last}`);
}, 900_000);
