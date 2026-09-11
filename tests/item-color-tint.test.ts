// Item.color 静态表 + 图标/掉落两遍着色（Item.cs SetDefaults 全 10 处 + Terraria.UI/ItemSlot.cs
// :2879-2889 两遍绘制）。SW-BJ60 2026-09-11 重定谳：旧版此测试把鲨鱼鳍 319 的青色
// （1457 Item.cs:5180）误扩成"316-319 四件套"（注释 ":5161" 系 1456 行号），把草本
// 316/317/318 一并染青——用户报"火焰花背包图标=纯色 #8DC0BB"的根因；A=0 孤例组
// 同批被误扩（820-823/3001·3061·3002/3109-3112/4773-4776）。本测试 = 1457 金标。
import { describe, it, expect } from 'vitest';
import { VANILLA_ITEM_COLOR, blendItemColorTint } from '../src/data/vanillaItemColor';
import { ItemDrop } from '../src/entities/ItemDrop';
import { internalIdOfVanilla } from '../src/stats/Shimmer';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

describe('Item.color 静态表（1457 Item.cs SetDefaults 全 10 处逐位金标）', () => {
  it('表 = 恰好 10 项（22/23/65/282/286/319/823/3002/3112/4776）', () => {
    expect(Object.keys(VANILLA_ITEM_COLOR).map(Number).sort((a, b) => a - b))
      .toEqual([22, 23, 65, 282, 286, 319, 823, 3002, 3112, 4776]);
  });

  it('可见染三件：铁锭 22(:1640) / 凝胶 23(:1658) / 鲨鱼鳍 319(:5180)', () => {
    expect(VANILLA_ITEM_COLOR[22]).toEqual([160, 145, 130, 110]);
    expect(VANILLA_ITEM_COLOR[23]).toEqual([0, 80, 255, 100]);
    expect(VANILLA_ITEM_COLOR[319]).toEqual([123, 167, 163, 255]);
  });

  it('A=0 孤例七件（GetColor A 钳 0 = pass2 零贡献,对账保留）', () => {
    expect(VANILLA_ITEM_COLOR[65]).toEqual([150, 150, 150, 0]);   // 星怒 :2154(A=0,灰)
    for (const id of [282, 286, 823, 3002, 3112, 4776]) {
      expect(VANILLA_ITEM_COLOR[id]).toEqual([255, 255, 255, 0]);
    }
  });

  it('★草本家族 313-318/2358 + 种子 307-312/2357 全部无表项（:5146-5175/:23750-23754 无 color 赋值）——火焰花回归守卫', () => {
    const herbs = [313, 314, 315, 316, 317, 318, 2358, 307, 308, 309, 310, 311, 312, 2357];
    for (const id of herbs) {
      expect(VANILLA_ITEM_COLOR[id]).toBeUndefined();
    }
  });

  it('★同族误扩位无表项（820/821/822/3001/3061/3109/3110/3111/4773/4774/4775）', () => {
    for (const id of [820, 821, 822, 3001, 3061, 3109, 3110, 3111, 4773, 4774, 4775]) {
      expect(VANILLA_ITEM_COLOR[id]).toBeUndefined();
    }
  });
});

