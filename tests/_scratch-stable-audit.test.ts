// 一次性勘察:D1 重复 vid 归一形态(修完即删)
import { describe, it } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, ITEM_STABLE_OF_INTERNAL, ITEM_INTERNAL_OF_STABLE } from '../src/data/items';

describe('stable dup audit', () => {
  it('dup form', () => {
    for (const k of ['vi_1615_banner_b1', 'vi_1615_AnglerFishBanner', 'vi_2289_f2289', 'vi_2289_WoodFishingPole', 'vi_6156_SilverBracer']) {
      const id = ITEM_BY_KEY[k];
      if (id === undefined) { console.log(`[dup] ${k}: 未注册`); continue; }
      const s = ITEM_STABLE_OF_INTERNAL[id];
      const back = ITEM_INTERNAL_OF_STABLE.get(s);
      console.log(`[dup] ${k}: internal=${id} stable=${s} back=${back} backKey=${ITEM_DEFS[back]?.key} tile=${ITEM_DEFS[id]?.tile ?? '-'} backTile=${ITEM_DEFS[back]?.tile ?? '-'} maxStack=${ITEM_DEFS[id]?.maxStack}/${ITEM_DEFS[back]?.maxStack}`);
    }
  });
});
