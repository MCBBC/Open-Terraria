// ★b2b-acc-degraded 清偿批锁（2026-10-05）：acc 态读值面/文本 op 的降级清偿。
// 定谳面（scripts/_acc-degrade-census.mjs 定谳仪,活机注入自检）：
//   inj:measureText 99.5% 降级 / inj:fillText 100% / inj:clip/getImageData/
//   isPointInPath/putImageData/strokeText 100% —— 每窗一次触发即整帧降级。
// 本锁钉：
//   ① measureText acc 态走专用度量 ctx（font/align/baseline 镜像置位）→ 零降级,
//     与 raw 同态度量同数;RV_MEASURE_OFF 逃生门恢复旧降级链。
//   ② fillText/strokeText acc 态走 rasterizeText 隔离栅格化（墨盒 bbox+镜像 CTM
//     文本态重放+单 quad 发射,lighter→ADD）→ 零降级;TEXT_RASTER_OFF 恢复旧链;
//     TEXT_RASTER_CAP 超帽支=高频风暴保险回降级。
//   ③ 安全网保留：putImageData 等真长尾仍降级（degradeAcc 调用不丢）;
//     bridge/已降级态文本委托 raw 不走栅格化（最小面）。
// node 无真实 canvas:度量/栅格化落点在记录桩上断言（像素对拍=浏览器 AB 探针）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

interface QuadCall { usx: number; usy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number; }

/** 度量/栅格化共享 2D 桩（记录面;measureText=font 号×长度确定性假度量） */
class TextCtx {
  log: string[] = [];
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle = '#000'; lineWidth = 1; filter = 'none';
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'left';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  lineCap: CanvasLineCap = 'butt'; lineJoin: CanvasLineJoin = 'miter'; miterLimit = 10;
  setTransform(..._a: number[]): void { this.log.push('setTransform'); }
  clearRect(): void { this.log.push('clearRect'); }
  measureText(text: string): TextMetrics {
    const px = Math.abs(parseFloat(this.font)) || 10;
    // 假度量=px×len（含字号;镜像字体置位错则宽必错=判别器）
    return {
      width: px * text.length,
      actualBoundingBoxAscent: px * 0.8,
      actualBoundingBoxDescent: px * 0.2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: px * text.length,
    } as TextMetrics;
  }
  fillText(t: string, x: number, y: number, mw?: number): void {
    this.log.push(`fillText:${t}:${x},${y}${mw !== undefined ? ',' + mw : ''}`);
  }
  strokeText(t: string, x: number, y: number, mw?: number): void {
    this.log.push(`strokeText:${t}:${x},${y}${mw !== undefined ? ',' + mw : ''}`);
  }
}
class TextCanvas {
  width = 64; height = 64;
  ctx = new TextCtx();
  getContext(): TextCtx { return this.ctx; }
}
const sharedCanvas = new TextCanvas();

beforeEach(() => {
  sharedCanvas.ctx.log.length = 0;
  (globalThis as Record<string, unknown>).document = {
    createElement(): unknown { return sharedCanvas; },
  };
});
afterEach(() => {
  GLShimExecutor.RV_MEASURE_OFF = false;
  GLShimExecutor.TEXT_RASTER_OFF = false;
});

/** bridge 态 raw 桩（文本原生委托记录面） */
class FakeCtx {
  log: string[] = [];
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  imageSmoothingEnabled = false;
  fillStyle = '#000'; strokeStyle = '#000'; lineWidth = 1; filter = 'none';
  font = '10px sans-serif'; textAlign: CanvasTextAlign = 'left'; textBaseline: CanvasTextBaseline = 'alphabetic';
  getTransform() { return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f } as DOMMatrix; }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f; }
  save() { this.log.push('save'); } restore() { this.log.push('restore'); }
  measureText(t: string): TextMetrics { return { width: t.length * 10 } as TextMetrics; }
  fillText(t: string) { this.log.push('fillText:' + t); }
  strokeText(t: string) { this.log.push('strokeText:' + t); }
  putImageData(): void { this.log.push('putImageData'); }
  drawImage(): void { this.log.push('drawImage'); }
}

