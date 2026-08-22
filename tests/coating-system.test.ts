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
