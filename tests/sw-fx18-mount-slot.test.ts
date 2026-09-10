// SW-FX18 2026-09-10 坐骑装备槽 UI 复核批（A 级登记 "坐骑装备槽 UI—MobileControls:289"
// 现状定谳 = 已实装,本件为守卫测试防回潮）。
// 金标锚（Terarria1457）：
//   - miscEquips[5] = 宠物/光源/矿车/坐骑/钩爪（Player.cs:1376;槽序 = MISC_KINDS）
//   - 槽分类门 = ItemSlot.cs:1305-1317：context 17（坐骑）= mountType!=-1 且
//     !MountID.Sets.Cart;context 18（矿车）= Cart 集
//   - QuickMount_GetItemToUse（Player.cs:6174-6187）：miscEquips[3] 优先于背包顺序扫
//     （且 Cart 坐骑跳过——Game.ts quickMount 1:1 承接）
//   - 杂项装备槽持久化 = .plr miscEquips 段（serialize v4 逐槽稳定 id）
// 运行:npx vitest run tests/sw-fx18-mount-slot.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { miscSlotAccepts, MISC_KINDS, equipKindOfVid } from '../src/data/vanillaEquip';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { mountOfItem, isCartMount } from '../src/entities/Mounts';

const SRC = join(dirname(fileURLToPath(new URL(import.meta.url))), '..', 'src');
const readSrc = (p: string): string => readFileSync(join(SRC, p), 'utf8');
const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  expect(k).toBeDefined();
  return ITEM_BY_KEY[k!];
};

describe('SW-FX18 坐骑槽分类门（ItemSlot.cs:1305-1317 对拍）', () => {
  it('槽序表 = 宠物/光源/矿车/坐骑/钩爪（Player.cs:1376 miscEquips[5]）', () => {
    expect(MISC_KINDS).toEqual(['pet', 'light', 'cart', 'mount', 'hook']);
  });

  it('坐骑槽（miscEquips[3]）收非 Cart 坐骑、拒矿车与杂件（context 17 门）', () => {
    // 坐骑族代表：史莱姆鞍 2428 / 硬鞍 2491 / 高尔夫球车钥匙 4264
    for (const vid of [2428, 2491, 2502, 4264]) {
      expect(equipKindOfVid(vid)).toBe('mount');
      expect(miscSlotAccepts(3, iid(vid))).toBe(true);
      expect(miscSlotAccepts(2, iid(vid))).toBe(false);   // 矿车槽不收
    }
    // Cart 族代表：矿车 2343 / 机械矿车 4067 —— 只进矿车槽
    for (const vid of [2343, 4066, 4067]) {
      expect(equipKindOfVid(vid)).toBe('cart');
      expect(miscSlotAccepts(2, iid(vid))).toBe(true);
      expect(miscSlotAccepts(3, iid(vid))).toBe(false);
    }
    // 非装备件拒收
    expect(miscSlotAccepts(3, iid(9))).toBe(false);       // 木材
    expect(miscSlotAccepts(3, iid(84))).toBe(false);      // 抓钩 → 槽 4
  });

  it('Inventory.miscAccepts 直通分类门（UI 杂项栏放置闸）', () => {
    const inv = new Inventory();
    expect(inv.miscAccepts(3, iid(4264))).toBe(true);
    expect(inv.miscAccepts(2, iid(4264))).toBe(false);
    expect(inv.miscAccepts(2, iid(2343))).toBe(true);
  });
});

describe('SW-FX18 QuickMount 坐骑槽优先（Player.cs:6174-6187）', () => {
  it('结构锁：quickMount 先读 miscEquips[3] 再背包扫,Cart 支隔离', () => {
    const src = readSrc('src/core/Game.ts'.replace('src/', ''));
    // 坐骑槽优先读（miscEquips[3] 在背包 slots 扫描之前出现）
    const slotIdx = src.indexOf('const eq = p.inv.miscEquips[3];');
    const scanIdx = src.indexOf('for (const s2 of p.inv.slots)');
    expect(slotIdx).toBeGreaterThan(-1);
    expect(scanIdx).toBeGreaterThan(slotIdx);
    // 非 Cart 门（!MountID.Sets.Cart → !isCartMount）
    expect(src).toContain('!isCartMount(mountOfItem(vid))');
  });

  it('数据侧：4264 → mount 17 且非 Cart（quickMount 走坐骑支不走矿车支）', () => {
    expect(mountOfItem(4264)).toBe(17);
    expect(isCartMount(mountOfItem(4264))).toBe(false);
    // 对照:矿车 2343 → mount 6（Cart 集,quickMount 跳过坐骑支）
    expect(mountOfItem(2343)).toBe(6);
    expect(isCartMount(mountOfItem(2343))).toBe(true);
  });
});

describe('SW-FX18 坐骑槽持久化（.plr miscEquips 段 / serialize v4 稳定 id）', () => {
  it('saveGame → loadSave：miscEquips[3] 坐骑槽 round-trip 全保留', async () => {
    const { World } = await import('../src/world/World');
    const { Player } = await import('../src/entities/Player');
    const { saveGame, loadSave } = await import('../src/save/SaveFile');
    const w = new World(60, 40, 42, 'fx18-test');
    const p = new Player(100, 100, new Inventory());
    p.inv.miscEquips[3] = { id: iid(4264), stack: 1 };   // 高尔夫球车钥匙入坐骑槽
    p.inv.miscEquips[2] = { id: iid(2343), stack: 1 };   // 矿车入矿车槽
    const json = saveGame(w, p, 0);
    const { player } = loadSave(json);
    expect(player.miscEquips?.[3]?.id).toBe(iid(4264));
    expect(player.miscEquips?.[2]?.id).toBe(iid(2343));
  });

  it('UI 杂项栏五槽 + miscRail 结构在位（UI.ts 杂项域）', () => {
    const uiSrc = readSrc('ui/UI.ts');
    expect(uiSrc).toContain("makeSlotEl(k, 'misc')");    // 杂项栏 5 槽
    expect(uiSrc).toContain("Mods.SandboxWorld.Tabs.Mount");
    const invSrc = readSrc('items/Inventory.ts');
    expect(invSrc).toContain('miscEquips: Array<InvItem | null>');
    expect(invSrc).toContain('miscAccepts(slot: number, id: number): boolean');
  });
});
