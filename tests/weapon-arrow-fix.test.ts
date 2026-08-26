// Arrow.ts 弹幕基建修复批（2026-08-22，审计第一批：穿透/寿命/aiStyle 物理/alpha/弹道）：
//   · 修复1 穿透表：ctor 按 SetDefaults penetrate（vanilla-projectiles.json）消费，
//     −1 = 无限穿透（小丑箭 5 P.cs:594 / 地狱火箭 41 :982），命中侧全局 immune 帧冷却
//   · 修复2 寿命表：ctor 按 SetDefaults timeLeft 消费，缺省 3600（P.cs:526）
//   · 修复3 aiStyle 专属物理：94 水晶风暴 aiStyle24（:24302-24326 ×0.985 阻力 + 缩径消亡）/
//     280 黄金雨 aiStyle12（:22815-22862 ai0>3 重力 0.075 + scale−0.002 消亡）
//   · 修复5 弹道：出生速钳（NewProjectile :10259-10267 aiStyle1 |v|≥16 ×0.97 收敛）/
//     重力起始拍 off-by-one（ai[0] >= 15 :54686 ≥ 门）/ 1006 微光箭 flag4 上飘（:54686-54696）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { Arrow } from '../src/entities/Arrow';
import { projGravSpec } from '../src/data/vanillaItemCombat';

function makeGame(w: World, enemies: unknown[] = []): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => enemies, critters: () => [],
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

describe('修复1：穿透表（SetDefaults penetrate 直读）', () => {
  it('抽查五弹：小丑箭 −1 / 水晶镖 5 / 诅咒之焰 2 / 诅咒镖 3 / 月总箭 4', () => {
    expect(new Arrow(0, 0, 1, 0, 10, 1, 5).pierce).toBe(-1);    // P.cs:594
    expect(new Arrow(0, 0, 1, 0, 10, 1, 477).pierce).toBe(5);   // :5252
    expect(new Arrow(0, 0, 1, 0, 10, 1, 95).pierce).toBe(2);    // :1529
    expect(new Arrow(0, 0, 1, 0, 10, 1, 478).pierce).toBe(3);   // 1457 P.cs:5538(1456 :5263 曾为 2)
    expect(new Arrow(0, 0, 1, 0, 10, 1, 639).pierce).toBe(4);   // :6609
  });

  it('opts 显式穿透仍优先；无 penetrate 列的弹缺省 1', () => {
    expect(new Arrow(0, 0, 1, 0, 10, 1, 5, null, { pierce: 3 }).pierce).toBe(3);
    expect(new Arrow(0, 0, 1, 0, 10, 1, 1).pierce).toBe(1);     // 木箭无列 → 1
  });

  it('无限穿透（−1）同敌按 iframes 冷却再命中，穿透数不递减', () => {
    const w = emptyWorld();
    let hits = 0;
    const foe = {
      x: 85, y: 85, w: 30, h: 30, id: 7, dead: false, iframes: 0,
      hurt: () => { hits++; foe.iframes = 10; return false; },
    };
    const game = makeGame(w, [foe]);
    // 小丑箭 5：penetrate −1 + extraUpdates 1（每拍 2 子步 ×2 位移）——低速贴身重叠
    const a = new Arrow(95, 95, 1, 0, 10, 1, 5);
    a.fixedUpdate(1 / 60, game);
    expect(hits).toBe(1);
    expect(a.pierce).toBe(-1);            // 无限穿透不递减
    a.fixedUpdate(1 / 60, game);
    expect(hits).toBe(1);                 // iframes=10 内不命中（:11905 门）
    foe.iframes = 0;
    a.fixedUpdate(1 / 60, game);
    expect(hits).toBe(2);                 // 过期后再命中
  });
});

describe('修复2：寿命表（SetDefaults timeLeft 直读，缺省 3600）', () => {
  it('抽查：小丑箭 120 / 诅咒镖 300 / 月总箭 90', () => {
    expect(new Arrow(0, 0, 1, 0, 10, 1, 5).life).toBe(120);     // P.cs:599
    expect(new Arrow(0, 0, 1, 0, 10, 1, 478).life).toBe(300);   // :5264
    expect(new Arrow(0, 0, 1, 0, 10, 1, 639).life).toBe(90);    // :6603 MaxUpdates×45
  });

  it('无覆写弹缺省 3600（P.cs:526）；opts.life 仍优先', () => {
    expect(new Arrow(0, 0, 1, 0, 10, 1, 41).life).toBe(3600);   // 地狱火箭无 timeLeft 列
    expect(new Arrow(0, 0, 1, 0, 10, 1, 41, null, { life: 60 }).life).toBe(60);
  });
});

