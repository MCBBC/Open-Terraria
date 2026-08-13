// 图鉴（Bestiary）数据层探针 —— 对照 Terraria.GameContent.Bestiary/（1.4.5.6）：
//   杀数四档 CommonEnemyUICollectionInfoProvider.GetUnlockStateByKillCount（:60-85）
//   遇数/聊天语义 NPCWasNearPlayerTracker/NPCWasChatWithTracker
//   完成度公式 Main.GetBestiaryProgressReport（:65003-65020）+ 动物学家入住门
//   （Main.cs:65375 CompletionPercent >= 0.1f）
//   持久化 WorldFile.cs:3399/3405（BestiaryUnlocksTracker 随世界文件）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  bestiaryEntries, bestiaryCreditId, countsAsACritter, unlockStateByKillCount,
  BestiaryTracker, isNpcValidForBestiaryKillCredit, BESTIARY_TOWN_IDS,
  bestiaryRarityStars, bestiarySortingId, lowestBiomeGroupIndex, isBossForBestiary,
  UnlockState, bestiaryGating,
} from '../src/data/Bestiary';
import { BESTIARY_SORT_KEYS, sortLabel } from '../src/ui/BestiaryPanel';
import { NPC_NAME_BY_ID } from '../src/i18n/idNames.generated';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

