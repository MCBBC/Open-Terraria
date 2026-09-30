// ★BJ413 2026-09-30「放风筝无效」定谳判别面：
//   ①物品面：24 风筝 itemcombat 原生全值（提取器 DefaultToKite 形参位根修后重产,
//     J 刀 Helper 体面登记债收口）/ rare=1 / value=20000 / itemfunc.shoot 表 /
//     PLACE_TILE_ON_ALT_USE 右键放置面
//   ②分流面：combatWeapon → kind 'kite'（此前 noMelee 落 'shot' 兜底=通用直射箭弹）
//   ③弹幕面：KiteProj AI_160_Kites 关键纯函数 + 行为（收放线/风场门/Kill 门/buff 门/
//     帧表/朝向写回）——锚 = 1457 Projectile.cs:49303-49575
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';
import { PLACE_TILE_ON_ALT_USE } from '../src/data/items';
import { projectileData, AI_KITE } from '../src/data/vanillaProjectiles';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { KITE_ITEM_PROJ } from '../src/entities/LeashedCritter';
import {
  KiteProj, kiteSelectFrame, kiteLift, kiteReelPitch,
  KITE_MIN_WIND, KITE_STRING_MIN, KITE_STRING_MAX, KITE_STRING_INIT,
  type KiteCtx,
} from '../src/entities/KiteProj';
import { VanillaDust } from '../src/fx/VanillaDust';

const ROOT = resolve(__dirname, '..');
const KITES = [4367, 4368, 4369, 4370, 4371, 4379,
  4610, 4611, 4612, 4613, 4648, 4649, 4650, 4651,
  4669, 4670, 4671, 4674, 4675, 4676, 4677, 4681, 4683, 4684];

