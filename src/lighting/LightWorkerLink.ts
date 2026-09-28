// ★C9 光照引擎 Worker 化·主线程门面（2026-09-23;?lightworker=1 缺省关）。
// 承 C8 WaveWorker 模式：URL 参数旗（本旗缺省关,=1 显式启用）、new Worker(module)
// 导入模块本体、失联看门狗 2s terminate+回落、onerror 日志。
// 职责：
//   · buildSlice——扫描区域 ± SNAPSHOT_PAD 的 13 通道 tile 切片（行主序逐行 memcpy,
//     世界边界钳制;钳后余量 (px,py) 随包带走=worker 侧 InWorld 折叠精确性依赖,见协议头注）
//   · send——快照 postMessage（结构克隆;每帧全量,v1 不做脏标优化）
//   · applyPending——worker 结果回填引擎公共面（r/g/b 数组引用替换 + 区域回填;
//     引擎在 compute 内调用=渲染读 (区域,数组) 恒成对一致,1 帧滞后）
//   · healthy——outstanding-aware 看门狗（2026-09-28 治理重构:warmup 15s/稳态 2s
//     预算+双拍确认闩+onerror 硬证据直杀;引擎 dispose+阶梯重生,不再永久回落）
// 三态：warmup（结果未达:快照+本地双跑=首帧不黑屏）→ live（worker only）→
// fallback（_lw 置 null,本地照常,dirty 强制全周期;阶梯到期重生重建链路）。
import {
  SNAPSHOT_PAD, TILE_CHAN_KEYS, TILE_CHAN_BYTES_PER_CELL, LIGHT_DELTA_VERSION,
  LightDeltaEncoder, sliceGeometry, allocSliceChannels,
  type LightPoolMsg, type LightResyncMsg, type LightResultMsg, type LightSnapshotMsg, type TileSlicePack,
} from './LightWorkerProtocol';
import { WorkerWatchdog, newFallsBy, type WorkerFallReason } from '../workers/WorkerGovernance';
import type { TileStore } from '../world/TileStore';

/** ★C9 转正（2026-09-24）：缺省开——逐字节对拍三场景全等+浏览器探针 1:1 零丢包
 *  +133 守卫绿后转正。?lightworker=0 = 逃生门（回主线程光照引擎）。
 *  ★C8 fork bomb 范畴禁令：document 存在性判定——worker 上下文恒 false（worker 里
 *  旗若为 true 会让镜像引擎的 compute 再 spawn 同脚本子 worker=每帧消息沿链 spawn） */
export const lightWorkerFlag = (() => {
  try {
    return typeof document !== 'undefined' && new URLSearchParams(location.search).get('lightworker') !== '0';
  } catch { return true; }
})();

/** ★C9d2 二期快照差量化（2026-09-28）：★转正（2026-09-29 用户拍板）缺省开——
 *  位等价证据（11 帧演化场景 worker 重建切片≡fresh buildSlice 13 通道逐位+光照输出
 *  逐位）+快照 24.4MB/s→0.6MB/s（41×）+主线程残部 200µs→~0.01ms。?lightdelta=0=
 *  逃生门（回全量切片 transferable 链,Layer 1 仍生效）。仅 lightworker 开时有消费方;
 *  旗关时引擎无链路,本旗无效果。关:全量切片 transferable+回池（Layer 1）;
 *  开:差量帧免 416KB 切片（写日志+暴露带编码,全量锚帧结构克隆留影子）。
 *  设计/判据链见 LightWorkerProtocol「C9 二期」段与探针 _c9d2-light-residual-probe。
 *  node/worker 上下文恒关（document 判死,fork bomb 判例家族）。 */
export const lightDeltaFlag = (() => {
  try {
    if (typeof document === 'undefined') return false;
    return new URLSearchParams(location.search).get('lightdelta') !== '0';
  } catch { return false; }
})();

/** 引擎公共面回填目标（结构最小面,避免与 LightingEngine 运行时互相导入） */
export interface LightTarget {
  rx: number; ry: number; rw: number; rh: number;
  r: Uint8Array; g: Uint8Array; b: Uint8Array;
}

