// L2 mod 入口 API 门面(2026-10-04 P1/P2/P4)。entry.js 形状(刻意贴 tML 概念,知识可迁移):
//
//   export default function main(sw) {
//     sw.npcAi('demo_slime', (e, game, player) => { /* 接管 AI;不注册=走 aiStyle 家族 */ });
//     sw.itemUse('demo_sword', (ctx) => { ctx.applyBuff('my_buff', 120); return true; });
//     sw.projectileHook('demo_bolt', { update(p, game) {}, onHit(p, enemy, game) {} });
//     sw.buff('my_buff', { name: '神力', texture: 'textures/buff/might.png',
//       onTick(player) { /* 自管效果 */ } });
//     sw.system({ preUpdate(g,dt){}, postEntities(g,dt){}, postUpdate(g){},
//                 onWorldLoad(g){}, onWorldUnload(g){} });
//     sw.config.get('power'); sw.config.set('power', 2);
//     sw.log('ready');
//   }
//  ★弹幕内容走 content/projectiles/*.json 声明面(plan 期确定性分配 projId);
//    sw.projectileHook 只挂代码钩(P4 红蓝修正 C-MINOR-7:头注曾误载不存在的 sw.projectile)
//
// 内容(物品/NPC/tile 数据)一律走 content/*.json 声明面(L1 单管线=确定性 id);
// entry.js 只挂行为/弹幕/配置。键解析经分配表,未注册键 fail-fast。
import type { ModIdAllocation } from './types';
import {
  registerNpcAi, registerModOnHitNpc, registerModNpcDeath, registerItemUse, registerSystem, registerProjHooks, playModSound,
  registerModModifyHurtByNpc, registerModModifyHitNpc, registerModChestUnlock, registerModConversion, registerModNpcSpawnStats, registerVanillaNpcAi,
  registerModSpawnPool, registerMenuTheme,
  type ModSystemHooks, type ModUseCtx,
} from './hooks';
import { registerModBuff, modBuffTypeOf, type ModBuffSpec } from './buffs';
import { registerGenPass } from '../world/gen/WorldGen';
import { registerModRecipeGroupItems } from '../data/vanillaRecipes';
import { registerModBiomeFlag } from '../world/SceneMetrics';   // ★一百二十刀
import { rollNaturalPrefixForVid } from '../data/vanillaPrefixes';   // ★一百二十二刀
import { isPrefixableAccessory } from '../items/Inventory';
import type { ModConfigState } from './config';

