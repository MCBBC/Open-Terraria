// Journey 研究内核回归（对照 CreativeItemSacrificesCatalog.cs / ItemsSacrificedUnlocksTracker.cs /
// AchievementsHelper.cs CheckResearchAchievement :387-398）
import { describe, it, expect } from 'vitest';
import { Research, type ResearchData, type ResearchStore } from '../src/stats/Research';

/** 内存持久化（localStorage 门面替身） */
function memStore(): ResearchStore & { peek(): string | null } {
  let s: string | null = null;
  return { load: () => s, save: (v: string) => { s = v; }, peek: () => s };
}

/** 小 need 表（半数门测试专用：可控的 totalItems） */
function smallData(need: Record<string, number>, override: Record<string, number> = {}): ResearchData {
  return { count: Math.max(10, ...Object.keys(need).map(Number)) + 1, need, override };
}

describe('need 表抽样（Sacrifices.tsv → vanilla-research.json）', () => {
  const r = new Research(memStore());
  // 类别字母 → 数量映射抽查（CreativeItemSacrificesCatalog.cs:25-58）：
  it('常用物：类别 D=1（铁镐/再生手环）', () => {
    expect(r.getNeed(1)).toBe(1);    // IronPickaxe D
    expect(r.getNeed(49)).toBe(1);   // BandofRegeneration D
    expect(r.getNeed(50)).toBe(1);   // MagicMirror D
    expect(r.getNeed(54)).toBe(1);   // HermesBoots D
  });
  it('常用物：L=100（泥土/石头/木材/火把）', () => {
    expect(r.getNeed(2)).toBe(100);  // DirtBlock L
    expect(r.getNeed(3)).toBe(100);  // StoneBlock L
    expect(r.getNeed(9)).toBe(100);  // Wood L
    expect(r.getNeed(8)).toBe(100);  // Torch L
  });
  it('常用物：B=25 / K=99 / H=10 / J=30', () => {
    expect(r.getNeed(19)).toBe(25);  // GoldBar B
    expect(r.getNeed(23)).toBe(99);  // Gel K
    expect(r.getNeed(29)).toBe(10);  // LifeCrystal H
    expect(r.getNeed(188)).toBe(30); // HealingPotion J
  });
  it('类别 e（Invalid）不可研究；越界 id 返回 0', () => {
    // tsv 中 Old 系遗留物全部为 E 剔除——取一个负 id 名义项验证解析不炸
    expect(r.getNeed(-24)).toBe(0);
    expect(r.getNeed(999999)).toBe(0);
    expect(r.tryGetSacrificeNumbers(999999)).toBeNull();
  });
  it('need 表规模对账（6089 条 + MusicBoxOWHallow 原版重复行合并）', () => {
    // 提取器对账：6193 数据行 - 103 个 E = 6090 行写入，5040（MusicBoxOWHallow，
    // tsv :5091/:5125 原版重复且同值）合并 → 6089 键
    expect(r.totalItems()).toBe(6089);
    expect(r.completedCount()).toBe(0);
  });
});

describe('override 链（ContentSamples.cs:884-892）', () => {
  it('牺牲品共享解锁目标的计数与 need（单步解析）', () => {
    const store = memStore();
    const r = new Research(store, smallData({ '10': 5 }, { '3': 10 })); // 献祭 3 → 计入 10
    expect(r.getNeed(3)).toBe(5);
    expect(r.sacrifice(3, 2)).toBe(false);
    expect(r.getSacrificeCount(3)).toBe(2);
    expect(r.getSacrificeCount(10)).toBe(2);   // 同一解析后计数器
    expect(r.sacrifice(10, 3)).toBe(true);      // 跨线
    expect(r.isResearched(3)).toBe(true);       // 牺牲品视角同样视为完成
    expect(r.isResearched(10)).toBe(true);
  });
});

