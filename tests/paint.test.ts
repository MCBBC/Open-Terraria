// 油漆（Paint）系统回归——1.4.5.6 反编译源码 1:1 行为锁。
// 覆盖：paintColor/MapColor 色表、paintTile/paintWall 原语守卫、TileStore 存储与
// KillTile/PlaceTile 清漆语义、存档往返（新字段 + 旧档缺省）、Item.paint/paintTool 表、
// FindPaintOrCoating 弹药栏优先、SmartCursor 三策略目标集、史莱姆踩漆 lerp。
// 权威行号（/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/）见各断言注释。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { SmartCursor, type SmartCursorEnv } from '../src/player/SmartCursor';
import {
  paintColor, coatingColor, applyPaintTint, mapPaintColor, PAINT_RGB,
  paintDustColor, paintTile, paintWall,
} from '../src/world/Paint';
import type { GameHooks } from '../src/entities/types';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;
const STONE = TILE_BY_KEY['stone']!;

// ---- SmartCursor 测试工具（与 tests/smart-cursor.test.ts 同构的最小 env） ----
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
const itemOf = (vid: number) => ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]]];

function hooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

describe('paintColor 色表（WorldGen.cs:43948-44061）', () => {
  it('浅层 1-12 RGB 逐条（:43951-44022）', () => {
    expect(paintColor(1)).toEqual([255, 0, 0, 255]);        // Red
    expect(paintColor(2)).toEqual([255, 127, 0, 255]);      // Orange
    expect(paintColor(3)).toEqual([255, 255, 0, 255]);      // Yellow
    expect(paintColor(5)).toEqual([0, 255, 0, 255]);        // Green
    expect(paintColor(9)).toEqual([0, 0, 255, 255]);        // Blue
    expect(paintColor(12)).toEqual([255, 0, 127, 255]);     // Pink
  });

  it('深层 13-24 与浅层同 RGB（同表成对分支 :43951-44022）', () => {
    for (let i = 1; i <= 12; i++) {
      expect(paintColor(i + 12)).toEqual(paintColor(i));
    }
    expect(paintColor(21)).toEqual([0, 0, 255, 255]);       // DeepBlue
  });

  it('特殊五色 + 负相 alpha（:44023-44059）', () => {
    expect(paintColor(25)).toEqual([75, 75, 75, 255]);     // BlackPaint = 深灰 75
    expect(paintColor(26)).toEqual([255, 255, 255, 255]);  // White
    expect(paintColor(27)).toEqual([175, 175, 175, 255]);  // Gray
    expect(paintColor(28)).toEqual([255, 178, 125, 255]);  // Brown
    expect(paintColor(29)).toEqual([25, 25, 25, 255]);     // Shadow
    expect(paintColor(30)).toEqual([200, 200, 200, 150]);  // Negative（半透明）
  });

  it('0 与废弃 31 → Color.White（C# 初值未命中分支 :43950/:44060）', () => {
    expect(paintColor(0)).toEqual([255, 255, 255, 255]);
    expect(paintColor(31)).toEqual([255, 255, 255, 255]);
  });

  it('PAINT_RGB 预展开与 paintColor 一致（0-31 全量）', () => {
    for (let i = 0; i <= 31; i++) {
      const c = paintColor(i);
      expect([...PAINT_RGB[i]]).toEqual([c[0], c[1], c[2]]);
    }
  });

  it('coatingColor（WorldGen.cs:44063-44071）：1 荧光 2 隐形 其余透明', () => {
    expect(coatingColor(1)).toEqual([235, 170, 255, 255]);
    expect(coatingColor(2)).toEqual([180, 245, 255, 255]);
    expect(coatingColor(0)).toEqual([0, 0, 0, 0]);
  });
});

