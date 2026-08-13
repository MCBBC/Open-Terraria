// 小动物（无害生物）定义：原版 NPC 贴图表驱动
// kind: hop=跳跃移动 / walk=爬行 / fly=飞行；素材为纵向帧条
export type CritterKind = 'hop' | 'walk' | 'fly';

export interface CritterDef {
  key: string;
  name: string;
  npc: number;            // NPC_N 贴图表 id
  kind: CritterKind;
  w: number; h: number;   // 碰撞盒 px
  speed: number;          // 移动速度
  fleeRange: number;      // 逃离玩家的距离（px）
  weight: number;         // 生成权重
  dayOnly?: boolean;
  nightOnly?: boolean;
  gold?: boolean;         // 金色变种（稀有）
  water?: boolean;        // 可游泳（鸭子）
  glow?: boolean;         // 自发光（萤火虫）
  avoidWater?: boolean;   // 飞行避水（鸭子/鸟：巡航中不扎进水里）
  perch?: boolean;        // 飞行种会落地栖息（鸟）
  oceanOnly?: boolean;   // 海洋专属（螃蟹/海鸥：仅地图边缘海洋带，不进沙漠）
  fleeFly?: boolean;      // 地面种受惊会起飞逃离（鸭子）
  /** 状态动画分段 [起始帧, 帧数]（缺省=全表循环） */
  anim?: { idle?: [number, number]; swim?: [number, number]; walk?: [number, number]; fly?: [number, number] };
  biomes: Array<'forest' | 'snow' | 'sand' | 'water'>; // 栖息生态（控制生成地点）
}

export const CRITTER_DEFS: CritterDef[] = [
  { key: 'bunny', name: '兔兔', npc: 46, kind: 'hop', w: 24, h: 20, speed: 1.4, fleeRange: 112, weight: 10, dayOnly: true, biomes: ['forest'] },
  { key: 'bird', name: '小鸟', npc: 74, kind: 'fly', w: 18, h: 12, speed: 1.6, fleeRange: 144, weight: 10, dayOnly: true, perch: true, avoidWater: true, biomes: ['forest', 'snow', 'sand'] },
  { key: 'squirrel', name: '松鼠', npc: 299, kind: 'hop', w: 18, h: 16, speed: 1.5, fleeRange: 112, weight: 8, dayOnly: true, biomes: ['forest'] },
  { key: 'mouse', name: '老鼠', npc: 300, kind: 'walk', w: 12, h: 9, speed: 0.8, fleeRange: 96, weight: 7, biomes: ['forest', 'sand'] },
  { key: 'firefly', name: '萤火虫', npc: 355, kind: 'fly', w: 7, h: 6, speed: 0.7, fleeRange: 64, weight: 8, nightOnly: true, glow: true, biomes: ['forest', 'sand', 'snow'] },
  { key: 'butterfly', name: '蝴蝶', npc: 356, kind: 'fly', w: 12, h: 11, speed: 1.0, fleeRange: 80, weight: 8, dayOnly: true, biomes: ['forest'] },
  { key: 'snail', name: '蜗牛', npc: 359, kind: 'walk', w: 14, h: 10, speed: 0.25, fleeRange: 0, weight: 4, biomes: ['forest'] },
  { key: 'frog', name: '青蛙', npc: 361, kind: 'hop', w: 15, h: 12, speed: 1.6, fleeRange: 96, weight: 6, biomes: ['water', 'forest'] },
  { key: 'duck', name: '鸭子', npc: 362, kind: 'hop', w: 20, h: 17, speed: 1.2, fleeRange: 112, weight: 5, water: true, fleeFly: true, avoidWater: true, biomes: ['water'],
    // NPC_362 分段：0 站立 / 1-2 游水 / 3-10 走路 / 11-14 飞行
    anim: { idle: [0, 1], swim: [1, 2], walk: [3, 8], fly: [11, 4] } },
  { key: 'grasshopper', name: '蚱蜢', npc: 377, kind: 'hop', w: 12, h: 8, speed: 2.2, fleeRange: 80, weight: 6, dayOnly: true, biomes: ['forest', 'sand'] },
  // 海滩生态（原版 Crab 67 / Seagull 602：海边沙地专属）
  { key: 'crab', name: '螃蟹', npc: 67, kind: 'walk', w: 20, h: 14, speed: 0.6, fleeRange: 80, weight: 9, avoidWater: true, oceanOnly: true, biomes: ['sand'] },
  { key: 'seagull', name: '海鸥', npc: 602, kind: 'fly', w: 22, h: 16, speed: 1.8, fleeRange: 144, weight: 8, dayOnly: true, perch: true, avoidWater: true, oceanOnly: true, biomes: ['sand'] },
  // 神秘青蛙（NPC.cs:17575-17587：w18 h20 aiStyle7 lifeMax5 自发光 :55975；仅经 SpawnFrog
  // 1/30 未解锁门出现，网捕必传送逃走、净化粉变 683 神秘史莱姆——weight 0 不入常规池）
  { key: 'mystic_frog', name: '神秘青蛙', npc: 687, kind: 'hop', w: 18, h: 20, speed: 1.6, fleeRange: 96, weight: 0, glow: true, biomes: ['water', 'forest'] },
  // 金色变种（稀有，生态同本体）
  { key: 'gold_bird', name: '金鸟', npc: 442, kind: 'fly', w: 18, h: 12, speed: 1.8, fleeRange: 144, weight: 1, dayOnly: true, gold: true, perch: true, avoidWater: true, biomes: ['forest', 'snow', 'sand'] },
  { key: 'gold_bunny', name: '金兔', npc: 443, kind: 'hop', w: 18, h: 16, speed: 1.6, fleeRange: 112, weight: 1, dayOnly: true, gold: true, biomes: ['forest'] },
  { key: 'gold_butterfly', name: '金蝴蝶', npc: 444, kind: 'fly', w: 12, h: 11, speed: 1.1, fleeRange: 80, weight: 1, dayOnly: true, gold: true, biomes: ['forest'] },
  { key: 'gold_frog', name: '金蛙', npc: 445, kind: 'hop', w: 15, h: 12, speed: 1.8, fleeRange: 96, weight: 1, gold: true, biomes: ['water', 'forest'] },
  { key: 'gold_grasshopper', name: '金蚱蜢', npc: 446, kind: 'hop', w: 12, h: 8, speed: 2.4, fleeRange: 80, weight: 1, dayOnly: true, gold: true, biomes: ['forest', 'sand'] },
  { key: 'gold_mouse', name: '金鼠', npc: 447, kind: 'walk', w: 12, h: 9, speed: 1.0, fleeRange: 96, weight: 1, gold: true, biomes: ['forest', 'sand'] },
];

