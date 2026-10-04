// 注册桥(2026-10-04):RegistrationPlan → 各数据模块注册 API。
// 域翻译在这里集中:mod 内容键 → 全键/stable id/tile 键/掉落 Rule。
// 全部走各数据模块的 registerMod* 追加面(零改原版面;零 mod 时整文件无副作用)。
import type { RegistrationPlan } from './types';
import { registerModItem } from '../data/items';
import { registerModTile, TILE_BY_KEY, type TileDef } from '../data/tiles';
import { registerModNpc, type VanillaNpc } from '../data/vanillaNpcs';
import { registerModRecipes, type VanillaRecipe } from '../data/vanillaRecipes';
import { registerModItemFunc } from '../data/vanillaItemFunc';
import { registerModCombat } from '../data/vanillaItemCombat';
import { registerModStats } from '../data/vanillaItemStats';
import { registerModNpcRules } from '../drops/NpcDrops';

export interface RegistrationApplied {
  items: number; tiles: number; npcs: number; recipes: number;
}

/** tile 键解析:本 mod tile 键 / 原版 tile 键(直接透传,TILE_BY_KEY 同域) */
function resolveTileKey(modId: string, tileKey: string): string {
  return tileKey.startsWith('mod_') ? tileKey : tileKey;
}

/** mod 配方 → VanillaRecipe 域翻译。tile:数字=原版 TileID;字符串=tile 键
 *  (原版键经 TILE_BY_KEY 换 internal id——站点门按 internal id 求值)。 */
function buildVanillaRecipe(plan: RegistrationPlan, modId: string, spec: RegistrationPlan['recipes'][number]['spec']): VanillaRecipe {
  const keyOf = (raw: string): number => {
    if (/^\d+$/.test(raw)) return Number(raw);                      // 原版 vid(数字字面)
    const full = raw.startsWith('mod_') ? raw : `mod_${modId}_${raw}`;
    const id = plan.allocation.items.get(full);
    if (id === undefined) throw new Error(`[mod-recipe] mod ${modId} 配方引用未注册物品: ${raw}`);
    return id;
  };
  const items: VanillaRecipe['items'] = [];
  for (const it of spec.items ?? []) items.push({ id: keyOf(it.item), stack: it.stack });
  for (const it of spec.vanillaItems ?? []) items.push({ id: it.id, stack: it.stack });
  let tile = -1;
  if (typeof spec.tile === 'number') tile = spec.tile;
  else if (typeof spec.tile === 'string') {
    const tk = resolveTileKey(modId, spec.tile);
    if (tk.startsWith('mod_')) {
      const stable = plan.allocation.tiles.get(tk);
      if (stable === undefined) throw new Error(`[mod-recipe] mod ${modId} 配方站点 tile 未注册: ${tk}`);
      tile = stable;   // mod tile 伪 sheet≡stable id;站点门按 internal id——TILE_BY_KEY 同域映射
    } else {
      tile = TILE_BY_KEY[tk] ?? -1;
    }
  }
  return {
    create: keyOf(spec.create),
    createStack: spec.createStack ?? 1,
    tile,
    items,
    groups: [],
    water: spec.water, honey: spec.honey, lava: spec.lava,
    notDecraftable: true,   // 双保险(registerModRecipes 亦强制)
  };
}

/** mod 简单掉落表 → 原版 Rule 形(chance→denom 取整;noLuck=确定性掷) */
function buildDropRules(plan: RegistrationPlan, modId: string, spec: RegistrationPlan['npcSpecs'][number]['spec']): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const d of spec.drops ?? []) {
    const full = d.item.startsWith('mod_') ? d.item : `mod_${modId}_${d.item}`;
    const id = plan.allocation.items.get(full);
    if (id === undefined) throw new Error(`[mod-drops] mod ${modId} NPC ${spec.key} 掉落引用未注册物品: ${d.item}`);
    const chance = d.chance ?? 1;
    out.push({
      k: 'common', item: id, min: d.min ?? 1, max: d.max ?? 1,
      num: 1, denom: Math.max(1, Math.round(1 / chance)), noLuck: true,
    });
  }
  return out;
}

/**
 * 按计划注册全部 mod 内容。任一条目 fail-fast 抛错(loader 捕获后整 mod 报错,
 * 已注册部分保留——id 分配器保证重试时同 plan 同 id,不产生漂移)。
 */
