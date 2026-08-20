// M3 聊天命令系统 1:1 单测（Terraria.Chat/ChatCommandProcessor + Terraria.Chat.Commands
// 全目录）：逐命令解析（前缀/别名/大小写/边界）/执行结果行（格式·颜色·consumed）/
// 表情解析/死亡行单复数/Boss 伤害统计（NPCDamageTracker 语义链）。
// 真实 zh-Hans 包注入（ChatCommand.* 前缀与文案断言需要;同 bestiary-ui.test.ts 先例）。
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import {
  createOutgoingMessage, executeCommand, parseCommandPrefix, resolveEmojiId,
  helpText, commandPrefixes, chatColorOfDifficulty,
  type ChatCommandContext, type OutgoingChatMessage,
} from '../src/chat/ChatCommands';
import {
  bossDamageAddDamage, bossDamageUpdate, bossDamageKilled, recentBossReports,
  resetBossDamage, bindBossDamageHost, setPendingStrikeOwner, consumePendingStrikeOwner,
} from '../src/chat/BossDamageTracker';

beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

const ctx = (over: Partial<ChatCommandContext> = {}): ChatCommandContext => ({
  playerName: 'Vinlic',
  team: 0,
  localPlayerDead: false,
  multiplayer: true,
  activePlayers: ['Vinlic', 'Bob', 'Alice'],
  playerDeaths: (n) => n === 'Vinlic' ? { pve: 2, pvp: 0 }
    : n === 'Bob' ? { pve: 5, pvp: 1 } : { pve: 0, pvp: 3 },
  bossReports: [],
  ...over,
});

describe('ParseCommandPrefix（Utils.cs:2935-2951）', () => {
  it('前缀忽略大小写;全等或 空格边界', () => {
    expect(parseCommandPrefix('/roll', '/roll')).toEqual({ remainder: '' });
    expect(parseCommandPrefix('/ROLL', '/roll')?.remainder).toBe('');
    expect(parseCommandPrefix('/roll  x', '/roll')?.remainder).toBe(' x');
    expect(parseCommandPrefix('/rollx', '/roll')).toBeNull();   // 无空格边界 → 不匹配
    expect(parseCommandPrefix('/ro', '/roll')).toBeNull();
    expect(parseCommandPrefix('', '/roll')).toBeNull();
  });
});

describe('CreateOutgoingMessage（命令表解析）', () => {
  it('13 命令 + 默认 Say（zh 前缀）', () => {
    expect(createOutgoingMessage('/roll')).toEqual({ command: 'Roll', text: '' });
    expect(createOutgoingMessage('/p hi there')).toEqual({ command: 'Party', text: 'hi there' });
    expect(createOutgoingMessage('/me 挥了挥手')).toEqual({ command: 'Emote', text: '挥了挥手' });
    expect(createOutgoingMessage('/playing')).toEqual({ command: 'Playing', text: '' });
    expect(createOutgoingMessage('/players')).toEqual({ command: 'Playing', text: '' });
    expect(createOutgoingMessage('/rps')).toEqual({ command: 'RPS', text: '' });
    expect(createOutgoingMessage('/e 5')).toEqual({ command: 'Emoji', text: '5' });
    expect(createOutgoingMessage('/emoji 5')).toEqual({ command: 'Emoji', text: '5' });
    expect(createOutgoingMessage('/help')).toEqual({ command: 'Help', text: '' });
    expect(createOutgoingMessage('/death')).toEqual({ command: 'Death', text: '' });
    expect(createOutgoingMessage('/pvpdeath')).toEqual({ command: 'PVPDeath', text: '' });
    expect(createOutgoingMessage('/alldeath')).toEqual({ command: 'AllDeath', text: '' });
    expect(createOutgoingMessage('/allpvpdeath')).toEqual({ command: 'AllPVPDeath', text: '' });
    expect(createOutgoingMessage('/boss伤害')).toEqual({ command: 'BossDamage', text: '' });
    expect(createOutgoingMessage('大家好')).toEqual({ command: 'Say', text: '大家好' });
    // 未知 '/' 前缀落默认 Say（服务器只拦已知 /rules /gm——不吞玩家输入）
    expect(createOutgoingMessage('/notacommand hi')).toEqual({ command: 'Say', text: '/notacommand hi' });
  });
  it('表情别名（EmojiCommand.* → 展开 /e {EmojiName}）', () => {
    expect(createOutgoingMessage('/大笑')).toEqual({ command: 'Emoji', text: '大笑' });
    expect(createOutgoingMessage('/睡觉')).toEqual({ command: 'Emoji', text: '睡觉' });
    // 非别名前缀不劫持
    expect(createOutgoingMessage('/roll')).toEqual({ command: 'Roll', text: '' });
  });
  it('多别名命令前缀集（ChatCommand.Playing_0/_1、Emoji_0/_1）', () => {
    expect([...commandPrefixes('Playing')].sort()).toEqual(['/players', '/playing']);
    expect([...commandPrefixes('Emoji')].sort()).toEqual(['/e', '/emoji']);
    expect(commandPrefixes('Roll')).toEqual(['/roll']);
    expect(commandPrefixes('Say')).toEqual([]);
  });
});

