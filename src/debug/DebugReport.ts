// F5 一键调试报告提取器：collectDebugReport 把当前 Game 运行时态打包为机器优先 JSON。
// 格式约定（外部约定，报告本身零散文）：
//   - 枚举一律原始数值 id（sheet/方块/物品/buff/事件 wave）
//   - 同构数据一律 [[k, v], ...] 元组数组（直方图/buff/非空槽位）
//   - 区域转储 = 行 RLE 串：cell = "sheet:fx:fy:wall:liquid"，空格记 "0"，连续相同 cell 记 "cell*runLen"，行内以 ";" 分隔
//   - tiles.focus = 焦点格贴图解析链（hover/相机中心/玩家脚下三格 × cell/atlas/sample/frameEngine）
// 收集全程防御式访问（缺字段 → null/0），保证 node 单测无 DOM 样本也能跑通。
import { gfxQuality } from '../core/GfxQuality';
import { TILE_DEFS } from '../data/tiles';
import { ITEM_DEFS } from '../data/items';
import { TILE } from '../core/constants';
import { liquidDebugState } from '../render/VanillaLiquidRenderer';
import { autoFrameAt } from '../render/VanillaTiler';
import { TILE_ANIM_RATE, animFrameIdx, animYOffset, tileAnim } from '../render/TileAnim';
import { vanillaFrameIdx } from '../render/Renderer';
import { assetCacheState } from '../net/AssetCache';
import type { Game } from '../core/Game';
import type { Enemy } from '../entities/Enemy';

export const DEBUG_REPORT_SCHEMA_VERSION = 3;

/** 截图 dataURL 上限：base64 长度换算字节 ≈ len*3/4，超过即省略（置 null + omitted 标记） */
const SHOT_BASE64_LIMIT = Math.ceil((8 * 1024 * 1024) * 4 / 3);
const HIST_TOP_N = 50;
const HIT_TILES_TOP_N = 10;
const FURNITURE_SAMPLE_N = 5;
/** 小地图截图裁剪半径（tile）：全图 canvas 巨大，只截玩家周围局部 */
const MINIMAP_CROP_R = 100;

export interface SwErrorRecord { t: number; kind: number; msg: string; stack: string | null }
export interface SwWarnRecord { t: number; msg: string }

export interface DebugReportOptions {
  /** 截图段（默认 true）；无 DOM 环境自动降级为 null */
  screenshot?: boolean;
  /** 游玩时长 ms（mainFlow.playStartNow；缺省由报告时间戳兜底 0） */
  playTimeMs?: number;
  /** 错误 ring 注入（单测用；缺省读 globalThis.__swErrors） */
  errors?: SwErrorRecord[];
  /** 警告 ring 注入（单测用；缺省读 globalThis.__swWarns——main.ts console.warn 钩子） */
  warnings?: SwWarnRecord[];
  /** __swGame 挂载计数注入（单测用；缺省读 globalThis.__swInstanceCount） */
  instanceCount?: number;
}

/** 区域转储。rows 每行 RLE,token = `sheet:fx:fy:wall:liquid`(空格带墙/液体时 sheet=-1,
 *  纯空格压缩为 '0')——**第一字段是原版 sheet id 不是内部 type id**(贴图考古曾在此踩坑)。
 *  auto 帧 tile 的 store fx/fy 恒 0(渲染时查表),勿据 0 判"帧未生效" */
export interface RleAreaDump {
  x0: number; y0: number; w: number; h: number; rows: string[];
  /** 自描述编码说明(报告消费方免读源码) */
  enc?: string;
}

/** Game.debugSnapshot() 返回形（字段全部可缺——测试桩可只给子集） */
export interface GameDebugSnapshot {
  fps?: number | null;
  frameDtMs?: number[];
  hitTilesSize?: number;
  hitTilesTop?: Array<{ x: number; y: number; type: number; damage: number; ttl: number }>;
  mining?: { x: number; y: number; progress: number } | null;
  swing?: { t: number; dur: number; item: number; dmg: number | null; kb: number | null; useStyle: number | null; aim: number | null } | null;
  invasionWarn?: number;
  tickCount?: number;
}

// ================= RLE 编解码（导出供测试往返） =================

/** 一行 cell token 序列 → RLE 串（"0"、"sheet:fx:fy:wall:liquid"，连续相同合并 *runLen） */
export function encodeRle(tokens: string[]): string {
  const parts: string[] = [];
  let runTok = '';
  let runLen = 0;
  for (const tok of tokens) {
    if (tok === runTok) { runLen++; continue; }
    if (runTok) parts.push(runLen > 1 ? `${runTok}*${runLen}` : runTok);
    runTok = tok;
    runLen = 1;
  }
  if (runTok) parts.push(runLen > 1 ? `${runTok}*${runLen}` : runTok);
  return parts.join(';');
}

/** RLE 串 → cell token 序列（与 encodeRle 互逆） */
export function decodeRle(row: string): string[] {
  const out: string[] = [];
  for (const part of row.split(';')) {
    if (!part) continue;
    const star = part.lastIndexOf('*');
    const tok = star >= 0 ? part.slice(0, star) : part;
    const n = star >= 0 ? Math.max(1, parseInt(part.slice(star + 1), 10) || 1) : 1;
    for (let i = 0; i < n; i++) out.push(tok);
  }
  return out;
}

// ================= 内部工具 =================

