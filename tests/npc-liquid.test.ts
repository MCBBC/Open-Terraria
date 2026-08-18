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
import { wetCollision, liquidMoveFactor, skipsWet, getWaterLine, updateNpcLiquid } from '../src/entities/npcLiquid';
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
    // 确定性布场：拍打 vx∈(-2,2) px/t（cs:24031 rand(-20,20)×0.1）×120t 的左漂上限
    // 240px——把岸加宽到 x∈[46,60) 并出生在 52 列后，距池右缘 x=480 有 352px > 240px，
    // 随机左漂恒不可能入池（旧 38 列仅 128px 缓冲，实测 2.6%（13/500）概率整程左漂
    // 进池 → wet 假阳性 flaky；产品侧拍打随机是原版 Main.rand 语义，不改）
    for (let x = 46; x < 60; x++) w.store.setTile(x, 40, 1);
    const e = Enemy.fromVanilla(58, 52 * TILE, 38 * TILE)!;    // 岸上实地（右段加宽）
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
    let sawRise = false, sawDry = false, wetAt30 = false;
    for (let i = 0; i < 120; i++) {
      e.fixedUpdate(1 / 60, hooks(w, p) as never);
      if (e.vy < -0.5) sawRise = true;
      if (!e.wet) sawDry = true;
      if (i === 30) wetAt30 = e.wet;
      expect(e.vy).toBeGreaterThanOrEqual(-4.01);               // 钳 -4
    }
    // 2026-08-17 重校准：wet 重力档 0.2 落地后净浮力 -0.5+0.2=-0.3/t（原版
    // UpdateNPC_UpdateGravity 同式）——史莱姆 ~45t 冲出水面后回落在液面上下
    // 起伏（原版弹跳漂浮实态），t=120 时刻 wet 已是采样巧合，改验：
    // 前段（t=30）仍在水下、全程出现过离水（跳出水面）、上浮与 -4 钳
    expect(wetAt30).toBe(true);
    expect(sawDry).toBe(true);
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

// ===========================================================================
// 水体交互遗留批（461/586/620 游泳化 / 沙鲨视水为沙 / 水母 lurk / 龟蛙鸥钉水面）
// ===========================================================================
describe('游泳化三族（AI_003 cs:56361/:56486 + AI_107 flag27 cs:64300）', () => {
  it('461 深海水怪：wet 缩盒 34×24 + kbResist=0 + ai[3] 哨兵；dry 复原 18×40', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const h = hooks(w, p);
    const e = Enemy.fromVanilla(461, 20 * TILE, 36 * TILE)!;
    for (let i = 0; i < 5; i++) e.fixedUpdate(1 / 60, h as never);
    expect(e.wet).toBe(true);
    expect(e.w).toBe(34);
    expect(e.h).toBe(24);
    expect(e.kbResistOverride).toBe(0);                       // knockBackResist = 0f
    expect(e.ai3).toBeCloseTo(-0.10101, 5);                   // 出水冲量哨兵
    // 出水复原：陆地上跑 30t
    const dry = Enemy.fromVanilla(461, 40 * TILE, 38 * TILE)!;
    for (let i = 0; i < 30; i++) dry.fixedUpdate(1 / 60, h as never);
    expect(dry.wet).toBe(false);
    expect(dry.w).toBe(18);
    expect(dry.h).toBe(40);
    expect(dry.kbResistOverride).toBeGreaterThan(0);          // 0.4 难度曲线（dry :56412）
    expect(dry.ai3).toBe(0);                                  // 哨兵已消费
  });
  it('586 僵尸人鱼：wet 不缩盒 + kbResist=0 + 水平收敛玩家', () => {
    const w = liquidWorld();
    const p = new Player(24 * TILE, 37 * TILE, new Inventory());
    const e = Enemy.fromVanilla(586, 20 * TILE, 36 * TILE)!;
    const h = hooks(w, p);
    for (let i = 0; i < 20; i++) e.fixedUpdate(1 / 60, h as never);
    expect(e.wet).toBe(true);
    expect(e.w).toBe(18);                                     // 586 原文无 resize
    expect(e.kbResistOverride).toBe(0);
    const d0 = Math.abs(p.cx - e.cx);
    for (let i = 0; i < 60; i++) e.fixedUpdate(1 / 60, h as never);
    expect(Math.abs(p.cx - e.cx)).toBeLessThan(d0);           // Lerp 向玩家收敛
  });
  it('620 地精鲨：wet 接管 walker（DD2 全速 liqFactor=1，水下收敛玩家）', () => {
    const w = liquidWorld();
    const p = new Player(24 * TILE, 37 * TILE, new Inventory());
    const e = Enemy.fromVanilla(620, 20 * TILE, 37 * TILE)!;
    const h = hooks(w, p);
    let wetSeen = false;
    for (let i = 0; i < 8; i++) { e.fixedUpdate(1 / 60, h as never); if (e.wet) wetSeen = true; }
    expect(wetSeen).toBe(true);
    expect(e.liqFactor).toBe(1);                              // LazySetLiquidMovementDD2 全速
    const d0 = Math.hypot(p.cx - e.cx, p.cy - e.cy);
    for (let i = 0; i < 60; i++) e.fixedUpdate(1 / 60, h as never);
    expect(Math.hypot(p.cx - e.cx, p.cy - e.cy)).toBeLessThan(d0);
  });
});

