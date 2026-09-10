// SW-FX15 表情轮盘补债定谳测试。
// 金标（1457；1458 同域 diff=0 已核）：
//   · 打开入口 = 背包表情角按钮（Main.cs:43093 DrawEmoteBubblesButton → :43128
//     IngameFancyUI.OpenUIState(new UIEmotesMenu())）——原版无表情热键
//     （PlayerInput TriggersSet/Keyboard 预设 PlayerInput.cs:2062-2140 无 Emote 触发器，
//     任务问句「按 B 缺省?」定谳=否；B=手柄 QuickBuff :2084）
//   · CanBeTalkedTo 门（Player.cs:3872-3882）：active∧!dead∧!ShouldNotDraw∧stealth==1f
//     —— CheckForNPCsToReactToEmoteBubble（EmoteBubble.cs:152-167）近距 200px 臂
//     以 talkable 为前提；stealth<1 只剩无视线遮挡臂
//   · EmoteButton.cs:32-36 帧算式 / :78-96 悬停音 12 + 左键 MakeLocalPlayerEmote+Close
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { checkForNPCsToReactToEmoteBubble, makeLocalPlayerEmote, emoteCount, emoteClearAll } from '../src/render/EmoteBubble';
import { emoteXY, bestiaryXY } from '../src/ui/vanillaInvLayout';
import { KEYBIND_ACTIONS } from '../src/core/Keybinds';
import type { TownNPC } from '../src/entities/TownNPC';

beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

type FakeNpc = Partial<TownNPC> & {
  dead: boolean; bound: boolean; x: number; y: number; cx: number; cy: number; facing: number;
  social: { kind: number; t: number; other: null; frameT: number; prevFrame: number; rpsA: number; rpsB: number } | null;
};
const mkNpc = (over: Partial<FakeNpc> = {}): FakeNpc => ({
  dead: false, bound: false, x: 0, y: 0, cx: 0, cy: 0, facing: 1, social: null,
  ai0: 0, ...over,
});

