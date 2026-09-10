// SW-BJ53 浮标×平台碰撞语义 1:1 回归（2026-09-10，用户实报「平台会阻挡钓钩,原版可以穿过」）。
// 金标 = 1.4.5.7 反编译（1457=1458 同域逐行核对,1458 行号随注）：
//   · 浮标 SetDefaults（360-366/381/382/760/775 共块）无 tileCollide 行 → 字段缺省 true
//     （Projectile.cs:4510-4518 / :777）
//   · 通用弹幕运动 fallThrough=fall2=flag6=true（Projectile.cs:17587,1458 :17588）；
//     aiStyle 61 不在例外表（:17590-17700 无 61/bobber 支）→ 通用 TileCollision 调用
//     传 (flag6,flag6)（:17726/:17740/:17754/:17960 湿支同参）
//   · Collision.TileCollision（Collision.cs:2299）平台语义：
//       实心门 tileSolid||(tileSolidTop&&frameY==0)（:2331）
//       顶面着陆门 (!(solidTop&fallThrough) || !(vy<=1|fall2))（:2388-2391）——
//         fallThrough&fall2 恒真 ⇒ 门恒假 ⇒ 从上方落也【永不落地】
//       横向守卫 !tileSolidTop（:2406/:2426）/ 上穿守卫 !tileSolidTop（:2446）
//       ⇒ 平台四向全穿（飞行段=漂浮段同参；SlopeCollision 平台+fall:true 仅置
//       stair/stairFall 旗零位移修改,Collision.cs:1851-1877）
//   · aiStyle 61 命【实心】反弹支（Projectile.cs:19730-19740,1458 :19731-19741）：
//     X 恒 lastVelocity.X×-0.3f；Y 仅 lastVelocity.Y>1f×-0.3f；不 Kill 不 HitTiles
//     （lastVelocity=碰撞前速度,P.cs:17701）
//   · 收竿段显式 tileCollide=false（Projectile.cs:54654,1458 :54655）→ 全图格无关
//   · GetWaterLine 只读 liquid（:54806-54833）——平台不参与浮位
// 仓库落点：Body.dropThrough=原版 fallThrough/fall2 对（moveAxis :300 平台落顶门、
//   slopeCollide :550/:574 平台坡·face-snap 门三处消费）——Bobber 置 true；
//   弹域既有惯例（WeaponProj.ts:1153-1165 等十余处同注 :17587）。
// 变异证据：修复前本文件 ①④⑤⑥ 红（DOWN 落停平台顶/TOPREST 恒驻/SOLID 无反弹）,
//   修复后全绿；②③⑦⑧⑨ 为守卫（修复前已绿,防豁免泄漏/回退）。
import { describe, it, expect } from 'vitest';
import { Bobber } from '../src/entities/Bobber';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { moveAndCollide } from '../src/physics/TileCollision';
import type { GameHooks } from '../src/entities/types';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_DEFS } from '../src/data/tiles';
import { GRAVITY } from '../src/core/constants';

const TILE = 16;
const ROD_2289 = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2289]!]!;   // shoot=360=Bobber 缺省 projId
const PLAT_ID = TILE_DEFS.findIndex((d) => d.key === 'platform');
const DIRT_ID = TILE_DEFS.findIndex((d) => d.key === 'dirt');

/** 实验场：200×120 清空;玩家泊 (54*TILE, 46*TILE) 手持 2289 竿（AI_061 存活门）。 */
function mkArena() {
  const store = new TileStore(200, 120);
  const player = new Player(54 * TILE, 46 * TILE, new Inventory());
  player.inv.selected = 5;
  player.inv.slots[5] = { id: ROD_2289, stack: 1 };
  const hooks = {
    world: {
      store,
      groundLevel: 100,
      clock: { timeOfDay: 0.25 + 10000 / 54000 * 0.5, isDay: true, moonPhase: 2, bloodMoon: false, eclipse: false },
      weather: { raining: false, cloudAlpha: 0 },
      flags: {}, scene: null,
    },
    player,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {}, showPickupLabel: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnDust: () => null,
  } as unknown as GameHooks;
  return { store, player, hooks };
}

