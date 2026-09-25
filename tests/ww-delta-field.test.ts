// ★C8-D 波场脏区增量回传守卫（2026-09-25;三笔登记债之最大笔收偿）。
// 硬判据=位等价：解码后主线程 _R/_G 与 worker 全量【逐位同】（场内容确定性同源,
// 非混沌口径——全部写入路径经 q256/rq/256/gq/256 量化,k/256 字节精确可表）。
// 三证：①位等价（随机注入序列+resize+锚帧交错+大跳帧,160 帧逐帧比对）
//       ②保底锚帧（周期 120/resize/forceFull 单发/大跳判据纯函数;单测锁）
//       ③流量账（静水零跨度 delta=4B;单洗掠帧 delta << 全量字节）。
// 外加：resync 守卫（网格失配/跨度越界丢帧不半应用）、f32 逃生 sticky
// （量化不变式破坏回滚口）、WaveWorker 源码锚（协议形态/transfer/resync op）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  waterWaves, WaterWaveSystem, setWaveTextures, queueRippleRaw, RippleShape,
  wwCameraJumpForceFull, WW_FULL_ANCHOR_EVERY, wwWorkerStats,
  type WWFieldMsg,
} from '../src/render/WaterWaves';

const WWK = readFileSync(resolve(__dirname, '../src/workers/WaveWorker.ts'), 'utf8');

// 生产者=单例（vitest node 环境无 document → frame() 走本地模拟=worker 侧角色）;
// 消费者=独立实例（_wwApplyField 喂入=主线程角色）。
const anyP = waterWaves as unknown as {
  resetForTest(): void; setQuality(q: number): void; frame(inp: object): void;
  injectWash(...a: number[]): void; readGridR(): Float32Array; readGridG(): Float32Array;
  gridW(): number; gridH(): number; progress: number; _scrollX: number; _scrollY: number;
  _R: Float32Array; _wwOn: boolean; _ww: unknown; exportFieldDelta(f: boolean): WWFieldMsg;
};

/** Float32Array 逐位同（含 byteOffset/length;NaN 毒化也判异） */
function bits(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  const ua = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const ub = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
  return true;
}

function mkInp(over: Record<string, number> = {}): object {
  return { camX: 0, camY: 0, zoom: 1, viewW: 160, viewH: 96, tileX: 5, tileY: 5,
    maxTilesX: 100, maxTilesY: 100, worldSurface: 20, rockLayer: 60,
    windAbs: 0, rain: 0, dt: 1 / 60, ...over };
}

/** 消费者喂入 + 硬判据断言（场/元数据全对账） */
function feedAndVerify(C: WaterWaveSystem, msg: WWFieldMsg): void {
  const anyC = C as unknown as Record<string, any>;
  anyC._wwApplyField(msg);
  expect(bits(anyC._R as Float32Array, anyP.readGridR())).toBe(true);
  expect(bits(anyC._G as Float32Array, anyP.readGridG())).toBe(true);
  expect(anyC._gW).toBe(anyP.gridW());
  expect(anyC._gH).toBe(anyP.gridH());
  expect(anyC.progress).toBe(anyP.progress);
  expect(anyC._camX).toBeCloseTo((msg.cam as [number, number, number])[0], 12);
  expect(anyC._scrollX).toBe(anyP._scrollX);
  expect(anyC._scrollY).toBe(anyP._scrollY);
}

