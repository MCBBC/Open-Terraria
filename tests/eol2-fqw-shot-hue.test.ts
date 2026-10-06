// ★EoL2 登记债2 红绿（2026-10-06）：932 月总矢发射点 hue 通道——
// 定谳：932 唯一发射面 = 暮夕 4953 第 3 发（Player.cs:48391-48397：
//   `float ai3 = miscCounterNormalized * 12f % 1f` → NewProjectile(..., 0f, ai3)
//   落 proj.ai[1] → 绘制 GetFairyQueenWeaponsColor hueRaw=ai[1]（:21782）→
//   (hue+0.5)%1 → hslToRgb(h,1,0.5)）。miscCounterNormalized = miscCounter/300f
//   (:3373)，miscCounter 每 tick+1 满 300 归零（UpdateMiscCounter :29527-29533）。
// 病灶：载体缺省 empressHue=0 → 恒 (0+.5)%1=青蓝档（发射端 Game.ts 域当时不可改
//   =登记债）；修 = fairyQueenShotHue（f32 三级 fround 镜像 + %300 相位归一）经
//   Game.ts 4953 支 spawnFanArrow → ArrowOpts.empressHue 注入。
// 消费面：Arrow.draw 932 独占支 :3271 + AI_181 尘 267 色（subStepAI 932 支）。
import { describe, it, expect } from 'vitest';
import { fairyQueenShotHue, eventideShotSpec } from '../src/data/vanillaItemCombat';

describe('fairyQueenShotHue（Player.cs:48391-48396 f32 链 1:1）', () => {
  it('f32 三级舍入金标（Float32Array 独立参照预冻值）', () => {
    // 参照 = f32(f32(m/300)*12)%1 的 Float32Array 往返独立计算（非实现副本），
    // 值随测试冻结：hue(25)=0 恰好成立（f32(25/300)×12 在 f32 域舍入回 1.0 整）
    expect(fairyQueenShotHue(0)).toBe(0);
    expect(fairyQueenShotHue(1)).toBeCloseTo(0.03999999910593033, 12);
    expect(fairyQueenShotHue(6)).toBeCloseTo(0.23999999463558197, 12);
    expect(fairyQueenShotHue(12)).toBeCloseTo(0.47999998927116394, 12);
    expect(fairyQueenShotHue(25)).toBe(0);                       // f32 舍入后恰整
    expect(fairyQueenShotHue(150)).toBe(0);
    expect(fairyQueenShotHue(299)).toBeCloseTo(0.9600000381469727, 12);
    // 零域守卫：全 0..299 落 [0,1)
    for (let m = 0; m < 300; m++) {
      const h = fairyQueenShotHue(m);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('锯齿周期 25t + 300 回卷不变量（UpdateMiscCounter :29529-29531）', () => {
    for (let k = 0; k < 300; k++) {
      expect(fairyQueenShotHue(300 + k)).toBe(fairyQueenShotHue(k));   // 回卷同相
      expect(fairyQueenShotHue(900 + k)).toBe(fairyQueenShotHue(k));   // 多周期
    }
    for (let k = 0; k < 275; k++) {
      // 25t 锯齿（f32 逐发独立舍入的固有档 ≤1e-6——原版每发重算
      // miscCounterNormalized×12 同样逐发舍入,偏差即原版行为非实现噪声）
      expect(fairyQueenShotHue(k + 25)).toBeCloseTo(fairyQueenShotHue(k), 5);
    }
  });

  it('发射面绑定：eventideShotSpec 第 3 发（idx 2）→ 932 + 伤×2（:47307-47315）', () => {
    const s = eventideShotSpec(2, 1, 50, 10);
    expect(s.pid).toBe(932);
    expect(s.dmg).toBe(100);
    expect(s.spd).toBe(20);          // 932 恒速×2
    const plain = eventideShotSpec(0, 1, 50, 10);
    expect(plain.pid).toBe(1);       // 非第 3 发原弹型（hue 通道不消费）
  });
});
