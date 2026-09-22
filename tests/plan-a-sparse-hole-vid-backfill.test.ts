// ★方案 A 阶段 3+4（BJ265,2026-09-22）：稀疏洞守卫验收网 + vid 回填恒等钉。
// 阶段 3：reorder 后 ITEM_DEFS 稀疏（长=maxStable+1、洞~13900）——任何对洞的未守卫
//   访问都是雷（for..of 产 undefined → 成员访问 TypeError）。本文件锁定：
//   ①稀疏形状本相 ②三种迭代形态对洞的 JS 语义 ③守卫消费面冒烟（洞位访问不炸）。
// 阶段 4：items.ts reorder 块 ⑥ vid 回填（vi_ 键 def vid≡自身下标）——键前缀正则
//   反解税（viIdFromKey 267 处/vanillaIdOfItem 107 处）退役的数据面基础。本文件锁定
//   全域逐件恒等 + vanillaIdOfItem 简化体行为抽钉。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { vanillaIdOfItem } from '../src/stats/Shimmer';
import { buildItemSearchPool } from '../src/ui/itemSearch';

/** 首个洞位（ITEM_DEFS[0]=洞,vi_0 不存在——保底已知洞） */
function firstHoleIndex(): number {
  if (ITEM_DEFS[0] === undefined) return 0;
  for (let i = 0; i < ITEM_DEFS.length; i++) if (!ITEM_DEFS[i]) return i;
  return -1;
}

describe('方案 A 阶段 3：稀疏洞形状与守卫', () => {
  it('稀疏形状：长度=maxStable+1=20754、实件 6856、洞≈13898、0 号位=洞', () => {
    expect(ITEM_DEFS.length).toBe(20754);
    let real = 0;
    for (const d of ITEM_DEFS) if (d) real++;
    expect(real).toBe(6856);
    expect(ITEM_DEFS.length - real).toBe(20754 - 6856);
    expect(ITEM_DEFS[0]).toBeUndefined();   // 原版 netID 0 语义=空洞（vi_0 不存在）
  });

  it('三种迭代形态对洞的 JS 语义：for..of 产 undefined（雷面）；forEach/Object.entries 跳洞（安全）', () => {
    // for..of：洞以 undefined 形态产出（未守卫成员访问=TypeError 的本体）
    let sawHole = false;
    for (const d of ITEM_DEFS) {
      if (d === undefined) { sawHole = true; break; }
    }
    expect(sawHole).toBe(true);
    // forEach / Object.entries：洞非自身属性 → 回调/条目不产出（守卫循环安全域）
    let calls = 0;
    ITEM_DEFS.forEach(() => { calls++; });
    expect(calls).toBe(6856);
    expect(Object.entries(ITEM_DEFS).length).toBe(6856);
  });

  it('守卫形态冒烟：洞位/越界/-1 下标访问产出 undefined 而非 TypeError（`?.` 与 !d 家族同相）', () => {
    const hole = firstHoleIndex();
    expect(hole).toBeGreaterThanOrEqual(0);
    expect(ITEM_DEFS[hole]?.maxStack ?? 1).toBe(1);
    expect(ITEM_DEFS[hole]?.key ?? '').toBe('');
    expect(ITEM_DEFS[-1]?.key).toBeUndefined();          // -1 哨兵域（heldItem()?.id ?? -1 族）
    expect(ITEM_DEFS[ITEM_DEFS.length + 5]).toBeUndefined();   // 越界域
    expect(ITEM_DEFS[hole]?.vid ?? -1).toBe(-1);         // vid 直读守卫形态（阶段 4 消费面）
  });

  it('守卫消费面冒烟：buildItemSearchPool 对洞跳过不炸（itemSearch.ts !d 循环）', () => {
    const pool = buildItemSearchPool({ nameOf: (k) => k });
    expect(Array.isArray(pool)).toBe(true);
    expect(pool.length).toBeGreaterThan(0);
  });
});

describe('方案 A 阶段 4：vid 回填恒等（反解税退役数据面）', () => {
  it('全域逐件：vi_ 键 def 的 vid===自身下标；非 vi_（place_v）def 的 vid===undefined', () => {
    let vi = 0, pv = 0;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      if (!d) continue;
      if (d.key.startsWith('vi_')) { vi++; expect(d.vid, `${i}:${d.key}`).toBe(i); }
      else { pv++; expect(d.vid, `${i}:${d.key}`).toBeUndefined(); }
    }
    expect(vi).toBe(6178);
    expect(pv).toBe(678);
  });

  it('vanillaIdOfItem 简化体行为钉：vi_ 恒等直读 / place_v=-1 / 未注册与越界=-1', () => {
    expect(vanillaIdOfItem(ITEM_BY_KEY['vi_109_mana_crystal'])).toBe(109);
    expect(vanillaIdOfItem(ITEM_BY_KEY['vi_75_fallen_star'])).toBe(75);
    const pv = ITEM_DEFS.findIndex((d) => d?.key.startsWith('place_v_'));
    expect(pv).toBeGreaterThan(0);
    expect(vanillaIdOfItem(pv)).toBe(-1);
    expect(vanillaIdOfItem(-1)).toBe(-1);
    expect(vanillaIdOfItem(ITEM_DEFS.length + 100)).toBe(-1);
    expect(vanillaIdOfItem(firstHoleIndex())).toBe(-1);   // 洞位=-1（未注册语义）
  });

  it('vid 回填≡旧键前缀反解 抽钉（回退 ⑥ 即红）', () => {
    // 抽样钉值：若回填被摘,vi_ def.vid 回落 undefined → 下方两钉变 -1 红
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_4376_rat_cage']]?.vid).toBe(4376);
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_2_DirtBlock']]?.vid).toBe(2);
  });
});
