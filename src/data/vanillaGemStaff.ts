// 宝石法珠特性系统 1:1（1457 新机制 GemStaffFeatures，Terarria1457 Projectile.cs:36-193 +
// Player.cs:49990 PackGemStaffFeatures + Projectile.cs:22259 FinalizeProjectile_GemStaves）。
// 1456 的宝石弹 121-126/597 全员同型（直飞穿透）；1457 按宝石分化：
//   121 紫晶 Homing / 124 翡翠 FastThenSlow / 597 琥珀 CanBounce(0.8 反弹) /
//   123 蓝晶 SwirlTwins / 122 黄玉 AoeExplosion / 125 红晶 ArPenSpread / 126 钻石 BiggerHitbox
// 穿对应宝石长袍（1282-1287/4256）时任意宝石弹获得长袍特性（Player.cs:49990-50003）；
// 6171 Bejeweled Staff = AllGems（:49783-49790 追加 Homing/CanBounce/AoeExplosion/
// FastThenSlow 四特性；本仓已注册该物品——vanillaItemCombat '6171'，创造/导入可得）。

/** 特性位（GemStaffFeatures Bits 0-9，Projectile.cs:38-160） */
export interface GemStaffFlags {
  homing?: boolean;       // Bits[0] 紫晶
  fastThenSlow?: boolean; // Bits[1] 翡翠
  canBounce?: boolean;    // Bits[2] 琥珀
  aoeExplosion?: boolean; // Bits[3] 黄玉
  swirlTwins?: boolean;   // Bits[4] 蓝晶
  arPenSpread?: boolean;  // Bits[5] 红晶
  biggerHitbox?: boolean; // Bits[6] 钻石
  allGems?: boolean;      // Bits[7] 6171 Bejeweled Staff（全特性）
  repeatsGem?: boolean;   // Bits[8] 同色成套（长袍+本弹同宝石）——发射侧 +4 伤 +1 击退
  // Bits[9] allGems2：1457 PackGemStaffFeatures 无置位点（Player.cs:49990-50007 只写
  //  Bits0-8）→ AllGems2 七连扇支（:49822-49868）为死代码，不移植（蓝队 R2 复核备案）
}

/** 宝石弹 → 主特性（PackGemStaffFeatures 的 shoot==N 臂，Player.cs:49994-50001） */
export const GEM_BOLT_FEATURES: Readonly<Record<number, GemStaffFlags>> = {
  121: { homing: true },
  124: { fastThenSlow: true },
  597: { canBounce: true },
  123: { swirlTwins: true },
  122: { aoeExplosion: true },
  125: { arPenSpread: true },
  126: { biggerHitbox: true },
};

/** 宝石长袍 → 特性（type==1282 等臂；穿长袍时任意宝石弹吃该特性） */
export const GEM_ROBE_FEATURES: Readonly<Record<number, GemStaffFlags>> = {
  1282: { homing: true },       // Amethyst Robe
  1285: { fastThenSlow: true }, // Emerald Robe
  4256: { canBounce: true },    // Amber Robe
  1284: { swirlTwins: true },   // Sapphire Robe
  1283: { aoeExplosion: true }, // Topaz Robe
  1286: { arPenSpread: true },  // Ruby Robe
  1287: { biggerHitbox: true }, // Diamond Robe
};

/** 宝石弹/长袍 → 同色判定键（RepeatsGem 七组布尔 :50006 的等价压缩：
 *  shoot 主特性位 == 长袍特性位 才算成套，如 121+1282 真、121+1285 假） */
const GEM_COLOR_KEY: Readonly<Record<number, keyof GemStaffFlags>> = {
  121: 'homing', 124: 'fastThenSlow', 597: 'canBounce', 123: 'swirlTwins',
  122: 'aoeExplosion', 125: 'arPenSpread', 126: 'biggerHitbox',
};
const ROBE_COLOR_KEY: Readonly<Record<number, keyof GemStaffFlags>> = {
  1282: 'homing', 1285: 'fastThenSlow', 4256: 'canBounce', 1284: 'swirlTwins',
  1283: 'aoeExplosion', 1286: 'arPenSpread', 1287: 'biggerHitbox',
};

