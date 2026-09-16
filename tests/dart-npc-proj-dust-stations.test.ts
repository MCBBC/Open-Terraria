// ★FX53（2026-09-16）NPC 射手弹粒子站金标——载体分家根因定谳：
//  原版 Projectile.Update 的「Update 尾通用尘站」（P.cs:17141-17182）与 Kill() 分档
//  尘链（:77165 / :75447 / :75392）对 owner/npcProj 无关——NPC 弹同站同频。
//  本仓 NPC 射手弹走 spawnHostileProj→Dart 载体（玩家弹走 Arrow），该站此前整缺：
//  骷髅弓箭手 110（NPC.cs:59612 表内,弹 num171 缺省=82 :59797）射出的燃烧箭无火焰
//  尾迹/死拍无火尘（用户报 FX53）。同批 AI 段泛色 trail 退役改真尘站六型
//  （55/96/128/177/288/572）+ 577 首拍喷口爆发。
//  频率口径：原版站/本站均在 numUpdates 子步循环内 → 每【子步】1 跑；本批六型
//  EU=0 → 每 tick 恰 1 跑（288 EU=2 → 每 tick 3 跑=×3 粒;577 EU=2 首子步一次）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Dart } from '../src/entities/Dart';
import type { GameHooks } from '../src/entities/types';

interface DustRec {
  type: number; alpha: number; scale: number; noGravity: boolean;
  x: number; y: number; vx: number; vy: number;
  boxX: number; boxY: number; boxW: number; boxH: number;
}

function makeHooks(w: World, dusts: DustRec[], sfx: string[], player?: unknown) {
  const hooks = {
    world: w,
    player: player ?? { x: 40 * 16, y: 66 * 16, w: 20, h: 42, cx: 41 * 16, cy: 67 * 16, dead: false, vx: 0, vy: 0 },
    playSfx: (name: string) => { sfx.push(name); },
    playSfxFiles: () => {},
    spawnParticles: () => {},
    addDamageNumber: () => {},
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    entities: { add: () => {} },
    spawnDust: (bx: number, by: number, bw: number, bh: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c: unknown = null, scale = 1, ng = false) => {
      const d: DustRec = {
        type, alpha, scale, noGravity: !!ng,
        x: bx, y: by, vx: sx, vy: sy, boxX: bx, boxY: by, boxW: bw, boxH: bh,
      };
      dusts.push(d);
      return d;
    },
  };
  return hooks as unknown as GameHooks;
}

function floorWorld(): World {
  const w = new World(80, 80, 42, 'open');
  for (let x = 10; x <= 70; x++) w.store.setTileSilent(x, 70, 2);   // 地板 70 行
  return w;
}

function flyTicks(d: Dart, hooks: GameHooks, n: number): void {
  for (let i = 0; i < n && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
}

const of = (dusts: DustRec[], t: number) => dusts.filter((d) => d.type === t);

describe('★FX53 NPC 射手弹 Update 尾通用尘站（P.cs:17141;Dart 载体补齐）', () => {
  it('82 敌燃烧箭：每 tick 恰 1×d6 α100（8 tick → 8 粒;同 id 同 dust 同频=玩家侧 Arrow 同站）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 35, 82);
    flyTicks(d, hooks, 8);
    const d6 = of(dusts, 6);
    expect(d6.length).toBe(8);
    expect(d6.every((x) => x.alpha === 100)).toBe(true);
    // 出生盒 = 弹体盒（NewDust(position,width,height,6,0,0,100)）
    expect(d6[0].boxW).toBe(10);
    expect(d6[0].boxH).toBe(10);
  });

  it('81 敌木箭：原版 Update 尾链无分支 → 飞行零尘（尘面只在 Kill 站）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 11, 81);
    flyTicks(d, hooks, 8);
    expect(dusts.length).toBe(0);
  });
});

