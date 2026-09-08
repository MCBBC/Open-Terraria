// 链 B 缺口支行为面金标（★F2/★F5，2026-09-08 红队清偿批）
//
// 权威面：Terarria1457/Terraria/Dust.cs UpdateDust 链 B 独占链
//   · 130-134 支 :2202-2243（光 :2208-2223 无 noLight 门；阻尼三臂 :2224-2240）
//   · 219-223 支 :2275-2315（光 :2282-2297 !noLight 门；noGravity 臂 :2298-2303；
//     无门叠乘 :2306 velocity×(0.97,0.99) + :2307 scale−0.0025）
//   · 308 NewDust 兄弟支 :227-230（velocity×0.5 + Y++，无 alpha=170）
// 两支此前落 default 兜底（×0.92/−0.04）= 原文明文拒绝；本文件以行为面单测
// （合成夹具直调 VanillaDust.spawn/update，update 段零 RNG → 断言精确）锁死。
import { describe, expect, it } from 'vitest';
import { VanillaDust } from '../src/fx/VanillaDust';

/** 驱动一拍 update：spawn 后覆写确定性初值（spawn 的位/速/scale 抖动被全量覆盖）。
 *  update 顺序（VanillaDust.update）：位置积分 → 链 A → :1884 重力 → 老化 → 链 B。 */
function drive(type: number, init: { noGravity?: boolean; noLight?: boolean; fadeIn?: number;
  scale?: number; vx?: number; vy?: number; alpha?: number } = {}) {
  const vd = new VanillaDust();
  const d = vd.spawn(100, 100, 16, 16, type, 0, 0, init.alpha ?? 0, null, 1)!;
  d.noGravity = init.noGravity ?? false;
  d.noLight = init.noLight ?? false;
  d.fadeIn = init.fadeIn ?? 0;
  d.scale = init.scale ?? 1;
  d.vx = init.vx ?? 1;
  d.vy = init.vy ?? 1;
  d.x = 100; d.y = 100;
  vd.update(0, 0, 800, 600);
  return { vd, d };
}

describe('链 B 130-134 支（Dust.cs:2202-2243）', () => {
  it('130：光 (1,0.5,0.4)×min(scale,1)【无 noLight 门】+ noGravity 臂 ×0.93/scale+0.0025', () => {
    const { vd, d } = drive(130, { noGravity: true, noLight: true, scale: 2 });
    // ★光无 !noLight 门（原文直呼 Lighting.AddLight,noLight=true 仍发光——与
    //   219-223 的 !noLight 门互为判别）;k=min(2,1)=1 恒量
    expect(vd.lights).toHaveLength(1);
    expect(vd.lights[0].r).toBeCloseTo(1, 12);
    expect(vd.lights[0].g).toBeCloseTo(0.5, 12);
    expect(vd.lights[0].b).toBeCloseTo(0.4, 12);
    // 阻尼 = 仅 noGravity 臂 ×0.93（无 219-223 式第二段叠乘 → 精确 0.93）
    expect(d.vx).toBeCloseTo(0.93, 12);
    expect(d.vy).toBeCloseTo(0.93, 12);
    // scale = 2 −0.01(老化 fadeIn==0) +0.0025(noGravity fadeIn==0) = 1.9925
    // （缺 case 落 default 兜底的旧态 = ×0.92 + −0.01 −0.04 → 立即爆红）
    expect(d.scale).toBeCloseTo(1.9925, 12);
  });

  it('131：光 (0.4,1,0.6)；重力 else-if 臂 ×0.98 + Y−0.1 + scale+0.0025（vy=(1+0.1)×0.98−0.1 精确）', () => {
    const { vd, d } = drive(131, { noGravity: false, scale: 1 });
    // ★k 取【老化后】scale（原版 UpdateDust 序:fadeIn 老化 :2148 scale−0.01 先于
    //   链 B :2202 取 num112）——scale=1 → 老化后 0.99 → k=0.99
    const k = 0.99;
    expect(vd.lights).toHaveLength(1);
    expect(vd.lights[0].r).toBeCloseTo(0.4 * k, 12);
    expect(vd.lights[0].g).toBeCloseTo(1 * k, 12);
    expect(vd.lights[0].b).toBeCloseTo(0.6 * k, 12);
    expect(d.vx).toBeCloseTo(0.98, 12);
    expect(d.vy).toBeCloseTo(1.1 * 0.98 - 0.1, 12);   // :1884 重力先行 + 链 B 131 臂
    expect(d.scale).toBeCloseTo(1 - 0.01 + 0.0025, 12);
  });

  it('132/133 光恒量表（scale 缩光）;134 无光档;缺省臂 ×0.95/scale−0.0025', () => {
    const t132 = drive(132, { scale: 0.5 });   // 老化后 0.49 → k=0.49
    expect(t132.vd.lights[0].r).toBeCloseTo(0.3 * 0.49, 12);
    expect(t132.vd.lights[0].g).toBeCloseTo(0.5 * 0.49, 12);
    expect(t132.vd.lights[0].b).toBeCloseTo(1 * 0.49, 12);
    const t133 = drive(133);
    expect(t133.vd.lights[0].r).toBeCloseTo(0.9 * 0.99, 12);
    expect(t133.vd.lights[0].g).toBeCloseTo(0.9 * 0.99, 12);
    expect(t133.vd.lights[0].b).toBeCloseTo(0.3 * 0.99, 12);
    const t134 = drive(134);
    expect(t134.vd.lights).toHaveLength(0);            // 134 无光
    // 缺省臂（非 noGravity 非 131）：×0.95 + scale−0.0025（重力先行 vy=1.1）
    expect(t134.d.vx).toBeCloseTo(0.95, 12);
    expect(t134.d.vy).toBeCloseTo(1.1 * 0.95, 12);
    expect(t134.d.scale).toBeCloseTo(1 - 0.01 - 0.0025, 12);
  });
});

