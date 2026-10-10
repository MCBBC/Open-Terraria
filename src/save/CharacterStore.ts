// 多角色存储：KvStore 索引 + 每角色一条记录。
// index: sandboxworld.players.index → [{id,name,difficulty,createdAt}]
// data : sandboxworld.player.<id>   → Appearance JSON
// ★BJ618（2026-10-10 存储链清偿 B 批，物证=tests/_bj616-redteam-probe.test.ts probe F8/F5）：
//  件2 数据面写败收口——create/update/setState 的 kvSet 'fail' 旧实现全程静默（无回滚/
//  无导出兜底/无告警=持久幽灵角色）,现镜像 WorldStore 数据面：检 'fail' → onWriteFailData
//  自动导出兜底 + create 回滚 index push（rollbackRegister 同 WorldStore.importSlot）+
//  三写点抛 CharacterSaveWriteError（调用方 catch 面感知）;saveIndex 写败走 onWriteFail
//  告警（BJ611 登记②收口——旧实现 onIndexWrite 无条件触发,写败也刷 FS index 备份）。
//  件5（BJ617 登记）ensureLoaded index 读改 IDB 直读（kvGetIdb）——LS 陈旧 index 不得
//  短路 FS 恢复链（择源序 IDB → onRestoreMiss → LS,与 WorldStore 同构）。
//  件4 delete/clearState 成功链尾 onDeleted 回调（FS 备份同组快照清理）+ 陈旧 lastCharId
//  失效（防 doSave 的 charContextId() 以已删 id 复写 state 键=无主复活,probe F5）。
//  ★登记维持（BJ617 登记②,用户拍板口径 2026-10-10「干脆就不应该有合并这个功能」）：
//  多标签页 index 写面无锁无合并=用户明示接受面（双开各自覆盖写 last-writer-wins,
//  支持 locks 的浏览器由 SessionLock 会话锁拒载预防;本类不做任何合并/写前重读）。
import { kvGet, kvGetIdb, kvGetIdbEx, kvSet, kvDelete } from './KvStore';
import { prefGet, prefRemove } from './PrefsStore';   // ★BJ627 偏好域（lastCharId 失效三清）
import { validateAppearance, type Appearance } from '../player/Appearance';

const INDEX_KEY = 'sandboxworld.players.index';
const dataKey = (id: number) => `sandboxworld.player.${id}`;
/** 随身态键(与外观记录分离,避免大 JSON 混写) */
const stateKey = (id: number) => `sandboxworld.playerstate.${id}`;
/** ★BJ618 件4：上一角色 id 记忆键（mainFlow.LAST_CHAR_KEY 同值字面量——store 层不能
 *  反向 import mainFlow,删除面失效陈旧指针用;改键名须两处同步）。 */
export const LAST_CHAR_ID_KEY = 'sbw.lastCharId';

/** ★BJ618 件2：角色数据写入失败（kvSet 'fail'：IDB 不可用）。镜像
 *  WorldSaveWriteError——create/update/setState 三写点抛出（probe F8：旧实现全程
 *  静默,调用方无从感知=持久幽灵角色）;用户提示由 onWriteFailData 自动导出兜底
 *  回调统一发出,调用方 catch 面只补不续流程。 */
