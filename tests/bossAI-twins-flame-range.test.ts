// 双子喷火/弹幕射程批(2026-09-18 实报"Spazmatism 二阶段喷火屏幕外能喷到"):
//   原版定谳(Terarria1457,Terrarria1458 同值):
//     · 喷火触发门 = 仅视线 CanHit(NPC.cs:27594),【无距离门】——900px 外照喷;
//     · 弹 101 = aiStyle 23 寿命帽 timeLeft>60→60(Projectile.cs:26201-26203),
//       timeLeft-- 在子步循环内(:17307-17311)+ EU=3(:1895) ⇒ 弹寿 60 子步=15 tick,
//       射程 = 60 子步 × (6+0.5×自身速)px ≈ 360-560px(半屏内);
//     · 同族弹寿命(SetDefaults 终值):诅焰球 96=3600(无覆写行,aiStyle8 对 96 无帽
//       :24607)、雷眼激光 83=600(:1646)+EU2、二阶段激光 100=2700(:1884)+EU2。
//   本仓偏差根因:shoot 缺省 life=300 洗掉 SetDefaults 终值;101 反向超程(无帽
//   75t≈1800px)。修复:Arrow.ts AI 段 aiStyle23 帽(101/188)+双子发射口显式寿命。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';
import { twinsAI } from '../src/entities/bossAI';
import type { GameHooks } from '../src/entities/types';

const W = 220, H = 140, FLOOR = 110, STONE = 1;

function makeWorld(): World {
  const w = new World(W, H, 7, 'twins-flame-range');
  w.groundLevel = 40;
  w.rockLevel = 60;
  w.clock.timeOfDay = 0;                       // 深夜(白天双子走离场分支)
  const st = w.store;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, STONE);
    st.setTile(x, FLOOR + 1, STONE);
  }
  return w;
}

interface Harness {
  hooks: GameHooks;
  world: World;
  player: Player;
  enemies: Enemy[];
  projectiles: Arrow[];
}

function makeHarness(playerPx: { x: number; y: number }): Harness {
  const world = makeWorld();
  const player = new Player(playerPx.x, playerPx.y, new Inventory()) as Player;
  const enemies: Enemy[] = [];
  const projectiles: Arrow[] = [];
  let nextId = 1;
  const em = {
    nextId: 1,
    projectiles,
    add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as Arrow);
    },
  };
  const hooks = {
    world, player, entities: em,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
  } as unknown as GameHooks;
  return { hooks, world, player, enemies, projectiles };
}

let nextEnemyId = 900;
function spawn(h: Harness, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = nextEnemyId++;
  e.bInit = true;
  h.enemies.push(e);
  return e;
}

