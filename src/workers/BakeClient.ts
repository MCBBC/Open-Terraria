// ★C4 烘焙 worker 客户端（2026-09-28;?wbake=1 灰度,缺省关,禁转正）。
//
// 职责：spawn/握手 BakeWorker、随包烘焙素材（ImageBitmap 副本,transfer）、
// 快照请求派发（flushDirty/get 支路调用,按 chunk key 去重+bump）、回包消费
// （ChunkCache.completeWorkerBake 落页+GL 脏账）、missing 表补送重派链、
// 失败自锁死降级（worker 不可用/握手超时/请求异常 → 在飞请求全部重入脏队,
// cache.bakeClient=null 回主线程烘焙全链=现状逐位）。
//
// 双路径纪律：旗关（缺省）时 Game 不装配本客户端 → ChunkCache 全部支路失效,
// 主线程烘焙链零改动。两路产物一致性由 scripts/_wbake-digest.mjs（md5 对拍）
// 与 tests/wbake-*.test.ts（协议/账本锁）把门。
import { ChunkCache } from '../render/ChunkCache';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileSheetEntry } from '../assets/TileSheetGen';
import { tileAnim } from '../render/TileAnim';
import { renderEnv, plates428Pressed } from '../render/VanillaTiler';
import { gameTickCount } from '../core/GameTime';
import { buildBakeSnapshot, snapshotBuffers, type BakeWorkerResponse } from './BakeProtocol';

// createImageBitmap 为浏览器全局（worker/主线程均可用;node 测试环境 undefined
// → attach 探测失败=降级主线程路径）。

/** ?wbake=1 显式开启（缺省关——用户明令:候补清单旗灰度,确认+性能评估后才转正）。
 *  探针断言面:window.__swBakeFlags.enabled（只读）。 */
export const WBAKE_ENABLED = (() => {
  try {
    if (typeof location === 'undefined') return false;   // node/测试环境:缺省关
    if (typeof window !== 'undefined') {
      (window as unknown as { __swBakeFlags?: { enabled: boolean; flag: string } }).__swBakeFlags = {
        get enabled() { return WBAKE_ENABLED; },
        flag: new URLSearchParams(location.search).get('wbake') ?? '',
      };
    }
    return new URLSearchParams(location.search).get('wbake') === '1';
  } catch { return false; }
})();

const HANDSHAKE_MS = 3000;

interface Pending { cx: number; cy: number; bumped: boolean }

export class BakeClient {
  private worker: Worker | null = null;
  private ready = false;
  private dead = false;
  private nextId = 1;
  /** 在飞/待就绪请求（key 去重 + bump 面） */
  private pending = new Map<number, Pending>();
  private preReadyQueue: number[] = [];
  /** missing 链:file → 等它的 chunk key 集（ship 落地后重派） */
  private awaitingByFile = new Map<string, Set<number>>();
  private shipping = new Set<string>();
  private errStreak = 0;
  private disposed = false;

  constructor(private cache: ChunkCache, private atlas: SpriteAtlas, private sheets: Map<number, TileSheetEntry>) {}

