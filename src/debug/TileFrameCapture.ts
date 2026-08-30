// 动画帧捕获系统（2026-08-30）：为"锯木机/固化机错帧、烟囱闪没、壁炉闪烁"
// 类问题提供全量证据。三层结构：
//   ① 被动聚合（恒开）——所有动画相关绘制按 sheet 计数，att 段记录生效表值
//     （RATE/PITCH/FRAMES/素材高宽），最小成本；短按 F5 报告也带出；
//   ② 异常环形缓冲——绘制时发生的"钳位归零/负向越界/取帧落空回退(0,0)"等
//     事件带现场（tick/格坐标/存储帧/源矩形前后态）入环，按去重键折叠计数，
//     这是"一帧平铺第一格"类故障的直接指纹（vframeAt 落空回退正是其机制根）;
//   ③ 录制窗全量（长按 F5 开窗）——快照环（每 20 anim-tick 一份：视野内每个
//     动画 sheet 的当前帧号+相机）、重烘账本（advanceAnim 每 sheet 触发计数）、
//     缩放 JPEG 截图环（每 40 tick，视口证据）、四支 YOffset 纯函数逐次调用
//     记录（双加/重复应用当场现形）。
// 导出经行为录制 dump.tileFrames 合并下载，或 window.__swTileCap.export()
// 手取。停用零分支成本：note* 全部原始参数传参，调用点仅一个函数调用。

/** 表字段三联（生效值 / 表值缺失标记 NaN→undefined 序列化时省略） */
export interface SheetStat {
  /** 绘制次数 */
  n: number;
  /** 生效 rate/pitch/frames（画面真实使用者；pitch 默认 38） */
  rate: number; pitch: number; frames: number;
  /** 素材尺寸（vmeta 宽×行高估算；0=未就绪） */
  imgW: number; imgH: number;
  /** 计数器 */
  clamped: number; fallback: number; oob: number;
  /** 采到的最远源 y 与最小 y（判断越界吃透明带的仪表） */
  minSy: number; maxSy: number;
  /** 该 sheet 本次会话出现过的格子样本（≤12 个，隔离重复键 [x,y]） */
  cells: Array<[number, number]>;
}

export interface AnomEvent {
  t: number;                        // tileAnim.tick
  kind: string;                     // clamp/neg/recon/fallback/yoff-dup
  sheet: number;
  x: number; y: number;             // 格坐标（yoff 类无坐标则 -1）
  fx: number; fy: number;           // 存储帧偏移
  detail: string;                   // 现场数值摘要（前后态）
}

export interface SnapShot {
  t: number;
  cam: [number, number];            // 视野中心近似
  /** [sheet, 当前帧号, 可见实例数] 三元组数组 */
  f: Array<[number, number, number]>;
}

export interface BakeEntry { n: number; lastT: number }

const MAX_ANOM_RING = 900;
const MAX_SNAP_RING = 480;
const MAX_SHOT_RING = 60;
const SNAP_EVERY = 20;              // anim-tick 周期（≈每 1/3 秒@60fps）
const SHOT_EVERY = 40;
const MAX_SAMPLES_PER_KEY = 3;      // 同 kind+sheet+fx+fy 折叠上限：首次+末次

/** 去重键→(首事件, 末事件, 计数) */
interface DupFold { first: AnomEvent; last: AnomEvent; n: number }

class TileFrameCapture {
  /** 录制窗开关（false 时只有被动聚合与异常环在写） */
  recording = false;
  private startedT = -1;

  /** sheet → 聚合统计 */
  readonly sheets = new Map<number, SheetStat>();
  /** 去重折叠的异常（插入序保留） */
  private anomMap = new Map<string, DupFold>();
  /** 快照环（线性数组尾部淘汰：数量小，直接 shift 即可） */
  readonly snaps: SnapShot[] = [];
  /** 截图环（JPEG dataURL） */
  readonly shots: string[] = [];
  /** 重烘账本：sheet → 计数；墙动画用 1e6+wId 键避免混流 */
  readonly bakes = new Map<number, BakeEntry>();
  /** 异常发生当场的格像素小样（16×16 PNG dataURL，≤48 张） */
  readonly px: Array<{ t: number; sheet: number; x: number; y: number; url: string }> = [];
  private pxCanvas: HTMLCanvasElement | null = null;

  /** YOffset 纯函数逐次记录（防超量：只统计被叠函数族 215/207/405/406/专属）
   *  键=sheet:fy(±fx 门) → {n, firstOff, lastOff, firstT} */
  readonly yoffCalls = new Map<string, { n: number; offs: Set<number>; lastT: number }>();

