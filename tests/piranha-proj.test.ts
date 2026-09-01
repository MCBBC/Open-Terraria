// 食人鱼枪 1156 → 弹 190（aiStyle 39，Projectile.cs:26065-26315）行为层回归：
//   · SetDefaults :2509-2520：22×22 / penetrate −1 / ranged / localNPCHitCooldown=14
//   · 直飞段无追踪（:26245 分支只更新姿态，首咬靠接触 latch :12447），
//     离主 >700 返回（:26247-26251）
//   · 咬住：速度 16 逼近（:26109）/ <16px 咬定清速（:26126-26129）/
//     跟随目标速度（:26159-26161）/ 同主多弹 <8px 排斥（:26162-26178）
//   · 撕咬 = 普通接触伤害走 Damage_PVE：localNPCImmunity 14t 周期（:11869/:13157）
//     + 全局 immune 门（:11905）+ 命中挂 Hemorrhage(375)（StatusNPC :10622-10625）
//   · 目标死亡 → 半径 3000 视线可达最近敌转咬（:26197-26223，Manhattan 度量）
//   · 松手（:26093-26096，淡入 alpha==0 后才生效）→ ai[0]=1 返回 + ai[1]=−1 禁再咬，
//     <70px 回收（:26276-26279）
//   · 按住期回收 → 补弹到 3（Player.cs:42856-42868 flag4 → :47768-47786 3−在场数）
import { describe, it, expect } from 'vitest';
import { Arrow, PIRANHA_LIFE, PIRANHA_HIT_CD } from '../src/entities/Arrow';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function airWorld(): World {
  return new World(200, 200, 7, 'piranha-test');   // 全空（无撞块/视线遮挡）
}

interface Bite { t: number; dmg: number }

function makeGame(w: World, enemies: unknown[] = []) {
  const projectiles: unknown[] = [];
  const bites: Bite[] = [];
  const game = {
    world: w,
    player: {
      cx: 100 * TILE, cy: 100 * TILE,
      x: 100 * TILE - 8, y: 100 * TILE - 14, w: 16, h: 28,
      vx: 0, vy: 0, dead: false, facing: 1,
      addDPS: () => {},
    },
    enemies: () => enemies,
    critters: () => [],
    entities: { nextId: 1, add: (e: unknown) => { projectiles.push(e); }, projectiles },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {},
    addDamageNumber: (_x: number, _y: number, amount: number, _c: boolean) => {
      bites.push({ t: game.tick, dmg: amount });
    },
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {}, spawnDrop: () => null,
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    tick: 0,
  } as unknown as GameHooks & { tick: number };
  return { game, projectiles, bites };
}

function step(p: Arrow, game: GameHooks & { tick: number }, n: number): void {
  for (let i = 0; i < n; i++) { game.tick++; p.fixedUpdate(1, game); }
}

/** 1e9 血靶（召唤物探针先例）——走真实 hurt 链验证 fromPlayer 语义。
 *  fromVanilla(id,x,y) 以 (x,y) 为中心落位（Enemy 构造器 x−w/2） */
function dummy(id: number, x: number, y: number): Enemy {
  // ★靶子须非不死族：僵尸 81 免疫 20（毒）→ D5 派生 +30/+375（原版"不死不流血"
  // NPC.AddBuff 门）会合法拦下 Hemorrhage 断言——换 4（仅免 31 困惑的活体怪）
  const e = Enemy.fromVanilla(4, x, y)!;
  e.id = id;
  e.hp = e.maxHp = 1e9;
  e.kbResistOverride = 0;                   // 屏蔽击退扰动（位移断言用）
  return e;
}

function spawnPiranha(x: number, y: number, vx: number, vy: number,
  channel: () => boolean, aim: () => { x: number; y: number }, damage = 100): Arrow {
  const p = new Arrow(x, y, vx, vy, damage, 1, 190, null,
    { grav: 0, life: PIRANHA_LIFE, piranha: { channel, aim } });
  p.pShootSpeed = Math.hypot(vx, vy);
  return p;
}

