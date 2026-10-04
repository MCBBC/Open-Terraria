// BJ506 图鉴面板样式+功能对齐原版 1:1——判别面测试（2026-10-04）。
// 定谳锚 = Terarria1457 全文亲读（1456 交叉参照；冲突以 1457 为准）：
//   UIBestiaryTest.cs / UI.Elements/{UIBestiaryEntryGrid,EntryButton,EntryIcon,
//   NPCEntryPortrait,EntryInfoPage,SortingOptionsGrid,FilteringOptionsGrid,
//   UIBestiaryInfoLine,UIBestiaryInfoItemLine,UIColoredSliderSimple,UIHorizontalSeparator,
//   GroupOptionButton,UIWrappedSearchBar,UISearchBar,UIPanel,UIText,UIImageButton}.cs /
//   Bestiary/{Filters,SortingSteps,BestiaryEntry,BestiaryDatabaseNPCsPopulator,
//   NPCStatsReportInfoElement,NPCKillCounterInfoElement,NamePlateInfoElement,
//   NPCPortraitInfoElement,FlavorText,ItemDrop,FilterProviderInfoElement,
//   UnlockableNPCEntryIcon,NPCNetIdBestiaryInfoElement}.cs /
//   DataStructures/{EntrySorter,EntryFilterer}.cs / Utils.PrettifyPercentDisplay / Colors。
// 面向：百分比/掉率文案、筛选全集 60、EntrySorter 排序链、ByStat 沉底、图鉴编号、
//   掉落行注册序+世界难度门、源文本结构锁（卡形态/锚点规则/类目序/交互面）。
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import {
  prettifyPercentDisplay, dropRateText, BESTIARY_FILTER_DEFS, BESTIARY_SORT_KEYS,
  BESTIARY_SORT_OPTIONS, sortLabel, bestiaryRows, sortBestiaryRows, filterBestiaryRows,
  flattenDropsForNpc, bestiaryFilterAvailable, DEFAULT_BESTIARY_FILTER,
  bestiaryRepNpcId, type BestiarySortKey,
} from '../src/ui/BestiaryPanel';
import { BestiaryTracker, UnlockState, bestiaryEntries, bestiaryGating, bestiaryRarityStars, bestiarySortingId } from '../src/data/Bestiary';

beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});
beforeEach(() => { bestiaryGating.unlockAll = false; });
afterEach(() => { bestiaryGating.unlockAll = true; });

// ============ 百分比/掉率文案（Utils.PrettifyPercentDisplay Utils.cs:1140 1:1） ============

describe('BJ506 百分比文案（PrettifyPercentDisplay：TrimEnd 0/%/空格 → TrimEnd ./空格 → TrimStart 0/空格 → +%）', () => {
  it('P2 主径：小数两位、尾零全剥（0.5→"50%"、0.25→"25%"、0.8297→"82.97%"、1/3→"33.33%"）', () => {
    expect(prettifyPercentDisplay(0.8297)).toBe('82.97%');
    expect(prettifyPercentDisplay(0.5)).toBe('50%');
    expect(prettifyPercentDisplay(0.25)).toBe('25%');
    expect(prettifyPercentDisplay(1 / 3)).toBe('33.33%');
    expect(prettifyPercentDisplay(0.05)).toBe('5%');
  });

  it('边界：1→"100%"（"100.00"尾零剥到 "1"+"00" 不跨界）；0→"%"（前导零剥净的原版习癖，机械照抄）', () => {
    expect(prettifyPercentDisplay(1)).toBe('100%');
    expect(prettifyPercentDisplay(0)).toBe('%');
  });

  it('P4 低位径（<0.001）：0.0004 → ".04%"（TrimStart 剥前导零——原版同款显示）', () => {
    expect(prettifyPercentDisplay(0.0004, 4)).toBe('.04%');
    expect(prettifyPercentDisplay(0.0005, 4)).toBe('.05%');
  });

  it('掉率文案（UIBestiaryInfoItemLine.GetDropInfo :77-101）：恒 1 →"100%"；<0.001 用 P4；其余 P（2 位）', () => {
    expect(dropRateText(1)).toBe('100%');
    expect(dropRateText(1 / 70)).toBe('1.43%');
    expect(dropRateText(1 / 2500)).toBe('.04%');    // mechSpawn 召唤物 1/2500
    expect(dropRateText(0.001)).toBe('.1%');         // 恰不小于 0.001 → P2（TrimStart 剥前导零）
    expect(dropRateText(0.5)).toBe('50%');
  });
});

// ============ 筛选全集（RegisterFilters populator :493-503 + Filters.cs） ============

