// R1 数值批 Buff 回归：13 种新 Buff 的数值生效链（对 1456 Player.cs UpdateBuffs）
import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { BuffType } from '../src/stats/Buffs';

const mk = () => new Player(0, 0, new Inventory());

describe('R1 药水 Buff 数值', () => {
  it('生命力 113：maxHp +20%（baseMaxHp 100 → +20；400 → +80）', () => {
    const p = mk();
    expect(p.maxHp).toBe(100);
    p.buffs.apply(BuffType.Lifeforce, 300);
    expect(p.maxHp).toBe(120);
    p.baseMaxHp = 400;
    expect(p.maxHp).toBe(480); // floor(400/5/20)*20 = 80
  });
  it('耐久 114：受伤 ×0.9', () => {
    const p = mk();
    p.hp = 100; p.iframes = 0;
    p.buffs.apply(BuffType.Endurance, 300);
    p.damage(100, 0, 0, false);
    expect(p.hp).toBe(10); // (100-0)*0.9=90
  });
  it('怒气 117/暴怒 115：伤害 +10%/暴击 +10', () => {
    const p = mk();
    p.buffs.apply(BuffType.Rage, 240);
    expect(p.damageMult('melee')).toBeCloseTo(1.1, 5);
    p.buffs.apply(BuffType.Wrath, 240);
    expect(p.critChance('ranged')).toBe(10);
  });
  it('醉酒 25：近战伤 +10%/暴击 +2/速 ×1.1/防御 -4', () => {
    const p = mk();
    p.buffs.apply(BuffType.Tipsy, 300);
    expect(p.damageMult('melee')).toBeCloseTo(1.1, 5);
    expect(p.damageMult('ranged')).toBe(1);
    expect(p.critChance('melee')).toBe(2);
    // attackSpeedMult = CapAttackSpeeds 倒数档（Player.cs:28555-28574）：meleeSpeed 总和
    // 1.1 封顶 3 后取倒数 = 1/1.1（时长乘数，越小越快）
    expect(p.attackSpeedMult).toBeCloseTo(1 / 1.1, 5);
    expect(p.defense).toBe(-4);
  });
  it('拾心 105：红心拾取范围 +60；挖矿 104/建筑工 107 判定位', () => {
    const p = mk();
    expect(p.heartGrabBonus).toBe(0);
    p.buffs.apply(BuffType.Heartreach, 180);
    expect(p.heartGrabBonus).toBe(60);
  });
  it('刷怪系数（VanillaSpawner.getSpawnRate 尾段）：镇静 ×1.65/×0.6、战斗 ×0.5/×2', async () => {
    const { VanillaSpawner } = await import('../src/world/spawn/VanillaSpawner');
    const { World } = await import('../src/world/World');
    const w = new World(200, 200, 42, 'r1');
    const sp = new VanillaSpawner(w);
    const base = sp.getSpawnRate(10 * 16, 0, false, 600);
    const calm = sp.getSpawnRate(10 * 16, 0, false, 600, 10 * 16, false, false, true, false);
    const battle = sp.getSpawnRate(10 * 16, 0, false, 600, 10 * 16, false, false, false, true);
    expect(calm.spawnRate).toBe(Math.floor(base.spawnRate * 1.65));
    expect(calm.maxSpawns).toBe(Math.floor(base.maxSpawns * 0.6));
    expect(battle.spawnRate).toBe(Math.floor(base.spawnRate * 0.5));
    // 原版钳制上限 ≤15（L655-662 同样作用于战斗药水加成后）
    expect(battle.maxSpawns).toBe(Math.min(15, Math.floor(base.maxSpawns * 2)));
  });
});
