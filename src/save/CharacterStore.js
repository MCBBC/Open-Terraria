// 多角色存储：KvStore 索引 + 每角色一条记录。
// index: sandboxworld.players.index → [{id,name,difficulty,createdAt}]
// data : sandboxworld.player.<id>   → Appearance JSON
import { kvGet, kvSet, kvHas, kvDelete } from './KvStore';
import { validateAppearance } from '../player/Appearance';
const INDEX_KEY = 'sandboxworld.players.index';
const dataKey = (id) => `sandboxworld.player.${id}`;
let nextId = 1;
export class CharacterStore {
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
        for (const m of this.index)
            if (m.id >= nextId)
                nextId = m.id + 1;
        this.loaded = true;
    }
    async saveIndex() {
        await kvSet(INDEX_KEY, JSON.stringify(this.index));
    }
    list() { return [...this.index]; }
    async get(id) {
        if (!await kvHas(dataKey(id)))
            return null;
        const raw = await kvGet(dataKey(id));
        if (!raw)
            return null;
        try {
            return validateAppearance(JSON.parse(raw));
        }
        catch {
            return null;
        }
    }
    async create(a) {
        await this.ensureLoaded();
        const meta = { id: nextId++, name: a.name || '无名角色', difficulty: a.difficulty, createdAt: Date.now() };
        this.index.push(meta);
        await this.saveIndex();
        await kvSet(dataKey(meta.id), JSON.stringify(a));
        return meta;
    }
    async update(id, a) {
        await this.ensureLoaded();
        const m = this.index.find((x) => x.id === id);
        if (!m)
            return;
        m.name = a.name || m.name;
        m.difficulty = a.difficulty;
        await this.saveIndex();
        await kvSet(dataKey(id), JSON.stringify(a));
    }
    async delete(id) {
        await this.ensureLoaded();
        this.index = this.index.filter((x) => x.id !== id);
        await this.saveIndex();
        await kvDelete(dataKey(id));
    }
    async copy(id) {
        const a = await this.get(id);
        if (!a)
            return null;
        return this.create({ ...a, name: `${a.name} 副本` });
    }
}