describe('BJ506 筛选全集 60（ByUnlockState→ByBoss→ByRareCreature→57 环境标签，注册序 1:1）', () => {
  it('60 项；首三 = 三专用 Filters（帧 62/63 = Icon_Tags_Shadow Frame(16,5,14,3)/(16,5,15,3)，-1 = Icon_Rank_Light）', () => {
    expect(BESTIARY_FILTER_DEFS).toHaveLength(60);
    expect(BESTIARY_FILTER_DEFS[0]).toMatchObject({ key: 'unlocked', frame: 62, nameKey: 'BestiaryInfo.IfUnlocked' });
    expect(BESTIARY_FILTER_DEFS[1]).toMatchObject({ key: 'boss', frame: 63, nameKey: 'BestiaryInfo.IsBoss' });
    expect(BESTIARY_FILTER_DEFS[2]).toMatchObject({ key: 'rare', frame: -1, nameKey: 'BestiaryInfo.IsRare' });
  });

  it('帧号换算语义：62→(14,3)/63→(15,3)（Filters.cs :78/:142 的 Frame(16,5,x,y) → X=frame%16,Y=frame/16）', () => {
    for (const f of [62, 63]) {
      expect(f % 16).toBe(14 + f - 62);
      expect(Math.floor(f / 16)).toBe(3);
    }
  });

  it('tags 语义（EntryFilterer.FitsFilter OR 合取 EntryFilterer.cs:37-56）：unlocked=解锁集；boss=Boss 集；二筛激活 = 并集', () => {
    const t = new BestiaryTracker();
    t.registerKill(3);   // 僵尸解锁（非 Boss）
    const rows = bestiaryRows(t);
    const byUnlocked = filterBestiaryRows(rows, { ...DEFAULT_BESTIARY_FILTER, tags: ['unlocked'] });
    expect(byUnlocked.length).toBeGreaterThanOrEqual(1);
    expect(byUnlocked.every((r) => r.state > UnlockState.NotKnown)).toBe(true);
    expect(byUnlocked.some((r) => r.entry.creditId === 'Zombie')).toBe(true);
    // OR 合取：boss ∪ unlocked ≥ 两单集；未解锁 Boss 不因 unlocked 激活而现身
    const bossSet = new Set(filterBestiaryRows(rows, { ...DEFAULT_BESTIARY_FILTER, tags: ['boss'] }));
    const union = filterBestiaryRows(rows, { ...DEFAULT_BESTIARY_FILTER, tags: ['boss', 'unlocked'] });
    expect(union.length).toBeGreaterThanOrEqual(bossSet.size);
    for (const r of union) {
      expect(bossSet.has(r) || r.state > UnlockState.NotKnown).toBe(true);
    }
  });

  it('可用性（GetIsFilterAvailableForEntries :193-208）：unlocked 恒可用（ForcedDisplay=true）；boss 全锁定时不可用、解锁 Boss 后可用', () => {
    const locked = bestiaryRows(new BestiaryTracker());
    expect(bestiaryFilterAvailable('unlocked', locked)).toBe(true);
    expect(bestiaryFilterAvailable('boss', locked)).toBe(false);
    const t = new BestiaryTracker();
    t.registerKill(4);   // 克苏鲁之眼（Boss）
    expect(bestiaryFilterAvailable('boss', bestiaryRows(t))).toBe(true);
  });
});

// ============ 排序（EntrySorter 全链 DataStructures/EntrySorter.cs:17-36 + SortingSteps.cs） ============

describe('BJ506 排序步表（RegisterSortSteps populator :472-488，1456 :476-486 同序）', () => {
  it('注册序 9 步 = UnlockState→BestiaryID→Alpha→NetId→Attack→Defense→Coins→HP→Rarity；默认步 = Steps[0]（EntrySorter._prioritizedStep int 缺省 0）', () => {
    expect(BESTIARY_SORT_KEYS).toEqual(['unlocks', 'bestiaryId', 'alpha', 'id', 'attack', 'defense', 'coins', 'hp', 'rarity']);
    expect(BESTIARY_SORT_KEYS[0]).toBe('unlocks');
  });

  it('弹层可见步 = 7（HiddenFromSortOptions=false；ByUnlockState/ByNetId 两隐藏步不进表——SortingSteps.cs :13/:42）', () => {
    expect(BESTIARY_SORT_OPTIONS).toEqual(['bestiaryId', 'alpha', 'attack', 'defense', 'coins', 'hp', 'rarity']);
    expect(BESTIARY_SORT_OPTIONS).not.toContain('unlocks');
    expect(BESTIARY_SORT_OPTIONS).not.toContain('id');
  });

  it('全键文案齐备（弹层 GroupOptionButton 文本 = GetDisplayNameKey）', () => {
    for (const k of BESTIARY_SORT_KEYS as BestiarySortKey[]) expect(sortLabel(k).length).toBeGreaterThan(0);
  });
});