describe('献祭幂等（RegisterItemSacrifice cs:115-143）', () => {
  it('已满后再献祭为无操作：不脏、不落盘', () => {
    const store = memStore();
    const r = new Research(store, smallData({ '1': 2 }));
    expect(r.sacrifice(1, 2)).toBe(true);
    const dirty = r.lastEditId;
    store.save('');                              // 清空缓冲区分隔
    expect(r.sacrifice(1, 5)).toBe(false);       // cs:126-129 已满早退
    expect(r.lastEditId).toBe(dirty);            // 未 MarkContentsDirty
    expect(r.getSacrificeCount(1)).toBe(2);
  });
  it('单次超额献祭钳到 need（min(have+amount, need)）', () => {
    const r = new Research(memStore(), smallData({ '2': 100 }));
    expect(r.sacrifice(2, 9999)).toBe(true);
    expect(r.getSacrificeCount(2)).toBe(100);    // 不越 need 线
  });
  it('amount ≤ 0 直接拒绝', () => {
    const r = new Research(memStore(), smallData({ '1': 2 }));
    expect(r.sacrifice(1, 0)).toBe(false);
    expect(r.sacrifice(1, -3)).toBe(false);
    expect(r.getSacrificeCount(1)).toBe(0);
  });
  it('setSacrificeCountDirectly 0..9999 钳位', () => {
    const r = new Research(memStore(), smallData({ '1': 5 }));
    r.setSacrificeCountDirectly(1, 12345);
    expect(r.getSacrificeCount(1)).toBe(9999);
    r.setSacrificeCountDirectly(1, -5);
    expect(r.getSacrificeCount(1)).toBe(0);
    expect(r.isResearched(1)).toBe(false);
  });
});

describe('半数门（CheckResearchAchievement cs:387-398）', () => {
  it('整数除法门：all=3 时完成 1 即过门（1 >= 3/2=1）', () => {
    const fired: number[] = [];
    const r = new Research(memStore(), smallData({ '1': 1, '2': 1, '3': 1 }));
    r.onProgressionEvent = (id) => fired.push(id);
    expect(r.checkResearchAchievement(true)).toBe(false);   // 空库 forced
    expect(r.sacrifice(1, 1)).toBe(true);
    expect(r.checkResearchAchievement()).toBe(true);
    expect(fired).toEqual([45]);                            // TRASH_COMPACTOR
  });
  it('未过半数不触发', () => {
    const fired: number[] = [];
    const r = new Research(memStore(), smallData({ '1': 1, '2': 1, '3': 1, '4': 1 }));
    r.onProgressionEvent = (id) => fired.push(id);
    r.sacrifice(1, 1);
    expect(r.completedCount()).toBe(1);
    expect(r.totalItems()).toBe(4);
    expect(r.checkResearchAchievement()).toBe(false);       // 1 < 4/2=2
    expect(fired).toEqual([]);
  });
  it('版本门：LastEditId 未变时重查为空操作（cs:389-392）', () => {
    const r = new Research(memStore(), smallData({ '1': 1, '2': 1 }));
    expect(r.checkResearchAchievement(true)).toBe(false);
    r.setSacrificeCountDirectly(1, 1);
    r.setSacrificeCountDirectly(2, 1);                      // lastEditId 停在新值
    expect(r.checkResearchAchievement()).toBe(true);        // 版本变了 → 重数 → 过门
    expect(r.checkResearchAchievement()).toBe(false);       // 版本未变 → 早退
    expect(r.checkResearchAchievement(true)).toBe(true);    // forced 重数
  });
});

describe('持久化（sbw.research.v1）', () => {
  it('计数跨实例存活；损坏数据静默丢弃', () => {
    const store = memStore();
    const a = new Research(store, smallData({ '1': 3 }));
    a.sacrifice(1, 2);
    const b = new Research(store, smallData({ '1': 3 }));
    expect(b.getSacrificeCount(1)).toBe(2);
    expect(b.lastEditId).toBe(0);                           // lastEditId 不持久（原版同样仅内存）
    store.save('not json');
    const c = new Research(store, smallData({ '1': 3 }));
    expect(c.getSacrificeCount(1)).toBe(0);
  });
  it('reset 清空计数并置脏（cs:205-213）', () => {
    const store = memStore();
    const r = new Research(store, smallData({ '1': 1 }));
    r.sacrifice(1, 1);
    r.reset();
    expect(r.getSacrificeCount(1)).toBe(0);
    expect(r.isResearched(1)).toBe(false);
    expect(new Research(store, smallData({ '1': 1 })).getSacrificeCount(1)).toBe(0);
  });
});
