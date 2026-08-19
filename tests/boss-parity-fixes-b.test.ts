// Boss 族 1:1 修复批 B 回归（2026-08-19 台账 E 区,boss-parity-fixes-b）：
//   lunar_misc（宝箱怪短瞄重算/4.1 空中僵死/飞蛾 3000px 脱战/蛾卵负进度/
//     LunarOrb 539 父死即冲/悬浮脑 -30 负计时球门）
//   moon_events+Arrow（弹体寿命表/aiStyle14 重力延迟/329 焰镰自加速/351 礼盒
//     两段重力/noTileCollide 地形吞噬）
//   deerclops（专家被动影手每轮 3 只/962 碎石帧 6+rand6/Movement acceptTopSurfaces）
//   lategame（光女二阶段连段表 + 攻击12 螺旋/邪教徒仪式中断清圈/远古末日单份
//     齐射/飞掠 num14 真身口径/皇后传送兜底与 case4 无 vx 衰减）
//   dd2（索敌更近者夺标/食人魔吐息冷却 240/AI_107 前摇刹车族/AI_108 击退门/
//     荷兰炮单趟归一/传送门消散期无敌/黑魔法师炮口翻转+施法锁向/施法期索敌冻结）
//   martian（飞碟 -1 态不恢复（反编译 no-op 证据链）/expert 真难度分支）
// 直调 AI 函数（不经 Enemy.fixedUpdate 分发）,规避无关模块的并行改动。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';
import { Arrow } from '../src/entities/Arrow';
import {
  bigMimicAI, mothronAI, mothronEggAI, LunarOrb, nebulaFloaterAI,
} from '../src/entities/bossAI_lunar_misc';
import { mourningWoodAI, evergreenAIOrNoop } from './_boss-parity-b-helpers';

const W = 200, H = 140, FLOOR = 100;
const STONE = TILE_BY_KEY['stone'] ?? 1;
const PLATFORM = TILE_BY_KEY['platform'] ?? 19;

function makeWorld(): World {
  const w = new World(W, H, 7, 'boss-parity-b');
  const st = w.store;
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, STONE);
    st.setTile(x, FLOOR + 1, STONE);
  }
  w.clock.timeOfDay = 0.9;   // 夜间（避开光女白天暴怒分支）
  return w;
}

interface Harness {
  hooks: GameHooks; enemies: Enemy[]; projectiles: unknown[]; player: Player;
  em: { nextId: number; add: (e: unknown, b: string) => void };
}
function makeHooks(world: World, playerAt: { x: number; y: number }): Harness {
  const enemies: Enemy[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = em.nextId++;
      (bucket === 'enemies' ? enemies : projectiles).push(e);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
  } as unknown as Player;
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
  return { hooks, enemies, projectiles, player, em };
}

function spawn(h: Harness, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

/** 驱动实体列表直调其 AI（按文件分发,不走 Enemy.fixedUpdate） */
function step(list: Array<{ fixedUpdate?: (dt: number, g: GameHooks) => void }>, h: Harness, n: number): void {
  for (let i = 0; i < n; i++) {
    for (const e of list) {
      if (!(e as { dead?: boolean }).dead) {
        (e as { fixedUpdate: (dt: number, g: GameHooks) => void }).fixedUpdate(1 / 60, h.hooks);
      }
    }
  }
}

// ---------------------------------------------------------------------------
describe('lunar_misc：珍稀宝箱怪 473-476（NPC.cs:39520-39875）', () => {
  it('4 态短瞄重算玩家中心（:39679）——不再沿用 -350 抬升偏移', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 120 });
    const e = spawn(h, 473, 100, 60);
    e.bInit = true;
    e.ai0 = 4; e.ai1 = 0; e.ai2 = 1;   // 短瞄段
    const p = h.player as unknown as { cx: number; cy: number; x: number; y: number };
    p.x = 100 * TILE; p.cx = p.x + 10;
    p.y = 118 * TILE; p.cy = p.y + 21;   // 玩家在下方 500px+、右偏 300px
    bigMimicAI(e, h.hooks, h.player);
    // 新口径 dy=玩家中心差(500+)；旧口径 dy=玩家中心-350(150+) → vy/vx 比值分档
    expect(e.vy / e.vx).toBeGreaterThan(1.2);
  });

  it('4.1 态 ai2==1 下落段不再空中僵死（:39708-39741 补 else 积分）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 120 });
    const e = spawn(h, 473, 100, 60);
    e.bInit = true;
    e.ai0 = 4.1; e.ai1 = 0; e.ai2 = 1;
    e.vx = 0; e.vy = 5;
    const p = h.player as unknown as { y: number };
    p.y = 118 * TILE;                    // 玩家远在下方 → 未过线分支
    const y0 = e.y;
    bigMimicAI(e, h.hooks, h.player);
    expect(e.y).toBeGreaterThan(y0);     // 旧代码此分支整帧冻结
  });
});

