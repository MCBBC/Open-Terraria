// 手持工具/放置物悬停光标物品图标（Player.cs ItemCheck_OwnerOnlyCode 五支 1:1——
// 置位纯函数 = src/player/ToolCursorIcon.ts，逐行转录 1457）。
//
// ★核心口径（防回归）：五支置位条件都是【纯射程门，不读任何 tile】——
//   手持镐/斧/锤指向射程内【任意】目标格（含空气/幽灵格/已致动格）图标恒亮。
//   "镐匹配可挖格 / 斧匹配 tileAxe / 锤匹配 tileHammer"是挖掘分派
//   ItemCheck_UseMiningTools_ActuallyUseMiningTool :46039-46046 的条件，不属于图标；
//   三代反编译同义（1405 Player.cs:29478-29502 / 1456 :44975-45001 / 1457 :45971-46011）。
//   本文件仍用 TileStore 摆出各案 tile 并断言 sheetOf 口径——为的是锁死"将来有人按
//   wiki 口径补 active()/tileAxe/tileHammer 门"这类回归点。
//
// 射程几何（GetTileRegion TileReachCheckSettings.cs:53-62，Simple 档 5/3 钳 20 + TB）：
//   玩家盒 (1600,1520,20,42) → LX=95 HX=106 LY=92 HY=100 →
//   在射程格 (104,95)、射程外格 (113,95)（右向 7 格）与 (104,104)（下方超 Y）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { T, TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { sheetOf } from '../src/player/SmartCursor';
import {
  toolCursorIcon, BUCKET_VIDS, WIRE_TOOL_TILE_BOOST, WIRE_TOOL_VIDS,
  type ToolCursorIconEnv,
} from '../src/player/ToolCursorIcon';
import { resolveCursorIconId } from '../src/render/CursorItemIcon';

const W = 220, H = 160;
const px = 100 * 16, py = 95 * 16;               // 玩家盒左上（position）
const ACTOR = { x: px, y: py, w: 20, h: 42 };
const REACH = { x: 5, y: 3 };                    // GetRanges Simple 档（钳 20 后底数，不含 TB）
const IN = { x: 104, y: 95 } as const;           // 射程内目标格
const OUT_X = { x: 113, y: 95 } as const;        // X 超界（HX=106）
const OUT_Y = { x: 104, y: 104 } as const;       // Y 超界（HY=100）

function mkEnv(over: Partial<ToolCursorIconEnv> = {}): ToolCursorIconEnv {
  return {
    pick: 0, axe: 0, hammer: 0,
    createTile: false, createWall: false,
    wireTool: false, bucket: false, makeNPC: false,
    reachBase: REACH,
    tileBoost: 0,
    blockRange: 0,
    actor: ACTOR,
    target: IN,
    ...over,
  };
}

// ---- 物品语义（原版 vid）----
const vid = (n: number) => ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[n]]];
const PICK_VID = 3509;    // 铜镐（pick 35）
const AXE_VID = 3506;     // 铜斧（axe 7）
const HAMMER_VID = 196;   // 木锤（hammer 25）
const SWORD_VID = 24;     // 木剑（无三力——手持非工具对照组）
const TORCH_VID = 8;      // 火把（createTile 4）
const BUCKET_VID = 206;   // 水桶（桶族）
const CRITTER_VID = 2019; // 兔子（makeNPC 46）
const WRENCH_VID = 509;   // 红扳手（电路族 tileBoost=20）

// ---- tile 布景（并断言 sheet 桥口径，防 TILE_BY_KEY 漂移）----
function mkWorld(): TileStore {
  const st = new TileStore(W, H);
  st.setTile(104, 94, T.STONE);                       // 矿/土组（sheet 1）
  st.setTile(104, 95, TILE_BY_KEY['dirt']);           // 泥（sheet 0）
  st.setTile(103, 93, TILE_BY_KEY['tree']);           // 树干（sheet 5，tileAxe）
  st.setTile(105, 96, TILE_BY_KEY['v_26_altars']);    // 祭坛（sheet 26，tileHammer）
  expect(sheetOf(T.STONE)).toBe(1);
  expect(sheetOf(TILE_BY_KEY['dirt'])).toBe(0);
  expect(sheetOf(TILE_BY_KEY['tree'])).toBe(5);
  expect(sheetOf(TILE_BY_KEY['v_26_altars'])).toBe(26);
  return st;
}

