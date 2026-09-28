// ★B2 shim 执行器 结构锁+行为锁（2026-09-24）。
// node 可跑面：FakeCtx stub（GL 侧全程不可用→flush 走 2D 重放支）——
//   解码（CTM×dst）/发射序/吞抑/混合档/save-restore/回退触发 全在重放参数上断言。
// 像素对拍=scripts/_b2-entity-ab.mjs（node 无 GL/canvas,该面探针锁）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';
import { dustPremulBake } from '../src/fx/VanillaDust';
import { texId } from '../src/render/texId';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const SRC = readFileSync(join(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');

// ---- FakeCtx：记录面 drawImage/fillRect 参数与状态（重放落点） ----
// ★R2-F1 判别器面:mat=落笔瞬间的 CTM 快照（rot/flip 经 translate/rotate/scale
// 折进矩阵——flip 轴错置在矩阵符号上可判;args 携源矩形=非对称精灵判别面）。
interface DrawRec { op: 'draw' | 'fill'; img: unknown; args: unknown[]; gco: string; alpha: number; smooth: boolean; mat: [number, number, number, number, number, number] }
class FakeCtx {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  imageSmoothingEnabled = false;
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'left';
  fillTextLog: Array<{ text: string; x: number; y: number }> = [];
  stack: Array<Pick<FakeCtx, 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'globalAlpha' | 'globalCompositeOperation' | 'imageSmoothingEnabled' | 'fillStyle'>> = [];
  log: DrawRec[] = [];
  getTransform() { const t = { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f }; return t as DOMMatrix; }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
  }
  save() { this.stack.push({ a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f, globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, imageSmoothingEnabled: this.imageSmoothingEnabled, fillStyle: this.fillStyle }); }
  restore() { const s = this.stack.pop(); if (s) Object.assign(this, s); }
  translate(x: number, y: number) { this.e += this.a * x + this.c * y; this.f += this.b * x + this.d * y; }
  scale(x: number, y: number) { this.a *= x; this.b *= x; this.c *= y; this.d *= y; }
  rotate(th: number) {
    const cos = Math.cos(th), sin = Math.sin(th);
    const a = this.a, b = this.b, c = this.c, d = this.d;
    this.a = a * cos + c * sin; this.b = b * cos + d * sin;
    this.c = c * cos - a * sin; this.d = d * cos - b * sin;
  }
  drawImage(img: unknown, ...args: unknown[]) { this.log.push({ op: 'draw', img, args, gco: this.globalCompositeOperation, alpha: this.globalAlpha, smooth: this.imageSmoothingEnabled, mat: [this.a, this.b, this.c, this.d, this.e, this.f] }); }
  fillRect(x: number, y: number, w: number, h: number) { this.log.push({ op: 'fill', img: null, args: [x, y, w, h], gco: this.globalCompositeOperation, alpha: this.globalAlpha, smooth: this.imageSmoothingEnabled, mat: [this.a, this.b, this.c, this.d, this.e, this.f] }); }
  fillText(text: string, x: number, y: number) { this.fillTextLog.push({ text, x, y }); }
  createLinearGradient(_x0: number, _y0: number, _x1: number, _y1: number) { return { addColorStop() {} }; }
}

/** acc 态 host 桩：有状态 stub 层（isAccumOpen/begin/endAccumulate 可观测）——
 *  普查案③（残 FBO 弃用）与案②（font/textAlign 镜像）行为锁 */
function mkAccHost() {
  const layer = {
    unavailable: false,
    open: false,
    beginCalls: [] as Array<[string, boolean]>,
    endAccumCalls: 0,
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin(name: string, clear: boolean) { this.beginCalls.push([name, clear]); this.open = true; },
    resize() { /* no-op */ },
    endAccumulate() { this.endAccumCalls++; this.open = false; return null; },
    blendAdditive() { /* no-op */ },
    blendErase() { /* no-op */ },
    blendMult() { /* no-op */ },
    quadSprite() { /* no-op */ },
    texFromRegion() { return { tex: {}, w: 8, h: 8, key: 'stub' }; },   // 假条目：过预解析门（本组只锁 begin/clear 时序）
    texFromData() { return null; },
    texRefresh() { return null; },
    texFromImage() { return null; },
    texAlive() { return true; },
  };
  return {
    layer,
    host: {
      acquireGl: () => (layer.unavailable ? null : (layer as never)),
      worldCtx: () => null,
      worldW: () => 128, worldH: () => 72,
    },
  };
}

/** host 桩:attach 期层可用;翻 layer.unavailable=true 后 flush 走 2D 重放支。
 *  ★R1-F8:attach 现含残开 FBO 守卫——桩补 isAccumOpen/endAccumulate 最小面。 */
function mkHost() {
  const layer = {
    unavailable: false,
    isAccumOpen: (_n: string) => false,
    endAccumulate: () => null,
  } as { unavailable: boolean };
  return {
    layer,
    host: {
      acquireGl: () => (layer.unavailable ? null : (layer as never)),
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 720,
    },
  };
}

function mkImg(id: number): CanvasImageSource {
  return { width: 64, height: 64, __id: id } as unknown as CanvasImageSource;
}

/** 建 executor 并 attach（GL 不可用路径——flush 走 2D 重放,重放参数=解码结果） */
function setup(opts: { transform?: [number, number, number, number, number, number] } = {}) {
  const raw = new FakeCtx();
  if (opts.transform) raw.setTransform(...opts.transform);
  const { host, layer } = mkHost();
  const ex = new GLShimExecutor(host);
  const wrap = ex.attach(raw as unknown as CanvasRenderingContext2D);
  expect(wrap).not.toBeNull();
  return { raw, ex, layer, wrap: wrap as unknown as FakeCtx };
}

describe('B2 Renderer 接线结构锁', () => {
  it('窗口挂钩:behindTiles 段+实体主窗 begin/end;bglShim 转正缺省开（?bglshim=0 逃生门;2026-09-24 用户实测裁决）', () => {
    expect(RDR).toContain("this.bglEntWindowBegin('behind')");
    expect(RDR).toContain("this.bglEntWindowBegin('ent')");
    expect(RDR).toContain('this.bglEntWindowEnd();   // ★B2 实体主窗收口（flush present+ctx 恢复）');
    // ★B2b:acc/bridged 分窗 no-op 支插入首门前——原四判首门仍在 acc 支之后
    expect(RDR).toMatch(/private bglEntWindowBegin\(tag: 'ent' \| 'behind'\): void \{[\s\S]{0,700}?if \(!Renderer\.bgl \|\| !Renderer\.bglShim \|\| this\.isCpuRender\(\) \|\| !this\.worldLayerActive \|\| !this\.worldCtxLayer\) return;/);
    expect(RDR).toContain("private bglEntWindowEnd(): void {\n    if (this._accMode !== 'off') return;");
    expect(RDR).toContain("new URLSearchParams(location.search).get('bglshim') !== '0'");
  });

  it('尘对注册+动态源登记:s1/s2/mountTintScratch 动态;pair 烘焙/命中两支注册', () => {
    expect(RDR).toContain('this.bglShimReg().registerDustPair(addC, eraseC, baked.gl);   // ★B2 尘对 GL 合并面注册');
    expect(RDR).toContain('if (Renderer.bgl && hit.glb) this.bglShimReg().registerDustPair(hit.add, hit.erase, hit.glb);');
    expect(RDR).toContain('sh.markDynamic(s1);');
    expect(RDR).toContain('sh.markDynamic(s2);');
    expect(RDR).toContain('if (Renderer.bgl) this.bglShimReg().markDynamic(this.mountTintCanvas!);');
  });

  it('GLSpriteLayer 新执行器面:quadSprite(全跨度+ε+opts)/texFromRegion/texFromData/texAlive/blendAdditive', () => {
    expect(SRC).toContain('quadSprite(');
    expect(SRC).toMatch(/quadSprite\([\s\S]{0,900}?const ua = \(sx - QUAD_TIE_EPS\) \/ e\.w/);
    expect(SRC).toContain('texFromRegion(');
    expect(SRC).toContain('texRefresh(');
    expect(SRC).toContain('texFromData(');
    expect(SRC).toMatch(/texAlive\(e: TexEntry\): boolean \{\s*\n\s*return !e\.key \|\| this\.texs\.get\(e\.key\) === e;/);
    expect(SRC).toMatch(/blendAdditive\(on: boolean\): void \{\s*\n\s*if \(this\.unavailable \|\| !this\.gl\) return;\s*\n\s*const gl = this\.gl;\s*\n\s*if \(on\) gl\.blendFunc\(gl\.ONE, gl\.ONE\);\s*\n\s*else gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\);/);
  });
});

describe('B2 解码与发射序（重放面断言）', () => {
  it('恒等变换 9 参 drawImage:解码矩形=原矩形,序保持', () => {
    const { raw, ex, layer, wrap } = setup();
    const img = mkImg(1);
    wrap.drawImage(img, 10, 20, 8, 8, 100, 200, 40, 40);
    wrap.drawImage(img, 0, 0, 64, 64, 300, 0, 32, 32);
    wrap.drawImage(img, 100, 100);   // 3 参（dx,dy）
    flushReplay(ex, layer);
    expect(raw.log.length).toBe(3);
    expect(raw.log[0].args).toEqual([10, 20, 8, 8, 100, 200, 40, 40]);
    expect(raw.log[2].args).toEqual([0, 0, 64, 64, 100, 100, 64, 64]);   // 3 参=全图原尺寸
  });

  it('世界变换(translate+scale)下解码=CTM×dst 角点;镜像 scale(-1,1) 折算 flip+min 角', () => {
    // 世界变换:translate(640,360), scale(1.25), translate(-camX,-camY)
    const camX = 100.8, camY = 50;
    const { raw, ex, layer, wrap } = setup();
    raw.setTransform(1, 0, 0, 1, 0, 0);
    wrap.setTransform(1, 0, 0, 1, 0, 0);
    wrap.translate(640, 360);
    wrap.scale(1.25, 1.25);
    wrap.translate(-camX, -camY);
    const img = mkImg(1);
    wrap.drawImage(img, 0, 0, 16, 16, 100, 50, 16, 16);
    flushReplay(ex, layer);
    // 期望 dst = 640+1.25×(100−100.8)=639, 360+1.25×0=360, 尺寸 20
    expect(raw.log.length).toBe(1);
    expect(raw.log[0].args[4]).toBeCloseTo(640 + 1.25 * (100 - camX), 10);
    expect(raw.log[0].args[5]).toBeCloseTo(360 + 1.25 * (50 - camY), 10);
    expect(raw.log[0].args[6]).toBeCloseTo(20, 10);
    expect(raw.log[0].args[7]).toBeCloseTo(20, 10);
  });

  it('旋转实体:解码 rot=atan2(b,a) 中心锚;重放绕中心转', () => {
    const { raw, ex, layer, wrap } = setup();
    wrap.translate(500, 400);
    wrap.rotate(Math.PI / 4);
    const img = mkImg(1);
    wrap.drawImage(img, 0, 0, 32, 32, -16, -16, 32, 32);
    flushReplay(ex, layer);
    expect(raw.log.length).toBe(1);
    // 重放=设备空间中心锚:translate(500,400)+rotate(45°) 后 drawImage(-16,-16,32,32)
    // fround 镜像下 32×hypot(cos45,sin45) 带 f32 尾差——逐元 closeTo
    const exp = [0, 0, 32, 32, -16, -16, 32, 32];
    exp.forEach((v, k) => expect(raw.log[0].args[k]).toBeCloseTo(v, 5));
  });

  it('gCO lighter→ADD 档:重放置 lighter;source-over 保持', () => {
    const { raw, ex, layer, wrap } = setup();
    const img = mkImg(1);
    wrap.globalCompositeOperation = 'lighter';
    wrap.drawImage(img, 0, 0, 8, 8, 10, 10, 8, 8);
    wrap.globalCompositeOperation = 'source-over';
    wrap.drawImage(img, 0, 0, 8, 8, 30, 10, 8, 8);
    flushReplay(ex, layer);
    expect(raw.log[0].gco).toBe('lighter');
    expect(raw.log[1].gco).toBe('source-over');
    expect(ex.stats.emitADD).toBe(1);
    expect(ex.stats.emitSO).toBe(1);
  });

  it('★发射序断言:混排 SO/ADD 重放序与 2D 调用序逐一同相', () => {
    const { raw, ex, layer, wrap } = setup();
    const img = mkImg(1);
    wrap.drawImage(img, 0, 0, 8, 8, 0, 0, 8, 8);        // SO
    wrap.globalCompositeOperation = 'lighter';
    wrap.drawImage(img, 0, 0, 8, 8, 8, 0, 8, 8);        // ADD
    wrap.globalCompositeOperation = 'source-over';
    wrap.drawImage(img, 0, 0, 8, 8, 16, 0, 8, 8);       // SO
    wrap.globalCompositeOperation = 'lighter';
    wrap.drawImage(img, 0, 0, 8, 8, 24, 0, 8, 8);       // ADD
    flushReplay(ex, layer);
    expect(raw.log.map((r) => r.args[4])).toEqual([0, 8, 16, 24]);   // 原序
    expect(raw.log.map((r) => r.gco)).toEqual(['source-over', 'lighter', 'source-over', 'lighter']);
  });

  it('save/restore:α/平滑/gCO/矩阵快照往返', () => {
    const { raw, ex, layer, wrap } = setup();
    wrap.save();
    wrap.globalAlpha = 0.5;
    wrap.translate(10, 0);
    wrap.globalCompositeOperation = 'lighter';
    wrap.restore();
    const img = mkImg(1);
    wrap.drawImage(img, 0, 0, 8, 8, 0, 0, 8, 8);
    flushReplay(ex, layer);
    expect(raw.log[0].alpha).toBe(1);
    expect(raw.log[0].gco).toBe('source-over');
    expect(raw.log[0].args[4]).toBe(0);   // translate 已被 restore 撤销
  });

  it('源越界/3 参以外形态/clip→2D 回退（flush 保序后 raw 直收）', () => {
    const { raw, ex, layer, wrap } = setup();
    const img = mkImg(1);
    wrap.drawImage(img, -4, -4, 16, 16, 0, 0, 8, 8);   // 源越界→回退
    wrap.drawImage(img, 0, 0, 8, 8, 0, 0, 8, 8);       // 正常发射
    flushReplay(ex, layer);
    expect(raw.log.length).toBe(2);
    expect(ex.stats.fallback).toBe(1);
    expect(ex.stats.emitSO).toBe(1);
  });

  it('fillRect:rgba 解析→纯色 quad（重放带解码矩形）', () => {
    const { raw, ex, layer, wrap } = setup();
    wrap.fillStyle = 'rgba(0,0,0,0.6)';
    wrap.fillRect(10, 20, 40, 6);
    flushReplay(ex, layer);
    expect(raw.log[0].op).toBe('fill');
    expect(raw.log[0].args).toEqual([10, 20, 40, 6]);
    expect(raw.log[0].alpha).toBeCloseTo(0.6, 10);
  });
});

describe('B2 尘预乘对（合并面+吞抑）', () => {
  it('destination-out erase→合并 quad 发射,后随 lighter add 被吞抑', () => {
    const { raw, ex, layer, wrap } = setup();
    const addC = { width: 8, height: 8, __id: 'add' } as unknown as HTMLCanvasElement;
    const eraseC = { width: 8, height: 8, __id: 'erase' } as unknown as HTMLCanvasElement;
    ex.registerDustPair(addC, eraseC, new Uint8Array(8 * 8 * 4));
    wrap.globalAlpha = 0.3;
    wrap.globalCompositeOperation = 'destination-out';
    wrap.drawImage(eraseC, -4, -4);
    wrap.globalCompositeOperation = 'lighter';
    wrap.drawImage(addC, -4, -4);
    wrap.globalCompositeOperation = 'source-over';
    flushReplay(ex, layer);
    const st = ex.stats;
    expect(st.pairEmitted).toBe(1);
    expect(st.pairSuppressed).toBe(1);
    // 重放=erase(destination-out)+add(lighter) 两步,α=mul
    expect(raw.log.length).toBe(2);
    expect(raw.log[0].gco).toBe('destination-out');
    expect(raw.log[0].alpha).toBeCloseTo(0.3, 10);
    expect(raw.log[1].gco).toBe('lighter');
  });

  it('dustPremulBake gl 合并字节:rgb=预乘 add 面(round(add×A/255)),a=erase e(round)', () => {
    // 构造一帧:rgb 直色 + α 阶梯（e 为 0-255 字节域:全 α 档 e=255 / 低 α 档 e=40,
    // 均走 max(e,aR,aG,aB) 直色面;二值档仅 e<0.5（α<0.2%）数学契约面）
    const tex = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < tex.length; i += 4) {
      tex[i] = 200; tex[i + 1] = 100; tex[i + 2] = 50;
      tex[i + 3] = (i / 4) % 8 < 4 ? 255 : 40;
    }
    const { add, erase, gl } = dustPremulBake(tex, 255, 255, 255, 255);
    for (let i = 0; i < gl.length; i += 4) {
      expect(gl[i]).toBe(Math.round((add[i] * add[i + 3]) / 255));   // =2D 'lighter' 实加值
      expect(gl[i + 3]).toBe(erase[i + 3]);   // erase 面字节域已整数
    }
    // 全 α texel:rgb=round(200×255/255)=200,a=255
    expect(gl[0]).toBe(200);
    expect(gl[3]).toBe(255);
    // 低 α texel(e=40=max 档):gl.rgb=round(round(aR)×40/255)=round(aR)=31;a=40
    const j = 4 * 4;
    expect(gl[j]).toBe(Math.round((200 * 40 * 255) / 65025));
    expect(gl[j + 3]).toBe(40);
  });
});

/** flush 走重放支（层翻死→host.acquireGl=null→replay2D;重放参数=解码结果） */
function flushReplay(ex: GLShimExecutor, layer: { unavailable: boolean }): void {
  layer.unavailable = true;
  ex.flush();
}

// ================= ★普查（2026-09-25 旗错色同病普查） =================

describe('★普查案② acc 态 font/textAlign 镜像（Bobber 声呐渔获名/Banner 悬停名）', () => {
  it('set→读回镜像值（undefined 传播面封口）+save/restore 往返', () => {
    const { host } = mkAccHost();
    const ex = new GLShimExecutor(host);
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    expect(wrap).not.toBeNull();
    wrap.font = '12px "Fusion Pixel 12px", sans-serif';
    wrap.textAlign = 'center';
    expect(wrap.font).toBe('12px "Fusion Pixel 12px", sans-serif');
    expect(wrap.textAlign).toBe('center');
    wrap.save();
    wrap.font = '20px x';
    wrap.textAlign = 'right';
    wrap.restore();
    expect(wrap.font).toBe('12px "Fusion Pixel 12px", sans-serif');
    expect(wrap.textAlign).toBe('center');
  });

  it('fillText 长尾→降级 bridge 回放 font/textAlign→raw.fillText 用对文本态', () => {
    const { host } = mkAccHost();
    const raw2 = new FakeCtx();
    const ex = new GLShimExecutor({
      ...host,
      degradeAcc: () => { ex.bridge(raw2 as unknown as CanvasRenderingContext2D); return true; },
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    wrap.font = '10px monospace';        // Bobber.ts:953 同款
    wrap.textAlign = 'center';
    wrap.fillText('Marlin', 0, -12);     // 触发 DRAWING_TAIL→degrade→bridge 回放
    expect(raw2.fillTextLog).toEqual([{ text: 'Marlin', x: 0, y: -12 }]);
    expect(raw2.font).toBe('10px monospace');
    expect(raw2.textAlign).toBe('center');
  });

  it('attach(raw) 从真 ctx 起步镜像（bridge/2D 窗零回归）', () => {
    const raw = new FakeCtx();
    raw.font = 'bold 14px monospace';
    raw.textAlign = 'right';
    const { host } = mkAccHost();
    const ex = new GLShimExecutor(host);
    const wrap = ex.attach(raw as unknown as CanvasRenderingContext2D) as unknown as FakeCtx;
    expect(wrap.font).toBe('bold 14px monospace');
    expect(wrap.textAlign).toBe('right');
  });
});

describe('★普查案③ attachAcc 弃用上一帧残留开 FBO（残影跨帧串层,残队守卫姊妹案）', () => {
  it("isAccumOpen('world')=true 残留 → attachAcc endAccumulate 弃用 → flushAcc 重 begin(clear=true)", () => {
    const { layer, host } = mkAccHost();
    layer.open = true;   // 模拟上一帧异常（throw 于 compositeLight 前）残留
    const ex = new GLShimExecutor(host);
    ex.attachAcc();
    expect(layer.endAccumCalls).toBe(1);
    const img = mkImg(1);
    ex.drawImage(img, 0, 0, 8, 8, 4, 4, 8, 8);
    ex.flush();
    expect(layer.beginCalls).toEqual([['world', true]]);   // 新帧首段清透明
  });

  it('正常帧（FBO 已收口）attachAcc 零触碰（endAccumulate 恒 no-op）', () => {
    const { layer, host } = mkAccHost();
    layer.open = false;
    const ex = new GLShimExecutor(host);
    ex.attachAcc();
    expect(layer.endAccumCalls).toBe(0);
    expect(layer.beginCalls).toEqual([]);
  });
});

describe('★普查案④/⑤ 结构锁（GL MULT 精确式+dollLightTint 裁剪）', () => {
  it('blendMult=(ONE_MINUS_DST_ALPHA,SRC_COLOR)：Canvas multiply 半透明 dst 逐字节精确式（旧 (ZERO,SRC_COLOR) 丢 S×(1−Da) 项+α保=探针③实锤 (128,64,0,128) vs 2D (127,64,0,255)）', () => {
    expect(SRC).toMatch(/blendMult\(on: boolean\): void \{\s*\n\s*if \(this\.unavailable \|\| !this\.gl\) return;\s*\n\s*const gl = this\.gl;\s*\n\s*if \(on\) gl\.blendFunc\(gl\.ONE_MINUS_DST_ALPHA, gl\.SRC_COLOR\);\s*\n\s*else gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\);/);
  });

  it('tier-3 门加 col[3]===1（rgba 半透明 fillStyle multiply 有 (1−αs)αbCb 项不可直译→降级）', () => {
    const EXEC = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');
    expect(EXEC).toContain("if (this.accMode && this.gco === 'multiply' && col && col[3] === 1 && geo && geo.rot === 0");
  });
});

// ================= ★红蓝修复刃批 A（2026-09-25） =================

/** 全功能 acc 层桩（批 A 红蓝共用）：quad/texFromImage 可观测+texAlive 可控+end 在位 */
function mkFullAccLayer() {
  const quads: Array<{ texKey?: string; dx: number; dy: number; dw: number; dh: number; alpha: number; rot: number; flipX: boolean; flipY: boolean }> = [];
  const L: Record<string, unknown> = {
    unavailable: false,
    open: false,
    texAliveOk: true,
    texFromImageCalls: 0,
    beginCalls: [] as Array<[string, boolean?]>,
    endAccumCalls: 0,
    isAccumOpen: (n: string) => n === 'world' && L.open === true,
    resize: () => { /* no-op */ },
    begin: (n: string, clear?: boolean) => { (L.beginCalls as Array<[string, boolean?]>).push([n, clear]); L.open = true; },
    end: () => { L.open = false; },
    endAccumulate: () => { L.endAccumCalls = (L.endAccumCalls as number) + 1; L.open = false; return null; },
    blendAdditive: () => { /* no-op */ },
    blendErase: () => { /* no-op */ },
    blendMult: () => { /* no-op */ },
    quadSprite: (e: { key?: string } | null, _ux: number, _uy: number, _sw: number, _sh: number,
      dx: number, dy: number, dw: number, dh: number, o?: { alpha?: number; rot?: number; flipX?: boolean; flipY?: boolean }) => {
      quads.push({ texKey: e?.key, dx, dy, dw, dh, alpha: o?.alpha ?? 1, rot: o?.rot ?? 0,
        flipX: o?.flipX ?? false, flipY: o?.flipY ?? false });
    },
    texAlive: () => L.texAliveOk === true,
    texFromRegion: (_k: string, img: { __id?: number }) => ({ key: 'r' + String(img.__id ?? '?'), tex: {}, w: 8, h: 8, stamp: 1, bytes: 256 }),
    texRefresh: (_k: string, img: { __id?: number }) => ({ key: 'd' + String(img.__id ?? '?'), tex: {}, w: 8, h: 8, stamp: 1, bytes: 256 }),
    texRefreshRegion: (_k: string, img: { __id?: number }, _sw: number, _sh: number) => ({ key: 'd' + String(img.__id ?? '?'), tex: {}, w: 8, h: 8, stamp: 1, bytes: 256 }),   // ★P1-B 子区增量桩
    texFromData: () => ({ key: 'pair', tex: {}, w: 8, h: 8, stamp: 1, bytes: 256 }),
    texFromImage: (k: string) => { L.texFromImageCalls = (L.texFromImageCalls as number) + 1; return { key: k, tex: {}, w: 1, h: 1, stamp: 1, bytes: 4 }; },
  };
  return { L: L as never, Lraw: L, quads };
}

describe('★R2-F1 decode 旋转支镜像轴:det<0 落局部 V 轴（flipY）,非 flipX（内容点反射 180° 病）', () => {
  it('判别器:非对称精灵(源 8×16) + scale(-1,1)+rotate(π−0.6) CTM → 重放中心锚矩阵=R(ang)·S(1,−1)', () => {
    // 正交列恒等式:v̂=sign(det)·û⊥——det<0 时局部 V 轴镜像（flipY）;
    // 旧码 flipX=R(ang)·S(−1,1)=线性部分整体取负=内容点反射 180°（Arrow 左斜飞族受击面）。
    const { raw, ex, layer, wrap } = setup();
    wrap.scale(-1, 1);
    wrap.rotate(Math.PI - 0.6);   // rot=atan2(b,a)=0.6（任务书构造:rotate(π−ang)）
    const img = mkImg(1);          // 非对称精灵:源 8×16——180° 内容旋转不可与矩形对称混淆
    wrap.drawImage(img, 0, 0, 8, 16, 10, 20, 8, 16);
    flushReplay(ex, layer);
    expect(raw.log.length).toBe(1);
    const rec = raw.log[0];
    expect(rec.args.slice(0, 2)).toEqual([0, 0]);
    expect(rec.args.slice(2, 4)).toEqual([8, 16]);        // 非对称源矩形原样
    // 中心锚 dst（−dw/2,−dh/2,Dw,Dh;fround 镜像下 lu=1+ε → 逐元 closeTo）
    [-4, -8, 8, 16].forEach((v, k) => expect(rec.args[4 + k]).toBeCloseTo(v, 5));
    // 重放矩阵=T(C)·R(0.6)·S(1,−1):线性部分=(cosθ,sinθ,sinθ,−cosθ)（flipY 语义）
    const c = Math.cos(0.6), s = Math.sin(0.6);
    expect(rec.mat[0]).toBeCloseTo(c, 5);     // a——旧码=−c（flipX）→ 判别红
    expect(rec.mat[1]).toBeCloseTo(s, 5);     // b
    expect(rec.mat[2]).toBeCloseTo(s, 5);     // c
    expect(rec.mat[3]).toBeCloseTo(-c, 5);    // d
    // 平移=C−0（C=CTM×dst 中心=M·(14,28)）:cx=14cos+28sin, cy=14sin−28cos
    expect(rec.mat[4]).toBeCloseTo(14 * c + 28 * s, 4);
    expect(rec.mat[5]).toBeCloseTo(14 * s - 28 * c, 4);
  });

  it('轴对齐支(722-730)按屏幕轴翻转不动:scale(-1,1) 恒 flipX=a<0', () => {
    const { raw, ex, layer, wrap } = setup();
    wrap.scale(-1, 1);
    const img = mkImg(1);
    wrap.drawImage(img, 0, 0, 8, 16, 10, 20, 8, 16);
    flushReplay(ex, layer);
    const rec = raw.log[0];
    expect(rec.args.slice(4)).toEqual([-4, -8, 8, 16]);
    // 矩阵=T(−14,28)·S(−1,1)（rot=0,flipX=屏幕 X 轴翻转;C=M·(14,28)=(−14,28)）
    expect(rec.mat[0]).toBeCloseTo(-1, 5);
    expect(rec.mat[1]).toBeCloseTo(0, 5);
    expect(rec.mat[2]).toBeCloseTo(0, 5);
    expect(rec.mat[3]).toBeCloseTo(1, 5);
    expect(rec.mat[4]).toBeCloseTo(-14, 4);
    expect(rec.mat[5]).toBeCloseTo(28, 4);
  });
});

describe('★R1-F1 replay2D tier→2D 算子全表（0=source-over/1=lighter/2=destination-out/3=multiply）', () => {
  it('tier-2 ERASE rec 重放=destination-out（旧码 source-over=削底面画成不透明精灵）', () => {
    const { L } = mkFullAccLayer();
    const raw2 = new FakeCtx();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => raw2 as unknown as CanvasRenderingContext2D,
      worldW: () => 128, worldH: () => 72,
      degradeAcc: () => { ex.bridge(raw2 as unknown as CanvasRenderingContext2D); return true; },
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    wrap.globalCompositeOperation = 'destination-out';
    wrap.drawImage(mkImg(9), 0, 0);   // 未注册削底 → tier-2（acc 态直译）
    (L as { unavailable: boolean }).unavailable = true;
    ex.flush();                        // 收官 flush 失败→降级+replay2D
    expect(ex.stats.replays).toBe(1);
    expect(raw2.log.length).toBe(1);
    expect(raw2.log[0].gco).toBe('destination-out');   // 旧码='source-over' → 红
  });

  it('tier-3 MULT rec 重放=multiply（旧码 source-over=multiply 面画成实色块）', () => {
    const { L } = mkFullAccLayer();
    const raw2 = new FakeCtx();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => raw2 as unknown as CanvasRenderingContext2D,
      worldW: () => 128, worldH: () => 72,
      degradeAcc: () => { ex.bridge(raw2 as unknown as CanvasRenderingContext2D); return true; },
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    wrap.globalCompositeOperation = 'multiply';
    wrap.fillStyle = 'rgb(120,96,72)';
    wrap.fillRect(10, 10, 20, 20);     // tier-3 MULT quad
    expect(ex.stats.emitMult).toBe(1);
    (L as { unavailable: boolean }).unavailable = true;
    ex.flush();
    expect(ex.stats.replays).toBe(1);
    expect(raw2.log.length).toBe(1);
    expect(raw2.log[0].op).toBe('fill');
    expect(raw2.log[0].gco).toBe('multiply');   // 旧码='source-over' → 红
  });
});

describe('★R1-F2 收官 flush 失败必走 replay2D 不弃队', () => {
  it('契约锁（shim 面）:acc flush 失败→degradeAcc→replay2D,队列不弃', () => {
    const { L } = mkFullAccLayer();
    const raw2 = new FakeCtx();
    let degraded = 0;
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => raw2 as unknown as CanvasRenderingContext2D,
      worldW: () => 128, worldH: () => 72,
      degradeAcc: () => { degraded++; ex.bridge(raw2 as unknown as CanvasRenderingContext2D); return true; },
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    wrap.drawImage(mkImg(1), 0, 0);
    (L as { unavailable: boolean }).unavailable = true;   // 收官 flush 时 GL 已死
    ex.flush();
    expect(degraded).toBe(1);
    expect(ex.stats.replays).toBe(1);     // 不弃队（弃队=replays 0）
    expect(raw2.log.length).toBe(1);
  });

  it('结构锁（Renderer 面,红=置序错）:finishAccFrame acc 支 _accMode=off 必须后置于 flush——先置位=本 flush 内 accFail 的 degradeAcc 卫兵（_accMode!=="acc"）恒 false→popAll 静默弃队', () => {
    // 顺序锚:acc 支内 'flush();' 先于 "_accMode = 'off';"（bridged 分支不涉 degradeAcc 卫兵,不锁）
    const m = RDR.match(/if \(this\._accMode !== 'acc'\) return null;[\s\S]{0,400}?this\.bglEntShim\?\.flush\(\);[\s\S]{0,200}?this\._accMode = 'off';/);
    expect(m).not.toBeNull();
  });
});

describe('★R1-F3 ensureBridged 降级前全 tier flush + bridge flush 覆盖 tier-2/3', () => {
  it('ensureBridged 先 flush 再降级:残队逐条落 FBO（旧码不 flush 即降级=残队跨档）', () => {
    const { L, quads } = mkFullAccLayer();
    const raw2 = new FakeCtx();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => raw2 as unknown as CanvasRenderingContext2D,
      worldW: () => 128, worldH: () => 72,
      degradeAcc: () => { ex.bridge(raw2 as unknown as CanvasRenderingContext2D); return true; },
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    wrap.drawImage(mkImg(1), 0, 0, 8, 8, 0, 0, 8, 8);
    wrap.drawImage(mkImg(1), 0, 0, 8, 8, 8, 0, 8, 8);
    (wrap as unknown as Record<string, (...a: unknown[]) => unknown>).createLinearGradient(0, 0, 1, 1);   // 读值面工厂→ensureBridged
    expect(quads.length).toBe(2);          // 降级前残队已全 tier flush 落 FBO（旧码=0）
    expect(ex.stats.flushes).toBe(1);
  });

  it('bridge flush 覆盖 tier-2/3:2D 侧按算子直画（旧码 presentBatch 只发 tier 0/1→静默弃）', () => {
    const { L } = mkFullAccLayer();
    const raw2 = new FakeCtx();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => raw2 as unknown as CanvasRenderingContext2D,
      worldW: () => 128, worldH: () => 72,
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    wrap.globalCompositeOperation = 'destination-out';
    wrap.drawImage(mkImg(9), 0, 0);   // tier-2 残队（未 flush）
    ex.bridge(raw2 as unknown as CanvasRenderingContext2D);   // 模拟残队跨档进 bridge 态
    ex.flush();
    expect(raw2.log.length).toBe(1);                    // 旧码=0（静默弃）→ 红
    expect(raw2.log[0].gco).toBe('destination-out');
  });
});

describe('★R1-F4/R2-F4 fillStyle 全值镜像 + parseColor 哨兵', () => {
  it('bridge 态非 string fillStyle:不走 stale 色 fast path,回退 raw.fillRect（旧码发 stale 色黑 quad）', () => {
    const { raw, ex, layer, wrap } = setup();
    const grad = { __grad: 1 } as unknown as CanvasGradient;
    wrap.fillStyle = grad;
    expect(wrap.fillStyle).toBe(grad);    // 镜像收全值（旧码 get 回 stale '#000'）
    wrap.fillRect(10, 10, 5, 5);
    flushReplay(ex, layer);
    expect(ex.stats.emitSO).toBe(0);      // 旧码=1（stale '#000' 被解析成黑 quad）→ 红
    expect(ex.stats.fallback).toBe(1);
    expect(raw.log[0].op).toBe('fill');
    expect(raw.log[0].args).toEqual([10, 10, 5, 5]);
  });

  it('acc 态非 string fillStyle:镜像+fillRect 隔离栅格化兜底可达（渐变落 scratch）', () => {
    const { L } = mkFullAccLayer();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => null,
      worldW: () => 128, worldH: () => 72,
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    const grad = { __grad: 1 } as unknown as CanvasGradient;
    wrap.fillStyle = grad;
    expect(wrap.fillStyle).toBe(grad);
    const scratchFills: unknown[] = [];
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ setTransform() {}, clearRect() {}, fillRect() {}, set fillStyle(v: unknown) { scratchFills.push(v); } }) }),
    };
    try {
      wrap.fillRect(10, 10, 5, 5);
      expect(ex.stats.fallback).toBe(0);      // 渐变兜底可达:栅格化直支（旧码=错色 quad 或降级）→ 红
      expect(ex.stats.emitSO).toBe(1);        // scratch 面发 SO quad
      expect(scratchFills).toContain(grad);   // 渐变对象落在 scratch ctx
    } finally {
      if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prevDoc;
    }
  });

  it('parseColor 哨兵:解析失败恒 null 走回退（旧码缓存 [0,0,0,0] 黑哨兵→同串二次调用 A=0 静默丢笔）', () => {
    const { raw, ex, layer, wrap } = setup();
    wrap.fillStyle = 'definitely-not-a-color';
    wrap.fillRect(10, 10, 5, 5);
    wrap.fillRect(20, 10, 5, 5);   // 同串二次:旧码命中黑哨兵→A=0→静默 no-op
    flushReplay(ex, layer);
    expect(raw.log.length).toBe(2);       // 旧码=1 → 红
    expect(raw.log[0].args).toEqual([10, 10, 5, 5]);
    expect(raw.log[1].args).toEqual([20, 10, 5, 5]);
    expect(ex.stats.fallback).toBe(2);
  });

  it('命名色判不可解析走回退:重复调用稳定回退不丢笔（② 修复的契约面）', () => {
    const { raw, ex, layer, wrap } = setup();
    wrap.fillStyle = 'red';
    wrap.fillRect(10, 10, 5, 5);
    wrap.fillRect(20, 10, 5, 5);
    flushReplay(ex, layer);
    expect(raw.log.length).toBe(2);
    expect(ex.stats.fallback).toBe(2);
  });

  it('hsl()/hsla() 进 parseColor:实心 quad 直译不回退', () => {
    const { raw, ex, layer, wrap } = setup();
    wrap.fillStyle = 'hsl(120, 50%, 50%)';
    wrap.fillRect(10, 10, 5, 5);
    expect(ex.stats.emitSO).toBe(1);      // 旧码=不可解析→fallback → 红
    wrap.fillStyle = 'hsla(0, 100%, 50%, 0.5)';
    wrap.fillRect(20, 10, 5, 5);
    expect(ex.stats.emitSO).toBe(2);
    flushReplay(ex, layer);
    expect(ex.stats.fallback).toBe(0);
    expect(raw.log[0].alpha).toBe(1);
    expect(raw.log[1].alpha).toBeCloseTo(0.5, 10);
  });
});