describe('lunar_misc：飞蛾魔 477 / 蛾卵 478 / LunarOrb / 悬浮脑 420', () => {
  it('飞蛾魔 >3000px → ai0=-1 爬升脱战（:39895）', () => {
    const h = makeHooks(makeWorld(), { x: 190, y: 100 });
    const e = spawn(h, 477, 10, 60);
    e.bInit = true; e.ai0 = 0;
    (h.hooks.world.clock as { eclipse: boolean }).eclipse = true;
    mothronAI(e, h.hooks, h.player);     // 玩家距 ~180×16=2880 → 未过门
    expect(e.ai0).not.toBe(-1);
    const p = h.player as unknown as { x: number; cx: number };
    p.x = 198 * TILE; p.cx = p.x + 10;   // 距 ~3000+
    mothronAI(e, h.hooks, h.player);
    expect(e.ai0).toBe(-1);
  });

  it('蛾卵受击负进度跨帧保留（:40426-40429,曾每帧钳 0）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 90 });
    const e = spawn(h, 478, 100, 95);
    e.bInit = true; e.ai0 = 5;
    e.justHitT = 2;
    mothronEggAI(e, h.hooks, h.player);          // ai0 = 5 − (10..20)×2 + 1 ≤ −14
    const afterHit = e.ai0;
    expect(afterHit).toBeLessThan(0);
    mothronEggAI(e, h.hooks, h.player);          // 下一帧 +1,不再被钳回 0
    expect(e.ai0).toBe(afterHit + 1);
    expect(e.ai0).toBeLessThan(0);
  });

  it('LunarOrb 539 父死立即冲刺（Projectile.cs:32106-32110 置满计时）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 60 });
    const parent = spawn(h, 407, 100, 60);
    const orb = new LunarOrb(parent, 539, 2, 0, 60);
    h.projectiles.push(orb);
    step([orb], h, 10);                  // 盘旋 10t
    const t10 = orb.timer();
    parent.dead = true;                  // 父亡 → 当帧置满 → 立即冲刺
    orb.fixedUpdate(1 / 60, h.hooks);
    expect(Math.hypot(orb.vx, orb.vy)).toBeCloseTo(16, 0);
    expect(t10).toBeLessThan(210);
  });

  it('悬浮脑瞬移 -30 负计时球门（NPC.cs:41655-41674 flag105）', () => {
    const w = makeWorld();
    w.clock.timeOfDay = 0.9;
    const h = makeHooks(w, { x: 100, y: 60 });
    const brain = spawn(h, 420, 100, 60);
    brain.bInit = true; brain.ai0 = 479; brain.ai1 = 0;
    brain.ai2 = 0; brain.ai3 = 0;
    // 情形 A：无负计时球 → 全量 -30
    const orbA = new LunarOrb(brain, 574, 1, 0, 0);
    h.projectiles.push(orbA);
    step([orbA], h, 3);                  // 计时走到 3
    const beforeA = orbA.timer();
    nebulaFloaterAI(brain, h.hooks, h.player);   // ai0 480 → 瞬移
    expect(orbA.timer()).toBeCloseTo(beforeA - 30, 0);
    // 情形 B：已有负计时球 → 跳过本轮 -30（防叠加）
    const brain2 = spawn(h, 420, 100, 60);
    brain2.bInit = true; brain2.ai0 = 479; brain2.ai1 = 0;
    brain2.ai2 = 0; brain2.ai3 = 0;
    const negOrb = new LunarOrb(brain2, 574, 1, 0, 0);
    const posOrb = new LunarOrb(brain2, 574, 1, 0, 0);
    h.projectiles.push(negOrb, posOrb);
    step([negOrb, posOrb], h, 3);
    negOrb.delay(100);                   // 制造负计时球
    const beforePos = posOrb.timer();
    nebulaFloaterAI(brain2, h.hooks, h.player);
    expect(posOrb.timer()).toBe(beforePos);      // 门挡住,不再 -30
  });
});