export interface ModContext {
  readonly id: string;
  /** 接管本 mod NPC 的自定义 AI(每 fixedUpdate 调,共享尾段[接触伤害/击退/掉落]照走) */
  npcAi(key: string, fn: (e: unknown, game: unknown, player: unknown) => void): void;
  /** 接管本 mod 物品的左键使用;返回 true=已消费(useTime 节奏自管) */
  itemUse(key: string, fn: (ctx: ModUseCtx) => boolean): void;
  /** B6:本 mod 物品近战命中敌怪钩(受理命中后;ModItem.OnHitNPC 形) */
  onHitNpc(key: string, fn: (e: unknown, game: unknown, ctx: { damage: number; crit: boolean; killed: boolean }) => void): void;
  /** B6:本 mod NPC 死亡钩(击杀单口;Hive Tumor→Boss 遭遇链面) */
  onNpcDeath(key: string, fn: (e: unknown, game: unknown) => void): void;
  /** ★二百八十七刀:mod 刷怪池独占面(pool.Clear 语义;返回规则表=本拍顶替
   *  原版选怪池,只掷返回规则;null=不接管;酸雨事件消费) */
  spawnPool(fn: (ctx: { game: unknown; player: unknown }) => Array<Record<string, unknown>> | null): void;
  /** ★三百零一:mod 配方组注册(RecipeGroup.RegisterGroup 同构;假 id=1010000+ 注册序
   *  ——提取器 recipe-groups.json 按名称排序同序;items=vid∪mod item 键) */
  recipeGroups(defs: Array<{ name: string; items: Array<number | string> }>): void;
  /** ★三百十五:菜单主题面(logo/background=pack 相对路径→SW mod 缓存 URL;
   *  TitleMenu logo 换图/MenuBackground 整幅替换+Cinders 粒子消费) */
  menuTheme(spec: { logo?: string; background?: string; cinderTex?: string }): void;
  /** B6:播原版 SoundID 键音效(位置可选;mod 音频装载=余段) */
  playSound(files: string[], volume?: number, x?: number, y?: number): void;
  /** 给声明弹幕(content/projectiles/*.json)追加代码钩(update/onHit 族;
   *  未注册键 fail-fast) */
  projectileHook(key: string, hooks: {
    update?: (p: unknown, game: unknown) => void;
    onHit?: (p: unknown, enemy: unknown, game: unknown) => boolean | void;
    onHitPlayer?: (p: unknown, game: unknown) => boolean | void;
    onTileHit?: (p: unknown, game: unknown) => boolean | void;
  }): void;
  /** 注册 mod buff(本地玩家;onTick 逐 tick;图标/名称/buff 栏全链) */
  buff(key: string, spec: ModBuffSpec): void;
  /** 系统/世界生命周期钩子(全可选) */
  system(hooks: ModSystemHooks): void;
  /** 声明式配置读写(mod.json config 表声明的键;set 即持久化) */
  config: {
    get(key: string): boolean | number | string;
    set(key: string, value: boolean | number | string): void;
  };
  /** mod 弹幕分配 id(GLM娘 rivals 批新增:entry.js 无 import 面,AI 态机拿数字 id
   *  计数/自造用;fail-fast) */
  projIdOf(key: string): number;
  /** mod NPC 分配 id(同上) */
  npcIdOf(key: string): number;
  /** ★CalPlayer 基建(六十三刀):玩家侧钩;kind='modifyHurtByNpc'=承伤修正链
   *  (fn(ctx: {player, game, attackerVid, dmg, contact}) → number=修正后伤/
   *  undefined=不改;仅 mod NPC 进攻面进入) */
  /** playerHook 双 kind:modifyHurtByNpc=承伤修正链 / modifyHitNpc=命中伤害增幅链 */
  playerHook(kind: 'modifyHurtByNpc' | 'modifyHitNpc', fn: (ctx: Record<string, unknown>) => number | void): void;
  /** ★一百零八R2:世界生成 pass 注册(Beaches 后依序执行;引擎零 mod 知识) */
  registerGenPass(name: string, fn: (store: unknown, rng: unknown, gs: unknown) => void): void;
  /** ★一百一十六刀:mod 功能箱解锁条件(chest.locked 消费面;fn(world)=true 可开) */
  chestUnlockCondition(key: string, fn: (world: unknown) => boolean): void;
  /** ★一百一十七刀:mod 群系蔓延注册(tML ModBiomeConversion 形;spreads=mod tile
   *  键数组,tileMap=vanilla sheet→mod tile 键;引擎 WorldEvolution 蔓延扫描消费) */
  biomeConversion(spec: { spreads: string[]; tileMap: Record<number, string> }): void;
  /** ★一百二十刀:mod 群系旗注册(AbyssLayer 复合面;depth=(y−rock)/h 带,
   *  xDist=边缘带绝对距;tiles=mod tile 键) */
  biomeFlag(flag: string, spec: { tiles: string[]; threshold?: number; depth?: { min: number; max: number }; xDist?: number }): void;
  /** ★一百三十七刀:NPC 出生 stats 修正钩(复仇/死亡 HP 乘表消费) */
  npcSpawnStats(fn: (vanillaId: number, stats: { lifeMaxScale: number }) => void): void;
  /** ★一百三十九刀:vanilla 敌怪 AI 覆盖(ids=原版 id 集;整支接管,共享尾段照走) */
  vanillaNpcAi(ids: number[], fn: (e: unknown, game: unknown, player: unknown) => void): void;
  /** ★两百一十七刀:mod 侧物品掉落生成(ItemDrop 直构;entities.add drops 桶) */
  spawnItem(game: unknown, itemId: number, x: number, y: number, stack?: number): void;
  /** ★一百二十二刀:随机词缀掷(Item.Prefix(-1) 1:1 通道;vid=任意内部物品 id;
   *  返回词缀 id(0=无)——mod loot/掉落面消费) */
  rollPrefixFor(vid: number): number;
  /** 生成 mod 弹幕(npcAi 闭包内持 game,回传本面构造 ModProj 并入桶——L2 唯一
   *  弹幕生成通道;ownerIsPlayer=false=mod NPC 弹打玩家) */
  spawnProj(game: unknown, key: string, x: number, y: number, vx: number, vy: number,
    damage: number, knockback?: number, ownerIsPlayer?: boolean): void;
  /** 生成 mod NPC(rivals 批新增:多段体节/护卫体由主 AI 按需派生;入 enemies 桶) */
  spawnNpc(game: unknown, key: string, x: number, y: number): void;
  log(...args: unknown[]): void;
}

