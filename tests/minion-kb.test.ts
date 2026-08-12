// minionKB 终审补接验证（GetWeaponKnockback :52477-52482）：配饰聚合 +2/件
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

describe('minionKB（大力士甲虫 1167 +2 / 纸莎草 1864 +2，死灵卷轴无 KB）', () => {
  it('聚合：双件 +4，单件 +2，无件 0', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.equipStats.minionKB).toBe(0);
    p.inv.armor[3] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1167]], stack: 1 };
    expect(p.equipStats.minionKB).toBe(2);
    p.inv.armor[4] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1864]], stack: 1 };
    expect(p.equipStats.minionKB).toBe(4);
  });
});
