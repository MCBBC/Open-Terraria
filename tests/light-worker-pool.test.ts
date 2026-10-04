// ★光照 transferable 遗留池化行为锁（2026-10-04;债 2/债 3 落地面）。
// 三判据:
//   ① 债3 结果数组池——引擎三原子写点的退役收口(仅 worker 产数组、仅引用替换点、
//      恰一次) + pubPool 发布面池取 + pending 生命周期门(活体禁退役/孤儿必退役)
//      + 队列容量/防御面。
//   ② 债2 delta scratch 池——编码器整块 scratch 所有权移交/回池轮转(同引用=零
//      重分配)+ metaLen/dataLen 载荷语义 ≡ 旧精确尺寸逐位等价 + 双 underrun 守卫
//      + escalate 契约。
//   ③ 编码器池账计数面。
// 位级输出等价不在本文件——worker 驱动路径 ≡ 本地路径由 tests/light-worker-parity
// 锁定(本文件所有改造点均为「内存所有权」面,计算路径零触碰)。
import { describe, it, expect } from 'vitest';
import { LightingEngine, type LightingWorld } from '../src/lighting/LightingEngine';
import { LightWorkerLink, lightWorkerStats } from '../src/lighting/LightWorkerLink';
import {
  LightDeltaEncoder, LightDeltaDecoder, sliceGeometry, allocSliceChannels,
  type LightResultMsg,
} from '../src/lighting/LightWorkerProtocol';
import { TileStore } from '../src/world/TileStore';

const W = 400, H = 400;

function makeWorld(): LightingWorld {
  return {
    store: new TileStore(W, H),
    groundLevel: 30,
    lavaLine: 390,
    clock: { timeOfDay: 0.5, dayCount: 1 },
  };
}

/** 结果载荷（可辨识字节填充） */
function resultFor(rx: number, ry: number, rw: number, rh: number, v: number, seq = 0): LightResultMsg {
  const n = rw * rh;
  return { op: 'light', seq, rx, ry, rw, rh, R: new Uint8Array(n).fill(v), G: new Uint8Array(n).fill(v), B: new Uint8Array(n).fill(v) };
}

/** 真引擎+真 link 生产同款接线（send 拦截——node 无 Worker） */
function makeEngineWithLink(): { e: LightingEngine; link: LightWorkerLink } {
  const e = new LightingEngine(makeWorld());
  const link = new LightWorkerLink();
  (link as unknown as { send: () => void }).send = () => { /* 拦截 */ };
  (e as unknown as { _lw: unknown })._lw = link;
  link.pendingFilter = (m) => (e as unknown as { resultCoversViewport(m: LightResultMsg): boolean }).resultCoversViewport(m);
  link.onResult = (m) => (e as unknown as { applyWorkerResult(m: LightResultMsg): void }).applyWorkerResult(m);
  return { e, link };
}

interface ResultTripleView { R: Uint8Array; G: Uint8Array; B: Uint8Array }
const retiredOf = (link: LightWorkerLink): ResultTripleView[] =>
  (link as unknown as { _retired: ResultTripleView[] })._retired;

