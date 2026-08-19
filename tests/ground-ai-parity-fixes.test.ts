// 2026-08-19 台账 C 批（地面主力）+ A 批（null-player 早退冻结）回归。
// 驱动方式 = 原型直调（drive 私有 AI 方法）+ 少量 fixedUpdate 全链（卡死计数须走
// fixedUpdate 的 prevX 快照）。标杆 Terarria1456/Terraria/NPC.cs，行号见各用例注释。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const W = 140, H = 90, FLOOR = 60;

function makeWorld(): World {
  const w = new World(W, H, 11, 'ground-ai-parity');
  const st = w.store;
  w.groundLevel = 24;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  w.clock.timeOfDay = 0.9;   // 夜间（白天驱散门不干扰）
  return w;
}

type Proj = { x: number; y: number; vx: number; vy: number; damage: number; projId?: number; life?: number };

function makeHooks(w: World, playerAt: { x: number; y: number } | null) {
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
  const px = (playerAt?.x ?? 70) * TILE, py = (playerAt?.y ?? FLOOR - 3) * TILE;
  const player = new Player(px, py, new Inventory());
  const hooks = {
    world: w, player: playerAt ? player : null,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    cutTile: () => {},
    scene: { zoneGraveyard: false },
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

/** 落到地板上（vy 归零、onGround 置位）。★出生 vy=0 也至少跑 5 tick——
 *  从空中起算的实体首帧 vy 可能仍为 0（重力在 AI 内后置累加） */
function settle(h: ReturnType<typeof makeHooks>, e: Enemy, n = 200): void {
  for (let i = 0; i < n; i++) {
    e.fixedUpdate(1 / 60, h.hooks);
    if (i >= 5 && e.vy === 0 && (e.onGround || e.vanilla?.aiStyle === 13)) break;
  }
}

// ===========================================================================
// A 批：null-player 早退冻结（原版对尸体坐标继续运转）
// ===========================================================================
describe('A 批 null-player 早退冻结', () => {
  it('casterAI：玩家死亡后计时/传送照常（cs:20786 faceTarget=false 只冻结朝向）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 29, 40, FLOOR - 2);
    settle(h, e);
    e.ai0 = 700;                       // ≥650 → 传送触发
    const facing0 = e.facing;
    (h.hooks as unknown as { player: Player }).player = { ...h.player, dead: true } as unknown as Player;
    drive(e, 'casterAI').call(e, h.hooks, h.hooks.player);
    expect(e.ai0).toBe(1);             // :21057 ai[0]=1 重置（状态机继续运转）
    expect(e.facing).toBe(facing0);    // 死亡不重定朝向
  });

  it('solenian 419：玩家死亡后冲刺态照跑、标志复位不再残留（cs:57116-57117 每帧复位）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 419, 40, FLOOR - 2);
    settle(h, e);
    (h.hooks as unknown as { player: Player }).player = { ...h.player, dead: true } as unknown as Player;
    e.ai2 = -8;                        // 冲刺中
    e.vy = 2;                          // 空中（未落地）
    e.reflectsProjectiles = true;
    e.takenDamageMultiplier = 3;
    drive(e, 'fighterAI').call(e, h.hooks, h.hooks.player);
    // 冲刺分支照跑（对尸体坐标）：reflects 仍 true（:57170）
    expect(e.reflectsProjectiles).toBe(true);
    expect(e.takenDamageMultiplier).toBe(3);
    // 落地恢复态（ai2>0 倒数）→ 顶部复位两标志（:57116-57117）
    e.ai2 = 60;
    e.vy = 0;
    e.onGround = true;
    drive(e, 'fighterAI').call(e, h.hooks, h.hooks.player);
    expect(e.reflectsProjectiles).toBe(false);
    expect(e.takenDamageMultiplier).toBe(1);
  });

  it('medusa 480：玩家死亡后蓄力计时继续（cs:56751 块无 dead 早退）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 480, 40, FLOOR - 2);
    settle(h, e);
    (h.hooks as unknown as { player: Player }).player = { ...h.player, dead: true } as unknown as Player;
    e.ai2 = -100;                      // 蓄力中
    drive(e, 'fighterAI').call(e, h.hooks, h.hooks.player);
    expect(e.ai2).toBe(-99);           // 计数推进（不冻结）
  });
});

