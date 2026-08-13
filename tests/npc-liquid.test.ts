// 敌怪水体交互 1:1 回归（1.4.5.6 NPC.cs UpdateCollision :93712-93805 /
// Collision_MoveWhileWet :93986 / Collision.cs WetCollision :1575）。
// 探针：
//  1. wetCollision 中心小盒 + 液面高度收缩 + 蜂蜜/微光标记
//  2. 减速因子表（水 .5 / 岩浆 .5 / 蜂蜜 .25 / 微光 .375；DD2 与水黾 612/613 = 1）
//  3. 永不沾水族表（:94252）
//  4. moveAndCollide 按 liqFactor 缩位移（velocity 不变）
//  5. E2E：僵尸入水 wet + liqFactor .5；岩浆受伤/onFire；入水熄火 24+323
//  6. 水栖离水分支：食人鱼拍打挣扎 / 鲨鱼只阻尼；史莱姆 wet 弹跳漂浮
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { wetCollision, liquidMoveFactor, skipsWet } from '../src/entities/npcLiquid';
import { moveAndCollide } from '../src/physics/TileCollision';
import type { GameHooks } from '../src/entities/types';

const W = 60, H = 256;

/** 水池 x∈[10,30) 行 33-39 满水、行 40 池底；x∈[30,46) 行 40 陆地 */
function liquidWorld(liquidType = 1, depth = 255): World {
  const w = new World(W, H, 11, 'npc-liquid-test');
  const st = w.store;
  for (let x = 10; x < 30; x++) {
    st.setTile(x, 40, 1);
    for (let y = 33; y < 40; y++) st.setLiquid(x, y, depth, liquidType);
  }
  for (let x = 30; x < 46; x++) st.setTile(x, 40, 1);
  return w;
}

function hooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

const host = (over: Partial<Parameters<typeof liquidMoveFactor>[0]> = {}) =>
  ({
    x: 0, y: 0, w: 18, h: 40, vx: 0, vy: 0, cx: 0, cy: 0,
    vanillaId: 3, vanilla: { aiStyle: 3 }, ai0: 0,
    wet: false, wetCount: 0, honeyWet: false, shimmerWet: false, lavaWet: false,
    ...over,
  }) as Parameters<typeof liquidMoveFactor>[0];

describe('Collision.WetCollision（Collision.cs:1575）中心小盒 + 液面收缩', () => {
  const w = liquidWorld();
  it('深水中心 → wet；水上空气 → 干', () => {
    expect(wetCollision(w.store, 20 * TILE, 36 * TILE, 18, 40).wet).toBe(true);
    expect(wetCollision(w.store, 20 * TILE, 20 * TILE, 18, 40).wet).toBe(false);
  });
  it('半格浅水（liquid=128）：drop=4 → 液面=行顶+8、有效高 8——盒在液面上 → 干', () => {
    const s = new World(W, H, 11, 'npc-shallow-test');   // 空世界：仅一格半水
    const st = s.store;
    st.setTile(20, 36, 1);
    st.setLiquid(20, 35, 128, 1);          // 仅行 35 半格水
    // h=40：盒高 h/2=20。y=35*16-32 → 盒 [35*16-22, 35*16-2) 全在液面 35*16+8 之上 → 干
    expect(wetCollision(st, 20 * TILE, 35 * TILE - 32, 18, 40).wet).toBe(false);
    // y=35*16-16 → 盒 [35*16-6, 35*16+14) 越过液面 → wet
    expect(wetCollision(st, 20 * TILE, 35 * TILE - 16, 18, 40).wet).toBe(true);
    // 液体清空 → 干
    st.setLiquid(20, 35, 0, 0);
    expect(wetCollision(st, 20 * TILE, 35 * TILE - 16, 18, 40).wet).toBe(false);
  });
  it('蜂蜜/微光格带类型标记（选减速档用）', () => {
    const h = liquidWorld(3);
    expect(wetCollision(h.store, 20 * TILE, 36 * TILE, 18, 40)).toMatchObject({ wet: true, honey: true });
    const sh = liquidWorld(4);
    expect(wetCollision(sh.store, 20 * TILE, 36 * TILE, 18, 40)).toMatchObject({ wet: true, shimmer: true });
  });
});

