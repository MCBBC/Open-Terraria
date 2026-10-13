// ★刀2-C1(2026-10-13)绘制声明面守卫:e2e 装载(NPC frameRate/glowmask/fullbright +
//   弹 additive/fullbright/overPlayers + 物品 glowmask)→ 声明表/spec/伪 id 断言。
//   消费面锚:vanillaFrameIdx 顶部早退/drawNpcGlow 查表/npcWhiteLiftQueue ga=1/
//   PROJ_DRAW_OVER_PLAYERS 分派位/collectDropItemGlow 伪 GlowMaskID 直通/ModProj.draw。
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import { _resetModHooksForTests, modProjSpecOf } from '../src/mods/hooks';
import { _resetModDrawSpecsForTests, modNpcFrameRateOf, modNpcGlowSpecOf, modNpcFullbright, modItemGlowMaskIdOf, modItemGlowMaskId, MOD_ITEM_GLOWMASK_BASE } from '../src/mods/drawspecs';
import { ITEM_DEFS } from '../src/data/items';
import type { ModStorage } from '../src/mods/store';

class MemStorage implements ModStorage {
  reg = '[]';
  zips = new Map<string, Blob>();
  async getRegistry() { return this.reg; }
  async setRegistry(json: string) { this.reg = json; }
  async putZip(id: string, blob: Blob) { this.zips.set(id, blob); return true; }
  async getZip(id: string) { return this.zips.get(id) ?? null; }
  async deleteZip(id: string) { this.zips.delete(id); }
}

function buildC1ModZip(): Uint8Array {
  return zipSync({
    'mod.json': strToU8(JSON.stringify({ id: 'd1', name: 'D1 Draw', version: '1.0.0', api: 1, side: 'both' })),
    'content/npcs/glow_wraith.json': strToU8(JSON.stringify({
      key: 'glow_wraith', name: 'Glow Wraith', aiStyle: 1, lifeMax: 60, damage: 12, defense: 4,
      width: 20, height: 30, frames: 4, frameRate: 3,
      glowmask: { texture: 'textures/npcs/glow_wraith_glow.png' },
      fullbright: true, behindTiles: true,
    })),
    'content/projectiles/ember_trail.json': strToU8(JSON.stringify({
      key: 'ember_trail', name: 'Ember', texture: 'textures/proj/ember.png',
      width: 10, height: 10, additive: true, fullbright: true, overPlayers: true,
    })),
    'content/projectiles/plain_bolt.json': strToU8(JSON.stringify({
      key: 'plain_bolt', name: 'Bolt', texture: 'textures/proj/bolt.png',
      width: 8, height: 8,
    })),
    'content/items/glow_blade.json': strToU8(JSON.stringify({
      key: 'glow_blade', name: 'Glow Blade', damage: 20,
      glowmask: { texture: 'textures/items/glow_blade_glow.png' },
    })),
    'content/items/plain_ingot.json': strToU8(JSON.stringify({
      key: 'plain_ingot', name: 'Plain Ingot',
    })),
    'textures/npcs/glow_wraith.png': new Uint8Array(8),
    'textures/npcs/glow_wraith_glow.png': new Uint8Array(8),
    'textures/proj/ember.png': new Uint8Array(8),
    'textures/proj/bolt.png': new Uint8Array(8),
    'textures/items/glow_blade_glow.png': new Uint8Array(8),
  });
}

describe('刀2-C1 e2e:绘制声明面装载+查表', () => {
  beforeAll(async () => {
    _resetModLoaderForTests();
    _resetModHooksForTests();
    _resetModDrawSpecsForTests();
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const storage = new MemStorage();
    const store = new ModStore(storage);
    const bytes = buildC1ModZip();
    await store.install(readModPack(bytes).manifest, bytes);
    await store.setEnabled('d1', true);
    await loadModsPhase1(storage);
  });

  it('NPC 声明面:帧率/glow 贴图/fullbright 落表;原版域恒 miss', () => {
    const res = getModLoadResult();
    expect(res?.errors ?? []).toEqual([]);
    const npcId = res?.allocation?.npcs.get('mod_d1_glow_wraith')!;
    expect(npcId).toBeDefined();
    expect(modNpcFrameRateOf(npcId)).toBe(3);
    expect(modNpcGlowSpecOf(npcId)).toEqual({ tex: `vanilla/NPC_Glow_${npcId}.png` });
    expect(modNpcFullbright(npcId)).toBe(true);
    expect(modNpcFrameRateOf(42)).toBeNull();     // 原版域零扰动
    expect(modNpcGlowSpecOf(42)).toBeNull();
    expect(modNpcFullbright(42)).toBe(false);
  });

  it('弹三字段:spec 直通(additive/fullbright/overPlayers);无声明件缺省 falsy', () => {
    const res = getModLoadResult();
    const ember = res?.allocation?.projs.get('mod_d1_ember_trail')!;
    const bolt = res?.allocation?.projs.get('mod_d1_plain_bolt')!;
    const se = modProjSpecOf(ember);
    expect(se?.additive).toBe(true);
    expect(se?.fullbright).toBe(true);
    expect(se?.overPlayers).toBe(true);
    const sb = modProjSpecOf(bolt);
    expect(sb?.additive).toBeFalsy();
    expect(sb?.fullbright).toBeFalsy();
    expect(sb?.overPlayers).toBeFalsy();
    expect(modProjSpecOf(85)?.overPlayers).toBeFalsy();   // 原版弹零扰动
  });

  it('物品 glowmask:伪 GlowMaskID=1000+stableId-30000;无声明件不入表', () => {
    const res = getModLoadResult();
    const blade = res?.allocation?.items.get('mod_d1_glow_blade')!;
    const ingot = res?.allocation?.items.get('mod_d1_plain_ingot')!;
    const gm = modItemGlowMaskIdOf(blade);
    expect(gm).toBe(MOD_ITEM_GLOWMASK_BASE + (blade - 30000));
    expect(modItemGlowMaskId(blade)).toBe(gm);
    expect(modItemGlowMaskIdOf(ingot)).toBeUndefined();
    expect(modItemGlowMaskIdOf(46)).toBeUndefined();      // 原版域(真表 ITEM_GLOWMASK 管)
  });
});
