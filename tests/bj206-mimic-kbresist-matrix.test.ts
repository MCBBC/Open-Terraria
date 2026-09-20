// ★BJ206 2026-09-20（红蓝-N1 宝箱怪 473-476 kbResist 矩阵四件）
//
// 定谳（Terarria1457/Terraria/NPC.cs 亲读重定位）：
//   · [F-C] AI_087 头段 :37847 每 tick 写 knockBackResist =
//     GetKnockbackMultiplier_ScaledByDifficulty(0.2f)（:7058 = 0.2×难度系数），
//     每拍覆写 SetDefaults 0.1f（:14547）。本仓非零态落 null→def(0.1×K,ScaleStats
//     :687 已缩放) 恰为原版半额 → 修 = 头段写 0.2×K 习语（同 Enemy.ts :4684/:5882）。
//   · [F-A] 态 6（三连扑）体 :38101 knockBackResist=0f 整缺 → 补。
//   · [F-B] 态 2 空中支 else（:37924-37925）knockBackResist=0f 整缺 → 补。
//   · [F-D] 态 7（全玩家死亡僵坐,:38165-38174）defense=9999（:38169）整缺 → 补。
//   · 态 3/4/4.1/5 的 kbResist=0 原有接线保持（:37987/:38035+:38060/:38081）。
// 消费面：Enemy.hurt :14231 `kbResistOverride ?? def.knockbackResist`。
// 变异判别力：[F-C] 0.2→0.1 红（T2）/ [F-A] 摘态 6 红（T1）/ [F-B] 摘空中支写红（T3）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { bigMimicAI } from '../src/entities/bossAI_lunar_misc';
import { getKnockbackMultiplierScaledByDifficulty } from '../src/stats/ScaleStats';
import { Enemy } from '../src/entities/Enemy';
import type { Enemy as EnemyT } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function mkHooks(enemies: EnemyT[]) {
  const w = new World(120, 160, 1, 'mimic');
  // 高空测试带（行 20-100 清空）+ 底部地板行 110（bj175 同款）
  for (let x = 0; x < 120; x++) {
    for (let y = 20; y <= 100; y++) w.store.setTileSilent(x, y, 0, 0, 0);
    w.store.setTileSilent(x, 110, 1, 0, 0);
  }
  const player = new Player(60 * 16, 30 * 16, new Inventory());
  const hooks = {
    world: w,
    player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnDust: () => ({ x: 0, y: 0, vx: 0, vy: 0 }),
    playSfx: () => {},
    playSfxWav: () => {},
  };
  return { hooks: hooks as unknown as GameHooks, world: w, player };
}

function mkMimic(hooks: GameHooks, cx: number, cy: number): EnemyT {
  const e = Enemy.fromVanilla(475, cx, cy) as EnemyT;
  hooks.enemies().push(e);
  return e;
}

function tickAI(hooks: GameHooks, e: EnemyT, n: number): void {
  for (let i = 0; i < n; i++) bigMimicAI(e, hooks, hooks.player);
}

describe('BJ206 宝箱怪 kbResist 矩阵（AI_087 473-476）', () => {
  it('[F-A] 态 6 三连扑：kbResist=0（:38101,原整缺）', () => {
    const { hooks } = mkHooks([]);
    const e = mkMimic(hooks, 40 * 16, 30 * 16);
    e.ai0 = 6; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    tickAI(hooks, e, 2);
    expect(e.ai0).toBe(6);                       // 未换招（ai1 计数远小于 5）
    expect(e.kbResistOverride).toBe(0);
  });

  it('[F-C] 常规态（0/1/2 贴地/3）：kbResist=0.2×难度系数,不再半额落 def 0.1×K（:37847）', () => {
    const { hooks } = mkHooks([]);
    for (const st of [0, 1, 3]) {
      const e = mkMimic(hooks, 40 * 16, 30 * 16);
      e.ai0 = st; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
      tickAI(hooks, e, 2);
      expect(e.kbResistOverride).toBe(getKnockbackMultiplierScaledByDifficulty(0.2, e.difficulty));
      // 与旧缺陷形态（null→def=0.1×K）判别：严格大于且为 2 倍带（f32 舍入容差内）
      expect(e.kbResistOverride).toBeGreaterThan(e.def.knockbackResist);
      expect(e.kbResistOverride).toBeCloseTo(e.def.knockbackResist * 2, 5);
    }
  });

  it('[F-B] 态 2 空中支：kbResist=0（:37925,原整缺）;态 4/4.1/5 既有接线回归', () => {
    const { hooks } = mkHooks([]);
    const e = mkMimic(hooks, 40 * 16, 30 * 16);   // 半空出生 → 落地前走空中支
    e.ai0 = 2; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    e.onGround = false;
    tickAI(hooks, e, 1);
    expect(e.kbResistOverride).toBe(0);
    for (const st of [4, 4.1, 5]) {              // 既有三态恒 0 不回退
      const m = mkMimic(hooks, 40 * 16, 30 * 16);
      m.ai0 = st; m.ai1 = 0; m.ai2 = 0; m.ai3 = 0;
      tickAI(hooks, m, 1);
      expect(m.kbResistOverride).toBe(0);
    }
  });

  it('[F-D] 态 7 全玩家死亡僵坐：defense=9999（:38169,原整缺）+ 零伤满血', () => {
    const { hooks } = mkHooks([]);
    const e = mkMimic(hooks, 40 * 16, 30 * 16);
    e.ai0 = 7; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    tickAI(hooks, e, 2);
    expect(e.ai0).toBe(7);
    expect(e.def.defense).toBe(9999);
    expect(e.def.damage).toBe(0);
    expect(e.hp).toBe(e.maxHp);
  });
});
