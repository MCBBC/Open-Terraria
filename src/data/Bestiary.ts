// 原版图鉴（Bestiary）数据层 1:1 移植 —— Terraria.GameContent.Bestiary/（1.4.5.6）。
// 三桶统计（BestiaryUnlocksTracker）：杀数 NPCKillsTracker / 遇数 NPCWasNearPlayerTracker /
// 聊天 NPCWasChatWithTracker；解锁档（CommonEnemyUICollectionInfoProvider.GetUnlockStateByKillCount：
// 1 杀=头像 / full/5=属性 / full/2=掉落表 / full=掉落率）；完成度（Main.GetBestiaryProgressReport
// :65003-65020：已解锁条目 / 总条目）。UI 全屏面板为二期（数据已全，独立批次）。
//
// 语义要点（对齐反编译源码）：
//  - creditId = NPCID.Search.GetName(netID)，经 ContentSamples.ModifyNPCIds 归并（Boss 部位/
//    变体族记到母体条目）——BESTIARY_CREDIT_REDIRECT；
//  - 条目清单 = 全量 NPC - NPCBestiaryDrawOffset Hide（GetExclusions）- isLikeATownNPC，
//    城镇 NPC 由 AddTownNPCs_Manual 40 条目手工注册（解锁=聊天）；小动物（CountsAsACritter：
//    lifeMax≤5 && damage==0 && type∉{594,686}）解锁=遇数；其余敌怪解锁=杀数；
//  - 完全解锁所需杀数 = ItemID.Sets.KillsToBanner[BannerToItem(NPCtoBanner(npc))]（默认 50，
//    BESTIARY_KILLS_TO_FULL 仅存非默认项）；
//  - quickUnlock（npc.boss ∨ ShouldBeCountedAsBossForBestiary{517,422,507,493,13,664} 及
//    ModifyEntriesThatNeedIt 手工 {565,577,551,491} + 击杀归并族 + 68/35 显式旗）：杀 1 只即满档；
//  - Multi/HighestOf 条目（68/35/37 三联、534、蝾螈族 494-506、金小动物 13 条、小动物对 4 组）：
//    任一来源解锁即解锁（GetEntryUICollectionInfo 取 max）。
// 排序/稀有度/出没环境三张静态表见文件尾部（vanilla-bestiary.json /
// vanilla-bestiary-spawn.json，tools/extract-bestiary*.mjs 生成）。
import { NPC_NAME_BY_ID } from '../i18n/idNames.generated';
import { VANILLA_NPCS } from './vanillaNpcs';
import {
  BESTIARY_HIDE_IDS,
  BESTIARY_CREDIT_REDIRECT,
  BESTIARY_KILLS_TO_FULL,
} from './bestiaryStatics.generated';

/** ItemID.cs:1068 DefaultKillsForBannerNeeded */
export const BESTIARY_DEFAULT_FULL_KILLS = 50;
/** NPCKillsTracker.POSITIVE_KILL_COUNT_CAP */
const KILL_CAP = 999999999;

/** NPCID.Sets.ShouldBeCountedAsBossForBestiary（NPCID.cs:4865） */
const COUNTED_AS_BOSS = new Set([517, 422, 507, 493, 13, 664]);
/** ModifyEntriesThatNeedIt 手工 quickUnlock（Populator :589-592） */
const QUICK_UNLOCK_IDS = new Set([565, 577, 551, 491]);
/** AddTownNPCs_Manual（Populator :718-757）——城镇条目解锁=与该 NPC 聊过 */
export const BESTIARY_TOWN_IDS = new Set([
  22, 17, 18, 19, 20, 37, 54, 38, 107, 108, 124, 142, 160, 178, 207, 208, 209,
  227, 228, 229, 353, 369, 441, 550, 588, 368, 453, 633, 663, 638, 637, 656,
  670, 678, 679, 680, 681, 682, 683, 684,
]);
/** ModifyEntriesThatNeedIt 击杀记账归并（Populator :600-616，quickUnlock=true） */
const KILL_CREDIT_FROM: Record<number, number> = {
  5: 4, 267: 266, 115: 113, 116: 113, 117: 113, 139: 134, 372: 370,
  658: 657, 659: 657, 660: 657, 454: 439, 521: 439,
};
/** HighestOfMultipleUICollectionInfoProvider 复合条目（Populator :565/:588-590）。
 *  元组可带第三位显式 quick 旗（68 地牢守卫：npc.boss=false 但 populator :588
 *  显式 quickUnlock:true） */
