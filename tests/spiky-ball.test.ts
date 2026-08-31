// 尖刺球(185)物理回归:aiStyle14 缺省尾(1458 P.cs:25441-25453,块尾终端 :25624)
// + type185 反弹响应(Update :19818-19826)+ 整盒分轴探针(B 档清偿 2026-08-31)。
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

describe('尖刺球 185 物理对拍(aiStyle14 缺省尾 1458 真值)', () => {
  it('SetDefaults:14×14 / timeLeft 900 / penetrate -1 数据档', () => {
    const { game } = makeWorld();
    const s = new TrapShot(0, 0, 0, 0, 40, 'spiky');
    void game;
    expect(s.w).toBe(14); expect(s.h).toBe(14); expect(s.life).toBe(900);
    expect(s.pierceLeft).toBe(Infinity);   // SetDefaults penetrate=-1(:2719-2728)
    expect(s.windowGate).toBe(true);       // ≠1 → Damage 尾梯免工件窗启用
  });

  it('重力 0.2 且 ai[0]>5 门控(前 5 更新无重力),终端速度 16', () => {
    const { game } = makeWorld();
    const s = new TrapShot(60 * 16, 10 * 16, 1, 0.5, 40, 'spiky');
    // 前 5 更新:仅积分位移,无重力
    for (let t = 0; t < 5; t++) s.fixedUpdate(1, game);
    expect(s.vy).toBeCloseTo(0.5, 5);
    s.fixedUpdate(1, game);                // 第 6 更新:vy += 0.2
    expect(s.vy).toBeCloseTo(0.7, 5);
    s.vy = 20;                             // 终端钳 16(:25624 块尾恒跑)
    s.fixedUpdate(1, game);
    expect(s.vy).toBe(16);
  });

  it('滚转 rotation += vx*0.1 每拍(含 ai[0]≤5 首段)', () => {
    const { game } = makeWorld();
    const s = new TrapShot(60 * 16, 10 * 16, 2, 0.5, 40, 'spiky');
    const r0 = (s as unknown as { rot: number }).rot;
    s.fixedUpdate(1, game);
    expect((s as unknown as { rot: number }).rot).toBeCloseTo(r0 + 2 * 0.1, 5);  // :25452
  });

  it('贴地摩擦 vx*0.97(仅 vy==0 且 vx≠0)+ |vx|≤0.01 静止截停归零(不 Kill)', () => {
    const { game } = makeWorld();
    // 放到地面之上让它自然落定
    const s = new TrapShot(60 * 16, 99 * 16, 3, 0, 40, 'spiky');
    for (let t = 0; t < 12 && !s.dead; t++) s.fixedUpdate(1, game);
    expect(s.vy).toBe(0);                          // 落定不微弹(lastVy≤1 → vy=0)
    for (let t = 0; t < 300 && !s.dead; t++) s.fixedUpdate(1, game);
    if (!s.dead) expect(s.vx).toBe(0);             // :25449-25453 截停置 0(非 Kill)
  });

  it('落地反弹系数 0.9,低速(lastVy≤1)落定不微弹', () => {
    const { game } = makeWorld();
    const s = new TrapShot(60 * 16, 90 * 16, 0.3, 0, 40, 'spiky');
    let prevVy = 0;
    let flips = 0;
    for (let t = 0; t < 300; t++) {
      s.fixedUpdate(1, game);
      if (s.dead) break;
      if (prevVy > 0 && s.vy < 0) {
        expect(s.vy).toBeCloseTo(-0.9 * (prevVy + 0.2), 5);   // 重力后按 0.9 弹回(:19823-19826)
        flips++;
      }
      prevVy = s.vy;
    }
    expect(flips).toBeGreaterThanOrEqual(2);
  });

  it('撞墙 X 轴反弹 −0.9×0.97(弹前当拍仍吃贴地摩擦)', () => {
    const { game } = makeWorld();
    const s = new TrapShot(52 * 16, 98 * 16, -3, 0, 40, 'spiky');
    let ratio = 0;
    for (let t = 0; t < 60; t++) {
      const px = s.vx;
      s.fixedUpdate(1, game);
      if (px < 0 && s.vx > 0) { ratio = s.vx / (-px); break; }
    }
    expect(ratio).toBeGreaterThan(0.85);           // ≈0.9(不再叠旧 ×0.95)
    expect(ratio).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it('整盒分轴探针:中心格悬空但盒缘入墙时同样被挡(B-M 清偿场景)', () => {
    const st2 = new TileStore(160, 160);
    for (let y = 100; y <= 104; y++) for (let x = 0; x < 160; x++) st2.setTile(x, y, GRANITE);
    // 凸出块占 (64,96):球心所在格 (64,98) 为空、球上缘探进 96 行 → 整盒命中
    st2.setTile(64, 96, GRANITE);
    const game2 = {
      world: { store: st2 },
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => [], playSfx: () => {}, spawnParticles: () => {},
    } as unknown as GameHooks;
    const s = new TrapShot(64 * 16 + 1, 96 * 16 + 2, 4, 0, 40, 'spiky');
    const xBefore = s.x;
    s.fixedUpdate(1, game2);
    expect(s.x).toBe(xBefore);                     // X 步被整盒取消
    expect(s.vx).toBeLessThan(0);                  // 反射 −lastVx×0.9(:19819-19821)
  });
});
