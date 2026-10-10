// ★BJ615（2026-10-10 存储链单写方案，用户明令「存储链避免把任何信息写入
// localStorage，第一优先 IndexedDB」）判别测试：
//  A. kvSet 摘 LS 写（恒 IDB，LS spy 零新写；'local' 返值档退役——全库普查零消费方）
//  B. kvGet LS 兜底读保留（★兼容锁：双写时代 IDB 写失败过用户的旧副本仍可救——
//     只摘写不摘读=旧副本自然陈化、新数据 IDB 单写）
//  C. kvDelete 双删保留（清历史残留）
//  D. BJ605 写失败 'fail' 语义锁（消费面 save/importSlot/duplicate/quicksave 只判 'fail'）
//  E. BJ611 幽灵判据（单写后新档天然无 LS 副本=keyMissing 即幽灵；defaultEvictProbe
//     保留的 LS 检查只对双写时代旧副本生效——副本在=kvGet 兜底可救=非幽灵）
//  F. 消费方行为回归（WorldStore/CharacterStore/quicksave 通道 round-trip 全走 IDB）
import { describe, it, expect, beforeEach } from 'vitest';
import { installFakeIdb, type FakeIdbHandle } from './fake-idb-util';

// ---- 夹具：fake-IDB + LS spy 桩（单文件共享;beforeEach 全量复位） ----
const idb: FakeIdbHandle = installFakeIdb();
const lsMem = new Map<string, string>();
let lsSetCalls = 0;

