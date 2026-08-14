// 巨石 2×2 多格对象回归(用户档实证:陷阱只清 1 格 → 3/4 贴图残留"左下缺块"
// + 弹 99 嵌残余实心格即刻碎裂"没有巨石落下"):
// 触发致动支撑时须锚定归一 → 清 4 格(走 setTile) → 锚点生成 1 颗弹。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';

const BOULDER = TILE_BY_KEY['v_138_boulder'];

describe('巨石 2×2 整对象清除', () => {
  it('清 4 格 + 单弹锚点生成;触发非锚格也能归一', () => {
    const w = new World(60, 60, 30, 'open');
    const st = w.store;
    // 2×2 巨石(帧步 18)+ 下方支撑
    st.setTileSilent(30, 40, BOULDER, 0, 0);
    st.setTileSilent(31, 40, BOULDER, 18, 0);
    st.setTileSilent(30, 41, BOULDER, 0, 18);
    st.setTileSilent(31, 41, BOULDER, 18, 18);
    st.setTileSilent(30, 42, 1, 0, 0);   // 支撑
    const wr = new Wiring(st, 40);
    const calls: Array<[number, number]> = [];
    wr.boulderFall = (x, y) => { calls.push([x, y]); };
    // 走真实入口:支撑块带致动器位 → actuate(30,42) 触发缩入+巨石钩子
    st.wire[st.idx(30, 42)] = TileStore.WIRE_ACTUATOR;
    wr.actuate(30, 42);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual([30, 40]);                     // 锚点
    for (const [x, y] of [[30, 40], [31, 40], [30, 41], [31, 41]]) {
      expect(st.type[st.idx(x, y)]).toBe(0);                // 整对象清除
    }
  });
});
