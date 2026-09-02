// 可控导弹族（MagicMissileProj，aiStyle 9 = AI_009_MagicMissiles
// Projectile.cs:40518-40751）+ 老星怒落星（StarfuryStar，proj 9 aiStyle 5
// :22130-22247）行为回归——操控转向 / 松手语义 / 旋转角 / 穿透 / 持按连发。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { World } from '../src/world/World';
import { MagicMissileProj, StarfuryStar, FlyingKnifeProj,
  limitPointToPlayerReachableArea } from '../src/entities/MissileProj';
import { VanillaDust } from '../src/fx/VanillaDust';

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
    damagePlayer: (): number => 0,
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

  it('16 命中即灭（penetrate 缺省 1，SetDefaults :714-724）+ Kill 死亡爆 AoE 二跳（MAJOR-4 :72503-72510）', () => {
    const en = enemyAt(2, 42, 40);
    const { hooks } = makeHooks({ enemies: [en] });
    const m = mkMissile(hooks, {
      projId: 16, x: 40 * 16, y: 40 * 16, vx: 6, vy: 0,
      aim: () => ({ x: 44 * 16, y: 40 * 16 }),
    });
    expect(m.pierce).toBe(1);
    fly(m, hooks, 10);
    expect(m.dead).toBe(true);
    // 接触 1 跳 + Kill Resize(128) Damage() AoE 2 跳（敌在爆心 128px 盒内;
    // 测试 mock hurt 无免疫帧——实机由 Enemy.hurt 的 immune 门裁定是否二跳）
    expect(en.hits).toBe(2);
  });

  it('34 穿透 2 + 同敌 12t 冷却（SetDefaults :902-912 localNPCHitCooldown=12）+ Kill 爆 AoE', () => {
    const en = enemyAt(3, 42, 40);
    const { hooks } = makeHooks({ enemies: [en] });
    const m = mkMissile(hooks, {
      projId: 34, x: 40 * 16, y: 40 * 16, vx: 6, vy: 0,
      aim: () => ({ x: 42 * 16 + 12, y: 40 * 16 + 20 }),   // 悬停在敌中心
    });
    expect(m.pierce).toBe(2);
    fly(m, hooks, 20);
    expect(en.hits).toBe(3);                     // 2 次接触（第 2 次等 12t 冷却）+ Kill 爆 1 跳
    expect(m.dead).toBe(true);                   // 穿透耗尽消亡
  });

  it('34 六帧动画推进（P.cs:44013-44019，frameCounter++ >= 4 后增比较 = 5 拍/帧；Main.cs:8403 共 6 帧）', () => {
    const { hooks } = makeHooks();
    const m = mkMissile(hooks, {
      projId: 34, x: 40 * 16, y: 40 * 16, aim: () => ({ x: 40 * 16 + 200, y: 40 * 16 }),
    });
    fly(m, hooks, 4);
    expect(m['frame']).toBe(0);                  // 计数值 0..3 四拍内不换帧
    fly(m, hooks, 1);
    expect(m['frame']).toBe(1);                  // 第 5 拍（计数值 4）换帧
    fly(m, hooks, 25);                           // 累计 30 拍 = 6 次换帧
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
    // ★R27：3 次接触命中 + 死亡 Resize(128) AoE 二次结算（Projectile.cs:72426-72434——
    // maxPenetrate=−1 后 Damage() 重开判定盒,localNPCImmunity 清零即同拍可再中）= 4 跳
    expect(en.hits).toBe(4);
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

  it('远距操控：速度 4:1 朝【钳后】光标方向收敛、上限 20（:40794-40817 num=20 :40764；A6 联改：光标先经 LimitPointToPlayerReachableArea）', () => {
    const { hooks } = makeHooks();
    const p = (hooks as unknown as { player: { cx: number; cy: number } }).player;
    const aimRaw = { x: 80 * 16, y: 40 * 16 };
    const k = mkKnife(hooks, { x: 20 * 16, y: 40 * 16, vx: 0, vy: 0,
      aim: () => ({ ...aimRaw }) });
    // oracle：消费侧首拍就以钳后点为目标——以导出 helper 复算原版可达区目标
    const lim = limitPointToPlayerReachableArea(aimRaw.x, aimRaw.y, p.cx, p.cy, 1600, 1600);
    const cx0 = k.cx, cy0 = k.cy;                 // 首拍转向前的刀心
    const dx0 = lim[0] - cx0, dy0 = lim[1] - cy0;
    const dd = Math.hypot(dx0, dy0);
    expect(dd).toBeGreaterThan(100);              // 方向支成立前提
    fly(k, hooks, 1);
    // v=(vel×4+dir×20)/5，初速 0 → dir×4：方向与量级都以钳后点为 oracle
    expect(k.vx).toBeCloseTo((dx0 / dd * 20) / 5, 3);
    expect(k.vy).toBeCloseTo((dy0 / dd * 20) / 5, 3);
    // 持续 120 拍：速率顶在 20 上限内、刀整体逼近钳后点（刹车环围绕可达区面）
    fly(k, hooks, 119);
    expect(Math.hypot(k.vx, k.vy)).toBeLessThanOrEqual(20.001);
    const dAfter = Math.hypot(lim[0] - k.cx, lim[1] - k.cy);
    expect(dAfter).toBeLessThan(dd);
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

  it('撞块：命中轴 lastVelocity 取反 + 操控态自锁 ai[0]=−10（:17053-17066；松开 channel 排除操控转向耦合，A6 后小世界盒收缩失真与旧断言解耦）', () => {
    const { hooks, st } = makeHooks();
    for (let y = 39; y <= 41; y++) st.setTileSilent(60, y, 1);   // 60 列三格墙
    const k = mkKnife(hooks, { x: 55 * 16, y: 40 * 16, vx: 6, vy: 0,
      channel: () => false });           // 松手后 ai0=1 回收但 localT≤15 不穿墙→纯弹式撞墙
    // 逐拍捕捉首次反弹：vx 由正翻负的那拍（原版碰撞用 lastVelocity 取反——
    // 量级不变,非衰减反弹）
    let flipped = false, locked = false, bounceVx = 0;
    for (let t = 0; t < 40 && !(flipped && locked); t++) {
      const lvx = k.vx;
      k.fixedUpdate(1 / 60, hooks);
      if (!flipped && lvx > 0 && k.vx < 0) {
        flipped = true;
        bounceVx = k.vx;
        // 无转向改写：反弹值 = 入射值原样取反
        expect(Math.abs(k.vx)).toBeCloseTo(lvx, 5);
        expect(k['ai0']).toBe(1);                     // 已松手态（不再有操控自锁）
      }
      if (Math.abs(k['ai0'] as number) === 10) locked = true;
    }
    expect(flipped).toBe(true);
    expect(bounceVx).toBeLessThan(0);
    expect(k.dead).toBe(false);          // 491 撞块反弹不灭
  });

  it('操控态撞墙自锁：channel 中撞块 → 反射翻向与自锁计数均出现（:17053-17066）', () => {
    const { hooks, st } = makeHooks();
    for (let y = 39; y <= 41; y++) st.setTileSilent(60, y, 1);
    const k = mkKnife(hooks, { x: 56 * 16, y: 40 * 16, vx: 8, vy: 0,
      aim: () => ({ x: 100 * 16, y: 41 * 16 }),
      channel: () => true });
    let flipped = false, everLock = false;
    for (let t = 0; t < 120 && !(flipped && everLock); t++) {
      const lvx = k.vx;
      k.fixedUpdate(1 / 60, hooks);
      if (!flipped && lvx > 0 && k.vx < 0) {
        flipped = true;
        expect(Math.abs(k.vx)).toBeLessThanOrEqual(20.001);   // steer 推至 ≤20 再取反
      }
      if ((k['ai0'] ?? 0) === -10) everLock = true;           // 撞墙/刹车任一路径入自锁
    }
    expect(flipped).toBe(true);
    expect(everLock).toBe(true);
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

// ===================== 79 彩虹魔杖 Kill 迸散(:72436-72487 终清波真值化) =====================
describe('79 Kill 尾迹迸散全链(Dust.cs:260-288 CloneDust 真克隆 + 数量按距头部衰减 + L=.65)', () => {
  /** 入池尘最小读面（VanillaDust.VDust 字段子集） */
  type Rec = {
    x: number; y: number; vx: number; vy: number; type: number;
    scale: number; fadeIn: number; alpha: number; noGravity: boolean;
    color: { r: number; g: number; b: number; a: number } | null;
  };
  /** rand 恒 0.5 钉死的确定性回归:NewDust 抖动归零(±0.1×((.5*41|0)-20)=0)、
   *  Next(1,4)→2、scale=(0.9+0.6)*k67=1.5*k67、fadeIn=0.6*k67 —— 全闭式可算 */
  function makeRecording79Kill(): { hooks: never; spawns267: Rec[]; clones: Rec[] } {
    const vd = new VanillaDust();
    const spawns267: Rec[] = [];
    const clones: Rec[] = [];
    const realClone = vd.clone.bind(vd);
    (vd as unknown as { clone(rf: never): unknown }).clone = (rf: never) => {
      const c = realClone(rf);
      if (c) clones.push(c as never as Rec);
      return c;
    };
    const { hooks } = makeHooks();
    Object.assign(hooks as object, {
      vanillaDust: vd,
      broadcastParticleOrchestra: () => {},
      spawnDust(x: number, y: number, w: number, h: number, type: number,
        sx = 0, sy = 0, alpha = 0,
        color: Rec['color'] = null, scale = 1, noGravity = false, perfect = false) {
        const d = vd.spawn(x, y, w, h, type, sx, sy, alpha, color, scale,
          perfect ? { perfect: true } : undefined);
        if (d && noGravity) d.noGravity = true;
        if (type === 267) spawns267.push(d as never as Rec);
        return d;
      },
    });
    return { hooks, spawns267, clones };
  }

  it('head-first 三级减数分组(60 槽带:阈 18/39/51 → [2×18,1×21])+速度=朝更近点单位向×6', () => {
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const { hooks, spawns267 } = makeRecording79Kill();
      const m = mkMissile(hooks, {
        projId: 79, x: 40 * 16, y: 40 * 16, vx: 6, vy: 0,
        channel: () => false,
      });
      // ★裁定 a：Kill 迸散消费带 = strip 60 槽 mode-3 记录（旧 12 点 push 带退役）。
      // 直注整带（新→老,[0]=头;命中致死拍 strip[0]=弹心——P.cs:17246 位移后写）,
      // 弹向右飞 → 老点 x 递减
      const strip = (m as unknown as { strip: Array<{ x: number; y: number }> }).strip;
      for (let i = 0; i < 60; i++) strip.push({ x: 656 - i * 6, y: 656 });
      (m as unknown as { killNow(g: never): void }).killNow(hooks);

      // 迸散段是 spawn 流前缀(rainbowRodHitFx ×2 与 14×d66 尾随,同 d267 但在段后)。
      // N=60:阈 {18,39,51} → 减数型 num∈[0,17]×2/[18,38]×1/[39,∞)×0 = 39 枚主尘。
      // 若方向写反(旧 bug 对新点减),首组数会 ≤ 后组。
      expect(spawns267.length).toBeGreaterThanOrEqual(57);
      const burst = spawns267.slice(0, 57);   // 18 点×2 + 21 点×1 = 57 主尘
      const groups: Rec[][] = [];
      for (const d of burst) {
        const cur = groups[groups.length - 1];
        if (cur && Math.abs(cur[0].x - d.x) < 1e-9 && Math.abs(cur[0].y - d.y) < 1e-9) {
          cur.push(d);
        } else groups.push([d]);
      }
      expect(groups.map((g) => g.length))
        .toEqual([...Array(18).fill(2), ...Array(21).fill(1)]);
      // k67 严格单调下降(head=1 → 老点→0.3 带):scale 组间严格递减(旧码反向会给尾部大值)
      for (let gi = 1; gi < groups.length; gi++) {
        expect(groups[gi][0].scale).toBeLessThan(groups[gi - 1][0].scale);
      }
      // scale/fadeIn 闭式核对:head 组 k67=1 → scale=1.5 / fadeIn=0.6
      expect(groups[0][0].scale).toBeCloseTo(1.5, 10);
      expect(groups[0][0].fadeIn).toBeCloseTo(0.6, 10);
      // 速度链:jitter(0)×r0.8 → += 朝更近点单位向×6 ⇒ |v|≡6（head 组向 =
      // 原版 vector13(左上).DirectionTo(Center) = Size/2 对角向,:72440）
      for (const g of groups) {
        for (const d of g) {
          expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(6, 6);
        }
      }
      const head = groups[0][0];
      expect(head.vx).toBeGreaterThan(0);
      expect(head.vy).toBeGreaterThan(0);                 // num=0 对角踢（左上→Center）
      // num=1 组向 = 朝邻新点(+x,弹头方向)
      expect(groups[1][0].vx).toBeGreaterThan(0);
      // 主尘面:α=0/noGravity/type267,L=.65 彩色(非纯白)
      for (const d of burst) {
        expect(d.alpha).toBe(0);
        expect(d.noGravity).toBe(true);
        expect(d.type).toBe(267);
        expect(d.color!.r === 255 && d.color!.g === 255 && d.color!.b === 255).toBe(false);
      }
    } finally {
      randSpy.mockRestore();
    }
  });

  it('白影 = Dust.CloneDust 真克隆体(Dust.cs:260-288):逐主尘配对,scale÷2 + fadeIn×0.85'
    + ' + 纯白覆写,其余字段(position/velocity/alpha/noGravity)原样继承——终清波退役"半尺白尘"', () => {
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const { hooks, spawns267, clones } = makeRecording79Kill();
      const m = mkMissile(hooks, {
        projId: 79, x: 40 * 16, y: 40 * 16, vx: 6, vy: 0,
        channel: () => false,
      });
      const strip = (m as unknown as { strip: Array<{ x: number; y: number }> }).strip;
      for (let i = 0; i < 60; i++) strip.push({ x: 656 - i * 6, y: 656 });
      (m as unknown as { killNow(g: never): void }).killNow(hooks);
      expect(clones.length).toBe(57);                     // 引擎 clone 仅迸散段使用(逐主尘一枚)
      for (let i = 0; i < clones.length; i++) {
        const p = spawns267[i];                           // clone push 序 == 主尘序(逐对紧跟)
        const c = clones[i];
        expect(c.scale).toBeCloseTo(p.scale / 2, 10);     // :72493 dust.scale /= 2f
        expect(c.fadeIn).toBeCloseTo(p.fadeIn * 0.85, 10);// :72495 dust.fadeIn *= 0.85f
        expect(c.x).toBe(p.x);                            // :273 position 原样复制
        expect(c.y).toBe(p.y);
        expect(c.vx).toBe(p.vx);                          // :274 velocity 继承(dir*6 向量)
        expect(c.vy).toBe(p.vy);
        expect(c.type).toBe(267);                         // :281 type 复制
        expect(c.alpha).toBe(0);                          // :283 alpha=0 档继承
        expect(c.noGravity).toBe(true);                   // :276 noGravity=true 继承
        expect(c.color).toEqual({ r: 255, g: 255, b: 255, a: 255 });  // :72496 纯白
      }
    } finally {
      randSpy.mockRestore();
    }
  });
});
