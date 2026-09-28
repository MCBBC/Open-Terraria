// ★批 α 红蓝修复刃判别器（2026-09-27;R2b-F1/F2/F3/F4 + R3b-1 + R2b-F6）。
//  每条 = 机制级红→绿:先按【修复后正确语义】断言（旧码跑必爆红）,修后全绿。
//  · F1/F2:重放 setTransform 的 p3 顶点偏移——批 stride 六顶点序 (p0,p1,p2,p0,p2,p3),
//    旧码取第 3 顶点(=p0 复用)当 p3 → c=d=0 奇异 CTM → GL 失败帧整层雨/雪沙消失
//    （"宁回退不丢精灵"承诺破）。判别=回放仿射把图像角 (0,h) 映到【真 p3】+ 非奇异。
//  · F3:沙尘叠画 ga 双重施加——顶点 rgb 已预乘 ga,旧回放烘焙色再取预乘值+globalAlpha
//    再施 ga = 净 ga²。判别=回放烘焙 fillStyle = 未预乘沙色。
//  · F4:批 uv flipY 错植——批四角由 CTM 直构（镜像已含在角点几何）,uv 恒锚图角
//    （texFromImage FLIP_Y=false）;decode 支 R2-F1 的 det<0→flipY 是归一化 quad 的
//    再表达规则,不适用于直构路径。判别=det<0 基阵下 v0=图顶（旧码=图底）。
//  · R3b-1:尘族烘焙环形容量 < 尘池上界——同帧 >ring 枚烘焙 n%ring 撞键,同键
//    texRefresh=同 TexEntry 原地改写 → 先行 rec flush 期错拿末次字节（I类 bolt 同病）。
//    判别=机制面（同键二次上传污染先行 rec）+ 容量窗（1024 撞/6000 不撞）+ 结构锁。
//  · F6:雨幕背景帧 +2 偏移只施偶列（WaterfallManager.cs:416 vs :437 else 支原始帧）
//    ——旧实现折进钟函数全列消费=奇列相位快 2 帧。判别=奇偶列帧序对照反编译逐 tick。
//  node 环境无 canvas——回放面 tint 烘焙以最小 document 桩供面（tintScratch 算子序
//  记账:fillStyle 按 multiply gco 过滤=每 bake 一笔,序=quad 序）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPrecipBatch, buildRainBatch, drawPrecipBatchCaptureForTest,
  drawRainBatchCaptureForTest, dustTexSetForTest, rainGlSetForTest,
  rainTexSetForTest, WeatherRenderer,
  type RainDrop,
} from '../src/render/WeatherRenderer';

/** WeatherRenderer 内部接口（未导出;结构等价本地型） */
interface SnowFlake { x: number; y: number; vx: number; vy: number; scale: number; frame: number; active: boolean; }
interface SandGrain { x: number; y: number; vx: number; vy: number; scale: number; fadeIn: number; cr: number; cg: number; cb: number; frame: number; active: boolean; }
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';
import { WaterfallRenderer } from '../src/render/WaterfallRenderer';
import { TileStore } from '../src/world/TileStore';
import { pinGameTimeTicks } from '../src/core/GameTime';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const VD = readFileSync(join(__dirname, '../src/fx/VanillaDust.ts'), 'utf8');
const WR = readFileSync(join(__dirname, '../src/render/WeatherRenderer.ts'), 'utf8');
const WFS = readFileSync(join(__dirname, '../src/render/WaterfallRenderer.ts'), 'utf8');

const RAIN_W = 168, RAIN_H = 42;      // vanilla Rain.png（帧 2×40,type×4 偏移）
const DUST_W = 1000, DUST_H = 120;    // vanilla Dust.png（帧 8×8）
const frnd = Math.fround;

