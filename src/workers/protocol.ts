// worldGen worker ↔ 主线程协议：世界数据包（packWorld 打包 / World.fromPacket 重建）
// + 生成/读档请求与事件联合。（type-only 模块——运行时消息按此形状对齐）
import type { SaveData } from '../save/serialize';
import type { ChestData } from '../world/World';
import type { WeatherSave } from '../world/weather/Weather';
import type { BestiarySave } from '../data/Bestiary';
import type { FurnitureItemRecord } from '../world/FurnitureItems';

/** tile 存储的转移所有权 buffer 组（worker postMessage transfer 零拷贝） */
export interface TileBuffers {
  type: ArrayBuffer; flags: ArrayBuffer;
  frameX: ArrayBuffer; frameY: ArrayBuffer;
  wall: ArrayBuffer; liquid: ArrayBuffer; liquidType: ArrayBuffer;
  half: ArrayBuffer; slope: ArrayBuffer; wire: ArrayBuffer;
  /** 油漆双通道（0-31，原版 Tile.cs:609-617/:365-373；旧包可缺省——TileStore 以全零补齐） */
  paint?: ArrayBuffer; paintWall?: ArrayBuffer;
  /** 涂层四位通道（WorldFile.cs:1539-1552 位编码 2/4/8/16；旧包可缺省=全 0） */
  coat?: ArrayBuffer;
  /** 战争迷雾（旧包可缺省——fromPacket 以全零补齐；读档路径含存档 explored 解码结果） */
  explored?: ArrayBuffer;
}

