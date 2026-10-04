// 注册计划构建(纯逻辑,零数据模块依赖——loader 与注册面解耦缝)。
// 拓扑排序(Kahn)+ 确定性 id 分配(拓扑序内 mod id 字典序;mod 内内容键字典序)
// =联机双端一致性与存档 id 稳定性的根(design.md §2)。
import type {
  ModIdAllocation, ModItemContent, ModNpcContent, ModPack, ModProjContent,
  ModRecipeContent, ModShopContent, ModTileContent, RegistrationPlan,
} from './types';
import {
  MOD_ITEM_STABLE_BASE, MOD_NPC_ID_BASE, MOD_PROJ_ID_BASE, MOD_TILE_STABLE_BASE,
} from './types';
import { modItemFullKey, versionSatisfies } from './manifest';
import { discoverPackJsonPaths, readPackJson } from './pack';

export class ModPlanError extends Error {}

// ---- 内容 spec 校验(坏条目 fail-fast 整 mod 拒载;错误信息带 modId+键) ----

function fail(modId: string, what: string, key: string): never {
  throw new ModPlanError(`mod ${modId} ${what} 键 "${key}" 校验失败`);
}

function parseItem(modId: string, raw: unknown): ModItemContent {
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === 'string' ? o.key : fail(modId, 'item', String(o.key ?? ''));
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(key)) fail(modId, 'item', key);
  if (typeof o.name !== 'string' || o.name.length === 0) fail(modId, 'item', key);
  return o as unknown as ModItemContent;
}

function parseTile(modId: string, raw: unknown): ModTileContent {
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === 'string' ? o.key : fail(modId, 'tile', String(o.key ?? ''));
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(key)) fail(modId, 'tile', key);
  if (typeof o.texture !== 'string' || o.texture.length === 0) fail(modId, 'tile', key);
  return o as unknown as ModTileContent;
}

function parseNpc(modId: string, raw: unknown): ModNpcContent {
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === 'string' ? o.key : fail(modId, 'npc', String(o.key ?? ''));
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(key)) fail(modId, 'npc', key);
  if (typeof o.name !== 'string' || o.name.length === 0) fail(modId, 'npc', key);
  if (typeof o.aiStyle !== 'number') fail(modId, 'npc', key);
  if (typeof o.lifeMax !== 'number' || typeof o.damage !== 'number' || typeof o.defense !== 'number') {
    fail(modId, 'npc', key);
  }
  return o as unknown as ModNpcContent;
}

function parseRecipe(modId: string, raw: unknown): ModRecipeContent {
  const o = raw as Record<string, unknown>;
  if (typeof o.create !== 'string') fail(modId, 'recipe', String(o.create ?? ''));
  return o as unknown as ModRecipeContent;
}

function parseProj(modId: string, raw: unknown): ModProjContent {
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === 'string' ? o.key : fail(modId, 'projectile', String(o.key ?? ''));
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(key)) fail(modId, 'projectile', key);
  if (typeof o.texture !== 'string' || o.texture.length === 0) fail(modId, 'projectile', key);
  return o as unknown as ModProjContent;
}

// ---- 依赖拓扑排序(Kahn;缺依赖/环/版本不满足=整组拒载) ----

/** 返回拓扑序的 manifest id 数组。周期/缺依赖抛 ModPlanError。 */
export function topoSortMods(manifests: ModPack[]): string[] {
  const byId = new Map(manifests.map((p) => [p.manifest.id, p]));
  // 字典序准入=确定性(Kahn 队列按 id 升序弹出)
  const ids = manifests.map((p) => p.manifest.id).sort();
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of ids) indeg.set(id, 0);
  for (const p of manifests) {
    for (const [dep, constraint] of Object.entries(p.manifest.dependencies ?? {})) {
      const depPack = byId.get(dep);
      if (!depPack) throw new ModPlanError(`mod ${p.manifest.id} 依赖缺失: ${dep}`);
      if (!versionSatisfies(depPack.manifest.version, constraint)) {
        throw new ModPlanError(`mod ${p.manifest.id} 依赖版本不满足: ${dep} 需 ${constraint} 实装 ${depPack.manifest.version}`);
      }
      indeg.set(p.manifest.id, (indeg.get(p.manifest.id) ?? 0) + 1);
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(p.manifest.id);
    }
  }
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    queue.sort();
    const id = queue.shift()!;
    order.push(id);
    for (const next of dependents.get(id) ?? []) {
      const d = (indeg.get(next) ?? 1) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== ids.length) {
    const stuck = ids.filter((id) => !order.includes(id));
    throw new ModPlanError(`mod 依赖环: ${stuck.join(', ')}`);
  }
  return order;
}

// ---- 计划构建 ----

