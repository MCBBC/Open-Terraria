// 弹幕通用湿段共享体（Projectile.cs:16903-17113 全体弹共用段 1:1——2026-09-04
// 溅花缺口全面清偿批抽出；GrenadeProj 先行移植版(grenadeWetSection)的同源泛化,
// 专属弹实体类(Boomerang/Yoyo/BallProjs/ChumBucket/FallingStar/...)逐类接入）。
//
// 原版本段对【所有】非 ignoreWater 弹逐 update 维护（:16895 `if (!ignoreWater)`
// 整段门）:四液旗置位/三清、入水/出水溅花(wetCount==0 门)、wetCount 冷却窗、
// IsDestroyedByWater 消亡、2 燃烧箭变型、34 火鞭浆穿、80 冰块浆中 Kill、
// 155 沙滩球入水免溅+出水 vy×0.5 特支。豁免 = SetDefaults 显式 ignoreWater=true
// 的 270 id（缺行=不豁免,与原版缺省 false 同向;270=2026-09-02 F3③ 提取审计终值,
// 旧注 264 系漂移）。豁免弹湿段整段跳过,但出生预置（:10886-10893）无条件跑——
// wet 被 :10888-10891 反清,honeyWet/shimmerWet 照写（原文无条件赋值,无豁免支）。
// ★2026-09-08 残差五件批④：豁免四型出生预置面开始有宿主承接——RainCloudProj
// 238/244/239/245（aiStyle45,AI_045 零湿旗消费=惰性面）aiRain/aiDrop 头调共享体,
// 豁免早退下落预置+:17114 shimmerWet 门（缺省支无动作,不接 shimmer 钩）。
// 另 :16891-16894 三型前置换位（242/302/638 每子步 wet=false）在本函数内照抄,
// 位次=预置后/整段门前（原文=Update 子步循环内 AI 后/:16895 前,豁免弹亦跑）。
// 位序（原版 Update 内）: AI → 本湿段(:16903) → HandleMovement(:17120,湿阻尼
// ×0.5/0.25/0.375 只进位移)。接入类按此序调用:AI(读上拍字段) → 本函数 → 移动;
// 类结构无法拆分时可在 tick 头调用(测试位=上拍位移后同位不变,AI 读同拍旗——
// 仅当该类 AI 无湿旗消费者时语义等价,须在类注记记)。
// 溅花尘/音 = wetSplashStepShared(Arrow.ts 共享体,逐值注在彼处)。
import type { GameHooks } from './types';
import type { TileStore } from '../world/TileStore';
import { LIQUID_TYPE } from '../world/TileStore';
import { TILE } from '../core/constants';
import { wetCollision, lavaCollision } from './npcLiquid';
import { wetSplashStepShared } from './Arrow';

/** ProjectileID.Sets.IsDestroyedByWater（ProjectileID.cs:287）——水(非岩浆/非蜂蜜
 *  豁免语义=仅排 lavaWet 粘滞)触即 Kill 六型;:16921-16926 消亡面 */
export const PROJ_DESTROYED_BY_WATER: ReadonlySet<number> = new Set([85, 15, 188, 34, 1097, 1106]);

