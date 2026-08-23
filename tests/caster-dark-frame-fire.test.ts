// 黑暗魔法师 32 三症状回归（2026-08-17 用户报告）：
//  ① 帧引擎（FindFrame case 29/32/45/172/281-286/693，NPC.cs:77721-77743）：非循环
//    三态帧 0 待机/1 蓄力/2 腾空；32 的 RedHat 变体整带 +3（贴图 6 帧=两套头饰形态，
//    常态只播 0-2）。曾落通用 6t 全循环档 → 两种形态六帧连播。
//  ② 发射（AI_008 :21042/:21139-21206）：蓄力点 ai[0]∈{100,200,300} → ai[1]=30 →
//    倒数 ==25 出膛 NewNPC 33 水球（Bottom 锚 (X+w/2, Y-8)）；球原版精灵恒隐形
//    （alpha=255），本仓显形+尘迹+光。受击打断（StrikeNPC :82061-82088）ai[0]→400。
//  ③ 物理（:20787-20791）：全族无 noGravity → 重力+碰撞；受击抛物线回落，
//    不再"被击退就往上飞"（旧实现 vx/vy 同乘 0.9 裸积分无重力）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { vanillaFrameIdx } from '../src/render/Renderer';

interface Hooks {
  world: World;
  player: { x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean; vx: number; vy: number };
  sfx: string[][];
  shots: Enemy[];
  dust: number;
  playSfxFiles(files: string[]): void;
  spawnParticles(_x: number, _y: number, _c: string, count: number): void;
  damagePlayer(): void;
  addDamageNumber(): void;
  enemies(): unknown[];
  entities: { add(e: unknown, b: string): void };
}

function casterWorld() {
  const w = new World(80, 80, 42, 'caster');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2);            // 地板 y=60
  for (let x = 20; x <= 60; x++) for (let y = 50; y <= 59; y++) st.wall[st.idx(x, y)] = 8; // 地牢砖墙
  const hooks: Hooks = {
    world: w,
    player: { x: 40 * 16, y: 57 * 16, w: 20, h: 42, cx: 40 * 16 + 10, cy: 57 * 16 + 21, dead: false, vx: 0, vy: 0 },
    sfx: [], shots: [], dust: 0,
    playSfxFiles(files) { hooks.sfx.push(files); },
    spawnParticles(_x, _y, _c, count) { hooks.dust += count; },
    damagePlayer() {},
    addDamageNumber() {},   // Enemy.hurt 伤害数字链（RV3 后桩缺口补）
    enemies: () => [],
    entities: {
      add(e, b) {
        if (b === 'enemies') hooks.shots.push(e as Enemy);
      },
    },
  };
  return { w, hooks };
}

describe('黑暗魔法师 32：帧引擎（单头饰形态）', () => {
  it('三态帧：待机 0 / 蓄力 1 / 腾空 2；400t 实跑只出现 0-2（不跨到 3-5 第二形态）', () => {
    const { hooks } = casterWorld();
    const e = Enemy.fromVanilla(32, 30 * 16, 56 * 16)!;
    expect(e.vanilla?.frames).toBe(6);                     // 表 6 帧 = 两套头饰 ×3
    // 状态直断（vy/ai1 驱动）
    e.vy = 0; e.ai1 = 0; expect(vanillaFrameIdx(e, 6)).toBe(0);
    e.ai1 = 20;                 expect(vanillaFrameIdx(e, 6)).toBe(1);   // 蓄力（含传送后 20t 后摇）
    e.ai1 = 0; e.vy = -3;       expect(vanillaFrameIdx(e, 6)).toBe(2);   // 腾空
    // RedHat 变体带 +3（本仓无红帽召唤链，手动置 lai3 模拟）
    e.lai3 = 1; e.vy = 0;       expect(vanillaFrameIdx(e, 6)).toBe(3);
    e.lai3 = 1; e.ai1 = 20;     expect(vanillaFrameIdx(e, 6)).toBe(4);
    e.lai3 = 0;
    // 实跑 400t（含传送/蓄力/腾空全程）帧集合 ⊆ {0,1,2}
    const seen = new Set<number>();
    for (let t = 0; t < 400; t++) {
      e.fixedUpdate(1 / 60, hooks as never);
      seen.add(vanillaFrameIdx(e, e.vanilla?.frames ?? 1));
    }
    expect([...seen].every((f) => f >= 0 && f <= 2)).toBe(true);
    expect(seen.has(1)).toBe(true);                        // 蓄力帧出现过（发射节奏健康）
  });

  it('同族核实：29/45/172/281-286/693 同三态；24 攻击带 4-9；533 攻击带 +8', () => {
    const { hooks } = casterWorld();
    for (const id of [29, 45, 172, 281, 283, 285, 693]) {
      const e = Enemy.fromVanilla(id, 30 * 16, 56 * 16)!;
      e.vy = 0; e.ai1 = 0; expect(vanillaFrameIdx(e, e.vanilla?.frames ?? 3), `idle ${id}`).toBe(0);
      e.ai1 = 20;          expect(vanillaFrameIdx(e, e.vanilla?.frames ?? 3), `charge ${id}`).toBe(1);
    }
    // 24 火妖：待机/行走 0-3 循环；蓄力 30→25 走攻击带 4-9（末帧 9 钳住）
    const imp = Enemy.fromVanilla(24, 30 * 16, 56 * 16)!;
    imp.vy = 0; imp.ai1 = 0;
    expect([0, 1, 2, 3]).toContain(vanillaFrameIdx(imp, 10));
    imp.ai1 = 30; expect(vanillaFrameIdx(imp, 10)).toBe(4);
    imp.ai1 = 26; expect(vanillaFrameIdx(imp, 10)).toBe(4 + Math.floor(4 / 6));
    imp.ai1 = 0;  expect(vanillaFrameIdx(imp, 10)).toBeLessThanOrEqual(3);
    void hooks;
    // 533 沙漠幽魂：带 8 切换
    const djinn = Enemy.fromVanilla(533, 30 * 16, 56 * 16)!;
    djinn.vy = 0; djinn.ai1 = 0; expect(vanillaFrameIdx(djinn, 16)).toBeLessThan(8);
    djinn.ai1 = 20;              expect(vanillaFrameIdx(djinn, 16)).toBeGreaterThanOrEqual(8);
  });
});

