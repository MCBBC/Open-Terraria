// SW-FX12（2026-09-10）油漆/涂层补债批回归——1457 行号锚见各断言注释。
// 覆盖四面：
//   A 数据面  陨石转化清漆/方块涂层（WorldGen.meteor :6387-6390/:6457-6460/:6482-6485）
//   B 使用链  冷却域只在改写成功拍（ApplyPaint/ApplyCoating :42283-42345 / TryScraping
//             :42201-42208 / LongMoss :42161）；苔藓掉落=世界掉落物（:42187
//             RequestNewItem）；花靴 CopyPaintAndCoating（Tile.cs:869-873 ×
//             Player.cs:14234/:14248/:14259/:14276/:14288）
//   C 渲染面  树族冠/枝/棕榈冠特判组接线（TilePaintSystemV2.cs:97/:113
//             GetTreeFoliageSettings 消费）+ 荧光叠层摆动族补画（DrawTrees :8290/
//             :8345/:8455 fullbright→White 对特殊绘制路径同样生效）
// 变异证红说明：各用例注释标注"旧实现会怎样"——判别力来自新旧行为可观测分叉。
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Inventory } from '../src/items/Inventory';
import { VI } from '../src/data/itemKeys';
import { placeMeteor } from '../src/world/MeteorFall';
import { Game } from '../src/core/Game';
import {
  applyPaintTint, applyPaintTintSpecial, SPECIAL_PAINT_SETTINGS, getTreeFoliageSettings,
} from '../src/world/Paint';

// TileTint mock：C 面结构断言用（tintedVanillaRegion 第 8 参=特判组设置），
// null/undefined 返回让 blit 落回直绘（C2 录制 ctx 可捕获 drawImage）。
vi.mock('../src/render/TileTint', () => ({
  tintRegion: vi.fn(),
  tintedVanillaRegion: vi.fn(() => null),
}));
import { tintedVanillaRegion } from '../src/render/TileTint';
import { drawTreeCell } from '../src/render/VanillaTiler';
import { ChunkCache } from '../src/render/ChunkCache';
import type { VanillaWallTiler } from '../src/render/VanillaWallTiler';
import type { AutoTiler } from '../src/render/AutoTiler';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';

const DIRT = TILE_BY_KEY['dirt']!;
const itemOf = (vid: number) => ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]]];

// ==================== A. 陨石转化清漆/涂层（WorldGen.meteor） ====================

describe('SW-FX12 A. 陨石转化清漆/方块涂层（paintTile(0)+paintCoatTile(0) :6387-6390）', () => {
  function host(w: World, seed: number) {
    let s = seed >>> 0;
    const rand = () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      w: w.w, h: w.h, spawnX: Math.floor(w.w / 2), groundLevel: 30, rockLevel: 50,
      store: w.store, players: [] as Array<{ x: number; y: number; w: number; h: number }>,
      npcs: [] as Array<{ x: number; y: number; w: number; h: number }>,
      rand, int: (a: number, b: number) => a + Math.floor(rand() * (b - a)),
      announce: () => {},
    };
  }

  it('转化格（type→37）必丢方块漆与方块涂层位；墙漆原版不动（paintWall 不在清域）', () => {
    const w = new World(80, 60, 7, 'fx12-meteor');
    const st = w.store;
    const h = host(w, 0xC0FFEE);
    // 落点区全铺实心泥土 + 全区红漆 + 荧光块涂层 + 墙漆（墙侧原版不清）
    for (let x = 10; x < 70; x++) {
      for (let y = 15; y < 45; y++) {
        st.setTileSilent(x, y, DIRT);
        st.setWallSilent(x, y, 4);
        st.setPaintSilent(x, y, 1);
        st.setPaintWallSilent(x, y, 9);
        st.setCoatSilent(x, y, TileStore.COAT_FULLBRIGHT_BLOCK, TileStore.COAT_FULLBRIGHT_BLOCK);
      }
    }
    placeMeteor(h, 40, 30);
    const MET = TILE_BY_KEY['ore_meteorite']!;
    let converted = 0;
    for (let x = 10; x < 70; x++) {
      for (let y = 15; y < 45; y++) {
        const i = st.idx(x, y);
        if (st.type[i] !== MET) continue;
        converted++;
        expect(st.paint[i], `陨石格 (${x},${y}) 应清漆`).toBe(0);            // :6387 paintTile(0)
        expect(st.coat[i] & TileStore.COAT_BLOCK_MASK, `(${x},${y}) 应清涂层位`).toBe(0); // :6388 paintCoatTile(0)
        expect(st.paintWall[i], `(${x},${y}) 墙漆应存活（原版只清方块侧）`).toBe(9);
      }
    }
    expect(converted, '陨石面应有转化格（sanity）').toBeGreaterThan(0);
  });

  it('变异证红：若漏清（旧实现），活性→活性换型保留 paint=1/coat=8——上一用例必炸红', () => {
    // 独立推演旧实现语义：setTileSilent 活性→活性换型保漆保涂层（tests/paint.test.ts 已锁）
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    st.setPaintSilent(1, 1, 1);
    st.setCoatSilent(1, 1, TileStore.COAT_FULLBRIGHT_BLOCK, TileStore.COAT_FULLBRIGHT_BLOCK);
    st.setTileSilent(1, 1, TILE_BY_KEY['ore_meteorite']!);
    expect(st.paint[st.idx(1, 1)]).toBe(1);   // = 旧行为：漏清
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_FULLBRIGHT_BLOCK).toBe(8);
  });
});

