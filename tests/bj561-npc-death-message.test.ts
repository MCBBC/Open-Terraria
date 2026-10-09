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
//    Taunt1 :78856-78859 凋侃行,非死亡公告面;本仓该行已在 Game.ts:45087-45089 接
//    ——★BJ-C7/R10-F5 注漂移修正：旧注 44765 系 DrawInterface_35_YouDied 死亡 UI
//    画面位,非 Taunt1 接线位）。
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
import { Tombstone } from '../src/entities/Tombstone';
import { LuckState } from '../src/stats/Luck';
import { Achievements } from '../src/core/Achievements';
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

const chats = (log: Ev562[]) => log.filter((e): e is ['chat', string, number, number, number] => e[0] === 'chat');
const sfxIdx = (log: Ev562[]) => log.findIndex((e) => e[0] === 'sfx');
const chatIdx = (log: Ev562[]) => log.findIndex((e) => e[0] === 'chat');

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

// ============================================================================
// ★BJ562（2026-10-09）城镇死亡墓碑 + NPCLuck 两实装（BJ561 登记债清偿）。
//  判例锚（1457 亲读定谳）：
//  · NPCLuck（NPC.cs:82466-82490,checkDead townNPC 支 :78944-78946
//    `if (Main.netMode != 2)` 调用=单机/客户端态,专写 Main.player[Main.myPlayer]）：
//      向导 22 死亡延瓢虫好运——门 ladyBugLuckTimeLeft ≥ 0（负运不抵消）,
//      量 = ladyBugGoodLuckTime/3 = 43200/3 = 14400t,取更优（num>timeLeft 才覆写）;
//      其余城镇死亡缓瓢虫厄运——护士 54 排除（:82481）,量 = -10800/3 = -3600t,
//      仅更坏才覆写（num2<timeLeft）;城镇宠物不豁免（:78942 门只排 37/453）。
//  · 墓碑（触发门 :78957-78972 + DropTombstoneTownNPC :79082-79108）：
//      宠物便支（369/663/IsTownPet,num6=36 同支）flag=false 不落;
//      全员 hardcore 门 = 遍历存活玩家,任一 active 玩家 difficulty!=2 → 旗假
//      （:78963-78969;死亡玩家仍计——循环无 dead 门;空活人集旗保持真=落,原版同相）;
//      款式不看身家：商人 17/税收官 441 恒金 527+rand(5)（:79097-79102）,
//      余 Next(6) 单掷 0→43 余 200+roll（:79092-79096）;
//      damage/kb 恒 0（NewProjectile Projectile.cs:10920-10921 参数覆写在
//      SetDefaults 之后——玩家面 FTW 70/10 支不适用,纯物理恒）;
//      抛向 = Next(2) ±0.1 抛币（:79086-79090,玩家面 hitDirection 另支）;
//      miscText = 死亡文本（:79107,无日期——玩家面 deathText+"\n"+D :39455-39461）。
//  · GRAVE_MISTAKE 成就 36（AchievementInitializer.cs:399
//    ProgressionEventCondition.Create(36)）触发条件两支（本测钉完成面）：
//      ①Player.OnKillNPC（Player.cs:20623-20636）——墓碑弹杀城镇 NPC
//        （Projectile.cs:13702-13706 DidNPCDie → OnKillNPC,IsAGravestone &&
//        townNPC）;本仓 Tombstone.applyDamage hitTownNpcs onKill 已接
//        （tests/tombstone-grave-mistake.test.ts 全链在守）;
//      ②Player.KillMe（Player.cs:39135-39137）——他人玩家（whoAmI!=myPlayer）
//        同队被墓碑弹杀（联机 PvP 面,本仓无该模拟域=备案）。
//  变异证红契约（≥4 发→恰红,逐字节还原+sha256 对拍）：
//   M1 向导量 43200/3→43200 → A1 红
//   M2 护士排除删（type!=54） → A5 红
//   M3 hardcore 门 !=2 翻 ===2 → B1 红（硬核不落）+B2 红（软核误落）
//   M4 商人/税收官恒金门删 → B1 金墓碑断言红（40 抽落回 43/201-205）
//   M5 碑文接日期（deathText+"\n"+D 玩家面串味） → B4 碑文断言红
//   M6 墓碑出射口调用删 → B1 红
// ============================================================================

