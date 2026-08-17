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

/** NPC cs → 捕获物品 id（NPC.cs SetDefaults :8361+ catchItem 赋值段**全量 98 种**：
 *  标量 + 公式族展开（蝎 2156+t-366 / 魔夜爬虫 3191+t-484 / 蜻蜓 4334+t-595 /
 *  瓢虫 4361+t-604 / 水黾 4418+t-612 / 龟 4464+t-616 / 宝石松鼠 4831+t-639 /
 *  宝石兔 4838+t-646）+ 内层覆写（鸟 74/297/298 三值各异、海马 626/627 分
 *  4480/4482、仙灵三色 4068/4069/4070 各自独立、鸭走/飞形 2122/2123）。
 *  螃蟹 67/海豚 615/海龟 625/鸭飞形(363 外的)603=4359 同走形——原版无
 *  catchItem 的 = 不可捕（net 挥空）。
 *  ★687 神秘青蛙：catchItem=2121 在案，但 ItemCheck_CatchCritters 特判
 *  网捕=传送逃走（Game.netCatchCritter 687 分支先于本表）——表项仅供释放侧
 *  （物品 2121 对着非实心格使用 → 放出真 NPC，ReleaseNPC 同链）。 */
export const CRITTER_CATCH_BY_NPC: Record<number, number> = {
  46: 2019, 303: 2019, 337: 2019, 540: 2019,   // 兔族四变体（节日黑猫 303/圣诞 337/派对 540 同兔物品）
  55: 261, 230: 261, 592: 4274, 593: 4274,     // 金鱼泳形/岸形 → 材料 261；金金鱼双态
  74: 2015, 297: 2016, 298: 2017,              // 小鸟/蓝松鸦/红雀（:9690-9699 内层三分）
  148: 2205, 149: 2205,                        // 企鹅双态（同 2205，:10803/:10815）
  299: 2018, 538: 3563, 539: 3564,             // 松鼠/红松鼠/金松鼠
  300: 2003, 610: 4375,                        // 老鼠/大鼠
  355: 1992, 358: 2004, 654: 4847, 677: 5350,  // 萤火虫/闪电虫/熔岩蝇/仙灵蛾（64 族）
  356: 1994, 444: 2891, 653: 4845, 661: 4961,  // 蝴蝶/金蝴蝶/地狱蝴蝶/彩光蜻蛉（65 族）
  357: 2002, 448: 2895, 606: 4363,             // 蚯蚓/金蚯蚓/蛆（66 族单值）
  484: 3191, 485: 3192, 486: 3193, 487: 3194,  // 魔夜爬虫/Grubby/Sluggy/Buggy（:14519 公式 3191+t-484）
  359: 2006, 360: 2007, 655: 4849,             // 蜗牛/发光蜗牛/熔岩蜗牛（67 族）
  361: 2121, 445: 2892, 687: 2121,             // 青蛙/金蛙/神秘青蛙（687 网捕走传送分支，此条仅供释放）
  362: 2122, 363: 2122, 364: 2123, 365: 2123,  // 鸭走形/飞形（363/365 飞形，:13555-13591）
  366: 2156, 367: 2157,                        // 蝎（:13603 公式 2156+t-366）
  374: 2673, 375: 2673,                        // 松露虫潜形/逃形 → 鱼饵 2673
  377: 2740, 446: 2893,                        // 蚱蜢/金蚱蜢
  442: 2889, 443: 2890, 447: 2894,             // 金鸟/金兔/金鼠
  583: 4068, 584: 4069, 585: 4070,             // 三色仙灵**三个不同物品**（:16527-16533 switch）
  595: 4334, 596: 4335, 597: 4336, 598: 4337, 599: 4338, 600: 4339, 601: 4340,  // 蜻蜓七变体（:16664 公式 t-595+4334）
  602: 4359, 603: 4359,                        // 海鸥走/飞形
  604: 4361, 605: 4362,                        // 瓢虫/金瓢虫（:16711 公式 t-604+4361）
  607: 4373, 608: 4374, 609: 4374,             // 鳉鱼/䴙䴘走/飞形
  611: 4395,                                   // 猫头鹰
  612: 4418, 613: 4419,                        // 水黾/金水黾（:16809 公式 t-612+4418）
  614: 1338,                                   // 爆炸兔（兔炮弹药；手持使用=放出，同 ReleaseNPC）
  616: 4464, 617: 4465,                        // 龟/丛林龟（:16850 公式 t-616+4464；625 海龟无 catchItem）
  626: 4480, 627: 4482,                        // 海马/金海马（:17001-17004 内层覆写）
  639: 4831, 640: 4832, 641: 4833, 642: 4834, 643: 4835, 644: 4836, 645: 4837,  // 宝石松鼠七色（:17171 公式 4831+t-639）
  646: 4838, 647: 4839, 648: 4840, 649: 4841, 650: 4842, 651: 4843, 652: 4844,  // 宝石兔七色（:17183 公式 4838+t-646）
  669: 5132,                                   // 椿象
  671: 5212, 672: 5300, 673: 5311,             // 猩红鹦鹉/蓝鹦鹉/巨嘴鸟
  674: 5312, 675: 5313,                        // 黄/灰玄凤
  688: 5511,                                   // 河鲀
};
/** 捕获物品 → 释放的 NPC cs（Item.cs DefaultToCapturedCritter makeNPC **物品侧
 *  真值 93 条**，公式族展开：金系 2889+t→442+t / 蜻蜓 4334+t→595+t / 宝石松鼠
 *  4831+t→639+t / 宝石兔 4838+t→646+t）。⚠不能由捕获表逆推——共享物品族原版
 *  一律释放**基础/走形**：261→55(非岸形 230)/2019→46(非节日变体 303/337/540)/
 *  2121→361(非神秘蛙 687——其 catchItem 是死数据,网捕走传送特例)/2122→362/
 *  2123→364(飞形 363/365 无释放)/2205→148/2673→374(逃形 375 无释放)/
 *  4274→592/4359→602(飞形 603)/4374→608(飞形 609)。
 *  蝴蝶 1994-2001 八件同释 356(placeStyle 物种变体未接——恒基础款,渲染侧登记) */