describe('BJ506 排序链（优先步 → 注册序其余步兜底）', () => {
  it('ByStat 沉底：城镇/小动物条目无 stats 卡（TownNPC/Critter 工厂不挂，BestiaryEntry.cs:61-109）→ hp/coins 排序中全部沉到敌怪之后', () => {
    bestiaryGating.unlockAll = true;
    const rs = bestiaryRows(new BestiaryTracker());
    sortBestiaryRows(rs, 'hp');
    let lastEnemy = -1;
    let firstNull = Infinity;
    rs.forEach((r, i) => {
      if (r.entry.kind === 'enemy') { if (i > lastEnemy) lastEnemy = i; }
      else if (i < firstNull) firstNull = i;
    });
    // 至少各有一类存在（546 = 418 敌怪 + 40 城镇 + 88 小动物）
    expect(lastEnemy).toBeGreaterThan(-1);
    expect(firstNull).toBeLessThan(Infinity);
    expect(firstNull).toBeGreaterThan(lastEnemy);   // 无卡行全部沉底
  });

  it('链兜底可观测：rarity 步同星并列时，注册序次步（unlocks）先决——唯一已解锁条目站其星档首位', () => {
    const t = new BestiaryTracker();
    t.registerKill(3);   // 僵尸（星 = bestiaryRarityStars(3)，非 Boss 普怪低星档）
    const rows = bestiaryRows(t);
    sortBestiaryRows(rows, 'rarity');
    const zStars = bestiaryRarityStars(3);
    const cohort = rows.filter((r) => bestiaryRarityStars(r.npcId) === zStars);
    expect(cohort.length).toBeGreaterThan(1);
    expect(cohort[0].entry.creditId).toBe('Zombie');   // 同星档内 unlocks 兜底：已解锁唯一 → 首位
  });

  it('unlocks 步（ByUnlockState :40-55）：解锁档降序、未解锁沉底', () => {
    const t = new BestiaryTracker();
    t.registerKill(3);
    const rs = bestiaryRows(t);
    sortBestiaryRows(rs, 'unlocks');
    expect(rs[0].state).toBeGreaterThan(UnlockState.NotKnown);
    expect(rs[rs.length - 1].state).toBe(UnlockState.NotKnown);
  });
});

// ============ 图鉴编号（NPCNetIdBestiaryInfoElement.BestiaryDisplayIndex → 左上角数字） ============

describe('BJ506 图鉴编号（网格左上角 = ContentSamples.NpcBestiarySortingId[NetId]）', () => {
  it('546 行编号两两不同且 ≥1（DisplayIndex 每格一牌；★判例：重复 creditId 归并行 Nymph×2/Scarecrow1×10 各持独立 entryId——编号取 entryId 而非 rep npcId，否则 546 行只有 536 号）', () => {
    const rows = bestiaryRows(new BestiaryTracker());
    expect(rows).toHaveLength(546);
    const ids = new Set(rows.map((r) => bestiarySortingId(r.entryId)));
    expect(ids.size).toBe(546);
    for (const id of ids) expect(id).toBeGreaterThanOrEqual(1);
    // rep npcId 口径确有撞号（本刀前行为）——锁死差异本体
    const byRep = new Set(rows.map((r) => bestiarySortingId(r.npcId)));
    expect(byRep.size).toBe(536);
  });
});

// ============ 掉落行（注册序 + CanShowItemDropInUI 世界难度门） ============