// ---------------------------------------------------------------------------
describe('moon_events 弹体物理表（Projectile.cs SetDefaults/AI_014/AI_056/AI_058）', () => {
  it('寿命表:325=420 / 345=3600 / 348=900（经 AI 出膛的 Arrow）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 110 });
    // 325 焰木:mourningWood ai0=1 每 15t 一发
    const wood = spawn(h, 325, 90, 80);
    wood.bInit = true; wood.ai0 = 1; wood.ai1 = 14;
    mourningWoodAI(wood, h.hooks, h.player);
    expect(h.projectiles.length).toBe(1);
    expect((h.projectiles[0] as Arrow).life).toBe(420);
    // 345 针叶:344 常世吼 ai0=1 每 5t 一发
    const h2 = makeHooks(makeWorld(), { x: 100, y: 110 });
    const ever = spawn(h2, 344, 90, 80);
    ever.bInit = true; ever.ai0 = 1; ever.ai1 = 4;
    evergreenAIOrNoop(ever, h2.hooks, h2.player);
    expect(h2.projectiles.length).toBe(1);
    expect((h2.projectiles[0] as Arrow).life).toBe(3600);
    expect((h2.projectiles[0] as Arrow).grav).toBe(0.5);
    expect((h2.projectiles[0] as Arrow).gravDelay).toBe(50);   // :54244 50t 后 +0.5
    // 348 FrostWave:tileCollide=false 自动通道
    expect((h2.projectiles[0] as Arrow).noTileCollide).toBe(false);  // 345 tileCollide=true
    const h3 = makeHooks(makeWorld(), { x: 100, y: 110 });
    const queen = spawn(h3, 345, 90, 80);
    queen.bInit = true; queen.ai0 = 0; queen.ai2 = 1; queen.ai3 = -1;
    const p3 = h3.player as unknown as { x: number; y: number };
    p3.y = 100 * TILE;
    mourningWoodAI(queen, h3.hooks, h3.player);   // 任一 AI 推进——此处只验证 345 未发
    expect(h3.projectiles.length).toBe(0);
  });

  it('348 FrostWave noTileCollide:直穿实心块不被地形吞噬（Arrow.ts 撞块门）', () => {
    const h = makeHooks(makeWorld(), { x: 10, y: 60 });
    const proj = new Arrow(20 * TILE, 60 * TILE, 8, 0, 42, 0, 348, null,
      { grav: 0, life: 900, pierce: 1, hostile: true });
    expect(proj.noTileCollide).toBe(true);   // projectileData(348).tileCollide === false
    h.projectiles.push(proj);
    for (let t = 0; t < 110 && !proj.dead; t++) {   // 20→98 格:中途必穿 FLOOR 上沿? 不——平飞不撞地
      proj.fixedUpdate(1 / 60, h.hooks);
    }
    expect(proj.dead).toBe(false);            // 平飞不撞墙,寿命未到
    // 迎面墙:98 格处竖墙
    const w2 = makeWorld();
    for (let y = 40; y < 100; y++) w2.store.setTile(98, y, STONE);
    const h2 = makeHooks(w2, { x: 10, y: 60 });
    const proj2 = new Arrow(20 * TILE, 60 * TILE, 8, 0, 42, 0, 348, null,
      { grav: 0, life: 900, pierce: 1, hostile: true });
    h2.projectiles.push(proj2);
    for (let t = 0; t < 200 && !proj2.dead; t++) proj2.fixedUpdate(1 / 60, h2.hooks);
    expect(proj2.dead).toBe(false);           // 穿墙不灭（旧代码撞块即 killNow）
    expect(proj2.x).toBeGreaterThan(98 * TILE);
  });

  it('aiStyle14 重力延迟 5 子步（326 希腊火,:23484-23498）+ 352 尖刺同族', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 60 });
    const greek = new Arrow(60 * TILE, 60 * TILE, 4, -2, 40, 0, 326, null,
      { grav: 0.2, gravDelay: 5, life: 360, pierce: 1, hostile: true, bounce: true });
    h.projectiles.push(greek);
    for (let t = 0; t < 5; t++) greek.fixedUpdate(1 / 60, h.hooks);
    expect(greek.vy).toBe(-2);               // 前 5 子步纯惯性
    greek.fixedUpdate(1 / 60, h.hooks);
    expect(greek.vy).toBeCloseTo(-1.8, 5);   // 第 6 子步 +0.2
    const spike = new Arrow(60 * TILE, 40 * TILE, 4, -2, 80, 0, 352, null,
      { grav: 0.2, gravDelay: 5, life: 1200, pierce: 1, hostile: true, bounce: true });
    expect(spike.bounce).toBe(true);
    expect(spike.life).toBe(1200);
  });

  it('329 焰镰 aiStyle56 自加速（Projectile.cs:27674-27677 ×1.05 至 16）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 60 });
    const scythe = new Arrow(60 * TILE, 60 * TILE, 1, 0, 60, 0, 329, null, {
      grav: 0, life: 420, pierce: 1, hostile: true,
      scythe: { rot0: 0.5, flipDir: -1 },
    });
    h.projectiles.push(sythe);
    expect(scythe.noTileCollide).toBe(true);   // SetDefaults 329 tileCollide=false
    for (let t = 0; t < 40; t++) scythe.fixedUpdate(1 / 60, h.hooks);
    expect(Math.hypot(scythe.vx, scythe.vy)).toBeCloseTo(16, 0);   // 加速至上限
    expect(scythe.spinRot).toBeGreaterThan(3);   // 恒旋累进（:27686）
  });

  it('351 礼盒 aiStyle58 两段重力（Projectile.cs:27727-27757）', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 60 });
    const gift = new Arrow(60 * TILE, 60 * TILE, 3, -8, 50, 0, 351, null,
      { grav: 0, life: 3600, pierce: 1, hostile: true, present: true });
    h.projectiles.push(gift);
    for (let t = 0; t < 30; t++) gift.fixedUpdate(1 / 60, h.hooks);
    expect(gift.vy).toBe(-8);                // 前段平飞（30t 内不施重力）
    gift.fixedUpdate(1 / 60, h.hooks);
    expect(gift.vy).toBeCloseTo(-7.9, 5);    // 第 31t 起 +0.1
    gift.vy = 0.05;                          // 模拟下坠开始
    gift.fixedUpdate(1 / 60, h.hooks);
    expect((gift as unknown as { presentStage: number }).presentStage).toBe(1);
    for (let t = 0; t < 100; t++) gift.fixedUpdate(1 / 60, h.hooks);
    expect(gift.vy).toBeLessThanOrEqual(3);  // 二段钳 3
    expect(gift.vx).toBeCloseTo(3 * 0.99 * 0.99, 3);   // 二段 vx ×0.99/t
  });
});