/** acc 态 host 桩（pillar-acc-path-rasterize mkAccHost 同式） */
function mkAccHost(exRef: { current: GLShimExecutor | null }, bridgeRaw: FakeCtx) {
  const quads: QuadCall[] = [];
  let degradeCalls = 0;
  const layer = {
    unavailable: false, open: false,
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin(_name: string, _clear: boolean) { this.open = true; },
    resize(): void { /* */ },
    endAccumulate() { this.open = false; return null; },
    blendAdditive(): void { /* */ }, blendErase(): void { /* */ }, blendMult(): void { /* */ },
    quadSprite(_e: unknown, usx: number, usy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
      quads.push({ usx, usy, sw, sh, dx, dy, dw, dh });
    },
    texRefresh(_key: string, img: { width: number; height: number }) {
      return { tex: {}, w: img.width, h: img.height, key: _key };
    },
    texRefreshRegion(_key: string, img: { width: number; height: number }, _w: number, _h: number) {
      return { tex: {}, w: img.width, h: img.height, key: _key };
    },
    texAlive() { return true; },
  };
  return {
    layer, quads,
    degradeN: () => degradeCalls,
    host: {
      acquireGl: () => (layer.unavailable ? null : (layer as never)),
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 720,
      degradeAcc: () => {
        degradeCalls++;
        const ex = exRef.current;
        if (ex) ex.bridge(bridgeRaw as unknown as CanvasRenderingContext2D);
        return true;
      },
    },
  };
}

function setupAcc() {
  const exRef: { current: GLShimExecutor | null } = { current: null };
  const bridgeRaw = new FakeCtx();
  const { host, quads, degradeN } = mkAccHost(exRef, bridgeRaw);
  const ex = new GLShimExecutor(host);
  exRef.current = ex;
  const wrap = ex.attachAcc();
  expect(wrap).not.toBeNull();
  return { ex, wrap: wrap as unknown as CanvasRenderingContext2D, quads, degradeN, bridgeRaw };
}

describe('b2b-acc-degraded 清偿①：acc 态 measureText 走专用度量 ctx（零降级）', () => {
  it('悬停名板同款序列（set font→measureText）：零降级零 fallback,度量=镜像字体同数', () => {
    const { wrap, degradeN, ex } = setupAcc();
    wrap.font = '12px "Fusion Pixel 12px", sans-serif';
    const m = (wrap as unknown as CanvasRenderingContext2D).measureText('DrawHouseBanner');
    expect(degradeN()).toBe(0);                    // ★红→绿核心:纯读 op 不再整帧降级
    expect(ex.stats.fallback).toBe(0);
    expect(ex.stats.degradeTriggers['rv:measureText']).toBeUndefined();
    // 假度量=px×len;镜像 font=12px → 12×15
    expect(m.width).toBe(12 * 'DrawHouseBanner'.length);
  });

  it('度量态三镜像（font/align/baseline）置位进度量 ctx;align 读回镜像', () => {
    const { wrap } = setupAcc();
    wrap.font = '20px Fake';
    wrap.textAlign = 'center';
    wrap.textBaseline = 'middle';
    expect(wrap.textAlign).toBe('center');
    expect(wrap.textBaseline).toBe('middle');      // ★清偿②:baseline 读回镜像（旧码 undefined）
    const m = (wrap as unknown as CanvasRenderingContext2D).measureText('abc');
    expect(m.width).toBe(20 * 3);                  // 镜像 font 置位=度量同源
    expect(sharedCanvas.ctx.font).toBe('20px Fake');
    expect(sharedCanvas.ctx.textAlign).toBe('center');
    expect(sharedCanvas.ctx.textBaseline).toBe('middle');
  });

  it('RV_MEASURE_OFF 逃生门:恢复旧降级链（degradeAcc 调用+rv: 触发归因）', () => {
    GLShimExecutor.RV_MEASURE_OFF = true;
    const { wrap, degradeN, ex } = setupAcc();
    const m = (wrap as unknown as CanvasRenderingContext2D).measureText('x');
    expect(m).toBeDefined();
    expect(degradeN()).toBe(1);
    expect(ex.stats.degradeTriggers['rv:measureText']).toBe(1);
  });
});