describe('链 B 219-223 支（Dust.cs:2275-2315）', () => {
  it('219：光 (1,0.5,0.4)×min(scale,1) 受 noLight 门；noGravity 臂 ×0.93 后无门叠乘 ×(0.97,0.99)', () => {
    const { vd, d } = drive(219, { noGravity: true, scale: 1 });
    const k = 0.99;   // ★k 取【老化后】scale（:2148 老化先于 :2275 链 B 取 num114）
    expect(vd.lights).toHaveLength(1);
    expect(vd.lights[0].r).toBeCloseTo(1 * k, 12);
    expect(vd.lights[0].g).toBeCloseTo(0.5 * k, 12);
    expect(vd.lights[0].b).toBeCloseTo(0.4 * k, 12);
    expect(d.vx).toBeCloseTo(1 * 0.93 * 0.97, 12);     // :2299 ×0.93 → :2306 ×0.97
    expect(d.vy).toBeCloseTo(1 * 0.93 * 0.99, 12);
    // scale = 1 −0.01(老化) +0.0025(noGravity fadeIn==0) −0.0025(链 B) = 0.99
    expect(d.scale).toBeCloseTo(0.99, 12);
  });

  it('219 noLight=true 不发光（与 130-134 无门档互为判别）;221/222 恒量表;223 无光', () => {
    expect(drive(219, { noGravity: true, noLight: true }).vd.lights).toHaveLength(0);
    const t221 = drive(221, { scale: 0.5 });   // 老化后 0.49 → k=0.49
    expect(t221.vd.lights[0].r).toBeCloseTo(0.3 * 0.49, 12);
    expect(t221.vd.lights[0].g).toBeCloseTo(0.5 * 0.49, 12);
    expect(t221.vd.lights[0].b).toBeCloseTo(1 * 0.49, 12);
    const t222 = drive(222);
    expect(t222.vd.lights[0].r).toBeCloseTo(0.9 * 0.99, 12);
    expect(t222.vd.lights[0].g).toBeCloseTo(0.9 * 0.99, 12);
    expect(t222.vd.lights[0].b).toBeCloseTo(0.3 * 0.99, 12);
    expect(drive(223).vd.lights).toHaveLength(0);      // 223 无光档
  });
});

describe('NewDust 308 兄弟支（Dust.cs:227-230）', () => {
  it('308：velocity×0.5 + Y++（值域判定,RNG 无关）、alpha 不动（≠水尘族 170）', () => {
    for (let i = 0; i < 200; i++) {
      const vd = new VanillaDust();
      const d = vd.spawn(100, 100, 16, 16, 308, 0, 0, 0, null, 1)!;
      // 初速抖动 vx,vy ∈ [−2,2]（NewDust :122-124）→ ×0.5 后 vx∈[−1,1]、
      // vy = vy×0.5+1 ∈ [0,2]（:227-230 velocity.Y++ 矢量后置）
      expect(d.vx).toBeGreaterThanOrEqual(-1);
      expect(d.vx).toBeLessThanOrEqual(1);
      expect(d.vy).toBeGreaterThanOrEqual(0);
      expect(d.vy).toBeLessThanOrEqual(2);
      // 值域统计判别力：无支态 vy∈[−2,2]（200 样本全 ≥0 概率 2^-200≈0）、
      // vx∈[−1,1]（无 ×0.5 态 200 样本全 ≤1 概率 2^-200≈0）
      // ★判别核心：:227-230 句无 alpha 赋值（170 属 :232-237 水尘族句）
      expect(d.alpha).toBe(0);
    }
    // 对照组：同段相邻句成员 33 带 alpha=170（水尘族既有行为不变）
    const vd = new VanillaDust();
    const w = vd.spawn(100, 100, 16, 16, 33, 0, 0, 0, null, 1)!;
    expect(w.alpha).toBe(170);
  });
});
