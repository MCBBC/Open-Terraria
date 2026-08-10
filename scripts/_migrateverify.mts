// 迁移产物验证:标注点 (3227,391) 应为 v_5_trees 帧语义;loadSaveData 可完整回读
import { loadSaveData } from '../src/save/SaveFile.ts';
import { TILE_DEFS, TILE_BY_KEY, TILE_INTERNAL_OF_STABLE } from '../src/data/tiles.ts';
import fs from 'fs';
let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (c) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n, x ?? ''); } };
const raw = fs.readFileSync('/tmp/migrated.v3.json', 'utf8');
const data = JSON.parse(raw);
check('version=3 + idScheme', data.version === 3 && data.idScheme === 'sheet');
const { world } = loadSaveData(data);
const st = world.store;
const keyAt = (x: number, y: number) => TILE_DEFS[st.type[st.idx(x, y)]]?.key;
check('(3227,391) = v_616 黄柳树(wld 真身)', keyAt(3227, 391) === 'v_616_vanity_tree_yellow_willow', keyAt(3227, 391));
check('帧保留 (22,198) 冠标记', st.frameX[st.idx(3227, 391)] === 22 && st.frameY[st.idx(3227, 391)] === 198);
check('(3227,396) 干身(v_616)', keyAt(3227, 396) === 'v_616_vanity_tree_yellow_willow', keyAt(3227, 396));
// 地表随机抽 3 处应为原版 tile 而非 oasis
check('(3200,391) 非 oasis 植物', keyAt(3200, 391) !== 'v_530_oasis_plants', keyAt(3200, 391));
// 稳定 id 直查:迁移后 RLE 里树=5
check('v_5_trees internal 反查表对齐', TILE_INTERNAL_OF_STABLE[5] === TILE_BY_KEY['v_5_trees']);
console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
