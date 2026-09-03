// ★W-A4（2026-09-03）LiquidCache.IsSolid 致动门回归：
// 原版 LiquidRenderer.cs:198 `ptr2->IsSolid = WorldGen.SolidOrSlopedTile(tile)`，
// SolidOrSlopedTile（WorldGen.cs:70515-70537）尾门 = IL_004c `return !tile.inActive()`
// ——致动格（inActive 置位）原版不算实心，液体贴其表面按空格成形。
// 仓内 isSolidA（VanillaLiquidRenderer P1 两处扫描）曾漏致动门；现谓词单源化到
// liquidCacheIsSolid（导出纯函数）并锁真值表 + 真实 TileStore 致动写入路径往返。
import { describe, it, expect, beforeAll } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';
import { drawVanillaLiquids, liquidCacheIsSolid } from '../src/render/VanillaLiquidRenderer';
import { TILE_DEFS } from '../src/data/tiles';

const dirtId = TILE_DEFS.findIndex((d) => d?.key === 'dirt');

describe('liquidCacheIsSolid 真值表（SolidOrSlopedTile :70515-70537 1:1）', () => {
  it('active ∧ 未致动 ∧ tileSolid → 实心；三门缺一即非实心', () => {
    expect(liquidCacheIsSolid(1, 0, true)).toBe(true);      // 常规实心格
    expect(liquidCacheIsSolid(1, TileStore.WIRE_ACTUATED, true)).toBe(false);  // ★致动门
    expect(liquidCacheIsSolid(0, 0, true)).toBe(false);     // 幽灵格（flags=0 残型）
    expect(liquidCacheIsSolid(1, 0, false)).toBe(false);    // 非实心（平台/家具）
    expect(liquidCacheIsSolid(1, 0, undefined)).toBe(false); // 越界 type（defs 缺表）
  });

  it('平台/家具 defs 层 solid:false 已折 tileSolid∧!tileSolidTop（SolidOrSlopedTile 前门）', () => {
    const platformId = TILE_DEFS.findIndex((d) => d?.key === 'platform');
    expect(TILE_DEFS[platformId]?.solid).toBe(false);
    expect(TILE_DEFS[dirtId]?.solid).toBe(true);
  });
});

describe('真实 TileStore 致动写入路径往返（Wiring.DeActive/ReActive 同位）', () => {
  it('setTile 实心 → 谓词真；setActuated(true) → 位翻转且谓词变假；复位恢复', () => {
    const st = new TileStore(20, 20);
    st.setTile(5, 10, dirtId);
    const i = st.idx(5, 10);
    expect(st.flags[i]).not.toBe(0);
    expect(liquidCacheIsSolid(st.flags[i], st.wire[i], TILE_DEFS[st.type[i]]?.solid)).toBe(true);
    st.setActuated(5, 10, true);
    expect((st.wire[i] & TileStore.WIRE_ACTUATED) !== 0).toBe(true);
    expect(st.isActuated(5, 10)).toBe(true);
    expect(liquidCacheIsSolid(st.flags[i], st.wire[i], TILE_DEFS[st.type[i]]?.solid)).toBe(false);
    st.setActuated(5, 10, false);
    expect(liquidCacheIsSolid(st.flags[i], st.wire[i], TILE_DEFS[st.type[i]]?.solid)).toBe(true);
  });
});

// ---- 准备管线冒烟（isSolidA 消费面：致动池底不炸、双 prep 路径同走） ----

function poolStore(): TileStore {
  const st = new TileStore(60, 40);
  for (let x = 0; x < 60; x++) st.setTile(x, 30, dirtId);         // 池底
  for (let x = 20; x < 40; x++) {
    for (let y = 24; y < 30; y++) st.setLiquid(x, y, 255, 1);     // 满水段
  }
  return st;
}

const noopCtx = () => {
  const stub: Record<PropertyKey, unknown> = {};
  return new Proxy(stub, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        void args;
        if (prop === 'getTransform') return { a: 1, b: 0, c: 0, d: 0, e: 0, f: 0 };
        if (prop === 'getImageData') return { data: new Uint8ClampedArray(4) };
        return undefined;
      };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
};

beforeAll(() => {
  if (!(globalThis as unknown as { Image?: unknown }).Image) {
    (globalThis as unknown as { Image: unknown }).Image = class {
      src = ''; width = 0; height = 0; complete = false;
      addEventListener() { /* noop */ }
      removeEventListener() { /* noop */ }
    };
  }
});

describe('drawVanillaLiquids 消费面冒烟（致动池底,needsPrep 首扫/复用失效重扫双副本）', () => {
  const atlas = { width: 256, height: 256, ensureVImage: () => ({ width: 256, height: 256 }) } as unknown as SpriteAtlas;

  it('池底致动 → 管线不炸（needsPrep 首扫）', () => {
    const st = poolStore();
    st.setActuated(25, 30, true);
    expect(() => drawVanillaLiquids(noopCtx(), atlas, st, 20, 8, 8, 44, 34, 1000,
      false, 0, 0, undefined, false, undefined, undefined)).not.toThrow();
  });

  it('同帧 token 复用失效重扫副本（token 更换）→ 管线不炸', () => {
    const st = poolStore();
    st.setActuated(26, 30, true);
    expect(() => {
      drawVanillaLiquids(noopCtx(), atlas, st, 20, 8, 8, 44, 34, 1000,
        false, 0, 0, undefined, false, undefined, 7);
      st.setActuated(26, 30, false);          // token 间改致动态
      drawVanillaLiquids(noopCtx(), atlas, st, 20, 8, 8, 44, 34, 1000,
        false, 0, 0, undefined, false, undefined, 8);
    }).not.toThrow();
  });
});
