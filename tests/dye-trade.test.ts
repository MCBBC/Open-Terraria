// 奇异植物换染料 + 三条掉落条件接真值测试：
//   Player.GetDyeTraderReward（Player.cs:55743-55779——档位池 14+8+4+4+2+1 均匀随机）
//   Main.NPCChatText_DyeTraderRarePlant（Main.cs:39411-39429——FindItem 3385-3388）
//   Conditions.MechdusaKill（:579-596）/ NamedNPC（:957-981）/
//   EyeOfCthulhuDefeatedAndNoAltarsInWorld（:1422-1437）
import { describe, it, expect, beforeAll } from 'vitest';
import { RNG } from '../src/core/rng';
import {
  dyeTraderRewardPool, rollDyeTraderReward, findExoticPlantSlot, EXOTIC_PLANT_ITEMS,
} from '../src/stats/DyeTrade';
import { evalCond, type NpcDropCtx } from '../src/drops/NpcDrops';
import { ITEM_BY_KEY } from '../src/data/items';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';
import { readFileSync } from 'fs';

// NamedNPC 本地化比对需要语言包（node 无 fetch——真实 zh-Hans 包注入，
// 同 pumpkin-frost.test.ts 模式）
beforeAll(() => {
  languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));
});

const BASE = [3560, 3028, 3041, 3040, 3025, 3190, 3027, 3026, 3554, 3553, 3555, 2872, 3534, 2871];
const HM = [3039, 3038, 3598, 3597, 3600, 3042, 3533, 3561];
const MECH = [2883, 2869, 2873, 2870];
const PLANT = [2878, 2879, 2884, 2885];
const MARTIAN = [2864, 3556];
const MOONLORD = [3024];

const gates = (over: Partial<Parameters<typeof dyeTraderRewardPool>[0]> = {}) => ({
  hardMode: false, downedMechBossAny: false, downedPlantBoss: false,
  downedMartians: false, downedMoonlord: false, ...over,
});

describe('GetDyeTraderReward 档位池（Player.cs:55746-55774 逐档）', () => {
  it('肉前 = 基础 14 支', () => {
    expect(dyeTraderRewardPool(gates())).toEqual(BASE);
  });

  it('hardMode +8（:55749-55757）', () => {
    expect(dyeTraderRewardPool(gates({ hardMode: true }))).toEqual([...BASE, ...HM]);
  });

  it('机械王任意 +4（downedMechBossAny :55758-55763）', () => {
    expect(dyeTraderRewardPool(gates({ hardMode: true, downedMechBossAny: true })))
      .toEqual([...BASE, ...HM, ...MECH]);
  });

  it('世纪之花 +4（downedPlantBoss :55764-55769）', () => {
    expect(dyeTraderRewardPool(gates({ hardMode: true, downedPlantBoss: true })))
      .toEqual([...BASE, ...HM, ...PLANT]);
  });

  it('火星暴乱 +2（downedMartians :55770-55773）', () => {
    expect(dyeTraderRewardPool(gates({ hardMode: true, downedMartians: true })))
      .toEqual([...BASE, ...HM, ...MARTIAN]);
  });

  it('月总 +1（downedMoonlord :55774-55777）', () => {
    expect(dyeTraderRewardPool(gates({ hardMode: true, downedMoonlord: true })))
      .toEqual([...BASE, ...HM, ...MOONLORD]);
  });

  it('全档 = 33 支（14+8+4+4+2+1）', () => {
    const all = dyeTraderRewardPool(gates({
      hardMode: true, downedMechBossAny: true, downedPlantBoss: true,
      downedMartians: true, downedMoonlord: true,
    }));
    expect(all).toEqual([...BASE, ...HM, ...MECH, ...PLANT, ...MARTIAN, ...MOONLORD]);
    expect(all.length).toBe(33);
  });

  it('掷奖 = 池内均匀随机 + stack=6（:55776-55778 item.stack=6）', () => {
    const pool = dyeTraderRewardPool(gates({ hardMode: true }));
    const rand = new RNG(20260820);
    for (let i = 0; i < 200; i++) {
      const r = rollDyeTraderReward(gates({ hardMode: true }), () => rand.next());
      expect(pool).toContain(r.id);
      expect(r.stack).toBe(6);
    }
    // 种子桩：同种子同流 → 同奖
    const rng1 = new RNG(1), rng1b = new RNG(1);
    const first = rollDyeTraderReward(gates({ hardMode: true }), () => rng1.next());
    expect(rollDyeTraderReward(gates({ hardMode: true }), () => rng1b.next())).toEqual(first);
  });
});

describe('奇异植物交出（Player.FindItem :55029-55039 + Main.cs:39416-39422）', () => {
  const plantIds = EXOTIC_PLANT_ITEMS.map((v) => ITEM_BY_KEY[`vi_${v}_StrangePlant${v - 3384}`]);

  it('四色奇异植物 3385-3388 已注册', () => {
    for (const id of plantIds) expect(id).toBeDefined();
  });

  it('FindItem 首个 stack>0 命中槽（0-57 扫描序）', () => {
    const slots = Array(58).fill(null);
    slots[10] = { id: plantIds[1], stack: 2 };
    slots[40] = { id: plantIds[3], stack: 5 };
    expect(findExoticPlantSlot(slots)).toBe(10);
  });

  it('stack=0 视同未持有（FindItem 门 inventory[i].stack > 0）', () => {
    const slots = Array(58).fill(null);
    slots[3] = { id: plantIds[0], stack: 0 };
    expect(findExoticPlantSlot(slots)).toBe(-1);
  });

  it('非奇异植物不命中', () => {
    const slots = Array(58).fill(null);
    slots[0] = { id: ITEM_BY_KEY['vi_5574_LuckyClover'], stack: 9 };
    expect(findExoticPlantSlot(slots)).toBe(-1);
  });
});

