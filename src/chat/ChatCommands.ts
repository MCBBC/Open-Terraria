// 聊天命令系统（M3）——Terraria.Chat/ChatCommandProcessor.cs + Terraria.Chat.Commands/
// 全目录 1:1 移植（13 命令 + 默认 Say,注册序 = ChatInitializer.Load :17-25）。
//
// 原版流转（ChatMessage 携带 CommandId 上行,服务器 ProcessIncomingMessage 执行后
// 广播结果）。本仓房间服务器为纯中继（room.ts 不解析命令语义）,等价模型 =
// **发起端本地执行 ProcessIncomingMessage,结果行经聊天文本通道(channel=2 系统
// 行/channel=3 队伍定向)广播**——全体端显示同一份结果,掷骰等 RNG 单源不漂移。
// （BossDamage 的本人行 [c/FFAF00:] 高亮标记发起端名字:原版服务器逐端重排,
// 中继模型下单源广播,登记为协议模型偏差。）
//
// 命令表（ChatCommandAttribute Name → l10n 前缀）：
//   Party=/p  Roll=/roll  Emote=/me  Playing=/playing,/players  RPS=/rps
//   Emoji=/emoji,/e  Help=/help  Death=/death  PVPDeath=/pvpdeath
//   AllDeath=/alldeath  AllPVPDeath=/allpvpdeath  BossDamage=/boss伤害  Say=默认
// 表情别名(EmojiCommand.*,/大笑 等)→ 展开 "/e {EmojiName}"(ICommandAliasProvider)。
import { Lang } from '../i18n/Lang';
import { languageManager } from '../i18n/LanguageManager';
import { EMOTE_COUNT, EMOTE_NAMES } from '../data/vanillaEmotes';

/** ChatCommandId（命令名 = ChatCommandAttribute.Name） */
export type ChatCommandName =
  | 'Party' | 'Roll' | 'Emote' | 'Playing' | 'RPS' | 'Emoji' | 'Help'
  | 'Death' | 'PVPDeath' | 'AllDeath' | 'AllPVPDeath' | 'BossDamage' | 'Say';

/** 注册序（ChatInitializer.Load :17-25 逐 AddCommand;Say=AddDefaultCommand） */
export const COMMAND_ORDER: readonly ChatCommandName[] = [
  'Party', 'Roll', 'Emote', 'Playing', 'RPS', 'Emoji', 'Help',
  'Death', 'PVPDeath', 'AllDeath', 'AllPVPDeath', 'BossDamage', 'Say',
];

// ChatColors.cs
export const CHAT_SERVER: readonly [number, number, number] = [255, 240, 20];
export const CHAT_DEATH: readonly [number, number, number] = [255, 25, 25];
export const CHAT_WORLD: readonly [number, number, number] = [50, 255, 130];
/** EmoteCommand.RESPONSE_COLOR */
const EMOTE_COLOR: readonly [number, number, number] = [200, 100, 0];
/** Main.teamColor（Main.cs:6610-6615）——与 stats/Pvp.TEAM_COLORS 同一权威表 */
export { TEAM_COLORS as TEAM_COLOR } from '../stats/Pvp';
import { TEAM_COLORS } from '../stats/Pvp';

export interface ChatLine { text: string; color: readonly [number, number, number] }

export interface ChatCommandContext {
  /** 发起者显示名（Main.player[clientId].name） */
  playerName: string;
  /** 队伍 0-5（PartyChat 定向色） */
  team: number;
  /** 本地玩家死亡（RPS/Emoji 的 ProcessOutgoingMessage dead 门,Emoji/RPS 命令 :19/:65） */
  localPlayerDead: boolean;
  /** 联机态（netMode!=0;PartyChat 单机恒报无队错,PartyChatCommand :21） */
  multiplayer: boolean;
  /** 活跃玩家名列表（/playing:ListPlayersCommand;AllDeath 族名单） */
  activePlayers: string[];
  /** 名字 → 死亡计数（本机视角;远端玩家经 msg16 尾部同步） */
  playerDeaths: (name: string) => { pve: number; pvp: number };
  /** /boss伤害 报告（BossDamageTracker.RecentAttempts().GetReport(本人名)） */
  bossReports: string[];
  /** Main.rand 注入（默认 Math.random;测试注入确定性） */
  rand?: () => number;
}

