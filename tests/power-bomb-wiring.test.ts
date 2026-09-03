// SW-E1 2026-09-03：Power Bomb 5594 / Sticky Power Bomb 5595 → 弹 1086/1087 接线回归。
// 原版链：Item.cs:44024-44028 DefaultToBomb(1086+(type-5594),6f)（:47771-47783）+ 弹
// SetDefaults :10135-10145（22×22/aiStyle16/1087 tileCollide=false）+ 引信 :10987（300）+
// PrepareBombToBlow :47652-47657（280²/伤 200）+ Kill :79052-79055（r9+explodeHardmodeOres）→
// CanExplodeTile :80413-80419 困矿六件 107/108/111/221/222/223。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { projectileData } from '../src/data/vanillaProjectiles';
import { STICKY_PROJ } from '../src/entities/WeaponProj';

function oreAt(sheet: number): [TileStore, number, number] {   // 造一格指定 sheet 实心格
  const st = new TileStore(20, 20);
  const id = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === sheet);
  expect(id).toBeGreaterThan(0);
  st.setTile(10, 10, id);
  return [st, 10, 10];
}

describe('SW-E1 Power/Sticky Power Bomb 数据面（DefaultToBomb 推导）', () => {
  it('itemCombat 5594/5595：shoot 1086/1087 + useTime40/shootSpeed6/consumable/noMelee', () => {
    for (const [vid, shoot] of [[5594, 1086], [5595, 1087]] as const) {
      const c = itemCombat(vid)!;
      expect([c.shoot, c.useTime, c.useAnimation, c.shootSpeed]).toEqual([shoot, 40, 40, 6]);
      expect([c.consumable, c.noMelee, c.noUseGraphic]).toEqual([true, true, true]);
      expect(itemFuncOfVid(vid)?.shoot).toBe(shoot);
    }
  });
  it('combatWeapon 归 grenade 族 + 弹 1086/1087 aiStyle16/22²/粘性差异', () => {
    const w94 = combatWeapon({ key: 'vi_5594_SuperBomb', vid: 5594 })!;
    const w95 = combatWeapon({ key: 'vi_5595_SuperStickyBomb', vid: 5595 })!;
    expect(w94.kind).toBe('grenade'); expect(w94.shoot).toBe(1086);
    expect(w95.kind).toBe('grenade'); expect(w95.shoot).toBe(1087);
    const p86 = projectileData(1086)!;
    expect([p86.aiStyle, p86.width]).toEqual([16, 22]);
    expect(p86.tileCollide).toBeUndefined();       // 1086 普通反弹
    expect(projectileData(1087)?.tileCollide).toBe(false);   // 1087 粘墙
    expect([STICKY_PROJ.has(1087), STICKY_PROJ.has(1086)]).toEqual([true, false]);
  });
  it('引信 300（:10987）/ 爆炸半径 9（:79052-79055）', () => {
    expect([Game.EXPLODE_FUSE[1086], Game.EXPLODE_FUSE[1087]]).toEqual([300, 300]);
    expect(Game.EXPLODE_FUSE[28]).toBeUndefined();   // 表外回落 180
    expect([Game.EXPLODE_RADIUS[1086], Game.EXPLODE_RADIUS[1087]]).toEqual([9, 9]);
  });
  it('困矿旗（:80413-80419）：六矿旗 true 可炸/false 不可', () => {
    for (const sheet of [107, 108, 111, 221, 222, 223]) {
      const [st, x, y] = oreAt(sheet);
      expect(Game.canExplodeTile(st, x, y, false, false, 999, false, false)).toBe(false);
      expect(Game.canExplodeTile(st, x, y, false, false, 999, false, true)).toBe(true);
    }
  });
  it('叶绿矿 211=恒不可炸（黑名单优先）+ getGoodWorld 尖刺 48 照常免疫', () => {
    const [st, x, y] = oreAt(211);
    expect(Game.canExplodeTile(st, x, y, true, false, 999, false, true)).toBe(false);
    const [st2, x2, y2] = oreAt(48);
    expect(Game.canExplodeTile(st2, x2, y2, true, false, 999, true, true)).toBe(false);
    expect(Game.canExplodeTile(st2, x2, y2, true, false, 999, false, true)).toBe(true);
  });
});
