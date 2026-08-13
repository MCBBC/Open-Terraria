import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { LIQUID_TYPE } from '../src/world/TileStore';
import { itemCombat } from '../src/data/vanillaItemCombat';

// 桶/海绵族 12 件 1:1（Player.ItemCheck_UseBuckets，Player.cs:45704-45890）。
// 决策表走 Game.bucketUse 纯函数;舀取回吸走 Game.bucketScoopDrain(真 TileStore)。
// 编码注记:原版 LiquidID.cs:5-11 = 水0/岩浆1/蜜2/微光3,本仓 +1(0≡水)。
const W = LIQUID_TYPE.WATER, L = LIQUID_TYPE.LAVA, H = LIQUID_TYPE.HONEY, S = LIQUID_TYPE.SHIMMER;

const none = { kind: 'none', useTime: 0 } as const;
const use = (vid: number, liquid: number, t: number, sum3x3 = 255, solid = false) =>
  Game.bucketUse(vid, liquid, t, sum3x3, solid);

describe('舀取支入口（:45719）+ 换桶链（:45738-45759）', () => {
  it('205 空桶：水/岩浆/蜜可舀并换对应满桶（:45740-45757）', () => {
    expect(use(205, 255, W)).toEqual({ kind: 'scoop', swapTo: 206, useTime: 10 });
    expect(use(205, 255, L)).toEqual({ kind: 'scoop', swapTo: 207, useTime: 10 });
    expect(use(205, 255, H)).toEqual({ kind: 'scoop', swapTo: 1128, useTime: 10 });
  });

  it('205 空桶：微光不可舀（:45719 条件 !shimmer() 不满足→落倾倒支,205 无倾倒档→none）', () => {
    expect(use(205, 255, S)).toEqual(none);
  });

  it('205 合计门（:45733）：3×3 同类合计 ≤100 的浅洼舀不起', () => {
    expect(use(205, 100, W, 100)).toEqual(none);
    expect(use(205, 100, W, 101)).toEqual({ kind: 'scoop', swapTo: 206, useTime: 10 });
  });

  it('205 无液体拒绝（:45733 首项）', () => {
    expect(use(205, 0, W, 0)).toEqual(none);
  });
});

describe('海绵族：吸液不消耗、无饱和变体（:45719/:45733/:45738）', () => {
  it('3032 超吸海绵：水/微光可吸（:45719 liquidType==0 || shimmer）,岩浆蜜不可', () => {
    expect(use(3032, 255, W)).toEqual({ kind: 'scoop', useTime: 5 });
    expect(use(3032, 255, S)).toEqual({ kind: 'scoop', useTime: 5 });
    expect(use(3032, 255, L)).toEqual(none);
    expect(use(3032, 255, H)).toEqual(none);
  });

  it('4872 岩浆海绵：仅岩浆（:45719 lava()）', () => {
    expect(use(4872, 255, L)).toEqual({ kind: 'scoop', useTime: 5 });
    expect(use(4872, 255, W)).toEqual(none);
    expect(use(4872, 255, S)).toEqual(none);
  });

  it('5303 蜂蜜海绵：仅蜂蜜（:45719 honey()）', () => {
    expect(use(5303, 255, H)).toEqual({ kind: 'scoop', useTime: 5 });
    expect(use(5303, 255, W)).toEqual(none);
  });

  it('5304 终极海绵：任意液体（:45719 末项恒真）,useTime=3（Item.cs:42056-42066）', () => {
    for (const t of [W, L, H, S]) {
      expect(use(5304, 255, t)).toEqual({ kind: 'scoop', useTime: 3 });
    }
  });

  it('海绵豁免合计门（:45733：≤100 仅拦非海绵）', () => {
    for (const vid of [3032, 4872, 5303, 5304]) {
      const r = use(vid, 60, vid === 4872 ? L : vid === 5303 ? H : W, 60);
      expect(r.kind).toBe('scoop');
      expect(r.swapTo).toBeUndefined();       // 消耗块 :45738 显式排除海绵族
    }
    expect(use(3032, 0, W, 0)).toEqual(none); // 但无液体仍拒绝
  });
});

