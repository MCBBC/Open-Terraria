// BJ598 两件判别测试（BJ595 套装视效普查登记面 P4/F2/X3 落刀）。
//
// 件1:UpdateArmorLights 整缺落刀（Player.cs:31381-31555,Player.Update :25881 每 tick）
//   ——十八站逐站锁（head 9+body 5+legs 4,含 body190/legs130 写头位 quirk）+ 站位
//   锁 + 同槽同色 +0.5 聚焦档锁 + vortexStealthActive 早退门锁 + itemId→slot 列锁。
//   纯函数臂 = src/lighting/ArmorLights.ts computeArmorLights（tests 直测,与
//   Game.tickLighting 发射站同源）。
// 件2:受击音甲支落刀（PlayHurtSound :38984-38991 frost→Item27 / bone→legacy(3,2)
//   =NPCHit2）——hurtVoicePlan 甲支锁 + override 优先锁 + frost 先于 bone 锁 +
//   DST 世界门位次锁（甲支先于 dontStarve 门）+ 死亡侧不泄漏销案锚。
// 销案锚:件1 前态=整缺（census 逐链盘点 held/torch/potion/mod 光源四池零甲件站,
//   无重复落刀面）;件2 尘面 BJ595 已落（armorHurtDustType 同链同站——音面补齐侧
//   锁其谓词与尘站一致）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ARMOR_LIGHT_HEAD, ARMOR_LIGHT_BODY, ARMOR_LIGHT_LEGS, computeArmorLights,
} from '../src/lighting/ArmorLights';
import { statOfInternal } from '../src/data/vanillaItemStats';
import {
  hurtVoicePlan, playHurtVoice, deathVoicePlan, type VoiceState,
} from '../src/player/PlayerVoice';
import type { GameHooks } from '../src/entities/types';
import { armorHurtDustType } from '../src/entities/Player';

const GAME = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const VOICE = readFileSync(new URL('../src/player/PlayerVoice.ts', import.meta.url), 'utf8');

// 原版玩家盒 20×42（Player.cs:55083-55084;本仓 Player.ts w=20 h=42 同值）
const W = 20, H = 42;

// ===================== 件1:十八站逐站锁（Player.cs:31390-31476 表值） =====================

describe('BJ598 件1:head 九站逐站锁（slot→RGB/站位）', () => {
  const HEAD_STATIONS: Array<[number, string, [number, number, number]]> = [
    [11, '88 矿盔 MiningHelmet', [0.92, 0.8, 0.65]],
    [216, '4008 超亮盔 UltraBrightHelmet', [0.7, 0.95, 0.82]],
    [285, '5588 升级矿盔 UpgradedMiningHead', [1, 0.88, 0.73]],
    [169, '2757 星璇盔 VortexHelmet', [0, 0.36, 0.4]],
    [170, '2760 星云盔 NebulaHelmet', [0.4, 0.16, 0.36]],
    [171, '2763 日耀盔 SolarFlareHelmet', [0.5, 0.25, 0.05]],
    [189, '3381 星尘盔 StardustHelmet', [0.9, 0.9, 0.7]],
    [178, '2862 HiTek墨镜 HiTekSunglasses', [0.1, 0.2, 0.3]],
    [211, '3874 学徒暗盔 ApprenticeDark', [0.2, 0.4, 0.8]],
  ];
  for (const [slot, name, rgb] of HEAD_STATIONS) {
    it(`head ${slot}（${name}）→ 头位单站 ${rgb.join('/')}`, () => {
      const out = computeArmorLights(slot, -1, -1, false, W, H, 1);
      expect(out).toHaveLength(1);
      expect(out[0]!.r).toBe(rgb[0]);
      expect(out[0]!.g).toBe(rgb[1]);
      expect(out[0]!.b).toBe(rgb[2]);
      expect(out[0]!.ox).toBe(W / 2 + 8);      // dir=1:10+8
      expect(out[0]!.oy).toBe(2);
    });
  }
  it('itemId→headSlot 列锁（statOfInternal 表）', () => {
    expect(statOfInternal(88)?.hs).toBe(11);
    expect(statOfInternal(4008)?.hs).toBe(216);
    expect(statOfInternal(5588)?.hs).toBe(285);
    expect(statOfInternal(2757)?.hs).toBe(169);
    expect(statOfInternal(2760)?.hs).toBe(170);
    expect(statOfInternal(2763)?.hs).toBe(171);
    expect(statOfInternal(3381)?.hs).toBe(189);
    expect(statOfInternal(2862)?.hs).toBe(178);
    expect(statOfInternal(3874)?.hs).toBe(211);
  });
});