describe('图鉴数据层（Bestiary）', () => {
  // 免门默认开（2026-08-13 用户拍板）：unlockState 恒最高档;以下原版门控数学
  // 测试统一关闸注入后断言（unlockStateByKillCount 纯函数不受开关影响）
  beforeEach(() => { bestiaryGating.unlockAll = false; });
  afterEach(() => { bestiaryGating.unlockAll = true; });

  it('免门默认开：零击杀条目 unlockState 恒最高档;完成度口径走真实门控（免门副作用回归）', () => {
    bestiaryGating.unlockAll = true;
    const t = new BestiaryTracker();
    const e = bestiaryEntries().find((x) => x.kind === 'enemy')!;
    expect(t.unlockState(e)).toBe(UnlockState.DropsWithRates);   // 显示内容免门
    expect(t.isUnlocked(e)).toBe(false);                          // 完成度口径=真实门控
    expect(t.completion().percent).toBeLessThan(0.01);            // 开局不再恒 100%
  });

  it('杀数四档：1 杀头像 / full/5 属性 / full/2 掉落表 / full 掉落率（默认 50）', () => {
    const F = 50;
    expect(unlockStateByKillCount(0, false, F)).toBe(UnlockState.NotKnown);
    expect(unlockStateByKillCount(1, false, F)).toBe(UnlockState.PortraitOnly);
    expect(unlockStateByKillCount(9, false, F)).toBe(UnlockState.PortraitOnly);
    expect(unlockStateByKillCount(10, false, F)).toBe(UnlockState.Stats);
    expect(unlockStateByKillCount(24, false, F)).toBe(UnlockState.Stats);
    expect(unlockStateByKillCount(25, false, F)).toBe(UnlockState.DropsNoRates);
    expect(unlockStateByKillCount(49, false, F)).toBe(UnlockState.DropsNoRates);
    expect(unlockStateByKillCount(50, false, F)).toBe(UnlockState.DropsWithRates);
    // quickUnlock（Boss 族）：杀 1 只即满档
    expect(unlockStateByKillCount(1, true, F)).toBe(UnlockState.DropsWithRates);
  });

  it('非默认击杀阈值经 NPCtoBanner→BannerToItem→KillsToBanner（Tim=10 / DD2GoblinT1=1000）', () => {
    const entries = bestiaryEntries();
    const byCredit = new Map(entries.map((e) => [e.creditId, e]));
    const tim = byCredit.get(bestiaryCreditId(45))!;
    expect(tim.sources[0].t === 'kill' && tim.sources[0].full).toBe(10);          // Tim 稀有怪 10 杀满档
    const dd2 = byCredit.get(bestiaryCreditId(552))!.sources[0];
    expect(dd2.t === 'kill' && dd2.full).toBe(1000); // 旧日军团刷怪
    const t = new BestiaryTracker();
    t.registerKill(45);
    expect(t.unlockState(tim)).toBe(UnlockState.PortraitOnly);
    t.registerKill(45);
    expect(t.unlockState(tim)).toBe(UnlockState.Stats);   // 2 ≥ 10/5
  });

  it('遇数=首遇置位（小动物）；聊天=对话即记（城镇）；credit 归并变体/部位', () => {
    const t = new BestiaryTracker();
    const entries = bestiaryEntries();
    const bunny = entries.find((e) => e.creditId === bestiaryCreditId(46))!;  // Bird? id46=Bunny
    expect(bunny.kind).toBe('critter');
    expect(t.isUnlocked(bunny)).toBe(false);
    t.registerSight(46);
    expect(t.isUnlocked(bunny)).toBe(true);
    // 城镇条目：聊天解锁（Guide 22）
    const guide = entries.find((e) => e.creditId === bestiaryCreditId(22))!;
    expect(guide.kind).toBe('town');
    expect(t.isUnlocked(guide)).toBe(false);
    t.registerChat(22);
    expect(t.isUnlocked(guide)).toBe(true);
    // 击杀记账归并：世吞身体 14 → 头 13（ModifyNPCIds）
    expect(bestiaryCreditId(14)).toBe(bestiaryCreditId(13));
    const eow = entries.find((e) => e.creditId === bestiaryCreditId(13))!;
    t.registerKill(13);
    expect(t.kills.get(bestiaryCreditId(13))).toBe(1);
    expect(t.isUnlocked(eow)).toBe(true);          // EoC 系 quickUnlock：杀 1 即满档
  });

  it('金小动物门：仅见普通种不解锁；任一金种已见后同族联动解锁', () => {
    const t = new BestiaryTracker();
    const entries = bestiaryEntries();
    const goldBunny = entries.find((e) => e.creditId === bestiaryCreditId(443))!;
    t.registerSight(46);                            // 普通种同族
    expect(t.isUnlocked(goldBunny)).toBe(false);    // 金种全见门未过
    t.registerSight(592);                           // 任一金种（Gold Butterfly）
    expect(t.isUnlocked(goldBunny)).toBe(true);
  });

  it('条目注册表：Hide 条目不注册；城镇 40 条；总数稳定且全量可达成', () => {
    const entries = bestiaryEntries();
    const credits = new Set(entries.map((e) => e.creditId));
    expect(credits.has(NPC_NAME_BY_ID[0])).toBe(false);         // 'None'（Hide）
    expect(credits.has(NPC_NAME_BY_ID[-65])).toBe(false);       // Boss 部位（Hide）
    expect(credits.has(NPC_NAME_BY_ID[430])).toBe(false);       // 僵尸变体（Hide）
    const townEntries = entries.filter((e) => e.kind === 'town');
    expect(townEntries.length).toBe(BESTIARY_TOWN_IDS.size);
    expect(entries.length).toBeGreaterThan(400);
    // 全条目逐一解锁 → 完成度 100%
    const t = new BestiaryTracker();
    for (const id of Object.keys(NPC_NAME_BY_ID).map(Number)) {
      if (id === 0) continue;
      if (BESTIARY_TOWN_IDS.has(id)) t.registerChat(id);
      else if (countsAsACritter(id)) t.registerSight(id);
      else t.registerKill(id);
    }
    const c = t.completion();
    expect(c.unlocked).toBe(c.total);
    expect(c.percent).toBe(1);
  });

  it('完成度公式 + 动物学家入住门（Main.cs:65375：percent >= 0.1f）', () => {
    const total = bestiaryEntries().length;
    const gate = (unlocked: number) => unlocked / total >= 0.1;   // 入住门判定式
    expect(gate(0)).toBe(false);
    // 首个让门开启的解锁数 = 使 unlocked/total ≥ 0.1 的最小整数
    let need = 0;
    while (need / total < 0.1) need++;
    // 逐条解锁（按条目 sources 直填三桶），完成度应严格 1:1 递增至全量
    const t = new BestiaryTracker();
    let opened = -1;
    bestiaryEntries().forEach((e, i) => {
      for (const s of e.sources) {
        if (s.t === 'kill') t.kills.set(s.credit, Math.max(t.kills.get(s.credit) ?? 0, s.full));
        else if (s.t === 'sight') t.sights.add(s.credit);
        else t.chats.add(s.credit);
      }
      const c = t.completion();
      expect(c.unlocked).toBeGreaterThanOrEqual(i + 1);   // 共享来源条目可提前连带解锁
      if (opened < 0 && c.percent >= 0.1) opened = c.unlocked;
    });
    expect(t.completion().unlocked).toBe(total);
    expect(t.completion().percent).toBe(1);
    expect(opened).toBe(need);                            // 门在最小可达解锁数处翻转
    expect(gate(need)).toBe(true);
    expect(gate(need - 1)).toBe(false);
  });

  it('击杀有效性门（NPC.cs:79701：121 不计；EoW 三段需 boss 旗）', () => {
    expect(isNpcValidForBestiaryKillCredit(121, true)).toBe(false);
    expect(isNpcValidForBestiaryKillCredit(13, false)).toBe(false);
    expect(isNpcValidForBestiaryKillCredit(13, true)).toBe(true);
    expect(isNpcValidForBestiaryKillCredit(3, false)).toBe(true);
  });

  it('持久化：杀数/遇数/聊天三桶随世界存档往返（WorldFile.cs:3399/3405）', () => {
    const world = new World(64, 32, 42, '测试');
    world.spawnX = 30; world.spawnY = 10;
    world.bestiary.registerKill(3);
    world.bestiary.registerKill(3);
    world.bestiary.registerSight(46);
    world.bestiary.registerChat(22);
    const player = new Player(100, 100, new Inventory());
    const back = loadSave(saveGame(world, player, 0));
    expect(back.world.bestiary.kills.get(bestiaryCreditId(3))).toBe(2);
    expect(back.world.bestiary.sights.has(bestiaryCreditId(46))).toBe(true);
    expect(back.world.bestiary.chats.has(bestiaryCreditId(22))).toBe(true);
    // 旧档缺省 = 空三桶
    const fresh = loadSave(saveGame(new World(64, 32, 7, '空'), new Player(0, 0, new Inventory()), 0));
    expect(fresh.world.bestiary.completion().unlocked).toBe(0);
  });
});

