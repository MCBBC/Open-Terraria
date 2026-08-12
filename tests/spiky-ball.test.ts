// 尖刺球(185)物理回归:aiStyle14 默认尾部(1405 :21600-21608)+ type185 反弹响应
// (1405 :13302-13307 / 1456 :18289-18297)——用户报告"放出后无反弹,只沉降"的修复锚点。
import { describe, it, expect } from 'vitest';
import { TrapShot } from '../src/entities/Dart';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const GRANITE = TILE_BY_KEY['v_368_granite_block'];

function makeWorld(): { st: TileStore; game: GameHooks } {
  const st = new TileStore(160, 160);
  // 地面:y=100..104 全实心;左墙 x=50;右墙 x=70
  for (let y = 100; y <= 104; y++) for (let x = 0; x < 160; x++) st.setTile(x, y, GRANITE);
  for (let y = 0; y <= 99; y++) { st.setTile(50, y, GRANITE); st.setTile(70, y, GRANITE); }
  const game = {
    world: { store: st },
    player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
    enemies: () => [],
    playSfx: () => {}, spawnParticles: () => {}, addDamageNumber: () => {},
  } as unknown as GameHooks;
  return { st, game };
}

describe('尖刺球 185 物理对拍(aiStyle14 + 碰撞响应)', () => {
  it('SetDefaults:14×14 / timeLeft 900', () => {
    const { game } = makeWorld();
    const s = new TrapShot(0, 0, 0, 0, 40, 'spiky');
    void game;
    expect(s.w).toBe(14); expect(s.h).toBe(14); expect(s.life).toBe(900);
  });

  it('重力 0.3/tick + 横向摩擦 0.98 + 终端 15.9', () => {
    const { game } = makeWorld();
    const s = new TrapShot(60 * 16, 10 * 16, 1, 0, 40, 'spiky');
    const vy0 = s.vy, vx0 = s.vx;
    s.fixedUpdate(1, game);
    // vy: 0 +0.3;vx: 1*0.98
    expect(s.vy).toBeCloseTo(vy0 + 0.3, 5);
    expect(s.vx).toBeCloseTo(vx0 * 0.98, 5);
    s.vy = 20;
    s.fixedUpdate(1, game);
    expect(s.vy).toBe(15.9);
  });

  it('落地反弹系数 0.9(非 0.4),低速不微弹', () => {
    const { game } = makeWorld();
    // 从 y=90*16 下落,记录每次触地反弹后的 vy
    const s = new TrapShot(60 * 16, 90 * 16, 0.3, 0, 40, 'spiky');
    const bounces: number[] = [];
    let prevVy = 0;
    for (let t = 0; t < 300; t++) {
      s.fixedUpdate(1, game);
      if (s.dead) break;
      // 反弹瞬间:vy 由正转负
      if (prevVy > 0 && s.vy < 0) bounces.push(-s.vy / prevVy);
      prevVy = s.vy;
    }
    expect(bounces.length).toBeGreaterThanOrEqual(2);         // 至少两跳(0.4 系数时几乎只剩一跳)
    for (const r of bounces) expect(r).toBeCloseTo(0.9, 3);    // 系数 0.9
  });

  it('最终落定:vy==0 贴地且位置稳定,vx 持续衰减不死亡', () => {
    const { game } = makeWorld();
    const s = new TrapShot(60 * 16, 90 * 16, 0.5, 0, 40, 'spiky');
    for (let t = 0; t < 700; t++) s.fixedUpdate(1, game);
    expect(s.dead).toBe(false);          // timeLeft 900,700 tick 仍在
    expect(s.vy).toBe(0);               // 贴地不微弹(lastVy<=1 → vy=0)
    const y0 = s.y;
    for (let t = 0; t < 10; t++) s.fixedUpdate(1, game);
    expect(s.y).toBe(y0);               // 落定不再移动(垂直)
    expect(Math.abs(s.vx)).toBeLessThan(0.2);  // 0.95×0.98 摩擦滚停中
  });

  it('撞墙 X 轴反弹 -0.9,不衰减水平动量成 0.7', () => {
    const { game } = makeWorld();
    // 贴地滚向左墙 x=50(实心列),观察 vx 翻转
    const s = new TrapShot(52 * 16, 98 * 16, -3, 0, 40, 'spiky');
    let flipped = 0;
    for (let t = 0; t < 60; t++) {
      const px = s.vx;
      s.fixedUpdate(1, game);
      if (px < 0 && s.vx > 0) { flipped = s.vx / (-px); break; }
    }
    expect(flipped).toBeCloseTo(0.9, 3);
  });
});
