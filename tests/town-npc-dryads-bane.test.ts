// 树妖煞 DoT dps 进度链接错翻正（F11，2026-09-01）回归锚——
// 原版真值 Terarria1457/Terraria/NPC.cs:92898-92963 GetDryadsBaneDamagePerSecond
// （1458 同位同文；1456 同值内联 :92852-92904）：
//   num=4(:92900)；num2=1f(:92901) 后【独立 if 累加、无首中即停】——boss1/2/3/蜂后
//   各 +0.1f(:92902-92917)、hardMode +0.4f(:92918-92921)、皇后史莱姆/机械三王/
//   世花/石巨人/拜月教主/光女/猪鲨各 +0.15f(:92922-92957)、infectedSeed num×2
//   (:92958-92961)，外层 GetAttackDamage_ForTownNPC(:7089) 截断。
//   ★与 AI_007 自卫攻击链 townNpcProgressionBoost(:53400-53557) 是两条链：本链
//   无 combatBook/slimeKing/deerclops/tipsy/skyblock 条目。
// 本文件四组断言：
//  T① 三态表（任务单指定）：无进度基 4 / 全成就链尾 / infectedSeed ×2 + 难度轴抽查
//  T② float32 截断保真行：double 直算会偏一档的组合必须给原版大档值（禁近似）
//  T③ 反证例：「用过战斗书的世界 dps 不变」——旧误链会把双书世界算到 6
//  T④ 端到端：updateDryadWardAura 敌怪支按世界旗（flags/seedFlags mock）写入新链
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC, townNpcProgressionFromWorld, townNpcProgressionBoost } from '../src/entities/TownNPC';
import type { TownNpcProgression } from '../src/entities/TownNPC';
import { getDryadsBaneDamagePerSecond, dryadsBaneMultiplier } from '../src/stats/DryadsBane';
import { getAttackDamageForTownNPC, mainDifficulty } from '../src/stats/ScaleStats';
import type { GameHooks } from '../src/entities/types';

const F = 60;   // 地面行

/** 全成就 = 原文 :92902-:92957 十四项 downed/hardMode 全置位 */
const ALL_DOWNED = {
  downedBoss1: true, downedBoss2: true, downedBoss3: true, downedQueenBee: true,
  hardMode: true,
  downedQueenSlime: true, downedMechBoss1: true, downedMechBoss2: true,
  downedMechBoss3: true, downedPlantBoss: true, downedGolemBoss: true,
  downedAncientCultist: true, downedEmpressOfLight: true, downedFishron: true,
} as const;

describe('T① 三态表（NPC.cs:92898-92963 静态值金标，Classic×1 取整）', () => {
  it('无任何进度 → 基 4（:92900 num=4 × :92901 num2=1f → 曲线 Classic ×1）', () => {
    expect(getDryadsBaneDamagePerSecond({}, 1)).toBe(4);
    // 首段四王单独命中仍 <5.0 不跳档（+0.1f → 4.4000000…）：
    for (const p of [
      { downedBoss1: true }, { downedBoss2: true }, { downedBoss3: true },
      { downedQueenBee: true }, { downedQueenSlime: true },
    ] as const) {
      expect(getDryadsBaneDamagePerSecond(p, 1)).toBe(4);
    }
    // hardMode 单独 +0.4f → 5.600000…→(int)=5
    expect(getDryadsBaneDamagePerSecond({ hardMode: true }, 1)).toBe(5);
    expect(dryadsBaneMultiplier({ downedBoss1: true })).toBeCloseTo(1.1, 6);
  });

  it('全成就链尾：十四项全中乘区满档 → 12（无 infectedSeed）/ 25（infectedSeed ×2）', () => {
    // 全链尾乘区 ≈3.15000081（float32 累计）：4×3.15…=12.60→12；8×3.15…=25.20→25
    expect(getDryadsBaneDamagePerSecond(ALL_DOWNED, 1)).toBe(12);
    expect(getDryadsBaneDamagePerSecond({ ...ALL_DOWNED, infectedSeed: true }, 1)).toBe(25);
    // 仅 infectedSeed（无进度）：8.000000→8 —— ×2 表的中点态
    expect(getDryadsBaneDamagePerSecond({ infectedSeed: true }, 1)).toBe(8);
  });

  it('难度轴抽查：外层 GetAttackDamage_ForTownNPC(:7089) 曲线包裹（复用 ScaleStats）', () => {
    // 入参 = mainDifficulty 域（GDL.CLASSIC 1 / EXPERT 2 / MASTER 3 / LEGENDARY 4），
    // TownNPCDamageMultiplier 采出 ×1 / ×1.5 / ×1.75(Master 插值) / ×2
    for (const [d, base, seeded] of [[1, 12, 25], [2, 18, 37], [3, 22, 44], [4, 25, 50]] as const) {
      expect(getDryadsBaneDamagePerSecond(ALL_DOWNED, d)).toBe(base);
      expect(getDryadsBaneDamagePerSecond({ ...ALL_DOWNED, infectedSeed: true }, d)).toBe(seeded);
    }
  });
});