const MULTI_SOURCES: Record<number, Array<'kill' | 'chat' | [number, 'kill' | 'chat', boolean?]>> = {
  // 每项 = [npcId, 来源类型(, quick?)]；'kill'/'chat' 表示本条目自身
  68: [[68, 'kill', true], [35, 'kill'], [54, 'chat']],
  35: [[35, 'kill'], [54, 'chat']],
  37: [[37, 'chat'], [54, 'chat'], [35, 'kill']],
  534: ['kill', [441, 'chat']],
};
/** 小动物对（Populator :653-661：条目与配对变体任一"遇"即解锁） */
const CRITTER_PAIR: Record<number, number> = { 362: 363, 364: 365, 602: 603, 608: 609 };
/** 金小动物（Populator :619-650：本体或同族普通种"遇" + 全图任一金种已见） */
const GOLD_CRITTER_NORMALS: Record<number, number[]> = {
  443: [46], 442: [74], 592: [55], 444: [356], 601: [599], 445: [361], 446: [377],
  605: [604], 447: [300], 627: [626], 613: [612], 448: [357], 539: [299, 538],
};
/** NPCID.Sets.GoldCrittersCollection（NPCID.cs:4450）——金种全见门 */
const GOLD_CRITTER_IDS = [443, 442, 592, 593, 444, 601, 445, 446, 605, 447, 627, 613, 448, 539];

const HIDE = new Set(BESTIARY_HIDE_IDS);
const REDIRECT = BESTIARY_CREDIT_REDIRECT as Record<number, number>;
const KILLS_TO_FULL = BESTIARY_KILLS_TO_FULL as Record<number, number>;

/** NPC.cs:96360 GetBestiaryCreditId：netID → creditId（经 ModifyNPCIds 归并） */
export function bestiaryCreditId(netId: number): string {
  return NPC_NAME_BY_ID[REDIRECT[netId] ?? netId] ?? String(netId);
}

let creditToNetIdCache: Map<string, number> | null = null;

/** ContentSamples.NpcNetIdsByPersistentIds 等价（creditId → 规范 netId）：
 *  取未被 REDIRECT 归并的最小 id（母体自名 == creditId；变体经 bestiaryCreditId
 *  都指向母体名）——联机 module4 进房补发（tracker 全量 → netId 线上编码）用 */
export function netIdOfCredit(creditId: string): number | undefined {
  if (!creditToNetIdCache) {
    creditToNetIdCache = new Map();
    for (const key of Object.keys(NPC_NAME_BY_ID)) {
      const id = Number(key);
      if (!Number.isInteger(id) || id === 0) continue;
      if (REDIRECT[id] !== undefined) continue;            // 归并变体非规范位
      if (creditToNetIdCache.has(NPC_NAME_BY_ID[id])) continue;  // 首个（最小 id）胜
      creditToNetIdCache.set(NPC_NAME_BY_ID[id], id);
    }
  }
  return creditToNetIdCache.get(creditId);
}

/** NPC.CountsAsACritter（NPC.cs:6803-6812）——遇数扫描/小动物条目判定。
 *  lifeMax/damage 取 npcStats（1456/1457 同值 SetDefaults 全量——recon-npc CLASS B=0——含旧 json 缺失的 33 条，
 *  如 614 爆炸兔 hp5/dmg0 → 小动物） */
export function countsAsACritter(npcId: number): boolean {
  if (npcId === 594 || npcId === 686) return false;
  const [, , damage, , lifeMax] = npcStats(npcId);
  return lifeMax <= 5 && damage === 0;
}

/** BestiaryEntryUnlockState（0 未知 1 仅头像 2 +属性 3 +掉落 4 +掉落率） */
export const enum UnlockState {
  NotKnown = 0,
  PortraitOnly = 1,
  Stats = 2,
  DropsNoRates = 3,
  DropsWithRates = 4,
}

/** 图鉴免门总开关（holder 便于单测注入；详见 BestiaryTracker.unlockState 注）。
 *  默认 false = 原版门控语义（未解锁条目暗影剪影 + "???"，2026-08-13 用户要求回归）。
 *  true = 参考书模式（全部内容直读，攻略查询批引入）——仅调试/单测注入用 */
