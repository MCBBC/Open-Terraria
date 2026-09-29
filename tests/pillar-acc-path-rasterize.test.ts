// ★四柱掉帧定谳批（2026-09-25）交互②锁：acc 态路径 op（beginPath/arc/…）镜像录制
// + stroke/fill 隔离栅格化直支（GLShimExecutor.recordPathOp/rasterizePathOp）。
// 红（旧码）：acc 态 beginPath 走「读值面」ensureBridged → flush+degradeAcc 整帧
//   降级（drawForceFieldBubble 尾环 2268/2502 帧必降定谳面,b2b-acc-degraded 100%）。
// 绿（本批）：路径构造零降级;stroke 发射 quad（gco=lighter→ADD）;fallback=0。
// 变异判别：摘 stroke/fill 直支 → a)/c) 退化回降级=红;摘路径录制/回放 → d) 红。
// node 无真实 canvas:栅格化落点/UV 在 accScratch 桩上断言（像素对拍=浏览器 AB 探针）。
import { describe, expect, it, beforeEach } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

interface QuadCall { usx: number; usy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

/** accScratch 所需最小 2D 桩（栅格化落点记录面） */
class ScratchCtx {
  log: string[] = [];
  globalAlpha = 1; strokeStyle = '#000'; fillStyle = '#000'; lineWidth = 1; filter = 'none';
  lineCap: CanvasLineCap = 'butt'; lineJoin: CanvasLineJoin = 'miter'; miterLimit = 10;
  setTransform(..._a: number[]): void { this.log.push('setTransform'); }
  clearRect(): void { this.log.push('clearRect'); }
  beginPath(): void { this.log.push('beginPath'); }
  arc(...a: unknown[]): void { this.log.push('arc:' + a.join(',')); }
  rect(...a: unknown[]): void { this.log.push('rect:' + a.join(',')); }
  stroke(): void { this.log.push('stroke'); }
  fill(): void { this.log.push('fill'); }
}
class ScratchCanvas {
  width = 64; height = 64;
  ctx = new ScratchCtx();
  getContext(): ScratchCtx { return this.ctx; }
}
let lastScratch: ScratchCanvas | null = null;
beforeEach(() => {
  lastScratch = new ScratchCanvas();
  (globalThis as Record<string, unknown>).document = {
    createElement(): unknown { return lastScratch; },
  };
});

/** bridge 态 raw 桩（路径 op 原生委托/降级回放记录面） */
class FakeCtx {
  log: string[] = [];
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  imageSmoothingEnabled = false;
  fillStyle = '#000'; strokeStyle = '#000'; lineWidth = 1; filter = 'none';
  font = '10px sans-serif'; textAlign: CanvasTextAlign = 'left';
  lineCap: CanvasLineCap = 'butt'; lineJoin: CanvasLineJoin = 'miter'; miterLimit = 10;
  getTransform() { return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f } as DOMMatrix; }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f; }
  save() { this.log.push('save'); } restore() { this.log.push('restore'); }
  beginPath() { this.log.push('beginPath'); }
  arc(...a: unknown[]) { this.log.push('arc:' + a.join(',')); }
  stroke() { this.log.push('stroke'); }
  fill() { this.log.push('fill'); }
  fillText(t: string) { this.log.push('fillText:' + t); }
  drawImage() { this.log.push('drawImage'); }
}

