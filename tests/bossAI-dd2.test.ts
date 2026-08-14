// DD2/旧日军团 + 沙漠族 AI 家族探针（aiStyle 93/102/103/104/105/106/108/109/110/111
// —— src/entities/bossAI_dd2.ts）：状态机主干 / 部件锚定与存活联动 / 弹幕节拍 /
// 出入场物（水晶→双门）链。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { DD2HealPulse } from '../src/entities/bossAI_dd2';
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

/** 逐 tick 驱动（默认全部存活敌人 + projectiles 桶——674 治疗脉动等实体也在内） */
function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
    for (const p of h.projectiles as unknown as Array<{ dead?: boolean; fixedUpdate: (dt: number, g: GameHooks) => void }>) {
      if (!p.dead) p.fixedUpdate(1 / 60, h.hooks);
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
  it('walker 核贴地逼近玩家;ai[0] 攻击循环推进并在 54t 放沙暴标记（粒子代）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: 105 });
    const e = spawn(h, 541, 100, 108);
    tick(h, 60, [e]);
    expect(e.ai0).toBeGreaterThan(0);                                // 起手 1 → 递增
    expect(Math.abs(e.cx - 130 * TILE)).toBeLessThan(46 * TILE);     // 向玩家侧移动
    // 658 沙暴标记原版 damage 0 纯视觉 → 粒子代,不生成弹体（见 RENDER_PROXY 注）
    expect(h.projectiles.length).toBe(0);
    expect(e.ai0).toBeGreaterThanOrEqual(54);                        // 已过 54t 标记帧
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
    // knockBackResist 语义 = 原版"承受比例"（0=免疫/1=全额,SetDefaults 541=0.05）:
    // 血 <50% 免击退 → 0（2026-08-13 语义翻转后断言同步;旧"1-比例"档此处误写 1）
    expect(e.def.knockbackResist).toBe(0);
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

  it('治疗招（ai[1]=1）三连拍各出一枚 674 脉动：疗效在拍后第 40 AI 步落地（Projectile.cs:35548-35573）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 112, y: 106 });
    const e = spawn(h, 565, 100, 108);
    const ally = spawn(h, 571, 108, 108);        // 德拉克龙（walker 族,3000 血）
    ally.hp = ally.maxHp - 800;
    tick(h, 1, [e]);                             // 先过 bInit（避免首帧归零 ai0/ai1）
    e.ai1 = 1; e.ai0 = 60;                       // 直接进治疗招倒计时
    // 拍点：ai[0]=56/48/40 = mage tick 4/12/20（出弹当帧脉动即走第一步,同原版
    // NPC 更新先于弹幕更新的帧序）→ 各脉动第 40 步 = tick 43/51/59
    tick(h, 42, [e]);
    expect(h.projectiles.length).toBe(3);        // 三枚脉动在场（未到 40 步不结算）
    expect(ally.hp).toBe(ally.maxHp - 800);      // ★40 步前疗效不落地（原近似=拍点即刻结算）
    tick(h, 1, [e]);                             // tick 43 = 首脉动第 40 步
    expect(ally.hp).toBe(ally.maxHp - 300);      // 首 +500（Projectile.cs:35558-35570）
    tick(h, 8, [e]);                             // tick 51 = 次脉动第 40 步
    expect(ally.hp).toBe(ally.maxHp);            // 次拍 +300 封顶补满;末拍亏空 0
    tick(h, 10, [e]);
    expect(h.projectiles.every((p) => (p as unknown as { dead: boolean }).dead)).toBe(true);
  });

  it('疗程过滤门（Projectile.cs:35556）：564/565、damage<1、lifeMax<30、满血都不吃', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 300, y: 106 });  // 玩家远离,魔法师原地施法
    const e = spawn(h, 565, 100, 108);
    // 纯数据体直接塞进敌怪表（脉动按结构消费,不跑 AI）
    const allies = [
      { dead: false, vanillaId: 564, def: { damage: 30 }, hp: 500, maxHp: 1000, cx: 1650, cy: 1740 },
      { dead: false, vanillaId: 571, def: { damage: 0 }, hp: 900, maxHp: 1000, cx: 1700, cy: 1740 },
      { dead: false, vanillaId: 571, def: { damage: 10 }, hp: 900, maxHp: 20, cx: 1750, cy: 1740 },
      { dead: false, vanillaId: 571, def: { damage: 10 }, hp: 500, maxHp: 1000, cx: 1800, cy: 1740 },
      { dead: false, vanillaId: 571, def: { damage: 10 }, hp: 1000, maxHp: 1000, cx: 1850, cy: 1740 },
    ];
    h.enemies.push(...(allies as unknown as Enemy[]));
    tick(h, 1, [e]);
    e.ai1 = 1; e.ai0 = 57;                       // 首拍 57→56
    tick(h, 46, [e]);
    expect(allies[0].hp).toBe(500);              // 564 同族排除
    expect(allies[1].hp).toBe(900);              // damage<1（小动物语义）排除
    expect(allies[2].hp).toBe(900);              // lifeMax<30 排除
    expect(allies[3].hp).toBe(1000);             // 正常友军 +500
    expect(allies[4].hp).toBe(1000);             // 满血无变化
  });

  it('下探 50 格无实心面 → WorldUtils.Find NOT_FOUND → 不出脉动（NPC.cs:66453 门）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 112, y: 106 });
    const e = spawn(h, 565, 100, 108);
    tick(h, 1, [e]);
    e.facing = 1;
    // 掏空落点列（gx 起 50 格全空——expandVertically 到 st.h−10 钳位仍无实心）
    const gx = Math.floor((e.cx + 240) / 16);
    const gy = Math.floor(e.cy / 16);
    const st = w.store;
    for (let y = gy; y < st.h; y++) st.setTile(gx, y, 0);
    e.ai1 = 1; e.ai0 = 57;
    tick(h, 3, [e]);                             // 跨过 56/48/40 三拍
    expect(h.projectiles.length).toBe(0);        // Find 失败 → 无 NewProjectile
  });
});