describe('修复3：94 水晶风暴（aiStyle 24，P.cs:24302-24326）', () => {
  it('velocity ×0.985 阻力 + light=scale×0.5', () => {
    const a = new Arrow(800, 800, 10, 4, 10, 1, 94);
    const game = makeGame(emptyWorld());
    a.fixedUpdate(1 / 60, game);
    expect(a.vx).toBeCloseTo(9.85, 5);                          // :24317
    expect(a.vy).toBeCloseTo(3.94, 5);
    // light 色：ProjLight :16380-16382 type94 → R×0.5/G×0/B=light（紫光,commit 033cc029
    // 依原版修正"曾发白光"）——R=l94×0.5=scale×0.25、B=scale×0.5
    expect(a.lightRGB![0]).toBeCloseTo(1.2 * 0.25, 5);          // :24304 + :16380-16382
    expect(a.lightRGB![1]).toBe(0);
    expect(a.lightRGB![2]).toBeCloseTo(1.2 * 0.5, 5);
  });

  it('ai[1]>130 后缩径，scale 0.2 消亡（:24318-24325）', () => {
    const a = new Arrow(800, 800, 6, 0, 10, 1, 94);
    const game = makeGame(emptyWorld());
    for (let i = 0; i < 149; i++) a.fixedUpdate(1 / 60, game);
    expect(a.dead).toBe(false);
    expect(a.drawScale).toBeCloseTo(1.2 - 0.05 * 19, 5);        // t=131..149 共 19 次 −0.05
    a.fixedUpdate(1 / 60, game);                                // t=150 → 0.2 → Kill
    expect(a.dead).toBe(true);
    expect(a.drawScale).toBe(0.2);
  });
});

describe('修复3：280 黄金雨（aiStyle 12，P.cs:22815-22862）', () => {
  it('ai0>3 后重力 0.075/子步；scale −0.002/子步；缩尽消亡', () => {
    const a = new Arrow(800, 800, 8, 0, 10, 1, 280);            // extraUpdates 2 → 3 子步/帧
    const game = makeGame(emptyWorld());
    for (let i = 0; i < 10; i++) a.fixedUpdate(1 / 60, game);
    // 子步 1-4 ai0 计数，子步 5..30 施加重力 = 26 × 0.075
    expect(a.vy).toBeCloseTo(26 * 0.075, 2);                    // :22832
    expect(a.drawScale).toBeCloseTo(1 - 0.002 * 30, 5);         // :22824
    for (let i = 0; i < 200; i++) a.fixedUpdate(1 / 60, game);  // 500 子步 ≈ 167 帧缩尽
    expect(a.dead).toBe(true);
  });
});

describe('修复5：弹道三小项', () => {
  it('重力起始拍 = ai[0] >= 15（≥ 门，off-by-one 修复 :54686）', () => {
    const a = new Arrow(800, 800, 5, 0, 10, 1, 1);              // 木箭默认档 0.1@15
    const game = makeGame(emptyWorld());
    for (let i = 0; i < 14; i++) a.fixedUpdate(1 / 60, game);
    expect(a.vy).toBe(0);                                       // 第 14 拍仍未施加重力
    a.fixedUpdate(1 / 60, game);
    expect(a.vy).toBeCloseTo(0.1, 5);                           // 第 15 拍（ai0=15）开始
  });

  it('出生速钳：aiStyle1 逐轴 |v|≥16 → ×0.97 收敛（NewProjectile :10259-10267）', () => {
    const a = new Arrow(0, 0, 20, 0, 10, 1, 1);
    expect(a.vx).toBeLessThan(16);
    expect(a.vx).toBeGreaterThan(15);
    const b = new Arrow(0, 0, 0, -20, 10, 1, 1);                // 负 vy 侧无等号（vy < −16）
    expect(b.vy).toBeLessThanOrEqual(-16 + 0.97);
    expect(b.vy).toBeGreaterThan(-16);
    const c = new Arrow(0, 0, 10, 0, 10, 1, 2);                 // aiStyle 1 以内不钳
    expect(c.vx).toBe(10);
  });

  it('1006 微光箭 flag4 上飘：spec −0.1@15，终端 −16（:54686-54696/:54878-54890）', () => {
    expect(projGravSpec(1006)).toEqual({ grav: -0.1, delay: 15 });
    const a = new Arrow(800, 800, 5, 0, 10, 1, 1006);
    const game = makeGame(emptyWorld());
    for (let i = 0; i < 20; i++) a.fixedUpdate(1 / 60, game);
    expect(a.vy).toBeCloseTo(-0.6, 5);                          // 第 15..20 拍 −0.1×6
    const b = new Arrow(800, 800, 5, -100, 10, 1, 1006);
    for (let i = 0; i < 400; i++) b.fixedUpdate(1 / 60, game);
    expect(b.vy).toBe(-16);                                     // flag7 对称钳（:54881-54883）
  });
});

describe('修复4：alpha 通道（GetAlpha/SetDefaults alpha）', () => {
  it('521 水晶脉冲 alpha −50/t 淡入归零（:25086-25100）', () => {
    const a = new Arrow(800, 800, 5, 0, 10, 1, 521);            // extraUpdates 1 → 2 子步/帧
    const game = makeGame(emptyWorld());
    expect(a.alpha).toBe(255);
    a.fixedUpdate(1 / 60, game);
    expect(a.alpha).toBe(155);
    for (let i = 0; i < 3; i++) a.fixedUpdate(1 / 60, game);
    expect(a.alpha).toBe(0);
  });

  it('477/478 镖前 3 拍隐形（localAI[0]>3 → alpha=0，:54412-54415）', () => {
    const a = new Arrow(800, 800, 5, 0, 10, 1, 477);
    const game = makeGame(emptyWorld());
    a.fixedUpdate(1 / 60, game);
    expect(a.alpha).toBe(255);
    for (let i = 0; i < 3; i++) a.fixedUpdate(1 / 60, game);
    expect(a.alpha).toBe(0);
  });
});