describe('减速因子表（NPC.cs:5946-5952 + :93748-93762 优先级）', () => {
  it('默认 水 .5 / 岩浆 .5 / 蜂蜜 .25 / 微光 .375；干 = 1', () => {
    expect(liquidMoveFactor(host({ wet: true }))).toBeCloseTo(0.5, 5);
    expect(liquidMoveFactor(host({ wet: true, lavaWet: true }))).toBeCloseTo(0.5, 5);
    expect(liquidMoveFactor(host({ wet: true, honeyWet: true }))).toBeCloseTo(0.25, 5);
    expect(liquidMoveFactor(host({ wet: true, shimmerWet: true }))).toBeCloseTo(0.375, 5);
    // 优先级：微光 > 蜂蜜 > 岩浆
    expect(liquidMoveFactor(host({ wet: true, shimmerWet: true, honeyWet: true }))).toBeCloseTo(0.375, 5);
    expect(liquidMoveFactor(host())).toBe(1);
  });
  it('DD2 族（548/549/551-578/620）与水黾 612/613 液体全速', () => {
    for (const id of [548, 549, 551, 560, 578, 620]) {
      expect(liquidMoveFactor(host({ vanillaId: id, wet: true })), `npc ${id}`).toBe(1);
    }
    expect(liquidMoveFactor(host({ vanillaId: 612, wet: true }))).toBe(1);
    expect(liquidMoveFactor(host({ vanillaId: 613, wet: true }))).toBe(1);
    expect(liquidMoveFactor(host({ vanillaId: 550, wet: true }))).toBeCloseTo(0.5, 5); // 表外
  });
});

describe('永不沾水族（NPC.cs:94252）', () => {
  it('72 火轮/376 睡渔夫/579 醉酒酒保/541 沙尘精/aiStyle21/67/(690,ai0=0)/(7,ai0=25)', () => {
    expect(skipsWet(host({ vanillaId: 72, vanilla: { aiStyle: 20 } }))).toBe(true);
    expect(skipsWet(host({ vanillaId: 376 }))).toBe(true);
    expect(skipsWet(host({ vanillaId: 579 }))).toBe(true);
    expect(skipsWet(host({ vanillaId: 541 }))).toBe(true);
    expect(skipsWet(host({ vanillaId: 158, vanilla: { aiStyle: 21 } }))).toBe(true);
    expect(skipsWet(host({ vanillaId: 100, vanilla: { aiStyle: 67 } }))).toBe(true);
    expect(skipsWet(host({ vanillaId: 690, ai0: 0 }))).toBe(true);
    expect(skipsWet(host({ vanillaId: 441, vanilla: { aiStyle: 7 }, ai0: 25 }))).toBe(true);
    // 反例
    expect(skipsWet(host({ vanillaId: 3 }))).toBe(false);
    expect(skipsWet(host({ vanillaId: 690, ai0: 1 }))).toBe(false);
    expect(skipsWet(host({ vanillaId: 441, vanilla: { aiStyle: 7 }, ai0: 0 }))).toBe(false);
  });
});

describe('Collision_MoveWhileWet（:93986）：位移 ×factor、velocity 不变', () => {
  it('liqFactor .5：vx=2 只走 1px，b.vx 仍是 2', () => {
    const w = liquidWorld();
    const b = {
      x: 31 * TILE, y: 38 * TILE, w: 18, h: 24, vx: 2, vy: 0,
      onGround: false, hitWall: false, hitHead: false, liqFactor: 0.5,
    };
    moveAndCollide(b, w, b.vx, b.vy);
    expect(b.x).toBeCloseTo(31 * TILE + 1, 5);
    expect(b.vx).toBe(2);
  });
  it('liqFactor 1（干/永不沾水族）：全速', () => {
    const w = liquidWorld();
    const b = {
      x: 31 * TILE, y: 38 * TILE, w: 18, h: 24, vx: 2, vy: 0,
      onGround: false, hitWall: false, hitHead: false, liqFactor: 1,
    };
    moveAndCollide(b, w, b.vx, b.vy);
    expect(b.x).toBeCloseTo(31 * TILE + 2, 5);
  });
});

describe('E2E：僵尸（NPC 3）入水/岩浆/熄火', () => {
  it('入水 → wet 且 liqFactor=.5（水里该减速的主诉）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const h = hooks(w, p);
    const e = Enemy.fromVanilla(3, 20 * TILE, 36 * TILE)!;
    for (let i = 0; i < 30; i++) e.fixedUpdate(1 / 60, h as never);
    expect(e.wet).toBe(true);
    expect(e.inWater).toBe(true);
    expect(e.liqFactor).toBeCloseTo(0.5, 5);
  });
  it('岸上 → 干、liqFactor=1', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(3, 38 * TILE, 38 * TILE)!;
    for (let i = 0; i < 30; i++) e.fixedUpdate(1 / 60, hooks(w, p) as never);
    expect(e.wet).toBe(false);
    expect(e.liqFactor).toBe(1);
  });
  it('岩浆：30t 冷却内 50 直伤 + onFire 7s；lavaImmune 族（24）免伤', () => {
    const w = liquidWorld(2);
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const h = hooks(w, p);
    const z = Enemy.fromVanilla(3, 20 * TILE, 36 * TILE)!;
    const hp0 = z.hp;
    for (let i = 0; i < 5; i++) z.fixedUpdate(1 / 60, h as never);   // 触发一次 50 伤
    expect(z.hp).toBeLessThan(hp0);
    expect(z.onFireT).toBeGreaterThan(0);
    expect(z.lavaWet).toBe(true);
    const pixie = Enemy.fromVanilla(24, 20 * TILE, 36 * TILE)!;      // NPC_LAVA_IMMUNE 成员
    const php0 = pixie.hp;
    for (let i = 0; i < 60; i++) pixie.fixedUpdate(1 / 60, h as never);
    expect(pixie.hp).toBe(php0);                                     // 免伤
    expect(pixie.lavaWet).toBe(true);                                // 但 lavaWet 仍置位（:94524）
  });
  it('入水熄火：onFire(24) 与 onFire3(323) 双清（TryRemovingWaterPerishableEffects）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const h = hooks(w, p);
    const e = Enemy.fromVanilla(3, 20 * TILE, 36 * TILE)!;
    e.onFireT = 5; e.onFire3T = 5;
    e.fixedUpdate(1 / 60, h as never);
    expect(e.onFireT).toBe(0);
    expect(e.onFire3T).toBe(0);
  });
  it('永不沾水族入水不减速（72 火轮语义位）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(541, 20 * TILE, 36 * TILE)!;   // 沙尘精（:94252 表内）
    for (let i = 0; i < 20; i++) e.fixedUpdate(1 / 60, hooks(w, p) as never);
    expect(e.wet).toBe(false);
    expect(e.liqFactor).toBe(1);
  });
});

