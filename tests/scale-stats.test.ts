// 专家/大师世界强度轴（B 级最大消费面）回归探针：
//   src/stats/ScaleStats.ts   ↔ NPC.cs:18081-18659（ScaleStats 五件套）+
//                               GameDifficultyData.cs:16-70 / GameDifficultyLevel.cs:8-16 /
//                               Main.cs:2760-2786 / NPC.cs:7010-7035 / NPCID.cs:4440-4801
//   Enemy.fromVanilla 接线     ↔ NewNPC→ScaleStats 调用点 NPC.cs:8322/:17791
//   敌弹命中乘区               ↔ Projectile.cs:13770（hostileDamageScaling.Sample）
//   专家持械僵尸替换生成表      ↔ NPC.cs:4565/:4624/:4644 + GetZombieSettings :5495-5523
// 数值断言全部按原版公式手算（每条附算式），不与本仓实现互相印证。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY } from '../src/data/tiles';
import { EMPTY_SCENE } from '../src/world/SceneMetrics';
import { brainOfCthulhuAI, creeperAI } from '../src/entities/bossAI';
import { hungryAI } from '../src/entities/bossAI_wof';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';
import {
  GDL, sampleCurve, ENEMY_MAX_LIFE_MULTIPLIER, ENEMY_DAMAGE_MULTIPLIER,
  ENEMY_MONEY_DROP_MULTIPLIER, KNOCKBACK_TO_ENEMIES_MULTIPLIER,
  mainDifficulty, mainExpertMode, mainMasterMode,
  getAttackDamageScaledByDifficulty, getAttackDamageForProjectiles,
  hostileProjectileDamage, scaleStats, bindScaleStatsWorld,
  scaleStatsWorldOf, CLASSIC_SCALE_WORLD, type ScalingStats,
  applySeedAdjustments, type SeedAdjustStats,
} from '../src/stats/ScaleStats';

// ---------------------------------------------------------------------------
// 世界难度上下文绑定（Game.afterWorldLoad 在生产路径做；测试里手动绑定/还原，
// 防跨用例泄漏——bindScaleStatsWorld 是模块级单例）
// ---------------------------------------------------------------------------
beforeEach(() => { bindScaleStatsWorld(scaleStatsWorldOf(new World(100, 100, 7, 't'), () => false)); });
afterEach(() => { bindScaleStatsWorld(null); });

/** 造一个指定难度的世界并绑定（seedFlags/flags 可覆盖） */
function worldOf(difficulty: number, opts?: {
  getGoodWorld?: boolean; tenthAnniversary?: boolean; remix?: boolean; everything?: boolean;
  hardMode?: boolean; downedPlantBoss?: boolean;
}): World {
  const w = new World(100, 100, 7, 't');
  w.difficulty = difficulty;
  if (opts?.getGoodWorld) w.seedFlags = { ...w.seedFlags, getGoodWorld: true };
  if (opts?.tenthAnniversary) w.seedFlags = { ...w.seedFlags, tenthAnniversary: true };
  if (opts?.remix) w.seedFlags = { ...w.seedFlags, remix: true };
  if (opts?.everything) w.seedFlags = { ...w.seedFlags, everything: true };
  if (opts?.hardMode) w.flags.hardMode = true;
  if (opts?.downedPlantBoss) w.flags['downed_262'] = true;
  bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
  return w;
}

/** 裸 bundle（NPC 字段投影；value 用 npcValueOf 同源数据） */
function stat(type: number, over?: Partial<ScalingStats>): ScalingStats {
  return {
    type, lifeMax: 1, damage: 0, value: 0, defense: 0, knockBackResist: 0.5,
    boss: false, friendly: false, townNPC: false, scale: 1, difficulty: 0,
    ...over,
  };
}

// ===========================================================================
// 1. GameDifficultyData 线性曲线（GameDifficultyData.cs:62-70）逐键采样
// ===========================================================================
describe('难度曲线采样（GameDifficultyData.cs:16-70）', () => {
  it('EnemyMaxLifeMultiplier：旅程 0.5 / 经典 1 / 专家 2 / 大师 3 / 传奇 4（单键直线）', () => {
    expect(sampleCurve(ENEMY_MAX_LIFE_MULTIPLIER, GDL.JOURNEY)).toBeCloseTo(0.5, 6);
    expect(sampleCurve(ENEMY_MAX_LIFE_MULTIPLIER, GDL.CLASSIC)).toBeCloseTo(1, 6);
    expect(sampleCurve(ENEMY_MAX_LIFE_MULTIPLIER, GDL.EXPERT)).toBeCloseTo(2, 6);
    expect(sampleCurve(ENEMY_MAX_LIFE_MULTIPLIER, GDL.MASTER)).toBeCloseTo(3, 6);
    expect(sampleCurve(ENEMY_MAX_LIFE_MULTIPLIER, GDL.LEGENDARY)).toBeCloseTo(4, 6);
  });
  it('EnemyDamageMultiplier：旅程 0.5 / 经典 1 / 专家 2 / 大师 3 / 传奇 5.3333335（两段折线）', () => {
    expect(sampleCurve(ENEMY_DAMAGE_MULTIPLIER, GDL.JOURNEY)).toBeCloseTo(0.5, 6);
    expect(sampleCurve(ENEMY_DAMAGE_MULTIPLIER, GDL.CLASSIC)).toBeCloseTo(1, 6);
    expect(sampleCurve(ENEMY_DAMAGE_MULTIPLIER, GDL.EXPERT)).toBeCloseTo(2, 6);
    expect(sampleCurve(ENEMY_DAMAGE_MULTIPLIER, GDL.MASTER)).toBeCloseTo(3, 6);
    expect(sampleCurve(ENEMY_DAMAGE_MULTIPLIER, GDL.LEGENDARY)).toBeCloseTo(5.3333335, 6);
  });
  it('EnemyMoneyDropMultiplier：经典 1 / 专家 2.5 / 大师 2.5 / 传奇 3.5（专家=大师同值）', () => {
    expect(sampleCurve(ENEMY_MONEY_DROP_MULTIPLIER, GDL.CLASSIC)).toBeCloseTo(1, 6);
    expect(sampleCurve(ENEMY_MONEY_DROP_MULTIPLIER, GDL.EXPERT)).toBeCloseTo(2.5, 6);
    expect(sampleCurve(ENEMY_MONEY_DROP_MULTIPLIER, GDL.MASTER)).toBeCloseTo(2.5, 6);
    expect(sampleCurve(ENEMY_MONEY_DROP_MULTIPLIER, GDL.LEGENDARY)).toBeCloseTo(3.5, 6);
  });
  it('KnockbackToEnemiesMultiplier：经典 1 → 大师 0.8 线性（专家 0.9）', () => {
    expect(sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, GDL.CLASSIC)).toBeCloseTo(1, 6);
    expect(sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, GDL.EXPERT)).toBeCloseTo(0.9, 6);
    expect(sampleCurve(KNOCKBACK_TO_ENEMIES_MULTIPLIER, GDL.MASTER)).toBeCloseTo(0.8, 6);
  });
});

