// WorldStore 多世界槽位 + quicksave 迁移（stub localStorage）
import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { WorldStore } = await import('../src/save/WorldStore');
const { parseSeed, randomWorldName } = await import('../src/world/gen/SeedEasterEggs');

describe('WorldStore', () => {
  beforeEach(() => mem.clear());

  it('注册/列表/保存/读取', async () => {
    const s = new WorldStore();
    const m = await s.register({ name: '测试世界', seed: 'abc', w: 4200, h: 1200, difficulty: 0, evil: -1 });
    expect(m.id).toBeGreaterThanOrEqual(1);
    await s.ensureLoaded();
    expect(s.list()).toHaveLength(1);
    await s.save(m, '{"header":{"name":"测试世界"}}', 60000);
    expect(await s.load(m)).toBe('{"header":{"name":"测试世界"}}');
    expect(s.list()[0].playTimeMs).toBe(60000);
  });

  it('收藏优先排序 + 最近游玩在前', async () => {
    const s = new WorldStore();
    const a = await s.register({ name: 'a', seed: '1', w: 4200, h: 1200, difficulty: 0, evil: -1 });
    const b = await s.register({ name: 'b', seed: '2', w: 4200, h: 1200, difficulty: 0, evil: -1 });
    await s.save(b, '{}', 0);
    await new Promise((r) => setTimeout(r, 5));
    await s.save(a, '{}', 0); // a 更近游玩
    expect(s.list().map((x) => x.name)).toEqual(['a', 'b']);
    await s.setFavorite(b.id, true);
    expect(s.list().map((x) => x.name)).toEqual(['b', 'a']);
  });

  it('删除后 id 不复用', async () => {
    const s = new WorldStore();
    const a = await s.register({ name: 'a', seed: '1', w: 4200, h: 1200, difficulty: 0, evil: -1 });
    const b = await s.register({ name: 'b', seed: '2', w: 4200, h: 1200, difficulty: 0, evil: -1 });
    await s.delete(a.id);
    const c = await s.register({ name: 'c', seed: '3', w: 4200, h: 1200, difficulty: 0, evil: -1 });
    expect(c.id).toBeGreaterThan(b.id);
    expect(s.list().map((x) => x.name)).toEqual(['b', 'c']);
  });

  it('复制带副本后缀并带数据', async () => {
    const s = new WorldStore();
    const a = await s.register({ name: '家园', seed: '9', w: 4200, h: 1200, difficulty: 1, evil: 0 });
    await s.save(a, '{"data":1}', 100);
    const c = await s.duplicate(a);
    expect(c?.name).toBe('家园 副本');
    expect(await s.load(c!)).toBe('{"data":1}');
  });

  it('quicksave 迁移（幂等）', async () => {
    mem.set('sandboxworld.quicksave', JSON.stringify({
      header: { name: '旧档', seed: 42, width: 4200, height: 1200, created: 123, playTimeMs: 777 },
    }));
    const s = new WorldStore();
    await s.ensureLoaded();
    const list = s.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('旧档');
    expect(list[0].playTimeMs).toBe(777);
    // 二次加载不重复迁移
    const s2 = new WorldStore();
    await s2.ensureLoaded();
    expect(s2.list()).toHaveLength(1);
  });
});

describe('SeedEasterEggs', () => {
  it('彩蛋种子识别（去分隔符小写）', () => {
    expect(parseSeed('not the bees').flags.crimsonForce).toBe(true);
    expect(parseSeed('ForTheWorthy').flags.getGoodWorld).toBe(true);
    expect(parseSeed('05162020').flags.drunkWorld).toBe(true);
    expect(parseSeed('getfixedboi').flags.everything).toBe(true);
    expect(parseSeed('普通种子').flags).toEqual({});
  });

  it('特殊世界名映射', () => {
    expect(parseSeed('notthebees').specialName).toBe('not the bees');
    expect(parseSeed('xyz').specialName).toBeNull();
  });

  it('随机世界名非空且 ≤30 字符', () => {
    for (let i = 0; i < 20; i++) {
      const n = randomWorldName();
      expect(n.length).toBeGreaterThan(0);
      expect(n.length).toBeLessThanOrEqual(30);
    }
  });
});
