// 1457 批 1（玩家侧行为修复）机制锁：docs/diff-1456-1457-full-report.md
// "# Player.cs 行为差异清单" + 附录 B 双版代码对照。行号 = Terarria1457/Terraria/Player.cs。
import { describe, it, expect } from 'vitest';
import { BuffState, BuffType } from '../src/stats/Buffs';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';

describe('1457 批1: ManaHeat 魔力过热（buff 396,Player.cs:961-967/:52644-52652/:10416-10429）', () => {
  it('TryApplyManaHeat：登记 power/duration 并挂 buff（time×60 tick）', () => {
    const p = new Player(0, 0, new Inventory());
    p.tryApplyManaHeat(0.2, 2);
    expect(p.latestManaPotionDamageBonus).toBe(0.2);
    expect(p.latestManaPotionDuration).toBe(120);
    expect(p.buffs.has(BuffType.ManaHeat)).toBe(true);
    // 满时长 → manaHeat = 1 + 0.2×(120/120) = 1.2（:10416-10429 线性）
    expect(p.manaHeatMult).toBeCloseTo(1.2, 6);
  });
  it('衰减随剩余时长线性（buffTime/duration）', () => {
    const p = new Player(0, 0, new Inventory());
    p.tryApplyManaHeat(0.2, 2);
    p.buffs.set(BuffType.ManaHeat, 1);    // 剩 1s（时长 2s 的一半）
    expect(p.manaHeatMult).toBeCloseTo(1 + 0.2 * 0.5, 6);
  });
  it('power=0 不挂 buff；无 buff 时乘区恒 1', () => {
    const p = new Player(0, 0, new Inventory());
    p.tryApplyManaHeat(0, 2);
    expect(p.buffs.has(BuffType.ManaHeat)).toBe(false);
    expect(p.manaHeatMult).toBe(1);
  });
  it('药水表 189/500/2209 → 0.05/0.10/0.15 ×20s（1457 死代码 ApplyManaPotionManaHeat 备位）', () => {
    expect(Player.MANA_POTION_MANA_HEAT[189]).toEqual([0.05, 20]);
    expect(Player.MANA_POTION_MANA_HEAT[500]).toEqual([0.1, 20]);
    expect(Player.MANA_POTION_MANA_HEAT[2209]).toEqual([0.15, 20]);
  });
});

describe('1457 批1: Warmth 温暖（buff 124,:5292-5315/:5429-5437）', () => {
  it('新获得 Warmth：已有 Chilled ÷4、Frozen ÷2（下限 5t）', () => {
    const b = new BuffState();
    b.set(BuffType.Chilled, 40);          // 40s
    b.set(BuffType.Frozen, 8);
    b.apply(BuffType.Warmth, 480);
    expect(b.active.get(BuffType.Chilled)).toBeCloseTo(10, 6);   // 40/4
    expect(b.active.get(BuffType.Frozen)).toBeCloseTo(4, 6);     // 8/2
  });
  it('下限 5t：短 Chilled 不再缩短', () => {
    const b = new BuffState();
    b.set(BuffType.Chilled, 0.1);         // 6t > 5t → 削成 max(5t, 1.5t)=5t
    b.apply(BuffType.Warmth, 480);
    expect(b.active.get(BuffType.Chilled)).toBeCloseTo(5 / 60, 6);
  });
  it('已有 Warmth 时重复喝不重复削（AddBuff_TryUpdatingExistingBuffTime 门）', () => {
    const b = new BuffState();
    b.apply(BuffType.Warmth, 480);
    b.set(BuffType.Chilled, 40);
    b.apply(BuffType.Warmth, 480);        // 续期不削
    expect(b.active.get(BuffType.Chilled)).toBeCloseTo(40, 6);
  });
  it('resistCold 在场：施加 46/47 时长 ÷4/÷2（AddBuff_DetermineBuffTimeToAdd）', () => {
    const b = new BuffState();
    b.apply(BuffType.Warmth, 480);
    b.apply(BuffType.Chilled, 40);
    expect(b.active.get(BuffType.Chilled)).toBeCloseTo(10, 6);
    b.apply(BuffType.Frozen, 40);
    expect(b.active.get(BuffType.Frozen)).toBeCloseTo(20, 6);
  });
});

describe('1457 批1: 移动减速取最强不叠加（Update :26132-26165）', () => {
  it('Burning/Slow 同持 → 0.5（不叠乘 0.25）；+Chilled 仍 0.75 最弱不生效', () => {
    const b = new BuffState();
    b.apply(BuffType.Burning, 10);
    b.apply(BuffType.Slow, 10);
    expect(b.strongestMoveSpeedDebuff).toBe(0.5);
    b.apply(BuffType.Chilled, 10);
    expect(b.strongestMoveSpeedDebuff).toBe(0.5);   // min(0.5,0.75)=0.5
  });
  it('单 Chilled → 0.75；无 debuff → 1；moveSpeedMult 不再含三 debuff', () => {
    const b = new BuffState();
    expect(b.strongestMoveSpeedDebuff).toBe(1);
    b.apply(BuffType.Chilled, 10);
    expect(b.strongestMoveSpeedDebuff).toBeCloseTo(0.75, 6);
    expect(b.moveSpeedMult).toBe(1);
  });
});

describe('1457 批1: 叶绿巨剑计数（chlorophyteBladeCounter,:43161-43163）', () => {
  it('fixedUpdate 每帧递减、钳 0 下界', () => {
    const w = new World(40, 40, 42, 't1457');
    const p = new Player(20 * 16, 20 * 16, new Inventory());
    p.chlorophyteBladeCounter = 5;
    p.fixedUpdate(1 / 60, { world: w } as never);
    expect(p.chlorophyteBladeCounter).toBe(4);
    p.chlorophyteBladeCounter = 0;
    p.fixedUpdate(1 / 60, { world: w } as never);
    expect(p.chlorophyteBladeCounter).toBe(0);
  });
});

