// ★BJ616 红蓝对抗 review 探针（只取证不落刀）：BJ605/611/614/615 五刀新面的同族漏网/
// 读序竞态候选 findings 物证。每 probe 对应报告一条 finding 编号；全部走 fake-IDB + LS 桩
// 真实读写链（与 bj615/world-store 测试同垫），模块级 nextId/backoff 状态用 vi.resetModules
// 隔离（模拟双标签页=两个模块实例）。
// ★BJ618（2026-10-10 存储链清偿 B 批）转正注：F2/F5/F6/F8 四 probe 已随 tests/
// bj618-storage-clearance-b.test.ts 落刀收口,本文件四处断言翻转为修复后行为（守护
// 回归）;F1/F3/F4/F7 仍为未清偿 findings 物证（F1 降级面=用户拍板接受,F3 并发重入
// 未入批,F4 前半=kvGet 原语语义未动,F7 typeMismatch 面未入批）。
// ★BJ620（2026-10-10 存储链清偿 C 批）转正注：F3（并发重入=promise 记忆化）与
// F7（kvHas×恢复链语义分裂=kvGetIdbEx cause 分诊）已随 tests/
// bj620-storage-clearance-c.test.ts 落刀收口,两处断言再翻转为修复后行为（守护
// 回归）;F1/F4 仍为未清偿 findings 物证（F1 降级面=用户拍板接受,F4 前半=kvGet
// 原语语义维持——Store 载入面已全部改三段择源,原语语义不动面=登记）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installFakeIdb } from './fake-idb-util';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;
const idb = installFakeIdb();

const QS = JSON.stringify({ header: { name: '旧世界', seed: 1, width: 100, height: 100, created: 1700000000000 } });

beforeEach(() => {
  mem.clear();
  idb.map.clear();
  idb.state.failOpen = false;
  idb.dropConnection();
  vi.resetModules();   // 每 probe 全新模块态（nextId/openFailStreak/backoff 各自独立=模拟独立标签页）
});

