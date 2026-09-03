// 图鉴详情头像装饰叠层 + 标签筛选（2026-09-03 三项清偿①）——对照 Terarria1457：
//  叠层：NPCPortraitInfoElement.cs:73-84（解锁后收集 IBestiaryBackgroundOverlayAndColorProvider
//        且 GetBackgroundOverlayImage()!=null，偏好命中 flag2 整批短路）+
//        UIBestiaryNPCEntryPortrait.cs:43-54（叠层与底图同一目标盒拉伸居中，色 =
//        GetBackgroundOverlayColor() ?? Color.Lerp(White, portraitColor, 0.5)）。
//        挂载源 = BestiaryDatabaseNPCsPopulator.AddNPCBiomeRelationships_AddDecorations_
//        Automated(:1942-1987) 的 Visuals.* 装饰 + Events.Sandstorm（:88，Info 直挂）。
//  筛选：Filters.cs（ByRareCreature :89-103 / ByInfoElement :135-166）+ RegisterFilters
//        （populator :493-503 注册序）+ EntryFilterer.FitsFilter（EntryFilterer.cs:37-56，
//        激活筛选 OR 合取）+ UIBestiaryFilteringOptionsGrid（perRow 12/32² 钮/可用性门）。
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';
import spawnData from '../src/data/vanilla-bestiary-spawn.json';
import {
  bestiaryPortraitOverlays, bestiaryPortraitPrefHit, bestiaryPortraitBackground,
  bestiaryRows, filterBestiaryRows, applyBestiaryChip, bestiaryFilterAvailable,
  BESTIARY_FILTER_DEFS, DEFAULT_BESTIARY_FILTER,
} from '../src/ui/BestiaryPanel';
import { BestiaryTracker, UnlockState, bestiaryGating, isRareSpawnForBestiary } from '../src/data/Bestiary';

beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});
beforeEach(() => { bestiaryGating.unlockAll = false; });
afterEach(() => { bestiaryGating.unlockAll = true; });

type OV = ReturnType<typeof bestiaryPortraitOverlays>;

/** 叠层三元组摘要（贴图|色|优先级） */
const sig = (ovs: OV) => ovs.map((o) => `${o.overlay}|${o.color?.join(',') ?? 'null'}|${o.priority}`);

describe('详情头像装饰叠层（AddNPCBiomeRelationships_AddDecorations_Automated 推导）', () => {
  it('夜间（Times.NightTime）→ 月亮 MapBGOverlay4 白色（Visuals.Moon :1965）', () => {
    // 僵尸 3 注册序 ['Times.NightTime']（populator 夜行族）
    expect(sig(bestiaryPortraitOverlays(3))).toEqual(['MapBGOverlay4|255,255,255,255|1']);
  });

  it('白天（Times.DayTime）→ 太阳 MapBGOverlay3（Visuals.Sun :1969）；不落月', () => {
    // 绿史莱姆 1 = ['Biomes.Surface','Times.DayTime']
    expect(sig(bestiaryPortraitOverlays(1))).toEqual(['MapBGOverlay3|255,255,255,255|1']);
  });

  it('雨（Events.Rain 且非雪原）→ 雨 MapBGOverlay2 (200,200,200)（Visuals.Rain :1955）', () => {
    // 雨史莱姆 224 = ['Events.Rain','Biomes.Surface']
    expect(sig(bestiaryPortraitOverlays(224))).toEqual(['MapBGOverlay2|200,200,200,255|1']);
  });

  it('★Rain 分支 continue 语义：雨夜史莱姆 223 = Rain+NightTime 双注册 → 只有雨不落月（:1947-1958 提前 continue）', () => {
    expect(sig(bestiaryPortraitOverlays(223))).toEqual(['MapBGOverlay2|200,200,200,255|1']);
  });

  it('雨+雪原（243）→ 暴雪 MapBGOverlay6 替代雨（:1950-1952 二分支）；Events.Blizzard 直挂无叠层图不收集', () => {
    expect(sig(bestiaryPortraitOverlays(243))).toEqual(['MapBGOverlay6|255,255,255,255|1']);
  });

  it('日食（158）→ 食日 MapBGOverlay5（Visuals.EclipseSun :1961）', () => {
    expect(sig(bestiaryPortraitOverlays(158))).toEqual(['MapBGOverlay5|255,255,255,255|1']);
  });

  it('南瓜月（305）→ MapBGOverlay8；霜月（338）→ MapBGOverlay9（:1973-1977）', () => {
    expect(sig(bestiaryPortraitOverlays(305))).toEqual(['MapBGOverlay8|255,255,255,255|1']);
    expect(sig(bestiaryPortraitOverlays(338))).toEqual(['MapBGOverlay9|255,255,255,255|1']);
  });

  it('陨石群系（23）→ Moon+Meteor 双挂（:1980-1983 MapBGOverlay7），不含 NightTime 路径', () => {
    const ovs = bestiaryPortraitOverlays(23);
    expect(sig(ovs)).toEqual([
      'MapBGOverlay4|255,255,255,255|1',
      'MapBGOverlay7|255,255,255,255|1',
    ]);
  });

  it('Events.Sandstorm（541/546）= Info 直挂叠层 MapBGOverlay1，DisplayPriority 0（无 Visuals 同挂：沙暴族无时间条件）', () => {
    expect(sig(bestiaryPortraitOverlays(541))).toEqual(['MapBGOverlay1|255,255,255,255|0']);
    // 510 = UndergroundDesert×2+Desert+Sandstorm：仍仅沙暴叠层
    expect(sig(bestiaryPortraitOverlays(510))).toEqual(['MapBGOverlay1|255,255,255,255|0']);
  });

  it('DisplayPriority 稳定升序（NPCPortraitInfoElement :84 OrderBy；同 priority 保注册序）', () => {
    const ovs = bestiaryPortraitOverlays(23);
    for (let i = 1; i < ovs.length; i++) {
      expect(ovs[i].priority).toBeGreaterThanOrEqual(ovs[i - 1].priority);
    }
  });

  it('无出没环境注册 → 空集不炸', () => {
    expect(bestiaryPortraitOverlays(-99)).toEqual([]);
    expect(bestiaryPortraitOverlays(999)).toEqual([]);   // 域外 id
  });

  it('偏好命中（AddTags）→ 底图锁定且叠层整批不画（:77 flag2 短路）——世吞 6 腐化偏好', () => {
    expect(bestiaryPortraitPrefHit(6, false)).toBe(true);
    expect(bestiaryPortraitPrefHit(3, false)).toBe(false);
    // 偏好命中也改变底图：6 = 腐化 MapBG6 锁定（原 bestiaryPortraitBackground 行为保持）
    expect(bestiaryPortraitBackground(6, false).image).toBe('MapBG6');
    // 世界恶双路（BasedOnWorldEvil）按 crimson 取一
    expect(bestiaryPortraitPrefHit(533, false)).toBe(true);
    expect(bestiaryPortraitPrefHit(533, true)).toBe(true);
  });
});

