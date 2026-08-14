// 瓦罐钱币传送门（CoinPortal proj 518 / AI_094）+ style 钱币乘子链对账。
// 语义源：WorldGen.cs:57110-57194（num 变换 → range=500/((num+1)/2) →
// RollLuck==0 短路喷传送门）、Projectile.cs:31696-31782（AI_094 四阶段机）。
import { describe, expect, it, vi } from 'vitest';
import { potCoinMul } from '../src/core/Game';
import { CoinPortalProj } from '../src/entities/CoinPortalProj';
import type { GameHooks } from '../src/entities/types';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

describe('potCoinMul（SpawnThingsFromPot style 乘子，WorldGen.cs:57110-57162）', () => {
  it('全档位取值（0-3→1 … 34-36→1.25）', () => {
    expect(potCoinMul(0, false)).toBe(1);
    expect(potCoinMul(3, false)).toBe(1);
    expect(potCoinMul(4, false)).toBe(1.25);
    expect(potCoinMul(7, false)).toBe(1.75);
    expect(potCoinMul(10, false)).toBe(1.9);
    expect(potCoinMul(13, false)).toBe(2.1);
    expect(potCoinMul(16, false)).toBe(1.6);
    expect(potCoinMul(19, false)).toBe(3.5);
    expect(potCoinMul(22, false)).toBe(1.6);
    expect(potCoinMul(25, false)).toBe(10);      // 金字塔罐
    expect(potCoinMul(28, false)).toBe(1);       // 地狱罐肉前不乘（:57152-57156）
    expect(potCoinMul(28, true)).toBe(4);
    expect(potCoinMul(31, false)).toBe(2);
    expect(potCoinMul(34, false)).toBe(1.25);
  });

  it('传送门 range：金字塔罐=125（wiki 1/125）、普通罐=500', () => {
    // :57163 变换 num=(n*2+1)/3 → :57185 range=500/((num+1)/2)
    const range = (style: number, hm = false) => {
      const numT = (potCoinMul(style, hm) * 2 + 1) / 3;
      return Math.floor(500 / ((numT + 1) / 2));
    };
    expect(range(0)).toBe(500);                  // 普通 1/500
    expect(range(25)).toBe(125);                 // 金字塔 1/125（全游戏最高）
    expect(range(26)).toBe(125);
    expect(range(28, true)).toBe(250);           // 地狱罐 hardmode num=4→numT=3→1/250
    expect(range(4)).toBe(461);                  // numT=7/6→500/(13/12)≈461.5
  });
});

describe('CoinPortalProj（AI_094，Projectile.cs:31696-31782）', () => {
  const mkHooks = () => {
    const drops: Array<{ x: number; y: number; key: string; n: number }> = [];
    const hooks = {
      spawnDrop: (x: number, y: number, key: string, n = 1) => {
        drops.push({ x, y, key, n });
        return null;
      },
      spawnParticles: vi.fn(),
    };
    return { hooks: hooks as unknown as GameHooks, drops };
  };

  it('初速 (0,-12)、中心定位（NewProjectile 语义）', () => {
    const p = new CoinPortalProj(1000, 500);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(-12);
    expect(p.x + p.w / 2).toBe(1000);
    expect(p.y + p.h / 2).toBe(500);
    expect(p.w).toBe(32);
    expect(p.h).toBe(32);
  });

  it('ai1=10 档：61-210t 每 10t 喷 1 金币（共 15 枚），240t 消亡', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.1); // rand(3)→0→ai1=10；尘掷恒中
    try {
      const { hooks, drops } = mkHooks();
      const p = new CoinPortalProj(0, 0);
      for (let t = 0; t < 240 && !p.dead; t++) p.fixedUpdate(1 / 60, hooks);
      expect(p.dead).toBe(true);                      // :31761-31765 Kill at ai0=240
      expect(drops.length).toBe(15);                  // (210-60)/10
      const goldKey = VANILLA_ITEM_KEY_BY_ID[73];
      expect(goldKey).toBeTruthy();
      for (const d of drops) {
        expect(d.key).toBe(goldKey);                  // item 73 Gold Coin ×1
        expect(d.n).toBe(1);
      }
    } finally {
      rnd.mockRestore();
    }
  });

  it('ai1=30 档：共 5 枚（rand(3)→2 分支）', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.9); // rand(3)→2→ai1=30；尘掷恒不中
    try {
      const { hooks, drops } = mkHooks();
      const p = new CoinPortalProj(0, 0);
      for (let t = 0; t < 300 && !p.dead; t++) p.fixedUpdate(1 / 60, hooks);
      expect(p.dead).toBe(true);
      expect(drops.length).toBe(5);                   // (210-60)/30
    } finally {
      rnd.mockRestore();
    }
  });
});
