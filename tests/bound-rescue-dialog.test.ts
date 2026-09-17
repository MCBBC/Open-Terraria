// BJ117-② 2026-09-18【trio 解救一体对话收口（BJ31 族债）】
// 定谳（1457=1458 直读，同行同文零漂移）：
//  ①原版解救全链 = 右键（Main.HoverOverNPCs :43781 bound 族名单 + :43805-43812
//    talkNPC!=i && !tileInteractionHappened → CloseAll+dropItemCheck+SetTalkNPC(i)
//    + npcChatText=nPC.GetChat()【bound 型唤醒语】+ PlaySound(24)）→ 下一拍 NPC.AI
//    aiStyle0 头（:19874-19912 player.talkNPC==whoAmI）→ AI_000_TransformBoundNPC
//    （:45371-45381：Transform + UpdateSavedStates + RegisterChatStartWith +
//    SetTalkNPC）——解救与开对话【一体】：右键一次即开对话面板，首台词 = 换型前
//    bound 型 GetChat（:95218 dialog120 / :95268 dialog137 / :95361 dialog156 /
//    :95756 dialog315-318 / :95900 dialog353-355 / :95926 BartenderFirstMeeting /
//    :95934 GolferFirstMeeting1/2），点击拍捕获后整场对话不再刷新。
//  ②本仓旧状 = 右键解救后需【再右键】才开对话（freeBoundNpc 后直接 return true
//    不开）——BJ31 族债，本刀在 talkToNearbyNpc bound 支补 openNpcDialog(wake)
//    一体面（wake=Game.boundWakeChat 单源表,敌怪桶 wakeBoundEnemyNpc 同源）。
//  ③685 抖箱支原版无 SetTalkNPC（Main.cs:43759-43772 只 TryFreeingElderSlime +
//    TransformElderSlime + PlaySound(22)）、534 税务官不在 :43781 交互名单（唯净化
//    粉链 Transform 441）——两者解救不开对话（boundWakeChat 返回 null）。
//  ④触碰解救（boundTouchCheck）系登记 UX 近似（spawn-parity-gaps.md），本刀保留
//    =方案 B 最小面；方案 A（全 1:1 摘触碰解救,仅 talk 触发）待用户拍板。
// 本测试锁：解救→freeBoundNpc→openNpcDialog(wake) 一体 / wake 台词表逐键 /
// 随机档钉值 / 685·534 不开对话。变异接缝见各 it 注。
import { describe, it, expect, afterEach, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/Game';
import { TownNPC } from '../src/entities/TownNPC';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';
import { TILE } from '../src/core/constants';

// 真实 zh-Hans 包注入（bestiary-ungated-tooltip 同先例）——否则 Lang 缺键回退
// key 本身，台词断言沦为「两侧同回退」vacuous 等值
beforeAll(() => {
  languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));
});

type AnyGame = Record<string, any>;

/** Game 原型桩（sw-bj25 同式）：真 freeBoundNpc（旗面可断言）+ openNpcDialog 侦听 */
function makeRig(key: string) {
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  const npc = new TownNPC(key, 100 * TILE, 98 * TILE);
  npc.bound = true;
  g.player = { dead: false, buffs: { has: () => false } };
  g.smartInteractNpcId = -1;
  g.dialogNpc = null;
  g.entities = { enemies: [], npcs: [npc] };
  g.worldRegionIntersects = () => true;
  g.npcHoverHit = () => true;
  g.world = { flags: {} as Record<string, boolean> };
  g.consumeVanillaItem = () => true;   // 685 金钥匙门放行（非 685 不经此门）
  g.newText = () => {};
  g.spawnParticles = () => {};
  g.playSfxFiles = () => {};
  g.checkAchievementRealEstateAndTownSlimes = () => {};
  const dialogs: Array<{ npc: unknown; chat?: string }> = [];
  g.openNpcDialog = (n: unknown, chat?: string) => { dialogs.push({ npc: n, chat }); };
  return { g, npc, dialogs };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BJ117-② 解救一体对话（talkToNearbyNpc bound 支）', () => {
  it('右键解救机械师 → freeBoundNpc + openNpcDialog 一体，首台词 = dialog156', () => {
    const { g, npc, dialogs } = makeRig('mechanic');
    expect((g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE)).toBe(true);
    expect(npc.bound).toBe(false);                        // 真解救（freeBoundNpc 全链）
    expect((g.world.flags as Record<string, boolean>).savedMech).toBe(true); // UpdateSavedStates 面
    expect(dialogs.length).toBe(1);                       // ★一体：解救即开对话（变异①摘 openNpcDialog → 0 → 红）
    expect(dialogs[0].npc).toBe(npc);
    expect(dialogs[0].chat).toBe(Lang.text('LegacyDialog.156'));   // NPC.cs:95361（变异②映射错档 → 红）
    expect(dialogs[0].chat).not.toBe('LegacyDialog.156'); // 非「缺键回退 key 本身」（防 vacuous）
  }, 60000);

  it.each([
    ['goblin_tinkerer', 'LegacyDialog.120'],   // :95218
    ['wizard', 'LegacyDialog.137'],            // :95268
    ['mechanic', 'LegacyDialog.156'],          // :95361
    ['tavernkeep', 'BartenderSpecialText.FirstMeeting'],   // :95926
  ])('%s 唤醒语 = %s（bound 型 GetChat 直读）', (key, want) => {
    const { g, dialogs } = makeRig(key);
    (g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(dialogs.length).toBe(1);
    expect(dialogs[0].chat).toBe(Lang.text(want));
    expect(dialogs[0].chat).not.toBe(want);   // 非「缺键回退 key 本身」（防 vacuous）
  }, 60000);

  it('随机档钉值：stylist 315..318（Next(4)）/ golfer FirstMeeting1/2（Next(2)）/ angler 353..355', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);      // 档首：315 / Meeting1 / 353
    const s1 = makeRig('stylist');
    (s1.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(s1.dialogs[0].chat).toBe(Lang.text('LegacyDialog.315'));
    const g1 = makeRig('golfer');
    (g1.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(g1.dialogs[0].chat).toBe(Lang.text('GolferSpecialText.FirstMeeting1'));
    const a1 = makeRig('angler');
    (a1.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(a1.dialogs[0].chat).toBe(Lang.text('LegacyDialog.353'));

    vi.spyOn(Math, 'random').mockReturnValue(0.99);   // 档尾：318 / Meeting2 / 355
    const s2 = makeRig('stylist');
    (s2.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(s2.dialogs[0].chat).toBe(Lang.text('LegacyDialog.318'));
    const g2 = makeRig('golfer');
    (g2.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(g2.dialogs[0].chat).toBe(Lang.text('GolferSpecialText.FirstMeeting2'));
    const a2 = makeRig('angler');
    (a2.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(a2.dialogs[0].chat).toBe(Lang.text('LegacyDialog.355'));
  }, 60000);

  it('685 抖箱支 / 534 税务官：解救但不开对话（原版无 SetTalkNPC 面）', () => {
    // 变异③：boundWakeChat 给 685/534 回台词 → 本组红
    const a = makeRig('town_slime_old');
    (a.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(a.npc.bound).toBe(false);                      // 金钥匙门放行 → 已解救
    expect(a.dialogs.length).toBe(0);                     // Main.cs:43759-43772 无 SetTalkNPC
    const b = makeRig('tax_collector');
    (b.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(b.npc.bound).toBe(false);
    expect(b.dialogs.length).toBe(0);                     // 534 不在 :43781 交互名单
  }, 60000);
});
