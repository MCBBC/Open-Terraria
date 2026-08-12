// 后期 Boss AI 批探针(bossAI_lategame.ts 邪教徒 439/克隆体 440/女皇 636/史后 657
// + bossAI_duke_moonlord.ts 月总召怪段):
//   克隆体生成节拍 / 环位补位 / 真假区分与死亡反馈 / 远古之光 522 轨道弹 /
//   史后仆从 658-660 fromVanilla / 弹幕贴图管线 sprite 断言 / 月总真眼与月噬怪召出。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { spawnPart } from '../src/entities/bossAI';
import { BuffState, BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 120, FLOOR = 100;

function makeWorld(): World {
  const w = new World(W, H, 7, 'lategame-test');
  const st = w.store;
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    buffs: new BuffState(),
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

/** 逐 tick 驱动(默认全部敌人——克隆体镜像需要与真身同拍推进) */
function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

/** 仪式态直接落位:ai0=5 且跳过出生显影 */
function ritualCultist(h: ReturnType<typeof makeHooks>): Enemy {
  const cult = spawn(h, 439, 80, 80);
  cult.bInit = true;
  cult.ai0 = 5; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
  return cult;
}

describe('AI_084 邪教徒克隆体 440', () => {
  it('仪式 ai1==30 生成节拍:首轮补 2 只克隆体,真身移到离玩家最远环位', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const cult = ritualCultist(h);
    const x0 = cult.cx, y0 = cult.cy;
    tick(h, 31, [cult]);                       // t=0..30,t===30 当帧生成
    const clones = h.enemies.filter((n) => n.vanillaId === 440);
    expect(clones.length).toBe(2);             // num28 = min(6-0, 2)
    expect(cult.ai1).toBe(31);
    // 真身 Center += 半径 180 环位偏移(:65652)——位置必须跳变
    expect(Math.hypot(cult.cx - x0, cult.cy - y0)).toBeCloseTo(180, 0);
    // 克隆体生成坐标:环位(绕真身旧中心)+height/2 底部中心(:65646)
    for (const c of clones) {
      expect(Math.hypot(c.cx - x0, c.cy - y0)).toBeCloseTo(180, 0);
    }
  });

  it('第二轮仪式:既有克隆体重排环位,只补足到 2 只新造', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const cult = ritualCultist(h);
    tick(h, 31, [cult]);
    expect(h.enemies.filter((n) => n.vanillaId === 440).length).toBe(2);
    // 第二轮:6-2=4 → 仍补 2 只,既有 2 只重排
    cult.ai0 = 5; cult.ai1 = 0;
    tick(h, 31, [cult]);
    expect(h.enemies.filter((n) => n.vanillaId === 440 && !n.dead).length).toBe(4);
  });

  it('环位补位:选招拍 0 时真身+克隆体一起入环绕玩家椭圆 (300,200)', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const cult = ritualCultist(h);
    tick(h, 31, [cult]);
    const clones = h.enemies.filter((n) => n.vanillaId === 440);
    cult.ai0 = 0; cult.ai1 = 39; cult.ai3 = 0; // 下拍取表首 = 飞掠占位
    tick(h, 1, [cult]);
    expect(cult.ai0).toBe(1);
    for (const c of clones) {
      expect(c.ai0).toBe(1);                   // 克隆体同步入环(:65291-65316)
      expect(Math.hypot(c.vx, c.vy)).toBeGreaterThan(0);
    }
  });

  it('真假区分:仪式窗口内打中克隆体 → 克隆体消散 + 真身进 6 态硬直 120t', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const cult = ritualCultist(h);
    tick(h, 31, [cult]);
    const clone = h.enemies.find((n) => n.vanillaId === 440)!;
    cult.ai1 = 200;                            // 120-420 可受击窗口
    tick(h, 1);                                // 克隆体镜像 ai0/ai1
    expect(clone.ai0).toBe(5);
    clone.justHitT = 2;                        // 原版 justHit(:65007)
    tick(h, 1);
    expect(clone.dead).toBe(true);
    expect(cult.ai0).toBe(6);                  // 真身硬直(:65012)
    tick(h, 120);
    expect(cult.ai0).toBe(0);                  // 120t 后回选招(:65779)
  });

  it('死亡反馈:窗口内打中真身 → 推进选拍拍号并清场同代克隆体', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const cult = ritualCultist(h);
    tick(h, 31, [cult]);
    const before = h.enemies.filter((n) => n.vanillaId === 440).length;
    expect(before).toBe(2);
    cult.ai1 = 200;
    cult.ai3 = 5;
    tick(h, 1);
    cult.justHitT = 2;                         // :65019 真身被击中
    tick(h, 1);
    expect(cult.ai0).toBe(0);
    expect(cult.ai3).toBe(6);                  // ai3 += 1(:65024)
    expect(h.enemies.filter((n) => n.vanillaId === 440 && !n.dead).length).toBe(0);
  });

  it('克隆体弹幕差异:火球第三拍克隆体补射 468,前两拍只有真身 467', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const cult = ritualCultist(h);
    tick(h, 31, [cult]);
    // 先让真身进入 ai0=1(有克隆体)再到火球态:直接造两只克隆体挂靠真身不可行
    // (la3 是模块私有),故借仪式产物——直接切火球态
    cult.ai0 = 3; cult.ai1 = 0; cult.ai3 = 1;
    tick(h, 1);                                // 克隆体镜像 ai0=3
    const clone = h.enemies.find((n) => n.vanillaId === 440 && !n.dead)!;
    expect(clone.ai0).toBe(3);
    // 前两拍:ai1=4 / 22 各一发 467(镜像 tick 后 ai1=1,第 k 拍看到 ai1=k → 走 22t)
    tick(h, 22, [cult]);
    const p = h.projectiles as Array<{ projId: number; damage: number }>;
    expect(p.filter((x) => x.projId === 467).length).toBe(2);
    expect(p.filter((x) => x.projId === 468).length).toBe(0);
    // 第三拍(ai1=40,(40-4)/18==2):克隆体各补 1 发 468(18 伤)+ 真身第 3 发 467
    tick(h, 18, [cult]);
    expect(p.filter((x) => x.projId === 467).length).toBe(3);
    expect(p.filter((x) => x.projId === 468 && x.damage === 18).length).toBe(2);
  });
});