describe('渲染换色公式', () => {
  it('applyPaintTint：普通漆逐通道乘色、白漆恒等、负相反转（world/Paint 注释模型）', () => {
    expect([...applyPaintTint(151, 107, 75, 1)]).toEqual([(151 * 255) >> 8, 0, 0]); // 红漆
    expect([...applyPaintTint(151, 107, 75, 26)]).toEqual([151, 107, 75]);          // 白漆恒等
    expect([...applyPaintTint(100, 150, 200, 30)]).toEqual([155, 105, 55]);          // 负相反转
    expect([...applyPaintTint(151, 107, 75, 0)]).toEqual([151, 107, 75]);            // 无漆
  });

  it('mapPaintColor 默认分支按最大通道缩放（MapHelper.cs:1854-1861）', () => {
    // 泥土地图色 (151,107,75)：max=151 → 红漆 = (255,0,0)*151/255
    const out = mapPaintColor(false, [151, 107, 75], 1);
    expect([...out]).toEqual([(255 * 151 / 255) | 0, 0, 0]);
  });

  it('mapPaintColor 暗影 29 用中位通道×0.3（:1832-1839）', () => {
    // (r,g,b)=(60,120,200)：两次交换后 num3=120（中位）→ (25,25,25)*0.4706
    const out = mapPaintColor(false, [60, 120, 200], 29);
    expect([...out]).toEqual([(25 * (120 / 255) * 0.3) | 0, (25 * (120 / 255) * 0.3) | 0, (25 * (120 / 255) * 0.3) | 0]);
  });

  it('mapPaintColor 负相 30：tile 全反转 / wall 半幅反转（:1840-1853）', () => {
    expect([...mapPaintColor(false, [100, 150, 200], 30)]).toEqual([155, 105, 55]);
    expect([...mapPaintColor(true, [100, 150, 200], 30)]).toEqual([((255 - 100) * 0.5) | 0, ((255 - 150) * 0.5) | 0, ((255 - 200) * 0.5) | 0]);
  });
});

describe('paintTile/paintWall 原语（WorldGen.cs:44137-44159 / 44257-44279）', () => {
  it('paintTile：非活性 false / 同色 false / 改色 true 且写入', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    expect(paintTile(st, 1, 1, 5)).toBe(true);
    expect(st.paint[st.idx(1, 1)]).toBe(5);
    expect(paintTile(st, 1, 1, 5)).toBe(false);      // 同色（:44145-44148）
    expect(paintTile(st, 2, 2, 5)).toBe(false);      // 空气（!active :44140）
  });

  it('paintWall：无墙 false / 同色 false / 改色 true 且写入', () => {
    const st = new TileStore(4, 4);
    st.setWallSilent(1, 1, 4);
    expect(paintWall(st, 1, 1, 9)).toBe(true);
    expect(st.paintWall[st.idx(1, 1)]).toBe(9);
    expect(paintWall(st, 1, 1, 9)).toBe(false);
    expect(paintWall(st, 2, 2, 9)).toBe(false);      // wall==0（:44260）
  });

  it('尘效时序：tile 先尘后写 / wall 先写后尘（与原版调用序一致）', () => {
    const st = new TileStore(2, 2);
    st.setTileSilent(0, 0, DIRT);
    st.setWallSilent(1, 0, 4);
    const order: string[] = [];
    const tHook = (x: number, y: number, np: number, op: number) => {
      order.push(`tile-dust:${st.paint[st.idx(x, y)]}>${np},${op}`);
    };
    paintTile(st, 0, 0, 3, tHook);
    expect(order[0]).toBe('tile-dust:0>3,0');        // 尘时旧值未写
    const wHook = () => { order.push(`wall-dust:${st.paintWall[st.idx(1, 0)]}`); };
    paintWall(st, 1, 0, 3, wHook);
    expect(order[1]).toBe('wall-dust:3');            // 尘时新值已写
  });

  it('paintDustColor：新漆 0 回退旧色（WorldGen.cs:44093-44097）', () => {
    expect(paintDustColor(0, 7)).toEqual(paintColor(7));
    expect(paintDustColor(7, 0)).toEqual(paintColor(7));
  });
});

