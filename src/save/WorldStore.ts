// 多世界存储：KvStore 索引 + 每世界一条 SaveData JSON。
// index: sandboxworld.worlds.index → WorldMeta[]
// data : sandboxworld.world.<id>   → SaveFile JSON 全文
import { kvGet, kvSet, kvHas, kvDelete } from './KvStore';

const INDEX_KEY = 'sandboxworld.worlds.index';
const QUICK_SAVE_KEY = 'sandboxworld.quicksave';
const dataKey = (id: number) => `sandboxworld.world.${id}`;

export interface WorldMeta {
  id: number;
  name: string;
  seed: string;          // 用户输入的 seed 文本（原样保存）
  w: number; h: number;
  difficulty: number;    // 0 经典 1 专家 2 大师 3 旅程
  evil: -1 | 0 | 1;      // -1 随机 0 腐化 1 猩红（注册时已解析实际值）
  /** 困难模式（肉山后；选择列表世界图标 Hallow 前缀用——AWorldListItem.cs:190
   *  GetSeedIcon 的 IsHardMode 分支）。随存档原地刷新（save 流 currentWorld 变更） */
  hardMode?: boolean;
  createdAt: number;
  lastPlayed: number;
  playTimeMs: number;
  favorite: boolean;
}

let nextId = 1;

export class WorldStore {
  private index: WorldMeta[] = [];
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
    // 迁移：旧版单槽 quicksave → 世界 id=1（幂等）
    if (this.index.length === 0 && !raw) {
      if (await kvHas(QUICK_SAVE_KEY)) {
        const text = await kvGet(QUICK_SAVE_KEY);
        if (text) {
          try {
            const h = (JSON.parse(text) as { header?: { name?: string; seed?: number; width?: number; height?: number; created?: number; playTimeMs?: number } }).header;
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
          } catch { /* quicksave 损坏则跳过 */ }
        }
      }
    }
    for (const m of this.index) if (m.id >= nextId) nextId = m.id + 1;
    this.loaded = true;
  }

  private async saveIndex() {
    await kvSet(INDEX_KEY, JSON.stringify(this.index));
  }

  /** 1.4.5.6 UIWorldSelect 排序键序：收藏 → 最后游玩 → 名称 → 文件名(即 id) */
  list(): WorldMeta[] {
    return [...this.index].sort((a, b) =>
      (Number(b.favorite) - Number(a.favorite))
      || (b.lastPlayed - a.lastPlayed)
      || a.name.localeCompare(b.name, 'zh')
      || (a.id - b.id));
  }

  async register(m: Omit<WorldMeta, 'id' | 'createdAt' | 'lastPlayed' | 'playTimeMs' | 'favorite'>): Promise<WorldMeta> {
    await this.ensureLoaded();
    const meta: WorldMeta = { ...m, id: nextId++, createdAt: Date.now(), lastPlayed: Date.now(), playTimeMs: 0, favorite: false };
    this.index.push(meta);
    await this.saveIndex();
    return meta;
  }

  /** 导入落库（世界列表「导入」路径）：register 只登记索引不落数据，
   *  本方法一并写入存档全文（duplicate 同型；数据 = SaveFile JSON 全文） */
  async importSlot(m: Omit<WorldMeta, 'id' | 'createdAt' | 'lastPlayed' | 'playTimeMs' | 'favorite'>, saveJson: string): Promise<WorldMeta> {
    const meta = await this.register(m);
    await kvSet(dataKey(meta.id), saveJson);
    return meta;
  }

  /** 保存世界数据（同时刷新 meta 的游玩时间/时长） */
  async save(meta: WorldMeta, saveJson: string, playTimeMs: number) {
    meta.lastPlayed = Date.now();
    meta.playTimeMs = playTimeMs;
    await kvSet(dataKey(meta.id), saveJson);
    await this.saveIndex();
  }

  async load(meta: WorldMeta): Promise<string | null> {
    return kvGet(dataKey(meta.id));
  }

  async delete(id: number) {
    await this.ensureLoaded();
    // 收藏防删（UIWorldListItem.cs:151-157：!IsFavorite 才挂删除处理器；
    // 数据层守门防 UI 漏接/竞态——收藏世界不可逆丢档）
    const m = this.index.find((x) => x.id === id);
    if (m?.favorite) return;
    this.index = this.index.filter((x) => x.id !== id);
    await this.saveIndex();
    await kvDelete(dataKey(id));
  }

  async duplicate(meta: WorldMeta): Promise<WorldMeta | null> {
    const text = await this.load(meta);
    if (!text) return null;
    const copy = await this.register({ ...meta, name: `${meta.name} 副本` });
    await kvSet(dataKey(copy.id), text);
    return copy;
  }

  /** 重命名（原版 UIWorldListItem.RenameButtonClick → UIVirtualKeyboard；
   *  本作用 prompt 等价交互）——仅改索引元数据，存档文件不动 */
  async rename(id: number, name: string) {
    const m = this.index.find((x) => x.id === id);
    if (!m) return;
    m.name = name;
    await this.saveIndex();
  }

  async setFavorite(id: number, v: boolean) {
    const m = this.index.find((x) => x.id === id);
    if (!m) return;
    m.favorite = v;
    await this.saveIndex();
  }
}