// ==================================================================================
// ⑧Shimmer() 弹幕微光行为（Projectile.Shimmer P.cs:22564-22719 1:1 分派骨架）
// ----------------------------------------------------------------------------------
// 调用位 Update :17114-17117 `if (shimmerWet) Shimmer();`——湿段(:16895-17113)之后 /
// HandleMovement(:17122) 之前,全体弹逐子步;关键位次:该调用在 `if (!ignoreWater)`
// 整段门【外】(:17113 门闭合,:17114 即出)——豁免弹出生预置无条件写下的 shimmerWet
// (NewProjectile :10893)同样驱动本步,且湿段三清(:17103-17108)对豁免弹整段跳过=
// 旗终身不清,原文即如此（两个调用位见本文件段尾 + Arrow.wetSectionStep 尾）。
//
// 逐支结构（分支互斥 if/else 链,顺序即优先级;缺省支=无 :22719 链尽即出不动作）：
//   头门 :22566-22569  hostile && aiStyle∉{25,17} → 早退（敌对弹全域拦,召唤浮升两
//                      AI 族豁免）;aiStyle99 && ai[0]==-1 → 早退（悠悠球收回态）;
//                      aiStyle15 && ai[0]∈{2,4} → 早退（链球回拉/回收态）
//   type 502 :22570    vy-=0.4 + timeLeft-=5（弱浮升+短衰变特案）
//   {469,181,566} :22575  vy-=0.2;469 且 vy<0 → Kill（上浮出微光即灭）
//   箭族 20 id :22583  {819,117,474,225,103,2,82,120,172,41,91,278,5,639,631,495,4,
//                      282,1,81} vy-=0.4（箭族整体微光上浮）
//   相刃 19 id :22587  IsAPhaseblade{1059-1072,1074-1076,1101,1102}:ai[0]==1 → 早退;
//                      ai[1]=ai[0]=0;vy>-11 时(>16 先 ×0.9)vy-=0.5;vx×1.1 钳 ±14
//   弹反族 A :22606    aiStyle{1,16,40}||type 229:深浸(判定格满格微光+上一格微光)
//                      → Kill;否则 vy>0 → vy×-1 弹反出微光 + timeLeft>600→600 且
//                      -=60 + shimmerWet/wet 双清（旗清=弹反当拍即离微光域）
//   弹反族 B :22627    aiStyle{5,8,21,28,29,33,36,47,93,115,151,152}||{1024,669}:
//                      同弹反族 A 但【无】timeLeft 面（不钳不减）
//   aiStyle 15 :22643  链球:vy>0 → vy×-1;vy-=0.4 钳 ≥-8（旗不清）
//   aiStyle 99 :22656  悠悠球:vy>0 → vy×-1 + 双清旗;vy>-8 → -8（强制上收）
//   沉没族 :22670      aiStyle{7,9,13,35,53,197,130,134,137,138,149,160,204} → Kill
//   aiStyle 2 :22674   投掷族:vy-=0.7 浮升;936 微光气球解锁支(!unlocked && vy<0 →
//                      timeLeft>5→5 + netMode!=1 内置旗 NewNPC 681 借速)否则
//                      timeLeft-=20 加速衰变
//   aiStyle{14,16} :22699  timeLeft>3000 → -=60;vy-=0.5
//   aiStyle{25,17} :22707  召唤弹浮升:vy>10 先 ×0.97;vy-=0.7 钳 ≥-10
//   缺省 :22719        链尽即出=无动作
//
// 实体面缺面登记（2026-09-07 移植批,禁止猜缺省——缺面支不跑,消费域扩展时先补面）：
//   · Arrow.ts 调用位=全量面（killNow/shimmerUnlock(936)/life≡timeLeft/vx·vy/wet 旗
//     /ai0·ai1 可选域缺省 0=原版 float[] 缺省——本类承载域无 99/15/相刃 id,三面零
//     消费=死码登记）。B1-X3 既有 936 mid-AI 特支块随本泛化收口（避免 vy-=0.7 双跑）。
//   · 共享体调用位经 hooks.shimmer 全步回调（宿主组装 ProjShimmerFace+回写,范本=
//     Arrow 调用位/Boomerang 组装位）。已接面：Arrow（全量面）/Boomerang/
//     WeaponProj 四域组装位/PortalGunBolt 601（aiStyle1 弹反族 A,2026-09-08 残差
//     五件批①接,面适配注 PortalGunBolt.wetSectionStep）。现役共享消费域命中支而
//     未传面=登记不跑：GrenadeProj aiStyle16（弹反族 A,含 229 型特案域）/FlailProj
//     15/YoyoProj 99/相刃 1059-1102（aiStyle3 域,若由 WeaponProj 承载）/MinionProj
//     25·17 域/aiStyle14 域/TrapShot 装置弹 601 变体（Dart.ts trapWetProjId 同 id
//     双载体,域外件同批未触）——弹幕微光行为对这些族暂缺,属玩家可感面残留,
//     扩面时逐类接 shimmer 回调。
//   · netUpdate/SendData(7)/CheckAchievement_RealEstateAndTownSlimes=联机与成就记账
//     面,本仓单模式无对应字段（936 解锁回调内置旗由 world.flags 承载,城镇入住由
//     Main.cs:66913 townNPCCanSpawn 等价门承载——B1-X3 既案）。