describe('AI_100 远古之光 522(邪教徒 ai0=7 召出)', () => {
  it('真身每轮扇面召 5 只 522(初速 8,ai1=逐 t 弯转角 → 60t 后轨道弯曲不减速)', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const cult = spawn(h, 439, 80, 80);
    cult.bInit = true;
    cult.ai0 = 7; cult.ai1 = 4; cult.ai2 = 0; cult.ai3 = 0;
    tick(h, 1, [cult]);
    const lights = h.enemies.filter((n) => n.vanillaId === 522);
    expect(lights.length).toBe(5);             // :65862-65865 每轮 5 只
    const l0 = lights[0];
    expect(Math.hypot(l0.vx, l0.vy)).toBeCloseTo(8, 5);
    // 固定弯转角后 60t 直行、之后逐 t 旋转(速度模长守恒,不减速)
    l0.ai1 = 0.05;
    const a0 = Math.atan2(l0.vy, l0.vx);
    tick(h, 66, [l0]);                         // ai0 0→66,>60 起 6 次旋转
    const a1 = Math.atan2(l0.vy, l0.vx);
    expect(Math.abs(a1 - a0)).toBeGreaterThan(0.1);
    expect(Math.hypot(l0.vx, l0.vy)).toBeCloseTo(8, 5);
    expect(l0.dead).toBe(false);
  });
});

