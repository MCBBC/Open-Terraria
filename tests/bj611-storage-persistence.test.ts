// ★BJ611（2026-10-10 线上事故·Chromium 磁盘紧张驱逐根治面）判别测试。
// 事故终因（主会话定谳）：C 盘剩 ~3GB → Chromium QuotaManager 主动驱逐 best-effort
// origin 的 quota 管理存储（IDB+Cache API 整批清,localStorage 幸存）→ IndexedDB 全空/
// world.N 消失/列表幽灵。存档链此前从未申请 navigator.storage.persist()（只有素材暖存
// 链申请过且无状态追踪）→ 恒 best-effort。本文件锁五面：
//  A. persist 统一申请一次性（重入不再打底层）+ 结果落全局态（granted/denied/
//     unsupported/抛错降级 denied）+ persisted() 已授予不再申请。
//  B. persisted=false 一次性提醒门（localStorage 记忆）+ 幽灵通知指纹门（新增驱逐才再提醒）。
//  C. estimate 预警阈值（nearQuota 0.9 线/unpersistedData 100MB 线/quota null 面/
//     refreshStorageStatus 快照接线）。
//  D. 幽灵检测（驱逐后首启）：probe 注入纯逻辑 + fake-IDB 真探测路径（沿 BJ605 习语）
//     ——IDB 键缺失且 localStorage 无副本=幽灵;openFailed/txFailed=不可定谳整体弃检。
//  E. 接线结构锚（mainFlow 三查/WorldSelect 状态行/数据键格式同构/l10n 双语言）。
//  F. quota 环比骤降状态机纯核（★休眠态:2026-10-10 用户实测 Chromium M97+ quota 锚
//     磁盘总容量——C 盘剩 3GB 空闲时 quota 仍 10.3GB,环比抓不到磁盘变紧;触发面已按
//     用户明令摘除,纯核保留待 re-arm;E 组摘除回归闸锁复发）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EvictProbeCause, LsLike } from '../src/save/StoragePersistence';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['tools/l10n-custom'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


// ---- 模块级状态隔离：每用例 resetModules 后动态导入（persist 申请是会话单发语义） ----
beforeEach(() => {
  vi.resetModules();
});