describe('C8-D ①位等价（硬判据）', () => {
  beforeEach(() => {
    anyP.resetForTest();
    anyP.setQuality(3);
    anyP._wwOn = false; anyP._ww = null;
    setWaveTextures(null, { data: new Uint8ClampedArray(64 * 128 * 4).fill(255) });
  });

  it('随机注入序列+resize+锚帧交错+大跳帧:160 帧逐帧逐位同', () => {
    const C = new WaterWaveSystem();
    let seed = 0x12345678;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let camX = 100, camY = 200, viewW = 160, viewH = 96;
    let fulls = 0, deltas = 0, deltaWithSpans = 0;
    for (let f = 0; f < 160; f++) {
      if (f === 80) { viewW = 176; viewH = 104; }              // resize → 影子失配全量
      camX += (rnd() - 0.5) * 8; camY += (rnd() - 0.5) * 6;    // 行走随机游走
      if (f === 130) { camX += 300; camY += 240; }             // 大跳（delta 语义须精确覆盖）
      const dt = rnd() < 0.15 ? 1 / 30 : 1 / 60;               // 掉帧补 2 步
      // 注入先于 frame（生产时序:Renderer 实体洗掠在 frame 前=F_prev 锚）。
      // 注入密度压到真实场景量级（波场活跃区局部化前提;满屏乱注会把 delta
      // 顶过全量阈值=设计内回退,流量主导性由 ③ 流量账专测锁）。
      if (rnd() < 0.4) {
        anyP.injectWash(camX + rnd() * viewW, camY + rnd() * viewH,
          8 + rnd() * 16, 8 + rnd() * 16, 0.5 + rnd() * 0.5, 0.5, rnd());
      }
      if (rnd() < 0.3) {
        queueRippleRaw(camX + rnd() * viewW, camY + rnd() * viewH,
          4 + rnd() * 12, 4 + rnd() * 12, 0.25, 0.6, 0.5, RippleShape.Circle, 0);
      }
      anyP.frame({ camX, camY, zoom: 1, viewW, viewH, tileX: 5, tileY: 5,
        maxTilesX: 100, maxTilesY: 100, worldSurface: 20, rockLayer: 60,
        windAbs: 0, rain: 0, dt });
      const msg = anyP.exportFieldDelta(false);
      if (msg.fmt === 'full') fulls++;
      else if (msg.fmt === 'delta') { deltas++; if (msg.meta[0] > 0) deltaWithSpans++; }
      feedAndVerify(C, msg);
    }
    expect(fulls).toBeGreaterThanOrEqual(3);   // 首帧 + resize + 周期锚
    expect(deltas).toBeGreaterThan(30);        // 增量为主体（busy 帧全量回退=设计内）
    expect(deltaWithSpans).toBeGreaterThan(10); // 非平凡跨度 delta 大量存在
  });

  it('全量字节快照也逐位同（k/256 float32 精确可表:尾数 ≤9 位）', () => {
    const C = new WaterWaveSystem();
    // 涟漪沉积（形状贴图全白 → quad 内确定性落值;洗掠环在窄流向门下可全零,
    // 非平凡性用涟漪保障,位等价判据对 full/delta 两形态各自独立锁）
    queueRippleRaw(60, 40, 20, 20, 0.25, 0.6, 0.5, RippleShape.Circle, 0);
    anyP.injectWash(60, 40, 60, 60, 0.05, 0.5, 0.8);   // 流向朝 +x 反侧(radx>0 侧)
    anyP.frame(mkInp({}));
    const msg = anyP.exportFieldDelta(true);   // 强制全量
    expect(msg.fmt).toBe('full');
    feedAndVerify(C, msg);
    const anyC = C as unknown as Record<string, any>;
    expect((anyC._R as Float32Array).some((v) => v !== 0.5)).toBe(true);   // 非平凡场
  });
});