describe('债3 ① 结果数组退役收口（引擎三写点）', () => {
  it('onResult 应用:worker 数组成公共面;旧=本地 pubR 不退役', () => {
    const { e, link } = makeEngineWithLink();
    e.ensureRegion(100 * 16, 60 * 16, 60, 40);
    e.dirty = true;
    e.compute(0);                                  // 本地发布（flag=false,数组=pubR）
    const m1 = resultFor(e.rx, e.ry, e.rw, e.rh, 200, 1);
    link.onResult?.(m1);
    expect(e.r).toBe(m1.R);                        // worker 数组成公共面
    expect(retiredOf(link).length).toBe(0);        // 本地 pubR 复用面——禁回送
  });

  it('二次结果替换:被替换 worker 数组恰一次入队;同引用 re-apply 不重复退役', () => {
    const { e, link } = makeEngineWithLink();
    e.ensureRegion(100 * 16, 60 * 16, 60, 40);
    e.dirty = true;
    e.compute(0);
    const m1 = resultFor(e.rx, e.ry, e.rw, e.rh, 200, 1);
    link.onResult?.(m1);
    const m2 = resultFor(e.rx, e.ry, e.rw, e.rh, 137, 2);
    link.onResult?.(m2);
    expect(e.r).toBe(m2.R);
    expect(retiredOf(link).length).toBe(1);
    expect(retiredOf(link)[0].R).toBe(m1.R);       // m1 退役
    // 同引用 re-apply（applyPending 兜底支常态）:!== 守卫 → 不退役
    (e as unknown as { applyWorkerResult(m: LightResultMsg): void }).applyWorkerResult(m2);
    expect(retiredOf(link).length).toBe(1);
  });

  it('世代校验拒绝:被丢数组不入引擎退役面（link pending 生命周期管辖区）', () => {
    const { e, link } = makeEngineWithLink();
    e.ensureRegion(100 * 16, 60 * 16, 60, 40);
    e.dirty = true;
    e.compute(0);
    const n0 = lightWorkerStats().skipped;
    const stale = resultFor(10, 10, 40, 30, 200, 0);   // 远域（不覆盖视口 → 世代拒绝）
    link.onResult?.(stale);
    expect(lightWorkerStats().skipped).toBe(n0 + 1);
    expect(e.r.byteLength).toBeGreaterThan(0);      // 公共对不回拨
    expect(retiredOf(link).length).toBe(0);         // 引擎不碰——link 覆写/拒绝点退役
  });

  it('本地发布替换 worker 数组（传送大跳兜底）:worker 数组退役', () => {
    const { e, link } = makeEngineWithLink();
    e.ensureRegion(100 * 16, 60 * 16, 60, 40);
    e.dirty = true;
    e.compute(0);
    const m1 = resultFor(e.rx, e.ry, e.rw, e.rh, 200, 1);
    link.onResult?.(m1);
    expect(e.r).toBe(m1.R);
    // 传送大跳:快照面跳出公共域覆盖 → 本地全周期同帧兜底
    e.ensureRegion(300 * 16, 60 * 16, 60, 40);
    e.heldLight = { tx: 300, ty: 60, r: 1, g: 0.95, b: 0.8 };
    e.dirty = true;
    e.compute(0);
    expect(e.lightAt(300, 60)[0]).toBeGreaterThan(0);   // 本地新鲜光
    expect(e.r).not.toBe(m1.R);                          // 本地 pubR 接管
    expect(retiredOf(link).length).toBe(1);
    expect(retiredOf(link)[0].R).toBe(m1.R);             // 被替换 worker 数组退役
  });
});

describe('债3 ② pending 生命周期门（arriveResult 驱动）', () => {
  it('覆写未应用 pending → 孤儿退役;覆写已应用 pending → 禁碰（公共面活体）', () => {
    const link = new LightWorkerLink();
    const m1 = resultFor(0, 0, 40, 30, 100, 1);
    const m2 = resultFor(0, 0, 40, 30, 110, 2);
    const m3 = resultFor(0, 0, 40, 30, 120, 3);
    const m4 = resultFor(0, 0, 40, 30, 130, 4);
    const arr = link as unknown as {
      arriveResult(m: LightResultMsg): void;
      pending: LightResultMsg | null;
      pendingApplied: boolean;
    };
    arr.arriveResult(m1);                       // pending=null → pending=m1(未应用)
    expect(arr.pendingApplied).toBe(false);
    arr.arriveResult(m2);                       // 覆写:m1 孤儿 → 退役
    expect(retiredOf(link).length).toBe(1);
    expect(retiredOf(link)[0].R).toBe(m1.R);
    // 已应用门:pending=m3 且 pendingApplied → 覆写不退役
    arr.pending = m3;
    arr.pendingApplied = true;
    arr.arriveResult(m4);
    expect(retiredOf(link).length).toBe(1);     // m3 = 公共面活体,禁退役
  });

  it('applyPending 兜底拒绝:未应用 → 退役;已应用（防御面）→ 禁碰', () => {
    const { e, link } = makeEngineWithLink();
    e.ensureRegion(100 * 16, 60 * 16, 60, 40);
    e.dirty = true;
    e.compute(0);
    e.ensureRegion(300 * 16, 60 * 16, 60, 40);
    e.dirty = true;
    e.compute(0);                               // 公共对在 B（本地）
    const keep = e.r;
    const arr = link as unknown as { pending: LightResultMsg | null; pendingApplied: boolean };
    // 未应用 pending + 世代校验拒绝 → 退役
    const stale = resultFor(50, 30, 160, 120, 200, 0);
    arr.pending = stale;
    arr.pendingApplied = false;
    e.compute(0);
    expect(e.r).toBe(keep);                     // 公共对不动
    expect(retiredOf(link).length).toBe(1);
    expect(retiredOf(link)[0].R).toBe(stale.R);
    // 已应用（防御面守卫——覆盖校验 1 tick 翻转需 >26 格/tick,常态不可达）→ 禁碰
    const stale2 = resultFor(50, 30, 160, 120, 90, 5);
    arr.pending = stale2;
    arr.pendingApplied = true;
    e.compute(0);
    expect(retiredOf(link).length).toBe(1);     // 不入队
    expect(lightWorkerStats().skipped).toBeGreaterThanOrEqual(2);
  });
});