describe('掉落条件接真值（Conditions.cs 1:1）', () => {
  function ctxOf(over: Partial<NpcDropCtx> = {}): NpcDropCtx {
    return {
      rng: new RNG(1), netId: 2, type: 2,
      isExpert: false, isMaster: false, hardMode: false, crimson: false,
      flags: {}, x: 0, y: 0,
      worldSurfaceTile: 100, rockLayerTile: 150, underworldTileY: 400,
      maxTilesX: 4200, maxTilesY: 1200,
      lifeMax: 45, friendly: false, boss: false, damage: 10, value: 50,
      hp: 100, hpMax: 100, mana: 20, manaMax: 40,
      ...over,
    };
  }

  it('EyeOfCthulhuDefeatedAndNoAltarsInWorld（:1422-1437）：EoC 旗 && 无祭坛', () => {
    // 两侧皆缺 → false
    expect(evalCond('EyeOfCthulhuDefeatedAndNoAltarsInWorld', [], ctxOf())).toBe(false);
    // 仅 EoC 旗（普通世界有祭坛）→ false
    expect(evalCond('EyeOfCthulhuDefeatedAndNoAltarsInWorld', [], ctxOf({ flags: { downed_4: true } }))).toBe(false);
    // 仅无祭坛（skyblock 未打 EoC）→ false
    expect(evalCond('EyeOfCthulhuDefeatedAndNoAltarsInWorld', [], ctxOf({ noAltarsInWorld: true }))).toBe(false);
    // 双真 → true（僵尸 43 坠星 1/50 放行）
    expect(evalCond('EyeOfCthulhuDefeatedAndNoAltarsInWorld', [], ctxOf({
      flags: { downed_4: true }, noAltarsInWorld: true,
    }))).toBe(true);
    // downedEyeOfCthulhu 旧键同义
    expect(evalCond('EyeOfCthulhuDefeatedAndNoAltarsInWorld', [], ctxOf({
      flags: { downedEyeOfCthulhu: true } as Record<string, boolean>, noAltarsInWorld: true,
    }))).toBe(true);
  });

  it('MechdusaKill（:579-596）：mechdusa 世界 && 目标集其它成员全不在场', () => {
    const alive = (t: number) => t === 126;   // Spazmatillum 还活着
    // 非 mechdusa 世界恒 false
    expect(evalCond('MechdusaKill', [], ctxOf({ type: 127, anyNpcOfType: alive }))).toBe(false);
    // mechdusa 世界 + 另一眼在场 → false（先死的不掉 5382）
    expect(evalCond('MechdusaKill', [], ctxOf({
      type: 125, mechdusaWorld: true, anyNpcOfType: alive,
    }))).toBe(false);
    // 自身 type 不算"其它在场"（:589 t != info.npc.type）
    expect(evalCond('MechdusaKill', [], ctxOf({
      type: 126, mechdusaWorld: true, anyNpcOfType: alive,
    }))).toBe(true);
    // 全场无其它机械王 → true（最后倒下那只）
    expect(evalCond('MechdusaKill', [], ctxOf({
      type: 134, mechdusaWorld: true, anyNpcOfType: () => false,
    }))).toBe(true);
    // 非目标集 NPC（僵尸）在 mechdusa 世界 → 目标集无"其它"在场 → true（原版照抄）
    expect(evalCond('MechdusaKill', [], ctxOf({
      type: 2, mechdusaWorld: true, anyNpcOfType: () => false,
    }))).toBe(true);
  });

  it('NamedNPC（:957-981）：死亡 NPC 自身具名 == 参数名（本地化比对）', () => {
    // 无具名（Enemy）→ false
    expect(evalCond('NamedNPC', ['Andrew'], ctxOf())).toBe(false);
    // 具名 ≠ Andrew → false
    expect(evalCond('NamedNPC', ['Andrew'], ctxOf({ npcGivenName: Lang.text('GuideNames.Joe') }))).toBe(false);
    // 具名 == GuideNames.Andrew 本地化值 → true（zh 官译人名不译 = "Andrew"；
    // 比对目标经 Lang.text 拼回全键 GuideNames.Andrew 取值，非英文字面量硬比——
    // 他语言（如 ru/pl）名池有本地化译名，同一键取值即正确目标）
    const andrewName = Lang.text('GuideNames.Andrew');
    expect(andrewName).not.toBe('GuideNames.Andrew');   // 语言包已加载（键存在）
    expect(evalCond('NamedNPC', ['Andrew'], ctxOf({ npcGivenName: andrewName }))).toBe(true);
    // Whitney/Jim 键拼回
    expect(evalCond('NamedNPC', ['Whitney'], ctxOf({ npcGivenName: Lang.text('SteampunkerNames.Whitney') }))).toBe(true);
    expect(evalCond('NamedNPC', ['Jim'], ctxOf({ npcGivenName: Lang.text('PainterNames.Jim') }))).toBe(true);
    // 未知参数名 → 键缺失 → false
    expect(evalCond('NamedNPC', ['Nobody'], ctxOf({ npcGivenName: andrewName }))).toBe(false);
  });
});
