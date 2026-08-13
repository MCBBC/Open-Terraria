// 可控导弹族（MagicMissileProj，aiStyle 9 = AI_009_MagicMissiles
// Projectile.cs:40518-40751）+ 老星怒落星（StarfuryStar，proj 9 aiStyle 5
// :22130-22247）行为回归——操控转向 / 松手语义 / 旋转角 / 穿透 / 持按连发。
import { describe, it, expect, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { MagicMissileProj, StarfuryStar, FlyingKnifeProj } from '../src/entities/MissileProj';

/** 本文件构造的导弹登记表——afterEach 统一出链（清模块级 ALIVE） */
const made: MagicMissileProj[] = [];

function makeEnemies(): unknown[] {
  return [];
}

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number;
  maxHp: number; dead: boolean; hits: number;
  cx: number; cy: number;
  hurt(): boolean;
}

function enemyAt(id: number, tx: number, ty: number): MockEnemy {
  return {
    id, x: tx * 16, y: ty * 16, w: 24, h: 40, maxHp: 100, dead: false, hits: 0,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    hurt() { this.hits++; return true; },
  };
}

function makeHooks(o: { enemies?: unknown[] } = {}) {
  const w = new World(100, 100, 7, 'test');
  const st = w.store;
  for (let x = 5; x <= 95; x++) st.setTileSilent(x, 90, 1);   // 90 行石地板
  const player = {
    x: 50 * 16, y: 80 * 16, w: 20, h: 42,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    dead: false, mana: 999,
  };
  const enemies = o.enemies ?? makeEnemies();
  const hooks = {
    world: w,
    player,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxFile: () => {},
    addDamageNumber: () => {},
    spawnParticles: () => {},
    spawnDrop: () => null,
    damagePlayer: () => {},
    cutTile: () => {},
    onProjectileDeath: () => {},
    applyLifeSteal: () => 0,
  } as never;
  return { hooks, player, st };
}

function mkMissile(
  hooks: never,
  opts: {
    projId?: number; x?: number; y?: number; vx?: number; vy?: number;
    channel?: () => boolean; aim?: () => { x: number; y: number };
    payMana?: () => boolean; fireExtra?: () => void; useTime?: number;
  } = {},
) {
  const m = new MagicMissileProj(
    opts.x ?? 60 * 16, opts.y ?? 40 * 16,
    opts.vx ?? 6, opts.vy ?? 0,
    {
      projId: opts.projId ?? 16,
      damage: 35, knockback: 7.5,
      useTime: opts.useTime ?? 22,
      channelCb: opts.channel ?? (() => true),
      aimCb: opts.aim ?? (() => ({ x: 70 * 16, y: 40 * 16 })),
      payMana: opts.payMana ?? (() => true),
      fireExtra: opts.fireExtra,
    });
  made.push(m);
  return m;
}

function fly(m: { fixedUpdate: (dt: number, g: never) => void; dead?: boolean }, hooks: never, n: number) {
  for (let i = 0; i < n && !m.dead; i++) m.fixedUpdate(1 / 60, hooks);
}

afterEach(() => {
  for (const m of [...made]) m.destroy();
  made.length = 0;
});

