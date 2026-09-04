// 弹幕通用湿段接入测试（2026-09-04 溅花缺口批——BallProjs 155/861 + ChumBucketProj 820）：
//   三个专属弹实体类接入 projWetSection 共享体（Projectile.cs:16903-17113 全体弹共用段
//   + NewProjectile :10886-10892 出生预置 + HandleMovement :17721-17764 湿阻尼）。
//   断言锚点：
//   · 155 沙滩球：入水免溅（:16948 type!=155 门）+ 出水 velocity.Y×0.5（:16980-16981,
//     无溅花无冷却窗——else-if 序）+ AI_032 湿旗消费（:27356-27381 读上拍字段）
//   · 861 橄榄球：入水溅花 10 粒（:16948-16976 共享体 wetSplashStepShared）+
//     AI 无湿分支（:23692-23729 原文无 wet 消费者）+ 湿阻尼 ×0.5 进位移
//   · 820 打窝桶：入水溅花（通用湿段）与 AI_163 自身入水物理（:54439-54494）两支
//     都跑 + AI_061_FishingBobber_GetWaterLine（:54805-54830）三档+盒底回退逐值
//     （深桶上浮至液面=原版本相，旧 found 门放任下沉偏差已退役）+ 出生预置先于首拍 AI
//   · 湿旗跃迁/三清（:17103-17108）/wetCount 冷却窗（:16984 置 10/:17109-17112 递减）
//   · 阻尼档（:17721-17764 微光 0.375/蜂蜜 0.25/水 0.5/干 1,速度场不减只削位移）
import { describe, it, expect } from 'vitest';
import { BeachBallProj, FootballProj } from '../src/entities/BallProjs';
import { ChumBucketProj } from '../src/entities/ChumBucketProj';
import { projWaterDragFactor } from '../src/entities/projWetSection';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const WATER = 1;

function makeGame(store: TileStore) {
  const dusts: Array<{ x: number; y: number; w: number; h: number; type: number }> = [];
  const sfx: string[] = [];
  const game = {
    world: { store } as never,
    player: { x: -9999, y: -9999, w: 20, h: 42, cx: 0, cy: 0, vx: 0, vy: 0, dead: true, facing: 1 },
    enemies: () => [], critters: () => [], npcs: () => [], projectiles: () => [],
    spawnDrop: () => null, spawnParticles: () => {},
    spawnDust: (x: number, y: number, w: number, h: number, type: number) => {
      dusts.push({ x, y, w, h, type });
      return { vx: 0, vy: 0, scale: 1, alpha: 0, noGravity: true, color: null };
    },
    playSfxWav: (f: string) => { sfx.push(f); },
  } as unknown as GameHooks & { dusts: typeof dusts; sfx: typeof sfx };
  return Object.assign(game, { dusts, sfx });
}

/** 挖池：x0..x1 列、y0..y1 行满液 255 + 底盘石台 */
function makePool(store: TileStore, x0: number, x1: number, y0: number, y1: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) store.setLiquid(x, y, 255, WATER);
    store.setTileSilent(x, y1 + 1, 1, 0, 0);   // 池底石台（下落弹驻底用）
  }
}

interface Transitions { enters: number[]; exits: number[] }

/** 跑 n 拍并记录 dry→wet / wet→dry 跃迁拍号 */
function runTicks(p: { fixedUpdate: (dt: number, g: GameHooks) => void; wet: boolean },
  g: GameHooks, n: number): Transitions {
  const t: Transitions = { enters: [], exits: [] };
  let prev = p.wet;
  for (let i = 0; i < n; i++) {
    p.fixedUpdate(1 / 60, g);
    if (p.wet && !prev) t.enters.push(i);
    if (!p.wet && prev) t.exits.push(i);
    prev = p.wet;
  }
  return t;
}

