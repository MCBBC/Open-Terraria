// ModLoader 编排(2026-10-04,P0 L1):发现→解包→拓扑排序→确定性分配→注册。
// 时序契约(main.ts 启动链):
//   Phase1 loadModsPhase1() —— 内容注册+id 分配(须在一切世界/UI 消费前)
//   Phase2 applyModAssets(atlas) —— 贴图注入(atlas 构造后,mods/assets.ts)
// 失败策略:单 mod 失败只登记 errors 不阻断启动(资源包同款"增强不是必需"哲学);
// 零 mod 时本模块零副作用(不触任何数据表)。
import type { ModLoadResult, ModPack, SaveModEntry } from './types';
import { ModStore, type ModRow, type ModStorage } from './store';
import { readModPack } from './pack';
import { buildRegistrationPlan, validatePlanReferences, setTileKeyProbe } from './plan';
import { applyRegistrationPlan } from './register';
import { TILE_BY_KEY } from '../data/tiles';

export { ModStore } from './store';
export type { ModRow } from './store';

/** 装载结果单例(UI 面板/资产阶段/存档头消费) */
let currentResult: ModLoadResult | null = null;
/** 已装载包(资产阶段读贴图;不进 ModLoadResult 公出面) */
const loadedPacks: ModPack[] = [];

export function getModLoadResult(): ModLoadResult | null { return currentResult; }
export function getLoadedPacks(): readonly ModPack[] { return loadedPacks; }

/** 存档头 mod 清单(serialize SaveData.mods;无 mod 返回 undefined=键不写,零扰动) */
export function saveModEntries(): SaveModEntry[] | undefined {
  if (!currentResult || currentResult.loaded.length === 0) return undefined;
  return currentResult.loaded.map(({ manifest, counts }) => ({
    id: manifest.id, version: manifest.version,
    items: counts.items, tiles: counts.tiles, npcs: counts.npcs,
  }));
}

/** 装载器(测试可注入 storage) */
export async function loadModsPhase1(storage?: ModStorage): Promise<ModLoadResult> {
  const result: ModLoadResult = { loaded: [], errors: [], allocation: null };
  setTileKeyProbe(() => TILE_BY_KEY);
  const store = new ModStore(storage);
  const rows = await store.listRows();
  const enabled = rows.filter((r) => r.enabled);
  const packs: ModPack[] = [];
  for (const row of enabled) {
    try {
      const blob = await store.getZipBytes(row.id);
      if (!blob) { result.errors.push({ modId: row.id, error: 'zip 数据缺失(存储被清)' }); continue; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const pack = readModPack(bytes);
      if (pack.manifest.id !== row.id) {
        result.errors.push({ modId: row.id, error: `清单 id(${pack.manifest.id})与注册表行(${row.id})不一致` });
        continue;
      }
      packs.push(pack);
    } catch (e) {
      result.errors.push({ modId: row.id, error: (e as Error).message });
    }
  }
  if (packs.length > 0) {
    try {
      const plan = buildRegistrationPlan(packs);
      validatePlanReferences(plan);
      applyRegistrationPlan(plan);
      result.allocation = plan.allocation;
      loadedPacks.push(...plan.mods.map((m) => m.pack));
      for (const { manifest } of plan.mods) {
        result.loaded.push({
          manifest,
          counts: {
            items: plan.itemSpecs.filter((s) => s.modId === manifest.id).length,
            tiles: plan.tileSpecs.filter((s) => s.modId === manifest.id).length,
            npcs: plan.npcSpecs.filter((s) => s.modId === manifest.id).length,
            recipes: plan.recipes.filter((s) => s.modId === manifest.id).length,
          },
        });
      }
    } catch (e) {
      // 拓扑/校验/注册级失败=整批拒载(plan 纪律:fail-fast 不半装)
      result.errors.push({ modId: '*', error: `整批拒载: ${(e as Error)?.message ?? String(e)}` });
    }
  }
  currentResult = result;
  return result;
}

/** 重置(loader 单测用;生产启动链只跑一次) */
export function _resetModLoaderForTests(): void {
  currentResult = null;
  loadedPacks.length = 0;
}
