// ★BJ556（2026-10-07）：鞭标记白天暗影复验——混合语义定谳钉值测试。
//  定谳（探针 scripts/_bj556-contrast.mjs 昼夜×亮怪204/僵尸3 双靶三段取证 + 原版亲读）：
//  · 层位无差：原版 DrawInterface_1_2（Main.cs:47250-47284）=接口层在世界画面
//    【之上】叠绘（Draw 链世界渲染完→DrawInterface 同一 backbuffer）——亮底依赖
//    与本仓 7f 位同面;BJ553 挪位次正确。_bj553l 探针 maxΔ=163 全来自冻结靶
//    暗/中桶（僵尸身底）,亮桶未测=盲区;_bj556 同场景复现 163 同值（确定性）。
//  · 真根因=混合语义：XNA SpriteBatch BlendState.AlphaBlend=（SrcBlend=One,
//    DstBlend=InverseSourceAlpha）预乘语义（判例=Renderer.ts Extra_N 段注:
//    「color.A 只削底、不缩放 src 贡献」）→ 原版 final = tex.rgb×(178/255)
//    + dst×(1−89/255)。canvas source-over 单笔强制 src.rgb×α（A 双乘 RGB）
//    → BJ553 单笔 globalAlpha=89/255 把 RGB 贡献砍半成 tex.rgb×0.244——
//    探针实锤:亮桶(bg 204-208)均值 Δ=−3..−9.3（暗影≈不可见=用户复报
//    「白天非常暗几乎不可见」）,夜暗桶 +52..+58（「夜晚明显」自洽）。
//  · 落刀=两遍拆解精确等价：pass1 source-over α=89/255（InverseSourceAlpha 削底）
//    + pass2 'lighter' α=166/255（SrcBlend=One RGB 补足,89+166=255 → 贡献
//    =tex.rgb×0.698 精确,255 钳位点与原版混合输出一致）+ c10e 透明 HUD 域
//    幂等垫底（fullbright 帧跳过 7-涂层扫尾∧flushTrailShade 空队列早退的窗口）。
//  · 复测（同探针）:亮桶均值翻正 +44..+62.5/中桶 +61.6..+103/夜桶 +166..+174,
//    与解析表 (tex×0.698+bg×0.651, 钳 255) 全列吻合;DAY2=DAY 确定性;7f 状态
//    残留=空（flushTrailShade 全程 save/restore,无 globalAlpha/CompositeOp 污染）。
//  变异证红：
//   M1 删 pass2 'lighter' 补足笔（回退 BJ553 单笔）→ ①红
//   M2 删 c10eCompositeIntoHud 幂等垫底 → ①红
//   M3 TOPUP 166→89（α 恒等破坏）→ ②③红
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WHIP_MARKER_TINT_RGB, WHIP_MARKER_ALPHA, WHIP_MARKER_RGB_TOPUP,
} from '../src/render/Renderer';

const HERE = dirname(fileURLToPath(import.meta.url));
const rendererSrc = readFileSync(join(HERE, '..', 'src', 'render', 'Renderer.ts'), 'utf8');

// 标记绘制块切片（★BJ553 头注起、7a-pre 标尺止）
function markerBlock(): string {
  const start = rendererSrc.indexOf('// ★BJ553（2026-10-07）：鞭 tag/召唤集火目标标记');
  const end = rendererSrc.indexOf('// 7a-pre. 建筑配件标尺');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return rendererSrc.slice(start, end);
}

