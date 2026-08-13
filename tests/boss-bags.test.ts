// 宝藏袋开包引擎测试：19 袋全部可执行、产出合法、关键对账（神庙钥匙恒给等）
import { describe, it, expect } from 'vitest';
import { openBossBag, BOSS_BAG_IDS } from '../src/data/vanillaBossBags';

const W = { masterMode: false, crimson: false, extraAccessory: false, hasItem: () => false };

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
});