describe('BJ598 件1:body/legs 九站逐站锁（含写头位 quirk）', () => {
  const BODY_STATIONS: Array<[number, string, [number, number, number]]> = [
    [175, '2758 星璇胸', [0, 0.36, 0.4]],
    [176, '2761 星云胸', [0.4, 0.16, 0.36]],
    [177, '2764 日耀胸', [0.5, 0.25, 0.05]],
    [205, '3875 学徒暗甲', [0.2, 0.4, 0.8]],
  ];
  for (const [slot, name, rgb] of BODY_STATIONS) {
    it(`body ${slot}（${name}）→ 身位单站 ${rgb.join('/')}`, () => {
      const out = computeArmorLights(-1, slot, -1, false, W, H, 1);
      expect(out).toHaveLength(1);
      expect(out[0]!.r).toBe(rgb[0]);
      expect(out[0]!.g).toBe(rgb[1]);
      expect(out[0]!.b).toBe(rgb[2]);
      expect(out[0]!.ox).toBe(W / 2 + 8);      // 恒 +8 无方向（:31506 原版 quirk）
      expect(out[0]!.oy).toBe(H / 2);
    });
  }
  it('body 190（3382 星尘胸）写头位 quirk（:31445-31449 num/num2/num3 赋值面）', () => {
    const out = computeArmorLights(-1, 190, -1, false, W, H, 1);
    expect(out).toHaveLength(1);
    expect(out[0]!.r).toBe(0.9);
    expect(out[0]!.g).toBe(0.9);
    expect(out[0]!.b).toBe(0.7);
    expect(out[0]!.oy).toBe(2);                // 头位 oy,非身位 21
  });
  const LEGS_STATIONS: Array<[number, string, [number, number, number]]> = [
    [110, '2759 星璇腿', [0, 0.36, 0.4]],
    [111, '2762 星云腿', [0.4, 0.16, 0.36]],
    [112, '2765 日耀腿', [0.5, 0.25, 0.05]],
  ];
  for (const [slot, name, rgb] of LEGS_STATIONS) {
    it(`legs ${slot}（${name}）→ 腿位单站 ${rgb.join('/')}`, () => {
      const out = computeArmorLights(-1, -1, slot, false, W, H, 1);
      expect(out).toHaveLength(1);
      expect(out[0]!.r).toBe(rgb[0]);
      expect(out[0]!.g).toBe(rgb[1]);
      expect(out[0]!.b).toBe(rgb[2]);
      expect(out[0]!.ox).toBe(W / 2 + 8);
      expect(out[0]!.oy).toBe(H * 0.75);       // 31.5
    });
  }
  it('legs 130（3383 星尘腿）写头位 quirk（:31470-31474）', () => {
    const out = computeArmorLights(-1, -1, 130, false, W, H, 1);
    expect(out).toHaveLength(1);
    expect(out[0]!.r).toBe(0.9);
    expect(out[0]!.oy).toBe(2);                // 头位,非腿位 31.5
  });
  it('itemId→body/legSlot 列锁', () => {
    expect(statOfInternal(2758)?.bs).toBe(175);
    expect(statOfInternal(2761)?.bs).toBe(176);
    expect(statOfInternal(2764)?.bs).toBe(177);
    expect(statOfInternal(3382)?.bs).toBe(190);
    expect(statOfInternal(3875)?.bs).toBe(205);
    expect(statOfInternal(2759)?.ls).toBe(110);
    expect(statOfInternal(2762)?.ls).toBe(111);
    expect(statOfInternal(2765)?.ls).toBe(112);
    expect(statOfInternal(3383)?.ls).toBe(130);
  });
});

describe('BJ598 件1:早退门/无甲/方向', () => {
  it('vortexStealthActive 早退门（:31384-31386）——矿盔与满月辉套全灭', () => {
    expect(computeArmorLights(11, -1, -1, true, W, H, 1)).toHaveLength(0);
    expect(computeArmorLights(169, 175, 110, true, W, H, 1)).toHaveLength(0);
    expect(computeArmorLights(189, 190, 130, true, W, H, 1)).toHaveLength(0);
  });
  it('无甲 → 零站（发射站零 addLight=不脏化光照）', () => {
    expect(computeArmorLights(-1, -1, -1, false, W, H, 1)).toHaveLength(0);
  });
  it('direction=-1:头/腿 ox=2,身位恒 18（:31506 无方向 quirk）', () => {
    const out = computeArmorLights(11, 175, 110, false, W, H, -1);
    expect(out).toHaveLength(3);
    expect(out[0]!.ox).toBe(W / 2 - 8);
    expect(out[1]!.ox).toBe(W / 2 + 8);
    expect(out[2]!.ox).toBe(W / 2 - 8);
  });
});