describe('镐/斧/锤：射程内即亮，图标 = 手持工具物品 id（:45971-46011）', () => {
  it('镐指石/泥（射程内）→ enabled + 缓存更新；图标 id 解析 = 镐 vid 3509', () => {
    mkWorld();
    const res = toolCursorIcon(mkEnv({ pick: 35 }));
    expect(res.enabled).toBe(true);
    expect(res.cacheUpdate).toBe(true);
    // 绘制端 num = cursorItemIconID(0)≠0 ? ID : heldItem.type（:45812-45814）——
    // 图标纹理 = 手持物品 vid（铜镐 3509；vi_ 件工具力走 vanilla-itemfunc 运行时桥，
    // def.tool 不落盘，故此处只锁 heldVid→图标 id 解析序）
    expect(vid(PICK_VID)).toBeTruthy();
    expect(resolveCursorIconId(PICK_VID, null, 0)).toBe(3509);
  });

  it('镐指泥 sheet 0（dirt）同亮——tile 类型不参与图标判定', () => {
    mkWorld();
    expect(toolCursorIcon(mkEnv({ pick: 35, target: { x: 104, y: 95 } })).enabled).toBe(true);
  });

  it('斧指树 sheet 5（tileAxe 族）→ enabled', () => {
    mkWorld();
    const res = toolCursorIcon(mkEnv({ axe: 7, target: { x: 103, y: 93 } }));
    expect(res.enabled).toBe(true);
    expect(res.cacheUpdate).toBe(true);
  });

  it('锤指祭坛 sheet 26（tileHammer 族）→ enabled', () => {
    mkWorld();
    const res = toolCursorIcon(mkEnv({ hammer: 25, target: { x: 105, y: 96 } }));
    expect(res.enabled).toBe(true);
    expect(res.cacheUpdate).toBe(true);
  });

  it('★tile 盲：斧指石 / 锤指泥 同亮（射程门不读 tile——勿按"匹配方块"口径补门）', () => {
    mkWorld();
    expect(toolCursorIcon(mkEnv({ axe: 7, target: { x: 104, y: 94 } })).enabled).toBe(true);
    expect(toolCursorIcon(mkEnv({ hammer: 25, target: { x: 104, y: 95 } })).enabled).toBe(true);
  });
});

describe('射程门（IsInTileInteractionRange :32264 + GetTileRegion）', () => {
  it('射程外（X 超 HX=106）→ 无图标', () => {
    expect(toolCursorIcon(mkEnv({ pick: 35, target: OUT_X }))).toEqual({ enabled: false, cacheUpdate: false });
  });

  it('射程外（Y 超 HY=100）→ 无图标', () => {
    expect(toolCursorIcon(mkEnv({ pick: 35, target: OUT_Y }))).toEqual({ enabled: false, cacheUpdate: false });
  });

  it('矩形判定含端点：HX=106 / HY=100 上的格仍亮', () => {
    expect(toolCursorIcon(mkEnv({ pick: 35, target: { x: 106, y: 95 } })).enabled).toBe(true);
    expect(toolCursorIcon(mkEnv({ pick: 35, target: { x: 104, y: 100 } })).enabled).toBe(true);
    // HY+1=101（玩家盒 ceil(1562/16)=98-1=97+3=100）不亮
    expect(toolCursorIcon(mkEnv({ pick: 35, target: { x: 104, y: 101 } })).enabled).toBe(false);
  });

  it('幽灵格（flags=0,type≠0）与已致动格同亮——原版图标路径无 tile.active() 门', () => {
    const st = mkWorld();
    // 幽灵格：直写 type 数组、不置 active 位（st.setTile 会置 flags=1）
    st.type[95 * W + 105] = TILE_BY_KEY['dirt'];
    expect(st.hasTile(105, 95)).toBe(false);              // TileStore.hasTile = tile.active() 口径
    expect(st.get(105, 95)).not.toBe(0);                  // 但格上有残型
    expect(toolCursorIcon(mkEnv({ pick: 35, target: { x: 105, y: 95 } })).enabled).toBe(true);
    // 已致动格（inActive=缩入地下，hasTile 仍真——"已致动格算在场"）
    st.setTile(106, 95, T.STONE);
    st.setWire(106, 95, TileStore.WIRE_ACTUATED);
    expect(st.hasTile(106, 95)).toBe(true);
    expect(st.isActuated(106, 95)).toBe(true);
    expect(toolCursorIcon(mkEnv({ pick: 35, target: { x: 106, y: 95 } })).enabled).toBe(true);
  });
});

