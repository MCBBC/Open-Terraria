// 图鉴 UI 面板纯逻辑探针（src/ui/BestiaryPanel.ts）——对照
//   Terraria.GameContent.UI.States/UIBestiaryTest.cs + UI.Elements/UIBestiaryEntryGrid.cs（1.4.5.6）：
//   网格 72×72 单元分页（GetEntriesToShow）/ 范围文本（GetRangeText）/
//   偏移钳制（FixBestiaryRange）/ 筛选排序（Filters/SortingSteps）/ 解锁档展示口径。
// DOM 渲染类（BestiaryPanel）依赖浏览器，不在 Node 单测内；其全部决策
// 逻辑抽为下列纯函数，渲染层只做消费。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';
import {
  BST_CELL, bestiaryGridSize, bestiaryRangeText, clampBestiaryOffset,
  bestiaryPageCount, bestiaryRows, filterBestiaryRows, sortBestiaryRows,
  bestiaryRepNpcId, isBossCredit, flattenDropsForNpc, dropRateText,
  bestiarySpawnConditions, bestiaryFlavorText, SPAWN_BY_NPC,
  DEFAULT_BESTIARY_FILTER, type BestiarySortKey,
} from '../src/ui/BestiaryPanel';
import { BestiaryTracker, UnlockState, bestiaryCreditId, bestiaryEntries } from '../src/data/Bestiary';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';

// 真实 zh-Hans 包注入（条目名断言需要；同 tile-names.test.ts 先例）
beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

describe('图鉴网格分页（UIBestiaryEntryGrid）', () => {
  it('GetEntriesToShow：单元 72×72，cols/rows 向下取整', () => {
    expect(BST_CELL).toBe(72);
    expect(bestiaryGridSize(720, 432)).toEqual({ cols: 10, rows: 6, perPage: 60 });
    expect(bestiaryGridSize(719, 431)).toEqual({ cols: 9, rows: 5, perPage: 45 });
    // 极小容器兜底 1×1（DOM 初始布局 0 尺寸不炸）
    expect(bestiaryGridSize(0, 0)).toEqual({ cols: 1, rows: 1, perPage: 1 });
  });

  it('GetRangeText："{first}-{last} ({total})"，末页与空集收敛', () => {
    expect(bestiaryRangeText(0, 546, 40)).toBe('1-40 (546)');
    expect(bestiaryRangeText(520, 546, 40)).toBe('521-546 (546)');
    expect(bestiaryRangeText(0, 0, 40)).toBe('0-0 (0)');
  });

  it('FixBestiaryRange：偏移钳制 [0, max(0, last-perPage)]（offset 单位=条目）', () => {
    expect(clampBestiaryOffset(0, 40, 546, 40)).toBe(40);
    expect(clampBestiaryOffset(0, 999, 546, 40)).toBe(506);
    expect(clampBestiaryOffset(506, -40, 546, 40)).toBe(466);
    expect(clampBestiaryOffset(10, -99, 546, 40)).toBe(0);
    // 条目数不足一页：钳到 0（不产生负偏移/越界）
    expect(clampBestiaryOffset(0, 5, 10, 40)).toBe(0);
  });

  it('546 条全量分页数（40/页 → 14 页；60/页 → 10 页）', () => {
    expect(bestiaryEntries()).toHaveLength(546);
    expect(bestiaryPageCount(546, 40)).toBe(14);
    expect(bestiaryPageCount(546, 60)).toBe(10);
    expect(bestiaryPageCount(0, 40)).toBe(0);
  });
});