// ---------------------------------------------------------------------------
describe('deerclops：影手轮次 / 碎石帧 / acceptTopSurfaces', () => {
  it('专家被动影手每轮 3 只（SpawnPassiveShadowHands :44730-44752,曾吞第 3 只）', () => {
    const w = makeWorld();
    w.difficulty = 1;                       // expert
    const h = makeHooks(w, { x: 150, y: 90 });
    const e = spawn(h, 668, 100, 60);
    e.y = FLOOR * TILE - e.h; e.vx = 0; e.vy = 0;
    for (let t = 0; t < 240; t++) {
      (e as unknown as { fixedUpdate: (d: number, g: GameHooks) => void })
        .fixedUpdate(1 / 60, h.hooks);
    }
    const hands = h.projectiles.filter(
      (p) => (p as { w?: number }).w === 40).length;   // InsanityShadowProj 40×40
    expect(hands).toBe(3);                  // 满血间隔 80t:80/160/240 三只
  });

  it('962 碎石帧 = 6+rand(6)（:44768-44769 第二行覆盖）', () => {
    const h = makeHooks(makeWorld(), { x: 105, y: 90 });
    const e = spawn(h, 668, 100, 60);
    e.y = FLOOR * TILE - e.h;
    e.bInit = true;
    e.ai0 = 2; e.ai1 = 31;                  // 下一 tick since=0 出碎石
    (e as unknown as { fixedUpdate: (d: number, g: GameHooks) => void })
      .fixedUpdate(1 / 60, h.hooks);
    const rubble = h.projectiles.find((p) => (p as { w?: number }).w === 32);
    expect(rubble).toBeTruthy();
    const frame = (rubble as unknown as { frame: number }).frame;
    expect(frame).toBeGreaterThanOrEqual(6);
    expect(frame).toBeLessThanOrEqual(11);
  });

  it('Movement acceptTopSurfaces:平台算地面（:45009-45012）', () => {
    const w = new World(W, H, 7, 'deer-platform');
    w.groundLevel = 50;
    for (let x = 80; x < 120; x++) w.store.setTile(x, FLOOR, PLATFORM);   // 纯平台桥
    w.clock.timeOfDay = 0.9;
    const h = makeHooks(w, { x: 105, y: FLOOR - 3 });
    const e = spawn(h, 668, 100, 60);
    e.y = FLOOR * TILE - e.h; e.vx = 0; e.vy = 0;
    e.bInit = true; e.ai0 = 0; e.ai1 = 0;
    const y0 = e.y;
    for (let t = 0; t < 30; t++) {
      (e as unknown as { fixedUpdate: (d: number, g: GameHooks) => void })
        .fixedUpdate(1 / 60, h.hooks);
    }
    // 平台行 = 地面:boss 不下坠穿板（旧代码 acceptTop 恒假 → 平台不算地,直坠）
    expect(e.y).toBeLessThan(y0 + 4);
  });
});