  private snapAccum = new Map<number, { idx: number; n: number }>();
  /** 快照窗内的实例格（sheet→格子 packed x*65536+y 集合） */
  private snapCells = new Map<number, Set<number>>();
  /** 生效表引用注入（由渲染层挂接，模块自身不 import 渲染端防环） */
  tblRate: Record<number, number> = {};
  tblPitch: Record<number, number> = {};
  tblFrames: Record<number, number> = {};

  // ---- 绘制侧统一记账（VanillaTiler 三路汇入；零分配主路径） ----
  /** sy0/reqExtra=偏移前源 y 与请求偏移；usedExtra/clampMask=钳位后实况 */
  noteDraw(pathTag: string, sheet: number, x: number, y: number, fx: number, fy: number,
    sx0: number, sy0: number, sw: number, sh: number,
    reqExtra: number, usedExtra: number, clampMask: number, imgW: number, imgH: number): void {
    const pitch = this.tblPitch[sheet] ?? 38;
    const s = this.stat(sheet, this.tblRate[sheet] ?? 0, pitch,
      this.tblFrames[sheet] ?? Math.floor(imgH / pitch || 1), imgW, imgH);
    this.trackSy(s, sy0 + reqExtra);
    this.seeCell(s, x, y);
    if (clampMask & 1) {
      s.clamped++;
      if (!this.recording && this.anomMap.size >= 200) return;
      this.anom('clamp', sheet, x, y, fx, fy,
        `${pathTag} req+${reqExtra}→0 sy${sy0}+${sw}x${sh} imgh${imgH}`);
    }
    if (clampMask & 2) {
      s.clamped++;
      this.anom('neg', sheet, x, y, fx, fy, `${pathTag} neg ${sy0}+${reqExtra}`);
    }
    if (clampMask & 16) {
      // recon 取帧落空回退(0,0)——"整物被第一格平铺"的直接机制指纹
      s.fallback++;
      const imghOk = imgH > 0 && sy0 + Math.max(1, reqExtra) >= imgH;
      if (imghOk) s.oob++;
      this.anom('fallback', sheet, x, y, fx, fy,
        `${pathTag} ofx${sx0} ofy${sy0}+e${reqExtra} imgh${imgH} imgW${imgW} ${imghOk ? 'OOB!' : '表缺?'}`);
    }
    // 快照窗累积（仅录制时）
    if (this.recording) {
      let set = this.snapCells.get(sheet);
      if (!set) { set = new Set(); this.snapCells.set(sheet, set); }
      if (set.size < 6000) set.add(x * 65536 + y);
      const idx = pitch > 0 && usedExtra > 0 ? Math.round(usedExtra / pitch) : 0;
      this.feedFrameIdx(sheet, idx, set.size);
    }
  }

  /** 快照节拍要把窗内实例清零（snapTick 已出图） */
  clearSnapWindow(): void { this.snapCells.clear(); }

  // ---- 绘制尾部（drawAdjust 后）记账：第四动画应用点（烟囱悬案曾在此盲飞）----
  /** skip=true = 尾部越界守卫静默丢格 → 永久计入 oob/anom（不再只靠 warn-once） */
  noteTail(sheet: number, x: number, y: number, fx: number, fy: number,
    syBefore: number, syAfter: number, overrode: boolean, skip: boolean,
    imgW: number, imgH: number): void {
    const pitch = this.tblPitch[sheet] ?? 38;
    const s = this.stat(sheet, this.tblRate[sheet] ?? 0, pitch,
      this.tblFrames[sheet] ?? Math.floor(imgH / pitch || 1), imgW, imgH);
    if (skip) {
      s.oob++;
      this.anom('tail-skip', sheet, x, y, fx, fy,
        `tail sy${syBefore}→${syAfter}${overrode ? '(override)' : ''} 越界弃画`);
      return;
    }
    this.trackSy(s, syAfter);
    if (overrode) {
      // 绝对覆写会丢弃站点侧偏移——差值即"双钟漂移"仪表
      const delta = syAfter - syBefore;
      if (delta !== 0 && Math.abs(delta) > 4 * (pitch + 38))
        this.anom('tail-override', sheet, x, y, fx, fy, `Δ${delta}`);
    }
  }

  // ---- 被动聚合入口（全部零分配快速路径） ----
  stat(sheet: number, rate: number, pitch: number, frames: number, imgW: number, imgH: number): SheetStat {
    let s = this.sheets.get(sheet);
    if (!s) {
      s = { n: 0, rate, pitch, frames, imgW, imgH, clamped: 0, fallback: 0, oob: 0, minSy: 1e9, maxSy: -1e9, cells: [] };
      this.sheets.set(sheet, s);
    }
    s.n++;
    return s;
  }

