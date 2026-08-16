// 水中跳跃原版对齐（Player.cs JumpMovement :20384-20510 + 重力链 :24130-24155，
// 2026-08-16 对齐批）：
// ① 起跳门 = vy==0（踩底/水行站立）或脚蹼族湿态任意时刻，均须按键边沿——
//   头露出水面【不是】起跳条件（踩水悬停 vy≠0 跳不出去，旧自制门已废）
// ② 水中跳 = -6.01 + jumpHold 30 平台段（湿/干同链 sustain 钉速）
// ③ 液体参数档：水 0.2/5 / 蜂蜜 0.1/3（跳参数保持干燥档）/ 人鱼 0.3/7 /
//   三叉戟 0.25/6 + 5.51/25（↑键 0.1/2 浮升）
// ④ 基础玩家无水中上浮输入（无脚蹼只下沉）——旧 accel 游泳已废
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

const hooks = (w: World, p?: Player): GameHooks => ({
  world: w, player: p, enemies: () => [], critters: () => [],
  spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
  cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
  spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
  playSfxFiles: () => {}, showPickupLabel: () => {},
}) as never;

/** 水池世界：底部实心行 y=70，y 50-69 灌水（liquidType 1） */
function poolWorld(liquid = 1): World {
  const w = new World(80, 90, 11, 'pool');
  for (let x = 0; x < 80; x++) {
    w.store.setTileSilent(x, 70, 1);
    for (let y = 50; y < 70; y++) w.store.setLiquid(x, y, 255, liquid);
  }
  return w;
}

function settle(w: World, p: Player, ticks = 400): void {
  for (let i = 0; i < ticks; i++) p.fixedUpdate(1 / 60, hooks(w, p));
}

describe('水中跳跃原版对齐（JumpMovement :20405-20496）', () => {
  it('踩底起跳：vy==0 + 按键边沿 → -6.01 + jumpHold 30（水档 :24154-24155）', () => {
    const w = poolWorld();
    const p = new Player(40 * 16, 55 * 16, new Inventory());
    p.inputJump = false;
    settle(w, p);                       // 沉底 vy==0
    expect(p.inWater).toBe(true);
    expect(p.vy).toBe(0);
    p.inputJump = true;                 // 边沿
    p.fixedUpdate(1 / 60, hooks(w, p));
    // 起跳 -6.01 后本 tick 重力 +0.2 → -5.81；sustain 钉回 -6.01（同帧 sustain 在后）
    expect(p.vy).toBeCloseTo(-6.01, 5);
    expect(p.jumpHold).toBe(30);
    p.inputJump = false;
  });

  it('按住跳平台段：30t 内 vy 恒钉 -6.01（:20391 每 tick 重置；2026-08-16 前水下丢平台段）', () => {
    const w = poolWorld();
    const p = new Player(40 * 16, 55 * 16, new Inventory());
    p.inputJump = false;
    settle(w, p);
    p.inputJump = true;
    p.fixedUpdate(1 / 60, hooks(w, p));
    for (let i = 0; i < 29; i++) {
      p.fixedUpdate(1 / 60, hooks(w, p));
      expect(p.vy).toBeCloseTo(-6.01, 5);   // 钉速不衰减
    }
    expect(p.jumpHold).toBe(0);              // 30 tick 耗尽
    p.inputJump = false;
  });

  it('踩水悬停（头露出、vy≠0、无脚蹼）：按跳不起跳——原版水面无起跳权（旧自制门行为）', () => {
    const w = poolWorld();
    const p = new Player(40 * 16, 55 * 16, new Inventory());
    p.inputJump = false;
    settle(w, p, 30);                   // 下沉途中（vy>0，头可能在水面上下）
    const vy0 = p.vy;
    p.inputJump = true;                 // 边沿但 vy≠0 且无脚蹼 → 门不过
    p.fixedUpdate(1 / 60, hooks(w, p));
    // 无起跳：vy 只受重力推进（+0.2；且无旧 accel 游泳的 -0.62）
    expect(p.vy).toBeCloseTo(vy0 + 0.2, 4);
    expect(p.jumpHold).toBe(0);
    p.inputJump = false;
  });

  it('基础玩家无水中上浮输入：按住跳 vy 不减（旧 0.62 accel 游泳已废）', () => {
    const w = poolWorld();
    const p = new Player(40 * 16, 55 * 16, new Inventory());
    p.inputJump = false;
    settle(w, p, 30);
    const vy0 = p.vy;
    p.inputJump = true;
    p.fixedUpdate(1 / 60, hooks(w, p));
    expect(p.vy).toBeGreaterThanOrEqual(vy0);   // 只会更沉（+重力），绝不上浮
    p.inputJump = false;
  });

  it('水物理档：重力 0.2/终端 5（:24153-24155）', () => {
    const w = poolWorld();
    const p = new Player(40 * 16, 55 * 16, new Inventory());
    p.inputJump = false;
    settle(w, p, 200);
    expect(p.vy).toBeCloseTo(5.01, 4);          // maxFallSpeed 5 + 0.01
  });

  it('蜂蜜档：重力 0.1/终端 3（honeyWet :24133-24135），跳参数保持干燥档', () => {
    const w = poolWorld(3);
    const p = new Player(40 * 16, 55 * 16, new Inventory());
    p.inputJump = false;
    settle(w, p, 200);
    expect(p.inWater).toBe(true);       // inWater 含蜂蜜
    expect(p.vy).toBeCloseTo(3, 4);     // maxFall 3
    // 踩底跳：速度用干燥档（非 6.01）
    p.inputJump = true;
    p.fixedUpdate(1 / 60, hooks(w, p));
    expect(p.vy).toBeCloseTo(-(0.4 * 0.25 + 0 /* sustain 钉回 */) - 0.4 * 0.25, 3); // 钉干燥档后 +0.1 重力
    p.inputJump = false;
  });
});
