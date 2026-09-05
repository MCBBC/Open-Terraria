// SW-AT1 2026-09-05：autoReuseAllItems 全武器连发门对账。
// 语义源：Player.cs:53514-53558 ItemCheck_AutoReuseLogic/TryAllowingItemReuse——
// `(stressBall || autoReuseAllWeapons) && sItem.damage > 0 && (!sItem.channel || !channel)`
// → releaseUseItem=true → :43064 连用门（非 autoReuse 物品也持按连发）。
// 本仓单一真源 = Game.autoReuseAllChain（ranged/cw/thrownCombat/孤儿 B1-A-B3 门共用；
// melee 支内联 `cwMelee.damage > 0` 同式；channel 例外由载体 SetDummyItemTime 钉 useTime）。
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { options } from '../src/core/Options';
import { combatWeapon, itemCombat, thrownCombat } from '../src/data/vanillaItemCombat';

const chain = (vid: number): boolean =>
  (Game.prototype as unknown as { autoReuseAllChain: (v: number) => boolean })
    .autoReuseAllChain.call(null, vid);
const defOf = (vid: number) => ({ key: `vi_${vid}_t`, vid });

describe('autoReuseAllChain（TryAllowingItemReuse Player.cs:53550）', () => {
  it('默认关：任何物品不经全局档连发（Main.cs:241 默认 false）', () => {
    expect(options.data.autoReuseAllItems).toBe(false);
    for (const v of [39, 96, 1130, 2366, 949, 166]) expect(chain(v)).toBe(false);
  });
  it('开启：damage>0 各武器类连发；damage 0 件拒（原版 sItem.damage > 0 门）', () => {
    options.data.autoReuseAllItems = true;
    try {
      expect(chain(39)).toBe(true);    // 木弓（ranged 支,非原生 autoReuse）
      expect(chain(96)).toBe(true);    // 火枪（ranged 支）
      expect(chain(1130)).toBe(true);  // 蜜雷锋（孤儿 B1 支,damage 12）
      expect(chain(949)).toBe(true);   // 雪球（thrownCombat 支,damage 8）
      expect(chain(2366)).toBe(true);  // 蜘蛛杖（cw 支 summon,非原生 autoReuse,damage 26）
      // damage 0：手雷 166（弹 28 自带伤）/足球/天灯/晶洞/打窝桶——原版不连发
      for (const v of [166, 4743, 4702, 4400, 4608]) expect(chain(v)).toBe(false);
      // melee 支内联同式：5129 melee/damage 0/非 autoReuse → 全局档也不连挥
      expect(combatWeapon(defOf(5129))?.kind).toBe('melee');
      expect(chain(5129)).toBe(false);
    } finally { options.data.autoReuseAllItems = false; }
  });
  it('分支归类锚：补接门的 vid 确实落在对应分支', () => {
    expect(itemCombat(39)?.useAmmo).toBe(40);               // ranged 分支 useAmmo 门
    expect(itemCombat(96)?.useAmmo).toBe(97);
    expect(thrownCombat(defOf(949))?.shoot).toBe(166);      // thrownCombat 支
    expect(combatWeapon(defOf(166))?.kind).toBe('grenade'); // cw 支（先于 thrownCombat）
    expect(combatWeapon(defOf(2366))?.kind).toBe('summon'); // cw 支 summon case
  });
});