/** 测试/装载器注入的入口模块形(动态 import 的 default export) */
export type ModEntry = (sw: ModContext) => void;

export function createModContext(
  modId: string,
  alloc: ModIdAllocation,
  config: ModConfigState,
  opts?: {
    /** itemUse 上下文增强(applyBuff 等;装载器注入 buff 解析) */
    decorateUseCtx?: (ctx: ModUseCtx) => ModUseCtx;
  },
): ModContext {
  const idOf = (kind: 'items' | 'npcs' | 'tiles', key: string): number => {
    const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
    const id = alloc[kind].get(full);
    if (id === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册 ${kind} 键: ${key}`);
    return id;
  };
  return {
    id: modId,
    npcAi(key, fn) { registerNpcAi(idOf('npcs', key), fn as Parameters<typeof registerNpcAi>[1]); },
    onHitNpc(key: string, fn: (e: unknown, game: unknown, ctx: { damage: number; crit: boolean; killed: boolean }) => void) {
      registerModOnHitNpc(idOf('items', key), fn as Parameters<typeof registerModOnHitNpc>[1]);
    },
    onNpcDeath(key: string, fn: (e: unknown, game: unknown) => void) {
      registerModNpcDeath(idOf('npcs', key), fn as Parameters<typeof registerModNpcDeath>[1]);
    },
    spawnPool(fn: (ctx: { game: unknown; player: unknown }) => Array<Record<string, unknown>> | null) {
      registerModSpawnPool(modId, fn as unknown as Parameters<typeof registerModSpawnPool>[1]);
    },
    recipeGroups(defs: Array<{ name: string; items: Array<number | string> }>) {
      for (const d of defs) {
        const ids = d.items.map((r) => (typeof r === 'number' ? r : idOf('items', r)));
        registerModRecipeGroupItems(ids);
      }
    },
    menuTheme(spec: { logo?: string; background?: string; cinderTex?: string }) {
      const url = (p?: string) => (p ? `sprites/mods/${modId}/${p}` : undefined);
      registerMenuTheme(modId, { logo: url(spec.logo), background: url(spec.background), cinderTex: url(spec.cinderTex) });
    },
    playSound(files: string[], volume = 1, x?: number, y?: number) {
      playModSound(files, volume, x, y);
    },
    itemUse(key, fn) {
      const vid = idOf('items', key);
      registerItemUse(vid, (ctx) => fn(opts?.decorateUseCtx ? opts.decorateUseCtx(ctx) : ctx));
    },
    projectileHook(key, hooks) {
      const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
      const id = alloc.projs.get(full);
      if (id === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册弹幕: ${key}`);
      registerProjHooks(id, hooks as Parameters<typeof registerProjHooks>[1]);
    },
    buff(key, spec) { registerModBuff(modId, key, spec); },
    system(hooks) { registerSystem(hooks); },
    projIdOf(key) { return idOf('projs' as 'items', key); },
    npcIdOf(key) { return idOf('npcs', key); },
    // ★CalPlayer 基建(六十三刀):玩家承伤修正链(mod NPC 进攻面;ModifyHitByNPC 形)
    playerHook(kind: string, fn: (ctx: Record<string, unknown>) => number | void) {
      if (kind === 'modifyHurtByNpc') {
        registerModModifyHurtByNpc(modId, fn as Parameters<typeof registerModModifyHurtByNpc>[1]);
      } else if (kind === 'modifyHitNpc') {
        registerModModifyHitNpc(modId, fn as Parameters<typeof registerModModifyHitNpc>[1]);
      } else throw new Error(`[mod-api] 未知 playerHook: ${kind}`);
    },
    /** ★B7 一百零八R2:世界生成 pass 注册(Beaches 后依序执行;引擎零 mod 知识) */
    registerGenPass(name: string, fn: (store: unknown, rng: unknown, gs: unknown) => void): void {
      registerGenPass({ name, fn });
    },
    // ★一百一十六刀:mod 箱解锁条件(tiles 域 id 解析)
    chestUnlockCondition(key: string, fn: (world: unknown) => boolean): void {
      registerModChestUnlock(idOf('tiles', key), fn);
    },
    // ★一百一十七刀:mod 群系蔓延(键→内部 id 解析;tileMap 键=vanilla sheet)
    biomeConversion(spec: { spreads: string[]; tileMap: Record<number, string> }): void {
      const tid = (k: string) => {
        const full = k.startsWith('mod_') ? k : `mod_${modId}_${k}`;
        const v = alloc.tiles.get(full);
        if (v === undefined) throw new Error(`[mod-api] biomeConversion 引用未注册 tile: ${k}`);
        return v;
      };
      const map: Record<number, number> = {};
      for (const [sheet, key] of Object.entries(spec.tileMap)) map[Number(sheet)] = tid(key);
      registerModConversion({ spreads: new Set(spec.spreads.map(tid)), tileMap: map });
    },    // ★一百二十二刀:随机词缀掷(rollNaturalPrefixForVid 1:1 通道直通)
    rollPrefixFor(vid: number): number {
      return rollNaturalPrefixForVid(vid, isPrefixableAccessory(vid), () => Math.random());
    },
    // ★一百二十刀:mod 群系旗(AbyssLayer 复合面;键→内部 id)
    biomeFlag(flag: string, spec: { tiles: string[]; threshold?: number; depth?: { min: number; max: number }; xDist?: number }): void {
      const tidF = (k: string) => {
        const full = k.startsWith('mod_') ? k : `mod_${modId}_${k}`;
        const v = alloc.tiles.get(full);
        if (v === undefined) throw new Error(`[mod-api] biomeFlag 引用未注册 tile: ${k}`);
        return v;
      };
      registerModBiomeFlag({
        flag,
        tileIds: spec.tiles.map(tidF),
        threshold: spec.threshold ?? 40,
        ...(spec.depth ? { depth: spec.depth } : {}),
        ...(spec.xDist !== undefined ? { xDist: spec.xDist } : {}),
      });
    },
    // ★一百三十七刀:NPC 出生 stats 修正(复仇/死亡 HP 乘表消费)
    npcSpawnStats(fn: (vanillaId: number, stats: { lifeMaxScale: number }) => void): void {
      registerModNpcSpawnStats(modId, fn);
    },
    // ★一百三十九刀:vanilla AI 覆盖(ids 集批量注册)
    vanillaNpcAi(ids: number[], fn: (e: unknown, game: unknown, player: unknown) => void): void {
      for (const id of ids) registerVanillaNpcAi(id, fn as Parameters<typeof registerVanillaNpcAi>[1]);
    },
    // ★两百一十七刀:mod 侧物品掉落生成
    spawnItem(game: unknown, itemId: number, x: number, y: number, stack = 1): void {
      void import('../entities/ItemDrop').then(({ ItemDrop }) => {
        const g = game as { entities: { add(e: unknown, bucket: string): void } };
        g.entities.add(new ItemDrop(x, y, itemId, stack), 'drops');
      });
    },
    // ★异步构造:动态 import ModProj(与 loader 的 entry 动态装载同型);AI 每 tick
    //  调用高频路径,import 缓存后 microtask 内落桶,同 tick 内稍后帧可见=可接受
    spawnProj(game, key, x, y, vx, vy, damage, knockback = 2, ownerIsPlayer = false) {
      const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
      const pid = alloc.projs.get(full);
      if (pid === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册弹幕: ${key}`);
      const g = game as { entities: { add(e: unknown, bucket: string): void } };
      void import('../entities/ModProj').then(({ ModProj }) => {
        g.entities.add(new ModProj(x, y, vx, vy, damage, knockback, pid, ownerIsPlayer), 'projectiles');
      });
    },
    // ★多段体节通道(rivals 批):key→分配 id→**Enemy.fromVanilla**(占位 ctor 不自载
    //   def——'v_*' key 只是占位,必须 fromVanilla 覆写;与 debugSpawnNpc 同链);
    //   主 AI 侧用唯一性旗防重复派生
    spawnNpc(game, key, x, y) {
      const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
      const nid = alloc.npcs.get(full);
      if (nid === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册 NPC: ${key}`);
      const g = game as { entities: { add(e: unknown, bucket: string): void } };
      void import('../entities/Enemy').then(({ Enemy }) => {
        g.entities.add(Enemy.fromVanilla(nid, x, y), 'enemies');
      });
    },
    config: {
      get: (key) => config.get(key),
      set: (key, value) => config.set(key, value),
    },
    log(...args) { console.log(`[mod:${modId}]`, ...args); },
  };
}
