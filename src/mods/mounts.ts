// mod 坐骑运行时(★第三批,2026-10-13;工坊普查五刀战役,锚点见
// docs/mod-five-knives-recon-2026-10-13.md 第二批/第三批节)。
// 形态:content/mounts/*.json {key,buff,texture,...} → mount id 66+ 段(原版
// MOUNT_COUNT=66,ids 0-65)→ MOUNT_DATA/MOUNT_SETS/ITEM_TO_MOUNT 直追加
// (mount id=internal=stable 零恒等表;setMount 门 m>=MOUNT_COUNT 消费)。
// 首刀只接「非矿车+无 ability」声明族(矿车/缩盒/ability 特效=L2 后置)。
// tML 对应:ModMount 11 钩——本批声明面覆盖 MountData 数据面+SetMount/Dismount,
// UpdateEffects/UpdateFrame/UseAbility=登记债。
import { MOUNT_DATA, bumpMountCountMax } from '../entities/Mounts';
import { MOD_MOUNT_STABLE_BASE, MOD_MOUNT_STABLE_MAX } from './types';

export interface ModMountContent {
  key: string;
  name?: string;
  /** mod buff 键(content/buffs 已注册;注册期 modBuffTypeOf → BuffType→伪 vanilla id) */
  buff: string;
  /** Mount_<id>.png 同构贴图(textures/ 相对路径) */
  texture: string;
  /** 必填物理面(MountData 直传) */
  runSpeed: number;
  acceleration: number;
  jumpHeight: number;
  jumpSpeed: number;
  /** 可选物理面(MountData 直传;缺省=不设) */
  heightBoost?: number;
  flightTimeMax?: number;
  fatigueMax?: number;
  fallDamage?: number;
  extraFall?: number;
  dashSpeed?: number;
  swimSpeed?: number;
  usesHover?: boolean;
  constantJump?: boolean;
  blockExtraJumps?: boolean;
  canUseWings?: boolean;
  /** 帧面(Mount_<id>.png 纵向帧条) */
  totalFrames: number;
  standingFrameStart?: number; standingFrameCount?: number; standingFrameDelay?: number;
  runningFrameStart?: number; runningFrameCount?: number; runningFrameDelay?: number;
  flyingFrameStart?: number; flyingFrameCount?: number; flyingFrameDelay?: number;
  inAirFrameStart?: number; inAirFrameCount?: number; inAirFrameDelay?: number;
  idleFrameStart?: number; idleFrameCount?: number; idleFrameDelay?: number;
  swimFrameStart?: number; swimFrameCount?: number; swimFrameDelay?: number;
  dashingFrameStart?: number; dashingFrameCount?: number; dashingFrameDelay?: number;
  playerYOffsets?: number[];
  xOffset?: number;
  yOffset?: number;
  playerHeadOffset?: number;
  emitsLight?: boolean;
  lightColor?: number[];
}

/** mod 坐骑 mount id(66+ 段)注册入口——MOUNT_DATA 直追加 */
export function registerModMountData(id: number, data: import('../entities/Mounts').MountData): void {
  if (!(id >= MOD_MOUNT_STABLE_BASE && id <= MOD_MOUNT_STABLE_MAX)) {
    throw new Error(`[mod-mount] mount id 须在 ${MOD_MOUNT_STABLE_BASE}..${MOD_MOUNT_STABLE_MAX}: ${id}`);
  }
  if (MOUNT_DATA[String(id)]) throw new Error(`[mod-mount] mount id 已被占用: ${id}`);
  (MOUNT_DATA as Record<string, import('../entities/Mounts').MountData>)[String(id)] = data;
  bumpMountCountMax(id);   // setMount 门 _mountCountMax 递增
}

/** mod 坐骑 mount id 读面 */
export function modMountDataOf(id: number): import('../entities/Mounts').MountData | null {
  if (id < MOD_MOUNT_STABLE_BASE) return null;
  return (MOUNT_DATA as Record<string, import('../entities/Mounts').MountData>)[String(id)] ?? null;
}