// ---- navigator.storage 夹具（Node 全局 navigator 整体替换,afterEach 还原） ----
type FakeStorageApi = {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
};
const origNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
function setNavigatorStorage(api: FakeStorageApi | undefined): void {
  const nav: Record<string, unknown> = {};
  if (api) nav.storage = api;
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
}
afterEach(() => {
  if (origNavDesc) Object.defineProperty(globalThis, 'navigator', origNavDesc);
  else delete (globalThis as { navigator?: unknown }).navigator;
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function freshMod(): Promise<typeof import('../src/save/StoragePersistence')> {
  return import('../src/save/StoragePersistence');
}

describe.skipIf(EXT_MISSING)('BJ611 A组：persist 统一申请一次性 + 状态追踪', () => {
  it('授予：一次申请+结果落态;重入不再打底层 persist（一次性闸）', async () => {
    let persistCalls = 0;
    setNavigatorStorage({
      persist: async () => { persistCalls++; return true; },
      persisted: async () => false,
    });
    const mod = await freshMod();
    expect(mod.storagePersistState()).toBe('unknown');
    expect(await mod.requestStoragePersistence()).toBe('granted');
    expect(await mod.requestStoragePersistence()).toBe('granted');
    expect(persistCalls, '一次性闸：重入不得再打底层 persist()').toBe(1);
    expect(mod.storagePersistState()).toBe('granted');
  });

  it('persisted() 已授予 → 不再发起申请（幂等;AssetCache 既有调用共存无害）', async () => {
    let persistCalls = 0;
    setNavigatorStorage({
      persist: async () => { persistCalls++; return true; },
      persisted: async () => true,
    });
    const mod = await freshMod();
    expect(await mod.requestStoragePersistence()).toBe('granted');
    expect(persistCalls, '既往已授予时不得重复申请').toBe(0);
  });

  it('静默拒绝（Chrome 启发式未命中事故形态）→ denied 落态', async () => {
    setNavigatorStorage({ persist: async () => false, persisted: async () => false });
    const mod = await freshMod();
    expect(await mod.requestStoragePersistence()).toBe('denied');
    expect(mod.storagePersistState()).toBe('denied');
  });

  it('persist 抛错（opaque origin 等残缺环境）→ 降级 denied 不炸', async () => {
    setNavigatorStorage({
      persist: async () => { throw new DOMException('denied', 'NotAllowedError'); },
      persisted: async () => false,
    });
    const mod = await freshMod();
    expect(await mod.requestStoragePersistence()).toBe('denied');
  });

  it('API 缺失（老浏览器/无 storage 面）→ unsupported 落态', async () => {
    setNavigatorStorage(undefined);
    const mod = await freshMod();
    expect(await mod.requestStoragePersistence()).toBe('unsupported');
    expect(mod.storagePersistState()).toBe('unsupported');
  });
});

describe.skipIf(EXT_MISSING)('BJ611 B组：一次性提醒门（localStorage 记忆）', () => {
  function makeLs(): LsLike & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k: string, v: string) => { map.set(k, v); },
    };
  }

  it('persisted=false 提醒门：默认可提醒;标记后不重弹;ls 抛错=可提醒（宁多提醒不漏）', async () => {
    const mod = await freshMod();
    const ls = makeLs();
    expect(mod.shouldShowPersistNotice(ls)).toBe(true);
    mod.markPersistNoticeShown(ls);
    expect(ls.map.get(mod.PERSIST_NOTICE_LS_KEY)).toBe('1');
    expect(mod.shouldShowPersistNotice(ls), '标记后跨会话不得重弹').toBe(false);
    const badLs: LsLike = {
      getItem: () => { throw new Error('privacy'); },
      setItem: () => { throw new Error('privacy'); },
    };
    expect(mod.shouldShowPersistNotice(badLs)).toBe(true);
  });

  it('幽灵通知指纹门：空指纹永不提醒;已提醒不重弹;指纹变化（新增驱逐）才再提醒', async () => {
    const mod = await freshMod();
    const ls = makeLs();
    expect(mod.shouldShowEvictNotice(ls, '')).toBe(false);
    const fp = mod.evictNoticeFingerprint([{ kind: 'world', id: 2 }]);
    expect(fp).toBe('world:2');
    expect(mod.shouldShowEvictNotice(ls, fp)).toBe(true);
    mod.markEvictNoticeShown(ls, fp);
    expect(mod.shouldShowEvictNotice(ls, fp), '同指纹不得重弹').toBe(false);
    const fp2 = mod.evictNoticeFingerprint([{ kind: 'world', id: 2 }, { kind: 'world', id: 7 }]);
    expect(mod.shouldShowEvictNotice(ls, fp2), '新增驱逐必须再提醒').toBe(true);
  });

  it('指纹排序稳定性：同集合不同序=同指纹（不因扫描顺序误判新增）', async () => {
    const mod = await freshMod();
    expect(mod.evictNoticeFingerprint([{ kind: 'world', id: 2 }, { kind: 'player', id: 5 }]))
      .toBe(mod.evictNoticeFingerprint([{ kind: 'player', id: 5 }, { kind: 'world', id: 2 }]));
  });
});

