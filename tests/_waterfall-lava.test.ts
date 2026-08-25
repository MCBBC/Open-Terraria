import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_BY_KEY } from '../src/data/tiles';

// 复现用户场景:水从岩浆池正上方瀑布式倾泻 → 接触面应生成黑曜石
describe('瀑布水×岩浆 黑曜石生成（用户实报）', () => {
  it('自由落体水柱接触岩浆面 → 黑曜石', () => {
    const w = new World(120, 90, 42, 'wf-test');
    const st = w.store;
    const OBS = TILE_BY_KEY['obsidian'];
    // 地面 y=80 实心（池底保留!）;岩浆池 (70-150, 79) 坐地面上
    for (let x = 5; x < 115; x++) st.setTileSilent(x, 80, 1);
    for (let x = 70; x <= 150; x++) {
      st.liquid[st.idx(x, 79)] = 255;
      st.liquidType[st.idx(x, 79)] = 2;     // 岩浆
    }
    // 左侧高台 y=50 (x 20-70) 实心,上覆水 (y=49)
    for (let x = 20; x <= 70; x++) st.setTileSilent(x, 50, 1);
    for (let x = 25; x <= 68; x++) {
      st.liquid[st.idx(x, 49)] = 255;
      st.liquidType[st.idx(x, 49)] = 1;
    }
    // 打开高台右缘 x=70 → 水从 (70,49) 落下;岩浆池左缘 x=100——水落点在 (70..99, 51..79)
    // 地面 → 先横流? 为对齐用户场景(落点=岩浆面),把岩浆池左缘扩到 x=70
    for (let x = 70; x <= 150; x++) {
      st.liquid[st.idx(x, 79)] = 255;
      st.liquidType[st.idx(x, 79)] = 2;
    }
    const sim = new LiquidSim(w);
    // 液体入活动列表（直写 store 不入列=永不更新）
    for (let y = 0; y < 90; y++) for (let x = 0; x < 120; x++) {
      if (st.liquid[st.idx(x, y)] > 0) sim.addWater(x, y);
    }
    sim.step();
    // 跑 600 tick 模拟
    for (let t = 0; t < 600; t++) {
      sim.step();
      if (t % 100 === 0 || t === 5 || t === 20 || t === 50) {
        const col: string[] = [];
        for (let y = 45; y < 82; y++) {
          const i = st.idx(72, y);
          if (st.liquid[i] > 0) col.push(`${y}:${st.liquidType[i]}×${st.liquid[i]}`);
        }
        const i780 = st.idx(72, 78), i790 = st.idx(72, 79);
        console.log(`t=${t} col@x72=[${col.join(',')}] (72,78)=${st.liquidType[i780]}×${st.liquid[i780]} (72,79)=${st.liquidType[i790]}×${st.liquid[i790]} tile(72,79)=${st.type[i790]}`);
      }
    }
    // 统计黑曜石
    let obs = 0;
    const obsPos: string[] = [];
    for (let y = 0; y < 90; y++) for (let x = 0; x < 120; x++) {
      if (st.type[st.idx(x, y)] === OBS) { obs++; if (obsPos.length < 6) obsPos.push(`(${x},${y})`); }
    }
    console.log('obsidian count:', obs, 'at', obsPos.join(' '));
    // 岩浆剩余
    let lava = 0;
    for (let y = 0; y < 90; y++) for (let x = 0; x < 120; x++) {
      if (st.liquid[st.idx(x, y)] > 0 && st.liquidType[st.idx(x, y)] === 2) lava++;
    }
    console.log('lava cells remaining:', lava);
    expect(obs).toBeGreaterThan(0);
  });
});
