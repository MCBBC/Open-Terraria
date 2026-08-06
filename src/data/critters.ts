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
  perch?: boolean;        // 飞行种会落地栖息（鸟）
  biomes: Array<'forest' | 'snow' | 'sand' | 'water'>; // 栖息生态（控制生成地点）
}

export const CRITTER_DEFS: CritterDef[] = [
  { key: 'bunny', name: '兔兔', npc: 46, kind: 'hop', w: 24, h: 20, speed: 1.4, fleeRange: 112, weight: 10, dayOnly: true, biomes: ['forest'] },
  { key: 'bird', name: '小鸟', npc: 74, kind: 'fly', w: 18, h: 12, speed: 1.6, fleeRange: 144, weight: 10, dayOnly: true, perch: true, biomes: ['forest', 'snow', 'sand'] },
  { key: 'squirrel', name: '松鼠', npc: 299, kind: 'hop', w: 18, h: 16, speed: 1.5, fleeRange: 112, weight: 8, dayOnly: true, biomes: ['forest'] },
  { key: 'mouse', name: '老鼠', npc: 300, kind: 'walk', w: 12, h: 9, speed: 0.8, fleeRange: 96, weight: 7, biomes: ['forest', 'sand'] },
  { key: 'firefly', name: '萤火虫', npc: 355, kind: 'fly', w: 7, h: 6, speed: 0.7, fleeRange: 64, weight: 8, nightOnly: true, glow: true, biomes: ['forest', 'sand', 'snow'] },
  { key: 'butterfly', name: '蝴蝶', npc: 356, kind: 'fly', w: 12, h: 11, speed: 1.0, fleeRange: 80, weight: 8, dayOnly: true, biomes: ['forest'] },
  { key: 'snail', name: '蜗牛', npc: 359, kind: 'walk', w: 14, h: 10, speed: 0.25, fleeRange: 0, weight: 4, biomes: ['forest'] },
  { key: 'frog', name: '青蛙', npc: 361, kind: 'hop', w: 15, h: 12, speed: 1.6, fleeRange: 96, weight: 6, biomes: ['water', 'forest'] },
  { key: 'duck', name: '鸭子', npc: 362, kind: 'hop', w: 28, h: 24, speed: 1.2, fleeRange: 112, weight: 5, water: true, biomes: ['water'] },
  { key: 'grasshopper', name: '蚱蜢', npc: 377, kind: 'hop', w: 12, h: 8, speed: 2.2, fleeRange: 80, weight: 6, dayOnly: true, biomes: ['forest', 'sand'] },
  // 金色变种（稀有，生态同本体）
  { key: 'gold_bird', name: '金鸟', npc: 442, kind: 'fly', w: 18, h: 12, speed: 1.8, fleeRange: 144, weight: 1, dayOnly: true, gold: true, perch: true, biomes: ['forest', 'snow', 'sand'] },
  { key: 'gold_bunny', name: '金兔', npc: 443, kind: 'hop', w: 18, h: 16, speed: 1.6, fleeRange: 112, weight: 1, dayOnly: true, gold: true, biomes: ['forest'] },
  { key: 'gold_butterfly', name: '金蝴蝶', npc: 444, kind: 'fly', w: 12, h: 11, speed: 1.1, fleeRange: 80, weight: 1, dayOnly: true, gold: true, biomes: ['forest'] },
  { key: 'gold_frog', name: '金蛙', npc: 445, kind: 'hop', w: 15, h: 12, speed: 1.8, fleeRange: 96, weight: 1, gold: true, biomes: ['water', 'forest'] },
  { key: 'gold_grasshopper', name: '金蚱蜢', npc: 446, kind: 'hop', w: 12, h: 8, speed: 2.4, fleeRange: 80, weight: 1, dayOnly: true, gold: true, biomes: ['forest', 'sand'] },
  { key: 'gold_mouse', name: '金鼠', npc: 447, kind: 'walk', w: 12, h: 9, speed: 1.0, fleeRange: 96, weight: 1, gold: true, biomes: ['forest', 'sand'] },
];

export const CRITTER_BY_KEY: Record<string, CritterDef> = {};
for (const c of CRITTER_DEFS) CRITTER_BY_KEY[c.key] = c;
