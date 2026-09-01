// 肉山"狂卷之舌"拖拽回归（2026-09-01 用户报"跑到肉山背后会被触手抓回前面,我们有吗"）:
// 原版 Player.WOFTongue(:22449-22515 上舌门) + Player.Update 拖拽段(:27623-27662,
// tongued 时速度全覆写 → 拉向墙行进方向前缘 200px,11px/t、专家 lerp→22;到达松口)。
// 本仓 wofTongue(Player.ts)——★拖拽段曾整段缺失(只有上舌/伤害/死亡判定)。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { TILE } from '../src/core/constants';

const HELL = 4200;   // world.h（地狱带在 3950*16 以下）

function makeSetup() {
  const world = { difficulty: 0, h: HELL, w: 8400, lavaLine: 3600, flags: {}, journeyPowers: undefined };
  const wall = {
    dead: false, vanillaId: 113, x: 100 * TILE, y: 3900 * TILE, w: 20, h: 1200,
    cx: 100 * TILE + 10, cy: 4100 * TILE, facing: 1, vx: 2.4, vy: 0, difficulty: 0,
  };
  const player = new Player(96 * TILE, 4050 * TILE, new Inventory());
  const game = {
    world, wall,
    enemies: () => [wall],
    addDamageNumber: () => {},
    playSfxWav: () => {},
    playSfxFiles: () => {},
    spawnDust: () => null,
    spawnParticles: () => {},
  };
  return { player: player as never as Player & Record<string, any>, game: game as never, world, wall };
}

describe('肉山狂卷之舌拖拽（Player.cs:27623-27662）', () => {
  it('绕背(墙中心反向 40px 外)→ 上舌 38;拖拽速度指向前缘(墙前 200px),量级 11(经典)', () => {
    const { player, game } = makeSetup();
    player.buffs.apply(BuffType.Horrified, 10 / 60);           // gross 前置（原版 Horrified 在场才判 gross）
    player.x = 94 * TILE;                                      // 墙(100*16)西侧 96px = 背后
    (player as any).wofTongue(game, worldOf(game), 1 / 60);
    expect(player.buffs.has(BuffType.TheTongue)).toBe(true);   // 背后 → 上舌
    (player as any).wofTongue(game, worldOf(game), 1 / 60);
    expect(player.vx).toBeGreaterThan(0);                      // 被拽向东侧前缘
    expect(Math.hypot(player.vx, player.vy)).toBeCloseTo(11, 5); // 经典拖速 11px/t
  });

  it('拖到前缘 200px 带内(距离≤拖速)→ 舌头解除(拔河松口)', () => {
    const { player, game } = makeSetup();
    player.buffs.apply(BuffType.Horrified, 10 / 60);
    player.buffs.apply(BuffType.TheTongue, 10 / 60);
    // 目标 = (wall.cx+200, wall.cy);摆放玩家使距离 = 8px(<拖速 11) → 松口
    player.x = 100 * TILE + 192;                               // cx = 目标 X − 8
    player.y = 4100 * TILE - 21;                               // cy = 目标 Y(wall.cy)
    (player as any).wofTongue(game, worldOf(game), 1 / 60);
    expect(player.buffs.has(BuffType.TheTongue)).toBe(false);  // 到达松口
  });

  it('专家:拖速 lerp(11→22, 墙速/5)（墙速 2.4 → 11+11×0.48=16.28）', () => {
    const { player, game, world } = makeSetup();
    (world as any).difficulty = 1;
    player.buffs.apply(BuffType.Horrified, 10 / 60);
    player.buffs.apply(BuffType.TheTongue, 10 / 60);
    player.x = 90 * TILE;                                      // 远处 → 距离>拖速(匀速段)
    player.y = 4100 * TILE;
    (player as any).wofTongue(game, worldOf(game), 1 / 60);
    expect(Math.hypot(player.vx, player.vy)).toBeCloseTo(16.28, 1);
  });
});

function worldOf(game: { world: unknown }): unknown {
  return game.world;
}