export const bestiaryGating = { unlockAll: false };

type Source =
  | { t: 'kill'; credit: string; quick: boolean; full: number }
  | { t: 'sight'; credit: string }
  | { t: 'chat'; credit: string };

export interface BestiaryEntryDef {
  /** 条目自身 netId（★BJ506：NPCNetIdBestiaryInfoElement.NetId——图鉴编号
   *  BestiaryDisplayIndex = NpcBestiarySortingId[本 id]；重复 creditId 归并行
   *  （Nymph×2/Scarecrow1×10）各自持独立 id → 每行编号唯一，与原版一致） */
  id: number;
  creditId: string;
  kind: 'enemy' | 'town' | 'critter';
  sources: Source[];
  /** 金小动物门：任一来源解锁后仍需全图已见至少一只金种（GoldCritterUICollectionInfoProvider） */
  goldGate: boolean;
}

function killSource(npcId: number, quick: boolean): Source {
  return {
    t: 'kill',
    credit: bestiaryCreditId(npcId),
    quick,
    full: KILLS_TO_FULL[npcId] ?? BESTIARY_DEFAULT_FULL_KILLS,
  };
}
const sightSource = (npcId: number): Source => ({ t: 'sight', credit: bestiaryCreditId(npcId) });
const chatSource = (npcId: number): Source => ({ t: 'chat', credit: bestiaryCreditId(npcId) });

/** BestiaryEntry.Enemy :37 的 boss 判定（npc.boss ∨ NPCID.Sets.ShouldBeCountedAsBossForBestiary）：
 *  npc.boss 取 npcStats 表（1456/1457 同值 SetDefaults boss=true 的 22 条：EoC/骷髅王/世吞头/蜂后/
 *  肉山/机械三王/世纪之花/石巨人/双月/邪教徒/史莱姆皇后/光女/火星飞碟核心/火把神/鹿角怪），
 *  Sets 补充 {517,422,507,493,13,664}（四柱/世吞头/火把神）。BossBestiaryInfoElement
 *  挂载（Filters.ByBoss）与 quickUnlock 同源 */
export function isBossForBestiary(npcId: number): boolean {
  return npcStats(npcId)[1] === 1 || COUNTED_AS_BOSS.has(npcId);
}

let entryCache: BestiaryEntryDef[] | null = null;

/** 条目注册表（BestiaryDatabaseNPCsPopulator.Populate 的数据层等价；惰性构建一次） */
export function bestiaryEntries(): BestiaryEntryDef[] {
  if (entryCache) return entryCache;
  const out: BestiaryEntryDef[] = [];
  for (const key of Object.keys(NPC_NAME_BY_ID)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id === 0 || HIDE.has(id)) continue;
    const isTown = BESTIARY_TOWN_IDS.has(id);
    // AddEmptyEntries_CrittersAndEnemies_Automated：isLikeATownNPC 走手工城镇表，
    // 其余按 CountsAsACritter 分小动物/敌怪
    const kind: BestiaryEntryDef['kind'] = isTown ? 'town' : countsAsACritter(id) ? 'critter' : 'enemy';
    let sources: Source[];
    let goldGate = false;
    const goldNormals = GOLD_CRITTER_NORMALS[id];
    if (goldNormals) {
      // 金小动物：本体遇 + 同族普通种遇；解锁态恒 0/4
      sources = [sightSource(id), ...goldNormals.map(sightSource)];
      goldGate = true;
    } else if (id in CRITTER_PAIR) {
      sources = [sightSource(id), sightSource(CRITTER_PAIR[id])];
    } else if (id in MULTI_SOURCES) {
      sources = MULTI_SOURCES[id].map((s) =>
        s === 'kill' ? killSource(id, isQuick(id))
          : s === 'chat' ? chatSource(id)
            : s[1] === 'kill'
              ? killSource(s[0], s[2] ?? isQuick(s[0]))
              : chatSource(s[0]));
    } else if (id in KILL_CREDIT_FROM) {
      // 击杀记账归并族（Populator :600-616）：读母体杀数，quickUnlock=true
      sources = [killSource(KILL_CREDIT_FROM[id], true)];
    } else if (kind === 'town') {
      sources = [chatSource(id)];
    } else if (kind === 'critter') {
      sources = [sightSource(id)];
    } else {
      sources = [killSource(id, isQuick(id))];
    }
    out.push({ id, creditId: bestiaryCreditId(id), kind, sources, goldGate });
  }
  // ★mod NPC 条目（2026-10-04 P3）：mod 段（id≥800）敌怪走击杀解锁（50 杀全解锁/
  //   10 杀缩略,原版 Enemy 家族同门）——creditId=String(id)（NPC_NAME_BY_ID 无
  //   mod 行,bestiaryCreditId 回退分支同值）;缓存构建于首次调用（启动链 mod 注册
  //   先于菜单,时序安全）。城 NPC=chat 解锁。
  for (const key of Object.keys(VANILLA_NPCS)) {
    const id = Number(key);
    if (!(id >= 800)) continue;
    const v = VANILLA_NPCS[key]!;
    out.push({
      id,
      creditId: String(id),
      kind: v.townNPC ? 'town' : 'enemy',
      sources: [v.townNPC ? chatSource(id) : killSource(id, false)],
      goldGate: false,
    });
  }
  entryCache = out;
  return out;
}