describe('T② float32 截断保真（禁近似——double 直算必偏的实证组合）', () => {
  // boss1+hardMode+queenSlime+mech1..mech3+plant：float32 逐项累计恰为 2.25f，
  // ×4=9.000000 → (int)=9；double 直算得 2.2499999999999996 → 8.9999…→8（偏一档）
  const WITNESS = {
    downedBoss1: true, hardMode: true, downedQueenSlime: true,
    downedMechBoss1: true, downedMechBoss2: true, downedMechBoss3: true,
    downedPlantBoss: true,
  };
  it('原版 float32 链给 9（double 近似实现会退化为 8 的组合）', () => {
    expect(dryadsBaneMultiplier(WITNESS)).toBeCloseTo(2.25, 6);
    expect(getDryadsBaneDamagePerSecond(WITNESS, 1)).toBe(9);
    // 反证：若把链跑成 double（无 fround）确实给 8——钉死「此差异真实存在」，
    // 防止未来有人"顺手"删 fround 而测试仍绿
    let dbl = 1;
    dbl += 0.1; dbl += 0.4; for (let i = 0; i < 5; i++) dbl += 0.15;
    expect(Math.trunc(4 * dbl)).toBe(8);
  });
});

describe('T③ 反证例：用过战斗书的世界 dps 不变（防回滚到 townNpcProgressionBoost 误链）', () => {
  it('combatBookWasUsed/combatBookVolumeTwoWasUsed 两书齐备仍基 4', () => {
    // 旧误链自卫攻击乘区 damageMul=1+.25+.25=1.5 → 旧 dps=6。先钉出旧行为值
    // 证明本反证例对回归敏感，再断言新链不受战斗书影响
    const bookWorld: TownNpcProgression = {
      combatBookWasUsed: true, combatBookVolumeTwoWasUsed: true,
      downedSlimeKing: false, downedBoss1: false, downedDeerclops: false, downedBoss2: false,
      downedBoss3: false, downedQueenBee: false, hardMode: false, downedQueenSlime: false,
      downedMechBoss1: false, downedMechBoss2: false, downedMechBoss3: false,
      downedPlantBoss: false, downedEmpressOfLight: false, downedFishron: false,
      downedGolemBoss: false, downedAncientCultist: false, skyblockLowTiles: false,
      tipsy: false,
    };
    const wrongOldDps = getAttackDamageForTownNPC(
      4 * townNpcProgressionBoost(bookWorld).damageMul, 1);
    expect(wrongOldDps).toBe(6);
    expect(getDryadsBaneDamagePerSecond(bookWorld, 1)).toBe(4);   // 新链不认任何书位
    expect(getDryadsBaneDamagePerSecond({}, 1)).toBe(4);
  });
});

// ---- 端到端：真 TownNPC.updateDryadWardAura + 世界旗 mock ----

function flatWorld(flags: Record<string, boolean> = {}, seed: Record<string, boolean> = {}): World {
  const world = new World(120, 120, 80, 'dryad-bane');
  Object.assign(world.flags, flags);
  Object.assign(world.seedFlags, seed);
  return world;
}

