// 图鉴（Bestiary）数据层探针 —— 对照 Terraria.GameContent.Bestiary/（1.4.5.6）：
//   杀数四档 CommonEnemyUICollectionInfoProvider.GetUnlockStateByKillCount（:60-85）
//   遇数/聊天语义 NPCWasNearPlayerTracker/NPCWasChatWithTracker
//   完成度公式 Main.GetBestiaryProgressReport（:65003-65020）+ 动物学家入住门
//   （Main.cs:65375 CompletionPercent >= 0.1f）
//   持久化 WorldFile.cs:3399/3405（BestiaryUnlocksTracker 随世界文件）
import { describe, it, expect } from 'vitest';
import {
  bestiaryEntries, bestiaryCreditId, countsAsACritter, unlockStateByKillCount,
  BestiaryTracker, isNpcValidForBestiaryKillCredit, BESTIARY_TOWN_IDS,
  UnlockState,
} from '../src/data/Bestiary';
import { NPC_NAME_BY_ID } from '../src/i18n/idNames.generated';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

describe('图鉴数据层（Bestiary）', () => {
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
