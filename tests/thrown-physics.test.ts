// 投掷武器物理档（aiStyle 2 默认档，Projectile.cs:21955-21977 + :21508）：
//   前 20t 平飞（无重力无阻力）→ vy+0.4/vx×0.97 每 tick → 终端 32；
//   刀族（48/54/93/520/599）平飞期姿态锁定 atan2（:21971-21972），翻滚自出生累加。
// + 丢弃抛出链（Player.cs:4993-4997）：vy=-2、vx=4×朝向+玩家速度；noGrabDelay=100。
import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { ItemDrop } from '../src/entities/ItemDrop';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';

const THROWN = { grav: 0.4, gravDelay: 20, drag: 0.97, maxFall: 32, tumble: true } as const;

function makeWorld(): World {
  const w = new World(300, 200, 7, 'thrown-test');
  w.groundLevel = 100;
  return w;
}
function makeHooks(world: World) {
  return {
    world,
    player: { x: 150 * TILE, y: 50 * TILE, w: 20, h: 42, cx: 150 * TILE, cy: 50 * TILE, dead: true },
    enemies: () => [], critters: () => [], spawnDrop: () => null,
    damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
  } as never;
}

describe('投掷武器物理（aiStyle 2 默认档）', () => {
  it('前 19 tick 平飞；第 20 tick（ai0>=20，:21961-21966）起重力', () => {
    const hooks = makeHooks(makeWorld());
    const a = new Arrow(100 * TILE, 50 * TILE, 10, 0, 10, 0, 3, { ...THROWN, life: 2000 });
    for (let i = 0; i < 19; i++) a.fixedUpdate(1, hooks);
    expect(a.vy).toBe(0);          // 平飞期零下坠
    expect(a.vx).toBeCloseTo(10);  // 无阻力
    a.fixedUpdate(1, hooks);       // 第 20 tick：ai[0]+=1 → 20 >= 20 → vy+0.4
    expect(a.vy).toBeCloseTo(0.4, 6);
  });

  it('20t 起：重力 0.4/tick + X 阻力 ×0.97/tick（:21963-21966 ai[0]>=20 含等号）', () => {
    const hooks = makeHooks(makeWorld());
    const a = new Arrow(100 * TILE, 50 * TILE, 10, 0, 10, 0, 3, { ...THROWN, life: 2000 });
    for (let i = 0; i < 30; i++) a.fixedUpdate(1, hooks);
    expect(a.vy).toBeCloseTo(0.4 * 11, 1);        // 11 个重力 tick（第 20..30，≥ 门）
    expect(a.vx).toBeCloseTo(10 * Math.pow(0.97, 11), 2);
  });

  it('终端下落速度 32（非箭矢档 16）', () => {
    const hooks = makeHooks(makeWorld());
    const a = new Arrow(100 * TILE, 20 * TILE, 0, 0, 10, 0, 3, { ...THROWN, life: 4000 });
    for (let i = 0; i < 400; i++) a.fixedUpdate(1, hooks);
    expect(a.vy).toBeLessThanOrEqual(32);
    expect(a.vy).toBeCloseTo(32, 0);   // 已达终端
  });

  it('翻滚自出生累加（手里剑 3 不锁姿态）', () => {
    const hooks = makeHooks(makeWorld());
    const a = new Arrow(100 * TILE, 50 * TILE, 10, 0, 10, 0, 3, { ...THROWN, life: 2000 });
    a.fixedUpdate(1, hooks);
    a.fixedUpdate(1, hooks);
    expect(a.tumbleRot).toBeGreaterThan(0);
  });

  it('世纪之花种子档不受影响（35t 延迟/0.025 重力/默认终端 16）', () => {
    const hooks = makeHooks(makeWorld());
    const a = new Arrow(100 * TILE, 20 * TILE, 8, 0, 22, 0, 275,
      { grav: 0.025, gravDelay: 35, hostile: true, life: 4000 });
    for (let i = 0; i < 30; i++) a.fixedUpdate(1, hooks);
    expect(a.vy).toBe(0);                 // 35t 延迟内
    for (let i = 0; i < 300; i++) a.fixedUpdate(1, hooks);
    expect(a.vy).toBeLessThanOrEqual(16); // 默认终端不变
    expect(a.vx).toBeCloseTo(8);          // 默认无阻力
  });
});

describe('丢弃抛出（DropSelectedItem，Player.cs:4990-4997）', () => {
  /** 注册在案的真实物品 id（vi_ 迁移后勿用裸 vanilla id/旧锚表） */
  const DIRT_ID = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2] ?? ''] ?? 0;
  function dropHooks(world: World) {
    const player = new Player(100 * TILE, 90 * TILE, new Inventory());
    return {
      world, player,
      enemies: () => [], critters: () => [], spawnDrop: () => null,
      damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      showPickupLabel: () => {},
      achievements: { notifyItemPickup: () => {} },
    } as never;
  }

  it('noGrabDelay=100：30t 拾不回，101t 后才拾取（原版 GrabDelayForLocalPlayer 同构）', () => {
    const hooks = dropHooks(makeWorld());
    const p = (hooks as unknown as { player: Player }).player;
    const d = new ItemDrop(p.cx, p.y, DIRT_ID, 1, p.facing * 4 + p.vx, -2);  // 丢弃速度公式
    expect(d.vx).toBe(4);            // facing=1、玩家静止：4×1+0
    expect(d.vy).toBe(-2);
    d.vx = 0; d.vy = 0;              // 时序段钉在玩家身上（否则飞出/落出拾取范围）
    d.noGrabDelay = 100;
    for (let i = 0; i < 30; i++) { d.x = p.cx; d.y = p.y; d.fixedUpdate(1, hooks); }
    expect(d.dead).toBe(false);      // 仍被 noGrab 挡住（BJ311 前还有全局 25 门,现仅此门）
    expect(p.inv.slots.every((s) => s === null)).toBe(true);
    for (let i = 0; i < 90; i++) { d.x = p.cx; d.y = p.y; d.fixedUpdate(1, hooks); }   // age>100
    expect(d.dead).toBe(true);       // 已被拾取
  });

  // ★BJ311（2026-09-23）重钉：原版 GrabItems（Player.cs:35181-35203）对普通战利品
  //  零年龄门——tick1 即可拾取。旧断言「前 25 拍拾不回」钉的是自造全局门
  //  （wiki-mechanics-audit-2026-08-13.md:912 挂账债,已摘）。
  it('普通掉落（noGrab=0）tick1 即可拾取（原版 GrabItems 无年龄门,BJ311）', () => {
    const hooks = dropHooks(makeWorld());
    const p = (hooks as unknown as { player: Player }).player;
    const d = new ItemDrop(p.cx, p.y, DIRT_ID, 1, 0, -2);
    d.x = p.cx; d.y = p.y;           // 拾取判定先于物理段,出生位即可拾
    d.fixedUpdate(1, hooks);
    expect(d.dead).toBe(true);       // age=1 即拾（原版同相）
  });
});