describe('BJ616 探针（findings 物证，非守护测试）', () => {
  it('F1【多标签页】双 tab 独立 nextId → 数据键碰撞覆盖 + index 全量覆写互踩（A 世界整档丢失）', async () => {
    const { WorldStore: WS1 } = await import('../src/save/WorldStore');
    const a = new WS1();
    await a.ensureLoaded();                    // tab A：空 index
    vi.resetModules();                         // 独立模块实例=tab B（独立 nextId）
    const { WorldStore: WS2 } = await import('../src/save/WorldStore');
    const b = new WS2();
    await b.ensureLoaded();                    // tab B：同为空 index（A 尚未写 index）

    const ma = await a.register({ name: 'A世界', seed: 'a', w: 100, h: 100, difficulty: 0, evil: -1 });
    await a.save(ma, '{"header":{"name":"A世界"}}', 1000);
    const mb = await b.register({ name: 'B世界', seed: 'b', w: 100, h: 100, difficulty: 0, evil: -1 });
    await b.save(mb, '{"header":{"name":"B世界"}}', 2000);

    // 第三方 fresh 读：A 世界的 meta 被 B 的 saveIndex 全量覆写吃掉，且数据键被 B 覆盖
    vi.resetModules();
    const { WorldStore: WS3 } = await import('../src/save/WorldStore');
    const c = new WS3();
    await c.ensureLoaded();
    expect(mb.id, '双 tab 各自 nextId=1 → 数据键 sandboxworld.world.1 碰撞').toBe(ma.id);
    expect(c.list().map((m) => m.name)).toEqual(['B世界']);   // A 世界 meta 蒸发
    expect(await c.load(c.list()[0])).toBe('{"header":{"name":"B世界"}}');   // A 数据被覆盖
    expect(await c.load(c.list()[0])).not.toContain('A世界');
  });

  it('F2【★BJ618 件1 转正】quicksave→world.1 迁移写 kvSet fail 已检 → 零幽灵槽（原证据：meta 照常入列=单档幽灵）', async () => {
    mem.set('sandboxworld.quicksave', QS);
    idb.state.failOpen = true;
    idb.dropConnection();
    const { WorldStore: WS } = await import('../src/save/WorldStore');
    const s = new WS();
    await s.ensureLoaded();
    expect(s.list(), '迁移写败不入列——单档幽灵已封（判别测试=tests/bj618-storage-clearance-b.test.ts A组）').toHaveLength(0);
    expect(idb.map.has('sandboxworld.world.1'), '数据键确实未落库').toBe(false);
  });

  it('F3【★BJ620 件1 转正】ensureLoaded 并发重入门在位 → 迁移支单走（原证据：双并发调用各 push 一条 id=1）', async () => {
    mem.set('sandboxworld.quicksave', QS);
    const { WorldStore: WS } = await import('../src/save/WorldStore');
    const s = new WS();
    await Promise.all([s.ensureLoaded(), s.ensureLoaded()]);   // boot 扫描(mainFlow:364) × quickLoad(loadFromKey:942) 同型并发
    const ids = s.list().map((m) => m.id);
    expect(ids.filter((i) => i === 1).length, '并发共享在途 promise——单条 id=1（旧实现两条重复）').toBe(1);
  });

  it('F4【BJ615×BJ614 读序】LS 陈旧副本非空时 loadFromKey 的 FS 恢复链永不可达（kvGet 门恒开）', async () => {
    // IDB 被驱逐形态：数据键不在 IDB,双写时代 LS 副本幸存且陈旧;FS 备份有更新档
    mem.set('sandboxworld.world.1', '{"header":{"name":"升级前陈旧档"}}');
    // loadFromKey 链序（mainFlow.ts:976-983）：text=await kvGet(key) → if(!text) 才 restoreFromBackup
    // kvGet 语义（KvStore.ts:183-187）：IDB miss → LS 兜底 → 本断言证明 text 恒非空 → 恢复链被短路
    const { kvGet } = await import('../src/save/KvStore');
    expect(await kvGet('sandboxworld.world.1')).toBe('{"header":{"name":"升级前陈旧档"}}');
    // 陈旧 LS index 同型：IDB index 被驱逐 → 陈旧 LS index 复活已删 meta（删除后升级期外删的世界）
    mem.set('sandboxworld.worlds.index', JSON.stringify([{ id: 7, name: '已删世界', seed: '', w: 1, h: 1, difficulty: 0, evil: -1, createdAt: 0, lastPlayed: 0, playTimeMs: 0, favorite: false }]));
    const { kvGet: kvGet2 } = await import('../src/save/KvStore');
    const raw = await kvGet2('sandboxworld.worlds.index');
    expect(JSON.parse(raw as string)).toHaveLength(1);   // 陈旧 index 顶掉 FS 的 worlds.index.json 新档
  });

  it('F5【★BJ618 件4 转正】删档后陈旧 lastCharId 失效+FS 快照清理 API 在位（原证据：陈旧 lastCharId 复活已删随身态）', async () => {
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    const m = await s.create({ name: 'X', difficulty: 0 } as never);
    await s.setState(m.id, { inventory: [] } as never);
    mem.set('sbw.lastCharId', String(m.id));
    await s.delete(m.id);
    expect(idb.map.has(`sandboxworld.playerstate.${m.id}`), 'delete 双清生效').toBe(false);
    // ★件4：指向被删 id 的 lastCharId 已失效——doSave 的 charContextId() 不再以已删 id
    // 复写 state 键（原证据：不随 delete 失效 → setState 无主复活）
    expect(mem.has('sbw.lastCharId'), '指向被删 id 的 lastCharId 已清').toBe(false);
    // ★件4：FsBackup 快照组清理 API 在位（删除成功后由 mainFlow 接线清同 (kind,id) 组）
    const fs = await import('../src/save/FsBackup');
    expect(typeof (fs as Record<string, unknown>).fsBackupSnapshot).toBe('function');
    expect((fs as { pickRotatingOut?: unknown }).pickRotatingOut).toBeTypeOf('function');
    expect((fs as { fsBackupPurgeSnapshots?: unknown }).fsBackupPurgeSnapshots).toBeTypeOf('function');
  });

  it('F6【★BJ618 件3 转正】quicksave 三面补齐：恢复面映射+幽灵扫描补测（原证据：三面全无裸奔）', async () => {
    const { backupTargetOfKey } = await import('../src/save/FsBackup');
    expect(backupTargetOfKey('sandboxworld.quicksave'), '恢复面已映射（覆盖式单档 quicksave.json）').toEqual({ kind: 'quicksave', id: 0 });
    // 幽灵扫描面：确认驱逐实锤后补测 quicksave（健康态不补测防全新安装误报——详 StoragePersistence）
    const sp = await import('../src/save/StoragePersistence');
    const r = await sp.scanEvictedSaves([{ id: 2, name: 'B' }], [],
      async (key) => (key === 'sandboxworld.world.1' ? 'present' : 'keyMissing'));
    expect(r.evicted.map((e) => e.kind), 'quicksave 已入幽灵扫描').toContain('quicksave');
    // 快照面锚：doSave quicksave 写成功链尾 fsBackupSnapshot('quicksave',…)（判别测试=bj618 C2/C5）
  });

  it('F8【★BJ618 件2 转正】CharacterStore 数据面写败已接导出兜底+回滚+抛错（原证据：全程静默）', async () => {
    idb.state.failOpen = true;
    idb.dropConnection();
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    const exported: unknown[] = [];
    s.onWriteFailData = (...args: unknown[]) => { exported.push(args); };
    await expect(s.create({ name: 'X', difficulty: 0 } as never),
      'create 双写全败 → 抛（调用方角色创建 UI 可感知）').rejects.toThrow();
    expect(s.list(), '回滚：内存 index 不留幽灵槽').toHaveLength(0);
    expect(exported, '自动导出兜底回调已发').toHaveLength(1);
    expect([...idb.map.keys()].filter((k) => k.startsWith('sandboxworld.player')).length, 'IDB 零落库').toBe(0);
    await expect(s.setState(1, { inventory: [] } as never), 'setState 写败同样抛+导出').rejects.toThrow();
  });

  it('F7【★BJ620 件2 转正】typeMismatch（非 string 值）时恢复链被咨询（原证据：kvHas 真→恢复链被短路）', async () => {
    idb.map.set('sandboxworld.player.5', { not: 'a string' });
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    let restoreAsked = false;
    s.onRestoreMiss = async () => { restoreAsked = true; return '{"name":"恢复"}'; };
    expect(await s.get(5)).not.toBeNull();
    expect(restoreAsked, 'typeMismatch 键亦咨询恢复链（kvHas getKey 「键在」语义分裂已修=kvGetIdbEx cause 分诊;判别测试=tests/bj620-storage-clearance-c.test.ts B组）').toBe(true);
  });
});