describe('★FX53 射手箭族 Kill 尘站（P.cs:77165 / :75447 / :75392;三死亡口同站）', () => {
  it('82 撞块死：dig 音 + 10×d6 α100（:77165-77171）', () => {
    const dusts: DustRec[] = [];
    const sfx: string[] = [];
    const hooks = makeHooks(floorWorld(), dusts, sfx);
    // 地板 70 行顶 y=1120;出生 y=1120−8(盒 10,心 −3),vy=4 → 心入实心 = 撞块口
    const d = new Dart(40 * 16, 70 * 16 - 8, 0, 4, 35, 82);
    d.hostile = true;
    flyTicks(d, hooks, 3);
    expect(d.dead).toBe(true);
    expect(sfx).toContain('dig');
    expect(of(dusts, 6).length).toBe(10);
    expect(of(dusts, 6).every((x) => x.alpha === 100)).toBe(true);
  });

  it('82 寿终死：同站 10×d6（timeLeft 尽 → Kill :17307-17311 同一入口）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 35, 82);
    (d as unknown as { life: number }).life = 1;
    flyTicks(d, hooks, 3);
    expect(d.dead).toBe(true);
    expect(of(dusts, 6).length).toBe(10);
  });

  it('81 撞块死：dig 音 + 10×d7（木箭族 :75447-75455）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(40 * 16, 70 * 16 - 8, 0, 4, 11, 81);
    flyTicks(d, hooks, 3);
    expect(of(dusts, 7).length).toBe(10);
    expect(of(dusts, 6).length).toBe(0);
  });

  it('1073 携物史莱姆凝胶弹撞块死：10×d7（同 :75447 分支）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(40 * 16, 70 * 16 - 8, 0, 4, 20, 1073);
    flyTicks(d, hooks, 3);
    expect(of(dusts, 7).length).toBe(10);
  });

  it('508 标枪撞块死：20×d81 noGravity,位=(尘位+心)/2、速=(尘速+弹速×0.4)×0.5（:75392-75410）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(40 * 16, 70 * 16 - 8, 0, 4, 18, 508);
    flyTicks(d, hooks, 3);
    const d81 = of(dusts, 81);
    expect(d81.length).toBe(20);
    expect(d81.every((x) => x.noGravity)).toBe(true);
    // 首粒：出生盒 +16 沿弹速归一向 → 尘位=(盒位+Center)/2;弹速未清零=oldVelocity 同值域
    const sp = Math.hypot(d.vx, d.vy) || 1;
    const expX0 = (d.x + (d.vx / sp) * 16 + d.cx) / 2;
    expect(d81[0].x).toBeCloseTo(expX0, 5);
    expect(d81[0].vx).toBeCloseTo((0 + d.vx * 0.4) * 0.5, 5);
  });
});