/** C9 诊断计数器（探针对账:posted(快照发出)/results(回达)/falls(看门狗回落)/
 *  lagMs(最近一次结果 send→apply 端到端延迟,含 worker 计算+主线程消息调度)。
 *  ★R1b-1≡R2b-F7 增 skipped=世代校验丢弃的晚到旧结果数（传送大跳在途旧世代,
 *  校验判据在引擎 resultCoversViewport——计数器收口在本模块诊断面）。纯读面。
 *  ★C9d2 二期增:tileBytes=tile 载荷累计字节（全量=17B/格×格数,delta=meta+data;
 *  探针/验收② MB/s 口径）、fmt.full/fmt.delta=两形态计数、poolHits/poolMisses=
 *  切片池命中/未命中（Layer 1 分配面收口对账）、resyncs=worker 重锚请求数。
 *  ★看门狗治理（2026-09-28）增:fallsBy=回落指纹三分类(onerror/no-result-dead/
 *  pickup-timeout)、respawns=阶梯重生执行次数（引擎重生分派时登记;F5 驾驶舱扩展）。 */
const lwStat = { posted: 0, results: 0, falls: 0, lagMs: 0, skipped: 0,
  tileBytes: 0, fmt: { full: 0, delta: 0 }, poolHits: 0, poolMisses: 0, resyncs: 0,
  lastFullReason: 'off' as string,
  fallsBy: newFallsBy(), respawns: 0 };
/** ★R1b-1:引擎侧世代校验丢弃一个晚到结果时登记（探针/F5 对账面） */
export function noteLightResultSkipped(): void { lwStat.skipped++; }
/** ★看门狗治理:引擎阶梯重生分派时登记（F5 respawns 消费面） */
export function noteLightWorkerRespawn(): void { lwStat.respawns++; }
export function lightWorkerStats(): { on: boolean; posted: number; results: number; falls: number; lagMs: number; skipped: number;
  tileBytes: number; fmt: { full: number; delta: number }; poolHits: number; poolMisses: number; resyncs: number;
  lastFullReason: string;
  fallsBy: Record<WorkerFallReason, number>; respawns: number } {
  return { on: lightWorkerFlag, ...lwStat, fmt: { ...lwStat.fmt }, fallsBy: { ...lwStat.fallsBy } };
}

export class LightWorkerLink {
  private worker: Worker | null = null;
  private startedAt = 0;
  private lastResultAt = 0;
  private results = 0;
  private errored = false;
  private dead = false;
  private pending: LightResultMsg | null = null;
  private seq = 0;
  private lastSentAt = 0;
  /** ★看门狗治理（2026-09-28）:outstanding-aware 心跳（旧「2s 无回传即杀」的墙钟
   *  判据退役——主线程忙/暂停/隐藏期与开局冷模块图取曾被整段误杀;trace 定谳见
   *  WorkerGovernance 头注）。每实例一个,回落即弃（重生换全新 link=全新 watchdog）。 */
  private readonly wd = new WorkerWatchdog();
  private fallen = false;
  // ---- ★C9d2 二期（Layer 1 池化+transferable / Layer 2 灰度差量） ----
  /** 绑定世界 store（引擎构造期注入）:写日志挂载+delta 帧世界真值直读 */
  private _st: TileStore | null = null;
  /** 写日志（挂到 store.tileWriteLog;send 时消费并清空） */
  private readonly _log: number[] = [];
  /** 差量编码器（仅灰度模式创建;构造器注入面=单测驱动 link 差量路径） */
  private readonly _enc: LightDeltaEncoder | null;
  constructor(enc: LightDeltaEncoder | null = lightDeltaFlag ? new LightDeltaEncoder() : null) {
    this._enc = enc;
  }
  /** 切片通道池（Layer 1:全量帧 transfer 走后由 worker 回池复用;深度 4 封顶） */
  private _pool: TileSlicePack[] = [];
  /** 最近一次 buildWorkerTiles 的区域（escalate 防御面回退全量时复用） */
  private _lastReg = { rx: 0, ry: 0, rw: 0, rh: 0 };
  /** 引擎内容脏门（引擎注入:dirty∨liquidDirty 且非移动脏——未记账直写面兜底全量） */
  contentDirtyGate: (() => boolean) | null = null;

  /** 引擎构造期绑定 store:灰度模式挂写日志（tileWriteLog=本日志数组引用;
   *  原语写面零分配推送）。dispose 时摘除。 */
  bindStore(st: TileStore): void {
    this._st = st;
    if (this._enc) st.tileWriteLog = this._log;
  }