describe('674 治疗脉动实体（DD2HealPulse,Projectile.cs:35540-35574）', () => {
  type PulseLike = { dead: boolean; fixedUpdate: (dt: number, g: GameHooks) => void };
  function pulseHooks(enemies: unknown[]) {
    const hooks = {
      world: makeWorld(),
      player: { x: 0, y: 0, w: 20, h: 42, cx: 0, cy: 0, dead: true },
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
    } as unknown as GameHooks;
    return hooks;
  }
  const mkAlly = (id: number, hp: number, maxHp: number, d = 20, cx = 1600, cy = 1600) => ({
    dead: false, vanillaId: id, def: { damage: d }, hp, maxHp, cx, cy,
  });

  it('疗效恰在第 40 AI 步结算,脉动随即消亡（:35548-35573）', () => {
    const ally = mkAlly(571, 2500, 3000);
    const hooks = pulseHooks([ally]);
    const pulse = new DD2HealPulse(1600, 1600) as unknown as PulseLike;
    for (let i = 0; i < 39; i++) pulse.fixedUpdate(1 / 60, hooks);
    expect(ally.hp).toBe(2500);                  // 39 步未到
    expect(pulse.dead).toBe(false);
    pulse.fixedUpdate(1 / 60, hooks);            // 第 40 步
    expect(ally.hp).toBe(3000);
    expect(pulse.dead).toBe(true);               // Kill()
  });

  it('疗程圆心 = 脉动落点（Distance(nPC.Center) :35556,弹体中心）——900px 内吃/1100px 外不吃', () => {
    // 脉动在 (1600,1600);友军 A 距脉动 900px（在场）,友军 B 距 1100px（在外）。
    // 场上【无任何魔法师】——证明治疗判定只看脉动自身位置
    const a = mkAlly(571, 500, 2000, 20, 1600 + 900, 1600);
    const b = mkAlly(571, 500, 2000, 20, 1600 - 1100, 1600);
    const hooks = pulseHooks([a, b]);
    const pulse = new DD2HealPulse(1600, 1600) as unknown as PulseLike;
    for (let i = 0; i < 40; i++) pulse.fixedUpdate(1 / 60, hooks);
    expect(a.hp).toBe(1000);                     // 900px ≤1000 → +500
    expect(b.hp).toBe(500);                      // 1100px >1000 → 不吃
  });

  it('魔法师死亡不影响已出脉动（原版弹幕独立存活语义）', () => {
    const ally = mkAlly(571, 2500, 3000);
    const hooks = pulseHooks([ally]);
    const pulse = new DD2HealPulse(1600, 1600) as unknown as PulseLike;
    // 无任何魔法师参与推进——脉动自走 40 步
    for (let i = 0; i < 40; i++) pulse.fixedUpdate(1 / 60, hooks);
    expect(ally.hp).toBe(3000);
    expect(pulse.dead).toBe(true);
  });

  it('疗程封顶 +500/枚（:35558-35563 min(500, lifeMax−life)）', () => {
    const ally = mkAlly(571, 1000, 3000);        // 亏空 2000 → 单枚只回 500
    const hooks = pulseHooks([ally]);
    const pulse = new DD2HealPulse(1600, 1600) as unknown as PulseLike;
    for (let i = 0; i < 40; i++) pulse.fixedUpdate(1 / 60, hooks);
    expect(ally.hp).toBe(1500);
  });

  it('城镇 NPC 也在疗程扫描内（原版遍历 Main.maxNPCs 全表,damage≥1/lifeMax≥30 过门）', () => {
    const townNpc = mkAlly(17, 100, 250, 15);
    let npcSeen = 0;
    const hooks = pulseHooks([]);
    (hooks as unknown as { npcs: () => unknown[] }).npcs = () => { npcSeen++; return [townNpc]; };
    const pulse = new DD2HealPulse(1600, 1600) as unknown as PulseLike;
    for (let i = 0; i < 40; i++) pulse.fixedUpdate(1 / 60, hooks);
    expect(pulse.dead).toBe(true);
    expect(townNpc.hp).toBe(250);                // 城镇 NPC 吃到疗程
    expect(npcSeen).toBeGreaterThan(0);
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