describe('黑暗魔法师 32：发射节奏与弹体', () => {
  it('每轮三连水球（ai[1]==25 出膛）：球种 33、伤 20、1HP、速 6、显形', () => {
    const { hooks } = casterWorld();
    const e = Enemy.fromVanilla(32, 30 * 16, 56 * 16)!;
    const ticks: number[] = [];
    for (let t = 1; t <= 520; t++) {
      e.fixedUpdate(1 / 60, hooks as never);
      if (hooks.shots.length > ticks.length) ticks.push(t);
    }
    // 开局 ai0=500 → 650 传送（t≈150）→ 100/200/200+100 蓄力 → 三球 ≈255/355/455
    expect(ticks.length).toBe(3);
    expect(hooks.shots.every((s) => s.vanillaId === 33)).toBe(true);   // 弹种：水球 33（非弹射体）
    const ball = hooks.shots[0];
    ball.fixedUpdate(1 / 60, hooks as never);                          // 首帧 AI：定速 + 显形修正
    expect(ball.def.damage).toBe(20);                                  // 伤害 20（经典档）
    expect(ball.hp).toBe(1);                                           // ProjectileNPC 不吃 lifeMax 下限
    expect(ball.spawnAlpha).toBe(0);                                   // 显形（原版恒隐形+尘迹，已登记偏差）
    const spd = Math.hypot(ball.vx, ball.vy);
    expect(spd).toBeCloseTo(6, 1);                                     // 直线速 6（wiki 31mph）
    // 节奏：三球间隔 100t（蓄力点间隔）
    expect(ticks[1] - ticks[0]).toBeGreaterThanOrEqual(95);
    expect(ticks[1] - ticks[0]).toBeLessThanOrEqual(105);
    expect(ticks[2] - ticks[1]).toBeGreaterThanOrEqual(95);
  });

  it('球体穿墙直飞 + 蓝尘迹/点光（bouncingBallAI 尘迹补偿）', () => {
    const { w, hooks } = casterWorld();
    // 球与玩家之间砌一堵实心墙：noTileCollide 应穿过
    for (let y = 50; y <= 59; y++) w.store.setTileSilent(35, y, 1);
    const ball = Enemy.fromVanilla(33, 30 * 16, 56 * 16)!;
    const x0 = ball.x;
    for (let t = 0; t < 60; t++) ball.fixedUpdate(1 / 60, hooks as never);
    expect(Math.abs(ball.x - x0)).toBeGreaterThan(100);                // 穿墙位移未受阻
    expect(hooks.dust).toBeGreaterThan(50);                            // 蓝尘迹持续产出
    expect(ball.lightRGB).toBeTruthy();                                // 补点光（尘 172 自发光近似）
  });

  it('受击打断（StrikeNPC :82061）：hit 后 ai[0]→400，后续 200t 无新球（在飞蓄力不撤，原版同）', () => {
    const { hooks } = casterWorld();
    const e = Enemy.fromVanilla(32, 30 * 16, 56 * 16)!;
    for (let t = 0; t < 262; t++) e.fixedUpdate(1 / 60, hooks as never);  // t≈255 第一球已出膛、ai1 归 0
    const shotsBefore = hooks.shots.length;
    expect(shotsBefore).toBe(1);
    expect(e.ai0).toBeGreaterThan(100);                                   // 已过第一蓄力点
    e.hurt(5, 8, 0, hooks as never);                                      // 受击
    expect(e.ai0).toBe(400);                                              // 蓄力点 200/300 被 400 跳过
    for (let t = 0; t < 200; t++) e.fixedUpdate(1 / 60, hooks as never);  // 400→600（<650 不传送）
    expect(hooks.shots.length).toBe(shotsBefore);                         // 无第二/第三球 = 本轮齐射被打断
  });
});

describe('黑暗魔法师 32：受击物理（重力回落）', () => {
  it('击退呈抛物线：短暂上升后回落站地，y 回到地面（不再持续上飘）', () => {
    const { hooks } = casterWorld();
    const e = Enemy.fromVanilla(32, 30 * 16, 56 * 16)!;
    for (let t = 0; t < 200; t++) e.fixedUpdate(1 / 60, hooks as never); // 落地站稳
    const groundY = e.y;
    e.hurt(5, 8, 0, hooks as never);                                     // 重路：vy<0 起跳
    expect(e.vy).toBeLessThan(0);                                        // 击退确有向上分量
    let minY = e.y, maxY = e.y;
    for (let t = 0; t < 120; t++) {
      e.fixedUpdate(1 / 60, hooks as never);
      minY = Math.min(minY, e.y); maxY = Math.max(maxY, e.y);
    }
    expect(minY).toBeLessThan(groundY - 4);                              // 上升段存在
    expect(maxY - minY).toBeLessThan(60);                                // 幅度受控（vy≈-2.2 → 峰值 ~8px）
    expect(e.onGround).toBe(true);                                       // 回落站地
    expect(Math.abs(e.y - groundY)).toBeLessThanOrEqual(2);
  });
});
