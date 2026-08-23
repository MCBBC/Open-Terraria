// 放置语义回填防回归(itemfunc.createTile/placeStyle → def.tile)
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { TILE_BY_KEY } from '../src/data/tiles';
import { VI } from '../src/data/itemKeys';

const defOfVid = (vid: number) => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  return k !== undefined ? ITEM_DEFS[ITEM_BY_KEY[k]] : undefined;
};

describe('放置回填(createTile → def.tile)', () => {
  it('全部 createTile≠-1 的 vi_ 物品都落上 tile(0 缺失)', () => {
    const missing: number[] = [];
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const m = /^vi_(\d+)_/.exec(ITEM_DEFS[i].key);
      if (!m) continue;
      const f = itemFuncOfVid(Number(m[1]));
      if (!f || f.createTile === undefined || f.createTile === -1) continue;
      if (ITEM_DEFS[i].tile === undefined) missing.push(Number(m[1]));
    }
    expect(missing, `未落 tile 的 vid: ${missing.slice(0, 10)}`).toEqual([]);
  });

  it('本地放置物的继任 vi_ 物品 tile 落点正确', () => {
    const cases: Array<[number, string]> = [
      [8, 'torch'],            // Torch → tile 'torch'(sheet 4)
      [25, 'door_closed'],     // Wooden Door
      [36, 'workbench'],       // Work Bench(sheet 18)
      [33, 'furnace'],         // Furnace(sheet 17)
      [35, 'anvil'],           // Iron Anvil(sheet 16)
      [48, 'chest'],           // Chest(sheet 21)
      [94, 'platform'],        // Wood Platform(sheet 19)
      [32, 'table'],           // Table(sheet 14)
      [34, 'chair'],           // Chair(sheet 15)
      [965, 'v_213_rope'],     // Rope
    ];
    for (const [vid, tileKey] of cases) {
      const d = defOfVid(vid);
      expect(d, `vid ${vid} 无 def`).toBeDefined();
      expect(TILE_BY_KEY[d!.tile!], `vid ${vid} tile=${d!.tile} ≠ ${tileKey}`).toBe(TILE_BY_KEY[tileKey]);
    }
  });

  it('钱币三档 maxStack=100(100 进位依赖)——铂币 74 无覆盖=9999（1456/1457 同值堆叠改制）', () => {
    // 1456/1457 同值 SetDefaults 仅 11 处 maxStack 覆盖(1457 :2222-2264 三档)：71/72/73=100，74（铂币）无覆盖走
    // CommonMaxStack=9999（Item.cs:66；曾四档全 100 的旧断言陈旧）
    for (const vid of [71, 72, 73]) {
      expect(defOfVid(vid)!.maxStack, `vid ${vid}`).toBe(100);
    }
    expect(defOfVid(74)!.maxStack).toBe(9999);
  });

  it('VI() 查表与关键常量(驼峰权威,禁手拼键)', () => {
    expect(VI(9)).toMatch(/^vi_9_/);
    expect(VI(71)).toMatch(/^vi_71_/);
    expect(VI(999999)).toBe('');
  });
});