describe('倾倒支（:45811-45888）', () => {
  it('满桶族倾 255 并回空桶（:45827/:45847/:45867）', () => {
    expect(use(206, 0, W)).toEqual({ kind: 'pour', liquidType: W, swapTo: 205, useTime: 10 });
    expect(use(207, 0, L)).toEqual({ kind: 'pour', liquidType: L, swapTo: 205, useTime: 10 });
    expect(use(1128, 0, H)).toEqual({ kind: 'pour', liquidType: H, swapTo: 205, useTime: 10 });
  });

  it('无底桶族恒量倾倒不消耗（:45825/:45845/:45865/:45877-45888）', () => {
    expect(use(3031, 0, W)).toEqual({ kind: 'pour', liquidType: W, useTime: 5 });
    expect(use(4820, 0, L)).toEqual({ kind: 'pour', liquidType: L, useTime: 5 });
    expect(use(5302, 0, H)).toEqual({ kind: 'pour', liquidType: H, useTime: 5 });
    expect(use(5364, 0, S)).toEqual({ kind: 'pour', liquidType: S, useTime: 5 });
  });

  it('门（:45813）：液体 ≥200 或实心块（546 除外）拒绝——空格或同类半格才倒', () => {
    expect(use(3031, 200, W)).toEqual(none);
    expect(use(4820, 255, L)).toEqual(none);
    expect(use(5364, 0, S, 255, true)).toEqual(none);        // 实心块拒绝
    // 同类半格（<200）可补满（:45819/:45839/:45859/:45877 的 liquidType()==X 分支）
    expect(use(206, 100, W)).toEqual({ kind: 'pour', liquidType: W, swapTo: 205, useTime: 10 });
    expect(use(5302, 100, H)).toEqual({ kind: 'pour', liquidType: H, useTime: 5 });
  });

  it('异类液体拒绝（:45819/:45839/:45859/:45877 须 liquid==0 || 同类）', () => {
    expect(use(206, 100, L)).toEqual(none);      // 水桶不倒进岩浆
    expect(use(3031, 100, L)).toEqual(none);     // 无底水桶同样不可覆盖异类
    expect(use(4820, 100, W)).toEqual(none);     // 无底岩浆桶不倒进水
    expect(use(5364, 100, W)).toEqual(none);     // 微光桶不倒进水
  });

  it('海绵族不进倾倒支（:45719 条件外的族在倾倒支无档→none）', () => {
    for (const vid of [3032, 4872, 5303, 5304]) {
      expect(use(vid, 0, W)).toEqual(none);
    }
  });
});

describe('ApplyItemTime（useTime 取 Item.cs SetDefaults）', () => {
  it('205/206/207/1128 = 10,无底桶/海绵 = 5,5304 = 3（:3940/:28047/:39442/:42056）', () => {
    for (const vid of [205, 206, 207, 1128]) expect(itemCombat(vid)?.useTime).toBe(10);
    for (const vid of [3031, 3032, 4820, 4872, 5302, 5303, 5364]) {
      expect(itemCombat(vid)?.useTime).toBe(5);
    }
    expect(itemCombat(5304)?.useTime).toBe(3);
  });
});

describe('舀取回吸（Game.bucketScoopDrain，:45762-45809）', () => {
  const mk = () => {
    const world = new World(24, 24, 7, 'open');
    return world.store;
  };
  it('目标不足 255：从 3×3 同类邻居补足,异类不动（:45779-45809）', () => {
    const st = mk();
    const x = 12, y = 12;
    st.setLiquid(x, y, 100, W);
    st.setLiquid(x - 1, y, 200, W);
    st.setLiquid(x + 1, y, 200, L);      // 异类不吸
    st.setLiquid(x, y - 1, 200, W);
    const got = Game.bucketScoopDrain(st, x, y, W);
    expect(got).toBe(255);               // 100 + 155(左) = 255,上方余量留下
    expect(st.liquid[st.idx(x, y)]).toBe(0);
    expect(st.liquid[st.idx(x - 1, y)]).toBe(45);
    expect(st.liquid[st.idx(x, y - 1)]).toBe(200);  // 已满 255 后余格不动
    expect(st.liquid[st.idx(x + 1, y)]).toBe(200);  // 岩浆原样
  });

  it('目标已满 255：直接舀走,不回吸（:45775 提前返回）', () => {
    const st = mk();
    const x = 12, y = 12;
    st.setLiquid(x, y, 255, H);
    st.setLiquid(x - 1, y, 255, H);
    expect(Game.bucketScoopDrain(st, x, y, H)).toBe(255);
    expect(st.liquid[st.idx(x - 1, y)]).toBe(255);   // 邻居未被动
  });

  it('海绵同体：只吸到 255 为止（非清空 3×3,与空桶共用 :45762-45809）', () => {
    const st = mk();
    const x = 12, y = 12;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) st.setLiquid(x + ox, y + oy, 255, W);
    Game.bucketScoopDrain(st, x, y, W);
    expect(st.liquid[st.idx(x, y)]).toBe(0);
    expect(st.liquid[st.idx(x - 1, y - 1)]).toBe(255); // 目标已满→:45775 提前返回,邻域全留
  });
});

describe('六件物品登记（docs/implementation-gap-list-2026-08-13.md §1）', () => {
  it('vi_ 键齐全且 viIdFromKey 反解回原版 id', () => {
    const ids: Record<string, number> = {
      vi_4820_bottomless_lava_bucket: 4820,
      vi_4872_lava_absorbant_sponge: 4872,
      vi_5302_bottomless_honey_bucket: 5302,
      vi_5303_honey_absorbant_sponge: 5303,
      vi_5304_ultra_absorbant_sponge: 5304,
      vi_5364_bottomless_shimmer_bucket: 5364,
    };
    for (const [key, vid] of Object.entries(ids)) {
      const m = /^vi_(\d+)_/.exec(key);
      expect(m ? Number(m[1]) : -1).toBe(vid);
      // 空格(liquid=0)+ 非实心:无底桶族应倾倒,海绵族不进倾倒支
      expect(Game.bucketUse(vid, 0, vid === 5364 ? S : vid === 4820 ? L : vid === 5302 ? H : W, 0, false).kind)
        .toBe(vid === 4872 || vid === 5303 || vid === 5304 ? 'none' : 'pour');
    }
  });
});