describe('标签筛选注册表（RegisterFilters + GetCommonInfoElementsForFilters）', () => {
  it('全集 = ByRareCreature + 57 条 ByInfoElement（populator :495-502）', () => {
    const common = (spawnData as unknown as { commonFilters: string[] }).commonFilters;
    expect(common).toHaveLength(57);
    expect(BESTIARY_FILTER_DEFS).toHaveLength(58);
    expect(BESTIARY_FILTER_DEFS[0]).toMatchObject({ key: 'rare', nameKey: 'BestiaryInfo.IsRare', frame: -1 });
    expect(BESTIARY_FILTER_DEFS.slice(1).map((d) => d.key)).toEqual(common);
  });

  it('图标帧号 = populator 各元素第 2 构造参数（提取表 priority；FilterProviderInfoElement :24-29 帧 16×5）', () => {
    const conds = (spawnData as unknown as { conditions: Record<string, { priority: number; key: string }> }).conditions;
    for (const d of BESTIARY_FILTER_DEFS.slice(1)) {
      expect(d.frame).toBe(conds[d.key].priority);
      expect(d.nameKey).toBe(conds[d.key].key);
      expect(d.frame).toBeGreaterThanOrEqual(0);
      expect(d.frame).toBeLessThan(16 * 5);   // 80 帧表（480×150 ÷ 30²）
    }
  });

  it('全部筛选悬停名有官译（Language.GetTextValue(GetDisplayNameKey)）', () => {
    for (const d of BESTIARY_FILTER_DEFS) {
      expect(Lang.has(d.nameKey), d.nameKey).toBe(true);
      expect(Lang.text(d.nameKey).length).toBeGreaterThan(0);
    }
  });

  it('排序锚点抽查：Surface(0)/Sandstorm(43)/StardustPillar(59)——GetCommonInfoElementsForFilters :252-311 注册序', () => {
    const byKey = new Map(BESTIARY_FILTER_DEFS.map((d) => [d.key, d]));
    expect(byKey.get('Biomes.Surface')?.frame).toBe(0);
    expect(byKey.get('Events.Sandstorm')?.frame).toBe(43);
    expect(byKey.get('Biomes.StardustPillar')?.frame).toBe(59);
    expect(BESTIARY_FILTER_DEFS[1].key).toBe('Biomes.Surface');          // 列表首
    expect(BESTIARY_FILTER_DEFS[2].key).toBe('Times.DayTime');           // :253 DayTime 第二
    expect(BESTIARY_FILTER_DEFS[BESTIARY_FILTER_DEFS.length - 1].key).toBe('Biomes.StardustPillar');
  });
});

