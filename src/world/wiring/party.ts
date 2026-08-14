// 派对系统（BirthdayParty.cs 1:1——ManualParty 手动 + GenuineParty 生日自然派对）。
// 手动链路：天塔柱 455 电路触发（Wiring.cs:2037-2039）与右键（Player.cs:31809-31814）
// 共用 ToggleManualParty；入夜 CheckNight（:40-53）结束并粉字广播 Lang.misc[99]。
// 自然链路（NaturalAttempt :62-143）：CheckMorning 每晨掷——需 Party Girl(208) 在场、
// 冷却 PartyDaysOnCooldown（命中后 5-10 天）、1/10（十周年 1/7）→ 在场可派对 NPC
// ≥5 人时开派对（1/5 且 >12 人 → 3 人 / 1/3 → 2 人 / 其余 1 人过生日），
// 广播 Game.BirthdayParty_1/2/3，冷却置 rand(5,11)。
// PartyIsUp = ManualParty || GenuineParty（:26-34）。
import { Lang } from '../../i18n/Lang';
import { TOWN_NPC_IDS } from '../../data/vanillaNpcs';

export interface PartyState {
  /** BirthdayParty.ManualParty */
  manualParty: boolean;
  /** BirthdayParty.GenuineParty（自然生日派对） */
  genuineParty: boolean;
  /** BirthdayParty.PartyDaysOnCooldown（自然派对天数冷却，随存档走） */
  daysOnCooldown: number;
  /** BirthdayParty.CelebratingNPCs（过生日的 NPC whoAmI——渲染层派对帽；近似存 npcKey） */
  celebratingNpcs: string[];
}

export function newPartyState(): PartyState {
  return { manualParty: false, genuineParty: false, daysOnCooldown: 0, celebratingNpcs: [] };
}

/** BirthdayParty.PartyIsUp（:26-34） */
export function partyIsUp(s: PartyState): boolean {
  return s.manualParty || s.genuineParty;
}

/** ToggleManualParty（:145-163）：翻转 ManualParty，返回 PartyIsUp 是否变化 */
export function toggleManualParty(s: PartyState): boolean {
  const was = partyIsUp(s);
  s.manualParty = !s.manualParty;
  return was !== partyIsUp(s);
}

/** CheckNight（:40-53）：入夜结算——派对进行中则结束并要求广播 Lang.misc[99]
 *  （"派对时间结束！"，粉 255,0,160）。返回 true = 需要广播 */
export function partyCheckNight(s: PartyState): boolean {
  let flag = false;
  if (s.genuineParty) {
    flag = true;
    s.genuineParty = false;
    s.celebratingNpcs.length = 0;
  }
  if (s.manualParty) {
    flag = true;
    s.manualParty = false;
  }
  return flag;
}

/** NaturalAttempt（:62-143）：每晨掷自然生日派对。
 *  townNpcKeys = 在场城镇 NPC key 列表；girlPresent = 派对女孩在场；
 *  返回公告文本（null = 未开派对）。 */
export function partyNaturalAttempt(s: PartyState, opts: {
  townNpcKeys: string[]; girlPresent: boolean; anniversary: boolean;
  rng: () => number; int: (a: number, b: number) => number;
}): string | null {
  const { townNpcKeys, girlPresent, rng, int } = opts;
  // :64-68：无 Party Girl 直接返回（单机非客户端恒过）
  if (!girlPresent) return null;
  // 冷却（:69-73）
  if (s.daysOnCooldown > 0) { s.daysOnCooldown--; return null; }
  // 1/10（十周年 1/7）（:74-80）
  const maxValue = opts.anniversary ? 7 : 10;
  if (!(rng() < 1 / maxValue)) return null;
  // 在场可派对 NPC ≥5（CanNPCParty :55-60 近似：排除 old_man/skeleton_merchant/tax_collector
  // 与城镇宠物——本仓城镇列表本就不含宠物，按 key 排除三类）
  const EXCLUDE = new Set(['old_man', 'skeleton_merchant', 'tax_collector']);
  const candidates = townNpcKeys.filter((k) => !EXCLUDE.has(k));
  if (candidates.length < 5) return null;
  // 人数：1/5 且 >12 → 3 / 1/3 → 2 / 其余 1（:106-113）
  let count = 1;
  if (rng() < 0.2 && candidates.length > 12) count = 3;
  else if (rng() < 1 / 3) count = 2;
  // 洗牌取前 count 人（:114-135）
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = int(0, i);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  s.celebratingNpcs = candidates.slice(0, count);
  s.genuineParty = true;
  s.daysOnCooldown = int(5, 10);
  // 广播（:136-145：Game.BirthdayParty_1/2/3）
  const names = s.celebratingNpcs.map((k) => townNpcName(k)).filter(Boolean);
  const key = `Game.BirthdayParty_${count}`;
  if (Lang.has(key)) {
    return Lang.text(key, ...names);
  }
  return Lang.text('Mods.SandboxWorld.Party.Birthday', names.join('、'));
}

/** WorldClear（:182-190）：切世界/清档复位 */
export function partyWorldClear(s: PartyState): void {
  s.manualParty = false;
  s.genuineParty = false;
  s.celebratingNpcs.length = 0;
}

/** NPC key → 当前语言名（公告用；Lang.npcName 走原版 12 语言译名表,
 *  映射缺失返回空串由调用方过滤——旧硬编码中文名表已退役） */
function townNpcName(key: string): string {
  const id = TOWN_NPC_IDS[key]?.id;
  return (id !== undefined ? Lang.npcName(id) : null) ?? '';
}