describe('MagicMissileProj 操控（AI_009_MagicMissiles :40518-40751）', () => {
  it('channel 期间速度直接对准光标 min(32, 距离)（:40639-40655，amount=1）', () => {
    const { hooks } = makeHooks();
    const m = mkMissile(hooks, {
      x: 40 * 16, y: 40 * 16, vx: 0, vy: 0,
      aim: () => ({ x: 40 * 16 + 200, y: 40 * 16 + 16 }),   // 与中心同高 → 水平
    });
    fly(m, hooks, 1);
    expect(Math.hypot(m.vx, m.vy)).toBeCloseTo(32, 5);   // 距离 200 > 32 → 顶速
    expect(m.vx).toBeCloseTo(32, 5);
    expect(m.vy).toBeCloseTo(0, 5);
  });

  it('近距 <64px 盘旋：vel×0.3 + (目标−中心)×0.3（:40657-40660）', () => {
    const { hooks } = makeHooks();
    const m = mkMissile(hooks, {
      x: 40 * 16, y: 40 * 16, vx: 0, vy: 0,
      aim: () => ({ x: 40 * 16 + 20, y: 40 * 16 }),
    });
    fly(m, hooks, 1);
    // 中心 (40*16+16, 40*16+16)；目标差 = (20−16, −16) → vel = (1.2, −4.8)
    expect(m.vx).toBeCloseTo(1.2, 3);
    expect(m.vy).toBeCloseTo(-4.8, 3);
  });

  it('视觉转向 π/4/tick 朝速度角（:40678-40681 AngleTowards；初值 0 = :523）', () => {
    const { hooks } = makeHooks();
    const m = mkMissile(hooks, {
      x: 40 * 16, y: 40 * 16, vx: 6, vy: 0,
      aim: () => ({ x: 40 * 16 + 200, y: 40 * 16 + 200 }),
    });
    expect(m.rot).toBe(0);
    fly(m, hooks, 1);
    // 速度向 atan2(200,200)=π/4；从 0 起一拍钳 π/4 即到
    expect(m.rot).toBeCloseTo(Math.PI / 4, 5);
  });

  it('AngleTowards 每拍上限 π/4（反向大转角分拍收敛，Utils.cs:2142-2159）', () => {
    const { hooks } = makeHooks();
    let left = false;
    const m = mkMissile(hooks, {
      x: 40 * 16, y: 40 * 16, vx: 6, vy: 0,
      aim: () => (left ? { x: 40 * 16 - 200, y: 40 * 16 + 16 } : { x: 40 * 16 + 200, y: 40 * 16 + 16 }),
    });
    fly(m, hooks, 1);
    expect(m.rot).toBeCloseTo(0, 5);               // 速度向 0 → 不转
    left = true;                                   // 光标甩到正左 → 速度角 π
    fly(m, hooks, 1);
    expect(m.rot).toBeCloseTo(Math.PI / 4, 5);     // 每拍最多 +π/4
    fly(m, hooks, 3);
    expect(m.rot).toBeCloseTo(Math.PI, 4);         // 4 拍到 π
  });

  it('松手无目标：速度归一 32 直飞 + timeLeft 钳 300（:40575-40593/:40667-40676）', () => {
    const { hooks } = makeHooks();
    let held = true;
    const m = mkMissile(hooks, {
      x: 40 * 16, y: 40 * 16, vx: 3, vy: 4,     // |v|=5 > 2 → 方向保持
      channel: () => held,
      // 光标落在初速射线同向（中心 (656,656) + (3,4) 归一 ×300）→ channel 期方向不变
      aim: () => ({ x: 40 * 16 + 16 + 180, y: 40 * 16 + 16 + 240 }),
    });
    fly(m, hooks, 5);
    held = false;
    fly(m, hooks, 1);
    const sp = Math.hypot(m.vx, m.vy);
    expect(sp).toBeCloseTo(32, 4);               // 归一 32
    expect(m.vx / sp).toBeCloseTo(3 / 5, 3);     // 方向保持 (3,4)/5
    expect(m.vy / sp).toBeCloseTo(4 / 5, 3);
    expect(m.timeLeft).toBe(300);                // 钳 300（当拍生效）
    fly(m, hooks, 1);
    expect(m.timeLeft).toBe(299);                // 此后逐 tick 递减
  });

  it('松手低速 (<2)：取 DirectionFrom(玩家) ×32（:40585-40588）', () => {
    const { hooks } = makeHooks();
    let held = true;
    const m = mkMissile(hooks, {
      x: 60 * 16, y: 84 * 16, vx: 0.5, vy: 0,
      channel: () => held,
      aim: () => ({ x: 60 * 16 + 10, y: 84 * 16 }),
    });
    fly(m, hooks, 15);                            // 近距盘旋收敛到光标（|v|<2）
    held = false;
    fly(m, hooks, 1);
    // 玩家中心 (810,1301) 在弹的左上 → DirectionFrom 指向右下、模 32
    expect(m.vx).toBeGreaterThan(0);
    expect(m.vy).toBeGreaterThan(0);
    expect(Math.hypot(m.vx, m.vy)).toBeCloseTo(32, 3);
  });

  it('松手有目标：追踪 amount=0.2 渐转（:40620-40623/:40654）', () => {
    const en = enemyAt(1, 44, 40);                // 弹右上方的敌
    const { hooks } = makeHooks({ enemies: [en] });
    let held = true;
    const m = mkMissile(hooks, {
      x: 40 * 16, y: 50 * 16, vx: 6, vy: 0,
      channel: () => held,
      aim: () => ({ x: 40 * 16 + 300, y: 50 * 16 }),
    });
    fly(m, hooks, 2);                            // channel 平飞向右
    held = false;
    fly(m, hooks, 1);
    expect(m['homingId']).toBe(1);               // 锁定视线内最近目标
    expect(m.vy).toBeLessThan(0);                // 速度被 lerp 0.2 拉向斜上目标
    const sp = Math.hypot(m.vx, m.vy);
    expect(sp).toBeGreaterThan(20);
    expect(sp).toBeLessThan(34);
  });

  it('操控期间 timeLeft 恒 ≥60（:40662-40665，channel 可无限滞留）', () => {
    const { hooks } = makeHooks();
    const m = mkMissile(hooks, {
      x: 40 * 16, y: 40 * 16, aim: () => ({ x: 40 * 16 + 200, y: 40 * 16 }),
    });
    fly(m, hooks, 200);
    expect(m.dead).toBe(false);
    expect(m.timeLeft).toBeGreaterThanOrEqual(60);
  });

  it('16 命中即灭（penetrate 缺省 1，SetDefaults :714-724）', () => {
    const en = enemyAt(2, 42, 40);
    const { hooks } = makeHooks({ enemies: [en] });
    const m = mkMissile(hooks, {
      projId: 16, x: 40 * 16, y: 40 * 16, vx: 6, vy: 0,
      aim: () => ({ x: 44 * 16, y: 40 * 16 }),
    });
    expect(m.pierce).toBe(1);
    fly(m, hooks, 10);
    expect(m.dead).toBe(true);
    expect(en.hits).toBe(1);
  });

  it('34 穿透 2 + 同敌 12t 冷却（SetDefaults :902-912 localNPCHitCooldown=12）', () => {
    const en = enemyAt(3, 42, 40);
    const { hooks } = makeHooks({ enemies: [en] });
    const m = mkMissile(hooks, {
      projId: 34, x: 40 * 16, y: 40 * 16, vx: 6, vy: 0,
      aim: () => ({ x: 42 * 16 + 12, y: 40 * 16 + 20 }),   // 悬停在敌中心
    });
    expect(m.pierce).toBe(2);
    fly(m, hooks, 20);
    expect(en.hits).toBe(2);                     // 第 2 次须等 12t 冷却
    expect(m.dead).toBe(true);                   // 穿透耗尽消亡
  });

  it('34 六帧动画推进（:40534-40543，frameCounter≥4 换帧；Main.cs:8403 共 6 帧）', () => {
    const { hooks } = makeHooks();
    const m = mkMissile(hooks, {
      projId: 34, x: 40 * 16, y: 40 * 16, aim: () => ({ x: 40 * 16 + 200, y: 40 * 16 }),
    });
    fly(m, hooks, 4);
    expect(m['frame']).toBe(1);
    fly(m, hooks, 20);
    expect(m['frame']).toBe(0);                  // 6 帧回卷
  });

  it('34 未命中前不发红（redT 起点 = 穿透余 1，:40544-40558）', () => {
    const { hooks } = makeHooks();
    const m = mkMissile(hooks, {
      projId: 34, x: 40 * 16, y: 40 * 16, aim: () => ({ x: 40 * 16 + 200, y: 40 * 16 }),
    });
    fly(m, hooks, 3);
    expect(m['redT']).toBe(0);
  });

  it('持按连发：useTime 拍一发新弹，mana 不足跳过（Player.cs:42143-42147/:51190）', () => {
    const { hooks } = makeHooks();
    const fired: number[] = [];
    let ok = true;
    const m = mkMissile(hooks, {
      useTime: 5,
      aim: () => ({ x: 40 * 16 + 200, y: 40 * 16 }),
      payMana: () => ok,
      fireExtra: () => { fired.push(1); },
    });
    fly(m, hooks, 4);
    expect(fired.length).toBe(0);                // 未满一拍
    fly(m, hooks, 1);
    expect(fired.length).toBe(1);                // 第 5 tick 发兄弟弹
    ok = false;                                  // mana 耗尽
    fly(m, hooks, 5);
    expect(fired.length).toBe(1);                // 不发但仍在操控
    expect(m.dead).toBe(false);
  });

  it('持按连发仅最新存活弹驱动（防 N 弹指数增殖）', () => {
    const { hooks } = makeHooks();
    const fired: number[] = [];
    const fire = () => { fired.push(1); };
    const a = mkMissile(hooks, {
      useTime: 5, x: 40 * 16, aim: () => ({ x: 40 * 16 + 200, y: 40 * 16 }), fireExtra: fire,
    });
    const b = mkMissile(hooks, {
      useTime: 5, x: 44 * 16, aim: () => ({ x: 44 * 16 + 200, y: 40 * 16 }), fireExtra: fire,
    });
    fly(a, hooks, 5);
    fly(b, hooks, 5);
    expect(fired.length).toBe(1);                // 只有 b（最新）发了一拍
    b.destroy();                                 // 最新弹消亡 → a 接管
    fly(a, hooks, 5);
    expect(fired.length).toBe(2);
  });

  it('79 彩虹弹穿透 3 + 命中清追踪重索（SetDefaults :1322-1333 / StrikeNPC :13271）', () => {
    const en = enemyAt(4, 42, 40);
    const { hooks } = makeHooks({ enemies: [en] });
    const m = mkMissile(hooks, {
      projId: 79, x: 40 * 16, y: 40 * 16, vx: 6, vy: 0,
      aim: () => ({ x: 42 * 16 + 12, y: 40 * 16 + 20 }),
    });
    expect(m.pierce).toBe(3);
    expect(m['homingId']).toBe(-1);
    fly(m, hooks, 40);
    expect(en.hits).toBe(3);
    expect(m.dead).toBe(true);
  });

  it('撞实心块消亡（tileCollide 默认 true，SetDefaults 无覆写）', () => {
    const { hooks } = makeHooks();
    const m = mkMissile(hooks, {
      x: 50 * 16, y: 86 * 16, vx: 0, vy: 10,
      aim: () => ({ x: 50 * 16, y: 100 * 16 }),
    });
    fly(m, hooks, 10);
    expect(m.dead).toBe(true);                   // 90 行石地板
  });
});