describe('放置物（火把/绳/平台/墙——PlaceThing_Tiles :40033-40040 / Walls :39908-39919）', () => {
  it('手持火把（createTile）射程内 → 亮图标、不进缓存（:40040 仅置 enabled）', () => {
    expect(toolCursorIcon(mkEnv({ createTile: true }))).toEqual({ enabled: true, cacheUpdate: false });
    expect(vid(TORCH_VID) != null).toBe(true);
  });

  it('手持墙（createWall）射程内 → 亮（TB = tileBoost + blockRange）', () => {
    expect(toolCursorIcon(mkEnv({ createWall: true, blockRange: 1, target: { x: 107, y: 95 } })).enabled).toBe(true);
    expect(toolCursorIcon(mkEnv({ createWall: true, target: { x: 107, y: 95 } })).enabled).toBe(false);
  });

  it('TileTargetDesired（SmartCursorHelper.cs:1400-1411）：连续性锁期内目标≠锁点 → 放置块让位', () => {
    expect(toolCursorIcon(mkEnv({ createTile: true, tileTargetDesired: false }))).toEqual({ enabled: false, cacheUpdate: false });
    // 工具支无此门：镐在锁期内仍亮
    expect(toolCursorIcon(mkEnv({ pick: 35, tileTargetDesired: false })).enabled).toBe(true);
  });
});

describe('其余三支（电路 :47152-47166 / 桶 :46708-46718 / 小动物 :43951-43956）', () => {
  it('电路工具：TB = tileBoost 20（Item.cs SetDefaults 全族）→ 10 格外仍亮', () => {
    expect(WIRE_TOOL_VIDS.has(WRENCH_VID)).toBe(true);
    expect(WIRE_TOOL_TILE_BOOST).toBe(20);
    expect(toolCursorIcon(mkEnv({ wireTool: true, tileBoost: 20, target: { x: 113, y: 95 } })))
      .toEqual({ enabled: true, cacheUpdate: true });
    // 若漏传 20（按工具档 0 计）→ 同格不亮（锁死 TB 分档）
    expect(toolCursorIcon(mkEnv({ wireTool: true, target: { x: 113, y: 95 } })).enabled).toBe(false);
  });

  it('桶族亮 + 进缓存；noBuilding 门（:46710）关图标', () => {
    expect(BUCKET_VIDS.has(BUCKET_VID)).toBe(true);
    expect(toolCursorIcon(mkEnv({ bucket: true }))).toEqual({ enabled: true, cacheUpdate: true });
    expect(toolCursorIcon(mkEnv({ bucket: true, noBuilding: true })).enabled).toBe(false);
  });

  it('makeNPC 小动物族亮 + 进缓存（:43951-43956，无 noBuilding 门）', () => {
    expect(toolCursorIcon(mkEnv({ makeNPC: true, noBuilding: true }))).toEqual({ enabled: true, cacheUpdate: true });
  });
});

describe('手持非工具 / noBuilding（挖掘支 :45987-45990）', () => {
  it('手持木剑（无三力、无 createTile/Wall）射程内 → 无图标', () => {
    const def = vid(SWORD_VID);
    expect(def?.tool?.type ?? 'sword').toBe('sword');   // 语义对照：非镐/斧/锤
    expect(toolCursorIcon(mkEnv())).toEqual({ enabled: false, cacheUpdate: false });
  });

  it('noBuilding 只关挖掘/桶两支，电路/放置/小动物支不受影响（原版门的位置）', () => {
    expect(toolCursorIcon(mkEnv({ pick: 35, noBuilding: true })).enabled).toBe(false);
    expect(toolCursorIcon(mkEnv({ wireTool: true, noBuilding: true })).enabled).toBe(true);
    expect(toolCursorIcon(mkEnv({ createWall: true, noBuilding: true })).enabled).toBe(true);
    expect(toolCursorIcon(mkEnv({ makeNPC: true, noBuilding: true })).enabled).toBe(true);
  });

  it('多支同中按或累积（镐 + createTile 双语义不互斥）', () => {
    expect(toolCursorIcon(mkEnv({ pick: 35, createTile: true }))).toEqual({ enabled: true, cacheUpdate: true });
  });
});
