// ★BJ175：equipStats 桩面数值字段 NaN 防御判别力网。
// 背景：BJ171 修 pickSpeedMult ??0 时边界声明——tests/ 124 文件壳测试以
// `equipStats: {}` 桩致动 Player/Game 时，数值型直读字段（无 ?? 防御）理论上
// 全体 NaN 污染（undefined 参 +,-,*,/ ⇒ NaN）。本刀（BJ175）把「算术直读」
// 消费面全量 ??0/??1 防御化（26 站：Game.ts 10 + Player.ts 12 + Bobber/
// WhipProj/ForbiddenSignProj 各 1），本文件 = 桩致动 NaN 场景判别网：
//   ①真 Player + equipStats 置空对象桩 → 全部 stat 基础面恒有限且 = 缺省值
//     （缺省语义钉自 computeEquipStats 初始器：maxTagEffects/tagEffectDuration/
//      whipSpd=1，其余加算池=0）；
//   ②变异靶：删任一 ?? 防御 → 对应断言立即 NaN 爆红（判别力=变异证红，
//     已跑 M1 def/M2 maxMana/M3 critChance 三发全红，详见 BJ175 档案）。
// 不覆盖（登记）：Game.ts manaCost 八站/whipSpd/fishingSkill 与 ForbiddenSign
// critMagic 埋在武器使用/接触管线深处，无 Game 实例测试先例（全仓 0 处
// new Game()）——防御已落，判别力由本网同类站点代表。
import { describe, it, expect } from 'vitest';
import { Player, PlayerEquipStats } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

/** 真 Player + equipStats 空对象桩 = 124 壳测试同款致动面
 *  （equipStats 是 IIII250 仅 getter 记忆化属性——own property 遮蔽注入） */
function stubbedPlayer(): Player {
  const p = new Player(40 * 16, 54 * 16, new Inventory());
  Object.defineProperty(p, 'equipStats', { value: {} as PlayerEquipStats, configurable: true });
  return p;
}

describe('BJ175 equipStats 桩面 NaN 防御判别网', () => {
  it('桩 {} 下 stat 基础 getter 恒有限：def/maxMana/maxMinions/maxSentries = 缺省值', () => {
    const p = stubbedPlayer();
    expect(p.defense).toBe(0);            // 防御 = buffs0 + def??0 + cart0 + 甲面空
    expect(Number.isNaN(p.defense)).toBe(false);
    expect(p.maxMana).toBe(20);           // baseMaxMana20 + mana??0 + buffs0
    expect(p.maxMinions).toBe(1);         // 1 + minionSlots??0 + buffs0
    expect(p.maxSentries).toBe(1);        // 1 + sentrySlots??0 + WarTable 无
  });

  it('桩 {} 下伤害/暴击/攻速面恒有限 = 无装备缺省', () => {
    const p = stubbedPlayer();
    expect(p.damageMult('melee')).toBe(1);
    expect(p.damageMult('ranged')).toBe(1);
    expect(p.damageMult('magic')).toBe(1);
    expect(p.damageMult('summon')).toBe(1);
    expect(p.summonDamageMult).toBe(1);
    expect(p.critChance('melee')).toBe(0);
    expect(p.critChance('ranged')).toBe(0);
    expect(p.critChance('magic')).toBe(0);
    expect(p.attackSpeedMult).toBe(1);    // (1+meleeSpeed??0)×buffs1 → raw=1 → 1/1
    expect(p.rangedDamageMult('arrow')).toBe(1);   // (base/1+arrowStack??0)×1×1×1
    expect(p.rangedDamageMult('bullet')).toBe(1);
    expect(p.rangedDamageMult('rocket')).toBe(1);
    expect(p.rangedDamageMult('other')).toBe(1);
  });

  it('桩 {} 下 aggro/鞭 tag 族恒有限 = 缺省', () => {
    const p = stubbedPlayer();
    expect(p.aggro).toBe(0);              // 潜行装 else 链 0 + aggroAcc/aggroPiece??0
    expect(p.maxTagEffects).toBe(1);      // ?? 1（:1187 默认 1）
    expect(p.tagEffectDuration).toBe(1);  // ?? 1（:1189 默认 1f）
  });

  it('真 computeEquipStats 面回归：新 Player 缺省 equipStats 与桩面同值（防御不歪真档）', () => {
    const p = new Player(40 * 16, 54 * 16, new Inventory());
    expect(p.defense).toBe(stubbedPlayer().defense);
    expect(p.maxMana).toBe(stubbedPlayer().maxMana);
    expect(p.maxMinions).toBe(stubbedPlayer().maxMinions);
    expect(p.maxSentries).toBe(stubbedPlayer().maxSentries);
    expect(p.damageMult('magic')).toBe(stubbedPlayer().damageMult('magic'));
    expect(p.critChance('magic')).toBe(stubbedPlayer().critChance('magic'));
    expect(p.maxTagEffects).toBe(1);
    expect(p.tagEffectDuration).toBe(1);
  });
});