describe('★R2-F5 globalAlpha 镜像钳制（2D 语义:非有限/越界忽略保旧值）', () => {
  it('越界/NaN 忽略保旧值（acc 镜像读）;合法值照收;重放 α=镜像钳制值', () => {
    // 注:bridge 态属性读走 raw（真 ctx 引擎自钳同语义）;镜像读断言走 acc 态
    const { L } = mkFullAccLayer();
    const raw2 = new FakeCtx();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => raw2 as unknown as CanvasRenderingContext2D,
      worldW: () => 128, worldH: () => 72,
      degradeAcc: () => { ex.bridge(raw2 as unknown as CanvasRenderingContext2D); return true; },
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    wrap.globalAlpha = 1.5;
    expect(wrap.globalAlpha).toBe(1);     // 旧码=1.5 → 红
    wrap.globalAlpha = -0.5;
    expect(wrap.globalAlpha).toBe(1);
    wrap.globalAlpha = Number.NaN;
    expect(wrap.globalAlpha).toBe(1);
    wrap.globalAlpha = 0.25;
    expect(wrap.globalAlpha).toBe(0.25);
    wrap.drawImage(mkImg(1), 0, 0, 8, 8, 0, 0, 8, 8);
    (L as { unavailable: boolean }).unavailable = true;
    ex.flush();                            // 收官 flush 失败→降级+replay2D
    expect(ex.stats.replays).toBe(1);
    expect(raw2.log[0].alpha).toBe(0.25);
  });
});

