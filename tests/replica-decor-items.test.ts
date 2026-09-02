// SW-C1（2026-09-03）: 1.4.4 复刻装饰件四物品入库回归（DemonAltarReplica 5467 /
// CrimsonAltarReplica 5468 / ShadowOrbReplica 5469 / CrimsonHeartReplica 5470）。
// breakTile 的 695/696 掉落分支（Game.ts:16998/:17003）反查 VANILLA_ITEM_KEY_BY_ID，
// 此前物品/配方侧未入库=静默。原版锚：Item.cs SetDefaults case 5467-5470
// （:43144-43154 DefaultToPlaceableTile(695/696, placeStyle)）+ Recipe.cs:14689-14709。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { VANILLA_RECIPES } from '../src/data/vanillaRecipes';

// tile 695=3×2 祭坛 / 696=2×2 珠；placeStyle 1=猩红样式（帧偏移=style*fw*18 → 54/36，
// 与 breakTile 猩红谓词 frameX>=54 / >=36 同口径）
const EXPECT = [
  { vid: 5467, key: 'vi_5467_DemonAltarReplica', tile: 'v_695_replica_demon_altar', placeStyle: 0 },
  { vid: 5468, key: 'vi_5468_CrimsonAltarReplica', tile: 'v_695_replica_demon_altar', placeStyle: 1 },
  { vid: 5469, key: 'vi_5469_ShadowOrbReplica', tile: 'v_696_replica_shadow_orb', placeStyle: 0 },
  { vid: 5470, key: 'vi_5470_CrimsonHeartReplica', tile: 'v_696_replica_shadow_orb', placeStyle: 1 },
];

describe('复刻装饰件四物品 5467-5470（SW-C1）', () => {
  it('breakTile 反查可解析 + def.tile 指向 695/696 + placeStyle 两态', () => {
    for (const e of EXPECT) {
      const k = VANILLA_ITEM_KEY_BY_ID[e.vid];
      expect(k, `vid ${e.vid} 反查失败`).toBe(e.key);
      const idx = ITEM_BY_KEY[k];
      const d = idx !== undefined ? ITEM_DEFS[idx] : undefined;
      expect(d, `def 缺失: ${k}`).toBeTruthy();
      expect(d!.tile, `${k}.tile`).toBe(e.tile);
      expect(d!.placeStyle, `${k}.placeStyle`).toBe(e.placeStyle);
    }
  });

  it('配方在册且与 Recipe.cs:14689-14709 逐材料一致', () => {
    const want = [
      { create: 5467, tile: 283, graveyard: true, items: [[61, 15], [57, 3], [86, 3]] },
      { create: 5468, tile: 283, graveyard: true, items: [[836, 15], [1257, 3], [1329, 3]] },
      { create: 5469, tile: 26, graveyard: false, items: [[57, 5], [86, 5]] },
      { create: 5470, tile: 26, graveyard: false, items: [[1257, 5], [1329, 5]] },
    ];
    for (const w of want) {
      const rs = VANILLA_RECIPES.filter(r => r.create === w.create);
      expect(rs, `配方缺失: ${w.create}`).toHaveLength(1);
      expect(rs[0].tile).toBe(w.tile);
      expect(!!rs[0].graveyard).toBe(w.graveyard);
      expect(rs[0].items.map(i => [i.id, i.stack])).toEqual(w.items);
    }
  });
});