/** 内部 tile id → 原版 sheet id（非 vanilla tile / 空格 = -1；空格调用方先短路） */
export function sheetOfType(type: number): number {
  return TILE_DEFS[type]?.vanilla?.sheet ?? -1;
}

function sheetOf(type: number): number {
  return sheetOfType(type);
}

function histTop(counts: Map<number, number>, n: number): Array<[number, number]> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, n);
}

function cellToken(st: { type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array; wall: Uint16Array; liquid: Uint8Array }, i: number): string {
  const t = st.type[i];
  if (t === 0) {
    // 空格但带墙/液体：保留证据（sheet=-1 前缀，帧位恒 0）；纯空格压缩为 '0'
    return st.wall[i] !== 0 || st.liquid[i] !== 0
      ? `-1:0:0:${st.wall[i]}:${st.liquid[i]}`
      : '0';
  }
  return `${sheetOf(t)}:${st.frameX[i]}:${st.frameY[i]}:${st.wall[i]}:${st.liquid[i]}`;
}

/** 区域转储：矩形逐行 RLE（出界裁剪到世界内） */
export function dumpArea(
  st: { w: number; h: number; idx(x: number, y: number): number; type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array; wall: Uint16Array; liquid: Uint8Array },
  x0: number, y0: number, x1: number, y1: number,
): RleAreaDump {
  const bx0 = Math.max(0, Math.min(x0, st.w - 1));
  const by0 = Math.max(0, Math.min(y0, st.h - 1));
  const bx1 = Math.max(0, Math.min(x1, st.w - 1));
  const by1 = Math.max(0, Math.min(y1, st.h - 1));
  const rows: string[] = [];
  for (let y = by0; y <= by1; y++) {
    const toks: string[] = [];
    for (let x = bx0; x <= bx1; x++) toks.push(cellToken(st, st.idx(x, y)));
    rows.push(encodeRle(toks));
  }
  return { x0: bx0, y0: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1, rows, enc: 'sheet:fx:fy:wall:liquid' };
}

function canvasShot(c: { toDataURL?: (t: string) => string } | null | undefined): { url: string | null; omitted: boolean } {
  if (!c || typeof c.toDataURL !== 'function') return { url: null, omitted: false };
  try {
    const url = c.toDataURL.call(c, 'image/png');
    if (url.length > SHOT_BASE64_LIMIT) return { url: null, omitted: true };
    return { url, omitted: false };
  } catch {
    return { url: null, omitted: true };
  }
}

/** 小地图截图：从全图 minimap canvas 裁玩家周围 (2R)² tile 局部，避免整图 PNG 撑爆体积 */
function minimapShot(
  mini: { canvas?: { width: number; height: number } & { toDataURL?: (t: string) => string } } | null | undefined,
  ctx2d: CanvasRenderingContext2D | null,
  ptx: number, pty: number,
): { url: string | null; omitted: boolean } {
  if (!mini?.canvas || !ctx2d || typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return { url: null, omitted: false };
  }
  const sx = Math.max(0, Math.min(ptx - MINIMAP_CROP_R, mini.canvas.width - 2 * MINIMAP_CROP_R));
  const sy = Math.max(0, Math.min(pty - MINIMAP_CROP_R, mini.canvas.height - 2 * MINIMAP_CROP_R));
  try {
    const c = document.createElement('canvas');
    c.width = 2 * MINIMAP_CROP_R;
    c.height = 2 * MINIMAP_CROP_R;
    const cx = c.getContext('2d');
    if (!cx) return { url: null, omitted: true };
    cx.drawImage(mini.canvas as unknown as CanvasImageSource, sx, sy, 2 * MINIMAP_CROP_R, 2 * MINIMAP_CROP_R, 0, 0, 2 * MINIMAP_CROP_R, 2 * MINIMAP_CROP_R);
    return canvasShot(c);
  } catch {
    return { url: null, omitted: true };
  }
}

/** 渲染子系统统一调试钩子（可选实现；缺 → null） */
export interface DebugStateProvider { debugState?(): object }

/** SceneFlags（world/SceneMetrics）→ 报告快照；布尔一律 0/1，防御式访问 */
function sceneFlagsRecord(f: unknown): Record<string, unknown> | null {
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, unknown>;
  const b = (k: string): number => (o[k] ? 1 : 0);
  const n = (k: string): number => (typeof o[k] === 'number' ? (o[k] as number) : 0);
  return {
    tileX: n('tileX'), tileY: n('tileY'), belowSurface: b('belowSurface'),
    heights: {
      sky: b('zoneSkyHeight'), overworld: b('zoneOverworldHeight'),
      dirtLayer: b('zoneDirtLayerHeight'), rockLayer: b('zoneRockLayerHeight'),
      underworld: b('zoneUnderworldHeight'),
    },
    zone: {
      corrupt: b('zoneCorrupt'), crimson: b('zoneCrimson'), hallow: b('zoneHallow'),
      jungle: b('zoneJungle'), snow: b('zoneSnow'), desert: b('zoneDesert'),
      glowshroom: b('zoneGlowshroom'), meteor: b('zoneMeteor'),
      graveyard: b('zoneGraveyard'), dungeon: b('zoneDungeon'), temple: b('zoneTemple'),
      beach: b('zoneBeach'), undergroundDesert: b('zoneUndergroundDesert'),
    },
    counts: {
      snowTile: n('snowTileCount'), desertSandTile: n('desertSandTileCount'),
      graveyardTile: n('graveyardTileCount'), townNPC: n('townNPCCount'),
    },
    devices: {
      musicBoxStyle: n('musicBoxStyle'), fountainColor: n('fountainColor'),
      monolithType: n('monolithType'),
      bloodMoonMonolith: b('bloodMoonMonolith'), partyUp: b('partyUp'),
    },
  };
}

