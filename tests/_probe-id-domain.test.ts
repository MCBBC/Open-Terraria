// 临时探针（RV3 items.ts 重复注册 id 域实测;查完即删）
import { describe, it } from 'vitest';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import recipes from '../src/data/vanilla-recipes.json';

describe('probe', () => {
  it('id 域实测', () => {
    const woodId = ITEM_BY_KEY['place_wood'];
    console.log('place_wood internal id:', woodId);
    let found = 0;
    for (const r of recipes as Array<{ items: Array<{ id: number }> }>) {
      for (const ing of r.items ?? []) if (ing.id === woodId) found++;
    }
    console.log('配方中 wood 内部 id 原料次数:', found);
    for (const k of ['vi_122_molten_pickaxe', 'vi_217_molten_hamaxe', 'vi_1507_spectre_hamaxe', 'vi_5359_shellphone_spawn']) {
      const hits = ITEM_DEFS.map((d, i) => (d.key === k ? i : -1)).filter(i => i >= 0);
      console.log(k, '注册下标:', hits.join(','));
    }
    // tooltip 链实测：wood 材料标签是否命中
    const ing0 = (recipes as Array<{ items: Array<{ id: number }> }>)[0]?.items?.[0]?.id;
    console.log('配方首条原料 id 样本:', ing0, '→ DEFS key:', ITEM_DEFS[ing0]?.key);
  });
});
