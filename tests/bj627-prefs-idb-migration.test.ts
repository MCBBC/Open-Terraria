// ★BJ627（2026-10-10 偏好类 localStorage→IndexedDB 迁移,BJ615 登记债「另案」兑现）
// 判别测试。形态定谳=候选 C「IDB 权威+内存缓存」（main.ts boot 链首行 preloadPrefs
// 单飞预载;运行时同步读走内存=零闪变;写链 prefSet=内存写穿+IDB 单写,★LS 零新写）。
//  A. 迁移锁（LS 旧值→IDB+内存;IDB 权威优先;收编不染大值键域;写失败自愈）
//  B. 内存缓存同步读等价（写穿同步读/未预载窗口 LS 兜底等价/prefRemove 三清防复活）
//  C. 写链 IDB 单写（LS 零新写 spy;IDB 不可用不抛=会话内存权威）
//  D. 消费面回归（QuickGate/Research 档案收编/StoragePersistence 提醒门 LsLike 注入/
//     swTrace 环）
//  E. 终态普查锁（src 生产码 localStorage.setItem 仅存登记豁免=LS 零新写终态机械化）
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { installFakeIdb, type FakeIdbHandle } from './fake-idb-util';

// ---- 夹具：fake-IDB + LS spy 桩（单文件共享;beforeEach 全量复位+模块重置——
// PrefsStore 单例 mem/ready 与 KvStore 连接缓存每测翻新） ----
const idb: FakeIdbHandle = installFakeIdb();
const lsMem = new Map<string, string>();
let lsSetCalls = 0;

beforeEach(() => {
  vi.resetModules();
  idb.map.clear();
  idb.state.failOpen = false;
  idb.state.failTx = false;
  idb.dropConnection();
  lsMem.clear();
  lsSetCalls = 0;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => lsMem.get(k) ?? null,
    setItem: (k: string, v: string) => { lsSetCalls++; lsMem.set(k, v); },
    removeItem: (k: string) => void lsMem.delete(k),
    clear: () => lsMem.clear(),
    key: (i: number) => [...lsMem.keys()][i] ?? null,
    get length() { return lsMem.size; },
  } as Storage;
});

const prefs = () => import('../src/save/PrefsStore');
const tick = () => new Promise((r) => setTimeout(r, 0));

// =====================================================================
// A 组：迁移锁
// =====================================================================
describe('BJ627 A组：迁移锁（LS 旧值 → IDB+内存,LS 只读保留）', () => {
  it('① 全域收编：登记键 LS→IDB+内存逐键等值;LS 键保留（只读兜底终态）;收编过程 LS 零写;大值键域不染', async () => {
    lsMem.set('sbw.achievements.v1', '{"done":["eye"]}');
    lsMem.set('sbw.lastCharId', '7');
    lsMem.set('sbw.journeyQuick.time', '1');
    lsMem.set('sbw.research.v2.p3', '{"v":1,"c":{"2":9}}');
    lsMem.set('sw.welcome.announce.acked', '1');
    lsMem.set('swInstallDismissedAt', '1700000000000');
    lsMem.set('swAssetsComplete:ver1', '1');
    lsMem.set('swContentHash:abc', 'deadbeef01');
    lsMem.set('sandboxworld.world.1', 'HUGE-WORLD-SAVE');   // 存档域——不得收编入偏好面
    const { preloadPrefs, prefGet } = await prefs();
    await preloadPrefs();
    await tick();   // 迁移写 fire-and-forget 落库
    expect(idb.map.get('sbw.achievements.v1')).toBe('{"done":["eye"]}');
    expect(idb.map.get('sbw.lastCharId')).toBe('7');
    expect(idb.map.get('sbw.journeyQuick.time')).toBe('1');
    expect(idb.map.get('sbw.research.v2.p3')).toBe('{"v":1,"c":{"2":9}}');
    expect(idb.map.get('sw.welcome.announce.acked')).toBe('1');
    expect(idb.map.get('swInstallDismissedAt')).toBe('1700000000000');
    expect(idb.map.get('swAssetsComplete:ver1')).toBe('1');
    expect(idb.map.get('swContentHash:abc')).toBe('deadbeef01');
    expect(idb.map.has('sandboxworld.world.1'), '存档域大值键不得被偏好收编触碰').toBe(false);
    expect(prefGet('sbw.lastCharId')).toBe('7');            // 内存同步读（零 await）
    expect(lsMem.get('sbw.lastCharId')).toBe('7');          // LS 保留=只读兜底终态（不删）
    expect(lsSetCalls, '收编全程零 LS 写（用户目标铁面）').toBe(0);
  });

  it('② IDB 权威优先：双副本（IDB 新值+LS 陈值）→ 内存取 IDB,绝不读更陈旧 LS 副本（kvGet 同判例）', async () => {
    idb.map.set('sbw.lastCharId', '9');
    lsMem.set('sbw.lastCharId', '5');
    const { preloadPrefs, prefGet } = await prefs();
    await preloadPrefs();
    expect(prefGet('sbw.lastCharId')).toBe('9');
    expect(lsSetCalls).toBe(0);
  });

  it('③ 预载后 miss=全链 miss：未登记键不退 LS（fail-loud 逼登记,防陈旧副本复活）', async () => {
    lsMem.set('sbw.unregistered.key', 'x');
    const { preloadPrefs, prefGet } = await prefs();
    await preloadPrefs();
    expect(prefGet('sbw.unregistered.key')).toBeNull();
  });

  it('④ 迁移写失败自愈：IDB open 失败 → 会话内内存权威（读不断）;修复后新会话重收编成功', async () => {
    lsMem.set('sbw.lastCharId', '7');
    idb.state.failOpen = true;
    idb.dropConnection();
    const { preloadPrefs, prefGet } = await prefs();
    await preloadPrefs();
    await tick();
    expect(prefGet('sbw.lastCharId'), 'IDB 不可用会话内内存仍权威').toBe('7');
    expect(idb.map.has('sbw.lastCharId')).toBe(false);
    expect(lsSetCalls).toBe(0);
    vi.resetModules();          // 新会话
    idb.state.failOpen = false;
    idb.dropConnection();
    const p2 = await prefs();
    await p2.preloadPrefs();
    await tick();
    expect(idb.map.get('sbw.lastCharId'), '恢复后下轮启动重收编（自愈）').toBe('7');
  });
});

