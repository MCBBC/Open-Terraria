// 拍击石系三脉冲（Projectile.TryMakingSnappingStoneStrike 1457 :14347-14420 1:1）：
//  6167 拍击石   kind 0（ranged 命中触发 :13443-13446）——30×rangedDamage/120px/2 目标
//                【消费端已接 entities/Arrow.ts 通用命中环：!hostile（≈ownedBySomeone）
//                + projectileData.ranged 位门】
//  6178 焰爆石   kind 1（melee|ranged 命中触发 :13439-13442）——45×meleeDamage/300px/
//                弹 1131 + 目标 323 Hellfire 180t（:14396-14401）
//  6179 毁灭臂镗 kind 2（tag 命中触发 :13447-13450）——150×minionDamage/400px/弹 1132
//  共用冷却 Player.accSnappingStoneCooldown=360t（:14382-14383,Player.ts:571 字段/
//  :3837 逐 t 递减——Update_SnappingStone :28592-28604 同款）;命中盒外目标取
//  FindTargetWithLineOfSight（:14405-14412,至多 num2=2 个,跳过本次受击者）。
//  弹 1121/1131/1132 timeLeft=2 速 UnitY×0.1（:14413-14416）——本仓 Arrow 直生近似。
import type { GameHooks } from '../entities/types';
import type { Player } from '../entities/Player';
import { Arrow } from '../entities/Arrow';
import { playerCanHitEnemy } from '../entities/projTargets';

export interface SnapStrikeTarget {
  id: number;
  x: number; y: number; w: number; h: number; cx: number; cy: number;
  dead: boolean;
  realLife?: number | null;
  onFire3T?: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean;
}

/** TryMakingSnappingStoneStrike（:14347-14420）。victim = 本次受击者（跳过）;
 *  返回是否触发（冷却命中/无目标 = false） */
export function trySnapStrike(
  game: GameHooks,
  owner: Player | null,
  kind: 0 | 1 | 2,
  hx: number,
  hy: number,
  victimId: number,
): boolean {
  if (!owner || owner.accSnappingStoneCooldown > 0) return false;   // :14352-14354
  const eq = owner.equipStats;
  // 门：kind 对应饰品在身（调用侧已门,此处兜底）
  if (kind === 0 && !eq.accSnappingStone) return false;
  if (kind === 1 && !eq.accPyroclast) return false;
  if (kind === 2 && !eq.accArmletOfRuin) return false;
  let dmg = 30;            // num（:14356）
  let maxRange = 120;      // maxRange
  const maxTargets = 2;    // num2
  let projId = 1121;
  if (kind === 0) {
    dmg = Math.trunc(30 * (1 + eq.dmgRanged));                    // ×rangedDamage（:14358）
  } else if (kind === 1) {
    dmg = Math.trunc(45 * (1 + eq.dmgMelee));                     // num=45 ×meleeDamage（:14360-14362）
    maxRange = 300;
    projId = 1131;
  } else {
    dmg = Math.trunc(150 * owner.summonDamageMult);               // num=150 ×minionDamage（:14364-14366）
    maxRange = 400;
    projId = 1132;
  }
  owner.accSnappingStoneCooldown = 360;                            // :14382-14383
  const add = (e: unknown) =>
    (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'projectiles');
  let strikes = 0;
  for (const ent of game.enemies()) {
    if (strikes >= maxTargets) break;
    const t = ent as unknown as SnapStrikeTarget;
    if (t.dead || t.id === victimId) continue;                     // skipTargets（:14372-14376）
    if (!playerCanHitEnemy(ent, game, projId)) continue;           // FindTargetWithLineOfSight 敌对门
    if (Math.hypot(t.cx - hx, t.cy - hy) > maxRange) continue;
    strikes++;
    // NewProjectile(nPC.Center, UnitY*0.1, projId, dmg, kb 5) + timeLeft=2（:14413-14416）
    add(new Arrow(t.cx, t.cy - 4, 0, 0.1, dmg, 5, projId, null, { grav: 0, life: 2, pierce: 1 }));
    if (kind === 1) t.onFire3T = Math.max(t.onFire3T ?? 0, 3);     // AddBuff(323,180)=3s（:14399）
    game.spawnParticles?.(t.cx, t.cy, kind === 2 ? '#6080FF' : '#C8C8FF', 6, 2.4, { life: 16 });
  }
  return strikes > 0;
}
