// ModLoader 编排(2026-10-04,P0 L1):发现→解包→拓扑排序→确定性分配→注册。
// 时序契约(main.ts 启动链):
//   Phase1 loadModsPhase1() —— 内容注册+id 分配(须在一切世界/UI 消费前)
//   Phase2 applyModAssets(atlas) —— 贴图注入(atlas 构造后,mods/assets.ts)
// 失败策略:单 mod 失败只登记 errors 不阻断启动(资源包同款"增强不是必需"哲学);
// 零 mod 时本模块零副作用(不触任何数据表)。
import type { ModLoadResult, ModPack } from './types';
import { ModStore, type ModRow, type ModStorage } from './store';
import { readModPack } from './pack';
import { buildRegistrationPlan, validatePlanReferences, setTileKeyProbe } from './plan';
import { applyRegistrationPlan, bindModBiomeFlags } from './register';
import { resolveModBossMusic } from './music';   // ★BGM 面:boss 曲绑定解析(L2 后)
import { TILE_BY_KEY, TILE_DEFS } from '../data/tiles';
import { setModBridgeProvider, setSaveModsProvider, setEnabledModsProvider, setCurrentAlloc, setGenSrcProvider } from './bridge';
import { createModContext, type ModEntry } from './api';
import { loadModConfigValues } from './config';
import { modBuffTypeOf } from './buffs';

/** L2 入口装载:浏览器=blob URL 动态 import(求值后即 revoke)。
 *  vite 生产构建对变量 URL 的动态 import 零转换(@vite-ignore)。
 *  ★node(vite-node)会拦截 blob:/data: 动态 import(vitest 实测)——测试经
 *  loadModsPhase1 的 opts.entryLoader 注入替代装载器。 */
