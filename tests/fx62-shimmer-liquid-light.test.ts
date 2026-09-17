// FX62 微光液体发射色 + 自发光白地板（2026-09-17 用户实报"微光湖亮度比原版低"）。
// 病根:原版 DrawShimmer(LiquidRenderer.cs:713 SetShimmerVertexColors :745-759)把
//   四角顶点色整体重置为 White×opacity×GetShimmerBaseColor——光照读值被丢弃 =
//   微光液体像素免乘光(自发光);本仓 compositeLight 全屏光照图乘法把湖体乘上
//   发射色暗紫。修 = 合成窗内微光液体格光值抬 255 白地板,合成后还原。
// 断言:
//   ① shimmerLiquidEmission = TileLightScanner.cs ApplyLiquidLight :133-151 逐值
//      (变异复核:0.7/900/125/0.6/0.25/0.9 任一手改即爆);
//   ② 白地板 raise/restore 突变复核:只抬液体格(type4)、他格零写、restore 逐位
//      还原、区域裁剪、已白格不记账、白地板 ≥ 发射色峰值(免乘有效性)。
import { describe, it, expect } from 'vitest';
import {
  shimmerLiquidEmission,
  raiseShimmerLiquidLightFloor,
  restoreShimmerLiquidLightFloor,
} from '../src/lighting/TileLightScanner';

describe('① shimmerLiquidEmission（ApplyLiquidLight :133-151 逐值金标）', () => {
  // vanilla 手算锚:mt=255 → num2=0.7+15/900=0.71666.., num3=0.7+15/125=0.82
  //              mt=65  → num2=0.7+205/900=0.92777.., num3=0.7+205/125=2.34
  it('脉冲两端点与原版算式逐位同值', () => {
    const hi = shimmerLiquidEmission(255);   // mouseTextColor 最暗端
    expect(hi[0]).toBeCloseTo(0.7166666666666667 * 0.6, 15);
    expect(hi[1]).toBeCloseTo(0.82 * 0.25, 15);
    expect(hi[2]).toBeCloseTo(0.7166666666666667 * 0.9, 15);
    const lo = shimmerLiquidEmission(65);    // 最亮端
    expect(lo[0]).toBeCloseTo(0.9277777777777778 * 0.6, 15);
    expect(lo[1]).toBeCloseTo(2.34 * 0.25, 15);
    expect(lo[2]).toBeCloseTo(0.9277777777777778 * 0.9, 15);
  });
  it('呼吸相位单调:mouseTextColor 越小越亮(270-mt 递增)', () => {
    const bright = shimmerLiquidEmission(65);
    const dim = shimmerLiquidEmission(255);
    expect(bright[0]).toBeGreaterThan(dim[0]);
    expect(bright[1]).toBeGreaterThan(dim[1]);
    expect(bright[2]).toBeGreaterThan(dim[2]);
  });
  it('发射色峰值 < 白地板 255(免乘有效性:白地板必须严格支配发射色)', () => {
    for (let mt = 65; mt <= 255; mt += 5) {
      const [r, g, b] = shimmerLiquidEmission(mt);
      expect(r * 255).toBeLessThan(255);
      expect(g * 255).toBeLessThan(255);
      expect(b * 255).toBeLessThan(255);
    }
  });
});

/** 8×4 迷你 store:liquid/liquidType 直填,其余字段由 raise 谓词只读两表 */
function miniStore() {
  const w = 8, h = 4;
  const liquid = new Uint8Array(w * h);
  const liquidType = new Uint8Array(w * h);
  const idx = (x: number, y: number) => y * w + x;
  // 行 1:微光带(x1..x5,type4);行 2:水(1)/岩浆(2)/蜂蜜(3)/干格;行 3:零散微光
  for (let x = 1; x <= 5; x++) { liquid[idx(x, 1)] = 255; liquidType[idx(x, 1)] = 4; }
  liquid[idx(1, 2)] = 200; liquidType[idx(1, 2)] = 1;   // 水——不抬
  liquid[idx(2, 2)] = 255; liquidType[idx(2, 2)] = 2;   // 岩浆——不抬
  liquid[idx(3, 2)] = 255; liquidType[idx(3, 2)] = 3;   // 蜂蜜——不抬
  liquid[idx(6, 3)] = 1;   liquidType[idx(6, 3)] = 4;   // 微光残液(液位1)——抬
  liquid[idx(7, 3)] = 99;  liquidType[idx(7, 3)] = 4;   // 微光(区域外探针)——区域裁剪判
  return { w, h, liquid, liquidType, idx };
}