/** 可选 debugState() 钩子安全调用（缺钩子/抛异常 → null） */
function optionalDebugState(provider: DebugStateProvider | null | undefined): object | null {
  if (!provider || typeof provider.debugState !== 'function') return null;
  try {
    return provider.debugState();
  } catch {
    return null;
  }
}

/** 可疑格光照采样：[tx, ty, r, g, b]（lightAt 缺失/越区 → 0,0,0） */
function lightSample(
  lighting: { lightAt?: (tx: number, ty: number) => [number, number, number] },
  tx: number, ty: number,
): [number, number, number, number, number] {
  if (typeof lighting.lightAt !== 'function') return [tx, ty, 0, 0, 0];
  try {
    const [r, gg, b] = lighting.lightAt(tx, ty);
    return [tx, ty, r, gg, b];
  } catch {
    return [tx, ty, 0, 0, 0];
  }
}

function enemyRecord(e: Enemy) {
  return {
    id: e.id,
    vid: e.vanillaId ?? -1,
    aiStyle: e.vanilla?.aiStyle ?? -1,
    x: Math.round(e.x), y: Math.round(e.y),
    vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2),
    hp: Math.round(e.hp), maxHp: e.maxHp,
    ai0: e.ai0, ai1: e.ai1, ai2: e.ai2, ai3: e.ai3,
    lai0: e.lai0, lai1: e.lai1,
    aiInit: e.aiInit,
    onGround: e.onGround,
    despawnTimer: e.despawnTimer,
    netPuppet: e.netPuppet,
    justHitT: e.justHitT,
  };
}

// ================= 焦点格贴图解析链（tiles.focus，schema v3） =================
// 焦点格 = 鼠标 hover 格 + 相机中心格 + 玩家脚下格。每格输出 cell → atlas → sample →
// frameEngine 四级解析链，定位"陶罐/瀑布类贴图选错"：cell 看帧编码、atlas 看 drawImage
// 源矩形与越界、sample 看源矩形实际颜色（瀑布会话靠 Waterfall_0 均色蓝 vs _2 均色灰
// 断定选错表）、frameEngine 看帧引擎输入输出。全程防御式，无 DOM/无 atlas → 段内 null。

/** VanillaTileMeta 的最小消费面 */
interface AtlasMeta {
  name: string; key: string; sheet: string;
  grid: [number, number]; stride: [number, number]; cols: number; rows: number;
}

/** SpriteAtlas 的最小消费面（vmeta + vimages；缺/抛 → 对应段 null） */
interface AtlasLike {
  vmeta?: (sheetId: number) => AtlasMeta | null;
  vimages?: Map<string, { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }>;
}

/** 焦点格完整解析链（字段缺失一律 null，消费方只判 null 不猜） */
export interface FocusTileChain {
  x: number; y: number;
  cell: {
    type: number; key: string | null;
    framed: boolean | null; solid: boolean | null; platform: boolean | null;
    pick: number | null; axe: number | null;
    sheet: number | null;
    fx: number; fy: number;
    wall: number; liquid: number; wire: number | null;
    frameMode: 'auto' | 'style' | 'blend' | null;
    fw: number | null; fh: number | null;
  } | null;
  atlas: {
    sheet: number; file: string; name: string; key: string;
    loaded: boolean;
    pngW: number | null; pngH: number | null;
    grid: [number, number]; stride: [number, number];
    cols: number; rows: number;
    src: { sx: number; sy: number; sw: number; sh: number };
    oob: boolean | null;            // 源矩形越界（无尺寸依据时 null）
    boundsBasis: 'image' | 'meta' | null;
  } | null;
  sample: {
    avg: [number, number, number];       // 非透明像素均色
    center8: [number, number, number];   // 中心 8×8 均色
    opaque: number;                      // 非透明像素占比（0/255 编码）
    px: number;                          // 采样总像素数
  } | null;
  frameEngine: {
    mode: 'auto' | 'style' | 'blend' | null;
    auto: { col: number; row: number } | null;                       // 'auto' 查表帧（VanillaTiler.autoFrameAt）
    tileAnim: { idx: number; yOff: number; rate: number; tick: number } | null; // TILE_ANIM_RATE 表内动画帧
    findFrame: { npcId: number; frames: number; idx: number | null; drawIdx: number | null; animT: number | null; walkCycleT: number | null } | null; // 格上敌怪走 Renderer.vanillaFrameIdx
  } | null;
}