// ============ 排序 id + 稀有度星（ContentSamples.NpcBestiarySortingId / NpcBestiaryRarityStars） ============

describe('NpcBestiarySortingId 排序 + NpcBestiaryRarityStars 稀有度（2026-08-13 散项批）', () => {
  it('城镇优先位表（NPCID.cs:4427）：向导 22 首位 → 排序 id 全表最小', () => {
    expect(bestiarySortingId(22)).toBe(1);
    // 城镇链 17/18/38/369... 紧随其后且单调升
    expect(bestiarySortingId(17)).toBeGreaterThan(bestiarySortingId(22));
    expect(bestiarySortingId(17)).toBeLessThan(bestiarySortingId(18));
  });

  it('金小动物优先位（:4407）先于普通敌怪：46 兔 < 442 金鸟', () => {
    expect(bestiarySortingId(46)).toBeLessThan(bestiarySortingId(442));
  });

  it('Boss 优先位（:4416）：缺席 = IndexOf 的 -1 → 非 Boss 先于 Boss 段（原版语义）', () => {
    // 4 EoC 是 BossBestiaryPriority 第 2 位（664 TorchGod 首）；城镇/小动物段之后。
    // GetBestiaryBossPriority 对非 Boss 返回 -1（小于一切表内下标）→ 普通敌怪 3
    // 僵尸反而在 Boss 段之前（忠实原版，勿"修正"为 MAX）
    expect(bestiarySortingId(4)).toBeGreaterThan(bestiarySortingId(46));
    expect(bestiarySortingId(3)).toBeLessThan(bestiarySortingId(4));
  });

  it('稀有度星：城镇显式覆盖（22=1）/ Boss 覆盖段 4-5 / 小动物公式档（46 兔=1）', () => {
    expect(bestiaryRarityStars(22)).toBe(1);      // FillNpcRarities 覆盖
    expect(bestiaryRarityStars(398)).toBeGreaterThanOrEqual(4);   // Boss 段
    expect(bestiaryRarityStars(398)).toBeLessThanOrEqual(5);
    expect(bestiaryRarityStars(46)).toBe(1);      // 公式：rarity0 + 战力 1 档
  });

  it('排序步注册序含 BestiaryID/Rarity 两新步（原登记缺口闭合）', () => {
    expect(BESTIARY_SORT_KEYS).toEqual(
      ['unlocks', 'id', 'bestiaryId', 'alpha', 'rarity', 'attack', 'defense', 'coins', 'hp']);
    expect(sortLabel('bestiaryId')).toBeTruthy();
    expect(sortLabel('rarity')).toBeTruthy();
  });
});

// ============ 收尾批：npcStats 投影 + GetLowestBiomeGroupIndex + 编号口径 ============

