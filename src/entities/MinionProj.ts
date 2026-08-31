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
import { Arrow, projFrameImg, projFrameCount, projSprite } from './Arrow';
import { resolveWhipTagHit, SUMMON_TAG_MUL } from './WhipTag';
import { applyProjStatus } from './projStatus';
import { projDrawOffsetFor } from './WeaponProj';
import { hitCritters, applyBannerDamageDealt } from './projTargets';
import { projectileData } from '../data/vanillaProjectiles';
import { soundTrackFiles } from '../data/vanillaNpcs';
// DeadCellsMushroomBoiExplosion 编排（L5 批 2026-08-31——随从 owner 权威模拟侧广播补远端）
import { ParticleOrchestraType } from '../net/syncModules';
import { playerCanHitEnemy, canBeChasedBy } from './projTargets';
import { ITEM_DEFS } from '../data/items';
import { viIdFromKey } from '../data/vanillaItemCombat';
import { MushroomBoiExplosionProj, requestMushroomBoiExplosion } from './DeadCellsMushroom';

/** 爆炸烈焰塔三档（3818/3819/3820 → proj 663/665/667，AI_130）：帧 0 待机、
 *  开火动画、第 12t 出火球（弹型/速度/周期/冷却按 FLAMEBURST_TIERS 分层） */
const FLAMEBURST_TOWER = new Set([663, 665, 667]);
/** 弩车三档（AI_134 :65584/1457 :69584）：帧 0 待机、帧 1-5 开火（每 5t）、
 *  开火第 6t（ai[1]==5）出弩箭 680（速 16，T2 套装 21;num2=num6=5,num2 的初值 12 已被
 *  `num2 = num6` 覆写——旧"第12t"是初值误读,2026-08-31 批②修）、25t 结束、
 *  冷却 GetBallistraShotDelay */