describe('沙鲨视水为沙（AI_103 cs:42634 flag119|=wet + :42696 flag122 液体）', () => {
  it('纯水无沙世界：恒 wet 且按原版 0.5 液体减速（非 DD2 豁免）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(543, 20 * TILE, 36 * TILE)!;  // 腐化沙鲨
    const h = hooks(w, p);
    for (let i = 0; i < 40; i++) e.fixedUpdate(1 / 60, h as never);
    expect(e.wet).toBe(true);
    expect(e.liqFactor).toBeCloseTo(0.5, 5);                  // waterMovementSpeed 默认档
  });
  it('水中保持巡游介质态：不落入离沙自由落体（vy 不饱和到 10）', () => {
    const w = liquidWorld();
    const p = new Player(12 * TILE, 36 * TILE, new Inventory());   // 池内玩家
    const e = Enemy.fromVanilla(544, 20 * TILE, 36 * TILE)!;  // 血腥沙鲨
    const h = hooks(w, p);
    let maxVy = 0, moved = false;
    const y0 = e.y;
    for (let i = 0; i < 120; i++) {
      e.fixedUpdate(1 / 60, h as never);
      maxVy = Math.max(maxVy, e.vy);
      if (Math.abs(e.y - y0) > 4) moved = true;
    }
    expect(e.wet).toBe(true);                                 // 视水为沙：全程在介质内
    expect(moved).toBe(true);                                 // 照常巡游（非冻结）
    expect(maxVy).toBeLessThan(4);                            // 无离沙分支的重力下落（0.3/t→10）
  });
});