describe('BJ598 件1:同槽同色聚焦档（+0.5 可叠 ×2）', () => {
  it('满星璇套 169+175+110 → 三站全 ×2（:31483-31492 双等值叠加）', () => {
    const out = computeArmorLights(169, 175, 110, false, W, H, 1);
    expect(out).toHaveLength(3);
    expect(out[0]!.r).toBe(0);
    expect(out[0]!.g).toBeCloseTo(0.36 * 2, 10);
    expect(out[0]!.b).toBeCloseTo(0.4 * 2, 10);
    expect(out[1]!.g).toBeCloseTo(0.36 * 2, 10);
    expect(out[2]!.g).toBeCloseTo(0.36 * 2, 10);
  });
  it('星璇 head+body 双件 → ×1.5（单等值档）', () => {
    const out = computeArmorLights(169, 175, -1, false, W, H, 1);
    expect(out).toHaveLength(2);
    expect(out[0]!.g).toBeCloseTo(0.36 * 1.5, 10);
    expect(out[1]!.g).toBeCloseTo(0.36 * 1.5, 10);
  });
  it('满星尘套 189+190+130 → 单头位站 ×1（写头位不入等值比较,原版 quirk）', () => {
    const out = computeArmorLights(189, 190, 130, false, W, H, 1);
    expect(out).toHaveLength(1);
    expect(out[0]!.r).toBe(0.9);
    expect(out[0]!.oy).toBe(2);
  });
  it('满学徒套 211+205 → 头/身双站 ×1.5（legs 零站无第二等值档）', () => {
    const out = computeArmorLights(211, 205, -1, false, W, H, 1);
    expect(out).toHaveLength(2);
    expect(out[0]!.r).toBeCloseTo(0.2 * 1.5, 10);
    expect(out[1]!.r).toBeCloseTo(0.2 * 1.5, 10);
    expect(out[1]!.oy).toBe(H / 2);
  });
});

// ===================== 件1:发射站接线锁（Game.tickLighting 光照采样面） =====================

