// IIII173 批一次性探针：settle2/livingtrees 检查点网格通道导出（liq 定谳 + 石堆组对拍）
// 用法：cd game && SW_173_RUN=1 SW_173_SEED=9293480 SW_173_EVIL=0 SW_173_AT=settle2 \
//         SW_173_DIR=/tmp/iii173-out/js npx vitest run tools/_iii173cap.test.ts
// 复用 tests/caves-checkpoint.test.ts 的 __cavesGridExport 钩子（snap 内落 typ/act/wal/
// liq/slope/half/frx/fry/lty 十通道裸数组）；多名逗号分隔（落 `${dir}-${name}.*`）。
import { it } from 'vitest';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const RUN = !!process.env.SW_173_RUN;
const SEED = process.env.SW_173_SEED ?? '9293480';
const EVIL = Number(process.env.SW_173_EVIL ?? '0') as 0 | 1;
const AT = process.env.SW_173_AT ?? 'settle2';
const DIR = process.env.SW_173_DIR ?? '/tmp/iii173-out/js';

(RUN ? it : it.skip)(`iii173 cap seed=${SEED} at=${AT}`, () => {
  (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport = { at: AT, dir: DIR };
  try {
    const res = chainCheckpoints(SEED, EVIL);
    for (const n of AT.split(',')) console.log(`III173HASH ${n} ${res.grids.get(n)}`);
  } finally {
    (globalThis as { __cavesGridExport?: unknown }).__cavesGridExport = undefined;
  }
}, 600000);
