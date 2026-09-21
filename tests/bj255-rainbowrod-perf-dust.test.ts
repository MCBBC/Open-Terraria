// BJ255 彩虹魔杖（弹 79）实报定谳闸门（2026-09-21 用户实报：拖尾/尘观感差 + 长按连发严重卡顿）：
//  ① 尘/音死码摘除锁——1457/1458 的 type==79 disco 尘块（Dust 66,1457 :44389-44407）
//    位于 AI_009_MagicMissiles_Old（:44231 起）体内,而 Old 全文件唯一调用点 =
//    `if (type == 491)`（:44000）→ 79 飞行期【无尘无音】（旧刀 R27 §12 跨函数误归属
//    翻案）。ProjLight :16600 的 disco 光=原版在位,保留。
//  ② P2 采样器位等价——wrapSampler 内联四角双线性 vs SM2Effect.sampleImageInto
//    逐位一致（f255 预除表=整数÷255 的 f64 商恒等）。
//  ③ P1 逐格段表逐像素等价——drawStripTrail（cell-list 最近段）vs 参考机（旧全局
//    搜索+sampleImageInto+execPixel 链）随机带 byte 级全等（含自交折叠带）。
//  ④ GL 顶带构造——buildStripVertsMM：9 floats/顶点、6 索引/quad（MM 族原版
//    includeBacksides=false,FinalFractalHelper.cs:188 才 true）、顶点色不折 opacity、
//    progress=i/(pairs−1)。
//  ⑤ GL 决策面——node 注入 fake Image/glfx：MM 族走 trailFrameBeginMM/trailStripMM
//    （uOpacity=C[0]、uScroll=C[4]=uSaturation×uTime）、escape 走 CPU。
import { describe, it, expect, beforeAll } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { MagicMissileProj } from '../src/entities/MissileProj';
import { drawStripTrail, buildStripVertsMM, __wrapSampleForTest,
  __resetTrailShaderForTest, EXTRA_SETS } from '../src/fx/TrailShader';
import { getPass, sampleImageInto, defaultUniforms } from '../src/fx/SM2Effect';
import type { GameHooks } from '../src/entities/types';
import type { TrailPt, TrailSpec } from '../src/fx/TrailShader';

function emptyWorld(): World {
  const w = new World(400, 400, 30, 'open');
  for (let x = 0; x < 400; x++) w.store.setTileSilent(x, 380, 1, 0, 0);
  return w;
}
function makeGame(w: World): GameHooks {
  return {
    world: w,
    player: { dead: true, iframes: 0, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 10, h: 20 },
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (_e: unknown) => {}, projectiles: [] as unknown[] },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
  } as unknown as GameHooks;
}
function mk79(game: GameHooks): MagicMissileProj {
  return new MagicMissileProj(80 * TILE, 100 * TILE, 4, 0, {
    projId: 79, damage: 50, knockback: 4, useTime: 20,
    channelCb: () => true,
    aimCb: () => ({ x: 80 * TILE + 6000, y: 100 * TILE }),
    payMana: () => true,
  }) as MagicMissileProj;
}

