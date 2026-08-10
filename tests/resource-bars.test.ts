import { describe, it, expect } from 'vitest';
import { classicLifeLayout } from '../src/render/ResourceBars';

// 数值标杆：Terarria1456 ClassicPlayerResourcesDisplaySet.DrawLife L43-56
describe('经典资源条布局（classicLifeLayout）', () => {
  it('起始 100 上限：5 颗红心，每颗 20', () => {
    const r = classicLifeLayout(100, 100);
    expect(r.hearts).toBe(5);
    expect(r.golden).toBe(0);
    expect(r.lifePerHeart).toBe(20);
  });

  it('400 上限（15 颗水晶之心）：20 颗红心两行，全红', () => {
    const r = classicLifeLayout(400, 400);
    expect(r.hearts).toBe(20);
    expect(r.golden).toBe(0);
    expect(r.lifePerHeart).toBe(20);
  });

  it('420 上限（400+4 颗生命果）：20 颗，golden=4（前 4 颗金）', () => {
    const r = classicLifeLayout(420, 420);
    expect(r.golden).toBe(4);
    expect(r.hearts).toBe(20);
    // golden>0：lifePerHeart = statLifeMax/20 = 21
    expect(r.lifePerHeart).toBe(21);
  });

  it('500 上限（生命果拉满）：20 颗全金（golden=20），每颗 25', () => {
    const r = classicLifeLayout(500, 500);
    expect(r.golden).toBe(20);
    expect(r.hearts).toBe(20);
    expect(r.lifePerHeart).toBe(25);
  });

  it('buff 生命上限增量摊到每颗心（statLifeMax2>statLifeMax）', () => {
    // 100 基础 + 20 buff：num3=20，lifePerHeart = 20 + 20/5 = 24
    const r = classicLifeLayout(100, 120);
    expect(r.lifePerHeart).toBe(24);
    expect(r.hearts).toBe(5); // floor(120/24)
  });
});