describe('① 混合语义=两遍精确等价（M1/M2 证红面）', () => {
  it('pass2 lighter 补足笔存在且序正确：削底笔→lighter→补足笔→restore（M1）', () => {
    const blk = markerBlock();
    // 单笔回退（无 lighter/无 TOPUP）=此序断言红
    expect(blk).toMatch(
      /globalAlpha = WHIP_MARKER_ALPHA[\s\S]*?drawImage\([\s\S]*?WHIP_MARKER_RGB_TOPUP[\s\S]*?'lighter'[\s\S]*?drawImage\([\s\S]*?ctx\.restore\(\)/,
    );
  });
  it('c10e 透明 HUD 域幂等垫底在绘制之前（M2）', () => {
    const blk = markerBlock();
    const latch = blk.indexOf('this.c10eCompositeIntoHud()');
    const draw = blk.indexOf('ctx.save()');
    expect(latch).toBeGreaterThan(0);
    expect(draw).toBeGreaterThan(latch);
  });
});

describe('② 常量代数（M3 证红面）', () => {
  it('色面 = Color.White×0.7 截断 178 / A/=2 = 89（:47272-47273,BJ512 锚沿用）', () => {
    expect(WHIP_MARKER_TINT_RGB).toBe(178);
    expect(WHIP_MARKER_ALPHA).toBeCloseTo(89 / 255, 12);
  });
  it('RGB 补足因子 = 166/255 且 ALPHA+TOPUP===1（SrcBlend=One 满强度;89+166=255）', () => {
    expect(WHIP_MARKER_RGB_TOPUP).toBeCloseTo(166 / 255, 12);
    expect(WHIP_MARKER_ALPHA + WHIP_MARKER_RGB_TOPUP).toBe(1);
  });
});

describe('③ 原版混合解析表（判别面:亮桶 Δ 符号;M3 证红面）', () => {
  // Extra_199 实测三 texel（RGBA 直读,二值 α 全不透明灰阶）
  const TEXELS = [235, 210, 143] as const;
  // 原版 AlphaBlend(One/InvSrcAlpha)：out = tex.rgb×tint + dst×(1−A)，255 钳
  const vanillaOut = (bg: number, tex: number): number =>
    Math.min(255, tex * (WHIP_MARKER_TINT_RGB / 255) + bg * (1 - WHIP_MARKER_ALPHA));
  // BJ553 单笔 source-over（canvas src.rgb×α 双乘）
  const buggyOut = (bg: number, tex: number): number =>
    tex * (WHIP_MARKER_TINT_RGB / 255) * WHIP_MARKER_ALPHA + bg * (1 - WHIP_MARKER_ALPHA);

  it('判别面:亮底(bg 204/255)原版 Δ>0（亮化覆盖层）,BJ553 单笔 Δ<0（暗影=用户复报）', () => {
    for (const tex of TEXELS) {
      expect(vanillaOut(204, tex) - 204).toBeGreaterThan(0);   // 探针亮桶翻正判据
      expect(buggyOut(204, tex) - 204).toBeLessThan(0);        // 旧病:暗影
    }
  });
  it('全 bg×texel 域:两遍拆解 ≡ 原版输出（ALPHA+TOPUP=1 的精确代数;255 钳位同点）', () => {
    for (let bg = 0; bg <= 255; bg += 17) {
      for (const tex of TEXELS) {
        // pass1 贡献 tex×tint×ALPHA（≤0.244+0.651×255=0.895 不提前钳）,pass2 补足
        const pass1 = tex * (WHIP_MARKER_TINT_RGB / 255) * WHIP_MARKER_ALPHA
          + bg * (1 - WHIP_MARKER_ALPHA);
        const twoPass = Math.min(255, pass1
          + tex * (WHIP_MARKER_TINT_RGB / 255) * WHIP_MARKER_RGB_TOPUP);
        expect(twoPass).toBeCloseTo(vanillaOut(bg, tex), 9);
      }
    }
  });
  it('解析锚值（探针 _bj556 实测对照面）:夜暗底 8 原版 Δ≈+164/亮底 204 钳 255 Δ≈+51', () => {
    expect(vanillaOut(8, 235) - 8).toBeCloseTo(161.25, 1);   // 夜桶 +166..+174 实测
    expect(vanillaOut(204, 235)).toBe(255);                   // 亮桶钳饱和,+51
    expect(vanillaOut(140, 143) - 140).toBeCloseTo(51.0, 1);  // 中桶绿草底
  });
});

describe('④ 数据面沿用（BJ512/553 锚不回归）', () => {
  it('贴图/帧面符号仍在（whipMarkerFrameRect/whipMarkerFrameIndex 未动）', () => {
    expect(rendererSrc).toContain('export function whipMarkerFrameIndex');
    expect(rendererSrc).toContain('export function whipMarkerFrameRect');
    expect(rendererSrc).toContain("ensureVImage('vanilla/Extra_199.png')");
  });
  it('标记块仍在光照合成后全亮域（BJ553 M1 面沿用）', () => {
    const compIdx = rendererSrc.indexOf('this.compositeLight(cam, viewW, viewH');
    const markerIdx = rendererSrc.indexOf('// ★BJ553（2026-10-07）：鞭 tag/召唤集火目标标记');
    expect(markerIdx).toBeGreaterThan(compIdx);
  });
});