// ===================== ① 尘/音死码摘除锁 =====================
describe('BJ255 ①79 飞行期无尘无音（AI_009_Old 死码翻案,1457 :44231/:44000）', () => {
  function fxRecorders() {
    const dust: unknown[] = [], sfx: unknown[] = [], particles: unknown[] = [];
    return { dust, sfx, particles };
  }
  function runFx(pid: number, vx: number, pvx: number, rand = Math.random) {
    const w = emptyWorld();
    const game = makeGame(w);
    const rec = fxRecorders();
    (game as unknown as { spawnDust: unknown }).spawnDust = (...a: unknown[]) => { rec.dust.push(a); return null; };
    (game as unknown as { playSfxFiles: unknown }).playSfxFiles = (...a: unknown[]) => { rec.sfx.push(a); };
    (game as unknown as { spawnParticles: unknown }).spawnParticles = (...a: unknown[]) => { rec.particles.push(a); };
    const m = new MagicMissileProj(80 * TILE, 100 * TILE, vx, 0, {
      projId: pid, damage: 50, knockback: 4, useTime: 20,
      channelCb: () => true,
      aimCb: () => ({ x: 80 * TILE + 6000, y: 100 * TILE }),
      payMana: () => true,
    }) as unknown as { fxStep(g: GameHooks): void; pvx: number; pvy: number };
    m.pvx = pvx; m.pvy = 0;                     // 急转面：pv·v 归一 <0.2
    const oldRandom = Math.random;
    Math.random = rand;
    try { m.fxStep(game); m.fxStep(game); m.fxStep(game); } finally { Math.random = oldRandom; }
    return rec;
  }

  it('79：spawnDust/playSfxFiles/急转 spawnParticles 全零（3 拍含急转态）', () => {
    const rec = runFx(79, 8, -8);               // v=+x、pv=−x → dot=−1<0.2（急转必触发面）
    expect(rec.dust).toHaveLength(0);           // 旧刀每拍 1×d66 disco 尘——已摘
    expect(rec.sfx).toHaveLength(0);            // 旧刀 Item9 十拍循环音——已摘
    expect(rec.particles).toHaveLength(0);      // 旧刀 flag3 急转 '#FFD0FF' 尘——已摘
  });
  it('79：disco 光保留（ProjLight :16600 原版在位）——lightRGB 非空且随 disco 推进', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const m = mk79(game) as unknown as { fxStep(g: GameHooks): void; lightRGB?: number[]; discoR: number; discoG: number; discoB: number };
    m.fxStep(game);
    expect(m.lightRGB).toBeTruthy();
    expect(m.lightRGB!.length).toBe(3);
    expect(m.lightRGB![0]).toBeCloseTo(m.discoR / 255 * 0.8, 9);
    expect(m.lightRGB![1]).toBeCloseTo(m.discoG / 255 * 0.8, 9);
    expect(m.lightRGB![2]).toBeCloseTo(m.discoB / 255 * 0.8, 9);
  });
  it('16 对照组不误伤：尘（1/9 门,rand=0 必中）+急转尘仍在（:44122-44135）', () => {
    const rec = runFx(16, 8, -8, () => 0);
    expect(rec.particles.length).toBeGreaterThanOrEqual(2);   // 1/9 漂尘×3 拍 + 急转尘
  });
  it('34 对照组不误伤：急转尘仍在（:44210-44224 flag3 段）', () => {
    const rec = runFx(34, 8, -8, () => 0.99);   // 高 rand 压掉概率尘,急转尘必留
    expect(rec.particles.length).toBeGreaterThanOrEqual(1);
  });
});

// ===================== ② P2 采样器位等价 =====================
describe('BJ255 ②wrapSampler 内联双线性 vs sampleImageInto 位等价', () => {
  it('7×5 非平凡图 × 负/超界/半像素坐标格：4 通道 Object.is 全等', () => {
    const w = 7, h = 5;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = (i * 37) % 256;
      data[i * 4 + 1] = (i * 91 + 13) % 256;
      data[i * 4 + 2] = (i * 55 + 200) % 256;
      data[i * 4 + 3] = (i * 211 + 7) % 256;
    }
    const im = { data, w, h };
    const a = new Float64Array(4), b = new Float64Array(4);
    const us = [0, 0.13, 0.5, 0.999, 1.0, 1.37, -0.21, -3.7, 12.05];
    const vs = [0, 0.29, 0.5, 0.999, 1.0, -0.08, 4.44];
    for (const u of us) for (const v of vs) {
      __wrapSampleForTest(im, u, v, a);
      sampleImageInto(data, w, h, u, v, true, b);
      for (let k = 0; k < 4; k++) {
        expect(Object.is(a[k], b[k])).toBe(true);
      }
    }
  });
});