/** ProjectileID.Sets.IsAPhaseblade（ProjectileID.cs:33,19 id）——Shimmer :22587 相刃支 */
export const PROJ_SHIMMER_PHASEBLADES: ReadonlySet<number> = new Set([
  1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072,
  1075, 1076, 1101, 1102, 1074,
]);

/** :22583 箭族 20 id（微光中整体上浮 vy-=0.4;2 燃烧箭变型 1 后仍在此域=原版同域） */
export const PROJ_SHIMMER_ARROWLIKE: ReadonlySet<number> = new Set([
  819, 117, 474, 225, 103, 2, 82, 120, 172, 41, 91, 278, 5, 639, 631, 495, 4, 282, 1, 81,
]);

/** :22627 弹反族 B 的 aiStyle 面（无 timeLeft 面;1024/669 为 id 特案随支） */
export const PROJ_SHIMMER_BOUNCE_B_AISTYLES: ReadonlySet<number> = new Set([
  5, 8, 21, 28, 29, 33, 36, 47, 93, 115, 151, 152,
]);

/** :22670 微光沉没族（入微光即 Kill,无浮升面） */
export const PROJ_SHIMMER_SINK_AISTYLES: ReadonlySet<number> = new Set([
  7, 9, 13, 35, 53, 197, 130, 134, 137, 138, 149, 160, 204,
]);

/** Shimmer() 实体面（原版对 this 的直读直写;各宿主字段名不一 → 调用位适配对象组装）。
 *  可选回调缺省=宿主无该实体面,对应支登记不跑（见上登记注,禁止猜缺省）。 */
export interface ProjShimmerFace {
  readonly projId: number;
  /** Projectile.aiStyle（SetDefaults 面;projectileData 缺行传 -1=恒不中 aiStyle 支） */
  readonly aiStyle: number;
  /** Projectile.hostile（:22566 头门;反射转 hostile 等动态面由宿主实时承载） */
  readonly hostile: boolean;
  /** velocity.X/Y（浮升/弹反/相刃加速直写——调用位回写宿主字段） */
  vx: number;
  vy: number;
  /** timeLeft（502 −5/弹反族 A 600 钳+−60/aiStyle2 −20 与 936 钳 5/14·16 −60 直写） */
  timeLeft: number;
  /** ai[0]/ai[1]（头门 99·15 支只读;相刃支写 0。宿主 AI 态域须如实承载;无 AI 态域
   *  传 0=原版 float[] 缺省——对 Arrow 域 99/15/相刃三面零消费,死码登记） */
  ai0: number;
  ai1: number;
  /** wet/shimmerWet（弹反族 A·B/99 支写 false=弹反当拍出微光——调用位回写宿主湿旗） */
  wet: boolean;
  shimmerWet: boolean;
  /** NPC.unlockedSlimeRainbowSpawn（:22676 936 解锁支选择子只读;world.flags 承载） */
  readonly rainbowSlimeUnlocked: boolean;
  /** Kill()（:22578-22580 469 上浮 Kill/:22610·22631 深浸 Kill/:22670-22672 沉没族
   *  Kill;缺省=宿主无消亡面,Kill 支登记不跑） */
  kill?(): void;
  /** 936 解锁半边（:22683-22692 netMode!=1 内段:置世界旗+SendData(7)+NewNPC 681 借速
   *  +成就记账;timeLeft>5→5 钳在分派体内:22579-22582。缺省=宿主无解锁面,登记不跑） */
  unlockRainbowSlime?(): void;
}

/** 深浸判定（:22598-22600 与 :22629-22631 同式）：判定列=Center.X/16、判定行=
 *  position.Y/16（C# (int) 截断=trunc;TILE=16=原文 /16f),该格 liquid==255 满格
 *  微光 + 上一格 liquid>0 微光 → Kill（满格液柱下沿双格采样=整柱浸没近似,
 *  Main.tile!=null/WorldGen.InWorld 门=本仓 inBounds）。 */
