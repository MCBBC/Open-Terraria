// ★BJ316 2026-09-23 开包掉帧双刀结构锁+行为锁
// 真机 trace 定谳（/Users/vinlic/Downloads/Trace-20260923T222003.json,120→82.5fps）:
//   刀1 GLWorldCompose.uploadRaw 每帧 2×gl.getError 全管线 sync（关包 0.97ms/帧 →
//       开包 4.03ms/帧=GPU 争用放大）→ 体检收审计窗（首 3 传+尺寸首见+recreate 重审）。
//   刀2 UI vinvPulseTick 逐帧 setProperty('--invpulse') → 全槽 ::after opacity calc
//       派生 → 开包每帧 style recalc 0.97ms+94 Paint/帧 1.06ms+142 PaintImage/帧
//       0.25ms（关包全 0）→ 改 CSS @keyframes 合成器动画（包络同域 0.706↔0.941/5s）。
// 锁面：稳态零 getError（行为）/审计窗三触发（行为）/CSS 动画四要素+零逐帧 DOM 写（结构）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GLWorldCompose, type RawLight } from '../src/render/GLWorldCompose';

const src = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const composeSrc = src('../src/render/GLWorldCompose.ts');
const uiSrc = src('../src/ui/UI.ts');

/** 最小 GL mock：仅 uploadRaw 触达的子面+调用计数 */
function makeGL(opts: { errAfterTex?: number; errBefore?: number } = {}) {
  const calls = { getError: 0, texImage2D: 0, drain: 0 };
  const NO_ERROR = 0, INVALID_OPERATION = 1282, TEXTURE_2D = 5890;
  let texCalls = 0;
  const gl = {
    NO_ERROR, INVALID_OPERATION, TEXTURE_2D,
    TEXTURE0: 33984, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 33163, UNPACK_FLIP_Y_WEBGL: 37440,
    RGBA8UI: 36836, RGBA_INTEGER: 36249, UNSIGNED_BYTE: 5121,
    activeTexture() { /* */ },
    bindTexture() { /* */ },
    pixelStorei() { /* */ },
    texImage2D() { calls.texImage2D++; texCalls++; },
    getError() {
      calls.getError++;
      // 排空段（texImage2D 前的调用）=errBefore 语义;体检段=texImage2D 后
      if (texCalls === 0) {
        if ((opts.errBefore ?? 0) > 0) { (opts as { errBefore?: number }).errBefore = (opts.errBefore ?? 0) - 1; return INVALID_OPERATION; }
        return NO_ERROR;
      }
      return (opts.errAfterTex ?? 0) > 0 ? INVALID_OPERATION : NO_ERROR;
    },
  };
  // 排空计数：getError 在 texImage2D 前且连续 NO_ERROR 之外的调用记 drain
  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}

function makeWC(): { wc: GLWorldCompose; any: Record<string, unknown> } {
  // 绕开构造器（GLPipeline 需真实 DOM/WebGL）——原型实例+手工字段
  const wc = Object.create(GLWorldCompose.prototype) as GLWorldCompose;
  const a = wc as unknown as Record<string, unknown>;
  a._rawAuditLeft = 3;
  a._rawAuditKey = '';
  a._rawBuf = null;
  a._rawBroken = false;
  a.lastFail = '';
  a.texRaw = {} as WebGLTexture;
  a.pipeline = { statName: 'bj316-test' };
  return { wc, any: a };
}

function makeRaw(rw: number, rh: number): RawLight {
  const n = rw * rh;
  return {
    r: new Uint8Array(n).fill(200), g: new Uint8Array(n).fill(180), b: new Uint8Array(n).fill(160),
    rx: 0, ry: 0, rw, rh, tx0: 0, ty0: 0, w2: rw * 2, h2: rh * 2,
  };
}