export function applyRegistrationPlan(plan: RegistrationPlan): RegistrationApplied {
  let items = 0, tiles = 0, npcs = 0, recipes = 0;
  // tile 先注册(物品 placeTile 引用 tile 键)
  for (const t of plan.tileSpecs) {
    const spec = t.spec;
    const dropId = spec.dropItem
      ? plan.allocation.items.get(spec.dropItem.startsWith('mod_') ? spec.dropItem : `mod_${t.modId}_${spec.dropItem}`)
      : undefined;
    if (spec.dropItem && dropId === undefined) {
      throw new Error(`[mod-tile] mod ${t.modId} tile ${spec.key} 掉落引用未注册物品: ${spec.dropItem}`);
    }
    registerModTile({
      key: t.fullKey,
      name: spec.name ?? spec.key,
      solid: spec.solid ?? false,
      platform: spec.platform ?? false,
      decor: spec.decor ?? false,
      opacity: spec.opacity ?? (spec.solid ? 1 : 0),
      pick: spec.pick ?? 0,
      axe: spec.axe ?? -1,
      mapColor: spec.mapColor ?? '#808080',
      blend: spec.frame === 'blend' || spec.frame === 'auto' ? true : false,
      drop: dropId,
      vanilla: {
        sheet: t.stableId,                       // mod tile 恒等式:伪 sheet id≡stable id
        frame: spec.frame ?? 'style',
        fw: spec.frameWidth ?? 1,
        fh: spec.frameHeight ?? 1,
      },
    }, t.stableId);
    tiles++;
  }
  // npcs
  for (const n of plan.npcSpecs) {
    const spec = n.spec;
    registerModNpc(n.npcId, {
      id: n.npcId,
      name: spec.name,
      frames: spec.frames ?? 2,
      lifeMax: spec.lifeMax,
      damage: spec.damage,
      defense: spec.defense,
      knockBackResist: spec.knockBackResist ?? 1,
      aiStyle: spec.aiStyle,
      width: spec.width ?? 20,
      height: spec.height ?? 20,
      npcSlots: 1,
      noGravity: spec.noGravity ?? false,
      noTileCollide: spec.noTileCollide ?? false,
      friendly: spec.friendly ?? false,
      townNPC: spec.townNPC ?? false,
      HitSound: spec.HitSound ?? 'NPC_Hit_1',
      DeathSound: spec.DeathSound ?? 'NPC_Killed_1',
      scale: spec.scale ?? 1,
      critter: spec.critter,
    } satisfies VanillaNpc);
    const dropRules = buildDropRules(plan, n.modId, spec);
    if (dropRules.length > 0) registerModNpcRules(n.npcId, dropRules);
    npcs++;
  }
  // items(combat/func/stats 拆写三表;placeTile 翻译)
  for (const it of plan.itemSpecs) {
    const spec = it.spec;
    const def: Parameters<typeof registerModItem>[0] = {
      key: it.fullKey,
      name: spec.name,
      rare: spec.rare,
      value: spec.value,
      maxStack: spec.maxStack ?? 999,
    };
    if (spec.placeTile !== undefined) {
      const tk = resolveTileKey(it.modId, spec.placeTile);
      if (tk.startsWith('mod_')) {
        const stable = plan.allocation.tiles.get(tk);
        if (stable === undefined) throw new Error(`[mod-item] mod ${it.modId} 物品 ${spec.key} 放置 tile 未注册: ${tk}`);
        def.tile = tk;
      } else {
        def.tile = tk;                          // 原版 tile 键直传
      }
    }
    registerModItem(def, it.stableId);
    if (spec.func) registerModItemFunc(it.stableId, spec.func);
    if (spec.combat) registerModCombat(it.stableId, spec.combat);
    if (spec.stats) registerModStats(it.stableId, { def: spec.stats.def, s: spec.stats.s, acc: spec.stats.acc, van: spec.stats.van }, it.stableId);
    items++;
  }
  // recipes
  const recipeList = plan.recipes.map((r) => buildVanillaRecipe(plan, r.modId, r.spec));
  if (recipeList.length > 0) registerModRecipes(recipeList);
  recipes = recipeList.length;
  return { items, tiles, npcs, recipes };
}
