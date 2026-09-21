// 瓦罐钱币传送门（CoinPortal proj 518 / AI_094）+ style 钱币乘子链对账。
// 语义源：WorldGen.cs:57649-57661（num 变换 → range=500/((num+1)/2) →
// RollLuck==0 短路喷传送门）、Projectile.cs:33488-33571（AI_094 四阶段机）。
import { describe, expect, it, vi } from 'vitest';
import { potCoinMul } from '../src/core/Game';
import { CoinPortalProj } from '../src/entities/CoinPortalProj';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';
import type { Renderer } from '../src/render/Renderer';
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

// ★BJ253（2026-09-21）绘制/记账面：GetAlpha type==518（Projectile.cs:80932-80935）
//   = Color(200·n6,200·n6,200·n6,100·n6)——混合权重=100·n6/255（旧实现 n6 全强度
//   =过实 2.55×）；srcRect=整帧 34×34 含 padding（destination=帧原尺寸×scale）；
//   尘 velocity=Zero（:33565）+默认重力（旧 spawnParticles speed=0 走缺省 vy=-1 上漂
//   =方向反）；projId=518 挂账（CutTiles 收口 vid+渲染分层）。
describe('BJ253 绘制/记账面（GetAlpha 518 + 整帧 srcRect + 尘 Zero 速）', () => {
  const mkDrawCtx = () => {
    const state: { alpha: number; drawArgs?: unknown[] } = { alpha: 1 };
    const ctx: Record<string, unknown> = {
      save: () => {}, restore: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
      drawImage: (...a: unknown[]) => { state.drawArgs = a; },
      fillStyle: '', imageSmoothingEnabled: false,
    };
    Object.defineProperty(ctx, 'globalAlpha', {
      get: () => state.alpha,
      set: (v: number) => { state.alpha = v; },
    });
    return { state, ctx: ctx as unknown as CanvasRenderingContext2D };
  };
  const draw = (p: CoinPortalProj, c: CanvasRenderingContext2D) =>
    p.draw({ ctx: c } as unknown as Renderer, {} as never);

  it('projId=518 挂账（CutTiles 收口 vid+渲染分层消费）', () => {
    expect(new CoinPortalProj(0, 0).projId).toBe(518);
  });

  it('混合权重 = n6×100/255（GetAlpha A 分量），淡入稳态 α=55 → ≈0.3076', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.9);   // 尘掷恒不中,ai1=30
    try {
      const { state, ctx } = mkDrawCtx();
      setProjSpriteOverride(518, { width: 34, height: 136 } as unknown as HTMLImageElement);
      const p = new CoinPortalProj(0, 0);
      for (let t = 0; t < 41; t++) p.fixedUpdate(1 / 60, { spawnParticles: vi.fn() } as unknown as GameHooks);
      expect(p['alpha']).toBe(55);                  // 255-40×5（:33499-33502）
      draw(p, ctx);
      const n6 = (255 - 55) / 255;
      expect(state.alpha).toBeCloseTo(n6 * (100 / 255), 6);
      // 整帧 srcRect：destination = 帧原尺寸 34×scale（旧 32×scale=缩 6%）
      const a = state.drawArgs as unknown[];
      expect(a[1]).toBe(0);                          // sx
      expect(a[2]).toBe(68);                         // sy=frame(41t→2)×34
      expect(a[3]).toBe(34); expect(a[4]).toBe(34);  // sW/sH=整帧
      expect(a[5]).toBeCloseTo(-17); expect(a[6]).toBeCloseTo(-17); // 中心定位
      expect(a[7]).toBe(34); expect(a[8]).toBe(34);  // dW/dH=34×scale(1)
    } finally {
      rnd.mockRestore();
    }
  });

  it('尘 velocity=Zero：spawnParticles 显式 vx=0/vy=0（grav 走缺省 0.05=dust 默认）', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.1);   // 尘掷恒中（<1/3）
    try {
      const sp = vi.fn();
      const p = new CoinPortalProj(0, 0);
      for (let t = 0; t < 60; t++) p.fixedUpdate(1 / 60, { spawnParticles: sp } as unknown as GameHooks);
      expect(sp).toHaveBeenCalled();
      const last = sp.mock.calls[sp.mock.calls.length - 1] as unknown[];
      const opts = last[5] as { vx?: number; vy?: number; life?: number };
      expect(opts.vx).toBe(0);
      expect(opts.vy).toBe(0);                      // 旧实现缺省 vy=-1 上漂=反
      expect(opts.life).toBe(24);
      // 圆周位置半径 = (w,h)·scale·0.85/2（:33560-33562）——p 出生 (0,0) 中心=(0,0)
      const x = last[0] as number, y = last[1] as number;
      expect(Math.hypot(x, y)).toBeCloseTo(32 * 0.85 / 2, 6);
    } finally {
      rnd.mockRestore();
    }
  });
});