  /** ★C9d2 引擎切片入口（buildWorkerSnapshot 专用）:灰度 delta 帧免 416KB 切片
   *  （返回仅几何字段包,通道零长）;全量帧走 buildSlice（池化）。 */
  buildWorkerTiles(rx: number, ry: number, rw: number, rh: number): TileSlicePack {
    this._lastReg = { rx, ry, rw, rh };
    const st = this._st;
    if (st === null) {
      // 防御面（bindStore 前无消费方;不可能路径）——零尺寸几何帧,worker 侧空扫
      return sliceGeometry({ w: 0, h: 0, showInvisibleBlocks: false }, rx, ry, rw, rh);
    }
    const reg = sliceGeometry(st, rx, ry, rw, rh);
    if (this._enc !== null) {
      const contentDirty = this.contentDirtyGate !== null && this.contentDirtyGate();
      if (this._enc.planFull(reg, this._log.length, contentDirty)) {
        return this.buildSlice(st, rx, ry, rw, rh);   // 全量锚帧（克隆发送,数组留影子）
      }
      return reg;   // delta 帧:仅几何,免切片
    }
    return this.buildSlice(st, rx, ry, rw, rh);
  }

  /** ★C9b 到达即应用（2026-09-24,用户实报 120fps 光照慢几帧定谳）:结果回填点从
   *  「下一个 compute」提前到「消息到达瞬间」。原 applyPending 只在 tick 的
   *  compute 里执行——120fps 渲染下主线程任务翻倍,回传消息常滑到下下个 tick
   *  才被消费（间歇 2 tick=33ms≈4 渲染帧=用户所见割裂）。onmessage 直接回填
   *  后:数据逐字节不变,只是更早可见;region+数组仍成对原子（主线程单线程,
   *  消息是独立 task,不可能撕裂同步段内的一致对）。引擎侧注册本回调。
   *  ★C9c（2026-09-24 用户复报不限帧率/进世界仍有延迟）:liveAuth 门——到达即
   *  应用仅在引擎 live 态生效;warmup 期本地每 tick 可能全周期出【新鲜】光,
   *  若被 1-tick 陈旧的 worker 结果倒灌覆写反而退步（进世界 dirty 风暴实锤）。
   *  引擎在 live 分支置 true,warmup 分支置 false。 */
  liveAuth = false;
  onResult: ((m: LightResultMsg) => void) | null = null;
  /** ★R1b-1≡R2b-F7 结果世代过滤器（引擎注入）：applyPending 兜底回填前过同款
   *  校验（主路径校验在引擎 applyWorkerResult 内）——传送大跳后在途旧世代结果
   *  经 pending 支抵达时同样拒回填,公共采样对保持本地发布的新区域。 */
  pendingFilter: ((m: LightResultMsg) => boolean) | null = null;
  private lastLag = 0;
  /** 最近一次结果 send→apply 实测延迟（C9c live 滞回门的传感器,毫秒;0=尚无结果） */
  get lastLagMs(): number { return this.lastLag; }

  /** worker 已产出过结果（warmup → live 的分界） */
  isLive(): boolean { return this.results > 0; }

  /** 看门狗（引擎 compute 帧驱动轮询,承 C8;★2026-09-28 治理重构=outstanding-aware）：
   *  「发了快照且最老未答请求年龄超预算（warmup 15s/稳态 2s）+双拍确认」才不健康;
   *  onerror/异常回执=硬证据直杀。主线程忙/暂停/隐藏恢复（outstanding=0）永不定谳。
   *  ★worker===null（尚未惰性生成）不算失联——首帧 compute 必须放行到 send() 建链,
   *  否则死锁于「healthy 要求 worker,worker 靠 send 生成」→ 永久回落（探针实锤）。
   *  ★首次不健康时登记指纹（falls/fallsBy）——引擎 dispose+阶梯重生消费;dispose
   *  （世界销毁）不记指纹（非回落）。 */
  healthy(): boolean {
    if (this.dead) return false;
    if (this.errored) { this.noteFall('onerror'); return false; }
    if (this.worker === null) return true;   // 未生成=首轮放行;生成失败置 errored 下帧回落
    if (this.wd.healthy(performance.now(), false)) return true;
    this.noteFall(this.wd.fallReason());
    return false;
  }

