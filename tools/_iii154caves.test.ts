// IIII154 批一次性探针：caves/shimmer 链 underworld/gems 段网格导出（oracle 对拍用）
// 用法：cd game && SW_154_SEED=9293480 SW_154_EVIL=0 SW_154_AT=underworld \
//         SW_154_DIR=/tmp/iii154-out/js-uw npx vitest run tools/_iii154caves.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = !!process.env.SW_154_SEED;
const SEED = process.env.SW_154_SEED ?? '9293480';
const EVIL = Number(process.env.SW_154_EVIL ?? '0') as 0 | 1;
const AT = process.env.SW_154_AT ?? 'underworld';
const DIR = process.env.SW_154_DIR ?? '/tmp/iii154-out/js-uw';

(RUN ? it : it.skip)(`iiii154 grid export @${AT} seed=${SEED}`, async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  writeFileSync(`${DIR}.sheet.json`, JSON.stringify([...SHEET]));
  (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport = { at: AT, dir: DIR };
  try {
    const res = chainCheckpoints(SEED, EVIL);
    for (const n of ['webs', 'underworld', 'gems', 'shimmershell']) console.log(`${n} ${res.grids.get(n)}`);
  } finally {
    (globalThis as { __cavesGridExport?: unknown }).__cavesGridExport = undefined;
  }
}, 600000);
