// 翅膀飞行属性（tools/extract-equip-prefix.mjs 从 WingStatsInitializer.cs 提取）。
// time = 飞行时长（tick）；speed = 飞行速度（px/tick，ArmorIDs.Wing.Sets.Stats）。
import wingStatsJson from './vanilla-wingstats.json';

export interface WingStat { time: number; speed: number }

const WS = wingStatsJson as Record<string, WingStat>;

export function wingStatOf(slot: number): WingStat | null {
  return WS[String(slot)] ?? null;
}
