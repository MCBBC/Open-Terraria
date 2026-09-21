// 涂层（Coating）系统回归——1.4.5.6 反编译源码 1:1 行为锁。
// 覆盖：4668/5344 物品 paintCoating 表、TileStore.coat 四位通道与清位语义、
// paintCoatTile/paintCoatWall 原语（置位/幂等/清除/守卫）、涂层与油漆互不扰、
// 存档往返（coat 通道 + 旧档缺省 + 废弃荧光漆 31 迁移）、光照消费（隐形格不挡光/
// 放行天光）、FindPaintOrCoating 涂层侧、SmartCursor 三策略涂层项、回声腔扫描。
// 权威行号（/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/）见各断言注释。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { SmartCursor, type SmartCursorEnv } from '../src/player/SmartCursor';
import { TileLightScanner } from '../src/lighting/TileLightScanner';
import { FlickerClock } from '../src/lighting/SkyColor';
import { LightMap, Mask } from '../src/lighting/LightMap';
import {
  paintTile, paintCoatTile, paintCoatWall, coatingColor, coatingColorsOf, paintCoatDustColor,
} from '../src/world/Paint';
import { scanScene } from '../src/world/SceneMetrics';
import { ChunkCache } from '../src/render/ChunkCache';
import { Minimap } from '../src/render/Renderer';
import type { VanillaWallTiler } from '../src/render/VanillaWallTiler';

const DIRT = TILE_BY_KEY['dirt']!;
const itemOf = (vid: number) => ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]]];

// ---- SmartCursor 最小 env（与 tests/paint.test.ts scRun 同构） ----
const scRun = (
  st: TileStore, mouse: { x: number; y: number },
  held: { def: (typeof ITEM_DEFS)[number] | null; tool: null },
  over: Partial<SmartCursorEnv> = {},
  sc = new SmartCursor(),
): { x: number; y: number } | null => {
  sc.wanted = true;
  sc.lookup({
    st,
    mouse,
    actor: { x: 100 * 16, y: 95 * 16, w: 20, h: 42, cx: 100 * 16 + 10, cy: 95 * 16 + 21, facing: 1 },
    held,
    settings: { toggleMode: true, smartAxeAfterPickaxe: false, holdCanReleaseMidUse: false } as SmartCursorEnv['settings'],
    tileBoost: 0,
    wireToolMode: 0,
    occupants: [],
    controlUseItem: true,
    ...over,
  });
  return sc.showing ? { x: sc.x, y: sc.y } : null;
};
const mouseAt = (tx: number, ty: number) => ({ x: tx * 16 + 8, y: ty * 16 + 8 });

describe('物品 paintCoating 表（Item.cs SetDefaults :38471/:42387）', () => {
  it('4668 夜明涂料 → 1（fullbright）/ 5344 回声涂料 → 2（invisible）', () => {
    expect(itemOf(4668)?.paintCoating).toBe(1);   // :38472 paintCoating = 1
    expect(itemOf(5344)?.paintCoating).toBe(2);   // :42388 paintCoating = 2
  });

  it('涂层物品无 paint 域（TryPainting :41296-41299 两域互斥，只中 ApplyCoating 支）', () => {
    expect(itemOf(4668)?.paint).toBeUndefined();
    expect(itemOf(5344)?.paint).toBeUndefined();
    // 对照：普通油漆无涂层域
    expect(itemOf(1073)?.paintCoating).toBeUndefined();
  });

  it('coatingColor（WorldGen.cs:44063-44071）与 coatingColorsOf（:44073-44089）', () => {
    expect(coatingColor(1)).toEqual([235, 170, 255, 255]);
    expect(coatingColor(2)).toEqual([180, 245, 255, 255]);
    expect(coatingColor(0)).toEqual([0, 0, 0, 0]);
    // 位 → 色列表：先荧光后隐形（:44081-44087 加法序），方块/墙位域分治
    expect(coatingColorsOf(TileStore.COAT_FULLBRIGHT_BLOCK, true)).toEqual([coatingColor(1)]);
    expect(coatingColorsOf(TileStore.COAT_INVISIBLE_WALL, false)).toEqual([coatingColor(2)]);
    expect(coatingColorsOf(TileStore.COAT_FULLBRIGHT_BLOCK, false)).toEqual([]);
  });
});

