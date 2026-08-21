// 宝藏袋开包引擎测试：19 袋全部可执行、产出合法、关键对账（神庙钥匙恒给等）
// + 2026-08-18 分布对账批：sw 掷面按臂数/猪鲨 case5 remix 分裂/去重池恰 2/
//   EoW·BoC 矿量区间/devArmor 全局 21 组套装
import { describe, it, expect } from 'vitest';
import { openBossBag, BOSS_BAG_IDS, DEV_ARMOR_SETS } from '../src/data/vanillaBossBags';

const W = { masterMode: false, crimson: false, extraAccessory: false, hasItem: () => false };
const WM = { ...W, masterMode: true };

describe('宝藏袋开包引擎（Player.OpenBossBag :6828）', () => {
  it('19 袋全部注册', () => {
    expect(BOSS_BAG_IDS.size).toBe(19);
    expect(BOSS_BAG_IDS.has(3328)).toBe(true);
    expect(BOSS_BAG_IDS.has(5111)).toBe(true);
  });

  it('每袋 50 次开包:不炸、产出非空、id 合法', () => {
    for (const vid of BOSS_BAG_IDS) {
      let total = 0;
      for (let k = 0; k < 50; k++) {
        openBossBag(vid, (id, n) => {
          expect(id).toBeGreaterThan(0);
          expect(n === undefined || n > 0).toBe(true);
          total++;
        }, W);
      }
      expect(total, `袋 ${vid} 应有产出`).toBeGreaterThan(0);
    }
  });

  it('3328 世花袋对账:神庙钥匙 1141 恒给、武器八选一必出一件', () => {
    let key1141 = 0, weapons = 0;
    const W8 = new Set([758, 1255, 788, 1178, 1259, 1155, 3018, 5477]);
    for (let k = 0; k < 200; k++) {
      openBossBag(3328, (id) => {
        if (id === 1141) key1141++;
        if (W8.has(id)) weapons++;
      }, W);
    }
    expect(key1141).toBe(200);   // 恒给
    expect(weapons).toBe(200);   // 八选一必出
  });

  it('3332 月总袋:十选二不放回（每次恰 2 件武器）', () => {
    const LIST = new Set([3063, 3389, 3065, 1553, 3930, 3541, 3570, 3571, 3569, 5480]);
    for (let k = 0; k < 100; k++) {
      const got = new Set<number>();
      openBossBag(3332, (id) => { if (LIST.has(id)) got.add(id); }, W);
      expect(got.size).toBe(2);   // 不放回 → 两件不同
    }
  });

  it('尾段钱币:经典档也附赠（boss value>0 拆面额）', () => {
    let coins = 0;
    for (let k = 0; k < 20; k++) {
      openBossBag(3328, (id) => { if (id >= 71 && id <= 74) coins++; }, W);
    }
    expect(coins).toBeGreaterThan(0);
  });

  // ---- 2026-08-18 分布对账批（Player.OpenBossBag 逐 case 数值核） ----

  /** N 臂 switch 断言：每次开包恰出 1 件、武器互斥、频率 = 1/N ±5% */
  const oneOfN = (vid: number, weapons: number[], samples = 4000) => {
    const cnt = new Map<number, number>(weapons.map((w) => [w, 0]));
    for (let k = 0; k < samples; k++) {
      const hits: number[] = [];
      openBossBag(vid, (id) => {
        if (weapons.includes(id)) { cnt.set(id, cnt.get(id)! + 1); hits.push(id); }
      }, W);
      expect(hits.length, `袋 ${vid} 应恰出 1 件武器`).toBe(1);
    }
    for (const w of weapons) {
      expect(Math.abs(cnt.get(w)! / samples - 1 / weapons.length),
        `袋 ${vid} 武器 ${w} 频率应 ${1 / weapons.length}`).toBeLessThan(0.05);
    }
    return cnt;
  };

  it('3323 蜂王袋:Next(3) 三武器各 33.3%、互斥不共现', () => {
    oneOfN(3323, [1281, 1273, 1313]);
  });

  it('3324 WoF 袋:徽章 Next(4) 四选一必出、各 25%', () => {
    oneOfN(3324, [514, 426, 434, 4912]);
  });

  it('3329 石巨人袋:Next(7) 七臂恰一件（1296/1297 互斥不共现）', () => {
    oneOfN(3329, [1258, 1122, 899, 1248, 1295, 1296, 1297]);
  });

  it('3860 史后袋:Next(4) 四武器各 25%', () => {
    oneOfN(3860, [3859, 3827, 3870, 3858]);
  });

  it('4782 光女袋:Next(4) 四武器各 25%', () => {
    oneOfN(4782, [4923, 4952, 4953, 4914]);
  });

  it('5111 鹿角怪袋:Next(4) 四武器各 25%', () => {
    oneOfN(5111, [5117, 5118, 5119, 5095]);
  });

  it('3330 猪鲨袋:case6 非 remix 落 2623（1/7,1457 插 Kraken case5）、157 限 remix、与 2609 的 1/10 独立', () => {
    let staff = 0, seal = 0, both = 0, sword = 0, kraken = 0;
    for (let k = 0; k < 4000; k++) {
      let s = false, f = false;
      openBossBag(3330, (id) => {
        if (id === 2623) { s = true; staff++; }
        if (id === 157) { f = true; seal++; }
        if (id === 2609) sword++;
        if (id === 3291) kraken++;
      }, W);
      if (s && f) both++;
    }
    expect(both, '2623 与 157 必须互斥（同 branch6 的 remix 分裂）').toBe(0);
    expect(seal, '非 remix 世界 157 不掉').toBe(0);
    // 1457: Next(6)→Next(7),case5 插 Kraken(3291),remix?157:2623 顺移 case6（:7579-7588）
    expect(Math.abs(staff / 4000 - 1 / 7), '2623 应 1/7（1457 七臂池）').toBeLessThan(0.04);
    expect(Math.abs(kraken / 4000 - 1 / 7), '3291 Kraken 应 1/7（1457 新增）').toBeLessThan(0.04);
    expect(Math.abs(sword / 4000 - 0.1), '2609 独立 1/10').toBeLessThan(0.05);
  });

  it('1457 新掉落:3329 石巨人袋 1/6 MobiusStrip(6158)（:7516-7518,与 2110 的 1/7 独立）', () => {
    let mobius = 0, pet = 0;
    for (let k = 0; k < 6000; k++) {
      openBossBag(3329, (id) => {
        if (id === 6158) mobius++;
        if (id === 2110) pet++;
      }, W);
    }
    expect(Math.abs(mobius / 6000 - 1 / 6), '6158 应 1/6（1457 新增）').toBeLessThan(0.04);
    expect(Math.abs(pet / 6000 - 1 / 7), '2110 保持 1/7').toBeLessThan(0.04);
  });

  it('3318 史王袋/4957 史后袋:num8·num9 两掷恰 2 件且不重复', () => {
    for (const [vid, lo, hi] of [[3318, 256, 258], [4957, 4982, 4984]] as const) {
      for (let k = 0; k < 300; k++) {
        const got = new Set<number>();
        openBossBag(vid, (id) => { if (id >= lo && id <= hi) got.add(id); }, W);
        expect(got.size, `袋 ${vid} 去重池应恰 2 件`).toBe(2);
      }
    }
  });

  it('3320 EoW 袋:魔矿/暗影鳞恒掉 + master·else 两档数量区间（:6890-6912）', () => {
    for (const [world, ore, scale] of [
      [W, [80, 110], [20, 40]], [WM, [110, 135], [30, 50]],
    ] as const) {
      for (let k = 0; k < 200; k++) {
        let n56 = 0, n86 = 0;
        openBossBag(3320, (id, n) => {
          if (id === 56) { n56++; expect(n!).toBeGreaterThanOrEqual(ore[0]); expect(n!).toBeLessThanOrEqual(ore[1]); }
          if (id === 86) { n86++; expect(n!).toBeGreaterThanOrEqual(scale[0]); expect(n!).toBeLessThanOrEqual(scale[1]); }
        }, world);
        expect(n56, '魔矿必恰 1 摞').toBe(1);
        expect(n86, '暗影鳞必恰 1 摞').toBe(1);
      }
    }
  });

  it('3321 BoC 袋:猩红矿/猩红器官恒掉 + master·else 两档数量区间（:6924-6945）', () => {
    for (const [world, ore, scale] of [
      [W, [80, 110], [20, 40]], [WM, [110, 135], [30, 50]],
    ] as const) {
      for (let k = 0; k < 200; k++) {
        let n880 = 0, n1329 = 0;
        openBossBag(3321, (id, n) => {
          if (id === 880) { n880++; expect(n!).toBeGreaterThanOrEqual(ore[0]); expect(n!).toBeLessThanOrEqual(ore[1]); }
          if (id === 1329) { n1329++; expect(n!).toBeGreaterThanOrEqual(scale[0]); expect(n!).toBeLessThanOrEqual(scale[1]); }
        }, world);
        expect(n880, '猩红矿必恰 1 摞').toBe(1);
        expect(n1329, '猩红器官必恰 1 摞').toBe(1);
      }
    }
  });

  it('3319 EoC 袋:三连 Next(21)+10 矿 30-90 / Next(3)+1 1-3 / Next(31)+20 20-50（:6877-6886）', () => {
    for (let k = 0; k < 300; k++) {
      let n56 = 0, n59 = 0, n47 = 0;
      openBossBag(3319, (id, n) => {
        if (id === 56) { n56++; expect(n!).toBeGreaterThanOrEqual(30); expect(n!).toBeLessThanOrEqual(90); }
        if (id === 59) { n59++; expect(n!).toBeGreaterThanOrEqual(1); expect(n!).toBeLessThanOrEqual(3); }
        if (id === 47) { n47++; expect(n!).toBeGreaterThanOrEqual(20); expect(n!).toBeLessThanOrEqual(50); }
      }, W);
      expect(n56).toBe(1);
      expect(n59).toBe(1);
      expect(n47).toBe(1);
    }
  });

  it('devArmor:1/16 全局 21 组套装整组下发（TryGettingDevArmor :7524-7665）', () => {
    const ALL = new Set(DEV_ARMOR_SETS.flat().map(([id]) => id));
    expect(ALL.size).toBeGreaterThan(80); // 21 组并集规模
    const seenSets = new Set<number>();
    let hits = 0;
    for (let k = 0; k < 4000; k++) {
      const devItems: number[] = [];
      openBossBag(3328, (id) => { if (ALL.has(id)) devItems.push(id); }, W);
      if (devItems.length) {
        hits++;
        // 整组:命中物品必构成某一套装
        const setIdx = DEV_ARMOR_SETS.findIndex((s) => devItems.every((d) => s.some(([id]) => id === d)));
        expect(setIdx, 'dev 掉落必须是 21 组之一的整组').toBeGreaterThanOrEqual(0);
        expect(devItems.length).toBe(DEV_ARMOR_SETS[setIdx].length);
        seenSets.add(setIdx);
      }
    }
    expect(Math.abs(hits / 4000 - 1 / 16), '1/16 门（曾未实装）').toBeLessThan(0.02);
    expect(seenSets.size, '21 组都应有机会出现').toBeGreaterThanOrEqual(15);
  });
});