describe('★R1-F7 WHITE_E WeakMap texAlive 卫兵（LRU 逐出/清表后死条目重解析）', () => {
  it('死条目（texAlive=false）→重解析 texFromImage（旧码=画死纹理,零重传）', () => {
    const { L, Lraw } = mkFullAccLayer();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => null,
      worldW: () => 128, worldH: () => 72,
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ width: 1, height: 1, getContext: () => ({ fillStyle: '#fff', fillRect: () => {} }) }),
    };
    try {
      wrap.fillStyle = 'rgb(255,0,0)';
      wrap.fillRect(0, 0, 4, 4);
      ex.flush();
      expect((Lraw as { texFromImageCalls: number }).texFromImageCalls).toBe(1);
      (Lraw as { texAliveOk: boolean }).texAliveOk = false;   // 纹理已被 evictLRU/世界切换清表
      wrap.fillRect(8, 0, 4, 4);
      ex.flush();
      expect((Lraw as { texFromImageCalls: number }).texFromImageCalls).toBe(2);   // 旧码=1 → 红
    } finally {
      if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prevDoc;
    }
  });
});

describe('★R1-F8 attach（bridge 态）残帧守卫三面（对齐 attachAcc 孪生守卫）', () => {
  it('残队弃+残 save 栈清+残开 FBO 弃用', () => {
    const { L, Lraw } = mkFullAccLayer();
    const raw2 = new FakeCtx();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => raw2 as unknown as CanvasRenderingContext2D,
      worldW: () => 128, worldH: () => 72,
    });
    const ctx1 = ex.attachAcc() as unknown as FakeCtx;   // 上一 acc 帧:异常滞留（throw 于 finishAccFrame 前）
    ctx1.globalAlpha = 0.5;
    ctx1.save();
    ctx1.drawImage(mkImg(1), 0, 0);
    (Lraw as { open: boolean }).open = true;             // 残开 FBO（endAccumulate 未走）
    // 次帧 bridge 窗:attach 的 raw=worldCtx（真宿主两处同 ctx——回放/present 同面）
    const ctx2 = ex.attach(raw2 as unknown as CanvasRenderingContext2D) as unknown as FakeCtx;
    expect((Lraw as { endAccumCalls: number }).endAccumCalls).toBe(1);   // 残开 FBO 弃用（旧码=0）→ 红
    ctx2.restore();                                       // 残栈不得吃本帧状态
    ctx2.drawImage(mkImg(2), 0, 0, 8, 8, 0, 0, 8, 8);
    (L as { unavailable: boolean }).unavailable = true;
    ex.flush();                                           // 残队已弃:只重放本帧 1 笔,α=1
    expect(raw2.log.length).toBe(1);                      // 旧码=2（stale img1 串入）→ 红
    expect(raw2.log[0].alpha).toBe(1);                    // 旧码=0.5（残栈复活）→ 红
  });
});