// ===========================================================================
// 2. Main.Difficulty 档位映射（Main.cs:2764-2786）
// ===========================================================================
describe('Main.Difficulty 档位映射（Main.cs:2764-2786）', () => {
  it('我方 difficulty 0/1/2/3 → 原版 Classic/Expert/Master/Journey（滑杆缺省 0.5×）', () => {
    expect(mainDifficulty(worldOf(0))).toBeCloseTo(GDL.CLASSIC, 6);
    expect(mainDifficulty(worldOf(1))).toBeCloseTo(GDL.EXPERT, 6);
    expect(mainDifficulty(worldOf(2))).toBeCloseTo(GDL.MASTER, 6);
    // ★GameMode==3（旅程）不走 Expert/Master 分支；Difficulty 由
    //   _gameModeDifficultyOverride（Main.cs:17238-17248 旅程强度滑杆，缺省 0 → 0.5）
    //   注入——旅程世界 NPC 半强度是原版真实缺省（2026-08-14 建模，此前误按经典档）
    expect(mainDifficulty(worldOf(3))).toBeCloseTo(GDL.JOURNEY, 6);
  });
  it('getGoodWorld（for the worthy）整体 +1 档（:2783-2785）：经典 FTW = 专家手感', () => {
    const w = worldOf(0, { getGoodWorld: true });
    expect(mainDifficulty(w)).toBeCloseTo(GDL.EXPERT, 6);
    expect(mainExpertMode(w)).toBe(true);      // Main.expertMode（:2762）
    expect(mainMasterMode(w)).toBe(false);
    const wm = worldOf(2, { getGoodWorld: true });
    expect(mainDifficulty(wm)).toBeCloseTo(4, 6);   // 大师 FTW = Legendary 档
    expect(mainMasterMode(wm)).toBe(true);
  });
});

// ===========================================================================
// 3. 通用怪四档数值（ScaleStats_ByDifficulty + Tweaks，NPC.cs:18106-18447）
//    算例：僵尸 type 3（lifeMax 45 / damage 14 / defense 6 / kb 0.5 / value 60）
// ===========================================================================
describe('僵尸 type 3 四档强度（NPC.cs:18106-18447）', () => {
  const mk = () => stat(3, { lifeMax: 45, damage: 14, defense: 6, knockBackResist: 0.5, value: 60 });

  it('经典档：全部倍率恒 1，数值不变', () => {
    const s = mk(); scaleStats(s, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.CLASSIC });
    expect(s.lifeMax).toBe(45); expect(s.damage).toBe(14);
    expect(s.defense).toBe(6); expect(s.value).toBe(60);
    expect(s.knockBackResist).toBeCloseTo(0.5, 6);
    expect(s.difficulty).toBeCloseTo(GDL.CLASSIC, 6);
  });
  it('专家档：hp 45×2=90 / damage 14×2=28 / value 60×2.5=150 / kb 0.5×0.9=0.45', () => {
    const s = mk(); scaleStats(s, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.EXPERT });
    expect(s.lifeMax).toBe(90);      // (int)(45×2)，无 Tweaks 分支
    expect(s.damage).toBe(28);       // (int)(14×2)
    expect(s.value).toBe(150);       // (int)(60×2.5)
    expect(s.knockBackResist).toBeCloseTo(0.45, 6);
  });
  it('大师档：hp 45×3=135 / damage 14×3=42 / kb 0.5×0.8=0.4 / value 仍 2.5×', () => {
    const s = mk(); scaleStats(s, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.MASTER });
    expect(s.lifeMax).toBe(135);
    expect(s.damage).toBe(42);
    expect(s.value).toBe(150);
    expect(s.knockBackResist).toBeCloseTo(0.4, 6);
  });
  it('旅程世界（difficulty=3 → Difficulty=Journey 0.5）：hp 45×0.5=22 / damage 14×0.5=7', () => {
    const w = worldOf(3);
    const e = Enemy.fromVanilla(3, 0, 0)!;
    void w;
    // 旅程强度滑杆缺省 0 → 0.5×（ENEMY_MAX_LIFE/DAMAGE_MULTIPLIER 在 Journey 档输出 0.5）
    expect(e.hp).toBe(22); expect(e.maxHp).toBe(22);
    expect(e.def.damage).toBe(7); expect(e.def.defense).toBe(6);   // defense 无难度乘区
  });
  it('fromVanilla 端到端：专家世界僵尸 hp 90 / damage 28 / 承受击退比例 0.45', () => {
    worldOf(1);
    const e = Enemy.fromVanilla(3, 0, 0)!;
    expect(e.hp).toBe(90); expect(e.maxHp).toBe(90);
    expect(e.def.damage).toBe(28);
    expect(e.def.value).toBe(150);           // 击杀掉钱消费 def.value
    expect(e.def.knockbackResist).toBeCloseTo(0.45, 6);   // def 存原版承受比例(1−0.55=0.45;旧 0.55 是 1:1 换算前的错误期望,2026-08-13 修正)
    expect(e.difficulty).toBeCloseTo(GDL.EXPERT, 6);
    expect(e.baseDamage).toBe(14);           // 未缩放基线保留（弹幕出膛防双乘）
  });
});