describe('155 沙滩球：入水免溅 + 出水 vy×0.5（:16948/:16980-16981）', () => {
  it('入水/出水全循环零溅花零水声（type==155 双门:入水免溅,出水走 vy×0.5 支无 Splash）', () => {
    const store = new TileStore(120, 80);
    makePool(store, 36, 44, 20, 24);
    const g = makeGame(store);
    const ball = new BeachBallProj(40 * TILE, 17 * TILE, 2, 0);   // 干抛落池（vx≠0 避水中 vx==0 杀）
    const tr = runTicks(ball, g, 120);
    expect(tr.enters.length).toBeGreaterThanOrEqual(1);           // 发生过入水跃迁
    expect(tr.exits.length).toBeGreaterThanOrEqual(1);            // ……与出水跃迁（浮升族 :27362-27372）
    expect(g.dusts.length).toBe(0);                               // ★入水/出水均无溅花（弹面 10 粒全免）
    expect(g.sfx.length).toBe(0);                                 // 无 Splash_* 水声
    expect(ball.wetCount).toBe(0);                                // 出水不走冷却窗支（else-if 序）
    expect(ball.dead).toBe(false);                                // 水面浮沉循环存活（vx 未衰尽）
  });

  it('出水拍 vy×0.5 逐值（:16980-16981——AI 浮升 vy−0.1 后段尾 ×0.5）', () => {
    const store = new TileStore(120, 80);
    makePool(store, 36, 44, 20, 24);
    const g = makeGame(store);
    // 出生即水下（出生预置 :10887 wet=true）→ 稳定一拍后传送出水
    const ball = new BeachBallProj(40 * TILE + 8, 23 * TILE, 1, 0);
    ball.fixedUpdate(1 / 60, g);
    expect(ball.wet).toBe(true);
    (ball as { y: number }).y = 17 * TILE;                        // 盒湿带 [py+11,py+33] 全离水
    (ball as { vy: number }).vy = 0;
    ball.fixedUpdate(1 / 60, g);
    // 出水拍 AI（上拍 wet=true）:vy==0 → 浮升 vy=−0.1;湿段 flag2=false → 155 支 vy×0.5
    expect(ball.vy).toBe((0 - 0.1) * 0.5);
    expect(g.dusts.length).toBe(0);                               // 出水无溅花
  });
});

describe('861 橄榄球：入水溅花 10 粒 + 湿阻尼（:16948-16976/:17721-17764）', () => {
  it('入水跃迁拍弹面 10 粒尘（Dust.dustWater 桶）+ 后续拍不再拍', () => {
    const store = new TileStore(120, 80);
    makePool(store, 36, 44, 20, 24);
    const g = makeGame(store);
    const fb = new FootballProj(40 * TILE, 17 * TILE, 0, 0.2, 0, false);
    const d0 = runTicks(fb, g, 2);
    expect(d0.enters.length).toBe(0);
    const before = g.dusts.length;
    let enterAt = -1;
    for (let i = 0; i < 120; i++) {
      const wasWet = fb.wet;
      fb.fixedUpdate(1 / 60, g);
      if (!wasWet && fb.wet) { enterAt = i; break; }
    }
    expect(enterAt).toBeGreaterThanOrEqual(0);
    expect(fb.wet).toBe(true);
    expect(g.dusts.length - before).toBe(10);                     // ★恰 10 粒（:16954 循环）
    expect(g.sfx.length).toBe(1);                                 // Splash_1 恰一次（循环内去重单口）
    expect(g.sfx[0]).toContain('Splash');
    // 沉底后续拍无追加溅花（wet 恒真无跃迁）
    const mark = g.dusts.length;
    for (let i = 0; i < 20; i++) fb.fixedUpdate(1 / 60, g);
    expect(g.dusts.length).toBe(mark);
  });

  it('AI 型专段无 wet 分支（:23692-23729 原文）——湿拍速度场不减、位移 ×0.5', () => {
    const store = new TileStore(120, 80);
    makePool(store, 36, 44, 20, 24);
    const g = makeGame(store);
    const fb = new FootballProj(40 * TILE, 21 * TILE, 0, 1, 0, false);   // 出生水中（预置 wet=true）
    const y0 = fb.y;
    const vy0 = fb.vy;
    fb.fixedUpdate(1 / 60, g);
    expect(fb.vy).toBe(vy0 + 0.1);                                // 速度场原样 +0.1（无湿减）
    expect(fb.y - y0).toBeCloseTo((vy0 + 0.1) * 0.5, 12);         // ★位移恰半（wetVelocity ×0.5;moveAndCollide 子步 FP 容差）
    // 干对照：同速度出场位移 = 全速
    const fb2 = new FootballProj(20 * TILE, 21 * TILE, 0, 1, 0, false);
    const y20 = fb2.y;
    fb2.fixedUpdate(1 / 60, g);
    expect(fb2.y - y20).toBeCloseTo(vy0 + 0.1, 12);               // 干对照全速位移（FP 容差）
  });
});