function stepArrows(h: Harness, n: number): void {
  for (let i = 0; i < n; i++) {
    for (const p of [...h.projectiles]) {
      if (!p.dead) p.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

const P = { x: 100 * TILE, y: 100 * TILE };

// ===========================================================================
// 弹 101 aiStyle 23 寿命帽 → 射程(修复主断言)
// ===========================================================================
describe('弹 101 魔眼喷火寿命帽(Projectile.cs:26201-26203)', () => {
  // 复刻生产路径:shoot() 直飞桶出生参数(life=300 缺省)
  function spawnFlame(h: Harness, vx = 6, vy = 0): Arrow {
    const a = new Arrow(40 * TILE, 50 * TILE, vx, vy, 30, 0, 101,
      { grav: 0, life: 300, pierce: 1, hostile: true });
    h.projectiles.push(a);
    return a;
  }

  it('首子步钳 60:1 tick 后 life=56(60−4,子步尾各减 1——原版 3600→60→56 同拍)', () => {
    const h = makeHarness(P);
    const a = spawnFlame(h);
    expect(a.life).toBe(300);                    // 出生面=shoot 缺省(原版出生 3600)
    a.fixedUpdate(1 / 60, h.hooks);
    expect(a.life).toBe(56);                     // 帽 60,4 子步尾各 −1(Update :17307 循环内)
  });

  it('弹寿恰 15 tick(60 子步÷EU4):14t 存活 336px,15t 死亡 360px', () => {
    const h = makeHarness(P);
    const a = spawnFlame(h);
    const x0 = a.x;
    for (let t = 1; t <= 14; t++) {
      a.fixedUpdate(1 / 60, h.hooks);
      expect(a.dead).toBe(false);
      expect(a.x - x0).toBeCloseTo(t * 24, 0);   // 6px×4 子步/t
    }
    a.fixedUpdate(1 / 60, h.hooks);
    expect(a.dead).toBe(true);
    expect(a.x - x0).toBeCloseTo(360, 0);        // 速度×存活 = 6×60 = 360px
  });

  it('射程上界 ≤ 原版包络 600px(6+抖动0.57+0.5×自身速6.75)×60 子步——修复前 1800px 爆表', () => {
    const h = makeHarness(P);
    const a = spawnFlame(h);
    const x0 = a.x;
    stepArrows(h, 40);
    expect(a.x - x0).toBeLessThanOrEqual(600);
    expect(a.dead).toBe(true);
  });
});

// ===========================================================================
// 喷火触发门(AI 面):视线 CanHit,无距离门;节奏 = lai1 血量阶梯
// ===========================================================================
describe('魔眼二阶段喷火触发(NPC.cs:27594-27647)', () => {
  function spazPhase2(h: Harness, tx = 80, ty = 90): Enemy {
    const e = spawn(h, 126, tx, ty);
    e.ai0 = 3; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; e.lai1 = 0; e.lai2 = 0;
    e.vx = 0; e.vy = 0;
    return e;
  }

  it('满血节奏:CanHit 下 lai1 计 1..8 不喷,第 9 拍喷(>8, NPC.cs:27682)', () => {
    const h = makeHarness(P);
    const e = spazPhase2(h);
    for (let t = 0; t < 8; t++) {
      twinsAI(e, h.hooks, h.player, true);
      expect(h.projectiles.length).toBe(0);
    }
    e.vx = 0; e.vy = 0;                          // 冻结(第 9 拍 seek 先跑 0.1 步进→继承 0.05)
    twinsAI(e, h.hooks, h.player, true);
    expect(h.projectiles.length).toBe(1);
    const p = h.projectiles[0];
    expect(p.projId).toBe(101);
    // 速 6 归一 ±0.4 抖动 + 自身速×0.5(≤0.05)——|v| ∈ 6±0.7
    expect(Math.hypot(p.vx, p.vy)).toBeGreaterThan(5.3);
    expect(Math.hypot(p.vx, p.vy)).toBeLessThan(6.8);
  });

  it('视线阻挡不喷(石墙隔断 CanHit)——触发门=视线非距离', () => {
    const h = makeHarness(P);
    const e = spazPhase2(h);
    const st = h.world.store;
    const wallX = 90;
    for (let y = 40; y <= 109; y++) st.setTile(wallX, y, STONE);   // 眼与玩家之间立墙
    for (let t = 0; t < 30; t++) {
      twinsAI(e, h.hooks, h.player, true);
      expect(h.projectiles.length).toBe(0);
    }
  });

  it('无距离门:900px+ 远距视线可达照喷(原版无 dist 门,NPC.cs:27594 仅 CanHit)', () => {
    const h = makeHarness({ x: 200 * TILE, y: 100 * TILE });     // 玩家在 200 格处
    const e = spazPhase2(h, 40, 90);                             // 眼在 40 格 ≈ 2500px 外
    for (let t = 0; t < 8; t++) {
      twinsAI(e, h.hooks, h.player, true);
      expect(h.projectiles.length).toBe(0);
    }
    twinsAI(e, h.hooks, h.player, true);
    expect(h.projectiles.length).toBe(1);
  });

  it('血量阶梯提速:<75% 每 5 拍喷(2/拍),<10% 每 2 拍(6/拍)(NPC.cs:27604-27620)', () => {
    const h = makeHarness(P);
    const e = spazPhase2(h);
    e.hp = Math.floor(e.maxHp * 0.7);
    for (let t = 0; t < 4; t++) twinsAI(e, h.hooks, h.player, true);
    expect(h.projectiles.length).toBe(0);
    twinsAI(e, h.hooks, h.player, true);
    expect(h.projectiles.length).toBe(1);                        // 第 5 拍

    const h2 = makeHarness(P);
    const e2 = spazPhase2(h2);
    e2.hp = Math.floor(e2.maxHp * 0.05);
    twinsAI(e2, h2.hooks, h2.player, true);
    expect(h2.projectiles.length).toBe(0);
    twinsAI(e2, h2.hooks, h2.player, true);
    expect(h2.projectiles.length).toBe(1);                       // 第 2 拍
  });

  it('喷火口产弹寿命:首 tick 后 59(帽在 Arrow AI 段生效,非发射口传参)', () => {
    const h = makeHarness(P);
    const e = spazPhase2(h);
    for (let t = 0; t < 9; t++) twinsAI(e, h.hooks, h.player, true);
    const p = h.projectiles[0];
    expect(p.life).toBe(300);                    // 出生面=shoot 缺省(原版出生 3600)
    p.fixedUpdate(1 / 60, h.hooks);
    expect(p.life).toBe(56);                     // 帽 60 − 4 子步递减(原版同拍)
  });
});

// ===========================================================================
// 同族弹寿命(SetDefaults 终值,曾全被 shoot 缺省 300 洗掉)
// ===========================================================================
describe('双子全族弹幕寿命对拍(SetDefaults timeLeft)', () => {
  it('一阶段诅焰球 96:life=3600(Projectile.cs:789 缺省;aiStyle8 对 96 无帽 :24607)', () => {
    const h = makeHarness(P);
    const e = spawn(h, 126, 97, 95);
    e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 60; e.vx = 0; e.vy = 0;
    twinsAI(e, h.hooks, h.player, true);
    const p = h.projectiles.find((q) => q.projId === 96)!;
    expect(p).toBeTruthy();
    expect(p.life).toBe(3600);
  });

  it('一阶段激光 83:life=600(:1646)+EU2 → 200t(同 WOF「83,600」先例)', () => {
    const h = makeHarness(P);
    const e = spawn(h, 125, 97, 95);             // 玩家上方,距悬浮点<400
    e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 60; e.vx = 0; e.vy = 0;
    twinsAI(e, h.hooks, h.player, false);
    const p = h.projectiles.find((q) => q.projId === 83)!;
    expect(p).toBeTruthy();
    expect(p.life).toBe(600);
  });

  it('二阶段悬浮激光 100:life=2700(:1884)+EU2 → 900t(:26991 发射口)', () => {
    const h = makeHarness(P);
    const e = spawn(h, 125, 97, 95);
    e.ai0 = 3; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; e.lai1 = 180; e.vx = 0; e.vy = 0;
    twinsAI(e, h.hooks, h.player, false);
    const p = h.projectiles.find((q) => q.projId === 100)!;
    expect(p).toBeTruthy();
    expect(p.life).toBe(2700);
  });

  it('二阶段侧移激光 100:life=2700(:27094 发射口)', () => {
    const h = makeHarness(P);
    const e = spawn(h, 125, 97, 95);
    e.ai0 = 3; e.ai1 = 1; e.ai2 = 0; e.ai3 = 0; e.lai1 = 60; e.vx = 0; e.vy = 0;
    twinsAI(e, h.hooks, h.player, false);
    const p = h.projectiles.find((q) => q.projId === 100)!;
    expect(p).toBeTruthy();
    expect(p.life).toBe(2700);
  });
});
