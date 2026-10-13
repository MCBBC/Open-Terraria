// mod gore 运行时(★刀3-3,2026-10-13;工坊普查五刀战役,锚点见
// docs/mod-five-knives-recon-2026-10-13.md 刀3 节)。
// 形态:content/gores/*.json {key,texture} → gore id 697+ 段(原版 max 696;
// vanilla-gore.json _meta 为证)+ NPC spec.deathGore[] 声明死亡碎块 → 本表
// (注册期解析为 GoreSpawnEntry 原版形)→ GorePiece.deathGoreFor 回退。
// 贴图=vanilla/Gore_<id>.png alias(assets 两支同接);尺寸=PNG IHDR 头同步解析
// (register 期零解码),GorePiece 构造器查本表缺省表。
import type { GoreSpawnEntry } from '../entities/GorePiece';
import { MOD_GORE_ID_BASE, MOD_NPC_ID_BASE } from './types';   // ★红队 R3-m4:段常量收编(禁硬编码)

export interface ModGoreContent {
  key: string;
  texture: string;
}

/** npcId → 已解析死亡碎块表(原版形 GoreSpawnEntry) */
const modDeathGore = new Map<number, GoreSpawnEntry[]>();
/** gore 全键 → id(697+ 段) */
const idByFullKey = new Map<string, number>();
/** gore id → PNG 尺寸(IHDR 头解析;GorePiece 构造器碰撞盒用) */
const texSizeById = new Map<number, { w: number; h: number }>();

export function registerModGoreId(id: number, fullKey: string): void {
  if (!(id >= MOD_GORE_ID_BASE)) throw new Error(`[mod-gore] gore id 须 ≥${MOD_GORE_ID_BASE}: ${id}(${fullKey})`);
  if (idByFullKey.has(fullKey)) throw new Error(`[mod-gore] 重复注册: ${fullKey}`);
  idByFullKey.set(fullKey, id);
}

export function modGoreIdOf(fullKey: string): number | undefined {
  return idByFullKey.get(fullKey);
}

export function registerModGoreTexSize(id: number, w: number, h: number): void {
  texSizeById.set(id, { w, h });
}

export function modGoreTexSizeOf(id: number): { w: number; h: number } | null {
  return texSizeById.get(id) ?? null;
}

export function registerModNpcDeathGore(npcId: number, entries: GoreSpawnEntry[]): void {
  if (!(npcId >= MOD_NPC_ID_BASE)) throw new Error(`[mod-gore] npcId 须 ≥${MOD_NPC_ID_BASE}: ${npcId}`);
  if (modDeathGore.has(npcId)) throw new Error(`[mod-gore] npc 死亡碎块重复注册: ${npcId}`);
  modDeathGore.set(npcId, entries);
}

export function modDeathGoreOf(npcId: number): GoreSpawnEntry[] | null {
  return modDeathGore.get(npcId) ?? null;
}

export function _resetModGoreForTests(): void {
  modDeathGore.clear();
  idByFullKey.clear();
  texSizeById.clear();
}