  /** spawn+握手+素材随包。false=不可用（调用方不装配）。 */
  async attach(): Promise<boolean> {
    if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') return false;
    let w: Worker;
    try {
      w = new Worker(new URL('./BakeWorker.ts', import.meta.url), { type: 'module' });
    } catch { return false; }
    this.worker = w;
    w.onmessage = (ev: MessageEvent<BakeWorkerResponse>) => this.onMessage(ev.data);
    w.onerror = () => this.fail('worker onerror');
    // 握手
    const ok = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), HANDSHAKE_MS);
      this.handshakeResolve = (v) => { clearTimeout(timer); resolve(v); };
      w.postMessage({ type: 'init', id: this.nextId++ });
    });
    if (!ok || this.disposed) { this.fail('handshake timeout'); return false; }
    this.ready = true;
    // 素材随包:自有过程 sheet 全量（TileSheetGen 画布位图副本）+ 地形 Maples +
    // 出生点预载的原版 Tiles/Wall 表——首波烘焙尽量一次到位,其余走 missing 需求拉取
    await this.shipInitial();
    this.flushPreReady();
    return true;
  }

  private handshakeResolve: ((v: boolean) => void) | null = null;

  private async shipInitial(): Promise<void> {
    const maples: Array<{ file: string; bmp: ImageBitmap }> = [];
    const vimg: Array<{ file: string; bmp: ImageBitmap }> = [];
    for (const f of Object.keys(this.atlas.data.files)) {
      if (!f.startsWith('地形/')) continue;
      const src = this.atlas.images.get(f);
      if (!src) continue;
      try { maples.push({ file: f, bmp: await createImageBitmap(src) }); } catch { /* 降级 missing 链 */ }
    }
    for (const f of this.atlas.vimages.keys()) {
      if (!/^vanilla\/(Tiles|Wall)_/.test(f)) continue;
      const src = this.atlas.vimages.get(f)!;
      try { vimg.push({ file: f, bmp: await createImageBitmap(src) }); } catch { /* 同上 */ }
    }
    const sheetList: Array<{ id: number; kind: 'blend' | 'single' | 'object'; w?: number; h?: number; bmp: ImageBitmap }> = [];
    for (const [id, e] of this.sheets) {
      try { sheetList.push({ id, kind: e.kind, w: e.w, h: e.h, bmp: await createImageBitmap(e.canvas) }); } catch { /* 同上 */ }
    }
    this.post({ type: 'ship', id: this.nextId++, vimages: vimg, maples, sheets: sheetList },
      [...vimg.map((v) => v.bmp), ...maples.map((m) => m.bmp), ...sheetList.map((s) => s.bmp)]);
  }

  /** chunk 重烘请求（flushDirty/get wbake 支路调用）。pending 去重;重复请求=在飞
   *  请求标 bump（回包应用后立即重派——markDirty/invalidateAll 晚于快照派发的
   *  陈旧窗对齐主线程路径 1 帧滞后语义）。 */
  request(cx: number, cy: number, _cache: ChunkCache): void {
    if (this.dead || this.disposed || !this.worker) return;
    if (!this.chunkInWorld(cx, cy)) return;   // 世界外悬空 key（flushDirty 同款守卫）
    const k = ChunkCache.key(cx, cy);
    const p = this.pending.get(k);
    if (p) { p.bumped = true; return; }
    this.pending.set(k, { cx, cy, bumped: false });
    if (!this.ready) { this.preReadyQueue.push(k); return; }
    this.dispatch(k);
  }

  /** markDirty/invalidateAll 的在飞 bump（ChunkCache 侧直调） */
  bump(k: number): void {
    const p = this.pending.get(k);
    if (p) p.bumped = true;
  }

  /** chunk 与世界相交判定（flushDirty 双角守卫同式） */
  private chunkInWorld(cx: number, cy: number): boolean {
    const st = this.cache.world?.store;
    if (!st) return false;
    return st.inBounds(cx * 16, cy * 16) || st.inBounds(cx * 16 + 15, cy * 16 + 15);
  }

  // ---- 探针/digest 专用（禁生产路径调用）----

  /** 双路径 md5 对拍直通：绕过 pending/落页账本,直发烘焙请求并取回原始位图。
   *  输入时钟面 = 调用时刻（探针先冻结 tick/GTW 再调,两臂同相）。 */
  digestBake(cx: number, cy: number): Promise<{ wall: ImageBitmap; tile: ImageBitmap; glow: ImageBitmap | null; missing: string[] } | null> {
    if (!this.worker || !this.ready || !this.chunkInWorld(cx, cy)) return Promise.resolve(null);
    const world = this.cache.world!;
    const snap = buildBakeSnapshot(world.store, cx, cy, {
      groundLevel: world.groundLevel, rockLevel: world.rockLevel,
      treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
      chests: world.chests,
      showInvisibleBlocks: world.store.showInvisibleBlocks,
      tick: tileAnim.tick, gtwTicks: gameTickCount(),
      envWind: renderEnv.wind, envWorldSurface: renderEnv.worldSurface, envRemix: renderEnv.remix,
      plates428: [...plates428Pressed],
    });
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.digestWaiters.delete(id); resolve(null); }, 15000);
      this.digestWaiters.set(id, (res) => { clearTimeout(timer); resolve(res); });
      try {
        this.post({ type: 'bake', id, snap }, snapshotBuffers(snap));
      } catch { clearTimeout(timer); this.digestWaiters.delete(id); resolve(null); }
    });
  }
  private digestWaiters = new Map<number, (r: { wall: ImageBitmap; tile: ImageBitmap; glow: ImageBitmap | null; missing: string[] }) => void>();

  /** 探针补送表位图（missing 链手动驱动;force 落地不触发重派） */
  shipForTest(files: string[]): Promise<void> {
    return this.shipFiles(files, true);
  }

  private dispatch(k: number): void {
    const p = this.pending.get(k);
    if (!p || !this.worker) return;
    const world = this.cache.world;
    if (!world) { this.pending.delete(k); return; }
    const snap = buildBakeSnapshot(world.store, p.cx, p.cy, {
      groundLevel: world.groundLevel, rockLevel: world.rockLevel,
      treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
      chests: world.chests,
      showInvisibleBlocks: world.store.showInvisibleBlocks,
      tick: tileAnim.tick, gtwTicks: gameTickCount(),
      envWind: renderEnv.wind, envWorldSurface: renderEnv.worldSurface, envRemix: renderEnv.remix,
      plates428: [...plates428Pressed],
    });
    try {
      this.post({ type: 'bake', id: this.nextId++, snap }, snapshotBuffers(snap));
    } catch (e) {
      this.pending.delete(k);
      this.cache.requeueWorkerBake(p.cx, p.cy);
      console.warn('[wbake] 快照派发失败,回退主线程:', e);
    }
  }

  private flushPreReady(): void {
    const q = this.preReadyQueue;
    this.preReadyQueue = [];
    for (const k of q) this.dispatch(k);
  }

  private onMessage(res: BakeWorkerResponse): void {
    if (res.type === 'ready') { this.handshakeResolve?.(true); return; }
    if (res.type === 'fatal') { this.fail(res.message); return; }
    if (res.type === 'error') {
      // 单请求失败:该 key 回主线程队列;连续 3 错=worker 态可疑,整体锁死降级
      const p = this.pending.get(res.id);
      if (p) {
        this.pending.delete(res.id);
        this.cache.requeueWorkerBake(p.cx, p.cy);
      }
      if (++this.errStreak >= 3) this.fail(`error streak ×3 (${res.message})`);
      return;
    }
    // ---- baked ----
    this.errStreak = 0;
    // digest 直通 waiter（探针路径;不进 pending/落页账本）
    const dw = this.digestWaiters.get(res.id);
    if (dw) {
      this.digestWaiters.delete(res.id);
      dw({ wall: res.wall, tile: res.tile, glow: res.glow, missing: res.missing });
      return;
    }
    const k = ChunkCache.key(res.cx, res.cy);
    const p = this.pending.get(k);
    this.pending.delete(k);
    this.cache.completeWorkerBake(res.cx, res.cy, res.wall, res.tile, res.glow, res.missing, res.consumed);
    // missing 链:登记等待者 → 可送的表立即补送（送完重派）;主线程也缺的表
    // 留在 awaiting,待 noteFileArrived 落地时补送（onBakeAssetArrived→markDirty
    // 链同域兜底,双保险）
    for (const f of res.missing) {
      let s = this.awaitingByFile.get(f);
      if (!s) { s = new Set(); this.awaitingByFile.set(f, s); }
      s.add(k);
    }
    this.shipMissing(res.missing);
    // 在飞期间被标脏 → 立即重派（陈旧窗=1 次往返,与主线程 markDirty→flushDirty 滞后等价）
    if (p?.bumped) this.request(res.cx, res.cy, this.cache);
  }

  /** 把主线程已就位的表补送 worker（missing 需求拉取;本线程也缺的文件跳过——
   *  该文件落地时走 noteFileArrived 强制补送,awaiting 键随后重派,无循环） */
  private shipMissing(files: string[]): void {
    const todo = files.filter((f) => !this.shipping.has(f));
    if (!todo.length) return;
    void this.shipFiles(todo, false);
  }

  /** 晚到表钩（ChunkCache.onBakeAssetArrived 入口调用）：强制补送（绕过 shipping
   *  去重的新鲜落地面）——worker 拿到位图后 awaiting 键重派。 */
  noteFileArrived(file: string): void {
    if (this.dead || !this.ready) return;
    void this.shipFiles([file], true);
  }

  private async shipFiles(files: string[], force: boolean): Promise<void> {
    if (!this.worker || this.dead) return;
    const vimg: Array<{ file: string; bmp: ImageBitmap }> = [];
    const maples: Array<{ file: string; bmp: ImageBitmap }> = [];
    for (const f of files) {
      this.shipping.add(f);
      const src = this.atlas.vimages.get(f) ?? this.atlas.images.get(f);
      if (!src) { this.shipping.delete(f); continue; }   // 主线程也缺:留 awaiting,落地链兜底
      try {
        const bmp = await createImageBitmap(src);
        if (/^地形\//.test(f)) maples.push({ file: f, bmp });
        else vimg.push({ file: f, bmp });
      } catch { /* 位图化失败:留 awaiting,下次结果再试 */ }
    }
    if (!vimg.length && !maples.length) return;
    this.post({ type: 'ship', id: this.nextId++, vimages: vimg, maples, sheets: [] },
      [...vimg.map((v) => v.bmp), ...maples.map((m) => m.bmp)]);
    // 补送落地 → 等它的 chunk 重派（request 去重保平安;force=落地链,在飞也即时重派）
    for (const f of [...vimg.map((v) => v.file), ...maples.map((m) => m.file)]) {
      const keys = this.awaitingByFile.get(f);
      this.shipping.delete(f);
      if (!keys) continue;
      this.awaitingByFile.delete(f);
      for (const key of keys) {
        const p = this.pending.get(key);
        if (!p) this.request(key & 0xffff, (key >> 16) & 0xffff, this.cache);
        else p.bumped = true;   // 已在飞:回包后重派即可
      }
    }
  }

  private fail(why: string): void {
    if (this.dead) return;
    this.dead = true;
    console.warn(`[wbake] worker 不可用,降级主线程烘焙全链: ${why}`);
    // 在飞/待就绪请求全部重入脏队（主线程路径接手,旗语义=回退现状）
    for (const [, p] of this.pending) this.cache.requeueWorkerBake(p.cx, p.cy);
    for (const k of this.preReadyQueue) this.cache.requeueWorkerBake(k & 0xffff, (k >> 16) & 0xffff);
    this.pending.clear();
    this.preReadyQueue = [];
    this.cache.bakeClient = null;
    this.terminate();
  }

  private post(msg: unknown, transfer?: Transferable[]): void {
    this.worker?.postMessage(msg, transfer ?? []);
  }

  dispose(): void {
    this.disposed = true;
    this.terminate();
  }

  private terminate(): void {
    if (this.worker) { this.worker.onmessage = null; this.worker.onerror = null; this.worker.terminate(); }
    this.worker = null;
    this.ready = false;
    this.handshakeResolve = null;
  }
}
