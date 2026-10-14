// mod 计算卸载接口(★Tier1-c,2026-10-14;sw.worker)。
// 形态:pack 内 workers/*.js 声明——`sw.worker('analysis.js')` 产句柄
// { run(data) → Promise<result> }。引擎负责 Worker 池(mod 级单 Worker 实例,
// 复用消息 id 路由)+结构化克隆边界(mod 数据自动 clone,无主线程共享态)
// +错误隔离(worker throw→Promise reject,不炸主线程)+卸载沿 terminate。
// 安全纪律:worker 脚本=mod 自带可信代码(tML 同哲学);无 importScripts 拦截
// (浏览器同源策略天然限制——worker 走 blob URL,importScripts 外域=CORS 门);
// 生命周期=mod 级(单 Worker 多 run 复用;热重载 teardown 沿 terminate)。
export interface ModWorkerHandle {
  /** 运行(载荷结构化克隆传入;worker onmessage 回值 resolve) */
  run<TIn, TOut>(data: TIn): Promise<TOut>;
  /** 终止(幂等) */
  terminate(): void;
}

interface WorkerEntry {
  worker: Worker;
  nextId: number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
}

/** mod 级 Worker 注册表(modId → path → entry) */
const registry = new Map<string, Map<string, WorkerEntry>>();

/** worker 宿主胶水源(消息 id 路由;mod 脚本以全局 onmessageRun(data, reply) 声明) */
const HOST_GLUE = `
let handler = null;
self.onmessage = (ev) => {
  const { id, data, init } = ev.data || {};
  if (init) { try { handler = init; } catch (e) { self.postMessage({ id, err: String(e) }); } return; }
  if (!handler) { self.postMessage({ id, err: 'worker 脚本未定义 onmessageRun(data, reply)' }); return; }
  try {
    Promise.resolve(handler(data, (result) => self.postMessage({ id, result })))
      .catch((e) => self.postMessage({ id, err: String(e) }));
  } catch (e) { self.postMessage({ id, err: String(e) }); }
};
`;

/** 创建/获取 mod worker 句柄(脚本=pack 文件字节;loader 相位取) */
export function modWorkerOf(
  modId: string, path: string, scriptBytes: Uint8Array,
): ModWorkerHandle {
  let perMod = registry.get(modId);
  if (!perMod) { perMod = new Map(); registry.set(modId, perMod); }
  let entry = perMod.get(path);
  if (!entry) {
    const src = new TextDecoder().decode(scriptBytes);
    // 胶水+mod 脚本:mod 侧声明全局 onmessageRun(data, reply)(单回调形);
    // 胶水负责 id 路由——mod 脚本零样板。★裸拼接(非括号表达式包裹——函数声明
    //  在括号内=函数表达式不提升,typeof 恒 undefined=「未定义」reject 判例)
    const full = `${HOST_GLUE}\n${src}\nhandler = (typeof onmessageRun === 'function') ? onmessageRun : null;\nself.postMessage({ id: -1, init: true });`;
    const url = URL.createObjectURL(new Blob([full], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    entry = { worker, nextId: 1, pending: new Map() };
    perMod.set(path, entry);
    worker.onmessage = (ev: MessageEvent) => {
      const { id, result, err } = (ev.data ?? {}) as { id: number; result?: unknown; err?: string };
      if (id === -1) return;   // init 回执
      const p = entry!.pending.get(id);
      if (!p) return;
      entry!.pending.delete(id);
      if (err) p.reject(new Error(`[mod-worker] ${modId}/${path}: ${err}`));
      else p.resolve(result);
    };
    worker.onerror = (ev: ErrorEvent) => {
      // 全局错误(语法/未捕获)——全部 pending reject
      for (const [, p] of entry!.pending) p.reject(new Error(`[mod-worker] ${modId}/${path}: ${ev.message}`));
      entry!.pending.clear();
    };
  }
  const e = entry;
  return {
    run<TIn, TOut>(data: TIn): Promise<TOut> {
      return new Promise<TOut>((resolve, reject) => {
        const id = e.nextId++;
        e.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        e.worker.postMessage({ id, data });
      });
    },
    terminate(): void {
      e.worker.terminate();
      for (const [, p] of e.pending) p.reject(new Error('[mod-worker] terminated'));
      e.pending.clear();
      registry.get(modId)?.delete(path);
    },
  };
}

/** mod 卸载/热重载沿:全 terminate */
export function modWorkersTeardown(modId?: string): void {
  const kill = (perMod: Map<string, WorkerEntry>): void => {
    for (const [, e] of perMod) {
      e.worker.terminate();
      for (const [, p] of e.pending) p.reject(new Error('[mod-worker] teardown'));
      e.pending.clear();
    }
    perMod.clear();
  };
  if (modId) {
    const perMod = registry.get(modId);
    if (perMod) { kill(perMod); registry.delete(modId); }
  } else {
    for (const perMod of registry.values()) kill(perMod);
    registry.clear();
  }
}

/** 测试清账 */
export const _resetModWorkersForTests = () => modWorkersTeardown();