// ===================== ③ P1 逐格段表逐像素等价（参考机差分） =====================
// fake DOM（同 trail-shader.test.ts 家族）
interface FakeBuf { data: Uint8ClampedArray; width: number; height: number }
interface FakeCanvas { width: number; height: number; _ctx: FakeCtx2d; getContext(k: string): FakeCtx2d | null }
class FakeCtx2d {
  buf: FakeBuf | null = null;
  gco = '';
  createImageData(w: number, h: number): FakeBuf { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData(im: FakeBuf): void { this.buf = im; }
  getImageData(_x: number, _y: number, w: number, h: number): FakeBuf {
    if (this.buf && this.buf.width === w) return this.buf;
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  drawImage(src: FakeCanvas, ..._rest: unknown[]): void {
    if ((src as FakeCanvas)._ctx?.buf) this.buf = (src as FakeCanvas)._ctx.buf;
  }
  save(): void {}
  restore(): void {}
  get globalCompositeOperation(): string { return this.gco; }
  set globalCompositeOperation(v: string) { this.gco = v; }
}
function installFakeDom(): void {
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string): FakeCanvas {
      const cv: FakeCanvas = { width: 0, height: 0, _ctx: null as never, getContext(k: string) {
        if (k !== '2d') return null;
        if (!cv._ctx) cv._ctx = new FakeCtx2d();
        return cv._ctx;
      } };
      return cv;
    },
  };
}
function mkImg(v: number): FakeCanvas {
  const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
  const cv = dom.document.createElement('canvas');
  cv.width = 2; cv.height = 2;
  const cx2 = cv.getContext('2d')!;
  const im = cx2.createImageData(2, 2);
  for (let i = 0; i < 4; i++) {
    im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
  }
  cx2.putImageData(im);
  return cv;
}
function fakeAtlas(): never {
  const cache = new Map<string, FakeCanvas>();
  return {
    ensureVImage: (path: string) => {
      if (!path) return null;
      const v = path.includes('Extra_197') ? 255 : 200;
      if (!cache.has(path)) cache.set(path, mkImg(v));
      return cache.get(path)!;
    },
  } as never;
}

/** 参考机：旧 drawStripTrail CPU 光栅（全局最近段搜索 + sampleImageInto + execPixel）。
 *  与 TrailShader 当前实现逐字节差分——P1/P2 任一处引入像素差异即爆红。 */
