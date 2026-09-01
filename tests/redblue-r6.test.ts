// 红蓝对抗 R6 修复回归（蓝队）：门状态机 1:1 重写 / 专家跳扑梯 / 卡死小跳 /
// 宽探针 / 291 弹速 / 尖刺史莱姆两档 / 飘浮眼 Y 档 / 蠕虫两态+速度表 / 289 节奏 /
// AI_107 卡位传送+卡死跳 / 122 自创门摘除 / ai3 卡死计数 fighterPrevX 修正。
// 权威 Terarria1457/Terraria/NPC.cs，行号见各用例。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE_DEFS } from '../src/data/tiles';
import { placeDoorClosed } from '../src/world/Door';
import { T } from '../src/data/tiles';
import { ai107ImprovedWalkers } from '../src/entities/bossAI_dd2';

const W = 160, H = 90, FLOOR = 60;

function makeWorld(): World {
  const w = new World(W, H, 11, 'redblue-r6');
  const st = w.store;
  w.groundLevel = 24;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  w.clock.timeOfDay = 0.9;   // 夜
  return w;
}

type Proj = { x: number; y: number; vx: number; vy: number; damage: number; projId?: number; life?: number };

function makeHooks(w: World, playerAt: { x: number; y: number } | null) {
  const enemies: Enemy[] = [];
  const wst = w.store;
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
  const px = (playerAt?.x ?? 70) * TILE, py = (playerAt?.y ?? FLOOR - 3) * TILE;
  const player = new Player(px, py, new Inventory());
  const hooks = {
    world: w, player: playerAt ? player : null,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnBurst: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxWav: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    cutTile: () => {},
    breakTile: (bx: number, by: number) => wst.setTile(bx, by, 0),   // 26 拆门走真清除
    scene: { zoneGraveyard: false, zoneCorrupt: false, zoneCrimson: false, zoneSandstorm: false, zoneUndergroundDesert: false },
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, player, em };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (g: GameHooks, p: unknown) => void>)[fn];

function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

function settle(h: ReturnType<typeof makeHooks>, e: Enemy, n = 200): void {
  for (let i = 0; i < n; i++) {
    e.fixedUpdate(1 / 60, h.hooks);
    if (i >= 5 && e.vy === 0) break;
  }
}