describe('水母 lurk（aiStyle 18 cs:24215-24269，专家 63/64/103/242）', () => {
  it('专家：湿身近距 420/2≈210t 后入潜伏（ai[1]=1 + dontTakeDamage）', () => {
    const w = liquidWorld();
    w.difficulty = 1;                                         // 专家档
    const p = new Player(22 * TILE, 37 * TILE, new Inventory());
    p.inWater = true;                                         // 玩家湿身（探针直置）
    const e = Enemy.fromVanilla(63, 20 * TILE, 37 * TILE)!;   // 蓝水母
    const h = hooks(w, p);
    let lurked = false;
    for (let i = 0; i < 320; i++) {
      e.fixedUpdate(1 / 60, h as never);
      if (e.ai1 === 1 && e.dontTakeDamage) { lurked = true; break; }
    }
    expect(lurked).toBe(true);
    expect(e.hurt(10, 0, 0, h as never)).toBe(false);         // 潜伏不可击（StrikeNPC 早退）
  });
  it('普通档：永不潜伏（ai[1] 恒 0，可正常受击）', () => {
    const w = liquidWorld();                                  // difficulty=0
    const p = new Player(22 * TILE, 37 * TILE, new Inventory());
    p.inWater = true;
    const e = Enemy.fromVanilla(63, 20 * TILE, 37 * TILE)!;
    const h = hooks(w, p);
    for (let i = 0; i < 500; i++) e.fixedUpdate(1 / 60, h as never);
    expect(e.ai1).toBe(0);
    expect(e.dontTakeDamage).toBe(false);
  });
  it('专家潜伏循环：ai[2]≥120 出潜伏恢复可击（ai[1]=0）', () => {
    const w = liquidWorld();
    w.difficulty = 1;
    const p = new Player(22 * TILE, 37 * TILE, new Inventory());
    p.inWater = true;
    const e = Enemy.fromVanilla(103, 20 * TILE, 37 * TILE)!;  // 绿水母
    const h = hooks(w, p);
    let wasLurk = false, exited = false;
    for (let i = 0; i < 1200 && !exited; i++) {
      e.fixedUpdate(1 / 60, h as never);
      if (e.ai1 === 1) wasLurk = true;
      else if (wasLurk) { exited = true; break; }             // 1→0 跳变 = 出潜伏
    }
    e.fixedUpdate(1 / 60, h as never);                        // 下一 tick else 分支清 dontTakeDamage
    expect(wasLurk).toBe(true);
    expect(exited).toBe(true);
    expect(e.dontTakeDamage).toBe(false);                    // 出潜伏即恢复可击
  });
  it('发光（cs:24272-24290）：63 蓝 (0.05,0.15,0.4)、103 绿 (0.05,0.45,0.1)、221/242 无', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const h = hooks(w, p);
    const b = Enemy.fromVanilla(63, 20 * TILE, 36 * TILE)!;
    b.fixedUpdate(1 / 60, h as never);
    expect(b.lightRGB).toEqual([0.05, 0.15, 0.4]);
    const g = Enemy.fromVanilla(103, 20 * TILE, 36 * TILE)!;
    g.fixedUpdate(1 / 60, h as never);
    expect(g.lightRGB).toEqual([0.05, 0.45, 0.1]);
    const pk = Enemy.fromVanilla(64, 20 * TILE, 36 * TILE)!;  // 粉水母 → else 档
    pk.fixedUpdate(1 / 60, h as never);
    expect(pk.lightRGB).toEqual([0.35, 0.05, 0.2]);
    const f = Enemy.fromVanilla(221, 20 * TILE, 36 * TILE)!;  // 真菌球 → 不发光
    f.fixedUpdate(1 / 60, h as never);
    expect(f.lightRGB).toBeNull();
  });
});

