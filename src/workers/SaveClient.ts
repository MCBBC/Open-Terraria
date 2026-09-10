// 存档 worker 客户端:主线程只付一次结构化克隆(全图数组 memcpy,小/中/大世界约
// 15/35/60ms——对比原同步序列化 147ms+ 全在主线程),RLE+base64+JSON 全套在后台完成。
// worker 不可用/超时/出错 → 回退主线程 saveGame(行为与旧版完全一致)。
// 与 WorldGenClient 同款握手模式。
// 导入域(2026-08-27):importWld/inspectSave——世界列表「导入」的 wld 解析与
// 大档 JSON.parse 搬后台;主线程回退路径与旧同步实现逐位一致。
import type { World } from '../world/World';
import type { Player } from '../entities/Player';
import type { SaveData, SaveMeta } from '../save/serialize';
import { saveGame, loadSave } from '../save/SaveFile';
import { parseWldToSave } from '../wld/WldImport';
import { exportWld } from '../wld/WldExport';
import { weatherToSave } from '../world/weather/Weather';

const HANDSHAKE_MS = 2000;
const SAVE_TIMEOUT_MS = 20000;
/** 大 wld 解析+stringify 余量(8400×2400 数秒级) */
const IMPORT_TIMEOUT_MS = 60000;

/** importWld 结果:存储格式 JSON + 注册槽位所需元数据 */
export interface ImportedWorld {
  json: string;
  meta: { name: string; seedText: string; seedNum: number | string; gameMode: number;
    w: number; h: number; evil: 0 | 1 };
}

/** inspectSave 结果:本仓 .json 档头校验 */
export interface SaveHeaderInfo {
  ok: boolean;
  meta?: { name: string; seed: string; w: number; h: number;
    difficulty: number; evil: 0 | 1; hardMode: boolean;
    playTimeMs: number };   // SW-BJ5 2026-09-07：存档头累计游玩时长（导入槽落库随数据走）
}

type SaveResponse =
  | { type: 'saved'; id: number; json: string }
  | { type: 'imported'; id: number; json: string; meta: ImportedWorld['meta'] }
  | { type: 'inspected'; id: number; ok: boolean; meta?: SaveHeaderInfo['meta'] }
  | { type: 'exported-wld'; id: number; buf: ArrayBuffer }
  | { type: 'error'; id: number; message: string };

export class SaveClient {
  private worker: Worker | null = null;
  private broken = false;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  /** 串行队列:连按保存只排一次,避免并发双份全图快照(瞬时内存 ×2) */
  private chain: Promise<unknown> = Promise.resolve();

  /** 后台存档(串行):成功返回与 saveGame 逐位一致的 JSON;任何失败回退同步路径 */
  save(world: World, player: Player, playTimeMs: number, townNpcs?: import('../save/serialize').SaveData['npcs'], events?: import('../save/serialize').SaveData['events'],
    // ★SW-FX11（2026-09-10）：四塔位/压力板位（与 saveGame 同参位）
    pillarNpcs?: import('../save/serialize').SaveData['pillarNpcs'], pressurePlates?: import('../save/serialize').SaveData['pressurePlates']): Promise<string> {
    const run = this.chain
      .catch(() => undefined) // 前序失败不阻塞本次
      .then(() => this.doSave(world, player, playTimeMs, townNpcs, events, pillarNpcs, pressurePlates));
    this.chain = run;
    return run;
  }

