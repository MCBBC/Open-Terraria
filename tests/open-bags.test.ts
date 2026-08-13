// 礼袋/礼盒右键开包引擎对账（src/data/vanillaOpenBags.ts ← Player.cs
// OpenPresent :6651-6770 / OpenLegacyPresent :6772-6788 / OpenGoodieBag :9199-9282 /
// OpenHerbBag :9064-9138）。脚本化 BagRand 逐支断言（脚本值直接作为 Next 返回值），
// 另跑大样本分布抽查兜底（防分支序错位）。
import { describe, it, expect } from 'vitest';
import { OPENABLE_BAG_VIDS, openBagItem, type BagRand } from '../src/data/vanillaOpenBags';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

/** 定序源：队列耗尽后回 0（= 全部命中首个 ==0 门，测试不会静默漂移） */
function seq(vals: number[]): BagRand {
  return { next: () => vals.shift() ?? 0 };
}

/** 收集 give 出口为 [id, stack] 列表 */
function run(vid: number, rnd: BagRand, hardMode = false): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const ok = openBagItem(vid, (id, n) => out.push([id, n ?? 1]), { hardMode }, rnd);
  expect(ok).toBe(true);
  return out;
}

describe('OPENABLE_BAG_VIDS（ItemID.cs:1211）', () => {
  it('含本引擎六件 + 宝藏袋/钓鱼箱族，不含普通物品', () => {
    for (const v of [1869, 1774, 3093, 599, 600, 601, 3328, 5111, 3979, 3085, 4879]) {
      expect(OPENABLE_BAG_VIDS.has(v)).toBe(true);
    }
    for (const v of [2, 9, 28, 43, 602, 3384]) expect(OPENABLE_BAG_VIDS.has(v)).toBe(false);
  });
});

describe('openBagItem 分派（TryOpenContainer_GrantItems :1662-1721 子集）', () => {
  it('非本引擎物品返回 false（宝藏袋走 Game 持用链）', () => {
    expect(openBagItem(3328, () => {}, { hardMode: true })).toBe(false);
    expect(openBagItem(2, () => {}, { hardMode: true })).toBe(false);
  });
});

describe('OpenPresent 1869（:6651-6770 十九支）', () => {
  it('首支 1/15 + 硬模式门 → Snow Globe 602（:6654）', () => {
    expect(run(1869, seq([0]), true)).toEqual([[602, 1]]);
  });
  it('硬模式前掷中 15 门 → 顺延到 1/30 煤块支（:6658）', () => {
    expect(run(1869, seq([0, 0]), false)).toEqual([[1922, 1]]);
  });
  it('1/400 狗哨（:6662）', () => {
    expect(run(1869, seq([1, 1, 0]), true)).toEqual([[1927, 1]]);
  });
  it('1/150 Red Ryder + 火枪弹 30-60（:6666-6669）', () => {
    expect(run(1869, seq([1, 1, 1, 0, 45]), true)).toEqual([[1870, 1], [97, 45]]);
  });
  it('全门未中 → 兜底建材 1872/586/591 ×20-49（:6755-6769）', () => {
    // 16 道前置门（15/30/400 + 6×150 + 300/40/10/15/7/8/9）全 miss(1)，
    // switch(3)=0 → Pine Tree Block，栈掷 30
    const misses = Array<number>(16).fill(1);
    expect(run(1869, seq([...misses, 0, 30]), true)).toEqual([[1872, 30]]);
    expect(run(1869, seq([...misses, 1, 49]), true)).toEqual([[586, 49]]);
    expect(run(1869, seq([...misses, 2, 20]), true)).toEqual([[591, 20]]);
  });
  it('1/15 圣诞套装 switch(Next(5)) 三件套成组（:6703-6728）', () => {
    const misses = Array<number>(12).fill(1); // 15/30/400 + 6×150 + 300/40/10 共 12 前置门
    expect(run(1869, seq([...misses, 0, 0]), true)).toEqual([[1932, 1], [1933, 1], [1934, 1]]);
    expect(run(1869, seq([...misses, 0, 3]), true)).toEqual([[1938, 1]]);
  });
  it('分布抽查：兜底建材约占 47%（十六门连 miss 之积≈0.470），稀有支可命中', () => {
    const seen = new Map<number, number>();
    const real: BagRand = {
      next: (a, b) => (b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a))),
    };
    for (let k = 0; k < 4000; k++) {
      for (const [id] of run(1869, real, true)) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    const fallback = (seen.get(1872) ?? 0) + (seen.get(586) ?? 0) + (seen.get(591) ?? 0);
    // 理论 P(兜底) = (14/15)(29/30)(399/400)(149/150)^6(299/300)(39/40)(9/10)
    //                (14/15)(6/7)(7/8)(8/9) ≈ 0.4704 → 4000 开 ≈ 1882
    expect(fallback).toBeGreaterThan(1600);
    expect(fallback).toBeLessThan(2200);
    expect(seen.has(1922)).toBe(true);   // Coal 1/30
    expect(seen.has(1908)).toBe(true);   // Holly 1/10
    expect(seen.has(1907)).toBe(true);   // Reindeer Antlers 1/40
    expect(seen.has(1927)).toBe(true);   // Dog Whistle 1/400
  });
});

