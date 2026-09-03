// 拾取飘字抗重叠推离回归（PopupText.Update :651-748 1:1——Game.dmgNumbers 飘字池
// 消费段 popupLabelStep 纯函数直测,2026-09-03 登记近似①清偿锁定）。
// 互推公式（:678-704）：命中盒（GetTextHitbox :751-758 = MeasureString×scale、高×0.8）
// 相交且自身在上（y 小 / 同 y 槽序 whoAmI 在前）→ 双方 lifeTime =
// activeTime(60)+15×min(numActive,3) 重钉 + 上推速度链（:705-714 !flag ×0.86
// （scale 达标再 ×0.4）/flag >−6 逐拍 −0.2）。
// 字体度量（红队R3①清偿,2026-09-03）：与实绘同源 = 13px sans-serif
// （Renderer.popupLabelMeasure,canvas measureText;node 无 canvas 走定宽表兜底,
//  断言全部经同一 helper 求值=环境自洽）。
// ★寿命断言口径：延长发生在扫描段（:702-703），同拍尾段 lifeTime--（:716）——
//   被步进者终值 = 延长值−1;仅被对方扫描延长者保持延长值。
import { describe, it, expect } from 'vitest';
import { popupLabelStep } from '../src/core/Game';
import { popupLabelMeasure } from '../src/render/Renderer';
import type { DamageNumber } from '../src/render/Renderer';

const mk = (label: string, x: number, y: number, extra: Partial<DamageNumber> = {}): DamageNumber =>
  ({ x, y, vx: 0, vy: -7, value: 0, crit: false, color: '#fff', life: 60, label, scale: 1, ...extra }) as DamageNumber;

const w0 = (t: string): number => popupLabelMeasure(t).w;

describe('抗重叠互推（PopupText.cs:678-704）', () => {
  it('相交且自身在上 → 双方 life 重钉 = 60+15×min(numActive,3)（步进者再 −1）', () => {
    const a = mk('土块', 100, 100, { vy: -3 });            // 上者（vy −3 ∈ >−6 门内）
    const b = mk('石头', 100 + w0('土块') / 2, 108);       // 下者（盒高 24 → dy8 相交）
    const pool = [a, b];
    expect(popupLabelStep(a, pool, 0, 2)).toBe(true);
    expect(a.life).toBe(60 + 15 * 2 - 1);                 // :702-703 重钉 + :716 同拍 --
    expect(b.life).toBe(60 + 15 * 2);                     // 仅被扫描延长,未步进
    expect(a.vy).toBeCloseTo(-3.2, 12);                   // flag → >−6 门内 −0.2
  });

  it('numActive 钳 3：5 条在场 → 延长档 60+45−1（UpdateItemText :760-772 循环后写回,帧内读上帧终值）', () => {
    const a = mk('土块', 100, 100);
    const b = mk('石头', 100, 102);
    const pool = [a, b, mk('x', 900, 900), mk('y', 950, 900), mk('z', 1000, 900)];
    popupLabelStep(a, pool, 0, 5);
    expect(a.life).toBe(60 + 15 * 3 - 1);
    expect(b.life).toBe(60 + 15 * 3);
  });

  it('仅上者触发：下者视角无 (y<o.y || 同 y 且序在前) → 不延长、走 !flag 衰减', () => {
    const top = mk('A', 100, 100);
    const bot = mk('B', 100, 103, { scale: 0.5 });   // scale<targetScale → 无 ×0.4 急停
    const pool = [top, bot];
    popupLabelStep(bot, pool, 1, 2);
    expect(bot.life).toBe(60 - 1);         // 未延长,仅 tail --
    expect(top.life).toBe(60);
    expect(bot.vy).toBeCloseTo(-7 * 0.86, 12);
  });

  it('同 y 平局：槽序在前者触发（whoAmI < i,:694）——延长对双写（:702-703 同拍双赋值）', () => {
    const first = mk('A', 100, 100);
    const second = mk('BBBB', 104, 100);   // 横向相交（dx4 < (8+32)/2=20）
    const pool = [first, second];
    popupLabelStep(first, pool, 0, 2);     // whoAmI=0 < 1 → 触发：双方 life = 90
    expect(first.life).toBe(60 + 15 * 2 - 1);   // 自身再 tail --
    expect(second.life).toBe(60 + 15 * 2);      // 对方被同拍重钉
    popupLabelStep(second, pool, 1, 2);    // whoAmI=1 → 不触发,走 life--
    expect(second.life).toBe(60 + 15 * 2 - 1);
    expect(first.life).toBe(60 + 15 * 2 - 1);   // 未被 second 步进（-- 只作用于自身）
  });

  it('不相交（横向分离）→ 不延长', () => {
    const a = mk('A', 100, 100);
    const b = mk('B', 100 + w0('A') + 40, 100);
    const pool = [a, b];
    popupLabelStep(a, pool, 0, 2);
    expect(a.life).toBe(59);
    expect(b.life).toBe(60);
  });
});