function referenceRaster(spec: TrailSpec): FakeBuf {
  const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
  const set = EXTRA_SETS[spec.set] ?? EXTRA_SETS.MagicMissile;
  const atlas = fakeAtlas() as unknown as { ensureVImage(p: string): FakeCanvas };
  const extract = (path: string): { data: Uint8ClampedArray; w: number; h: number } | null => {
    if (!path) return null;
    const img = atlas.ensureVImage(path);
    if (!img || !(img.width > 0)) return null;
    const cv = dom.document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    if (!cx) return null;
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, img.width, img.height);
    return { data: d.data, w: img.width, h: img.height };
  };
  const s0im = extract(set.imgs[0])!;
  const s1im = extract(set.imgs[1])!;
  const s2im = extract(set.imgs[2] as string)!;
  const pts = spec.pts.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
  const n = pts.length;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, maxHw = 4;
  for (const q of pts) {
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    maxHw = Math.max(maxHw, q.hw);
  }
  const pad = Math.ceil(maxHw + 3);
  const bx = Math.floor(x0 - pad), by = Math.floor(y0 - pad);
  const bw = Math.ceil(x1 - x0) + pad * 2, bh = Math.ceil(y1 - y0) + pad * 2;
  const rs = bw * bh > 150000 ? 0.5 : 1;
  const rw = Math.max(1, Math.round(bw * rs)), rh = Math.max(1, Math.round(bh * rs));
  const frame = { data: new Uint8ClampedArray(rw * rh * 4), width: rw, height: rh };
  const fd = frame.data;
  const csz = Math.max(6, Math.ceil(maxHw * rs));
  const gw = Math.ceil(rw / csz), gh = Math.ceil(rh / csz);
  const cover = new Uint8Array(gw * gh);
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b2 = pts[i + 1];
    const hw2 = Math.max(a.hw, b2.hw) + 1;
    const gx0 = Math.max(0, Math.floor((Math.min(a.x, b2.x) - hw2 - bx) * rs / csz));
    const gy0 = Math.max(0, Math.floor((Math.min(a.y, b2.y) - hw2 - by) * rs / csz));
    const gx1 = Math.min(gw - 1, Math.floor((Math.max(a.x, b2.x) + hw2 - bx) * rs / csz));
    const gy1 = Math.min(gh - 1, Math.floor((Math.max(a.y, b2.y) + hw2 - by) * rs / csz));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) cover[gy * gw + gx] = 1;
  }
  const pass = getPass('MagicMissile')!;
  const u = defaultUniforms();
  u.uOpacity = spec.opacity;
  u.uSaturation = -2.8;
  u.uTime = spec.time;
  const c = pass.setupConstants(u);
  const regs = new Float64Array(128), tex = new Float64Array(32), v0 = new Float64Array(8), o = new Float64Array(4);
  const wrapRef = (im: { data: Uint8ClampedArray; w: number; h: number }) =>
    (uu: number, vv: number, out: Float64Array): void => { sampleImageInto(im.data, im.w, im.h, uu, vv, true, out); };
  const smp = [wrapRef(s0im!), wrapRef(s1im!), wrapRef(s2im!), undefined];
  for (let pyi = 0; pyi < rh; pyi++) {
    const wy = by + (pyi + 0.5) / rs;
    const grow = Math.floor(pyi / csz);
    let rowHasCover = false;
    if (grow >= 0 && grow < gh) {
      for (let gx = 0; gx < gw; gx++) if (cover[grow * gw + gx]) { rowHasCover = true; break; }
    }
    if (!rowHasCover) continue;
    for (let pxi = 0; pxi < rw; pxi++) {
      if (!cover[Math.floor(pyi / csz) * gw + Math.floor(pxi / csz)]) continue;
      const wx = bx + (pxi + 0.5) / rs;
      let bestD2 = Infinity, bestSeg = -1, bestV = 0, bestU = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = pts[i], b2 = pts[i + 1];
        const ex = b2.x - a.x, ey = b2.y - a.y;
        const len2 = ex * ex + ey * ey;
        const tt = len2 > 1e-6 ? Math.max(0, Math.min(1, ((wx - a.x) * ex + (wy - a.y) * ey) / len2)) : 0;
        const qx = a.x + ex * tt, qy = a.y + ey * tt;
        const ddx = wx - qx, ddy = wy - qy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < bestD2) { bestD2 = d2; bestSeg = i; bestV = (i + tt) / (n - 1); bestU = d2 > 1e-6 ? Math.sign(ddx * -ey + ddy * ex) * Math.sqrt(d2) : 0; }
      }
      if (bestSeg < 0) continue;
      const a = pts[bestSeg], b2 = pts[bestSeg + 1];
      const hw = a.hw + (b2.hw - a.hw) * bestV;
      if (Math.abs(bestU) > hw) continue;
      const uN = bestU / hw * 0.5 + 0.5;
      const cr = a.r + (b2.r - a.r) * bestV;
      const cg = a.g + (b2.g - a.g) * bestV;
      const cb = a.b + (b2.b - a.b) * bestV;
      const ca = a.a + (b2.a - a.a) * bestV;
      if (ca <= 0.004) continue;
      const off = (pyi * rw + pxi) * 4;
      const pairs = spec.expectedPairs ?? n;
      const p = pairs > 1 ? Math.min(1, bestV * (n - 1) / (pairs - 1)) : 0;
      const d = hw * 2;
      tex[2] = d; tex[3] = 0;
      v0[0] = cr; v0[1] = cg; v0[2] = cb; v0[3] = ca;
      const res = pass.execPixel(c, regs, tex, v0, o, p, uN * d, smp);
      if (res && Math.max(res[0], res[1], res[2]) > 0.004) {
        fd[off] = res[0] * 255;
        fd[off + 1] = res[1] * 255;
        fd[off + 2] = res[2] * 255;
        fd[off + 3] = 255;
      }
    }
  }
  return frame;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