describe('RollCommand（掷骰 1-100）', () => {
  it('Main.rand.Next(1,101) 闭开区间 + 广播行（ServerMessage 黄）', () => {
    const r = executeCommand({ command: 'Roll', text: '' }, ctx({ rand: () => 0 }));
    expect(r.consumed).toBe(true);
    expect(r.broadcast).toEqual([{ text: '*Vinlic 掷出了 1', color: [255, 240, 20] }]);
    expect(r.local).toEqual([]);
    const r2 = executeCommand({ command: 'Roll', text: '' }, ctx({ rand: () => 0.9999 }));
    expect(r2.broadcast[0].text).toBe('*Vinlic 掷出了 100');
  });
});

describe('EmoteCommand（/me 第三人称）', () => {
  it('广播 "*名 文本" 橙 (200,100,0);空文本无输出', () => {
    const r = executeCommand({ command: 'Emote', text: '在跳舞' }, ctx());
    expect(r.broadcast).toEqual([{ text: '*Vinlic 在跳舞', color: [200, 100, 0] }]);
    const empty = executeCommand({ command: 'Emote', text: '' }, ctx());
    expect(empty.broadcast).toEqual([]);
    expect(empty.consumed).toBe(true);
  });
});

describe('ListPlayersCommand（/playing 仅回发起端）', () => {
  it('活跃名单逗号拼接,不广播', () => {
    const r = executeCommand({ command: 'Playing', text: '' }, ctx());
    expect(r.local).toEqual([{ text: 'Vinlic, Bob, Alice', color: [255, 240, 20] }]);
    expect(r.broadcast).toEqual([]);
  });
});

describe('RockPaperScissorsCommand（/rps 随机表情 37/38/36）', () => {
  it('NextFromList(37,38,36) 等概率三选', () => {
    expect(executeCommand({ command: 'RPS', text: '' }, ctx({ rand: () => 0 })).emote).toBe(37);
    expect(executeCommand({ command: 'RPS', text: '' }, ctx({ rand: () => 0.4 })).emote).toBe(38);
    expect(executeCommand({ command: 'RPS', text: '' }, ctx({ rand: () => 0.9 })).emote).toBe(36);
  });
  it('死亡门（ProcessOutgoingMessage :17-21 dead → Consume 无声吞没）', () => {
    const r = executeCommand({ command: 'RPS', text: '' }, ctx({ localPlayerDead: true }));
    expect(r.emote).toBeNull();
    expect(r.broadcast).toEqual([]);
    expect(r.consumed).toBe(true);
  });
});

