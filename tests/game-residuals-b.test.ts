import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dropInventoryOnDeath, bulkBuyAmount } from '../src/core/Game';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { VI_KEY } from '../src/data/itemKeys';


/** Game.ts A 级残差批（2026-08-15）：弹药 AmmoID 假数据 / 起始三件不掉落 */

describe('AmmoID 提取器假数据修复（tools/extract-itemcombat.mjs）', () => {
  const data = JSON.parse(
    readFileSync(resolve(__dirname, '../src/data/vanilla-itemcombat.json'), 'utf8'),
  ) as Record<string, Record<string, unknown>>;

  it('全表无 -1 假弹药 id（曾缺 9 枚举名落 -1：Flare/Snowball/StyngerBolt/CandyCorn/JackOLantern/Stake/NailFriendly/FallenStar/Acorn）', () => {
    const badUse = Object.entries(data).filter(([, e]) => e.useAmmo === -1).map(([id]) => id);
    const badAmmo = Object.entries(data).filter(([, e]) => e.ammo === -1).map(([id]) => id);
    expect(badUse).toEqual([]);
    expect(badAmmo).toEqual([]);
  });

  it('信号枪 930 useAmmo=931(AmmoID.Flare)、信号弹 931 ammo=931（Item.cs:12107）', () => {
    expect(data['930'].useAmmo).toBe(931);
    expect(data['931'].ammo).toBe(931);
  });

  it('星星炮 197 useAmmo=75(FallenStar)、坠落星 75 ammo=75（AmmoID.cs:118-120）', () => {
    expect(data['197'].useAmmo).toBe(75);
    expect(data['75'].ammo).toBe(75);
  });
});

describe('dropInventoryOnDeath 起始三件 TurnToAir 不掉落（Player.cs:53414-53418）', () => {
  it('铜短剑/镐/斧被清空且不进 spawn 回调，其余物品照掉', () => {
    const inv = new Inventory();
    const sw = ITEM_BY_KEY[VI_KEY.STARTER.SHORTSWORD];
    const pick = ITEM_BY_KEY[VI_KEY.STARTER.PICK];
    const axe = ITEM_BY_KEY[VI_KEY.STARTER.AXE];
    const torchKey = Object.keys(ITEM_BY_KEY).find((k) => k.startsWith('vi_8_')) ?? '';
    const torchId = torchKey ? ITEM_BY_KEY[torchKey] : -1;
    inv.slots[0] = { id: sw, stack: 1 };
    inv.slots[1] = { id: pick, stack: 1 };
    inv.slots[3] = { id: torchId, stack: 99 };

    const dropped: Array<[string, number]> = [];
    dropInventoryOnDeath(inv, (key, stack) => dropped.push([key, stack]));

    expect(dropped.some(([k]) => k === torchKey)).toBe(true);   // 普通物品照掉
    for (const [key] of dropped) {                              // 掉落物不含 3507/3506/3509
      const id = ITEM_BY_KEY[key];
      const vid = id != null ? ITEM_DEFS[id]?.vid : (ITEM_DEFS[ITEM_BY_KEY[key] ?? -1]?.vid);   // ★方案 A(BJ265):键→def vid 直读
      expect([3507, 3506, 3509]).not.toContain(vid ?? -1);
    }
    // 掉后发还：slots[0..2] = 新起始三件
    expect(inv.slots[0]?.id).toBe(sw);
    expect(inv.slots[1]?.id).toBe(pick);
    expect(inv.slots[2]?.id).toBe(axe);
  });
});

describe('Shift 批量买 10（ItemSlot.GetBulkBuyAmount :2861-2870 / CanBulkBuy :2874-2881）', () => {
  it('常规货架 10；buyOnce 货架 min(10, 剩余 stack)', () => {
    expect(bulkBuyAmount()).toBe(10);
    expect(bulkBuyAmount(undefined)).toBe(10);
    expect(bulkBuyAmount(23)).toBe(10);
    expect(bulkBuyAmount(7)).toBe(7);
    expect(bulkBuyAmount(1)).toBe(1);
  });
});