type Ev562 = Ev | ['tomb', Tombstone];

/** BJ562 桩：luckState/appearance/candidatePlayers/spawnTownNpcTombstone 全挂
 *  （BJ561 mkGame 不动——①-⑤ 回归口径零改）。candidatePlayers 含本地玩家
 *  （原版 Main.player[0..254] 循环的槽 0 对应物——空集不翻 hardcore 旗=原版同相） */
function mkGame562(w: World, log: Ev562[], opts?: {
  difficulty?: number; dead?: boolean;
}): GameHooks {
  const luck = new LuckState();
  (log as unknown as { __luck?: LuckState }).__luck = luck;
  const player = {
    dead: opts?.dead ?? false, hp: 100, maxHp: 100, x: -9999, y: -9999, w: 0, h: 0,
    addDPS: () => {},
    luckState: luck,
    appearance: { difficulty: opts?.difficulty ?? 0 },
  };
  return {
    world: w,
    player,
    addDamageNumber: () => {}, spawnParticles: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, spawnDrop: () => null, onEnemyKilled: () => {},
    spawnDust: () => null, playSfxFile: () => {}, recLog: () => {},
    critters: () => [], enemies: () => [], npcs: () => [],
    chatBroadcast: (text: string, r: number, g: number, b: number) => { log.push(['chat', text, r, g, b]); },
    spawnTownNpcTombstone: (t: Tombstone) => { log.push(['tomb', t]); },
    candidatePlayers: () => [player],
  } as unknown as GameHooks;
}

const tombs = (log: Ev562[]) => log.filter((e): e is ['tomb', Tombstone] => e[0] === 'tomb')
  .map((e) => e[1]);
const luckOf = (log: Ev562[]): LuckState =>
  (log as unknown as { __luck: LuckState }).__luck;

// ---- A. NPCLuck（Luck.ts LuckState.npcLuck 钉值面） ------------------------

describe('BJ562-A：NPCLuck 钉值（NPC.cs:82466-82490）', () => {
  it('A1 向导 22 死亡延好运 43200/3=14400（M1 红）', () => {
    const l = new LuckState();
    l.npcLuck(22, true, false);
    expect(l.ladyBugLuckTimeLeft).toBe(14400);
  });
  it('A2 向导死亡门 ladyBugLuckTimeLeft>=0：负运不抵消（:82470）', () => {
    const l = new LuckState();
    l.ladyBugLuckTimeLeft = -100;
    l.npcLuck(22, true, false);
    expect(l.ladyBugLuckTimeLeft).toBe(-100);
  });
  it('A3 向导量取更优：已持 20000 > 14400 不覆写（:82475）', () => {
    const l = new LuckState();
    l.ladyBugLuckTimeLeft = 20000;
    l.npcLuck(22, true, false);
    expect(l.ladyBugLuckTimeLeft).toBe(20000);
  });
  it('A4 商人 17 死亡缓厄运 -10800/3=-3600（:82483）', () => {
    const l = new LuckState();
    l.npcLuck(17, true, false);
    expect(l.ladyBugLuckTimeLeft).toBe(-3600);
  });
  it('A5 护士 54 排除（:82481 type!=54）——死亡不动运（M2 红）', () => {
    const l = new LuckState();
    l.npcLuck(54, true, false);
    expect(l.ladyBugLuckTimeLeft).toBe(0);
  });
  it('A6 厄运仅更坏才覆写：已持 -7200 不抬升回 -3600（:82485）', () => {
    const l = new LuckState();
    l.ladyBugLuckTimeLeft = -7200;
    l.npcLuck(17, true, false);
    expect(l.ladyBugLuckTimeLeft).toBe(-7200);
  });
  it('A7 玩家死亡态整支不接（playerDead 门）', () => {
    const l = new LuckState();
    l.npcLuck(22, true, true);
    expect(l.ladyBugLuckTimeLeft).toBe(0);
    l.npcLuck(17, true, true);
    expect(l.ladyBugLuckTimeLeft).toBe(0);
  });
  it('A8 链装：TownNPC 向导死亡（活人）→ luckState=14400;商人死亡 → -3600', () => {
    const log1: Ev562[] = [];
    const g = new TownNPC('guide', 100 * 16, 90 * 16);
    g.hurt(9999, 0, 0, mkGame562(new World(200, 200, 110, 'bj562-a8a'), log1), 0, 0, false, true);
    expect(g.dead).toBe(true);
    expect(luckOf(log1).ladyBugLuckTimeLeft).toBe(14400);
    const log2: Ev562[] = [];
    const m = new TownNPC('merchant', 100 * 16, 90 * 16);
    m.hurt(9999, 0, 0, mkGame562(new World(200, 200, 110, 'bj562-a8b'), log2), 0, 0, false, true);
    expect(luckOf(log2).ladyBugLuckTimeLeft).toBe(-3600);
  });
});