/** 鼠标 hover 格：优先 camera.tileUnder，桩相机回退 screenToWorld 同式手算 */
function hoverTileOf(g: { input?: { mouseX?: unknown; mouseY?: unknown } }, cam: unknown): [number, number] | null {
  const inp = g.input;
  if (!inp || typeof inp.mouseX !== 'number' || typeof inp.mouseY !== 'number') return null;
  const c = cam as { tileUnder?: unknown; x?: unknown; y?: unknown; zoom?: unknown; viewW?: unknown; viewH?: unknown } | null;
  if (c && typeof c.tileUnder === 'function') {
    try {
      const r = (c.tileUnder as (sx: number, sy: number) => [number, number])(inp.mouseX, inp.mouseY);
      if (Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1])) return [r[0], r[1]];
    } catch { /* 回退手算 */ }
  }
  if (!c || typeof c.x !== 'number' || typeof c.y !== 'number' || typeof c.zoom !== 'number' || !(c.zoom > 0)) return null;
  const vw = typeof c.viewW === 'number' ? c.viewW : 0;
  const vh = typeof c.viewH === 'number' ? c.viewH : 0;
  return [
    Math.floor(((inp.mouseX - vw / 2) / c.zoom + c.x) / TILE),
    Math.floor(((inp.mouseY - vh / 2) / c.zoom + c.y) / TILE),
  ];
}

/** 离屏 canvas 采样源矩形：均色/中心 8×8 均色/非透明占比。无 DOM 或采样失败 → null */
function sampleRect(img: unknown, sx: number, sy: number, sw: number, sh: number): FocusTileChain['sample'] {
  if (!img || typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const w = Math.max(1, Math.floor(sw));
  const h = Math.max(1, Math.floor(sh));
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    const mean = (r: number, gg: number, b: number, n: number): [number, number, number] =>
      n > 0 ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : [0, 0, 0];
    let sr = 0, sg = 0, sb = 0, n = 0, opaque = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
      if (d[i + 3] >= 128) opaque++;
    }
    const x0 = Math.max(0, (w >> 1) - 4), x1 = Math.min(w, (w >> 1) + 4);
    const y0 = Math.max(0, (h >> 1) - 4), y1 = Math.min(h, (h >> 1) + 4);
    let cr = 0, cg = 0, cb = 0, cn = 0;
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const o = (yy * w + xx) * 4;
        if (d[o + 3] > 0) { cr += d[o]; cg += d[o + 1]; cb += d[o + 2]; cn++; }
      }
    }
    return { avg: mean(sr, sg, sb, n), center8: mean(cr, cg, cb, cn), opaque: +(opaque / (w * h)).toFixed(4), px: w * h };
  } catch {
    return null;
  }
}

/** 单个焦点格的完整解析链（出界 → 仅 x/y + 全 null） */
function focusChain(
  st: { w: number; h: number; idx(x: number, y: number): number; inBounds?(x: number, y: number): boolean; type: ArrayLike<number>; frameX: ArrayLike<number>; frameY: ArrayLike<number>; wall: ArrayLike<number>; liquid: ArrayLike<number>; wire?: ArrayLike<number> },
  atlas: AtlasLike | null, enemies: Enemy[], x: number, y: number,
): FocusTileChain {
  const inB = typeof st.inBounds === 'function' ? st.inBounds(x, y) : x >= 0 && y >= 0 && x < st.w && y < st.h;
  if (!inB) return { x, y, cell: null, atlas: null, sample: null, frameEngine: null };
  const i = st.idx(x, y);
  const t = st.type[i] ?? 0;
  const def = TILE_DEFS[t];
  const v = def?.vanilla;
  const mode = (v?.frame ?? null) as 'auto' | 'style' | 'blend' | null;
  const cell: NonNullable<FocusTileChain['cell']> = {
    type: t,
    key: def?.key ?? null,
    framed: def?.framed ?? null,
    solid: def?.solid ?? null,
    platform: def?.platform ?? null,
    pick: def?.pick ?? null,
    axe: def?.axe ?? null,
    sheet: v?.sheet ?? null,
    fx: st.frameX[i] ?? 0,
    fy: st.frameY[i] ?? 0,
    wall: st.wall[i] ?? 0,
    liquid: st.liquid[i] ?? 0,
    wire: st.wire ? (st.wire[i] ?? 0) : null,
    frameMode: mode,
    fw: v?.fw ?? null,
    fh: v?.fh ?? null,
  };
  // ---- 'auto' 查表帧（与渲染端同一 LOOKUP，VanillaTiler.autoFrameAt）----
  let autoFrame: { col: number; row: number } | null = null;
  if (mode === 'auto' && t > 0) {
    try { autoFrame = autoFrameAt(st as never, x, y, t); } catch { autoFrame = null; }
  }
  // ---- atlas 元数据 + drawImage 源矩形 + 越界判定 ----
  let atlasRec: FocusTileChain['atlas'] = null;
  let sample: FocusTileChain['sample'] = null;
  const sheetId = v?.sheet;
  if (atlas && typeof atlas.vmeta === 'function' && typeof sheetId === 'number') {
    let m: AtlasMeta | null = null;
    try { m = atlas.vmeta(sheetId); } catch { m = null; }
    if (m) {
      const img = atlas.vimages?.get(m.sheet) ?? null;
      const iw = img ? (img.width || img.width || 0) : 0;
      const ih = img ? (img.height || img.height || 0) : 0;
      const sx = autoFrame ? autoFrame.col * m.stride[0] : cell.fx;
      const sy = autoFrame ? autoFrame.row * m.stride[1] : cell.fy;
      const sw = m.grid[0], sh = m.grid[1];
      let oob: boolean | null = null;
      let boundsBasis: 'image' | 'meta' | null = null;
      if (img && iw > 0 && ih > 0) {
        oob = sx < 0 || sy < 0 || sx + sw > iw || sy + sh > ih;
        boundsBasis = 'image';
      } else if (m.cols > 0 && m.rows > 0) {
        // 表未载：按元数据网格判定（cols/rows × stride 的像素范围）
        oob = sx < 0 || sy < 0 || sx + sw > m.cols * m.stride[0] || sy + sh > m.rows * m.stride[1];
        boundsBasis = 'meta';
      }
      atlasRec = {
        sheet: sheetId, file: m.sheet, name: m.name, key: m.key,
        loaded: !!img, pngW: img ? (iw || null) : null, pngH: img ? (ih || null) : null,
        grid: [m.grid[0], m.grid[1]], stride: [m.stride[0], m.stride[1]],
        cols: m.cols, rows: m.rows,
        src: { sx, sy, sw, sh },
        oob, boundsBasis,
      };
      if (img && !oob) sample = sampleRect(img, sx, sy, sw, sh);
    }
  }
  // ---- frameEngine：tile 动画表 + 格上敌怪的 FindFrame ----
  let animRec: NonNullable<NonNullable<FocusTileChain['frameEngine']>['tileAnim']> | null = null;
  if (typeof sheetId === 'number' && TILE_ANIM_RATE[sheetId]) {
    const meta = atlasRec;
    const hPx = meta ? meta.rows * meta.stride[1] : 0;
    animRec = {
      idx: animFrameIdx(sheetId, hPx),
      yOff: animYOffset(sheetId, hPx),
      rate: TILE_ANIM_RATE[sheetId],
      tick: tileAnim.tick,
    };
  }
  let ff: NonNullable<NonNullable<FocusTileChain['frameEngine']>['findFrame']> | null = null;
  const npc = enemies.find((e) => {
    const cx = (e as { cx?: number }).cx, cy = (e as { cy?: number }).cy;
    return typeof cx === 'number' && typeof cy === 'number'
      && Math.floor(cx / TILE) === x && Math.floor(cy / TILE) === y;
  });
  if (npc) {
    const frames = Math.max(1, npc.vanilla?.frames ?? 1);
    let idx: number | null = null;
    try { idx = vanillaFrameIdx(npc, frames); } catch { idx = null; }
    ff = {
      npcId: npc.vanillaId ?? -1,
      frames,
      idx,
      drawIdx: idx === null ? null : Math.max(0, Math.min(frames - 1, idx)),
      animT: npc.animT ?? null,
      walkCycleT: npc.walkCycleT ?? null,
    };
  }
  const frameEngine = (mode || autoFrame || animRec || ff)
    ? { mode, auto: autoFrame, tileAnim: animRec, findFrame: ff }
    : null;
  return { x, y, cell, atlas: atlasRec, sample, frameEngine };
}