describe('StarfuryStar（proj 9，aiStyle 5 :22130-22247）', () => {
  it('目标线上方穿墙、越线（Bottom.Y ≥ targetY）后撞块消亡（:22159-22162）', () => {
    const { hooks } = makeHooks();
    // 89 行起笔、vy=6：一拍后中心进 90 行地板；目标线 95 行（地板下方）→ 穿墙存活
    const s = new StarfuryStar(50 * 16, 89 * 16, 0, 6, 38, 2, 95 * 16);
    fly(s, hooks, 2);
    expect(s.dead).toBe(false);
    // 目标线 86 行（地板上方）→ 越线即撞块消亡
    const s2 = new StarfuryStar(50 * 16, 89 * 16, 0, 6, 38, 2, 86 * 16);
    fly(s2, hooks, 2);
    expect(s2.dead).toBe(true);
  });

  it('alpha −15/t：线上钳 150、线下钳 0（:22194-22207）', () => {
    const { hooks } = makeHooks();
    const s = new StarfuryStar(50 * 16, 20 * 16, 0, 4, 38, 2, 90 * 16);
    fly(s, hooks, 20);
    expect(s.alpha).toBe(150);                   // 线上钳 150
    const s2 = new StarfuryStar(50 * 16, 92 * 16, 0, 0, 38, 2, 90 * 16);
    fly(s2, hooks, 20);
    expect(s2.alpha).toBe(0);                    // 线下钳 0
  });

  it('rotation 按 (|vx|+|vy|)×0.01 翻滚（:22246，非 503 的 vel−π/2 :22242）', () => {
    const { hooks } = makeHooks();
    const s = new StarfuryStar(50 * 16, 20 * 16, 3, 4, 38, 2, 90 * 16);
    fly(s, hooks, 10);
    expect(s.rot).toBeCloseTo(7 * 0.01 * 10, 5);
  });

  it('命中消耗穿透，耗尽消亡（penetrate 2，SetDefaults :626-636）', () => {
    const en = enemyAt(9, 50, 20);
    const { hooks } = makeHooks({ enemies: [en] });
    const s = new StarfuryStar(en.x + 2, en.y + 2, 0, 0, 38, 2, 90 * 16);
    fly(s, hooks, 1);
    expect(s.dead).toBe(false);
    expect(en.hits).toBe(1);
    fly(s, hooks, 1);
    expect(en.hits).toBe(2);
    expect(s.dead).toBe(true);
  });

  it('天降速度朝光标恒定（无重力直飞），寿命 3600（SetDefaults 默认 :526）', () => {
    const { hooks } = makeHooks();
    const s = new StarfuryStar(50 * 16, 20 * 16, 3, 4, 38, 2, 90 * 16);
    expect(s.timeLeft).toBe(3600);
    const y0 = s.y;
    fly(s, hooks, 5);
    expect(s.y - y0).toBeCloseTo(4 * 5, 5);     // 恒速无重力
  });
});