describe('★R3-F6 attachAcc 残 save 栈镜像清（第三面守卫）', () => {
  it('重入 acc 窗后 restore 必为 no-op（旧码弹出残条=α/CTM 跨帧串层）', () => {
    const { L, quads } = mkFullAccLayer();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => null,
      worldW: () => 128, worldH: () => 72,
    });
    const ctx1 = ex.attachAcc() as unknown as FakeCtx;
    ctx1.globalAlpha = 0.5;
    ctx1.translate(10, 0);
    ctx1.save();                  // save 捕获帧中段已污染态;此帧异常未 restore
    const ctx2 = ex.attachAcc() as unknown as FakeCtx;
    ctx2.restore();               // 新帧 restore 必 no-op
    ctx2.drawImage(mkImg(1), 0, 0, 8, 8, 0, 0, 8, 8);
    ex.flush();
    expect(quads.length).toBe(1);
    expect(quads[0].alpha).toBe(1);   // 旧码=0.5（残栈复活）→ 红
    expect(quads[0].dx).toBe(0);      // 旧码=10（残 CTM 复活）→ 红
  });
});

describe('★R3-F1 texCache 驻留上界（逐出仅 JS 侧 Map,GL 纹理由层 LRU 兜底）', () => {
  it('sub-Map ≤32 条 + 全表 ≤256 texId', () => {
    const { L } = mkFullAccLayer();
    const raw2 = new FakeCtx();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => raw2 as unknown as CanvasRenderingContext2D,
      worldW: () => 128, worldH: () => 72,
    });
    const wrap = ex.attach(new FakeCtx() as unknown as CanvasRenderingContext2D) as unknown as FakeCtx;
    const big = { width: 1024, height: 64, __id: 7 } as unknown as CanvasImageSource;
    for (let i = 0; i < 40; i++) wrap.drawImage(big, i * 8, 0, 8, 8, i * 9, 0, 8, 8);
    ex.flush();
    const cache = (ex as unknown as { texCache: Map<number, Map<number, unknown>> }).texCache;
    expect(cache.size).toBe(1);
    expect(cache.get(texId(big as unknown as object))!.size).toBeLessThanOrEqual(32);   // 旧码=40 → 红
    for (let k = 0; k < 300; k++) {
      const im = { width: 8, height: 8, __id: 100 + k } as unknown as CanvasImageSource;
      wrap.drawImage(im, 0, 0, 8, 8, k * 9, 20, 8, 8);
    }
    ex.flush();
    expect(cache.size).toBeLessThanOrEqual(256);   // 旧码=301 → 红
  });
});

