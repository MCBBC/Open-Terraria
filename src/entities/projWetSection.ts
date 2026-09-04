// 弹幕通用湿段共享体（Projectile.cs:16903-17113 全体弹共用段 1:1——2026-09-04
// 溅花缺口全面清偿批抽出；GrenadeProj 先行移植版(grenadeWetSection)的同源泛化,
// 专属弹实体类(Boomerang/Yoyo/BallProjs/ChumBucket/FallingStar/...)逐类接入）。
//
// 原版本段对【所有】非 ignoreWater 弹逐 update 维护（:16903 `if (!ignoreWater)`
// 整段门）:四液旗置位/三清、入水/出水溅花(wetCount==0 门)、wetCount 冷却窗、
// IsDestroyedByWater 消亡、2 燃烧箭变型、34 火鞭浆穿、80 冰块浆中 Kill、
// 155 沙滩球入水免溅+出水 vy×0.5 特支。豁免 = SetDefaults 显式 ignoreWater=true
// 的 264 id（缺行=不豁免,与原版缺省 false 同向）。
// 位序（原版 Update 内）: AI → 本湿段(:16903) → HandleMovement(:17120,湿阻尼
// ×0.5/0.25/0.375 只进位移)。接入类按此序调用:AI(读上拍字段) → 本函数 → 移动;
// 类结构无法拆分时可在 tick 头调用(测试位=上拍位移后同位不变,AI 读同拍旗——
// 仅当该类 AI 无湿旗消费者时语义等价,须在类注记记)。
// 溅花尘/音 = wetSplashStepShared(Arrow.ts 共享体,逐值注在彼处)。
import type { GameHooks } from './types';
import type { TileStore } from '../world/TileStore';
import { wetCollision, lavaCollision } from './npcLiquid';
import { wetSplashStepShared } from './Arrow';

/** ProjectileID.Sets.IsDestroyedByWater（ProjectileID.cs:287）——水(非岩浆/非蜂蜜
 *  豁免语义=仅排 lavaWet 粘滞)触即 Kill 六型;:16921-16926 消亡面 */
export const PROJ_DESTROYED_BY_WATER: ReadonlySet<number> = new Set([85, 15, 188, 34, 1097, 1106]);

/** 通用湿段旗持有者（各弹实体类以同名字段承载,GrenadeProj/接入类同形） */
export interface ProjWetFlags {
  wet: boolean;
  lavaWet: boolean;
  honeyWet: boolean;
  shimmerWet: boolean;
  /** 出水溅花冷却窗（Projectile.wetCount 同名 :16984 置 10 / :17109-17112 逐子步 −1） */
  wetCount: number;
  /** 出生预置已做（一次;NewProjectile :10886-10892 等价——首拍=出生盒同位同液态） */
  presetDone: boolean;
}

export interface ProjWetHooks {
  /** :16923-16925 IsDestroyedByWater 命中 Kill（各实体自管消亡管线;域内类多无人命中=缺省不接） */
  kill?: () => void;
  /** :16929-16931 type 2 → 1 变型+light=0（2 燃烧箭落水变木箭;宿主为 Arrow 专属类,共享侧仅钩） */
  transformFlamingArrow?: () => void;
  /** :16940-16943 type 80 冰块浆中 Kill 判定的 ai[0]（≥0 才 Kill;缺省 undefined=恒不 Kill,80 无出生面=死码照抄） */
  iceBlockAi0?: number;
  /** :16980-16981 type 155 出水 velocity.Y×0.5（沙滩球;消费=宿主 vy 字段） */
  onBeachBallExit?: () => void;
}

/** 水中位移阻尼档（HandleMovement :17721-17764）：微光 0.375 / 蜂蜜 0.25 / 水 0.5 /
 *  干 1。速度【场】不减、只削当拍位移（wetVelocity = velocity×factor 后仅进
 *  UpdatePosition,velocity 字段本身不被水阻改写）。消费位=宿主移动处:
 *  moveAndCollide 契约下乘进 dx/dy 入参（b.vx/vy=碰撞调整字段,采纳处原样回读,
 *  ★勿在采纳处除回——body 初值=全场速度,除回=速度场指数爆炸）;直积分宿主乘进
 *  `x += vx` 位移行。 */