// ===========================================================================
// 4. Boss 不豁免 ScaleStats（NPC.cs:18083 入口门无 boss 排除）
//    算例：克苏鲁之眼 type 4（lifeMax 2800 / damage 15 / defense 12 / value 30000）
//    Tweaks :18170-18173：num2=0.65、num3×=0.85（CommonMasterBossLifeReduction）
// ===========================================================================
describe('克苏鲁之眼 type 4（Boss 不豁免，NPC.cs:18106-18447）', () => {
  it('专家：hp (int)(2800×2)×0.65=3640 / damage (int)(15×2)=30（原版专家 EoC 3640 血）', () => {
    worldOf(1);
    const e = Enemy.fromVanilla(4, 0, 0)!;
    expect(e.maxHp).toBe(3640);
    expect(e.def.damage).toBe(30);
    expect(e.def.value).toBe(75000);   // 30000×2.5
  });
  it('大师：hp (int)(2800×3)×0.65×0.85=4641 / damage (int)(15×3)=45', () => {
    worldOf(2);
    const e = Enemy.fromVanilla(4, 0, 0)!;
    expect(e.maxHp).toBe(4641);
    expect(e.def.damage).toBe(45);
  });
  it('经典：2800 / 15 原值（Tweaks 系数在 Classic 档 Remap 恒 1）', () => {
    worldOf(0);
    const e = Enemy.fromVanilla(4, 0, 0)!;
    expect(e.maxHp).toBe(2800);
    expect(e.def.damage).toBe(15);
  });
});

// ===========================================================================
// 5. 专家×困难模式交叉（ScaleStats_ForExpertHardmode，NPC.cs:18448-18497）
//    杂兵兜底拉到 damage+defense+lifeMax/4 = 80（世花后 100）水位
// ===========================================================================
describe('ExpertHardmode 交叉（NPC.cs:18448-18497）', () => {
  const hm = { ...CLASSIC_SCALE_WORLD, difficulty: GDL.EXPERT, hardMode: true };

  it('僵尸（强度水位 14+6+11=31 < 80）：先拉水位再乘难度 → hp 254 / damage 64 / defense 15', () => {
    // 水位：num3=80/31=2.5806452 → damage=(int)(14×num3×0.9)=32、defense=(int)(6×num3)=15、
    //       lifeMax=(int)((45×num3)×1.1)=127、value=(int)((60×num3)×0.8)=123
    // 再 ByDifficulty：hp=(int)(127×2)=254、damage=(int)(32×2)=64、value=(int)(123×2.5)=307
    const s = stat(3, { lifeMax: 45, damage: 14, defense: 6, knockBackResist: 0.5, value: 60 });
    scaleStats(s, hm);
    expect(s.lifeMax).toBe(254);
    expect(s.damage).toBe(64);
    expect(s.defense).toBe(15);
    expect(s.value).toBe(307);
  });
  it('downedPlantBoss 阈值 80→100（:18481-18483）：hp 318 / damage 80 / defense 19', () => {
    // num3=100/31=3.2258065 → damage=(int)(14×num3×0.9)=40、defense=(int)(6×num3)=19、
    // lifeMax=(int)((45×num3)×1.1)=159 → ×2 → hp 318、damage 80
    const s = stat(3, { lifeMax: 45, damage: 14, defense: 6, knockBackResist: 0.5, value: 60 });
    scaleStats(s, { ...hm, downedPlantBoss: true });
    expect(s.lifeMax).toBe(318);
    expect(s.damage).toBe(80);
    expect(s.defense).toBe(19);
  });
  it('Boss 与 ≥1000 血怪豁免水位增强（:18469-18474）：EoC 专家困难=纯专家 3640', () => {
    worldOf(1, { hardMode: true });
    const e = Enemy.fromVanilla(4, 0, 0)!;
    expect(e.maxHp).toBe(3640);   // 与第 4 节专家档（非困难）一致 → ForExpertHardmode 未生效
  });
  it('DontDoHardmodeScaling 名单豁免（NPCID.cs:4440）：饥饿者 115 专家困难不吃水位', () => {
    // 115 在名单内 → flag2=false 提前 return；随后 ByDifficulty+Tweaks：
    //   hp=(int)(240×2)×0.7=336、damage=(int)(30×2)=60、Tweaks 专家防+6 → 16
    const s = stat(115, { lifeMax: 240, damage: 30, defense: 10, knockBackResist: 1.1 });
    scaleStats(s, hm);
    expect(s.lifeMax).toBe(336);
    expect(s.damage).toBe(60);
    expect(s.defense).toBe(16);
  });
  it('ProjectNPC 豁免水位段的防/血/钱（:18487-18492 只乘 damage）：25 号弹体', () => {
    // 水位段：damage=(int)(30×(80/30)×0.9)=72，defense/lifeMax/value 不动（lifeMax 仍 1）；
    // ByDifficulty：弹体不缩 life/value → damage=(int)(72×2)=144，lifeMax 不落 6 下限
    const s = stat(25, { lifeMax: 1, damage: 30, defense: 0, knockBackResist: 0 });
    scaleStats(s, hm);
    expect(s.damage).toBe(144);
    expect(s.lifeMax).toBe(1);     // ProjectileNPC → :18096 下限 6 也跳过
    expect(s.defense).toBe(0);
  });
});

