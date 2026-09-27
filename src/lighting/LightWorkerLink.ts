// ★C9 光照引擎 Worker 化·主线程门面（2026-09-23;?lightworker=1 缺省关）。
// 承 C8 WaveWorker 模式：URL 参数旗（本旗缺省关,=1 显式启用）、new Worker(module)
// 导入模块本体、失联看门狗 2s terminate+回落、onerror 日志。
// 职责：
//   · buildSlice——扫描区域 ± SNAPSHOT_PAD 的 13 通道 tile 切片（行主序逐行 memcpy,
//     世界边界钳制;钳后余量 (px,py) 随包带走=worker 侧 InWorld 折叠精确性依赖,见协议头注）
//   · send——快照 postMessage（结构克隆;每帧全量,v1 不做脏标优化）
//   · applyPending——worker 结果回填引擎公共面（r/g/b 数组引用替换 + 区域回填;
//     引擎在 compute 内调用=渲染读 (区域,数组) 恒成对一致,1 帧滞后）
//   · healthy——2s 无回传（或 onerror/异常回执）→ 引擎永久回落本地路径
// 三态：warmup（结果未达:快照+本地双跑=首帧不黑屏）→ live（worker only）→
// fallback（_lw 置 null,本地照常,dirty 强制全周期）。
import { SNAPSHOT_PAD, LIGHT_WATCHDOG_MS, type LightResultMsg, type LightSnapshotMsg, type TileSlicePack } from './LightWorkerProtocol';
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

/** 引擎公共面回填目标（结构最小面,避免与 LightingEngine 运行时互相导入） */
export interface LightTarget {
  rx: number; ry: number; rw: number; rh: number;
  r: Uint8Array; g: Uint8Array; b: Uint8Array;
}

/** C9 诊断计数器（探针对账:posted(快照发出)/results(回达)/falls(看门狗回落)/
 *  lagMs(最近一次结果 send→apply 端到端延迟,含 worker 计算+主线程消息调度)。
 *  ★R1b-1≡R2b-F7 增 skipped=世代校验丢弃的晚到旧结果数（传送大跳在途旧世代,
 *  校验判据在引擎 resultCoversViewport——计数器收口在本模块诊断面）。纯读面） */
const lwStat = { posted: 0, results: 0, falls: 0, lagMs: 0, skipped: 0 };
/** ★R1b-1:引擎侧世代校验丢弃一个晚到结果时登记（探针/F5 对账面） */
export function noteLightResultSkipped(): void { lwStat.skipped++; }
export function lightWorkerStats(): { on: boolean; posted: number; results: number; falls: number; lagMs: number; skipped: number } {
  return { on: lightWorkerFlag, ...lwStat };
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

  /** 看门狗（引擎 compute 帧驱动轮询,承 C8）：2s 无回传/onerror/错误回执 → 不健康。
   *  ★worker===null（尚未惰性生成）不算失联——首帧 compute 必须放行到 send() 建链,
   *  否则死锁于「healthy 要求 worker,worker 靠 send 生成」→ 永久回落（探针实锤）。 */
  healthy(): boolean {
    if (this.dead || this.errored) return false;
    if (this.worker === null) return true;   // 未生成=首轮放行;生成失败置 errored 下帧回落
    const now = performance.now();
    const since = this.results > 0 ? now - this.lastResultAt : now - this.startedAt;
    return since <= LIGHT_WATCHDOG_MS;
  }

  dispose(): void {
    if (this.worker !== null) {
      try { this.worker.terminate(); } catch { /* 已死 */ }
      this.worker = null;
    }
    this.dead = true;
  }

  /** 扫描区域 ± SNAPSHOT_PAD 切片（逐行 memcpy;每帧新分配精确尺寸,约 0.3-0.5MB） */
  buildSlice(st: TileStore, rx: number, ry: number, rw: number, rh: number): TileSlicePack {
    const sx = Math.max(0, rx - SNAPSHOT_PAD);
    const sy = Math.max(0, ry - SNAPSHOT_PAD);
    const sw = Math.min(st.w, rx + rw + SNAPSHOT_PAD) - sx;
    const sh = Math.min(st.h, ry + rh + SNAPSHOT_PAD) - sy;
    const n = sw * sh;
    const pack: TileSlicePack = {
      sx, sy, sw, sh, px: rx - sx, py: ry - sy,
      type: new Uint16Array(n), flags: new Uint8Array(n),
      frameX: new Uint16Array(n), frameY: new Uint16Array(n),
      wall: new Uint16Array(n), liquid: new Uint8Array(n), liquidType: new Uint8Array(n),
      half: new Uint8Array(n), slope: new Uint8Array(n), wire: new Uint8Array(n),
      paint: new Uint8Array(n), paintWall: new Uint8Array(n), coat: new Uint8Array(n),
      showInvisibleBlocks: st.showInvisibleBlocks,
    };
    const chans: Array<[TypedChannel, TypedChannel]> = [
      [st.type as unknown as TypedChannel, pack.type as unknown as TypedChannel],
      [st.flags as unknown as TypedChannel, pack.flags as unknown as TypedChannel],
      [st.frameX as unknown as TypedChannel, pack.frameX as unknown as TypedChannel],
      [st.frameY as unknown as TypedChannel, pack.frameY as unknown as TypedChannel],
      [st.wall as unknown as TypedChannel, pack.wall as unknown as TypedChannel],
      [st.liquid as unknown as TypedChannel, pack.liquid as unknown as TypedChannel],
      [st.liquidType as unknown as TypedChannel, pack.liquidType as unknown as TypedChannel],
      [st.half as unknown as TypedChannel, pack.half as unknown as TypedChannel],
      [st.slope as unknown as TypedChannel, pack.slope as unknown as TypedChannel],
      [st.wire as unknown as TypedChannel, pack.wire as unknown as TypedChannel],
      [st.paint as unknown as TypedChannel, pack.paint as unknown as TypedChannel],
      [st.paintWall as unknown as TypedChannel, pack.paintWall as unknown as TypedChannel],
      [st.coat as unknown as TypedChannel, pack.coat as unknown as TypedChannel],
    ];
    for (const [src, dst] of chans) {
      for (let row = 0; row < sh; row++) {
        const base = (sy + row) * st.w + sx;
        dst.set(src.subarray(base, base + sw), row * sw);
      }
    }
    return pack;
  }

  /** 惰性生成 + 发送（结构克隆;worker 侧每帧零重分配直接持有克隆通道） */
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
          const m = ev.data as LightResultMsg | { op: 'error'; message: string };
          if (m.op === 'error') {
            this.errored = true;
            console.warn('[LightWorker] worker frame failed:', String((m as { message: string }).message).slice(0, 140));
            return;
          }
          this.results++;
          lwStat.results++;
          this.lastResultAt = performance.now();
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
    this.worker.postMessage({ ...msg, op: 'frame', seq: ++this.seq });
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

type TypedChannel = { set(src: ArrayLike<number>, off: number): void; subarray(a: number, b: number): ArrayLike<number> };
