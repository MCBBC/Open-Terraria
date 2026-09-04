// SW-AE1 2026-09-04：Prime 四臂发射相位模型——aiT 取模退役,改 localAI[0] 连续计数器 crossing
// （1457:28722/28838-41/28918-21 炮 128、28958/29074-77/29153-56 激光 131;态门复位:炮 1100f/300f 门、激光 200f 门清零,★激光 800f 门不清零=相位跨态保留）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { primePartAI, laserArmShotInterval } from '../src/entities/bossAI';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

function mk(id: number) {
  const g = { world: new World(80, 60, 30, 'open'), player: null, critters: () => [],
    enemies: () => [] as unknown[], entities: { nextId: 1, add: () => {} },
    spawnDust: () => null, spawnParticles: () => {} } as unknown as GameHooks;
  const head = Enemy.fromVanilla(127, 640, 300)!; head.id = 7;
  const arm = Enemy.fromVanilla(id, 640, 300)!;
  arm.id = 8; arm.ai1 = 7; arm.ai0 = 1; arm.ai2 = 0; arm.ai3 = 0;
  (g as { enemies: () => unknown[] }).enemies = () => [head];
  let total = 0;
  (g as unknown as { entities: { add: (en: unknown, b: string) => void } }).entities.add =
    (en: unknown, bucket: string) => { if (bucket === 'projectiles') total++; };
  const player = { x: 690, y: 679, w: 20, h: 42, cx: 700, cy: 700, vx: 0, vy: 0, dead: false } as unknown as Player;
  // aiT 恒 0:旧取模模型会每拍齐射 → 每条断言兼作取模退役证伪门
  const run = (n: number) => {
    const out: number[] = [];
    for (let t = 0; t < n; t++) { const before = total; primePartAI(arm, g, player); if (total > before) out.push(t); }
    return out;
  };
  return { head, arm, run };
}

describe('SW-AE1：Prime 发射相位计数器（crossing 序列/态切换相位保留/四臂面）', () => {
  it('炮 128 悬停 crossing:常态 141t、头旋冲 +3/t → 47t（steady 与 SW-X1 钉值同源）', () => {
    expect(mk(128).run(145)).toEqual([140]);               // lai0 1..141 首中 >140f
    const b = mk(128); b.head.ai1 = 1;
    expect(b.run(100)).toEqual([46, 93]);                  // 3,6,…,141,…,282
  });
  it('激光 131 crossing:常态 201t、头旋冲 +4/t → 51t、detached 81t;与 SW-Z1 钉值互证', () => {
    expect(mk(131).run(205)).toEqual([200]);
    const b = mk(131); b.head.ai1 = 1;
    expect(b.run(105)).toEqual([50, 101]);                 // 4k>200 首中 k=51
    const c = mk(131); c.arm.ai2 = 1;
    expect(c.run(85)).toEqual([80]);
    expect(laserArmShotInterval(false, false)).toBe(201);  // 钉值 = 模型 steady 涌现
    expect(laserArmShotInterval(true, false)).toBe(51); expect(laserArmShotInterval(false, true)).toBe(81);
  });
  it('态切换相位保留:旋冲切回自中间值续走;炮门清零/激光 800f 门不清零', () => {
    const a = mk(128); a.head.ai1 = 1; a.run(30); a.head.ai1 = 0;
    expect(a.run(51)).toEqual([50]);                       // lai0=90（+3/t）→141 crossing(取模=全局倍数拍)
    const b = mk(128); b.head.ai1 = 1; b.run(30); b.arm.ai3 = 1099; b.head.ai1 = 0;
    expect(b.run(45)).toEqual([40]);                       // 次拍 1100f 门:清零+切 detached→门拍 ++→1,41t 后 >40f(不清零=50)
    const c = mk(131); c.head.ai1 = 1; c.run(10); c.arm.ai3 = 799; c.head.ai1 = 0;
    expect(c.run(45)).toEqual([40]);                       // lai0=40（+4/t）,800f 门仅切态不清零→41..81 自中间值续走(复位模型=80)
    const d = mk(131); d.head.ai1 = 1; d.run(30); d.arm.ai3 = 799; d.head.ai1 = 0;
    expect(d.run(3)).toEqual([1]);                         // lai0=120 已超 detached 阈:相位带入阈值上→首拍即 crossing
  });
  it('四臂发射面:锯 129/钳 130 近战无弹(600t);发射臂=炮 128/激光 131 两条', () => {
    expect(mk(129).run(600)).toEqual([]);
    expect(mk(130).run(600)).toEqual([]);
  });
});