async function importModEntry(code: Uint8Array): Promise<unknown> {
  if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    && typeof window !== 'undefined') {
    const url = URL.createObjectURL(new Blob([code.slice()], { type: 'text/javascript' }));
    try {
      return (await import(/* @vite-ignore */ url)).default;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  throw new Error('当前环境无 ESM 动态入口装载能力(浏览器外须经 opts.entryLoader 注入)');
}

export { ModStore } from './store';
export type { ModRow } from './store';

// 存档头/读档检测供数(装载成功后注册;未装载=null=存档键不落/读档检测跳过)
// ★P5:id 平移完整解——存档头携带每 mod 的分配映射(itemIds/tileIds,lastPlan 供数)
let lastPlan: import('./types').RegistrationPlan | null = null;
setSaveModsProvider(() => {
  if (!currentResult?.loaded.length || !lastPlan) return null;
  return currentResult.loaded.map(({ manifest, counts }) => ({
    id: manifest.id, version: manifest.version,
    items: counts.items, tiles: counts.tiles, npcs: counts.npcs, buffs: (counts as { buffs?: number }).buffs ?? 0,
    itemIds: lastPlan!.itemSpecs
      .filter((s) => s.modId === manifest.id)
      .map((s) => [s.fullKey, s.stableId] as [string, number]),
    tileIds: lastPlan!.tileSpecs
      .filter((s) => s.modId === manifest.id)
      .map((s) => [s.fullKey, s.stableId] as [string, number]),
  }));
});
setEnabledModsProvider(() => currentResult
  ? currentResult.loaded.map(({ manifest }) => manifest.id)
  : null);   // ★P4 红蓝修正(B-m1/D-M4):装载过(即使 0 mod)返空数组——全禁场景
             // 缺失 toast 门(old: loaded.length===0 → null → 门恒 false)

/** 装载结果单例(UI 面板/资产阶段/存档头消费) */
let currentResult: ModLoadResult | null = null;
/** 已装载包(资产阶段读贴图;不进 ModLoadResult 公出面) */
const loadedPacks: ModPack[] = [];

export function getModLoadResult(): ModLoadResult | null { return currentResult; }
export function getLoadedPacks(): readonly ModPack[] { return loadedPacks; }

/** 装载器(测试可注入 storage 与 entry 装载器) */
export async function loadModsPhase1(
  storage?: ModStorage,
  opts?: { entryLoader?: (code: Uint8Array) => Promise<unknown> },
): Promise<ModLoadResult> {
  const result: ModLoadResult = { loaded: [], errors: [], allocation: null };
  const entryLoader = opts?.entryLoader ?? importModEntry;
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
      lastPlan = plan;
      validatePlanReferences(plan);
      applyRegistrationPlan(plan);
      bindModBiomeFlags();   // ★一百一十八刀:群系旗绑定(应用后依序;此前无调用端=惰性)
      // ★一百二十九刀:schematics/*.json → 全局(生成 pass 消费;.csch 预转换件)
      {
        const sch: Record<string, unknown> = {};
        const modData: Record<string, unknown> = {};
        for (const [path, bytes] of plan.mods.flatMap((m) => [...m.pack.files])) {
          const mt = /^schematics\/([A-Za-z0-9_]+)\.json$/.exec(path);
          if (mt) { try { sch[mt[1]] = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* 坏件跳过 */ } }
          const md = /^([A-Za-z0-9_-]+)\.json$/.exec(path);   // ★一百三十七刀:根域数据 json
          if (md) { try { modData[md[1]] = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* 坏件跳过 */ } }
        }
        (globalThis as unknown as { __calamitySchematics?: unknown }).__calamitySchematics = sch;
        (globalThis as unknown as { __calamityModData?: unknown }).__calamityModData = modData;
      }
      result.allocation = plan.allocation;
      loadedPacks.push(...plan.mods.map((m) => m.pack));
      // ★G5 mod i18n 合并(2026-10-04 GLM娘实验批):i18n/<lang>.json → Mods.<modId>.*
      //   运行时 overlay(languageManager.mergeModLangPack)。坏文件静默跳过
      //   (增强不是必需;文本键缺失=键名裸显,同原版缺键语义)。
      for (const { manifest, pack } of plan.mods) {
        const dicts: Record<string, Record<string, Record<string, string>>> = {};
        for (const [path, bytes] of pack.files) {
          if (!path.startsWith('i18n/') || !path.endsWith('.json')) continue;
          const lang = path.slice(5, -5);
          if (!lang) continue;
          try {
            const raw = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
            const prefixed: Record<string, Record<string, string>> = {};
            for (const [cat, entries] of Object.entries(raw)) {
              if (typeof entries === 'string') {
                // ★五百刀:平铺点键归一('TownChat.bandit.1' 串值=GLM娘批实形)——
                //  旧实现把串值直塞 Record 位=overlay Object.entries(串)逐字符
                //  劣化(单字符键污染+Lang.has 恒假=城镇闲聊 l10n 整缺)。
                //  归一=首段为 cat、余段为 key(TownChat.bandit.1→TownChat/bandit.1)
                const dot = cat.indexOf('.');
                if (dot <= 0) continue;   // 无段的纯键无 cat 位=不可路由,跳过
                const c = cat.slice(0, dot);
                (prefixed[`Mods.${manifest.id}.${c}`] ??= {})[cat.slice(dot + 1)] = entries;
              } else {
                prefixed[`Mods.${manifest.id}.${cat}`] = entries as Record<string, string>;
              }
            }
            dicts[lang] = prefixed;
          } catch { /* 坏 i18n 文件跳过 */ }
        }
        if (Object.keys(dicts).length > 0) {
          const { languageManager } = await import('../i18n/LanguageManager');
          languageManager.mergeModLangPack(dicts);
        }
      }
      // ---- L2 脚本相位(2026-10-04,P1/P2):entry.js 在 L1 内容注册后逐 mod 执行
      //      (拓扑序;键解析走分配表,跨 mod 顺序=依赖序)。行为钩挂进 hooks 注册表;
      //      内容一律走 content/*.json 声明面(确定性 id 不受脚本影响)。
      //      ★P2:config 先行加载(kv 持久化值并默认),sw.config 读写面注入;
      //      itemUse 上下文注入 applyBuff(mod buff 键→BuffType 解析)。
      //      装载失败登记 errors 不阻断(其余 mod/L1 内容已注册保留)。 ----
      for (const { manifest, pack } of plan.mods) {
        const code = pack.files.get('scripts/main.js');
        if (!code) continue;
        // ★622:mod gen pass 源码捕获(worker 注入——eval mod bundle+stub sw=gen 注册)
        const modSrc = new TextDecoder().decode(code);
        (globalThis as any).__swModEntrySrc = modSrc;
        setGenSrcProvider(() => modSrc);
        if ((globalThis as any).__swSkipModEntry) { continue; }
        try {
          const configState = await loadModConfigValues(manifest.id, manifest.config ?? {});
          const modBuffKey = (bkey: string): number => modBuffTypeOf(manifest.id, bkey);
          const entry = await entryLoader(code);
          if (typeof entry !== 'function') {
            throw new Error('scripts/main.js default export 须为函数 main(sw)');
          }
          (entry as ModEntry)(createModContext(manifest.id, plan.allocation, configState, {
            decorateUseCtx: (ctx) => ({
              ...ctx,
              applyBuff: (bkey: string, seconds: number) => {
                ctx.player.buffs.apply(modBuffKey(bkey), seconds);
              },
            }),
          }));
        } catch (e) {
          result.errors.push({ modId: manifest.id, error: `脚本装载失败: ${(e as Error)?.message ?? String(e)}` });
        }
      }
      // ★BGM 面:boss 曲绑定解析(L2 脚本相位后——sw.bossMusic 原始绑定在 main()
      //  期入表,须在全部 mod 脚本跑完后统一解析;缺引用=该 mod 装载错误登记)
      for (const { manifest } of plan.mods) {
        try {
          resolveModBossMusic(manifest.id, (fullKey) => plan.allocation.npcs.get(fullKey));
        } catch (e) {
          result.errors.push({ modId: manifest.id, error: (e as Error).message });
        }
      }
      // ★worker 桥供数注册(2026-10-04):SaveClient/WorldGenClient 每次 worker(重)建
      //  时拉取推送——mod tile internal id 经 TILE_BY_KEY 反查(注册后即落表);
      //  烘焙域另带 def 本体(保序直落,BakeProtocol ship 通道);
      //  ★P5:itemKeys/tileKeys=当前分配映射(worker 读档重映射用)
      setModBridgeProvider(() => ({
        itemStableIds: [...plan.allocation.items.values()],
        tilePairs: plan.tileSpecs
          .map((t) => [TILE_BY_KEY[t.fullKey], t.stableId] as [number, number])
          .filter(([internal]) => internal !== undefined && internal > 0),
        modTileDefs: plan.tileSpecs
          .map((t) => {
            const internal = TILE_BY_KEY[t.fullKey];
            return internal !== undefined && internal > 0
              ? { def: TILE_DEFS[internal]!, internal, stable: t.stableId }
              : null;
          })
          .filter((e): e is { def: (typeof TILE_DEFS)[number]; internal: number; stable: number } => e !== null),
        itemKeys: [...plan.allocation.items.entries()],
        tileKeys: [...plan.allocation.tiles.entries()],
      }));
      // ★P5:主线程读档重映射同源(loadSaveData 主线程回退路径)

      setCurrentAlloc({
        itemKeys: plan.allocation.items,
        tileKeys: plan.allocation.tiles,
      });
      for (const { manifest } of plan.mods) {
        result.loaded.push({
          manifest,
          counts: {
            items: plan.itemSpecs.filter((s) => s.modId === manifest.id).length,
            tiles: plan.tileSpecs.filter((s) => s.modId === manifest.id).length,
            npcs: plan.npcSpecs.filter((s) => s.modId === manifest.id).length,
            projs: plan.projSpecs.filter((s) => s.modId === manifest.id).length,
            recipes: plan.recipes.filter((s) => s.modId === manifest.id).length,
            buffs: (plan.buffSpecs ?? []).filter((s) => s.modId === manifest.id).length,
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
  lastPlan = null;
}
