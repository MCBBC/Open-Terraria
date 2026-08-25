// 生成 SW id ↔ 原版 TileID 对照底表(供 triage 用)
import { TILE_DEFS, TILE_BY_KEY, VANILLA_TILE_ID } from './src/data/tiles.ts';
void TILE_BY_KEY;
const rows = [];
TILE_DEFS.forEach((d, i) => {
  if (!d || i === 0) return;
  rows.push(`${i}\t${d.key}\tvanilla=${d.vanilla?.sheet ?? '-'}\tsolid=${d.solid ? 1 : 0}`);
});
console.log(rows.join('\n'));