describe('820 打窝桶：通用湿段溅花 + AI_163 自身入水物理两支并存', () => {
  it('入水跃迁拍溅花 10 粒;同拍 AI 仍走干支（上拍旗）,次拍起 AI_163 湿支 vx×0.9', () => {
    const store = new TileStore(120, 80);
    makePool(store, 36, 44, 20, 24);
    const g = makeGame(store);
    const bucket = new ChumBucketProj(40 * TILE, 17 * TILE, 1, 0.2);
    // 入水前一拍：干物理（vx×0.98;vy+0.3）
    let enterAt = -1;
    let vxPre = 0;
    for (let i = 0; i < 120; i++) {
      const wasWet = bucket.wet;
      vxPre = bucket.vx;
      bucket.fixedUpdate(1 / 60, g);
      if (!wasWet && bucket.wet) { enterAt = i; break; }
    }
    expect(enterAt).toBeGreaterThanOrEqual(0);
    expect(g.dusts.length).toBe(10);                              // ★通用湿段溅花恰 10 粒
    // 入水拍 AI 读上拍（干）旗 → vx 恒 ×0.98（干支）,非 ×0.9
    expect(bucket.vx).toBeCloseTo(1 * Math.pow(0.98, enterAt + 1), 9);
    // 次拍：AI_163 湿支（:54440 vx×0.9）
    const vxWet0 = bucket.vx;
    bucket.fixedUpdate(1 / 60, g);
    expect(bucket.vx).toBe(vxWet0 * 0.9);
  });

  it('AI_163 液面收敛逐值（:54472-54485 + :54805 GetWaterLine 三档+盒底回退）——深桶上浮钉液面', () => {
    const store = new TileStore(120, 80);
    makePool(store, 36, 44, 20, 24);                              // 表层行 20,液面线=21*16−15=321
    const g = makeGame(store);
    // 出生深水（预置 wet=true → 首拍 AI 即湿支）
    const bucket = new ChumBucketProj(40 * TILE + 8, 23 * TILE + 8, 1, 2);
    bucket.fixedUpdate(1 / 60, g);
    expect(bucket.wet).toBe(true);
    expect(g.dusts.length).toBe(0);                               // ★出生已湿:预置置 wet → 湿段入水门 !wet 封死（原版 :10887 同构,无出生溅花）
    expect(bucket.vx).toBe(1 * 0.9);                              // 首拍 AI 即湿支（预置先于 AI）
    expect(bucket.vy).toBe(2 * 0.5 - 0.1);                        // vy>0 ×0.5（:54460-54462）后 −0.1
    expect(bucket.cy - (23 * TILE + 8)).toBeCloseTo(bucket.vy * 0.5, 12);   // 位移 ×0.5（湿阻尼;cy 合成 FP 容差）
    // 上浮收敛：桶心 → 液面线 321（表层行 20 顶 +1）
    for (let i = 0; i < 240 && bucket.cy > 321.5; i++) bucket.fixedUpdate(1 / 60, g);
    expect(bucket.cy).toBeLessThan(323);                          // 钉在液面（旧 found 门版恒下沉=偏差已退役）
    // 液面稳态：AI 每拍 vy=线−cy 微拉,位移减半 → cy 收敛不发散
    const cyStable = bucket.cy;
    for (let i = 0; i < 30; i++) bucket.fixedUpdate(1 / 60, g);
    expect(Math.abs(bucket.cy - cyStable)).toBeLessThan(2);
  });

  it('出生盒底回退档（GetWaterLine :54807 三档全空 → num6=position.Y+height）', () => {
    const store = new TileStore(120, 80);
    // 液体只在右邻列 41（桶湿带 x=[px+1,px+11] 伸入 41 列,中心列 40 三档窗全空）→ 回退线=盒底
    for (let y = 20; y <= 24; y++) store.setLiquid(41, y, 255, WATER);
    const g = makeGame(store);
    const bucket = new ChumBucketProj(40 * TILE + 14, 22 * TILE, 0, 2);
    bucket.fixedUpdate(1 / 60, g);
    // 湿带 [px+1,px+11]×[py+3,py+9] 触邻列液 → wet=true（WetCollision 全盒域,非弹心单格）
    expect(bucket.wet).toBe(true);
    // 回退线 = y+h（盒底）;cy(=y+6) < 线(=y+12) → else 直拉 vy = 线−cy（:54482-54485）
    expect(bucket.vy).toBe((bucket.y + bucket.h) - bucket.cy);
  });
});

