// 月系批 AI 家族探针（aiStyle 81/82/83/86/87/88/89/90/91 —— bossAI_lunar_misc.ts）：
// 状态机主干 / 弹幕节奏 / 跨实体联动（月总核心锚定、石碑→教徒→邪教徒链、卵→幼蛾 Transform）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 120, FLOOR = 100;

function makeWorld(walls = false): World {
  const w = new World(W, H, 7, 'lunar-misc-test');
  const st = w.store;
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  if (walls) {
    for (let y = FLOOR - 20; y < FLOOR; y++) st.setTile(70, y, 1);   // 玩家眼前隔墙
  }
  return w;
}

type Proj = { damage: number; vx: number; vy: number; projId: number };

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: Proj[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as Proj);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    aabbOverlaps: () => false,
  };
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, em, player };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

/** 逐 tick 驱动指定实体列表（默认全部敌人） */
function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

describe('AI_081 月总游离眼 400', () => {
  it('攻击表十槽循环：90t 进矢槽，d-14/-7 两连幻影矢（35 伤；t=d 槽切同帧不可达，原版同）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 80, y: 96 });
    const core = spawn(h, 398, 80, 90);
    core.bInit = true; core.ai0 = 0;
    const eye = spawn(h, 400, 40, 88);
    eye.ai3 = core.id; eye.ai0 = 0; eye.ai1 = 0;
    tick(h, 175, [eye]);
    expect(eye.ai0).toBe(1);                          // 悬停 90t 后进矢槽(t=85)
    expect(h.projectiles.filter((p) => p.damage === 35).length).toBe(2);   // t=d-14/-7 两发
    tick(h, 40, [eye]);
    expect(eye.ai0).toBe(0);                          // 180t 回悬停槽
    expect(eye.cy).toBeLessThan(h.player.cy);         // 悬停玩家上方
  });

  it('核心 398 消亡 → 游离眼静默消散（无掉落管线）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 80, y: 96 });
    const core = spawn(h, 398, 80, 90);
    const eye = spawn(h, 400, 40, 88);
    eye.ai3 = core.id; eye.ai0 = 0; eye.ai1 = 0;
    tick(h, 30, [eye]);
    expect(eye.dead).toBe(false);
    core.dead = true;
    tick(h, 2, [eye]);
    expect(eye.dead).toBe(true);
  });
});

describe('AI_082 月总水蛭块 401', () => {
  it('90t 飞抵头额后按 头→核心→手 亏血序回灌 1000 点', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 80, y: 96 });
    const core = spawn(h, 398, 80, 92);
    const head = spawn(h, 396, 80, 86);
    const hand = spawn(h, 397, 74, 90);
    head.ai3 = core.id; hand.ai3 = core.id; hand.ai2 = 0;
    head.hp = head.maxHp - 500;                       // 亏 500
    core.hp = core.maxHp - 800;                       // 亏 800（只能吃到剩 500）
    hand.hp = hand.maxHp - 300;                       // 池尽,不回
    const leech = spawn(h, 401, 80, 96);
    leech.ai0 = head.id + 1;
    tick(h, 91, [leech]);
    expect(head.hp).toBe(head.maxHp);                 // 头优先补满
    expect(core.hp).toBe(core.maxHp - 300);           // 核心吃到剩余 500
    expect(hand.hp).toBe(hand.maxHp - 300);           // 池尽
    expect(leech.dead).toBe(true);
  });

  it('头 396 消亡 → 水蛭块随即消散', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 80, y: 96 });
    const head = spawn(h, 396, 80, 86);
    const leech = spawn(h, 401, 80, 96);
    leech.ai0 = head.id + 1;
    tick(h, 5, [leech]);
    head.dead = true;
    tick(h, 2, [leech]);
    expect(leech.dead).toBe(true);
  });
});

