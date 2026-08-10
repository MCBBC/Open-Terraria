import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { runBeachDecorPass } from '../src/world/gen/vanilla/BeachPass';
import { TILE_BY_KEY, T } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

describe('海滩装饰 pass', () => {
  it('贝壳堆：沙面+灌水后应出现 v_495', () => {
    const st = new TileStore(600, 200);
    // 地表 y=100 实心，0..300 铺沙，其余泥土
    for (let x = 0; x < 600; x++) {
      for (let y = 100; y < 110; y++) {
        st.setTileSilent(x, y, x < 300 ? T.SAND : T.DIRT);
      }
      // 海水：x<300 列 y 60..99 灌满
      for (let y = 60; y < 100; y++) {
        if (x < 300) st.liquid[st.idx(x, y)] = 255;
      }
    }
    const gs = {
      worldSurface: 90, rockLevel: 130, beachLeftEnd: 300, beachRightStart: 300,
      dungeonSide: 1, dungeonLocation: 500, snowOriginLeft: 400, snowOriginRight: 500,
      beachLocations: [], pyramidX: -1, jungleX: 300, mushroomX: 400, marbleX: 350, graniteX: 450, desertX: 500,
      floatingIslandX: [], mountainCaves: [], hellFort: [],
    } as unknown as GenState;
    // 多次掷骰覆盖 50% 门
    for (let i = 0; i < 20; i++) {
      runBeachDecorPass(st, new RNG(1000 + i), gs);
    }
    const SHELL = TILE_BY_KEY['v_495_shell_pile_block']!;
    let shell = 0, seaweed = 0;
    const SEAWEED = TILE_BY_KEY['v_549_seaweed']!;
    for (let i = 0; i < st.type.length; i++) {
      if (st.type[i] === SHELL) shell++;
      if (st.type[i] === SEAWEED) seaweed++;
    }
    console.log('shell =', shell, 'seaweed =', seaweed);
    expect(shell).toBeGreaterThan(0);
    expect(seaweed).toBeGreaterThan(0);
  });
});