describe('SW-FX15 定谳①：打开入口=背包角按钮，无表情热键（原版本相）', () => {
  it('原版角钮坐标 1:1：表情(534,278)/图鉴(498,278)；开箱态 (539,446)/(503,446)（Main.cs:43098-43108）', () => {
    expect(emoteXY(false)).toEqual({ x: 534, y: 278 });
    expect(emoteXY(true)).toEqual({ x: 539, y: 446 });
    expect(bestiaryXY(false)).toEqual({ x: 498, y: 278 });
    expect(bestiaryXY(true)).toEqual({ x: 503, y: 446 });
  });

  it('键位表无表情动作（TriggersSet.cs 零 Emote 触发器——原版只从背包开）', () => {
    expect(KEYBIND_ACTIONS.some((a) => /emote/i.test(a))).toBe(false);
  });

  it('接线面源断言：vinvEmoteBtn→onEmoteMenu→openEmoteMenu→Game.makeLocalPlayerEmote→net.sendEmote', () => {
    const ui = readFileSync('src/ui/UI.ts', 'utf8');
    expect(ui).toMatch(/vinvEmoteBtn/);
    expect(ui).toMatch(/this\.onEmoteMenu = \(\) =>/);
    expect(ui).toMatch(/openEmoteMenu\(this\.root,/);
    // 打开期间暂停世界 + 阻断输入（IngameFancyUI 语义），关闭 onBack 还原
    expect(ui).toMatch(/g\.paused = true;\s*\n\s*g\.input\.uiBlocking = true;/);
    // 选完表情→Game 链（EmoteButton.LeftClick :94 MakeLocalPlayerEmote 1:1）
    expect(ui).toMatch(/makeLocalPlayerEmote: \(id\) => \{\s*\n\s*g\.makeLocalPlayerEmote\(id\);/);
    const game = readFileSync('src/core/Game.ts', 'utf8');
    expect(game).toMatch(/sendEmote: \(id\) => this\.net\?\.sendEmote\(id\)/);
    expect(game).toMatch(/reactToNpcs: \(\) => this\.reactNpcsToPlayerEmote\(\)/);
  });
});

describe('SW-FX15 定谳②：CanBeTalkedTo 门（Player.cs:3872 stealth==1f）', () => {
  const los = () => true;

  it('可见（stealth=1）→ 200px 近距臂照常回应', () => {
    const near = mkNpc({ cx: 60, cy: 100 });
    checkForNPCsToReactToEmoteBubble(
      { cx: 100, cy: 100, x: 90, y: 90, w: 20, h: 40, stealth: 1 },
      [near] as unknown as TownNPC[], los);
    expect(near.social).toMatchObject({ kind: 19, t: 220 });
  });

  it('★潜行中（stealth<1）→ 近距臂不回应（蘑菇矿/星璇隐身不惊动城镇 NPC）', () => {
    const near = mkNpc({ cx: 60, cy: 100 });
    checkForNPCsToReactToEmoteBubble(
      { cx: 100, cy: 100, x: 90, y: 90, w: 20, h: 40, stealth: 0.9 },
      [near] as unknown as TownNPC[], los);
    expect(near.social).toBeNull();
  });

  it('潜行中无视线遮挡 → 仍回应（原版 (talkable && dist<200) || !CanHitLine 右臂不收门）', () => {
    const behindWall = mkNpc({ cx: 500, cy: 100 });
    checkForNPCsToReactToEmoteBubble(
      { cx: 100, cy: 100, x: 90, y: 90, w: 20, h: 40, stealth: 0 },
      [behindWall] as unknown as TownNPC[], () => false);
    expect(behindWall.social).toMatchObject({ kind: 19 });
  });

  it('★ULP 桥：JS double 回升漂移 0.9999999999999999 视作可对话（C# float 累加溢出钳回精确 1f）', () => {
    const near = mkNpc({ cx: 60, cy: 100 });
    checkForNPCsToReactToEmoteBubble(
      { cx: 100, cy: 100, x: 90, y: 90, w: 20, h: 40, stealth: 1 - 1e-15 },
      [near] as unknown as TownNPC[], los);
    expect(near.social).toMatchObject({ kind: 19 });
  });

  it('无 stealth 字段（旧锚形状/测试桩）= 缺省可见，向后兼容', () => {
    const near = mkNpc({ cx: 60, cy: 100 });
    checkForNPCsToReactToEmoteBubble(
      { cx: 100, cy: 100, x: 90, y: 90, w: 20, h: 40 },
      [near] as unknown as TownNPC[], los);
    expect(near.social).toMatchObject({ kind: 19 });
  });

  it('Game 接线把 player.stealth 送入门（源断言——潜行字段单源 Player.stealth）', () => {
    const game = readFileSync('src/core/Game.ts', 'utf8');
    expect(game).toMatch(/checkForNPCsToReactToEmoteBubble\(\n(?:\s*\/\/[^\n]*stealth[^\n]*\n)+\s*this\.player, npcs,/);
    const bubble = readFileSync('src/render/EmoteBubble.ts', 'utf8');
    expect(bubble).toMatch(/player: \{ cx: number; cy: number; x: number; y: number; w: number; h: number; stealth\?: number \}/);
    expect(bubble).toMatch(/talkable && dist < 200/);
  });
});

describe('SW-FX15 定谳③：轮盘选中→演出链（EmoteButton.LeftClick :91-96 → MakeLocalPlayerEmote）', () => {
  beforeEach(() => { emoteClearAll(); });

  it('选表情=本地出泡 360t + NPC 回应 + 死亡门吞（EmoteBubble.cs:279-293）', () => {
    let sent: number | null = null;
    let reacted = false;
    makeLocalPlayerEmote(
      { cx: 0, y: 0, w: 20, facing: 1 }, 149,
      { dead: false, sendEmote: (id) => { sent = id; }, reactToNpcs: () => { reacted = true; } });
    expect(emoteCount()).toBe(1);
    expect(sent).toBe(149);
    expect(reacted).toBe(true);
    // 死亡门
    makeLocalPlayerEmote(
      { cx: 0, y: 0, w: 20, facing: 1 }, 149, { dead: true });
    expect(emoteCount()).toBe(1);   // 死亡门吞掉第二次
  });
});