export interface WorldPacket {
  w: number; h: number; seed: number; name: string;
  spawnX: number; spawnY: number;
  groundLevel: number; rockLevel: number; lavaLine: number;
  crimson: boolean; dungeonX: number; dungeonY: number; jungleX: number;
  exploredVersion: number;
  /** 世界难度 = Main.GameMode（0 经典 1 专家 2 大师 3 旅程；旧包缺省 0） */
  difficulty?: number;
  clock: { timeOfDay: number; dayCount: number; bloodMoon?: boolean; eclipse?: boolean; moonPhase?: number };
  /** 月亮贴图样式（原版 header moonType；旧包缺省 0） */
  moonType?: number;
  /** 入侵五元组（生成路径恒 0；读档路径经本包回传——packWorld 曾漏传致 worker 读档丢入侵） */
  invasion?: { type: number; size: number; sizeStart: number; x: number; delay: number };
  /** 已砸祭坛数（读档路径回传;旧包缺省 0） */
  altarCount?: number;
  /** 历史索引帧修复已在 worker 完成（saveParse 在沉降前调用 repairIndexFramesInStore；
   *  generate 新世界生成端写像素帧终态天然无需修复）。主线程 afterWorldLoad 以
   *  World.indexFramesRepaired 门控跳过二次全图扫描（#perf2026-08-28 批） */
  repairedIndexFrames?: boolean;
  /** 夜间小动物概率五件套（NPC.setFireFlyChance；旧包缺省=代表值，当晚重掷） */
  critterChances?: {
    fireFly: number; fireFlyFriendly: number; fireFlyMultiple: number;
    butterfly: number; stinkBug: number;
  };
  /** CultistRitual.delay（WF:1340/:2192；旧包缺省 86400 = delayStart） */
  cultistDelay?: number;
  /** 渔夫任务链世界段（Main.anglerQuest + anglerWhoFinishedToday，WF:1329-1335/2147-2161；
   *  旧包缺省=索引 0/空名单。anglerQuestFinished 运行时态不回传——读档重置 WF:628-629） */
  angler?: { quest: number; whoFinishedToday: string[] };
  /** 困难矿世界锁定选种（WorldGen.SavedOreTiers；旧包缺省 -1 = 未砸过,首砸重 roll） */
  savedOreTiers?: { cobalt: number; mythril: number; adamantite: number };
  /** 肉前矿档四件（WF:11294-11320,军火商钨弹门；旧包缺省=构造默认 7/6/9/8） */
  oreTiersPH?: { copper: number; iron: number; silver: number; gold: number };
  /** 流星雨剩余计数（WorldGen.meteorShowerCount,WF:1069/:177；旧包缺省 0） */
  meteorShowerCount?: number;
  /** 已砸暗影珠/猩红之心计数（WorldGen.shadowOrbCount；旧包缺省 0） */
  shadowOrbCount?: number;
  /** 日晷/月晷快进四件套（WorldFile.cs:1311/1342/1416-1417；旧包缺省=无快进无冷却） */
  sundial?: number; moondial?: number;
  fastForwardTimeToDawn?: boolean; fastForwardTimeToDusk?: boolean;
  /** 彩蛋种子旗标（SeedEasterEggs.parseSeed；血月 1/6 十周年 / drunkWorld 黎明翻转；旧包缺省={}） */
  seedFlags?: import('../world/gen/SeedEasterEggs').SeedFlags;
  /** ★IIIII20b：StarterNPC 换人一次性迁移标记（worker 读档路径回传——★BJ90 2026-09-15
   *  补携,BJ71 登记①:曾缺=即使保存面写入,worker 读档包缝即丢,迁移标每次读档恒假复发;
   *  旧包缺省=未迁移） */
  starterSwapMigrated?: boolean;
  /** ★mod 清单随包（2026-10-04 P4 红蓝修正 C1）：worker 读档 loadSaveData 落
   *  world.saveMods → packWorld → 主线程（enterGame 对账弹缺失 toast）——
   *  旧实现包缝丢失=生产 worker 读档路径提示永不触发 */
  saveMods?: Array<{ id: string; version: string }>;
  /** 天气快照（读档路径回传;旧包缺省=晴） */
  weather?: WeatherSave;
  /** 图鉴三桶（读档路径回传;旧包缺省=空） */
  bestiary?: BestiarySave;
  /** 旗击杀计数（BannerSystem.killCount,原版 WF:1347 Save/:2210 Load 随世界档；
   *  ★BJ71:worker 读档包缝随包;旧包缺省=空表） */
  bannerKills?: Record<number, number>;
  /** 城镇 NPC 段（读档路径回传,Game.loadWorld 消费;旧包缺省=空→新世界出生分支） */
  pendingTownNpcs?: Array<{ key: string; x: number; y: number; home: [number, number] | null; bound?: boolean; givenName?: string; shimmered?: boolean; kickedOut?: boolean }>;
  /** ★SW-FX11（2026-09-10）：NPC 段尾 SavesAndLoads 四塔位（读档路径回传,afterWorldLoad 恢复;旧包缺省=无） */
  pendingPillarNpcs?: Array<{ id: number; x: number; y: number }>;
  /** ★SW-FX11（2026-09-10）：按压压力板位（读档路径回传,afterWorldLoad 一次性重触发;旧包缺省=无） */
  pendingPlatePokes?: Array<{ x: number; y: number }>;
  /** ★IIIIIII6：SpawnStarterNPCs 播种记录（生成路径回传,首进消费后清空） */
  starterTownNpcs?: Array<{ key: string; givenName: string; x: number; y: number; anchor: [number, number]; dir: -1 | 1; variationIndex?: number }>;
  chests: ChestData[];
  signs: Array<{ x: number; y: number; text: string }>;
  /** 挂物族存放物（物品框/武器架/模特/帽架/食物盘/展示罐；生成路径无、读档路径有） */
  furnitureItems?: FurnitureItemRecord[];
  trees: Array<{ x: number; y: number; h: number }>;
  flags: Record<string, boolean>;
  treeX: number[]; treeStyle: number[]; treeTops: number[];
  /** ★SW-FX43（2026-09-12）：caveBackX/worldId + wld 快照三通道随包（worker 读档→
   *  主线程同缝;旧包缺省=undefined → 导出侧台账缺省映射回退） */
  caveBackX?: number[];
  worldId?: number;
  wldSnap?: SaveData['wldSnap'];
  teSnap?: SaveData['teSnap'];
  townRooms?: SaveData['townRooms'];
  /** ★SW-FX43：背景样式 13 档（R16-5 落盘值;worker 读档→主线程同缝——曾缺=worker
   *  路径读档后主线程存档丢全部背景样式） */
  bgStyles?: SaveData['header']['bgStyles'];
  /** 以太生物群系中心（无微光世界为 0；旧包可缺省） */
  shimmerX?: number; shimmerY?: number;
  buf: TileBuffers;
}

