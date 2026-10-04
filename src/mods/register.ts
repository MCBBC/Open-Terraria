// 注册桥(2026-10-04):RegistrationPlan → 各数据模块注册 API。
// 域翻译在这里集中:mod 内容键 → 全键/stable id/tile 键/掉落 Rule。
// 全部走各数据模块的 registerMod* 追加面(零改原版面;零 mod 时整文件无副作用)。
import type { RegistrationPlan } from './types';
import { registerModItem, ITEM_DEFS } from '../data/items';
import { registerModTile, TILE_BY_KEY, type TileDef } from '../data/tiles';
import { registerModNpc, registerModTownNpc, type VanillaNpc } from '../data/vanillaNpcs';
import { appendModSummonEntries, type SummonEntry } from '../core/DebugSummonPanel';
import { registerModRecipes, type VanillaRecipe } from '../data/vanillaRecipes';
import { registerModItemFunc } from '../data/vanillaItemFunc';
import { registerModCombat } from '../data/vanillaItemCombat';
import { registerModStats } from '../data/vanillaItemStats';
import { registerModNpcRules } from '../drops/NpcDrops';
import { registerModProj } from './hooks';
import { registerModShopStock } from './shops';
import { registerModResearch } from '../stats/Research';

export interface RegistrationApplied {
  items: number; tiles: number; npcs: number; recipes: number; projs: number;
}

/** combat.shoot 域换算(P2):数字=原版 vid 直传;字符串 `proj:<key>`/mod 键 →
 *  分配表 allocated projId(ModProj 分流门=projId≥2000 段) */
function resolveShoot(plan: RegistrationPlan, modId: string, raw: number | string): number | string | undefined {
  if (typeof raw === 'number') return raw;
  const full = raw.startsWith('mod_') ? raw
    : raw.startsWith('proj:') ? `mod_${modId}_${raw.slice(5)}`
      : `mod_${modId}_${raw}`;
  const id = plan.allocation.projs.get(full);
  if (id === undefined) throw new Error(`[mod-register] mod ${modId} 引用未注册弹幕: ${raw}`);
  return id;
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

/** mod 简单掉落表 → 原版 Rule 形(chance→denom 取整;noLuck=确定性掷)。
 *  ★P4 红蓝修正：chance≤0/非有限 → 跳过该条(旧实现 1/0=Infinity→int 恒 0→必掉,
 *  0% 变 100%) */
function buildDropRules(plan: RegistrationPlan, modId: string, spec: RegistrationPlan['npcSpecs'][number]['spec']): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const d of spec.drops ?? []) {
    const chance = d.chance ?? 1;
    if (!(chance > 0) || !Number.isFinite(chance)) continue;   // 0%/坏值=不掉(声明语义)
    const full = d.item.startsWith('mod_') ? d.item : `mod_${modId}_${d.item}`;
    const id = plan.allocation.items.get(full);
    if (id === undefined) throw new Error(`[mod-drops] mod ${modId} NPC ${spec.key} 掉落引用未注册物品: ${d.item}`);
    out.push({
      k: 'common', item: id, min: d.min ?? 1, max: d.max ?? 1,
      num: 1, denom: Math.max(1, Math.round(1 / Math.min(1, chance))), noLuck: true,
    });
  }
  return out;
}

/**
 * 按计划注册全部 mod 内容。任一条目 fail-fast 抛错(loader 捕获后整 mod 报错,
 * 已注册部分保留——id 分配器保证重试时同 plan 同 id,不产生漂移)。
 */
export function applyRegistrationPlan(plan: RegistrationPlan): RegistrationApplied {
  let items = 0, tiles = 0, npcs = 0, recipes = 0, projs = 0;
  // projectiles(P2):数据 spec → ModProj 注册簿(代码钩由 entry 的 sw.projectileHook 追加)
  for (const pr of plan.projSpecs) {
    const s = pr.spec;
    registerModProj(pr.projId, pr.modId, {
      texture: s.texture,
      gravity: s.gravity,
      lifetime: s.lifetime,
      pierce: s.pierce,
      tileCollide: s.tileCollide,
      width: s.width,
      height: s.height,
      rotateToVelocity: s.rotateToVelocity,
    });
    projs++;
  }
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
  const modSummonAccum: SummonEntry[] = [];   // F6 面板条目暂存(循环尾一次性追加)
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
    // ★mod 城镇NPC实体化补链(2026-10-04 GLM娘实验批):townNPC 声明 → 运行时挂
    //   TOWN_NPC_IDS/extra/头贴索引三链(TownNPC ctor/入驻链/住房UI 全按此解析)。
    //   extra 缺省 = max(2, frames−16)(人形族 14 帧行走区惯例;GLM娘 26→10)
    if (spec.townNPC) {
      const extra = spec.extraFrames ?? Math.max(2, (spec.frames ?? 2) - 16);
      registerModTownNpc(n.fullKey, n.npcId, extra, n.modId, spec.arrival);
    }
    modSummonAccum.push({
      id: n.npcId, name: spec.name,
      boss: false, critter: !!spec.critter, town: !!spec.townNPC,
      lifeMax: spec.lifeMax,
    });
    const dropRules = buildDropRules(plan, n.modId, spec);
    if (dropRules.length > 0) registerModNpcRules(n.npcId, dropRules);
    npcs++;
  }
  // F6 召唤面板追加面(mod 条目;零 mod 时 SUMMON_ENTRIES 零扰动)
  if (modSummonAccum.length > 0) appendModSummonEntries(modSummonAccum);
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
    if (spec.research !== undefined) registerModResearch(it.stableId, spec.research);
    if (spec.func) registerModItemFunc(it.stableId, spec.func);
    if (spec.combat) {
      const combat = { ...spec.combat };
      if (combat.shoot !== undefined) {
        combat.shoot = resolveShoot(plan, it.modId, combat.shoot);
      }
      registerModCombat(it.stableId, combat as unknown as Parameters<typeof registerModCombat>[1]);
    }
    if (spec.stats) registerModStats(it.stableId, { def: spec.stats.def, s: spec.stats.s, acc: spec.stats.acc, van: spec.stats.van }, it.stableId);
    items++;
  }
  // shops(P3):物品 id 解析(本 mod 键/原版 vid);price 缺省=物品 value(原版
  // price:null→value 同相;无 value=500 兜底)
  for (const sh of plan.shops) {
    const entries: Array<[number, number]> = [];
    for (const it of sh.spec.items) {
      const id = itemRefOf(plan, sh.modId, it.item);
      const defValue = ITEM_DEFS[id]?.value;
      entries.push([id, it.price ?? (typeof defValue === 'number' ? defValue : 500)]);
    }
    registerModShopStock(sh.spec.npcId, entries);
  }
  // recipes
  const recipeList = plan.recipes.map((r) => buildVanillaRecipe(plan, r.modId, r.spec));
  if (recipeList.length > 0) registerModRecipes(recipeList);
  recipes = recipeList.length;
  return { items, tiles, npcs, recipes, projs };
}

/** 商店条目物品解析:数字=原版 vid 直传;字符串=mod 物品键 → stable id */
function itemRefOf(plan: RegistrationPlan, modId: string, raw: string | number): number {
  if (typeof raw === 'number') return raw;
  const full = raw.startsWith('mod_') ? raw : `mod_${modId}_${raw}`;
  const id = plan.allocation.items.get(full);
  if (id === undefined) throw new Error(`[mod-shop] mod ${modId} 引用未注册物品: ${raw}`);
  return id;
}