describe('TileStore.coat 四位通道（WF:1539-1552 位编码）', () => {
  it('默认全零；setCoat 位装配 + listeners 触发（chunk 重烘链，同 setPaint 先例）', () => {
    const st = new TileStore(4, 4);
    expect(st.coat.every((v) => v === 0)).toBe(true);
    let fired = 0;
    st.onTileChanged(() => fired++);
    st.setCoat(1, 1, TileStore.COAT_FULLBRIGHT_BLOCK, TileStore.COAT_FULLBRIGHT_BLOCK);
    expect(st.coat[st.idx(1, 1)]).toBe(8);
    st.setCoat(1, 1, TileStore.COAT_INVISIBLE_BLOCK, TileStore.COAT_INVISIBLE_BLOCK);
    expect(st.coat[st.idx(1, 1)]).toBe(8 | 2);   // 位独立可并存（paintCoatTile case1 只查 fullbright 位）
    expect(fired).toBe(2);
    st.setCoat(1, 1, TileStore.COAT_FULLBRIGHT_BLOCK, 0);
    expect(st.coat[st.idx(1, 1)]).toBe(2);
  });

  it('挖除/铺块清方块涂层位、保留墙位（ClearBlockPaintAndCoating，Tile.cs:934-939）', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    st.setWallSilent(1, 1, 4);
    st.setCoatSilent(1, 1, 30, 2 | 8 | 16);   // 隐形块+荧光块+荧光墙
    st.setTileSilent(1, 1, 0);                // KillTile（WorldGen.cs:63933-63939 链）
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_BLOCK_MASK).toBe(0);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_FULLBRIGHT_WALL).toBe(16); // 墙位存活
  });

  it('墙拆除清墙涂层位、保留方块位（ClearWallPaintAndCoating，Tile.cs:941-946）', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    st.setWallSilent(1, 1, 4);
    st.setCoatSilent(1, 1, 30, 2 | 4);
    st.setWallSilent(1, 1, 0);                // KillWall（WorldGen.cs:60425-60426 链）
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_WALL_MASK).toBe(0);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_INVISIBLE_BLOCK).toBe(2); // 块位存活
  });

  it('涂层写入不动油漆通道、油漆写入不动涂层通道（两域物理分离）', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    st.setWallSilent(1, 1, 4);
    st.setPaintSilent(1, 1, 5);
    st.setCoat(1, 1, TileStore.COAT_INVISIBLE_BLOCK, TileStore.COAT_INVISIBLE_BLOCK);
    expect(st.paint[st.idx(1, 1)]).toBe(5);   // 涂层不扰漆
    paintTile(st, 1, 1, 9);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_INVISIBLE_BLOCK).toBe(2); // 漆不扰涂层
  });
});

