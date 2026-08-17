// LucyAxeMessage.cs（Terraria.GameContent/LucyAxeMessage.cs）1:1 —— 露西斧台词全链。
// 源七类：Idle / Storage / ThrownAway / PickedUp / ChoppedTree / ChoppedGemTree /
// ChoppedCactus；台词 = LanguageManager.IndexedFromCategory（类目内取模循环，
// variation 全局自增 byte）；冷却 7 槽逐 tick 递减（Main.cs:17222）。
// 弹字 = PopupText.NewText(AdvancedPopupRequest)：420t、色 RGB(184,96,98)×1.15、
// velocity；音 = SoundID.LucyTheAxeTalk（lucyaxe_talk 5 变体，vol 0.4）；表情 149。
// MP msg141 跨玩家同步未接（纯视觉，各自客户端本地生成，记档偏差）。
import { languageManager } from '../i18n/LanguageManager';

export type LucySource =
  | 'idle' | 'storage' | 'thrownAway' | 'pickedUp'
  | 'choppedTree' | 'choppedGemTree' | 'choppedCactus';

const SOURCES: LucySource[] = [
  'idle', 'storage', 'thrownAway', 'pickedUp',
  'choppedTree', 'choppedGemTree', 'choppedCactus',
];
const CATEGORY: Record<LucySource, string> = {
  idle: 'LucyTheAxe_Idle',
  storage: 'LucyTheAxe_Storage',
  thrownAway: 'LucyTheAxe_ThrownAway',
  pickedUp: 'LucyTheAxe_PickedUp',
  choppedTree: 'LucyTheAxe_ChoppedTree',
  choppedGemTree: 'LucyTheAxe_GemTree',
  choppedCactus: 'LucyTheAxe_ChoppedCactus',
};
/** AdvancedPopupRequest.Color = new Color(184, 96, 98) * 1.15f（clamp 255） */
const POPUP_COLOR = '#D46E71';

export interface LucySinks {
  popup(text: string, x: number, y: number, vx: number, vy: number): void;
  talk(x: number, y: number): void;
  emote(): void;
  top(): { x: number; y: number };
  direction(): number;
}

let sinks: LucySinks | null = null;
let variation = 0;                       // static byte _variation
const cooldowns = [0, 0, 0, 0, 0, 0, 0];

const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));

export function setLucySinks(s: LucySinks | null): void { sinks = s; }

/** UpdateMessageCooldowns（Main.cs:17222）：逐 tick 递减 */
export function tickLucyCooldowns(): void {
  for (let i = 0; i < cooldowns.length; i++) if (cooldowns[i] > 0) cooldowns[i]--;
}

function onCooldown(src: LucySource): boolean { return cooldowns[SOURCES.indexOf(src)] > 0; }
export function putLucyOnCooldown(src: LucySource, frames: number): void {
  cooldowns[SOURCES.indexOf(src)] = frames;
}

/** Hooks_OnEnterWorld：进世界 Idle 先进 7200-14400t 冷却（进世界不立即说话） */
export function lucyEnterWorld(): void {
  putLucyOnCooldown('idle', rand(7200, 14400));
}

/** GiveIdleMessageCooldown（Create 内调用）：每次说话把 Idle 推远 */
function giveIdleCooldown(): void {
  putLucyOnCooldown('idle', rand(7200, 14400));
}

/** TryPlayingIdleMessage（Player.cs:24442-24450，本地玩家每帧调）：
 *  速度 = NextFloatDirection()*7, -2 + NextFloat()*-2 */
export function lucyTryIdle(): void {
  if (!sinks || onCooldown('idle')) return;
  create('idle', (Math.random() * 2 - 1) * 7, -2 - Math.random() * 2);
}

/** TryCreatingMessageWithCooldown（仙人掌砍，cooldown 420）：
 *  ItemSlot_OnItemTransferred 的 Storage/PickedUp 同款（420 前置冷却） */
export function lucyTryWithCooldown(src: LucySource, cd: number): void {
  if (!sinks || onCooldown(src)) return;
  putLucyOnCooldown(src, cd);
  create(src, sinks.direction() * 7, -2);
}

/** Create（树/宝石树砍无冷却；ThrownAway 直调）：弹字 + 音 + 表情 + variation++，
 *  Idle 同步进冷却 */
export function create(src: LucySource, vx: number, vy: number): void {
  if (!sinks) return;
  giveIdleCooldown();
  const p = sinks.top();
  const text = languageManager.indexedFromCategory(CATEGORY[src], variation);
  if (text) sinks.popup(text, p.x, p.y, vx, vy);
  sinks.talk(p.x, p.y);
  sinks.emote();
  variation = (variation + 1) & 0xFF;   // byte _variation++
}

/** 测试/探针 */
export function lucyCooldownOf(src: LucySource): number { return cooldowns[SOURCES.indexOf(src)]; }
export function lucyVariation(): number { return variation; }
