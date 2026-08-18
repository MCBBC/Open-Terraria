// 城镇 NPC Boss 击杀进度强化链（AI_007_TownEntities NPC.cs:53400-53557）：
//   num2 = 伤害乘区（1 起步,加法累计,先于难度曲线进 GetAttackDamage_ForTownNPC
//   (:7041 = ×TownNPCDamageMultiplier);四攻击态入参 :54897/:55169/:55319/:55466）
//   num3 = 攻击频率门除数（2 起步,乘法累计;:55859 num123=(int)(AttackAverageChance
//   ×num3) 钳 ≥1 后 rand(num123)==0）。
// 链序（顺序敏感）：战斗书两卷 ×0.25 → 史王/克眼 +0.05 → 鹿角怪/世吞|克脑/骷髅王/
//   蜂后 +0.1 → 硬模式 +0.4 → 肉后九旗 +0.15 → Skyblock +0.5（num3>1 才折半）→
//   tipsy 尾乘 ×1.1（num3 ×0.9）。209 的 num3÷3 在消费点（:53548）。
// tipsy 载体 = 麦酒弹 669 Kill 爆炸（Projectile.cs:68701-68737,酒保 550 自卫
//   投掷）：144×144 框内玩家/城镇 NPC AddBuff(25, 3659)。
import { describe, it, expect } from 'vitest';
import {
  townNpcProgressionBoost, townNpcProgressionFromWorld, type TownNpcProgression, TownNPC,
} from '../src/entities/TownNPC';
import { TownShot } from '../src/entities/TownShot';
import { World } from '../src/world/World';
import { BuffState, BuffType } from '../src/stats/Buffs';

const BASE = townNpcProgressionFromWorld({ flags: {} });
const withP = (over: Partial<TownNpcProgression>): TownNpcProgression => ({ ...BASE, ...over });