// ===========================================================================
// F1-1 攻门状态机（1457 :60584-60681）
// ===========================================================================
describe('R6-B F1-1 攻门状态机', () => {
  /** 门前布场：僵尸/哥布林在关门左侧贴门站立 */
  function doorScene(id: number, opts?: { bloodMoon?: boolean }) {
    const w = makeWorld();
    if (opts?.bloodMoon) w.clock.bloodMoon = true;
    const h = makeHooks(w, { x: 40, y: FLOOR - 3 });
    // 门放在怪前方脚上一格：怪在 30、门在 31、玩家在 40（怪朝右顶门）
    const e = spawn(h, id, 29, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    const st = w.store;
    // 整扇关门（1×3，锚点顶格；帧正确 → openDoor 锚点回溯可用）
    placeDoorClosed(st, 31, FLOOR - 3, 0);
    const doorId = T.DOOR_CLOSED;
    settle(h, e, 10);
    return { w, h, e, st, doorId };
  }

  it('白名单型（僵尸 3）普通夜不开门：敲 240t 门仍在、ai[1] 恒 ≤5（:60601 flag28 归零）', () => {
    const { h, e, st, doorId } = doorScene(3);
    tick(h, 240, [e]);
    expect(st.type[st.idx(31, FLOOR - 2)]).toBe(doorId);   // 门没开
    expect(e.doorHit).toBeLessThanOrEqual(5);              // 每击先归零再 +5 → 恒 5
    expect(e.doorWarm).toBeLessThan(60);                   // 60t 一击节奏内
  });

  it('白名单型血月开门：两击（≈120t）后 OpenDoor（:60601 !bloodMoon 门）', () => {
    const { h, e, st, doorId } = doorScene(3, { bloodMoon: true });
    tick(h, 200, [e]);
    expect(st.type[st.idx(31, FLOOR - 2)]).not.toBe(doorId);  // 门已开（换开启态 tile）
  });

  it('非白名单攻门型（愤怒骷髅 31，+6/击）普通夜两击开门（:60625-60628）', () => {
    const { h, e, st, doorId } = doorScene(31);
    tick(h, 200, [e]);
    expect(st.type[st.idx(31, FLOOR - 2)]).not.toBe(doorId);
  });

  it('哥布林苦力 26 两击直接拆门（:60643-60650 KillTile）', () => {
    const { h, e, st, doorId } = doorScene(26);
    tick(h, 200, [e]);
    expect(st.type[st.idx(31, FLOOR - 2)]).not.toBe(doorId);
  });

  it('攻门期 ai[3] 每 tick 归零保持索敌（:60587）；击退脉冲 vx=0.5×−direction（:60610）', () => {
    const { h, e } = doorScene(3);                         // 白名单型普通夜永不开门（敲不停）
    let sawPulse = false;
    for (let i = 0; i < 100; i++) {
      e.fixedUpdate(1 / 60, h.hooks);
      if (e.vx === 0.5 * -e.facing) sawPulse = true;       // 击帧 vx 恰为 0.5×−direction
    }
    expect(e.ai3).toBe(0);                                 // 攻门期保持索敌（曾饱和游荡）
    expect(sawPulse).toBe(true);
  });
});

// ===========================================================================
// F1-2 专家跳扑梯（:60744）/ F1-3 卡死小跳（:60740）/ 计数修正
// ===========================================================================
describe('R6-B F1-2/F1-3 跳梯与卡死小跳', () => {
  it('专家模式战士奔跑中（vx≠0、ai3=0）玩家在上方平台 → vy=-7.9（无 vx==0/ai3 门）', () => {
    const w = makeWorld();
    w.difficulty = 1;                                      // expert
    const h = makeHooks(w, { x: 100, y: FLOOR - 3 });      // 先放远处落地（settle 期不触发跳扑）
    const e = spawn(h, 3, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 10);
    expect(e.vy).toBe(0);
    h.hooks.player.x = 40 * TILE;                          // 玩家上到 6 格高台
    h.hooks.player.y = (FLOOR - 8) * TILE;
    e.vx = 1;                                              // 奔跑中（旧门要求 vx==0 → 永不触发）
    drive(e, 'fighterAI').call(e, h.hooks, h.hooks.player);
    expect(e.vy).toBe(-7.9);
  });

  it('经典模式卡死小跳：tick 初 vx==0 + ai3==1 + 前方净空 → vy=-5（:60740）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 3, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 10);
    e.vx = 0;                                              // 模拟上拍被墙清零
    e.ai3 = 1;                                             // 卡死计数恰 1
    drive(e, 'fighterAI').call(e, h.hooks, h.hooks.player);
    expect(e.vy).toBe(-5);
  });

  it('对照：ai3≠1 不跳（门是恰 1）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 3, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 10);
    e.vx = 0;
    e.ai3 = 5;
    drive(e, 'fighterAI').call(e, h.hooks, h.hooks.player);
    expect(e.vy).toBe(0);
  });

  it('计数修正回归：行走 120t ai3 不饱和（<60，fighterPrevX 语义）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 120, y: FLOOR - 3 });
    const e = spawn(h, 3, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 10);
    tick(h, 120, [e]);
    expect(e.ai3).toBeLessThan(60);                        // 曾恒真比较 → 饱和游荡
  });
});

// ===========================================================================
// 1-5 宽探针 / 1-4 291 弹速
// ===========================================================================
describe('R6-B 探针与弹速表', () => {
  it('宽探针 19 型：109 探测点 = width/2+16（比 15 远 ~10px，2 格外墙提前跳）', () => {
    // 怪在 40（盒 640-658）、墙在 42 行 58（脚上一行）：中心 649 → 窄探针 664→格 41 空、
    // 宽探针 649+25=674→格 42 命中
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 109, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;                              // 恰落地（不 settle——防走到墙边）
    const st = w.store;
    st.setTile(42, FLOOR - 2, 1);
    e.vx = 1;
    drive(e, 'fighterAI').call(e, h.hooks, h.hooks.player);
    expect(e.vy).toBe(-6);                                 // 宽探针命中 → 1 格墙跳档
    // 对照：僵尸 3（15px 探针）同场景不跳
    const w2 = makeWorld();
    const h2 = makeHooks(w2, { x: 70, y: FLOOR - 3 });
    const z = spawn(h2, 3, 40, FLOOR - 2);
    z.y = FLOOR * TILE - z.h;
    w2.store.setTile(42, FLOOR - 2, 1);
    z.vx = 1;
    drive(z, 'fighterAI').call(z, h2.hooks, h2.hooks.player);
    expect(z.vy).toBe(0);
  });

  it('291 骷髅神射弹速 = 默认 11（:59805 无覆写；曾误 4=293 的值）', () => {
    const tbl = (Enemy as unknown as { RANGED_TABLE: Record<number, { speed: number }> }).RANGED_TABLE;
    expect(tbl[291].speed).toBe(11);
    expect(tbl[293].speed).toBe(4);
    expect(tbl[292].speed).toBe(11);
  });
});