describe('OpenLegacyPresent 599/600/601（:6772-6788）', () => {
  it('单掷 Next(14)：0+硬模式 → 602；1-7 → 586；8-13 → 591', () => {
    expect(run(599, seq([0]), true)).toEqual([[602, 1]]);
    expect(run(599, seq([0, 33]), false)).toEqual([[586, 33]]);
    expect(run(599, seq([7, 20]), true)).toEqual([[586, 20]]);
    expect(run(600, seq([8, 49]), true)).toEqual([[591, 49]]);
    expect(run(601, seq([13, 20]), true)).toEqual([[591, 20]]);
  });
});

describe('OpenGoodieBag 1774（:9199-9282）', () => {
  it('1/150 Unlucky Yarn early return（:9202-9205）', () => {
    expect(run(1774, seq([0]))).toEqual([[1810, 1]]);
  });
  it('1/150 Bat Hook（:9207-9210）', () => {
    expect(run(1774, seq([1, 0]))).toEqual([[1800, 1]]);
  });
  it('1/4 Rotten Egg ×10-40（:9212-9215）', () => {
    expect(run(1774, seq([1, 1, 0, 25]))).toEqual([[1809, 25]]);
  });
  it('1/10 挂画 Next(1846,1851) 闭开（:9217-9220）', () => {
    expect(run(1774, seq([1, 1, 1, 0, 1848]))).toEqual([[1848, 1]]);
    expect(run(1774, seq([1, 1, 1, 0, 1850]))).toEqual([[1850, 1]]);
  });
  it('switch(Next(19)) 套装逐支（:9222-9281）', () => {
    const miss = [1, 1, 1, 1];
    expect(run(1774, seq([...miss, 0]))).toEqual([[1749, 1], [1750, 1], [1751, 1]]);   // Cat
    expect(run(1774, seq([...miss, 15]))).toEqual([[1824, 1]]);                          // Cat Ears
    expect(run(1774, seq([...miss, 18]))).toEqual([[1851, 1], [1852, 1]]);               // Treasure Hunter
  });
});

describe('OpenHerbBag 3093（:9064-9138）', () => {
  it('件数 2-4（1/3 +1）+ 七草七籽映射 + 栈 2-4（1/3 +1-4）', () => {
    // 件数=3（1/3 掷 1 不加成）；三件各：id 掷 → 映射、栈掷、1/3 掷 1 不加成
    expect(run(3093, seq([3, 1, 0, 3, 1, 13, 2, 1, 6, 4, 1])))
      .toEqual([[313, 3], [2357, 2], [2358, 4]]);
  });
  it('317≠316 顺序对调核对（:9079-9094 Waterleaf 在 Deathweed 前）', () => {
    // id 掷 3 → 317（Waterleaf）、掷 4 → 316（Deathweed）——源码顺序对调，勿"顺手"排升序
    expect(run(3093, seq([3, 1, 3, 2, 1, 4, 3, 1, 0, 2, 1])))
      .toEqual([[317, 2], [316, 3], [313, 2]]);
  });
  it('分布抽查：全部产出落在七草七籽十四支内', () => {
    const ok = new Set([313, 314, 315, 316, 317, 318, 2358, 307, 308, 309, 310, 311, 312, 2357]);
    const counts = new Map<number, number>();
    for (let k = 0; k < 300; k++) {
      for (const [id, n] of run(3093, { next: (a, b) => (b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a))) })) {
        expect(ok.has(id)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(2);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(14);   // 十四支全覆盖
  });
});

describe('产出 id 注册完整性', () => {
  it('三袋全产出 id 均在本仓物品注册表（防 vanilla.json 缺条目静默吞掉）', () => {
    for (const vid of [1869, 1774, 3093, 599, 600, 601]) {
      for (let k = 0; k < 600; k++) {
        for (const [id] of run(vid, { next: (a, b) => (b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a))) }, true)) {
          expect(VANILLA_ITEM_KEY_BY_ID[id], `vid ${vid} 产出 ${id} 未注册`).toBeDefined();
        }
      }
    }
  });
});