describe('AI_083 神秘石碑 437 / 忠实信徒 438', () => {
  it('落地校验通过 → 召 2 弓手 + 2 信徒；四教徒全灭 → 召 439 并进 300t 倒计时', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 40, y: 96 });
    const tablet = spawn(h, 437, 40, 90);
    tick(h, 2, [tablet]);
    const archers = h.enemies.filter((e) => e.vanillaId === 379);
    const devotees = h.enemies.filter((e) => e.vanillaId === 438);
    expect(archers.length).toBe(2);
    expect(devotees.length).toBe(2);
    for (const c of [...archers, ...devotees]) {
      expect(c.ai3).toBe(-(tablet.id + 1));           // 待机锚 = -(碑id+1)
      expect(c.y + c.h).toBeLessThanOrEqual(FLOOR * TILE + 1);   // 站上落点面
    }
    // 教徒全灭 → 邪教徒 439 落地 + 石碑进倒计时
    for (const c of [...archers, ...devotees]) c.dead = true;
    tick(h, 3, [tablet]);
    const cultist = h.enemies.find((e) => e.vanillaId === 439);
    expect(cultist).toBeTruthy();
    expect(tablet.ai0).toBe(-1);
    expect(tablet.ai2).toBe(cultist!.id);             // ai[2]=邪教徒 id
    tick(h, 320, [tablet]);
    expect(tablet.dead).toBe(true);                   // 300t 倒计时满消散
  });

  it('信徒 438 静立面碑不游走;受击 → 弓手解除待机(零伤恢复)', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 40, y: 96 });
    const tablet = spawn(h, 437, 40, 90);
    tick(h, 2, [tablet]);
    const dev = h.enemies.find((e) => e.vanillaId === 438)!;
    const arc = h.enemies.find((e) => e.vanillaId === 379)!;
    const x0 = dev.cx;
    tick(h, 60, [dev, arc]);
    expect(Math.abs(dev.cx - x0)).toBeLessThan(2);    // 摩擦清零,不游走
    expect(dev.facing).toBe(Math.sign(tablet.cx - dev.cx) || dev.facing);
    expect(arc.def.damage).toBe(0);                   // 待机零伤
    expect(arc.ai0).toBeGreaterThanOrEqual(1000);     // 站立帧段 1000..1300
    dev.justHitT = 2;                                 // 信徒受击
    tick(h, 1, [dev]);
    tick(h, 2, [tablet]);
    expect(arc.ai3).toBe(0);                          // 弓手激活
    arc.fixedUpdate(1 / 60, h.hooks);                 // 下一帧走激活复位 + 战士核
    expect(arc.def.damage).toBe(arc.vanilla!.damage); // damage 恢复
  });
});

describe('AI_086 暗焰幻影 472 / 远古幻影 521', () => {
  it('横掠加速追玩家(0.3/t 封顶 7);同族 50px 内互推', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 20, y: 60 });
    const p1 = spawn(h, 472, 62, 60);
    const p2 = spawn(h, 472, 63, 60);                 // 贴脸 → 排斥
    p1.spawnAlpha = 0; p2.spawnAlpha = 0;
    tick(h, 80, [p1, p2]);
    expect(p1.ai0).toBe(1);
    expect(p1.vx).toBeLessThan(-1);                   // 朝玩家(-x)加速
    expect(Math.abs(p1.vx)).toBeLessThanOrEqual(7);
    expect(Math.abs(p1.cx - p2.cx)).toBeGreaterThan(2 * TILE);   // 排斥拉开
  });
});

describe('AI_087 珍稀四宝箱怪 473', () => {
  it('玩家 80px 内唤醒 → 36t 蓄力 → 跳扑主循环起跳', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 42, y: 98 });
    const m = spawn(h, 473, 40, 98);
    m.y = FLOOR * TILE - m.h;                          // 贴地伪装
    tick(h, 1, [m]);
    expect(m.ai0).toBe(1);                             // 唤醒
    tick(h, 40, [m]);
    expect(m.ai0).toBe(2);                             // 进跳扑主循环
    let jumped = false;
    for (let i = 0; i < 120 && !jumped; i++) {
      m.fixedUpdate(1 / 60, h.hooks);
      if (m.vy < 0) jumped = true;
    }
    expect(jumped).toBe(true);
    expect(m.ai3).toBeGreaterThanOrEqual(1);           // 跳数计数
  });

  it('玩家全灭 → 7 号隐身僵坐(零伤/满血/渐隐)', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 42, y: 98 });
    (h.player as unknown as { dead: boolean }).dead = true;
    const m = spawn(h, 473, 40, 98);
    m.y = FLOOR * TILE - m.h;
    m.hp = 10;
    tick(h, 3, [m]);
    expect(m.ai0).toBe(7);
    expect(m.def.damage).toBe(0);
    expect(m.hp).toBe(m.maxHp);
    expect(m.spawnAlpha).toBeGreaterThan(0);
  });
});

