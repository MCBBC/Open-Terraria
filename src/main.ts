// 入口：加载素材/字体/文案 → VUI 主菜单 → 生成/加载世界 → 进入游戏
// 流程编排见 mainFlow.ts；本文件只做装配 + 游戏内键盘/开发者工具接线。
import './workers/procShim';   // ★首导入兜底(见 procShim.ts;worker 侧同款已挂 worldGen.worker)
import { Game } from './core/Game';
import { showSplash } from './ui/Splash';
import { shouldShowAudioGate, showAudioGate } from './ui/AudioGate';
import { mountInstallPrompt } from './ui/InstallPrompt';
import { UI } from './ui/UI';
import { resolveEscapeChain } from './ui/escapeChain';   // SW-BN2 2026-09-07
import { kvHas } from './save/KvStore';
import { saveGame } from './save/SaveFile';
import { ITEM_BY_KEY , VANILLA_ITEM_KEY_BY_ID , ITEM_DEFS } from './data/items';
import { combatWeapon } from './data/vanillaItemCombat';
import { TILE_BY_KEY, T, TILE_DEFS, WALL_DEFS } from './data/tiles';
import { liveGorePieces } from './entities/GorePiece';
import { parseWldToSave } from './wld/WldImport';
// 调试句柄：页面内直接测 .wld 转换
(window as unknown as { __parseWld?: (b: Uint8Array) => unknown }).__parseWld = parseWldToSave as unknown as (b: Uint8Array) => unknown;
import { SpriteAtlas } from './assets/SpriteAtlas';
import { AudioSystem } from './core/Audio';
import { Sfx } from './core/Sfx';
import type { AudioRecExport } from './debug/AudioRecorder';
import { setDebugPool } from './data/vanillaNpcs';
import { VUI } from './vui/VUI';
import { assetsDownloadIdle, initAssetCache, primeBootAssets, setLazyWorkerPrefetch, warmAllAssets } from './net/AssetCache';
import { prefetchWorldGenWorker } from './workers/WorldGenClient';
import { prefetchSaveWorker } from './workers/SaveClient';
import { holdForAssetsReady, mountAssetBadge, warnAssetPipelineDown } from './ui/AssetDownloadUI';
import { UITextures } from './vui/assets/UITextures';
import { UIFont } from './vui/draw/UIFont';
import { Lang } from './i18n/Lang';
import { options } from './core/Options';
import { isBound } from './core/Keybinds';
import { VuiDemoState } from './vui/states/VuiDemoState';
import { createFlow } from './mainFlow';
import { startUpdateCheck } from './update/UpdateCheck';
import { mountUpdateBanner } from './update/UpdateBanner';
import type { FlowHandle } from './mainFlow';
import { downloadDebugReport } from './debug/DebugReport';
import { initTileFrameCapture, tileFrameCapture } from './debug/TileFrameCapture';
import { tileAnim, TILE_ANIM_RATE, TILE_ANIM_PITCH, TILE_ANIM_FRAMES } from './render/TileAnim';
import { showFeatureGate } from './ui/QuickGate';
import { showJourneyQuickGate } from './ui/QuickGate';
import { openPlayerListPanel } from './ui/PlayerListPanel';
import { openJourneyPowersPanel } from './ui/JourneyPowersUI';

/** ★SW-FX16 2026-09-10：Shift 组合调试键保留集——这些键在 main.ts/Game.ts 有各自的
 *  Shift 组合臂（F1/F2 像素画·无敌、F3 碰撞盒、F4 迷雾、F5 录制·注记、F10 地图传送）,
 *  Shift 按下时调试臂优先于键位动作（缺省 ToggleCameraMode=F4 ∈ 集保持原行为）。
 *  重绑 ToggleCameraMode 到集外键后 Shift+键 照常触发相机模式（原版触发器无 Shift
 *  概念）。消费点：runKeybindHotkeys 的相机模式门。 */
const SHIFT_DEBUG_RESERVED: ReadonlySet<string> = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'F10']);
import { openResearchPanel } from './ui/ResearchUI';
import { installCanvasWatch } from './render/CanvasWatch';
import { RemasterRuntime } from './remaster/RemasterRuntime';
import { assetVersion } from './net/AssetCache';
import { RemasterManager } from './remaster/RemasterManager';
import { initResourcePacks, type ResourcePackManager } from './resources/ResourcePackManager';
import { setRemasterBuffIcon, clearIconCache } from './ui/UI';

// canvas 分配哨兵(2026-08-18):出生率 >20/s 持续 10s → console.warn 带出生栈
// (cloudTint 340 张/秒事故的常驻防线;?cwatch=0 静默)。须在 UI/游戏模块
// 构造前装——模块加载期的单例画布不计入,可接受(一次性常量非泄漏面)
installCanvasWatch();
mountInstallPrompt();   // PWA 安装提示条(beforeinstallprompt 捕获;iOS 引导;7 天冷却)

const root = document.getElementById('game-root')!;
const ui = new UI(root);

// ---- ?imglog=1:HTMLImageElement 绘制探针(2026-08-18 trace 残余流定性工具) ----
// 挂 drawImage 计数 wrapper(全 canvas 覆盖)+ 每 5s 报告 TOP 绘制源与
// createImageBitmap 失败统计。headless 无 GPU 压力测不到的路径,用真机跑:
// 打开 http://host/?imglog=1 → 复现操作 → 控制台 [imglog] 行即答案
if (new URLSearchParams(location.search).get('imglog') === '1') {
  const stats = new Map<string, number>();
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img: CanvasImageSource, ...rest: unknown[]) {
    if (img instanceof HTMLImageElement) {
      const k = (img.currentSrc || img.src || '').split('/').slice(-2).join('/').slice(0, 80);
      stats.set(k, (stats.get(k) ?? 0) + 1);
      if (stats.size > 600) stats.clear();
    }
    return (orig as (...a: unknown[]) => ReturnType<typeof orig>).call(this, img, ...rest);
  };
  (window as unknown as { __swImgDraw?: Map<string, number> }).__swImgDraw = stats;
  setInterval(() => {
    const top = [...stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, v]) => `${k}×${v}`).join('  ') || '(零 Image 绘制)';
    console.log(`[imglog] 5s Image绘制TOP: ${top}`);
  }, 5000);
}

