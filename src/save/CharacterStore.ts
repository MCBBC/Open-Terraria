// 多角色存储：KvStore 索引 + 每角色一条记录。
// index: sandboxworld.players.index → [{id,name,difficulty,createdAt}]
// data : sandboxworld.player.<id>   → Appearance JSON
import { kvGet, kvSet, kvHas, kvDelete } from './KvStore';
import { validateAppearance, type Appearance } from '../player/Appearance';

const INDEX_KEY = 'sandboxworld.players.index';
const dataKey = (id: number) => `sandboxworld.player.${id}`;
/** 随身态键(与外观记录分离,避免大 JSON 混写) */
const stateKey = (id: number) => `sandboxworld.playerstate.${id}`;

export interface CharacterMeta { id: number; name: string; difficulty: number; createdAt: number; }

let nextId = 1;

export class CharacterStore {
  private index: CharacterMeta[] = [];
  private loaded = false;

  async ensureLoaded() {
    if (this.loaded) return;
    const raw = await kvGet(INDEX_KEY);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) this.index = arr.filter((x) => x && typeof x.id === 'number');
      } catch { /* 损坏索引当空 */ }
    }
    for (const m of this.index) if (m.id >= nextId) nextId = m.id + 1;
    this.loaded = true;
  }

  private async saveIndex() {
    await kvSet(INDEX_KEY, JSON.stringify(this.index));
  }

  list(): CharacterMeta[] { return [...this.index]; }

  async get(id: number): Promise<Appearance | null> {
    if (!await kvHas(dataKey(id))) return null;
    const raw = await kvGet(dataKey(id));
    if (!raw) return null;
    try {
      return validateAppearance(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async create(a: Appearance): Promise<CharacterMeta> {
    await this.ensureLoaded();
    const meta: CharacterMeta = { id: nextId++, name: a.name || '无名角色', difficulty: a.difficulty, createdAt: Date.now() };
    this.index.push(meta);
    await this.saveIndex();
    await kvSet(dataKey(meta.id), JSON.stringify(a));
    return meta;
  }

  async update(id: number, a: Appearance) {
    await this.ensureLoaded();
    const m = this.index.find((x) => x.id === id);
    if (!m) return;
    m.name = a.name || m.name;
    m.difficulty = a.difficulty;
    await this.saveIndex();
    await kvSet(dataKey(id), JSON.stringify(a));
  }

  async delete(id: number) {
    await this.ensureLoaded();
    this.index = this.index.filter((x) => x.id !== id);
    await this.saveIndex();
    await kvDelete(dataKey(id));
    await kvDelete(stateKey(id));   // 随身态一并清(硬核消亡)
  }

  // ---- 随身态(原版 .plr 语义:背包/装备/储物/buff 等便携字段随角色跨世界)----
  // 形态 = SaveData['player'] 的磁盘稳定 id 形(与存档 world 段同构,
  // 读侧经 playerFromDiskForm 还原内部 id——与 loadSaveData 同一映射)。

  async getState(id: number): Promise<import('../save/serialize').SaveData['player'] | null> {
    const raw = await kvGet(stateKey(id));
    if (!raw) return null;
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && Array.isArray(p.inventory) ? p : null;
    } catch {
      return null;   // 损坏态当无(回退世界档内嵌 player)
    }
  }

  async setState(id: number, state: import('../save/serialize').SaveData['player']): Promise<void> {
    await kvSet(stateKey(id), JSON.stringify(state));
  }

  async copy(id: number): Promise<CharacterMeta | null> {
    const a = await this.get(id);
    if (!a) return null;
    const meta = await this.create({ ...a, name: `${a.name} 副本` });
    const st = await this.getState(id);   // 副本连随身态一起拷(原版复制角色同款)
    if (st && meta) await this.setState(meta.id, structuredClone(st));
    return meta;
  }
}
