// M4 表情系统 1:1 单测：UIEmotesMenu 分组数据（七类/解锁门）+ EmoteBubble
// （玩家气泡/OnBubbleChange/NPC 回应/MakeLocalPlayerEmote 死亡门）。
// 分组表与门控逐条对照 Terraria.GameContent.UI.States/UIEmotesMenu.cs
// GetEmotesGeneral/RPS/Items/BiomesAndEvents/TownNPCs/Critters/Bosses（:108-283）。
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import {
  EMOTES_GENERAL, EMOTES_RPS, EMOTES_ITEMS, EMOTES_BIOMES, EMOTES_TOWN,
  emotesCritters, emotesBosses, emoteGroups, type EmoteGateFlags,
} from '../src/ui/EmoteMenu';
import { EMOTE_COUNT, EMOTE_NAMES } from '../src/data/vanillaEmotes';
import {
  spawnEmote, tickEmotes, emoteCount, makeLocalPlayerEmote,
  checkForNPCsToReactToEmoteBubble, type EmoteBubbleInstance,
} from '../src/render/EmoteBubble';
import type { TownNPC } from '../src/entities/TownNPC';

beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

describe('表情 id 表（EmoteID.cs 全量）', () => {
  it('Count=151,下标即 id,关键锚点抽查', () => {
    expect(EMOTE_COUNT).toBe(151);
    expect(EMOTE_NAMES.length).toBe(151);
    expect(EMOTE_NAMES[0]).toBe('EmotionLove');
    expect(EMOTE_NAMES[33]).toBe('RPSWinScissors');
    expect(EMOTE_NAMES[37]).toBe('RPSRock');
    expect(EMOTE_NAMES[126]).toBe('PartyPresent');
    expect(EMOTE_NAMES[149]).toBe('LucyTheAxe');
    expect(EMOTE_NAMES[150]).toBe('BossDeerclops');
    expect(new Set(EMOTE_NAMES).size).toBe(151);   // 无重名
  });
});

describe('静态分组（UIEmotesMenu :108-151 原表）', () => {
  it('常规 29 项', () => {
    expect([...EMOTES_GENERAL]).toEqual([
      0, 1, 2, 3, 15, 136, 94, 16, 135, 134,
      137, 138, 139, 17, 87, 88, 89, 91, 92, 93,
      8, 9, 10, 11, 14, 100, 146, 147, 148,
    ]);
  });
  it('石头剪刀布 6 项 / 物品 23 项 / 自然和天气 23 项 / 城镇 30 项', () => {
    expect([...EMOTES_RPS]).toEqual([36, 37, 38, 33, 34, 35]);
    expect(EMOTES_ITEMS.length).toBe(23);
    expect(EMOTES_BIOMES.length).toBe(23);
    expect(EMOTES_TOWN.length).toBe(30);
    expect(EMOTES_ITEMS[EMOTES_ITEMS.length - 1]).toBe(149);   // 露西斧居物品组末位
    expect(EMOTES_TOWN[0]).toBe(101);
  });
});

describe('事件小动物解锁门（GetEmotesCritters :153-176）', () => {
  it('基线 10 项;四事件旗标各解锁一项（64 哥布林/66 雪人/65 海盗/71 火星）', () => {
    const f: EmoteGateFlags = {};
    expect(emotesCritters(f)).toEqual([12, 13, 61, 62, 63, 67, 68, 69, 70, 72]);
    expect(emotesCritters({ downedGoblins: true })).toContain(64);
    expect(emotesCritters({ downedFrost: true })).toContain(66);
    expect(emotesCritters({ downedPirates: true })).toContain(65);
    expect(emotesCritters({ downedMartians: true })).toContain(71);
    const all = emotesCritters({ downedGoblins: true, downedFrost: true, downedPirates: true, downedMartians: true });
    expect(all).toEqual([12, 13, 61, 62, 63, 67, 68, 69, 70, 72, 64, 66, 65, 71]);
  });
});