describe('湿旗跃迁 / 三清 / wetCount 冷却窗（:16921-16926/:17103-17112）', () => {
  it('出水拍 !wet 三清（lavaWet/honeyWet/shimmerWet 复位）+ wetCount 置 10 后逐拍递减', () => {
    const store = new TileStore(120, 80);
    makePool(store, 36, 44, 20, 24);
    const g = makeGame(store);
    const fb = new FootballProj(40 * TILE, 21 * TILE, 0, 0.2, 0, false);   // 出生水中（vy≠0 避静止杀早退吞湿段）
    fb.fixedUpdate(1 / 60, g);
    expect(fb.wet).toBe(true);
    fb.lavaWet = true; fb.honeyWet = true; fb.shimmerWet = true;         // 人为满旗（粘滞置位态）
    (fb as { y: number }).y = 12 * TILE;                                 // 传送离水（干空气）
    fb.fixedUpdate(1 / 60, g);
    expect(fb.wet).toBe(false);                                          // 出水跃迁
    expect(fb.lavaWet).toBe(false);                                      // ★:17103-17108 三清
    expect(fb.honeyWet).toBe(false);
    expect(fb.shimmerWet).toBe(false);
    expect(fb.wetCount).toBe(10 - 1);                                    // 置 10（:17029-17031）后当拍递减（:17109-17112）
    expect(g.dusts.length).toBe(10);                                     // 出水溅花恰 1 次 10 粒
    const mark = g.dusts.length;
    for (let i = 0; i < 9; i++) fb.fixedUpdate(1 / 60, g);
    expect(fb.wetCount).toBe(0);                                         // 冷却窗走完
    expect(g.dusts.length).toBe(mark);                                   // 窗内干拍无溅花
  });

  it('入水跃迁置 wet=true 且 wetCount 不置（冷却窗仅出水支设）', () => {
    const store = new TileStore(120, 80);
    makePool(store, 36, 44, 20, 24);
    const g = makeGame(store);
    const fb = new FootballProj(40 * TILE, 17 * TILE, 0, 0.2, 0, false);
    for (let i = 0; i < 120 && !fb.wet; i++) fb.fixedUpdate(1 / 60, g);
    expect(fb.wet).toBe(true);
    expect(fb.wetCount).toBe(0);
  });
});

describe('湿位移阻尼档（HandleMovement :17721-17764 projWaterDragFactor）', () => {
  it('微光 0.375 / 蜂蜜 0.25 / 水 0.5 / 干 1;微光>蜂蜜>水 优先序', () => {
    expect(projWaterDragFactor({ wet: true, honeyWet: false, shimmerWet: false })).toBe(0.5);
    expect(projWaterDragFactor({ wet: false, honeyWet: true, shimmerWet: false })).toBe(0.25);
    expect(projWaterDragFactor({ wet: false, honeyWet: false, shimmerWet: true })).toBe(0.375);
    expect(projWaterDragFactor({ wet: false, honeyWet: false, shimmerWet: false })).toBe(1);
    expect(projWaterDragFactor({ wet: true, honeyWet: true, shimmerWet: true })).toBe(0.375);
    expect(projWaterDragFactor({ wet: true, honeyWet: true, shimmerWet: false })).toBe(0.25);
  });
});