describe('paintCoatTile / paintCoatWall（WorldGen.cs:44161-44255）', () => {
  it('id1 置荧光位；已置 → false（:44176-44180 幂等守卫）', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    expect(paintCoatTile(st, 1, 1, 1)).toBe(true);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_FULLBRIGHT_BLOCK).toBe(8);
    expect(paintCoatTile(st, 1, 1, 1)).toBe(false);   // 二次涂不消耗（ApplyCoating 不扣物品）
  });

  it('id2 置隐形位；已置 → false（:44181-44187）', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    expect(paintCoatTile(st, 1, 1, 2)).toBe(true);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_INVISIBLE_BLOCK).toBe(2);
    expect(paintCoatTile(st, 1, 1, 2)).toBe(false);
  });

  it('id0 双位清除；两位全空 → false（:44169-44175）；非活性 → false（:44163）；非法 id → false（:44168）', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    expect(paintCoatTile(st, 1, 1, 0)).toBe(false);   // 无位可清
    st.setCoatSilent(1, 1, 30, 2 | 8);
    expect(paintCoatTile(st, 1, 1, 0)).toBe(true);
    expect(st.coat[st.idx(1, 1)] & (2 | 8)).toBe(0);
    expect(paintCoatTile(st, 2, 2, 1)).toBe(false);   // 空气格（!tile.active()）
    expect(paintCoatTile(st, 1, 1, 3 as 0 | 1 | 2)).toBe(false); // default 分支
  });

  it('墙版：wall==0 → false（:44211-44214）；id1/2 置墙位、id0 清双墙位', () => {
    const st = new TileStore(4, 4);
    expect(paintCoatWall(st, 1, 1, 1)).toBe(false);   // 无墙
    st.setWallSilent(1, 1, 4);
    expect(paintCoatWall(st, 1, 1, 1)).toBe(true);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_FULLBRIGHT_WALL).toBe(16);
    expect(paintCoatWall(st, 1, 1, 1)).toBe(false);   // 幂等
    expect(paintCoatWall(st, 1, 1, 2)).toBe(true);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_INVISIBLE_WALL).toBe(4);
    expect(paintCoatWall(st, 1, 1, 0)).toBe(true);
    expect(st.coat[st.idx(1, 1)] & (4 | 16)).toBe(0);
  });

  it('刮除只清涂层不清漆（TryScrapping :41225-41232 paint||paintCoat 双原语序）', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    st.setPaintSilent(1, 1, 7);
    st.setCoatSilent(1, 1, TileStore.COAT_INVISIBLE_BLOCK, TileStore.COAT_INVISIBLE_BLOCK);
    // 漆仍在 → paintTile(0) 先中（刮除同时清漆）；再刮一次只剩涂层位可清
    expect(paintTile(st, 1, 1, 0)).toBe(true);
    expect(st.paint[st.idx(1, 1)]).toBe(0);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_INVISIBLE_BLOCK).toBe(2); // 涂层未被漆清除波及
    expect(paintCoatTile(st, 1, 1, 0)).toBe(true);
    expect(st.coat[st.idx(1, 1)] & TileStore.COAT_INVISIBLE_BLOCK).toBe(0);
  });

  it('尘色 paintCoatDustColor（paintCoatEffect :44114-44131 取色侧）', () => {
    expect(paintCoatDustColor(1, [])).toEqual(coatingColor(1));
    expect(paintCoatDustColor(2, [])).toEqual(coatingColor(2));
    // 刮除（id 0）空旧色表 → coatingColor(0) = Transparent（:44119 未命中分支）
    expect(paintCoatDustColor(0, [])).toEqual([0, 0, 0, 0]);
    // 刮除有旧色 → 回退旧色列表随机项
    const olds = [coatingColor(1)];
    expect(paintCoatDustColor(0, olds)).toEqual(coatingColor(1));
  });
});

describe('存档往返（SaveData.coat 独立 RLE 通道）', () => {
  it('saveGame → loadSave：四位涂层完整保留', () => {
    const w = new World(60, 40, 42, 'coat-test');
    const st = w.store;
    st.setTileSilent(10, 10, DIRT);
    st.setWallSilent(11, 11, 4);
    st.setCoatSilent(10, 10, TileStore.COAT_INVISIBLE_BLOCK, TileStore.COAT_INVISIBLE_BLOCK);
    st.setCoatSilent(11, 11, 30, 8 | 16);   // 荧光块+荧光墙
    const back = loadSave(saveGame(w, new Player(100, 100, new Inventory()), 0));
    const st2 = back.world.store;
    expect(st2.coat[st2.idx(10, 10)] & TileStore.COAT_INVISIBLE_BLOCK).toBe(2);
    expect(st2.coat[st2.idx(11, 11)] & (8 | 16)).toBe(8 | 16);
    expect(st2.coat[st2.idx(20, 20)]).toBe(0);   // 未涂格保持 0
  });

  it('旧档缺 coat 字段 → 全 0 无涂层（同 paint 缺省容忍）', () => {
    const w = new World(60, 40, 42, 'coat-old');
    w.store.setTileSilent(5, 5, DIRT);
    const raw = JSON.parse(saveGame(w, new Player(0, 0, new Inventory()), 0)) as Record<string, unknown>;
    delete raw.coat;
    const back = loadSave(JSON.stringify(raw));
    expect(back.world.store.coat.every((v) => v === 0)).toBe(true);
  });

  it('废弃荧光漆迁移（ConvertIlluminantPaintToNewField，WorldFile.cs:2806-2825）：31 → 0+荧光位', () => {
    const w = new World(60, 40, 42, 'coat-migrate');
    const st = w.store;
    st.setTileSilent(3, 3, DIRT);
    st.setWallSilent(4, 4, 4);
    st.setPaintSilent(3, 3, 31);    // 1.4.4 前荧光漆（PaintID.IlluminantPaint）
    st.setPaintWallSilent(4, 4, 31);
    const back = loadSave(saveGame(w, new Player(0, 0, new Inventory()), 0));
    const st2 = back.world.store;
    expect(st2.paint[st2.idx(3, 3)]).toBe(0);                                       // :2813 color(0)
    expect(st2.coat[st2.idx(3, 3)] & TileStore.COAT_FULLBRIGHT_BLOCK).toBe(8);      // :2814 fullbright
    expect(st2.paintWall[st2.idx(4, 4)]).toBe(0);                                   // :2818
    expect(st2.coat[st2.idx(4, 4)] & TileStore.COAT_FULLBRIGHT_WALL).toBe(16);      // :2819
  });
});

