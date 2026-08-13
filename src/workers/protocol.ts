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
  /** 战争迷雾（旧包可缺省——fromPacket 以全零补齐；saveGame 不持久化 explored） */
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
  /** 渔夫任务链世界段（Main.anglerQuest + anglerWhoFinishedToday，WF:1329-1335/2147-2161；
   *  旧包缺省=索引 0/空名单。anglerQuestFinished 运行时态不回传——读档重置 WF:628-629） */
  angler?: { quest: number; whoFinishedToday: string[] };
  /** 困难矿世界锁定选种（WorldGen.SavedOreTiers；旧包缺省 -1 = 未砸过,首砸重 roll） */
  savedOreTiers?: { cobalt: number; mythril: number; adamantite: number };
  /** 已砸暗影珠/猩红之心计数（WorldGen.shadowOrbCount；旧包缺省 0） */
  shadowOrbCount?: number;
  /** 日晷/月晷快进四件套（WorldFile.cs:1311/1342/1416-1417；旧包缺省=无快进无冷却） */
  sundial?: number; moondial?: number;
  fastForwardTimeToDawn?: boolean; fastForwardTimeToDusk?: boolean;
  /** 彩蛋种子旗标（SeedEasterEggs.parseSeed；血月 1/6 十周年 / drunkWorld 黎明翻转；旧包缺省={}） */
  seedFlags?: import('../world/gen/SeedEasterEggs').SeedFlags;
  /** 天气快照（读档路径回传;旧包缺省=晴） */
  weather?: WeatherSave;
  /** 图鉴三桶（读档路径回传;旧包缺省=空） */
  bestiary?: BestiarySave;
  /** 城镇 NPC 段（读档路径回传,Game.loadWorld 消费;旧包缺省=空→新世界出生分支） */
  pendingTownNpcs?: Array<{ key: string; x: number; y: number; home: [number, number] | null; bound?: boolean; givenName?: string }>;
  chests: ChestData[];
  signs: Array<{ x: number; y: number; text: string }>;
  /** 挂物族存放物（物品框/武器架/模特/帽架/食物盘/展示罐；生成路径无、读档路径有） */
  furnitureItems?: FurnitureItemRecord[];
  trees: Array<{ x: number; y: number; h: number }>;
  flags: Record<string, boolean>;
  treeX: number[]; treeStyle: number[]; treeTops: number[];
  /** 以太生物群系中心（无微光世界为 0；旧包可缺省） */
  shimmerX?: number; shimmerY?: number;
  buf: TileBuffers;
}

/** 生成配置（主线程 → worker；GenClient.generate 入参直传） */
export interface GenConfigDTO {
  width: number; height: number;
  seedText: string;
  name?: string;
  evil?: 0 | 1 | -1;  // 0 腐化 / 1 猩红 / -1 随机
  preview: boolean;   // 生成期降采样位图预览开关
}

export type WorldWorkerRequest =
  | { id: number; type: 'ping' }
  | { id: number; type: 'generate'; cfg: GenConfigDTO }
  | { id: number; type: 'saveParse'; key?: string; json?: string; save?: SaveData };

export type WorldWorkerEvent =
  | { id: number; type: 'ready' }
  | { id: number; type: 'progress'; phase: string; label?: string; p: number }
  | { id: number; type: 'preview'; passIndex: number; passName: string; width: number; height: number; rgba: ArrayBuffer }
  | { id: number; type: 'result'; world: WorldPacket; player?: SaveData['player']; save?: SaveData }
  | { id: number; type: 'error'; message: string; stack?: string };