// ===========================================================================
// 2-1 尖刺史莱姆两档 / 2-4 彩虹史莱姆 / 2-5 大跳才记 jumpStartX
// ===========================================================================
describe('R6-B 尖刺/彩虹史莱姆', () => {
  it('专家 184 中距 150px：走单发档（else-if :61796）而非不射/五连扇', () => {
    const w = makeWorld();
    w.difficulty = 1;
    const h = makeHooks(w, { x: 40, y: FLOOR - 2 });
    h.hooks.player.x = 40 * TILE + 150;                    // 恰 150px ∈ (120, 200)
    h.hooks.player.y = (FLOOR - 2) * TILE;
    const e = spawn(h, 184, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 10);
    tick(h, 200, [e]);
    expect(h.projectiles.length).toBeGreaterThan(0);       // 曾完全不射击
    expect(h.projectiles.length).toBeLessThan(8);          // 单发节奏（50t 冷却；5 连扇会 ~30 发）
  });

  it('专家 184 近距 80px：五连扇（:61783-61793）', () => {
    const w = makeWorld();
    w.difficulty = 1;
    const h = makeHooks(w, { x: 41, y: FLOOR - 2 });
    const e = spawn(h, 184, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 10);
    tick(h, 60, [e]);
    expect(h.projectiles.length).toBeGreaterThanOrEqual(5);
  });

  it('244 彩虹史莱姆 ai[0] 每 tick +2（:61698-61702，空中也计）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 244, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 10);
    const before = e.ai0;
    e.vy = -1;                                             // 空中
    drive(e, 'slimeAI').call(e, h.hooks, h.hooks.player);
    expect(e.ai0 - before).toBe(2);
  });
});

// ===========================================================================
// 2-2 飘浮眼 default 档（Y 步 0.04 / 帽 1.5 / 漂移 +0.03）
// ===========================================================================
describe('R6-B 飘浮眼 Y 档还原', () => {
  it('恶魔眼 2 上飞 20t：vy ≈ -0.8（步 0.04）且 |vy| ≤ 1.5（曾步 0.1/帽 2.5）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 40, y: 20 });              // 玩家在上方 → dirY=-1
    const e = spawn(h, 2, 40, FLOOR - 4);
    settle(h, e, 4);
    for (let i = 0; i < 20; i++) drive(e, 'floatEyeAI').call(e, h.hooks, h.hooks.player);
    expect(e.vy).toBeLessThan(-0.7);                       // 20t × 0.04 = -0.8（步 0.1 会到 -2）
    expect(e.vy).toBeGreaterThan(-1.2);
    for (let i = 0; i < 200; i++) drive(e, 'floatEyeAI').call(e, h.hooks, h.hooks.player);
    expect(e.vy).toBeGreaterThanOrEqual(-1.5);             // 帽 1.5（曾 2.5）
  });
});

