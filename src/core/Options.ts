// 设置项单例 + KvStore 持久化（M6）。变更通过监听器下发到 Audio/Sfx/UIScale。
import { kvGet, kvSet } from '../save/KvStore';

export interface OptionsData {
  musicVol: number;   // 0..1
  sfxVol: number;     // 0..1
  uiScale: number;    // 0.75..1.5（作用于 UIScale.userScale）
  devMode: boolean;
}

const KEY = 'sandboxworld.options';

export class OptionsStore {
  data: OptionsData = {
    musicVol: 0.35,
    sfxVol: 1,
    uiScale: 1,
    devMode: false,
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