describe('扫描窗 active 等价门（:687-691,红队R3②）', () => {
  it('本拍消亡条目留尸原槽（写回侧不清槽）→ 后步进者跳过尸体（!popupText.active → continue）', () => {
    // 尸体状态 = popupLabelStep 返回 false 的同一状态（life≤0 且 scale<0.1）:
    // 调用侧不再写回,但槽位原样留到下一位步进者扫描窗内
    const corpse = mk('B', 100, 104, { life: 0, scale: 0.05 });
    const c = mk('C', 100, 100, { vy: -3 });          // 在上（100<104）,几何相交
    const pool = [corpse, c];
    expect(popupLabelStep(c, pool, 1, 2)).toBe(true);
    expect(c.life).toBe(60 - 1);                      // 未与尸体互推（无门则被重钉 90−1）
    expect(c.vy).toBeCloseTo(-3 * 0.86 * 0.4, 12);    // 无重叠 → !flag 衰减链（scale=1 ×0.4）
    expect(corpse.life).toBe(0);                      // 尸体不被重钉复活
  });

  it('收缩期仍存活条目（life≤0 且 scale≥0.1）不被门误剔——与原版 active 同构', () => {
    const shrinking = mk('B', 100, 104, { life: 0, scale: 0.5 });
    const c = mk('C', 100, 100, { vy: -3 });
    expect(popupLabelStep(c, [shrinking, c], 1, 2)).toBe(true);
    expect(c.life).toBe(60 + 15 * 2 - 1);             // 照常互推
    expect(shrinking.life).toBe(60 + 15 * 2);         // active 条目照常被重钉
  });
});

describe('运动分链（:705-714）', () => {
  it('重叠：>−6 逐拍 −0.2 上推；−6 恰好落 ×0.86 支', () => {
    const a = mk('A', 100, 100, { vy: -5, scale: 0.5 });
    const b = mk('B', 100, 110);           // dy10 < 盒高 24 → 相交
    popupLabelStep(a, [a, b], 0, 2);
    expect(a.vy).toBeCloseTo(-5.2, 12);
    const c = mk('A', 100, 100, { vy: -6, scale: 0.5 });
    const e = mk('B', 100, 110);
    popupLabelStep(c, [c, e], 0, 2);
    expect(c.vy).toBeCloseTo(-6 * 0.86, 12);   // −6 > −6 假 → else 支
  });

  it('无重叠：×0.86（scale==targetScale(1) 再 ×0.4 急停）；vx ×0.93', () => {
    const a = mk('A', 100, 100, { vy: -2, scale: 1, vx: -3 });
    const far = mk('B', 1000, 1000);
    popupLabelStep(a, [a, far], 0, 2);
    expect(a.vy).toBeCloseTo(-2 * 0.86 * 0.4, 12);
    expect(a.vx).toBeCloseTo(-3 * 0.93, 12);
    const g = mk('A', 100, 100, { vy: -2, scale: 0.5 });
    popupLabelStep(g, [g, far], 0, 2);
    expect(g.vy).toBeCloseTo(-2 * 0.86, 12);   // scale 未达标 → 无 ×0.4
  });
});

describe('寿命与收缩（:715-731）', () => {
  it('life>0 逐拍 +0.1 生长；life≤0 进收缩期 −0.03,<0.1 消亡', () => {
    const d = mk('A', 0, 0, { scale: 0, life: 3, vy: 0 });
    const pool = [d];
    expect(popupLabelStep(d, pool, 0, 1)).toBe(true);   // life 3→2 生长
    expect(d.scale).toBeCloseTo(0.1, 12);
    expect(popupLabelStep(d, pool, 0, 1)).toBe(true);   // life 2→1 生长
    expect(d.scale).toBeCloseTo(0.2, 12);
    expect(popupLabelStep(d, pool, 0, 1)).toBe(true);   // life 1→0 收缩期 0.17
    expect(d.scale).toBeCloseTo(0.17, 12);
    expect(popupLabelStep(d, pool, 0, 1)).toBe(true);   // 0.14
    expect(popupLabelStep(d, pool, 0, 1)).toBe(true);   // 0.11
    expect(popupLabelStep(d, pool, 0, 1)).toBe(false);  // 0.08 <0.1 消亡
    expect(d.scale).toBeLessThan(0.1);
  });

  it('alpha 呼吸（:659-669）：±0.01 钳 [0.7,1]，边界翻转 alphaDir', () => {
    const d = mk('A', 0, 0, { alpha: 1, alphaDir: 1, vy: 0 });
    popupLabelStep(d, [d], 0, 1);
    expect(d.alpha).toBe(1); expect(d.alphaDir).toBe(-1);
    const e = mk('A', 0, 0, { alpha: 0.7, alphaDir: -1, vy: 0 });
    popupLabelStep(e, [e], 0, 1);
    expect(e.alpha).toBe(0.7); expect(e.alphaDir).toBe(1);
  });
});
