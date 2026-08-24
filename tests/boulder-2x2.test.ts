// 巨石 2×2 多格对象回归(R20-I4 复核定谳后重写):
// 原版 DeActive(Wiring.cs:3208-3236)无巨石逻辑——致动缩入支撑【不清】巨石、
// 【不生成】弹 99(Check2x2 失撑判据 WorldGen.cs:48937-48944 不含 inActive 位)。
// 巨石→弹 99 的唯一通道 = 支撑被真实破坏(Game.breakTile spawnBoulderRoll,
// tests/multi-tile-drop.test.ts 覆盖弹种表;整对象 4 格清除语义同在彼链)。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';

const BOULDER = TILE_BY_KEY['v_138_boulder'];

describe('巨石 2×2 整对象(致动不构成失撑,R20-I4)', () => {
  it('致动支撑 → 巨石 2×2 四格原样保留、零弹体零清格', () => {
    const w = new World(60, 60, 30, 'open');
    const st = w.store;
    // 2×2 巨石(帧步 18)+ 下方支撑
    st.setTileSilent(30, 40, BOULDER, 0, 0);
    st.setTileSilent(31, 40, BOULDER, 18, 0);
    st.setTileSilent(30, 41, BOULDER, 0, 18);
    st.setTileSilent(31, 41, BOULDER, 18, 18);
    st.setTileSilent(30, 42, 1, 0, 0);   // 支撑
    const wr = new Wiring(st);
    // 走真实入口:支撑块带致动器位 → actuate(30,42)
    st.wire[st.idx(30, 42)] = TileStore.WIRE_ACTUATOR;
    wr.actuate(30, 42);
    expect(st.isActuated(30, 42)).toBe(true);               // 支撑已缩入
    for (const [x, y] of [[30, 40], [31, 40], [30, 41], [31, 41]] as Array<[number, number]>) {
      expect(st.type[st.idx(x, y)]).toBe(BOULDER);          // 整对象原样保留
      expect(st.flags[st.idx(x, y)]).not.toBe(0);
    }
  });
});