describe('C8-D ②保底锚帧', () => {
  beforeEach(() => {
    anyP.resetForTest();
    anyP.setQuality(3);
    anyP._wwOn = false; anyP._ww = null;
    setWaveTextures(null, { data: new Uint8ClampedArray(64 * 128 * 4).fill(255) });
  });

  it(`周期锚:每 ${WW_FULL_ANCHOR_EVERY} 帧强制全量;静水帧零跨度 delta`, () => {
    const C = new WaterWaveSystem();
    const fmts: string[] = [];
    let zeroSpans = 0;
    for (let f = 0; f < 250; f++) {
      anyP.frame(mkInp({}));
      const msg = anyP.exportFieldDelta(false);
      fmts.push(msg.fmt);
      if (msg.fmt === 'delta' && msg.meta[0] === 0) zeroSpans++;
      feedAndVerify(C, msg);
    }
    expect(fmts[0]).toBe('full');
    expect(fmts[WW_FULL_ANCHOR_EVERY]).toBe('full');
    expect(fmts[WW_FULL_ANCHOR_EVERY * 2]).toBe('full');
    for (let i = 1; i < 250; i++) {
      if (i % WW_FULL_ANCHOR_EVERY !== 0) expect(fmts[i], `msg#${i}`).toBe('delta');
    }
    expect(zeroSpans).toBeGreaterThan(200);   // 中性定点:静水场恒零跨度
  });

  it('resize（影子失配）→ 全量锚 + _R2/_G2 换长对齐（R2-F2 语义保持）', () => {
    const C = new WaterWaveSystem();
    anyP.frame(mkInp({}));
    feedAndVerify(C, anyP.exportFieldDelta(false));          // full
    let lastFmt = '';
    for (let f = 0; f < 5; f++) {
      anyP.frame(mkInp({}));
      const m = anyP.exportFieldDelta(false);
      lastFmt = m.fmt;
      feedAndVerify(C, m);
    }
    expect(lastFmt).toBe('delta');
    anyP.frame(mkInp({ viewW: 200, viewH: 120 }));           // resize:40×24 → 50×30
    const msg = anyP.exportFieldDelta(false);
    expect(msg.fmt).toBe('full');
    feedAndVerify(C, msg);
    const anyC = C as unknown as Record<string, any>;
    expect(anyC._R.length).toBe(50 * 30);
    expect(anyC._R2.length).toBe(50 * 30);                    // ★R2-F2 红判别式
    expect(anyC._G2.length).toBe(50 * 30);
  });

  it('forceFull 单发（换档/resync/大跳入口）→ 一次全量后回归 delta', () => {
    const C = new WaterWaveSystem();
    anyP.frame(mkInp({}));
    feedAndVerify(C, anyP.exportFieldDelta(false));
    anyP.frame(mkInp({}));
    feedAndVerify(C, anyP.exportFieldDelta(false));
    anyP.frame(mkInp({}));
    const forced = anyP.exportFieldDelta(true);
    expect(forced.fmt).toBe('full');
    feedAndVerify(C, forced);
    anyP.frame(mkInp({}));
    expect(anyP.exportFieldDelta(false).fmt).toBe('delta');   // 单发语义（不 sticky）
  });

  it('大跳判据纯函数:ΔF>8 texel 触发,行走 ΔF∈{0,±1} 不触发', () => {
    expect(wwCameraJumpForceFull(null, 100, 100, 1)[0]).toBe(false);   // 无历史不触发
    expect(wwCameraJumpForceFull([0, 0], 32, 0, 1)[0]).toBe(false);    // ΔF=8 边界（>8 才触发）
    expect(wwCameraJumpForceFull([0, 0], 36, 0, 1)[0]).toBe(true);     // ΔF=9
    expect(wwCameraJumpForceFull([0, 0], 0, 40, 1)[0]).toBe(true);     // y 向
    expect(wwCameraJumpForceFull([-4, -2], -8, -6, 1)[0]).toBe(false); // 行走 ΔF=±1
    // F 返回值=新状态（camX=0 → Math.floor(−0)=−0,与类内 sx 同式镜像,−0 原样保真）
    expect(wwCameraJumpForceFull([0, 0], 0, 0, 1)[1]).toEqual([-0, -0]);
  });
});

describe('C8-D ③流量账', () => {
  beforeEach(() => {
    anyP.resetForTest();
    anyP.setQuality(3);
    anyP._wwOn = false; anyP._ww = null;
    setWaveTextures(null, { data: new Uint8ClampedArray(64 * 128 * 4).fill(255) });
  });

  it('静水零跨度 delta=meta 4B 整（旧全量 8B/格）', () => {
    anyP.frame(mkInp({}));
    const full = anyP.exportFieldDelta(false);
    expect(full.fmt).toBe('full');
    const n = anyP.gridW() * anyP.gridH();
    const msg = anyP.exportFieldDelta(false);   // 同场再问 → 零变更
    expect(msg.fmt).toBe('delta');
    const d0 = msg as Extract<WWFieldMsg, { fmt: 'delta' }>;
    expect(d0.meta[0]).toBe(0);
    expect(d0.meta.length * 4 + d0.data.length).toBe(4);   // [0] 一个 u32
    expect(n * 8).toBeGreaterThan(1000);                      // 旧面基线（对照量级）
  });

  it('单洗掠帧 delta 载荷 < 全量字节 20%', () => {
    anyP.frame(mkInp({}));
    anyP.exportFieldDelta(false);                              // full 定影
    anyP.injectWash(60, 40, 24, 24, 0.9, 0.5, 0.8);            // 单笔洗掠（先于 frame=时序同产线）
    anyP.frame(mkInp({}));
    const msg = anyP.exportFieldDelta(false);
    expect(msg.fmt).toBe('delta');
    const d1 = msg as Extract<WWFieldMsg, { fmt: 'delta' }>;
    expect(d1.meta[0]).toBeGreaterThan(0);
    const deltaBytes = d1.meta.length * 4 + d1.data.length;
    const n = anyP.gridW() * anyP.gridH();
    expect(deltaBytes).toBeLessThan(n * 2 * 0.2);
  });

  it('wwWorkerStats 流量账字段:bytes/fmt/resyncs 计数面（探针消费）', () => {
    const C = new WaterWaveSystem();
    const s0 = wwWorkerStats();
    anyP.frame(mkInp({}));
    const anyC = C as unknown as Record<string, any>;
    anyC._wwApplyField(anyP.exportFieldDelta(false));
    anyC._wwApplyField(anyP.exportFieldDelta(false));
    const s1 = wwWorkerStats();
    expect(s1.fmt.full).toBe(s0.fmt.full + 1);
    expect(s1.fmt.delta).toBe(s0.fmt.delta + 1);
    expect(s1.bytes).toBeGreaterThan(s0.bytes);
    expect(s1.resyncs).toBe(s0.resyncs);
  });
});

