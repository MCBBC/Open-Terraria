// ★清偿刀 J（2026-09-30）：BJ408 债#1/#2 收口——itemcombat 提取器四根修
// （extract-itemcombat.mjs 头注⑦：a 嵌套贯穿组 / b 链式复合除式 / c DefaultToWhip
// 形参位 / d 守卫链数值面）后 vanilla-itemcombat.json 重产（4369→4608 键,+593 全部
// 纯加字段/新键,零既有值回退,era guard B-form 零漂移幂等）。
// 本文件 = 运行时判别面：
//   ①悠悠球全族 19 件 TryGet 四门输入面 + best 修饰语对拍表（RedsYoyo 3287=Godly,
//     BJ400/BJ408「暴击-only 档 36/61,Zealous」旧注=病灶相已翻——见
//     bj408-whip-reforge-legendary ⑦勘误）;
//   ②鞭 18 件 combat 表原生全值 ≡ vanilla-whips.json（双源同值,BJ408 兜底保留）;
//   ③链式/复合/除式族（1296/1345/2350/4715/4722/4870/4956/5669）;
//   ④守卫链数值面（2320 战锤/2421-2422 钓竿对/可放置族样本）;
//   ⑤零 stat 病灶对照（BJ408 ③ zero-stat 判别法复用：best 塌缩 61=旧相复现）。
// 源码锚（Terarria1457 亲读）：
//   悠悠球 Item.cs:30050-30180 case 3278-3292 贯穿组+嵌套 switch(type)（3287:3288
//   共享体 knockBack=4.5f/damage=70 在 :30170-30174）;DefaultToWhip :47811-47828;
//   1296 链式 :16035;4715 :38758-38759;4722 :38801;2320 守卫链 :23100-23117（★P4 锚勘误 2026-09-30:旧引 :16040/:38802/:23120-23137 漂移,1457 亲读复核）;
//   TryGet 四门 :1067-1079;BestPrefixValue :1083-1099。
import { describe, it, expect } from 'vitest';
import combatJson from '../src/data/vanilla-itemcombat.json';
import whipsJson from '../src/data/vanilla-whips.json';
import {
  prefixCombatStatForVid, rollablePrefixes, prefixTryGetFailsForItem,
  prefixValueMul, PREFIX_POOLS,
} from '../src/data/vanillaPrefixes';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';

const TABLE = combatJson as unknown as Record<string, Record<string, unknown>>;

/** BestPrefixValue 同构（Item.cs:1083-1099） */
function bestPrefix(pool: number[], stat?: { damage: number; useAnimation: number; mana: number; kb: number }): number {
  let best = 0;
  let bestVal = 0;
  for (const p of pool) {
    if (prefixTryGetFailsForItem(p, stat)) continue;
    const v = prefixValueMul(p);
    if (v > bestVal) { bestVal = v; best = p; }
  }
  return best;
}

const ZERO_STAT = { damage: 0, useAnimation: 0, mana: 0, kb: 0 };

// ────────── ① 悠悠球全族（vanilla 表=嵌套 switch(type) 逐 id 亲读值） ──────────

const YOYO_VANILLA: Record<number, [damage: number, kb: number, shoot: number]> = {
  3262: [21, 3.25, 534],
  3278: [9, 2.5, 541], 3279: [16, 4.5, 542], 3280: [17, 4, 543],
  3281: [18, 3.75, 544], 3282: [27, 4.3, 545], 3283: [34, 3.3, 546],
  3284: [54, 3.8, 547], 3285: [14, 3.5, 548], 3286: [60, 3.1, 549],
  3287: [70, 4.5, 550], 3288: [70, 4.5, 551], 3289: [47, 2.8, 552],
  3290: [43, 4.5, 553], 3291: [120, 4.3, 554], 3292: [115, 3.5, 555],
  3315: [40, 3.25, 562], 3316: [53, 3.8, 563], 3317: [28, 3.85, 564],
};
const BOOMERANG_POOL = PREFIX_POOLS.PrefixesForBoomeransAndChakrums;

