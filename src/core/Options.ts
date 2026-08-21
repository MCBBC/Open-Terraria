// 设置项单例 + KvStore 持久化（M6）。变更通过监听器下发到 Audio/Sfx/UIScale。
import { kvGet, kvSet } from '../save/KvStore';
import { DEFAULT_LANG, normalizeLang } from '../i18n/GameCulture';
import { sanitizeKeybinds, type KeybindAction } from './Keybinds';

/** 小地图边框皮肤全集（MinimapFrameManager.PopulateOptionsAndLoadContent 插入序，
 *  Terraria.GameContent.UI.Minimap/MinimapFrameManager.cs:32-42）。原版 1.4.5.6 的地图
 *  皮肤系统仅此一处——全屏地图固定单张 Images/Map.png 羊皮纸（AssetInitializer.cs:638，
 *  Main.cs:54923），无"全屏地图皮肤"枚举。 */
export const MINIMAP_FRAME_SKINS = [
  'Default', 'Golden', 'Remix', 'Sticks', 'StoneGold', 'TwigLeaf', 'Leaf', 'Retro', 'Valkyrie',
] as const;

export type MinimapFrameSkin = typeof MINIMAP_FRAME_SKINS[number];

/** 皮肤循环纯函数（SelectionHolder.CycleSelection 1:1，Terraria.DataStructures/SelectionHolder.cs）：
 *  取 Dictionary 枚举序中 ActiveSelection 的【前一个】，ActiveSelection 是首个时回绕到末个；
 *  未知键经 SetActiveFrame(string) 未命中 → Options.Values.First() = Default。
 *  注意方向是"倒序循环"，不是顺序 +1。 */
export function cycleMinimapFrame(current: string): MinimapFrameSkin {
  const i = (MINIMAP_FRAME_SKINS as readonly string[]).indexOf(current);
  if (i === -1) return MINIMAP_FRAME_SKINS[0];
  return MINIMAP_FRAME_SKINS[(i - 1 + MINIMAP_FRAME_SKINS.length) % MINIMAP_FRAME_SKINS.length];
}