/** ★D11(2026-10-14):条目缓存失效(mod 域 teardown 后 VANILLA_NPCS 800+ 变更须重建) */
export function _resetBestiaryEntryCacheForTests(): void {
  entryCache = null;
}

function isQuick(id: number): boolean {
  return isBossForBestiary(id) || QUICK_UNLOCK_IDS.has(id);
}

/** CommonEnemyUICollectionInfoProvider.GetUnlockStateByKillCount（:60-85） */
export function unlockStateByKillCount(killCount: number, quick: boolean, full: number): UnlockState {
  const half = Math.floor(full / 2);
  const fifth = Math.floor(full / 5);
  if (quick && killCount > 0) return UnlockState.DropsWithRates;
  if (killCount >= full) return UnlockState.DropsWithRates;
  if (killCount >= half) return UnlockState.DropsNoRates;
  if (killCount >= fifth) return UnlockState.Stats;
  if (killCount >= 1) return UnlockState.PortraitOnly;
  return UnlockState.NotKnown;
}

export interface BestiarySave {
  /** 杀数（creditId → 次数） */
  k: Record<string, number>;
  /** 遇数（creditId 集） */
  s: string[];
  /** 聊天解锁（creditId 集） */
  c: string[];
}

/**
 * 图鉴统计器（BestiaryUnlocksTracker 1:1）——原版是随世界文件持久化的
 * IPersistentPerWorldContent（WorldFile.cs:3399/3405），挂在 World 上。
 */
export class BestiaryTracker {
  readonly kills = new Map<string, number>();
  readonly sights = new Set<string>();
  readonly chats = new Set<string>();

  /** NPCKillsTracker.RegisterKill（杀数上限 999999999）。
   *  返回累计值（联机 module4 上行携累计——原版 RegisterKill :24-32 广播即带 value） */
  registerKill(netId: number): number {
    const id = bestiaryCreditId(netId);
    const next = Math.min((this.kills.get(id) ?? 0) + 1, KILL_CAP);
    this.kills.set(id, next);
    return next;
  }

  /** SetKillCountDirectly（:36-43）——联机 module4 权威下发/进房补发直写（钳 0..上限） */
  setKillCountDirectly(creditId: string, count: number): void {
    this.kills.set(creditId, Math.max(0, Math.min(count, KILL_CAP)));
  }

  /** NPCWasNearPlayerTracker.RegisterWasNearby（首遇置位即可，幂等）。
   *  返回是否首次（联机 Sight 首遇才广播——原版 tracker 内 flag 门 :30-38） */
  registerSight(netId: number): boolean {
    const id = bestiaryCreditId(netId);
    if (this.sights.has(id)) return false;
    this.sights.add(id);
    return true;
  }

  /** SetWasSeenDirectly（:40-46）——module4 下发/进房补发直写 */
  setSightDirectly(creditId: string): void {
    this.sights.add(creditId);
  }

  /** NPCWasChatWithTracker.RegisterChatStartWith（幂等）。返回是否首次（同上） */
  registerChat(netId: number): boolean {
    const id = bestiaryCreditId(netId);
    if (this.chats.has(id)) return false;
    this.chats.add(id);
    return true;
  }