/** 生成配置（主线程 → worker；GenClient.generate 入参直传） */
export interface GenConfigDTO {
  width: number; height: number;
  /** 世界尺寸档（0 小/1 中/2 大，GetWorldSize 语义）：给出时 generateWorld 按
   *  SIZE_DIMS 派生 W/H（UIWorldCreation 尺寸选择语义） */
  size?: 0 | 1 | 2;
  seedText: string;
  name?: string;
  evil?: 0 | 1 | -1;  // 0 腐化 / 1 猩红 / -1 随机
  /** 彩蛋种子旗标直注（GenConfig.seedFlags，S0-1 解耦；缺省=parseSeed(seedText) 派生） */
  seedFlags?: import('../world/gen/SeedEasterEggs').SeedFlags;
  preview: boolean;   // 生成期降采样位图预览开关
}

export type WorldWorkerRequest =
  | { id: number; type: 'ping' }
  | { id: number; type: 'generate'; cfg: GenConfigDTO }
  | { id: number; type: 'saveParse'; key?: string; json?: string; save?: SaveData }
  | { id: number; type: 'genIcons' }
  /** ★IIIII229 ①：Esc 中止请求（fire-and-forget,无 pending）——worker 侧置位
   *  WorldGen.requestWorldGenAbort(),生成 pass 环边界消费（WorldGenerator.QueuedAbort
   *  WorldBuilding.cs:435-439 镜像） */
  | { id: number; type: 'abortGen' }
  /** ★mod 桥(2026-10-04,fire-and-forget 无回执;幂等可重推)——mod 物品/tile 稳定
   *  id 增量,worker 侧接长恒等域+补双向映射(mods/bridge.ts 供数,Client 握手后推) */
  | { id: number; type: 'applyModIds'; payload: { itemStableIds: number[]; tilePairs: Array<[number, number]>; itemKeys: Array<[string, number]>; tileKeys: Array<[string, number]>; wallKeys?: Array<[string, number]> } }
  | { id: number; type: 'applyGenSrc'; payload: { src: string; globals?: { schematics: Record<string, unknown>; modData: Record<string, unknown> } } };

export type WorldWorkerEvent =
  | { id: number; type: 'ready' }
  | { id: number; type: 'progress'; phase: string; label?: string; p: number;
     /** GenProgress 当前原版 pass 内部 Value（0..1 短条语义；generate 相位专用） */
     local?: number }
  | { id: number; type: 'preview'; passIndex: number; passName: string; width: number; height: number; rgba: ArrayBuffer }
  | { id: number; type: 'aborted'; }
  | { id: number; type: 'result'; world: WorldPacket; player?: SaveData['player']; save?: SaveData;
     /** 读档分段检查点（parse(idb|json|save)/loadSaveData/settle+pack ms）——F5 报告 load 段消费；BJ223 恢复三源后带源标签 */
     wkLog?: string[] }
  /** 程序化图标图集(#三开压测批 worker 化):genIcons 请求回传,rgba transfer。
   *  独立事件类型——与 result(必须带 world)共用 type 值会让联合收窄歧义 */
  | { id: number; type: 'icons'; icons: { rgba: ArrayBuffer; width: number; height: number; cols: number; ids: number[] } }
  | { id: number; type: 'error'; message: string; stack?: string };
