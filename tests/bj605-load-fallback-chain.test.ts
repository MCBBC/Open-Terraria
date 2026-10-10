// ★BJ605（2026-10-10 线上事故）：读档「存档数据缺失」fallback 链判别测试。
// 事故链（定谳）：KvStore.openDb 把 rejected promise 永久缓存（毒化）→ 瞬时 open
// 失败后本会话所有 IDB 读恒 null → worker saveParse key 源抛「存档数据缺失」→
// mainFlow.loadFromKey 的 worker catch 只放行 WorldGenUnavailable，其他 re-throw
// → 主线程 kvGet（IDB 优先 + localStorage 副本兜底；★BJ615 后副本=双写时代遗留,
// 只读不写）fallback
// 永不可达 → 用户「线上存档突然无法进入」。叠加态B（单档幽灵）：WorldStore 写链
// 弃检 kvSet 'fail' 返回值 → 保存静默丢档、meta 照常入 index → 列表有档进不去。
// 本文件锁六面：
//  A. 毒化修复（真模块 fake-IDB 直驱）：openDb 瞬时失败不缓存 rejected promise
//     （重试走全新 open）；blocked 3s 超时 reject 可恢复；连续 3 败退避不打库。
//  B. worker saveParse 三态分类 message（keyMissing/idbUnavailable/typeMismatch/
//     jsonParseFailed/noSource）。
//  C. 主线程判别/文案映射纯函数（LoadErrors BJ605 段；容忍 [worldGen worker] 前缀；
//     OOM/loadSaveData 内部错不误判；WorldGenUnavailable 文案原语义）。
//  D. WorldStore 写失败不静默（save 抛错+meta 不虚假刷新；importSlot 回滚幽灵槽；
//     saveIndex 失败走 onWriteFail 告警）。
//  E. mainFlow/worker 接线结构锚（catch 判别/throw e 保留/kvGet fallback/分类 toast/
//     IDB 态诊断）。
//  F. 全缝：client.loadSave({key}) 的错误回传经 [worldGen worker] 包装后仍可判别
//     fallback 资格 + kvGet 副本救援材料在位。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSaveMissingReason, isSaveDataMissingError, saveMissingToastKey } from '../src/save/LoadErrors';
import { WorldStore, WorldSaveWriteError, buildSaveBackupFilename } from '../src/save/WorldStore';

// —— 可编程 KvStore mock（A 组透传 actual 真实现；B/D/F 组按用例注入）——
const kvMock = vi.hoisted(() => ({
  getEx: undefined as undefined | ((key: string) => Promise<{ value: string | null; cause: string; detail?: string }>),
  set: undefined as undefined | ((key: string, value: string) => Promise<'idb' | 'fail'>),
  get: undefined as undefined | ((key: string) => Promise<string | null>),
  has: undefined as undefined | ((key: string) => Promise<boolean>),
}));
vi.mock('../src/save/KvStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/save/KvStore')>();
  return {
    ...actual,
    kvGetIdbEx: (key: string) => (kvMock.getEx ? kvMock.getEx(key) : actual.kvGetIdbEx(key)),
    kvSet: (key: string, value: string) => (kvMock.set ? kvMock.set(key, value) : actual.kvSet(key, value)),
    kvGet: (key: string) => (kvMock.get ? kvMock.get(key) : actual.kvGet(key)),
    kvHas: (key: string) => (kvMock.has ? kvMock.has(key) : actual.kvHas(key)),
  };
});

// —— worker 台架（bj223 范式：伪装 self 承接顶层 ctx 绑定 → 真 handler 进程内直测）——
type WkEv = { id: number; type: string; message?: string; [k: string]: unknown };
const wkEvents: WkEv[] = [];
let fakeWorkerSink: ((ev: { data: unknown }) => void) | null = null;
const fakeSelf: {
  addEventListener: () => void;
  postMessage: (m: WkEv) => void;
  onmessage: ((e: { data: unknown }) => void) | null;
} = {
  addEventListener: () => {},
  postMessage: (m) => { wkEvents.push(m); fakeWorkerSink?.({ data: m }); },
  onmessage: null,
};
(globalThis as unknown as { self?: unknown }).self = fakeSelf;
await import('../src/workers/worldGen.worker');
const handler = fakeSelf.onmessage!;

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  constructor() { fakeWorkerSink = (ev) => this.onmessage?.(ev); }
  postMessage(msg: unknown): void {
    void Promise.resolve().then(() => fakeSelf.onmessage?.({ data: msg }));
  }
  terminate(): void { /* 伪件无进程 */ }
}
(globalThis as unknown as { Worker?: unknown }).Worker = FakeWorker;

