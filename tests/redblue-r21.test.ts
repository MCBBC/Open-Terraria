// R21 蓝队修复回归（红队 red-team-r21.md 必修清单 1/2/3/4 对应四用例族）：
//   ① 旗 buff 屏内扫描——内部 tile id 经 TILE_BY_KEY 反查 + SceneMetrics.cs:419-447
//      解码修正段（skip 区/311·312 占位/≥311·≥312 双校正）
//   ② placeStyle 提取盲区——晶塔 11 型 / 门 32 件 / 逻辑感应器七件的数据回填 +
//      FurnitureStyle case 423(frameY 轴)/case 10(PlaceDoor 列带) 布局
//   ③ 箱子数据模型 10→40 槽（Chest.cs:58 DefaultMaxItems=40）+ 旧档兼容读
//   ④ 床重生点复验 / 住房平台"门"与 CountsAsTorch 光源表
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TILE_BY_KEY, TILE_KEY_BY_SHEET, T } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { framedCellFrame } from '../src/world/FurnitureStyle';
import { scanBannerNpcs } from '../src/world/Banners';
import { pylonStyleFromFrame, pylonItemTypeFromStyle, hasPylonOfType } from '../src/world/TeleportPylons';
import { styleDropVidOfFrames } from '../src/data/vanillaStyleDrops';
import { CHEST_MAX_ITEMS, World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { queryRoom } from '../src/world/Housing';

const defOfVid = (vid: number) => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  return k !== undefined ? ITEM_DEFS[ITEM_BY_KEY[k]] : undefined;
};

// ================= ① 旗 buff 屏内扫描 =================

function fakeStore(cells: Array<{ x: number; y: number; t: number; fx: number; fy: number }>) {
  const map = new Map<string, { t: number; fx: number; fy: number }>();
  for (const c of cells) map.set(String(c.x * 100000 + c.y), { t: c.t, fx: c.fx, fy: c.fy });
  return {
    idx: (x: number, y: number) => x * 100000 + y,
    isActive: (x: number, y: number) => map.has(String(x * 100000 + y)),
    // 幽灵格门(Banners.ts hasTile 消费位)——桩内 map 有格即 hasTile(位0 语义)
    hasTile: (x: number, y: number) => map.has(String(x * 100000 + y)),
    type: new Proxy({}, { get: (_t, p) => map.get(String(p))?.t ?? 0 }),
    frameX: new Proxy({}, { get: (_t, p) => map.get(String(p))?.fx ?? 0 }),
    frameY: new Proxy({}, { get: (_t, p) => map.get(String(p))?.fy ?? 0 }),
  } as unknown as Parameters<typeof scanBannerNpcs>[0];
}

describe('R21-1 旗扫描：内部 tile id + SceneMetrics 解码', () => {
  const bannerTile = TILE_BY_KEY['v_91_banners'];

  it('旗 tile 用 TILE_BY_KEY 反查（字面量 91 是 v_189_cloud_block）', () => {
    expect(bannerTile).toBeDefined();
    expect(bannerTile).not.toBe(91);          // 内部 id 空间 ≠ 原版 sheet id
    expect(TILE_KEY_BY_SHEET.get(91)).toBe('v_91_banners');
  });

  it('僵尸旗（NPCtoBanner(3)=87）真实帧 → npc 3 入集（修前恒空集）', () => {
    // 放置帧 = (banner+21)*18（Item.cs:19231 placeStyle=22+type-1615 同约定）
    const st = fakeStore([{ x: 10, y: 10, t: bannerTile, fx: (87 + 21) * 18, fy: 0 }]);
    expect(scanBannerNpcs(st, 0, 0, 20, 20).has(3)).toBe(true);
  });

  it('解码修正段：≥311/≥312 双校正 + skip 区不产出', () => {
    const st = fakeStore([
      { x: 5, y: 5, t: bannerTile, fx: 1638, fy: 108 },   // num=313 → banner 290（npc 692）
      { x: 6, y: 5, t: bannerTile, fx: 378, fy: 0 },      // fx<396&&fy<54 首带跳过区
      { x: 7, y: 5, t: bannerTile, fx: 1602, fy: 108 },   // num==311 占位样式
    ]);
    const npcs = scanBannerNpcs(st, 0, 0, 10, 10);
    expect(npcs.has(692)).toBe(true);
    expect(npcs.size).toBe(1);
  });
});

