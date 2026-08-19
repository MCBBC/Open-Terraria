// equipStats 记忆化六路锁(2026-08-19):内容键必须覆盖 computeEquipStats 的全部
// 可变输入——将来给 getter 加新输入而不进 equipStatsKey,这里会当场红。
// 锁的六路 = 审计定的输入清单:换装/buff/Wet/panic 窗口/恶魔心/软糖虫(+缓存身份与冻结)。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory, ACC_ARMOR_START } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { BuffType } from '../src/stats/Buffs';

function mk(): Player {
  return new Player(60 * 16, 90 * 16, new Inventory());
}
const helm = () => ITEM_BY_KEY['vi_89_CopperHelmet']!;   // vi_ 键空间(本地键表不含)

describe('equipStats 记忆化(内容键六路锁)', () => {
  it('同输入 → 同一对象引用(缓存命中);输入变 → 新引用', () => {
    const p = mk();
    const a = p.equipStats;
    const b = p.equipStats;
    expect(b).toBe(a);                       // 命中
    p.inv.armor[0] = { id: helm(), stack: 1 };
    const c = p.equipStats;
    expect(c).not.toBe(a);                   // 键变 → 重算(数值跟随由 buff/panic 两路覆盖)
  });

  it('buff 加/卸 → 数值跟随(Werewolf jumpSpd +0.2)', () => {
    const p = mk();
    const base = p.equipStats.jumpSpd;
    p.buffs.apply(BuffType.Werewolf, 10);
    expect(p.equipStats.jumpSpd).toBeCloseTo(base + 0.2);
    p.buffs.remove(BuffType.Werewolf);
    expect(p.equipStats.jumpSpd).toBe(base);
  });

  it('Wet buff → immuneVanilla 副作用随重算刷新(含 24/323/67)', () => {
    const p = mk();
    expect(p.buffs.immuneVanilla.size).toBe(0);
    p.buffs.apply(BuffType.Wet, 10);
    p.equipStats;   // 触发重算(副作用在 compute 内)
    expect(p.buffs.immuneVanilla.has(24)).toBe(true);
    expect(p.buffs.immuneVanilla.has(323)).toBe(true);
    p.buffs.remove(BuffType.Wet);
    p.equipStats;   // 键集合变 → 再重算 → 清空(无免疫装备时)
    expect(p.buffs.immuneVanilla.size).toBe(0);
  });

  it('panicTime 受击窗口 → moveMult +1.0(300t 内)', () => {
    const p = mk();
    const calm = p.equipStats.moveMult;
    p.panicTime = 300;
    expect(p.equipStats.moveMult).toBeCloseTo(calm + 1.0);
    p.panicTime = 0;
    expect(p.equipStats.moveMult).toBe(calm);
  });

  it('extraAccessory(恶魔心) → 第 6 饰品位生效', () => {
    const p = mk();
    const bagId = ITEM_BY_KEY['vi_3366_YoyoBag']!;
    p.inv.armor[ACC_ARMOR_START + 5] = { id: bagId, stack: 1 };   // 第 6 位(未开)
    expect(p.equipStats.yoyoBag).toBe(false);                     // 不在扫描界内
    p.inv.extraAccessory = true;
    expect(p.equipStats.yoyoBag).toBe(true);                      // 界扩一位 → 命中
    p.inv.extraAccessory = false;
    expect(p.equipStats.yoyoBag).toBe(false);
  });

  it('usedGummyWorm → fishingSkill +3', () => {
    const p = mk();
    const base = p.equipStats.fishingSkill;
    p.usedGummyWorm = true;
    expect(p.equipStats.fishingSkill).toBe(base + 3);
    p.usedGummyWorm = false;
    expect(p.equipStats.fishingSkill).toBe(base);
  });

  it('counterWeight 掷骰已迁消费端:getter 恒 0 + yoyoBag 旗;决策端可掷', async () => {
    const p = mk();
    p.inv.armor[ACC_ARMOR_START] = { id: ITEM_BY_KEY['vi_3366_YoyoBag']!, stack: 1 };
    const eq = p.equipStats;
    expect(eq.yoyoBag).toBe(true);
    expect(eq.counterWeight).toBe(0);          // 不再在 getter 掷
    const { counterweightDecision, rollYoyoCounterweight } = await import('../src/entities/WeaponProj');
    expect([556, 557, 558, 559, 560, 561, 1079]).toContain(rollYoyoCounterweight());
    // 场上 2 悠悠球(手套分支已满) + 袋 → 掷配重球(1 球时先走 second-yoyo)
    const d = counterweightDecision(eq, [{ isWeight: false, ai0: 0 }, { isWeight: false, ai0: 1 }], 4);
    expect(d.kind).toBe('counterweight');
    if (d.kind === 'counterweight') expect([556, 557, 558, 559, 560, 561, 1079]).toContain(d.type);
  });

  it('返回对象冻结:误写显式 TypeError(硬护栏)', () => {
    const p = mk();
    expect(Object.isFrozen(p.equipStats)).toBe(true);
    expect(Object.isFrozen(p.equipStats.jumpOpts)).toBe(true);
    expect(() => { (p.equipStats as unknown as { def: number }).def = 999; }).toThrow();
  });
});