function shimmerDeepImmersed(st: TileStore, centerX: number, posY: number): boolean {
  const tx = Math.trunc(centerX / TILE);
  const ty = Math.trunc(posY / TILE);
  if (!st.inBounds(tx, ty) || !st.inBounds(tx, ty - 1)) return false;
  const idx = st.idx(tx, ty);
  const up = st.idx(tx, ty - 1);
  return st.liquid[idx] === 255 && st.liquidType[idx] === LIQUID_TYPE.SHIMMER
    && st.liquid[up] > 0 && st.liquidType[up] === LIQUID_TYPE.SHIMMER;
}

/** Projectile.Shimmer()（P.cs:22564-22719 逐支 1:1——结构表见文件头 ⑧ 段）。
 *  输入 face=宿主适配实体面;posX/posY=position(盒左上)、centerX=Center.X
 *  （深浸判定格取 CenterX/16 列 × positionY/16 行）。 */
export function projShimmerStep(
  face: ProjShimmerFace,
  st: TileStore,
  posX: number, posY: number, centerX: number,
): void {
  const aiStyle = face.aiStyle;
  // :22566-22569 头门（敌对全域拦/悠悠球收回态/链球回拉回收态）
  if ((face.hostile && aiStyle !== 25 && aiStyle !== 17)
    || (aiStyle === 99 && face.ai0 === -1)
    || (aiStyle === 15 && (face.ai0 === 2 || face.ai0 === 4))) {
    return;
  }
  if (face.projId === 502) {                                          // :22570-22573
    face.vy -= 0.4;
    face.timeLeft -= 5;
  } else if (face.projId === 469 || face.projId === 181 || face.projId === 566) {   // :22575-22581
    face.vy -= 0.2;
    if (face.projId === 469 && face.vy < 0) face.kill?.();            // :22578-22580
  } else if (PROJ_SHIMMER_ARROWLIKE.has(face.projId)) {               // :22583-22585
    face.vy -= 0.4;
  } else if (PROJ_SHIMMER_PHASEBLADES.has(face.projId)) {             // :22587-22604
    if (face.ai0 === 1) return;                                       // :22589-22591
    face.ai1 = 0;                                                     // :22592
    face.ai0 = 0;                                                     // :22593
    if (face.vy > -11) {                                              // :22594-22600
      if (face.vy > 16) face.vy *= 0.9;
      face.vy -= 0.5;
    }
    face.vx *= 1.1;                                                   // :22601
    face.vx = Math.min(14, Math.max(-14, face.vx));                   // :22602 Utils.Clamp
  } else if (aiStyle === 1 || aiStyle === 16 || aiStyle === 40 || face.projId === 229) {   // :22606-22625
    if (shimmerDeepImmersed(st, centerX, posY)) {
      face.kill?.();                                                  // :22603-22605 → :22608-22610
    } else if (face.vy > 0) {
      face.vy *= -1;                                                  // :22613
      // netUpdate = true（:22614 联机位,本仓无此字段=零移植面）
      if (face.timeLeft > 600) face.timeLeft = 600;                   // :22615-22617
      face.timeLeft -= 60;                                            // :22618
      face.shimmerWet = false;                                        // :22619
      face.wet = false;                                               // :22620
    }
  } else if (PROJ_SHIMMER_BOUNCE_B_AISTYLES.has(aiStyle) || face.projId === 1024 || face.projId === 669) {   // :22627-22641
    if (shimmerDeepImmersed(st, centerX, posY)) {
      face.kill?.();                                                  // :22629-22631
    } else if (face.vy > 0) {
      face.vy *= -1;                                                  // :22634
      face.shimmerWet = false;                                        // :22636
      face.wet = false;                                               // :22637
    }
  } else if (aiStyle === 15) {                                        // :22643-22654
    if (face.vy > 0) face.vy *= -1;                                   // :22645-22648
    face.vy -= 0.4;                                                   // :22650
    if (face.vy < -8) face.vy = -8;                                   // :22651-22653
  } else if (aiStyle === 99) {                                        // :22656-22668
    if (face.vy > 0) {
      face.vy *= -1;                                                  // :22659
      face.shimmerWet = false;                                        // :22661
      face.wet = false;                                               // :22662
    }
    if (face.vy > -8) face.vy = -8;                                   // :22665-22667
  } else if (PROJ_SHIMMER_SINK_AISTYLES.has(aiStyle)) {               // :22670-22672
    face.kill?.();
  } else if (aiStyle === 2) {                                         // :22674-22697
    face.vy -= 0.7;                                                   // :22676
    if (face.projId === 936 && !face.rainbowSlimeUnlocked && face.vy < 0) {   // :22677-22679
      if (face.timeLeft > 5) face.timeLeft = 5;                       // :22680-22682
      face.unlockRainbowSlime?.();                                    // :22683-22692（netMode!=1 内段→宿主回调）
    } else {
      face.timeLeft -= 20;                                            // :22696
    }
  } else if (aiStyle === 14 || aiStyle === 16) {                      // :22699-22705
    if (face.timeLeft > 3000) face.timeLeft -= 60;                    // :22701-22703
    face.vy -= 0.5;                                                   // :22704
  } else if (aiStyle === 25 || aiStyle === 17) {                      // :22707-22718
    if (face.vy > 10) face.vy *= 0.97;                                // :22709-22711
    face.vy -= 0.7;                                                   // :22712
    if (face.vy < -10) face.vy = -10;                                 // :22713-22715
  }
  // 缺省支=无（:22719 链尽即出,不动作）
}