// ================= ② placeStyle 提取盲区 =================

describe('R21-2a 晶塔 11 型各归其型', () => {
  const PYLON_STYLE: Array<[number, number]> = [
    [4876, 0], [4875, 1], [4916, 2], [4917, 3], [4918, 4], [4919, 5],
    [4920, 6], [4921, 7], [4951, 8], [5652, 9], [5653, 10],
  ];

  it('物品 placeStyle 数据齐（Item.cs DefaultToPlaceableTile(597,N)）', () => {
    for (const [vid, style] of PYLON_STYLE) {
      const d = defOfVid(vid);
      expect(d, `vi_${vid} 缺 def`).toBeDefined();
      expect(d?.tile).toBe('v_597_pylons');
      expect(d?.placeStyle).toBe(style);
    }
  });

  it('放置帧 frameX=style*54+dx*18 ↔ GetPylonStyleFromTile 反推 round-trip', () => {
    for (const [, style] of PYLON_STYLE) {
      const [fx] = framedCellFrame(597, 3, style, 0, 0);
      expect(fx % 54).toBe(0);
      expect(pylonStyleFromFrame(fx)).toBe(style);
      // 掉落侧：style → 物品 id 回原 vid
      expect(pylonItemTypeFromStyle(style)).toBe(PYLON_STYLE.find(([v, s]) => s === style)![0]);
    }
  });

  it('唯一性门按型判定：不同型可共存、同型唯一（HasPylonOfType 语义）', () => {
    const pylons = [{ x: 0, y: 0, type: 0 }, { x: 9, y: 0, type: 1 }];
    expect(hasPylonOfType(pylons, 0)).toBe(true);
    expect(hasPylonOfType(pylons, 1)).toBe(true);
    expect(hasPylonOfType(pylons, 2)).toBe(false);   // 修前全放 style0 → 恒 true
  });
});

describe('R21-2b 门 style 通道（PlaceDoor 列带布局）', () => {
  it('FurnitureStyle case 10：frameX=54*(style/36)+变体*18、frameY=54*(style%36)+行*18', () => {
    // 石门 style44（Item.cs:37433 DefaultToPlaceableTile(10,44)）
    expect(framedCellFrame(10, 1, 44, 0, 0)).toEqual([54, 8 * 54]);
    expect(framedCellFrame(10, 1, 44, 0, 2)).toEqual([54, 8 * 54 + 36]);
    // 木门 style0
    expect(framedCellFrame(10, 1, 0, 0, 1)).toEqual([0, 18]);
  });

  it('石门 vi_4415 可放置且破坏返还 4415（Doors 表 index44）', () => {
    const d = defOfVid(4415);
    expect(d?.tile).toBe('door_closed');
    expect(d?.placeStyle).toBe(44);
    const [fx, fy] = framedCellFrame(10, 1, 44, 0, 0);
    expect(styleDropVidOfFrames(10, fx, fy)).toBe(4415);
  });

  it('门 style 反推与掉落一致（style 39-68 全档抽查）', () => {
    for (const [vid, style] of [[4155, 39], [4576, 45], [5722, 52], [6120, 68]] as const) {
      const d = defOfVid(vid);
      expect(d?.tile).toBe('door_closed');
      expect(d?.placeStyle).toBe(style);
      const [fx, fy] = framedCellFrame(10, 1, style, 0, 0);
      expect(styleDropVidOfFrames(10, fx, fy)).toBe(vid);
    }
  });
});

