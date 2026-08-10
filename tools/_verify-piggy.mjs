// 验证 tile 29 存钱罐补全：compat 报告应不再清空 + 导入后世界有 v_29_piggy_bank 格
import { readFileSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport.ts';
import { loadSave } from '../src/save/SaveFile.ts';
import { TILE_BY_KEY } from '../src/data/tiles.ts';

const buf = new Uint8Array(readFileSync('Starter_World Master.wld'));
const { save, report } = parseWldToSave(buf);
console.log('tilesCleared:', JSON.stringify(report.tilesCleared));
console.log('tilesDegraded:', JSON.stringify(report.tilesDegraded));

const { world } = loadSave(JSON.stringify(save));
const tid = TILE_BY_KEY['v_29_piggy_bank'];
console.log('v_29_piggy_bank tile id:', tid);
const st = world.store;
let n = 0;
for (let i = 0; i < st.type.length; i++) if (st.type[i] === tid) n++;
console.log('导入后存钱罐格数:', n);
