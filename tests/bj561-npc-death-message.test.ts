// ★BJ561（2026-10-08）城镇 NPC 死亡公告 1:1——用户实报「NPC 死亡不在左下角信息栏显示消息」。
//  判例锚（反编译 Terarria1457/Terraria/ 唯一标杆,动刀前逐件亲读定谳）：
//  · 原版面 = NPC.checkDead townNPC 支 :78942-78974：
//      门 = `townNPC && type != 37(老人) && type != 453(骷髅商)`（:78942）;
//      文本 = NetworkText.FromKey(Lang.misc[num6].Key, fullNetName)（:78956）——
//        常规 num6=19 = LegacyMisc.19 "{0} was slain..."（zh "{0}被杀死了……"）；
//        渔夫 369/公主 663/城镇宠物 num6=36 = LegacyMisc.36 "{0} has left!"
//        （zh "{0}已离开！"）,同支把墓碑旗 flag 置 false（:78951-78955）;
//      IsTownPet 全表 = 637 猫/638 狗/656 兔/670 蓝史莱姆/678-684 城镇史莱姆族
//        （NPCID.cs:4446）;
//      fullNetName = GetFullNetName（:7376-7383;HasGivenName=_givenName.Length!=0
//        :6765）= 具名 ? Game.NPCTitle(given,type)（:7382,en "{0} the {1}"/zh
//        "{1}{0}"）: 类型名（:7380）;
//      色 = ChatColors.Death (255,25,25)（ChatColors.cs:15）恒色——血月/入侵无
//        变体（该支仅此一处着色;玩家死亡 (225,25,25) = Player.cs:39222 另一支）;
//      位次 = 广播 :78973 在死亡音 :78990 / NPCLoot :78999 / active=false :79029
//        之前（NPCLuck :78944 → 文本 :78949-78956 → 墓碑 :78969 → 广播 :78973）。
//  · 敌怪死亡无消息：checkDead 无 townNPC 支即无广播（敌怪侧仅 type 35 红帽变体
//    Taunt1 :78856-78859 凋侃行,非死亡公告面;本仓该行已在 Game.ts:44765 接）。
//  · 本仓消费单口 = game.chatBroadcast（ChatHelper.BroadcastChatMessage 等价面,
//    本地消息列 + 联机 channel2 中继——同玩家死亡 Game.ts:51029 形）。
//  变异证红契约（≥2 发→恰红,逐字节还原+sha256 对拍）：
//   M1 37/453 排除门删去 → ③老人/骷髅商支红
//   M2 宠物支（369/663/IsTownPet）删去 → ②四型红（断言「已离开」文本落空）
//   M3 颜色改 (225,25,25)（玩家死亡色串味）→ ①色断言红
//   M4 广播调用删除或移到死亡音之后 → ①零广播红 / ⑤位次红
//   M5 fullNetName 退化恒类型名（具名支删） → ①b 具名支红
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';
import { GorePiece } from '../src/entities/GorePiece';
import { vi } from 'vitest';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';

beforeAll(() => {
  // l10n 资产直载（ball-bounce-broadcast.test.ts 同式）——公告文本断言用真值非键回退
  languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));
});

// ---- 公共桩 ----------------------------------------------------------------

type Ev = ['chat', string, number, number, number] | ['sfx', string[]] | ['dmg', number];

function mkGame(w: World, log: Ev[]): GameHooks {
  return {
    world: w,
    player: { dead: true, hp: 100, maxHp: 100, x: -9999, y: -9999, w: 0, h: 0, addDPS: () => {} },
    addDamageNumber: (_x: number, _y: number, amt: number) => { log.push(['dmg', amt]); },
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: (files: string[]) => { log.push(['sfx', files]); },
    spawnDrop: () => null, onEnemyKilled: () => {},
    spawnDust: () => null, playSfxFile: () => {},
    critters: () => [], enemies: () => [], npcs: () => [],
    recLog: () => {},
    // ★BJ561 消费单口：ChatHelper.BroadcastChatMessage 等价面（Game.ts:51003）
    chatBroadcast: (text: string, r: number, g: number, b: number) => { log.push(['chat', text, r, g, b]); },
  } as unknown as GameHooks;
}

const town = (key: string, x = 100 * 16, y = 90 * 16) => new TownNPC(key, x, y);

const chats = (log: Ev[]) => log.filter((e): e is ['chat', string, number, number, number] => e[0] === 'chat');
const sfxIdx = (log: Ev[]) => log.findIndex((e) => e[0] === 'sfx');
const chatIdx = (log: Ev[]) => log.findIndex((e) => e[0] === 'chat');

// ---- ① 常规城镇死亡公告：文本/颜色/具名面 --------------------------------

