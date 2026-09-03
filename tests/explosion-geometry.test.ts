import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';

// SW-F1 2026-09-03：爆炸圆几何 1:1 回归（Projectile.ExplodeTiles cs:80454-80503）。
// 原版式：compareSpot=像素爆心（弹盒左上 position/Center,:79068-79072）→ 距离对
// 【格原点】取 `|i - px/16|` → sqrt(dx²+dy²) < radius **严格开圆**（:80461-80463）；
// 循环界=(int) 截断 ±radius 含端（:79073-79096）。旧行为=整格原点闭圆（≤R²），每爆差数格。
describe('explodeDiscTiles 爆炸圆几何（:80461-80463 逐式）', () => {
  const vanilla = (px: number, py: number, R: number): Array<[number, number]> => {
    const minI = Math.max(0, Math.trunc(px / 16 - R)), maxI = Math.trunc(px / 16 + R);
    const minJ = Math.max(0, Math.trunc(py / 16 - R)), maxJ = Math.trunc(py / 16 + R);
    const out: Array<[number, number]> = [];
    for (let i = minI; i <= maxI; i++)
      for (let j = minJ; j <= maxJ; j++) {
        const a = Math.abs(i - px / 16), b = Math.abs(j - py / 16);   // :80461-80462
        if (Math.sqrt(a * a + b * b) < R) out.push([i, j]);           // :80463 严格开圆
      }
    return out;
  };
  const set = (s: Array<[number, number]>) => new Set(s.map(([i, j]) => `${i},${j}`));

  it('严格开圆：恰等于 radius 的边界格排除（旧闭圆保留）', () => {
    const s = set(Game.explodeDiscTiles(64, 64, 2));   // 爆心=(4,4) 格原点
    expect(s.has('6,4')).toBe(false);                  // 距恰 2 → 排除
    expect(s.has('4,6')).toBe(false);
    expect(s.has('5,4')).toBe(true);                   // 距 1
    expect(s.has('5,5')).toBe(true);                   // √2 < 2
  });

  it('亚格偏心：center=(x*16+8,y*16+8) 与 (x*16,y*16) 两种爆心逐格=原版公式且互异', () => {
    const x = 100, y = 100;
    const c1 = set(Game.explodeDiscTiles(x * 16 + 8, y * 16 + 8, 4));
    const c2 = set(Game.explodeDiscTiles(x * 16, y * 16, 4));
    expect(c1).toEqual(set(vanilla(x * 16 + 8, y * 16 + 8, 4)));
    expect(c2).toEqual(set(vanilla(x * 16, y * 16, 4)));
    expect(c1).not.toEqual(c2);            // 亚格圆心真实改变形状
    expect(c1.size).toBe(52);
    expect(c2.size).toBe(45);
  });

  it('爆心锚：炸弹 28 compareSpot=弹心−11px（:79068 position）+ 半盒表分档', () => {
    const px = 100 * 16 + 8 - 11, py = 100 * 16 + 8 - 11;
    expect(set(Game.explodeDiscTiles(px, py, 4))).toEqual(set(vanilla(px, py, 4)));
    expect(Game.explosionCompareHalfBoxPx(28)).toBe(11);   // 22 盒终态(:80073)
    expect(Game.explosionCompareHalfBoxPx(29)).toBe(5);    // 10 盒终态(:80180)
    expect(Game.explosionCompareHalfBoxPx(1086)).toBe(0);  // Center 系(:79069-79072)
  });
});
