// 设置项单例 + KvStore 持久化（M6）。变更通过监听器下发到 Audio/Sfx/UIScale。
import { kvGet, kvSet } from '../save/KvStore';
import { DEFAULT_LANG, normalizeLang } from '../i18n/GameCulture';

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
