// 主线程的 worldGen worker 客户端：懒 spawn、ping 握手探测可用性、Promise 化、
// 进度/预览回调、超时看门狗（terminate + 重建）、worker 不可用时抛 WorldGenUnavailable
// 由调用方（Game.newWorld/loadWorld）落回主线程路径。
import { World } from '../world/World';
import { WorldGenAbortedError } from '../world/gen/WorldGen';   // ★IIIII229 ① 中止判别（与 WorldGenUnavailable 判例同形:不触发 fallback）
import type { GenConfigDTO, WorldWorkerEvent, WorldWorkerRequest } from './protocol';
import { getModBridgePayload } from '../mods/bridge';

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
  /** 第 4 参 local=当前原版 pass 段内 Value（generate 相位；其余相位 undefined） */
  onProgress?: (phase: string, label: string, p: number, local?: number) => void;
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
  /** genIcons 专用结果处理器(#perf-gpulog 图标包 worker 化) */
  onIcons?: (ev: Extract<WorldWorkerEvent, { type: 'icons' }>) => void;
}

/** 握手超时：覆盖老 Safari 无 module worker / CSP 禁 worker / file:// 全挂 */
const HANDSHAKE_MS = 3000;
/** 任务超时看门狗基准：小世界 4200×1200 生成余量（超时 terminate 杀掉挂死任务）。
 *  实际超时按世界面积缩放（worldGenTimeoutMs），generate 默认取缩放值。 */
const DEFAULT_TIMEOUT_MS = 180000;
/** ★BJ331（2026-09-24）：按世界面积缩放的生成硬超时——原 180s 固定值注释口径是
 *  「大世界余量」，但慢机（用户 Windows Edge 实报 seed 152394290 大世界）光
 *  Speleothems 单 pass 就静默 199s+，健康生成在 180s 被硬超时杀死后落回主线程
 *  同步【从头重做一遍】（总时长翻倍+主线程全程卡顿=「自动回退成了同步生成」实报）。
 *  以 4200×1200 为基准 180s，面积线性放大封顶 4×（大世界 8400×2400=720s）。
 *  真死循环的兜底不再只靠硬超时：静默看门狗 30s 告警 + Esc 中止链（IIIII229）。 */
export function worldGenTimeoutMs(width: number, height: number): number {
  const area = Math.max(1, width) * Math.max(1, height);
  const factor = Math.min(4, Math.max(1, area / (4200 * 1200)));
  return Math.round(DEFAULT_TIMEOUT_MS * factor);
}

/** ★BJ336（2026-09-24）件1：读档超时扩面的尺寸窥取。
 *  ★BJ341（2026-09-25）键名锚修正（红蓝-W2 F3）：真实序列化头的键名是
 *  **width/height**（serialize.ts:505 header 投影 `width: meta.w, height: meta.h`
 *  ——SaveFile.ts meta 的 w/h 键在落盘前被改名投影），旧正则 `"w":(\d),"h":(\d)`
 *  对真实存档恒不命中 ⇒ json 读档路超时扩面全死（loadFromJson 恒回退 180s 缺省）。
 *  落盘序固定 format,version,header{name,seed,width,height,…}（serializeSave
 *  装配序）⇒ 首个 `"width":<n>,"height":<n>` 落在头部数十字节内；JSON 字符串内部
 *  的引号必转义（\"width\":）⇒ 正则误匹配不可能，首个命中即真头。有界窗口（4KB）
 *  防超长 name 场景全串扫描。非存档 JSON/损坏头 → null（调用方回退 worker 客户端
 *  固定 180s 缺省，同现行）。 */
