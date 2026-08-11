// 配饰/盔甲数值效果运行时（tools/extract-equip-prefix.mjs → vanilla-accfx.json）。
// 来源 = Player.ApplyEquipFunctional switch + GrantArmorBenefits/ApplyEquipFunctional 的
// if-chain 数值段（meleeDamage += 0.15f 等纯数值模式；行为型效果不在表内）。
import fxJson from './vanilla-accfx.json';
import { ITEM_DEFS } from './items';

export interface AccFx {
  life?: number;      // lifeRegen += N（每半秒 N/2 HP）
  mana?: number;      // statManaMax2 += N
  def?: number;       // statDefense += N
  move?: number;      // moveSpeed += X
  meleeSpd?: number;  // meleeSpeed += X
  runSpeed?: number;  // accRunSpeed = X（基础 maxRunSpeed=3）
  dmgMelee?: number;
  dmgRanged?: number;
  dmgMagic?: number;
  dmgAll?: number;
  critMelee?: number;
  critRanged?: number;
  critMagic?: number;
  // ---- 行为型（二轮）----
  extraFall?: number;    // 摔伤豁免高度
  lavaMax?: number;      // 岩浆免疫 tick（420=7s）
  armorPen?: number;     // 护甲穿透
  rocketBoots?: number;  // 飞行档 1-5（1=基础火箭靴 30t/格，2+=15t/格）
  autoJump?: number;     // bool（值=1/undefined，JSON 序列化 null→parseFloat→NaN? 见提取器）
  fireWalk?: number;     // 陨石/狱岩灼伤免疫
  noKnockback?: number;  // 击退免疫（钴护盾族）
  noFallDmg?: number;    // 摔伤免疫（幸运马掌族）
  desertBoots?: number;
  waterWalk?: number;    // 水面行走
  waterWalk2?: number;
  jumpBoost?: number;    // 气球跳跃增强
  panic?: number;        // 受击移速爆发（恐慌项链）
  starCloak?: number;    // 受击落星（星星斗篷）
  carpet?: number;       // 飞毯（水平滑翔，待滑翔系统）
  jumpOpts?: string[];   // 多段跳选项（Cloud/Blizzard/Sandstorm/Fart/Tsunami/…）
  // ---- 三轮（冲刺/闪避/蜜蜂）----
  dashType?: number;     // 1=忍者足具/水晶刺客 2=克苏鲁护盾（冲撞带伤害）
  blackBelt?: number;    // 10% 闪避（Player.Hurt :9772）
  bees?: number;         // 蜂窝/蜂巢背带：受击放蜂
  spikedBoots?: number;  // 冰刀（攀冰，暂存）
}

const FX = fxJson as Record<string, AccFx>;

const FX_BY_IID = (() => {
  const m = new Map<number, AccFx>();
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    const vid = d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    if (vid < 0) continue;
    const fx = FX[String(vid)];
    if (fx) m.set(i, fx);
  }
  return m;
})();

export function accFxOfInternal(id: number): AccFx | null {
  return FX_BY_IID.get(id) ?? null;
}
