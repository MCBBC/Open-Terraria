// 彩虹枪（1260 → 弹 250/251，aiStyle 46）1:1 回归：
//   · 250 隐形头：每 2t 铺一片 251（localAI[0]>4→3）；ai[0]>30 后 vy+=0.5 拱弧；
//     速度恒归一 15.95；撞块即亡；timeLeft 钳 2400
//   · 251 段：首帧锁方向；alpha 淡入 10t→0（全显）→末 10t 淡出；life 2400（≈40s）；
//     命中 = 穿透 -1 + 【全段共享】静态 10t 冷却（usesIDStaticNPCImmunity）
import { describe, it, expect } from 'vitest';
import { RainbowBolt, RainbowSegment, _setRainbowClock } from '../src/entities/RainbowProj';
import { PrismProj, PrismProng } from '../src/entities/PrismProj';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const TICK_MS = 1000 / 60;
/** 假钟：仅显式 tick() 推进（每 fixedUpdate 一拍） */
function fakeClock() {
  let t = 0;
  _setRainbowClock(() => t);
  return { tick: (n = 1) => { t += n * TICK_MS; }, reset: () => { t = 0; } };
}

function makeGame(w: World, list: unknown[] = [], projectiles: unknown[] = []) {
  return {
    world: w,
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: (e: unknown, b: string) => { (b === 'projectiles' ? projectiles : list).push(e); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(200, 200, 30, 'open');
  for (let x = 0; x < 200; x++) w.store.setTileSilent(x, 100, 1, 0, 0);
  return w;
}

describe('彩虹枪弹链 250/251', () => {
  it('隐形头每 2t 铺段，恒速 15.95，30t 后拱弧下坠，撞块即亡', () => {
    const w = emptyWorld();
    const projectiles: unknown[] = [];
    const game = makeGame(w, [], projectiles);
    const bolt = new RainbowBolt(50 * TILE, 80 * TILE, 16, 0, 45, 2.5);
    projectiles.push(bolt);
    for (let t = 0; t < 4; t++) bolt.fixedUpdate(1, game);
    expect(projectiles.filter((p) => p instanceof RainbowSegment).length).toBe(0);
    bolt.fixedUpdate(1, game);
    expect(projectiles.filter((p) => p instanceof RainbowSegment).length).toBe(1); // 第 5 tick 首片（localAI[0]>4）
    const sp = Math.hypot(bolt.vx, bolt.vy);
    expect(sp).toBeCloseTo(15.95, 2);                  // 速度恒归一
    for (let t = 0; t < 30 && !bolt.dead; t++) bolt.fixedUpdate(1, game);
    expect(bolt.vy).toBeGreaterThan(0);                // ai0>30 → vy+=0.5 拱弧
    // 一路铺段
    const segs = projectiles.filter((p) => p instanceof RainbowSegment).length;
    expect(segs).toBeGreaterThanOrEqual(15);
    // 撞块即亡（bolt 最终撞 y=100 地面）
    for (let t = 0; t < 600 && !bolt.dead; t++) bolt.fixedUpdate(1, game);
    expect(bolt.dead).toBe(true);
  });

  it('段淡入 10t→全显，2400t 寿命；静态免疫：同敌 10t 内只吃一段', () => {
    const ck = fakeClock();
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    let hits = 0;
    list.push({ id: 1, x: 50 * TILE, y: 80 * TILE, w: 24, h: 18, dead: false,
      hurt: () => { hits++; return true; }, def: { hitSound: ['NPC_Hit_1'] } });
    const seg = new RainbowSegment(50 * TILE, 80 * TILE, 1, 0, 45, 2.5);
    seg.fixedUpdate(1, game);
    ck.tick();
    expect(seg.alpha).toBe(230);                       // 淡入第 2t：255−25
    expect(hits).toBe(1);                              // 首帧即伤害（穿透 -1 无门）
    // 两段同 tick 同敌 → 静态免疫只结算一次（共享钟不被双段重复衰减）
    const seg2 = new RainbowSegment(50 * TILE, 80 * TILE, 1, 0, 45, 2.5);
    seg2.fixedUpdate(1, game);
    expect(hits).toBe(1);
    // 5t 内仍免疫
    for (let t = 0; t < 5; t++) { seg.fixedUpdate(1, game); seg2.fixedUpdate(1, game); ck.tick(); }
    expect(hits).toBe(1);
    // 满 10t 后可再命中
    for (let t = 0; t < 6; t++) { seg.fixedUpdate(1, game); ck.tick(); }
    expect(hits).toBe(2);
    // 淡入完成 → 全显
    for (let t = 0; t < 8; t++) { seg.fixedUpdate(1, game); ck.tick(); }
    expect(seg.alpha).toBe(0);
    expect(seg.dead).toBe(false);
    _setRainbowClock(null);
  });
});

describe('泰拉刃光束 985（aiStyle 191，terra 模式）', () => {
  it('减速 ×0.94(>8)、25t 消亡、绿光', () => {
    const w = new World(200, 200, 30, 'open');   // 全空世界（无地面干扰）
    const projectiles: unknown[] = [];
    const game = makeGame(w, [], projectiles);
    const beam = new Arrow(50 * TILE, 80 * TILE, 12, 0, 85, 6.5, 985, null,
      { grav: 0, life: 90, pierce: 3, terra: { ai0: 1, ai1: 18, ai2: 1 } });
    const sp0 = Math.hypot(beam.vx, beam.vy);
    beam.fixedUpdate(1, game);
    const sp1 = Math.hypot(beam.vx, beam.vy);
    expect(sp1).toBeLessThan(sp0);                       // >8 → ×0.94（本用例高速构造；正牌出生速×5 不触发）
    expect(beam.lightRGB).toEqual([0.25, 0.86, 0.38]);   // Color(64,220,96)
    for (let t = 0; t < 41 && !beam.dead; t++) beam.fixedUpdate(1, game);
    expect(beam.dead).toBe(false);
    beam.fixedUpdate(1, game);
    expect(beam.dead).toBe(true);                        // 第 43t 消亡（ai1+25，非 timeLeft 90）
    expect(beam.terraT).toBe(43);
  });

  it('近墙扇形探测失败 → 双阻尼额外减速', () => {
    const w = new World(200, 200, 30, 'open');
    for (let y = 0; y < 200; y++) w.store.setTileSilent(57, y, 1, 0, 0);   // 正前方墙列（x=57=912px）
    const game = makeGame(w, [], []);
    const beam = new Arrow(50 * TILE, 74 * TILE, 12, 0, 85, 6.5, 985, null,
      { grav: 0, life: 90, pierce: 3, terra: { ai0: 1, ai1: 18, ai2: 1 } });
    // 探测窗 110px 沿速度方向（水平）：cx 804+110=914 → 越过 912px 墙列
    for (let t = 0; t < 3 && !beam.terraWall; t++) beam.fixedUpdate(1, game);
    expect(beam.terraWall).toBe(true);                   // 视线探测命中墙 → localAI[1]=1
    const open = new Arrow(50 * TILE, 74 * TILE, 12, 0, 85, 6.5, 985, null,
      { grav: 0, life: 90, pierce: 3, terra: { ai0: 1, ai1: 18, ai2: 1 } });
    const game2 = makeGame(new World(200, 200, 30, 'open'), [], []);
    for (let t = 0; t < 4; t++) open.fixedUpdate(1, game2);
    expect(open.terraWall).toBe(false);                  // 空世界无墙
    expect(Math.hypot(beam.vx, beam.vy)).toBeLessThan(Math.hypot(open.vx, open.vy)); // 双阻尼
  });
});

describe('星怒 3065 → 弹 503（Arrow star 模式）', () => {
  it('线上方穿墙、越线后撞块、alpha 渐显钳位', () => {
    const w = new World(200, 200, 30, 'open');
    for (let x = 0; x < 200; x++) w.store.setTileSilent(x, 80, 1, 0, 0);  // y=80 墙
    const projectiles: unknown[] = [];
    const game = makeGame(w, [], projectiles);
    // 目标线 y=120*16=1920（墙在 1280——属线上方穿墙区）
    const sword = new Arrow(50 * TILE, 60 * TILE, 4, 8, 170, 6.5, 503, null,
      { grav: 0, life: 900, pierce: 2, star: { targetY: 120 * TILE } });
    sword.fixedUpdate(1, game);
    expect(sword.starAlpha).toBe(240);                    // 255−15 渐显
    for (let t = 0; t < 40 && !sword.dead; t++) sword.fixedUpdate(1, game);
    // 剑 y 从 960 向下 8/t × 40t → 已穿 80 行墙（1280px）
    expect(sword.y).toBeGreaterThan(80 * TILE);
    expect(sword.dead).toBe(false);                       // 线上方穿墙（tileCollide=false）
    let guard = 0;
    while (!sword.dead && guard++ < 300) sword.fixedUpdate(1, game);
    expect(sword.dead).toBe(true);                        // 越线后撞 y=100 地面消亡
    expect(sword.starAlpha).toBe(0);                      // 线下钳 0 全显
  });

  it('alpha 线上钳 150（半显上限）', () => {
    const w = new World(200, 200, 30, 'open');
    const game = makeGame(w, [], []);
    const sword = new Arrow(50 * TILE, 60 * TILE, 0, 8, 170, 6.5, 503, null,
      { grav: 0, life: 900, pierce: 2, star: { targetY: 120 * TILE } });
    for (let t = 0; t < 30; t++) sword.fixedUpdate(1, game);
    expect(sword.starAlpha).toBe(150);                    // 线上方钳 150（:22197-22202）
  });
});

describe('最后的棱镜 3541 → 633/632（PrismProj 充能聚束）', () => {
  it('首帧生成 6 光棱；断 channel 全链消亡；魔耗 30 拍首扣', () => {
    const projectiles: unknown[] = [];
    const game = makeGame(new World(200, 200, 30, 'open'), [], projectiles);
    let ch = true;
    let pays = 0;
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => ch, () => ({ x: 150 * TILE, y: 90 * TILE }), () => { pays++; return true; });
    projectiles.push(prism);
    (game as unknown as { player: unknown }).player = { cx: 90 * TILE, cy: 90 * TILE };
    prism.fixedUpdate(1, game);
    expect(projectiles.filter((q) => q instanceof PrismProng).length).toBe(6);
    for (let t = 0; t < 28; t++) prism.fixedUpdate(1, game);
    expect(pays).toBe(0);
    prism.fixedUpdate(1, game);
    expect(pays).toBe(1);                     // charge=30 首拍（:63628）
    ch = false;
    prism.fixedUpdate(1, game);
    expect(prism.dead).toBe(true);
    for (const q of prism.prongs) expect(q.dead).toBe(true);
  });

  it('魔耗失败即断束（mana 不足 Kill）', () => {
    const projectiles: unknown[] = [];
    const game = makeGame(new World(200, 200, 30, 'open'), [], projectiles);
    let ok = true;
    const prism = new PrismProj(1, 0, 100, 0.25, () => true, () => ({ x: 1, y: 0 }), () => ok);
    projectiles.push(prism);
    (game as unknown as { player: unknown }).player = { cx: 90 * TILE, cy: 90 * TILE };
    prism.fixedUpdate(1, game);
    ok = false;
    for (let t = 0; t < 30 && !prism.dead; t++) prism.fixedUpdate(1, game);
    expect(prism.dead).toBe(true);
  });

  it('充能三段：散开→收敛；满充 180t 伤害×3 + 光束被墙截断', () => {
    const w = new World(200, 200, 30, 'open');
    for (let y = 0; y < 200; y++) w.store.setTileSilent(90, y, 1, 0, 0);   // x=90 墙列
    const list: unknown[] = [];
    let dmgTaken = 0;
    list.push({ id: 1, x: 60 * TILE, y: 90 * TILE, w: 24, h: 18, dead: false,
      hurt: (d: number) => { dmgTaken += d; return true; }, def: { hitSound: ['NPC_Hit_1'] } });
    const projectiles: unknown[] = [];
    const game = makeGame(w, list, projectiles);
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 150 * TILE, y: 90 * TILE }), () => true);
    projectiles.push(prism);
    (game as unknown as { player: unknown }).player = { cx: 40 * TILE, cy: 90 * TILE };
    prism.fixedUpdate(1, game);
    const prongs = prism.prongs;
    expect(dmgTaken).toBe(0);                 // charge<30 光束不伤敌（friendly 门）
    for (let t = 0; t < 180; t++) {
      prism.fixedUpdate(1, game);
      for (const q of prongs) if (!q.dead) q.fixedUpdate(1, game);
    }
    expect(prism.charge).toBeGreaterThanOrEqual(181);
    dmgTaken = 0;
    for (let t = 0; t < 10; t++) {
      for (const q of prongs) if (!q.dead) q.fixedUpdate(1, game);
    }
    expect(dmgTaken).toBeGreaterThanOrEqual(300);   // 满充 ×3（基 100）至少一跳
    for (const q of prongs) {
      // 墙在 x=90（1440px），棱镜 cx=640 → 截断 ≈800px（远小于 2400 上限）
      if (!q.dead) { expect(q.beamLen).toBeLessThan(820); expect(q.beamLen).toBeGreaterThan(700); break; }
    }
    const spread = Math.max(...prongs.filter((q) => !q.dead)
      .map((q) => Math.abs(Math.atan2(q.vy, q.vx))));
    expect(spread).toBeLessThan(0.5);               // 满充收敛（spread=1.75）
  });
});