describe('J-① 悠悠球全族 TryGet 输入面（嵌套贯穿组根修 a）', () => {
  it('19 件逐 id：damage/kb/shoot ≡ vanilla 嵌套 case 终值 ∧ anim/time 25 ∧ shoot 算式 541+type-3278', () => {
    for (const [vidStr, [dmg, kb, shoot]] of Object.entries(YOYO_VANILLA)) {
      const vid = Number(vidStr);
      const rec = TABLE[String(vid)];
      expect(rec, `yoyo ${vid} 在表`).toBeDefined();
      expect(rec.damage, `yoyo ${vid} damage`).toBe(dmg);
      expect(rec.knockBack, `yoyo ${vid} knockBack`).toBe(kb);
      expect(rec.shoot, `yoyo ${vid} shoot`).toBe(shoot);
      expect(rec.useTime, `yoyo ${vid} useTime`).toBe(25);
      expect(rec.useAnimation, `yoyo ${vid} useAnimation`).toBe(25);
    }
  });

  it('best 修饰语对拍表：全族 best=59 Godly（full-stat 恒真）;3287 对拍 BJ408 病灶相勘误', () => {
    const table: Array<{ vid: number; best: number }> = [];
    for (const vidStr of Object.keys(YOYO_VANILLA)) {
      const vid = Number(vidStr);
      const stat = prefixCombatStatForVid(vid)!;
      expect(stat.damage, `yoyo ${vid} stat.damage`).toBeGreaterThan(0);
      expect(stat.kb, `yoyo ${vid} stat.kb`).toBeGreaterThan(0);
      expect(rollablePrefixes(vid, false), `yoyo ${vid} pool`).toBe(BOOMERANG_POOL);
      const best = bestPrefix(BOOMERANG_POOL, stat);
      expect(best, `yoyo ${vid} best`).toBe(59);   // Godly:dmg1.15/kb1.15/crt5=1.45475
      table.push({ vid, best });
    }
    expect(table).toHaveLength(19);
    // 3287 病灶相对照（BJ408 ③ zero-stat 判别法）：零 stat 下 best 塌缩 61 Zealous
    expect(bestPrefix(BOOMERANG_POOL, ZERO_STAT)).toBe(61);
    expect(prefixValueMul(59)).toBeGreaterThan(prefixValueMul(61));
  });

  it('3291 瓦尔基里 crit+=10 累加面与 J 修不互扰（嵌套 case 内复合赋值既有通道）', () => {
    expect(TABLE['3291'].crit).toBe(10);
    expect(TABLE['3315'].crit).toBe(20);
  });
});

// ────────── ② 鞭 18 件：combat 表原生全值（根修 c）≡ vanilla-whips.json ──────────

const WHIP_VIDS = Object.keys(whipsJson as Record<string, unknown>).map(Number).sort((a, b) => a - b);

describe('J-② 鞭族 combat 表原生全值（DefaultToWhip 形参位根修 c）', () => {
  it('18 件逐鞭：combat 表 shoot/damage/knockBack/shootSpeed/useTime/useAnimation ≡ whips json（anim 缺省 30）', () => {
    expect(WHIP_VIDS).toHaveLength(18);
    for (const vid of WHIP_VIDS) {
      const w = (whipsJson as Record<string, { proj: number; dmg: number; kb: number; speed: number; anim: number }>)[String(vid)];
      const rec = TABLE[String(vid)];
      expect(rec, `whip ${vid} combat 在表`).toBeDefined();
      expect(rec.shoot, `whip ${vid} shoot`).toBe(w.proj);
      expect(rec.damage, `whip ${vid} damage`).toBe(w.dmg);
      expect(rec.knockBack, `whip ${vid} knockBack`).toBe(w.kb);
      expect(rec.shootSpeed, `whip ${vid} shootSpeed`).toBe(w.speed);
      expect(rec.useTime, `whip ${vid} useTime=animationTotalTime`).toBe(w.anim);
      expect(rec.useAnimation, `whip ${vid} useAnimation=animationTotalTime`).toBe(w.anim);
      expect(rec.summon, `whip ${vid} summon（DefaultToWhip 体）`).toBe(true);
      expect(rec.noMelee, `whip ${vid} noMelee`).toBe(true);
    }
  });

  it('前缀链 stat 面自足：itemCombat 单源即给全 18 鞭真 stat（WHIPS 兜底不再承载真值）', () => {
    for (const vid of WHIP_VIDS) {
      const st = itemCombat(vid)!;
      expect(st.damage, `whip ${vid} itemCombat.damage`).toBeGreaterThan(0);
      expect(prefixCombatStatForVid(vid)).toEqual({
        damage: st.damage!, useAnimation: st.useAnimation!, mana: 0, kb: st.knockBack!,
      });
    }
  });

  it('combatWeapon 鞭支零变化（BJ408 终态：WHIPS 短路先于 itemCombat）', () => {
    const cw = combatWeapon({ key: 'vi_5480_moon_lord_whip', vid: 5480 });
    expect(cw).toMatchObject({ kind: 'whip', itemId: 5480, shoot: 1035, damage: 110, knockback: 4, useTime: 30 });
  });
});

// ────────── ③ 链式/复合/除式族（根修 b） ──────────

