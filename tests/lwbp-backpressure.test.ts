// ★lwbp backpressure 验证网（2026-10-11,任务#15 刀②;Windows Trace-225221 postMessage
// self 1522ms vs Mac 231ms=每 op IPC 税,qs-mac-control-face 判例族）。
// 覆盖面：
//  ① light link 在飞门算术（sendReady=outstanding<1;worker 未建链恒放行;旗关恒放行）
//  ② 回执冲账（arriveResult ++ / error 冲账语义在 sendReady 翻转可见）
//  ③ wave 在飞门（跳发不排空注入批/dt 累积保真/bpSkips 对账/回落复位）
// 恒发现状（?lwbp=0/?wwbp=0 逃生门）=旗关 sendReady 恒 true——同断言面。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LightingEngine, type LightingWorld } from '../src/lighting/LightingEngine';
import { LightWorkerLink, setLwbpEnabled, lightWorkerStats } from '../src/lighting/LightWorkerLink';
import type { LightResultMsg } from '../src/lighting/LightWorkerProtocol';
import { TileStore } from '../src/world/TileStore';
import { waterWaves, setWaveTextures, setWwBpEnabled, wwWorkerStats } from '../src/render/WaterWaves';

const W = 400, H = 400;
function makeWorld(): LightingWorld {
  return {
    store: new TileStore(W, H),
    groundLevel: 30,
    lavaLine: 390,
    clock: { timeOfDay: 0.5, dayCount: 1 },
  };
}
function resultFor(rx: number, ry: number, rw: number, rh: number, v: number, seq = 0): LightResultMsg {
  const n = rw * rh;
  return { op: 'light', seq, rx, ry, rw, rh, R: new Uint8Array(n).fill(v), G: new Uint8Array(n).fill(v), B: new Uint8Array(n).fill(v) };
}

afterEach(() => {
  setLwbpEnabled(false);   // node 域缺省;各测显式开
  setWwBpEnabled(false);
});

describe('lwbp light link 在飞门', () => {
  it('worker 未建链（首帧前）恒放行', () => {
    setLwbpEnabled(true);
    const link = new LightWorkerLink();
    expect(link.sendReady()).toBe(true);
  });
  it('outstanding 算术:回执未达=不放行,回达冲账=放行', () => {
    setLwbpEnabled(true);
    const link = new LightWorkerLink();
    const lk = link as unknown as { worker: unknown; seq: number; _doneCount: number; arriveResult(m: LightResultMsg): void };
    lk.worker = { postMessage: () => {} };        // 拟建链（node 无 Worker,只探算术）
    lk.seq = 3; lk._doneCount = 3;
    expect(link.sendReady()).toBe(true);          // 无在飞
    lk.seq = 4;                                   // 模拟已 send 一帧（在飞 1）
    expect(link.sendReady()).toBe(false);         // 回执未达=不放行
    lk.arriveResult(resultFor(0, 0, 8, 8, 128, 4));   // 回达冲账
    expect(link.sendReady()).toBe(true);
  });
  it('旗关恒放行（?lwbp=0 现状逐位）', () => {
    setLwbpEnabled(false);
    const link = new LightWorkerLink();
    const lk = link as unknown as { worker: unknown; seq: number; _doneCount: number };
    lk.worker = { postMessage: () => {} };
    lk.seq = 9; lk._doneCount = 0;                // 极端欠账
    expect(link.sendReady()).toBe(true);
  });
  it('引擎接线:warmup 恒发/live 在飞跳发且 dirty 保留+点光照清（真引擎+拦截 send）', () => {
    setLwbpEnabled(true);
    const e = new LightingEngine(makeWorld());
    const link = new LightWorkerLink();
    let sends = 0;
    (link as unknown as { send: () => void }).send = () => { sends++; };
    (e as unknown as { _lw: unknown })._lw = link;
    link.pendingFilter = () => true;
    link.onResult = () => {};
    const eV = e as unknown as { lwLive: boolean; compute(): void; rx: number; ry: number; rw: number; rh: number; dirty: boolean; perFrame: unknown[]; addLight(x: number, y: number, r: number, g: number, b: number): void };
    e.setSnapshotRegion(100, 100, 200, 160);
    eV.rx = 100; eV.ry = 100; eV.rw = 300; eV.rh = 300;   // 公共域覆盖快照视口（早退门前提）
    // warmup（非 live）:恒发（建链前提,sendReady 真值无关）
    eV.lwLive = false;
    eV.compute();
    expect(sends).toBe(1);
    // live+在飞:跳发;dirty 保留（下次实发消费）;点光=重注册面照清（防叠加双亮）
    eV.lwLive = true;
    const lk = link as unknown as { worker: unknown; seq: number; _doneCount: number };
    lk.worker = { postMessage: () => {} };
    lk.seq = 50; lk._doneCount = 49;                      // 在飞 1
    eV.addLight(150, 150, 1, 0.9, 0.7);                   // 点光注册（自带 dirty=true）
    eV.compute();
    expect(sends).toBe(1);                                // 跳发
    expect(eV.dirty).toBe(true);                          // 跳发帧 dirty 保留
    expect(eV.perFrame.length).toBe(0);                   // 点光照清（防重注册叠加双亮）
    expect(lightWorkerStats().bpSkips).toBeGreaterThanOrEqual(1);
    // 回执冲账后实发:dirty 消费（send 内 _log 清+covered 支 dirty=false）
    lk._doneCount = 50;
    eV.compute();
    expect(sends).toBe(2);
    expect(eV.dirty).toBe(false);
  });
});

