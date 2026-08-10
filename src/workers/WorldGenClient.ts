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
  onPreview?: (f: PreviewFrame) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** 握手超时：覆盖老 Safari 无 module worker / CSP 禁 worker / file:// 全挂 */
const HANDSHAKE_MS = 3000;
/** 任务超时看门狗：大世界 8400×2400 生成余量（超时 terminate 杀掉挂死任务） */
const DEFAULT_TIMEOUT_MS = 180000;

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
      this.pending.set(id, {
        resolve, reject,
        onProgress: cb?.onProgress, onPreview: cb?.onPreview,
        timer,
      });
      w.postMessage({ id, type: 'generate', cfg } satisfies WorldWorkerRequest);
    });
  }

  private onEvent(ev: WorldWorkerEvent) {
    const p = this.pending.get(ev.id);
    if (ev.type === 'result') {
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(ev.id);
      p.resolve(World.fromPacket(ev.world));
      return;
    }
    if (ev.type === 'error') {
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(ev.id);
      p.reject(new Error(`[worldGen worker] ${ev.message}`));
      return;
    }
    if (ev.type === 'progress') {
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
