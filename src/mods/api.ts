// L2 mod 入口 API 门面(2026-10-04)。entry.js 形状(刻意贴 tML 概念,知识可迁移):
//
//   export default function main(sw) {
//     sw.npcAi('demo_slime', (e, game, player) => { /* 接管 AI;不注册=走 aiStyle 家族 */ });
//     sw.itemUse('demo_sword', (ctx) => { ...; return true; });   // true=已消费
//     sw.system({ preUpdate(g,dt){}, postEntities(g,dt){}, postUpdate(g){},
//                 onWorldLoad(g){}, onWorldUnload(g){} });
//     sw.log('ready');
//   }
//
// 内容(物品/NPC/tile 数据)一律走 content/*.json 声明面(L1 单管线=确定性 id);
// entry.js 只挂行为。键解析经分配表(全键 mod_<id>_<key>),未注册键 fail-fast。
import type { ModIdAllocation } from './types';
import {
  registerNpcAi, registerItemUse, registerSystem, type ModSystemHooks, type ModUseCtx,
} from './hooks';

export interface ModContext {
  readonly id: string;
  /** 接管本 mod NPC 的自定义 AI(每 fixedUpdate 调,共享尾段[接触伤害/击退/掉落]照走) */
  npcAi(key: string, fn: (e: unknown, game: unknown, player: unknown) => void): void;
  /** 接管本 mod 物品的左键使用;返回 true=已消费(useTime 节奏自管) */
  itemUse(key: string, fn: (ctx: ModUseCtx) => boolean): void;
  /** 系统/世界生命周期钩子(全可选) */
  system(hooks: ModSystemHooks): void;
  log(...args: unknown[]): void;
}

/** 测试/装载器注入的入口模块形(动态 import 的 default export) */
export type ModEntry = (sw: ModContext) => void;

export function createModContext(modId: string, alloc: ModIdAllocation): ModContext {
  const idOf = (kind: 'items' | 'npcs' | 'tiles', key: string): number => {
    const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
    const id = alloc[kind].get(full);
    if (id === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册 ${kind} 键: ${key}`);
    return id;
  };
  return {
    id: modId,
    npcAi(key, fn) { registerNpcAi(idOf('npcs', key), fn as Parameters<typeof registerNpcAi>[1]); },
    itemUse(key, fn) { registerItemUse(idOf('items', key), fn); },
    system(hooks) { registerSystem(hooks); },
    log(...args) { console.log(`[mod:${modId}]`, ...args); },
  };
}
