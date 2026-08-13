// 时装（vanity）装备链回归——"时装穿不上"修复（2026-08-14）
// 根因:swapEquipItem 无 ArmorSwap :3289 vanity 路由,纯社交配饰(acc=0)右键
// 撞 armorAccepts 功能槽 acc!==1 门直接被拒;vanity 盔甲则错误进功能段。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Inventory } from '../src/items/Inventory';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { vanillaStatOfVid } from '../src/data/vanillaItemStats';

const internalOf = (key: string) => ITEM_DEFS.findIndex((d) => d?.key === key);

describe('vanity 数据（van 标记）', () => {
  it('269 FamiliarShirt = vanity 盔甲(bs=0+van)；268 潜水头盔 = 功能盔甲(无 van)', () => {
    expect(vanillaStatOfVid(269)).toMatchObject({ s: 'b', van: 1 });
    const st268 = vanillaStatOfVid(268)!;
    expect(st268.van).toBeUndefined();
  });
  it('1987 AngelHalo = 社交配饰(acc=0+van)；54 HermesBoots = 功能配饰(acc=1 无 van)', () => {
    expect(vanillaStatOfVid(1987)).toMatchObject({ acc: 0, van: 1 });
    const st54 = vanillaStatOfVid(54)!;
    expect(st54.acc).toBe(1);
    expect(st54.van).toBeUndefined();
  });
  it('提取覆盖面：stats 表 van=1 共 390 条（3 缺=非装备 856/2054/3373）', () => {
    const t = JSON.parse(readFileSync('src/data/vanilla-itemstats.json', 'utf8')) as Record<string, { van?: number }>;
    const vanCount = Object.values(t).filter((e) => e.van === 1).length;
    expect(vanCount).toBe(390);
  });
});

describe('armorAccepts 槽位门（社交/功能）', () => {
  it('功能配饰槽拒社交配饰（acc=0），社交配饰槽收功能/社交两种', () => {
    const inv = new Inventory();
    const halo = internalOf('vi_1987_AngelHalo');
    const boots = internalOf('vi_54_hermes_boots');
    expect(inv.armorAccepts(3, halo)).toBe(false);      // 功能槽拒 acc=0
    expect(inv.armorAccepts(13, halo)).toBe(true);      // 社交槽收 acc=0
    expect(inv.armorAccepts(3, boots)).toBe(true);      // 功能槽收 acc=1
    expect(inv.armorAccepts(13, boots)).toBe(true);     // 社交槽也收功能配饰
  });
  it('vanity 盔甲可进功能槽（原版允许,仅无属性）与社交槽', () => {
    const inv = new Inventory();
    const shirt = internalOf('vi_269_FamiliarShirt');
    expect(inv.armorAccepts(1, shirt)).toBe(true);      // 功能胸甲位
    expect(inv.armorAccepts(11, shirt)).toBe(true);     // 社交胸甲位
    expect(inv.armorAccepts(0, shirt)).toBe(false);     // 头位不收
  });
  it('同款互斥:功能与社交不可同穿（HasSameItemInSlot 对段）', () => {
    const inv = new Inventory();
    const boots = internalOf('vi_54_hermes_boots');
    inv.armor[3] = { id: boots, stack: 1 };
    expect(inv.armorAccepts(13, boots)).toBe(false);    // 对段同 type 拒
  });
});
