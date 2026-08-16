// 一次性诊断（dungeonI 转写债，2026-08-16 已修复收档）：分歧格相关内部 tile 的
// vanilla 映射/solid 标志速查。默认让位（SW_DGI_DUMP=1 才跑）。
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';

(!!process.env.SW_DGI_DUMP ? it : it.skip)('defs', () => {
  for (const id of [327, 95, 0]) {
    const d = TILE_DEFS[id];
    console.log(`TILE_DEFS[${id}] =`, d ? JSON.stringify({ key: d.key, solid: d.solid, sheet: d.vanilla?.sheet, frame: d.vanilla?.frame }) : 'undefined');
  }
  // 全表反查：哪些内部 id 的 sheet 是 41/43/44/677/678/679（dungeon tiles）？
  const dgSet = new Set([41, 43, 44, 677, 678, 679]);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    if (dgSet.has(TILE_DEFS[i]?.vanilla?.sheet ?? -1)) console.log(`sheetDungeon id=${i} key=${TILE_DEFS[i].key} solid=${TILE_DEFS[i].solid}`);
  }
});