// ---- 最小 document 桩（仅 tintScratch 面算子记账;afterAll 摘除）----
let gco = 'source-over';
const fillLog: Array<{ gco: string; v: string }> = [];
const stub2d = {
  get globalCompositeOperation() { return gco; },
  set globalCompositeOperation(v: string) { gco = v; },
  set fillStyle(v: string) { fillLog.push({ gco, v }); },
  drawImage() { /* 记账面无像素 */ },
  fillRect() { /* 记账面无像素 */ },
  clearRect() { /* 记账面无像素 */ },
};
beforeAll(() => {
  gco = 'source-over';
  (globalThis as unknown as { document: unknown }).document = {
    createElement() {
      return { width: 0, height: 0, getContext: () => stub2d };
    },
  };
});
afterAll(() => {
  delete (globalThis as unknown as { document?: unknown }).document;
});

function lightTo255(_tx: number, _ty: number, out: number[]): number[] { out[0] = 255; out[1] = 255; out[2] = 255; return out; }

function mkDrop(over: Partial<RainDrop>): RainDrop {
  return { x: 0, y: 0, vx: 0, vy: 14, scale: 1, rotation: 0, type: 0, active: true, ...over };
}
function mkFlake(over: Partial<SnowFlake>): SnowFlake {
  return { x: 0, y: 0, vx: 0, vy: 14, scale: 1, frame: 0, active: true, ...over };
}
function mkGrain(over: Partial<SandGrain>): SandGrain {
  return { x: 0, y: 0, vx: 0, vy: 0, scale: 1, fadeIn: 0, cr: 0, cg: 0, cb: 0, frame: 0, active: true, ...over };
}

/** fake Renderer 中介:GL 支发射被捕（返回批数据+重放闭包）;2D 回落 no-op。 */
function glCapture(kind: 'rain' | 'precip', drops: RainDrop[] | null, snow: SnowFlake[], sand: SandGrain[]): {
  data: Float32Array; quads: number; replay: unknown;
} | null {
  const box: { c: { data: Float32Array; quads: number; replay: unknown } | null } = { c: null };
  const fakeR = {
    ctx: {
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      save() { /* no-op */ }, restore() { /* no-op */ }, setTransform() { /* no-op */ },
      translate() { /* no-op */ }, rotate() { /* no-op */ }, drawImage() { /* no-op */ },
      globalAlpha: 1, imageSmoothingEnabled: true,
    },
    emitRainQuadBatch: (_img: unknown, _key: string, data: Float32Array, quads: number, replay: unknown) => {
      box.c = { data: data.slice(), quads, replay };
      return true;
    },
    emitPrecipQuadBatch: (_img: unknown, _key: string, data: Float32Array, quads: number, replay: unknown) => {
      box.c = { data: data.slice(), quads, replay };
      return true;
    },
  };
  const fx = new WeatherRenderer();
  fx.attach({ cloudAlpha: 1 } as never, { lightAtTo: lightTo255 } as never);
  if (kind === 'rain' && drops) {
    fx.poolSetForTest(drops);
    rainTexSetForTest({ width: RAIN_W, height: RAIN_H } as unknown as ImageBitmap);
    fx.drawRain(fakeR as never, {} as never);
  } else {
    dustTexSetForTest({ width: DUST_W, height: DUST_H } as unknown as ImageBitmap);
    (fx as unknown as { snow: SnowFlake[]; sand: SandGrain[] }).snow = snow;
    (fx as unknown as { snow: SnowFlake[]; sand: SandGrain[] }).sand = sand;
    fx.drawPrecipDust(fakeR as never, {} as never);
  }
  return box.c;
}

/** 回放面记账 ctx:setTransform 逐参记录（附记录时 globalAlpha）;save/restore 平衡。 */
function recordReplay(replay: unknown): Array<{ m: number[]; ga: number }> {
  const calls: Array<{ m: number[]; ga: number }> = [];
  const fake = {
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() { /* 记账 */ }, restore() { /* 记账 */ },
    setTransform(...a: number[]) { calls.push({ m: a.slice(), ga: this.globalAlpha }); },
    drawImage() { /* 记账 */ },
  };
  (replay as (c: unknown) => void)(fake);
  return calls;
}

