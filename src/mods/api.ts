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
  registerModModifyHurtByNpc, registerModModifyHitNpc,
  type ModSystemHooks, type ModUseCtx,
} from './hooks';
import { registerModBuff, modBuffTypeOf, type ModBuffSpec } from './buffs';
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
