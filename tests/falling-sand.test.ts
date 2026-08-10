// 下落沙族回归(原版 SandBallFalling 系,AI_010):
// 失去支撑 → FallingBlock 坠落(重力 0.3/tick)→ 落地变回 tile;命中实体 10 伤害。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { FallingBlock } from '../src/entities/FallingBlock';
import type { GameHooks } from '../src/entities/types';

function makeGame(): { game: GameHooks; world: World; dmg: number[] } {
  const world = new World(64, 32, 42, '测试');
  const dmg: number[] = [];
  const game = {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (d: number) => { dmg.push(d); },
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
  } as unknown as GameHooks;
  return { game, world, dmg };
}

describe('FallingBlock', () => {
  it('坠落并在实心格上变回沙块 tile', () => {
    const { game, world } = makeGame();
    // 地面在 y=20;沙块从 y=16 开始坠
    world.store.setTile(32, 20, TILE_BY_KEY['dirt']!, 0, 0);
    const SAND = TILE_BY_KEY['sand']!;
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    // 落地点:y=20 实心 → 放 y=19
    expect(world.store.get(32, 19)).toBe(SAND);
  });

  it('穿过空隙落到更低地面', () => {
    const { game, world } = makeGame();
    world.store.setTile(33, 24, TILE_BY_KEY['stone']!, 0, 0);
    const fb = new FallingBlock(33 * 16 + 3, 10 * 16 + 3, 'sand');
    for (let i = 0; i < 240; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(33, 23)).toBe(TILE_BY_KEY['sand']!);
  });

  it('命中玩家:10 伤害且每块只结算一次', () => {
    const { game, dmg } = makeGame();
    const player = { x: 32 * 16, y: 10 * 16, w: 20, h: 42, dead: false } as never;
    (game as unknown as { player: unknown }).player = player;
    const fb = new FallingBlock(32 * 16 + 3, 10 * 16 + 3, 'sand');
    fb.fixedUpdate(1 / 60, game);
    fb.fixedUpdate(1 / 60, game);
    expect(dmg).toEqual([FallingBlock.DAMAGE]);
  });
});
