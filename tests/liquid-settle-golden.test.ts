// 液体沉降黄金回归(2026-08-13 性能优化①buffer 头指针队列+②实心 LUT 的等价性闸门):
// 自包含合成夹具(确定性、无 /tmp 依赖)→ settleWorldLiquids('gen') → 四数组哈希对 golden。
// golden 取自"与优化前代码逐字节一致"的输出(冻结快照 A/B 验证,见会话记录);
// 此后任何 LiquidSim 改动破坏该哈希即被本测试拦截。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { settleWorldLiquids } from '../src/world/liquid/settle';

function fnv1a(u8: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function fixture(): World {
  // 220×260 合成世界:基岩地板+若干岩腔,灌水/岩浆/蜂蜜/微光四类液体
  const w = 220, h = 260;
  const world = new World(w, h, 424242, 'golden');
  world.groundLevel = 60; world.rockLevel = 110; world.lavaLine = h - 40;
  const st = world.store;
  const STONE = 2, DIRT = 1;
  for (let x = 0; x < w; x++) {
    for (let y = h - 20; y < h; y++) { st.type[st.idx(x, y)] = STONE; st.flags[st.idx(x, y)] = 1; }
  }
  const cavity = (x0: number, y0: number, cw: number, ch: number) => {
    for (let x = x0; x < x0 + cw; x++) for (let y = y0; y < y0 + ch; y++) {
      const i = st.idx(x, y);
      st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 0;
    }
  };
  const fill = (x0: number, y0: number, cw: number, ch: number, amt: number, type: number) => {
    for (let x = x0; x < x0 + cw; x++) for (let y = y0; y < y0 + ch; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = amt; st.liquidType[i] = type;
    }
  };
  cavity(20, 150, 60, 30);  fill(24, 154, 50, 20, 255, 1);      // 水池(悬空 4 格待沉降)
  cavity(100, 150, 50, 40); fill(104, 170, 40, 10, 255, 2);     // 岩浆湖(上有水滴)
  fill(110, 154, 10, 8, 200, 1);
  cavity(160, 120, 40, 60); fill(164, 160, 30, 15, 255, 3);     // 蜂蜜池+接触水
  fill(170, 140, 8, 6, 180, 1);
  cavity(30, 40, 80, 50);  fill(40, 44, 60, 30, 255, 1);        // 地表湖(带土墙)
  for (let x = 30; x < 110; x++) for (let y = 40; y < 90; y++) if (!st.flags[st.idx(x, y)]) st.wall[st.idx(x, y)] = 2;
  // 微光腔(触发 ShimmerRemoveWater 路径)
  world.shimmerX = 170; world.shimmerY = 190;
  cavity(160, 180, 30, 20); fill(164, 184, 20, 10, 255, 4);
  fill(200, 60, 12, 8, 255, 1);                                  // 微光腔附近的一汪水(应被脱水)
  return world;
}

describe('液体沉降 golden(优化等价性闸门)', () => {
  it('合成四类液体夹具:哈希恒定', async () => {
    const world = fixture();
    await settleWorldLiquids(world, 'gen');
    const st = world.store;
    const hash = [st.liquid, st.liquidType, st.type, st.flags].map((a) =>
      fnv1a(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))).join(' ');
    expect(hash).toBe('f4f6614e d6806ecf b6f70ec5 e84ee6b5');   // golden(与优化前逐字节一致,冻结快照 A/B 验证)
  }, 120000);
});
