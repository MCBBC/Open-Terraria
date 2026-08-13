// EoC 冲刺单积分回归(用户报"二阶段冲刺速度差距大"):
//   根因 = eocAI 尾部自己 x+=vx + 通用物理段 noTileCollide 分支再积分 = 双倍速
//   (P2 单冲 6.8→13.6、连冲 20→40px/t 像瞬移)。断言:P2 冲刺期每 tick 位移
//   ≈6.8px(经典档,state1 赋速后前 40t 无摩擦),而非 13.6(双积分)。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 300;
function world(): World {
  const w = new World(W, H, 11, 'eoc-speed');
  w.groundLevel = 60; w.rockLevel = 150;
  w.clock.timeOfDay = 0.9;   // 夜间(DAWN=0.1875/DUSK=0.8125;0.3 是白天会走漂离分支)
  return w;
}
function hooks(w: World, p: Player, enemies: Enemy[]): GameHooks {
  return {
    world: w, player: p,
    enemies: () => enemies, critters: () => [],
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

describe('EoC P2 冲刺速度(AI_004 :20452-20478 6.8px/t 单积分)', () => {
  it('state1 赋速 → state2 每 tick 位移 ≈6.8(非双积分 13.6)', () => {
    const w = world();
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const e = Enemy.fromVanilla(4, 100 * TILE, 95 * TILE)!;
    e.hp = e.maxHp * 0.9;
    const enemies = [e];
    const h = hooks(w, p, enemies);
    e.ai0 = 3; e.state = 1; e.ai2 = 0; e.chargesLeft = 0;
    e.fixedUpdate(1, h);                    // state1:赋速 6.8 朝玩家 → state2
    expect(e.state).toBe(2);
    const speed = Math.hypot(e.vx, e.vy);
    expect(speed).toBeGreaterThan(6.3);
    expect(speed).toBeLessThan(7.3);        // 经典单冲初速 6.8(带伺服残速微量)
    const x0 = e.x, y0 = e.y;
    e.fixedUpdate(1, h);                    // state2 第 1 tick(前 40t 无摩擦)
    const d1 = Math.hypot(e.x - x0, e.y - y0);
    expect(d1).toBeGreaterThan(6.3);        // 单积分 ≈6.8;双积分 ≈13.6
    expect(d1).toBeLessThan(7.6);
    // 5 tick 平均仍在 ~6.8(40t 内无摩擦)
    const x1 = e.x, y1 = e.y;
    for (let i = 0; i < 5; i++) e.fixedUpdate(1, h);
    const avg = Math.hypot(e.x - x1, e.y - y1) / 5;
    expect(avg).toBeGreaterThan(6.0);
    expect(avg).toBeLessThan(7.6);
  });
});