describe('TileStore 存储 + 清漆语义', () => {
  it('默认全零；setPaint/setPaintWall 写入并触发 listeners（chunk/小地图重建链）', () => {
    const st = new TileStore(4, 4);
    expect(st.paint.every((v) => v === 0)).toBe(true);
    expect(st.paintWall.every((v) => v === 0)).toBe(true);
    const hits: Array<[number, number]> = [];
    st.onTileChanged((x, y) => hits.push([x, y]));
    st.setPaint(2, 2, 12);
    st.setPaintWall(2, 2, 12);
    expect(st.paint[st.idx(2, 2)]).toBe(12);
    expect(st.paintWall[st.idx(2, 2)]).toBe(12);
    expect(hits).toEqual([[2, 2], [2, 2]]);
    st.setPaint(2, 2, 12); // 同值不重复触发（幂等）
    expect(hits.length).toBe(2);
  });

  it('KillTile 清漆（WorldGen.cs:63933-63939）', () => {
    const st = new TileStore(4, 4);
    st.setTileSilent(1, 1, DIRT);
    st.setPaintSilent(1, 1, 5);
    st.setTile(1, 1, 0);
    expect(st.paint[st.idx(1, 1)]).toBe(0);
  });

  it('PlaceTile 在非活性格上清漆（:59499-59501）；active→active 替换保留漆', () => {
    const st = new TileStore(4, 4);
    // 空格遗留漆（模拟导入脏数据）→ 放块即清
    st.setPaintSilent(1, 1, 5);
    st.setTileSilent(1, 1, DIRT);
    expect(st.paint[st.idx(1, 1)]).toBe(0);
    // 已活性格带漆 → 换型保留（草化/转化路径）
    st.setPaintSilent(1, 1, 7);
    st.setTileSilent(1, 1, STONE);
    expect(st.paint[st.idx(1, 1)]).toBe(7);
  });

  it('KillWall 清墙漆（WorldGen.cs:60425-60426）；铺新墙从零开始', () => {
    const st = new TileStore(4, 4);
    st.setWallSilent(1, 1, 4);
    st.setPaintWallSilent(1, 1, 9);
    st.setWallSilent(1, 1, 0);
    expect(st.paintWall[st.idx(1, 1)]).toBe(0);
    st.setWallSilent(1, 1, 15);
    expect(st.paintWall[st.idx(1, 1)]).toBe(0);
    st.setPaintWallSilent(1, 1, 3);
    st.setWallSilent(1, 1, 16);   // wall→wall 替换保留
    expect(st.paintWall[st.idx(1, 1)]).toBe(3);
  });

  it('setPaint 钳 5bit 域（0-31，越界值 &31）', () => {
    const st = new TileStore(2, 2);
    st.setPaint(0, 0, 33);
    expect(st.paint[st.idx(0, 0)]).toBe(1);
  });
});

describe('存档往返（SaveData.paint/paintWall 独立 RLE 通道）', () => {
  it('saveGame → loadSave：方块漆/墙漆完整保留', () => {
    const w = new World(60, 40, 42, 'paint-test');
    const st = w.store;
    st.setTileSilent(10, 10, DIRT);
    st.setPaintSilent(10, 10, 5);
    st.setWallSilent(11, 11, 4);
    st.setPaintWallSilent(11, 11, 9);
    const p = new Player(100, 100, new Inventory());
    const back = loadSave(saveGame(w, p, 0));
    const st2 = back.world.store;
    expect(st2.paint[st2.idx(10, 10)]).toBe(5);
    expect(st2.paintWall[st2.idx(11, 11)]).toBe(9);
    // 未涂格保持 0
    expect(st2.paint[st2.idx(20, 20)]).toBe(0);
    expect(st2.paintWall[st2.idx(20, 20)]).toBe(0);
  });

  it('旧档缺 paint/paintWall 字段 → 全 0 无漆（同 wire/blocks 缺省容忍）', () => {
    const w = new World(60, 40, 42, 'paint-old');
    w.store.setTileSilent(5, 5, DIRT);
    const json = saveGame(w, new Player(0, 0, new Inventory()), 0);
    const raw = JSON.parse(json) as Record<string, unknown>;
    delete raw.paint;
    delete raw.paintWall;
    const back = loadSave(JSON.stringify(raw));
    const st = back.world.store;
    expect(st.paint.every((v) => v === 0)).toBe(true);
    expect(st.paintWall.every((v) => v === 0)).toBe(true);
  });
});