  seeCell(s: SheetStat, x: number, y: number): void {
    if (s.cells.length >= 12) return;
    for (const [ax, ay] of s.cells) if (ax === x && ay === y) return;
    s.cells.push([x, y]);
  }

  trackSy(s: SheetStat, sy: number): void {
    if (sy < s.minSy) s.minSy = sy;
    if (sy > s.maxSy) s.maxSy = sy;
  }

  /** 异常上报（kind 相同+sheet+fx+fy 折叠为 first/last+n） */
  anom(kind: string, sheet: number, x: number, y: number, fx: number, fy: number, detail: string): void {
    const ev: AnomEvent = { t: tileTickRef(), kind, sheet, x, y, fx, fy, detail };
    const key = `${kind}|${sheet}|${fx}|${fy}`;
    const dup = this.anomMap.get(key);
    if (dup) { dup.last = ev; dup.n++; return; }
    if (this.anomMap.size >= 200) return;   // 键种类封顶，防冷门键洪水
    this.anomMap.set(key, { first: ev, last: ev, n: 1 });
    // 新种类的首个事件同时触发像素小样留证
    this.pixelSample(sheet, x, y);
  }

  /** 出异常现场的 16×16 格像素小样（PNG ≤300 字节，总量可控） */
  private pixelSample(sheet: number, tx: number, ty: number): void {
    if (this.px.length >= 48 || !cvsGetter()) return;
    try {
      const cv = cvsGetter()!;
      const zoom = zoomGetter() || 1;
      if (!this.pxCanvas) this.pxCanvas = document.createElement('canvas');
      const c = this.pxCanvas;
      c.width = Math.ceil(17 * zoom); c.height = Math.ceil(17 * zoom);
      const cx = c.getContext('2d');
      if (!cx) return;
      const camC = camGetter();
      if (!camC) return;
      // 相机注入的是视野中心（Camera.x/y）；左上 = 中心 − 可视半宽高
      const camL = camC[0] - cv.width / (2 * zoom);
      const camT = camC[1] - cv.height / (2 * zoom);
      const sx = Math.round((tx * TILE_PX - camL) * zoom);
      const sy = Math.round((ty * TILE_PX - camT) * zoom);
      cx.drawImage(cv, sx, sy, c.width, c.height, 0, 0, c.width, c.height);
      this.px.push({ t: tileTickRef(), sheet, x: tx, y: ty, url: c.toDataURL('image/png') });
    } catch { /* 像素读取失败不影响主流程 */ }
  }

  /** 渲染端把可见 sheet 的当前帧号喂进来（snapTick 内聚合，供快照出图） */
  feedFrameIdx(sheet: number, idx: number, instN: number): void {
    const acc = this.snapAccum.get(sheet);
    if (acc) { acc.idx = idx; acc.n = Math.max(acc.n, instN); }
    else this.snapAccum.set(sheet, { idx, n: instN });
  }

  /** 时钟推进钩（ChunkCache.advanceAnim 尾部调用）：快照/截图节奏控制 */
  snapTick(cx: number, cy: number): void {
    if (!this.recording) { this.snapAccum.clear(); this.snapCells.clear(); return; }
    const t = tileTickRef();
    if (t % SNAP_EVERY !== 0) return;
    if (!this.snapAccum.size) return;
    const f: Array<[number, number, number]> = [];
    for (const [sheet, acc] of this.snapAccum) f.push([sheet, acc.idx, acc.n]);
    this.snaps.push({ t, cam: [Math.round(cx), Math.round(cy)], f });
    if (this.snaps.length > MAX_SNAP_RING) this.snaps.shift();
    this.shot();
    this.snapAccum.clear();
    this.clearSnapWindow();
  }

  /** 定期截图（缩放 0.5 JPEG q0.55，单张 ≈30-50KB） */
  private shot(): void {
    if (!cvsGetter()) return;
    try {
      const src = cvsGetter()!;
      const w = Math.max(1, Math.floor(src.width / 2)), h = Math.max(1, Math.floor(src.height / 2));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      if (!cx) return;
      cx.drawImage(src, 0, 0, w, h);
      this.shots.push(c.toDataURL('image/jpeg', 0.55));
      if (this.shots.length > MAX_SHOT_RING) this.shots.shift();
    } catch { /* 截图失败静默 */ }
  }