function platRow(store: TileStore, x0: number, x1: number, y: number) {
  for (let x = x0; x <= x1; x++) store.setTile(x, y, PLAT_ID);
}
function dirtRow(store: TileStore, x0: number, x1: number, y: number) {
  for (let x = x0; x <= x1; x++) store.setTile(x, y, DIRT_ID);
}
function waterBox(store: TileStore, x0: number, x1: number, y0: number, y1: number) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) store.setLiquid(x, y, 255, 1);
}

/** 步进浮标（直驱 fixedUpdate,不经 Game 实体桶——Player 不动=收线距离门恒 900px 内） */
function steps(b: Bobber, hooks: GameHooks, n: number): void {
  for (let i = 0; i < n; i++) {
    if (b.dead) return;
    b.fixedUpdate(1, hooks);
  }
}

// ============ SetDefaults/字段投影面 ============

describe('SW-BJ53 浮标平台全穿字段（P.cs:17587 flag6 缺省 true 的仓库投影）', () => {
  it('Bobber.dropThrough === true（平台四向全穿）;tileCollide 不设=碰撞管线照走（实心仍拦）', () => {
    const b = new Bobber(0, 0, 0, 0, 50, 0, 50, () => null);
    expect(b.dropThrough).toBe(true);
    // Body.tileCollide 为可选投影字段（Entity 不声明,moveAndCollide 读 undefined≠false）
    expect((b as unknown as { tileCollide?: boolean }).tileCollide).not.toBe(false);   // :4510-4518 无 tileCollide 行
  });
  it('共享物理缺省不变：普通 Body（dropThrough 缺省）落下仍停平台顶=弹域隔离', () => {
    const { store } = mkArena();
    platRow(store, 50, 55, 50);
    const body = { x: 52 * TILE, y: 46 * TILE, w: 14, h: 14, vx: 0, vy: 4, onGround: false, hitWall: false, hitHead: false };
    for (let i = 0; i < 30 && !body.onGround; i++) moveAndCollide(body, { store } as never, 0, 4);
    expect(body.onGround).toBe(true);
    expect(body.y + body.h).toBe(50 * TILE);   // 落平台顶（dropThrough 未开=原版非弹幕语义）
  });
});

// ============ ① 飞行段：上→下穿越平台（用户实报主诉） ============

describe('① 飞行段上→下穿越平台（TileCollision :2388-2391 着陆门 fallThrough&fall2 恒假）', () => {
  it('平台带中直落 → 穿到平台下方,不停顶不落停', () => {
    const { store, hooks } = mkArena();
    platRow(store, 50, 55, 50);                       // 平台行 y=50（800..816px）
    const b = new Bobber(52 * TILE + 1, 44 * TILE, 0, 2, 50, 0, 50, () => (hooks as unknown as { player: Player }).player);
    let passed = false, rested = false;
    for (let i = 0; i < 200; i++) {
      b.fixedUpdate(1, hooks);
      if (b.dead) break;
      const feet = b.y + b.h;
      if (feet > 52 * TILE) { passed = true; break; }   // 已到平台底行之下
      if (b.onGround && Math.abs(feet - 50 * TILE) < 1.5) rested = true;
    }
    expect(passed).toBe(true);
    expect(rested).toBe(false);
  });
  it('平台桥横跨水面上方 → 穿桥入水停浮（GetWaterLine :54806 只读 liquid）', () => {
    const { store, hooks } = mkArena();
    platRow(store, 50, 55, 39);                       // 平台桥在水面上方一行（下落路径必经）
    waterBox(store, 50, 55, 40, 42);
    dirtRow(store, 50, 55, 44);                       // 池底
    const player = (hooks as unknown as { player: Player }).player;
    const b = new Bobber(52 * TILE + 1, 34 * TILE, 0, 2, 50, 0, 50, () => player);
    const WL = 41 * TILE - Math.floor(255 / 16);      // :54818-54821 行底−liquid/16 = 641
    let floating = false, kind: string | null = null, cyErr = Infinity;
    for (let i = 0; i < 400; i++) {
      b.fixedUpdate(1, hooks);
      if (b.dead) break;
      if (b.floating) {
        floating = true; kind = b.liquidKind;
        cyErr = Math.abs(b.cy - WL);
        if (i > 240) break;                           // settled 收敛窗
      }
    }
    expect(floating).toBe(true);
    expect(kind).toBe('water');
    expect(cyErr).toBeLessThanOrEqual(0.5);
  });
});