  /** 回落指纹登记（幂等——定谳只记一次;引擎侧 dispose+阶梯重生) */
  private noteFall(reason: WorkerFallReason): void {
    if (this.fallen) return;
    this.fallen = true;
    lwStat.falls++;
    lwStat.fallsBy[reason]++;
  }

  /** 回落原因（引擎侧排程重生后 F5 exitReason 扩展消费;定谳前=缺省值） */
  fallReason(): WorkerFallReason { return this.fallen ? this.wd.fallReason() : 'no-result-dead'; }

  dispose(): void {
    if (this.worker !== null) {
      try { this.worker.terminate(); } catch { /* 已死 */ }
      this.worker = null;
    }
    // ★C9d2:摘写日志（回退本地/世界销毁后原语写面零开销;防悬挂引用）
    if (this._st !== null) { this._st.tileWriteLog = null; this._st = null; }
    this._pool.length = 0;
    this.dead = true;
  }

  /** 扫描区域 ± SNAPSHOT_PAD 切片（逐行 memcpy）。
   *  ★C9d2 Layer 1:通道数组自池复用（全量帧 transfer 到 worker 后由 'pool' 消息
   *  回池;池空/尺寸失配才新分配）——稳态零分配,杀 ~416KB/帧 GC churn。 */
  buildSlice(st: TileStore, rx: number, ry: number, rw: number, rh: number): TileSlicePack {
    const sx = Math.max(0, rx - SNAPSHOT_PAD);
    const sy = Math.max(0, ry - SNAPSHOT_PAD);
    const sw = Math.min(st.w, rx + rw + SNAPSHOT_PAD) - sx;
    const sh = Math.min(st.h, ry + rh + SNAPSHOT_PAD) - sy;
    const n = sw * sh;
    let pack: TileSlicePack | null = null;
    for (let i = 0; i < this._pool.length; i++) {
      if (this._pool[i].type.length === n) { pack = this._pool.splice(i, 1)[0]; lwStat.poolHits++; break; }
    }
    if (pack === null) {
      lwStat.poolMisses++;
      pack = allocSliceChannels(sw, sh);
    }
    pack.sx = sx; pack.sy = sy; pack.px = rx - sx; pack.py = ry - sy;
    pack.showInvisibleBlocks = st.showInvisibleBlocks;
    for (const k of TILE_CHAN_KEYS) {
      const src = st[k] as Uint16Array | Uint8Array;
      const dst = pack[k] as Uint16Array | Uint8Array;
      for (let row = 0; row < sh; row++) {
        const base = (sy + row) * st.w + sx;
        dst.set(src.subarray(base, base + sw), row * sw);
      }
    }
    return pack;
  }

  /** 切片回池（Layer 1 'pool' 消息 / 灰度 delta 帧发送后;深度 4 封顶防滞留） */
  private recycleSlice(t: TileSlicePack): void {
    if (this._pool.length < 4 && t.type.length > 0) this._pool.push(t);
  }