function makeGame(world: World, enemies: unknown[]): GameHooks {
  return {
    player: { x: -99999, y: -99999, w: 16, h: 24, cx: -99991, cy: -99987, dead: true },
    enemies: () => enemies,
    npcs: () => [],
    critters: () => [],
    spawnTownShot: () => {},
    spawnParticles: () => {},
    spawnBurst: () => {},
    playSfx: () => {},
    addDamageNumber: () => {},
    achievements: { notifyProgressionEvent: () => {} },
  } as never;
}

function foe(id = 1): Record<string, unknown> {
  return {
    x: 66 * 16, y: F * 16 - 40, w: 20, h: 40, cx: 66 * 16 + 10, cy: F * 16 - 20,
    dead: false, maxHp: 100, hp: 100, dontTakeDamage: false, vanillaId: id,
    dryadBaneT: 0, dryadBaneDoT: 0, dryadBaneDps: 0,
  };
}

function castWardAura(world: World, game: GameHooks, dryad: TownNPC): void {
  (dryad as never as { wardT: number }).wardT = 40;      // ≥30 且 %10==0 → 受理拍
  (dryad as never as { updateDryadWardAura(w: World, g: GameHooks): void })
    .updateDryadWardAura(world, game);
}

describe('T④ 端到端 updateDryadWardAura 敌怪支（Projectile.cs:41967-41970 else-if 臂 dps 面）', () => {
  it('空旗世界写入基 4（与 T① 金标恒等）', () => {
    const world = flatWorld();
    const e = foe();
    const game = makeGame(world, [e]);
    castWardAura(world, game, new TownNPC('dryad', 60 * 16, F * 16 - 56));
    expect(e.dryadBaneT).toBeGreaterThan(0);
    expect(e.dryadBaneDps).toBe(4);
  });

  it('world.flags 进度旗端到端换算：克眼+骷髅王+hardMode → 6（hardMode 主导档）', () => {
    const world = flatWorld({
      'downed_4': true,          // 克眼 → downedBoss1
      'downed_35': true,         // 骷髅王 → downedBoss3
      hardMode: true,
    });
    const e = foe();
    const progAura = townNpcProgressionFromWorld(world);
    expect(progAura.downedBoss1).toBe(true);           // 世界旗映射域自检
    expect(progAura.downedBoss3).toBe(true);
    const game = makeGame(world, [e]);
    castWardAura(world, game, new TownNPC('dryad', 60 * 16, F * 16 - 56));
    // 独立金标：1f+0.1f+0.1f+0.4f=float32 1.60000014…→×4=6.40000057→6
    expect(e.dryadBaneDps).toBe(6);
  });

  it('seedFlags.infectedSeed ×2："purify this" 种子基 8、双书干扰无效', () => {
    const world = flatWorld(
      { combatBookWasUsed: true, combatBookVolumeTwoWasUsed: true },   // 只喂自卫链的书位
      { infectedSeed: true });
    const e = foe();
    const game = makeGame(world, [e]);
    castWardAura(world, game, new TownNPC('dryad', 60 * 16, F * 16 - 56));
    // 4×2=8.000000→8；books 若被误接进链会是 4×1.5×2=12
    expect(e.dryadBaneDps).toBe(8);
  });

  it('全成就世界（flags 全量+seedFlags.infectedSeed）写链尾 25', () => {
    const world = flatWorld({
      'downed_4': true, 'downed_13': true, 'downed_35': true, 'downed_222': true,
      hardMode: true,
      'downed_657': true, 'downed_134': true, 'downed_125': true, 'downed_127': true,
      'downed_262': true, 'downed_245': true, 'downed_439': true,
      'downed_636': true, 'downed_370': true,
    }, { infectedSeed: true });
    const e = foe();
    const game = makeGame(world, [e]);
    castWardAura(world, game, new TownNPC('dryad', 60 * 16, F * 16 - 56));
    expect(e.dryadBaneDps).toBe(25);   // = getDryadsBaneDamagePerSecond(ALL|seed, classic)
  });

  it('重授窗内不写 dps（写回时机保持原语义：(dryadBaneT??0)>cur 才覆写）', () => {
    const world = flatWorld({ hardMode: true });     // 进度旗只影响数值不影响时机
    const e = foe();
    const game = makeGame(world, [e]);
    const dryad = new TownNPC('dryad', 60 * 16, F * 16 - 56);
    castWardAura(world, game, dryad);
    expect(e.dryadBaneDps).toBe(5);                  // hardMode 档金标
    const first = e.dryadBaneDps;
    (e as { dryadBaneT?: number }).dryadBaneT = 1.5; // >20t 余量（合并窗内）
    castWardAura(world, game, dryad);
    expect(e.dryadBaneT).toBe(1.5);                  // 未续时长
    expect(e.dryadBaneDps).toBe(first);              // 未覆写 dps
  });
});