describe('溅落声统一衰减（2026-08-13 修复批：删手写 45 格/0.12 门 → Sfx.atten 2500px；'
  + '2026-08-18 批：分液体 wav——PlaySound(19,style) 水 0/蜜与岩浆 1/微光入 4 出 5）', () => {
  it('入水 Splash_0 传实体中心坐标且 vol=0.9（非 boss）；玩家再远也无 0.12 下限残留', () => {
    const w = liquidWorld();
    const rec: Array<{ n: string; v?: number; x?: number; y?: number }> = [];
    const fake = {
      player: { cx: 45 * TILE, cy: 30 * TILE, dead: false },   // 远离水池（>720px 旧音量门）
      playSfxWav: (n: string, v?: number, x?: number, y?: number) => { rec.push({ n, v, x, y }); },
      spawnParticles: () => {},
    } as unknown as GameHooks;
    const b = host({
      x: 20 * TILE, y: 36 * TILE, w: 18, h: 40, vx: 1, vy: 0,
      cx: 20 * TILE + 9, cy: 36 * TILE + 20,
      vanillaId: 3, vanilla: { aiStyle: 3 }, wet: false, wetCount: 0,
      lavaCd: 0, onFireT: 0, onFire3T: 0, inWater: false, liqFactor: 1,
      def: { boss: false }, hurt: () => {},
    });
    updateNpcLiquid(b, fake, w.store);
    expect(b.wet).toBe(true);
    expect(rec).toHaveLength(1);
    expect(rec[0].n).toBe('Splash_0');              // 水入水 style 0（:94306）
    expect(rec[0].v).toBe(0.9);                     // 旧实现远距会塌到 0.9×0.12≈0.108
    expect(rec[0].x).toBe(b.cx);                    // 坐标交 Sfx.atten 统一 2500px 衰减
    expect(rec[0].y).toBe(b.cy);
    updateNpcLiquid(b, fake, w.store);              // 第二 tick 已湿：去抖不重播
    expect(rec).toHaveLength(1);
  });
  it('boss 档 vol=1.2 且带坐标', () => {
    const w = liquidWorld();
    const rec: Array<{ n: string; v?: number; x?: number; y?: number }> = [];
    const fake = {
      player: { cx: 12 * TILE, cy: 36 * TILE, dead: false },
      playSfxWav: (n: string, v?: number, x?: number, y?: number) => { rec.push({ n, v, x, y }); },
      spawnParticles: () => {},
    } as unknown as GameHooks;
    const b = host({
      x: 20 * TILE, y: 36 * TILE, w: 40, h: 40, vx: 0, vy: 0,
      cx: 20 * TILE + 20, cy: 36 * TILE + 20,
      vanillaId: 50, vanilla: { aiStyle: 4 }, wet: false, wetCount: 0,
      lavaCd: 0, onFireT: 0, onFire3T: 0, inWater: false, liqFactor: 1,
      def: { boss: true }, hurt: () => {},
    });
    updateNpcLiquid(b, fake, w.store);
    expect(rec).toHaveLength(1);
    expect(rec[0].n).toBe('Splash_0');
    expect(rec[0].v).toBe(1.2);
    expect(rec[0].x).toBe(b.cx);
    expect(rec[0].y).toBe(b.cy);
  });
  it('分液体档：微光入水 Splash_4 / 出水 Splash_5；蜂蜜 Splash_1（:94296-94428）', () => {
    // 微光池（本仓 liquidType 4 = 原版 Shimmer）→ 入水 style 4、出水 style 5
    const ws = liquidWorld(4);
    const recS: string[] = [];
    const fakeS = {
      player: { cx: 20 * TILE, cy: 34 * TILE, dead: false },
      playSfxWav: (n: string) => { recS.push(n); },
      spawnParticles: () => {},
    } as unknown as GameHooks;
    const bs = host({
      x: 20 * TILE, y: 34 * TILE, w: 18, h: 40, cx: 20 * TILE + 9, cy: 34 * TILE + 20,
      vanillaId: 3, vanilla: { aiStyle: 3 }, wet: false, wetCount: 0,
      lavaCd: 0, onFireT: 0, onFire3T: 0, inWater: false, liqFactor: 1,
      def: { boss: false }, hurt: () => {},
    });
    updateNpcLiquid(bs, fakeS, ws.store);           // 入水
    bs.wetCount = 0;                                // 越过去抖直接验出水分支
    bs.x = 45 * TILE; bs.cx = 45 * TILE + 9;        // 移出液面（陆地 x∈[30,46)）
    updateNpcLiquid(bs, fakeS, ws.store);           // 出水
    expect(recS).toEqual(['Splash_4', 'Splash_5']);
    // 蜂蜜池（liquidType 3）→ 入水 style 1（PlaySound 第 4 参缺省）
    const wh = liquidWorld(3);
    const recH: string[] = [];
    const fakeH = {
      player: { cx: 20 * TILE, cy: 34 * TILE, dead: false },
      playSfxWav: (n: string) => { recH.push(n); },
      spawnParticles: () => {},
    } as unknown as GameHooks;
    const bh = host({
      x: 20 * TILE, y: 36 * TILE, w: 18, h: 40, cx: 20 * TILE + 9, cy: 36 * TILE + 20,
      vanillaId: 3, vanilla: { aiStyle: 3 }, wet: false, wetCount: 0,
      lavaCd: 0, onFireT: 0, onFire3T: 0, inWater: false, liqFactor: 1,
      def: { boss: false }, hurt: () => {},
    });
    updateNpcLiquid(bh, fakeH, wh.store);
    expect(recH).toEqual(['Splash_1']);
  });
});

