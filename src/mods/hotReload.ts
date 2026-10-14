// mod 热重载编排(★D11,2026-10-14)——启停/装卸后免整页 reload。
// 链:unloadModsForHotReload(全域注册表+数据表 teardown)→ loadModsPhase1(重装
// 当前启用集)→ applyModAssets(贴图重注入[增量键覆盖既有])→ 引擎缓存沿清(bestiary/
// petBuffKind/装备页)。语义边界:
//   · 世界内已实例化的 mod 内容(tile/NPC 实体)【不回滚】——与原版「mod 移除后
//     存档内容降级」同相(占位/无害态),存档键保留(重启用=恢复)。
//   · 贴图:atlas vimages 的 mod 键重注入覆盖;[被停用 mod 的旧键]保留在 vimages
//     (无消费方=零影响;atlas 无驱逐面与 buff blob 同语义,登记微泄漏可接受)。
//   · 仅菜单态可用(游戏内启停仍提示 reload——世界内实体引用活 mod 注册表的
//     面[aiSpec 等] teardown 会悬空;游戏内换装=退世界再启停,与原版一致)。
import { unloadModsForHotReload } from './teardown';
import { loadModsPhase1, getModLoadResult } from './loader';
import { applyModAssets } from './assets';

export interface HotReloadResult {
  ok: boolean;
  errors: string[];
  counts?: { items: number; npcs: number; projs: number; walls: number };
}

/** 热重载一口(modsPanel 启停/装卸沿调)。仅菜单态(game==null)。 */
let inFlight = false;

export async function hotReloadMods(atlas: unknown): Promise<HotReloadResult> {
  // ★R-A-Me1(2026-10-14):in-flight 锁——并发 toggle/import 的 teardown 插进
  //  重装载 await 窗=半注册态被清+交错 fail-fast 随机炸;忙=直接报错
  if (inFlight) return { ok: false, errors: ['热重载进行中(连点)'] };
  inFlight = true;
  try {
    return await hotReloadModsInner(atlas);
  } finally {
    inFlight = false;
  }
}

async function hotReloadModsInner(atlas: unknown): Promise<HotReloadResult> {
  // ① teardown 全域
  unloadModsForHotReload();
  // ★R-A-M3(2026-10-14):worker 桥释放——WorldGen/Save worker 缓存实例持旧
  //  mod 映射表(itemKeys/tileKeys/wallKeys/genSrcs),不重推=菜单态读档/生成
  //  用旧表(停用翻译残留/新装 miss/vid 位移串味三向错);terminate=下次
  //  ensure 惰性重建(新 provider 数据)
  try {
    const flow = (window as unknown as { __swFlow?: { releaseWorkers?: () => void } }).__swFlow;
    flow?.releaseWorkers?.();
  } catch { /* 桥缺=无 worker 在飞 */ }
  // ② 重装载(启用集现读 store=新启停态)
  try {
    await loadModsPhase1(undefined);
  } catch (err) {
    return { ok: false, errors: [`重装载失败: ${(err as Error).message}`] };
  }
  const r = getModLoadResult();
  if (!r || r.errors.length > 0) {
    return { ok: false, errors: (r?.errors ?? []).map((e) => `${e.modId}: ${e.error}`) };
  }
  // ③ 贴图重注入(atlas vimages 键覆盖注入)
  try {
    await applyModAssets(atlas as never);
  } catch (err) {
    return { ok: false, errors: [`贴图注入失败: ${(err as Error).message}`] };
  }
  const a = r.allocation;
  return {
    ok: true, errors: [],
    counts: a ? { items: a.items.size, npcs: a.npcs.size, projs: a.projs.size, walls: a.walls.size } : undefined,
  };
}