describe('BJ506 掉落行（UIBestiaryInfoItemLine 顺序 = 规则注册序；ShouldShowItem :31-46 难度门）', () => {
  it('行序 = 注册序（无 chance 排序——两连调用恒同序确定）', () => {
    const a = flattenDropsForNpc(3);
    const b = flattenDropsForNpc(3);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('经典世界（difficulty 0）：专家/大师行全隐（NotExpert 条件 CanShowItemDropInUI=false）', () => {
    for (const id of [3, 4, 50]) {
      const classic = flattenDropsForNpc(id, 0);
      expect(classic.every((d) => d.tag !== 'IsExpert' && d.tag !== 'IsMasterMode')).toBe(true);
    }
  });

  it('难度单调：专家 ⊇ 经典、大师 ⊇ 专家（克苏鲁之眼 4 有 bossBag 专家行）', () => {
    const c = flattenDropsForNpc(4, 0);
    const e = flattenDropsForNpc(4, 1);
    const m = flattenDropsForNpc(4, 2);
    expect(e.length).toBeGreaterThanOrEqual(c.length);
    expect(m.length).toBeGreaterThanOrEqual(e.length);
    expect(e.some((d) => d.tag === 'IsExpert')).toBe(true);
    expect(c.some((d) => d.tag === 'IsExpert')).toBe(false);
  });
});

// ============ 源文本结构锁（卡形态/锚点规则/类目序/交互面——防静默回退） ============

describe('BJ506 结构锁（BestiaryPanel.ts 源文本锚）', () => {
  const src = readFileSync('src/ui/BestiaryPanel.ts', 'utf8');

  it('卡形态：Slot_Back/Overlay/Front/Selection 四层 + 编号左上（EntryButton :40-93）', () => {
    expect(src).toContain('UI_Bestiary_Slot_Back.png');
    expect(src).toContain('UI_Bestiary_Slot_Overlay.png');
    expect(src).toContain('UI_Bestiary_Slot_Front.png');
    expect(src).toContain('UI_Bestiary_Slot_Selection.png');
    expect(src).toContain("'sw-bst-idx'");
    expect(src).toContain('bestiarySortingId(r.entryId)');
  });

  it('图标盒锚点规则：noGravity 中心锚 / 有重力底锚 -8（UnlockableNPCEntryIcon.UpdatePosition :112-123）', () => {
    expect(src).toContain('noGravity');
    expect(src).toContain('boxH - 8 - fh / 2 + oy');
    expect(src).toContain('boxH / 2 + oy');
  });

  it('详情类目序 Nameplate→FlavorText→Stats→ItemsFromDrops→Misc（GetBestiaryInfoCategory :174-201 枚举序）', () => {
    const order = ['── Nameplate', '── FlavorText', '── Stats', '── ItemsFromDrops', '── Misc'].map((m) => src.indexOf(m));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  it('交互面：滚轮 = 详情栏滚动（ScrollWheel :850-854），无滚轮翻页；筛选/排序/搜索不重置页偏移（FixBestiaryRange(+0)）', () => {
    expect(src).toContain('infoEl.scrollTop += e.deltaY');
    // 旧自创面拆除锚（精确类名锚——'sw-bst-nameplate' 含子串，需按整 token 断言）
    expect(src).not.toContain('sw-bst-chip');
    expect(/'sw-bst-name'/.test(src)).toBe(false);
    expect(src).not.toContain('.sw-bst-cell.sel');
    expect(src).not.toContain('Mods.SandboxWorld.Bestiary.ClickHint');
    // 页偏移仅钳制（clampBestiaryOffset(this.offset, 0, …)——refresh 路径零位移）
    expect(src).toContain('clampBestiaryOffset(this.offset, 0, this.working.length, perPage)');
  });

  it('面板文案：排序钮右恒显当前步名/筛选钮右恒显计数（UpdateBestiaryContents :439-440）；搜索占位 = UI.PlayerNameSlot（未传 emptyText 缺省）；底栏百分比走 Prettify', () => {
    expect(src).toContain('sortLabel(this.sortKey)');
    expect(src).toContain("Lang.text('BestiaryInfo.Filters')");
    expect(src).toContain('UI.PlayerNameSlot');
    expect(src).toContain("prettifyPercentDisplay(pct)");
    expect(src).toContain("Lang.text('UI.Back')");
  });

  it('详情页解锁门：风味/属性 ≥Stats、掉落 ≥DropsNoRates、出没 >NotKnown、NotKnown 名"???"', () => {
    expect(src).toContain('if (st >= UnlockState.Stats)');
    expect(src).toContain('if (st >= UnlockState.DropsNoRates)');
    expect(src).toContain('if (st > UnlockState.NotKnown)');
    expect(src).toContain("st > UnlockState.NotKnown ? r.name : '???'");
  });

  it('击杀计数进详情栏（NPCKillCounterInfoElement）；网格格内无名/无杀数（原版卡只有图标+编号）', () => {
    expect(src).toContain("'sw-bst-kills'");
    expect(src).toContain('r.kills >= 1');
    // fillGrid 函数体内无 kills/name 文本节点
    const fillGrid = src.slice(src.indexOf('private fillGrid()'), src.indexOf('private drawPortrait'));
    expect(fillGrid).not.toContain('kills');
    expect(fillGrid).not.toContain('sw-bst-name');
  });
});
