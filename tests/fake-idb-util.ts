// ★BJ615（2026-10-10 存储链单写方案）共享测试垫：事件式最小 fake IndexedDB。
// 背景：kvSet 摘除 localStorage 写后恒走 IDB——node 测试环境无 indexedDB，
// 存档域测试（world-store/character-store/save-binary-deadpath/bj615）需要
// 可写的 IDB 垫才能驱动 kvSet→kvGet 真实读写链（旧 LS 垫只覆盖读兜底腿）。
// 支持面 = KvStore kv 通道实际用到的最小算子：get/getKey/put/delete + open 失败位。
// 命名沿 tests/env-hazards-util.ts 的 *-util.ts 惯例（vitest 默认不含非 *.test.ts）。

export interface FakeIdbHandle {
  /** kv 通道后端（string 值为主;结构化克隆值也可放） */
  map: Map<string, unknown>;
  /** true → 下一次 openDb（须先 dropConnection 清 KvStore 模块级连接缓存）失败;
   *  ★BJ620 件4：failTx=true → 读请求（get/getKey）走 onerror=事务失败态注入
   *  （open 健康但 tx 炸——kvIdbStatus 'unknown' 档判别面）。 */
  state: { failOpen: boolean; failTx?: boolean };
  /** 让 KvStore 已缓存的连接失效（触发其 db.onversionchange → dbPromise=null）——
   *  failOpen 切换/换垫前必调，否则 openDb 走缓存不打 open。 */
  dropConnection(): void;
}

type ReqLike = {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  result: unknown;
  error: unknown;
};

const mkReq = (): ReqLike => ({ onsuccess: null, onerror: null, result: undefined, error: null });

/** 安装 fake 到 globalThis.indexedDB（同文件多次调用=换垫,旧垫引用作废）。 */
export function installFakeIdb(): FakeIdbHandle {
  const map = new Map<string, unknown>();
  const state = { failOpen: false, failTx: false };
  let currentDb: { onversionchange: (() => void) | null } | null = null;

  const fake = {
    open(_name: string, _version: number) {
      const req = {
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
        result: null as unknown,
        error: null as unknown,
      };
      queueMicrotask(() => {
        if (state.failOpen) {
          req.error = new DOMException('fake-idb: 模拟打开失败', 'UnknownError');
          req.onerror?.();
          return;
        }
        const db = {
          onversionchange: null as (() => void) | null,
          objectStoreNames: { contains: () => true },
          close() { /* no-op */ },
          transaction(_store: string, _mode: string) {
            let completed = false;
            // ★BJ627：真实 IDB 语义补齐——tx.oncomplete=「所有请求完毕后提交」,
            // 旧垫只有写算子触发 complete,readonly 事务（kvSweepIdb 的
            // getAllKeys+批量 get）永挂。pending 计数:请求登记++、回调解执--,
            // 归零即 commit（写算子走同路径,幂等 complete 不变）。
            let pending = 0;
            const complete = () => {
              if (completed) return;
              completed = true;
              tx.oncomplete?.();
            };
            const maybeComplete = () => { if (pending <= 0) complete(); };
            const tx = {
              oncomplete: null as (() => void) | null,
              onerror: null as (() => void) | null,
              objectStore(_s: string) {
                const ro = (fill: (r: ReqLike) => void) => {
                  const r = mkReq();
                  pending++;
                  queueMicrotask(() => {
                    if (state.failTx) { r.error = new DOMException('fake-idb: 模拟事务失败', 'UnknownError'); r.onerror?.(); pending--; maybeComplete(); return; }
                    fill(r); r.onsuccess?.(); pending--; maybeComplete();
                  });
                  return r;
                };
                return {
                  get(key: string) {
                    return ro((r) => { r.result = map.get(key); });
                  },
                  getKey(key: string) {
                    return ro((r) => { r.result = map.has(key) ? key : undefined; });
                  },
                  // ★BJ627：kvSweepIdb 键枚举算子（只键串;值仍走 get——大值不入内存语义保真）
                  getAllKeys() {
                    return ro((r) => { r.result = [...map.keys()]; });
                  },
                  put(value: unknown, key: string) {
                    return ro((r) => { map.set(key, value); r.result = key; });
                  },
                  delete(key: string) {
                    return ro((r) => { map.delete(key); r.result = undefined; });
                  },
                };
              },
            };
            return tx;
          },
        };
        currentDb = db;
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  };
  (globalThis as unknown as { indexedDB?: unknown }).indexedDB = fake;
  return {
    map,
    state,
    dropConnection() {
      currentDb?.onversionchange?.();
      currentDb = null;
    },
  };
}
