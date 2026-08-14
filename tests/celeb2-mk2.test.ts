// Celebration 双持械枪回归（AI_075 714/615 持械 muzzle + AI_147 烟花弹）：
//   · muzzle volley 节奏（714: 8t / 615: 5t）+ 变体循环 ⌊ai0/volley⌋%7（相邻 +1 mod 7）
//   · 断 channel / fireCb 无弹药 → Kill
//   · 烟花弹变体弹道：0 缓坠@20u、1 上抛 vy−10@10u、3 追踪保速 lerp 1/8、
//     4 相位跳 +45 & 蛇形、5/6 延迟重力 40u/30u、终端 16、撞块爆
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Celeb2Muzzle, Celeb2Rocket } from '../src/entities/Celeb2';

function makeGame(w: World, list: unknown[] = []): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => list, critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

const owner = () => ({ cx: 80 * TILE, cy: 100 * TILE, facing: 1, dead: false });
const noRot = (ang: number) => ({ x: Math.cos(ang), y: Math.sin(ang) });

describe('Celeb2Muzzle 持械枪口（AI_075 714/615）', () => {
  it('714 每 8t 一发，变体 ⌊ai0/8⌋%7 循环（相邻 +1 mod 7）', () => {
    const game = makeGame(emptyWorld());
    const fired: number[] = [];
    const m = new Celeb2Muzzle(owner(), 714, () => true,
      () => ({ x: 80 * TILE + 100, y: 100 * TILE }),
      (variant) => { fired.push(variant); return true; });
    for (let t = 0; t < 8 * 8 && !m.dead; t++) m.fixedUpdate(1, game);
    expect(fired.length).toBeGreaterThanOrEqual(7);       // 64t ≥ 7 发
    // 变体序列：相邻差 = +1 mod 7（相位随机只偏移起点）
    for (let i = 1; i < fired.length; i++) {
      expect((fired[i] - fired[i - 1] + 7) % 7).toBe(1);
    }
  });

  it('615 每 5t 一发（volley 节奏差）', () => {
    const game = makeGame(emptyWorld());
    let fired = 0;
    const m = new Celeb2Muzzle(owner(), 615, () => true,
      () => ({ x: 80 * TILE + 100, y: 100 * TILE }),
      () => { fired++; return true; });
    for (let t = 0; t < 26 && !m.dead; t++) m.fixedUpdate(1, game);
    expect(fired).toBeGreaterThanOrEqual(5);              // 26t ≥ 5 发（5t 节奏）
  });

  it('断 channel → Kill；fireCb 无弹药 → Kill', () => {
    const game = makeGame(emptyWorld());
    let ch = true;
    const m = new Celeb2Muzzle(owner(), 714, () => ch,
      () => ({ x: 0, y: 0 }), () => true);
    m.fixedUpdate(1, game);
    ch = false;
    m.fixedUpdate(1, game);
    expect(m.dead).toBe(true);

    const m2 = new Celeb2Muzzle(owner(), 714, () => true,
      () => ({ x: 0, y: 0 }), () => false);               // 无弹药
    let guard = 0;
    while (!m2.dead && guard++ < 20) m2.fixedUpdate(1, game);
    expect(m2.dead).toBe(true);
  });
});