// ============ ④ 平台顶落停语义：从不落停（TOPREST） ============

describe('④ 平台顶落停语义（原版从不落停——着陆门恒假）', () => {
  it('平台顶上方长驻：永不 onGround 停顶线,穿越后继续下坠', () => {
    const { store, hooks } = mkArena();
    platRow(store, 50, 55, 50);
    const player = (hooks as unknown as { player: Player }).player;
    const b = new Bobber(52 * TILE + 1, 46 * TILE, 0, 1, 50, 0, 50, () => player);
    let rested = false, below = false;
    for (let i = 0; i < 300; i++) {
      b.fixedUpdate(1, hooks);
      if (b.dead) break;                              // 坠出 900px 自动收线=原版语义,非本刀面
      const feet = b.y + b.h;
      if (feet > 51 * TILE) { below = true; break; }  // 已完全穿过平台行（底缘 816）
      if (b.onGround && Math.abs(feet - 50 * TILE) < 1.5) rested = true;
    }
    expect(below).toBe(true);
    expect(rested).toBe(false);
    expect(b.onGround).toBe(false);
  });
});

// ============ ②③ 守卫：上穿/横穿（修复前已 1:1,防回退） ============

describe('②③ 上穿/横穿守卫（Collision.cs :2406/:2426/:2446 !tileSolidTop 恒放行）', () => {
  it('② 下→上穿越平台', () => {
    const { store, hooks } = mkArena();
    platRow(store, 50, 55, 50);
    const player = (hooks as unknown as { player: Player }).player;
    const b = new Bobber(52 * TILE + 1, 54 * TILE, 0, -8, 50, 0, 50, () => player);
    let passed = false;
    for (let i = 0; i < 120 && !b.dead; i++) {
      b.fixedUpdate(1, hooks);
      if (b.y + b.h < 50 * TILE - 1) { passed = true; break; }
    }
    expect(passed).toBe(true);
  });
  it('③ 横向穿越平台带', () => {
    const { store, hooks } = mkArena();
    platRow(store, 50, 55, 50);
    const player = (hooks as unknown as { player: Player }).player;
    const b = new Bobber(45 * TILE, 50 * TILE - 7, 5, 0, 50, 0, 50, () => player);
    let crossed = false;
    for (let i = 0; i < 120 && !b.dead; i++) {
      b.fixedUpdate(1, hooks);
      if (b.x + b.w > 56 * TILE) { crossed = true; break; }
    }
    expect(crossed).toBe(true);
  });
});

// ============ ⑤ aiStyle61 命实心反弹（Projectile.cs:19730-19740 ×-0.3f） ============

describe('⑤ 命实心反弹支（X 恒 -0.3f / Y 仅 lastVelocity.Y>1f;-0.3f=fl32(-0.3)）', () => {
  it('Y：落地拍 vy = lastVelocity×-0.3（preVy>1）;不 Kill（penetrate=-1 :4514）', () => {
    const { store, hooks } = mkArena();
    dirtRow(store, 50, 55, 56);
    const player = (hooks as unknown as { player: Player }).player;
    const b = new Bobber(52 * TILE + 1, 48 * TILE, 0, 0, 50, 0, 50, () => player);
    let preVy = 0, bounced = false;
    for (let i = 0; i < 200 && !b.dead; i++) {
      preVy = (b as unknown as { vy: number }).vy;
      b.fixedUpdate(1, hooks);
      if ((b as unknown as { collideY: boolean }).collideY && preVy > 1) {
        // lastVelocity = AI 物理【后】碰撞【前】（P.cs:17701 在 AI 之后）——本拍
        // 重力先加（本仓飞行段注册近似档 vy=min(vy+GRAVITY*0.7,8)）再进碰撞
        const lvy = Math.min(preVy + GRAVITY * 0.7, 8);
        expect(b.vy).toBeCloseTo(Math.fround(lvy * Math.fround(-0.3)), 4);
        bounced = true;
        break;
      }
    }
    expect(bounced).toBe(true);
    expect(b.dead).toBe(false);
  });
  it('X：撞墙拍 vx = preVx×-0.3（恒反弹,无论速度）', () => {
    const { store, hooks } = mkArena();
    for (let y = 48; y <= 70; y++) store.setTile(56, y, DIRT_ID);   // 高竖墙 x=56（覆盖坠落全程行带）
    const player = (hooks as unknown as { player: Player }).player;
    const b = new Bobber(48 * TILE, 53 * TILE, 5, 0, 50, 0, 50, () => player);
    let preVx = 0, bounced = false;
    for (let i = 0; i < 120 && !b.dead; i++) {
      preVx = b.vx;
      b.fixedUpdate(1, hooks);
      if (b.hitWall) {
        // lastVelocity = AI 物理【后】碰撞【前】——本仓飞行段 X 阻尼为注册近似档
        // ×0.99（vanilla 0.95/0.98,Bobber.ts 头注近似带）;断言目标是碰撞面 ×-0.3f
        const lvx = preVx * 0.99;
        expect(b.vx).toBeCloseTo(Math.fround(lvx * Math.fround(-0.3)), 4);
        bounced = true;
        break;
      }
    }
    expect(bounced).toBe(true);
  });
});