export interface OptionsData {
  musicVol: number;   // 0..1
  sfxVol: number;     // 0..1
  /** Ambient 环境音轨音量 0..1（Main.ambientVolume，Main.cs:1413 默认 1f；
   *  config.json 键 "VolumeAmbient"，Main.cs:4159/4383）——13+ 环境音独立轨 */
  ambientVol: number; // 0..1
  uiScale: number;    // 0.75..1.5（作用于 UIScale.userScale）
  devMode: boolean;
  lang: string;       // culture 名(如 zh-Hans);兼容旧数字 legacyId(对齐原版 config.json)
  // 智能光标（对齐原版 Player.SmartCursorSettings + IngameOptions/Main.cs:49705 设置结构）
  smartCursorMode: 'toggle' | 'hold';  // Main.cSmartCursorModeIsToggleAndNotHold（默认 Toggle）
  smartAxeAfterPickaxe: boolean;       // UseSmartAxeAfterSmartPickaxe（默认 false）
  smartBlocksEnabled: boolean;         // SmartBlocksEnabled（默认 true）
  smartHoldCanReleaseMidUse: boolean;  // SmartCursorHoldCanReleaseMidUse（默认 true）
  backgrounds: boolean;                // Main.BackgroundEnabled（Main.cs:790，config.json 持久化；默认 true）
  swayInWind: boolean;                 // Main.SettingsEnabled_TilesSwayInWind（图块在风中摆动；默认 true）
  resourceBarStyle: 'classic' | 'fancy'; // 资源条样式（PlayerResourceSetsManager2：'New' Fancy 金框为原版 1.4.4+ 默认 / 'Default' Classic 朴素）
  /** 小地图边框皮肤（MinimapFrameManager：config.json "MinimapFrame" 字符串键，默认 Default） */
  minimapFrame: MinimapFrameSkin;
  /** 小地图透明度（Main.mapMinimapAlpha，Main.cs:892 默认 1；MapAlphaUp/Down 键
   *  ±0.015 步进，DrawMap :54961-54968 钳 [0.01,1]。原版不持久化——本仓 Web 便利档持久化） */
  mapMinimapAlpha: number;
  /** 覆盖式地图透明度（Main.mapOverlayAlpha，Main.cs:896 默认 0.35；同上钳/步进） */
  mapOverlayAlpha: number;
  /** 玩家对决开关（Player.hostile 的持久化镜像——原版 hostile 纯会话态不存档;
   *  本仓单机无进服概念,进游戏时从 options 灌入 Player.hostile,便于常开） */
  pvpEnabled: boolean;
  /** 队伍 0-5（Player.team,PlayerTeamID）——镜像角色档 team,UI 可运行时改并回写角色档 */
  pvpTeam: number;
  /** 渲染帧率上限(2026-08-18 原版对齐):原版锁 60fps;0=不锁(跟随显示器 rAF)。
   *  逻辑 tick 恒 60Hz 不受影响(fixedUpdate 累加器);仅 gate 渲染帧 */
  frameCap: number;
  /** 跳帧三态(原版 FrameSkipMode:Off/On/Subtle,默认 Subtle——原版 improved 路径
   *  默认温和档):On=激进(超预算 1.5×即跳,连跳≤2);Subtle=温和(落后整帧才跳,
   *  连跳≤1,原版 successiveSkippedDraws<=0 语义 Main.cs:16968);
   *  渲染超预算时本帧只跑逻辑不画,保逻辑恒 60Hz */
  frameSkipMode: 'off' | 'on' | 'subtle';
  /** 水波质量四档（Main.WaveQuality，Main.cs:405 默认 3）：0=关 1=低 2=中 3=高。
   *  档位门见 WaterShaderData.cs:114-118（>=3 弹幕波/黏度补偿、>=2 玩家+涟漪、
   *  NPC 恒开；0 = WaterDistortion 滤镜整体关闭 SceneState.cs:129）；
   *  config.json 键 "WaveQuality"（Main.cs:4215/4465），读档钳 [0,3]（:4466-4473） */
  waveQuality: number;
  /** 渲染模式:gpu=硬件加速(默认);cpu=软渲染(willReadFrequently,零 GPU 预算,
   *  多开/弱 GPU 稳定);auto=GPU 优先,连续崩溃自动切 CPU,稳定 2 分钟回 GPU */
  renderMode: 'gpu' | 'cpu' | 'auto';
  // ---- M5 键位重映射（自定义层；缺 action = DEFAULT_KEYBINDS，见 core/Keybinds.ts）----
  keybinds: Record<string, string[]>;
  // ---- M14 IngameOptions 杂项（IngameOptions.cs:647-848 逐项，注释=原版默认+消费点）----
  /** 激活套装奖励键反转（Main.ReversedUpDownArmorSetBonuses，:647；默认 false）——
   *  消费：Lang 全局替换键 ToggleArmorSetBonusKey（Lang.cs:161 Key.DOWN↔Key.UP），
   *  本仓 Game.afterWorldLoad 的 reversedArmorBonusKey 注入 */
  reversedUpDownArmorSetBonuses: boolean;
  /** 智能门偏好（DoorOpeningHelper.PreferenceSettings，:656；默认 EnabledForEverything，
   *  CyclePreferences :262-276 循环序 Disabled→Enabled→GamepadOnly→Disabled）。
   *  行为 N-A：玩家智能门(走过自动开门)系统未移植，设置先持久化 */
  doorOpeningPreference: 'enabled' | 'gamepadOnly' | 'disabled';
  /** 全物品自动连用（Main.SettingsEnabled_AutoReuseAllItems，:689；默认 false）——
   *  消费：Player.cs:24182 autoReuseAllWeapons；本仓 Game 挥击复用门 */
  autoReuseAllItems: boolean;
  /** 拾取提示（Main.showItemText，:705；默认 true）——消费：PopupText 族；
   *  本仓 Game.showPickupLabel 门 */
  showItemText: boolean;
  /** 事件进度条（Main.invasionProgressMode，:714；Main() 静默初始化=2，非字段 0！）：
   *  0=关 / 1=定时(160t 窗) / 2=开(近场常显)。消费：CheckInvasionProgressDisplay
   *  :46965+DrawInvasionProgress :47077；本仓 Game 入侵条数据源 */
  invasionProgressMode: 0 | 1 | 2;
  /** 放置预览（Main.placementPreview，:727；默认 true）——消费：TileDrawing.cs:742
   *  TileObject.DrawPreview(多格家具放置幽灵)。行为 N-A：对象放置幽灵预览系统
   *  未移植，设置先持久化 */
  placementPreview: boolean;
  /** 突出显示新物品（ItemSlot.Options.HighlightNewItems，:736；默认 true）——消费：
   *  ItemSlot.cs:1995 item.newAndShiny 高亮。行为 N-A：背包 newAndShiny 追踪未移植，
   *  设置先持久化 */
  highlightNewItems: boolean;
  /** 图格网格（Main.MouseShowBuildingGrid，:745；默认 false）——消费：
   *  DrawInterface_6_TileGridOption Main.cs:45634-45671（CursorRadial 鼠标格十字，
   *  站立不动渐显 0.7α/移动>6px 淬灭）；本仓 Renderer.drawBuildingGrid */
  mouseShowBuildingGrid: boolean;
  /** 对话头像偏好（Main.DialoguePortraitPreference，:823；CycleNPCPortraitMode
   *  :39724 循环序 Detailed→CloseUp→FullBodyRetro→Disabled；默认 Detailed）——
   *  消费：DrawNPCPortrait；本仓 NpcDialog（Disabled=不画头像；CloseUp/FullBodyRetro
   *  贴图变体未导入暂渲染 Detailed 形） */
  dialoguePortraitMode: 'detailed' | 'closeUp' | 'fullBodyRetro' | 'disabled';
  /** 悬停文本框（Main.SettingsEnabled_OpaqueBoxBehindTooltips，:848；默认 true）——
   *  消费：物品 tooltip 背板；本仓 UI .sw-tooltip 底色 */
  opaqueBoxBehindTooltips: boolean;
  // ---- S 级：自动保存/自动暂停（IngameOptions.cs:619/628）----
  /** 自动保存（Main.autoSave，Main.cs:1196 默认 true）——DoUpdate_AutoSave :19589
   *  墙钟 600000ms 触发 WorldGen.saveAndPlay */
  autoSave: boolean;
  /** 自动保存间隔（分钟；原版恒 10 分钟不可调，此处为任务要求的 Web 便利扩展档） */
  autoSaveIntervalMin: number;
  /** 自动暂停（Main.autoPause，Main.cs:1280 默认 false）——Web 语义=切 tab
   *  (visibilitychange hidden) 暂停、回来自动恢复 */
  autoPause: boolean;
  /** 快速堆叠模式（Player.Settings.StackToChestsPreferredMode，Player.cs:337；
   *  config.json 键 "StackToChestsPreferredMode"（Main.cs:4244/4576 持久化），默认 Quick）。
   *  背包侧"堆叠至附近宝箱"按钮行为：quick=只堆箱内已有类型 / smart=相似物品按
   *  分类层送最匹配箱（QuickStacking.cs:421-440）；右键循环（Main.cs:41297-41301
   *  CycleQuickStackMode + 音效 10 menuOpen） */
  quickStackMode: 'quick' | 'smart';
}

