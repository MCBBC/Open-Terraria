// ★C5b 雪沙 precip 批（precip-gl）结构锁+行为锁+池语义锁（2026-09-27;rain-gl-batch
// 同构）。node 可跑面：drawPrecipDust GL 支端到端（fake Renderer 中介捕获批数据）+
// buildPrecipBatch 产出逐式断言（几何/tint/α/uv/重放面/黑光衰减侧效）+
// GLShimExecutor.pushQuadBatchRgba 队列行为 + bakeMemoizedInto 池语义（填充期出生
// 有界/淘汰回池平衡/单尺寸族存量帽——哨兵 92 张 canvas/s 定谳的回归锁）——
// 像素对拍=scripts/_precip-gl-ab.mjs（node 无 GL/canvas,该面探针锁）。
// 【几何锁口径】precip 无逐粒旋转（vanilla DrawDust origin (4,4) rot 0）——基 CTM
// 直乘,角点 fround 链与执行器镜像同式（独立复算双向锁）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, afterAll } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';
import {
  buildPrecipBatch, drawPrecipBatchCaptureForTest, rainGl, rainGlSetForTest,
  dustTexSetForTest, WeatherRenderer,
} from '../src/render/WeatherRenderer';

const WR = readFileSync(join(__dirname, '../src/render/WeatherRenderer.ts'), 'utf8');
const RD = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const GS = readFileSync(join(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const GE = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');

const TEX_W = 1000, TEX_H = 120;
const frnd = Math.fround;
const EPS = 1 / 4096;
const GA = 180 / 255;
const rainGlDefault = rainGl;

/** 镜像算子同式独立复算（precip:基 CTM 直乘——co=1/si=0 折叠）。★批存储=f32
 *  （Float32Array 落槽即 fround）,断言侧同口径:每个和式末位补 frnd。 */
function expectCorners(base: readonly number[], x0: number, y0: number, sz: number) {
  const [ba, bb, bc, bd, be, bf] = base;
  const e1 = frnd(frnd(ba * x0) + frnd(frnd(bc * y0) + be));
  const f1 = frnd(frnd(bb * x0) + frnd(frnd(bd * y0) + bf));
  return [
    [frnd(e1), frnd(f1)],
    [frnd(frnd(ba * sz) + e1), frnd(frnd(bb * sz) + f1)],
    [frnd(frnd(frnd(ba * sz) + frnd(bc * sz)) + e1), frnd(frnd(frnd(bb * sz) + frnd(bd * sz)) + f1)],
    [frnd(frnd(bc * sz) + e1), frnd(frnd(bd * sz) + f1)],
  ];
}

type LT = (tx: number, ty: number, out: number[]) => number[];
const lightOf = (map: Record<string, [number, number, number]>): LT => (tx, ty, out) => {
  const v = map[`${tx},${ty}`] ?? [255, 255, 255];
  out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
  return out;
};

const mkFlake = (o: Partial<{ x: number; y: number; scale: number; frame: number; active: boolean }>) =>
  ({ x: 100, y: 100, vx: 0, vy: 0, scale: 1, frame: 0, active: true, ...o });
const mkGrain = (o: Partial<{ x: number; y: number; scale: number; frame: number; cr: number; cg: number; cb: number; active: boolean }>) =>
  ({ x: 100, y: 100, vx: 0, vy: 0, scale: 1, fadeIn: 0, cr: 200, cg: 160, cb: 20, frame: 0, active: true, ...o });

describe('★C5b buildPrecipBatch 产出锁', () => {
  it('雪 quad:轴对齐角点 fround 链逐位相等+uv 全跨度−ε（frame 偏移 (760,10×f)）+tint=light/255', () => {
    const z = 1.25 * 0.9, ox = 320.5, oy = 180.25;
    const base = [z, 0, 0, z, ox, oy];
    const lt = lightOf({ '6,6': [200, 100, 50] });
    const n = buildPrecipBatch({ a: z, b: 0, c: 0, d: z, e: ox, f: oy },
      [mkFlake({ x: 100, y: 100, scale: 1.4, frame: 2 })], [], lt, TEX_W, TEX_H);
    expect(n).toBe(1);
    const v = drawPrecipBatchCaptureForTest().data;
    const sz = 8 * 1.4;
    const exp = expectCorners(base, 100 - 4 * 1.4, 100 - 4 * 1.4, sz);
    expect(v[0]).toBe(exp[0][0]); expect(v[1]).toBe(exp[0][1]);
    expect(v[8]).toBe(exp[1][0]); expect(v[9]).toBe(exp[1][1]);
    expect(v[16]).toBe(exp[2][0]); expect(v[17]).toBe(exp[2][1]);
    expect(v[40]).toBe(exp[3][0]); expect(v[41]).toBe(exp[3][1]);
    // 光照采样点=雪 (+5,+5)/16 → (6,6)（(100.4+5)/16 floor=6）
    expect(v[2]).toBeCloseTo((760 - EPS) / TEX_W, 7);
    expect(v[10]).toBeCloseTo((768 - EPS) / TEX_W, 7);
    expect(v[3]).toBeCloseTo((20 - EPS) / TEX_H, 7);      // frame2 → sy=20
    expect(v[19]).toBeCloseTo((28 - EPS) / TEX_H, 7);
    expect(v[4]).toBeCloseTo(200 / 255, 7); expect(v[5]).toBeCloseTo(100 / 255, 7); expect(v[6]).toBeCloseTo(50 / 255, 7);
    expect(v[7]).toBe(1);                                  // 单画 α=1
  });

  it('沙 grain 双 quad 交错序:基画(α=1,light)+叠画(α=180/255,GetColor 色×ga);批内序=2D 逐粒序', () => {
    const base = [1, 0, 0, 1, 0, 0];
    const lt = lightOf({ '6,6': [255, 255, 255] });
    const n = buildPrecipBatch({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      [], [mkGrain({ x: 96, y: 96, scale: 1, cr: 200, cg: 160, cb: 20, frame: 1 })], lt, TEX_W, TEX_H);
    expect(n).toBe(2);
    const v = drawPrecipBatchCaptureForTest().data;
    // quad0=基画:uv sy=70(frame1),α=1,色=light
    expect(v[3]).toBeCloseTo((70 - EPS) / TEX_H, 7);
    expect(v[7]).toBe(1);
    expect(v[4]).toBe(1); expect(v[5]).toBe(1); expect(v[6]).toBe(1);
    // quad1=叠画:GetColor=(200+255−255,160+255−255,20+255−255)=(200,160,20)×ga;α=ga
    const o = 48;
    expect(v[o + 2]).toBeCloseTo((680 - EPS) / TEX_W, 7);
    expect(v[o + 3]).toBeCloseTo((70 - EPS) / TEX_H, 7);
    expect(v[o + 4]).toBeCloseTo((200 / 255) * GA, 7);
    expect(v[o + 5]).toBeCloseTo((160 / 255) * GA, 7);
    expect(v[o + 6]).toBeCloseTo((20 / 255) * GA, 7);
    expect(v[o + 7]).toBeCloseTo(GA, 7);
    // 重放面:[sx,sy,sz,a255] 基 255/叠 180
    const rp = drawPrecipBatchCaptureForTest().replay;
    expect(rp[0]).toBe(680); expect(rp[1]).toBe(70); expect(rp[3]).toBe(255);
    expect(rp[4]).toBe(680); expect(rp[5]).toBe(70); expect(rp[7]).toBe(180);
  });

  it('黑光衰减侧效:light=(0,0,0) → active=false（:39730,与 2D 路径同写序）', () => {
    const f = mkFlake({ x: 0, y: 0 });
    const g = mkGrain({ x: 0, y: 0 });
    const blackLT: LT = (_tx, _ty, out) => { out[0] = 0; out[1] = 0; out[2] = 0; return out; };
    const n = buildPrecipBatch({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, [f], [g], blackLT, TEX_W, TEX_H);
    expect(n).toBe(0);
    expect(f.active).toBe(false);
    expect(g.active).toBe(false);
  });

  it('门:frame 越界/纹理过小 → -1 整帧回 2D;零活粒 → 0;zoom 基阵角点逐位锁', () => {
    expect(buildPrecipBatch({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      [mkFlake({ frame: 3 })], [], lightOf({}), TEX_W, TEX_H)).toBe(-1);
    expect(buildPrecipBatch({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      [], [mkGrain({ frame: -1 })], lightOf({}), TEX_W, TEX_H)).toBe(-1);
    // 源矩形越界门:FLAKE_SX+8=768 > texW=760 → -1（active 粒才可达此门）
    expect(buildPrecipBatch({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      [mkFlake({})], [], lightOf({}), 760, TEX_H)).toBe(-1);
    expect(buildPrecipBatch({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      [], [], lightOf({}), TEX_W, TEX_H)).toBe(0);
    const base = [1.3, 0, 0, 0.85, 12.5, -3.25];
    buildPrecipBatch({ a: 1.3, b: 0, c: 0, d: 0.85, e: 12.5, f: -3.25 },
      [mkFlake({ x: 55.5, y: 77.25, scale: 0.9 })], [], lightOf({}), TEX_W, TEX_H);
    const v = drawPrecipBatchCaptureForTest().data;
    const exp = expectCorners(base, 55.5 - 3.6, 77.25 - 3.6, 7.2);
    expect(v[0]).toBe(exp[0][0]); expect(v[1]).toBe(exp[0][1]);
    expect(v[40]).toBe(exp[3][0]); expect(v[41]).toBe(exp[3][1]);
  });
});

// ---- drawPrecipDust GL 支端到端 ----
function precipCapture(
  snow: ReturnType<typeof mkFlake>[], sand: ReturnType<typeof mkGrain>[],
  base = [1, 0, 0, 1, 0, 0], emit: 'ok' | 'no-executor' = 'ok',
) {
  vi.stubGlobal('document', undefined);   // 2D 回落面:烘焙 null 不落笔（node 无 DOM 判例）
  dustTexSetForTest({ width: TEX_W, height: TEX_H } as unknown as ImageBitmap);
  const fx = new WeatherRenderer();
  (fx as unknown as { snow: unknown[] }).snow = snow;
  (fx as unknown as { sand: unknown[] }).sand = sand;
  fx.attach({ cloudAlpha: 1 } as never, {
    lightAtTo: (_tx: number, _ty: number, out: number[]) => { out[0] = 255; out[1] = 255; out[2] = 255; return out; },
  } as never);
  let cap: { data: Float32Array; quads: number; img: unknown; key: string; replay: unknown } | null = null;
  const fakeR = {
    ctx: {
      getTransform: () => ({ a: base[0], b: base[1], c: base[2], d: base[3], e: base[4], f: base[5] }),
      save() { /* no-op */ }, restore() { /* no-op */ },
      setTransform() { /* no-op */ }, drawImage() { /* no-op */ },
      imageSmoothingEnabled: true,
    },
    emitPrecipQuadBatch: (img: unknown, key: string, data: Float32Array, quads: number, replay: unknown) => {
      if (emit !== 'ok') return false;
      cap = { data: data.slice(), quads, img, key, replay };
      return true;
    },
  };
  fx.drawPrecipDust(fakeR as never, {} as never);
  vi.unstubAllGlobals();
  dustTexSetForTest(null);
  return cap as { data: Float32Array; quads: number; img: unknown; key: string; replay: unknown } | null;
}

describe('★C5b drawPrecipDust GL 支端到端', () => {
  afterAll(() => { rainGlSetForTest(rainGlDefault); });

  it('批捕获:雪+沙双 quad 一帧一发射;键=precip:dust;旗关/无执行器窗回 2D', () => {
    rainGlSetForTest(true);
    const cap = precipCapture([mkFlake({ x: 10, y: 10 })], [mkGrain({ x: 20, y: 20 })]);
    expect(cap).not.toBeNull();
    expect(cap!.quads).toBe(3);
    expect(cap!.key).toBe('precip:dust');
    expect((cap!.img as { width: number }).width).toBe(TEX_W);
    // 无执行器窗 → 回 2D 原链（无批捕获）
    expect(precipCapture([mkFlake({})], [], [1, 0, 0, 1, 0, 0], 'no-executor')).toBeNull();
    // 旗关 → 2D 原链
    rainGlSetForTest(false);
    expect(precipCapture([mkFlake({})], [])).toBeNull();
    rainGlSetForTest(true);
    // 零活粒 → 批零绘制等价（emit 不触发,无捕获）
    expect(precipCapture([mkFlake({ active: false })], [])).toBeNull();
  });

  it('重放闭包可调用（node 无 canvas:tinted 烘焙 null → 逐 quad 跳过,save/restore 平衡）', () => {
    rainGlSetForTest(true);
    const cap = precipCapture([mkFlake({ x: 9, y: 9, scale: 0.9 })], [])!;
    dustTexSetForTest({ width: TEX_W, height: TEX_H } as unknown as ImageBitmap);   // 重放面取纹理
    const calls: string[] = [];
    const fakeCtx = {
      save() { calls.push('save'); }, restore() { calls.push('restore'); },
      setTransform() { calls.push('setTransform'); }, drawImage() { calls.push('drawImage'); },
      globalAlpha: 1, imageSmoothingEnabled: false,
    };
    (cap.replay as (c: unknown) => void)(fakeCtx);
    dustTexSetForTest(null);
    expect(calls[0]).toBe('save');
    expect(calls[calls.length - 1]).toBe('restore');
    expect(calls.filter((c) => c === 'setTransform').length).toBe(1);
  });
});

// ---- GLShimExecutor.pushQuadBatchRgba 行为锁 ----
function mkPrecipHost() {
  const layer = {
    unavailable: false, open: false, failQuadBatchRgba: false,
    rgbaCalls: [] as Array<{ key: string; quads: number; len: number }>,
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin() { this.open = true; },
    resize() { /* no-op */ },
    endAccumulate() { this.open = false; return null; },
    blendAdditive() { /* no-op */ }, blendErase() { /* no-op */ }, blendMult() { /* no-op */ },
    quadSprite() { /* no-op */ }, quadBatch() { return true; },
    texFromImage(key: string) {
      if (this.unavailable) return null;
      return { tex: {}, w: TEX_W, h: TEX_H, key, bytes: 1, mipped: false };
    },
    texAlive() { return true; },
    quadBatchRgba(e: { key: string }, data: Float32Array, quads: number) {
      if (this.failQuadBatchRgba) return false;
      this.rgbaCalls.push({ key: e.key, quads, len: data.length });
      return true;
    },
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

describe('★C5b GLShimExecutor.pushQuadBatchRgba 行为锁', () => {
  it('acc 态:rgba 批=一条 rec 原位入队,flush 走 quadBatchRgba 单发射+stats 对账', () => {
    const { layer, host } = mkPrecipHost();
    const exec = new GLShimExecutor(host as never);
    expect(exec.attachAcc()).not.toBeNull();
    expect(exec.pushQuadBatchRgba({ width: TEX_W } as unknown as CanvasImageSource, 'precip:dust',
      new Float32Array(48), 1, () => {})).toBe(true);
    exec.flush();
    expect(layer.rgbaCalls.length).toBe(1);
    expect(layer.rgbaCalls[0]).toMatchObject({ key: 'precip:dust', quads: 1, len: 48 });
    expect(exec.stats.emitBatchQuads).toBe(1);
    // 零活粒=接受但零发射
    expect(exec.pushQuadBatchRgba({} as CanvasImageSource, 'k', new Float32Array(0), 0, () => {})).toBe(true);
    exec.flush();
    expect(layer.rgbaCalls.length).toBe(1);
  });

  it('可表达性门:ga≠1/gco 非 SO/clip/非活跃窗 → false=调用方回 2D 原链', () => {
    const { host } = mkPrecipHost();
    const exec = new GLShimExecutor(host as never);
    expect(exec.pushQuadBatchRgba({} as CanvasImageSource, 'k', new Float32Array(48), 1, () => {})).toBe(false);
    expect(exec.attachAcc()).not.toBeNull();
    const q = () => exec.pushQuadBatchRgba({} as CanvasImageSource, 'k', new Float32Array(48), 1, () => {});
    const s = exec as unknown as { ga: number; gco: string; clipped: boolean };
    s.ga = 0.5;
    expect(q()).toBe(false);
    s.ga = 1; s.gco = 'lighter';
    expect(q()).toBe(false);
    s.gco = 'source-over'; s.clipped = true;
    expect(q()).toBe(false);
  });

  it('GL 发射失败 → accFail 降级+replay2D（宁回退不丢精灵;失败发射不计账）', () => {
    const { layer, host } = mkPrecipHost();
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
    layer.failQuadBatchRgba = true;
    expect(exec.pushQuadBatchRgba({ width: TEX_W } as unknown as CanvasImageSource, 'precip:dust',
      new Float32Array(48), 1, (c) => { replayed.push(c); })).toBe(true);
    exec.flush();
    expect(layer.rgbaCalls.length).toBe(0);
    expect(exec.stats.emitBatchQuads).toBe(0);
    expect(exec.stats.replays).toBe(1);
    expect(replayed.length).toBe(1);
  });
});

// ---- bakeMemoizedInto 池语义锁（92 张/s 出生定谳的回归面）----
function mkCanvas() {
  return {
    width: 0, height: 0,
    getContext: () => ({
      globalCompositeOperation: 'source-over', fillStyle: '',
      clearRect() { /* no-op */ }, drawImage() { /* no-op */ }, fillRect() { /* no-op */ },
    }),
  };
}

describe('★P0b bakeMemoizedInto 池语义（填充期出生有界+淘汰回池平衡）', () => {
  it('churn 1200 键:出生 ≤CAP+2（旧 4096 档=1200 全出生=哨兵 92 张/s 形态）,后期取池命中', () => {
    vi.stubGlobal('document', { createElement: () => mkCanvas() });
    try {
      const fx = new WeatherRenderer();
      const wr = fx as unknown as {
        bakeMemoizedInto(key: string, w: number, h: number, paint: (c: unknown) => boolean): unknown;
        bakeMemo: Map<string, unknown>;
        clonePoolStatsForTest(): { takeN: number; takeBirth: number; takePool: number; giveN: number; giveDrop: number };
      };
      const paintTrue = () => true;
      for (let i = 0; i < 1200; i++) {
        wr.bakeMemoizedInto(`k${i}`, 8, 8, paintTrue);
      }
      const s = wr.clonePoolStatsForTest();
      expect(wr.bakeMemo.size).toBeLessThanOrEqual(513);        // CAP=512 单条淘汰
      expect(s.takeBirth).toBeLessThanOrEqual(514);             // 填充期出生有界（旧档=1200）
      expect(s.takePool).toBeGreaterThan(600);                  // 淘汰回池⇄取池平衡已激活
      expect(s.giveN).toBeGreaterThan(600);                     // giveClone 补归还确实在喂
      // 二次 churn 同批键:全命中零新增
      const b0 = wr.clonePoolStatsForTest();
      for (let i = 1100; i < 1200; i++) wr.bakeMemoizedInto(`k${i}`, 8, 8, paintTrue);
      const b1 = wr.clonePoolStatsForTest();
      expect(b1.takeBirth).toBe(b0.takeBirth);
      expect(b1.takePool).toBe(b0.takePool);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('单尺寸族存量帽:giveClone 超 16 弃入池（防跨尺寸族死库存无界囤积）', () => {
    vi.stubGlobal('document', { createElement: () => mkCanvas() });
    try {
      const fx = new WeatherRenderer();
      const wr = fx as unknown as {
        giveClone(c: { width: number; height: number }): void;
        clonePool: Map<string, unknown[]>;
        clonePoolStatsForTest(): { giveN: number; giveDrop: number };
      };
      for (let i = 0; i < 20; i++) wr.giveClone({ width: 8, height: 8 });
      expect(wr.clonePool.get('8x8')!.length).toBe(16);
      const s = wr.clonePoolStatsForTest();
      expect(s.giveDrop).toBe(4);
      // 尺寸族分账:8x8 满位不影响 2x40 族
      wr.giveClone({ width: 2, height: 40 });
      expect(wr.clonePool.get('2x40')!.length).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ---- 结构锁（源码锚;防并行会话漂移） ----
describe('★C5b precip-gl 结构锁', () => {
  it('WeatherRenderer:drawPrecipDust GL 支前置+批构建+中介发射+重放闭包+旗语义扩展', () => {
    expect(WR).toContain('if (rainGl && this.tryDrawPrecipGL(r, dTex)) return;');
    expect(WR).toContain('r.emitPrecipQuadBatch(dTex, PRECIP_TEX_KEY, precipBatchData, quads, replayPrecipBatch2D)');
    expect(WR).toContain('export function buildPrecipBatch(');
    expect(WR).toContain('function replayPrecipBatch2D(');
    expect(WR).toContain('export function drawPrecipBatchCaptureForTest(');
    expect(WR).toContain('export function dustTexSetForTest(');
    // vanilla 锚:雪帧 (760,10×frame) / 沙帧 (680,60+10×frame) / 叠画 α=180
    expect(WR).toContain('const FLAKE_SX = 760;');
    expect(WR).toContain('const SAND_SX = 680, SAND_SY0 = 60;');
    expect(WR).toContain('const SAND_OVERLAY_A255 = SAND_COLOR_ALPHA;');
    // 黑光衰减（:39730）在批构建内保序
    expect(WR).toContain("if (lt[0] === 0 && lt[1] === 0 && lt[2] === 0) { f.active = false; continue; } // :39730");
    expect(WR).toContain("if (lt[0] === 0 && lt[1] === 0 && lt[2] === 0) { g.active = false; continue; } // :39730");
    // 2D 原链保留（逃生门=逐粒烘焙路径原样;P0b 直烘入池面）
    expect(WR).toContain('this.bakeMemoizedInto(');
    expect(WR).toContain('`flake|${f.frame}|${lr},${lg},${lb}`');
    expect(WR).toContain('`dust268-tint|${g.frame}|${gcr},${gcg},${gcb}`');
    // 池语义:P0b 定谳锚（CAP 512+单尺寸族帽+直烘）
    expect(WR).toContain('private static readonly BAKE_MEMO_CAP = 512;');
    expect(WR).toContain('private static readonly POOL_PER_SIZE_CAP = 16;');
    expect(WR).toContain('private bakeMemoizedInto(key: string | number, w: number, h: number,');
    expect(WR).toContain('clonePoolStatsForTest()');
    // 矩阵拼接=执行器镜像同式（fround 链锚;co=1/si=0 折叠）
    expect(WR).toContain('const e1 = frnd(frnd(ba * x0) + frnd(frnd(bc * y0) + base.e));');
  });

  it('Renderer:emitPrecipQuadBatch 中介（非活跃窗回 false;pushQuadBatchRgba 通道）', () => {
    expect(RD).toContain('emitPrecipQuadBatch(img: CanvasImageSource, key: string, data: Float32Array, quads: number,');
    expect(RD).toContain('return shim.pushQuadBatchRgba(img, key, data, quads, replay);');
  });

  it('GLSpriteLayer:sprite:precip 程序+quadBatchRgba（aCol vec4/NEAREST/STREAM/态还原）', () => {
    expect(GS).toContain("this.pipe.program('sprite:precip', PRECIP_VS, PRECIP_FS)");
    expect(GS).toContain('outColor = vec4(c.rgb * vCol.rgb, c.a * vCol.a);');
    expect(GS).toContain('gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);');
    expect(GS).toContain('quadBatchRgba(e: TexEntry, data: Float32Array, quads: number): boolean {');
    expect(GS).toContain('gl.bindSampler(0, this.samp.nearest!)');
  });

  it('GLShimExecutor:pushQuadBatchRgba+rgba 发射分支（雨条 stride7 通道零触碰）', () => {
    expect(GE).toContain('pushQuadBatchRgba(img: CanvasImageSource, key: string, data: Float32Array, quads: number,');
    expect(GE).toContain('rgba?: boolean;');
    expect(GE).toContain('? glw.quadBatchRgba(e, p.batch.data, p.batch.quads)');
    // 雨通道原样（零回归锚）
    expect(GE).toContain('this.tail!.batch = { img, key, data, quads, replay };');
    expect(GE).toContain('this.tail!.batch = { img, key, data, quads, replay, rgba: true };');
  });
});