// ===========================================================================
// 6. 入口门与 lifeMax 下限（NPC.cs:18083-18104）
// ===========================================================================
describe('ScaleStats 入口门（NPC.cs:18083）', () => {
  it('friendly / townNPC / damage=0 的 NPC 不进门：difficulty 保持 0、数值原样', () => {
    const bunny = stat(46, { lifeMax: 5, damage: 0, defense: 0, value: 0 });
    scaleStats(bunny, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.MASTER });
    expect(bunny.difficulty).toBe(0);
    expect(bunny.lifeMax).toBe(5);
    const guide = stat(17, { lifeMax: 250, damage: 0, defense: 15, value: 0, friendly: true, townNPC: true });
    scaleStats(guide, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.MASTER });
    expect(guide.difficulty).toBe(0);
    expect(guide.lifeMax).toBe(250);
  });
  it('缩放后 lifeMax<6 的非弹体 NPC 落 6 下限（:18096-18100，全难度生效）', () => {
    // 入口门要求 lifeMax>5 → 原值 1 的弹体类永远进不来；下限只在缩放【后】触发生效：
    // 旅程强度覆写 0.5（Main.cs:17245 旅程滑杆语义，ScaleStats 第 2 参 strengthOverride）
    // 10 血僵尸 → (int)(10×0.5)=5 → 落 6
    const s = stat(3, { lifeMax: 10, damage: 14, defense: 6, knockBackResist: 0.5 });
    scaleStats(s, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.CLASSIC }, null, 0.5);
    expect(s.lifeMax).toBe(6);
    // ProjectNPC 不吃下限：25 号 1 血保持 1（白名单进门、缩放不动 life）
    const p = stat(25, { lifeMax: 1, damage: 30, defense: 0, knockBackResist: 0 });
    scaleStats(p, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.CLASSIC }, null, 0.5);
    expect(p.lifeMax).toBe(1);
  });
  it('NeedsExpertScaling 白名单无视通用门（NPCID.cs:4799）：lifeMax=1 仍进缩放', () => {
    // 25 在白名单（弹体 NPC）：damage 照缩、life/value 不缩
    const s = stat(25, { lifeMax: 1, damage: 30, defense: 0, knockBackResist: 0 });
    scaleStats(s, { ...CLASSIC_SCALE_WORLD, difficulty: GDL.MASTER });
    expect(s.difficulty).toBeCloseTo(GDL.MASTER, 6);
    expect(s.damage).toBe(90);     // (int)(30×3)
    expect(s.lifeMax).toBe(1);
  });
});

// ===========================================================================
// 7. 玩家受伤倍率：敌对弹幕命中乘区（Projectile.cs:13770）+ 弹体出膛 lerp
// ===========================================================================
describe('玩家受伤倍率（Projectile.cs:264/544 + :13770）', () => {
  it('hostileProjectileDamage：经典 ×1 / 专家 ×2 / 大师 ×3 / 旅程世界（滑杆缺省 0.5 档）×0.5', () => {
    expect(hostileProjectileDamage(22, GDL.CLASSIC)).toBe(22);
    expect(hostileProjectileDamage(22, GDL.EXPERT)).toBe(44);
    expect(hostileProjectileDamage(22, GDL.MASTER)).toBe(66);
    // 旅程滑杆缺省 0 → Difficulty 0.5 → 22×0.5=11（2026-08-14 建模旅程强度滑杆）
    expect(hostileProjectileDamage(22, mainDifficulty(worldOf(3)))).toBe(11);
  });
  it('毁灭者激光 GetAttackDamage_ForProjectiles(22,18)（NPC.cs:7031/50223）：经典 22 / 专家 18 / 大师钳 18', () => {
    expect(getAttackDamageForProjectiles(22, 18, GDL.CLASSIC)).toBe(22);
    expect(getAttackDamageForProjectiles(22, 18, GDL.EXPERT)).toBe(18);
    expect(getAttackDamageForProjectiles(22, 18, GDL.MASTER)).toBe(18);   // Remap 默认 clamped
    // 出膛 18 × 命中乘区 2 = 36：专家档激光实际打玩家 36（与原版 22/36/54 一致）
    expect(hostileProjectileDamage(getAttackDamageForProjectiles(22, 18, GDL.EXPERT), GDL.EXPERT)).toBe(36);
    expect(hostileProjectileDamage(getAttackDamageForProjectiles(22, 18, GDL.MASTER), GDL.MASTER)).toBe(54);
  });
  it('饥饿者 GetAttackDamage_ScaledByDifficulty（NPC.cs:7015/:26333-26341）：45→专家 90 / 60→大师 180', () => {
    expect(getAttackDamageScaledByDifficulty(45, GDL.CLASSIC)).toBe(45);
    expect(getAttackDamageScaledByDifficulty(45, GDL.EXPERT)).toBe(90);
    expect(getAttackDamageScaledByDifficulty(60, GDL.MASTER)).toBe(180);
    expect(getAttackDamageScaledByDifficulty(60, GDL.EXPERT)).toBe(120);
  });
});

