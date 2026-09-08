// MapColors（生成期预览的 tile→色公共逻辑）确定性测试
import { describe, it, expect } from 'vitest';
import { mapColor24 } from '../src/render/MapColors';
import { World } from '../src/world/World';
import { T, TILE_DEFS } from '../src/data/tiles';
import { vanillaTileMapColor } from '../src/data/vanillaMapColors';
import { Minimap } from '../src/render/Renderer';

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0').toUpperCase();
}

describe('mapColor24', () => {
  it('优先级：实体 tile > 液体 > 墙 > 天空', () => {
    const w = new World(4, 4, 1, 't');
    const st = w.store;
    const x = 1, y = 1;
    // 天空
    expect(hex(mapColor24(st, x, y))).toBe('#91B9FF'); // 生成期天空兜底（原版渐变浅段近似）
    // 墙
    st.setWallSilent(x, y, 1);
    expect(hex(mapColor24(st, x, y))).not.toBe('#91B9FF'); // 原版墙1=(52,52,52)
    // 液体覆盖墙
    st.setLiquid(x, y, 255, 1);
    expect(hex(mapColor24(st, x, y))).toBe('#093DBF'); // 原版水 array3=(9,61,191)
    // 岩浆
    st.setLiquid(x, y, 255, 2);
    expect(hex(mapColor24(st, x, y))).toBe('#FD2003'); // 原版岩浆 array3=(253,32,3)
    // 实体 tile 覆盖液体
    st.setTileSilent(x, y, T.STONE);
    expect(hex(mapColor24(st, x, y))).toBe('#808080'); // 原版石 sheet1=(128,128,128)
  });

  it('液体需 >32 才显示（原版 Minimap 阈值,MapHelper.cs:1983）', () => {
    const w = new World(2, 2, 1, 't');
    w.store.setLiquid(0, 0, 20, 1);
    expect(hex(mapColor24(w.store, 0, 0))).toBe('#91B9FF');
    w.store.setLiquid(0, 0, 33, 1);
    expect(hex(mapColor24(w.store, 0, 0))).toBe('#093DBF');
  });

  // ── ★IIIII218：漆面（天顶/十周年 FinishTenthAnniversaryWorld 上漆结构）与
  //    背景 remix/地狱支——预览与游戏内 M 大地图（Minimap.colorFor 单源语义）同构 ──

  /** vanilla MapHelper.cs:1812-1863 MapColor 独立重抄（不 import 本仓实现；
   *  PAINT_RGB 抽样=漆 24 棕/10 紫/12 粉——PaintID.cs 与本仓 Paint.ts 同表） */
  function vanillaMapColor(base: readonly [number, number, number], ct: number): string {
    const PAINT: Record<number, [number, number, number]> = {
      24: [163, 116, 81], 10: [127, 66, 168], 12: [222, 153, 176], 5: [61, 112, 44],
    };
    let n = base[0] / 255, n2 = base[1] / 255, n3 = base[2] / 255;
    if (n2 > n) { const t = n; n = n2; n2 = t; }   // :1818-1823 交换序=中位通道
    if (n3 > n) { const t = n; n = n3; n3 = t; }
    const c = PAINT[ct]!;
    const h = (v: number) => Math.round(v * n).toString(16).padStart(2, '0').toUpperCase();
    return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
  }

  it('IIIII218 预览漆面=vanilla MapColor（PaintTheDungeon 24/PaintTheTemple 10/PaintThePyramids 12）', () => {
    const w = new World(4, 4, 1, 't');
    const st = w.store;
    const dungeon = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 41);   // BlueDungeonBrick
    const temple = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 226);   // LihzahrdBrick
    const pyramid = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 151);  // SandstoneBrick
    expect(dungeon).toBeGreaterThan(0);
    st.setTileSilent(0, 0, dungeon);
    st.paint[st.idx(0, 0)] = 24;      // PaintTheDungeon(24,24)
    st.setTileSilent(1, 0, temple);
    st.paint[st.idx(1, 0)] = 10;      // PaintTheTemple(10,5)
    st.setTileSilent(2, 0, pyramid);
    st.paint[st.idx(2, 0)] = 12;      // PaintThePyramids(12,12)
    const base = (sheet: number) => vanillaTileMapColor(sheet)!;
    expect(hex(mapColor24(st, 0, 0))).toBe(vanillaMapColor(base(41) as [number, number, number], 24));
    expect(hex(mapColor24(st, 1, 0))).toBe(vanillaMapColor(base(226) as [number, number, number], 10));
    expect(hex(mapColor24(st, 2, 0))).toBe(vanillaMapColor(base(151) as [number, number, number], 12));
    // 游戏内 M 大地图同格同色（两路径统一;Minimap.colorFor 同源表+同豁免面）
    const mm = new Minimap(w);
    expect(mm.colorFor(0, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 0, 0)));
    expect(mm.colorFor(1, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 1, 0)));
    expect(mm.colorFor(2, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 2, 0)));
  });

  it('IIIII218 漆豁免面与游戏内同构（tile sheet160 恒不吃漆;墙 21 族不吃漆）', () => {
    const w = new World(4, 4, 1, 't');
    const st = w.store;
    const mm = new Minimap(w);
    const rainbow = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 160);  // RainbowBrick
    if (rainbow > 0) {
      st.setTileSilent(0, 0, rainbow);
      st.paint[st.idx(0, 0)] = 5;
      const base = packOf(vanillaTileMapColor(160)!);
      expect(hex(mapColor24(st, 0, 0))).toBe(base);                      // 基色原样
      expect(mm.colorFor(0, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 0, 0)));
    }
    // 墙 21（GetWallType :1993 newColor=0 表）：上漆无效且两路径一致
    st.setWallSilent(1, 0, 21);
    st.paintWall[st.idx(1, 0)] = 5;
    expect(mm.colorFor(1, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 1, 0)));
  });

  it('IIIII218 背景支：remix 上表 mapType100(73,120,17) 与地狱底 (50,44,38)（GetBackgroundType cs:2020-2077）', () => {
    const w = new World(8, 8, 1, 't');
    w.groundLevel = 4; w.rockLevel = 6; w.lavaLine = 7;
    w.seedFlags.remix = true;   // Minimap.colorFor 的 remix 门=世界旗
    const bg = { groundLevel: 4, rockLevel: 6, underworld: 7, remix: true };
    expect(hex(mapColor24(w.store, 0, 3, bg))).toBe('#497811');  // remix 上表=仙人掌色(73,120,17)
    expect(hex(mapColor24(w.store, 0, 5, bg))).toBe('#583D2E');  // 土层底 (88,61,46)
    expect(hex(mapColor24(w.store, 0, 7, bg))).toBe('#322C26');  // 地狱底 (50,44,38)
    // 非 remix = 天空渐变（原样）
    expect(hex(mapColor24(w.store, 0, 3, { ...bg, remix: false }))).not.toBe('#497811');
    // 无 underworld 参数 = 旧形态（兼容;石层底兜底）
    expect(hex(mapColor24(w.store, 0, 7, { groundLevel: 4, rockLevel: 6 }))).toBe('#4A433C');
    // 游戏内 M 大地图同格同色
    const mm = new Minimap(w);
    expect(mm.colorFor(0, 3)?.toUpperCase()).toBe(hex(mapColor24(w.store, 0, 3, bg)));
    expect(mm.colorFor(0, 7)?.toUpperCase()).toBe(hex(mapColor24(w.store, 0, 7, bg)));
  });
});

function packOf(c: readonly number[]): string {
  return '#' + ((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0').toUpperCase();
}