describe('BJ598 件1:发射站接线锁', () => {
  it('tickLighting 恰一个 computeArmorLights 发射站（防重复落刀/防移除）', () => {
    expect((GAME.match(/computeArmorLights\(/g) ?? []).length).toBe(1);
    expect(GAME.includes("from '../lighting/ArmorLights'")).toBe(true);
    expect(GAME.includes('player.vortexStealthActive')).toBe(true);
  });
  it('销案锚:前态整缺——既有望远镜四池（held/torch/potion/mod）均非甲件载体,本表为唯一甲光链', () => {
    // 矿盔 88 不在手持光源表（GLOWSTICK_LIGHT 键族;★子串污染防:探针限表体切片,
    // 不裸扫全文——PROJ_LIGHT_MUL 弹表 88: 是弹型非物品）
    const glowAt = GAME.indexOf('GLOWSTICK_LIGHT');
    expect(glowAt).toBeGreaterThan(0);
    const glowBody = GAME.slice(glowAt, glowAt + 400);
    expect(glowBody).toContain('282:');
    expect(glowBody.includes('88:')).toBe(false);
    // 禁戒套常驻光（G1 isomorphic,ArmorSetBonuses.cs:61-65→Player.addLightAt 支）
    // =另一原版函数,不属 UpdateArmorLights——本刀不触碰
    expect(GAME.includes('addLightAt')).toBe(true);
  });
});

// ===================== 件2:受击音甲支锁（PlayHurtSound :38984-38991） =====================

describe('BJ598 件2:hurtVoicePlan 甲支锁', () => {
  it('frostArmor → Item_27/vol1/source armor（:38984-38986）', () => {
    const plan = hurtVoicePlan({ frostArmor: true });
    expect(plan.files).toEqual(['Item_27']);
    expect(plan.vol).toBe(1);
    expect(plan.source).toBe('armor');
  });
  it('boneArmor → NPC_Hit_2/vol1/source armor（:38989-38991 legacy(3,style2)）', () => {
    const plan = hurtVoicePlan({ boneArmor: true });
    expect(plan.files).toEqual(['NPC_Hit_2']);
    expect(plan.vol).toBe(1);
    expect(plan.source).toBe('armor');
  });
  it('voiceOverride 优先于甲支（原版 override switch 先返,如 9 retro）', () => {
    const plan = hurtVoicePlan({ voiceOverride: 9, frostArmor: true });
    expect(plan.files).toEqual(['player_hit_retro']);
    expect(plan.source).toBe('override');
  });
  it('双旗同帧按原版序 frost 先于 bone（两支互斥 return 序）', () => {
    const plan = hurtVoicePlan({ frostArmor: true, boneArmor: true });
    expect(plan.files).toEqual(['Item_27']);
  });
  it('死亡侧不泄漏甲音（PlayDeathSound 无甲支,deathVoicePlan 忽略甲旗）', () => {
    expect(deathVoicePlan({ frostArmor: true, boneArmor: true })).toEqual({ file: 'Player_Killed', vol: 1 });
  });
  it('variant 尾段不受甲旗污染（无甲旗=原 male 池+pitch）', () => {
    const plan = hurtVoicePlan({});
    expect(plan.files).toEqual(['Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2']);
    expect(plan.pitch).toBeDefined();
    expect(plan.source).toBeUndefined();
  });
});

function mockGame(seedFlags?: Record<string, boolean>): { game: GameHooks; played: Array<{ file: string; vol: number }> } {
  const played: Array<{ file: string; vol: number }> = [];
  const game = {
    world: { seedFlags },
    playSfxWav: (file: string, vol?: number) => { played.push({ file, vol: vol ?? 1 }); },
  };
  return { game: game as unknown as GameHooks, played };
}

describe('BJ598 件2:playHurtVoice 播放位次锁（DST 世界门序）', () => {
  it('常态世界 frost → Item_27 直播', () => {
    const { game, played } = mockGame();
    playHurtVoice(game, { frostArmor: true });
    expect(played).toEqual([{ file: 'Item_27', vol: 1 }]);
  });
  it('DST 世界（dontStarve）frost 仍播甲音——甲支先于 dontStarve 门（:38984 < :38993）', () => {
    const { game, played } = mockGame({ theConstant: true });
    playHurtVoice(game, { frostArmor: true });
    expect(played).toEqual([{ file: 'Item_27', vol: 1 }]);
  });
  it('DST 世界无甲旗 → DST 语音（既有门不回归）', () => {
    const { game, played } = mockGame({ theConstant: true });
    playHurtVoice(game, { skinVariant: 0 });
    expect(played[0]!.file).toMatch(/^dst_(male|female)_hit_\d$/);
  });
  it('DST 世界 remix 排除仍生效（!remix 门,无甲旗）', () => {
    const { game, played } = mockGame({ theConstant: true, remix: true });
    playHurtVoice(game, { skinVariant: 0 });
    expect(played[0]!.file).toMatch(/^Player_Hit_\d$/);
  });
  it('DST 门序源锁（plan.source 排除位次在门条件内）', () => {
    expect(VOICE.includes("plan.source !== 'armor' && sfH.theConstant")).toBe(true);
  });
});

// ===================== 件2:发射站接线锁 + 尘面销案锚 =====================

describe('BJ598 件2:发射站接线锁（与 BJ595 尘站同站同谓词）', () => {
  it('damagePlayer 存活支音旗与尘爆站同谓词（eq.frostBurn/p.boneArmor）', () => {
    expect(GAME.includes('frostArmor: eq.frostBurn === true')).toBe(true);
    expect(GAME.includes('boneArmor: p.boneArmor')).toBe(true);
    // 尘面已落（BJ595 F1/X1）——同站谓词一致性销案
    expect(GAME.includes('emitPlayerHurtDust(this.vanillaDust, p, ok, p.maxHp,')).toBe(true);
    expect(GAME.includes('p.buffs.has(BuffType.Stoned), eq.frostBurn === true, p.boneArmor')).toBe(true);
    // 尘选型销案锚（Player.cs:38838-38848 → armorHurtDustType）
    expect(armorHurtDustType(false, true, false)).toBe(135);
    expect(armorHurtDustType(false, false, true)).toBe(26);
    expect(armorHurtDustType(true, false, false)).toBe(1);
  });
  it('VoiceState 甲旗字段在场（聚合面字段,非散参）', () => {
    const st: VoiceState = { frostArmor: true, boneArmor: false };
    expect(st.frostArmor).toBe(true);
  });
});
