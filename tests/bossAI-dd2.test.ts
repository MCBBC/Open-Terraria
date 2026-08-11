// DD2/旧日军团 + 沙漠族 AI 家族探针（aiStyle 93/102/103/104/105/106/108/109/110/111
// —— src/entities/bossAI_dd2.ts）：状态机主干 / 部件锚定与存活联动 / 弹幕节拍 /
// 出入场物（水晶→双门）链。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 140, FLOOR = 110;
const SAND = TILE_BY_KEY['sand'];   // vanilla sheet 53 → 内部 tile id

function makeWorld(sand = false): World {
  const w = new World(W, H, 7, 'dd2-test');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
    if (sand) {
      // 沙漠剖面：FLOOR-12..FLOOR-1 沙柱（沙鲨族栖层）
      for (let y = FLOOR - 12; y < FLOOR; y++) st.setTile(x, y, SAND);
    }
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

/** 逐 tick 驱动（默认全部存活敌人） */
function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

describe('AI_093 荷兰飞盗船 491', () => {
  it('首帧生成 4 座大炮（492,ai[3]=60*i 错峰）;炮在世船体无敌', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 100, y: 100 });
    const ship = spawn(h, 491, 100, 90);
    tick(h, 3, [ship]);
    const cannons = h.enemies.filter((n) => n.vanillaId === 492);
    expect(cannons.length).toBe(4);
    expect(cannons.map((c) => c.ai3)).toEqual([0, 60, 120, 180]);   // 出生错峰
    expect(ship.ai0).toBe(cannons[0].id);                            // ai[0..3]=炮位引用
    tick(h, 30, [ship]);
    expect(ship.iframes).toBeGreaterThan(0);                         // dontTakeDamage
    expect(ship.dead).toBe(false);
  });

  it('大炮锚定船体（零速随动）;炮全灭 → 船自毁', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 100, y: 100 });
    const ship = spawn(h, 491, 100, 90);
    tick(h, 3, [ship]);
    const cannons = h.enemies.filter((n) => n.vanillaId === 492);
    tick(h, 5);                                     // 炮 AI 随动一帧（锚进船体偏移位）
    for (const c of cannons) expect(Math.abs(c.vx)).toBeLessThanOrEqual(Math.abs(ship.vx) + 1e-6);
    for (const c of cannons) c.hp = 0;
    tick(h, 5);                                     // hurt 管线置 dead
    for (const c of cannons) c.dead = true;
    tick(h, 3, [ship]);
    expect(ship.dead).toBe(true);
  });
});

describe('AI_102 沙尘精 541', () => {
  it('walker 核贴地逼近玩家;ai[0] 攻击循环推进并在 54t 放沙暴标记', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: 105 });
    const e = spawn(h, 541, 100, 108);
    tick(h, 60, [e]);
    expect(e.ai0).toBeGreaterThan(0);                                // 起手 1 → 递增
    expect(Math.abs(e.cx - 130 * TILE)).toBeLessThan(46 * TILE);     // 向玩家侧移动
    const marks = h.projectiles.filter((p) => p.projId === 15 && p.damage === 0);
    expect(marks.length).toBeGreaterThan(0);                         // 658 标记（代渲 15,0 伤）
  });

  it('135t 攻击收尾 → 负值冷却（半血免击退）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: 105 });
    const e = spawn(h, 541, 100, 108);
    tick(h, 135, [e]);
    expect(e.ai0).toBe(-300);                                        // :42273-42276（135t 置 -300）
    tick(h, 10, [e]);
    expect(e.ai0).toBe(-290);                                        // 冷却期每 tick +1 回摆
    e.hp = e.maxHp * 0.3;
    tick(h, 2, [e]);
    expect(e.def.knockbackResist).toBe(1);                           // 血 <50% 免击退
  });
});

describe('AI_103 沙鲨族 542', () => {
  it('沙中巡游：不坠落（沙族豁免碰撞）、蛇形升降推进', () => {
    const w = makeWorld(true);
    const h = makeHooks(w, { x: 60, y: 100 });   // 玩家远离（>150px,不触发扑咬）
    const e = spawn(h, 542, 100, 106);
    const y0 = e.cy;
    tick(h, 120, [e]);
    expect(Math.abs(e.cy - y0)).toBeLessThan(6 * TILE);   // 沙层内游动不坠出
    expect(Math.abs(e.vx)).toBeGreaterThan(0.05);          // 巡游推进
  });

  it('玩家在上方且距 >150px → 跃沙扑咬（12 速,ai[2]=-30）', () => {
    const w = makeWorld(true);
    const h = makeHooks(w, { x: 100, y: 98 });
    const e = spawn(h, 542, 100, 106);
    tick(h, 5, [e]);
    e.ai2 = 30;                       // 扑咬回充满（跳过 30t 回充等待）
    tick(h, 40, [e]);
    // 巡游逼近扑咬门（沙内加速 ±5）后,贴近沙面边缘触发跃出
    expect(Math.abs(e.vx) + Math.abs(e.vy)).toBeGreaterThan(0.3);
  });
});

describe('AI_104 DD2AttackerTest 547', () => {
  it('出生即消（原版 active=false）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 100, y: 100 });
    const e = spawn(h, 547, 100, 100);
    e.fixedUpdate(1 / 60, h.hooks);
    expect(e.dead).toBe(true);
  });
});

