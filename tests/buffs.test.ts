// Buff 系统测试（1.4.5.6 语义）：
// 1) AddBuff max 合并（Player.cs:5138 TryUpdatingExistingBuffTime：续期不缩短）
// 2) Honey(48)：1 HP/s、浸入续期恒 30s、离开倒计时
// 3) Regeneration(2)：2 HP/s（lifeRegen+4）
// 4) Ironskin(5)：防御 +8（1456/1457 同值）
// 5) 到期自动移除
import { describe, it, expect } from 'vitest';
import { BuffState, BuffType, BUFF_DEFS, buffTypeByVanilla, wetFromBubbleContact } from '../src/stats/Buffs';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Enemy } from '../src/entities/Enemy';
import { Inventory } from '../src/items/Inventory';

describe('Buff 框架（AddBuff 语义）', () => {
  it('apply 取 max：续期不缩短、短时长不覆盖长时长', () => {
    const b = new BuffState();
    b.apply(BuffType.Honey, 30);
    b.apply(BuffType.Honey, 10);          // 短不覆盖长
    expect(b.active.get(BuffType.Honey)).toBe(30);
    b.apply(BuffType.Honey, 30);          // 等值保持
    expect(b.active.get(BuffType.Honey)).toBe(30);
    b.tick(10);                            // 剩 20
    b.apply(BuffType.Honey, 30);          // 浸入续期回满
    expect(b.active.get(BuffType.Honey)).toBe(30);
  });

  it('到期自动移除', () => {
    const b = new BuffState();
    b.apply(BuffType.Regen, 1);
    b.tick(0.9);
    expect(b.has(BuffType.Regen)).toBe(true);
    b.tick(0.2);
    expect(b.has(BuffType.Regen)).toBe(false);
  });
});

describe('蜂蜜 Buff（48）', () => {
  it('浸入语义：1 HP/s 持续回复，30 秒窗口', () => {
    const b = new BuffState();
    b.apply(BuffType.Honey, 30);
    let healed = 0;
    for (let k = 0; k < 600; k++) healed += b.tick(1 / 60);   // 10 秒
    expect(healed).toBe(10);
  });

  it('离蜜后倒计时消退（不再回复）', () => {
    const b = new BuffState();
    b.apply(BuffType.Honey, 30);
    let healed = 0;
    for (let k = 0; k < 30.5 * 60; k++) healed += b.tick(1 / 60);
    expect(healed).toBe(30);          // 30 秒恰好回 30 HP
    expect(b.has(BuffType.Honey)).toBe(false);
    const h2 = b.tick(1);
    expect(h2).toBe(0);
  });
});

describe('数值（1.4.5.6 UpdateBuffs L9640+）', () => {
  it('Regeneration(2)：2 HP/s（lifeRegen+4）', () => {
    const b = new BuffState();
    b.apply(BuffType.Regen, 5);
    let healed = 0;
    for (let k = 0; k < 300; k++) healed += b.tick(1 / 60);
    // 2 HP/s × 5s = 10（帧积分浮点边界允许 ±1）
    expect(healed).toBeGreaterThanOrEqual(9);
    expect(healed).toBeLessThanOrEqual(10);
  });

  it('Ironskin(5)：防御 +8（1456/1457 同值，非旧 6）', () => {
    const b = new BuffState();
    expect(b.defenseBonus).toBe(0);
    b.apply(BuffType.Ironskin, 10);
    expect(b.defenseBonus).toBe(8);
  });

  it('蜂蜜+恢复可叠加（各按自身速率）', () => {
    const b = new BuffState();
    b.apply(BuffType.Honey, 10);
    b.apply(BuffType.Regen, 10);
    let healed = 0;
    for (let k = 0; k < 300; k++) healed += b.tick(1 / 60);
    // 3 HP/s × 5s = 15（帧积分浮点边界允许 ±1）
    expect(healed).toBeGreaterThanOrEqual(14);
    expect(healed).toBeLessThanOrEqual(15);
  });
});

describe('环境 DoT 分块（HurtLifeRegen Player.cs:19136-19212）', () => {
  it('Burning：30 HP/s 且按原版 -600 阈值整块弹 5（每 10t 一块）', () => {
    const b = new BuffState();
    b.apply(BuffType.Burning, 20);
    let dmg = 0;
    for (let k = 0; k < 600; k++) dmg += b.tick(1 / 60);      // 10 秒 = 300 HP
    expect(dmg).toBeLessThanOrEqual(-290);                    // 30 HP/s(浮点边界)
    expect(dmg).toBeGreaterThanOrEqual(-300);
    // 分块时序:前 9 tick 静默,第 10 tick 弹 5
    const b2 = new BuffState();
    b2.apply(BuffType.Burning, 1);
    for (let k = 0; k < 9; k++) { b2.tick(1 / 60); expect(b2.consumeDotChunk()).toBe(0); }
    b2.tick(1 / 60);
    expect(b2.consumeDotChunk()).toBe(5);
    expect(b2.consumeDotChunk()).toBe(0);                     // 一次性消费后清零
  });

  it('Suffocation：同 -600 分支整块弹 5（每 15t 一块）', () => {
    const b = new BuffState();
    b.apply(BuffType.Suffocation, 1);
    for (let k = 0; k < 14; k++) { b.tick(1 / 60); expect(b.consumeDotChunk()).toBe(0); }
    b.tick(1 / 60);
    expect(b.consumeDotChunk()).toBe(5);
  });

  it('OnFire：走通用 -120 分支,每 15t 弹 1', () => {
    const b = new BuffState();
    b.apply(BuffType.OnFire, 1);
    for (let k = 0; k < 14; k++) { b.tick(1 / 60); expect(b.consumeDotChunk()).toBe(0); }
    b.tick(1 / 60);
    expect(b.consumeDotChunk()).toBe(1);
  });
});

