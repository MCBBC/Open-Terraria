// SW-X1 2026-09-04：红蓝四轮 findings 清偿回归（H-1/M-1/M-2/L-1）。
// 标杆 Terarria1457——H-1/BombSkeletronPrimeProj（Projectile.cs :47786-47800 平台判据 /
// :17305-17311 timeLeft-- / :17718 TileCollision 赋回 / :48004-48006 落地引信钳）、
// M-1/bossAI 炮臂（NPC.cs :28722 localAI+=2 与 :28838-28841/:28918-28921 计数终态）、
// L-1/655 蜂巢（Projectile.cs :26694-26710 X 自加速 / :26752 入水 Kill / :19382-19385
// 反弹 HitTiles+音 / :76611-76660 Kill 裂蜂落蜜）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_DEFS, T } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { BombSkeletronPrimeProj } from '../src/entities/BombSkeletronPrimeProj';
import { GrenadeProj } from '../src/entities/WeaponProj';
import { primePartAI } from '../src/entities/bossAI';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

const tid = (key: string) => TILE_DEFS.findIndex((d) => d.key === key);

/** 竖井开挖（世界生成地形随 seed 变化,开挖保证确定性空域） */
function carveShaft(w: World, col0: number, col1: number, row0: number, row1: number) {
  for (let x = col0; x <= col1; x++) {
    for (let y = row0; y <= row1; y++) w.store.setTileSilent(x, y, 0, 0, 0);
  }
}

interface Env {
  w: World;
  g: GameHooks;
  sounds: string[];
  hitFx: number[];
  deaths: number[];
  state: { exploded: boolean; explodeArgs: unknown[] | null };
}

function mkEnv(opts?: { floor?: boolean }): Env {
  const w = new World(80, 60, 30, 'open');
  if (opts?.floor !== false) {
    for (let x = 0; x < w.store.w; x++) w.store.setTileSilent(x, 50, T.DIRT, 0, 0);
  }
  const sounds: string[] = [];
  const hitFx: number[] = [];
  const deaths: number[] = [];
  const state = { exploded: false, explodeArgs: null as unknown[] | null };
  const g = {
    world: w, player: null, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDust: () => null, spawnParticles: () => {},
    playSfx: (name: string) => { sounds.push(name); },
    onProjectileDeath: (id: number) => { deaths.push(id); },
    hitTilesFx: () => { hitFx.push(1); },
    explodePrimeBomb102: (...a: unknown[]) => { state.exploded = true; state.explodeArgs = a; },
  } as unknown as GameHooks;
  return { w, g, sounds, hitFx, deaths, state };
}

function fakePlayer(x: number, y: number): Player {
  return { x: x - 10, y: y - 21, w: 20, h: 42, cx: x, cy: y, vx: 0, vy: 0, dead: false } as unknown as Player;
}