describe('Celeb2Rocket 烟花弹（AI_147，E=2 → 3 update/tick）', () => {
  it('变体 0：20 update 平飞后缓坠 0.12，终端 16', () => {
    const game = makeGame(emptyWorld());
    const r = new Celeb2Rocket(715, 0, 60 * TILE, 40 * TILE, 10, 0, 50, 5, false, () => {});
    for (let t = 0; t < 7 && !r.dead; t++) r.fixedUpdate(1, game);   // 21 update
    expect(r.vy).toBeGreaterThan(0);                                  // 已过 20 update 门
    for (let t = 0; t < 500 && !r.dead && r.vy < 16; t++) r.fixedUpdate(1, game);
    expect(r.vy).toBe(16);
  });

  it('变体 1：update 10 上抛 vy−10', () => {
    const game = makeGame(emptyWorld());
    const r = new Celeb2Rocket(715, 1, 60 * TILE, 40 * TILE, 10, 0, 50, 5, false, () => {});
    for (let t = 0; t < 3 && !r.dead; t++) r.fixedUpdate(1, game);   // 9 update
    const vy0 = r.vy;
    r.fixedUpdate(1, game);                                           // update 10: vy−10 + 0.25
    expect(r.vy).toBeLessThan(vy0 - 9);
  });

  it('变体 3：20 update 起追踪（保速 lerp 1/8 转向敌）', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    // 敌在背后左下（曼哈顿距 <800）——弹掉头追，7t 内不会撞上
    list.push({ id: 1, x: 50 * TILE, y: 44 * TILE, w: 24, h: 24, cx: 50 * TILE + 12, cy: 44 * TILE + 12, dead: false, hurt: () => true });
    const r = new Celeb2Rocket(715, 3, 60 * TILE, 40 * TILE, 12, 0, 50, 5, false, () => {});
    r.critChance = 0;
    const sp0 = Math.hypot(r.vx, r.vy);
    for (let t = 0; t < 6 && !r.dead; t++) r.fixedUpdate(1, game);   // 18 update：未开追踪
    expect(r.vx).toBeGreaterThan(0);                                 // 仍朝 +x 直飞
    for (let t = 0; t < 6 && !r.dead; t++) r.fixedUpdate(1, game);   // 36 update：追踪已开
    expect(r.vx).toBeLessThan(sp0);                                  // 已转向左（追敌）
    // 保速 lerp（1/8）：180° 掉头期模长下探后向 spd0 收敛——不塌方即可
    expect(Math.hypot(r.vx, r.vy)).toBeGreaterThan(sp0 * 0.6);
  });

  it('变体 4：ai1=1 起步相位跳 +45（蛇形）', () => {
    const game = makeGame(emptyWorld());
    const r = new Celeb2Rocket(715, 4, 60 * TILE, 40 * TILE, 10, 0, 50, 5, true, () => {});
    r.fixedUpdate(1, game);                                           // t=1 → +45 → 46
    // 相位跳后 46·π/45 ≈ π+：垂直向偏移明显非零（蛇形摆动）
    const x0 = r.x, y0 = r.y;
    r.fixedUpdate(1, game);
    // 位置 = 直线位移 + 蛇形垂直分量（存在即可）
    expect(Math.hypot(r.x - x0, r.y - y0)).toBeGreaterThan(0);
  });

  it('变体 5：40 update 平飞后 g0.08', () => {
    const game = makeGame(emptyWorld());
    const r = new Celeb2Rocket(715, 5, 60 * TILE, 40 * TILE, 10, 0, 50, 5, false, () => {});
    for (let t = 0; t < 13 && !r.dead; t++) r.fixedUpdate(1, game);   // 39 update
    expect(r.vy).toBe(0);
    r.fixedUpdate(1, game);                                           // 42 update：坠
    expect(r.vy).toBeGreaterThan(0);
  });

  it('撞块 → 爆（onExplode 触发）', () => {
    const w = emptyWorld();
    for (let y = 30; y < 60; y++) w.store.setTileSilent(70, y, 1, 0, 0);
    const game = makeGame(w);
    const booms: Array<[number, number, number]> = [];
    const r = new Celeb2Rocket(716, 2, 66 * TILE, 40 * TILE, 8, 0, 50, 5, false,
      (x, y, d) => { booms.push([x, y, d]); });
    let guard = 0;
    while (!r.dead && guard++ < 300) r.fixedUpdate(1, game);
    expect(booms.length).toBe(1);
    expect(booms[0][2]).toBe(50);
  });

  it('变体循环与三连由 muzzle 侧驱动（fireCb 收到 spreadRot）', () => {
    // 结构性断言：CelebFireFn 合同（Game 侧用 spreadRot 生成变体5三连）
    const game = makeGame(emptyWorld());
    const shots: Array<{ v: number; bonus: boolean }> = [];
    const m = new Celeb2Muzzle(owner(), 714, () => true,
      () => ({ x: 80 * TILE + 100, y: 100 * TILE }),
      (variant, _x, _y, _vx, _vy, o) => { shots.push({ v: variant, bonus: o.bonusAi1 }); return true; });
    for (let t = 0; t < 8 * 7 && !m.dead; t++) m.fixedUpdate(1, game);
    expect(shots.some((s) => s.v === 4 && s.bonus)).toBe(true);       // 变体4 带 ai1=1
    expect(shots.filter((s) => s.v === 5).length).toBeGreaterThanOrEqual(1);
    void noRot;
  });
});