describe('J-③ 链式/复合/除式赋值族（1296/1345/2350/4715/4722/4870/4956/5669）', () => {
  it('`X = (Y = N)` 双赋值族终值', () => {
    expect(TABLE['1296']).toMatchObject({ useTime: 24, useAnimation: 24 });   // :16035
    expect(TABLE['1345']).toMatchObject({ useTime: 20, useAnimation: 20 });   // :16651
    expect(TABLE['2350']).toMatchObject({ useTime: 30, useAnimation: 30 });   // :23648（手补退役后原生）
    expect(TABLE['4870']).toMatchObject({ useTime: 30, useAnimation: 30 });
  });

  it('4715 链式+复合除：useAnimation 12 / useTime 6（:38758-38759 `useAnimation=(useTime=12); useTime /= 2;`）', () => {
    expect(TABLE['4715']).toMatchObject({ useAnimation: 12, useTime: 6 });
  });

  it('除式族：4722 useTime=35/5=7 / 4956·5669 useTime=30/3=10（天顶剑族多剑弹节奏）', () => {
    expect(TABLE['4722']).toMatchObject({ useAnimation: 35, useTime: 7 });
    expect(TABLE['4956']).toMatchObject({ useAnimation: 30, useTime: 10 });
    expect(TABLE['5669']).toMatchObject({ useAnimation: 30, useTime: 10 });
  });

  it('1296/4715 魔法池 spd 门解压：useAnimation 真值下 speed 档过门（魔法族掷域复原）', () => {
    for (const vid of [1296, 4715]) {
      const stat = prefixCombatStatForVid(vid)!;
      expect(stat.useAnimation).toBeGreaterThan(0);
      // spd≠1 的池成员不再被零值门全杀：真 anim 下 round(anim×spd)≠anim 恒成立
      expect(prefixTryGetFailsForItem(45, stat)).toBe(false);   // 45 Quick/spd0.95 档
    }
  });
});

// ────────── ④ 守卫链数值面（根修 d） ──────────

describe('J-④ 守卫链数值面（2320 战锤/2421-2422 钓竿/可放置族样本）', () => {
  it('2320 战锤（SwordsHammersAxesPicks 成员）：全武器面原生归位 ∧ best 池解压', () => {
    expect(TABLE['2320']).toMatchObject({
      damage: 24, knockBack: 6, useTime: 14, useAnimation: 24, scale: 1.05,
      autoReuse: true, melee: true,
    });
    const stat = prefixCombatStatForVid(2320)!;
    expect(stat.damage).toBe(24);
    expect(stat.kb).toBe(6);
    expect(stat.useAnimation).toBe(24);
  });

  it('2421/2422 钓竿对（含 else 臂 shootSpeed）', () => {
    expect(TABLE['2421']).toMatchObject({ useTime: 8, useAnimation: 8, shoot: 381, shootSpeed: 13.5 });
    expect(TABLE['2422']).toMatchObject({ useTime: 8, useAnimation: 8, shoot: 382, shootSpeed: 16.5 });
  });

  it('可放置族样本（guard 链/嵌套贯穿组 anim15·time10|7 与药水 17）', () => {
    expect(TABLE['2237']).toMatchObject({ useTime: 10, useAnimation: 15, consumable: true, autoReuse: true, useTurn: true });
    expect(TABLE['1490']).toMatchObject({ useTime: 10, useAnimation: 15 });
    expect(TABLE['2690']).toMatchObject({ useTime: 7, useAnimation: 15 });
    expect(TABLE['1977']).toMatchObject({ useTime: 17, useAnimation: 17, consumable: true });
    expect(TABLE['3453']).toMatchObject({ maxStack: 1 });
    expect(TABLE['2889']).toMatchObject({ useTurn: true, noUseGraphic: true });
  });

  it('2289-2296 钓竿族贯穿组：共享体 anim/time/shoot 算式 + 内层 shootSpeed 覆写并存', () => {
    expect(TABLE['2289']).toMatchObject({ useTime: 8, useAnimation: 8, shoot: 360, shootSpeed: 9 });
    expect(TABLE['2296']).toMatchObject({ useTime: 8, useAnimation: 8, shoot: 366, shootSpeed: 16 });
  });
});

// ────────── ⑤ 重产不回退：既有锚点键值零漂移（抽样） ──────────

describe('J-⑤ 重产零回退抽样（era guard B-form 的运行时旁证）', () => {
  it('既有锚（99 木弓/40 木箭/3507 铜短剑/3287 邻位 3290）原值保持', () => {
    expect(TABLE['99']).toMatchObject({ damage: 8, useTime: 28, useAnimation: 28, useAmmo: 40, shootSpeed: 6.6 });
    expect(TABLE['40']).toMatchObject({ damage: 5, knockBack: 2, ammo: 40, consumable: true });
    expect(TABLE['3507']).toMatchObject({ shoot: 938, shootSpeed: 2.1, autoReuse: false, noMelee: true });
    expect(TABLE['3290']).toMatchObject({ damage: 43, knockBack: 4.5 });
  });
});