// ===========================================================================
// 8. 专家持械僵尸替换生成表（NPC.cs:4565/:4624/:4644；GetZombieSettings :5495-5523
//    spawnArmedZombies 仅 skyblock+未破肉前 Boss 置 false → 本仓无 skyblock 恒真）
// ===========================================================================
describe('专家持械僵尸生成表（NPC.cs:4565/4624/4644）', () => {
  /** 地表夜·普通草地落点（绕开冰面/墓地/雨夜分支）刷 n 轮，统计 baseId */
  function rollNights(difficulty: number, n: number): Map<number, number> {
    const w = worldOf(difficulty);
    const sp = new VanillaSpawner(w);
    const s = sp as unknown as Record<string, unknown>;
    s.spawnTileX = 100; s.spawnTileY = 99; s.spawnTileType = TILE_BY_KEY['grass']!;
    s.surfaceSpawn = true; s.waterTile = false; s.noWorms = false;
    s.dayTime = false; s.ZoneGraveyard = false;
    w.clock.timeOfDay = 0;    // 深夜（isDay=false）
    const ids = new Map<number, number>();
    for (let k = 0; k < n; k++) {
      const e = (sp as unknown as { spawnAnNPC: (rng: RNG) => { vanillaId: number | null } | null })
        .spawnAnNPC(new RNG(k * 7919 + 13));
      if (e && e.vanillaId != null) ids.set(e.vanillaId, (ids.get(e.vanillaId) ?? 0) + 1);
    }
    return ids;
  }

  it('专家夜：持械僵尸 430-436 与火把持械 591 进池（:4624/:4644）', () => {
    const ids = rollNights(1, 4000);
    const armed = [430, 432, 433, 434, 435, 436].filter((id) => ids.has(id));
    expect(armed.length).toBeGreaterThanOrEqual(2);      // 多个 style 命中
    expect(armed.every((id) => [430, 432, 433, 434, 435, 436].includes(id))).toBe(true);
    expect(ids.has(591)).toBe(true);                     // 火把僵尸持械变体
  });
  it('专家夜：zombieStyle==1 不出持械变体（:4644 门 zombieStyle!=1）', () => {
    // 统计里不应出现 431（style 1 的持械映射不存在——switch 缺省 430 只在 style 0 命中）
    const ids = rollNights(1, 4000);
    expect(ids.has(431)).toBe(false);   // 431 仅冰面分支（:4565），草地夜不产生
  });
  it('经典夜：持械变体全缺席（590 照刷）', () => {
    const ids = rollNights(0, 4000);
    for (const id of [430, 431, 432, 433, 434, 435, 436, 591]) {
      expect(ids.has(id)).toBe(false);
    }
    expect(ids.has(590)).toBe(true);    // 经典火把僵尸
  });
  it('专家冰面：1/2 → Armed Zombie 431（:4565），否则 Frozen Zombie 161', () => {
    const w = worldOf(1);
    const sp = new VanillaSpawner(w);
    const s = sp as unknown as Record<string, unknown>;
    s.spawnTileX = 100; s.spawnTileY = 99; s.spawnTileType = TILE_BY_KEY['ice']!;
    s.surfaceSpawn = true; s.waterTile = false; s.noWorms = false;
    s.dayTime = false; s.ZoneGraveyard = false;
    w.clock.timeOfDay = 0;
    let armed = 0, frozen = 0, other = 0;
    for (let k = 0; k < 600; k++) {
      const e = (sp as unknown as { spawnAnNPC: (rng: RNG) => { vanillaId: number | null } | null })
        .spawnAnNPC(new RNG(k * 104729 + 7));
      if (!e || e.vanillaId == null) continue;
      if (e.vanillaId === 431) armed++;
      else if (e.vanillaId === 161) frozen++;
      else other++;
    }
    // ~600 轮里 ~500 到达冰面分支（其余被更早的恶魔眼等链前支消耗），
    // 431/161 大致对半（:4565 的 1/2 门）
    expect(armed).toBeGreaterThan(100);
    expect(frozen).toBeGreaterThan(100);
    expect(armed + frozen).toBeGreaterThan(other);
  });
});

// ===========================================================================
// 9. fromVanilla 缩放不入存档语义（WorldFile.SaveNPCs :1703-1746 只存城镇 NPC 的
//    active/netID/position）——缩放值每次生成现场重算，断言两次生成结果一致
// ===========================================================================
describe('存档兼容：缩放运行时重算（WorldFile.cs:1703-1746）', () => {
  it('同一专家世界两次 fromVanilla 数值一致（无存档持久化依赖）', () => {
    worldOf(1);
    const a = Enemy.fromVanilla(3, 0, 0)!;
    const b = Enemy.fromVanilla(3, 0, 0)!;
    expect(b.maxHp).toBe(a.maxHp);
    expect(b.def.damage).toBe(a.def.damage);
    expect(b.def.value).toBe(a.def.value);
    expect(a.maxHp).toBe(90);
  });
  it('未绑定世界（CLASSIC_SCALE_WORLD 缺省）：经典档数值，历史行为不变', () => {
    bindScaleStatsWorld(null);
    const e = Enemy.fromVanilla(3, 0, 0)!;
    expect(e.maxHp).toBe(45);
    expect(e.def.damage).toBe(14);
  });
});

