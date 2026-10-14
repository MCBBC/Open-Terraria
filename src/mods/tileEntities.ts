// mod Tile Entity 运行时(★TE 梯队,2026-10-14;工坊普查判谳最后缺口——存储/机器类
// mod 的关键面,tML ModTileEntity 形)。
// 生命周期:sw.tileEntity(tileKey, spec) 注册(键=本 mod content/tiles 声明键)→
// 绑定世界(TileStore.onTileChanged 监听,Game.start/destroy 沿)→放置/破坏自愈
// (setTile 派发:现型=TE tile 且锚格[frameX/Y=0]且无实例=建;实例在而现型≠TE tile
// =onDestroy+摘)→逐 tick update(runModPostEntities 派发)→存读(SaveData.teMods
// 段,k=te 全键,d=save 钩产物/缺省 state 直存)。
// 纪律:①零 mod 零成本(registry 空则监听不装/tick 直通) ②state=mod 自由对象
// (JSON-able 纪律由 save 钩自管;缺省直存 state=作者责任面,文档声明) ③锚格约定
// =frameX/frameY 全 0(1×1 恒真;多格件=左上锚,放置链 frame 写位决定) ④WeakMap
// 按世界 TileStore 分桶(跨世界实例隔离;destroy 摘监听清桶)。
import type { TileStore } from '../world/TileStore';
import type { GameHooks } from '../entities/types';

/** te 句柄(mod 侧可见面) */
export interface ModTEHandle {
  /** 锚格 tile 坐标 */
  readonly x: number;
  readonly y: number;
  /** te 全键(mod_<modId>_<key>) */
  readonly key: string;
  /** mod 自由状态对象(create 钩产物/缺省 {};save 缺省直存本对象) */
  state: Record<string, unknown>;
}

export interface ModTileEntitySpec {
  /** 新实例初始 state(缺省 {}) */
  create?(): Record<string, unknown>;
  /** 逐 tick(存活实例逐个;runModPostEntities 派发) */
  update?(te: ModTEHandle, game: unknown): void;
  /** tile 被破坏/替换(无 game——tile 移除沿;state 随实例消亡,自管外部副作用) */
  onDestroy?(te: ModTEHandle): void;
  /** 存档序列化(缺省=state 直存;返 undefined=本实例不落档) */
  save?(te: ModTEHandle): Record<string, unknown> | undefined;
  /** 读档恢复(save 钩产物;缺省=直存回 state) */
  load?(te: ModTEHandle, data: unknown): void;
}

interface RegistryEntry { modId: string; key: string; fullKey: string; spec: ModTileEntitySpec }
interface TEInstance { x: number; y: number; state: Record<string, unknown> }
interface BoundStore {
  /** tileInternal → (posKey → instance) */
  inst: Map<number, Map<string, TEInstance>>;
  /** 闭包身份(TE-6:listener 比对) */
  listener: (x: number, y: number) => void;
}

/** te 注册表(tileInternal → entry;registry 非空才装监听=零 mod 零成本) */
const registry = new Map<number, RegistryEntry>();
/** 绑定世界桶(WeakMap=世界实例弃用自动回收) */
const bound = new WeakMap<TileStore, BoundStore>();
/** 现役世界(save/tick 快速解析;bind/unbind 沿维护) */
let activeStore: TileStore | null = null;
/** 全键 → tileInternal(restore 反查用) */
const byFullKey = new Map<string, number>();

export function registerModTileEntity(modId: string, tileInternal: number, tileKey: string, spec: ModTileEntitySpec): void {
  if (registry.has(tileInternal)) throw new Error(`[mod-te] tileEntity 重复注册: tile ${tileInternal}`);
  const fullKey = tileKey.startsWith('mod_') ? tileKey : `mod_${modId}_${tileKey}`;
  registry.set(tileInternal, { modId, key: tileKey, fullKey, spec });
  byFullKey.set(fullKey, tileInternal);
}