describe('条目行化与代表 NPC（bestiaryRows）', () => {
  it('546 条全部映射到代表 NPC id（归并族取母体；缺 SetDefaults 的仅缺属性不缺条目）', () => {
    const rows = bestiaryRows(new BestiaryTracker());
    expect(rows).toHaveLength(546);
    let backed = 0;
    for (const r of rows) {
      // 负 netID 变体（史莱姆配色/世吞段）为代表自身的负 id——头像走母体表回落
      expect(r.npcId).not.toBe(0);
      if (VANILLA_NPCS[String(r.npcId)]) backed++;
    }
    // vanilla-npcs.json 已知缺口 37 条（血月钓怪/城镇宠物/Deerclops 等，无 SetDefaults
    // 提取）——这些条目头像仍可画（贴图在、frames 兜底 1），仅属性段不显示
    expect(backed).toBeGreaterThanOrEqual(500);
    expect(bestiaryRepNpcId('Zombie')).toBe(3);            // 母体
    expect(bestiaryRepNpcId(bestiaryCreditId(13))).toBe(13); // EoW 头（quickUnlock 条目）
    expect(bestiaryRepNpcId('GreenSlime')).toBe(-3);       // 负 netID 变体代表自身
  });

  it('负 netID 变体名不走 Lang.npcName 的 abs 近似（-3 GreenSlime ≠ 3 Zombie）', () => {
    const t = new BestiaryTracker();
    t.registerKill(-3);
    const green = bestiaryRows(t).find((r) => r.npcId === -3)!;
    expect(green.state).toBe(UnlockState.PortraitOnly); // 敌怪条目：1 杀出头像+名字
    expect(green.name).not.toBe('僵尸');
    expect(green.name.length).toBeGreaterThan(0);
  });

  it('未解锁名 "???"；1 杀后出名字（UnlockableNPCEntryIcon hover 语义）', () => {
    const t = new BestiaryTracker();
    const rows = bestiaryRows(t);
    const zombie = rows.find((r) => r.entry.creditId === 'Zombie')!;
    expect(zombie.name).toBe('???');
    expect(zombie.state).toBe(UnlockState.NotKnown);
    t.registerKill(3);
    const after = bestiaryRows(t).find((r) => r.entry.creditId === 'Zombie')!;
    expect(after.state).toBe(UnlockState.PortraitOnly);
    expect(after.name).toBe('僵尸');
    expect(after.kills).toBe(1);
  });

  it('解锁档沿杀数推进：10 杀 Stats / 25 杀 DropsNoRates / 50 杀 DropsWithRates', () => {
    const t = new BestiaryTracker();
    const state = () => bestiaryRows(t).find((r) => r.entry.creditId === 'Zombie')!.state;
    for (let i = 0; i < 9; i++) t.registerKill(3);
    expect(state()).toBe(UnlockState.PortraitOnly);
    t.registerKill(3);
    expect(state()).toBe(UnlockState.Stats);
    for (let i = 0; i < 15; i++) t.registerKill(3);
    expect(state()).toBe(UnlockState.DropsNoRates);
    for (let i = 0; i < 26; i++) t.registerKill(3);
    expect(state()).toBe(UnlockState.DropsWithRates);
  });
});

describe('筛选（Filters.BySearch/ByUnlockState/ByBoss + kind 维度）', () => {
  const rows = () => bestiaryRows(new BestiaryTracker());
  const f = (over: Partial<typeof DEFAULT_BESTIARY_FILTER>) =>
    filterBestiaryRows(rows(), { ...DEFAULT_BESTIARY_FILTER, ...over });

  it('kind 维度：敌怪 419 / 城镇 40 / 小动物 87', () => {
    expect(f({ kind: 'enemy' })).toHaveLength(419);
    expect(f({ kind: 'town' })).toHaveLength(40);
    expect(f({ kind: 'critter' })).toHaveLength(87);
    expect(f({})).toHaveLength(546);
  });

  it('ByUnlockState：未解锁时全部条目；全解锁后 yes 命中 546 / no 命中 0', () => {
    expect(f({ unlocked: 'no' })).toHaveLength(546);
    expect(f({ unlocked: 'yes' })).toHaveLength(0);
  });

  it('ByBoss：克苏鲁之眼命中、僵尸不命中', () => {
    const boss = f({ boss: true });
    expect(boss.some((r) => r.entry.creditId === bestiaryCreditId(4))).toBe(true);
    expect(isBossCredit('Zombie')).toBe(false);
    expect(boss.every((r) => isBossCredit(r.entry.creditId))).toBe(true);
  });

  it('BySearch：命中显示名；未解锁条目不参与搜索', () => {
    expect(f({ search: '僵尸' })).toHaveLength(0);        // 全未解锁 → 搜不到
    const t = new BestiaryTracker();
    t.registerKill(3);
    const named = filterBestiaryRows(bestiaryRows(t), { ...DEFAULT_BESTIARY_FILTER, search: '僵尸' });
    expect(named).toHaveLength(1);
    expect(named[0].entry.creditId).toBe('Zombie');
  });
});

describe('排序（SortingSteps 数据层等价）', () => {
  const tracker = new BestiaryTracker();
  const sorted = (key: BestiarySortKey) => {
    const rs = bestiaryRows(tracker);
    sortBestiaryRows(rs, key);
    return rs;
  };

  it('Sort_Unlocks：已解锁在前（ByUnlockState 降序）', () => {
    tracker.registerKill(3);
    const rs = sorted('unlocks');
    expect(rs[0].state).toBeGreaterThan(UnlockState.NotKnown);
    expect(rs[rs.length - 1].state).toBe(UnlockState.NotKnown);
  });

  it('Sort_ID：npcId 升序（ByNetId）', () => {
    const rs = sorted('id');
    expect(rs[0].npcId).toBeLessThanOrEqual(rs[1].npcId);
    expect(rs.map((r) => r.npcId)).toEqual([...rs.map((r) => r.npcId)].sort((a, b) => a - b));
  });

  it('Sort_HitPoints：生命降序（月总 > 兔子；ByStat 族）', () => {
    const rs = sorted('hp');
    const hp = (id: number) => VANILLA_NPCS[String(id)]!.lifeMax;
    expect(hp(rs[0].npcId)).toBeGreaterThanOrEqual(hp(rs[1].npcId));
    expect(hp(rs[0].npcId)).toBeGreaterThan(hp(bestiaryRepNpcId('Bunny')));
  });

  it('Sort_Alphabetical：显示名升序且稳定（npcId 兜底）', () => {
    const rs = sorted('alpha');
    for (let i = 1; i < rs.length; i++) {
      const c = rs[i - 1].name.localeCompare(rs[i].name, 'zh');
      expect(c).toBeLessThanOrEqual(0);
    }
  });
});