type Pt = TrailPt;
function stripCases(): Pt[][] {
  const rng = lcg(0xB255);
  const cases: Pt[][] = [];
  // a) 直带（零折叠）
  cases.push(Array.from({ length: 12 }, (_, i) => ({
    x: 20 + i * 9, y: 40, hw: 6 + 2 * (i / 11), r: 0.3 + 0.7 * (i / 11), g: 0.5, b: 0.8, a: 1,
  })));
  // b) L 折（一次急转+宽度渐变）
  cases.push([
    { x: 30, y: 10, hw: 12, r: 0.9, g: 0.2, b: 0.4, a: 1 },
    { x: 30, y: 30, hw: 10, r: 0.7, g: 0.4, b: 0.6, a: 1 },
    { x: 30, y: 50, hw: 8, r: 0.5, g: 0.6, b: 0.8, a: 1 },
    { x: 50, y: 60, hw: 6, r: 0.3, g: 0.8, b: 0.9, a: 1 },
    { x: 80, y: 60, hw: 4, r: 0.1, g: 0.9, b: 1.0, a: 1 },
  ]);
  // c) U 形自交折叠（P1 最险面：两支胶囊近邻叠带）
  cases.push([
    { x: 60, y: 10, hw: 9, r: 1, g: 0, b: 0, a: 1 },
    { x: 20, y: 18, hw: 9, r: 1, g: 0.5, b: 0, a: 1 },
    { x: 18, y: 40, hw: 9, r: 0, g: 1, b: 0.2, a: 1 },
    { x: 40, y: 52, hw: 9, r: 0, g: 0.8, b: 1, a: 1 },
    { x: 64, y: 44, hw: 9, r: 0.2, g: 0.2, b: 1, a: 1 },
    { x: 70, y: 22, hw: 9, r: 0.8, g: 0, b: 1, a: 1 },
  ]);
  // d) 随机密带 40 点（hw/色全随机）
  cases.push(Array.from({ length: 40 }, (_, i) => ({
    x: 10 + i * 4 + rng() * 3, y: 30 + Math.sin(i * 0.7) * 18 + rng() * 4,
    hw: 2 + rng() * 10, r: rng(), g: rng(), b: rng(), a: 1,
  })));
  return cases;
}

describe('BJ255 ③drawStripTrail P1 逐格段表 vs 参考机（全局搜索）byte 级等价', () => {
  beforeAll(() => installFakeDom());

  const SETS = ['RainbowRod', 'MagicMissile'] as const;
  for (const set of SETS) {
    it(`${set}：4 类随机带（直/L 折/U 形自交/密带）全字节一致`, () => {
      const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
      const cases = stripCases();
      cases.forEach((pts, ci) => {
        const target = dom.document.createElement('canvas');
        target.width = 256; target.height = 128;
        target.getContext('2d');
        const spec: TrailSpec = { set, pts, opacity: 4, time: 1.37 };
        const ok = drawStripTrail(target._ctx as unknown as CanvasRenderingContext2D,
          { atlas: fakeAtlas() } as never, spec);
        expect(ok).toBe(true);
        const got = target._ctx.buf!;
        const want = referenceRaster(spec);
        expect(got.width).toBe(want.width);
        expect(got.height).toBe(want.height);
        let diff = 0;
        for (let i = 0; i < want.data.length; i++) {
          if (got.data[i] !== want.data[i]) diff++;
        }
        expect(diff).toBe(0);                    // 逐字节（含 alpha=255 铺面语义）
      });
    });
  }
});

