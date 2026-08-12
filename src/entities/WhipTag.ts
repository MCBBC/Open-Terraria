// 鞭 tag/proc 共享状态与命中结算（1.4.5.6 反编译 1:1）：
//  - ItemID.Sets.UniqueTagEffects 全表（ItemID.cs:1303-1414）
//  - TagEffectState（TagEffectState.cs:138-243）：TimeLeftOnNPC/ProcTimeLeftOnNPC 窗口
//  - WhipTagEffect 族（WhipTagEffect.cs / _Firecracker / _Starcrash /
//    _DarkHarvest / _ViolentDisplayOfFlower / _Possession / _Kaleidoscope）
//  原版 tag 状态挂在玩家（TagEffectState 每玩家一份 int[maxNPCs]）；本作单机语义
//  下等价挂在敌实体（WhipTagged 字段，Enemy.tick 内衰减 :TagEffectState.Update 155-168）。
import { Arrow } from './Arrow';
import type { GameHooks } from './types';

/** ItemID.Sets.UniqueTagEffects（ItemID.cs:1303-1414 全表核对）：鞭 → TagDamage。
 *  4912 火鞭 WhipTagEffect_Firecracker()（:1397-1398）无 TagDamage → 0
 *  （tag 窗口仍开启，proc 链独立）；6143 妖精鞭 +4 */
export const WHIP_TAG: Record<number, number> = {
  5688: 3, 5473: 3, 4672: 4, 5474: 5, 5475: 5, 5476: 2,
  4913: 6, 5074: 7, 4911: 6, 4678: 9, 5477: 9, 4680: 15,
  4679: 8, 5478: 12, 5479: 15, 4914: 20, 5480: 25, 6143: 4, 4912: 0,
};
/** 鞭 Tag 暴击率（UniqueTagEffects CritChance，%：随从命中被 tag 敌时
 *  WhipTagEffect.ModifyTaggedHit :67-70 判定 → 整击暴击）。未列入=0 */
export const WHIP_TAG_CRIT: Record<number, number> = {
  4679: 10, 5478: 5, 5479: 15, 4914: 10, 5480: 10,
};
/** tag 命中授予的玩家 buff（WhipTagEffect.PlayerBuffId/PlayerBuffTime=180，
 *  OnTagAppliedToNPC → AddTheBuff :42-51；PlayerBuffAppliedManually=true 的
 *  5473/4911 不走此链——由鞭命中分支授予，见 WHIP_HIT_BUFF） */
export const WHIP_TAG_BUFF: Record<number, number> = {
  4913: 314, 4678: 308, 4680: 311,
};
/** 鞭命中分支授予的玩家 buff（TryDoingOnHitEffects :12936-12951：case 912 →
 *  AddBuff(312,180) + 首次雪花哨兵 917；case 1028 → AddBuff(365,180) + 蜘蛛 1036） */
export const WHIP_HIT_BUFF: Record<number, number> = { 4911: 312, 5473: 365 };
/** 鞭命中附属召唤（:12936-12951：雪花 917 伤 15 / 蜘蛛 1036 伤 2，玩家 flag 门控
 *  在场期间不重复生成） */
export const WHIP_HIT_SIDEKICK: Record<number, { proj: number; dmg: number }> = {
  4911: { proj: 917, dmg: 15 }, 5473: { proj: 1036, dmg: 2 },
};
/** GetWhipSettings segments（Projectile.cs:45683-45761，默认 20） */
export const WHIP_SEGMENTS: Record<number, number> = {
  1104: 36, 1028: 12, 847: 20, 848: 40, 849: 30, 1033: 45, 915: 40, 1035: 30,
};
/** GetWhipSettings rangeMultiplier（:45692-45760）。晨星 848 是赋值 1.6（:45734-45736） */
export const WHIP_RANGE: Record<number, number> = {
  1104: 0.75, 1028: 0.75, 841: 0.75, 1029: 0.95, 1030: 0.85, 914: 1.0,
  1031: 1.1, 952: 0.95, 913: 1.4, 912: 1.5, 847: 1.75, 1032: 1.8,
  848: 1.6, 849: 2.15, 1033: 2.0, 915: 2.2, 1034: 2.2, 1035: 2.2,
};
/** 多目标伤害衰减（:12604-12678：命中后鞭 damage 字段 ×此倍率，键=projId） */
export const WHIP_FALLOFF: Record<number, number> = {
  1104: 0.40, 1028: 0.40, 841: 0.50, 1029: 0.60, 1030: 0.60, 914: 0.60,
  1031: 0.70, 952: 0.90, 913: 0.66, 912: 0.70, 847: 0.80, 1032: 0.85,
  848: 0.95, 849: 0.90, 1033: 0.95, 915: 0.80, 1034: 0.90, 1035: 0.95,
};
/** proc 型鞭（TryDoingOnHitEffects :12933-12981：case 913/1031/1032 首命中
 *  localAI[0]==0 门、case 1035 每次命中 → TryEnableProcOnNPC 240t）。
 *  5479（proj 1034）不是 proc——命中直接沿鞭曲线撒星座星（:12966-12970） */
