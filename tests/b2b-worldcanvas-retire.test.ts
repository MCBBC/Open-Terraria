// ★B2b worldCanvas 退役 结构锁+行为锁（2026-09-24）。
// 源码锚锁面（node 无 GL/document,像素对拍=scripts/_b2b-world-ab.mjs 探针锁）:
//   ①Renderer acc 分支/收口/句柄/读回/降级五件齐备且挂 ?b2b 旗;
//   ②GLWorldCompose LIT_FRAG 单点派生（uWorldFlip）+句柄直采支（零上传）;
//   ③GLSpriteLayer begin(clear)/endAccumulate/isAccumOpen/blendErase;
//   ④GLShimExecutor acc 行为:发射序=2D 序/tier-2 削底/尘对吞抑/降级触发。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const WC = readFileSync(join(__dirname, '../src/render/GLWorldCompose.ts'), 'utf8');
const GSL = readFileSync(join(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const SHIM = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');

// ---- ① Renderer acc 装配源码锚 ----
describe('B2b Renderer 装配（源码锚）', () => {
  it('?b2b 旗存在且缺省开+document 判死+?b2b=0 逃生门', () => {
    expect(RDR).toContain('_b2b = (() =>');
    expect(RDR).toContain("get('b2b') !== '0'");
    expect(RDR).toContain("if (typeof document === 'undefined') return false;\n      return new URLSearchParams(location.search).get('b2b') !== '0';");
  });
  it('beginWorldLayer acc 分支:bgl+bglShim+b2b 三旗合取+worldCanvas 不创建', () => {
    expect(RDR).toContain('Renderer.bgl && Renderer.bglShim && Renderer.b2b && !this.isCpuRender()');
    // acc 分支先于 worldCanvas 创建块（attachAcc 早退返回）
    const accIdx = RDR.indexOf('attachAcc()');
    const createIdx = RDR.indexOf("this.worldCanvas = document.createElement('canvas');", RDR.indexOf('private beginWorldLayer'));
    expect(accIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(RDR.indexOf('private beginWorldLayer')).toBeLessThan(accIdx);
  });
  it('finishAccFrame:flushAcc→endAccumulate→detach 收口链', () => {
    expect(RDR).toContain('private finishAccFrame(): PipelineFbo | null');
    expect(RDR).toContain('this.bglEntShim?.flush();          // acc flush=直发累积面（空队列 no-op）');
    expect(RDR).toContain('this._accGlw?.endAccumulate()');
  });
  it('compositeLight:accFbo 句柄换指双支（lrecon+A2）+fullbright/lightfast present 支', () => {
    expect(RDR).toContain('const accFbo = this.finishAccFrame();');
    expect(RDR).toContain('if (Renderer.wfbo && Renderer.lrecon && !this.isCpuRender() && (accFbo?.tex || this.worldCanvas)) {');
    expect(RDR).toContain('accFbo?.tex ? this.accHandle(accFbo)! : this.worldCanvas!');
    expect(RDR).toContain('this.swPipe.present(accFbo);');
  });
  it('旧链（GLWorldLight 需 canvas 上传）在 acc 帧不可达', () => {
    expect(RDR).toContain('const gl = accFbo ? null : this.worldLightLayer();');
  });
  it('accReadbackImageData:readPixels 读回替代 getImageData（unpremultiply+行序翻转）', () => {
    expect(RDR).toContain('private accReadbackImageData(f: PipelineFbo');
    expect(RDR).toContain('gl.readPixels(0, 0, lw, lh, gl.RGBA, gl.UNSIGNED_BYTE, this._accRbBuf);');
    expect(RDR).toContain('const lh - 1 - y'.length > 0 ? '(lh - 1 - y) * rowFull' : '');
    expect(RDR).toContain('Math.round(src[si] * 255 / a)');
    expect(RDR).toContain('accFbo ? this.accReadbackImageData(accFbo, viewW, viewH)');
  });
  it('degradeAcc:惰性建 worldCanvas+present FBO+shim.bridge（双路径并存）', () => {
    expect(RDR).toContain('private degradeAcc(): boolean {');
    expect(RDR).toContain("this.worldCanvas = document.createElement('canvas');\n      this.worldCtxLayer = this.worldCanvas.getContext('2d', { willReadFrequently: true })!;");
    expect(RDR).toContain('this.bglEntShim.bridge(this.worldCtxLayer)');
  });
  it('分窗在 acc/bridged 帧 no-op（防整层包装被 detach 杀）', () => {
    expect(RDR).toContain("if (this._accMode !== 'off') {\n      this.bglPathUsed = (this._accMode === 'acc' ? 'b2b-acc-' : 'b2b-acc-degraded-') + tag;");
    expect(RDR).toContain("private bglEntWindowEnd(): void {\n    if (this._accMode !== 'off') return;");
  });
  it('bglStageGrid acc 续交:无 end 无回贴+全量预验（防半截 quads 落累积面后重画双混）', () => {
    expect(RDR).toContain('if (acc) this.bglEntShim?.flush();');
    expect(RDR).toContain('// 续交态:不 end（FBO 保持开,compositeLight finishAccFrame 收口）');
    expect(RDR).toContain('if (acc) {\n        for (let cy = y0; cy <= y1; cy++) {');
  });
  it('fg 门控面登记动态源（endFgPass drawImage 经 shim=quad,不登记=陈旧纹理水冻结）', () => {
    expect(RDR).toContain('if (gate && Renderer.bgl && Renderer.bglShim) this.bglShimReg().markDynamic(gate);');
  });
});

// ---- ② GLWorldCompose 句柄面源码锚 ----
describe('B2b GLWorldCompose 句柄换指（源码锚）', () => {
  it('LIT_FRAG 单点派生自 GLWorldLight.FRAG（uWorldFlip 恒等支+翻转支）', () => {
    expect(WC).toContain("const LIT_FRAG = GLWorldLight.FRAG");
    expect(WC).toContain("'vec4 w = texture2D(uWorld, vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uWorldFlip)));'");
    // 派生仅两处 replace,其余保持单源引用
    const deriv = WC.slice(WC.indexOf('const LIT_FRAG'), WC.indexOf('export interface WorldTexSrc'));
    expect((deriv.match(/replace\(/g) ?? []).length).toBe(2);
  });
  it('compose 双型入参+句柄直采支零上传+uWorldFlip 0/1 两态', () => {
    expect(WC).toContain('world: HTMLCanvasElement | WorldTexSrc');
    expect(WC).toContain('if (worldTex) {');
    expect(WC).toContain("gl.uniform1f(this.pipeline.uni(this.pLit, 'uWorldFlip'), (world as WorldTexSrc).flipY);");
    expect(WC).toContain("gl.uniform1f(this.pipeline.uni(this.pLit, 'uWorldFlip'), 0);");
    // 句柄支内不得出现 canvas 上传
    const handleBranch = WC.slice(WC.indexOf('if (worldTex) {'), WC.indexOf('gl.activeTexture(gl.TEXTURE1);'));
    expect(handleBranch).not.toContain('texSubImage2D');
    expect(handleBranch).not.toContain('texImage2D');
  });
  it('recreate 重注册走 LIT_FRAG（句柄面随上下文重生保活）', () => {
    expect((WC.match(/program\('worldLight', LIT_VERT, LIT_FRAG\)/g) ?? []).length).toBe(2);
  });
});

// ---- ③ GLSpriteLayer 累积面源码锚 ----
describe('B2b GLSpriteLayer 累积面（源码锚）', () => {
  it('begin(clear) 参数化:endAccumulate 不 present 返 FBO/isAccumOpen 判据', () => {
    expect(GSL).toContain('begin(fboName = \'clouds\', clear = true): void {');
    expect(GSL).toContain('if (clear) gl.clear(gl.COLOR_BUFFER_BIT);');
    expect(GSL).toContain('endAccumulate(): PipelineFbo | null {');
    expect(GSL).toContain('isAccumOpen(name: string): boolean {');
    // endAccumulate 不调 present
    const ea = GSL.slice(GSL.indexOf('endAccumulate(): PipelineFbo | null {'), GSL.indexOf('isAccumOpen'));
    expect(ea).not.toContain('present(');
  });
  it('blendErase 档（ZERO,1−SA=destination-out 固定功能表）', () => {
    expect(GSL).toContain('blendErase(on: boolean): void {');
    expect(GSL).toContain('gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);');
  });
});

// ---- ④ GLShimExecutor acc 行为锁（node 可跑:层桩记录面） ----
interface QuadLog { kind: string; dx: number; dy: number; dw: number; dh: number; texKey?: string }
function mkAccLayer() {
  const quads: QuadLog[] = [];
  const blends: string[] = [];
  const layer: Record<string, unknown> = {
    unavailable: false,
    isAccumOpen: (n: string) => n === 'world' && layer.__open === true,
    resize: () => { layer.__open = true; },
    begin: (_n: string, clear?: boolean) => { blends.push('begin' + (clear === false ? ':noclear' : ':clear')); layer.__open = true; },
    blendAdditive: (on: boolean) => blends.push(on ? 'add:on' : 'add:off'),
    blendErase: (on: boolean) => blends.push(on ? 'erase:on' : 'erase:off'),
    quadSprite: (e: { key?: string }, _ux: number, _uy: number, _sw: number, _sh: number,
      dx: number, dy: number, dw: number, dh: number) => {
      quads.push({ kind: 'quad', dx, dy, dw, dh, texKey: e?.key });
    },
    texAlive: () => true,
    texFromRegion: (_k: string, img: { __id?: number }) => ({ key: 'r' + (img.__id ?? '?'), tex: {}, w: 8, h: 8, stamp: 1, bytes: 256 }),
    texRefresh: (_k: string, img: { __id?: number }) => ({ key: 'd' + (img.__id ?? '?'), tex: {}, w: 8, h: 8, stamp: 1, bytes: 256 }),
    texFromData: (_k: string) => ({ key: 'pair', tex: {}, w: 8, h: 8, stamp: 1, bytes: 256 }),
  };
  return { layer: layer as never, quads, blends, marks: layer };
}

function mkImg(id: number): CanvasImageSource {
  return { width: 8, height: 8, __id: id } as unknown as CanvasImageSource;
}

describe('B2b GLShimExecutor acc 行为', () => {
  it('attachAcc+flushAcc:quad 依 2D 调用序发射（单 FBO 累积,无 present 回贴面）', () => {
    const { layer, quads, blends } = mkAccLayer();
    const sh = new GLShimExecutor({
      acquireGl: () => layer as never,
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 720,
    });
    const ctx = sh.attachAcc();
    expect(ctx).not.toBeNull();
    ctx!.drawImage(mkImg(1), 10, 20);
    ctx!.drawImage(mkImg(2), 30, 40);
    sh.flush();
    expect(quads.map((q) => q.texKey)).toEqual(['r1', 'r2']);   // 发射序=调用序
    expect(blends.filter((b) => b.startsWith('begin')).length).toBe(1);
    expect(sh.stats.flushes).toBe(1);
  });
  it('acc 态 ADD 与 SO 交错保序（连续同档合并 blend 切换;离场还原基态）', () => {
    const { layer, quads, blends } = mkAccLayer();
    const sh = new GLShimExecutor({
      acquireGl: () => layer as never,
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 720,
    });
    const ctx = sh.attachAcc()!;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(mkImg(1), 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(mkImg(2), 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(mkImg(3), 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    sh.flush();
    expect(quads.map((q) => q.texKey)).toEqual(['r1', 'r2', 'r3']);   // 交错序保持（测试源未标动态→region 解析）
    expect(blends).toEqual(['begin:clear', 'add:on', 'add:off', 'add:on', 'add:off']);
  });
  it('acc 态未注册 destination-out→tier-2 ERASE quad（削底对累积面生效）+后随 add 不吞抑', () => {
    const { layer, quads, blends } = mkAccLayer();
    const sh = new GLShimExecutor({
      acquireGl: () => layer as never,
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 720,
    });
    const ctx = sh.attachAcc()!;
    const erase = mkImg(9), add = mkImg(10);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(erase, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(add, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    sh.flush();
    expect(sh.stats.emitErase).toBe(1);
    expect(quads.map((q) => q.texKey)).toEqual(['r9', 'r10']);   // 削底+加算两笔都在
    expect(blends).toContain('erase:on');
    expect(blends).toContain('erase:off');
  });
  it('acc 态注册尘对仍走合并单 quad+吞抑后随 add（B2b 步2:dst 衰减对累积面）', () => {
    const { layer, quads } = mkAccLayer();
    const sh = new GLShimExecutor({
      acquireGl: () => layer as never,
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 720,
    });
    const add = mkImg(21) as unknown as HTMLCanvasElement;
    const erase = mkImg(22) as unknown as HTMLCanvasElement;
    sh.registerDustPair(add, erase, new Uint8Array(8 * 8 * 4));
    const ctx = sh.attachAcc()!;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(erase, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(add, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    sh.flush();
    expect(sh.stats.pairEmitted).toBe(1);
    expect(sh.stats.pairSuppressed).toBe(1);
    expect(quads.map((q) => q.texKey)).toEqual(['pair']);   // 合并单 quad,add 被吞
  });
  it('GL 死亡:acc flush 触发 host.degradeAcc+2D 重放（宁回退不丢精灵）', () => {
    let degraded = 0;
    const { layer } = mkAccLayer();
    (layer as { unavailable: boolean }).unavailable = true;
    const draws: Array<[unknown, unknown[]]> = [];
    const sh = new GLShimExecutor({
      acquireGl: () => layer as never,
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 720,
      degradeAcc: () => { degraded++; return true; },
    });
    const ctx = sh.attachAcc();
    expect(ctx).toBeNull();   // attach 期已死→null（调用方回落 2D 链）
    // 运行期死亡:attachAcc 成功后翻 unavailable
    (layer as { unavailable: boolean }).unavailable = false;
    const ctx2 = sh.attachAcc()!;
    (layer as { unavailable: boolean }).unavailable = true;
    const img = mkImg(3);
    ctx2.drawImage(img, 5, 6);
    sh.flush();
    expect(degraded).toBe(1);
    expect(sh.stats.flushes).toBe(0);   // 队列未发射（弃/replay 均不计发射）
  });
  it('bridge 态不产生 tier-2（destination-out 未注册=flush+2D 回退,B2 现状不变）', () => {
    const rec: Array<[string, unknown[]]> = [];
    const raw = {
      drawImage(img: unknown, ...a: unknown[]) { rec.push(['draw', [img, ...a]]); },
      save() { /* noop */ }, restore() { /* noop */ },
      setTransform() { /* noop */ }, getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix; },
      globalAlpha: 1, globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      imageSmoothingEnabled: false, filter: 'none',
    };
    const { layer } = mkAccLayer();
    const sh = new GLShimExecutor({
      acquireGl: () => layer as never,
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 720,
    });
    const ctx = sh.attach(raw as unknown as CanvasRenderingContext2D);
    expect(ctx).not.toBeNull();
    ctx!.globalCompositeOperation = 'destination-out';
    ctx!.drawImage(mkImg(9), 0, 0);
    sh.flush();
    expect(sh.stats.emitErase).toBe(0);
    expect(rec.length).toBe(1);   // raw 原参重放
  });
});