  markBake(key: number, n = 1): void {
    const e = this.bakes.get(key);
    if (e) { e.n += n; e.lastT = tileTickRef(); }
    else this.bakes.set(key, { n, lastT: tileTickRef() });
  }

  /** YOffset 纯函数逐次审计（调用方在算完 offset 后喂）：
   *  键含输入帧参数——同一入参被多次调用且 offset 不同即"重复应用"实锤 */
  yoff(fnTag: string, inputKey: string, off: number): void {
    const key = `${fnTag}:${inputKey}`;
    let e = this.yoffCalls.get(key);
    if (!e) {
      if (this.yoffCalls.size < 400) this.yoffCalls.set(key, e = { n: 0, offs: new Set(), lastT: 0 });
      else return;
    }
    e.n++; e.lastT = tileTickRef();
    e.offs.add(off);
  }

  start(): void {
    this.recording = true;
    this.startedT = tileTickRef();
  }

  /** 结束并返回导出对象（收整所有环形） */
  exportAndStop(): TileCapExport {
    const this2 = this;
    const anoms: Array<{ first: AnomEvent; last: AnomEvent; n: number }> = [];
    for (const [, d] of this2.anomMap) anoms.push(d);
    const sheets: Record<number, SheetStat> = {};
    for (const [k, s] of this2.sheets) sheets[k] = s;
    const bakes: Record<string, { n: number; lastT: number }> = {};
    for (const [k, e] of this2.bakes) bakes[k >= 1e6 ? `w${k - 1e6}` : String(k)] = e;
    const yoff: Record<string, { n: number; offs: number[]; lastT: number }> = {};
    for (const [k, e] of this2.yoffCalls) yoff[k] = { n: e.n, offs: [...e.offs].sort((a, b) => a - b), lastT: e.lastT };
    const out: TileCapExport = {
      startT: this.startedT, stopT: tileTickRef(),
      recordingActive: true,
      sheets, anoms, snaps: [...this.snaps], shots: [...this.shots], bakes, yoff, px: [...this.px],
    };
    // 关窗后被动层继续（但清重型件防旧证据漂移误导）
    this.recording = false;
    this.startedT = -1;
    return out;
  }

  /** 未开录时的轻量导出（短按 F5 报告）：无 snaps/shots，聚合照给 */
  exportLight(): Partial<TileCapExport> {
    const sheets: Record<number, SheetStat> = {};
    for (const [k, s] of this.sheets) sheets[k] = s;
    const anoms: Array<{ first: AnomEvent; last: AnomEvent; n: number }> = [];
    for (const [, d] of this.anomMap) anoms.push(d);
    return { recordingActive: false, sheets, anoms };
  }
}

export interface TileCapExport {
  startT: number; stopT: number;
  recordingActive: boolean;
  sheets: Record<number, SheetStat>;
  anoms: Array<{ first: AnomEvent; last: AnomEvent; n: number }>;
  snaps: SnapShot[];
  shots: string[];
  bakes: Record<string, { n: number; lastT: number }>;
  yoff: Record<string, { n: number; offs: number[]; lastT: number }>;
  px: Array<{ t: number; sheet: number; x: number; y: number; url: string }>;
}

// ---- 外部注入（避免反向依赖渲染层；main.ts 启动时挂接）----
type Getter<T> = () => T | null;
let tileTickRef = (): number => 0;
let cvsGetter: Getter<HTMLCanvasElement> = (): HTMLCanvasElement | null => null;
let camGetter: Getter<[number, number]> = (): [number, number] | null => null;
let zoomGetter = (): number => 0;
const TILE_PX = 16;

/** 初始化外部钩子（幂等；须先于游戏主循环） */
export function initTileFrameCapture(hooks: {
  tick: () => number;
  canvas: Getter<HTMLCanvasElement>;
  camera: Getter<[number, number]>;   // 世界像素左上角
  zoom: () => number;
}, tables?: { rate: Record<number, number>; pitch: Record<number, number>; frames: Record<number, number> }): void {
  tileTickRef = hooks.tick;
  cvsGetter = hooks.canvas;
  camGetter = hooks.camera;
  zoomGetter = hooks.zoom;
  if (tables) {
    tileFrameCapture.tblRate = tables.rate;
    tileFrameCapture.tblPitch = tables.pitch;
    tileFrameCapture.tblFrames = tables.frames;
  }
}

export const tileFrameCapture = new TileFrameCapture();

/** 给调用点的极简助手：gated by recording（被动聚合由各调用方直接 stat()） */
export { };