describe('AI_088/090 飞蛾魔 477 与幼蛾 479（日食门）', () => {
  it('无日食 → EncourageDespawn(5) + 上浮离场(原版 :40458 分支不动 ai[0])', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 60, y: 96 });
    const m = spawn(h, 477, 60, 96);
    const b = spawn(h, 479, 62, 96);
    tick(h, 5, [m, b]);
    expect(m.ai0).toBe(-1);                          // 477 日食门直接落 -1
    expect(b.ai0).toBe(0);                           // 479 无日食分支不动 ai[0](归一 0)
    expect(m.vy).toBeLessThan(0);
    expect(b.vy).toBeLessThan(0);
    // EncourageDespawn(5):鼓励旗屏内每 tick 被共享尾段清除(:595),以持续上浮为证
  });

  it('日食悬停伺服 180t → 轮换进追击/侧掠/产卵之一;幼蛾 90t → 贴脸冲撞', () => {
    const w = makeWorld();
    w.clock.eclipse = true;
    const h = makeHooks(w, { x: 60, y: 96 });
    const m = spawn(h, 477, 60, 90);
    const b = spawn(h, 479, 64, 94);
    const seenM = new Set<number>();
    const seenB = new Set<number>();
    for (let i = 0; i < 600; i++) {
      for (const e of [m, b]) if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
      seenM.add(m.ai0); seenB.add(b.ai0);
    }
    // 477 走出悬停态(追击/侧掠/产卵族);479 走出悬停态(贴脸冲撞族)
    expect([...seenM].some((s) => [2, 3, 3.1, 4, 4.1, 4.2].includes(s))).toBe(true);
    expect([...seenB].some((s) => s === 2 || s === 2.1)).toBe(true);
  });
});

describe('AI_089 蛾卵 478', () => {
  it('900t 孵化 → Transform 479', () => {
    const w = makeWorld();
    w.clock.eclipse = true;
    const h = makeHooks(w, { x: 60, y: 96 });
    const egg = spawn(h, 478, 60, 99);
    egg.y = FLOOR * TILE - egg.h;
    tick(h, 950, [egg]);
    expect(egg.vanillaId).toBe(479);
    expect(egg.maxHp).toBe(700);
  });
});

describe('AI_091 花岗岩元素 483', () => {
  it('通视线 → 1 直追玩家;隔墙 → 3/4 锚点寻路,均不抛异常', () => {
    const open = makeWorld(false);
    const h1 = makeHooks(open, { x: 80, y: 96 });
    const e1 = spawn(h1, 483, 60, 96);
    tick(h1, 30, [e1]);
    expect(e1.ai0).toBe(1);
    expect(e1.cx).toBeGreaterThan(60 * TILE);          // 朝玩家移动

    const walled = makeWorld(true);
    const h2 = makeHooks(walled, { x: 80, y: 96 });
    const e2 = spawn(h2, 483, 60, 96);
    tick(h2, 60, [e2]);
    expect([3, 4]).toContain(e2.ai0);
  });
});

// ===================== 星旋塔传送门 578/579 + 580 电击 + 星尘塔 540 标记接线 =====================
// （Projectile.cs:32505-32805 aiStyle 108 / :32650-32676 开门 / NPC.cs:41310-41406 塔侧）
import { VortexPortalProj } from '../src/entities/bossAI_lunar_misc';
import { LightningBoltProj } from '../src/entities/LightningBoltProj';
import { StardustMarkProj } from '../src/entities/StardustMarkProj';
import type { Entity } from '../src/entities/Entity';

