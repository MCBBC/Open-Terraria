// 玩家语音子系统单测（voiceVariant + 语音饰品 voiceOverride）。
// 原版锚（Terarria1458）：PlayHurtSound Player.cs:38867-39011 / PlayDeathSound
// :39013-39041 / DefaultToVoiceOverrideAccessory Item.cs:47786-47797 +
// 家族公式 7+type−5499 :43355-43363 / CycleVoiceStyle Main.cs:53180-53192 /
// 梳妆台音高滑杆 Main.cs:45429-45451 / 建号性别初始化 Player.cs:56393。
import { describe, it, expect } from 'vitest';
import {
  cycleVoiceVariant, deathVoicePlan, hurtVoicePlan, playDeathVoice, playHurtVoice,
  remapVoicePitch, voiceSlotOfItem, playerHurtFiles,
} from '../src/player/PlayerVoice';
import { defaultAppearance, randomAppearance, validateAppearance } from '../src/player/Appearance';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import type { GameHooks } from '../src/entities/types';

const MALE = ['Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2'];
const FEMALE = ['Female_Hit_0', 'Female_Hit_1', 'Female_Hit_2'];
const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

describe('voiceVariant 三档受击分派（PlayHurtSound 尾段 :38996-39009）', () => {
  it('case1 男声库（缺省按 skinVariant 性别推导,:56393 同式）', () => {
    const plan = hurtVoicePlan({ skinVariant: 0 });
    expect(plan.files).toEqual(MALE);
    expect(plan.vol).toBe(1);
    expect(plan.pitch).toBe(0);                       // pitchOffset 缺省 → Remap(0)=0 直传
    expect(hurtVoicePlan({ voiceVariant: 1 }).files).toEqual(MALE);
    // 裸数字兼容旧签名：女档 skinVariant → 女池
    expect(playerHurtFiles(4)).toEqual(FEMALE);
    expect(hurtVoicePlan(4).files).toEqual(FEMALE);
    expect(hurtVoicePlan(0).files).toEqual(MALE);
  });

  it('case2 女声库带 pitchOffset Remap(∓0.7)（:38996/:39001）', () => {
    const plan = hurtVoicePlan({ voiceVariant: 2, voicePitchOffset: 1 });
    expect(plan.files).toEqual(FEMALE);
    expect(plan.pitch).toBeCloseTo(0.7, 6);
    expect(hurtVoicePlan({ voiceVariant: 2, voicePitchOffset: -1 }).pitch).toBeCloseTo(-0.7, 6);
    expect(hurtVoicePlan({ voiceVariant: 2, voicePitchOffset: 0 }).pitch).toBe(0);
  });

  it('case3 Other → player_hit_default vol0.9（SoundID.cs:1138）', () => {
    const plan = hurtVoicePlan({ voiceVariant: 3 });
    expect(plan.files).toEqual(['player_hit_default']);
    expect(plan.vol).toBe(0.9);
    expect(plan.pitch).toBe(0);
  });

  it('remapVoicePitch = Utils.Remap(-1..1→∓0.7) clamped（:38996）', () => {
    expect(remapVoicePitch(-1)).toBeCloseTo(-0.7, 6);
    expect(remapVoicePitch(0)).toBe(0);
    expect(remapVoicePitch(0.5)).toBeCloseTo(0.35, 6);
    expect(remapVoicePitch(1)).toBeCloseTo(0.7, 6);
    expect(remapVoicePitch(42)).toBeCloseTo(0.7, 6);      // 越界钳位
    expect(remapVoicePitch(undefined)).toBe(0);           // 缺省安全
  });

  it('playHurtVoice 播放侧取一 + 显式 pitch 透传', () => {
    const played: Array<{ file: string; vol?: number; pitch?: number }> = [];
    const game = { playSfxWav: (file: string, vol?: number, _x?: number, _y?: number, pitch?: number) => {
      played.push({ file, vol, pitch });
    } };
    playHurtVoice(game as unknown as GameHooks, { voiceVariant: 3, voicePitchOffset: -1 });
    expect(played).toHaveLength(1);
    expect(played[0].file).toBe('player_hit_default');
    expect(played[0].vol).toBe(0.9);
    expect(played[0].pitch).toBeCloseTo(-0.7, 6);
  });
});