describe('债3 ③ 队列容量/防御面 + pubPool 发布面池取', () => {
  it('退役队列深度 8 封顶（溢出 retDropped）;零长拒收', () => {
    const link = new LightWorkerLink();
    const d0 = lightWorkerStats().retDropped;
    for (let i = 0; i < 10; i++) link.retireResult(new Uint8Array(4).fill(i), new Uint8Array(4), new Uint8Array(4));
    expect(retiredOf(link).length).toBe(8);
    expect(lightWorkerStats().retDropped - d0).toBe(2);
    const before = retiredOf(link).length;
    link.retireResult(new Uint8Array(0), new Uint8Array(4), new Uint8Array(4));
    link.retireResult(new Uint8Array(4), new Uint8Array(0), new Uint8Array(4));
    expect(retiredOf(link).length).toBe(before);
  });

  it('pubPool 池取:发布面尺寸失配先池取（同引用）;池空/失配新分配', () => {
    const e = new LightingEngine(makeWorld());
    const pooled: [Uint8Array, Uint8Array, Uint8Array] = [new Uint8Array(2400).fill(7), new Uint8Array(2400).fill(7), new Uint8Array(2400).fill(7)];
    e.pubPool = (need) => (need === 2400 ? pooled : null);
    e.setSnapshotRegion(100, 20, 60, 40);        // need=2400（天空域有光）
    e.dirty = true;
    e.compute(0);
    expect(e.r).toBe(pooled[0]);                 // 发布面=池数组（同引用）
    expect(e.lightAt(100, 25)[0]).toBeGreaterThan(0);   // 内容已写入池数组
    // 尺寸变化 → 池失配 → 新分配
    e.setSnapshotRegion(100, 20, 50, 40);        // need=2000
    e.dirty = true;
    e.compute(0);
    expect(e.r).not.toBe(pooled[0]);
    expect(e.r.length).toBe(2000);
  });
});

// ---- 债2 delta scratch 池 ----

const emptySt = (w: number, h: number) => ({
  w, h, type: new Uint16Array(0), flags: new Uint8Array(0), frameX: new Uint16Array(0), frameY: new Uint16Array(0),
  wall: new Uint16Array(0), liquid: new Uint8Array(0), liquidType: new Uint8Array(0),
  half: new Uint8Array(0), slope: new Uint8Array(0), wire: new Uint8Array(0),
  paint: new Uint8Array(0), paintWall: new Uint8Array(0), coat: new Uint8Array(0),
});