describe('BJ316 刀1：uploadRaw getError 体检审计窗', () => {
  it('稳态（同尺寸重复上传）审计窗耗尽后零 getError', () => {
    const { wc } = makeWC();
    const { gl, calls } = makeGL();
    const rl = makeRaw(80, 50);
    // 首 3 次上传=审计窗（各含排空 while ≥1 次 + 体检 1 次 → getError ≥2 次/审计帧）
    for (let i = 0; i < 3; i++) expect((wc as unknown as { uploadRaw(g: WebGL2RenderingContext, r: RawLight): boolean }).uploadRaw(gl, rl)).toBe(true);
    const after3 = calls.getError;
    expect(after3).toBeGreaterThanOrEqual(6);
    // 稳态 20 帧：零 getError（★本刀核心——原版每帧 2 次 sync）
    for (let i = 0; i < 20; i++) expect((wc as unknown as { uploadRaw(g: WebGL2RenderingContext, r: RawLight): boolean }).uploadRaw(gl, rl)).toBe(true);
    expect(calls.getError).toBe(after3);
    expect(calls.texImage2D).toBe(23);
  });

  it('尺寸首见重审一次（视口/缩放变化 → rw/rh 变）', () => {
    const { wc } = makeWC();
    const { gl, calls } = makeGL();
    const rl = makeRaw(80, 50);
    for (let i = 0; i < 3; i++) (wc as unknown as { uploadRaw(g: WebGL2RenderingContext, r: RawLight): boolean }).uploadRaw(gl, rl);
    const before = calls.getError;
    // 新尺寸首传=审计（≥1 getError）;随后同尺寸稳态零
    (wc as unknown as { uploadRaw(g: WebGL2RenderingContext, r: RawLight): boolean }).uploadRaw(gl, makeRaw(81, 50));
    const afterResize = calls.getError;
    expect(afterResize).toBeGreaterThan(before);
    (wc as unknown as { uploadRaw(g: WebGL2RenderingContext, r: RawLight): boolean }).uploadRaw(gl, makeRaw(81, 50));
    expect(calls.getError).toBe(afterResize);
  });

  it('审计窗检出 RGBA8UI 拒收 → _rawBroken+返 false（全黑案防御保持）', () => {
    const { wc, any } = makeWC();
    const { gl } = makeGL({ errAfterTex: 999 });   // 每次体检段都拒
    const up = (wc as unknown as { uploadRaw(g: WebGL2RenderingContext, r: RawLight): boolean }).uploadRaw.bind(wc);
    expect(up(gl, makeRaw(80, 50))).toBe(false);
    expect(any._rawBroken).toBe(true);
    expect((any.lastFail as string)).toBe('raw-upload-glerror');
  });

  it('稳态帧错误队列不再消费（不误伤 _rawBroken;登记的语义收窄面）', () => {
    const { wc, any } = makeWC();
    const { gl, calls } = makeGL();
    const up = (wc as unknown as { uploadRaw(g: WebGL2RenderingContext, r: RawLight): boolean }).uploadRaw.bind(wc);
    for (let i = 0; i < 3; i++) up(gl, makeRaw(80, 50));
    expect(any._rawBroken).toBe(false);
    const before = calls.getError;
    // 模拟稳态帧（errAfterTex 动态翻转后）——这里直接以零错误验证零读
    up(gl, makeRaw(80, 50));
    expect(calls.getError).toBe(before);
    expect(any._rawBroken).toBe(false);
  });

  it('结构锁：审计窗字段/recreate 重审/审计门体检', () => {
    expect(composeSrc).toContain('private _rawAuditLeft = 3;');
    expect(composeSrc).toContain('private _rawAuditKey = \'\';');
    expect(composeSrc).toContain('const audit = this._rawAuditLeft > 0 || this._rawAuditKey !== kW;');
    expect(composeSrc).toContain('if (audit && gl.getError() !== gl.NO_ERROR)');
    // recreate 重审（上下文重建=新逐上下文确定性域）
    expect(composeSrc).toContain("this._rawAuditLeft = 3; this._rawAuditKey = '';");
    // 排空 while 唯一（审计窗内）
    expect((composeSrc.match(/while \(gl\.getError\(\) !== gl\.NO_ERROR\)/g) || []).length).toBe(1);
  });
});

describe('BJ316 刀2：脉冲 CSS 合成器动画+逐帧 DOM 写退役', () => {
  it('@keyframes 包络同域（0.706↔0.941 半程 5s 线性 alternate）', () => {
    expect(uiSrc).toContain('@keyframes sw-vinv-pulse { from { opacity:0.706; } to { opacity:0.941; } }');
    expect(uiSrc).toContain('animation:sw-vinv-pulse 5s linear 0s infinite alternate;');
    expect(uiSrc).toContain('will-change:opacity;');
  });

  it('显式 --slot-alpha 槽退出脉冲（属性子串选择器=原定值支同域）', () => {
    expect(uiSrc).toContain('.sw-vinv .sw-slot[style*="--slot-alpha"]::after { animation:none; will-change:auto; }');
  });

  it('hover 全亮 !important（author important > 运行中动画;不摘动画）', () => {
    expect(uiSrc).toContain('.sw-vinv .sw-slot:hover::after { opacity:1 !important; }');
  });

  it('★稳态零逐帧 DOM 写：--invpulse setProperty 与 invAlpha 账面全撤', () => {
    // 精确匹配调用面（.style.setProperty）——注释中的字面提法不算
    expect(uiSrc).not.toContain(".style.setProperty('--invpulse'");
    expect(uiSrc).not.toContain('vinvPulseA');
    expect(uiSrc).not.toContain('vinvPulseDir');
    // CSS 缺省支保留（var(--invpulse,0) 死支=opt-out 槽 fallback,文档面）
    expect(uiSrc).toContain('var(--invpulse, 0)');
  });

  it('rAF 环其余逐帧职责保留（mH 新鲜度/modern 滤器/吸附步进）', () => {
    expect(uiSrc).toContain('this.vinvLayoutCtx.minimapOn !== mm) this.layoutVanilla();');
    expect(uiSrc).toContain('vinvFilterRemain(this.vinvModernCraftFilter)');
    expect(uiSrc).toContain('this.vinvCraftGlideAcc += dt / (1000 / 60);');
    expect(uiSrc).toContain('requestAnimationFrame(this.vinvPulseTick)');
  });
});