export const CRITTER_RELEASE_BY_ITEM: Record<number, number> = {
  2019: 46, 261: 55, 2015: 74, 2205: 148, 2016: 297, 2017: 298, 2018: 299,
  2003: 300, 1992: 355, 2002: 357, 2004: 358, 2006: 359, 2007: 360, 2121: 361,
  2122: 362, 2123: 364, 2156: 366, 2157: 367, 2673: 374, 2740: 377, 3563: 538,
  3564: 539, 4068: 583, 4069: 584, 4070: 585, 4274: 592, 4359: 602, 4361: 604,
  4362: 605, 4363: 606, 4373: 607, 4374: 608, 4375: 610, 4395: 611, 4418: 612,
  4419: 613, 1338: 614, 4464: 616, 4465: 617, 4480: 626, 4482: 627, 4845: 653,
  4847: 654, 4849: 655, 4961: 661, 5132: 669, 5212: 671, 5300: 672, 5311: 673,
  5312: 674, 5313: 675, 5350: 677, 5511: 688,
  1994: 356, 1995: 356, 1996: 356, 1997: 356, 1998: 356, 1999: 356, 2000: 356, 2001: 356,  // 蝴蝶八物种(placeStyle 变体)
  2889: 442, 2890: 443, 2891: 444, 2892: 445, 2893: 446, 2894: 447, 2895: 448,  // 金系六件+金蚯蚓
  3191: 484, 3192: 485, 3193: 486, 3194: 487,                                  // 魔夜爬虫四饵
  4334: 595, 4335: 596, 4336: 597, 4337: 598, 4338: 599, 4339: 600, 4340: 601,  // 蜻蜓七变体
  4831: 639, 4832: 640, 4833: 641, 4834: 642, 4835: 643, 4836: 644, 4837: 645,  // 宝石松鼠七色
  4838: 646, 4839: 647, 4840: 648, 4841: 649, 4842: 650, 4843: 651, 4844: 652,  // 宝石兔七色
};
/** NPC cs → 小动物 key（释放时反查；687 神秘青蛙不在小动物表——释放门走物品表查不到） */
export const CRITTER_KEY_BY_NPC: Record<number, string> = {};
for (const c of CRITTER_DEFS) CRITTER_KEY_BY_NPC[c.npc] = c.key;