// ============================================================================
// Wet 潮湿 buff 103（BuffID.cs:343；UpdateBuffs Player.cs:11335-11346；
// 授予链 = 爆裂泡泡 371 接触 StatusFromNPC :22239-22242）
// ============================================================================

describe('Wet 潮湿（103）', () => {
  it('注册：vanillaBuff 103 / 原版描述键 / Main.debuff 表（护士可清）', () => {
    expect(BUFF_DEFS[BuffType.Wet]).toEqual({
      vanillaBuff: 103, descKey: 'BuffDescription.Wet', fallbackName: '潮湿',
    });
    expect(BuffType.Wet).toBe(102);
    // Main.debuff[103]=true（Main.cs:8833）——护士计价清除名单内
    expect(BuffState.DEBUFFS.has(BuffType.Wet)).toBe(true);
    // buffTypeByVanilla 反查（StatusFromNPC 链接的授予入口）
    expect(buffTypeByVanilla(103)).toBe(BuffType.Wet);
  });

  it('纯视觉登记：无 DoT/无属性聚合，到期自然移除', () => {
    const b = new BuffState();
    b.apply(BuffType.Wet, 5);
    let delta = 0;
    for (let k = 0; k < 330; k++) delta += b.tick(1 / 60);   // 5.5 秒（浮点边界放宽）
    expect(delta).toBe(0);                                    // 无生命变化
    expect(b.moveSpeedMult).toBe(1);                          // 无移速影响
    expect(b.defenseBonus).toBe(0);                           // 无防御影响
    expect(b.has(BuffType.Wet)).toBe(false);                  // 到期移除
  });

  it('火系免疫（Player.cs:11344-11346 buffImmune[24]/[323]/[67]）：Wet 激活期间授予', () => {
    const w = new World(80, 120, 72, 'wet-buff');
    for (let x = 20; x <= 60; x++) w.store.setTileSilent(x, 80, 1);
    const p = new Player(30 * 16, 77 * 16, new Inventory());
    expect(p.buffs.immuneVanilla.has(24)).toBe(false);
    p.buffs.apply(BuffType.Wet, 5);
    void p.equipStats;   // buffImmune 刷新（Player.cs:14911+ 装备段）
    expect(p.buffs.immuneVanilla.has(24)).toBe(true);    // OnFire 24
    expect(p.buffs.immuneVanilla.has(323)).toBe(true);   // OnFire3 323
    expect(p.buffs.immuneVanilla.has(67)).toBe(true);    // Burning 67
    // 到期回落
    p.buffs.remove(BuffType.Wet);
    void p.equipStats;
    expect(p.buffs.immuneVanilla.has(67)).toBe(false);
  });

  it('不入存档（Main.cs buffNoSave[103]）', () => {
    const b = new BuffState();
    b.apply(BuffType.Wet, 10);
    expect(b.toSave()).toEqual([]);
  });

  it('接触授予链（StatusFromNPC :22239-22242）：371 有接触伤害值 + 时长 = 60×Next(3,8)', () => {
    // ① 371 走通用接触伤害链的前提：def.damage > 0（vanilla-npcs.json 371 = 100）
    const bub = Enemy.fromVanilla(371, 100 * 16, 100 * 16);
    expect(bub).not.toBeNull();
    expect(bub!.def.damage).toBeGreaterThan(0);
    expect(bub!.vanillaId).toBe(371);
    // ② 时长公式：60×Next(3,8) = 180-420t → 3-7 秒（Next 上界不含；★非 3-8s）
    const seen = new Set<number>();
    for (let k = 0; k < 500; k++) {
      const sec = wetFromBubbleContact(() => k / 500);
      expect(sec).toBeGreaterThanOrEqual(3);
      expect(sec).toBeLessThanOrEqual(7);
      seen.add(sec);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('浸岩浆即刻移除（UpdateBuffs :11335-11338 lavaWet → DelBuff）', () => {
    const w = new World(80, 120, 72, 'wet-lava');
    for (let x = 20; x <= 60; x++) w.store.setTileSilent(x, 80, 1);
    const p = new Player(30 * 16, 77 * 16, new Inventory());
    const fakeHooks = {
      world: w, player: p, enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
      playSfxFiles: () => {}, showPickupLabel: () => {},
    } as never;
    p.buffs.apply(BuffType.Wet, 5);
    expect(p.buffs.has(BuffType.Wet)).toBe(true);
    // 玩家全身没入岩浆（LIQUID_TYPE.LAVA = 2）→ 下一 tick Wet 被蒸干
    const tx = Math.floor(p.x / 16);
    for (let j = 70; j < 80; j++) {
      for (let i = tx - 1; i <= tx + 2; i++) w.store.setLiquid(i, j, 255, 2);
    }
    p.fixedUpdate(1 / 60, fakeHooks);
    expect(p.inLava).toBe(true);
    expect(p.buffs.has(BuffType.Wet)).toBe(false);
  });
});