// ================= ★rot 发射支锁（2026-09-25 用户实报「全武器/弹幕旋转失效」） =================
// 【结构性盲区封口】node 无 GL——批 A 全部红绿证据落在 replay2D 重放面/发射面
//  dx·α 维度,rot 经 decode→rec→QOPTS→quadSprite uRot 的【发射支】零断言;
//  用户屏幕走 acc 发射支(shader 消费),着色器级病=node 全盲(判谳=
//  scripts/_rot-shader-micro.mjs 像素探针)。本组用 mkFullAccLayer 的 quadSprite
//  桩断言【发射支 rot 全链】:decode 旋转支→rec.rot→opts.rot 逐值锁,防发射面
//  rot 载体再次失联;着色器语义由 gl-layer-regression 源码锁+像素探针守卫。

describe('★rot 发射支全链(decode→rec→quadSprite opts;acc 态 fake 层)', () => {
  /** acc 态执行器+全功能层桩（GL 可用=发射支;flushAcc 直发） */
  function setupAcc() {
    const { L, quads } = mkFullAccLayer();
    const ex = new GLShimExecutor({
      acquireGl: () => ((L as { unavailable: boolean }).unavailable ? null : L),
      worldCtx: () => null,
      worldW: () => 128, worldH: () => 72,
    });
    const wrap = ex.attachAcc() as unknown as FakeCtx;
    return { ex, wrap, quads };
  }

  it('纯旋转:translate+rotate(π/4) → 发射 rot=atan2(b,a)、中心锚 dst=中心±尺寸/2', () => {
    const { ex, wrap, quads } = setupAcc();
    wrap.translate(500, 400);
    wrap.rotate(Math.PI / 4);
    wrap.drawImage(mkImg(1), 0, 0, 32, 32, -16, -16, 32, 32);
    ex.flush();                                  // acc 态直发(层可用)
    expect(quads.length).toBe(1);
    expect(quads[0].rot).toBeCloseTo(Math.PI / 4, 5);
    expect(quads[0].dx).toBeCloseTo(484, 3);     // 500−16(lu=1)
    expect(quads[0].dy).toBeCloseTo(384, 3);
    expect(quads[0].dw).toBeCloseTo(32, 3);
    expect(quads[0].dh).toBeCloseTo(32, 3);
    expect(quads[0].alpha).toBe(1);
  });

  it('镜像旋转(R2-F1 案):scale(-1,1)+rotate(π−0.6) → 发射 rot=0.6+flipY(det<0)+flipX=false', () => {
    const { ex, wrap, quads } = setupAcc();
    wrap.translate(100, 100);
    wrap.scale(-1, 1);
    wrap.rotate(Math.PI - 0.6);
    wrap.drawImage(mkImg(1), 0, 0, 8, 16, 10, 20, 8, 16);
    ex.flush();
    expect(quads.length).toBe(1);
    expect(quads[0].rot).toBeCloseTo(0.6, 5);
    expect(quads[0].dw).toBeCloseTo(8, 4);
    expect(quads[0].dh).toBeCloseTo(16, 4);
    // 中心=M·(14,28)+T:线性=S(-1,1)·R(π-0.6)=[a=cθ,c=sθ,b=sθ,d=-cθ]
    //  cx=14cos0.6+28sin0.6, cy=14sin0.6-28cos0.6;dx=cx-dw·lu/2, dy=cy-dh·lv/2
    const c = Math.cos(0.6), s = Math.sin(0.6);
    expect(quads[0].dx).toBeCloseTo(100 + 14 * c + 28 * s - 4, 3);
    expect(quads[0].dy).toBeCloseTo(100 + 14 * s - 28 * c - 8, 3);
    // ★flip 轴判别(发射面复刻 R2-F1 判别器):det<0=局部 V 轴(flipY),非 flipX
    expect(quads[0].flipY).toBe(true);
    expect(quads[0].flipX).toBe(false);
  });

  it('持枪档复合 CTM(translate+scale(-1,1)+rotate(aim)+非居中dst):rot=π−|aim| 族+flipY', () => {
    // Renderer.drawPlayer 持物链同款(facing=-1):drawImage dst 非中心锚
    const { ex, wrap, quads } = setupAcc();
    wrap.translate(200, 128);
    wrap.scale(-1, 1);
    wrap.rotate(-1.0);
    wrap.drawImage(mkImg(1), 0, 0, 32, 48, -2, -24, 32, 48);
    ex.flush();
    expect(quads.length).toBe(1);
    expect(quads[0].rot).toBeCloseTo(-(Math.PI - 1), 4);   // atan2(sin(-1),-cos(-1))
    expect(quads[0].flipY).toBe(true);                     // det=S(-1,1)·R=-1<0
    expect(quads[0].flipX).toBe(false);
    expect(quads[0].dw).toBeCloseTo(32, 4);
    expect(quads[0].dh).toBeCloseTo(48, 4);
    // 中心=M·(14,0):a=-cos1 → dx=200-14cos1-16;dy=128-14sin1-24
    expect(quads[0].dx).toBeCloseTo(200 - 14 * Math.cos(1) - 16, 3);
    expect(quads[0].dy).toBeCloseTo(128 - 14 * Math.sin(1) - 24, 3);
  });

  it('QOPTS 单槽复用不串味:连续两笔不同 rot/α/flip 逐笔保真(发射期消费即弃)', () => {
    const { ex, wrap, quads } = setupAcc();
    wrap.translate(10, 10);
    wrap.rotate(0.3);
    wrap.drawImage(mkImg(1), 0, 0, 8, 8, -4, -4, 8, 8);    // rot=0.3
    wrap.rotate(0.4);                                       // 累计 0.7
    wrap.globalAlpha = 0.5;
    wrap.drawImage(mkImg(1), 0, 0, 8, 8, -4, -4, 8, 8);    // rot=0.7,α=0.5
    ex.flush();
    expect(quads.length).toBe(2);
    expect(quads[0].rot).toBeCloseTo(0.3, 5);
    expect(quads[0].alpha).toBe(1);
    expect(quads[1].rot).toBeCloseTo(0.7, 5);
    expect(quads[1].alpha).toBeCloseTo(0.5, 8);
  });

  it('轴对齐支 rot=0 不被旋转支污染:rotate(2π) 回落后发射 rot=0', () => {
    const { ex, wrap, quads } = setupAcc();
    wrap.rotate(Math.PI / 2);
    wrap.drawImage(mkImg(1), 0, 0, 8, 8, 0, 0, 8, 8);      // rot=π/2
    wrap.rotate(-Math.PI / 2);                              // 回落 b=c=0
    wrap.drawImage(mkImg(1), 0, 0, 8, 8, 20, 0, 8, 8);     // 轴对齐支 rot=0
    ex.flush();
    expect(quads.length).toBe(2);
    expect(quads[0].rot).toBeCloseTo(Math.PI / 2, 5);
    expect(quads[1].rot).toBe(0);
    expect(quads[1].dx).toBeCloseTo(20, 5);
  });
});