  private async doSave(world: World, player: Player, playTimeMs: number, townNpcs?: import('../save/serialize').SaveData['npcs'], events?: import('../save/serialize').SaveData['events'],
    pillarNpcs?: import('../save/serialize').SaveData['pillarNpcs'], pressurePlates?: import('../save/serialize').SaveData['pressurePlates']): Promise<string> {
    const w = this.worker;
    if (this.broken || !w) return saveGame(world, player, playTimeMs, townNpcs, events, pillarNpcs, pressurePlates);
    const st = world.store;
    const id = this.nextId++;
    void townNpcs; // 附进 meta 消息（下方展开处）
    void 0;
    const meta: Omit<SaveMeta, 'w' | 'h'> = {
      name: world.name, seed: world.seed,
      spawnX: world.spawnX, spawnY: world.spawnY,
      spawnX0: world.spawnX0, spawnY0: world.spawnY0,   // 原始出生点（床 RemoveSpawn 回退）
      groundLevel: world.groundLevel, rockLevel: world.rockLevel, lavaLine: world.lavaLine,
      treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
      crimson: world.crimson, dungeonX: world.dungeonX, dungeonY: world.dungeonY, jungleX: world.jungleX,
      timeOfDay: world.clock.timeOfDay, dayCount: world.clock.dayCount,
      bloodMoon: world.clock.bloodMoon, eclipse: world.clock.eclipse,
      moonPhase: world.clock.moonPhase, moonType: world.moonType,
      difficulty: world.difficulty,   // Main.GameMode（Main.cs:2677）
      journeyTimeRate: world.journeyTimeRate, journeyFreezeTime: world.journeyFreezeTime,
      // 旅程力量·世界侧（IPersistentPerWorldContent；与 saveGame 主线程路径同源）
      journeyPowers: {
        freezeRain: world.journeyPowers.freezeRain,
        freezeWind: world.journeyPowers.freezeWind,
        stopBiomeSpread: world.journeyPowers.stopBiomeSpread,
        difficultySlider: world.journeyPowers.difficultySlider,
      },
      sundialCooldown: world.sundialCooldown, moondialCooldown: world.moondialCooldown,
      fastForwardTimeToDawn: world.fastForwardTimeToDawn,
      fastForwardTimeToDusk: world.fastForwardTimeToDusk,
      chests: world.chests, signs: world.signs, flags: world.flags,
      weather: weatherToSave(world.weather),
      invasion: { type: world.invasionType, size: world.invasionSize, sizeStart: world.invasionSizeStart,
        x: world.invasionX, delay: world.invasionDelay },
      altarCount: world.altarCount,   // WorldGen.altarCount（WorldFile.cs:1303/2100）
      // 夜间小动物概率五件套（setFireFlyChance；旧档缺省=代表值，当晚重掷）
      critterChances: { fireFly: world.fireFlyChance, fireFlyFriendly: world.fireFlyFriendly,
        fireFlyMultiple: world.fireFlyMultiple, butterfly: world.butterflyChance, stinkBug: world.stinkBugChance },
      cultistDelay: world.cultistDelay,   // CultistRitual.delay（WF:1340/:2192）
      angler: { quest: world.anglerQuest, whoFinishedToday: [...world.anglerWhoFinishedToday] },  // WF:1329-1335
      savedOreTiers: { ...world.savedOreTiers },  // WorldGen.SavedOreTiers（WF:1305-1307）
      shadowOrbCount: world.shadowOrbCount,          // WorldGen.shadowOrbCount（WF:1302/2099）
      bestiary: world.bestiary.toSave(),  // BestiaryUnlocksTracker（WorldFile.cs:3399）
      // 挂物族存放物：内部 id 直传（worker 侧 serializeSave 统一过稳定 id 表）
      furniture: world.furnitureItems,
    };
    const playerData: SaveData['player'] = {
      hp: player.hp, x: player.x, y: player.y,
      inventory: player.inv.slots, selected: player.inv.selected,
      baseMaxHp: player.baseMaxHp, baseMaxMana: player.baseMaxMana, mana: player.mana,
      banks: player.banks,
      armor: player.inv.armor,
      dye: player.inv.dye,
      trash: player.inv.trash,
      miscEquips: player.inv.miscEquips,
      miscDyes: player.inv.miscDyes,
      loadouts: player.inv.loadouts,
      currentLoadout: player.inv.currentLoadout,
      buffs: player.buffs?.toSave?.() ?? [],  // buffType+buffTime 槽（PL:53913-53925;桩 player 容忍）
      taxMoney: player.taxMoney ?? 0,         // PL:53839
      deathsPve: player.deathsPve ?? 0,       // PL:53840
      anglerQuestsFinished: player.anglerQuestsFinished ?? 0,     // PL:1790（渔夫奖励阶梯）
      // 旅程力量·玩家侧（IPersistentPerPlayerContent；与 saveGame 主线程路径同源）
      journeyPowers: {
        godmode: world.journeyPowers.godmode,
        farPlacementRange: world.journeyPowers.farPlacementRange,
        spawnRateSlider: world.journeyPowers.spawnRateSlider,
      },
    };
    // ★ 不 transfer:st.* 是活数组,transfer 会 detach 游戏状态;结构化克隆在发送线程
    // 完成(一次 memcpy),游戏内后续写入不影响已快照的副本
    const bufs = {
      type: st.type.buffer, flags: st.flags.buffer,
      frameX: st.frameX.buffer, frameY: st.frameY.buffer,
      wall: st.wall.buffer, liquid: st.liquid.buffer,
      liquidType: st.liquidType.buffer, wire: st.wire.buffer,
      half: st.half.buffer, slope: st.slope.buffer,
      paint: st.paint.buffer, paintWall: st.paintWall.buffer,   // 油漆双通道（WF:1474-1491）
      coat: st.coat.buffer,   // 涂层四位（WF:1539-1552）
      explored: world.explored.buffer,   // 战争迷雾（0/1 位图；结构化克隆快照，不 transfer）
    };
    const promise = new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as string), reject });
      setTimeout(() => {
        const p = this.pending.get(id);
        if (p) { this.pending.delete(id); p.reject(new Error('save worker timeout')); }
      }, SAVE_TIMEOUT_MS);
    });
    try {
      w.postMessage({ type: 'save', id, w: st.w, h: st.h, bufs, meta, player: playerData, playTimeMs, townNpcs, events, pillarNpcs, pressurePlates });
    } catch {
      const p = this.pending.get(id);
      if (p) { this.pending.delete(id); }
      return saveGame(world, player, playTimeMs, townNpcs, events, pillarNpcs, pressurePlates);
    }
    try {
      return await promise;
    } catch {
      return saveGame(world, player, playTimeMs, townNpcs, events, pillarNpcs, pressurePlates); // 回退同步
    }
  }

  /** 后台 .wld 导入解析(2026-08-27 用户报「导入卡住 UI」):parseWldToSave +
   *  JSON.stringify 全在 worker;buf transfer 零拷贝(调用方 buf 来自
   *  file.arrayBuffer() 一次性数据,detach 无害)。不可用/超时/出错回退主线程
   *  同步路径(与旧实现逐位一致) */
  async importWld(buf: Uint8Array): Promise<ImportedWorld> {
    this.ensure();
    const w = this.worker;
    if (this.broken || !w) return this.importWldSync(buf);
    // ★P2-8(红队):transfer 后主线程 buf 即 detach——超时/出错回退 importWldSync
    //  会拿到 neutered buffer 恒抛越界。留底一份(worker 用副本 transfer)
    const backup = buf.slice();
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        const p = this.pending.get(id);
        if (p) { this.pending.delete(id); p.reject(new Error('import worker timeout')); }
      }, IMPORT_TIMEOUT_MS);
    });
    try {
      w.postMessage({ type: 'importWld', id, buf: backup.buffer.slice(backup.byteOffset, backup.byteOffset + backup.byteLength) }, [backup.buffer]);
    } catch {
      const p = this.pending.get(id);
      if (p) this.pending.delete(id);
      return this.importWldSync(buf);
    }
    try {
      return await promise as ImportedWorld;
    } catch {
      return this.importWldSync(buf);   // 回退同步(worker 出错/超时;buf 未 detach ✓)
    }
  }

  /** 后台 .json 档头校验+提取(大档 JSON.parse 数百 ms 也在 worker) */
  async inspectSave(text: string): Promise<SaveHeaderInfo> {
    this.ensure();
    const w = this.worker;
    if (this.broken || !w) return this.inspectSaveSync(text);
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        const p = this.pending.get(id);
        if (p) { this.pending.delete(id); p.reject(new Error('inspect worker timeout')); }
      }, SAVE_TIMEOUT_MS);
    });
    try {
      w.postMessage({ type: 'inspectSave', id, text });
    } catch {
      const p = this.pending.get(id);
      if (p) this.pending.delete(id);
      return this.inspectSaveSync(text);
    }
    try {
      return await promise as SaveHeaderInfo;
    } catch {
      return this.inspectSaveSync(text);
    }
  }

  /** 后台 .wld 导出(2026-09-07 用户报「导出卡一下主线程」):存档 json 的
   *  JSON.parse + 全图 tile 编码全在 worker;产物 ArrayBuffer transfer 零拷贝。
   *  不可用/超时/出错回退主线程同步路径(与旧实现一致)。 */
  async exportWld(json: string): Promise<Uint8Array> {
    this.ensure();
    const w = this.worker;
    if (this.broken || !w) return exportWld(JSON.parse(json) as import('../save/serialize').SaveData);
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        const p = this.pending.get(id);
        if (p) { this.pending.delete(id); p.reject(new Error('export worker timeout')); }
      }, SAVE_TIMEOUT_MS);
    });
    try {
      w.postMessage({ type: 'exportWld', id, json });
    } catch {
      const p = this.pending.get(id);
      if (p) this.pending.delete(id);
      return exportWld(JSON.parse(json) as import('../save/serialize').SaveData);
    }
    try {
      const r = await promise as { buf: ArrayBuffer };
      return new Uint8Array(r.buf);   // transfer 到手的 buffer 包视图(零拷贝)
    } catch {
      return exportWld(JSON.parse(json) as import('../save/serialize').SaveData);
    }
  }

  /** 主线程回退:.wld 解析(= 旧同步实现) */
  private importWldSync(buf: Uint8Array): ImportedWorld {
    const { save, seedText, gameMode } = parseWldToSave(buf);
    return {
      json: JSON.stringify(save),
      meta: {
        name: save.header.name ?? '', seedText, seedNum: save.header.seed, gameMode,
        w: save.header.width, h: save.header.height,
        evil: save.header.crimson ? 1 : 0,
      },
    };
  }

  /** 主线程回退:.json 档头校验 */
  private inspectSaveSync(text: string): SaveHeaderInfo {
    try {
      const h = (JSON.parse(text) as {
        header?: { name?: string; seed?: number | string; width?: number; height?: number;
          difficulty?: number; crimson?: boolean; hardMode?: boolean; playTimeMs?: number };
      }).header;
      if (!h || typeof h.width !== 'number' || typeof h.height !== 'number') return { ok: false };
      return { ok: true, meta: {
        name: h.name ?? '', seed: String(h.seed ?? ''), w: h.width, h: h.height,
        difficulty: h.difficulty ?? 0, evil: h.crimson ? 1 : 0, hardMode: !!h.hardMode,
        playTimeMs: typeof h.playTimeMs === 'number' && Number.isFinite(h.playTimeMs) ? h.playTimeMs : 0,   // SW-BJ5 2026-09-07
      } };
    } catch {
      return { ok: false };
    }
  }

  /** 懒建 worker(首次 save 时);失败标记 broken 永久回退 */
  ensure(): void {
    if (this.worker || this.broken || typeof Worker === 'undefined') return;
    try {
      const w = new Worker(new URL('./save.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<SaveResponse>) => {
        const d = e.data;
        const p = this.pending.get(d.id);
        if (!p) return;
        this.pending.delete(d.id);
        if (d.type === 'saved') p.resolve(d.json);
        else if (d.type === 'imported') p.resolve({ json: d.json, meta: d.meta });
        else if (d.type === 'inspected') p.resolve({ ok: d.ok, meta: d.meta });
        else if (d.type === 'exported-wld') p.resolve({ buf: d.buf });
        else p.reject(new Error(d.message));
      };
      w.onerror = () => {
        // 致命错误:拒绝全部在途并永久回退
        this.broken = true;
        for (const [, p] of this.pending) p.reject(new Error('save worker fatal'));
        this.pending.clear();
        try { w.terminate(); } catch { /* 已死 */ }
        this.worker = null;
      };
      this.worker = w;
    } catch {
      this.broken = true;
    }
  }
}

/** 全局单例(mainFlow 建流时 ensure) */
export const saveClient = new SaveClient();

/** 预取(2026-08-25):音频门等待窗口借 SW 回填 worker 脚本(同 WorldGenClient 注) */
export function prefetchSaveWorker(): void {
  try {
    const w = new Worker(new URL('./save.worker.ts', import.meta.url), { type: 'module' });
    setTimeout(() => w.terminate(), 3000);
  } catch { /* 回退路径照旧 */ }
}