// ==================== B. 使用链（冷却时序 / 苔藓掉落 / 花靴漆复制） ====================

type Drop = { x: number; y: number; key: string; n: number };
type G = Record<string, unknown> & {
  tryUsePaintTool: (x: number, y: number, d: (typeof ITEM_DEFS)[number]) => void;
  tryPainting: (x: number, y: number, wall: boolean, dust: unknown) => boolean;
  flowerBootsPlaceFlowers: (x: number, y: number) => void;
  player: { useTime: number; inv: Inventory; equipStats: Record<string, unknown>;
    buffs: { has: () => boolean; wellFedTier: number; hungerPickSpeed: number }; usedAmbrosia: boolean };
  drops: Drop[];
};

function mkPaintGame(): { g: G; w: World; st: TileStore; inv: Inventory; drops: Drop[] } {
  const w = new World(48, 64, 20, 'fx12-use');
  const g = Object.create(Game.prototype) as unknown as G;
  g.netCanEditTile = () => true;
  g.world = w;
  g.player = {
    useTime: 0, inv: new Inventory(), equipStats: {},
    buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, usedAmbrosia: false,
  };
  g.inTileRange = () => true;
  g.blockRange = () => 5;
  g.spawnParticles = () => {};
  g.cb = { onInventoryChanged: () => {} };
  const drops: Drop[] = [];
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ x, y, key, n }); return null; };
  g.drops = drops;
  // LongMoss 的 KillTile 桩：只清格（隔离真实 KillTile 掉落链，本批只锁刮刀支语义）
  g.breakTile = (x: number, y: number) => { (w.store as TileStore).setTile(x, y, 0); };
  return { g, w, st: w.store, inv: g.player.inv, drops };
}