// ================= ★浸没透明案:drawImage filter 隔离栅格化双变换翻案 =================
// 定谳（2026-09-25 用户实报「完全浸水角色消失」;?bglshim=0 正常;半截（头出水）正常）:
//   分支差异 = Renderer drawPlayer `if (p.headUnderwater) ctx.filter='sepia(...)'`
//   （Renderer.ts 水下染色族;NPC 水下/受击 filter 同族）→ shim acc 态 filter≠none
//   的 drawImage 全走 rasterizeDrawImage。旧实现把 decode 产出的【设备空间】geo
//   矩形在 scratch 上【再乘一次镜像 CTM】（setTransform(a,b,c,d,e−fx,f−fy) 后
//   drawImage 到 geo.dx/dy）= 双变换——世界层 CTM 非单位时内容整体落到 scratch 外
//   （被裁空）→ 全透明 quad 发射在正确设备矩形 = 精灵整体消失（ret=true/fallback=0
//   /replay=0 全绿静默）。单位阵下 scratch x=geo.dx−fx 恰好正确 = 既有单测与纯 2D
//   对拍（_bj348b2-layer-iso）全绿漏网;BJ348b2「glow 可见主层消失」同根未除。
//   修复 = rasterizeFillRect/rasterizeOp 判例:user 空间【原参重放】（负 dw/dh 翻转/
//   旋转/斜切全由 2D 语义自洽;设备 bbox=dst 四角 CTM 变换 min/max）。
interface ScratchDrawRec { mat: [number, number, number, number, number, number]; args: unknown[]; filter: string; alpha: number }
describe('★浸没透明案 rasterizeDrawImage user 空间原参重放（双变换翻案）', () => {
  // accScratch 模块级缓存（生产=全程单例）→ fake 也用共享单例画布,每测试只换日志面
  let currentLog: ScratchDrawRec[] = [];
  const sharedCtx = {
    filter: 'none', globalAlpha: 1, imageSmoothingEnabled: false,
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    setTransform(...a: number[]) { [this.a, this.b, this.c, this.d, this.e, this.f] = a; },
    clearRect() { /* no-op */ },
    translate(..._a: number[]) { /* 旧码 flip/rot 支桩 */ },
    rotate(..._a: number[]) { /* 同上 */ },
    scale(..._a: number[]) { /* 同上 */ },
    drawImage(img: unknown, ...rest: unknown[]) {
      currentLog.push({ mat: [sharedCtx.a, sharedCtx.b, sharedCtx.c, sharedCtx.d, sharedCtx.e, sharedCtx.f], args: [img, ...rest], filter: sharedCtx.filter, alpha: sharedCtx.globalAlpha });
    },
  };
  const sharedCanvas = { width: 0, height: 0, getContext: () => sharedCtx };
  async function withFakeDoc(scratchLog: ScratchDrawRec[], fn: () => Promise<void> | void): Promise<void> {
    currentLog = scratchLog;
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = { createElement: () => sharedCanvas };
    try { await fn(); } finally {
      if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prevDoc;
    }
  }

  it('非单位 CTM（镜像+平移,实测定谳 [-1,0,0,1,638,421]）下 filter drawImage:scratch 重放=CTM 整数平移+user 空间原参（旧码画设备坐标=双变换→红）', async () => {
    const scratchLog: ScratchDrawRec[] = [];
    await withFakeDoc(scratchLog, async () => {
      // 本文件前段测试已用各自 fake document 触发过 accScratch 模块级缓存——
      // resetModules+动态导入取全新模块实例（_accScratch 未建,落到本 describe 的共享桩）
      vi.resetModules();
      const { GLShimExecutor: FreshExec } = await import('../src/render/glshim/GLShimExecutor');
      const { L, quads } = mkFullAccLayer();
      const ex = new FreshExec({
        acquireGl: () => L, worldCtx: () => null, worldW: () => 128, worldH: () => 72,
        degradeAcc: () => false,
      });
      const wrap = ex.attachAcc() as unknown as { filter: string; drawImage: (i: CanvasImageSource, ...r: unknown[]) => void; setTransform: (...a: number[]) => void };
      wrap.setTransform(-1, 0, 0, 1, 638, 421);          // 世界层 CTM（X 镜像+平移）
      wrap.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
      const img = { width: 40, height: 1334, __id: 7 } as unknown as CanvasImageSource;
      wrap.drawImage(img, 0, 56, 40, 56, 20, 0, 40, 56); // user 空间 dst(20,0,40,56)
      // 设备矩形（镜像 min 角）=(578,421,40,56) → fx=577,fy=420,sx2=42,sy2=58
      expect(scratchLog.length).toBe(1);
      const rec = scratchLog[0];
      expect(rec.filter).toContain('sepia');
      expect(rec.mat).toEqual([-1, 0, 0, 1, 638 - 577, 421 - 420]);  // CTM+整数设备平移
      expect(rec.args[0]).toBe(img);
      expect(rec.args.slice(1, 5)).toEqual([0, 56, 40, 56]);          // 源矩形原样
      // ★判别面:重放 dst 必须是【user 空间原参 (20,0,40,56)】——旧码画设备坐标 (578,421,…) 再乘 CTM=双变换（scratch 落点 −558=裁空）→ 红
      expect(rec.args.slice(5, 9)).toEqual([20, 0, 40, 56]);
      // 发射:动态 scratch quad 落设备 bbox 整数外扩矩形（texKey=stub 对 scratch 画布的 'd'+__id——scratch 无 __id → 'd?'）
      expect(quads.length).toBe(1);
      expect(quads[0].texKey).toBe('d?');
      expect(quads[0].dx).toBe(577); expect(quads[0].dy).toBe(420);
      expect(quads[0].dw).toBe(42); expect(quads[0].dh).toBe(58);
      expect(ex.stats.fallback).toBe(0);
    });
  });

  it('单位 CTM 等价回归锁:2 参形态 scratch 落点=geo.dx−fx（旧行为正确面不回退）', async () => {
    const scratchLog: ScratchDrawRec[] = [];
    await withFakeDoc(scratchLog, async () => {
      vi.resetModules();
      const { GLShimExecutor: FreshExec } = await import('../src/render/glshim/GLShimExecutor');
      const { L, quads } = mkFullAccLayer();
      const ex = new FreshExec({
        acquireGl: () => L, worldCtx: () => null, worldW: () => 128, worldH: () => 72,
        degradeAcc: () => false,
      });
      const wrap = ex.attachAcc() as unknown as { filter: string; drawImage: (i: CanvasImageSource, ...r: unknown[]) => void };
      wrap.filter = 'brightness(2.5)';
      const img = { width: 64, height: 64, __id: 9 } as unknown as CanvasImageSource;
      wrap.drawImage(img, 10, 10);
      // 设备矩形=(10,10,64,64) → fx=fy=9,sx2=sy2=66;scratch x=10−9=1
      expect(scratchLog.length).toBe(1);
      expect(scratchLog[0].mat).toEqual([1, 0, 0, 1, -9, -9]);
      expect(scratchLog[0].args).toEqual([img, 10, 10]);
      expect(quads.length).toBe(1);
      expect(quads[0].dx).toBe(9); expect(quads[0].dy).toBe(9);
      expect(quads[0].dw).toBe(66); expect(quads[0].dh).toBe(66);
    });
  });
});