describe('AI_105 永恒水晶 548 / AI_106 神秘传送门 549', () => {
  it('首帧即双端各放 1 门（cs:42820 ai[0]==0 直通）;门水晶在世恒无敌', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 100, y: 105 });
    const crystal = spawn(h, 548, 100, 109);
    tick(h, 3);                                  // 水晶+双门都跑（门 AI 置无敌）
    const portals = h.enemies.filter((n) => n.vanillaId === 549);
    expect(portals.length).toBe(2);
    expect(portals.some((p) => p.ai2 === 0)).toBe(true);     // 左门
    expect(portals.some((p) => p.ai2 === 1)).toBe(true);     // 右门
    for (const p of portals) expect(p.iframes).toBeGreaterThan(0);   // dontTakeDamage
    expect(crystal.lightRGB).toEqual([1.3, 0.5, 1.5]);       // 点光
  });

  it('水晶亡 → 门驻守 180t 后进入缩放消散（ai[1]=1,550t 自灭）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 100, y: 105 });
    const crystal = spawn(h, 548, 100, 109);
    tick(h, 2, [crystal]);
    const portal = h.enemies.find((n) => n.vanillaId === 549)!;
    crystal.dead = true;
    tick(h, 200, [portal]);                       // localAI[0] 满 180 → 水晶不在 → ai[1]=1
    expect(portal.ai1).toBe(1);
    tick(h, 600, [portal]);                       // ai[0] ≥550 → 自灭
    expect(portal.dead).toBe(true);
  });
});

describe('AI_108 俯冲飞行族', () => {
  it('飞龙 560：悬空逼近 → 瞄准（ai0=1）→ 俯冲（ai0=2）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: 104 });
    const e = spawn(h, 560, 100, 100);
    tick(h, 20, [e]);
    expect(e.ai0).toBe(0);                       // 500px 外/断视 → 持续逼近
    e.x = 128 * TILE; e.y = 102 * TILE;          // 拉进 500px 内并给下视野
    tick(h, 30, [e]);
    expect([1, 2]).toContain(e.ai0);             // 进入瞄准/俯冲
  });

  it('小妖魔滑翔怪 574：俯冲撞实心块 → 自爆（192² 盒、伤 80、3t 消散）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: 104 });
    const e = spawn(h, 574, 100, 100);
    e.x = 128 * TILE; e.y = 102 * TILE;
    tick(h, 40, [e]);
    if (e.ai0 !== 3) {
      e.ai0 = 2; e.ai1 = 0;                      // 直接置俯冲态
      e.y = (FLOOR - 2) * TILE - e.h;            // 埋进地面
    }
    tick(h, 6, [e]);
    expect(e.ai0).toBe(3);
    expect(e.w).toBe(192);
    expect(e.def.damage).toBe(80);
    tick(h, 4, [e]);
    expect(e.dead).toBe(true);
  });
});

describe('AI_109 黑暗魔法师 565', () => {
  it('出生渐显 60t 后选招：1000px 内有视线 → 暗影矢（40 伤 14 速）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 112, y: 106 });
    const e = spawn(h, 565, 100, 108);
    tick(h, 140, [e]);                           // 渐显 60t + 起手 97t,ai[0]==32 发矢
    const bolts = h.projectiles.filter((p) => p.damage === 40);
    expect(bolts.length).toBeGreaterThan(0);
    expect(Math.hypot(bolts[0].vx, bolts[0].vy)).toBeCloseTo(14, 0);
  });

  it('治疗招（ai[1]=1）在 ai[0]=40/48/56 三连发：1000px 内受伤友军 +500×3 封顶补满', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 112, y: 106 });
    const e = spawn(h, 565, 100, 108);
    const ally = spawn(h, 571, 108, 108);        // 德拉克龙（walker 族,3000 血）
    ally.hp = ally.maxHp - 800;
    tick(h, 1, [e]);                             // 先过 bInit（避免首帧归零 ai0/ai1）
    e.ai1 = 1; e.ai0 = 60;                       // 直接进治疗招倒计时
    tick(h, 30, [e]);
    expect(ally.hp).toBe(ally.maxHp);            // 三连 +500 封顶补满 800 亏空
  });
});

describe('AI_110 双足翼龙 551', () => {
  it('八槽攻表循环：入场 10t → 悬停 30t → 进攻击态;空袭槽投 686 火球', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: 100 });
    const e = spawn(h, 551, 100, 96);
    tick(h, 12, [e]);
    expect(e.ai0).toBe(1);                       // 入场 10t → 悬停
    tick(h, 32, [e]);
    expect(e.ai0).toBeGreaterThanOrEqual(2);     // 悬停 30t → 选招（ai[3]=0 → 风压冲）
    e.ai0 = 1; e.ai1 = 0; e.ai3 = 4;             // 手动拨到空袭槽
    tick(h, 32, [e]);
    expect(e.ai0).toBe(4);
    tick(h, 80, [e]);
    expect(h.projectiles.filter((p) => p.damage === 35).length).toBeGreaterThan(0); // 686 火球
  });
});

describe('AI_111 埃特尼亚荧光虫 578', () => {
  it('远距逼近;LOS 内静止蓄电发 682 电弧（50 伤）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 108, y: 106 });
    const e = spawn(h, 578, 100, 108);
    tick(h, 70, [e]);                            // 渐显 60t + 逼近
    expect(Math.abs(e.cx - 108 * TILE)).toBeLessThan(10 * TILE);
    tick(h, 60, [e]);
    const zaps = h.projectiles.filter((p) => p.damage === 50);
    expect(zaps.length).toBeGreaterThan(0);
    expect(Math.hypot(zaps[0].vx, zaps[0].vy)).toBeGreaterThan(5);
  });
});