describe('b2b-acc-degraded 清偿③：acc 态 fillText/strokeText 隔离栅格化（零降级）', () => {
  it('旗布悬停名同款序列（font/fillStyle/textAlign→fillText）：零降级+1 枚 SO quad+墨盒重放', () => {
    const { ex, wrap, quads, degradeN } = setupAcc();
    wrap.font = '12px "Fusion Pixel 12px", sans-serif';
    wrap.fillStyle = 'rgba(20,16,28,0.85)';
    wrap.textAlign = 'center';
    wrap.fillText('旅商', 400, 300);
    expect(degradeN()).toBe(0);                    // ★红→绿核心:文本落笔不再整帧降级
    expect(ex.stats.fallback).toBe(0);
    expect(ex.stats.emitSO).toBe(1);
    expect(quads.length).toBe(1);
    const q = quads[0];
    expect(q.usx).toBe(0); expect(q.usy).toBe(0);
    // 墨盒=度量 bbox（假度量 ascent 0.8px/descent 0.2px×12=9.6/2.4 +顶底垫 3+AA1）
    expect(q.dy).toBeLessThanOrEqual(300 - 9.6 - 3);
    expect(q.dy + q.dh).toBeGreaterThanOrEqual(300 + 2.4 + 3);
    expect(q.dx).toBeLessThanOrEqual(400);         // 左缘=锚点（abL=0）
    expect(q.dx + q.dw).toBeGreaterThanOrEqual(400);
    // scratch 重放=镜像 CTM 文本态原值（整数对齐 B2b 判例）
    const s = sharedCanvas.ctx.log;
    expect(s).toContain(`fillText:旅商:400,300`);
    expect(sharedCanvas.ctx.font).toBe('12px "Fusion Pixel 12px", sans-serif');
    expect(sharedCanvas.ctx.textAlign).toBe('center');
    expect(sharedCanvas.ctx.fillStyle).toBe('rgba(20,16,28,0.85)');
  });

  it('lighter 态 strokeText→ADD 档;strokeStyle/lineWidth 镜像重放;maxWidth 透传', () => {
    const { ex, wrap, quads, degradeN } = setupAcc();
    wrap.globalCompositeOperation = 'lighter';
    wrap.font = '14px Fake';
    wrap.strokeStyle = '#00ff88';
    wrap.lineWidth = 3;
    wrap.strokeText('inj', 100, 120, 50);
    expect(degradeN()).toBe(0);
    expect(ex.stats.emitADD).toBe(1);
    expect(quads.length).toBe(1);
    expect(sharedCanvas.ctx.log).toContain('strokeText:inj:100,120,50');
    expect(sharedCanvas.ctx.strokeStyle).toBe('#00ff88');
    expect(sharedCanvas.ctx.lineWidth).toBe(3);
  });

  it('baseline 镜像参与重放（rasterizeText 用 textBaseline 镜像值）', () => {
    const { wrap } = setupAcc();
    wrap.textBaseline = 'bottom';
    wrap.fillText('t', 50, 60);
    expect(sharedCanvas.ctx.textBaseline).toBe('bottom');
  });

  it('每窗帽 TEXT_RASTER_CAP:超帽笔走降级原链（P0-B 高频风暴保险）', () => {
    const { wrap, degradeN, ex } = setupAcc();
    for (let i = 0; i < 32; i++) wrap.fillText('t' + i, 10 + i, 20);
    expect(degradeN()).toBe(0);                    // 帽内全栅格化
    wrap.fillText('over', 10, 20);                 // 第 33 笔=超帽
    expect(degradeN()).toBe(1);
    expect(ex.stats.degradeTriggers['tail:fillText']).toBe(1);
    expect(ex.stats.fallback).toBe(1);
  });

  it('TEXT_RASTER_OFF 逃生门:恢复旧降级链', () => {
    GLShimExecutor.TEXT_RASTER_OFF = true;
    const { wrap, degradeN, ex } = setupAcc();
    wrap.fillText('t', 10, 20);
    expect(degradeN()).toBe(1);
    expect(ex.stats.degradeTriggers['tail:fillText']).toBe(1);
  });

  it('gco=multiply 的 fillText 仍降级（改面算子不可隔离=安全网保留）', () => {
    const { wrap, degradeN, bridgeRaw } = setupAcc();
    wrap.globalCompositeOperation = 'multiply';
    wrap.fillText('t', 10, 20);
    expect(degradeN()).toBe(1);
    expect(bridgeRaw.log).toContain('fillText:t');   // bridge 回放后原生消费=内容不丢
  });
});

