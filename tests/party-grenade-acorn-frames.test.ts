// SW-P1 2026-09-03：3548 Happy Grenade→弹 588 内容链接 + 1088 橡实种弹 2 帧修正回归。
// 原版链：Item.cs:32006-32021 case 3548（useStyle5/speed6/shoot588/20×20/consumable/
// UseSound Item1/anim20/noUseGraphic/noMelee/value sellPrice(0,0,0,50)=250/dmg30/kb6/
// rare2/ranged）；弹 588 SetDefaults（P.cs:6378-6385 14×14/aiStyle16/penetrate-1）；
// PrepareBombToBlow :47658-47661 {30,397,517,588} 只 Resize(128²)+kb8=伤保物品伤 30；
// 引信 180（NewProjectile :10971 缺省表无 588）；Kill_ExplodeTiles :79027 裂砖专破；
// Kill 视觉专支 :80190-80259。销售渠道=NPC 208 派对女孩（NPCInteractions.cs:505
// Shop(208,13)→Chest.cs case 13 :2321-2323）唯一门=玩家背包已有 3548（HasItem）。
// 1088：projFrames[1088]=2（Main.cs:8594）+帧支 P.cs:48058-48063 首拍一次性 rand(2)
// +盒 20×20（P.cs:10147-10153）+静止 Kill 析取臂（P.cs:48030）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/Game';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { projectileData } from '../src/data/vanillaProjectiles';
import shopstockJson from '../src/data/vanilla-shopstock.json';
import { GrenadeProj, acornSeedFrameInit, BOMB_DAMAGE_KEEP_16, bombGravityGateOf } from '../src/entities/WeaponProj';

describe('SW-P1 3548 Happy Grenade→弹 588 链', () => {
  it('3548 SetDefaults 终值（Item.cs:32006-32021）+ grenade 族归派', () => {
    const c = itemCombat(3548)!;
    expect([c.shoot, c.damage, c.knockBack, c.useTime, c.useAnimation, c.shootSpeed])
      .toEqual([588, 30, 6, 20, 20, 6]);
    expect([c.consumable, c.noMelee, c.noUseGraphic, c.ranged]).toEqual([true, true, true, true]);
    expect(itemFuncOfVid(3548)?.useStyle).toBe(5);
    const w = combatWeapon({ key: 'vi_3548_PartyGirlGrenade', vid: 3548 })!;
    expect([w.kind, w.shoot, w.damage]).toEqual(['grenade', 588, 30]);
    const p = projectileData(588)!;
    expect([p.aiStyle, p.width, p.height]).toEqual([16, 14, 14]);
  });
  it('588 档：伤保物品伤 30（非 max60）/引信 180/不毁地形/裂砖专破/接触伤豁免', () => {
    const src = readFileSync('src/core/Game.ts', 'utf8');
    expect(src).toContain(': cw.shoot === 588 ? cw.damage');            // dmg 原式透传（:47658-47661 组不写 damage）
    expect(src).toContain('cw.shoot === 588 ? 64');                     // hurtBox=64（Resize 128² 半宽）
    expect(Game.EXPLODE_FUSE[588]).toBeUndefined();                     // 表外回落 180（:10971）
    expect(Game.EXPLODE_RADIUS[588]).toBeUndefined();                   // Kill_ExplodeTiles 闸门表外（:79027）
    expect(Game.EXPLODE_CRACKED_PROJ.has(588)).toBe(true);              // 裂砖专破 {30,397,517,588}
    expect(BOMB_DAMAGE_KEEP_16.has(588)).toBe(true);                    // damage=0 清零豁免（:48044）
    expect(bombGravityGateOf(588)).toBe(10);                            // 重力门手雷族档（:48377）
    expect(new GrenadeProj(0, 0, 0, 0, 30, 180, 588, () => {}).w).toBe(14);   // 弹盒 14×14（:6378-6385）
  });
  it('销售渠道：派对女孩 208 商店 3548=has:3548 补货门+价 250（Chest.cs case 13）', () => {
    const stock = (shopstockJson as { shops: Record<string, Array<{ id: number; price: number | null; cond: string | null }>> }).shops['208']!;
    const e = stock.find((s) => s.id === 3548);
    expect([e?.price, e?.cond]).toEqual([250, 'has:3548']);
  });
});

describe('SW-P1 1088 橡实种弹帧修正', () => {
  it('帧规则纯函数（P.cs:48058-48063）：首拍一次性 rand(2) 选帧,此后不推进', () => {
    expect(acornSeedFrameInit(0, 0)).toEqual({ counter: 1, frame: 0 });
    expect(acornSeedFrameInit(0, 1)).toEqual({ counter: 1, frame: 1 });
    expect(acornSeedFrameInit(1, 1).frame).toBe(-1);   // counter≠0 = 不覆写（无逐帧动画）
    expect(acornSeedFrameInit(3, 0)).toEqual({ counter: 3, frame: -1 });
  });
  it('盒 20×20（P.cs:10147-10153）+ 重力门 10 档', () => {
    expect(new GrenadeProj(0, 0, 0, 0, 1, 3600, 1088, () => {}).w).toBe(20);
    expect(bombGravityGateOf(1088)).toBe(10);
  });
});