// ============================ H-1 引信死锁（实件全链） ============================
describe('SW-X1 H-1：Prime 炮弹 102 引信链（moveAndCollide 回写 + timeLeft 逐拍递减）', () => {
  it('全链：下落弹 → 触地 → 残差复读拍 → vy==0 落地引信钳 3 → 同拍 Kill 爆', () => {
    const env = mkEnv();
    carveShaft(env.w, 39, 41, 40, 49);                       // 井壁确定性:落柱内无杂格
    // 地面顶 y=800;弹心起点 (640,720) 距地 69px,vy=4 下落
    const b = new BombSkeletronPrimeProj(640, 720, 0, 4);
    const ys: number[] = [];
    let ticks = 0;
    while (!env.state.exploded && ticks < 200) { b.fixedUpdate(0, env.g); ys.push(b.y); ticks++; }
    expect(env.state.exploded).toBe(true);
    expect(env.deaths).toContain(102);                       // Kill 单口回执
    expect(ticks).toBeLessThan(60);                          // 引信链驱动,非 3600t 兜底
    // 爆拍引信恰 = 落地钳 3（:48004-48006 生效的直接证据;递减缺失时恒 3600）
    expect((b as unknown as { fuse: number }).fuse).toBe(3);
    // 触地（y 稳定）后 ≤3 拍内爆（vanilla 相位:触地拍 → 贴面复读拍 → vy==0 钳爆拍）
    let touchdown = -1;
    for (let i = 1; i < ys.length; i++) {
      if (Math.abs(ys[i] - ys[i - 1]) < 0.01) { touchdown = i - 1; break; }
    }
    expect(touchdown).toBeGreaterThanOrEqual(0);
    expect(ticks - touchdown).toBeLessThanOrEqual(3);
  });

  it('贴地出生：首拍 AI 读 vy==0 → 钳 3 → 同拍 Kill 爆（钳/爆同拍序）', () => {
    const env = mkEnv();
    const b = new BombSkeletronPrimeProj(640, 789, 0, 0);   // 弹底恰贴地面顶 800
    b.fixedUpdate(0, env.g);
    expect(env.state.exploded).toBe(true);
    expect((b as unknown as { fuse: number }).fuse).toBe(3);
  });

  it('timeLeft-- 每拍递减（:17305-17311）：空中 30 拍 fuse 3600→3570（3600t 兜底门基座）', () => {
    const env = mkEnv({ floor: false });
    carveShaft(env.w, 39, 41, 4, 55);                        // 竖井自由落体,无着陆面
    // ★vy=0.1 起（vanilla 本相:vy==0 起手即触发落地钳 ——:48004 只读 velocity.Y==0,
    //   与是否真的贴地无关,贴地出生用例已另钉）
    const b = new BombSkeletronPrimeProj(640, 100, 0, 0.1);
    for (let i = 0; i < 30; i++) b.fixedUpdate(0, env.g);
    expect(b.dead).toBe(false);
    expect((b as unknown as { fuse: number }).fuse).toBe(3570);
  });
});

// ============================ M-2 平台 Kill 判据收窄 ============================
describe('SW-X1 M-2：102 平台 Kill 判据 = active() && (Platforms{19,427,435-439} ∪ 380)', () => {
  const cx = 40 * TILE + 8, cy = 30 * TILE + 8;

  it('Platforms 集 ∪ 花盆箱 → 中心格即爆（木平台/花盆箱/团队平台）', () => {
    for (const key of ['platform', 'v_380_planter_boxes', 'v_427_red_team_platform',
      'v_435_green_team_platform']) {
      const env = mkEnv({ floor: false });
      const t = tid(key);
      expect(t).toBeGreaterThan(0);
      env.w.store.setTileSilent(40, 30, t, 0, 0);
      const b = new BombSkeletronPrimeProj(cx, cy, 0, 0);
      b.fixedUpdate(0, env.g);
      expect(env.state.exploded, `tile ${key}`).toBe(true);
    }
  });

  it('家具族（工作台,可站面）/矿车轨 239（可站面）→ 不杀（isPlatform 误判面收窄）', () => {
    for (const key of ['workbench', 'v_239_ore_bars']) {
      const env = mkEnv({ floor: false });
      carveShaft(env.w, 39, 41, 26, 49);                    // 井腔:排除生成地形着陆干扰
      env.w.store.setTileSilent(40, 30, tid(key), 0, 0);
      const b = new BombSkeletronPrimeProj(cx, cy, 0, 0.1); // vy≠0 起手,免落地钳伪爆
      for (let i = 0; i < 5; i++) b.fixedUpdate(0, env.g);
      expect(b.dead, `tile ${key}`).toBe(false);
    }
  });

  it('已致动平台:裸 active() 位仍在 → 仍杀（原版无 inActive 门,isActive 语义不采用）', () => {
    const env = mkEnv({ floor: false });
    carveShaft(env.w, 39, 41, 26, 49);
    env.w.store.setTileSilent(40, 30, tid('platform'), 0, 0);
    env.w.store.setActuated(40, 30, true);
    expect(env.w.store.isPlatform(40, 30)).toBe(false);      // 可站面=false（对照）
    const b = new BombSkeletronPrimeProj(cx, cy, 0, 0);
    b.fixedUpdate(0, env.g);
    expect(env.state.exploded).toBe(true);                   // 判据仍杀
  });
});