// ---- B. 城镇死亡墓碑（触发门 :78957-78972 + DropTombstoneTownNPC） ---------

describe('BJ562-B：城镇死亡墓碑（DropTombstoneTownNPC NPC.cs:79082-79108）', () => {
  it('B1 商人 17 死亡（hardcore）→ 恒金墓碑 527-531、纯物理 dmg0、碑文=公告文本、抛速域', () => {
    const log: Ev562[] = [];
    const n = town('merchant');
    n.hurt(9999, 0, 0, mkGame562(new World(200, 200, 110, 'bj562-b1'), log, { difficulty: 2 }), 0, 0, false, true);
    const ts = tombs(log);
    expect(ts.length).toBe(1);                                   // ★M6 红
    const t = ts[0];
    for (let i = 0; i < 40; i++) {                               // 款式恒金（M4 红）
      const s = new Tombstone(n.cx, n.cy, 0, 'x', 0, false, 17);
      expect(s.projId).toBeGreaterThanOrEqual(527);
      expect(s.projId).toBeLessThanOrEqual(531);
    }
    expect(t.dmg).toBe(0);                                       // :79103 NewProjectile damage=0 恒
    expect(t.knockBack).toBe(0);
    expect(t.epitaph.includes('{0}')).toBe(false);
    expect(t.epitaph).toBe(chats(log)[0][1]);                    // 碑文=死亡文本单源
    expect(t.epitaph.includes('\n')).toBe(false);                // 无日期（M5 红）
    expect(t.x + t.w / 2).toBe(n.cx);                            // 中心锚（:79103-79104）
    // ★BJ587 定谳（2026-10-09）：原下臂 `|vx| >= 2-0.3` 摆幅容差算错——城镇 vx =
    // int(10..29)×±0.1 + num（|num|∈[2,3.5] 游走出环值），对号反相抵消 |vx| 可低至
    // 0（num=-2.9,flipInt=+2.9）而高至 3.5+2.9=6.4；单抽断言实测 10/15 连跑翻车
    // （预 BJ587 态 12/15 同率 = BJ562 落地即有 flaky，与 BJ587 两刀零涉——城镇分支
    // 字节未动）。改真包络钉；结构端点（29/-21 逐值）由 tests/bj587-tombstone-
    // bounds-ftw.test.ts「BJ562 城镇面出膛界零回归」定序桩确定性承载。
    expect(Math.abs(t.vx)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.abs(t.vx)).toBeLessThanOrEqual(3.5 + 2.9 + 1e-9);
    expect(t.vy).toBeGreaterThanOrEqual(-4 - 1e-9);              // Next(-40,-20)*0.1
    expect(t.vy).toBeLessThanOrEqual(-2.1 + 1e-9);
  });
  it('B2 软核 0 → 不落（:78963-78969 任一非 hardcore 旗假;M3 红）', () => {
    const log: Ev562[] = [];
    town('merchant').hurt(9999, 0, 0,
      mkGame562(new World(200, 200, 110, 'bj562-b2'), log, { difficulty: 0 }), 0, 0, false, true);
    expect(tombs(log).length).toBe(0);
    expect(chats(log).length).toBe(1);                           // 公告照发（旗只门墓碑）
  });
  it('B3 旅程 3 → 不落（difficulty!=2 同门——原版仅字面 hardcore 2）', () => {
    const log: Ev562[] = [];
    town('guide').hurt(9999, 0, 0,
      mkGame562(new World(200, 200, 110, 'bj562-b3'), log, { difficulty: 3 }), 0, 0, false, true);
    expect(tombs(log).length).toBe(0);
  });
  it('B4 非商人档掷位：向导 40 抽全部落 43/201-205 域（Next(6) 单掷 0→43 余 200+roll）', () => {
    const log: Ev562[] = [];
    const g = new TownNPC('guide', 100 * 16, 90 * 16);
    g.hurt(9999, 0, 0, mkGame562(new World(200, 200, 110, 'bj562-b4'), log, { difficulty: 2 }), 0, 0, false, true);
    expect(tombs(log).length).toBe(1);
    for (let i = 0; i < 40; i++) {
      const s = new Tombstone(0, 0, 0, 'x', 0, false, 22);
      const id = s.projId;
      expect(id === 43 || (id >= 201 && id <= 205)).toBe(true);
      expect(id).not.toBe(200);                                  // 原版下限 201（roll!=0 支）
    }
  });
  it('B5 税收官 441 → 恒金（与商人同支 :79097）', () => {
    for (let i = 0; i < 20; i++) {
      const s = new Tombstone(0, 0, 0, 'x', 0, false, 441);
      expect(s.projId).toBeGreaterThanOrEqual(527);
      expect(s.projId).toBeLessThanOrEqual(531);
    }
  });
  it('B6 渔夫 369 宠物便支 → 不落（:78951-78955 同支 flag=false）', () => {
    const log: Ev562[] = [];
    town('angler').hurt(9999, 0, 0,
      mkGame562(new World(200, 200, 110, 'bj562-b6'), log, { difficulty: 2 }), 0, 0, false, true);
    expect(tombs(log).length).toBe(0);
    expect(chats(log).length).toBe(1);                           // 「已离开」公告照发
  });
  it('B7 老人 37 整支排除（:78942）→ 无碑无运（NPCLuck 亦不调）', () => {
    const log: Ev562[] = [];
    const n = town('old_man');
    n.hurt(9999, 0, 0, mkGame562(new World(200, 200, 110, 'bj562-b7'), log, { difficulty: 2 }), 0, 0, false, true);
    expect(tombs(log).length).toBe(0);
    expect(luckOf(log).ladyBugLuckTimeLeft).toBe(0);
  });
});