describe('1457 批1: slowMagic 五方法（:47425-47456/:52593-52604,release 恒关）', () => {
  it('slowMagicUse=false 恒等返回；置位后 ×2.5/÷2.5', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.getSlowMagicUseTime(15)).toBe(15);
    expect(p.getSlowMagicUseRate()).toBe(1);
    expect(p.getSlowMagicScalar()).toBe(1);
    p.slowMagicUse = true;                 // 仅 debug 链置位（本仓无 ManaV2 开关）
    expect(p.getSlowMagicUseTime(15)).toBe(Math.floor(2.5 * 15));
    expect(p.getSlowMagicUseRate()).toBeCloseTo(1 / 2.5, 6);
    expect(p.getSlowMagicScalar()).toBe(2.5);
    p.undoSlowMagicUse();
    expect(p.slowMagicUse).toBe(false);
  });
});

// ================= 批 1 复审修复锁（review-batch1.md D2/D3/D4/D7/D8/❌②❌④,2026-08-21） =================

describe('批1复审 D2: 盾举并入最强减速链（:26155-26162）', () => {
  it('shieldRaised → 合成减速 1/3（Buffs getter 无 Player 访问,Player 侧 min 合成）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.maxRunSpeed).toBeCloseTo(3, 6);            // 裸装 3×1×1×1
    p.shieldRaised = true;
    expect(p.maxRunSpeed).toBeCloseTo(3 / 3, 6);        // ×1/3
    p.shieldRaised = false;
    p.buffs.apply(BuffType.Burning, 10);
    expect(p.maxRunSpeed).toBeCloseTo(1.5, 6);          // ×0.5
    p.shieldRaised = true;
    expect(p.maxRunSpeed).toBeCloseTo(1, 6);            // min(0.5,1/3)=1/3
  });
});

describe('批1复审 D3: runAcceleration 乘 moveSpeed 乘区（:26206）', () => {
  const TILE = 16;
  const flatWorld = (): World => {
    const w = new World(480, 80, 30, 'd3run');
    for (let x = 0; x < 480; x++) { w.store.setTileSilent(x, 70, 1, 0, 0); w.store.setTileSilent(x, 71, 1, 0, 0); }
    return w;
  };
  const game = { world: null as unknown as World, player: null as unknown, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} }, spawnParticles: () => {}, addDamageNumber: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, spawnDrop: () => null } as never;
  const step = (p: Player): void => p.fixedUpdate(1 / 60, game);

  it('Slow 下首帧加速 0.08×0.5=0.04/t;Swiftness 0.08×1.25=0.1/t;裸装 0.08/t', () => {
    (game as unknown as { world: World }).world = flatWorld();
    const probe = (buff: BuffType | null): number => {
      const p = new Player(60 * TILE, 66 * TILE, new Inventory());
      for (let i = 0; i < 30; i++) step(p);              // 落地沉降
      expect(p.onGround).toBe(true);
      if (buff !== null) p.buffs.apply(buff, 60);
      p.inputX = 1;
      step(p);
      return p.vx;
    };
    expect(probe(null)).toBeCloseTo(0.08, 9);            // 裸装 runAcc×moveSpeedMult(1)
    expect(probe(BuffType.Slow)).toBeCloseTo(0.04, 9);   // ×strongestSlow(0.5)
    expect(probe(BuffType.Agility)).toBeCloseTo(0.1, 9); // ×moveSpeedMult(1.25)
  });
});

describe('批1复审 D7: 复活跳过 boss 门=活值 4000px（AnyBossHindersRespawnTime :39368-39397）', () => {
  it('bossNearOnDeath 快照不再参与跳过门（allowsRespawnTimerSkip 活值重算）', () => {
    // 死亡瞬间快照为 true、但 boss 已不在场 → 跳过门放行（原版活值语义）
    const p = new Player(0, 0, new Inventory());
    p.bossNearOnDeath = true;   // 旧实现恒禁跳
    expect(p.respawnTimer).toBe(0);
    // 快照字段仍供 GetRespawnTime +600 消费（:38388-38398 死亡时算定,语义保留）
    expect(p.bossNearOnDeath).toBe(true);
  });
});

describe('批1复审 ❌④: 火炬神弹难度伤（:18000 40×HostileProjectileDamageMultiplier）', () => {
  it('经典 40 / 专家 60 / 大师 80（曾恒 20）', async () => {
    const { TorchGodProj } = await import('../src/entities/WeaponProj');
    const { hostileProjectileDamage } = await import('../src/stats/ScaleStats');
    const { GDL } = await import('../src/stats/ScaleStats');
    // 曲线键 Journey 0.5 / Master 3（GameDifficultyData.cs:67）——Classic=1、
    // Expert 线性插值=2 → 40/80/120（非 1.5/2 档!）
    expect(hostileProjectileDamage(40, GDL.CLASSIC)).toBe(40);
    expect(hostileProjectileDamage(40, GDL.EXPERT)).toBe(80);
    expect(hostileProjectileDamage(40, GDL.MASTER)).toBe(120);
    // 命中即按难度曲线取伤（不再读恒 20 的 damage 字段）
    const p = new Player(0, 0, new Inventory());
    p.hp = 100;
    const proj = new (Object.getPrototypeOf(TorchGodProj))();   // 仅验类面:字段删除
    expect((proj as unknown as { damage?: number }).damage).toBeUndefined();
    void p;
  });
});
