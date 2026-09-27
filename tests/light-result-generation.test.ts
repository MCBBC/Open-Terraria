// ★R1b-1≡R2b-F7 光照 worker 结果世代校验（2026-09-27 红蓝批 β）。
// 定谳:LightWorkerLink.send 带 seq 但 onmessage/applyWorkerResult 从不比对——
// C9d 后 ensureRegion 不再修公共区域,传送大跳后本地全周期发布新区域 B;在途
// 旧快照 A 结果 1 worker 往返后到达 → applyWorkerResult 把公共对回拨到 A →
// 区域未变 dirty=false、live 早退门仅落 step() 慢速纠正 → lightAt 全域越界
// [0,0,0]=世界黑窗 1 worker 往返（忙机 33-66ms+）。
// 修复:结果携带其快照区域——仅当区域完整覆盖当前快照视口（内缩带,
// snapCoveredByPublic 同款数学）才接受;否则丢弃+cookieSkipped 指纹。
// 判别器:传送序列+旧结果晚到 → 旧码公共对回拨 A=lightAt 黑窗（红）/
// 新码丢弃旧结果公共对保持 B（绿）。
import { describe, expect, it } from 'vitest';
import { LightingEngine, type LightingWorld } from '../src/lighting/LightingEngine';
import { LightWorkerLink, lightWorkerStats, type LightTarget } from '../src/lighting/LightWorkerLink';
import type { LightResultMsg, TileSlicePack } from '../src/lighting/LightWorkerProtocol';
import { TileStore } from '../src/world/TileStore';

const VIEW_W = 60, VIEW_H = 40;

function makeWorld(): LightingWorld {
  return {
    store: new TileStore(400, 400),
    groundLevel: 30,
    lavaLine: 390,
    clock: { timeOfDay: 0.5, dayCount: 1 },
  };
}

/** 空 tile 切片（send 拦截后不需要真实切片） */
function emptySlice(): TileSlicePack {
  return {
    sx: 0, sy: 0, sw: 0, sh: 0, px: 0, py: 0,
    type: new Uint16Array(0), flags: new Uint8Array(0),
    frameX: new Uint16Array(0), frameY: new Uint16Array(0),
    wall: new Uint16Array(0), liquid: new Uint8Array(0), liquidType: new Uint8Array(0),
    half: new Uint8Array(0), slope: new Uint8Array(0), wire: new Uint8Array(0),
    paint: new Uint8Array(0), paintWall: new Uint8Array(0), coat: new Uint8Array(0),
    showInvisibleBlocks: false,
  };
}

/** 真 LightWorkerLink（不 send=不 spawn worker;send 拦截防 node spawn 尝试)+
 *  生产构造器同款接线（onResult→applyWorkerResult / pendingFilter→resultCoversViewport;
 *  node 下 lightWorkerFlag=false 引擎构造器不接线,此处逐字复刻） */
function makeEngine(): { e: LightingEngine; link: LightWorkerLink; target: LightTarget } {
  const e = new LightingEngine(makeWorld());
  const link = new LightWorkerLink();
  (link as unknown as { send: () => void }).send = () => { /* 拦截:node 无 Worker */ };
  (e as unknown as { _lw: unknown })._lw = link;
  const tgt = e as unknown as LightTarget;
  const eng = e as unknown as {
    applyWorkerResult(m: LightResultMsg): void;
    resultCoversViewport(m: LightResultMsg): boolean;
  };
  link.onResult = (m) => eng.applyWorkerResult(m);
  link.pendingFilter = (m) => eng.resultCoversViewport(m);
  return { e, link, target: tgt };
}

/** 区域 A 结果载荷（可辨识字节:全 200） */
function resultFor(rx: number, ry: number, rw: number, rh: number, v: number, seq = 0): LightResultMsg {
  const n = rw * rh;
  return { op: 'light', seq, rx, ry, rw, rh, R: new Uint8Array(n).fill(v), G: new Uint8Array(n).fill(v), B: new Uint8Array(n).fill(v) };
}