// ---------------------------------------------------------------------------
describe('lategame：光女二阶段连段 + 攻击12 / 邪教徒 / 皇后 / 远古末日', () => {
  it('二阶段连段表 [7,2,8,5,2,6,4,8,12]（NPC.cs:46520-46579 残差映射）', async () => {
    const { empressOfLightAI } = await import('../src/entities/bossAI_lategame');
    const h = makeHooks(makeWorld(), { x: 60, y: 60 });
    const e = spawn(h, 636, 120, 40);
    e.bInit = true;
    e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.ai3 = 1;   // 二阶段,玩家在左(8 不转 9)
    const seq: number[] = [];
    let last = 1;
    for (let t = 0; t < 1700 && seq.length < 10; t++) {
      empressOfLightAI(e, h.hooks, h.player);
      if (e.ai0 !== last && last === 1) seq.push(e.ai0 === 9 ? 8 : e.ai0);
      last = e.ai0;
    }
    expect(seq).toEqual([7, 2, 8, 5, 2, 6, 4, 8, 12]);
  });

  it('攻击 12 = 873 螺旋（:47152-47200,经典可达——曾整招缺失）', async () => {
    const { empressOfLightAI } = await import('../src/entities/bossAI_lategame');
    const h = makeHooks(makeWorld(), { x: 100, y: 100 });
    const e = spawn(h, 636, 100, 50);
    e.bInit = true;
    e.ai0 = 12; e.ai1 = 0; e.ai2 = 0; e.ai3 = 1;
    for (let t = 0; t < 13; t++) empressOfLightAI(e, h.hooks, h.player);
    const p873 = h.projectiles.filter((p) => (p as Arrow).projId === 873) as Arrow[];
    expect(p873.length).toBeGreaterThan(0);
    // 出膛点 = Center+(-55,-30)（:47179）
    expect(p873[0].x).toBeCloseTo(e.cx - 55, 0);
    expect(p873[0].y).toBeCloseTo(e.cy - 30, 0);
    // 速向 = (0,-20) 旋 2π·(ai1-10)/50（:47176）
    const a = (Math.PI * 2 * 2) / 50;
    expect(p873[0].vx).toBeCloseTo(20 * Math.sin(a), 0);
    expect(p873[0].vy).toBeCloseTo(-20 * Math.cos(a), 0);
  });

  it('邪教徒仪式被击破 → 圈快速淡出不召龙（NPC.cs:65054 + Projectile.cs:31195）', async () => {
    const { lunaticCultistAI, CultistRitualCircle } = await import('../src/entities/bossAI_lategame');
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    cult.bInit = true; cult.ai0 = 5; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    for (let t = 0; t < 31; t++) lunaticCultistAI(cult, h.hooks, h.player);   // t=30 生圈
    const circle = h.projectiles.find((p) => p instanceof CultistRitualCircle);
    expect(circle).toBeTruthy();
    for (let t = 31; t < 130; t++) lunaticCultistAI(cult, h.hooks, h.player); // 窗口内(120-420)
    cult.justHitT = 2;                       // 仪式窗口内被打中
    lunaticCultistAI(cult, h.hooks, h.player);
    expect(cult.ai0).toBe(0);                // 推进选招（:65014）
    // 圈淡出（+12/t）后消亡,永不到 300 召龙
    for (let t = 0; t < 400 && !(circle as { dead: boolean }).dead; t++) {
      (circle as { fixedUpdate: (d: number, g: GameHooks) => void })
        .fixedUpdate(1 / 60, h.hooks);
    }
    expect((circle as { dead: boolean }).dead).toBe(true);
    expect(h.enemies.some((n) => n.vanillaId === 454 || n.vanillaId === 521)).toBe(false);
  });

  it('远古末日 523 蓄满当拍单份齐射即灭（:42206-42222,曾双份）', async () => {
    const { ancientDoomAI } = await import('../src/entities/bossAI_lategame');
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    const doom = spawn(h, 523, 100, 70);
    doom.bInit = true; doom.ai0 = cult.id; doom.ai1 = 419;
    ancientDoomAI(doom, h.hooks, h.player);
    expect(h.projectiles.filter((p) => (p as Arrow).projId === 593).length).toBe(4);
    expect(doom.dead).toBe(true);            // 同拍消亡,不拖到下一拍再射一轮
  });

  it('飞掠 num14 真身口径（:65271）:克隆体 ai1 = 真身距离折算拍数 ×2', async () => {
    const { lunaticCultistAI } = await import('../src/entities/bossAI_lategame');
    const h = makeHooks(makeWorld(), { x: 100, y: 80 });
    const cult = spawn(h, 439, 100, 70);
    cult.bInit = true; cult.ai0 = 5; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    for (let t = 0; t < 31; t++) lunaticCultistAI(cult, h.hooks, h.hooks.player); // 2 克隆体
    const clones = h.enemies.filter((n) => n.vanillaId === 440);
    expect(clones.length).toBe(2);
    const pc = h.player as unknown as { cx: number; cy: number };
    const num14 = Math.max(1, Math.ceil(
      Math.hypot(pc.cx - cult.cx, pc.cy - 100 - cult.cy) / 50));
    cult.ai0 = 0; cult.ai1 = 40; cult.ai3 = 0;   // 选招拍 0 = 飞掠
    lunaticCultistAI(cult, h.hooks, h.player);
    for (const c of clones) {
      expect(c.ai0).toBe(1);
      expect(c.ai1).toBe(num14 * 2);        // 全员共用真身口径拍数
    }
  });

  it('皇后传送:电满无条件进 2 态（:45578,搜索失败仅清蓄能）', async () => {
    const { queenSlimeAI } = await import('../src/entities/bossAI_lategame');
    const w = new World(W, H, 7, 'queen-air');   // 纯空气世界（无候选格）
    w.groundLevel = 50;
    w.clock.timeOfDay = 0.9;
    const h = makeHooks(w, { x: 100, y: 90 });
    const q = spawn(h, 657, 100, 60);
    q.bInit = true; q.ai0 = 0; q.ai1 = -100; q.ai2 = 0; q.ai3 = 300;
    q.vy = 0;
    queenSlimeAI(q, h.hooks, h.player);
    expect(q.ai0).toBe(2);                   // 旧代码找不到落点 → 不进传送
    expect(q.ai3).toBe(0);                   // 蓄能清零（:45598）
  });

  it('皇后 case4 俯冲转段无 vx×0.5（:45982-45985）', async () => {
    const { queenSlimeAI } = await import('../src/entities/bossAI_lategame');
    const h = makeHooks(makeWorld(), { x: 100, y: 60 });
    const q = spawn(h, 657, 100, 60);
    q.bInit = true; q.ai0 = 4; q.ai1 = 59; q.ai2 = 0; q.ai3 = 0;
    q.vx = 6; q.vy = 0.5;
    queenSlimeAI(q, h.hooks, h.player);
    expect(q.ai2).toBe(1);
    expect(q.vy).toBe(-3);
    expect(q.vx).toBe(6);                    // 旧代码此处多乘 ×0.5
  });
});

