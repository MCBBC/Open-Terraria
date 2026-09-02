// 肉山"狂卷之舌"拖拽回归（2026-09-01 用户报"跑到肉山背后会被触手抓回前面,我们有吗"）:
// 原版 Player.WOFTongue(:22449-22515 上舌门) + Player.Update 拖拽段(:27623-27662,
// tongued 时速度全覆写 → 拉向墙行进方向前缘 200px,11px/t、专家 lerp→22;到达松口)。
// 本仓 wofTongue(Player.ts)——★拖拽段曾整段缺失(只有上舌/伤害/死亡判定)。
// 2026-09-02 用户报"遇到地形拽不回来被卡住"：原版积分段 :28384-28388
// `if (tongued) { position += velocity; }` 完全绕过瓦片碰撞（Sloping/传送带
// :28435-28440 同跳）——速度覆写+无碰撞位移两半合起来才是完整拉回语义。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { TILE } from '../src/core/constants';
import { World } from '../src/world/World';
import { Minecart } from '../src/entities/Minecart';

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

// ============ 穿地形拽回（Player.cs:28384-28388 tongued 绕过瓦片碰撞） ============
describe('肉山舌头拖拽穿地形（2026-09-02 用户报"遇到地形卡住拽不回"）', () => {
  /** 紧凑世界：墙 x=100*16 向东行进,玩家背后 x=1500,实体板 96-99 列横在拽回路径上 */
  function makeBypassSetup() {
    const w = new World(200, 600, 1, 'wof-tongue-bypass');   // ≥546:底部 40 格禁区(h*16-640)不得吃进地狱带
    const wall = {
      dead: false, vanillaId: 113, x: 100 * TILE, y: 4900, w: 20, h: 400,
      cx: 100 * TILE + 10, cy: 500 * TILE, facing: 1, vx: 2.4, vy: 0, difficulty: 0,
    };
    const p = new Player(1500, 500 * TILE - 21, new Inventory());
    (p as unknown as { baseMaxHp: number }).baseMaxHp = 9999;   // 过嘴部伤害带不死
    p.hp = 9999;
    // 实体板：拽回路径(1510→1810)上的 96-99 列,竖跨玩家身高带
    for (let col = 96; col <= 99; col++) {
      for (let row = 494; row <= 506; row++) w.store.setTileSilent(col, row, 1);
    }
    const hooks = {
      world: w, player: p,
      enemies: () => [wall],
      critters: () => [],
      spawnDrop: () => null,
      damagePlayer: (): number => 0,
      addDamageNumber: () => {},
      cutTile: () => {},
      onEnemyKilled: () => {},
      spawnEnemy: () => {},
      spawnParticles: () => {},
      spawnDust: () => null,
      notifyInventoryChanged: () => {},
      playSfx: () => {},
      playSfxFiles: () => {},
      playSfxWav: () => {},
      showPickupLabel: () => {},
    };
    return { w, wall, p, hooks: hooks as never };
  }

  it('tongued 位移绕过瓦片碰撞：实体板挡路仍被拽到墙前面(修复前卡在板西侧)', () => {
    const { w, p, hooks } = makeBypassSetup();
    const slabRight = 100 * TILE;                       // 板右缘 = 1600
    expect(p.buffs.has(BuffType.TheTongue)).toBe(false);
    p.fixedUpdate(1 / 60, hooks);                       // tick1: 地狱带自动上 Horrified
    // tick2: gross 局部读数生效 + 背后 40px 外 → 上舌 38（wofTongue 头部读 gross/
    // tongued 局部快照,申请.tick 次帧才进拖拽——上舌时序两 tick,与原版 UpdateBuffs
    // 先置 tongued 再进拖拽段的一拍差同构）
    p.fixedUpdate(1 / 60, hooks);
    expect(p.buffs.has(BuffType.TheTongue)).toBe(true);
    for (let t = 0; t < 60; t++) p.fixedUpdate(1 / 60, hooks);
    // 穿板：无碰撞位移不吃 moveAndCollide 的挡板(修复前恒被挡在 ~1516)
    expect(p.cx).toBeGreaterThan(slabRight);
    // 到达前缘(墙前 200px 带) → 舌头松口
    expect(p.buffs.has(BuffType.TheTongue)).toBe(false);
  });

  it('拖拽穿地形期间逐帧位移不归零(修复前 moveAndCollide 清 vx 卡死)', () => {
    const { p, hooks } = makeBypassSetup();
    p.fixedUpdate(1 / 60, hooks);                       // 上舌两拍预热(t1 Horrified/t2 舌)
    p.fixedUpdate(1 / 60, hooks);
    let minX = Infinity;
    for (let t = 0; t < 20; t++) {
      p.fixedUpdate(1 / 60, hooks);
      minX = Math.min(minX, p.vx);
    }
    // 拖拽期 20 tick 全程向东(被拽向 1810),拖速不被地形清零
    expect(p.vx).toBeGreaterThan(0);
    expect(minX).toBeGreaterThan(0);
  });

  // ============ 骑矿车同样被拽（vanilla :28384 顶层积分,矿车桥拽回经典形态） ============
  it('骑乘者 tongue 生效：ridingCart 早退分支跑舌头段+拖拽位移(曾整体早退=永不上舌)', () => {
    const { p, hooks } = makeBypassSetup();
    p.ridingCart = true;                                // 无需真实 Minecart——骑乘分支自包含
    p.fixedUpdate(1 / 60, hooks);                       // t1: Horrified
    p.fixedUpdate(1 / 60, hooks);                       // t2: 上舌
    expect(p.buffs.has(BuffType.TheTongue)).toBe(true);
    for (let t = 0; t < 30; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.cx).toBeGreaterThan(100 * TILE);           // 穿板拽到墙前面
    expect(p.buffs.has(BuffType.TheTongue)).toBe(false); // 到达松口
  });

  it('矿车回写让位：骑乘者 tongued 期间车随人锁位(不吃自身运动学)', () => {
    const { p, hooks } = makeBypassSetup();
    const cart = new Minecart();
    cart.mounted = true;
    p.ridingCart = true;
    p.cart = cart;
    cart.x = p.x + 50;                                  // 故意错位
    cart.y = p.y;
    p.buffs.apply(BuffType.TheTongue, 10 / 60);
    cart.fixedUpdate(1 / 60, hooks);
    expect(cart.x).toBe(p.x);                           // 车锁到玩家(位置权威=玩家)
    expect(cart.y).toBe(p.y);
    expect(cart.vx).toBe(0);
  });
});