describe('食人鱼 190（aiStyle 39）', () => {
  it('直飞段无追踪/无重力，离主 >700 转返回（:26245-26261）', () => {
    const { game, projectiles } = makeGame(airWorld());
    const p = spawnPiranha(100 * TILE + 14, 100 * TILE, 14, 0,
      () => true, () => ({ x: 300 * TILE, y: 100 * TILE }));
    projectiles.push(p);
    const x0 = p.x;
    step(p, game, 10);
    expect(p.vx).toBe(14);                    // 无重力/无追踪，速度原样
    expect(p.x).toBeCloseTo(x0 + 140, 5);
    expect(p.pAi1).toBe(0);                   // 未咬
    // 起点距主 14 + 14px/t → ~50t 越过 700（:26247-26251）
    let guard = 0;
    while (p.pAi0 === 0 && guard++ < 100) step(p, game, 1);
    expect(p.pAi0).toBe(1);
    expect(guard).toBeGreaterThan(35);        // 确实飞出一段而非立即返回
    step(p, game, 1);                         // 返回分支下一帧才改写速度（原版同序）
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(20, 5);   // :26273 返回速 20
    expect(p.vx).toBeLessThan(0);             // 指向玩家
  });

  it('咬住：首咬 latch + 14t 周期撕咬 + Hemorrhage + 跟随目标（:26109/:13157/:10622）', () => {
    const ex = 100 * TILE, ey = 100 * TILE;
    const e = dummy(1, ex, ey);
    const { game, bites, projectiles } = makeGame(airWorld(), [e]);
    let held = true;
    const p = spawnPiranha(e.cx, e.cy, 0, 0, () => held, () => ({ x: ex + 400, y: ey }));
    projectiles.push(p);
    // 首帧：接触即咬（Damage_PVE :12447 latch）
    step(p, game, 1);
    expect(p.pAi1).toBe(1);
    expect(p.pTarget).toBe(e);
    expect(bites.length).toBe(1);
    expect(e.hemorrhageT).toBeGreaterThan(0);          // StatusNPC :10622-10625 buff 375
    expect(e.hp).toBeLessThan(1e9);                    // 真实 hurt 链已扣血（fromPlayer）
    step(p, game, 100);
    // 14t 周期：首咬后第 14/28/…t 一跳（localNPCHitCooldown :13157）
    expect(bites.slice(1).map((b) => b.t - bites[0].t)).toEqual([14, 28, 42, 56, 70, 84, 98]);
    expect(p.dead).toBe(false);                        // penetrate −1 不因命中消亡
    // 咬住贴靶（<16px 咬定，:26126-26129）
    expect(Math.hypot(p.cx - e.cx, p.cy - e.cy)).toBeLessThan(16);
    // 跟随目标速度（:26159-26161）：目标匀速右移（测试侧手动积分），食人鱼同步位移
    e.vx = 3;
    const px0 = p.cx;
    for (let i = 0; i < 30; i++) { game.tick++; e.x += e.vx; p.fixedUpdate(1, game); }
    expect(p.cx - px0).toBeGreaterThan(60);            // ≈3px/t × 30t
  });

  it('松手返回 + ai[1]=−1 禁再咬 + 回收不补弹（:26093/:26276）', () => {
    const ex = 100 * TILE, ey = 100 * TILE;
    const e = dummy(1, ex, ey);
    const { game, projectiles } = makeGame(airWorld(), [e]);
    let held = true;
    const p = spawnPiranha(e.cx, e.cy, 0, 0, () => held, () => ({ x: ex + 400, y: ey }));
    projectiles.push(p);
    step(p, game, 1);
    expect(p.pAi1).toBe(1);
    held = false;                                     // 松手
    step(p, game, 6);                                 // 淡入 6t 归零后松手门才开（:26093）
    expect(p.pAi0).toBe(1);                           // :26095 返回
    expect(p.pAi1).toBe(-1);                          // :26096 禁再咬
    expect(p.pTarget).toBeNull();
    // 路上压过靶体不重新咬（:12447 门 ai[1]==0 才 latch）
    let guard = 0;
    while (!p.dead && guard++ < 200) step(p, game, 1);
    expect(p.pAi1).toBe(-1);
    expect(p.dead).toBe(true);                        // :26276-26279 <70px 回收
    expect(projectiles.filter((o) => !(o as { dead?: boolean }).dead).length).toBe(0);
    // channel 断 → 无补弹（Player.cs:42856 channel 门）
  });

  it('目标死亡 → 3000 内视线可达最近敌转咬（:26197-26241）', () => {
    const ex = 100 * TILE, ey = 100 * TILE;
    const a = dummy(1, ex, ey);
    const b = dummy(2, ex + 120, ey);                 // 120px 外，空场视线可达
    const { game, projectiles } = makeGame(airWorld(), [a, b]);
    const p = spawnPiranha(a.cx, a.cy, 0, 0, () => true, () => ({ x: ex + 400, y: ey }));
    projectiles.push(p);
    step(p, game, 1);
    expect(p.pTarget).toBe(a);
    a.dead = true;                                    // 咬住目标死亡
    step(p, game, 1);
    expect(p.pTarget).toBe(b);                        // 曼哈顿最近 + CanHit 门
    expect(p.pAi1).toBe(1);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(16, 5);   // :26226-26236 转咬速 16
    expect(p.vx).toBeGreaterThan(0);                  // 朝新目标(+x)
  });

  it('同主多弹 <8px 排斥（:26162-26178）', () => {
    const ex = 100 * TILE, ey = 100 * TILE;
    const e = dummy(1, ex, ey);
    const { game, projectiles } = makeGame(airWorld(), [e]);
    const ctl = () => true;
    const aim = () => ({ x: ex + 400, y: ey });
    const p1 = spawnPiranha(e.cx, e.cy, 0, 0, ctl, aim);
    const p2 = spawnPiranha(e.cx, e.cy, 0, 0, ctl, aim);
    projectiles.push(p1, p2);
    step(p1, game, 1);
    step(p2, game, 1);
    expect(p1.pAi1).toBe(1);
    expect(p2.pAi1).toBe(1);
    // 双鱼贴同一靶心（<8px）→ 逐轴 ∓4 分离（x/y 是左上角，先折回中心）
    p1.x = e.cx - 1 - p1.w / 2; p1.y = e.cy - p1.h / 2;
    p2.x = e.cx + 1 - p2.w / 2; p2.y = e.cy - p2.h / 2;
    step(p1, game, 1);
    // 中心距靶心 1px（<16/3 不清速）→ 咬定残差 ±1 + 排斥 ∓4 = ∓3（:26116+ :26168）
    expect(p1.vx).toBeCloseTo(-3, 5);                 // 左侧那条被推开
    step(p2, game, 1);
    expect(p2.vx).toBeCloseTo(3, 5);                  // 右侧那条被推开
    expect(p2.vx - p1.vx).toBeCloseTo(6, 5);          // 4+4 排斥 + 2×±1 残差
  });

  it('淡入期松手不触发返回（alpha 门 :26093），归零后转返回', () => {
    const { game, projectiles } = makeGame(airWorld());
    const p = spawnPiranha(100 * TILE + 14, 100 * TILE, 14, 0,
      () => false,                                    // 出生即松手
      () => ({ x: 300 * TILE, y: 100 * TILE }));
    projectiles.push(p);
    step(p, game, 1);
    expect(p.pAlpha).toBe(205);                       // 255−50（:26067）
    expect(p.pAi0).toBe(0);                           // alpha!=0 → 松手门未开
    step(p, game, 6);
    expect(p.pAlpha).toBe(0);
    expect(p.pAi0).toBe(1);                           // 此后松手生效 → 返回
  });

  it('按住期离主 >2000 消亡并补弹到 3（:26072 / Player.cs:42856-47786）', () => {
    const { game, projectiles } = makeGame(airWorld());
    const p = spawnPiranha(100 * TILE + 14, 100 * TILE, 14, 0,
      () => true, () => ({ x: 300 * TILE, y: 100 * TILE }));
    projectiles.push(p);
    // 直飞段 700 就转返回，到不了 2000——推远后置回直飞态模拟超距
    p.x = 100 * TILE + 2100;
    p.y = 100 * TILE;
    p.pAi0 = 0;
    step(p, game, 1);
    expect(p.dead).toBe(true);                        // :26072 距主 >2000 → Kill
    const fresh = projectiles.filter((o) => !(o as { dead?: boolean }).dead) as Arrow[];
    expect(fresh.length).toBe(3);                     // 补弹 3−0（channel 仍按住）
    for (const np of fresh) {
      expect(np.projId).toBe(190);
      expect(np.piranha).toBeTruthy();
      expect(np.pAi0).toBe(0);
      expect(np.pAi1).toBe(0);
      expect(np.pAlpha).toBe(255);                    // 新弹自带淡入
      expect(np.damage).toBe(100);
    }
  });

  it('localNPCHitCooldown 常量对账（SetDefaults :2520-2521 = 14）', () => {
    expect(PIRANHA_HIT_CD).toBe(14);
    expect(PIRANHA_LIFE).toBe(3600);                  // :526 通用默认 timeLeft
  });
});