// ★BJ387（2026-09-28 用户实报「夜晚雨天悬停 A 驻家旗→B 驻家旗黑块」）判别器锁:
// 桥接帧 gco='multiply'（drawHouseBanners 旗 tint fillRect 经 shim Reflect.set 落
// raw worldCtxLayer）活跃点的 flushForFallback→presentBatch 回贴 drawImage 必须
// 【显式】source-over——旧码 SO 臂继承 ambient gCO → FBO 旗布/头像 quad 乘上
// worldCanvas 身后墙格（cloth×wall=黑块;探针 _bj387-banner-hover-black 实测
// presentBatch wctxGco:"multiply" + B 旗矩形逐像素暗化 0.68）。修复前本断言红。
describe('★BJ387 presentBatch 回贴 gCO 显式置位（ambient multiply 泄漏=旗布×墙黑块）', () => {
  function mkBridgedHost() {
    const wctx = new FakeCtx();
    const layer = {
      unavailable: false,
      canvas: {} as unknown as HTMLCanvasElement,
      isAccumOpen: (_n: string) => false,
      resize() { /* no-op */ },
      begin() { /* no-op */ },
      end() { /* no-op */ },
      blendAdditive() { /* no-op */ },
      quadSprite() { /* no-op */ },
      texFromRegion() { return { tex: {}, w: 8, h: 8, key: 'stub' }; },
      texAlive() { return true; },
    };
    const host = {
      acquireGl: () => (layer.unavailable ? null : (layer as never)),
      worldCtx: () => wctx as unknown as CanvasRenderingContext2D,
      worldW: () => 1280, worldH: () => 720,
    };
    return { wctx, layer, host };
  }

  it('multiply fillRect 触发的 flush:回贴 drawImage gco=source-over（黑块判别器）;raw tint fillRect gco=multiply（tint 本体面不回退）', () => {
    const { wctx, host } = mkBridgedHost();
    const ex = new GLShimExecutor(host as never);
    const raw = new FakeCtx();
    const wrap = ex.attach(raw as unknown as CanvasRenderingContext2D) as unknown as FakeCtx;
    expect(wrap).not.toBeNull();
    const img = mkImg(1);
    // 旗布 quad 入队（桥接 SO 批——B 旗 cloth+head 同形状族）
    wrap.drawImage(img, 0, 0, 34, 42, 740, 418, 34, 42);
    // 旗 tint 的 ambient 毒化（drawHouseBanners:save→gco='multiply'→fillRect;
    // shim set 经 Reflect.set 直落 raw——此刻 flush 的 ambient 正是 multiply）
    wrap.globalCompositeOperation = 'multiply';
    wrap.fillStyle = 'rgb(191,181,125)';
    wrap.fillRect(740, 418, 34, 46);
    // 回贴面（presentBatch 的 wctx.drawImage）gco 恒 source-over——修复前='multiply'
    const draws = wctx.log.filter((l) => l.op === 'draw');
    expect(draws.length).toBe(1);
    expect(draws[0].gco).toBe('source-over');
    // tint 本体（flush 后 raw fillRect——落 attach 的 raw ctx,非 wctx）gco 恒 multiply
    const fills = raw.log.filter((l) => l.op === 'fill');
    expect(fills.length).toBe(1);
    expect(fills[0].gco).toBe('multiply');
    expect(fills[0].args).toEqual([740, 418, 34, 46]);
  });

  it('结构锁:回贴 gCO 双臂显式置位（additive→lighter/SO→source-over,禁 ambient 继承形状）', () => {
    const EXEC = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');
    expect(EXEC).toContain("wctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';");
    expect(EXEC).not.toMatch(/if \(additive\) wctx\.globalCompositeOperation = 'lighter';/);
  });
});
