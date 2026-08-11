// 设置项单例 + KvStore 持久化（M6）。变更通过监听器下发到 Audio/Sfx/UIScale。
import { kvGet, kvSet } from '../save/KvStore';
import { DEFAULT_LANG, normalizeLang } from '../i18n/GameCulture';

export interface OptionsData {
  musicVol: number;   // 0..1
  sfxVol: number;     // 0..1
  uiScale: number;    // 0.75..1.5（作用于 UIScale.userScale）
  devMode: boolean;
  lang: string;       // culture 名(如 zh-Hans);兼容旧数字 legacyId(对齐原版 config.json)
  // 智能光标（对齐原版 Player.SmartCursorSettings + IngameOptions/Main.cs:49705 设置结构）
  smartCursorMode: 'toggle' | 'hold';  // Main.cSmartCursorModeIsToggleAndNotHold（默认 Toggle）
  smartAxeAfterPickaxe: boolean;       // UseSmartAxeAfterSmartPickaxe（默认 false）
  smartBlocksEnabled: boolean;         // SmartBlocksEnabled（默认 true）
  smartHoldCanReleaseMidUse: boolean;  // SmartCursorHoldCanReleaseMidUse（默认 true）
  backgrounds: boolean;                // Main.BackgroundEnabled（Main.cs:790，config.json 持久化；默认 true）
}

const KEY = 'sandboxworld.options';

export class OptionsStore {
  data: OptionsData = {
    musicVol: 0.35,
    sfxVol: 1,
    uiScale: 1,
    devMode: false,
    lang: DEFAULT_LANG,
    smartCursorMode: 'toggle',
    smartAxeAfterPickaxe: false,
    smartBlocksEnabled: true,
    smartHoldCanReleaseMidUse: true,
    backgrounds: true,
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
      if (raw) Object.assign(this.data, JSON.parse(raw));
      // 语言归一化:旧数字 legacyId → culture 名;非法值落 en-US(对齐原版 LoadSettings)
      this.data.lang = normalizeLang(this.data.lang);
    } catch { /* 无存档用默认 */ }
    this.emit();
  }

  /** 改值并持久化（局部更新） */
  async set<K extends keyof OptionsData>(key: K, value: OptionsData[K]) {
    this.data[key] = value;
    this.emit();
    try {
      await kvSet(KEY, JSON.stringify(this.data));
    } catch { /* 存储不可用则仅内存生效 */ }
  }

  private emit() {
    for (const fn of this.listeners) fn(this.data);
  }
}

export const options = new OptionsStore();