// ============ ⑥ 半砖/坡面：平台豁免不得泄漏到实心（守卫） ============

describe('⑥ 半砖/坡面不借道穿透（solidTop 语义仅平台族——实心照拦）', () => {
  it('半砖顶承接（span 顶 +8）,浮标不穿到行底之下', () => {
    const { store, hooks } = mkArena();
    dirtRow(store, 50, 55, 56);
    for (let x = 50; x <= 55; x++) store.setHalfBrick(x, 56, true);
    const player = (hooks as unknown as { player: Player }).player;
    const b = new Bobber(52 * TILE + 1, 48 * TILE, 0, 0, 50, 0, 50, () => player);
    let maxFeet = 0;
    for (let i = 0; i < 200 && !b.dead; i++) {
      b.fixedUpdate(1, hooks);
      maxFeet = Math.max(maxFeet, b.y + b.h);
    }
    expect(maxFeet).toBeGreaterThanOrEqual(56 * TILE + 8 - 2);   // 触及半砖顶带（904）
    expect(maxFeet).toBeLessThan(57 * TILE + 4);                 // 从不穿到行底之下
  });
  it('坡面（slope1）承接贴合,浮标不穿透', () => {
    const { store, hooks } = mkArena();
    store.setTile(52, 56, DIRT_ID);
    store.setSlope(52, 56, 1);                        // 左高右低
    const player = (hooks as unknown as { player: Player }).player;
    const b = new Bobber(52 * TILE + 4, 48 * TILE, 0, 0, 50, 0, 50, () => player);
    let maxFeet = 0;
    for (let i = 0; i < 200 && !b.dead; i++) {
      b.fixedUpdate(1, hooks);
      maxFeet = Math.max(maxFeet, b.y + b.h);
    }
    expect(maxFeet).toBeGreaterThanOrEqual(56 * TILE + 2);       // 触及坡面带
    expect(maxFeet).toBeLessThan(57 * TILE + 4);                 // 从不落到坡格行底之下
  });
});

// ============ ⑦ 收竿段 tileCollide=false（:54654）——全图格无关（守卫） ============

describe('⑦ 收竿段穿平台穿实心（tileCollide=false :54654）', () => {
  it('收线飞行穿过平台+实心墙抵达玩家盒即 Kill（:54666-54668）', () => {
    const { store, hooks, player } = mkArena();
    platRow(store, 50, 55, 50);
    for (let y = 48; y <= 54; y++) store.setTile(55, y, DIRT_ID);   // 平台后实心墙
    const b = new Bobber(48 * TILE, 52 * TILE, 0, 0, 50, 0, 50, () => player);
    steps(b, hooks, 3);
    expect(b.dead).toBe(false);
    (b as unknown as { retract: number }).retract = 1;   // startReel(1) 等价置位
    steps(b, hooks, 300);
    expect(b.dead).toBe(true);                        // 触玩家盒 Kill（穿墙到达）
  });
});