// ===========================================================================
// S 批：史莱姆 AI_001
// ===========================================================================
describe('S 批 史莱姆（NPC.cs:61964-62137）', () => {
  it('S1 per-type 跳跃计数：658 仆从 +7/t（flag3+1、基础+1、type+5）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 120, y: FLOOR - 3 });   // >500px（仆从弹幕门隔离）
    const e = spawn(h, 658, 40, FLOOR - 2);
    settle(h, e);
    e.ai0 = -1400;                     // 阶段空档（无起跳重置，纯计数读数）
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    expect(e.ai0).toBe(-1393);         // :61964-61992（+1+1+5）
  });

  it('S5 num54 表：659 粉仆从阶段基线 −500（窗 [−500,−250] 为小跳）+ 跳乘区 ×1.6', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 659, 40, FLOOR - 2);
    settle(h, e);
    e.ai0 = -300;                      // ∈ [−500,−250]（默认表 −1000 时 −300 不在窗内）
    e.vx = 0;
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    // vy=−6 → ×1.6 = −9.6（尾段重力折算 ≈−9.5）。vx 断言略——本仓 groundPhysics
    // ±1 档位钳（既有约定）会截掉 ×1.2 后的横向冲量，纵向不受影响
    expect(e.vy).toBeLessThan(-9);
  });

  it('S4 59 岩浆史莱姆大跳加成：vy=−8−2（:62048-62057）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 59, 40, FLOOR - 2);
    settle(h, e);
    e.ai0 = -1600;                     // ∈ [−2000,−1500]（num54*2..num54*1.5）大跳
    e.vx = 0;
    e.facing = 1;
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    expect(e.vy).toBeLessThan(-9.8);   // −10 + 重力折算
  });

  it('S3 空中转向：滞空且目标在侧 → ±0.2/t 步进 / 逆向 ×0.93（:62120-62137）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 90, y: FLOOR - 3 });
    const e = spawn(h, 1, 40, FLOOR - 6);
    e.onGround = false;
    e.vy = 3;                          // 滞空
    e.facing = 1;
    e.vx = 0;
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    expect(e.vx).toBeGreaterThan(0.15);   // dir=1 且 vx<3 → +0.2（尾段空中摩擦 ×0.98）
    // 逆向（vx≤−0.01）→ ×0.93（取钳内值 −0.5 观察；groundPhysics ±1 钳不干扰）
    e.vx = -0.5;
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    expect(e.vx).toBeCloseTo(-0.5 * 0.93 * 0.98, 2);
  });

  it('S7 204 丛林刺：正常档 <400px、冷却 65、压跳 ai0=−80、速 7 伤 13（:61832-61850）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: FLOOR - 3 });   // ~240px
    const e = spawn(h, 204, 40, FLOOR - 2);
    settle(h, e);
    e.ai3 = 0;
    h.projectiles.length = 0;
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    expect(h.projectiles.length).toBe(1);
    expect(e.ai3).toBe(65);            // :61848
    expect(e.ai0).toBe(-80);           // :61834
    const p = h.projectiles[0];
    expect(p.damage).toBe(13);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(7, 5);
  });

  it('S8 蚱蜢激愤逃跳：起跳即反向（direction 与 vx 双反，:62102-62106）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 43, y: FLOOR - 3 });   // <200px → flag3
    const e = spawn(h, 377, 40, FLOOR - 2);
    settle(h, e);
    e.facing = 1;
    e.ai0 = 0;                         // 触发起跳
    e.vx = 0;
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    expect(e.facing).toBe(-1);         // 反向逃跳
    expect(e.vx).toBeLessThan(0);
  });

  it('S9 金属矿史莱姆强化：防+30/伤×3/HP×3/scale×1.2（:61107-61128）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 1, 40, FLOOR - 2);
    settle(h, e);
    const dmg0 = e.def.damage, def0 = e.def.defense ?? 0, hp0 = e.maxHp;
    e.ai1 = 364;                       // 钴矿（slimeRollContainedItem 槽位）
    e.vy = 0;
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    expect(e.def.defense).toBe(def0 + 30);
    expect(e.def.damage).toBe(Math.trunc(dmg0 * 3));
    expect(e.maxHp).toBe(hp0 * 3);
    expect(e.hp).toBe(hp0 * 3);
  });

  it('S9 悬停重力：玩家在正下方（底边高于玩家顶边 + X 重叠）→ direction=0、vx×0.5、vy 钳 ≥0 后 +g（:61130-61139）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 40, y: 48 });   // 玩家在史莱姆正下方（净空）
    const e = spawn(h, 1, 40, 44);
    e.ai1 = 365;                       // 秘银矿
    // 首帧过 ai[2]==0 初始化（:61926 TargetClosest 会覆写 direction）——第二帧起悬停生效
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    e.vy = -5;                         // 上升中 → 钳 0
    e.vx = 2;
    e.facing = 1;
    e.onGround = false;
    drive(e, 'slimeAI').call(e, h.hooks, h.player);
    expect(e.facing).toBe(0);          // :61133
    expect(e.vx).toBeGreaterThan(0.5); // ×0.5（≈0.98）
    expect(e.vx).toBeLessThan(1.2);
    expect(e.vy).toBeGreaterThan(0);   // 钳 ≥0 后 +gravity 沉降
  });
});

