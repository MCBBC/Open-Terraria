// MapColors（生成期预览的 tile→色公共逻辑）确定性测试
import { describe, it, expect } from 'vitest';
import { mapColor24 } from '../src/render/MapColors';
import { World } from '../src/world/World';
import { T, TILE_DEFS, WALL_DEFS } from '../src/data/tiles';
import { vanillaTileMapColor, vanillaTileMapColorOption, vanillaWallMapColor } from '../src/data/vanillaMapColors';
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
   *  PAINT 抽样=WorldGen.paintColor 逐字：24 深粉=12 粉 (255,0,127)/10 深紫 (127,0,255)——
   *  深层漆与浅层同 RGB,深浅差在渲染端 shader 不在小地图） */
  function vanillaMapColor(base: readonly [number, number, number], ct: number): string {
    const PAINT: Record<number, [number, number, number]> = {
      24: [255, 0, 127], 10: [127, 0, 255], 12: [255, 0, 127], 5: [0, 255, 0],
      25: [75, 75, 75],   // BlackPaint（墙漆 25=神庙压力板格实况,本批 77 格定谳签名）
    };
    let n = base[0] / 255, n2 = base[1] / 255, n3 = base[2] / 255;
    if (n2 > n) { const t = n; n = n2; n2 = t; }   // :1818-1823 交换序=中位通道
    if (n3 > n) { const t = n; n = n3; n3 = t; }
    const c = PAINT[ct]!;
    // C# (byte)(float) 强转=截断（:1855-1857）——与本仓 mapPaintColor `|0` 同口径
    const h = (v: number) => Math.trunc(v * n).toString(16).padStart(2, '0').toUpperCase();
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
      // 原版 array[160] 色表=Initialize 循环整拷 627（extractor IIII218 前已补）——
      // 漆 5 恒不吃（`num == 160 → newColor = 0`,GetTileType :1965-1968）→ 同格无漆孪生同色
      st.paint[st.idx(0, 0)] = 5;
      st.setTileSilent(3, 0, rainbow);
      expect(hex(mapColor24(st, 0, 0))).toBe(hex(mapColor24(st, 3, 0)));   // 与无漆孪生同色
      expect(mm.colorFor(0, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 0, 0)));
    }
    // ★IIIII223 F-2 勘误：墙 21/88-93/168/241(+318) 非「不吃漆墙族」——实为玻璃族
    // wallLookup=0 哨兵，原版地图不画（落穿背景），上漆亦无效；两路径一致落穿
    st.setWallSilent(1, 0, 21);
    st.paintWall[st.idx(1, 0)] = 5;
    const bgT21 = { groundLevel: 1, rockLevel: 2 };
    expect(hex(mapColor24(st, 1, 0, bgT21)).toUpperCase()).toBe(mm.colorFor(1, 0)?.toUpperCase());
    expect(hex(mapColor24(st, 1, 0, bgT21)).toUpperCase()).not.toBe(WALL_DEFS[21].mapColor.toUpperCase());
  });

  it('IIIII218 tileLookup=0 落穿：原版无色表 sheet(135 压力板等)不画 tile → 墙/背景（GetTileType cs:1936/:1961）', () => {
    const w = new World(4, 4, 1, 't');
    const st = w.store;
    const plate = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 135);   // PressurePlates
    expect(plate).toBeGreaterThan(0);
    const mm = new Minimap(w);
    // 无墙：落穿到背景（tile 本体不上图——不落 #FD7272 def 兜底）。
    // ★两路径 bg 缺省语义不同：Minimap.colorFor 无世界面=天空渐变 y=0 端点
    // (#3228FF)、预览 mapColor24 无 bg=SKY_FALLBACK——真实世界两者都有世界面,
    // 故对拍用显式 bg（同世界面口径）
    st.setTileSilent(0, 0, plate);
    st.paint[st.idx(0, 0)] = 22;   // 压力板上的漆也无效——tile 本体不上图
    const bgT = { groundLevel: 1, rockLevel: 2 };
    expect(hex(mapColor24(st, 0, 0))).not.toBe('#FD7272');   // 不吃 def 兜底=落穿成立
    expect(hex(mapColor24(st, 0, 0, bgT)).toUpperCase()).toBe(mm.colorFor(0, 0)?.toUpperCase());
    // 有墙 87 + 墙漆 25（神庙压力板实况,本批 77 格定谳签名）= 墙漆色（vanilla 同）
    st.setWallSilent(1, 0, 87);
    st.paintWall[st.idx(1, 0)] = 25;
    st.setTileSilent(1, 0, plate);
    st.paint[st.idx(1, 0)] = 22;
    const wallBase = vanillaWallMapColor(87)!;
    expect(hex(mapColor24(st, 1, 0))).toBe(vanillaMapColor(wallBase as [number, number, number], 25));
    expect(mm.colorFor(1, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 1, 0)));
    // 自研 tile（无 vanilla.sheet）保留 def.mapColor 兜底（vanilla 语义外延）
    const custom = TILE_DEFS.findIndex((d) => d && d.vanilla?.sheet === undefined && d.mapColor);
    if (custom > 0) {
      st.setTileSilent(2, 0, custom);
      expect(hex(mapColor24(st, 2, 0))).toBe(TILE_DEFS[custom].mapColor.toUpperCase());
      expect(mm.colorFor(2, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 2, 0)));
    }
  });

  it('IIIII218 背景支：remix 上表 mapType100(73,120,17) 与地狱底 (50,44,38)（GetBackgroundType cs:2020-2077）', () => {    const w = new World(8, 8, 1, 't');
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

  // ── ★IIIII223 F-2：wallLookup=0 玻璃族落穿（MapHelper.cs Initialize :1737-1754 +
  //    GetWallType :2003 baseType=0 + CreateMapTile :1913-1917 背景支）──
  it('IIIII223 F-2 玻璃族墙(21/88/318)原版地图不画 → 落穿背景,漆无效,def.mapColor 兜底废除', () => {
    const w = new World(4, 4, 1, 't');
    const st = w.store;
    const mm = new Minimap(w);
    const bgT = { groundLevel: 1, rockLevel: 2 };
    st.setWallSilent(0, 0, 21);
    st.paintWall[st.idx(0, 0)] = 5;          // 上漆亦无效——墙本体不上图
    st.setWallSilent(1, 0, 88);
    st.setWallSilent(2, 0, 318);             // 回声墙（218 批漏列的第十员）
    st.setWallSilent(3, 0, 1);               // 对照组：石墙照画 (52,52,52)
    const ids = [21, 88, 318];
    for (let x = 0; x < 3; x++) {
      expect(hex(mapColor24(st, x, 0, bgT)).toUpperCase()).toBe(mm.colorFor(x, 0)?.toUpperCase());
      expect(hex(mapColor24(st, x, 0, bgT)).toUpperCase()).not.toBe(WALL_DEFS[ids[x]].mapColor.toUpperCase());
    }
    expect(hex(mapColor24(st, 3, 0)).toUpperCase()).toBe(packOf(vanillaWallMapColor(1)!));
    expect(mm.colorFor(3, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 3, 0)));
  });

  // ── ★IIIII223 F-3：GetTileType baseType=0/换色残余臂（Terraria.Map/MapHelper.cs :1949-1964）──
  it('IIIII223 F-3① 蛛网(51/697) (x+y)%2 棋盘半隐：偶格落穿背景,奇格照画', () => {
    const w = new World(6, 4, 1, 't');
    const st = w.store;
    const mm = new Minimap(w);
    const bgT = { groundLevel: 1, rockLevel: 2 };
    const web = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 51);
    const webFake = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 697);
    expect(web).toBeGreaterThan(0);
    st.setTileSilent(0, 0, web);       // (0+0)%2==0 → 落穿
    st.setTileSilent(1, 0, web);       // 奇 → 照画 (192,202,203)
    if (webFake > 0) {
      st.setTileSilent(2, 0, webFake); // 偶 → 落穿
      st.setTileSilent(3, 0, webFake); // 奇 → 照画
    }
    expect(hex(mapColor24(st, 0, 0, bgT)).toUpperCase()).toBe(mm.colorFor(0, 0)?.toUpperCase());
    expect(hex(mapColor24(st, 1, 0)).toUpperCase()).toBe(packOf(vanillaTileMapColor(51)!));
    expect(mm.colorFor(1, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 1, 0)));
    if (webFake > 0) {
      expect(hex(mapColor24(st, 2, 0, bgT)).toUpperCase()).toBe(mm.colorFor(2, 0)?.toUpperCase());
      expect(hex(mapColor24(st, 3, 0)).toUpperCase()).toBe(packOf(vanillaTileMapColor(697)!));
    }
  });

  it('IIIII223 F-3② 平台(19) frameY==864 底柱格不上图（黑色 option1 被 baseType=0 屏蔽）', () => {
    const w = new World(4, 4, 1, 't');
    const st = w.store;
    const mm = new Minimap(w);
    const bgT = { groundLevel: 1, rockLevel: 2 };
    const plat = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 19);
    expect(plat).toBeGreaterThan(0);
    st.setTileSilent(0, 0, plat, 0, 864);   // 底柱格 → 落穿
    st.setTileSilent(1, 0, plat, 0, 0);     // 平台面 → (191,142,111)
    expect(hex(mapColor24(st, 0, 0, bgT)).toUpperCase()).toBe(mm.colorFor(0, 0)?.toUpperCase());
    expect(hex(mapColor24(st, 0, 0)).toUpperCase()).not.toBe('#000000');   // 不吃被屏蔽的黑色 option1
    expect(hex(mapColor24(st, 1, 0)).toUpperCase()).toBe(packOf(vanillaTileMapColor(19)!));
    expect(mm.colorFor(1, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 1, 0)));
  });

  it('IIIII223 F-3③ 长苔(184) frameX/22==10 → 627 苔色九档 option=(x+y)%9,漆照吃', () => {
    const w = new World(8, 4, 1, 't');
    const st = w.store;
    const mm = new Minimap(w);
    const moss = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 184);
    expect(moss).toBeGreaterThan(0);
    st.setTileSilent(0, 0, moss, 220, 0);   // 220/22==10 → disco 苔 → 627[(0+0)%9]
    st.setTileSilent(1, 0, moss, 220, 0);   // 627[(1+0)%9]
    st.setTileSilent(2, 0, moss, 0, 0);     // 变体 0 → 184 option0 (29,106,88)
    expect(hex(mapColor24(st, 0, 0)).toUpperCase()).toBe(packOf(vanillaTileMapColorOption(627, 0)!));
    expect(hex(mapColor24(st, 1, 0)).toUpperCase()).toBe(packOf(vanillaTileMapColorOption(627, 1)!));
    expect(hex(mapColor24(st, 2, 0)).toUpperCase()).toBe(packOf(vanillaTileMapColor(184)!));
    expect(mm.colorFor(0, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 0, 0)));
    expect(mm.colorFor(2, 0)?.toUpperCase()).toBe(hex(mapColor24(st, 2, 0)));
    // 漆照吃（换色后 num=627≠160 豁免面）：disco 苔上漆 5 = 627 底色 × (0,255,0)
    st.paint[st.idx(3, 0)] = 5;
    st.setTileSilent(3, 0, moss, 220, 0);
    const c627 = vanillaTileMapColorOption(627, (3 + 0) % 9)!;
    expect(hex(mapColor24(st, 3, 0)).toUpperCase()).toBe(vanillaMapColor(c627 as [number, number, number], 5));
  });
});

function packOf(c: readonly number[]): string {
  return '#' + ((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0').toUpperCase();
}
