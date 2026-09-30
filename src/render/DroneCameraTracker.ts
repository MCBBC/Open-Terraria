// ★X4 清偿刀I（2026-09-29）：DroneCameraTracker 通道定谳+实装。
// 原版 Terraria.DataStructures/DroneCameraTracker.cs 全文 1:1（34 行，1457 直读）：
//   Track(:11-15) / WorldClear(:17-21) / TryTracking(:23-33)。
// 原版单例 = Main.DroneCameraTracker（Main.cs:1893）；唯一消费点 =
// GetObjectTrackingCameraPan（Main.cs:63677-63699，优先序 spectating :63682-63687 →
// dead 门 :63688-63691 → 本通道 :63692-63694 → 高尔夫 :63696-63699）。
// 原版 Track 调用方（两处，均在 owner==Main.myPlayer 支内）：
//   AI_205_RemoteControlCar  Projectile.cs:38825（物品 5738 墙上飞车/弹 1105）
//   AI_195_JimsDrone         Projectile.cs:41688（物品 5451 四轴竞速无人机/弹 1020）
//   ——本仓两 AI 尚未实装（登记债「ai195/205 本体行为另批登记」，Game.ts :14282
//   5451/5738 spawn 共用支以惯性 Arrow 承载），过渡期 Track 由该共用支出膛位代行
//   （同型同主单实例语义下与逐帧 Track 观测等价：Track 幂等覆写，type/owner 出膛
//   后不变；AI 批落地后由其逐帧 Track 接管，双写无害）。
// WorldClear = WorldGen.cs:6950（clearWorld 家族，紧邻 LocalGolfState.WorldClear
//   :6951）——本仓 Camera 每世界重建（Game.ts :7264 构造点,★清偿刀 P4 锚勘误
//   2026-09-30:旧引 :7157 漂移,亲读复核）= 同相复位（BJ400 注
//   先例：CurrentPan=Zero ≙ WorldGen.cs:6952），tracker 宿主于 Camera.droneTracker。
// 装备门 remoteVisionForDrone：Player.cs:2373 字段；ResetEffects :18828 复位；
//   UpdateEquips 两支 case 5452 置位——功能配饰环 m∈[3,10) ApplyEquipFunctional
//   （:13044-13049 循环 → case :15574-15577）+ 社交配饰环 n∈[13,20)
//   ApplyEquipVanity（:13110-13115 循环 → case :14314-14316，虚荣槽亦授权）；
//   两支槽位实取 GetEffectiveArmor（:5678）= 空槽收藏共享件同算（LoadoutShare 面）。
// MP 面：原版 UpdateCameraPan 置 LocalPlayer.netCameraTarget=trackedPosition 并在
//   位移 >160px 时发 msg13（Main.cs:63620-63628）——本仓 netCameraTarget 全域未建模
//   （观战/高尔夫支同缺，同域登记债）。
// ★清偿刀N（2026-09-29）：登记债「面部穿戴视觉未入 accDrawslots」判伪——face 槽四层
//   路由 2026-09-03 已整链落地（face-layer-routing.test.ts），5452→face:21 提取器原生
//   在位，Renderer base 支出 Acc_Face_21.png（裸锚零偏移=GetFaceDrawOffset 无 case 21）。
//   判别锁面 = tests/drone-visor-face-draw.test.ts（视觉隐≠功能门:戴盔 face=-1 但
//   remoteVisionForDrone 仍真,两门独立）。
import { ITEM_DEFS } from '../data/items';

/** Track 目标最小结构面（弹幕族结构兼容：projId ≙ Projectile.type、dead ≙ !active、
 *  ownerPlayer ≙ owner、cx/cy ≙ Center=position+size/2） */
export interface DroneCameraTrackable {
  projId: number;
  dead: boolean;
  readonly cx: number;
  readonly cy: number;
  ownerPlayer?: unknown;
}

/** 装备门扫描所需 Inventory 结构面（src/items/Inventory.ts 实形满足） */
export interface DroneVisionInventory {
  armor: ReadonlyArray<{ id: number } | null>;
  effectiveSharedFrom(slot: number, dye: boolean): number | null;
  loadouts: ReadonlyArray<{ armor: ReadonlyArray<{ id: number } | null> }>;
}

/** remoteVisionForDrone 装备面现算（本仓不碰 Player.ts——原版为每拍 ResetEffects
 *  复位 + UpdateEquips 两支置位的重算面，现算同相无跨拍持久态）。
 *  槽域：功能配饰 3-9（:13044-13049）∪ 社交配饰 13-19（:13110-13115）；盔甲三槽
 *  0-2 与时装盔甲 10-12 非面部配饰域（faceSlot=21 件不可入，扫描域不含）。
 *  槽位实取 ≙ GetEffectiveArmor（:5678-5692）：槽非空用槽件（IsAir 门 :5681），
 *  空槽回退收藏共享件（Inventory.effectiveSharedFrom 同法）。 */
export function hasRemoteVisionForDrone(inv: DroneVisionInventory): boolean {
  const vidOf = (s: { id: number } | null | undefined): number =>
    s ? (ITEM_DEFS[s.id]?.vid ?? -1) : -1;
  const visorAt = (slot: number): boolean => {
    if (vidOf(inv.armor[slot]) === 5452) return true;
    if (inv.armor[slot]) return false;              // 槽非空 → 无共享（:5681 IsAir 门）
    const from = inv.effectiveSharedFrom(slot, false);
    return from !== null && vidOf(inv.loadouts[from].armor[slot]) === 5452;
  };
  for (let i = 3; i < 10; i++) if (visorAt(i)) return true;    // ApplyEquipFunctional 环
  for (let i = 13; i < 20; i++) if (visorAt(i)) return true;   // ApplyEquipVanity 环
  return false;
}

export class DroneCameraTracker {
  private tracked: DroneCameraTrackable | null = null;
  private lastTrackedType = 0;

  /** Track（DroneCameraTracker.cs:11-15）：_trackedProjectile=proj;
   *  _lastTrackedType=proj.type（本仓 type ≙ projId）。 */
  track(proj: DroneCameraTrackable): void {
    this.tracked = proj;
    this.lastTrackedType = proj.projId;
  }

  /** WorldClear（:17-21）：双字段全清。注意 TryTracking 失败只清 tracked 不清
   *  lastTrackedType（:28 仅 _trackedProjectile=null）——唯一全清口=WorldClear。 */
  worldClear(): void {
    this.lastTrackedType = 0;
    this.tracked = null;
  }

  /** TryTracking（:23-33）1:1 门集（:26）：null ∨ !active(dead) ∨ type 变
   *  ∨ owner≠本地玩家 ∨ !remoteVisionForDrone → 清 tracked（不清 lastTrackedType）
   *  返 null；过门 → cameraPosition = Center（:31）。 */
  tryTracking(localPlayer: unknown, inv: DroneVisionInventory): { x: number; y: number } | null {
    const p = this.tracked;
    if (p === null || p.dead || p.projId !== this.lastTrackedType
      || p.ownerPlayer !== localPlayer || !hasRemoteVisionForDrone(inv)) {
      this.tracked = null;
      return null;
    }
    return { x: p.cx, y: p.cy };
  }
}