describe('光照消费（TileLightScanner.cs:154-166 / :3170）', () => {
  const scanner = new TileLightScanner(new FlickerClock());

  it('隐形涂层块不挡光传播（LightIsBlocked → Mask.None）；显示态恢复挡光', () => {
    const st = new TileStore(8, 8);
    st.setTileSilent(3, 3, DIRT);
    expect(scanner.getMask(st, st.idx(3, 3))).toBe(Mask.Solid);   // 无涂层实心挡光
    st.setCoatSilent(3, 3, TileStore.COAT_INVISIBLE_BLOCK, TileStore.COAT_INVISIBLE_BLOCK);
    expect(scanner.getMask(st, st.idx(3, 3))).toBe(Mask.None);    // :158-162 隐形不挡
    st.showInvisibleBlocks = true;                                // _drawInvisibleWalls 态
    expect(scanner.getMask(st, st.idx(3, 3))).toBe(Mask.Solid);
    st.showInvisibleBlocks = false;
  });

  it('隐形涂层块放行天光（exposed，:3170 析取支 invisibleBlock 析取）；显示态不放行', () => {
    // 经 exportTo 可观测：地表挡阳实心格（dirt）自身不播天空光；回声涂层后放行
    const mk = () => {
      const st = new TileStore(8, 8);
      st.setTileSilent(3, 5, DIRT);            // 地表挡阳格（groundLevel=5）
      return { store: st, groundLevel: 5, lavaLine: 6, clock: { timeOfDay: 0.5, dayCount: 1 } };
    };
    const map = new LightMap();
    map.setSize(8, 8);
    const w1 = mk();
    scanner.exportTo(w1, map, 0, 0, []);
    const li = 5 * map.w + 3;
    expect(map.r[li]).toBe(0);                 // 普通挡阳格不播天光
    const w2 = mk();
    const i = w2.store.idx(3, 5);
    w2.store.setCoatSilent(3, 5, TileStore.COAT_INVISIBLE_BLOCK, TileStore.COAT_INVISIBLE_BLOCK);
    scanner.exportTo(w2, map, 0, 0, []);
    expect(map.r[li]).toBeGreaterThan(0);      // 隐形块 → 放行（:3170）
    expect(map.mask[li]).toBe(Mask.None);      // 同格传播遮挡同步豁免
    // 显示态（_drawInvisibleWalls）恢复挡阳
    w2.store.showInvisibleBlocks = true;
    scanner.exportTo(w2, map, 0, 0, []);
    expect(map.r[li]).toBe(0);
  });
});

describe('FindPaintOrCoating 涂层侧（Item.PaintOrCoating Item.cs:334-344）', () => {
  it('涂层物品命中 findPaintSlot（弹药栏优先同油漆）+ heldCoatingLookup', () => {
    const inv = new Inventory();
    const echo = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[5344]];
    const glow = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4668]];
    inv.add(echo, 10);          // add 归入弹药栏 54-57（油漆/涂层 FitsAmmoSlot 豁免）
    expect(inv.findPaintSlot()).toBe(54);
    expect(inv.heldCoatingLookup()).toBe(2);
    inv.slots[54] = { id: glow, stack: 5 };
    expect(inv.heldCoatingLookup()).toBe(1);
    expect(inv.heldPaintLookup()).toBe(0);   // 涂层物品 paint 域为空
  });

  it('非油漆非涂层物品不命中（:334-344）', () => {
    const inv = new Inventory();
    inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2]], 99);   // 泥土
    expect(inv.findPaintSlot()).toBe(-1);
    expect(inv.heldCoatingLookup()).toBe(0);
  });
});

