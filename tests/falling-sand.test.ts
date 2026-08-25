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
  /** 清空列段（世界为带种子真实地形,断言列须排除生成残留） */
  const clearCol = (w: World, x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) w.store.setTile(x, y, 0, 0, 0);
  };

  it('坠落并在实心格上变回沙块 tile（原版:放置格=弹回后中心格=实心上方空格）', () => {
    const { game, world } = makeGame();
    // 地面在 y=20;沙块从 y=16 开始坠
    clearCol(world, 32, 10, 19);
    world.store.setTile(32, 20, TILE_BY_KEY['dirt']!, 0, 0);
    const SAND = TILE_BY_KEY['sand']!;
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    // 原版 Kill aiStyle==10（Projectile.cs:79117-79310）:TileCollision 把弹体挡在
    // 实心外,Kill 时中心格=实心上方空格 → PlaceTile 成功=下落沙【重新堆起】。
    // ★修正史:初版"向上扫空位"悬空叠草(2026-08-24 用户报)→二版过度修正成
    // "永不落格"（本测试旧断言即其产物）;2026-08-25 按上一帧中心格落格=原版语义。
    expect(world.store.get(32, 19)).toBe(SAND);
    expect(world.store.get(32, 20)).toBe(TILE_BY_KEY['dirt']!);
  });

  it('穿过空隙落到更低地面', () => {
    const { game, world } = makeGame();
    clearCol(world, 33, 10, 23);
    world.store.setTile(33, 24, TILE_BY_KEY['stone']!, 0, 0);
    const fb = new FallingBlock(33 * 16 + 3, 10 * 16 + 3, 'sand');
    for (let i = 0; i < 240; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(33, 23)).toBe(TILE_BY_KEY['sand']!);
    expect(world.store.get(33, 24)).toBe(TILE_BY_KEY['stone']!);
  });

  it('落点格被占（草苗）→ 不放置直接消失（原版 !active 门,Projectile.cs:79248）', () => {
    const { game, world } = makeGame();
    clearCol(world, 32, 10, 18);
    world.store.setTile(32, 20, TILE_BY_KEY['dirt']!, 0, 0);
    world.store.setTile(32, 19, TILE_BY_KEY['v_3_forest_short_plants']!, 0, 0);   // 草苗占据落点格（★本仓 id 域,勿用原版 3=本仓草块）
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(32, 19)).toBe(TILE_BY_KEY['v_3_forest_short_plants']!); // 草苗原样
    expect(world.store.get(32, 18)).toBe(0);            // 无悬空叠放
    expect(world.store.get(32, 20)).toBe(TILE_BY_KEY['dirt']!);
  });

  it('平台落格门（BlockBelowMakesSandFall,WorldGen.cs:87868）:平台下悬空 → 不放', () => {
    const { game, world } = makeGame();
    clearCol(world, 32, 10, 19);
    world.store.setTile(32, 20, TILE_BY_KEY['platform']!, 0, 0);   // 平台,下方全空
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(32, 19)).toBe(0);   // 平台下悬空:放置即再落 → 原版不放
    expect(world.store.get(32, 20)).toBe(TILE_BY_KEY['platform']!);
  });

  it('命中玩家:EVP 链经典 20（基础 10×乘区1×2）且每块只结算一次', () => {
    const { game, dmg } = makeGame();
    const player = { x: 32 * 16, y: 10 * 16, w: 20, h: 42, dead: false } as never;
    (game as unknown as { player: unknown }).player = player;
    const fb = new FallingBlock(32 * 16 + 3, 10 * 16 + 3, 'sand');
    fb.fixedUpdate(1 / 60, game);
    fb.fixedUpdate(1 / 60, game);
    // 2026-08-21 缺口类清偿：Damage_EVP（Projectile.cs:13770-13781）难度乘区×通用×2
    expect(dmg).toEqual([FallingBlock.DAMAGE * 2]);
  });
});
