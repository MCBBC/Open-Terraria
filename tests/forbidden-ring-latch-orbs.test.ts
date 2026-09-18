// Forbidden 禁戒符号环·冷却闩辉光珠层（红蓝-M ③ 2026-09-18）回归。
// 标杆 Terarria1457/Terraria.DataStructures/PlayerDrawLayers.cs
// DrawPlayer_05_ForbiddenSetRing :280-326：
//   · 闩态（setForbiddenCooldownLocked）只覆写参数不摘珠——num3 钉 2/color2 钉
//     ×0.3（:293-296）、num2 浮动归 0,4 珠循环照跑（:311-315,循环不吃 locked 门）。
//   · 蓝移 MultiplyRGB(0.5,0.5,1) 只染环体 color（:297）,珠 color2 独立钉值
//     (80,70,40,0)×0.3 不吃蓝移 → 珠层头复位 filter（:296 vs :297 分轨）。
//   · 活态珠径 num3=miscCounter/75·2π 的 cos×4（:290）、α 因子=(num3/8+.5)×.8（:291）。
// ★曾病：Renderer 闩态整层跳画（glow && !locked）+ 死写 orbR=2/orbA=0.3 未消费
//   + 闩蓝移 CSS filter 近似——四珠整缺。本文件 = 判别回归（变异：回挂 !locked 门
//   或改钉值即红）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { drawForbiddenGlowOrbs } from '../src/render/Renderer';

// ---------------------------------------------------------------- 记录型 ctx
type Ev = { kind: 'call'; m: string; a: unknown[] } | { kind: 'set'; k: string; v: unknown };
function makeRecCtx() {
  const evs: Ev[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (...a: unknown[]) => { evs.push({ kind: 'call', m: String(k), a }); return undefined; },
    set: (_t, k, v) => { evs.push({ kind: 'set', k: String(k), v }); return true; },
  });
  return { evs, ctx: ctx as unknown as CanvasRenderingContext2D };
}
const fakeGlow = { width: 22, height: 22 } as unknown as HTMLImageElement;   // 半宽 11（ensureVImage 联合成员替身）
const draws = (evs: Ev[]) => evs.filter((e): e is Extract<Ev, { kind: 'call' }> =>
  e.kind === 'call' && e.m === 'drawImage');
const sets = (evs: Ev[], k: string) => evs.filter((e) => e.kind === 'set' && (e as { k: string }).k === k)
  .map((e) => (e as { v: unknown }).v);
/** 珠层 α 序列滤掉每珠后的 1 复位——余下 = 逐珠 α 值 */
const orbAlphas = (evs: Ev[]) => sets(evs, 'globalAlpha').filter((v) => v !== 1);

describe('闩态四珠照画（PlayerDrawLayers.cs:293-296/311-315）', () => {
  it('locked：4 珠全画,珠径钉 2（cardinal ×2）、α 钉 0.3、加法面 lighter、filter 复位', () => {
    const { evs, ctx } = makeRecCtx();
    drawForbiddenGlowOrbs(ctx, fakeGlow, 1234, true);
    const d = draws(evs);
    expect(d.length).toBe(4);
    expect(d.every((e) => e.a[0] === fakeGlow)).toBe(true);
    // 半径 2 cardinal：(±2,0)/(0,±2) − 原点 11 → drawImage xy 实参序列
    expect(d.map((e) => e.a.slice(1))).toEqual([
      [-9, -11], [-11, -9], [-13, -11], [-11, -13],
    ]);
    expect(orbAlphas(evs)).toEqual([0.3, 0.3, 0.3, 0.3]);   // color2=(80,70,40,0)×0.3
    expect(sets(evs, 'globalCompositeOperation')).toEqual(['lighter', 'source-over', 'lighter', 'source-over', 'lighter', 'source-over', 'lighter', 'source-over']);
    expect(sets(evs, 'filter')).toEqual(['none']);          // 珠层不吃环体蓝移（:296 vs :297 分轨）
  });
  it('活态（miscCounter=0）：珠径 cos(0)×4=4、α=(4/8+.5)×.8=0.8——钉值不误染活态', () => {
    const { evs, ctx } = makeRecCtx();
    drawForbiddenGlowOrbs(ctx, fakeGlow, 0, false);
    const d = draws(evs);
    expect(d.length).toBe(4);
    expect(d.map((e) => e.a.slice(1))).toEqual([
      [-7, -11], [-11, -7], [-15, -11], [-11, -15],
    ]);
    expect(orbAlphas(evs)).toEqual([0.8, 0.8, 0.8, 0.8]);
  });
  it('活态谷相位（miscCounter=37.5→cos π=−1→num3=−4→α 因子 0）：仍画 4 珠 α=0（原版 color2×0 隐形照画）', () => {
    const { evs, ctx } = makeRecCtx();
    drawForbiddenGlowOrbs(ctx, fakeGlow, 37.5, false);
    expect(draws(evs).length).toBe(4);
    expect(orbAlphas(evs)).toEqual([0, 0, 0, 0]);
  });
});

// ---- 源码锚 tripwire：drawPlayer 珠层调用不挂 !locked 门（闩态珠整缺回归锚）----
describe('源码锚（Renderer.drawPlayer 环块接线）', () => {
  const src = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
  it('珠层调用无条件（glow 存在即画;闩态交由钉值面）——glow&&!locked 门不得回潮', () => {
    expect(src).not.toContain('glow && !locked');
    expect(src).toContain('drawForbiddenGlowOrbs(ctx, glow, p.miscCounter, locked)');
  });
  it('闩态钉值单源在珠层函数内（:295-296 面不散落调用点）', () => {
    expect(src).toContain('const orbR = locked ? 2 : Math.cos((miscCounter / 75) * Math.PI * 2) * 4');
    expect(src).toContain('const orbA = locked ? 0.3 : (orbR / 8 + 0.5) * 0.8');
  });
});
