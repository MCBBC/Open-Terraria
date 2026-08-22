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
const { parseSeed } = await import('../src/world/gen/SeedEasterEggs');
const { randomWorldName } = await import('../src/i18n/RandomText');

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
    // list() 排序键 = 收藏→lastPlayed→name→id（1.4.5.6 UIWorldSelect）——同毫秒并列
    // 才落 name 档；高并发下注册跨毫秒即翻转顺序（曾 ['c','b'] flake）。此处本意
    // 只验"删除后成员集合正确"，顺序无关化
    expect(s.list().map((x) => x.name).sort()).toEqual(['b', 'c']);
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
    expect(parseSeed('not the bees').flags.notTheBees).toBe(true);
    expect(parseSeed('ForTheWorthy').flags.getGoodWorld).toBe(true);
    expect(parseSeed('05162020').flags.drunkWorld).toBe(true);
    expect(parseSeed('getfixedboi').flags.everything).toBe(true);
    expect(parseSeed('普通种子').flags).toEqual({});
  });

  it('特殊种子 int 路（S0-2：零填充/正负号/CRC 碰撞串经 TranslateSeed 比对命中）', () => {
    // drunk：唯一纯数字路由（SpecialSeedValues {5162020}，SpecialSeedNames 为空）
    expect(parseSeed('5162020').flags.drunkWorld).toBe(true);
    expect(parseSeed('005162020').flags.drunkWorld).toBe(true);
    expect(parseSeed('-5162020').flags.drunkWorld).toBe(true);
    expect(parseSeed(' 5162020 ').flags.drunkWorld).toBe(true);
    // CRC32 碰撞串（大小写敏感，对原文算；int 路比对=TranslateSeed 有符号直比，无 Abs）
    expect(parseSeed('now aunt brush').flags.drunkWorld).toBe(true);
    expect(parseSeed('disapprove stiff solution').flags.drunkWorld).toBe(true);
    // "Joke Disappear Horizon" 的 CRC32 = -5162020（负）——原版 GetOptionFromSeedText
    // 对 CRC 路不做 Abs（WorldFileData.cs:399-410 Abs 只在 int.TryParse 分支），
    // 有符号比对不命中（wiki 该条目与反编译码不符，以码为准）
    expect(parseSeed('Joke Disappear Horizon').flags.drunkWorld).toBeFalsy();
    // 自造别名退役：原版 SpecialSeedNames 为空
    expect(parseSeed('drunkworld').flags.drunkWorld).toBeFalsy();
    // celeb：{5162021, 5162011} int 路 + celebrationmk10 文本路
    expect(parseSeed('05162021').flags.tenthAnniversary).toBe(true);
    expect(parseSeed('-5162011').flags.tenthAnniversary).toBe(true);
    expect(parseSeed('celebration mk10!').flags.tenthAnniversary).toBe(true);
    expect(parseSeed('5162021').flags.tenthAnniversary).toBe(true);
  });

  it('getfixedboi 七依赖全置（WorldSeedOption_Everything.Dependencies，S0-2 补齐）', () => {
    const f = parseSeed('getfixedboi').flags;
    expect(f.everything).toBe(true);
    expect(f.remix).toBe(true);
    expect(f.drunkWorld).toBe(true);
    expect(f.notTheBees).toBe(true);
    expect(f.noTraps).toBe(true);
    expect(f.theConstant).toBe(true);
    expect(f.tenthAnniversary).toBe(true);
    expect(f.getGoodWorld).toBe(true);
  });

  it('秘密种子明文路由 37/37（明文经 BCrypt 对注册码逐枚验证，S0-2）', () => {
    const CASES: Array<[string, keyof import('../src/world/gen/SeedEasterEggs').SeedFlags]> = [
      ['monochrome', 'paintEverythingGray'],
      ['negative infinity', 'paintEverythingNegative'],
      ['invisible plane', 'coatEverythingEcho'],
      ['x-ray vision', 'coatEverythingIlluminant'],
      ['mole people', 'noSurface'],
      ['save the rainforest', 'extraLivingTrees'],
      ['the care bears movie', 'extraFloatingIslands'],
      ['I am error', 'errorWorld'],
      ['night of the living dead', 'graveyardBloodmoonStart'],
      ['such great heights', 'surfaceIsInSpace'],
      ['bring a towel', 'rainsForAYear'],
      ['abandoned manors', 'biggerAbandonedHouses'],
      ['how did I get here', 'randomSpawn'],
      ['beam me up', 'addTeleporters'],
      ['too easy', 'startInHardmode'],
      ['fish mox', 'noInfection'],
      ['does that sparkle', 'hallowOnTheSurface'],
      ['purify this', 'infectedSeed'],
      ['toadstool', 'surfaceIsMushrooms'],
      ['sandy britches', 'surfaceIsDesert'],
      ['truck stop', 'pooEverywhere'],
      ['arachnophobia', 'noSpiderCaves'],
      ['more traps please', 'actuallyNoTraps'],
      ['rainbow road', 'rainbowStuff'],
      ['jagged rocks', 'digExtraHoles'],
      ['planetoids', 'roundLandmasses'],
      ['waterpark', 'extraLiquid'],
      ["we don't even test for that", 'portalGunInChests'],
      ['winter is coming', 'worldIsFrozen'],
      ['pumpkin season', 'halloweenGen'],
      ['hocus pocus', 'endlessHalloween'],
      ['jingle all the way', 'endlessChristmas'],
      ['what a horrible night to have a curse', 'vampireSeed'],
      ['royale with cheese', 'teamBasedSpawns'],
      ['double daring dangers', 'dualDungeons'],
      ['electric boogaloo', 'moreLightning'],
      ['calm before the storm', 'noLightning'],
    ];
    expect(CASES).toHaveLength(37);
    for (const [plain, flag] of CASES) {
      const f = parseSeed(plain).flags as Record<string, boolean>;
      expect(f[flag as string], plain).toBe(true);
    }
    // 归一化变体同门 + 非明文不误触
    expect(parseSeed('bEam-me_Up!').flags.addTeleporters).toBe(true);
    expect(parseSeed('dracula').flags.vampireSeed).toBeFalsy();
    // 秘密种子不产特殊世界名（原版两体系独立）
    expect(parseSeed('monochrome').specialName).toBeNull();
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
