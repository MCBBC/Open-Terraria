// ★D6 守卫(2026-10-13):itemfunc.buffType 双域——string=mod buff 键消费期解析。
//   锚:Game.itemBuffIdOf(四处消费:quickBuff/quickConsume/potion 桥/快捷饮;
//   门=hasItemBuff 双域;注册期解析不可行=applyRegistrationPlan 先于 entry 相位)
import { describe, it, expect, beforeEach } from 'vitest';
import { itemBuffIdOf } from '../src/core/Game';
import { registerModBuff, _resetModBuffsForTests } from '../src/mods/buffs';
import { buffTypeByVanilla } from '../src/stats/Buffs';

beforeEach(() => _resetModBuffsForTests());

describe('D6:func.buffType 双域解析', () => {
  it('string=mod buff 键 → 伪 vanilla id(9000+) → 反查回 BuffType 闭环', () => {
    const bt = registerModBuff('t', 'mybuff', { name: '神力', texture: 'textures/b.png' });
    const bid = itemBuffIdOf('mod_t_potion', 'mybuff');
    expect(bid).toBeGreaterThanOrEqual(9000);
    expect(buffTypeByVanilla(bid)).toBe(bt);   // 伪 id 反查回原 BuffType=消费闭环
  });

  it('全键形态/未注册键=0(不炸使用链);数字域原样透传', () => {
    registerModBuff('t', 'b2', { name: 'x', texture: 'textures/b.png' });
    expect(itemBuffIdOf('mod_t_potion', 'mod_t_b2')).toBeGreaterThanOrEqual(9000);   // 全键亦可达
    expect(itemBuffIdOf('mod_t_potion', 'ghost')).toBe(0);     // 未注册=0=无 buff 语义
    expect(itemBuffIdOf('vi_113_', 20)).toBe(20);              // 原版域数字原样
    expect(itemBuffIdOf('mod_t_potion', 9003)).toBe(9003);     // mod 伪 id 数字原样(反查表直查)
  });
});