  /** SetWasChatWithDirectly（:21-27）——module4 下发/进房补发直写 */
  setChatDirectly(creditId: string): void {
    this.chats.add(creditId);
  }

  private anyGoldSeen(): boolean {
    for (const g of GOLD_CRITTER_IDS) {
      if (this.sights.has(bestiaryCreditId(g))) return true;
    }
    return false;
  }

  /** 条目解锁档（各 UIInfoProvider.GetEntryUICollectionInfo 的数据层等价）。
   *  原版 5 档击杀门（CommonEnemyUICollectionInfoProvider
   *  .GetUnlockStateByKillCount,BestiaryEntryUnlockState）+金宠/目击/对话门。
   *  bestiaryGating.unlockAll=true 时免门直读最高档（参考书模式,仅调试注入）;
   *  isUnlocked/completion 恒走真实门控（realUnlockState）。 */
  unlockState(entry: BestiaryEntryDef): UnlockState {
    if (bestiaryGating.unlockAll) return UnlockState.DropsWithRates;
    return this.realUnlockState(entry);
  }

  /** 原版门控计算本体（免门开关不经过——完成度/"已解锁"筛选/存档口径专用） */
  realUnlockState(entry: BestiaryEntryDef): UnlockState {
    let state = UnlockState.NotKnown;
    for (const s of entry.sources) {
      const st = s.t === 'kill'
        ? unlockStateByKillCount(this.kills.get(s.credit) ?? 0, s.quick, s.full)
        : (s.t === 'sight' ? this.sights.has(s.credit) : this.chats.has(s.credit))
          ? UnlockState.DropsWithRates
          : UnlockState.NotKnown;
      if (st > state) state = st;
    }
    if (entry.goldGate && state > UnlockState.NotKnown && !this.anyGoldSeen()) {
      // GoldCritterUICollectionInfoProvider.TryFindingOneGoldCritterThatIsAlreadyUnlocked
      return UnlockState.NotKnown;
    }
    return state;
  }

  /** 条目是否已解锁（完成度分母口径：UnlockState > NotKnown;真实门控） */
  isUnlocked(entry: BestiaryEntryDef): boolean {
    return this.realUnlockState(entry) > UnlockState.NotKnown;
  }

  /** Main.GetBestiaryProgressReport（:65003-65020）——percent=已解锁/总数，总数 0 → 1 */
  completion(): { total: number; unlocked: number; percent: number } {
    const entries = bestiaryEntries();
    let unlocked = 0;
    for (const e of entries) if (this.isUnlocked(e)) unlocked++;
    return {
      total: entries.length,
      unlocked,
      percent: entries.length === 0 ? 1 : unlocked / entries.length,
    };
  }

  toSave(): BestiarySave {
    const k: Record<string, number> = {};
    for (const [id, n] of this.kills) k[id] = n;
    return { k, s: [...this.sights], c: [...this.chats] };
  }

  static fromSave(data: BestiarySave | undefined): BestiaryTracker {
    const t = new BestiaryTracker();
    if (!data) return t;
    if (data.k) for (const [id, n] of Object.entries(data.k)) {
      if (typeof n === 'number' && n > 0) t.kills.set(id, Math.min(n, KILL_CAP));
    }
    if (data.s) for (const id of data.s) t.sights.add(id);
    if (data.c) for (const id of data.c) t.chats.add(id);
    return t;
  }

  /** WorldGen.cs:7068 Reset（世界重生成时清零） */
  reset(): void {
    this.kills.clear();
    this.sights.clear();
    this.chats.clear();
  }
}

/** NPC.cs:79701 IsNPCValidForBestiaryKillCredit（121 不计；EoW 三段需 boss 实例旗） */
export function isNpcValidForBestiaryKillCredit(vanillaId: number, isBoss: boolean): boolean {
  if (vanillaId === 121) return false;
  if (vanillaId === 13 || vanillaId === 14 || vanillaId === 15) return isBoss;
  return true;
}

