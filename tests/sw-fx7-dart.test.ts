// SW-FX7（2026-09-10）Dart 弹幕域登记债——现状定谳 + 实修回归
//  A. 44 魔镰 / 288 金雨 tile 碰撞缩盒（GetCollisionParams,Projectile.cs:19982-20156）：
//     44 aiStyle18 → width−36 = 12×12（:20081-20085）；288 缩盒名单 → 10×10（:20072-20080）。
//     缩盒重叠 = TileCollision 截停 → 默认 Kill 支（:19962-19966）。
//     变异判别力：中心格判定在此夹具下不灭（中心格仍空,缩盒已搭墙）→ 必红。
//  B. 44 魔镰无转向定谳锁：AI_018 通用支（:25780-25797）只有 spin+加速+尘,零追踪。
//     spawn-parity-gaps.md 旧登记的 "AngleTowards(0.25) 蓄势转向" 属 type 1092
//     （:25735-25737）,44 走加速段直线不追踪 = 原版本相。
//  C. 291 地狱火弹 ai[0]/ai[1] 目标锚（AI_050 :28745-28756）：vector32≠Zero 且
//     Dot(target−Center,velocity)<=0 → velocity=Zero → Kill。锚 = 发射时目标心
//     （NPC.cs:21294 末两参）。
//  D. 290 暗影束撞块反射（HandleMovement 290/294 支 :18975-19018 全速反号不消亡）
//     ——本仓主轴反射近似（登记）的回归锁。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Dart, DART_STYLE } from '../src/entities/Dart';

function dartWorld() {
  const w = new World(80, 80, 42, 'sw-fx7-dart');
  const st = w.store;
  const player = { x: 40 * 16, y: 66 * 16, w: 20, h: 42, cx: 41 * 16, cy: 67 * 16, dead: false, vx: 0, vy: 0 };
  const hooks = {
    world: w,
    player,
    playSfx: () => {},
    playSfxFiles: () => {},
    addDamageNumber: () => {},
    spawnParticles: () => {},
    spawnDust: () => null,
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    entities: { add: () => {} },
  } as never;
  return { w, st, hooks, player };
}

describe('SW-FX7 A：44/288 tile 缩盒判定（GetCollisionParams）', () => {
  it('表值：44=12（aiStyle18 width−36 :20081）；288=10（缩盒名单 :20072）；其余无档', () => {
    expect(DART_STYLE[44].tileBox).toBe(12);
    expect(DART_STYLE[288].tileBox).toBe(10);
    expect(DART_STYLE[300].tileBox).toBeUndefined();   // 300 tileCollide=false（SetDefaults :3915）
    expect(DART_STYLE[81].tileBox).toBeUndefined();    // 小盒族维持中心格近似
  });

  it('44：缩盒已搭墙而中心格仍空 → 即灭（中心格判定漏检此窗 = 变异必红）', () => {
    const { st, hooks } = dartWorld();
    for (let y = 0; y < 80; y++) st.setTileSilent(10, y, 1);   // x=10 竖墙（tile 160..176px）
    // 中心 153.4（tile 9）右移 1px/拍 → 下一拍中心 154.4 仍在 tile 9,
    // 但缩盒（中心±6）右缘 160.4 ≥ 160 已搭 x=10 墙 → 原版 TileCollision 截停 → Kill
    const d = new Dart(153.4 - 24, 5 * 16 + 8 - 24, 1, 0, 20, 44);
    d.hostile = true;
    d.fixedUpdate(1 / 60, hooks);
    expect(d.dead).toBe(true);
  });

  it('44：缩盒未触墙 → 不灭（上界不外扩,防过检）', () => {
    const { st, hooks } = dartWorld();
    for (let y = 0; y < 80; y++) st.setTileSilent(10, y, 1);
    // 中心 150（tile 9）右移 1px → 缩盒右缘 157 < 160 未搭墙
    const d = new Dart(150 - 24, 5 * 16 + 8 - 24, 1, 0, 20, 44);
    d.hostile = true;
    d.fixedUpdate(1 / 60, hooks);
    expect(d.dead).toBe(false);
  });

  it('288：10×10 缩盒同一几何（边缘 5px 窗）', () => {
    const { st, hooks } = dartWorld();
    for (let y = 0; y < 80; y++) st.setTileSilent(10, y, 1);
    // 中心 155.5（tile 9）右移 1px → 缩盒右缘 161.5 ≥ 160 → 灭
    const a = new Dart(155.5 - 16, 5 * 16 + 8 - 16, 1, 0, 20, 288);
    a.hostile = true;
    a.fixedUpdate(1 / 60, hooks);
    expect(a.dead).toBe(true);
    // 中心 152 → 缩盒右缘 158 < 160 → 不灭
    const b = new Dart(152 - 16, 5 * 16 + 8 - 16, 1, 0, 20, 288);
    b.hostile = true;
    b.fixedUpdate(1 / 60, hooks);
    expect(b.dead).toBe(false);
  });
});