describe('Item.paint / paintTool 表（Item.cs:13374-13535 / :21168-21185）', () => {
  it('油漆 1073-1099 → PaintID 1-27（含深层 13-24）', () => {
    expect(itemOf(1073)?.paint).toBe(1);   // RedPaint
    expect(itemOf(1084)?.paint).toBe(12);  // PinkPaint
    expect(itemOf(1085)?.paint).toBe(13);  // DeepRedPaint
    expect(itemOf(1096)?.paint).toBe(24);  // DeepPinkPaint
    expect(itemOf(1097)?.paint).toBe(25);  // BlackPaint
    expect(itemOf(1098)?.paint).toBe(26);  // WhitePaint
    expect(itemOf(1099)?.paint).toBe(27);  // GrayPaint
  });

  it('棕/暗影/负相 1966-1968 → 28/29/30', () => {
    expect(itemOf(1966)?.paint).toBe(28);
    expect(itemOf(1967)?.paint).toBe(29);
    expect(itemOf(1968)?.paint).toBe(30);
  });

  it('工具族 paintTool（Player.cs PlaceThing 分派）', () => {
    expect(itemOf(1071)?.paintTool).toBe('brush');
    expect(itemOf(1543)?.paintTool).toBe('brush');    // SpectrePaintbrush
    expect(itemOf(1072)?.paintTool).toBe('roller');
    expect(itemOf(1544)?.paintTool).toBe('roller');
    expect(itemOf(1100)?.paintTool).toBe('scraper');
    expect(itemOf(1545)?.paintTool).toBe('scraper');
    expect(itemOf(1071)?.paint).toBeUndefined();      // 工具无 paint
  });
});

describe('FindPaintOrCoating（Player.cs:41272-41289）', () => {
  it('弹药栏 54-57 优先于背包（:41274-41280 先扫弹药栏）', () => {
    const inv = new Inventory();
    const red = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1073]];
    const blue = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1081]];
    inv.add(blue, 10);        // 进 0-49 背包
    inv.slots[54] = { id: red, stack: 5 };
    expect(inv.findPaintSlot()).toBe(54);
    expect(inv.heldPaintLookup()).toBe(1);
  });

  it('无弹药栏油漆时回落全包首槽（:41281-41287）', () => {
    const inv = new Inventory();
    const blue = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1081]];
    // 直接占住 0-49 背包格（add() 会把油漆自动归入弹药栏 54-57，绕开本路径）
    inv.slots[3] = { id: blue, stack: 3 };
    expect(inv.findPaintSlot()).toBe(3);
    expect(inv.heldPaintLookup()).toBe(9);            // BluePaint → PaintID 9
  });

  it('非油漆物品不被命中（Item.PaintOrCoating :334-344）', () => {
    const inv = new Inventory();
    inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2]], 99); // 泥土
    expect(inv.findPaintSlot()).toBe(-1);
    expect(inv.heldPaintLookup()).toBe(0);
  });
});

describe('SmartCursor 油漆三策略（SmartCursorHelper.cs:668-807）', () => {
  const brush = () => ({ def: itemOf(1071) ?? null, tool: null });
  const roller = () => ({ def: itemOf(1072) ?? null, tool: null });
  const scraper = () => ({ def: itemOf(1100) ?? null, tool: null });

  /** 玩家在 (100,95)，可达区 ≈ x 95-106 / y 92-99（TileReachCheckSettings.Simple 5/3）。
   *  paintField 把实心行铺在 y=95（玩家所在行），墙铺在 y=96-99 */
  function paintField(st: TileStore): void {
    for (let x = 96; x <= 104; x++) st.setTileSilent(x, 95, DIRT);
    for (let y = 96; y <= 99; y++) {
      for (let x = 96; x <= 104; x++) st.setWallSilent(x, y, 4);
    }
  }

  it('Step_PaintBrush：无油漆（paintLookup=0）→ 目标集恒空（:724 外门）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    expect(scRun(st, mouseAt(100, 95), brush())).toBeNull();
  });

  it('Step_PaintBrush：选离鼠标最近且颜色 != 目标漆的活性格（:733-743）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    st.setPaintSilent(100, 95, 1);   // 已是目标色 → 排除
    const hit = scRun(st, mouseAt(100, 95), brush(), { paintLookup: 1 });
    expect(hit).not.toBeNull();
    expect(hit!.x).not.toBe(100);    // 同色格不可选
    // 鼠标正好在 (101,95) → 最近候选是它
    const hit2 = scRun(st, mouseAt(101, 95), brush(), { paintLookup: 1 });
    expect(hit2).toEqual({ x: 101, y: 95 });
  });

  it('Step_PaintRoller：墙色 != 目标漆且墙前无实心块（:781）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    st.setPaintWallSilent(100, 96, 9); // 已同色 → 排除
    const hit = scRun(st, mouseAt(100, 96), roller(), { paintLookup: 9 });
    expect(hit).not.toBeNull();
    expect(hit).toEqual({ x: 99, y: 96 }); // (99,96) 与 (101,96) 等距取先扫到的 99（100 被排除）
  });

  it('Step_PaintRoller：实心块挡住的墙格不可选（:781 !active || !tileSolid || tileSolidTop）', () => {
    const st = new TileStore(220, 160);
    for (let x = 96; x <= 104; x++) st.setWallSilent(x, 97, 4);
    st.setTileSilent(100, 97, DIRT);   // 实心块正面 → 排除
    const hit = scRun(st, mouseAt(100, 97), roller(), { paintLookup: 9 });
    expect(hit).not.toBeNull();
    expect(hit!.x).not.toBe(100);
  });

  it('Step_PaintScrapper：有漆格/墙漆格为目标（:681-693）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    st.setPaintSilent(97, 95, 5);
    st.setPaintWallSilent(103, 97, 3);
    const a = scRun(st, mouseAt(97, 95), scraper());
    expect(a).toEqual({ x: 97, y: 95 });
    const b = scRun(st, mouseAt(103, 97), scraper());
    expect(b).toEqual({ x: 103, y: 97 });
    // 无漆区（可达区内）→ 无目标
    const st2 = new TileStore(220, 160);
    paintField(st2);
    expect(scRun(st2, mouseAt(100, 95), scraper())).toBeNull();
  });

  it('Step_PaintScrapper：长苔藓 sheet 184 也是目标（:684 tile.type == 184）', () => {
    const st = new TileStore(220, 160);
    paintField(st);
    const moss = TILE_BY_KEY['v_184_moss_plants'];
    if (moss === undefined) return; // tile 未注册时跳过（等价于原版不可达态）
    st.setTileSilent(98, 94, moss);
    const hit = scRun(st, mouseAt(98, 94), scraper());
    expect(hit).toEqual({ x: 98, y: 94 });
  });
});

