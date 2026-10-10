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
  registerNpcAi, registerModOnHitNpc, registerModNpcDeath, registerModOnHitAny, registerItemUse, registerSystem, registerProjHooks, playModSound,
  registerModModifyHurtByNpc, registerModModifyHitNpc, registerModChestUnlock, registerModConversion, registerModNpcSpawnStats, registerVanillaNpcAi,
  registerModSpawnPool, registerMenuTheme, registerModBiomeMusic, requestModFrameMusic, registerModCanUse, registerModAccEffect, registerModHoldItem,
  type ModSystemHooks, type ModUseCtx,
} from './hooks';
import { registerModBuff, modBuffTypeOf, type ModBuffSpec } from './buffs';
import { registerModMusic, registerModBossMusic, modMusicIdOfFull } from './music';   // ★BGM 面
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
  /** ★四百七十刀:通用命中钩(C# CalamityPlayerOnHit.ItemOnHit/ProjOnHit 形;
   *  任何玩家来源伤害受理后调一次——ctx={e,game,damage,crit,killed,projId,melee};
   *  免疫帧拒收/dontTakeDamage 不进=原版 OnHitNPC 同相) */
  onHitAny(fn: (ctx: Record<string, unknown>) => void): void;
  /** ★二百八十七刀:mod 刷怪池独占面(pool.Clear 语义;返回规则表=本拍顶替
   *  原版选怪池,只掷返回规则;null=不接管;酸雨事件消费) */
  spawnPool(fn: (ctx: { game: unknown; player: unknown }) => Array<Record<string, unknown>> | null): void;
  /** ★三百零一:mod 配方组注册(RecipeGroup.RegisterGroup 同构;假 id=1010000+ 注册序
   *  ——提取器 recipe-groups.json 按名称排序同序;items=vid∪mod item 键) */
  recipeGroups(defs: Array<{ name: string; items: Array<number | string> }>): void;
  /** ★三百十五:菜单主题面(logo/background=pack 相对路径→SW mod 缓存 URL;
   *  TitleMenu logo 换图/MenuBackground 整幅替换+Cinders 粒子消费) */
  menuTheme(spec: { logo?: string; background?: string; cinderTex?: string; music?: string }): void;
  /** ★BGM 面:注册曲目(pack 相对路径;返回槽位 id 5000+;bossMusic/menuTheme.music
   *  引用面用键即可) */
  music(key: string, file: string): number;
  /** ★BGM 面:Boss 换曲绑定(npc=本 mod npc 键或原版 id;music=sw.music 键/槽位
   *  id/原版 MusicID——活动期事件曲覆盖) */
  bossMusic(npc: number | string, music: string | number): void;
  /** ★三百二十一刀:群系曲绑定(flag=sw.biomeFlag 注册的旗名;music=sw.music 键/
   *  槽位 id/原版 MusicID 兜底;priority=环境/biomeHigh/bossMedium——2019
   *  CalamityMod.UpdateMusic 三档同构) */
  biomeMusic(flag: string, music: string | number,
    opts?: { priority?: 'environment' | 'biomeHigh' | 'bossMedium' }): void;
  /** ★三百二十二刀:AI 期音乐直写(每帧调=本帧覆写压一切;2019 Main.music 裸写
   *  黑魔法同位;逐相换曲消费面) */
  setMusic(id: number): void;
  /** mod 曲键→槽位 id(fail-loud;AI 钩内解析用) */
  musicIdOf(key: string): number;
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
  /** ★三百三十三刀:使用条件门(fn 返回 false=本拍禁用;C# CanUseItem 同位) */
  canUse(key: string, fn: (ctx: unknown) => boolean): void;
  /** ★三百三十五刀:配饰效果钩(装备期每 tick 调;C# UpdateAccessory 同位;
   *  fn(player, game)) */
  accEffect(key: string, fn: (player: unknown, game: unknown) => void): void;
  /** ★三百三十九刀:手持效果钩(手持该物品每 tick 调;C# HoldItem 同位) */
  holdItem(key: string, fn: (player: unknown, game: unknown) => void): void;
  /** ★三百四十四刀:给玩家施加本 mod buff(npcAi/holdItem 闭包内用;
   *  key=sw.buff 注册键;秒数,每帧重调=max 合并即持续) */
  playerBuff(key: string, seconds: number, player: unknown): void;
  /** ★三百六十四刀:mod buff 免疫(装备期每帧调=immuneMod 每帧 add;
   *  key=sw.buff 注册键) */
  playerImmune(key: string, player: unknown): void;
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
    onHitAny(fn: (ctx: Record<string, unknown>) => void) {
      registerModOnHitAny(modId, fn as unknown as Parameters<typeof registerModOnHitAny>[1]);
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
    menuTheme(spec: { logo?: string; background?: string; cinderTex?: string; music?: string }) {
      const url = (p?: string) => (p ? `sprites/mods/${modId}/${p}` : undefined);
      // music=mod 曲键 → 全键归一(须先经 sw.music 注册;未注册 fail-loud)
      const musFull = spec.music
        ? (spec.music.startsWith('mod_') ? spec.music : `mod_${modId}_${spec.music}`)
        : undefined;
      if (musFull && modMusicIdOfFull(musFull) == null) {
        throw new Error(`[mod-api] menuTheme.music 引用未注册曲目: ${spec.music}`);
      }
      registerMenuTheme(modId, {
        logo: url(spec.logo), background: url(spec.background), cinderTex: url(spec.cinderTex),
        ...(musFull ? { music: musFull } : {}),
      });
    },
    music(key: string, file: string): number {
      return registerModMusic(modId, key, file);
    },
    bossMusic(npc: number | string, music: string | number): void {
      registerModBossMusic(modId, npc, music);
    },
    biomeMusic(flag: string, music: string | number, opts?: { priority?: 'environment' | 'biomeHigh' | 'bossMedium' }): void {
      // music 解析:数字=MusicID 原样(原版曲兜底支,2019 else 支同构);字符串=sw.music 键(fail-loud)
      let musicId: number;
      if (typeof music === 'number') musicId = music;
      else {
        const full = music.startsWith('mod_') ? music : `mod_${modId}_${music}`;
        const v = modMusicIdOfFull(full);
        if (v == null) throw new Error(`[mod-api] biomeMusic 引用未注册曲目: ${music}`);
        musicId = v;
      }
      registerModBiomeMusic(modId, { flag, musicId, priority: opts?.priority ?? 'biomeHigh' });
    },
    setMusic(id: number): void {
      requestModFrameMusic(id);
    },
    musicIdOf(key: string): number {
      const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
      const v = modMusicIdOfFull(full);
      if (v == null) throw new Error(`[mod-api] musicIdOf 引用未注册曲目: ${key}`);
      return v;
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
    canUse(key, fn) {
      registerModCanUse(idOf('items', key), fn as Parameters<typeof registerModCanUse>[1]);
    },
    accEffect(key, fn) {
      registerModAccEffect(idOf('items', key), fn as Parameters<typeof registerModAccEffect>[1]);
    },
    holdItem(key, fn) {
      registerModHoldItem(idOf('items', key), fn as Parameters<typeof registerModHoldItem>[1]);
    },
    playerBuff(key, seconds, player) {
      (player as { buffs: { apply(t: number, s: number): void } }).buffs.apply(
        modBuffTypeOf(modId, key), seconds);
    },
    playerImmune(key, player) {
      const bt = modBuffTypeOf(modId, key);
      const im = (player as { buffs?: { immuneMod?: Set<number> } }).buffs?.immuneMod;
      if (im) im.add(bt);
    },
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