// ================= 主收集器 =================

export function collectDebugReport(game: Game, opts: DebugReportOptions = {}): Record<string, unknown> {
  const g = game as Game & {
    debugSnapshot?: () => GameDebugSnapshot;
    fps?: number | null;
  };
  const wantShot = opts.screenshot !== false;
  const w = g.world;
  const st = w?.store;
  const cam = g.camera;
  const snap: GameDebugSnapshot = typeof g.debugSnapshot === 'function' ? g.debugSnapshot() : {};
  const errs = opts.errors ?? (globalThis as unknown as { __swErrors?: SwErrorRecord[] }).__swErrors ?? [];
  const warns = opts.warnings ?? (globalThis as unknown as { __swWarns?: SwWarnRecord[] }).__swWarns ?? [];

  // ---- tiles：直方图 + 区域转储 ----
  let histType: Array<[number, number]> = [];
  let histSheet: Array<[number, number]> = [];
  let areaCam: RleAreaDump | null = null;
  let visibleTop: Array<{ sheet: number; key: string | null; count: number }> | null = null;
  let areaPlayer: RleAreaDump | null = null;
  if (st) {
    const byType = new Map<number, number>();
    const bySheet = new Map<number, number>();
    const typeArr = st.type;
    // ★步长采样(2026-08-14 终审:全图 5-20M 格逐个 Map set = F5 同步巨帧,
    // 与迷雾 F4 巨帧同族)——stride 取 ~总格/8192,直方图为估算值(报告只看分布)
    const stride = Math.max(1, Math.floor(typeArr.length / 8192));
    for (let i = 0; i < typeArr.length; i += stride) {
      const t = typeArr[i];
      if (t === 0) continue;
      byType.set(t, (byType.get(t) ?? 0) + 1);
      const s = sheetOf(t);
      bySheet.set(s, (bySheet.get(s) ?? 0) + 1);
    }
    histType = histTop(byType, HIST_TOP_N);
    histSheet = histTop(bySheet, HIST_TOP_N);
    if (cam) {
      const halfW = (cam.viewW / 2) / cam.zoom;
      const halfH = (cam.viewH / 2) / cam.zoom;
      areaCam = dumpArea(st,
        Math.floor((cam.x - halfW) / TILE), Math.floor((cam.y - halfH) / TILE),
        Math.floor((cam.x + halfW) / TILE), Math.floor((cam.y + halfH) / TILE));
      // 屏内可见 tile 频次 top(贴图考古第一问"这一屏主要是什么"直接可答)
      try {
        const bySheet = new Map<number, number>();
        for (let y = areaCam.y0; y < areaCam.y0 + areaCam.h; y++) {
          for (let x = areaCam.x0; x < areaCam.x0 + areaCam.w; x++) {
            const t = st.type[st.idx(x, y)];
            if (t === 0) continue;
            const sh = sheetOf(t);
            bySheet.set(sh, (bySheet.get(sh) ?? 0) + 1);
          }
        }
        visibleTop = [...bySheet.entries()]
          .sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([sh, n]) => ({ sheet: sh, key: TILE_DEFS.find((t) => t.vanilla?.sheet === sh)?.key ?? null, count: n }));
      } catch { visibleTop = null; }
    }
    if (g.player) {
      const ptx = Math.floor(g.player.cx / TILE);
      const pty = Math.floor(g.player.cy / TILE);
      areaPlayer = dumpArea(st, ptx - 32, pty - 32, ptx + 32, pty + 32);
    }
  }

  // ---- entities ----
  const ents = g.entities;
  const enemies = (ents?.enemies ?? []) as Enemy[];
  const entityCounts = ents
    ? {
      enemies: ents.enemies.length,
      drops: ents.drops.length,
      npcs: ents.npcs.length,
      projectiles: ents.projectiles.length,
      critters: ents.critters.length,
      props: ents.props.length,
    }
    : null;
  // 逐实体小转储(前 20):贴图问题现场可能是掉落物/NPC 而非 tile——此前只给计数查无此物
  const entDump = (list: unknown[], keyOf?: (e: never) => string) =>
    list.slice(0, 20).map((e) => {
      const o = e as { id?: number; x?: number; y?: number; key?: string; itemId?: number; netPuppet?: boolean };
      return {
        id: o.id ?? null,
        key: keyOf ? keyOf(e as never) : (o.key ?? (o.itemId !== undefined ? ITEM_DEFS[o.itemId]?.key ?? `item_${o.itemId}` : null)),
        x: o.x !== undefined ? Math.round(o.x) : null,
        y: o.y !== undefined ? Math.round(o.y) : null,
        netPuppet: o.netPuppet ?? null,
      };
    });
  const entityList = ents ? {
    drops: entDump([...ents.drops]),
    npcs: entDump([...ents.npcs]),
    props: entDump([...ents.props]),
  } : null;

  // ---- player ----
  let player: Record<string, unknown> | null = null;
  const p = g.player;
  if (p) {
    const inv: Array<[number, number, number, number, number]> = [];
    p.inv.slots.forEach((s, i) => {
      if (s) inv.push([i, s.id, s.stack, s.prefix ?? 0, ITEM_DEFS[s.id]?.vid ?? -1]);
    });
    const equip: Array<[number, number, number]> = [];
    p.inv.armor.forEach((s, i) => {
      if (s) equip.push([i, s.id, ITEM_DEFS[s.id]?.vid ?? -1]);
    });
    player = {
      x: Math.round(p.x), y: Math.round(p.y),
      tx: Math.floor(p.cx / TILE), ty: Math.floor(p.cy / TILE),
      vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2),
      hp: Math.round(p.hp), maxHp: p.maxHp,
      mana: Math.round(p.mana), maxMana: p.maxMana,
      facing: p.facing, onGround: p.onGround, inWater: p.inWater,
      buffs: [...p.buffs.active.entries()].map(([t, sec]) => [t, +sec.toFixed(2)] as [number, number]),
      invNonEmpty: inv,
      equipArmor: equip,
      hotbarSelected: p.inv.selected,
    };
  }

  // ---- 截图段（无 DOM 环境安全降级） ----
  let shot: Record<string, unknown> | null = null;
  if (wantShot) {
    const main = canvasShot(g.renderer?.canvas ?? null);
    const mini = minimapShot(g.renderer?.minimap ?? null, g.renderer?.ctx ?? null,
      player ? (player.tx as number) : 0, player ? (player.ty as number) : 0);
    shot = { main: main.url, minimap: mini.url, mainOmitted: main.omitted, minimapOmitted: mini.omitted };
  }

  // ---- tiles.focus：三焦点格（hover/相机中心/玩家脚下）贴图解析链 ----
  const atlas = (g as { atlas?: AtlasLike | null }).atlas ?? null;
  let focusSection: Record<string, FocusTileChain | null> | null = null;
  if (st) {
    const hoverPos = hoverTileOf(g, cam);
    const camPos = cam && Number.isFinite(cam.x) && Number.isFinite(cam.y)
      ? [Math.floor(cam.x / TILE), Math.floor(cam.y / TILE)] as [number, number]
      : null;
    const pPos = p && Number.isFinite(p.cx) && Number.isFinite(p.cy)
      ? [Math.floor(p.cx / TILE), Math.floor(p.cy / TILE)] as [number, number]
      : null;
    const chain = (pos: [number, number] | null): FocusTileChain | null =>
      pos ? focusChain(st, atlas, enemies, pos[0], pos[1]) : null;
    // 邻域 5×5 全链转储(贴图问题现场常不在三个焦点上——实测三焦点全空而问题格在旁):
    // 只保留非空格,键 `x,y`;hover 与玩家脚下各一份
    const ring = (c: [number, number] | null): Record<string, FocusTileChain | null> | null => {
      if (!c) return null;
      const out: Record<string, FocusTileChain | null> = {};
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ch = focusChain(st, atlas, enemies, c[0] + dx, c[1] + dy);
          if (ch?.cell && ch.cell.type !== 0) out[`${c[0] + dx},${c[1] + dy}`] = ch;
        }
      }
      return out;
    };
    focusSection = {
      hover: chain(hoverPos), camera: chain(camPos), player: chain(pPos),
      hoverRing: ring(hoverPos), playerRing: ring(pPos),
    } as Record<string, FocusTileChain | null>;
  }

  const wiring = g.wiring;
  const hitTop = (snap.hitTilesTop ?? []) as Array<{ x: number; y: number; type: number; damage: number; ttl: number }>;

  return {
    meta: {
      schemaVersion: DEBUG_REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      viewport: typeof window !== 'undefined' && window.innerWidth
        ? [window.innerWidth, window.innerHeight] : null,
      fps: g.fps ?? null,
      paused: g.paused ?? false,
      playTimeMs: opts.playTimeMs ?? 0,
    },
    errors: errs.slice(-50).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg, stack: e.stack })),
    warnings: warns.slice(-50).map((w) => ({ t: w.t, msg: w.msg })),
    instance: {
      gameMounts: opts.instanceCount ?? (globalThis as unknown as { __swInstanceCount?: number }).__swInstanceCount ?? 0,
      compatReport: !!(globalThis as unknown as { __lastCompatReport?: unknown }).__lastCompatReport,
    },
    world: w ? {
      name: w.name,
      seed: w.seed,
      w: st?.w ?? 0, h: st?.h ?? 0,
      groundLevel: w.groundLevel, rockLevel: w.rockLevel, lavaLine: w.lavaLine,
      dungeonX: w.dungeonX, dungeonY: w.dungeonY,
      spawnX: w.spawnX, spawnY: w.spawnY,
      crimson: w.crimson,
      zones: sceneFlagsRecord(g.scene ?? w.scene ?? null),
      flags: Object.entries(w.flags).map(([k, v]) => [k, v ? 1 : 0] as [string, number]),
      clock: w.clock ? {
        timeOfDay: +w.clock.timeOfDay.toFixed(5),
        dayCount: w.clock.dayCount,
        bloodMoon: w.clock.bloodMoon ? 1 : 0,
        eclipse: w.clock.eclipse ? 1 : 0,
        moonPhase: w.clock.moonPhase,
      } : null,
      weather: w.weather ? {
        raining: w.weather.raining ? 1 : 0,
        rainTime: w.weather.rainTime,
        windSpeedTarget: w.weather.windSpeedTarget,
      } : null,
      moonEvent: w.moonEvent ? {
        kind: w.moonEvent.kind,
        waveNumber: w.moonEvent.waveNumber,
        waveKills: w.moonEvent.waveKills,
        totalInvasionPoints: w.moonEvent.totalInvasionPoints,
      } : null,
      invasion: {
        type: w.invasionType, size: w.invasionSize,
        sizeStart: w.invasionSizeStart, x: w.invasionX, delay: w.invasionDelay,
      },
      oldOnesArmy: w.oldOnesArmy ? {
        ongoing: w.oldOnesArmy.ongoing ? 1 : 0,
        difficulty: w.oldOnesArmy.ongoingDifficulty,
        timeLeftUntilSpawningBegins: w.oldOnesArmy.timeLeftUntilSpawningBegins,
        waveNumber: w.oldOnesArmy.waveNumber,
        waveKills: w.oldOnesArmy.waveKills,
        totalInvasionPoints: w.oldOnesArmy.totalInvasionPoints,
      } : null,
    } : null,
    tiles: st ? {
      total: st.type.length,
      histType,
      histSheet,
      areaCamera: areaCam,
      areaPlayer,
      visibleTop,
      focus: focusSection,
    } : null,
    render: {
      camera: cam ? {
        // x/y = 视野**中心**(世界 px)——截图像素→世界: world = cam.xy + (screen - view/2)/zoom
        x: Math.round(cam.x), y: Math.round(cam.y),
        zoom: +cam.zoom.toFixed(3), zoomTarget: +cam.zoomTarget.toFixed(3),
        viewW: cam.viewW, viewH: cam.viewH,
        corners: {
          tl: [Math.floor((cam.x - (cam.viewW / 2) / cam.zoom) / TILE), Math.floor((cam.y - (cam.viewH / 2) / cam.zoom) / TILE)],
          br: [Math.floor((cam.x + (cam.viewW / 2) / cam.zoom) / TILE), Math.floor((cam.y + (cam.viewH / 2) / cam.zoom) / TILE)],
        },
      } : null,
      fullMapOpen: g.renderer?.fullMap?.open ? 1 : 0,
      debugMode: g.renderer?.debugMode ? 1 : 0,
      chunkCache: g.chunks ? {
        chunks: g.chunks.chunks.size,
        dirtyQueue: g.chunks.dirtyQueue.length,
        staleSentinels: [...g.chunks.chunks.values()].filter((v) => v === undefined).length,
        maxChunks: (g.chunks.constructor as { MAX_CHUNKS?: number }).MAX_CHUNKS ?? -1,
        gfxQuality: gfxQuality.value,
        lastFlushMs: +g.chunks.lastFlushMs.toFixed(2),
        lastFlushCount: g.chunks.lastFlushCount,
      } : null,
      minimapDirtyChunks: g.renderer?.minimap?.dirtyChunks?.size ?? 0,
      // 资产健康(2026-08-13 运行期防线):失败的 vanilla/UI 贴图(404 终态)与
      // vui 键失配一目了然——此前 NPC_Head 40 个 404/全屏地图键失配这类 bug
      // 只能靠翻网络面板发现
      assetHealth: g.atlas ? {
        failedVImages: g.atlas.failedVImages().length,
        failedVImagesSample: g.atlas.failedVImages().slice(0, 10),
        failedUiImages: g.atlas.failedUiImages().length,
        vuiMissKeys: g.atlas.vuiMissKeys().slice(0, 10),
        vuiFallbackMisses: g.atlas.vuiFallbackMisses().length,
      } : null,
      subsystems: {
        waterfall: optionalDebugState(g.renderer?.waterfalls ?? null),
        liquids: liquidDebugState(),
      },
    },
    lighting: g.lighting ? {
      rx: g.lighting.rx, ry: g.lighting.ry, rw: g.lighting.rw, rh: g.lighting.rh,
      dirty: g.lighting.dirty ? 1 : 0,
      liquidDirty: g.lighting.liquidDirty ? 1 : 0,
      heldLight: g.lighting.heldLight
        ? { tx: g.lighting.heldLight.tx, ty: g.lighting.heldLight.ty,
          r: +g.lighting.heldLight.r.toFixed(3), g: +g.lighting.heldLight.g.toFixed(3), b: +g.lighting.heldLight.b.toFixed(3) }
        : null,
      buffLights: g.lighting.buffLights.map((L) => ({ tx: L.tx, ty: L.ty, r: +L.r.toFixed(3), g: +L.g.toFixed(3), b: +L.b.toFixed(3) })),
      perFrameCount: g.lighting.perFrameCount ?? 0,
      // 可疑格采样（区域外 lightAt 返回 0 —— 与 rx/ry/rw/rh 合读可判定"光照全黑"是否越区）
      samples: {
        camera: cam ? lightSample(g.lighting, Math.floor(cam.x / TILE), Math.floor(cam.y / TILE)) : null,
        player: p ? lightSample(g.lighting, Math.floor(p.cx / TILE), Math.floor(p.cy / TILE)) : null,
      },
    } : null,
    entities: {
      counts: entityCounts,
      list: entityList,
      enemies: enemies.map(enemyRecord),
    },
    player,
    systems: {
      mining: snap.mining ?? null,
      swing: snap.swing ?? null,
      hitTiles: { size: (snap.hitTilesSize as number) ?? 0, top: hitTop },
      smartCursor: g.smartCursor ? {
        wanted: g.smartCursor.wanted ? 1 : 0,
        showing: g.smartCursor.showing ? 1 : 0,
        x: g.smartCursor.x, y: g.smartCursor.y,
        lockDir: g.smartCursor.lockedDirection ? { x: g.smartCursor.lockedDirection.x, y: g.smartCursor.lockedDirection.y } : null,
      } : null,
      smartSelect: g.smartSelect ? { strategy: g.smartSelect.strategy, slot: g.smartSelect.slot } : null,
      wiring: wiring ? {
        mechActive: wiring.activeMechCount(),
        mech: wiring.mechDump(),
        teleportPairs: wiring.teleportPairs(),
      } : null,
      pylons: (g.pylons ?? []).map((y) => [y.x, y.y, y.type] as [number, number, number]),
      furnitureItems: w?.furnitureItems ? {
        count: w.furnitureItems.length,
        sample: w.furnitureItems.slice(0, FURNITURE_SAMPLE_N).map((r) => [r.x, r.y, r.kind, r.slots.length] as [number, number, string, number]),
      } : null,
      signs: w?.signs ? { count: w.signs.length } : null,
      invasionWarn: snap.invasionWarn ?? 0,
      tickCount: snap.tickCount ?? 0,
      enemySpawnEnabled: g.enemySpawnEnabled ? 1 : 0,
      forceShowWires: g.forceShowWires ? 1 : 0,
      assetCache: assetCacheState(),  // SW 资产预载(生产构建;enabled/version/done/total/phase)
    },
    perf: {
      fps: g.fps ?? null,
      frameDtMs: (snap.frameDtMs as number[] | undefined) ?? [],
      jsHeapMB: typeof performance !== 'undefined' && (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        ? +(((performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize) / 1048576).toFixed(1)
        : null,
      entitiesTotal: entityCounts
        ? entityCounts.enemies + entityCounts.drops + entityCounts.npcs + entityCounts.projectiles + entityCounts.critters + entityCounts.props
        : 0,
      hitTilesSize: (snap.hitTilesSize as number) ?? 0,
      lightingPerFrame: g.lighting?.perFrameCount ?? 0,
    },
    shot,
  };
}

// ================= 下载器（浏览器侧） =================

export interface DebugReportDownloadResult {
  report: Record<string, unknown>;
  filename: string;
  triggered: boolean;
}

/** 收集 + 触发浏览器下载；同时把 report 挂到 window.__swDebugReport（探针页内取，不依赖下载） */
export function downloadDebugReport(game: Game, opts: DebugReportOptions = {}): DebugReportDownloadResult {
  const report = collectDebugReport(game, opts);
  const world = (report.world as { name?: string } | null)?.name ?? 'world';
  const filename = `debug-report-${world.replace(/\s+/g, '_')}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  if (typeof window !== 'undefined') {
    (window as unknown as { __swDebugReport?: unknown }).__swDebugReport = report;
  }
  let triggered = false;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof Blob !== 'undefined') {
    try {
      const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      triggered = true;
    } catch {
      triggered = false;
    }
  }
  return { report, filename, triggered };
}