describe('② 白地板 raise/restore 突变复核', () => {
  it('只抬微光液体格到 (255,255,255);水/岩浆/蜂蜜/干格零写', () => {
    const st = miniStore();
    const n = st.w * st.h;
    const R = new Uint8Array(n).map((_, i) => (i * 37 + 11) % 251);
    const G = new Uint8Array(n).map((_, i) => (i * 53 + 7) % 251);
    const B = new Uint8Array(n).map((_, i) => (i * 97 + 3) % 251);
    const before = { r: [...R], g: [...G], b: [...B] };
    const touched: number[] = [];
    raiseShimmerLiquidLightFloor(R, G, B, 0, 0, st.w, st.h, st, touched);
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.liquid[i] > 0 && st.liquidType[i] === 4) {
          expect(R[i]).toBe(255); expect(G[i]).toBe(255); expect(B[i]).toBe(255);
        } else {
          expect(R[i]).toBe(before.r[i]); expect(G[i]).toBe(before.g[i]); expect(B[i]).toBe(before.b[i]);
        }
      }
    }
    // 记账数 = 微光格数(行1 五格 + 行3 (6,3)(7,3)),且不含他格
    expect(touched.length).toBe(4 * 7);
    restoreShimmerLiquidLightFloor(R, G, B, touched);
    expect([...R]).toEqual(before.r);
    expect([...G]).toEqual(before.g);
    expect([...B]).toEqual(before.b);
    expect(touched.length).toBe(0);   // restore 清账本
  });

  it('区域裁剪:区域外微光格不动(区域数组=区域尺寸,li=(ty-ry)*rw+(tx-rx));越界区域安全', () => {
    const st = miniStore();
    // 区域 x∈[1,5), y∈[1,3):区域数组 4×2。区域内微光 = 行1 x=1..4 四格;
    // (5,1)(6,3)(7,3) 微光都在区域外 → 不出现在账本。
    const rw = 4, rh = 2;
    const R = new Uint8Array(rw * rh).fill(40);
    const G = new Uint8Array(rw * rh).fill(40);
    const B = new Uint8Array(rw * rh).fill(40);
    const touched: number[] = [];
    raiseShimmerLiquidLightFloor(R, G, B, 1, 1, rw, rh, st, touched);
    // 账本 = 区域内 4 微光格,li = (ty-1)*4+(tx-1),原值 40
    expect(touched.length).toBe(4 * 4);
    for (let x = 1; x <= 4; x++) {
      const li = (1 - 1) * rw + (x - 1);
      expect(touched.slice(li * 4, li * 4 + 4)).toEqual([li, 40, 40, 40]);
      expect(R[li]).toBe(255); expect(G[li]).toBe(255); expect(B[li]).toBe(255);
    }
    restoreShimmerLiquidLightFloor(R, G, B, touched);
    expect([...R].every((v) => v === 40)).toBe(true);
    // 全越界区域:零触碰
    raiseShimmerLiquidLightFloor(R, G, B, -5, -5, 3, 3, st, touched);
    expect(touched.length).toBe(0);
    expect([...R].every((v) => v === 40)).toBe(true);
    restoreShimmerLiquidLightFloor(R, G, B, touched);
  });

  it('已白格不记账(幂等);raise→restore 配对循环逐位还原', () => {
    const st = miniStore();
    const n = st.w * st.h;
    const R = new Uint8Array(n).fill(60), G = new Uint8Array(n).fill(70), B = new Uint8Array(n).fill(80);
    // 预置一个已白微光格(行1 x=2)
    R[st.idx(2, 1)] = 255; G[st.idx(2, 1)] = 255; B[st.idx(2, 1)] = 255;
    const before = { r: [...R], g: [...G], b: [...B] };
    const touched: number[] = [];
    raiseShimmerLiquidLightFloor(R, G, B, 0, 0, st.w, st.h, st, touched);
    expect(touched.length).toBe(4 * 6);   // 7 微光格 - 1 已白格
    restoreShimmerLiquidLightFloor(R, G, B, touched);
    expect([...R]).toEqual(before.r);
    expect([...G]).toEqual(before.g);
    expect([...B]).toEqual(before.b);
    // 第二轮 raise(raise→restore 配对):记账数一致(幂等重放)
    raiseShimmerLiquidLightFloor(R, G, B, 0, 0, st.w, st.h, st, touched);
    expect(touched.length).toBe(4 * 6);
    for (let i = st.idx(1, 1); i <= st.idx(5, 1); i++) { expect(R[i]).toBe(255); }
    restoreShimmerLiquidLightFloor(R, G, B, touched);
    expect([...R]).toEqual(before.r);
    expect([...G]).toEqual(before.g);
    expect([...B]).toEqual(before.b);
  });
});