/** 绑定世界(Game.start 沿;幂等)。registry 空=不装监听(零 mod 零成本)。 */
export function bindModTileEntities(store: TileStore): void {
  if (registry.size === 0 || bound.has(store)) { activeStore = store; return; }
  const listener = (x: number, y: number): void => {
    // ★R-B-TE-6(2026-10-14):闭包身份守卫(旧=WeakMap 成员性——同 store 解绑后
    //  再绑场景旧监听因 map 重新有成员而复活=双桶双写;身份比对=免疫)
    if (bound.get(store)?.listener !== listener) return;
    const i = store.idx(x, y);
    const t = store.type[i];
    const pk = `${x},${y}`;
    for (const [tileInternal, entry] of registry) {
      const m = b.inst.get(tileInternal);
      const inst = m?.get(pk);
      if (inst) {
        if (t !== tileInternal) {   // 破坏/替换 → onDestroy+摘
          try { entry.spec.onDestroy?.({ x, y, key: entry.fullKey, state: inst.state }); }
          catch (err) { console.warn('[mod-te] onDestroy', err); }
          m!.delete(pk);
        }
      } else if (t === tileInternal && store.frameX[i] === 0 && store.frameY[i] === 0) {
        // 放置(锚格) → 建
        let state: Record<string, unknown> = {};
        try { state = entry.spec.create?.() ?? {}; }
        catch (err) { console.warn('[mod-te] create', err); }
        if (!m) b.inst.set(tileInternal, new Map());
        b.inst.get(tileInternal)!.set(pk, { x, y, state });
      }
    }
  };
  const b: BoundStore = { inst: new Map(), listener };
  store.onTileChanged(listener);
  bound.set(store, b);
  activeStore = store;
  // ★R-B-TE-4(2026-10-14):bind 沿锚格扫描——mod gen pass 在【worker 域】写的
  //  TE tile 无运行期 setTile 事件、读档 restore 之外的第三建通道。全图一遍扫
  //  (4200×1200≈5M 读,世界装载重头戏内可忽略);registry 空不达此(上方早退)。
  for (let y = 0; y < store.h; y++) {
    for (let x = 0; x < store.w; x++) {
      listener(x, y);
    }
  }
}

/** 解绑(Game.destroy 沿;清实例桶=跨世界隔离)。TileStore 无监听摘除面——
 *  监听闭包守 bound.has(解绑后=惰性直通),桶随 WeakMap 回收。 */
export function unbindModTileEntities(store: TileStore): void {
  bound.delete(store);
  if (activeStore === store) activeStore = null;
}

/** 逐 tick(runModPostEntities 派发;registry 空直通)。 */
export function tickModTileEntities(game: GameHooks): void {
  if (registry.size === 0) return;
  const store = (game.world?.store ?? activeStore) as TileStore | undefined | null;
  if (!store) return;
  const b = bound.get(store);
  if (!b) return;
  for (const [tileInternal, entry] of registry) {
    const m = b.inst.get(tileInternal);
    if (!m || m.size === 0) continue;
    // ★R-B-TE-1(2026-10-14):tick 对账——silent 旁路(陨石坑/祭坛粉碎等 setTileSilent
    //  不派发监听)的孤儿实例在此闭合约:现格失配→onDestroy+摘(每 TE 一次 store.get,
    //  常量级;实例数小=可忽略)
    for (const [pk, inst] of m) {
      if (store.type[store.idx(inst.x, inst.y)] !== tileInternal) {
        try { entry.spec.onDestroy?.({ x: inst.x, y: inst.y, key: entry.fullKey, state: inst.state }); }
        catch (err) { console.warn('[mod-te] onDestroy', err); }
        m.delete(pk);
        continue;
      }
      try { entry.spec.update?.({ x: inst.x, y: inst.y, key: entry.fullKey, state: inst.state }, game); }
      catch (err) { console.warn('[mod-te] update', err); }
    }
  }
}