describe('★R2b-F1 雨批重放 p3 偏移（o+35/36 非 o+21/22）', () => {
  it('旋转滴:回放仿射 (0,h)→真 p3 + CTM 非奇异（旧码取第 3 顶点=p0 → c=d=0 奇异）', () => {
    rainGlSetForTest(true);
    const rot = 0.42;
    const cap = glCapture('rain', [mkDrop({ x: 100, y: 200, rotation: rot, scale: 1, type: 3 })], [], []);
    expect(cap).not.toBeNull();
    expect(cap!.quads).toBe(1);
    const D = cap!.data;
    // 独立复算四角（镜像算子同式 fround 链,同 rain-gl-batch 判例;末加法 frnd=
    // Float32Array 存储舍入面）
    const co = frnd(Math.cos(rot)), si = frnd(Math.sin(rot));
    const a = co, b = si, c = -si, dd = co;   // 单位基阵下 base·R
    const e1 = frnd(100), f1 = frnd(200);
    const w = 2, h = 40;
    const p0x = e1, p0y = f1;
    const p1x = frnd(frnd(a * w) + e1), p1y = frnd(frnd(b * w) + f1);
    const p3x = frnd(frnd(c * h) + e1), p3y = frnd(frnd(dd * h) + f1);
    // 批数据布局锚:第 3 顶点=o+21/27=p0 复用;真 p3=o+35/36
    expect(D[21]).toBe(p0x); expect(D[22]).toBe(p0y);
    expect(D[35]).toBe(p3x); expect(D[36]).toBe(p3y);
    const calls = recordReplay(cap!.replay);
    expect(calls.length).toBeGreaterThanOrEqual(2);   // [0]=identity 复位,[1]=第一滴
    const m = calls[1].m;
    expect(m.length).toBe(6);
    // (0,0)→p0
    expect(m[4]).toBeCloseTo(p0x, 4); expect(m[5]).toBeCloseTo(p0y, 4);
    // (w,0)→p1
    expect(m[0] * w + m[4]).toBeCloseTo(p1x, 3); expect(m[1] * w + m[5]).toBeCloseTo(p1y, 3);
    // (0,h)→【真 p3】（旧码:=(0,h)→p0 且 c=d=0）
    expect(m[2] * h + m[4]).toBeCloseTo(p3x, 3);
    expect(m[3] * h + m[5]).toBeCloseTo(p3y, 3);
    // 非奇异（奇异 CTM 下 drawImage 全帧无输出=整层雨消失）
    const det = m[0] * m[3] - m[1] * m[2];
    expect(Math.abs(det)).toBeGreaterThan(1e-6);
  });
});

describe('★R2b-F2 雪沙批重放 p3 偏移（o+40/41 非 o+24/25）', () => {
  it('单位基阵雪粒:回放仿射 (0,8)→真 p3 + CTM 非奇异（旧码奇异=雪沙整层消失）', () => {
    rainGlSetForTest(true);
    const cap = glCapture('precip', null, [mkFlake({ x: 100, y: 200, scale: 1, frame: 2 })], []);
    expect(cap).not.toBeNull();
    expect(cap!.quads).toBe(1);
    const D = cap!.data;
    const sz = 8;
    const p0x = 100 - 4, p0y = 200 - 4;
    const p1x = p0x + sz, p1y = p0y;
    const p3x = p0x, p3y = p0y + sz;
    // 布局锚:第 3 顶点=o+24/25=p0 复用;真 p3=o+40/41
    expect(D[24]).toBe(p0x); expect(D[25]).toBe(p0y);
    expect(D[40]).toBe(p3x); expect(D[41]).toBe(p3y);
    const calls = recordReplay(cap!.replay);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const m = calls[1].m;
    expect(m[4]).toBeCloseTo(p0x, 4); expect(m[5]).toBeCloseTo(p0y, 4);
    expect(m[0] * sz + m[4]).toBeCloseTo(p1x, 3); expect(m[1] * sz + m[5]).toBeCloseTo(p1y, 3);
    expect(m[2] * sz + m[4]).toBeCloseTo(p3x, 3);
    expect(m[3] * sz + m[5]).toBeCloseTo(p3y, 3);
    const det = m[0] * m[3] - m[1] * m[2];
    expect(Math.abs(det)).toBeGreaterThan(1e-6);
  });

  it('沙粒双 quad（基画+叠画交错序）:两枚回放仿射同款非奇异', () => {
    rainGlSetForTest(true);
    const cap = glCapture('precip', null, [], [mkGrain({ x: 50, y: 60, cr: 200, cg: 160, cb: 20, frame: 1 })]);
    expect(cap!.quads).toBe(2);
    const D = cap!.data;
    const calls = recordReplay(cap!.replay);
    for (const qi of [0, 1]) {
      const o = qi * 48;
      const m = calls[1 + qi].m;
      expect(m[2] * 8 + m[4]).toBeCloseTo(D[o + 40], 3);
      expect(m[3] * 8 + m[5]).toBeCloseTo(D[o + 41], 3);
      expect(Math.abs(m[0] * m[3] - m[1] * m[2])).toBeGreaterThan(1e-6);
    }
  });
});

