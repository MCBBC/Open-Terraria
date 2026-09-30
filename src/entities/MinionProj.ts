// 召唤物实体（R6）：随从（飞行/地面）与哨兵（定点炮台）。
// 原版各随从 aiStyle（62/66/26/121/156/164/197…）行为高度定制（数值=武器 combat 表；
// 上限/驱逐/召回语义取 Player.maxMinions 链）：
//   AI_062 五射手（373/375/407/423/613）+ 963：1:1 逐型速度曲线/归位门/随机射击冷却
//           （1457 Projectile.cs:66067-67166，见 ai62Step/abigailBody 注）
//   flying：其余飞行族悬停玩家侧后环形槽位 → 锁定最近敌俯冲突进（接触伤害+同敌冷却）
//           → >2000px 瞬移回玩家（原版 minion 回收语义）
//   ground ：地面步行族走原版步行链（蜘蛛 390-392 AI_026 flag7 / 吸血蛙 758
//           AI_067 flag2 两结算段见 ai067WalkChase/spiderStep/frogStep 注;
//           沙漠虎 833-835 与海盗 393-395 亦于 2026-08-31 台账批归入正轨——
//           台账批①②,approx-registry「镇民/宠物」⑬）
//           其余残余地面型暂无在册武器命中（通用重力+碰撞追击兜底保留）
//   sentry ：定点（施法点）。aiStyle 53 三族 1:1（初冷 120、射速 60/60/90、扇区炮口）；
//            OOA 四塔（AI_130/134/137/138）与 aiStyle 123（月门/彩虹水晶）各按原版
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { BuffType } from '../stats/Buffs';
import { canHit, canHitLine, solidTileAt } from '../physics/LineOfSight';
import { Arrow, projFrameImg, projFrameCount, projSprite, projFrameSrcRect } from './Arrow';
import { dyeChannelsOf, getProjDesiredDyeVid, dyedProjCanvas, type DyeInvSource } from '../data/projDye';
import { projectileWetSection, projWaterDragFactor } from './projWetSection';
import { resolveWhipTagHit, SUMMON_TAG_MUL } from './WhipTag';
import { applyProjStatus } from './projStatus';
import { projDrawOffsetFor } from './WeaponProj';
import { ProjGhostRing, drawProjGhosts, projTrailingMode } from './projGhostTrail';   // ★BJ235 随从残影（533/755/833-835）
import { setTemporaryBubble, clearTemporaryBubble } from '../render/EmoteBubble';
import { hitCritters, applyBannerDamageDealt } from './projTargets';
import { projectileData } from '../data/vanillaProjectiles';
import { soundTrackFiles } from '../data/vanillaNpcs';
// DeadCellsMushroomBoiExplosion 编排（L5 批 2026-08-31——随从 owner 权威模拟侧广播补远端）
import { ParticleOrchestraType } from '../net/syncModules';
import { cattivaHitFx, stardustPunchFx } from '../fx/orchestraFx';   // δB B11：捣蛋猫命中六芒簇收编本体（Projectile.cs:14493）+ 星尘拳（:14331）
import { playerCanHitEnemy, canBeChasedBy, rollGolemSentryCrit } from './projTargets';
import { ITEM_DEFS } from '../data/items';
import { globalTimeWrappedHourly } from '../core/GameTime';   // ★BJ330 GTW 单源

import { MushroomBoiExplosionProj, requestMushroomBoiExplosion } from './DeadCellsMushroom';

/** 爆炸烈焰塔三档（3818/3819/3820 → proj 663/665/667，AI_130）：帧 0 待机、
 *  开火动画、第 12t 出火球（弹型/速度/周期/冷却按 FLAMEBURST_TIERS 分层） */
const FLAMEBURST_TOWER = new Set([663, 665, 667]);

/** 通用湿段服务域=1.4.5 新随从八型（红队 R3 定谳）+ 旧受段族十三型（蓝队 K
 *  2026-09-07 移交批接入;逐 id SetDefaults 豁免核对见 MinionProj 字段块头注——
 *  廿一型均无 ignoreWater 行=受段,豁免分流由 projectileData(id).ignoreWater
 *  数据面自动承载）。其余主类 id 本批不接（域外核对面见同注）。 */
const MINION_WET_IDS = new Set([
  1022, 1093, 1094, 1098, 1112, 1113, 1118, 1123,           // R3 八型
  317, 390, 391, 392, 393, 394, 395, 758, 833, 834, 835, 917, 1036,   // 旧受段族
]);
/** 弩车三档（AI_134 :65584/1457 :69584）：帧 0 待机、帧 1-5 开火（每 5t）、
 *  开火第 6t（ai[1]==5）出弩箭 680（速 16，T2 套装 21;num2=num6=5,num2 的初值 12 已被
 *  `num2 = num6` 覆写——旧"第12t"是初值误读,2026-08-31 批②修）、25t 结束、
 *  冷却 GetBallistraShotDelay */
const BALLISTA_TOWER = new Set([677, 678, 679]);
/** Utils.AngleLerp（Utils.cs:2154-2172）字面移植——分支结构保留，不做「最短路」化简。
 *  ★F2② 纠偏（2026-09-01）：旧式 `diff 归一化后 cur+diff×amt` 在平局向（两角恰差 π）
 *  与原文分叉——原文 target<cur 支的平局（num−cur == cur−target，严格 `>` 不成立）
 *  落 else 支 `Lerp(cur, target+2π, amt)` = 沿【正方向】经 target+2π 回摆
 *  （d=−π 时走正半周），而 diff 归一化式会取负半周（cur−π·amt）。target>cur 支的
 *  平局同理落 `Lerp(cur, target, amt)` = 正向。⇒ 平局恒正向，非对称语义只能靠
 *  原文分支结构保真。MathHelper.Lerp 展开 = value1+(value2−value1)×amount；
 *  WrapAngle 单次回卷（XNA/MonoGame/FNA 同式）。消费位：AI_134 弩车 rotation
 *  状态机（:69651 待机瞄准 0.08 / :69675 归位 0.05）。 */
function angleLerp134(cur: number, target: number, amt: number): number {
  let angle: number;
  if (target < cur) {
    const num = target + Math.PI * 2;                        // :2158
    angle = (num - cur > cur - target)                       // :2159
      ? cur + (target - cur) * amt
      : cur + (num - cur) * amt;
  } else if (target > cur) {                                 // :2164-2167 相等原样返回
    const num = target - Math.PI * 2;                        // :2168
    angle = (target - cur > cur - num)                       // :2169
      ? cur + (num - cur) * amt
      : cur + (target - cur) * amt;
  } else {
    return cur;
  }
  // MathHelper.WrapAngle：≤π 且 ≥−π 原样；否则单次 ±2π（XNA/MonoGame/FNA 共式）
  if (angle <= Math.PI && angle >= -Math.PI) return angle;
  return angle > Math.PI ? angle - Math.PI * 2 : angle + Math.PI * 2;
}
/** DD2 套装旗标消费位（2026-08-31 批②接线）。原版写入链 =
 *  ballistaPanic（buff 205,Player.cs:11933 读面——SquireT2 受击 AddBuff(205,300) :38526）：
 *  ★GB3（2026-08-31 清零批二波）：population 位补齐——Player.damage 授予端已落地，
 *  经 p.ballistaPanicT>0（Player.cs 300t 窗的字段承载,Player.fixedUpdate 逐拍衰减）
 *  与 p.ballistaPanic 显式位双读面。 */
export interface Dd2SetFlags {
  squireT2: boolean; apprenticeT2: boolean; monkT2: boolean;
  squireT3: boolean; apprenticeT3: boolean; monkT3: boolean; huntressT2: boolean;
  ballistaPanic: boolean;
}
export function dd2SetFlags(playerLike: unknown): Dd2SetFlags {
  const p = playerLike as {
    setSquireT2?: boolean; setApprenticeT2?: boolean; setMonkT2?: boolean;
    setSquireT3?: boolean; setApprenticeT3?: boolean; setMonkT3?: boolean;
    setHuntressT2?: boolean; ballistaPanic?: boolean; ballistaPanicT?: number;
    equipStats?: { summonSet?: { squireT2?: boolean; apprenticeT2?: boolean; monkT2?: boolean;
      squireT3?: boolean; apprenticeT3?: boolean; monkT3?: boolean; huntressT2?: boolean } };
  } | null | undefined;
  const ss = p?.equipStats?.summonSet ?? undefined;
  return {
    squireT2: ss?.squireT2 === true || p?.setSquireT2 === true,
    apprenticeT2: ss?.apprenticeT2 === true || p?.setApprenticeT2 === true,
    monkT2: ss?.monkT2 === true || p?.setMonkT2 === true,
    squireT3: ss?.squireT3 === true || p?.setSquireT3 === true,
    apprenticeT3: ss?.apprenticeT3 === true || p?.setApprenticeT3 === true,
    monkT3: ss?.monkT3 === true || p?.setMonkT3 === true,
    huntressT2: ss?.huntressT2 === true || p?.setHuntressT2 === true,
    // ★GB3 双读面：字段窗(授予端 Player.damage)∪ 显式直连位（测试/GW 直连后备）
    ballistaPanic: (p?.ballistaPanicT ?? 0) > 0 || p?.ballistaPanic === true,
  };
}

/** GetBallistraShotDelay 1:1（1457 :69720-69736；1456 :65707 同体）：
 *  基础 160 → 侍从 T3 套装 100 → 弩车恐慌（ballistaPanic）60 → 双真 30。
 *  setSquireT3/ballistaPanic 经 dd2SetFlags 读（未穿套装恒 160 档,旗标位 GW 批补） */
function ballistraShotDelayOf(player: object): number {
  const f = dd2SetFlags(player);
  let result = 160;
  if (f.squireT3) result = 100;
  if (f.ballistaPanic) result = 60;
  if (f.ballistaPanic && f.squireT3) result = 30;
  return result;
}
/** 闪电光环三档（AI_137 :65910）：非射击——光环场伤害（宽 ≤999 扫描增长，
 *  localNPCHitCooldown=3）；帧 6 张连续循环 */
const AURA_TOWER = new Set([688, 689, 690]);
/** 爆炸机关三档（AI_138 :66059）：帧 4 张每 12t 连续循环；触发检测每 3t——
 *  中心上方 48px 处 144×144 盒内有敌 → 原地爆炸（proj 694/695/696 等价 AoE），
 *  冷却 GetExplosiveTrapCooldown=90 */
const TRAP_TOWER = new Set([691, 692, 693]);
/** AI_130 三档弹/速度/周期分层（★F5,2026-08-30；case 链 Projectile.cs:69166-69398,
 *  1456 同构 :65194-65350）：
 *  - T1 663：shot 664 / speed num4=12 / 开火帧 num3=12 / cycle num6*num7=24 /
 *    cd num8=80 / 炮口 dy=40（:69171 基值 + :69182）
 *  - T2 665：num8=70(:69230) / num4+=3→15(:69231) / num6=8 / shot 666 / dy=44
 *    （:69233-69234）→ cycle=32
 *  - T3 667：num8=60(:69282) / num4+=6→18(:69283) / num6=8 / shot 668 / dy=46
 *    （:69285-69286）→ cycle=32
 *  （红队主张两处失准登记：dy 三档为 -40/-44/-【46】非 -48；num3=12 是开火帧位
 *   非基伤——弹伤害走 projectile.damage 本体档 NewProjectile(...,damage,...)，
 *   与 dmgOf() 数据源同源，无 tier 化伤害面）
 *  炮口 dy 此前恒 -46、shot 恒 668、speed 恒 9、cycle/cd 恒 T3 值——T1/T2 全错 */
export const FLAMEBURST_TIERS: Record<number, { shot: number; speed: number; cycle: number; cool: number; dy: number }> = {
  663: { shot: 664, speed: 12, cycle: 24, cool: 80, dy: 40 },
  665: { shot: 666, speed: 15, cycle: 32, cool: 70, dy: 44 },
  667: { shot: 668, speed: 18, cycle: 32, cool: 60, dy: 46 },
};

/** AI_137_LightningAura_CanHit（Projectile.cs:71574-71614）1:1：塔顶(+20) 到目标点
 *  的三试视线门——①直线 CanHitLine；②不过则走中点垂直偏移 |v|×0.2 的两段弧线
 *  （先 +π/2 绕行侧，再 −π/2），两段全通才算见着；③目标格本身实心直接 false。
 *  2026-08-30 实体侧对账批补（此前只有单段直线近似）。调用点：
 *  Colliding aiStyle==137 支（Projectile.cs:15888-15897 敌盒中心/敌盒上沿中两点）
 *  与 AI_137 尘/声采样（:70040/:70063）。 */
export function lightningAuraCanHitFrom(
  st: import('../world/TileStore').TileStore,
  fx: number, fy: number, tx: number, ty: number,
): boolean {
  const tIx = Math.floor(tx / TILE), tIy = Math.floor(ty / TILE);
  // ★F3 目标格快退谓词（2026-08-30 实体侧对账批）：原版 = WorldGen.SolidTile(i,j)
  //   （1457 WorldGen.cs:70642-70661 / 1456 :70155 同式）——active && tileSolid &&
  //   !tileSolidTop(平台) && !halfBrick && slope==0 && !inActive，【不含平台族】。
  //   TileStore.isSolid 含平台且出界返回 false（原版未加载 tile==null → true），
  //   平台上目标曾被错拒——改走 LineOfSight.solidTileAt 公共口（同 fullSolid 判定式）
  if (solidTileAt(st, tIx, tIy)) return false;                       // SolidTile(:71577)
  if (canHitLine(st, fx, fy, 0, 0, tx, ty, 0, 0)) return true;        // 直线支(:71581)
  // 弧线参数(:71584-71600)：v = 目标−起点；中点 M=Lerp(起,终,0.5)；
  // 弧点 = M ± SafeNormalize(v,UnitY).RotatedBy(±π/2) × |v| × 0.2
  const vx = tx - fx, vy = ty - fy;
  const vl = Math.hypot(vx, vy) || 1;
  let nx = vx / vl, ny = vy / vl;                                     // SafeNormalize 默认 UnitY
  if (vx === 0 && vy === 0) { nx = 0; ny = 1; }
  const mx = (fx + tx) / 2, my = (fy + ty) / 2;
  const off = vl * 0.2;
  for (const s of [1, -1]) {                                          // RotatedBy(±π/2)
    const px = mx - ny * s * off;                                     // (nx,ny) 转 ±90°
    const py = my + nx * s * off;
    if (!canHitLine(st, fx, fy, 0, 0, px, py, 0, 0)) continue;
    if (canHitLine(st, px, py, 0, 0, tx, ty, 0, 0)) return true;
  }
  return false;
}
/** AI_130/AI_134 FindTarget 的角度/朝向门族（2026-08-31 批①②「未接」账清偿）：
 *  - angleRatioMax（AI_130，Projectile.cs:69434/:69456 消费式逐字）
 *      `!(Math.Abs(v.X) < Math.Abs(v.Y) * ratio)` 不满足即拒——ratio=1 默认（:69166）,
 *      学徒 T2 套装置 0.1（:69332 垂直覆盖大幅放宽）
 *  - deadBottomAngle（AI_134，:69481/:69503）：`(|vX| < |vY|·dba) 且 vY>0` 的
 *      陡下锥内候选拒（0.75,:69580）;上方目标恒通过
 *  - directionLock：AI_130 第二调用点 canChangeDirection=false（:69391 实参;首轮 :69375 缺省——★F8 校准）——
 *      `(float)direction * v.X < 0f` 即正后方候选跳过（开火帧不再回头转向;
 *      门不过 → 调用侧回落 (direction,0) 直射）。第一调用点 :69376 可换向=无此门 */
export interface TowerAimGate {
  angleRatioMax?: number;
  deadBottomAngle?: number;
  /** 存现值 direction（±1）；undefined = canChangeDirection=true 无门 */
  directionLock?: number;
}

/**
 * SafeNormalize 兜底 UnitY 后的方向门判定（FindTarget 内联式 1:1）。
 * @param dxNorm 归一化 vX（零向量时传 0）
 * @param dyNorm 归一化 vY（零向量时传 1——SafeNormalize(fallback UnitY)）
 * @returns false = 该候选被门拒（等价原版 && 短路失败）
 * @pure 可独立测钉
 */
export function towerAimGate(dxNorm: number, dyNorm: number,
  gate: TowerAimGate | undefined): boolean {
  if (!gate) return true;
  if (gate.angleRatioMax !== undefined) {
    //（:69434/:69456）|vX| < |vY|*ratio → 拒
    if (Math.abs(dxNorm) < Math.abs(dyNorm) * gate.angleRatioMax) return false;
  }
  if (gate.deadBottomAngle !== undefined) {
    //（:69481/:69503）接受式 = (!(|vX|<|vY|·dba) || !(vY>0)) ⇒ 反之拒
    if (Math.abs(dxNorm) < Math.abs(dyNorm) * gate.deadBottomAngle && dyNorm > 0) return false;
  }
  if (gate.directionLock !== undefined) {
    //（:69456 经 :69391 实参展开）direction*vX < 0 → 拒
    if ((gate.directionLock as number) * dxNorm < 0) return false;
  }
  return true;
}

/** 随从帧循环表（源码提取，Projectile.cs 各 AI 内 frameCounter 规则）：
 *  [每帧 tick, 循环帧数, 攻击帧偏移]。375 小鬼攻击中 +4（ai[1]<24 → 真攻击帧）；
 *  未列入的家族（758 吸血蛙 24 帧/951 雪怪 12 帧/1022 蘑菇 16 帧/
 *  191 矮人 18 帧/393 海盗 15 帧/864 刃 2 帧/946 棱镜 1 帧）帧语义复杂或单帧，
 *  走 age/8 匀速循环兜底。★1093/1112/1118 猫族不在此表也不走兜底——
 *  palGroundStep 专属帧机直写（age/8 兜底会扫到 28 帧表的 14-27 白姿 hurt 带） */
const MINION_FRAMES: Record<number, [number, number, number]> = {
  373: [2, 3, 0],   // 黄蜂：fc>1 → frame++，cap 2
  375: [5, 4, 4],   // 小鬼：fc/5 帧 0-3，攻击中 +4
  407: [2, 6, 0],   // 蜘蛛：fc/2，6 帧循环
  423: [3, 4, 0],  613: [3, 4, 0], // 暴风雨/星尘细胞
  266: [5, 8, 0],   // 史莱姆：fc>4 → frame++，frame≥8 → 0
  317: [5, 4, 0],   // 乌鸦：fc≥4 → frame++，frame>3 → 0
  387: [4, 3, 0],  388: [4, 3, 0], // 双子眼球：fc>3 → frame++，cap 2（:28878-28888）
  533: [2, 3, 0],   // 致命球：fc>1 → frame++，cap 2
  755: [6, 5, 0],   // 血红杖：fc≥6 循环 5 帧
  759: [6, 4, 0],   // 雀杖：fc≥6，cap projFrames-1=4
  831: [4, 6, 0],   // 沙漠虎：fc≥4，frame≥6 → 0
  970: [4, 6, 0],   // 阿比盖尔：fc≥4，frame≥6 → 0
  1025: [8, 4, 0],  // 藤壶：慢循环
};

/** 朝向语义表（原版 spriteDirection/rotation 真值，2026-08-17 镜像修复批）：
 *  - AI62_LEFT_ART：AI_062（:62983-62990）velocity.X>0 → spriteDirection=-1
 *    ——贴图朝左、右行才翻转 → facing=-sign(vx)（曾误 facing=sign(vx) 全族镜像）
 *  - MINION_NO_FLIP：AI_026/AI_164 零 spriteDirection 赋值（俾格米191-194/
 *    宝宝史莱姆266/蜘蛛313·379·390·391/计数器831·970）恒不翻转。
 *    1094 Foxparks 已移出（2026-08-22）：flag8=1094 有专属赋值——喷火态
 *    Projectile.cs:56111-56120 spriteDirection=(velocity.X>0?1:-1) 再取反、
 *    跟随态 :57698 spriteDirection=player.direction——按 velocity 翻转
 *  - MINION_ROT_ONLY：旋转制不与翻转叠用（原版 dir 恒 None）——双子387/388
 *    （vel+π）、致命球533、雪花917、龙链625-628、同伴方块653。
 *    表外设 rot 的族（AI_062 :66827 / 乌鸦 :27542 / 蜘蛛爬墙 :65122）原版 rotation 与
 *    spriteDirection 【叠】用（XNA SpriteBatch 同 draw 调用,Main.cs:30529-30533 dir +
 *    rotation 复合=顶点先镜像再旋转）——draw 侧 rotate 后补 scale(-1,1)（2026-08-23） */
const AI62_LEFT_ART = new Set([373, 375, 407, 423, 613]);
/** AI_062 射手族（SetDefaults aiStyle=62 全表 :4295/:4319/:4610/:4692/:6324/:8829，
 *  963 阿比盖尔另档）——索敌射程/视线门分档用（1456 :62362-62375） */
const AI62_SHOOTERS = new Set([373, 375, 407, 423, 613]);
/** AI_062 索敌距门以【玩家中心】为基准的分支（1457 :66361-66402
 *  `Vector2 center = Main.player[owner].Center` + :66391/:66374 距离测该点——
 *  1456 :62416/:62433 同段；其余 373/375/963 走 :66431 `base.Center`=随从基准） */
const AI62_PLAYER_TARGETING = new Set([407, 423, 613]);
/** AI_026 零 spriteDirection 赋值族(2026-08-19 补漏;1094 移出:56111)。390-392 蜘蛛
 *  已移出（2026-08-23 撤退批）：AI_026 共享赋值 `if (type != 313)` 蜘蛛在列
 *  （:63316-63323 direction==-1→1/==1→-1）+ flag7 专属 :65166 `spriteDirection=-direction`
 *  ——走行按 direction 翻转;313 是唯一豁免（原版字面）维持不翻 */
const MINION_NO_FLIP = new Set([191, 192, 193, 194, 266, 313, 379, 831, 970,
  112, 959, 1003, 1004, 1095, 1096]);
const MINION_ROT_ONLY = new Set([387, 388, 533, 917, 625, 626, 627, 628, 653]);

/** ★SW-BJ13 2026-09-07：原版专绘支家族（Main.cs:34788 分支谓词投影到本仓实体域——
 *  398/450 原版同支但本仓无 MinionProj 实体域,余九型全接）。这些型的 draw 锚 =
 *  帧心@「盒心+(0,−num467)」、origin=(整图宽/2, 帧高/2+num151),【不走】通用
 *  num143/144 尾绘的盒左上锚（分支锚/origin 见 draw 支注 Main.cs:34788-34800）。
 *  WeaponProj.PROJ_DRAW_OFFSET 静态表的 1022/1036/423 三项已随本批退役（表值是
 *  :30077 switch 真值,但本支原版只消费 num151——经通用路消费即错锚）。 */
const CENTER_ANCHOR_34788 = new Set([393, 394, 395, 423, 1022, 1036, 1093, 1112, 1118]);

/** ★SW-BJ16 2026-09-07：Main.cs:33693 中心锚大支（本仓 MinionProj 域成员投影）。
 *  原版本支锚 = proj.Center + (0, gfxOffY)（:33694-33695 vector99）、帧矩形 =
 *  Frame(1, projFrames, 0, frame)（:33701）、origin = 帧尺寸/2（:33787 origin32）、
 *  主绘 :34212——即「帧心锚于盒心」。这些型不走通用 num143/144 尾绘
 *  （:34919 多帧/:35470 单帧 = 帧左上锚盒左上,本仓通用路语义）；本仓通用路对
 *  未登记型吃 [0,0] 缺省 = 帧左上锚盒左上 ⇒ 精灵整体偏右下（758 曾 +58/951 类）。
 *  支内改锚/改切片特例【不在集合表达内】,由 draw 支逐型消费（:33951 773 origin.Y=
 *  帧高−12 / :33959 759 origin=(帧宽/2±1, 帧高−2) / :33964 758 锚 Y+=盒高/2+
 *  origin=(帧宽/2, 帧高−4) / :33836 963 切片 Frame(4,13,0,frame)+锚 Y−2 /
 *  :33771 1098·1123 锚 Y−2 / :33942 951 锚=盒底−帧高/2+4 / :34169 623 ai0==2 抖动）。
 *  家族全表（含 WeaponProj 773 / BookProj 1092 域外成员与 A 支 641 债）=
 *  docs/audit/summon-draw-branch-registry-2026-09-07.md,提取器 =
 *  tools/extract-draw-branch-families.mjs（解析 Main.cs 分派条件→vid 集）。
 *  守卫测试 = tests/sw-bj16-draw-branch-guard.test.ts（新增召唤物未查分支表即爆红）。 */
const CENTER_ANCHOR_33703 = new Set([613, 623, 625, 626, 627, 628, 643, 758, 759, 831, 951, 963, 970, 1098, 1119, 1123]);

/** 接触击退【玩家锚】方向族（Projectile.cs:13652-13660 switch,StrikeNPC num40 消费
 *  :13683）：697/699/707/708/759 原版既有 + ★1458 新增 1118 Clay Bud——击退方向 =
 *  玩家→敌（"always knocks enemies away from the player"）,非随从→敌 */
const MINION_PLAYER_ANCHOR_KB = new Set([697, 699, 707, 708, 759, 1118]);

/** =====================================================================
 *  ★台账批③（2026-08-31,docs/audit/approx-registry「镇民/宠物」项③）：
 *  接触冷却家族化——原版 Projectile.localNPCHitCooldown 缺省 -2（Projectile.cs:466,
 *  SetDefaults 每次重置 :714），三类语义：
 *   · `-2`（缺省,未覆写型）：Damage_PVE_Inner :12636 immune[owner]==0 门生效 +
 *     命中尾 :14175 分支全跳过 → 尾支 :14182（penetrate≠1）写 targetNPC.immune[owner]
 *     =10 ——【吃玩家全局免工件窗】：同玩家全部来源共享该 NPC 的 10t 窗。
 *   · `local`：SetDefaults 显式 usesLocalNPCImmunity=true + localNPCHitCooldown=N ——
 *     每弹每敌私表 N t。
 *   · `idStatic`：usesIDStaticNPCImmunity=true + idStaticNPCHitCooldown=N（immunityIdentity
 *     =type :10682）——同型全体弹共享按敌的 N t 表。
 *  下表逐型取 Terarria1458 SetDefaults 实值（行号=块首）；未列入随从 = '-2' 全局窗支。
 * ===================================================================== */
export const CONTACT_PLAYER_WINDOW = -2;
/** number = 局部私表 t（CONTACT_PLAYER_WINDOW=-2 特指全局窗支）;对象 = idStatic 同型桶 */
export interface IdStaticContact { kind: 'idStatic'; cd: number }
export type ContactCd = number | IdStaticContact;

/** local/idStatic 逐型表（1458 SetDefaults 行号锚）：数值=local 私表 t；
 *  {kind:'idStatic'}=同型共享桶。'-2' 缺省族不入表。 */
const CONTACT_CD_TABLE: Record<number, ContactCd> = {
  266: { kind: 'idStatic', cd: 12 },   // 宝宝史莱姆（:3527 usesIDStatic）
  317: 10,                             // 乌鸦（:4110）
  387: { kind: 'idStatic', cd: 16 },   // 双子激光眼（:4714,曾专用恒 20 迁表）
  388: { kind: 'idStatic', cd: 12 },   // 痉挛眼（:4730）
  390: { kind: 'idStatic', cd: 15 },   // 蜘蛛三变体共块（:4754——旧统一 20t → 正轨）
  391: { kind: 'idStatic', cd: 15 },
  392: { kind: 'idStatic', cd: 15 },
  393: 18,                             // 海盗三变体共块（:4765-4770——扑击窗接触伤,local 私表）
  394: 18,
  395: 18,
  407: { kind: 'idStatic', cd: 10 },   // 暴风雨鲨卷（:4893,旧统一 20t → 正轨）
  533: 12,                             // 致命球（:6008,旧统一 20t → 正轨）
  623: 5,                              // 星尘守护者（:6713;专段内已用 5 表存照）
  625: 7,                              // 龙链四段共块（:6756——JS 侧以全链共用 hitCd 实例承载）
  626: 7,
  627: 7,
  628: 7,
  697: 12,                             // OOA 支线塔/伴生弹族（哨兵端在途消费）
  688: 3,                              // 闪电光环（:7339,AURA 直伤通道专用表同值）
  689: 3,
  690: 3,
  755: -1,                             // 血蝙蝠（:7792,localCD=-1=攻击轮次免疫,tHit/bHit 承载）
  758: { kind: 'idStatic', cd: 10 },   // 吸血蛙（:7825——旧误 30t → 正轨）
  833: 10,                             // 沙漠虎本体（:8095,A① 改链后仍传显式 10 存档）
  834: 10,
  835: 10,
  946: -1,                             // 泰拉棱镜（:8941,同 755 轮次免疫语义）
  951: { kind: 'idStatic', cd: 10 },   // 雪原精怪 flinx（:8984,通用备用）
  963: 20,                             // 阿比盖尔（:9113 与既有显式 20 一致）
  1022: 18,                            // 蘑菇小伙伴（:9679 与显式一致）
  1036: 20,                            // 雾网蜘蛛（:9781 与显式一致）
  1093: 9,                             // 帕鲁猫（:10206,palGroundStep 显式同源）
  1112: 9,
  1118: 30,
  1119: 30,
};

/** 同型共享 idStatic 免疫桶（immunityIdentity=type :10682——实例级 Map 单例承载
 *  `static float[,] perIDStaticNPCImmunity` :13823/:14037 语义） */
const IDSTATIC_BUCKETS = new Map<number, MinionHitCd>();

/** 弹型接触冷却解析（-2 全局窗/私表/idStatic 三态）;CONTACT_CD_TABLE 缺项 = 全局窗 */
function contactResolve(projId: number): ContactCd {
  return CONTACT_CD_TABLE[projId] ?? CONTACT_PLAYER_WINDOW;
}

/** 远程射击随从表（Projectile.cs AI_062/AI_026/aiStyle66 射击分支提取）：
 *  shot=射出弹幕 speed=弹速 cd=冷却 t range=射击门距（两者仅余通用路径族消费——
 *  AI_062 五型 373/375/407/423/613 已归 ai62Step 原版链：冷却=ai[1] 随机计数器
 *  :66963-67044、射程门 423≤400 :67101/613≤500 :67116/其余无门,cd/range 两列已废,
 *  曾 373 cd:36 定值近似 → 2026-08-23 备案项③归随机域）
 *  dmgMul=伤害倍率 jitter=瞄准随机抖动 px precallY=抛物线 Y 预瞄（俾格米掷矛
 *  AI_026 :62713-62720 num155=|含抖动Δx|×0.1×Next(0,100)×0.001 抵消 Y）
 *  muzzleY=出生锚点相对本体中心的 Y 偏移（AI_026 vector15 = Center-8 :58764；
 *  Foxparks 分支再 -2 :58784）；life=出生 timeLeft 覆写（AI_062 全族 300 :67127/:67161，
 *  唯 423→433 分支不覆写→433 SetDefaults 100）。
 *  373 黄蜂→374 毒刺(:67051-67055 sp10)；375 小鬼→376 火球(sp11)；
 *  407 风暴(鲨鱼龙卷)→408(sp20)；423 Xeno UFO→433 光束(sp4)；
 *  613 星尘细胞→614(sp14)；
 *  191-194 俾格米→195 掷矛(AI_026 :62726,sp11,CD30,射程800,抖动±20)；
 *  387 双子激光眼→389(:28982 sp8 ×1.15 伤,CD~45,需视线)；
 *  1094 Foxparks→1097 火球(:58815 sp11 CD42 无抖动) */
const MINION_SHOOT: Record<number, { shot: number; speed: number; cd?: number; range?: number;
  dmgMul?: number; jitter?: number; grav?: number; life?: number; muzzleY?: number;
  burn?: 'fire' | 'hellfire'; search?: number; precallY?: boolean;
  /** 终清波批：AI_026 flag10 族射击门原式（:62691 num139<800+40×slot）——
   *  metric='manhattan'（曼哈顿自本体心）+ rangeSlot=40/slot + throwLos=
   *  Collision.CanHit 本体盒→敌盒（搜索候选即 CanHit 检出的 num141 面） */
  metric?: 'euclid' | 'manhattan'; rangeSlot?: number; throwLos?: boolean }> = {
  // 373-613：仅 shot/speed/life 三列被 ai62Step 消费（:67049-67075 弹表/:67127/:67161
  // timeLeft=300,423 不覆写→100）
  373: { shot: 374, speed: 10, life: 300 },
  375: { shot: 376, speed: 11, life: 300 },
  407: { shot: 408, speed: 20, life: 300 },
  423: { shot: 433, speed: 4, life: 100 },                        // 423 分支无覆写 → SetDefaults 100
  613: { shot: 614, speed: 14, life: 300 },
  // ★台账批⑭（2026-08-31）：search=索敌检索半径（Minion_FindTargetInRange 式家族
  // 门——AI_026 flag10 群 = 主周【曼哈顿】窗 num104=700+100=800 内首只（CanHit 盒,
  // :61424-61446）;search 缺省族回落 self 心距。俾格米缺 search 键曾吃 1000 兜底错档。
  // ★终清波批：射击门 +40×slot 归真（metric/rangeSlot/throwLos 三键,:62566-62753
  // flag10 段原式——num134=40×minionPos、1113 再 +=360;窗口 num139<800+num134、
  // 曼哈顿、仅 CanHit 候选可出手）
  191: { shot: 195, speed: 11, cd: 30, range: 800, search: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8, precallY: true,
    metric: 'manhattan', rangeSlot: 40, throwLos: true }, // 掷矛抛物线(aiStyle 1) 手部高度 :58764
  192: { shot: 195, speed: 11, cd: 30, range: 800, search: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8, precallY: true,
    metric: 'manhattan', rangeSlot: 40, throwLos: true },
  193: { shot: 195, speed: 11, cd: 30, range: 800, search: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8, precallY: true,
    metric: 'manhattan', rangeSlot: 40, throwLos: true },
  194: { shot: 195, speed: 11, cd: 30, range: 800, search: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8, precallY: true,
    metric: 'manhattan', rangeSlot: 40, throwLos: true },
  387: { shot: 389, speed: 8, cd: 45, range: 1000, dmgMul: 1.15, life: 300 },  // timeLeft=300(:28981)
  // Foxparks 族（AI_026 flag10 段 :62566-62753）：cd num135 42/30（1113 :62573）；
  // 射程门 num139<800+num134（1113 num134+=360 :62674-62675 → 1160）； muzzleY=-10
  // ★三轮蓝队 F5④ 核证：原版 vector14 = (pos.X+w/2, pos.Y+h/2−8)＝【Center−8】
  //   （:62706,h/2 在原式里即盒心项）→flag8 支 :62740 再 −2 ⇒ Center−10。本表
  //   muzzleY 消费端 = this.cy+muzzleY ⇒ 常数 -10 对任意 h 精确成立（非 h-派生缺位，
  //   是"Center 相对"语义本身——真盒扩容前后零视觉差,登记核证结论）。burn：
  //   1097 命中 ai[1]>0 → OnFire3(323)/否则 OnFire(24)（:11315-11318）——
  //   1094 ai[1]=0 恒火、1113 ai[1]=3/1 恒地狱火（:62744-62752）
  1094: { shot: 1097, speed: 11, cd: 42, range: 800, life: 300, muzzleY: -10, burn: 'fire',
    metric: 'manhattan', rangeSlot: 40, throwLos: true }, // Center−10 = :62706−8 & :62740−2
  // 1113 索敌检索 1160（:62674-62675 num134+=360 → num139<800+40slot+360 :62691；approach num151=450+180 :62672/:62674）
  1113: { shot: 1097, speed: 11, cd: 30, range: 1160, search: 1160, life: 300, muzzleY: -10, burn: 'hellfire',
    metric: 'manhattan', rangeSlot: 40, throwLos: true }, // 6149 可靠的火绒狐（1457 新）
};

/** ★三轮 η 红队：闪电光环 armorPenetrationPercent 门单源（Projectile.cs:13266-13269）。
 *  `if ((type==688||689||690) && targetNPC.type!=68 && targetNPC.defense<999)
 *   ⇒ armorPenetrationPercent=1f`——受害者非 68（地牢守卫族）且防御<999 才给 100%
 *  护穿；守卫/≥999 防御高防位退款池按 0 折算。 */
export function lightningAuraPenPercent(
  vanillaId: number | null | undefined, defense: number | undefined,
): number {
  return vanillaId !== 68 && (defense ?? 0) < 999 ? 1 : 0;
}

/** ★三轮蓝队 F5②：MinionProj SetDefaults 真盒单源读口（尺寸初始化链同步本函数）。
 *  Game.spawnDigtoiseOnCursor（Game.ts:12818 调用点在并行 α 的 Game 属主作业区外沿,
 *  本批不改其行）消费形：NewProjectile(x*16+8, y*16−32, …)=「中心」语义（Player.cs:
 *  50043 :50044 与 Projectile.cs NewProjectile X/Y=中心链一致）——落位派生式为
 *  `new MinionProj(x*TILE + 8 - bx.w / 2, y*TILE - 32 - bx.h / 2, …)`；旧实现把中心点
 *  直接当盒左上 ⇒ 钻地龟(34×34)整体右下偏半盒 17px。放大前后视觉差：出场摆正后
 *  无差（vy=15 下坠+挖掘 AI 自纠),首帧入场动画与三列净空门(x±1×y-2..y-1)判定面
 *  对齐上移；16×16 旧假设弹（如随从通用路 spawnMinion 的 MouseWorld 点）不在本批域。
 *  本导出未接线前返回值仅供测试/调用方自取（先例：pickSentryLandingSpot 导出缝）。 */
export function minionTrueBox(projId: number): { w: number; h: number } {
  switch (projId) {
    case 1098: case 1123: return { w: 34, h: 34 };       // 钻地龟（:10245-10246/:10507-10508）
    case 1093: case 1112: case 1118: case 1119: return { w: 14, h: 22 };
    case 1113: return { w: 18, h: 18 };
    case 1022: return { w: 20, h: 30 };                  // 蘑菇小伙伴（:9670-9671）
    case 393: case 394: case 395: return { w: 20, h: 30 };   // 海盗三变体（:4758-4759）★SW-BJ13
    case 423: return { w: 28, h: 28 };                   // 异星 UFO（:4964-4965）★SW-BJ13
    case 1036: return { w: 18, h: 10 };                  // 雾网蜘蛛（:9770-9771）★SW-BJ13
    // ★SW-BJ17 2026-09-07：仆从构造器 13 id 真盒收尾批（前批移交件;与构造器 if 链单源
    //   同步,判据同 BJ13/BJ16）。移交清单 13 id 中 393-395/758/1036 已由 BJ13/BJ16 注册
    //   （对反编译终值核对一致,不重刀）,本批补余下 8 id——乌鸦 317 28×28（:4104-4105）/
    //   蜘蛛三型 390-392 30×30（:4746-4747）/ 沙漠虎一档 833 26×20（:8086-8087）/
    //   二三档 834-835 20×30（:8100-8101/:8114-8115）/ 酷鞭雪花哨兵 917 30×30
    //   （:8705-8706）。各 SetDefaults 块无 scale 行（缺省 1）→ SetDefaults 尾
    //   width×scale（:10674-10675）恒等,字面即终值;数据面 vanilla-projectiles.json 同值
    case 317: return { w: 28, h: 28 };                   // 乌鸦 Raven（:4104-4105）★SW-BJ17
    case 390: case 391: case 392: return { w: 30, h: 30 };   // 蜘蛛三型（:4746-4747）★SW-BJ17
    case 833: return { w: 26, h: 20 };                   // 沙漠虎一档（:8086-8087）★SW-BJ17
    case 834: case 835: return { w: 20, h: 30 };         // 沙漠虎二三档（:8100-8101/:8114-8115）★SW-BJ17
    case 917: return { w: 30, h: 30 };                   // 酷鞭雪花哨兵（:8705-8706）★SW-BJ17
    // ★SW-BJ16 2026-09-07：33693 中心锚支家族真盒（与构造器 if 链单源同步,判据同 BJ13）
    case 613: return { w: 24, h: 24 };                   // 星尘细胞（:6600-6611 块内 width/height）
    case 623: return { w: 50, h: 80 };                   // 星尘守护者（:6713-6714）
    case 625: case 626: case 627: case 628: return { w: 24, h: 24 };   // 龙链四段（:6743-6744）
    case 758: return { w: 20, h: 30 };                   // 吸血蛙（:7817-7818）
    case 759: case 831: case 970: return { w: 10, h: 10 };   // 雀杖/虎宝石/阿比盖尔计数器（:7839/:8073/:9188）
    case 951: return { w: 26, h: 26 };                   // 雪怪（:8972-8973）
    case 963: return { w: 30, h: 48 };                   // 阿比盖尔一阶体（:9106-9107）
    case 663: return { w: 30, h: 54 };                   // :7133-7134
    case 665: return { w: 28, h: 58 };                   // :7141-7144
    case 667: return { w: 28, h: 60 };                   // :7145-7148
    case 677: case 678: case 679: return { w: 26, h: 54 };   // :7244-7245
    case 308: return { w: 80, h: 74 };                   // 冰九头蛇（:4001-4002）
    case 377: return { w: 66, h: 50 };                   // 蜘蛛皇后（:4619-4620）
    case 641: case 643: return { w: 32, h: 32 };         // 月门/彩虹水晶（:6919/:6932）
    case 966: return { w: 18, h: 60 };                   // 猎犬底座（:9146-9147）
    case 1025: return { w: 42, h: 38 };                  // 悬空毒眼球（:9710-9711）
    default: return { w: 16, h: 16 };                    // MinionProj 缺省兜底（构造期字段）
  }
}

/** aiStyle 53 定点哨兵表（AI :27172-27382 1:1）：初冷 ai[0]=120（:27180），
 *  射速 ai[0] 归零重置 60（966 猎犬 90，:27282-27288），弹速 9/9/12.5。
 *  炮口按瞄准扇区偏移（:27289-27305，见 sentry53Fire）；射程门 1000
 *  （AI_053_HandleSentryNPCTargeting :37845 默认 maxDistance=1000，无视线门） */
const SENTRY53: Record<number, { shot: number; speed: number; cd: number }> = {
  308: { shot: 309, speed: 9, cd: 60 },   // 冰九头蛇 → 309 冰弹
  377: { shot: 378, speed: 9, cd: 60 },   // 蜘蛛皇后 → 378 蛛卵
  966: { shot: 967, speed: 12.5, cd: 90 }, // 猎犬（Houndius）→ 967
};
/** aiStyle 123 哨兵射击表（:33819-34020 提取；射程门 1000）：
 *  641 月门→642 传送门弹 CD30；643 彩虹水晶→644×3 目标区随机落点。
 *  ★643 真值节奏（1458 AI_123 :37726-34020,R31 §C③）：ai[0] −20→0 冷却 20t + 锁定 1t
 *  + num8=5t 计满 → **~26t 一轮**——旧值 50 = 射速减半（R31 P1 一行止血）
 */
export const SENTRY_SHOOT: Record<number, { shot: number; speed: number; cd: number; volley?: number }> = {
  641: { shot: 642, speed: 9, cd: 30 },
  643: { shot: 644, speed: 0, cd: 26, volley: 3 },
};

/** 悬浮哨兵三件（R31 §C①：原版放置即定桩,tileCollide=false 恒悬浮于放置点）：
 *  641 月门/643 彩虹水晶（AI_123 首行 velocity=Zero,:37726 区块）+
 *  1025 悬空毒眼球（物品 5463 放置速度=(0,0) 原地浮现,Player.cs:48687-48689;
 *  AI_197_CeilingAndHoverTurret 悬浮炮台）。此前走通用哨兵重力段 vy+=0.2 落地,
 *  "空中炮台"站位语义丢失 */
const FLOATING_SENTRIES = new Set<number>([641, 643, 1025]);

/** 哨兵放置落地扫描（PickSentryLandingSpot Player.cs:50043-50059 1:1 纯函数,
 *  R31 §C①——Game.ts case 'summon' 接线见落点清单;本导出先落可测实现）：
 *  非悬浮件从鼠标格向下扫到"本格及左右邻均非实心"终止的行 i,取 i−1;
 *  spawnX=鼠标世界 X、spawnY=i×16−24。悬浮三件(3571/3569/5463)免扫描直取鼠标格
 *  （5463 另在 Player.cs:48687 把 spawnY 覆写为裸 mouseY、vy=0）。 */
export function pickSentryLandingSpot(
  store: { inBounds(x: number, y: number): boolean; isSolid(x: number, y: number): boolean },
  mouseWX: number, mouseWY: number, itemId: number, maxTilesY: number,
): { x: number; y: number } {
  const floating = itemId === 3571 || itemId === 3569 || itemId === 5463;
  const tx = Math.floor(mouseWX / 16);
  let ty = Math.floor(mouseWY / 16);
  if (!floating) {
    const solidRow = (row: number): boolean =>
      store.inBounds(tx - 1, row) && store.isSolid(tx - 1, row)
      || store.inBounds(tx, row) && store.isSolid(tx, row)
      || store.inBounds(tx + 1, row) && store.isSolid(tx + 1, row);
    for (; ty < maxTilesY - 10 && !solidRow(ty); ty++) { }
    ty--;
  }
  return { x: mouseWX, y: ty * 16 - 24 };
}

/** 随从/哨兵专属召唤音（生成后首帧起按 at 节拍各播一次）——原版来源：
 *  · 1093/1094/1112/1113 Pal 随从：弹幕 AI soundDelay 双声（Projectile.cs:350 初值 0，
 *    `--soundDelay == -20` 第 20 拍家族叫声 PalCattiva :50099-50102 / PalFoxparks
 *    :59119-59122，音量 0.35=SoundID.cs:1074/:1086；`== -1` 首拍 PalSummon
 *    :50103-50106/:59123-59126，音量 0.15=SoundID.cs:1072）——tick1=PalSummon、tick20=家族叫声
 *    （1093/1094 与 1112/1113 同序，曾登记相反已订正）
 *  ★R31 §A③ 双播收口（2026-08-25）：下列条目已删——物品 UseSound 由 Game.playUseSound
 *  经 vanilla-itemusesound.json 真值单播,本表再播即双声:
 *   · 970/1022：5114→AbigailSummon / 5456→DeadCellsMushroomSummon 两键已在表;
 *   · OOA 十二哨兵弹 663-693：3818-3834 → DD2_DefenseTowerSpawn 十二键已在表。
 *  其余随从族原版统一 UseSound=Item44（Game 侧 summon 通道已播，此处不重复） */
const MINION_SUMMON_SFX: Record<number, Array<{ track: string; vol: number; at: number }>> = {
  1093: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_cattiva', vol: 0.35, at: 20 }],
  1094: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_foxparks', vol: 0.35, at: 20 }],
  1112: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_cattiva', vol: 0.35, at: 20 }],
  1113: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_foxparks', vol: 0.35, at: 20 }],
  // 1098/1123 钻地龟出场双声（AI_204 :39222-39231：soundDelay-- ==-1 → PalSummon
  // 0.15（tick1）/ ==-20 → PalDigtoise 0.35（tick20）——SoundID.cs:1072/:1094 同族节拍；
  // 物品 5667/6174 无 UseSound 行,非双播）
  1098: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_digtoise', vol: 0.35, at: 20 }],
  1123: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_digtoise', vol: 0.35, at: 20 }],
};

/** 随从射弹出膛音（原版在弹幕 AI 首帧 localAI[0]==0 处 PlaySound，等效落射弹生成帧）：
 *  374 毒刺 Item_17（:52670）/ 376 小鬼火球 Item_20（:52684）/ 378 蛛卵 Item_17（:23398）/
 *  967 猎犬弹 Item_60（:24971）/ 195 矮人掷矛 Item_17（:56298-56302）/ 389 双子激光眼
 *  Item_12（:56263-56267）/ 408 迷你鲨鱼龙 Item_19（:56201-56205 legacy PlaySound(4,x,y,19)）
 *  ——随从本体的 AI_026/AI_062 不播,但射出弹均为 aiStyle 1,吃 Projectile.AI_001 出膛
 *  音链 ai[1]==0 首拍（2026-09-03 dormant 族审计翻案:旧注"408/433/614/195/389/642
 *  原版无出膛音"只核了随从 AI 本体——433/614/642 仍属实无声,408/195/389 属 aiStyle 1 有声）。
 *  408 原版 ai[1]=num13（AI_062 :67126 传目标槽位,缺省 −1）——仅目标=0 号槽时过
 *  ai[1]==0 门;本仓射弹无 ai1 通道恒 0 → 恒按有声面播（195 的 ai[1]=num159 对 191 族
 *  恒 0、389 无 ai 参,两型原版本就每发必播） */
const MINION_SHOT_SFX: Record<number, { track: string; vol: number }> = {
  374: { track: 'Item_17', vol: 0.7 },
  376: { track: 'Item_20', vol: 0.7 },
  378: { track: 'Item_17', vol: 0.7 },
  967: { track: 'Item_60', vol: 0.7 },
  195: { track: 'Item_17', vol: 0.7 },
  389: { track: 'Item_12', vol: 0.7 },
  408: { track: 'Item_19', vol: 0.7 },
};

/** 敌人最小形状（鸭子类型，避免与 Enemy 循环依赖） */
interface EnemyLike {
  cx: number; cy: number; x: number; y: number; w: number; h: number; id: number;
  dead: boolean;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean;
}

/** Utils.Remap（AI_120 :42222 用；value 截断映射 [from1..to1] → [from2..to2]） */
const remap01 = (value: number, from1: number, to1: number, from2: number, to2: number): number => {
  if (value <= from1) return from2;
  if (value >= to1) return to2;
  return from2 + (to2 - from2) * (value - from1) / (to1 - from1);
};

/** XNA Vector2.CatmullRom（AI_162 :44091 样条插值） */
const catmullRom = (
  v1: { x: number; y: number }, v2: { x: number; y: number },
  v3: { x: number; y: number }, v4: { x: number; y: number }, t: number,
): { x: number; y: number } => {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * (2 * v2.x + (-v1.x + v3.x) * t + (2 * v1.x - 5 * v2.x + 4 * v3.x - v4.x) * t2 + (-v1.x + 3 * v2.x - 3 * v3.x + v4.x) * t3),
    y: 0.5 * (2 * v2.y + (-v1.y + v3.y) * t + (2 * v1.y - 5 * v2.y + 4 * v3.y - v4.y) * t2 + (-v1.y + 3 * v2.y - 3 * v3.y + v4.y) * t3),
  };
};

/** Utils.GetLerpValue（Utils.cs:738-752）：clamped 时外值钳边界 */
export const getLerpValue = (from: number, to: number, t: number): number => {
  if (from < to) { if (t < from) return 0; if (t > to) return 1; }
  else { if (t < to) return 1; if (t > from) return 0; }
  return (t - from) / (to - from);
};

/** ★台账批⑤（2026-08-31）：Utils.SolveQuadratic（Utils.cs:721-737）+ GetChaseResults
 *  （Utils.cs:651-708）1:1 —— AI_067_TryJumpingToTarget 蘑菇支蓄跃拦截速度的真预测面。
 *  旧实现"直瞄归一 ×32"在目标横向移动时永不复现 InterceptTime<120 门内交点。 */
export interface ChaseResults {
  intercepts: boolean;
  time: number;
  positionX: number;
  positionY: number;
  vx: number;
  vy: number;
}
export function solveQuadratic(a: number, b: number, c: number): [number, number] | null {
  const num = b * b - 4 * a * c;
  if (num > 0) return [(-b + Math.sqrt(num)) / (2 * a), (-b - Math.sqrt(num)) / (2 * a)];
  if (num < 0) return null;
  return [(-b + Math.sqrt(num)) / (2 * a), (-b + Math.sqrt(num)) / (2 * a)];
}
export function getChaseResults(
  chaserX: number, chaserY: number, chaserSpeed: number,
  runnerX: number, runnerY: number, runnerVx: number, runnerVy: number,
): ChaseResults {
  if (chaserX === runnerX && chaserY === runnerY) {
    return { intercepts: true, time: 0, positionX: chaserX, positionY: chaserY, vx: 0, vy: 0 };
  }
  if (chaserSpeed <= 0) {
    return { intercepts: false, time: 0, positionX: 0, positionY: 0, vx: 0, vy: 0 };
  }
  const dx = chaserX - runnerX, dy = chaserY - runnerY;
  const dist = Math.hypot(dx, dy);
  const rs = Math.hypot(runnerVx, runnerVy);
  let time = 0, px = 0, py = 0;
  if (rs === 0) {
    time = dist / chaserSpeed;
    px = runnerX; py = runnerY;
  } else {
    const a = chaserSpeed * chaserSpeed - rs * rs;
    const b = 2 * (dx * runnerVx + dy * runnerVy);
    const c = -dist * dist;
    const roots = solveQuadratic(a, b, c);
    if (!roots || (roots[0] < 0 && roots[1] < 0)) {
      return { intercepts: false, time: 0, positionX: 0, positionY: 0, vx: 0, vy: 0 };
    }
    time = roots[0] > 0 && roots[1] > 0 ? Math.min(roots[0], roots[1]) : Math.max(roots[0], roots[1]);
    px = runnerX + runnerVx * time;
    py = runnerY + runnerVy * time;
  }
  return {
    intercepts: true, time, positionX: px, positionY: py,
    vx: (px - chaserX) / time, vy: (py - chaserY) / time,
  };
}

/** Collision.WetCollision（1458 Collision.cs:1575-1650）盒级 1:1 折算：
 *  内探针 = 盒中心 min(10,W)×min(⌊H/2⌋,H) 小盒；扫 盒左列−1..右下+2 外扩窗，
 *  液格水面 Y += (256−液量)/32×2（水面段高同步截短）；坡面格带上格带液同判湿。
 *  台账批⑥：旧实现仅中心单格 liquid>0——顶缘浸水浅滩漏判/半浸早判两向漂移
 *  ★V1（NB-D 遗留收口 2026-09-03）：坡面支补 tile.active() 在场门——原文
 *  `else if (!Main.tile[i,j].active() || …slope()==0 || j<=0 || …) continue;`
 *  （Collision.cs:1632-1634,active() 纯在场位）旧写裸 slope>0 靠"slope 只随活性
 *  写入"的写侧不变量成立,formally 收口为显式在场门：与 npcLiquid.wetCollision
 *  L1 勘误同款——本仓 isActive 是 nactive() 口径会漏致动斜坡,禁用。
 *  ★红蓝对抗 F8（2026-09-04）：幽灵保域后 type!==0 亦非纯在场位——残型格
 *  flags=0,type≠0（wld 导入/生成期 active(false) 留型）须判干,改读 flags bit0
 *  （=active() 位本体;四副本之 MinionProj 漏网,先例 npcLiquid/SmartSelect/
 *  WeaponProj 三副本 2026-09-03 A-F3 已改）；调用面全量传 TileStore（含
 *  type/flags 通道），零调用侧改写 */
export function wetCollisionProbe(
  st: { w: number; h: number; liquid: Uint8Array; slope: Uint8Array; type: Uint16Array; flags: Uint8Array; idx(x: number, y: number): number },
  x: number, y: number, width: number, height: number,
): boolean {
  const cxs = x + width / 2, cys = y + height / 2;
  const pw = Math.floor(Math.min(10, width));
  const ph = Math.min(Math.floor(height / 2), height);
  const bx = cxs - pw / 2, by = cys - ph / 2;
  const i0 = Math.max(0, Math.floor(x / 16) - 1);
  const i1 = Math.min(st.w - 1, Math.floor((x + width) / 16) + 2);
  const j0 = Math.max(0, Math.floor(y / 16) - 1);
  // 上界 = Main.maxTilesY−40（:15806/:15809 字面,Underworld 带扫描裁剪）——仅在
  // 真有该带的世界（h≥200;SW 实际生成图均 ≫ 此值,行为与原版逐字节一致）生效;
  // vitest 小桩（H≈120 等,无地狱带概念,水深常落在字面裁剪带内）回退整高,
  // 否则既定湿判契约（trusty-mounts ⑥ 浅池 ×2 等）被假阳性剪空
  const yCap = st.h >= 200 ? st.h - 40 : st.h - 1;
  const j1 = Math.min(yCap, Math.floor((y + height) / 16) + 2);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const idx = st.idx(i, j);
      if (st.liquid[idx] > 0) {
        const drop = ((256 - st.liquid[idx]) / 32) * 2;
        const top = j * 16 + drop;
        const segH = 16 - Math.trunc(drop);
        if (bx + pw > i * 16 && bx < i * 16 + 16 && by + ph > top && by < top + segH) return true;
      } else if (st.flags[idx] !== 0 && st.slope[idx] > 0 && j > 0) {   // :1632 !tile.active()——flags bit0（V1+F8：曾用 type≠0 代读,幽灵残型坡+上液误判湿）
        if (st.liquid[st.idx(i, j - 1)] > 0 && bx + pw > i * 16 && bx < i * 16 + 16
          && by + ph > j * 16 && by < j * 16 + 16) return true;
      }
    }
  }
  return false;
}

/** Projectile.CanHitWithOwnBody（1458 :12428-12462）本体四试视线 1:1 折算：
 *  CanHit(整盒→整盒) ∪ CanHitLine 三组端点对（朝向前沿中点 ±h/3 档）。
 *  ExtendedCanHitCheckRange 族随从型无登记（ProjectileID.Sets 空表）不折算；
 *  ownerHitCheckDistance=1000 门由调用方射程承载。台账批⑦⑧共用。 */
export function canHitWithOwnBodyBox(
  store: import('../world/TileStore').TileStore,
  sx: number, sy: number, sw: number, sh: number, facing: number,
  ex: number, ey: number, ew: number, eh: number,
): boolean {
  if (canHit(store, sx, sy, sw, sh, ex, ey, ew, eh)) return true;
  const ox = sx + sw / 2 + facing * sw / 2;
  if (canHitLine(store, ox, sy + sh / 2 - sh / 3, 0, 0, ex + ew / 2, ey + eh / 2 - eh / 3, 0, 0)) return true;
  if (canHitLine(store, ox, sy + sh / 2 - sh / 3, 0, 0, ex + ew / 2, ey + eh / 2, 0, 0)) return true;
  if (canHitLine(store, ox, sy + sh / 2, 0, 0, ex + ew / 2, ey + eh / 2 + eh / 3, 0, 0)) return true;
  return false;
}

/** Projectile.CanHitWithMeleeWeapon（1458 :12415-12426）：玩家四点版（gravDir 平地恒 1）。
 *  台账批⑦ IsInRangeOfMeOrMyOwner 主侧门。 */
export function canHitWithMeleeWeaponBox(
  store: import('../world/TileStore').TileStore,
  px: number, py: number, pw: number, ph: number, pFacing: number,
  ex: number, ey: number, ew: number, eh: number,
): boolean {
  if (canHit(store, px, py, pw, ph, ex, ey, ew, eh)) return true;
  const ox = px + pw / 2 + pFacing * pw / 2;
  if (canHitLine(store, ox, py + ph / 2 - ph / 3, 0, 0, ex + ew / 2, ey + eh / 2 - eh / 3, 0, 0)) return true;
  if (canHitLine(store, ox, py + ph / 2 - ph / 3, 0, 0, ex + ew / 2, ey + eh / 2, 0, 0)) return true;
  if (canHitLine(store, ox, py + ph / 2, 0, 0, ex + ew / 2, ey + eh / 2 + eh / 3, 0, 0)) return true;
  return false;
}

/** 接触伤害的每敌冷却（原版 localNPCImmunity 1:1）：
 *  - Projectile.Update :15330 每 update 先整体衰减（DecrementLocalImmuneTimeCounters
 *    :15926-15941），再跑碰撞（Damage_PVE :11878-11884 要求 array[i]==0）
 *  - 命中写入 immuneArray[victimIndex] = localNPCHitCooldown（:14179 分支，
 *    同时 targetNPC.immune[owner]=0 —— 不再吃玩家的全局受击免疫）
 *  ⇒ 命中后恰好 cd 个 tick 再命中（cd=3 → 每 3t 一跳）
 *  ★台账批③修正：此表只承载 localCD≥0 的显式族；localCD=-2 缺省族【不进本表】
 *  （原版两分支全跳过 → 尾支写 npc.immune[owner]=10 玩家全局窗），见 contact()
 *  的 CONTACT_PLAYER_WINDOW 支与 CONTACT_CD_TABLE。旧头注"不吃玩家免疫"对
 *  -2 缺省族恰相反——同玩家一切来源共享 NPC 单窗。 */
export class MinionHitCd {
  private map = new Map<number, number>();
  ready(id: number, cd: number): boolean {
    const t = this.map.get(id) ?? 0;
    if (t > 1) { this.map.set(id, t - 1); return false; }
    this.map.set(id, cd);
    return true;
  }
}

export class MinionProj extends Entity {
  w = 16; h = 16;
  dead = false;
  damage: number;
  knockback: number;
  projId: number;
  /** ★FX34c 弹幕域 hoik=true（Body.hoik 注:原版 Projectile 全路径 true——随从弹
   *  tileCollide 族同 HandleMovement 面,原版可穿 Hoik 单向墙） */
  hoik = true;

  // ---- ★通用湿段（Projectile.cs:16895-17113 全体弹共用段;2026-09-06 杂项弹簇批,
  //  红队 R3 定谳域=1.4.5 新随从八型;2026-09-07 蓝队 K 移交批扩=旧受段族十三型）----
  //  逐 id 豁免核对（SetDefaults P.cs 逐块,【均无 ignoreWater 行】= 全受段,
  //  projectileData 数据面同向）：R3 八型 1022(:9669-9681)/1093(:10197-10210)/
  //  1094(:10212-10222)/1098(:10243-10252)/1112(:10364-10377)/1113(:10379-10389)/
  //  1118(:10452-10464)/1123(:10506-10515);旧受段族（蓝队 K 批逐块复核同向）
  //  317(:4101-4111)/390-392(:4744-4756)/393-395(:4757-4769)/758(:7816-7829)/
  //  833-835(:8084-8125)/917(:8703-8714)/1036(:9769-9780)。
  //  · 本批不接的主类 id（红队域外,豁免面亦核对备查）：AI_062 五射手 373(:4565)/
  //    375(:4589)/407(:4880)/423(:4962)/613(:6600)/963(:9102)、533(:5999)/387(:4700)/
  //    388(:4716)/653(:7014)/627(:6737)/628(:6733)/831(:8069)/970(:9184)/946(:8924)/
  //    755(:7779)/1119(:10466) 均 ignoreWater=true=豁免。
  //  · 1106 狐火（MinionShot ∈ IsDestroyedByWater{85,15,188,34,1097,1106},
  //    ProjectileID.cs:287;SetDefaults :10305-10317 无 ignoreWater 行=受段）走
  //    Arrow 载体（foxChannel 支 spawn）——ARROW_DESTROYED_BY_WATER（Arrow.ts:546）
  //    已含 1106,水death 消亡面已接 killNow,本类湿段 hooks 不涉（域内 id 均不在
  //    IsDestroyedByWater 表,kill 钩恒空）。
  //  插位=tick 头（fixedUpdate 首）+★AI 湿旗读相=上拍快照 wetAi（2026-09-08 定谳批,
  //  Terarria1457/Terraria/Projectile.cs 逐读点核）：
  //  【①消费者定谳】原版 Update 子步序=AI(:16880) → 湿段(:16895-17113) → Shimmer
  //  (:17114) → HandleMovement(:17122) → AI 读【上一子步】段值。AI_067 湿旗消费全集：
  //  :51027 海盗俯扑门 !wet（flag=393-395 → pirateStep 消费）/ :51084 卡提瓦俯扑门
  //  !wet（flag8=1093/1112——★2026-09-08 续单两门补接:!wet（读相 wetAi）+ai[1]==0
  //  （=palA1,:50954 出扑归零）;湿中下落已由共享尾 :52114 支让位承接=原文两支以
  //  wet 互斥）/ :51616 贴地跳 ×2 共享核（`if (velocity.Y==0f)` 段
  //  flag 全族可达——flag6/8/9=1022/1093/1112/1118 亦消费,旧注「R3 八族 vanilla
  //  零消费」有误已纠;仓内消费位=tigerBody/pirateStep/frogStep/palGroundStep/
  //  mushBoiStep 全读 wetAi）/ :52114 TryJumpingToTarget wet∧vy>0∧!shouldFallThrough
  //  →视作贴地+共享尾 :52151-52164（★2026-09-08 续单 1:1 补接=
  //  ai67TryJumpingToTargetTail,五家族调用位随原文 :51024 时序置结算段/俯扑门前;
  //  :52119 系 vanilla `_=` 丢弃死码;shouldFallThrough 域内死码、ai[0]==3 档
  //  num4=16 与 :51212 栖点调用位未折算=登记,见 helper 注）。AI_026 :60716/:60734
  //  属 774/1046 帧 选支（域外）;AI_204/AI_062 零消费 ✔。
  //  【②相位差定谳】湿段采样位两序同位（=上拍位移后位）;差在 AI 读相:vanilla 读
  //  上拍段值,旧实现读当拍段值——稳态同值,分叉仅「运动中跨液面拍」（步行横移/
  //  坠落跨水面且当拍有 ×2/俯扑判定;×2=起跳速 2×,贴水跳 2 倍高,可感）→ 修。
  //  【③挪位不可达→快照刀】原版序须把湿段插到各族 AI 与位移之间,而本类家族 AI 与
  //  位移同函数体、ai0=1/2/4/5 早退 return 15+ 处会整跳湿段（溅花/wetCount/旗维护
  //  停摆,劣于相位差）→ 保留 tick 头插位,消费位改读 wetAi 上拍快照（=上拍段尾
  //  this.wet,与 vanilla AI 读上拍段值逐位同源;首拍=出生预置值——vanilla
  //  NewProjectile :10886-10893 时点先于首拍 AI,预置先行单跑=首拍当拍段同位）。
  //  probe 消费位（pal/mush）随批退役归一（wetCollisionProbe 本体保留=unit 钉测/
  //  台账批⑥面）。AI 中途瞬移拍（>2000 回收/虎扑链直写位）:AI 读值两序同为瞬移前
  //  采样（快照=上拍位,原版=上拍段采样位,同向）;湿段副作用（溅花）采样位仍取拍头
  //  位=瞬移前,较原版（AI 后=瞬移后位）晚 1 拍触发,登记近似（随原插位批）。
  //  阻尼=各族位移位乘 projWaterDragFactor（HandleMovement :17721-17764 湿支只对
  //  tileCollide=true 宿主跑——917 SetDefaults tileCollide=false(:8708) 与 317
  //  归位态 ai[0]==1（aiStyle 54 :29079 else 支;:29042 attack 态置真）不适用,各支留锚）。
  //  杀拍口径（Arrow.ts ⑥配方逐位核）：主类全部杀位=哨兵寿命(:4294)/携行失主
  //  (:4309)【哨兵八型不涉,且哨兵 id 全豁免（663/665/667:7137/677-679:7248/
  //  688-690:7332/308:4004/377:4622/966:9150/1025:9714/641:6923/643:6936）】/
  //  随从失主(:4910)/钻地龟四杀位(digtoiseStep :2143/:2144/:2168/:2176)——
  //  全部在 tick 头调用【后】→ 湿段杀拍恒跑,双调用点/防双跑机不适用
  //  （单调用点天然覆盖）;palGroundStep/mushBoiStep/foxChannel 零杀位。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐拍 −1） */
  wetCount = 0;
  /** 出生预置已做（一次;NewProjectile :10886-10893 等价;共享体首调自做） */
  presetDone = false;
  /** ★AI 湿旗读相=上拍段值快照（2026-09-08 定谳批,消费者/相位差/挪位不可达三段
   *  定谳见类字段块头注①②③）：vanilla AI(:16880) 先于湿段(:16895) → AI_067 湿旗
   *  消费者读【上一子步】段值;本类家族 AI 与位移同函数体无法拆序 → tick 头湿段
   *  保留,家族消费位改读本快照（fixedUpdate 湿段块于每拍段体前赋值=上拍段尾
   *  this.wet,与 vanilla AI 读值逐位同源;首拍=出生预置值）。阻尼仍读 this.wet
   *  （HandleMovement :17721 本子步湿段后旗,原文同相）——勿把阻尼位改读本字段。 */
  private wetAi = false;

  /** true=哨兵（定点炮台，独立于随从上限） */
  sentry: boolean;
  /** 1457 哨兵携带态（原版 ai[2]==1f，IsSentryBeingCarried :80527-80530）：被
   *  accSentryBackpack 四件（6172/6175/6176/6177）拾起背在身上——随玩家移动、
   *  照常开火、仍占哨兵上限（WipableTurret :530-540 不豁免携带态）；拾起后无
   *  放下机制，直至消亡/被驱逐（UpdateMaxTurrets :53699-53727 同池） */
  carriedByBackpack = false;
  /** 哨兵剩余寿命（t；随从不耗） */
  life: number;
  /** 同列槽位序（多随从环形悬停错位） */
  slot: number;
  private ownerRef: () => Player | null;

  /** 弹幕染料通道 vid（清偿刀 N 2026-09-30）——GetProjectileDesiredShader 1:1：
   *  随从族（minion 旗取数据面 vanillaProjectiles.minion=SetDefaults 照录;哨兵
   *  663/677 族原版 minion=false=无通道）→ cMinion=唯一源 CritterShampoo(4762)
   *  配对染料（Player.cs:9832-9834 UpdateItemDye 链）;623 虽 minion=true 但 switch
   *  覆写 → cPet（Main.cs:22457-22459）;818 扑击弹同 switch → cMinion（TigerPounce
   *  同款）。owner 引用=本体 Player,窄接口读 inv;缺 → 0。 */
  private minionDyeVid(): number {
    const p = this.ownerRef();
    const inv = (p as unknown as { inv?: DyeInvSource } | null)?.inv;
    if (!inv) return 0;
    const ch = dyeChannelsOf(inv);
    if (!(ch.cPet > 0) && !(ch.cMinion > 0)) return 0;
    return getProjDesiredDyeVid(
      {
        vid: this.projId,
        minion: !!projectileData(this.projId)?.minion,
        damage: this.damage,
        aiStyle: projectileData(this.projId)?.aiStyle,
      },
      ch,
    );
  }
  hitCd = new MinionHitCd(); // dragon 全链共用实例
  private shootCd = 0;
  /** 地面型重力 */
  private ground: boolean;
  onGround = false;
  /** 存活 tick（多帧贴图动画驱动） */
  age = 0;
  /** 哨兵开火状态机（AI_130）：0=待机 1=开火动画中 */
  sFire = 0;
  sFireT = 0;
  sCool = 0;
  /** aiStyle 53 一次性初始化门（localAI[0]==0 → ai[0]=120，:27176-27181） */
  sInit = 0;
  /** 闪电光环方形场边长（AI_137 :65972-65981 净空测量；0=未测）与场中心 Y（地面点） */
  auraSide = 0;
  auraCy = 0;
  /** AI_137 电弧声循环 ai[0] 镜像（30t/僧侣T2 25t 一轮,:69955-69979——台账批 C-3472） */
  private zapCycle = 0;
  /** 朝向（哨兵 spriteDirection / 随从渲染翻转） */
  facing = 1;
  /** 攻击闪光 tick（AI_062 小鬼攻击帧 +4 门：命中后 24t） */
  attackFlash = 0;
  /** 随从世界点光（Game 实体光通道读 lightRGB——原版各 AI 的 Lighting.AddLight）：
   *  755 血蝙蝠 = Crimson CastLightOpen（:48604 GetColor=Color.Crimson(220,20,60)）；
   *  613 星尘细胞 (0.2,0.6,0.7)（:62191）；623 守护者 (0.9,0.9,0.7)（:41997）；
   *  1094 Foxparks (0.5,0.3,0.1)（:55275）；533 致命球 ai0%3≠2 橙/≡2 青（:28542-
   *  28551，无态机取橙档）；653 同伴方块白光 0.5（:46598 档位近似）。
   *  ★SW-RB11e 2026-09-10：641 月门补 (0.3,0.9,0.7)（AI_123 flag 支 :37744
   *  `Lighting.AddLight(Center, (0.3,0.9,0.7)*Opacity)`,Opacity 增幅未建模=常数档,
   *  同 613/623 口径；643 彩虹水晶原版无 AddLight 不进表）。
   *  ★BJ245（2026-09-21）：833-835 沙漠虎白光补课（BJ235 登记债清偿;旧注把
   *  虎列入「零自发光」系矛盾,反编译亲读推翻）——AI_067 flag3 支 ai[0]!=4 门内
   *  逐型 Lighting.AddLight(Center,…)（1457 Projectile.cs:50164 门/:50174-50185
   *  三型;1458 :50175-50186 同文零变更）：833=One×0.5 / 834=One×0.8 /
   *  835=Lerp(OurFavoriteColor(255,231,69),White,0.8).ToVector3()×1 =
   *  (255,250.2,217.8)/255（暖白黄）。ai[0]==4=链发后等待态不发光（tigerA0）。
   *  387/388/373/375/407/423/266/蜘蛛/阿比盖尔/龙链原版零自发光（虎已出列）。 */
  get lightRGB(): [number, number, number] | null {
    switch (this.projId) {
      case 755: return [220 / 255, 20 / 255, 60 / 255];
      case 613: return [0.2, 0.6, 0.7];
      case 623: return [0.9, 0.9, 0.7];
      case 1094: return [0.5, 0.3, 0.1];
      case 533: return [0.8, 0.3, 0.1];
      case 653: return [0.5, 0.5, 0.5];
      case 641: return [0.3, 0.9, 0.7];   // ★SW-RB11e：AI_123 :37744（月门青绿光）
      // ★BJ245：沙漠虎三档白光（AI_067 :50174-50185;ai[0]!=4 门=tigerA0 镜像）
      case 833: return this.tigerA0 !== 4 ? [0.5, 0.5, 0.5] : null;
      case 834: return this.tigerA0 !== 4 ? [0.8, 0.8, 0.8] : null;
      case 835: return this.tigerA0 !== 4 ? [1, 250.2 / 255, 217.8 / 255] : null;
      default: return null;
    }
  }
  /** 不占随从槽位（沙漠虎/阿比盖尔本体、龙身体段、星尘守护者——原版 minionSlots=0/不统计） */
  noSlot = false;
  /** 龙链父段引用（626/627/628 跟随前段） */
  parentRef: (() => MinionProj | null) | null = null;
  /** 虎扑链状态（AI_067）：ai[0] 4=链发后等待 / ai[1]=剩余等待 tick（:46702-46718） */
  private tigerA0 = 0;
  private tigerA1 = 0;
  /** ★BJ235 通用 oldPos 残影环（Projectile.cs:17197-17300 UpdateTrails 表驱动;
   *  Main.cs:30609 通用表+逐型色/帧锚特支）。undefined=未初始化/null=该 id 无
   *  记录式（随从活动集内 533/755/833/834/835 有 TrailingMode,余 id 缺省 -1 → null）。
   *  533 ai0 态机=dA0（0-2 待机/3-5 蓄力/6-8 冲刺/9-11 归位——幽灵档 :31084-31098
   *  只吃 6/7/8 冲刺三态）;833-835 色特支吃速度染（GHOST_TINT vxLen 面）+帧门锚。 */
  private ghostRing?: ProjGhostRing | null;

  /** ★BJ235 每拍记录（UpdateTrails :17198=Damage 后同序——随从无 extraUpdates,
   *  1 子步/拍;调用位=fixedUpdate 尾 contact 后=原版 Damage→UpdateTrails 同位）。
   *  533 冲刺态 dA0∈[6,8] 才展开环（:31084-31098 幽灵档 resolveGhostLoop 门）。 */
  private recordGhostTrail(): void {
    if (this.ghostRing === undefined) {
      this.ghostRing = projTrailingMode(this.projId) >= 0 ? new ProjGhostRing(this.projId) : null;
    }
    this.ghostRing?.record(this.x, this.y, this.rot, this.facing >= 0 ? 1 : -1, true);
  }
  /** 守护者 AI_120 状态（ai[0]/ai[1]/frameCounter/retarget 计数） */
  private gA0 = 0;
  private gA1 = -1;
  private gFc = 0;
  private gFrame = 0;
  private gRetarget = 0;
  /** Projectile.alpha 镜像（AI_120 :45482/:45718）——状态 3 飞行段 255=隐身；
   *  离场拍 top-of-AI（ai[0]!=3 ∧ alpha==255）复位 0+30 粒尘爆 */
  private gAlpha = 0;
  /** 乌鸦 AI_054 状态（ai[0] 归位态 / ai[1] 扑击计时 / 帧区 0=飞 1=扑） */
  private rA0 = 0;
  private rA1 = 0;
  /** 原版 Projectile.friendly 字段镜像（AI_054 内动态翻转：跟随期 :27474 true→
   *  :27519 false、扑击倒数 :27566 false、冲刺帧 :27547 true——下一 tick 的
   *  归位门 :27423 读上一 tick 末值） */
  private rFriendly = false;
  ravenZone = 0;
  /** 致命球 533 相位机（AI_066，ai[0]/ai[1]/localAI[0] 镜像）：
   *  ai[0] 0-2 待机 / 3-5 蓄力 / 6-8 冲刺 / 9-11 归位冲刺；自旋与待机帧动画只在
   *  ai[0]<3 || ≥9（:28874-28877/:28891-28893——3-8 冲刺段不自旋） */
  private dA0 = 0;
  private dA1 = 0;
  private dLai0 = 0;
  /** AI_062 射手族态机（373/375/407/423/613，1457 Projectile.cs :66067-67166 镜像）：
   *  a62A0=ai[0]（0 交战 / 1 归位 / 2+ 攻击闪·423/613 冲刺）、a62A1=ai[1]（射击冷却
   *  随机计数器 + 423/613 冲刺时长）、a62Lai0=localAI[0]（423/613 冲刺冷却 60） */
  private a62A0 = 0;
  private a62A1 = 0;
  private a62Lai0 = 0;
  /** 423/613 冲刺 extraUpdates 镜像（Projectile.extraUpdates）：触发拍 = (int)ai[1]
   *  （:66559/:66597）→ 下一拍 Update 跑 ai[1]+1 次完整 AI 子步（Update :16780-16783
   *  numUpdates 循环）;归零子步重置回 0（:66178/:66236）。0=非冲刺 */
  private a62EU = 0;
  /** 蜘蛛 390-392 步行链状态（AI_026 flag7，:62771-63340/:65092-65230 镜像）：
   *  spLai0=localAI[0]（LOS 接敌续走计时 60）、spLai1=localAI[1]（撤退档计时——命中
   *  置 20 :14027-14030,每拍递减 :62958-62963,>0 撤退=不咬+沿速度向续走 :63003-63012）、
   *  spA0=ai[0]（0 地面作战 / 1 归位飞行）、spFrame=帧通道（0-2 走 / 3 空 / 4-7 爬墙）、
   *  spDir=direction 镜像（:63302-63315,渲染 spriteDirection=-direction :65166） */
  private spLai0 = 0;
  private spLai1 = 0;
  private spA0 = 0;
  private spDir = 1;
  spFrame = 0;
  /** 吸血蛙 758 状态（AI_067 flag2，:50478-50482/:51161-51177/:51296-51619 镜像）：
   *  frA0=ai[0]（0 地面 / 1 归位飞行 / 2 扑击）、frA1=ai[1]（扑击倒数 num10=20） */
  private frA0 = 0;
  private frA1 = 0;
  /** 地面步行族 StepUp 坡步门（AI_026 :63261 / AI_067 :51508 同款 Collision.StepUp——
   *  spiderStep/frogStep 入口置位;palGroundStep/mushBoiStep 2026-09-07 嵌入定谳批
   *  补接（帕鲁扑击支显式复位 false,原版 StepUp 不入 ai[0]==2 块）,moveAndCollide 消费） */
  stepUp = false;
  /** Projectile.tileCollide 镜像（AI 逐态直写,moveAndCollide 消费=false 整段跳过碰撞）：
   *  蜘蛛归位飞行 :61410 false / 地面 :62843-62845 盒无实心回 true / :62852-62860
   *  LOS 目标在下方且脚踩平台 → false（穿平台下扑）;蛙归位飞行 :50648 false /
   *  地面 :51266 true */
  tileCollide = true;
  /** AI_120 当前状态（ai[0]：0 跟随 / 1 rest 驻守 / 2 冲刺拳击 / 3 rest 点飞行；诊断与回归用） */
  get ai120State(): number { return this.gA0; }
  /** AI_120 alpha 镜像（:45482/:45718）——255=隐身（状态 3 飞行段） */
  get ai120Alpha(): number { return this.gAlpha; }
  /** 家族一次性初始化（龙链生成） */
  private spawned = false;
  /** 阿比盖尔 970 升级音一次性门（Projectile.cs:43971 localAI[0]==0 语义） */
  private abigailUpgChecked = false;
  /** Foxparks 喷火弹 1106 出膛音三发一门（Projectile.cs:38956 whoAmI%3==0） */
  private foxFlameN = 0;
  /** 渲染旋转（龙链：段朝向 = 指向父段 +PI/2，同原版 rotation=velocity.ToRotation()+PI/2） */
  rot = 0;
  /** Foxparks 5664 手持喷火通道（AI_026 ai[0]>=1000：每 4t 发 1106，Game 每帧置 true+瞄准） */
  foxChannel = false;
  foxAimX = 0; foxAimY = 0;
  private foxT = 0;
  /** projectile.soundDelay 镜像（1094/1113）：初值 0 与原版 SetDefaults 同
   *  （Projectile.cs:350/:751），AI_026 首段每 tick --（:59119-59120——出场段
   *  -1 PalSummon/-20 PalFoxparks 两声已并入 MINION_SUMMON_SFX 表按 age 节拍,
   *  本槽只承载 TryUsingFoxsparksAbility 攻击叫声称的门/重置 :43691-43694,
   *  见 fixedUpdate 消费点）*/
  private foxSoundCd = 0;
  /** 火绒狐 1094/1113 帧态机（AI_026 flag8 帧段 :64729-64826 折算,foxAnimTick 维护）：
   *  foxFrame 直映原版 frame——待机 18-25 / 行走 28-35 / 空中 27 / 攻击 36-41 往返 /
   *  抚摸 45-52（网格切片见 Arrow PROJ_GRID,帧域 = 列主序 6×9） */
  private foxFrame = 18;
  private foxFrameCd = 0;
  /** 上一拍 X（flag27 = position.X==oldPosition.X 横向零位移判定 :63334） */
  private foxPrevX = 0;
  private pounceCd = 0;
  /** 帕鲁出场淡入（DoPalAppearEffect :39509-39515：SetDefaults alpha=255 起每 tick
   *  -15，17t 全显——1093 :10211 / 1112 :10377 / 1113 :10400 / 1118 :10485；其余随从
   *  0=不淡入） */
  alphaFade = 0;
  // ---- 帕鲁地面随从 1093/1112/1118（AI_067 flag8/flag9 态机，ai[0]/ai[1] 镜像）----
  /** ai[0]：0 地面跟随/索敌 / 2 扑击（1 归位飞行与 5 Boss 追击见 palGroundStep 注） */
  private palA0 = 0;
  /** ai[1]：扑击剩余 tick（num10 初值 16/30，:50490/:50499） */
  private palA1 = 0;
  /** 帧（AI_067 flag8/flag9 原版帧机驱动，draw 消费——2026-08-24 用户报捣蛋猫
   *  攻击白团、2026-08-25 复发实锤双根因：①此前 1093 根本没进本态机（走通用飞行
   *  近似 + age/8%28 全帧循环,把表内 14-27 白姿 hurt 带也播出来）；②1112 的
   *  步行帧机曾按"flag8 不写 frame"误读实现成冻结。1457 实文两型都有完整帧机
   *  （flag8 :51841-51877 立地 0/抚摸 13/走 7-12/空气 1-2；flag9 :51879-51930
   *  立地 0/抚摸 16/走 8-14/空气 1-2）+ 肩扛 0/1/2（Player.vy 阈 :50788-50800）
   *  + 扑击 3+(num10-ai1)/(num10/4)（:50880/:50912） */
  palFrame = 0;
  private palFrameCd = 0;
  /** 阿比盖尔一阶 963 帧机（AI_062 963 档 :66843-66868）：攻击态 fc/12 循环 0-6
   *  收于 5；跟随态 7t 循环 0-7——draw 消费（2026-08-24 同类审计补） */
  a963Frame = 0;
  private a963Fc = 0;
  // ---- 1457 帕鲁钻地龟 1098/1123（AI_204_Digtoise Projectile.cs:39169-39506 态机，
  //      2026-08-23 内容缺口批；物品 5667 PalworldDigtoise / 6174 PalworldTrustyDigtoise）----
  /** ai[0]：0 出场 / 1 向下挖 / 2 向右挖 / 3 向左挖 / 4 离场 / 5 抚摸（:39173-39178） */
  private digA0 = 0;
  /** ai[1]：态内计时（出场 180t 转挖 / 挖掘节拍 num4=40 蓄势 + 20/10t 间隔 / 离场 600t 灭） */
  private digA1 = 0;
  /** localAI[1]：挖掘帧加速计数（num7 = 4 - lai1/4，:39377-39380） */
  private digLai1 = 0;
  /** 挖掘帧（0-2 出场/待机，2-9 挖掘循环 :39237-39245/:39375-39390） */
  digFrame = 0;
  private digFrameCounter = 0;
  /** soundDelay 镜像：出场段 pal_summon(-1)/pal_digtoise(-20) 与挖掘段 Item199
   *  （≤0 → 置 10）共用槽（:39222-39231/:39395-39397）——出场两声已并入
   *  MINION_SUMMON_SFX 表（at 1/20 与原版节拍同构），本槽只承载挖掘声 */
  private digSoundCd = 0;
  /** 挖掘态读口（Game.commandDigtoises :48713-48726 指挥链） */
  get digtoiseA0(): number { return this.digA0; }
  set digtoiseA0(v: number) { this.digA0 = v; this.digA1 = 0; }
  /** 抚摸中（flag10 = player.petting.isPetting && petting.proj==whoAmI :50053/:59101
   *  的本仓等价——Game 抚摸白名单写入，petting 停止时统一清） */
  beingPetted = false;
  /** 抚摸 Joy 计时（localAI[0] :50106-50113 1093/1112/1118 镜像 / localAI[2]
   *  :59122-59131 1094/1113 镜像）：flag10 且归零 → 60t 重触发 Joy 音；
   *  `> (flag10?1:0)` 递减——抚摸中钉 1、停摸后放空到 0 */
  palJoyCd = 0;
  // ---- 蘑菇小伙伴 1022（Dead Cells 联动,5456；AI_067 flag6 :50023/:50140-50148 折算）----
  /** ai[0]：0 地面跟随/索敌 / 1 归位飞行（:50444 flag14=false+friendly=true、
   *  :50448-50450 检索档 0||1） */
  private mbA0 = 0;
  /** ai[2]：跃击/爆炸态（TryJumpingToTarget 1022 支 :52108-52152 置 30;爆点支
   *  :50599-50621 爆后置 -120 冷却;<0 逐拍 ++ 回零,>0 空中逐拍 −−贴地归零
   *  :50622-50630;Damage_CanDealDamage (1022&&ai[2]>0)=false :12463） */
  private mbA2 = 0;
  /** localAI[2]：跃击前摇计数（TargetFound 编排粒子首拍 + 15t 蓄势 :52127-52147;
   *  无目标清零 :51017-51019） */
  private mbLai2 = 0;
  /** 帧通道（AI_067 flag6 帧机 :51642-51681 直写,draw 消费）与帧计 */
  mushFrame = 0;
  private mushFrameCd = 0;
  // ---- 同伴方块 653（AI_067,Projectile.cs:46657/46804-46860/47055-47830）----
  private cubeA0 = 0;     // ai[0]：0 地面跟随 / 1 归位悬浮
  private cubeLai0 = 0;    // localAI[0]：岩浆尖叫计数 0..20（近主清零 :47088）
  private cubeLai1 = 0;    // localAI[1]：黑暗计数 -3600..120（阈值后捅人）
  private cubeRot = 0;     // rotation（+=vx/20 :46805；贴靠时 AngleTowards 0）
  /** _CompanionCubeScreamCooldown[owner]（静态 float[256]——单人取模块级等价） */
  private static cubeScreamCd = 0;

  // ---- 旗舰家族分支（行号见各方法注释；均在通用运动前 return）----

  /** 星尘龙头（aiStyle 121 :40138-40403）：加速追敌（acc 0.4/0.6/0.8 ×1.5=0.6/0.9/1.2
   *  限速 30，穿墙穿敌）/ 跟随玩家（限速 15，>2000px 传送）；伤害 ×(1+0.23×localAI[0])
   *  （:12097，localAI[0]=距尾段数，头=全段数）；首次生成 626→627→628 链（段距 16px），
   *  全链共用一张命中表（7t/敌） */
  /** AI_121 索敌 1:1（1457 :43653-43695 / 1456 :40178-40219）——★专用择敌（不共用
   *  nearestEnemy）：原版野生支遍历 Main.maxNPCs 升序、过门即覆盖写 num6（:43690/
   *  :40216——无最近比较、无 break）＝【最后一个通过门的候选】胜,遍历序敏感;
   *  nearestEnemy 的"最近"语义是其余消费者的共性近似,龙专属覆盖语义在此承载
   *  （2026-09-08 收口裁断:共享助手不动,爆破半径最小）。
   *  · 集火支（OwnerMinionAttackTargetNPC→minionTargetId）:存在性+CanBeChasedBy
   *    （:43663-43664/:40189-40190）+距龙 num4×2<1400（:43667/:40193,无 num5 门、
   *    无视线门）;未过门 → num6 仍−1 → 野生支照跑（原文即如此,非互斥挡板）。
   *  · 野生支:CanBeChasedBy ∧ 距玩家 num5<1000（:43685/:40211）∧ 距龙
   *    num4<700（:43688/:40214）;本仓 enemies() 即槽位升序=遍历序同构。
   *  · 原文本支无鞭 tag 支（nearestEnemy 通用 tag 层不适用于 AI_121,不建模）。 */
  private dragonTarget(game: GameHooks, p: Player): EnemyLike | null {
    const focus = (p as unknown as { minionTargetId?: number }).minionTargetId ?? -1;
    if (focus >= 0) {
      for (const e of game.enemies()) {
        const en = e as never as EnemyLike & { dead: boolean };
        if (!en || en.dead || en.id !== focus) continue;
        if (!canBeChasedBy(e)) break;                    // :43664/:40190 → num6=−1 → 野生支
        if (Math.hypot(en.cx - this.cx, en.cy - this.cy) < 1400) return en;  // :43667/:40193
        break;
      }
    }
    let num6: EnemyLike | null = null;
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean };
      if (!en || en.dead) continue;
      if (!canBeChasedBy(e)) continue;                   // :43685/:40211 前置
      if (Math.hypot(en.cx - p.cx, en.cy - p.cy) >= 1000) continue;        // num5
      if (Math.hypot(en.cx - this.cx, en.cy - this.cy) >= 700) continue;   // num4
      num6 = en;                                         // 覆盖写——末位通过者胜
    }
    return num6;
  }

  private dragonHead(game: GameHooks, p: Player, dmg0: number): void {
    const ents = (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities;
    if (!this.spawned) {
      this.spawned = true;
      let parent: MinionProj = this;
      for (const seg of [626, 627, 628]) {
        const m = new MinionProj(this.cx, this.cy, seg, this.damage, this.knockback,
          false, 0, false, this.ownerRef);
        // 基础链段 noSlot：原版 626/627 各 0.5 槽（:6737-6739）+ 头 0 槽 = 1 槽,
        // 本仓头 625 计 1 槽 + 段 0 = 总量等价（延伸段另计,见 extendDragon 注）
        m.noSlot = true;
        const par = parent;
        m.parentRef = () => (par.dead ? null : par);
        m.hitCd = this.hitCd; // 全链共用命中表（localNPCHitCooldown=7 语义）
        ents.add(m, 'projectiles');
        parent = m;
      }
    }
    const scale = 1 + 0.23 * this.dragonLocalAI0(game);
    // >2000 瞬移（:43656-43660 / :40182-40185）：索敌【前】无条件,base.Center =
    // player.Center——中心即玩家心（盒 24×24 :6743-6744 → 左上=心−12）;原版不清
    // 速度（动量保留,AI 从新位续走）。曾错挂 no-target 支 +(−30,−30) 旧盒径残留
    // （中心落 pcx−18）,双错一并清偿（2026-09-08）。
    if (Math.hypot(p.cx - this.cx, p.cy - this.cy) > 2000) {
      this.x = p.cx - 12; this.y = p.cy - 12;
    }
    // 索敌 1:1（AI_121,1457 :43653-43695 / 1456 :40178-40219）——dragonTarget
    // 原文字面（集火 num4×2<1400 + 野生双门 num5∧num4 + 末位覆盖语义）
    const tgt = this.dragonTarget(game, p);
    if (tgt) {
      const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      // 1456 :40229-40236：acc 档 0.4/0.6/0.8 ×1.5 → 0.6/0.9/1.2
      const acc0 = d < 300 ? 0.8 : d < 600 ? 0.6 : 0.4;
      // :40237-40244 距敌 > 敌判定盒对角线×0.75 才推进；推进后 Dot(velocity,vector)<0.25
      // （vector 未归一）→ velocity×0.8 阻尼（横向/背向减速）
      if (d > Math.hypot(tgt.w, tgt.h) * 0.75) {
        this.vx += (dx / d) * acc0 * 1.5;
        this.vy += (dy / d) * acc0 * 1.5;
        if (this.vx * dx + this.vy * dy < 0.25) { this.vx *= 0.8; this.vy *= 0.8; }
      }
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 30) { this.vx *= 30 / sp; this.vy *= 30 / sp; }
    } else {
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      // >2000 瞬移已上移索敌前（:43656-43660/:40182-40185 无条件）——旧 no-target
      // 支 (−30,−30)+清速残支撤除（中心错位见方法首注）
      if (d > 100) {
        const acc = d < 140 ? 0.06 : d < 200 ? 0.12 : 0.2;
        this.vx += (dx / d) * acc;
        this.vy += (dy / d) * acc;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 15) { this.vx *= 15 / sp; this.vy *= 15 / sp; }
      } else {
        this.vx *= 0.96; this.vy *= 0.96; this.vy -= 0.1; // 近距缓刹 + 轻微上浮（:40168）
      }
    }
    this.x += this.vx;
    this.y += this.vy;
    if (Math.hypot(this.vx, this.vy) > 0.5) this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;
    const fd = tgt ? Math.sign(tgt.cx - this.cx) : Math.sign(this.vx);
    if (fd !== 0) this.facing = fd;
    this.contact(game, dmg0 * scale, 7);
  }

  /** 喷火后攻击锁（Game 通道断开时调：localAI[0]=30 :56155） */
  lockAfterFoxChannel(): void { this.shootCd = Math.max(this.shootCd, 30); }

  /** 召唤入口后置射击冷却（shootCd = 本仓 ai[0]/localAI[0] 射击槽等价）：
   *  6149→1113 `Main.projectile[num145].localAI[0] = 30f`（Player.cs:48945）/
   *  6164→1119 SpawnMinionOnCursor `case 6164: ai = 45f`（:50115，AI_206 首轮
   *  开火循环前置 45t :38272）。1094 的 :56155 同语义走 lockAfterFoxChannel */
  armSpawnCooldown(t: number): void { this.shootCd = Math.max(this.shootCd, t); }

  /** 再召唤延伸：尾(628)前插入 2 段（626+627）（Player.cs:47906-47963）。延伸段
   *  minionSlots=0.5/段（:6737-6739,2 段=+1 槽）→ noSlot=false 计入槽位账;超限由
   *  每 tick 自裁链（Game 召唤上限缩水段,:16812-16845）摘链击杀——延伸不免费 */
  extendDragon(game: GameHooks): boolean {
    const projs = (game as unknown as { entities: { projectiles: unknown[]; add: (e: unknown, b: string) => void } }).entities;
    const tail = projs.projectiles.find((m) =>
      m instanceof MinionProj && !m.dead && m.projId === 628) as MinionProj | undefined;
    if (!tail || !tail.parentRef) return false;
    const oldParent = tail.parentRef;
    const a = new MinionProj(tail.cx, tail.cy, 626, this.damage, this.knockback, false, 0, false, this.ownerRef);
    const b = new MinionProj(tail.cx, tail.cy, 627, this.damage, this.knockback, false, 0, false, this.ownerRef);
    a.noSlot = b.noSlot = false;              // :6737-6739 minionSlots=0.5f×2
    a.parentRef = oldParent;
    b.parentRef = () => (a.dead ? null : a);
    tail.parentRef = () => (b.dead ? null : b);
    a.hitCd = b.hitCd = this.hitCd;
    projs.add(a, 'projectiles');
    projs.add(b, 'projectiles');
    return true;
  }

  /** 龙链段自裁摘链（Update :16816-16830 / FreeUpPetsAndMinions :52440-52452 同构）：
   *  626/627 被杀（超限自裁/驱逐）先把父段接到子段——链缩短不断裂（原版 proj.ai[0]/
   *  localAI[1] 互指改写;本仓 parentRef 闭链等价） */
  unlinkFromChain(projs: readonly unknown[]): void {
    const par = this.parentRef?.() ?? null;
    for (const e of projs) {
      const c = e as MinionProj;
      if (!(c instanceof MinionProj) || c === this || c.dead) continue;
      if (c.parentRef && c.parentRef() === this) {
        c.parentRef = () => (par && !par.dead ? par : null);
      }
    }
    this.parentRef = null;
  }

  /** 星尘龙 localAI[0] 等价（1456 Projectile.cs:40342 每段找父后 parent.localAI[0]=
   *  self+1——链自尾向头传播：尾 628=0、627=1、626=2、头 625=3（基础龙 3 段）；
   *  再召唤插段同式累加）。伤害 ×(1+0.23×clamp(localAI[0],0,50))（:12097-12102，
   *  scale=1+localAI[0]×0.01 → value=(scale-1)×100）——逐段各自档位，非全链同值 */
  private dragonLocalAI0(game: GameHooks): number {
    const total = this.peerCount(game, 626) + this.peerCount(game, 627) + this.peerCount(game, 628);
    if (this.projId === 625) return Math.min(50, total); // 头 = 全段数
    let k = 0;
    let cur: MinionProj | null = this;
    while (cur && cur.projId !== 625 && k <= total) { cur = cur.parentRef?.() ?? null; k++; }
    return Math.min(50, Math.max(0, total - k));        // 段 = 全段数 − 距头步数
  }

  /** 龙身/尾（626/627/628）：无自主速度——纯链式跟随（:40384 pos=父段心-方向×16px） */
  private dragonSegment(game: GameHooks, p: Player, dmg0: number): void {
    void p;
    const par = this.parentRef?.();
    if (!par) { this.dead = true; return; } // 头亡链断
    const dx = this.cx - par.cx, dy = this.cy - par.cy;
    const d = Math.hypot(dx, dy) || 1;
    this.x = par.cx - (dx / d) * 16 - this.w / 2;
    this.y = par.cy - (dy / d) * 16 - this.h / 2;
    this.rot = Math.atan2(par.cy - this.cy, par.cx - this.cx) + Math.PI / 2;
    this.contact(game, dmg0 * (1 + 0.23 * this.dragonLocalAI0(game)), 7);
  }

  /** 计数器（831 虎宝石 / 970 阿比盖尔计数，AI_164 :43946）：头顶环绕吸附、不攻击；
   *  派生唯一本体（档位随同类数），本体 noSlot 不占上限 */
  private counterHover(game: GameHooks, p: Player, dmg0: number): void {
    void dmg0;
    const projs = (game as unknown as { entities: { projectiles: MinionProj[] } }).entities.projectiles;
    // 升级音（:43974）：970 首帧且同类 >1 → AbigailUpgrade（音量 0.5，SoundID.cs:1052）
    if (this.projId === 970 && !this.abigailUpgChecked) {
      this.abigailUpgChecked = true;
      if (this.peerCount(game, 970) > 1) {
        game.playSfxFiles(soundTrackFiles('abigail_upgrade'), 0.5, this.cx, this.cy);
      }
    }
    if (this.projId === 831) {
      const gems = this.peerCount(game, 831);
      const want = gems <= 3 ? 833 : gems <= 6 ? 834 : 835; // GetDesiredStormTigerMinionRank
      const tigers = projs.filter((m) => m instanceof MinionProj && !m.dead && m.projId >= 833 && m.projId <= 835);
      if (!tigers.length) this.spawnBody(game, want, this.damage);
      else if (tigers[0].projId !== want) { tigers[0].dead = true; this.spawnBody(game, want, this.damage); }
    } else if (!projs.some((m) => m instanceof MinionProj && !m.dead && m.projId === 963)) {
      this.spawnBody(game, 963, this.damage);
    }
    // AI_164 环绕：每层 4 个、层高 +12px、中心头顶 -61px（MountedCenter-21-40）
    const peers = projs.filter((m) => m instanceof MinionProj && !m.dead && m.projId === this.projId);
    const idx = peers.indexOf(this);
    const layer = Math.floor(idx / 4), inLayer = idx % 4;
    const layerCount = Math.max(1, Math.min(4, peers.length - layer * 4));
    const ang = (this.age * 2 + layer / 8 + inLayer / layerCount) * Math.PI * 2;
    const r = 8 + 12 * layer;
    this.x = p.cx + Math.sin(ang) * r - this.w / 2;
    this.y = p.cy - 61 - Math.cos(ang) * r - this.h / 2;
    this.facing = p.facing;
  }

  /** 跟随锚接地扫描（AI_067 无目标向量通用块 :51213-51260 折算）：CenteredRectangle
   *  (锚,Size) 起 20 格逐格下探首实心（tile==null||active 即停）＋玩家→锚 5% 步进
   *  视线截断（遇实心回退上一采样点）——tiger/pirate 随用随调 */
  private groundAnchorScan(
    st: import('../world/TileStore').TileStore, p: Player, ax: number, ay: number,
  ): { x: number; y: number } {
    for (let k = 0; k < 20; k++) {
      if (st.isSolid(Math.floor(ax / 16), Math.floor(ay / 16))) break;
      ay += 16;
    }
    const dx = ax - p.cx, dy = ay - p.cy;
    let fx = p.cx, fy = p.cy;
    for (let t = 0.05; t <= 1.001; t += 0.05) {
      if (st.isSolid(Math.floor((p.cx + dx * t) / 16), Math.floor((p.cy + dy * t) / 16))) break;
      fx = p.cx + dx * t; fy = p.cy + dy * t;
    }
    return { x: fx, y: fy };
  }

  /** 台账批②共用列扫门（AI_067 :51438-51457 机制(b)）：意图方向前柱
   *  （中柱+意图+(int)vX 截断）自盒顶行向下 height/16+1 行逐格探测实心 */
  private ai67FrontWallScan(
    st: import('../world/TileStore').TileStore, intent: number,
  ): boolean {
    const col = Math.floor((this.x + this.w / 2) / 16) + intent + Math.round(this.vx);
    const top = Math.floor(this.y / 16);
    for (let r = top; r < top + Math.floor(this.h / 16) + 1; r++) {
      if (st.inBounds(col, r) && st.isSolid(col, r)) return true;
    }
    return false;
  }

  /** 跳梯三柱选档（AI_067 :51476-51524 逐字）：左/中/右三列底行支承探测
   *  （solid ∨ halfBrick ∨ slope>0 ∨ 平台承立）任一成立才结算；选档列 =
   *  中柱＋意图＋(int)velocity.X，行基准 = 底行、探测在中腰行向上 1/2/4/5 格——
   *  净空 -5.1 / -7.1，顶压 -9.1 / -10.1 / -11.1。拾例外档：越界视作实心（防御式，
   *  原版以 try/catch 回落 -9.1 同义） */
  private ai67JumpLadder(st: import('../world/TileStore').TileStore, intent: number): void {
    const botRow = Math.floor((this.y + this.h) / 16);
    const supportCols = [Math.floor(this.x / 16),
      Math.floor((this.x + this.w / 2) / 16), Math.floor((this.x + this.w) / 16)];
    let supported = false;
    for (const c of supportCols) {
      if (!st.inBounds(c, botRow)) continue;
      const idx = st.idx(c, botRow);
      if (st.isSolid(c, botRow) || st.half[idx] > 0 || st.slope[idx] > 0
        || st.isPlatform(c, botRow)) { supported = true; break; }
    }
    if (!supported) return;
    const pc = Math.floor((this.x + this.w / 2) / 16) + intent + Math.trunc(this.vx);
    const midRow = Math.floor((this.y + this.h / 2) / 16);
    const solid = (oy: number): boolean => {
      if (!st.inBounds(pc, midRow + oy)) return true;
      return st.isSolid(pc, midRow + oy);
    };
    if (!solid(-1) && !solid(-2)) this.vy = -5.1;
    else if (!solid(-2)) this.vy = -7.1;
    else if (solid(-5)) this.vy = -11.1;
    else if (solid(-4)) this.vy = -10.1;
    else this.vy = -9.1;
  }

  /** AI_067 跳跃意图两面合流（:51363-51457,1458 重锚——终清波批统一探测形用）：
   *  · (a) 墙意图档（flag19 直置,无几何前置）：家族 flag20 通过时随移动意图恒真。
   *    蛙 flag2=attackTarget!=-1 条件；虎 flag3=v15Y<-80 条件;猫/蘑菇/海盗族
   *    （flag8/6/…）直 false。policy.wallIntent=true|false|(数值 v15Y<val)
   *  · (b) 前墙列扫档：num55≠0（|Δx|>5 意图）∧ flag21（|Δx|≥64 ∨ Δy≤−48∧|Δx|≥8）
   *    ∧ 列扫命中——ai67FrontWallScan 承载
   *  返回值=落地结算消费的 flag19 */
  private ai67JumpFlags(st: import('../world/TileStore').TileStore,
    ax: number, ay: number,
    policy?: { wallIntent?: boolean | number }): boolean {
    const dxv = ax - this.cx;
    const num55 = Math.abs(dxv) > 5 ? (dxv < 0 ? -1 : 1) : 0;
    let f19 = false;                                    // (a)
    const wi = policy?.wallIntent;
    if (wi === true) f19 = true;
    else if (typeof wi === 'number' && ay - this.cy < wi) f19 = true;
    if (num55 !== 0) {                                  // (b)
      const dyv = ay - this.cy;
      const f21 = Math.abs(dxv) >= 64 || (dyv <= -48 && Math.abs(dxv) >= 8);
      if (f21 && this.ai67FrontWallScan(st, num55)) f19 = true;
    }
    return f19;
  }

  /** AI_067_TryJumpingToTarget 共享尾（1457 :52109-52167；2026-09-08 续单补接——此前
   *  整体未建模）。调用位：:51024（attackTarget>=0 ∧ IsInRangeOfMeOrMyOwner 段,本仓
   *  =findTargetInRangeDual 命中即等价）与 :51212（ai[0]==3 栖点段——本仓 ai[0]==3 态
   *  未折算=登记,仅接 :51024 面）。逐值：
   *  · :52112 shouldFallThrough = toTarget.Y > 盒底——【域内死码】:decidesManualFallThrough
   *    仅 379 置真（:4645）,AI_067 全族不在 → HandleMovement :17694 消费位不达,登记
   *    不建模（以局部量承载判别式,不落字段）;
   *  · :52113 flag = velocity.Y==0（AI 前段求值=上拍碰撞结果）;
   *  · :52114-52117 wet ∧ vy>0 ∧ !shouldFallThrough → flag=真（湿中下落视作贴地可跃）
   *    ——wet 读相=AI 先于湿段跑的【上子步段值】=wetAi 快照（2026-09-08 定谳批口径）;
   *  · :52119-52122 type 393-395 ∧ vy>2 ∧ !wet 支 = vanilla 死码（`_=` 丢弃,无动作）;
   *  · :52124-52150 1022 蘑菇蓄跃支 = mushBoiStep 既有独立实现（台账批⑤）,本函数以
   *    flag2 形参承接其"本拍已消费"语义（:52149 支体尾置真,leap 是否已发无关）;
   *  · :52151 num4=30；（1093|1112|1118）∧ ai[0]==3 → 16——ai[0]==3 未折算=登记,恒 30;
   *  · :52154-52164 共享尾：toTarget.Y < Center.Y−num4 ∧ flag ∧ !flag2 →
   *    velocity.Y = −min(26, sqrt((Center.Y−toTarget.Y)×2×0.4))（无 +1 尾数,与
   *    :51084 flag8 干态专支相区别）。
   *  ★位序契约：调用位在俯扑/扑击/虚空扫描与步行结算段【前】→ 跃起后 vy≠0 使结算段
   *  （梯/表/×2）与干态俯扑门（vy>2/vy>1）整段让位——原版 wet 中下落跃起走本尾、
   *  干态下落跃起走 :51027/:51084 专支,两支以 wet 相互排斥=原文设计。 */
  private ai67TryJumpingToTargetTail(toTargetY: number, flag2: boolean): void {
    const shouldFallThrough = toTargetY > this.y + this.h;             // :52112（域内死码,登记）
    let flag = this.vy === 0;                                          // :52113
    if (this.wetAi && this.vy > 0 && !shouldFallThrough) flag = true;  // :52114-52117
    if (((toTargetY < this.cy - 30) && flag) && !flag2) {              // :52154（num4=30,:52151）
      const num5 = (toTargetY - this.cy) * -1;                         // :52155
      const num7 = Math.sqrt(num5 * 2 * 0.4);                          // :52156-52158
      this.vy = -(num7 > 26 ? 26 : num7);                              // :52159-52162
    }
  }

  /** ★台账批①（2026-08-31,L 级清偿）：AI_067 步行链【两结算段】1:1 共轨
   *  （1458 Projectile.cs:51273-52057；1457 :51296-51557 两结算段同体,偏移 +23 行——
   *  动值先 grep 符号勿信旧注）。参数 tiers=家族"attackTarget!=-1"速度档：
   *   段① 速度分层与横向积分（:51297-51345）：缺省 0.5/4/4 → 家族档 →
   *       catch-up（num52<|p.v| ⇒ num52=|p.v|、num50=0.7）→ |Δ|>5 加速
   *       （超 num51 改 num53=0.1 缓档）/ ±5 死区 vx×0.9 且 |vx|<2×num50 归零。
   *   段② 跳跃结算（:51363-51619/:52051-52056）：flag21 门（|v15X|≥64 ∨
   *       (v15Y≤−48∧|v15X|≥8)）→ 前墙列扫 flag19 → 落地（vy==0）跳梯三柱选档 +
   *       目标高出距离表（-6..-16 @ 60/80/100/120/140/160/190/210/270/310 阈）+
   *       wet∧num62==0 起跳 ×2；随后 vx 钳 ±num52（flag22 非跃击族恒行）、
   *       重力 += 0.4+num62·num63 封顶 10（num62=GetLerpValue(0,100,v15Y)×
   *       GetLerpValue(-2,-6,vy)，跃击中（蘑菇 flag22）免附加项）。跳跃结算顺序与
   *       原版同拍：settle 先于重力，故首帧积分量一致（-5.1+0.4=-4.7…）。
   *  @param wallIntent 家族 flag20 条件式（(a) 墙意图档）：number=v15Y<val 才置
   *          （虎 flag3=-80,:51428-51431）、true=无条件（无此族用例）、缺省=false
   *          （海盗 flag 等） */
  private ai067WalkChase(
    game: GameHooks, p: Player, ax: number, ay: number,
    tiers: [number, number, number] | null,
    opts?: { wet?: boolean; petting?: boolean; wallIntent?: boolean | number },
  ): void {
    const st = game.world.store;
    const v15x = ax - this.cx, v15y = ay - this.cy;    // vector15 = 锚 − Center
    let n50 = 0.5, n51 = 4, n52 = 4;                   // :51274-51277 缺省档
    if (tiers) [n50, n51, n52] = tiers;                // attackTarget!=-1 档（:51296-51340）
    const pSpd = Math.abs(p.vx) + Math.abs(p.vy);
    if (n52 < pSpd) { n52 = pSpd; n50 = 0.7; }         // catch-up（:51342-51345）
    let intent = 0;
    if (Math.abs(v15x) > 5) {
      intent = v15x < 0 ? -1 : 1;
      if (v15x < 0) { if (this.vx > -n51) this.vx -= n50; else this.vx -= 0.1; }   // :51354-51359
      else { if (this.vx < n51) this.vx += n50; else this.vx += 0.1; }             // :51360-51365
    } else {                                            // ±5 死区（:51402-51411）
      this.vx *= 0.9;
      if (Math.abs(this.vx) < n50 * 2) this.vx = 0;
    }
    // 跳跃意图（:51363-51466 两面合流,终清波批订正）：
    //  (a) 家族墙意图档（无几何前置）——虎 flag3 条件式 v15Y<−80（wallIntent）,
    //      海盗 flag 直死;抚摸 num56 关闭。
    //  (b) 前墙列扫（家族无关!）——num55≠0 ∧ flag21 ∧ 列扫命中。旧实现曾把虎的
    //      (a) 条件误并入 (b) 扫描门（同高遇墙不跳与原文相悖,回归随批改判）
    const flag21 = Math.abs(v15x) >= 64 || (v15y <= -48 && Math.abs(v15x) >= 8);
    let jump = false;
    if (!opts?.petting) {
      const wi = opts?.wallIntent;
      if (intent !== 0 && (wi === true || (typeof wi === 'number' && v15y < wi))) jump = true;
      if (intent !== 0 && flag21 && this.ai67FrontWallScan(st, intent)) jump = true;
    }
    this.stepUp = true;                                 // Collision.StepUp（:51466）
    this.tileCollide = true;                            // :51273 每 tick 置真
    const num62 = getLerpValue(0, 100, v15y) * getLerpValue(-2, -6, this.vy);   // :51509
    // ★水中位移阻尼（HandleMovement :17721-17764 湿支;湿段 tick 头已刷新当拍旗,
    //  速度场不减只削当拍位移——下方 wet 起跳 ×2 读 velocity 场=未阻尼,原文同相）。
    //  现役调用面=虎 833-835/海盗 393-395（旧受段族批,均受段）;域外未来调用者
    //  四旗恒 false → 档恒 1 数值不变。
    const dfWalk067 = projWaterDragFactor(this);
    moveAndCollide(this, game.world, this.vx * dfWalk067, this.vy * dfWalk067);
    if (this.vy === 0 && jump) {                        // 结算段（落地才生效）
      this.ai67JumpLadder(st, intent);
      if (v15y < -48) {                                 // 高出距离表（:51492-51527）
        const d = -v15y;
        this.vy = d < 60 ? -6 : d < 80 ? -7 : d < 100 ? -8 : d < 120 ? -9
          : d < 140 ? -10 : d < 160 ? -11 : d < 190 ? -12 : d < 210 ? -13
          : d < 270 ? -14 : d < 310 ? -15 : -16;
      }
      if ((opts?.wet ?? false) && num62 === 0) this.vy *= 2;                        // :51616-51619
    }
    this.vx = Math.max(-n52, Math.min(n52, this.vx));   // !flag22 钳速（:51625-51631）
    if (this.vx < 0) this.facing = -1;                  // direction（:52058-52071）
    else if (this.vx > 0) this.facing = 1;
    else this.facing = p.cx > this.cx ? 1 : -1;
    if (this.vx > n50 && intent === 1) this.facing = 1;
    if (this.vx < -n50 && intent === -1) this.facing = -1;
    this.vy = Math.min(this.vy + 0.4 + num62, 10);      // 重力 num+num62·num63（:52051-52056）
  }

  /** 沙漠虎本体 833/834/835（aiStyle 67,AI_067 flag3）。★台账批①（2026-08-31,
   *  approx-registry「镇民/宠物」⑬ L 级清偿）：地面段两结算段（速度分层 0.7/6/6
   *  catch-up 系 + 跳梯/高出距离表）替换手写 ±0.12/clamp3.5/5% 小跳近似——
   *  实现在 ai067WalkChase（1458 Projectile.cs:51273-52057,1457 :51296-51557）。
   *  · 周期 818 多段扑击链（AI_067_TigerSpecialAttack :49758-49882/AI_067 内联引用；
   *    旧注 :46383-46479 为 1456 锚）链长 = 宝石数+1；冷却 localAI[0] 成功
   *    833→360/834→300/835→240、失败 10t 重试（:50855 附近本地计数语义不变）
   *  · 链发后瞬移末段入 ai[0]=4 等待（等待期无接触伤 Damage_CanDealDamage
   *    :12453 type∈{833,834,835}∧ai[0]==4 支）；834/835 等待帧 11/其余 9（:10303）
   *  · 锚：有目标 = nPC.Center（flag3 无侧翼点 :51009-51026）;无目标 = 跟随锚
   *    (15+p.w/2+40slot)×dir + 接地扫描（:50296-50300/:51213-51260）
   *  · 索敌 = Minion_FindTargetInRange(800, skipIfCannotHitWithOwnBody)（findTarget-
   *    InRangeDual 1:1,双距择近已归真）;盒相交∧下落 → vy=-4/vx=dir×10 兔跳
   *    蹭伤（:51181-51188）
   *  · 接触冷却 SetDefaults localNPCHitCooldown=10（:8095-8096）✔既有显式一致
   *  · ai[0]=5 追离态（终零波清偿）：唯一触发源 = 目标脚下 15 格虚空扫描
   *    （:51142-51156）；共享核 ai067StateFive（orbit 接近→入扑/180t 超时回 0）
   *  · 未折算登记：flag3 静置尘 269（渲染层,C 类;AddLight 白光三型已由 lightRGB
   *    补课=BJ245 2026-09-21,见 getter 注）、追离中兔跳与
   *    蓄力跳重叠窗未建模——索敌"单距简化"登记于终清波批销账 */
  private tigerBody(game: GameHooks, p: Player, dmg0: number): void {
    const gems = Math.max(1, this.peerCount(game, 831));
    const scale = 1 + 0.4 * (gems - 1);
    // ai[0]==4 等待态（:50296 起 flag3 特置；动画帧见 draw）
    if (this.tigerA0 === 4) {
      this.vx = this.vy = 0;
      if (--this.tigerA1 <= 0) { this.tigerA0 = 0; this.tigerA1 = 0; }
      return;
    }
    // 索敌先行（state5 与触发源都需要 attackTarget 双距域内的真值——
    // flag16 含 5 :50502-50504 flag15=ai[0]==5 → 虎在追离态每帧重检索）
    const tgtPre = this.findTargetInRangeDual(game, 800);
    // 特殊攻击门（成功按档冷却/失败 10t 重试；原版无 ai[0] 门,localAI[0] 计数在
    // 追离态照走 :50184-50202——故置于 state5 门之前）
    if (this.pounceCd > 0) this.pounceCd--;
    else {
      const cd = this.projId === 834 ? 300 : this.projId === 835 ? 240 : 360;
      if (this.tigerSpecialAttack(game, p, dmg0)) { this.pounceCd = cd; return; }
      this.pounceCd = 10;
    }
    // ai[0]==5 追离态（:50955-51001 共享核,终零波清偿）——唯一触发源 =
    // 目标脚下 15 格虚空扫描（:51146-51156）；num10 缺省 15 档
    if (this.tigerA0 === 5) {
      this.ai067StateFive(game, tgtPre, 'tigerA0', 'tigerA1', 'tigerLai0', 15);
      return;
    }
    const st = game.world.store;
    const tgt = tgtPre;
    // 湿旗=上拍段值快照 wetAi（vanilla AI_067 :51616 湿身 ×2 读 Projectile.wet=AI 先于
    // 湿段跑读上一子步段值;2026-09-08 定谳批,见类字段块头注①②③）
    const wet = this.wetAi;
    let ax: number, ay: number;
    if (tgt) {
      ax = tgt.cx; ay = tgt.cy;
      // TryJumpingToTarget 共享尾（:51024 调用位;toTarget=敌心）——跃起后 vy<0 使
      // 兔跳门（:51181 velocity.Y>=0）与步行结算段让位（原版同序）
      this.ai67TryJumpingToTargetTail(tgt.cy, false);
      // 目标脚下 15 格虚空扫描（:51142-51156,flag3 支,IsInRangeOfMeOrMyOwner 域内
      // 每帧跑）：nPC3.Top（Entity.Top=CenterX :86-90）向下数 num5=15 行，遇
      // active() 或越界(null) 即截停；整窗无一格实心 → ai[0]=5 追离态+ai[1]=0
      // 整段退（state5 核见上）。★旧登记"未折算"于终零波清偿——扫描列取【中心列】,
      // 曾误用左缘列（ Entity.cs:86 Top=(X+w/2,Y) 终零波勘误））
      {
        const ttx = Math.floor((tgt.x + tgt.w / 2) / TILE);
        const tty = Math.floor(tgt.y / TILE);
        let rows = 0;
        for (; rows < 15; rows++) {
          if (!st.inBounds(ttx, tty + rows)) break;          // 越界=tile null → break
          if (st.flags[st.idx(ttx, tty + rows)] & 1) break;   // tile.active()
        }
        if (rows >= 15) { this.tigerA0 = 5; this.tigerA1 = 0; return; }
      }
      // 接敌兔跳（:51181-51188：Hitbox 相交 ∧ velocity.Y>=0 → vy=-4/vx=direction*10）
      if (this.x < tgt.x + tgt.w && this.x + this.w > tgt.x
        && this.y < tgt.y + tgt.h && this.y + this.h > tgt.y && this.vy >= 0) {
        this.vy = -4;
        this.vx = (tgt.cx >= this.cx ? 1 : -1) * 10;
      }
    } else {
      ax = p.cx - (15 + p.w / 2) * p.facing - 40 * this.slot * p.facing;   // :50296-50298
      ay = p.cy;
      const g = this.groundAnchorScan(st, p, ax, ay);
      ax = g.x; ay = g.y;
    }
    this.ai067WalkChase(game, p, ax, ay, tgt ? [1, 8, 8] : null,   // flag3 档 :51322-51325
      { wet, wallIntent: -80 });
    this.contact(game, dmg0 * scale, 10);
  }

  /** AI_067_TigerSpecialAttack（:46383-46479）：多段 818 链 1:1。
   *  目标池 = 玩家周 1600×800 盒（:46389-46399）；nPC2 距玩家最近收尾、nPC3 距本体
   *  最近首发，其余随机带 4×序号速度前置补位（list2 ≤ 宝石数+1，:46401-46451）；
   *  末段落点实心则追加玩家中心（:46455-46459）；逐段 818（ai[0]=-累计t×4 延迟、
   *  ai[1]=段时长×4，段时长 = min(min(20,30/段数), 4+ceil(距离/50)) 下限 5，
   *  :46461-46472） */
  private tigerSpecialAttack(game: GameHooks, p: Player, dmg0: number): boolean {
    const ents = (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities;
    const gems = Math.max(1, this.peerCount(game, 831));
    const num = gems + 1; // :46388（ownedProjectileCounts[831]+1）
    const pool: (EnemyLike & { vx?: number; vy?: number })[] = [];
    for (const e of game.enemies()) {
      const en = e as EnemyLike & { vx?: number; vy?: number };
      if (!canBeChasedBy(e)) continue;   // CanBeChasedBy :91070/:91141——友好+immortal 族不入索敌（防追踪睡渔夫/假人）
      if (!en.dead && Math.abs(en.cx - p.cx) <= 800 && Math.abs(en.cy - p.cy) <= 400) pool.push(en);
    }
    if (!pool.length) return false;
    // nPC2：距玩家最近（:46402-46412）
    let n2 = pool[0];
    for (let j = 1; j < pool.length; j++) {
      if (Math.hypot(n2.cx - p.cx, n2.cy - p.cy) > Math.hypot(pool[j].cx - p.cx, pool[j].cy - p.cy)) n2 = pool[j];
    }
    pool.splice(pool.indexOf(n2), 1);
    // nPC3：距本体最近（:46414-46426）
    let n3: (EnemyLike & { vx?: number; vy?: number }) | null = null;
    if (pool.length) {
      n3 = pool[0];
      for (let k = 1; k < pool.length; k++) {
        if (Math.hypot(n3.cx - this.cx, n3.cy - this.cy) > Math.hypot(pool[k].cx - this.cx, pool[k].cy - this.cy)) n3 = pool[k];
      }
      pool.splice(pool.indexOf(n3), 1);
    }
    const hops: { x: number; y: number }[] = [];
    if (n3) hops.push({ x: n3.cx, y: n3.cy }); // :46428-46431
    let lead = 0;
    while (pool.length > 0 && hops.length < num - 1) { // :46433-46441（速度前置 4×(序号+1)）
      const idx = Math.floor(Math.random() * pool.length);
      const en = pool[idx];
      hops.push({ x: en.cx + (en.vx ?? 0) * 4 * (lead + 1), y: en.cy + (en.vy ?? 0) * 4 * (lead + 1) });
      pool.splice(idx, 1);
      lead++;
    }
    hops.push({ x: n2.cx, y: n2.cy }); // :46443-46447（收尾 = 距玩家最近）
    // 末段落点实心 → 追加玩家中心（:46448-46452）
    const st = game.world.store;
    const lastT = Math.floor(hops[hops.length - 1].x / TILE), lastY = Math.floor(hops[hops.length - 1].y / TILE);
    if (st.inBounds(lastT, lastY) && st.isSolid(lastT, lastY)) hops.push({ x: p.cx, y: p.cy });
    const num3 = Math.min(20, 30 / hops.length); // :46455-46457
    let cx0 = this.cx, cy0 = this.cy, num4 = 0;
    const add = (el: unknown) => ents.add(el, 'projectiles');
    for (const h of hops) {
      const hx = h.x + (cx0 < h.x ? 20 : -20); // :46459-46462（X 向前偏 20px）
      const dx = hx - cx0, dy = h.y - cy0;
      const dist = Math.hypot(dx, dy);
      let num6 = Math.min(num3, 4 + Math.ceil(dist / 50)); // :46463-46468
      if (num6 < 5) num6 = 5;
      add(new TigerPounce(cx0, cy0, dx, dy, dmg0, () => this.ownerRef(), -num4 * 4, num6 * 4)); // :46470
      cx0 = hx; cy0 = h.y;
      num4 += num6; // :46473-46474
    }
    this.x = cx0 - this.w / 2; this.y = cy0 - this.h / 2; // base.Center = vector2（:46475）
    this.vx = this.vy = 0;
    this.tigerA0 = 4; this.tigerA1 = num4; // ai[0]=4 / ai[1]=总时长（:46476-46477）
    return true;
  }

  /** ---- 海盗随从 393-395（2584 海盗法杖,AI_067 flag 分支,台账批② A 档清偿
   *  2026-08-31）---- 此前走通用飞行悬停近似（:10 头注"地面型判定省略"面）。
   *  原版专属段（1458 Projectile.cs：flag 定义 :50020/:50291 跟随锚/:50513 num2=800
   *  索敌/:51003-51007 扑击门/:51041-51097 高空俯扑+落地尘 gore/:51296-52057 两结算
   *  段/:50862-50869 扑击态 friendly 窗）：
   *   · 态机 pirA0=ai[0]（0 地面 / 1 归位飞行 / 2 扑击 / 5 追离 orbit）、pirA1=ai[1]
   *     （扑击倒数 num10=15；state5 兼作 180t 计数——原版同槽复用）
   *   · 归位飞行（:50636-50712 同族）：tileCollide=false、加速 0.2、限速 max(10,|p.v|)；
   *     >2000 瞬移；<200 ∧ 主落地 ∧ 头顶净空 → 落地回 0
   *   · 无目标：跟随锚 (15+p.w/2)+20slot×dir（:50291-50294）＋接地扫描；归位门
   *     500/300（num3/num4 缺省 :50031-50033）
   *   · 有目标：anchor=nPC.Center（flag 无侧翼点）;≤20px → ai[0]=2/ai[1]=15
   *     （num30=20/flag14 支 :51155-51177）；高空俯扑 vy>2∧!wet∧敌【中心】高于盒底
   *     250px+ → ★position.Y%1<0.5 整分叉 quirk(:51027) 入 ai[0]=5 追离态跳过本帧,
   *     否则 sqrt(2×0.4×h) 反向起跳封顶 26（h=我中心−敌中心 num31,X 抖 ±Next×5）
   *     → 与 boss>600 触发源（:51077,同一 `flag&&ai[1]==0` 块内【先俯扑后距离】的
   *     先后关系）共为终零波清偿;state5 共享核 = ai067StateFive（orbit 点 =
   *     敌心+rot(minionPos×2π/0.5862069)×min(w,h)/4,速 16,<32px 距离入扑,180t 超时）
   *   · 接触伤仅在扑击窗（走行 friendly=false :50476 缺省不复位——海盗不在置真名单,
   *     扑击支 :50862 置 true）：SetDefaults localNPCHitCooldown=18（:4765-4770）
   *   · 移动档 flag 档 = 目标在位 1/8/8（:51317-51321）、catch-up 同共轨两结算段
   *   · 帧（:51802-51835 走行 + :50866-50872 扑击）：立 0/走 0-3（fc+=⌊|vx|⌋+1>10
   *     翻页）/空中 14/扑击 4+(15-ai1)/5（空中 +3 → 7-9）；pirFrame 直写通道接 draw,
   *     旧 age/8 匀速兜底退役（终零波 M2 清偿）
   *   · 未折算登记：落地尘 216/gore 580-583·11-14 两象限与站立唠叨环（:52057
   *     localAI 900-1200 加尘,渲染 C 类）；state5 中蓄力跳重叠窗未建模 */
  private pirA0 = 0;
  private pirA1 = 0;
  /** 海盗帧机状态（AI_067 flag 帧段直写：走行 :51802-51835/扑击 :50866-50872；
   *  state1 归位飞行与 state5 追离【不写 frame】= 冻结上一帧,原版同语义） */
  private pirFrame = 0;
  private pirFrameCd = 0;
  /** localAI[0] 归位镜像（AI_067 state5 距离/16 写点 :50970；不与加尘计数共用以
   *  免交叉清零——原版同槽混用,该加尘环：52057 加尘近似本就 C 类未建模） */
  private pirLai0 = 0;
  /** 虎侧 state5 距离镜像（同上,虎的 localAI[0] 无其它消费者） */
  private tigerLai0 = 0;
  /** AI_067 ai[0]==5 追离态共享核（Projectile.cs :50955-51001，终零波清偿）：
   *  orbit 点 = 敌 Center + rot(minionPos×2π/0.5862069)×min(w,h)/2×0.5（:50961-50966）；
   *  velocity = Vector2.Zero.MoveTowards(orbit−Center, num29=16)（:50969）；
   *  localAI[0]=距离/16 → <2 即入扑击（vel×0.3 + 圆周缘4 抖、vy=-3——原版先 Abs 后
   *  覆写=恒 -3;Center 钉 orbit 点）;否则 ai[1]++ ≥180 超时回 0（num9=0 海盗/虎）。
   *  flag16 含 5（海盗 :50512/虎 :50502-50504）→ 调用前必须先重跑双距索敌刷新
   *  attackTarget；丢目标 → 清态回 0 并整段退（:50956-50963）。tileCollide=true
   *  正常 Move 撞墙滑移。调用方此后直接 return。 */
  private ai067StateFive(game: GameHooks, tgtF: EnemyLike | null,
    ai0Key: 'pirA0' | 'tigerA0', ai1Key: 'pirA1' | 'tigerA1',
    laiKey: 'pirLai0' | 'tigerLai0', pounceDur: number): void {
    if (!tgtF) {
      this[ai0Key] = 0;
      this[ai1Key] = 0;
      this[laiKey] = 0;
      return;                                       // :50956-50963 丢目标清态退段
    }
    const num28 = Math.min(tgtF.w, tgtF.h) / 2 * 0.5;
    const ang = this.slot * ((Math.PI * 2) / 0.5862069);
    const px = tgtF.cx + Math.cos(ang) * num28;
    const py = tgtF.cy + Math.sin(ang) * num28;
    const dx = px - this.cx, dy = py - this.cy;
    const dl = Math.hypot(dx, dy);
    const sp = Math.min(16, dl);
    this.vx = dl ? (dx / dl) * sp : 0;
    this.vy = dl ? (dy / dl) * sp : 0;
    this[laiKey] = dl / 16;                         // localAI[0]=距离/16（:50970）
    this.facing = this.vx >= 0 ? 1 : -1;            // direction=spriteDirection（:50971）
    moveAndCollide(this, game.world, this.vx, this.vy);   // tileCollide=true（:50454 缺省）
    if (this[laiKey] < 2) {                         // 抵达入扑（:50972-50980）
      this[ai1Key] = pounceDur;
      this[ai0Key] = 2;
      this.vx *= 0.3;
      const ra = Math.random() * Math.PI * 2;
      this.vx += Math.cos(ra) * 4;                  // NextVector2CircularEdge(4,4)
      this.vy += Math.sin(ra) * 4;
      this.vy = -3;                                 // 先 Abs 后覆写 = 净 -3（:50978）
      this.x = px - this.w / 2;                     // base.Center = orbit 点（:50979）
      this.y = py - this.h / 2;
      return;
    }
    if (++this[ai1Key] >= 180) {                    // 超时回 0（:50981-50990,num9=0）
      this[ai0Key] = 0;
      this[ai1Key] = 0;
      this[laiKey] = 0;
    }
  }
  private pirateStep(game: GameHooks, p: Player, dmg0: number): void {
    const st = game.world.store;
    // 湿旗=上拍段值快照 wetAi（vanilla AI_067 :51027 俯扑门读 Projectile.wet=AI 先于
    // 湿段跑读上一子步段值;2026-09-08 定谳批,见类字段块头注①②③）
    const wet = this.wetAi;
    // 终清波批：Minion_FindTargetInRange(800, skipOwnBody) 双距检索归真（单距近似退役）
    const tgtF = this.findTargetInRangeDual(game, 800);
    // ---- ai[0]==1 归位飞行（:50636-50712 族档）----
    if (this.pirA0 === 1) {
      this.tileCollide = false;
      // 位移阻尼不适用（vanilla :50648 tileCollide=false → 湿阻尼块 :17721 不跑;
      //  直写位=velocity 场全量位移,本仓 x += vx 同相）
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const dl = Math.hypot(dx, dy);
      if (dl > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2; }
      else if (dl < 200 && p.vy === 0 && this.y + this.h <= p.y + p.h && !this.solidOverlap(st)) {
        this.pirA0 = 0; this.pirA1 = 0;
        if (this.vy < -6) this.vy = -6;
      } else {
        const sp = Math.max(10, Math.abs(p.vx) + Math.abs(p.vy));
        const l = dl || 1;
        if (this.vx < dx / l * sp) { this.vx += 0.2; if (this.vx < 0) this.vx += 0.3; }
        if (this.vx > dx / l * sp) { this.vx -= 0.2; if (this.vx > 0) this.vx -= 0.3; }
        if (this.vy < dy / l * sp) { this.vy += 0.2; if (this.vy < 0) this.vy += 0.3; }
        if (this.vy > dy / l * sp) { this.vy -= 0.2; if (this.vy > 0) this.vy -= 0.3; }
        this.x += this.vx; this.y += this.vy;
      }
      this.facing = this.vx !== 0 ? (this.vx > 0 ? 1 : -1) : p.facing;
      return;
    }
    // ---- ai[0]==5 追离态（:50955-51001，终零波清偿）——触发源见下方目标支：
    //      :51032 俯扑前置 position.Y%1<0.5 整分叉 与 :51077 boss>600 距离门，
    //      先后关系 = 同一 `flag && ai[1]==0` 块内先俯扑后距离。orbit 接近核共享,
    //      索敌已在本函数头部刷新（海盗 flag16 = ai0∈{0,5}）。num10=15 缺省档 ----
    if (this.pirA0 === 5) {
      this.ai067StateFive(game, tgtF, 'pirA0', 'pirA1', 'pirLai0', 15);
      return;
    }
    // ---- 地面态 ----
    if (!tgtF) {
      const dP = Math.hypot(p.cx - this.cx, p.cy - this.cy);
      if (dP > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2; }
      else if (dP > 500 || Math.abs(p.cy - this.cy) > 300) { this.pirA0 = 1; return; }
    }
    if (this.pirA0 === 2) {                              // 扑击态（:50861-50927：friendly 置真+帧+重力+倒数,无速度改写）
      // 攻击帧机（:50866-50872 flag 支）：frame=4+(15−ai1)/5（0..2→4..6），
      // 空中(vy≠0) +3 → 7..9。ai1 尚未递减时求值 = 原版序
      this.pirFrame = Math.min(6, 4 + Math.floor((15 - this.pirA1) / 5))
        + (this.vy !== 0 ? 3 : 0);
      this.vy = Math.min(this.vy + 0.4, 10);
      // ★水中位移阻尼（:17721 湿支;扑击态 tileCollide 承地面拍 :51266 置真,湿支照跑）
      const dfPirPounce = projWaterDragFactor(this);
      moveAndCollide(this, game.world, this.vx * dfPirPounce, this.vy * dfPirPounce);
      this.contact(game, dmg0, 18);                      // 扑击窗内才有接触伤（friendly=true 支）
      if (--this.pirA1 <= 0) { this.pirA0 = 0; this.pirA1 = 0; }     // num9=0 直回 0
      return;
    }
    // ---- 无目标归位门/有目标锚 ----
    let ax: number, ay: number;
    if (tgtF) {
      ax = tgtF.cx; ay = tgtF.cy;
      // TryJumpingToTarget 共享尾（:51024 调用位,:52109-52167;toTarget=敌心,flag 恒 false）
      // ——跃起后 vy<0 使下方俯扑门 vy>2 与步行结算段让位（原版同序;wet 中下落跃起走
      // 本尾 :52114 支,干态下落走 :51027 俯扑专支=原文两支以 wet 互斥）
      this.ai67TryJumpingToTargetTail(tgtF.cy, false);
      // ---- flag && ai[1]==0 块（:51022-51082，终零波补全两触发源+先后关系）----
      // ① 高空俯扑（:51023-51076）：vy>2 ∧ !wet ∧ 敌 CenterY−我盒底 < −250 →
      //    ★position.Y%1<0.5 整分叉 quirk（:51027-51031）：满足即入 ai[0]=5（ai[1]=0）
      //    并整段退【跳过本帧蓄力跳】——否则 sqrt 蓄力反跳（h=敌中心距 :51033-51036,
      //    封顶 26）+ X 圆周缘抖 ±NextFloat×NextFloat×5。原版半数拍走追离态 =
      //    原文真态非笔误（Physics 整格落位后 y 为整值 → 恒进分支；空中滑移帧为
      //    小数才回落跳）;旧实现无该分叉=海盗空中恒自跳,本批对齐。
      if (this.pirA1 === 0
        && this.vy > 2 && !wet && tgtF.cy - (this.y + this.h) < -250) {
        if ((this.y % 1) < 0.5) {                     // :51025-51031 quirk 分叉
          this.pirA0 = 5; this.pirA1 = 0; return;
        }
        const h = this.cy - tgtF.cy;                  // num31=(vector7.Y−Center.Y)×−1=我中心−敌中心
        this.vy = -Math.min(26, Math.sqrt(Math.max(0, h) * 2 * 0.4));   // num32=0.4
        this.vx += (Math.random() * 2 - 1) * Math.random() * 5;   // NextFloatDirection×NextFloat×5
      }
      // ② boss>600 追离触发（:51077-51082,在俯扑块之后独立判——同块先后关系）:
      //    与敌心距离 >600 且目标是 boss → ai[0]=5 追离态（orbit 接近核另段）
      if (this.pirA1 === 0
        && Math.hypot(tgtF.cx - this.cx, tgtF.cy - this.cy) > 600
        && (((tgtF as unknown as { boss?: boolean }).boss === true)
          || ((tgtF as unknown as { def?: { boss?: boolean } }).def?.boss === true))) {
        this.pirA0 = 5; this.pirA1 = 0; return;
      }
      // 扑击门（:51155-51160）：距锚 <20 → 入扑
      if (Math.hypot(ax - this.cx, ay - this.cy) < 20) {
        this.pirA0 = 2; this.pirA1 = 15;                 // num10=15（缺省,num9=0 单轮）
        this.facing = tgtF.cx - this.cx >= 0 ? 1 : -1;   // direction 朝敌（:51175-51176）
        return;
      }
    } else {
      ax = p.cx - (15 + p.w / 2) * p.facing - 20 * this.slot * p.facing;   // :50291-50294
      ay = p.cy;
      const g = this.groundAnchorScan(st, p, ax, ay);
      ax = g.x; ay = g.y;
    }
    this.ai067WalkChase(game, p, ax, ay, tgtF ? [1, 8, 8] : null, { wet });   // flag 档 :51317
    // 走行帧机（:51802-51835 flag 支,移动段内逐帧）：立 0 / 空中(vy≠0) 14 /
    // 行走 fc+=⌊|vx|⌋+1>10 → frame++ 且 ≥4 回 0。仅 state0 走行段执行到此处
    if (this.vy === 0) {
      if (this.vx === 0 || Math.abs(this.vx) < 0.5) {
        this.pirFrame = 0; this.pirFrameCd = 0;          // |vx|<0.5 静立档
      } else {
        this.pirFrameCd += Math.floor(Math.abs(this.vx)) + 1;
        if (this.pirFrameCd > 10) {
          this.pirFrame++;
          this.pirFrameCd = 0;
          if (this.pirFrame >= 4) this.pirFrame = 0;
        }
      }
    } else {
      this.pirFrameCd = 0;
      this.pirFrame = 14;
    }
  }

  /** 帕鲁地面随从 1093 捣蛋猫 / 1112 可靠的捣蛋猫 / 1118 黏土蓓蕾（AI_067
   *  flag8/flag9 分支折算，Projectile.cs:50014-52160；flag8 = 1093||1112 :50024
   *  共用同一态机——1093（物品 5663 :44475）曾走通用飞行近似,默认帧扫描器
   *  Math.floor(age/8)%28 扫到贴图白帧 14-27（hurt 变体带,原版 AI 永不写）
   *  = 用户实报"寻敌攻击变白"根因,2026-08-25 并入态机）。
   *  判定盒 = 原版真值 14×22（:10199-10200/:10365-10366/:10453-10454,构造器置）。
   *  · 态机 ai[0]：0 地面跟随+索敌（num2=800/500 :50030/:50052，Minion_FindTargetInRange
   *    skipIfCannotHitWithOwnBody=true :50496-50504 → 视线门）→ 距敌侧翼点 <20px 入
   *    扑击 ai[0]=2（:51166-51177 num30=20）；2 扑击（friendly=true 才有接触伤
   *    :50444 置 false/:50904 置 true，帧 3-6 :50912，1112 追敌悬浮 PingPong
   *    :50920-50926，ai[1]==num10-1 减速 :50905-50910）；1 归位（flag8 特例=瞬移
   *    主肩硬锚 MountedCenter+(-8dir,-24) :50841-50853，主落地退出 :50686-50692；
   *    flag9 常规飞行 :50636-50712）；5 Boss>600px 追击（:51152-51158）——flag8/9
   *    无目标检索档（flag16 :50505-50508 仅 0/2）→ 次 tick 即自清（:50957-50962），
   *    净效果 0 tick，不折算
   *  · 跟随锚（:50285-50310）：主中心 -(30|24+w/2)×dir - 组序×20×dir；Y 落地扫描
   *    20 格 + 视线截断 + 距离钳（:51204-51260）；归位门 = 距主>500 或 |dy|>300
   *    （num3/num4 :50031-50033）
   *  · 移动档（:51296-51340）：无目标 0.5/4/4；有目标 flag8=0.3/6/6（1112=9/12/9
   *    :51310-51313）、flag9=0.2/3/3；主速更快 → 0.7/主速（:51342-51345）；重力
   *    0.4 封顶 10（:51553-51557）；跳梯 -5.1/-7.1/-9.1/-10.1/-11.1（:51470-51490）
   *    + 目标高出距离表 -6..-16（:51492-51527，TryJumpingToTarget flag8 段
   *    :51126-51151 高差>100 起跳 sqrt(2×0.4h)+1 封顶 26）
   *  · 帧（:51742-51840）：立 0（抚摸 13/16）/ 走 7-12|8-14（fc+=|vx|+1>10 翻页）/
   *    空中 1（下落 2）/ 扑击 3-6|3-7；接触伤冷却 9/30（localNPCHitCooldown
   *    :10375/:10483）
   *  · 未折算：ai[0]=3 帮工意图（TryAssigningHelp :52208 依赖 IntentionGuesser
   *    智能光标系统，本仓无——核实 src/ 零命中后维持登记,勿造系统）、HitIntention
   *    采掘（:52167 同门）；抚摸 Joy 音/湿身 vy×2 已随 2026-08-23 Trusty 批接通
   *    （palJoyTick / palGroundStep wet 支） */
  /** 抚摸 Joy 音计时（帕鲁随从族五件通用，每 tick 在 AI 分派前调）：
   *  flag10 = player.petting.isPetting && petting.proj == whoAmI（:50053 AI_067 /
   *  :59101 AI_026——本仓等价 = p.petting.isPetting && this.beingPetted，Game 侧
   *  白名单单目标写入）。计时器：flag10 且 localAI==0 → 置 60 + Joy 音（一声/次抚摸
   *  会话——`> (flag10?1:0)` 递减使抚摸中钉 1 不归零，不重触发；停摸放空 1→0）。
   *  60t 槽原版兼作 Draw 层心形气泡进度（Main.cs:34820-34825 localAI∈(1,60)）——
   *  本仓无世界锚定气泡，登记不建模。音：1093/1112 PalCattivaJoy（:50106-50112，
   *  AI_067 flag8 支）/ 1094/1113 PalFoxparksJoy（:59122-59131，AI_026 flag8 支，
   *  计时槽 localAI[2]）/ 1118 只走计时无音（AI_067 flag9 支 :50066-50070） */
  private palJoyTick(game: GameHooks, p: Player): void {
    if (this.projId !== 1093 && this.projId !== 1112 && this.projId !== 1118
      && this.projId !== 1094 && this.projId !== 1113) return;
    const flag10 = p.petting.isPetting && this.beingPetted;
    if (flag10 && this.palJoyCd === 0) {
      this.palJoyCd = 60;
      if (this.projId === 1093 || this.projId === 1112) {
        game.playSfxFiles(['pal_cattiva_joy'], 0.35, this.cx, this.cy);   // SoundID.cs:1078 0.35
      } else if (this.projId === 1094 || this.projId === 1113) {
        // ★SW-FX18 2026-09-10 回归修复：IIIII233 勘误删共享播放时把 1094/1113 的
        //  PalFoxparksJoy 一并删失——原版 Projectile.cs:59122-59131（AI_026 case
        //  1094/1113）flag9+localAI[2]==0 → PlaySound(PalFoxparksJoy)，专属两站
        //  （SoundID.cs:1090 音量 0.35）。trusts-mounts 域回归实锤,本刀只补音不触计时
        game.playSfxFiles(['pal_foxparks_joy'], 0.35, this.cx, this.cy);
      }
      // ★IIIII233（2026-09-09）勘误：1118 ClayPotMinion（AI_067 flag9 支
      //  Projectile.cs:50053-50070）只走 localAI[0] 计时、**无 Joy 音**——旧码误播
      //  pal_foxparks_joy（全仓 PalFoxparksJoy 站=AI_026 flag8 的 1094/1113 专属,
      //  Projectile.cs:59122-59131;grep 全量实证仅两站）。已删。
    }
    if (this.palJoyCd > (flag10 ? 1 : 0)) this.palJoyCd--;
    // ★IIIII233（2026-09-09）：抚摸心形气泡原版直绘补全——原版
    //  Main.cs:34799-34832（1093/1112/1118）与 :33755-33762（1094/1113,计时槽
    //  localAI[2]=本仓 palJoyCd 同窗）在 localAI∈(1,60) 窗画
    //  EmoteBubble.DrawTemporaryBubble(0,60,localAI)（emote 0=爱心）。旧粒子近似
    //  （台账批 C-920）退役。非抚摸支的 DrawNotificationIcon（:34828-34831）资产
    //  未入库,登记不建模。
    if (flag10 && this.palJoyCd > 1) {
      setTemporaryBubble(this, 0, 60, this.palJoyCd);
    } else if (!flag10) {
      clearTemporaryBubble(this);
    }
  }

  /** 火绒狐 1094/1113 帧态机（AI_026 flag8 帧段 Projectile.cs:64729-64826 1:1 折算）。
   *  分支序与帧域同原版：攻击(ai[1]>0) 36-41 往返（n=fc/3,n≥6 → 11-n,负钳 0）/
   *  贴地静止+抚摸 45-52 每 4fc / 贴地静止 18-25 每 4fc / 贴地行走 28-35
   *  （fc += ⌊|vx|⌋+1,≥10 翻页）/ 空中(vy≠0) 27。
   *  时序：每 tick 在 AI 分派前调（foxChannel 早退支也照走）——flag27 消费上一拍
   *  位移（原版帧段在移动后求值,此处滞后一拍,备案近似）;本仓 1094/1113 统一飞行
   *  （spawnMinion ground=false）→ 常态落空中帧 27,贴地各态留待地面型判定细分。 */
  private foxAnimTick(p: Player): void {
    if (this.projId !== 1094 && this.projId !== 1113) return;
    const stationary = this.x === this.foxPrevX;
    this.foxPrevX = this.x;
    const petted = p.petting.isPetting && this.beingPetted;
    if (this.shootCd > 0) {
      // 攻击段（:64731-64754）：入段钉 36;1094 fc 在 ai[1]==40（1113==30）拍清零
      if (this.foxFrame < 36 || this.foxFrame >= 42) { this.foxFrameCd = 0; this.foxFrame = 36; }
      if (this.shootCd === 40 || (this.projId === 1113 && this.shootCd === 30)) this.foxFrameCd = 0;
      this.foxFrameCd++;
      let n = Math.floor(this.foxFrameCd / 3);
      if (n >= 6) n = 11 - n;
      if (n < 0) n = 0;
      this.foxFrame = 36 + n;
    } else if (this.onGround) {
      if (stationary && petted) {
        // 抚摸段（:64756-64766）：45 起每 4fc 翻页,≥53 回 45
        if (this.foxFrame < 45 || this.foxFrame >= 53) this.foxFrame = 45;
        if (++this.foxFrameCd >= 4) { this.foxFrameCd = 0; if (++this.foxFrame >= 53) this.foxFrame = 45; }
      } else if (stationary) {
        // 待机段（:64767-64775）：18-25 循环
        if (this.foxFrame < 18 || this.foxFrame >= 26) this.foxFrame = 18;
        if (++this.foxFrameCd >= 4) { this.foxFrameCd = 0; if (++this.foxFrame >= 26) this.foxFrame = 18; }
      } else if (Math.abs(this.vx) > 0.8) {
        // 行走段（:64776-64790）：fc 按 |vx| 累进,≥10 翻页,28-35 循环
        this.foxFrameCd += Math.floor(Math.abs(this.vx));
        this.foxFrameCd++;
        if (this.foxFrame < 28 || this.foxFrame >= 36) this.foxFrame = 28;
        if (this.foxFrameCd >= 10) { this.foxFrameCd = 0; if (++this.foxFrame >= 36) this.foxFrame = 28; }
      } else {
        this.foxFrame = 18;
        this.foxFrameCd = 0;
      }
    } else {
      // 空中（:64791-64797 vy<0 / :64798-64801 vy>0 同帧 27）
      this.foxFrameCd = 0;
      this.foxFrame = 27;
    }
  }

  private palGroundStep(game: GameHooks, p: Player, dmg0: number): void {
    const flag8 = this.projId === 1093 || this.projId === 1112;   // :50024
    const num10 = flag8 ? 16 : 30;            // 扑击时长（:50490/:50499）
    const num2 = flag8 ? 800 : 500;           // 索敌射程（:50030/:50052）
    // 湿旗=上拍段值快照 wetAi（2026-09-08 定谳批:vanilla :51616 ×2 消费 Projectile.wet
    // =AI 读上一子步段值——probe 现场盒测读当拍位=提前 1 拍,随批退役归一;
    // wetCollisionProbe 本体保留=unit 钉测/台账批⑥面,见类字段块头注①②③）
    const wet = this.wetAi;
    // ---- ai[0]==1 归位（:50636-50853；先于地面段——原版该态不索敌不行走）----
    if (this.palA0 === 1) {
      const dpx1 = p.cx - this.cx, dpy1 = p.cy - this.cy;
      const pSpd1 = Math.abs(p.vx) + Math.abs(p.vy);
      if (flag8) {
        // 主肩硬锚（:50841-50853）：Center=MountedCenter+(-8dir,-24)、速度清零；
        // 主落地退出（:50686-50692 num21<200 且 vy==0 → ai[0]=0）
        this.x = p.cx - p.facing * 8 - this.w / 2;
        this.y = p.cy - 24 - this.h / 2;   // MountedCenter = 玩家中心（p.cy）
        this.vx = 0; this.vy = 0;
        this.facing = p.facing;
        // 肩扛帧（:50788-50800）：frame=1 → vy≥-6 归 0 → vy≥6 归 2
        this.palFrame = p.vy >= 6 ? 2 : p.vy >= -6 ? 0 : 1;
        // 退出（:50685-50691）：num21<200 且主落地——距离门缺了会在远处
        // 与 ai[0]=0 归位门（>500）间乒乓
        if (p.vy === 0 && Math.hypot(dpx1, dpy1) < 200) { this.palA0 = 0; this.palA1 = 0; }
        return;
      }
      // flag9 常规飞行（:50636-50712）：tileCollide=false、加速 0.2、限速 10/主速
      const sp = Math.max(10, pSpd1);
      const dl = Math.hypot(dpx1, dpy1) || 1;
      if (dl > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2; } // :50660-50662
      else {
        this.vx += Math.max(-0.3, Math.min(0.3, dpx1 / dl * sp - this.vx)); // :50722-50752 acc 0.2（反向 ×1.5 补）
        this.vy += Math.max(-0.3, Math.min(0.3, dpy1 / dl * sp - this.vy));
        if (Math.abs(dpx1) < 60) this.vx *= 0.9;
        this.x += this.vx; this.y += this.vy;
      }
      this.facing = this.vx !== 0 ? (this.vx > 0 ? 1 : -1) : p.facing;   // :50754-50756
      const st1 = game.world.store;
      // 退出门第 4 连词（:50685-50692）= !Collision.SolidCollision(position,width,height)
      // 【全盒】判——2026-09-07 1118 嵌入定谳批：旧中心单格近似在盒缘/脚行压墙而
      // 中心落空气袋时放行退出 → 归位飞行（无碰撞直积分）穿墙后以嵌墙姿态落地进
      // 步行态;湿身（wet 域内）时 unembedPass 整段让位（TileCollision.ts wet 跳支,
      // 原文本无 unembed）→ 原版救援面（StepUp :51508/飞行态重入）接不上前持续卡
      // 地形。全盒判 = 蛙 :50686-50692 同句同构（solidOverlap 家族既有 SolidCollision
      // 等价,半砖窗差异登记于彼）
      if (Math.hypot(dpx1, dpy1) < 200 && p.vy === 0
        && this.y + this.h <= p.y + p.h
        && !this.solidOverlap(st1)) {
        this.palA0 = 0; this.palA1 = 0;                    // :50668-50676 落地净空退出
        if (this.vy < -6) this.vy = -6;
      }
      return;
    }
    // ---- 索敌（:50496-50508：ai[0]==0||2 才检索）——终清波批：
    //      Minion_FindTargetInRange(num2, skipIfCannotHitWithOwnBody) 双距归真 ----
    const tgt = this.palA0 === 0 || this.palA0 === 2 ? this.findTargetInRangeDual(game, num2) : null;
    // ---- ai[0]==2 扑击（:50901-50956）----
    if (this.palA0 === 2) {
      // 扑击帧（flag9 :50909 / flag8 :50875 同式）：3 + (num10-ai1)/(num10/4)
      this.palFrame = Math.min(7,
        3 + Math.floor((num10 - this.palA1) / (num10 / 4)));
      this.palA1--;                           // :50953
      if (this.palA1 === num10 - 1) {
        if (this.onGround) this.vx *= 0.1;    // :50905-50907（velocity.Y==0=贴地语义，flag8/9 共有）
        if (this.projId === 1112) { this.vx *= 0.1; this.vy *= 0.1; } // :50875-50877（1112 专属双轴刹）
      }
      // 1112 扑击追踪（:50920-50926 `attackTarget != -1 && type == 1112`——1093 无追踪）：
      // 敌心 + PingPong(ai1/num10)×-10 悬浮，20 速趋近
      if (this.projId === 1112 && tgt) {
        const t = Math.max(0, Math.min(0.9999, this.palA1 / num10));
        const ping = t < 0.5 ? t * 2 : 2 - t * 2; // Utils.PingPongFrom01To010 :246-256
        const tx = tgt.cx, ty = tgt.cy - ping * 10;
        const dx = tx - this.cx, dy = ty - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(20, d);
        this.vx = dx / d * step; this.vy = dy / d * step;
        this.facing = tx >= this.cx ? 1 : -1;
      }
      this.vy = Math.min(this.vy + 0.4, 10);  // :50951-50953
      // ★水中位移阻尼（HandleMovement :17721-17764 湿支;湿段 tick 头已刷新当拍旗,
      // 速度场不减只削位移——projWetSection 头注契约）
      // StepUp 关（原版 Collision.StepUp 只在 ai[0]==0||3 运动块 :51508,扑击块
      // :50901-50956 无此调用;步行拍置 true 会漏进扑击拍,此处显式复位）
      this.stepUp = false;
      const dfPounce = projWaterDragFactor(this);
      moveAndCollide(this, game.world, this.vx * dfPounce, this.vy * dfPounce);
      this.contact(game, dmg0, flag8 ? 9 : 30); // friendly=true 段（:50904）；冷却 :10375/:10483
      if (this.palA1 <= 0) { this.palA0 = 0; this.palA1 = 0; } // num9=0 → 直回 0（:50954-50956）
      return;
    }
    // ---- ai[0]==0：目标侧翼点 / 跟随锚（:51003-51199 与 :50285-50310）----
    let ax: number, ay: number;
    if (tgt) {
      // 侧翼点（:51020-51024）：敌近侧外 10px（num30=20），Y 钳敌盒内
      const side = tgt.cx > this.cx ? tgt.cx + 10 : tgt.cx - 10;
      ax = side;
      ay = Math.max(tgt.y + this.h / 2, Math.min(this.cy, tgt.y + tgt.h - this.h / 2));
      // TryJumpingToTarget 共享尾（:51024 调用位;toTarget=侧翼点,Y 钳值同 :51019）
      // ——跃起后 vy<0 使下方俯扑门 vy>1 与结算段让位（原版同序;湿中下落跃起走
      // :52114 支,干态下落走 :51084 专支=原文两支以 wet 互斥）
      this.ai67TryJumpingToTargetTail(ay, false);
      // 高差起跳（:51082-51101 flag8 专支,`flag8 && ai[1]==0` 块内——★2026-09-08
      // 续单两门补接：!wet 读相=wetAi（AI 先于湿段跑读上子步段值）;ai[1]==0=palA1
      // （扑击计时,:50954 出扑归零）——旧实现只接跳体漏两门。湿中下落已由共享尾
      // :52114 支承接（先于本门让位）→ 本门实际域=干态下落）
      if (flag8 && this.palA1 === 0 && this.vy > 1 && !wet
        && tgt.y + tgt.h - (this.y + this.h) < -100) {
        const h = (this.y + this.h) - (tgt.y + tgt.h);
        this.vy = -Math.min(26, Math.sqrt(Math.max(0, h) * 2 * 0.4) + 1);
        this.vx += (Math.random() * 2 - 1) * Math.random() * 5;
      }
      // 距敌 <20 → 入扑击（:51166-51177）
      if (Math.hypot(ax - this.cx, ay - this.cy) < 20) {
        this.palA0 = 2;
        this.palA1 = num10;
        this.facing = tgt.cx - this.cx > 0 ? 1 : -1; // :51175-51176
        return;
      }
    } else {
      // 跟随锚（:50285-50310 家族偏移；组序=同型在场序 minionPos 等价）
      const peers = (game as unknown as { entities: { projectiles: MinionProj[] } }).entities.projectiles
        .filter((m) => m instanceof MinionProj && !m.dead && m.projId === this.projId);
      const groupIdx = peers.indexOf(this);
      ax = p.cx - ((flag8 ? 30 : 24) + p.w / 2) * p.facing - groupIdx * 20 * p.facing;
      ay = p.cy;
      // 落地扫描（:51204-51212 最多 20 格）+ 视线截断（:51214-51224 5% 步进近似）
      const st = game.world.store;
      for (let k = 0; k < 20; k++) {
        if (st.isSolid(Math.floor(ax / 16), Math.floor(ay / 16))) break;
        ay += 16;
      }
      {
        const dx = ax - p.cx, dy = ay - p.cy;
        for (let t = 0.05; t <= 1.001; t += 0.05) {
          if (st.isSolid(Math.floor((p.cx + dx * t) / 16), Math.floor((p.cy + dy * t) / 16))) break;
          ax = p.cx + dx * t; ay = p.cy + dy * t;
        }
      }
    }
    // 归位门（:51199-51211）：距主 >500（num3）或 |dy|>300（num4）→ ai[0]=1
    const dpx = p.cx - this.cx, dpy = p.cy - this.cy;
    if (!tgt && (Math.hypot(dpx, dpy) > 500 || Math.abs(dpy) > 300)) {
      this.palA0 = 1;
      return;
    }
    // ---- 地面移动（:51212-51557）----
    const withTgt = tgt !== null;
    let acc = 0.5, vmax = 4, clamp = 4;               // :51296-51300 缺省档
    if (withTgt) {
      if (flag8) { acc = this.projId === 1112 ? 9 : 0.3; vmax = this.projId === 1112 ? 12 : 6; clamp = this.projId === 1112 ? 9 : 6; }
      else { acc = 0.2; vmax = 3; clamp = 3; }        // :51330-51334 flag9
    }
    const pSpd = Math.abs(p.vx) + Math.abs(p.vy);
    if (clamp < pSpd) { clamp = pSpd; acc = 0.7; }    // :51342-51345 主速 catch-up
    const dx = ax - this.cx;
    if (Math.abs(dx) > 5) {
      if (dx < 0) { this.vx -= this.vx > -vmax ? acc : 0.1; }
      else { this.vx += this.vx < vmax ? acc : 0.1; } // :51348-51362（num53=0.1 超速缓档）
    } else {
      this.vx *= 0.9;                                 // :51406-51410
      if (Math.abs(this.vx) < acc * 2) this.vx = 0;
    }
    this.vx = Math.max(-clamp, Math.min(clamp, this.vx));
    // 跳梯两面合流（终清波批统一探测形）：flag20 档 flag8/9 直死（:51384-51387）→
    // 仅机制(b) 前墙列扫（ai67JumpFlags 内含 num55/flag21 门）;落地 =
    // ai67JumpLadder 三柱承立闸+五档（与虎共轨;旧内联扫描行界 off-by-one 与
    // Math.round(vx) 偏差一并修正）。探测行界自 :51438-51457 复核
    const dyA = ay - this.cy;
    const stJump = game.world.store;
    const jump = this.ai67JumpFlags(stJump, ax, ay);
    this.vy = Math.min(this.vy + 0.4, 10);                  // :51553-51556（num=0.4，先加后移=原版 AI 末重力+Update 积分序）
    // ★水中位移阻尼（HandleMovement :17721-17764 湿支;湿段 tick 头已刷新当拍旗,
    // 速度场不减只削位移——下方 wet 起跳 ×2 读 velocity 场=未阻尼,原文同相）
    // StepUp（Collision.StepUp :51508,ai[0]==0||3 运动块逐拍直调,flag8/9 同受）——
    // 2026-09-07 1118 嵌入定谳批补接：这是原版随从"浅嵌入自救"唯一干道（前导列
    // 脚行沉入 ≤16.1px ∧ 上方净空 → 抬升上格,湿态无豁免支=水中同样生效）;曾只接
    // ai067WalkChase（虎/海盗）与 spiderStep/frogStep,帕鲁/蘑菇漏接 = 步行坡步缺失
    // + 浅嵌入（坡面三角/半砖缘）无救援。applyStepUp 是 :3641-3772 1:1 移植
    // （16.1px 门/flag3/flag4/半砖 ±8 全同）。连带 StepDown 同通（moveAndCollide
    // stepUp 门共用,原版 AI_067 无 StepDown）为家族既有口径（蛙/虎/蜘蛛同）,登记
    // 不另分叉
    this.stepUp = true;
    const dfWalk = projWaterDragFactor(this);
    moveAndCollide(this, game.world, this.vx * dfWalk, this.vy * dfWalk);
    if (this.onGround) {
      if (jump) this.ai67JumpLadder(stJump, Math.sign(dx) || 1);
      if (dyA < -48) {                                      // :51492-51527 目标高出距离表
        const d = -dyA;
        this.vy = d < 60 ? -6 : d < 80 ? -7 : d < 100 ? -8 : d < 120 ? -9
          : d < 140 ? -10 : d < 160 ? -11 : d < 190 ? -12 : d < 210 ? -13
          : d < 270 ? -14 : d < 310 ? -15 : -16;
      }
      // 湿身跳 ×2（1457 Projectile.cs:51616-51619，1456 :51545 同支——贴水起跳翻倍）：
      // `if (wet && num62 == 0f) velocity.Y *= 2f`。num62 = GetLerpValue(0,100,vector15.Y)
      // × GetLerpValue(-2,-6,velocity.Y)（:51509，vector15=目标锚-自身心 = 本仓 dyA），
      // 在本支（velocity.Y==0 贴地段）计算时 vy 恒 0 → 第二因子钳 0 → num62 恒 0，
      // 门恒真——净效果 = 贴地且 wet 时起跳速度翻倍（-5.1→-10.2 … -16→-32）
      if (wet) this.vy *= 2;
    }
    // 朝向（:51558-51568：vx 定向，静止朝主）
    if (this.vx < 0) this.facing = -1;
    else if (this.vx > 0) this.facing = 1;
    else this.facing = p.cx > this.cx ? 1 : -1;
    // 步行帧机（帧段整体在 ai[0]==0||3 门内 :51201——扑击帧由 ai[0]==2 支直写不在此；
    // flag8 :51841-51877 / flag9 :51879-51930 各自 1:1）：贴地静止 0（抚摸 flag8=13 /
    // flag9=16）/ 走行 |vx|≥0.5 计步循环 flag8 7-12、flag9 8-14 / 空中 1(升)2(降)。
    // ★flag8 有完整走行机（1457 实文），旧注"步行期不写 frame=冻结"系误读
    const petting = p.petting.isPetting && this.beingPetted;   // flag10 :50053
    if (flag8) {
      if (!this.onGround) {
        this.palFrameCd = 0;
        this.palFrame = this.vy > 0 ? 2 : 1;                 // :51870-51876
      } else if (Math.abs(this.vx) >= 0.5) {
        this.palFrameCd += Math.abs(this.vx);                // :51854-51866
        this.palFrameCd++;
        if (this.palFrame < 7) this.palFrame = 7;
        if (this.palFrameCd > 10) { this.palFrame++; this.palFrameCd = 0; }
        if (this.palFrame >= 13) this.palFrame = 7;
      } else {
        this.palFrame = petting ? 13 : 0;                    // :51848-51853
        this.palFrameCd = 0;
      }
    } else {
      if (!this.onGround) {
        this.palFrameCd = 0;
        this.palFrame = this.vy > 0 ? 2 : 1;                 // :51924-51930
      } else if (Math.abs(this.vx) >= 0.5) {
        this.palFrameCd += Math.abs(this.vx);                // :51892-51906
        this.palFrameCd++;
        if (this.palFrame < 8) this.palFrame = 8;
        if (this.palFrameCd > 10) { this.palFrame++; this.palFrameCd = 0; }
        if (this.palFrame >= 15) this.palFrame = 8;
      } else {
        this.palFrame = petting ? 16 : 0;                    // :51886-51891
        this.palFrameCd = 0;
      }
    }
  }

  /** 蘑菇小伙伴 1022（Dead Cells 联动·蘑菇小伙伴杖 5456；AI_067 flag6 分支折算，
   *  Projectile.cs:50023 flag6 定义/:50140-50148 续命+射程 800/:50285-50310 跟随锚
   *  （主后 (45+w/2)+组序×30）/ :50444-50450 friendly=true+检索档 ai[0]∈{0,1}/
   *  :51003-51019 目标偏移点（敌心 +(27,0)×direction,:51022-51026 num30=20+7）/
   *  :51017-51019 无目标清 localAI[2]/ :52108-52152 TryJumpingToTarget 1022 支——
   *  目标高 160px 或归位态且 ai[2]==0 → TargetFound 编排粒子 @Top 前摇 15t → 蓄跃
   *  32 速朝拦截点（★台账批⑤ GetChaseResults 真拦截:getChaseResults Utils.cs:651）、
   *  ai[2]=30、贴图前摇 ShockIcon/爆点 :50598-50621：ai[2]>0 且 IsInRangeOfMeOrMyOwner
   *  (敌,60)（★台账批⑦ 双距+CanHitWithOwnBody/CanHitWithMeleeWeapon 盒门真值
   *  Projectile.cs:52404-52422）→ 弹 1044
   *  （伤×1.33/kb×3,DeadCellsMushroom.ts 承载 AI_117+AoE+爆炸编排粒子音）+
   *  Center=玩家中心+小随机速度;ai[2]<0 逐拍 ++ / >0 空中逐拍 −−贴地归零
   *  （:50622-50630）;Damage_CanDealDamage (1022&&ai[2]>0)=false :12463 → 跃击途中
   *  无接触伤。移动档（:51296-51302 有目标 0.8/6/6,缺省 0.5/4/4;:51342-51345 主速
   *  catch-up）/跳梯（:51424-51527 同帕鲁族——flag6 仅关 flag20 墙意图档 :51384,
   *  flag21 前柱探测仍生效 + 高出距离表 −6..−16）/重力 0.4 封顶 10（:51553-51556,
   *  num62×num63 附加项未折算备案）。帧机 :51642-51681：索敌中空中 13 / 地面 10-15
   *  每 4fc;无目标立地 0 / 走行 |vx|≥0.5 计步 2-9 / 空中 1;归位帧 1+rotation=vx×0.1
   *  （:50713-50716）。jump/land 两音为原版孤儿（deadcells_mushroom_jump/land 全树
   *  零调用,DEAD_SLOTS 备案）不接。 */
  private mushBoiStep(game: GameHooks, p: Player, dmg0: number): void {
    const st = game.world.store;
    // 湿旗=上拍段值快照 wetAi（2026-09-08 定谳批:vanilla :51616 ×2 消费 Projectile.wet
    // =AI 读上一子步段值——probe 现场盒测读当拍位=提前 1 拍,随批退役归一,见类字段
    // 块头注①②③）
    const wet = this.wetAi;
    // ---- 索敌（检索档 ai[0]==0||1 :50448-50450）——终清波批：双距检索归真 ----
    const tgt = this.mbA0 === 0 || this.mbA0 === 1 ? this.findTargetInRangeDual(game, 800) : null;
    // ---- 爆点判定（:50598-50621,先于移动块）。台账批⑦：IsInRangeOfMeOrMyOwner
    //      （Projectile.cs:52404-52422）双距真值——本体距 <60 且 !CanHitWithOwnBody → ∞、
    //      主距 <60 且 !CanHitWithMeleeWeapon → ∞（旧"min(直距)<60"无盒门,隔墙误爆面）----
    if (this.mbA2 > 0 && tgt) {
      let dMe = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy);
      if (dMe < 60 && !canHitWithOwnBodyBox(st, this.x, this.y, this.w, this.h, this.facing,
        tgt.x, tgt.y, tgt.w, tgt.h)) dMe = Infinity;
      let dP = Math.hypot(tgt.cx - p.cx, tgt.cy - p.cy);
      if (dP < 60 && !canHitWithMeleeWeaponBox(st, p.x, p.y, p.w, p.h, p.facing,
        tgt.x, tgt.y, tgt.w, tgt.h)) dP = Infinity;
      if (dMe <= 60 || dP <= 60) {                        // closerIsMe 择近 ≤60（:52420-52422）
        this.mbA2 = -120;                                 // :50604
        // 编排补远端：原版 RequestParticleSpawn(clientOnly:true)（P.cs:35277）各客户端
        // 自跑随从 AI 同刻直生;本仓随从仅 owner 权威模拟 → owner 广播 DeadCellsMushroom-
        // BoiExplosion 让访客侧 netApply 复放（偏差登记,module8 枚举注同口径）
        game.broadcastParticleOrchestra?.(ParticleOrchestraType.DeadCellsMushroomBoiExplosion,
          this.cx, this.cy);
        const boom = new MushroomBoiExplosionProj(this.cx, this.cy,
          Math.max(1, Math.round(dmg0 * 1.33)), this.knockback * 3,   // :50606-50607
          (bx, by) => { requestMushroomBoiExplosion(game, bx, by); });
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(boom, 'projectiles');
        this.x = p.cx - this.w / 2;                       // Center = player.Center（:50609-50611）
        this.y = p.cy - this.h / 2;
        this.vx = -2 + Math.random() * 4;                 // velocity=(rand(−2..2),rand(1..2))（:50612）
        this.vy = 1 + Math.random();
      }
    }
    // ---- ai[2] 衰减（:50622-50630；velocity.Y==0 ⟺ 贴地——碰撞落地清零语义）----
    if (this.mbA2 < 0) this.mbA2++;
    else if (this.vy === 0 && this.onGround) this.mbA2 = 0;
    else if (--this.mbA2 < 0) this.mbA2 = 0;
    // ---- TryJumpingToTarget 1022 支（:52108-52152;attackTarget>=0 段每拍调用）----
    //  ★2026-09-08 续单：支体尾置 flag2（:52149——门过即置真,leap 是否已发无关）,
    //  随后共享尾（:52154）以 !flag2 让位=与蘑菇蓄跃互斥（共享核原为同函数体）
    let jump1022Flag2 = false;
    if (tgt) {
      if ((tgt.cy < this.cy - 160 || this.mbA0 === 1) && this.mbA2 === 0) {
        if (this.mbLai2 === 0) {
          // DeadCellsMushroomBoiTargetFound @Top（:52129-52136）——ShockIcon 黄色惊叹
          game.spawnParticles(this.cx, this.y - 40, '#FFFF0A', 4, 1.5, { life: 15, grav: 0 });
        }
        if (++this.mbLai2 >= 15) {                        // :52139-52147
          // ★台账批⑤：Utils.GetChaseResults（Utils.cs:651-708）真拦截——
          //   InterceptionHappens ∧ time<120 → ChaserVelocity；否则
          //   targetCenter.SafeNormalize(-UnitY)×32（零距兜底 (0,-32) 竖直上跃）
          const chase = getChaseResults(this.cx, this.cy, 32,
            tgt.cx, tgt.cy, (tgt as { vx?: number }).vx ?? 0, (tgt as { vy?: number }).vy ?? 0);
          if (chase.intercepts && chase.time < 120) {
            this.vx = chase.vx; this.vy = chase.vy;
          } else {
            const dl = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy);
            if (dl > 0) {
              this.vx = (tgt.cx - this.cx) / dl * 32;
              this.vy = (tgt.cy - this.cy) / dl * 32;
            } else { this.vx = 0; this.vy = -32; }
          }
          this.mbA2 = 30;
          this.mbLai2 = 0;
        }
        jump1022Flag2 = true;                             // :52149（支体尾,无条件置真）
      }
      // 共享尾（:52154-52164）——toTarget.Y=敌心 Y（flag6 的 (num30+7)×dir 偏移为
      // X 轴 :51012,targetCenter.Y 同值）;跃起后 vy≠0 使结算段让位（原版同序）
      this.ai67TryJumpingToTargetTail(tgt.cy, jump1022Flag2);
    } else {
      this.mbLai2 = 0;                                    // :51017-51019
    }
    // ---- 归位飞行（ai[0]==1 :50636-50716;先于地面段——该态不行走）----
    if (this.mbA0 === 1) {
      this.tileCollide = false;                           // :50637 归位段穿墙
      const dpx = p.cx - this.cx, dpy = p.cy - this.cy;
      if (Math.hypot(dpx, dpy) > 2000) {                  // :50660-50662 瞬移
        this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2;
      } else {
        const sp = Math.max(10, Math.abs(p.vx) + Math.abs(p.vy));   // num19=10/主速 catch-up（:50644-50649）
        const dl = Math.hypot(dpx, dpy) || 1;
        this.vx += Math.max(-0.3, Math.min(0.3, dpx / dl * sp - this.vx));   // acc 0.2 反向 ×1.5 补（:50722-50752）
        this.vy += Math.max(-0.3, Math.min(0.3, dpy / dl * sp - this.vy));
        this.x += this.vx; this.y += this.vy;
      }
      // 退出门（:50685-50692 四连词 1:1）：<200 ∧ 主落地 ∧ 自身底不高过主底 ∧
      // 全盒无实心（Collision.SolidCollision）——2026-09-07 1118 嵌入定谳批同修：
      // 旧"中心列+脚行"双格近似漏盒缘/头行压墙（嵌入位退出,同 palGroundStep）,
      // 且缺 `position.Y+height <= player.position.Y+player.height` 第 3 连词
      // （低过主底也退出 = 主站高台时贴墙底退）。solidOverlap=家族 SolidCollision
      // 等价（蛙 :50686 同句同构）
      if (p.vy === 0 && Math.hypot(p.cx - this.cx, p.cy - this.cy) < 200
        && this.y + this.h <= p.y + p.h
        && !this.solidOverlap(st)) {
        this.mbA0 = 0;
        if (this.vy < -6) this.vy = -6;                   // :50689-50690
      }
      // 帧（:50713-50716）：frame=1、rotation=vx×0.1
      this.mushFrame = 1;
      this.rot = this.vx * 0.1;
      return;
    }
    this.rot = 0;                                         // flag6 rotation=0（:51643）
    // ---- 无目标归位门（:51199-51211）----
    if (!tgt) {
      const dpx = p.cx - this.cx, dpy = p.cy - this.cy;
      if (Math.hypot(dpx, dpy) > 2000) {                  // :51202-51204 瞬移
        this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2;
      } else if (Math.hypot(dpx, dpy) > 500 || Math.abs(dpy) > 300) {   // num3=500/num4=300（:50031-50033）
        this.mbA0 = 1;
        return;
      }
    }
    // ---- 行走目标点（:51003-51026 敌侧偏移 / :50285-50310 主后跟随锚）----
    let ax: number, ay: number;
    if (tgt) {
      ax = tgt.cx + 27 * (this.facing || 1);              // vector7 += (num30+7,0)*direction（:51022-51024）
      ay = tgt.cy;
    } else {
      const peers = (game as unknown as { entities: { projectiles: MinionProj[] } }).entities.projectiles
        .filter((m) => m instanceof MinionProj && !m.dead && m.projId === this.projId);
      const groupIdx = peers.indexOf(this);
      ax = p.cx - (45 + p.w / 2) * p.facing - groupIdx * 30 * p.facing;   // :50287-50289
      ay = p.cy;
      for (let k = 0; k < 20; k++) {                      // 落地扫描 ≤20 格（:51204-51212）
        if (st.isSolid(Math.floor(ax / 16), Math.floor(ay / 16))) break;
        ay += 16;
      }
      {
        const dx = ax - p.cx, dy = ay - p.cy;
        for (let t = 0.05; t <= 1.001; t += 0.05) {       // 视线截断（:51214-51260 5% 步进近似）
          if (st.isSolid(Math.floor((p.cx + dx * t) / 16), Math.floor((p.cy + dy * t) / 16))) break;
          ax = p.cx + dx * t; ay = p.cy + dy * t;
        }
      }
    }
    // ---- 地面移动（:51296-51568）----
    const withTgt = tgt !== null;
    let acc = 0.5, vmax = 4, clamp = 4;                   // 缺省档（:51297-51300）
    if (withTgt) { acc = 0.8; vmax = 6; clamp = 6; }      // flag6 有目标档（:51301-51305）
    const pSpd = Math.abs(p.vx) + Math.abs(p.vy);
    if (clamp < pSpd) { clamp = pSpd; acc = 0.7; }        // :51342-51345
    const dx = ax - this.cx;
    if (Math.abs(dx) > 5) {
      if (dx < 0) { this.vx -= this.vx > -vmax ? acc : 0.1; }
      else { this.vx += this.vx < vmax ? acc : 0.1; }     // :51348-51362（num53=0.1）
    } else {
      this.vx *= 0.9;                                     // :51406-51410
      if (Math.abs(this.vx) < acc * 2) this.vx = 0;
    }
    this.vx = Math.max(-clamp, Math.min(clamp, this.vx));
    // 跳梯两面合流（终清波批统一探测形）：flag6 关 flag20 墙意图档（:51384-51386）→
    // 仅机制(b) 前墙列扫（ai67JumpFlags）;落地 = ai67JumpLadder 三柱承立闸+五档
    // （虎先例共轨）。jump/land 两音为原版孤儿（deadcells_mushroom_jump/land 全树
    // 零调用）不接（既有登记）
    const dyA = ay - this.cy;
    const jump = this.ai67JumpFlags(st, ax, ay);
    this.vy = Math.min(this.vy + 0.4, 10);                // 重力 0.4 封顶 10（:51553-51556）
    this.tileCollide = true;                              // 地面段恒 true（:51266——先于移动）
    // ★水中位移阻尼（HandleMovement :17721-17764 湿支;湿段 tick 头已刷新当拍旗）
    // StepUp（Collision.StepUp :51508——flag6 同受 ai[0]==0||3 运动块直调;跃击
    // mbA2 拍 ai[0] 仍 0 原文本就踏,单点置位即覆盖）——1118 嵌入定谳批同批补接
    this.stepUp = true;
    const dfMush = projWaterDragFactor(this);
    moveAndCollide(this, game.world, this.vx * dfMush, this.vy * dfMush);
    if (this.onGround) {
      if (jump) this.ai67JumpLadder(st, Math.sign(dx) || 1);
      if (dyA < -48) {                                    // :51492-51527 高出距离表
        const d = -dyA;
        this.vy = d < 60 ? -6 : d < 80 ? -7 : d < 100 ? -8 : d < 120 ? -9
          : d < 140 ? -10 : d < 160 ? -11 : d < 190 ? -12 : d < 210 ? -13
          : d < 270 ? -14 : d < 310 ? -15 : -16;
      }
      if (wet) this.vy *= 2;                              // :51616-51619 湿身起跳 ×2
    }
    // 朝向（:51558-51568）
    if (this.vx < 0) this.facing = -1;
    else if (this.vx > 0) this.facing = 1;
    else this.facing = p.cx > this.cx ? 1 : -1;
    // ---- 接触伤（friendly=true 段 :50444;Damage_CanDealDamage 跃击途中 false :12463;
    //      localNPCHitCooldown=18 SetDefaults :9679）----
    if (this.mbA2 <= 0) this.contact(game, dmg0, 18);
    // ---- 帧机（:51642-51681；velocity.Y 判据 = 本仓 onGround 落地清零同构）----
    if (tgt) {
      if (!this.onGround) {
        this.mushFrame = 13; this.mushFrameCd = 0;        // :51646-51649
      } else {
        if (++this.mushFrameCd > 3) { this.mushFrame++; this.mushFrameCd = 0; }   // :51650-51654
        if (this.mushFrame < 10 || this.mushFrame > 15) this.mushFrame = 10;       // :51655-51657
      }
    } else if (this.onGround) {
      if (this.vx === 0) { this.mushFrame = 0; this.mushFrameCd = 0; }            // :51659-51662
      else if (Math.abs(this.vx) >= 0.5) {
        this.mushFrameCd += Math.abs(this.vx);            // :51663-51672 计步翻页
        this.mushFrameCd++;
        if (this.mushFrame < 2) this.mushFrame = 2;
        if (this.mushFrameCd > 10) { this.mushFrame++; this.mushFrameCd = 0; }
        if (this.mushFrame < 2 || this.mushFrame > 9) this.mushFrame = 2;
      } else {
        this.mushFrame = 0; this.mushFrameCd = 0;         // :51673-51676
      }
    } else {
      this.mushFrame = 1; this.mushFrameCd = 0;           // :51677-51680 空中
    }
  }

  /** 帕鲁钻地龟 1098/1123（AI_204_Digtoise Projectile.cs:39169-39506 全式折算，
   *  2026-08-23 内容缺口批；物品 5667/6174，Item.cs:44534-44546/:47564-47576）。
   *  纯挖掘宠：无战斗伤（minionSlots=0、不在 MinionTargetingFeature/Sacrificable 表
   *  ProjectileID.cs:395/:401）、存活门 = 主手持对应物品（1123↔6174 :39240-39246）。
   *  态机 ai[0]（:39173-39178）：0 出场（180t → 1）/ 1 向下挖 / 2 向右挖 / 3 向左挖 /
   *  4 离场（600t → 灭）/ 5 抚摸。右键指挥（Game.commandDigtoises）改写 ai[0]；
   *  挖掘 = 锚格带（Bottom+(0,-15) 所在格 :39198）三格 PickTile——向下 (x-1..x+1,y+1)
   *  / 横向 (x+2dir,y-2..y)，镐力 26 / max(26,最佳镐)（:39473-39480）、每击伤钳
   *  26/36（:39475-39481）；探到块但全不可伤 → 转离场（:39500-39503）。 */
  private digtoiseStep(game: GameHooks, p: Player): void {
    const st = game.world.store;
    const trusty = this.projId === 1123;
    // ★IIIII233（2026-09-09）：演出气泡 = Main.cs:34250-34266 Draw 期直绘的 tick 等价
    //  （DrawTemporaryBubble(emote, maxLifetime, remaining, anchor)）——
    //  ai[0]==5 抚摸 → emote 0 爱心（ai[1]<60,remaining=60-ai[1]）；
    //  ai[0]==4 离场 → emote 17 音符（同窗）；挖掘态 1/2/3 → emote 3 惊叹
    //  （ai[1]<40,remaining=40-ai[1],每次换向重置）；出场态 0 无泡。
    //  入口处取上 tick 终值 = 原版 Draw 在 Update 后读 ai 的同值（滞后 0 拍）。
    {
      const a1 = this.digA1;
      if (this.digA0 === 5 && a1 < 60) setTemporaryBubble(this, 0, 60, 60 - a1);
      else if (this.digA0 === 4 && a1 < 60) setTemporaryBubble(this, 17, 60, 60 - a1);
      else if (this.digA0 !== 0 && a1 < 40) setTemporaryBubble(this, 3, 60, 40 - a1);
      else clearTemporaryBubble(this);
    }
    let flag = this.digA0 === 0;        // 出场
    const flag2 = this.digA0 === 1;     // 向下挖
    const flag3 = this.digA0 === 2;     // 向右挖
    const flag4 = this.digA0 === 3;     // 向左挖
    const flag5 = this.digA0 === 4;     // 离场
    let flag6 = this.digA0 === 5;       // 抚摸
    // 重力（:39182-39187）+ 出界/主亡灭（:39170-39176 InWorld(20)/:39190-39193
    // player.dead||player.noBuilding——noBuilding 为旅程模式权限位，本仓无此位）
    this.vy = Math.min(this.vy + 2 / 15, 16);
    const ctx = Math.floor(this.cx / 16), cty = Math.floor(this.cy / 16);
    if (!st.inBounds(ctx - 20, cty - 20) || !st.inBounds(ctx + 20, cty + 20)) { this.dead = true; return; }
    if (p.dead) { this.dead = true; return; }
    // 抚摸进入/退出（:39207-39220）：被摸且非 5 态 → 转 5（背向主 + Joy 音一声）；
    // 停摸 → 回出场态 0。★原版转场 tick 局部旗同步（flag=false/flag6=true、
    // 反向 flag=true/flag6=false）→ 共通段当 tick 即按新旗跑
    const petting = p.petting.isPetting && this.beingPetted;
    if (petting && !flag6) {
      this.facing = this.cx > p.cx ? -1 : 1;            // :39212 背向判定取反=面向主
      this.digA0 = 5; this.digA1 = 0;
      game.playSfxFiles(['pal_digtoise_joy'], 0.35, this.cx, this.cy);  // :39222 PalDigtoiseJoy
      flag = false; flag6 = true;                       // :39213-39216 局部旗
    } else if (!petting && flag6) {                     // :39214-39219
      this.digA0 = 0; this.digA1 = 0;
      flag = true; flag6 = false;
    }
    // 出场/离场/抚摸共用段（flag|flag5|flag6 :39233-39260）：
    //  · 持物品门（:39240-39246）——1123↔6174 / 1098↔5667，失配即灭（仅出场/离场/
    //    抚摸态查；挖掘态不查 = 切物品后仍挖完当前隧道）
    //  · 摩擦减速 + 出场帧回卷（frame>2 钳 2，fc≥(frame==1?60:4) 递减 :39253-39260）
    if (flag || flag5 || flag6) {
      const heldSlot = p.inv.heldItem();
      const heldVid = heldSlot
        ? (ITEM_DEFS[heldSlot.id]?.vid ?? -1)
        : -1;
      const want = trusty ? 6174 : 5667;
      if (heldVid !== want) { this.dead = true; return; }
      this.vx *= 0.7;                                   // :39249
      if ((this.digA1 === 0) && flag) {
        // :39252 `(!(Center.X > player.Center.X)) ? 1 : -1`——龟在主右侧 → 朝左（面向主）
        this.facing = this.cx > p.cx ? -1 : 1;
      }
      this.digA1++;
      if (flag && this.digA1 >= 180) { this.digA0 = 1; this.digA1 = 0; return; } // :39255-39258
      if (flag5 && this.digA1 >= 600) { this.dead = true; return; }              // :39259-39260
      if (this.digFrame > 2) this.digFrame = 2;
      const fcGate = this.digFrame === 1 ? 60 : 4;
      if (++this.digFrameCounter >= fcGate) {
        this.digFrameCounter = 0;
        if (--this.digFrame < 0) this.digFrame = 0;
      }
      // ★水中位移阻尼（HandleMovement :17721-17764 湿支;湿段 tick 头已刷新当拍旗）
      const dfSurf = projWaterDragFactor(this);
      moveAndCollide(this, game.world, this.vx * dfSurf, this.vy * dfSurf);   // 重力+摩擦位移（引擎段等价）
      return;
    }
    const digging = flag2 || flag3 || flag4;            // flag8（:39262）
    if (!digging) return;
    // 挖掘态（:39263-39506）：alpha=0（全显）、锚格 = Bottom+(0,-15)（:39197-39198）
    const num3 = flag2 ? 1 : 0;                         // 向下
    const num2 = flag3 ? 1 : flag4 ? -1 : 0;            // 横向
    if (num2 !== 0) this.facing = num2;                 // :39272-39274 spriteDirection=direction
    const px = Math.floor((this.cx) / 16);              // point.X（Bottom-15 ≈ 盒心带）
    const py = Math.floor((this.y + this.h - 15) / 16);
    const num4 = 40;                                    // 蓄势档（:39277）
    if (this.digA1 > num4) {
      // 横向加速（:39279-39285）+ 前方悬空探针（:39287-39300：脚下三格全空 →
      // 转离场 ai[0]=4）
      this.vx += num2 * 8 / 60;
      if (Math.abs(this.vx) >= 8) this.vx = this.vx >= 0 ? 8 : -8;
      if (num2 !== 0) {
        // point2 = (Bottom + (w*dir/2 + 2dir, 2)) 所在格；point3/point4 = point2 右/同列
        // （原版 :39289-39291 两点同坐标——quirk 照抄）。三格全空 → 转离场
        const ax = Math.floor((this.cx + (this.w * num2) / 2 + num2 * 2) / 16);
        const ay = Math.floor((this.y + this.h + 2) / 16);
        const probe = (x: number, y: number): boolean => st.inBounds(x, y) && st.isSolid(x, y);
        if (!probe(ax, ay) && !probe(ax + num2, ay) && !probe(ax + num2, ay)) {
          this.digA0 = 4; this.digA1 = 0;
          this.vx *= 0.5;
          return;
        }
      }
      // 迎面墙钳速（:39302-39321）：前方 2 格列 y-2..y 有实心 → vx 钳到墙面
      if (num2 !== 0) {
        const wx = px + num2 * 2;
        let wall = false;
        for (let k = py - 2; k <= py; k++) if (st.inBounds(wx, k) && st.isSolid(wx, k)) wall = true;
        if (wall) {
          if (num2 > 0) this.vx = Math.min(this.vx, wx * 16 - (this.x + this.w));
          else this.vx = Math.max(this.vx, (wx * 16 + 16) - this.x);
        }
      }
      // 挖掘帧（:39375-39390）：入态钉帧 2 → fc≥(frame==2?5:4-lai1/4) 翻页，frame≥10 回 3
      if (this.digFrame < 2) { this.digFrame = 2; this.digLai1 = 0; this.digFrameCounter = 0; }
      let num7 = 4 - Math.trunc(this.digLai1 / 4);
      if (num7 < 1) num7 = 1;
      const num8 = this.digFrame === 2 ? 5 : num7;
      if (++this.digFrameCounter >= num8) {
        this.digLai1++;
        this.digFrameCounter = 0;
        if (++this.digFrame >= 10) this.digFrame = 3;
      }
      // 挖掘声（:39395-39397）+ 光（:39437 0.3/0.3/0.1）+ 接触尘（:39439-39452）
      if (this.digSoundCd <= 0) {
        this.digSoundCd = 10;
        game.playSfxFiles(soundTrackFiles('Item_199'), 0.5, this.cx, this.cy);
      } else this.digSoundCd--;
      game.addLightAt?.(this.cx, this.cy, 0.3, 0.3, 0.1);
      // 接触尘 flag10（:39439-39452）：挖掘带任一实心 → 尘 213 ×3（1/3 概率
      // scale2+fadeIn3，余 scale3；速度 -dir×3,-2）——本仓 vanillaDust 池直入，
      // 缺池回退定向粒子
      let digContact = false;
      if (num3 !== 0) {
        for (let x = px - 1; x <= px + 1; x++) if (st.isSolid(x, py + 1)) digContact = true;
      }
      if (num2 !== 0) {
        for (let y = py - 2; y <= py; y++) if (st.isSolid(px + num2 * 2, y)) digContact = true;
      }
      if (digContact) {
        for (let n = 0; n < 3; n++) {
          const big = Math.random() < 1 / 3;
          const d = game.spawnDust?.(this.x + num2 * 20, this.y + this.h / 2, this.w, this.h / 2,
            213, -num2 * 3, -2, 0, null, big ? 2 : 3);
          if (d && big) d.fadeIn = 3;
          if (!game.spawnDust) {
            game.spawnBurst?.(this.x + this.w / 2 + num2 * 20, this.y + this.h * 0.75,
              '#A08A5A', 1, 3, Math.atan2(-2, -num2 * 3), 0.4, { life: 20, grav: 0.1 });
          }
        }
      }
      // 位移（tileCollide=true + correctSlopeCollision——挖掘面前进，撞实心由
      // moveAndCollide 截停；向下态纯重力坠入挖开的井道）
      // ★水中位移阻尼（HandleMovement :17721-17764 湿支;湿段 tick 头已刷新当拍旗）
      const dfDig = projWaterDragFactor(this);
      moveAndCollide(this, game.world, this.vx * dfDig, this.vy * dfDig);
      // 挖节拍（:39455-39470）：ai[1]≥num4+30 → 采掘一轮，ai[1] 回 num4+10
      // （1123 回 num4+20 → 间隔 10t，1098 间隔 20t）
      this.digA1++;
      if (this.digA1 < num4 + 30) return;
      this.digA1 = trusty ? num4 + 20 : num4 + 10;
      // 镐力/每击伤钳（:39473-39481）：1098 = 26/26；1123 = max(26, 最佳镐)/36
      const best = game.bestPickaxePower?.() ?? null;
      const pickPower = trusty ? Math.max(26, best ?? 0) : 26;
      const cap = trusty ? 36 : 26;
      let probed = 0, damaged = 0;
      const digTile = (x: number, y: number): void => {
        // WorldGen.SolidTile3 门（:39466/:39485 坐标重载）——★A-5 边带（2026-09-04）：
        // 首门 InWorld(·,1)（WorldGen.cs:71006-71008）世界最外一圈不可采
        if (!st.inWorld1(x, y)) return;
        if (!st.isSolid(x, y)) return;
        probed++;
        if (game.petPickTile?.(x, y, pickPower, cap)) damaged++;
      };
      if (num3 !== 0) {
        const dy = py + 1;                              // :39464-39472 下方三格带
        for (let x = px - 1; x <= px + 1; x++) digTile(x, dy);
      }
      if (num2 !== 0) {
        const dx2 = px + num2 * 2;                      // :39485-39497 前方 2 格列 y-2..y
        for (let y = py - 2; y <= py; y++) digTile(dx2, y);
      }
      if (probed > 0 && damaged < probed) {             // :39500-39503 有块全不可伤 → 离场
        this.digA0 = 4; this.digA1 = 0;
      }
      return;
    }
    // 蓄势段（ai[1]≤num4 :39455-39459）：frame=0、ai[1]++
    this.digFrame = 0;
    this.digA1++;
    // ★水中位移阻尼（HandleMovement :17721-17764 湿支;湿段 tick 头已刷新当拍旗）
    const dfCharge = projWaterDragFactor(this);
    moveAndCollide(this, game.world, this.vx * dfCharge, this.vy * dfCharge);
  }

  /** 阿比盖尔本体 963（AI_062 963 档 1:1，1457 Projectile.cs :66074-66090 计数档/
   *  :66446-66462 归位门/:66474-66528 攻击闪/:66529-66638 交战/:66679-66826 归位/
   *  :66955-66962 朝向；1456 :62118-62134/:62490-62530 同构,行差 +3958）：
   *  · 计数档（:66085-66089）:num2=970 计数器数-1;num=1.4;num3=Max(4,18-1.75num2);
   *    num4=Max(5,40-4num2);num5=Min(1,0.69+0.03num2)
   *  · 索敌 700 + CanHit 1×1（:66330-66333/:66435）,距门以随从为基准（:66431）
   *  · 归位门 num21=800→有目标 1000（:66447-66453）;tileCollide=false（:66337-66340,
   *    本仓 963 无碰撞通道=穿墙,登记）
   *  · 攻击闪（:66503-66528）:ai[0]>=2 → ai[0]++（无目标再+1）>num4 归零（归零时
   *    距敌<50 再入闪 :66522-66525）,期间速度×num5;入闪一拍 AbigailAttack（:66505-66508）
   *  · 交战（:66531-66637,仅 ai[0]==0）:>200 加速 num27=6+1.4num2 lerp /2num3+1;
   *    ≤200:<50 速度减半+入闪（:66626-66630）,否则 num29=4+1.4num2 lerp /num3+1
   *  · 归位（:66686-66765）:num32=6×0.8（:66695-66698）,>200 提至 9（:66727）;
   *    锚=玩家心+(-40dir,40)（:66705-66708）;lerp /21（<50 半速 :66754-66757）;
   *    ≤10 贴身 ×0.9;>2000 瞬移玩家心（:66744-66748）
   *  · 朝向（:66947-66962）:spriteDirection=sign(vx)（:66947-66954 取反后 :66955-66957
   *    再 ×-1）,静止朝玩家（:66958-66961）;哭声 1/1500 移动中（:66494-66497）
   *  · 伤害 ×(1+num9×num2)——:12116-12125 num9=0.55/hardMode 1.3
   *  · 未折算:localAI[1] 出场淡入淡出（:66475-66493 纯渲染 alpha）、攻击帧 8-12
   *    映射（:66841-66901,本仓 963 走 age 兜底循环）、原版 963 无射击弹型
   *    （num48=0 :67051,ai[1] 自增无复位=至多一次 type-0 空弹,净效果无弹,不建模） */
  // ---- 泰拉棱镜 946（AI_156_BatOfLight 946 支 :52425-52760 1:1）----
  // ai[0]:−1 归位 / 0 待机 / 41-79 跃空段 / 0-39 弧刀段（攻击倒计时;起手恒 80、
  // 链式 NextFromList(40,80)——起手处 rand 被 num3=80 覆写为死代码 :52570-52571）
  private tA0 = 0;
  private tA1 = 0;            // ai[1] 目标敌 id
  private tSX = 0; tSY = 0;   // localAI[0/1] 攻击起点（跃空段记录）
  private tHit = new Map<number, number>();   // localNPCHitImmunity（StartAttack 清=每轮每敌一次）
  private tInit = false;

  /** AI_GetMyGroupIndexAndFillBlackList（:52505-52520，仅计数——blacklist 实际
   *  不填,TryAttackingNPCs 的黑名单门为空操作） */
  private tGroup(game: GameHooks): { index: number; total: number } {
    let index = 0, total = 0;
    for (const e of (game as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles) {
      const m = e as MinionProj;
      if (m instanceof MinionProj && !m.dead && m.projId === 946) {
        if (this.id > m.id) index++;
        total++;
      }
    }
    return { index, total };
  }

  /** AI_156_TryAttackingNPCs（:52694-52725）：距玩家心 1000 内最近敌 + 视线。
   *  ★台账批⑧：CanHitWithOwnBody 本体四试视线真值（Projectile.cs:12428-12444,
   *  CanHit 整盒 ∪ 三组 CanHitLine 端点对）——旧 canHitLine 单形状近似退役
   *  （墙棱半贴/侧沿擦过场景差档,实机验收=弧刀段绕柱起手率一致） */
  private tTarget(game: GameHooks, pcx: number, pcy: number): EnemyLike | null {
    let best: EnemyLike | null = null;
    let bestD = 1000;
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean };
      if (!canBeChasedBy(e) || !en || en.dead) continue;
      const d = Math.hypot(en.cx - pcx, en.cy - pcy);
      if (d > 1000) continue;
      if (!canHitWithOwnBodyBox(game.world.store, this.x, this.y, this.w, this.h, this.facing,
        en.x, en.y, en.w, en.h)) continue;
      if (best === null || d < bestD) { best = en; bestD = d; }
    }
    return best;
  }

  /** oldPos/oldRot 历史环（★SW-BJ56：TrailingMode[946]=2,ProjectileID.cs:385 →
   *  Projectile.cs:17237-17246 每拍整环移位、oldPos[0]/oldRot[0]=最新;长度=
   *  oldPos.Length=TrailCacheLength[946]=20（ProjectileID.cs:387 CreateIntSet 第 1 参
   *  缺省 10,946 显式覆写 20;SetDefaults :723 按 TrailCacheLength[Type] 重分配）,
   *  平铺 [x,y,rot]×20,consume 位 = 946 draw 拖尾/EmpressBladeDrawer。
   *  ★SW-RB11a（2026-09-10）：旧值 10 系把 CreateIntSet 缺省当覆写值——拖尾环
   *  少一半=尾迹视觉减半（EmpressBladeDrawer.PrepareStrip expectedPairs=
   *  proj.oldPos.Length=20,VertexStrip.cs:54-63 progressOnStrip=i/(pairs−1)）。 */
  private tHist: number[] = [];

  /** AI 后压栈（原版 TrailingMode=2 在 AI() 之后的 Update 段 oldPos[0]=position :17243） */
  private terraprismaBody(game: GameHooks, p: Player, dmg0: number): void {
    this.terraprismaAI(game, p, dmg0);
    this.tHist.unshift(this.cx, this.cy, this.rot);
    if (this.tHist.length > 60) this.tHist.length = 60;   // oldPos.Length=TrailCacheLength[946]=20（SW-RB11a）
  }

  private terraprismaAI(game: GameHooks, p: Player, dmg0: number): void {
    // SetDefaults scale=0.75（:8932）→ 命中盒 (int)(10×0.75)=7（SetDefaults 尾段统一缩放）
    if (!this.tInit) { this.tInit = true; this.w = 7; this.h = 7; }
    const st = game.world.store;
    // >2000px 状态重置（:52516-52520 ai0=0/ai1=0——位置不瞬移,Idle SmoothStep 归位）
    if (Math.hypot(p.cx - this.cx, p.cy - this.cy) > 2000) { this.tA0 = 0; this.tA1 = 0; }
    const num = 40, num2 = 39, num3 = 80, num4 = 79, num5 = 41;
    const tgt = this.tA1 ? this.findEnemyById(game, this.tA1) : null;

    // ---- ai[0] == −1：归位（:52523-52534 MoveTowards 32 + AngleLerp 0.2）----
    if (this.tA0 === -1) {
      const g = this.tGroup(game);
      const [spot, irot] = this.tIdleSpot(game, p, g.index, g.total);
      this.vx = 0; this.vy = 0;
      const dx = spot.x - this.cx, dy = spot.y - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      const mv = Math.min(32, d);
      this.x += dx / d * mv;
      this.y += dy / d * mv;
      this.rot = angleLerp(this.rot, irot, 0.2);
      if (d < 2) this.tA0 = 0;
      this.tHitTick(game, p, dmg0);
      return;
    }
    // ---- ai[0] == 0：待机（:52535-52574 SmoothStep 0.45 + AngleLerp 0.45 + 1/20 起手）----
    if (this.tA0 === 0) {
      const g = this.tGroup(game);
      const [spot, irot] = this.tIdleSpot(game, p, g.index, g.total);
      this.vx = 0; this.vy = 0;
      const t = 0.45, s = t * t * (3 - 2 * t);   // Vector2.SmoothStep
      this.x += (spot.x - this.cx) * s;
      this.y += (spot.y - this.cy) * s;
      this.rot = angleLerp(this.rot, irot, 0.45);
      if (Math.floor(Math.random() * 20) === 0) {
        const en = this.tTarget(game, p.cx, p.cy);
        if (en) {
          this.tHit.clear();                       // AI_156_StartAttack = ResetLocalNPCHitImmunity
          this.tA0 = num3;                         // :52570-52571 rand 被 num3 覆写=恒 80
          this.tA1 = en.id;
        }
      }
      this.tHitTick(game, p, dmg0);
      return;
    }
    // ---- 攻击（ai[0] > 0）：目标校验（:52648-52676）----
    if (!tgt || tgt.dead || !canBeChasedBy(tgt as never)) {
      const en = this.tTarget(game, p.cx, p.cy);
      if (en) {
        this.tA0 = Math.random() < 0.5 ? num : num3;   // 链式 NextFromList(40,80) :52666
        this.tA1 = en.id;
        this.tHit.clear();
      } else { this.tA0 = -1; this.tA1 = 0; }
      return;
    }
    // 相位判定（:52677-52687 预递减）：ai0≥41 → 跃空段(79→41);否则弧刀段(39→0)
    const preLeap = this.tA0 >= num5;
    const num15 = preLeap ? num4 : num2;
    const num16 = preLeap ? num5 : 0;
    this.tA0--;
    if (this.tA0 >= num15) {
      this.facing = this.cx < tgt.cx ? 1 : -1;         // :52682 direction
      if (this.tA0 === num15) { this.tSX = this.cx; this.tSY = this.cy; }  // :52684-52686 记起点
    }
    const lerp2 = clamp01((num15 - this.tA0) / (num15 - num16));   // GetLerpValue(num15,num16,ai0)
    if (!preLeap) {
      // ---- 弧刀段（:52689-52710 num14==0）：绕敌半圆弧 + 切向朝向 ----
      let vx0 = this.tSX, vy0 = this.tSY;
      if (lerp2 >= 0.5) {
        vx0 = tgt.cx + (p.cx - tgt.cx) * 0.5;          // 后半程枢轴=敌-玩家中点
        vy0 = tgt.cy + (p.cy - tgt.cy) * 0.5;
      }
      const num20 = Math.atan2(tgt.cy - vy0, tgt.cx - vx0);
      const num21 = this.facing === 1 ? -Math.PI : Math.PI;
      const num22 = num21 + (-num21) * lerp2 * 2;
      let spx = Math.cos(num22), spy = Math.sin(num22);
      spy *= 0.5;
      spy *= 0.8 + Math.sin(this.id * 2.3) * 0.2;      // IndexForVisuals 摆相(:52698-52699)
      const n20 = Math.atan2(spy, spx) + num20;        // .RotatedBy(num20)
      const rl = Math.hypot(spx, spy);
      spx = Math.cos(n20) * rl; spy = Math.sin(n20) * rl;
      const radius = Math.hypot(tgt.cx - vx0, tgt.cy - vy0) / 2;
      this.x = vx0 + (tgt.cx - vx0) * 0.5 + spx * radius - this.w / 2;
      this.y = vy0 + (tgt.cy - vy0) * 0.5 + spy * radius - this.h / 2;
      const num24 = wrapAngle(num20 + num22);
      this.rot = num24 + Math.PI / 2;
      this.vx = Math.cos(num24) * 10; this.vy = Math.sin(num24) * 10;
    } else {
      // ---- 跃空段（:52712-52727 num14==1）：升空→扑向敌并越过 ----
      let vx0 = this.tSX, vy0 = this.tSY;
      vx0 += 0;
      vy0 += clamp01(lerp2 / 0.4) * -100;              // GetLerpValue(0,0.4,lerp2)×−100
      const vx = tgt.cx - vx0, vy = tgt.cy - vy0;
      const vl = Math.hypot(vx, vy) || 1;
      const cl = Math.min(150, Math.max(60, vl));
      const ox = tgt.cx + vx / vl * cl, oy = tgt.cy + vy / vl * cl;
      const l3 = clamp01((lerp2 - 0.4) / 0.2);         // GetLerpValue(0.4,0.6,...)
      const l4 = clamp01((lerp2 - 0.6) / 0.4);         // GetLerpValue(0.6,1,...)
      const tRot = Math.atan2(vy, vx) + Math.PI / 2;
      this.rot = angleTowards(this.rot, tRot, Math.PI / 5);
      this.x = vx0 + (tgt.cx - vx0) * l3 - this.w / 2;
      this.y = vy0 + (tgt.cy - vy0) * l3 - this.h / 2;
      if (l4 > 0) { this.x = tgt.cx + (ox - tgt.cx) * l4 - this.w / 2; this.y = tgt.cy + (oy - tgt.cy) * l4 - this.h / 2; }
    }
    // ---- 体触伤害（Damage_PVE：10×10×0.75 盒,每轮每敌一次）----
    this.tHitTick(game, p, dmg0);
    // ---- 链式/收尾（:52729-52742 ai0==num16）----
    if (this.tA0 === num16) {
      const en = this.tTarget(game, p.cx, p.cy);
      if (en) {
        this.tA0 = Math.random() < 0.5 ? num : num3;
        this.tA1 = en.id;
        this.tHit.clear();
      } else { this.tA0 = -1; this.tA1 = 0; }
    }
  }

  /** 体触结算：攻击期盒相交 → hurt（每敌每轮一次,tHit 于 StartAttack 清） */
  private tHitTick(game: GameHooks, p: Player, dmg0: number): void {
    for (const [k, v] of this.tHit) {
      if (v <= 1) this.tHit.delete(k); else this.tHit.set(k, v - 1);
    }
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean; id: number };
      if (!en || en.dead || !canBeChasedBy(e)) continue;
      if (this.tHit.has(en.id)) continue;
      if (!(this.x < en.x + en.w && this.x + this.w > en.x && this.y < en.y + en.h && this.y + this.h > en.y)) continue;
      this.tHit.set(en.id, 60);
      const crit = Math.random() < 0.04;
      const owner = this.ownerRef() as unknown as { equipStats?: { armorPen?: number } } | null;
      const pen = owner?.equipStats?.armorPen ?? 0;
      en.hurt?.(crit ? Math.round(dmg0 * 2) : dmg0, this.facing * this.knockback, 0,
        game, pen, crit);
    }
  }

  /** AI_156_GetIdlePosition 946 支（:52551-52565）：肩上一字排开 + miscCounter 椭圆微摆 */
  private tIdleSpot(game: GameHooks, p: Player, index: number, total: number): [{ x: number; y: number }, number] {
    const num3 = index + 1;
    const dir = p.facing || 1;
    let irot = wrapAngle(num3 * Math.PI * 2 * (1 / 60) * dir + Math.PI / 2);
    const num4 = num3 % total;
    const misc = ((this.age % 3600) / 3600);
    const wob = Math.PI * 2 * (misc * (2 + num4) + num4 * 0.5 + dir * 1.3);
    // 微摆向量 = (0,0.5).RotatedBy(wob)×4 = (−sin(wob)×2, cos(wob)×2)
    const spot = {
      x: p.cx + Math.cos(irot) * 10 + dir * (num3 * -6 - 16) - Math.sin(wob) * 2,
      y: p.cy + Math.sin(irot) * 10 + p.gravDir * -15 + Math.cos(wob) * 2,
    };
    irot = wrapAngle(irot + Math.PI / 2);
    return [spot, irot];
  }

  private findEnemyById(game: GameHooks, id: number): EnemyLike | null {
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean; id: number };
      if (en && !en.dead && en.id === id) return en;
    }
    return null;
  }

  // ---- 血红蝙蝠杖 755（AI_156_BatOfLight 755 支 :52425-52647,与 946 同族）----
  // 常数 num=66/num2=65/num3=126/num4=125/num5=67;待机=头顶弧列(-UnitY.RotatedBy(
  // 4.398/total×(idx−mid))×40,idleRotation=0);攻击=减速段(ai0 66→65 vel×0.8 记起点)
  // +绕敌半圆弧(枢轴后半程移玩家心,无 946 的 Y 摆相——Y×=sin(IndexForVisuals×2.3)×0.5
  // 直接乘);链式失败回 ai0=0(无 −1 归位态,:52640-52647)
  private bA0 = 0;
  private bA1 = 0;
  private bSX = 0; bSY = 0;
  private bHit = new Map<number, number>();

  private batOfLightBody(game: GameHooks, p: Player, dmg0: number): void {
    const num = 66, num2 = 65, num3 = 126;
    if (Math.hypot(p.cx - this.cx, p.cy - this.cy) > 2000) { this.bA0 = 0; this.bA1 = 0; }
    const tgt = this.bA1 ? this.findEnemyById(game, this.bA1) : null;
    // ★SW-BJ56 2026-09-10：755 顶格光照 = DelegateMethods.CastLightOpen（Projectile.cs:
    //  52440-52441 v3_1=AI_156_GetColor()=Crimson(220,20,60)→ToVector3 ≈(0.863,0.078,
    //  0.235);DelegateMethods.cs:729-747 开放格（非活动实心/无格）时 Lighting.AddLight
    //  单格施光）——本仓同族 946 支同调用但 v3_1=Transparent=零光（:52463-52465）,
    //  即棱镜原版无世界光照（其「光效」=不读格光的全亮绘制+拖尾,见 draw 946 专绘注）。
    //  开放格门以 !isSolid 近似（inActive/tileSolidTop 档本仓 store 侧无独立旗）。
    {
      const st = game.world.store;
      const tx = Math.floor(this.cx / 16), ty = Math.floor(this.cy / 16);
      if (tx >= 0 && ty >= 0 && tx < st.w && ty < st.h && !st.isSolid(tx, ty)) {
        game.addLightAt?.(this.cx, this.cy, 0.863, 0.078, 0.235);
      }
    }

    if (this.bA0 === 0) {
      // 待机（:52537-52548 flag 支）：头顶弧列 SmoothStep 0.45 + 1/20 起手
      // idleSpot = Center + (−UnitY).RotatedBy(θ)×40,θ=4.3982296/total×(idx−mid)
      // （(−UnitY).RotatedBy(θ) = (sinθ, −cosθ)——单只 θ=0 → 正上方 40px）
      const g = this.tGroup(game);
      const mid = (g.total - 1) / 2;
      const th = (4.3982296 / g.total) * (g.index - mid);
      const ix = p.cx + Math.sin(th) * 40;
      const iy = p.cy - Math.cos(th) * 40;
      this.vx = 0; this.vy = 0;
      const t = 0.45, s = t * t * (3 - 2 * t);
      this.x += (ix - this.cx) * s;
      this.y += (iy - this.cy) * s;
      this.rot = angleLerp(this.rot, 0, 0.2);   // idleRotation=0（755 支 :52556）
      if (Math.floor(Math.random() * 20) === 0) {
        const en = this.tTarget(game, p.cx, p.cy);
        if (en) { this.bHit.clear(); this.bA0 = num; this.bA1 = en.id; }
      }
      this.bHitTick(game, p, dmg0);
      return;
    }
    // 攻击（:52577-52647）
    if (!tgt || tgt.dead || !canBeChasedBy(tgt as never)) { this.bA0 = 0; this.bA1 = 0; return; }
    this.bA0--;
    if (this.bA0 >= num2) {
      // 减速段（:52590-52596）：velocity×0.8,至 65 记起点
      this.vx *= 0.8; this.vy *= 0.8;
      this.x += this.vx; this.y += this.vy;
      if (this.bA0 === num2) { this.bSX = this.cx; this.bSY = this.cy; }
      this.bHitTick(game, p, dmg0);
      return;
    }
    const lerpV = clamp01((num2 - this.bA0) / num2);   // GetLerpValue(65,0,ai0)
    let vx0 = this.bSX, vy0 = this.bSY;
    if (lerpV >= 0.5) { vx0 = p.cx; vy0 = p.cy; }      // 后半程枢轴=玩家心
    const num9 = Math.atan2(tgt.cy - vy0, tgt.cx - vx0);
    const num10 = tgt.cx > vx0 ? -Math.PI : Math.PI;
    const num11 = num10 + (-num10) * lerpV * 2;
    let spx = Math.cos(num11), spy = Math.sin(num11);
    spy *= Math.sin(this.id * 2.3) * 0.5;              // :52614 Y 摆相（无 0.8+0.2 底）
    const n20 = Math.atan2(spy, spx) + num9;
    const rl = Math.hypot(spx, spy);
    spx = Math.cos(n20) * rl; spy = Math.sin(n20) * rl;
    const radius = Math.hypot(tgt.cx - vx0, tgt.cy - vy0) / 2;
    this.x = vx0 + (tgt.cx - vx0) * 0.5 + spx * radius - this.w / 2;
    this.y = vy0 + (tgt.cy - vy0) * 0.5 + spy * radius - this.h / 2;
    const num24 = wrapAngle(num9 + num11);
    // ★755 攻击段不更新 rotation（:52615-52630 仅 Center/velocity——与 946 弧刀段
    //   rotation=num24+π/2 不同),rotation 保持待机值(0 附近)
    this.vx = Math.cos(num24) * 10; this.vy = Math.sin(num24) * 10;
    this.bHitTick(game, p, dmg0);
    if (this.bA0 === 0) {
      // 链式（:52640-52647）：有目标续攻,无则回待机（755 无 −1 归位态）
      const en = this.tTarget(game, p.cx, p.cy);
      if (en) { this.bA0 = num; this.bA1 = en.id; this.bHit.clear(); }
      else { this.bA1 = 0; }
    }
  }

  /** 755 体触结算（同 tHitTick,bHit 于起手/链式清） */
  private bHitTick(game: GameHooks, p: Player, dmg0: number): void {
    for (const [k, v] of this.bHit) {
      if (v <= 1) this.bHit.delete(k); else this.bHit.set(k, v - 1);
    }
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean; id: number };
      if (!en || en.dead || !canBeChasedBy(e)) continue;
      if (this.bHit.has(en.id)) continue;
      if (!(this.x < en.x + en.w && this.x + this.w > en.x && this.y < en.y + en.h && this.y + this.h > en.y)) continue;
      this.bHit.set(en.id, 60);
      const crit = Math.random() < 0.04;
      const owner = this.ownerRef() as unknown as { equipStats?: { armorPen?: number } } | null;
      en.hurt?.(crit ? Math.round(dmg0 * 2) : dmg0, this.facing * this.knockback, 0,
        game, owner?.equipStats?.armorPen ?? 0, crit);
    }
  }

  private abigailBody(game: GameHooks, p: Player, dmg0: number): void {
    const n = Math.max(1, this.peerCount(game, 970));
    const num2 = n - 1;
    // Main.hardMode（world.flags.hardMode；?. 防测试 mock 缺 flags）
    const num9 = game.world.flags?.hardMode === true ? 1.3 : 0.55; // :12119-12124
    const scale = 1 + num9 * num2;
    const num = 1.4;                                  // :66087
    const num3 = Math.max(4, 18 - num2 * 1.75);       // :66086
    const num4 = Math.max(5, 40 - num2 * 4);          // :66088
    const num5 = Math.min(1, 0.69 + num2 * 0.03);     // :66089
    // 索敌 700 + 视线门（:66330-66333 num12=700；:66435 963 走 Collision.CanHit 1×1）
    const tgt = this.nearestEnemy(game, 700, 'point');
    // 归位门（:66446-66453）：num21=800 → 有目标 1000
    const num21 = tgt ? 1000 : 800;
    if (this.a62A0 !== 1 && Math.hypot(p.cx - this.cx, p.cy - this.cy) > num21) this.a62A0 = 1;
    if (this.a62A0 >= 2) {
      // 攻击闪（:66503-66528）
      if (this.a62A0 === 2) game.playSfxFiles(['abigail_attack'], 0.35, this.cx, this.cy); // :66505-66508
      this.a62A0++;
      if (!tgt) this.a62A0++;
      if (this.a62A0 > num4) {
        this.a62A0 = 0;
        if (tgt && Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) < 50) this.a62A0 = 2; // :66522-66525
      }
      this.vx *= num5; this.vy *= num5;               // :66527
    } else if (tgt && this.a62A0 === 0) {
      // 交战（:66531-66637）
      const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
      const num23 = Math.hypot(dx, dy) || 1;
      const nx = dx / num23, ny = dy / num23;
      if (num23 > 200) {
        const num27 = 6 + num2 * num;                 // :66618
        this.vx = (this.vx * (num3 * 2) + nx * num27) / (num3 * 2 + 1);   // :66620-66622
        this.vy = (this.vy * (num3 * 2) + ny * num27) / (num3 * 2 + 1);
      } else if (num23 < 50) {
        this.vx *= 0.5; this.vy *= 0.5;               // :66626-66630
        this.a62A0 = 2;
      } else {
        const num29 = 4 + num2 * num;                 // :66634
        this.vx = (this.vx * num3 + nx * num29) / (num3 + 1);             // :66636
        this.vy = (this.vy * num3 + ny * num29) / (num3 + 1);
      }
    } else {
      // 归位/跟随（:66679-66800 963 档：num32=6×0.8、锚=玩家心+(-40dir,40)）
      let num32 = 6 * 0.8;                            // :66686-66698
      const v2x = p.cx - this.cx - 40 * p.facing, v2y = p.cy - this.cy + 40; // :66705-66708
      const num35 = Math.hypot(v2x, v2y);
      if (num35 > 200 && num32 < 9) num32 = 9;        // :66727-66730
      if (num35 > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.w / 2; } // :66744-66748
      if (num35 > 10) {
        let eff = num32;
        if (num35 < 50) eff /= 2;                     // :66754-66757
        const l = num35 || 1;
        this.vx = (this.vx * 20 + (v2x / l) * eff) / 21;                  // :66759
        this.vy = (this.vy * 20 + (v2y / l) * eff) / 21;
      } else {
        this.vx *= 0.9; this.vy *= 0.9;               // :66763-66765
      }
    }
    // 朝向（:66947-66962）：vx 定向（:66947-66954 取反 + :66955-66957 ×-1 = sign(vx)），
    // 静止且无目标朝玩家（:66958-66961）
    if (this.vx > 0) this.facing = 1;
    else if (this.vx < 0) this.facing = -1;
    else if (!tgt) this.facing = p.cx > this.cx ? 1 : -1;
    // 哭声（:66494-66497 移动中 1/1500/t）
    if (Math.hypot(this.vx, this.vy) > 0.1 && Math.random() < 1 / 1500) {
      game.playSfxFiles(soundTrackFiles('abigail_cry'), 0.4, this.cx, this.cy);
    }
    this.x += this.vx;
    this.y += this.vy;
    this.contact(game, dmg0 * scale, 20);
  }

  /** Collision.SolidCollision(position, width, height) 等价（盒覆盖格任一实心，
   *  Collision.cs SolidCollision） */
  private solidOverlap(st: { inBounds(x: number, y: number): boolean; isSolid(x: number, y: number): boolean }): boolean {
    const x0 = Math.floor(this.x / 16), x1 = Math.floor((this.x + this.w - 0.001) / 16);
    const y0 = Math.floor(this.y / 16), y1 = Math.floor((this.y + this.h - 0.001) / 16);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  /** AI_026 蜘蛛族专用跳梯（1458 Projectile.cs :63172-63290 终清波重锚）：
   *  · 前墙探测（flag5,:63172-63187）＝【单格】：中心列 ±intent + (int)vX、中心行，
   *    WorldGen.SolidTile ∧ !ClosedDoors（本仓门态无建模,登记）
   *  · 支承闸（:63208-63212）＝【单列底行】SolidTileAllowBottomSlope ∪ halfBrick ∪
   *    slope>0 ——此前实现整段缺席（onGround 直通梯档）
   *  · 梯档探测（try 块,:63222-63244）＝单列、行基准=【中腰行】num190=
   *    centerY/16 相对 −1/−2/−4/−5——旧实现误用脚下行作基准（h/2 系统差一格）
   *    且 Math.round(vx) 应为 (int) 截断。
   *  ★与 AI_067 三柱形【刻意不同构】：AI_026 原文即单柱（任务书"统一三柱"仅对
   *  AI_067 族成立,蜘蛛 390-392 归 AI_026 flag7 不入虎先例）。
   *  终零波 M6 复核（1458 :63178-63184/:63223-63244）：AI_026 的梯档在
   *  flag5 门下对【同一列】只做高度选择（−1/−2/−4/−5 行相对中腰）；三柱支承闸
   *  （num64 0..2 左缘/中心/右缘三点探测,:51526-51544）与家族墙意图档是 AI_067
   *  独有——蛙(758)/帕鲁(1093·1112·1118)/蘑菇(1022) 归 AI_067 故用三柱,维持现状。 */
  private walkerJumpIntent(st: import('../world/TileStore').TileStore,
    dirX: number): boolean {
    const col = Math.floor((this.x + this.w / 2) / 16) + dirX + Math.trunc(this.vx);
    const row = Math.floor((this.y + this.h / 2) / 16);
    return st.inBounds(col, row) && st.isSolid(col, row);
  }

  /** AI_026 落地梯档：支承闸单列底行 + 中腰行基准五档探测（见上注） */
  private walkerJumpLadder(st: import('../world/TileStore').TileStore, dirX: number): void {
    const supCol = Math.floor((this.x + this.w / 2) / 16);
    const botRow = Math.floor((this.y + this.h) / 16);
    if (st.inBounds(supCol, botRow)) {
      const idx = st.idx(supCol, botRow);
      const supported = st.isSolid(supCol, botRow)
        || st.half[idx] > 0 || st.slope[idx] > 0;
      if (!supported) return;                        // :63208-63212 支承闸不成立不跳
    }
    const col = Math.floor((this.x + this.w / 2) / 16) + dirX + Math.trunc(this.vx);
    const midRow = Math.floor((this.y + this.h / 2) / 16);
    const solid = (oy: number) => st.inBounds(col, midRow + oy) && st.isSolid(col, midRow + oy);
    if (!solid(-1) && !solid(-2)) this.vy = -5.1;
    else if (!solid(-2)) this.vy = -7.1;
    else if (solid(-5)) this.vy = -11.1;
    else if (solid(-4)) this.vy = -10.1;
    else this.vy = -9.1;
  }

  /** AI_062 射手族五型（373 黄蜂/375 小鬼/407 暴风雨/423 异星 UFO/613 星尘细胞）
   *  逐段 1:1（1457 Projectile.cs:66067-67166；1456 :62109-63206 同构,行差 +3958——
   *  2026-08-23 备案项①②③⑤，替代"悬停+5 速直冲"通用近似）：
   *  · 档位（:66069-66094）:num3=20/num4=40（423→5 :66091-66093）/num5=0.69
   *    （num/num2 计数档仅 963 非零,五型恒 0）
   *  · 423/613 冲刺期（:66155-66192/:66193-66281）＝extraUpdates 真子步循环
   *    （Update :16780-16783 `numUpdates = extraUpdates; while (numUpdates >= 0)`——
   *    每子步完整 AI/位移/命中）：触发拍 extraUpdates=(int)ai[1]（:66559/:66597）→
   *    次拍起 ai[1]+1 子步,每子步 ai[1]--/尘/tileCollide=false/位移 velocity(10px)/
   *    接触判定,ai[1] 归零子步重置（ai[1]=30/ai[0]=0/velocity/5/vy=0/extraUpdates=0
   *    :66174-66183/:66232-66247）并【继续】走完整 AI（原版不 return）;冲刺子步早退
   *    拍跳过索敌/分离/射击/姿态（:66170/:66208 return）。（曾折算 10px/t 摊 ai[1] 拍
   *    ——总位移同、峰值速/尘率/判定率不同,2026-08-23 退役）
   *  · 同类分离（:66290-66318）:±0.05/盒宽,407 加倍（:66292-66296 0.1/2×盒宽）
   *  · 归位门（:66446-66473）:num21=500→有目标 1000/423 1200/613 1350;距玩家超门 →
   *    ai[0]=1;407 tileCollide=false+实心 alpha（:66341-66360,本仓无通道,登记）
   *  · 攻击闪（:66503-66528）:ai[0]>=2 → ai[0]++（无目标再+1）>num4 归零,速度×num5
   *  · 交战运动（:66529-66678;flag5=407/423 恒入,余须 ai[0]==0）:
   *    423 冲刺门 :66534-66564（瞄准点=敌顶心-80px+实心下探,300<距≤800 且
   *    localAI[0]==0 → ai[0]=2/ai[1]=距/10/extraUpdates=ai[1]/velocity=向×10/
   *    localAI[0]=60 :66556-66562）
   *    613 冲刺门 :66565-66602（瞄准点=敌心+背向 60px+实心下探,400<距≤800 同式
   *    :66593-66600）
   *    407 :66603-66615（>400:向×3 lerp /21;≤400:×0.96——与下段叠用,远距实际 ×18）
   *    >200 通用加速 :66616-66623（向×6 lerp /41——num28=num3×2=40）
   *    ≤200 分型（:66624-66677）:423/613 70-130 悬停带（<100 反推 -3,|向x|>|向y|
   *    再 X /11 :66650-66653）、375 <150 反推（向×-4 lerp /41 :66660-66668）否则
   *    ×0.97、373（尾链,407 近距同达）vy>-1 → vy-=0.1 上浮（:66674-66677）
   *  · 归位运动（:66679-66826）:无视线到玩家 → ai[0]=1（:66681-66685）;
   *    num32=6→ai0=1 15/407 9（:66686-66694）;锚=玩家心+(0,-60)（407 再 +40 :66701）;
   *    375 编队位 :66709-66725（=玩家心-(10+40×群序)×dir,-10 且 ai[1]=80 压冷却）;
   *    提速 >200→9、423/407>300→12（:66727-66734）、375 ×0.75（:66735-66738）;
   *    <100 且 ai0=1 且悬空 → 脱困回 ai[0]=0（:66739-66743）;>2000 瞬移玩家心
   *    （:66744-66748,Y 同宽=原版字面）;375 lerp /21（<50 半速 :66749-66765）、
   *    407 ×(1.25,0.65) 椭圆趋近（:66767-66785）、余 lerp /21（:66786-66800）,
   *    近距漂移零速起转 ×1.01;423/407>250 玩家速度匹配 ±0.125/反向 ×0.95+钳 num32
   *    （:66801-66825）
   *  · 射击冷却 ai[1] 随机计数器（:66963-67044,备案项③）:373 +Next(1,4)=1..3/t
   *    阈 90（strongBees→70 旗标本仓无,登记）;375 +1（1/3 再+1）阈 90;
   *    407/423/613 +1（2/3 再+1）阈 50/45/60
   *  · 射击（:67045-67165）:!flag5 且 ai[0]≠0 不射（:67045-67048）;375 出手朝向按
   *    敌 X 反向（:67080-67090）;407 实心内不出手（:67091-67094）;423 扇区外先微调
   *    速度（:67097-67100）+门距≤400（:67101）;613 门距≤500+后坐 velocity-=向×速/3
   *    （:67116-67130）;373/375/407 无距门（:67152-67165）;出手 ai[1]++、
   *    timeLeft=300（433 不覆写→100）
   *  · 姿态（:66827 rotation=velocity.X×0.05 全型每拍终速写入;:66947-66954
   *    spriteDirection=-sign(vx)）——冲刺子步早退拍不更新=冻结在触发前值（触发拍
   *    :66562 return 同冻结）;渲染 rot+flip 复合见 draw（XNA 同 draw 调用）
   *  · 尘粒:423 冲刺每子步 ai[1]>3 → 1×dust 220/221（:66158-66166）;613 每子步
   *    ai[1]>3 → numUpdates<20 门 3×dust 229 + 2×环尘（:66198-66226）+归零拍 30×
   *    尘爆（:66249-66270）——本仓 spawnParticles 色彩近似、数量/节拍 1:1;
   *    375/407 待机尘 1/7、1/5 每拍（:66925-66932/:66934-66937）已接（R31 §A⑥,见
   *    ai62Step 尾部待机尘块）;
   *    407 alpha 渐变、帧表（MINION_FRAMES 已按 :66829-66946 表驱动）、
   *    375 攻击帧门改由 a62A1∈(0,24) 驱动（:66910-66913,见 draw） */
  private ai62Step(game: GameHooks, p: Player, dmg0: number, tgt: EnemyLike | null): void {
    const type = this.projId;
    const num4 = type === 423 ? 5 : 40;               // :66091-66093
    const num5 = 0.69;                                 // :66073
    const flag5 = type === 423 || type === 407;        // :66498-66502
    const st = game.world.store;
    // ---- 423/613 冲刺期（:66155-66192/:66193-66281）＝extraUpdates 真子步循环
    //      （Update :16780-16783 numUpdates 循环,每子步完整 AI/位移/命中）----
    let poseFrozen = false;   // 触发拍 return（:66562/:66600）——rotation/spriteDirection 冻结
    if (this.a62A0 === 2 && (type === 423 || type === 613)) {
      let dashEnd = false;
      // 子步数 = extraUpdates+1（:16780-16783）;归零子步把 extraUpdates/numUpdates
      // 清 0（:66178-66183/:66236-66247）→ 循环当拍终止（等价原版 while 出口）
      for (let u = 0; u <= this.a62EU; u++) {
        this.a62A1--;                                  // :66156/:66194
        // tileCollide=false（:66157/:66195）——本仓 AI_062 飞行族位移无 tile 碰撞,登记
        if (this.a62A1 > 3) {                          // :66158/:66198
          if (type === 423) {
            // 1×dust 220/221（:66159-66166）scale 0.5-0.8、velocity/2.5、noGravity/noLight
            game.spawnParticles(this.cx, this.cy, '#B080FF', 1, Math.hypot(this.vx, this.vy) / 2.5);
          } else {
            const numUpd = this.a62EU - u;             // numUpdates 镜像（环尘相位 :66213）
            if (numUpd < 20) {                         // :66199-66207 3×dust 229
              game.spawnParticles(this.cx, this.cy, '#7FE0FF', 3, 3);
            }
            // 2×环尘（:66208-66226）：UnitY.RotatedBy(numUpdates·π/30+whoAmI·π/4+π/2)
            // ×(height/2) − velocity·(j/2)
            for (let j = 0; j < 2; j++) {
              const ang = Math.PI / 2 + numUpd * (Math.PI / 30) + this.id * (Math.PI / 4);
              game.spawnParticles(this.cx - (this.vx * j) / 2,
                this.cy + Math.cos(ang) * (this.h / 2) - (this.vy * j) / 2, '#7FE0FF', 1, 1);
            }
          }
        }
        if (this.a62A1 !== 0) {
          this.x += this.vx; this.y += this.vy;        // 每子步位移（velocity=v×10 :66560/:66598）
          this.contact(game, dmg0);                    // 每子步命中判定——台账批③：407=idStatic 10/余族 -2 全局窗
          continue;                                    // :66170/:66208 早退——跳过索敌/分离/射击/姿态
        }
        // 归零子步：重置（:66174-66183/:66232-66247）——原版不 return,继续走完整 AI
        this.a62A1 = 30; this.a62A0 = 0;
        this.vx /= 5; this.vy = 0;
        this.a62EU = 0;
        if (type === 613) {                            // :66249-66270 归零尘爆 15+15
          game.spawnParticles(this.cx - this.vx * 5, this.cy, '#7FE0FF', 15, 2);
          game.spawnParticles(this.cx, this.cy, '#7FE0FF', 15, 2);
        }
        dashEnd = true;
        break;
      }
      if (!dashEnd) return;   // 冲刺子步拍：AI 整段早退
      // 归零子步继续走下方完整 AI（分离/索敌/运动/射击/姿态——原版无 return）
    }
    {
      if (this.a62Lai0 > 0) this.a62Lai0--;            // :66282-66289 冲刺冷却
      // ---- 同类分离（:66290-66318）----
      {
        const sep = type === 407 ? 0.1 : 0.05;
        const sepR = type === 407 ? this.w * 2 : this.w;
        const pool = (game as unknown as { entities?: { projectiles?: unknown[] } }).entities?.projectiles;
        const projs = Array.isArray(pool) ? pool : [];
        for (const o of projs) {
          if (!(o instanceof MinionProj) || o === this || o.dead) continue;
          if (o.projId !== type || o.ownerRef() !== p) continue;
          if (Math.abs(this.x - o.x) + Math.abs(this.y - o.y) >= sepR) continue;
          this.vx += this.x < o.x ? -sep : sep;
          this.vy += this.y < o.y ? -sep : sep;
        }
      }
      // ---- 归位门（:66446-66473）----
      const num21 = !tgt ? 500 : type === 423 ? 1200 : type === 613 ? 1350 : 1000;
      if (this.a62A0 !== 1 && Math.hypot(p.cx - this.cx, p.cy - this.cy) > num21) this.a62A0 = 1;
      // ---- 攻击闪 / 交战 / 归位（:66503-66826）----
      if (this.a62A0 >= 2) {
        this.a62A0++;
        if (!tgt) this.a62A0++;
        if (this.a62A0 > num4) this.a62A0 = 0;         // :66518-66521
        this.vx *= num5; this.vy *= num5;              // :66527
      } else if (tgt && (flag5 || this.a62A0 === 0)) {
        // 交战（:66529-66678）。423 瞄准点 = 敌顶心（:66365-66368 vector2=(0.5,0)）
        let ax = tgt.cx, ay = type === 423 ? tgt.y : tgt.cy;
        let dx = ax - this.cx, dy = ay - this.cy;
        let num23 = Math.hypot(dx, dy);
        let nx = dx / (num23 || 1), ny = dy / (num23 || 1);
        if (type === 423 || type === 613) {
          // 冲刺瞄准点（:66534-66554/:66565-66592）：423=顶心-80px、613=敌心+背向 60px，
          // 落在实心则下探 +16/+32
          let tx: number, ty: number;
          if (type === 423) { tx = ax; ty = ay - 80; }
          else {
            let bx2 = this.cx - ax, by2 = this.cy - ay;
            const bl = Math.hypot(bx2, by2);
            if (bl === 0) { bx2 = 0; by2 = -1; } else { bx2 /= bl; by2 /= bl; }
            tx = ax + bx2 * 60; ty = ay + by2 * 60;
          }
          let row = Math.floor(ty / 16); if (row < 0) row = 0;
          if (st.inBounds(Math.floor(tx / 16), row) && st.isSolid(Math.floor(tx / 16), row)) {
            ty += 16;
            if (st.inBounds(Math.floor(tx / 16), Math.floor(ty / 16)) && st.isSolid(Math.floor(tx / 16), Math.floor(ty / 16))) ty += 16;
          }
          dx = tx - this.cx; dy = ty - this.cy;
          num23 = Math.hypot(dx, dy);
          nx = dx / (num23 || 1); ny = dy / (num23 || 1);
          const gateLo = type === 423 ? 300 : 400;     // :66555/:66593
          if (num23 > gateLo && num23 <= 800 && this.a62Lai0 === 0) {
            this.a62A0 = 2;
            this.a62A1 = Math.trunc(num23 / 10);       // :66558/:66596
            this.a62EU = this.a62A1;                   // extraUpdates=(int)ai[1]（:66559/:66597）
            this.vx = nx * 10; this.vy = ny * 10;      // :66560/:66598
            this.a62Lai0 = 60;                         // :66561/:66599
            poseFrozen = true;                         // :66562/:66600 return——姿态冻结
            tgt = null; // 冲刺拍不再走下方运动/射击（原版 return;位移在方法尾照走 1 次）
          }
        }
        if (tgt) {
          if (type === 407) {
            if (num23 > 400) {                         // :66603-66610
              // ★v 原地 ×3（num26=3 :66606-66607）——nx/ny 改写带入下方公共段,
              //  远距实际并入 ×18 向量（蓝队 R7-20：曾用 nx*3 做 lerp 未改 nx,
              //  公共段仍 ×6 → 远距咬合速度仅原版 1/3）
              nx *= 3; ny *= 3;
              this.vx = (this.vx * 20 + nx) / 21;
              this.vy = (this.vy * 20 + ny) / 21;
            } else {
              this.vx *= 0.96; this.vy *= 0.96;        // :66613
            }
          }
          if (num23 > 200) {
            // :66616-66623 通用加速（v 已被 407 ×3 → 407 远距实际 ×18）
            this.vx = (this.vx * 40 + nx * 6) / 41;
            this.vy = (this.vy * 40 + ny * 6) / 41;
          } else if (type === 423 || type === 613) {
            if (num23 > 70 && num23 < 130) {           // :66641-66654 悬停带
              const num30 = num23 < 100 ? -3 : 7;      // :66643-66647
              const vx8 = nx * num30, vy8 = ny * num30;
              this.vx = (this.vx * 20 + vx8) / 21;
              this.vy = (this.vy * 20 + vy8) / 21;
              if (Math.abs(vx8) > Math.abs(vy8)) this.vx = (this.vx * 10 + vx8) / 11; // :66650-66653
            } else {
              this.vx *= 0.97; this.vy *= 0.97;        // :66657
            }
          } else if (type === 375) {
            if (num23 < 150) {                         // :66662-66668 反推
              this.vx = (this.vx * 40 - nx * 4) / 41;
              this.vy = (this.vy * 40 - ny * 4) / 41;
            } else {
              this.vx *= 0.97; this.vy *= 0.97;        // :66671
            }
          } else if (this.vy > -1) {
            this.vy -= 0.1;                            // :66674-66677（373；407 近距同达）
          }
        }
      } else {
        // 归位/跟随（:66679-66826）
        if (this.a62A0 !== 1 && !canHit(st, this.cx, this.cy, 0, 0, p.cx, p.cy, 0, 0)) this.a62A0 = 1; // :66681-66685
        let num32 = 6;                                 // :66686
        if (this.a62A0 === 1) num32 = 15;              // :66687-66690
        if (type === 407) num32 = 9;                   // :66691-66694
        let v2x = p.cx - this.cx, v2y = p.cy - 60 - this.cy;   // :66700
        if (type === 407) v2y += 40;                   // :66701-66704
        if (type === 375) {
          this.a62A1 = 80;                             // :66710-66712 归位即压射击冷却
          v2x = p.cx - this.cx; v2y = p.cy - this.cy;
          const num33 = this.slot + 1;                 // :66714-66721 群序（slot≈minionPos,登记）
          v2x -= (10 + num33 * 40) * p.facing;
          v2y -= 10;
        }
        const num35 = Math.hypot(v2x, v2y);
        if (num35 > 200 && num32 < 9) num32 = 9;       // :66727-66730
        if (flag5 && num35 > 300 && num32 < 12) num32 = 12;   // :66731-66734
        if (type === 375) num32 = Math.trunc(num32 * 0.75);   // :66735-66738
        if (num35 < 100 && this.a62A0 === 1 && !this.solidOverlap(st)) this.a62A0 = 0;   // :66739-66743
        if (num35 > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.w / 2; }    // :66744-66748
        if (type === 375) {
          if (num35 > 10) {
            let eff = num32;
            if (num35 < 50) eff /= 2;                  // :66754-66757
            const l = num35 || 1;
            this.vx = (this.vx * 20 + (v2x / l) * eff) / 21;
            this.vy = (this.vy * 20 + (v2y / l) * eff) / 21;
          } else {
            // direction = player.direction（:66760 贴身档;下方姿态块 :66947 会在 vx≠0 时
            //  覆写 direction,故仅 vx==0 悬停肩上时可见——蓝队 R7-23 补）
            this.facing = p.facing;
            this.vx *= 0.9; this.vy *= 0.9;            // :66763-66765
          }
        } else if (type === 407) {
          if (Math.abs(v2x) > 40 || Math.abs(v2y) > 10) {     // :66769-66775
            const l = num35 || 1;
            this.vx = (this.vx * 20 + (v2x / l) * num32 * 1.25) / 21;
            this.vy = (this.vy * 20 + (v2y / l) * num32 * 0.65) / 21;
          } else {
            if (this.vx === 0 && this.vy === 0) { this.vx = -0.15; this.vy = -0.05; }  // :66778-66782
            this.vx *= 1.01; this.vy *= 1.01;          // :66783
          }
        } else if (num35 > 70) {                       // :66786-66791
          const l = num35 || 1;
          this.vx = (this.vx * 20 + (v2x / l) * num32) / 21;
          this.vy = (this.vy * 20 + (v2y / l) * num32) / 21;
        } else {
          if (this.vx === 0 && this.vy === 0) { this.vx = -0.15; this.vy = -0.05; }    // :66794-66798
          this.vx *= 1.01; this.vy *= 1.01;            // :66799
        }
        if (flag5 && num35 > 250) {
          // :66801-66825 玩家速度匹配
          const px = p.vx, py = p.vy;
          if ((this.vx < 0 && px >= 0) || (this.vx >= 0 && px < 0)) this.vx *= 0.95;
          else this.vx += px * 0.125;
          if ((this.vy < 0 && py >= 0) || (this.vy >= 0 && py < 0)) this.vy *= 0.95;
          else this.vy += py * 0.125;
          const sp = Math.hypot(this.vx, this.vy);
          if (sp > num32) { this.vx = this.vx / sp * num32; this.vy = this.vy / sp * num32; }  // :66821-66824
        }
      }
      // ---- 姿态（:66827 rotation=velocity.X×0.05 每拍终速写入 + :66947-66954
      //      velocity.X>0 → spriteDirection=-1,贴图朝左）——触发拍 return 冻结
      //      （poseFrozen）;渲染 rot+flip 复合见 draw（原版同 draw 调用叠用）----
      if (!poseFrozen) {
        this.rot = this.vx * 0.05;                   // :66827
        if (this.vx > 0) this.facing = -1;
        else if (this.vx < 0) this.facing = 1;
      }
      // ---- 射击冷却 ai[1] 随机计数器（:66963-67044）——触发拍 return 跳过
      //      （:66562,否则 423 档 ai[1]=距/10>45 会被本块立即清零=冲刺自灭）----
      if (!poseFrozen) {
      if (type === 373) {
        if (this.a62A1 > 0) this.a62A1 += 1 + Math.floor(Math.random() * 3);   // Next(1,4)=1..3
        if (this.a62A1 > 90) this.a62A1 = 0;         // :66969-66978（strongBees→70 未实装,登记）
      } else if (type === 375) {
        if (this.a62A1 > 0) {
          this.a62A1++;
          if (Math.floor(Math.random() * 3) === 0) this.a62A1++;             // :66985-66988
        }
        if (this.a62A1 > 90) this.a62A1 = 0;         // :66990-66994
      } else {
        const thr = type === 407 ? 50 : type === 423 ? 45 : 60;   // :67006/:67022/:67039
        if (this.a62A1 > 0) {
          this.a62A1++;
          if (Math.floor(Math.random() * 3) !== 0) this.a62A1++;             // :67001/:67017/:67034
        }
        if (this.a62A1 > thr) this.a62A1 = 0;
      }
      // ---- 射击（:67045-67165;!flag5 且 ai[0]≠0 不射 = :67045-67048）----
      if (tgt && (flag5 || this.a62A0 === 0)) {
        const shooter = MINION_SHOOT[type];
        if (shooter) {
          const ax = tgt.cx, ay = type === 423 ? tgt.y : tgt.cy;   // 423 瞄顶心（:66365-66368）
          if (type === 375) this.facing = ax - this.cx > 0 ? -1 : 1;   // :67080-67090 出手反向
          const dist = Math.hypot(ax - this.cx, ay - this.cy);
          let ok = true;
          if (type === 407 && this.solidOverlap(st)) ok = false;       // :67091-67094
          if (ok && type === 423) {
            // 扇区外微调（:67097-67100）+ 门距≤400（:67101）
            const rotTo = Math.atan2(ay - this.cy, ax - this.cx);
            if (Math.abs(rotTo - Math.PI / 2) > Math.PI / 4) {
              const vx9 = ax - this.cx, vy9 = ay - this.cy - 80;
              const l9 = Math.hypot(vx9, vy9) || 1;
              this.vx += vx9 / l9; this.vy += vy9 / l9;
            }
            if (dist > 400 || this.a62A1 !== 0) ok = false;
          } else if (ok && type === 613) {
            if (dist > 500 || this.a62A1 !== 0) ok = false;            // :67116
          } else if (ok && this.a62A1 !== 0) {
            ok = false;                                                // :67152
          }
          if (ok) {
            this.a62A1++;                                              // :67103/:67120/:67155
            const ps = projectileData(shooter.shot);
            const hw = (ps?.width ?? 10) / 2, hh = (ps?.height ?? 10) / 2;
            const dmg = Math.max(1, Math.round(dmg0));
            const l = dist || 1;
            const shot = new Arrow(this.cx - hw, this.cy - hh, (ax - this.cx) / l * shooter.speed,
              (ay - this.cy) / l * shooter.speed, dmg, this.knockback, shooter.shot,
              { grav: 0, life: shooter.life ?? 1200 });
            shot.whipTagShot = true;   // MinionShot 吃鞭 tag（ProjectileID.Sets.MinionShot）
            if (shooter.shot === 614) {
              // 614 星尘细胞弹 = aiStyle 113 TargetSticker（蓝队 R7-19）：NewProjectile
              // 第 11 参传目标索引 num13（:67122-67128）——硬追踪/失的即杀/183 buff 门
              shot.stickerTgt = tgt.id;
              shot.alpha = 255;        // SetDefaults alpha=255（:6619,AI −63/t 淡入 :41293）
            }
            if (type === 613) {        // :67129 后坐 velocity -= v4/3
              this.vx -= (ax - this.cx) / l * shooter.speed / 3;
              this.vy -= (ay - this.cy) / l * shooter.speed / 3;
            }
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(shot, 'projectiles');
            // 出膛音(MINION_SHOT_SFX 表:376→Item_20 等;ai62Step 接管后通用块不再走,
            //  曾漏接线=小鬼/黄蜂族出膛静音——sfx-wiring 抓出)
            const shotSfx = MINION_SHOT_SFX[shooter.shot];
            if (shotSfx) game.playSfxFiles?.(soundTrackFiles(shotSfx.track), shotSfx.vol, this.cx, this.cy);
          }
        }
      }
      } // !poseFrozen（冷却+射击段——触发拍 return 跳过 :66562）
      // ---- 待机尘（R31 §A⑥ P2,AI_062 :66903-66940——帧段每 update 跑,触发拍
      //  return 同样跳过）：375 小鬼 Next(7)==0 → d6 fire(scale2,v×0.3,noGravity,
      //  noLight);407 暴风雨 Next(5)==0 → d217(scale2,alpha100,v×0.3,noGravity,noLight)
      //  ——两杖的驻场识别色（MinionProj.ts:1328 旧登记"未折算"就此消账）----
      if (!poseFrozen) {
        if (type === 375 && Math.floor(Math.random() * 7) === 0) {
          const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 6, 0, 0, 0, null, 2);
          if (d) { d.vx *= 0.3; d.vy *= 0.3; d.noGravity = true; d.noLight = true; }
        } else if (type === 407 && Math.floor(Math.random() * 5) === 0) {
          const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 217, 0, 0, 100, null, 2);
          if (d) { d.vx *= 0.3; d.vy *= 0.3; d.noGravity = true; d.noLight = true; }
        }
      }
    }
    this.x += this.vx;
    this.y += this.vy;
    this.contact(game, dmg0);   // 台账批③：373/375/423/613=-2 全局窗、407=idStatic 10（CONTACT_CD_TABLE）
  }

  /** 蜘蛛随从 390-392（AI_026 flag7 步行链 1:1，1457 Projectile.cs :61292-61344 归位门/
   *  :61389-61618 归位飞行/:62771-63020 索敌接敌/:63058-63340 步行物理/:65092-65261
   *  爬墙与帧；1456 :57334+ 同构,行差 +3958——2026-08-23 备案项②,替代"统一飞行"）：
   *  · 归位门（:61292-61330）:num92=500+40×slot（localAI[0]>0 再 +500+400 :61295-61306）;
   *    距玩家 >num92 或（|dy|>300 且 localAI[0]≤0）→ ai[0]=1;>2000 瞬移（:61315-61318）
   *  · 归位飞行（:61389-61618,ai[0]=1）:tileCollide=false（:61410,本仓 tileCollide 通道
   *    +直接位移等价）;加速 0.2/限速 10（:61390-61406 缺省档）;锚=玩家心-40dir（无目标
   *    再 -40slot×dir :61466-61490）;途中 700 曼哈顿内首只有视线敌 → 复战 ai[0]=0
   *    （:61418-61442）;<200 且主落地且悬空 → 落地 ai[0]=0（:61490-61497）
   *  · 索敌（:62784-62860）:曼哈顿距（随从基准）+盒 CanHit 视线;LOS 最近/无视线最近
   *    双轨;集火目标优先
   *  · tileCollide 动态门（:62843-62845/:62852-62860）:盒无实心 → true;LOS 目标在本体
   *    下方（敌 y > 本体底）且脚下行是平台 → false（穿平台下扑）——moveAndCollide 消费
   *  · 接敌（:62851-62952）:LOS 目标 → 敌盒外扩 10 相交 = 扑咬 velocity=(v×9+向14)/10
   *    +rotation 朝敌（:62900-62927）;同族 15px 内 ±0.5 分离（:62932-62952）
   *  · 撤退档（localAI[1],:62958-62963+:63003-63012）:命中置 20（StatusNPC :14027-14030）
   *    → 每拍递减;>0 拍 friendly=false（不咬,本仓=跳过 contact）+行走意图=当前速度向
   *    （vx<0 走左/vx>0 走右,穿过/脱离目标）
   *  · 行走意图（:62943-63018）:num180=500/地下 250（★台账批⑨ worldSurface 语义钉死:
   *    引擎 world.groundLevel = .wld 头段紧随 spawnX/spawnY 的第一个 f64 =
   *    Main.worldSurface 存档值,WorldFile.cs:2077 读序;Game.ts wiring.worldSurface =
   *    w.groundLevel 全仓恒等映射——两名字在此恒等互换,非近似）+40×slot;
   *    无视线最近 <num180 → 朝其 X 走（±5 死区 :62943-62957）;LOS 目标 <800+40×slot →
   *    接触窗+localAI[0]=60 续走（±10 死区 :62963-62975）+目标高出 100px 且 |dx|<50
   *    且贴地 → 跳 -10/-13/-15/-17/-18（:62968-62989）
   *  · 步行物理（:63058-63340）:加速度 0.4（:63096-63135 基 0.2,玩家更快 → 0.3,
   *    flag7 ×2 :63133-63135 → 0.4/0.6）;3.5 软顶（超出 ×0.25 档 :63137-63160）;
   *    遇障探测 → 落地跳梯（walkerJumpLadder）;重力 0.4 封顶 10（:65244-65247）;
   *    StepUp 坡步（:63261,moveAndCollide stepUp 通道）
   *  · 镜像（:63302-63323+:65162）:direction=sign(vx)（行走意图匹配且 |vx|>num184 →
   *    行走向精化 :63310-63315）→ spriteDirection=-direction（313 唯一豁免 :63316）
   *  · 爬墙态（:65091-65161）:中心竖列 3 格 ≥2 有墙 → 墙面爬行（速 9 lerp /10 朝
   *    玩家[锚 40×(slot+1)]/目标[锚 10],rotation=运动向+π/2,帧 4-7,无重力;
   *    远锚拍 spriteDirection=+direction :65135）
   *  · 帧通道 spFrame:0-2 走（fc+=|vx|>8 翻页 :65219-65230）/3 空（:65241-65243）/
   *    4-7 爬（:65136-65147）
   *  · 帧 dust:【查无】——flag7 帧/爬墙全段 :65091-65261 零 Dust.NewDust/Gore 调用
   *    （AI_026 行走尘块均属 268/269/956 等他型分支）,2026-08-23 登记撤销（补尘=造行为） */
  private spiderStep(game: GameHooks, p: Player, dmg0: number): void {
    const st = game.world.store;
    this.stepUp = true;   // Collision.StepUp（:63261）
    const minionPos = this.slot;
    // ---- 归位门（:61292-61330,每拍先于状态分流）----
    let num92 = 500 + 40 * minionPos;
    if (this.spLai0 > 0) num92 += 500 + 400;         // :61295-61306（flag7 +500+400）
    const dpx = p.cx - this.cx, dpy = p.cy - this.cy;
    const dP = Math.hypot(dpx, dpy);
    if (dP > 2000) {                                  // :61315-61318
      this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2; this.vx = this.vy = 0;
    } else if (dP > num92 || (Math.abs(dpy) > 300 && this.spLai0 <= 0)) {
      if (dpy > 0 && this.vy < 0) this.vy = 0;        // :61322-61330
      if (dpy < 0 && this.vy > 0) this.vy = 0;
      this.spA0 = 1;
    }
    if (this.spLai0 > 0) this.spLai0--;               // :62775-62779
    if (this.spA0 === 1) {
      // ---- 归位飞行（:61389-61618）----
      this.tileCollide = false;                       // :61410
      // 途中复战扫描（:61418-61442）：700 曼哈顿内首只（非最近）——flag20=仅距离入
      // 池、num105=有视线才复战 ai[0]=0
      let any700 = false, los700 = false;
      for (const e of game.enemies()) {
        const en = e as EnemyLike;
        if (!canBeChasedBy(e)) continue;
        if (Math.abs(p.cx - en.cx) + Math.abs(p.cy - en.cy) >= 700) continue;
        if (canHit(st, this.x, this.y, this.w, this.h, en.x, en.y, en.w, en.h)) los700 = true;
        any700 = true;
        break;                                        // 原版首只即 break（:61437-61439）
      }
      if (los700) { this.spA0 = 0; }                  // :61442-61444
      else {
        let ax = p.cx - 40 * p.facing;                // :61466-61468
        if (!any700) ax -= 40 * minionPos * p.facing; // :61438-61440
        const ay = p.cy;
        let dx = ax - this.cx, dy = ay - this.cy;
        const num110 = Math.hypot(dx, dy);
        if (num110 < 200 && p.vy === 0 && this.y + this.h <= p.y + p.h && !this.solidOverlap(st)) {
          this.spA0 = 0;                              // :61490-61497 落地
          if (this.vy < -6) this.vy = -6;
        } else {
          if (num110 < 60) { dx = this.vx; dy = this.vy; }   // :61498-61500
          else {
            const k = 10 / (num110 || 1);             // :61503-61505 num112=10
            dx *= k; dy *= k;
          }
          // 加速 0.2 逼近（:61579-61618 缺省档 num101=0.2,越零 ×1.5 补）
          if (this.vx < dx) { this.vx += 0.2; if (this.vx < 0) this.vx += 0.3; }
          if (this.vx > dx) { this.vx -= 0.2; if (this.vx > 0) this.vx -= 0.3; }
          if (this.vy < dy) { this.vy += 0.2; if (this.vy < 0) this.vy += 0.3; }
          if (this.vy > dy) { this.vy -= 0.2; if (this.vy > 0) this.vy -= 0.3; }
          // 飞行朝向（:61626-61633）：|vx|>0.5 → spriteDirection=-sign(vx)
          if (this.vx > 0.5) this.facing = -1;
          else if (this.vx < -0.5) this.facing = 1;
          this.x += this.vx; this.y += this.vy;       // tileCollide=false（:61410）直写位移——
          //  位移阻尼不适用（tileCollide=false → 湿阻尼块 :17721 不跑,velocity 全量）
        }
      }
      return;
    }
    // ---- 地面作战（ai[0]=0）----
    // 撤退档计时（localAI[1],:62958-62963）：>0 → 本拍撤退（friendly=false+沿速度向续走）
    let retreat = false;
    if (this.spLai1 > 0) { retreat = true; this.spLai1--; }
    // 索敌（:62784-62860 曼哈顿 + 盒视线双轨；集火目标 :62792-62812 作种子先行）
    let losT: EnemyLike | null = null, losD = 100000;
    let anyT: EnemyLike | null = null, anyD = 100000;
    const focus = (p as unknown as { minionTargetId?: number }).minionTargetId ?? -1;
    if (focus >= 0) {
      for (const e of game.enemies()) {
        const en = e as EnemyLike;
        if (en.dead || en.id !== focus) continue;
        // CanBeChasedBy 门（:62793/:58832-58833 原文——门在距离求值前,ownerMinion
        //  AttackTargetNPC2.CanBeChasedBy(this)）——门败=种子整块跳过（anyT/losT
        //  不落种,num169=−1）→ 野生扫无种子照跑（2026-09-08 收口,同件 2 口径）
        if (!canBeChasedBy(e)) break;
        const d = Math.abs(this.cx - en.cx) + Math.abs(this.cy - en.cy);
        anyD = d; anyT = en;                          // :62797-62803 种子
        if (canHit(st, this.x, this.y, this.w, this.h, en.x, en.y, en.w, en.h)) { losD = d; losT = en; }
        break;
      }
    }
    for (const e of game.enemies()) {
      const en = e as EnemyLike;
      if (!canBeChasedBy(e)) continue;
      const d = Math.abs(this.cx - en.cx) + Math.abs(this.cy - en.cy);
      if (d < anyD) { anyD = d; anyT = en; }          // :62814-62860（LOS 候选可覆写种子）
      if (d < losD && canHit(st, this.x, this.y, this.w, this.h, en.x, en.y, en.w, en.h)) {
        losD = d; losT = en;
      }
    }
    // tileCollide 动态门（:62843-62845 盒无实心才回 true——嵌实心保持原值;
    // :62852-62860 LOS 目标在本体下方且脚下行是平台 → false 穿平台下扑）
    // ——moveAndCollide 消费
    if (!this.solidOverlap(st)) this.tileCollide = true;
    if (losT && losT.y > this.y + this.h) {
      const pcol = Math.floor(this.cx / 16), prow = Math.floor((this.y + this.h + 1) / 16);
      if (st.inBounds(pcol, prow) && st.isPlatform(pcol, prow)) this.tileCollide = false;
    }
    // 扑咬 + 同族分离（:62851-62952）
    if (losT) {
      const pad = 10;
      if (this.x < losT.x + losT.w + pad && this.x + this.w > losT.x - pad
        && this.y < losT.y + losT.h + pad && this.y + this.h > losT.y - pad) {
        let vx9 = losT.cx - this.cx, vy9 = losT.cy - this.cy;
        if (this.vy > 0 && vy9 < 0) this.vy *= 0.5;   // :62905-62912 相向减速
        if (this.vy < 0 && vy9 > 0) this.vy *= 0.5;
        if (this.vx > 0 && vx9 < 0) this.vx *= 0.5;
        if (this.vx < 0 && vx9 > 0) this.vx *= 0.5;
        const l9 = Math.hypot(vx9, vy9);
        if (l9 > 14) { vx9 = vx9 / l9 * 14; vy9 = vy9 / l9 * 14; }   // :62923-62925
        this.rot = (this.rot * 5 + Math.atan2(vy9, vx9) + Math.PI / 2) / 6;  // :62926
        this.vx = (this.vx * 9 + vx9) / 10;           // :62927
        this.vy = (this.vy * 9 + vy9) / 10;
        const pool = (game as unknown as { entities?: { projectiles?: unknown[] } }).entities?.projectiles;
        const projs = Array.isArray(pool) ? pool : [];
        for (const o of projs) {                       // :62932-62952 同族分离
          if (!(o instanceof MinionProj) || o === this || o.dead) continue;
          if (o.projId < 390 || o.projId > 392 || o.ownerRef() !== p) continue;
          if (Math.hypot(o.cx - this.cx, o.cy - this.cy) >= 15) continue;
          const push = 0.5;
          if (this.cy > o.cy) { o.vy -= push; this.vy += push; } else { o.vy += push; this.vy -= push; }
          if (this.cx > o.cx) { this.vx += push; o.vx -= push; } else { this.vx -= push; o.vx += push; }
        }
      }
    }
    // 行走意图（:62943-63018）
    let flag2 = false, flag3 = false;
    const walkT = losT ?? anyT;
    if (walkT) {
      // 台账批⑨：groundLevel ≡ 存档 Main.worldSurface（WorldFile.cs:2077 读序钉死,
      // Game wiring.worldSurface = w.groundLevel 恒等映射）——非近似,见类头注
      const underground = game.world.groundLevel > 0 && this.y > game.world.groundLevel * 16;  // :62931-62939
      const gate = losT ? 800 + 40 * minionPos : (underground ? 250 : 500) + 40 * minionPos;
      const distT = losT ? losD : anyD;
      if (distT < gate) {
        const dxT = walkT.cx - (this.x + this.w / 2);
        if (dxT < -(losT ? 10 : 5)) { flag2 = true; flag3 = false; }
        else if (dxT > (losT ? 10 : 5)) { flag3 = true; flag2 = false; }
        if (losT) {
          this.spLai0 = 60;                           // :62964 localAI[0]=num164
          // 目标高出 100px（num166=敌顶 < 心-100）且 |dx|<50 且贴地 → 跳距表（:62968-62989）
          if (walkT.y < this.cy - 100 && Math.abs(dxT) < 50 && this.vy === 0) {
            const h = Math.abs(walkT.y - this.cy);
            this.vy = h < 120 ? -10 : h < 210 ? -13 : h < 270 ? -15 : h < 310 ? -17 : h < 380 ? -18 : this.vy;
          }
          // 撤退档（:63003-63012）：friendly=false（本仓=跳过 contact,见尾）+
          // 行走意图 = 当前速度向（vx<0 走左/vx>0 走右——穿过/脱离目标）
          if (retreat) {
            if (this.vx < 0) { flag2 = true; flag3 = false; }
            else if (this.vx > 0) { flag3 = true; flag2 = false; }
          }
        }
      }
    } else {
      // 跟随玩家（:59931-59945 悬移偏移）
      const off = 40 * (minionPos + 1) * p.facing;
      if (p.cx < this.cx - 10 + off) { flag2 = true; flag3 = false; }
      else if (p.cx > this.cx + 10 + off) { flag3 = true; flag2 = false; }
    }
    // 爬墙态（:65092-65175）：中心竖列 3 格 ≥2 有墙 → 墙面爬行（无重力）
    const cc = Math.floor(this.cx / 16), cr = Math.floor(this.cy / 16);
    let walls = 0;
    for (let oy = -1; oy <= 1; oy++) {
      if (st.inBounds(cc, cr + oy) && st.wall[st.idx(cc, cr + oy)] > 0) walls++;
    }
    if (walls > 1) {
      const toT = losT ? Math.hypot(losT.cx - this.cx, losT.cy - this.cy) : 0;
      let vx10 = p.cx - this.cx, vy10 = p.cy - this.cy;
      let anchor = 40 * (minionPos + 1);
      if (losT && toT > 0) { vx10 = losT.cx - this.cx; vy10 = losT.cy - this.cy; anchor = 10; }  // :65107-65110
      const dl = Math.hypot(vx10, vy10) || 1;
      if (dl < anchor) {                              // :65112-65118
        this.vx *= 0.9;
        if (Math.abs(this.vx) + Math.abs(this.vy) < 0.1) { this.vx = 0; this.vy = 0; }
      } else if (dl < 800 || !losT) {
        this.vx = (this.vx * 9 + vx10 / dl * 9) / 10; // :65119 num233=9
        this.vy = (this.vy * 9 + vy10 / dl * 9) / 10;
      }
      // 镜像（:63302-63308 direction=sign(vx) 先行,爬墙段 :65135 远锚拍
      // spriteDirection=+direction;近锚拍保持前值）
      if (this.vx < 0) this.spDir = -1;
      else if (this.vx > 0) this.spDir = 1;
      if (dl >= anchor) {
        this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;   // :65136
        this.facing = this.spDir;                                // :65135（+direction,非取反）
      } else this.rot = Math.atan2(vy10, vx10) + Math.PI / 2;
      this.spFrame = 4 + Math.floor(this.age / 2) % 4;   // :65136-65147 帧 4-7
      // 原版爬墙段只写 velocity（:65112-65119）,位移走 HandleMovement（蜘蛛
      //  tileCollide=true 缺省,湿支照跑）→ 本仓直写位乘湿阻尼档,同相
      const dfSpiderWall = projWaterDragFactor(this);
      this.x += this.vx * dfSpiderWall; this.y += this.vy * dfSpiderWall;
      // 撤退拍 friendly=false（:63004）不咬;命中置撤退计时（StatusNPC :14027-14030）
      if (!retreat && this.contact(game, dmg0)) this.spLai1 = 20;   // 台账批③：蜘蛛族 idStatic 15（CONTACT_CD_TABLE :4754）
      return;
    }
    // 步行物理（:63058-63340）
    this.rot = 0;                                     // :65160（!flag24 拍）
    let num184 = 0.2 * 2;                             // :63096-63132 基 0.2 ×flag7 双倍（:63133-63135）
    let num185 = 6;
    if (num185 < Math.abs(p.vx) + Math.abs(p.vy)) { num185 = Math.abs(p.vx) + Math.abs(p.vy); num184 = 0.3 * 2; }  // :63101-63104 → :63133 ×2=0.6
    let jump = false;
    if (flag2 || flag3) {
      const dirX = flag2 ? -1 : 1;
      if (dirX < 0) { this.vx = this.vx > -3.5 ? this.vx - num184 : this.vx - num184 * 0.25; }   // :63137-63146
      else { this.vx = this.vx < 3.5 ? this.vx + num184 : this.vx + num184 * 0.25; }
      jump = this.walkerJumpIntent(st, dirX);         // :63175-63198 遇障探测
    } else {
      this.vx *= 0.9;                                 // :63147-63156
      if (this.vx >= -num184 && this.vx <= num184) this.vx = 0;
    }
    this.vx = Math.max(-num185, Math.min(num185, this.vx));   // :63300-63304
    // 镜像（:63302-63323）：direction=sign(vx),行走意图匹配且 |vx|>num184 → 行走向
    // 精化;spriteDirection = -direction（:65162 flag7 专属赋值同式）
    if (this.vx < 0) this.spDir = -1;
    else if (this.vx > 0) this.spDir = 1;
    if (this.vx > num184 && flag3) this.spDir = 1;
    if (this.vx < -num184 && flag2) this.spDir = -1;
    this.facing = -this.spDir;
    this.vy = Math.min(this.vy + 0.4, 10);            // :65244-65247
    // ★水中位移阻尼（:17721 湿支;蜘蛛 tileCollide 动态门 :62843-62845,真拍走湿支）
    const dfSpiderWalk = projWaterDragFactor(this);
    moveAndCollide(this, game.world, this.vx * dfSpiderWalk, this.vy * dfSpiderWalk);
    if (this.onGround && jump && (flag2 || flag3)) {
      this.walkerJumpLadder(st, flag2 ? -1 : 1);      // :63220-63290
    }
    // 帧通道（:65199-65243）：空 3 / 走 0-2（fc+=|vx|>8 翻页）/ 立 0
    if (!this.onGround) this.spFrame = 3;
    else if (Math.abs(this.vx) > 0.8) this.spFrame = Math.floor(this.age / 2) % 3;
    else this.spFrame = 0;
    // 撤退拍 friendly=false（:63004）不咬;命中置撤退计时（StatusNPC :14027-14030
    // localAI[1]=20——次拍起 20t 撤退）
    if (!retreat && this.contact(game, dmg0, 20)) this.spLai1 = 20;
  }

  /** 吸血蛙 758（AI_067 flag2 步行链折算,1457 Projectile.cs :50209-50214 索敌档/
   *  :50478-50482 friendly 恒开/:50329-50334 跟随锚/:51004-51007 接敌锚距/
   *  :51155-51184 扑击门/:51296-51557 移动档与跳梯/:51616-51619 湿身跳;1456 :46330+
   *  同构——2026-08-23 备案项②,替代"统一飞行"）：
   *  · 索敌 num2=800（:50213）+视线（:50496-50504 Minion_FindTargetInRange
   *    skipIfCannotHitWithOwnBody）
   *  · 跟随锚 = 玩家心 -(35+w/2)×dir - 40×slot×dir（:50329-50334）;归位门 num3/num4
   *    缺省 500/300（:50031-50033,758 无覆写）;归位飞行（:50636-50712）tileCollide=
   *    false、加速 0.2/限速 10、<200 且主落地且悬空 → 落地（:50686-50692）
   *  · 接敌锚 = 敌心 + 远侧 20px 过冲（:51161-51168）;扑击门 = 距锚 <num30（flag2=50
   *    :51004-51007）→ ai[0]=2/ai[1]=num10=20（:50478-50482/:51155-51160）
   *  · 移动档（:51307-51311 有目标 0.7/6/6;:51296-51298 无目标 0.5/4/4;玩家更快 →
   *    0.7/玩家速 :51342-51345）;±5 死区（:51348-51362,越零 ×1.5 补/超速 0.1 缓档）
   *  · 跳梯 -5.1..-11.1（:51470-51490）+目标高出距离表 -6..-16（:51492-51527）;
   *    重力 0.4 封顶 10（:51553-51557）;湿身跳 ×2（:51616-51619,贴地 wet 门恒真
   *    同 palGroundStep 注）
   *  · 扑击态（ai[0]=2,:50901-50956）:首拍贴地 vx×0.1（:50905-50907）,ai[1]-- 归零
   *    回 0（:50954-50956）;friendly 恒 true（:50478-50482——接触伤不受扑击窗钳制）;
   *    spriteDirection=direction（:50885,扑击入场 direction 朝敌 :51139）
   *  · 镜像（:51647-51671）:direction=sign(vx)、静止朝玩家（:51655-51657）、行走意图
   *    精化（|vx|>num50 且意图同向 :51658-51663）→ spriteDirection=+direction（蛙贴图
   *    朝右,与蜘蛛 -direction 反向）
   *  · tileCollide 动态门:归位飞行 :50648 false / 地面 :51266 true——moveAndCollide 消费
   *  · 帧 dust:【查无】——758 步行/跳跃段零 Dust.NewDust/Gore（AI_067 跳跃尘块均属
   *    flag=海盗 393-395 :51049-51097 / flag8=猫 :50911 / 1018 专属）,登记撤销
   *  · 帧通道（遗留债,非本批四项）:待机 14-17（fc/3 :50808-50820,rotation=vx×0.15）、
   *    扑击 18-20/21-23（num26 五格乒乓 :50911-50931）——draw 侧仍走 age/8 兜底 */
  private frogStep(game: GameHooks, p: Player, dmg0: number): void {
    const st = game.world.store;
    this.stepUp = true;
    // 湿旗=上拍段值快照 wetAi（vanilla AI_067 :51616 湿身 ×2 读 Projectile.wet=AI 先于
    // 湿段跑读上一子步段值;2026-09-08 定谳批,见类字段块头注①②③）
    const wet = this.wetAi;
    // 终清波批：Minion_FindTargetInRange(num2=800, skipOwnBody) 双距检索归真
    const tgt = this.findTargetInRangeDual(game, 800);
    // ---- ai[0]=1 归位飞行（:50636-50712）----
    if (this.frA0 === 1) {
      this.tileCollide = false;                       // :50648
      // 位移阻尼不适用（tileCollide=false → 湿阻尼块 :17721 不跑;直写位=velocity 全量）
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const dl = Math.hypot(dx, dy);
      if (dl > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2; }   // :50659-50662
      else if (dl < 200 && p.vy === 0 && this.y + this.h <= p.y + p.h && !this.solidOverlap(st)) {
        this.frA0 = 0; this.frA1 = 0;                 // :50686-50692 落地
        if (this.vy < -6) this.vy = -6;
      } else {
        const num19 = Math.max(10, Math.abs(p.vx) + Math.abs(p.vy));   // :50640-50648
        const l = dl || 1;
        if (this.vx < dx / l * num19) { this.vx += 0.2; if (this.vx < 0) this.vx += 0.3; }
        if (this.vx > dx / l * num19) { this.vx -= 0.2; if (this.vx > 0) this.vx -= 0.3; }
        if (this.vy < dy / l * num19) { this.vy += 0.2; if (this.vy < 0) this.vy += 0.3; }
        if (this.vy > dy / l * num19) { this.vy -= 0.2; if (this.vy > 0) this.vy -= 0.3; }
        this.x += this.vx; this.y += this.vy;         // tileCollide=false（:50637）
      }
      return;
    }
    // ---- 扑击态（ai[0]=2,:50901-50956）----
    if (this.frA0 === 2) {
      this.frA1--;                                    // :50953
      if (this.frA1 === 20 - 1 && this.vy === 0) this.vx *= 0.1;   // :50905-50907
      this.vy = Math.min(this.vy + 0.4, 10);          // :50951-50953
      // ★水中位移阻尼（:17721 湿支;扑击态 tileCollide 承地面拍 :51266 置真,湿支照跑）
      const dfFrogPounce = projWaterDragFactor(this);
      moveAndCollide(this, game.world, this.vx * dfFrogPounce, this.vy * dfFrogPounce);
      if (this.frA1 <= 0) { this.frA0 = 0; this.frA1 = 0; }        // :50954-50956
      this.contact(game, dmg0);                       // 台账批③：吸血蛙 idStatic 10（CONTACT_CD_TABLE :7825）
      return;
    }
    // ---- 地面态（ai[0]=0,:51186-51619）----
    this.tileCollide = true;                          // :51266
    // 无目标归位门（:51186-51201）：>2000 瞬移 / >500 或 |dy|>300 → ai[0]=1
    const dpx = p.cx - this.cx, dpy = p.cy - this.cy;
    const dP = Math.hypot(dpx, dpy);
    if (!tgt) {
      if (dP > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2; }
      else if (dP > 500 || Math.abs(dpy) > 300) { this.frA0 = 1; return; }
    }
    // 目标锚（:51003-51007 + :51161-51168）：敌心 + 远侧 20px 过冲
    let ax: number, ay: number;
    if (tgt) {
      const dirT = tgt.cx - this.cx < 0 ? -1 : 1;
      ax = tgt.cx - 20 * dirT;
      ay = tgt.cy;
      // TryJumpingToTarget 共享尾（:51024 调用位;toTarget.Y=敌心 Y——flag2 的 20px
      // 过冲是 :51167 X 轴另段,Y 同值）;跃起后 vy<0 使步行结算段让位（原版同序;
      // 湿中下落跃起走 :52114 支）。扑击门在原版 :51132 后于共享尾,照此位序
      this.ai67TryJumpingToTargetTail(tgt.cy, false);
      // 扑击门（:51155-51160）：距锚 <50 → ai[0]=2/ai[1]=num10=20
      if (Math.hypot(ax - this.cx, ay - this.cy) < 50) {
        this.frA0 = 2; this.frA1 = 20;
        this.facing = tgt.cx - this.cx > 0 ? 1 : -1;  // :51159-51160
        return;
      }
    } else {
      // 跟随锚（:50329-50334）
      ax = p.cx - (35 + p.w / 2) * p.facing - this.slot * 40 * p.facing;
      ay = p.cy;
    }
    // 移动档（:51296-51345）：无目标 0.5/4/4 → 有目标 0.7/6/6 → 玩家更快 0.7/玩家速
    let num50 = 0.5, num51 = 4, num52 = 4;
    if (tgt) { num50 = 0.7; num51 = 6; num52 = 6; }
    if (num52 < Math.abs(p.vx) + Math.abs(p.vy)) { num52 = Math.abs(p.vx) + Math.abs(p.vy); num50 = 0.7; }
    const dx = ax - this.cx;
    if (Math.abs(dx) > 5) {
      if (dx < 0) { this.vx -= this.vx > -num51 ? num50 : 0.1; if (dx < 0 && this.vx > 0) this.vx -= 0.1; }
      else { this.vx += this.vx < num51 ? num50 : 0.1; if (dx > 0 && this.vx < 0) this.vx += 0.1; }   // :51348-51362
    } else {
      this.vx *= 0.9;                                 // :51406-51410
      if (Math.abs(this.vx) < num50 * 2) this.vx = 0;
    }
    this.vx = Math.max(-num52, Math.min(num52, this.vx));
    // 镜像（:51647-51671）：direction=sign(vx)、静止朝玩家（:51655-51657）、行走意图
    // 精化（|vx|>num50 且意图同向 :51658-51663）→ spriteDirection=+direction（:51671）
    if (this.vx < 0) this.facing = -1;
    else if (this.vx > 0) this.facing = 1;
    else this.facing = p.cx > this.cx ? 1 : -1;
    if (this.vx > num50 && dx > 0) this.facing = 1;
    if (this.vx < -num50 && dx < 0) this.facing = -1;
    // 跳梯两面合流（终清波批,ai67JumpFlags——旧 walkerJump* 单柱形退役）：
    //  (a) 家族墙意图档 flag20：蛙=flag2 → attackTarget!=-1（无目标跟随期不恒跳）
    //  (b) 前墙列扫 num55≠0 ∧ flag21（|Δx|≥64 ∨ Δy≤−48∧|Δx|≥8）;落地后
    //      ai67JumpLadder 三柱承立闸 + 单柱中腰基准五档（虎先例共轨）
    const jump = this.ai67JumpFlags(st, ax, ay, { wallIntent: tgt !== null });
    this.vy = Math.min(this.vy + 0.4, 10);            // :51553-51557
    // ★水中位移阻尼（:17721 湿支;湿段 tick 头已刷新当拍旗,速度场不减只削当拍位移
    //  ——下方 wet 起跳 ×2 读 velocity 场=未阻尼,原文同相）
    const dfFrogWalk = projWaterDragFactor(this);
    moveAndCollide(this, game.world, this.vx * dfFrogWalk, this.vy * dfFrogWalk);
    if (this.onGround) {
      if (jump) this.ai67JumpLadder(st, Math.sign(dx) || 1);
      const dyA = ay - this.cy;
      if (dyA < -48) {                                // :51492-51527
        const d = -dyA;
        this.vy = d < 60 ? -6 : d < 80 ? -7 : d < 100 ? -8 : d < 120 ? -9
          : d < 140 ? -10 : d < 160 ? -11 : d < 190 ? -12 : d < 210 ? -13
          : d < 270 ? -14 : d < 310 ? -15 : -16;
      }
      if (wet) this.vy *= 2;                          // :51616-51619 湿身跳翻倍
    }
    this.contact(game, dmg0);                         // friendly 恒开（:50478-50482）;台账批③ idStatic 10（:7825,旧 20t/30t 私表退役）
  }

  /** 乌鸦 317（aiStyle 54，AI :27383-27590 1:1）：同类 28px 内互推 0.05
   *  （:27397-27416）；归位门（:27422-27430）：曼哈顿 >num440（500；ai[1]≠0 扑击态
   *  或 friendly（冲刺帧）→ 1400）→ ai[0]=1。
   *  攻击态索敌 900 曼哈顿 + 视线（:27433-27485）；无目标 → 跟随玩家上方 60px
   *  （速 8/12，317 距>100 提速 12/15，velocity=(v×20+dir)/21 :27499-27536，
   *  >2000 瞬移 :27519-27522，<70 漂移 ×1.01 :27537-27540）；有目标 → 扑击循环
   *  （ai[1]==-1→17 倒数，归零后以 16/10 速冲向目标 :27557-27580，帧 4-7）。
   *  仅扑击中有接触伤（friendly 门 :27568/:27581），localNPCHitCooldown=10（:3836）；
   *  命中重置 ai[1]=-1（case 317 :12777-12780） */
  private ravenBody(game: GameHooks, p: Player, dmg0: number): void {
    // vanilla aiStyle 54 每拍按【入拍 ai[0]】写 tileCollide（:29042 attack 真 /
    //  :29079 归位假;近身回攻 ai[0]=0 写在后,不回写本拍碰撞位）→ 湿阻尼门锚入拍态
    const rA0Entry = this.rA0;
    // 同类分离（:27397-27416）
    const projs = (game as unknown as { entities: { projectiles: MinionProj[] } }).entities.projectiles;
    for (const m of projs) {
      if (m === this || !(m instanceof MinionProj) || m.dead || m.projId !== 317) continue;
      if (Math.abs(this.x - m.x) + Math.abs(this.y - m.y) < this.w) {
        this.vx += this.x < m.x ? -0.05 : 0.05;
        this.vy += this.y < m.y ? -0.05 : 0.05;
      }
    }
    // 归位门（:27422-27430）：num440=500；ai[1]≠0（扑击倒数/命中重置态）或
    // friendly（上一 tick 冲刺帧置位 :27547）→ 1400
    const num440 = this.rA1 !== 0 || this.rFriendly ? 1400 : 500;
    if (Math.abs(this.cx - p.cx) + Math.abs(this.cy - p.cy) > num440) this.rA0 = 1;
    // 索敌（仅 ai[0]==0：num439=900 曼哈顿 + CanHit 视线，:27433-27485）
    let tgt: EnemyLike | null = null;
    if (this.rA0 === 0) {
      let best = 900;
      for (const e of game.enemies()) {
        const en = e as EnemyLike;
        if (!canBeChasedBy(e)) continue;   // CanBeChasedBy :91070/:91141——友好+immortal 族不入索敌（防追踪睡渔夫/假人）
        if (en.dead) continue;
        const d = Math.abs(this.cx - en.cx) + Math.abs(this.cy - en.cy);
        if (d < best && canHit(game.world.store, this.x, this.y, this.w, this.h, en.x, en.y, en.w, en.h)) {
          best = d; tgt = en;
        }
      }
    }
    if (!tgt) {
      // 跟随玩家上方 60px（:27501-27545）
      const dx = p.cx - this.cx, dy = p.cy - 60 - this.cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 100 && this.rA0 === 1) this.rA0 = 0; // :27512-27517（归位态近身回攻击态）
      if (dist > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.w / 2; } // :27519-27522
      let spd = this.rA0 === 1 ? 12 : 8;              // :27501-27503
      if (dist > 100) spd = this.rA0 === 1 ? 15 : 12; // :27524-27531（317 专属提速）
      if (dist > 70) {
        this.vx = (this.vx * 20 + (dx / dist) * spd) / 21; // :27533-27535
        this.vy = (this.vy * 20 + (dy / dist) * spd) / 21;
      } else {
        if (this.vx === 0 && this.vy === 0) { this.vx = -0.15; this.vy = -0.05; } // :27537-27539
        this.vx *= 1.01; this.vy *= 1.01;                                            // :27540
      }
      this.rot = this.vx * 0.05; // :27542
      this.ravenZone = 0;        // 帧 0-3（:27543-27549）
      if (Math.abs(this.vx) > 0.2) this.facing = -Math.sign(this.vx); // :27551-27553（spriteDirection=-direction）
      // ★水中位移阻尼（:17721 湿支只对 tileCollide=true 宿主跑——attack 态 :29042;
      //  归位态 :29079 false → 恒全速）
      const dfRavenFollow = rA0Entry === 0 ? projWaterDragFactor(this) : 1;
      this.x += this.vx * dfRavenFollow; this.y += this.vy * dfRavenFollow;
      this.rFriendly = false; // :27519（跟随期收尾 friendly=false——下一 tick 归位门读此值）
      return; // friendly=false（:27544）——跟随期无接触伤
    }
    // 扑击循环（:27557-27590）
    if (this.rA1 === -1) this.rA1 = 17; // :27557-27559
    if (this.rA1 > 0) this.rA1--;
    let charging = false;
    if (this.rA1 === 0) {
      // 冲刺（friendly=true :27547-27580）：速 16，距<100 → 10；velocity=(v×14+dir)/15
      const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const spd = dist < 100 ? 10 : 16;
      this.vx = (this.vx * 14 + (dx / dist) * spd) / 15;
      this.vy = (this.vy * 14 + (dy / dist) * spd) / 15;
      charging = true;
      this.rFriendly = true; // :27547（冲刺帧 friendly=true）
    } else {
      this.rFriendly = false;           // :27566（倒数帧 friendly=false）
      if (Math.abs(this.vx) + Math.abs(this.vy) < 10) {
        this.vx *= 1.05; this.vy *= 1.05; // :27582-27585
      }
    }
    this.rot = this.vx * 0.05; // :27587
    this.ravenZone = 1;        // 帧 4-7（:27588-27594）
    if (Math.abs(this.vx) > 0.2) this.facing = -Math.sign(this.vx);
    // ★水中位移阻尼（扑击循环仅在 attack 态（:29042 tileCollide=true）可达,湿支照跑）
    const dfRavenPounce = projWaterDragFactor(this);
    this.x += this.vx * dfRavenPounce; this.y += this.vy * dfRavenPounce;
    if (charging && this.contact(game, dmg0, 10)) this.rA1 = -1; // 命中重置（:12777-12780）
  }

  /** 致命球 533 相位推进（AI_066 :28497-28689/:28741-28753/:28998-29039 1:1 折算）：
   *  0-2 待机 → 敌 <800 且冷却好 → 第 1-3 击入 6/7/8 冲刺（localAI[0]<3，:29029-29038）、
   *  每 3 击后入 4/5/3 蓄力（localAI[0]≥3 → ai[0]+=4（6→3）并清零，:29020-29028）；
   *  3-5 蓄力 ai[1]>16 → ai[0]-=3（:28624-28628）、6-8 冲刺 ai[1]>40/30/30 →
   *  ai[0]-=6 + localAI[0]++（:28658-28666）；距玩家 >1500 → ai[0]+=3×(3-⌊ai[0]/3⌋)
   *  入 9-11 归位（:28741-28753），<450 落位 ai[0]-=9（:28824-28834）；攻击间隔
   *  ai[1] 1→10 自增归零（:28958-28967） */
  private deadlySpherePhase(game: GameHooks, p: Player, tgt: EnemyLike | null): void {
    const distP = Math.hypot(p.cx - this.cx, p.cy - this.cy);
    if (this.dA0 >= 3 && this.dA0 <= 5) {
      // 蓄力段（:28581-28629）：velocity×0.9/update + ai[1] 计时
      this.dA1++;
      this.vx *= 0.81; this.vy *= 0.81; // ×0.9 每 update ×2 update/tick
      if (this.dA1 > 16) { this.dA0 -= 3; this.dA1 = 0; } // :28624-28628（num564×8）
      return;
    }
    if (this.dA0 >= 6 && this.dA0 <= 8) {
      // 冲刺段（:28630-28685）：ai[1] 计时（6→40t、7/8→30t）
      this.dA1++;
      if (this.dA1 > (this.dA0 === 6 ? 40 : 30)) { this.dA1 = 1; this.dA0 -= 6; this.dLai0++; }
      return;
    }
    // 攻击间隔（:28958-28967）
    if (this.dA1 > 0 && ++this.dA1 > 10) this.dA1 = 0;
    // 归位落位（:28824-28834：距玩家 <450 且脚下非实心 → ai[0]-9 回待机）
    if (this.dA0 >= 9 && distP < 450
      && !game.world.store.isSolid(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) {
      this.dA0 -= 9;
    }
    // 距玩家过远 → 归位冲刺（:28735-28753：num574 = 有目标 1500 / 无目标 900）
    if (this.dA0 < 3 && distP > (tgt ? 1500 : 900)) {
      this.dA0 += 3 * (3 - Math.floor(this.dA0 / 3));
      return;
    }
    // 攻击触发（:29005-29038：ai[0]<9、冷却好、敌 <800）
    if (this.dA0 < 3 && this.dA1 === 0 && tgt) {
      if (Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) < 800) {
        this.dA1++;
        if (this.dLai0 >= 3) { this.dA0 += 4; if (this.dA0 === 6) this.dA0 = 3; this.dLai0 = 0; }
        else this.dA0 += 6;
      }
    }
  }

  /** 星尘守护者 623（套装奖励，AI_120_StardustGuardian :45453-45785 1:1）：
   *  ai[0] 状态机——0=贴身跟随（Lerp 0.05 至玩家侧后 -(5+w/2)×dir,-25，索敌 500
   *  （|Δx-锚|≤170 门 :45527-45530）， leash 步进 0.1 :45536-45556）→ 2=冲刺拳击
   *  （绕到目标背侧 npc-(dir×(w/2+70),-10)，velocity.MoveTowards(≤6×Remap(50..400,1..4),32)
   *  :45708-45713，每 4t 重锁 :45715-45726）→ 失去目标/超 500 回 0。
   *  1/3=rest 双态（★BJ157⑧ 补接 MinionRestTarget 消费面）：1=驻守 rest 点
   *  （:45562-45651——无点回 0 :45564-45570；索敌锚【玩家中心】 :45786-45788，
   *  漂移 |Δx|>190 / |Δy|>100 → 3 :45612-45640）；3=飞行 rest 点（:45707-45755——
   *  alpha=255 隐身+尘爆/尾迹，Lerp 0.2，<10px → 1 :45749-45752）。原版出生 ai[0]=0
   *  且状态 0 无 else 支（:45524-45560）→ rest 环 {1,3} 单机不可达（写点入口仅
   *  Forbidden 套 KeyDoubleTap :57449-57456;1456/1457/1458 三版同相）——1:1 照抄
   *  休眠支,测试经 ai[0] 直置驱动。
   *  命中仅状态 2：80×40 拳盒于 Center+direction×40（Colliding :14294-14300），
   *  localNPCHitCooldown=5（:6433）；伤害走 resolveWhipTagHit（623 是 minion） */
  private guardianBody(game: GameHooks, p: Player, dmg0: number): void {
    const add = (e: unknown) =>
      (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'projectiles');
    // ★BJ157⑧ 显隐门（:45481-45499 top-of-AI,flag 块内）：ai[0]!=3 ∧ alpha==255 →
    //  显形 + 30 粒尘爆（状态 3 隐身飞行离场后的下一拍复位;出生 alpha=0 不触发）
    if (this.gA0 !== 3 && this.gAlpha === 255) {
      this.gAlpha = 0;
      this.guardianDustBurst(game, false);
    }
    const restX = p.cx - (5 + p.w / 2) * p.facing; // :45484（(5+player.width/2)×direction）
    const restY = p.cy - 25;                        // :45485
    if (this.gA0 === 2) {
      // ---- 状态 2：冲刺拳击 ----
      const tgt = this.enemyById(game, this.gA1);
      const inRange = tgt && Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) <= 500; // :42203（Distance > num3=500 作废）
      const nearPlayer = Math.hypot(p.cx - this.cx, p.cy - this.cy) < 500;          // :42196（flag5）
      if (!tgt || !inRange || !nearPlayer) {
        this.gA0 = 0; this.gA1 = -1; // :42208-42212
        this.gFrame = 18;            // :42213-42216（收拳帧）
      } else {
        const dirX = tgt.cx - p.cx > 1 ? 1 : -1;    // :42220
        // :42221 目标位 = 敌心 + (-dirX×(敌宽/2+70), -10)
        const relX = tgt.cx - dirX * (tgt.w / 2 + 70) - this.cx;
        const relY = tgt.cy - 10 - this.cy;
        // :42222 maxAmount = 6×Remap(dist, 50→400, 1→4)
        const dist = Math.hypot(relX, relY);
        const maxAmt = 6 * remap01(dist, 50, 400, 1, 4);
        const dl = Math.hypot(relX, relY);
        const desX = dl <= maxAmt ? relX : relX / dl * maxAmt; // MoveTowards(Zero, rel, maxAmt)
        const desY = dl <= maxAmt ? relY : relY / dl * maxAmt;
        // :42224-42225 velocity.MoveTowards(desired, 32)
        const vl = Math.hypot(desX - this.vx, desY - this.vy);
        if (vl > 32) { this.vx += (desX - this.vx) / vl * 32; this.vy += (desY - this.vy) / vl * 32; }
        else { this.vx = desX; this.vy = desY; }
        this.facing = dirX; // :42226
        this.x += this.vx; this.y += this.vy;
        // 每 4t 重锁 500 内最近敌（:42227-42238）
        if (++this.gRetarget >= 4) {
          this.gRetarget = 0;
          const nt = this.nearestEnemy(game, 500);
          if (nt) this.gA1 = nt.id;
        }
        // 攻击帧 12-19（12/13 快速、14 后保持 :42173-42191）
        if (this.gFrame < 12) this.gFrame = 12;
        const rate = this.gFrame === 12 || this.gFrame === 13 ? 8 : 3;
        if (++this.gFc >= rate) { this.gFc = 0; if (++this.gFrame >= 19) this.gFrame = 14; }
        // 拳盒命中（:14294-14300：状态 2 才有碰撞，80×40 @ Center+direction×40）
        for (const ent of game.enemies()) {
          if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
          const en = ent as never as EnemyLike & import('./WhipTag').WhipTagged;
          if (en.dead) continue;
          const bx = this.cx + this.facing * 40 - 40, by = this.cy - 20;
          if (en.x + en.w <= bx || en.x >= bx + 80 || en.y + en.h <= by || en.y >= by + 40) continue;
          if (!this.hitCd.ready(en.id, 5)) continue; // localNPCHitCooldown=5（:6433）
          const res = resolveWhipTagHit(en, dmg0, game, add, SUMMON_TAG_MUL[623] ?? 1, en.cx, en.cy,
            this.ownerRef());
          en.hurt(applyBannerDamageDealt(game, en, res.dmg), Math.sign(en.cx - this.cx) * this.knockback, -1, game, 0, false, 1, true); // 随从=单发弹语义(不设敌方帧);fromPlayer=DPS 计
          applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
          this.attackFlash = 24;
          // ★2026-09-01 StardustPunch(7) 出手面（Projectile.cs:14331-14337,type==623
          //  Damage 命中支,clientOnly:false → 本地直生 + module8 上行,原版即全网）：
          //  PositionInWorld = Lerp(Center, targetNPC.Hitbox.ClosestPointInRect(Center), .5)
          //  + (0, NextFloatDirection×10)；MovementVector = (direction, NextFloatDirection×.5)
          //  ×(3+3r)。星尘护手 623 星屑紫罗兰光点消费本体 stardustPunchFx（δB B11 同
          //  "命中拍逐靶一发"口径）。
          {
            const clx = Math.max(en.x, Math.min(this.cx, en.x + en.w));
            const cly = Math.max(en.y, Math.min(this.cy, en.y + en.h));
            const px623 = (this.cx + clx) * 0.5, py623 = (this.cy + cly) * 0.5
              + (Math.random() * 2 - 1) * 10;
            const mv623m = 3 + 3 * Math.random();              // 乘区共用一掷（:14334）
            const mv623x = this.facing * mv623m;
            const mv623y = (Math.random() * 2 - 1) * 0.5 * mv623m;
            stardustPunchFx(game, px623, py623, mv623x, mv623y);
            game.broadcastParticleOrchestra?.(ParticleOrchestraType.StardustPunch,
              px623, py623, mv623x, mv623y);
          }
        }
        // ★F4 召唤/哨兵弹伤害时刻的小动物恒拒门（CanNPCBeHitByPlayerOrPlayerProjectile
        // (npc, projectile)：flag = …∪(projectile.minion ∪ MinionShot ∪ sentry ∪
        // SentryShot) ⇒ 普通小动物不吃召唤伤（无需饰品）；黑化复权体在出口内放行。
        // 盒 = :14294-14300 状态2 拳盒（Center+direction×40，80×40））
        if ((game as unknown as { critters?: () => unknown[] }).critters?.().length) {
          hitCritters(
            { x: this.cx + this.facing * 40 - 40, y: this.cy - 20, w: 80, h: 40 },
            game,
            { minion: true, sentry: this.sentry });
        }
      }
      return;
    }
    if (this.gA0 === 1) {
      // ---- 状态 1：rest 驻守（:45562-45651）——消费 MinionRestTargetPoint ----
      let ax = restX, ay = restY;                    // vector（缺省肩锚）
      if (p.hasMinionRestTarget) {                   // :45563-45566
        ax = p.minionRestTargetX;
        ay = p.minionRestTargetY;
      } else {
        this.gA0 = 0;                                // :45567-45570（先置 0——本拍目标支仍可覆写 2,原版序）
      }
      // 索敌锚=玩家中心（AI_120_..._FindTarget :45786-45788 Main.player[owner].Center;
      // |Δx-锚|>170 跳过 :45572-45581）——from:'player' 与原版同锚
      let tgt: EnemyLike | null = null;
      if (Math.abs(this.cx - ax) <= 170) tgt = this.nearestEnemy(game, 500, 'none', 'player');
      if (tgt) {
        const dirX = tgt.cx > this.cx ? 1 : -1;      // :45583
        this.facing = dirX;
        const num11 = Math.abs(ax - this.cx);
        const num12 = Math.abs(tgt.cx - this.cx);
        const num13 = Math.abs(ay - this.cy);
        const num14 = Math.abs(tgt.cy - (this.y + this.h));
        const dirY = tgt.cy > this.y + this.h ? 1 : -1;
        // X/Y leash（:45589-45604，num=150/num4=100——与状态 0 同式,锚=rest 点）
        if ((num11 < 150 || (ax - this.cx) * dirX < 0) && num12 > 20 && num12 < 150 - num11 + 100) {
          this.vx += 0.1 * dirX;
        } else this.vx *= 0.7;
        if ((num13 < 100 || (ay - (this.y + this.h)) * dirY < 0) && num14 > 10 && num14 < 100 - num13 + 10) {
          this.vy += 0.1 * dirY;
        } else this.vy *= 0.7;
        if (num12 < 500) { this.gA0 = 2; this.gA1 = tgt.id; }   // :45606-45610
      } else {
        // 漂移回收（:45612-45640）：|Δx|>190 → 状态 3；>20 步进 0.06；否则衰减+面向玩家
        if (Math.abs(ax - this.cx) > 190) {
          this.gA0 = 3;
        } else if (Math.abs(ax - this.cx) > 20) {
          this.facing = ax > this.cx ? 1 : -1;       // :45623
          this.vx += 0.06 * this.facing;
        } else {
          this.vx *= 0.8;
          this.facing = p.cx < this.cx ? 1 : -1;     // :45625（(player.Center.X < Center.X)）
        }
        if (Math.abs(ay - this.cy) > 100) {          // :45629-45632
          this.gA0 = 3;
        } else if (Math.abs(ay - this.cy) > 10) {
          this.vy += 0.06 * Math.sign(ay - this.cy);
        } else {
          this.vy *= 0.8;
        }
      }
      // 坐姿帧（:45642-45648）：9t 一翻,0..projFrames[623]-4（=19-4,0..14）
      if (++this.gFc >= 9) { this.gFc = 0; if (++this.gFrame >= 15) this.gFrame = 0; }
      // :45707 门——漂移转 3 落入本拍状态 3 续跑（原版落穿语义）；否则基础位移后返回
      if (this.gA0 !== 3) { this.x += this.vx; this.y += this.vy; return; }
    }
    // ---- 状态 0：贴身跟随 + 索敌（:45524-45560 if 链无 else 支——状态 0 不可达 3,跑完即返） ----
    if (this.gA0 === 0) {
      this.x += (restX - this.cx) * 0.05; // :42022 Lerp(Center, vector, 0.05)
      this.y += (restY - this.cy) * 0.05;
      this.vx *= 0.5; this.vy *= 0.5;     // :42023
      this.facing = p.facing;             // :42024
      if (++this.gFc >= 9) { this.gFc = 0; if (++this.gFrame >= 8) this.gFrame = 0; } // :42025-42032
      let tgt: EnemyLike | null = null;
      if (Math.abs(this.cx - restX) <= 170) tgt = this.nearestEnemy(game, 500); // :42036-42043（num+20 门 / num2=500）
      if (tgt) {
        const dirX = tgt.cx > this.cx ? 1 : -1; // :42047
        this.facing = dirX;
        const num6 = Math.abs(restX - this.cx);
        const num7 = Math.abs(tgt.cx - this.cx);
        const num8 = Math.abs(restY - this.cy);
        const num9 = Math.abs(tgt.cy - (this.y + this.h)); // npc.Y - Bottom
        const dirY = tgt.cy > this.y + this.h ? 1 : -1;
        // X leash（:42053-42056）：锚内或反向 且 20<|Δx|<150-锚偏+100 → 步进 0.1，否则衰减
        if ((num6 < 150 || (restX - this.cx) * dirX < 0) && num7 > 20 && num7 < 150 - num6 + 100) {
          this.vx += 0.1 * dirX;
        } else this.vx *= 0.7;
        // Y leash（:42061-42064，num4=100）
        if ((num8 < 100 || (restY - (this.y + this.h)) * dirY < 0) && num9 > 10 && num9 < 100 - num8 + 10) {
          this.vy += 0.1 * dirY;
        } else this.vy *= 0.7;
        if (num7 < 500) { this.gA0 = 2; this.gA1 = tgt.id; } // :42069-42073（num3=500 → 冲刺）
      }
      this.x += this.vx; this.y += this.vy; // 标准位移（velocity 持续衰减）
      return;   // 状态 0 不可达 3（原版无 else 支）
    }
    if (this.gA0 !== 3) return;   // 未知态：原版 if 链尾通配支为空（:45698-45701）,仅 3 落穿
    // ---- 状态 3：rest 点飞行段（:45707-45755）——隐身+尘爆,直插 MinionRestTargetPoint ----
    let tx3: number, ty3: number;
    if (p.hasMinionRestTarget) {                   // :45709-45711
      tx3 = p.minionRestTargetX;
      ty3 = p.minionRestTargetY;
    } else {
      this.gA0 = 0;                                // :45712-45715
      this.x += this.vx; this.y += this.vy;
      return;
    }
    if (this.gAlpha === 0) {                       // :45717-45734 入场：隐身 + 30 粒尘爆
      this.gAlpha = 255;
      this.guardianDustBurst(game, false);
    } else {
      this.guardianDustBurst(game, true);          // :45736-45746 2 粒/拍尾迹（noLight 变体）
    }
    this.vx *= 0.7; this.vy *= 0.7;                // :45747
    this.x += (tx3 - this.cx) * 0.2;               // :45748 Lerp(Center, vector, 0.2)
    this.y += (ty3 - this.cy) * 0.2;
    if (Math.hypot(tx3 - this.cx, ty3 - this.cy) < 10) this.gA0 = 1;   // :45749-45752 抵达转驻守
    this.x += this.vx; this.y += this.vy;          // 基础位移（position += velocity）
  }

  /** AI_120 守护者尘爆/尾迹（:45483-45499 30 粒 / :45719-45746 同体+noLight 变体）：
   *  135 尘双联——α200 scale1.7 初速 ×3 + α100 scale1 初速 ×2 fadeIn2.5（均 noGravity）；
   *  noLight 仅尾迹变体逐粒置位；cPet 次级着色器未建模（登记,与 top-of-AI 爆同缺） */
  private guardianDustBurst(game: GameHooks, trail: boolean): void {
    const n = trail ? 2 : 30;
    for (let i = 0; i < n; i++) {
      const d1 = game.spawnDust?.(this.x, this.y, this.w, this.h, 135, 0, 0, 200, null, 1.7, true);
      if (d1) { d1.vx *= 3; d1.vy *= 3; if (trail) d1.noLight = true; }
      const d2 = game.spawnDust?.(this.x, this.y, this.w, this.h, 135, 0, 0, 100, null, 1, true);
      if (d2) { d2.vx *= 2; d2.vy *= 2; d2.fadeIn = 2.5; if (trail) d2.noLight = true; }
    }
  }

  /** 同型 idStatic 免疫桶（immunityIdentity=type,perIDStaticNPCImmunity 全局数组：
   *  Projectile.cs:13823/:14037 写 / :627 读）——同型多实例共享按敌计时 */
  private idStaticBucket(projId: number): MinionHitCd {
    let b = IDSTATIC_BUCKETS.get(projId);
    if (!b) { b = new MinionHitCd(); IDSTATIC_BUCKETS.set(projId, b); }
    return b;
  }

  /** 敌方玩家键免疫窗余值（NPC.immune[owner] 等价——单 player 世界即 NPC 单窗；
   *  测试桩敌无该字段 → 恒视作 0 可打）。台账批③全局窗支的先验门 */
  private static enemyImmune(en: unknown): boolean {
    const iv = (en as { iframes?: number } | null)?.iframes;
    return typeof iv === 'number' && iv > 0;
  }

  /** SpawnHitVisuals 编排面（Projectile.cs:14466-14501，Damage 对每个实际受伤目标各调
   *  一次——:13633 NPC 支在免疫门之后)。type1093/1112 → CattivaHit 六芒簇
   *  （BroadcastOrRequest clientOnly:false = 本地直生 + module8 上行；δB B11 接线,
   *  2026-08-31——旧档"消费派发在位/接线在位"系声称失实,生产端从未接）：
   *   PositionInWorld = Center + (direction·8, 0) + Circular(4,4)；
   *   MovementVector = CircularEdge(4,4)（Utils.cs:1306 单位圆 × 半径,落在椭圆边上）。
   *  载荷只采样一次——本地 fx 与广播共用同参（原版 settings 对象同构）。
   *  ★镐力面 :52193（AI_067_FreakingPirates_HitIntention,ai[0]=3 帮工意图）本仓未折算
   * （IntentionGuesser 智能光标系统未建模,"勿造系统"登记）；抚摸 Joy 音槽（palJoyTick/
   *  心形气泡窗）与 CattivaHit 无关,勿在此误植。 */
  private emitSpawnHitVisuals(game: GameHooks): void {
    if (this.projId !== 1093 && this.projId !== 1112) return;
    const px = this.cx + this.facing * 8 + (Math.random() * 2 - 1) * 4;   // +Circular(4,4)
    const py = this.cy + (Math.random() * 2 - 1) * 4;
    const ea = Math.random() * Math.PI * 2;                              // NextVector2Unit
    const mvX = Math.cos(ea) * 4, mvY = Math.sin(ea) * 4;                // CircularEdge(4,4)
    cattivaHitFx(game, px, py, mvX, mvY);
    game.broadcastParticleOrchestra?.(ParticleOrchestraType.CattivaHit, px, py, mvX, mvY);
  }

  /** 接触伤害通用（pad=判定盒外扩）；鞭 tag + TagCrit + proc 统一走 resolveWhipTagHit
   *  （TagEffectState.ModifyHit :216-228 / OnHit :230-243，含黑收成 OnTaggedHit 与
   *  火鞭/星陨/花瓣/月主弹 proc 首跳）。返回是否命中过（乌鸦命中重置扑击计时）。
   *  ★台账批③：cd 支持 ContactCd 三态——number=局部私表 t；CONTACT_PLAYER_WINDOW(-2)
   *  =原版缺省族【吃玩家全局免工件窗】（免工件门 + Enemy.hurt(pierce=0) 命中后置
   *  10t——废统一 20t 私表）；{kind:'idStatic'}=同型共享桶 */
  private contact(game: GameHooks, dmg: number, cdIn?: ContactCd, pad = 0): boolean {
    const add = (e: unknown, b: string) =>
      (game as unknown as { entities: { add: (x: unknown, y: string) => void } }).entities.add(e, b);
    // ★F4 召唤/哨兵弹伤害时刻的小动物恒拒门（projectile 语境入统一出口）：
    // flag=true ⇒ 普通小动物免伤（饰品无关），唯一放行 = 黑化复权体（F2 运行时位）。
    // 命中返回值并入 anyHit（原版单数组遍历的仓内双桶拆分等价形）
    let anyHit = false;
    // ★F4 召唤/哨兵弹伤害时刻的小动物恒拒门（projectile 语境入统一出口）：
    // flag=true ⇒ 普通小动物免伤（饰品无关），唯一放行 = 黑化复权体（F2 运行时位）。
    // 命中返回值并入 anyHit（原版单数组遍历的仓内双桶拆分等价形）
    if ((game as unknown as { critters?: () => unknown[] }).critters?.().length) {
      const hitbox = pad
        ? { x: this.x - pad, y: this.y - pad, w: this.w + pad * 2, h: this.h + pad * 2 }
        : { x: this.x, y: this.y, w: this.w, h: this.h };
      // 小动物亦属原版 Main.npc 全表 → Damage 每中兽同样走 SpawnHitVisuals（此处整桶
      // 合一近似——多兽同帧合并为一发;Enemy 桶为逐靶直译）
      const critterHit = hitCritters(hitbox, game, { minion: true, sentry: this.sentry });
      if (critterHit) {
        this.emitSpawnHitVisuals(game);
        anyHit = true;
      }
    }
    for (const e of game.enemies()) {
      if (!playerCanHitEnemy(e, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const en = e as never as EnemyLike & import('./WhipTag').WhipTagged & {
        hurtFx?: (d: number) => void;
      };
      if (en.dead) continue;
      if (!(this.x - pad < en.x + en.w && this.x + this.w + pad > en.x
        && this.y - pad < en.y + en.h && this.y + this.h + pad > en.y)) continue;
      // ★台账批③ 接触冷却三态门（原版 Damage_PVE flag2 :12595 + Damage_PVE_Inner
      //  immune[owner] 门 :12636 / localNPCHitCooldown 尾支 :14175-14186）
      {
        const spec = cdIn === undefined ? contactResolve(this.projId) : cdIn;
        if (spec === CONTACT_PLAYER_WINDOW) {
          if (MinionProj.enemyImmune(en)) continue;   // -2 缺省族：玩家全局窗内不重击
        } else if (typeof spec === 'object') {
          if (!this.idStaticBucket(this.projId).ready(en.id, spec.cd)) continue;
        } else if (!this.hitCd.ready(en.id, spec)) continue;
      }
      // 黑收成 OnTaggedHit 直伤通道（916 等价）
      en.hurtFx = (d: number) => { en.hurt(applyBannerDamageDealt(game, en, d), Math.sign(en.cx - this.cx), -1, game, 0, false, 0, true); };   // 鞭 tag 直伤=DPS 计
      const res = resolveWhipTagHit(en, dmg, game,
        (el) => add(el, 'projectiles'), SUMMON_TAG_MUL[this.projId] ?? 1, en.cx, en.cy,
        this.ownerRef());
      // 圣殿骑士背包 6176（accGolemSentryBackpack :12963-12967）：sentry/SentryShot
      // 命中 10% 强制暴击（×2,与 TagCrit 暴击同通道）
      let golemCrit = rollGolemSentryCrit(game, this.projId, this.sentry);   // 6176（:12962-12965 1:1,共享掷）
      // 击退 = 武器 kb×0.5（本作接触系数）+ minionKB 加算（GetWeaponKnockback :52477-52482：
      // 大力士甲虫/纸莎草 +2——首版聚合了 equipStats.minionKB 但漏消费，终审补接；
      // buff 段 = 醉酒 +1 :11520 / 饥饿 -0.5 / 极饿 -1 :11570/:11594，2026-08-20 饥饿链补）
      const owner0 = this.ownerRef();
      const o0 = owner0 as unknown as { equipStats?: { minionKB?: number }; buffs?: { minionKbBonus?: number } } | null;
      const mkb = (o0?.equipStats?.minionKB ?? 0) + (o0?.buffs?.minionKbBonus ?? 0);
      const pen0 = ((owner0 as unknown as { equipStats?: { armorPen?: number } } | null)?.equipStats?.armorPen ?? 0)
        + (projectileData(this.projId)?.armorPenetration ?? 0); // StrikeNPC :12068:玩家AP+弹幕AP 两源
      // 击退方向（StrikeNPC 第 3 参 num40,Projectile.cs:13648-13677）：缺省=随从→敌
      // sign;★方向表族（:13652-13660 switch 697/699/707/708/759 + ★1458 新增 1118
      // Clay Bud"always knocks enemies away from the player"）= 玩家→敌 sign
      // （owner.Center.X < target.Center.X ? 1 : -1,相等取 -1）。本仓 1457 曾全族
      // 随从锚（登记项）,借 1458 批补齐 switch 族;aiStyle 15/188-191 同段族登记
      const kbDir = MINION_PLAYER_ANCHOR_KB.has(this.projId) && owner0
        ? (owner0.cx < en.cx ? 1 : -1)
        : Math.sign(en.cx - this.cx);
      en.hurt(applyBannerDamageDealt(game, en, golemCrit ? res.dmg * 2 : res.dmg),
        kbDir * (this.knockback + mkb), 0, game, pen0, false, 0, true); // 裸kb+minionKB(:52477);fromPlayer=DPS 计
      applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
      this.emitSpawnHitVisuals(game);           // SpawnHitVisuals :13633（免疫门后每靶一发,B11）
      this.attackFlash = 24;
      anyHit = true;
    }
    return anyHit;
  }

  /** 同类计数（计数器/本体伤害档位用：831 宝石数 / 970 阿比盖尔数） */
  private peerCount(game: GameHooks, id: number): number {
    let n = 0;
    for (const e of (game as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles) {
      const m = e as MinionProj;
      if (m instanceof MinionProj && !m.dead && m.projId === id) n++;
    }
    return n;
  }

  /** 生成不占槽实体（计数器派生本体/守护者）。
   *  1457 UpdateAbigailStatus/UpdateStormTigerStatus（Player.cs:12380/:12421）：
   *  本体重生弹 knockBack 由 0f → 继承 projectile2.knockBack（计数器 kb）——
   *  本仓 spawnBody 恒传 this.knockback（计数器出生即持法杖 kb,Game 'summon'
   *  分支 spawnMinion 传 cw.knockback）→ 1457 语义已天然满足 */
  private spawnBody(game: GameHooks, projId: number, damage: number): MinionProj {
    const owner = this.ownerRef();
    const m = new MinionProj(this.cx, this.cy, projId, damage, this.knockback,
      false, 0, false, () => owner);
    m.noSlot = true;
    (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(m, 'projectiles');
    return m;
  }

  constructor(
    x: number, y: number, projId: number, damage: number, knockback: number,
    sentry: boolean, slot: number, ground: boolean,
    owner: () => Player | null,
  ) {
    super();
    this.x = x; this.y = y;
    this.projId = projId;
    this.damage = damage;
    this.knockback = knockback;
    this.sentry = sentry;
    this.slot = slot;
    this.ground = ground;
    this.life = sentry ? 60 * 600 : Infinity; // 哨兵 10 分钟（哨兵类默认时限近似）
    this.ownerRef = owner;
    // 帕鲁出场淡入（SetDefaults alpha=255：1093 :10211/1112 :10377/1113 :10400/
    // 1118 :10485/1098 :10241/1123 :10506-10513）
    this.alphaFade = projId === 1093 || projId === 1112 || projId === 1113 || projId === 1118
      || projId === 1098 || projId === 1123 ? 255 : 0;
    // 命中盒真值（SetDefaults width/height——MinionProj 缺省 16×16；与
    // vanilla-projectiles.json 对齐，绘制侧 1:1 贴图锚盒左上、与盒尺寸解耦）：
    //  钻地龟 1098/1123 34×34（:10245-10246/:10507-10508）
    //  帕鲁地面随从 1093/1112/1118 14×22（:10199-10200/:10365-10366/:10453-10454）
    //  禁戒魂灵 1119 14×22（:10467-10468）/ 火绒狐 1113 18×18（:10381-10382）
    if (projId === 1098 || projId === 1123) { this.w = 34; this.h = 34; }
    else if (projId === 1093 || projId === 1112 || projId === 1118 || projId === 1119) { this.w = 14; this.h = 22; }
    // 火绒狐 1094/1113 双型 18×18（1094 SetDefaults Projectile.cs:10215-10216——
    // ★2026-09-06 杂项簇批补：旧表只注册了 1113（:10382-10383）,1094 漏注册落
    // 16×16 缺省=判定盒/湿段采样盒窄 2px）
    else if (projId === 1094 || projId === 1113) { this.w = 18; this.h = 18; }
    // 蘑菇小伙伴 1022（Dead Cells 联动,5456）：20×30（SetDefaults Projectile.cs:9670-9671）
    else if (projId === 1022) { this.w = 20; this.h = 30; }
    // ★SW-BJ13 2026-09-07：34788 专绘支家族 SetDefaults 真盒补注册（此前落 16×16
    //  缺省 ⇒ 判定盒/盒心锚与精灵错位——本支 draw 锚=盒心系,盒错即绘错）：
    //  海盗三变体 393-395 20×30（:4758-4759）/ 异星 UFO 423 28×28（:4964-4965）/
    //  雾网蜘蛛 1036 18×10（:9770-9771）
    else if (projId === 393 || projId === 394 || projId === 395) { this.w = 20; this.h = 30; }
    else if (projId === 423) { this.w = 28; this.h = 28; }
    else if (projId === 1036) { this.w = 18; this.h = 10; }
    // ★SW-BJ17 2026-09-07：仆从构造器 13 id 真盒收尾批（前批移交件;与 minionTrueBox
    //  单源同步,判据同 BJ13/BJ16）。移交清单中 393-395/758/1036 已由 BJ13/BJ16 注册
    //  （对反编译终值核对一致）,本批补余下 8 id——此前全落 16×16 缺省 ⇒ 判定盒/湿段
    //  采样盒窄:乌鸦 317 28×28（:4104-4105）/ 蜘蛛三型 390-392 30×30（:4746-4747）/
    //  沙漠虎一档 833 26×20（:8086-8087）/ 二三档 834-835 20×30（:8100-8101/:8114-8115）/
    //  酷鞭雪花哨兵 917 30×30（:8705-8706）。各块无 scale 行 → 字面=SetDefaults 终值
    //  （尾 width×scale :10674-10675 恒等）。
    //  ★出生位半盒偏差备案（调用侧域外,本批不落刀）：通用 spawnMinion（Game.ts:15688）
    //  把钳制后 MouseWorld、WhipProj.spawnSidekick 把敌怪 Center 直传盒左上,而原版
    //  NewProjectile :10878 X−w×0.5=中心语义 → 真盒中心的右下偏 = 半盒（16×16 时代
    //  8px 恒偏,本批后 317=14px、390-392=15px、833=(13,10)px、834-835=(10,15)px、
    //  917=15px——偏移随盒扩容增大,随从 AI 入场即自纠,瞬态视觉;先例=钻地龟调用点
    //  中心换算已修,spawnDigtoiseOnCursor。修复属 Game.ts/WhipProj.ts 调用侧）
    else if (projId === 317) { this.w = 28; this.h = 28; }
    else if (projId === 390 || projId === 391 || projId === 392) { this.w = 30; this.h = 30; }
    else if (projId === 833) { this.w = 26; this.h = 20; }
    else if (projId === 834 || projId === 835) { this.w = 20; this.h = 30; }
    else if (projId === 917) { this.w = 30; this.h = 30; }
    // ★SW-BJ16 2026-09-07：33693 中心锚支家族 SetDefaults 真盒补注册（同 BJ13 判据：
    //  本支 draw 锚=盒心系,盒错即绘错；此前除 643/1098/1123/1119 外全落 16×16 缺省）：
    //  星尘细胞 613 24×24（:6600-6611）/ 星尘守护者 623 50×80（:6713-6714）/
    //  龙链四段 625-628 24×24（:6743-6744）/ 彩虹水晶 643 已注册 32×32（:6932-6933）/
    //  吸血蛙 758 20×30（:7817-7818）/ 雀杖 759 10×10（:7839-7840）/ 虎宝石 831 10×10
    //  （:8073-8074）/ 雪怪 951 26×26（:8972-8973）/ 阿比盖尔体 963 30×48（:9106-9107）/
    //  阿比盖尔计数器 970 10×10（:9188-9189）
    else if (projId === 613) { this.w = 24; this.h = 24; }
    else if (projId === 623) { this.w = 50; this.h = 80; }
    else if (projId === 625 || projId === 626 || projId === 627 || projId === 628) { this.w = 24; this.h = 24; }
    else if (projId === 758) { this.w = 20; this.h = 30; }
    else if (projId === 759 || projId === 831 || projId === 970) { this.w = 10; this.h = 10; }
    else if (projId === 951) { this.w = 26; this.h = 26; }
    else if (projId === 963) { this.w = 30; this.h = 48; }
    // ★GC 移交收口（终局扫尾批 A7，2026-08-31）：DD2 哨兵塔 SetDefaults 真盒注册——
    //   此前 663 族/弩车族落 16×16 兜底 ⇒ 判定盒/索敌锚与贴图错位。
    //   · 爆炸烈焰塔（AI_130）SetDefaults(:7132-7157)：663=30×54 → 665=28×58 →
    //     667=28×60（逐型覆写 switch 在主块内,终值以此为准）
    //   · 弩车三档（AI_134,:7243-7255）：677/678/679 恒 26×54
    //   锚仍成立性核对：F6 弩车瞄准基准 spotY134 = center.Y−(677?4:0)、火焰塔炮口
    //   Bottom+(dir*6,-Δ)=y+h−tier.dy——两者皆盒相对式,真盒扩容后语义不变；
    //   首帧放位由落地扫描 y 定格（moveAndCollide 收敛到地面),盒高变化不漂移锚点。
    else if (projId === 663) { this.w = 30; this.h = 54; }      // :7133-7134 主块
    else if (projId === 665) { this.w = 28; this.h = 58; }      // :7141-7144 覆写
    else if (projId === 667) { this.w = 28; this.h = 60; }      // :7145-7148 覆写
    else if (projId === 677 || projId === 678 || projId === 679) { this.w = 26; this.h = 54; }  // :7244-7245
    // ★三轮蓝队 F5③：法杖系哨兵 SetDefaults 真盒补注册（物品 1572/2366/3571/3569/
    //   5119/5463 → shoot 308/377/643/641/966/1025,vanilla-itemfunc.json）——此前落
    //   16×16 兜底 ⇒ 判定盒/索敌锚（AI_053 炮口 :27289-27305 为盒相对式）与贴图错位。
    //   真盒扩容前后视觉差说明：
    //   · 308 冰九头蛇 16→80×74（:4001-4002）：命中判定从芯点扩到塔身全影,
    //     索敌锥区随盒心右移；旧绘制因整图兜底锚无视觉漂移（贴图本按帧切片居中）
    //   · 377 蜘蛛皇后 16→66×50（:4619-4620）：贴图设计恰 66×50 ⇒ 绘制零变化、
    //     纯判定面扩容（打它更实了）
    //   · 641 月门 / 643 彩虹水晶 16→32×32（:6919-6920/:6932-6933）：传送门弹拾取/
    //     水面等盒判加宽;悬浮位不受影响（FLOATING_SENTRIES 免落地扫描）
    //   · 966 猎犬底座 16→18×60（:9146-9147）：盒高 60 贴合石桩立柱,炮口扇区
    //     （Bottom 锚带）对位上移 22px;弹落点可见更准
    //   · 1025 悬空毒眼球 16→42×38（:9710-9711）：悬浮盒≈贴图 46×62 帧体,
    //     命中判定追平眼柄轮廓
    else if (projId === 308) { this.w = 80; this.h = 74; }
    else if (projId === 377) { this.w = 66; this.h = 50; }
    else if (projId === 641 || projId === 643) { this.w = 32; this.h = 32; }
    else if (projId === 966) { this.w = 18; this.h = 60; }
    else if (projId === 1025) { this.w = 42; this.h = 38; }
  }

  /** 归属玩家（ownerRef 公开读——Game 抚摸白名单按 owner 过滤） */
  get ownerPlayer(): Player | null { return this.ownerRef(); }

  /** AI_Sentries_HeavySlingReposition（1457 Projectile.cs:70096-70470）1:1——被哨兵
   *  背包四件（accSentryBackpack 6172 重携/6175 侦察/6176 圣殿骑士/6177 皇家卫队,
   *  ApplyEquipFunctional :14612-14614/:14670-14677/:14678-14681/:14682-14685 全置旗）
   *  携带中的哨兵每拍重定位。分支序照原文：
   *    !accSentryBackpack → Kill（:70098-70102）→ 早退三支（aiStyle 123∪84
   *    :70108-70126 / aiStyle 137 :70127-70137 / type 966 :70138-70150）→ 通用路
   *    （scale=1 :70152 + vector=Size/2 :70157 + per-type 308/377 :70160-70182 +
   *    flag3=1025 :70184-70206 + flag4=aiStyle134 :70207-70213 + aiStyle130
   *    :70214-70227 + flag5=aiStyle138 :70228-70250）→ 坐骑 switch default 支
   *    :70255-70265 → 尾 floor（:70468）。
   *  坐骑支差异备案（系统未建,非近似）：flag = IsTransformationMount{52,54,55,56,61}
   *  （MountID.cs:23 Wolf/Velociraptor/Rat/Bat/Pixie）——vanilla-mounts.json 无此五骑
   *  数据 → 恒 false,flag 各加成支保留门条件照抄但不可达;mount.Type switch 特例
   *  （55 Rat/61 Pixie/56 Bat/54 Velociraptor/52 Wolf :70255-70463）与 mount 43
   *  pushFromOriginHack（:70252-70254）同因不可达,恒走 default 支。
   *  flag2 = mount.AnyTrackRider（Mount.cs:558-573 Minecart∪CanRideMinecartTracks）
   *  → 本仓等价位 = ridingCart（矿车轨道骑乘,Minecart.ts 接管）。
   *  OffsetsPlayerHeadgear（Main.cs:530-551）行 = bodyFrame.Y/Height——帧行状态机在
   *  渲染侧（Renderer.playerFrameRows）,实体侧无此状态;按行 0 落位（vector3.Y=
   *  2−2=0）,行∈{7,8,9,14,15,16}（跳/落帧）才产生 −2px 差,备案。
   *  RotatedRelativePoint 经 Player.rotatedRelativePoint（Player.cs:4209-4237 1:1,
   *  fullRotation 恒 0 → 恒等+gfxOffY;sleeping/sitting 偏移支见该处备案）。
   *  scale/pushFromOriginHack（:70152-70156/:70252-70254）:scale 本仓绘制端未建模
   *  （1025 缩体支 owner.h<DefaultSize.Y=42 不可达——折叠凳态 h=68 反而更大）;
   *  pushFromOriginHack 仅 fullRotation≠0 消费,未建模恒 0。 */
  private heavySlingReposition(owner: Player): void {
    if (!owner.equipStats.accSentryBackpack) { this.dead = true; return; }   // :70098-70102
    const flag = false;                                    // IsTransformationMount（:70104）——变身坐骑未建
    const flag2 = owner.ridingCart === true;               // AnyTrackRider（:70105）
    const num = Math.min(21, owner.h / 2);                 // :70106（h≥42 → 恒 21）
    const grav = owner.gravDir;
    const mc = owner.mountedCenter;
    const gfx = owner.gfxOffY;
    const pdir = owner.facing < 0 ? -1 : 1;                // player.direction
    const floorPos = (): void => { this.x = Math.floor(this.x); this.y = Math.floor(this.y); };
    // ---- 早退支①：aiStyle 123（641 月门/643 彩虹水晶）∪ 84（642 激光随 641 携带,
    //      Projectile.cs:31963-31970 调本函数;642 激光随行建模缺,见 SENTRY_SHOOT 注）----
    if (this.projId === 641 || this.projId === 643) {
      // :70110-70112 Center = MountedCenter + (0, gravDir * -(num + 20 + height/2))
      this.x = mc.x - this.w / 2;
      this.y = mc.y + grav * -(num + 20 + Math.trunc(this.h / 2)) - this.h / 2;
      this.y += gfx;                                       // :70113 position.Y += gfxOffY
      // aiStyle==84 支 position.Y += -6*gravDir（:70115-70117）——642 不在本仓哨兵集合
      if (flag2) {                                         // :70119-70122 Bottom = RotatedRelativePoint(Bottom)
        const b = owner.rotatedRelativePoint(this.cx, this.y + this.h);
        this.x = b.x - this.w / 2; this.y = b.y - this.h;
      }
      floorPos();                                          // :70124
      return;
    }
    // ---- 早退支②：aiStyle 137（688/689/690 闪电光环）(:70127-70137) ----
    if (AURA_TOWER.has(this.projId)) {
      this.x = mc.x - this.w / 2; this.y = mc.y - this.h / 2;   // :70129 Center = MountedCenter
      this.y += gfx;                                       // :70130
      if (flag2) {                                         // :70132-70135 Center = RotatedRelativePoint(Center)
        const c = owner.rotatedRelativePoint(this.cx, this.cy);
        this.x = c.x - this.w / 2; this.y = c.y - this.h / 2;
      }
      floorPos();
      return;
    }
    // ---- 早退支③：type 966 猎犬（:70138-70150）----
    if (this.projId === 966) {
      this.x = mc.x - this.w / 2;
      this.y = mc.y + grav * -num - this.h / 2;            // :70140-70142
      if (grav === -1) this.y += 32;                       // :70143-70145
      this.y += gfx;                                       // :70146
      if (flag2) {
        const b = owner.rotatedRelativePoint(this.cx, this.y + this.h);
        this.x = b.x - this.w / 2; this.y = b.y - this.h;
      }
      floorPos();
      return;
    }
    // ---- 通用路：vector2 起零、vector = Size/2（:70157-70158）----
    let vec2X = 0, vec2Y = 0;
    let vecX = this.w / 2, vecY = this.h / 2;
    if (this.projId === 308 || this.projId === 377) {      // :70160-70182 per-type
      if (this.projId === 308) {
        if (this.facing === 1) vec2X = -14;                // :70163-70166 spriteDirection==1
        vec2X += 10 * this.facing;                         // :70167
        if (!flag) vec2Y += -20;                           // :70168-70170
      } else {
        vec2X += this.facing;                              // :70173-70174
        if (!flag) vec2Y += -20;
        if (grav === -1) vec2Y += 10;                      // :70177-70179
      }
      vecX = this.w / 2; vecY = Math.fround(this.h * 0.9); // :70171/:70180（0.9f f32 敏感）
    }
    if (this.projId === 1025) {                            // flag3（:70184-70206）
      vec2X += pdir * -25; vec2Y += grav * 4;              // :70186
      this.rot = pdir === 1 ? Math.PI / 2 : -Math.PI / 2;  // :70187
      if (pdir === -1) vec2X += pdir * 4;                  // :70188-70190（=−4）
      if (grav === -1) vec2Y += 4;                         // :70191-70193
      if (flag) { this.rot = Math.PI; vec2X += pdir * 17; } // :70194-70197（变身坐骑,不可达照抄）
      if (owner.h < 42) {                                  // :70198-70204 height < DefaultSize.Y（不可达）
        this.rot = Math.PI;
        vec2Y += 5;                                        //   scale=0.5 与 fullRotation 相位项未建模（见方法头）
      }
      // :70205 rotation += player.fullRotation——恒 0
    }
    if (BALLISTA_TOWER.has(this.projId)) {                 // flag4 = aiStyle 134（:70207-70213）
      vec2X = 0; vec2Y = grav * -14;                       // :70209（赋值覆写）
      if (flag) vec2Y += 24;                               // :70211-70212
    }
    if (FLAMEBURST_TOWER.has(this.projId)) {               // aiStyle 130（:70214-70227）
      vec2X = pdir * 10; vec2Y = grav * -11;               // :70215（赋值覆写）
      if (this.facing !== pdir) vec2X += this.facing * -2; // :70216-70219 direction != player.direction
      vecX = this.w / 2; vecY = this.h;                    // :70220
      if (flag) { vec2X += pdir * -14; vec2Y += 25; }      // :70222-70225
    }
    if (TRAP_TOWER.has(this.projId)) {                     // flag5 = aiStyle 138（:70228-70250）
      if (!flag) {
        vec2X = pdir * -9; vec2Y = 0;                      // :70231（赋值覆写）
        if (pdir === -1) vec2Y += 2;                       // :70232-70234
        if (grav === -1) vec2Y -= 2;                       // :70235-70237
      }
      this.rot = pdir === 1 ? Math.fround(4.712389) : Math.PI / 2;   // :70238-70240
      if (flag) { vec2Y += 5; this.rot = 0; }              // :70241-70244
    }
    // ---- default 坐骑支（:70255-70265）：Center = MountedCenter + vector2 ----
    this.x = mc.x + vec2X - this.w / 2;
    this.y = mc.y + vec2Y - this.h / 2;
    // :70261-70263 vector3 = OffsetsPlayerHeadgear[row] + (0,-2),position +=
    // vector3*(0,gravDir)——行 0 基准 = (2−2)*grav = 0（帧行备案见方法头）
    // :70264 position = RotatedRelativePoint(position + vector, addGfxOffY) - vector
    //（恒等旋 → position + (0, gfxOffY)）;:70266-70268 if(flag) Y += gfxOffY 不可达
    const rp = owner.rotatedRelativePoint(this.x + vecX, this.y + vecY);
    this.x = rp.x - vecX; this.y = rp.y - vecY;
    floorPos();                                            // :70468
  }

  /** 按 id 取敌（AI_120 ai[1] 目标槽 :42198-42207 等价） */
  private enemyById(game: GameHooks, id: number): EnemyLike | null {
    if (id < 0) return null;
    for (const e of game.enemies()) {
      const en = e as EnemyLike;
      if (!en.dead && en.id === id) return en;
    }
    return null;
  }

  /** 最近敌人（无目标 null）。鞭 tag 优先（原版随从锁定被鞭标记目标：
   *  Projectile.ApplyTag → npc.whipSet/whipTime，随从 TargetSlot 优先取 tag 敌）。
   *  sight：AI_062 族视线门（1457 :66392/:66435 CanHitLine 盒线 / :66413/:66435 963 走
   *  Collision.CanHit 中心 1×1）——'none' 缺省无门（其余 AI 族各自语义）。
   *  from：距离门测点——'self'=随从中心（缺省）；'player'=玩家中心（AI_062 的
   *  407/613/423 分支 :66363/:66391/:66374 以 Main.player[owner].Center 计距,
   *  1456 :62416/:62433 同段;集火门 :66374 同测点。登记:门距测敌心,423 原版测
   *  顶心 vector2=(0.5,0)（:66365-66368）——差 ≤敌半高,不另开通道）。
   *  anchor（★F4 新增,2026-08-30）：显式覆盖距离测点与 'line' 视线起点——
   *  AI_130 炮塔的 shootingSpot=Bottom+(direction*6,-Δ)（FindTarget :69418 端点
   *  :69426-69456），本体盒中心口径错挂已翻修；缺省行为零变化。
   *  gate（★F6 新增,2026-08-31 批①②）：AI_130/AI_134 FindTarget 的
   *  angleRatioMax/deadBottomAngle/directionLock 三门族——原版候选判定与距离/视线
   *  同条 && 链（:69434-69436/:69481-69483），集火路(:27431 OwnerMinionAttackTargetNPC
   *  模板的第一桶)与全局扫同吃同一谓词且【过门即整段 return】(焦点短路,:69445)。
   *  缺省 undefined → 零变化 */
  private nearestEnemy(game: GameHooks, maxRange: number,
    sight: 'none' | 'line' | 'point' = 'none', from: 'self' | 'player' = 'self',
    focusRange = 900, anchor?: { x: number; y: number }, gate?: TowerAimGate): EnemyLike | null {
    const p = this.ownerRef();
    if (!p) return null;
    const bx = anchor?.x ?? (from === 'player' ? p.cx : this.cx);
    const by = anchor?.y ?? (from === 'player' ? p.cy : this.cy);
    // 门向量基点 = 距离测点同心（FindTarget 的 vector 自 shootingSpot 出发）
    let best: EnemyLike | null = null;
    let bestD = maxRange;
    let tagged: EnemyLike | null = null;
    let taggedD = maxRange;
    // 鞭 tag 查询走玩家栈（1457 TagEffectStack——敌实体不再存 tag 态）
    const stack = p.tagEffectStack;
    // 'line' 形状分流（★F4 定案 2026-08-31 二轮蓝队）：锚定模式 = FindTarget 字面点对端
    //  ——CanHitLine(shootingSpot,0,0 → nPC.Center,0,0)（AI_130 :69434/:69456、AI_134
    //  :69481/:69503）；非锚定 AI_062 族 = 盒线——CanHitLine(position,width,height →
    //  npc.position,width,height)（:66392）。Center 用浮点半宽、盒左上提取走 int÷ 半宽
    //  （canHitLineStartTile），奇数尺寸盒在半格交界处端格可差一格 ⇒ 两形不可互换。
    const lx = anchor?.x ?? this.x, ly = anchor?.y ?? this.y;
    const lw = anchor ? 0 : this.w, lh = anchor ? 0 : this.h;
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean };
      if (!canBeChasedBy(e)) continue;   // CanBeChasedBy :91070/:91141——友好+immortal 族不入索敌（防追踪睡渔夫/假人）
      if (!en || en.dead) continue;
      const d = Math.hypot(en.cx - bx, en.cy - by);
      // ★F6 方向/角度门：SafeNormalize(shootingSpot→敌心,UnitY)，零距走兜底 (0,1)
      const dl = d > 0 ? 1 / d : 0;
      const gnx = d > 0 ? (en.cx - bx) * dl : 0;
      const gny = d > 0 ? (en.cy - by) * dl : 1;
      const gated = towerAimGate(gnx, gny, gate);
      if (gated && d < bestD) {
        // 视线门不过 = 非候选（:66392/:66435 CanHitLine/CanHit 内联于候选判定）
        if (sight === 'line' && !canHitLine(game.world.store, lx, ly, lw, lh,
          anchor ? en.cx : en.x, anchor ? en.cy : en.y, anchor ? 0 : en.w, anchor ? 0 : en.h)) continue;
        if (sight === 'point' && !canHit(game.world.store, this.cx, this.cy, 0, 0, en.cx, en.cy, 0, 0)) continue;
        bestD = d; best = en;
      }
      if (gated && stack.anyTagged(en.id) && d < taggedD) { taggedD = d; tagged = en; }
    }
    // 右键集火优先（OwnerMinionAttackTargetNPC 模板 :27431：有效且距本随从 <900；
    //  AI_062 集火同样过视线门 :66375/:66413,门距 = num12×3——num12 已被 :66327
    //  无条件覆盖 2000（963=700）→ 6000/2100。蓝队 R7-21：曾硬编码 900（引 AI_026
    //  模板值）,远屏集火 >900px 失效回退最近目标,鞭 tag 拉远打时随从脱靶）
    const focus = (p as unknown as { minionTargetId?: number }).minionTargetId ?? -1;
    if (focus >= 0) {
      for (const e of game.enemies()) {
        const en = e as never as EnemyLike;
        // CanBeChasedBy 门（AI_121 集火原文 :43664/:40190 字面;通用层清偿 2026-09-08:
        //  曾缺门=训练假人 488/伪装雕像 690 等 immortal/exclude 族被集火锁定——
        //  未过门 → 集火作废,tag/野生支照走,同原版 num6=−1 回退）
        if (!en.dead && en.id === focus && canBeChasedBy(e)
          && Math.hypot(en.cx - bx, en.cy - by) < focusRange) {
          // ★F6 焦点同吃角度/方向门（FindTarget 内 OwnerMinionAttackTargetNPC 桶
          //  与全局扫共用同一谓词链 :69426-69456——过门才被采纳）
          const df = Math.hypot(en.cx - bx, en.cy - by);
          const dfl = df > 0 ? 1 / df : 0;
          if (!towerAimGate(
            df > 0 ? (en.cx - bx) * dfl : 0,
            df > 0 ? (en.cy - by) * dfl : 1,
            gate,
          )) break;
          if (sight === 'line' && !canHitLine(game.world.store, lx, ly, lw, lh,
            anchor ? en.cx : en.x, anchor ? en.cy : en.y, anchor ? 0 : en.w, anchor ? 0 : en.h)) break;
          if (sight === 'point' && !canHit(game.world.store, this.cx, this.cy, 0, 0, en.cx, en.cy, 0, 0)) break;
          return en;
        }
      }
    }
    return tagged ?? best;
  }

  /** Minion_FindTargetInRange 1:1（1458 Projectile.cs:49884-49921;1457 :50581 同体）。
   *  终清波批：AI_067 族"单距检索近似"退役——双距语义核实（IsInRangeOfMeOrMyOwner
   *  :52406-52424 两版同段）：
   *    myDistance = |敌心−随从心|，<maxDistance 且 !CanHitWithOwnBody(四试) → ∞；
   *    playerDistance = |敌心−主心|，<maxDistance 且 !CanHitWithMeleeWeapon(四试) → ∞；
   *    closerIsMe 择小者 ≤ maxDistance 才算在域。检索循环阈值 num 单调收缩为
   *    min(num2=我侧最小, num3=主侧最小)，门序原文逐条转写：
   *      CanBeChasedBy ∧ 双距在域 ∧ (!skip ∨ CanHitWithOwnBody) ∧
   *      (nPC.boss ∨ viewRect[玩家中心 ±960×600 = CenteredRectangle(Main.MaxWorldViewSize
   *      1920×1200 :758)] 相交) ∧ customEliminationCheck(AI_067 族恒 true 不建模)。
   *  · respectOwnerTarget 焦点支（:49889-49897）→ 本仓 minionTargetId；命中即早退。
   *  ownerHitCheckDistance 默认 1000（Projectile.cs:306）对 startRange≤800 恒不束,
   *  ExtendedCanHitCheckRange 随从型空表（既有登记）。 */
  private findTargetInRangeDual(game: GameHooks, startRange: number): EnemyLike | null {
    const p = this.ownerRef();
    if (!p) return null;
    const st = game.world.store;
    let num = startRange;
    const num2 = { v: startRange };
    const num3 = { v: startRange };
    const dualRange = (e: EnemyLike, maxD: number):
      { ok: boolean; md: number; pd: number } => {
      let md = Math.hypot(e.cx - this.cx, e.cy - this.cy);
      if (md < maxD && !canHitWithOwnBodyBox(st, this.x, this.y, this.w, this.h, this.facing,
        e.x, e.y, e.w, e.h)) md = Infinity;
      let pd = Math.hypot(e.cx - p.cx, e.cy - p.cy);
      if (pd < maxD && !canHitWithMeleeWeaponBox(st, p.x, p.y, p.w, p.h, p.facing,
        e.x, e.y, e.w, e.h)) pd = Infinity;
      const closerIsMe = md < pd;                        // :52418
      return { ok: (closerIsMe ? md : pd) <= maxD, md, pd };   // :52420-52423
    };
    // ---- focus 支（OwnerMinionAttackTargetNPC :49891）----
    const focus = (p as unknown as { minionTargetId?: number }).minionTargetId ?? -1;
    if (focus >= 0) {
      for (const e of game.enemies()) {
        const en = e as never as EnemyLike & { dead: boolean };
        if (!en || en.dead || en.id !== focus) continue;
        if (canBeChasedBy(e)) {
          const r = dualRange(en, num);
          if (r.ok) return en;                           // 命中即整段退回 :49895
        }
        break;                                           // 原版单槽直查非全表扫
      }
    }
    // ---- 全局扫（:49903-49920）----
    let best: EnemyLike | null = null;
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean; boss?: boolean };
      if (!canBeChasedBy(e)) continue;
      if (!en || en.dead) continue;
      const r = dualRange(en, num);
      if (!r.ok) continue;
      const isBoss = en.boss === true
        || ((e as unknown as { def?: { boss?: boolean } }).def?.boss === true);
      // viewRect = Utils.CenteredRectangle(player.Center, MaxWorldViewSize)（:49898）
      const vx0 = p.cx - 960, vy0 = p.cy - 600;
      const inView = en.x + en.w > vx0 && en.x < vx0 + 1920
        && en.y + en.h > vy0 && en.y < vy0 + 1200;
      if (!(isBoss || inView)) continue;
      best = en;                                         // 过门即覆写 :49908
      if (num2.v > r.md) num2.v = r.md;                  // :49910-49917
      if (num3.v > r.pd) num3.v = r.pd;
      num = Math.min(num2.v, num3.v);                    // :49918 收缩阈值
    }
    return best;
  }


  fixedUpdate(dt: number, game: GameHooks) {
    void dt;
    // ---- ★通用湿段（:16895-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒）----
    //  tick 头插位（杀拍覆盖/采样位/域论证见字段块头注）;阻尼=位移处乘档位
    //  （palGroundStep/mushBoiStep/digtoiseStep/ai067WalkChase/spiderStep/frogStep/
    //  ravenBody/whip 族 1036/通用飞行·地面各积分位——旧受段族批同口径）。
    //  ★AI 湿旗读相=上拍快照 wetAi（定谳①②③见字段块头注）：首拍预置先行单跑
    //  （=首拍当拍段:首拍未移动,采样位=出生盒=vanilla NewProjectile :10886-10893
    //  同位）→ 快照=预置值;后续拍先快照（=上拍段尾 this.wet,vanilla AI 读上拍段值
    //  同源）再跑当拍段。湿段副作用时序（溅花/wetCount/三清）与本插位批完全不变。
    const runWet = MINION_WET_IDS.has(this.projId);
    const presetFirst = runWet && !this.presetDone;
    if (presetFirst) {
      projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
        this.projId, !!projectileData(this.projId)?.ignoreWater);
    }
    this.wetAi = this.wet;
    if (runWet && !presetFirst) {
      projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
        this.projId, !!projectileData(this.projId)?.ignoreWater);
    }
    this.age++;
    if (this.attackFlash > 0) this.attackFlash--;
    // ---- 族专属召唤音（生成后首帧起按 at 节拍各一次，见 MINION_SUMMON_SFX 注） ----
    const summonSfx = MINION_SUMMON_SFX[this.projId];
    if (summonSfx) {
      for (const st of summonSfx) {
        if (st.at === this.age) game.playSfxFiles(soundTrackFiles(st.track), st.vol, this.cx, this.cy);
      }
    }
    // 帕鲁出场淡入（DoPalAppearEffect :39509-39515：alpha -= 15/tick，17t 全显）
    if (this.alphaFade > 0) this.alphaFade = Math.max(0, this.alphaFade - 15);
    // 帕鲁随从族抚摸 Joy 计时（AI 首段，:50053-50113/:59101-59131——先于各家族分支,
    // foxChannel 等早退支也照走）
    {
      const owner0 = this.ownerRef();
      if (owner0) this.palJoyTick(game, owner0);
      // 火绒狐帧态机（AI_026 flag8 帧段折算）——同 palJoyTick 先于各家族早退支
      if (owner0 && (this.projId === 1094 || this.projId === 1113)) this.foxAnimTick(owner0);
      // 火绒狐攻击叫声称（TryUsingFoxsparksAbility Player.cs:43677-43698：channeling
      // 期 soundDelay<=-320（:43691）→ 重置 -21（:43693）并播 PalFoxparksAttack
      // （:43694,SoundID.cs:1092 WithVolume 0.18）。原版门在玩家用物品 tick
      // （SetDummyItemTime(2) :43690 → 调用点 :43103 每 ~2t 一查），本仓挂在 AI
      // 首段的 foxChannel 消费点,时点差 ≤1t 备案;声源锚玩家中心（base.Center
      // :43694——channeling 期弹体本被 Game 锚到玩家中心 position=MountedCenter-
      // Size/2(:56120),本仓 cx/cy 同点等价）
      if (this.projId === 1094 || this.projId === 1113) {
        this.foxSoundCd--;                                   // --soundDelay（:59119）
        if (this.foxChannel && this.foxSoundCd <= -320) {
          this.foxSoundCd = -21;                             // :43693
          game.playSfxWav?.('pal_foxparks_attack', 0.18, this.cx, this.cy);
        }
      }
    }
    if (this.projId === 653) { this.companionCubeStep(game); return; }
    if (this.sentry) {
      if (--this.life <= 0) { this.dead = true; return; }
      const owner = this.ownerRef();
      // ---- 1457 哨兵携带（accSentryBackpack 四件 6172 重携/6175 侦察/6176 圣殿
      //      骑士/6177 皇家卫队——ApplyEquipFunctional :14612-14685 全四件置旗）----
      //  拾起门 CanGetPickedUpBySentryBackpack（Projectile.cs:80532-80552）：sentry +
      //  owner 本地 + 玩家挂背包且抓取冷却 0（:80543）+ 哨兵盒与玩家盒相交（:80547）
      //  → ai[2]=1（:37811-37815，各哨兵 AI 同款插入）。抓取冷却被携带者每拍续约 2
      //  （SetAsSelectedSentryBackpackTarget :80554-80557）→ 同时至多携带一门
      if (!this.carriedByBackpack && owner
        && owner.equipStats.accSentryBackpack && owner.accSentryBackpackGrabCooldown <= 0
        && this.x < owner.x + owner.w && this.x + this.w > owner.x
        && this.y < owner.y + owner.h && this.y + this.h > owner.y) {
        this.carriedByBackpack = true;
      }
      if (this.carriedByBackpack) {
        if (!owner) { this.dead = true; return; }
        // SetAsSelectedSentryBackpackTarget（:80554-80557）：各哨兵 AI 携带支每拍
        // 续约抓取冷却 2 → 同时至多携带一门（先续约后重定位 = 原版块内序）
        owner.accSentryBackpackGrabCooldown = 2;
        this.vx = 0; this.vy = 0;                          // 携带支 velocity = Zero（:37820/:38006/:69355/:69622/:69952/:70400）
        // AI_Sentries_HeavySlingReposition（Projectile.cs:70096-70470）1:1 重定位——
        // 内含 !accSentryBackpack → Kill 头支（:70098-70102,携带中卸下背包=当场消亡）
        // 与 per-aiStyle/per-type 落位几何;原版携带支同时 tileCollide=false（:37821
        // /:69411/:69985/:70411）——本仓携带态不走 moveAndCollide 同语义
        this.heavySlingReposition(owner);
        if (this.dead) return;
        // 哨兵背在身上随玩家移动,各塔族开火段照常跑（原版拾起块后 AI 继续 :37824+）
      } else if (FLOATING_SENTRIES.has(this.projId)) {
        // 悬浮哨兵（R31 §C① P1）：AI_123 首行 velocity=Zero（:37726 区块,641/643）/
        // AI_197 悬浮炮台（1025）——tileCollide=false 恒悬浮于放置点,不吃重力。
        // 此前走下方重力段被拽到地面,"空中炮台"站位语义丢失。放置点本体（落地扫描
        // +定速下坠）由 pickSentryLandingSpot 导出函数承载,Game 接线见落点清单。
        this.vx = 0; this.vy = 0;
      } else {
        // 落地（AI_130 尾部 :65420：tileCollide=true + velocity.Y += 0.2）
        this.vy = Math.min(this.vy + 0.2, MAX_FALL_SPEED);
        moveAndCollide(this, game.world, 0, this.vy);
      }
      // 随从/哨兵伤害：武器基伤 × summonDamageMult（live 刷新，换装即时生效，
      // Projectile.cs:15368 语义）+ 护甲穿透（对随从弹幕生效 :12068）
      const dmgOf = () => Math.max(1, Math.round(this.damage * (owner ? owner.summonDamageMult : 1))); // ⑥ pen 移 hit 时
      // 爆炸烈焰塔族（AI_130，Projectile.cs:65194-65450 1:1）：
      // 待机帧 0 → 锁定目标(900px 内)转向 → 开火动画帧 1-6 每 4t（第 12t 从炮口
      // Bottom+(dir*6,-46) 发火球 668）→ 24t 结束回待机并冷却 60t（num8）
      if (FLAMEBURST_TOWER.has(this.projId)) {
        const tier = FLAMEBURST_TIERS[this.projId] ?? FLAMEBURST_TIERS[667];
        // ★台账批 C-4179（2026-08-31）：AI_130 每 update 双矩形环境尘 1:1
        //  （1458 Projectile.cs case 663 :69181-69225 / 665 :69229-69272 / 667
        //  :69276-69320）——①底盆白烟 d270：盒 = (pos.X+w/4, bottom−16,
        //  w/4×{663:3|665/667:2}, 6)，朝右再左移 w/4；1/2 帧、fadeIn .6-.1.2、
        //  scale .4、vel 归零后 X 漂移 −dir×rand×fadeIn、noGravity/noLight；
        //  ②炮口火舌 d6：盒 = Center.X 起 ±w/4 宽（左向左伸）且 +dir×4 偏移、
        //  Y = bottom−(height−10)，{663|665|667}=各 1/2/3 层每层 1/5 帧、
        //  fadeIn1/scale1/vel×2。此前整段"未建模"登记消账（spawnDust/addLightAt
        //  现有基建直映）；★哨兵背包携带面复核（2026-09-03）：原版仅【底盆白烟】
        //  被携带态关（flag = ai[2]!=1,:69181 门在 for 上限 `(flag ? 1 : 0)`
        //  :69194/:69243/:69292）；炮口火舌（:69203-69212/:69252-69261/:69301-69310）
        //  与 Lighting.AddLight（:69178-69180 等）无 ai[2] 门——携带中照喷照亮
        if (game.spawnDust) {
          const fw = Math.floor(this.w / 4);
          const emberX = this.x + fw - (this.facing === 1 ? fw : 0);
          const emberW = this.projId === 663 ? fw * 3 : fw * 2;
          if (!this.carriedByBackpack && Math.floor(Math.random() * 2) === 0) {
            const dE = game.spawnDust(emberX - 2, this.y + this.h - 16 - 2,
              emberW + 4, 10, 270, -this.facing * 2, -2, 200, null, 0.4);
            if (dE) {
              const fade = 0.6 + Math.random() * 0.6;
              dE.fadeIn = fade;
              dE.vx = 0; dE.vy = 0;
              dE.vx = -this.facing * Math.random() * fade;
              dE.noGravity = true; dE.noLight = true;
            }
          }
          const muzLoops = this.projId === 663 ? 1 : this.projId === 665 ? 2 : 3;
          for (let li = 0; li < muzLoops; li++) {
            if (Math.floor(Math.random() * 5) !== 0) continue;
            const mx = this.cx + (this.facing === -1 ? -fw : 0) + this.facing * 4;
            const my = this.y + this.h - (this.h - 10);
            const dF = game.spawnDust(mx, my, fw, 10, 6, 0, 0, 0, null, 1);
            if (dF) {
              dF.fadeIn = 1;
              dF.noGravity = true; dF.noLight = true;
              dF.vx *= 2; dF.vy *= 2;
            }
          }
          // Lighting.AddLight(Center) ∪ (Bottom+(0,-10))，强度倍率按档
          // （×1 / ×1.2 / ×1.5,:69178-69180/:69226-69228/:69273-69275）
          const lm = this.projId === 663 ? 1 : this.projId === 665 ? 1.2 : 1.5;
          game.addLightAt?.(this.cx, this.cy, 0.4 * lm, 0.2 * lm, 0.1 * lm);
          game.addLightAt?.(this.cx, this.y + this.h - 10, 0.4 * lm, 0.2 * lm, 0.1 * lm);
        }
        // ★F2③ 携行态朝向回写（AI_130 携带支 :69348-69357,先于 ai[0]==1 待机臂）：
        //   ai[2]==1（哨兵背包携行）&& ai[0]==1 && ai[1]==0 ⇒ direction=spriteDirection
        //   =player.direction 每拍回写——随玩家转向同步塔身朝向（无目标拍亦回写,
        //   原版选向只在索敌命中拍覆写 :69382,携带支同拍在后,序保留）。与弩车
        //   134 同款（:69615-69623,已接）
        if (this.carriedByBackpack && this.sFire === 0 && this.sCool <= 0) {
          const carrier = owner ?? game.player;
          if (carrier) this.facing = carrier.facing < 0 ? -1 : 1;
        }
        // ★F4 索敌/射击端点换 shootingSpot（2026-08-30 实体侧对账批）：AI_130 的
        //   FindTarget 全部 Distance/CanHitLine 以 vector=Bottom+(direction*6,-Δ)
        //   为端点（1457 Projectile.cs :69182/:69234/:69286 三档锚；FindTarget 定义
        //   :69418 端点消费 :69426-69456）——此前错挂随从盒中心。134/123 族用本体
        //   Center 口径成立，唯 130 错。direction 基于本体 Center DirectionTo.X
        //   （:69382），与选向一致。
        const spot = () => ({ x: this.cx + this.facing * 6, y: this.y + this.h - tier.dy });
        // ★F6 批①②（2026-08-31）：学徒 T2 套装三层修饰——case 链之后乘（:69331-69335
        //   的执行序）：shot_range num 900×1.5、angleRatioMax 1→0.1、弹速 num4×1.4。
        //   角度比门 + canChangeDirection 门由 nearestEnemy(gate) 承载。
        const f130 = dd2SetFlags(game.player);
        const range130 = f130.apprenticeT2 ? 1350 : 900;    // (:69165/:69333)
        const ratio130 = f130.apprenticeT2 ? 0.1 : 1;       // (:69166/:69332)
        const spdMul130 = f130.apprenticeT2 ? 1.4 : 1;      // (:69334 num4*=1.4——含 case 链加成后)
        if (this.sFire === 0) {
          // 索敌门 = AI_130_FlameBurstTower_FindTarget（1457 Projectile.cs:69418-69462，
          // 1456 :65365 同体）：
          // 候选须 `Collision.CanHitLine(shootingSpot→NPC.Center)`（:69434/:69456）
          // 且 |vX| ≥ |vY|·angleRatioMax（:69434 角度锥,批②接入）。调用点 :69376
          // （待机选向 canChangeDirection=true → 无 directionLock）。
          const s = spot();
          const tgt = this.nearestEnemy(game, range130, 'line', 'self', range130, s,
            { angleRatioMax: ratio130 });
          if (tgt && this.sCool <= 0) {
            this.facing = tgt.cx >= this.cx ? 1 : -1; // direction = Sign(DirectionTo.X)（:69382）
            this.sFire = 1; this.sFireT = 0;
          }
          if (this.sCool > 0) this.sCool--;
        } else {
          if (this.sFireT === 12) {
            // 开火帧重索敌（:69391，canChangeDirection=false → directionLock=现朝向；
            // 正后方候选被 :69456 `direction*vX<0` 拒）——门不过 → 沿入态朝向直射
            // （原版 num11==-1 支 vector2=(direction,0)）
            const s = spot();
            const tgt = this.nearestEnemy(game, range130, 'line', 'self', range130, s,
              { angleRatioMax: ratio130, directionLock: this.facing });
            game.playSfxFiles(soundTrackFiles('dd2_flameburst_tower_shot'), 0.9, this.cx, this.cy); // AI_131 :69526（弹幕首帧）
            // 弹速三档 num4=12/15/18（:69171 基值、case 665 +=3 :69231 / case 667 +=6
            //   :69283；学徒 T2 ×1.4 在 case 链【之后】乘 :69334）
            let vx = this.facing * tier.speed * spdMul130, vy = 0;
            if (tgt) {
              const d = Math.hypot(tgt.cx - s.x, tgt.cy - s.y) || 1;   // 归一自 shootingSpot(:69408)
              vx = ((tgt.cx - s.x) / d) * tier.speed * spdMul130;
              vy = ((tgt.cy - s.y) / d) * tier.speed * spdMul130;
            }
            // 664/666/668 弹 16×16（SetDefaults :7155-7163）→ 炮口 − 8（曾 -5 偏 3px）
            // ★F5 随收：AI_131 弹全程无重力无加速度（:69519-69559 只管声·尘·旋转,
            //   SetDefaults 无 gravity 覆盖）→ velocity=num4 恒速直线；旧 {grav:0.2}
            //   抛物线系误植，改显式 grav 0
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              Object.assign(new Arrow(s.x - 8, s.y - 8, vx, vy, dmgOf(), this.knockback, tier.shot, { grav: 0 }),
                { whipTagShot: true }),
              'projectiles');
          }
          if (++this.sFireT >= tier.cycle) { this.sFire = 0; this.sCool = tier.cool; } // cycle=num6*num7=24/32/32、cd num8=80/70/60（:69228/:69281 分层）
        }
        return;
      }
      // 弩车族（AI_134）：帧 0 待机 → 帧表 1-5（每 5t）→ 开火第 6t 出弩箭 680
      // （ai[1]==num2=num6=5,:69656——旧"第12t"系把 num2 初值 12 当终值读错,
      //   num2 已在 :65592/:69593 被 num2=num6 无条件覆写=5）→ 25t 结束 → 冷却
      if (BALLISTA_TOWER.has(this.projId)) {
        // ★F6 批②（2026-08-31）：瞄准/出弹基准点 center.Y−4 仅 677（:65599-6601/
        //   :69597-69599 字面怪癖,-Δ 不随方向镜像）;deadBottomAngle=0.75 锥形门
        //   (:69481/:69503)+侍从 T2 弩速 16→21（:69591-69593 num3）
        const setf134 = dd2SetFlags(game.player);
        const spotY134 = () => this.cy - (this.projId === 677 ? 4 : 0);
        const shotSpeed134 = setf134.squireT2 ? 21 : 16;    // num3（:69587/:69592）
        // ★F2③ 携行态朝向回写（:69615-69623 num8 支,先于 ai[0]==1 待机臂执行）：
        //   ai[2]==1（哨兵背包携行）&& ai[0]==1 && ai[1]==0 ⇒ direction=spriteDirection
        //   =player.direction 每拍回写——随玩家转向同步塔身朝向（回写优先级高于待机臂
        //   的旋转半平面派生与转火覆写；ai[1]==0 = 冷却恰好走完的拍）
        if (this.carriedByBackpack && this.sFire === 0 && this.sCool === 0) {
          const carrier = owner ?? game.player;
          if (carrier) this.facing = carrier.facing < 0 ? -1 : 1;
        }
        // 恐慌冷却钳（:69631-69640 空闲态每次递减前先钳 60/T3 双真 30）
        const panicClamp = (): void => {
          if (setf134.ballistaPanic && this.sCool > 60) this.sCool = 60;
          if (setf134.ballistaPanic && setf134.squireT3 && this.sCool > 30) this.sCool = 30;
        };
        // 1457 :69599-69609（1456 :65607-65617 ai[1]=0→shotDelay）:落位首帧即满档装填——
        // 放置后不再立即射第一箭,先等一整段（160/100/60/30）
        if (this.sInit === 0) {
          this.sInit = 1;
          this.sCool = ballistraShotDelayOf(game.player);
          // ★T9 ai[0]==0 落位拍（:69599-69608）：direction=spriteDirection=
          //   owner.direction；朝左时 rotation=π（本体贴图朝右-authored,背面朝向
          //   的旋转基线由此起）——rotation 为 draw 侧 dir 组合的输入,见 draw 弩车支
          //   ★F2①：direction=spriteDirection=owner.direction 的【朝向写回】此前缺席
          //   （只设了 rotation）——朝左放置后 facing 停留缺省 1,待机期 draw 的
          //   FlipV 半边不触发（R(π)·FlipV 应为水平镜像,缺 FlipV 时 rot=π 单独
          //   生效=上下颠倒）
          this.facing = ((owner ?? game.player)?.facing ?? 1) < 0 ? -1 : 1;
          this.rot = this.facing < 0 ? Math.PI : 0;
        }
        if (this.sFire === 0) {
          // 索敌门 = AI_134_Ballista_FindTarget（Projectile.cs:69465-69507）：
          // 候选须 `Collision.CanHitLine(center→NPC.Center)`（:69481/:69503）且不出
          // deadBottomAngle 死锥（|vX|<|vY|×0.75 且目标在下）。调用点 :69647。
          panicClamp();
          const s134y = spotY134();
          const tgt = this.nearestEnemy(game, 900, 'line', 'self', 900,
            { x: this.cx, y: s134y }, { deadBottomAngle: 0.75 });
          // ★T9 ai[0]==1 待机臂（:69647-69676）：有标 → rotation=AngleLerp(rot,
          //   aim,0.08)(:69651) 后 direction 取旋转半平面(:69652-69659;|rot|>π/2 ⇒ −1,
          //   等价 cosθ<0 ⟺ v.X<0)；无标 → 向归位角（direction==−1?π:0,:69669-69675）
          //   0.05 速率回摆。
          //   rotation 只作 draw 输入,facing 派生序照原文（lerp→半平面→转火覆写）
          if (tgt) {
            this.rot = angleLerp134(this.rot,
              Math.atan2(tgt.cy - s134y, tgt.cx - this.cx), 0.08);
            this.facing = this.rot > Math.PI / 2 || this.rot < -Math.PI / 2 ? -1 : 1;
          } else {
            this.rot = angleLerp134(this.rot, this.facing < 0 ? Math.PI : 0, 0.05);
          }
          if (tgt && this.sCool <= 0) {
            // ★T9 :69660-69666 转火拍 direction=Sign(v.X) 覆写（仅此瞬拍；非转火
            // 拍方向恒=旋转半平面派生,lerp 滞后照原文）
            this.facing = tgt.cx >= this.cx ? 1 : -1;
            this.sFire = 1; this.sFireT = 0;
          }
          if (this.sCool > 0) this.sCool--;
        } else {
          if (this.sFireT === 5) {
            // 开火帧重索敌（:69685，ai[1]==num2=5）同样带 CanHitLine/deadBottomAngle 门
            // ——门不过沿 direction 直射（num10==-1 支 vector=(direction,0),:69688）
            const tgt = this.nearestEnemy(game, 900, 'line', 'self', 900,
              { x: this.cx, y: spotY134() }, { deadBottomAngle: 0.75 });
            game.playSfxFiles(soundTrackFiles('dd2_ballista_tower_shot'), 0.9, this.cx, this.cy); // AI_134 :69656 SoundEngine.PlayTrackedSound（开火帧同弩箭）
            // 瞄准与出弹都从 center（含 677 的 Y−4;:69597 取心 → :69673 NewProjectile）。
            // 680 弩箭 16×16 → 左上 = center−8
            let vx = this.facing * shotSpeed134, vy = 0;
            if (tgt) {
              const sy134 = spotY134();
              const d = Math.hypot(tgt.cx - this.cx, tgt.cy - sy134) || 1;
              vx = ((tgt.cx - this.cx) / d) * shotSpeed134;
              vy = ((tgt.cy - sy134) / d) * shotSpeed134;
            }
            // ★T9 ai[0]==2 出弹拍（:69687-69698）：rotation=vector.ToRotation()(:69690)
            //   精确钉角（fallback vector=(direction,0) ⇒ 0/π），direction 再取旋转
            //   半平面(:69691-69698)——先于出弹（速度=同 vector×num3 :69699）
            this.rot = Math.atan2(vy, vx);
            this.facing = this.rot > Math.PI / 2 || this.rot < -Math.PI / 2 ? -1 : 1;
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              // 680 弩箭：AI_001 默认档（0.1@15 缓坠）——重力缺省走规格链（2026-08-14 对账）
              // ★穿透终值：SetDefaults penetrate=4，NewProjectile 内联覆写
              //   `Type==680 && player.setSquireT2 → penetrate=7`（Projectile.cs:11083-11086）
              //   = 侍从 T2 套装「弩车可穿透」——发射点覆写审计批（2026-09-03）补
              Object.assign(new Arrow(this.cx - 8, spotY134() - 8, vx, vy, dmgOf(), this.knockback, 680,
                setf134.squireT2 ? { pierce: 7 } : undefined),
                { whipTagShot: true }),
              'projectiles');
          }
          if (++this.sFireT >= 25) { this.sFire = 0; this.sCool = ballistraShotDelayOf(game.player); } // num5*num6=25（:69686）
        }
        return;
      }
      // 闪电光环族（AI_137_LightningAura :65910-66060 1:1）：非射击场伤——
      // 落地后一次性测净空：脚下找地面（下搜 500 格）、头顶找天花板（上搜 num=10 格），
      // 边长 = 净空px 截断 [num5×16=64, num×16=160] 再 ×2（:65953-65978，width=height
      // 封顶 999）——即以塔为中心的方形光环场（64~320px），不再是固定 4 格盒。
      // 每 tick 接触判定（Colliding :14537-14553：方形盒相交 + 距中心 < height/2-20 +
      // AI_137_CanHit 视线），localNPCHitCooldown=3（:7055）→ 每 3t 一跳
      if (AURA_TOWER.has(this.projId)) {
        if (this.sInit === 0) {
          this.sInit = 1;
          const st = game.world.store;
          const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
          let groundY = -1;
          for (let y = ty; y < Math.min(st.h, ty + 500); y++) { // Searches.Down(500)
            if (st.inBounds(tx, y) && st.isSolid(tx, y)) { groundY = y; break; }
          }
          if (groundY < 0) { this.y += 16; return; } // 无地面（:65948-65952）
          let ceilY = -1;
          for (let y = groundY - 1; y >= groundY - 10; y--) { // Searches.Up(num=10)
            if (y >= 0 && st.inBounds(tx, y) && st.isSolid(tx, y)) { ceilY = y; break; }
          }
          if (ceilY < 0) ceilY = ty - 11; // :65956-65958（无天花板 → origin-num-1）
          const centerY = groundY * TILE; // result.ToWorldCoordinates(8f, num6)（半砖 +8 未实装）
          const topY = ceilY * TILE;      // result2.ToWorldCoordinates(8f, 0f)
          let side = centerY - topY;      // :65970 base.Size = (1, center.Y - top.Y)
          side = Math.max(64, Math.min(160, side)); // :65972-65977 [num5×16, num×16]
          side *= 2;                      // :65978 height *= 2（width=height，封顶 999）
          this.auraSide = Math.min(999, side);
          this.auraCy = centerY; // base.Center = center（:65980）
        }
        const side = this.auraSide;
        // ★哨兵背包携带面（2026-09-03）：原版场盒 = Size(height×height) 以 base.Center
        //   为心（Colliding :14537-14553 / 扫描 :69966-69971）——被携带时 Center 每拍被
        //   AI_Sentries_HeavySlingReposition aiStyle 137 支（:70127-70137）钉到
        //   MountedCenter → 场随玩家移动。落位拍锚 auraCy（localAI[0] 首拍支 :65980
        //   base.Center = center）,携带拍锚本体 Center（=玩家心）。
        const fieldCy = this.carriedByBackpack ? this.cy : this.auraCy;
        if (side > 0) {
          let zapped = false;         // 直伤拍标记（供 zap 声窗判定兜底,见批 C-3472 注）
          let fieldEnemy = false;     // ★台账批 C-3472：原版声扫描面（场内有敌即可,不看 LOS/冷却）
          for (const ent of game.enemies()) {
            if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
            const en = ent as EnemyLike & { dead: boolean } & import('./WhipTag').WhipTagged;
            if (en.dead) continue;
            const ax = this.cx - side / 2, ay = fieldCy - side / 2;
            // myRect.Intersects(targetRect)（方形场盒）——vanilla 扫描的
            // Colliding(Hitbox,nPC.Hitbox) 同面（:69966-69971）
            if (en.x + en.w <= ax || en.x >= ax + side || en.y + en.h <= ay || en.y >= ay + side) continue;
            // targetRect.Distance(Center) < height/2-20（:14540，敌 AABB 到中心最近点距）
            const nx = Math.max(en.x, Math.min(en.x + en.w, this.cx));
            const ny = Math.max(en.y, Math.min(en.y + en.h, fieldCy));
            if (Math.hypot(this.cx - nx, fieldCy - ny) >= side / 2 - 20) continue;
            fieldEnemy = true;
            // AI_137_CanHit 视线门（Projectile.cs:71574-71614，2026-08-30 补弧线三试
            // +目标双点:15890/:15894 敌盒中心/敌盒上沿中任一通过即命中；目标格实心直接 false）。
            // ★起点基点核对（Entity.cs:86-96）：base.Top=(X+width/2, position.Y)=场盒顶沿中点，
            //   +UnitY×20 → 起点 = (Center.X, cy − 场盒半高 + 20)；本仓场盒高=auraSide、
            //   场盒竖中心=fieldCy → 起点为 (cx, fieldCy − side/2 + 20)。旧实现锚在
            //   (cx, auraCy−20) 无 side 归属——小盒(64~160)差 ≤60px 档位级偏移，已对齐。
            if (!lightningAuraCanHitFrom(game.world.store, this.cx, fieldCy - side / 2 + 20, en.cx, en.cy)
              && !lightningAuraCanHitFrom(game.world.store, this.cx, fieldCy - side / 2 + 20, en.x + en.w / 2, en.y)) {
              continue;
            }
            if (!this.hitCd.ready(en.id, 3)) continue; // localNPCHitCooldown=3（:7055）
            zapped = true;
            // 命中 armorPenetrationPercent 门（Projectile.cs:13266-13269）：
            //   `if ((type == 688||689||690) && targetNPC.type != 68 && targetNPC.defense < 999)`
            //   ⇒ 仅当受害者非 68（地牢守卫族）且防御 <999 才置 100% 护穿——高防/守卫豁免。
            //   ★三轮 η 红队：旧实现无条件传 penPercent=1（且锚写死 :12443 属死锚）
            //   ⇒ 防≥999 受害者的退款池计算随 penAdd 整体变形。tag 伤 ×0.5
            //   （ProjectileID.cs:31 SummonTagDamageMultiplier）
            const vAura = en as unknown as { vanillaId?: number | null; def?: { defense?: number } };
            const penPctAura = lightningAuraPenPercent(vAura.vanillaId, vAura.def?.defense);
            const res = resolveWhipTagHit(en, dmgOf(), game,
              (el) => (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(el, 'projectiles'),
              SUMMON_TAG_MUL[this.projId] ?? 1, en.cx, en.cy, this.ownerRef());
            // 哨兵射击=单发弹语义;penPercent 门=:13266-69;fromPlayer=DPS 计。
            // ★6176 圣殿骑士背包（:12962-12965,2026-09-03 收口）：光环场伤=塔本体
            //   （sentry）直伤面 → 10% 强制暴击（此前仅接触面掷,场伤面漏掷）
            const golemCritAura = rollGolemSentryCrit(game, this.projId, true);
            en.hurt(applyBannerDamageDealt(game, en, golemCritAura ? res.dmg * 2 : res.dmg),
              0, 0, game, 0, golemCritAura, 1, true, penPctAura);
            applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
          }
          // ★台账批 C-3472（2026-08-31）：电弧声密度对齐原版 ai[0] 循环（AI_137
          //  :69955-69979：ai[0]++ %num3==0 时扫场，场内有敌才 PlayTrackedSound——
          //  num3=30/僧侣T2 -5→25、T3 不改字面）。旧"每直伤 tick 一声"密度 ×30。
          //  真值节拍：zapCycle==period-1 且本轮扫描见敌 → 一声。原版 PlayTrackedSound
          //  每次新开 ActiveSound 实例（旧实例未停=尾音自然重叠），本仓一次性 wav 同构
          //  ——「跨 tick 续播缓冲」仅指实例存活期内 Volume/Position 跟踪（Sfx.ts 音轨
          //  注记）；塔体静止时与 playSfxFiles 无可测差，startTrackedLoop 是 loop=true
          //  通道语义不同【不接】（终零波 M5 复核,C 类维持）。
          this.zapCycle++;
          const zapPeriod = dd2SetFlags(game.player).monkT2 ? 25 : 30;
          if (this.zapCycle >= zapPeriod) {
            this.zapCycle = 0;
            if (fieldEnemy || zapped) {
              game.playSfxFiles(soundTrackFiles('dd2_lightning_aura_zap'), 0.5, this.cx, fieldCy);   // PlayTrackedSound(base.Center)（:69968）——携带态随玩家
            }
          }
        }
        return;
      }
      // 爆炸机关族（AI_138）：每 3t 探测中心上方 48px 的 144×144 盒——有敌即
      // 原地爆炸 AoE（proj 694 等价）+ 粒子 + 冷却 90（GetExplosiveTrapCooldown）。
      // ★哨兵背包携带面（2026-09-03）：AI_138 携带支（:70397-70405）num3=20、
      //   num2=48−14=34 → 探测盒 = CenteredRectangle(Center+(0,-num2), num2*3)
      //   （:70407）后 Inflate(num3,num3)（:70411）→ 半宽 num2*3/2+num3：常规 48*3/2
      //   =72、携带 34*3/2+20=71（盒心 Y 也从 −48 抬到 −34）。探测循环带
      //   nPC.CanBeChasedBy(this) 门（:70430,NPC.cs:91141 索敌面,红队 F12 补）——
      //   不可瞄准目标（小动物 lifeMax≤5 / dontTakeDamage / CHASE_EXCLUDED_VIDS
      //   如训练假人 488）不触发爆炸机关（复用 projTargets.canBeChasedBy）
      if (TRAP_TOWER.has(this.projId)) {
        if (--this.sCool <= 0) {
          this.sCool = 3;
          const trapNum2 = this.carriedByBackpack ? 48 - 14 : 48;   // :70395 num2=48、携带支 num2 -= 14（:70402）
          const trapNum3 = this.carriedByBackpack ? 20 : 0;         // :70394 num3=0、携带支 num3 = 20（:70401）
          const ecx = this.cx, ecy = this.cy - trapNum2;
          const trapHalf = trapNum2 * 3 / 2 + trapNum3;
          const hit = (game.enemies() as EnemyLike[]).some((en) =>
            canBeChasedBy(en) && Math.abs(en.cx - ecx) < trapHalf + en.w / 2
            && Math.abs(en.cy - ecy) < trapHalf + en.h / 2);
          if (hit) {
            this.sCool = 90;
            game.playSfxFiles(soundTrackFiles('dd2_explosive_trap_explode'), 0.9); // AI_138 :66104（无位置参数）
            // 原版塔体 691/692/693 生成【爆炸弹】694/695/696（AI_138 :66063-66073）,
            // StatusNPC 走爆炸弹型号——Oiled 门在 694 族(:10786,setHuntressT2 套装门)
            const boomProj = 694 + (this.projId - 691);
            const ownerH = (this.ownerRef() as unknown as { equipStats?: { huntressT2?: boolean } } | null)
              ?.equipStats?.huntressT2 ?? false;
            let boom = 0;
            for (const ent of game.enemies()) {
              if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
              const en = ent as EnemyLike & { dead: boolean };
              if (en.dead) continue;
              if (Math.abs(en.cx - ecx) < 72 + en.w / 2 && Math.abs(en.cy - ecy) < 72 + en.h / 2) {
                // 单发弹语义;fromPlayer=DPS 计。★6176（:12962-12965,2026-09-03 收口）：
                //   原版伤害面=爆炸弹 694/695/696 本体（SentryShot）→ 10% 强制暴击
                const golemCritBoom = rollGolemSentryCrit(game, boomProj, false);
                en.hurt(applyBannerDamageDealt(game, en, golemCritBoom ? dmgOf() * 2 : dmgOf()),
                  Math.sign(en.cx - this.cx) * this.knockback, -2, game, 0, golemCritBoom, 1, true);
                applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
                // 爆炸弹 694 族同属玩家弹——催化指环 6185 亦生效（StatusNPC :11192-11196）
                applyProjStatus(boomProj, en as unknown as Record<string, number>, { setHuntressT2: ownerH,
                  catalystBand: this.ownerRef()?.equipStats.catalystBand });
                boom++;
              }
            }
            void boom;
            game.spawnParticles(ecx, ecy, '#FFB040', 18, 4, { life: 36 });
            game.playSfx('explosion', 1, this.cx, this.cy);
          }
        }
        return;
      }
      // aiStyle 53 定点哨兵三族（Projectile.cs:27172-27382 1:1）：
      // 初冷 ai[0]=120 → 锁定目标转向（瞄准扇区 num424 :27258-27279）→
      // ai[0]≤0 开火（射速 60/60/90，弹速 9/9/12.5，:27282-27311）→ ai[0] 每 tick 递减
      const s53 = SENTRY53[this.projId];
      if (s53) {
        if (this.sInit === 0) {
          this.sInit = 1; this.sCool = 120;   // localAI[0]==0 → ai[0]=120（:27176-27181）
          // ---- 出生尘爆 + Item46 音（R31 §C②/A⑥ P1,AI_053 首帧 Projectile.cs:37951-37990）：
          // 全体 PlaySound(Item46);308 冰霜九头蛇=80×d185(Y+16 盒,v×2,noGravity,scale×1.15);
          // 377 蜘蛛皇后=40×d171(scale=Next(1,10)×0.1,fadeIn1.5,v×0.75,alpha100);
          // 966 猎犬=30×d219(Center±(25,30) 盒,v×2,noGravity,scale×0.5)。377 frame=4/
          // 966 ai[1]=-1+frame=0 为帧档微差未建模(登记)。此前哨兵"啪一下静默出现"。
          game.playSfxFiles(soundTrackFiles('Item_46'), 1, this.cx, this.cy);
          if (this.projId === 308) {
            for (let i = 0; i < 80; i++) {
              const d = game.spawnDust?.(this.x, this.y + 16, this.w, this.h - 16, 185, 0, 0, 0);
              if (d) { d.vx *= 2; d.vy *= 2; d.noGravity = true; d.scale *= 1.15; }
            }
          } else if (this.projId === 377) {
            for (let j = 0; j < 40; j++) {
              const d = game.spawnDust?.(this.x, this.y + 16, this.w, this.h - 16, 171, 0, 0, 100);
              if (d) {
                d.scale = (1 + Math.floor(Math.random() * 9)) * 0.1;   // Next(1,10)*0.1
                d.noGravity = true; d.fadeIn = 1.5; d.vx *= 0.75; d.vy *= 0.75;
              }
            }
          } else if (this.projId === 966) {
            for (let k = 0; k < 30; k++) {
              const d = game.spawnDust?.(this.cx - 25, this.cy - 30, 50, 60, 219, 0, 0, 0);
              if (d) { d.vx *= 2; d.vy *= 2; d.noGravity = true; d.scale *= 0.5; }
            }
          }
        }
        // ★F2③ 携行态朝向回写（AI_053 携带支 :37996-38002）：ai[2]==1 && ai[0]<=0
        //   （射击冷却走完）⇒ direction=spriteDirection=player.direction——随玩家转向
        //   同步（原版选向只在索敌命中段 frameCounter 过门时按目标方位覆写 :38052-38062,
        //   携带回写每拍在前）。ai[0]==0 帧清零支（:38005-38007）——s53 帧档走 age 循环
        //   未建模,不接
        if (this.carriedByBackpack && this.sCool <= 0) {
          const carrier = owner ?? game.player;
          if (carrier) this.facing = carrier.facing < 0 ? -1 : 1;
        }
        const tgt = this.nearestEnemy(game, 1000); // AI_053_HandleSentryNPCTargeting maxDistance=1000
        let sector = 2;
        if (tgt) {
          const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
          if (dx < 0) this.facing = -1; else this.facing = 1; // :27264-27268
          // 瞄准扇区（:27269）：dy>0→0；|dy|>|dx|×3→4；×2→3；|dx|≤|dy|×3→（|dx|>|dy|×2→1，否则 2）；否则 0
          sector = dy > 0 ? 0
            : Math.abs(dy) > Math.abs(dx) * 3 ? 4
              : Math.abs(dy) > Math.abs(dx) * 2 ? 3
                : Math.abs(dx) > Math.abs(dy) * 3 ? 0
                  : Math.abs(dx) > Math.abs(dy) * 2 ? 1 : 2;
        }
        if (tgt && this.sCool <= 0) {
          this.sCool = s53.cd; // :27282-27288（num427=60，966→90）
          // 炮口偏移（:27290-27347）：966 flag24 分支 zero 保持 (0,0)=本体中心；
          // 308/377 按扇区，朝左再 +10X（!flag24 && spriteDirection<0 :27351-27354）
          let ox = 0, oy = 0;
          if (this.projId !== 966) {
            switch (sector) {
              case 0: ox = 24 * this.facing; oy = 12; break;
              case 1: ox = 24 * this.facing; oy = 0; break;
              case 2: ox = 24 * this.facing; oy = -2; break;
              case 3: ox = 14 * this.facing; oy = -6; break;
              default: ox = 2 * this.facing; oy = -14; break;
            }
            if (this.facing < 0) ox += 10;
          }
          const mx = this.cx + ox, my = this.cy + oy;
          const d = Math.hypot(tgt.cx - mx, tgt.cy - my) || 1;
          const shotSfx = MINION_SHOT_SFX[s53.shot];
          if (shotSfx) game.playSfxFiles(soundTrackFiles(shotSfx.track), shotSfx.vol, this.cx, this.cy);
          // 出弹锚点 = 炮口 − 弹型判定盒/2（:27357 vector34=Center+zero；
          // 309/967 = 14×14、378 = 16×16——曾写死 -5 偏 2-3px）
          const sp53 = projectileData(s53.shot);
          const s53hw = (sp53?.width ?? 10) / 2, s53hh = (sp53?.height ?? 10) / 2;
          const s53life = sp53?.timeLeft ?? 1200;
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
            Object.assign(new Arrow(mx - s53hw, my - s53hh, ((tgt.cx - mx) / d) * s53.speed, ((tgt.cy - my) / d) * s53.speed,
              dmgOf(), this.knockback, s53.shot, { grav: 0, life: s53life }), { whipTagShot: true }), // SentryShot 吃鞭 tag（ProjectileID.cs:199）
            'projectiles');
        }
        if (this.sCool > 0) this.sCool--; // :27377-27380（目标有无均递减）
        return;
      }
      // ★2026-09-01 AI_197_CeilingAndHoverTurret 出弹站（Projectile.cs:41041-41179）：
      // 藤壶哨站 1025（物品 5463）——此前仅 FLOATING_SENTRIES 悬浮档,零开火（producer
      // 锚缺登记消账面）。①localAI[1]==0 首拍：frame=3 + 40×d2 出生尘爆
      // （Center±(10,10)、α100、v×2、noGravity,:41045-41056）;②num3=15 顶格深扫
      // flag2 只改本体浮态（悬停恒定,免笺）;③localAI[0]++ 至 num4=50——无目标钳 50
      // （目标出现当拍即发）,有目标归零并 NewProjectile 1026（muzzle=Center+(0,10),
      // 哨兵背包携带态 (0,0) :41060-41064、vel=(敌心−muzzle).SafeNormalize×num7=12、
      // 伤=damage、kb=本体;索敌 AI_053_HandleSentryNPCTargeting maxDistance=num8=
      // 1000+num3×16=1240（flag=1025 档 :41150-41154,无视线门）。弹 1026 全链
      // （AI_28 衰减/拖尾/出膛编排/命中毒/Kill 音尘）在 Arrow.ts 1026 支。
      if (this.projId === 1025) {
        if (this.sInit === 0) {
          this.sInit = 1;
          for (let i = 0; i < 40; i++) {
            const d = game.spawnDust?.(this.cx - 10, this.cy - 10, 20, 20, 2, 0, 0, 100);
            if (d) { d.vx *= 2; d.vy *= 2; d.noGravity = true; }
          }
        }
        // ★F2③ 携行态朝向/旋转回写（AI_197 携带支 :41068-41097,先于顶格深扫）：
        //   ai[2]==1 ⇒ spriteDirection=direction=player.direction（:41076）+ rotation
        //   =±π/2（:41082-41084;重定位 flag3 支 :70187/:70205 同值再加 fullRotation=0）
        //   ——藤壶哨站被背包携带时横置在玩家侧身。scale/缩体支（:41085-41090）与
        //   ai[0]==0 HandleTileCollision（:41093-41095）本仓未建模（1025 悬浮档无
        //   ai[0] 落位状态机;玩家盒 ≥42 缩体支不可达）
        if (this.carriedByBackpack) {
          const carrier = owner ?? game.player;
          if (carrier) {
            this.facing = carrier.facing < 0 ? -1 : 1;        // :41076
            this.rot = this.facing === 1 ? Math.PI / 2 : -Math.PI / 2;   // :41082-41083
          }
        }
        this.sCool = Math.min(this.sCool + 1, 50);            // localAI[0]++（:41156-41158）
        if (this.sCool >= 50) {
          const tgt = this.nearestEnemy(game, 1240);          // num8=1000+num3×16（:41153）
          if (!tgt) return;
          this.sCool = 0;                                     // localAI[0]=0（:41164）
          const oy = this.carriedByBackpack ? 0 : 10;         // vector3.Y（:41060-41064）
          const mx = this.cx, my = this.cy + oy;
          const d = Math.hypot(tgt.cx - mx, tgt.cy - my) || 1;
          const sp26 = projectileData(1026);
          const hw26 = (sp26?.width ?? 14) / 2, hh26 = (sp26?.height ?? 14) / 2;
          const life26 = sp26?.timeLeft ?? 3600;
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
            Object.assign(new Arrow(mx - hw26, my - hh26, ((tgt.cx - mx) / d) * 12, ((tgt.cy - my) / d) * 12,
              dmgOf(), this.knockback, 1026, { grav: 0, life: life26, extraUpdates: 2 }),
              { whipTagShot: true }),                         // SENTRY_SHOT_SET 吃鞭 tag
            'projectiles');
        }
        return;
      }
      // 其他哨兵（aiStyle 123：月门/彩虹水晶）
      const ss = SENTRY_SHOOT[this.projId];
      if (ss) {
        // 索敌门 = AI_123_FloatingTurrets（Projectile.cs:37840/:37854）：最近敌选择
        // 内联 `Collision.CanHitLine(base.Center→NPC.Center)`（浮动炮台不隔墙开火）；
        // 集火目标 OwnerMinionAttackTargetNPC 同门（:37840,本仓 minionTargetId 路径
        // 未过此门——登记）
        const tgt = this.nearestEnemy(game, 1000, 'line');
        if (tgt) this.facing = tgt.cx >= this.cx ? 1 : -1;
        if (tgt && this.sCool <= 0) {
          this.sCool = ss.cd;
          // 炮口（641 月门 = 本体 Center :33993；643 彩虹水晶走 volley 落点分支）
          const mx = this.cx;
          const my = this.cy;
          if (ss.volley) {
            // 彩虹水晶 643：3 连目标区随机落点（:34005——距离越远散布越大 0.5-1.25×）
            for (let i = 0; i < ss.volley; i++) {
              const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
              const spread = 0.1 + 0.65 * Math.max(0, Math.min(1, (800 - Math.min(800, d)) / 600));
              const px = tgt.cx + (Math.random() - 0.5) * 2 * (20 + spread * 60);
              const py = tgt.cy + (Math.random() - 0.5) * 2 * (20 + spread * 60);
              // 644 是原地爆裂弹（零速生成,短时引爆）→ 落点直接 AoE
              for (const ent of game.enemies()) {
                if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
                const en = ent as EnemyLike & { dead: boolean };
                if (en.dead) continue;
                if (Math.abs(en.cx - px) < 14 + en.w / 2 && Math.abs(en.cy - py) < 14 + en.h / 2) {
                  // 单发弹语义;fromPlayer=DPS 计。★6176（:12962-12965,2026-09-03 收口）：
                  //   原版伤害面=爆裂弹 644 本体（SentryShot）→ 10% 强制暴击
                  const golemCritVolley = rollGolemSentryCrit(game, ss.shot, false);
                  en.hurt(applyBannerDamageDealt(game, en, golemCritVolley ? dmgOf() * 2 : dmgOf()),
                    Math.sign(en.cx - px) * this.knockback, -2, game, 0, golemCritVolley, 1, true);
                  applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
                }
              }
              game.spawnParticles(px, py, `hsl(${Math.floor(Math.random() * 360)},90%,65%)`, 8, 2.4, { life: 26 });
            }
          } else {
            const d = Math.hypot(tgt.cx - mx, tgt.cy - my) || 1;
            // 641 月门原版锚点 = 本体 Center（:33993），642 传送门弹 18×18 → −9
            // （曾 mx-5 写死 + 锚点 -2 近似 → 弹心偏移半格）
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              Object.assign(new Arrow(mx - 9, my - 9, ((tgt.cx - mx) / d) * ss.speed, ((tgt.cy - my) / d) * ss.speed,
                dmgOf(), this.knockback, ss.shot, { grav: 0 }), { whipTagShot: true }),
              'projectiles');
          }
        }
        if (this.sCool > 0) this.sCool--;
        return;
      }
      // 其余哨兵兜底（当前武器表内无使用者——aiStyle 53/123/130/134/137/138 全覆盖；
      //  数值沿用 aiStyle 53 默认：初冷 120、射速 60，:27176-27181/:27286）
      const tgt = this.nearestEnemy(game, 600);
      if (tgt) {
        if (this.sInit === 0) { this.sInit = 1; this.shootCd = 120; }
        this.shootCd--;
        if (this.shootCd <= 0) {
          this.shootCd = 60;
          const ang = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
            Object.assign(new Arrow(this.cx - 5, this.cy - 5, Math.cos(ang) * 6, Math.sin(ang) * 6, dmgOf(), this.knockback, this.projId), { whipTagShot: true }),
            'projectiles');
        }
      }
      return;
    }
    // 随从
    const p = this.ownerRef();
    if (!p) { this.dead = true; return; }
    // ---- 1457 帕鲁钻地龟 1098/1123（5667/6174，AI_204_Digtoise 折算）----
    if (this.projId === 1098 || this.projId === 1123) { this.digtoiseStep(game, p); return; }
    // 索敌射程分档（1457 AI_062 :66319-66333）：num12 缺省 400 → 无条件覆盖 2000
    // （=射手族档，423/613 的 300 覆盖同为死赋值）、963=700（:66330-66333）；
    // 致命球 533 走 AI_066 档 num526=2000（:30105-30111,备案项⑥——曾走通用 700 档）；
    // 其余 AI 族检索半径 = MINION_SHOOT[].search 键（★台账批⑭ 补表:俾格米 800 等,
    // 原版门 AI_026 主周曼哈顿 700+100）;缺键 shooter 型 1000 / 无弹型 700 兜底。
    // 射手族/963/533 加视线门（:66392/:66435/:30334 CanHitLine）。
    // 距门测点（备案项⑤）：407/613/423 分支以玩家中心为基准（:66361-66402
    // `Vector2 center = Main.player[owner].Center`;1456 :62416/:62433 同段），
    // 373/375（:66431 base.Center）与 533（:30333 base.Center）以随从为基准
    const ai62 = AI62_SHOOTERS.has(this.projId);
    const tgt = ai62
      ? this.nearestEnemy(game, 2000, 'line', AI62_PLAYER_TARGETING.has(this.projId) ? 'player' : 'self',
        6000)   // 集火门距 = num12×3 = 6000（:66327 num12=2000 + :66374 ×3;蓝队 R7-21）
      : this.projId === 533
        ? this.nearestEnemy(game, 2000, 'line')
        : this.nearestEnemy(game, MINION_SHOOT[this.projId]?.search
          ?? (MINION_SHOOT[this.projId] ? 1000 : 700));
    // 基础伤害（每 tick 按当前装备 live 重算 = Projectile.cs:15368；+armorPen）
    const dmg0 = Math.max(1, Math.round(this.damage * p.summonDamageMult)); // ⑥ pen 移 hit 时
    // ---- 旗舰家族分发（源码行号见各方法注释；先于通用运动）----
    if (this.projId >= 626 && this.projId <= 628) { this.dragonSegment(game, p, dmg0); return; }
    if (this.projId === 625) { this.dragonHead(game, p, dmg0); return; }
    if (this.projId === 831 || this.projId === 970) { this.counterHover(game, p, dmg0); return; }
    if (this.projId >= 833 && this.projId <= 835) { this.tigerBody(game, p, dmg0); return; }
    if (this.projId === 946) { this.terraprismaBody(game, p, dmg0); return; }
    if (this.projId === 755) { this.batOfLightBody(game, p, dmg0); return; }
    if (this.projId === 963) { this.abigailBody(game, p, dmg0); return; }
    // AI_062 五射手 1:1 速度曲线/随机冷却/射击门（:66067-67166,备案项①③）
    if (ai62) { this.ai62Step(game, p, dmg0, tgt); return; }
    // 地面步行族（备案项②）：蜘蛛 390-392（AI_026 flag7）/ 吸血蛙 758（AI_067 flag2）
    if (this.projId >= 390 && this.projId <= 392) { this.spiderStep(game, p, dmg0); return; }
    // 海盗三变体（台账批②）：AI_067 flag 步行链正轨（原"统一飞行"近似退役）
    if (this.projId >= 393 && this.projId <= 395) { this.pirateStep(game, p, dmg0); return; }
    if (this.projId === 758) { this.frogStep(game, p, dmg0); return; }
    if (this.projId === 623) { this.guardianBody(game, p, dmg0); return; }
    if (this.projId === 317) { this.ravenBody(game, p, dmg0); return; }
    if (this.projId === 533) this.deadlySpherePhase(game, p, tgt); // AI_066 相位机（自旋门 :28874）
    // Cool Whip 雪花哨兵 917（buff 312 维持）与 Cobwhip 蜘蛛 1036（buff 365 维持）：
    // 独立索敌 400/环绕，伤害吃 summonDamageMult
    // Foxparks 1094/1113 喷火态（PR:56081-56159 / 1457 :60064-60135：ai[0] 1000-1003
    // 每 4t 一发 1106；伤 = dmg（1456 :56133 ×0.75 → 1457 :60068 全额）×命中 0.85
    // (:12620)；OnFire 300t(:11002)；penetrate 4；寿命 72t/54t 后不伤——Arrow 无
    // extraUpdates，速度×3/life÷3 等价换算。1113 弹速 num17=10.5（:60074，1094=5）
    // → ×3=31.5；idStaticNPCHitCooldown=10（:60100）两型同）
    if ((this.projId === 1094 || this.projId === 1113) && this.foxChannel) {
      // 1456 :56111-56120（flag8=1094 喷火态）：direction=spriteDirection=
      // (velocity.X>0?1:-1)（vx==0 → player.direction :56112-56115）→
      // :56120 spriteDirection=-direction——喷火朝向反向贴图
      this.facing = -(Math.sign(this.foxAimX) || p.facing);
      if (++this.foxT % 4 === 1) {
        // ★R4 F3:1113 每 4 连发第 4 发 ai[1]=1（:62744-62752 localAI[2]<=-3 回卷,
        // num159=3→1）——1097 拆弹自爆门(Arrow ai[1]==1&&age>=30→Kill:58258)的
        // 激活注入面;1094 无此机制(1097 恒普通火球)
        const fourthShot = this.projId === 1113 && this.foxT % 4 === 0;
        const flameSpd = this.projId === 1113 ? 31.5 : 15; // num17 ×3 补偿（:60072/:60074）
        const flame = new Arrow(this.cx - 3, this.cy - 3, this.foxAimX * flameSpd, this.foxAimY * flameSpd,
          Math.max(1, Math.round(dmg0 * 0.85)), 0, 1106,
          { grav: 0, life: 24, pierce: 4 });
        // 命中火 buff:速度门 StatusNPC :11665-11668——velocity.Length()>10 →
        // OnFire3(323) else OnFire(24),300t 定值。★判门须用原版弹速(num17:1094=5/
        // 1113=10.5,:60072-60074),勿用本仓 ×3 补偿后速度(15/31.5 恒>10 会双双误翻)
        const origSpd = this.projId === 1113 ? 10.5 : 5;
        if (fourthShot) flame.foxAi1 = 1;
        flame.onFireHit = {
          buff: Math.hypot(this.foxAimX, this.foxAimY) * origSpd > 10 ? 323 : 24,
          minT: 300, maxT: 300,
        };
        // 喷火嘶声（Projectile.cs:38958）：1106 弹 whoAmI%3==0 才播——三发一门近似；
        // FoxparksFlame=Item_34 音量 0.15（SoundID.cs:1098）
        if ((this.foxFlameN = (this.foxFlameN + 1) % 3) === 1) {
          game.playSfxFiles(['Item_34'], 0.15, this.cx, this.cy);
        }
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(flame, 'projectiles');
      }
      return; // 喷火态跳过常规索敌/移动（position 锚玩家由 Game/悬停链处理近似）
    }
    // ---- 1457 禁戒魂灵 1119（6164 Forbidden Minion,aiStyle 206）----
    // AI_206_ForbiddenMinion（Projectile.cs:38182-38395）1:1 折算：
    //  · 悬停锚 = player.Top+(−dir×16,−25) + 群体环形偏移（:38195-38220,本仓
    //    slot 槽位近似 index/total）；距玩家 >2000 瞬移（:38194）
    //  · 索敌 800px + CanHitLine 门（:38199 Minion_FindTargetInRange + :38177
    //    CustomEliminationCheck）；有敌 → 朝敌 MoveTowards(200) + rotation 朝敌
    //  · 开火循环 ai[0]：归零且索敌 → 150;倒数到 120 发 1120 ForbiddenMinionShot
    //    （GemStaffFeatures FastThenSlow 位,32 速朝敌）+ 反冲 velocity=−dir×0.3
    //    （:38258-38277）;>120 段移速 ×Remap(ai0,150,120,1,0) 渐停（:38282-38286）
    if (this.projId === 1119) {
      const tgtF = this.nearestEnemy(game, 800);
      // 悬停锚（:38196 vec = player.Top + (−dir×16,−25) + 群体偏移）
      const orbA = this.age * 0.03 + this.slot * 1.7;
      let hx = p.cx - p.facing * 16;
      let hy = p.cy - p.h / 2 - 25 + Math.sin(orbA) * 10;
      if (tgtF) {
        // :38236-38244 朝敌 MoveTowards(200)+朝向/旋转
        const dx = tgtF.cx - this.cx, dy = tgtF.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        hx = tgtF.cx - dx / d * Math.max(0, d - 120);
        hy = tgtF.cy - dy / d * Math.max(0, d - 120);
        this.facing = tgtF.cx > this.cx ? 1 : -1;
        this.rot = Math.atan2(dy, dx) + (this.facing === -1 ? Math.PI : 0);
      } else {
        this.rot = 0;
        this.facing = p.facing;
      }
      // 开火循环（:38258-38286）：shootCd 复用 ai[0] 语义（150 归零→150;120 出弹）
      if (this.shootCd > 0) this.shootCd--;
      if (tgtF && this.shootCd === 0) this.shootCd = 150;
      if (tgtF && this.shootCd === 120) {
        const dx = tgtF.cx - this.cx, dy = tgtF.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const shot = new Arrow(this.cx - 5, this.cy - 5, dx / d * 32, dy / d * 32,
          Math.max(1, Math.round(dmg0)), this.knockback, 1120,
          { grav: 0, life: 300, pierce: 2, gem: { fastThenSlow: true } });
        shot.whipTagShot = true;   // MinionShot（ProjectileID.Sets.MinionShot[1120] :291）
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(shot, 'projectiles');
        this.vx = -dx / d * 0.3 * 32;   // :38276 velocity = −vector5×0.3（vector5=32 速向）
        this.vy = -dy / d * 0.3 * 32;
      }
      // 移动（:38282-38289）：v MoveTowards(锚向×16, 2);开火后段渐停
      const mdx = hx - this.cx, mdy = hy - this.cy;
      const mdl = Math.hypot(mdx, mdy) || 1;
      const spd = 16 * (this.shootCd > 120
        ? Math.max(0, 1 - (this.shootCd - 120) / 30) : 1);
      const tvx = mdx / mdl * Math.min(spd, mdl), tvy = mdy / mdl * Math.min(spd, mdl);
      this.vx += Math.max(-2, Math.min(2, tvx - this.vx));
      this.vy += Math.max(-2, Math.min(2, tvy - this.vy));
      this.x += this.vx; this.y += this.vy;
      if (Math.hypot(this.cx - p.cx, this.cy - p.cy) > 2000) {   // :38194 瞬移门
        this.x = p.cx; this.y = p.cy - 40;
      }
      this.contact(game, dmg0, 30);   // localNPCHitCooldown 30（:10452-10464）
      return;
    }
    // ---- 1457 帕鲁地面随从 1093/1112/1118（5663/6148/6161，AI_067 flag8/flag9 折算）----
    if (this.projId === 1093 || this.projId === 1112 || this.projId === 1118) { this.palGroundStep(game, p, dmg0); return; }
    // ---- Dead Cells 蘑菇小伙伴 1022（5456，AI_067 flag6 折算；爆点→弹 1044）----
    if (this.projId === 1022) { this.mushBoiStep(game, p, dmg0); return; }
    if (this.projId === 917 || this.projId === 1036) {
      // 生命与玩家 buff 绑定（AI_177 :42468：coolWhipBuff/cobWhipBuff → timeLeft=2 续命）
      if (!p.whipBuffs[this.projId === 917 ? 312 : 365]) { this.dead = true; return; }
      // 917 雪花 wobble：rotation = vx*0.0125（AI_177 :42571 旋转制不翻转）
      if (this.projId === 917) this.rot = this.vx * 0.0125;
      const tgt = this.nearestEnemy(game, 400);
      if (tgt) {
        const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
        this.vx = (tgt.cx - this.cx) / d * 5;
        this.vy = (tgt.cy - this.cy) / d * 5;
        this.facing = Math.sign(tgt.cx - this.cx) || this.facing;
      } else {
        const hx = p.cx - p.facing * 30 + Math.cos(this.age * 0.05 + this.slot) * 24;
        const hy = p.cy - 40 + Math.sin(this.age * 0.05 + this.slot) * 16;
        const dx = hx - this.cx, dy = hy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const spd = Math.min(4, d * 0.08);
        this.vx = (dx / d) * spd;
        this.vy = (dy / d) * spd;
        this.facing = p.facing;
      }
      // ★水中位移阻尼（:17721 湿支只对 tileCollide=true 宿主跑）：1036 SetDefaults
      //  无 tileCollide 行（:9769-9780）=缺省 true → 湿档削位移;917 显式
      //  tileCollide=false（:8708）→ 湿阻尼块不跑,恒全速（留锚）
      const dfWhip = this.projId === 1036 ? projWaterDragFactor(this) : 1;
      this.x += this.vx * dfWhip;
      this.y += this.vy * dfWhip;
      this.contact(game, dmg0, 20); // armorPen 30（:9494）由 contact 内 pen0 两源通道结算
      return;
    }
    if (!this.ground) {
      // 飞行：无目标 → 环形槽位悬停玩家侧后；有目标 → 俯冲
      if (tgt) {
        const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 5;
        this.vy = (dy / d) * 5;
      } else if (this.projId === 387 || this.projId === 388) {
        // 双子专属悬停（AI_66 :28790-28860）：锚点 = 玩家中心+(0,-60)；距锚
        // >70px 才有阻尼趋近（v=(v×15+dir×spd)/16，spd 跟随玩家速度链），≤70px
        // 【无任何驱动力】——这是互斥自由区，±0.05/t 的互推累积把两眼分开到
        // 曼哈顿 ~40px 并保持（通用槽位硬弹簧会压回互斥，曾致两眼恒叠）
        const hx = p.cx, hy = p.cy - 60;
        const dx = hx - this.cx, dy = hy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 70) {
          const spd = Math.max(15, Math.abs(p.vx) + Math.abs(p.vy));   // :28806-28814
          this.vx = (this.vx * 15 + (dx / d) * spd) / 16;
          this.vy = (this.vy * 15 + (dy / d) * spd) / 16;
        } else if (this.vx === 0 && this.vy === 0) {
          this.vx = -0.15; this.vy = -0.05;                            // :28846-28849
        }
        if (Math.hypot(this.vx, this.vy) > 15) { this.vx *= 0.95; this.vy *= 0.95; }  // :28853-28856
      } else {
        const hoverAng = this.slot * Math.PI * 0.5;
        const hx = p.cx - p.facing * 36 + Math.cos(hoverAng) * 22;
        const hy = p.cy - 30 + Math.sin(hoverAng) * 18;
        const dx = hx - this.cx, dy = hy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const spd = Math.min(4, d * 0.08);
        this.vx = (dx / d) * spd;
        this.vy = (dy / d) * spd;
      }
      // 双子互斥（AI_66 :28514-28539）：同主另一只双子（387/388）曼哈顿距 <
      // 判定盒宽(40) → 双轴速度各互推 ±0.05/t——原版两只眼不叠在一起的本体机制。
      // 精确同位（成对出生同点）时按 id 决胜一侧，防对称死锁（原版靠浮点噪声散开）
      if (this.projId === 387 || this.projId === 388) {
        for (const ent of (game as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles) {
          const o = ent as MinionProj;
          if (!(o instanceof MinionProj) || o === this || o.dead) continue;
          if (o.projId !== 387 && o.projId !== 388) continue;
          if (o.ownerRef() !== p) continue;                  // 同主
          if (Math.abs(this.x - o.x) + Math.abs(this.y - o.y) >= this.w) continue;
          const ltx = this.x < o.x || (this.x === o.x && this.id < o.id);
          const lty = this.y < o.y || (this.y === o.y && this.id < o.id);
          this.vx += ltx ? -0.05 : 0.05;
          this.vy += lty ? -0.05 : 0.05;
        }
      }
      // ★水中位移阻尼（HandleMovement :17721-17764 湿支;湿段 tick 头已刷新当拍旗,
      // 速度场不减只削位移;域外 id 无湿段 → 四旗恒 false → 档恒 1 数值不变）
      const dfFly = projWaterDragFactor(this);
      this.x += this.vx * dfFly;
      this.y += this.vy * dfFly;
      // 回收（1456 AI_062 :62786-62790：num35>2000 → 瞬移回玩家中心；曾写 >1300）
      if (Math.hypot(this.cx - p.cx, this.cy - p.cy) > 2000) {
        this.x = p.cx - p.facing * 30;
        this.y = p.cy - 30;
      }
    } else {
      // 地面：重力+碰撞追击
      if (tgt) {
        this.vx += Math.sign(tgt.cx - this.cx) * 0.12;
        this.vx = Math.max(-3.5, Math.min(3.5, this.vx));
        if (this.onGround && tgt.cy < this.cy - 24 && Math.random() < 0.03) this.vy = -5; // 小跳追高
      } else {
        this.vx *= 0.9;
        // 跟随玩家（距离大时小跑）
        const dx = p.cx - this.cx;
        if (Math.abs(dx) > 60) this.vx = Math.max(-2.5, Math.min(2.5, dx * 0.02));
      }
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      // ★水中位移阻尼（HandleMovement :17721-17764 湿支;湿段 tick 头已刷新当拍旗;
      // 域外 id 无湿段 → 四旗恒 false → 档恒 1 数值不变）
      const dfGnd = projWaterDragFactor(this);
      moveAndCollide(this, game.world, this.vx * dfGnd, this.vy * dfGnd);
    }
    // 朝向（AI_062 :62983-62990：velocity.X>0 → spriteDirection=-1——贴图朝左，
    // 右行才翻转 = facing 取 -sign(vx)；963 阿比盖尔特判 ×-1 自带朝右贴图已在其
    // 专属分支）。原版在移动后的 FindFrame 取 velocity——故置于移动段之后。
    // AI_026/164 族（俾格米/宝宝史莱姆/蜘蛛/计数器/Foxparks）零 spriteDirection
    // 赋值恒不翻——渲染端 MINION_NO_FLIP 表承接
    {
      const dirX = Math.sign(this.vx);
      if (dirX !== 0) this.facing = AI62_LEFT_ART.has(this.projId) ? -dirX : dirX;
    }
    // 旋转制族：双子 387/388 rotation = velocity.ToRotation()+π（:28859-28861/
    // :28864-28868——贴图朝左 +π 补偿；387 交战中朝 LOS 目标 :28867）；
    // 533 致命球滚动 rotation += vx*0.04——仅 ai[0]<3 || ≥9（:28874-28877，
    // 3-8 冲刺段不自旋，相位机见 deadlySpherePhase）
    if (this.projId === 387 || this.projId === 388) {
      let ang = Math.atan2(this.vy, this.vx);
      if (this.projId === 387 && tgt
        && canHit(game.world.store, this.x, this.y, this.w, this.h, tgt.x, tgt.y, tgt.w, tgt.h)) {
        ang = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
      }
      this.rot = ang + Math.PI;
    } else if (this.projId === 533) {
      if (this.dA0 < 3 || this.dA0 >= 9) this.rot += this.vx * 0.04;
    }
    // 远程射击（AI_062/AI_026/aiStyle66 射击族：射程门内且冷却好 → 朝目标发射专属弹幕）。
    // 俾格米掷矛带 ±20px 随机抖动（AI_026 :62710 rand(-20,21)/rand(-20,20)）+ Y 抛物线
    // 预瞄（备案项④：num155=|含抖动Δx|×0.1×Next(0,100)×0.001,从 Δy 反向抵消重力下坠
    // :62713-62720;1456 :58766-58767 同段）；射击与接触伤害并存（原版随从移动中也带
    // 接触判定）。AI_062 五族不再走本块（ai62Step 原版冷却/门距接管）
    const shooter = MINION_SHOOT[this.projId];
    if (tgt && shooter) {
      if (this.shootCd > 0) this.shootCd--;
      else {
        // 射击门距离面（终清波批）：AI_026 flag10 族=曼哈顿 + 40×slot 档位加成
        // （:62691 num139<800+num134）；其余族保持欧氏（AI_062 门距/通用档）
        const d = shooter.metric === 'manhattan'
          ? Math.abs(tgt.cx - this.cx) + Math.abs(tgt.cy - this.cy)
          : Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy);
        const range = (shooter.range ?? 700) + (shooter.rangeSlot ?? 0) * this.slot;
        // 门界比较（终零波 M4 对账）：AI_026 flag10 族原文是【严格 <】
        // （:62691 num139<800f+num134）——旧实现 ≤ 会把恰等于门距的敌多放一枪。
        // 恰值只发生在曼哈顿距离整数落点,以 metric 键区分,欧氏族维持既有面
        const inRange = shooter.metric === 'manhattan' ? d < range : d <= range;
        // AI_026 flag10 族出手前 Collision.CanHit 本体盒→敌盒（num141 面,
        // :62631-62656 双轨检索只在 CanHit 候选置 num141;无视线不出手）
        if (shooter.throwLos
          && !canHit(game.world.store, this.x, this.y, this.w, this.h, tgt.x, tgt.y, tgt.w, tgt.h)) return;
        // 387 双子激光眼需视线（:28982 CanHitLine 门；AI_062 五族无此门）
        if (this.projId === 387 && !canHit(game.world.store, this.x, this.y, this.w, this.h, tgt.x, tgt.y, tgt.w, tgt.h)) return;
        if (inRange) {
          this.shootCd = shooter.cd ?? 60;
          const j = shooter.jitter ?? 0;
          const ax = tgt.cx + (Math.random() * 2 - 1) * j - this.cx;
          let ay = tgt.cy + (Math.random() * 2 - 1) * j - this.cy;
          if (shooter.precallY) {
            // :62713-62714 num155 = |num154|×0.1×Next(0,100)×0.001（num154 含 X 抖动）
            ay -= Math.abs(ax) * 0.1 * Math.floor(Math.random() * 100) * 0.001;
          }
          const al = Math.hypot(ax, ay) || 1;
          const dmg = Math.max(1, Math.round(dmg0 * (shooter.dmgMul ?? 1)));
          // 出弹锚点 = 本体 Center + 表内 muzzleY（NewProjectile @Center，:28977-
          // 38981/:63209；俾格米/Foxparks AI_026 有 -8/-10 手部高度 :58764/:58784）
          // → 弹体左上角 = 锚点 − 弹型判定盒/2（曾写死 -5 按 10×10 假设：389 激光
          // 4×4 → 恒偏左上 3px；376 火球 12×12/614 细胞弹 16×16 各有偏差）
          const ps = projectileData(shooter.shot);
          const hw = (ps?.width ?? 10) / 2, hh = (ps?.height ?? 10) / 2;
          const ay0 = this.cy + (shooter.muzzleY ?? 0);
          const shot = new Arrow(this.cx - hw, ay0 - hh, (ax / al) * shooter.speed, (ay / al) * shooter.speed,
            dmg, this.knockback, shooter.shot, { grav: shooter.grav ?? 0, life: shooter.life ?? 1200 });
          shot.whipTagShot = true; // MinionShot 吃鞭 tag（WhipTagEffect.cs:73-84）
          // 1097 火球命中按生成侧 ai[1] 分档（Projectile.cs:11315-11318）：ai[1]>0 →
          // OnFire3(323) 300-600t / 否则 OnFire(24)——1094 ai[1]=0 恒火、1113 ai[1]=3/1
          // 地狱火（:62744-62752 num159）
          if (shooter.burn === 'fire') shot.onFireHit = { buff: 24, minT: 300, maxT: 599 };   // ★R1:Next(300,600)=[300,599]
          else if (shooter.burn === 'hellfire') shot.onFireHit = { buff: 323, minT: 300, maxT: 599 };
          const shotSfx = MINION_SHOT_SFX[shooter.shot];
          if (shotSfx) game.playSfxFiles(soundTrackFiles(shotSfx.track), shotSfx.vol, this.cx, this.cy);
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(shot, 'projectiles');
        }
      }
    }
    // 接触伤害（tag + TagCrit 语义见 contact()）。★台账批③：统一 20t 私表退役——
    // 冷却走 CONTACT_CD_TABLE 三态解析：双子 387/388 = idStatic 16/12（:4714/:4730）、
    // 致命球 533 = local 12（:6008）、其余（俾格米 191-194/Foxparks 1094·1113/
    // 乌鸦外通用飞行族等）= 原版缺省 -2 → 吃玩家全局免工件窗
    // （Projectile.cs:466 缺省 + Damage_PVE_Inner immune[owner] 门 :12636）
    this.contact(game, dmg0);
    // ★BJ235 残影记录（UpdateTrails :17198——Damage 后同序;无记录式 id 环=null 短路）
    this.recordGhostTrail();
    // 玩家死亡/过远不消失（原版随从持续到上限驱逐或卸装）——仅跟随
    void TILE;
  }

  /** 同伴方块 653（AI_067 的 light-pet 路径,Projectile.cs 1:1）：
   *  · 生命期（:46657-46662）：buff 191 活 → 续命；玩家死/无 buff → 消失
   *  · 特殊段（:46804-46860）：rot+=vx/20；岩浆内 lai0++（≥20 且尖叫冷却归零 →
   *    NPCDeath59/61 叫一声,冷却 3600t）；全黑（自身+玩家格光照 <0.15）lai1++ 否则
   *    递减（钳 -3600..120）；超过阈值 且玩家静止/无无敌 → 1/5 尖叫(Item16)否则
   *    捅人 Hurt(3, ByOther(6)) + 无敌帧清零（免疫穿透）——死因 DeathText.Stabbed
   *  · 跟随（:47407+/47055+）：vector=玩家中心；>300px 或 |dy|>300 → ai0=1 悬浮直飞
   *    （tileCollide=false,加速 0.2,近主 <200 且主落地且头顶净空 → 回地面态）；
   *    地面态：贴主（|dx|<150 摩停下,rot→0）否则水平加速 0.5/上限 4(玩家速钳制),
   *    |vx|>3 触发跳跃,目标高出 48px 按距离表起跳（-6..-16）,湿身 vy×2 */
  private companionCubeStep(game: import('./types').GameHooks): void {
    const owner = this.ownerRef();
    const w = game.world;
    const st = w.store;
    // ---- 生命期（:46657-46662 companionCube 旗= buff 191）----
    if (!owner || owner.dead || !owner.buffs.has(BuffType.CompanionCube)) { this.dead = true; return; }
    this.w = 30; this.h = 30; // SetDefaults（:6733-6741）

    // ---- 特殊段（:46804-46860）----
    this.cubeRot += this.vx / 20;
    if (MinionProj.cubeScreamCd > 0) MinionProj.cubeScreamCd--;
    // 岩浆计数（:46812-46827）
    const cti = st.idx(Math.floor(this.cx / 16), Math.floor(this.cy / 16));
    if (st.liquid[cti] > 0 && st.liquidType[cti] === 2) this.cubeLai0++;
    else this.cubeLai0--;
    this.cubeLai0 = Math.max(0, Math.min(20, this.cubeLai0));
    if (this.cubeLai0 >= 20 && MinionProj.cubeScreamCd === 0) {
      MinionProj.cubeScreamCd = 3600;
      game.playSfxFiles([Math.random() < 0.1 ? 'NPC_Killed_61' : 'NPC_Killed_59'], 1, this.cx, this.cy);
    }
    // 黑暗捅人（:46835-46860——仅本地玩家侧）----
    const lit: { c: number; p: number } = (() => {
      const lg = (game as unknown as { lighting?: { lightAt: (tx: number, ty: number) => [number, number, number] } | null }).lighting;
      if (!lg) return { c: 1, p: 1 }; // 无光照引擎(探针)视作亮,不触发
      const at = (wx: number, wy: number) => {
        const [r, g, b] = lg.lightAt(Math.floor(wx / 16), Math.floor(wy / 16));
        return Math.hypot(r, g, b) / 255; // Lighting.GetColor().ToVector3().Length()
      };
      return { c: at(this.cx, this.cy), p: at(owner.cx, owner.cy) };
    })();
    if (lit.c < 0.15 && lit.p < 0.15) this.cubeLai1++;
    else if (this.cubeLai1 > 0) this.cubeLai1--;
    this.cubeLai1 = Math.max(-3600, Math.min(120, this.cubeLai1));
    const pSpeed = Math.abs(owner.vx) + Math.abs(owner.vy);
    if (this.cubeLai1 > 30 + Math.floor(Math.random() * 90) && owner.iframes <= 0 && pSpeed === 0) {
      if (Math.random() < 0.2) {
        game.playSfxFiles(['Item_16'], 1, this.cx, this.cy);
        this.cubeLai1 = -600;
      } else {
        game.playSfxFiles(['Item_1'], 1, this.cx, this.cy);
        owner.lastDamageCause = { kind: 'stabbed' };
        owner.damage(3, this.cx, this.cy, false);
        owner.iframes = 0; // :46857-46858 immune=false/immuneTime=0（穿透无敌）
        this.cubeLai1 = -300 - Math.floor(Math.random() * 30) * 10;
      }
    }

    // ---- 跟随核心（light-pet 族,flag12=false 路径）----
    let vx = this.vx, vy = this.vy;
    const pcx = owner.cx, pcy = owner.cy;
    const dpx = pcx - this.cx, dpy = pcy - this.cy;
    const distP = Math.hypot(dpx, dpy);
    if (distP > 2000) { // :47414 超远直传
      this.x = pcx - this.w / 2; this.y = pcy - this.h / 2;
      vx = 0; vy = 0;
    }
    // 目标（:46718 vector=player.Center;653 仅覆写 X=player.Center.X=同值）
    let tx = pcx, ty = pcy;
    if (this.cubeA0 === 0) {
      if (distP > 300 || Math.abs(dpy) > 300) { this.cubeA0 = 1; } // :47413 num3/num4=300
    } else {
      // ---- 悬浮归位态 ai0=1（:47050-47160）----
      // tileCollide=false；加速 0.2 逼近;近主 <200 且主落地且自身净空 → 回地面态
      if (distP < 200 && owner.vy === 0 && this.y + this.h <= owner.y + owner.h
        && !st.isSolid(Math.floor(this.cx / 16), Math.floor(this.cy / 16))) {
        this.cubeA0 = 0;
        if (vy < -6) vy = -6;
      }
      if (distP >= 60) {
        const num19 = Math.max(10, pSpeed);
        const spx = (dpx / (distP || 1)) * num19, spy = (dpy / (distP || 1)) * num19;
        const acc = 0.2, acc15 = acc * 1.5;
        if (vx < spx) { vx += acc; if (vx < 0) vx += acc15; }
        else if (vx > spx) { vx -= acc; if (vx > 0) vx -= acc15; }
        if (vy < spy) { vy += acc; if (vy < 0) vy += acc15; }
        else if (vy > spy) { vy -= acc; if (vy > 0) vy -= acc15; }
      } else {
        this.cubeLai0 = 0; // :47088 近主清零（与岩浆计数共用槽）
      }
      if (vx !== 0) this.facing = vx > 0 ? 1 : -1;
      this.x += vx; this.y += vy;
      this.vx = vx; this.vy = vy;
      return;
    }
    // ---- 地面态 ai0=0（:47407+/47536+）----
    // 目标下探（:47458-47465 最多 20 格找地面）
    for (let k = 0; k < 20; k++) {
      if (st.isSolid(Math.floor(tx / 16), Math.floor(ty / 16))) break;
      ty += 16;
    }
    // 目标视线截断（:47468 TileCollision 5% 步进近似——遇实心停在墙前）
    {
      const dx = tx - pcx, dy2 = ty - pcy;
      let nx = pcx, ny = pcy;
      for (let t = 0.05; t <= 1.001; t += 0.05) {
        const sx = pcx + dx * t, sy = pcy + dy2 * t;
        if (st.isSolid(Math.floor(sx / 16), Math.floor(sy / 16))) break;
        nx = sx; ny = sy;
      }
      tx = nx; ty = ny;
    }
    const dtx = tx - this.cx, dty = ty - this.cy;
    const distT = Math.hypot(dtx, dty);
    // :47446 贴身且玩家更近 → 以自身为锚（防抖）
    if (distT < 32 && distP < distT) { tx = this.cx; ty = this.cy; }
    // 水平步进参数（:47496-47537 num34/35/36/37）
    let acc = 0.5, vmax = 4, clamp = 4, accSlow = 0.1;
    {
      const ps = Math.abs(owner.vx) + Math.abs(owner.vy);
      if (ps > 0 && ps < clamp) clamp = ps; // 653 特例（:47536-47543）
    }
    const num41 = tx - this.cx;
    let jumpGate = false;
    if (Math.abs(num41) < 150) { // 653 贴靠（:47589-47595）
      // rotation → 0（AngleTowards 0.2）
      this.cubeRot = angleTowards(this.cubeRot, 0, 0.2);
      vx *= 0.9;
      if (Math.abs(vx) < 0.1) vx = 0;
    } else if (Math.abs(num41) > 5) { // :47597-47610
      if (num41 < 0) { vx -= (vx > -vmax ? acc : accSlow); if (num41 < 0 && vx > 0) vx -= accSlow; }
      else { vx += (vx < vmax ? acc : accSlow); if (num41 > 0 && vx < 0) vx += accSlow; }
      if (Math.abs(vx) > 3) jumpGate = true; // :47695 653 跳跃门
    } else {
      vx *= 0.9;
      if (Math.abs(vx) < acc * 2) vx = 0;
    }
    vx = Math.max(-clamp, Math.min(clamp, vx));
    if (vx !== 0) this.facing = vx > 0 ? 1 : -1;
    // 重力 + 碰撞（tileCollide=true）
    vy = Math.min(vy + 0.3, MAX_FALL_SPEED);
    this.vx = vx; this.vy = vy;
    moveAndCollide(this, w, vx, vy);
    const onGround = this.onGround;
    if (onGround && vy === 0) {
      // 跳跃梯（:47751-47760 按 2/5 格上方障碍选 -5.1..-11.1）
      if (jumpGate) {
        const fx = Math.floor((this.x + this.w / 2) / 16) + this.facing + Math.round(vx);
        const fy = Math.floor((this.y + this.h / 2) / 16);
        const solid = (oy: number) => st.isSolid(fx, fy + oy);
        if (!solid(-1) && !solid(-2)) this.vy = -5.1;
        else if (!solid(-2)) this.vy = -7.1;
        else if (solid(-5)) this.vy = -11.1;
        else if (solid(-4)) this.vy = -10.1;
        else this.vy = -9.1;
      }
      // 目标高出 48px → 距离表起跳（:47765-47808）
      if (ty - this.cy < -48) {
        const d = -(ty - this.cy);
        this.vy = d < 60 ? -6 : d < 80 ? -7 : d < 100 ? -8 : d < 120 ? -9
          : d < 140 ? -10 : d < 160 ? -11 : d < 190 ? -12 : d < 210 ? -13
          : d < 270 ? -14 : d < 310 ? -15 : -16;
      }
    }
  }

  draw(r: import('../render/Renderer').Renderer): void {
    // 世界坐标绘制（Renderer 实体循环在世界变换内）——投射物贴图懒加载通道同 Arrow。
    // 原版投射物贴图是竖向多帧行（projFrames 表）：按帧高切片，1:1 像素尺寸。
    // 爆炸烈焰塔走 AI_130 帧状态机（待机帧 0 / 开火帧 1-6 每 4t），其余哨兵/随从
    // age/8 匀速循环；哨兵按 facing 翻转（原版 spriteDirection）
    const ctx = r.ctx;
    if (!ctx) return;
    // ★SW-FX6 2026-09-10 债⑥清偿：831 虎宝石/970 阿比盖尔计数器 = vanilla hide=true
    //  （Projectile.cs:8082/:9197,SetDefaults aiStyle=164 计数器弹）→ 主循环
    //  hide 门整支跳过（Main.cs:22404-22406 `if (!active || type<=0 || hide ||
    //  drawLayer!=0) continue`）=【隐形计数器】:AI_164 照跑（环绕/召唤本体
    //  838/963 等）,只是本体弹从不绘制。本仓旧刻意渲染 12×12 宝石+环绕 AI
    //  （语义分叉,BJ16 §4⑥ 留裁决）——本批按原版落 hide（裁决记录见
    //  docs/audit/summon-draw-branch-registry-2026-09-07.md 与 SW-FX6 报告）。
    //  行为锁 = tests/sw-fx6-draw-debt-closure.test.ts（摘本支应红）。
    if (this.projId === 831 || this.projId === 970) return;
    // ★清偿刀 N（2026-09-30）：弹幕染料（GetProjectileDesiredShader 1:1,通道解析见
    //  minionDyeVid 注）——EntitySpriteDraw×Armor.Apply 等价=逐贴图过 SM2 pass。
    //  dFrameImg=帧裁切面（t0Rect=原片内矩形,渐变族 T0 与 vanilla 同源）;
    //  dSheetSub=整片/子矩形面。残影 gimg 按整片染（渐变族 T0 相位近似,登记债）。
    const dyeVid = this.minionDyeVid();
    const dyeOpt = {
      facing: this.facing >= 0 ? 1 : -1,
      box: { x: this.x, y: this.y, w: this.w, h: this.h },
      lightAt: r.lighting?.lightAt?.bind(r.lighting) ?? null,
    };
    const dFrameImg = (id: number, fr: number): HTMLCanvasElement | null => {
      const base = projFrameImg(id, fr);
      if (!base || !(dyeVid > 0)) return base;
      const rect = projFrameSrcRect(id, fr);
      const sheet = rect ? projSprite(id) : null;
      const dyed = dyedProjCanvas(base, 0, 0, base.width, base.height, dyeVid,
        rect && sheet
          ? { ...dyeOpt, t0Rect: { sx: rect.sx, sy: rect.sy, sheetW: sheet.width, sheetH: sheet.height } }
          : dyeOpt);
      return dyed ?? base;
    };
    type ProjTex = NonNullable<ReturnType<typeof projSprite>>;
    type DrawTex = ProjTex | HTMLCanvasElement;
    const dSheetSub = (sheet: ProjTex, sx: number, sy: number, sw: number, sh: number): DrawTex => {
      if (!sheet || !(dyeVid > 0)) return sheet;
      return dyedProjCanvas(sheet, sx, sy, sw, sh, dyeVid, dyeOpt) ?? sheet;
    };
    const frames = projFrameCount(this.projId);
    let frame: number;
    if (this.projId === 623) {
      // AI_120 帧选（★BJ157⑧）：2=攻击 12-19 直引 / 1=rest 坐姿 0-14 直引（gFrame
      // 即原版 projectile.frame,9t 一翻 :45642-45648）/ 其余行走 0-7（%8 与直引同相）
      frame = this.gA0 === 2 || this.gA0 === 1 ? this.gFrame : this.gFrame % 8;
    } else if (this.projId === 317) {
      // AI_054：4fc 循环（0-3 飞 / 4-7 扑，:27543-27594）
      frame = (this.ravenZone === 1 ? 4 : 0) + (Math.floor(this.age / 4) % 4);
    } else if (this.sentry && FLAMEBURST_TOWER.has(this.projId)) {
      frame = this.sFire === 1 ? 1 + Math.floor(this.sFireT / 4) : 0;
    } else if (this.sentry && BALLISTA_TOWER.has(this.projId)) {
      frame = this.sFire === 1 ? 1 + Math.floor(this.sFireT / 5) : 0;
    } else if (this.sentry && TRAP_TOWER.has(this.projId)) {
      frame = Math.floor(this.age / 12) % frames; // AI_138 frameCounter 12t 连续循环
    } else if (this.projId === 1098 || this.projId === 1123) {
      // 钻地龟（AI_204）：帧由 digtoiseStep 直写（0-2 出场/待机、2-9 挖掘循环、
      // 10 停用——projFrames 11 帧表 Main.cs:8696-8700 段）
      frame = Math.min(this.digFrame, Math.max(0, frames - 1));
    } else if (this.projId >= 390 && this.projId <= 392) {
      // 蜘蛛步行链帧通道（AI_026 :65092-65220）：0-2 走 / 3 空 / 4-7 爬墙
      frame = Math.min(this.spFrame, Math.max(0, frames - 1));
    } else if (this.projId === 1093 || this.projId === 1112 || this.projId === 1118) {
      // 帕鲁地面随从（AI_067 flag8=1093||1112/flag9）：palGroundStep 原版帧机直写
      frame = Math.min(this.palFrame, Math.max(0, frames - 1));
    } else if (this.projId === 1022) {
      // 蘑菇小伙伴（AI_067 flag6 :51642-51681）：mushBoiStep 原版帧机直写
      frame = Math.min(this.mushFrame, Math.max(0, frames - 1));
    } else if (this.projId === 963) {
      // 阿比盖尔一阶（AI_062 963 档 :66843-66868）：abigailBody 帧机直写
      frame = Math.min(this.a963Frame, Math.max(0, frames - 1));
    } else if (this.projId >= 393 && this.projId <= 395) {
      // 海盗随从（AI_067 flag 帧段直写 :50866/:51802）：走 0-3 / 立 0 / 空中 14 /
      // 扑击 4..6(+3 空中=7..9)；state1 归位飞行与 state5 追离不更新 = 冻结
      // （原版同语义——旧 age/8 匀速兜底扫遍 15 帧 = 扑击窗仍换跑图,M2 清偿）
      frame = Math.min(this.pirFrame, Math.max(0, frames - 1));
    } else if (MINION_FRAMES[this.projId]) {
      // 帧表族（源码各 AI 提取）：每帧 tick 循环帧表；
      // 小鬼 375 攻击帧门 = ai[1]∈(0,24)（:66910-66913——a62A1 冷却计数器直读,
      // 曾用 attackFlash 接触闪近似）；余族 attackFlash（接触闪）
      const [tickPer, count, atkOff] = MINION_FRAMES[this.projId];
      frame = Math.floor(this.age / tickPer) % count;
      if (atkOff && (this.projId === 375
        ? (this.a62A1 > 0 && this.a62A1 < 24) : this.attackFlash > 0)) frame += atkOff;
    } else if (this.projId === 1094 || this.projId === 1113) {
      // 火绒狐帧态机（AI_026 flag8 帧段 :64729-64826 折算,foxAnimTick 每 tick 维护）。
      // 贴图 = 6 列×9 行网格（1457 Main.cs:33734-33737 X=(frame/9)*64、
      // Y=(frame%9)*46、62×44）——切片在 Arrow PROJ_GRID,projFrames 表无此二型
      frame = this.foxFrame;
    } else {
      frame = frames > 1 ? Math.floor(this.age / 8) % frames : 0;
    }
    const img = dFrameImg(this.projId, frame);
    // ---- ★BJ235 随从通用残影（Main.cs:30609-31400 通用表;原版残影块先于本体绘制）——
    //      533 致命球（ai0 三态冲刺档 :31084-31098,dA0 直喂）/ 755 血蝙蝠（Crimson 特支
    //      :31190-31192）/ 833-835 沙漠虎（速度染+底心锚帧门 :30706-30721/:31307-31314）。
    //      ghostRing 非空才有记录式——其余随从 id mode=-1 短路零开销。 ----
    if (this.ghostRing) {
      const gRaw = projSprite(this.projId);
      const gimg = gRaw && dyeVid > 0
        ? (dyedProjCanvas(gRaw, 0, 0, gRaw.width, gRaw.height, dyeVid, dyeOpt) ?? gRaw)
        : gRaw;   // 残影整片染（渐变族 T0 相位近似,登记债）
      if (gimg && gimg.width > 0) {
        drawProjGhosts(ctx, {
          ring: this.ghostRing,
          id: this.projId,
          tex: gimg,
          frames: projFrameCount(this.projId),
          frame,
          bodyW: this.w, bodyH: this.h,
          bodyRot: this.rot,
          bodyScale: 1,
          bodyAlpha: this.alphaFade > 0 ? Math.max(0, (255 - this.alphaFade) / 255) : 1,
          ai0: this.projId === 533 ? this.dA0 : 0,
          ai1: 0,
          timeLeft: 3600,
          opacity: 1,
          vxLen: Math.hypot(this.vx, this.vy),
          spriteDirection: this.facing >= 0 ? 1 : -1,
        });
      }
    }
    // ---- ★三轮蓝队 F5①：爆炸烈焰塔 663/665/667 半帧专绘（Main.cs:34075-34086）----
    // 原版帧内是【左右两半镜像塔身】（rectangle23.Width/=2 后按 ai[2] 选半——ai[2]==1
    // 哨兵背包携行态取右半,已接,见下方 sx）；锚 = Bottom 系：
    // draw pos=BoxBottom、origin=(半宽/2, 半高−4) ⇒ 贴图底 4px 探出盒底。旧通用路径
    // 以整宽帧(74/96/92px)从盒顶左落锚=双影横排+整体偏下（放大前后视觉差最重一档）。
    if (this.sentry && FLAMEBURST_TOWER.has(this.projId)) {
      const sheet = projSprite(this.projId);
      if (sheet) {
        const framesN = Math.max(1, frames);
        const fh = sheet.height / framesN;
        const halfW = Math.floor(sheet.width / 2);
        // 帧内左右两半镜像塔身：ai[2]==0 取左半、==1（哨兵背包携行）源矩形 X 右移
        // 半宽取右半（Main.cs:34080-34083 `rectangle23.Width /= 2; if (ai[2]==1f)
        // rectangle23.X += rectangle23.Width;`——此前携行不建模恒取左半）
        const sx = this.carriedByBackpack ? halfW : 0;
        const sy = Math.round(frame * fh);   // 与 projFrameImg round 语义同源
        const dsub = dSheetSub(sheet, sx, sy, halfW, fh);
        ctx.save();
        if (this.alphaFade > 0) ctx.globalAlpha = Math.max(0, (255 - this.alphaFade) / 255);
        // 炮向翻转：AI_130 首帧 direction=spriteDirection=player.direction（:69340）——
        // 原版由 SpriteEffects 镜像；本仓 scale(-1,1) 绕锚镜像,源半恒取左半
        ctx.translate(this.cx, this.cy + this.h / 2);
        if (this.facing < 0) ctx.scale(-1, 1);
        ctx.imageSmoothingEnabled = false;
        if (dsub !== sheet) ctx.drawImage(dsub as CanvasImageSource,
          0, 0, halfW, fh,
          -halfW / 2, -(fh - 4), halfW, fh);              // origin=(半宽/2, 半高−4)
        else ctx.drawImage(sheet as CanvasImageSource,
          sx, sy, halfW, fh,
          -halfW / 2, -(fh - 4), halfW, fh);              // origin=(半宽/2, 半高−4)
        ctx.restore();
        return;
      }
    }
    // ---- ★T9（2026-09-01）：弩车族 677/678/679 专绘（Main.cs:34097-34137 1:1，
    //      锚/origin 缺省 = :33695/:33787、dir 缺省 = :30529-30532、公共尾绘 :34212）----
    // 原版本族 = 塔座 Extra_83/84/85 + 本体帧两贴图叠绘；分支头 `dir ^=
    // FlipHorizontally | FlipVertically`（:34099-34103）即 B2γ 登记的「双轴镜像背面
    // 朝向」正身：
    //  · dir 组合：缺省 None；spriteDirection==-1 先 FlipHorizontally（:30531），
    //    分支头 XOR(FlipH|FlipV) ⇒ 净 FlipVertically（1^3=2）——XNA SpriteBatch 顶点
    //    序 world = T·R(θ)·F·(p−o)（镜像先于旋转），AI_134 朝左时 rotation≈π
    //    （落位 :69614 / 待机归位 :69645）⇒ R(π)·FlipV = 纯水平镜像 + 随瞄准角
    //    连续偏转 = 「背面朝向」。canvas 同序等价：translate(anchor) → rotate(rot)
    //    → scale(1,-1)（scale 施于旋转前局部系）。旧 scale(-1,1) 单轴式仅在
    //    rot==0 时恰同净效果；rot≠0 时镜像轴错（本仓 rot 已随 T9 接 AI_134 状态机）。
    //  · 塔座（:34105-34116）：position=proj.Bottom、origin=(w/2, h−2)、rotation=0、
    //    effects = dir&FlipH【两侧恒 None】⇒ 塔座永不镜像；ai[2]==1（哨兵背包
    //    携行）不画——本仓 carriedByBackpack 承接。
    //  · 本体帧（:34117-34126 + 公共尾 :34212）：anchor = center+(0,+3)
    //    （vector99.Y++、+=2；678 再 −4 / 679 再 −2）；origin = (fw/2 + ToDirectionInt(
    //    dir&FlipH≠0)=−1 恒 [, 679 再 ×4 同式 −4], fh/2 [仅 679：非翻转侧 +4 /
    //    翻转侧 −4，:34130-34134——垂直镜像绕 origin 翻转,±4 反补维持塔身贴地]),
    //    rotation=proj.rotation、effects=dir。proj.scale=1（SetDefaults 无改）。
    //  · F5① 折算表 [−29,−49]（PROJ_DRAW_OFFSET_DYN 677/678/679）系把本支锚误读为
    //    Bottom 系（663/691 支 :34082/:34091 才显式重置 vector99=proj.Bottom；本支
    //    继承 :33695 的 Center 缺省）⇒ 旧绘整体偏低 fh/2−bh−3=27px 且缺塔座,
    //    本专绘替代（三表项退役,WeaponProj 侧注同）。
    if (this.sentry && BALLISTA_TOWER.has(this.projId)) {
      const sheet = projSprite(this.projId);
      if (sheet) {
        const framesN = Math.max(1, frames);
        const fh = sheet.height / framesN;               // 56（projFrames[677/678/679]=6）
        const fw = sheet.width;                          // 124/140/142
        const flipV = this.facing < 0;                   // dir 净 FlipVertically（①）
        let ay = 3;                                      // vector99.Y++、+=2（:34119-34121）
        if (this.projId === 678) ay += -4;               // :34122-34123
        if (this.projId === 679) ay += -2;               // :34125
        let ox = fw / 2 - 1;                             // Size/2 + ToDirectionInt(恒假)=−1（:34127）
        let oy = fh / 2;
        if (this.projId === 679) {
          ox -= 4;                                       // :34136 同式 ×4
          oy += flipV ? -4 : 4;                          // :34130-34134
        }
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        if (this.alphaFade > 0) ctx.globalAlpha = Math.max(0, (255 - this.alphaFade) / 255);
        // ② 塔座（先画,本体叠其上）：Bottom 系底心锚（gfxOffY 恒 0,塔不入水）
        if (!this.carriedByBackpack) {
          const baseTex = r.atlas?.ensureVImage(
            `vanilla/Extra_${this.projId === 678 ? 84 : this.projId === 679 ? 85 : 83}.png`) ?? null;
          if (baseTex) {
            const by = this.y + this.h;                  // proj.Bottom
            ctx.translate(this.cx, by);
            ctx.drawImage(baseTex as CanvasImageSource, -baseTex.width / 2, -(baseTex.height - 2));
            ctx.translate(-this.cx, -by);
          }
        }
        // ③ 本体帧：anchor=center+(0,ay)、rotate(rot)、镜像=scale(1,−1)（FlipV）
        ctx.translate(this.cx, this.cy + ay);
        ctx.rotate(this.rot);
        if (flipV) ctx.scale(1, -1);
        const fimg = dFrameImg(this.projId, frame);
        if (fimg) ctx.drawImage(fimg as CanvasImageSource, -ox, -oy);
        else ctx.drawImage(sheet as CanvasImageSource, 0, Math.round(frame * fh), fw, fh,
          -ox, -oy, fw, fh);
        ctx.restore();
        return;
      }
    }
    // ---- ★SW-BJ13 2026-09-07：帕鲁地面家族∪原版同支专绘（Main.cs:34788-34800 1:1）----
    // 原版本族（393-395/398/423/450/1022/1036/1093/1112/1118）不走通用 num143/144
    // 尾绘（:35567 起 = 帧左上锚盒左上）,专用支：anchor = proj.Center + (0, gfxOffY −
    // num467)（num467 = 2 缺省 / 5=1093·1112 :34794 / 9=1118 :34798）、origin =
    // (整图宽/2, 帧高/2 + num151)（num151=1 仅 1022 num151++ :30079、−4 仅 1036
    // :30091；423 的 num152=−5 :30161 本支不消费=原版死值）。展开即「帧心锚于盒心
    // 上方 num467」——精灵横居盒、帧底 = 盒底 + 4px（步行族全支一致）。
    // 旧通用路把帧左上锚盒左上 ⇒ 精灵整体右下偏：1118 (+12,+22)（盒 14×22/帧 38×48）
    // = 用户 F3 实报「盒在左上、精灵画在右下、走一步陷一步」；1093/1112 (+10,+14)、
    // 393-395 (+16,+8)、1022 (+11,+10)、423 (0,+4)、1036 (+3,0)。
    if (CENTER_ANCHOR_34788.has(this.projId) && img) {
      const num467 = this.projId === 1118 ? 9
        : this.projId === 1093 || this.projId === 1112 ? 5 : 2;
      const num151 = this.projId === 1022 ? 1 : this.projId === 1036 ? -4 : 0;
      ctx.save();
      if (this.alphaFade > 0) ctx.globalAlpha = Math.max(0, (255 - this.alphaFade) / 255);
      ctx.translate(this.cx, this.cy - num467);          // gfxOffY 未建模恒 0（通用路同）
      if (this.rot !== 0) ctx.rotate(this.rot);
      if (this.facing < 0 && !MINION_NO_FLIP.has(this.projId)) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -img.width / 2, -(img.height / 2 + num151));
      ctx.restore();
      return;
    }
    // ---- ★SW-BJ16 2026-09-07：33693 中心锚大支专绘（Main.cs:33693-34290,主绘 :34212）----
    // 原版本支：锚 = proj.Center + (0, gfxOffY)（:33694-33695 vector99）、帧矩形 =
    // Frame(1, projFrames, 0, frame)【帧高全高,无通用路的 num482−1 shave】（:33701）、
    // origin = 帧尺寸/2（:33787 origin32）、rotation/dir 直传（:34212）。本仓成员见
    // CENTER_ANCHOR_33703 注；通用路（:34919/:35470 = 帧左上锚盒左上+num143/144 表）
    // 对未登记型吃 [0,0] 缺省 ⇒ 本族曾整体偏右下（如 758 (fw−bw)/2=+58、613 +4）。
    // 支内改锚/改切片特例逐型照录（BJ13 警告「折算式仅适用支内无改锚者」的核验产物；
    // 任务书预计算值 758 (+58,+12)/1098 (+24,+6) 系按「无特例」折算,与源码核对后
    // 修正式为 758 (+58,+20)、1098 (+24,+8)——特例项见下）：
    //  · 758 吸血蛙（:33964-33968）：锚 Y += 盒高/2（=盒底）、origin=(帧宽/2, 帧高−4)
    //    ⇒ 精灵底 = 盒底 + 4（同族「脚微陷」恒量）
    //  · 759 雀杖（:33959-33963）：origin.Y = 帧高−2、origin.X += 翻转?+1:−1
    //    ⇒ 精灵底 = 盒心+2、横移朝向 1px（折进锚 ax）
    //  · 951 雪怪（:33942-33946）：锚 Y += 盒高/2 − 帧高/2 + 4、origin=帧心
    //    ⇒ 精灵底 = 盒底 + 4（任务书 17 型外的同支同病成员,提取器 B_33693 交集中补清）
    //  · 963 阿比盖尔（:33704-33706 + :33836-33844）：切片 = Frame(4,13,0,frame)
    //    ——4 列×13 行网格取【第 0 列】,帧 44×64（整宽竖条切片=4 倍宽错位）;锚 Y
    //    += −2 + cos(mouseTextColor 脉冲)·4——静态 −2 照录,cos 摆系全局 UI 脉冲
    //    （Main.cs:18399 mouseTextColor 三角波）本仓无全局 tick 源=登记债。
    //    ★刻意不入 Arrow.PROJ_GRID：该表语义=列主序全格积（projFrameCount=cols×rows
    //    =52）会谎报 963 帧数（原版 projFrames[963]=13,帧域恒第 0 列 0-12 行）——
    //    帧计数被 AI 帧机/钳制消费,注册即污染;故本支内手工切片。
    //  · 1098/1123 钻地龟（:33771-33773）：锚 Y −= 2
    //  · 623 守护者（:34169-34177）：ai0==2 抖动 rand.NextVector2Circular(2,2)
    //    + CurrentDrawnEntityShader==0 时 A/=2——★SW-FX6 2026-09-10 债④清偿,
    //    见下方 draw 支内实现;625-628/643/613/831/970/1119 支内无改锚（逐型核验
    //    :33693-34290 全支扫描结论,见审计文档;831/970 另有 hide 门=SW-FX6 债⑥）
    //  · 域外成员：773（WeaponProj.draw 同式接入）/1092（BookProj 已合本支语义：
    //    projFrameImg 走 PROJ_GRID[1092] 6×9 列主序 + 盒心帧心锚）
    if (CENTER_ANCHOR_33703.has(this.projId) && img) {
      const ax = this.projId === 759 ? (this.facing < 0 ? -1 : 1) : 0;   // :33960-33962
      let ay = 0;
      if (this.projId === 758) ay += this.h / 2;                          // :33965 盒底锚
      else if (this.projId === 951) ay += this.h / 2 - img.height / 2 + 4; // :33943-33945
      else if (this.projId === 963 || this.projId === 1098 || this.projId === 1123) ay += -2; // :33836/:33771
      // ★SW-BN6 2026-09-08：BJ16 债⑤清偿——963 cos 摆接线（Main.cs:33836-33844 1:1）。
      //  原版 895/896/898/963 同支：num394=2（isAPreviewDummy=0.5,本仓无预览虚影档）,
      //  vector99.Y += −num394 + cos(mouseTextColor/255·2π·2)·num394·2 —— 静态 −2 即
      //  上一行;摆项 = cos((mt/255)·4π)·4（摆幅 ±4px,三角波全周期 130t≈2.17s）。
      //  mt = 全局脉冲钟 FlickerClock.mouseTextColor（SkyColor.ts:318,190↔255 步进
      //  1/帧 = Main.cs:18399-18406 同式;经 LightingEngine.compute 每帧 tick,
      //  Game.ts:10005）——BJ16 登记「本仓无全局 tick 源」前提已过时,Renderer.lighting
      //  在实体 draw 内可达（同 Renderer.ts:3440/:14217 消费口）。灯未就绪回退 255
      //  = 摆顶（静止偏置 +2,与原版 mt=255 帧同形）。
      if (this.projId === 963) {
        const mt = r.lighting?.clock?.mouseTextColor ?? 255;
        ay += Math.cos((mt / 255) * Math.PI * 2 * 2) * (2 * 2);
      }
      const oy = this.projId === 758 ? img.height - 4                     // :33966-33967
        : this.projId === 759 ? img.height - 2                            // :33960
        : img.height / 2;
      // ★SW-FX6 2026-09-10 债④清偿：623 守护者支内特例 1:1（Main.cs:34170-34177）——
      //  ① ai0==2（攻击态）且 !gamePaused：锚 += rand.NextVector2Circular(2,2)
      //  （Utils.cs:1301-1303 = 单位向量×(2,2)×NextFloat,逐 draw 掷流）。gamePaused 门
      //  本仓 draw 侧无暂停源（暂停仍渲染）=备案;rand = draw 侧流,本仓 Math.random
      //  直映（AI 掷流既有约定同源,不进播种流）。
      //  ② CurrentDrawnEntityShader==0（常态）时 color106.A /= 2（:34175-34177）——
      //  守护者本体半透明（灵体观感,A=127/255）;折进 globalAlpha。
      let jx = 0, jy = 0;
      if (this.projId === 623 && this.gA0 === 2) {                        // :34171-34173
        const ang = Math.random() * Math.PI * 2;                          // NextVector2Unit()
        const mag = Math.random();                                        // NextFloat()
        jx = Math.cos(ang) * 2 * mag;
        jy = Math.sin(ang) * 2 * mag;
      }
      ctx.save();
      {
        // alpha 组合：出场淡入（既有）×623 A/=2（:34175-34177）——本地标量合成,
        // 不回读 ctx.globalAlpha（测试记录型 ctx 无 getter）
        let bodyAlpha = this.alphaFade > 0 ? Math.max(0, (255 - this.alphaFade) / 255) : 1;
        // 623：GetAlpha ×(255-alpha)/255（:45482/:45718 gAlpha——状态 3 隐身窗=0）
        // × Main.cs:34175-34177 A/=2。gAlpha=0 时因子 1×0.5 与旧式逐字节同相
        if (this.projId === 623) bodyAlpha *= ((255 - this.gAlpha) / 255) * 0.5;
        if (bodyAlpha < 1) ctx.globalAlpha = bodyAlpha;
      }
      ctx.translate(this.cx + ax + jx, this.cy + ay + jy); // gfxOffY 未建模恒 0（通用路同）
      if (this.rot !== 0 || MINION_ROT_ONLY.has(this.projId)) {
        ctx.rotate(this.rot);
        if (!MINION_ROT_ONLY.has(this.projId) && this.facing < 0 && !MINION_NO_FLIP.has(this.projId)) ctx.scale(-1, 1);
      } else if (this.facing < 0 && !MINION_NO_FLIP.has(this.projId)) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = false;
      if (this.projId === 963) {
        // 切片 = Frame(4,13,0,frame)（:33704-33706）：第 0 列 × 第 frame 行,帧 44×64
        const sheet = projSprite(963);
        if (sheet) {
          const fh = sheet.height / 13, fw = sheet.width / 4;
          const sy9 = Math.round(frame * fh);
          const dsub = dSheetSub(sheet, 0, sy9, fw, fh);
          if (dsub !== sheet) ctx.drawImage(dsub as CanvasImageSource, 0, 0, fw, fh,
            -fw / 2, -fh / 2, fw, fh);
          else ctx.drawImage(sheet as CanvasImageSource, 0, sy9, fw, fh,
            -fw / 2, -fh / 2, fw, fh);
        }
      } else {
        ctx.drawImage(img, -img.width / 2, -oy);
      }
      ctx.restore();
      return;
    }
    // ---- ★SW-FX6 2026-09-10 债①清偿：641 月门 A 支专绘（Main.cs:33161-33166 +
    //      :33444-33467 + 主绘 :33569-33572,578/579/641/813 同块 641 支）----
    // vanilla A 支：锚 = 盒心 + gfxOffY（:33162 vector81 = position+Size/2+UnitY·gfxOffY）、
    // origin = 【整图】尺寸/2（:33165 origin24,sourceRectangle2=null 无帧切片）——
    // 本仓旧走通用路（num143/144 未登记 [0,0]）= 帧左上锚盒左上：60×60 精灵/32×32 盒
    // → 整体偏 (+14,+14)（BJ16 §4①）。:33444-33467（641 flag40=true）叠绘序列：
    //   ①Extra_50 暗环（color95=Lerp(color87,Black,.5)×num360 → RGB 减半折进 alpha
    //     的既定近似）、rot=−num340+0.35、scale=scale11=0.6+0.6·num360、dir^FlipH
    //   ②Extra_50 亮环（color87）、rot=−num340、scale=proj.scale、dir^FlipH
    //   ③本体幽灵遍（color94=×0.8·A/2 → alpha 0.4）、rot=−num340×0.7、dir^FlipH
    //   ④Extra_50 三遍（color87×0.8 → alpha 0.8）、rot=num340×0.5、scale×0.9、dir
    //   随后 color87.A=0（:33464）→ 主绘 :33571 = α0 纯加法（XNA α=0 惯用法,
    //   canvas 'lighter',同 Arrow ADDITIVE_GLOW_PROJS 族）。
    //  num360 = 0.95 + (rot·0.75).ToRotationVector2().Y·0.1 = 0.95+sin(0.75·rot)·0.1
    //  （:33449）。dir：AI_123 全支零 spriteDirection 赋值（:37726-37945 扫描）+
    //  SetDefaults 复位 1（Projectile.cs:752）→ dir≡None → ①②③恒 FlipH、④⑤恒
    //  None（不吃 this.facing——月门原版不随目标翻转）。rot 消费 this.rot（AI 侧
    //  自旋 :37742 rotation−=direction·2π/120 与 scale=Opacity :37743 本批未建模=
    //  剩债登记,r=0 时全支退化为静态环）。gfxOffY 未建模恒 0（全仓约定）。
    if (this.projId === 641 && img) {
      const ringTex = r.atlas?.ensureVImage('vanilla/Extra_50.png') ?? null;
      const num360 = 0.95 + Math.sin(this.rot * 0.75) * 0.1;               // :33449
      const scale11 = 0.6 + 0.6 * num360;                                  // :33452
      const iw = img.width, ih = img.height;
      const passes: Array<{ tex: unknown; a: number; rot: number; s: number; mirror: boolean; additive?: boolean }> = [
        { tex: ringTex, a: 0.5 * num360, rot: -this.rot + 0.35, s: scale11, mirror: true },  // :33456
        { tex: ringTex, a: 1, rot: -this.rot, s: 1, mirror: true },                          // :33457
        { tex: img, a: 0.4, rot: -this.rot * 0.7, s: 1, mirror: true },                      // :33459-33460
        { tex: ringTex, a: 0.8, rot: this.rot * 0.5, s: 0.9, mirror: false },                // :33462
        { tex: img, a: 1, rot: this.rot, s: 1, mirror: false, additive: true },              // :33571(A=0 :33464)
      ];
      for (const p of passes) {
        if (!p.tex) continue;
        const tw = (p.tex as HTMLImageElement).width, th = (p.tex as HTMLImageElement).height;
        ctx.save();
        if (p.additive) ctx.globalCompositeOperation = 'lighter';
        if (p.a < 1) ctx.globalAlpha = p.a;
        ctx.translate(this.cx, this.cy);             // 锚=盒心（:33162,债①核心）
        ctx.rotate(p.rot);
        if (p.mirror) ctx.scale(-1, 1);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(p.tex as CanvasImageSource, -tw * p.s / 2, -th * p.s / 2, tw * p.s, th * p.s);
        ctx.restore();
      }
      return;
    }
    // ---- ★SW-BJ56 2026-09-10：946 泰拉棱镜专绘（Main.cs:28677-28692 派发 +
    //      DrawProj_EmpressBlade :36562-36601 全层 1:1）----
    // 旧通用路只画 scale(0.75) 本体一帧（且 rot 未减 π/2、facing 翻转误吃）=
    // 用户实报「没有光效」根源。原版本体绘制链：
    //  · num = proj.rotation − π/2（:36572,DrawProj_EmpressBlade 消费角）——AI 侧
    //    rotation 含 +π/2 补偿（AI_156_GetIdlePosition :52855 idleRotation+=π/2 /
    //    弧刀段 :52707 rotation=num24+π/2）,draw 侧 −π/2 还原刃轴。dir=SpriteEffects.None
    //    恒不翻转（AI_156 全支无 spriteDirection 写,Main.cs:36591/:36597 :36600）。
    //  · num22 色相 = IndexForVisuals % max(1,maxMinions)/max(1,maxMinions)
    //    + GlobalTimeWrappedHourly%3/3（:28681-28682）——多剑各占相位、3s 一轮循环；
    //    IndexForVisuals=key.Index（Projectile.cs:554）,本仓实体 id 同位替代。
    //  · 层序（:36574-36600,全 AlphaBlend 非加算）：①幻影 6 层（沿 −num 向每 1/6
    //    步进偏移 −120×f×lerpValue、scale×1.5、色=女皇色(A=127→63)×num2×(1−f)×num3）
    //    仅 num3>0 时可见（lerpValue=GetLerpValue(60,50,ai0)、num3=GetLerpValue(70,50)×
    //    GetLerpValue(40,45)——跃空段 ai0≥60 双 0、弧刀前段 ai0≤40 为 0）；②环晕 4 层
    //    （(f5×2π+num) 向 ×4×scale、×num2）；③本体 White×Opacity,A×0.7（:36576-36577）
    //    ——不读格光色（CurrentDrawnEntityShader=-1 后硬编码色）=暗处全亮,光照面由
    //    Renderer.SELF_LUMINOUS_PROJS 946 条目承载；④女皇色罩 ×num2×0.5（:36600）。
    //    XNA Color×float 四通道同乘 → 本仓既定近似折进 globalAlpha（641/755 支同式）。
    //  · 拖尾 = EmpressBladeDrawer.Draw（Terraria.Graphics/EmpressBladeDrawer.cs:16-33,
    //    Main.cs:28688 前置）：VertexStrip.PrepareStrip(proj.oldPos,oldRot,
    //    StripColors,StripWidth=36,expectedPairs=oldPos.Length=TrailCacheLength[946]
    //    =20（ProjectileID.cs:387,SW-RB11a 订正）,includeBacksides) —
    //    TrailingMode[946]=2（ProjectileID.cs:385,Projectile.cs:17237-17246 每拍整环
    //    移位 oldPos[0]=最新）；StripColors=Lerp(ColorStart,ColorEnd,GetLerpValue(0,
    //    0.7,p))×(1−GetLerpValue(0,0.98,p)),A/=2（EmpressBladeDrawer.cs:35-42）;SSD=
    //    (1,0,0,0.6)（:18-26）。XNA 侧条带 = (One,One) 全量直加（GLSpriteLayer TRAIL_FS
    //    注,GIF 峰值复算钉死）→ 顶点 A=0（ColorStart/End alphaChannelMultiplier=0）
    //    仍可见;本仓顶点 a 写 0.5×(1−g2)（A/=2 语义折算,兼作 CPU 路写入门）。
    //    拖尾经 queueTrailShade 入全亮 flush（TrailShader 合成后直绘=脱离光照乘,
    //    同天顶剑/月牙管线）。
    if (this.projId === 946 && img) {
      const gl = (from: number, to: number, t: number): number =>
        Math.max(0, Math.min(1, (t - from) / (to - from)));            // Utils.GetLerpValue(clamped)
      const own = this.ownerRef();
      const op = 1;                                                     // Opacity=1−alpha/255,alpha 恒 0
      const num = this.rot - Math.PI / 2;                               // :36572
      const num2 = op * 0.3;                                            // :36573
      const num22 = empressHuePhase(this.id, own?.maxMinions ?? 1, gtwSec());
      const hueC = fairyHueRgb(((num22 + 0.5) % 1 + 1) % 1);            // :36566 num=(hueRaw+0.5)%1
      const tinted = tintFrameHue(img, hueC);                           // 女皇色剪影（每帧一染,全层共用）
      // ★变体①终扫（2026-09-27）:HUE_TINT_SCRATCH 全剑共用一染面——每剑 hue 相位
      //  异（num22=id%maxMinions+GTW 环）,shim 静态区域缓存下全部幻影/环晕层冻结
      //  在首帧内容。逐剑烘焙即刻上传（I类 bolt 判例 1:N 扩展:一次 bake 十层消费,
      //  bakedTexMulti 帧内粘滞）+环形键防同键原地改写先行剑纹理（shine 单键教训）。
      if (tinted) r.markWorldDynamicScratch?.(tinted, `empressTint:${empressTintSeq++ % 64}`);
      const num145a = (63 / 255);                                       // A=255×0.5 → /2 =63（:36568/:36575）
      // ①幻影 6 层（:36578-36586）
      const lerpValue = gl(60, 50, this.tA0);
      const num3 = gl(70, 50, this.tA0) * gl(40, 45, this.tA0);
      if (tinted) {
        // ①幻影 6 层（:36578-36586,门= num2>0f :36574——num3 因子进色乘,num3=0 时
        //   XNA 画 (0,0,0,0) 色无贡献,本仓 globalAlpha=0 同效）
        //   ★float 环界（C# float 6×(1/6f)=1.00000012>1 → 恰 6 圈 f∈{0,1/6..5/6};
        //   JS double 累加 0.999…9<1 会多出第 7 圈 f≈1）——Math.fround 逐拍钳 float32
        //   = C# `float num4` 累加同相（:22）
        for (let f = 0; f < 1; f = Math.fround(f + Math.fround(1 / 6))) {
          const a = num145a * num2 * (1 - f) * num3;
          const ox = Math.cos(num) * (-120 * f * lerpValue);
          const oy = Math.sin(num) * (-120 * f * lerpValue);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.globalAlpha = a;
          ctx.translate(this.cx + ox, this.cy + oy);
          ctx.rotate(num);
          ctx.drawImage(tinted, -img.width / 2 * 1.125, -img.height / 2 * 1.125, img.width * 1.125, img.height * 1.125);
          ctx.restore();
        }
        // ②环晕 4 层（:36588-36591,色=女皇色×num2 无 num3 因子=恒可见）
        for (let f5 = 0; f5 < 1; f5 += 0.25) {
          const ox = Math.cos(f5 * Math.PI * 2 + num) * 4 * 0.75;
          const oy = Math.sin(f5 * Math.PI * 2 + num) * 4 * 0.75;
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.globalAlpha = num145a * num2;
          ctx.translate(this.cx + ox, this.cy + oy);
          ctx.rotate(num);
          ctx.drawImage(tinted, -img.width / 2 * 0.75, -img.height / 2 * 0.75, img.width * 0.75, img.height * 0.75);
          ctx.restore();
        }
      }
      // ③本体（White×Opacity,A×0.7 :36576-36577+:36592）④女皇色罩 ×num2×0.5（:36600）
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.7;
      ctx.translate(this.cx, this.cy);
      ctx.rotate(num);
      ctx.scale(0.75, 0.75);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      if (tinted) {
        ctx.globalAlpha = num145a * num2 * 0.5;
        ctx.drawImage(tinted, -img.width / 2, -img.height / 2);
      }
      ctx.restore();
      // ⑤拖尾（EmpressBladeDrawer :16-33）：oldPos 环 = tHist（terraprismaBody 每拍压栈）
      if (this.tHist.length >= 6 && typeof (r as unknown as { queueTrailShade?: unknown }).queueTrailShade === 'function') {
        const pts = buildEmpressTrailPts(this.tHist, num22);
        try {
          (r as unknown as { queueTrailShade?: (sp: unknown) => void }).queueTrailShade?.({
            set: 'EmpressBlade', pts, opacity: 1, expectedPairs: 20, time: gtwSec(),
          });
        } catch { /* 拖尾单帧失败不拖垮本体 */ }
      }
      return;
    }
    // ---- ★SW-FX6 2026-09-10 债②清偿：691-693 陷阱塔 B 支 Bottom 锚（Main.cs:34089-34097）----
    // vanilla（非携行）：vector99 = proj.Bottom + UnitY·gfxOffY（:34092）、
    // origin32 = 帧尺寸×(0.5,1) 后 Y 连减 2×2 → (fw/2, fh−4)（:34093-34096）⇒
    // 精灵横居盒、底 = 盒底 + 4（758/951/663 族同款「脚微陷」恒量）。携行态
    // （ai[2]==1=IsSentryBeingCarried :80527-80529,本仓 carriedByBackpack）门反支
    // 不重锚 = B 支缺省（锚=盒心、origin=帧心）。dir：AI_138 首行
    // spriteDirection=(direction=1)（:70379）→ dir≡None 恒不翻转（本仓旧通用路
    // facing 翻转未触发但语义已正）；B 支全帧高无 −1 shave（:33701）。gfxOffY 恒 0。
    if (this.sentry && TRAP_TOWER.has(this.projId) && img) {
      ctx.save();
      if (this.alphaFade > 0) ctx.globalAlpha = Math.max(0, (255 - this.alphaFade) / 255);
      ctx.imageSmoothingEnabled = false;
      if (!this.carriedByBackpack) {
        ctx.translate(this.cx, this.y + this.h);                       // proj.Bottom（:34092）
        ctx.drawImage(img as CanvasImageSource, -img.width / 2, -(img.height - 4)); // origin=(fw/2,fh−4)
      } else {
        ctx.translate(this.cx, this.cy);                               // 携行=B 支缺省盒心锚
        ctx.drawImage(img as CanvasImageSource, -img.width / 2, -img.height / 2);
      }
      ctx.restore();
      return;
    }
    // ---- ★SW-FX6 2026-09-10 债③清偿：308/377 哨兵塔通用路内半宽切片
    //      （Main.cs:34950-34957 + 主绘 :35047）----
    // vanilla 通用路支内特例：num481 /= 2（源半宽）、num153 /= 2f（num153 初值
    // (texW−bw)/2+bw/2 = texW/2（:30303）→ 半宽/2 = texW/4）、ai[2]==1（携行,
    // :37813/:37992 ai[2]=0&&CanGetPickedUpBySentryBackpack→1）时 x15 = num481
    // 取右半列。主绘 :35047：Rectangle(x15, y25, num481, num482−1)（y25=num482·frame
    // :34944、num482=C# 整除帧高:34943、底行 −1 shave:35047）、锚 = (盒左+num153+
    // num152, 盒上+盒高/2)、origin = (num153, 盒高/2+num151)（num151 仅 377=−6
    // :30190,num152=0）⇒ 半塔左缘 = 盒左、竖居盒高半（377 下移 6px）。本仓旧整宽
    // 直绘 = 双塔叠影（PNG 94/66 宽内左右两半镜像塔身,663-667 同构）。flip 沿用
    // 既有 facing 语义（AI_053 spriteDirection 按目标/携行方位覆写 :38002/:38052-
    // 38062,spriteDirection 可为 −1）。
    if ((this.projId === 308 || this.projId === 377)) {
      const sheet = projSprite(this.projId);
      if (sheet) {
        const framesN = Math.max(1, projFrameCount(this.projId));
        const fh = Math.floor(sheet.height / framesN);                 // num482（:34943 C# 整除）
        const halfW = Math.floor(sheet.width / 2);                     // num481（:34952）
        const num151 = this.projId === 377 ? -6 : 0;                   // :30190
        const x15 = this.carriedByBackpack ? halfW : 0;                // :34954-34956
        const y25 = Math.floor(frame * fh);                            // :34944
        ctx.save();
        if (this.alphaFade > 0) ctx.globalAlpha = Math.max(0, (255 - this.alphaFade) / 255);
        ctx.imageSmoothingEnabled = false;
        ctx.translate(this.x + halfW / 2, this.y + this.h / 2);        // 锚（num153+num152,num152=0）
        if (this.facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(sheet as CanvasImageSource, x15, y25, halfW, fh - 1,
          -halfW / 2, -(this.h / 2 + num151), halfW, fh - 1);          // :35047（shave −1）
        ctx.restore();
        return;
      }
    }
    ctx.save();
    // 帕鲁出场淡入（Projectile alpha 通道：绘制色 = 原色 × (255-α)/255——
    // DoPalAppearEffect 每 tick α-15，17t 全显 :39509-39515）
    if (this.alphaFade > 0) ctx.globalAlpha = Math.max(0, (255 - this.alphaFade) / 255);
    // ---- 火绒狐喷火态本体替换（ai[0]>=1000，1457 Main.cs:33738-33741/:33790-33797）----
    // 本体贴图换 Extra_303 顶格（Frame(1,3)=60×36）：焰团心 = vector99(center+(0,-11))
    // − origin(30−10sd,12) + size/2 = (cx+10sd, cy−5)；dir ^= FlipHorizontally 镜像保真。
    // 焰流粒子锥（DrawProj_Flamethrower_Foxsparks :35719,采样本体图中带白剪影
    // Frame(1,7,0,3..5) 染色）本仓以 1106 弹幕流近似,不建模
    if ((this.projId === 1094 || this.projId === 1113) && this.foxChannel) {
      const ex = r.atlas?.ensureVImage('vanilla/Extra_303.png') ?? null;
      if (ex) {
        ctx.translate(this.cx + 10 * this.facing, this.cy - 5);
        if (this.facing < 0) ctx.scale(-1, 1);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ex as CanvasImageSource, 0, 0, 60, 36, -30, -18, 60, 36);
      }
      ctx.restore();
      return;
    }
    // ---- 原版偏移表消费（Main.cs:29375-29826 num143/144 + 通用绘制 :34040）----
    // 全型号统一走公式（2026-08-19 清零近似）：有表项用 num143/144,未登记 = 0/0
    // → 贴图左上角 = (盒左+num144, 盒上−num143) = 盒左上对齐（曾一律盒心居中近似,
    // 已废）。★F5b：动态项 dirX 此前恒传 −1（"AI_026 零赋值 ⇒ spriteDirection=−1"
    // 系误读——原版零赋值 = 缺省 +1,Entity/Projectile 双缺省 1,Projectile.cs:356）,
    // 现传真值：dirX = facing（spriteDirection 语义镜）;dir = 原版 direction
    // （蜘蛛 390-392 = spDir,:63302-63317;其余族用 facing 侧写——仅 191-194/
    // 390-392 三族读 direction,Main.cs:30490-30498。右行蜘蛛 num152 旧 −4 应 +4
    // =8px 差）。旋转族(rotation)绕 anchor 旋转 = 原版 spriteBatch(anchor,origin,
    // rotation) 同构
    const off3 = img
      ? (projDrawOffsetFor(this.projId, this.facing, this.h,
        this.projId >= 390 && this.projId <= 392 ? this.spDir : this.facing) ?? [0, 0, 0])
      : null;
    // num145 = (贴图宽−盒宽)/2 + 盒宽/2 = 贴图宽/2（Main.cs:29601 原式化简,1457
    // Main.cs 同式）——旋转枢=贴图水平中点;曾误写 (贴图宽+盒宽)/2 → 随从绕偏心点
    // 公转（2026-08-23 备案项⑦,同 WeaponProj.drawProj 修法）
    const num145 = off3 && img ? img.width / 2 : 0;
    if (off3) ctx.translate(this.cx - this.w / 2 + num145 + off3[1], this.cy);
    else ctx.translate(this.cx, this.cy);
    ctx.imageSmoothingEnabled = false;
    // 旋转制族（双子/致命球/雪花/龙链/方块，MINION_ROT_ONLY）：rotation 绘制、
    // 恒不水平翻转（原版 dir=SpriteEffects.None）；翻转制族 spriteDirection=-1
    // 才翻（AI_026/164 族零赋值恒不翻，MINION_NO_FLIP）。
    // 表外设 rot 的族（AI_062 :66827/乌鸦 :27542/蜘蛛爬墙 :65136）原版 rotation 与
    // spriteDirection 【同 draw 调用叠用】（Main.cs:30529-30533 dir + spriteBatch rotation）
    // ——XNA FlipHorizontally = 顶点绕 origin 先镜像再旋转 → canvas rotate 后 scale(-1,1)
    if (this.rot !== 0 || MINION_ROT_ONLY.has(this.projId)) {
      ctx.rotate(this.rot);
      if (!MINION_ROT_ONLY.has(this.projId) && this.facing < 0 && !MINION_NO_FLIP.has(this.projId)) {
        ctx.scale(-1, 1);
      }
    } else if (this.facing < 0 && !MINION_NO_FLIP.has(this.projId)) ctx.scale(-1, 1);
    // 火绒狐翻转侧原点修正（1457 Main.cs:33814 origin32.X += Flip→−8：XNA 镜像绕
    // origin 使贴图整体左移 8px;本仓镜像绕 anchor 无原点修正 → 补画位偏移,
    // 翻转侧落位 [cx−39,cx+23] 与原版对齐,非翻转侧 [cx−31,cx+31] 不动）
    const foxFlipAdj = (this.projId === 1094 || this.projId === 1113)
      && this.facing < 0 && !MINION_NO_FLIP.has(this.projId) ? 8 : 0;
    if (this.projId === 653) {
      // 同伴方块：SetDefaults scale=0.8（:6740）+ rotation 独立累计（cubeRot,
      // rotation+=vx/20——不走龙链 rot,直接套用）;34×34 单帧
      if (this.cubeRot !== 0) ctx.rotate(this.cubeRot);
      ctx.scale(0.8, 0.8);
    }
    if (this.projId === 946) {
      ctx.scale(0.75, 0.75);   // 泰拉棱镜：SetDefaults scale=0.75（:8932）
    }
    if (img) {
      if (off3) ctx.drawImage(img, -num145 + foxFlipAdj, -(this.h / 2 + off3[0]), img.width, img.height);
      else ctx.drawImage(img, -img.width / 2, -img.height / 2);   // 贴图未就绪兜底(无偏移量可依)
    } else {
      // 兜底：召唤符记色块（哨兵紫 / 随从金）——贴图缺失或懒加载未就绪
      ctx.fillStyle = this.sentry ? '#B080FF' : '#FFD060';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(-8, -8, 16, 16);
    }
    // 755 血蝙蝠红晕（Main.cs:30669-30678）：AI_156_GetColor = Crimson(220,20,60)
    // α=120，沿旋转垂直向 4 向各偏 2px 叠画 4 层染色本体——"发红光"的视觉主体
    if (this.projId === 755 && img) {
      const halo = tintFrameCache(img, 'rgb(220,20,60)');
      if (halo) {
        ctx.globalAlpha = 120 / 255;
        for (let k = 0; k < 4; k++) {
          const off = this.rot + (Math.PI / 2) * k;
          ctx.save();
          ctx.translate(Math.cos(off) * 2, Math.sin(off) * 2);
          ctx.drawImage(halo, -halo.width / 2, -halo.height / 2);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
}

/** 帧图整体染色缓存（755 红晕用：source-atop 填色剪影） */
const HALO_TINT = new Map<HTMLCanvasElement, HTMLCanvasElement>();
function tintFrameCache(src: HTMLCanvasElement, color: string): HTMLCanvasElement | null {
  let c = HALO_TINT.get(src);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const cx2 = c.getContext('2d');
  if (!cx2) return null;
  cx2.drawImage(src, 0, 0);
  cx2.globalCompositeOperation = 'source-atop';
  cx2.fillStyle = color;
  cx2.fillRect(0, 0, c.width, c.height);
  if (HALO_TINT.size > 64) HALO_TINT.clear();   // 帧图缓存换代会自然重建
  HALO_TINT.set(src, c);
  return c;
}

// ---- ★SW-BJ56 2026-09-10：泰拉棱镜 946 绘制辅助（三件,仅 946 消费）----

/** GlobalTimeWrappedHourly（Main.cs:17014——★BJ330 收编 GameTime 单源,暂停/失焦冻结;npcExtraParts.gtw 同源） */
function gtwSec(): number {
  return globalTimeWrappedHourly();
}

/** Main.hslToRgb(h,1,0.5) 逐式移植（Main.cs:48689-48717 + hue2rgb :48719-48734;
 *  s=1→t2=l+s−ls=1、t1=2l−t2=0）——女皇武器色 = GetFairyQueenWeaponsColorFull 缺省
 *  尾段 hslToRgb(num,saturation=1,luminance=0.5)（Projectile.cs:22062）。返回 [r,g,b] 0-1。 */
export function fairyHueRgb(hue: number): [number, number, number] {
  const hue2rgb = (c: number, t1: number, t2: number): number => {
    if (c < 0) c++;
    if (c > 1) c--;
    if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
    if (2 * c < 1) return t2;
    if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
    return t1;
  };
  const t2 = 0.5 + 1 - 0.5 * 1;          // l + s − l×s = 1（s=1）
  const t1 = 2 * 0.5 - t2;               // 2l − t2 = 0
  const r = Math.round(hue2rgb(hue + 1 / 3, t1, t2) * 255) / 255;
  const g = Math.round(hue2rgb(hue, t1, t2) * 255) / 255;
  const b = Math.round(hue2rgb(hue - 1 / 3, t1, t2) * 255) / 255;
  return [r, g, b];
}

/** 女皇色剪影（946 幻影/环晕/色罩层共用）：每帧一染（色相随 GlobalTime 循环,缓存无效）
 *  ——source-atop 保 silhouette α,与 tintFrameCache 同工艺;返回共享 scratch（调用即画,
 *  同帧内多次 drawImage 安全,跨实体下一帧重染）。 */
let HUE_TINT_SCRATCH: HTMLCanvasElement | null = null;
/** ★变体①终扫:女皇剑烘焙环形序号（家族独立计数;环形窗 64 ≥ 单帧烘焙剑数,
 *  窗内复用=先行剑 rec 纹理被原地改写——shine 单键回归教训） */
let empressTintSeq = 0;
function tintFrameHue(src: HTMLCanvasElement, rgb: readonly [number, number, number]): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  HUE_TINT_SCRATCH ??= document.createElement('canvas');
  if (!HUE_TINT_SCRATCH) return null;
  if (HUE_TINT_SCRATCH.width !== src.width || HUE_TINT_SCRATCH.height !== src.height) {
    HUE_TINT_SCRATCH.width = src.width;
    HUE_TINT_SCRATCH.height = src.height;
  }
  const cx2 = HUE_TINT_SCRATCH.getContext('2d');
  if (!cx2) return null;
  cx2.globalCompositeOperation = 'source-over';
  cx2.clearRect(0, 0, HUE_TINT_SCRATCH.width, HUE_TINT_SCRATCH.height);
  cx2.drawImage(src, 0, 0);
  cx2.globalCompositeOperation = 'source-atop';
  cx2.fillStyle = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
  cx2.fillRect(0, 0, HUE_TINT_SCRATCH.width, HUE_TINT_SCRATCH.height);
  cx2.globalCompositeOperation = 'source-over';
  return HUE_TINT_SCRATCH;
}

/** ★SW-BJ56：女皇剑色相相位（Main.cs:28680-28682 1:1,Export 供测试）——
 *  num22 = IndexForVisuals % max(1,maxMinions)/max(1,maxMinions) + GlobalTimeWrappedHourly%3/3 */
export function empressHuePhase(id: number, maxMinions: number, gtw: number): number {
  const num20 = (gtw % 3) / 3;
  const num21 = Math.max(1, maxMinions);
  return ((id % num21) / num21) + num20;
}

export interface EmpressTrailPt { x: number; y: number; hw: number; rot: number; r: number; g: number; b: number; a: number }

/** ★SW-BJ56：EmpressBladeDrawer 条带顶点色列（Terraria.Graphics/EmpressBladeDrawer.cs
 *  :16-42 1:1,Export 供测试）。tHist = [x,y,rot]×N 平铺（[0..2]=最新,TrailingMode=2 压栈序
 *  Projectile.cs:17237-17246）;pairs=expectedPairs=oldPos.Length=TrailCacheLength[946]
 *  =20（ProjectileID.cs:387,SW-RB11a 订正;PrepareStrip 第 6 参,progressOnStrip =
 *  i/(pairs−1) VertexStrip.cs:55-63——与实际点数无关,短条带只摊到 (n−1)/19）。
 *  逐点色 = Lerp(ColorStart,ColorEnd,GetLerpValue(0,0.7,p))×(1−GetLerpValue(
 *  0,0.98,p))、A/=2(:35-42)——XNA 侧顶点 A 实为 0（alphaChannelMultiplier=0),(One,One)
 *  全量直加下 rgb 承载贡献（GLSpriteLayer TRAIL_FS 注）;本仓 a=0.5×(1−g2) 兼作 CPU 路门。
 *  hw=36=StripWidth 恒半宽（AddVertexPair ±(rot−π/2)×36,VertexStrip.cs:153-160）。 */
export function buildEmpressTrailPts(tHist: readonly number[], huePhase: number): EmpressTrailPt[] {
  const hueA = fairyHueRgb((((huePhase % 1) + 0.5) % 1 + 1) % 1);          // ColorStart(:28684)
  const hueB = fairyHueRgb(((((huePhase + 0.5) % 1) + 0.5) % 1 + 1) % 1);  // ColorEnd(:28685)
  const pairs = 20;                        // oldPos.Length=TrailCacheLength[946]（SW-RB11a）
  const n = Math.min(Math.floor(tHist.length / 3), pairs);
  const pts: EmpressTrailPt[] = [];
  for (let i = 0; i < n; i++) {
    const p = i / (pairs - 1);
    const g1 = Math.max(0, Math.min(1, p / 0.7));
    const g2 = Math.max(0, Math.min(1, p / 0.98));
    const fade = 1 - g2;
    pts.push({
      x: tHist[i * 3], y: tHist[i * 3 + 1],
      hw: 36,
      rot: tHist[i * 3 + 2],
      r: (hueA[0] + (hueB[0] - hueA[0]) * g1) * fade,
      g: (hueA[1] + (hueB[1] - hueA[1]) * g1) * fade,
      b: (hueA[2] + (hueB[2] - hueA[2]) * g1) * fade,
      a: 0.5 * fade,
    });
  }
  return pts;
}

/**
 * 沙漠虎扑击弹 818（AI_162_TigerPounce :44056-44123 1:1）：
 *  132×132 判定盒（:7725-7726）、ai[0]<0 延迟隐身（每 update +1，extraUpdates=3 →
 *  每 tick 4 update :44058-44063）、起始点→(起始+velocity) 的 CatmullRom 弧线
 *  （垂度 y=距离×1.5，端点外扩 ±0.1 :44073-44078）、ai[0] += 1/ai[1] 每 update
 *  （:44090，时长 = ai[1]/4 tick）→ ai[0]≥1 消亡（:44119-44122）。
 *  伤害 ×(1.5+0.4×(宝石数-1))（:12107-12111）、每敌一次（localNPCHitCooldown=-1
 *  :7733）、818 ∈ MinionShot（ProjectileID.cs:197）→ 吃鞭 tag。
 */
export class TigerPounce extends Entity {
  w = 132; h = 132;
  dead = false;
  rot = 0;
  private damage: number;
  private ivx: number;
  private ivy: number;
  /** ai[0]：负=延迟计数 / 正=进度（0..1）；ai[1]：时长（update 数） */
  private a0: number;
  private a1: number;
  /** 起始中心（localAI[0]/[1] :44069-44070） */
  private sx = 0;
  private sy = 0;
  private started = false;
  /** Opacity（:44079-44082 每 update +0.1） */
  private op = 0;
  private hitSet = new Set<number>();
  private ownerRef: () => Player | null;

  // ---- ★通用湿段（Projectile.cs:16903-17113 全体弹共用段;2026-09-04 溅花缺口
  //  清偿批,仆从弹类接入。四旗/wetCount/presetDone 形状=ProjWetFlags 共享体）----
  //  逐 id 豁免核对：818 ∈ MinionShot（ProjectileID.cs:291）——SetDefaults
  //  （P.cs:8007-8016：132×132/aiStyle 162/tileCollide=false）【ignoreWater=true
  //  :8013】→ 豁免 id,湿段整段门恒闭（:16903）= 原版零行为（字段照加、段照调,
  //  豁免分流由 ignoreWater 参数自动承载）。阻尼不适用定谳（双证）：①豁免;
  //  ②818 ∈ UpdatePosition 早退表（P.cs:20551-20553 `type == 818` → position
  //  不积分,位移全由 AI CatmullRom 曲线插值覆写 :44073-44078——非 velocity 积分
  //  宿主,wetVelocity 档位无消费位）。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount 同名 :16984/:17109-17112） */
  wetCount = 0;
  /** 出生预置已做（一次;NewProjectile :10886-10892 等价） */
  presetDone = false;

  constructor(
    x: number, y: number, vx: number, vy: number, damage: number,
    owner: () => Player | null, ai0: number, ai1: number,
  ) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.ivx = vx;
    this.ivy = vy;
    this.damage = damage;
    this.ownerRef = owner;
    this.a0 = ai0;
    this.a1 = ai1;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // ★通用湿段（:16903-17113,projWetSection 共享体 1:1）——818 豁免 id
    //  （P.cs:8013 ignoreWater=true）→ 段门恒闭零行为;插 tick 头与 AI/位移序无
    //  观察差（段内唯一可见面=溅花,豁免即恒无）。位移阻尼不适用（双证见字段块头）。
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      818, !!projectileData(818)?.ignoreWater);
    if (this.a0 < 0) { this.a0 += 4; return; } // 延迟隐身（:44058-44063，Opacity=0）
    if (!this.started) { this.started = true; this.sx = this.cx; this.sy = this.cy; } // :44066-44072
    // CatmullRom 控制点（:44073-44078：端点 -0.1/+1.1 外扩，垂度 = 距离×1.5）
    const ex = this.sx + this.ivx, ey = this.sy + this.ivy;
    const sag = Math.hypot(this.ivx, this.ivy) * 1.5;
    const p1 = { x: this.sx + (ex - this.sx) * -0.1, y: this.sy + (ey - this.sy) * -0.1 + sag };
    const p4 = { x: this.sx + (ex - this.sx) * 1.1, y: this.sy + (ey - this.sy) * 1.1 + sag };
    if (this.op < 1) this.op += 0.4; // :44079-44082（4 update/tick 折算）
    this.rot += Math.sign(this.ivx) * -0.8; // :44083-44085（-0.2×4 update）
    if (this.a1 < 1) this.a1 = 60; // :44086-44089
    this.a0 += 4 / this.a1;        // :44090（每 update 1/ai[1]，4 update/tick）
    const t = Math.max(0, Math.min(1, this.a0));
    const pos = catmullRom(p1, { x: this.sx, y: this.sy }, { x: ex, y: ey }, p4, t);
    this.x = pos.x - this.w / 2;
    this.y = pos.y - this.h / 2;
    if (this.a0 >= 1) { this.dead = true; return; } // :44119-44122
    // 接触（Damage 全程可伤：Damage_CanDealDamage 仅 ai[0]<1 拦截 :11782，此处已过门）
    const gems = countStormTigerGems(game);
    const mul = 1.5 + 0.4 * Math.max(0, gems - 1); // :12107-12111
    const add = (e: unknown) =>
      (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'projectiles');
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const en = ent as never as EnemyLike & import('./WhipTag').WhipTagged & { hurtFx?: (d: number) => void };
      if (en.dead || this.hitSet.has(en.id)) continue; // localNPCHitCooldown=-1 每敌一次
      if (this.x >= en.x + en.w || this.x + this.w <= en.x
        || this.y >= en.y + en.h || this.y + this.h <= en.y) continue;
      this.hitSet.add(en.id);
      en.hurtFx = (d: number) => { en.hurt(d, 0, -1, game, 0, false, 0, true); };   // 鞭 tag 直伤=DPS 计
      const res = resolveWhipTagHit(en, Math.max(1, Math.round(this.damage * mul)), game,
        add, SUMMON_TAG_MUL[818] ?? 1, en.cx, en.cy, this.ownerRef());
      // ★F10（2026-08-31 蓝队三批）：扑击弹 818 生成侧 knockBack=0（:46470
      //  NewProjectile 尾参 0f）→ 原版 StrikeNPC 的 `knockBack>0f && knockBackResist>0f`
      //  双门（NPC.cs:82144）整段不进——击退/冲量归零。旧 (0,-1) 冲量是自造位移，
      //  与 Enemy.hurt 武器支 :12366 的同式双门不一致，归零对齐。
      en.hurt(res.dmg, 0, 0, game, 0, false, 0, true); // kb=0 ⇒ 原版双门不进;fromPlayer=DPS 计
    }
    void this.ownerRef;
  }

  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projFrameImg(818, 0);
    // ★清偿刀 N：switch 覆写 818 → cMinion（Main.cs:22463-22465 无 damage/minion 门,
    //  扑击弹染属主 CritterShampoo 配对染料）——EntitySpriteDraw×Armor.Apply 等价。
    let tex: HTMLCanvasElement | null = img;
    if (img) {
      const p = this.ownerRef();
      const inv = (p as unknown as { inv?: DyeInvSource } | null)?.inv;
      if (inv) {
        const ch = dyeChannelsOf(inv);
        if (ch.cMinion > 0) {
          const dv = getProjDesiredDyeVid({ vid: 818, minion: false, damage: this.damage, aiStyle: projectileData(818)?.aiStyle }, ch);
          if (dv > 0) {
            tex = dyedProjCanvas(img, 0, 0, img.width, img.height, dv,
              { facing: 1, box: { x: this.x, y: this.y, w: this.w, h: this.h },
                lightAt: r.lighting?.lightAt?.bind(r.lighting) ?? null }) ?? img;
          }
        }
      }
    }
    ctx.save();
    ctx.globalAlpha = this.op;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    if (tex) ctx.drawImage(tex, -tex.width / 2, -tex.height / 2);
    else {
      ctx.fillStyle = '#E8C060';
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}

/** 玩家持有沙漠虎宝石数（ownedProjectileCounts[831]，:12107/:46388 等价） */
function countStormTigerGems(game: GameHooks): number {
  let n = 0;
  for (const e of (game as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles) {
    const m = e as MinionProj;
    if (m instanceof MinionProj && !m.dead && m.projId === 831) n++;
  }
  return n;
}

/** MathHelper.AngleTowards（:47591 cubeRot 用）：向 target 步进 maxAngle（最短弧） */
function angleTowards(cur: number, target: number, maxAngle: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = Math.max(-maxAngle, Math.min(maxAngle, d));
  return cur + step;
}

/** MathHelper.AngleLerp（AI_156 归位转向 :52527/:52547 用）：最短弧插值 */
function angleLerp(cur: number, target: number, amount: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * amount;
}

/** MathHelper.WrapAngle：钳到 (−π, π] */
function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

const clamp01 = (v: number): number => v < 0 ? 0 : v > 1 ? 1 : v;