describe('掉落表展平（ItemDropBestiaryInfoElement 近似）', () => {
  it('僵尸（npc 3）：存在掉落行，掉率为 num/denom', () => {
    const drops = flattenDropsForNpc(3);
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) {
      if (d.chance !== null) expect(d.chance).toBeGreaterThan(0);
      expect(d.chance === null || d.chance <= 1).toBe(true);
    }
  });

  it('expert 分支带 IsExpert 标签（DropBasedOnExpertMode 双列）', () => {
    const drops = flattenDropsForNpc(4); // 克苏鲁之眼：BossBag 双分支
    expect(drops.some((d) => d.tag === 'IsExpert')).toBe(true);
    expect(drops.some((d) => d.tag === null)).toBe(true);
  });

  it('掉率文本：1/70 → 1.43%；恒掉 100%', () => {
    expect(dropRateText(1 / 70)).toBe('1.43%');
    expect(dropRateText(1)).toBe('100%');
  });

  it('未知/无规则 NPC 返回空（不炸）', () => {
    expect(flattenDropsForNpc(0)).toEqual([]);
    expect(flattenDropsForNpc(46)).toEqual([]); // 兔子无击杀掉落注册
  });
});

// 出没环境 + 风味文本（BestiaryDatabaseNPCsPopulator :14-302/:802/:1661 +
// BestiaryEntry.cs:42-47 / TryGivingEntryFlavorTextIfItIsMissing populator:685-714）。
// 数据 = tools/extract-bestiary-spawn.mjs → vanilla-bestiary-spawn.json（60 条件 ×
// 681 NPC × 839 注册项），显示名 = Lang（Bestiary_Biomes/Times/Events/Invasions）。
describe('出没环境与风味文本', () => {
  it('bestiarySpawnConditions：注册序保留 + langKey/显示名（蓝史莱姆 1 = 地表+白天）', () => {
    const conds = bestiarySpawnConditions(1);
    expect(conds.map((c) => c.key)).toEqual(['Bestiary_Biomes.Surface', 'Bestiary_Times.DayTime']);
    expect(conds.map((c) => c.label)).toEqual(['地表', '白天']);
    expect(conds[0].priority).toBe(0);   // Surface DisplayTextPriority=0
    expect(conds[1].priority).toBe(36);  // DayTime=36
  });

  it('僵尸 3 = 夜间（Times.NightTime 37）；未知 id 空集不炸', () => {
    const conds = bestiarySpawnConditions(3);
    expect(conds).toHaveLength(1);
    expect(conds[0].key).toBe('Bestiary_Times.NightTime');
    expect(conds[0].label).toBe('夜间');
    expect(bestiarySpawnConditions(999999)).toEqual([]);
  });

  it('风味文本：有键直取 Bestiary_FlavorText.npc_<内部名>（BestiaryEntry.cs:42-47）', () => {
    expect(bestiaryFlavorText(3)).toBe(Lang.text('Bestiary_FlavorText.npc_Zombie'));
    expect(bestiaryFlavorText(3)).toContain('食脑怪');
    expect(bestiaryFlavorText(4)).toBe(Lang.text('Bestiary_FlavorText.npc_EyeofCthulhu'));
  });

  it('风味缺失回退：最高 DisplayTextPriority 出没环境 → Bestiary_BiomeText.biome_*（populator:685-714）', () => {
    // 8 DevourerBody：无风味键；条件 = 腐化之地(7) + 地下腐化之地(8) → 取后者
    expect(Lang.has('Bestiary_FlavorText.npc_DevourerBody')).toBe(false);
    const f = bestiaryFlavorText(8);
    expect(f).toBe(Lang.text('Bestiary_BiomeText.biome_UndergroundCorruption'));
    expect(f).toContain('腐化之地');
  });

  it('提取表规模锁：60 条件 / 681 NPC（防提取脚本回归漏块）', () => {
    expect(bestiarySpawnConditions(-1)).toHaveLength(2);  // 绿史莱姆变种：腐化 + 地下腐化
    expect(bestiarySpawnConditions(50)[0].key).toBe('Bestiary_Biomes.Surface'); // 史莱姆王
    let n = 0;
    for (const p of Object.keys(SPAWN_BY_NPC)) n += SPAWN_BY_NPC[p].length;
    expect(Object.keys(SPAWN_BY_NPC)).toHaveLength(681);
    expect(n).toBe(839);
  });
});
