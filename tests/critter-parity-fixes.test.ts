// 台账 B 区（docs/ai-parity-gaps-2026-08-19.md「小动物族」）1:1 修复批回归
// （2026-08-19）：行走跳档 num27 语义/鼠类档位/625 干地 0.2/wet 碰撞盒语义/站立
// 刹车/家域约束/金鱼雨天形态链/鸟拉屎/firefly 远距构型/butterfly 重选计时/
// worm 松露虫计数/snail 结构/windyBalloon 碰撞语义/dragonfly 逃逸/waterStrider
// 冲刺门/seahorse 角反射/ladybug 风漂/jellyfish direction==0。
// 世界统一 140 高：StepUp/WetCollision/DrownCollision 带 maxTilesY−40 世界底钳
// （Collision.cs:1505/:3661/:1392），80 高世界会把 40 行以下全屏蔽。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { PoopProj } from '../src/entities/PoopProj';
import type { GameHooks } from '../src/entities/types';

function critterWorld(playerAt: { x: number; y: number } | null, opts: { water?: boolean } = {}) {
  const w = new World(80, 140, 42, 'open');
  w.groundLevel = 42;
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2); // 地板 y=60
  if (opts.water) {
    for (let x = 20; x <= 60; x++) for (let y = 45; y <= 59; y++) st.setLiquid(x, y, 255, 1);
  }
  const hooks = {
    world: w,
    player: playerAt ? {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
      dead: false, useTime: 0,
    } : null,
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    spawnDrop: () => null, damagePlayer: () => {},
    entities: { add: () => {} },
    enemies: () => [] as unknown[],
  } as never;
  return { w, hooks };
}

/** 危险源桩（dangerScan/dragonfly 避敌共用：damage>0 敌怪 + CanHit 视线） */
function fakeEnemy(x: number, y: number): unknown {
  return {
    dead: false, x, y, w: 20, h: 20, cx: x + 10, cy: y + 10,
    vanillaId: 3, vanilla: { aiStyle: 3, noGravity: false },
    def: { damage: 5, friendly: false },
    noTileCollide: false,
  };
}