// =====================================================================
// B 组：内存缓存同步读等价
// =====================================================================
describe('BJ627 B组：内存缓存同步读等价', () => {
  it('① prefSet 写穿：同步读立即可见（零 await 零闪变）+ IDB 落库 + LS 零写', async () => {
    const { preloadPrefs, prefSet, prefGet } = await prefs();
    await preloadPrefs();
    prefSet('sbw.itemSearchConfirmed', '1');
    expect(prefGet('sbw.itemSearchConfirmed')).toBe('1');
    await tick();
    expect(idb.map.get('sbw.itemSearchConfirmed')).toBe('1');
    expect(lsSetCalls).toBe(0);
  });

  it('② 未预载窗口读序=LS 兜底（与迁移前行为逐字节等价——启动时序保险）', async () => {
    lsMem.set('sbw.lastCharId', '5');
    const { prefGet } = await prefs();
    expect(prefGet('sbw.lastCharId')).toBe('5');
  });

  it('③ prefRemove 三清+复活守卫：内存+LS+IDB 同清;新会话收编序不再复活（BJ618 陈旧指针同族）', async () => {
    idb.map.set('sbw.lastCharId', '9');
    lsMem.set('sbw.lastCharId', '9');
    const { preloadPrefs, prefGet, prefRemove } = await prefs();
    await preloadPrefs();
    await tick();
    prefRemove('sbw.lastCharId');
    await tick();
    expect(prefGet('sbw.lastCharId')).toBeNull();
    expect(lsMem.has('sbw.lastCharId'), 'LS 必清——防收编序复活').toBe(false);
    expect(idb.map.has('sbw.lastCharId')).toBe(false);
    vi.resetModules();
    idb.dropConnection();
    const p2 = await prefs();
    await p2.preloadPrefs();
    expect(p2.prefGet('sbw.lastCharId')).toBeNull();
  });
});

// =====================================================================
// C 组：写链 IDB 单写（LS 零新写 spy）
// =====================================================================
describe('BJ627 C组：写链 IDB 单写', () => {
  it('① 全写面 LS spy 恒 0：小值/重写/删除全程（用户明令「避免写 LS」主判据）', async () => {
    const { preloadPrefs, prefSet, prefRemove, prefGet } = await prefs();
    await preloadPrefs();
    prefSet('sbw.quotaTrend', '{"q":1}');
    prefSet('sbw.quotaTrend', '{"q":2}');        // 重写
    prefSet('sbw.bartenderGift.s1.A', '1');      // 前缀域键
    prefRemove('sbw.quotaTrend');
    expect(prefGet('sbw.bartenderGift.s1.A')).toBe('1');
    await tick();
    expect(idb.map.get('sbw.bartenderGift.s1.A')).toBe('1');
    expect(idb.map.has('sbw.quotaTrend')).toBe(false);
    expect(lsSetCalls, '全程零 LS 新写').toBe(0);
  });

  it('② IDB 不可用：prefSet 不抛+内存会话权威+LS 依旧零写（不回退 LS 写）', async () => {
    idb.state.failOpen = true;
    idb.dropConnection();
    const { prefSet, prefGet } = await prefs();
    expect(() => prefSet('sbw.storagePersistNoticed', '1')).not.toThrow();
    expect(prefGet('sbw.storagePersistNoticed')).toBe('1');
    expect(lsSetCalls).toBe(0);
  });
});