// ===========================================================================
// 3-1/3-2 蠕虫两态 + 速度表
// ===========================================================================
describe('R6-B 蠕虫两态与速度表', () => {
  it('出地骨蛇 39：重力坠机 vy+=0.11 钳 9，不垂直追人（:52473-52521）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 40, y: 20 });              // 玩家在正上方
    const e = spawn(h, 39, 40, FLOOR - 6);                 // 开阔地（无实心邻域）
    e.y = (FLOOR - 6) * TILE;
    const vy0 = e.vy;
    for (let i = 0; i < 10; i++) drive(e, 'wormAI').call(e, h.hooks, h.hooks.player);
    expect(e.vy).toBeGreaterThan(vy0);                     // 重力坠机（曾直线飞向玩家）
    expect(e.vy).toBeLessThanOrEqual(9);                   // 钳 num46=9
  });

  it('入地吞世怪 95：速度逼近 5.5（曾用 8 快 45%）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 60, y: FLOOR - 3 });
    // 埋进实心里（flag3）
    for (let x = 45; x <= 55; x++) for (let y = FLOOR - 4; y <= FLOOR - 1; y++) w.store.setTile(x, y, 1);
    const e = spawn(h, 95, 50, FLOOR - 3);
    e.y = (FLOOR - 3) * TILE;
    e.vx = 5; e.vy = 0;
    for (let i = 0; i < 60; i++) drive(e, 'wormAI').call(e, h.hooks, h.hooks.player);
    const spd = Math.hypot(e.vx, e.vy);
    expect(spd).toBeGreaterThan(4.5);
    expect(spd).toBeLessThanOrEqual(5.6);                  // 5.5 上限（曾 8）
  });

  it('入地沙虫头 454：速度逼近 20（曾 8 慢 60%）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 80, y: FLOOR - 3 });
    for (let x = 45; x <= 75; x++) for (let y = FLOOR - 4; y <= FLOOR - 1; y++) w.store.setTile(x, y, 1);
    const e = spawn(h, 454, 50, FLOOR - 3);
    e.y = (FLOOR - 3) * TILE;
    e.vx = 10; e.vy = 0;
    let maxSpd = 0;
    for (let i = 0; i < 40; i++) {                         // 40t 内到达玩家前（超过则折返臂接管）
      drive(e, 'wormAI').call(e, h.hooks, h.hooks.player);
      maxSpd = Math.max(maxSpd, Math.hypot(e.vx, e.vy));
    }
    expect(maxSpd).toBeGreaterThan(14);                    // 向 20 收敛（曾钳 8）
  });

  it('87/454 折返增速（flag8 :52600-52659）：背向且 |v|>num47/2 → ×1.1', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 40, y: FLOOR - 3 });       // 玩家在左侧
    for (let x = 35; x <= 65; x++) for (let y = FLOOR - 4; y <= FLOOR - 1; y++) w.store.setTile(x, y, 1);
    const e = spawn(h, 454, 50, FLOOR - 3);
    e.y = (FLOOR - 3) * TILE;
    e.vx = 10; e.vy = 0;                                   // 向右冲，目标在左 = 背向
    const s0 = Math.hypot(e.vx, e.vy);
    drive(e, 'wormAI').call(e, h.hooks, h.hooks.player);
    expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(s0 * 1.1, 1);
  });
});

// ===========================================================================
// 4-4 289 节奏 / 4-10 122 自创门
// ===========================================================================
describe('R6-B 289/122', () => {
  it('289 攻击段结束 ai[2] 保留（:21890-21897）→ 稳态周期 120t', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 42, y: FLOOR - 3 });
    const e = spawn(h, 289, 40, FLOOR - 8);
    e.ai2 = 41; e.ai3 = 1;
    drive(e, 'cursedSkullAI').call(e, h.hooks, h.hooks.player);
    expect(e.ai3).toBe(0);
    expect(e.ai2).toBe(42);                                // 曾归零 → 周期 160t
  });

  it('122 充能无 700px 距离取消（:24955-24961 字面）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 40, y: FLOOR - 3 });
    const e = spawn(h, 122, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 6);
    e.ai3 = 10;
    h.hooks.player.x = 40 * TILE + 900;                    // 拉到 900px 外
    h.hooks.player.y = (FLOOR - 3) * TILE;
    drive(e, 'ghostAI').call(e, h.hooks, h.hooks.player);
    expect(e.ai3).toBe(11);                                // 曾自创 ≥700 归零
  });
});

// ===========================================================================
// 5-1 AI_107 卡位传送 / 5-2 卡死跳
// ===========================================================================
describe('R6-B AI_107 walker', () => {
  it('卡位 30t → 侧移 width×2 穿墙（:64660-64691，曾只计数无传送）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 90, y: FLOOR - 3 });       // 玩家远处（AABB 相交会清 ai3）
    const e = spawn(h, 552, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 6);
    e.ai3 = 29;
    e.vx = -1; e.vy = 0; e.facing = 1;                     // flag19（落地逆行）→ 计数 +1
    const x0 = e.x;
    ai107ImprovedWalkers(e, h.hooks, h.hooks.player);
    expect(e.ai3).toBe(30);
    expect(e.x).toBeGreaterThan(x0 + e.w * 1.5);           // 传送侧移 ~2×width（相位伺服另移 ≤1px）
  });

  it('卡死小跳：tick 初静止 + ai3==1 → vy=-5（:65030-65034）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 90, y: FLOOR - 3 });
    const e = spawn(h, 552, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 6);
    e.vx = 0; e.vy = 0; e.ai3 = 1;                         // 卡死计数恰 1（settle 末拍在移动 →
    ai107ImprovedWalkers(e, h.hooks, h.hooks.player);      //  w107NoMove 已删 → 计数器不再进位）
    expect(e.vy).toBeCloseTo(-5 + 0.3, 6);                 // -5 起跳 + 尾段公共重力 0.3
  });
});
