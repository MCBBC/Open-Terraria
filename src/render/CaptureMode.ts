// M6 拍照模式（F4）：Terraria.Graphics.Capture 1:1 移植（5 文件全量对位）。
//   CaptureInterface.cs（1616L）——三模式界面 + 9 按钮组 + 锁屏快照状态机
//   CaptureCamera.cs（466L）——126 格分块离屏渲染 + ≤4096 缩放出图
//   CaptureSettings.cs / CaptureBiome.cs ——数据层
//   入口链：F4（PlayerInput.cs:1926 默认）→ main.ts 派发 → Renderer.render
//   尾部 captureMode.frame()（= 原版 DrawInterface_10_CheckCaptureManager
//   Main.cs:45584-45593：激活时截断后续界面层 + CaptureInterface.Update/Draw）。
//
// web 适配点（逐条注明，其余全部 1:1）：
//   ① PNG 保存：Captures/<名>.png → canvas.toBlob + a.download（浏览器无文件
//      系统目录；UseScaling=false 的分块文件"<名>/x-y.png" → 下载名"<名> x-y.png"）
//   ② GlobalTimerPaused（CaptureCamera.Capture :110 / FinishCapture :431）：
//      截图期间世界模拟冻结——本仓无法从渲染层触及 Game 模拟循环，不冻结
//      （偏差登记：黑屏 1-2s 内世界继续动，出图内容可能与按下瞬间差 1-2s）
//   ③ CaptureBiome 的渲染端强制（水色 liquidAlpha/背景 UpdateBGVisibility/
//      瓦色 TileColorStyle，DrawCapture :56155-56240）：本仓渲染器从现场 scene
//      推导水色/背景，无强制注入口——自动档（BiomeChoiceIndex=-1）行为等价
//      （原版 GetBiomeByLocation/ByWater 取的也是玩家现场群系）；手动档仅
//      保存选择状态（数据层完整，消费缺口登记）
//   ④ MapIcon_0/4 与 Cd 贴图未入素材提取（vanilla-ui 无对应键）：按钮 5 图标
//      与禁用态 CD 罩用矢量回退
//   ⑤ ReverseGravitySupport（:145 等）：原版 gravDir=-1 时屏幕空间垂直翻转，
//      本仓相机不翻屏 → 恒等映射（结构保留，翻转语义不适用）
//   ⑥ 声音：menuOpen(10)/menuClose(11)/menuTick(12) + 快门 Camera(40)（
//      SoundID.cs:101 `public const int Camera = 40` → LegacySoundPlayer.cs:1362
//      case 40 Camera.wav；素材已提取，playWavFile('Camera') 命中真声）
//   ⑦ 截图重渲通道的 HUD 隔离：Renderer._capturePass 门（见 Renderer 集成注释）
//      ——世界尾段特效（月光君红脉冲/白闪/遮屏）在极罕见的进行中状态会烘进
//      PNG；原版 DrawCapture 不含它们（偏差登记，均罕见状态门控）。
//      尘埃/gore 为模块级全局池（drawVanillaDustPass/liveGorePieces）,无
//      IncludeEntities 关断门——会随图烘入（原版 DrawCapture 不画常规尘,
//      仅 type 76 沙暴尘;偏差登记）
import { Camera } from './Camera';
import type { World, Clock } from '../world/World';
import type { ChunkCache } from './ChunkCache';
import type { Player } from '../entities/Player';
import type { Entity } from '../entities/Entity';
import type { Particle, DamageNumber, HoverTarget, Renderer } from './Renderer';
import type { FlickerClock } from '../lighting/SkyColor';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import { options } from '../core/Options';
import { mobileUiScale } from '../ui/MobileControls';
import { Lang } from '../i18n/Lang';
import { UISfx } from '../vui/UISfx';
import type { LeashedEntityManager } from '../entities/LeashedCritter';
import type { SceneFlags } from '../world/SceneMetrics';

// =====================================================================
// CaptureSettings.cs 1:1
// =====================================================================

/** 选区（tile 坐标，含端点；GetArea :965-972 产物形状） */
export interface TileArea { x: number; y: number; w: number; h: number }

/** CaptureSettings 实例面（:3-28）。OutputName = 本地时间 "Capture YYYY-MM-DD HH_MM_SS"（:24-28） */
export interface CaptureSettingsInst {
  area: TileArea;
  useScaling: boolean;
  outputName: string;
  captureEntities: boolean;
  biome: CaptureBiomeInst;
  captureMech: boolean;
  captureBackground: boolean;
  cameraSpaceEffects: boolean;
}