beforeEach(() => {
  idb.map.clear();
  idb.state.failOpen = false;
  idb.dropConnection();   // KvStore 模块级 dbPromise 缓存清零——每测重连当前垫
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

const kv = () => import('../src/save/KvStore');

describe('BJ615 A组：kvSet 单写（LS 写摘除）', () => {
  it('① kvSet 后 LS 零新写：spy 恒 0,返回值恒 \'idb\'（≤2MB 与 >2MB 语义面收拢为恒一）', async () => {
    const { kvSet } = await kv();
    expect(await kvSet('sandboxworld.world.1', '{"header":{}}')).toBe('idb');
    expect(lsSetCalls, '≤2MB 档不得再写 LS（旧双写快路径已摘）').toBe(0);
    expect(lsMem.has('sandboxworld.world.1')).toBe(false);
    const big = 'x'.repeat(2 * 1024 * 1024 + 1);
    expect(await kvSet('sandboxworld.world.2', big)).toBe('idb');
    expect(lsSetCalls, '>2MB 档同样零 LS 写').toBe(0);
  });

  it('④ BJ605 \'fail\' 语义锁：IDB 不可用 → \'fail\',且 LS 亦无副本（写失败检测链不变）', async () => {
    const { kvSet } = await kv();
    idb.state.failOpen = true;
    idb.dropConnection();
    expect(await kvSet('sandboxworld.world.4', 'data')).toBe('fail');
    expect(lsSetCalls, '\'fail\' 态 LS 也不落副本（旧实现 ≤2MB 会落=幽灵温床面之一）').toBe(0);
    idb.state.failOpen = false;
    idb.dropConnection();
    expect(await kvSet('sandboxworld.world.4', 'data')).toBe('idb');   // 恢复即可写（连败 1 < 3,退避未触发）
  });
});

describe('BJ615 B组：LS 兜底读保留（旧用户兼容锁）', () => {
  it('② kvGet IDB 优先；IDB miss + LS 有旧副本 → 读到（旧用户数据不因摘写消失）', async () => {
    const { kvSet, kvGet } = await kv();
    await kvSet('sandboxworld.world.1', '{"v":"新档-IDB"}');
    lsMem.set('sandboxworld.world.1', '{"v":"旧副本-LS"}');
    expect(await kvGet('sandboxworld.world.1'), 'IDB 优先：有 IDB 档绝不读更陈旧 LS 副本')
      .toBe('{"v":"新档-IDB"}');
    idb.map.delete('sandboxworld.world.1');   // 模拟 IDB 被驱逐/键缺失
    expect(await kvGet('sandboxworld.world.1'), 'LS 兜底读救援（双写时代遗留副本）')
      .toBe('{"v":"旧副本-LS"}');
  });
});

describe('BJ615 C组：kvDelete 双删保留', () => {
  it('③ IDB+LS 都清（防 kvGet 兜底读到已删残留）', async () => {
    const { kvSet, kvGet, kvDelete } = await kv();
    await kvSet('sandboxworld.world.3', 'idb-data');
    lsMem.set('sandboxworld.world.3', 'ls-legacy');
    await kvDelete('sandboxworld.world.3');
    expect(idb.map.has('sandboxworld.world.3')).toBe(false);
    expect(lsMem.has('sandboxworld.world.3')).toBe(false);
    expect(await kvGet('sandboxworld.world.3')).toBeNull();
  });
});

describe('BJ615 E组：BJ611 幽灵判据（单写后 keyMissing 即幽灵;LS 旧副本可救=非幽灵）', () => {
  it('⑤ world.1 IDB 有=非幽灵;world.2 IDB 缺+LS 缺=幽灵;world.3 IDB 缺+LS 旧副本=非幽灵（可救）', async () => {
    const mod = await import('../src/save/StoragePersistence');
    const { kvSet } = await kv();
    // 前置自证：BJ615 kvSet 落 IDB 不落 LS（新档天然无 LS 副本）
    await kvSet('sandboxworld.world.1', '"w1"');
    expect(lsMem.has('sandboxworld.world.1')).toBe(false);
    lsMem.set('sandboxworld.world.3', '"legacy"');   // 双写时代旧副本
    const r = await mod.scanEvictedSaves(
      [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], [], undefined);
    expect(r.conclusive).toBe(true);
    // ★BJ618 件3：驱逐实锤（world.2 缺失）后补测 quicksave——LS 无副本 → 补报
    expect(r.evicted).toEqual([
      { kind: 'world', id: 2, name: 'B' },
      { kind: 'quicksave', id: 0, name: 'quicksave' },
    ]);
  });
});

describe('BJ615 F组：消费方行为回归（存储链 round-trip 全走 IDB）', () => {
  it('⑥ WorldStore save/load/duplicate + CharacterStore create/get + 新实例真落库,全链 LS 零写', async () => {
    const { WorldStore } = await import('../src/save/WorldStore');
    const { CharacterStore } = await import('../src/save/CharacterStore');
    const { defaultAppearance } = await import('../src/player/Appearance');
    const ws = new WorldStore();
    const m = await ws.register({ name: 'BJ615', seed: 's', w: 4200, h: 1200, difficulty: 0, evil: -1 });
    await ws.save(m, '{"header":{"name":"BJ615"}}', 1234);
    expect(await ws.load(m)).toBe('{"header":{"name":"BJ615"}}');
    const c = await ws.duplicate(m);
    expect(await ws.load(c!)).toBe('{"header":{"name":"BJ615"}}');
    const ws2 = new WorldStore();   // 新实例=真落库（非内存态）
    await ws2.ensureLoaded();
    expect(ws2.list()).toHaveLength(2);

    const cs = new CharacterStore();
    const cm = await cs.create(defaultAppearance('BJ615'));
    const cs2 = new CharacterStore();
    await cs2.ensureLoaded();
    expect(cs2.list()).toHaveLength(1);
    expect((await cs2.get(cm.id))?.name).toBe('BJ615');
    expect(lsSetCalls, '存储链全消费方零 LS 写').toBe(0);
  });

  it('⑥b quicksave 通道（mainFlow 同款调用形）：kvSet(QUICK_SAVE_KEY)→kvGet 回读', async () => {
    const { kvSet, kvGet } = await kv();
    const json = '{"header":{"name":"quick","width":64}}';
    expect(await kvSet('sandboxworld.quicksave', json)).toBe('idb');
    expect(await kvGet('sandboxworld.quicksave')).toBe(json);
    expect(lsSetCalls).toBe(0);
  });
});