/**
 * 拓扑序逐 mod 分配 id 并产出注册计划。
 * 确定性:①拓扑序(Kahn 字典序队列)②mod 内 items/tiles/npcs 各按全键字典序分配。
 * 同一 mod 集合恒得同一分配(联机双端/存档一致性根)。
 */
export function buildRegistrationPlan(packs: ModPack[]): RegistrationPlan {
  const order = topoSortMods(packs);
  const byId = new Map(packs.map((p) => [p.manifest.id, p]));
  const allocation: ModIdAllocation = { items: new Map(), tiles: new Map(), npcs: new Map(), projs: new Map() };
  const itemSpecs: RegistrationPlan['itemSpecs'] = [];
  const tileSpecs: RegistrationPlan['tileSpecs'] = [];
  const npcSpecs: RegistrationPlan['npcSpecs'] = [];
  const projSpecs: RegistrationPlan['projSpecs'] = [];
  const shops: RegistrationPlan['shops'] = [];
  const recipes: RegistrationPlan['recipes'] = [];
  const idOf = (manifestId: string) => order.indexOf(manifestId);
  const sortedPacks = [...packs].sort((a, b) => idOf(a.manifest.id) - idOf(b.manifest.id));

  for (const pack of sortedPacks) {
    const modId = pack.manifest.id;
    // items:全键字典序分配 stable id
    const itemSpecsOfPack: Array<{ path: string; spec: ModItemContent }> = [];
    for (const path of discoverPackJsonPaths(pack, 'items')) {
      const spec = parseItem(modId, readPackJson(pack, path));
      itemSpecsOfPack.push({ path, spec });
    }
    itemSpecsOfPack.sort((a, b) => (a.spec.key < b.spec.key ? -1 : a.spec.key > b.spec.key ? 1 : 0));
    for (const { spec } of itemSpecsOfPack) {
      const fullKey = modItemFullKey(modId, spec.key);
      if (allocation.items.has(fullKey)) throw new ModPlanError(`mod ${modId} 物品键重复: ${spec.key}`);
      const stableId = MOD_ITEM_STABLE_BASE + allocation.items.size;
      if (stableId > 65535) throw new ModPlanError(`mod 物品段溢出(>65535): ${fullKey}`);
      allocation.items.set(fullKey, stableId);
      itemSpecs.push({ modId, spec, stableId, fullKey });
    }
    // tiles:全键字典序分配 stable id(1030-2047 空闲区)
    const tileSpecsOfPack: Array<{ spec: ModTileContent }> = [];
    for (const path of discoverPackJsonPaths(pack, 'tiles')) {
      tileSpecsOfPack.push({ spec: parseTile(modId, readPackJson(pack, path)) });
    }
    tileSpecsOfPack.sort((a, b) => (a.spec.key < b.spec.key ? -1 : a.spec.key > b.spec.key ? 1 : 0));
    for (const { spec } of tileSpecsOfPack) {
      const fullKey = modItemFullKey(modId, spec.key);
      if (allocation.tiles.has(fullKey)) throw new ModPlanError(`mod ${modId} tile 键重复: ${spec.key}`);
      const stableId = MOD_TILE_STABLE_BASE + allocation.tiles.size;
      if (stableId > 2047) throw new ModPlanError(`mod tile 段溢出(>2047;扩容另批): ${fullKey}`);
      allocation.tiles.set(fullKey, stableId);
      tileSpecs.push({ modId, spec, stableId, fullKey });
    }
    // projectiles:全键字典序分配 projId(2000+ 段;全局连续=跨 mod 确定性)
    const projSpecsOfPack: Array<{ spec: ModProjContent }> = [];
    for (const path of discoverPackJsonPaths(pack, 'projectiles')) {
      projSpecsOfPack.push({ spec: parseProj(modId, readPackJson(pack, path)) });
    }
    projSpecsOfPack.sort((a, b) => (a.spec.key < b.spec.key ? -1 : a.spec.key > b.spec.key ? 1 : 0));
    for (const { spec } of projSpecsOfPack) {
      const fullKey = modItemFullKey(modId, spec.key);
      if (allocation.projs.has(fullKey)) throw new ModPlanError(`mod ${modId} projectile 键重复: ${spec.key}`);
      const projId = MOD_PROJ_ID_BASE + allocation.projs.size;
      allocation.projs.set(fullKey, projId);
      projSpecs.push({ modId, spec, projId, fullKey });
    }
    // npcs:全键字典序分配 npc id(800+)
    const npcSpecsOfPack: Array<{ spec: ModNpcContent }> = [];
    for (const path of discoverPackJsonPaths(pack, 'npcs')) {
      npcSpecsOfPack.push({ spec: parseNpc(modId, readPackJson(pack, path)) });
    }
    npcSpecsOfPack.sort((a, b) => (a.spec.key < b.spec.key ? -1 : a.spec.key > b.spec.key ? 1 : 0));
    for (const { spec } of npcSpecsOfPack) {
      const fullKey = modItemFullKey(modId, spec.key);
      if (allocation.npcs.has(fullKey)) throw new ModPlanError(`mod ${modId} npc 键重复: ${spec.key}`);
      const npcId = MOD_NPC_ID_BASE + allocation.npcs.size;
      allocation.npcs.set(fullKey, npcId);
      npcSpecs.push({ modId, spec, npcId, fullKey });
    }
    // recipes:单文件约定(content/recipes.json)
    const recipeRaw = readPackJson<ModRecipeContent[] | { recipes: ModRecipeContent[] }>(pack, 'content/recipes.json');
    if (recipeRaw !== null) {
      const list = Array.isArray(recipeRaw) ? recipeRaw : recipeRaw.recipes;
      if (!Array.isArray(list)) throw new ModPlanError(`mod ${modId} recipes.json 须数组`);
      for (const r of list) recipes.push({ modId, spec: parseRecipe(modId, r) });
    }
    // shops:单文件约定(content/shops.json,P3 商店上架)
    const shopRaw = readPackJson<ModShopContent[] | { shops: ModShopContent[] }>(pack, 'content/shops.json');
    if (shopRaw !== null) {
      const list = Array.isArray(shopRaw) ? shopRaw : shopRaw.shops;
      if (!Array.isArray(list)) throw new ModPlanError(`mod ${modId} shops.json 须数组`);
      for (const s of list) {
        if (typeof s?.npcId !== 'number' || !Array.isArray(s.items)) fail(modId, 'shop', String(s?.npcId ?? ''));
        shops.push({ modId, spec: s });
      }
    }
  }
  return { mods: sortedPacks.map((p) => ({ manifest: p.manifest, pack: p })), order, allocation, itemSpecs, tileSpecs, npcSpecs, projSpecs, shops, recipes };
}

