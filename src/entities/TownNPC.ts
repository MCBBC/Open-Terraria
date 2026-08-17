// 城镇 NPC：游走、夜间回家、对话气泡
// 贴图 = 原版 Images/NPC_{id}（Terarria1456 素材条），帧语义按原版 FindFrame 城镇分支
// （NPC.cs:69152+）：地面站定=帧0；腾空=帧1；行走帧 2..frames-extra-1 循环
// （frameCounter += |vx|*2+1 每 tick，>6 推进一帧，越界回卷帧2）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { openDoor, closeDoor as closeDoorTile, shiftTallGate } from '../world/Door';
import { TILE_BY_KEY as TILE_BY_KEY_DOOR_TILES, TILE_DEFS } from '../data/tiles';
import type { TileStore } from '../world/TileStore';
import { TOWN_NPC_IDS, VANILLA_NPCS } from '../data/vanillaNpcs';
import { isNpcTownShimmerable, findShimmerFreeSpot } from '../stats/Shimmer';
import { townNpcAltTexture, townNpcProfileSheet, shouldBestiaryGirlBeLycantrope } from '../data/townNpcProfiles';
import { getAttackDamageForTownNPC, mainDifficulty } from '../stats/ScaleStats';
import { hslToRgb } from '../player/Appearance';
import { newNpcName } from '../i18n/RandomText';
import { canHit } from '../physics/LineOfSight';
import {
  TOWN_ATTACK_TIME, TOWN_ATTACK_CHANCE, TOWN_ATTACK_TYPE, TOWN_DANGER_RANGE,
  TOWN_MELEE, TOWN_BOW, TOWN_MAGIC, TOWN_SWING, TOWN_PRETTY_SAFE,
  type TownShotParams,
} from '../data/vanillaTownAttack';
import { TownShot } from './TownShot';
import { visEffectFrames, mouseTextColorApprox } from './Enemy';

export interface NpcHome { x: number; y: number; }

// ===================== 坐姿（AI_007 ai[0]==5）纯函数 =====================
// 可坐格族 = TileID.Sets.CanBeSatOnForNPCs（TileID.cs:211）恰好 {15 椅, 497 马桶}
// ——王座(102)/长凳(89) 只在 CanBeSatOnFor*Players* 集，城镇 NPC 不坐；
// 按 sheet 反查内部 tile id（LiquidSim bySheet 同款 reduce）
const sheetTileIds = (sheets: ReadonlySet<number>): ReadonlySet<number> => new Set(
  TILE_DEFS.reduce<number[]>((acc, d, id) => {
    if (d.vanilla && sheets.has(d.vanilla.sheet)) acc.push(id);
    return acc;
  }, []),
);
const CHAIR_TILE_IDS = sheetTileIds(new Set([15]));
const TOILET_TILE_IDS = sheetTileIds(new Set([497]));
/** 不坐椅的城镇实体（FindGoodRestingSpot :53214：type 638 狗 / 656 兔宠物 +
 *  IsTownSlime 族 NPCID.cs:4446 = 670/678-684——它们只在地面休息位趴窝） */
const NO_SIT_NPC_IDS = new Set([638, 656, 670, 678, 679, 680, 681, 682, 683, 684]);

/** FindGoodRestingSpot 扫描期成员判定（:53223 CanBeSatOnForNPCs，无 style 门——
 *  style 门在 TryForcingSitting，见 canSitAt） */
export function isSitTile(tileId: number): boolean {
  return CHAIR_TILE_IDS.has(tileId) || TOILET_TILE_IDS.has(tileId);
}

/** AI_007_TryForcingSitting 坐下门（NPC.cs:53269-53275）：椅/马桶格 + 椅子
 *  style 27 排除（type 15 且 frameY∈[1080,1098]——上格 1080 / 下格 1098 两帧
 *  恰好夹住该样式行带；马桶无此门） */
export function canSitAt(tileId: number, frameY: number): boolean {
  if (TOILET_TILE_IDS.has(tileId)) return true;
  if (!CHAIR_TILE_IDS.has(tileId)) return false;
  return frameY < 1080 || frameY > 1098;
}

export interface SitSpot { x: number; y: number; }

/** AI_007_FindGoodRestingSpot 夜椅扫描（NPC.cs:53195-53262）：
 *  - 自 home 向下找地面（SolidOrSlopedTileOrPlatform = 实心非 top 或平台，:53186）
 *  - ±7 列 × 行 {+2,0,-2,-4,-6}（num2/num4/num3/num6）扫可坐格；上格(frameY%40==0)
 *    仅当 row+1<=floorY+2 收（:53224），下格恒收
 *  - 取 |dx|+|dy| 最小（严格 <，先到先得，:53226-53233）
 *  - 归一（:53247-53252）：下格(frameY%40!=0)先 -1 再 +2、上格直接 +2 → 返回
 *    {x, y}=落座地面行（椅上格 +2 = 地面行）。无椅 → null（白天原版直接返回
 *    home 地面（:53209-53212），由调用方不调本扫描） */
export function findChairSpot(st: TileStore, homeX: number, homeY: number): SitSpot | null {
  let fx = homeX, fy = homeY;
  if (fx < 0 || fy < 0) return null;                       // :53200-53203 home 无效
  while (fy < st.h - 20 && !(st.isSolid(fx, fy) || st.isPlatform(fx, fy))) fy++;
  let best: { x: number; y: number; d: number; frameY: number } | null = null;
  for (let i = fx - 7; i <= fx + 7; i++) {
    for (let r = fy + 2; r >= fy - 6; r -= 2) {
      if (!st.inBounds(i, r)) continue;
      const ti = st.idx(i, r);
      if (!isSitTile(st.type[ti])) continue;               // tile.active() 同义（type!=0）
      const topFrame = st.frameY[ti] % 40 === 0;
      if (topFrame && !(r + 1 <= fy + 2)) continue;        // :53224
      const d = Math.abs(i - fx) + Math.abs(r - fy);       // :53226
      if (!best || d < best.d) best = { x: i, y: r, d, frameY: st.frameY[ti] };
    }
  }
  if (!best) return null;                                  // :53255-53257
  let ry = best.y;
  if (best.frameY % 40 !== 0) ry--;                        // :53249-53251 下格 → 上移一行
  ry += 2;                                                 // :53252 → 地面行
  return { x: best.x, y: ry };
}

/** 坐姿朝向（:53284 / PlayerSittingHelper.cs:231 同式）：frameX!=0（椅 flip 档
 *  +18）→ 1 朝右，否则 -1 朝左 */
export function chairFacing(frameX: number): number {
  return frameX !== 0 ? 1 : -1;
}

/** 坐姿锚（:53285-53286）：Bottom = (x*16 + 8 + 2*dir, y*16)——脚底贴地面行顶，
 *  比玩家坐姿（PlayerSittingHelper 座面上 16px）更低，即原版城镇 NPC"陷坐"观感 */
export function sittingAnchor(x: number, y: number, dir: number): { x: number; y: number } {
  return { x: x * TILE + 8 + 2 * dir, y: y * TILE };
}

/** 入座时长（:53283）：ai[1] = 900 + rand(10800) */
export const SIT_TIME_BASE = 900;
export const SIT_TIME_RAND = 10800;
/** 时限起身后的转向冷却（:54707 localAI[3] = 30 + rand(60)；本仓由 wanderT 承接） */
export const SIT_STAND_WANDER_BASE = 30;
export const SIT_STAND_WANDER_RAND = 60;

/** 坐姿帽 Y 修正链 num6（Main.cs:26965-26987：ai[0]==5 时默认 −4，例外表如下；
 *  550/588 原版显式列 −4 = 默认值，不重复入表） */
export const SITTING_HAT_OFFSET_Y_DEFAULT = -4;
export const SITTING_HAT_OFFSET_Y: Record<number, number> = {
  38: -8, 124: -2, 108: -6, 178: -6, 637: -12, 663: -8,
};
/** 坐姿帽 Y 修正取值（Renderer.drawPartyHat 消费） */
export function sittingHatY(id: number): number {
  return SITTING_HAT_OFFSET_Y[id] ?? SITTING_HAT_OFFSET_Y_DEFAULT;
}

// ===================== 攻击/坐姿帧带基准（FindFrame NPC.cs:69320 num58 族）=====================
/** NPCID.Sets.AttackFrameCount（NPCID.cs:4833，默认 0）。num58 =
 *  npcFrameCount − AttackFrameCount（NPC.cs:69320）——坐姿帧 num58−3
 *  （:69637-69643）、攻击帧 num58..num58+3（:69765-69847）、聊天/表演帧
 *  num58−1..−5 族全部以它为带基 */
export const TOWN_ATTACK_FRAME_COUNT: Record<number, number> = {
  17: 4, 18: 4, 19: 4, 20: 2, 22: 5, 37: 0, 38: 4, 54: 2, 107: 4, 108: 2,
  124: 4, 142: 4, 160: 2, 178: 4, 207: 4, 208: 4, 209: 5, 227: 4, 228: 5,
  229: 5, 353: 4, 633: 4, 368: 5, 369: 4, 453: 4, 441: 4, 550: 4, 588: 4,
  663: 2, 637: 0, 638: 0, 656: 0, 670: 0, 678: 0, 679: 0, 680: 0, 681: 0,
  682: 0, 683: 0, 684: 0,
};

/** num58（NPC.cs:69320）：frames = vanilla-npcs.json frames（= Main.npcFrameCount） */
export function townNpcBaseFrame(vanillaId: number, frames: number): number {
  return frames - (TOWN_ATTACK_FRAME_COUNT[vanillaId] ?? 0);
}

/** GetShootingFrame（NPC.cs:67061-67083）：弓态瞄准帧偏移——ai[2]（= holdAim，
 *  钳 ±0.5）分五档 −4/0/1/2/3；枪族五人 {22 向导,209 电子人,228 巫医,229 海盗,
 *  368 游商} +1 档移（平射 −4→1、≥−0.1 再 +1） */
export function shootingFrameOffset(vanillaId: number, aimY: number): number {
  let n = -4;
  if (aimY < -0.3) n = 1;
  if (aimY < -0.1) n = 0;
  if (aimY > 0.1) n = 2;
  if (aimY > 0.3) n = 3;
  if (vanillaId === 228 || vanillaId === 229 || vanillaId === 209
    || vanillaId === 22 || vanillaId === 368) {
    if (n === -4) n = 1;
    if (aimY >= -0.1) n++;
  }
  return n;
}

// ===================== shimmerTransparency（NPC.cs:6112，0..1）=====================
export const SHIMMER_ST_RAMP = 0.01;      // 浸微光 +0.01/t（:92469）
export const SHIMMER_ST_TRANSFORM = 0.9;  // >0.9 触发 GetShimmered（:92471）
export const SHIMMER_ST_RISE = 0.89;      // 城镇转化置 0.89（:92568）
export const SHIMMER_ST_DECAY_RISE = 1 / 60;  // ai[0]=25 上升态 −1/60/t（:53625）
export const SHIMMER_ST_DECAY_HIT = 0.1;      // justHit −0.1/t（:92484）
export const SHIMMER_ST_DECAY_IDLE = 0.001;   // 常规 −0.001/t（:92492）

/** shimmerTransparency 每 tick 推进（赋值时序 NPC.cs:92468-92497 + :53625）：
 *  浸微光 +0.01 cap 1（rise 态抑制——GetShimmered 已摘除 buff 353（:92570-92573），
 *  上升态内 shimmering 恒 false，st 走 −1/60 衰减）；非浸按 justHit/rise/常规
 *  三档衰减，下限 0。>0.9 的转化触发由调用方判（见 fixedUpdate 微光块） */
export function shimmerTransparencyNext(
  st: number, shimmering: boolean, justHit: boolean, rise: boolean,
): number {
  if (shimmering && !rise) return Math.min(1, st + SHIMMER_ST_RAMP);
  const rate = justHit ? SHIMMER_ST_DECAY_HIT : rise ? SHIMMER_ST_DECAY_RISE : SHIMMER_ST_DECAY_IDLE;
  return Math.max(0, st - rate);
}

/** 消费①：本体渐显/渐隐（GetAlpha NPC.cs:94874-94878：CurrentlyShimmerTransparent
 *  → 四通道 ×(1−shimmerTransparency)；Renderer 本体 alpha 用） */
export function shimmerBodyAlpha(shimmerTransparency: number): number {
  return 1 - shimmerTransparency;
}

/** 消费②：160 松露人微光态 Glow RGB 衰减（Main.cs:25770-25776：case 160 专属，
 *  209 无此档）——'lighter' 加性混合下 tint RGB ×(1−st) ≡ alpha ×(1−st) */
export function shimmerGlowAlpha(baseAlpha: number, shimmerTransparency: number): number {
  return shimmerTransparency > 0 ? baseAlpha * (1 - shimmerTransparency) : baseAlpha;
}

// ===================== ai[0]=25 微光上升态（NPC.cs:53594-53682）=====================
export const SHIMMER_RISE_VELOCITY_TICK = 30;   // ai[1]≥30 起 st 衰减 + 上浮速度（:53621）
export const SHIMMER_RISE_END_TICK = 75;        // ai[1]≥75 且 st≤0 → 转化收尾（:53653）
export const SHIMMER_RISE_PAUSE = 30;           // 远距落点后 ai[2]=30 暂停（:53604）
export const SHIMMER_RISE_TELEPORT_DIST = 560;  // 落点位移 ≥560px 才暂停+发送粒子（:56001）

/** Utils.Remap（Utils.cs:313，clamped 默认 true）：fromMin..fromMax 归一后
 *  线性映到 toMin..toMax（区间外钳端值） */
