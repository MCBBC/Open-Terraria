// BJ68（2026-09-14）bossHeadRotation ai 门守卫（RB16 遗留债）：
// 原版 GetBossHeadRotation（NPC.cs:7636-7650）：68/262 → rotation 恒透传；
// 35/127 仅 ai[1]∈{1,2}（旋冲/白天狂暴）取 rotation（悬浮态 tilt=vx/15 不上头）；
// 345（冰雪女王）仅 ai[0]==2（自旋环射态,NPC.cs:33935 rotation+=0.2）取 rotation。
// 此前本仓函数对 35/127/345 输入无感恒 0——接门后：
//   · 单元面：态翻转断言（ai1/ai0 翻转 → rotation 放行/归零）
//   · 行为面：skeletronBossAI(35) mode0→1 翻转拍 rot 0→spin（ai2 直拨 799 加速翻转）
//   · 行为面：iceQueenAI(345) ai0=0→2 翻转拍 rot 0→visAngle
//   · 结构锁：Renderer 调用点传 ai1/ai0 + 345 visAngle 载体支
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bossHeadRotation } from '../src/data/vanillaNpcs';
import { Enemy } from '../src/entities/Enemy';
import { skeletronBossAI } from '../src/entities/bossAI';
import { iceQueenAI } from '../src/entities/bossAI_moon_events';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';

const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');

describe('BJ68 bossHeadRotation 单元门（NPC.cs:7636-7650 逐 case）', () => {
  it('①68/262 恒透传（不受 ai 门影响）', () => {
    expect(bossHeadRotation(68, 1.234, 0, 0)).toBeCloseTo(1.234, 9);
    expect(bossHeadRotation(262, -0.5, 0, 0)).toBeCloseTo(-0.5, 9);
  });

  it('②35/127 态翻转断言:ai1∈{1,2} 放行,其余归 0', () => {
    for (const id of [35, 127]) {
      expect(bossHeadRotation(id, 1.234, 0, 0)).toBe(0);   // 悬浮 tilt 态不上头
      expect(bossHeadRotation(id, 1.234, 1, 0)).toBeCloseTo(1.234, 9);  // 旋冲
      expect(bossHeadRotation(id, 1.234, 2, 0)).toBeCloseTo(1.234, 9);  // 白天狂暴
      expect(bossHeadRotation(id, 1.234, 3, 0)).toBe(0);   // 离场
      expect(bossHeadRotation(id, 1.234)).toBe(0);         // 缺省参=无态→0（RB16 test⑤ 语义保留）
    }
  });

  it('③345 态翻转断言:ai0==2 放行,其余归 0', () => {
    expect(bossHeadRotation(345, 1.234, 0, 0)).toBe(0);
    expect(bossHeadRotation(345, 1.234, 0, 1)).toBe(0);    // 压制落冰态
    expect(bossHeadRotation(345, 1.234, 0, 2)).toBeCloseTo(1.234, 9);  // 自旋环射
    expect(bossHeadRotation(345, 1.234, 0, -1)).toBe(0);   // 重选态
  });

  it('④域外 id 恒 0', () => {
    expect(bossHeadRotation(4, 1.234, 2, 2)).toBe(0);
    expect(bossHeadRotation(344, 1.234, 0, 2)).toBe(0);    // 344 另一 boss 无门
  });
});

describe('BJ68 行为面:35 骷髅王旋冲翻转拍地图头放行（ai2 直拨 799 加速）', () => {
  it('mode0 悬浮期 spin≠0 但 rot=0;mode1 旋冲期 rot=spin', () => {
    const w = new World(120, 120, 7, 'bj68b');
    w.clock.timeOfDay = 21 / 24;                            // 夜（isDay=false 防白天狂暴截胡）
    for (let x = 0; x < 120; x++) { w.store.setTile(x, 100, 1); w.store.setTile(x, 101, 1); w.store.setTile(x, 102, 1); }
    const e = Enemy.fromVanilla(35, 60 * TILE, 60 * TILE)!;
    e.bInit = true;                                         // 跳过双手生成（渲染面无关）
    const game = {
      world: w,
      player: { cx: 62 * TILE, cy: 60 * TILE, x: 62 * TILE, y: 60 * TILE, w: 16, h: 28, hp: 100, maxHp: 100, dead: false, aabbOverlaps: () => false },
      playSfx: () => {},
      damagePlayer: (): number => 0,
      spawnParticles: () => {},
      enemies: () => [],
    } as never;
    for (let i = 0; i < 6; i++) e.fixedUpdate(1 / 60, game);   // mode0: vx 累积 → spin=vx/15≠0
    expect(e.ai1).toBe(0);
    expect(e.spin).not.toBe(0);                              // 悬浮 tilt 在写 spin
    expect(bossHeadRotation(35, e.spin, e.ai1, e.ai0)).toBe(0);   // ★门:不上头
    e.ai2 = 799;                                             // :22011-22015 悬浮计时直拨
    skeletronBossAI(e, game, (game as { player: unknown }).player as never);   // 一拍翻转 ai1=1
    expect(e.ai1).toBe(1);
    expect(e.spin).not.toBe(0);
    expect(bossHeadRotation(35, e.spin, e.ai1, e.ai0)).toBe(e.spin);   // ★旋冲态放行
  });
});

describe('BJ68 行为面:345 冰雪女王自旋翻转拍地图头放行', () => {
  it('ai0=0 滑翔期 rot=0;ai0=2 自旋期 rot=visAngle（visAngle+=0.2 支）', () => {
    const w = new World(120, 120, 7, 'bj68c');
    w.clock.timeOfDay = 21 / 24;                            // 夜（白天分支直接飞离提前 return）
    const e = Enemy.fromVanilla(345, 60 * TILE, 60 * TILE)!;   // 不设 bInit→AI 自身 init ai0..3=0
    const player = { cx: 62 * TILE, cy: 60 * TILE, x: 62 * TILE, y: 60 * TILE, w: 16, h: 28, hp: 100, maxHp: 100, dead: false, aabbOverlaps: () => false };
    const game = { world: w, player, playSfx: () => {}, damagePlayer: (): number => 0, spawnParticles: () => {} } as never;
    iceQueenAI(e, game, player as never);                    // ai0=0 滑翔:visAngle=vx*0.05
    expect(e.ai0).toBe(0);
    e.ai0 = 2; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    iceQueenAI(e, game, player as never);                    // 自旋态:visAngle += 0.2
    expect(Math.abs(e.visAngle)).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(bossHeadRotation(345, e.visAngle, e.ai1, e.ai0)).toBe(e.visAngle);
    e.ai0 = 1;
    expect(bossHeadRotation(345, e.visAngle, e.ai1, e.ai0)).toBe(0);   // 非自旋态归 0
  });
});

describe('BJ68 结构锁:Renderer 调用点', () => {
  it('传 ai1/ai0 态 + 345 visAngle 载体支（勿回退恒 spin 或恒 0）', () => {
    expect(rendererSrc).toMatch(/const ex = e as unknown as \{ spin\?: number; visAngle\?: number; ai0\?: number; ai1\?: number \}/);
    expect(rendererSrc).toMatch(/vid === 345\s*\?\s*bossHeadRotation\(vid, ex\.visAngle \?\? 0, 0, ex\.ai0 \?\? 0\)/);
    expect(rendererSrc).toMatch(/bossHeadRotation\(vid, ex\.spin \?\? 0, ex\.ai1 \?\? 0, ex\.ai0 \?\? 0\)/);
  });
});