export function projWaterDragFactor(flags: Pick<ProjWetFlags, 'wet' | 'honeyWet' | 'shimmerWet'>): number {
  return flags.shimmerWet ? 0.375 : flags.honeyWet ? 0.25 : flags.wet ? 0.5 : 1;
}

/** 通用湿段（:16903-17113 逐值 1:1;溅花面=wetSplashStepShared,档位/数值/音效注在彼处）。
 *  调用序约定见文件头。首次调用先做出生预置（:10886-10892:出生盒同位 WetCollision
 *  首测 + lavaWet 粘滞首档——原版 NewProjectile 时点,首拍未移动=同位 ✔）。
 *  段内特支（34/80/2/155/IsDestroyedByWater）按原文字面全量实现,宿主 id 不在域时
 *  自然不触发（死码照抄,勿裁——扩表防静默缺面）。 */
export function projectileWetSection(
  flags: ProjWetFlags,
  game: GameHooks,
  st: TileStore,
  x: number, y: number, w: number, h: number,
  projId: number,
  ignoreWater: boolean,
  hooks?: ProjWetHooks,
): void {
  if (ignoreWater) { flags.presetDone = true; return; }   // :16903 整段门（预置同步跳过=原版 :10888-10890 只清 wet 同向）
  if (!flags.presetDone) {
    flags.presetDone = true;
    const rW = wetCollision(st, x, y, w, h);
    flags.wet = rW.wet;                                   // :10887
    if (lavaCollision(st, x, y, w, h)) flags.lavaWet = true;   // tick1 档粘滞（原版首子步 :16906 在消亡判定前并入）
    if (rW.honey) flags.honeyWet = true;
    if (rW.shimmer) flags.shimmerWet = true;
  }
  const rLava = lavaCollision(st, x, y, w, h);
  const rWet = wetCollision(st, x, y, w, h);
  if (rLava) flags.lavaWet = true;                        // :16906-16911 只置不清（粘滞）
  if (rWet.honey) flags.honeyWet = true;                  // :16912-16914
  if (rWet.shimmer) flags.shimmerWet = true;              // :16915-16918
  let flag2 = rWet.wet;
  if (flags.wet && !flags.lavaWet) {                      // :16921-16926 水death/变型
    if (PROJ_DESTROYED_BY_WATER.has(projId)) hooks?.kill?.();   // :16923-16925
    if (projId === 2) hooks?.transformFlamingArrow?.();         // :16929-16931（light=0 由宿主变型体承载）
  }
  if (projId === 34 && flags.lavaWet) {                   // :16933-16936 火鞭浆穿支
    flag2 = false;
    flags.wet = false;
    flags.lavaWet = false;                                // `flag2 = (wet = (lavaWet = false))`
  }
  if (projId === 80) {                                    // :16937-16944 IceBlock 支
    flag2 = false;
    flags.wet = false;
    if (rLava && (hooks?.iceBlockAi0 ?? -1) >= 0) hooks?.kill?.();
  }
  if (flag2) {                                            // :16935-16976 入水溅花支
    if (projId !== 155 && flags.wetCount === 0 && !flags.wet) {   // 155 入水免溅特例（:16948）
      wetSplashStepShared(game, x, y, w, h, rLava, false, flags.lavaWet, flags.shimmerWet, flags.honeyWet);
    }
    flags.wet = true;                                     // :17020
  } else if (flags.wet) {                                 // :16977-17102 出水支
    flags.wet = false;                                    // :17024
    if (projId === 155) hooks?.onBeachBallExit?.();       // :16980-16981 velocity.Y×0.5
    else if (flags.wetCount === 0) {                      // :17029-17031
      flags.wetCount = 10;
      wetSplashStepShared(game, x, y, w, h, rLava, true, flags.lavaWet, flags.shimmerWet, flags.honeyWet);
    }
  }
  if (!flags.wet) {                                       // :17103-17108 !wet 三清
    flags.lavaWet = false;
    flags.honeyWet = false;
    flags.shimmerWet = false;
  }
  if (flags.wetCount > 0) flags.wetCount--;               // :17109-17112
}