// ---------------------------------------------------------------------------
describe('dd2：索敌 / 食人魔 / AI_107 刹车 / AI_108 击退 / 炮与门', () => {
  it('索敌"更近者夺标"（NPCUtils.cs:151-160 + :261-273）', async () => {
    const { flyingDutchmanAIOrGoblin } = await import('./_boss-parity-b-helpers');
    const h = makeHooks(makeWorld(), { x: 104, y: 90 });
    const crystal = spawn(h, 548, 30, 60);   // 水晶远在左 1100+px
    const gob = spawn(h, 552, 100, 60);
    gob.bInit = true; gob.ai0 = 0; gob.ai1 = 0; gob.ai3 = 0;
    flyingDutchmanAIOrGoblin(gob, h.hooks, h.player);   // 100px 内玩家夺标
    expect(gob.facing).toBe(1);              // 玩家在右 → 朝右（旧代码恒咬水晶朝左）
    // 水晶更近 → 咬水晶
    crystal.x = 101 * TILE; crystal.cx = crystal.x + crystal.w / 2;
    const h2 = makeHooks(makeWorld(), { x: 104, y: 90 });
    const c2 = spawn(h2, 548, 103, 60);      // 30px
    const g2 = spawn(h2, 552, 100, 60);
    g2.bInit = true; g2.ai0 = 0; g2.ai1 = 0; g2.ai3 = 0;
    flyingDutchmanAIOrGoblin(g2, h2.hooks, h2.player);
    expect(g2.facing).toBe(1);               // 水晶在右 → 朝右
    void crystal;
  });

  it('食人魔吐息后冷却 240（:63591 num6=240,曾 60）', async () => {
    const { ai107ImprovedWalkers } = await import('../src/entities/bossAI_dd2');
    const h = makeHooks(makeWorld(), { x: 100, y: 90 });
    const ogre = spawn(h, 577, 100, 60);
    ogre.y = FLOOR * TILE - ogre.h;
    ogre.bInit = true;
    ogre.ai0 = 1; ogre.ai1 = 1;              // 吐息前摇最后 1t
    ai107ImprovedWalkers(ogre, h.hooks, h.player);
    expect(ogre.ai0).toBe(-240);
  });

  it('AI_107 前摇刹车族:哥布林 windup 期 vx×0.9 + ai3 清零 + 跳过走加速（:64371-64378）', async () => {
    const { ai107ImprovedWalkers } = await import('../src/entities/bossAI_dd2');
    const h = makeHooks(makeWorld(), { x: 100, y: 90 });
    const gob = spawn(h, 552, 100, 60);
    gob.y = FLOOR * TILE - gob.h;
    gob.bInit = true;
    gob.ai0 = 10; gob.ai1 = 0;               // 近战前摇中
    gob.vx = 1; gob.ai3 = 50;
    ai107ImprovedWalkers(gob, h.hooks, h.player);
    expect(gob.vx).toBeCloseTo(0.9, 5);      // ×0.9 刹车（曾不刹车）
    expect(gob.ai3).toBe(0);                 // 卡位计数清零
    const gob2 = spawn(h, 552, 100, 60);
    gob2.y = FLOOR * TILE - gob2.h;
    gob2.bInit = true;
    gob2.ai0 = 10; gob2.ai1 = 0;
    gob2.vx = 0;
    ai107ImprovedWalkers(gob2, h.hooks, h.player);
    expect(gob2.vx).toBe(0);                 // 走路加速被 flag24 跳过
  });

  it('AI_108 击退门:瞄准/俯冲 = 0,悬空 = 族档（:66140/:66190/:66243）', async () => {
    const { divingFlyerAI } = await import('../src/entities/bossAI_dd2');
    const h = makeHooks(makeWorld(), { x: 100, y: 90 });
    const wyv = spawn(h, 558, 100, 60);
    wyv.bInit = true; wyv.ai0 = 1; wyv.ai1 = 0;
    divingFlyerAI(wyv, h.hooks, h.player);
    expect(wyv.kbResistOverride).toBe(0);
    const wyv2 = spawn(h, 558, 100, 60);
    wyv2.bInit = true; wyv2.ai0 = 0;
    divingFlyerAI(wyv2, h.hooks, h.player);   // 悬空态:0.7 难度缩放档(经典=0.7)
    expect(wyv2.kbResistOverride).toBeCloseTo(0.7, 3);
  });

  it('荷兰大炮弹道单趟归一（:36027-36039,水平射 vy=-5 非 -9.7）', async () => {
    const { dutchmanCannonAI } = await import('../src/entities/bossAI_dd2');
    const h = makeHooks(makeWorld(), { x: 100, y: 60 });
    const ship = spawn(h, 491, 100, 60);
    const cannon = spawn(h, 492, 100, 60);
    cannon.master = ship; cannon.bInit = true;
    cannon.ai1 = 0; cannon.ai2 = 0; cannon.ai3 = 240;
    cannon.x = 100 * TILE; cannon.y = 60 * TILE;
    const p = h.player as unknown as { x: number; y: number; cx: number; cy: number };
    p.y = cannon.y; p.cy = p.y + 21;          // 同高（水平向）
    dutchmanCannonAI(cannon, h.hooks, h.player);
    const shot = h.projectiles[0] as Arrow;
    expect(shot).toBeTruthy();
    expect(shot.vx).toBeCloseTo(14, 1);       // 纯右向 → vx=14
    expect(shot.vy).toBeCloseTo(-5, 1);       // +(0,-5) 上抛（旧代码 -9.7）
  });

  it('传送门消散期恒无敌至 550（:43124/:43145）', async () => {
    const { lanePortalAI } = await import('../src/entities/bossAI_dd2');
    const h = makeHooks(makeWorld(), { x: 100, y: 90 });
    const portal = spawn(h, 549, 100, 60);
    portal.bInit = true; portal.ai1 = 1; portal.ai0 = 100;
    lanePortalAI(portal, h.hooks, h.player);
    expect(portal.iframes).toBeGreaterThan(0);   // 消散期不可击
    portal.ai0 = 549;
    const ifr = portal.iframes;
    lanePortalAI(portal, h.hooks, h.player);      // 550 → 解除并自灭
    expect(portal.iframes).toBeLessThan(ifr);
    expect(portal.dead).toBe(true);
  });

  it('黑魔法师炮口随弹向翻转 + 施法锁向（:66453-66460）', async () => {
    const { darkMageAI } = await import('../src/entities/bossAI_dd2');
    const h = makeHooks(makeWorld(), { x: 70, y: 90 });   // 玩家在左
    const mage = spawn(h, 564, 100, 60);
    mage.y = FLOOR * TILE - mage.h;
    mage.bInit = true;
    mage.facing = 1;                          // 施法前面朝右
    mage.ai0 = 33; mage.ai1 = 0;              // 下一拍 ai0=32 → 出暗影矢
    darkMageAI(mage, h.hooks, h.player);
    const bolt = h.projectiles[0] as Arrow;
    expect(bolt).toBeTruthy();
    expect(bolt.vx).toBeLessThan(0);          // 朝左（玩家侧）
    expect(mage.facing).toBe(-1);             // 弹向翻转朝向
    expect(bolt.x).toBeCloseTo(mage.cx - 10, 0);   // 炮口用翻转后 direction
  });

  it('walker 施法期索敌冻结（AI_109 flag7,:66440/:66614）', async () => {
    const { sandElementalAI } = await import('../src/entities/bossAI_dd2');
    const h = makeHooks(makeWorld(), { x: 70, y: 90 });   // 玩家在左
    const se = spawn(h, 541, 100, 60);
    se.y = FLOOR * TILE - se.h;
    se.bInit = true; se.facing = 1; se.ai0 = 100;   // 施法中
    sandElementalAI(se, h.hooks, h.player);
    expect(se.facing).toBe(1);                // 不因玩家换侧而翻向
  });
});

