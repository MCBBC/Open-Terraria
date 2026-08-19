// 弹药栏拾取路由两趟语义（Player.cs FillAmmo :38591-38655 + Item.CanFillEmptyAmmoSlot
// :1360-1369）回归——2026-08-19 用户实报"没到获得枪的阶段凝胶就归入弹药栏"：
// 原版拾取路由分两趟：①合并弹药栏已有堆（全部 FitsAmmoSlot 物，凝胶亦然）；
// ②填空格仅 CanFillEmptyAmmoSlot 物——凝胶(23)/沙(169)/坠星(75)/黑檀沙(370)/
// 珍珠沙(408)/猩红沙(1246)/麦酒(353)/致动器(849) 八种"特殊弹药"不自动入栏，
// 拾取落背包；只有普通弹药（箭/子弹/火箭/飞镖/诱饵/涂料）才自动填空格。
import { describe, it, expect } from 'vitest';
import { Inventory, canFillEmptyAmmoSlot, ammoSlotAccepts } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { VI } from '../src/data/itemKeys';

const idOf = (vid: number): number => ITEM_BY_KEY[VI(vid)] ?? -1;

describe('CanFillEmptyAmmoSlot（Item.cs:1360-1369）', () => {
  it('八种特殊弹药不自动填空格', () => {
    for (const vid of [23, 169, 75, 370, 408, 1246, 353, 849]) {
      const id = idOf(vid);
      expect(id, `vid ${vid} 应已注册`).toBeGreaterThanOrEqual(0);
      expect(canFillEmptyAmmoSlot(id), `vid ${vid} 不应自动入栏`).toBe(false);
    }
  });

  it('普通弹药可自动填空格（凝胶对照）', () => {
    // 40 木箭 / 41 火焰箭 / 97 铅弹 / 51 飞镖（★42 是弓非箭——useAmmo=40 消耗 40）
    for (const vid of [40, 41, 97, 51]) {
      const id = idOf(vid);
      expect(id, `vid ${vid} 应已注册`).toBeGreaterThanOrEqual(0);
      expect(canFillEmptyAmmoSlot(id), `vid ${vid} 应自动入栏`).toBe(true);
    }
  });

  it('FitsAmmoSlot 不受影响（凝胶仍可手动放入弹药格）', () => {
    expect(ammoSlotAccepts(idOf(23))).toBe(true);
  });
});

describe('Inventory.add 弹药两趟（FillAmmo 1:1）', () => {
  it('凝胶拾取 → 落背包（不进空弹药格）', () => {
    const inv = new Inventory();
    const gel = idOf(23);
    const left = inv.add(gel, 5);
    expect(left).toBe(0);
    // 弹药栏 54-57 全空（空位 = null）
    for (let i = 54; i < 58; i++) expect(inv.slots[i] == null).toBe(true);
    // 落在背包 0-49（降序从尾填）
    expect(inv.slots.some((s) => s && s.id === gel && s.stack === 5)).toBe(true);
  });

  it('凝胶拾取 → 弹药栏已有凝胶堆时并入（第一趟合并对全部弹药开放）', () => {
    const inv = new Inventory();
    const gel = idOf(23);
    inv.slots[54] = { id: gel, stack: 10 };
    const left = inv.add(gel, 5);
    expect(left).toBe(0);
    expect(inv.slots[54]!.stack).toBe(15);
  });

  it('普通弹药（木箭 40）拾取 → 自动进空弹药格', () => {
    const inv = new Inventory();
    const arrow = idOf(40);
    const left = inv.add(arrow, 30);
    expect(left).toBe(0);
    const inAmmo = [54, 55, 56, 57].some((i) => inv.slots[i]?.id === arrow);
    expect(inAmmo).toBe(true);
  });
});