describe('Boss 表情解锁门（GetEmotesBosses :178-283）', () => {
  it('零旗标 → 空（一只 Boss 都没杀过时"危险"组整组不入列）', () => {
    expect(emotesBosses({})).toEqual([]);
  });
  it('逐旗标 → 表情 id（原版 if 序）', () => {
    expect(emotesBosses({ downed_4: true })).toEqual([39]);            // EoC
    expect(emotesBosses({ downedEyeOfCthulhu: true })).toEqual([39]);  // 双键并集
    expect(emotesBosses({ downed_13: true })).toEqual([40, 41]);       // EoW → 双表情
    expect(emotesBosses({ downed_266: true })).toEqual([40, 41]);      // BoC 同门
    expect(emotesBosses({ downed_50: true })).toEqual([51]);           // 史莱姆王
    expect(emotesBosses({ downed_668: true })).toEqual([150]);         // 鹿角怪
    expect(emotesBosses({ downed_222: true })).toEqual([42]);          // 蜂后
    expect(emotesBosses({ downed_35: true })).toEqual([43]);           // 骷髅王
    expect(emotesBosses({ hardMode: true })).toEqual([44]);            // 肉山
    expect(emotesBosses({ downed_641: true })).toEqual([144]);         // 史莱姆皇后
    expect(emotesBosses({ downed_134: true })).toEqual([45]);          // 毁灭者
    expect(emotesBosses({ downed_127: true })).toEqual([46]);          // 铁骷髅王
    expect(emotesBosses({ downed_126: true })).toEqual([47]);          // 双子
    expect(emotesBosses({ downed_125: true })).toEqual([47]);
    expect(emotesBosses({ downed_262: true })).toEqual([48]);
    expect(emotesBosses({ downed_245: true })).toEqual([49]);
    expect(emotesBosses({ downed_370: true })).toEqual([50]);
    expect(emotesBosses({ downed_636: true })).toEqual([143]);
    expect(emotesBosses({ downed_439: true })).toEqual([52]);
    expect(emotesBosses({ downed_398: true })).toEqual([53]);
    expect(emotesBosses({ downed_325: true })).toEqual([54]);          // 哀木
    expect(emotesBosses({ downed_327: true })).toEqual([55]);
    expect(emotesBosses({ downed_344: true })).toEqual([56]);          // 常绿尖叫树
    expect(emotesBosses({ downed_345: true })).toEqual([57]);
    expect(emotesBosses({ downed_346: true })).toEqual([58]);
    expect(emotesBosses({ downedPirates: true })).toEqual([59]);
    expect(emotesBosses({ downedMartians: true })).toEqual([60]);
    expect(emotesBosses({ downedOldOnesArmyT1: true })).toEqual([133]); // DD2 任意难度
    expect(emotesBosses({ downedOldOnesArmyT3: true })).toEqual([133]);
  });
});

describe('分组序列（TryAddingList :91-97——空组不入列）', () => {
  it('零旗标 6 组;全旗标 7 组按原版序', () => {
    const g0 = emoteGroups({});
    expect(g0.map((g) => g.titleKey)).toEqual([
      'UI.EmoteCategoryGeneral', 'UI.EmoteCategoryRPS', 'UI.EmoteCategoryItems',
      'UI.EmoteCategoryBiomesAndEvents', 'UI.EmoteCategoryTownNPCs', 'UI.EmoteCategoryCritters',
    ]);
    const gAll = emoteGroups({ downed_4: true });
    expect(gAll.length).toBe(7);
    expect(gAll[6].titleKey).toBe('UI.EmoteCategoryBosses');
    // 本地化标题（面板显示）
    expect(languageManager.getTextValue(gAll[6].titleKey)).toBe('危险');
  });
});

// ================= EmoteBubble（玩家气泡 + NPC 回应） =================

const anchor = (n = 1) => ({ cx: 100 * n, y: 50, w: 20, facing: 1 });

// 模块级气泡表跨用例共享——每组前清空（tick 至出清,寿命 ≤360t 有界）
beforeEach(() => { for (let i = 0; i < 400 && emoteCount(); i++) tickEmotes(); });