describe('★FX53 同族清偿：DART_STYLE 泛色 trail 退役 → 真尘站（每 tick 同频）', () => {
  it('55 黄蜂毒刺：1×d18/tick,scale0.9 noGravity α0（AI_001 :56456-56460）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 5, 0, 10, 55);
    flyTicks(d, hooks, 6);
    const d18 = of(dusts, 18);
    expect(d18.length).toBe(6);
    expect(d18.every((x) => x.scale === 0.9 && x.noGravity && x.alpha === 0)).toBe(true);
  });

  it('96 诅咒焰：1×d75/tick,scale=3×1.3,盒=position+弹速（aiStyle8 :24588-24593）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 5, 0, 30, 96);
    flyTicks(d, hooks, 5);
    const d75 = of(dusts, 75);
    expect(d75.length).toBe(5);
    expect(d75.every((x) => Math.abs(x.scale - 3.9) < 1e-9 && x.noGravity && x.alpha === 100)).toBe(true);
    // 首 tick 尘盒 = 出生位 + 弹速（尘站在位移前 = pre-move;出生 (320,480),v=(5,0)）
    expect(d75[0].boxX).toBeCloseTo(320 + 5, 5);
    expect(d75[0].boxY).toBeCloseTo(480, 5);
  });

  it('572 蝾螈吐息：2×d40/tick,scale1.2 noGravity,位=(Center+position)/2（AI_001 :57254-57271）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 14, 572);
    flyTicks(d, hooks, 4);
    const d40 = of(dusts, 40);
    expect(d40.length).toBe(8);
    expect(d40.every((x) => x.scale === 1.2 && x.noGravity && x.alpha === 100)).toBe(true);
    // vel=(vel×0.5+弹速)×0.5（mock 抖动 0 → (6×0.5+6)×0.5=4.5）;
    // 位=(Center+position)/2 用首 tick 出生值：cx=325/cy=485,x=320/y=480
    expect(d40[0].vx).toBeCloseTo((6 * 0.5 + 6) * 0.5, 5);
    expect(d40[0].x).toBeCloseTo((325 + 320) / 2, 5);
    expect(d40[0].y).toBeCloseTo((485 + 480) / 2, 5);
  });

  it('128 霜爆：3×d92/tick,α50 scale1.2 noGravity vel×0.3（aiStyle28 :26983-26992）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 5, 0, 30, 128);
    flyTicks(d, hooks, 4);
    const d92 = of(dusts, 92);
    expect(d92.length).toBe(12);
    expect(d92.every((x) => x.alpha === 50 && x.scale === 1.2 && x.noGravity)).toBe(true);
    expect(d92[0].vx).toBeCloseTo(d.vx * 0.3, 5);
  });

  it('177 冰水吐涎：3×d137/tick,α∈[0,100] scale∈[0.8,1.39] noGravity vel×0.3（:26966-26977）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 5, 0, 30, 177);
    flyTicks(d, hooks, 4);
    const d137 = of(dusts, 137);
    expect(d137.length).toBe(12);
    expect(d137.every((x) => x.alpha >= 0 && x.alpha <= 100 && x.scale >= 0.8 && x.scale < 1.391
      && x.noGravity)).toBe(true);
  });

  it('288 金雨：3×d170/tick（EU=2 → ×3 子步=9 粒/tick）,盒 +14/−28,1/8 掷档盒 +16/−32（aiStyle12 :24788-24829）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 5, 0, 30, 288);
    flyTicks(d, hooks, 2);
    const d170 = of(dusts, 170);
    // 每 tick 3 子步 × 3 粒 = 9 主粒 + 0..1 额外粒/子步（1/8） → 2 tick ∈ [18, 24]
    expect(d170.length).toBeGreaterThanOrEqual(18);
    expect(d170.length).toBeLessThanOrEqual(24);
    const main = d170.filter((x) => x.boxW === 4);          // 32−28=4
    const extra = d170.filter((x) => x.boxW === 0);         // 32−32=0
    expect(main.length).toBeGreaterThanOrEqual(18);
    expect(extra.every((x) => x.scale === 0.5 && !x.noGravity)).toBe(true);
    expect(main.every((x) => x.scale === 1 && x.noGravity)).toBe(true);
    // 位修正 −= 弹速/3×k：k=0 粒位 = 盒位（首子步出生 320+14=334）;主粒 vel = vel×0.1+弹速×0.5
    expect(main[0].x).toBeCloseTo(320 + 14, 5);
    expect(main[0].vx).toBeCloseTo(0 * 0.1 + 5 * 0.5, 5);
  });

  it('577 星旋激光：首拍恰 5×d229 后续零（喷口爆发一次性 :56334-56348;EU=2 首子步门）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 20, 0, 30, 577);
    flyTicks(d, hooks, 6);
    const d229 = of(dusts, 229);
    expect(d229.length).toBe(5);
    expect(d229.every((x) => x.noGravity && x.alpha === 100 && x.scale >= 1 && x.scale < 1.5)).toBe(true);
  });
});