export function remapClamped(
  v: number, fromMin: number, fromMax: number, toMin: number, toMax: number,
): number {
  const t = fromMax === fromMin ? 0 : (v - fromMin) / (fromMax - fromMin);
  return toMin + (Math.max(0, Math.min(1, t))) * (toMax - toMin);
}

/** Main.IsItStorming（Main.cs:2978 = _shouldUseStormMusic；UpdateWindyDayState
 *  :12927-12960 迟滞机，阈值 _minWind 0.34/_maxWind 0.4/_minRain 0.4/_maxRain
 *  0.5 见 Main.cs:66137-66140）逐步推进的纯函数：无云恒 false；低雨/低风翻
 *  false；高雨(≥0.5)+强风(|w|≥0.4) 翻 true；中间带保持前值（迟滞）。带 prev
 *  逐步喂入 ≡ 原版每帧重算的全局字段。remixWorld 强制 false 分支本仓无 remix 世界 */
export function isItStormingNext(cloudAlpha: number, windSpeedTarget: number, prev: boolean): boolean {
  if (cloudAlpha === 0) return false;
  if (cloudAlpha < 0.4 || Math.abs(windSpeedTarget) < 0.34) return false;
  if (cloudAlpha >= 0.5 && Math.abs(windSpeedTarget) >= 0.4) return true;
  return prev;
}

// ===================== Boss 击杀进度强化链（AI_007_TownEntities NPC.cs:53400-53557）=====================
// num2 = 伤害乘区（先于难度曲线：num = GetAttackDamage_ForTownNPC(num × num2)，
// 四攻击态入参 ：54897/:55169/:55319/:55466）；num3 = 攻击频率门除数（:55859
// num123=(int)(AttackAverageChance×num3)，钳 ≥1 后 rand(num123)==0）。两者在同一
// isLikeATownNPC 块内逐项累计。块内不属本函数的条目：防御档 :53401-53412
// （dryadWard +20/15/10 按难度——树妖结界 buff 本仓无载体，hurt 侧防御链另批）、
// type==209 num3÷3（:53548，attackUpdate 消费点内联）、对话中 num3×0.8（:55617，
// 本仓 talking 恒不入攻击态——触发门 :835 已挡，不可达登记）。
/** 进度强化链输入（全 bool；各字段 = 原版静态位/实例位，括注声明行+置位点） */
export interface TownNpcProgression {
  combatBookWasUsed: boolean;            // NPC.combatBookWasUsed（:6256；书 4382 使用 Player.cs:44710）
  combatBookVolumeTwoWasUsed: boolean;   // NPC.combatBookVolumeTwoWasUsed（:6258；书 5336 Player.cs:44723）
  downedSlimeKing: boolean;              // NPC.downedSlimeKing（:6270；case 50 event 11 :80217）
  downedBoss1: boolean;                  // NPC.downedBoss1（:6262；克眼 4 event 13 :80242）
  downedDeerclops: boolean;              // NPC.downedDeerclops（:6314；668 event 25 :80156）
  downedBoss2: boolean;                  // NPC.downedBoss2（:6264；世吞/克脑 13/14/15/266 event 14 :80258）
  downedBoss3: boolean;                  // NPC.downedBoss3（:6266；骷髅王 35 event 15 :80264）
  downedQueenBee: boolean;               // NPC.downedQueenBee（:6268；蜂后 222 event 8 :80188）
  hardMode: boolean;                     // Main.hardMode（肉山 113 → WorldGen.StartHardmode :80286）
  downedQueenSlime: boolean;             // NPC.downedQueenSlime（:6312；657 event 24 :80159）
  downedMechBoss1: boolean;              // NPC.downedMechBoss1（:6340；毁灭者 134 event 16 :80277）
  downedMechBoss2: boolean;              // NPC.downedMechBoss2（:6342；双子 125/126 event 17 :80227）
  downedMechBoss3: boolean;              // NPC.downedMechBoss3（:6344；Prime 127 event 18 :80270）
  downedPlantBoss: boolean;              // NPC.downedPlantBoss（:6280；世花 262 event 12 :80234）
  downedEmpressOfLight: boolean;         // NPC.downedEmpressOfLight（:6310；光女 636 event 23 :80153）
  downedFishron: boolean;                // NPC.downedFishron（:6286；猪鲨 370 event 7 :80150）
  downedGolemBoss: boolean;              // NPC.downedGolemBoss（:6282；石巨人 245 event 6 :80147）
  downedAncientCultist: boolean;         // NPC.downedAncientCultist（:6298；拜月教主 439 event 9 :80195）
  skyblockLowTiles: boolean;             // WorldGen.Skyblock.lowTiles（WorldGen.cs:3076；天空盒世界扫块率<0.1 置位 :3210-3216）
  tipsy: boolean;                        // NPC.tipsy（:6146；buff 25 UpdateNPC_BuffSetFlags :93179）
}

/** num2/num3 进度强化链 1:1（NPC.cs:53400-53557，仅 isLikeATownNPC 块内条目）。
 *  返回 damageMul=num2 / chanceMul=num3。顺序敏感项：Skyblock 的 num3 折半
 *  （num3>1 才取 (num3+1)/2，:53542-53545，非乘法）在链中段；tipsy 在链尾
 *  乘算（:53555 damage×1.1 / :53556 chance×0.9）。209 的 num3÷3（:53548）
 *  在 Skyblock 之后、tipsy 之前——由消费点内联（对乘法项可交换，仅与 Skyblock
 *  折半的组合序有差；skyblockLowTiles 本仓恒 false，见 fromWorld 登记） */
export function townNpcProgressionBoost(p: TownNpcProgression): { damageMul: number; chanceMul: number } {
  let damage = 1;                        // num2 = 1f（:53400）
  let chance = 2;                        // num3 = 2f（:53413）
  if (p.combatBookWasUsed) {             // :53419-53425（lifeMax+250/防+8 留 hurt 侧）
    chance *= 0.8; damage += 0.25;
  }
  if (p.combatBookVolumeTwoWasUsed) {    // :53426-53432
    chance *= 0.8; damage += 0.25;
  }
  if (p.downedSlimeKing) {               // :53437-53442
    chance *= 0.985; damage += 0.05;
  }
  if (p.downedBoss1) {                   // :53443-53448
    chance *= 0.985; damage += 0.05;
  }
  if (p.downedDeerclops) {               // :53449-53454
    chance *= 0.985; damage += 0.1;
  }
  if (p.downedBoss2) {                   // :53455-53460
    chance *= 0.985; damage += 0.1;
  }
  if (p.downedBoss3) {                   // :53461-53466
    chance *= 0.985; damage += 0.1;
  }
  if (p.downedQueenBee) {                // :53467-53472
    chance *= 0.985; damage += 0.1;
  }
  if (p.hardMode) {                      // :53473-53478（+0.4 最大单项）
    chance *= 0.985; damage += 0.4;
  }
  if (p.downedQueenSlime) {              // :53479-53484
    chance *= 0.985; damage += 0.15;
  }
  if (p.downedMechBoss1) {               // :53485-53490
    chance *= 0.985; damage += 0.15;
  }
  if (p.downedMechBoss2) {               // :53491-53496
    chance *= 0.985; damage += 0.15;
  }
  if (p.downedMechBoss3) {               // :53497-53502
    chance *= 0.985; damage += 0.15;
  }
  if (p.downedPlantBoss) {               // :53503-53508
    chance *= 0.985; damage += 0.15;
  }
  if (p.downedEmpressOfLight) {          // :53509-53514
    chance *= 0.985; damage += 0.15;
  }
  if (p.downedFishron) {                 // :53515-53520
    chance *= 0.985; damage += 0.15;
  }
  if (p.downedGolemBoss) {               // :53521-53526
    chance *= 0.985; damage += 0.15;
  }
  if (p.downedAncientCultist) {          // :53527-53532（防 +20 最大防御项）
    chance *= 0.985; damage += 0.15;
  }
  if (p.skyblockLowTiles) {              // :53540-53547（netMode!=1 单机恒过）
    if (chance > 1) chance = (chance + 1) / 2;
    damage += 0.5;
  }
  if (p.tipsy) {                         // :53552-53557（链尾乘算）
    damage *= 1.1; chance *= 0.9;
  }
  return { damageMul: damage, chanceMul: chance };
}

/** world.flags → 进度强化链输入。Boss 旗标本仓 = Game Boss 槽击杀通用记账
 *  `downed_<vanillaId>`（Game.ts 击败链，双子归一 125；世吞归一 13/克脑 266），
 *  与 Game.shopCondOk 同源键序；旧档/导入别名（downedEyeOfCthulhu/downedSkeletron/
 *  downedSlimeKing）双读。恒 false 两项 = 精确登记非近似：
 *  - skyblockLowTiles：WorldGen.Skyblock.ScanTiles 只在世界装载时跑一次
 *    （WorldFile.cs:771），活跃块率 <0.1 且 skyblockWorld 才置（WorldGen.cs
 *    :3210-3216）。本仓无 skyblock 世界生成链（sf.skyblock 仅拒绝墓园 pass,
 *    生成的是常规满图世界 >10%），WldParser 导入亦不保留该位 → 本仓可产的
 *    任何世界恒 false,不可拿 seedFlags.skyblock 近似；
 *  - tipsy：NPC 实例位非世界旗标（buff 25,:93179）——本函数恒 false,由消费点
 *    （attackUpdate 触发门 / swingUpdate / shootAt）按 this.tipsy 覆盖；施加链
 *    = 麦酒弹 669 Kill 爆炸（TownShot.kill669,Projectile.cs:68725-68734） */
export function townNpcProgressionFromWorld(world: {
  flags: Record<string, boolean>;
}): TownNpcProgression {
  const f = world.flags;
  return {
    combatBookWasUsed: !!f.combatBookWasUsed,
    combatBookVolumeTwoWasUsed: !!f.combatBookVolumeTwoWasUsed,
    downedSlimeKing: !!(f['downed_50'] || f.downedSlimeKing),
    downedBoss1: !!(f['downed_4'] || f.downedEyeOfCthulhu),
    downedDeerclops: !!f['downed_668'],
    downedBoss2: !!(f['downed_13'] || f['downed_266']),
    downedBoss3: !!(f['downed_35'] || f.downedSkeletron),
    downedQueenBee: !!f['downed_222'],
    hardMode: !!f.hardMode,
    downedQueenSlime: !!f['downed_657'],
    downedMechBoss1: !!f['downed_134'],
    downedMechBoss2: !!(f['downed_125'] || f['downed_126']),
    downedMechBoss3: !!f['downed_127'],
    downedPlantBoss: !!f['downed_262'],
    downedEmpressOfLight: !!f['downed_636'],
    downedFishron: !!f['downed_370'],
    downedGolemBoss: !!f['downed_245'],
    downedAncientCultist: !!f['downed_439'],
    skyblockLowTiles: false,
    tipsy: false,
  };
}

export class TownNPC extends Entity {
  w = 20; h = 42;
  stepUp = true;
  stepUpHolds = true; stepUpNpc = true;   // holdsMatching + IgnoredByNpcStepUp（NPC.cs:54382 flag22 恒 true） // 原版 NPC 全体走 Collision.StepUp（NPC.cs:54382）
  npcKey: string; // 'guide'
  /** 原版 NPCID（TOWN_NPC_IDS；Renderer 经 atlas.vnpc 取 NPC_{id}.png 贴图条） */
  vanillaId: number;
  facing = 1;
  /** 随机名字（NPC.getNewNPCNameInner 名字池；无池类型如守卫老人为空串） */
  givenName = '';
  animT = 0;
  frame = 0;       // 当前贴图帧（原版 frame.Y/帧高）
  frameT = 0;      // 行走帧累加器（≈原版 frameCounter）
  wanderT = 0;
  home: NpcHome | null = null;
  /** 定点站岗（守卫老人）：门口地带是山坡+塔心竖井,白天的自由游走会坠入地牢；
   *  原版观感也是整日守在门口走廊 */
  stationary = false;
  /** 被绑待救援（原版为独立 NPC 类型：BoundGoblin105/BoundWizard106/BoundMechanic123/
   *  WebbedStylist354/GolferRescue589，本作以本标记近似；渲染按真帧走各捆绑姿态表——
   *  Renderer.BOUND_NPC_SHEET。原地不动，右键解救 → savedXxx 旗标置位成为正式城镇 NPC） */
  bound = false;
  // ---- NPC 开关门（原版 AI_007，NPC.cs:54478 开门 / 54243 过门关门）----
  private closeDoor = false;
  private doorX = 0; private doorY = 0;
  /** 白天游走但不远离 home(守卫老人:锚地牢门口走廊,防走失) */
  leashHome = false;
  /** 正在与玩家对话（原版 AI_007 :53721：talkNPC==本体 → ai[0]=0 站定、面向玩家） */
  talking = false;
  talkCooldown = 0;
  /** 微光化变体 = townNpcVariationIndex==1（NPCID.Sets.ShimmerTownTransform 入
   *  微光 → GetShimmered :92561-92573 → ai[0]=25 上升态；上升收尾 :53664 翻转——
   *  **双向**：已微光化再浸微光翻转回原形态）。变体贴图经 townSheet getter 切
   *  TownNPCs/Shimmered 档（Profiles.StackedNPCProfile 档位 1），对话差分登记 GAP */
  shimmered = false;
  /** 当前 altTexture（UpdateAltTexture NPC.cs:91254-91273：1=派对 2=狼人；
   *  fixedUpdate 每 tick 由 townNpcAltTexture 刷新——月相/血月/派对随时翻态） */
  altTexture = 0;
  // ---- 坐姿（AI_007 ai[0]==5，NPC.cs:53264-53287 入座 / :54682-54710 态推进）----
  /** 正坐在椅/马桶上（ai[0]==5）。仅夜/雨"该回家"窗口（flag，:53383-53402）入座：
   *  FindGoodRestingSpot 扫 home 附近可坐格 → 走到/传送落到落座格 → TryForcingSitting。
   *  渲染消费：drawPartyHat 坐姿帽 Y 链（sittingHatY）+ hatStateOffsetX 的 550 档 */
  sitting = false;
  /** ai[1] 坐姿倒计时（入座 = 900+rand(10800)，:53283） */
  private sitTimer = 0;
  /** 本 tick 的夜椅 rest spot（FindGoodRestingSpot 缓存；白天/无 home = null） */
  private restSpot: SitSpot | null = null;
  /** 本 tick 刚走"回家传送"（TeleportToHome :56063-56090 落位后即
   *  TryForcingSitting :56081——免"站定+同格"门，:54074 门只管走到场的情形） */
  private teleportedHome = false;
  /** 微光转化透明度（NPC.cs:6112，0..1；赋值时序 :92468-92497/:92568/:53625）。
   *  消费：Renderer 本体 alpha=1−st（GetAlpha :94874）+ 160 Glow ×(1−st)
   *  （Main.cs:25771-25776）——微光转化渐显/渐隐的唯一驱动字段 */
  shimmerTransparency = 0;
  /** 微光上升态旗标（原版 ai[0]==25，NPC.cs:53594-53682：落点传送 → ai[1]≥30
   *  起 −1/60/t 衰减 + velocity.Y=−4×st 上浮 → st 归零后翻转变体 + 到场粒子 +
   *  成就 43；态内 dontTakeDamage——推进见 shimmerRiseUpdate） */
  private shimmerRise = false;
  /** ai[1]：上升态计时（0 起，暂停期外每 tick +1；浸液钳 30） */
  private shimmerRiseT = 0;
  /** ai[2]：远距落点传送后的暂停倒计时（:53604） */
  private shimmerRisePause = 0;
  /** Main.IsItStorming 缓存（isItStormingNext 逐步推进；坐姿/回家 flag 消费） */
  private storming = false;
  /** ai[0]==25 上升态只读（渲染/测试消费） */
  get shimmerRising(): boolean { return this.shimmerRise; }