describe.skipIf(EXT_MISSING)('BJ611 C组：estimate 预警阈值', () => {
  const MB = 1024 * 1024;

  it('nearQuota：usage/quota ≥ 0.9（QuotaExceededError 写失败近在眼前）', async () => {
    const mod = await freshMod();
    expect(mod.storagePressureKind(900, 1000, true)).toBe('nearQuota');
    expect(mod.storagePressureKind(899, 1000, true)).toBe('none');
  });

  it('unpersistedData：未持久化且 usage ≥ 100MB（可被驱逐的规模;100MB 线=USAGE_WARN_BYTES）', async () => {
    const mod = await freshMod();
    expect(mod.storagePressureKind(mod.USAGE_WARN_BYTES, null, false)).toBe('unpersistedData');
    expect(mod.storagePressureKind(mod.USAGE_WARN_BYTES - 1, null, false)).toBe('none');
  });

  it('persisted=true 大用量不升 unpersistedData（持久化豁免驱逐,警示不误报）', async () => {
    const mod = await freshMod();
    expect(mod.storagePressureKind(500 * MB, null, true)).toBe('none');
  });

  it('quota null/0 → 跳过 nearQuota 腿;nearQuota 优先于 unpersistedData', async () => {
    const mod = await freshMod();
    expect(mod.storagePressureKind(mod.USAGE_WARN_BYTES, null, false)).toBe('unpersistedData');
    expect(mod.storagePressureKind(mod.USAGE_WARN_BYTES, 0, false)).toBe('unpersistedData');
    expect(mod.storagePressureKind(mod.USAGE_WARN_BYTES, MB, false)).toBe('nearQuota');
  });

  it('refreshStorageStatus：estimate 采样+持久化位接线,快照可同步读', async () => {
    setNavigatorStorage({
      persist: async () => true,
      persisted: async () => false,
      estimate: async () => ({ usage: 7, quota: 10 }),
    });
    const mod = await freshMod();
    const st = await mod.refreshStorageStatus();
    expect(st).toMatchObject({ persisted: true, state: 'granted', usage: 7, quota: 10, pressure: 'none' });
    expect(mod.storageStatusSnapshot()).toEqual(st);
  });

  it('estimate 抛错 → usage 0/quota null,持久化位仍如实显示（残缺环境不炸）', async () => {
    setNavigatorStorage({
      persist: async () => false,
      estimate: async () => { throw new Error('est boom'); },
    });
    const mod = await freshMod();
    const st = await mod.refreshStorageStatus();
    expect(st).toMatchObject({ persisted: false, state: 'denied', usage: 0, quota: null, pressure: 'none' });
  });
});