/** PackGemStaffFeatures 1:1（Player.cs:49990-50012）：shoot 主特性 ∪ 长袍特性 ∪ AllGems
 *  ∪ RepeatsGem（同色成套，!AllGems 门）。★AllGems 的四特性追加发生在发射侧
 *  （:49783-49790 Homing/CanBounce/AoeExplosion/FastThenSlow——SwirlTwins/ArPenSpread/
 *  BiggerHitbox 【不】加），此处一并落位使 bits 与原版 ai[0] 同值 */
export function packGemStaffFeatures(
  shoot: number,
  armorBodyVid: number | undefined,
  heldVid: number | undefined,
): GemStaffFlags {
  const f: GemStaffFlags = { ...(GEM_BOLT_FEATURES[shoot] ?? {}) };
  const robe = armorBodyVid !== undefined ? GEM_ROBE_FEATURES[armorBodyVid] : undefined;
  if (robe) Object.assign(f, robe);
  if (heldVid === 6171) {
    // :49783-49790 AllGems 追加四特性（发射侧同序；乘区 GetDamageMultiplier 对
    //  AllGems 恒 1，:165-169）
    f.allGems = true;
    f.homing = f.canBounce = f.aoeExplosion = f.fastThenSlow = true;
    return f;   // AllGems 时 RepeatsGem 不置位（:50004 if (!AllGems) 门）
  }
  // :50005-50007 RepeatsGem：本弹与长袍同宝石（七组布尔）
  const sk = GEM_COLOR_KEY[shoot];
  const rk = armorBodyVid !== undefined ? ROBE_COLOR_KEY[armorBodyVid] : undefined;
  if (sk !== undefined && rk !== undefined && sk === rk) f.repeatsGem = true;
  return f;
}

/** GetDamageMultiplier 1:1（Projectile.cs:165-182）：SwirlTwins 0.6 / CanBounce 0.8 /
 *  ArPenSpread 0.5 取最小；AllGems 恒 1（AoeExplosion 爆伤与最终伤乘区消费） */
export function gemDamageMultiplier(f: GemStaffFlags): number {
  if (f.allGems) return 1;
  let num = 1;
  if (f.swirlTwins) num = Math.min(num, 0.6);
  if (f.canBounce) num = Math.min(num, 0.8);
  if (f.arPenSpread) num = Math.min(num, 0.5);
  return num;
}

/** FinalizeProjectile_GemStaves 1:1（Projectile.cs:22259-22296）：
 *  FastThenSlow penetrate+1 & timeLeft×2 / CanBounce penetrate+2 /
 *  BiggerHitbox penetrate+1 / ArPenSpread armorPen+4 / AllGems penetrate+2+arpen4+timeLeft90 */
export function finalizeGemStaffStats(
  f: GemStaffFlags,
  base: { penetrate: number; armorPen: number; timeLeft: number },
): { penetrate: number; armorPen: number; timeLeft: number } {
  let addPen = 0;
  let addArpen = 0;
  let timeMul = 1;
  if (f.fastThenSlow) addPen = Math.max(addPen, 1), timeMul = 2;
  if (f.canBounce) addPen = Math.max(addPen, 2);
  if (f.biggerHitbox) addPen = Math.max(addPen, 1);
  if (f.arPenSpread) addArpen += 4;
  if (f.allGems) {
    addPen = 2;
    addArpen = 4;
    return { penetrate: base.penetrate + addPen, armorPen: base.armorPen + addArpen, timeLeft: 90 };
  }
  return {
    penetrate: base.penetrate + addPen,
    armorPen: base.armorPen + addArpen,
    timeLeft: base.timeLeft * timeMul,
  };
}

/** 宝石弹判定（HandleMovement/AI_029 的 type 门，Projectile.cs:18106/:38562） */
export function isGemBolt(type: number): boolean {
  return type === 121 || type === 122 || type === 123 || type === 124 || type === 125 || type === 126 || type === 597;
}