describe('SmartCursor 涂层项（SmartCursorHelper.cs:683-692/:738/:781）', () => {
  const brush = () => ({ def: itemOf(1071) ?? null, tool: null });
  const scraper = () => ({ def: itemOf(1100) ?? null, tool: null });

  function paintField(st: TileStore): void {
    for (let x = 96; x <= 104; x++) st.setTileSilent(x, 95, DIRT);
  }

  it('Step_PaintBrush：coatingLookup=1（荧光）目标 = 未置荧光位的活性格（:738）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    st.setCoatSilent(100, 95, TileStore.COAT_FULLBRIGHT_BLOCK, TileStore.COAT_FULLBRIGHT_BLOCK);
    const hit = scRun(st, mouseAt(100, 95), brush(), { coatingLookup: 1 });
    expect(hit).not.toBeNull();
    expect(hit!.x).not.toBe(100);   // 已荧光格排除
    const hit2 = scRun(st, mouseAt(101, 95), brush(), { coatingLookup: 1 });
    expect(hit2).toEqual({ x: 101, y: 95 });
  });

  it('Step_PaintBrush：coatingLookup=2（回声）目标 = 未置隐形位的格；已置格排除', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    st.setCoatSilent(100, 95, TileStore.COAT_INVISIBLE_BLOCK, TileStore.COAT_INVISIBLE_BLOCK);
    const hit = scRun(st, mouseAt(100, 95), brush(), { coatingLookup: 2 });
    expect(hit).not.toBeNull();
    expect(hit!.x).not.toBe(100);
    // 两 lookup 全零 → 外门拦截（:724 paintLookup==0 && paintCoatingLookup==0 → return）
    expect(scRun(st, mouseAt(101, 95), brush(), {})).toBeNull();
  });

  it('Step_PaintScrapper：涂层位格为目标（:686-687 块侧/:691-692 墙侧）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    st.setCoatSilent(97, 95, TileStore.COAT_FULLBRIGHT_BLOCK, TileStore.COAT_FULLBRIGHT_BLOCK);
    const hit = scRun(st, mouseAt(97, 95), scraper());
    expect(hit).toEqual({ x: 97, y: 95 });
    // 无漆无涂层的纯实心格 → 无目标
    const st2 = new TileStore(220, 160);
    paintField(st2);
    expect(scRun(st2, mouseAt(100, 95), scraper())).toBeNull();
  });
});

