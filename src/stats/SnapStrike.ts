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
//  ★1457 编排器对齐（2026-08-23）：命中尘 = Spawn_SnappingStone{,Melee,Summon}
//  （ParticleOrchestrator.cs:593-812）Dust 段 1:1 入 vanillaDust 池（见
//  snapStrikeDust）；FadingParticle/PrettySparkle 环带 + 三音效登记未接（编排器
//  粒子类型本仓无池）。受击者自身脉冲（Projectile.cs:14432-14437 victim.Center）
//  调用侧无盒径参数,登记。
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
    // ★1457 编排器粒子尘链等价（Spawn_SnappingStone{,Melee,Summon}）——位置取目标
    //  中心（原版 = lerp(盒内随机点, Center, 0.6)，备案）；FadingParticle/PrettySparkle
    //  环带 + 音效（Item72/PyroclasticStone/ArmletOfRuin）登记未接
    snapStrikeDust(game, kind, t.cx, t.cy, Math.hypot(t.w ?? 16, t.h ?? 16) / 2);
  }
  return strikes > 0;
}

/**
 * ★1457 拍击石系命中尘（ParticleOrchestrator.cs 三 Spawn 的 Dust 段 1:1；
 *  编排器粒子类型 FadingParticle/PrettySparkle 本仓无池,环带视觉登记未接）：
 *  kind0 拍击石（:593-646）num=钳(MovementVector.X/256,≤0.12)——20 颗 2/3→226
 *  否则 15,velocity×64num,noGravity,scale1,fadeIn 1.5→0,noLight;226 再 ×0.5 速、
 *  1/6 恢复重力再 ×0.5 速、noLightEmittance;
 *  kind1 焰爆石（:649-732）4 颗 6 沿 ±bolt 向 ±0.025·2π·rand 旋转 ×NextFloat 速,
 *  noGravity scale1.4（bolt 基角 = NextFloatDirection×2π×0.05 + π/4·(1|2)）;
 *  kind2 毁灭臂镗（:734-812）15 颗 172 + 8 颗 211,Circular(10,10) 速,
 *  scale=max(0.75,20num),noGravity,1/6 重力 + scale×0.25
 */
function snapStrikeDust(game: GameHooks, kind: 0 | 1 | 2, x: number, y: number, sizeHalf: number): void {
  const pool = game.vanillaDust;
  if (!pool) return;
  const rand = Math.random;
  if (kind === 0) {
    const num = Math.min(0.12, (sizeHalf * (0.3 + 1.4 * rand())) / 256);   // :600-605
    for (let j = 0; j < 20; j++) {
      const chloro = Math.floor(rand() * 3) !== 0;                 // Next(3)!=0 → 226
      const d = pool.spawn(x, y, 0, 0, chloro ? 226 : 15);
      if (!d) continue;
      d.vx *= 64 * num;                                            // :633 velocity *= 64f*num
      d.vy *= 64 * num;
      d.noGravity = true;
      d.scale = 1;
      d.fadeIn = 0;                                                // :636-638 终值 0（1.5 被覆写）
      d.noLight = true;
      if (chloro) {                                                // :639-647
        d.vx *= 0.5;
        d.vy *= 0.5;
        if (Math.floor(rand() * 6) === 0) {
          d.noGravity = false;
          d.vx *= 0.5;
          d.vy *= 0.5;
        }
        d.noLightEmittance = true;
      }
    }
    return;
  }
  if (kind === 1) {
    const base = (rand() * 2 - 1) * Math.PI * 2 * 0.05;            // :665 num4
    for (let n = 1; n < 2; n++) {                                  // :668 num5 单值 1
      const dir = Math.PI / 4 + Math.PI / 4 * n + base;            // vector3 角
      for (let i = 0; i < 2; i++) {                                // :722-731 双向各 2 颗
        for (const s of [1, -1]) {
          const a = dir * s + (rand() * 2 - 1) * Math.PI * 2 * 0.025;
          const d = pool.spawn(x, y, 0, 0, 6, Math.cos(a) * rand(), Math.sin(a) * rand());
          if (!d) continue;
          d.noGravity = true;
          d.scale = 1.4;
        }
      }
    }
    return;
  }
  // kind2：num = 1→钳 0.12（:738/:743-745 反编译字面）→ scale = max(0.75, 2.4)
  for (const [count, type] of [[15, 172], [8, 211]] as const) {    // :779-812
    for (let k = 0; k < count; k++) {
      const d = pool.spawn(x, y, 0, 0, type,
        (rand() * 2 - 1) * 10, (rand() * 2 - 1) * 10);             // NextVector2Circular(10,10)
      if (!d) continue;
      d.scale = Math.max(0.75, 20 * 0.12);
      d.noGravity = true;
      if (Math.floor(rand() * 6) === 0) {
        d.noGravity = false;
        d.scale *= 0.25;
      }
    }
  }
}
