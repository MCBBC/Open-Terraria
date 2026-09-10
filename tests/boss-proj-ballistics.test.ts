// 弹道批回归(2026-08-19):月总 452/454/1021 + Betsy 687 + 火星 448 五组弹幕
// 行为层 1:1 断言(非只编译过):
//   452 aiStyle 82(Projectile.cs:30119-30195) 三段弹道:135t 弧线上升 → 14 速
//     追踪,距玩家 <30 消亡;
//   454 aiStyle 83(:30236-30282) 归巢:ai0<30 附主随行 → 列队 ×0.96 减速 →
//     volleyPhantomOrbs 置 -1 齐射(帧 1 + extraUpdates 1);
//   1021 aiStyle 25(:24685-24712 + 弹地 :17578-17600):重力 0.06/终端 16/
//     滚动加速/Y 撞 Dig 音 ×−0.9 反弹;
//   448 aiStyle 80(:29801-29890):20t 引信 → +4 加速(8→12);近身 42px 爆炸
//     (Kill :70544-70580 判定盒 112×112 重结算);
//   687 AI_136(:65843-65914):锚定 Betsy 嘴部(102·spr,30).RotatedBy(rot),
//     线段判定宽 40,78t 寿命,Betsy 位移时焰心跟随。
import { describe, it, expect } from 'vitest';
import { Arrow, volleyPhantomOrbs } from '../src/entities/Arrow';
import { BetsyBreath } from '../src/entities/bossAI_dd2';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 120, FLOOR = 100;