// ---- C. GRAVE_MISTAKE 成就 36（完成面：progressionEvent 36 → GRAVE_MISTAKE） --

describe('BJ562-C：GRAVE_MISTAKE 成就 36（AchievementInitializer.cs:399 prog(36)）', () => {
  it('C1 notifyProgressionEvent(36) 完成 GRAVE_MISTAKE;35/37 不串（FEAR_THE_SUN/SPICY_LICKS）', () => {
    const a = new Achievements(null);
    a.notifyProgressionEvent(35);
    expect(a.isCompleted('GRAVE_MISTAKE')).toBe(false);
    a.notifyProgressionEvent(36);
    expect(a.isCompleted('GRAVE_MISTAKE')).toBe(true);           // 本仓接面=城镇杀面①
    expect(a.isCompleted('SPICY_LICKS')).toBe(false);
  });
  it('C2 城镇自身死亡链无 36 串发：落碑≠杀镇民——36 只出自墓碑弹杀伤面（Tombstone.applyDamage→hitTownNpcs onKill,tests/tombstone-grave-mistake.test.ts 全链在守）', () => {
    const log: Ev562[] = [];
    town('guide').hurt(9999, 0, 0,
      mkGame562(new World(200, 200, 110, 'bj562-c2'), log, { difficulty: 2 }), 0, 0, false, true);
    expect(tombs(log).length).toBe(1);
  });
});