export interface ChatCommandResult {
  /** 仅发起端显示（Help/ListPlayers/队伍错误——原版 SendChatMessageToClient） */
  local: ChatLine[];
  /** 全体广播（原版 BroadcastChatMessage,发起端同步本地回显） */
  broadcast: ChatLine[];
  /** 队伍定向（原版同队 SendChatMessageToClientAs;null=非队伍消息） */
  party: ChatLine[] | null;
  /** 玩家表情气泡 id（RPS/Emoji:netMode0 本地 NewBubble/netMode1 msg120） */
  emote: number | null;
  /** 消息吞没（已识别命令不再落默认 Say 聊天;false=普通聊天文本） */
  consumed: boolean;
}

/** Utils.ParseCommandPrefix（Utils.cs:2935-2951）1:1：
 *  前缀忽略大小写全等,或 前缀+空格+余文;remainder=空格后全文 */
export function parseCommandPrefix(text: string, prefix: string): { remainder: string } | null {
  if (text.length < prefix.length) return null;
  if (text.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return null;
  if (text.length === prefix.length) return { remainder: '' };
  if (text[prefix.length] !== ' ') return null;
  return { remainder: text.slice(prefix.length + 1) };
}

/** 命令 → 本地化前缀集（ChatCommandProcessor.AddCommand :19-39:
 *  单键 ChatCommand.<Name> 存在 → 单前缀;否则扫 ChatCommand.<Name>_* 多别名） */
export function commandPrefixes(cmd: ChatCommandName): string[] {
  const single = `ChatCommand.${cmd}`;
  if (Lang.has(single)) return [Lang.text(single)];
  const out: string[] = [];
  for (const key of languageManager.keysFromCategory('ChatCommand')) {
    if (key.startsWith(`${single}_`)) out.push(languageManager.getTextValue(key));
  }
  return out;
}

/** 表情别名表（EmojiCommand.PrepareAliases :31-42:仅 EmojiCommand.<名> 有键的
 *  表情成别名;展开 = "ChatCommand.Emoji_1 + ' ' + EmojiName.<名>"） */
function emojiAliases(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const emojiPrefix = Lang.text('ChatCommand.Emoji_1');
  for (let i = 0; i < EMOTE_COUNT; i++) {
    const name = EMOTE_NAMES[i];
    if (Lang.has(`EmojiCommand.${name}`)) {
      out.push([Lang.text(`EmojiCommand.${name}`), `${emojiPrefix} ${Lang.text(`EmojiName.${name}`)}`]);
    }
  }
  return out;
}

export interface OutgoingChatMessage { command: ChatCommandName; text: string }

/** ChatCommandProcessor.CreateOutgoingMessage（:80-95）1:1:
 *  ①命令前缀匹配(注册序) → {command, remainder} ②别名匹配 → 展开后重解析
 *  ③默认 Say。循环别名(理论上不存在)由展开深度闸断。 */
export function createOutgoingMessage(text: string, depth = 0): OutgoingChatMessage {
  if (depth < 8) {
    for (const cmd of COMMAND_ORDER) {
      if (cmd === 'Say') continue;
      for (const prefix of commandPrefixes(cmd)) {
        const hit = parseCommandPrefix(text, prefix);
        if (hit) return { command: cmd, text: hit.remainder };
      }
    }
    for (const [alias, expansion] of emojiAliases()) {
      if (parseCommandPrefix(text, alias)) return createOutgoingMessage(expansion, depth + 1);
    }
  }
  return { command: 'Say', text };
}

/** Main.rand.Next(min, max) */
function randNext(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min));
}

/** 表情 id 解析（EmojiCommand.ProcessOutgoingMessage :59-88）：
 *  数字直取(越界→-1 后静默)/本地化表情名(EqualsCommand 忽略大小写) */
export function resolveEmojiId(text: string): number {
  const n = Number(text);
  if (text !== '' && Number.isInteger(n)) {
    if (n >= 0 && n < EMOTE_COUNT) return n;
    return -1;
  }
  const lower = text.toLowerCase();
  for (let i = 0; i < EMOTE_COUNT; i++) {
    if (Lang.text(`EmojiName.${EMOTE_NAMES[i]}`).toLowerCase() === lower) return i;
  }
  return -1;
}

/** 死亡行（DeathCommand :15-20/LegacyMultiplayer.23(复数)/.25(单数);
 *  zh 文案自带 "*" 前缀（"*{0}被杀死了{1}次。"），勿再叠） */
function deathLine(name: string, count: number, pvp: boolean): ChatLine {
  const key = count === 1 ? (pvp ? 'LegacyMultiplayer.26' : 'LegacyMultiplayer.25')
    : (pvp ? 'LegacyMultiplayer.24' : 'LegacyMultiplayer.23');
  return { text: Lang.text(key, name, count), color: CHAT_DEATH };
}

/** /help 列表（HelpCommand.GetCommandAliasesByID+ComposeMessage :24-53:
 *  ChatCommandDescription 类目键序(语言包文件序)逐条 \n 拼,单键取
 *  ChatCommandDescription.<命令>——多别名命令(Playing/Emoji)共享一条描述） */