describe('★R2b-F3 沙尘叠画 ga 单次语义（回放拆回未预乘 tint）', () => {
  it('叠画 quad:烘焙色=未预乘沙色 (200,160,20)、globalAlpha=180/255（旧码=预乘色再叠 ga=净 ga²）', () => {
    rainGlSetForTest(true);
    const ga = 180 / 255;
    const cap = glCapture('precip', null, [], [mkGrain({ x: 50, y: 60, cr: 200, cg: 160, cb: 20, frame: 1 })]);
    fillLog.length = 0;
    const calls = recordReplay(cap!.replay);
    // 每 bake 一笔 multiply fillStyle,序=quad 序（基画→叠画）
    const mul = fillLog.filter((f) => f.gco === 'multiply').map((f) => f.v);
    expect(mul.length).toBe(2);
    expect(mul[0]).toBe('rgb(255,255,255)');            // 基画 = GetAlpha(light=255)
    expect(mul[1]).toBe('rgb(200,160,20)');             // 叠画 = 拆回未预乘沙色
    // alpha 单次施加:基画 ga=1、叠画 ga=180/255
    expect(calls[1].ga).toBe(1);
    expect(calls[2].ga).toBeCloseTo(ga, 7);
  });
});

describe('★R2b-F4 批 uv 恒锚图角（det<0 不反转 v 区间）', () => {
  it('雨批 det<0 基阵:v0=图顶/v2=图底（旧码=swap 后 v0=图底,与 2D drawImage 镜像语义不符）', () => {
    rainGlSetForTest(true);
    const eps = 1 / 4096;
    expect(buildRainBatch({ a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 }, [mkDrop({ x: 10, y: 10, type: 5 })],
      lightTo255, 0, RAIN_W, RAIN_H)).toBe(1);
    const D = drawRainBatchCaptureForTest().data;
    expect(D[3]).toBeCloseTo(-eps / RAIN_H, 7);                 // 顶点0 v=图顶（v=0 行）
    expect(D[10]).toBeCloseTo(-eps / RAIN_H, 7);                // 顶点1 同顶
    expect(D[17]).toBeCloseTo((40 - eps) / RAIN_H, 7);          // 顶点2 v=图底
    expect(D[31]).toBeCloseTo((40 - eps) / RAIN_H, 7);          // 顶点3=p0 复用同 uv
  });

  it('雪沙批 det<0 基阵:同款恒锚图角', () => {
    rainGlSetForTest(true);
    const eps = 1 / 4096;
    const snow = [mkFlake({ x: 10, y: 10, scale: 1, frame: 0 })];
    expect(buildPrecipBatch({ a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 }, snow, [], lightTo255, DUST_W, DUST_H)).toBe(1);
    const D = drawPrecipBatchCaptureForTest().data;
    const va0 = (0 - eps) / DUST_H, vb0 = (8 - eps) / DUST_H;
    expect(D[3]).toBeCloseTo(va0, 7);
    expect(D[19]).toBeCloseTo(vb0, 7);
  });

  it('结构锁:批构建面无 det<0 uv 互换（R2-F1 decode 规则不适用直构四角）', () => {
    // buildRainBatch/buildPrecipBatch 内不得出现 v 区间反转式
    expect(WR).not.toContain('const va = det < 0 ? vb0 : va0');
    expect(WR).not.toContain('const va = det < 0 ? vb0 : va0, vb = det < 0 ? va0 : vb0');
    // 锚注订正:uv 注明确 R2-F1 不适用+翻屏重审登记
    expect(WR).toContain('R2b-F4');
  });
});

