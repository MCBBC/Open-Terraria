// 主线程的 worldGen worker 客户端：懒 spawn、ping 握手探测可用性、Promise 化、
// 进度/预览回调、超时看门狗（terminate + 重建）、worker 不可用时抛 WorldGenUnavailable
// 由调用方（Game.newWorld/loadWorld）落回主线程路径。
import { World } from '../world/World';
import type { GenConfigDTO, WorldWorkerEvent, WorldWorkerRequest } from './protocol';

export interface PreviewFrame {
  width: number; height: number;
  rgba: Uint8ClampedArray;
  passIndex: number; passName: string;
}

/** worker 不可用/握手失败——调用方降级主线程路径 */
export class WorldGenUnavailable extends Error {
  constructor(msg = 'worldGen worker 不可用') { super(msg); }
}

interface Pending {
  resolve: (w: World) => void;
  reject: (e: unknown) => void;
  onProgress?: (phase: string, label: string, p: number) => void;
  lastPhase?: string;
  onPreview?: (f: PreviewFrame) => void;
  timer: ReturnType<typeof setTimeout>;
  /** 静默看门狗(2026-08-12):生成中无事件 >STALL_WARN_MS → console.error 点名卡点 pass */
  lastEventAt?: number;
  lastLabel?: string;
  stallWarned?: boolean;
  stallTimer?: ReturnType<typeof setInterval>;
  /** loadSave 专用结果处理器（world + player） */
  onLoadResult?: (ev: Extract<WorldWorkerEvent, { type: 'result' }>) => void;
}

/** 握手超时：覆盖老 Safari 无 module worker / CSP 禁 worker / file:// 全挂 */
const HANDSHAKE_MS = 3000;
/** 任务超时看门狗：大世界 8400×2400 生成余量（超时 terminate 杀掉挂死任务） */
const DEFAULT_TIMEOUT_MS = 180000;
/** 静默看门狗阈值：生成中超过此时长无任何 worker 事件 → 控制台点名(pass 内死循环
 *  的最早信号——2026-08-12 水中箱 liquidType 死循环卡了整场才被发现,本看门狗 30s 即报) */
const STALL_WARN_MS = 30_000;
const STALL_CHECK_MS = 10_000;