// ==================== M-1：炮臂射速周期（primePartAI 实件驱动） ====================
describe('SW-X1 M-1：Prime 炮臂（aiStyle 35）发弹周期/几何', () => {
  function mkArm() {
    const env = mkEnv({ floor: false });
    const head = Enemy.fromVanilla(127, 640, 300);
    const arm = Enemy.fromVanilla(128, 640, 300);
    expect(head && arm).toBeTruthy();
    expect(head!.vanilla?.aiStyle).toBe(32);
    expect(arm!.vanilla?.aiStyle).toBe(35);
    head!.id = 7; arm!.id = 8;
    arm!.ai1 = 7; arm!.ai0 = 1; arm!.ai2 = 0; arm!.ai3 = 0;
    (env.g as unknown as { enemies: () => unknown[] }).enemies = () => [head];
    const projs: BombSkeletronPrimeProj[] = [];
    (env.g as unknown as { entities: { add: (en: unknown, bucket: string) => void } }).entities.add =
      (en: unknown, bucket: string) => { if (bucket === 'projectiles') projs.push(en as BombSkeletronPrimeProj); };
    const player = fakePlayer(700, 700);
    return { env, head: head!, arm: arm!, projs, player };
  }

  it('悬停支:普通 141t/发、头旋冲 47t/发（:28722 localAI+=2 与 :28838-28841 计数终态）', () => {
    for (const [charge, period, want] of [[false, 141, 3], [true, 47, 7]] as const) {
      const { arm, head, projs, env, player } = mkArm();
      head.ai1 = charge ? 1 : 0;
      const fireTicks: number[] = [];
      for (let t = 0; t < 300; t++) {
        arm.aiT = t;
        const before = projs.length;
        primePartAI(arm, env.g, player);
        if (projs.length > before) fireTicks.push(t);
      }
      expect(fireTicks, `charge=${charge}`).toEqual([0, ...Array.from(
        { length: want - 1 }, (_, i) => (i + 1) * period)]);
    }
  });

  it('直冲支（ai2==1）:41t/发,无旋冲加成（:28918-28921 唯一 ++）;速 10 ±离散散布', () => {
    const { arm, head, projs, env, player } = mkArm();
    head.ai1 = 1;                                             // 旋冲态也不加成
    arm.ai2 = 1;
    const fireTicks: number[] = [];
    for (let t = 0; t < 300; t++) {
      arm.aiT = t;
      const before = projs.length;
      primePartAI(arm, env.g, player);
      if (projs.length > before) fireTicks.push(t);
    }
    expect(fireTicks).toEqual([0, 41, 82, 123, 164, 205, 246, 287]);
    const d = Math.hypot(projs[0].vx, projs[0].vy);
    expect(Math.abs(d - 10)).toBeLessThanOrEqual(0.6);        // num568=10 ±散布 ≤0.4/轴
  });

  it('散布 81 档离散 Next(-40,41)×0.01;出膛位 = center + velocity×4（散布并入后）', () => {
    const { arm, head, projs, env, player } = mkArm();
    head.ai1 = 0;
    let checked = 0;
    for (let t = 0; t < 141; t++) {
      arm.aiT = t;
      const before = projs.length;
      const cx0 = arm.cx, cy0 = arm.cy;
      primePartAI(arm, env.g, player);
      if (projs.length > before) {
        // 基准向 = 臂心→锚点反向（:28843-28849 num558/num559,anchor=head-200·side/头部+230）
        const dx = -(head.cx - 200 - cx0), dy = (head.y + 230) - cy0;
        const d = Math.hypot(dx, dy) || 1;
        for (const p of projs.slice(before)) {
          const sx = (p.vx - dx / d * 12) * 100, sy = (p.vy - dy / d * 12) * 100;
          expect(Number.isInteger(Math.round(sx))).toBe(true);    // 0.01 步进离散
          expect(Math.round(sx)).toBeGreaterThanOrEqual(-40);
          expect(Math.round(sx)).toBeLessThanOrEqual(40);
          expect(p.cx).toBeCloseTo(cx0 + p.vx * 4, 6);            // :28854-28855 ×4
          expect(p.cy).toBeCloseTo(cy0 + p.vy * 4, 6);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

// ==================== L-1：655 蜂巢四缺臂 ====================
describe('SW-X1 L-1：655 蜂巢（AI_025）X 自加速/入水 Kill/反弹 HitTiles+音', () => {
  it('① X 自加速（:26694-26710）:vy≤6 → 朝向 ±0.05/拍,|vx|≥7 停（开区间门）', () => {
    const run = (vx0: number, ticks: number) => {
      const env = mkEnv({ floor: false });
      carveShaft(env.w, 39, 41, 4, 55);
      const p = new GrenadeProj(640, 700, vx0, 0, 10, 3600, 655, () => {});
      for (let i = 0; i < ticks; i++) p.fixedUpdate(0, env.g);
      return p.vx;
    };
    expect(run(3, 1)).toBeCloseTo(3.05, 9);
    expect(run(3, 2)).toBeCloseTo(3.1, 9);
    expect(run(3, 3)).toBeCloseTo(3.15, 9);
    expect(run(7, 3)).toBe(7);                                // 门开区间 <7,恰 7 不加
    expect(run(-3, 3)).toBeCloseTo(-3.15, 9);                 // 反向对称
  });

  it('② 入水 Kill:wet 真值入回调（wet → 落蜜侧;曾硬编码 false）;干侧裂蜂', () => {
    // 湿:空腔+整格水(40,15),弹浸入 → 首拍 Kill,wet=true
    // ★水置 row15:wetCollision 扫描窗上界 = st.h−40（60 行测试世界=20 行,原版
    //   maxTilesY−40 钳制本相）→ 液体须置于 row<20 才入扫窗
    const wetEnv = mkEnv();
    carveShaft(wetEnv.w, 39, 41, 8, 19);
    wetEnv.w.store.setLiquid(40, 15, 255, 0);
    const wetKills: boolean[] = [];
    const wp = new GrenadeProj(40 * TILE, 15 * TILE, 0, 0, 10, 3600, 655, () => {});
    wp.w = 31; wp.h = 31;                                     // SetDefaults :7043-7045（Game 摇树 sink 同款）
    wp.onBeehiveKill = (wet) => { wetKills.push(wet); };
    wp.fixedUpdate(0, wetEnv.g);
    expect(wp.dead).toBe(true);
    expect(wetKills).toEqual([true]);
    // 干:撞墙 Kill → wet=false 裂蜂侧 + Kill 音 legacy4→'killed'
    const dryEnv = mkEnv();
    carveShaft(dryEnv.w, 42, 47, 40, 49);
    for (let y = 40; y < 50; y++) dryEnv.w.store.setTileSilent(48, y, T.DIRT, 0, 0);
    const dryKills: boolean[] = [];
    const dp = new GrenadeProj(44 * TILE, 45 * TILE, 5, 0, 10, 3600, 655, () => {});
    dp.onBeehiveKill = (wet) => { dryKills.push(wet); };
    for (let i = 0; i < 20 && !dp.dead; i++) dp.fixedUpdate(0, dryEnv.g);
    expect(dp.dead).toBe(true);
    expect(dryKills).toEqual([false]);
    expect(dryEnv.sounds).toContain('killed');
  });

  it("③ 反弹同拍 Collision.HitTiles + 音 0（'dig'）,反弹 vy=lastVy×-0.2 只弹不杀", () => {
    const env = mkEnv();
    carveShaft(env.w, 39, 41, 40, 49);
    const p = new GrenadeProj(640, 800 - 22 - 24, 0, 8, 10, 3600, 655, () => {});
    let bounced = false;
    for (let i = 0; i < 20 && !p.dead; i++) {
      p.fixedUpdate(0, env.g);
      if (p.vy < 0) { bounced = true; break; }                // 反弹拍即时捕获
    }
    expect(p.dead).toBe(false);                               // 只弹不杀
    expect(bounced).toBe(true);
    expect(env.hitFx.length).toBeGreaterThanOrEqual(1);       // HitTiles 砖屑尘
    expect(env.sounds).toContain('dig');                      // legacy 0
  });
});

// ==================== SW-AA1 F-2：激光臂出膛位/散布（2026-09-04） ====================
// 原文 :29080-29091（attached）/ :29159-29170（detached）——速度=单位×8/×10 先加
// 散布 Next(-40,41)×0.05（81 档离散）,出生位 = center + velocity×8（散布并入后）。
describe('SW-AA1 F-2：Prime 激光臂（aiStyle 36）出膛位/散布', () => {
  function mkLaserArm() {
    const env = mkEnv({ floor: false });
    const head = Enemy.fromVanilla(127, 640, 300);
    const arm = Enemy.fromVanilla(131, 640, 300);
    expect(head && arm).toBeTruthy();
    expect(arm!.vanilla?.aiStyle).toBe(36);
    head!.id = 7; arm!.id = 8;
    arm!.ai1 = 7; arm!.ai0 = 1; arm!.ai2 = 0; arm!.ai3 = 0;
    (env.g as unknown as { enemies: () => unknown[] }).enemies = () => [head];
    const projs: Array<{ x: number; y: number; vx: number; vy: number }> = [];
    (env.g as unknown as { entities: { add: (en: unknown, bucket: string) => void } }).entities.add =
      (en: unknown, bucket: string) => { if (bucket === 'projectiles') projs.push(en as typeof projs[number]); };
    const player = fakePlayer(700, 700);
    return { env, head: head!, arm: arm!, projs, player };
  }

  function assertGeometry(cx0: number, cy0: number, player: Player,
    projs: Array<{ x: number; y: number; vx: number; vy: number }>, before: number, speed: number) {
    const dx = player.cx - cx0, dy = player.cy - cy0;
    const d = Math.hypot(dx, dy) || 1;
    for (const p of projs.slice(before)) {
      const sx = Math.round((p.vx - dx / d * speed) * 20);
      const sy = Math.round((p.vy - dy / d * speed) * 20);
      expect(Number.isInteger(sx)).toBe(true);                       // 0.05 步进离散（81 档）
      expect(sx).toBeGreaterThanOrEqual(-40); expect(sx).toBeLessThanOrEqual(40);
      expect(sy).toBeGreaterThanOrEqual(-40); expect(sy).toBeLessThanOrEqual(40);
      expect(p.x).toBeCloseTo(cx0 + p.vx * 8, 6);                    // 出膛位 = center + velocity×8（cx0=发拍臂心,臂尾段位移前）
      expect(p.y).toBeCloseTo(cy0 + p.vy * 8, 6);
    }
  }

  it('attached（ai2=0）201t/发、速 8 ±0.05 离散散布、出膛位 ×8（:29074-29091）', () => {
    const { arm, head, projs, env, player } = mkLaserArm();
    head.ai1 = 0;
    const fireTicks: number[] = [];
    for (let t = 0; t < 420; t++) {
      arm.aiT = t;
      const before = projs.length;
      const cx0 = arm.cx, cy0 = arm.cy;                              // primePartAI 尾段 e.x+=e.vx 会移臂,先捕发拍中心
      primePartAI(arm, env.g, player);
      if (projs.length > before) { fireTicks.push(t); assertGeometry(cx0, cy0, player, projs, before, 8); }
    }
    expect(fireTicks).toEqual([0, 201, 402]);
  });

  it('detached（ai2=1）81t/发、速 10 ±0.05 离散散布、出膛位系数恒 8（:29153-29170）', () => {
    const { arm, head, projs, env, player } = mkLaserArm();
    head.ai1 = 0; arm.ai2 = 1;
    const fireTicks: number[] = [];
    for (let t = 0; t < 160; t++) {                                  // ai3≥200 回翻前只验 detached 窗
      arm.aiT = t;
      const before = projs.length;
      const cx0 = arm.cx, cy0 = arm.cy;
      primePartAI(arm, env.g, player);
      if (projs.length > before) { fireTicks.push(t); assertGeometry(cx0, cy0, player, projs, before, 10); }
    }
    expect(fireTicks).toEqual([0, 81]);
  });
});
