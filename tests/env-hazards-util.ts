// sheet id → internal tile id(测试专用;取首个 v_ 定义)
import { TILE_DEFS } from '../src/data/tiles';

export function sheetId(sheet: number): number {
  for (let id = 1; id < TILE_DEFS.length; id++) {
    if (TILE_DEFS[id]?.vanilla?.sheet === sheet) return id;
  }
  return -1;
}
