// 原版 1.4.0.5 全量 NPC 数据（tools/extract-npcs.mjs 从 Terarria1405/NPC.cs SetDefaults 提取）。
// aiStyle 与 AI_XXX 方法的对应见 NPC.cs AI() 分发；此处先覆盖高频家族，
// 未移植 AI 家族的 aiStyle 回退到最接近的已移植行为（注释标注）。
import vanillaNpcsJson from '../../public/sprites/vanilla-npcs.json';

export interface VanillaNpc {
  id: number;
  name: string;
  frames: number;
  lifeMax: number;
  damage: number;
  defense: number;
  knockBackResist: number;
  aiStyle: number;
  width: number;
  height: number;
  npcSlots: number;
  noGravity: boolean;
  noTileCollide: boolean;
  friendly: boolean;
  townNPC: boolean;
  HitSound: string;   // SoundID 名（NPCHitN / NPCDeathN）
  DeathSound: string;
  scale: number;
  alpha?: number;     // 出生透明度（史莱姆 120-175 半透明）
}

export const VANILLA_NPCS = vanillaNpcsJson as unknown as Record<string, VanillaNpc>;

export function vanillaNpc(id: number): VanillaNpc | null {
  return VANILLA_NPCS[String(id)] ?? null;
}

/** SoundID 名 → public/sounds 文件名（NPCHit37 → NPC_Hit_37；NPCDeath40 → NPC_Killed_40） */
export function vanillaSoundName(soundIdName: string | undefined): string | null {
  if (!soundIdName) return null;
  const m = soundIdName.match(/^(?:NPCHit|NPCKilled|NPCDeath)(\d+)$/);
  if (!m) return null;
  return soundIdName.startsWith('NPCHit') ? `NPC_Hit_${m[1]}` : `NPC_Killed_${m[1]}`;
}

// ================= 生成池（原版生成规则的分期近似，task #13 细化） =================
// 按环境分组：白天地表 / 夜间地表 / 洞穴 / 地狱；肉前常用怪优先
export const VANILLA_SPAWN_POOLS = {
  daySurface: [1, 16, 138, 141, 184, 335, -1].filter((n) => n > 0),        // 蓝/母史莱姆、蟹、史莱姆变体
  nightSurface: [3, 2, 6, 132, 185, 396].filter((n) => n > 0),             // 僵尸/恶魔眼/呕心僵尸等
  underground: [49, 21, 33, 93, 192, 254, 281, 10, 32].filter((n) => n > 0), // .../巨蠕虫(10)/黑暗法师(32)
  hell: [66, 67, 68, 121, 24].filter((n) => n > 0),                        // 恶魔/巫毒恶魔/火妖(24)
};

/** 探针调试用：非空时 poolFor 恒返回此池（确定性验证生成路径） */
export let debugPoolOverride: number[] | null = null;
export function setDebugPool(pool: number[] | null) { debugPoolOverride = pool; }

/** 按玩家环境取生成池 id 列表 */
export function poolFor(groundLevel: number, lavaLine: number, ty: number, isDay: boolean): number[] {
  if (debugPoolOverride) return debugPoolOverride;
  if (ty > lavaLine) return VANILLA_SPAWN_POOLS.hell;
  if (ty > groundLevel + 15) return VANILLA_SPAWN_POOLS.underground;
  return isDay ? VANILLA_SPAWN_POOLS.daySurface : VANILLA_SPAWN_POOLS.nightSurface;
}
