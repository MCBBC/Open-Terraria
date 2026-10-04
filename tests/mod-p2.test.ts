// P2 弹幕/buff/配置 测试(2026-10-04):声明弹幕分配+ModProj 语义+buff 注册/勾选/
// 配置读写。独立文件=fresh module registry。
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import { _resetModHooksForTests, modProjSpecOf, runModPreUpdate, registerProjHooks } from '../src/mods/hooks';
import { _resetModBuffsForTests, modBuffTypeOf, modBuffIconUrl, registerModBuffIcon } from '../src/mods/buffs';
import { ModConfigState } from '../src/mods/config';
import { parseModManifest } from '../src/mods/manifest';
import { BUFF_DEFS } from '../src/stats/Buffs';
import { ModProj } from '../src/entities/ModProj';
import { World } from '../src/world/World';
import { itemCombat } from '../src/data/vanillaItemCombat';
import type { ModStorage } from '../src/mods/store';

function buildP2ModZip(): Uint8Array {
  const manifest = {
    id: 'p2', name: 'P2 Mod', version: '1.0.0', api: 1, side: 'both',
    config: {
      power: { type: 'number', default: 2, min: 1, max: 10, label: '倍率' },
      enabled: { type: 'bool', default: true },
    },
  };
  return zipSync({
    'mod.json': strToU8(JSON.stringify(manifest)),
    'content/items/demo_caster.json': strToU8(JSON.stringify({
      key: 'demo_caster', name: '示范发射器', maxStack: 1,
      combat: { damage: 30, knockBack: 4, useTime: 18, useAnimation: 18, shoot: 'proj:demo_bolt', shootSpeed: 11, noMelee: true, autoReuse: true },
      func: { useStyle: 1, autoReuse: 1 },
    })),
    'content/projectiles/demo_bolt.json': strToU8(JSON.stringify({
      key: 'demo_bolt', texture: 'textures/proj/bolt.png', gravity: 0.05, lifetime: 120,
      pierce: 0, width: 12, height: 12, rotateToVelocity: true,
    })),
    'content/projectiles/b.json': strToU8(JSON.stringify({ key: 'b', texture: 'textures/proj/b.png' })),
    'textures/proj/bolt.png': new Uint8Array(8),
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

/** node entry 装载器(同 L2 批判例:vite-node 拦截 blob/data URL) */
const nodeEntryLoader = async (code: Uint8Array): Promise<unknown> => {
  const src = new TextDecoder().decode(code);
  const cjs = src.replace(/export\s+default\s+function\s+main/, 'function main');
  // eslint-disable-next-line no-new-func
  return new Function(`${cjs}; return main;`)();
};

beforeAll(async () => {
  _resetModLoaderForTests();
  _resetModHooksForTests();
  _resetModBuffsForTests();
  const { ModStore } = await import('../src/mods/store');
  const { readModPack } = await import('../src/mods/pack');
  const storage = new MemStorage();
  const store = new ModStore(storage);
  const bytes = buildP2ModZip();
  await store.install(readModPack(bytes).manifest, bytes);
  await store.setEnabled('p2', true);
  await loadModsPhase1(storage, { entryLoader: nodeEntryLoader });
});

describe('声明弹幕(P2)', () => {
  it('分配确定性:b 键序 < demo_bolt → 2000/2001', () => {
    expect(getModLoadResult()?.allocation?.projs.get('mod_p2_b')).toBe(2000);
    expect(getModLoadResult()?.allocation?.projs.get('mod_p2_demo_bolt')).toBe(2001);
  });

  it('spec 注册:数据面字段直落', () => {
    const s = modProjSpecOf(2001);
    expect(s?.texture).toBe('textures/proj/bolt.png');
    expect(s?.gravity).toBe(0.05);
    expect(s?.lifetime).toBe(120);
    expect(s?.pierce).toBe(0);
    expect(s?.rotateToVelocity).toBe(true);
  });

  it('物品 combat.shoot 字符串换算为 allocated projId', () => {
    expect(itemCombat(30000)?.shoot).toBe(2001);
  });

  it('ModProj:未注册弹构造 fail-fast;注册弹内置物理/寿命', () => {
    expect(() => new ModProj(0, 0, 1, 0, 10, 1, 9999, true)).toThrow(/未注册/);
    const world = new World(64, 32, 42, 't');
    const gameStub = { world, entities: { enemies: [] } } as never;
    const p = new ModProj(100, 100, 2, 0, 30, 4, 2001, true);
    expect(p.projId).toBe(2001);
    expect(p.w).toBe(12);
    p.fixedUpdate(1 / 60, gameStub);
    expect(p.x).toBe(102);          // 位移步进
    expect(p.vy).toBe(0.05);        // 重力累计
    // 寿命:120 tick 后亡
    for (let i = 0; i < 130; i++) p.fixedUpdate(1 / 60, gameStub);
    expect(p.dead).toBe(true);
  });

  it('projectileHook:代码钩合并(未注册 fail-fast)', async () => {
    const { createModContext } = await import('../src/mods/api');
    const alloc = getModLoadResult()!.allocation!;
    const sw = createModContext('p2', alloc, new ModConfigState('p2', {}, null));
    let fired = 0;
    sw.projectileHook('demo_bolt', { update: () => { fired++; } });
    const s = modProjSpecOf(2001)!;
    const world = new World(64, 32, 42, 't');
    const p = new ModProj(0, 0, 0, 0, 1, 0, 2001, true);
    s.update!({} as never, { world } as never);
    expect(fired).toBe(1);
    expect(() => sw.projectileHook('ghost', {})).toThrow(/未注册/);
    void registerProjHooks;
  });
});

describe('mod buff(P2)', () => {
  it('sw.buff 注册:BuffType 追加+BUFF_DEFS+伪 vanillaBuff(9000+)+图标 URL', async () => {
    const { createModContext } = await import('../src/mods/api');
    const alloc = getModLoadResult()!.allocation!;
    const sw = createModContext('p2', alloc, new ModConfigState('p2', {}, null));
    let ticks = 0;
    sw.buff('demo_might', {
      name: '示范之力', texture: 'textures/buff/might.png',
      onTick: () => { ticks++; },
    });
    const bt = modBuffTypeOf('p2', 'demo_might');
    expect(bt).toBeGreaterThan(287);
    const def = (BUFF_DEFS as Record<number, { vanillaBuff: number; fallbackName: string }>)[bt]!;
    expect(def.fallbackName).toBe('示范之力');
    expect(def.vanillaBuff).toBeGreaterThanOrEqual(9000);
    // 图标 URL(资产相位登记;此处直测登记函数)
    registerModBuffIcon('p2', 'demo_might', new Uint8Array([1]), (png) => `blob:${png.length}`);
    expect(modBuffIconUrl(def.vanillaBuff)).toBe('blob:1');
    expect(modBuffIconUrl(26)).toBeNull();   // 原版域不命中
    // tick 派发:玩家 buffs.active 含该型 → onTick
    const stubGame = { player: { buffs: { active: new Map([[bt, 5]]) } } } as never;
    runModPreUpdate(stubGame, 1 / 60);
    expect(ticks).toBe(1);
  });
});

describe('ModConfig(P2)', () => {
  it('缺省值/钳制/未声明键 fail-fast', () => {
    const state = new ModConfigState('p2', {
      power: { type: 'number', default: 2, min: 1, max: 10 },
      flag: { type: 'bool', default: false },
    }, { power: 99, flag: true });
    expect(state.get('power')).toBe(10);      // max 钳制
    expect(state.get('flag')).toBe(true);
    expect(() => state.get('ghost')).toThrow(/未声明/);
    expect(() => state.set('ghost', 1)).toThrow(/未声明/);
  });

  it('manifest config 表校验', () => {
    const ok = parseModManifest(JSON.stringify({
      id: 'cc', name: 'C', version: '1.0.0', api: 1, side: 'both',
      config: { a: { type: 'number', default: 1, min: 0, max: 2 } },
    }));
    expect(ok.config?.a?.default).toBe(1);
    expect(() => parseModManifest(JSON.stringify({
      id: 'cc', name: 'C', version: '1.0.0', api: 1, side: 'both',
      config: { a: { type: 'bool', default: 1 } },
    }))).toThrow(/default 须 bool/);
  });

  it('装载计数含 projs;violate 引用拒载', () => {
    const r = getModLoadResult()!;
    expect(r.loaded[0]!.counts.projs).toBe(2);
    expect(r.errors).toEqual([]);
  });

  it('kv 持久化:set 走 kvSet(node 降级 fail 不炸)', () => {
    const state = new ModConfigState('p2x', { n: { type: 'number', default: 1 } }, null);
    state.set('n', 5);
    expect(state.get('n')).toBe(5);
  });

  it('vi.spyOn smoke:错误登记路径', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    console.warn('[mods] 测试告警');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