/** 通用湿段旗持有者（各弹实体类以同名字段承载,GrenadeProj/接入类同形） */
export interface ProjWetFlags {
  wet: boolean;
  lavaWet: boolean;
  honeyWet: boolean;
  shimmerWet: boolean;
  /** 出水溅花冷却窗（Projectile.wetCount 同名 :16984 置 10 / :17109-17112 逐子步 −1） */
  wetCount: number;
  /** 出生预置已做（一次;NewProjectile :10886-10893 等价——首拍=出生盒同位同液态;
   *  ★2026-09-06 逐字面化:豁免弹也跑预置（honey/shimmer 无条件写,wet 反清） */
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
  /** ⑧:17114-17117 Shimmer() 全步回调（湿段后/整段门【外】=豁免弹亦跑——本函数内
   *  两调用位已收口,宿主只需组装 ProjShimmerFace+projShimmerStep+字段回写,范本=
   *  Arrow.wetSectionStep 尾调用位）。缺省=宿主未接面,该宿主域微光行为登记不跑
   *  （中央登记清单见 projShimmerStep 头注;禁止猜缺省）。 */
  shimmer?: (st: TileStore, x: number, y: number, w: number, h: number) => void;
}

/** 水中位移阻尼档（HandleMovement :17721-17764）：微光 0.375 / 蜂蜜 0.25 / 水 0.5 /
 *  干 1。速度【场】不减、只削当拍位移（wetVelocity = velocity×factor 后仅进
 *  UpdatePosition,velocity 字段本身不被水阻改写）。消费位=宿主移动处:
 *  moveAndCollide 契约下乘进 dx/dy 入参（b.vx/vy=碰撞调整字段,采纳处原样回读,
 *  ★勿在采纳处除回——body 初值=全场速度,除回=速度场指数爆炸）;直积分宿主乘进
 *  `x += vx` 位移行。
 *  ★残差登记（2026-09-06,预置逐字面化批移交）：原文 wetVelocity 只在
 *  HandleMovement :17721 `else if (wet)` 支内按档赋值、只在 UpdatePosition
 *  :20555 `if (wet) position += wetVelocity` 消费——即 wet=false 时蜂蜜/微光档
 *  原文【不可达】（恒全速）。本函数契约（tests/proj-wet-ball-chum.test.ts:238-239
 *  钉）对 wet=false+honey/shimmer 仍返档位值;出生预置逐字面化（:10892-10893 豁免
 *  弹亦写 honey/shimmer）后该态在豁免弹上真实出现 → 豁免弹蜂蜜/微光出生吃档位
 *  阻尼=本仓多阻尼残差（原版全速,Flags 恒不更新=终身带档）。修法=wet 前置门 +
 *  ball-chum 两钉改写,移交阻尼档属主批（非本批刀面,勿在本函数私改破钉）。 */