describe('voiceOverride 饰品层分派（PlayHurtSound switch :38879-38996）', () => {
  it('override 优先于 variant；case2=女池无显式 pitch（PITCH_CASE null 同义）', () => {
    const plan = hurtVoicePlan({ voiceOverride: 9, voiceVariant: 2 });
    expect(plan.files).toEqual(['player_hit_retro']);   // RetroHurt(:38925)
    expect(plan.vol).toBe(0.5);
    expect(plan.pitch).toBeUndefined();
    expect(hurtVoicePlan({ voiceOverride: 2 }).files).toEqual(FEMALE);
    expect(hurtVoicePlan({ voiceOverride: 2 }).pitch).toBeUndefined();
    expect(hurtVoicePlan({ voiceOverride: 20 }).files).toEqual(['player_hit_default']);   // Other(:38889)
  });

  it('case6 鸡 1/5 稀有变体独立掷数据（:38919-38925）', () => {
    const plan = hurtVoicePlan({ voiceOverride: 6 });
    expect(plan.files).toEqual(['player_hit_chicken']);
    expect(plan.vol).toBe(0.8);
    expect(plan.rare?.denom).toBe(5);
    expect(plan.rare?.files).toEqual(['player_hit_chicken_rare']);
    expect(plan.rare?.vol).toBe(0.5);
  });

  it('死亡分派（PlayDeathSound :39020-39040——无 variant 支,默认恒 sound5）', () => {
    expect(deathVoicePlan({ voiceOverride: 9 })).toEqual({ file: 'player_death_retro', vol: 0.5 });   // :39030
    expect(deathVoicePlan({ voiceOverride: 15 })).toEqual({ file: 'player_hit_balloon', vol: 0.8 });  // BalloonDeath(:39035)
    expect(deathVoicePlan({ voiceOverride: 5 })).toEqual({ file: 'Item_35', vol: 1 });                // BellHurt(:39025)
    // override 1/2 与无 override 同落 Player_Killed 库（:39022/:39037）
    expect(deathVoicePlan({ voiceOverride: 1 }).file).toBe('Player_Killed');
    expect(deathVoicePlan({ voiceVariant: 3 }).file).toBe('Player_Killed');   // ★Other 无死亡专属轨
    expect(deathVoicePlan(null).file).toBe('Player_Killed');
  });

  it('playDeathVoice 播放透传', () => {
    const played: Array<{ file: string; vol?: number }> = [];
    playDeathVoice({ playSfxWav: (f: string, v?: number) => played.push({ file: f, vol: v }) } as unknown as GameHooks,
      { voiceOverride: 9 });
    expect(played).toEqual([{ file: 'player_death_retro', vol: 0.5 }]);
  });
});

describe('语音饰品佩戴 → voiceSlot 生效（equipStats 聚合）', () => {
  const mk = () => new Player(0, 0, new Inventory());

  it('Item.voiceSlot 映射表（家族公式 7+type−5499 等）', () => {
    expect(voiceSlotOfItem(215)).toBe(19);    // 谁皮垫（Item.cs:4049-4050）
    expect(voiceSlotOfItem(5484)).toBe(5);    // 牛铃（:43217-43218）
    expect(voiceSlotOfItem(5485)).toBe(6);    // 鸡符咒（:43221-43222）
    expect(voiceSlotOfItem(5499)).toBe(7);    // 青蛙项带（公式支 :43355-43363）
    expect(voiceSlotOfItem(5501)).toBe(9);    // 旧伴坠锁 → Retro
    expect(voiceSlotOfItem(5509)).toBe(17);   // 吸血鬼吊坠
    expect(voiceSlotOfItem(5534)).toBe(18);   // 仙灵项圈（:43619）
    expect(voiceSlotOfItem(1)).toBe(0);       // 非语音件
  });

  it('功能槽 3 佩戴 → equipStats.voiceOverride 写入', () => {
    const p = mk();
    expect(p.equipStats.voiceOverride).toBe(0);
    p.inv.armor[3] = { id: iid(5501), stack: 1 };   // Old Companion Locket → Retro
    expect(p.equipStats.voiceOverride).toBe(9);
  });

  it('多件后槽覆盖前槽（原版逐槽直赋序）;社交槽 13 无 hide 门', () => {
    const p = mk();
    p.inv.armor[3] = { id: iid(5499), stack: 1 };   // Froggy → 7
    p.inv.armor[4] = { id: iid(5501), stack: 1 };   // Locket → 9 后写覆盖
    expect(p.equipStats.voiceOverride).toBe(9);
    p.inv.armor[4] = null;
    expect(p.equipStats.voiceOverride).toBe(7);
    // 社交槽（ApplyEquipVanity :14337-14341 无 !hide 门）
    p.inv.armor[13] = { id: iid(5534), stack: 1 };  // Fairy Choker → 18
    expect(p.equipStats.voiceOverride).toBe(18);
  });

  it('功能槽隐藏门（ApplyEquipFunctional :14485 !hideVisibleAccessory 才写）', () => {
    const p = mk();
    p.inv.armor[3] = { id: iid(5502), stack: 1 };   // Cat Chime → 10
    expect(p.equipStats.voiceOverride).toBe(10);
    p.hideVisibleAccessory[3] = true;
    expect(p.equipStats.voiceOverride).toBe(0);     // 隐藏的功能槽不生效
  });

  it('Player.voiceState 聚合 appearance + equipStats', () => {
    const p = mk();
    p.appearance = { ...defaultAppearance('T'), skinVariant: 4, voiceVariant: 3, voicePitchOffset: 0.5 };
    p.inv.armor[3] = { id: iid(5501), stack: 1 };
    expect(p.voiceState).toMatchObject({
      skinVariant: 4, voiceVariant: 3, voicePitchOffset: 0.5, voiceOverride: 9,
    });
    const played: string[] = [];
    playHurtVoice({ playSfxWav: (f: string) => { played.push(f); } } as unknown as GameHooks, p.voiceState);
    expect(played).toEqual(['player_hit_retro']);     // 饰品 override 层压过 variant 层
    p.inv.armor[3] = null;                            // 卸下 → 落 variant 层（Other）
    const played2: string[] = [];
    playHurtVoice({ playSfxWav: (f: string) => { played2.push(f); } } as unknown as GameHooks, p.voiceState);
    expect(played2).toEqual(['player_hit_default']);
  });
});

