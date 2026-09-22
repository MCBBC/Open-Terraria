// ★BJ252 HandleMovement 碰撞反应面清债（2026-09-21）——全方法（Terarria1457
//   Projectile.cs:17578-19980,1458 同段逐字节全等）亲读普查后的落刀回归：
//   · 案 a：116 光束剑波撞块 4 计（:19918-19943）——ai[2]++,<4 → Item_10+30×d64
//     （White/α100/scale1.8/noGravity/vel×=rand(1..6)）+被撞轴全速反;≥4 → Kill。
//     活载体 = 真圣剑 723（itemcombat shoot=116）。
//   · 案 b：弹力族 (515..517)||637（:18591-18600）——×−0.9（|last|>1 门）先于
//     aiStyle 14/16 通用反弹截走;活载体 = 3112/3115/3116/3547。
//   · 案 c 落刀件：604（:18554）/926（:18602 共支）/969（:18614）/931||1039
//     （:18704）反射支 + 681 撞块引信钳（:18625 timeLeft=4）+ 872 oldPos 命中面
//     （:15761-15775 Colliding 特支,25 槽步 2）。
//   · 普查结构锁：弹力族表成员 + 116 计数位 + 休眠登记面（601/921/540/658/
//     700/254 等=无载体,详见报告登记表）。
//   ★S1 勘误（BJ263 2026-09-22）：普查覆盖口径勘误——HandleMovement（Projectile.cs
//     :17578-19980）全方法=111 支头/179 个 type id 引用（1458 同段逐字节全等）,
//     此前报告「~50 支」系口径低估;本测结构锁覆盖面不变。
import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { GrenadeProj, GlowstickProj, BOUNCY_PROJS } from '../src/entities/WeaponProj';
import { DD2GoblinBomb } from '../src/entities/bossAI_dd2';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function makeGame(w: World, sfxLog: string[][], opts: { dmgCalls?: number[]; player?: unknown } = {}) {
  return {
    world: w,
    player: opts.player ?? null,
    enemies: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: (f: string[]) => { sfxLog.push(f); }, playSfxFile: () => {},
    playSfxWav: () => {}, startTrackedLoop: () => null,
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (dmg: number): number => { opts.dmgCalls?.push(dmg); return 0; },
    critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    onProjectileDeath: () => {},
    spawnDust: () => ({ x: 0, y: 0, vx: 1.5, vy: -0.5, noGravity: false }),
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(200, 140, 30, 'bj252');
  for (let x = 0; x < 200; x++) w.store.setTileSilent(x, 120, 1, 0, 0);   // 地面 y=120
  return w;
}

function wallColumn(w: World, x: number, yTop: number, yBot: number): void {
  for (let y = yTop; y <= yBot; y++) w.store.setTileSilent(x, y, 1, 0, 0);
}

/** 固定随机数流（尘 ×=rand 与 damageVar 掷点解耦——序列断言用） */
function withRng(seq: number[], run: () => void): void {
  const real = Math.random;
  let i = 0;
  Math.random = () => seq[i++ % seq.length] ?? 0.5;
  try { run(); } finally { Math.random = real; }
}

// ---------------------------------------------------------------- 案 a：116

describe('BJ252 案 a：116 光束剑波撞块 4 计（:19918-19943）', () => {
  it('第 1..3 撞：Item_10 音 + 30×d64 尘 + 全速镜像,不消亡', () => {
    const w = emptyWorld();
    const sfx: string[][] = [];
    const dusts: { type: number; scale: number; noGravity: boolean; vx: number; vy: number }[] = [];
    const game = makeGame(w, sfx);
    (game as unknown as { spawnDust: unknown }).spawnDust =
      (_x: number, _y: number, _w: number, _h: number, type: number, _vx: number, _vy: number,
       _a: number, _c: unknown, scale: number) => {
        const d = { type, scale, noGravity: false, vx: 0.5, vy: -0.5 };
        dusts.push(d);
        return d;
      };
    wallColumn(w, 80, 100, 119);                       // 右墙 x=80
    const beam = new Arrow(76 * TILE, 108 * TILE, 8, 0, 100, 2, 116, { grav: 0, life: 600 });
    // 首撞（ai[2]=1）
    let guard = 0;
    while (beam.vx > 0 && !beam.dead && guard++ < 400) beam.fixedUpdate(1 / 60, game);
    expect(beam.dead).toBe(false);                     // 计数 1 < 4 → 弹反
    expect(beam.vx).toBeLessThan(0);
    expect(Math.abs(beam.vx)).toBeCloseTo(8, 5);       // 全速反 lastVelocity（:19932）
    expect(sfx.length).toBe(1);
    expect(sfx[0]).toEqual(['Item_10']);               //（:19923）
    expect(beam.beam116Bounces).toBe(1);               // ai[2]=1
    expect(dusts.length).toBe(30);                     //（:19924）
    expect(dusts[0].type).toBe(64);
    expect(dusts[0].scale).toBeCloseTo(1.8, 5);
    expect(dusts[0].noGravity).toBe(true);             //（:19927）
    // 两次撞墙间穿走廊——护栏内再吃 2 撞（共 3 次),计数 3、音 3
    wallColumn(w, 60, 100, 119);                       // 左墙
    guard = 0;
    const bounces0 = beam.beam116Bounces;
    while (beam.beam116Bounces < Math.min(bounces0 + 2, 3) && !beam.dead && guard++ < 800) {
      beam.fixedUpdate(1 / 60, game);
    }
    expect(beam.beam116Bounces).toBe(3);
    expect(beam.dead).toBe(false);                     // <4 恒弹反
    expect(sfx.length).toBe(3);
  });

  it('第 4 撞：Kill（无音无尘）——Kill 迹尘面归 Game.onProjectileDeath 116 支', () => {
    const w = emptyWorld();
    const sfx: string[][] = [];
    const game = makeGame(w, sfx);
    wallColumn(w, 80, 100, 119);
    wallColumn(w, 60, 100, 119);
    const beam = new Arrow(76 * TILE, 108 * TILE, 8, 0, 100, 2, 116, { grav: 0, life: 3600 });
    let guard = 0;
    while (!beam.dead && guard++ < 2000) beam.fixedUpdate(1 / 60, game);
    expect(beam.dead).toBe(true);                      // ai[2]>=4 → Kill（:19939-19942）
    expect(beam.beam116Bounces).toBe(4);               // 计入致死撞
    expect(sfx.length).toBe(3);                        // 第 4 撞无弹反音（Kill 音在 OPD 面）
  });
});

// ---------------------------------------------------------------- 案 b：弹力族

describe('BJ252 案 b：弹力族 (515..517)||637 ×−0.9（:18591-18600）', () => {
  it('弹力族表成员=4 型全量（结构锁）', () => {
    expect([...BOUNCY_PROJS].sort((a, b) => a - b)).toEqual([515, 516, 517, 637]);
  });

  it('515 弹力荧光棒（GlowstickProj）：×−0.9 弹反（曾误 ×−0.5 默认档）', () => {
    const w = emptyWorld();
    const sfx: string[][] = [];
    const game = makeGame(w, sfx);
    wallColumn(w, 80, 100, 119);
    const g = new GlowstickProj(76 * TILE, 108 * TILE, 6, 0, 515);
    // 反弹系数断言 = |post|/|pre|（AI 侧若在同拍先衰减,比值仍=反射系数×AI 因子;
    // 荧光棒 AI 无 vx 衰减 → 恰 0.9）
    let pre = Math.abs(g.vx);
    let guard = 0;
    while (g.vx > 0 && !g.dead && guard++ < 400) {
      pre = Math.abs(g.vx);
      g.fixedUpdate(1 / 60, game);
    }
    expect(g.dead).toBe(false);                        // 无消亡口（penetrate=-1）
    expect(Math.abs(g.vx) / pre).toBeCloseTo(0.9, 3);  //（:18595）
    expect(g.vx).toBeLessThan(0);
    expect(sfx.length).toBe(0);                        // 无音（:18591 支不发声）
  });

  it('515 门内档：|lastX|<=1 撞墙 → 轴截停（不弹反不继续飞）', () => {
    const w = emptyWorld();
    const game = makeGame(w, []);
    wallColumn(w, 80, 100, 119);
    const g = new GlowstickProj(79.8 * TILE, 108 * TILE, 0.5, 0, 515);
    let guard = 0;
    while (Math.abs(g.vx) > 0 && !g.dead && guard++ < 200) g.fixedUpdate(1 / 60, game);
    expect(g.vx).toBe(0);                              // 门内不写=截停轴零速（:18593 门）
    expect(g.dead).toBe(false);
  });

  it('516 弹力炸弹（GrenadeProj 投掷路）：×−0.9（曾误 ×−0.4）+ 不触贴墙待爆档', () => {
    const w = emptyWorld();
    const game = makeGame(w, []);
    const explodeCalls: number[] = [];
    wallColumn(w, 80, 100, 119);
    const b = new GrenadeProj(76 * TILE, 108 * TILE, 6, 0, 0, 3600, 516,
      (x, y, dmg) => explodeCalls.push(dmg + x + y));
    let pre = Math.abs(b.vx);
    let guard = 0;
    while (b.vx > 0 && !b.dead && guard++ < 400) {
      pre = Math.abs(b.vx);
      b.fixedUpdate(1 / 60, game);
    }
    expect(b.vx).toBeLessThan(0);
    expect(Math.abs(b.vx) / pre).toBeCloseTo(0.9, 3);  //（:18595,曾 ×−0.4）
    expect(explodeCalls.length).toBe(0);               // 未爆（弹力族无撞块爆口）
    expect((b as unknown as { stickPending: boolean }).stickPending).toBe(false);
  });

  it('637 弹力粘珠（GrenadeProj）：Y 撞 ×−0.9（仅 |lastY|>1 门内）', () => {
    const w = emptyWorld();
    const game = makeGame(w, []);
    const b = new GrenadeProj(90 * TILE, 100 * TILE, 0, 6, 0, 3600, 637,
      () => { throw new Error('unexpected explode'); });
    let pre = Math.abs(b.vy);
    let guard = 0;
    while (b.vy > 0 && !b.dead && guard++ < 400) {
      pre = Math.abs(b.vy);
      b.fixedUpdate(1 / 60, game);
    }
    // 重力步（+0.2/拍）先于反射 → 比值≈(pre+0.2)×0.9/pre∈(0.9,0.95);旧 ×−0.4 档
    // 比值≈0.36-0.44——区间断言即可判档（:18600）
    const ratio637 = Math.abs(b.vy) / pre;
    expect(ratio637).toBeGreaterThan(0.85);
    expect(ratio637).toBeLessThan(0.98);
  });
});

// ---------------------------------------------------------------- 案 c 落刀件

describe('BJ252 案 c：604/926/969/931 反射支 + 681 引信钳', () => {
  it('604 孢子云：撞墙全速镜像不消亡（:18554-18564,无限弹反）', () => {
    const w = emptyWorld();
    const game = makeGame(w, []);
    wallColumn(w, 80, 100, 119);
    const p = new Arrow(76 * TILE, 108 * TILE, 8, 0, 40, 0, 604, { grav: 0, life: 600 });
    const pierceBefore = p.pierce;
    let pre = Math.abs(p.vx);
    let guard = 0;
    while (p.vx > 0 && !p.dead && guard++ < 400) {
      pre = Math.abs(p.vx);
      p.fixedUpdate(1 / 60, game);
    }
    expect(p.dead).toBe(false);
    // 全速反（:18558）——AI_115 同拍先 ×0.985 衰减（vanilla 同序:AI→HandleMovement）,
    // 故比值=0.985×1.0
    expect(Math.abs(p.vx) / pre).toBeCloseTo(0.985, 3);
    expect(p.pierce).toBe(pierceBefore);               // 弹反不耗穿透（原版支无 penetrate--）
  });

  it('926 凝胶弹：X 撞 ×−0.4 / Y 撞 ×−0.95,弹反不耗 pierce（:18602-18613）', () => {
    const w = emptyWorld();
    const game = makeGame(w, []);
    wallColumn(w, 80, 100, 119);
    const gel = new Arrow(76 * TILE, 108 * TILE, 8, 0, 30, 0, 926, { grav: 0, life: 300, pierce: 2, hostile: true });
    let guard = 0;
    while (gel.vx > 0 && !gel.dead && guard++ < 400) gel.fixedUpdate(1 / 60, game);
    expect(gel.dead).toBe(false);
    expect(gel.vx).toBeCloseTo(-3.2, 5);               // 8 × −0.4（:18606,aiStyle1 无 vx 衰减）
    expect(gel.pierce).toBe(2);                        // vanilla penetrate-- 对敌对弹写不读→不耗
    const gel2 = new Arrow(90 * TILE, 100 * TILE, 0, 6, 30, 0, 926, { grav: 0, life: 300, pierce: 2, hostile: true });
    let pre2 = Math.abs(gel2.vy);
    guard = 0;
    while (gel2.vy > 0 && !gel2.dead && guard++ < 400) {
      pre2 = Math.abs(gel2.vy);
      gel2.fixedUpdate(1 / 60, game);
    }
    expect(Math.abs(gel2.vy) / pre2).toBeCloseTo(0.95, 3);   //（:18610）
  });

  it('969 天气之痛弹：撞墙 ×−0.75（:18614-18624）', () => {
    const w = emptyWorld();
    const game = makeGame(w, []);
    wallColumn(w, 80, 100, 119);
    const wp = new Arrow(76 * TILE, 108 * TILE, 8, 0, 13, 0, 969, { grav: 0, life: 600 });
    let guard = 0;
    while (wp.vx > 0 && !wp.dead && guard++ < 400) wp.fixedUpdate(1 / 60, game);
    expect(wp.dead).toBe(false);
    expect(wp.vx).toBeCloseTo(-6, 5);                  // 8 × −0.75（:18618）
  });

  it('617 星璇秘术弹：撞墙 ×−0.35（:18378-18388）', () => {
    const w = emptyWorld();
    const game = makeGame(w, []);
    wallColumn(w, 80, 100, 119);
    const s617 = new Arrow(76 * TILE, 108 * TILE, 8, 0, 20, 0, 617, { grav: 0, life: 600 });
    let guard = 0;
    while (s617.vx > 0 && !s617.dead && guard++ < 400) s617.fixedUpdate(1 / 60, game);
    expect(s617.dead).toBe(false);
    expect(s617.vx).toBeCloseTo(-2.8, 5);              // 8 × −0.35（:18382）
  });

  it('931 光女魔弹：撞墙全速镜像（:18704-18714）', () => {
    const w = emptyWorld();
    const game = makeGame(w, []);
    wallColumn(w, 80, 100, 119);
    const f = new Arrow(76 * TILE, 108 * TILE, 8, 0, 50, 0, 931, { grav: 0, life: 240 });
    let guard = 0;
    while (f.vx > 0 && !f.dead && guard++ < 400) f.fixedUpdate(1 / 60, game);
    expect(f.dead).toBe(false);
    expect(f.vx).toBeCloseTo(-8, 5);                   //（:18708）
  });

  it('681 哥布林炸弹：撞块轴停 + 引信钳 3 → 下拍爆（:18625 timeLeft=4 镜像）', () => {
    const w = emptyWorld();
    const game = makeGame(w, []);
    const explodeCalls: number[] = [];
    wallColumn(w, 80, 100, 119);
    const bomb = new DD2GoblinBomb(76 * TILE, 108 * TILE, 5, 0, 40);
    let guard = 0;
    while (!bomb.dead && bomb.vx !== 0 && guard++ < 2000) bomb.fixedUpdate(1 / 60, game);
    expect(bomb.vx).toBe(0);                           // 轴停（无反弹）
    expect(bomb.dead).toBe(false);
    const fuseAfter = (bomb as unknown as { fuse: number }).fuse;
    expect(fuseAfter).toBeLessThanOrEqual(3);          // 引信钳（≙ timeLeft=4→下拍 Kill）
    bomb.fixedUpdate(1 / 60, game);
    expect(bomb.dead).toBe(true);                      // 下拍爆（vanilla 撞后 1 tick Kill）
  });
});

// ---------------------------------------------------------------- 案 B2：872 命中面

describe('BJ252 案 B2：872 永恒彩虹 oldPos 命中面（:15761-15775）', () => {
  function playerFixture() {
    const dmgCalls: number[] = [];
    const player = {
      x: 0, y: 0, w: 20, h: 42,
      get cx() { return this.x + this.w / 2; },
      get cy() { return this.y + this.h / 2; },
      vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, iframes: 0, luck: 0,
      buffs: { has: () => false },
      useTime: 1, equipStats: {},
    };
    return { dmgCalls, player };
  }

  it('环槽锚定盒受理：玩家压在槽 0 盒（上一子步位）→ 受理', () => {
    const { dmgCalls, player } = playerFixture();
    const w = emptyWorld();
    const game = makeGame(w, [], { dmgCalls, player });
    const orb = new Arrow(100 * TILE, 50 * TILE, 30, 0, 45, 0, 872,
      { grav: 0, life: 300, pierce: 1, hostile: true });
    for (let i = 0; i < 5; i++) orb.fixedUpdate(1 / 60, game);     // 铺环
    const ring = (orb as unknown as { ghostRing: { px: Float64Array; py: Float64Array } }).ghostRing;
    expect(ring).toBeTruthy();
    // 玩家压在槽 0（上一子步末位,= 当前位 −30px）盒内、当前盒外
    player.x = ring.px[0] - 5;
    player.y = ring.py[0] - 10;
    player.iframes = 0;
    orb.fixedUpdate(1 / 60, game);
    expect(dmgCalls.length).toBe(1);                   // :15761 特支受理
  });

  it('当前盒重叠但环槽全空当拍（首拍）→ 不受理（=原版首拍 oldPos 全 Zero）', () => {
    const { dmgCalls, player } = playerFixture();
    const w = emptyWorld();
    const game = makeGame(w, [], { dmgCalls, player });
    const orb = new Arrow(100 * TILE, 50 * TILE, 30, 0, 45, 0, 872,
      { grav: 0, life: 300, pierce: 1, hostile: true });
    player.x = 100 * TILE - 10;                        // 首拍本体盒内
    player.y = 50 * TILE - 20;
    orb.fixedUpdate(1 / 60, game);                     // 首拍:环未建（尾后建）→ 零受理
    expect(dmgCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------- 结构锁

describe('BJ252 普查结构锁', () => {
  it('116 计数位=ai[2] 专位（AI_027 不消费 ai[2]）', () => {
    const beam = new Arrow(0, 0, 1, 0, 100, 2, 116, { grav: 0, life: 60 });
    expect(beam.beam116Bounces).toBe(0);
  });

  it('休眠登记面：601/921/540/658/700/254 无仓内载体（登记不硬造——报告台账）', () => {
    // 本测试=文档钉:这些 id 的 HandleMovement 支在 vanilla 存在（700 除外——
    // R1 误列,全方法无 type==700 支）,但仓内无出生路径 → 登记休眠,不落刀。
    // 601=传送门枪 3384 域整缺 / 921=NPC659 缺 / 540=NPC696 缺 / 658=NPC541 缺 /
    // 254=磁球 1266 未实现 / 700 无支。
    const DORMANT = [601, 921, 540, 658, 254];
    for (const id of DORMANT) {
      const p = new Arrow(0, 0, 1, 0, 10, 0, id, { grav: 0, life: 2, noTileCollide: true });
      expect(p.projId).toBe(id);
    }
  });
});