describe('SW-FX7 B：44 魔镰无转向（AI_018 通用支 = 原版本相）', () => {
  it('玩家偏轴在场仍直线飞行：100 拍速度方向恒定（AngleTowards 属 1092 :25735）', () => {
    const { hooks, player } = dartWorld();
    player.x = 20 * 16; player.cx = 21 * 16; player.y = 70 * 16; player.cy = 71 * 16; // 侧下方
    const d = new Dart(20 * 16, 20 * 16, 6, 0, 20, 44);
    const ang0 = Math.atan2(0, 6);
    for (let t = 0; t < 100 && !d.dead; t++) d.fixedUpdate(1 / 60, hooks);
    expect(Math.atan2(d.vy, d.vx)).toBeCloseTo(ang0, 6);   // 零转向
    expect(d.vx).toBeGreaterThan(6);                        // 加速段照常（×1.06^70）
  });
});

describe('SW-FX7 C：291 地狱火弹目标锚（AI_050 :28745-28756）', () => {
  it('锚点在前方（Dot>0）→ 不爆；越点（Dot<=0）→ 即爆并生成 292 爆区', () => {
    const { hooks } = dartWorld();
    const added: unknown[] = [];
    (hooks as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities =
      { add: (e: unknown, _b: string) => { added.push(e); } };
    // 锚在右方 80px：向右飞 6px/拍 → 第 14 拍越点
    const d = new Dart(20 * 16, 20 * 16, 6, 0, 30, 291);
    d.hostile = true;
    d.spawnAi0 = 20 * 16 + 80; d.spawnAi1 = 20 * 16;
    for (let t = 0; t < 10 && !d.dead; t++) d.fixedUpdate(1 / 60, hooks);
    expect(d.dead).toBe(false);                       // 未到点
    for (let t = 0; t < 10 && !d.dead; t++) d.fixedUpdate(1 / 60, hooks);
    expect(d.dead).toBe(true);                        // 越点即爆（非撞人/寿终）
    expect(added.length).toBe(1);                     // inferno291Kill 原位 spawn 292（:75802-75807）
  });

  it('无锚（spawnAi0/1=0,直构未传参域）→ 不判越点,按寿终路由', () => {
    const { hooks } = dartWorld();
    const d = new Dart(20 * 16, 20 * 16, 6, 0, 30, 291);
    d.hostile = true;
    for (let t = 0; t < 20 && !d.dead; t++) d.fixedUpdate(1 / 60, hooks);
    expect(d.dead).toBe(false);
  });
});

describe('SW-FX7 D：290 暗影束撞块反射（:18975-19018 近似口回归锁）', () => {
  it('撞墙 = 主轴全速反号且不消亡（penetrate=-1 无限反弹）', () => {
    // 世界 400×200：束速 101 子步×6px=606px/拍——小世界会撞 InWorld 内缘 5 格
    // 门外 Kill（:28610-28614）而非反射,须给足回弹行程
    const w = new World(400, 200, 42, 'sw-fx7-290');
    for (let y = 0; y < 200; y++) w.store.setTileSilent(200, y, 1);   // 竖墙 x=200（3200px）
    const player = { x: 100 * 16, y: 100 * 16, w: 20, h: 42, cx: 101 * 16, cy: 101 * 16, dead: false, vx: 0, vy: 0 };
    const hooks = {
      world: w, player, playSfx: () => {}, playSfxFiles: () => {}, addDamageNumber: () => {},
      spawnParticles: () => {}, spawnDust: () => null, spawnDrop: () => null,
      damagePlayer: (): number => 0, entities: { add: () => {} },
    } as never;
    const d = new Dart(199 * 16 + 4, 100 * 16, 6, 0, 20, 290);
    d.hostile = true;
    const vx0 = d.vx;
    d.fixedUpdate(1 / 60, hooks);
    expect(d.dead).toBe(false);
    expect(d.vx).toBe(-vx0);
    // 回弹后仍在世界内缘窗内（未触 :28610 世界边 Kill）
    const tx = Math.floor(d.cx / 16);
    expect(tx).toBeGreaterThan(5);
    expect(tx).toBeLessThan(395);
  });
});
