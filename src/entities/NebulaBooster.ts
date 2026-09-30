// 星云套装 on-hit 引擎（BJ424 用户实报定谳「套装效果没有生效」——本仓旧态只在
// Game.ts 四个专支（711/261/魔法飞弹/宝石法珠）挂 nebulaCb 回调且 booster 是
// Game 私有数组（无渲染/重力错挂/拉距 52），其余魔法弹面（通用尾支等百余件）零
// 触发。本刀把触发链单源化到与 ghostHurtOnHit（SpectreSoulProj）同一原版块内。
//
// 反编译真值（Terarria1457/Terraria/Projectile.cs Damage_PVE_Inner）：
//   :13712  flag10 |= num41 > 0 && targetNPC.lifeMax > 5 && friendly && !hostile
//                    && aiStyle != 59;
//   :13883  if (flag10) { ... :13876 if (targetNPC.canGhostHeal | flag9) {
//   :13885    if (magic && Main.player[owner].setNebula && nebulaCD == 0
//                  && Main.rand.Next(3) == 0) {
//   :13886      Main.player[owner].nebulaCD = 30;
//   :13887      int num59 = Utils.SelectRandom<int>(Main.rand, 3453, 3454, 3455);
//   :13888-89   Item.RequestNewItem(velocity: new Vector2(
//                 Main.rand.Next(10, 31) * 0.2f * num40,      // X∈[2..6]×方向
//                 Main.rand.Next(-20, 1) * 0.2f),             // Y∈[-4..0]
//               center: targetNPC.Center, type: num59);       // 出生点=目标中心
//
// num40（:13652-13676）基面 = Projectile.direction（速度 X 符号）；覆写面 =
// 弹型 697/699/707/708/759 与 aiStyle 188-191/15 改「玩家↔目标」X 比对——经
// vanilla-projectiles.json 全表核对，该覆写面全部无 magic 位（697/699/707/708/759
// =melee/minion、974/978/982-985/997/1043/1125/1126 等 aiStyle188-191 全 non-magic、
// 15=连枷 melee），在 magic 可达面上恒不可达 ⇒ 只实现基面，无行为差。
//
// booster 载体 = 原版真实 Item 3453-55（NebulaPickup1-3，Item.cs:31005-31021：
// 12×12/maxStack1/buffType 179/173/176）：本仓走 ItemDrop 全基建（ITEM_NO_GRAVITY
// 悬停 WorldItem.cs:781-792 / 拉距 42+100 dropScanCtx:92 / PullItem_Pickup(12,5) /
// 碰盒拾取 → NebulaLevelup Player.cs:35322-35332），pickup 标签在 Game.spawnDrop
// 按 vid 注入（3453=伤/3454=命/3455=魔）。
import { projectileData } from '../data/vanillaProjectiles';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { spectreVictimEligible } from './SpectreSoulProj';
import type { GameHooks } from './types';

export interface NebulaHitSrc {
  /** Projectile.type（数据面 magic/hostile/aiStyle 读此） */
  projId: number;
  /** 弹 velocity.X（num40 基面 = Projectile.direction 同符号；0 → 1 缺省向） */
  projDirX: number;
}

/** NebulaPickup 三键（ItemID.Sets.NebulaPickup ItemID.cs:1116）+ vid→buff 族映射
 *  （Item.cs:31008-31017 buffType：3453→179 伤/3454→173 命/3455→176 魔）。
 *  单源消费面：Game.spawnDrop pickup 标签注入 / ItemDrop 拾取 fam 反查 / 测试。 */
export const NEBULA_BOOSTER_VIDS: ReadonlySet<number> = new Set([3453, 3454, 3455]);
export function nebulaBoosterFamOf(vid: number): 0 | 1 | 2 {
  return vid === 3454 ? 1 : vid === 3455 ? 2 : 0;
}
export interface NebulaHitVictim {
  x: number; y: number; w: number; h: number;   // 受害盒
  cx?: number; cy?: number;                     // Center 缺席 = 盒心
  /** canGhostHeal 门源（SPECTRE_NO_GHOST_HEAL 同表；缺省放行） */
  vanillaId?: number | null;
  /** NPC.lifeMax（:13712 flag10 的 >5 段；缺省视为通过——与 vanillaFlag10LifeMaxOk 同约） */
  lifeMax?: number;
  /** StrikeNPC 返回值 num41 等位（Enemy.lastStrikeDealt——本拍结算面,拒收=0） */
  dealt: number;
}

/**
 * 星云套装魔法命中 proc（Projectile.Damage_PVE_Inner :13885-13891 1:1）。
 * 调用契约 = 与 ghostHurtOnHit 完全同位（原版同 if 块、同一 flag10/canGhostHeal
 * 门面，Arrow/MagicProj/MissileProj/Dart/WeaponProj/proj1457/ClingerStaffWallProj
 * 命中环在 StrikeNPC 后调用）；引擎自持全部门（非 magic 弹/未穿套/CD 中空掷），
 * 调用方无须前置判型。
 */
export function nebulaBoosterOnHit(game: GameHooks, src: NebulaHitSrc, victim: NebulaHitVictim): void {
  // ---- 弹面门（:13712 flag10 的 friendly/!hostile/aiStyle≠59 段 + :13885 magic）----
  // friendly：调用面全部是玩家弹命中环（hostile 弹不走本域命中环）——原版
  // `friendly && !hostile` 对玩家弹恒真,只余数据面 hostile 排除（召唤反噬 377 等无
  // 玩家弹面,同零差）。
  const pd = src.projId > 0 ? projectileData(src.projId) : null;
  if (!pd || !pd.magic || pd.hostile) return;
  if (pd.aiStyle === 59) return;                       // 356 浮魂弹自链排除（:13712）
  // ---- 受害面门（:13712 num41>0 ∧ lifeMax>5；:13876 canGhostHeal | flag9）----
  if (!(victim.dealt > 0)) return;
  if (victim.lifeMax !== undefined && !(victim.lifeMax > 5)) return;
  if (!spectreVictimEligible(victim.vanillaId)) return;
  // ---- 玩家面（:13885）：setNebula ∧ nebulaCD==0 ∧ Next(3)==0 ----
  // equipStats/nebulaCD 可选链 = 桩宿主鲁棒面（裸 stub player 缺字段 ≡ 未穿套）
  const p = game.player;
  if (!p?.equipStats?.nebulaSet || p.nebulaCD !== 0) return;
  if (Math.random() >= 1 / 3) return;
  p.nebulaCD = 30;                                     // :13886
  // ---- 生成（:13887-13890）----
  const fam = Math.floor(Math.random() * 3);           // SelectRandom(3453,3454,3455)
  const key = VANILLA_ITEM_KEY_BY_ID[3453 + fam];      // 0=伤 179 / 1=命 173 / 2=魔 176
  if (!key) return;
  const vx = (10 + Math.floor(Math.random() * 21)) * 0.2 * (src.projDirX >= 0 ? 1 : -1);
  const vy = (-20 + Math.floor(Math.random() * 21)) * 0.2;
  game.spawnDrop(
    victim.cx ?? victim.x + victim.w / 2,              // center: targetNPC.Center
    victim.cy ?? victim.y + victim.h / 2,
    key, 1, vx, vy);                                   // velocity: :13888-13889
}