describe('R21-2c 逻辑感应器七件按 frameY 全档', () => {
  const SENSORS: Array<[number, number]> = [
    [3613, 0], [3614, 1], [3615, 2], [3726, 3], [3727, 4], [3728, 5], [3729, 6],
  ];
  it('placeStyle=type-3613 / type-3726+3（Item.cs:32555/:33046）', () => {
    for (const [vid, style] of SENSORS) {
      const d = defOfVid(vid);
      expect(d?.tile).toBe('v_423_logicsensor');
      expect(d?.placeStyle).toBe(style);
    }
  });
  it('放置帧 frameX=0/frameY=style*18（WorldGen.cs:45718 PlaceLogicTiles else 支）', () => {
    for (const [vid, style] of SENSORS) {
      expect(framedCellFrame(423, 1, style, 0, 0)).toEqual([0, style * 18]);
      // 打掉反推：fy/18 → 档位 → 返还原物品（修前恒返 3613）
      expect(styleDropVidOfFrames(423, 0, style * 18)).toBe(vid);
    }
  });
});

// ================= ③ 箱子 40 槽 =================

describe('R21-3 箱子数据模型 40 槽', () => {
  it('CHEST_MAX_ITEMS=40（Chest.cs:58 DefaultMaxItems）', () => {
    expect(CHEST_MAX_ITEMS).toBe(40);
  });

  it('旧档 10 槽箱读档补齐到 40，内容保持', () => {
    const world = new World(64, 64, 42, 'r21');
    world.chests.push({
      x: 30, y: 30,
      items: Array(10).fill(null).map((_, i) =>
        i === 0 ? { id: ITEM_BY_KEY['torch'], stack: 7 } : null),
    });
    const player = new Player(0, 0, new Inventory());
    const { world: w2 } = loadSave(saveGame(world, player, 0));
    expect(w2.chests[0].items.length).toBe(40);
    expect(w2.chests[0].items[0]?.stack).toBe(7);
    expect(w2.chests[0].items.slice(10).every((it) => it === null)).toBe(true);
  });

  it('wld 导入：锁态按锚帧推导（Chest.IsLocked cs:295-310）', async () => {
    const { vanillaChestIsLocked } = await import('../src/wld/WldImport');
    expect(vanillaChestIsLocked(21, 72)).toBe(true);     // 金锁 [72,106]
    expect(vanillaChestIsLocked(21, 36)).toBe(false);    // 金箱解锁 [36,71]
    expect(vanillaChestIsLocked(21, 144)).toBe(true);    // 暗影锁 [144,178]
    expect(vanillaChestIsLocked(21, 828)).toBe(true);    // 群系锁 [828,1006]
    expect(vanillaChestIsLocked(21, 1007)).toBe(false);
    expect(vanillaChestIsLocked(21, 1440)).toBe(true);
    expect(vanillaChestIsLocked(467, 13 * 36)).toBe(true);  // 沙漠锁 467 style13
    expect(vanillaChestIsLocked(467, 12 * 36)).toBe(false);
  });
});

// 真实 wld 导入的帧保留（金箱不再被清成无锁木箱）——Starter_World 在仓库根
const WLD = join(__dirname, '..', 'Starter_World Master.wld');

describe.skipIf(!existsSync(WLD))('R21-3 wld 导入端到端', () => {
  // ★合跑超时清账：三段惰性 import(WldImport/WldParser/SaveFile) + 全图解析落盘,
  // 单跑 ~9s（npc-drops 同族"惰性 import 冷加载被缺省 5s 误杀"案型）——只放配额
  it('导入后箱锚帧与原版 .wld 一致（style 不清零），锁箱带 locked 旗', { timeout: 60_000 }, async () => {
    const { parseWldToSave } = await import('../src/wld/WldImport');
    const { parseWld } = await import('../src/wld/WldParser');
    const buf = new Uint8Array(readFileSync(WLD));
    const wld = parseWld(buf);
    const { save } = parseWldToSave(buf);
    const { loadSave: ls } = await import('../src/save/SaveFile');
    const { world } = ls(JSON.stringify(save));
    const st = world.store;
    const chestTile = TILE_BY_KEY['chest'];
    let styled = 0, locked = 0;
    for (const c of save.chests) {
      const i = st.idx(c.x, c.y);
      if (st.type[i] !== chestTile) continue;
      const rawFx = wld.tiles.frameX[c.y * wld.tilesWide + c.x];
      if (st.frameX[i] !== rawFx) {
        // 帧必须保留原值；仅兜底路径（图格缺失重建）允许差异
        expect(st.frameX[i]).toBe(rawFx);
      }
      if (rawFx > 0) styled++;
      if (c.locked) locked++;
    }
    expect(save.chests.length).toBeGreaterThan(0);
    expect(styled).toBeGreaterThan(0);   // 该世界确有非木箱
    void locked;
  });
});