const KEY = 'sandboxworld.options';

export class OptionsStore {
  data: OptionsData = {
    musicVol: 0.35,
    sfxVol: 1,
    ambientVol: 1,    // Main.cs:1413 ambientVolume = 1f（旧存档无此键走默认）
    uiScale: 1,
    devMode: false,
    pvpEnabled: false,
    frameCap: 60,
    frameSkipMode: 'subtle',
    renderMode: 'auto',
    waveQuality: 3,   // Main.cs:405 WaveQuality = 3（默认高）
    pvpTeam: 0,
    lang: DEFAULT_LANG,
    smartCursorMode: 'toggle',
    smartAxeAfterPickaxe: false,
    smartBlocksEnabled: true,
    smartHoldCanReleaseMidUse: true,
    backgrounds: true,
    swayInWind: true,
    resourceBarStyle: 'fancy',
    minimapFrame: 'Default',
    mapMinimapAlpha: 1,      // Main.cs:892
    mapOverlayAlpha: 0.35,   // Main.cs:896
    keybinds: {},
    reversedUpDownArmorSetBonuses: false,   // Main.cs:253
    doorOpeningPreference: 'enabled',       // DoorOpeningHelper.cs:216
    autoReuseAllItems: false,               // Main.cs:241
    showItemText: true,                     // Main.cs:1194
    invasionProgressMode: 2,                // Main() 静默初始化 Main.cs:65992
    placementPreview: true,                 // Main.cs:1298
    highlightNewItems: true,                // ItemSlot.cs:31
    mouseShowBuildingGrid: false,           // Main.cs:257
    dialoguePortraitMode: 'detailed',
    opaqueBoxBehindTooltips: true,          // Main.cs:249
    autoSave: true,                         // Main.cs:1196
    autoSaveIntervalMin: 10,                // 原版 600000ms 恒值
    autoPause: false,                       // Main.cs:1280
    quickStackMode: 'quick',                // Player.Settings.StackToChestsPreferredMode（QuickStackToNearbyChests）
  };
  loaded = false;
  private listeners: Array<(d: OptionsData) => void> = [];