// ============ 排序 id + 稀有度星（ContentSamples.NpcBestiarySortingId / NpcBestiaryRarityStars） ============
// 数据来源 tools/extract-bestiary.mjs → vanilla-bestiary.json：
//   TownNPCBestiaryPriority :4427 / NormalGoldCritterBestiaryPriority :4407 /
//   BossBestiaryPriority :4416（GetSortedBestiaryEntriesList orderby 三键）+
//   npcStats（1456 SetDefaults type 链逐 id 求值的 rarity/boss/damage/defense/lifeMax/aiStyle
//   六元组——FillNpcRarities :1072-1083 的公式入参，负 id 全在 Hide 表不进图鉴故未提取）+
//   ContentSamples.FillNpcRarities 显式覆盖(:1084-1220)
// 数据来源 tools/extract-bestiary-spawn.mjs → vanilla-bestiary-spawn.json：
//   byNpc + commonFilters（BestiaryHelper.GetLowestBiomeGroupIndex 的组序表）
import bestiaryJson from './vanilla-bestiary.json';
import spawnJson from './vanilla-bestiary-spawn.json';

type BestiaryJson = typeof bestiaryJson;
type SpawnJson = typeof spawnJson;
const TOWN_PRIORITY: number[] = (bestiaryJson as BestiaryJson).townNpcBestiaryPriority;
const GOLD_CRITTER_PRIORITY: number[] = (bestiaryJson as BestiaryJson).normalGoldCritterBestiaryPriority;
const BOSS_PRIORITY: number[] = (bestiaryJson as BestiaryJson).bossBestiaryPriority;
const STAR_OVERRIDES: Record<string, number> = (bestiaryJson as BestiaryJson).rarityStarOverrides;
/** npcStats 元组序（extract-bestiary.mjs）：[rarity, boss, damage, defense, lifeMax, aiStyle] */
type NpcStatsTuple = [number, number, number, number, number, number];
const NPC_STATS = (bestiaryJson as BestiaryJson).npcStats as unknown as Record<string, NpcStatsTuple>;
const COMMON_FILTERS: string[] = (spawnJson as unknown as SpawnJson).commonFilters;
const SPAWN_BY_NPC: Record<string, string[]> = (spawnJson as unknown as SpawnJson).byNpc;

/** 逐 NPC 投影（ContentSamples.NpcsByNetId 的 rarity/boss/战力/aiStyle 读数） */
function npcStats(npcId: number): NpcStatsTuple {
  return NPC_STATS[String(npcId)] ?? [0, 0, 0, 0, 0, 0];
}

/** NPC.rarity 字段 ≠ 0（BestiaryEntry.Enemy :34 `if (nPC.rarity != 0)
 *  list.Add(new RareSpawnBestiaryInfoElement(nPC.rarity))`）——Filters.ByRareCreature
 *  （Filters.cs:89-103 `entry.Info[i] is RareSpawnBestiaryInfoElement`）的判定面。
 *  ★≠NpcBestiaryRarityStars 星表：那表（ContentSamples.cs:1084 GetNPCBestiaryRarityStarsCount）
 *  公式以 1 起底恒 ≥1，是 0-5 星展示值，不是挂载门 */
export function isRareSpawnForBestiary(npcId: number): boolean {
  return npcStats(npcId)[0] !== 0;
}

/** NPC.isLikeATownNPC（NPC.cs:6772-6781）：453 恒真，其余走 townNPC 旗 */
export function isLikeATownNpc(npcId: number): boolean {
  return npcId === 453 || BESTIARY_TOWN_IDS.has(npcId);
}

/** ContentSamples.GetNPCBestiaryRarityStarsCount（:1223-1285）1:1：
 *  1 + rarity（1→+1 / 2→+1.5 / 3→+2 / 4→+2.5 / 5→+3 / >5→+3.5）+ boss 0.5 +
 *  战力阈（>50→+1 / >150→+1.5 / >500→+2 / >1000→+2.5 / >5000→+3 / >10000→+3.5），
 *  钳 5 取整（C# (int) 截断）。FillNpcRarities 先全量算公式再显式覆盖
 *  （城镇 1-3 / Boss 4-5 段），覆盖优先。入参全部取 npcStats 表（1456 SetDefaults
 *  求值）——Classic 难度 ScaleStats 乘数恒 1，链上原值即公式读数 */