describe('涂层渲染门（烘焙叠层 + 隐形隐藏链）', () => {
  /** recording ctx：捕 fillRect/drawImage 全参（不依赖真实画布，anim-furniture-frame
   *  同款手法；drawImage 9 参源矩形用于荧光叠层断言） */
  function recCtx() {
    const fills: Array<{ x: number; y: number; w: number; h: number }> = [];
    const draws: Array<{ src: unknown; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }> = [];
    const ctx = {
      fillStyle: '',
      globalAlpha: 1,
      imageSmoothingEnabled: false,
      fillRect(x: number, y: number, w: number, h: number) { fills.push({ x, y, w, h }); },
      drawImage(src: unknown, a: number, b: number, c?: number, d?: number, e?: number, f?: number) {
        // 5 参（整图缩放）与 9 参（源矩形）统一记源/目标
        if (c === undefined) draws.push({ src, sx: 0, sy: 0, sw: a, sh: b, dx: 0, dy: 0 });
        else draws.push({ src, sx: a, sy: b, sw: c, sh: d!, dx: e!, dy: f! });
      },
      save() {}, restore() {},
      beginPath() {}, rect() {}, clip() {}, translate() {}, clearRect() {},
      putImageData() {},
    } as unknown as CanvasRenderingContext2D;
    return { ctx, fills, draws };
  }

  /** node 环境桩 document：createElement('canvas') → recording ctx 画布 */
  function stubDocument(): Array<{ canvas: unknown; rec: ReturnType<typeof recCtx> }> {
    const made: Array<{ canvas: unknown; rec: ReturnType<typeof recCtx> }> = [];
    (globalThis as { document?: unknown }).document = {
      createElement: () => {
        const rec = recCtx();
        const canvas = { width: 0, height: 0, getContext: () => rec.ctx };
        made.push({ canvas, rec });
        return canvas;
      },
    };
    return made;
  }
  const unstubDocument = () => { delete (globalThis as { document?: unknown }).document; };

  const stubPage = () => {
    const rec = recCtx();
    return { page: { width: 256, height: 256, getContext: () => rec.ctx } as unknown as HTMLCanvasElement, rec };
  };

  it('黑暗中荧光涂层格光照覆写=全亮：烘焙出 glow 叠层（DrawTiles_GetLightOverride' +
    ' fullbrightBlock→White，TileDrawing.cs:6728-6732 [1456]/:6736-6740 [1457]；' +
    '本仓=ChunkCache.bakeChunkInto 荧光叠层，光照合成后叠回）', () => {
    const made = stubDocument();
    try {
      const w = new World(40, 40, 3, 'coat-glow');
      const st = w.store;
      st.setTileSilent(2, 2, DIRT);                                    // 荧光块格
      st.setTileSilent(5, 5, DIRT);
      st.setWallSilent(5, 5, 4);
      st.setCoatSilent(2, 2, TileStore.COAT_FULLBRIGHT_BLOCK, TileStore.COAT_FULLBRIGHT_BLOCK);
      st.setCoatSilent(5, 5, TileStore.COAT_FULLBRIGHT_WALL, TileStore.COAT_FULLBRIGHT_WALL);   // 荧光墙格
      const cc = new ChunkCache(w, new Map(), null, null);
      const wall = stubPage(), tile = stubPage();
      const pair = cc.bakeChunkInto(0, 0, wall.page, tile.page, -1);
      // 有荧光位 → glow 叠层懒分配（createElement 恰一次：glow 画布）
      expect(pair.glow).toBeDefined();
      const glowRec = made.find((m) => m.canvas === pair.glow!)!.rec;
      // 块位格：从 tile 页拷 (2,2) 格 16×16 进叠层（源=目标=格内局部坐标）
      expect(glowRec.draws).toContainEqual(expect.objectContaining(
        { src: tile.page, sx: 32, sy: 32, sw: 16, sh: 16, dx: 32, dy: 32 }));
      // 墙位格：从墙页拷 (5,5) 格（墙先拷、tile 后拷=世界层序）
      expect(glowRec.draws).toContainEqual(expect.objectContaining(
        { src: wall.page, sx: 80, sy: 80, sw: 16, sh: 16, dx: 80, dy: 80 }));
      // 无涂层格不进叠层（(3,3) 无拷贝）
      expect(glowRec.draws.some((d) => d.dx === 48 && d.dy === 48)).toBe(false);

      // 无荧光位的 chunk：零开销跳过（invisible 位不算荧光）
      const w2 = new World(40, 40, 3, 'coat-noglow');
      w2.store.setTileSilent(2, 2, DIRT);
      w2.store.setCoatSilent(2, 2, TileStore.COAT_INVISIBLE_BLOCK, TileStore.COAT_INVISIBLE_BLOCK);
      const cc2 = new ChunkCache(w2, new Map(), null, null);
      const pair2 = cc2.bakeChunkInto(0, 0, stubPage().page, stubPage().page, -1);
      expect(pair2.glow).toBeUndefined();
    } finally {
      unstubDocument();
    }
  });

  it('隐形涂层格渲染隐藏门：无回声腔/4409/5345（showInvisibleBlocks=false）不画' +
    '（IsVisible，TileDrawing.cs:1434-1452；墙段 :995-996 flag2 门；本仓 ChunkCache' +
    ':648 墙/:687 块 + Renderer.colorFor :1522/:1545 小地图链）', () => {
    const w = new World(40, 40, 3, 'coat-echo-hide');
    const st = w.store;
    st.setTileSilent(3, 3, DIRT);
    st.setWallSilent(3, 3, 4);
    st.setCoatSilent(3, 3, TileStore.COAT_INVISIBLE_BLOCK | TileStore.COAT_INVISIBLE_WALL,
      TileStore.COAT_INVISIBLE_BLOCK | TileStore.COAT_INVISIBLE_WALL);
    // 墙 tiler 用桩（真类要素材；门在 ChunkCache 侧，桩捕 draw 调用即可）
    const wallCalls: Array<{ x: number; y: number }> = [];
    const wallTiler = {
      hasTexture: () => true,
      draw: (_c: unknown, _s: unknown, x: number, y: number) => { wallCalls.push({ x, y }); },
    } as unknown as VanillaWallTiler;
    const cc = new ChunkCache(w, new Map(), null, wallTiler);
    const wall = stubPage(), tile = stubPage();
    cc.bakeChunkInto(0, 0, wall.page, tile.page, -1);
    // 显示门关：墙不画（:648）、块不画（:687——无 autotiler 走 fillRect 兜底，无调用）
    expect(wallCalls).toEqual([]);
    expect(tile.rec.fills).toEqual([]);

    // 显示门开（回声腔激活/幽灵护目镜 4409/回声腔物品 5345 → showInvisibleBlocks，
    // Main.ShouldShowInvisibleBlocksAndWalls :57403-57408 [1456]/:58912-58917 [1457]）
    st.showInvisibleBlocks = true;
    cc.bakeChunkInto(0, 0, wall.page, tile.page, -1);
    expect(wallCalls).toContainEqual({ x: 3, y: 3 });
    expect(tile.rec.fills).toContainEqual({ x: 48, y: 48, w: 16, h: 16 });
    st.showInvisibleBlocks = false;

    // 小地图同链（Renderer.colorFor :1521 块按空气/:1544 墙不显示）
    st.setTileSilent(8, 8, DIRT);                        // 对照：无涂层普通泥土格
    const mm = new Minimap(w, true);
    expect(mm.colorFor(3, 3)).toBe(mm.colorFor(9, 3));   // 涂层格 == 同排纯空气背景色
    st.showInvisibleBlocks = true;
    expect(mm.colorFor(3, 3)).toBe(mm.colorFor(8, 8));   // 显示态 == 普通泥土格色
    st.showInvisibleBlocks = false;
  });
});