describe('Filters 语义（EntryFilterer.FitsFilter OR 合取 + 可用性门）', () => {
  const rowsAll = () => bestiaryRows(new BestiaryTracker());
  const rowsUnlocked = () => {
    bestiaryGating.unlockAll = true;
    return bestiaryRows(new BestiaryTracker());
  };

  it('ByRareCreature：NPC.rarity≠0 命中（Nymph 45 / Rainbow Slime 172），僵尸不命中', () => {
    expect(isRareSpawnForBestiary(45)).toBe(true);
    expect(isRareSpawnForBestiary(172)).toBe(true);
    expect(isRareSpawnForBestiary(3)).toBe(false);
    const rare = filterBestiaryRows(rowsUnlocked(), { ...DEFAULT_BESTIARY_FILTER, tags: ['rare'] });
    expect(rare.length).toBeGreaterThan(0);
    expect(rare.every((r) => isRareSpawnForBestiary(r.npcId))).toBe(true);
  });

  it('ByInfoElement：出没环境注册表含路径即命中（Biomes.TheUnderworld → 47 地狱幽灵等）', () => {
    const hell = filterBestiaryRows(rowsUnlocked(), { ...DEFAULT_BESTIARY_FILTER, tags: ['Biomes.TheUnderworld'] });
    expect(hell.length).toBeGreaterThan(0);
    expect(hell.every((r) => ((spawnData as unknown as { byNpc: Record<string, string[]> }).byNpc[String(r.npcId)] ?? []).includes('Biomes.TheUnderworld'))).toBe(true);
  });

  it('激活筛选 OR 合取（EntryFilterer.FitsFilter :43-56）：underworld ∪ rare = 两单筛集之并', () => {
    const unlocked = rowsUnlocked();
    // 行对象同一性（三筛同源 bestiaryRows 数组）——归并族条目共享 creditId,不能按串去重
    const a = new Set(filterBestiaryRows(unlocked, { ...DEFAULT_BESTIARY_FILTER, tags: ['Biomes.TheUnderworld'] }));
    const b = new Set(filterBestiaryRows(unlocked, { ...DEFAULT_BESTIARY_FILTER, tags: ['rare'] }));
    const u = filterBestiaryRows(unlocked, { ...DEFAULT_BESTIARY_FILTER, tags: ['Biomes.TheUnderworld', 'rare'] });
    // OR：每一行至少命中一个激活筛选
    for (const r of u) expect(a.has(r) || b.has(r)).toBe(true);
    // 行数恰为两单筛集之并（允许交：稀有地狱怪同属两集）
    expect(u.length).toBe(new Set([...a, ...b]).size);
    expect(u.length).toBeLessThan(a.size + b.size);   // 交非空实证
  });

  it('标签层与其余维度（search/kind/boss）AND 合取；空标签集 = 不过滤', () => {
    const unlocked = rowsUnlocked();
    const base = filterBestiaryRows(unlocked, { ...DEFAULT_BESTIARY_FILTER, kind: 'enemy', tags: ['Biomes.TheUnderworld'] });
    expect(base.every((r) => r.entry.kind === 'enemy')).toBe(true);
    // 空 tags 不过滤（ActiveFilters.Count==0 → 全过）
    expect(filterBestiaryRows(unlocked, { ...DEFAULT_BESTIARY_FILTER }).length).toBe(unlocked.length);
  });

  it('ToggleFilter（applyBestiaryChip tag）：含则移除否则加入；不污染默认表', () => {
    const f1 = applyBestiaryChip(DEFAULT_BESTIARY_FILTER, 'tag', undefined, 'Biomes.Surface');
    expect(f1.tags).toEqual(['Biomes.Surface']);
    const f2 = applyBestiaryChip(f1, 'tag', undefined, 'Biomes.Surface');
    expect(f2.tags).toEqual([]);
    expect(DEFAULT_BESTIARY_FILTER.tags).toEqual([]);
  });

  it('可用性门（GetIsFilterAvailableForEntries :183-198）：存在已解锁命中条目才可用', () => {
    // 全未解锁 → 任何筛选不可用（ForcedDisplay 非 null 族）
    expect(bestiaryFilterAvailable('Biomes.Surface', rowsAll())).toBe(false);
    expect(bestiaryFilterAvailable('rare', rowsAll())).toBe(false);
    // 全解锁 → 有命中的筛选用
    expect(bestiaryFilterAvailable('Biomes.Surface', rowsUnlocked())).toBe(true);
    expect(bestiaryFilterAvailable('rare', rowsUnlocked())).toBe(true);
  });

  it('标签层与解锁档 chip AND 组合正确（unlocked:yes 排除 NotKnown）', () => {
    const t = new BestiaryTracker();
    const f = { ...DEFAULT_BESTIARY_FILTER, tags: ['Biomes.TheUnderworld'], unlocked: 'yes' as const };
    const got = filterBestiaryRows(bestiaryRows(t), f);
    expect(got.every((r) => r.state > UnlockState.NotKnown)).toBe(true);
  });
});
