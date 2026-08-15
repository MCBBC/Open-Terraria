// 默认移速对账（2026-08-16 审计）：裸装水平链 1:1 Player.HorizontalMovement
// （:19559-19800）+ 每 tick reset（:24094-24100）。
// 黄金标准 = 原版算法在本测试内逐 tick 复算（同 float64），断言我方 Player.vx
// 全程逐 tick 相等 + 位移一致：
//   · 常量：maxRunSpeed=3 / runAcceleration=0.08 / runSlowdown=0.2 /
//     accRunSpeed=3（:24099 = maxRunSpeed 裸值，moveSpeed 乘区 :25694-25695 在后）
//   · 两段：|vx|<3 → +0.08（反向先 ±0.2 制动）；3≤|vx|<3（裸=死档）；
//     越帽 → 摩擦回落（地面 −0.2 钳 0）→ 锯齿均值 ≈2.93（15mph 真实纹理）
//   · 裸装【不得】跑到 6（曾 `|| 6` = 极速翻倍 30mph——本次审计修的根因）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';

function makeGame(w: World): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

function flatWorld(): World {
  // 宽 480 格（7680px）——靴族长跑 ~1.5 万 px 不撞边界（120 格世界会在 t~200 撞墙掉速）
  const w = new World(480, 80, 30, 'open');
  for (let x = 0; x < 480; x++) { w.store.setTileSilent(x, 70, 1, 0, 0); w.store.setTileSilent(x, 71, 1, 0, 0); }
  return w;
}

/** 原版 HorizontalMovement 裸装复算（hold=+1/-1/0）——黄金标准 */
function vanillaStep(vx: number, hold: number, grounded: boolean): number {
  const maxRun = 3, accRun = 3, acc = 0.08, slow = 0.2;
  if (hold !== 0) {
    if (hold > 0 ? vx < maxRun : vx > -maxRun) {
      if (hold > 0 ? vx < -slow : vx > slow) vx += hold * slow;
      vx += hold * acc;
    } else if (hold > 0 ? vx < accRun : vx > -accRun) {
      vx += hold * acc * 0.2;   // 裸装死档（accRun==maxRun），保完整性
    } else {
      vx = friction(vx, grounded, slow);
    }
  } else {
    vx = friction(vx, grounded, slow);
  }
  return vx;
}
function friction(vx: number, grounded: boolean, slow: number): number {
  const fr = grounded ? slow : slow * 0.5;
  if (vx > fr) return vx - fr;
  if (vx < -fr) return vx + fr;
  return 0;
}

function step(p: Player, game: GameHooks) { p.fixedUpdate(1 / 60, game); }

describe('默认移动速度对账（实现）', () => {
  it('持右 240t：vx 逐 tick = 原版复算；极速不超 3.05；末段锯齿均值 ≈2.9-3.0', async () => {
    const game = makeGame(flatWorld());
    const inv = new (await import('../src/items/Inventory')).Inventory();
    const p = new Player(60 * TILE, 66 * TILE, inv);
    // 落地沉降
    for (let i = 0; i < 30; i++) step(p, game);
    expect(p.onGround).toBe(true);
    p.vx = 0;
    let ref = 0;
    const saw: number[] = [];
    let maxSeen = 0;
    for (let t = 0; t < 240; t++) {
      p.inputX = 1;
      ref = vanillaStep(ref, 1, true);
      step(p, game);
      maxSeen = Math.max(maxSeen, p.vx);
      saw.push(p.vx);
      expect(Math.abs(p.vx - ref)).toBeLessThan(1e-9);
    }
    expect(maxSeen).toBeLessThanOrEqual(3.05);      // 过冲 3.04 一步即回落
    expect(maxSeen).toBeGreaterThan(2.9);           // 确实到达极速段
    const tail = saw.slice(-60);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    expect(mean).toBeGreaterThan(2.8);              // 15mph（≈2.93-3.0）
    expect(mean).toBeLessThan(3.01);
    // 裸装绝不该到 6（曾 `|| 6` 翻倍 bug 的回归闸）
    expect(maxSeen).toBeLessThan(4);
  });

  it('急停：松键后地面 −0.2/t 钳 0（15t 内静止）', async () => {
    const game = makeGame(flatWorld());
    const inv = new (await import('../src/items/Inventory')).Inventory();
    const p = new Player(60 * TILE, 66 * TILE, inv);
    for (let i = 0; i < 30; i++) step(p, game);
    p.vx = 3;
    let ref = 3;
    for (let t = 0; t < 20; t++) {
      p.inputX = 0;
      ref = vanillaStep(ref, 0, true);
      step(p, game);
      expect(Math.abs(p.vx - ref)).toBeLessThan(1e-9);
    }
    expect(p.vx).toBe(0);
  });

  it('反向急转：+3 → 持左（制动窗 −0.28/t，越零后回落 −0.08/t）', async () => {
    const game = makeGame(flatWorld());
    const inv = new (await import('../src/items/Inventory')).Inventory();
    const p = new Player(60 * TILE, 66 * TILE, inv);
    for (let i = 0; i < 30; i++) step(p, game);
    p.vx = 3;
    let ref = 3;
    for (let t = 0; t < 30; t++) {
      p.inputX = -1;
      ref = vanillaStep(ref, -1, true);
      step(p, game);
      expect(Math.abs(p.vx - ref)).toBeLessThan(1e-9);
    }
    // 3 −0.28×10t 至 0.2 → 越零后 |vx|<0.2 无制动仅 −0.08/t → 30t ≈ −1.3
    expect(p.vx).toBeLessThan(-1.1);
    expect(p.vx).toBeGreaterThan(-1.5);
  });

  it('赫尔墨斯靴（accRunSpeed=6）：慢爬坡段 ×0.2 生效（3→6 约 0.016/t）', async () => {
    const game = makeGame(flatWorld());
    const inv = new (await import('../src/items/Inventory')).Inventory();
    const { mkStack } = await import('../src/data/items');
    const { ITEM_BY_KEY } = await import('../src/data/items');
    const boots = mkStack('vi_54_hermes_boots', 1);
    if (boots) inv.armor[3] = boots;   // 配饰槽 3（ACC_ARMOR_START）
    const p = new Player(60 * TILE, 66 * TILE, inv);
    for (let i = 0; i < 30; i++) step(p, game);
    // 装备链生效性自检（equipStats 每次重算——直接改返回对象无效，须真穿靴）
    expect((p as unknown as { equipStats: { accRunSpeed: number } }).equipStats.accRunSpeed).toBeGreaterThan(0);
    p.vx = 0;
    for (let t = 0; t < 60; t++) { p.inputX = 1; step(p, game); }
    // 60t：0→3 用 ~38t（+0.08），余 ~22t ×0.016 ≈ 3.3x
    expect(p.vx).toBeGreaterThan(3.1);
    expect(p.vx).toBeLessThan(3.6);
    for (let t = 0; t < 240; t++) { p.inputX = 1; step(p, game); }
    // 长跑趋近 6（过冲锯齿上界 ~6.04）
    expect(p.vx).toBeGreaterThan(5.4);
    expect(p.vx).toBeLessThanOrEqual(6.05);
  });
});