describe('回声腔扫描（SceneMetrics.cs:545-549 → echoMonolith）', () => {
  it('tile 657 激活帧（frameY>=54）→ echoMonolith=true；关帧/无腔 → false', () => {
    const w = new World(220, 320, 7, 'coat-echo');
    w.groundLevel = 100;
    w.rockLevel = 200;
    const st = w.store;
    const echoTile = TILE_BY_KEY['v_657_echo_chamber']!;
    st.setTileSilent(110, 150, echoTile, 0, 54);   // 激活帧
    let scene = scanScene(w, 110 * 16, 150 * 16, 0);
    expect(scene.echoMonolith).toBe(true);
    st.setTileSilent(110, 150, echoTile, 0, 0);    // 关帧
    scene = scanScene(w, 110 * 16, 150 * 16, 0);
    expect(scene.echoMonolith).toBe(false);
  });
});

// ==================== 合成侧叠回：drawCoatGlowGrid（RV1 登记补锁） ====================
// Renderer.ts:11499（:2909 光照合成后调用、fullbright 跳过）——烘焙半边
// （ChunkCache glow 叠层生成）已有用例，本段锁【合成叠回】半边：
// 有 glow 的 chunk 才 drawImage、无 glow 跳过、越界 chunk 剔除。
import { Renderer } from '../src/render/Renderer';
import { Camera } from '../src/render/Camera';