const BALLISTA_TOWER = new Set([677, 678, 679]);
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
const MINION_SHOOT: Record<number, { shot: number; speed: number; cd?: number; range?: number; dmgMul?: number; jitter?: number; grav?: number; life?: number; muzzleY?: number; burn?: 'fire' | 'hellfire'; search?: number; precallY?: boolean }> = {
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
  // 登记剩余差：原版检索基点=玩家心 + 射击门 num139<800+40×slot（slot 递增）——
  // 本仓 slot 加成未折算（weapon-minion-ai 回归面覆盖基础窗）
  191: { shot: 195, speed: 11, cd: 30, range: 800, search: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8, precallY: true }, // 掷矛抛物线(aiStyle 1) 手部高度 :58764
  192: { shot: 195, speed: 11, cd: 30, range: 800, search: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8, precallY: true },
  193: { shot: 195, speed: 11, cd: 30, range: 800, search: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8, precallY: true },
  194: { shot: 195, speed: 11, cd: 30, range: 800, search: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8, precallY: true },
  387: { shot: 389, speed: 8, cd: 45, range: 1000, dmgMul: 1.15, life: 300 },  // timeLeft=300(:28981)
  // Foxparks 族（AI_026 flag10 段 :62566-62753）：cd num135 42/30（1113 :62573）；
  // 射程门 num139<800+num134（1113 num134+=360 :62674-62675 → 1160）； muzzleY=-10
  // ★三轮蓝队 F5④ 核证：原版 vector14 = (pos.X+w/2, pos.Y+h/2−8)＝【Center−8】
  //   （:62706,h/2 在原式里即盒心项）→flag8 支 :62740 再 −2 ⇒ Center−10。本表
  //   muzzleY 消费端 = this.cy+muzzleY ⇒ 常数 -10 对任意 h 精确成立（非 h-派生缺位，
  //   是"Center 相对"语义本身——真盒扩容前后零视觉差,登记核证结论）。burn：
  //   1097 命中 ai[1]>0 → OnFire3(323)/否则 OnFire(24)（:11315-11318）——
  //   1094 ai[1]=0 恒火、1113 ai[1]=3/1 恒地狱火（:62744-62752）
  1094: { shot: 1097, speed: 11, cd: 42, range: 800, life: 300, muzzleY: -10, burn: 'fire' }, // Center−10 = :62706−8 & :62740−2
  // 1113 索敌检索 1160（:62674-62675 num134+=360 → num139<800+360 :62691；approach num151=450+180 :62672/:62674）
  1113: { shot: 1097, speed: 11, cd: 30, range: 1160, search: 1160, life: 300, muzzleY: -10, burn: 'hellfire' }, // 6149 可靠的火绒狐（1457 新）
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
 *  967 猎犬弹 Item_60（:24971）。408/433/614/195/389/642 原版无出膛音（AI 无 PlaySound） */
const MINION_SHOT_SFX: Record<number, { track: string; vol: number }> = {
  374: { track: 'Item_17', vol: 0.7 },
  376: { track: 'Item_20', vol: 0.7 },
  378: { track: 'Item_17', vol: 0.7 },
  967: { track: 'Item_60', vol: 0.7 },
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
 *  台账批⑥：旧实现仅中心单格 liquid>0——顶缘浸水浅滩漏判/半浸早判两向漂移 */
export function wetCollisionProbe(
  st: { w: number; h: number; liquid: Uint8Array; slope: Uint8Array; idx(x: number, y: number): number },
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
      } else if (st.slope[idx] > 0 && j > 0) {
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
   *  28551，无态机取橙档）；653 同伴方块白光 0.5（:46598 档位近似）。387/388/
   *  373/375/407/423/266/蜘蛛/虎/阿比盖尔/龙链原版零自发光。 */
  get lightRGB(): [number, number, number] | null {
    switch (this.projId) {
      case 755: return [220 / 255, 20 / 255, 60 / 255];
      case 613: return [0.2, 0.6, 0.7];
      case 623: return [0.9, 0.9, 0.7];
      case 1094: return [0.5, 0.3, 0.1];
      case 533: return [0.8, 0.3, 0.1];
      case 653: return [0.5, 0.5, 0.5];
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
  /** 守护者 AI_120 状态（ai[0]/ai[1]/frameCounter/retarget 计数） */
  private gA0 = 0;
  private gA1 = -1;
  private gFc = 0;
  private gFrame = 0;
  private gRetarget = 0;
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
  /** 地面步行族 StepUp 坡步门（AI_026 :63261 / AI_067 同款 Collision.StepUp——
   *  spiderStep/frogStep 入口置位,moveAndCollide 消费） */
  stepUp = false;
  /** Projectile.tileCollide 镜像（AI 逐态直写,moveAndCollide 消费=false 整段跳过碰撞）：
   *  蜘蛛归位飞行 :61410 false / 地面 :62843-62845 盒无实心回 true / :62852-62860
   *  LOS 目标在下方且脚踩平台 → false（穿平台下扑）;蛙归位飞行 :50648 false /
   *  地面 :51266 true */
  tileCollide = true;
  /** AI_120 当前状态（ai[0]：0 跟随 / 2 冲刺拳击；诊断与回归用） */
  get ai120State(): number { return this.gA0; }
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
    const tgt = this.nearestEnemy(game, 1000);
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
      if (d > 2000) { this.x = p.cx - 30; this.y = p.cy - 30; this.vx = this.vy = 0; }
      else if (d > 100) {
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

  /** 台账批②共用列扫门（AI_067 :51437-51457）：意图方向前柱（中柱+意图+⌊vx⌋）自
   *  盒顶行向下 height/16+1 行逐格探测实心 */
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
   *  @param jumpAboveY 家族 flag20 覆写：设值时额外要求 v15Y<该值（虎 flag3=-80，
   *          :51428-51431）；undefined=全家族默认放行（海盗 flag 等） */
  private ai067WalkChase(
    game: GameHooks, p: Player, ax: number, ay: number,
    tiers: [number, number, number] | null,
    opts?: { wet?: boolean; petting?: boolean; jumpAboveY?: number },
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
    // 跳跃意图（:51413-51466）：flag21 距门 + flag20 家族覆写 + num55 意图协同；
    // 虎=flag3 覆写 flag20=(v15Y<-80)（远平地不打墙跳）;抚摸 num56 强制关闭
    const flag21 = Math.abs(v15x) >= 64 || (v15y <= -48 && Math.abs(v15x) >= 8);
    let jump = false;
    if (intent !== 0 && flag21 && !opts?.petting
      && (opts?.jumpAboveY === undefined || v15y < opts.jumpAboveY)) {
      jump = this.ai67FrontWallScan(st, intent);
    }
    this.stepUp = true;                                 // Collision.StepUp（:51466）
    this.tileCollide = true;                            // :51273 每 tick 置真
    const num62 = getLerpValue(0, 100, v15y) * getLerpValue(-2, -6, this.vy);   // :51509
    moveAndCollide(this, game.world, this.vx, this.vy);
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
   *  · 有目标且索敌通过 CanHitWithOwnBody 本体四试（Minion_FindTargetInRange
   *    skipIfCannotHitWithOwnBody :50525）;盒相交∧下落 → vy=-4/vx=dir×10 兔跳
   *    蹭伤（:51181-51188）
   *  · 接触冷却 SetDefaults localNPCHitCooldown=10（:8095-8096）✔既有显式一致
   *  · 未折算登记：目标脚下 15 格无地扫描→ai[0]=5 与 boss>600→ai[0]=5 追离态
   *    （state5 全态机另批,现触发源仅上述两路径;M 项遗留细化）、flag3 静置尘 269/
   *    AddLight 0.5（渲染层,C 类）、索敌双距（my/player 加权择近）简化单距 */
  private tigerBody(game: GameHooks, p: Player, dmg0: number): void {
    const gems = Math.max(1, this.peerCount(game, 831));
    const scale = 1 + 0.4 * (gems - 1);
    // ai[0]==4 等待态（:50296 起 flag3 特置；动画帧见 draw）
    if (this.tigerA0 === 4) {
      this.vx = this.vy = 0;
      if (--this.tigerA1 <= 0) { this.tigerA0 = 0; this.tigerA1 = 0; }
      return;
    }
    // 特殊攻击门（成功按档冷却/失败 10t 重试）
    if (this.pounceCd > 0) this.pounceCd--;
    else {
      const cd = this.projId === 834 ? 300 : this.projId === 835 ? 240 : 360;
      if (this.tigerSpecialAttack(game, p, dmg0)) { this.pounceCd = cd; return; }
      this.pounceCd = 10;
    }
    const st = game.world.store;
    // 索敌（num2=800 :50136 flag3 覆写 + 视线本体四试）
    let tgt = this.nearestEnemy(game, 800, 'line');
    if (tgt && !canHitWithOwnBodyBox(st, this.x, this.y, this.w, this.h, this.facing,
      tgt.x, tgt.y, tgt.w, tgt.h)) tgt = null;
    const wet = wetCollisionProbe(st, this.x, this.y, this.w, this.h);
    let ax: number, ay: number;
    if (tgt) {
      ax = tgt.cx; ay = tgt.cy;
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
      { wet, jumpAboveY: -80 });
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
   *   · 态机 pirA0=ai[0]（0 地面 / 1 归位飞行 / 2 扑击）、pirA1=ai[1]（扑击倒数 num10=15）
   *   · 归位飞行（:50636-50712 同族）：tileCollide=false、加速 0.2、限速 max(10,|p.v|)；
   *     >2000 瞬移；<200 ∧ 主落地 ∧ 头顶净空 → 落地回 0
   *   · 无目标：跟随锚 (15+p.w/2)+20slot×dir（:50291-50294）＋接地扫描；归位门
   *     500/300（num3/num4 缺省 :50031-50033）
   *   · 有目标：anchor=nPC.Center（flag 无侧翼点）;≤20px → ai[0]=2/ai[1]=15
   *     （num30=20/flag14 支 :51155-51177）；高空俯扑 vy>2∧!wet∧敌顶低于脚底 250px+
   *     → sqrt(2×0.4×h) 反向起跳封顶 26（:51041-51058,X 抖 ±Next×5）
   *   · 接触伤仅在扑击窗（走行 friendly=false :50476 缺省不复位——海盗不在置真名单,
   *     扑击支 :50862 置 true）：SetDefaults localNPCHitCooldown=18（:4765-4770）
   *   · 移动档 flag 档 = 目标在位 1/8/8（:51317-51321）、catch-up 同共轨两结算段
   *   · 未折算登记：落地尘 216/gore 580-583·11-14 两象限（渲染 C 类）、boss>600→
   *     ai[0]=5 态与俯扑前置 position.Y 整分叉 quirk（ai[0]=5 全态机另批）、
   *     海盗攻击帧机 frame=4+(num10-ai1)/(num10/3)(+3 空)（draw 兜底循环差异,C 类） */
  private pirA0 = 0;
  private pirA1 = 0;
  private pirateStep(game: GameHooks, p: Player, dmg0: number): void {
    const st = game.world.store;
    const wet = wetCollisionProbe(st, this.x, this.y, this.w, this.h);
    const tgt = this.nearestEnemy(game, 800, 'line');
    // ---- ai[0]==1 归位飞行（:50636-50712 族档）----
    if (this.pirA0 === 1) {
      this.tileCollide = false;
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
    // ---- 地面态 ----
    let tgtF = tgt && !canHitWithOwnBodyBox(st, this.x, this.y, this.w, this.h, this.facing,
      tgt.x, tgt.y, tgt.w, tgt.h) ? null : tgt;
    if (!tgtF) {
      const dP = Math.hypot(p.cx - this.cx, p.cy - this.cy);
      if (dP > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2; }
      else if (dP > 500 || Math.abs(p.cy - this.cy) > 300) { this.pirA0 = 1; return; }
    }
    if (this.pirA0 === 2) {                              // 扑击态（:50861-50927：friendly 置真+帧+重力+倒数,无速度改写）
      this.vy = Math.min(this.vy + 0.4, 10);
      moveAndCollide(this, game.world, this.vx, this.vy);
      this.contact(game, dmg0, 18);                      // 扑击窗内才有接触伤（friendly=true 支）
      if (--this.pirA1 <= 0) { this.pirA0 = 0; this.pirA1 = 0; }     // num9=0 直回 0
      return;
    }
    // ---- 无目标归位门/有目标锚 ----
    let ax: number, ay: number;
    if (tgtF) {
      ax = tgtF.cx; ay = tgtF.cy;
      // 高空俯扑（:51041-51058）：下落中 ∧ !wet ∧ 敌顶高出脚底 250px → sqrt 蓄力反跳
      if (this.vy > 2 && !wet && tgtF.y + tgtF.h - (this.y + this.h) < -250) {
        const h = (this.y + this.h) - (tgtF.y + tgtF.h);
        this.vy = -Math.min(26, Math.sqrt(Math.max(0, h) * 2 * 0.4));
        this.vx += (Math.random() * 2 - 1) * Math.random() * 5;
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
      } else if (this.projId === 1118) {
        game.playSfxFiles(['pal_foxparks_joy'], 0.35, this.cx, this.cy);  // SoundID.cs:1090 0.35
      }
    }
    if (this.palJoyCd > (flag10 ? 1 : 0)) this.palJoyCd--;
    // ★台账批 C-920（2026-08-31）：抚摸心形气泡的粒子形态近似升级——原版
    //  Main.cs:34799-34832 在 localAI[0]∈(1,60) 窗（=本仓 palJoyCd 同窗）画
    //  EmoteBubble.DrawTemporaryBubble 图标/DrawNotificationIcon 兜底框，本仓无该
    //  资产与 UI 层（登记在案）;改以同窗心跳节拍粉心粒子上浮（spawnParticles
    //  现有基建）替代——形态近似非资产复刻,资产入库后应换图标直绘
    if (flag10 && this.palJoyCd > 1 && this.palJoyCd < 60 && (this.palJoyCd - 8) % 16 === 0) {
      game.spawnParticles(this.cx + Math.sin(this.age * 0.35) * 6,
        this.cy - this.h / 2 - 14, '#FF7FB2', 1, 0.6, { life: 36, grav: -0.01 });
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
    // 台账批⑥：wet = Projectile.wet = Collision.WetCollision 每 tick 盒级浸液判定
    // （Collision.cs:1575-1650,内探针小盒）——旧中心单格近似退役，湿身跳 ×2 消费
    const stWet = game.world.store;
    const wet = wetCollisionProbe(stWet, this.x, this.y, this.w, this.h);
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
      if (Math.hypot(dpx1, dpy1) < 200 && p.vy === 0
        && this.y + this.h <= p.y + p.h
        && !st1.isSolid(Math.floor(this.cx / 16), Math.floor(this.cy / 16))) {
        this.palA0 = 0; this.palA1 = 0;                    // :50668-50676 落地净空退出
        if (this.vy < -6) this.vy = -6;
      }
      return;
    }
    // ---- 索敌（:50496-50508：ai[0]==0||2 才检索；视线门=skipIfCannotHitWithOwnBody）----
    const tgt = this.palA0 === 0 || this.palA0 === 2 ? this.nearestEnemy(game, num2, 'line') : null;
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
      moveAndCollide(this, game.world, this.vx, this.vy);
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
      // 高差起跳（TryJumpingToTarget flag8 段 :51126-51151：下落中且敌高 100+ →
      // sqrt(2×0.4×h)+1 封顶 26）
      if (flag8 && this.vy > 1 && tgt.y + tgt.h - (this.y + this.h) < -100) {
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
    // 跳梯（:51424-51527）：flag20 跳跃意图档 flag8/9 恒 false（:51384-51387）——
    // 仅前方实心探测（num55≠0 且 flag21=|dx|>=64 ||（dy<=-48 且 |dx|>=8）:51424-51457）
    let jump = false;
    const dyA = ay - this.cy;
    const gate = Math.abs(dx) >= 64 || (dyA <= -48 && Math.abs(dx) >= 8);
    if (Math.abs(dx) > 5 && gate) {
      const st = game.world.store;
      const dir = Math.sign(dx);
      const col = Math.floor((this.x + this.w / 2) / 16) + dir + Math.round(this.vx);
      for (let row = Math.floor(this.y / 16); row <= Math.floor(this.y / 16) + this.h / 16 + 1; row++) {
        if (st.isSolid(col, row)) { jump = true; break; }   // :51448-51457
      }
    }
    this.vy = Math.min(this.vy + 0.4, 10);                  // :51553-51556（num=0.4，先加后移=原版 AI 末重力+Update 积分序）
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.onGround) {
      if (jump) {
        const st = game.world.store;
        const col = Math.floor((this.x + this.w / 2) / 16) + Math.sign(dx || 1);
        const row = Math.floor((this.y + this.h / 2) / 16);
        const solid = (oy: number) => st.isSolid(col, row + oy);
        if (!solid(-1) && !solid(-2)) this.vy = -5.1;       // :51470-51490
        else if (!solid(-2)) this.vy = -7.1;
        else if (solid(-5)) this.vy = -11.1;
        else if (solid(-4)) this.vy = -10.1;
        else this.vy = -9.1;
      }
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
    // 台账批⑥：wet = 盒级 WetCollision（Collision.cs:1575-1650）
    const wet = wetCollisionProbe(st, this.x, this.y, this.w, this.h);
    // ---- 索敌（检索档 ai[0]==0||1 :50448-50450;视线门 skipIfCannotHitWithOwnBody）----
    const tgt = this.mbA0 === 0 || this.mbA0 === 1 ? this.nearestEnemy(game, 800, 'line') : null;
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
      }
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
      // 退出门（:50685-50692）：距主 <200 且主落地且自身脚下净空
      if (p.vy === 0 && Math.hypot(p.cx - this.cx, p.cy - this.cy) < 200
        && !st.isSolid(Math.floor(this.cx / 16), Math.floor((this.y + this.h) / 16))) {
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
    // 跳梯（:51424-51527）：flag6 关 flag20 墙意图档（:51384-51386）但 flag21 前柱
    // 探测（|dx|≥64 或 dy≤−48&&|dx|≥8 :51424-51427）仍触发
    let jump = false;
    const dyA = ay - this.cy;
    const gate = Math.abs(dx) >= 64 || (dyA <= -48 && Math.abs(dx) >= 8);
    if (Math.abs(dx) > 5 && gate) {
      const dirS = Math.sign(dx);
      const col = Math.floor((this.x + this.w / 2) / 16) + dirS + Math.round(this.vx);
      for (let row = Math.floor(this.y / 16); row <= Math.floor(this.y / 16) + this.h / 16 + 1; row++) {
        if (st.isSolid(col, row)) { jump = true; break; } // :51448-51457
      }
    }
    this.vy = Math.min(this.vy + 0.4, 10);                // 重力 0.4 封顶 10（:51553-51556）
    this.tileCollide = true;                              // 地面段恒 true（:51266——先于移动）
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.onGround) {
      if (jump) {
        const col = Math.floor((this.x + this.w / 2) / 16) + Math.sign(dx || 1);
        const row = Math.floor((this.y + this.h / 2) / 16);
        const solid = (oy: number) => st.isSolid(col, row + oy);
        if (!solid(-1) && !solid(-2)) this.vy = -5.1;     // :51470-51490
        else if (!solid(-2)) this.vy = -7.1;
        else if (solid(-5)) this.vy = -11.1;
        else if (solid(-4)) this.vy = -10.1;
        else this.vy = -9.1;
      }
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
        ? (ITEM_DEFS[heldSlot.id]?.vid ?? viIdFromKey(ITEM_DEFS[heldSlot.id]?.key ?? ''))
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
      moveAndCollide(this, game.world, this.vx, this.vy);   // 重力+摩擦位移（引擎段等价）
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
      moveAndCollide(this, game.world, this.vx, this.vy);
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
        if (!st.inBounds(x, y)) return;
        if (!st.isSolid(x, y)) return;                  // WorldGen.SolidTile3 门（:39466/:39485）
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
    moveAndCollide(this, game.world, this.vx, this.vy);
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

  private terraprismaBody(game: GameHooks, p: Player, dmg0: number): void {
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

  /** AI_026/AI_067 共用遇障跳梯（1457 Projectile.cs :63220-63290 / :51470-51490）：
   *  前方格（中心列 ±dir + ⌊vx⌋，中心行）实心 → 落地后按头顶净空选起跳档
   *  -5.1/-7.1/-9.1/-10.1/-11.1。返回是否需跳（jump 意图），消费方落地后置 vy */
  private walkerJumpIntent(st: { isSolid(x: number, y: number): boolean; inBounds(x: number, y: number): boolean },
    dirX: number): boolean {
    const col = Math.floor((this.x + this.w / 2) / 16) + dirX + Math.round(this.vx);
    const row = Math.floor((this.y + this.h / 2) / 16);
    return st.inBounds(col, row) && st.isSolid(col, row);
  }

  /** 跳梯选档（:63246-63289 / :51470-51490 同式）：探测列 = 中心列 ±dir + ⌊vx⌋、
   *  行基准 = 脚下行（:63222 num190=(position.Y+height)/16） */
  private walkerJumpLadder(st: { isSolid(x: number, y: number): boolean; inBounds(x: number, y: number): boolean },
    dirX: number): void {
    const col = Math.floor((this.x + this.w / 2) / 16) + dirX + Math.round(this.vx);
    const row = Math.floor((this.y + this.h) / 16);
    const solid = (oy: number) => st.inBounds(col, row + oy) && st.isSolid(col, row + oy);
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
              (ay - this.cy) / l * shooter.speed, dmg, this.knockback, shooter.shot, null,
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
          this.x += this.vx; this.y += this.vy;       // tileCollide=false（:61410）直写位移
          this.spFrame = 3;
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
      this.x += this.vx; this.y += this.vy;
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
    moveAndCollide(this, game.world, this.vx, this.vy);
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
    // 台账批⑥：wet = Collision.WetCollision 盒级判定（Collision.cs:1575-1650），
    // 非中心单格——内探针小盒（min(10,W)×H/2）浸液即湿
    const wet = wetCollisionProbe(st, this.x, this.y, this.w, this.h);
    const tgt = this.nearestEnemy(game, 800, 'line');   // :50213 num2=800 + 视线
    // ---- ai[0]=1 归位飞行（:50636-50712）----
    if (this.frA0 === 1) {
      this.tileCollide = false;                       // :50648
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
      moveAndCollide(this, game.world, this.vx, this.vy);
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
    // 跳梯（:51424-51490 前方实心探测 + 落地选档）与目标高出距离表（:51492-51527）
    let jump = false;
    if (Math.abs(dx) > 5) jump = this.walkerJumpIntent(st, Math.sign(dx));
    this.vy = Math.min(this.vy + 0.4, 10);            // :51553-51557
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.onGround) {
      if (jump) this.walkerJumpLadder(st, Math.sign(dx) || 1);
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
      this.x += this.vx; this.y += this.vy;
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
    this.x += this.vx; this.y += this.vy;
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

  /** 星尘守护者 623（套装奖励，AI_120_StardustGuardian :41969-42299 1:1）：
   *  ai[0] 状态机——0=贴身跟随（Lerp 0.05 至玩家侧后 -(5+w/2)×dir,-25，索敌 500
   *  （|Δx-锚|≤170 门 :42036-42039）， leash 步进 0.1 :42053-42068）→ 2=冲刺拳击
   *  （绕到目标背侧 npc-(dir×(w/2+70),-10)，velocity.MoveTowards(≤6×Remap(50..400,1..4),32)
   *  :42220-42225，每 4t 重锁 :42227-42238）→ 失去目标/超 500 回 0。
   *  状态 1/3 需 HasMinionRestTarget（:42079/:42250，本作无该系统——原版无目标时
   *  即刻回退 ai[0]=0 :42255-42257，故不实装）。
   *  命中仅状态 2：80×40 拳盒于 Center+direction×40（Colliding :14294-14300），
   *  localNPCHitCooldown=5（:6433）；伤害走 resolveWhipTagHit（623 是 minion） */
  private guardianBody(game: GameHooks, p: Player, dmg0: number): void {
    const add = (e: unknown) =>
      (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'projectiles');
    const restX = p.cx - (5 + p.w / 2) * p.facing; // :41995（(5+player.width/2)×direction）
    const restY = p.cy - 25;                        // :41996
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
    // ---- 状态 0：贴身跟随 + 索敌 ----
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
      if (hitCritters(hitbox, game, { minion: true, sentry: this.sentry })) anyHit = true;
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
      let golemCrit = false;
      const gOwn = this.ownerRef();
      if (this.sentry && gOwn?.equipStats.accGolemSentryBackpack && Math.random() < 0.1) golemCrit = true;
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
    else if (projId === 1113) { this.w = 18; this.h = 18; }
    // 蘑菇小伙伴 1022（Dead Cells 联动,5456）：20×30（SetDefaults Projectile.cs:9670-9671）
    else if (projId === 1022) { this.w = 20; this.h = 30; }
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
        if (!en.dead && en.id === focus && Math.hypot(en.cx - bx, en.cy - by) < focusRange) {
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

  fixedUpdate(dt: number, game: GameHooks) {
    void dt;
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
        // AI_Sentries_HeavySlingReposition 头（:70096-70103）：!accSentryBackpack
        // → Kill（携带中卸下背包 = 哨兵当场消亡）
        if (!owner || !owner.equipStats.accSentryBackpack) { this.dead = true; return; }
        owner.accSentryBackpackGrabCooldown = 2;           // :80556 续约占位
        this.vx = 0; this.vy = 0;                          // :37820 velocity = Zero
        // :37821 tileCollide=false + AI_Sentries_HeavySlingReposition default 支
        //（:70259-70265）：Center = MountedCenter（+headgear 微移,本仓省略）——
        // 哨兵背在身上随玩家移动,各塔族开火段照常跑（原版拾起块后 AI 继续 :37824+）
        this.x = owner.cx - this.w / 2;
        this.y = owner.cy - this.h / 2;
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
        //  现有基建直映）；flag = ai[2]!=1（被背包携带态不喷）
        if (!this.carriedByBackpack && game.spawnDust) {
          const fw = Math.floor(this.w / 4);
          const emberX = this.x + fw - (this.facing === 1 ? fw : 0);
          const emberW = this.projId === 663 ? fw * 3 : fw * 2;
          if (Math.floor(Math.random() * 2) === 0) {
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
              Object.assign(new Arrow(s.x - 8, s.y - 8, vx, vy, dmgOf(), this.knockback, tier.shot, null, { grav: 0 }),
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
        }
        if (this.sFire === 0) {
          // 索敌门 = AI_134_Ballista_FindTarget（Projectile.cs:69465-69507）：
          // 候选须 `Collision.CanHitLine(center→NPC.Center)`（:69481/:69503）且不出
          // deadBottomAngle 死锥（|vX|<|vY|×0.75 且目标在下）。调用点 :69647。
          panicClamp();
          const s134y = spotY134();
          const tgt = this.nearestEnemy(game, 900, 'line', 'self', 900,
            { x: this.cx, y: s134y }, { deadBottomAngle: 0.75 });
          if (tgt) this.facing = tgt.cx >= this.cx ? 1 : -1;
          if (tgt && this.sCool <= 0) { this.sFire = 1; this.sFireT = 0; }
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
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              // 680 弩箭：AI_001 默认档（0.1@15 缓坠）——重力缺省走规格链（2026-08-14 对账）
              Object.assign(new Arrow(this.cx - 8, spotY134() - 8, vx, vy, dmgOf(), this.knockback, 680, null),
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
        if (side > 0) {
          let zapped = false;         // 直伤拍标记（供 zap 声窗判定兜底,见批 C-3472 注）
          let fieldEnemy = false;     // ★台账批 C-3472：原版声扫描面（场内有敌即可,不看 LOS/冷却）
          for (const ent of game.enemies()) {
            if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
            const en = ent as EnemyLike & { dead: boolean } & import('./WhipTag').WhipTagged;
            if (en.dead) continue;
            const ax = this.cx - side / 2, ay = this.auraCy - side / 2;
            // myRect.Intersects(targetRect)（方形场盒）——vanilla 扫描的
            // Colliding(Hitbox,nPC.Hitbox) 同面（:69966-69971）
            if (en.x + en.w <= ax || en.x >= ax + side || en.y + en.h <= ay || en.y >= ay + side) continue;
            // targetRect.Distance(Center) < height/2-20（:14540，敌 AABB 到中心最近点距）
            const nx = Math.max(en.x, Math.min(en.x + en.w, this.cx));
            const ny = Math.max(en.y, Math.min(en.y + en.h, this.auraCy));
            if (Math.hypot(this.cx - nx, this.auraCy - ny) >= side / 2 - 20) continue;
            fieldEnemy = true;
            // AI_137_CanHit 视线门（Projectile.cs:71574-71614，2026-08-30 补弧线三试
            // +目标双点:15890/:15894 敌盒中心/敌盒上沿中任一通过即命中；目标格实心直接 false）。
            // ★起点基点核对（Entity.cs:86-96）：base.Top=(X+width/2, position.Y)=场盒顶沿中点，
            //   +UnitY×20 → 起点 = (Center.X, cy − 场盒半高 + 20)；本仓场盒高=auraSide、
            //   场盒竖中心=auraCy → 起点为 (cx, auraCy − side/2 + 20)。旧实现锚在
            //   (cx, auraCy−20) 无 side 归属——小盒(64~160)差 ≤60px 档位级偏移，已对齐。
            if (!lightningAuraCanHitFrom(game.world.store, this.cx, this.auraCy - side / 2 + 20, en.cx, en.cy)
              && !lightningAuraCanHitFrom(game.world.store, this.cx, this.auraCy - side / 2 + 20, en.x + en.w / 2, en.y)) {
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
            en.hurt(applyBannerDamageDealt(game, en, res.dmg), 0, 0, game, 0, false, 1, true, penPctAura); // 哨兵射击=单发弹语义;penPercent 门=:13266-69;fromPlayer=DPS 计
            applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
          }
          // ★台账批 C-3472（2026-08-31）：电弧声密度对齐原版 ai[0] 循环（AI_137
          //  :69955-69979：ai[0]++ %num3==0 时扫场，场内有敌才 PlayTrackedSound——
          //  num3=30/僧侣T2 -5→25、T3 不改字面）。旧"每直伤 tick 一声"密度 ×30。
          //  真值节拍：zapCycle==period-1 且本轮扫描见敌 → 一声。PlayTrackedSound 的
          //  跨 tick 续播缓冲不入模（单发 wav 密度对齐,C 类已注）。
          this.zapCycle++;
          const zapPeriod = dd2SetFlags(game.player).monkT2 ? 25 : 30;
          if (this.zapCycle >= zapPeriod) {
            this.zapCycle = 0;
            if (fieldEnemy || zapped) {
              game.playSfxFiles(soundTrackFiles('dd2_lightning_aura_zap'), 0.5, this.cx, this.auraCy);
            }
          }
        }
        return;
      }
      // 爆炸机关族（AI_138）：每 3t 探测中心上方 48px 的 144×144 盒——有敌即
      // 原地爆炸 AoE（proj 694 等价）+ 粒子 + 冷却 90（GetExplosiveTrapCooldown）
      if (TRAP_TOWER.has(this.projId)) {
        if (--this.sCool <= 0) {
          this.sCool = 3;
          const ecx = this.cx, ecy = this.cy - 48;
          const hit = (game.enemies() as EnemyLike[]).some((en) =>
            !en.dead && Math.abs(en.cx - ecx) < 72 + en.w / 2 && Math.abs(en.cy - ecy) < 72 + en.h / 2);
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
                en.hurt(applyBannerDamageDealt(game, en, dmgOf()), Math.sign(en.cx - this.cx) * this.knockback, -2, game, 0, false, 1, true); // 单发弹语义;fromPlayer=DPS 计
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
              dmgOf(), this.knockback, s53.shot, null, { grav: 0, life: s53life }), { whipTagShot: true }), // SentryShot 吃鞭 tag（ProjectileID.cs:199）
            'projectiles');
        }
        if (this.sCool > 0) this.sCool--; // :27377-27380（目标有无均递减）
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
                  en.hurt(applyBannerDamageDealt(game, en, dmgOf()), Math.sign(en.cx - px) * this.knockback, -2, game, 0, false, 1, true); // 单发弹语义;fromPlayer=DPS 计
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
                dmgOf(), this.knockback, ss.shot, null, { grav: 0 }), { whipTagShot: true }),
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
            Object.assign(new Arrow(this.cx - 5, this.cy - 5, Math.cos(ang) * 6, Math.sin(ang) * 6, dmgOf(), this.knockback, this.projId, null), { whipTagShot: true }),
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
        const flameSpd = this.projId === 1113 ? 31.5 : 15; // num17 ×3 补偿（:60072/:60074）
        const flame = new Arrow(this.cx - 3, this.cy - 3, this.foxAimX * flameSpd, this.foxAimY * flameSpd,
          Math.max(1, Math.round(dmg0 * 0.85)), 0, 1106, null,
          { grav: 0, life: 24, pierce: 4 });
        flame.ignite = true; // 命中 OnFire 300t（PR:11002-11004）
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
          Math.max(1, Math.round(dmg0)), this.knockback, 1120, null,
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
      this.x += this.vx;
      this.y += this.vy;
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
      this.x += this.vx;
      this.y += this.vy;
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
      moveAndCollide(this, game.world, this.vx, this.vy);
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
        const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy);
        // 387 双子激光眼需视线（:28982 CanHitLine 门；AI_062 五族无此门）
        if (this.projId === 387 && !canHit(game.world.store, this.x, this.y, this.w, this.h, tgt.x, tgt.y, tgt.w, tgt.h)) return;
        if (d <= (shooter.range ?? 700)) {
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
            dmg, this.knockback, shooter.shot, null, { grav: shooter.grav ?? 0, life: shooter.life ?? 1200 });
          shot.whipTagShot = true; // MinionShot 吃鞭 tag（WhipTagEffect.cs:73-84）
          // 1097 火球命中按生成侧 ai[1] 分档（Projectile.cs:11315-11318）：ai[1]>0 →
          // OnFire3(323) 300-600t / 否则 OnFire(24)——1094 ai[1]=0 恒火、1113 ai[1]=3/1
          // 地狱火（:62744-62752 num159）
          if (shooter.burn === 'fire') shot.ignite = true;
          else if (shooter.burn === 'hellfire') shot.igniteHellfire = true;
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
    const frames = projFrameCount(this.projId);
    let frame: number;
    if (this.projId === 623) {
      frame = this.gA0 === 2 ? this.gFrame : this.gFrame % 8; // AI_120：攻击 12-19 / 行走 0-7
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
    const img = projFrameImg(this.projId, frame);
    // ---- ★三轮蓝队 F5①：爆炸烈焰塔 663/665/667 半帧专绘（Main.cs:34075-34086）----
    // 原版帧内是【左右两半镜像塔身】（rectangle23.Width/=2 后按 ai[2] 选半——ai[2]==1
    // 仅哨兵背包携行态,本仓不建模 ⇒ 恒取左半,与原版默认摆位一致）；锚 = Bottom 系：
    // draw pos=BoxBottom、origin=(半宽/2, 半高−4) ⇒ 贴图底 4px 探出盒底。旧通用路径
    // 以整宽帧(74/96/92px)从盒顶左落锚=双影横排+整体偏下（放大前后视觉差最重一档）。
    if (this.sentry && FLAMEBURST_TOWER.has(this.projId)) {
      const sheet = projSprite(this.projId);
      if (sheet) {
        const framesN = Math.max(1, frames);
        const fh = sheet.height / framesN;
        const halfW = Math.floor(sheet.width / 2);
        const sx = 0;                                    // ai[2]==0 → 左半
        const sy = Math.round(frame * fh);   // 与 projFrameImg round 语义同源
        ctx.save();
        if (this.alphaFade > 0) ctx.globalAlpha = Math.max(0, (255 - this.alphaFade) / 255);
        // 炮向翻转：AI_130 首帧 direction=spriteDirection=player.direction（:69340）——
        // 原版由 SpriteEffects 镜像；本仓 scale(-1,1) 绕锚镜像,源半恒取左半
        ctx.translate(this.cx, this.cy + this.h / 2);
        if (this.facing < 0) ctx.scale(-1, 1);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sheet as CanvasImageSource,
          sx, sy, halfW, fh,
          -halfW / 2, -(fh - 4), halfW, fh);              // origin=(半宽/2, 半高−4)
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
    // 已废）。AI_026 族 spriteDirection 恒 −1（零赋值）→ 动态项 dirX=−1;
    // 旋转族(rotation)绕 anchor 旋转 = 原版 spriteBatch(anchor,origin,rotation) 同构
    const off3 = img ? (projDrawOffsetFor(this.projId, -1, this.h) ?? [0, 0, 0]) : null;
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
    ctx.save();
    ctx.globalAlpha = this.op;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    if (img) ctx.drawImage(img, -img.width / 2, -img.height / 2);
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