describe('FlyingKnifeProj 491（AI_009_MagicMissiles_Old :40753-40910，入口 :40520-40524）', () => {
  /** 本文件构造的飞刀登记——afterEach 统一销毁 */
  const knives: FlyingKnifeProj[] = [];

  function mkKnife(hooks: never, opts: {
    x?: number; y?: number; vx?: number; vy?: number;
    channel?: () => boolean; aim?: () => { x: number; y: number };
  } = {}) {
    const k = new FlyingKnifeProj(
      opts.x ?? 40 * 16, opts.y ?? 40 * 16, opts.vx ?? 0, opts.vy ?? 0,
      40, 4.5,
      { channelCb: opts.channel ?? (() => true), aimCb: opts.aim ?? (() => ({ x: 80 * 16, y: 40 * 16 })) });
    knives.push(k);
    return k;
  }

  afterEach(() => { knives.length = 0; });   // 飞刀无模块级登记表，纯对象弃置即可

  it('远距操控：速度 4:1 朝光标方向收敛、上限 20（:40794-40817 num=20 :40764）', () => {
    const { hooks } = makeHooks();
    const k = mkKnife(hooks, { x: 20 * 16, y: 40 * 16, vx: 0, vy: 0 });
    fly(k, hooks, 1);
    // 中心 (333,653)→光标 (1280,640)：d≈947>100 → 方向支，v=(0×4+dir×20)/5
    expect(Math.hypot(k.vx, k.vy)).toBeCloseTo(4.0, 3);
    expect(k.vx).toBeGreaterThan(0);
    fly(k, hooks, 4);   // 再 4 拍 → v=(4v+20)/5 迭代至 ≈13.45
    expect(Math.hypot(k.vx, k.vy)).toBeCloseTo(13.4464, 2);
    // 长直线未进 <100 档：单调爬到 20 上限（:40783-40787 钳位）
    const far = mkKnife(hooks, { x: 10 * 16, y: 40 * 16, vx: 0, vy: 0 });
    fly(far, hooks, 40);   // ≈760px 进度，距光标仍 >300 → 恒处方向支
    expect(Math.hypot(far.vx, far.vy)).toBeGreaterThan(19.9);
    expect(far.vx).toBeGreaterThan(0);
    // 近距悬停轨道：转向混叠会让瞬时速率回落，但钳位与轨道半径必须成立
    fly(k, hooks, 60);
    expect(Math.hypot(k.vx, k.vy)).toBeLessThanOrEqual(20.001);
    expect(Math.hypot(k.cx - 80 * 16, k.cy - 40 * 16)).toBeLessThan(300);
  });

  it('近距 <100px：只沿当前方向 ×1.1 加速并自锁 ai[0]=−10（:40778-40793）', () => {
    const { hooks } = makeHooks();
    const k = mkKnife(hooks, {
      x: 40 * 16, y: 40 * 16, vx: 5, vy: 0,
      aim: () => ({ x: 40 * 16 + 16 + 50, y: 40 * 16 + 16 }),   // 距中心 50px
    });
    expect(k['ai0']).toBe(0);
    fly(k, hooks, 1);
    expect(Math.hypot(k.vx, k.vy)).toBeCloseTo(5.5, 5);   // ×1.1 未过 20 上限
    expect(k['ai0']).toBe(-10);                            // 自锁计数
    fly(k, hooks, 1);
    // 源码序：先 ai[0]+=1（:40774-40777）再判 ==0 重锁（:40789-40792）——锯齿
    // −10→−9→…→0→−10，只在恰好回 0 的那拍重锁
    expect(k['ai0']).toBe(-9);
  });

  it('松手：ai[0]=1 回收（491 不重瞄鼠标），15t 后穿墙回手、近手 20px 消失（:40832-40880）', () => {
    const { hooks } = makeHooks();
    let held = true;
    const k = mkKnife(hooks, {
      x: 30 * 16, y: 40 * 16, vx: 8, vy: 0,
      channel: () => held,
      aim: () => ({ x: 44 * 16, y: 40 * 16 }),
    });
    fly(k, hooks, 3);
    held = false;
    fly(k, hooks, 1);
    expect(k['ai0']).toBe(1);            // :40862 松手即回收
    expect(k['passTiles']).toBe(false);  // localAI[0]≤15 仍碰块（:40869 门）
    fly(k, hooks, 20);
    expect(k['passTiles']).toBe(true);   // :40871 回收段穿墙
    fly(k, hooks, 400);
    expect(k.dead).toBe(true);           // 回手 20px 内消失（:40873-40876）
  });

  it('撞块：命中轴 lastVelocity 取反 + 操控态自锁 ai[0]=−10（:17053-17066）', () => {
    const { hooks, st } = makeHooks();
    for (let y = 39; y <= 41; y++) st.setTileSilent(60, y, 1);   // 60 列三格墙
    const k = mkKnife(hooks, { x: 55 * 16, y: 40 * 16, vx: 6, vy: 0 });
    // 逐拍捕捉首次反弹：vx 由正翻负的那拍（原版 AI 先行改写速度、碰撞用改写后的
    // lastVelocity 取反——量级保持，非衰减反弹）
    let flipped = false, locked = false, bounceVx = 0;
    for (let t = 0; t < 40 && !(flipped && locked); t++) {
      const lvx = k.vx;
      k.fixedUpdate(1 / 60, hooks);
      if (!flipped && lvx > 0 && k.vx < 0) {
        flipped = true;
        bounceVx = k.vx;
        // steer 当拍把速度朝 20 推（lvx→≈lvx×1.12 上限 20），反弹 = 该值取反
        expect(Math.abs(k.vx)).toBeGreaterThan(lvx);
        expect(Math.abs(k.vx)).toBeLessThanOrEqual(20.001);
        expect(k['ai0']).toBe(-10);                   // 操控态撞墙自锁
      }
      if (k['ai0'] === -10) locked = true;
    }
    expect(flipped).toBe(true);
    expect(bounceVx).toBeLessThan(0);
    expect(k.dead).toBe(false);          // 491 撞块反弹不灭
  });

  it('穿透 −1：同敌 10t 冷却后可再中（immune[owner]=10 :13189-13192）', () => {
    // 大体积敌 + 光标钉在敌心：飞刀近距档只加速不转向，长时间滞留敌体内
    const big = {
      id: 1, x: 40 * 16, y: 40 * 16, w: 200, h: 200, maxHp: 5000, dead: false, hits: 0,
      get cx() { return this.x + this.w / 2; },
      get cy() { return this.y + this.h / 2; },
      hurt() { this.hits++; return true; },
    };
    const { hooks } = makeHooks({ enemies: [big] });
    const k = mkKnife(hooks, {
      x: 40 * 16 + 2, y: 40 * 16 + 5, vx: 2, vy: 0,
      aim: () => ({ x: big.cx, y: big.cy }),
    });
    fly(k, hooks, 1);
    expect(big.hits).toBe(1);
    fly(k, hooks, 9);
    expect(big.hits).toBe(1);            // 冷却窗内不再结算
    fly(k, hooks, 2);
    expect(big.hits).toBe(2);            // 10t 后再中（穿透 −1 不消耗）
    expect(k.dead).toBe(false);
  });

  it('距玩家 >2000px 消失（:40894-40897）', () => {
    const { hooks } = makeHooks();
    const k = mkKnife(hooks, { x: 4 * 16, y: 4 * 16, vx: 0, vy: 0 });  // 距玩家(50,80)≈1178px
    fly(k, hooks, 1);
    expect(k.dead).toBe(false);
    const k2 = mkKnife(hooks, { x: 2 * 16, y: 2 * 16, vx: 0, vy: 0 }); // ≈1245px 仍内
    fly(k2, hooks, 1);
    expect(k2.dead).toBe(false);
    // 直接置到 2100px 外验证门（世界外弹体不跑碰撞，只验门本身）
    const k3 = mkKnife(hooks, { x: 50 * 16 - 2100, y: 80 * 16, vx: 0, vy: 0 });
    fly(k3, hooks, 1);
    expect(k3.dead).toBe(true);
  });
});