describe('EmojiCommand（/e 数字或表情名）', () => {
  it('数字直取 + 越界静默;本地化名忽略大小写', () => {
    expect(resolveEmojiId('5')).toBe(5);
    expect(resolveEmojiId('0')).toBe(0);
    expect(resolveEmojiId('150')).toBe(150);
    expect(resolveEmojiId('151')).toBe(-1);
    expect(resolveEmojiId('-1')).toBe(-1);
    expect(resolveEmojiId('爱心')).toBe(0);        // EmojiName.EmotionLove
    expect(resolveEmojiId('大笑')).toBe(15);       // EmoteLaugh
    expect(resolveEmojiId('不存在的表情')).toBe(-1);
  });
  it('有效表情 → emote;死亡门同 RPS', () => {
    const r = executeCommand({ command: 'Emoji', text: '5' }, ctx());
    expect(r.emote).toBe(5);
    expect(r.consumed).toBe(true);
    expect(executeCommand({ command: 'Emoji', text: '999' }, ctx()).emote).toBeNull();
    expect(executeCommand({ command: 'Emoji', text: '5' }, ctx({ localPlayerDead: true })).emote).toBeNull();
  });
});

describe('PartyChatCommand（队伍频道）', () => {
  it('无队 / 单机 → 仅发起端错误行（LegacyMultiplayer.10）', () => {
    const noTeam = executeCommand({ command: 'Party', text: 'hi' }, ctx({ team: 0 }));
    expect(noTeam.local).toEqual([{ text: '你不在团队中！', color: [255, 240, 20] }]);
    const sp = executeCommand({ command: 'Party', text: 'hi' }, ctx({ team: 3, multiplayer: false }));
    expect(sp.local[0].text).toBe('你不在团队中！');   // 原版 :21 netMode==0 恒错误
  });
  it('空文本静默;有队 → 队伍定向行（Main.teamColor 队色）', () => {
    expect(executeCommand({ command: 'Party', text: '' }, ctx({ team: 2 })).party).toBeNull();
    const r = executeCommand({ command: 'Party', text: '进攻!' }, ctx({ team: 2 }));
    expect(r.party).toEqual([{ text: '进攻!', color: [59, 218, 85] }]);   // team2 绿 (59,218,85)
    expect(r.broadcast).toEqual([]);
  });
});

describe('Death/PVPDeath 命令族', () => {
  it('单复数分键（.23 复数 / .25 单数;PvP .24/.26）+ 红 (255,25,25)', () => {
    const d = executeCommand({ command: 'Death', text: '' }, ctx());
    expect(d.broadcast).toEqual([{ text: '*Vinlic被杀死了2次。', color: [255, 25, 25] }]);
    const one = executeCommand({ command: 'Death', text: '' },
      ctx({ activePlayers: ['Vinlic'], playerDeaths: () => ({ pve: 1, pvp: 1 }) }));
    expect(one.broadcast[0].text).toBe('*Vinlic被杀死了1次。');   // LegacyMultiplayer.25
    const p = executeCommand({ command: 'PVPDeath', text: '' },
      ctx({ activePlayers: ['Vinlic'], playerDeaths: () => ({ pve: 0, pvp: 3 }) }));
    expect(p.broadcast[0].text).toBe('*Vinlic被其他玩家杀死了3次。');
  });
  it('AllDeath/AllPVPDeath 按计数降序逐行（Main.player active 序全体）', () => {
    const r = executeCommand({ command: 'AllDeath', text: '' }, ctx());
    expect(r.broadcast.map((l) => l.text)).toEqual([
      '*Bob被杀死了5次。', '*Vinlic被杀死了2次。', '*Alice被杀死了0次。',
    ]);
    const r2 = executeCommand({ command: 'AllPVPDeath', text: '' }, ctx());
    expect(r2.broadcast.map((l) => l.text)).toEqual([
      '*Alice被其他玩家杀死了3次。', '*Bob被其他玩家杀死了1次。', '*Vinlic被其他玩家杀死了0次。',
    ]);
  });
});

describe('HelpCommand（命令描述列表）', () => {
  it('ChatCommandDescription 类目序逐条 \\n 拼,12 命令全覆盖无占位残留', () => {
    const t = helpText();
    const lines = t.split('\n');
    expect(lines.length).toBe(12);                       // 多别名命令共享一条描述
    expect(lines.some((l) => l.includes('/roll'))).toBe(true);
    expect(lines.some((l) => l.includes('/help'))).toBe(true);
    expect(lines.some((l) => l.includes('/boss'))).toBe(true);
    for (const l of lines) expect(l).not.toMatch(/\{\d\}/);
    const r = executeCommand({ command: 'Help', text: '' }, ctx());
    expect(r.local[0].text).toBe(t);
    expect(r.broadcast).toEqual([]);                      // 仅回发起端
  });
});