// ===================== ④ GL 顶带构造 =====================
describe('BJ255 ④buildStripVertsMM：9-float 布局/6 索引/原始色/p=i/(pairs−1)', () => {
  it('3 点带 pairs=3：A/B 侧、prog 0/0.5/1、idx 正面 6/quad、色不折 opacity', () => {
    const pts: TrailPt[] = [
      { x: 100, y: 50, hw: 8, r: 0.5, g: 0.6, b: 0.7, a: 1, rot: 0 },           // rot0 显式
      { x: 110, y: 50, hw: 4, r: 0.2, g: 0.3, b: 0.4, a: 0.5 },
      { x: 110, y: 60, hw: 2, r: 0.9, g: 0.1, b: 0.2, a: 0.25 },
    ];
    const { verts, idx } = buildStripVertsMM(pts, 3);
    expect(verts.length).toBe(3 * 2 * 9);
    expect(idx.length).toBe(2 * 6);
    // 顶点 0：rot=0 → widthDir=(rot−π/2)=(cos−π/2,sin−π/2)·hw=(0,−1)·8 → A=(100,42) B=(100,58)
    expect(verts[0]).toBeCloseTo(100, 9); expect(verts[1]).toBeCloseTo(42, 9);
    expect(verts[9]).toBeCloseTo(100, 9); expect(verts[10]).toBeCloseTo(58, 9);
    // tc：A=(p,d,d) p=0/0.5/1（pairs−1=2）、B=(0,0,d)
    expect(verts[6]).toBe(0); expect(verts[7]).toBe(16); expect(verts[8]).toBe(16);
    expect(verts[15]).toBe(0); expect(verts[16]).toBe(0); expect(verts[17]).toBe(16);
    expect(verts[6 + 18]).toBeCloseTo(0.5, 9);
    expect(verts[6 + 36]).toBe(1);
    expect(verts[15 + 36]).toBe(0);
    // 顶点色=原始值（无 opacity 折叠位；Float32 存储=f32 精度）
    expect(verts[2]).toBeCloseTo(0.5, 6); expect(verts[3]).toBeCloseTo(0.6, 6);
    expect(verts[4]).toBeCloseTo(0.7, 6); expect(verts[5]).toBe(1);
    expect(verts[2 + 36]).toBeCloseTo(0.9, 6); expect(verts[5 + 36]).toBeCloseTo(0.25, 6);
    // rot 缺省推导：pair1 rot=atan2(p2−p1)=π/2 → widthDir=(1,0)·4 → A=(114,50)、B=(106,50)
    expect(verts[18]).toBeCloseTo(114, 9);
    expect(verts[27]).toBeCloseTo(106, 9);
    // 顶点色为 Float32 存储：f32 精度（0.6→0.60000002384…）
    expect(verts[2 + 36]).toBeCloseTo(0.9, 6);
    expect(verts[5 + 36]).toBeCloseTo(0.25, 6);
    // idx：正面两三角 (0,1,2)(2,1,3)、(2,3,4)(4,3,5)
    expect([...idx.slice(0, 6)]).toEqual([0, 1, 2, 2, 1, 3]);
    expect([...idx.slice(6, 12)]).toEqual([2, 3, 4, 4, 3, 5]);
  });
  it('expectedPairs=60（独立于实际点数）：p 按 /59 摊（VertexStrip :55-63 语义）', () => {
    const pts: TrailPt[] = Array.from({ length: 4 }, (_, i) => ({
      x: i * 10, y: 0, hw: 8, r: 1, g: 1, b: 1, a: 1, rot: 0,
    }));
    const { verts } = buildStripVertsMM(pts, 60);
    expect(verts[6]).toBe(0);
    expect(verts[6 + 18]).toBeCloseTo(1 / 59, 6);
    expect(verts[6 + 36]).toBeCloseTo(2 / 59, 6);
    expect(verts[6 + 54]).toBeCloseTo(3 / 59, 6);
  });
});