  onChange(fn: (d: OptionsData) => void) {
    this.listeners.push(fn);
    if (this.loaded) fn(this.data);
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await kvGet(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<OptionsData> & { frameSkip?: boolean };
        // 迁移:旧布尔 frameSkip(2026-08-18 当天版本)→ 三态
        if (typeof parsed.frameSkip === 'boolean') {
          parsed.frameSkipMode = parsed.frameSkip ? 'on' : 'off';
          delete parsed.frameSkip;
        }
        Object.assign(this.data, parsed);
      }
      // 语言归一化:旧数字 legacyId → culture 名;非法值落 en-US(对齐原版 LoadSettings)
      this.data.lang = normalizeLang(this.data.lang);
      // 水波质量钳 [0,3]（Main.cs:4466-4473 LoadSettings 同款卫门）
      if (typeof this.data.waveQuality !== 'number'
        || !Number.isFinite(this.data.waveQuality)) this.data.waveQuality = 3;
      this.data.waveQuality = Math.min(3, Math.max(0, Math.round(this.data.waveQuality)));
      // 小地图皮肤归一化:存档里的未知/旧键 → Default
      // (SelectionHolder.SetActiveFrame(string) 未命中 → Options.Values.First() = Default)
      if (!(MINIMAP_FRAME_SKINS as readonly string[]).includes(this.data.minimapFrame)) {
        this.data.minimapFrame = 'Default';
      }
      // 地图透明度钳 [0.01,1]（Main.cs:54961-54968/:54999-55006 DrawMap 原地钳同款；
      // 旧档无键走默认，NaN/越界回默认）
      for (const k of ['mapMinimapAlpha', 'mapOverlayAlpha'] as const) {
        const def = k === 'mapMinimapAlpha' ? 1 : 0.35;
        if (typeof this.data[k] !== 'number' || !Number.isFinite(this.data[k])) {
          this.data[k] = def;
        }
        this.data[k] = Math.min(1, Math.max(0.01, this.data[k]));
      }
      // 键位表清洗（未知 action/非字符串项剔除；空表=该 action 无绑定——2026-08-21
      // 起 1:1 原版：反选清空的合法态存活读档，不再回落默认）
      this.data.keybinds = sanitizeKeybinds(this.data.keybinds);
      // M14 枚举归一化（旧档/手改坏值 → 原版默认）
      const DOOR_PREFS = ['enabled', 'gamepadOnly', 'disabled'] as const;
      if (!DOOR_PREFS.includes(this.data.doorOpeningPreference as typeof DOOR_PREFS[number])) {
        this.data.doorOpeningPreference = 'enabled';
      }
      const PORTRAITS = ['detailed', 'closeUp', 'fullBodyRetro', 'disabled'] as const;
      if (!PORTRAITS.includes(this.data.dialoguePortraitMode as typeof PORTRAITS[number])) {
        this.data.dialoguePortraitMode = 'detailed';
      }
      if (this.data.invasionProgressMode !== 0 && this.data.invasionProgressMode !== 1) {
        this.data.invasionProgressMode = 2;
      }
      if (!Number.isFinite(this.data.autoSaveIntervalMin) || this.data.autoSaveIntervalMin < 1) {
        this.data.autoSaveIntervalMin = 10;
      }
      if (this.data.quickStackMode !== 'quick' && this.data.quickStackMode !== 'smart') {
        this.data.quickStackMode = 'quick';
      }
    } catch { /* 无存档用默认 */ }
    this.emit();
  }

  /** 改值并持久化（局部更新）。
   *  ★持久化防抖(2026-08-13 泄露 review):Settings 滑杆 input 事件每像素
   *  一次 set——此前每次 JSON.stringify 全量 + IndexedDB 写,拖动即 IO 风暴。
   *  内存值与 emit 仍即时(所见即所得),落盘合并到停手后 400ms */
  private saveTimer: ReturnType<typeof setTimeout> | 0 = 0;
  async set<K extends keyof OptionsData>(key: K, value: OptionsData[K]) {
    this.data[key] = value;
    this.emit();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = 0;
      kvSet(KEY, JSON.stringify(this.data)).catch(() => { /* 存储不可用则仅内存生效 */ });
    }, 400) as unknown as ReturnType<typeof setTimeout>;
  }

  private emit() {
    for (const fn of this.listeners) fn(this.data);
  }
}

export const options = new OptionsStore();
