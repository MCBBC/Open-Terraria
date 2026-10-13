// mod id 桥供数(2026-10-04):worker 上下文(save.worker/worldGen.worker)持有独立的
// 模块级稳定 id 表——mod 装载在主线程完成后,经两个 Client 把增量推给每个(重)建的
// worker。本模块零依赖(loader 装载后注入 provider;Client 握手后拉取推送)。
export interface ModIdBridgePayload {
  /** 实注册 mod 物品 stable id(填 worker 侧恒等表+双向 Map;洞不填) */
  itemStableIds: number[];
  /** [internal, stable] 对(mod tile 追加序) */
  tilePairs: Array<[number, number]>;
  /** 烘焙域:mod tile def 本体(保序直落 BakeWorker;import TileDef 类型面) */
  modTileDefs: Array<{ def: import('../data/tiles').TileDef; internal: number; stable: number }>;
  /** ★P5 id 平移解:当前分配映射 fullKey→stableId(worker 读档重映射用) */
  itemKeys: Array<[string, number]>;
  tileKeys: Array<[string, number]>;
  /** ★刀3-墙(2026-10-13):mod 墙 fullKey→wallId(worker WALL_DEFS 注入——
   *  gen pass wallIdByKey 消费面;缺失=worker 域 Sunken Sea 墙静默不铺) */
  wallKeys?: Array<[string, number]>;
}

let provider: (() => ModIdBridgePayload | null) | null = null;

export function setModBridgeProvider(fn: () => ModIdBridgePayload | null): void {
  provider = fn;
}

export function getModBridgePayload(): ModIdBridgePayload | null {
  return provider?.() ?? null;
}

// ---- 当前分配映射(P5 id 平移完整解):读档重映射需要 fullKey→stableId 的当前
// 分配表——主线程 loader 直写;worker 经 applyModIds 载荷携带写入。null=不可用
// (未装载/无桥)→ 读档走既有 ??0 占位语义。 ----

export interface ModCurrentAlloc {
  itemKeys: Map<string, number>;
  tileKeys: Map<string, number>;
  /** ★D16(2026-10-13):墙域 P5 平移同族(读档 wallRemap 消费;墙 id=internal=stable) */
  wallKeys?: Map<string, number>;
}

let currentAlloc: ModCurrentAlloc | null = null;

export function setCurrentAlloc(a: ModCurrentAlloc | null): void {
  currentAlloc = a;
}

export function getCurrentAlloc(): ModCurrentAlloc | null {
  return currentAlloc;
}

// ---- 存档头 mod 清单(2026-10-04 P1;三处 SaveMeta 装配经此供数,仿 BJ71 防漏喂) ----

let saveModsProvider: (() => Array<{ id: string; version: string; items: number; tiles: number; npcs: number }> | null) | null = null;

export function setSaveModsProvider(fn: () => Array<{ id: string; version: string; items: number; tiles: number; npcs: number }> | null): void {
  saveModsProvider = fn;
}

/** 存档 SaveMeta.mods 供数(worker 上下文/未装载=null=键不落,零扰动) */
export function getSaveModEntries(): Array<{ id: string; version: string; items: number; tiles: number; npcs: number }> | null {
  return saveModsProvider?.() ?? null;
}

/** 读档侧:当前启用的 mod id 集(无 loader=null=跳过检测;worker 态即 null) */
let enabledModsProvider: (() => string[] | null) | null = null;
export function setEnabledModsProvider(fn: () => string[] | null): void { enabledModsProvider = fn; }
export function getEnabledModIds(): string[] | null { return enabledModsProvider?.() ?? null; }

// ---- ★622:mod gen pass 源码桥(worker 注入——Worker 模块实例独立=主线程注册
//  的 genPasses 对 Worker 不可见;worker eval mod bundle 源码+stub sw=gen 注册闭环) ----

let genSrcProvider: (() => string | null) | null = null;
export function setGenSrcProvider(fn: () => string | null): void { genSrcProvider = fn; }
export function getModGenSrc(): string | null { return genSrcProvider?.() ?? null; }

/** gen 全局数据面(schematics/genTiles/modData——gen passes 消费) */
export interface GenGlobalData {
  schematics: Record<string, unknown>;
  modData: Record<string, unknown>;
}
let genGlobalsProvider: (() => GenGlobalData | null) | null = null;
export function setGenGlobalsProvider(fn: () => GenGlobalData | null): void { genGlobalsProvider = fn; }
export function getGenGlobals(): GenGlobalData | null { return genGlobalsProvider?.() ?? null; }