describe('★R3b-1 尘族烘焙环形容量 = 尘池上界 6000', () => {
  it('结构锁:三尘烘焙点走 DUST_BAKE_RING（=VanillaDust POOL,Main.dust[6000] 上界）', () => {
    expect(RDR).toContain('private static readonly DUST_BAKE_RING = 6000;');
    expect(RDR).toContain("this.uploadScratchBake(s1, 'dustTint', Renderer.DUST_BAKE_RING, undefined, undefined, ida)");   // ★P0:ida 直挂零拷贝
    expect(RDR).toContain("this.uploadScratchBake(s2, 'dustColor', Renderer.DUST_BAKE_RING, undefined, undefined, idc)");   // ★P0:idc 直挂零拷贝
    expect(RDR).toContain("this.uploadScratchBake(s2, 'dustDye', Renderer.DUST_BAKE_RING, undefined, undefined, idd)");   // ★P0:idd 直挂零拷贝
    expect(VD).toContain('const POOL = 6000;');
  });

  it('机制面:同键二次上传=同 TexEntry 原地改写,先行 rec flush 期错拿末次字节（污染通道）', () => {
    const entries = new Map<string, { key: string; bytes: string }>();
    const quadCalls: Array<{ e: { key: string; bytes: string } }> = [];
    const layer = {
      unavailable: false, open: false,
      isAccumOpen(name: string) { return name === 'world' && this.open; },
      begin() { this.open = true; },
      resize() { /* no-op */ },
      endAccumulate() { this.open = false; return null; },
      blendAdditive() { /* no-op */ }, blendErase() { /* no-op */ }, blendMult() { /* no-op */ },
      quadSprite(e: { key: string; bytes: string }) { quadCalls.push({ e }); },
      quadBatch() { return true; },
      texFromImage() { return null; },
      texAlive() { return true; },
      texRefresh(key: string, img: { bytes: string }) {
        let e = entries.get(key);
        if (!e) { e = { key, bytes: '' }; entries.set(key, e); }
        e.bytes = img.bytes;   // GLSpriteLayer.texRefresh 语义:同键=同 entry 原地重传
        return e;
      },
      texFromRegion() { return null; }, texFromData() { return null; },
      end() { /* no-op */ },
    };
    const host = { acquireGl: () => layer, worldCtx: () => null, worldW: () => 8, worldH: () => 8 };
    const exec = new GLShimExecutor(host as never);
    const ctx = exec.attachAcc();
    expect(ctx).not.toBeNull();
    const sc = { width: 8, height: 8, bytes: 'A' };
    exec.uploadScratchNow(sc as unknown as HTMLCanvasElement, 'fam:0');   // bake#1 → entry E
    ctx!.drawImage(sc as unknown as HTMLCanvasElement, 0, 0);            // rec1 持 preTex=E
    sc.bytes = 'B';
    exec.uploadScratchNow(sc as unknown as HTMLCanvasElement, 'fam:0');   // bake#2 同键 → E 原地改写
    ctx!.drawImage(sc as unknown as HTMLCanvasElement, 0, 0);            // rec2 持 preTex=E
    exec.flush();
    expect(quadCalls.length).toBe(2);
    // 两 rec 同 entry——先行 rec 的采样内容已被 bake#2 覆写（=同帧撞键污染通道）
    expect(quadCalls[0].e).toBe(quadCalls[1].e);
    expect(quadCalls[0].e.bytes).toBe('B');
  });

  it('容量窗判别:1024 环在 1025 枚同帧撞键;6000 环（=池上界）整池单帧零撞键', () => {
    const keys = (ring: number, n: number) =>
      Array.from({ length: n }, (_, i) => `fam:${(i + 1) % ring}`);
    expect(new Set(keys(1024, 1025)).size).toBeLessThan(1025);   // 旧容量:池级帧撞键（1500 枚即 476 撞）
    expect(new Set(keys(1024, 1500)).size).toBe(1024);
    expect(new Set(keys(6000, 6000)).size).toBe(6000);           // 新容量:单帧上界=池容量,零复用
    expect(new Set(keys(6000, 1500)).size).toBe(1500);           // 判别器口径:1500 枚同帧无撞键
  });
});

