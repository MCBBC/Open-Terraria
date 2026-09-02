// AI_112 仙灵 583-585 行为回归（2026-09-02 动画七修批）:
//  D7 aiInit 曾无条件清 ai2/ai3 → 野生引导态(ai[2]=2,NPC.cs:3615-3623 预置)
//  首帧即被抹回 0 = 引导链死码、fairyAge 永不累计。
//  D8 状态 1 撞墙折返（cs:48663-48668 collideX→direction*-1+vx=dir×2）曾缺。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

function makeGame(): GameHooks {
  const world = new World(96, 48, 7, 'fairy-ai112');
  world.groundLevel = 16;
  world.rockLevel = 32;
  return {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

const drive = (e: Enemy, g: GameHooks, p: Player | null) =>
  (e as unknown as Record<string, (g: GameHooks, p: Player | null) => void>).fairyAI.call(e, g, p);

function mkPlayer(x: number, y: number): Player {
  return { x, y, w: 20, h: 42, cx: x + 10, cy: y + 21, dead: false, vx: 0, vy: 0 } as unknown as Player;
}

function mkFairy(id: 583 | 584 | 585, tx = 40, ty = 20): Enemy {
  const e = Enemy.fromVanilla(id, tx * 16, ty * 16);
  if (!e) throw new Error(`fairy ${id} 构造失败`);
  return e;
}

describe('AI_112 仙灵（583-585）', () => {
  it('D7 引导态存活:预置 ai[2]=2 首帧不被 aiInit 清零（cs:48621 锚点仅补零值）', () => {
    const g = makeGame();
    const f = mkFairy(583);
    f.ai2 = 2;                                   // VanillaSpawner 野生预置(:2448)
    drive(f, g, null);
    expect(f.aiInit).toBe(true);
    expect(f.ai2).toBe(2);                       // 曾被清回 0
    expect(f.noTileCollide).toBe(true);          // 引导态穿墙位已生效
    // 寿命门随 ai[2]>1 恢复累计（cs:48610 localAI[1]++）
    f.fairyAge = 17999;
    drive(f, g, null);
    expect(f.fairyAge).toBe(18000);
    drive(f, g, null);
    expect(f.ai2).toBe(7);                       // 期满 → 状态 7 飞离
  });

  it('D8 状态 1 撞墙折返:collideX→direction 反转+vx=新向×2（cs:48663-48665）', () => {
    const g = makeGame();
    const f = mkFairy(584);
    f.ai2 = 1;
    f.facing = 1;
    f.vx = 4; f.vy = 0;
    f.hitWall = true;                            // 上一 tick X 碰撞位（本仓 hitWall）
    drive(f, g, mkPlayer(f.x + 500, f.y));
    expect(f.facing).toBe(-1);
    // 折返置 −2 后同 tick X 渐近步进 −0.04（cs:48670-48672,|vx|<4.5 档）
    expect(f.vx).toBeCloseTo(-2.04, 5);
    // 撞顶反向:collideY → vy=碰撞前方向（cs:48666-48668,preCollideVy 快照）
    const f2 = mkFairy(585);
    f2.ai2 = 1;
    f2.facing = 1; f2.vx = 3; f2.vy = 0;
    f2.preCollideVy = -2.5;                      // 上一 tick 碰撞前上行
    f2.collideY = true;
    drive(f2, g, mkPlayer(f2.x + 500, f2.y));
    // 反向置 −1 后同 tick 前方扫描全清 +0.05（cs:48718-48720）= −0.95
    expect(f2.vy).toBeCloseTo(-0.95, 5);
  });
});
