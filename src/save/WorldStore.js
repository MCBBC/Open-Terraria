// 多世界存储：KvStore 索引 + 每世界一条 SaveData JSON。
// index: sandboxworld.worlds.index → WorldMeta[]
// data : sandboxworld.world.<id>   → SaveFile JSON 全文
import { kvGet, kvSet, kvHas, kvDelete } from './KvStore';
const INDEX_KEY = 'sandboxworld.worlds.index';
const QUICK_SAVE_KEY = 'sandboxworld.quicksave';
const dataKey = (id) => `sandboxworld.world.${id}`;
let nextId = 1;
export class WorldStore {
    constructor() {
        Object.defineProperty(this, "index", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "loaded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
    }
    async ensureLoaded() {
        if (this.loaded)
            return;
        const raw = await kvGet(INDEX_KEY);
        if (raw) {
            try {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr))
                    this.index = arr.filter((x) => x && typeof x.id === 'number');
            }
            catch { /* 损坏索引当空 */ }
        }
        // 迁移：旧版单槽 quicksave → 世界 id=1（幂等）
        if (this.index.length === 0 && !raw) {
            if (await kvHas(QUICK_SAVE_KEY)) {
                const text = await kvGet(QUICK_SAVE_KEY);
                if (text) {
                    try {
                        const h = JSON.parse(text).header;
                        if (h) {
                            await kvSet(dataKey(1), text);
                            this.index.push({
                                id: 1, name: h.name ?? '旧世界', seed: String(h.seed ?? ''),
                                w: h.width ?? 4200, h: h.height ?? 1200,
                                difficulty: 0, evil: -1,
                                createdAt: h.created ?? Date.now(), lastPlayed: h.created ?? Date.now(),
                                playTimeMs: h.playTimeMs ?? 0, favorite: false,
                            });
                            await this.saveIndex();
                            nextId = 2;
                        }
                    }
                    catch { /* quicksave 损坏则跳过 */ }
                }
            }
        }
        for (const m of this.index)
            if (m.id >= nextId)
                nextId = m.id + 1;
        this.loaded = true;
    }
    async saveIndex() {
        await kvSet(INDEX_KEY, JSON.stringify(this.index));
    }
    /** 1.4.5.6 UIWorldSelect 排序键序：收藏 → 最后游玩 → 名称 → 文件名(即 id) */
    list() {
        return [...this.index].sort((a, b) => (Number(b.favorite) - Number(a.favorite))
            || (b.lastPlayed - a.lastPlayed)
            || a.name.localeCompare(b.name, 'zh')
            || (a.id - b.id));
    }
    async register(m) {
        await this.ensureLoaded();
        const meta = { ...m, id: nextId++, createdAt: Date.now(), lastPlayed: Date.now(), playTimeMs: 0, favorite: false };
        this.index.push(meta);
        await this.saveIndex();
        return meta;
    }
    /** 保存世界数据（同时刷新 meta 的游玩时间/时长） */
    async save(meta, saveJson, playTimeMs) {
        meta.lastPlayed = Date.now();
        meta.playTimeMs = playTimeMs;
        await kvSet(dataKey(meta.id), saveJson);
        await this.saveIndex();
    }
    async load(meta) {
        return kvGet(dataKey(meta.id));
    }
    async delete(id) {
        await this.ensureLoaded();
        this.index = this.index.filter((x) => x.id !== id);
        await this.saveIndex();
        await kvDelete(dataKey(id));
    }
    async duplicate(meta) {
        const text = await this.load(meta);
        if (!text)
            return null;
        const copy = await this.register({ ...meta, name: `${meta.name} 副本` });
        await kvSet(dataKey(copy.id), text);
        return copy;
    }
    async setFavorite(id, v) {
        const m = this.index.find((x) => x.id === id);
        if (!m)
            return;
        m.favorite = v;
        await this.saveIndex();
    }
}
