// ★P0-B/P1-A 锁（2026-09-27 星云案三刀修复批）。
// P0-B 兜底零上传：缺图注入（node 无 Image → projSprite 恒 null=缺图态）→
//   Arrow.draw 在 acc 窗内【零 path op/零 texRefresh】——旧「短线兜底」在 acc 态
//   =每弹每帧 beginPath/stroke→rasterizePathOp 隔离栅格化+共享 scratch 整幅上传
//   （proj1457.ts:1780「本通道只可承载低频落笔」判例违例;发布面贴图 404 时=永久
//   逐帧全幅上传病）。
// P1-A 滞回回落：accScratch 旧「只增不减」被离群大 op 撑大（实测 1650²）后所有
//   栅格化按整幅上传——现需求≤当前一半（滞回防抖）缩回 max(基线 64,需求),
//   R3b-2 boltScratch（proj1457.ts:1918）判例移植。
// 变异判别：①摘 Arrow 缺图不画支（复原 stroke 兜底）→ test A 红且 test B 同证
//   rasterize/texRefresh 链活;②摘 accScratch 滞回回落支 → test D 红（撑大不回）。
// node 无真实 canvas:栅格化落点/texRefresh 在桩上断言（像素对拍=浏览器 AB 探针）。
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Arrow } from '../src/entities/Arrow';

// ★_accScratch 是模块级单例——vi.resetModules+动态重导入保证每用例从 64 基线起测
// （静态导入的旧模块副本会跨用例持旧 scratch,撑大态泄入下用例=伪红）
type ExecMod = typeof import('../src/render/glshim/GLShimExecutor');
type ShimExec = InstanceType<ExecMod['GLShimExecutor']>;
let GLShimExecutor: ExecMod['GLShimExecutor'];

interface QuadCall { usx: number; usy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }

/** accScratch 所需最小 2D 桩（栅格化落点记录面;含 moveTo/lineTo=线段兜底重放形） */
class ScratchCtx {
  log: string[] = [];
  globalAlpha = 1; strokeStyle = '#000'; fillStyle = '#000'; lineWidth = 1; filter = 'none';
  lineCap: CanvasLineCap = 'butt'; lineJoin: CanvasLineJoin = 'miter'; miterLimit = 10;
  setTransform(..._a: number[]): void { this.log.push('setTransform'); }
  clearRect(): void { this.log.push('clearRect'); }
  beginPath(): void { this.log.push('beginPath'); }
  moveTo(...a: unknown[]): void { this.log.push('moveTo:' + a.join(',')); }
  lineTo(...a: unknown[]): void { this.log.push('lineTo:' + a.join(',')); }
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
beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../src/render/glshim/GLShimExecutor');
  GLShimExecutor = mod.GLShimExecutor;
  lastScratch = new ScratchCanvas();
  (globalThis as Record<string, unknown>).document = {
    createElement(): unknown { return lastScratch; },
  };
});

/** bridge 态 raw 桩 */
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
  moveTo(...a: unknown[]) { this.log.push('moveTo:' + a.join(',')); }
  lineTo(...a: unknown[]) { this.log.push('lineTo:' + a.join(',')); }
  arc(...a: unknown[]) { this.log.push('arc:' + a.join(',')); }
  stroke() { this.log.push('stroke'); }
  fill() { this.log.push('fill'); }
  fillText(t: string) { this.log.push('fillText:' + t); }
  drawImage() { this.log.push('drawImage'); }
}

/** acc 态 host 桩:texRefresh 调次+尺寸序列记账（零上传判据/滞回落面） */
function mkAccHost(exRef: { current: ShimExec | null }, bridgeRaw: FakeCtx) {
  const quads: QuadCall[] = [];
  const texRefreshSizes: Array<[number, number]> = [];
  let texRefreshCalls = 0;
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
      texRefreshCalls++;
      texRefreshSizes.push([img.width, img.height]);
      return { tex: {}, w: img.width, h: img.height, key: _key };
    },
    // ★刀I补桩(P1-B 子区增量 24e6e76b):本文件判据=「上传笔数」(零上传/被观测),
    //   子区上传也是上传 → 并入同一账本,零上传判据语义不变
    texRefreshRegion(_key: string, img: { width: number; height: number }, _w: number, _h: number) {
      texRefreshCalls++;
      texRefreshSizes.push([img.width, img.height]);
      return { tex: {}, w: img.width, h: img.height, key: _key };
    },
    texAlive() { return true; },
  };
  return {
    layer, quads, texRefreshSizes,
    texRefreshN: () => texRefreshCalls,
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
  const exRef: { current: ShimExec | null } = { current: null };
  const bridgeRaw = new FakeCtx();
  const h = mkAccHost(exRef, bridgeRaw);
  const ex = new GLShimExecutor(h.host);
  exRef.current = ex;
  const wrap = ex.attachAcc();
  expect(wrap).not.toBeNull();
  return { ex, wrap: wrap as unknown as CanvasRenderingContext2D, ...h, bridgeRaw };
}