describe('spawnEmote / OnBubbleChange（EmoteBubble.cs:116-132/:263-277）', () => {
  it('同实体新泡将旧泡压到 6t（闭合消隐动画）而非拒绝', () => {
    const a = anchor();
    spawnEmote(a, 0, 360);
    spawnEmote(a, 15, 360);
    expect(emoteCount()).toBe(2);                       // 两泡并存（原版 byID 各自独立）
    // 旧泡 lifeTime=6：7 tick 后先于新泡（360t）消亡
    for (let i = 0; i < 7; i++) tickEmotes();
    expect(emoteCount()).toBe(1);
  });
  it('tickEmotes 帧动画（8t/帧,2 帧循环）+ 寿命递减', () => {
    const a = anchor(2);
    spawnEmote(a, 0, 20);
    for (let i = 0; i < 8; i++) tickEmotes();
    // 20t 寿命未到（8t 过）——仍在场;此处仅验不抛错与最终出清
    for (let i = 0; i < 20; i++) tickEmotes();
    expect(emoteCount()).toBe(0);
  });
});

describe('makeLocalPlayerEmote（EmoteBubble.cs:279-293）', () => {
  it('本地出泡 360t + NPC 回应 + 联机广播回调', () => {
    let sent = -1;
    let reacted = 0;
    makeLocalPlayerEmote(anchor(3), 36, {
      dead: false,
      sendEmote: (id) => { sent = id; },
      reactToNpcs: () => { reacted++; },
    });
    expect(sent).toBe(36);
    expect(reacted).toBe(1);
    expect(emoteCount()).toBe(1);
    for (let i = 0; i < 359; i++) tickEmotes();
    expect(emoteCount()).toBe(1);     // 360t 寿命
    tickEmotes();
    expect(emoteCount()).toBe(0);
  });
  it('死亡门：不出泡/不广播/不触发回应', () => {
    let sent = -1;
    makeLocalPlayerEmote(anchor(4), 36, {
      dead: true,
      sendEmote: (id) => { sent = id; },
      reactToNpcs: () => { throw new Error('不应触发'); },
    });
    expect(sent).toBe(-1);
    expect(emoteCount()).toBe(0);
  });
  it('单机（无 sendEmote）仅本地链', () => {
    makeLocalPlayerEmote(anchor(5), 15, { dead: false, reactToNpcs: () => {} });
    expect(emoteCount()).toBe(1);
  });
});

describe('CheckForNPCsToReactToEmoteBubble（:152-167）', () => {
  type FakeNpc = Partial<TownNPC> & {
    dead: boolean; bound: boolean; x: number; y: number; cx: number; cy: number; facing: number;
    social: { kind: number; t: number; other: null; frameT: number; prevFrame: number; rpsA: number; rpsB: number } | null;
  };
  const mkNpc = (over: Partial<FakeNpc> = {}): FakeNpc => ({
    dead: false, bound: false, x: 0, y: 0, cx: 0, cy: 0, facing: 1, social: null,
    ai0: 0, ...over,
  });
  const player = { cx: 100, cy: 100, x: 90, y: 90, w: 20, h: 40 };
  const los = () => true;

  it('近处 ai0<2 城镇 NPC → 置 kind19 态 220t + 面向玩家', () => {
    const near = mkNpc({ x: 0, y: 0, cx: 60, cy: 100 });
    const far = mkNpc({ x: 0, y: 0, cx: 900, cy: 100 });           // >200px 且 LOS 通 → 不回应
    const busy = mkNpc({ x: 0, y: 0, cx: 60, cy: 100, ai0: 3 });   // ai0>=2（社交中）不打断
    checkForNPCsToReactToEmoteBubble(
      player, [near, far, busy] as unknown as TownNPC[], los);
    expect(near.social).toMatchObject({ kind: 19, t: 220 });
    expect(near.facing).toBe(1);       // n.x < player.x → direction 1
    expect(far.social).toBeNull();
    expect(busy.social).toBeNull();
  });
  it('200px 外但无视线遮挡（!CanHitLine）→ 仍回应（原版 || 语义）', () => {
    const behindWall = mkNpc({ cx: 500, cy: 100 });
    checkForNPCsToReactToEmoteBubble(player, [behindWall] as unknown as TownNPC[], () => false);
    expect(behindWall.social).toMatchObject({ kind: 19 });
  });
});
