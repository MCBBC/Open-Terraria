// IIII93 迷你探针：全程生成并在每槽末读取指定格子通道值，打印变更时间线。
// 用法：cd game && SW_I93CELL_SEED='...' SW_I93CELL_EVIL=-1 SW_I93CELL_FLAGS='' \
//        SW_I93CELL_X=1036 SW_I93CELL_Y=295 npx vitest run tools/_iii89cell.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const SEED = process.env.SW_I93CELL_SEED ?? '';
const EVIL = Number(process.env.SW_I93CELL_EVIL ?? 0);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I93CELL_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const X = Number(process.env.SW_I93CELL_X ?? 1036);
const Y = Number(process.env.SW_I93CELL_Y ?? 295);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(SEED ? it : it.skip)('cell timeline', async () => {
  let last = '';
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: Object.keys(FLAGS).length ? FLAGS : undefined,
    onWorldPartial: (w, i, pn) => {
      const st = w.store as never as { idx: (x: number, y: number) => number; flags: Uint8Array; type: Uint16Array; wall: Uint16Array; slope: Uint8Array; half: Uint8Array };
      const k = st.idx(X, Y);
      const row = `act=${st.flags[k] & 1} sheet=${st.flags[k] & 1 ? SHEET[st.type[k]] : '-'} wall=${st.wall[k]} sl=${st.slope[k]} hf=${st.half[k]} t=${st.flags[k] & 1 ? st.type[k] : '-'}`;
      if (row !== last) { console.log(`slot#${String(i).padStart(3)} ${pn}: ${row}`); last = row; }
    },
  });
}, 600_000);