export class CharacterSaveWriteError extends Error {
  /** 目标数据键（诊断物证） */
  readonly dataKey: string;
  constructor(dataKey: string, cause?: unknown) {
    super(`角色存档写入失败(kvSet fail): ${dataKey}`);
    this.name = 'CharacterSaveWriteError';
    this.dataKey = dataKey;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export interface CharacterMeta { id: number; name: string; difficulty: number; createdAt: number;
  /** 收藏（原版 UICharacterListItem 收藏钮；收藏行 ★ 前缀显示） */
  favorite?: boolean; }

let nextId = 1;

export class CharacterStore {
  private index: CharacterMeta[] = [];
  private loaded = false;
  /** ★BJ620 件1（WorldStore 同构镜像）：在途 ensureLoaded promise 共享——并发双进
   *  旧实现双双穿 `if (this.loaded)` 门（本类无迁移支不产重复 meta,但恢复链/IDB 读
   *  双跑=浪费 IO 且 onRestoreMiss 被双咨询）。promise 记忆化+失败不缓存（可重试）。 */
  private ensurePromise: Promise<void> | null = null;
  /** ★BJ614：角色外观（Appearance JSON）成功写库后回调（create/update;FS 本地目录
   *  自动备份链,mainFlow 接 FsBackup fire-and-forget）。参数 = (角色名, id, JSON)。 */
  onDataWrite: ((name: string, id: number, json: string) => void) | null = null;
  /** ★BJ614：随身态成功写库后回调（setState=doSave 每次存档同步/复制角色路径）。 */
  onStateWrite: ((id: number, json: string) => void) | null = null;
  /** ★BJ614：index 元数据成功写库后回调（players.index.json 覆盖式备份）。 */
  onIndexWrite: (() => void) | null = null;
  /** ★BJ614 读档自愈恢复链注入点：IDB 键读取缺失时调用（mainFlow 提供 FS 备份恢复
   *  ——返回恢复文本且已写回 IDB;null=无备份/未授权）。 */
  onRestoreMiss: ((key: string) => Promise<string | null>) | null = null;
  /** ★BJ618 件2（镜像 WorldStore.onWriteFail）：index 元数据写失败（saveIndex
   *  kvSet 'fail'）告警回调——mainFlow 接 UI toast。元数据丢档不砸数据面,故不抛。 */
  onWriteFail: (() => void) | null = null;
  /** ★BJ618 件2（镜像 WorldStore.onWriteFailData）：角色数据（外观/随身态）写失败
   *  自动导出兜底回调（用户明令件）。参数 = (角色名, 数据键, JSON 全文)。 */
  onWriteFailData: ((name: string, dataKey: string, json: string) => void) | null = null;
  /** ★BJ618 件4：角色数据删除成功后回调（mainFlow 接 FsBackup.fsBackupPurgeSnapshots
   *  清理备份目录同组快照——防已删角色经恢复链复活+隐私面）。what='all'=delete
   *  （外观+随身态两组）;='state'=clearState（仅随身态组——硬核消亡面,防恢复链
   *  复活消亡态=「下一世界复活全套装备」复制窗）。 */
  onDeleted: ((id: number, what: 'all' | 'state') => void) | null = null;

  async ensureLoaded() {
    if (this.loaded) return;
    // ★BJ620 件1：并发重入门（WorldStore 同构——在途 promise 共享,失败不缓存）
    if (this.ensurePromise) { await this.ensurePromise; return; }
    this.ensurePromise = (async () => {
    // ★BJ618 件5（BJ617 登记,resolveLoadText 同族读序倒挂）：index 读改 IDB 直读
    //  （kvGetIdb）——kvGet 的 LS 兜底腿会以双写时代陈旧 index 抢先短路 FS 恢复链。
    //  择源序= IDB 现值 → onRestoreMiss（FS 备份恢复链,恢复回调内部已写回 IDB=自愈）
    //  → LS 兜底副本,与 WorldStore/mainFlow.loadFromKey 三段择源同构。
    let raw = await kvGetIdb(INDEX_KEY);
    if (!raw && this.onRestoreMiss) {
      try { raw = await this.onRestoreMiss(INDEX_KEY); }
      catch { /* 恢复链异常=按无 index 继续原语义 */ }
    }
    if (!raw) {
      try { raw = localStorage.getItem(INDEX_KEY); } catch { /* 隐私模式 */ }
    }
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) this.index = arr.filter((x) => x && typeof x.id === 'number');
      } catch { /* 损坏索引当空 */ }
    }
    for (const m of this.index) if (m.id >= nextId) nextId = m.id + 1;
    this.loaded = true;
    })();
    try { await this.ensurePromise; } finally { this.ensurePromise = null; }
  }

  private async saveIndex() {
    // ★BJ618 件2（BJ611 登记②收口）：index 写败告警（镜像 WorldStore.saveIndex）——
    //  旧实现无条件触发 onIndexWrite（写败也刷 FS index 备份=用陈旧内存覆盖备份档）。
    const where = await kvSet(INDEX_KEY, JSON.stringify(this.index));
    if (where === 'fail') this.onWriteFail?.();
    else this.onIndexWrite?.();   // ★BJ614：index 写成功 → players.index.json 覆盖式备份
  }

  list(): CharacterMeta[] { return [...this.index]; }

  /** 收藏切换（原版 FavoriteButtonClick）。
   *  收藏行禁删 = 原版语义：UICharacterListItem.cs:114-116 仅 !IsFavorite 才挂
   *  DeleteButtonClick（R24 起本仓同构——数据层再兜一道门） */
  async setFavorite(id: number, v: boolean) {
    const m = this.index.find((x) => x.id === id);
    if (!m) return;
    m.favorite = v;
    await this.saveIndex();
  }

  async get(id: number): Promise<Appearance | null> {
    // ★BJ620 件2（BJ616 probe F7 转正）：kvHas×恢复链语义分裂修复——kvHas 用 getKey
    //  判「键在」,非字符串值（typeMismatch：句柄/Blob 误写入本键域）也算「在」→
    //  kvGetIdbEx 判 typeMismatch 返 null → 恢复链永不被咨询（对照 keyMissing 面）。
    //  现按 kvGetIdbEx cause 分诊：
    //  · ok=健康字符串直读;
    //  · keyMissing∨typeMismatch=先咨询 FS 恢复链（备份恒新于 LS 双写时代陈旧副本,
    //    resolveLoadText 同构择源——顺带修复 keyMissing+LS 副本在位时恢复链被 LS 抢先
    //    短路的同族倒挂）,链 miss 再落 kvGet 的 LS 兜底腿;
    //  · openFailed∨txFailed=恢复链写回（kvSet 同库）必败,直落 kvGet（txFailed 对
    //    IDB 自然二次尝试+LS 兜底）。
    const ex = await kvGetIdbEx(dataKey(id));
    if (ex.cause === 'ok' && ex.value !== null) {
      try { return validateAppearance(JSON.parse(ex.value)); } catch { return null; }
    }
    if (ex.cause === 'keyMissing' || ex.cause === 'typeMismatch') {
      // ★BJ614：键缺失/不可读 → FS 备份恢复（恢复链写回 IDB 后以文本直读;自愈一次性
      // ——恢复成功后下次 get 即 ok 命中,不重复走备份目录）
      const rec = this.onRestoreMiss ? await this.safeRestoreMiss(dataKey(id)) : null;
      if (rec != null) {
        try { return validateAppearance(JSON.parse(rec)); } catch { return null; }
      }
    }
    const raw = await kvGet(dataKey(id));
    if (!raw) return null;
    try {
      return validateAppearance(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /** ★BJ614 恢复链防扩散包装（回调异常=按无备份） */
  private async safeRestoreMiss(key: string): Promise<string | null> {
    try { return await this.onRestoreMiss?.(key) ?? null; }
    catch { return null; }
  }

  async create(a: Appearance): Promise<CharacterMeta> {
    await this.ensureLoaded();
    const meta: CharacterMeta = { id: nextId++, name: a.name || '无名角色', difficulty: a.difficulty, createdAt: Date.now() };
    this.index.push(meta);
    await this.saveIndex();
    // ★BJ618 件2（BJ616 probe F8 转正）：数据写失败（kvSet 'fail'）→ 导出兜底告警+
    //  回滚幽灵槽+抛 CharacterSaveWriteError（镜像 WorldStore.importSlot——调用方
    //  角色创建 UI catch 面可感知,不产「列表有角色、读档缺失」持久幽灵）。
    const where = await kvSet(dataKey(meta.id), JSON.stringify(a));
    if (where === 'fail') {
      this.onWriteFailData?.(meta.name, dataKey(meta.id), JSON.stringify(a));
      await this.rollbackRegister(meta.id);
      throw new CharacterSaveWriteError(dataKey(meta.id));
    }
    // ★BJ614：外观快照（时间戳档+轮转,回调内部全吞错）
    try { this.onDataWrite?.(meta.name, meta.id, JSON.stringify(a)); }
    catch (e) { console.warn('[charStore] onDataWrite 回调异常', e); }
    return meta;
  }

  /** ★BJ618 件2 回滚（WorldStore.rollbackRegister 同款）：从 index 摘除刚登记的
   *  meta 并尽力落库（saveIndex 内部只告警不抛；全面存储故障时内存摘除已保证
   *  会话内列表一致） */
  private async rollbackRegister(id: number) {
    this.index = this.index.filter((x) => x.id !== id);
    await this.saveIndex();
  }

  async update(id: number, a: Appearance) {
    await this.ensureLoaded();
    const m = this.index.find((x) => x.id === id);
    if (!m) return;
    // ★BJ618 件2：数据写先行、meta 刷新后置（WorldStore.save BJ605 同构——写败不产
    //  index 基线与数据的虚假刷新）;写败=导出兜底告警+抛（调用方 catch 面感知）。
    const where = await kvSet(dataKey(id), JSON.stringify(a));
    if (where === 'fail') {
      this.onWriteFailData?.(a.name || m.name, dataKey(id), JSON.stringify(a));
      throw new CharacterSaveWriteError(dataKey(id));
    }
    m.name = a.name || m.name;
    m.difficulty = a.difficulty;
    await this.saveIndex();
    // ★BJ614：外观快照（同 create）
    try { this.onDataWrite?.(m.name, id, JSON.stringify(a)); }
    catch (e) { console.warn('[charStore] onDataWrite 回调异常', e); }
  }

  async delete(id: number) {
    await this.ensureLoaded();
    // 收藏防删（UICharacterListItem.cs:114-116：!IsFavorite 才挂删除处理器；
    // 数据层守门防 UI 漏接/竞态——收藏行不可逆丢档）
    const m = this.index.find((x) => x.id === id);
    if (m?.favorite) return;
    this.index = this.index.filter((x) => x.id !== id);
    await this.saveIndex();   // ★BJ618 件4：onIndexWrite → players.index.json 墓碑重写
    await kvDelete(dataKey(id));
    await kvDelete(stateKey(id));   // 随身态一并清(硬核消亡)
    // ★BJ618 件4（BJ616 probe F5）：失效陈旧 lastCharId——指针不随 delete 失效时
    //  doSave 的 charContextId() 会以已删 id 复写 state 键=无主复活。仅指向被删 id 才清
    //  （他角色指针不动）。★BJ627：迁 PrefsStore,prefRemove 三清（LS 同清防收编复活）。
    try {
      if (prefGet(LAST_CHAR_ID_KEY) === String(id)) prefRemove(LAST_CHAR_ID_KEY);
    } catch { /* 隐私模式 */ }
    // ★BJ618 件4：FS 备份同组快照清理（外观+随身态两组;fire-and-forget 增强链）
    try { this.onDeleted?.(id, 'all'); }
    catch (e) { console.warn('[charStore] onDeleted 回调异常', e); }
  }

  // ---- 随身态(原版 .plr 语义:背包/装备/储物/buff 等便携字段随角色跨世界)----
  // 形态 = SaveData['player'] 的磁盘稳定 id 形(与存档 world 段同构,
  // 读侧经 playerFromDiskForm 还原内部 id——与 loadSaveData 同一映射)。

  async getState(id: number): Promise<import('../save/serialize').SaveData['player'] | null> {
    // ★BJ614：随身态键缺失 → FS 备份恢复（恢复链写回 IDB 后以文本直读,自愈一次性）
    let raw = await kvGet(stateKey(id));
    if (!raw && this.onRestoreMiss) raw = await this.safeRestoreMiss(stateKey(id));
    if (!raw) return null;
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && Array.isArray(p.inventory) ? p : null;
    } catch {
      return null;   // 损坏态当无(回退世界档内嵌 player)
    }
  }

  async setState(id: number, state: import('../save/serialize').SaveData['player']): Promise<void> {
    const json = JSON.stringify(state);
    // ★BJ618 件2（BJ616 probe F8）：随身态写败不再静默——导出兜底告警+抛（旧实现
    //  无告警=持久丢失;调用方 doSave .catch 面/复制角色路径 catch 感知,用户提示由
    //  onWriteFailData 回调统一发）。
    const where = await kvSet(stateKey(id), json);
    if (where === 'fail') {
      const cm = this.index.find((x) => x.id === id);
      this.onWriteFailData?.(cm?.name ?? 'char', stateKey(id), json);
      throw new CharacterSaveWriteError(stateKey(id));
    }
    // ★BJ614：随身态快照（原版 .plr 语义档——doSave 每存档同步点/复制角色路径共用）
    try { this.onStateWrite?.(id, json); }
    catch (e) { console.warn('[charStore] onStateWrite 回调异常', e); }
  }

  /** 硬核消亡清随身态（原版 KillMeForGood 直接删 .plr 档；本仓留墓碑外观但
   *  物品已全数掉落在死亡世界——残留态会在下一世界"复活"全套装备=复制窗。
   *  ★BJ618 件4：FS 备份面的消亡态快照同步清理——残留快照会经 getState 恢复链
   *  复活（备份面不得重新引入本注释警告的复制窗） */
  async clearState(id: number): Promise<void> {
    await kvDelete(stateKey(id));
    try { this.onDeleted?.(id, 'state'); }
    catch (e) { console.warn('[charStore] onDeleted 回调异常', e); }
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
