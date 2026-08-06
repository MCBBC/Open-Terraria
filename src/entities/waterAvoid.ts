// 飞行避水通用行为：前方探测液体 → 上抛反弹/爬升。
// 任何飞行实体（怪物/小动物）按需套用：def.avoidWater = true。
import { TILE } from '../core/constants';
import type { World } from '../world/World';

export interface AvoidBody {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
}

/**
 * @param flipX true=水平反弹（蝙蝠式弹开），false=保持航向只爬升（鸭子式拉起）
 * @returns 是否发生了避让（调用方通常本帧不再移动）
 */
export function avoidWater(b: AvoidBody, world: World, flipX = true): boolean {
  const ax = Math.floor((b.x + b.w / 2 + b.vx * 4) / TILE);
  const ay = Math.floor((b.y + b.h / 2 + b.vy * 4) / TILE);
  if (!world.store.inBounds(ax, ay)) return false;
  if (world.store.liquid[world.store.idx(ax, ay)] <= 40) return false;
  // 前方是液体：上抛脱离
  b.vy = -Math.abs(b.vy || 1) * 0.8 - 0.8;
  if (flipX) b.vx = -b.vx * 0.5;
  else b.vx *= 0.7; // 保留航向，只爬升越过水面
  return true;
}
