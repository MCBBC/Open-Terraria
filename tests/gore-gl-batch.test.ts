// ★F-gore 顶点批（?goregl=1 缺省关）结构锁+行为锁（2026-09-28;rain-gl-batch 判例同位）。
// node 可跑面：buildGoreQuadBatch 产出逐式断言（角点/uv/α 折色/段切分/门）+
// GLShimExecutor.pushGoreQuadBatch 队列行为（多段 rec 原位入队/可表达性门/tier 换档/
// region 纹理解析/降级重放）——像素对拍=scripts/_gore-gl-ab.mjs（node 无 GL,该面探针锁）。
// 【几何锁口径】两支均=shim 现行路径复刻:直绘支=decode 轴对齐分支逐式;旋转支=
// 镜像算子 fround 链+decode 旋转分支+VERT_SRC 角点式——独立复算双向锁。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';
import { buildGoreQuadBatch } from '../src/render/Renderer';
import type { GoreSegSpec } from '../src/render/glshim/GLShimExecutor';

const RD = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const GE = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');
const GL = readFileSync(join(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');

const frnd = Math.fround;
const EPS = 1 / 4096;

interface Piece {
  goreId: number; x: number; y: number; rotation: number; scale: number;
  alpha: number; additive: boolean; row: number; frameRows: number; dead: boolean;
}
const mkPiece = (over: Partial<Piece>): Piece => ({
  goreId: 0, x: 100, y: 200, rotation: 0, scale: 1, alpha: 0,
  additive: false, row: 0, frameRows: 1, dead: false, ...over,
});
/** 32×32 单帧图源桩（goreId→img 身份稳定） */
const SHEETS = new Map<number, { width: number; height: number }>();
const mkGetTex = () => (goreId: number, rows: number) => {
  let img = SHEETS.get(goreId);
  if (!img) { img = { width: 32, height: 32 * rows }; SHEETS.set(goreId, img); }
  return { img: img as unknown as (CanvasImageSource & { width: number; height: number }),
    sw: img.width, sh: Math.floor(img.height / rows) };
};
const CULL = { x0: -1000, x1: 5000, y0: -1000, y1: 5000 };
/** 数组→CTM 对象（buildGoreQuadBatch 入参形） */
const B = (arr: readonly number[]) => ({ a: arr[0], b: arr[1], c: arr[2], d: arr[3], e: arr[4], f: arr[5] });

/** 镜像算子同式独立复算（GLShimExecutor translate/rotate/scale 逐式 fround 链）——
 *  旋转支角点期望（decode 旋转分支+VERT_SRC 角点式 CPU 复算） */
function expectRotCorners(base: readonly number[], cx: number, cy: number, rot: number,
  s: number, sw: number, sh: number) {
  const [ba, bb, bc, bd, be, bf] = base;
  const e1 = frnd(frnd(ba * cx) + frnd(frnd(bc * cy) + be));
  const f1 = frnd(frnd(bb * cx) + frnd(frnd(bd * cy) + bf));
  const co = frnd(Math.cos(rot)), si = frnd(Math.sin(rot));
  let a = frnd(frnd(ba * co) + frnd(bc * si));
  let b = frnd(frnd(bb * co) + frnd(bd * si));
  let c = frnd(frnd(bc * co) - frnd(ba * si));
  let d = frnd(frnd(bd * co) - frnd(bb * si));
  if (s !== 1) { a = frnd(a * s); b = frnd(b * s); c = frnd(c * s); d = frnd(d * s); }
  const lu = Math.hypot(a, b), lv = Math.hypot(c, d);
  const hw = sw / 2, hh = sh / 2;
  const cxA = frnd(frnd(a * -hw) + frnd(c * -hh)) + e1;
  const cyA = frnd(frnd(b * -hw) + frnd(d * -hh)) + f1;
  const cxC = frnd(frnd(a * hw) + frnd(c * hh)) + e1;
  const cyC = frnd(frnd(b * hw) + frnd(d * hh)) + f1;
  const dx = frnd((cxA + cxC) / 2) - sw * lu / 2;
  const dy = frnd((cyA + cyC) / 2) - sh * lv / 2;
  const dw = sw * lu, dh = sh * lv;
  const rr = Math.atan2(b, a);
  const cc = Math.cos(rr), cs = Math.sin(rr);
  const hx = dw / 2, hy = dh / 2;
  const mx = dx + hx, my = dy + hy;
  return [
    [mx + cc * -hx - cs * -hy, my + cs * -hx + cc * -hy],
    [mx + cc * hx - cs * -hy, my + cs * hx + cc * -hy],
    [mx + cc * hx - cs * hy, my + cs * hx + cc * hy],
    [mx + cc * -hx - cs * hy, my + cs * -hx + cc * hy],
  ] as const;
}

/** 读段内第 qi 个 quad 的 6 顶点（x,y,u,v,r,g,b,a） */
function quadVerts(seg: { data: Float32Array }, qi: number): number[][] {
  const out: number[][] = [];
  for (let v = 0; v < 6; v++) {
    const o = qi * 48 + v * 8;
    out.push(seg.data.slice(o, o + 8) as unknown as number[]);
  }
  return out;
}

describe('★F-gore buildGoreQuadBatch 产出锁', () => {
  it('直绘支:单位基阵角点=translate+scale 直构;uv 全跨度−ε;α 折 rgba 四通道', () => {
    const base = [1, 0, 0, 1, 0, 0];
    const segs = buildGoreQuadBatch(B(base), [mkPiece({ x: 100, y: 200 })], CULL, mkGetTex());
    expect(segs).not.toBe(-1);
    const arr = segs as GoreSegSpec[];
    expect(arr.length).toBe(1);
    expect(arr[0].quads).toBe(1);
    expect(arr[0].tier).toBe(0);
    const v = quadVerts(arr[0], 0);
    expect(v[0][0]).toBe(100); expect(v[0][1]).toBe(200);
    expect(v[1][0]).toBe(132); expect(v[1][1]).toBe(200);
    expect(v[2][0]).toBe(132); expect(v[2][1]).toBe(232);
    expect(v[5][0]).toBe(100); expect(v[5][1]).toBe(232);
    // uv 全跨度−ε（region 语义:ua=(0−ε)/sw）
    expect(v[0][2]).toBeCloseTo(-EPS / 32, 9);
    expect(v[1][2]).toBeCloseTo((32 - EPS) / 32, 9);
    expect(v[2][3]).toBeCloseTo((32 - EPS) / 32, 9);
    // α 折四通道（alpha=0 → ga=1）
    for (const comp of v) expect(comp[4]).toBe(1);
    // 三角二 (p0,p2,p3)
    expect(v[3][0]).toBe(v[0][0]); expect(v[3][1]).toBe(v[0][1]);
    expect(v[4][0]).toBe(v[2][0]); expect(v[4][1]).toBe(v[2][1]);
  });

  it('旋转+缩放支:角点与镜像算子 fround 链独立复算逐位相等;ga=(255−alpha)/255 折色', () => {
    const z = 1.25, ox = 320.5, oy = 180.25;
    const base = [z, 0, 0, z, ox, oy];
    const segs = buildGoreQuadBatch(B(base),
      [mkPiece({ x: 555.5, y: 777.25, rotation: 0.42, scale: 1.08, alpha: 100 })], CULL, mkGetTex()) as GoreSegSpec[];
    const exp = expectRotCorners(base, 555.5 + (32 * 1.08) / 2, 777.25 + (32 * 1.08) / 2, 0.42, 1.08, 32, 32);
    const q = quadVerts(segs[0], 0);
    // 批数据=f32 存储面（Float32Array 舍入;GPU 上传域同口径）——断言侧同 fround
    expect(q[0][0]).toBe(frnd(exp[0][0])); expect(q[0][1]).toBe(frnd(exp[0][1]));
    expect(q[1][0]).toBe(frnd(exp[1][0])); expect(q[1][1]).toBe(frnd(exp[1][1]));
    expect(q[2][0]).toBe(frnd(exp[2][0])); expect(q[2][1]).toBe(frnd(exp[2][1]));
    expect(q[5][0]).toBe(frnd(exp[3][0])); expect(q[5][1]).toBe(frnd(exp[3][1]));
    const ga = (255 - 100) / 255;
    for (const comp of q) { expect(comp[4]).toBeCloseTo(ga, 7); expect(comp[7]).toBeCloseTo(ga, 7); }
  });

  it('段切分:连续同 goreId 同行=1 段;换行/换贴图/换档断段;段序=绘制序（C1 同相）', () => {
    const base = B([1, 0, 0, 1, 0, 0]);
    // 3 件同 goreId 同行 → 1 段 3 quads
    let segs = buildGoreQuadBatch(base,
      [mkPiece({ x: 1 }), mkPiece({ x: 40 }), mkPiece({ x: 80 })], CULL, mkGetTex()) as GoreSegSpec[];
    expect(segs.length).toBe(1); expect(segs[0].quads).toBe(3);
    // 行变（1217 三帧族 row 0→1）→ 2 段（行切片=不同纹理条目）
    segs = buildGoreQuadBatch(base,
      [mkPiece({ goreId: 1217, frameRows: 3, row: 0 }), mkPiece({ goreId: 1217, frameRows: 3, row: 1 })],
      CULL, mkGetTex()) as GoreSegSpec[];
    expect(segs.length).toBe(2);
    expect(segs[0].region.sy).toBe(0);
    expect(segs[1].region.sy).toBe(segs[0].region.sh);
    // ADD 火苗（16）交错 SO 块 → 3 段,段序=绘制序,tier 随件
    segs = buildGoreQuadBatch(base,
      [mkPiece({ goreId: 5 }), mkPiece({ goreId: 16, additive: true, alpha: 100 }),
        mkPiece({ goreId: 5, x: 40 })], CULL, mkGetTex()) as GoreSegSpec[];
    expect(segs.length).toBe(3);
    expect(segs[0].tier).toBe(0);
    expect(segs[1].tier).toBe(1);
    expect(segs[2].tier).toBe(0);
    expect(segs[0].key).not.toBe(segs[1].key);
  });

  it('门:dead/视区外剔除;贴图缺失/零尺寸跳过;斜切 CTM=-1 整帧回 2D;段 key=er: 同族幂等键', () => {
    const base = B([1, 0, 0, 1, 0, 0]);
    let segs = buildGoreQuadBatch(base,
      [mkPiece({ dead: true }), mkPiece({ x: -2000 }), mkPiece({ x: 100 })], CULL, mkGetTex()) as GoreSegSpec[];
    expect(segs.length).toBe(1); expect(segs[0].quads).toBe(1);
    // 贴图缺失（getTex null）跳过
    segs = buildGoreQuadBatch(base, [mkPiece({ x: 100 })],
      CULL, () => null) as GoreSegSpec[];
    expect(segs.length).toBe(0);
    // 斜切 CTM=decode 不可表达（b≠0）→ -1（独立常量承接,segs 保持数组型）
    const sheared = buildGoreQuadBatch(B([1, 0.2, 0, 1, 0, 0]), [mkPiece({ x: 100 })], CULL, mkGetTex()) as unknown as -1;
    expect(sheared).toBe(-1);
    // 段 key 与 resolveTex er: 键同格式（0,sy,sw,sh region;静态源 epoch=0）
    segs = buildGoreQuadBatch(base, [mkPiece({ x: 100 })], CULL, mkGetTex()) as GoreSegSpec[];
    expect(segs[0].key).toMatch(/^er:\d+:0:0,0,32,32$/);
    expect(segs[0].region).toEqual({ sx: 0, sy: 0, sw: 32, sh: 32 });
  });

  it('重放面同构:角点槽位 [p0x,p0y,p1x,p1y,p3x,p3y,alpha];闭包可调用（save/restore 平衡）', () => {
    const base = B([1, 0, 0, 1, 0, 0]);
    const segs = buildGoreQuadBatch(base,
      [mkPiece({ x: 10, y: 20, rotation: 0.3, alpha: 60 })], CULL, mkGetTex()) as GoreSegSpec[];
    expect(segs.length).toBe(1);
    const calls: string[] = [];
    const fakeCtx = {
      save() { calls.push('save'); }, restore() { calls.push('restore'); },
      setTransform() { calls.push('setTransform'); }, drawImage() { calls.push('drawImage'); },
      globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true,
    };
    segs![0].replay(fakeCtx as unknown as CanvasRenderingContext2D);
    expect(calls[0]).toBe('save');
    expect(calls[calls.length - 1]).toBe('restore');
    expect(calls.filter((c) => c === 'drawImage').length).toBe(1);
  });
});

// ---- GLShimExecutor.pushGoreQuadBatch 行为锁 ----
interface LayerRec { key: string; quads: number; ok: boolean }
function mkGoreHost() {
  const layers = {
    unavailable: false, open: false, failQuadBatch: false,
    blendLog: [] as string[],
    batchCalls: [] as LayerRec[],
    spriteCalls: [] as Array<{ key: string; tint: readonly [number, number, number] | null }>,
    entries: new Map<string, { key: string }>(),
    regionCalls: 0, imageCalls: 0,
    isAccumOpen(name: string) { return name === 'world' && this.open; },
    begin() { this.open = true; },
    resize() { /* no-op */ },
    endAccumulate() { this.open = false; return null; },
    blendAdditive(on: boolean) { this.blendLog.push(on ? 'add+' : 'add-'); },
    blendErase() { /* no-op */ }, blendMult() { /* no-op */ },
    quadSprite(e: { key: string }, _sx: number, _sy: number, _sw: number, _sh: number,
      _dx: number, _dy: number, _dw: number, _dh: number,
      o?: { tint?: readonly [number, number, number] | null }) {
      this.spriteCalls.push({ key: e.key, tint: o?.tint ?? null });
    },
    quadBatch() { return true; },
    quadBatchRgba(e: { key: string }, _data: Float32Array, quads: number) {
      const ok = !this.failQuadBatch;
      this.batchCalls.push({ key: e.key, quads, ok });
      return ok;
    },
    texFromImage(key: string) { this.imageCalls++; return this.entry(key); },
    texFromRegion(key: string) { this.regionCalls++; return this.entry(key); },
    entry(key: string) {
      let e = this.entries.get(key);
      if (!e) { e = { key }; this.entries.set(key, e); }
      return e;
    },
    texFromData() { return null; }, texRefresh() { return null; },
    texAlive() { return true; },
    end() { /* no-op */ },
  };
  return {
    layers,
    host: {
      acquireGl: () => (layers.unavailable ? null : layers),
      worldCtx: () => null,
      worldW: () => 128, worldH: () => 72,
    },
  };
}
const mkSeg = (over: Partial<Record<string, unknown>> = {}): unknown => ({
  img: { width: 32, height: 32 },
  key: 'er:1:0:0,0,32,32',
  region: { sx: 0, sy: 0, sw: 32, sh: 32 },
  data: new Float32Array(48),
  quads: 1,
  tier: 0,
  replay: () => { /* no-op */ },
  ...over,
});

describe('★F-gore GLShimExecutor.pushGoreQuadBatch 行为锁', () => {
  it('acc 态:段序=rec 序原位入队;flush 逐段 texFromRegion+quadBatchRgba;段间 tier 换档', () => {
    const { layers, host } = mkGoreHost();
    const exec = new GLShimExecutor(host as never);
    expect(exec.attachAcc()).not.toBeNull();
    expect(exec.pushGoreQuadBatch([
      mkSeg({ key: 'er:1:0:0,0,32,32' }) as never,
      mkSeg({ key: 'er:2:0:0,32,32,32', region: { sx: 0, sy: 32, sw: 32, sh: 32 }, tier: 1 }) as never,
    ])).toBe(true);
    exec.flush();
    expect(layers.batchCalls.length).toBe(2);
    expect(layers.batchCalls[0].key).toBe('er:1:0:0,0,32,32');
    expect(layers.batchCalls[1].key).toBe('er:2:0:0,32,32,32');
    expect(layers.regionCalls).toBe(2);          // 段=region 纹理口（texFromImage 零触碰）
    expect(layers.imageCalls).toBe(0);
    expect(layers.blendLog.join('')).toContain('add+');   // ADD 段换档在位
    expect(exec.stats.emitBatchQuads).toBe(2);
    expect(exec.stats.emitADD).toBe(1);          // ADD 段 rec.tier 计账
  });

  it('可表达性门:clip/filter → false=调用方回 2D 原链;ga/gco 不设门（逐件自设态,入口态无关）;零段=真值零入队;非活跃窗 false', () => {
    const { host } = mkGoreHost();
    const exec = new GLShimExecutor(host as never);
    expect(exec.attachAcc()).not.toBeNull();
    const q = () => exec.pushGoreQuadBatch([mkSeg() as never]);
    const s = exec as unknown as { ga: number; gco: string; clipped: boolean; filterV: string };
    // ★ga/gco 不设门:2D 链逐件【自设】globalAlpha/gco（drawGorePiece）,入口态既
    //  不进 2D 输出也不进批输出（段 tier/α 全编码在 rec/顶点色）——Boss 战 gore
    //  前常有加性特效留 'lighter' 镜像态,伪门会在目标场景整帧静默回退
    s.ga = 0.5; s.gco = 'lighter'; expect(q()).toBe(true);
    s.gco = 'source-over'; s.ga = 1;
    s.clipped = true; expect(q()).toBe(false);   // clip=批不表达 → 回 2D
    s.clipped = false; s.filterV = 'brightness(2)'; expect(q()).toBe(false);
    s.filterV = 'none';
    expect(exec.pushGoreQuadBatch([])).toBe(true);
    const { host: h2 } = mkGoreHost();
    const exec2 = new GLShimExecutor(h2 as never);
    expect(exec2.pushGoreQuadBatch([mkSeg() as never])).toBe(false);
  });

  it('降级重放:段 rec 经 replay 闭包 2D 直画（宁回退不丢精灵）;发射失败段不计账不进 FBO=全队列重放', () => {
    const { layers, host } = mkGoreHost();
    (host as unknown as { degradeAcc: () => boolean }).degradeAcc = () => true;
    const exec = new GLShimExecutor(host as never);
    expect(exec.attachAcc()).not.toBeNull();
    const replayed: number[] = [];
    const fake = {
      setTransform() { /* no-op */ }, globalAlpha: 1, globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: false, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      filter: 'none', font: '10px sans-serif', textAlign: 'left',
      lineCap: 'butt', lineJoin: 'miter', miterLimit: 10,
      save() { /* no-op */ }, restore() { /* no-op */ }, drawImage() { /* no-op */ },
    };
    (exec as unknown as { bridge: (c: unknown) => void }).bridge(fake);
    layers.failQuadBatch = true;
    expect(exec.pushGoreQuadBatch([
      mkSeg({ replay: () => { replayed.push(0); } }) as never,
      mkSeg({ key: 'er:2:0:0,0,32,32', replay: () => { replayed.push(1); } }) as never,
    ])).toBe(true);
    exec.flush();
    // 段 0 发射失败（FBO 零半成品）→ accFail 降级 → 全队列 2D 重放=两段精灵都不丢
    expect(replayed).toEqual([0, 1]);
    expect(exec.stats.replays).toBe(2);
    expect(exec.stats.emitBatchQuads).toBe(0);   // 失败发射不计账（雨批判例同源）
  });
});

// ---- 结构锁（源码锚;防并行会话漂移） ----
describe('★F-gore 结构锁', () => {
  it('Renderer:goregl 旗转正缺省开（?goregl=0 逃生门;2026-09-29 用户拍板）+GL 支前置+批构建+中介发射+2D 原链保留', () => {
    expect(RD).toContain("new URLSearchParams(location.search).get('goregl') !== '0'");
    expect(RD).toContain('static get goreGl() { return this._goreGl; }');
    expect(RD).toContain('if (Renderer.goreGl && this.tryDrawGoreGL(pieces, x0, x1, y0, y1)) {');
    expect(RD).toContain('export function buildGoreQuadBatch(');
    expect(RD).toContain('emitGoreQuadBatch(segs: GoreSegSpec[]): boolean');
    expect(RD).toContain('return shim.pushGoreQuadBatch(segs);');
    // 2D 原链保留（逃生门=逐件 drawImage 路径原样）
    expect(RD).toContain('ctx.globalCompositeOperation = p.additive ? \'lighter\' : \'source-over\';');
    expect(RD).toContain('ctx.globalAlpha = Math.max(0, (255 - p.alpha) / 255);');
    // 几何 census 锚:fround 链+decode guard 同门
    expect(RD).toContain('const grnd = Math.fround;');
    expect(RD).toContain('if (Math.abs(dot) > 1e-4 * lu * lv) return -1;');
    expect(RD).toContain('const GORE_STRIDE = 8;');
    expect(RD).toContain('const GORE_MAX_QUADS = 600;');
  });

  it('GLShimExecutor:段 rec 池卫生+region 发射分支+重放分支', () => {
    expect(GE).toContain('pushGoreQuadBatch(segs: readonly GoreSegSpec[]): boolean');
    expect(GE).toContain("if (this.ga !== 1 || this.gco !== 'source-over') return false;");
    expect(GE).toContain('replay: s.replay, rgba: true, region: s.region };');
    expect(GE).toContain('? glw.texFromRegion(p.batch.key, p.batch.img as TexImageSource, rg.sx, rg.sy, rg.sw, rg.sh)');
    expect(GE).toContain('if (p.batch) { p.batch.replay(raw); this.stats.replays++; continue; }');
  });

  it('GLSpriteLayer:零改动锁（gore 复用 quadBatchRgba 通道,禁新着色器漂移）', () => {
    expect(GL).toContain('outColor = vec4(c.rgb * vCol.rgb, c.a * vCol.a);   // 预乘纹理×顶点色×quad α');
    expect(GL).toContain('quadBatchRgba(e: TexEntry, data: Float32Array, quads: number): boolean');
    expect(GL).not.toContain('gore');
  });
});
