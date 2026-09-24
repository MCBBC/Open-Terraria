// ★B2 shim 执行器 结构锁+行为锁（2026-09-24）。
// node 可跑面：FakeCtx stub（GL 侧全程不可用→flush 走 2D 重放支）——
//   解码（CTM×dst）/发射序/吞抑/混合档/save-restore/回退触发 全在重放参数上断言。
// 像素对拍=scripts/_b2-entity-ab.mjs（node 无 GL/canvas,该面探针锁）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';
import { dustPremulBake } from '../src/fx/VanillaDust';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const SRC = readFileSync(join(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');

// ---- FakeCtx：记录面 drawImage/fillRect 参数与状态（重放落点） ----
interface DrawRec { op: 'draw' | 'fill'; img: unknown; args: unknown[]; gco: string; alpha: number; smooth: boolean }
class FakeCtx {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  imageSmoothingEnabled = false;
  fillStyle = '#000';
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
  drawImage(img: unknown, ...args: unknown[]) { this.log.push({ op: 'draw', img, args, gco: this.globalCompositeOperation, alpha: this.globalAlpha, smooth: this.imageSmoothingEnabled }); }
  fillRect(x: number, y: number, w: number, h: number) { this.log.push({ op: 'fill', img: null, args: [x, y, w, h], gco: this.globalCompositeOperation, alpha: this.globalAlpha, smooth: this.imageSmoothingEnabled }); }
}

/** host 桩:attach 期层可用;翻 layer.unavailable=true 后 flush 走 2D 重放支 */
function mkHost() {
  const layer = { unavailable: false } as { unavailable: boolean };
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
