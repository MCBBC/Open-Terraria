// IIII71b：placeStatueTrap 全程台账（配合 StatuesPass __swI77Trap 取证钩）
// 用法：cd game && SW_I77TRAP=1 npx vitest run tools/_iii77tr.test.ts
import { it } from 'vitest';
import { writeFileSync, existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { RNG } from '../src/core/rng';
import type { TileStore } from '../../src/world/TileStore';

const RUN = process.env.SW_I77TRAP === '1';
const OUT = process.env.SW_I77_OUT ?? '/tmp/iii77-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const SEED = process.env.SW_M8_SEED ?? '51620200';

(RUN ? it : it.skip)('statue trap ledger over full gen', async () => {
  process.env.SW_DG_LTMARK = '';
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let q = 0; q < TILE_DEFS.length; q++) {
    const s = TILE_DEFS[q]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[q] = s;
  }
  const sheetOf = (t: number): number => SHEET[t] ?? -1;
  const calls: string[] = [];
  const evals: string[] = [];
  let depthMark = '';
  let cx = 0, cy = 0;
  const inWin = (x: number, y: number): boolean => Math.max(x - 10, 1280) <= Math.min(x + 10, 1360)
    && Math.max(y - 10, 590) <= Math.min(y + 10, 670);
  (globalThis as unknown as { __swI77Trap?: unknown }).__swI77Trap =
    (phase: string, x: number, y: number, tx?: number, ty?: number, why?: string) => {
      if (phase === 'in') { cx = x; cy = y; depthMark = ''; }
      else if (phase === 'verdict' && inWin(x, y)) {
        const baseSheet = tx !== undefined && ty !== undefined && _lastSt ? sheetOf(_lastSt.type[_lastSt.idx(tx, ty + 1)]) : -1;
        evals.push(`${x},${y} v(${tx},${ty}) base=${baseSheet} ${why ?? ''}`);
      } else if (phase === 'chosen') { calls.push(`${x},${y} -> ${tx},${ty}`); if (inWin(x, y)) evals.push(`${x},${y} -> CHOSEN (${tx},${ty})`); }
      else if (phase === 'none') { calls.push(`${x},${y} -> NONE`); if (inWin(x, y)) evals.push(`${x},${y} -> NONE`); }
    };
  let _lastSt: TileStore | null = null;
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1,
      seedFlags: { drunkWorld: true },
      onWorldPartial: (w2) => { _lastSt = w2.store as never as TileStore; void _lastSt; },
    });
  } finally {
    delete (globalThis as unknown as Record<string, unknown>).__swI77Trap;
  }
  writeFileSync(`${OUT}/i77-trapcalls.log`, calls.join('\n') + '\n');
  writeFileSync(`${OUT}/i77-trapevals.log`, evals.join('\n') + '\n');
  console.log(`calls=${calls.length} evals(in-window)=${evals.length}`);
  for (const l of calls) console.log('  ' + l);
}, 900_000);

// 静默引用防 lint
void readFileSync; void existsSync; void ({} as RNG);