export const CRITTER_BY_KEY: Record<string, CritterDef> = {};
for (const c of CRITTER_DEFS) CRITTER_BY_KEY[c.key] = c;

/** NPC cs → 捕获物品 id（NPC.cs SetDefaults catchItem 赋值段：9268/9692/12806/
 *  12819/13461/13475/13517/13543/13555/13754/14190-14261/16681）。螃蟹 67 原版
 *  无 catchItem = 不可捕（net 对其无效）。 */
export const CRITTER_CATCH_BY_NPC: Record<number, number> = {
  46: 2019,   // 兔兔
  74: 2015,   // 小鸟
  299: 2018,  // 松鼠
  300: 2003,  // 老鼠
  355: 1992,  // 萤火虫（bait 20）
  356: 1994,  // 蝴蝶（bait 5）
  359: 2006,  // 蜗牛（bait 10）
  361: 2121,  // 青蛙
  362: 2122,  // 野鸭
  377: 2740,  // 蚱蜢（bait 10）
  602: 4359,  // 海鸥
  442: 2889, 443: 2890, 444: 2891, 445: 2892, 446: 2893, 447: 2894,  // 金系六件
};
/** 捕获物品 → 释放的 NPC cs（Item.DefaultToCapturedCritter makeNPC，:47613-47626） */
export const CRITTER_RELEASE_BY_ITEM: Record<number, number> = {};
for (const [npcId, itemId] of Object.entries(CRITTER_CATCH_BY_NPC)) {
  CRITTER_RELEASE_BY_ITEM[itemId] = Number(npcId);
}
/** NPC cs → 小动物 key（释放时反查；687 神秘青蛙不在小动物表——释放门走物品表查不到） */
export const CRITTER_KEY_BY_NPC: Record<number, string> = {};
for (const c of CRITTER_DEFS) CRITTER_KEY_BY_NPC[c.npc] = c.key;