describe('drawCoatGlowGrid 合成侧叠回（Renderer.ts:11499；RV1 登记补锁）', () => {
  /** 记录型 ctx + 最小 this 桩，原型直调私有方法（accessory-unmodeled 同法） */
  function runGrid(chunks: Map<string, { glow?: HTMLCanvasElement }>, fullbright = false) {
    const draws: Array<{ img: unknown; dx: number; dy: number; dw: number; dh: number }> = [];
    const calls: string[] = [];
    let arguments0: unknown[] = [];   // Proxy get 无法捕获实参——恒空桩（真实记录走 ctx2/draws2）
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => {
        calls.push(String(k));
        if (k === 'drawImage') {
          // drawCoatGlowGrid 用 9 参形式 (img,0,0,S,S,dx,dy,dw,dh)
          draws.push({ img: arguments0[0], dx: arguments0[5] as number, dy: arguments0[6] as number, dw: arguments0[7] as number, dh: arguments0[8] as number });
        }
        return () => undefined;
      },
    }) as unknown as CanvasRenderingContext2D;
    // Proxy get 无法捕获实参——改用显式桩
    const draws2: Array<{ img: unknown; dx: number; dy: number; dw: number; dh: number }> = [];
    const ctx2 = {
      save: () => {}, restore: () => {}, setTransform: () => {},
      imageSmoothingEnabled: false,
      drawImage: (img: unknown, _a: number, _b: number, _c: number, _d: number,
        dx: number, dy: number, dw: number, dh: number) => {
        draws2.push({ img, dx, dy, dw, dh });
      },
    } as unknown as CanvasRenderingContext2D;
    const cam = new Camera(40 * 16, 40 * 16);   // drawCoatGlowGrid 只读 x/y/zoom——worldW/H 不消费
    cam.x = 8 * 16 * 16; cam.y = 8 * 16 * 16; cam.zoom = 1;   // 视口中心≈chunk(8,8)
    const world = { w: 40 * 16, h: 40 * 16 };   // 方法内 cx*CHUNK(像素域)对比——桩须同域
    // 桩 get：命中返回 Map 值、未命中返回 {}（模拟 ChunkCache 惰性烘焙恒有返回——
    // 方法内 p.glow 直读,undefined 会炸;生产链 get 恒返 pair）
    const stubGet = (cx: number, cy: number) => chunks.get(`${cx},${cy}`) ?? {};
    const fakeThis = { ctx: ctx2, fullbright, chunks: { get: stubGet } };
    (Renderer.prototype as unknown as Record<string, (...a: unknown[]) => void>)
      .drawCoatGlowGrid.call(fakeThis, { get: stubGet } as never,
        cam, world, 16 * 16 * 4, 16 * 16 * 4, 1);
    return draws2;
  }

  it('有 glow 的 chunk 恰一次 9 参 drawImage（img=glow 画布、屏矩形=chunk 世界矩形-相机）', () => {
    const glow = { width: 256, height: 256 } as HTMLCanvasElement;
    const draws = runGrid(new Map([['8,8', { glow }]]));
    expect(draws.length).toBe(1);
    expect(draws[0].img).toBe(glow);
    expect(draws[0].dw).toBe(256);   // CHUNK*ts=16*16
    expect(draws[0].dh).toBe(256);
  });

  it('无 glow 的 chunk 跳过（零开销路径）;fullbright 时调用方门短路（:2909 if !fullbright）', () => {
    const draws = runGrid(new Map([['8,8', {}]]));
    expect(draws.length).toBe(0);
    // fullbright 门在调用点（:2909）——本方法被调用即画；门语义由调用点 if 保证,
    // 此处锁方法本体无 fullbright 分支（传什么画什么）
    const draws2 = runGrid(new Map([['8,8', { glow: { width: 256, height: 256 } as HTMLCanvasElement }]]), true);
    expect(draws2.length).toBe(1);   // 方法本体无门——门在调用方（结构锁）
  });

  it('越界 chunk（<0 或 ≥world.w/h）剔除；多 chunk 各画各的 glow', () => {
    const glowA = { width: 256, height: 256 } as HTMLCanvasElement;
    const glowB = { width: 256, height: 256 } as HTMLCanvasElement;
    const draws = runGrid(new Map([
      ['-1,8', { glow: glowA }],      // 越界：方法内 continue
      ['40,8', { glow: glowA }],      // ≥world.w=40 越界
      ['8,8', { glow: glowA }],
      ['9,8', { glow: glowB }],
    ]));
    expect(draws.length).toBe(2);
    expect(draws[0].img).toBe(glowA);
    expect(draws[1].img).toBe(glowB);
    expect(draws[1].dx).toBeGreaterThan(draws[0].dx);   // 右侧 chunk 屏 x 更大
  });
});