/** acc 态 host 桩（b2-shim-executor mkAccHost 扩展:quad/texRefresh/degrade→真 bridge） */
function mkAccHost(exRef: { current: GLShimExecutor | null }, bridgeRaw: FakeCtx) {
  const quads: QuadCall[] = [];
  let degradeCalls = 0;
  const layer = {
    unavailable: false,
    open: false,
    beginCalls: [] as Array<[string, boolean]>,
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin(name: string, clear: boolean) { this.beginCalls.push([name, clear]); this.open = true; },
    resize() { /* no-op */ },
    endAccumulate() { this.open = false; return null; },
    blendAdditive() { /* no-op */ },
    blendErase() { /* no-op */ },
    blendMult() { /* no-op */ },
    quadSprite(_e: unknown, usx: number, usy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
      quads.push({ usx, usy, sw, sh, dx, dy, dw, dh });
    },
    texRefresh(_key: string, img: { width: number; height: number }) {
      return { tex: {}, w: img.width, h: img.height, key: _key };
    },
    texRefreshRegion(_key: string, img: { width: number; height: number }, _w: number, _h: number) {   // ★刀I补桩(P1-B 子区增量 24e6e76b;隔离栅格化族同入口,返回同一 entry 形状)
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
        if (ex) ex.bridge(bridgeRaw as unknown as CanvasRenderingContext2D);   // 生产链=Renderer.degradeAcc→shim.bridge
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

/** drawForceFieldBubble 尾环 acc 态同款序列（save/样式/beginPath/arc/stroke/restore） */
function ringStroke(wrap: CanvasRenderingContext2D): void {
  wrap.save();
  wrap.globalCompositeOperation = 'lighter';
  wrap.globalAlpha = 0.35;
  wrap.strokeStyle = 'rgb(255,120,60)';
  wrap.lineWidth = 3;
  wrap.beginPath();
  wrap.arc(400, 300, 50, 0, Math.PI * 2);
  wrap.stroke();
  wrap.restore();
}

describe('四柱掉帧批②：acc 态路径录制+stroke/fill 隔离栅格化', () => {
  it('盾泡尾环（beginPath+arc+stroke,lighter）：零降级+零 fallback+1 枚 ADD quad（旧码必降=红）', () => {
    const { ex, wrap, quads, degradeN } = setupAcc();
    ringStroke(wrap);
    expect(degradeN()).toBe(0);                    // ★红→绿核心:不再整帧降级
    expect(ex.stats.fallback).toBe(0);
    expect(quads.length).toBe(1);                  // 栅格化产物 quad
    expect(ex.stats.emitADD).toBe(1);              // lighter→ADD 档
    expect(ex.stats.emitSO).toBe(0);
    // quad 设备矩形≈arc bbox（半宽 1.5+AA 1px pad）;UV 整幅
    const q = quads[0];
    expect(q.usx).toBe(0); expect(q.usy).toBe(0);
    expect(q.dx).toBeLessThanOrEqual(400 - 50 - 2);
    expect(q.dx + q.dw).toBeGreaterThanOrEqual(400 + 50 + 2);
    expect(q.dy).toBeLessThanOrEqual(300 - 50 - 2);
    expect(q.dy + q.dh).toBeGreaterThanOrEqual(300 + 50 + 2);
    // 栅格化在整数对齐 scratch 上按原 CTM 重放（B2b 判例:覆盖率逐位的前提）
    const s = lastScratch!.ctx.log;
    expect(s).toContain('beginPath');
    expect(s).toContain('arc:400,300,50,0,6.283185307179586');
    expect(s).toContain('stroke');
  });

  it('stroke 后路径不清（canvas 语义）：二次 stroke 同路径再栅格化,beginPath 才清', () => {
    const { wrap, quads, degradeN, ex } = setupAcc();
    wrap.beginPath();
    wrap.arc(100, 100, 30, 0, 7);
    wrap.stroke();
    wrap.stroke();
    expect(degradeN()).toBe(0);
    expect(quads.length).toBe(2);
    expect(ex.stats.fallback).toBe(0);
    wrap.beginPath();
    wrap.rect(0, 0, 10, 10);
    wrap.stroke();
    expect(quads.length).toBe(3);                  // 新路径
  });

  it('fill 录制路径走同款直支（SO 档）;空路径 stroke=no-op 不降级不发射', () => {
    const { ex, wrap, quads, degradeN } = setupAcc();
    wrap.globalCompositeOperation = 'source-over';
    wrap.fillStyle = 'rgb(10,200,30)';
    wrap.beginPath();
    wrap.arc(50, 50, 20, 0, 7);
    wrap.fill();
    expect(ex.stats.emitSO).toBe(1);
    expect(ex.stats.fallback).toBe(0);
    expect(degradeN()).toBe(0);
    const n = quads.length;
    wrap.beginPath();
    wrap.stroke();                                  // 空路径
    expect(quads.length).toBe(n);                   // no-op
    expect(ex.stats.fallback).toBe(0);
    expect(degradeN()).toBe(0);
  });

  it('gco=multiply 的 stroke 走降级原链:degrade→bridge 回放镜像态+录制路径（降级帧尾环仍画出,宁降级不丢内容）', () => {
    const { ex, wrap, degradeN, bridgeRaw } = setupAcc();
    wrap.globalCompositeOperation = 'multiply';
    wrap.beginPath();
    wrap.arc(10, 10, 5, 0, 7);
    wrap.stroke();
    expect(degradeN()).toBe(1);
    expect(ex.stats.fallback).toBe(1);
    // bridge(raw) 已回放:镜像态 + 录制路径原样重放（beginPath 清录制不入表,
    // 重放从首个构造 op 起=等价「op 本就发给 raw」）→ 原生 stroke 有路径可画
    expect(bridgeRaw.log[0]).toBe('arc:10,10,5,0,7');
    expect(bridgeRaw.log[1]).toBe('stroke');
    expect(bridgeRaw.strokeStyle).toBe('#000');      // 镜像态回放（multiply 前未设 strokeStyle）
    expect(bridgeRaw.globalCompositeOperation).toBe('multiply');
  });

  it('bridge（非 acc）态路径 op 原生委托不变（旧链零回归面）', () => {
    const raw = new FakeCtx();
    const exRef: { current: GLShimExecutor | null } = { current: null };
    const { host } = mkAccHost(exRef, new FakeCtx());
    const ex = new GLShimExecutor(host);
    const wrap = ex.attach(raw as unknown as CanvasRenderingContext2D);
    expect(wrap).not.toBeNull();
    raw.globalCompositeOperation = 'lighter';
    raw.strokeStyle = 'rgb(1,2,3)';
    raw.lineWidth = 3;
    raw.beginPath();
    raw.arc(10, 10, 5, 0, 7);
    raw.stroke();
    expect(raw.log).toEqual(['beginPath', 'arc:10,10,5,0,7', 'stroke']);
  });
});