// ============================================================================
// ★dryad census（2026-09-01 五轮轻验证收口批）——头注口径勘误的复算工具位：
//   「double 直算偏档率」的正确口径 = 2^14 进度乘区组合 × infectedSeed 两半
//   【双半空间合计】= 32,768 组合；double 链与 float32 链在 (int) 截断面上分歧
//   共 2,830 组 = 8.6365%（≈8.64%，旧注「约 17%」系单半空间粗估退役）。
//   复算路径 = 本 describe（vitest 纯函数域，零世界依赖）。
// ============================================================================
describe('★census：双半空间合计口径的偏档率复算（8.64%）', () => {
  const fround = Math.fround;
  const ADD_010 = fround(0.1), ADD_040 = fround(0.4), ADD_015 = fround(0.15);

  function multF32(bits: boolean[]): number {
    let n = 1;
    if (bits[0]) n = fround(n + ADD_010); if (bits[1]) n = fround(n + ADD_010);
    if (bits[2]) n = fround(n + ADD_010); if (bits[3]) n = fround(n + ADD_010);
    if (bits[4]) n = fround(n + ADD_040);
    for (let i = 5; i < 14; i++) if (bits[i]) n = fround(n + ADD_015);
    return n;
  }
  function multDbl(bits: boolean[]): number {
    let n = 1;
    if (bits[0]) n += 0.1; if (bits[1]) n += 0.1; if (bits[2]) n += 0.1; if (bits[3]) n += 0.1;
    if (bits[4]) n += 0.4;
    for (let i = 5; i < 14; i++) if (bits[i]) n += 0.15;
    return n;
  }
  // bit 序 ↔ DryadsBaneProgress 字段序：boss1/2/3/蜂后/hardMode/皇后/机1..3/世花/
  // 石巨人/拜月/光女/猪鲨

  it('32768 组合中 double 偏档恰 2830 组（8.64%）且见证组合 mask=1009 在案', () => {
    let diverge = 0, total = 0, mask1009f = -1, mask1009d = -1;
    for (const inf of [false, true]) {
      const base = inf ? 8 : 4;
      for (let m = 0; m < 16384; m++) {
        total++;
        const bits: boolean[] = [];
        for (let b = 0; b < 14; b++) bits.push(Boolean(m & (1 << b)));
        const dpsF = Math.trunc(fround(base * multF32(bits)));
        const dpsD = Math.trunc(base * multDbl(bits));
        if (m === 1009 && !inf) {   // boss1+hardMode+queenSlime+mech1..mech3+plant
          expect([base, dpsF]).toEqual([4, 9]);   // float32 链 = 原版大档 9
          expect(dpsD).toBe(8);                    // double 直算偏到 8（T② 同源见证）
          mask1009f = dpsF; mask1009d = dpsD;
        }
        if (dpsF !== dpsD) diverge++;
      }
    }
    expect(total).toBe(32768);
    expect(mask1009f).toBe(9);
    expect(mask1009d).toBe(8);
    expect(diverge).toBe(2830);                                // census 终值钉死
    expect((100 * diverge / total).toFixed(2)).toBe('8.64');   // 口径勘误后的标注值
  });
});