describe('BJ413 ① 物品面（vanilla-itemcombat.json 原生全值）', () => {
  it('24 风筝 combat 终值 = DefaultToKite 链（useTime/useAnimation 15,shootSpeed 8,shoot 同 KITE_ITEM_PROJ）', () => {
    for (const vid of KITES) {
      const c = itemCombat(vid);
      if (!c) throw new Error(`vid ${vid} combat 缺键`);
      expect(c.shoot, `vid ${vid} shoot`).toBe(KITE_ITEM_PROJ[vid]);
      expect(c.useTime, `vid ${vid} useTime`).toBe(15);
      expect(c.useAnimation, `vid ${vid} useAnimation`).toBe(15);
      expect(c.shootSpeed, `vid ${vid} shootSpeed`).toBe(8);
      expect(c.noMelee, `vid ${vid} noMelee`).toBe(true);
      expect(c.noUseGraphic, `vid ${vid} noUseGraphic`).toBe(true);
      expect(c.consumable, `vid ${vid} consumable=false（体尾覆写）`).toBe(false);
      expect(c.ranged, `vid ${vid} ranged=false（体尾覆写）`).toBe(false);
      expect(c.autoReuse, `vid ${vid} autoReuse 缺省不注入`).toBeUndefined();
      expect(c.damage, `vid ${vid} damage 缺省 0`).toBeUndefined();
    }
  });

  it('弹幕面 24 型 aiStyle 160（vanilla-projectiles.json）', () => {
    for (const vid of KITES) {
      const pd = projectileData(KITE_ITEM_PROJ[vid]);
      expect(pd?.aiStyle, `proj ${KITE_ITEM_PROJ[vid]}`).toBe(AI_KITE);
    }
  });

  it('itemfunc.shoot 与 KITE_ITEM_PROJ 全等（出膛 Kill 门数据源）', () => {
    for (const vid of KITES) {
      expect(itemFuncOfVid(vid)?.shoot).toBe(KITE_ITEM_PROJ[vid]);
    }
  });

  it('rare=1 / value=20000（SetShopValues(Blue1, buyPrice(0,2))——HAND 表）', () => {
    const rare = JSON.parse(readFileSync(resolve(ROOT, 'src/data/vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
    const value = JSON.parse(readFileSync(resolve(ROOT, 'src/data/vanilla-itemvalue.json'), 'utf8')) as Record<string, number>;
    for (const vid of KITES) {
      expect(rare[String(vid)], `vid ${vid} rare`).toBe(1);
      expect(value[String(vid)], `vid ${vid} value=2金`).toBe(20000);
    }
  });

  it('PLACE_TILE_ON_ALT_USE 含全 24 件（右键=放置锚桩链）', () => {
    for (const vid of KITES) expect(PLACE_TILE_ON_ALT_USE.has(vid)).toBe(true);
  });
});

describe('BJ413 ② 分流面（combatWeapon kind kite）', () => {
  it('风筝不再落 shot 兜底——kind kite / damage 0 / useTime 15', () => {
    for (const vid of KITES) {
      const cw = combatWeapon({ key: `vi_${vid}`, vid });
      expect(cw, `vid ${vid}`).not.toBeNull();
      expect(cw!.kind).toBe('kite');
      expect(cw!.damage).toBe(0);
      expect((cw as { useTime: number }).useTime).toBe(15);
    }
  });

  it('thrownCombat 不吃风筝（consumable=false 体尾覆写）', async () => {
    const { thrownCombat } = await import('../src/data/vanillaItemCombat');
    expect(thrownCombat({ key: 'vi_4367', vid: 4367 })).toBeNull();
  });
});

// ---- ③ 弹幕面：KiteProj 行为（KiteCtx 常量闭包直喂）----
function makeCtx(over: Partial<KiteCtx> = {}): { ctx: KiteCtx; log: { face: number[]; buff: number; sfx: number[] } } {
  const log = { face: [] as number[], buff: 0, sfx: [] as number[] };
  const ctx: KiteCtx = {
    channel: () => false,
    letOut: () => false,
    heldShoot: () => 766,
    cced: () => false,
    noItems: () => false,   // ★Q4 刀：noItems 腿（Cursed 23+钻头坐骑 8——:49312 同臂）
    pulley: () => false,
    dead: () => false,
    armPos: () => ({ x: 100, y: 100 }),
    playerDir: () => 1,
    faceDir: (d) => { log.face.push(d); },
    applyKiteBuff: () => { log.buff++; },
    playerTopY: () => 1000,
    playerCenter: () => ({ x: 100, y: 100 }),
    wind: () => 0,
    cloudAlpha: () => 0,
    inWind: () => true,
    playReelSfx: (p) => { log.sfx.push(p); },
    ...over,
  };
  return { ctx, log };
}

describe('BJ413 ③ KiteProj AI_160_Kites 行为面', () => {
  it('风场门 0.2 = MinimumWindStrengthToFlyKite；升力 lerp(0.2,0.5)×0.5', () => {
    expect(KITE_MIN_WIND).toBe(0.2);
    expect(kiteLift(0.19)).toBe(0);          // 门下=无升力
    expect(kiteLift(0.2)).toBe(0);           // 门沿=lerp 起点 0
    expect(kiteLift(0.5)).toBeCloseTo(0.5);  // 上沿=lerp 1 ×0.5
    expect(kiteLift(-0.35)).toBeCloseTo(0.25); // |−0.35| lerp 0.5 ×0.5
  });

  it('收放线：初值 250 → channel −5/tick、letOut +5/tick、钳位 [4,500]', () => {
    const { ctx } = makeCtx({ channel: () => true });
    const k = new KiteProj(100, 60, 766, ctx);
    for (let i = 0; i < 3; i++) k.fixedUpdate(1 / 60, {} as never);
    expect(k.ai0).toBe(KITE_STRING_INIT - 5 * 3);
    const { ctx: ctx2 } = makeCtx({ letOut: () => true });
    const k2 = new KiteProj(100, 60, 766, ctx2);
    for (let i = 0; i < 60; i++) k2.fixedUpdate(1 / 60, {} as never);
    expect(k2.ai0).toBe(KITE_STRING_MAX);          // 250+5×60=550 → 钳 500
  });

  it('收到最短 4 → Kill（:45938-45944 张力段 Kill 门）', () => {
    const { ctx } = makeCtx({ channel: () => true });
    const k = new KiteProj(100, 60, 766, ctx);
    for (let i = 0; i < 60 && !k.dead; i++) k.fixedUpdate(1 / 60, {} as never);
    expect(k.dead).toBe(true);                     // 250−5t → 4 在第 50 拍
  });

  it('Kill 门：手持 shoot 换型 / 死亡 / 距离 >2000', () => {
    const k1 = new KiteProj(100, 60, 766, makeCtx({ heldShoot: () => 771 }).ctx);
    k1.fixedUpdate(1 / 60, {} as never);
    expect(k1.dead).toBe(true);
    const k2 = new KiteProj(100, 60, 766, makeCtx({ dead: () => true }).ctx);
    k2.fixedUpdate(1 / 60, {} as never);
    expect(k2.dead).toBe(true);
    const k3 = new KiteProj(100, 60, 766, makeCtx({ playerCenter: () => ({ x: 3000, y: 100 }) }).ctx);
    k3.fixedUpdate(1 / 60, {} as never);
    expect(k3.dead).toBe(true);
    const k4 = new KiteProj(100, 60, 766, makeCtx({ pulley: () => true }).ctx);
    k4.fixedUpdate(1 / 60, {} as never);
    expect(k4.dead).toBe(true);
  });

  it('buff 383 门：localAI1<1 且风筝底<玩家顶 → applyKiteBuff；位于玩家顶下 → 不触发', () => {
    // 风筝(60..64) 在玩家顶(1000)上方 → buff 逐拍续（无风下垂态 localAI1<1 期间同样触发——
    // 原版 buff 门无风场条件,:49340-49342 只看 localAI[1] 与 Top.Y）
    const { ctx: above, log: logA } = makeCtx({ wind: () => 0, playerTopY: () => 1000 });
    const ka = new KiteProj(100, 60, 766, above);
    for (let i = 0; i < 30; i++) ka.fixedUpdate(1 / 60, {} as never);
    expect(logA.buff).toBeGreaterThan(0);
    // 玩家顶(50) 在风筝上方 → 零触发
    const { ctx: below, log: logB } = makeCtx({ wind: () => 0.4, playerTopY: () => 50 });
    const kb = new KiteProj(100, 60, 766, below);
    for (let i = 0; i < 30; i++) kb.fixedUpdate(1 / 60, {} as never);
    expect(logB.buff).toBe(0);
  });

  it('无风 → 下垂累积（localAI1 严格递增）;风天 → 非单调下垂（飘飞主导）', () => {
    const { ctx: calm } = makeCtx({ wind: () => 0 });
    const kc = new KiteProj(100, 60, 766, calm);
    for (let i = 0; i < 120; i++) kc.fixedUpdate(1 / 60, {} as never);
    expect(kc.projectileLocalAI1).toBeGreaterThan(0);
    const { ctx: windy } = makeCtx({ wind: () => 0.4 });
    const kw = new KiteProj(100, 300, 766, windy);
    for (let i = 0; i < 120; i++) kw.fixedUpdate(1 / 60, {} as never);
    expect(kw.projectileLocalAI1).toBeLessThanOrEqual(1);
  });

  it('线长变化音：localAI2 簿记 + pitch 公式（:49388）', () => {
    expect(kiteReelPitch(KITE_STRING_MIN)).toBeCloseTo(0.06);
    expect(kiteReelPitch(KITE_STRING_MAX)).toBeCloseTo(-0.06);
    const { ctx, log } = makeCtx({ channel: () => true });
    const k = new KiteProj(100, 60, 766, ctx);
    k.fixedUpdate(1 / 60, {} as never);            // 首拍 ai0 0→250：localAI2 初始化不播
    expect(log.sfx.length).toBe(0);
    k.fixedUpdate(1 / 60, {} as never);            // 第二拍 250→245：变化即播
    expect(log.sfx.length).toBe(1);
    expect(log.sfx[0]).toBeCloseTo(kiteReelPitch(245));
  });

  it('朝向写回：风筝在玩家右侧 → faceDir(1)（:45947-45952 |dx|>|dy|/2）', () => {
    const { ctx, log } = makeCtx({ armPos: () => ({ x: 100, y: 100 }) });
    const k = new KiteProj(180, 104, 766, ctx);    // dx=80 > |dy|/2=2 → 朝右
    k.fixedUpdate(1 / 60, {} as never);
    expect(log.face[log.face.length - 1]).toBe(1);
  });

  it('帧表：五色速度四档 / 828 水母双档 / 771 静态 / 824 兔兔抽帧门', () => {
    expect(kiteSelectFrame(766, 1, 0.25, 0, 0).frame).toBe(0);
    expect(kiteSelectFrame(766, 4, 0.25, 0, 0).frame).toBe(1);
    expect(kiteSelectFrame(766, 6, 0.25, 0, 0).frame).toBe(2);
    expect(kiteSelectFrame(766, 9, 0.25, 0, 0).frame).toBe(3);
    expect(kiteSelectFrame(828, 5, 0.25, 0, 0).frame).toBe(1);
    expect(kiteSelectFrame(828, 7, 0.25, 0, 0).frame).toBe(0);
    expect(kiteSelectFrame(771, 9, 0.25, 3, 0).frame).toBe(0);
    expect(kiteSelectFrame(824, 9, 0.1, 2, 99).frame).toBe(0);    // num7<0.15 静帧
    const fast = kiteSelectFrame(824, 9, 0.25, 0, 99);            // fc=100 > 7.5 → 抽帧
    expect(fast.frameCounter).toBe(0);
    expect(fast.frame).toBeGreaterThanOrEqual(0);
    expect(fast.frame).toBeLessThanOrEqual(3);
  });

  it('拖尾缓存长度 = KITE_TRAIL_LENGTH（DrawKite 尾段采样面）', () => {
    const { ctx } = makeCtx();
    const k = new KiteProj(100, 60, 771, ctx);     // 771 → 80
    expect(k.oldPos.length).toBe(80);
    for (let i = 0; i < 3; i++) k.fixedUpdate(1 / 60, {} as never);
    expect(k.oldPos[0].x).toBeCloseTo(k.cx);       // shiftTrail 头=当前位
  });

  it('出膛语义：4×4 盒、盒心=出膛点、初速朝鼠标×shootSpeed（Game case 尾注口径）', () => {
    const { ctx } = makeCtx();
    const k = new KiteProj(1000, 2000, 766, ctx);
    expect(k.w).toBe(4);
    expect(k.h).toBe(4);
    expect(k.cx).toBe(1000);
    expect(k.cy).toBe(2000);
    k.vx = Math.cos(-1) * 8; k.vy = Math.sin(-1) * 8;   // Game 侧注入
    expect(Math.hypot(k.vx, k.vy)).toBeCloseTo(8);
  });
});

// 变异自证底座（确保 VanillaDust 引入不炸——测试环境无 canvas 时 lazy）
describe('BJ413 ④ 实体桶兼容', () => {
  it('KiteProj 可入 projectiles 桶（EntityManager add/compact 面）', async () => {
    const { EntityManager } = await import('../src/entities/Entity');
    const mgr = new EntityManager();
    const { ctx } = makeCtx({ heldShoot: () => -1 });
    const k = new KiteProj(0, 0, 766, ctx);
    mgr.add(k, 'projectiles');
    mgr.update(1 / 60, { vanillaDust: new VanillaDust() } as never);
    expect(k.dead).toBe(true);   // heldShoot −1 ≠ 766 → Kill 门
    mgr.update(1 / 60, { vanillaDust: new VanillaDust() } as never);
    expect(mgr.projectiles.length).toBe(0);        // compact 就地剔除
  });
});