// ---- wave 在飞门 ----
const frameInp = {
  camX: 0, camY: 0, zoom: 1, viewW: 400, viewH: 400,
  tileX: 1050, tileY: 100, maxTilesX: 2100, maxTilesY: 700,
  worldSurface: 110, rockLayer: 190, windAbs: 0, rain: 0, dt: 1 / 60,
};
function armWorkerModeLive(): { posted: Array<{ op: string; inp?: { dt: number }; inj?: Array<{ k: string }> }> } {
  const ws = waterWaves as unknown as Record<string, unknown>;
  const posted: Array<{ op: string; inp?: { dt: number }; inj?: Array<{ k: string }> }> = [];
  ws._ww = { terminate: vi.fn(), postMessage: (m: unknown) => posted.push(m as typeof posted[number]) };
  ws._wwOn = true;
  ws._wwSpawned = true;
  ws._wwShadow = false;
  ws._wwErrored = false;
  ws._wwWd = { healthy: () => true, onSend: () => {}, onResult: () => {}, fallReason: () => 'no-result-dead' };
  ws._wwTexSent = true;
  ws._wwQuietRun = 0; ws._wwQuietFrames = 0;    // 活动场（非静默）
  ws._wwQuietVW = -1; ws._wwQuietVH = -1;
  ws._wwInFlight = 0; ws._wwPendingDt = 0;
  ws._wwCapture = [] as unknown[];
  return { posted };
}

describe('lwbp wave 在飞门', () => {
  beforeEach(() => {
    waterWaves.resetForTest();
    waterWaves.setQuality(3);
    const noise = new Uint8ClampedArray(256 * 256 * 4).fill(128);
    const ripple = new Uint8ClampedArray(64 * 128 * 4).fill(255);
    setWaveTextures({ w: 256, h: 256, data: noise }, { data: ripple });
  });
  afterEach(() => { setWwBpEnabled(false); });

  it('在飞未回=跳发:dt 累积+bpSkips 对账（注入批经帧3随行观测）', () => {
    setWwBpEnabled(true);
    const { posted } = armWorkerModeLive();
    waterWaves.frame(frameInp);                          // 帧1:实发（并武装模块注入批）
    expect(posted.length).toBe(1);
    const ws = waterWaves as unknown as Record<string, unknown>;
    expect(ws._wwInFlight).toBe(1);
    const skipBefore = wwWorkerStats().bpSkips;
    waterWaves.injectWash(100, 100, 40, 40, 0.5, 0.5, 1);  // 实体注入（帧1 已武装 capture 批）
    waterWaves.frame({ ...frameInp });                   // 帧2:在飞=跳发
    expect(posted.length).toBe(1);                       // 未发
    expect(ws._wwPendingDt).toBeCloseTo(1 / 60, 10);     // dt 累积
    expect(wwWorkerStats().bpSkips).toBe(skipBefore + 1);
  });
  it('回执到达后实发:累积 dt 并入+注入批随行（步进总时间保真）', () => {
    setWwBpEnabled(true);
    const { posted } = armWorkerModeLive();
    waterWaves.frame(frameInp);
    waterWaves.injectWash(100, 100, 40, 40, 0.5, 0.5, 1);
    waterWaves.frame({ ...frameInp });                   // 跳发
    const ws = waterWaves as unknown as Record<string, unknown>;
    ws._wwInFlight = 0;                                  // 模拟 field 回执冲账（真实递减在 onmessage 闭包内,假 worker 不接线）
    waterWaves.frame({ ...frameInp });                   // 帧3:实发
    expect(posted.length).toBe(2);
    const m = posted[1];
    expect(m.op).toBe('frame');
    expect(m.inp!.dt).toBeCloseTo(2 / 60, 10);           // 累积 dt 并入=worker 步进总时间不缩水
    expect(m.inj!.length).toBe(1);                       // 注入批随行（跳发帧未排空=零丢失）
    expect(m.inj![0].k).toBe('wash');
    expect(ws._wwPendingDt).toBe(0);
  });
  it('旗关恒发（?wwbp=0 现状逐位:在飞不拦）', () => {
    setWwBpEnabled(false);
    const { posted } = armWorkerModeLive();
    waterWaves.frame(frameInp);
    waterWaves.frame({ ...frameInp });
    expect(posted.length).toBe(2);                       // 逐帧发,无门
    const ws = waterWaves as unknown as Record<string, unknown>;
    expect(ws._wwInFlight).toBe(2);                      // 在飞照记（旗关只拦不发跳发;回执冲账闭环不变）
  });
  it('看门狗回落:在飞账/dt 残留复位（防死链饿死+下世界死锁面）', () => {
    setWwBpEnabled(true);
    const ws = waterWaves as unknown as Record<string, unknown>;
    const { posted } = armWorkerModeLive();
    waterWaves.frame(frameInp);
    (ws._wwWd as { healthy: () => boolean }).healthy = () => false;   // 失联定谳
    waterWaves.frame({ ...frameInp });                   // 回落分支
    expect(ws._wwOn).toBe(false);                        // 本地模拟接管
    expect(ws._wwInFlight).toBe(0);
    expect(ws._wwPendingDt).toBe(0);
    expect(posted.length).toBe(1);                       // 回落帧不再发
  });
});