beforeEach(() => {
  kvMock.getEx = undefined;
  kvMock.set = undefined;
  kvMock.get = undefined;
  kvMock.has = async () => false;   // node 无 localStorage——actual kvHas 裸调会 ReferenceError
  // A 组 openDb 模块级状态隔离：上一用例成功 open 的连接走真实「他页升级让路」
  // 路径失效（db.close + dbPromise=null）——vi.resetModules 对 mock 工厂结果不重置，
  // 缓存连接会跨用例泄漏（用例间假绿/假红根源）
  if (currentFakeDb && typeof currentFakeDb.onversionchange === 'function') (currentFakeDb.onversionchange as () => void)();
  currentFakeDb = null;
});

// —— A 组 fake IndexedDB（事件式最小面：open/get/getKey/put + onblocked 计时面）——
let currentFakeDb: { onversionchange: unknown } | null = null;
type FakeState = {
  openCount: number;
  mode: 'ok' | 'fail' | 'blocked';
  getValue: unknown | ((key: string) => unknown);
};
function makeFakeIdb() {
  const state: FakeState = { openCount: 0, mode: 'ok', getValue: undefined };
  const makeDb = () => {
    const db = {
      onversionchange: null as unknown,
      objectStoreNames: { contains: () => true },
      close() { /* no-op */ },
      transaction(_store: string, _mode: string) {
        return {
          objectStore(_s: string) {
            return {
              get(key: string) {
                const r = { onsuccess: null as null | (() => void), onerror: null as null | (() => void), result: undefined as unknown, error: null };
                queueMicrotask(() => {
                  r.result = typeof state.getValue === 'function' ? (state.getValue as (k: string) => unknown)(key) : state.getValue;
                  r.onsuccess?.();
                });
                return r;
              },
              getKey(key: string) {
                const r = { onsuccess: null as null | (() => void), onerror: null as null | (() => void), result: undefined as unknown };
                queueMicrotask(() => {
                  const v = typeof state.getValue === 'function' ? (state.getValue as (k: string) => unknown)(key) : state.getValue;
                  r.result = v === undefined ? undefined : key;
                  r.onsuccess?.();
                });
                return r;
              },
            };
          },
        };
      },
    };
    currentFakeDb = db;
    return db;
  };
  const fake = {
    open(_name: string, _version: number) {
      state.openCount++;
      const req = {
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onblocked: null as null | (() => void),
        onupgradeneeded: null as null | (() => void),
        result: null as unknown,
        error: null as unknown,
      };
      queueMicrotask(() => {
        if (state.mode === 'fail') {
          req.error = new DOMException('模拟打开失败', 'UnknownError');
          req.onerror?.();
          return;
        }
        if (state.mode === 'blocked') { req.onblocked?.(); return; }   // 永不 onsuccess——等 onblocked 超时
        req.result = makeDb();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { fake, state };
}

describe('BJ605 A组：KvStore openDb 毒化修复（真模块 fake-IDB 直驱）', () => {
  afterEach(() => {
    delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    vi.useRealTimers();
  });

  it('瞬时 open 失败不毒化：失败后下一次调用走全新 open 并成功（rejected promise 不缓存）', async () => {
    const { fake, state } = makeFakeIdb();
    (globalThis as unknown as { indexedDB?: unknown }).indexedDB = fake;
    const kv = await import('../src/save/KvStore');
    state.mode = 'fail';
    const r1 = await kv.kvGetIdbEx('world.k');
    expect(r1.cause).toBe('openFailed');
    expect(r1.value).toBeNull();
    expect(state.openCount).toBe(1);
    // ★判别核心：若 rejected promise 被缓存（事故形态），这里不会重新 open、
    // 恒 openFailed——修复后重试必须走全新 open 并读到数据。
    state.mode = 'ok';
    state.getValue = '"payload"';
    const r2 = await kv.kvGetIdbEx('world.k');
    expect(state.openCount, '毒化修复判别：第二次调用必须重新 open').toBe(2);
    expect(r2).toMatchObject({ value: '"payload"', cause: 'ok' });
  });

  it('blocked 超时：onblocked 后 3s 放弃 reject（不永久挂起），随后可恢复', async () => {
    vi.useFakeTimers();
    const { fake, state } = makeFakeIdb();
    (globalThis as unknown as { indexedDB?: unknown }).indexedDB = fake;
    const kv = await import('../src/save/KvStore');
    state.mode = 'blocked';
    const p = kv.kvGetIdbEx('world.k');
    const probe = vi.fn();
    p.then(probe, () => probe());   // 只标记 settle，不吞
    await vi.advanceTimersByTimeAsync(2999);
    expect(probe, '3s 内不得 settle').not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    const r = await p;
    expect(r.cause).toBe('openFailed');
    expect(r.detail).toContain('阻塞');
    // 超时放弃后缓存已清——恢复模式即可重试成功
    state.mode = 'ok';
    state.getValue = 'x';
    expect(await kv.kvGetIdbEx('world.k')).toMatchObject({ value: 'x', cause: 'ok' });
  });

  it('连续失败退避：3 连败后不再打库（open 计数冻结），退避窗过恢复', async () => {
    vi.useFakeTimers();
    const { fake, state } = makeFakeIdb();
    (globalThis as unknown as { indexedDB?: unknown }).indexedDB = fake;
    const kv = await import('../src/save/KvStore');
    state.mode = 'fail';
    for (let i = 0; i < 3; i++) {
      const r = await kv.kvGetIdbEx('world.k');
      expect(r.cause).toBe('openFailed');
    }
    expect(state.openCount).toBe(3);
    const r4 = await kv.kvGetIdbEx('world.k');
    expect(r4.cause, '退避窗内仍如实报 openFailed').toBe('openFailed');
    expect(state.openCount, '退避窗内不得再触发真实 open（防死循环打库）').toBe(3);
    state.mode = 'ok';
    state.getValue = 'y';
    await vi.advanceTimersByTimeAsync(5000);
    expect(await kv.kvGetIdbEx('world.k')).toMatchObject({ value: 'y', cause: 'ok' });
  });
});

describe('BJ605 B组：worker saveParse 三态分类 message', () => {
  async function errOf(req: Record<string, unknown>): Promise<string> {
    wkEvents.length = 0;
    const id = 600 + wkEvents.length + Math.floor(Math.random() * 1e6);
    await handler({ data: { id, type: 'saveParse', ...req } });
    const err = wkEvents.find((e) => e.type === 'error' && e.id === id);
    expect(err, '必须 error 回传（绝不静默 pending）').toBeTruthy();
    return err!.message ?? '';
  }

  it('keyMissing：IDB 健康但键不存在 → (keyMissing, src=idb, key=…)', async () => {
    kvMock.getEx = async () => ({ value: null, cause: 'keyMissing' });
    const m = await errOf({ key: 'sandboxworld.world.9' });
    expect(m).toBe('存档数据缺失 (keyMissing, src=idb, key=sandboxworld.world.9)');
  });

  it('idbUnavailable：openFailed/txFailed → (idbUnavailable, src=idb, key=…)', async () => {
    kvMock.getEx = async () => ({ value: null, cause: 'openFailed', detail: 'QuotaExceededError' });
    expect(await errOf({ key: 'sandboxworld.world.9' }))
      .toBe('存档数据缺失 (idbUnavailable, src=idb, key=sandboxworld.world.9)');
    kvMock.getEx = async () => ({ value: null, cause: 'txFailed', detail: 'UnknownError' });
    expect(await errOf({ key: 'sandboxworld.world.9' }))
      .toBe('存档数据缺失 (idbUnavailable, src=idb, key=sandboxworld.world.9)');
  });

  it('typeMismatch：值非 string → (typeMismatch, src=idb, key=…)', async () => {
    kvMock.getEx = async () => ({ value: null, cause: 'typeMismatch', detail: 'object' });
    expect(await errOf({ key: 'sandboxworld.world.9' }))
      .toBe('存档数据缺失 (typeMismatch, src=idb, key=sandboxworld.world.9)');
  });

  it('jsonParseFailed：IDB 值损坏（非合法 JSON）→ (jsonParseFailed, src=idb, key=…)', async () => {
    kvMock.getEx = async () => ({ value: '{oops', cause: 'ok' });
    const m = await errOf({ key: 'sandboxworld.world.9' });
    expect(m).toContain('存档数据缺失 (jsonParseFailed, src=idb, key=sandboxworld.world.9, detail=');
  });

  it('noSource：三源皆空 → (noSource, src=, key=-)（兼容 bj223 toContain 锁）', async () => {
    const m = await errOf({});
    expect(m).toBe('存档数据缺失 (noSource, src=, key=-)');
    expect(m).toContain('存档数据缺失');
  });
});

describe('BJ605 C组：主线程判别/文案映射（LoadErrors 纯函数）', () => {
  it('判别容忍 [worldGen worker] 前缀（WorldGenClient 包装产物）', () => {
    const wrapped = '[worldGen worker] 存档数据缺失 (keyMissing, src=idb, key=sandboxworld.world.9)';
    expect(parseSaveMissingReason(wrapped)).toBe('keyMissing');
    expect(isSaveDataMissingError(wrapped)).toBe(true);
    expect(parseSaveMissingReason('存档数据缺失 (idbUnavailable, src=idb, key=k)')).toBe('idbUnavailable');
    expect(parseSaveMissingReason('存档数据缺失 (jsonParseFailed, src=json, key=-)')).toBe('jsonParseFailed');
  });

  it('真阴性：loadSaveData 内部错/OOM/SyntaxError 技术串不误判（fallback 救不了→re-throw）', () => {
    expect(isSaveDataMissingError('Cannot read properties of undefined (reading width)')).toBe(false);
    expect(isSaveDataMissingError('[worldGen worker] Array buffer allocation failed')).toBe(false);
    expect(isSaveDataMissingError('Unexpected token o in JSON at position 1')).toBe(false);
    expect(isSaveDataMissingError('data.header.width undefined')).toBe(false);
    expect(isSaveDataMissingError(undefined)).toBe(false);
    expect(isSaveDataMissingError('')).toBe(false);
  });

  it('WorldGenUnavailable 文案原语义：worker 不可用族不判为缺失（toast 走 SaveLoadFailed）', () => {
    for (const m of ['worldGen worker 不可用', '握手超时', '读档超时', 'worker 故障']) {
      expect(parseSaveMissingReason(m)).toBeNull();
      expect(saveMissingToastKey(parseSaveMissingReason(m))).toBe('Mods.SandboxWorld.Toast.SaveLoadFailed');
    }
  });

  it('文案键映射锁：三态可操作面→三个 l10n 键', () => {
    expect(saveMissingToastKey('idbUnavailable')).toBe('Mods.SandboxWorld.Toast.SaveMissingIdbUnavailable');
    expect(saveMissingToastKey('keyMissing')).toBe('Mods.SandboxWorld.Toast.SaveMissingKeyMissing');
    expect(saveMissingToastKey('typeMismatch')).toBe('Mods.SandboxWorld.Toast.SaveMissingCorrupt');
    expect(saveMissingToastKey('jsonParseFailed')).toBe('Mods.SandboxWorld.Toast.SaveMissingCorrupt');
    expect(saveMissingToastKey(null)).toBe('Mods.SandboxWorld.Toast.SaveLoadFailed');
  });
});

describe('BJ605 D组：WorldStore 写失败不静默（态B 单档幽灵防御）', () => {
  it('save：kvSet fail → 抛 WorldSaveWriteError + meta 不虚假刷新（lastPlayed/playTimeMs 不动）', async () => {
    kvMock.get = async () => null;
    kvMock.set = async () => 'idb';
    const store = new WorldStore();
    const meta = await store.register({ name: 'W', seed: '1', w: 100, h: 50, difficulty: 0, evil: 0 });
    const lastPlayed0 = meta.lastPlayed;
    kvMock.set = async () => 'fail';
    await expect(store.save(meta, '{"header":{}}', 5000)).rejects.toBeInstanceOf(WorldSaveWriteError);
    expect(meta.lastPlayed, '数据未落库不得刷新 meta（虚假刷新=index 基线与数据漂移）').toBe(lastPlayed0);
    expect(meta.playTimeMs).toBe(0);
    kvMock.set = async () => 'idb';
    await store.save(meta, '{"header":{}}', 5000);
    expect(meta.playTimeMs, '成功路径回归：meta 正常刷新').toBe(5000);
  });

  it('importSlot：kvSet fail → 回滚幽灵槽（list 不含该 id）+ 抛 WorldSaveWriteError', async () => {
    kvMock.get = async () => null;
    kvMock.set = async () => 'fail';
    const store = new WorldStore();
    await expect(store.importSlot({ name: 'G', seed: '1', w: 100, h: 50, difficulty: 0, evil: 0 }, '{"header":{}}'))
      .rejects.toMatchObject({ name: 'WorldSaveWriteError' });
    expect(store.list(), '数据未落库不得留在列表（态B：列表有档、进不去）').toHaveLength(0);
  });

  it('save fail → onWriteFailData 回调（name/dataKey/saveJson 原样；成功路径零调用）', async () => {
    kvMock.get = async () => null;
    kvMock.set = async () => 'fail';
    const store = new WorldStore();
    const calls: Array<[string, string, string]> = [];
    store.onWriteFailData = (name, dk, json) => { calls.push([name, dk, json]); };
    await expect(store.save({ id: 1, name: '备份我', seed: '1', w: 10, h: 10, difficulty: 0, evil: 0, createdAt: 0, lastPlayed: 0, playTimeMs: 0, favorite: false }, '{"header":{"name":"备份我"}}', 1))
      .rejects.toBeInstanceOf(WorldSaveWriteError);
    expect(calls, '写失败必须触发导出回调（用户明令件）').toEqual([['备份我', 'sandboxworld.world.1', '{"header":{"name":"备份我"}}']]);
    kvMock.set = async () => 'idb';
    await store.save({ id: 2, name: 'S2', seed: '1', w: 10, h: 10, difficulty: 0, evil: 0, createdAt: 0, lastPlayed: 0, playTimeMs: 0, favorite: false }, '{}', 1);
    expect(calls, '成功路径零导出回调').toHaveLength(1);
  });

  it('buildSaveBackupFilename：格式（名_YYYYMMDD_HHmmss.json）+ 非法字符消毒 + 空名回退', () => {
    expect(buildSaveBackupFilename('我的世界', new Date(2026, 9, 10, 15, 30, 45))).toBe('我的世界_20261010_153045.json');
    expect(buildSaveBackupFilename('a/b\\c:d*e?f"g<h>i|j', new Date(2026, 0, 2, 3, 4, 5))).toBe('a_b_c_d_e_f_g_h_i_j_20260102_030405.json');
    expect(buildSaveBackupFilename('  ', new Date(2026, 11, 31, 23, 59, 59))).toBe('world_20261231_235959.json');
    expect(buildSaveBackupFilename('', new Date(2000, 0, 1, 0, 0, 0))).toBe('world_20000101_000000.json');
  });

  it('saveIndex 失败 → onWriteFail 告警回调（元数据面不抛）', async () => {
    kvMock.get = async () => null;
    kvMock.set = async () => 'fail';
    const store = new WorldStore();
    let warned = 0;
    store.onWriteFail = () => { warned++; };
    await store.rename(7, 'x');   // 无此 id：不改不写——先 register 一条真实走写面
    kvMock.set = async () => 'idb';
    const meta = await store.register({ name: 'W2', seed: '1', w: 10, h: 10, difficulty: 0, evil: 0 });
    kvMock.set = async () => 'fail';
    await store.rename(meta.id, 'renamed');   // ★nextId 模块级计数——用 register 返回的 id，勿硬编码
    expect(warned, 'index 落库失败必须告警（保存时点知情，不等读档炸）').toBeGreaterThan(0);
  });
});

describe('BJ605 F组：全缝——client.loadSave({key}) 错误回传可判别 + 副本救援材料在位', () => {
  it('keyMissing 错误经 [worldGen worker] 包装后 parseSaveMissingReason 仍命中（fallback 资格判据）', async () => {
    kvMock.getEx = async () => ({ value: null, cause: 'keyMissing' });
    const { WorldGenClient } = await import('../src/workers/WorldGenClient');
    const client = new WorldGenClient();
    let caught: Error | null = null;
    try {
      await client.loadSave({ key: 'sandboxworld.world.9' }, { timeoutMs: 60_000 });
    } catch (e) { caught = e as Error; }
    expect(caught?.message).toContain('存档数据缺失 (keyMissing, src=idb, key=sandboxworld.world.9)');
    // 主线程 catch 判别输入=此 message → 判别为缺失族 → 走 kvGet fallback
    expect(parseSaveMissingReason(caught?.message)).toBe('keyMissing');
    // 救援材料：kvGet 的 localStorage 兜底读得到副本（双写时代遗留副本的读侧救援，
    // ★BJ615 留读摘写）
    kvMock.get = async () => '{"header":{"width":64,"height":32}}';
    expect(await (await import('../src/save/KvStore')).kvGet('sandboxworld.world.9')).toContain('header');
    client.terminate();
  });
});

describe('BJ605 E组：接线结构锚（防回归退化）', () => {
  const codeOf = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');

  it('mainFlow.loadFromKey：catch 判别三支（missing→fallback / Unavailable→fallback / 其余 re-throw）', () => {
    const s = codeOf('../src/mainFlow.ts');
    expect(s).toContain('saveMissing = parseSaveMissingReason((e as Error | undefined)?.message)');
    expect(s).toContain("} else if (!(e instanceof (await import('./workers/WorldGenClient')).WorldGenUnavailable)) throw e;");
    expect(s).toContain('const resolved = await resolveLoadText(key,');   // ★BJ617 件2：主线程 fallback=三段择源（IDB→FS 备份→LS 副本）
    expect(s).toContain('ui.toast(Lang.text(saveMissingToastKey(saveMissing)');
    expect(s).toContain('kvIdbStatus(key)');
  });

  it('worker saveParse：kvGetIdbEx 精细读 + 分类 message 模板在位', () => {
    const s = codeOf('../src/workers/worldGen.worker.ts');
    expect(s).toContain('const r = await kvGetIdbEx(req.key);');
    expect(s).toContain('存档数据缺失 (${missingReason}, src=${dataSrc}, key=${req.key ?? \'-\'})');
  });

  it('WorldStore：save/importSlot/duplicate 三写点 fail 检查在位（弃检回归闸）', () => {
    const s = codeOf('../src/save/WorldStore.ts');
    expect(s.match(/if \(where === 'fail'\)/g)?.length).toBeGreaterThanOrEqual(4);   // save/importSlot/duplicate/saveIndex
    expect(s).toContain('rollbackRegister');
    // ★用户明令件：三写点全接导出回调。★BJ620 件3：save 写点改 (failNotify ??
    // onWriteFailData)?.（链内去重通知可选注入,缺省仍=onWriteFailData 原语义）——
    // 锚形扩为两种调用形并取并计数。
    expect(s.match(/onWriteFailData\)\?\.\(/g)?.length).toBe(1);   // save 写点（failNotify 优先形）
    expect(s.match(/this\.onWriteFailData\?\.\(/g)?.length).toBe(2);   // importSlot/duplicate（原形）
  });

  it('mainFlow：备份导出面在位（downloadSaveJson/onWriteFailData 接线/quicksave fail 导出）', () => {
    const s = codeOf('../src/mainFlow.ts');
    expect(s).toContain('function downloadSaveJson(rawName: string, json: string): string');
    expect(s).toContain('worldStore.onWriteFailData = (name, _dk, saveJson)');
    expect(s).toContain('Mods.SandboxWorld.Toast.SaveExportedBackup');
    expect(s).toContain('const filename = downloadSaveJson(worldNameNow, json);');
    expect(s).toContain('buildSaveBackupFilename(rawName, new Date())');
  });
});