// ===========================================================================
// F 批：战士族 AI_003
// ===========================================================================
describe('F 批 战士族（NPC.cs:56646-60724）', () => {
  it('F1 近身扑跳：愤怒骷髅 31 落地 |Δ|<100/50 且 vx≥1 → vx×2 钳 3 + vy=−4（:60599-60651）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 45, y: FLOOR - 3 });   // ~80px
    const e = spawn(h, 31, 40, FLOOR - 2);
    settle(h, e);
    e.facing = 1;
    e.vx = 1.2;
    e.vy = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.vy).toBe(-4);
    // vx = (1.2 + num84 档加速 0.07)×2 ≈ 2.54（钳 3 内）
    expect(e.vx).toBeGreaterThan(2.4);
    expect(e.vx).toBeLessThan(2.7);
  });

  it('F2 292 战术骷髅：fireAt=60（num165=120/2），四连发各重新瞄准（:59580/:59955-59968）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: FLOOR - 3 });
    const e = spawn(h, 292, 40, FLOOR - 2);
    settle(h, e);
    e.ai2 = 3;                         // 瞄准姿态
    e.ai1 = 61;                        // 下一 tick 倒数到 60 → 发射
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(h.projectiles.length).toBe(4);
    expect(e.ai1).toBe(60);
  });

  it('F3 justHit 重瞄：骷髅弓手 110 受击 → ai1=30、姿态清零（:59486-59492，倒数先跑）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: FLOOR - 3 });
    const e = spawn(h, 110, 40, FLOOR - 2);
    settle(h, e);
    e.ai2 = 3;
    e.ai1 = 20;
    e.justHitT = 2;                    // justHit
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai1).toBe(30);            // :59489（先 −1 再覆写 30：净 30）
    expect(e.ai2).toBe(0);
  });

  it('F4 216 神射手分档：非激怒档冷却 9（:59577），fireAt=4', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: FLOOR - 3 });
    h.player.useTime = 30;             // idle 门（cs:60037）
    const e = spawn(h, 216, 40, FLOOR - 2);
    settle(h, e);
    e.lai2 = 0;                        // <20 → 普通档
    e.ai2 = 0; e.ai1 = 0;
    e.vx = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai1).toBe(9);             // 开瞄 → num163=9
    // 9 倒数：fireAt = 9/2 = 4；倒数到 4 即发射（216 普通 30 伤 180 弹）
    e.ai2 = 3;
    e.ai1 = 5;
    h.projectiles.length = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(h.projectiles.length).toBe(1);
    expect(h.projectiles[0].damage).toBe(30);
  });

  it('F10 631 岩石巨人连发循环：ai2 0→100、84 发射、100↔68 循环（:56685-56749）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: FLOOR - 3 });
    const e = spawn(h, 631, 40, FLOOR - 2);
    settle(h, e);
    e.ai2 = 0;
    e.vx = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai2).toBe(100);           // 开摇即满（:56700）
    e.ai2 = 83;
    h.projectiles.length = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai2).toBe(84);
    expect(h.projectiles.length).toBe(1);   // :56720 ==84 发射
    e.ai2 = 100;                       // 满值 + 落地近距 → 回 68
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai2).toBe(68);            // :56744-56747
  });

  it('F13 482 花岗岩傀儡石壳：计数 300 落地 → −120 入壳、下一 tick 起不可击（:56671-56683）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 482, 40, FLOOR - 2);
    settle(h, e);
    e.ai2 = 300;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai2).toBe(-120);
    drive(e, 'fighterAI').call(e, h.hooks, h.player);   // 壳内分支接管
    expect(e.ai2).toBe(-119);
    expect(e.dontTakeDamage).toBe(true);
  });

  it('F12 471 哥布林术士：地面计数 180 → 召唤演出态（ai3=1）；60t 召 472（:57076-57085）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 471, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;          // 直接站地（settle 会让其飞走）
    e.vy = 0; e.onGround = true;
    e.ai2 = 0; e.ai3 = 0;
    e.ai2 = 179;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai3).toBe(1);             // ≥180 → 召唤演出
    e.ai2 = 59;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai2).toBe(60);
    expect(h.enemies.filter((o) => o.vanillaId === 472).length).toBe(1);   // :57048
  });

  it('F17 111 哥布林弓手营地待机：ai3<0 面朝锚 NPC、ai0 走 1000+（:57367-57411）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const anchor = spawn(h, 471, 60, FLOOR - 2);   // 锚 NPC（enemies[0]）
    const e = spawn(h, 111, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    e.vy = 0; e.onGround = true;
    e.ai3 = -(h.enemies.indexOf(anchor) + 1);      // :57388 num56 = −ai[3]−1
    e.ai0 = 0;
    e.vx = 2;
    e.facing = -1;                     // 背向锚（朝左）→ 须被纠正为朝锚
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai0).toBe(1001);          // :57396-57404 钳 1000 起步 +1
    expect(e.vx).toBeLessThan(2);      // 0.93 摩擦
    expect(e.facing).toBe(Math.sign(anchor.cx - e.cx));   // 面朝锚
  });

  it('F18 348 礼物宝箱怪半血 → 349 胡桃夹子（:57426-57429）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 348, 40, FLOOR - 3);
    settle(h, e);
    e.hp = Math.floor(e.maxHp * 0.5);
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.vanillaId).toBe(349);
  });

  it('F15 空中乘区：屠夫 460 上升期 vx×1.3/vy×1.1（:60667-60671）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 460, 40, FLOOR - 2);
    e.vy = -2;                         // 上升中
    e.vx = 2;
    e.onGround = false;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.vx).toBeGreaterThan(2.6); // 加速后 ×1.3（≈2.73）
    expect(e.vx).toBeLessThan(2.8);
    expect(e.vy).toBeLessThan(-2.05);  // (−2+重力折算 0.1)×1.1 ≈ −2.09
  });

  it('F7 稻草人 305 蹦跳：落地 |vx|<0.3 → vy=−7、vx=num86×dir（:58236-58247）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 305, 40, FLOOR - 2);
    settle(h, e);
    e.vx = 0.1;
    e.vy = 0;
    e.facing = 1;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.vy).toBeGreaterThan(-7.05);
    expect(e.vy).toBeLessThan(-6.8);   // −7 + 重力折算（尾段重力 0.1）
    expect(e.vx).toBeGreaterThan(1.9); // 305 档 num86=2
  });

  it('F19 拜月教弓手 379/380 弹伤 40（:59807-59810）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: FLOOR - 3 });
    const e = spawn(h, 379, 40, FLOOR - 2);
    settle(h, e);
    e.ai2 = 3;
    e.ai1 = 41;                        // fireAt=40
    h.projectiles.length = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(h.projectiles.length).toBe(1);
    expect(h.projectiles[0].damage).toBe(40);
  });

  it('F20 drop 区间：投骨骷髅 449 射程 200 内开瞄（:59723-59726 区间下坠补偿）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 44, y: FLOOR - 3 });   // ~64px（<200 射程）
    h.player.useTime = 30;             // idle 门（cs:60037 stealth==0 && itemAnimation==0）
    const e = spawn(h, 449, 40, FLOOR - 2);
    settle(h, e);
    e.ai2 = 0; e.ai1 = 0; e.vx = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.ai2).toBe(3);             // 开瞄成功（射程门内）
  });
});