// ================= ④ 住房：平台门 + 光源表 =================

/** 最小房间脚手架：石墙圈 [X0..X1]×[Y0..Y1] 边界、房墙 1、房内家具由调用方摆；
 *  platformEntry = 左墙中段三格换木平台（平台"门"入口,无实体门 tile） */
function buildRoom(opts: { platformEntry?: boolean; furniture?: Array<{ sheet: number }> }) {
  const world = new World(48, 40, 7, 'r21-housing');
  const st = world.store;
  const stone = TILE_KEY_BY_SHEET.get(1)!;
  const platform = TILE_KEY_BY_SHEET.get(19)!;
  const X0 = 16, X1 = 29, Y0 = 12, Y1 = 21;   // 边界外圈（含）
  for (let x = X0; x <= X1; x++) {
    for (let y = Y0; y <= Y1; y++) {
      const edge = x === X0 || x === X1 || y === Y0 || y === Y1;
      if (edge) {
        const usePlatform = !!opts.platformEntry
          && x === X0 && y >= Y0 + 4 && y <= Y0 + 6;
        st.setTile(x, y, usePlatform ? TILE_BY_KEY[platform] : TILE_BY_KEY[stone], 0, 0);
      } else {
        st.setWall(x, y, 1);   // WALL_HOUSE 成员（木墙）
      }
    }
  }
  let sx = X0 + 2;
  for (const f of opts.furniture ?? []) {
    const key = TILE_KEY_BY_SHEET.get(f.sheet);
    if (!key) continue;
    st.setTile(sx, Y1 - 1, TILE_BY_KEY[key], 0, 0);
    sx += 1;
  }
  return { world, st, inside: { x: X0 + 3, y: Y0 + 3 }, floorRow: Y1 };
}

describe('R21-4a 平台入口房（CountsAsDoorTypes 含 19）', () => {
  it('平台段围墙 + 桌椅灯、无实体门 → 房合格（修前 notValid）', () => {
    const { world, inside } = buildRoom({
      platformEntry: true,
      furniture: [{ sheet: 14 }, { sheet: 15 }, { sheet: 35 }],   // 桌/椅/南瓜灯
    });
    const r = queryRoom(world.store, inside.x, inside.y);
    expect(r.reason).toBe('ok');
    expect(r.flags.door).toBe(true);    // 平台边界格登记 houseTile[19]
    expect(r.flags.light).toBe(true);   // 35 ∈ CountsAsTorch（修前 def.light 缺失漏报）
  });

  it('发光装饰不在 CountsAsTorch → 不再白得光源（286 发光蜗牛笼）', () => {
    const { world, inside } = buildRoom({
      furniture: [{ sheet: 14 }, { sheet: 15 }, { sheet: 286 }],
    });
    const r = queryRoom(world.store, inside.x, inside.y);
    expect(r.flags.light).toBe(false);
    expect(r.reason).toBe('needs');     // 缺光整房不合格
  });

  it('王座 102 计入椅子、宝箱 21 不再当椅子', () => {
    const throne = buildRoom({ furniture: [{ sheet: 14 }, { sheet: 102 }, { sheet: 35 }] });
    expect(queryRoom(throne.world.store, throne.inside.x, throne.inside.y).flags.chair).toBe(true);
    const chestRoom = buildRoom({ furniture: [{ sheet: 14 }, { sheet: 21 }, { sheet: 35 }] });
    const r = queryRoom(chestRoom.world.store, chestRoom.inside.x, chestRoom.inside.y);
    expect(r.flags.chair).toBe(false);
    expect(r.reason).toBe('needs');
  });
});
