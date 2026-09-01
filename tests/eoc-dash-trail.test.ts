// EoC 二阶段冲刺拖影(残影)链路回归(2026-09-01 用户报"没有冲刺拖影"):
// 残影门 = Renderer:6192 `vanillaId===4 && ai0===3 && state>=4`(Main.cs:26359
// `ai[1] >= 4f && ai[0] == 3f`)——只盖【专家预测连冲档】(state 3→4)与悬下方
// 回冲(state 5);经典档 3 连冲在 state 1/2 循环,**原版经典即无残影**。
// 本测驱动真 eocAI 状态机:专家链必须走到 state≥4(残影门触发)且历史轨迹已填;
// 经典链同 tick 数下不得进入 state≥4(=原版行为,防误加)。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';

function makeGame(difficulty: number) {
  const w = 128, h = 128;
  return {
    world: {
      w, h,
      difficulty,
      flags: {} as Record<string, boolean>,
      clock: { isDay: false },
      lavaLine: 0,
      store: {
        w, h,
        type: new Uint16Array(w * h), flags: new Uint8Array(w * h),
        wall: new Uint16Array(w * h), liquid: new Uint8Array(w * h),
        slope: new Uint8Array(w * h), half: new Uint8Array(w * h),
        idx: (x: number, y: number) => y * w + x,
        inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
        isSolid: () => false,
        isActive: () => false,
        get: () => 0,
      },
    },
    player: { dead: false, cx: 40 * TILE, cy: 30 * TILE, x: 40 * TILE - 10, y: 30 * TILE - 21, w: 20, h: 42, vx: 0, vy: 0 },
    vanillaDust: { spawn: () => null },
    spawnDust: () => null,
    spawnParticles: () => {},
    playSfx: () => {},
    playSfxWav: () => {},
    playSfxFiles: () => {},
    sfxAt: () => {},
    enemies: () => [],
    cutTile: () => {},
    breakTile: () => {},
    damagePlayer: (): number => 0,
    hurtNPC: () => {},
    newText: () => {},
    entities: { add: () => {} },
  };
}

describe('EoC P2 冲刺残影链路(Main.cs:26359 门 = ai0==3 && ai1>=4)', () => {
  it('专家:经典 3 连冲后 hp<50% → 预测连冲链进入 state 4(残影门触发),历史轨迹≥6', () => {
    const game = makeGame(1);   // expert
    const e = Enemy.fromVanilla(4, 32 * TILE, 20 * TILE)!;
    e.ai0 = 3; e.state = 2; e.ai2 = 0; e.chargesLeft = 0;   // 经典首冲进行中
    e.hp = e.maxHp * 0.4;                                    // <50% → 预测链入口
    let saw4 = false;
    for (let i = 0; i < 600 && !saw4; i++) {
      e.fixedUpdate(1 / 60, game as never);
      if (e.ai0 === 3 && e.state >= 4) saw4 = true;
    }
    expect(saw4).toBe(true);                                 // 残影门触发
    expect(e.ai0).toBe(3);
    expect(e.state).toBeGreaterThanOrEqual(4);
    expect(e.historyDepth()).toBeGreaterThan(5);             // oldPos 历史已填(9 层鬼影数据源)
  });

  it('经典:同 tick 数下 state 永不 ≥4(原版经典无残影——防误加)', () => {
    const game = makeGame(0);   // classic
    const e = Enemy.fromVanilla(4, 32 * TILE, 20 * TILE)!;
    e.ai0 = 3; e.state = 0; e.ai2 = 0; e.chargesLeft = 0;
    let saw4 = false;
    for (let i = 0; i < 1200; i++) {
      e.fixedUpdate(1 / 60, game as never);
      if (e.ai0 === 3 && e.state >= 4) saw4 = true;
    }
    expect(saw4).toBe(false);
    expect(e.ai0).toBe(3);   // 仍在 P2(未误转换)
  });
});