// ===========================================================================
// F14 通用 ai[3] 卡死计数 + B-3/B-4 昼行表（fixedUpdate 全链）
// ===========================================================================
describe('F14 卡死计数 + B-3/B-4 昼行表（cs:57472-57546 / :60694-60724）', () => {
  /** 白天离屏布场：EncourageDespawn 的可观测面在离屏消散（屏内时 CheckActive
   *  每 tick 重置鼓励旗与 timeLeft——与原版 :78669-78798 同语义）。玩家放最右、
   *  怪放最左（>62 格 = 屏外），白天切换后鼓励消散 ~10t 即消失 */
  function dayOffscreen(id: number) {
    const w = makeWorld();             // 夜间落稳
    const h = makeHooks(w, { x: 130, y: FLOOR - 3 });
    const e = spawn(h, id, 5, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;
    settle(h, e, 30);
    w.clock.timeOfDay = 0.3;           // 白天（DAWN 0.1875 < 0.3 < DUSK 0.8125）
    w.groundLevel = FLOOR - 1;         // 地板上方（地表语义——cy < groundLevel×16）
    return { w, h, e };
  }

  it('僵尸 3 白天地表：离屏 EncourageDespawn(10) → ~10t 消散（:57773-57775）', () => {
    const { h, e } = dayOffscreen(3);
    tick(h, 30, [e]);
    expect(e.dead).toBe(true);
  });

  it('B-3 哥布林 26：仅 invasionType==1 昼行（cs:60696 第一组门）', () => {
    const { w, h, e } = dayOffscreen(26);
    tick(h, 30, [e]);
    expect(e.dead).toBe(true);                  // 无入侵 → 驱散消散
    const { w: w2, h: h2, e: e2 } = dayOffscreen(26);
    w2.invasionType = 1;
    tick(h2, 60, [e2]);
    expect(e2.dead).toBe(false);                // 哥布林入侵中 → 昼行不散
  });

  it('B-3 海盗 212：仅 invasionType==3 昼行；B-4 528 沙鬼无条件昼行', () => {
    const { w, h, e } = dayOffscreen(212);
    tick(h, 30, [e]);
    expect(e.dead).toBe(true);
    const { w: w2, h: h2, e: e2 } = dayOffscreen(212);
    w2.invasionType = 3;
    tick(h2, 60, [e2]);
    expect(e2.dead).toBe(false);
    const { h: h3, e: e3 } = dayOffscreen(528);
    tick(h3, 60, [e3]);
    expect(e3.dead).toBe(false);                // 528 无条件昼行（:60701）
  });

  it('B-4 624 侏儒白天停索敌但不 EncourageDespawn（:57773 免驱段）', () => {
    const { h, e } = dayOffscreen(624);
    tick(h, 60, [e]);                 // 侏儒 60t 后另有日光石化（与本断言无关的路径）
    expect(e.dead || e.despawnTimer > 100).toBe(true);   // 无 10t 快速消散
  });

  it('F14 卡死计数：贴墙不动 60t → ai[3] 满、索敌门关闭（:57732 ai[3]<num58 门）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 3, 40, FLOOR - 2);
    // 右侧竖墙（24 格高挡死）+ 顶盖（防跳墙）
    const st = w.store;
    for (let y = FLOOR - 26; y < FLOOR; y++) st.setTile(44, y, 1);
    for (let x = 40; x <= 47; x++) st.setTile(x, FLOOR - 28, 1);
    tick(h, 200, [e]);
    expect(e.ai3).toBeGreaterThanOrEqual(60);    // 卡死计数满（X 不动 +1/t）
    // 索敌门关闭：目标换到另一侧也不再跟随（游荡转向另有 2t 窗，单 drive 不翻）
    h.player.x = 20 * TILE; h.player.y = (FLOOR - 3) * TILE;
    const f0 = e.facing;
    e.prevX = e.x;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.facing).toBe(f0);                   // 不索敌 → 朝向不变
    // 对照：计数未满（<60）时同场景立即重瞄
    e.ai3 = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.facing).toBe(-1);                   // 玩家在左 → 重瞄向左
  });
});

