// ★C5 雨批（rain-gl）结构锁+行为锁（2026-09-26）。
// node 可跑面：drawRain GL 支端到端（fake Renderer 中介捕获批数据）+
// buildRainBatch 产出逐式断言（几何/tint/uv/重放面）+ GLShimExecutor
// pushQuadBatch 队列行为（acc 发射/可表达性门/降级重放）——
// 像素对拍=scripts/_rain-gl-ab.mjs（node 无 GL/canvas,该面探针锁）。
// 【几何锁口径】矩阵拼接与 GLShimExecutor 镜像算子同式同 fround 链（独立
// 复算双向锁）;角点直构比 decode 的 hypot/atan2 重构少一次往返（census 同族）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';
import {
  buildRainBatch, drawRainBatchCaptureForTest, rainGlSetForTest, rainGl,
  rainTexSetForTest, WeatherRenderer,
  type RainDrop,
} from '../src/render/WeatherRenderer';

const WR = readFileSync(join(__dirname, '../src/render/WeatherRenderer.ts'), 'utf8');
const RD = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const GS = readFileSync(join(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const GE = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');

const TEX_W = 168, TEX_H = 42;
const frnd = Math.fround;

/** 镜像算子同式独立复算（与 GLShimExecutor translate/rotate 逐式同构）——设备四角。
 *  产出与批 scratch 同为 f32 存储（Float32Array 舍入面),断言侧同口径 fround。 */
function expectCorners(base: readonly number[], x: number, y: number, rot: number, w: number, h: number) {
  const [ba, bb, bc, bd, be, bf] = base;
  const e1 = frnd(frnd(ba * x) + frnd(frnd(bc * y) + be));
  const f1 = frnd(frnd(bb * x) + frnd(frnd(bd * y) + bf));
  const co = frnd(Math.cos(rot)), si = frnd(Math.sin(rot));
  const a = frnd(frnd(ba * co) + frnd(bc * si));
  const b = frnd(frnd(bb * co) + frnd(bd * si));
  const c = frnd(frnd(bc * co) - frnd(ba * si));
  const d = frnd(frnd(bd * co) - frnd(bb * si));
  return [
    [frnd(e1), frnd(f1)],
    [frnd(frnd(a * w) + e1), frnd(frnd(b * w) + f1)],
    [frnd(frnd(frnd(a * w) + frnd(c * h)) + e1), frnd(frnd(frnd(b * w) + frnd(d * h)) + f1)],
    [frnd(frnd(c * h) + e1), frnd(frnd(d * h) + f1)],
  ] as const;
}

function mkDrop(over: Partial<RainDrop>): RainDrop {
  return { x: 0, y: 0, vx: 0, vy: 14, scale: 1, rotation: 0, type: 0, active: true, ...over };
}

/** drawRain GL 支端到端：rainGl 开+纹理桩+池注入 → fake Renderer 中介捕获批数据。
 *  返回 { data, quads, img, key, replay } 或 null（走了 2D 链/零活滴零绘制）。 */
function drawRainCapture(drops: RainDrop[],
  base: readonly number[], shimmer = 0,
  light: (out: number[]) => void = (o) => { o[0] = 255; o[1] = 255; o[2] = 255; },
  emit: 'ok' | 'no-executor' = 'ok') {
  const fx = new WeatherRenderer();
  fx.poolSetForTest(drops);
  fx.attach({ cloudAlpha: 1 } as never, {
    lightAtTo: (_tx: number, _ty: number, out: number[]) => { light(out); return out; },
    shimmerAlpha: shimmer,
  } as never);
  rainTexSetForTest({ width: TEX_W, height: TEX_H } as unknown as ImageBitmap);
  let cap: { data: Float32Array; quads: number; img: unknown; key: string; replay: unknown } | null = null;
  const fakeR = {
    // 2D 原链回落面（回退 case 走到逐滴链;node 无 document→烘焙 null 不落笔）
    ctx: {
      getTransform: () => ({ a: base[0], b: base[1], c: base[2], d: base[3], e: base[4], f: base[5] }),
      save() { /* no-op */ }, restore() { /* no-op */ },
      setTransform() { /* no-op */ }, translate() { /* no-op */ }, rotate() { /* no-op */ },
      drawImage() { /* no-op */ },
      imageSmoothingEnabled: true,
    },
    emitRainQuadBatch: (img: unknown, key: string, data: Float32Array, quads: number, replay: unknown) => {
      if (emit !== 'ok') return false;   // 拒收=批不入队（WeatherRenderer 回 2D 原链）
      cap = { data: data.slice(), quads, img, key, replay };
      return true;
    },
  };
  fx.drawRain(fakeR as never, {} as never);
  return cap as { data: Float32Array; quads: number; img: unknown; key: string; replay: unknown } | null;
}

describe('★C5 drawRain GL 支端到端+buildRainBatch 产出锁', () => {
  it('批数据捕获:6 顶点/quad×7 float;单位基阵 rot0 角点=translate+scale 直构', () => {
    rainGlSetForTest(true);
    const cap = drawRainCapture([mkDrop({ x: 100, y: 200, scale: 1, type: 3 })], [1, 0, 0, 1, 0, 0]);
    expect(cap).not.toBeNull();
    expect(cap!.quads).toBe(1);
    expect(cap!.key).toBe('rain:raw');
    const v = cap!.data;
    expect(v.length).toBeGreaterThanOrEqual(42);
    const exp = expectCorners([1, 0, 0, 1, 0, 0], 100, 200, 0, 2, 40);
    expect(v[0]).toBe(exp[0][0]); expect(v[1]).toBe(exp[0][1]);
    expect(v[7]).toBe(exp[1][0]); expect(v[8]).toBe(exp[1][1]);
    expect(v[14]).toBe(exp[2][0]); expect(v[15]).toBe(exp[2][1]);
    // 三角二 (p0,p2,p3)：v3=v0 复用、v4=v2 复用、v5=p3
    expect(v[21]).toBe(exp[0][0]); expect(v[22]).toBe(exp[0][1]);
    expect(v[28]).toBe(exp[2][0]); expect(v[29]).toBe(exp[2][1]);
    expect(v[35]).toBe(exp[3][0]); expect(v[36]).toBe(exp[3][1]);
  });

  it('旋转档+zoom 基阵:角点与镜像算子同式 fround 链逐位相等', () => {
    rainGlSetForTest(true);
    const z = 1.25 * 0.9, ox = 320.5, oy = 180.25;
    const base = [z, 0, 0, z, ox, oy];
    const cap = drawRainCapture([mkDrop({ x: 555.5, y: 777.25, rotation: 0.42, scale: 1.08, type: 7 })], base);
    const exp = expectCorners(base, 555.5, 777.25, 0.42, 2 * 1.08, 40 * 1.08);
    const v = cap!.data;
    expect(v[0]).toBe(exp[0][0]); expect(v[1]).toBe(exp[0][1]);
    expect(v[7]).toBe(exp[1][0]); expect(v[8]).toBe(exp[1][1]);
    expect(v[14]).toBe(exp[2][0]); expect(v[15]).toBe(exp[2][1]);
    expect(v[35]).toBe(exp[3][0]); expect(v[36]).toBe(exp[3][1]);
  });

  it('tint 量化:round(light×k)/255;k=0.85×(1−shimmer);先乘后钳（tintByte 同序）', () => {
    rainGlSetForTest(true);
    const base = [1, 0, 0, 1, 0, 0];
    let v = drawRainCapture([mkDrop({ x: 1, y: 1 })], base,
      0, (o) => { o[0] = 200; o[1] = 100; o[2] = 50; })!.data;
    expect(v[4]).toBeCloseTo(170 / 255, 7);
    expect(v[5]).toBeCloseTo(85 / 255, 7);
    expect(v[6]).toBeCloseTo(43 / 255, 7);   // round(50×0.85)=round(42.5)=43
    v = drawRainCapture([mkDrop({ x: 1, y: 1 })], base,
      0.5, (o) => { o[0] = 255; o[1] = 255; o[2] = 255; })!.data;
    expect(v[4]).toBeCloseTo(Math.round(255 * 0.425) / 255, 7);
    v = drawRainCapture([mkDrop({ x: 1, y: 1 })], base,
      0, (o) => { o[0] = 300; o[1] = -5; o[2] = 0; })!.data;
    expect(v[4]).toBe(1); expect(v[5]).toBe(0); expect(v[6]).toBe(0);
  });

  it('uv 全跨度−ε tie 补正（type×4 帧偏移）;flipY=det<0 → v 区间反向', () => {
    rainGlSetForTest(true);
    const eps = 1 / 4096;
    let v = drawRainCapture([mkDrop({ x: 0, y: 0, type: 5 })], [1, 0, 0, 1, 0, 0])!.data;
    expect(v[2]).toBeCloseTo((20 - eps) / TEX_W, 7);
    expect(v[9]).toBeCloseTo((22 - eps) / TEX_W, 7);
    expect(v[3]).toBeCloseTo(-eps / TEX_H, 7);
    expect(v[17]).toBeCloseTo((40 - eps) / TEX_H, 7);
    v = drawRainCapture([mkDrop({ x: 0, y: 0, type: 5 })], [1, 0, 0, -1, 0, 0])!.data;
    expect(v[3]).toBeCloseTo((40 - eps) / TEX_H, 7);
    expect(v[17]).toBeCloseTo(-eps / TEX_H, 7);
  });

  it('非 active 滴跳过;源矩形越界回 2D;无执行器窗回 2D;旗关走 2D', () => {
    rainGlSetForTest(true);
    expect(drawRainCapture([mkDrop({ active: false })], [1, 0, 0, 1, 0, 0])).toBeNull();   // quads=0→true=零绘制,无批
    expect(drawRainCapture([mkDrop({ type: 42 })], [1, 0, 0, 1, 0, 0])).toBeNull();        // 越界整帧回 2D
    expect(drawRainCapture([mkDrop({ type: 41 })], [1, 0, 0, 1, 0, 0])!.quads).toBe(1);
    // 无执行器窗（emit false）→ 回 2D 原链
    expect(drawRainCapture([mkDrop({ x: 5, y: 5 })], [1, 0, 0, 1, 0, 0], 0, undefined, 'no-executor')).toBeNull();
    // 旗关 → 2D 原链（无批捕获）
    rainGlSetForTest(false);
    expect(drawRainCapture([mkDrop({ x: 5, y: 5 })], [1, 0, 0, 1, 0, 0])).toBeNull();
    rainGlSetForTest(rainGlDefault);
    void rainGl;
  });

  it('重放面与批同构:顶点色×255 往返可逆+[co,si,w,h,sx] 槽位（降级回放依据）', () => {
    rainGlSetForTest(true);
    const cap = drawRainCapture([mkDrop({ x: 9, y: 9, rotation: 0.1, scale: 0.9, type: 2 })], [1, 0, 0, 1, 0, 0])!;
    const rp = drawRainBatchCaptureForTest().replay;
    expect(rp[2]).toBeCloseTo(2 * 0.9, 7);
    expect(rp[3]).toBeCloseTo(40 * 0.9, 7);
    expect(rp[4]).toBe(8);   // type2 → sx=8
    const v = cap.data;
    expect(Math.round(v[4] * 255)).toBe(217);   // round(255×0.85)=round(216.75)
    // 重放闭包可调用（node 无 canvas:tinted 烘焙 null → 逐滴跳过,但 save/restore 平衡）
    const calls: string[] = [];
    const fakeCtx = {
      save() { calls.push('save'); }, restore() { calls.push('restore'); },
      setTransform() { calls.push('setTransform'); }, drawImage() { calls.push('drawImage'); },
      imageSmoothingEnabled: true,
    };
    (cap.replay as (c: unknown) => void)(fakeCtx);
    expect(calls[0]).toBe('save');
    expect(calls[calls.length - 1]).toBe('restore');
  });
});

// ---- GLShimExecutor.pushQuadBatch 行为锁 ----
function mkRainHost() {
  const layer = {
    unavailable: false, open: false,
    quadBatchCalls: [] as Array<{ key: string; quads: number; len: number; ok: boolean }>,
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin() { this.open = true; },
    resize() { /* no-op */ },
    endAccumulate() { this.open = false; return null; },
    blendAdditive() { /* no-op */ }, blendErase() { /* no-op */ }, blendMult() { /* no-op */ },
    quadSprite() { /* no-op */ },
    texFromImage(key: string) {
      if (this.unavailable) return null;
      return { tex: {}, w: TEX_W, h: TEX_H, key, bytes: 1, mipped: false };
    },
    texAlive() { return true; },
    quadBatch(e: { key: string }, data: Float32Array, quads: number) {
      const ok = !this.failQuadBatch;
      this.quadBatchCalls.push({ key: e.key, quads, len: data.length, ok });
      return ok;
    },
    failQuadBatch: false,
    texFromRegion() { return null; }, texFromData() { return null; }, texRefresh() { return null; },
    end() { /* no-op */ },
  };
  return {
    layer,
    host: {
      acquireGl: () => (layer.unavailable ? null : layer),
      worldCtx: () => null,
      worldW: () => 128, worldH: () => 72,
    },
  };
}

describe('★C5 GLShimExecutor.pushQuadBatch 行为锁', () => {
  it('acc 态:批=一条 rec 原位入队,flush 单次 quadBatch 发射+stats 对账', () => {
    const { layer, host } = mkRainHost();
    const exec = new GLShimExecutor(host as never);
    expect(exec.attachAcc()).not.toBeNull();
    expect(exec.pushQuadBatch({ width: TEX_W } as unknown as CanvasImageSource, 'rain:raw',
      new Float32Array(42), 1, () => {})).toBe(true);
    exec.flush();
    expect(layer.quadBatchCalls.length).toBe(1);
    expect(layer.quadBatchCalls[0].key).toBe('rain:raw');
    expect(layer.quadBatchCalls[0].quads).toBe(1);
    expect(exec.stats.emitBatchQuads).toBe(1);
    // 零活滴=接受但零发射（与 2D 零绘制等价）
    expect(exec.pushQuadBatch({} as CanvasImageSource, 'k', new Float32Array(0), 0, () => {})).toBe(true);
    exec.flush();
    expect(layer.quadBatchCalls.length).toBe(1);
  });

  it('可表达性门:ga≠1/gco 非 SO/clip → false=调用方回 2D 原链', () => {
    const { host } = mkRainHost();
    const exec = new GLShimExecutor(host as never);
    expect(exec.attachAcc()).not.toBeNull();
    const q = () => exec.pushQuadBatch({} as CanvasImageSource, 'k', new Float32Array(42), 1, () => {});
    const s = exec as unknown as { ga: number; gco: string; clipped: boolean };
    s.ga = 0.5;
    expect(q()).toBe(false);
    s.ga = 1; s.gco = 'lighter';
    expect(q()).toBe(false);
    s.gco = 'source-over'; s.clipped = true;
    expect(q()).toBe(false);
  });

  it('非活跃窗 → false（纯 2D 帧走 2D 原链的判据面）', () => {
    const { host } = mkRainHost();
    const exec = new GLShimExecutor(host as never);
    expect(exec.pushQuadBatch({} as CanvasImageSource, 'k', new Float32Array(42), 1, () => {})).toBe(false);
  });

  it('GL 发射失败 → accFail 降级,失败发射不计账（degrade 面探针挂钩同源）', () => {
    const { layer, host } = mkRainHost();
    (host as unknown as { degradeAcc: () => boolean }).degradeAcc = () => true;
    const exec = new GLShimExecutor(host as never);
    expect(exec.attachAcc()).not.toBeNull();
    layer.failQuadBatch = true;
    expect(exec.pushQuadBatch({ width: TEX_W } as unknown as CanvasImageSource, 'rain:raw',
      new Float32Array(42), 1, () => {})).toBe(true);
    exec.flush();
    expect(layer.quadBatchCalls.length).toBe(1);
    expect(exec.stats.emitBatchQuads).toBe(0);
  });

  it('降级重放:批 rec 经 replay 闭包 2D 直画（宁回退不丢精灵）', () => {
    const { layer, host } = mkRainHost();
    (host as unknown as { degradeAcc: () => boolean }).degradeAcc = () => true;
    const exec = new GLShimExecutor(host as never);
    expect(exec.attachAcc()).not.toBeNull();
    const replayed: unknown[] = [];
    const fake = {
      setTransform() { /* no-op */ }, globalAlpha: 1, globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: false, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      filter: 'none', font: '10px sans-serif', textAlign: 'left',
      lineCap: 'butt', lineJoin: 'miter', miterLimit: 10,
    };
    (exec as unknown as { bridge: (c: unknown) => void }).bridge(fake);
    layer.failQuadBatch = true;   // 发射失败 → accFail → degradeAcc(true) → replay2D
    expect(exec.pushQuadBatch({ width: TEX_W } as unknown as CanvasImageSource, 'rain:raw',
      new Float32Array(42), 1, (c) => { replayed.push(c); })).toBe(true);
    exec.flush();
    expect(replayed.length).toBe(1);
    expect(replayed[0]).toBe(fake);
    expect(exec.stats.replays).toBe(1);
  });
});

// ---- 结构锁（源码锚;防并行会话漂移） ----
describe('★C5 rain-gl 结构锁', () => {
  it('WeatherRenderer:drawRain GL 支前置+批构建+中介发射+重放闭包+2D 原链保留', () => {
    expect(WR).toContain('if (rainGl && this.tryDrawRainGL(r)) return;');
    expect(WR).toContain('r.emitRainQuadBatch(tex, RAIN_TEX_KEY, rainBatchData, quads, replayRainBatch2D)');
    expect(WR).toContain('export function buildRainBatch(');
    expect(WR).toContain('function replayRainBatch2D(');
    expect(WR).toContain("get('raingl')");
    expect(WR).toContain('export function rainGlSetForTest(');
    expect(WR).toContain('export function rainTexSetForTest(');
    // 2D 原链保留（逃生门=逐滴烘焙路径原样）
    expect(WR).toContain("bakeTintFrame('rain-strip', tex!, d.type * 4, 0, 2, 40, cr, cg, cb)");
    // 矩阵拼接=执行器镜像同式（fround 链锚）
    expect(WR).toContain('const frnd = Math.fround;');
    expect(WR).toContain('frnd(frnd(base.a * co) + frnd(base.c * si))');
  });

  it('Renderer:emitRainQuadBatch 中介（单执行器二态;非活跃窗回 false）', () => {
    expect(RD).toContain('emitRainQuadBatch(img: CanvasImageSource, key: string, data: Float32Array, quads: number,');
    expect(RD).toContain('if (!shim?.active) return false;');
    expect(RD).toContain('return shim.pushQuadBatch(img, key, data, quads, replay);');
  });

  it('GLSpriteLayer:sprite:rain 程序+quadBatch 单 draw（NEAREST/STREAM/态还原）', () => {
    expect(GS).toContain("this.pipe.program('sprite:rain', RAIN_VS, RAIN_FS)");
    expect(GS).toContain('gl.drawArrays(gl.TRIANGLES, 0, quads * 6);');
    expect(GS).toContain('gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);');
    expect(GS).toContain('gl.bindSampler(0, this.samp.nearest!)');
    expect(GS).toContain('gl.bindVertexArray(this.vao);');
    expect(GS).toContain('gl.useProgram(this.prog);');
    expect(GS).toContain('outColor = vec4(c.rgb * vCol, c.a);');
  });

  it('GLShimExecutor:批 rec 池卫生+发射/重放分支+可表达性门', () => {
    expect(GE).toContain('rec.batch = null;');
    expect(GE).toContain('pushQuadBatch(img: CanvasImageSource, key: string, data: Float32Array, quads: number,');
    expect(GE).toContain("if (this.clipped || this.filterV !== 'none') return false;");
    expect(GE).toContain("if (this.ga !== 1 || this.gco !== 'source-over') return false;");
    expect(GE).toContain('if (p.batch) { p.batch.replay(raw); this.stats.replays++; continue; }');
    expect(GE).toContain('if (p.solid || p.pair || p.dynamic || p.batch) continue;');
  });
});

/** 旗缺省值快照（灰度期）——转正后随旗面一起翻 */
const rainGlDefault = rainGl;
