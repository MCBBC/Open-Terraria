// BJ403:704 龙卷半透区黑斑判别面——加算面(add)α 必须=texA×cA(尘系 dustPremulBake
//  2026-09-03 黑方块/09-04 水花黑十字同族判例第三发)。
// 根因锚:BJ379 桶 multiply+destination-in 把桶 α 还原成 raw tex.a,'lighter' α=1
//  每层把 tex.a 全额累进 dst.α(XNA 应=tex.a×STORM_A×f≤0.249f)→ ~45 层 α 饱和 1、
//  rgb 仅 ΣP = 半透区黑斑(实测 18189 可见 px 中 11499 黑斑;XNA oracle 0 黑斑)。
// 修=stormAddBake 字节级烘焙:出面 straight RGBA,画布 putImageData→预乘换算
//  round(rgb_s×α_s/255)='lighter' 实加值 ⇒ 加算项 (aR,e) 逐字节对拍 XNA 递推式:
//   rgb_p' = P + rgb_p×(1−sa); a' = sa + a×(1−sa)
//   P = tex.rgb×tex.a×tint×f（预乘全幅）、sa = tex.a×STORM_A×f（Main.cs:33135-33141）
// 存面约束:canvas 预乘面 rgb≤α ⇒ 亮 texel(aR>e)不可表 → α 取 max(e,aR,aG,aB)
//  （尘系同款;rgb 恒逐字节精确,α 仅亮点位过冲=登记边界,测试单边钉住防翻面）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stormAddBake } from '../src/entities/proj1457';

const GAME_ROOT = join(__dirname, '..');

// STORM_A=(127*0.5)/255（proj1457.ts 常数;此处同步钉值防漂）
const STORM_A = (127 * 0.5) / 255;
const TINT = [160, 140, 100] as const;

function bakeTexel(r: number, g: number, b: number, a: number, f: number): number[] {
  const tex = new Uint8ClampedArray([r, g, b, a]);
  const out = stormAddBake(tex, TINT[0] * f, TINT[1] * f, TINT[2] * f, 255 * STORM_A * f);
  return [out[0], out[1], out[2], out[3]];
}
/** 存面字节 → 'lighter' 实加预乘值（putImageData 直色→预乘换算 round(v×A/255);
 *  α 通道实加值=A 本身） */
function addedPremul(s: number[]): number[] {
  return [Math.round((s[0] * s[3]) / 255), Math.round((s[1] * s[3]) / 255),
    Math.round((s[2] * s[3]) / 255), s[3]];
}
/** XNA 递推 N 层（浮点权威式,全归一化 0..1 域） */
function xnaRecursion(r: number, g: number, b: number, a: number, f: number, layers: number) {
  const P = [r * a * TINT[0] * f / 65025 / 255, g * a * TINT[1] * f / 65025 / 255,
    b * a * TINT[2] * f / 65025 / 255];
  const sa = (a / 255) * STORM_A * f;
  let rgb = [0, 0, 0], al = 0;
  for (let i = 0; i < layers; i++) {
    rgb = [Math.min(1, P[0] + rgb[0] * (1 - sa)), Math.min(1, P[1] + rgb[1] * (1 - sa)),
      Math.min(1, P[2] + rgb[2] * (1 - sa))];   // rgba8 渲染目标硬件钳 [0,1]
    al = sa + al * (1 - sa);
  }
  return { rgb, al };
}
/** 画布语义递推 N 层（erase 遍 ×(1−sa) + lighter 遍加存面回读预乘值） */
function canvasRecursion(r: number, g: number, b: number, a: number, f: number, layers: number) {
  const s = bakeTexel(r, g, b, a, f);
  const add = addedPremul(s).map((v) => v / 255);
  const sa = (a / 255) * STORM_A * f;
  let rgb = [0, 0, 0], al = 0;
  for (let i = 0; i < layers; i++) {
    rgb = [Math.min(1, add[0] + rgb[0] * (1 - sa)), Math.min(1, add[1] + rgb[1] * (1 - sa)),
      Math.min(1, add[2] + rgb[2] * (1 - sa))];
    al = Math.min(1, add[3] + al * (1 - sa));
  }
  return { rgb, al };
}