  /** 生命（原版城镇 NPC 可被陷阱弹幕误伤：vanilla-npcs.json lifeMax 250 / defense 15） */
  hp: number;
  maxHp: number;
  iframes = 0;
  // ---- 自卫攻击（AI_007 攻击态 ai[0]=10/12/14/15,NPC.cs:54747-55538）----
  /** 当前攻击态(0 空闲 / 10 近战弹 / 12 弓 / 14 魔法 / 15 挥击) */
  private atkState = 0;
  /** ai[0] 攻击态只读（AI_007 :54747 起的 10/12/14/15；原版同值）——渲染侧消费：
   *  drawPartyHat 海盗帽位修正（Main.cs:27001-27008 的 229 ai[0]==12 门）。
   *  坐姿 ai[0]==5 由 sitting 布尔建模（渲染侧 n.sitting?5:attackState 还原 ai0）；
   *  二者互斥：坐姿不满足攻击触发门 flag31 的 ai[0]<2（:55621），攻击态中不入座 */
  get attackState(): number { return this.atkState; }
  /** ai[2] 持械瞄准值（DrawNPCExtras :27121 消费 = 武器旋转 ai[2]×90°×朝向；
   *  :55191-55197 发射档取目标方向 Y 钳 ±0.5，态尽归零）——弓族攻击态持械绘制用 */
  get holdoutAim(): number { return this.holdAim; }
  /** world.flags.hardMode 缓存（攻击Update 每 tick 刷新）——持械表 pre/hm 选档用 */
  get hardMode(): boolean { return this.hardModeFlag; }
  /** ai[2]：弓族发射档写入，其余恒 0 */
  private holdAim = 0;
  /** ai[1]:态倒计时(AttackTime) */
  private atkTimer = 0;
  /** localAI[1]:触发冷却(flag31 门) */
  private atkCd = 0;
  /** localAI[3]:态内 tick 计数 */
  private atkTick = 0;
  /** 当前发射档 num46/55/65(连发升级链推进) */
  private atkNextShot = 0;
  private atkBurstIdx = 0;
  /** world.flags.hardMode 缓存(attackUpdate 每 tick 刷新) */
  private hardModeFlag = false;
  /** 633 狼人态缓存(attackUpdate 每 tick 刷新,ShouldBestiaryGirlBeLycantrope
   *  NPC.cs:94961-94972:血月夜或满月[moonPhase==0]夜)——发射端换 proj 929 +
   *  dmg×1.5 截断(:54782-54785) */
  private werewolfFlag = false;
  // 表情气泡:字段/掷骰已退役——统一走 render/EmoteBubble 模块(spawnEmote,
  // 并行会话 1:1 版);空闲随机冒泡由 Game.tickNpcEmotes 窗口喂(双画修复 2026-08-13)
  // ---- 环境与互殴受击(NPC.cs :91538 族调用点的三件套)----
  /** 岩浆专属冷却(原版 immune[255]=30,Collision_LavaCollision :94522) */
  private lavaCd = 0;
  /** NPC 互殴专属冷却(原版 immune[255]=30,GetHurtByOtherNPCs :93667;初始 0) */
  private npcVsCd = 0;
  /** 溺水呼吸(NPC.CheckDrowning :96118:初始 200,水内每 7t -1,离水 +3/t) */
  private breath = 200;
  private breathCounter = 0;
  // ---- 危险逃离（AI_007 危险扫描 NPC.cs:53864-54024 + 逃速 :54319-54326 +
  //      被逼停冻结 ai[0]==8 :54597-54603/:54682-54690）----
  /** 本 tick 危险评估 = flag16（扫描命中且未被 PrettySafe 收口，:53876/:53998） */
  private dangerNear = false;
  /** num15 最近敌所在侧（-1 左 / 1 右，:53960-53963）——逃离向 = −dangerSide */
  private dangerSide = 0;
  /** 本 tick 逃走中（friendly && flag16 → 逃速提档，:54319-54326） */
  private fleeing = false;
  /** ai[0]==8 被逼停：前方跳不过且逃命中 flag27 → ai[1]=240 冻结（:54597-54603）；
   *  态内 ai[1]--、<60 且仍在险 → 续 180（:54686-54690）——站定但仍可还击
   *  （触发门 flag31 含 ai[0]==8，:55621）；解冻 = 危险侧换到背后（:53969-53977）*/
  private corneredT = 0;
  /** ai[0]==8 只读（渲染/测试消费） */
  get cornered(): boolean { return this.corneredT > 0; }
  /** StepUp 无位移卡墙计数（:54409-54422：每 10t 强制折返） */
  private stuckT = 0;

  constructor(key: string, x: number, y: number) {
    super();
    this.npcKey = key;
    this.x = x;
    this.y = y - this.h;
    const town = TOWN_NPC_IDS[key];
    this.vanillaId = town?.id ?? 22; // 未登记 key 兜底向导贴图
    this.givenName = newNpcName(this.vanillaId);
    const v = VANILLA_NPCS[String(this.vanillaId)];
    this.maxHp = this.hp = v?.lifeMax ?? 250;
  }

  /** 被陷阱弹幕等命中：dmg - defense*0.5（下限 1），8 tick 无敌帧；
   *  死亡即移除——"重生"由入驻轮承担（原版 UpdateTime_SpawnTownNPCs：不在场且
   *  条件满足 → 重新入驻，≈次日回归），无需独立重生系统 */
  hurt(dmg: number, kbx: number, _kby: number, game: GameHooks): boolean {
    if (this.iframes > 0 || this.dead) return false;
    if (this.shimmerRise) return false;   // ai[0]==25 dontTakeDamage（NPC.cs:53596）
    const books = (game.world.flags.combatBookWasUsed ? 1 : 0) + (game.world.flags.combatBookVolumeTwoWasUsed ? 1 : 0);
    const def = (VANILLA_NPCS[String(this.vanillaId)]?.defense ?? 15) + books * 8; // NPC.cs:53419
    dmg = Math.max(1, Math.round(dmg - def * 0.5));
    this.hp -= dmg;
    this.iframes = 8;
    game.addDamageNumber(this.cx, this.y, dmg, false, '#FFD060');
    // 受击血粒子(原版 StrikeNPC 尘近似,与 Enemy.hurt 同规)
    game.spawnParticles(this.cx, this.cy, '#B01818', 5, 1.4, { life: 22, grav: 0.06 });
    this.vx += kbx * 0.6;
    if (this.hp <= 0) {
      this.dead = true;
      game.spawnParticles(this.cx, this.cy, '#C03030', 8, 2);
      game.spawnParticles(this.cx, this.cy, '#8A1818', 4, 1.2);
      game.playSfxFiles(['NPC_Killed_1'], 0.8);
    } else {
      game.playSfxFiles(['NPC_Hit_1'], 0.6);
    }
    return true;
  }

  /** 战斗书增益（NPC.cs:53419-53430：每本 lifeMax+250 / 伤害出力×0.8 / 移速+0.25 /
   *  防+8——伤害/移速两项无对应战斗系统，落 lifeMax/防；每本可叠加，由调用方按旗标次数调） */
  applyCombatBook(): void {
    this.maxHp += 250;
    this.hp = Math.min(this.maxHp, this.hp + 250);
  }

  private cbApplied = false;

  /** buff 25 Tipsy 剩余 tick（NPC.buffType/buffTime 单槽近似——本仓城镇 NPC 无
   *  buff 栏,只为 num2 链建此单槽）。唯一施加点 = 麦酒弹 669 Kill 爆炸
   *  （Projectile.cs:68725-68734 AddBuff(25, 3659),酒馆老板 550 自卫投掷,
   *  TownShot.kill669 落点）;每 tick 递减（NPC.cs:93174 lowerBuffTime）,归零
   *  即失效（:93333 整段重置）。消费:进度链 tipsy 位（num2×1.1/num3×0.9 链尾
   *  :53552-53557）+ 醉酒气泡金尘（:92349 rand(4)==0 且 rand(2)==0 → 净 1/8） */
  tipsyT = 0;

  /** NPC.AddBuff(25, ticks)（同 buff 合并取更长剩余——标准 buffTime 合并语义） */
  applyTipsy(ticks: number): void {
    if (ticks > this.tipsyT) this.tipsyT = ticks;
  }

  /** 本 tick 的 NPC.tipsy 位（:93179 buff25 在列 → true）。快照语义：原版
   *  递减（:93174）后置位——剩余 1t 的最后一 tick 仍 true,次 tick 才 false */
  private tipsyNow = false;

  get tipsy(): boolean { return this.tipsyNow; }

  /** GetMagicAuraColor（NPC.cs:53317-53332）1:1：NPCID.Sets.MagicAuraColor
   *  （NPCID.cs:4853）五人恰好 = AttackType-2 魔法攻击族（54 裁缝/108 巫师/
   *  160 松露/20 树妖/663 公主；五人 TownNPCProfiles 全走 LegacyWithSimpleShimmer
   *  二档 StackedNPCProfile → variationIndex∈{0,1}，==1 ⟺ 微光变体）。
   *  townNpcVariationIndex==1（= 本仓 shimmered，IsShimmerVariant NPC.cs:6646-6650）
   *  → 160 R/B 互换、20 固定 (90,20,210)、663 固定 (255,0,77)。Color.ToVector3()
   *  丢弃 alpha → 三通道 0-1 归一（663 基色 = Main.hslToRgb(0.92,1,0.78) = 255,143,197）*/
  private magicAuraColor(): [number, number, number] {
    switch (this.vanillaId) {
      case 54: return [100 / 255, 4 / 255, 227 / 255];
      case 108: return [1, 80 / 255, 60 / 255];
      case 160: return this.shimmered ? [1, 80 / 255, 40 / 255] : [40 / 255, 80 / 255, 1];
      case 20: return this.shimmered ? [90 / 255, 20 / 255, 210 / 255] : [40 / 255, 1, 80 / 255];
      case 663: return this.shimmered ? [1, 0, 77 / 255] : [1, 143 / 255, 197 / 255];
      default: return [1, 1, 1];        // 集合缺省 Color.White（ToVector3 丢 alpha）
    }
  }