describe('梳妆台循环切换（Main.CycleVoiceStyle :53180-53192 + 预览音试听）', () => {
  it('男→女→其他→男 环绕;非法值归位 Male 后步进', () => {
    expect(cycleVoiceVariant(1)).toBe(2);
    expect(cycleVoiceVariant(2)).toBe(3);
    expect(cycleVoiceVariant(3)).toBe(1);
    expect(cycleVoiceVariant(0)).toBe(2);     // 原版 num 初值 0 不命中 → order[1]=2 同构
    expect(cycleVoiceVariant(undefined)).toBe(2);
  });

  it('每次切换的预览音 = 切换后变体的受击分派（dummy PlayHurtSound :45397-45407 同式）', () => {
    let v: number | undefined = 1;
    for (const [expectFiles, expectVol] of [
      [FEMALE, 1], [['player_hit_default'], 0.9], [MALE, 1],
    ] as Array<[string[], number]>) {
      v = cycleVoiceVariant(v);
      const plan = hurtVoicePlan({ voiceVariant: v });
      expect(plan.files).toEqual(expectFiles);
      expect(plan.vol).toBe(expectVol);
    }
  });

  it('音高滑杆 21 档量化（Round(z*20)/20 → Remap = 0.1 步进,Main.cs:45440-45451）', () => {
    for (let step = -10; step <= 10; step++) {
      const offset = step / 10;
      const plan = hurtVoicePlan({ voiceVariant: 1, voicePitchOffset: offset });
      expect(plan.pitch).toBeCloseTo(offset * 0.7, 6);
    }
  });
});

describe('appearance 持久化（存档跟随角色档;release<280 回退式 :56393）', () => {
  it('validateAppearance 保字段/越界回退性别推导/pitch 钳位', () => {
    const ok = validateAppearance({ ...defaultAppearance(), skinVariant: 4, voiceVariant: 3, voicePitchOffset: 0.5 });
    expect(ok.voiceVariant).toBe(3);
    expect(ok.voicePitchOffset).toBe(0.5);
    // 旧档缺字段 → 按性别推导（女档 → 2）;pitch 缺省 0
    const derived = validateAppearance({ ...defaultAppearance(), skinVariant: 4 });
    expect(derived.voiceVariant).toBe(2);
    expect(derived.voicePitchOffset).toBe(0);
    expect(validateAppearance({ ...defaultAppearance(), skinVariant: 0 }).voiceVariant).toBe(1);
    // 越界值（原版 clamp(1,4) 的死值 4 在本仓收紧为有效域 1..3）→ 推导
    expect(validateAppearance({ ...defaultAppearance(), skinVariant: 0, voiceVariant: 4 as 1 }).voiceVariant).toBe(1);
    expect(validateAppearance({ ...defaultAppearance(), voicePitchOffset: 9 }).voicePitchOffset).toBe(1);
    expect(validateAppearance({ ...defaultAppearance(), voicePitchOffset: NaN }).voicePitchOffset).toBe(0);
  });

  it('randomAppearance 随机掷后语音随性别落档', () => {
    for (let i = 0; i < 20; i++) {
      const a = validateAppearance(randomAppearance());
      expect([1, 2, 3]).toContain(a.voiceVariant);
      if (a.skinVariant === 4 || a.skinVariant === 5) expect(a.voiceVariant).not.toBe(1);
    }
  });
});
