// 存档 worker 客户端:主线程只付一次结构化克隆(全图数组 memcpy,小/中/大世界约
// 15/35/60ms——对比原同步序列化 147ms+ 全在主线程),RLE+base64+JSON 全套在后台完成。
// worker 不可用/超时/出错 → 回退主线程 saveGame(行为与旧版完全一致)。
// 与 WorldGenClient 同款握手模式。
// 导入域(2026-08-27):importWld/inspectSave——世界列表「导入」的 wld 解析与
// 大档 JSON.parse 搬后台;主线程回退路径与旧同步实现逐位一致。
import type { World } from '../world/World';
import type { Player } from '../entities/Player';
import type { SaveMeta } from '../save/serialize';   // ★BJ575:SaveData 随玩家段内联块单源化（buildPlayerSaveData）撤除
import { saveGame, loadSave, buildPlayerSaveData } from '../save/SaveFile';   // ★BJ575:玩家段装配单源（buildPlayerSaveData）
import { parseWldToSave } from '../wld/WldImport';
import { exportWld } from '../wld/WldExport';
import { weatherToSave } from '../world/weather/Weather';
import { getModBridgePayload, getSaveModEntries } from '../mods/bridge';

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
      seedFlags: { ...world.seedFlags },   // 彩蛋种子旗标（SeedEasterEggs;loadSaveData header 回填）——★BJ71:曾漏喂=worker 保存丢旗
      // ★IIIII20b 换人一次性迁移标（★BJ90 2026-09-15 补喂,BJ71 登记①）——本 meta 是生产
      //  保存主路径的第三份装配,曾漏喂=worker 路径落盘无键（迁移标每次读档恒假复发面）
      starterSwapMigrated: world.starterSwapMigrated,
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
      meteorShowerCount: world.meteorShowerCount,   // WorldGen.meteorShowerCount（WF:1069/:177）——★BJ71:曾漏喂=worker 保存归零
      // 夜间小动物概率五件套（setFireFlyChance；旧档缺省=代表值，当晚重掷）
      critterChances: { fireFly: world.fireFlyChance, fireFlyFriendly: world.fireFlyFriendly,
        fireFlyMultiple: world.fireFlyMultiple, butterfly: world.butterflyChance, stinkBug: world.stinkBugChance },
      cultistDelay: world.cultistDelay,   // CultistRitual.delay（WF:1340/:2192）
      angler: { quest: world.anglerQuest, whoFinishedToday: [...world.anglerWhoFinishedToday] },  // WF:1329-1335
      savedOreTiers: { ...world.savedOreTiers },  // WorldGen.SavedOreTiers（WF:1305-1307）
      oreTiersPH: { ...world.oreTiersPH },        // 肉前四档（WF:11294-11320,军火商钨弹门）——★BJ71:曾漏喂
      shadowOrbCount: world.shadowOrbCount,          // WorldGen.shadowOrbCount（WF:1302/2099）
      bestiary: world.bestiary.toSave(),  // BestiaryUnlocksTracker（WorldFile.cs:3399）
      // ★BJ71（2026-09-14）：旗击杀计数（BannerSystem.killCount,原版 WF:1347 Save/:2210 Load
      //  随世界档持久化）。本 meta 是生产保存主路径（mainFlow.doSave→saveClient.save）的
      //  第三份装配——曾只有 saveGame/buildSaveParts 喂入,worker 路径落盘 JSON 无
      //  bannerKills 键 → 重进存档计数归零（用户实报;fx43 bgStyles「meta 装配漏喂」同族）
      bannerKills: world.bannerKills,
      // ★SW-FX43（2026-09-12）：wld-compat 五通道随档（生产保存主路径——本 meta 与
      //  saveGame/buildSaveParts 三处同源;缺一处即「导入→游玩→存档→导出」丢通道。
      //  bgStyles 同族断链=R16-5 落盘值 meta 三处均未喂入,一并接通）
      worldId: world.worldId,
      caveBackX: world.caveBackX ? [...world.caveBackX] : undefined,
      bgStyles: world.bgStyles ? { ...world.bgStyles, cave: [...world.bgStyles.cave] } : undefined,
      wldSnap: world.wldSnap,
      teSnap: world.teSnap,
      townRooms: world.townRooms,
      // ★mod 清单（2026-10-04 P1）：三处 meta 装配之一（worker 主路径;BJ71 防漏喂）
      mods: getSaveModEntries() ?? undefined,
      // 挂物族存放物：内部 id 直传（worker 侧 serializeSave 统一过稳定 id 表）
      furniture: world.furnitureItems,
    };
    // ★BJ575（2026-10-08）：玩家段装配单源化——原内联手抄块漏 permanentUpgrades
    //  （恶魔之心 3335 旗 extraAccessory 打头,PL:55430 写/:55891 读）等 14 键 →
    //  worker 生产存档 JSON 无键 → 重进游戏恶魔心第 6 配饰槽丢失（用户实报）。
    //  现共用 SaveFile.buildPlayerSaveData 单源（与 saveGame 主线程路径同构）。
    //  ⚠️BJ71 家族纪律：玩家段新字段一律进 buildPlayerSaveData,严禁在此回抄。
    const playerData = buildPlayerSaveData(world, player);
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

  /** ★BJ328（2026-09-24）：退世界收刀——terminate 常驻 save.worker + 清串行链槽。
   *  定谳：saveClient 是模块单例，worker 首次 doSave 后【常驻不退】；每次存档的
   *  全图快照（结构化克隆 15-60ms memcpy）/RLE/base64/JSON 大中间态都在 worker
   *  isolate 堆里走一遍，退世界后 isolate 连同堆内克隆垃圾跨局滞留（BJ318 登记
   *  件1）。取舍=terminate + 懒重建（ SW 预取缓存秒开，prefetchSaveWorker 同款
   *  通道），不做「复用清空」——isolate 堆无法从外部收缩，重建成本（模块求值
   *  数 ms+首存时 ensure）落在保存链后台，与 flowGenClient.terminate 同范式。
   *  链槽 this.chain 兑现后仍钉最近一份存档 JSON 字符串（单槽、跨轮不增长），
   *  一并归零。调用点=quitToMenu（await doSave 全链落定之后，无在途作业；
   *  在途作业防御性 reject 走同步回退，与 worker-fatal 同形）。 */
  release(): void {
    if (this.worker) {
      const w = this.worker;
      this.worker = null;
      for (const [, p] of this.pending) p.reject(new Error('save worker released'));
      this.pending.clear();
      try { w.terminate(); } catch { /* 已死 */ }
    }
    this.chain = Promise.resolve();
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
      // ★mod 桥(2026-10-04):worker(重)建即推 mod id 增量(fire-and-forget;worker
      //  模块态随 terminate 丢失,BJ328 懒重建范式下每次 ensure 都要补推)
      this.pushModBridge(w);
    } catch {
      this.broken = true;
    }
  }

  /** mod id 增量推送(mods/bridge.ts 供数;零 mod=null 不推) */
  private pushModBridge(w: Worker): void {
    const payload = getModBridgePayload();
    if (!payload) return;
    try { w.postMessage({ type: 'applyModIds', payload }); } catch { /* 构建期 worker 未就绪忽略 */ }
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