describe('BJ403-① 加算面 α=texA×cA（黑斑判别器:旧桶=tex.a 必爆）', () => {
  it('半透暗 texel(50,50,50,26) f=1:存面 α=e≈6.5(非 tex.a=26);回读预乘 rgb=aR±1.5', () => {
    const s = bakeTexel(50, 50, 50, 26, 1);
    const e = (26 * (STORM_A * 255)) / 255;
    const aR = (50 * 26 * TINT[0]) / 65025;
    expect(s[3]).toBeLessThanOrEqual(e + 1.01);          // 旧桶=26 → 爆
    expect(s[3]).toBeGreaterThanOrEqual(e - 1.01);
    const add = addedPremul(s);
    expect(Math.abs(add[0] - aR)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(add[3] / 255 - e / 255)).toBeLessThanOrEqual(1.01 / 255);
  });
  it('极淡 texel(50,50,50,26) f=0.25:α=e≈1.6(旧桶恒 26=黑斑主凶带)', () => {
    const s = bakeTexel(50, 50, 50, 26, 0.25);
    const e = (26 * (STORM_A * 0.25 * 255)) / 255;
    expect(s[3]).toBeLessThanOrEqual(e + 1.01);
    expect(s[3]).toBeGreaterThanOrEqual(0);
  });
  it('零 α texel:出面全 0(A=0 纯加性档不产黑方块)', () => {
    const out = stormAddBake(new Uint8ClampedArray([50, 50, 50, 0, 0, 0, 0, 0]),
      160, 140, 100, STORM_A * 255);
    expect([...out]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('BJ403-② 亮 texel:rgb 预乘逐字节精确(白螺旋身份),α 过冲单边钉住', () => {
  it('白不透明 texel(255,255,255,255) f=1:回读预乘=(160,140,100)±1(=XNA P)', () => {
    const add = addedPremul(bakeTexel(255, 255, 255, 255, 1));
    expect(Math.abs(add[0] - 160)).toBeLessThanOrEqual(1);
    expect(Math.abs(add[1] - 140)).toBeLessThanOrEqual(1);
    expect(Math.abs(add[2] - 100)).toBeLessThanOrEqual(1);
  });
  it('存面 α=max(e,aR,aG,aB):亮点位 ∈[e, aR+1](过冲登记边界,禁翻面也禁黑斑回潮)', () => {
    const s = bakeTexel(255, 255, 255, 255, 1);
    const e = (255 * (STORM_A * 255)) / 255;
    const aR = (255 * 255 * TINT[0]) / 65025;
    expect(s[3]).toBeGreaterThanOrEqual(e - 1.01);
    expect(s[3]).toBeLessThanOrEqual(aR + 1.01);
    // 暗 texel:α 恒=e 精确(无过冲)
    const d = bakeTexel(50, 50, 50, 26, 1);
    expect(d[3]).toBeLessThanOrEqual((26 * (STORM_A * 255)) / 255 + 1.01);
  });
});

describe('BJ403-③ XNA 递推等价:暗 texel 逐层双通道对拍;亮 texel rgb 对拍+α 单边', () => {
  const LAYERS = 12;
  it('暗 texel(50,50,50,26):12 层 canvas 语义 vs XNA 式 |Δα|,|Δrgb| ≤0.02', () => {
    const x = xnaRecursion(50, 50, 50, 26, 1, LAYERS);
    const c = canvasRecursion(50, 50, 50, 26, 1, LAYERS);
    for (let k = 0; k < 3; k++) expect(Math.abs(c.rgb[k] - x.rgb[k])).toBeLessThanOrEqual(0.02);
    expect(Math.abs(c.al - x.al)).toBeLessThanOrEqual(0.02);
  });
  it('亮 texel(255,255,255,255):rgb 对拍 ≤0.02;α ≥XNA−0.01(过冲单边,不暗不黑)', () => {
    const x = xnaRecursion(255, 255, 255, 255, 1, LAYERS);
    const c = canvasRecursion(255, 255, 255, 255, 1, LAYERS);
    for (let k = 0; k < 3; k++) expect(Math.abs(c.rgb[k] - x.rgb[k])).toBeLessThanOrEqual(0.02);
    expect(c.al).toBeGreaterThanOrEqual(x.al - 0.01);
  });
  it('黑斑不变式:任意 texel 12 层后 α>0.5 ⇒ 预乘 rgb>0.1(rgb 与 α 同源,禁脱钩)', () => {
    for (const [r, g, b, a] of [[50, 50, 50, 26], [255, 255, 255, 255], [200, 200, 200, 102],
      [255, 255, 255, 77], [10, 10, 10, 128]] as const) {
      const c = canvasRecursion(r, g, b, a, 1, LAYERS);
      if (c.al > 0.5) {
        const premul = c.rgb[0] + c.rgb[1] + c.rgb[2];
        expect(premul, `texel(${r},${g},${b},${a}) α=${c.al.toFixed(2)} rgb 和`).toBeGreaterThan(0.1);
      }
    }
  });
});

describe('BJ403-④ 源码锚(修法在盘,防回退)', () => {
  const src = () => readFileSync(join(GAME_ROOT, 'src/entities/proj1457.ts'), 'utf8');
  it('stormAddBake 在盘且桶走 putImageData;旧 multiply+destination-in 桶已摘', () => {
    const s = src();
    expect(s).toMatch(/export function stormAddBake/);
    expect(s).toMatch(/im\.data\.set\(stormAddBake\(/);
    expect(s).not.toMatch(/globalCompositeOperation = 'multiply'/);
    expect(s).not.toMatch(/globalCompositeOperation = 'destination-in'/);
  });
  it('α=max(e,aR,aG,aB) 判别式在盘(尘系存面约束范式)', () => {
    expect(src()).toMatch(/const m = Math\.max\(e, aR, aG, aB\);/);
  });
});
