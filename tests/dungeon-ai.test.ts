// 地牢 AI 族行为冒烟（AI_010 诅咒头骨 / AI_011 守卫 / AI_020 火轮 / AI_021 刺球）：
// tick 若干帧不抛异常 + 运动方向符合原版语义
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';

function makeWorld(): World {
  const w = new World(120, 120, 7, 'ai-test');
  const st = w.store;
  // 地面 y=100 一排实心
  for (let x = 0; x < 120; x++) { st.setTile(x, 100, 1); st.setTile(x, 101, 1); st.setTile(x, 102, 1); }
  return w;
}

function stubGame(world: World) {
  return {
    world,
    player: { cx: 80 * TILE, cy: 60 * TILE, x: 80 * TILE, y: 60 * TILE, w: 16, h: 28, hp: 100, maxHp: 100, dead: false, aabbOverlaps: () => false },
    playSfx: () => {},
    damagePlayer: () => {},
    spawnParticles: () => {},
  } as never;
}

function tick(e: Enemy, game: never, n: number) {
  for (let i = 0; i < n; i++) e.fixedUpdate(1 / 60, game);
}

describe('地牢 AI 族', () => {
  it('诅咒头骨(34)：向玩家飞行且速度上界合理', () => {
    const w = makeWorld();
    const e = Enemy.fromVanilla(34, 20 * TILE, 60 * TILE)!;
    tick(e, stubGame(w), 120);
    const d = Math.hypot(e.cx - 80 * TILE, e.cy - 60 * TILE);
    expect(d).toBeLessThan(Math.hypot(20 * TILE - 80 * TILE, 0)); // 向玩家靠近了
    expect(Math.hypot(e.vx, e.vy)).toBeLessThan(6);
  });

  it('地牢守卫(68)：恒速 8 追击 + 伤害 9999', () => {
    const w = makeWorld();
    const e = Enemy.fromVanilla(68, 20 * TILE, 60 * TILE)!;
    tick(e, stubGame(w), 30);
    expect(Math.abs(Math.hypot(e.vx, e.vy) - 8)).toBeLessThan(0.01);
    expect(e.def.damage).toBe(9999);
    expect(e.cx).toBeGreaterThan(20 * TILE); // 朝玩家(+x)移动
  });

  it('火轮(70)：首段竖直后转为水平弹跳，逐轴速度 ≤ 6×2.4', () => {
    const w = makeWorld();
    const e = Enemy.fromVanilla(70, 60 * TILE, 10 * TILE)!;
    tick(e, stubGame(w), 200);
    expect(Math.abs(e.vx) + Math.abs(e.vy)).toBeGreaterThan(1); // 在动
    // 原版速度档 ai[3]=1+Next(15)*0.1 ∈ [1.0,2.4]，逐轴限速（对角合成可达 √2×）
    const cap = 6 * 2.4 + 0.01;
    expect(Math.abs(e.vx)).toBeLessThanOrEqual(cap);
    expect(Math.abs(e.vy)).toBeLessThanOrEqual(cap);
  });

  it('刺球(72)：对角移动并在撞墙/撞地后反弹（vy 有翻转）', () => {
    const w = makeWorld();
    const e = Enemy.fromVanilla(72, 60 * TILE, 90 * TILE)!; // 地面上方
    const game = stubGame(w);
    let lastVy = Math.sign(e.vy || 6), flips = 0, moved = 0;
    for (let i = 0; i < 600; i++) {
      e.fixedUpdate(1 / 60, game);
      moved += Math.hypot(e.vx, e.vy);
      const s = Math.sign(e.vy);
      if (s !== 0 && s !== lastVy) { flips++; lastVy = s; }
    }
    expect(moved).toBeGreaterThan(600);       // 持续运动（≈6/tick）
    expect(flips).toBeGreaterThanOrEqual(1);  // 至少一次纵向反弹
  });
});
