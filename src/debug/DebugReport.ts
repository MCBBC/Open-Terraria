// F5 一键调试报告提取器：collectDebugReport 把当前 Game 运行时态打包为机器优先 JSON。
// 格式约定（外部约定，报告本身零散文）：
//   - 枚举一律原始数值 id（sheet/方块/物品/buff/事件 wave）
//   - 同构数据一律 [[k, v], ...] 元组数组（直方图/buff/非空槽位）
//   - 区域转储 = 行 RLE 串：cell = "sheet:fx:fy:wall:liquid"，空格记 "0"，连续相同 cell 记 "cell*runLen"，行内以 ";" 分隔
// 收集全程防御式访问（缺字段 → null/0），保证 node 单测无 DOM 样本也能跑通。
import { TILE_DEFS } from '../data/tiles';
import { ITEM_DEFS } from '../data/items';
import { TILE } from '../core/constants';
import type { Game } from '../core/Game';
import type { Enemy } from '../entities/Enemy';

export const DEBUG_REPORT_SCHEMA_VERSION = 1;

/** 截图 dataURL 上限：base64 长度换算字节 ≈ len*3/4，超过即省略（置 null + omitted 标记） */
const SHOT_BASE64_LIMIT = Math.ceil((8 * 1024 * 1024) * 4 / 3);
const HIST_TOP_N = 50;
const HIT_TILES_TOP_N = 10;
const FURNITURE_SAMPLE_N = 5;
/** 小地图截图裁剪半径（tile）：全图 canvas 巨大，只截玩家周围局部 */
const MINIMAP_CROP_R = 100;

export interface SwErrorRecord { t: number; kind: number; msg: string; stack: string | null }

export interface DebugReportOptions {
  /** 截图段（默认 true）；无 DOM 环境自动降级为 null */
  screenshot?: boolean;
  /** 游玩时长 ms（mainFlow.playStartNow；缺省由报告时间戳兜底 0） */
  playTimeMs?: number;
  /** 错误 ring 注入（单测用；缺省读 globalThis.__swErrors） */
  errors?: SwErrorRecord[];
  /** __swGame 挂载计数注入（单测用；缺省读 globalThis.__swInstanceCount） */
  instanceCount?: number;
}

export interface RleAreaDump { x0: number; y0: number; w: number; h: number; rows: string[] }

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
  return { x0: bx0, y0: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1, rows };
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

  // ---- tiles：直方图 + 区域转储 ----
  let histType: Array<[number, number]> = [];
  let histSheet: Array<[number, number]> = [];
  let areaCam: RleAreaDump | null = null;
  let areaPlayer: RleAreaDump | null = null;
  if (st) {
    const byType = new Map<number, number>();
    const bySheet = new Map<number, number>();
    const typeArr = st.type;
    for (let i = 0; i < typeArr.length; i++) {
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
    } : null,
    render: {
      camera: cam ? {
        x: Math.round(cam.x), y: Math.round(cam.y),
        zoom: +cam.zoom.toFixed(3), zoomTarget: +cam.zoomTarget.toFixed(3),
        viewW: cam.viewW, viewH: cam.viewH,
      } : null,
      fullMapOpen: g.renderer?.fullMap?.open ? 1 : 0,
      debugMode: g.renderer?.debugMode ? 1 : 0,
      chunkCache: g.chunks ? {
        chunks: g.chunks.chunks.size,
        dirtyQueue: g.chunks.dirtyQueue.length,
        staleSentinels: [...g.chunks.chunks.values()].filter((v) => v === undefined).length,
        maxChunks: (g.chunks.constructor as { MAX_CHUNKS?: number }).MAX_CHUNKS ?? -1,
        lastFlushMs: +g.chunks.lastFlushMs.toFixed(2),
        lastFlushCount: g.chunks.lastFlushCount,
      } : null,
      minimapDirtyChunks: g.renderer?.minimap?.dirtyChunks?.size ?? 0,
    },
    lighting: g.lighting ? {
      rx: g.lighting.rx, ry: g.lighting.ry, rw: g.lighting.rw, rh: g.lighting.rh,
      dirty: g.lighting.dirty ? 1 : 0,
      liquidDirty: g.lighting.liquidDirty ? 1 : 0,
      heldLight: g.lighting.heldLight
        ? { tx: g.lighting.heldLight.tx, ty: g.lighting.heldLight.ty,
          r: +g.lighting.heldLight.r.toFixed(3), g: +g.lighting.heldLight.g.toFixed(3), b: +g.lighting.heldLight.b.toFixed(3) }
        : null,
      perFrameCount: g.lighting.perFrameCount ?? 0,
    } : null,
    entities: {
      counts: entityCounts,
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