/** 存档序列化(SaveFile/SaveClient meta 装配供数;与 mods 供数同族防漏喂)。 */
export function serializeModTEs(store: TileStore | null | undefined): import('../save/serialize').ModTESaveEntry[] {
  if (registry.size === 0) return [];
  const b = bound.get(store ?? activeStore as TileStore);
  if (!b) return [];
  const out: import('../save/serialize').ModTESaveEntry[] = [];
  for (const [tileInternal, entry] of registry) {
    const m = b.inst.get(tileInternal);
    if (!m) continue;
    for (const inst of m.values()) {
      let d: Record<string, unknown> | undefined;
      try { d = entry.spec.save ? entry.spec.save({ x: inst.x, y: inst.y, key: entry.fullKey, state: inst.state }) : inst.state; }
      catch (err) {
        // ★R-B-TE-3(2026-10-14):save 钩 throw=占位条目落档(旧=静默 continue=
        //  重进 TE 消失无任何标记;占位 __lost 让 restore 侧可见+log)
        console.warn(`[mod-te] save 钩 throw,落占位: ${entry.fullKey}@${inst.x},${inst.y}`, err);
        out.push({ k: entry.fullKey, x: inst.x, y: inst.y, d: { __lost: true } });
        continue;
      }
      if (d === undefined) continue;   // save 钩显式弃存
      // ★R-B-TE-2(2026-10-14):缺省直存消毒(JSON round-trip)——state 含循环引用/
      //  BigInt 时 JSON.stringify 整档抛、函数/循环→worker structured clone
      //  DataCloneError(双保存链全断);消毒失败=弃存该实例(warn)与 save 钩
      //  throw 同语义。有 save 钩的 mod 已被钩域 try/catch 隔离。
      if (!entry.spec.save) {
        try { d = JSON.parse(JSON.stringify(d)) as Record<string, unknown>; }
        catch { console.warn(`[mod-te] state 不可序列化,弃存: ${entry.fullKey}@${inst.x},${inst.y}`); continue; }
      }
      out.push({ k: entry.fullKey, x: inst.x, y: inst.y, d });
    }
  }
  return out;
}

/** 读档回填(loadSaveData world 建成后;load 钩恢复/缺省直存回 state)。 */
export function restoreModTEs(store: TileStore, entries: import('../save/serialize').ModTESaveEntry[] | undefined): void {
  if (!entries?.length || registry.size === 0) return;
  bindModTileEntities(store);
  const b = bound.get(store);
  if (!b) return;
  for (const e of entries) {
    const tileInternal = byFullKey.get(e.k);
    if (tileInternal === undefined) continue;   // 缺 mod=静默降级(占位语义)
    if ((e.d as Record<string, unknown> | undefined)?.__lost) {
      console.warn(`[mod-te] 读档: ${e.k}@${e.x},${e.y} 上局 save 钩 throw 弃存(占位不复活)`);
      continue;
    }
    const entry = registry.get(tileInternal)!;
    let m = b.inst.get(tileInternal);
    if (!m) { m = new Map(); b.inst.set(tileInternal, m); }
    const state: Record<string, unknown> = {};
    try { entry.spec.load?.({ x: e.x, y: e.y, key: entry.fullKey, state }, e.d ?? {}); }
    catch (err) { console.warn('[mod-te] load', err); }
    if (!entry.spec.load) Object.assign(state, e.d ?? {});   // 缺 load 钩=直存回填
    m.set(`${e.x},${e.y}`, { x: e.x, y: e.y, state });
  }
}

/** 零 mod 探针(runModPostEntities 头门;registry 空直通零成本) */
export function hasModTileEntities(): boolean { return registry.size > 0; }

/** ★magic-storage(2026-10-14):跨 TE 读访问器——mod 存储网络的心脏泛洪找单元/
 *  UI 读单元态,需要按 tile 枚举/按坐标取 TE。registry 空或世界未绑=空。 */
export function getModTileEntitiesOfTile(tileInternal: number): ModTEHandle[] {
  if (registry.size === 0) return [];
  const b = activeStore ? bound.get(activeStore) : undefined;
  if (!b) return [];
  const m = b.inst.get(tileInternal);
  if (!m) return [];
  const out: ModTEHandle[] = [];
  for (const inst of m.values()) out.push({ x: inst.x, y: inst.y, key: registry.get(tileInternal)!.fullKey, state: inst.state });
  return out;
}
export function getModTileEntityAt(tileInternal: number, x: number, y: number): ModTEHandle | null {
  if (registry.size === 0) return null;
  const b = activeStore ? bound.get(activeStore) : undefined;
  return b?.inst.get(tileInternal)?.get(`${x},${y}`)
    ? { x, y, key: registry.get(tileInternal)!.fullKey, state: b.inst.get(tileInternal)!.get(`${x},${y}`)!.state }
    : null;
}

/** 测试清账 */
export function _resetModTEsForTests(): void {
  registry.clear();
  byFullKey.clear();
  activeStore = null;
  // bound=WeakMap 不可清;测试各自造新 store 即隔离
}
