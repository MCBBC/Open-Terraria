// P4 弹同步/NPC debuff/旅行商/研究 测试(2026-10-04)。独立文件=fresh registry。
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import { _resetModHooksForTests, runModPostEntities, registerModBuffNpcTick, modProjSpecOf } from '../src/mods/hooks';
import { _resetModShopsForTests, modShopStockOf, registerModShopStock } from '../src/mods/shops';
import { registerModResearch, Research } from '../src/stats/Research';
import { ModProj } from '../src/entities/ModProj';
import { World } from '../src/world/World';
import type { ModStorage } from '../src/mods/store';

function buildP4ModZip(): Uint8Array {
  const manifest = { id: 'p4', name: 'P4 Mod', version: '1.0.0', api: 1, side: 'both' };
  return zipSync({
    'mod.json': strToU8(JSON.stringify(manifest)),
    'content/projectiles/p4_debuffbolt.json': strToU8(JSON.stringify({
      key: 'p4_debuffbolt', texture: 'textures/proj/b.png', lifetime: 60,
      npcDebuff: { buff: 'p4_slow', duration: 3, chance: 1 },
    })),
    'textures/proj/b.png': new Uint8Array(8),
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

beforeAll(async () => {
  _resetModLoaderForTests();
  _resetModHooksForTests();
  _resetModShopsForTests();
  const { ModStore } = await import('../src/mods/store');
  const { readModPack } = await import('../src/mods/pack');
  const storage = new MemStorage();
  const store = new ModStore(storage);
  const bytes = buildP4ModZip();
  await store.install(readModPack(bytes).manifest, bytes);
  await store.setEnabled('p4', true);
  await loadModsPhase1(storage, {
    entryLoader: async (code) => {
      const src = new TextDecoder().decode(code);
      const cjs = src.replace(/export\s+default\s+function\s+main/, 'function main');
      // eslint-disable-next-line no-new-func
      return new Function(`${cjs}; return main;`)();
    },
  });
});

describe('mod 弹幕联机同步(P4)', () => {
  it('kind12 语义:spec 在册=可重建;netPuppet 傀儡=快照跟随不结算', () => {
    const spec = modProjSpecOf(2000);
    expect(spec?.texture).toBe('textures/proj/b.png');
    // 傀儡:netSnapTo 目标位 → fixedUpdate 走 netPuppetStep(不结算伤害/寿命内不死)
    const world = new World(64, 32, 42, 't');
    const gameStub = { world, entities: { enemies: [] } } as never;
    const p = new ModProj(100, 100, 0, 0, 30, 4, 2000, false);
    p.netPuppet = true;
    p.netSnapTo(200, 200);
    for (let i = 0; i < 10; i++) p.fixedUpdate(1 / 60, gameStub);
    expect(p.dead).toBe(false);
    expect(p.x).toBeGreaterThan(100);   // 插值向快照位推进
  });
});

describe('mod buff NPC 侧(P4)', () => {
  it('sw.buff onNpcTick:runModPostEntities 逐 tick 派发+dt 倒计时到期清理', async () => {
    const { createModContext } = await import('../src/mods/api');
    const { applyModNpcBuff, modProjModIdOf } = await import('../src/mods/hooks');
    const alloc = getModLoadResult()!.allocation!;
    const sw = createModContext('p4', alloc, { get: () => 1, set: () => {} } as never);
    let ticks = 0;
    sw.buff('p4_slow', {
      name: 'P4 减速', texture: 'textures/buff/b.png',
      onNpcTick: () => { ticks++; },
    });
    expect(modProjModIdOf(2000)).toBe('p4');
    const enemy = { id: 1, dead: false } as never;
    applyModNpcBuff(enemy, 2147483000, 1);   // 未注册型不炸(寄存器内无 tick=静默跳过)
    // 经类型解析应用(与 ModProj 命中路径同式):modBuffTypeOf → 300+ 段
    const { modBuffTypeOf } = await import('../src/mods/buffs');
    const bt = modBuffTypeOf('p4', 'p4_slow');
    const { applyModNpcBuff: apply2 } = await import('../src/mods/hooks');
    apply2(enemy, bt, 0.05);   // 3 tick 内到期
    const world = new World(64, 32, 42, 't');
    const gameStub = { world, entities: { enemies: [enemy] } } as never;
    for (let i = 0; i < 3; i++) runModPostEntities(gameStub, 1 / 60);
    expect(ticks).toBeGreaterThanOrEqual(2);
    void registerModBuffNpcTick;
  });
});

describe('旅行商货架(P4)', () => {
  it('368 通道:mod 货架可挂旅行商(与 npcShopStock 追加缝同表)', () => {
    registerModShopStock(368, [[30000, 100]]);
    expect(modShopStockOf(368)).toContainEqual([30000, 100]);
  });
});

describe('旅程研究(P4)', () => {
  it('registerModResearch:need 表运行时追加;非法入参忽略', () => {
    registerModResearch(30000, 5);
    const r = new Research();
    expect(r.getNeed(30000)).toBe(5);
    const before = new Research().getNeed(1);   // 原版 vid 1 本就可研究(真值随表)
    registerModResearch(1, 5);                  // 非 mod 段忽略(原版面禁写)
    registerModResearch(30001, 0);              // need<=0 忽略
    const r2 = new Research();
    expect(r2.getNeed(1)).toBe(before);         // 原版 need 不被写
    expect(r2.getNeed(30001)).toBe(0);
  });
});
