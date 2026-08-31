import { describe, it, expect } from 'vitest';
import { boomerangCellBlocks, BOOMERANG_OWN_LIMIT } from '../src/entities/WeaponProj';
import { TILE } from '../src/core/constants';

/** TileStore 结构兼容子集桩（isSolid/idx/half 三件） */
const mkStore = (halfAt: (tx: number, ty: number) => boolean) => ({
  isSolid: (_x: number, y: number): boolean => y >= 10 && y <= 12, // 11 行带=测试面
  idx: (tx: number, ty: number): number => ty * 1000 + tx,
  half: new Proxy({} as ArrayLike<number>, {
    get: (_t, k: string | symbol) => {
      const s = String(k);
      if (/^\d+$/.test(s)) {
        const v = Number(s);
        const ty = Math.floor(v / 1000), tx = v % 1000;
        return halfAt(tx, ty) ? 1 : 0;
      }
      return undefined;
    },
    has: () => true,
    ownKeys: () => [],
  }) as ArrayLike<number>,
});

describe('boomerangCellBlocks —— 弹体单格形状阻挡（半砖下半实心 C.cs:2174-2177）', () => {
  const CELL_TOP = 11 * TILE;

  it('全格实心:任意纵向交集都拦', () => {
    const st = mkStore(() => false);
    expect(boomerangCellBlocks(st, 3, 11, CELL_TOP + 2, CELL_TOP + 20)).toBe(true);
    expect(boomerangCellBlocks(st, 3, 11, CELL_TOP - 5, CELL_TOP + 5)).toBe(true);
  });

  it('半砖:格上半区不拦(弹盒底缘只跨过 +8 线之上),下半区拦截', () => {
    const st = mkStore((_tx, ty) => ty === 11);
    // 盒底 = cellTop+6(站半砖顶时出生盒下缘,feet=cellTop+8 ⇒ bottom=cellTop+6)
    expect(boomerangCellBlocks(st, 5, 11, CELL_TOP + 6 - 38, CELL_TOP + 6)).toBe(false);
    // 底缘恰在 +8 线 = 零穿透仍不拦(原版接触带 0.1f 阈值同义);越线即拦
    expect(boomerangCellBlocks(st, 5, 11, CELL_TOP + 8 - 38, CELL_TOP + 8)).toBe(false);
    expect(boomerangCellBlocks(st, 5, 11, CELL_TOP + 8 - 38, CELL_TOP + 9)).toBe(true);
    expect(boomerangCellBlocks(st, 5, 11, CELL_TOP + 12, CELL_TOP + 30)).toBe(true);
  });

  it('平台/家具族(isSolid=false)恒不拦——原版弹体 fallThrough 缺省 true 同义', () => {
    const st = { ...mkStore(() => false), isSolid: () => false };
    expect(boomerangCellBlocks(st, 7, 11, CELL_TOP + 2, CELL_TOP + 40)).toBe(false);
  });
});

describe('BOOMERANG_OWN_LIMIT 单发门表（Player.cs:52801-52856 对拍）', () => {
  it('严格单发组∪光刃族∪301=1;106=6/272=10/1000=3', () => {
    for (const id of [6, 19, 33, 52, 113, 320, 333, 383, 491, 867, 1052, 902, 866, 301]) {
      expect(BOOMERANG_OWN_LIMIT[id]).toBe(1);
    }
    for (const id of [1059, 1061, 1072, 1074, 1102]) expect(BOOMERANG_OWN_LIMIT[id]).toBe(1);
    expect(BOOMERANG_OWN_LIMIT[106]).toBe(6);
    expect(BOOMERANG_OWN_LIMIT[272]).toBe(10);
    expect(BOOMERANG_OWN_LIMIT[1000]).toBe(3);
    expect(BOOMERANG_OWN_LIMIT[1318]).toBeUndefined(); // 未列表型号不限
  });
});