export function bestiaryRarityStars(npcId: number): number {
  const o = STAR_OVERRIDES[npcId];
  if (o !== undefined) return o;
  const [rarity, boss, damage, defense, lifeMax] = npcStats(npcId);
  let n = 1 + rarity;
  if (rarity === 1) n += 1;
  else if (rarity === 2) n += 1.5;
  else if (rarity === 3) n += 2;
  else if (rarity === 4) n += 2.5;
  else if (rarity === 5) n += 3;
  else if (rarity > 0) n += 3.5;
  if (boss) n += 0.5;
  const power = damage + defense + Math.floor(lifeMax / 4);   // npc.lifeMax / 4 整除
  if (power > 10000) n += 3.5;
  else if (power > 5000) n += 3;
  else if (power > 1000) n += 2.5;
  else if (power > 500) n += 2;
  else if (power > 150) n += 1.5;
  else if (power > 50) n += 1;
  return Math.trunc(Math.min(n, 5));
}

/** BestiaryHelper.GetLowestBiomeGroupIndex（ContentSamples.cs:755-766）：
 *  commonElements（GetCommonInfoElementsForFilters :239-301，57 条）自尾向头
 *  找第一个出现在条目 Info 中的元素 → 返回该组号（即命中的最大组号）；
 *  一个公共元素都不含 = int.MaxValue */
export function lowestBiomeGroupIndex(npcId: number): number {
  const have = SPAWN_BY_NPC[String(npcId)];
  if (!have) return Number.MAX_SAFE_INTEGER;
  for (let i = COMMON_FILTERS.length - 1; i >= 0; i--) {
    if (have.includes(COMMON_FILTERS[i])) return i;
  }
  return Number.MAX_SAFE_INTEGER;
}

let sortingIdCache: Map<number, number> | null = null;

/** ContentSamples.CreateBestiarySortingIds（:1063-1073）——GetSortedBestiaryEntriesList
 *  （BestiaryHelper，ContentSamples.cs:745-753）九键 orderby 链的稳定全序 → 1..N 序号：
 *  城镇优先位 → !isLikeATownNPC → 金小动物优先位 → !CountsAsACritter → Boss 优先位 →
 *  群系组序（GetLowestBiomeGroupIndex）→ aiStyle → 战力 → 星数（全升序；
 *  IndexOf 缺席 = MAX，Boss 缺席 = -1）。原版 NpcsByNetId 全集（-65..696，含 Hide）
 *  参与 orderby、排序后才 RemoveAll(Hide)——序号只发给非 Hide 条目，故编号跳过 Hide。 */
export function bestiarySortingId(npcId: number): number {
  if (!sortingIdCache) {
    sortingIdCache = new Map();
    const townIdx = new Map(TOWN_PRIORITY.map((id, i) => [id, i]));
    const goldIdx = new Map(GOLD_CRITTER_PRIORITY.map((id, i) => [id, i]));
    const bossIdx = new Map(BOSS_PRIORITY.map((id, i) => [id, i]));
    const MAX = Number.MAX_SAFE_INTEGER;
    const sortKey = (id: number): number[] => {
      const [, , damage, defense, lifeMax, aiStyle] = npcStats(id);
      return [
        townIdx.get(id) ?? MAX,                 // GetBestiaryTownPriority
        isLikeATownNpc(id) ? 0 : 1,             // !isLikeATownNPC
        goldIdx.get(id) ?? MAX,                 // GetBestiaryNormalGoldCritterPriority
        countsAsACritter(id) ? 0 : 1,           // !CountsAsACritter
        bossIdx.get(id) ?? -1,                  // GetBestiaryBossPriority
        lowestBiomeGroupIndex(id),              // GetLowestBiomeGroupIndex（公共过滤元素组号）
        aiStyle,
        damage + defense + Math.floor(lifeMax / 4), // GetBestiaryPowerLevel（整除）
        bestiaryRarityStars(id),
      ];
    };
    const ids = Object.keys(NPC_NAME_BY_ID)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n !== 0);
    ids.sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      return a - b;   // 全键平手：稳定序（原版 List 稳定排序保持注册序）
    });
    let rank = 0;   // 序号只发给非 Hide 条目（CreateBestiarySortingIds 遍历 RemoveAll 后的表）
    for (const id of ids) {
      if (HIDE.has(id)) continue;
      sortingIdCache.set(id, ++rank);
    }
  }
  return sortingIdCache.get(npcId) ?? Number.MAX_SAFE_INTEGER;
}