describe('SW-FX12 B1. 油漆冷却域只在改写成功拍（ApplyPaint :42342 成功支才 ApplyItemTime）', () => {
  it('有漆+异色：上漆成功 → 消耗 1 + useTime=10（tileSpeed=1 无增益）', () => {
    const { g, st, inv } = mkPaintGame();
    st.setTileSilent(10, 10, DIRT);
    inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1073]], 10);   // RedPaint → 弹药栏 54
    g.tryUsePaintTool(10, 10, itemOf(1071));                   // Paintbrush
    expect(st.paint[st.idx(10, 10)]).toBe(1);
    expect(inv.slots[54]!.stack).toBe(9);
    expect(g.player.useTime).toBe(10);
  });

  it('同色空拍：不设冷却（useTime 保持 0）不消耗——旧实现先 applyItemTime 会吃 10 拍幻影冷却', () => {
    const { g, st, inv } = mkPaintGame();
    st.setTileSilent(10, 10, DIRT);
    st.setPaintSilent(10, 10, 1);                              // 已是红
    inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1073]], 10);
    g.tryUsePaintTool(10, 10, itemOf(1071));
    expect(g.player.useTime).toBe(0);                          // ★分叉点：旧=10
    expect(inv.slots[54]!.stack).toBe(10);                     // 不消耗（:42333 同色守卫）
  });

  it('无漆空拍：不设冷却不上漆（FindPaintOrCoating → null，:42269）', () => {
    const { g, st } = mkPaintGame();
    st.setTileSilent(10, 10, DIRT);
    g.tryUsePaintTool(10, 10, itemOf(1071));
    expect(st.paint[st.idx(10, 10)]).toBe(0);
    expect(g.player.useTime).toBe(0);
  });

  it('滚筒刷墙：wall 通道（:42220 wall>0 门；ApplyPaint wall 支 :42320）', () => {
    const { g, st, inv } = mkPaintGame();
    st.setWallSilent(12, 10, 4);
    inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1081]], 5);     // BluePaint
    g.tryUsePaintTool(12, 10, itemOf(1072));                   // PaintRoller
    expect(st.paintWall[st.idx(12, 10)]).toBe(9);
    expect(inv.slots[54]!.stack).toBe(4);
    expect(g.player.useTime).toBe(10);
    // 同色墙再刷：不消耗不冷却
    g.player.useTime = 0;
    g.tryUsePaintTool(12, 10, itemOf(1072));
    expect(g.player.useTime).toBe(0);
    expect(inv.slots[54]!.stack).toBe(4);
  });

  it('刮漆器：先块后墙两通道各自设冷却（TryScraping :42201-42208）', () => {
    const { g, st } = mkPaintGame();
    st.setTileSilent(14, 10, DIRT);
    st.setWallSilent(14, 10, 4);
    st.setPaintSilent(14, 10, 5);
    st.setPaintWallSilent(14, 10, 9);
    g.tryUsePaintTool(14, 10, itemOf(1100));                   // PaintScraper
    expect(st.paint[st.idx(14, 10)]).toBe(0);                  // 块漆清
    expect(st.paintWall[st.idx(14, 10)]).toBe(9);              // 墙漆本拍不动
    expect(g.player.useTime).toBe(10);
    g.player.useTime = 0;
    g.tryUsePaintTool(14, 10, itemOf(1100));
    expect(st.paintWall[st.idx(14, 10)]).toBe(0);              // 墙漆清
    expect(g.player.useTime).toBe(10);
  });

  it('涂层涂刷：荧光涂料改写成功才扣件+冷却（ApplyCoating :42283-42313）', () => {
    const { g, st, inv } = mkPaintGame();
    st.setTileSilent(16, 10, DIRT);
    inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4668]], 3);     // GlowPaint
    g.tryUsePaintTool(16, 10, itemOf(1071));
    expect(st.coat[st.idx(16, 10)] & TileStore.COAT_FULLBRIGHT_BLOCK).toBe(8);
    expect(inv.slots[54]!.stack).toBe(2);
    expect(g.player.useTime).toBe(10);
    // 幂等空拍（已置位 → paintCoatTile false → 不扣不冷却）
    g.player.useTime = 0;
    g.tryUsePaintTool(16, 10, itemOf(1071));
    expect(g.player.useTime).toBe(0);
    expect(inv.slots[54]!.stack).toBe(2);
  });

  it('tryPainting 返回值 = 是否消耗（分派口冷却门的数据源）', () => {
    const { g, st, inv } = mkPaintGame();
    st.setTileSilent(18, 10, DIRT);
    inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1073]], 1);
    expect(g.tryPainting(18, 10, false, () => {})).toBe(true);
    expect(g.tryPainting(18, 10, false, () => {})).toBe(false);   // 同色
  });
});