export const WHIP_PROC_ITEMS = new Set([4912, 5476, 5477, 5480]);
/** extraUpdates 覆盖（SetDefaults :7862-7885：847/849 extraUpdates=2 → MaxUpdates=3；
 *  其余 DefaultToWhip extraUpdates=1 :10103 → MaxUpdates=2） */
export const WHIP_EXTRA_UPDATES = new Set([847, 849]);
/** ProjectileID.Sets.SummonTagDamageMultiplier（ProjectileID.cs:31，默认 1；
 *  仅闪电光环 688/689/690 = 0.5） */
export const SUMMON_TAG_MUL: Record<number, number> = { 688: 0.5, 689: 0.5, 690: 0.5 };
/** ProjectileID.Sets.MinionShot（ProjectileID.cs:197）——吃鞭 tag 的随从弹 */
export const MINION_SHOT_SET = new Set([374, 376, 389, 195, 408, 433, 614, 818, 1044, 1097, 1106]);
/** ProjectileID.Sets.SentryShot（ProjectileID.cs:199）——吃鞭 tag 的哨兵弹 */
export const SENTRY_SHOT_SET = new Set([680, 664, 666, 668, 694, 695, 696, 644, 642, 378, 379, 309, 967, 1026]);

export function whipTagDamageOf(itemId: number): number {
  return WHIP_TAG[itemId] ?? 0;
}

export interface WhipTagged {
  /** 鞭 tag 剩余 tick（TagEffectState.TimeLeftOnNPC，WhipTagEffect TagDuration=240） */
  whipTagT?: number;
  /** tag 附加伤害（最近一次命中鞭的 TagDamage） */
  whipTagDmg?: number;
  /** tag 暴击率（UniqueTagEffects CritChance；随从命中判定） */
  whipTagCrit?: number;
  /** 最近命中鞭的物品 id（Dark Harvest OnTaggedHit 等按鞭分支） */
  whipTagItem?: number;
  /** proc 剩余 tick（ProcTimeLeftOnNPC=TagDuration 240；首跳触发后清零） */
  whipProcT?: number;
  /** proc 对应鞭物品 id */
  whipProcItem?: number;
  /** OnTaggedHit 直伤回调（黑收成 916 等价：伤害落在被命中敌身上，视觉走弹幕） */
  hurtFx?: (d: number) => void;
}

/**
 * 随从/哨兵命中侧统一结算鞭 tag + proc（TagEffectState.ModifyHit :216-228 +
 * OnHit :230-243；调用方须满足 WhipTagEffect.CanRunHitEffects :73-84 —— 即
 * 随从本体 / MinionShot（MINION_SHOT_SET）/ 哨兵 / SentryShot（SENTRY_SHOT_SET））：
 *  1. IsNPCTagged → ModifyTaggedHit（WhipTagEffect :58-70）：伤害 +=
 *     (TagDamage + bonusTagDamage)×SummonTagDamageMultiplier，rand(100)<CritChance → 暴击
 *  2. OnTaggedHit：4680 黑收成 → 916 黑闪电（伤害 = TagDamage×乘率，
 *     WhipTagEffect_DarkHarvest.cs:15-39，armorPen 50 :8404）
 *  3. CanProcOnNPC → ModifyProcHit + ClearProcOnNPC + OnProcHit（一次性）：
 *     4912 火鞭 命中伤 ×(1+1.75)（_Firecracker.cs:12-16）；
 *     附带特效伤害基数 = num4（命中基础伤，:12820 OnHit 传 num4 = tag/暴击前）——
 *     918 爆炸 num4×1.75（96×96 盒 :8405-8415）、1037 陨石 num4×1.33
 *     （_Starcrash.cs:22）、1038 花瓣固定 40（_ViolentDisplayOfFlower.cs:13）、
 *     1045 月主弹固定 20×3 连（_Possession.cs:13 + :13832-13853 + case 1045 :12977-12981）
 * 返回最终伤害（含暴击 ×2）与是否暴击。
 */
