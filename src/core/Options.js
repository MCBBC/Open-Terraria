// 设置项单例 + KvStore 持久化（M6）。变更通过监听器下发到 Audio/Sfx/UIScale。
import { kvGet, kvSet } from '../save/KvStore';
const KEY = 'sandboxworld.options';
export class OptionsStore {
    constructor() {
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                musicVol: 0.35,
                sfxVol: 1,
                uiScale: 1,
                devMode: false,
            }
        });
        Object.defineProperty(this, "loaded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "listeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    onChange(fn) {
        this.listeners.push(fn);
        if (this.loaded)
            fn(this.data);
    }
    async load() {
        if (this.loaded)
            return;
        this.loaded = true;
        try {
            const raw = await kvGet(KEY);
            if (raw)
                Object.assign(this.data, JSON.parse(raw));
        }
        catch { /* 无存档用默认 */ }
        this.emit();
    }
    /** 改值并持久化（局部更新） */
    async set(key, value) {
        this.data[key] = value;
        this.emit();
        try {
            await kvSet(KEY, JSON.stringify(this.data));
        }
        catch { /* 存储不可用则仅内存生效 */ }
    }
    emit() {
        for (const fn of this.listeners)
            fn(this.data);
    }
}
export const options = new OptionsStore();
