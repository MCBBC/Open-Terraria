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

describe('地面材质链（Player.cs:26210-26255 else-if 真序;2026-08-18 冰面死码修复批）', () => {
  async function mkPlayer(floorKey: string) {
    const w = new World(480, 80, 30, 'mat');
    const { TILE_BY_KEY } = await import('../src/data/tiles');
    const fid = TILE_BY_KEY[floorKey];
    for (let x = 0; x < 480; x++) w.store.setTileSilent(x, 70, fid, 0, 0);
    const game = makeGame(w);
    const inv = new (await import('../src/items/Inventory')).Inventory();
    const p = new Player(60 * TILE, 66 * TILE, inv);
    for (let i = 0; i < 30; i++) step(p, game);
    expect(p.onGround).toBe(true);
    p.vx = 0;
    return { p, game, TILE_BY_KEY };
  }

  it('冰面:起步加速 ×0.7(30t vx 显著低于平地)——旧死码曾全程 0.08 满加速', async () => {
    const { p, game } = await mkPlayer('ice');
    for (let t = 0; t < 30; t++) { p.inputX = 1; step(p, game); }
    const vxAbs = Math.abs(p.vx);
    // 0.7×0.08×30 ≈ 1.68(尚在 <maxRun 直加段);死码时 = 2.4
    expect(vxAbs).toBeGreaterThan(1.4);
    expect(vxAbs).toBeLessThan(2.0);
  });

  it('冰面无冰刀:松键 slowdown ×0.1(惯性滑行 ≈10 倍距离)', async () => {
    const { p, game } = await mkPlayer('ice');
    p.vx = 2.5;
    let t = 0;
    for (; t < 600; t++) { p.inputX = 0; step(p, game); if (p.vx === 0) break; }
    expect(t).toBeGreaterThan(100);   // 0.02/t 减速:2.5→0 需 ~125t(平地 13t)
  });

  it('冻结史莱姆块 197:松键零摩擦(600t 仍 >0)——slippy2 滑到底', async () => {
    const { p, game } = await mkPlayer('v_197_frozen_slime_block');
    p.vx = 2.5;
    for (let t = 0; t < 600; t++) { p.inputX = 0; step(p, game); }
    expect(Math.abs(p.vx)).toBeGreaterThan(2.4);   // runSlow=0:理论上永不停(撞界前)
  });

  it('蜂蜜块地面:maxRun ×0.25 钳速(推满 <0.85)', async () => {
    const { p, game } = await mkPlayer('v_229_honey_block');
    for (let t = 0; t < 120; t++) { p.inputX = 1; step(p, game); }
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(0.85);   // 3×0.25=0.75+过冲
    expect(Math.abs(p.vx)).toBeGreaterThan(0.5);
  });

  it('沥青 198:maxRun ×3.5 跑道(极速 >8)', async () => {
    const { p, game } = await mkPlayer('v_198_asphalt_block');
    for (let t = 0; t < 300; t++) { p.inputX = 1; step(p, game); }
    expect(Math.abs(p.vx)).toBeGreaterThan(8);          // 3×3.5=10.5 帽
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(11);
  });

  it('蜂蜜地面跳削弱:jumpTicks/10 + jumpSpd/5(跳起高度骤降)', async () => {
    const { p, game } = await mkPlayer('v_229_honey_block');
    let peakHoney = 0;
    p.inputJump = true;
    for (let t = 0; t < 60; t++) {
      step(p, game);
      peakHoney = Math.max(peakHoney, 66 * TILE - p.y);
      if (t === 5) p.inputJump = false;
    }
    const { p: p2, game: g2 } = await mkPlayer('stone');
    let peakStone = 0;
    p2.inputJump = true;
    for (let t = 0; t < 60; t++) {
      step(p2, g2);
      peakStone = Math.max(peakStone, 66 * TILE - p2.y);
      if (t === 5) p2.inputJump = false;
    }
    expect(peakHoney).toBeLessThan(peakStone * 0.4);    // /10 高度 + /5 速度 → ~4%
  });
});

describe('冰刀族（Ice Skates 950：冰面 acc×0.7×3.5 + maxRun×1.25;slippy2 同）', () => {
  it('穿冰刀冰上起步:0.7×3.5×0.08≈0.196/t——30t vx≈5.8 帽 3.75', async () => {
    const w = new World(480, 80, 30, 'skate');
    const { TILE_BY_KEY } = await import('../src/data/tiles');
    const { ITEM_BY_KEY } = await import('../src/data/items');
    const { vanillaItemKey } = await import('../src/data/vanillaRecipes');
    for (let x = 0; x < 480; x++) w.store.setTileSilent(x, 70, TILE_BY_KEY['ice'], 0, 0);
    const game = makeGame(w);
    const inv = new (await import('../src/items/Inventory')).Inventory();
    const p = new Player(60 * TILE, 66 * TILE, inv);
    // 真穿冰刀（equipStats 逐次重算——假旗会被 getter 覆写）
    p.inv.armor[3] = { id: ITEM_BY_KEY[vanillaItemKey(950)!], stack: 1 };
    for (let i = 0; i < 30; i++) step(p, game);
    expect(p.onGround).toBe(true);
    p.vx = 0;
    for (let t = 0; t < 30; t++) { p.inputX = 1; step(p, game); }
    const v = Math.abs(p.vx);
    expect(v).toBeGreaterThan(3.7);    // 到帽 3×1.25=3.75(无冰刀死码时 ≈1.68)
    expect(v).toBeLessThanOrEqual(3.75 + 0.6);   // maxRun 3×1.25=3.75(过冲一档)
  });
});
