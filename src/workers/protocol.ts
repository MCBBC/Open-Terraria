// 世界生成/存档 worker 的消息协议（主线程 ↔ worker 双端共用）。
// 核心原则：请求/事件带自增 id 路由；全图数组一律 ArrayBuffer 走 transfer
// （postMessage 所有权移交，零拷贝）；不传任何函数（structured clone 会抛错）。
import type { ChestData } from '../world/World';
import type { SaveData } from '../save/SaveFile';

/** GenConfig 的纯数据投影：剥掉 onWorldPartial 回调（worker 内改发 preview 消息） */
export interface GenConfigDTO {
  width: number;
  height: number;
  seedText: string;
  name?: string;
  evil?: -1 | 0 | 1;
  /** 是否需要降采样预览消息 */
  preview?: boolean;
}

/** 全图数组的 buffer 集合（transfer 目标；explored 可省略，restore 时分配） */
export interface TileBuffers {
  type: ArrayBuffer;
  flags: ArrayBuffer;
  frameX: ArrayBuffer;
  frameY: ArrayBuffer;
  wall: ArrayBuffer;
  liquid: ArrayBuffer;
  liquidType: ArrayBuffer;
  half: ArrayBuffer;
  slope: ArrayBuffer;
  wire: ArrayBuffer;
  explored?: ArrayBuffer;
}

/** 世界数据包：10 个全图 buffer + 标量与实体列表 */
export interface WorldPacket {
  w: number; h: number; seed: number; name: string;
  spawnX: number; spawnY: number;
  groundLevel: number; rockLevel: number; lavaLine: number;
  crimson: boolean; dungeonX: number; dungeonY: number; jungleX: number;
  exploredVersion: number;
  clock: { timeOfDay: number; dayCount: number };
  /** 入侵五元组（主线程生成 worker 不产生入侵，恒为 0；读档路径不走此包） */
  invasion?: { type: number; size: number; sizeStart: number; x: number; delay: number };
  chests: ChestData[];
  signs: Array<{ x: number; y: number; text: string }>;
  /** 挂物族存放物（物品框/武器架/模特/帽架/食物盘/展示罐；生成路径无、读档路径有） */
  furnitureItems?: import('../world/FurnitureItems').FurnitureItemRecord[];
  trees: Array<{ x: number; y: number; h: number }>;
  flags: Record<string, boolean>;
  treeX: number[]; treeStyle: number[]; treeTops: number[];
  /** 以太生物群系中心（无微光世界为 0；旧包可缺省） */
  shimmerX?: number; shimmerY?: number;
  buf: TileBuffers;
}

export type WorldWorkerRequest =
  | { id: number; type: 'ping' }
  | { id: number; type: 'generate'; cfg: GenConfigDTO }
  /** saveParse 三源：key=worker 内直读 IndexedDB（主路径，免大字符串 clone）；
   *  json=localStorage 小档/调试；save=.wld 导入的内存 SaveData（structured clone 直传） */
  | { id: number; type: 'saveParse'; key?: string; json?: string; save?: SaveData };

export type WorldWorkerEvent =
  | { id: number; type: 'ready' }
  | { id: number; type: 'progress'; phase: 'generate' | 'settle' | 'parse'; label?: string; p: number }
  | { id: number; type: 'preview'; passIndex: number; passName: string; width: number; height: number; rgba: ArrayBuffer }
  | { id: number; type: 'result'; world: WorldPacket; player?: SaveData['player'] }
  | { id: number; type: 'error'; message: string; stack?: string };