  /** 本 tick 点光（NPC.cs 城镇 NPC 侧三处恒亮）：
   *  - 160 松露（UpdateNPC_CastLights :93544-93566）：num3=Next(28,42)×0.005+
   *    (270−mouseTextColor)/500，基色 (0.1,0.3+num3/2,0.6+num3)×0.35；变体 1
   *    （townNpcVariationIndex==1）R/B 互换——以 shimmered 承接（:93563-93567）
   *  - 209 电子人（:93590-93599）：同式抖动 ×0.35、B 基 0.4；ai[0]==12（火箭射击
   *    态，AttackType[209]=1 → ai0=12，NPC.cs:55902/:54936）追加 Top (0.3,0.1,0.1)
   *    （:93594-93596）——单槽逐通道 max 合并（Enemy.mergeLightRGB 同款近似）
   *  - 681 彩虹城镇史莱姆（AI_007 尾段 :55963-55974）= TorchColor(23)×0.35
   *  - 683 黄城镇史莱姆（:55974-55979）= (0.25,0.25,0.1)×WrappedLerp(0.75,1,t%120/120)
   *  条件态：魔法光环 ai[0]==14（:55394，num69=1 恒满档，atkState===14 承接）
   *  ×GetMagicAuraColor；微光上升光 :53637（ai[1] 30→90，shimmerRise 态内已接）；
   *  跳过一处——:55546 ai[0]==24（树妖 Stardew 演出 HaveDryadDoStardewAnimation
   *  :19123，公主礼物彩蛋无载体） */
  get lightRGB(): [number, number, number] | null {
    let rgb: [number, number, number] | null = null;
    // 逐通道 max 合并（原版同帧多 AddLight，单槽近似视觉并集；不挪光源位）
    const merge = (c: [number, number, number]) => {
      rgb = rgb ? [Math.max(rgb[0], c[0]), Math.max(rgb[1], c[1]), Math.max(rgb[2], c[2])] : c;
    };
    if (this.vanillaId === 160) {
      const n3 = (28 + Math.random() * 14) * 0.005 + (270 - mouseTextColorApprox()) / 500;
      const base: [number, number, number] = [0.1 * 0.35, (0.3 + n3 / 2) * 0.35, (0.6 + n3) * 0.35];
      // :93563-93567 变体 1（shimmered）→ R/B 互换（num7 交换 num4/num6）
      merge(this.shimmered ? [base[2], base[1], base[0]] : base);
    }
    if (this.vanillaId === 209) {
      const n3 = (28 + Math.random() * 14) * 0.005 + (270 - mouseTextColorApprox()) / 500;
      merge([0.1 * 0.35, (0.3 + n3 / 2) * 0.35, (0.4 + n3 / 2) * 0.35]);
      if (this.atkState === 12) merge([0.3, 0.1, 0.1]);   // :93594 火箭射击态 Top 追加光
    }
    if (this.vanillaId === 681) {
      const num = Math.min(1, Math.max(0, 0.9 + (270 - mouseTextColorApprox()) / 900));
      merge([num * 0.9 * 0.35, 0.55 * 0.35, num * 1.2 * 0.35]);   // TorchColor(23)×0.35
    }
    if (this.vanillaId === 683) {
      const p = (visEffectFrames() % 120) / 120;
      const tri = p * 2 > 1 ? 2 - p * 2 : p * 2;                   // Utils.WrappedLerp
      const l = 0.75 + 0.25 * tri;
      merge([0.25 * l, 0.25 * l, 0.1 * l]);
    }
    // 魔法光环（:55390-55396）：ai[0]==14 魔法攻击态内 num69=1 恒满档 → GetMagicAuraColor
    if (this.atkState === 14
      && (this.vanillaId === 54 || this.vanillaId === 108 || this.vanillaId === 160
        || this.vanillaId === 20 || this.vanillaId === 663)) {
      merge(this.magicAuraColor());
    }
    // 微光上升光（:53637-53639）：Center 处 hslToRgb(t/360%1, 0.6, 0.65) ×
    // Remap(ai[1],30,90,0,0.7)——Remap 钳位使 ai[1]<30 时恒 0（无光）
    if (this.shimmerRise) {
      const k = remapClamped(this.shimmerRiseT, SHIMMER_RISE_VELOCITY_TICK, 90, 0, 0.7);
      const c = hslToRgb((visEffectFrames() / 360) % 1, 0.6, 0.65);
      merge([c[0] * k, c[1] * k, c[2] * k]);
    }
    return rgb;
  }
  lightRGBAt: { x: number; y: number } | null = null;

  fixedUpdate(dt: number, game: GameHooks) {
    this.animT++;
    // justHit 近似（原版逐 tick 旗标）：hurt() 置 iframes=8 且只在无无敌帧时生效
    // → 递减前 ==8 恰好标记"自上 tick 起受过击"（微光衰减 −0.1 档 NPC.cs:92484）
    const justHit = this.iframes === 8;
    if (this.iframes > 0) this.iframes--;
    // buff 25 Tipsy 递减（NPC.cs:93174 lowerBuffTime,UpdateNPC 每 tick 头部）+
    // 醉酒气泡金尘（:92349-92370：rand(4)==0 且 rand(2)==0 → 净 1/8,尘 4
    // 金 (245,200,30,155) alpha 75(+25×2 随机档) scale 0.9,vel×0.2 后 +0.2 下沉）
    if (this.tipsyT > 0) {
      // :93170 顶部守卫 time>0 → :93174 递减 → :93179 置位（递减后仍按本 tick 生效）
      this.tipsyNow = true;
      this.tipsyT--;
      if (Math.random() < 1 / 8) {
        game.spawnParticles(this.x - 2, this.y - 2, 'rgba(245,200,30,0.61)', 1, 0.3,
          { life: 40, grav: 0.005, size: 2 });
      }
    } else {
      this.tipsyNow = false;   // :93333 整段重置
    }
    this.teleportedHome = false;
    const world = game.world;
    // 战斗书增益一次性套用（后入驻的 NPC 在首 tick 补；使用书时对在场者即时叠）
    if (!this.cbApplied) {
      this.cbApplied = true;
      const books0 = (world.flags.combatBookWasUsed ? 1 : 0) + (world.flags.combatBookVolumeTwoWasUsed ? 1 : 0);
      for (let k = 0; k < books0; k++) this.applyCombatBook();
    }

    // ---- 城镇微光转化链 1:1（GetShimmered NPC.cs:92561-92573 + AI_007 ai[0]==25
    //      :53594-53682）。触发：浸微光 st +0.01/t（:92469），>0.9 → GetShimmered
    //      （:92471，约 91t 渐隐非即刻）；城镇分支置 st=0.89 并进 ai[0]=25 上升态
    //      （:92562-92568，摘 buff 353 :92570-92573——城镇 buff 系统未建，无载体）。
    //      上升态 = 落点传送 → ai[1]≥30 起 −1/60/t 衰减 + velocity.Y=−4×st 上浮 →
    //      st 归零后翻转微光变体 + 到场粒子 + 成就 43（推进见 shimmerRiseUpdate）。
    //      变体贴图走 townSheet getter（已接），对话差分未接（GAP）。
    //      注：原版 UpdateNPC_BuffApplyVFX（:92492）上升态外仍每 tick −0.001 共衰减，
    //      本仓并入 −1/60 单档（既有 shimmerTransparencyNext 模型，纯函数测试锁定）----
    const st0 = world.store;
    const si = st0.idx(
      Math.max(0, Math.min(st0.w - 1, Math.floor(this.cx / TILE))),
      Math.max(0, Math.min(st0.h - 1, Math.floor(this.cy / TILE))),
    );
    const inShimmer = st0.liquid[si] > 30 && st0.liquidType[si] === 4;
    // 上升态内 st 由 shimmerRiseUpdate 独占推进（ai[1]<30 期间原样保持 0.89）
    if (!this.shimmerRise) {
      this.shimmerTransparency = shimmerTransparencyNext(
        this.shimmerTransparency, inShimmer, justHit, false,
      );
      if (isNpcTownShimmerable(this.vanillaId) && inShimmer
        && this.shimmerTransparency > SHIMMER_ST_TRANSFORM) {
        this.shimmerRise = true;                    // ai[0]=25（:92562）
        this.shimmerRiseT = 0;                      // ai[1]=0（:92563）
        this.shimmerRisePause = 0;                  // ai[2]=0（:92564）
        this.shimmerTransparency = SHIMMER_ST_RISE; // :92568
      }
    }
    if (this.shimmerRise && this.shimmerRiseUpdate(world, game, st0.liquid[si] > 0)) {
      // ai[0]==25 块整段 return（:53682）：AI_007 游走/坐姿/攻击/开门全跳过；
      // 只补 UpdateNPC 尾段的重力 + 碰撞 + 找帧（:91521-91565，AI() 之后照常执行）
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, world, this.vx, this.vy);
      this.updateWalkFrame();
      return;
    }

    // ---- altTexture 刷新（UpdateAltTexture NPC.cs:91254-91273，原版 UpdateNPC 每
    //      tick 末尾调 :91358）：派对进行（441/453/633 除外）→ 1；633 狼人条件 → 2。
    //      partyUp 取 world.scene（Game 每 15t 写入）；MakeTransitionEffectsForTextureChanges
    //      的变身尘/烟粒子（:91277-91309）未接（登记） ----
    this.altTexture = townNpcAltTexture(
      this.vanillaId, !!world.scene?.partyUp,
      world.clock.moonPhase, world.clock.bloodMoon, world.clock.isDay,
    );

