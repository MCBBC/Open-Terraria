// L2 脚本 mod 测试(2026-10-04):entry.js 装载→行为钩注册→钩子语义→存档头 mod
// 清单→缺失检测。独立文件=fresh module registry(loader/hooks 单例互不污染)。
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import { _resetModHooksForTests, takeModNpcAi, runModItemUse, runModPreUpdate, runModOnWorldLoad } from '../src/mods/hooks';
import { setEnabledModsProvider } from '../src/mods/bridge';
import { ModConfigState } from '../src/mods/config';
import type { ModStorage } from '../src/mods/store';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const ENTRY_JS = `
export default function main(sw) {
  const state = { ai: 0, use: 0, pre: 0, post: 0, worldLoad: 0, worldUnload: 0 };
  globalThis.__modL2State = state;
  sw.npcAi('demo_slime', (e, game, player) => {
    state.ai++;
    if (e && typeof e === 'object') e.vy = -0.5;   // 自定义跳跳 AI(替换 aiStyle 1 家族)
  });
  sw.itemUse('demo_sword', (ctx) => {
    state.use++;
    if (ctx.player) ctx.player.modTestUseFired = true;
    return true;   // 已消费:原版近战/挖掘链不进
  });
  sw.system({
    preUpdate: () => { state.pre++; },
    postEntities: () => { state.post++; },
    onWorldLoad: () => { state.worldLoad++; },
    onWorldUnload: () => { state.worldUnload++; },
  });
}
`;

function buildL2ModZip(): Uint8Array {
  const manifest = { id: 'demo', name: 'Demo Mod', version: '1.0.0', api: 1, side: 'both' };
  return zipSync({
    'mod.json': strToU8(JSON.stringify(manifest)),
    'content/items/demo_sword.json': strToU8(JSON.stringify({
      key: 'demo_sword', name: '示范剑', rare: 2, value: 2000, maxStack: 1,
      combat: { damage: 25, useTime: 22, useAnimation: 22, melee: true },
      func: { useStyle: 1 },
    })),
    'content/npcs/demo_slime.json': strToU8(JSON.stringify({
      key: 'demo_slime', name: '示范史莱姆', aiStyle: 1, lifeMax: 30, damage: 8, defense: 4,
    })),
    'scripts/main.js': strToU8(ENTRY_JS),
  });
}

class MemStorage implements ModStorage {
  reg = '[]';
  zips = new Map<string, Blob>();
  async getRegistry() { return this.reg; }
  async setRegistry(json: string) { this.reg = json; }
  async putZip(id: string, blob: Blob) { this.zips.set(id, blob); return true; }
  async getZip(id: string) { return this.zips.get(id) ?? null; }
  async deleteZip(id: string) { this.zips.delete(id); }
}

/** node 测试环境 entry 装载器(vite-node 拦截 blob:/data: 动态 import——
 *  把我们自己的 ESM default 入口转成 new Function 求值;生产走 blob URL 分支) */
const nodeEntryLoader = async (code: Uint8Array): Promise<unknown> => {
  const src = new TextDecoder().decode(code);
  const cjs = src.replace(/export\s+default\s+function\s+main/, 'function main');
  // eslint-disable-next-line no-new-func
  return new Function(`${cjs}; return main;`)();
};

beforeAll(async () => {
  _resetModLoaderForTests();
  _resetModHooksForTests();
  const { ModStore } = await import('../src/mods/store');
  const { readModPack } = await import('../src/mods/pack');
  const storage = new MemStorage();
  const store = new ModStore(storage);
  const bytes = buildL2ModZip();
  await store.install(readModPack(bytes).manifest, bytes);
  await store.setEnabled('demo', true);
  await loadModsPhase1(storage, { entryLoader: nodeEntryLoader });
});