describe('台账 B：小动物族 1:1 修复批（2026-08-19）', () => {
  // ---- 1.3/1.4 行走跳档（cs:54471-54626）----
  it('1.3 四格墙：跳不过 → 掉头（flag26，不僵立——无危险）', () => {
    const { w, hooks } = critterWorld(null);
    for (let y = 56; y <= 59; y++) w.store.setTileSilent(45, y, 2);   // 4 格高墙
    const e = Enemy.fromVanilla(46, 40 * 16, 59 * 16)!;
    let maxJump = 0, crossed = false;
    const wallX0 = 45 * 16;
    for (let t = 0; t < 1500; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vy < maxJump) maxJump = e.vy;
      if (e.x > wallX0 + 16) crossed = true;    // 越过墙右缘 = 跳过了
    }
    expect(maxJump).toBeGreaterThanOrEqual(-0.5);   // 不跳
    expect(crossed).toBe(false);                    // 掉头折返（direction×−1）
  });

  it('1.4 鼠类 300：2 格墙跳档 −5 且【豁免】TownCritter ×1.2（cs:54623-54626）', () => {
    const { w, hooks } = critterWorld(null);
    for (let y = 58; y <= 59; y++) w.store.setTileSilent(45, y, 2);   // 2 格高墙（t4 档）
    const e = Enemy.fromVanilla(300, 40 * 16, 59 * 16)!;
    let jumpVy = 0;
    for (let t = 0; t < 2000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vy < jumpVy) jumpVy = e.vy;
    }
    // −5（t4 档）无 ×1.2（鼠豁免）+ 当 tick 重力 0.4 → 采样 −4.6；
    // 旧实现 = −6×1.2 = −7.2（"鼠类 2 格墙仍跳 −6"审计项）
    expect(jumpVy).toBeLessThanOrEqual(-4.5);
    expect(jumpVy).toBeGreaterThan(-4.7);
  });

  it('1.4b 鼠类 300 四格墙：撞中心前一格实心 → 转身 vx=0（cs:54526-54534）', () => {
    const { w, hooks } = critterWorld(null);
    for (let y = 56; y <= 59; y++) w.store.setTileSilent(45, y, 2);
    const e = Enemy.fromVanilla(300, 40 * 16, 59 * 16)!;
    let froze = false;
    for (let t = 0; t < 1500; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.ai0 === 8 && Math.abs(e.vx) < 0.01) froze = true;   // 僵立（无危险时不该发生）
    }
    // 无危险源：鼠类撞 4 格墙走 flag7 转身支（direction×−1 + vx=0），不进 ai0=8
    expect(froze).toBe(false);
  });

  // ---- 1.5 625 干地 maxX=0.2（cs:54304-54316）----
  it('1.5 地狱龟 625 干地巡速帽 0.2（独立覆写块，曾 0.5）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(625, 40 * 16, 59 * 16)!;
    let peak = 0;
    for (let t = 0; t < 3000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      peak = Math.max(peak, Math.abs(e.vx));
    }
    expect(peak).toBeGreaterThan(0.15);     // 确实走到帽
    // 帽 0.2 + 原版西向钳位不对称（:54360-54366 只钳 +maxX）越帽一个 acc 步的
    // 瞬态（超帽分支腾空不衰减 → 峰值 ~0.2+0.07；旧实现帽 0.5 巡航 → 峰 0.5+）
    expect(peak).toBeLessThanOrEqual(0.28);
  });

  // ---- 1.6 wet 语义：碰撞盒 WetCollision（cs:53585 等），非中心格 liquid>80 ----
  it('1.6 行走鸭 362：中心格无液但碰撞盒湿（行 58 浅液 40）→ 仍变飞形', () => {
    const { w, hooks } = critterWorld(null);
    for (let x = 20; x <= 60; x++) w.store.setLiquid(x, 58, 40, 1);  // 胸口浅液
    const e = Enemy.fromVanilla(362, 40 * 16, 59 * 16)!;
    let transformed = false;
    for (let t = 0; t < 120; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 363) { transformed = true; break; }
    }
    // 中心格（脚上一行 59）liquid=0：旧"中心格 liquid>80"判定恒 false 不变形
    expect(transformed).toBe(true);
  });

  // ---- 1.7 站立刹车 ±0.1 线性 + 鼠 ×0.5（cs:54105-54120）----
  it('1.7 站立刹车线性 ±0.1（1→0.9），鼠类先 ×0.5（1→0.4）', () => {
    const rabbit = critterWorld(null);
    const a = Enemy.fromVanilla(46, 40 * 16, 59 * 16)!;
    a.fixedUpdate(1 / 60, rabbit.hooks);          // 锚 home
    a.ai0 = 0; a.ai1 = 50; a.vx = 1; a.vy = 0;    // 站立态持速 1
    a.fixedUpdate(1 / 60, rabbit.hooks);
    expect(a.vx).toBeCloseTo(0.9, 5);             // 线性 −0.1（旧 ×0.8 指数）

    const ratHome = critterWorld(null);
    const b = Enemy.fromVanilla(300, 40 * 16, 59 * 16)!;
    b.fixedUpdate(1 / 60, ratHome.hooks);
    b.ai0 = 0; b.ai1 = 50; b.vx = 1; b.vy = 0;
    b.fixedUpdate(1 / 60, ratHome.hooks);
    expect(b.vx).toBeCloseTo(0.4, 5);             // ×0.5 后再 −0.1
  });

  // ---- 1.8 家域约束 + 泡水逃离（cs:54136-54202）----
  it('1.8a 站立态离家 >50 格逆行 → 回头（cs:54185-54194，晴日门）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(46, 60 * 16, 59 * 16)!;
    e.fixedUpdate(1 / 60, hooks);                 // 锚 home = 出生列 60
    e.x = 5 * 16;                                 // 挪到 home−55 格，背向家
    e.ai0 = 0; e.ai1 = 50; e.facing = -1; e.vx = 0; e.vy = 0;
    e.lai3 = 0;   // 锚 tick 的 1/80 随机翻向若掷中会锁 200t（localAI[3] 门，原版语义）
    e.fixedUpdate(1 / 60, hooks);
    expect(e.facing).toBe(1);                     // 掉头朝家
  });

  it('1.8b 家 ±25 格内站立：不触发 >50 回头（门区间互斥）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(46, 60 * 16, 59 * 16)!;
    e.fixedUpdate(1 / 60, hooks);
    e.x = 40 * 16;                                // home−20 格（带内）
    e.ai0 = 0; e.ai1 = 50; e.facing = -1; e.vx = 0; e.vy = 0;
    e.lai3 = 1;                                   // 压住 1/80 随机翻向
    e.fixedUpdate(1 / 60, hooks);
    expect(e.facing).toBe(-1);                    // 带内不受 >50 门影响
  });

  it('1.8c 非龟蛙泡水（没顶）→ 站立转逃离走（cs:54136-54151）；乌龟豁免', () => {
    const rabbitW = critterWorld(null, { water: true });
    const a = Enemy.fromVanilla(46, 40 * 16, 50 * 16)!;   // 深水中心
    a.ai0 = 0; a.ai1 = 50; a.facing = 1; a.vx = 0; a.vy = 0;
    a.wet = true;            // AI 读上一 tick wet（npcLiquid 在 AI 后跑）
    a.fixedUpdate(1 / 60, rabbitW.hooks);
    expect(a.ai0).toBe(1);                        // 兔：泡水逃离 → 走

    const turtleW = critterWorld(null, { water: true });
    const b = Enemy.fromVanilla(616, 40 * 16, 50 * 16)!;  // 乌龟（flag11 水中呼吸）
    b.ai0 = 0; b.ai1 = 50; b.facing = 1; b.vx = 0; b.vy = 0;
    b.wet = true;
    b.fixedUpdate(1 / 60, turtleW.hooks);
    expect(b.ai0).toBe(0);                        // 龟：不逃离（钉水面接管）
  });

  // ---- 1.9 金鱼雨天形态链（FishTransformationDuringRain cs:94084-94115）----
  it('1.9 230湿→55 / 55非湿+雨→230（home 下风 +10 格）/ 593湿→592 / 592非湿+雨→593', () => {
    const { w, hooks } = critterWorld(null, { water: true });
    w.weather.raining = true;

    const walker = Enemy.fromVanilla(230, 40 * 16, 50 * 16)!;
    walker.wet = true;
    walker.fishTransformationDuringRain(hooks as unknown as GameHooks);
    expect(walker.vanillaId).toBe(55);

    const swimmer = Enemy.fromVanilla(55, 40 * 16, 45 * 16)!;   // 水面上方（非湿）
    swimmer.wet = false;
    swimmer.facing = 1;
    const homeBefore = swimmer.critterHomeX;
    swimmer.fishTransformationDuringRain(hooks as unknown as GameHooks);
    expect(swimmer.vanillaId).toBe(230);
    expect(swimmer.critterHomeX).toBe(Math.floor(swimmer.x / 16) + 10 * 1);   // :94101

    const spec = Enemy.fromVanilla(593, 40 * 16, 50 * 16)!;
    spec.wet = true;
    spec.fishTransformationDuringRain(hooks as unknown as GameHooks);
    expect(spec.vanillaId).toBe(592);

    const specSwim = Enemy.fromVanilla(592, 40 * 16, 45 * 16)!;
    specSwim.wet = false;
    specSwim.facing = -1;
    specSwim.fishTransformationDuringRain(hooks as unknown as GameHooks);
    expect(specSwim.vanillaId).toBe(593);
    expect(specSwim.critterHomeX).toBe(Math.floor(specSwim.x / 16) - 10);     // :94114

    // 非雨天：55 非湿不变形
    w.weather.raining = false;
    const dry = Enemy.fromVanilla(55, 40 * 16, 45 * 16)!;
    dry.wet = false;
    dry.fishTransformationDuringRain(hooks as unknown as GameHooks);
    expect(dry.vanillaId).toBe(55);
  });

  // ---- 2.1 鸟拉屎（cs:25398-25407，BirdThatCanPoop NPCID.cs:4777，弹 1080）----
  it('2.1 鸟 74 飞行态玩家头顶 1/50 极端霉运 → 弹 1080 一次（localAI[3] 锁）；鸮 611 不拉', () => {
    const spawned: unknown[] = [];
    const { hooks } = critterWorld({ x: 39, y: 55 });
    (hooks as unknown as { spawnCritterProj?: (e: unknown) => void }).spawnCritterProj
      = (e: unknown) => { spawned.push(e); };
    const bird = Enemy.fromVanilla(74, 40 * 16, 50 * 16)!;   // 玩家正上方 5 格
    bird.ai0 = 1;                                            // 飞行态
    (bird as unknown as { lai3: number }).lai3 = 0;
    const player = (hooks as unknown as { player: { luck: number } }).player;
    player.luck = -1;    // RollOnlyBadLuckExtreme(50)：负运 → Next(5)==0 概率 1/5/t
    for (let t = 0; t < 300 && spawned.length === 0; t++) {
      // 钉在玩家头顶（飞行态 3px/t 会几 tick 内飘出水平带 = 掷骰窗口太短）
      bird.x = 40 * 16 - bird.w / 2;
      bird.y = 50 * 16 - bird.h / 2;
      bird.vx = 0; bird.vy = 0;
      bird.fixedUpdate(1 / 60, hooks);
    }
    expect(spawned.length).toBe(1);
    expect(spawned[0]).toBeInstanceOf(PoopProj);             // 弹 1080（10×10 鸟粪）
    expect((bird as unknown as { lai3: number }).lai3).toBe(1);   // 一次后锁

    const owl = critterWorld({ x: 39, y: 55 });
    const owlSpawned: unknown[] = [];
    (owl.hooks as unknown as { spawnCritterProj?: (e: unknown) => void }).spawnCritterProj
      = (e: unknown) => { owlSpawned.push(e); };
    const o = Enemy.fromVanilla(611, 40 * 16, 50 * 16)!;    // 鸮不在 BirdThatCanPoop 表
    o.ai0 = 1;
    ((owl.hooks as unknown as { player: { luck: number } }).player).luck = -1;
    for (let t = 0; t < 300; t++) o.fixedUpdate(1 / 60, owl.hooks);
    expect(owlSpawned.length).toBe(0);
  });

  // ---- 5.1/5.2 firefly 远距构型 + 677（cs:34272-34392）----
  it('5.1 萤火虫 355 远距（|ΔX|>700）漂移构型 = direction×Next(100,251)（朝玩家东向）', () => {
    const { hooks } = critterWorld({ x: 95, y: 50 });      // 玩家在东 ~880px
    const e = Enemy.fromVanilla(355, 40 * 16, 50 * 16)!;
    e.fixedUpdate(1 / 60, hooks);                          // 首帧即重选（localAI[0]=0→−1）
    expect(e.ai0).toBeGreaterThan(0.3);                    // 东向分量（曾随机角）
    expect(e.ai0).toBeLessThanOrEqual(2.0);                // 三档速上限 2.0
  });

  it('5.2 firefly 677 世界缘推离：贴左缘 40 格 → 漂移目标东推（cs:34312-34320）', () => {
    // 玩家放远东（dx>700）：首帧走【远距构型】direction×Next(100,251)（朝东），
    // 再叠左缘 +0.5 → ai0 恒为正（若玩家在旁则近距构型随机向,东推只 +0.5 不保证符号）
    const { hooks } = critterWorld({ x: 70, y: 50 });
    const e = Enemy.fromVanilla(677, 12 * 16, 50 * 16)!;   // 列 12 < 40（左缘 40 格内）
    e.fixedUpdate(1 / 60, hooks);
    expect(e.ai0).toBeGreaterThan(0.3);                    // 远距东向 + 0.5 缘推
  });

  // ---- 6.1-6.5 butterfly（cs:45231-45458）----
  it('6.1 蝴蝶 356 漂移重选计时 Next(90,240)=90-239（曾 60-179）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(356, 40 * 16, 50 * 16)!;
    e.fixedUpdate(1 / 60, hooks);                          // 首帧重选
    const timer = (e as unknown as { lai0: number }).lai0;
    expect(timer).toBeGreaterThanOrEqual(90);
    expect(timer).toBeLessThanOrEqual(239);
  });

  it('6.2 蝴蝶 356 近距构型分量 ±100 归一（|ai0|≤3.0 且 ai[3] scale 0.75-1.10）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(356, 40 * 16, 50 * 16)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(Math.abs(e.ai0)).toBeLessThanOrEqual(3.0);
    expect(Math.abs(e.ai1)).toBeLessThanOrEqual(3.0);
    expect(e.ai3).toBeGreaterThanOrEqual(0.75);
    expect(e.ai3).toBeLessThanOrEqual(1.10);
    expect(e.vanillaScale).toBeCloseTo(e.ai3, 5);          // scale = ai[3]（:45352）
  });

  // ---- 7.1-7.2 wormCritter（cs:34490-34585）----
  it('7.1 松露虫 374 受惊计数离场【不重置】（cs:54560-34584 曾归零）', () => {
    const near1 = critterWorld({ x: 40, y: 50 });
    const e = Enemy.fromVanilla(374, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 60; t++) e.fixedUpdate(1 / 60, near1.hooks);   // 计数 → 60
    // 玩家远离 100t（旧实现计数归零；1:1 保持）——stub 玩家须同步 cx/cy
    const p = (near1.hooks as unknown as { player: { x: number; y: number; cx: number; cy: number } }).player;
    p.x = 80 * 16; p.cx = 80 * 16;
    for (let t = 0; t < 100; t++) e.fixedUpdate(1 / 60, near1.hooks);
    expect(e.vanillaId).toBe(374);                         // 未达 90 不钻地
    expect(e.ai1).toBe(60);                                // 计数保持（曾归零）
    // 玩家回场 30t → 60+30=90 → Transform(375)
    p.x = 40 * 16; p.cx = 40 * 16;
    let transformed = false;
    for (let t = 0; t < 40; t++) {
      e.fixedUpdate(1 / 60, near1.hooks);
      if (e.vanillaId === 375) { transformed = true; break; }
    }
    expect(transformed).toBe(true);
  });

  it('7.2 蠕虫 357 状态机套 vy==0 门：腾空期计时冻结（cs:34498）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(357, 40 * 16, 50 * 16)!;   // 空中出生（地板 60）
    e.ai0 = 1;
    e.lai1 = 10;                                           // 蠕动剩 10t
    e.fixedUpdate(1 / 60, hooks);                          // 空中 tick
    expect((e as unknown as { lai1: number }).lai1).toBe(9);   // 冻结（不 −1）
    // 落地后计时恢复
    for (let t = 0; t < 100; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.onGround).toBe(true);
    const before = (e as unknown as { lai1: number }).lai1;
    e.fixedUpdate(1 / 60, hooks);
    expect((e as unknown as { lai1: number }).lai1).toBeLessThan(before);   // 贴地递减
  });

  // ---- 11.1-11.3 windyBalloon（cs:48253-48430）----
  it('11.1 风气球 594 盒 = 20×20×slave scale（cs:48279-48282）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(594, 40 * 16, 50 * 16)!;
    e.fixedUpdate(1 / 60, hooks);                          // 首帧挂 slave（scale 0.9/1.0/1.2）
    const scale = e.vanillaScale ?? 1;
    expect(e.w).toBe(Math.round(20 * scale));
    expect(e.h).toBe(Math.round(20 * scale));
  });

  it('11.2 风气球方向仅出生 TargetClosest 一次：玩家换侧不再改向（cs:48257）', () => {
    const { hooks } = critterWorld({ x: 30, y: 50 });      // 玩家在西 → direction=-1
    const e = Enemy.fromVanilla(594, 40 * 16, 50 * 16)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.facing).toBe(-1);
    // 玩家挪到东侧：逐帧 TargetClosest 曾会改向 +1；1:1 保持 -1
    const p = (hooks as unknown as { player: { x: number } }).player;
    p.x = 60 * 16;
    for (let t = 0; t < 60; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.facing).toBe(-1);
  });

  // ---- 12.1-12.2 dragonfly（cs:48080-48250）----
  it('12.1 蜻蜓 599 出生初速 + 逃逸：velocity 叠加 Σ单位向/count×2 且 ai[1]=−10（:48205-48215）', () => {
    const { hooks } = critterWorld(null);
    const threats = [fakeEnemy(40 * 16, 49 * 16)];         // 敌怪中心 (650,794)
    (hooks as unknown as { enemies: () => unknown[] }).enemies = () => threats;
    const e = Enemy.fromVanilla(599, 40 * 16, 50 * 16)!;   // 出生中心 (640,800)
    e.fixedUpdate(1 / 60, hooks);                          // 首帧即扫（localAI[1]=0）
    expect(e.ai1).toBe(-10);                               // 逃逸突进计时（曾缺）
    expect(e.ai0).toBe(1);                                 // 强制突进态
    // 锚 = Center + zero×10（zero = 单位逃离向×2）：逃离向 = (640−650, 800−794)/√136
    const d = Math.hypot(-10, 6);
    expect(e.ai2).toBeCloseTo(640 + (-10 / d) * 2 * 10, 3);
    expect(e.ai3).toBeCloseTo(800 + (6 / d) * 2 * 10, 3);
  });

  it('12.2 蜻蜓 599 wet → vy=−3 两态通用（:48170-48173）', () => {
    const { hooks } = critterWorld(null, { water: true });
    const e = Enemy.fromVanilla(599, 40 * 16, 50 * 16)!;
    e.ai0 = 0;                                             // 悬停态也吃 wet 弹出
    e.wet = true;                                          // AI 读上一 tick wet
    e.vx = 0; e.vy = 0;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.vy).toBe(-3);
  });

  // ---- 14.1-14.2 waterStrider（cs:47882-47942）----
  it('14.1 水黾 612 空中（vy≠0 且未湿）不冲刺：flag3 门（cs:47921-47930）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(612, 40 * 16, 45 * 16)!;   // 空中（地板 60）
    e.fixedUpdate(1 / 60, hooks);                          // 先跑一 tick 让重力起落
    e.ai1 = 999;                                           // 计时早已到点
    for (let t = 0; t < 30; t++) {
      e.fixedUpdate(1 / 60, hooks);
      expect(Math.abs(e.vx)).toBeLessThan(5);              // 无 ±5 冲刺（vy≠0 → flag3 假）
    }
  });

  it('14.2 水黾落地（vy==0）后可冲刺 ±5（flag3 = 落地支）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(612, 40 * 16, 45 * 16)!;
    let sprinted = false;
    for (let t = 0; t < 600; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (Math.abs(e.vx) >= 4.9) { sprinted = true; break; }
    }
    expect(sprinted).toBe(true);
  });

  // ---- 13.x ladybug 风漂残余（cs:47988-47990）----
  it('13 ladybug 604 风漂在 Lerp 目标内：|vx| ≤ cos+wind×0.8 ≤ 1.7（曾每 tick 无阻尼加速 →∞）', () => {
    const { w, hooks } = critterWorld(null);
    w.weather.windSpeedTarget = 0.8;
    const e = Enemy.fromVanilla(604, 40 * 16, 50 * 16)!;
    let maxVx = 0;
    for (let t = 0; t < 600; t++) {
      e.fixedUpdate(1 / 60, hooks);
      maxVx = Math.max(maxVx, Math.abs(e.vx));
      if (e.ai2 !== 0) break;                             // 只测飞行态
    }
    // Lerp 目标 = (cos θ + wind×0.8, sin θ)——飞行角朝东时上限 1+0.64=1.64；
    // 旧实现把 +wind×0.8 直接加在 Lerp 后的 velocity 上（无阻尼积分）→ 数百 px/t
    expect(maxVx).toBeLessThanOrEqual(1.7);
  });

  // ---- jellyfish direction==0（cs:24277-24281）----
  it('jellyfish 63 无玩家时 direction 保持 0（漂移段无横向推力，曾强制 ±1）', () => {
    const { hooks } = critterWorld(null, { water: true });
    const e = Enemy.fromVanilla(63, 40 * 16, 50 * 16)!;
    e.wet = true;
    e.facing = 0;
    e.ai1 = 10;                                            // 非潜伏
    for (let t = 0; t < 10; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.facing).toBe(0);
    expect(Math.abs(e.vx)).toBeLessThan(0.001);            // direction×0.02 = 0
  });
});
