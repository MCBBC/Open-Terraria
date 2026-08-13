// 裂砖 481-483 运行期非实心（原版 FinalCleanup SetCrackedBrickSolidity(false)
// WorldGen.cs:16695;DungeonCrawler.cs:344 生成期同 false——假墙,可穿过/秒破,
// 走廊裂砖段堵路根因即此前 tiles.ts 误标 solid:true）
import { describe, it, expect } from 'vitest';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

describe('裂砖非实心（FinalCleanup :16695）', () => {
  it('481/482/483 solid=false（蓝/绿/粉三主题裂砖）', () => {
    for (const k of ['v_481_cracked_blue_brick', 'v_482_cracked_green_brick', 'v_483_cracked_pink_brick']) {
      expect(TILE_DEFS[TILE_BY_KEY[k]!].solid, k).toBe(false);
    }
  });
});