describe('L2 entry.js 装载与钩子', () => {
  it('装载零错误且 entry 已执行(全局 state 落地)', () => {
    const r = getModLoadResult();
    expect(r!.errors).toEqual([]);
    const state = (globalThis as unknown as { __modL2State?: Record<string, number> }).__modL2State;
    expect(state).toBeDefined();
  });

  it('npcAi 钩:mod NPC 接管,原版域/未注册= null 短路', () => {
    const state = (globalThis as unknown as { __modL2State: Record<string, number> }).__modL2State;
    const fn = takeModNpcAi(800);
    expect(fn).not.toBeNull();
    const dummy = { vy: 0 };
    fn!(dummy as never, {} as never, null);
    expect(state.ai).toBe(1);
    expect(dummy.vy).toBe(-0.5);          // 自定义 AI 生效(替换 aiStyle 1)
    // 原版域+未注册+null → 零成本短路(Enemy 刀点中立性)
    expect(takeModNpcAi(1)).toBeNull();
    expect(takeModNpcAi(801)).toBeNull();
    expect(takeModNpcAi(null)).toBeNull();
  });

  it('itemUse 钩:mod vid 命中返回 true;原版 vid=false 不调', () => {
    const state = (globalThis as unknown as { __modL2State: Record<string, number> }).__modL2State;
    const stubGame = { player: {} as Record<string, unknown>, input: { mouseX: 5, mouseY: 6 } } as never;
    const modDef = { vid: 30000 } as never;
    const modItem = { id: 30000, stack: 1 } as never;
    expect(runModItemUse(stubGame, modDef, modItem, 10, 10)).toBe(true);
    expect(state.use).toBe(1);
    // 原版 vid:不查不调(中立性)
    const vanillaDef = { vid: 1 } as never;
    expect(runModItemUse(stubGame, vanillaDef, { id: 1, stack: 1 } as never, 10, 10)).toBe(false);
    expect(state.use).toBe(1);
  });

  it('system 钩:preUpdate/onWorldLoad 派发计数', () => {
    const state = (globalThis as unknown as { __modL2State: Record<string, number> }).__modL2State;
    runModPreUpdate({} as never, 1 / 60);
    runModPreUpdate({} as never, 1 / 60);
    runModOnWorldLoad({} as never);
    expect(state.pre).toBe(2);
    expect(state.worldLoad).toBe(1);
  });

  it('重复注册 fail-fast;未注册键 fail-fast', async () => {
    const { registerNpcAi } = await import('../src/mods/hooks');
    expect(() => registerNpcAi(800, () => {})).toThrow(/重复/);
    const { createModContext } = await import('../src/mods/api');
    const alloc = { items: new Map(), npcs: new Map(), tiles: new Map(), projs: new Map(), buffs: new Map(), rarities: new Map(), gores: new Map(), walls: new Map(), mounts: new Map(), hairs: new Map() };
    const sw = createModContext('demo', alloc, new ModConfigState('demo', {}, null));
    expect(() => sw.npcAi('ghost', () => {})).toThrow(/未注册/);
  });
});

describe('存档头 mod 清单(P1)', () => {
  it('saveGame 落 mods 键(name/version/计数);loadSave 读回', () => {
    const world = new World(64, 32, 42, '测试');
    const player = new Player(100, 100, new Inventory());
    const json = saveGame(world, player, 0);
    expect(json).toContain('"mods":');
    expect(json).toContain('"id":"demo"');
    expect(json).toContain('"items":1');
    const back = loadSave(json);
    const mods = back.data?.mods;
    expect(mods?.[0]?.id).toBe('demo');
    expect(mods?.[0]?.version).toBe('1.0.0');
  });

  it('缺失检测:启用集不含存档 mod → console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const world = new World(64, 32, 42, '测试');
    const player = new Player(100, 100, new Inventory());
    const json = saveGame(world, player, 0);
    // 模拟"mod 已卸载"状态:启用集清空
    setEnabledModsProvider(() => []);
    try {
      loadSave(json);
      const hit = spy.mock.calls.find((c) => String(c[0]).includes('存档依赖缺失'));
      expect(hit).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });
});