// ---- R2b-F6 雨幕帧序对照反编译（WaterfallManager.cs:260-300 UpdateFrame + :416/:437 分列）----
function vanillaRainFrames(tick: number, evenCol: boolean): { fg: number; bg: number } {
  // UpdateFrame 1:1（计数器初值 0;fg 每 tick ++ >7 −8;bg 每 3 tick -- <0 → 7）
  let fg = 0, bg = 0, ctr = 0;
  for (let t = 0; t < tick; t++) {
    ctr++;
    fg++;
    if (fg > 7) fg -= 8;
    if (ctr > 2) { ctr = 0; bg--; if (bg < 0) bg = 7; }
  }
  // DrawWaterfall 分列（:413-447）：偶列 fg+3 / bg+2（>7 −8）;奇列原始帧
  const even = evenCol;
  const fgF = even ? (fg + 3 > 7 ? fg + 3 - 8 : fg + 3) : fg;
  const bgF = even ? (bg + 2 > 7 ? bg + 2 - 8 : bg + 2) : bg;
  return { fg: fgF, bg: bgF };
}

describe('★R2b-F6 雨幕背景帧 +2 只施偶列（奇偶列帧序对照反编译）', () => {
  it('偶列 bg=(raw+2)%8、奇列 bg=raw;fg 同式 +3 仅偶列——48 tick 全帧序逐位对照', () => {
    const st = new TileStore(64, 64);
    const ctxCalls: Array<{ img: { name: string }; sx: number }> = [];
    const ctx: unknown = {
      globalAlpha: 1, imageSmoothingEnabled: true,
      canvas: { width: 988, height: 862 },
      save() { /* no-op */ }, restore() { /* no-op */ },
      translate() { /* no-op */ }, scale() { /* no-op */ },
      drawImage(img: { name: string }, sx: number) { ctxCalls.push({ img, sx }); },
    };
    const atlas = { ensureVImage: (name: string) => ({ width: 288, height: 40, name }) };
    const collect = (colX: number) => {
      const wf: unknown = new WaterfallRenderer();
      (wf as unknown as { falls: Array<{ x: number; y: number; type: number }> }).falls =
        [{ x: colX, y: 10, type: 3 }];
      const fg: number[] = [], bg: number[] = [];
      for (let t = 0; t < 48; t++) {
        pinGameTimeTicks(t);
        ctxCalls.length = 0;
        (wf as WaterfallRenderer).draw(ctx as never, atlas as never, st, 999, 0, 0);
        const bgCall = ctxCalls.find((c) => c.img.name === 'vanilla/Waterfall_12.png');
        const fgCall = ctxCalls.find((c) => c.img.name === 'vanilla/Waterfall_11.png');
        expect(bgCall, `tick ${t} 背景层应绘制`).toBeTruthy();
        expect(fgCall, `tick ${t} 前景层应绘制`).toBeTruthy();
        bg.push(bgCall!.sx / 18);
        fg.push(fgCall!.sx / 18);
      }
      return { fg, bg };
    };
    const even = collect(8);
    const odd = collect(9);
    for (let t = 0; t < 48; t++) {
      const v = vanillaRainFrames(t, true);
      const vo = vanillaRainFrames(t, false);
      expect(even.bg[t], `tick ${t} 偶列 bg`).toBe(v.bg);
      expect(even.fg[t], `tick ${t} 偶列 fg`).toBe(v.fg);
      expect(odd.bg[t], `tick ${t} 奇列 bg`).toBe(vo.bg);
      expect(odd.fg[t], `tick ${t} 奇列 fg`).toBe(vo.fg);
    }
  });

  it('结构锁:钟函数无 +2 折入;+2 按列奇偶施用（锚 :416 vs :437）', () => {
    expect(WFS).not.toContain('8 + 2 - (Math.floor(gameTickCount() / 3) % 8)');
    expect(WFS).toContain('frameBg = (frameBg + 2) % 8');
    expect(WFS).toContain('R2b-F6');
  });
});