describe('b2b-acc-degraded 清偿：安全网保留面（破坏性场景仍能降级）', () => {
  it('putImageData/clip 等真长尾照旧降级（accFailLedger 同族安全网不摘）', () => {
    const { wrap, degradeN, ex } = setupAcc();
    (wrap as unknown as Record<string, (...a: unknown[]) => unknown>).putImageData({}, 0, 0);
    (wrap as unknown as CanvasRenderingContext2D).clip?.();
    expect(degradeN()).toBeGreaterThanOrEqual(1);   // 第二笔已降级后不再计（raw 可用）
    expect(ex.stats.fallback).toBeGreaterThanOrEqual(1);
  });

  it('bridge 态文本走 raw 原生委托（不走栅格化,旧链零回归）', () => {
    const raw = new FakeCtx();
    const exRef: { current: GLShimExecutor | null } = { current: null };
    const { host } = mkAccHost(exRef, new FakeCtx());
    const ex = new GLShimExecutor(host);
    const wrap = ex.attach(raw as unknown as CanvasRenderingContext2D);
    expect(wrap).not.toBeNull();
    raw.font = '12px Fake';
    (wrap as CanvasRenderingContext2D).fillText('bridge', 10, 10);
    expect(raw.log).toEqual(['fillText:bridge']);
    expect(ex.stats.emitSO).toBe(0);
  });

  it('降级后（raw 可用）文本走 raw 直绘（降级帧不二次栅格化）', () => {
    const { wrap, bridgeRaw, degradeN } = setupAcc();
    (wrap as unknown as Record<string, (...a: unknown[]) => unknown>).putImageData({}, 0, 0);   // 触发降级
    expect(degradeN()).toBe(1);
    const n = bridgeRaw.log.length;
    wrap.fillText('after', 10, 10);
    expect(bridgeRaw.log.slice(n)).toEqual(['fillText:after']);
    expect(sharedCanvas.ctx.log).not.toContain('fillText:after:10,10');   // 未走栅格化
  });

  it('定谳仪静态账:触发计数+首触发调用方栈归因入账', () => {
    const ops0 = { ...GLShimExecutor.degradeOps };
    const { wrap } = setupAcc();
    (wrap as unknown as Record<string, (...a: unknown[]) => unknown>).putImageData({}, 0, 0);
    (wrap as unknown as Record<string, (...a: unknown[]) => unknown>).putImageData({}, 0, 0);   // 降级后不再计
    const delta = (GLShimExecutor.degradeOps['tail:putImageData'] ?? 0) - (ops0['tail:putImageData'] ?? 0);
    expect(delta).toBe(1);                          // 每窗首个触发计数
  });
});