describe('num2/num3 进度强化链纯函数（NPC.cs:53400-53557）', () => {
  it('无进度基线：damageMul 1 / chanceMul 2（:53400/:53413）', () => {
    expect(townNpcProgressionBoost(BASE)).toEqual({ damageMul: 1, chanceMul: 2, defenseBonus: 0 });
    // fromWorld 空旗标：skyblockLowTiles/tipsy 恒 false（登记位,见 TownNPC 注释）
    expect(BASE.skyblockLowTiles).toBe(false);
    expect(BASE.tipsy).toBe(false);
  });

  it('战斗书两卷：+0.25/卷 damage、×0.8/卷 chance（:53419-53432）', () => {
    expect(townNpcProgressionBoost(withP({ combatBookWasUsed: true })))
      .toEqual({ damageMul: 1.25, chanceMul: 1.6, defenseBonus: 8 });
    const two = townNpcProgressionBoost(withP({ combatBookWasUsed: true, combatBookVolumeTwoWasUsed: true }));
    expect(two.damageMul).toBe(1.5);                       // 1+0.25+0.25 二进制精确
    expect(two.chanceMul).toBeCloseTo(1.28, 9);            // 2×0.8×0.8 浮点尾差
  });

  it('Boss 旗标三档 + 硬模式：+0.05/+0.1/+0.4/肉后九旗 +0.15，chance 侧 ×0.985/旗', () => {
    // :53437-53472 肉前六旗（史王/克眼 0.05；鹿角怪/世吞/骷髅王/蜂后 0.1）
    expect(townNpcProgressionBoost(withP({ downedSlimeKing: true })).damageMul).toBeCloseTo(1.05, 9);
    expect(townNpcProgressionBoost(withP({ downedBoss1: true })).damageMul).toBeCloseTo(1.05, 9);
    expect(townNpcProgressionBoost(withP({ downedDeerclops: true })).damageMul).toBeCloseTo(1.1, 9);
    expect(townNpcProgressionBoost(withP({ downedBoss2: true })).damageMul).toBeCloseTo(1.1, 9);
    expect(townNpcProgressionBoost(withP({ downedBoss3: true })).damageMul).toBeCloseTo(1.1, 9);
    expect(townNpcProgressionBoost(withP({ downedQueenBee: true })).damageMul).toBeCloseTo(1.1, 9);
    // :53473-53478 硬模式 = 最大单项 +0.4
    expect(townNpcProgressionBoost(withP({ hardMode: true })).damageMul).toBeCloseTo(1.4, 9);
    // :53479-53532 肉后九旗各 +0.15
    for (const k of ['downedQueenSlime', 'downedMechBoss1', 'downedMechBoss2', 'downedMechBoss3',
      'downedPlantBoss', 'downedEmpressOfLight', 'downedFishron', 'downedGolemBoss',
      'downedAncientCultist'] as const) {
      expect(townNpcProgressionBoost(withP({ [k]: true })).damageMul, k).toBeCloseTo(1.15, 9);
    }
    // chance 侧：每旗 ×0.985（单旗 2×0.985=1.97）
    expect(townNpcProgressionBoost(withP({ downedBoss1: true })).chanceMul).toBeCloseTo(1.97, 9);
    expect(townNpcProgressionBoost(withP({ hardMode: true })).chanceMul).toBeCloseTo(1.97, 9);
  });

  it('组合全开：damage 4.675 / chance 折半后 ×0.9（链序敏感）', () => {
    const all = withP({
      combatBookWasUsed: true, combatBookVolumeTwoWasUsed: true,
      downedSlimeKing: true, downedBoss1: true, downedDeerclops: true, downedBoss2: true,
      downedBoss3: true, downedQueenBee: true, hardMode: true, downedQueenSlime: true,
      downedMechBoss1: true, downedMechBoss2: true, downedMechBoss3: true,
      downedPlantBoss: true, downedEmpressOfLight: true, downedFishron: true,
      downedGolemBoss: true, downedAncientCultist: true,
      skyblockLowTiles: true, tipsy: true,
    });
    // damage = 1 + 0.25×2 + 0.05×2 + 0.1×4 + 0.4 + 0.15×9 = 3.75 → +0.5 → ×1.1
    expect(townNpcProgressionBoost(all).damageMul).toBeCloseTo(4.675, 9);
    // chance = 2×0.8²×0.985^16 ≈ 1.00515 >1 → 折半 (c+1)/2 ≈ 1.00257 → ×0.9
    const c16 = 2 * 0.8 * 0.8 * Math.pow(0.985, 16);
    expect(townNpcProgressionBoost(all).chanceMul).toBeCloseTo(((c16 + 1) / 2) * 0.9, 9);
  });

  it('Skyblock num3 折半在链中段（:53542-53545,>1 才折）', () => {
    // 仅书+Skyblock：chance 1.28 → (1.28+1)/2 = 1.14；damage 1+0.5+0.5 = 2.0
    const r = townNpcProgressionBoost(withP({
      combatBookWasUsed: true, combatBookVolumeTwoWasUsed: true, skyblockLowTiles: true,
    }));
    expect(r.chanceMul).toBeCloseTo(1.14, 9);
    expect(r.damageMul).toBeCloseTo(2, 9);
    // 纯函数输入空间 chance 最小值 = 2×0.64×0.985^16 ≈ 1.00515 恒 >1（原版同构,
    // 守卫的 false 分支不可达——登记非缺口）
  });

  it('tipsy 链尾乘算（:53552-53557）：damage×1.1 / chance×0.9', () => {
    expect(townNpcProgressionBoost(withP({ tipsy: true })))
      .toEqual({ damageMul: 1.1, chanceMul: 1.8, defenseBonus: 0 });
    // 与硬模式叠加：(1+0.4)×1.1 = 1.54（乘算在加法之后——链尾语义）
    expect(townNpcProgressionBoost(withP({ hardMode: true, tipsy: true })).damageMul)
      .toBeCloseTo(1.54, 9);
  });
});

describe('world.flags → 链入参映射（townNpcProgressionFromWorld）', () => {
  it('Boss 击杀记账键 + 归一/别名双读', () => {
    const p = townNpcProgressionFromWorld({ flags: {
      downed_50: true,            // 史莱姆王
      downed_4: true,             // 克眼
      downed_668: true,           // 鹿角怪
      downed_13: true,            // 世吞（归一 13）
      downed_35: true,            // 骷髅王
      downed_222: true,           // 蜂后
      hardMode: true,             // 肉山 → StartHardmode
      downed_657: true, downed_134: true, downed_125: true, downed_127: true,
      downed_262: true, downed_636: true, downed_370: true, downed_245: true,
      downed_439: true,
      combatBookWasUsed: true, combatBookVolumeTwoWasUsed: true,
    } });
    expect(p.downedSlimeKing && p.downedBoss1 && p.downedDeerclops && p.downedBoss2
      && p.downedBoss3 && p.downedQueenBee && p.hardMode && p.downedQueenSlime
      && p.downedMechBoss1 && p.downedMechBoss2 && p.downedMechBoss3 && p.downedPlantBoss
      && p.downedEmpressOfLight && p.downedFishron && p.downedGolemBoss
      && p.downedAncientCultist).toBe(true);
    expect(p.combatBookWasUsed && p.combatBookVolumeTwoWasUsed).toBe(true);
    // 双子归一：125/126 任一（或同开）都只计 downedMechBoss2 一档
    expect(townNpcProgressionFromWorld({ flags: { downed_126: true } }).downedMechBoss2).toBe(true);
    const twins = townNpcProgressionFromWorld({ flags: { downed_125: true, downed_126: true } });
    expect(twins.downedMechBoss2).toBe(true);
    // 世吞 13 / 克脑 266 归一 downedBoss2
    expect(townNpcProgressionFromWorld({ flags: { downed_266: true } }).downedBoss2).toBe(true);
    // 旧档/导入别名
    expect(townNpcProgressionFromWorld({ flags: { downedEyeOfCthulhu: true } }).downedBoss1).toBe(true);
    expect(townNpcProgressionFromWorld({ flags: { downedSkeletron: true } }).downedBoss3).toBe(true);
    expect(townNpcProgressionFromWorld({ flags: { downedSlimeKing: true } }).downedSlimeKing).toBe(true);
    // 非链内 Boss（如月总 398/哀木 89 等）不误触
    const none = townNpcProgressionFromWorld({ flags: { downed_398: true, downed_89: true } });
    expect(townNpcProgressionBoost(none)).toEqual({ damageMul: 1, chanceMul: 2, defenseBonus: 0 });
  });
});