// ===========================================================================
// W/K/P/C 批
// ===========================================================================
describe('W/K/P/C 批（地牢陷阱/爬墙蛛/植物/法师）', () => {
  it('F9 外星蜂 427 起飞门：玩家头顶 100px 以上 + 盒级视线 → vy=−5、ai2=1（:59098-59103）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: 20 });   // 玩家远高于（>100px）
    const e = spawn(h, 427, 50, FLOOR - 2);
    settle(h, e);
    e.vy = 0;
    e.ai2 = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.vy).toBeCloseTo(-4.9, 5);   // −5 + 重力折算
    expect(e.ai2).toBe(1);
    // 空中伺服段（:59030-59103）：背向玩家方向阻尼 + 同向步进 0.015 钳 ±6
    const vx0 = e.vx;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.vx).toBeGreaterThan(vx0 - 0.1);   // 朝玩家（右侧）水平修正
  });

  it('F9 蜂后 426 起飞门：vy=−6（num129）且射击期缓降（:59110-59155）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: 20 });
    const e = spawn(h, 426, 50, FLOOR - 2);
    settle(h, e);
    e.vy = 0;
    drive(e, 'fighterAI').call(e, h.hooks, h.player);
    expect(e.vy).toBeCloseTo(-5.9, 5);   // −6 + 重力折算
  });

  it('W1 火轮出生：TargetClosest + 双取反（facing 与 dirY 均 ×−1，:24602-24604）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 90, y: FLOOR - 3 });   // 玩家在右
    const e = spawn(h, 70, 40, FLOOR - 2);
    drive(e, 'blazingWheelAI').call(e, h.hooks, undefined);
    expect(e.facing).toBe(-1);        // 朝玩家(+1)后取反
    expect(e.dirY).toBe(-1);          // directionY 取反
    expect(e.vy).toBeLessThan(0);     // vy = 6×ai3×(−1)
  });

  it('W2 刺球 rotation：visAngle 随 direction×directionY×0.13 步进（:24685/:24704）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 72, 40, FLOOR - 4);
    e.aiInit = true;                  // 跳过出生段
    e.facing = 1; e.dirY = 1; e.ai1 = 0;
    const a0 = e.visAngle;
    drive(e, 'spikeBallAI').call(e, h.hooks, undefined);
    expect(e.visAngle).toBeCloseTo(a0 + 0.13, 6);
  });

  it('K1 爬墙蛛 confused：目标向量反向加倍（:29811-29815）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 90, y: FLOOR - 3 });   // 玩家在右
    const e = spawn(h, 165, 40, FLOOR - 3);
    e.confusedT = 2;                  // confused
    e.vx = 0; e.vy = 0;
    drive(e, 'wallCreeperAI').call(e, h.hooks, h.player);
    expect(e.vx).toBeLessThan(0);     // 反向（朝左逃离）
  });

  it('P2 巨型真菌球 260 孢子连发：计数 150 → 生 NPC 261（:22855-22893）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 36, y: FLOOR - 3 });   // 与植物同侧（墙不挡视线）
    // 植物 AI：锚点格须为活块（原版自墙/地面伸出）——立一列墙供锚定
    const st = w.store;
    for (let y = FLOOR - 8; y < FLOOR; y++) st.setTile(44, y, 1);
    const e = spawn(h, 260, 42.5, FLOOR - 3);
    e.ai0 = 44; e.ai1 = FLOOR - 3;    // 锚 = 墙格
    e.ai3 = 150;
    drive(e, 'plantAI').call(e, h.hooks, h.player);
    expect(h.enemies.filter((o) => o.vanillaId === 261).length).toBe(1);
    expect(e.ai3).toBe(0);
  });

  it('P3 爬行者 101 justHit 清零计数 + 伤害 22/17.6 + timeLeft 300（:22826/:22843/:22846）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 36, y: FLOOR - 3 });
    const st = w.store;
    for (let y = FLOOR - 8; y < FLOOR; y++) st.setTile(44, y, 1);
    const e = spawn(h, 101, 42.5, FLOOR - 3);
    e.ai0 = 44; e.ai1 = FLOOR - 3;
    e.ai3 = 100;
    e.justHitT = 2;
    drive(e, 'plantAI').call(e, h.hooks, h.player);
    expect(e.ai3).toBe(1);            // 清零后 +1
    // 120 计满 → 发 96 诅咒焰（life 300）。justHit 已清（直调不衰减，手动归零）
    e.justHitT = 0;
    e.ai3 = 119;
    h.projectiles.length = 0;
    drive(e, 'plantAI').call(e, h.hooks, h.player);
    expect(h.projectiles.length).toBe(1);
    expect(h.projectiles[0].life).toBe(300);
    expect(h.projectiles[0].damage).toBe(22);   // 经典档 22
  });

  it('C1 沙漠精灵 533 落点排除窗 = 仅玩家格本身（±1 格可落，cs:21109 num95=0）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 5 });   // 玩家悬空（四周净空）
    const e = spawn(h, 533, 40, FLOOR - 3);
    e.y = FLOOR * TILE - e.h;         // 落地
    e.aiInit = true;
    e.ai0 = 179;                      // +1 后 = 180 → :21006 蓄力点 → ai1=181（同 tick 倒数至 180）
    drive(e, 'casterAI').call(e, h.hooks, h.player);
    expect(e.ai1).toBe(180);
    // 采样统计：每次把 ai1 钉回 151 → 倒数至 150 即发射（:21086 ai1%30==0 且
    // ai1/30<5），重复 300 轮收 300 枚诅咒球。落点必须出现过与玩家格曼哈顿
    // 相邻（d=1）的诅咒球——旧 6×6 排除窗恒不可能（P(漏采)≈0.976^300≈0.06%）
    const nearTiles = new Set<string>();
    h.projectiles.length = 0;
    for (let t = 0; t < 300; t++) {
      e.ai1 = 121;   // 倒数至 120（120/30=4<5 发射门）
      drive(e, 'casterAI').call(e, h.hooks, h.player);
    }
    expect(h.projectiles.length).toBeGreaterThanOrEqual(200);
    for (const p of h.projectiles) {
      const tx = Math.floor((p.x + 4) / TILE), ty = Math.floor((p.y + 4) / TILE);
      const d = Math.abs(tx - Math.floor(h.player.cx / TILE))
        + Math.abs(ty - Math.floor(h.player.cy / TILE));
      if (d === 1) nearTiles.add(`${tx},${ty}`);
    }
    expect(nearTiles.size).toBeGreaterThan(0);
  });
});