export function peekSaveDims(json: string): { w: number; h: number } | null {
  if (!json) return null;
  const head = json.length > 4096 ? json.slice(0, 4096) : json;
  const m = /"width":(\d{1,5}),"height":(\d{1,5})/.exec(head);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** 静默看门狗 interval 装配（★BJ336 件1：generate 之外 loadSave 也武装——worker 读档
 *  parse/RLE/沉降三段均有 progress 事件流动，30s 无事件=段内冻结的最早信号，与生成
 *  面同款点名。getPend 延迟解析：装配点 pend 字面量尚未赋值、回调运行期才读取
 *  （与 generate 内联写法同 TDZ 形态）。generate 的内联块保持 BJ331 原样不动。 */
function armStallWatchdog(noun: string, getPend: () => Pending | undefined): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const pend = getPend();
    if (!pend?.lastEventAt) return;
    const silent = Date.now() - pend.lastEventAt;
    if (silent > STALL_WARN_MS) {
      if (pend.stallWarned) return;
      console.error(
        `[worldGen] ⚠️ ${noun}疑似卡死：已 ${Math.round(silent / 1000)}s 无进展` +
        `（最后进度：${pend.lastLabel}${pend.lastPhase ? ` [${pend.lastPhase}]` : ''}）。` +
        `${noun === '生成' ? 'pass 为同步代码,内部死循环会停摆事件循环——排查该 pass 内的 while/拒绝采样' : '读档 parse/RLE 解码/沉降三段均为同步段,段内冻结会停摆事件循环——排查该段内循环'}` +
        `（参考 liquidType +1 编码血案,硬超时后将自动终止）`,
      );
      pend.stallWarned = true;
    } else {
      pend.stallWarned = false;
    }
  }, STALL_CHECK_MS);
}
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
    // ★mod 桥(2026-10-04):worker 建即推 mod id 增量(fire-and-forget;读档 saveParse
    //  的 stable→internal 翻译在本线程表上,不推=mod 内容解档归 0)
    try {
      const payload = getModBridgePayload();
      if (payload) w.postMessage({ id: this.nextId++, type: 'applyModIds', payload });
    } catch { /* 握手前失败忽略,后续 ensure 重推 */ }
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
      onProgress?: (phase: string, label: string, p: number, local?: number) => void;
      onPreview?: (f: PreviewFrame) => void;
      timeoutMs?: number;
    },
  ): Promise<World> {
    const w = await this.ensureWorker();
    const id = this.nextId++;
    return new Promise<World>((resolve, reject) => {
      const timer = setTimeout(() => {
        // ★BJ331：超时路径必须同步清掉 stallTimer（曾漏清 ⇒ pending 已删而 interval
        //  永续,拿冻结的 lastEventAt 每 10s 报一次「已 Xs 无进展」直到页面刷新——
        //  用户实报:回退同步生成+进世界游玩后告警仍连发到 199s+）
        if (pend.stallTimer) clearInterval(pend.stallTimer);
        this.pending.delete(id);
        this.teardown(); // 杀掉挂死任务，下次请求重新 spawn
        reject(new WorldGenUnavailable('生成超时'));
      }, cb?.timeoutMs ?? worldGenTimeoutMs(cfg.width, cfg.height));
      const pend: Pending = {
        resolve, reject,
        onProgress: cb?.onProgress as Pending['onProgress'], onPreview: cb?.onPreview,
        timer,
        lastEventAt: Date.now(), lastLabel: '开始', stallWarned: false,
        stallTimer: setInterval(() => {
          if (!pend.lastEventAt) return;
          const silent = Date.now() - pend.lastEventAt;
          if (silent > STALL_WARN_MS) {
            // 每段静默只报一次（注释口径 2026-08-12 起即是,曾漏 gate 每 10s 刷屏;
            // 进度事件复位 lastEventAt 后自动再武装,下一段静默重新点名）:
            // 点名最后进度 + 静默时长,指向"pass 内部死循环"排查路径
            if (pend.stallWarned) return;
            console.error(
              `[worldGen] ⚠️ 生成疑似卡死：已 ${Math.round(silent / 1000)}s 无进展` +
              `（最后进度：${pend.lastLabel}${pend.lastPhase ? ` [${pend.lastPhase}]` : ''}）。` +
              `pass 为同步代码,内部死循环会停摆事件循环——排查该 pass 内的 while/拒绝采样` +
              `（参考 liquidType +1 编码血案,硬超时(小世界 3 分钟/大世界封顶 12 分钟)后将自动终止）`,
            );
            pend.stallWarned = true;
          } else {
            pend.stallWarned = false;
          }
        }, STALL_CHECK_MS),
      };
      this.pending.set(id, pend);
      w.postMessage({ id, type: 'generate', cfg } satisfies WorldWorkerRequest);
    });
  }

  // ★IIIII229 ①：Esc 中止链客户端面——Game.abortWorldGen() 经此把请求转投 worker
  //   通道（'abortGen' fire-and-forget）。主线程 fallback 生成路不经此处（Game 直接
  //   调 WorldGen.requestWorldGenAbort 置位同一模块位）。
  /** 有无在途作业（generate/saveParse/genIcons 任一 pending）——中止路由判据。 */
  hasPendingWork(): boolean { return this.pending.size > 0; }
  /** 请求中止当前生成作业（无在途作业时置位无害：worker 下次 generateWorld 头部清零）。 */
  abortGen(): void {
    void this.ensureWorker().then((w) => {
      w.postMessage({ id: this.nextId++, type: 'abortGen' } satisfies WorldWorkerRequest);
    }).catch(() => { /* worker 不可用=无作业可中止 */ });
  }

  /** 程序化图标图集(#perf-gpulog 图标包 worker 化):纯像素生成+平铺进单张
   *  图集,rgba transfer 回传。排队语义 = 与后续 saveParse/generate 同 worker
   *  串行——startAssetPrewarm 先发本请求,天然排在读档/生成作业之前 */
  async genIcons(cb?: { timeoutMs?: number }): Promise<{
    rgba: ArrayBuffer; width: number; height: number; cols: number; ids: number[];
  }> {
    const w = await this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.teardown();
        reject(new WorldGenUnavailable('图标生成超时'));
      }, cb?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: () => undefined, reject, timer,
        onIcons: (ev) => resolve(ev.icons),
      });
      w.postMessage({ id, type: 'genIcons' } satisfies WorldWorkerRequest);
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
        // ★BJ336 件1：超时路径同步清 stallTimer（BJ331 同案：pending 已删而 interval
        //  永续=拿冻结的 lastEventAt 每 10s 报一次直到页面刷新）
        const pend = this.pending.get(id);
        if (pend?.stallTimer) clearInterval(pend.stallTimer);
        this.pending.delete(id);
        this.teardown();
        reject(new WorldGenUnavailable('读档超时'));
      }, cb?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: () => undefined, // loadSave 走 onLoadResult
        reject,
        onProgress: cb?.onProgress as Pending['onProgress'],
        timer,
        // ★BJ336 件1：读档面静默看门狗（worker parse/tiles/settle 三段 progress 流动
        //  复位 lastEventAt；onEvent result/error 臂已有配对清理）——超时值由调用方按
        //  peekSaveDims/worldGenTimeoutMs 扩面（loadFromJson/loadFromKey），此处缺省
        //  仍 180s：key 路径客户端无档内容可窥时由 meta 槽位表兜底，无 meta 回退本值。
        lastEventAt: Date.now(), lastLabel: '开始', stallWarned: false,
        stallTimer: armStallWatchdog('读档', () => this.pending.get(id)),
        onLoadResult: (ev) => {
          if (ev.wkLog?.length) (globalThis as unknown as { __swWkLog?: string[] }).__swWkLog = ev.wkLog;
          resolve({ world: World.fromPacket(ev.world), player: ev.player, save: ev.save });
        },
      });
      w.postMessage({ id, type: 'saveParse', key: args.key, json: args.json, save: args.save as never } satisfies WorldWorkerRequest);
    });
  }

  private onEvent(ev: WorldWorkerEvent) {
    const p = this.pending.get(ev.id);
    if (ev.type === 'icons') {
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(ev.id);
      p.onIcons?.(ev);
      return;
    }
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
    // ★IIIII229 ①：生成被 Esc 中止（worker 端 WorldGenAbortedError 专用通道）——
    //   以同名错误 reject,调用方（Game.newWorld/mainFlow）判别后按中止收场,
    //   不触发 WorldGenUnavailable fallback。
    if (ev.type === 'aborted') {
      if (!p) return;
      clearTimeout(p.timer);
      if (p.stallTimer) clearInterval(p.stallTimer);
      this.pending.delete(ev.id);
      p.reject(new WorldGenAbortedError());
      return;
    }
    if (ev.type === 'progress') {
      if (p) { p.lastEventAt = Date.now(); p.lastLabel = ev.label ?? ''; p.lastPhase = ev.phase; }
      p?.onProgress?.(ev.phase, ev.label ?? '', ev.p, ev.local);
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

  /** worker 级故障（onerror/messageerror）：全量 reject + 标记不可用。
   *  ★BJ341 件3：同步清 stallTimer（arm/clear 配对矩阵唯一缺口）——generate 的
   *  内联看门狗闭包直捕 pend（非 map 解析），pending.clear() 后仍每 10s 拿冻结的
   *  lastEventAt 判静默，30s 起报「生成疑似卡死」直到页面刷新（BJ331 超时路径
   *  同案：读档面 armStallWatchdog 走 getPend() map 解析，clear 后读 undefined
   *  早退=只漏 interval 不刷屏，一并清齐）。 */
  private onFatal() {
    this.workerBroken = true;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      if (p.stallTimer) clearInterval(p.stallTimer);
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
