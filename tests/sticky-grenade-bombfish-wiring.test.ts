// SW-H1 2026-09-03：红队挂账「粘性雷管 551/552」定谳 + 炸弹鱼/粘性手雷接线回归。
// 原版链：ItemID 551/552=神圣板甲胸/腿（护甲,非炸弹——红队线索错位）；真粘性族=
// item 2586 StickyGrenade→弹 397（Item.cs:25375-25388 useStyle5/speed5.5/45t/伤60）
// 与 item 3196 BombFish→弹 519（:29620-29634 useStyle1/speed6/25t/伤0）；弹 SetDefaults
// 397=14×14/tileCollide=false（P.cs:4783-4791）、519=24×24/tileCollide=false（:5891-5897）；
// 引信 180（:10982-10985 519/:11021-11024 397）；PrepareBombToBlow {28,37,516,519}
// →100（:47634-47638）/{30,397,517,588} 保物品伤（:47658-47661）；粘性扫描 :47821
// {37,397,470,519,773,911,1087}；入液即爆表 :47768-47770 不含 397/519（均不入液爆）；
// 引信烟尘 307=1086/1087 专属每 tick 1 粒（:48048-48055）。
import { describe, it, expect } from 'vitest';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { vanillaStatOfVid } from '../src/data/vanillaItemStats';
import { projectileData } from '../src/data/vanillaProjectiles';
import { Game } from '../src/core/Game';
import { STICKY_PROJ, GrenadeProj, fuseSmoke307Of } from '../src/entities/WeaponProj';

describe('SW-H1 粘性雷管族定谳（551/552 错位 + 2586/3196 接线）', () => {
  it('551/552=神圣板甲护甲（combat/func 表无条目=本相,stats 表 def 15/11）', () => {
    expect([itemCombat(551), itemCombat(552), itemFuncOfVid(551), itemFuncOfVid(552)])
      .toEqual([null, null, null, null]);
    expect([vanillaStatOfVid(551)?.s, vanillaStatOfVid(551)?.def]).toEqual(['b', 15]);
    expect([vanillaStatOfVid(552)?.s, vanillaStatOfVid(552)?.def]).toEqual(['l', 11]);
  });
  it('2586 粘性手雷→弹 397（SetDefaults 终值+grenade 族+粘性归属+引信 180）', () => {
    const c = itemCombat(2586)!;
    expect([c.shoot, c.damage, c.useTime, c.useAnimation, c.shootSpeed]).toEqual([397, 60, 45, 45, 5.5]);
    const w = combatWeapon({ key: 'vi_2586_StickyGrenade', vid: 2586 })!;
    expect([w.kind, w.shoot, w.damage]).toEqual(['grenade', 397, 60]);
    const p = projectileData(397)!;
    expect([p.aiStyle, p.width, p.height, p.tileCollide]).toEqual([16, 14, 14, false]);
    expect(STICKY_PROJ.has(397)).toBe(true);
    expect(Game.EXPLODE_FUSE[397]).toBeUndefined();   // 表外回落 180（:11021-11024）
    expect(Game.EXPLODE_RADIUS[397]).toBeUndefined(); // 手雷族不破坏地形（Kill :79001）
  });
  it('3196 炸弹鱼→弹 519（24×24 盒+粘性归属+爆炸伤档 100+半径 4+引信 180）', () => {
    const c = itemCombat(3196)!;
    expect([c.shoot, c.damage, c.useTime, c.useAnimation, c.shootSpeed]).toEqual([519, 0, 25, 25, 6]);
    expect(combatWeapon({ key: 'vi_3196_BombFish', vid: 3196 })?.kind).toBe('grenade');
    const p = projectileData(519)!;
    expect([p.aiStyle, p.width, p.height, p.tileCollide]).toEqual([16, 24, 24, false]);
    expect(STICKY_PROJ.has(519)).toBe(true);
    expect(Game.EXPLODE_FUSE[519]).toBeUndefined();   // 180（:10982-10985）
    expect(Game.EXPLODE_RADIUS[519]).toBe(4);          // Kill :79035 num6=4
    expect([new GrenadeProj(0, 0, 0, 0, 100, 180, 519, () => {}).w,
      new GrenadeProj(0, 0, 0, 0, 100, 180, 397, () => {}).w,
      new GrenadeProj(0, 0, 0, 0, 100, 180, 1087, () => {}).w]).toEqual([24, 14, 22]);
  });
  it('引信烟尘 307 纯函数（:48048-48055——仅 1086/1087,每 tick 1 粒;引信尖=旋转向×1.1）', () => {
    expect(fuseSmoke307Of(397, 0, 11)).toBeNull();   // 手雷/炸弹鱼无专属尘
    expect(fuseSmoke307Of(519, 0, 12)).toBeNull();
    expect(fuseSmoke307Of(1086, 0, 11)).toEqual({ dx: 0, dy: -12.100000000000001, dvx: 0, dvy: -5 });
    const q = fuseSmoke307Of(1087, Math.PI / 2, 11)!; // 旋 π/2 → 引信尖转到 +x
    expect(Math.abs(q.dx - 12.1)).toBeLessThan(1e-9);
    expect(Math.abs(q.dy)).toBeLessThan(1e-9);
    expect([Math.abs(q.dvx - 5), Math.abs(q.dvy) < 1e-9]).toEqual([0, true]);
  });
});