describe('图鉴数据表收尾（2026-08-13 收尾批）', () => {
  beforeEach(() => { bestiaryGating.unlockAll = false; });
  afterEach(() => { bestiaryGating.unlockAll = true; });
  it('GetLowestBiomeGroupIndex（ContentSamples.cs:755-766）：公共过滤元素组号，尾向头首个命中', () => {
    // 1 蓝史莱姆 = Surface(0) + DayTime(1) → 取大者 1（同名"Lowest"实为最大组号）
    expect(lowestBiomeGroupIndex(1)).toBe(1);
    // 62 恶魔 = 仅 TheUnderworld(24)；3 僵尸 = 仅 NightTime(5)
    expect(lowestBiomeGroupIndex(62)).toBe(24);
    expect(lowestBiomeGroupIndex(3)).toBe(5);
    // 无出没环境注册 = int.MaxValue（未知 id 兜底；全量 681 NPC 均有命中）
    expect(lowestBiomeGroupIndex(999999)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('排序键 6 生效：同档敌怪按群系组序（102 食人鱼 22 < 62 恶魔 24，aiStyle 反序仍让位）', () => {
    // 键 7 aiStyle：62 恶魔=14 < 102 食人鱼=16——若键 6 缺失（旧常量 0）则 62 在前；
    // 键 6 提取后群系组号先决，102 在前
    expect(bestiarySortingId(102)).toBeLessThan(bestiarySortingId(62));
    expect(bestiarySortingId(1)).toBeLessThan(bestiarySortingId(62)); // 地表 1 < 地狱 24
  });

  it('编号口径：Hide 条目不占号（CreateBestiarySortingIds 遍历 RemoveAll 后的表）', () => {
    const MAX = Number.MAX_SAFE_INTEGER;
    expect(bestiarySortingId(0)).toBe(MAX);          // None（Hide）
    expect(bestiarySortingId(-65)).toBe(MAX);        // Boss 部位（Hide）
    expect(bestiarySortingId(430)).toBe(MAX);        // 僵尸变体（Hide）
    const seen = new Set<number>();
    for (const key of Object.keys(NPC_NAME_BY_ID)) {
      const id = Number(key);
      if (!Number.isInteger(id)) continue;
      const r = bestiarySortingId(id);
      if (r === MAX) continue;
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(546);
      seen.add(r);
    }
    expect(seen.size).toBe(546);   // 1..546 无空洞无重复
  });

  it('稀有度星修正：npcStats 补齐旧缺表 33 条（630 血腥木乃伊战力档 +1 → 2 星）', () => {
    // 630 BloodMummy：rarity0 / dmg60 / def18 / hp180 → 战力 123 > 50 → 1+0+1 = 2
    //（旧 stats 缺表按 0 计会得 1 星）
    expect(bestiaryRarityStars(630)).toBe(2);
    // 255 ZombieMushroomHat：战力 38+16+55=109 > 50 → 2 星
    expect(bestiaryRarityStars(255)).toBe(2);
    // 85 独角兽：rarity4 + 肉前段战力 117 → 1+4+2.5+1 钳 5
    expect(bestiaryRarityStars(85)).toBe(5);
    // Boss 覆盖段：4 EoC=2 / 668 鹿角怪=3
    expect(bestiaryRarityStars(4)).toBe(2);
    expect(bestiaryRarityStars(668)).toBe(3);
  });

  it('boss 判定 1:1（BestiaryEntry.Enemy :37：npc.boss ∨ ShouldBeCountedAsBossForBestiary）', () => {
    expect(isBossForBestiary(4)).toBe(true);    // EoC（SetDefaults boss=true）
    expect(isBossForBestiary(395)).toBe(true);  // 火星飞碟核心（1456 boss=true）
    expect(isBossForBestiary(668)).toBe(true);  // 鹿角怪（1456 boss=true）
    expect(isBossForBestiary(13)).toBe(true);   // 世吞头（Sets 表补充）
    expect(isBossForBestiary(664)).toBe(true);  // 火把神（双源）
    expect(isBossForBestiary(68)).toBe(false);  // 地牢守卫（boss=false，AI 运行期才置）
    expect(isBossForBestiary(325)).toBe(false); // 万圣节南瓜王（事件 Boss 同理不在表）
    expect(isBossForBestiary(3)).toBe(false);
  });

  it('quickUnlock 口径同步：boss 族 1 杀满档；事件 Boss（325）与非 boss 走杀数档', () => {
    const byCredit = new Map(bestiaryEntries().map((e) => [e.creditId, e]));
    const state = (id: number, kills: number) => {
      const t = new BestiaryTracker();
      for (let i = 0; i < kills; i++) t.registerKill(id);
      return t.unlockState(byCredit.get(bestiaryCreditId(id))!);
    };
    expect(state(668, 1)).toBe(UnlockState.DropsWithRates);   // 鹿角怪 boss → quick
    expect(state(68, 1)).toBe(UnlockState.DropsWithRates);    // 地牢守卫：populator :588 显式 quick
    expect(state(325, 1)).toBe(UnlockState.PortraitOnly);     // 南瓜王：1 杀仅头像（原版语义）
    expect(state(325, 10)).toBe(UnlockState.Stats);           // 10 杀（50/5）出属性
  });

  it('小动物判定补档：614 爆炸兔（hp5/dmg0）入小动物族', () => {
    expect(countsAsACritter(614)).toBe(true);
    const byCredit = new Map(bestiaryEntries().map((e) => [e.creditId, e]));
    expect(byCredit.get(bestiaryCreditId(614))!.kind).toBe('critter');
    // 负 netID 史莱姆变体：母体 hp25 → 敌怪（旧 stats 缺表曾误判小动物）
    expect(countsAsACritter(-3)).toBe(false);
  });
});