export function projWaterDragFactor(flags: Pick<ProjWetFlags, 'wet' | 'honeyWet' | 'shimmerWet'>): number {
  // ★wet 前置门(2026-09-06 红蓝轮③清偿):原文阻尼算式整体在 HandleMovement
  //  :17721 `else if (wet)` 支内、消费在 UpdatePosition :20555 `if (wet)`——wet=false
  //  时蜂蜜/微光档【原文不可达】(恒全速)。预置逐字面化后"豁免弹出生带 honey/
  //  shimmer 旗而 wet=false"态真实存在,旧实现对该态返档位值=多阻尼残差。
  return flags.wet ? (flags.shimmerWet ? 0.375 : flags.honeyWet ? 0.25 : 0.5) : 1;
}

/** 通用湿段（:16895-17113 逐值 1:1;溅花面=wetSplashStepShared,档位/数值/音效注在彼处）。
 *  调用序约定见文件头。首次调用先做出生预置（NewProjectile :10886-10893 逐字面——
 *  ★2026-09-06 逐字面化（红队 R1+R2）:①全体弹无条件跑（旧版豁免弹整段跳过=漏
 *  honey/shimmer 写）;②honeyWet/shimmerWet 无条件【赋值】（原文 :10892-10893 无
 *  豁免支）;③wet=出生盒 WetCollision 值 + ignoreWater 反清（:10887-10891）;
 *  ④lavaWet 原文本点【不写】——首子步湿段 :16906-16911 在消亡判定 :16921 前并入
 *  （本函数段体紧随预置同位跑,同拍等价;旧"预置携带 tick1 档 lavaWet"随预置
 *  逐字面化退役,与 Arrow.ts 预置批同步）。原版 NewProjectile 时点,首拍未移动=
 *  同位 ✔。
 *  段内特支（34/80/2/155/242/302/638/IsDestroyedByWater）按原文字面全量实现,
 *  宿主 id 不在域时自然不触发（死码照抄,勿裁——扩表防静默缺面）。 */
export function projectileWetSection(
  flags: ProjWetFlags,
  game: GameHooks,
  st: TileStore,
  x: number, y: number, w: number, h: number,
  projId: number,
  ignoreWater: boolean,
  hooks?: ProjWetHooks,
): void {
  if (!flags.presetDone) {   // 出生预置（:10886-10893 逐字面;豁免弹亦跑,见上注④③②①）
    flags.presetDone = true;
    const rW = wetCollision(st, x, y, w, h);
    flags.wet = rW.wet;                                   // :10887
    if (ignoreWater) flags.wet = false;                   // :10888-10891（豁免只反清 wet）
    flags.honeyWet = rW.honey;                            // :10892 无条件赋值（原文字面）
    flags.shimmerWet = rW.shimmer;                        // :10893 无条件赋值（lavaWet 不写,见上注④）
  }
  // :16891-16894 三型前置换位——242 高速子弹 / 302 狙击弹 / 638 月主炮弹每子步
  // AI 后/湿段前 wet=false。位在豁免整段门【外】=豁免弹亦跑（照抄原文位次:
  // Update 子步循环内 :16891 → :16895 `if (!ignoreWater)`）。★双重死码：三型数据面
  // 均为豁免弹（vanilla-projectiles 242/302/638 ignoreWater=true）→ 原文此清位对其
  // 本就冗余（预置 :10888-10891 已反清 wet+段体整跳）,且共享体现役消费域无此三型
  // ——照抄防静默缺面（与 34/80 同规则）。
  if (projId === 242 || projId === 302 || projId === 638) flags.wet = false;
  if (ignoreWater) {                                      // :16895 整段门（预置已按 :10886-10893 落账）
    // ★⑧:17114-17117 在整段门【外】——豁免弹出生预置写下的 shimmerWet 驱动 Shimmer()
    // （原文湿段三清对豁免弹不跑=旗终身不清;两调用位同式收口见段尾）
    if (flags.shimmerWet) hooks?.shimmer?.(st, x, y, w, h);
    return;
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
  // ★⑧:17114-17117 `if (shimmerWet) Shimmer()`——湿段后/HandleMovement 前,逐子步
  //  一次（原文位次=本段之后、位移之前;面/登记见 ProjWetHooks.shimmer 与
  //  projShimmerStep 头注）
  if (flags.shimmerWet) hooks?.shimmer?.(st, x, y, w, h);
}