export function resolveWhipTagHit(
  en: WhipTagged,
  baseDmg: number,
  game: GameHooks,
  add: (e: unknown) => void,
  tagMul = 1,
  hx = 0,
  hy = 0,
): { dmg: number; crit: boolean } {
  let dmg = baseDmg;
  let crit = false;
  if ((en.whipTagT ?? 0) <= 0) return { dmg: Math.max(1, Math.round(dmg)), crit };
  // 1 ModifyTaggedHit（WhipTagEffect.cs:58-66）
  const tag = Math.round((en.whipTagDmg ?? 0) * tagMul);
  dmg += tag;
  if (Math.random() * 100 < (en.whipTagCrit ?? 0)) crit = true; // :67-70
  // 2 OnTaggedHit（TagEffectState.cs:230-234 → WhipTagEffect_DarkHarvest.cs:15-39）
  if (en.whipTagItem === 4680) {
    en.hurtFx?.(Math.max(1, tag));
    add(new Arrow(hx, hy, 0, -1, 0, 0, 916, null, { grav: 0, life: 24, pierce: 99 }));
    game.spawnParticles(hx, hy, '#7A3AFF', 6, 2.2, { life: 20 });
  }
  // 3 proc 链（TagEffectState.cs:236-243：CanProcOnNPC → ClearProcOnNPC → OnProcHit）
  if ((en.whipProcT ?? 0) > 0 && en.whipProcItem) {
    const pi = en.whipProcItem;
    en.whipProcT = 0; // ClearProcOnNPC（:150-158）
    if (pi === 4912) {
      // WhipTagEffect_Firecracker.ModifyProcHit :12-16：damageDealt += damageDealt×1.75
      dmg += Math.round(dmg * 1.75);
    }
    if (crit) dmg *= 2;
    dmg = Math.max(1, Math.round(dmg));
    // OnProcHit 附带特效（伤害基数 = 命中基础伤 num4 :12820）
    if (pi === 4912) {
      // CreateExplosion（_Firecracker.cs:24-29）：918，伤 = num4×1.75（96×96 盒）
      const ex = Math.max(1, Math.round(baseDmg * 1.75));
      for (const ent2 of game.enemies()) {
        const en2 = ent2 as { dead: boolean; cx: number; cy: number; w: number; h: number;
          hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean };
        if (en2.dead || Math.abs(en2.cx - hx) > 48 + en2.w / 2 || Math.abs(en2.cy - hy) > 48 + en2.h / 2) continue;
        en2.hurt(ex, Math.sign(en2.cx - hx) * 2, -2, game);
      }
      game.spawnParticles(hx, hy, '#FF7A28', 16, 4, { life: 26 });
    } else if (pi === 5476) {
      // WhipTagEffect_Starcrash :15-31：目标上方 280px 落陨石 1037，伤 = num4×1.33，速 8
      add(new Arrow(hx - 6, hy - 280, 0.4, 8, Math.max(1, Math.round(baseDmg * 1.33)), 2, 1037, null, { grav: 0 }));
    } else if (pi === 5477) {
      // WhipTagEffect_ViolentDisplayOfFlower :12-29：3 花瓣 1038 固定伤 40
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        add(new Arrow(hx, hy, Math.cos(a) * 3.5, Math.sin(a) * 3.5, 40, 2, 1038, null, { grav: 0, life: 120 }));
      }
    } else if (pi === 5480) {
      // WhipTagEffect_Possession :10-14 + SpawnMoonLordWhipProc :13832-13853：
      // 固定伤 20，aiCounter 0→1→2 三连（case 1045 :12977-12981 链至 ai[1]>=2 停）
      const enw = en as unknown as { w?: number; h?: number };
      const w = enw.w ?? 16, h = enw.h ?? 16;
      for (let i = 0; i < 3; i++) {
        // 目标 Hitbox 外扩 (30,16) 再上移 8 后取随机点（:13838-13842）
        const px = hx - w / 2 - 30 + Math.random() * (w + 60);
        const py = hy - h / 2 - 24 + Math.random() * (h + 32);
        add(new Arrow(px, py, (Math.random() - 0.5) * 4, 6, 20, 1, 1045, null, { grav: 0, life: 60, pierce: 99 }));
      }
    }
    return { dmg, crit };
  }
  if (crit) dmg *= 2;
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}