// ---- 引用校验(分配完成后统一验:跨 mod 引用也在此捕获;注册阶段因此不会中途抛错) ----

/** 校验计划内全部跨引用(掉落/放置/配方),缺引用抛 ModPlanError(整批拒载)。
 *  register.ts 内同名 throw 自此降级为防御性断言。
 *  原版 tile 键存在性经 setTileKeyProbe 注入(loader 装配 TILE_BY_KEY,本文件保持零重依赖)。 */
export function validatePlanReferences(plan: RegistrationPlan): void {
  const itemOf = (modId: string, raw: string): number => {
    if (/^\d+$/.test(raw)) return Number(raw);                      // 原版 vid
    const full = raw.startsWith('mod_') ? raw : `mod_${modId}_${raw}`;
    const id = plan.allocation.items.get(full);
    if (id === undefined) throw new ModPlanError(`mod ${modId} 引用未注册物品: ${raw}`);
    return id;
  };
  for (const t of plan.tileSpecs) {
    if (t.spec.dropItem !== undefined) itemOf(t.modId, t.spec.dropItem);
  }
  for (const it of plan.itemSpecs) {
    const pt = it.spec.placeTile;
    if (pt === undefined) continue;
    if (!pt.startsWith('mod_')) {
      if (tileKeyProbe()[pt] === undefined) {
        throw new ModPlanError(`mod ${it.modId} 物品 ${it.spec.key} 放置 tile 键不存在: ${pt}`);
      }
      continue;
    }
    if (!plan.allocation.tiles.has(pt)) {
      throw new ModPlanError(`mod ${it.modId} 物品 ${it.spec.key} 放置 tile 未注册: ${pt}`);
    }
  }
  for (const n of plan.npcSpecs) {
    for (const d of n.spec.drops ?? []) itemOf(n.modId, d.item);
  }
  for (const r of plan.recipes) {
    itemOf(r.modId, r.spec.create);
    for (const it of r.spec.items ?? []) itemOf(r.modId, it.item);
  }
  // 弹幕引用(P2):物品 combat.shoot 字符串 `proj:<key>`/mod 键 → 分配表
  for (const it of plan.itemSpecs) {
    const sh = it.spec.combat?.shoot;
    if (typeof sh !== 'string') continue;
    const full = sh.startsWith('mod_') ? sh
      : sh.startsWith('proj:') ? `mod_${it.modId}_${sh.slice(5)}`
        : `mod_${it.modId}_${sh}`;
    if (!plan.allocation.projs.has(full)) {
      throw new ModPlanError(`mod ${it.modId} 物品 ${it.spec.key} 引用未注册弹幕: ${sh}`);
    }
  }
}

/** 原版 tile 键存在性探测(避免 plan.ts import tiles.ts 拉重依赖;loader 装配) */
let _tileKeyProbe: () => Record<string, number> = () => ({});
export function setTileKeyProbe(fn: () => Record<string, number>): void { _tileKeyProbe = fn; }
function tileKeyProbe(): Record<string, number> { return _tileKeyProbe(); }