// ===========================================================================
// 10. 专家 Boss 分支（bossAI.ts / bossAI_wof.ts ↔ NPC.cs:32537-32914 / 26299-26496）
// ===========================================================================
function makeGame(w: World, list: unknown[] = []) {
  return {
    world: w,
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: (en: unknown, bucket: string) => { if (bucket !== 'projectiles') list.push(en); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as never;
}

/** 假玩家（AI 只读 x/y/w/h/cx/cy/dead） */
function fakePlayer(x: number, y: number): Player {
  return { x: x - 10, y: y - 21, w: 20, h: 42, cx: x, cy: y, vx: 0, vy: 0, dead: false } as unknown as Player;
}
void ({} as GameHooks);

describe('克脑专家分支（NPC.cs:32537-32827 / 32828-32914）', () => {
  it('getGoodWorld 首帧生成 40 只爬行者（GetBrainOfCthuluCreepersCount :51330-51338）', () => {
    const w = worldOf(0, { getGoodWorld: true });
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const brain = Enemy.fromVanilla(266, 100 * 16, 100 * 16)!;
    list.push(brain);
    brainOfCthulhuAI(brain, game, null);
    expect((list as Enemy[]).filter((n) => n.vanillaId === 267).length).toBe(40);
    // 普通经典世界 20 只（:51337 兜底）
    const w2 = worldOf(0);
    const list2: unknown[] = [];
    brainOfCthulhuAI(Enemy.fromVanilla(266, 100 * 16, 100 * 16)!, makeGame(w2, list2), null);
    expect((list2 as Enemy[]).filter((n) => n.vanillaId === 267).length).toBe(20);
  });
  it('玩家离猩红（!ZoneCrimson）→ 下坠逃离尾段（:32810-32826）：vy 累计 + ai0=2', () => {
    const w = worldOf(0);
    w.scene = { ...EMPTY_SCENE, zoneCrimson: false };
    const list: unknown[] = [];
    const brain = Enemy.fromVanilla(266, 100 * 16, 100 * 16)!;
    brain.bInit = true; brain.ai0 = 0;
    list.push(brain);
    brainOfCthulhuAI(brain, makeGame(w, list), fakePlayer(brain.cx, brain.cy));
    expect(brain.ai0).toBe(2);
    expect(brain.spawnAlpha).toBe(10);
    // 玩家在猩红内 → 不触发逃离（爬行者在场保持一阶段 ai0=0；首帧先让 AI 自建 20 只）
    const w2 = worldOf(0);
    w2.scene = { ...EMPTY_SCENE, zoneCrimson: true };
    const list2: unknown[] = [];
    const brain2 = Enemy.fromVanilla(266, 100 * 16, 100 * 16)!;
    brain2.ai0 = 0;
    list2.push(brain2);
    brainOfCthulhuAI(brain2, makeGame(w2, list2), fakePlayer(brain2.cx, brain2.cy));
    expect(brain2.ai0).toBe(0);
  });
  it('爬行者扑咬态专家追踪（:32872-32886）：经典档直飞不动、专家向玩家拐弯', () => {
    // 经典：velocity 原样（0 保持 0）
    const wc = worldOf(0);
    const cc = Enemy.fromVanilla(267, 0, 0)!;
    cc.ai0 = 1; cc.master = Enemy.fromVanilla(266, 0, 0)!;
    cc.vx = 0; cc.vy = 0;
    creeperAI(cc, makeGame(wc), fakePlayer(300, 0));
    expect(cc.vx).toBe(0); expect(cc.vy).toBe(0);
    // 专家：dir=朝玩家单位向量×9，v=(0×99+dir)/100 → |v|=0.09 且指向玩家
    const we = worldOf(1);
    const ce = Enemy.fromVanilla(267, 0, 0)!;
    ce.ai0 = 1; ce.master = Enemy.fromVanilla(266, 0, 0)!;
    ce.vx = 0; ce.vy = 0;
    creeperAI(ce, makeGame(we), fakePlayer(300, 0));
    expect(ce.vx).toBeCloseTo(9 / 100, 6);   // 单位向量(1,0)×9/100
    expect(ce.vy).toBe(0);
  });
  it('爬行者直冲门专家双掷（:32857-32869）：专家命中率 ≈1.5% 显著高于经典 0.5%', () => {
    const run = (difficulty: number): number => {
      const w = worldOf(difficulty);
      let hits = 0;
      for (let k = 0; k < 30000; k++) {
        const c = Enemy.fromVanilla(267, 0, 0)!;
        c.ai0 = 0; c.master = Enemy.fromVanilla(266, 0, 0)!;   // 距主体 0 ≤ 90 → 走掷骰段
        c.vx = 0; c.vy = 0;
        creeperAI(c, makeGame(w), fakePlayer(300, 0));
        if (c.ai0 === 1) hits++;
      }
      return hits;
    };
    const expert = run(1), classic = run(0);
    // 期望 ~450（1/100+(99/100)(1/200)≈1.5%）vs ~150（1/200）；界限留足掷骰抖动余量
    expect(expert).toBeGreaterThan(300);
    expect(classic).toBeLessThan(300);
    expect(expert).toBeGreaterThan(classic * 2);
  });
});

describe('饥饿者专家分支（NPC.cs:26308-26358 / 26423-26474）', () => {
  /** 墙血 <75% → num416=45 档。经典：damage 45 / defense 20；专家：damage 90 / defense 回基线 */
  function runHungry(difficulty: number): Enemy {
    const w = worldOf(difficulty);
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const head = Enemy.fromVanilla(113, 100 * 16, 150 * 16)!;
    const hungry = Enemy.fromVanilla(115, 100 * 16, 140 * 16)!;
    head.id = 1; hungry.id = 2;
    hungry.ai3 = head.id; hungry.ai0 = 0.5; hungry.bInit = true;
    head.hp = head.maxHp * 0.6;                       // <75% 档（:26322-26332）
    list.push(head, hungry);
    hungryAI(hungry, game, fakePlayer(120 * 16, 140 * 16));
    return hungry;
  }
  it('经典档：<75% 血 → damage=45（ScaledByDifficulty 经典=原值）、defense=20（:26322-26335）', () => {
    const h = runHungry(0);
    expect(h.def.damage).toBe(45);
    expect(h.def.defense).toBe(20);
  });
  it('专家档：damage=(int)(45×2)=90（:26341）、defense=defDefense 回基线 16（:26337-26339）', () => {
    // defDefense = ScaleStats 后的 115 基线防 10 + Tweaks 专家 +6（:18293-18297）= 16
    const h = runHungry(1);
    expect(h.def.damage).toBe(90);
    expect(h.def.defense).toBe(16);
  });
  it('专家档步进加成：<75% 血 num414=0.1+0.033（:26329-26332），环绕段 vy 朝玩家爬升', () => {
    // 经典档 num414=0.1（半径被改 500）；专家档步进 0.133 更快逼近玩家锚点——
    // 用两 tick 的 vy 增量对比（hungry 挂点 ai0=0.5，玩家在其上方 → vy 递增）
    const w = worldOf(1);
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const head = Enemy.fromVanilla(113, 100 * 16, 150 * 16)!;
    const hungry = Enemy.fromVanilla(115, 100 * 16, 140 * 16)!;
    head.id = 1; hungry.id = 2;
    hungry.ai3 = head.id; hungry.ai0 = 0.5; hungry.bInit = true;
    head.hp = head.maxHp * 0.6;
    list.push(head, hungry);
    const before = hungry.vy;
    hungryAI(hungry, game, fakePlayer(120 * 16, 100 * 16));
    // 步进幅度 = num414 = 0.1+0.033（:26332；符号取决于锚点侧，本假宿主未跑墙 AI
    // 初始化 wofDrawAreaTop/Bottom → 取绝对值断言幅度）
    expect(Math.abs(hungry.vy - before)).toBeCloseTo(0.1 + 0.033, 5);
  });
});

// ===========================================================================
// 11. 星光斗篷/蜂巢反击的世界难度倍率（Player.cs:37861-37866 / 37884-37891）
//     —— Main.masterMode ×3 / Main.expertMode ×2（×1.5），getGoodWorld 抬档同生效
// ===========================================================================
describe('受击反击件难度倍率门（Main.cs:2760/2762）', () => {
  it('经典 FTW 世界（getGoodWorld 抬档）按专家结算：expertMode=true', () => {
    const w = worldOf(0, { getGoodWorld: true });
    expect(mainExpertMode(w)).toBe(true);
    expect(mainMasterMode(w)).toBe(false);
  });
  it('大师世界 masterMode=true（星光 75×3=225 / 蜂 13×2=26）', () => {
    const w = worldOf(2);
    expect(mainMasterMode(w)).toBe(true);
    expect(75 * (mainMasterMode(w) ? 3 : mainExpertMode(w) ? 2 : 1)).toBe(225);  // Player.cs:37861-37866
    expect(Math.trunc(13 * (mainMasterMode(w) ? 2 : mainExpertMode(w) ? 1.5 : 1))).toBe(26);  // :37884-37891 + (int):37899
  });
  it('专家世界：星光 75×2=150 / 蜂 13×1.5=19.5→(int)19', () => {
    const w = worldOf(1);
    expect(75 * (mainMasterMode(w) ? 3 : mainExpertMode(w) ? 2 : 1)).toBe(150);
    expect(Math.trunc(13 * (mainMasterMode(w) ? 2 : mainExpertMode(w) ? 1.5 : 1))).toBe(19);
  });
});

// ===========================================================================
// 12. SetDefaults 尾段种子档调整族（NPC.cs:17774-17885 + 三私有方法）
//     FTW=getGoodAdjustments / celebrationmk10=getTenthAnniversaryAdjustments /
//     getfixedboi=getZenithSeedAdjustmentsBeforeEverything（先于 getGood）
//     ★扩盒语义：与专家档 Tweaks"只缩贴图不扩盒"相反——命中分支连碰撞盒一起改，
//     两级 (int) 截断（:17745 基扩盒后再 ×scaleNew :18025-18026/:17861-17862）
//     数值全部按原版公式手算（ftw 经典世界 = Main.Difficulty 2 专家档）
// ===========================================================================
describe('getGoodAdjustments 整族（NPC.cs:17874-18027）', () => {
  it('245 石巨人 FTW：scale×0.5 → 盒 140→70 / hp (15000×2)×0.75=22500 / dmg (72×2)×0.8=115', () => {
    worldOf(0, { getGoodWorld: true });
    const e = Enemy.fromVanilla(245, 0, 0)!;
    expect(e.w).toBe(70); expect(e.h).toBe(70);
    expect(e.vanillaScale).toBeCloseTo(0.5, 6);       // 渲染乘区 = 总scale/基scale
    expect(e.maxHp).toBe(22500);   // lifeMax 1456 终值 15000(曾 9000=1405 旧值,2026-08-19)
    expect(e.def.damage).toBe(115);
    expect(e.def.defense).toBe(26);                   // getGood 对 245 无防改
  });
  it('266 克脑 FTW：防 (int)(14×1.5)=21 / 伤基线 (int)(30×1.2)=36 → 缩放 (36×2)×0.9=65', () => {
    worldOf(0, { getGoodWorld: true });
    const e = Enemy.fromVanilla(266, 0, 0)!;
    expect(e.baseDamage).toBe(30);                    // defDamage 快照(:17749)在 getGood 之前
    expect(e.def.defense).toBe(21);
    expect(e.def.damage).toBe(65);
    expect(e.w).toBe(176); expect(e.h).toBe(121);     // 160/110 ×1.1 两级截断
    expect(e.vanillaScale).toBeCloseTo(1.1, 6);
    expect(e.maxHp).toBe(2125);                       // (1250×2)×0.85
  });
  it('113 血肉墙 FTW：s0=1.2 族二次乘盒 120×0.78=93 / hp (12000×2)×0.7=16800', () => {
    worldOf(0, { getGoodWorld: true });
    const e = Enemy.fromVanilla(113, 0, 0)!;
    expect(e.w).toBe(93); expect(e.h).toBe(93);
    expect(e.vanillaScale).toBeCloseTo(0.65, 5);      // (1.2×0.65)/1.2
    expect(e.maxHp).toBe(16800);                      // (8000×1.5=12000)×2×0.7
    expect(e.def.defense).toBe(21);                   // 12+3(getGood)+6(Tweaks :18293)
  });
  it('39-41 族 FTW+remix：scale=1.1f 赋值×1.2 → 盒 22×1.32=29 / hp (250+150)×2=800', () => {
    worldOf(0, { getGoodWorld: true, remix: true });
    const e = Enemy.fromVanilla(39, 0, 0)!;
    expect(e.w).toBe(29); expect(e.h).toBe(29);
    expect(e.vanillaScale).toBeCloseTo(1.32, 5);
    expect(e.maxHp).toBe(800);
    expect(e.def.damage).toBe(68);                    // (30+4)×2，无 Tweaks 分支
    expect(e.def.defense).toBe(16);                   // 10+2+4(remix)
    worldOf(0, { getGoodWorld: true });               // 无 remix：1.1 赋值 → 盒 24
    expect(Enemy.fromVanilla(39, 0, 0)!.w).toBe(24);
  });
  it('zenith(getfixedboi) hp×0.8 先于 getGood（:17774-17777）', () => {
    const s: SeedAdjustStats = { type: 127, scale: 1, lifeMax: 28000, defense: 24, damage: 47 };
    const m = applySeedAdjustments(s, {
      zenithWorld: true, getGoodWorld: true, tenthAnniversaryWorld: false, remixWorld: false,
    });
    expect(m).toBe(true);
    expect(s.lifeMax).toBe(22400);                    // trunc(28000×0.8)，先于 getGood 乘区
    expect(s.scale).toBeCloseTo(1.1, 6);              // 127-131 ×1.1
    // zenith 单独（无 getGood）：非 125-131/139 族不命中
    const s2: SeedAdjustStats = { type: 3, scale: 1, lifeMax: 45, defense: 6, damage: 14 };
    expect(applySeedAdjustments(s2, {
      zenithWorld: true, getGoodWorld: false, tenthAnniversaryWorld: false, remixWorld: false,
    })).toBe(false);
    expect(s2.lifeMax).toBe(45);
  });
  it('tenthAnniversary 与 getGood else-if 互斥 + 未列族二次乘盒（史莱姆王 50：122×1.25=152）', () => {
    worldOf(0, { getGoodWorld: true, tenthAnniversary: true });   // getGood 胜出
    expect(Enemy.fromVanilla(13, 0, 0)!.w).toBe(51);              // FTW ×1.35（非十周年 ×0.5=19）
    worldOf(0, { tenthAnniversary: true });
    expect(Enemy.fromVanilla(13, 0, 0)!.w).toBe(19);              // 十周年 ×0.5
    expect(Enemy.fromVanilla(13, 0, 0)!.vanillaScale).toBeCloseTo(0.5, 6);
    expect(Enemy.fromVanilla(50, 0, 0)!.w).toBe(152);             // 未列族 s=1.25 二次乘盒（原版怪癖）
    expect(Enemy.fromVanilla(50, 0, 0)!.vanillaScale).toBe(1);    // 贴图不变（scale 未改）
  });
  it('非种子世界：普通经典 245 盒 140 / 266 盒 160（既有 round 路径不变）', () => {
    worldOf(0);
    expect(Enemy.fromVanilla(245, 0, 0)!.w).toBe(140);
    expect(Enemy.fromVanilla(266, 0, 0)!.w).toBe(160);
    expect(Enemy.fromVanilla(245, 0, 0)!.vanillaScale).toBe(1);
  });
});