describe('水栖离水分支（aiStyle 16 :24019-24034）与史莱姆 wet 段（:61877）', () => {
  it('食人鱼 58 搁浅：拍打挣扎（vy 出现负脉冲）且不飞天', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(58, 38 * TILE, 38 * TILE)!;    // 岸上实地
    let minVy = 0;
    for (let i = 0; i < 120; i++) {
      e.fixedUpdate(1 / 60, hooks(w, p) as never);
      minVy = Math.min(minVy, e.vy);
    }
    expect(e.wet).toBe(false);
    expect(minVy).toBeLessThan(-1);                             // rand(-5,-2) 拍打已出
    expect(e.vy).toBeLessThanOrEqual(10);                       // 钳 10
  });
  it('鲨鱼 65 搁浅：只 ×0.94 阻尼不蹦（:24022-24026）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(65, 38 * TILE, 38 * TILE)!;
    e.vx = 2;
    let flapped = false;
    for (let i = 0; i < 90; i++) {
      const vyBefore = e.vy;
      e.fixedUpdate(1 / 60, hooks(w, p) as never);
      if (vyBefore === 0 && e.vy < -1) flapped = true;
    }
    expect(flapped).toBe(false);
    expect(Math.abs(e.vx)).toBeLessThan(0.5);                   // ×0.94/t 衰减
  });
  it('史莱姆入水：wet 段 vy 恒 -0.5 上浮钳 -4（弹跳漂浮，非旧 buoyant 近似）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(1, 20 * TILE, 37 * TILE)!;      // 蓝史莱姆入池
    let sawRise = false;
    for (let i = 0; i < 120; i++) {
      e.fixedUpdate(1 / 60, hooks(w, p) as never);
      if (e.vy < -0.5) sawRise = true;
      expect(e.vy).toBeGreaterThanOrEqual(-4.01);               // 钳 -4
    }
    expect(e.wet).toBe(true);
    expect(sawRise).toBe(true);
  });
  it('睡渔夫 376 水面漂流不沉（AI_000 头顶格液体门 :19818）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(376, 20 * TILE, 36 * TILE)!;
    const y0 = e.y;
    for (let i = 0; i < 200; i++) e.fixedUpdate(1 / 60, hooks(w, p) as never);
    expect(e.y).toBeLessThanOrEqual(y0 + 2);                    // 恒漂（vy=-0.4 上浮）
  });
  it('蝙蝠 49 入水上浮弹出（AI_014 wet 表 cs:23232：0.95/-0.5/-4）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(49, 20 * TILE, 36 * TILE)!;     // 洞穴蝙蝠
    let rose = false, wasWet = false;
    for (let i = 0; i < 90; i++) {
      e.fixedUpdate(1 / 60, hooks(w, p) as never);
      if (e.wet) wasWet = true;
      if (e.vy < -0.5) rose = true;
    }
    expect(wasWet).toBe(true);
    expect(rose).toBe(true);                                    // 恒 -0.5 上浮已出
  });
  it('wet 落速帽 7（UpdateNPC_UpdateGravity :91936：重力段湿侧 maxFall 10→7）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(3, 20 * TILE, 36 * TILE)!;
    e.vy = 9.5;                                                 // 超帽入水
    e.fixedUpdate(1 / 60, hooks(w, p) as never);
    expect(e.vy).toBeLessThanOrEqual(7.01);
    // 干态不帽：空中（非落地跳）自由落体 9.5 → 重力累加 >7 不被本段触碰
    const dry = Enemy.fromVanilla(3, 38 * TILE, 30 * TILE)!;
    dry.vy = 9.5;
    dry.fixedUpdate(1 / 60, hooks(w, p) as never);
    expect(dry.vy).toBeGreaterThan(7);
  });
});