// ---- 调试报告基础设施：错误 ring（F5 报告 errors 段唯一数据源）----
// kind: 0=pageerror 1=unhandledrejection 2=console.error；stack 取首行
// ★SW-BM1 2026-09-06（工具链债扩容）：总环 50→300 + fatal 独立环——旧 50 深环在
// 渲染层 warn-once 失修刷屏时会把真错误挤出窗口;分级留存 = kind 0/1（pageerror/
// unhandledrejection,崩溃类）另入 __swErrorsFatal(100) 独立环,console.error 噪声
// 永远逐不出 fatal。内存上限：单条 ≤~850B（msg 500+stack 300+壳）→ 总环 ~255KB +
// fatal ~85KB ≈ 340KB 常驻——F5 报告 errors 段上限 150 条（fatal 全量 ∪ 总环最近,
// 按时间归并）≈ 130KB,对 2.1MB 报告体积增量 <7%,安全
interface SwErrorRecord { t: number; kind: number; msg: string; stack: string | null }
const ERR_RING_CAP = 300;
const ERR_FATAL_RING_CAP = 100;
function pushSwError(kind: number, msg: unknown, stack: string | null | undefined) {
  const w = window as unknown as { __swErrors?: SwErrorRecord[]; __swErrorsFatal?: SwErrorRecord[] };
  if (!Array.isArray(w.__swErrors)) w.__swErrors = [];
  const rec: SwErrorRecord = {
    t: Date.now(), kind,
    msg: String(msg).slice(0, 500),
    stack: stack ? stack.split('\n')[0].slice(0, 300) : null,
  };
  w.__swErrors.push(rec);
  if (w.__swErrors.length > ERR_RING_CAP) w.__swErrors.shift();
  if (kind <= 1) {
    if (!Array.isArray(w.__swErrorsFatal)) w.__swErrorsFatal = [];
    w.__swErrorsFatal.push(rec);
    if (w.__swErrorsFatal.length > ERR_FATAL_RING_CAP) w.__swErrorsFatal.shift();
  }
}
window.addEventListener('error', (e) => pushSwError(0, e.message, e.error instanceof Error ? e.error.stack : null));
window.addEventListener('unhandledrejection', (e) =>
  pushSwError(1, e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}` : e.reason, e.reason instanceof Error ? e.reason.stack : null));
{
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const err = args.find((a): a is Error => a instanceof Error);
    pushSwError(2, args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '), err ? err.stack : null);
    origError(...args);
  };
}
// 资源加载失败入警告环(img/audio/script 的 error 事件不触发 console.error,
// 此前 F5 只能靠网络面板;漏抓面补上)
window.addEventListener('error', (e) => {
  const t = e.target as unknown as { src?: string; href?: string } | null;
  const src = t && (t.src || t.href);
  if (src) pushSwWarn(`[资源加载失败] ${String(src).slice(0, 180)}`);
}, true);

// 警告 ring（F5 报告 warnings 段数据源；与错误环分离——告警刷屏不能挤掉真错误）。
// 全量捕获 console.warn：渲染层的 warn-once（如 VanillaTiler 源矩形越界/取帧失败）
// 随手入环，任何模块无需单独接线
const WARN_RING_CAP = 50;
function pushSwWarn(msg: unknown) {
  const w = window as unknown as { __swWarns?: Array<{ t: number; msg: string }> };
  if (!Array.isArray(w.__swWarns)) w.__swWarns = [];
  w.__swWarns.push({ t: Date.now(), msg: String(msg).slice(0, 500) });
  if (w.__swWarns.length > WARN_RING_CAP) w.__swWarns.shift();
}
{
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    pushSwWarn(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
    origWarn(...args);
  };
}

ui.onBestiary = () => flow?.openBestiary(); // 背包面板图鉴按钮（原版 BestiaryMenuButton）
ui.onHousing = () => flow?.openHousing?.(); // 背包面板住房按钮（原版 DrawInterface_33_Housing）
// SW-BN3 2026-09-07：背包面板设置钮 → 暂停/设置浮层（原版 playerInventory 态的
// 设置入口 = DrawInterface_29_SettingsButton Main.cs:46287-46301,clickAction =
// ingameOptionsWindow ? Close : Open :46294-46299 同款 toggle）。
// ★SW-RB8c 2026-09-08 勘误：Open 臂收背包（IngameOptions.cs:70）/Close 臂回背包
// （:108）——原版设置窗与背包两态互斥,「浮层叠于背包」系 BN3 误读
ui.onPauseMenu = () => {
  const g = flow?.game;
  if (!g) return;
  if (pausePanel) {
    closeInGamePause(g);   // Close 臂（:108 回背包）
    return;
  }
  openInGamePause(g);      // Open 臂（:70 收背包）
};
const audio = new AudioSystem();
let atlas: SpriteAtlas | null = null;

let flow: FlowHandle | undefined;

// ---- 音效录制接线（2026-09-03 用户需求：F5 长按录制窗记录音频播放序列，
//      BGM 与 SFX 分列 audioRec.sfx / audioRec.bgm 两环,见 debug/AudioRecorder）----
// 钩子在【事件时刻】经 flow?.game 解析活 Game——换世界/HMR 双实例不钉死旧 Game。
// Sfx.onEvent 是静态钩,覆盖 Game.sfx 与 UISfx 共享单例两实例;菜单实例（UISfx）
// 的事件类带 @ui 后缀（对话按钮/相机快门等游戏内 UI 音可见出身）。
Sfx.onEvent = (k, d, tag) => flow?.game?.audioRec.sfx.log(tag ? `${k}@ui` : k, d);
audio.onEvent = (k, d) => flow?.game?.audioRec.bgm.log(k, d);   // sel/start/stop/fail/ended(ended+无 stoppedByFade=loop 失效哨兵)
let inGame = false;
let pausePanel: HTMLElement | null = null;

// ---- 动画帧捕获系统（被动聚合恒开 + 长按 F5 录制窗全量）----
// 快照/截图/异常像素小样都要主画布与相机；tick 用渲染端动画时钟。
initTileFrameCapture({
  tick: () => tileAnim.tick,
  canvas: () => {
    const cs = document.querySelectorAll('canvas');
    let best: HTMLCanvasElement | null = null, area = 0;
    cs.forEach((c) => { const a2 = c.width * c.height; if (a2 > area) { area = a2; best = c; } });
    return best;
  },
  camera: () => {
    const g = flow?.game;
    const cam = g ? (g as unknown as { camera?: { x: number; y: number } }).camera : null;
    return cam ? [cam.x, cam.y] : null;
  },
  zoom: () => (flow?.game as unknown as { camera?: { zoom: number } } | undefined)?.camera?.zoom ?? 1,
}, { rate: TILE_ANIM_RATE, pitch: TILE_ANIM_PITCH, frames: TILE_ANIM_FRAMES });

async function loadAssets() {
  atlas = new SpriteAtlas();
  try {
    await atlas.load();
    // 菜单首帧所需的 UI 贴图(面板/按钮/光标/logo)在显示主菜单前就位——
    // 否则 vui 懒加载下首帧控件用兜底样式闪一帧。
    // ★UI_ 全量族按子族排除(2026-08-13):素材全量入库后 UI_ 76→397 键,
    //   面板专属子族(图鉴/小地图/世界创建/角色创建/创意/工坊/成就…)只在各自
    //   面板打开时才需要,vui 消费方每帧重查 ensureUiImage 缺图自愈——
    //   收窄到菜单/加载页 chrome,请求 426→~170,零闪烁风险
    // 2026-08-24 HAR 审计收窄（用户报 logo_1..8 菜单白载）：
    //  · 'logo' 前缀整组移除——logo_1..8 是死资产（AssetInitializer 加载后无绘制点）
    //  · 'Inventory_' 前缀移除——Inventory_Back1-15/Tick 全是游戏内背包 UI，菜单
    //    零消费；进游戏后 vui 懒载自愈（首帧 null 下帧补）
    //  · 排除表增补：UI_UI_BossBar/UI_MapPing（游戏内 HUD，绘制路径 vui 懒载）、
    //    UI_TitleLinkButtons（原版标题链接钮，本作无消费方）、
//    UI_Sunflower_Loading（splash 向日葵已改等待期懒载直拉，不走 atlas）
    await atlas.preloadUiPrefix(
      ['UI_', 'Logo'], undefined,
      ['UI_Bestiary', 'UI_Minimap', 'UI_WorldCreation', 'UI_CharCreation',
       'UI_PlayerResourceSets', 'UI_Workshop', 'UI_Creative', 'UI_Wires',
       'UI_DisplaySlots', 'UI_Achievement', 'UI_Craft', 'UI_InfoIcon',
       'UI_Settings', 'UI_Camera', 'UI_UI_BossBar', 'UI_MapPing',
       'UI_TitleLinkButtons', 'UI_Sunflower_Loading'],
    );
  } catch {
    atlas = null; // 素材缺失时回退程序化生成
  }
  (window as unknown as { __swAtlas?: SpriteAtlas | null }).__swAtlas = atlas; // 调试/探针句柄
  // 素材重制热补丁(2026-08-19):已装 pack 在菜单显示前应用——此刻无 chunk 烘焙、
  // 无懒加载竞争,vimages.set 直接覆盖,后继 ensureVImage 的 has 检查命中早退。
  // 失败静默(坏包不阻断启动;面板导入路径有显式报错)
  if (atlas) {
    remasterRuntime = new RemasterRuntime(atlas);
    remasterManager = new RemasterManager(remasterRuntime, () => assetVersion());
    const rt = remasterRuntime;
    remasterRuntime.onApplied = (info) => {
      // UI 派生缓存:物品图标 dataURL 缓存按物品 id 键不自动失效(Atlas 替换须清);
      // buff 栏直链 <img src> 经钩子取 runtime 的 objectURL 覆盖。
      // 资源包物品图(vanilla/Item_N.png,M13)同须清——vicon 整图直取后旧 dataURL 钉死
      if (info.hasItemAtlas || info.files.some((f) => /^vanilla\/Item_\d+\.png$/.test(f))) clearIconCache();
      setRemasterBuffIcon((id) => rt.buffIconUrl(id));
    };
    try {
      // ★超时保护:IDB v2 升级遇旧标签页持有 v1 连接不让路时 openDb 永久 pending
      // (onversionchange 只对同代码版本生效;生产首次部署旧页在跑旧 bundle)——
      // 素材包是增强不是必需,8s 不到就放弃,绝不阻断启动
      await Promise.race([
        remasterManager.applyInstalled(),
        new Promise<void>((resolve) => setTimeout(resolve, 8000)),
      ]);
    } catch (err) {
      console.warn('[remaster] 启动应用素材包失败(已跳过):', err);
    }
    // ---- 资源包(M13):与 remaster 共享同一注入 runtime(buff 钩子/弹幕覆盖/重烘链
    //      合流);启用包在菜单显示前应用,zip 读不出来时静默降级会话态 ----
    try {
      const rpManager = initResourcePacks(remasterRuntime);
      await Promise.race([
        rpManager.applyInstalled(),
        new Promise<void>((resolve) => setTimeout(resolve, 8000)),
      ]);
      (window as unknown as { __swResourcePacks?: ResourcePackManager }).__swResourcePacks = rpManager;
    } catch (err) {
      console.warn('[resourcepacks] 启动应用资源包失败(已跳过):', err);
    }
    const w = window as unknown as { __swRemaster?: { runtime: RemasterRuntime; manager: RemasterManager } };
    w.__swRemaster = { runtime: remasterRuntime, manager: remasterManager }; // 调试/探针/面板句柄
  }
}

/** 素材重制热补丁运行时(main.ts 装配;__swRemaster 暴露) */
let remasterRuntime: RemasterRuntime | null = null;
let remasterManager: RemasterManager | null = null;

function enterGameHooks() {
  const g = flow?.game ?? undefined;
  inGame = true;
  (window as unknown as { __swTiles: typeof TILE_BY_KEY }).__swTiles = TILE_BY_KEY;
  (window as unknown as { __swItems: typeof ITEM_BY_KEY }).__swItems = ITEM_BY_KEY;
  (window as unknown as { __swVANILLA_ITEM_KEY_BY_ID: typeof VANILLA_ITEM_KEY_BY_ID }).__swVANILLA_ITEM_KEY_BY_ID = VANILLA_ITEM_KEY_BY_ID;
  (window as unknown as { __swITEM_DEFS: typeof ITEM_DEFS }).__swITEM_DEFS = ITEM_DEFS;
  (window as unknown as { __swCombatWeapon: typeof combatWeapon }).__swCombatWeapon = combatWeapon;
  (window as unknown as { __swSetPool?: (p: number[] | null) => void }).__swSetPool = setDebugPool;
  // gore 池只读视图（模块级 livePool 不经 Game 实例——探针断言气泡族/碎块推进用）
  (window as unknown as { __swGore?: typeof liveGorePieces }).__swGore = liveGorePieces;
  // 素材重制热补丁:运行中替换 tile/wall sheet → ChunkCache 消费登记精确重烘
  // (★禁 invalidateAll——21 万次重解码风暴前科);闭包每次现取 game,换世界安全
  if (remasterRuntime) {
    remasterRuntime.onSheetReplaced = (file) => {
      flow?.game?.chunks?.onSheetReplaced(file);
    };
  }
  // ---- 移动端虚拟 Inventory/Esc 键入口(mobile-adaptation-plan 模块①):触屏系统
  //      列的背包/暂停钮 = input.tapVirtual('Inventory') 虚拟边沿在此转调同一优先
  //      级链。★origin==='virtual' 门防双触发:真实键盘 Escape 既走上方 window
  //      keydown 监听(preventDefault/打字豁免是物理专属),也会派发进
  //      keydownHandlers——不过滤则同一次按键链跑两遍(Esc 开面板→瞬关)。
  //      虚拟沿自带 virtualAction='Inventory',不再经 isBound 反查(code 是绑定
  //      表首个码,重绑后仍一致)
  if (g) {
    g.input.keydownHandlers.push((code, ke) => {
      if (ke.origin !== 'virtual') return;
      // action 口(系统列背包/暂停钮):intent 显式携带。SW-BN2 起 intent=触发源形态
      // 'escape'(Esc 键面)/'inventory'(背包钮/其余绑定键)/'pause'(触屏暂停小钮)
      if (ke.virtualAction === 'Inventory') {
        runInventoryEscapeChain(g,
          ke.virtualIntent === 'inventory' ? 'inventory'
            : ke.virtualIntent === 'pause' ? 'pause'
            : ke.virtualIntent === 'escape' ? 'escape'
            : code === 'Escape' ? 'escape' : 'inventory');
        return;
      }
      // code 口直发 Escape(调试脚本/未来控件):归还 Inventory 链 escape 形态
      // (默认绑定表含 Escape;用户清空该绑定时按表不响应=重绑一致)
      if (code === 'Escape' && isBound('Inventory', 'Escape')) {
        runInventoryEscapeChain(g, ke.virtualIntent === 'inventory' ? 'inventory' : 'escape');
      }
    });
  }
}

// ---- M6 拍照模式接线（F4）：Input 直连 + DOM HUD 让位 ----
// 原版相机模式激活时界面层从 Capture Manager Check 截断（Main.cs:45584-93）,
// canvas 侧由 Renderer 集成点承担;DOM 侧快捷栏/选中名/buff 栏（原版 Hotbar/
// MouseText/Resource-Buffs 层,均在截断层之后,Main.cs:44244 层序 + :42608 buff
// 跳过）需随激活隐藏——否则快捷栏 fixed@top:0 遮挡相机按钮组且吞点击。
// .sw-camera-hide 用 !important 压过 UI 内联 display（refreshBuffs 每秒重写）
let cameraModeWired = false;
function initCameraModeWiring(game: Game): boolean {
  const cm = game.renderer.captureMode;
  if (!cm.input) cm.input = game.input;   // mouseHeld/rightDown 电平面（render 无右键）
  if (cameraModeWired) return true;
  cameraModeWired = true;
  const style = document.createElement('style');
  style.textContent = '.sw-camera-hide { display: none !important; }';
  document.head.appendChild(style);
  cm.onActiveChange = (active) => {
    const u = ui as unknown as { hotbarEl?: HTMLElement; hotbarNameEl?: HTMLElement; buffBar?: HTMLElement };
    u.hotbarEl?.classList.toggle('sw-camera-hide', active);
    u.hotbarNameEl?.classList.toggle('sw-camera-hide', active);
    u.buffBar?.classList.toggle('sw-camera-hide', active);
  };
  return true;
}

// ---- 键盘：背包/暂停/保存 ----
/** 暂停/设置浮层（原版 IngameOptions 等价面）开启：game.paused = true（CanPauseGame
 *  Main.cs:17493 的 ingameOptionsWindow 臂,事件驱动同效——autoPause 臂逐帧重算另见
 *  Game.applyAutoPauseUI,两者是原文析取式 :17496/:17500 的两支）。SW-BN3 2026-09-07
 *  起 Esc 链对齐原版（Player.cs:5026 背包开着 Esc=关背包）,浮层入口=背包内设置钮
 *  （DrawInterface_29_SettingsButton Main.cs:46287-46301）+ 触屏暂停钮 + 死亡态链支。
 *  ★SW-RB8c 2026-09-08 勘误（IngameOptions.cs:66-92 原文）：Open() 首段
 *  `Main.playerInventory = false`（:70）——开浮层【收背包】（BN3「Open 不清背包/
 *  浮层叠于背包」系误读:原版设置窗与背包两态互斥）;收浮层=Close() 置
 *  playerInventory=true（:108）回背包,见 closeInGamePause。 */
function openInGamePause(game: Game): void {
  // ★SW-RB8c：Open 面=收背包（IngameOptions.cs:70;死亡态背包本关=no-op 同相）
  // + autoPause 属主移交（背包臂 :17500 退出→浮层臂 :17496 接管,防旧属主恢复
  // 在浮层期误解暂停）
  game.releaseAutoPauseOwnership();
  if (ui.inventoryOpen) ui.closeInventory();
  game.paused = true;
  pausePanel = ui.showPause({
    onResume: () => {
      closeInGamePause(game);   // ★SW-RB8c：Close 面=收浮层+回背包（:108）
    },
    onSave: () => flow?.doSave(),
    // onExport(json 档)2026-09-06 用户定案:退出正式 UI,保留 __swFlow.doExportSave()
    // 调试通道(Shift+F5/控制台);世界备份走世界列表的 .wld 导出
    onSettings: () => flow?.openSettings(true),
    onBestiary: () => flow?.openBestiary(),
    // ★2026-09-07 刀 3:住房面板停车坪(vanilla 布局)——原版 EquipPage=1 住房页已
    // 覆盖查询/指定,HousingPanel 右缘条自暂停菜单调起;classic 布局仍走背包簇格钮
    // ★刀 5 停车坪:道具搜索/天气/时间/玩家列表/旅程/研究同迁(vanilla 门控)
    ...(options.data.inventoryLayout === 'vanilla' ? (() => {
      const isJourney = game.player.appearance?.difficulty === 3;
      return {
        onHousing: () => { pausePanel = null; game!.paused = false; flow?.openHousing?.(); },
        onItemSearch: () => { pausePanel = null; game!.paused = false; ui.openItemSearch(); },
        onWeather: () => { pausePanel = null; game!.paused = false; showJourneyQuickGate('weather', () => { game.renderer.weatherPanelOpen = !game.renderer.weatherPanelOpen; }); },
        onTime: () => { pausePanel = null; game!.paused = false; showJourneyQuickGate('time', () => { game.renderer.timePanelOpen = !game.renderer.timePanelOpen; }); },
        ...(game.net?.active ? { onPlayerList: () => { pausePanel = null; game!.paused = false; openPlayerListPanel(game); } } : {}),
        ...(isJourney ? {
          onJourney: () => { pausePanel = null; game!.paused = false; openJourneyPowersPanel(game); },
          onResearch: () => { pausePanel = null; game!.paused = false; openResearchPanel(game); },
        } : {}),
      };
    })() : {}),
    onQuit: () => {
      pausePanel = null;
      game!.paused = false;
      inGame = false;
      flow?.quitToMenu();
    },
  });
}

/** ★SW-RB8c 2026-09-08：浮层收起统一出口（链 closePause 支/onPauseMenu Close 臂/
 *  浮层 Resume 钮三面共用）——原版 IngameOptions.Close()（:99-110,setKey==-1 门）
 *  置 `Main.playerInventory = true`（:108）＝关设置【必回背包】;BN3「Close 不清
 *  playerInventory/只收浮层不动背包」系误读（Open/Close 两端都写 playerInventory:
 *  Open 收 :70/Close 开 :108,两态互斥）。死亡态豁免重开（RB6b:死亡期本仓逐 tick
 *  强收背包,重开=1t 闪窗伪响应;原版死亡态 Close 同置 playerInventory=true 但随即
 *  被死亡 UI 收支,本仓取稳态面,登记）。面板切换出口（onHousing/onItemSearch 等件
 *  停车坪）不经此——SW 自有面板面,原版无对应物。 */
function closeInGamePause(g: Game): void {
  pausePanel?.remove();
  pausePanel = null;
  g.paused = false;
  g.input.uiBlocking = false;
  if (!g.player.dead) ui.openInventory(true);   // IngameOptions.Close :108（alive 面）
}

/** Inventory/Esc 优先级态机执行器（SW-BN2 2026-09-07：决策核提取到 ui/escapeChain
 *  的 resolveEscapeChain 纯函数——支序/原版锚/用户令分歧全锚在该文件头注,此处只
 *  做状态现采 + 动作落盘。物理键盘/虚拟沿共用此唯一实现,重绑即时跟随绑定表）。
 *  intent 触发源形态（EscapeIntent）：'escape'=物理 Esc 键; 'inventory'=其余
 *  Inventory 绑定键与触屏背包钮; 'pause'=触屏暂停小钮。 */
function runInventoryEscapeChain(game: Game, intent: 'escape' | 'inventory' | 'pause'): void {
  const act = resolveEscapeChain({
    summonOpen: !!game.summonPanel?.open,
    fullMapOpen: game.renderer.fullMap.open,
    pauseOpen: pausePanel != null,
    npcDialogActive: game.npcDialogActive,
    signDialogActive: ui.signDialogActive,
    // 模态面板（图鉴/研究/成就/旅程/表情/手册等）开着：链让位（原版 inFancyUI 支
    // Player.cs:4987-4989——各面板自带 Esc 关闭监听,此沿不落背包/暂停）
    uiBlocking: game.input.uiBlocking,
    // SW-RB6b 2026-09-07：死亡/幽灵态 → 暂停浮层开关切换（TryOpeningInGameOptions
    // BasedOnInput :17391-17410,UpdateDead :17187 调用——原版此态 Inventory 沿不落
    // ToggleInv,永不开关背包）
    dead: game.player.dead,
    inventoryOpen: ui.inventoryOpen,
  }, intent);
  switch (act) {
    case 'closeSummon':
      game.summonPanel!.close();
      game.input.uiBlocking = false;
      break;
    case 'closeFullMap':
      game.renderer.fullMap.open = false;
      break;
    case 'closePause':
      // 原版 ingameOptionsWindow 支（Player.cs:4978-4986 IngameOptions.Close）：
      // ★SW-RB8c 2026-09-08 勘误：Close() 置 playerInventory=true（IngameOptions.cs
      // :108）＝收浮层+回背包（BN3「只收浮层不动背包」误读已撤;autoPause 开时回包
      // 背包即被 :17500 臂续暂停=原文 :17496→:17500 臂交接同相;链序 pauseOpen 在
      // inventoryOpen 之前,无"Esc↔暂停"死循环）
      closeInGamePause(game);
      break;
    case 'closeNpcDialog':
      // Player.cs:5000-5013 talkNPC 支：先关对话（Shop 级联关,closeNpcDialog
      // →npcShopClose）——★SW-RB8c 2026-09-08 补 :5012 `Main.playerInventory =
      // false` 半边：原版本支【无条件】清 playerInventory（对话开着 Esc=对话+背包
      // 同收）,旧实现只关对话=背包开着对话态 Esc 背包残留。不落暂停。
      // NpcDialog 自身 Esc 捕获监听已拦截物理键,此分支承接虚拟沿（触屏暂停钮/
      // 重绑键）与 dialogNpc 残余态
      game.closeNpcDialog();
      if (ui.inventoryOpen) ui.closeInventory();
      break;
    case 'closeSign':
      ui.closeSignDialog();   // Player.cs:5014-5016 sign 支
      break;
    case 'noop':
      break;                  // uiBlocking 模态让位（escapeChain.ts 头注）
    case 'openPause':
      openInGamePause(game);
      break;
    case 'closeInventory':
      ui.closeInventory();
      break;
    case 'openInventory':
      ui.openInventory();     // Player.cs:5023-5025 OpenInventory
      break;
  }
}

