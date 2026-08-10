// drop:null 语义回归:显式无掉落的图块(原版装饰类,如 165 冰凌/蜘蛛巢卵袋)
// 曾因 breakTileAt/breakTile 用 ?? 把 null 也走 place_v_ 兜底,挖蜘蛛巢掉出"冰凌"物品。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('drop:null = 显式无掉落', () => {
  it('v_165_cave_decos(蜘蛛巢卵袋/冰凌帧)破坏不掉落', () => {
    const world = new World(64, 32, 42, '测试');
    const tile = TILE_BY_KEY['v_165_cave_decos']!;
    world.store.setTile(32, 16, tile, 144, 0);
    expect(world.breakTileAt(32, 16)).toBeNull();
  });

  it('普通图块掉落不受影响(dirt → dirt_block)', () => {
    const world = new World(64, 32, 42, '测试');
    world.store.setTile(32, 16, TILE_BY_KEY['dirt']!, 0, 0);
    expect(world.breakTileAt(32, 16)).toBe('dirt_block');
  });
});
