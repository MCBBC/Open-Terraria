import { describe, it, expect } from 'vitest';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { T, W } from '../src/data/tiles';

describe('自有存档格式', () => {
  it('RLE 编解码往返一致', () => {
    const world = new World(64, 32, 42, '测试');
    world.spawnX = 30; world.spawnY = 10;
    const st = world.store;
    // 造点数据：地面 + 洞 + 火把 + 液体 + 墙
    for (let x = 0; x < 64; x++) {
      for (let y = 20; y < 32; y++) st.setTileSilent(x, y, y > 26 ? T.STONE : T.DIRT);
      st.setTileSilent(x, 18, T.TORCH, 0, 0);
      st.setWallSilent(x, 24, W.STONE);
    }
    st.setTileSilent(10, 21, 0);
    st.setTileSilent(10, 22, 0);
    st.setLiquid(10, 22, 255, 1);
    world.chests.push({ x: 5, y: 5, items: [{ id: ITEM_BY_KEY['torch'], stack: 3 }, null] });

    const inv = new Inventory();
    inv.add(ITEM_BY_KEY['dirt_block'], 77);
    const player = new Player(100, 100, inv);
    player.hp = 88;

    const json = saveGame(world, player, 1234);
    const back = loadSave(json);

    expect(back.world.w).toBe(64);
    expect(back.world.h).toBe(32);
    expect(back.world.store.get(0, 20)).toBe(T.DIRT);
    expect(back.world.store.get(0, 27)).toBe(T.STONE);
    expect(back.world.store.get(0, 18)).toBe(T.TORCH);
    expect(back.world.store.get(10, 21)).toBe(0);
    expect(back.world.store.liquid[st.idx(10, 22)]).toBe(255);
    expect(back.world.store.wall[st.idx(0, 24)]).toBe(W.STONE);
    expect(back.world.chests).toHaveLength(1);
    expect(back.world.chests[0].items[0]?.stack).toBe(3);
    expect(back.player.hp).toBe(88);
    expect(back.player.inventory[0]?.stack).toBe(77);
  });

  it('存档体积可控', () => {
    const world = new World(4200, 1200, 1, '大世界');
    const st = world.store;
    for (let x = 0; x < st.w; x++) {
      for (let y = 0; y < st.h; y++) {
        st.setTileSilent(x, y, y > 500 ? T.STONE : (y > 300 ? T.DIRT : 0));
      }
    }
    const json = saveGame(world, new Player(0, 0, new Inventory()), 0);
    // 大世界规则地形应在数百 KB 量级（base64 会膨胀 ~1.33x）
    expect(json.length).toBeLessThan(8 * 1024 * 1024);
  });
});