window.addEventListener('keydown', (e) => {
  const game = flow?.game;
  if (!inGame || !game) return;
  // 输入框内打字不算操作键位（合成搜索框等）：除 Escape 外全部放行给输入框
  const tgt = e.target as HTMLElement | null;
  const typing = !!tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
  if (typing && e.code !== 'Escape') return;
  // ---- Inventory 动作（SW-BN2 2026-09-07 键位表对齐原版：Inventory=Escape
  //      （PlayerInput.cs:2074）,Grapple=E（:2075）——判定在 code 无关处,重绑后
  //      跟随。Esc=开背包,二段=关背包,开关循环（SW-BN3 2026-09-07 对齐原版
  //      ToggleInv :5026,BN2 的「Esc=暂停浮层」用户令分歧已撤销;链细节见
  //      ui/escapeChain.ts 头注）;其余绑定键=背包 toggle）----
  if (isBound('Inventory', e.code)) {
    e.preventDefault();
    // SW-RB6b 2026-09-07：OS 自动重复沿不重触发链（原版 JustPressed.Inventory=
    // 按下沿一发,PlayerInput.cs Triggers.JustPressed 边沿语义;Input.ts keydown
    // 派发已滤 e.repeat,本监听器独立注册须自滤）。
    if (!e.repeat) runInventoryEscapeChain(game, e.code === 'Escape' ? 'escape' : 'inventory');
    return;
  }
  // MapFull（M）等其余键位动作在 Game 的 keydownHandlers 统一派发（M5）——
  // 此处不再重复（曾双派发=开+关抵消）
  // ---- M6 拍照模式（F4，PlayerInput.cs:1926 默认）：CaptureInterface.Update
  //      :982-987 边沿门（死亡/幽灵不可开,再按可关;截图锁定中由
  //      toggleCamera 内 CameraLock 门自拒）。input 直连 = 相机界面需要
  //      mouseHeld/rightDown 电平（render 参数无右键面）;首次按下时绑一次。
  //      ★Shift+F4 = 迷雾消除/恢复切换（下方 case 'F4',首用确认门）,不触发相机模式
  // ★SW-FX16 2026-09-10：Shift 豁免从「全键」收窄到「Shift 组合调试键保留集」
  //  （F1-F5/F10——各键的 Shift 组合臂:Shift+F1/F2 像素画·无敌(Game.ts)、F3 碰撞盒/
  //  F4 迷雾/F5 录制/F10 地图传送）。原版 ToggleCameraMode 触发器无 Shift 概念
  //  （Player.cs 相机模式支直读 trigger）,旧全键豁免让「重绑相机键到非调试键 +
  //  按住 Shift」整类死键。保留集内键保持调试优先(缺省 F4 ∈ 集,缺省行为零变)。----
  if (isBound('ToggleCameraMode', e.code)
    && (!e.shiftKey || !SHIFT_DEBUG_RESERVED.has(e.code)) && initCameraModeWiring(game)) {
    e.preventDefault();
    game.renderer.captureMode.toggleRequest(game.player, game.world);
    return;
  }
  // ---- Shift 组合键（2026-08-28 用户澄清终态）：各键保留各自原功能,仅首次使用
  //  时弹同款确认门（featureGate 按功能分键持久）;★Shift+F10 = 地图点击传送开关,
  //  ★Shift+F2 = 无限生命和魔力（Game.toggleDebugGod）——均不互相顶替 ----
  switch (e.code) {
    case 'KeyS':
      // Ctrl+S 快速存档（原 F6 让位召唤面板后迁入）
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        flow?.doSave();
      }
      break;
    case 'F3':
      // 调试碰撞盒面板迁 Shift+F3（2026-08-20：裸 F3 让位原版 Loadout3 配装热键
      // （PlayerInput.cs:1925），Game 键位派发接管；grep scripts/_*.mjs 零 F3
      // 键引用，无探针破坏）
      if (e.shiftKey) {
        e.preventDefault();
        game.renderer.debugMode = !game.renderer.debugMode;
        ui.toast(game.renderer.debugMode ? '调试面板已开启（碰撞盒高亮）' : '调试面板已关闭');
      }
      break;
    case 'F4':
      // ★SW-BJ15 2026-09-07：Shift+F4 = 全图迷雾消除/恢复（切换式：再按恢复到
      // 消除前的探索快照——World.toggleFullReveal 深拷贝位图快照+版本 bump 整幅
      // 重建；首用确认门;非 Shift F4 = 相机模式（更早分支已 return））
      if (e.shiftKey) {
        e.preventDefault();
        showFeatureGate('fog', '全图迷雾消除（再按可恢复）', () => {
          const revealed = game.world.toggleFullReveal();
          ui.toast(revealed ? '已消除全图迷雾（再按 Shift+F4 恢复）' : '已恢复迷雾快照');
        });
      }
      break;
    case 'F5': {
      // 长按 F5 = 行为录制窗开关（按下计时，keyup 判时长——见文件尾 keyup 监听）；
      // 短按仍是一键调试报告（报告尾部带 behaviorTail 最近 2000 条事件）。
      // Shift+F5 = 方块标注模式：点击画面直接标记问题格（红圈+序号），再按关闭；
      // 标注会随 F5 报告 tiles.marks 自动带出（含格明细+邻域链）。
      // e.repeat 过滤：长按系统重发 keydown 不重置计时锚
      e.preventDefault();
      if (e.repeat) break;
      if (e.shiftKey) { toggleAnnotate(); break; }  // 不设 f5DownAt → keyup no-op
      f5DownAt = performance.now();
      break;
    }
    case 'F6':
      e.preventDefault();
      // 召唤面板(调试,原版无;原 F6 快速存档挪 Ctrl+S)——首用确认门
      showFeatureGate('summon', '召唤面板', () => game.toggleSummonPanel());
      break;
    case 'F7':
      e.preventDefault();
      // 导线显示——首用确认门（2026-08-28 用户澄清:各键保原功能+确认门）
      showFeatureGate('wires', '导线显示', () => {
        game.forceShowWires = !game.forceShowWires;
        ui.toast(game.forceShowWires ? '导线显示:强制开启' : '导线显示:手持电路工具时');
      });
      break;
    case 'F8':
      e.preventDefault();
      // 怪物生成开关——首用确认门
      showFeatureGate('spawn', '怪物生成开关', () => {
        game.enemySpawnEnabled = !game.enemySpawnEnabled;
        ui.toast(game.enemySpawnEnabled ? '怪物生成已开启' : '怪物生成已关闭（已有怪物不受影响）');
      });
      break;
    case 'F9':
      e.preventDefault();
      // 全画面照亮——首用确认门
      showFeatureGate('bright', '全画面照亮', () => {
        game.renderer.fullbright = !game.renderer.fullbright;
        ui.toast(game.renderer.fullbright ? '已开灯：全画面无暗影' : '已关灯：恢复正常光照');
      });
      break;
    case 'F10':
      e.preventDefault();
      if (e.shiftKey) {
        // ★Shift+F10 = 地图点击传送开关（2026-08-28 用户澄清终态：仅此键承担）——
        //   首用确认门,确认后开合；非 Shift F10 = 鼠标位置传送（保留）
        showFeatureGate('maptp', '地图点击传送', () => {
          game.mapClickTeleportEnabled = !game.mapClickTeleportEnabled;
          ui.toast(game.mapClickTeleportEnabled
            ? '地图点击传送已启用：全屏地图点击选点，再点同一点传送'
            : '地图点击传送已禁用');
        });
      } else {
        // 非组合 F10（鼠标位置传送）已禁用（2026-08-28 用户要求）——原版也无此键
      }
      break;
  }
});

