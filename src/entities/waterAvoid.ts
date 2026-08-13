// 飞行避水通用行为：前方探测液体 → 上抛反弹/爬升。
// 任何飞行实体（怪物/小动物）按需套用：def.avoidWater = true。
//
// ★自创模块登记（水体交互批留存结论）：原版 Terraria 无此行为——飞行敌怪不避水
// （恶魔眼/蝙蝠照常扎进水里，靠 npcLiquid 的 wet 减速+溅落表现）。消费者盘点：
//  ① Critter.ts flyMove（生产路径）：自研 Critter 桶（Game.spawnCritter 兜底，
//     bird 74/gold_bird 442/seagull 602 飞 + duck 362 起飞段 flipX=false 保航向爬升）。
//     与原版的差异：原版鸟（aiStyle 24）靠"前方 15 格下探把液体计为障碍"的
//     obstruction 探测自然避水（Enemy.birdAI 已 1:1 接液体项），海鸥/鷿鷈飞行形
//     （aiStyle 68）更是反向"钉水面浮游"（Enemy.duckFlyAI 已 1:1）——本模块是对
//     自研桶巡航 AI（无下探探测）的补丁，桶退役时应一并删除。
//  ② Enemy.ts flyAI（仅遗留本地键 demon_eye/cave_bat/servant_of_cthulhu——生产
//     刷怪已全走 fromVanilla，此键无生成源；vanilla 对应 aiStyle 2/14 无避水）。
//     偏差登记：同上，原版不避水。该路径退役时此消费者应删。
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