describe('blendItemColorTint 两遍合成（XNA 预乘,ka=1;ItemSlot.cs:2879-2889 等价）', () => {
  it('A=255（鲨鱼鳍）：乘法语义保留贴图明暗 out=T×C.rgb/255,α 不变', () => {
    // C=(123,167,163,255),t=1 → occ=1,keep=1−1·1=0 → out=T×(C/255)
    const data = new Uint8ClampedArray([255, 255, 255, 255, 200, 100, 50, 255, 106, 106, 108, 128, 0, 0, 0, 0]);
    blendItemColorTint(data, VANILLA_ITEM_COLOR[319]!);
    expect(data[0]).toBe(123);                             // 255×(123/255)
    expect(data[1]).toBe(167);
    expect(data[2]).toBe(163);
    // 半透明 texel（t=128/255）：独立两步 source-over 仿真（step1 底图 / step2 色图）
    {
      const T = [106, 106, 108], C = [123, 167, 163];
      const t = 128 / 255, kc = 1;
      // step1：底图 over 透明 → rgb=T, a=t
      // step2：色图（rgb=T×C/255, a=t·kc）over step1（straight-alpha source-over）
      const srcA = t * kc;
      const dstA = t;
      const a2 = srcA + dstA * (1 - srcA);
      const exp = T.map((v, ch) => Math.round((v * (C[ch] / 255) * srcA + v * dstA * (1 - srcA)) / a2));
      expect([data[8], data[9], data[10]]).toEqual(exp);
      expect(data[11]).toBe(Math.round(a2 * 255));
    }
    expect(data[15]).toBe(0);                              // 透明 texel 不动
  });

  it('A=100（凝胶）：底图残量叠加 out=T×C.rgb/255+T×(1−kc)', () => {
    // 源贴图灰 (106,106,108)（实测 Item_23 平均色），t=1：out=(106×0+106×0.6078,
    // 106×0.3137+106×0.6078, 108×1+108×0.6078)=(64.4,97.7,173.6)
    const data = new Uint8ClampedArray([106, 106, 108, 255]);
    blendItemColorTint(data, VANILLA_ITEM_COLOR[23]!);
    expect(data[0]).toBe(64);
    expect(data[1]).toBe(98);
    expect(data[2]).toBe(174);
    expect(data[3]).toBe(255);
  });

  it('A=110（铁锭）：同公式逐通道（XNA xnaCombined ka=1 等价式独立重算对拍）', () => {
    const src = [180, 160, 140, 255];
    const data = new Uint8ClampedArray([...src]);
    blendItemColorTint(data, VANILLA_ITEM_COLOR[22]!);
    const kc = 110 / 255, t = 1, keep = 1 - t * kc, occ = 1;
    const exp = src.slice(0, 3).map((T, ch) => Math.round((t * T * [160 / 255, 145 / 255, 130 / 255][ch] + t * T * keep) / occ));
    expect([data[0], data[1], data[2]]).toEqual(exp);
    expect(data[3]).toBe(255);
  });

  it('A=0 tint 恒等跳过（原版视觉无操作）', () => {
    const data = new Uint8ClampedArray([200, 100, 50, 255]);
    blendItemColorTint(data, [255, 255, 255, 0]);
    expect(data).toEqual(new Uint8ClampedArray([200, 100, 50, 255]));
  });
});

describe('ItemDrop 构造注入（掉落着色数据源,与 UI.iconUrl 同表单源=两路一致）', () => {
  it('凝胶 23 带蓝色 color；鲨鱼鳍 319 带青色；火焰花 318 无 color（SW-BJ60 定谳位）', () => {
    const w = new World(40, 100, 7, 'gel-color');
    void w;
    const gelId = internalIdOfVanilla(23);
    expect(gelId).toBeGreaterThan(0);
    const d = new ItemDrop(100, 100, gelId, 1);
    expect(d.color).toEqual([0, 80, 255, 100]);
    const finId = internalIdOfVanilla(319);
    const dFin = new ItemDrop(100, 100, finId, 1);
    expect(dFin.color).toEqual([123, 167, 163, 255]);
    // ★火焰花 318：1457 无 item.color → 掉落/图标双路原样（此前=[123,167,163,255] 误染）
    const fireId = internalIdOfVanilla(318);
    const dFire = new ItemDrop(100, 100, fireId, 1);
    expect(dFire.color).toBeUndefined();
    // 腐化草 316 / 水叶草 317 / 太阳花 313 同判
    for (const vid of [313, 316, 317]) {
      const dH = new ItemDrop(100, 100, internalIdOfVanilla(vid), 1);
      expect(dH.color).toBeUndefined();
    }
    // 石头 3（无表项）
    const stoneId = internalIdOfVanilla(3);
    const d2 = new ItemDrop(100, 100, stoneId, 1);
    expect(d2.color).toBeUndefined();
    // A=0 组（282 荧光棒）不注入——渲染无操作
    const noopId = internalIdOfVanilla(282);
    if (noopId > 0) {
      const d3 = new ItemDrop(100, 100, noopId, 1);
      expect(d3.color).toBeUndefined();
    }
  });
});