describe.skipIf(EXT_MISSING)('BJ611 D组：幽灵检测（驱逐后首启）', () => {
  it('probe 注入：keyMissing=幽灵;present=非幽灵;world+player 双列各自探测', async () => {
    const mod = await freshMod();
    const probe = async (key: string): Promise<EvictProbeCause> =>
      key === 'sandboxworld.world.2' ? 'keyMissing' : 'present';
    const r = await mod.scanEvictedSaves(
      [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      [{ id: 5, name: 'P' }],
      probe,
    );
    expect(r.conclusive).toBe(true);
    expect(r.evicted).toEqual([{ kind: 'world', id: 2, name: 'B' }]);
  });

  it('unavailable → 不可定谳：conclusive=false 且 evicted 恒空（防把「IDB 打不开」误报成「被清理」）', async () => {
    const mod = await freshMod();
    const probe = async (key: string): Promise<EvictProbeCause> =>
      key === 'sandboxworld.world.1' ? 'unavailable' : 'keyMissing';
    const r = await mod.scanEvictedSaves([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], [{ id: 5, name: 'P' }], probe);
    expect(r.conclusive).toBe(false);
    expect(r.evicted).toEqual([]);
    // player 列探测失败同样弃检
    const probe2 = async (key: string): Promise<EvictProbeCause> =>
      key.startsWith('sandboxworld.player.') ? 'unavailable' : 'keyMissing';
    const r2 = await mod.scanEvictedSaves([{ id: 1, name: 'A' }], [{ id: 5, name: 'P' }], probe2);
    expect(r2.conclusive).toBe(false);
    expect(r2.evicted).toEqual([]);
  });

  // ---- fake-IDB 夹具（BJ605 A组习语:minimal open/get 事件式面;get 异步 settle） ----
  type FakeIdbState = { fail: boolean; getValue: (key: string) => unknown };
  function makeFakeIdb(state: FakeIdbState) {
    const fake = {
      open(_name: string, _version: number) {
        const req = {
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onupgradeneeded: null as (() => void) | null,
          result: null as unknown,
          error: null as unknown,
        };
        queueMicrotask(() => {
          if (state.fail) {
            req.error = new DOMException('模拟打开失败', 'UnknownError');
            req.onerror?.();
            return;
          }
          req.result = {
            objectStoreNames: { contains: () => true },
            close() { /* no-op */ },
            onversionchange: null,
            transaction(_s: string, _m: string) {
              return {
                objectStore(_s2: string) {
                  return {
                    get(key: string) {
                      const r = { onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, result: undefined as unknown };
                      queueMicrotask(() => { r.result = state.getValue(key); r.onsuccess?.(); });
                      return r;
                    },
                  };
                },
              };
            },
          };
          req.onsuccess?.();
        });
        return req;
      },
    };
    return fake;
  }

  it('真探测路径（fake-IDB）：IDB 键缺失=幽灵;键在=非幽灵;typeMismatch=键在非驱逐', async () => {
    const state: FakeIdbState = {
      fail: false,
      getValue: (key: string) => (key === 'sandboxworld.world.1' ? '"save-json"' : undefined),
    };
    (globalThis as { indexedDB?: unknown }).indexedDB = makeFakeIdb(state);
    const kv = await import('../src/save/KvStore');
    const mod = await freshMod();
    // 前置自证：kvGetIdbEx 读面本身语义正确（键缺=keyMissing）
    expect(await kv.kvGetIdbEx('sandboxworld.world.2')).toMatchObject({ value: null, cause: 'keyMissing' });
    const r = await mod.scanEvictedSaves([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], [], undefined);
    expect(r.conclusive).toBe(true);
    // ★BJ618 件3：驱逐实锤（world.2 缺失）后补测 quicksave——本环境 LS 无副本 → 补报
    expect(r.evicted).toEqual([
      { kind: 'world', id: 2, name: 'B' },
      { kind: 'quicksave', id: 0, name: 'quicksave' },
    ]);
    state.getValue = () => 42;   // typeMismatch=键在——非驱逐（损坏面归 BJ605 文案）
    const r2 = await mod.scanEvictedSaves([{ id: 1, name: 'A' }], [], undefined);
    expect(r2.conclusive).toBe(true);
    expect(r2.evicted).toEqual([]);
  });

  it('真探测路径：IDB open 失败 → 不可定谳弃检（BJ605 毒化修复后健康态稳定,弃检安全）', async () => {
    const state: FakeIdbState = { fail: true, getValue: () => undefined };
    (globalThis as { indexedDB?: unknown }).indexedDB = makeFakeIdb(state);
    const mod = await freshMod();
    const r = await mod.scanEvictedSaves([{ id: 1, name: 'A' }], [{ id: 2, name: 'B' }], undefined);
    expect(r.conclusive).toBe(false);
    expect(r.evicted).toEqual([]);
  });
});

describe.skipIf(EXT_MISSING)('BJ611 F组（休眠态）：quota 环比骤降状态机纯核——2026-10-10 用户实测推翻前提'
  + '（Chromium M97+ quota 锚磁盘总容量,C 盘剩 3GB 空闲时 quota 仍 10.3GB,环比抓不到磁盘变紧）'
  + ',触发面已按用户明令摘除（toast 链/状态行 ↓ 角标/sbw.quotaTrend 写入）,纯核保留待 re-arm', () => {
  const GB = 1024 * 1024 * 1024;

  it('纯核状态机：首拍 insufficient→两拍骤降 crash→持续紧张不重报→回升 90% 解除→再骤降再报（re-arm）', async () => {
    const mod = await freshMod();
    const r1 = mod.quotaCrashKind(null, 10 * GB);
    expect(r1.kind).toBe('insufficient');
    expect(r1.next.crashed).toBe(false);
    const r2 = mod.quotaCrashKind(r1.next, 5 * GB);   // −50% 且差 5GB≥32MB——双闸齐中
    expect(r2.kind).toBe('crash');
    expect(r2.next.crashed).toBe(true);
    expect(r2.next.base).toBe(10 * GB);
    const r3 = mod.quotaCrashKind(r2.next, 5.1 * GB);   // 持续紧张（仅回升 2%,<解除线）
    expect(r3.kind).toBe('none');
    expect(r3.next.crashed).toBe(true);
    expect(r3.next.base).toBe(10 * GB);
    const r4 = mod.quotaCrashKind(r3.next, 9.5 * GB);   // 回升至基线 95% ≥90% → 解除
    expect(r4.kind).toBe('recover');
    expect(r4.next.crashed).toBe(false);
    const r5 = mod.quotaCrashKind(r4.next, 4 * GB);     // 解除后再骤降必须再报
    expect(r5.kind).toBe('crash');
  });

  it('防抖双闸（定谳阈值判别）：降幅≥25% 但绝对差 <32MB 不报;绝对差≥32MB 但降幅 <25% 不报', async () => {
    const mod = await freshMod();
    // −30%（降幅闸命中）但差仅 30MB < 32MB → none（绝对最小值防抖的判别面）
    const smallBase: import('../src/save/StoragePersistence').QuotaTrendRecord = { q: 100 * 1024 * 1024, t: 1, crashed: false };
    expect(mod.quotaCrashKind(smallBase, 70 * 1024 * 1024).kind).toBe('none');
    // 差 100MB ≥32MB 但降幅 1% < 25% → none（降幅闸判别面）
    const big = { q: 10 * GB, t: 1, crashed: false };
    expect(mod.quotaCrashKind(big, 10 * GB - 100 * 1024 * 1024).kind).toBe('none');
    // 双闸齐中 → crash
    expect(mod.quotaCrashKind(big, 7 * GB).kind).toBe('crash');
  });

  it('prev 记录损坏（q 非有限数/≤0）→ insufficient 不炸,只记录不判', async () => {
    const mod = await freshMod();
    expect(mod.quotaCrashKind({ q: NaN, t: 1, crashed: false }, 5 * GB).kind).toBe('insufficient');
    expect(mod.quotaCrashKind({ q: 0, t: 1, crashed: false }, 5 * GB).kind).toBe('insufficient');
    expect(mod.quotaCrashKind(undefined as unknown as null, 5 * GB).kind).toBe('insufficient');
  });

  it('LS 往返：noteQuotaSample 写 sbw.quotaTrend（上次值+时间戳+crashed 态）;记录损坏读侧容错', async () => {
    const mod = await freshMod();
    const map = new Map<string, string>();
    const ls = {
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k: string, v: string) => { map.set(k, v); },
    };
    expect(mod.noteQuotaSample(ls, 10 * GB)).toBe('insufficient');
    const rec1 = JSON.parse(map.get(mod.QUOTA_TREND_LS_KEY) as string) as { q: number; t: number; crashed: boolean };
    expect(rec1.q).toBe(10 * GB);
    expect(rec1.crashed).toBe(false);
    expect(mod.noteQuotaSample(ls, 5 * GB)).toBe('crash');
    const rec2 = JSON.parse(map.get(mod.QUOTA_TREND_LS_KEY) as string) as { q: number; crashed: boolean; base?: number };
    expect(rec2.crashed).toBe(true);
    expect(rec2.base).toBe(10 * GB);
    // 读侧容错:记录损坏 → null（=insufficient 重新起账,不炸）
    map.set(mod.QUOTA_TREND_LS_KEY, '{oops');
    expect(mod.readQuotaTrend(ls)).toBeNull();
    map.set(mod.QUOTA_TREND_LS_KEY, JSON.stringify({ q: 'x', t: 1 }));
    expect(mod.readQuotaTrend(ls)).toBeNull();
  });

  // ★摘除注（2026-10-10 用户实测+明令）：refreshStorageStatus 集成两拍（crash 回调/
  // quotaCrash 字段/LS 抛错降级）随触发面摘除一并删除——纯核休眠,接线面已不存在。
});

