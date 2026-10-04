// L2 mod 入口 API 门面(2026-10-04 P1/P2)。entry.js 形状(刻意贴 tML 概念,知识可迁移):
//
//   export default function main(sw) {
//     sw.npcAi('demo_slime', (e, game, player) => { /* 接管 AI;不注册=走 aiStyle 家族 */ });
//     sw.itemUse('demo_sword', (ctx) => { ctx.applyBuff('my_buff', 120); return true; });
//     sw.projectile('demo_bolt', { texture: 'textures/proj/bolt.png', gravity: 0.1,
//       pierce: 3, rotateToVelocity: true });
//     sw.buff('my_buff', { name: '神力', texture: 'textures/buff/might.png',
//       onTick(player) { /* 自管效果 */ } });
//     sw.system({ preUpdate(g,dt){}, postEntities(g,dt){}, postUpdate(g){},
//                 onWorldLoad(g){}, onWorldUnload(g){} });
//     sw.config.get('power'); sw.config.set('power', 2);
//     sw.log('ready');
//   }
//
// 内容(物品/NPC/tile 数据)一律走 content/*.json 声明面(L1 单管线=确定性 id);
// entry.js 只挂行为/弹幕/配置。键解析经分配表,未注册键 fail-fast。
import type { ModIdAllocation } from './types';
import {
  registerNpcAi, registerItemUse, registerSystem, registerProjHooks,
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
    config: {
      get: (key) => config.get(key),
      set: (key, value) => config.set(key, value),
    },
    log(...args) { console.log(`[mod:${modId}]`, ...args); },
  };
}