describe('BossDamageCommand（报告透传 World 绿）', () => {
  it('RecentAttempts 报告逐行广播', () => {
    const r = executeCommand({ command: 'BossDamage', text: '' },
      ctx({ bossReports: ['报告A', '报告B'] }));
    expect(r.broadcast).toEqual([
      { text: '报告A', color: [50, 255, 130] },
      { text: '报告B', color: [50, 255, 130] },
    ]);
  });
});

describe('SayChatCommand（默认命令）', () => {
  it('未识别为命令 → consumed=false（普通聊天走既有链路）', () => {
    const r = executeCommand({ command: 'Say', text: 'hello' }, ctx());
    expect(r.consumed).toBe(false);
    expect(r.broadcast).toEqual([]);
  });
});

describe('Player.ChatColor 难度色（Player.cs:32230-32238）', () => {
  it('中端 (255,153,0) / 硬核 (255,38,25) / 经典·旅程白', () => {
    expect(chatColorOfDifficulty(0)).toEqual([255, 255, 255]);
    expect(chatColorOfDifficulty(1)).toEqual([255, 153, 0]);
    expect(chatColorOfDifficulty(2)).toEqual([255, 38, 25]);
    expect(chatColorOfDifficulty(3)).toEqual([255, 255, 255]);
    expect(chatColorOfDifficulty(undefined)).toEqual([255, 255, 255]);
  });
});

// ================= BossDamageTracker（NPCDamageTracker.cs 语义链） =================

beforeEach(() => {
  resetBossDamage();
  bindBossDamageHost({
    npcName: (t) => `NPC${t}`,
    ownerName: (slot) => slot < 0 ? 'Vinlic' : slot === 255 ? '陷阱与减益' : `玩家${slot}`,
  });
});

const boss = (hp: number, type = 50) =>
  ({ vanillaId: type, hp, realLifeHost: null, def: { boss: true } });

