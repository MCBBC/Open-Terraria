import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Dart } from '../src/entities/Dart';

// 敌怪弹幕样式表（Dart.ts DART_STYLE）回归——对照 Projectile.cs SetDefaults/AI：
// 旋转语义 / 重力门 / 加速段 / extraUpdates 有效速度 / 渐入 alpha / 火箭 Kill。

function dartHooks() {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 70, 2); // 地板(70 行)
  const player = { x: 40 * 16, y: 66 * 16, w: 20, h: 42, cx: 41 * 16, cy: 67 * 16, dead: false, vx: 0, vy: 0 };
  const sfx: string[][] = [];
  const hooks = {
    world: w,
    player,
    playSfx: () => {},
    playSfxFiles: (files: string[]) => { sfx.push(files); },
    addDamageNumber: () => {},
    spawnParticles: () => {},
    spawnDrop: () => null,
    damagePlayer: () => {},
    entities: { add: () => {} },
  } as never;
  return { hooks, player, sfx };
}

/** 空-空直飞 N tick（不撞墙不撞玩家） */
function flyTicks(d: Dart, hooks: never, n: number) {
  for (let i = 0; i < n && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
}

describe('敌怪弹幕 DART_STYLE（对照 Projectile.cs）', () => {
  it('38 羽毛：align90 旋转 = atan2+π/2（AI_001 尾 :54868,静止朝上贴图对齐弹向）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(30 * 16, 50 * 16, 6, 0, 15, 38); // 向右平飞
    expect(d.life).toBe(300);                            // NPC 侧 timeLeft 覆写 :23492
    flyTicks(d, hooks, 5);
    const ang = Math.atan2(0, 6) + Math.PI / 2;
    expect(d['rot']).toBeCloseTo(ang, 5);
    expect(d.w).toBe(14); expect(d.h).toBe(14);         // SetDefaults 14×14
    expect(d.life).toBe(295);                            // timeLeft 每 tick -1
  });

  it('81 敌箭：重力 0.07 ai0≥20 门（:54009）——前 20 tick 直飞后下坠', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 9, 0, 11, 81);
    flyTicks(d, hooks, 20);
    expect(d.vy).toBeCloseTo(0, 5);                      // 20 tick 内不加重力
    flyTicks(d, hooks, 5);
    expect(d.vy).toBeCloseTo(0.07 * 5, 5);               // 此后 0.07/tick
  });

  it('44 魔镰：spin 0.8×dir + 加速 ×1.06@ai0[30,100)（AI_018 :23814/:23816）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 21, 44);
    flyTicks(d, hooks, 29);
    expect(d.vx).toBeCloseTo(0.2, 5);                    // 加速段未开始
    flyTicks(d, hooks, 1);                               // ai0=30 进入加速
    expect(d.vx).toBeCloseTo(0.2 * 1.06, 4);
    flyTicks(d, hooks, 70);
    expect(d.vx).toBeGreaterThan(8);                     // 70 次 ×1.06 ≈ 0.2×63
    expect(d['rot']).toBeCloseTo(0.8 * 100, 0);          // 恒速自旋 0.8×dir×100 更新
  });

  it('302 狙击弹：extraUpdates 7 → 有效弹速 4×8=32px/t（SetDefaults extraUpdates=7）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 50 * 16, 4, 0, 100, 302);
    const x0 = d.x;
    flyTicks(d, hooks, 1);
    expect(d.x - x0).toBeCloseTo(32, 0);
  });

  it('174 冰刺：重力 0.15@ai0≥5（:54017）+ 605 同款；176 丛林刺 0.05@15（:54310）', () => {
    const { hooks } = dartHooks();
    const a = new Dart(20 * 16, 10 * 16, 0, -4, 9, 174);
    flyTicks(a, hooks, 5); expect(a.vy).toBeCloseTo(-4, 5);
    flyTicks(a, hooks, 2); expect(a.vy).toBeCloseTo(-4 + 0.15 * 2, 4);
    const b = new Dart(20 * 16, 10 * 16, 0, -4, 13, 176);
    flyTicks(b, hooks, 15); expect(b.vy).toBeCloseTo(-4, 5);
    flyTicks(b, hooks, 2); expect(b.vy).toBeCloseTo(-4 + 0.05 * 2, 4);
  });

  it('115 三叉戟：a45 旋转 = atan2+π/4（AI_027 :24839）+ ×1.125 加速至 ai0=30', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 0.2, 0, 80, 115);
    flyTicks(d, hooks, 30);
    expect(d['rot']).toBeCloseTo(Math.PI / 4, 5);
    expect(d.vx).toBeCloseTo(0.2 * Math.pow(1.125, 29), 1); // ai0<30 每更新 ×1.125
  });

  it('302/84 渐入 alpha：|v|*0.9 恒减至 0（:52782 族）；257 恒减 10（:53036）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 4, 0, 100, 302);
    expect(d['alpha']).toBe(255);
    flyTicks(d, hooks, 1); // 8 substep × (4*0.9)=3.6 → 255-28.8
    expect(d['alpha']).toBeCloseTo(255 - 4 * 0.9 * 8, 1);
    const b = new Dart(20 * 16, 20 * 16, 15, 0, 32, 257);
    flyTicks(b, hooks, 1); // 2 substep × 10
    expect(b['alpha']).toBe(255 - 20);
  });

  it('909 岩石：roll 旋转 + 重力 0.4@ai0≥38 + 随机帧 ∈[0,6)（aiStyle2 :21519/:21527/:21534）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 10 * 16, 8, 0, 20, 909);
    expect(d['frame']).toBeGreaterThanOrEqual(0);
    expect(d['frame']).toBeLessThan(6);
    flyTicks(d, hooks, 38);
    expect(d.vy).toBeCloseTo(0, 5);
    flyTicks(d, hooks, 3);
    expect(d.vy).toBeCloseTo(0.4 * 3, 4);
    expect(d['rot']).toBeGreaterThan(0);                 // roll 随 |v| 累积
  });

  it('303 火箭：life 180,撞实心块 → 爆炸消亡（Kill :74533 组,不存活）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 66 * 16, 4, 0, 60, 303);
    expect(d.life).toBe(180);
    flyTicks(d, hooks, 200); // 朝右平飞 480px 不撞墙 → 自然到期
    expect(d.dead).toBe(true);
  });

  it('293 迷失之魂：200px 内追踪（AI_051 vel=(vel*100+t)/101）+ 穿墙不消亡', () => {
    const { hooks } = dartHooks();
    const d = new Dart(40 * 16, 62 * 16, 4, 0, 40, 293); // 玩家上方 ~80px,200px 追踪圈内
    flyTicks(d, hooks, 10);
    // 玩家在正下方 → vy 被拉正;水平直飞分量缓慢衰向 0(目标 x 几乎同列)
    expect(d.vy).toBeGreaterThan(0);
    expect(d.vx).toBeLessThan(4);
  });

  it('发射音：81 箭 Item_5 / 180 弹 Item_11 / 44 镰 Item_8 / 572 蝾螈 Item_17（AI_001 各 ai[1]==0 分支）', () => {
    const { hooks, sfx } = dartHooks();
    for (const [pid, file] of [[81, 'Item_5'], [180, 'Item_11'], [44, 'Item_8'], [572, 'Item_17']] as const) {
      sfx.length = 0;
      const d = new Dart(20 * 16, 20 * 16, 6, 0, 10, pid);
      flyTicks(d, hooks, 1);
      expect(sfx[0]?.[0]).toBe(file);
    }
  });

  it('300 圣锤 / 299 暗影焰：tileCollide=false 穿墙（SetDefaults）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(30 * 16, 65 * 16, 4, 0, 60, 300);
    // 65 行未铺地板(70 行才是)→ 飞到 70 行撞地板:直飞会撞,圣锤应穿过
    const solidX = 20 * 16;
    d.x = solidX; d.y = 68 * 16; d.vx = 0; d.vy = 4;
    flyTicks(d, hooks, 20);
    expect(d.dead).toBe(false);
    expect(d.y).toBeGreaterThan(70 * 16);                // 已穿入地板下方
  });
});