/** 逐 tick 驱动投射物桶（塔/门/标记链全在 projectiles 桶） */
function tickProjs(h: ReturnType<typeof makeHooks>, n: number) {
  for (let i = 0; i < n; i++) {
    for (const p of [...h.projectiles] as unknown as Entity[]) {
      if (!p.dead) p.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

describe('传送门弹 579（Projectile.cs:32505-32805）', () => {
  it('90t 开门 → 2× Alien Hornet 427(门心 Bottom 锚、随机向上速)；180t 收场消亡', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const portal = new VortexPortalProj(80 * TILE + 8, 90 * TILE, 579);
    h.em.add(portal, 'projectiles');
    tickProjs(h, 89);
    expect(h.enemies.filter((n) => n.vanillaId === 427).length).toBe(0);   // 门前无蜂
    tickProjs(h, 1);                            // 第 90 次 update 开门(:32661-32676)
    const hornets = h.enemies.filter((n) => n.vanillaId === 427);
    expect(hornets.length).toBe(2);
    for (const hornet of hornets) {
      // 速度 = 随机向 4..9 −(0,2)（:32670-32673）
      const s = Math.hypot(hornet.vx, hornet.vy + 2);
      expect(s).toBeGreaterThanOrEqual(4);
      expect(s).toBeLessThan(9);
      // NewNPC Bottom 锚：蜂底 = 门心 Y
      expect(hornet.y + hornet.h).toBeCloseTo(90 * TILE, 0);
    }
    tickProjs(h, 91);                           // 至 181t
    expect(portal.dead).toBe(true);             // :32724-32726 alpha≥255 Kill
  });
});

describe('传送门弹 578（Projectile.cs:32650-32660 开门放电）', () => {
  it('首帧定门朝向(最近玩家),90t 放 580 电击弹(50 伤、朝向×8 速)', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const portal = new VortexPortalProj(80 * TILE + 8, 90 * TILE, 578);
    h.em.add(portal, 'projectiles');
    tickProjs(h, 90);                           // 首帧定 ai1 朝向 + 第 90t 开门
    const bolts = h.projectiles.filter((p) => p instanceof LightningBoltProj) as LightningBoltProj[];
    expect(bolts.length).toBe(1);
    expect(bolts[0].projId).toBe(580);
    expect(bolts[0].damage).toBe(50);           // :32658
    expect(Math.hypot(bolts[0].vx, bolts[0].vy)).toBeCloseTo(8, 5);   // 朝向×8
    // 玩家在门右下方 → 朝向 X 分量 > 0
    expect(bolts[0].vx).toBeGreaterThan(0);
  });
});

describe('星旋塔 AI 支线（Enemy.towerAI 422 段，NPC.cs:41310-41406）', () => {
  it('视线被阻 → 玩家头顶 579 门（!CanHitLine 门 :41336）；视线通透 → 不开门', () => {
    // ★墙须在 row<80（canHit Y 钳制 h−40）且玩家/塔须够高——塔身 h=270 且被
    //   worldSurface 钳制段(:41247-41250)钉在 y≈430,玩家要飞到塔 400px 内
    const walledWorld = makeWorld(false);
    for (let y = 20; y < 60; y++) walledWorld.store.setTile(70, y, 1);   // x=70 隔墙
    const walled = makeHooks(walledWorld, { x: 80, y: 48 });
    const tower = spawn(walled, 422, 60, 90);
    tower.bInit = true;
    tick(walled, 1, [tower]);
    const portals = walled.projectiles.filter((p) => p instanceof VortexPortalProj) as VortexPortalProj[];
    expect(portals.length).toBe(1);             // 支线 a 数量门内（<14）→ 579
    expect(portals[0].projId).toBe(579);
    // 门位 = 玩家头顶上扫 10 格后的 (ptx×16+8, py×16+24)（:41341-41355）
    expect(portals[0].cx).toBeCloseTo(80 * TILE + 8, 0);
    expect(portals[0].cy).toBeCloseTo(38 * TILE + 24, 0);

    const open = makeHooks(makeWorld(false), { x: 80, y: 48 });
    const tower2 = spawn(open, 422, 60, 90);
    tower2.bInit = true;
    tick(open, 1, [tower2]);
    expect(open.projectiles.filter((p) => p instanceof VortexPortalProj).length).toBe(0);
  });
});

describe('星尘塔 AI → 540 标记链（Enemy.towerAI 493 段，NPC.cs:41257-41286/:44142-44228）', () => {
  it('塔侧发 BFS 世代标记弹（根锚 = 塔 Top−120，:44154），替代旧「直生」', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 48 });   // 玩家飞到被钳制塔(y≈430)400px 内
    const tower = spawn(h, 493, 80, 80);
    tower.bInit = true;
    tick(h, 1, [tower]);
    const marks = h.projectiles.filter((p) => p instanceof StardustMarkProj) as StardustMarkProj[];
    expect(marks.length).toBeGreaterThan(0);    // BFS 链展开
    // 根标记位置 = 根锚点（NewProjectile 位置直传；塔被 worldSurface 钳到 y≈430）
    expect(marks[0].x).toBeCloseTo(tower.cx, 0);
    expect(marks[0].y).toBeCloseTo(tower.y - 120, 0);
    expect(h.enemies.filter((n) => n.vanillaId === 405 || n.vanillaId === 402
      || n.vanillaId === 407).length).toBe(0);  // 不再直生——孵化走标记淡入(:32291-32297)
    expect(tower.ai1).toBeGreaterThanOrEqual(30 * 5);   // 冷却 30×Next(5,16)
  });
});