    // 被绑待救援：原地不动（仅重力落定），解救在 Game.talkToNearbyNpc / 净化粉
    // （原版 bound 类型同走 TargetClosest + spriteDirection，NPC.cs:19813-19816：
    //  恒面向最近玩家——捆绑姿态转向救援者）
    if (this.bound) {
      const bp = (game as unknown as { player: Player }).player;
      if (bp && !bp.dead) this.facing = bp.cx < this.cx ? -1 : 1;
      this.vx = 0;
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, world, this.vx, this.vy);
      return;
    }

    // ---- 夜椅 rest spot（AI_007_FindGoodRestingSpot NPC.cs:53195-53262，原版
    //      每 tick 开头算一次 :53708）：夜/雨"该回家"窗口（flag :53383-53402，与
    //      回家传送同式）+ **夜间**才扫椅（:53209 dayTime 早退——白天雨天也只回
    //      home 地面不坐）；以 home 为锚扫 ±7 列可坐格；城镇宠物/史莱姆不坐
    //      （:53214 type 638/656 + IsTownSlime 族 NPCID.cs:4446）→ 本仓 null ----
    // 风暴门（:53399-53402）：Main.IsItStorming 且 NPC 头顶行 < worldSurface
    // （= world.groundLevel，SceneMetrics 同源；缺省 0=未知世界恒 false）。迟滞机
    // 每 tick 逐步推进（原版 Main 全局字段 _shouldUseStormMusic 逐帧重算）
    this.storming = isItStormingNext(world.weather.cloudAlpha, world.weather.windSpeedTarget, this.storming);
    const sitFlag = world.weather.raining || !world.clock.isDay
      || !!world.clock.eclipse || !!world.weather.slimeRain
      || (this.storming && this.y / TILE < world.groundLevel);
    this.restSpot = (sitFlag && !world.clock.isDay && this.home
      && !NO_SIT_NPC_IDS.has(this.vanillaId))
      ? findChairSpot(world.store, this.home.x, this.home.y) : null;

    // ---- 危险评估（NPC.cs:53864-53990 扫描 + 侧选 num15 + PrettySafe 收口）：
    //      原版在 AI 头部、状态机之前跑。结果 dangerNear/dangerSide 供四处消费：
    //      逃离覆写（:53990-54024）/ 逃速提档（:54319-54326）/ 越障冻结门
    //      （:54597-54603 flag16）/ 白天随机坐椅门（flag30 = !flag16，:55620）----
    this.dangerUpdate(world, game);

    let wantDir = 0;
    // 对话中站定并面向玩家（原版 AI_007 NPC.cs:53721-53742：talkNPC==本体 →
    // ai[0]=0 停走、ai[1]=300、direction 指向玩家——杜绝"聊着聊着走开丢对话"）
    if (this.talking) {
      const p = (game as unknown as { player: Player }).player;
      if (p) this.facing = p.cx < this.cx ? -1 : 1;
      // 对话打断坐姿（:53738：非攻击态被 talkNPC 命中 → ai[0]=5 归 0——玩家
      // 靠近说话即起身；ai[1]=300/localAI[3]=100 两计时由既有 wanderT 链近似）
      if (this.sitting) { this.sitting = false; this.sitTimer = 0; }
      this.vx *= 0.6;
      this.wanderT = 0;
    } else if (!this.stationary && world.clock.isDay && !this.sitting) {
      // 坐姿中不参与白天游走的随机转向（原版 ai[0]==5 不走 :54119+ 的
      // idle 翻向链——坐姿朝向由椅子 frameX 锁定）
      // 白天家门口附近游走;leashHome 者离 home 超过 ~10 格时折返(守卫老人不离地牢)
      if (this.leashHome && this.home
        && Math.abs(this.cx - (this.home.x * TILE + 8)) > 10 * TILE) {
        wantDir = Math.sign(this.home.x * TILE + 8 - this.cx);
      } else {
        this.wanderT--;
        if (this.wanderT <= 0) {
          this.wanderT = 90 + Math.random() * 180;
          this.facing = Math.random() < 0.5 ? -1 : 1;
          if (Math.random() < 0.35) this.facing = 0;
        }
        wantDir = this.facing;
      }
    } else if (this.home) {
      // 夜间回家（AI_007 :54060-54106：落位目标 = FindGoodRestingSpot 的 rest
      // spot——夜里即椅/马桶的落座地面格，走到即坐；无椅回退 home 列。有椅时
      // 收紧停走阈到 4px（原版按 num6==floorX 逐格对齐，:54074），保证落进同格
      // 触发坐姿站定门）
      const tx = this.restSpot ? this.restSpot.x : this.home.x;
      const dx = tx * TILE + 8 - this.cx;
      if (Math.abs(dx) > (this.restSpot ? 4 : TILE)) wantDir = Math.sign(dx);
    }
    // ---- 回家传送（AI_007_TownEntities_TeleportToHome :56063-56086 + 触发 :53828-53856）：
    //  flag = 雨天||夜间||日食||史莱姆雨（= 该回家的状态）；且当前不在家休息位；
    //  双矩形视野门（玩家屏±safeRange 不与 NPC 位置/home 位置相交）→ 静默传回家
    //  （无 dust 无音效，纯 position 改写）。本仓"好休息位"近似=家 ±4 格内 ----
    if (this.home) {
      const flag = sitFlag;
      // IsInAGoodRestingSpot（NPC.cs:53165-53177）：夜间坐姿放宽 ±7 格（:53168-
      // 53176——防"坐在椅上被回家传送拽起"）；常态沿用 home ±4 格既有近似。
      // 本仓 home.y 是站格（地面行 −1），±7 容差吸收该 1 行口径差
      const nearHome = this.sitting
        ? Math.abs(Math.floor(this.cx / TILE) - this.home.x) <= 7
          && Math.abs(Math.floor((this.y + this.h) / TILE) - this.home.y) <= 7
        : Math.abs(this.cx - (this.home.x * TILE + 8)) < 4 * TILE
          && Math.abs(this.cy - (this.home.y * TILE)) < 4 * TILE;
      if (flag && !nearHome) {
        const pl = (game as unknown as { player: { x: number; y: number; w: number; h: number; dead: boolean } | null }).player;
        const screenR = 42 * TILE;   // 屏幕半宽+safeRange 近似（1360/16/2×1.52≈64? 取保守值 42 格=见不到）
        const farFromNpc = !pl || pl.dead
          || Math.hypot(pl.x + pl.w / 2 - this.cx, pl.y + pl.h / 2 - this.cy) > screenR;
        const homePx = { x: this.home.x * TILE + 8, y: this.home.y * TILE };
        const farFromHome = !pl || pl.dead
          || Math.hypot(pl.x + pl.w / 2 - homePx.x, pl.y + pl.h / 2 - homePx.y) > screenR;
        if (farFromNpc && farFromHome) {
          // 三列落位（:56066-56085：home-1/home/home+1，头顶净空即收；全堵=放弃）
          let moved = false;
          for (const off of [0, -1, 1]) {
            const hx = this.home.x + off, hy = this.home.y;
            let clear = true;
            for (let ax = hx - 1; ax <= hx + 1 && clear; ax++) {
              for (let ay = hy - 3; ay <= hy - 1; ay++) {
                if (world.store.inBounds(ax, ay) && world.store.isSolid(ax, ay)) { clear = false; break; }
              }
            }
            if (!clear) continue;
            this.x = hx * TILE + 8 - this.w / 2;
            this.y = hy * TILE - this.h - 0.1;
            this.vx = 0; this.vy = 0;
            moved = true;
            break;
          }
          // 落位即试坐（TeleportToHome → TryForcingSitting :56081）
          if (moved) this.teleportedHome = true;
        }
      }
    }

    // ---- 危险逃离覆写（NPC.cs:53990-54024 + 被逼停推进 :54682-54690）----
    this.fleeing = false;
    if (this.corneredT > 0) {
      // ai[0]==8 冻结态：站定（vx 走下方 wantDir==0 刹车）但仍可还击——attackUpdate
      // 无 cornered 门（flag31 含 ai[0]==8，:55621），攻击态照常触发/推进
      this.corneredT--;                                          // :54685 ai[1]--
      if (this.corneredT < 60 && this.dangerNear) this.corneredT = 180;   // :54686-54690 在险续冻
      // 解冻（:53969-53977）：危险已换侧到面前（facing == −num15）→ 恢复走路
      if (this.dangerNear && this.facing === -this.dangerSide) {
        this.corneredT = 0;
        this.wanderT = 300 + Math.floor(Math.random() * 300);
      }
      wantDir = 0;
    } else if (this.dangerNear && this.atkState === 0) {
      // :53990-54024：非攻击态（ai[0]∉{10,12,13,14,15}）背向最近敌走逃——
      // 坐姿不豁免（原版 ai[0]==5 不在攻击态排除列，扫描直接改 ai[0]=1 = 拽起逃跑）
      if (this.sitting) { this.sitting = false; this.sitTimer = 0; }
      this.fleeing = true;
      wantDir = -this.dangerSide;
    }

    // ---- 坐姿（ai[0]==5 族，见 sittingUpdate 注）----
    if (this.sittingUpdate(world, game)) wantDir = 0;

    // ---- 自卫攻击（AI_007 攻击态 ：54747-55538;攻击中站定替代游走）----
    if (this.attackUpdate(world, game)) wantDir = 0;

    // ---- 行走随机坐椅（NPC.cs:55774-55814，原版无昼夜门：flag30 = ai[0]<2 &&
    //      !flag16 && !wet（:55620）→ ai[0]==1 行走态 && 站地 && rand(300)==0
    //      （num=300；宠物/城镇史莱姆 0 恒不触发）→ 脚下格（Bottom−2px）为椅/
    //      马桶且无其他坐姿 NPC/玩家占位 → 坐 900+rand(10800)）----
    if (this.tryRandomChairSit(world, game, wantDir)) wantDir = 0;

    // ---- 环境与互殴受击(NPC.cs:91534-91544:townNPC 每帧 CheckDrowning +
    //      GetHurtByOtherNPCs;岩浆走 Collision_LavaCollision :94511-94530)----
    this.envHurtUpdate(world, game);


    // 逃速提档（:54319-54326）：num22 = 1.5+失血比例×0.9、num23 = 0.1（常态
    // 1 / 0.07）——按本仓常走校准（max 0.8 / accel 0.06）同比缩放保 1.5× 手感；
    // flag21 溺水快游档本仓城镇 NPC 无涉水走路场景，略
    const fleeSpd = this.fleeing ? 0.8 * (1.5 + (1 - this.hp / this.maxHp) * 0.9) : 0.8;
    const walkAcc = this.fleeing ? 0.06 * (0.1 / 0.07) : 0.06;
    this.vx += wantDir * walkAcc;
    this.vx = Math.max(-fleeSpd, Math.min(fleeSpd, this.vx));
    if (wantDir === 0) {
      // 原版驻留刹车（NPC.cs:54096-54106）：不走路时每 tick ±0.1 主动减速。
      // 缺此刹车时 facing=0（站立意图）仍以 0.8px/tick 惯性滑行且贴图不镜像
      // → 向右滑行显示朝左贴图（偶发"太空步"）
      if (this.vx > 0.1) this.vx -= 0.1;
      else if (this.vx < -0.1) this.vx += 0.1;
      else this.vx = 0;
    }
    // ---- 越障三档跳 + 净空失败转身/被逼停（NPC.cs:54514-54611；替代旧单档
    //      hitWall→vy=−6）。门 = 站地且正沿行向移动（velocity.X 与 direction
    //      同号，:54517）；三档 = 障碍两格上 −6 / 一格上 −5 / 半格 −4.4，跳前
    //      查头顶净空（SolidTilesVersatile，越界视为堵），跳不过 → 转身
    //      （flag26），逃命中再叠加冻结 240t（flag27 → ai[0]=8）----
    let turned = false;
    if (this.onGround && wantDir !== 0 && this.vx !== 0 && Math.sign(this.vx) === wantDir) {
      turned = this.obstacleJump(world, wantDir);
    }
    const preX = this.x;
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, world, this.vx, this.vy);
    if (this.hitWall) this.vx *= 0.5;
    // ---- StepUp 卡墙折返（NPC.cs:54409-54422）：站地行走中 StepUp 无位移
    //      （x 一格未动）累计满 10t → 强制折返（ai[0]=1、ai[1]=200+rand(300)、
    //      direction/vx 双翻）。原版另有 ai[1]<100 门（走态末段才折）——本仓
    //      wanderT 语义（随机转向计时）与 ai[1] 不同源，以 10t 节流近似 ----
    if (wantDir !== 0 && this.onGround && Math.abs(this.x - preX) < 0.01) {
      this.stuckT++;
      if (this.stuckT % 10 === 0) {
        this.facing = -this.facing;
        this.vx = -this.vx;
        this.wanderT = 200 + Math.floor(Math.random() * 300);
        turned = true;
      }
    } else {
      this.stuckT = 0;
    }
    if (!turned && wantDir !== 0) this.facing = wantDir;
    // 开关门（原版 54478-54500：撞到关着的门 → 1/10（或卡住必试）开门，两方向回退；
    // 54243-54252：走过门 >2 格关门，>4 格放弃）
    this.npcDoorUpdate(world, game);

    // ---- 原版 FindFrame 城镇分支（NPC.cs:70172-70262，UpdateNPC :91565 调）----
    this.updateWalkFrame();

  }

  /** FindFrame 城镇分支（NPC.cs:70172-70262 + 前置 ai 态链 :69310-69847）：
   *  腾空（velocity.Y!=0 整链旁落）= 帧1；坐姿 ai[0]==5 = num58−3（:69637-69643）；
   *  攻击态 ai[0]∈{10,12,14,15} 按原版分档（attackFrame）；地面站定=帧0、计数清零；
   *  行走 frameCounter += |vx|*2+1，>6 推进，帧区间 2..frames-extra-1（越界回卷
   *  帧2）。微光上升态同样调（原版 FindFrame 在 AI 早退之后仍执行 :91565）。
   *  被逼停 ai[0]==8 不在原版 ai 态链（落 velocity.X==0 空闲帧 0）；玩家对话
   *  （talkNPC==本体 :53721 置 ai[0]=0）原版同落帧 0——NPC↔NPC 聊天表演帧
   *  （num58−1..−5 族 :69678-69930，ai[0]∈{3,4,7,16,17}）本仓无对应状态机，
   *  登记未接 */
  private updateWalkFrame(): void {
    if (!this.onGround) {
      this.frame = 1;
      this.frameT = 0;
      return;
    }
    const total = VANILLA_NPCS[String(this.vanillaId)]?.frames ?? 1;
    const base = townNpcBaseFrame(this.vanillaId, total);   // num58（:69320）
    if (this.sitting) {
      this.frame = base - 3;                                // :69638-69644（637 例外不在本仓）
      this.frameT = 0;
      return;
    }
    if (this.atkState !== 0) {
      this.attackFrame(base);
      return;
    }
    if (Math.abs(this.vx) < 0.05) {
      this.frame = 0;
      this.frameT = 0;
    } else {
      const extra = TOWN_NPC_IDS[this.npcKey]?.extra ?? 2;
      this.frameT += Math.abs(this.vx) * 2 + 1;
      if (this.frame < 2) this.frame = 2;
      if (this.frameT > 6) {
        this.frameT = 0;
        this.frame++;
      }
      if (this.frame >= total - extra) this.frame = 2;
    }
  }

  /** 攻击态帧（FindFrame NPC.cs:69765-69847）：
   *  - 近战 10：态内计数（frameCounter，入态清零 :54756）四档 0→num58→+1→+2→+3，
   *    档距 num79=6（633 狼人 0/2），windup num78=10（633:0）（:69765-69786）
   *  - 挥击 15：按 ai[1]/AttackTime 比例四档 >0.65/0.5/0.35/0（:69787-69802）
   *  - 弓 12：num58+GetShootingFrame(ai[2])（:69827，表 :67061）
   *  - 魔法 14：每 12t 交替 num58/num58+1（:69832-69847） */
  private attackFrame(base: number): void {
    if (this.atkState === 10) {
      const windup = this.vanillaId === 633 ? 0 : 10;   // num78
      const step = this.vanillaId === 633 ? 2 : 6;      // num79
      const c = this.atkTick;
      this.frame = c < windup ? 0
        : c < windup + step ? base
          : c < windup + step * 2 ? base + 1
            : c < windup + step * 3 ? base + 2
              : c < windup + step * 4 ? base + 3 : 0;
    } else if (this.atkState === 15) {
      const t = TOWN_ATTACK_TIME[this.vanillaId] ?? 15;
      const r = this.atkTimer / t;                      // num82 = ai[1]/AttackTime
      this.frame = r > 0.65 ? base : r > 0.5 ? base + 1 : r > 0.35 ? base + 2 : r > 0 ? base + 3 : 0;
    } else if (this.atkState === 12) {
      this.frame = base + shootingFrameOffset(this.vanillaId, this.holdAim);
    } else {                                            // 14 魔法
      this.frame = this.atkTick % 24 < 12 ? base : base + 1;
    }
    this.frameT = 0;
  }

  /** AI_007 ai[0]==25 微光上升态（NPC.cs:53594-53682）1:1，返回 true = 态中。
   *  时间线：ai[1]==0 落点传送（:53609，位移 ≥560px 则 ai[2]=30 暂停 + 发送
   *  粒子）→ ai[2] 倒计时毕置 ai[1]=1（:53612-53618）→ 此后每 tick ai[1]+1
   *  （:53620）→ ≥30 起非浸液 st−1/60、浸液钳 30 等待（:53621-53629）+
   *  velocity=(0,−4×st)（:53631）→ ai[1]≥75 且 st≤0 收尾（:53653-53669）：
   *  变体翻转（双向）+ 原地 Teleport(12)（TeleportEffect 无 style 12 分支 =
   *  纯重锚无视觉，Main.cs:13169-13414）+ ShimmerTownNPC 到场粒子 + 成就 43 */
  private shimmerRiseUpdate(
    world: import('../world/World').World, game: GameHooks, wet: boolean,
  ): boolean {
    if (this.shimmerRiseT === 0) this.vx = 0;                     // :53597-53599
    if (this.shimmerRiseT === 0 && this.shimmerRisePause < 1) {
      this.shimmerLandAt(world.store, game);                      // :53609
    }
    if (this.shimmerRisePause > 0) {                              // :53612-53618
      this.shimmerRisePause--;
      if (this.shimmerRisePause <= 0) this.shimmerRiseT = 1;
      return true;
    }
    this.shimmerRiseT++;                                          // :53620
    if (this.shimmerRiseT >= SHIMMER_RISE_VELOCITY_TICK) {        // :53621
      if (!wet) {
        // WetCollision 近似 = 中心格任意液体（:53622-53626）
        this.shimmerTransparency = shimmerTransparencyNext(this.shimmerTransparency, false, false, true);
      } else {
        this.shimmerRiseT = SHIMMER_RISE_VELOCITY_TICK;           // :53627 浸液等待
      }
      this.vx = 0;
      this.vy = -4 * this.shimmerTransparency;                    // :53631
    }
    // 上升演出（:53634-53649）——dust 309 / ShimmerBlock 的 Remap 门在 ai[1]<30
    // 时钳到恒假，与原版同 tick 生效（光走 lightRGB 的 shimmerRise 分支）
    const num5 = Math.random() * 2 - 1;                           // NextFloatDirection
    if (Math.random() > remapClamped(this.shimmerRiseT, 30, 60, 1, 0.5)) {
      // dust 309（:53640-53646）：下半身盒（Y+20/H−20）内随机点 + 圆偏(8,0)+(0,4)，
      // velocity=(0,−2).RotatedBy(num5×2π×0.11)、scale 1.7−|num5|×1.3（size 档
      // spawnBurst 无参不建模）
      game.spawnBurst?.(
        this.x + Math.random() * this.w + (Math.random() * 2 - 1) * 8,
        this.y + 20 + Math.random() * (this.h - 20) + 4,
        '#BFE8FF', 1, 2, -Math.PI / 2 + num5 * Math.PI * 2 * 0.11, 0,
        { life: 30, grav: -0.04 },
      );
    }
    if (this.shimmerRiseT > 60 && Math.floor(Math.random() * 15) === 0) {
      // ShimmerBlock ×3（:53642-53649 → Spawn_ShimmerBlock :1791-1811）：星尘带
      // MovementVector = DirectionTo(v).RotatedBy(9π/20×±1)×rand 减速漂散——
      // 无粒子编排器，随机向小速度近似
      for (let i = 0; i < 3; i++) {
        game.spawnBurst?.(
          this.x + Math.random() * this.w, this.y + Math.random() * this.h,
          '#C9C2FF', 1, 0.8, Math.random() * Math.PI * 2, Math.PI, { life: 45, damp: 0.98 },
        );
      }
    }
    // TargetClosest（:53651）：面向最近玩家
    const tp = (game as unknown as { player?: { x: number; y: number; w: number; h: number; dead: boolean } }).player;
    if (tp && !tp.dead) this.facing = tp.x + tp.w / 2 < this.cx ? -1 : 1;
    if (this.shimmerRiseT >= SHIMMER_RISE_END_TICK && this.shimmerTransparency <= 0) {
      this.shimmerRise = false;                                   // ai[0]=0（:53654）
      this.shimmerRiseT = 0;
      this.shimmerRisePause = 0;
      this.vx = 0; this.vy = -4;                                  // :53660
      this.shimmered = !this.shimmered;                           // :53664 变体翻转（双向）
      // ShimmerTownNPC 到场粒子（:53666 → Spawn_ShimmerTownNPC :1696-1752）：
      // 40 PrettySparkle（hsl(rand,1,0.5)+白，30×60 盒上升）+ 20 dust 308 四色
      // （#FFFFD2/#BEF5FF/#FF96FF/#BEAFFF = 1:1:1:3，vy−8）+ SoundID.Item29
      //（= Item bank cue 29，Sfx 键 manaCrystal → sounds/Item_29.wav；曾因登记
      //  "素材缺"走 shimmerSplash 近似——素材实测在库，已换真声）
      game.spawnParticles(this.cx, this.cy, '#BEAFFF', 12, 3.2, { life: 34, grav: -0.12 });
      game.spawnParticles(this.cx, this.cy, '#BEF5FF', 4, 3.2, { life: 34, grav: -0.12 });
      game.spawnParticles(this.cx, this.cy, '#FF96FF', 4, 3.2, { life: 34, grav: -0.12 });
      game.playSfx('manaCrystal', 1, this.cx, this.cy);
      if (this.shimmered) game.achievements?.notifyProgressionEvent(43);   // :53667-53669
    }
    return true;
  }

  /** AI_007_TownEntities_Shimmer_TeleportToLandingSpot（:53609 → :55982-56010 +
   *  ScanForBestSpotToLandOn :55996-56059）：以自身顶格扫无微光落点（home 锚
   *  兜底），传送过去；位移 ≥560px → ai[2]=30 暂停 + ShimmerTownNPCSend 粒子
   *  （Spawn_ :1657-1694）。复用 stats/Shimmer.findShimmerFreeSpot（玩家脱困
   *  版同谓词）：环扫为原版 8 点环超集、r 并到 59、平台落点恒允许（原版仅
   *  homeless 无 home 时 allowSolidTop）——行为相容近似 */
  private shimmerLandAt(st: TileStore, game: GameHooks): void {
    const spot = findShimmerFreeSpot(
      st, Math.floor(this.x / TILE), Math.floor(this.y / TILE),   // Top.ToTileCoordinates
      this.home?.x, this.home?.y,
    );
    if (!spot) return;
    const nx = spot.x * TILE - this.w / 2, ny = spot.y * TILE - this.h;   // ShimmerHelper.cs:9
    const dist = Math.hypot(nx - this.x, ny - this.y);
    this.x = nx;
    this.y = ny;
    if (dist >= SHIMMER_RISE_TELEPORT_DIST) {
      this.shimmerRisePause = SHIMMER_RISE_PAUSE;                 // :56004
      game.spawnParticles(this.cx, this.cy, '#BEAFFF', 14, 1.2, { life: 30, grav: -0.05 });
      game.spawnParticles(this.cx, this.cy, '#BEF5FF', 10, 1.2, { life: 30, grav: -0.05 });
    }
  }

  /** 环境与互殴受击(NPC.cs:91534-91544 的 townNPC 分支三件套):
   *  ① 岩浆(Collision_LavaCollision :94511-94530):immun[255]=30 + StrikeNPC(50) 直伤
   *    (OnFire buff 24/420t 未接城镇 NPC buff 系统,略——登记)
   *  ② 溺水(NPC.CheckDrowning :96118-96154):水内每 7t breath--;breath≤0 后
   *    每 7t life-=2,归零一击 StrikeNPC(2);离水 breath+3/t cap 200
   *  ③ 敌怪互殴(GetHurtByOtherNPCs :93605-93690):任一 !friendly 且 damage>0 的
   *    NPC 接触 → StrikeNPC(DamageVar(attacker.damage), 6, 方向),immune[255]=30;
   *    dryadWard 荆棘反伤(num5/3)与 HurtingBees 未接,略
   *  Enemy.def.damage 已含难度缩放(ScaleStats),DamageVar≈1(Classic)直用。 */
  private envHurtUpdate(world: import('../world/World').World, game: GameHooks): void {
    if (this.dead) return;
    const st = world.store;
    if (this.lavaCd > 0) this.lavaCd--;
    if (this.npcVsCd > 0) this.npcVsCd--;
    const ci = st.idx(
      Math.max(0, Math.min(st.w - 1, Math.floor(this.cx / TILE))),
      Math.max(0, Math.min(st.h - 1, Math.floor(this.cy / TILE))),
    );
    // ① 岩浆(:94511-94530)
    if (st.liquid[ci] > 30 && st.liquidType[ci] === 2 && this.lavaCd <= 0) {
      this.lavaCd = 30;
      this.hurt(50, 0, 0, game);
    }
    // ② 溺水(:96118-96154;DrownCollision=头部浸水,取头顶格)
    const headY = Math.max(0, Math.floor((this.y + 6) / TILE));
    const hi = st.idx(Math.max(0, Math.min(st.w - 1, Math.floor(this.cx / TILE))), headY);
    const submerged = st.liquid[hi] > 30 && st.liquidType[hi] === 1;
    if (submerged) {
      if (++this.breathCounter >= 7) {
        this.breathCounter = 0;
        this.breath--;
        if (this.breath <= 0) {
          this.breath = 0;
          this.hp -= 2; // life-=2 直伤(不过防御,原版 :96137)
          if (this.hp <= 0) { this.hp = 1; this.hurt(2, 0, 0, game); } // :96141-96144 致死一击
          else game.addDamageNumber(this.cx, this.y, 2, false, '#FFD060');
        }
      }
    } else {
      this.breath = Math.min(200, this.breath + 3);
      this.breathCounter = 0;
    }
    // ③ 敌怪互殴(:93605-93690)
    if (this.npcVsCd <= 0) {
      for (const ent of game.enemies()) {
        const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean;
          damage?: number; def?: { damage?: number } };
        if (e.dead) continue;
        const dmg = e.damage ?? e.def?.damage ?? 0;
        if (dmg <= 0) continue;
        if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
        const dir = e.x + e.w / 2 > this.cx ? -1 : 1; // :93662 攻击者在右侧 → 向左击退
        this.npcVsCd = 30;                              // immune[255]=30
        this.hurt(dmg, dir * 6, 0, game);               // kb=6(:93661)
        break;
      }
    }
  }

  /** 危险扫描（NPC.cs:53864-53990）1:1（单机 netMode!=1）：
   *  - num11 = DangerDetectRange（默认 200；对话中 AttackType==3（挥击族）钳 ≥250，
   *    :53866-53874 flag5）
   *  - 敌门（:53887-53891）：!friendly && damage>0 且 < num12 距离 且 LOS
   *    （noTileCollide 敌直通——本仓敌实体均 tileCollide，canHit 统一）
   *  - num13/num14 = 左/右侧最近敌 dx（左取最大负、右取最小正，:53923-53945）
   *  - num15 危险侧（:53960-53963）：仅右 → 1；仅左 → −1；两侧 → 近者侧
   *  - PrettySafe 收口（:53998-54002）：最近敌距离仍 > PrettySafe → 不算险
   *    （向导 200 等远程族"够远就当没看见"——逃与还击（flag31 同源）一起停） */
  private dangerUpdate(world: import('../world/World').World, game: GameHooks): void {
    this.dangerNear = false;
    this.dangerSide = 0;
    let range = TOWN_DANGER_RANGE[this.vanillaId] ?? 200;
    if (this.talking && TOWN_ATTACK_TYPE[this.vanillaId] === 3 && range < 250) range = 250;
    let bestL = -1, bestR = -1;                       // num13/num14
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean;
        damage?: number; def?: { damage?: number } };
      if (e.dead) continue;
      const edmg = e.damage ?? e.def?.damage ?? 0;
      if (edmg <= 0) continue;                        // friendly||damage<=0 不算（:53887）
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      const dx = ecx - this.cx;
      if (Math.hypot(dx, ecy - this.cy) >= range) continue;   // num12==num11（本仓无 250 扩程态）
      if (!canHit(world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
      if (dx < 0) { if (bestL === -1 || dx > bestL) bestL = dx; }
      else { if (bestR === -1 || dx < bestR) bestR = dx; }
    }
    if (bestL === -1 && bestR === -1) return;
    this.dangerSide = bestL === -1 ? 1 : (bestR !== -1 ? (bestR < -bestL ? 1 : -1) : -1);
    let nearest = bestL !== -1 ? -bestL : 0;          // num20
    if (nearest === 0 || (bestR !== -1 && bestR < nearest && bestR > 0)) nearest = bestR;
    const pretty = TOWN_PRETTY_SAFE[this.vanillaId];
    if (pretty !== undefined && pretty < nearest) return;   // :53998-54002 收口
    this.dangerNear = true;
  }

  /** 越障三档跳 + 净空失败转身/被逼停（NPC.cs:54514-54611）。返回 true = 已折返
   *  （调用方保住翻转后的 facing 不被 wantDir 回写）。
   *  tile 探针（:54499-54501）：num26 = 前方列（center+15×dir）、num27 = 脚部行
   *  （Bottom−16px）；tileSafely5/4/3 = num27−2/−1/num27 本行。净空检查
   *  SolidTilesVersatile（Collision.cs:3450，越界视为堵 :3468-3479）——isSolid
   *  已排除 solidTop 家具（≈ tileSolid && !tileSolidTop）。flag25 = 身高 <3 格
   *  （42px → true）：两格档需 t5&&t4 同实心（矮个头顶要能过） */
  private obstacleJump(world: import('../world/World').World, wantDir: number): boolean {
    const st = world.store;
    const dir = wantDir;
    const ax = Math.floor((this.cx + 15 * dir) / TILE);          // num26（:54515）
    const fy = Math.floor((this.y + this.h - 16) / TILE);        // num27（:54516）
    const solidRange = (x1: number, x2: number, y1: number, y2: number): boolean => {
      if (x1 < 0 || x2 >= st.w || y1 < 0 || y2 >= st.h - 40) return true;
      for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) if (st.isSolid(x, y)) return true;
      return false;
    };
    const t5 = st.isSolid(ax, fy - 2), t4 = st.isSolid(ax, fy - 1), t3 = st.isSolid(ax, fy);
    const shortBody = this.h / 16 < 3;                  // flag25（:54502）
    let turn = false, freeze = false;
    if (t5 && (!shortBody || t4)) {
      // 两格上障碍：净空 = 身侧两列 num27−5..−1 + 障碍列 −5..−3（:54522-54526）
      if (!solidRange(ax - dir * 2, ax - dir, fy - 5, fy - 1)
        && !solidRange(ax, ax, fy - 5, fy - 3)) this.vy = -6;
      else if (this.dangerNear) { freeze = true; turn = true; }   // flag16（:54527-54530）
      else turn = true;
    } else if (t4) {
      // 一格上障碍：净空 −4..−1 / 障碍列 −4..−2（:54533-54537）
      if (!solidRange(ax - dir * 2, ax - dir, fy - 4, fy - 1)
        && !solidRange(ax, ax, fy - 4, fy - 2)) this.vy = -5;
      else if (this.dangerNear) { freeze = true; turn = true; }
      else turn = true;
    } else if (this.y + this.h - fy * 16 > 20 && t3
      && st.slope[st.idx(ax, fy)] !== 1 && st.slope[st.idx(ax, fy)] !== 2) {
      // 半格障碍（bottom 沉入脚部行 >20px 且非上坡面，:54542-54546）：净空 −3..−1
      if (!solidRange(ax - dir * 2, ax, fy - 3, fy - 1)) this.vy = -4.4;
      else if (this.dangerNear) { freeze = true; turn = true; }
      else turn = true;
    }
    if (freeze) {                                        // flag27（:54596-54600）
      this.corneredT = 240;                              // ai[0]=8 / ai[1]=240
      this.fleeing = false;
      this.vx = 0;
    }
    if (turn) {                                          // flag26（:54604-54608）
      this.facing = -dir;
      this.vx = -this.vx;
    }
    return turn;
  }

  /** 行走随机坐椅（NPC.cs:55774-55814）：行走态（wantDir!=0 ≈ ai[0]==1）站地
   *  rand(300)==0 → 脚下格（Bottom−2px）为椅/马桶（canSitAt 含 style 27 排除，
   *  :55803-55807）且无占位 → 坐。占位门 = 其他坐姿城镇 NPC（Bottom−2px 同格，
   *  :55782-55790）+ 坐姿玩家（Center 同格，:55791-55799）。落座锚与夜路径同构：
   *  原版 Bottom=(x*16+8+2*dir, y*16+16)（:55810）≡ sittingAnchor(x, y+1, dir)，
   *  故复用 forceSit（占位/朝向/锚点/时长 900+rand(10800) 全同链） */
  private tryRandomChairSit(
    world: import('../world/World').World, game: GameHooks, wantDir: number,
  ): boolean {
    if (wantDir === 0 || !this.onGround || this.sitting || this.talking
      || this.atkState !== 0 || this.corneredT > 0
      || this.dangerNear                                  // flag30 的 !flag16（:55620）
      || NO_SIT_NPC_IDS.has(this.vanillaId)) return false; // num=0 恒不触发（:53369-53373）
    if (Math.random() >= 1 / 300) return false;           // rand(num)==0（num=300）
    const st = world.store;
    const px = Math.floor(this.cx / TILE);
    const py = Math.floor((this.y + this.h - 2) / TILE);  // Bottom−2px（:55777）
    if (!st.inBounds(px, py)) return false;
    const ti = st.idx(px, py);
    if (!canSitAt(st.type[ti], st.frameY[ti])) return false;
    for (const o of game.npcs?.() ?? []) {                // NPC 占位（:55782-55790）
      const n = o as { sitting?: boolean; cx?: number; y?: number; h?: number; dead?: boolean };
      if (o === this || n.dead || !n.sitting) continue;
      const ox = Math.floor((n.cx ?? 0) / TILE);
      const oy = Math.floor(((n.y ?? 0) + (n.h ?? 0) - 2) / TILE);
      if (ox === px && oy === py) return false;
    }
    const pl = (game as unknown as {
      player?: { x: number; y: number; w: number; h: number; sitting?: boolean };
    }).player;                                            // 玩家占位（:55791-55799）
    if (pl?.sitting
      && Math.floor((pl.x + pl.w / 2) / TILE) === px
      && Math.floor((pl.y + pl.h / 2) / TILE) === py) return false;
    return this.forceSit(world, game, { x: px, y: py + 1 });   // 落座地面行 = 椅格+1
  }

  /** 城镇 NPC 自卫攻击（AI_007 攻击态机,NPC.cs:54747-55538 + 触发门 :55621-55966）。
   *  返回 true = 攻击态中(调用方停走)。语义对照:
   *  - flag31 门 ≈ 空闲+站地+触发冷却尽+探测范围内有可打敌(flag16;stinky 分支无系统跳过)
   *  - 掷骰 rand(max(1,chance×num3))==0,num3=2(209 ÷3),:53813/:53562
   *  - 入态:ai[1]=AttackTime,面向目标;态内每 tick ai[1]--/localAI[3]++/vx×0.8
   *  - 发射档:localAI[3]==num46/55/65;连发链 `localAI[3]>档 → 推下一档`(:55066 族)
   *  - 退出:ai[1]<=0 → 冷却 localAI[1] = cdBase/2 + rand(cdRand)(:54927-54934 族)
   *  伤害缩放(考古销项 2026-08-14):四态伤害统一走 GetAttackDamage_ForTownNPC
   *  (NPC.cs:7041-7044 = ×TownNPCDamageMultiplier.Sample(Main.Difficulty),
   *  GameDifficultyData.cs:69:Journey 2/Classic 1/Expert 1.5/Legendary 2,Master 3
   *  无键→区间插值 1.75)——已接 ScaleStats.getAttackDamageForTownNPC +
   *  mainDifficulty(旅程强度滑杆/getGoodWorld +1 同链)。
   *  num2 进度强化链(2026-08-14 接):AI_007 头部 :53400-53557 = 战斗书两本
   *  +0.25/17 Boss 旗标+硬模式(+0.05~+0.4)/Skyblock+0.5/醉酒尾乘×1.1——
   *  townNpcProgressionBoost(FromWorld) 1:1,num3(频率门除数)同链同步接;
   *  恒 false 登记:skyblockLowTiles(无 ScanTiles 计数链,见 fromWorld 注);
   *  tipsy=实例位(669 麦酒爆炸施加,TownShot.kill669→applyTipsy,本类
   *  tipsyT/tipsyNow 承接——消费点按 this.tipsy 覆盖 fromWorld 的 false)。
   *  已销项:633 狼人变体 proj929+×1.5/108 连发 1-3(权重 4:2:1)±3.4/160·663
   *  落点弹原版几何+重掷次数(10/5)。
   *  登记未接:挥击态逐 tick 弧形判定(GetSwingStats/TweakSwingStats,近似中段
   *  一击);:55864 族 flag28 LOS 掷骰直存;对话中 num3×0.8(:55617,本仓 talking
   *  不入攻击态不可达);防御链 :53401-53531(dryadWard+Boss 防,另批) */
  private attackUpdate(world: import('../world/World').World, game: GameHooks): boolean {
    if (this.atkCd > 0) this.atkCd--;
    const atkType = TOWN_ATTACK_TYPE[this.vanillaId];
    if (atkType === undefined) return false;
    this.hardModeFlag = !!(world.flags as Record<string, boolean>).hardMode;
    this.werewolfFlag = this.vanillaId === 633
      && shouldBestiaryGirlBeLycantrope(world.clock.moonPhase, world.clock.bloodMoon, world.clock.isDay);
    if (this.atkState === 0) {
      // 触发门:站地 + 冷却尽 + 探测范围内有 LOS 敌(:55621 flag31 + :55864 族掷骰)
      // 坐姿 ai[0]==5 不满足 flag31 的 ai[0]<2 门(:55621)——坐着不打,起身再打;
      // flag31 的 (flag16||flag18) 门(:55621)= 危险扫描命中(dangerNear,PrettySafe
      // 收口后)——远程族"敌在 PrettySafe 外"时逃/打一起停;flag18/flag17=stinky
      // 双路,本仓无 stinky 载体恒空。被逼停 ai[0]==8 在 flag31 豁免列——站定仍还击
      if (!this.onGround || this.atkCd > 0 || this.talking || this.sitting
        || !this.dangerNear) return false;
      const range = TOWN_DANGER_RANGE[this.vanillaId] ?? 200;
      const target = this.pickSideTarget(world, game, range);
      if (!target) return false;
      let chance = TOWN_ATTACK_CHANCE[this.vanillaId] ?? 1;
      // num3 = 进度强化链频率除数(:53413 起 19 项累计;2026-08-14 前恒 2 近似已废)
      // tipsy = 实例位（NPC.tipsy :93179,669 麦酒爆炸施加——非世界旗标）
      const progGate = townNpcProgressionFromWorld(world);
      progGate.tipsy = this.tipsy;
      let num3 = townNpcProgressionBoost(progGate).chanceMul;
      if (this.vanillaId === 209) num3 /= 3;    // :53548 蒸汽朋克人三倍勤
      const gate = Math.max(1, Math.floor(chance * num3));
      if (Math.random() >= 1 / gate) return false;  // rand(gate)==0
      const params = this.atkParams(atkType);
      if (!params && atkType !== 3) return false;
      this.atkState = atkType === 0 ? 10 : atkType === 1 ? 12 : atkType === 2 ? 14 : 15;
      this.holdAim = 0;                       // ai[2] 入态清零(:54931 族)
      this.atkTimer = TOWN_ATTACK_TIME[this.vanillaId] ?? 30;
      this.atkTick = 0;
      this.atkBurstIdx = 0;
      this.atkNextShot = (params as TownShotParams | undefined)?.shootTick ?? 1;
      this.facing = (target as { cx: number }).cx < this.cx ? -1 : 1;
      return true;
    }
    // ---- 态内推进 ----
    this.atkTimer--;
    this.atkTick++;
    this.vx *= 0.8;
    const range = TOWN_DANGER_RANGE[this.vanillaId] ?? 200;
    if (this.atkState === 15) {
      this.swingUpdate(world, game);
    } else {
      const params = this.atkParams(TOWN_ATTACK_TYPE[this.vanillaId]) as TownShotParams;
      // 连发链:localAI[3] 超过当前档 → 推下一档(原版逐档 if 链)
      const burst = params.burst ?? [];
      while (this.atkBurstIdx < burst.length && this.atkTick > this.atkNextShot) {
        this.atkNextShot = burst[this.atkBurstIdx++];
      }
      if (this.atkTick === this.atkNextShot) this.shootAt(world, game, params, range);
    }
    if (this.atkTimer <= 0) {
      // 退出 + 冷却(:54927/:55199/:55397/:55529 族):localAI[1] = cdBase/2 + rand(cdRand)
      const p = this.atkParams(TOWN_ATTACK_TYPE[this.vanillaId]);
      const cdBase = (p as TownShotParams | undefined)?.cdBase ?? 10;
      const cdRand = (p as TownShotParams | undefined)?.cdRand ?? 1;
      this.atkState = 0;
      this.holdAim = 0;                       // ai[2] 态尽归零(:55203 族)
      this.atkCd = Math.floor(cdBase / 2) + Math.floor(Math.random() * Math.max(1, cdRand));
    }
    return true;
  }

  /** 当前类型的态参数(10/12/14;15 走 TOWN_SWING);hardMode 覆盖按 world.flags */
  private atkParams(atkType: 0 | 1 | 2 | 3): TownShotParams | undefined {
    const table = atkType === 0 ? TOWN_MELEE : atkType === 1 ? TOWN_BOW : atkType === 2 ? TOWN_MAGIC : undefined;
    if (!table) return undefined;
    const base = table[this.vanillaId];
    if (!base) return undefined;
    if (base.hardMode && this.hardModeFlag) return { ...base, ...base.hardMode } as TownShotParams;
    // 633 狼人态(:54782-54785):换 proj 929 + dmg×1.5 取(int)截断(15→22)
    if (this.vanillaId === 633 && this.werewolfFlag) {
      return { ...base, proj: 929, dmg: Math.trunc(base.dmg * 1.5) };
    }
    return base;
  }


  /** 挥击态(15):前方矩形近战判定(:55469-55494;原版逐 tick 弧形挥击,近似中段一击) */
  private swingUpdate(world: import('../world/World').World, game: GameHooks): void {
    const sw = TOWN_SWING[this.vanillaId];
    if (!sw) return;
    const t = TOWN_ATTACK_TIME[this.vanillaId] ?? 15;
    if (this.atkTick !== Math.max(1, Math.floor(t / 2))) return; // 挥击中段
    const rect = sw.rect;
    const rx = this.facing === 1 ? this.cx : this.cx - rect;
    const ry = this.cy - rect / 2;
    let dmg = sw.dmg;
    let kb = sw.kb;
    if (this.vanillaId === 441 && this.givenName === 'Andrew') { dmg *= 2; kb *= 2; } // 猫单特典 :55431
    // num2 进度强化链(:53400-53557)先于难度曲线(:55466 同式)
    // tipsy = 实例位（NPC.tipsy :93179,669 麦酒爆炸施加——非世界旗标）
    const progSwing = townNpcProgressionFromWorld(world);
    progSwing.tipsy = this.tipsy;
    const num2 = townNpcProgressionBoost(progSwing).damageMul;
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean };
      if (e.dead) continue;
      if (!(rx < e.x + e.w && rx + rect > e.x && ry < e.y + e.h && ry + rect > e.y)) continue;
      // 伤害结算(:55466):GetAttackDamage_ForTownNPC(num82*num2)——(int) 截断
      if (e.hurt(getAttackDamageForTownNPC(dmg * num2, mainDifficulty(world)), this.facing * kb, 0, game)) {
        game.addDamageNumber(e.x, e.y, dmg, false, '#FFD060');
      }
    }
  }

  /** 探测范围内按侧取最近可打敌(:53887-53958 近侧目标;LOS=Collision.CanHit)。
   *  返回含实体 position/Size——160/663 落点弹几何按原版 Main.npc[n].position/Size 采样 */
  private pickSideTarget(world: import('../world/World').World, game: GameHooks, range: number):
    { cx: number; cy: number; x: number; y: number; w: number; h: number } | null {
    let bestL: { cx: number; cy: number; x: number; y: number; w: number; h: number; d: number } | null = null;
    let bestR: { cx: number; cy: number; x: number; y: number; w: number; h: number; d: number } | null = null;
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean;
        damage?: number; def?: { damage?: number } };
      if (e.dead) continue;
      // 原版扫描门(:53887):!friendly && damage>0 才算威胁(0 伤敌/友好不算)
      const edmg = e.damage ?? e.def?.damage ?? 0;
      if (edmg <= 0) continue;
      // 中心由 x/y/w/h 推导(敌实体有 cx/cy,但勿依赖——判距门曾因 NaN 恒假失效)
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      const dx = ecx - this.cx;
      const d = Math.hypot(dx, ecy - this.cy);
      if (d >= range) continue;
      if (!canHit(world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
      const cand = { cx: ecx, cy: ecy, x: e.x, y: e.y, w: e.w, h: e.h, d };
      if (dx < 0) { if (!bestL || d < bestL.d) bestL = cand; }
      else { if (!bestR || d < bestR.d) bestR = cand; }
    }
    // num15 侧选择(:53960):两侧都有 → 距离近者;仅一侧 → 该侧
    if (bestL && bestR) return bestL.d <= bestR.d ? bestL : bestR;
    return bestL ?? bestR;
  }

  /** 发射(:54903/:55175/:55325 三族瞄准公式统一在此) */
  private shootAt(world: import('../world/World').World, game: GameHooks, params: TownShotParams, range: number): void {
    const st = world.store;
    let proj = params.proj;
    let dmg = params.dmg;
    let speed = params.speed;
    let kb = params.kb;
    let spread = params.spread;
    // 229 PrettySafe 近距保命换炮弹(:55128-55135)
    const pretty = TOWN_PRETTY_SAFE[this.vanillaId];
    const target = this.pickSideTarget(world, game, range);
    if (params.panic && pretty && target && Math.hypot(target.cx - this.cx, target.cy - this.cy) < pretty
      && this.atkTick === params.shootTick) {
      proj = params.panic.proj; dmg = params.panic.dmg; speed = params.panic.speed;
      kb = params.panic.kb; spread = params.panic.spread;
    }
    // 209 三选一弹(:55139)
    if (this.vanillaId === 209 && !params.panic) {
      const pick = [134, 133, 135][Math.floor(Math.random() * 3)];
      proj = pick;
      const m: Record<number, [number, number, number, number, number]> = {
        134: [20, 13, 4, 0.1, 20], 133: [25, 10, 6, 0.2, 10], 135: [30, 12, 7, 0.2, 30],
      };
      [dmg, speed, kb, spread] = [m[pick][0], m[pick][1], m[pick][2], m[pick][3]];
    }
    // 瞄准:弓 = 目标上抬 aimLift 取向;近战/魔法 = aimLiftScaled×(dist/range 归一)上抬
    let vx = this.facing, vy = 0;
    if (target) {
      // ai[2] 持械瞄准值(:55191-55197):弓族发射档取【目标中心】方向 Y 钳 ±0.5
      // (原版另有 flag28 LOS 门——触发门已验 LOS,此处近似直存;aimLift 不参与)
      if (this.atkState === 12) {
        const pdx = target.cx - this.cx, pdy = target.cy - this.cy;
        const pdl = Math.hypot(pdx, pdy) || 1;
        this.holdAim = Math.max(-0.5, Math.min(0.5, pdy / pdl));
      }
      let lift = params.aimLift ?? 0;
      if (this.atkState === 10 || this.atkState === 14) {
        const dist = Math.hypot(target.cx - this.cx, target.cy - this.cy);
        lift = (params.aimLiftScaled ?? 0) * Math.max(0, Math.min(1, dist / range));
        vy = -1; // 近战/魔法默认上抛分量(初值 -UnitY)
      }
      const dx = target.cx - this.cx;
      const dy = target.cy - lift - this.cy;
      const dl = Math.hypot(dx, dy) || 1;
      vx = dx / dl; vy = dy / dl;
      if (Math.sign(vx) !== this.facing) { vx = this.facing; vy = this.atkState === 12 ? 0 : -1; }
    } else if (this.atkState !== 12) {
      vy = -1;
    }
    vx *= speed; vy *= speed;
    // 散布(Utils.RandomVector2 ±spread;近战态恒 0)
    if (spread > 0) {
      vx += (Math.random() * 2 - 1) * spread;
      vy += (Math.random() * 2 - 1) * spread;
    }
    // 伤害结算(近战 :54897/弓 :55169/魔法 :55319 同式):
    // GetAttackDamage_ForTownNPC(dmg*num2)——(int) 截断;num2 进度强化链
    // (:53400-53557,2026-08-14 接,2026-08-14 前恒 1 近似已废)
    // tipsy = 实例位（NPC.tipsy :93179,669 麦酒爆炸施加——非世界旗标）
    const progShot = townNpcProgressionFromWorld(world);
    progShot.tipsy = this.tipsy;
    const num2 = townNpcProgressionBoost(progShot).damageMul;
    const dmgFinal = getAttackDamageForTownNPC(dmg * num2, mainDifficulty(world));
    const sx = this.cx + this.facing * 16 - 5;
    const sy = this.cy - 2 - 5;
    // 落点弹(160/663):目标区域随机点生成 velocity=0;实心重掷(160≤10/:55351、
    // 663≤5/:55369),重掷耗尽仍实心则按末次落点照常生成(原版 while 语义)
    if (speed === 0 && target) {
      const is160 = this.vanillaId === 160;
      let retries = is160 ? 10 : 5;
      let px = 0, py = 0;
      do {
        if (is160) {   // :55349 position − Size×2 + Size×rand(0..1)×5(逐轴独立)
          px = target.x - target.w * 2 + target.w * Math.random() * 5;
          py = target.y - target.h * 2 + target.h * Math.random() * 5;
        } else {       // :55367 position + Size×rand(0..1)
          px = target.x + target.w * Math.random();
          py = target.y + target.h * Math.random();
        }
      } while (retries-- > 0 && st.isSolid(Math.floor(px / TILE), Math.floor(py / TILE)));
      game.spawnTownShot?.(new TownShot(px - 5, py - 5, 0, 0, dmgFinal, kb, proj, { noGravity: true }));
      return;
    }
    // 108 巫师连发(:55336-55348):SelectRandom(1,1,1,1,2,2,3) 掷 1-3 发(权重 4:2:1),
    // 每发速度额外 ±3.4 逐轴随机(共基速 vec4,叠加 vector5)
    if (this.vanillaId === 108) {
      const n = [1, 1, 1, 1, 2, 2, 3][Math.floor(Math.random() * 7)];
      for (let i = 0; i < n; i++) {
        const ox = (Math.random() * 2 - 1) * 3.4;
        const oy = (Math.random() * 2 - 1) * 3.4;
        game.spawnTownShot?.(new TownShot(sx, sy, vx + ox, vy + oy, dmgFinal, kb, proj, {}));
      }
      return;
    }
    game.spawnTownShot?.(new TownShot(sx, sy, vx, vy, dmgFinal, kb, proj, {
      life: this.vanillaId === 588 ? 480 : undefined,
    }));
  }

  /** 城镇 NPC 开关门（原版 NPC.cs:54478-54500/54243-54252，含高门 389 族 ShiftTallGate） */
  private npcDoorUpdate(world: import('../world/World').World, game: GameHooks) {
    const st = world.store;
    const DOOR_OPEN = TILE_BY_KEY_DOOR_TILES['door_open'] ?? -1;
    const GATE_OPEN = TILE_BY_KEY_DOOR_TILES['tall_gate_open'] ?? -1;
    // 过门关门：中心距门 >2 格 → 关；>4 格或换层 → 放弃（原版 54243-54252）
    if (this.closeDoor) {
      const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
      if (Math.abs(tx - this.doorX) > 2 || Math.abs(ty - this.doorY) > 4) {
        const doorType = st.type[st.idx(this.doorX, this.doorY)];
        if (Math.abs(tx - this.doorX) <= 4 && Math.abs(ty - this.doorY) <= 4) {
          if (doorType === DOOR_OPEN) closeDoorTile(st, this.doorX, this.doorY);
          else if (doorType === GATE_OPEN) {
            // 高门关门（原版 54266-54274：ShiftTallGate(closing:true)，tile 389 → 388）
            shiftTallGate(st, this.doorX, this.doorY, true, () => game.playSfx('door_close', 1, this.cx, this.cy));
          }
        }
        this.closeDoor = false;
      }
      return;
    }
    // 撞门开门：前方碰撞点是关着的普通门（10）或高门（388）
    // （原版 54478-54500：Next(10)==0；普通门两方向回退，高门 ShiftTallGate(closing:false)）
    if (!this.hitWall) return;
    const fx = Math.floor((this.cx + this.facing * (this.w / 2 + 2)) / TILE);
    const fy = Math.floor((this.y + this.h - 8) / TILE);
    for (const dy of [0, -1]) {
      const x = fx, y = fy + dy;
      if (x < 1 || y < 1 || x >= st.w - 1 || y >= st.h - 1) continue;
      const t = st.type[st.idx(x, y)];
      if (Math.random() >= 0.1) return;   // 原版 Next(10)==0
      if (t === TILE_BY_KEY_DOOR_TILES['door_closed']) {
        const before = st.type[st.idx(x, y)];
        const opened = openDoor(st, x, y, this.facing) || openDoor(st, x, y, -this.facing);
        if (opened && before !== st.type[st.idx(x, y)]) {
          this.closeDoor = true;
          this.doorX = x; this.doorY = y;
          game.playSfx('door_open', 1, this.cx, this.cy);
        }
        return;
      }
      if (t === TILE_BY_KEY_DOOR_TILES['tall_gate_closed']) {
        const anchor = shiftTallGate(st, x, y, false, () => game.playSfx('door_open', 1, this.cx, this.cy));
        if (anchor) {
          this.closeDoor = true;
          this.doorX = anchor[0]; this.doorY = anchor[1];
        }
        return;
      }
    }
  }

  /** 坐姿状态机（AI_007 ai[0]==5 族，NPC.cs:53264-53287 入座 / :54682-54710 态推进）。
   *  返回 true = 坐姿中（调用方停走）。语义对照：
   *  - 入座门：夜/雨 flag（restSpot 非空）+ 非对话 + 非攻击态（坐姿与攻击互斥：
   *    flag31 的 ai[0]<2 门 :55621 不含 5）+ 站定在 rest spot 同格（:54074
   *    num6==floorX && num7==floorY）——刚走回家传送者免站定门
   *    （TeleportToHome 落位即 TryForcingSitting :56081）
   *  - 入座（forceSit）：ai[1]=900+rand(10800)、direction=frameX!=0?1:-1、
   *    Bottom=(x*16+8+2*dir, y*16)、velocity=0（:53283-53287）
   *  - 态内：vx×0.8、ai[1]--；椅格（Bottom−2px）非椅/马桶 → ai[1]=0 立即起身
   *    （:54691-54697）；对话打断在 talking 块（:53738）
   *  - 时限起身：ai[1]<=0 → ai[0]=0 / localAI[3]=30+rand(60)（:54703-54709；
   *    本仓 wanderT 承接转向冷却）。原版 Main.sittingManager.AddNPC（:54701，
   *    同椅叠坐错位）无对应渲染载体，略——占位互斥由 forceSit 的占位门承担 */
  private sittingUpdate(world: import('../world/World').World, _game: GameHooks): boolean {
    if (this.sitting) {
      this.vx *= 0.8;                                   // :54684
      this.sitTimer--;                                  // :54685
      const st = world.store;
      const tx = Math.floor(this.cx / TILE);
      const ty = Math.floor((this.y + this.h - 2) / TILE);   // Bottom−2px 格（:54692）
      if (!st.inBounds(tx, ty) || !canSitAt(st.type[st.idx(tx, ty)], st.frameY[st.idx(tx, ty)])) {
        this.sitTimer = 0;                              // 椅子没了 → 起身（:54695）
      }
      if (this.sitTimer <= 0) {
        this.sitting = false;
        this.wanderT = SIT_STAND_WANDER_BASE + Math.floor(Math.random() * SIT_STAND_WANDER_RAND);
      }
      return this.sitting;
    }
    if (!this.restSpot || this.talking || this.atkState !== 0 || !this.home) return false;
    if (!this.teleportedHome) {
      if (!this.onGround || Math.abs(this.vx) > 0.05) return false;
      // 站定同格门（:54074）：myTile == rest spot
      const myX = Math.floor(this.cx / TILE), myY = Math.floor((this.y + this.h) / TILE);
      if (myX !== this.restSpot.x || myY !== this.restSpot.y) return false;
    }
    return this.forceSit(world, _game, this.restSpot);
  }

  /** AI_007_TryForcingSitting（NPC.cs:53264-53287）：落座地面格上一行须为可坐格
   *  （canSitAt 含椅 style 27 排除门）+ 无其他坐姿城镇 NPC 占位 → 坐下 */
  private forceSit(world: import('../world/World').World, game: GameHooks, spot: SitSpot): boolean {
    const st = world.store;
    const cx = spot.x, cy = spot.y - 1;            // 椅格 = 落座地面格上一行（:53270）
    if (!st.inBounds(cx, cy)) return false;
    const ci = st.idx(cx, cy);
    if (st.type[ci] === 0 || !canSitAt(st.type[ci], st.frameY[ci])) return false;
    // 占位门（:53278-53286）：任一坐姿城镇 NPC 的 Bottom−2px 格 == 本椅格 → 放弃
    for (const o of game.npcs?.() ?? []) {
      const n = o as { sitting?: boolean; cx?: number; y?: number; h?: number; dead?: boolean };
      if (o === this || n.dead || !n.sitting) continue;
      const ox = Math.floor((n.cx ?? 0) / TILE);
      const oy = Math.floor(((n.y ?? 0) + (n.h ?? 0) - 2) / TILE);
      if (ox === cx && oy === cy) return false;
    }
    this.sitting = true;
    this.sitTimer = SIT_TIME_BASE + Math.floor(Math.random() * SIT_TIME_RAND);   // :53283
    this.facing = chairFacing(st.frameX[ci]);                                    // :53284
    const anchor = sittingAnchor(spot.x, spot.y, this.facing);                   // :53285-53286
    this.x = anchor.x - this.w / 2;
    this.y = anchor.y - this.h;
    this.vx = 0; this.vy = 0;
    return true;
  }

  /** 当前应使用的贴图 sheet（= DrawNPCCheckAlt Main.cs:22304-22309 →
   *  TownNPCProfiles.GetProfile + profile.GetTextureNPCShouldUse 净效果）。
   *  微光态 → TownNPCs/Shimmered/{Name}_Default 档；派对/狼人 alt → 同档的
   *  _Party / _Transformed 变体。无档案类型（637/638/656 宠物等）返回 null，
   *  渲染端回落 NPC_{id} 竖条。Renderer.drawTownNPC 消费 */
  get townSheet(): string | null {
    return townNpcProfileSheet(this.vanillaId, this.shimmered ? 1 : 0, this.altTexture);
  }

  draw() { /* Renderer 统一绘制 */ }
}