describe('R1b-1 ① 传送序列+旧结果晚到:公共对不回拨（红绿判别器）', () => {
  it('旧码回拨 A=黑窗;新码丢弃保持 B+skipped 指纹', () => {
    const { e, link, target } = makeEngine();
    // 建域 A:本地全周期发布（warmup 双跑兜底路径,dirty 强制）
    e.ensureRegion(100 * 16, 60 * 16, VIEW_W, VIEW_H);
    e.dirty = true;
    e.compute(0);
    expect(e.rw * e.rh).toBe(e.r.length);
    const beforeB = { rx: e.rx, ry: e.ry, rw: e.rw, rh: e.rh, arr: e.r };
    // 传送大跳（>28 padding 带）:本地全周期同帧发布 B
    e.ensureRegion(300 * 16, 60 * 16, VIEW_W, VIEW_H);
    e.dirty = true;
    e.compute(0);
    const afterB = { rx: e.rx, ry: e.ry, rw: e.rw, rh: e.rh, arr: e.r };
    expect(afterB.rx).not.toBe(beforeB.rx);   // 公共对已随本地发布迁到 B
    // 在途旧快照 A 结果晚到（1 worker 往返后）——旧码:回拨公共对到 A
    // → lightAt(B 视口) 全域 [0,0,0] 黑窗;新码:世代不符且不覆盖视口 → 丢弃
    const staleA = resultFor(beforeB.rx, beforeB.ry, beforeB.rw, beforeB.rh, 200, 0);
    link.onResult?.(staleA);
    expect(e.rx).toBe(afterB.rx);             // 绿:公共对保持 B
    expect(e.ry).toBe(afterB.ry);
    expect(e.r).toBe(afterB.arr);             // 数组引用未换=未回拨
    expect(e.rw * e.rh).toBe(e.r.length);     // 成对自洽
    expect(lightWorkerStats().skipped).toBe(1);
    // 传送落点亮源:lightAt 在新视口内非全黑（无黑窗）
    e.heldLight = { tx: 300, ty: 60, r: 1, g: 0.95, b: 0.8 };
    e.dirty = true;
    e.compute(0);
    expect(e.lightAt(300, 60)[0]).toBeGreaterThan(0);
    expect(target.rx).toBe(afterB.rx);
  });
});

describe('R1b-1 ② 新世代结果照常接受（校验不误杀）', () => {
  it('当前视口覆盖域的结果正常回填;正常移动 1 tick 滞后结果不丢', () => {
    const { e, link } = makeEngine();
    e.ensureRegion(100 * 16, 60 * 16, VIEW_W, VIEW_H);
    e.dirty = true;
    e.compute(0);
    const skipped0 = lightWorkerStats().skipped;
    const fresh = resultFor(e.rx - 2, e.ry - 2, e.rw + 4, e.rh + 4, 137, 1);   // 模拟上帧区域(移 2 格)+padding 外扩
    link.onResult?.(fresh);
    expect(e.r[0]).toBe(137);
    expect(lightWorkerStats().skipped).toBe(skipped0);   // 不误杀
  });
});

describe('R1b-1 ③ applyPending 兜底支同款校验', () => {
  it('pending 挂旧世代结果 → compute 拒回填', () => {
    const { e, link } = makeEngine();
    e.ensureRegion(100 * 16, 60 * 16, VIEW_W, VIEW_H);
    e.dirty = true;
    e.compute(0);
    e.ensureRegion(300 * 16, 60 * 16, VIEW_W, VIEW_H);
    e.dirty = true;
    e.compute(0);
    const keep = { rx: e.rx, ry: e.ry, arr: e.r };
    (link as unknown as { pending: LightResultMsg | null }).pending =
      resultFor(50, 30, 160, 120, 200, 0);   // 旧域 A
    e.compute(0);
    expect(e.rx).toBe(keep.rx);
    expect(e.r).toBe(keep.arr);
    expect(lightWorkerStats().skipped).toBeGreaterThanOrEqual(1);
  });
});