// ---- M6 拍照模式滚轮门（Player.cs:24903-24907）：相机模式激活且非全屏地图
//      时,滚轮 = 切换相机模式（CaptureInterface.Scrolling）而非视野缩放。
//      capture 相位拦截：Game 的滚轮消费点在 update 段（先于渲染执行）,
//      渲染端回写清零已晚一帧;地图开着时放行——滚轮归地图缩放（原版分支序）。
//      pendingWheel ±120/notch = 原版 ScrollWheelDelta 计数语义 ----
window.addEventListener('wheel', (e) => {
  const g = flow?.game;
  const cm = g?.renderer.captureMode;
  if (!g || !cm?.active) return;
  if (g.renderer.fullMap.open) return;
  cm.pendingWheel += Math.sign(e.deltaY) * 120;
  e.stopPropagation();
}, { capture: true, passive: true });

// ---- F5 长按判时长（keydown 只记锚，keyup 结算）----
let f5DownAt = 0;
/** 长按阈值 ms：≥ 此值视为长按（行为录制窗开关），否则短按（调试报告） */
const F5_LONGPRESS_MS = 500;
window.addEventListener('keyup', (e) => {
  const game = flow?.game;
  if (!inGame || !flow || !game || e.code !== 'F5' || !f5DownAt) return;   // ★SW-BJ5：+!flow 收窄（cumulativePlayMs 直读）
  const held = performance.now() - f5DownAt;
  f5DownAt = 0;
  if (held < F5_LONGPRESS_MS) {
    // 短按：一键调试报告（机器优先 JSON）——尾部带 behaviorTail（常开环形最近
    // 2000 条：出问题后再按 F5 也能拿到事发前的输入/方块/生死序列）
    // + audioTail（音效/BGM 播放序列,sfx 800 / bgm 200 条——错误音效排查时间线）
    const r = downloadDebugReport(game, {
      // SW-BJ5 2026-09-07：累计口径（与世界列表/存档头同义）——旧值=会话净时长,两口径混写曾致排查误判"疑似单会话值"
      playTimeMs: flow.cumulativePlayMs,
      behaviorTail: game.recorder.snapshotTail(2000),
      audioTail: game.audioRec?.tail(800, 200) ?? null,
      tileFrames: tileFrameCapture.exportLight(),
    });
    ui.toast(r.triggered ? `调试报告已生成：${r.filename}` : '调试报告已生成（浏览器拦截下载，可从 __swDebugReport 取）');
    return;
  }
  // 长按：录制窗开关。关窗 = 导出开窗以来全部事件并下载（复用 debug-report 下载机制）
  const rec = game.recorder;
  const recording = rec.toggle();
  game.audioRec?.toggle();   // 音效/BGM 双通道窗同步开合（与主行为窗同 tick 边界）
  if (recording) {
    tileFrameCapture.start();   // 录制窗同步开：快照环/截图环/重烘账本全量
    ui.toast('行为录制中…再长按 F5 结束并保存（含动画帧捕获+音效序列）');
    return;
  }
  const dump = rec.export();
  // 帧捕获全量并入录制 dump（聚合+异常环+快照+截图+重烘账本）
  (dump as unknown as { tileFrames?: unknown }).tileFrames = tileFrameCapture.exportAndStop();
  // 音效录制两通道并入 dump.audio（sfx/bgm 各自 meta+events,见 debug/AudioRecorder）
  const audioDump = game.audioRec?.export() ?? null;
  if (audioDump) (dump as unknown as { tileFrames?: unknown; audio?: AudioRecExport }).audio = audioDump;
  const worldName = dump.meta.worldName.replace(/\s+/g, '_') || 'world';
  const filename = `behavior-log-${worldName}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  let triggered = false;
  try {
    downloadText(filename, JSON.stringify(dump));
    triggered = true;
  } catch { triggered = false; }
  const tr = dump.meta.truncated ? `（风暴淘汰截断，起点已不可达）` : '';
  const au = audioDump ? `；音频 sfx ${audioDump.sfx.meta.eventCount}/bgm ${audioDump.bgm.meta.eventCount}` : '';
  ui.toast(triggered
    ? `行为录制已保存：${filename}（${dump.meta.eventCount} 事件${au}）${tr}`
    : `行为录制 ${dump.meta.eventCount} 事件${au}${tr}（下载被拦截，可从 __swRec.export() 取）`);
});

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- 方块标注模式（Shift+F5）：标记问题方块，导出标注 + 地图给开发者 ----
function toggleAnnotate() {
  const game = flow?.game;
  if (!game) return;
  game.annotateMode = !game.annotateMode;
  if (game.annotateMode) {
    ui.showAnnotatePanel({
      onExportMarks: exportMarks,
      onExportMap: exportMap,
      onClear: () => {
        if (!flow?.game) return;
        flow.game.marks = [];
        ui.updateAnnotateCount(0);
      },
      onClose: () => toggleAnnotate(),
      onToggleFix: () => {
        if (!flow?.game) return;
        flow.game.fixTexMode = !flow.game.fixTexMode;
        ui.setFixModeLabel(flow?.game.fixTexMode);
        ui.toast(flow?.game.fixTexMode ? '贴图纠错模式：点击方块打开其贴图表' : '已关闭贴图纠错模式');
      },
      onExportFixes: exportTexFixes,
    });
    ui.updateAnnotateCount(game.marks.length);
    ui.toast('标注模式已开启：点击方块标记问题格（红圈+序号），按 F5 出报告自动携带标注；Shift+F5 关闭');
  } else {
    ui.closeAnnotatePanel();
    ui.toast(game.marks.length ? `标注模式已关闭（${game.marks.length} 个标注保留，F5 报告仍会带出）` : '标注模式已关闭');
  }
}

function exportMarks() {
  const game = flow?.game;
  if (!game) return;
  const g = game;
  const st = g.world.store;
  const marks = g.marks.map((m, i) => {
    const idx = st.idx(m.x, m.y);
    const t = st.type[idx];
    const def = TILE_DEFS[t];
    const nb: Record<string, { key: string | null; fx: number; fy: number } | null> = {};
    const dirs: Array<[string, number, number]> = [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0],
      ['nw', -1, -1], ['ne', 1, -1], ['sw', -1, 1], ['se', 1, 1]];
    for (const [tag, dx, dy] of dirs) {
      const nx = m.x + dx, ny = m.y + dy;
      if (!st.inBounds(nx, ny)) { nb[tag] = null; continue; }
      const ni = st.idx(nx, ny);
      const nt = st.type[ni];
      nb[tag] = nt === 0 ? null : { key: TILE_DEFS[nt]?.key ?? String(nt), fx: st.frameX[ni], fy: st.frameY[ni] };
    }
    let sheetInfo: { sheet: number; name: string; png: string; oob: boolean } | null = null;
    const sheetId = def?.vanilla?.sheet;
    if (sheetId !== undefined && g.renderer.atlas) {
      const meta = g.renderer.atlas.vmeta(sheetId);
      const img = meta ? g.renderer.atlas.vimages.get(meta.sheet) : null;
      if (meta && img) {
        const oob = def!.vanilla!.frame === 'style'
          && (st.frameX[idx] + meta.grid[0] > img.width || st.frameY[idx] + meta.grid[1] > img.height);
        sheetInfo = { sheet: sheetId, name: meta.name, png: `${img.width}×${img.height}`, oob };
      }
    }
    return {
      no: i + 1, x: m.x, y: m.y,
      typeId: t, typeKey: def?.key ?? null, typeName: def?.name ?? null,
      frameX: st.frameX[idx], frameY: st.frameY[idx],
      wall: st.wall[idx],
      liquid: st.liquid[idx], liquidType: st.liquidType[idx],
      wallName: WALL_DEFS[st.wall[idx]]?.name ?? null,
      neighbors: nb, sheetInfo,
    };
  });
  const out = {
    worldName: g.world.name, size: [g.world.w, g.world.h],
    player: { x: Math.floor(g.player.x / 16), y: Math.floor(g.player.y / 16) },
    exportedAt: new Date().toISOString(),
    marks,
  };
  downloadText(`marks-${g.world.name.replace(/\s+/g, '_')}.json`, JSON.stringify(out, null, 2));
  ui.toast(`已导出 ${marks.length} 处标注`);
}

function exportMap() {
  const game = flow?.game;
  if (!game) return;
  const json = saveGameCompat(game);
  downloadText(`map-${game.world.name.replace(/\s+/g, '_')}.json`, json);
  ui.toast('已导出地图存档');
}

function exportTexFixes() {
  const game = flow?.game;
  if (!game) return;
  const fixes = ui.texFixes;
  if (!fixes.length) { ui.toast('还没有记录任何贴图纠错'); return; }
  const out = {
    worldName: game.world.name, size: [game.world.w, game.world.h],
    exportedAt: new Date().toISOString(),
    note: '每条 = 地图坐标处应使用的正确帧偏移（对应 Tiles_N 表的像素偏移）',
    fixes,
  };
  downloadText(`texfix-${game.world.name.replace(/\s+/g, '_')}.json`, JSON.stringify(out, null, 2));
  ui.toast(`已导出 ${fixes.length} 处贴图纠错`);
}

function saveGameCompat(g: Game): string {
  // SW-BJ5 2026-09-07：导出地图档同累计口径（旧值=会话净时长,与槽位/quick 档不一致）；
  // 调用面 exportMap 已有 game 非空门（⇒flow 在场）,此处 `?.` 仅为类型收窄兜 0
  return saveGame(g.world, g.player, flow?.cumulativePlayMs ?? 0, g.townNpcsForSave(), g.eventsForSave(), g.pillarNpcsForSave(), g.pressurePlatesForSave());
}

// 暴露 tile/key 常量给调试控制台
void TILE_BY_KEY; void T; void ITEM_BY_KEY;

// 观察进游戏事件（mainFlow 的 enterGame 发生在 Game 回调里，这里轮询 __swGame 变化）
let lastGameRef: Game | null = null;
setInterval(() => {
  const g = (window as unknown as { __swGame?: Game }).__swGame ?? null;
  if (g && g !== lastGameRef) {
    lastGameRef = g;
    inGame = true;
    enterGameHooks();
  } else if (!g && lastGameRef) {
    lastGameRef = null;
    inGame = false;
  }
}, 250);

// ---- 启动 ----
kvHas('sandboxworld.quicksave').then(async () => {
  // ① 音频开启拦截（所有流程前置，2026-08-24 用户要求）：AC 被自动播放策略
  //    挂起 → 纯黑幕+白色耳机图标+两行提示，点击/按键任意位置恢复音频放行；
  //    未拦截（AC running）或调试旁路/探针（navigator.webdriver）直通
  // ② splash（原时序不变）：RE-LOGIC 字样烘在每组 Splash_N_2 前景层（透明底
  //    PNG，透出 back 场景）；vanilla-ui/logo_1..8.png 是死资产不使用。
  //    时序全程 ~10.3s 不快进；资源下载等待 = splashGate 迟解
  // options/语言先行（音频门文案需要 Lang；mainFlow 内 options.load() 幂等）
  await options.load();
  await Lang.init(options.data.lang);
  const bootParams0 = new URLSearchParams(location.search);
  const bypassBoot = bootParams0.has('play') || bootParams0.has('quickload') || bootParams0.has('vuidemo');
  // ★首访资产前置(2026-08-25 用户要求):音频门出现前先把暖缓存跑起来并等标题曲
  //   (Music_50/51,位于 p0 最前,到位即含过渡图族)入缓存——保证点击放行即有声、
  //   过渡时间线有画。dev/?nosw/http 立即跳过;慢网 30s 上限降级放行不卡死。
  //   等待指示=原版 LoadingSunflower 帧动画(UI_Sunflower_Loading.png 52×1007
  //   竖条 19 帧,帧序 :52041-52060 同款 Frame(1,19,0,(帧/3+10)%19),2026-08-25
  //   用户要求替换脉冲点)
  // 懒 worker 预取钩子注入(音频门等待窗口借 SW 回填;见 WorldGenClient/SaveClient 尾注)
  setLazyWorkerPrefetch(() => { prefetchWorldGenWorker(); prefetchSaveWorker(); });
  // ★启动幕生命周期(2026-08-25 用户要求"门后黑屏间隙铺向日葵"):向日葵幕存活至
  //   过渡页三层图挂载(首帧绘出)才交接——覆盖 音频门点击后 → loadAssets → 过渡图
  //   缓存等待 的全部无图窗口,消灭"以为故障黑屏"。z=10000:门(10001)之下、
  //   过渡页(30)之上
  let bootVeil: HTMLElement | null = null;
  if (!bypassBoot) {
    const veil = document.createElement('div');
    veil.id = 'sw-boot-prime';
    veil.innerHTML = `<style>
      #sw-boot-prime { position: fixed; inset: 0; z-index: 10000; background: #000;
        display: flex; align-items: center; justify-content: center; }
    </style><canvas width="52" height="53"></canvas>`;
    document.body.appendChild(veil);
    bootVeil = veil;
    // ★资源指示器提前挂载(2026-08-27 用户要求):从向日葵幕阶段就显示
    //   "资源加载中 · N%"(badge z=10002 浮于本幕 10000 之上),不再等到过渡图
    //   出现才出现——进度覆盖 primeBootAssets 等待窗口。warm 已由
    //   primeBootAssets 内部自启,此处 state 即有字节账可读。
    mountAssetBadge();
    const cv = veil.querySelector('canvas') as HTMLCanvasElement;
    const cctx = cv.getContext('2d')!;
    const sfImg = new Image();
    let sfOk = false;
    sfImg.onload = () => { sfOk = true; };
    sfImg.src = 'sprites/vanilla-ui/UI_Sunflower_Loading.png';   // vanilla-ui 散件常驻,首访即可得
    const sfT0 = performance.now();
    const sfStep = () => {
      if (!veil.isConnected) return;   // 撤除即停
      if (sfOk && sfImg.width > 0) {
        const row = (Math.floor((performance.now() - sfT0) / 50) + 10) % 19;
        cctx.clearRect(0, 0, 52, 53);
        cctx.drawImage(sfImg, 0, row * 53, 52, 53, 0, 0, 52, 53);
      }
      requestAnimationFrame(sfStep);
    };
    requestAnimationFrame(sfStep);
    try { await primeBootAssets(30_000); } catch { /* 降级放行 */ }
    // ★幕不在此撤:继续盖住音频门之后的 loadAssets/过渡图缓存等待间隙
  }
  if (!bypassBoot && shouldShowAudioGate() && (await audio.detectAutoplayBlocked())) {
    await showAudioGate(() => audio.resumeNow());
  }
  // 素材装载与音频门并行（门期间后台预载，点击放行即有图可显）
  const assetsP = loadAssets();
  const splashGate: { resolve: () => void } = { resolve: () => {} };
  const splash = showSplash({
    loading: new Promise<void>((r) => { splashGate.resolve = r; }),
    quick: audio.muted || audio.volume === 0,   // 原版 quickSplash（musicVolume==0）
    canSkip: assetsDownloadIdle,                // 跳过门(2026-08-25):资源下载空闲才允许
  });
  // ★启动幕交接(消灭门后黑屏间隙):轮询至过渡页三层图已挂载(首帧绘出)或过渡页
  //   已收场,才撤向日葵幕。post-prime 缓存必已含过渡图 → 交接在百毫秒级完成
  if (bootVeil) {
    const handoff = setInterval(() => {
      const sp = document.getElementById('sw-splash');
      const back = sp?.querySelector('.back') as HTMLElement | null;
      if ((sp && back && back.style.backgroundImage) || !sp) {
        clearInterval(handoff);
        // ★延迟 1000ms 再撤(2026-08-25 用户要求:500ms 基础上再延 500):向日葵
        //   与过渡页并存交接
        setTimeout(() => {
          bootVeil?.remove();
          bootVeil = null;
        }, 1000);
      }
    }, 100);
  }
  void audio.play('title');   // ★标题曲随 splash 出现即起（用户要求，非进标题才播；
                              // 音频门/首次手势解锁已保 AC running）
  await assetsP;
  if (atlas) UITextures.setAtlas(atlas);
  await Promise.all([UIFont.load(), Lang.init(options.data.lang)]);
  VUI.init(root);
  VUI.startLoop(); // 自愈帧循环（HMR 杀不死，看门狗 1s 内重启）
  flow = createFlow(root, atlas, ui, audio);

  // ★自动更新检查(2026-09-07):SW 文档 SWR 的陈旧窗口内页面常驻旧 bundle(用户
  //  此前「要多刷新一两次才是最新」)——探针定期比对部署指纹 build-id.txt,发现
  //  新版本出横幅;点击→静默存档兜底丢进度→reload 一次到位(SWR 已在后台更新缓存)
  {
    const banner = mountUpdateBanner(root, () => {
      try { flow?.doSave(true); } catch { /* 存档失败也刷新(新版本优先) */ }
      location.reload();
    });
    startUpdateCheck((version) => banner.show(version, () => {
      try { flow?.doSave(true); } catch { /* 同上 */ }
      location.reload();
    }));
  }

  // M0 验收入口：?vuidemo=1 只跑 VUI 框架演示
  if (bootParams0.has('vuidemo')) {
    splash.done();
    VUI.setState(new VuiDemoState());
    return;
  }

  // 旁路路由：?play[=small|medium|large] 跳过主菜单直接生成世界进游戏
  // （主菜单 UI 改造期间绕行用；也可 ?quickload 直接读快速存档）——调试入口
  // 不陪跑 10.3s 时序，立即收场
  if (bootParams0.has('quickload')) {
    splash.done();
    void flow.quickLoad();
    return;
  }
  if (bootParams0.has('play')) {
    splash.done();
    const sz = bootParams0.get('play') || 'medium';
    const [w, h] = sz === 'small' ? [4200, 1200] : sz === 'large' ? [8400, 2400] : [6400, 1800];
    void flow.newWorld('', w, h);
    return;
  }

  // 菜单在 splash 幕后提前建好（2026-08-24 用户要求）：
  //  ① 版本号/署名角标层(z35) 浮于 splash(z30) 之上——渐显期(1.5s 起)即可见；
  //  ② 渐隐段(num5-num6 起)splash 底转透明——场景淡出直接透出菜单，不渐隐到
  //     黑再跳切揭幕；
  //  ③ 有下载停在 splash 等完（徽标 z40 浮于其上；splashGate 迟解=时序尽转全
  //     暗+向日葵续等，下完才自收场）
  await initAssetCache();
  flow.showTitle(true);        // 菜单+角标文字幕后就位（音乐/预载调用幂等）；★true=
                               // 背景冻结——揭幕前零 tick 零绘制(2026-08-27 用户报:
                               // 过渡图阶段时间空转+加载密集期背后全屏渲染抢算力)
  // ★管线未启用不再静默(2026-09-03 用户要求"SW 没起来弹窗警告+可复制诊断"):
  //   PROD 下 SW 注册失败/激活超时/环境不支持时弹窗(reason/重试/复制诊断/
  //   仍要进入)——prune 发布形态下这种会话 vanilla 全家族贴图必然 404。
  //   调试旗 ?swfail 模拟该链路(dev 亦可触发)。?nosw=显式关闭,不打扰。
  if ((import.meta.env.PROD || bootParams0.has('swfail')) && !bootParams0.has('nosw')) {
    warnAssetPipelineDown();
  }
  warmAllAssets();
  // ★2026-08-27 用户定案:过渡图阶段必须 zip 全量落盘;渐隐(revealBehind)与
  //   "加载完成"门统一等 hold 放行——菜单揭幕时永不缺图。时序尽(10.3s)而
  //   未完成时由 splash 既有路径转全暗+向日葵续等(徽标持续显示进度)。
  //   revealBehind 曾在 hold 前调用:渐隐段把缺图菜单提前透出(用户实测)。
  await holdForAssetsReady({ minMs: 0 });
  flow.resumeMenuBg();         // 揭幕即起播——菜单时间从初始值开始（进主菜单才播动画）
  splash.revealBehind();
  splashGate.resolve();        // 全量完成才解 splash"加载完成"门（时序尽自收场）
  await splash.finished;       // 渐隐到菜单后揭幕
});