export function helpText(): string {
  const names: string[] = [];
  for (const key of languageManager.keysFromCategory('ChatCommandDescription')) {
    const n = key.slice('ChatCommandDescription.'.length);
    const cut = n.indexOf('_');
    names.push(cut === -1 ? n : n.slice(0, cut));
  }
  // 同名(多别名)只取首见(原版 Dictionary<string,List> 收敛)
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const n of names) {
    if (seen.has(n)) continue;
    seen.add(n);
    lines.push(Lang.text(`ChatCommandDescription.${n}`));
  }
  return lines.join('\n');
}

/** 命令执行（ProcessIncomingMessage 族 + RPS/Emoji 的 ProcessOutgoingMessage 侧效） */
export function executeCommand(msg: OutgoingChatMessage, ctx: ChatCommandContext): ChatCommandResult {
  const rand = ctx.rand ?? Math.random;
  const res: ChatCommandResult = { local: [], broadcast: [], party: null, emote: null, consumed: true };
  switch (msg.command) {
    case 'Party': {   // PartyChatCommand :15-35
      if (ctx.team === 0 || !ctx.multiplayer) {
        // SendNoTeamError（Lang.mp[10] = LegacyMultiplayer.10）→ 仅发起端
        res.local.push({ text: Lang.text('LegacyMultiplayer.10'), color: CHAT_SERVER });
        return res;
      }
      if (msg.text === '') return res;
      res.party = [{ text: msg.text, color: TEAM_COLOR[ctx.team] ?? TEAM_COLOR[0] }];
      return res;
    }
    case 'Roll': {    // RollCommand :11-15
      const n = randNext(rand, 1, 101);
      res.broadcast.push({ text: `*${ctx.playerName} ${Lang.text('LegacyMultiplayer.9')} ${n}`, color: CHAT_SERVER });
      return res;
    }
    case 'Emote': {   // EmoteCommand :11-19
      if (msg.text !== '') {
        res.broadcast.push({ text: `*${ctx.playerName} ${msg.text}`, color: EMOTE_COLOR });
      }
      return res;
    }
    case 'Playing': { // ListPlayersCommand :11-18（仅回发起端）
      res.local.push({ text: ctx.activePlayers.join(', '), color: CHAT_SERVER });
      return res;
    }
    case 'RPS': {     // RockPaperScissorsCommand :10-24（ outgoing 侧效,死亡门）
      if (ctx.localPlayerDead) return res;
      // NextFromList(37,38,36) 等概率
      res.emote = [37, 38, 36][Math.floor(rand() * 3)];
      return res;
    }
    case 'Emoji': {   // EmojiCommand :51-91
      if (ctx.localPlayerDead) return res;
      const id = resolveEmojiId(msg.text);
      if (id !== -1) res.emote = id;
      return res;
    }
    case 'Help': {    // HelpCommand :12-16（仅回发起端）
      res.local.push({ text: helpText(), color: CHAT_SERVER });
      return res;
    }
    case 'Death': {   // DeathCommand :11-20
      const c = ctx.playerDeaths(ctx.playerName);
      res.broadcast.push(deathLine(ctx.playerName, c.pve, false));
      return res;
    }
    case 'PVPDeath': { // PVPDeathCommand :11-20
      const c = ctx.playerDeaths(ctx.playerName);
      res.broadcast.push(deathLine(ctx.playerName, c.pvp, true));
      return res;
    }
    case 'AllDeath': { // AllDeathCommand :14-28（按 PVE 死亡数降序逐行）
      const rows = [...ctx.activePlayers].sort((a, b) => ctx.playerDeaths(b).pve - ctx.playerDeaths(a).pve);
      for (const name of rows) res.broadcast.push(deathLine(name, ctx.playerDeaths(name).pve, false));
      return res;
    }
    case 'AllPVPDeath': { // AllPVPDeathCommand :14-28（PVP 死亡数降序）
      const rows = [...ctx.activePlayers].sort((a, b) => ctx.playerDeaths(b).pvp - ctx.playerDeaths(a).pvp);
      for (const name of rows) res.broadcast.push(deathLine(name, ctx.playerDeaths(name).pvp, true));
      return res;
    }
    case 'BossDamage': { // BossDamageCommand :11-21（逐场报告广播）
      for (const report of ctx.bossReports) res.broadcast.push({ text: report, color: CHAT_WORLD });
      return res;
    }
    case 'Say':
      res.consumed = false;   // 默认命令：普通聊天（Game.sendChat 既有链路）
      return res;
  }
}