// ---------------------------------------------------------------------------
// 端到端：发射端结算 num × num2 → 难度曲线（NPC.cs:54897/:55169/:55319/:55466）
// ---------------------------------------------------------------------------
interface TestEnemy {
  x: number; y: number; w: number; h: number; dead: boolean; damage: number;
  hurt: (d: number) => boolean;
}

function makeGame(opts: {
  difficulty?: number;
  flags?: Record<string, boolean>;
  enemies?: TestEnemy[];
  npcs?: TownNPC[];
  player?: { x: number; y: number; w: number; h: number; dead: boolean; buffs?: BuffState };
} = {}) {
  const world = new World(200, 200, 100, 'town-prog-test');
  world.difficulty = opts.difficulty ?? 0;
  Object.assign(world.flags, opts.flags ?? {});
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  const shots: TownShot[] = [];
  const sounds: string[] = [];
  const enemies = opts.enemies ?? [];
  const npcs = opts.npcs ?? [];
  const enemyHurt: number[] = [];
  return {
    world, shots, sounds, enemyHurt, npcs,
    game: {
      world,
      player: opts.player ?? { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => enemies,
      npcs: () => npcs,
      spawnTownShot: (s: TownShot) => shots.push(s),
      spawnParticles: () => {}, playSfx: () => {},
      playSfxFiles: (files: string[]) => sounds.push(...files),
      addDamageNumber: () => {},
      critters: () => [],
    } as never,
  };
}

function runUntil(npc: TownNPC, game: unknown, cond: () => boolean, maxT = 2000): void {
  for (let t = 0; t < maxT && !cond(); t++) npc.fixedUpdate(1 / 60, game as never);
}

describe('发射端消费 num2（shootAt/swingUpdate）', () => {
  /** 危险逃离(2026-08-17 接 NPC.cs:53864-54024)后 NPC 背敌走逃——伤害断言改用
   *  敌贴身追踪保持危险态(逃/打循环=原版观感),防逃出探测圈后不再触发 */
  function chaseUntil(
    npc: TownNPC, enemy: TestEnemy, game: unknown, cond: () => boolean,
    maxT = 2000, dx = 2 * 16,
  ) {
    for (let t = 0; t < maxT && !cond(); t++) {
      enemy.x = npc.cx + dx;
      npc.fixedUpdate(1 / 60, game as never);
    }
  }

  it('酒保(550)近战弹 669：基线 24 / downed_4 后 trunc(24×1.05)=25', () => {
    for (const [flags, want] of [
      [{}, 24],
      [{ downed_4: true }, 25],
    ] as const) {
      const keep = new TownNPC('tavernkeep', 100 * 16, 99 * 16);
      const enemy: TestEnemy = {
        x: 102 * 16, y: 98 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true,
      };
      const { game, shots } = makeGame({ flags: flags as Record<string, boolean>, enemies: [enemy] });
      chaseUntil(keep, enemy, game, () => shots.length > 0);
      expect(shots.length, JSON.stringify(flags)).toBeGreaterThan(0);
      expect(shots[0].projId).toBe(669);
      expect(shots[0].damage).toBe(want);
    }
  });

  it('酒保(550)+硬模式+Expert：trunc(24×1.4×1.5)=50（num2 先于难度曲线）', () => {
    const keep = new TownNPC('tavernkeep', 100 * 16, 99 * 16);
    const enemy: TestEnemy = {
      x: 102 * 16, y: 98 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true,
    };
    const { game, shots } = makeGame({ difficulty: 1, flags: { hardMode: true }, enemies: [enemy] });
    chaseUntil(keep, enemy, game, () => shots.length > 0);
    expect(shots[0].damage).toBe(Math.trunc(24 * 1.4 * 1.5));   // 50
  });

  it('发型师(353)挥击态：硬模式 hurt 收到 trunc(10×1.4)=14（:55466 同式）', () => {
    const stylist = new TownNPC('stylist', 100 * 16, 99 * 16);
    const got: number[] = [];
    // 353 探测半径仅 60:敌贴身(中心距 ~30)且悬空于地板行上(DangerDetectRange 门)
    const enemy: TestEnemy = {
      x: 100 * 16 + 20, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40,
      hurt: (d) => { got.push(d); return true; },
    };
    const { game } = makeGame({ flags: { hardMode: true }, enemies: [enemy] });
    // 挥击矩形 32px：敌须与 [cx, cx+32] 重叠——贴距 16（32 会恰好零重叠）
    chaseUntil(stylist, enemy, game, () => got.length > 0, 2000, 16);
    expect(got.length).toBeGreaterThan(0);
    expect(got[0]).toBe(14);
  });

  it('tipsy 实例位：applyTipsy 后弹伤 ×1.1（trunc(24×1.1)=26）,衰减尽回基线', () => {
    const keep = new TownNPC('tavernkeep', 100 * 16, 99 * 16);
    const enemy: TestEnemy = {
      x: 102 * 16, y: 98 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true,
    };
    const { game, shots } = makeGame({ enemies: [enemy] });
    keep.applyTipsy(600);                       // buff 25 在列 → NPC.tipsy
    chaseUntil(keep, enemy, game, () => shots.length > 0);
    expect(shots[0].damage).toBe(26);
    // 快照语义：剩余 1t 的最后一 tick 仍 true（:93174 递减后置位,次 tick :93333 重置）
    const tail = new TownNPC('tavernkeep', 100 * 16, 99 * 16);
    tail.applyTipsy(1);
    tail.fixedUpdate(1 / 60, makeGame({}).game);
    expect(tail.tipsy).toBe(true);
    tail.fixedUpdate(1 / 60, makeGame({}).game);
    expect(tail.tipsy).toBe(false);
    // 衰减尽 → 伤害回基线（time=2 在第 1/2 tick 均生效,第 3 tick 起 false）
    const sober = new TownNPC('tavernkeep', 100 * 16, 99 * 16);
    const soberEnemy: TestEnemy = {
      x: 102 * 16, y: 98 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true,
    };
    const { game: g2, shots: s2 } = makeGame({ enemies: [soberEnemy] });
    sober.applyTipsy(2);
    sober.fixedUpdate(1 / 60, g2);
    sober.fixedUpdate(1 / 60, g2);
    expect(sober.tipsy).toBe(true);             // 第二 tick 仍生效（guard 1>0 → 递减后置位）
    sober.fixedUpdate(1 / 60, g2);
    expect(sober.tipsy).toBe(false);
    chaseUntil(sober, soberEnemy, g2, () => s2.length > 0);
    expect(s2[0].damage).toBe(24);
  });
});

describe('麦酒弹 669 Kill 爆炸（Projectile.cs:68701-68737,tipsy 施加链）', () => {
  it('落地爆炸：框内玩家+城镇 NPC 入 Tipsy 3659t / 框外 NPC 不中 / 框内敌怪溅射', () => {
    const inBox = new TownNPC('guide', 1650, 1540);        // 爆炸框内（144×144）
    const outBox = new TownNPC('guide', 1584, 1200);       // 框外 300px 上方
    const player = { x: 1560, y: 1550, w: 20, h: 42, dead: false, buffs: new BuffState() };
    const got: number[] = [];
    const enemy: TestEnemy = {
      x: 1540, y: 1570, w: 20, h: 40, dead: false, damage: 40,
      hurt: (d) => { got.push(d); return true; },
    };
    const { game, sounds } = makeGame({
      enemies: [enemy], npcs: [inBox, outBox], player,
    });
    // 直投:自由落体 17t 内触地 → tile 死点 → kill669
    const shot = new TownShot(1584, 1552, 0, 0, 24, 9, 669, {});
    for (let t = 0; t < 40 && !shot.dead; t++) shot.fixedUpdate(1 / 60, game);
    expect(shot.dead).toBe(true);
    expect(sounds).toContain('Item_13');                   // PlaySound(13)
    expect(inBox.tipsyT).toBe(3659);                       // AddBuff(25, 3659)
    expect(outBox.tipsyT).toBe(0);                         // 框外不中
    expect(player.buffs.has(BuffType.Tipsy)).toBe(true);   // 玩家入框
    expect(got).toContain(24);                             // Damage() 溅射
  });

  it('弹时尽死点同样触发爆炸（life 归零 Kill 路径）', () => {
    const npc = new TownNPC('guide', 1584, 1560);
    const { game } = makeGame({ npcs: [npc] });
    const shot = new TownShot(1584, 1552, 0, 0, 24, 9, 669, { life: 1 });
    shot.fixedUpdate(1 / 60, game);
    expect(shot.dead).toBe(true);
    expect(npc.tipsyT).toBe(3659);
  });
});