describe('史莱姆踩漆 lerp（NPC.cs:60971-61087）', () => {
  it('站在红漆上：颜色向 (255,0,0) 收敛、alpha 向 100 收敛（:60977-60981）', () => {
    const w = new World(64, 48, 7, 'slime-paint');
    for (let x = 28; x < 36; x++) w.store.setTileSilent(x, 30, DIRT);
    w.store.setPaintSilent(30, 30, 1);   // 红漆
    const e = Enemy.fromVanilla(1, 30 * TILE, 28 * TILE); // 绿史莱姆（type 1）
    expect(e).not.toBeNull();
    expect(e!.colorRGBA).not.toBeNull();
    const before = [...e!.colorRGBA!];
    const p = new Player(4 * TILE, 20 * TILE, new Inventory());
    const h = hooks(w, p);
    for (let i = 0; i < 240 && !e!.dead; i++) e!.fixedUpdate(1 / 60, h);
    const after = e!.colorRGBA!;
    // 至少发生过一次 (c*19+target)/20 迈向 (255,0,0)
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[1]).toBeLessThan(before[1]);
    // alpha 目标恒 100（:60980）：史莱姆初始 alpha=100 → 保持 100
    expect(after[3]).toBe(100);
  });

  it('负相漆 30 不触发 lerp（:60977 color() != 30 门）', () => {
    const w = new World(64, 48, 7, 'slime-neg');
    for (let x = 28; x < 36; x++) w.store.setTileSilent(x, 30, DIRT);
    w.store.setPaintSilent(30, 30, 30);
    const e = Enemy.fromVanilla(1, 30 * TILE, 28 * TILE)!;
    const before = [...e.colorRGBA!];
    const h = hooks(w, new Player(4 * TILE, 20 * TILE, new Inventory()));
    for (let i = 0; i < 120 && !e.dead; i++) e.fixedUpdate(1 / 60, h);
    // 负相漆不吃：R 不向 200 收敛（无 ai[1] 物品色，颜色应基本不变）
    expect(Math.abs(e.colorRGBA![0] - before[0])).toBeLessThanOrEqual(1);
  });

  it('无漆立足点 → 不变色（无 ai[1] 体内物品时全静默）', () => {
    const w = new World(64, 48, 7, 'slime-plain');
    for (let x = 28; x < 36; x++) w.store.setTileSilent(x, 30, DIRT);
    const e = Enemy.fromVanilla(1, 30 * TILE, 28 * TILE)!;
    const before = [...e.colorRGBA!];
    const h = hooks(w, new Player(4 * TILE, 20 * TILE, new Inventory()));
    for (let i = 0; i < 120 && !e.dead; i++) e.fixedUpdate(1 / 60, h);
    expect(e.colorRGBA![0]).toBeCloseTo(before[0], 5);
    expect(e.colorRGBA![1]).toBeCloseTo(before[1], 5);
  });

  it('油漆格不实心（空气/平台）不算立足点（SolidTile3 :70470-70489）', () => {
    const w = new World(64, 48, 7, 'slime-nonsolid');
    // 立足行全空、只给一格平台刷漆（tileSolidTop 不算）
    const st = w.store;
    const plat = TILE_BY_KEY['platform'];
    if (plat === undefined) return;
    for (let x = 28; x < 36; x++) st.setTileSilent(x, 31, DIRT); // 底下一行实心
    st.setTileSilent(30, 30, plat);
    st.setPaintSilent(30, 30, 1);
    st.setPaintSilent(31, 30, 1); // 空气格遗留漆
    const e = Enemy.fromVanilla(1, 30 * TILE, 28 * TILE)!;
    const before = [...e.colorRGBA!];
    const h = hooks(w, new Player(4 * TILE, 20 * TILE, new Inventory()));
    for (let i = 0; i < 120 && !e.dead; i++) e.fixedUpdate(1 / 60, h);
    expect(Math.abs(e.colorRGBA![0] - before[0])).toBeLessThanOrEqual(1);
  });
});