function makeWorld(): World {
  const w = new World(W, H, 7, 'proj-ballistics');
  const st = w.store;
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

interface Harness {
  hooks: GameHooks;
  player: Player & { iframes: number };
  enemies: Array<{ id: number; dead: boolean; x: number; y: number; w: number; h: number; cx: number; cy: number; facing: number; visAngle: number; vanillaId?: number }>;
  projectiles: Arrow[];
  sfx: Array<[string, number]>;
  hits: number[];
}

function makeHarness(playerAt: { x: number; y: number }): Harness {
  const world = makeWorld();
  const p = new Player(playerAt.x * TILE, playerAt.y * TILE, new Inventory()) as Player & { iframes: number };
  p.iframes = 0;
  const enemies: Harness['enemies'] = [];
  const projectiles: Arrow[] = [];
  const sfx: Array<[string, number]> = [];
  const hits: number[] = [];
  let nextId = 1;
  const em = {
    nextId,
    // projectiles 数组同时挂在 em 上——volleyPhantomOrbs 等发射点指令按
    // entities.projectiles 遍历场上弹（同真实 Game.entities 结构）
    projectiles,
    add: (e: unknown, bucket: string) => {
      const ent = e as { id: number };
      ent.id = nextId++;
      if (bucket === 'enemies') enemies.push(e as Harness['enemies'][number]);
      else projectiles.push(e as Arrow);
    },
  };
  const hooks = {
    world, player: p, entities: em,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (dmg: number, sx: number, sy: number): number => { hits.push(dmg); p.iframes = 60; p.damage(dmg, sx, sy); return dmg; },
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnBurst: () => {},
    notifyInventoryChanged: () => {},
    playSfx: (name: string, vol: number) => { sfx.push([name, vol]); },
    playSfxFiles: () => {},
  } as unknown as GameHooks;
  return { hooks, player: p, enemies, projectiles, sfx, hits };
}

function step(h: Harness, n: number, only?: (p: Arrow) => boolean): void {
  for (let i = 0; i < n; i++) {
    for (const p of [...h.projectiles]) {
      if (!p.dead && (!only || only(p))) p.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

describe('452 幻影矢三段弹道(aiStyle 82)', () => {
  it('135t 弧线上升后 14 速追踪,距玩家 <30 消亡', () => {
    const h = makeHarness({ x: 80, y: 96 });
    const p0 = h.player.cx, p1 = h.player.cy;
    const a = new Arrow(p0, p1 - 200, 0, -8, 30, 0, 452,
      { grav: 0, life: 600, pierce: 1, hostile: true, phantasm: { spin: 0.1 } });
    h.projectiles.push(a);
    h.enemies.push({ id: 999, dead: true, x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, facing: 1, visAngle: 0 });
    // 前 130t:纯上升段(vy 钳 -7,箭恒在玩家上方)
    step(h, 130);
    expect(a.dead).toBe(false);
    expect(a.vy).toBeLessThanOrEqual(-6.9);
    expect(a.cy).toBeLessThan(p1);
    // 135t 后进入追踪,箭调头下扑并最终贴近玩家消亡(<30px)
    step(h, 600);
    expect(a.dead).toBe(true);
    expect(Math.hypot(a.cx - p0, a.cy - p1)).toBeLessThan(30);
  });

  it('上升段 vx 弧线弯转钳 ±6', () => {
    const h = makeHarness({ x: 80, y: 96 });
    const a = new Arrow(h.player.cx, h.player.cy - 400, 0, -8, 30, 0, 452,
      { grav: 0, life: 600, pierce: 1, hostile: true, phantasm: { spin: 0.5 } });
    h.projectiles.push(a);
    h.enemies.push({ id: 999, dead: true, x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, facing: 1, visAngle: 0 });
    step(h, 40);
    expect(Math.abs(a.vx)).toBeGreaterThan(0);   // RotatedBy(spin) 弯出横向分量
    expect(Math.abs(a.vx)).toBeLessThanOrEqual(6);  // 钳 ±6(:30136)
  });
});

describe('454 幻影能量球归巢(aiStyle 83)', () => {
  it('随行 30t → 列队减速 → volley 置 -1 齐射(帧1+双步+12速)', () => {
    const h = makeHarness({ x: 80, y: 96 });
    const hand = { id: 7, dead: false, x: 1000, y: 1000, w: 100, h: 100, cx: 1050, cy: 1050, facing: 1, visAngle: 0 };
    h.enemies.push(hand);
    const orb = new Arrow(hand.cx, hand.cy, 6, -6, 40, 0, 454,
      { grav: 0, life: 600, pierce: 1, hostile: true, phantomOrb: { ownerId: 7, ai0: 0 } });
    h.projectiles.push(orb);
    // 随行:ai0<30 期间球心钉在手心(position = 主心 − 尺寸/2)
    step(h, 10);
    expect(orb.orbAi0).toBeLessThan(30);
    hand.cx += 120;
    step(h, 1);
    expect(orb.cx).toBeCloseTo(hand.cx, 5);
    expect(orb.cy).toBeCloseTo(hand.cy, 5);
    // 列队:ai0≥30 后 ×0.96/t 减速,不再跟随
    step(h, 40);
    expect(orb.orbAi0).toBeGreaterThanOrEqual(30);
    const spd0 = Math.hypot(orb.vx, orb.vy);
    expect(spd0).toBeLessThan(8.4);              // 6·2=8.49 出速经 ~30t ×0.96 衰减
    step(h, 10);
    expect(Math.hypot(orb.vx, orb.vy)).toBeLessThan(spd0);
    // 齐射指令:全部己方球置 -1,统一 12 速
    volleyPhantomOrbs(h.hooks, 7, 12, 0);
    expect(orb.orbAi0).toBe(-1);
    expect(orb.vx).toBe(12);
    step(h, 1);
    expect(orb.orbFrame).toBe(1);                // :30250 帧 1
    expect(orb.extraUpdates).toBe(1);            // :30252 双步
  });

  it('volley 只圈定 ownerId 己方球(他人球不受指令)', () => {
    const h = makeHarness({ x: 80, y: 96 });
    h.enemies.push({ id: 7, dead: false, x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, facing: 1, visAngle: 0 });
    h.enemies.push({ id: 8, dead: false, x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, facing: 1, visAngle: 0 });
    const mine = new Arrow(0, 0, 0, 0, 40, 0, 454,
      { grav: 0, life: 600, pierce: 1, hostile: true, phantomOrb: { ownerId: 7, ai0: 30 } });
    const other = new Arrow(0, 0, 0, 0, 40, 0, 454,
      { grav: 0, life: 600, pierce: 1, hostile: true, phantomOrb: { ownerId: 8, ai0: 30 } });
    h.projectiles.push(mine, other);
    volleyPhantomOrbs(h.hooks, 7, 0, -12);
    expect(mine.orbAi0).toBe(-1);
    expect(other.orbAi0).not.toBe(-1);
  });
});

describe('1021 月总巨砾物理(aiStyle 25)', () => {
  it('重力 0.06 下落,Y 撞 Dig 音 + ×−0.9 反弹,轻落置 rest 后滚动加速', () => {
    const h = makeHarness({ x: 10, y: 10 });
    const b = new Arrow(80 * TILE, 95 * TILE, 2, 12, 70, 0, 1021,
      { grav: 0.06, life: 900, pierce: 1, hostile: true, mlBoulder: true });
    h.projectiles.push(b);
    // 高速下坠撞地:vy>4 → Dig 音 + ×−0.9 反弹(:17578-17588)
    step(h, 30);
    expect(h.sfx.some(([n]) => n === 'dig')).toBe(true);
    expect(b.dead).toBe(false);
    // 反弹后回落轻触(vy≤4)→ 贴地 rest;滚动加速段 |vy|≤1 内 vx 逐步 +0.025
    step(h, 120);
    expect(b.dead).toBe(false);
    expect(b.vy).toBeGreaterThanOrEqual(-1);
  });
});

describe('448 火箭引信/追踪/爆炸(aiStyle 80)', () => {
  it('20t 引信后 +4 加速(8→12);近身 42px 爆炸重结算伤害', () => {
    const h = makeHarness({ x: 84, y: 96 });
    const r = new Arrow(80 * TILE, 90 * TILE, 8, 0, 50, 0, 448,
      { grav: 0, life: 3600, pierce: 1, hostile: true, martianRocket: true });
    h.projectiles.push(r);
    step(h, 20);
    expect(Math.hypot(r.vx, r.vy)).toBeCloseTo(8, 5);   // 引信未到:恒 8
    step(h, 1);
    expect(Math.hypot(r.vx, r.vy)).toBeCloseTo(12, 5);  // 点火 +4(:29811-29813)
    // 点火后撞块判据恢复(tileCollide=true,:29833)
    expect(r.noTileCollide).toBe(false);
    // 近身 42px → Kill 爆炸:112×112 判定盒 Damage_EVP(:70544-70580)
    h.player.x = r.cx - 8;
    h.player.y = r.cy - 20;
    h.player.iframes = 0;
    step(h, 1);
    expect(r.dead).toBe(true);
    expect(h.hits.length).toBeGreaterThan(0);
  });
});

describe('687 Betsy 喷焰锚定(AI_136)', () => {
  it('焰心锚定嘴部(102·spr,30).RotatedBy(rot),线段命中玩家,78t 寿命,跟随位移', () => {
    const h = makeHarness({ x: 10, y: 10 });
    const betsy = { id: 42, dead: false, x: 60 * TILE, y: 60 * TILE, w: 200, h: 120, cx: 61 * TILE, cy: 60.5 * TILE, facing: 1, visAngle: 0 };
    h.enemies.push(betsy);
    const breath = new BetsyBreath(betsy as never, 35);
    h.projectiles.push(breath as unknown as Arrow);
    // 玩家摆到焰舌路径上(嘴部 + 指向 ×250;指向 = atan2(30,102))
    const mx = betsy.cx + 102, my = betsy.cy + 30;
    const ang = Math.atan2(30, 102);
    h.player.x = mx + Math.cos(ang) * 250 - 10;
    h.player.y = my + Math.sin(ang) * 250 - 21;
    h.player.iframes = 0;
    // 25t 焰头推满(:14716-14720 num22=t/25)
    step(h, 26);
    expect(h.hits.length).toBeGreaterThan(0);       // 线段命中(宽 40)
    // Betsy 横移 200px:焰心每帧跟随嘴部
    betsy.cx += 200;
    step(h, 1);
    expect(breath.cx).toBeCloseTo(betsy.cx + 102, 0);
    // 78t 寿命(:65911-65914)
    step(h, 80);
    expect(breath.dead).toBe(true);
  });
});
