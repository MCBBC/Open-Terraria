// 原版 1.4.0.5 全量 NPC 数据（tools/extract-npcs.mjs 从 Terarria1405/NPC.cs SetDefaults 提取）。
// aiStyle 与 AI_XXX 方法的对应见 NPC.cs AI() 分发；此处先覆盖高频家族，
// 未移植 AI 家族的 aiStyle 回退到最接近的已移植行为（注释标注）。
import vanillaNpcsJson from '../../public/sprites/vanilla-npcs.json';
import vanillaLootJson from '../../public/sprites/vanilla-npcloot.json';
import vanillaDataJson from '../../public/sprites/vanilla.json';
import { ITEM_BY_KEY } from './items';
import { TILE_DEFS } from './tiles';

/** tile id → key 反查（biomeAt 群系判定用） */
const TILE_KEY_NAME: string[] = TILE_DEFS.map((d) => d.key);

/** 全怪掉落表（tools/extract-npcloot.mjs 提取：ItemDropDatabase + NPCLootOld 双源） */
export const VANILLA_NPC_LOOT = vanillaLootJson as unknown as Record<string, Array<{ item: number; chance: number; min: number; max: number }>>;

/** 原版物品 id → 本仓库 item key（vanilla.json 的 key 是 PascalCase，ITEM_BY_KEY 多为 snake_case；
 *  未注册的返回 null 跳过） */
const vanillaItemKey = (() => {
  const map = new Map<number, string | null>();
  const items = (vanillaDataJson as unknown as { items: Record<string, { key?: string }> }).items ?? {};
  return (itemId: number): string | null => {
    if (map.has(itemId)) return map.get(itemId)!;
    const meta = items[String(itemId)];
    let key: string | null = null;
    if (meta?.key) {
      const snake = meta.key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      if (ITEM_BY_KEY[snake] != null) key = snake;
      else if (ITEM_BY_KEY[meta.key] != null) key = meta.key;
    }
    map.set(itemId, key);
    return key;
  };
})();

/** npc id → 本仓库可用的掉落表（{item: key, chance, min, max}[]；未注册物品过滤） */
export function vanillaNpcDrops(id: number): Array<{ item: string; min: number; max: number; chance: number }> {
  const raw = VANILLA_NPC_LOOT[String(id)];
  if (!raw) return [];
  const out: Array<{ item: string; min: number; max: number; chance: number }> = [];
  for (const d of raw) {
    const key = vanillaItemKey(d.item);
    if (key) out.push({ item: key, min: d.min, max: d.max, chance: d.chance });
  }
  return out;
}

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
  critter?: boolean;  // NPCID.Sets.CountsAsCritter 小动物（tools/extract-critters.mjs 提取）
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
  nightSurface: [3, 2, 6, 132, 185].filter((n) => n > 0),                  // 僵尸/恶魔眼/噬魂怪（396 月亮领主手已移除）
  underground: [49, 21, 93, 192, 254, 281, 10, 32].filter((n) => n > 0),   // 蝙蝠/骷髅/巨蝠/噬魂眼/孢子僵尸/褴褛法师/巨蠕虫/黑暗法师（33 法师弹幕怪已移除）
  hell: [66, 67, 121, 24].filter((n) => n > 0),                           // 巫毒恶魔/蟹/史莱姆飞行员/火妖（68 地牢守卫 Boss 已移除）
  // ---- 群系池（对照原版 SpawnNPC zone 规则的肉前常用怪，AI 家族均已移植） ----
  corruption: [6, 7, 32].filter((n) => n > 0),                             // 噬魂怪(蜂群5)/吞噬怪(蠕虫6)/噬魂怪变体
  crimson: [173, 223, 224].filter((n) => n > 0),                           // 血蝙蝠(蜂群5)/血腥怪(战士3)/爬行者
  jungle: [51, 158, 258].filter((n) => n > 0),                             // 丛林蝙蝠(14)/巨蝠(14)/丛林史莱姆(1)
  snow: [147, 152, 184, 185].filter((n) => n > 0),                         // 冰史莱姆(1)/冰雪史莱姆/尖刺冰史莱姆/雪绒狐(3)
  desert: [61, 73, 335].filter((n) => n > 0),                              // 秃鹫(鸟17近似)/蚁狮(战士3)/沙史莱姆(1)
  water: [63, 64, 65, 58, 67, 102, 221].filter((n) => n > 0),              // 蓝/粉水母(18)/鲨鱼(16)/食人鱼(16)/蟹(3)/琵琶鱼(16)/鱿鱼(18)
  // ---- 小动物（CountsAsCritter，白天地表） ----
  critters: [46, 303, 74, 299, 300, 377, 357, 356].filter((n) => n > 0),   // 兔/鸟/松鼠/鼠/蚱蜢/蚯蚓/萤火虫变体
};

/** 探针调试用：非空时 poolFor 恒返回此池（确定性验证生成路径） */
export let debugPoolOverride: number[] | null = null;
export function setDebugPool(pool: number[] | null) { debugPoolOverride = pool; }

/** 按玩家环境取生成池 id 列表。biome：spawn 点地面 tile 判定的群系（Game 传入） */
export function poolFor(groundLevel: number, lavaLine: number, ty: number, isDay: boolean, biome?: string): number[] {
  if (debugPoolOverride) return debugPoolOverride;
  if (ty > lavaLine) return VANILLA_SPAWN_POOLS.hell;
  if (ty > groundLevel + 15) return VANILLA_SPAWN_POOLS.underground;
  if (biome && VANILLA_SPAWN_POOLS[biome as keyof typeof VANILLA_SPAWN_POOLS]) {
    return VANILLA_SPAWN_POOLS[biome as keyof typeof VANILLA_SPAWN_POOLS] as number[];
  }
  return isDay ? VANILLA_SPAWN_POOLS.daySurface : VANILLA_SPAWN_POOLS.nightSurface;
}

/** 按生成点地面 tile 判群系（原版 zone 判定的 tile 采样近似） */
export function biomeAt(st: { type: Uint16Array; idx(x: number, y: number): number; w: number; h: number }, tx: number, ty: number): string | null {
  // 从 ty 向下找第一个实心格
  for (let y = Math.max(2, ty); y < Math.min(st.h - 2, ty + 60); y++) {
    const t = st.type[st.idx(tx, y)];
    if (t === 0) continue;
    const key = TILE_KEY_NAME[t];
    if (!key) return null;
    if (key.includes('corrupt') || key === 'ebonstone_block' || key.includes('ebonsand')) return 'corruption';
    if (key.includes('crimson') || key.includes('crimsand') || key === 'crimstone') return 'crimson';
    if (key === 'mud') return 'jungle';
    if (key === 'ice' || key === 'snow') return 'snow';
    if (key === 'sand' || key === 'sandstone' || key === 'hardened_sand') return 'desert';
    return null;
  }
  return null;
}