describe('SW-FX12 B2. LongMoss 苔藓掉落=世界掉落物（:42187 RequestNewItem）', () => {
  it('刮苔藓 → spawnDrop 于格左上角 (x*16,y*16)——旧实现 p.inv.add 直接入包', () => {
    const { g, st, inv, drops } = mkPaintGame();
    const moss = TILE_BY_KEY['v_184_moss_plants']!;
    st.setTileSilent(16, 10, moss, 154, 0);                    // frameX/22 = col 7 → 4378
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);   // 1/9 掷中
    try {
      g.tryUsePaintTool(16, 10, itemOf(1100));
      expect(st.type[st.idx(16, 10)]).toBe(0);                 // KillTile 已清
      expect(g.player.useTime).toBe(10);                       // ApplyItemTime(sItem) :42161
      expect(drops).toHaveLength(1);
      expect(drops[0]).toMatchObject({ key: VI(4378), n: 1, x: 16 * 16, y: 10 * 16 });
      // 不入包（★分叉点：旧实现 inv.add 后槽位非空）
      expect(inv.slots.filter((s) => s !== null).length).toBe(0);
    } finally {
      rnd.mockRestore();
    }
  });

  it('8/9 不掉落（:42166 Main.rand.Next(9)==0 门），冷却照设（:42161 先于掷）', () => {
    const { g, st, drops } = mkPaintGame();
    st.setTileSilent(16, 10, TILE_BY_KEY['v_184_moss_plants']!, 154, 0);
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5); // floor(0.5*9)=4 ≠ 0
    try {
      g.tryUsePaintTool(16, 10, itemOf(1100));
      expect(g.player.useTime).toBe(10);
      expect(drops).toHaveLength(0);
    } finally {
      rnd.mockRestore();
    }
  });
});

describe('SW-FX12 B3. 花靴生花 CopyPaintAndCoating（Tile.cs:869-873 × :14234 等）', () => {
  it('基座草的方块漆+方块涂层两位随植株复制；墙侧不复制（CopyPaintAndCoating 只搬块侧）', () => {
    const { g, st } = mkPaintGame();
    st.setTileSilent(20, 11, TILE_BY_KEY['grass']!);
    st.setWallSilent(20, 11, 4);
    st.setPaintSilent(20, 11, 1);
    st.setPaintWallSilent(20, 11, 9);
    st.setCoatSilent(20, 11, TileStore.COAT_FULLBRIGHT_BLOCK, TileStore.COAT_FULLBRIGHT_BLOCK);
    g.flowerBootsPlaceFlowers(20, 10);
    const hi = st.idx(20, 10);
    expect(st.type[hi]).toBe(TILE_BY_KEY['v_3_forest_short_plants']);
    expect(st.paint[hi]).toBe(1);                              // ★分叉点：旧=0（未复制）
    expect(st.coat[hi] & TileStore.COAT_FULLBRIGHT_BLOCK).toBe(8);
    expect(st.paintWall[st.idx(20, 10)]).toBe(0);              // 墙漆不随复制
  });
});

// ==================== C. 渲染面：冠/枝特判组接线 + 荧光叠层摆动族 ====================