describe('BJ561-①：常规城镇 NPC 死亡 → LegacyMisc.19 (255,25,25)', () => {
  it('①a 向导致死 → 恰 1 条消息、无 {0} 残留、含个人名、色 255/25/25', () => {
    const log: Ev[] = [];
    const n = town('guide');
    n.givenName = '安德鲁';
    const ok = n.hurt(9999, 0, 0, mkGame(new World(200, 200, 110, 'bj561-1a'), log), 0, 0, false, true);
    expect(ok).toBe(true);
    const cs = chats(log);
    expect(cs.length).toBe(1);                                    // ★恰 1 条（删广播=本案红）
    const [text, r, g, b] = cs[0].slice(1) as [string, number, number, number];
    expect(r).toBe(255); expect(g).toBe(25); expect(b).toBe(25);  // ★ChatColors.Death（M3 红）
    expect(text).toContain('安德鲁');                              // ★具名全名（M5 红）
    expect(text).toContain('被杀死了');                            // ★LegacyMisc.19 zh 面
    expect(text.includes('{0}')).toBe(false);                     // 占位符已替换
    expect(text).toBe(Lang.text('LegacyMisc.19',
      Lang.text('Game.NPCTitle', '安德鲁', Lang.npcName(22) ?? '')));
  });

  it('①b 无个人名 → 纯类型名（GetFullNetName !HasGivenName 支 :7380）', () => {
    const log: Ev[] = [];
    const n = town('guide');
    n.givenName = '';
    n.hurt(9999, 0, 0, mkGame(new World(200, 200, 110, 'bj561-1b'), log), 0, 0, false, true);
    const cs = chats(log);
    expect(cs.length).toBe(1);
    expect(cs[0][1]).toBe(Lang.text('LegacyMisc.19', Lang.npcName(22) ?? ''));
    expect(cs[0][1].includes('安德鲁')).toBe(false);
  });
});

// ---- ② 宠物便（num6=36）："has left" 变体 --------------------------------

describe('BJ561-②：渔夫 369/公主 663/城镇宠物 → LegacyMisc.36 "{0}已离开！"', () => {
  // :78951-78955 num6=36 同支（IsTownPet = NPCID.cs:4446 全表）
  const petKeys = ['angler', 'princess', 'town_cat', 'town_dog', 'town_bunny',
    'town_slime_red', 'town_slime_blue', 'town_slime_old', 'town_slime_cool',
    'town_slime_clumsy', 'town_slime_diva', 'town_slime_squire', 'town_slime_yellow'];
  for (const key of petKeys) {
    it(`${key} → 已离开文本`, () => {
      const log: Ev[] = [];
      const n = town(key);
      n.givenName = '';
      n.hurt(9999, 0, 0, mkGame(new World(200, 200, 110, `bj561-2-${key}`), log), 0, 0, false, true);
      const cs = chats(log);
      expect(cs.length).toBe(1);
      expect(cs[0][1]).toContain('已离开');                        // ★M2 红：删宠物支落回「被杀死了」
      expect(cs[0][1].includes('{0}')).toBe(false);
      expect(cs[0].slice(2)).toEqual([255, 25, 25]);
    });
  }
});

// ---- ③ 排除面：老人 37 / 骷髅商 453 静默（:78942 门） --------------------

describe('BJ561-③：老人 37 / 骷髅商 453 死亡静默', () => {
  it('老人 37 死 → 零消息', () => {
    const log: Ev[] = [];
    const n = town('old_man');
    expect(n.vanillaId).toBe(37);
    n.hurt(9999, 0, 0, mkGame(new World(200, 200, 110, 'bj561-3a'), log), 0, 0, false, true);
    expect(n.dead).toBe(true);
    expect(chats(log).length).toBe(0);                            // ★M1 红
  });
  it('骷髅商 453 死 → 零消息（本仓 453=TownNPC 实体,排除位真消费）', () => {
    const log: Ev[] = [];
    const n = town('skeleton_merchant');
    expect(n.vanillaId).toBe(453);
    n.hurt(9999, 0, 0, mkGame(new World(200, 200, 110, 'bj561-3b'), log), 0, 0, false, true);
    expect(n.dead).toBe(true);
    expect(chats(log).length).toBe(0);                            // ★M1 红
  });
});

// ---- ④ 敌怪无消息（checkDead 敌怪支无广播面） ----------------------------

describe('BJ561-④：敌怪死亡零消息', () => {
  it('僵尸致死 → 零消息（死亡链其余面照走）', () => {
    const log: Ev[] = [];
    const spy = vi.spyOn(GorePiece, 'newGore').mockImplementation(() => null as never);
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    e.hurt(9999, 0, 0, mkGame(new World(200, 200, 110, 'bj561-4a'), log), 0, false, 1, true);
    expect(e.dead).toBe(true);
    expect(chats(log).length).toBe(0);                            // ★敌怪支无广播
    spy.mockRestore();
  });
});

// ---- ⑤ 触发位次：公告先于死亡音（:78973 < :78990）与受击飘字 -------------

describe('BJ561-⑤：触发位次', () => {
  it('公告位次先于死亡音（原版 广播:78973 → 音:78990）', () => {
    const log: Ev[] = [];
    const n = town('guide');
    n.hurt(9999, 0, 0, mkGame(new World(200, 200, 110, 'bj561-5a'), log), 0, 0, false, true);
    expect(n.dead).toBe(true);
    const ci = chatIdx(log), si = sfxIdx(log);
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(si).toBeGreaterThanOrEqual(0);
    expect(ci).toBeLessThan(si);                                  // ★M4 红：广播后置翻案
  });
  it('非致死受击 → 无消息（checkDead 首门 life>0 早退 :78846）', () => {
    const log: Ev[] = [];
    const n = town('guide');
    n.hurt(5, 0, 0, mkGame(new World(200, 200, 110, 'bj561-5b'), log), 0, 0, false, true);
    expect(n.dead).toBe(false);
    expect(chats(log).length).toBe(0);
  });
});
