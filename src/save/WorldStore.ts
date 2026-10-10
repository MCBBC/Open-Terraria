// 多世界存储：KvStore 索引 + 每世界一条 SaveData JSON。
// index: sandboxworld.worlds.index → WorldMeta[]
// data : sandboxworld.world.<id>   → SaveFile JSON 全文
// ★BJ605（2026-10-10 线上事故·态B「单档幽灵」防御）：kvSet 返 'fail'（IDB 不可用
//  且大档无 localStorage 快路径）时旧实现静默丢档——meta 照常入 index，用户以为
//  存好了，再进=「存档数据缺失」。现所有数据写入点检查返回值：save/importSlot/
//  duplicate 失败抛 WorldSaveWriteError（调用方 catch 面已有 toast）+ index 元数据
//  不虚假刷新/回滚幽灵槽；saveIndex 失败走 onWriteFail 告警回调（被 rename/
//  setFavorite/delete 等元数据面共用，抛错会炸不相干链）。
import { kvGet, kvSet, kvHas, kvDelete } from './KvStore';

const INDEX_KEY = 'sandboxworld.worlds.index';
const QUICK_SAVE_KEY = 'sandboxworld.quicksave';
const dataKey = (id: number) => `sandboxworld.world.${id}`;

/** 世界数据写入失败（kvSet 'fail'：IDB 不可用且超 2MB 无 localStorage 快路径）。
 *  保存时点即告警（mainFlow 各 catch 面 toast），不等读档时以「存档数据缺失」炸出。 */
export class WorldSaveWriteError extends Error {
  /** 目标数据键（诊断物证） */
  readonly dataKey: string;
  constructor(dataKey: string, cause?: unknown) {
    super(`世界存档写入失败(kvSet fail): ${dataKey}`);
    this.name = 'WorldSaveWriteError';
    this.dataKey = dataKey;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** ★BJ605 用户明令件（「本地存档无法成功→自动导出存档提供下载」）：备份文件名。
 *  格式 = 世界名_YYYYMMDD_HHmmss.json；世界名文件名非法字符（\/:*?"<>|）与空白
 *  消毒为 '_'，空名回退 'world'。纯函数（node 可单测），DOM 下载在 mainFlow。 */
export function buildSaveBackupFilename(rawName: string, d: Date): string {
  const cleaned = (rawName || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
  const name = cleaned && cleaned !== '_' ? cleaned : 'world';   // 消毒后空/纯占位符也回退
  const p = (n: number) => String(n).padStart(2, '0');
  return `${name}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
}

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
  /** ★BJ605：index 元数据写失败（saveIndex kvSet 'fail'）告警回调——mainFlow 装配
   *  时接 UI toast。元数据丢档不砸数据面（世界数据键不受影响），故不抛。 */
  onWriteFail: (() => void) | null = null;
  /** ★BJ605 用户明令件：世界数据写入失败回调（save/importSlot/duplicate 的 kvSet
   *  'fail'）——mainFlow 接「自动导出存档下载」兜底（手头 json 仍在，落库不成
   *  至少落文件）。参数 = (世界名, 数据键, 存档 JSON 全文)。 */
  onWriteFailData: ((name: string, dataKey: string, saveJson: string) => void) | null = null;

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
    const where = await kvSet(INDEX_KEY, JSON.stringify(this.index));
    if (where === 'fail') this.onWriteFail?.();   // ★BJ605：index 落库失败告警（不抛——元数据面共用）
  }

  /** 1.4.5.6 UIWorldSelect 排序键序：收藏 → 最后游玩 → 名称 → 文件名(即 id) */
  list(): WorldMeta[] {
    return [...this.index].sort((a, b) =>
      (Number(b.favorite) - Number(a.favorite))
      || (b.lastPlayed - a.lastPlayed)
      || a.name.localeCompare(b.name, 'zh')
      || (a.id - b.id));
  }

  /** playTimeMs 可透传（SW-BJ5 2026-09-07）：新世界缺省 0;副本经 duplicate 的 spread
   *  自动继承源槽位累计、导入槽经 importSlot 传存档头值——此前恒 0,副本/导入在
   *  首次存档前列表显 0、读档基线丢累计 */
  async register(m: Omit<WorldMeta, 'id' | 'createdAt' | 'lastPlayed' | 'playTimeMs' | 'favorite'> & { playTimeMs?: number }): Promise<WorldMeta> {
    await this.ensureLoaded();
    const { playTimeMs, ...rest } = m;
    const meta: WorldMeta = { ...rest, id: nextId++, createdAt: Date.now(), lastPlayed: Date.now(), playTimeMs: playTimeMs ?? 0, favorite: false };
    this.index.push(meta);
    await this.saveIndex();
    return meta;
  }

  /** 导入落库（世界列表「导入」路径）：register 只登记索引不落数据，
   *  本方法一并写入存档全文（duplicate 同型；数据 = SaveFile JSON 全文）。
   *  playTimeMs（SW-BJ5 2026-09-07）= 存档头值（.json 导入）;缺省 0（.wld 原版
   *  WorldFile 无游玩时长字段,导入态无从取值）
   *  ★BJ605：数据写失败（kvSet 'fail'）→ 回滚刚登记的 meta + 抛
   *  WorldSaveWriteError——不产「列表有档、进不去」的单档幽灵槽。 */
  async importSlot(m: Omit<WorldMeta, 'id' | 'createdAt' | 'lastPlayed' | 'playTimeMs' | 'favorite'>, saveJson: string, playTimeMs?: number): Promise<WorldMeta> {
    const meta = await this.register({ ...m, playTimeMs });
    const where = await kvSet(dataKey(meta.id), saveJson);
    if (where === 'fail') {
      this.onWriteFailData?.(m.name, dataKey(meta.id), saveJson);   // ★用户明令件：自动导出兜底
      await this.rollbackRegister(meta.id);
      throw new WorldSaveWriteError(dataKey(meta.id));
    }
    return meta;
  }

  /** ★BJ605 态B 回滚：从 index 摘除刚登记的 meta 并尽力落库（saveIndex 内部
   *  只告警不抛；全面存储故障时内存摘除已保证会话内列表一致） */
  private async rollbackRegister(id: number) {
    this.index = this.index.filter((x) => x.id !== id);
    await this.saveIndex();
  }

  /** 保存世界数据（同时刷新 meta 的游玩时间/时长）。
   *  ★BJ605：kvSet 'fail' → 抛 WorldSaveWriteError（调用方 mainFlow 保存链 catch
   *  已有 SaveFailedStorage toast 面）；meta 刷新移到写入成功之后——旧实现先刷
   *  lastPlayed/playTimeMs 再写数据，fail 时 index 基线与数据漂移（虚假刷新）。 */
  async save(meta: WorldMeta, saveJson: string, playTimeMs: number) {
    const where = await kvSet(dataKey(meta.id), saveJson);
    if (where === 'fail') {
      this.onWriteFailData?.(meta.name, dataKey(meta.id), saveJson);   // ★用户明令件：自动导出兜底
      throw new WorldSaveWriteError(dataKey(meta.id));
    }
    meta.lastPlayed = Date.now();
    meta.playTimeMs = playTimeMs;
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
    const where = await kvSet(dataKey(copy.id), text);
    if (where === 'fail') {
      this.onWriteFailData?.(copy.name, dataKey(copy.id), text);   // ★用户明令件：自动导出兜底
      await this.rollbackRegister(copy.id);   // ★BJ605：不落数据不进列表（同 importSlot）
      throw new WorldSaveWriteError(dataKey(copy.id));
    }
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
