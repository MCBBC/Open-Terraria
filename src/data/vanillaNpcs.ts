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
export const vanillaItemKey = (() => {
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

/** npc id → 本仓库可用的掉落表（{item: key, chance, min, max}[]；未注册物品过滤）。
 *  按 id 缓存(2026-08 审计 #9):此前每只怪新建数组+对象——掉落表只读,
 *  共享实例即可(蠕虫 30 段 = 30 份克隆纯属浪费) */
const _dropsCache = new Map<number, Array<{ item: string; min: number; max: number; chance: number }>>();
export function vanillaNpcDrops(id: number): Array<{ item: string; min: number; max: number; chance: number }> {
  const hit = _dropsCache.get(id);
  if (hit) return hit;
  const raw = VANILLA_NPC_LOOT[String(id)];
  const out: Array<{ item: string; min: number; max: number; chance: number }> = [];
  if (raw) {
    for (const d of raw) {
      const key = vanillaItemKey(d.item);
      if (key) out.push({ item: key, min: d.min, max: d.max, chance: d.chance });
    }
  }
  _dropsCache.set(id, out);
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
  /** SetDefaults alpha：每类型静态不透明度基线（渲染 1-alpha/255，NPC.Opacity；无通用渐隐） */
  alpha?: number;
  /** SetDefaults color：非 default 时 Main.DrawNPC 二次绘制同贴图（GetColor 逐像素乘法贴轮廓） */
  color?: number[];  // [r, g, b, a]
  critter?: boolean;  // NPCID.Sets.CountsAsCritter 小动物（tools/extract-critters.mjs 提取）
}

export const VANILLA_NPCS = vanillaNpcsJson as unknown as Record<string, VanillaNpc>;

export function vanillaNpc(id: number): VanillaNpc | null {
  return VANILLA_NPCS[String(id)] ?? null;
}

// ================= 城镇 NPC（TownNPC 实体用） =================
// key → 原版 NPCID（Terarria1456/Terraria.ID/NPCID.cs:11099+）；
// extra = NPCID.Sets.ExtraFramesCount（NPCID.cs:4831）——
// 行走帧循环区间的回卷上界：帧 >= frames-extra 时回帧 2（NPC.cs FindFrame L70244）
export const TOWN_NPC_IDS: Record<string, { id: number; extra: number }> = {
  guide: { id: 22, extra: 10 },
  merchant: { id: 17, extra: 9 },
  nurse: { id: 18, extra: 9 },
  arms_dealer: { id: 19, extra: 9 },
  dryad: { id: 20, extra: 7 },
  demolitionist: { id: 38, extra: 9 },
  clothier: { id: 54, extra: 7 },
  goblin_tinkerer: { id: 107, extra: 9 },
  wizard: { id: 108, extra: 7 },
  mechanic: { id: 124, extra: 9 },
  santa_claus: { id: 142, extra: 9 },
  truffle: { id: 160, extra: 7 },
  steampunker: { id: 178, extra: 9 },
  dyer: { id: 207, extra: 9 },
  party_girl: { id: 208, extra: 9 },
  cyborg: { id: 209, extra: 10 },
  painter: { id: 227, extra: 9 },
  witch_doctor: { id: 228, extra: 10 },
  pirate: { id: 229, extra: 10 },
  stylist: { id: 353, extra: 9 },
  tax_collector: { id: 441, extra: 9 },
  golfer: { id: 588, extra: 9 },
  zoologist: { id: 633, extra: 9 },   // BestiaryGirl
  princess: { id: 663, extra: 7 },
};

const TOWN_EXTRA_BY_ID = new Map(Object.values(TOWN_NPC_IDS).map((t) => [t.id, t.extra]));

/** npc id → ExtraFramesCount（TOWN_NPC_IDS 反查；未登记的默认 2） */
export function townExtraFrames(id: number): number {
  return TOWN_EXTRA_BY_ID.get(id) ?? 2;
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
  // 肉前地表白天：蓝/母史莱姆（绿史莱姆走 legacy 50% 路径出）
  daySurface: [1, 16].filter((n) => n > 0),
  // 肉前夜晚地表：僵尸/恶魔眼（噬魂怪只在腐化群系池出）
  nightSurface: [3, 2].filter((n) => n > 0),
  // 肉前洞穴：蝙蝠/骷髅/巨蠕虫/黑暗法师/爬墙蜘蛛——巨蝠93/孢子僵尸254/褴褛法师281 是困难模式，已移除
  underground: [49, 21, 10, 32, 159].filter((n) => n > 0),
  // 地狱：恶魔(62)/巫毒恶魔(66)/火妖(24)；蟹 67 已移到海洋
  hell: [62, 66, 24].filter((n) => n > 0),
  // ---- 群系池（对照原版 SpawnNPC zone 规则的肉前常用怪，AI 家族均已移植） ----
  corruption: [6, 7].filter((n) => n > 0),                                  // 噬魂怪(蜂群5)/吞噬怪(蠕虫6)
  crimson: [173, 223].filter((n) => n > 0),                                // 血蝙蝠(蜂群5)/血腥怪(战士3)
  jungle: [51, 158].filter((n) => n > 0),                                  // 丛林蝙蝠(14)/巨蝠(14)
  snow: [147, 152].filter((n) => n > 0),                                   // 冰史莱姆(1)
  desert: [73, 335].filter((n) => n > 0),                                  // 蚁狮(战士3)/沙史莱姆(1)
  // 水域（仅地表湖泊/海洋；地底水不出怪）：水母/食人鱼/琵琶鱼；海洋追加鲨鱼/蟹
  water: [63, 64, 58, 102, 221].filter((n) => n > 0),
  ocean: [65, 67, 63, 64].filter((n) => n > 0),                            // 鲨鱼(16)/蟹(3)
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
