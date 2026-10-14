// ★成就域守卫(2026-10-14):mod 成就注册/条件翻译/直接完成/持久化回放。
//   锚:Achievements(mod defs 并入+completeMod+待办回放)/modAchievements(spec→
//   AchDef 五 kind 翻译+图标 job)。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

class MemStorage {
  reg = '[]';
  zips = new Map<string, Blob>();
  async getRegistry() { return this.reg; }
  async setRegistry(json: string) { this.reg = json; }
  async putZip(id: string, blob: Blob) { this.zips.set(id, blob); return true; }
  async getZip(id: string) { return this.zips.get(id) ?? null; }
  async deleteZip(id: string) { this.zips.delete(id); }
}
const nodeEntryLoader = async (): Promise<unknown> => undefined;

beforeEach(() => vi.resetModules());

describe('成就域:mod 成就 API', () => {
  it('spec 五 kind 翻译/自动驱动(custom 直完)/持久化回放', async () => {
    // ---- 装载(npc+item mod)----
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const { loadModsPhase1, getModLoadResult } = await import('../src/mods/loader');
    const { collectModAchievement, buildModAchievementDefs, completeModAchievement,
      modAchIconJobs, _resetModAchievementsForTests } = await import('../src/mods/modAchievements');
    const { modAchDefOf } = await import('../src/core/Achievements');
    const { ITEM_BY_KEY } = await import('../src/data/items');

    const png = new Uint8Array(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    const bytes = zipSync({
      'mod.json': strToU8(JSON.stringify({ id: 'achm', name: 'achm', version: '1.0.0', api: 1, side: 'both' })),
      'content/npcs/my_boss.json': strToU8(JSON.stringify({
        key: 'my_boss', name: 'TestBoss', aiStyle: 0, lifeMax: 100, damage: 10, defense: 0,
        width: 16, height: 16, texture: 'npc/b.png',
      })),
      'textures/npc/b.png': png,
      'content/items/my_mat.json': strToU8(JSON.stringify({ key: 'my_mat', name: 'Mat', value: 1 })),
    });
    const storage = new MemStorage();
    const store = new ModStore(storage as never);
    await store.install(readModPack(bytes).manifest, bytes);
    await loadModsPhase1(storage, { entryLoader: nodeEntryLoader });
    const alloc = getModLoadResult()!.allocation!;

    // ---- 注册三成就(自动驱动×2+custom×1+图标)----
    collectModAchievement('achm', 'slay', {
      title: '屠龙者', desc: '击败测试 Boss', category: 0,
      conditions: [{ kind: 'npcKilled', keys: ['my_boss'] }],
    });
    collectModAchievement('achm', 'collect', {
      title: '收藏家',
      conditions: [{ kind: 'itemPickup', keys: ['my_mat', 23] }],   // mod 键+原版裸 vid
    });
    collectModAchievement('achm', 'custom_done', {
      title: '自管完成',
      conditions: [{ kind: 'custom' }],
    });
    buildModAchievementDefs(alloc);

    // 翻译面:mod 键→分配 id/裸数字直传/custom→flag
    const slay = modAchDefOf('mod_achm_slay');
    expect(slay?.title).toBe('屠龙者');
    expect(slay?.conditions[0]!.ids).toEqual([alloc.npcs.get('mod_achm_my_boss')]);
    const collect = modAchDefOf('mod_achm_collect');
    expect(collect?.conditions[0]!.ids).toEqual([alloc.items.get('mod_achm_my_mat'), 23]);
    expect(modAchDefOf('mod_achm_custom_done')?.conditions[0]!.kind).toBe('flag');
    expect(modAchIconJobs()).toHaveLength(0);   // 无 icon 声明=零 job

    // ---- 实例:自动驱动(NPC kill 通知)+custom 直完+持久化回放 ----
    const { Achievements } = await import('../src/core/Achievements');
    const mem: { s: string | null } = { s: null };
    const a = new Achievements({ load: () => mem.s, save: (j) => { mem.s = j; } });
    expect(a.defList().some((d) => d.name === 'mod_achm_slay')).toBe(true);

    a.notifyNPCKilled(alloc.npcs.get('mod_achm_my_boss')!);   // 引擎通知自动驱动
    expect(a.isCompleted('mod_achm_slay')).toBe(true);

    completeModAchievement('achm', 'custom_done');            // 无实例? 有 __swGame? 测试无=__swGame 缺→待办;
    // 本断言前先直调实例面验证 completeMod 本体
    a.completeMod('mod_achm_custom_done');
    expect(a.isCompleted('mod_achm_custom_done')).toBe(true);
    a.flush();
    expect(mem.s).toContain('"mod_achm_slay"');
    expect(mem.s).toContain('"mod_achm_custom_done"');

    // 持久化回放(新实例,mod defs 在册=ctor 并入后完成态恢复)
    const a2 = new Achievements({ load: () => mem.s, save: (j) => { mem.s = j; } });
    expect(a2.isCompleted('mod_achm_slay')).toBe(true);
    expect(a2.isCompleted('mod_achm_custom_done')).toBe(true);
  }, 60_000);

  it('重复注册 fail-fast;未注册完成引用抛错', async () => {
    const { collectModAchievement, completeModAchievement, _resetModAchievementsForTests } =
      await import('../src/mods/modAchievements');
    collectModAchievement('x1', 'a1', { title: 'A', conditions: [{ kind: 'custom' }] });
    expect(() => collectModAchievement('x1', 'a1', { title: 'A2', conditions: [{ kind: 'custom' }] })).toThrow(/重复注册/);
    expect(() => completeModAchievement('x1', 'ghost')).toThrow(/未注册成就/);
    _resetModAchievementsForTests();
  });
});
