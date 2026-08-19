// 素材重制管线(Remaster Studio)共享类型。
// 三层共用:目录/切帧层(AssetCatalog)→ 热补丁运行时(RemasterRuntime)→
// 工作台(remaster.html)。纯类型,零依赖,node 单测与浏览器双端可用。

/** 素材类别(决定切帧规则与注入路径) */
export type RemasterCategory =
  | 'tile' | 'wall' | 'npc' | 'projectile' | 'item'
  | 'ui' | 'gore' | 'glow' | 'buff' | 'misc';

/** 一帧在 sheet 上的像素矩形(frameIdx 为条目内行优先序) */
export interface FrameRect { x: number; y: number; w: number; h: number; frameIdx: number; }

/** 条目级布局——决定 frames 如何枚举与工作台如何展示 */
export type EntryLayout = 'grid' | 'vstrip' | 'grid2d' | 'subrect' | 'whole';

/** 目录条目:一张"可重制素材"的完整描述 */
export interface AssetEntry {
  /** 'tile:187' | 'npc:657' | 'proj:1' | 'item:1547' | 'ui:logo_1.png' | 'buff:3' | 'gore:910' … */
  key: string;
  category: RemasterCategory;
  /** 展示名(vTileName/vItemName/vanilla-npcs name/UI 键名) */
  name: string;
  /** SpriteAtlas Map 键:'vanilla/Tiles_187.png' | 'vanilla/Item_Atlas_0.png' | 'vanilla-ui/logo_1.png' */
  sheet: string;
  layout: EntryLayout;
  frames: FrameRect[];
  /** 布局辅助(工作台网格线/生成几何参考) */
  meta?: {
    grid?: [number, number];
    stride?: [number, number];
    /** 动画物品的每条子帧数(item 类) */
    animFrames?: number;
    /** 一期排除原因(条目灰显;undefined=可重制) */
    excluded?: string;
  };
}

/** 按帧验收状态机(WorkbenchState;untouched=未处理) */
export type FrameStatus = 'untouched' | 'pending' | 'accepted' | 'skipped' | 'failed';

/** 单帧重制记录(状态+最终 prompt+重试历史) */
export interface FrameRecord {
  status: FrameStatus;
  /** 本帧最终生效 prompt(accepted 时的;pending 保留最近一次) */
  prompt?: string;
  /** 重试历史(最近 ≤8 条,旧丢弃) */
  attempts: Array<{ prompt: string; ts: number; quality: string }>;
  gen?: { size: [number, number]; algo: 'box' | 'nearest'; refFrame?: number };
  /** fnv1a32(RGBA) —— 验收时原帧指纹,防原版素材变更后错位应用 */
  hash?: string;
}

/** 条目进度(全部帧 ∈{accepted,skipped} ⇒ complete) */
export interface EntryProgress {
  key: string;
  complete: boolean;
  frames: Record<number, FrameRecord>;
}

/** 素材包 manifest(sw-remaster-pack/1) */
export interface PackManifest {
  format: 'sw-remaster-pack/1';
  name: string;
  createdAt: string;
  /** 应用基线:assetVersion() 同款 fnv1a32(vanilla.json+ui.json+CACHE_BUSTER);不符警告不拒装 */
  baseVersion: string;
  /** sheet 文件(相对 sprites/ 的原版镜像路径)→ 条目元数据 */
  entries: Record<string, PackEntryMeta>;
}

export interface PackEntryMeta {
  category: RemasterCategory;
  complete: boolean;
  /** 帧验收记录。★键 = `${AssetEntry.key}#${frameIdx}`——共享 sheet(Item_Atlas
   *  被全部 item 条目共用)下纯 frameIdx 会互相覆盖(每个 item 的帧 0 都叫 "0")。
   *  rect 自带像素定位,键只作记录寻址(应用侧整图注入不依赖此键)。 */
  frames: Record<string, PackFrameMeta>;
}

export interface PackFrameMeta {
  status: 'accepted' | 'skipped';
  rect: [number, number, number, number];
  /** 验收时原帧 fnv1a32;应用时对拍,不符跳过并计数 */
  hash: string;
  prompt?: string;
  gen?: { size: [number, number]; algo: 'box' | 'nearest'; refFrame?: number };
}

/** 已解析的素材包(导入后形态;sheets 的 key 同 SpriteAtlas Map 键) */
export interface LoadedPack {
  id: string;
  manifest: PackManifest;
  /** 'vanilla/NPC_1.png' → png Blob(混合 sheet:原版像素+已验收重制帧) */
  sheets: Map<string, Blob>;
}
