// 克眼 P2 冲刺量化(诊断用,亦作回归):直接驱动 eocAI 逐 tick,
// 断言初速/摩擦起点/全程位移与原版 NPC.cs:20452-20534 一致
// (速 6.8 直设、40t 后 ×0.97、冲程 130t、理论位移 ≈ 6.8×40 + Σ_{k=1..90}6.8×0.97^k ≈ 487px)。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function mockGame(): GameHooks {
  return {
    world: {
      clock: { isDay: false },
      seedFlags: {},
      difficulty: 0, expertMode: false,
      w: 4200, h: 1200,
      store: { inBounds: () => true },
    },
    player: null,
    enemies: () => [],
    entities: { add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {},
    spawnDrop: () => null, cutTile: () => {},
    onEnemyKilled: () => {},
    damagePlayer: (): number => 0,
    spawnEnemy: () => {},
    critters: () => [],
    notifyInventoryChanged: () => {},
  } as unknown as GameHooks;
}

const playerMock = { x: 2000, y: 1000, w: 20, h: 42, cx: 2010, cy: 1021, vx: 0, vy: 0, dead: false };

describe('EoC P2 冲刺量化(vs NPC.cs:20452-20534)', () => {
  it('经典档:初速 6.8、40t 恒速、40t 后 ×0.97、130t 收冲、全程位移 ≈487px', () => {
    const g = mockGame();
    const e = Enemy.fromVanilla(5, 1600, 1000)!;
    e.ai0 = 3;                 // 直接 P2
    e.state = 1;               // 冲刺预备
    e.ai2 = 0;
    const ai = (e as unknown as { eocAI: (g: GameHooks, p: unknown) => void }).eocAI.bind(e);
    const x0 = e.x, y0 = e.y;
    let maxSpd = 0, spdAt: number[] = [];
    for (let t = 0; t < 130; t++) {
      ai(g, playerMock);
      if (t === 0) {
        const s0 = Math.hypot(e.vx, e.vy);
        expect(s0).toBeCloseTo(6.8, 2);            // 初速直设 6.8(:20456)
        expect(e.state).toBe(2);
      }
      if (t < 3 || t === 39 || t === 40 || t === 41) spdAt.push(Math.hypot(e.vx, e.vy));
      maxSpd = Math.max(maxSpd, Math.hypot(e.vx, e.vy));
    }
    // 40t 内恒速(无摩擦);41t 起每次 ×0.97
    expect(spdAt[1]).toBeCloseTo(6.8, 2);
    expect(spdAt[2]).toBeCloseTo(6.8, 2);
    expect(spdAt[3]).toBeCloseTo(6.8, 2);
    const after40 = spdAt[4];                      // t=40 第一次摩擦后
    expect(after40).toBeCloseTo(6.8 * 0.97, 2);
    // 收冲回悬浮(:20518 ai[3]>=3 是第三次冲后;单次冲程满 130t → state 1 再冲)
    const disp = Math.hypot(e.x - x0, e.y - y0);
    // 理论:40t×6.8 + Σ_{k=1}^{90} 6.8×0.97^k ≈ 272 + 215 = 487
    expect(disp).toBeGreaterThan(440);
    expect(disp).toBeLessThan(520);
    expect(e.state === 1 || e.state === 2).toBe(true);   // 冲程尽 → 再冲预备
  });

  it('P1 冲刺初速 6(经典,:20151-20159)', () => {
    const g = mockGame();
    const e = Enemy.fromVanilla(4, 1600, 1000)!;
    e.ai0 = 0; e.state = 1; e.ai2 = 0;
    const ai = (e as unknown as { eocAI: (g: GameHooks, p: unknown) => void }).eocAI.bind(e);
    ai(g, playerMock);
    expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(6, 2);
  });

  it('★真实派发路径:fixedUpdate 全链驱动 id 4(aiStyle 4 → case 4)冲刺不缩水', () => {
    const g = mockGame();
    (g as unknown as { player: unknown }).player = playerMock;
    const e = Enemy.fromVanilla(4, 1600, 1000)!;
    e.ai0 = 3; e.state = 1; e.ai2 = 0;   // P2 冲刺预备
    const x0 = e.x, y0 = e.y;
    for (let t = 0; t < 130; t++) e.fixedUpdate(1, g);
    const disp = Math.hypot(e.x - x0, e.y - y0);
    // 与直调 eocAI 同档:440..520(若 fixedUpdate 链有二次衰减/干扰会显著缩水)
    expect(disp).toBeGreaterThan(440);
    expect(disp).toBeLessThan(520);
    expect(e.state === 1 || e.state === 2).toBe(true);
  });
});