describe('龟/蛙/游鸭鸥钉水面（AI_007 cs:55586 flag12 / AI_068 cs:34934）', () => {
  it('龟 616：Center 钉 GetWaterLine 液面（33 行满水 → line=513），全程不沉底', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(616, 20 * TILE, 34 * TILE)!;  // 中心行 34（液面下一行）
    const h = hooks(w, p);
    let minCy = Infinity, maxCy = -Infinity;
    for (let i = 0; i < 200; i++) {
      e.fixedUpdate(1 / 60, h as never);
      minCy = Math.min(minCy, e.cy); maxCy = Math.max(maxCy, e.cy);
    }
    expect(e.wet).toBe(true);
    expect(minCy).toBeLessThan(33 * TILE + 8);                // 已上浮钉到液面（513 附近）
    expect(maxCy).toBeLessThan(36 * TILE);                    // 未沉底（池底 40 行）
  });
  it('蛙 361：同钉水面且走计时砍到 50（cs:55589 flag9）', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const e = Enemy.fromVanilla(361, 20 * TILE, 34 * TILE)!;
    const h = hooks(w, p);
    let saw50 = false, maxCy = -Infinity;
    for (let i = 0; i < 200; i++) {
      e.fixedUpdate(1 / 60, h as never);
      if (e.ai1 <= 50) saw50 = true;
      maxCy = Math.max(maxCy, e.cy);
    }
    expect(e.wet).toBe(true);
    expect(saw50).toBe(true);
    expect(maxCy).toBeLessThan(36 * TILE);                    // 浮在水面不沉底
  });
  it('游鸭飞形 363：wet 钉水面−6 吃水线（内联探测,深水同效），不沉底不惊飞', () => {
    const w = liquidWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());   // 远离（>100px 盒）
    const e = Enemy.fromVanilla(363, 20 * TILE, 35 * TILE)!;
    e.ai0 = 0;                                                // 水面模式
    const h = hooks(w, p);
    let maxCy = -Infinity;
    for (let i = 0; i < 180; i++) {
      e.fixedUpdate(1 / 60, h as never);
      maxCy = Math.max(maxCy, e.cy);
    }
    expect(e.wet).toBe(true);
    expect(e.ai0).toBe(0);                                    // 无惊扰不起飞
    expect(maxCy).toBeLessThan(35 * TILE + 8);                // 钉在液面附近（≈507-523）
  });
  it('GetWaterLine（Collision.cs:1501）：整除液面/深水 false/越界 false', () => {
    const w = liquidWorld();
    const st = w.store;
    // 锚在 34 行：33 行有液（Y-1 档）→ line = 34×16 − 15 = 529
    expect(getWaterLine(st, 20, 34)).toEqual({ found: true, line: 529 });
    // 锚在 33 行（液面行本体）：Y 档 → line = (33+1)×16 − 15 = 529... 实取 34×16−15
    expect(getWaterLine(st, 20, 33).line).toBe(529);
    // 锚在 35 行：上 2 行（33）有液 → 深水 false
    expect(getWaterLine(st, 20, 35).found).toBe(false);
    // 越界（InWorld margin 10）→ false
    expect(getWaterLine(st, 3, 34).found).toBe(false);
  });
});