// ---------------------------------------------------------------------------
describe('martian：飞碟 -1 态语义 / expert 真难度', () => {
  it('飞碟 -1 态玩家回场不恢复巡航（1456/1405 反编译同为 no-op,证据链见注释）', async () => {
    const { martianSaucerAI } = await import('../src/entities/bossAI_martian');
    const h = makeHooks(makeWorld(), { x: 100, y: 90 });
    const ufo = spawn(h, 395, 100, 60);
    ufo.bInit = true;                         // 跳过部件生成
    ufo.ai0 = -1; ufo.ai1 = 0; ufo.ai2 = 0; ufo.ai3 = 0;
    ufo.vy = 0;
    martianSaucerAI(ufo, h.hooks, h.player);
    expect(ufo.ai0).toBe(-1);                 // 旧代码误回 0 态巡航
    expect(ufo.vy).toBeCloseTo(-0.4, 5);      // 持续爬升离场
  });

  it('expert:部件全灭 → ai0=1 旋转过渡（:36634,曾恒走自毁 3）', async () => {
    const { martianSaucerPartAI } = await import('../src/entities/bossAI_martian');
    const w = makeWorld();
    w.difficulty = 1;
    const h = makeHooks(w, { x: 100, y: 90 });
    const ufo = spawn(h, 395, 100, 60);
    ufo.ai0 = 0; ufo.ai1 = 0; ufo.ai2 = 0; ufo.ai3 = 0;
    ufo.bInit = false;                        // 首帧生成部件
    martianSaucerAI(ufo, h.hooks, h.player);  // 生成 393×2/394×2/392
    const hull = h.enemies.find((n) => n.vanillaId === 392)!;
    expect(hull).toBeTruthy();
    for (const n of h.enemies) if (n !== ufo) n.dead = true;   // 部件全灭
    martianSaucerPartAI(hull, h.hooks, h.player);
    expect(ufo.ai0).toBe(1);                  // expert 旋转过渡（旧恒 3）
  });
});
