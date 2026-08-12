// 箭矢图块碰撞回归:阻挡只看实心(Main.tileSolid 语义)——
// 树干 solid:false 不挡箭(曾 tileType!==0 一刀切,箭被树挡住),实心块照常挡。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

function makeGame(): { game: GameHooks; world: World } {
  const world = new World(64, 32, 42, '测试');
  const game = {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
  } as unknown as GameHooks;
  return { game, world };
}

describe('箭矢穿过非实心图块', () => {
  it('树干(solid:false)不阻挡,箭继续飞行', () => {
    const { game, world } = makeGame();
    const TREE = TILE_BY_KEY['tree']!;
    expect(TILE_DEFS[TREE].solid).toBe(false);
    // 树干格在 (32, 16),箭水平飞入
    world.store.setTile(32, 16, TREE, 0, 0);
    const arrow = new Arrow(32 * 16 - 12, 16 * 16 + 3, 6, 0, 10, 0, 1, VANILLA_ITEM_KEY_BY_ID[40]);
    for (let i = 0; i < 6; i++) arrow.fixedUpdate(1 / 60, game);
    // 穿过后应存活且已越过树格
    expect(arrow.dead).toBe(false);
    expect(arrow.x).toBeGreaterThan(32 * 16 + 16);
  });

  it('实心块(泥土)照常阻挡并销毁箭', () => {
    const { game, world } = makeGame();
    const DIRT = TILE_BY_KEY['dirt']!;
    expect(TILE_DEFS[DIRT].solid).toBe(true);
    world.store.setTile(32, 16, DIRT, 0, 0);
    const arrow = new Arrow(32 * 16 - 12, 16 * 16 + 3, 6, 0, 10, 0, 1, VANILLA_ITEM_KEY_BY_ID[40]);
    for (let i = 0; i < 6; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.dead).toBe(true);
  });
});