describe('C8-D 守卫面', () => {
  beforeEach(() => {
    anyP.resetForTest();
    anyP.setQuality(3);
    anyP._wwOn = false; anyP._ww = null;
    setWaveTextures(null, { data: new Uint8ClampedArray(64 * 128 * 4).fill(255) });
  });

  it('resync 守卫:网格失配/跨度越界 delta 丢帧不半应用 + postMessage 请求重锚', () => {
    const C = new WaterWaveSystem();
    const sent: Array<{ op: string }> = [];
    (C as unknown as Record<string, any>)._ww = { postMessage: (m: { op: string }) => { sent.push(m); }, terminate() { /* no-op */ } };
    anyP.frame(mkInp({}));
    feedAndVerify(C, anyP.exportFieldDelta(false));            // full 对齐 40×24
    const anyC = C as unknown as Record<string, any>;
    const before = Float32Array.from(anyC._R as Float32Array);
    // ①网格失配
    anyC._wwApplyField({ fmt: 'delta', meta: new Uint32Array([0]), data: new Uint8Array(0),
      gW: 20, gH: 20, progress: 9, intensity: 9, waveOff: [0, 0], cam: [0, 0, 1], scroll: [0, 0] });
    expect(sent.some((x) => x.op === 'resync')).toBe(true);
    expect(anyC._gW).not.toBe(20);
    expect(Float32Array.from(anyC._R as Float32Array)).toEqual(before);
    // ②跨度越界（x0+len > gW;span=[1, 0, 39, 2] → 41 > 40）
    anyC._wwApplyField({ fmt: 'delta', meta: new Uint32Array([1, 0, 39, 2]),
      data: new Uint8Array([192, 129, 200, 128]),
      gW: 40, gH: 24, progress: 9, intensity: 9, waveOff: [0, 0], cam: [0, 0, 1], scroll: [0, 0] });
    expect(sent.length).toBe(2);
    expect(Float32Array.from(anyC._R as Float32Array)).toEqual(before);   // 未半应用
    // ③合法手工 delta 精确落位（k/256 字节解码）
    anyC._wwApplyField({ fmt: 'delta', meta: new Uint32Array([1, 0, 0, 2]),
      data: new Uint8Array([192, 129, 200, 128]),
      gW: 40, gH: 24, progress: 9, intensity: 9, waveOff: [0, 0], cam: [0, 0, 1], scroll: [0, 0] });
    expect((anyC._R as Float32Array)[0]).toBe(192 / 256);
    expect((anyC._G as Float32Array)[0]).toBe(129 / 256);
    expect((anyC._R as Float32Array)[1]).toBe(200 / 256);
    expect((anyC._G as Float32Array)[1]).toBe(128 / 256);
  });

  it('量化不变式破坏 → f32 逃生 sticky（回滚口=R3-F2 前逐帧全量行为）', () => {
    const C = new WaterWaveSystem();
    anyP.frame(mkInp({}));
    feedAndVerify(C, anyP.exportFieldDelta(false));
    anyP.frame(mkInp({}));
    feedAndVerify(C, anyP.exportFieldDelta(false));
    anyP._R[7] = 0.50391;                                      // 非 k/256 值（不变式破坏）
    const m1 = anyP.exportFieldDelta(false);
    expect(m1.fmt).toBe('f32');
    feedAndVerify(C, m1);                                      // f32 全量仍逐位精确
    anyP._R[7] = 0.5;                                          // 恢复量化值
    const m2 = anyP.exportFieldDelta(false);
    expect(m2.fmt).toBe('f32');                                // sticky 不自动解除
    feedAndVerify(C, m2);
  });

  it('WaveWorker 源码锚:exportFieldDelta 出口/resync op/大跳判据/per-fmt transfer', () => {
    expect(WWK).toContain('waterWaves.exportFieldDelta(');
    expect(WWK).toContain("op: 'resync'");
    expect(WWK).toContain('wwCameraJumpForceFull(');
    expect(WWK).toContain('? [snap.meta.buffer, snap.data.buffer]');
    expect(WWK).toContain(': [snap.R.buffer, snap.G.buffer];');
    expect(WWK).toContain('detach 即弃');
    expect(WWK).toContain('forceFull = false');
    expect(WWK).toContain("forceFull = true;   // ★C8-D：换档");
  });
});
