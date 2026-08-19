// Item.color 静态表 + 图标/掉落着色（Item.cs SetDefaults :1638/:5161 等 + Main.cs
// :38178/:39211 两遍绘制）。用户 2026-08-19 报：凝胶在背包显示灰色（应为蓝色）。
import { describe, it, expect } from 'vitest';
import { VANILLA_ITEM_COLOR, blendItemColorTint } from '../src/data/vanillaItemColor';
import { ItemDrop } from '../src/entities/ItemDrop';
import { internalIdOfVanilla } from '../src/stats/Shimmer';
import { TILE_BY_KEY } from '../src/data/tiles';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

describe('Item.color 静态表（Item.cs SetDefaults 全 10 件）', () => {
  it('凝胶 23 = (0,80,255,100) 染蓝（:1638）；316-319 青（:5161）', () => {
    expect(VANILLA_ITEM_COLOR[23]).toEqual([0, 80, 255, 100]);
    for (const id of [316, 317, 318, 319]) {
      expect(VANILLA_ITEM_COLOR[id]).toEqual([123, 167, 163, 255]);
    }
  });

  it('A=0 五组渲染无操作（GetColor 数学恒不可见）——表内保留对账', () => {
    for (const id of [820, 821, 822, 823, 3001, 3061, 3002, 3109, 3110, 3111, 3112, 4773, 4774, 4775, 4776]) {
      expect(VANILLA_ITEM_COLOR[id]).toEqual([255, 255, 255, 0]);
    }
  });

  it('blendItemColorTint：灰凝胶像素 → 蓝（原版第二遍 alpha 混合等价）', () => {
    // 源贴图灰 (106,106,108)（实测 terraria-assets Item_23 平均色），tint (0,80,255,100)
    const data = new Uint8ClampedArray([106, 106, 108, 255, 0, 0, 0, 0]);
    blendItemColorTint(data, VANILLA_ITEM_COLOR[23]);
    // a=100/255≈0.392：out = 0.392*(0,80,255) + 0.608*(106,106,108) ≈ (64,96,166)
    expect(data[0]).toBeGreaterThanOrEqual(58); expect(data[0]).toBeLessThanOrEqual(70);
    expect(data[1]).toBeGreaterThanOrEqual(90); expect(data[1]).toBeLessThanOrEqual(102);
    expect(data[2]).toBeGreaterThanOrEqual(158); expect(data[2]).toBeLessThanOrEqual(175);
    expect(data[2]).toBeGreaterThan(data[1]);      // 蓝 > 绿 = 蓝色调
    expect(data[3]).toBe(255);                      // 透明像素（后 4 位）不动
    expect(data[4]).toBe(0);
  });

  it('A=0 tint 恒等跳过', () => {
    const data = new Uint8ClampedArray([200, 100, 50, 255]);
    blendItemColorTint(data, [255, 255, 255, 0]);
    expect(data).toEqual(new Uint8ClampedArray([200, 100, 50, 255]));
  });
});

describe('ItemDrop 构造注入（掉落物着色数据源）', () => {
  const mkHooks = (w: World) => ({ world: w }) as unknown as GameHooks;

  it('凝胶掉落带蓝色 color；普通物品无 color', () => {
    const w = new World(40, 100, 7, 'gel-color');
    const gelId = internalIdOfVanilla(23);
    expect(gelId).toBeGreaterThan(0);
    const d = new ItemDrop(100, 100, gelId, 1);
    expect(d.color).toEqual([0, 80, 255, 100]);
    // 石头 3（无表项）
    const stoneId = internalIdOfVanilla(3);
    const d2 = new ItemDrop(100, 100, stoneId, 1);
    expect(d2.color).toBeUndefined();
    // A=0 组（3109）不注入——渲染无操作
    const noopId = internalIdOfVanilla(3109);
    if (noopId > 0) {
      const d3 = new ItemDrop(100, 100, noopId, 1);
      expect(d3.color).toBeUndefined();
    }
    void mkHooks; void TILE_BY_KEY;
  });
});