// =====================================================================
// D 组：消费面回归
// =====================================================================
describe('BJ627 D组：消费面回归', () => {
  it('① QuickGate 首用门：旧世界 LS 旗收编后放行;新确认走 IDB（LS spy 0）', async () => {
    lsMem.set('sbw.journeyQuick.weather', '1');
    const { preloadPrefs } = await prefs();
    await preloadPrefs();
    const qg = await import('../src/ui/QuickGate');
    expect(qg.featureGateConfirmed('weather'), '旧 LS 旗经收编仍放行（旧用户零回归）').toBe(true);
    qg.confirmFeatureGate('time');
    expect(qg.featureGateConfirmed('time')).toBe(true);
    await tick();
    expect(idb.map.get('sbw.journeyQuick.time')).toBe('1');
    expect(lsSetCalls).toBe(0);
  });

  it('② Research 默认存储：构造期读收编值;档案收编迁 IDB+全局桶三清;献祭落盘 IDB', async () => {
    lsMem.set('sbw.research.v1', JSON.stringify({ v: 1, c: { '2': 50 } }));
    const { preloadPrefs } = await prefs();
    await preloadPrefs();
    const { Research } = await import('../src/stats/Research');
    const r = new Research();                       // 构造期同步读（预载后=内存）
    r.usePlayerProfile(5);
    expect(r.getSacrificeCount(2)).toBe(50);        // 收编为角色 5 基线
    await tick();
    expect(idb.map.get('sbw.research.v2.p5')).toBeDefined();
    expect(idb.map.has('sbw.research.v1'), '全局桶收编后 IDB 侧同清').toBe(false);
    expect(lsMem.has('sbw.research.v1')).toBe(false);
    r.setSacrificeCountDirectly(2, 60);
    await tick();
    const saved = JSON.parse(idb.map.get('sbw.research.v2.p5') as string) as { c: Record<string, number> };
    expect(saved.c['2']).toBe(60);
    expect(lsSetCalls).toBe(0);
  });

  it('③ StoragePersistence 提醒门：prefLsLike 注入纯核零改动直插;记忆面落 IDB', async () => {
    const { preloadPrefs, prefLsLike } = await prefs();
    await preloadPrefs();
    const sp = await import('../src/save/StoragePersistence');
    const ls = prefLsLike();
    expect(sp.shouldShowPersistNotice(ls)).toBe(true);
    sp.markPersistNoticeShown(ls);
    await tick();
    expect(idb.map.get('sbw.storagePersistNoticed')).toBe('1');
    expect(sp.shouldShowPersistNotice(ls)).toBe(false);
    const fp = sp.evictNoticeFingerprint([{ kind: 'world', id: 3 }]);
    expect(sp.shouldShowEvictNotice(ls, fp)).toBe(true);
    sp.markEvictNoticeShown(ls, fp);
    await tick();
    expect(idb.map.get('sbw.evictNoticeFingerprint')).toBe(fp);
    expect(sp.shouldShowEvictNotice(ls, fp)).toBe(false);
    expect(lsSetCalls).toBe(0);
  });

  it('④ swTrace 环：>120 行自动刷盘落 IDB;readSwTrace 跨会话聚合;LS spy 0', async () => {
    const { preloadPrefs } = await prefs();
    await preloadPrefs();
    const ac = await import('../src/net/AssetCache');
    for (let i = 0; i < 130; i++) ac.swTrace(`line-${i}`);
    await tick();
    const persisted = JSON.parse(idb.map.get('swAssetTrace') as string) as string[];
    expect(persisted.length).toBeGreaterThan(0);
    expect(persisted.some((l) => l.includes('line-120'))).toBe(true);
    expect(ac.readSwTrace().join('\n')).toContain('line-129');
    expect(lsSetCalls).toBe(0);
  });
});

// =====================================================================
// E 组：终态普查锁（静态——「LS 零新写」机械化,新写面回植即爆红）
// =====================================================================
const ROOT = resolve(__dirname, '..');
/** 源码剥行注释后取码面（判定注释含词不误伤,save-binary-deadpath 同款） */
const codeOf = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');
function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

describe('BJ627 E组：LS 零新写终态锁', () => {
  it('① src 生产码 localStorage.setItem 仅存登记豁免（DebugLinePage=debug-line.html 独立调试页,不进主构建链）', () => {
    const hits = walkTs(resolve(ROOT, 'src')).filter((f) => /localStorage\.setItem/.test(codeOf(f.slice(ROOT.length + 1))));
    expect(hits.map((p) => p.slice(ROOT.length + 1)), '新 LS 写面必须登记豁免或改走 PrefsStore')
      .toEqual(['src/debug/DebugLinePage.ts']);
  });

  it('② PrefsStore 写链结构锁：prefSet 无 localStorage.setItem（仅 removeItem 卫生面）;单写走 kvSetIdb', () => {
    const code = codeOf('src/save/PrefsStore.ts');
    expect(code).not.toMatch(/localStorage\.setItem/);
    expect(code).toMatch(/kvSetIdb/);
    expect(code).toMatch(/void kvDeleteIdb/);
  });
});