describe('油漆师商店链（Chest.SetupShop case 15 :2416-2455 → 我方 vanilla-shopstock）', () => {
  it('227 主店进货：三件套 + 常驻黑灰白棕 + hardMode 门 1967/1968 + 墓地门 4668/5344', async () => {
    const j = (await import('../src/data/vanilla-shopstock.json')).default as {
      shops: Record<string, Array<{ id: number; cond: string | null }>>;
    };
    const stock = j.shops['227'];
    const ids = stock.map((e) => e.id);
    expect(ids).toContain(1071);   // Paintbrush :2418
    expect(ids).toContain(1072);   // PaintRoller :2420
    expect(ids).toContain(1100);   // PaintScraper :2422
    expect(ids).toContain(1097);   // Black :2429
    expect(ids).toContain(1099);   // Gray :2431
    expect(ids).toContain(1098);   // White :2433
    expect(ids).toContain(1966);   // Brown :2435
    expect(ids).toContain(1967);   // Shadow（hardMode 门 :2437-2441）
    expect(ids).toContain(1968);   // Negative（同上）
    expect(ids).toContain(4668);   // 荧光涂层（墓地门 :2444-2446）
    expect(ids).toContain(5344);   // 回声涂层（墓地+世花门 :2448-2450）
    // 1073-1084 基础 12 色是 for 循环上架（:2424-2428），extract-shops 不展开 →
    // 由 Game.shopStockFor 直补（见 shopStockFor 内 227 分支）；此处锁全部进货可购买
    for (const id of [...ids, ...Array.from({ length: 12 }, (_, i) => 1073 + i)]) {
      expect(VANILLA_ITEM_KEY_BY_ID[id]).toBeDefined();
      expect(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[id]]).toBeDefined();
    }
    // hardMode 门挂对条目（Shadow/Negative 仅困难模式上架）
    expect(stock.find((e) => e.id === 1967)?.cond).toBe('hardMode');
    expect(stock.find((e) => e.id === 1968)?.cond).toBe('hardMode');
  });

  it('油漆物品可入弹药格（Item.FitsAmmoSlot :1351-1367 PaintOrCoating 豁免）', async () => {
    const { ammoSlotAccepts } = await import('../src/items/Inventory');
    expect(ammoSlotAccepts(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1073]])).toBe(true);
    expect(ammoSlotAccepts(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1968]])).toBe(true);
    expect(ammoSlotAccepts(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2]])).toBe(false); // 泥土不收
  });

  it('tile 定义消费就绪：DIRT/STONE 有 mapColor 供 Minimap LUT（vanillaMapColors 链）', () => {
    expect(TILE_DEFS[DIRT]?.vanilla?.sheet).toBeDefined();
    expect(TILE_DEFS[STONE]?.vanilla?.sheet).toBeDefined();
  });
});