// ===================== ⑤ GL 决策面 =====================
describe('BJ255 ⑤MM 族 GL 直绘决策（fake Image/glfx,node 注入）', () => {
  beforeAll(() => installFakeDom());

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 64; height = 64;
    set src(_v: string) { this.onload?.(); }
  }
  function wireImage(): void {
    (globalThis as unknown as { Image: unknown }).Image = FakeImage;
  }

  it('GL 在位：RainbowRod 走 trailFrameBeginMM+trailStripMM（uOpacity=4、uScroll=C[4]、6 索引/quad）', () => {
    wireImage();
    __resetTrailShaderForTest();
    const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
    const calls: { begin: unknown[][]; strip: unknown[][] } = { begin: [], strip: [] };
    const glfx = {
      resize: () => {},
      trailFrameBeginMM: (...a: unknown[]) => { calls.begin.push(a); },
      trailStripMM: (...a: unknown[]) => { calls.strip.push(a); },
      texFromImage: () => ({ tex: {} }),
    };
    const target = dom.document.createElement('canvas');
    target.width = 256; target.height = 128;
    target.getContext('2d');
    const pts: TrailPt[] = Array.from({ length: 8 }, (_, i) => ({
      x: 20 + i * 8, y: 40, hw: 8, r: 0.6, g: 0.3, b: 0.9, a: 1,
    }));
    const renderer = {
      atlas: fakeAtlas(),
      acquireGL: () => glfx,
      glViewW: 800, glViewH: 600, glCamX: 400, glCamY: 300, glZoom: 1.25,
    };
    // 第 1 帧：ensureRawImg 异步装载语义（同步 onload 但本调仍 null）→ CPU 兜底预热
    drawStripTrail(target._ctx as unknown as CanvasRenderingContext2D, renderer as never,
      { set: 'RainbowRod', pts, opacity: 4, time: 1.2 });
    expect(calls.begin).toHaveLength(0);
    // 第 2 帧：rawImgs 命中 → GL 直绘
    const ok = drawStripTrail(target._ctx as unknown as CanvasRenderingContext2D,
      renderer as never, { set: 'RainbowRod', pts, opacity: 4, time: 1.2 });
    expect(ok).toBe(true);
    expect(calls.begin).toHaveLength(1);
    expect(calls.strip).toHaveLength(1);
    const b = calls.begin[0] as number[];
    expect(b[0]).toBe(800); expect(b[1]).toBe(600);
    expect(b[2]).toBe(400); expect(b[3]).toBe(300);
    expect(b[4]).toBe(1.25);
    expect(b[5]).toBe(4);                                  // uOpacity=C[0]=UseOpacity(4f)
    expect(b[6]).toBeCloseTo(-2.8 * 1.2, 9);               // uScroll=C[4]=uSaturation×uTime
    const stripArgs = calls.strip[0] as [unknown, unknown, unknown, Float32Array, Uint16Array];
    const ref = buildStripVertsMM(pts);
    expect(stripArgs[3]).toEqual(ref.verts);               // 顶带与测试面构造同构
    expect(stripArgs[4]).toEqual(ref.idx);
    expect(stripArgs[4].length).toBe((pts.length - 1) * 6);   // 6 索引/quad（无背面）
  });

  it('?trailgl=0 逃生门/GL miss：落回 CPU 光栅（参考机差分仍全等）', () => {
    wireImage();
    __resetTrailShaderForTest();
    const dom = globalThis as unknown as { document: { createElement(t: string): FakeCanvas } };
    // node 无 location → URLSearchParams 抛 → catch 走 CPU（等同 gate-off 面）
    const target = dom.document.createElement('canvas');
    target.width = 256; target.height = 128;
    target.getContext('2d');
    const pts = stripCases()[1];
    const spec: TrailSpec = { set: 'RainbowRod', pts, opacity: 4, time: 0.9 };
    const ok = drawStripTrail(target._ctx as unknown as CanvasRenderingContext2D,
      { atlas: fakeAtlas(), acquireGL: () => null } as never, spec);
    expect(ok).toBe(true);
    const got = target._ctx.buf!;
    const want = referenceRaster(spec);
    expect(got.width).toBe(want.width);
    let diff = 0;
    for (let i = 0; i < want.data.length; i++) if (got.data[i] !== want.data[i]) diff++;
    expect(diff).toBe(0);
  });
});