describe('史后仆从 658-660 数据直连', () => {
  it('fromVanilla 三色仆从字段与 1456 SetDefaults(:17261-17284)一致', () => {
    const b = Enemy.fromVanilla(658, 0, 0)!;
    const p = Enemy.fromVanilla(659, 0, 0)!;
    const u = Enemy.fromVanilla(660, 0, 0)!;
    expect([b.vanilla!.lifeMax, b.vanilla!.damage, b.vanilla!.defense, b.vanilla!.aiStyle])
      .toEqual([150, 40, 35, 1]);
    expect([p.vanilla!.lifeMax, p.vanilla!.aiStyle]).toEqual([150, 1]);
    expect([u.vanilla!.lifeMax, u.vanilla!.damage, u.vanilla!.aiStyle, u.vanilla!.width])
      .toEqual([120, 50, 14, 40]);
  });

  it('spawnPart 以史后 657 为源可召出真身 658(不走 535/537/16 兜底)', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const queen = spawn(h, 657, 80, 90);
    const m = spawnPart(h.hooks, queen, 658);
    expect(m).not.toBeNull();
    expect(m!.vanillaId).toBe(658);
  });
});

describe('弹幕贴图管线(601/602 先例:PNG 落 sprites/vanilla,Arrow 按 projId 懒加载)', () => {
  const IDS = [
    109, 110, 180, 264,                                   // 节日/火星
    325, 326, 327, 328, 329, 345, 346, 347, 348, 349, 350, 351, 352, // 节日批 15 张
    435, 438, 447, 448, 449, 450,                          // 火星批 7 张
    452, 454, 462,                                         // 月系批 3 张
    464, 465, 467, 468, 872, 873, 874, 919, 922, 923, 926, // 本批 11 张
  ];
  it.each(IDS)('Projectile_%i.png 存在且为合法 PNG', (id) => {
    const buf = readFileSync(new URL(`../public/sprites/vanilla/Projectile_${id}.png`, import.meta.url));
    expect(buf.length).toBeGreaterThan(50);    // 922 是 16×16 小图仅 78 字节,合法
    expect(buf[0]).toBe(0x89); expect(buf[1]).toBe(0x50); // ‰PNG
    expect(buf[2]).toBe(0x4e); expect(buf[3]).toBe(0x47);
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // IHDR 宽高
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });
  it('全量清单无缺漏(26 新补 + 11 本批既有 = 37 张)', () => {
    expect(IDS.length).toBe(37);
  });
});

describe('月总召怪段(bossAI_duke_moonlord.ts)', () => {
  it('手 397 血尽(checkDead)→ 于部件中心召真眼 400 并锚定核心', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const core = spawn(h, 398, 80, 90);
    core.bInit = true; core.ai0 = 0; core.ai1 = 0; core.ai2 = 0;
    const hand = spawn(h, 397, 74, 90);
    hand.bInit = true; hand.ai0 = 0; hand.ai1 = 0; hand.ai2 = 0; hand.ai3 = core.id;
    tick(h, 1, [hand]);
    expect(hand.ai0).not.toBe(-2);
    hand.hp = 0;
    tick(h, 1, [hand]);
    expect(hand.ai0).toBe(-2);                 // 闭眼残肢
    const eye = h.enemies.find((n) => n.vanillaId === 400);
    expect(eye).toBeDefined();                 // checkDead :78852-78856 召真眼
    expect(eye!.ai3).toBe(core.id);
  });

  it('头 396 月噬攻击 inSlot=120/180/240 → 召月噬怪 401(ai0=头 id+1)', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const core = spawn(h, 398, 80, 90);
    core.bInit = true; core.ai0 = 0;
    const head = spawn(h, 396, 80, 86);
    head.bInit = true; head.ai0 = 0; head.ai1 = 0; head.ai2 = 0; head.ai3 = core.id;
    // 攻击表 [矢180, 闭30, 月噬435, ...]:210t 进月噬槽
    tick(h, 212, [head]);
    expect(head.ai0).toBe(2);
    // 门禁（NPC.cs:37980 FindBuffIndex(145)）：玩家身中 MoonLeech 145 才召——
    // 由 456 月噬弹贴身授予（MoonLeechProj），测试直接预授
    h.player.buffs.apply(BuffType.MoonLeech, 840 / 60);
    tick(h, 121, [head]);                      // inSlot=120 当帧
    const leech = h.enemies.find((n) => n.vanillaId === 401);
    expect(leech).toBeDefined();               // :37975-37989
    expect(leech!.ai0).toBe(head.id + 1);
    expect(Math.hypot(leech!.cx - h.player.cx, leech!.cy - h.player.cy)).toBeLessThan(32);
  });
});