export function newOutputName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Capture ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} `
    + `${p(now.getHours())}_${p(now.getMinutes())}_${p(now.getSeconds())}`;
}

// =====================================================================
// CaptureBiome.cs 1:1（数据层；渲染端强制消费见文件头③）
// =====================================================================

export type TileColorStyle = 'Normal' | 'Jungle' | 'Crimson' | 'Corrupt' | 'Mushroom';

export interface CaptureBiomeInst { backgroundIndex: number; waterStyle: number; tileColor: TileColorStyle }

const biome = (bg: number, water: number, tc: TileColorStyle = 'Normal'): CaptureBiomeInst =>
  ({ backgroundIndex: bg, waterStyle: water, tileColor: tc });

/** Styles 表（:24-55） */
export const CAPTURE_BIOMES = {
  Purity: biome(0, 0), Purity2: biome(10, 0), Purity3: biome(11, 0), Purity4: biome(12, 0),
  Corruption: biome(1, 2, 'Corrupt'), Jungle: biome(3, 3, 'Jungle'), Hallow: biome(6, 4),
  Snow: biome(7, 5), Desert: biome(2, 6), DirtLayer: biome(0, 7), RockLayer: biome(0, 8),
  BloodMoon: biome(0, 9), Crimson: biome(8, 10, 'Crimson'), UndergroundDesert: biome(2, 12),
  Ocean: biome(4, 13), Mushroom: biome(9, 7, 'Mushroom'),
} as const;

/** GetPurityForPlayer 的现场输入（GetBiomeByLocation/ByWater 同束） */
export interface BiomeLocInput {
  /** GetPreferredBGStyleForPlayer 档值 0-14,-1 = 无 */
  preferredBg?: number;
  /** Main.treeX[0..2] 三段世界树线（GetPurityForPlayer :203-219） */
  treeX?: [number, number, number];
  playerTileX?: number;
  /** 现场水色 id（CalculateWaterStyle → GetBiomeByWater :153-165）,-1 跳过 */
  waterStyle?: number;
}

/** BiomesByWaterStyle（:76-93,非空槽） */
const BIOMES_BY_WATER: Record<number, CaptureBiomeInst> = {
  2: CAPTURE_BIOMES.Corruption, 3: CAPTURE_BIOMES.Jungle, 4: CAPTURE_BIOMES.Hallow,
  5: CAPTURE_BIOMES.Snow, 6: CAPTURE_BIOMES.Desert, 7: CAPTURE_BIOMES.DirtLayer,
  8: CAPTURE_BIOMES.RockLayer, 9: CAPTURE_BIOMES.BloodMoon, 10: CAPTURE_BIOMES.Crimson,
  12: CAPTURE_BIOMES.UndergroundDesert, 13: CAPTURE_BIOMES.Ocean, 14: CAPTURE_BIOMES.Mushroom,
};

/** GetCaptureBiome（:108-151）：choice 1..12 手动档查表;其余（-1 自动）走
 *  现场 loc（缺省 → DefaultPurity 兜底,与原版三连兜底末位一致） */
export function getCaptureBiome(choice: number, loc?: BiomeLocInput): CaptureBiomeInst {
  switch (choice) {
    case 2: return CAPTURE_BIOMES.Corruption;
    case 3: return CAPTURE_BIOMES.Jungle;
    case 4: return CAPTURE_BIOMES.Hallow;
    case 5: return CAPTURE_BIOMES.Snow;
    case 6: return CAPTURE_BIOMES.Desert;
    case 7: return CAPTURE_BIOMES.DirtLayer;
    case 8: return CAPTURE_BIOMES.RockLayer;
    case 9: return CAPTURE_BIOMES.Crimson;
    case 10: return CAPTURE_BIOMES.UndergroundDesert;
    case 11: return CAPTURE_BIOMES.Ocean;
    case 12: return CAPTURE_BIOMES.Mushroom;
  }
  if (!loc) return CAPTURE_BIOMES.Purity;   // choice==1（GetPurityForPlayer）无树线输入同落此
  // GetBiomeByLocation（:167-201）
  switch (loc.preferredBg ?? -1) {
    case 0: return CAPTURE_BIOMES.Purity;
    case 10: return CAPTURE_BIOMES.Purity2;
    case 11: return CAPTURE_BIOMES.Purity3;
    case 12: return CAPTURE_BIOMES.Purity4;
    case 1: return CAPTURE_BIOMES.Corruption;
    case 2: case 5: case 13: case 14: return CAPTURE_BIOMES.Desert;
    case 3: return CAPTURE_BIOMES.Jungle;
    case 4: return CAPTURE_BIOMES.Ocean;
    case 6: return CAPTURE_BIOMES.Hallow;
    case 7: return CAPTURE_BIOMES.Snow;
    case 8: return CAPTURE_BIOMES.Crimson;
    case 9: return CAPTURE_BIOMES.Mushroom;
  }
  // GetBiomeByWater（:153-165）
  const bw = loc.waterStyle != null && loc.waterStyle >= 0 ? BIOMES_BY_WATER[loc.waterStyle] : undefined;
  if (bw) return bw;
  // GetPurityForPlayer（:203-219）：玩家 X 对三段树线取段
  const tx = loc.playerTileX ?? 0;
  const t = loc.treeX;
  if (!t) return CAPTURE_BIOMES.Purity;
  if (tx < t[0]) return CAPTURE_BIOMES.Purity;
  if (tx < t[1]) return CAPTURE_BIOMES.Purity2;
  if (tx < t[2]) return CAPTURE_BIOMES.Purity3;
  return CAPTURE_BIOMES.Purity4;
}

// =====================================================================
// 纯几何/规划助手（CaptureCamera._Capture :133-173 / GetArea / ConstraintPoints）
// =====================================================================

/** 手动群系档 → 合成场景旗（文件头③消费缺口补齐 2026-08-25：曾只存数据不
 *  渲染——设置格选了丛林/腐化等拍出来仍是现场群系）。从现场 scene 克隆后按
 *  选择覆写群系旗：背景样式机(preferredStyle)与水色推导(updateWaterStyle)读
 *  同一 scene,一次换装两链生效;水色精确值另由 Renderer.updateWaterStyle 的
 *  捕获直供兜底(DirtLayer/RockLayer/BloodMoon 的深度/昼夜派生链场景旗表达
 *  不了)。choice<0 = 自动档 → null(不换装,原版自动档同取现场群系)。 */
export function captureSceneOverride(choice: number, base: SceneFlags): SceneFlags | null {
  const s: SceneFlags = { ...base };
  const clear = () => {
    s.zoneCorrupt = false; s.zoneCrimson = false; s.zoneJungle = false;
    s.zoneSnow = false; s.zoneDesert = false; s.zoneHallow = false;
    s.zoneGlowshroom = false; s.zoneBeach = false; s.zoneUnderworldHeight = false;
    s.bloodMoonMonolith = false;
  };
  switch (choice) {
    case 0: case 1: clear(); break;                                   // Purity(森林)
    case 2: clear(); s.zoneCorrupt = true; break;                     // 腐化
    case 3: clear(); s.zoneJungle = true; break;                      // 丛林
    case 4: clear(); s.zoneHallow = true; break;                      // 神圣
    case 5: clear(); s.zoneSnow = true; break;                        // 雪原
    case 6: clear(); s.zoneDesert = true; break;                      // 地表沙漠
    case 7: clear(); s.belowSurface = true; break;                    // 土层(水色直供 7)
    case 8: clear(); s.belowSurface = true; break;                    // 岩层(水色直供 8)
    case 9: clear(); s.zoneCrimson = true; break;                     // 猩红
    case 10: clear(); s.zoneDesert = true; s.belowSurface = true; break; // 地下沙漠
    case 11: clear(); s.zoneBeach = true; break;                      // 海洋
    case 12: clear(); s.zoneGlowshroom = true; break;                 // 发光蘑菇
    default: return null;                                             // 自动档
  }
  return s;
}

/** GetArea（:965-972）：两角点 → 含端点矩形 */
export function getArea(ax: number, ay: number, bx: number, by: number): TileArea {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx) + 1, h: Math.abs(ay - by) + 1 };
}

/** PointWorldClamp（:1486-1504）：fluff=40 世界边距钳制（原地修改） */
export function constrainPoint(p: { x: number; y: number }, maxW: number, maxH: number, fluff = 40): void {
  if (p.x < fluff) p.x = fluff;
  if (p.x > maxW - 1 - fluff) p.x = maxW - 1 - fluff;
  if (p.y < fluff) p.y = fluff;
  if (p.y > maxH - 1 - fluff) p.y = maxH - 1 - fluff;
}

/** 缩放系数 num（:136-147）：UseScaling 时超 4096 等比缩到界内，恒 ≤1 */
export function scaleFactorFor(area: TileArea, useScaling: boolean): number {
  if (!useScaling) return 1;
  let num = 1;
  if (area.w * 16 > 4096) num = 4096 / (area.w * 16);
  if (area.h * 16 > 4096) num = Math.min(num, 4096 / (area.h * 16));
  return Math.min(1, num);
}

/** 输出图像尺寸（:148）：floor(num×像素) 钳 [1,4096] */
export function outputSizeFor(area: TileArea, useScaling: boolean): [number, number] {
  const num = scaleFactorFor(area, useScaling);
  const clamp = (v: number) => Math.max(1, Math.min(4096, v));
  return [clamp(Math.floor(num * area.w * 16)), clamp(Math.floor(num * area.h * 16))];
}

/** 一个待渲分块（CaptureChunk :19-29） */
export interface ChunkPlan {
  /** 世界 tile 视口（绝对坐标） */
  x: number; y: number; w: number; h: number;
  /** 输出图上的落位（:166-169：floor(num×相对像素)） */
  ox: number; oy: number; ow: number; oh: number;
}

/** 分块规划（_Capture :160-172）：126 步进 + 128 上限（相邻块 2 tile 重叠,
 *  后块覆写前块的重叠带——原版 DrawBytesToBuffer 同像素等值贴回语义） */
export function planChunks(area: TileArea, useScaling: boolean): ChunkPlan[] {
  const num = scaleFactorFor(area, useScaling);
  const out: ChunkPlan[] = [];
  for (let i = area.x; i < area.x + area.w; i += 126) {
    for (let j = area.y; j < area.y + area.h; j += 126) {
      const cw = Math.min(128, area.x + area.w - i);
      const ch = Math.min(128, area.y + area.h - j);
      out.push({
        x: i, y: j, w: cw, h: ch,
        ox: Math.floor(num * (i - area.x) * 16),
        oy: Math.floor(num * (j - area.y) * 16),
        ow: Math.floor(num * cw * 16),
        oh: Math.floor(num * ch * 16),
      });
    }
  }
  return out;
}

/** FullScreenArea（:1140-1159）：当前视野覆盖的 tile 域（QuickScreenshot 用）。
 *  原版 Camera.ScaledPosition/Size = 屏幕世界域（含 zoom 除算），此处由
 *  cam(x,y,zoom)+视口尺寸推导。 */
export function fullScreenAreaOf(
  cam: { x: number; y: number; zoom: number }, viewW: number, viewH: number,
): TileArea {
  const l = (cam.x - viewW / 2 / cam.zoom) / 16;
  const t = (cam.y - viewH / 2 / cam.zoom) / 16;
  const r = (cam.x + viewW / 2 / cam.zoom) / 16;
  const b = (cam.y + viewH / 2 / cam.zoom) / 16;
  const x0 = Math.ceil(l), y0 = Math.ceil(t), x1 = Math.floor(r), y1 = Math.floor(b);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 矩形包含（Rectangle.Contains 语义,StartCamera :1605 的 CameraSpaceEffects 判定） */
export function areaContains(outer: TileArea, inner: TileArea): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** 像素矩形（世界或屏幕空间） */
interface AreaPx { x: number; y: number; w: number; h: number }

/** 矩形相交（Rectangle.Intersect 语义：不相交 → 0 尺寸） */
function intersect(a: AreaPx, b: AreaPx): AreaPx {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

// =====================================================================
// 全屏地图坐标换算（GetMapCoords :1318-1471 的 web 适配版）
// =====================================================================

/** 本仓全屏地图变换（Renderer.drawFullMap :11020-11021 的映射）：
 *  cx0 = viewW/2 − W·zoom/2 + panX。地图内容无 10 tile 边距（原版变换带
 *  num4=10 边距与各 worldW 专属常数系 :1330-1428;本仓地图 marginless,
 *  goal0/goal1 按本仓变换互逆推得,界取世界全域 [0,max)）。 */
export function mapOrigin(
  fm: { zoom: number; panX: number; panY: number },
  worldW: number, worldH: number, viewW: number, viewH: number,
): [number, number] {
  return [viewW / 2 - (worldW * fm.zoom) / 2 + fm.panX, viewH / 2 - (worldH * fm.zoom) / 2 + fm.panY];
}

/** GetMapCoords Goal 0（屏 → tile;:1430-1459）：界外 null */
export function mapTileFromScreen(
  mx: number, my: number, fm: { zoom: number; panX: number; panY: number },
  worldW: number, worldH: number, viewW: number, viewH: number,
): { x: number; y: number } | null {
  const [cx0, cy0] = mapOrigin(fm, worldW, worldH, viewW, viewH);
  const tx = Math.floor((mx - cx0) / fm.zoom);
  const ty = Math.floor((my - cy0) / fm.zoom);
  if (tx < 0 || tx >= worldW || ty < 0 || ty >= worldH) return null;
  return { x: tx, y: ty };
}

/** GetMapCoords Goal 1（tile → 屏;:1460-1466） */
export function mapScreenFromTile(
  tx: number, ty: number, fm: { zoom: number; panX: number; panY: number },
  worldW: number, worldH: number, viewW: number, viewH: number,
): { x: number; y: number } {
  const [cx0, cy0] = mapOrigin(fm, worldW, worldH, viewW, viewH);
  return { x: cx0 + tx * fm.zoom, y: cy0 + ty * fm.zoom };
}

// =====================================================================
// CaptureInterface（:15-1616;Settings 内嵌类 :17-30 → 模块级单例）
// =====================================================================

export const CaptureSettings = {
  packImage: true,
  includeEntities: true,
  transparentBackground: false,
  biomeChoiceIndex: -1,
  screenAnchor: 0,
  /** MarkedAreaColor = new Color(0.8,0.8,0.8,0)*0.3（:29）——XNA Color*float
   *  连 alpha 一起乘 → (0.24,0.24,0.24,0)，alpha=0 = 填充不可见（原版事实：
   *  选区只有白边框可见,填充恒透明——1:1 照抄）。 */
  markedAreaColor: 'rgba(61,61,61,0)',
};

const enum Mode { Edge = 0, Drag = 1, Settings = 2 }

/** 每帧环境（frame() 由 Renderer 集成点从 render 参数组装;测试可注入合成值） */
export interface CaptureEnv {
  mouseX: number; mouseY: number;
  mouseLeft: boolean; mouseRight: boolean;   // 电平语义
  viewW: number; viewH: number;
  worldW: number; worldH: number;             // tile 维
  mapOpen: boolean;
  fm: { zoom: number; panX: number; panY: number };
  gravDir: number;
  mapEnabled: boolean;    // renderer.minimap 存在性（按钮 5 门,Main.mapEnabled :1113）
}

/** render() 全参数快照（截图重渲通道再喂给 renderer.render） */
export interface RenderBundle {
  cam: Camera; world: World; clock: Clock; chunks: ChunkCache;
  lightR: Uint8Array; lightG: Uint8Array; lightB: Uint8Array;
  lightRX: number; lightRY: number; lightRW: number; lightRH: number;
  player: Player; entities: Entity[]; particles: Particle[]; dmgNumbers: DamageNumber[];
  swing: { t: number; dur: number; item: number } | null;
  hover: HoverTarget | null;
  flicker: FlickerClock | null;
  remotePlayers: Player[];
  leashed: LeashedEntityManager | null;
}

/** Input 面子集（main.ts 首次进相机模式时直连 Game.input——Renderer 无输入面） */
export interface CaptureInput {
  mouseX: number; mouseY: number;
  mouseHeld: boolean; rightDown: boolean;
}

// 声音门（文件头⑥）：node 测试环境无 window（Sfx.ensure 碰 window）——先判
function sfx(name: 'menuOpen' | 'menuClose' | 'menuTick', vol = 1): void {
  if (typeof window === 'undefined') return;
  UISfx.sfx.play(name, vol);
}
function shutterSound(): void {
  if (typeof window === 'undefined') return;
  UISfx.sfx.playWavFile('Camera', 1, -1, -1);   // SoundID 40;x=-1 = UI 声不衰减
}

export class CaptureInterface {
  // ---- 公共态（原版 static :890-918 → 实例字段;单 Renderer 单实例等价）----
  active = false;
  justActivated = false;
  // 调试桥（main.ts __sw* 同款模式）：探针/E2E 直改拍摄设置（群系档等）
  // ★2026-08-25 修复:类体内裸块 {} 非法（ES 类体只允许成员）,阻塞全仓构建——
  //   改 IIFE 字段等价实现（构造时执行一次）
  private __captureBridge = (() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __swCaptureSettings?: typeof CaptureSettings }).__swCaptureSettings = CaptureSettings;
    }
    return true;
  })();
  selectedMode: Mode = Mode.Edge;
  hoveredMode = -1;
  edgeAPinned = false;
  edgeBPinned = false;
  edgeA = { x: -1, y: -1 };
  edgeB = { x: -1, y: -1 };
  cameraLock = false;
  cameraFrame = 0;       // CameraFrame（:910;0..5,CAMERA_MAX_FRAME :914）
  cameraWaiting = 0;     // CameraWaiting（:912;0..60,CAMERA_MAX_WAIT :916）

  // ---- 模式内态 ----
  dragCurrentAim = -1;             // ModeDragBounds.currentAim（:338）
  private dragDragging = false;
  private dragCaughtEdge = -1;
  private settingsHoveredButton = -1;   // ModeChangeSettings.hoveredButton（:661）
  private hoverBiomeName: string | null = null;

  // ---- 截图引擎态（CaptureCamera 对应字段）----
  /** 接口侧暂存（CaptureInterface.CameraSettings static :918——StartCamera
   *  写入;countdown 到 4 帧才被 Capture() 消费成 settings。分离即原版精髓:
   *  DrawTick 的空队收尾在帧 4 前不会误伤——activeSettings 尚 null） */
  private cameraSettings: CaptureSettingsInst | null = null;
  private settings: CaptureSettingsInst | null = null;   // _activeSettings
  private queue: ChunkPlan[] = [];                       // _renderQueue
  private tilesProcessed = 0;                            // _tilesProcessed
  private totalTiles = 1;                                // _totalTiles
  private outCanvas: HTMLCanvasElement | null = null;
  private outCtx: CanvasRenderingContext2D | null = null;
  private chunkCanvas: HTMLCanvasElement | null = null;

  // ---- 接线 ----
  input: CaptureInput | null = null;
  /** 激活态翻转回调（main.ts 注册:DOM HUD 让位——原版界面层截断在 canvas 侧
   *  由 Renderer 集成点承担,DOM 快捷栏/buff 栏等 canvas 外 HUD 需此回调隐藏） */
  onActiveChange?: (active: boolean) => void;
  /** 滚轮积累（main.ts capture 相位拦截写入;Scrolling 消费后清零——
   *  Player.cs:24903-24907 语义,见 main.ts 集成注释） */
  pendingWheel = 0;

  // ---- 输入边沿（frame 内更新,update/draw 两相位共用）----
  private prevLeft = false;
  private prevRight = false;
  /** 本帧"点击完成"沿（Main.mouseLeft && Main.mouseLeftRelease 等价） */
  private clickLeft = false;

  // ===================================================================
  // ToggleCamera（:1039-1059）
  // ===================================================================
  toggleCamera(on = true): void {
    if (this.cameraLock) return;
    const was = this.active;
    this.active = on;   // selectedMode 恒 0..2（Modes.ContainsKey 恒真）
    if (was !== this.active) {
      sfx(on ? 'menuOpen' : 'menuClose', 1);
      this.onActiveChange?.(this.active);
    }
    if (on && !was) this.justActivated = true;
    if (!on) { this.settingsHoveredButton = -1; this.dragCurrentAim = -1; }   // ToggleActive(false) 各模式清理（:368/:873）
  }

  /** F4 派发门（Update :983：`(mouseItem.type == 0 || Active) && !dead && !ghost`）。
   *  mouseItem 门 N/A：本仓背包拖拽为 DOM ghost,不持有 mouseItem 语义（登记）。 */
  toggleRequest(player: { dead: boolean; isGhostPhase(w: World): boolean }, world: World): void {
    if (player.dead || player.isGhostPhase(world)) return;
    this.toggleCamera(!this.active);
  }

  /** ResetFocus（:1515-1521） */
  resetFocus(): void {
    this.edgeAPinned = false;
    this.edgeBPinned = false;
    this.edgeA = { x: -1, y: -1 };
    this.edgeB = { x: -1, y: -1 };
  }

  /** GetArea（:965-972） */
  area(): TileArea {
    return getArea(this.edgeA.x, this.edgeA.y, this.edgeB.x, this.edgeB.y);
  }

  /** Scrolling（:1523-1545）：滚轮切模式（±1 经 ±2 环绕——0 下滚 → -1 → +2
   *  修正回 1,跳过 2 是原版环绕行为照抄） */
  scrolling(): void {
    let num = Math.trunc(this.pendingWheel / 120) % 30;
    this.pendingWheel = 0;
    if (num < 0) num += 30;
    const prev = this.selectedMode;
    this.selectedMode -= num;
    while (this.selectedMode < 0) this.selectedMode += 2;
    while (this.selectedMode > 2) this.selectedMode -= 2;
    if (this.selectedMode !== prev) sfx('menuTick', 1);
  }

  // ===================================================================
  // frame()：每帧入口（Renderer.render 尾部调用 = Update + DrawTick + Draw）
  // ===================================================================
  frame(r: Renderer, b: RenderBundle, env: CaptureEnv): void {
    const inLeft = this.input ? this.input.mouseHeld : env.mouseLeft;
    const inRight = this.input ? this.input.rightDown : env.mouseRight;
    env.mouseLeft = inLeft;
    env.mouseRight = inRight;
    this.clickLeft = this.prevLeft && !inLeft;

    // ---- Update（:974-1008）----
    if (!this.cameraLock) {
      // Main.blockMouse = true（:992）→ 本仓复用 timeUiHover 吞点击门
      // （Game.ts:6731 使用路径主门;先例 Game.ts:16880 观战同款写法,不动 Game）
      r.timeUiHover = true;
      // JustActivated 松手解禁（:993-996：mouseLeftRelease && !mouseLeft）
      if (this.justActivated && !inLeft && this.prevLeft) this.justActivated = false;
      if (!this.justActivated) {
        const overButton = this.updateButtons(r, b, env);
        if (!(overButton && inLeft)) this.updateModes(b.cam, env);
      }
      // 滚轮（Player.cs:24903-24907）：非全屏地图时 Scrolling（地图开着时滚轮
      // 归地图缩放——Game 既有消费点处理,main.ts 拦截器放行）
      if (!env.mapOpen && this.pendingWheel !== 0) this.scrolling();
    }
    // ---- DrawTick 链（Main.cs:61167：UpdateCameraCountdown → camera.DrawTick）----
    this.updateCameraCountdown(r, b, env);
    this.cameraDrawTick(r, b, env);
    // ---- Draw（:1010-1037;node 测试环境无 DOM,视觉层跳过——状态机照走）----
    if (typeof document !== 'undefined') this.draw(r, b, env);
    this.prevLeft = inLeft;
    this.prevRight = inRight;
  }

  // ===================================================================
  // UpdateButtons（:1061-1138）：9 按钮组（24+46i, 24 起 42×42）
  // ===================================================================
  private updateButtons(r: Renderer, b: RenderBundle, env: CaptureEnv): boolean {
    this.hoveredMode = -1;
    for (let i = 0; i < 9; i++) {
      const bx = 24 + 46 * i, by = 24;
      if (env.mouseX < bx || env.mouseX >= bx + 42 || env.mouseY < by || env.mouseY >= by + 42) continue;
      this.hoveredMode = i;
      if (this.clickLeft) this.pressButton(i, r, b, env);
      return true;
    }
    return false;
  }

  /** 按钮 0-8（:1075-1134 num2 顺序链） */
  private pressButton(i: number, r: Renderer, b: RenderBundle, env: CaptureEnv): void {
    switch (i) {
      case 0:   // 快照（QuickScreenshot :1077）
        this.quickScreenshot(r, b);
        break;
      case 1:   // 拍选区（:1079-1095;需两边框都已钉）
        if (this.edgeAPinned && this.edgeBPinned) {
          this.startCamera(r, b, {
            area: this.area(),
            captureBackground: !CaptureSettings.transparentBackground,
            captureEntities: CaptureSettings.includeEntities,
            useScaling: CaptureSettings.packImage,
            captureMech: false,   // WiresUI.Settings.DrawWires（:1088）——截图通道无导线快照注入,恒 false（登记）
          });
        }
        break;
      case 2:   // 模式 0 边框选区（:1096-1101）
        if (this.selectedMode !== 0) { sfx('menuTick', 1); this.selectedMode = Mode.Edge; this.toggleCamera(); }
        break;
      case 3:   // 模式 1 拖拽边界（:1102-1107）
        if (this.selectedMode !== 1) { sfx('menuTick', 1); this.selectedMode = Mode.Drag; this.toggleCamera(); }
        break;
      case 4:   // 重置边框（:1108-1112）
        sfx('menuTick', 1);
        this.resetFocus();
        break;
      case 5:   // 全屏地图开关（:1113-1117;mapEnabled 门）
        if (env.mapEnabled) {
          sfx('menuTick', 1);
          r.fullMap.open = !r.fullMap.open;   // Main.mapFullscreen 翻转
        }
        break;
      case 6:   // 模式 2 设置（:1118-1123）
        if (this.selectedMode !== 2) { sfx('menuTick', 1); this.selectedMode = Mode.Settings; this.toggleCamera(); }
        break;
      case 7:   // 打开 Captures 文件夹（:1124-1128）——浏览器无文件系统,恒禁用（文件头①）
        break;
      case 8:   // 关闭（:1129-1134）
        this.toggleCamera(false);
        break;
    }
  }

  // ===================================================================
  // 三模式 Update（:1002-1006 分发）
  // ===================================================================
  private updateModes(cam: Camera, env: CaptureEnv): void {
    switch (this.selectedMode) {
      case Mode.Edge: this.updateEdge(cam, env); break;
      case Mode.Drag: this.updateDrag(cam, env); break;
      case Mode.Settings: this.updateSettingsPanel(env); break;
    }
  }

  /** ModeEdgeSelection.EdgePlacement（:97-131）：左键钉 A / 右键钉 B（按住跟随）。
   *  MouseWorld.ToTileCoordinates = floor(screenToWorld/16) */
  private updateEdge(cam: Camera, env: CaptureEnv): void {
    if (this.justActivated) return;
    if (!env.mapOpen) {
      const [wx, wy] = cam.screenToWorld(env.mouseX, env.mouseY);
      if (env.mouseLeft) { this.edgeAPinned = true; this.edgeA = { x: Math.floor(wx / 16), y: Math.floor(wy / 16) }; }
      if (env.mouseRight) { this.edgeBPinned = true; this.edgeB = { x: Math.floor(wx / 16), y: Math.floor(wy / 16) }; }
    } else {
      const t = mapTileFromScreen(env.mouseX, env.mouseY, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
      if (t) {
        if (env.mouseLeft) { this.edgeAPinned = true; this.edgeA = { ...t }; }
        if (env.mouseRight) { this.edgeBPinned = true; this.edgeB = { ...t }; }
      }
    }
    this.constraintPoints(env);
  }

  /** ModeDragBounds.DragBounds（:379-560）：拖角/拖边改选区 */
  private updateDrag(cam: Camera, env: CaptureEnv): void {
    // 未成框：左键落下双角（:381-416）
    if (!this.edgeAPinned || !this.edgeBPinned) {
      if (env.mouseLeft) {
        let ok = true;
        let t: { x: number; y: number } | null;
        if (!env.mapOpen) {
          const [wx, wy] = cam.screenToWorld(env.mouseX, env.mouseY);
          t = { x: Math.floor(wx / 16), y: Math.floor(wy / 16) };
        } else {
          t = mapTileFromScreen(env.mouseX, env.mouseY, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
          ok = !!t;
        }
        if (ok && t) {
          if (!this.edgeAPinned) { this.edgeAPinned = true; this.edgeA = { ...t }; }
          if (!this.edgeBPinned) { this.edgeBPinned = true; this.edgeB = { ...t }; }
        }
        this.dragCurrentAim = 3;
        this.dragCaughtEdge = 1;
      }
    }
    // 选区屏幕矩形（:417-450,与 DrawMarkedArea 同式）
    const drawbox = this.markedAreaScreenRect(env, cam);
    if (!drawbox) return;
    this.dragDragging = false;
    if (!env.mouseLeft) this.dragCurrentAim = -1;
    if (this.dragCurrentAim !== -1) {
      // 拖拽中：沿轴改对应角（:456-497）
      this.dragDragging = true;
      let p: { x: number; y: number } | null;
      if (!env.mapOpen) {
        const [wx, wy] = cam.screenToWorld(env.mouseX, env.mouseY);
        p = { x: Math.floor(wx / 16), y: Math.floor(wy / 16) };
      } else {
        p = mapTileFromScreen(env.mouseX, env.mouseY, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
        if (!p) return;
      }
      switch (this.dragCurrentAim) {
        case 0: case 1:
          if (this.dragCaughtEdge === 0) this.edgeA.y = p.y;
          if (this.dragCaughtEdge === 1) this.edgeB.y = p.y;
          break;
        case 2: case 3:
          if (this.dragCaughtEdge === 0) this.edgeA.x = p.x;
          if (this.dragCaughtEdge === 1) this.edgeB.x = p.x;
          break;
      }
    } else {
      // 悬停探测：四边各扩 8px（:498-558;num5/num6 重力翻转恒 1/0——文件头⑤）
      this.dragCaughtEdge = -1;
      for (let i = 0; i < 4; i++) {
        const bd = boundRect(drawbox, i);
        const inB = env.mouseX >= bd.x - 8 && env.mouseX < bd.x + bd.w + 8
          && env.mouseY >= bd.y - 8 && env.mouseY < bd.y + bd.h + 8;
        if (!inB) continue;
        this.dragCurrentAim = i;
        switch (i) {
          case 0: this.dragCaughtEdge = this.edgeA.y < this.edgeB.y ? 0 : 1; break;
          case 1: this.dragCaughtEdge = this.edgeA.y >= this.edgeB.y ? 0 : 1; break;
          case 2: this.dragCaughtEdge = this.edgeA.x < this.edgeB.x ? 0 : 1; break;
          case 3: this.dragCaughtEdge = this.edgeA.x >= this.edgeB.x ? 0 : 1; break;
        }
        break;
      }
    }
    this.constraintPoints(env);
  }

  /** ModeChangeSettings.Update（:815-842）：面板行悬停/点按 */
  private updateSettingsPanel(env: CaptureEnv): void {
    this.settingsHoveredButton = -1;
    const rect = this.settingsRect();
    // rect.Inflate(-20,-20); Height=16; 行距 20（:826-837）
    const x = rect.x + 20, y = rect.y + 20, w = rect.w - 40;
    for (let i = 0; i < 7; i++) {
      const ry = y + i * 20;
      if (env.mouseX >= x && env.mouseX < x + w && env.mouseY >= ry && env.mouseY < ry + 16) {
        this.settingsHoveredButton = i;
        break;
      }
    }
    if (this.settingsHoveredButton !== -1 && this.clickLeft) this.pressSettingsButton(this.settingsHoveredButton);
  }

  /** PressButton（:703-732）：三开关 + 重置 */
  private pressSettingsButton(button: number): void {
    let flag = false;
    switch (button) {
      case 0: CaptureSettings.packImage = !CaptureSettings.packImage; flag = true; break;
      case 1: CaptureSettings.includeEntities = !CaptureSettings.includeEntities; flag = true; break;
      case 2: CaptureSettings.transparentBackground = !CaptureSettings.transparentBackground; flag = true; break;
      case 6:
        CaptureSettings.packImage = true;
        CaptureSettings.includeEntities = true;
        CaptureSettings.transparentBackground = false;
        CaptureSettings.biomeChoiceIndex = -1;
        flag = true;
        break;
    }
    if (flag) sfx('menuTick', 1);
  }

  /** GetRect（:665-674）：224×170 @ (115,80)（ScreenAnchor=0 档） */
  settingsRect(): AreaPx {
    const w = 224, h = 170;
    return { x: 227 - w / 2, y: 80, w, h };
  }

  /** ConstraintPoints（:1473-1484） */
  private constraintPoints(env: CaptureEnv): void {
    if (this.edgeAPinned) constrainPoint(this.edgeA, env.worldW, env.worldH, 40);
    if (this.edgeBPinned) constrainPoint(this.edgeB, env.worldW, env.worldH, 40);
  }

  /** 选区屏幕矩形（ModeEdgeSelection.DrawMarkedArea :133-159 世界支 /
   *  :160-174 地图支）：世界域 ∩ 视域再平移屏幕。null = 无框或不可见。
   *  ReverseGravitySupport 恒等（文件头⑤）。 */
  markedAreaScreenRect(env: CaptureEnv, cam?: Camera): AreaPx | null {
    if (!this.edgeAPinned || !this.edgeBPinned) return null;
    const a = getArea(this.edgeA.x, this.edgeA.y, this.edgeB.x, this.edgeB.y);
    if (!env.mapOpen) {
      if (!cam) return null;
      const world: AreaPx = { x: a.x * 16, y: a.y * 16, w: a.w * 16, h: a.h * 16 };
      const vl = cam.x - env.viewW / 2 / cam.zoom;
      const vt = cam.y - env.viewH / 2 / cam.zoom;
      const screen: AreaPx = { x: vl, y: vt, w: env.viewW / cam.zoom + 1, h: env.viewH / cam.zoom + 1 };
      const isect = intersect(screen, world);
      if (isect.w === 0 || isect.h === 0) return null;
      const [sx, sy] = cam.worldToScreen(isect.x, isect.y);
      return { x: sx, y: sy, w: isect.w * cam.zoom, h: isect.h * cam.zoom };
    }
    const p0 = mapScreenFromTile(a.x, a.y, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
    const p1 = mapScreenFromTile(a.x + a.w, a.y + a.h, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
    return intersect({ x: 0, y: 0, w: env.viewW + 1, h: env.viewH + 1 }, { x: p0.x, y: p0.y, w: p1.x - p0.x, h: p1.y - p0.y });
  }

  // ===================================================================
  // 快照链（QuickScreenshot :1161-1172 / StartCamera :1603-1610 /
  // UpdateCameraCountdown :1547-1570 / CaptureCamera :108-214 / EndCamera）
  // ===================================================================

  /** QuickScreenshot：整屏快拍（产物无界面——DrawCapture 独立管线语义） */
  quickScreenshot(r: Renderer, b: RenderBundle): void {
    this.startCamera(r, b, {
      area: fullScreenAreaOf(b.cam, r.canvas.width, r.canvas.height),
      captureBackground: !CaptureSettings.transparentBackground,
      captureEntities: CaptureSettings.includeEntities,
      useScaling: CaptureSettings.packImage,
      captureMech: false,
    });
  }

  /** StartCamera（:1603-1610）：组全量设置入暂存 + 快门音 + 锁屏 */
  startCamera(r: Renderer, b: RenderBundle, partial: Pick<CaptureSettingsInst,
    'area' | 'captureBackground' | 'captureEntities' | 'useScaling' | 'captureMech'>): void {
    const fs = fullScreenAreaOf(b.cam, r.canvas.width, r.canvas.height);
    this.cameraSettings = {
      ...partial,
      outputName: newOutputName(),
      biome: getCaptureBiome(CaptureSettings.biomeChoiceIndex),   // 自动档（数据面;渲染端强制见文件头③）
      cameraSpaceEffects: areaContains(fs, partial.area),          // :1605
    };
    shutterSound();   // SoundEngine.PlaySound(40)
    this.cameraLock = true;
    this.cameraWaiting = 0;
    this.cameraFrame = 0;
  }

  /** UpdateCameraCountdown（:1547-1570）：锁屏黑罩帧进/退 + 到 4 帧起拍
   *  （CaptureManager.Capture → _camera.Capture：暂存转正 + 分块规划） */
  private updateCameraCountdown(r: Renderer, b: RenderBundle, env: CaptureEnv): void {
    if (this.cameraLock && this.cameraFrame === 4 && this.cameraSettings) {
      this.settings = this.cameraSettings;
      this.beginCapture(r, b, env);
    }
    this.cameraFrame += this.cameraLock ? 1 : -1;
    if (this.cameraFrame < 0) this.cameraFrame = 0;
    if (this.cameraFrame > 5) this.cameraFrame = 5;
    if (this.cameraFrame === 5) this.cameraWaiting = Math.min(60, this.cameraWaiting + 1);
  }

  /** CaptureManager.Capture → _Capture（:108-173）：规划分块 + 备输出画布 */
  private beginCapture(r: Renderer, b: RenderBundle, _env: CaptureEnv): void {
    const s = this.settings;
    if (!s || s.area.w <= 0 || s.area.h <= 0) { this.cameraLock = false; return; }
    if (typeof document === 'undefined') return;   // node 测试环境:不触画布（状态机照走）
    this.queue = planChunks(s.area, s.useScaling);
    this.tilesProcessed = 0;
    this.totalTiles = Math.max(1, s.area.w * s.area.h);
    if (s.useScaling) {
      const [w, h] = outputSizeFor(s.area, true);
      if (!this.outCanvas) this.outCanvas = document.createElement('canvas');
      this.outCanvas.width = w; this.outCanvas.height = h;
      this.outCtx = this.outCanvas.getContext('2d')!;
      this.outCtx.clearRect(0, 0, w, h);
      this.outCtx.imageSmoothingEnabled = true;      // SamplerState.AnisotropicClamp（:105）
      this.outCtx.imageSmoothingQuality = 'high';
    }
    void r; void b;
  }

  /** CaptureCamera.DrawTick（:175-214）：每帧渲一块,空队收尾 */
  private cameraDrawTick(r: Renderer, b: RenderBundle, env: CaptureEnv): void {
    if (!this.settings) return;
    if (this.queue.length > 0) {
      const c = this.queue.shift()!;
      this.renderChunk(r, b, env, c);
      this.tilesProcessed += c.w * c.h;
    }
    if (this.queue.length === 0) this.finishCapture();
  }

  /** 单块离屏渲染：Renderer 二次调用（canvas/ctx/map 态换装 + _capturePass 门
   *  隔离 HUD——Renderer 集成注释）= 原版 DrawCapture 语义（Main.cs:56145：
   *  screenWidth=area.Width<<4 的 16px/tile 独立视口 + Lighting.LightTiles(area)） */
  private renderChunk(r: Renderer, b: RenderBundle, env: CaptureEnv, c: ChunkPlan): void {
    if (typeof document === 'undefined') return;
    const L = r.lighting;
    if (L) {
      // 光照区切到本块并同步快进一周期（dirty → runFullCycle 同 tick 完成,
      // 等价原版 :56210-56213 的 LightTiles(area)×4）
      L.ensureRegion((c.x + c.w / 2) * 16, (c.y + c.h / 2) * 16, c.w, c.h);
      L.compute(0);   // dayFactor 参数已弃用（Game 侧传 clock.dayFactor,渲染层无钟——0 不参与计算）
    }
    const pxW = c.w * 16, pxH = c.h * 16;
    if (!this.chunkCanvas) this.chunkCanvas = document.createElement('canvas');
    if (this.chunkCanvas.width !== pxW || this.chunkCanvas.height !== pxH) {
      this.chunkCanvas.width = pxW; this.chunkCanvas.height = pxH;
    }
    const cctx = this.chunkCanvas.getContext('2d')!;
    // 临时相机：16px/tile（zoom=1）,视口=块像素域（视口中心=块中心）
    const cam = new Camera(b.world.w, b.world.h);
    cam.x = (c.x + c.w / 2) * 16;
    cam.y = (c.y + c.h / 2) * 16;
    cam.zoom = 1; cam.zoomTarget = 1;
    cam.viewW = pxW; cam.viewH = pxH;
    // 换装（finally 全量回滚——渲染中断不留脏态）
    const savedCanvas = r.canvas, savedCtx = r.ctx, savedMapOpen = r.fullMap.open;
    r.canvas = this.chunkCanvas;
    r.ctx = cctx;
    r.fullMap.open = false;
    r._capturePass = true;
    // ★手动群系档渲染强制（文件头③消费缺口补齐）：合成 scene 换装（背景样式机
    //   preferredStyle 与水色推导同源生效）+ 背景样式快照（免分块拍到交叉淡化
    //   中间态）；水色精确值由 Renderer.updateWaterStyle 捕获直供兜底
    const savedScene = r.scene;
    const choice = CaptureSettings.biomeChoiceIndex;
    // ★BISECT(临时):__iso = { sceneSwap, snap } 二分黑屏归因
    const iso = (typeof window !== 'undefined' ? (window as unknown as { __iso?: { sceneSwap: boolean; snap: boolean } }).__iso : null) ?? { sceneSwap: true, snap: true };
    if (choice >= 0 && savedScene && iso.sceneSwap) {
      const ov = captureSceneOverride(choice, savedScene);
      if (ov) r.scene = ov;
    }
    if (choice >= 0 && iso.snap) {
      r.biomeBg.snapStyle(this.settings!.biome.backgroundIndex);
    }
    try {
      r.render(
        cam, b.world, b.world.clock, b.chunks,
        L ? L.r : b.lightR, L ? L.g : b.lightG, L ? L.b : b.lightB,
        L ? L.rx : b.lightRX, L ? L.ry : b.lightRY, L ? L.rw : b.lightRW, L ? L.rh : b.lightRH,
        b.player,
        this.settings!.captureEntities ? b.entities : [],   // CaptureEntities 门（:145 等）
        [],   // 战斗文字不入截图（DrawCapture 无此层）
        [],   // 旧粒子系统同上
        b.swing, null, null,
        env.mouseX, env.mouseY, false, 0,
        b.flicker, b.remotePlayers, null, null,
      );
    } finally {
      r._capturePass = false;
      r.canvas = savedCanvas;
      r.ctx = savedCtx;
      r.fullMap.open = savedMapOpen;
      r.scene = savedScene;
      // 光照区回切玩家视野（Game 每 tick ensureRegion 亦会自愈,此处显式回切
      // 防本帧后续消费读到块区域）
      if (L) L.ensureRegion(b.cam.x, b.cam.y,
        Math.ceil(savedCanvas.width / b.cam.zoom / 16), Math.ceil(savedCanvas.height / b.cam.zoom / 16));
    }
    // 贴回（UseScaling → 输出画布 DrawBytesToBuffer 语义 :200;否则独立分块 PNG :205）
    if (this.settings!.useScaling && this.outCtx) {
      this.outCtx.drawImage(this.chunkCanvas, c.ox, c.oy, c.ow, c.oh);
    } else {
      downloadCanvasPng(this.chunkCanvas, `${this.settings!.outputName} ${c.x}-${c.y}.png`);
    }
  }

  /** FinishCapture（:388-439）+ EndCamera（:1612-1615） */
  private finishCapture(): void {
    const s = this.settings;
    if (s && s.useScaling && this.outCanvas && typeof document !== 'undefined') {
      downloadCanvasPng(this.outCanvas, `${s.outputName}.png`);
    }
    this.settings = null;
    this.queue = [];
    this.outCanvas = null;
    this.outCtx = null;
    this.chunkCanvas = null;
    this.cameraLock = false;   // CaptureInterface.EndCamera
  }

  /** GetProgress（CaptureCamera :271-274） */
  get progress(): number { return this.tilesProcessed / this.totalTiles; }

  // ===================================================================
  // Draw（:1010-1037）
  // ===================================================================
  private draw(r: Renderer, b: RenderBundle, env: CaptureEnv): void {
    const ctx = r.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 全屏地图先行（原版 :61595 DrawMap 在 CaptureInterface 之前）——相机模式
    // 下 render() 的地图段被截断,由本处按原版层序补画
    if (env.mapOpen) {
      r.drawFullMap(ctx, b.world, env.mouseX, env.mouseY, env.mouseLeft, b.entities);
    }
    // 1. 模式层（:1019-1022 各 mode.Draw;世界坐标经 cam 变换 = 原版
    //    StartDrawingSelection 的 GameViewMatrix 世界支 :44-56）
    if (this.selectedMode === Mode.Edge) {
      this.drawMarkedArea(ctx, env, b.cam);
      this.drawEdgeCursors(r, ctx, env, b.cam);
    } else if (this.selectedMode === Mode.Drag) {
      this.drawDragBounds(ctx, env, b.cam);
    } else {
      // ModeChangeSettings.Draw :850-853 复用 DragBounds 画框（currentAim=-1）
      this.dragCurrentAim = -1;
      this.drawDragBounds(ctx, env, b.cam);
    }
    // 2. 资源条 + 呼吸计（:1027 GUIBarsDraw——相机模式截断界面层后由本处重画;
    //    buff 栏原版跳过（:42608）,本仓 buff 栏为 DOM 天然不在画布）
    this.drawGuiBars(r, ctx, b, env);
    // 3. 按钮组（DrawButtons :1174-1316;ModeChangeSettings 面板在其内）
    this.drawButtons(r, ctx, env);
    // 4. 标题（:1032 DrawBorderStringBig,inter[81] @ (W/2,100)）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px "Fusion Pixel 12px zh_hans", monospace';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 5;
    const title = Lang.inter(81);
    ctx.strokeText(title, env.viewW / 2, 100);
    ctx.fillStyle = '#fff';
    ctx.fillText(title, env.viewW / 2, 100);
    ctx.textBaseline = 'alphabetic';
    // 5. 锁屏遮罩 + 进度（DrawCameraLock :1572-1601）
    this.drawCameraLock(ctx, env.viewW, env.viewH);
    ctx.restore();
  }

  /** ModeEdgeSelection.DrawMarkedArea（:133-175）：白 2px 边框（填充 alpha=0
   *  原版事实,见 CaptureSettings.markedAreaColor 注释） */
  private drawMarkedArea(ctx: CanvasRenderingContext2D, env: CaptureEnv, cam: Camera): void {
    const rect = this.markedAreaScreenRect(env, cam);
    if (!rect) return;
    ctx.fillStyle = CaptureSettings.markedAreaColor;   // 不可见填充（1:1 照抄）
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 2; i++) {
      ctx.fillRect(rect.x, rect.y + (i === 1 ? rect.h : -2), rect.w, 2);
      ctx.fillRect(rect.x + (i === 1 ? rect.w : -2), rect.y, 2, rect.h);
    }
  }

  /** ModeDragBounds.DrawMarkedArea（:574-654）：银边 + 悬停白/拖拽金高亮边 */
  private drawDragBounds(ctx: CanvasRenderingContext2D, env: CaptureEnv, cam: Camera): void {
    const rect = this.markedAreaScreenRect(env, cam);
    if (!rect) return;
    ctx.fillStyle = CaptureSettings.markedAreaColor;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    let hot: AreaPx | null = null;
    for (let i = 0; i < 2; i++) {
      const hRect: AreaPx = { x: rect.x, y: rect.y + (i === 1 ? rect.h : -2), w: rect.w, h: 2 };
      const vRect: AreaPx = { x: rect.x + (i === 1 ? rect.w : -2), y: rect.y, w: 2, h: rect.h };
      if (this.dragCurrentAim !== i) drawBound(ctx, hRect, 0); else hot = hRect;
      if (this.dragCurrentAim !== i + 2) drawBound(ctx, vRect, 0); else hot = vRect;
    }
    if (hot) drawBound(ctx, hot, this.dragDragging ? 2 : 1);   // 1+dragging.ToInt()（:632）
  }

  /** ModeEdgeSelection.DrawCursors（:177-333）：两枚钉光标（Cursors[4]/[5]）。
   *  cursorScale=1 → num=1,num2=0.8（:179-181）;位置钳 [screen+30, size-30]
   *  （:181-182）。gravDir 翻转支恒 1（文件头⑤）。 */
  private drawEdgeCursors(r: Renderer, ctx: CanvasRenderingContext2D, env: CaptureEnv, cam: Camera): void {
    const cur4 = r.atlas ? r.atlas.vui('UI_Cursor_4.png') : null;   // TextureAssets.Cursors[4]
    const cur5 = r.atlas ? r.atlas.vui('UI_Cursor_5.png') : null;   // TextureAssets.Cursors[5]
    const minX = 30, minY = 30, maxX = env.viewW - 30, maxY = env.viewH - 30;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const mouseWorld = (): [number, number] => cam.screenToWorld(env.mouseX, env.mouseY);

    // ---- A 钉（:193-263）----
    if (!this.edgeAPinned) {
      drawCursorSingle(ctx, cur4, Math.PI * 1.25, 0.8, env.mouseX - 5 + 12, env.mouseY + 2.5 + 12, 0);   // :195
    } else if (!env.mapOpen) {
      let px: number, py: number, rot: number, special = 0;
      if (!this.edgeBPinned) {
        // 只钉 A：A 中心指向鼠标（:203-215）
        special = 1;
        const cx = this.edgeA.x * 16 + 8, cy = this.edgeA.y * 16 + 8;
        const [mwx, mwy] = mouseWorld();
        rot = Math.atan2(mwy - cy, mwx - cx);
        px = clamp(cx, minX, maxX); py = clamp(cy, minY, maxY);
        if (px !== cx || py !== cy) rot = Math.atan2(cy - py, cx - px);
      } else {
        // 双钉：A 角指向 B 对角（:221-236）
        const dx = (this.edgeA.x > this.edgeB.x ? 1 : 0) * 16;
        const dy = (this.edgeA.y > this.edgeB.y ? 1 : 0) * 16;
        const cx = this.edgeA.x * 16 + dx, cy = this.edgeA.y * 16 + dy;
        px = clamp(cx, minX, maxX); py = clamp(cy, minY, maxY);
        rot = Math.atan2(this.edgeB.y * 16 + 16 - dy - py, this.edgeB.x * 16 + 16 - dx - px);
        if (px !== cx || py !== cy) { rot = Math.atan2(cy - py, cx - px); special = 1; }
      }
      const [sx, sy] = cam.worldToScreen(px, py);
      drawCursorSingle(ctx, cur4, rot - Math.PI / 2, 1, sx, sy, special);
    } else {
      // 地图支（:240-262）
      if (this.edgeBPinned) {
        const nx = this.edgeA.x + (this.edgeA.x > this.edgeB.x ? 1 : 0);
        const ny = this.edgeA.y + (this.edgeA.y > this.edgeB.y ? 1 : 0);
        const p = mapScreenFromTile(nx, ny, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
        const o = {
          x: this.edgeB.x + (1 - (this.edgeA.x > this.edgeB.x ? 1 : 0)),
          y: this.edgeB.y + (1 - (this.edgeA.y > this.edgeB.y ? 1 : 0)),
        };
        const q = mapScreenFromTile(o.x, o.y, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
        const px = clamp(p.x, minX, maxX), py = clamp(p.y, minY, maxY);
        drawCursorSingle(ctx, cur4, Math.atan2(q.y - py, q.x - px) - Math.PI / 2, 1, px, py, 0);
      } else {
        const p = mapScreenFromTile(this.edgeA.x, this.edgeA.y, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
        drawCursorSingle(ctx, cur4, 0, 1, p.x, p.y, 0);
      }
    }

    // ---- B 钉（:264-332,A 的对称支;角取 >= 判据 :293-296）----
    if (!this.edgeBPinned) {
      drawCursorSingle(ctx, cur5, Math.PI / 4, 0.8, env.mouseX + 2.5 + 12, env.mouseY - 5 + 12, 0);   // :266
      return;
    }
    if (!env.mapOpen) {
      let px: number, py: number, rot: number, special = 0;
      if (!this.edgeAPinned) {
        special = 1;
        const cx = this.edgeB.x * 16 + 8, cy = this.edgeB.y * 16 + 8;
        const [mwx, mwy] = mouseWorld();
        rot = Math.atan2(mwy - cy, mwx - cx);
        px = clamp(cx, minX, maxX); py = clamp(cy, minY, maxY);
        if (px !== cx || py !== cy) rot = Math.atan2(cy - py, cx - px);
      } else {
        const dx = (this.edgeB.x >= this.edgeA.x ? 1 : 0) * 16;
        const dy = (this.edgeB.y >= this.edgeA.y ? 1 : 0) * 16;
        const cx = this.edgeB.x * 16 + dx, cy = this.edgeB.y * 16 + dy;
        px = clamp(cx, minX, maxX); py = clamp(cy, minY, maxY);
        rot = Math.atan2(this.edgeA.y * 16 + 16 - dy - py, this.edgeA.x * 16 + 16 - dx - px);
        if (px !== cx || py !== cy) { rot = Math.atan2(cy - py, cx - px); special = 1; }
      }
      const [sx, sy] = cam.worldToScreen(px, py);
      drawCursorSingle(ctx, cur5, rot - Math.PI / 2, 1, sx, sy, special);
    } else {
      if (this.edgeAPinned) {
        const nx = this.edgeB.x + (this.edgeB.x >= this.edgeA.x ? 1 : 0);
        const ny = this.edgeB.y + (this.edgeB.y >= this.edgeA.y ? 1 : 0);
        const p = mapScreenFromTile(nx, ny, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
        const o = {
          x: this.edgeA.x + (1 - (this.edgeB.x >= this.edgeA.x ? 1 : 0)),
          y: this.edgeA.y + (1 - (this.edgeB.y >= this.edgeA.y ? 1 : 0)),
        };
        const q = mapScreenFromTile(o.x, o.y, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
        const px = clamp(p.x, minX, maxX), py = clamp(p.y, minY, maxY);
        drawCursorSingle(ctx, cur5, Math.atan2(q.y - py, q.x - px) - Math.PI / 2, 1, px, py, 0);
      } else {
        const p = mapScreenFromTile(this.edgeB.x, this.edgeB.y, env.fm, env.worldW, env.worldH, env.viewW, env.viewH);
        drawCursorSingle(ctx, cur5, 0, 1, p.x, p.y, 0);
      }
    }
  }

  /** GUIBarsDrawInner（Main.cs:42600-42613,经 :1027 GUIBarsDraw）：资源条+呼吸计
   *  （与 Renderer.render 第 11 段同式——相机模式截断层后的原版重画位） */
  private drawGuiBars(r: Renderer, ctx: CanvasRenderingContext2D, b: RenderBundle, env: CaptureEnv): void {
    const barsUiS = mobileUiScale();
    if (barsUiS !== 1) {
      ctx.save();
      ctx.translate(env.viewW, 0);
      ctx.scale(barsUiS, barsUiS);
      ctx.translate(-env.viewW, 0);
    }
    if (options.data.resourceBarStyle === 'classic') r.resourceBars.draw(ctx, b.player, env.viewW, b.flicker);
    else r.fancyBars.draw(ctx, b.player, env.viewW, b.flicker);
    if (barsUiS !== 1) ctx.restore();
    r.breathMeter.draw(ctx, b.player, b.cam, env.viewH, r.atlas, r.playerInventory);
  }

  /** DrawButtons（:1174-1316）+ 设置面板 + 悬停提示 */
  private drawButtons(r: Renderer, ctx: CanvasRenderingContext2D, env: CaptureEnv): void {
    const atlas = r.atlas;
    let tooltip = '';
    for (let i = 0; i < 9; i++) {
      const vx = 24 + 46 * i, vy = 24;
      const scale = 0.8;
      // 底板（:1180-1199：选中模式 14 / 模式键 2 / 常规 InventoryBack;
      //  tint = Main.inventoryBack(白)×0.8 → α 0.8）
      let back = atlas ? atlas.vui('Inventory_Back.png') : null;
      if ((this.selectedMode === 0 && i === 2) || (this.selectedMode === 1 && i === 3) || (this.selectedMode === 2 && i === 6)) {
        back = atlas ? atlas.vui('Inventory_Back14.png') : null;
      } else if (i >= 2 && i <= 3) {
        back = atlas ? atlas.vui('Inventory_Back2.png') : null;
      }
      if (back) {
        ctx.globalAlpha = 0.8;
        ctx.drawImage(back.img, back.sx, back.sy, back.sw, back.sh, vx, vy, back.sw * scale, back.sh * scale);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(63,65,151,0.6)';
        ctx.fillRect(vx, vy, 42, 42);
      }
      // 图标（:1201-1226 映射：0→[7] 1→[0] 2/3/4→[i] 6→[1] 7→[6] 8→[5]）
      const iconIdx = i === 0 ? 7 : i === 1 ? 0 : i === 2 ? 2 : i === 3 ? 3 : i === 4 ? 4 : i === 6 ? 1 : i === 7 ? 6 : 5;
      const icon = i === 5 ? null : (atlas ? atlas.vui(`UI_Camera_${iconIdx}.png`) : null);
      const cx = vx + 26 * scale, cy = vy + 26 * scale;
      if (i === 5) {
        drawMapIconFallback(ctx, cx, cy, env.mapOpen);   // MapIcon 缺素材（文件头④）
      } else if (icon) {
        ctx.drawImage(icon.img, icon.sx, icon.sy, icon.sw, icon.sh, cx - icon.sw / 2, cy - icon.sh / 2, icon.sw, icon.sh);
      }
      // 禁用罩（:1228-1253 Cd;1=未成框 / 5=地图不可用 / 7=web 恒禁）→ 矢量回退
      const disabled = (i === 1 && !(this.edgeAPinned && this.edgeBPinned)) || (i === 5 && !env.mapEnabled) || i === 7;
      if (disabled) {
        ctx.globalAlpha = 0.65;   // White×0.65（:1252）
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(63,65,151,0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 悬停提示文案（:1255-1311）
      if (this.hoveredMode === i) {
        switch (i) {
          case 0: tooltip = Lang.inter(111); break;
          case 1:
            tooltip = Lang.inter(67);
            if (!(this.edgeAPinned && this.edgeBPinned)) tooltip += '\n' + Lang.inter(112);
            break;
          case 2: tooltip = Lang.inter(69); break;
          case 3: tooltip = Lang.inter(70); break;
          case 4: tooltip = Lang.inter(78); break;
          case 5:
            tooltip = env.mapOpen ? Lang.inter(109) : Lang.inter(108);
            if (!env.mapEnabled) tooltip += '\n' + Lang.inter(114);
            break;
          case 6: tooltip = Lang.inter(68); break;
          case 7: tooltip = Lang.inter(110) + '\n' + Lang.inter(113); break;   // web 恒"仅窗口模式"支（文件头①）
          case 8: tooltip = Lang.inter(71); break;
        }
      }
    }
    if (this.selectedMode === Mode.Settings) this.drawSettingsPanel(r, ctx, env);
    if (tooltip) drawMouseText(ctx, tooltip, env.mouseX, env.mouseY);   // :1313 MouseText
    if (this.hoverBiomeName) {
      drawMouseText(ctx, this.hoverBiomeName, env.mouseX, env.mouseY);
      this.hoverBiomeName = null;
    }
  }

  /** ModeChangeSettings.Draw（:844-870）：DrawInvBG 面板 + 7 行 + 群系格 */
  private drawSettingsPanel(r: Renderer, ctx: CanvasRenderingContext2D, env: CaptureEnv): void {
    const atlas = r.atlas;
    const rect = this.settingsRect();
    // Utils.DrawInvBG（:855,色 (63,65,151,255)×0.485 → 截断整算 rgba(30,31,73,123)）九宫
    drawInvBG(ctx, atlas, rect, 30 / 255, 31 / 255, 73 / 255, 123 / 255);
    const FONT = '15px "Fusion Pixel 12px zh_hans", monospace';
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 7; i++) {
      let key = '', value = '';
      switch (i) {   // ButtonDraw（:676-701）
        case 0: key = Lang.inter(74); value = Lang.inter(73 - (CaptureSettings.packImage ? 1 : 0)); break;
        case 1: key = Lang.inter(75); value = Lang.inter(73 - (CaptureSettings.includeEntities ? 1 : 0)); break;
        case 2: key = Lang.inter(76); value = Lang.inter(73 - (!CaptureSettings.transparentBackground ? 1 : 0)); break;
        case 6: key = '      ' + Lang.menu(86); break;
      }
      if (!key) continue;
      const col = this.settingsHoveredButton === i ? 'rgb(255,215,0)' : '#fff';   // hover → Gold（:864）
      const y = rect.y + 20 + 20 * i + 8;
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(key, rect.x + 20, y);
      ctx.fillStyle = col;
      ctx.fillText(key, rect.x + 20, y);
      if (value) {
        const w = ctx.measureText(value).width;
        ctx.strokeText(value, rect.x + rect.w - 20 - w, y);
        ctx.fillText(value, rect.x + rect.w - 20 - w, y);
      }
    }
    ctx.textBaseline = 'alphabetic';
    // 群系选取格（DrawWaterChoices :734-783）：2×7 跳 (1,6) 共 13 格,20×20 @ 24 步进
    const bioTex = atlas ? atlas.vmisc('vanilla/Extra_130.png') : null;
    const start = { x: rect.x + rect.w / 2 - 84, y: rect.y + 90 };   // :869
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 7; j++) {
        if (i === 1 && j === 6) continue;
        const num = j + i * 7;
        const rx = start.x + 24 * j + 12 * i, ry = start.y + 24 * i;
        let state = 0;
        const hover = env.mouseX >= rx && env.mouseX < rx + 20 && env.mouseY >= ry && env.mouseY < ry + 20;
        if (hover) {
          if (this.clickLeft) CaptureSettings.biomeChoiceIndex = num;   // :751-756
          state++;
        }
        if (CaptureSettings.biomeChoiceIndex === num) state += 2;
        let alpha = 1;
        if (state < 2) alpha *= 0.5;   // num4（:768-771）
        ctx.fillStyle = state % 2 === 1 ? 'rgb(255,215,0)' : `rgba(255,255,255,${alpha})`;
        ctx.fillRect(rx, ry, 20, 20);
        if (bioTex) {
          ctx.globalAlpha = alpha;
          ctx.drawImage(bioTex.img, bioTex.sx + num * 18, bioTex.sy, 16, 16, rx + 2, ry + 2, 16, 16);
          ctx.globalAlpha = 1;
        }
        if (hover) this.hoverBiomeName = Lang.text(`CaptureBiomeChoice.${num}`);   // :757 MouseText
      }
    }
  }

  /** DrawCameraLock（:1572-1601）：黑罩 α=frame/5;waiting>55 后显进度 */
  private drawCameraLock(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    if (this.cameraFrame === 0) return;
    ctx.fillStyle = `rgba(0,0,0,${(this.cameraFrame / 5).toFixed(3)})`;
    ctx.fillRect(0, 0, viewW, viewH);
    if (this.cameraFrame !== 5) return;
    let num = this.cameraWaiting - 60 + 5;
    if (num <= 0) return;
    num /= 5;
    let pct = this.progress * 100;
    if (pct > 100) pct = 100;
    // "##" 格式（:1592）：四舍五入整数,0 → 空串（.NET 自定义占位符行为照抄）
    const intPct = Math.round(pct);
    const text = (intPct === 0 ? '' : String(intPct)) + ' ';
    const text2 = '/ 100%';
    const a = Math.min(1, num);
    ctx.font = 'bold 40px "Fusion Pixel 12px zh_hans", monospace';   // FontAssets.DeathText
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.strokeStyle = `rgba(0,0,0,${(a * 0.8).toFixed(3)})`;
    ctx.lineWidth = 5;
    const y = viewH / 2;
    const w1 = ctx.measureText(text).width;
    // text 右缘贴屏中（origin (-w,-h/2)）;text2 左缘贴屏中（origin (0,-h/2)）（:1596-1599）
    ctx.strokeText(text, viewW / 2 - w1, y);
    ctx.fillText(text, viewW / 2 - w1, y);
    ctx.strokeText(text2, viewW / 2, y);
    ctx.fillText(text2, viewW / 2, y);
    ctx.textBaseline = 'alphabetic';
  }
}

/** GetBound（ModeDragBounds :562-572）：0 上 / 1 下 / 2 左 / 3 右（2px 厚） */
function boundRect(box: AreaPx, i: number): AreaPx {
  switch (i) {
    case 0: return { x: box.x, y: box.y - 2, w: box.w, h: 2 };
    case 1: return { x: box.x, y: box.y + box.h, w: box.w, h: 2 };
    case 2: return { x: box.x - 2, y: box.y, w: 2, h: box.h };
    default: return { x: box.x + box.w, y: box.y, w: 2, h: box.h };
  }
}

/** DrawBound（:636-654）：0 银 / 1 白高亮 / 2 金拖拽（外扩 2px 三层） */
function drawBound(ctx: CanvasRenderingContext2D, rect: AreaPx, mode: number): void {
  if (mode === 0) {
    ctx.fillStyle = 'rgb(192,192,192)';   // Color.Silver
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    return;
  }
  ctx.fillStyle = mode === 1 ? '#fff' : 'rgb(255,215,0)';   // White / Gold
  ctx.fillRect(rect.x - 2, rect.y, rect.w + 4, rect.h);
  ctx.fillRect(rect.x, rect.y - 2, rect.w, rect.h + 4);
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

/** Utils.DrawCursorSingle（:2862-2915）slot 4/5 支：origin(8,8);rot 先 -3π/4,
 *  flag && special==0 时吸附 π/2 扇区;阴影层 (+1,+1)×1.1 深灰;色恒白
 *  （:191 color = color2 = White 原版硬编码） */
function drawCursorSingle(
  ctx: CanvasRenderingContext2D, tex: { img: CanvasImageSource; sw: number; sh: number } | null,
  rotIn: number, scale: number, x: number, y: number, specialMode: number,
): void {
  if (!tex) return;
  let rot = rotIn;
  if (!Number.isNaN(rot)) {
    rot -= Math.PI * 3 / 4;
    if (specialMode === 0) {
      let n = rot;
      if (n < 0) n += Math.PI * 2;
      for (let k = 0; k < 4; k++) {
        if (Math.abs(n - (Math.PI / 2) * k) <= Math.PI / 4) { rot = (Math.PI / 2) * k; break; }
      }
    }
  } else rot = 0;
  const draw = (dx: number, dy: number, s: number): void => {
    ctx.save();
    ctx.translate(x + dx, y + dy);
    ctx.rotate(rot);
    ctx.drawImage(tex!.img, -8 * s, -8 * s, tex!.sw * s, tex!.sh * s);
    ctx.restore();
  };
  draw(1, 1, scale * 1.1);   // 阴影层 color.MultiplyRGB(0.2,0.2,0.2,0.5) → rgb51
  draw(0, 0, scale);
}

/** MapIcon_0/4 矢量回退（文件头④）：框内小地图形态,开图态实心填充 */
function drawMapIconFallback(ctx: CanvasRenderingContext2D, cx: number, cy: number, mapOpen: boolean): void {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 9, cy - 9, 18, 18);
  ctx.fillStyle = mapOpen ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)';
  ctx.fillRect(cx - 5, cy - 5, 10, mapOpen ? 10 : 5);
}

/** Utils.DrawInvBG（:2664-2691）九宫：Inventory_Back13 角 10/边心拉伸,逐像素乘色。
 *  染色贴图按 (尺寸,色) 缓存（UI.ts invBg 同式）。 */
function drawInvBG(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas | null, rect: AreaPx,
  mr: number, mg: number, mb: number, ma: number,
): void {
  const w = Math.max(20, rect.w), h = Math.max(20, rect.h);
  const src = atlas ? atlas.vui('Inventory_Back13.png') : null;
  if (!src) {
    ctx.fillStyle = `rgba(${Math.round(mr * 255)},${Math.round(mg * 255)},${Math.round(mb * 255)},${ma})`;
    ctx.fillRect(rect.x, rect.y, w, h);
    return;
  }
  const key = `${src.sw}x${src.sh}@${mr.toFixed(3)},${mg.toFixed(3)},${mb.toFixed(3)},${ma.toFixed(3)}`;
  let tinted = invBgTintCache.get(key);
  if (!tinted) {
    tinted = document.createElement('canvas');
    tinted.width = src.sw; tinted.height = src.sh;
    const tc = tinted.getContext('2d', { willReadFrequently: true })!;
    tc.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, 0, 0, src.sw, src.sh);
    const d = tc.getImageData(0, 0, src.sw, src.sh);
    for (let k = 0; k < d.data.length; k += 4) {
      d.data[k] = Math.round(d.data[k] * mr);
      d.data[k + 1] = Math.round(d.data[k + 1] * mg);
      d.data[k + 2] = Math.round(d.data[k + 2] * mb);
      d.data[k + 3] = Math.round(d.data[k + 3] * ma);
    }
    tc.putImageData(d, 0, 0);
    invBgTintCache.set(key, tinted);
  }
  const t = tinted, W = t.width, H = t.height;
  const s = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void =>
    ctx.drawImage(t, sx, sy, sw, sh, dx, dy, dw, dh);
  s(0, 0, 10, 10, rect.x, rect.y, 10, 10);
  s(W - 10, 0, 10, 10, rect.x + w - 10, rect.y, 10, 10);
  s(0, H - 10, 10, 10, rect.x, rect.y + h - 10, 10, 10);
  s(W - 10, H - 10, 10, 10, rect.x + w - 10, rect.y + h - 10, 10, 10);
  s(10, 0, 10, 10, rect.x + 10, rect.y, w - 20, 10);
  s(10, H - 10, 10, 10, rect.x + 10, rect.y + h - 10, w - 20, 10);
  s(0, 10, 10, 10, rect.x, rect.y + 10, 10, h - 20);
  s(W - 10, 10, 10, 10, rect.x + w - 10, rect.y + 10, 10, h - 20);
  s(10, 10, 10, 10, rect.x + 10, rect.y + 10, w - 20, h - 20);
}
const invBgTintCache = new Map<string, HTMLCanvasElement>();

/** MouseTextInner（Main.cs:20032-20175 纯文本支）：mouse+14 锚,右/下缘 40px
 *  收边,四向黑影（Renderer.ts:9897 同式）;多行逐行排（原版 MouseText 含 \n） */
function drawMouseText(ctx: CanvasRenderingContext2D, text: string, mouseX: number, mouseY: number): void {
  const lines = text.split('\n');
  ctx.save();
  ctx.font = '14px "Fusion Pixel 12px zh_hans", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lh = 17;
  let maxW = 0;
  for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
  let x = mouseX + 14, y = mouseY + 14;
  if (x + maxW + 40 > ctx.canvas.width) x = ctx.canvas.width - maxW - 40;
  if (y + lines.length * lh + 40 > ctx.canvas.height) y = ctx.canvas.height - lines.length * lh - 40;
  for (const l of lines) {
    for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      ctx.fillStyle = '#000';
      ctx.fillText(l, x + ox, y + oy);
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(l, x, y);
    y += lh;
  }
  ctx.restore();
}

/** PNG 下载（SaveImage :281-315 的 web 形态）：toBlob + a.download（文件头①） */
function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  try {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }, 'image/png');
  } catch (err) {
    // Error.CaptureOutOfMemory 语义（:123-130）：出图失败告警不炸链
    console.warn('[CaptureMode] PNG 导出失败:', err);
  }
}
