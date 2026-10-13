// ★刀3-3(2026-10-13)mod gore L1 守卫:e2e 装载(content/gores + npc.deathGore)→
//   697+ 段分配 + deathGoreFor 回退 + PNG IHDR 尺寸簿。消费面锚:GorePiece.deathGoreFor/
//   newGore 尺寸链、spawnDeathGore、assets 两支注入。
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import { buildRegistrationPlan, validatePlanReferences } from '../src/mods/plan';
import { parseModManifest } from '../src/mods/manifest';
import { _resetModHooksForTests } from '../src/mods/hooks';
import { _resetModGoreForTests, modGoreIdOf, modGoreTexSizeOf, modDeathGoreOf } from '../src/mods/gore';
import { deathGoreFor } from '../src/entities/GorePiece';
import type { ModPack } from '../src/mods/types';
import type { ModStorage } from '../src/mods/store';

/** 最小 PNG 头(IHDR 大端宽高 @16/@20)——register 期零解码尺寸簿读数用 */
function fakePng(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
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

function buildGoreModZip(): Uint8Array {
  return zipSync({
    'mod.json': strToU8(JSON.stringify({ id: 'g3', name: 'G3 Gore', version: '1.0.0', api: 1, side: 'both' })),
    'content/gores/shard.json': strToU8(JSON.stringify({ key: 'shard', texture: 'textures/gores/shard.png' })),
    'content/gores/ash.json': strToU8(JSON.stringify({ key: 'ash', texture: 'textures/gores/ash.png' })),
    'content/npcs/golem.json': strToU8(JSON.stringify({
      key: 'golem', name: 'Ash Golem', aiStyle: 1, lifeMax: 100, damage: 20, defense: 8,
      width: 24, height: 40, frames: 3,
      deathGore: [{ gore: 'shard', n: 3 }, { gore: 'ash', n: 2, scale: 0.8 }, { gore: 16 }],
    })),
    'textures/gores/shard.png': fakePng(24, 24),
    'textures/gores/ash.png': fakePng(16, 20),
  });
}

describe('刀3-3 e2e:mod gore 装载+deathGoreFor 回退', () => {
  beforeAll(async () => {
    _resetModLoaderForTests();
    _resetModHooksForTests();
    _resetModGoreForTests();
    const { ModStore } = await import('../src/mods/store');
    const { readModPack } = await import('../src/mods/pack');
    const storage = new MemStorage();
    const store = new ModStore(storage);
    const bytes = buildGoreModZip();
    await store.install(readModPack(bytes).manifest, bytes);
    await store.setEnabled('g3', true);
    await loadModsPhase1(storage);
  });

  it('697+ 段字典序分配;IHDR 尺寸簿;deathGoreFor 回退(已解析原版形)', () => {
    const res = getModLoadResult();
    expect(res?.errors ?? []).toEqual([]);
    expect(res?.allocation?.gores.get('mod_g3_ash')).toBe(1500);     // 字典序 ash 先(R3-C1:基址 1500=原版 gore 空间 1406+缓冲)
    expect(res?.allocation?.gores.get('mod_g3_shard')).toBe(1501);
    expect(modGoreIdOf('mod_g3_shard')).toBe(1501);
    expect(modGoreTexSizeOf(1500)).toEqual({ w: 16, h: 20 });
    expect(modGoreTexSizeOf(1501)).toEqual({ w: 24, h: 24 });
    const npcId = res?.allocation?.npcs.get('mod_g3_golem');
    expect(npcId).toBeDefined();
    expect(deathGoreFor(npcId!)).toEqual([
      { id: 1501, loop: 3, scale: undefined },
      { id: 1500, loop: 2, scale: 0.8 },
      { id: 16, loop: undefined, scale: undefined },   // 原版 gore id 直引
    ]);
    expect(modDeathGoreOf(42)).toBeNull();             // 原版 NPC 反查恒 null
  });

  it('原版表优先(域内 NPC 不受 mod 回退影响)', () => {
    expect(deathGoreFor(3).length).toBeGreaterThan(0);  // 僵尸原版表项照走
  });
});

// ★红队 R3-M2 修复验证:deathGore 坏引用 plan 级拒绝(不再 apply 期半装逸出)
describe('刀3-3 plan 校验面(M2 收编)', () => {
  it('deathGore 引用未注册 gore → ModPlanError', () => {
    const manifest = parseModManifest(JSON.stringify({ id: 'g4', name: 'G4', version: '1.0.0', api: 1, side: 'both' }));
    const bad: ModPack = { manifest, files: new Map([
      ['content/npcs/x.json', strToU8(JSON.stringify({
        key: 'x', name: 'X', aiStyle: 1, lifeMax: 10, damage: 5, defense: 0,
        deathGore: [{ gore: 'ghost' }],
      }))],
    ]) };
    // 校验面=独立步骤(loader 同序:build → validatePlanReferences)
    expect(() => validatePlanReferences(buildRegistrationPlan([bad]))).toThrow(/引用未注册 gore/);
  });
});