describe('债2 ④ delta scratch 池（编码器所有权移交/回池轮转）', () => {
  it('静置空 delta:metaLen=1/dataLen=0;回池后下帧同引用（零重分配）', () => {
    const enc = new LightDeltaEncoder();
    // 影子几何 = 本帧窗（重叠=全窗 → 暴露带空 + 日志空 = 空 delta）
    enc.adoptFull({ ...allocSliceChannels(40, 40), sx: 0, sy: 0 });
    const st = emptySt(48, 40);
    const g = sliceGeometry({ w: 48, h: 40, showInvisibleBlocks: false }, 10, 10, 14, 14);
    expect(g.sw).toBe(40); expect(g.sh).toBe(40);
    const out1 = enc.encodeDelta(st as never, g, []);
    expect(out1.metaLen).toBe(1);
    expect(out1.dataLen).toBe(0);
    expect(out1.meta[0]).toBe(0);
    expect(out1.meta.length).toBeGreaterThan(1);        // 整块 scratch（非 slice 精确尺寸）
    enc.retireDelta(out1.meta, out1.data);
    const out2 = enc.encodeDelta(st as never, g, []);
    expect(out2.meta).toBe(out1.meta);                  // 池取=同引用
    expect(out2.data).toBe(out1.data);
    // 不回池 → 新分配（所有权移交后 scratch=EMPTY,grow 分支兜底）
    const out3 = enc.encodeDelta(st as never, g, []);
    expect(out3.meta).not.toBe(out2.meta);
    expect(out3.metaLen).toBe(1);
  });

  it('metaLen/dataLen 载荷 ≡ 旧精确尺寸路径（重建逐位等价）', () => {
    const st = new TileStore(48, 40);
    const log: number[] = [];
    st.tileWriteLog = log;
    for (let x = 0; x < 48; x++) st.setTile(x, 20, 1);
    const link = new LightWorkerLink();
    const enc = new LightDeltaEncoder();
    const full0 = link.buildSlice(st, 14, 12, 20, 14);
    enc.adoptFull(full0);
    log.length = 0;
    const g = sliceGeometry(st, 14, 12, 20, 14);
    st.setTile(21, 15, 5); st.setWall(25, 18, 9);
    const out = enc.encodeDelta(st, g, log);
    log.length = 0;
    expect(out.metaLen * 4 + out.dataLen).toBeGreaterThan(0);
    // 路径 A:整块 scratch + 长度通道（生产协议）
    const decA = new LightDeltaDecoder();
    decA.decode({ op: 'frame', seq: 0, enc: 'full', rx: 0, ry: 0, rw: 0, rh: 0, tiles: full0 } as never);
    const a = decA.decode({ op: 'frame', seq: 1, enc: 'delta', rx: 0, ry: 0, rw: 0, rh: 0,
      tiles: g, delta: { dv: 1, meta: out.meta, data: out.data, metaLen: out.metaLen, dataLen: out.dataLen } } as never);
    // 路径 B:精确尺寸切片 + 旧无长度构造（兼容面）
    const decB = new LightDeltaDecoder();
    decB.decode({ op: 'frame', seq: 0, enc: 'full', rx: 0, ry: 0, rw: 0, rh: 0, tiles: full0 } as never);
    const b = decB.decode({ op: 'frame', seq: 1, enc: 'delta', rx: 0, ry: 0, rw: 0, rh: 0,
      tiles: g, delta: { dv: 1, meta: out.meta.slice(0, out.metaLen), data: out.data.slice(0, out.dataLen) } } as never);
    // 逐位等价
    for (const k of ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      const va = a[k], vb = b[k];
      expect(vb.length).toBe(va.length);
      for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) throw new Error(`${k}[${i}] 分歧: len通道=${va[i]} 精确=${vb[i]}`);
    }
  });

  it('双 underrun 守卫:dataLen 短计/meta 短计 → throw（防御面不静默腐蚀）', () => {
    const st = new TileStore(48, 40);
    const log: number[] = [];
    st.tileWriteLog = log;
    for (let x = 0; x < 48; x++) st.setTile(x, 20, 1);
    const link = new LightWorkerLink();
    const enc = new LightDeltaEncoder();
    enc.adoptFull(link.buildSlice(st, 14, 12, 20, 14));
    log.length = 0;
    const g = sliceGeometry(st, 14, 12, 20, 14);
    st.setTile(21, 15, 5);
    const out = enc.encodeDelta(st, g, log);
    log.length = 0;
    expect(out.dataLen).toBeGreaterThan(0);
    const dec = new LightDeltaDecoder();
    dec.decode({ op: 'frame', seq: 0, enc: 'full', rx: 0, ry: 0, rw: 0, rh: 0, tiles: link.buildSlice(st, 14, 12, 20, 14) } as never);
    // dataLen 短计
    expect(() => dec.decode({ op: 'frame', seq: 1, enc: 'delta', rx: 0, ry: 0, rw: 0, rh: 0,
      tiles: g, delta: { dv: 1, meta: out.meta, data: out.data, metaLen: out.metaLen, dataLen: out.dataLen - 1 } } as never)).toThrow(/underrun/);
    // meta 短计（spans 声称 > (metaLen-1)/3）
    expect(() => dec.decode({ op: 'frame', seq: 2, enc: 'delta', rx: 0, ry: 0, rw: 0, rh: 0,
      tiles: g, delta: { dv: 1, meta: out.meta, data: out.data, metaLen: 1, dataLen: out.dataLen } } as never)).toThrow(/meta underrun/);
  });

  it('escalateFull 契约:零长载荷 + forceFull（plan 立即全量）', () => {
    const enc = new LightDeltaEncoder();
    enc.adoptFull({ ...allocSliceChannels(40, 30), sx: 10, sy: 10 });
    const esc = (enc as unknown as { escalateFull(): { meta: Uint32Array; data: Uint8Array; metaLen: number; dataLen: number } }).escalateFull();
    expect(esc.meta.length).toBe(0);
    expect(esc.dataLen).toBe(0);
    expect(enc.planFull({ sx: 10, sy: 10, sw: 40, sh: 30 }, 0, false)).toBe(true);   // forceFull
  });
});

describe('债2 ⑤ 编码器池账计数', () => {
  it('初始 scratch 足够=无池取;移交后池空=miss;回池=hit（同引用闭环证据）', () => {
    const enc = new LightDeltaEncoder();
    enc.adoptFull({ ...allocSliceChannels(40, 40), sx: 0, sy: 0 });
    const st = emptySt(48, 40);
    const g = sliceGeometry({ w: 48, h: 40, showInvisibleBlocks: false }, 10, 10, 14, 14);
    const out1 = enc.encodeDelta(st as never, g, []);       // 初始 scratch 容量足够 → 无池取
    expect(enc.poolMisses).toBe(0);
    expect(enc.poolHits).toBe(0);
    enc.retireDelta(out1.meta, out1.data);
    const out2 = enc.encodeDelta(st as never, g, []);       // 上帧移交（scratch=EMPTY）→ 池取命中
    expect(enc.poolHits).toBe(1);
    expect(out2.meta).toBe(out1.meta);
    const out3 = enc.encodeDelta(st as never, g, []);       // 未回池 → miss + 新分配
    expect(enc.poolMisses).toBe(1);
    expect(out3.meta).not.toBe(out2.meta);
  });
});