export class WorldGenClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private probed: boolean | null = null; // null=未探测
  private workerBroken = false; // onerror 后置位，后续请求直接 fallback（不重复付 3s）

  /** 探测可用性（结果缓存；失败后标记 broken，不再重试） */
  async probe(): Promise<boolean> {
    if (this.probed !== null) return this.probed;
    if (this.workerBroken || typeof Worker === 'undefined') {
      this.probed = false;
      return false;
    }
    try {
      await this.ensureWorker(HANDSHAKE_MS);
      this.probed = true;
    } catch {
      this.probed = false;
    }
    return this.probed;
  }

  private ensureWorker(handshakeMs?: number): Promise<Worker> {
    if (this.worker) return Promise.resolve(this.worker);
    let w: Worker;
    try {
      w = new Worker(new URL('./worldGen.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      this.workerBroken = true;
      return Promise.reject(new WorldGenUnavailable());
    }
    this.worker = w;
    w.onmessage = (e: MessageEvent<WorldWorkerEvent>) => this.onEvent(e.data);
    w.onerror = () => this.onFatal();
    w.onmessageerror = () => this.onFatal();
    // 握手 ping（超时则视为不可用）
    return new Promise<Worker>((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.teardown();
        reject(new WorldGenUnavailable('握手超时'));
      }, handshakeMs ?? HANDSHAKE_MS);
      this.pending.set(id, {
        resolve: () => resolve(w),
        reject,
        timer,
      });
      w.postMessage({ id, type: 'ping' } satisfies WorldWorkerRequest);
    });
  }

  /** 生成世界（worker 内生成+沉降一条链，transfer 零拷贝回传） */
  async generate(
    cfg: GenConfigDTO,
    cb?: {
      onProgress?: (phase: string, label: string, p: number) => void;
      onPreview?: (f: PreviewFrame) => void;
      timeoutMs?: number;
    },
  ): Promise<World> {
    const w = await this.ensureWorker();
    const id = this.nextId++;
    return new Promise<World>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.teardown(); // 杀掉挂死任务，下次请求重新 spawn
        reject(new WorldGenUnavailable('生成超时'));
      }, cb?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const pend: Pending = {
        resolve, reject,
        onProgress: cb?.onProgress as Pending['onProgress'], onPreview: cb?.onPreview,
        timer,
        lastEventAt: Date.now(), lastLabel: '开始', stallWarned: false,
        stallTimer: setInterval(() => {
          if (!pend.lastEventAt) return;
          const silent = Date.now() - pend.lastEventAt;
          if (silent > STALL_WARN_MS) {
            // 只报一次;点名最后进度 + 静默时长,指向"pass 内部死循环"排查路径
            console.error(
              `[worldGen] ⚠️ 生成疑似卡死：已 ${Math.round(silent / 1000)}s 无进展` +
              `（最后进度：${pend.lastLabel}${pend.lastPhase ? ` [${pend.lastPhase}]` : ''}）。` +
              `pass 为同步代码,内部死循环会停摆事件循环——排查该 pass 内的 while/拒绝采样` +
              `（参考 liquidType +1 编码血案,3 分钟硬超时后将自动终止）`,
            );
            pend.stallWarned = true;
          }
        }, STALL_CHECK_MS),
      };
      this.pending.set(id, pend);
      w.postMessage({ id, type: 'generate', cfg } satisfies WorldWorkerRequest);
    });
  }

  /** 读档解析（worker 内 IDB 直读/JSON 解析/RLE 解码 + load 模式沉降，transfer 回传） */
  async loadSave(
    args: { key?: string; json?: string; save?: unknown },
    cb?: {
      onProgress?: (phase: string, p: number) => void;
      timeoutMs?: number;
    },
  ): Promise<{ world: World; player: unknown; save?: unknown }> {
    const w = await this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.teardown();
        reject(new WorldGenUnavailable('读档超时'));
      }, cb?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: () => undefined, // loadSave 走 onLoadResult
        reject,
        onProgress: cb?.onProgress as Pending['onProgress'],
        timer,
        onLoadResult: (ev) => resolve({ world: World.fromPacket(ev.world), player: ev.player, save: ev.save }),
      });
      w.postMessage({ id, type: 'saveParse', key: args.key, json: args.json, save: args.save as never } satisfies WorldWorkerRequest);
    });
  }

  private onEvent(ev: WorldWorkerEvent) {
    const p = this.pending.get(ev.id);
    if (ev.type === 'result') {
      if (!p) return;
      clearTimeout(p.timer);
      if (p.stallTimer) clearInterval(p.stallTimer);
      this.pending.delete(ev.id);
      if (p.onLoadResult) p.onLoadResult(ev);
      else p.resolve(World.fromPacket(ev.world));
      return;
    }
    if (ev.type === 'error') {
      if (!p) return;
      clearTimeout(p.timer);
      if (p.stallTimer) clearInterval(p.stallTimer);
      this.pending.delete(ev.id);
      p.reject(new Error(`[worldGen worker] ${ev.message}`));
      return;
    }
    if (ev.type === 'progress') {
      if (p) { p.lastEventAt = Date.now(); p.lastLabel = ev.label ?? ''; p.lastPhase = ev.phase; }
      p?.onProgress?.(ev.phase, ev.label ?? '', ev.p);
      return;
    }
    if (ev.type === 'preview') {
      p?.onPreview?.({
        width: ev.width, height: ev.height,
        rgba: new Uint8ClampedArray(ev.rgba),
        passIndex: ev.passIndex, passName: ev.passName,
      });
      return;
    }
    // ready（握手响应）：pending 存的是 ensureWorker 的 resolver（resolve 忽略参数）
    if (ev.type === 'ready' && p) {
      clearTimeout(p.timer);
      this.pending.delete(ev.id);
      p.resolve(null as unknown as World);
    }
  }

  /** worker 级故障（onerror/messageerror）：全量 reject + 标记不可用 */
  private onFatal() {
    this.workerBroken = true;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new WorldGenUnavailable('worker 故障'));
    }
    this.pending.clear();
    this.teardown();
  }

  private teardown() {
    this.worker?.terminate();
    this.worker = null;
  }

  terminate() { this.teardown(); }
}

/** 预取(2026-08-25):音频门等待窗口借 SW 回填 worker 脚本进缓存——spawn+延迟
 *  terminate,脚本请求经 SW cache-first 落缓存;真正 ensureWorker 时秒开。
 *  ★必须走本文件的 new Worker(new URL) 模式(vite 才会构建产物);外部裸
 *  new URL 引 .ts 会被当静态资产原样拷进发布包=源码泄漏,实测踩坑 */
export function prefetchWorldGenWorker(): void {
  try {
    const w = new Worker(new URL('./worldGen.worker.ts', import.meta.url), { type: 'module' });
    setTimeout(() => w.terminate(), 3000);
  } catch { /* SW 未控/不支持 → 懒路径照旧 */ }
}
