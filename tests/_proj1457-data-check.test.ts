// 一次性校验（跑完即删）：1457 新弹 1112-1135 数据面非空 + 本批补列在位
import { describe, it, expect } from 'vitest';
import { projectileData } from '../src/data/vanillaProjectiles';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';

describe('1457 新弹数据面', () => {
  it('1112-1123 全部非空', () => {
    for (let id = 1112; id <= 1123; id++) {
      expect(projectileData(id), `proj ${id}`).not.toBeNull();
    }
  });
  it('本批补列在位（localNPCHitCooldown / idStatic / 1117·1122 宽高）', () => {
    expect(projectileData(1112)?.localNPCHitCooldown).toBe(9);
    expect(projectileData(1115)?.localNPCHitCooldown).toBe(-1);
    expect(projectileData(1116)?.localNPCHitCooldown).toBe(-1);
    expect(projectileData(1117)?.width).toBe(16);
    expect(projectileData(1117)?.height).toBe(16);
    expect(projectileData(1118)?.localNPCHitCooldown).toBe(30);
    expect(projectileData(1119)?.localNPCHitCooldown).toBe(30);
    expect(projectileData(1120)?.localNPCHitCooldown).toBe(60);
    expect(projectileData(1121)?.localNPCHitCooldown).toBe(60);
    expect(projectileData(1122)?.width).toBe(16);
    expect(projectileData(1122)?.idStaticNPCHitCooldown).toBe(10);
    expect(projectileData(1125)?.localNPCHitCooldown).toBe(-1);
    expect(projectileData(1128)?.idStaticNPCHitCooldown).toBe(30);
    expect(projectileData(1134)?.idStaticNPCHitCooldown).toBe(20);
    expect(projectileData(1135)?.idStaticNPCHitCooldown).toBe(10);
  });
  it('新武器 shoot → 弹数据闭环（6147-6195 射击/魔法/召唤族）', () => {
    const pairs: Array<[number, number]> = [
      [6148, 1112], [6149, 1113], [6152, 1114], [6153, 1115], [6154, 1116],
      [6155, 1117], [6161, 1118], [6164, 1119], [6171, 126], [6173, 1122], [6174, 1123],
    ];
    for (const [vid, proj] of pairs) {
      const c = itemCombat(vid);
      expect(c, `combat ${vid}`).not.toBeNull();
      expect(c?.shoot, `shoot ${vid}`).toBe(proj);
      expect(projectileData(proj), `proj ${proj}`).not.toBeNull();
    }
  });
  it('combatWeapon 分流（召唤 4 件 + 魔法 5 件；6174 走 Game 专支不走通用分流）', () => {
    expect(combatWeapon({ key: 'vi_6148_PalworldMinionTrustyCattiva', vid: 6148 })?.kind).toBe('summon');
    expect(combatWeapon({ key: 'vi_6149_PalworldMinionTrustyFoxsparks', vid: 6149 })?.kind).toBe('summon');
    expect(combatWeapon({ key: 'vi_6161_ClayPotMinion', vid: 6161 })?.kind).toBe('summon');
    expect(combatWeapon({ key: 'vi_6164_ForbiddenMinion', vid: 6164 })?.kind).toBe('summon');
    // 6174 碎岩龟：原版 SetDefaults 无 summon/damage 位（Item.cs:47564-47576），
    // 出手链 = ItemCheck_Shoot 专支 → 本仓 Game.ts:8086 专支，combatWeapon 恒 null
    expect(combatWeapon({ key: 'vi_6174_PalworldTrustyDigtoise', vid: 6174 })).toBeNull();
    expect(combatWeapon({ key: 'vi_6152_DaybloomStaff', vid: 6152 })?.kind).toBe('magic');
    expect(combatWeapon({ key: 'vi_6153_GlacierFang', vid: 6153 })?.kind).toBe('magic');
    expect(combatWeapon({ key: 'vi_6154_Petalstorm', vid: 6154 })?.kind).toBe('magic');
    expect(combatWeapon({ key: 'vi_6155_LightningStrike', vid: 6155 })?.kind).toBe('magic');
    expect(combatWeapon({ key: 'vi_6173_ArcSurge', vid: 6173 })?.kind).toBe('magic');
  });
});
