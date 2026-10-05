// mod loader L1 全链 E2E(2026-10-04):zip 构造→装载→注册→实例化域→存档 round-trip。
// 覆盖 docs/mod-loader-design.md §5 刀序 6 的数据面;贴图注入走浏览器探针(登记 P0 残项:
// node 无 createImageBitmap,见测试尾注)。
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import { loadModsPhase1, getModLoadResult, _resetModLoaderForTests } from '../src/mods/loader';
import type { ModStorage } from '../src/mods/store';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS, TILE_STABLE_OF_INTERNAL } from '../src/data/tiles';
import { vanillaNpc } from '../src/data/vanillaNpcs';
import { VANILLA_RECIPES } from '../src/data/vanillaRecipes';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { saveGame, loadSave } from '../src/save/SaveFile';
import type { InvItem } from '../src/items/Inventory';

// ---- demo mod(zip 内构造;字段面=design.md §3) ----

/** 1×1 透明 PNG(占位满足包结构校验;资产解码走真机探针)。
 *  ★node 下 Uint8Array.from(atob()) 产全零(2026-10-04 实证)——必须 Buffer.from */
const PNG_1PX = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
));

function buildDemoModZip(): Uint8Array {
  const manifest = {
    id: 'demo', name: 'Demo Mod', version: '1.0.0', author: 'sw', api: 1, side: 'both',
    description: 'L1 全链示范',
  };
  return zipSync({
    'mod.json': strToU8(JSON.stringify(manifest)),
    'content/items/demo_sword.json': strToU8(JSON.stringify({
      key: 'demo_sword', name: '示范剑', rare: 2, value: 2000, maxStack: 1,
      combat: { damage: 25, knockBack: 5.5, useTime: 22, useAnimation: 22, melee: true, autoReuse: true },
      func: { useStyle: 1, autoReuse: 1 },
    })),
    'content/items/demo_ore.json': strToU8(JSON.stringify({
      key: 'demo_ore', name: '示范矿石', rare: 1, value: 300, maxStack: 999, material: true,
    })),
    'content/items/demo_ore_item.json': strToU8(JSON.stringify({
      key: 'demo_ore_item', name: '示范矿块', rare: 0, value: 100, maxStack: 999,
      placeTile: 'mod_demo_ore_block',
    })),
    'content/tiles/ore_block.json': strToU8(JSON.stringify({
      key: 'ore_block', name: '示范矿块', solid: true, opacity: 1, pick: 0,
      mapColor: '#B04ACA', frame: 'style', frameWidth: 1, frameHeight: 1, styles: 1,
      texture: 'textures/tiles/ore_block.png',
      dropItem: 'demo_ore_item',
    })),
    'content/npcs/demo_slime.json': strToU8(JSON.stringify({
      key: 'demo_slime', name: '示范史莱姆', aiStyle: 1,
      lifeMax: 30, damage: 8, defense: 4, knockBackResist: 0.3,
      width: 22, height: 18, frames: 2,
      HitSound: 'NPC_Hit_1', DeathSound: 'NPC_Killed_1',
      value: 100,
      drops: [{ item: 'demo_ore', min: 1, max: 3, chance: 0.5 }],
      texture: 'textures/npcs/demo_slime.png',
    })),
    'content/recipes.json': strToU8(JSON.stringify([
      { create: 'demo_sword', createStack: 1, tile: 13, items: [{ item: 'demo_ore', stack: 8 }] },
    ])),
    'textures/tiles/ore_block.png': PNG_1PX,
    'textures/npcs/demo_slime.png': PNG_1PX,
    'textures/items/demo_sword.png': PNG_1PX,
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

// ---- 装载(文件内一次;断言分配确定性) ----
const storage = new MemStorage();

beforeAll(async () => {
  _resetModLoaderForTests();
  const { ModStore } = await import('../src/mods/store');
  const store = new ModStore(storage);
  const bytes = buildDemoModZip();
  // 安装走 store(校验 manifest)再手动置行启用状态=用户面板同链
  const manifest = (await import('../src/mods/pack')).readModPack(bytes).manifest;
  await store.install(manifest, bytes);
  await store.setEnabled('demo', true);
  await loadModsPhase1(storage);
});

describe('demo mod 全链', () => {
  it('装载结果:1 mod 零错误,计数 3 物品/1 tile/1 npc/0 弹/1 配方', () => {
    const r = getModLoadResult();
    expect(r!.errors).toEqual([]);
    expect(r!.loaded).toHaveLength(1);
    expect(r!.loaded[0]!.counts).toEqual({ items: 3, tiles: 1, npcs: 1, projs: 0, recipes: 1 , buffs: 0 });
  });

  it('分配确定性:字典序 demo_ore<demo_ore_item<demo_sword → 30000/30001/30002', () => {
    expect(ITEM_BY_KEY['mod_demo_demo_ore']).toBe(30000);
    expect(ITEM_BY_KEY['mod_demo_demo_ore_item']).toBe(30001);
    expect(ITEM_BY_KEY['mod_demo_demo_sword']).toBe(30002);
  });

  it('三表贯通:func/combat/stats 按 vid 命中(白嫖原版派发面)', () => {
    const vid = ITEM_BY_KEY['mod_demo_demo_sword']!;
    expect(itemFuncOfVid(vid)?.useStyle).toBe(1);
    expect(itemCombat(vid)?.damage).toBe(25);
    expect(ITEM_DEFS[vid]!.vid).toBe(vid);
  });

  it('tile 注册:伪 sheet≡stable≡1030,drop 指向 mod 物品', () => {
    const tid = TILE_BY_KEY['mod_demo_ore_block'];
    expect(tid).toBeGreaterThan(700);
    expect(TILE_STABLE_OF_INTERNAL[tid]).toBe(1030);
    expect(TILE_DEFS[tid]!.drop).toBe(ITEM_BY_KEY['mod_demo_demo_ore_item']);
    expect(TILE_DEFS[tid]!.vanilla!.sheet).toBe(1030);
  });

  it('NPC 注册:vanillaNpc(800) 贯通(fromVanilla 同链)', () => {
    const v = vanillaNpc(800);
    expect(v?.name).toBe('示范史莱姆');
    expect(v?.aiStyle).toBe(1);
  });

  it('配方追加:mod 物品域 id 直落(create=30002,材料=30000)', () => {
    const r = VANILLA_RECIPES[VANILLA_RECIPES.length - 1]!;
    expect(r.create).toBe(ITEM_BY_KEY['mod_demo_demo_sword']);
    expect(r.items[0]!.id).toBe(ITEM_BY_KEY['mod_demo_demo_ore']);
    expect(r.tile).toBe(13);
    expect(r.notDecraftable).toBe(true);
  });

  it('存档 round-trip:背包 mod 物品按 stable id 保真', () => {
    const world = new World(64, 32, 42, '测试');
    const player = new Player(100, 100, new Inventory());
    const vid = ITEM_BY_KEY['mod_demo_demo_sword']!;
    const item: InvItem = { id: vid, stack: 1 };
    player.inv.slots[0] = item;
    const json = saveGame(world, player, 0);
    // 磁盘值 = stable id(30000 段)
    expect(json).toContain('"id":30002');
    const back = loadSave(json);
    const slot = back.player?.inventory?.[0];
    expect(slot?.id).toBe(vid);
    expect(slot?.stack).toBe(1);
  });

  it('存档 round-trip:mod tile 按稳定 id 1030 保真', () => {
    const world = new World(64, 32, 42, '测试');
    const player = new Player(100, 100, new Inventory());
    const tid = TILE_BY_KEY['mod_demo_ore_block']!;
    world.store.setTile(10, 10, tid);
    const json = saveGame(world, player, 0);
    const back = loadSave(json);
    expect(back.world?.store?.get(10, 10)).toBe(tid);
  });

  it('缺 mod 读档:stable id 未知 → 静默归 0(占位语义,不炸)', () => {
    // 手工构造含未知稳定 id 的存档 JSON(模拟 mod 卸载后读档)
    const world = new World(64, 32, 42, '测试');
    const player = new Player(100, 100, new Inventory());
    player.inv.slots[0] = { id: ITEM_BY_KEY['mod_demo_demo_sword']!, stack: 2 };
    const json = saveGame(world, player, 0);
    // 从内存注册表角度无法"卸载"(同进程模块态已注册)——此断言由 mod-save-bridge
    // 测试的 fresh 态(worker 无桥)覆盖双向归 0 语义;此处验证写面磁盘值即可
    expect(json).toContain('"id":30002');
  });
});

// P0 残项登记:贴图注入(applyModAssets)的视觉验证须走真机探针——node 无
// createImageBitmap,decodePng 静默 null;Browser 探针在私有 vite 实例上做
// (CLAUDE.md 并行会话约定 SW_ORIGIN)。
