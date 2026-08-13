// 放置块 tile 回填补遗回归(docs/implementation-gap-list-2026-08-13.md §3):
// 5 件 itemfunc 提取漏、vanilla.json createTile 有值 → BLOCK_TILE_BACKFILL 表回填。
// 此前 def.tile 为空 = 放置静默无效。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

describe('放置块 tile 回填(BLOCK_TILE_BACKFILL)', () => {
  const cases: Array<[number, string]> = [
    [3576, 'v_418_stardust_fragment_block'],
    [3637, 'v_434_white_team_block'],
    [3738, 'v_448_silly_green_balloon_block'],
    [2755, 'v_344_living_ultrabright_fire_block'],
    [2262, 'v_313_blue_dynasty_shingles'],
  ];
  it('5 件 def.tile 均已回填到正确 tile key', () => {
    for (const [vid, tileKey] of cases) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `vid ${vid} 应已注册`).toBeDefined();
      // ITEM_BY_KEY 是 key→索引表(非 def 表)
      const def = key ? ITEM_DEFS[ITEM_BY_KEY[key]] : undefined;
      expect(def?.tile, `vid ${vid} tile`).toBe(tileKey);
    }
  });
});
