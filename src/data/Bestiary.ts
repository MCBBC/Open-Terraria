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
//  - quickUnlock（Boss / ShouldBeCountedAsBossForBestiary{517,422,507,493,13,664} 及
//    ModifyEntriesThatNeedIt 手工 {565,577,551,491} + 击杀归并族）：杀 1 只即满档；
//  - Multi/HighestOf 条目（68/35/37 三联、534、蝾螈族 494-506、金小动物 13 条、小动物对 4 组）：
//    任一来源解锁即解锁（GetEntryUICollectionInfo 取 max）。
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
/** HighestOfMultipleUICollectionInfoProvider 复合条目（Populator :565/:588-590） */
const MULTI_SOURCES: Record<number, Array<'kill' | 'chat' | [number, 'kill' | 'chat']>> = {
  // 每项 = [npcId, 来源类型]；'kill'/'chat' 表示本条目自身
  68: [[68, 'kill'], [35, 'kill'], [54, 'chat']],
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

/** NPC.CountsAsACritter（NPC.cs:6803-6812）——遇数扫描/小动物条目判定 */
export function countsAsACritter(npcId: number): boolean {
  const v = VANILLA_NPCS[String(npcId)];
  if (!v) return false;
  return v.lifeMax <= 5 && v.damage === 0 && npcId !== 594 && npcId !== 686;
}

/** BestiaryEntryUnlockState（0 未知 1 仅头像 2 +属性 3 +掉落 4 +掉落率） */
export const enum UnlockState {
  NotKnown = 0,
  PortraitOnly = 1,
  Stats = 2,
  DropsNoRates = 3,
  DropsWithRates = 4,
}

type Source =
  | { t: 'kill'; credit: string; quick: boolean; full: number }
  | { t: 'sight'; credit: string }
  | { t: 'chat'; credit: string };

export interface BestiaryEntryDef {
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

/** 全量 NPC 的 boss 旗（Enemy.ts VANILLA_BOSS_IDS 同表；BestiaryEntry.Enemy :37 quickUnlock 判定） */
const VANILLA_BOSS_IDS = new Set([
  4, 13, 35, 50, 68, 113, 125, 126, 127, 134, 222, 245, 262, 266, 370, 395, 398, 439, 636, 657,
  325, 327, 345, 346,
]);

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
            : s[1] === 'kill' ? killSource(s[0], isQuick(s[0])) : chatSource(s[0]));
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
    out.push({ creditId: bestiaryCreditId(id), kind, sources, goldGate });
  }
  entryCache = out;
  return out;
}

function isQuick(id: number): boolean {
  return VANILLA_BOSS_IDS.has(id) || COUNTED_AS_BOSS.has(id) || QUICK_UNLOCK_IDS.has(id);
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

  /** NPCKillsTracker.RegisterKill（杀数上限 999999999） */
  registerKill(netId: number): void {
    const id = bestiaryCreditId(netId);
    const next = Math.min((this.kills.get(id) ?? 0) + 1, KILL_CAP);
    this.kills.set(id, next);
  }

  /** NPCWasNearPlayerTracker.RegisterWasNearby（首遇置位即可，幂等） */
  registerSight(netId: number): void {
    this.sights.add(bestiaryCreditId(netId));
  }

  /** NPCWasChatWithTracker.RegisterChatStartWith（幂等） */
  registerChat(netId: number): void {
    this.chats.add(bestiaryCreditId(netId));
  }

  private anyGoldSeen(): boolean {
    for (const g of GOLD_CRITTER_IDS) {
      if (this.sights.has(bestiaryCreditId(g))) return true;
    }
    return false;
  }

  /** 条目解锁档（各 UIInfoProvider.GetEntryUICollectionInfo 的数据层等价） */
  unlockState(entry: BestiaryEntryDef): UnlockState {
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

  /** 条目是否已解锁（完成度分母口径：UnlockState > NotKnown） */
  isUnlocked(entry: BestiaryEntryDef): boolean {
    return this.unlockState(entry) > UnlockState.NotKnown;
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