  /** 惰性生成 + 发送。
   *  ★C9d2 Layer 1（非灰度,常开）:tile 13 通道 transferable 零拷贝过境（杀结构克隆
   *  ~24-29MB/s）,worker compute 后 'pool' 回池复用。
   *  ★C9d2 Layer 2（?lightdelta=1 灰度）:全量锚帧结构克隆发送（数组留主线程作影子）;
   *  delta 帧编码 写日志格∪暴露带（免切片帧,载荷 KB 级 transferable）。 */
  send(msg: Omit<LightSnapshotMsg, 'op' | 'seq'>): void {
    if (this.worker === null) {
      try {
        this.worker = new Worker(new URL('../workers/LightWorker.ts', import.meta.url), { type: 'module' });
        this.startedAt = performance.now();
        this.worker.onerror = (e) => {
          this.errored = true;
          console.warn('[LightWorker] worker error:', String(e.message ?? '').slice(0, 140));
        };
        this.worker.onmessage = (ev: MessageEvent) => {
          const m = ev.data as LightResultMsg | { op: 'error'; message: string } | LightPoolMsg | LightResyncMsg;
          if (m.op === 'pool') { this.recycleSlice((m as LightPoolMsg).tiles); return; }
          if (m.op === 'resync') { lwStat.resyncs++; if (this._enc) this._enc.noteResync(); return; }
          if (m.op === 'error') {
            this.errored = true;
            console.warn('[LightWorker] worker frame failed:', String((m as { message: string }).message).slice(0, 140));
            return;
          }
          this.results++;
          lwStat.results++;
          this.lastResultAt = performance.now();
          this.wd.onResult(this.lastResultAt);   // ★看门狗:回达冲账（应用/世代丢弃不影响心跳）
          lwStat.lagMs = this.lastSentAt > 0 ? performance.now() - this.lastSentAt : 0;
          this.lastLag = lwStat.lagMs;
          this.pending = m;
          // ★C9b 到达即应用（compute 的 applyPending 保留为兜底,已应用则 no-op）;
          //  ★C9c 仅 live 态生效——warmup 期本地新鲜光优先,禁陈旧倒灌
          if (this.liveAuth && this.onResult) this.onResult(m);
        };
      } catch (err) {
        this.errored = true;
        console.warn('[LightWorker] spawn failed:', String(err).slice(0, 140));
        return;
      }
    }
    lwStat.posted++;
    this.lastSentAt = performance.now();
    this.wd.onSend(this.lastSentAt);   // ★看门狗:在途请求钉账（outstanding 0→1 时锚最老年龄）
    const seq = ++this.seq;
    // ---- Layer 2（灰度）----
    if (this._enc !== null && this._st !== null) {
      const t = msg.tiles;
      if (t.type.length > 0) {
        // 全量锚帧:结构克隆发送（无 transfer——数组留主线程,所有权移交影子）
        this._enc.adoptFull(t);
        lwStat.fmt.full++;
        lwStat.lastFullReason = this._enc.lastFullReason;
        lwStat.tileBytes += t.type.length * TILE_CHAN_BYTES_PER_CELL;
        this._log.length = 0;
        this.worker.postMessage({ ...msg, op: 'frame', seq, enc: 'full' as const });
        return;
      }
      // delta 帧:编码 写日志格∪暴露带（读世界真值,影子同步推进）
      const out = this._enc.encodeDelta(this._st, t, this._log);
      this._log.length = 0;
      if (out.meta.length === 0) {
        // 防御面:编码中途异常（plan 容量保证下不可达）→ 本帧补全量
        const r = this._lastReg;
        const full = this.buildSlice(this._st, r.rx, r.ry, r.rw, r.rh);
        this._enc.adoptFull(full);
        lwStat.fmt.full++;
        lwStat.lastFullReason = 'escalate';
        lwStat.tileBytes += full.type.length * TILE_CHAN_BYTES_PER_CELL;
        this.worker.postMessage({ ...msg, tiles: full, op: 'frame', seq, enc: 'full' as const });
        return;
      }
      lwStat.fmt.delta++;
      lwStat.tileBytes += out.meta.byteLength + out.data.byteLength;
      this.worker.postMessage({ ...msg, op: 'frame', seq, enc: 'delta' as const,
        delta: { dv: LIGHT_DELTA_VERSION, meta: out.meta, data: out.data } },
        [out.meta.buffer, out.data.buffer]);
      // delta 帧无全量切片,无需回池
      return;
    }
    // ---- Layer 1（非灰度,常开）:13 通道 transferable ----
    const t = msg.tiles;
    const transfer: ArrayBuffer[] = [];
    for (const k of TILE_CHAN_KEYS) {
      const buf = (t[k] as Uint16Array | Uint8Array).buffer as ArrayBuffer;
      if (buf.byteLength > 0) transfer.push(buf);
    }
    this.worker.postMessage({ ...msg, op: 'frame', seq }, transfer);
  }

  /** 回填引擎公共面（引擎 compute 内调用——渲染与 lightAt 全消费面读成对一致值）。
   *  ★R1b-1:pendingFilter 在场时先过世代校验——不过=丢弃（不回填,计 skipped 由
   *  引擎校验面统一登记;此处静默拒） */
  applyPending(t: LightTarget): boolean {
    const m = this.pending;
    if (m === null) return false;
    this.pending = null;
    if (this.pendingFilter && !this.pendingFilter(m)) { noteLightResultSkipped(); return false; }
    t.rx = m.rx; t.ry = m.ry; t.rw = m.rw; t.rh = m.rh;
    t.r = m.R; t.g = m.G; t.b = m.B;
    return true;
  }
}