describe('AddDamage（伤害归账）', () => {
  it('Boss 建 tracker;min(dmg, life) 溢杀不膨胀;按名聚合', () => {
    const b = boss(100);
    // 模拟 Enemy.hurt 序：AddDamage(先,钳余命) → hp -= dmg（原版 :82129 在扣血前）
    bossDamageAddDamage(b, -1, 30); b.hp -= 30;
    bossDamageAddDamage(b, -1, 50); b.hp -= 50;
    bossDamageAddDamage(b, 255, 1000); b.hp = 0;   // 世界伤害 + 溢杀钳剩余 20
    expect(recentBossReports('Vinlic')).toEqual([]); // 进行中未结案 → RecentAttempts 空
    // 停战结案（Update 无在场类型 → 进 recent）
    bossDamageUpdate(() => new Set());
    const done = recentBossReports('Vinlic');
    expect(done.length).toBe(1);
    expect(done[0]).toContain('NPC50的伤害等级：');
    expect(done[0]).toContain('Vinlic');
    expect(done[0]).toContain('80%');           // Vinlic 80 / 世界 20（1000 钳到剩余 20）
    expect(done[0]).toContain('陷阱与减益');
  });
  it('非 Boss（且无复合族登记）不建 tracker', () => {
    const mob = { vanillaId: 3, hp: 50, realLifeHost: null, def: { boss: false } };
    bossDamageAddDamage(mob, -1, 10);
    bossDamageUpdate(() => new Set());
    expect(recentBossReports('Vinlic')).toEqual([]);
  });
  it('realLife 归主段（毁灭者节打头账）', () => {
    const head = boss(1000, 134);
    const seg = { vanillaId: 135, hp: 1000, realLifeHost: head, def: { boss: false } };
    bossDamageAddDamage(seg, -1, 200);          // 经 GetRealActiveNPC 归 134 主段账
    head.hp -= 200;
    bossDamageUpdate(() => new Set([134]));
    bossDamageUpdate(() => new Set());          // 离场结案
    const rep = recentBossReports('Vinlic')[0];
    expect(rep).toContain('NPC134的伤害等级：');
    expect(rep).toContain('100%');              // 单一贡献者（归主段成功）
    expect(rep).toContain('Vinlic');
  });
  it('复合族名覆写（TheTwins=126/125 共账,族名 Enemies.TheTwins）', () => {
    bindBossDamageHost({ npcName: () => 'X', ownerName: () => 'Vinlic' });
    const retina = boss(500, 125);
    bossDamageAddDamage(retina, -1, 100);
    const spaz = { vanillaId: 126, hp: 500, realLifeHost: null, def: { boss: false } };
    bossDamageAddDamage(spaz, -1, 100);         // IncludeDamageFor 命中同一复合 tracker
    bossDamageUpdate(() => new Set([126]));
    bossDamageUpdate(() => new Set());
    const rep = recentBossReports('Vinlic')[0];
    expect(rep).toContain('双子魔眼');          // Language "Enemies.TheTwins"
  });
  it('BossKilled → "被击杀"文案;逃脱 → "逃脱"文案', () => {
    const b1 = boss(100, 4);
    bossDamageAddDamage(b1, -1, 100);
    bossDamageKilled(b1);
    bossDamageUpdate(() => new Set());
    const b2 = boss(100, 35);
    bossDamageAddDamage(b2, -1, 30);            // 未击杀离场（天亮逃走）→ 逃脱
    bossDamageUpdate(() => new Set());
    const reps = recentBossReports(null);       // 结案序:b1 先入环
    expect(reps[0]).toContain('后被击杀');
    expect(reps[1]).toContain('后逃脱');
  });
  it('RecentAttempts 环上限 3 场', () => {
    for (const t of [4, 35, 50, 113]) {
      const b = boss(10, t);
      bossDamageAddDamage(b, -1, 10);
      bossDamageUpdate(() => new Set());
    }
    const reps = recentBossReports('Vinlic');
    expect(reps.length).toBe(3);
    expect(reps[0]).toContain('NPC35');         // 最旧出环
    expect(reps[2]).toContain('NPC113');
  });
  it('本人行 [c/FFAF00:] 高亮（GetReport forPlayer）', () => {
    const b = boss(100, 4);
    bossDamageAddDamage(b, -1, 60);
    bossDamageAddDamage(b, 3, 40);              // 远端玩家3
    bossDamageUpdate(() => new Set());
    expect(recentBossReports('Vinlic')[0]).toContain('[c/FFAF00:');
    expect(recentBossReports(null)[0]).not.toContain('[c/FFAF00:');
  });
  it('百分比最大余数法凑整 100（CalculatePercentages :349-377）', () => {
    const b = boss(3, 4);
    bossDamageAddDamage(b, -1, 1);
    bossDamageAddDamage(b, 3, 1);
    bossDamageAddDamage(b, 4, 1);
    bossDamageUpdate(() => new Set());
    const rep = recentBossReports(null)[0];
    // 3×33.33% → 33/33/33 余 1 给首位 → 34/33/33
    expect(rep).toContain('34%');
    expect(rep).toContain('33%');
  });
  it('pendingStrikeOwner 消费一次即清（msg42 远端归账）', () => {
    setPendingStrikeOwner(7);
    expect(consumePendingStrikeOwner()).toBe(7);
    expect(consumePendingStrikeOwner()).toBeNull();
  });
});

describe('命令执行出口契约（Game.executeChatCommand 消费形态）', () => {
  it('识别命令恒 consumed（不再落 Say 广播——含无效 /e 参数）', () => {
    for (const cmd of ['Party', 'Roll', 'Emote', 'Playing', 'RPS', 'Emoji', 'Help',
      'Death', 'PVPDeath', 'AllDeath', 'AllPVPDeath', 'BossDamage'] as const) {
      const msg: OutgoingChatMessage = { command: cmd, text: '' };
      expect(executeCommand(msg, ctx()).consumed, cmd).toBe(true);
    }
  });
});