describe('★P0-B 兜底零上传（缺图注入→acc 窗零 path op/零 texRefresh）', () => {
  it('A) Arrow 618（星云追踪弹,缺图态）draw:零 stroke 栅格化/零 texRefresh/零 quad', () => {
    const { wrap, texRefreshN, quads, degradeN } = setupAcc();
    // node 无 Image → projSprite(618) 恒 null=缺图注入（生产对应:发布面贴图 404）
    const a = new Arrow(400, 300, 6, 0, 10, 1, 618, { grav: 0, life: 600 });
    a.draw({ ctx: wrap } as never, {} as never);
    expect(lastScratch!.ctx.log.filter((s) => s === 'stroke' || s === 'fill')).toEqual([]);
    expect(texRefreshN()).toBe(0);
    expect(quads.length).toBe(0);
    expect(degradeN()).toBe(0);   // 零降级（不触发整帧 flush+2D 回放）
  });

  it('B) 判别器有效性:同窗直画旧兜底线段序列 → 栅格化+texRefresh 链被观测（红证）', () => {
    const { wrap, texRefreshN } = setupAcc();
    // 旧「短线兜底」在 acc 态的等价序列（Arrow.ts 3381 已摘支）:save/样式/beginPath/
    // moveTo/lineTo/stroke——本断言证明:若该支被复原,本桩必见 rasterizePathOp
    // （scratch 重放 stroke）+ texRefresh（整幅上传）——test A 的零值判据因此有效。
    wrap.save();
    wrap.strokeStyle = '#D8C8A0';
    wrap.lineWidth = 2;
    wrap.beginPath();
    wrap.moveTo(400, 300);
    wrap.lineTo(400, 286);
    wrap.stroke();
    wrap.restore();
    expect(lastScratch!.ctx.log).toContain('stroke');
    expect(texRefreshN()).toBeGreaterThanOrEqual(1);
  });
});

describe('★P1-A accScratch 滞回回落（R3b-2 boltScratch 判例移植）', () => {
  it('C) 离群大 op 撑面（600×600 级 bbox）→ 面随需求涨', () => {
    const { wrap } = setupAcc();
    wrap.save();
    wrap.strokeStyle = 'rgb(255,120,60)';
    wrap.lineWidth = 3;
    wrap.beginPath();
    wrap.arc(400, 300, 300, 0, Math.PI * 2);
    wrap.stroke();
    wrap.restore();
    expect(lastScratch!.width).toBeGreaterThanOrEqual(600);
    expect(lastScratch!.height).toBeGreaterThanOrEqual(600);
  });

  it('D) 撑大后小 op（≤一半）→ 缩回 max(64,需求)（滞回回落主判据）', () => {
    const { wrap } = setupAcc();
    // 先撑大（本文件内首次触面即 64 基线,arc bbox 600×600 级 → 涨）
    wrap.save();
    wrap.strokeStyle = '#888';
    wrap.beginPath();
    wrap.arc(400, 300, 290, 0, Math.PI * 2);
    wrap.stroke();
    wrap.restore();
    const bigW = lastScratch!.width, bigH = lastScratch!.height;
    expect(bigW).toBeGreaterThanOrEqual(580);
    // 小 op:线段 bbox ≈ 24×22+pad —— 需求≤当前一半 → 缩回 max(64,需求)
    wrap.save();
    wrap.strokeStyle = '#D8C8A0';
    wrap.lineWidth = 2;
    wrap.beginPath();
    wrap.moveTo(400, 300);
    wrap.lineTo(400, 286);
    wrap.stroke();
    wrap.restore();
    expect(lastScratch!.width).toBeLessThan(bigW);
    expect(lastScratch!.width).toBeLessThanOrEqual(64 + 12);   // max(64, bbox≈20)+pad 容差
    expect(lastScratch!.height).toBeLessThanOrEqual(64 + 12);
  });

  it('E) 滞回带内不抖:需求∈(一半,全宽] → 不缩（防逐帧 drop+rebuild churn）', () => {
    const { wrap } = setupAcc();
    // 撑到 ~300×300（arc r=140 → bbox 280×280+pad）
    wrap.save();
    wrap.strokeStyle = '#888';
    wrap.beginPath();
    wrap.arc(400, 300, 140, 0, Math.PI * 2);
    wrap.stroke();
    wrap.restore();
    const w1 = lastScratch!.width;
    expect(w1).toBeGreaterThanOrEqual(280);
    // 需求 ~200×200:200*2=400 > 300 → 滞回带内,不缩
    wrap.save();
    wrap.strokeStyle = '#888';
    wrap.beginPath();
    wrap.arc(400, 300, 95, 0, Math.PI * 2);
    wrap.stroke();
    wrap.restore();
    expect(lastScratch!.width).toBe(w1);
  });

  it('F) 尺寸回落与 texRefresh 换尺寸重建通道衔接（涨/缩两态都换尺寸重传）', () => {
    const { wrap, texRefreshSizes } = setupAcc();
    wrap.save();
    wrap.strokeStyle = '#888';
    wrap.beginPath();
    wrap.arc(400, 300, 200, 0, Math.PI * 2);
    wrap.stroke();
    wrap.restore();
    const grown = texRefreshSizes[texRefreshSizes.length - 1]!;
    expect(grown[0]).toBeGreaterThanOrEqual(400);
    // 小 op 触发回落:回落当拍 texRefresh 收到的源尺寸=缩后尺寸(<涨态)
    wrap.save();
    wrap.strokeStyle = '#D8C8A0';
    wrap.lineWidth = 2;
    wrap.beginPath();
    wrap.moveTo(400, 300);
    wrap.lineTo(400, 286);
    wrap.stroke();
    wrap.restore();
    const shrunk = texRefreshSizes[texRefreshSizes.length - 1]!;
    expect(shrunk[0]).toBeLessThan(grown[0]);
    expect(shrunk[0]).toBeLessThanOrEqual(64 + 12);
  });
});