describe.skipIf(EXT_MISSING)('BJ611 E组：接线结构锚（防回归退化）', () => {
  const codeOf = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');

  it('mainFlow：BJ611 三查接线在位（申请/未授予提醒门/幽灵扫描/保存时 estimate 采样）', () => {
    const s = codeOf('../src/mainFlow.ts');
    expect(s).toContain('void initStoragePersistenceWatch();');
    expect(s).toContain('await requestStoragePersistence()');
    // ★BJ627：提醒记忆面迁 PrefsStore——接线锚随调用面更新（prefLsLike 注入纯核）
    expect(s).toContain("state !== 'granted' && shouldShowPersistNotice(prefLsLike())");
    expect(s).toContain("Lang.text('Mods.SandboxWorld.Toast.StorageNotPersisted')");
    expect(s).toContain('await scanEvictedSaves(worldStore.list(), charStore.list())');
    expect(s).toContain('shouldShowEvictNotice(prefLsLike(), fp)');
    expect(s).toContain("Lang.text('Mods.SandboxWorld.Toast.StorageEvictedNotice', scan.evicted.length)");
    expect(s).toContain('void refreshStorageStatus();');
    // ★摘除回归闸（2026-10-10 用户实测+明令）：quota 骤降预警触发面不得复发
    expect(s).not.toContain('setQuotaCrashHandler');
    expect(s).not.toContain('StorageQuotaCrash');
  });

  it('WorldSelect：存储状态行在位（状态行元素/警示色/StatusLine/每次 reload 刷新）', () => {
    const s = codeOf('../src/ui/WorldSelect.ts');
    expect(s).toContain('sw-vsel-storage');
    expect(s).toContain('sw-storage-warn');
    expect(s).toContain("Lang.text('Mods.SandboxWorld.Storage.StatusLine'");
    expect(s).toContain('void this.refreshStorageLine();');
    // ★摘除回归闸：骤降 ↓ 角标/quotaCrashed 警示腿不得复发
    expect(s).not.toContain('↓');
    expect(s).not.toContain('quotaCrashed');
  });

  it('摘除回归闸（休眠态形状锁）：纯核保留可 re-arm,触发面全链归零', async () => {
    // 纯核休眠面仍在（导出可测,F 组锁定语义）
    const mod = await freshMod();
    expect(typeof mod.quotaCrashKind).toBe('function');
    expect(typeof mod.noteQuotaSample).toBe('function');
    expect((mod as unknown as Record<string, unknown>).setQuotaCrashHandler).toBeUndefined();
    // refreshStorageStatus 正常产出且不再携带 quotaCrash/quotaCrashed 字段
    const st = await mod.refreshStorageStatus();
    expect(st).not.toBeNull();
    expect('quotaCrash' in (st as object)).toBe(false);
    expect('quotaCrashed' in (st as object)).toBe(false);
    const src = codeOf('../src/save/StoragePersistence.ts');
    expect(src).not.toContain('onQuotaCrash');
    expect(src).toContain('休眠态');
  });

  it('数据键格式同构锁：scanEvictedSaves 内嵌键模板与 WorldStore/CharacterStore 未漂移', () => {
    const sp = codeOf('../src/save/StoragePersistence.ts');
    const ws = codeOf('../src/save/WorldStore.ts');
    const cs = codeOf('../src/save/CharacterStore.ts');
    expect(sp).toContain('sandboxworld.world.${m.id}');
    expect(sp).toContain('sandboxworld.player.${m.id}');
    expect(ws).toContain('sandboxworld.world.${id}');
    expect(cs).toContain('sandboxworld.player.${id}');
  });

  it('l10n 双语言键在位（custom 源直读;全语言闸由 l10n-audit 兜）', () => {
    const keys = [
      'SandboxWorld.Toast.StorageNotPersisted',
      'SandboxWorld.Toast.StorageEvictedNotice',
      'SandboxWorld.Storage.StatusLine',
      'SandboxWorld.Storage.PersistGranted',
      'SandboxWorld.Storage.PersistNotGranted',
      'SandboxWorld.Storage.QuotaUnknown',
      'SandboxWorld.Storage.StatusUnknown',
    ];
    for (const f of ['zh-Hans', 'en-US']) {
      const j = JSON.parse(readFileSync(resolve(__dirname, `../../tools/l10n-custom/${f}.json`), 'utf8')) as { Mods: Record<string, string> };
      for (const k of keys) expect(typeof j.Mods[k], `${f} ${k}`).toBe('string');
    }
  });
});