const recCtx = () => {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const ctx = {
    fillStyle: '', globalAlpha: 1, imageSmoothingEnabled: false,
    fillRect: (...a: unknown[]) => calls.push({ fn: 'fillRect', args: a }),
    drawImage: (...a: unknown[]) => calls.push({ fn: 'drawImage', args: a }),
    save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    beginPath: () => {}, rect: () => {}, clip: () => {}, clearRect: () => {},
    putImageData: () => {}, setTransform: () => {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

const fakeImg = (w: number, h: number) => ({ width: w, height: h }) as unknown as ImageBitmap;
const atlasStub = (map: Record<string, { width: number; height: number }>) =>
  ({
    ensureVImage: (name: string) => (map[name] ? fakeImg(map[name].width, map[name].height) : null),
    vmeta: () => null,
    vframe: () => null,
  }) as unknown as SpriteAtlas;

describe('SW-FX12 C1. 树族冠/枝特判组接线（GetTreeFoliageSettings，TilePaintSystemV2.cs:97/:113）', () => {
  beforeEach(() => { vi.mocked(tintedVanillaRegion).mockClear(); });

  it('普通树冠（crown=0）paint=1 → 特判组 WoodPurity（foliageStyle 恒 0）', () => {
    const w = new World(48, 40, 3, 'fx12-foliage');
    w.store.setTileSilent(10, 10, TILE_BY_KEY['tree']!, 22, 198);  // 冠标记帧（树下无草→crown 0）
    const { ctx } = recCtx();
    drawTreeCell(ctx, atlasStub({ 'vanilla/Tree_Tops_0.png': { width: 246, height: 80 } }),
      w.store, 10, 10, 22, 198, 0, 0, 5, true,
      { treeX: [], treeStyle: [], treeTops: [], worldSurface: 30, worldW: 48 }, 0, undefined, 1);
    // tintedVanillaRegion(img, sx, sy, sw, sh, paint, isWall, special) —— special = 第 8 参
    const call = vi.mocked(tintedVanillaRegion).mock.calls.find((c) => c[5] === 1);
    expect(call, '冠绘制应走源染色通道').toBeTruthy();
    expect(call![6]).toBe(false);                              // isWall=false
    expect(call![7]).toBe(SPECIAL_PAINT_SETTINGS.WoodPurity);  // ★接线本体：特判组设置
  });

  it('深层漆 13 不吃特判组（ConvertPaintIdToTileShaderIndex :58080 窗 [1,12]）→ special=undefined', () => {
    const w = new World(48, 40, 3, 'fx12-foliage-deep');
    w.store.setTileSilent(10, 10, TILE_BY_KEY['tree']!, 22, 198);
    const { ctx } = recCtx();
    drawTreeCell(ctx, atlasStub({ 'vanilla/Tree_Tops_0.png': { width: 246, height: 80 } }),
      w.store, 10, 10, 22, 198, 0, 0, 5, true,
      { treeX: [], treeStyle: [], treeTops: [], worldSurface: 30, worldW: 48 }, 0, undefined, 13);
    const call = vi.mocked(tintedVanillaRegion).mock.calls.find((c) => c[5] === 13);
    expect(call).toBeTruthy();
    expect(call![7]).toBeUndefined();
  });

  it('棕榈冠（sheet 323, fx 88）paint=7 → PalmTreePurity（GetTreeFoliageSettings(15,0)）', () => {
    const w = new World(48, 40, 3, 'fx12-palm');
    w.store.setTileSilent(5, 5, TILE_BY_KEY['v_323_palm_trees']!, 88, 0);
    const { ctx } = recCtx();
    drawTreeCell(ctx, atlasStub({ 'vanilla/Tree_Tops_15.png': { width: 246, height: 246 } }),
      w.store, 5, 5, 88, 0, 0, 0, 323, true, undefined, 0, undefined, 7);
    const call = vi.mocked(tintedVanillaRegion).mock.calls.find((c) => c[5] === 7);
    expect(call).toBeTruthy();
    expect(call![7]).toBe(getTreeFoliageSettings(15, 0));
    expect(call![7]).toBe(SPECIAL_PAINT_SETTINGS.PalmTreePurity);
  });

  it('变异证红（判别力）：特判组与普通组在出窗像素上结果分叉——接线缺失即等于普通组', () => {
    // WoodPurity 窗 [1/6,5/6]：橙 (255,127,0) hue≈0.083 出窗 → 保原色；
    // 若把 special 丢了（旧代码路径），applyPaintTint 直接上漆 → (255,0,0)
    const special = applyPaintTintSpecial(255, 127, 0, 1, SPECIAL_PAINT_SETTINGS.WoodPurity);
    expect([...special]).toEqual([255, 127, 0]);
    const plain = applyPaintTint(255, 127, 0, 1);
    expect([...plain]).not.toEqual([...special]);
  });
});

describe('SW-FX12 C2. 荧光叠层摆动族/冠标记格补画（DrawTrees :8290/:8345/:8455 fullbright→White）', () => {
  /** 录制 ctx 的 document 桩（coating-system.test 同手法）；made() 返回本 describe 创建的全部画布 */
  const made: Array<{ canvas: unknown; rec: ReturnType<typeof recCtx> }> = [];
  beforeAll(() => {
    (globalThis as { document?: unknown }).document = {
      createElement: () => {
        const rec = recCtx();
        const canvas = { width: 0, height: 0, getContext: () => rec.ctx };
        made.push({ canvas, rec });
        return canvas;
      },
    };
  });
  afterAll(() => { delete (globalThis as { document?: unknown }).document; });

  const page = () => {
    const rec = recCtx();
    return { page: { width: 256, height: 256, getContext: () => rec.ctx } as unknown as HTMLCanvasElement, rec };
  };

  it('荧光涂层冠标记格：glow 叠层获得冠贴图重画（页拷贝为空 → 必须补画）', () => {
    made.length = 0;
    const w = new World(48, 40, 3, 'fx12-glow');
    const st = w.store;
    st.setTileSilent(10, 10, TILE_BY_KEY['tree']!, 22, 198);   // 冠标记帧（不进烘焙）
    st.setCoatSilent(10, 10, TileStore.COAT_FULLBRIGHT_BLOCK, TileStore.COAT_FULLBRIGHT_BLOCK);
    const atlas = atlasStub({ 'vanilla/Tree_Tops_0.png': { width: 246, height: 80 } });
    const cc = new ChunkCache(w, new Map(), { atlas } as unknown as AutoTiler, null as unknown as VanillaWallTiler);
    const wall = page(), tile = page();
    cc.bakeChunkInto(0, 0, wall.page, tile.page, -1);
    expect(made.length, '应创建 glow 画布').toBe(1);
    // 冠重画 = drawImage 源为 Tree_Tops 假图（页拷贝源必是 wallPage/tilePage）
    const crownDraw = made[0].rec.calls.find(
      (c) => c.fn === 'drawImage' && c.args[0] !== tile.page && c.args[0] !== wall.page,
    );
    expect(crownDraw, '冠标记格荧光叠层应有补画（旧实现只有页拷贝=空）').toBeTruthy();
  });

  it('普通实心格荧光：仍走页拷贝（drawImage 源=tilePage），回归保护', () => {
    made.length = 0;
    const w = new World(48, 40, 3, 'fx12-glow-dirt');
    const st = w.store;
    st.setTileSilent(3, 3, DIRT);
    st.setCoatSilent(3, 3, TileStore.COAT_FULLBRIGHT_BLOCK, TileStore.COAT_FULLBRIGHT_BLOCK);
    const cc = new ChunkCache(w, new Map(), { atlas: atlasStub({}) } as unknown as AutoTiler, null as unknown as VanillaWallTiler);
    const wall = page(), tile = page();
    cc.bakeChunkInto(0, 0, wall.page, tile.page, -1);
    expect(made.length).toBe(1);
    const copy = made[0].rec.calls.find((c) => c.fn === 'drawImage' && c.args[0] === tile.page);
    expect(copy, '实心格荧光=页拷贝通道不变').toBeTruthy();
  });

  it('无荧光格 chunk：零开销不建叠层（回归保护）', () => {
    made.length = 0;
    const w = new World(48, 40, 3, 'fx12-glow-none');
    w.store.setTileSilent(3, 3, DIRT);
    const cc = new ChunkCache(w, new Map(), { atlas: atlasStub({}) } as unknown as AutoTiler, null);
    const wall = page(), tile = page();
    const pair = cc.bakeChunkInto(0, 0, wall.page, tile.page, -1);
    expect(pair.glow).toBeUndefined();
    expect(made.length).toBe(0);
  });
});
