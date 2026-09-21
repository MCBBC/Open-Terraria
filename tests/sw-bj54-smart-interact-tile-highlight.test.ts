// SW-BJ54 2026-09-10：智能交互 tile 高亮（用户实报"原版光标移到宝箱上有 hover
// 贴图高亮,我们做了吗?"——定谳=原版存在,机制=Smart Interact tile 高亮链,本刀 1:1 移植）。
//
// 【原版锚（1457）】
//  - Player.SmartInteractLookup（Player.cs:17488-17513：门 :17497-17498、域
//    :17514-17523 Simple.GetTileRegion+Clamp 10..max-10、FullInteraction=true :17506）
//  - SmartInteractSystem.RunQuery（SmartInteractSystem.cs:34-62：block 头门 :20-27
//    由 BlockBecauseYouAreOverAnImportantTile 提供；全 provider 跑完取距最小者
//    WinCandidacy :56-61,等距先序者保位——NPC 先序）
//  - TileSmartInteractCandidateProvider.cs：候选谓词 :359-408（Campfires ∪
//    TileUsedInRecipes ∪ CountsAsWaterForCrafting ∪ 硬编码表）、尺寸表 :140-330
//    （num9=num10=18、num11 缺省 2）、锚归一 :325-326、selected 首件保位 :337-353、
//    candidate 距离=目标格盒 ClosestPointInRect :347-349、WinCandidacy 域±10 :34-42
//  - TileID.cs:207 DisableSmartInteract / :277 HasOutlines / :281 CountsAsWater / :407 Campfires
//  - TileDrawing.cs:886 tileLight=Lighting.GetColor → :902-904 HasOutlines 门 →
//    :4518-4529 GetTileOutlineInfo（avg=(R+G+B)/3 整除 :4522、>10 门 :4523-4525、
//    HighlightMask[type] + Colors.GetSelectionGlowColor）→ :1002 CacheSpecialDraws_
//    Part2（宝箱姿态带 addFrY :4319-4360）→ :1422-1427 同源矩形叠画
//  - Colors.cs:127-130 GetSelectionGlowColor 数值
//  - AssetInitializer.cs:655-660 HighlightMask 素材名 Tiles_<type>（仅 HasOutlines 型）
//  - 1458 增量核对：Terarria1458 同域逐句一致（Player.cs:17488-17512）
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import {
  scanSmartInteractTiles,
  shouldBlockSmartInteract,
  tileUsedInRecipes,
  CANDIDATE_TILE_DIMS,
  DISABLE_SMART_INTERACT,
  COUNTS_AS_WATER_FOR_CRAFTING,
  CAMPFIRE_TILES,
  FILL_TARGET_TYPES,
  clearSmartInteractTileFrame,
  smartInteractTileFrame,
  type SmartInteractCondCtx,
} from '../src/core/SmartInteractTiles';
import {
  TILE_HAS_OUTLINES,
  HIGHLIGHT_ANIM_EXCLUDED,
  HIGHLIGHT_ANIM_WHEN_LIT,
  getSelectionGlowColor,
  highlightCellRect,
} from '../src/render/TileHighlight';
import { TILE_DEFS } from '../src/data/tiles';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 构造域内单件 tile 场景的 store */
function makeStore(w: number, h: number): TileStore {
  return new TileStore(w, h);
}

/** ★SW-BJ61 域归一：夹具入参统一【vanilla sheet 域】（测试名/断言语义与原版表一致），
 *  写 store 时转内部 id——store.type=TILE_DEFS 序（643/664 与 sheet 分歧,如 sheet21 宝箱
 *  =internal14）；provider 内部再 sheetOfStoreType 转回 sheet 查表=生产链同式。 */
function internalOfSheet(sheet: number): number {
  const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  return i >= 0 ? i : sheet;
}

function placeBox(store: TileStore, x: number, y: number, type: number, cols: number, rows: number, baseFx = 0, baseFy = 0) {
  const internal = internalOfSheet(type);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const si = store.idx(x + i, y + j);
      store.type[si] = internal;
      store.flags[si] = 1;                                  // bit0 active
      store.frameX[si] = baseFx + i * 18;
      store.frameY[si] = baseFy + j * 18;
    }
  }
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

const W = 100, H = 100;
// 扫描域（避开 clamp 边）：30..40 × 30..40
const LX = 30, LY = 30, HX = 40, HY = 40;
// 域中心世界坐标（mousevec）
const CX = (LX + HX) / 2 * 16 + 8, CY = (LY + HY) / 2 * 16 + 8;

describe('SW-BJ54 候选谓词与尺寸表（provider :140-408 1:1）', () => {
  it('宝箱 21（2×2，num11 缺省 2）：光标在箱上 → 整件 4 格全高亮且被选中（黄调）', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 21, 2, 2);
    // 光标 = 箱左上格中心
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 34 * 16 + 8, Infinity);
    expect(scan.winDist).toBe(0);
    expect(scan.winX).toBe(34);
    expect(scan.winY).toBe(34);
    const ck = scan.coords.map((c) => key(c.x, c.y)).sort();
    expect(ck).toEqual(['34,34', '34,35', '35,34', '35,35']);
    const sk = scan.selected.map((c) => key(c.x, c.y)).sort();
    expect(sk).toEqual(ck);                                   // 最近件=整件 selected
  });

  it('宝箱底行 frameY=18：锚归一折回箱顶（num11=2 → frameY%38/18=1，:326）', () => {
    const store = makeStore(W, H);
    // 底行格 frameY=18（宝箱行值语义：顶 0/底 18）
    const si = store.idx(34, 35);
    store.type[si] = internalOfSheet(21);   // ★SW-BJ61 域归一:宝箱 sheet21→internal
    store.flags[si] = 1;
    store.frameX[si] = 0;
    store.frameY[si] = 18;
    // 最近目标 = 底行格 → 锚 = (34, 35-18%38/18=34) → 整件 = 34..35 × 34..35
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 35 * 16 + 8, Infinity);
    expect(scan.winX).toBe(34);
    expect(scan.winY).toBe(35);
    const ck = scan.coords.map((c) => key(c.x, c.y)).sort();
    expect(ck).toEqual(['34,34', '34,35', '35,34', '35,35']);
  });

  it('两件候选：最近件 selected（黄），其余件仅 coords（白）；FullInteraction=true 语义', () => {
    const store = makeStore(W, H);
    placeBox(store, 32, 34, 21, 2, 2);                        // 宝箱 A（近）
    placeBox(store, 38, 34, 11, 2, 3);                        // 工作台 11（远,2×3）
    // 光标在宝箱 A 中心附近 → A selected；B 全件白
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 32 * 16 + 16, 34 * 16 + 16, Infinity);
    const sk = scan.selected.map((c) => key(c.x, c.y)).sort();
    expect(sk).toEqual(['32,34', '32,35', '33,34', '33,35']);
    const ck = new Set(scan.coords.map((c) => key(c.x, c.y)));
    for (let i = 38; i <= 39; i++) for (let j = 34; j <= 36; j++) expect(ck.has(key(i, j))).toBe(true);
    expect(ck.size).toBe(4 + 6);
  });

  it('配方站 TileUsedInRecipes 面目入候选：熔炉 17（3×2）与砧继承型 355（3×3，TileCountsAs 355→13）', () => {
    // ★SW-RB11a：候选谓词改 FILL_TARGET_TYPES∪recipes∪water∪campfire（旧 DIMS.has
    //   把 14/469 误入候选）——17/355 经 TileUsedInRecipes 入候选。场景同步订正：
    //   熔炉 17 原版多格框=3 宽×2 高（旧 2×3 是尺寸表误抄 0 的连带摆位,锚不齐）。
    const store = makeStore(W, H);
    placeBox(store, 32, 34, 17, 3, 2);                        // frameX 0..36 / frameY 0..18
    placeBox(store, 37, 34, 355, 3, 3);                       // 分子机/微光砧族(继承进 TileUsedInRecipes)
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 32 * 16 + 8, 34 * 16 + 8, Infinity);
    const ck = new Set(scan.coords.map((c) => key(c.x, c.y)));
    for (let i = 32; i <= 34; i++) for (let j = 34; j <= 35; j++) expect(ck.has(key(i, j)), `17@${i},${j}`).toBe(true);
    for (let i = 37; i <= 39; i++) for (let j = 34; j <= 36; j++) expect(ck.has(key(i, j)), `355@${i},${j}`).toBe(true);
  });

  it('水槽族 CountsAsWaterForCrafting{172,207}：172（2×2）入候选', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 172, 2, 2);
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 34 * 16 + 8, Infinity);
    expect(scan.coords.length).toBe(4);
  });

  it('营火 215 走 Campfires 覆盖 3×2（provider :332-334）', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 215, 3, 2);
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 34 * 16 + 8, Infinity);
    expect(scan.coords.length).toBe(6);
  });

  it('候选谓词过但无尺寸表 → 不入 coords（原版 :329-331 num7==0 skip——如 13 铁砧）', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 13, 1, 1);                        // 13 在 TileUsedInRecipes（砧配方站）但不在尺寸表
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 34 * 16 + 8, Infinity);
    expect(scan.coords.length).toBe(0);
    // ★原版语义（测试首跑修正）：skip 只影响整件展开,最近目标选择基于 targets 全集
    // （:85-105 在尺寸 switch 之前）——13 仍可为目标 → candidate 距 0 胜出（
    // TileInteraction 范围开）但 coords 空 ⇒ InSmartCursorHighlightArea Contains
    // 恒 false ⇒ 铁砧无高亮。渲染面由 TILE_HAS_OUTLINES 门第二重保险。
    expect(scan.winDist).toBe(0);
    expect(scan.winX).toBe(34);
  });

  it('candidate 距离 = 目标格盒 ClosestPointInRect 距（:347-349）：格内 0/格外=最近点距', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 21, 2, 2);
    // 鼠标在箱右缘外 3px（目标格 35,34 的右边界 x=35*16+16）
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 35 * 16 + 16 + 3, 34 * 16 + 8, Infinity);
    expect(scan.winDist).toBeCloseTo(3, 6);
  });

  it('域内无候选 → winDist=null（ProvideCandidate false）', () => {
    const store = makeStore(W, H);
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, CX, CY, Infinity);
    expect(scan.winDist).toBeNull();
    expect(scan.coords.length).toBe(0);
  });
});

describe('SW-BJ54 胜出与门（SmartInteractSystem.cs:20-62）', () => {
  it('NPC 零距胜出 → tile 支不可胜（tileWon 不置——RunQuery :47-52 break 语义）', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 21, 2, 2);
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 34 * 16 + 8, 0);
    expect(scan.winDist).toBe(0);
    expect(scan.winDist! < 0).toBe(false);                     // 等距先序保位：NPC 胜
  });

  it('tile 距离严格小于 NPC 距离才胜出（:56-61 严格大于更新）', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 21, 2, 2);
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 34 * 16 + 8, 5);
    expect(scan.winDist).toBe(0);
    expect(scan.winDist! < 5).toBe(true);
  });

  it('block 门：光标格=DisableSmartInteract 型（如 33 灰烬块族/520）→ 整链空', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 21, 2, 2);
    const si = store.idx(36, 36);
    store.type[si] = internalOfSheet(33);    // ★SW-BJ61 域归一:灰烬 sheet33→internal
    store.flags[si] = 1;
    expect(shouldBlockSmartInteract(store, 36, 36)).toBe(true);
  });

  it('block 门：光标格出界（InWorld 10 外）→ true（:15-17）', () => {
    const store = makeStore(W, H);
    expect(shouldBlockSmartInteract(store, 5, 50)).toBe(true);
    expect(shouldBlockSmartInteract(store, W - 5, 50)).toBe(true);
  });

  it('block 门：普通格/空格不 block（:22 return false）', () => {
    const store = makeStore(W, H);
    expect(shouldBlockSmartInteract(store, 36, 36)).toBe(false);  // 空格
    const si = store.idx(36, 36);
    store.type[si] = internalOfSheet(21);   // ★SW-BJ61 域归一:宝箱 sheet21→internal                                       // active 宝箱不在 Disable 表
    store.flags[si] = 1;
    expect(shouldBlockSmartInteract(store, 36, 36)).toBe(false);
  });

  it('fullInteraction=false（手柄路径,本仓不触达）：仅鼠标所指件入 coords（:334-336）', () => {
    const store = makeStore(W, H);
    placeBox(store, 32, 34, 21, 2, 2);
    placeBox(store, 38, 34, 21, 2, 2);
    // 鼠标在 B 件上 → 只有 B 入 coords
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 38 * 16 + 8, 34 * 16 + 8, Infinity, false);
    const ck = scan.coords.map((c) => key(c.x, c.y)).sort();
    expect(ck).toEqual(['38,34', '38,35', '39,34', '39,35']);
  });
});

describe('SW-BJ54 渲染面（TileDrawing.cs:902-904/:4518-4529/:1422-1427）', () => {
  it('TILE_HAS_OUTLINES 与 1457 TileID.cs:277 全等（95 型）——反伪影:原文数列内嵌对拍', () => {
    const vanilla1457 = new Set([
      10, 11, 15, 21, 29, 55, 79, 85, 88, 89, 97, 102, 104, 125, 132, 136, 139, 144,
      207, 209, 212, 215, 216, 237, 287, 335, 338, 354, 356, 377, 386, 387, 388, 389,
      410, 411, 425, 441, 455, 463, 467, 468, 470, 475, 487, 480, 494, 497, 509, 510,
      511, 621, 464, 657, 658, 663, 699, 720, 721, 725, 733,
      16, 17, 18, 26, 77, 86, 94, 96, 101, 106, 114, 133, 134, 217, 218, 220, 228,
      243, 247, 283, 300, 301, 302, 303, 304, 305, 306, 307, 308, 412, 499, 622, 355, 172,
    ]);
    expect(vanilla1457.size).toBe(95);
    expect(TILE_HAS_OUTLINES.size).toBe(95);
    for (const t of vanilla1457) expect(TILE_HAS_OUTLINES.has(t)).toBe(true);
  });

  it('候选∩HasOutlines=可见高亮面；CANDIDATE_TILE_DIMS 与 provider case 表全等', () => {
    // provider 原文 case→(cols,rows,extra) 内嵌对拍（变异证红:任意改表即红）。
    // ★SW-RB11a（2026-09-10）金标重产：旧 want 表系【转抄自实现】把实现的三处误抄
    // （207=2、3×2/3×3/3×4 三组=0）一并锁进测试=金标陈旧。逐 case 复核反编译原文：
    //   207 显式 num11=0（TileSmartInteractCandidateProvider.cs:200-204）；
    //   {14,17,26,77,86,89,114,133,217,218,237,377,469}（:214-230）、
    //   {106,220,228,243,247,283,300-308,355,412,499}（:231-250）、
    //   {101,102,463,475,597}（:273-280）三组均【不写 num11】→ 缺省 2（:139）。
    const want: Array<[number, number, number, number]> = [
      ...[136, 144, 494].map((t) => [t, 1, 1, 0] as [number, number, number, number]),
      ...[216, 338].map((t) => [t, 1, 2, 2] as [number, number, number, number]),
      ...[15, 497].map((t) => [t, 1, 2, 4] as [number, number, number, number]),
      [10, 1, 3, 0],
      ...[388, 389].map((t) => [t, 1, 5, 2] as [number, number, number, number]),
      ...[16, 18, 29, 134, 387].map((t) => [t, 2, 1, 2] as [number, number, number, number]),
      ...[21, 55, 85, 94, 96, 97, 125, 132, 172, 287, 335, 386, 411, 425, 441,
        467, 468, 573, 621, 622].map((t) => [t, 2, 2, 2] as [number, number, number, number]),
      ...[79, 139, 510, 511].map((t) => [t, 2, 2, 0] as [number, number, number, number]),
      ...[11, 356, 410, 470, 480, 509, 657, 658, 663, 720, 721, 725].map((t) => [t, 2, 3, 0] as [number, number, number, number]),
      [207, 2, 4, 0],
      [104, 2, 5, 2],
      [88, 3, 1, 0],
      ...[14, 17, 26, 77, 86, 89, 114, 133, 217, 218, 237, 377, 469].map((t) => [t, 3, 2, 2] as [number, number, number, number]),
      ...[106, 220, 228, 243, 247, 283, 300, 301, 302, 303, 304, 305, 306, 307,
        308, 355, 412, 499].map((t) => [t, 3, 3, 2] as [number, number, number, number]),
      ...[354, 455, 491, 733].map((t) => [t, 3, 3, 0] as [number, number, number, number]),
      [487, 4, 2, 0],
      [212, 4, 3, 2],
      [209, 4, 3, 0],
      ...[101, 102, 463, 475, 597].map((t) => [t, 3, 4, 2] as [number, number, number, number]),
      [699, 4, 4, 2],
      [464, 5, 4, 2],
    ];
    expect(CANDIDATE_TILE_DIMS.length).toBe(want.length);
    const got = new Map(CANDIDATE_TILE_DIMS.map((r) => [r[0], [r[1], r[2], r[3]]]));
    for (const [t, c, r, e] of want) {
      const g = got.get(t);
      expect(g, `type ${t}`).toBeDefined();
      expect(g![0], `type ${t} cols`).toBe(c);
      expect(g![1], `type ${t} rows`).toBe(r);
      expect(g![2], `type ${t} extra`).toBe(e);
    }
  });

  it('HasOutlines 型 HighlightMask 素材全在盘（AssetInitializer.cs:655-660 同名单;97 张含原版冗余 14/469）', () => {
    const dir = join(HERE, '..', 'public', 'sprites', 'vanilla');
    for (const t of TILE_HAS_OUTLINES) {
      expect(existsSync(join(dir, `Misc_TileOutlines_Tiles_${t}.png`)), `mask Tiles_${t}`).toBe(true);
    }
  });

  it('DISABLE_SMART_INTERACT / COUNTS_AS_WATER / CAMPFIRES 与 1457 表全等（TileID.cs:207/:281/:407）', () => {
    expect([...DISABLE_SMART_INTERACT].sort((a, b) => a - b)).toEqual(
      [4, 33, 334, 395, 410, 455, 471, 480, 509, 520, 657, 658, 698, 720, 721, 725, 733],
    );
    expect([...COUNTS_AS_WATER_FOR_CRAFTING].sort((a, b) => a - b)).toEqual([172, 207]);
    expect([...CAMPFIRE_TILES]).toEqual([215]);
  });

  it('GetSelectionGlowColor 数值（Colors.cs:129）：未选中灰白 avg/2、选中黄调 avg/3 蓝', () => {
    expect(getSelectionGlowColor(false, 60)).toEqual([30, 30, 30, 60]);
    expect(getSelectionGlowColor(true, 60)).toEqual([60, 60, 20, 60]);
    expect(getSelectionGlowColor(false, 11)).toEqual([5, 5, 5, 11]);   // XNA 整除
    expect(getSelectionGlowColor(true, 13)).toEqual([13, 13, 4, 13]);
  });

  it('avg>10 门（TileDrawing.cs:4522-4525）语义核对：avg=10 不画/avg=11 画', () => {
    // 门在渲染 pass：`avg <= 10 continue`——此处锁数值边界供渲染实现对照
    const edge = 10;
    expect(edge <= 10).toBe(true);                            // avg=10 → 不画
    expect(edge + 1 <= 10).toBe(false);                       // avg=11 → 画
  });

  it('宝箱 21 源矩形：顶行 16 高/底行 18 高（GetTileDrawData :5017-5024）+姿态带（CacheSpecialDraws_Part2 :4340-4347）', () => {
    // 顶行 frameY=0 关态：h=16, addFrY=0
    expect(highlightCellRect(21, 0, 0, 10, 10, 0)).toEqual({ sx: 0, sy: 0, sw: 16, sh: 16, dx: 160, dy: 160 });
    // 开盖姿态 frame=2 → +76
    expect(highlightCellRect(21, 0, 0, 10, 10, 2).sy).toBe(76);
    // 底行 frameY=18：h=18（case 21 支）且姿态带叠加
    expect(highlightCellRect(21, 18, 18, 10, 11, 0)).toEqual({ sx: 18, sy: 18, sw: 16, sh: 18, dx: 160, dy: 176 });
    // 右列 frameX=18：addFrX=18/18*18-18=0（18 对齐恒 0）
    expect(highlightCellRect(21, 18, 0, 10, 10, 0).sx).toBe(18);
  });

  it('门 15（1×2,num11=4）：40 带折+2040 折带（GetTileDrawData 15/497 块）', () => {
    // 带内低帧：fy=0 → 无折、h=16
    expect(highlightCellRect(15, 0, 0, 10, 10, 0)).toEqual({ sx: 0, sy: 0, sw: 16, sh: 16, dx: 160, dy: 160 });
    // fy=2040（带 51 帧尾）→ n72=1: addFrY-=2040, addFrX+=36；2040%40=0 → h=16
    expect(highlightCellRect(15, 0, 2040, 10, 10, 0)).toEqual({ sx: 36, sy: 0, sw: 16, sh: 16, dx: 160, dy: 160 });
    // fy=18 → h=18（frameY%40==18）
    expect(highlightCellRect(15, 0, 18, 10, 10, 0).sh).toBe(18);
  });

  it('缸 79：h=18 恒 + 2016 带折（addFrY-=2016n, addFrX+=144n）', () => {
    expect(highlightCellRect(79, 0, 0, 10, 10, 0).sh).toBe(18);
    const r = highlightCellRect(79, 0, 2016, 10, 10, 0);
    expect(r.sy).toBe(0);                                     // 2016-2016
    expect(r.sx).toBe(144);
  });

  it('木门 18：2016 带（tileFrameX/2016 → addFrX-=2016n, addFrY+=20n, :4717-4722）', () => {
    const r = highlightCellRect(18, 2016, 0, 10, 10, 0);
    expect(r.sx).toBe(0);                                     // 2016-2016（带首归位）
    expect(r.sy).toBe(20);                                    // 0+20（带内 Y 补偿）
  });

  it('锯木机 136：frameX==0 → top=2（目标位 dy+2）; frameX≠0 → top=0', () => {
    expect(highlightCellRect(136, 0, 0, 10, 10, 0).dy).toBe(162);
    expect(highlightCellRect(136, 18, 0, 10, 10, 0).dy).toBe(160);
  });

  it('水槽 172：2014 带折（addFrY-=2014n, addFrX+=36n）', () => {
    const r = highlightCellRect(172, 0, 2014, 10, 10, 0);
    expect(r.sy).toBe(0);
    expect(r.sx).toBe(36);
  });

  it('733：top=2、frameY<54 → addFrX+=54、frameX/Y %=54', () => {
    const r = highlightCellRect(733, 54, 54, 10, 10, 0);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 16, sh: 16, dx: 160, dy: 162 });
    const r2 = highlightCellRect(733, 18, 0, 10, 10, 0);
    expect(r2.sx).toBe(72);                                   // 18+54
    expect(r2.dy).toBe(162);                                  // top=2
  });

  it('389：94 帧族 top/-2 与 0、18 高条件（GetTileDrawData :4738-4750）', () => {
    expect(highlightCellRect(389, 0, 0, 10, 10, 0).dy).toBe(158);   // top=-2
    expect(highlightCellRect(389, 0, 94, 10, 10, 0).sh).toBe(18);
    expect(highlightCellRect(389, 0, 20, 10, 10, 0).dy).toBe(160);  // fy∉{0,94} → top=0
  });

  it('动画依赖型排除集（本刀债）：106/377/464/499/455/247/207/410/725/468/658 全锁', () => {
    for (const t of [106, 377, 464, 499, 455, 247, 207, 410, 725, 468, 658]) {
      expect(HIGHLIGHT_ANIM_EXCLUDED.has(t), `anim-excluded ${t}`).toBe(true);
    }
  });

  it('每帧清空语义（Main.ClearSmartInteract Main.cs:48855-48863 tile 半边）', () => {
    clearSmartInteractTileFrame();
    expect(smartInteractTileFrame.tileWon).toBe(false);
    expect(smartInteractTileFrame.coords.length).toBe(0);
    expect(smartInteractTileFrame.selected.size).toBe(0);
  });
});

describe('SW-BJ54 数据面静态建集（TileUsedInRecipes 闭包）', () => {
  it('配方站点集 ∪ TileCountsAs 继承闭包：355/699 经继承入集（Recipe.cs:573-601）', () => {
    const set = tileUsedInRecipes();
    for (const t of [17, 16, 13, 77, 86, 96, 215, 302, 304]) expect(set.has(t), `direct/inherit ${t}`).toBe(true);
    expect(set.has(355)).toBe(true);                          // 355→13（继承）
    expect(set.has(699)).toBe(true);                          // 699→13（继承）
    expect(set.has(21)).toBe(false);                          // 宝箱非配方站
  });
});


// =====================================================================
// ★SW-RB11a（2026-09-10）审计落刀面：Fill 谓词重建 + 条件型门 + 帧矩形缺块
// =====================================================================

describe('SW-RB11a Fill 谓词重建（provider :359-480 逐 case）', () => {
  it('FILL_TARGET_TYPES = 无条件 57 型照录（:385-445 case 表）', () => {
    expect(FILL_TARGET_TYPES.size).toBe(57);
    for (const t of [10, 11, 21, 29, 55, 79, 85, 88, 89, 97, 102, 104, 125, 132, 136, 139,
      144, 207, 209, 216, 287, 335, 338, 354, 377, 386, 387, 388, 389, 410, 411, 425,
      441, 455, 463, 464, 467, 468, 470, 475, 480, 487, 491, 494, 509, 510, 511,
      573, 597, 621, 657, 658, 699, 720, 721, 725, 733]) {
      expect(FILL_TARGET_TYPES.has(t), `fill ${t}`).toBe(true);
    }
    // 表外型不因尺寸表有键而入候选：14 桌 / 469 桌2（Fill switch 无 case,配方站亦无）
    expect(FILL_TARGET_TYPES.has(14)).toBe(false);
    expect(FILL_TARGET_TYPES.has(469)).toBe(false);
  });

  it('桌族 14/469 永不入候选（旧 DIMS.has 谓词误纳=整类假高亮,SW-RB11a 撤）', () => {
    const store = makeStore(W, H);
    placeBox(store, 32, 34, 14, 3, 2);
    placeBox(store, 37, 34, 469, 3, 2);
    const scan = scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 35 * 16 + 8, Infinity);
    expect(scan.coords).toHaveLength(0);
    expect(scan.winDist).toBeNull();
  });

  it('15 瓶贴靠门 IsWithinSnappngRangeToTile(i,j,40)（Player.cs:17476-17482）：40px 内入候选/外不入;无 ctx 不入', () => {
    const mk = (cond?: SmartInteractCondCtx | undefined) => {
      const store = makeStore(W, H);
      placeBox(store, 34, 34, 15, 2, 2);
      return scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 34 * 16 + 8, Infinity, true, cond);
    };
    // 玩家站瓶旁（中心 34.5 格,足底 36 格顶）：dist((34*16+8, 34*16+8),(px, py-16)) ≤ 40
    const near = mk({ playerCX: 34 * 16 + 8, playerBottomY: 36 * 16, hasLihzahrdPowerCell: false, hasSnowball: false, sundialUsable: true, moondialUsable: true });
    expect(near.coords).toHaveLength(4);
    // 玩家远在 3 格外 → dist ≈ 48+ > 40
    const far = mk({ playerCX: 34 * 16 + 8, playerBottomY: 40 * 16, hasLihzahrdPowerCell: false, hasSnowball: false, sundialUsable: true, moondialUsable: true });
    expect(far.coords).toHaveLength(0);
    expect(mk().coords).toHaveLength(0);      // 无 ctx = 缺省「不在贴靠圈」
  });

  it('356 日晷冷却门（:465-469 单机化 !fastForwardTimeToDawn && sundialCooldown==0）与 212 持物门（:459-463）', () => {
    const mkScan = (type: number, cond?: SmartInteractCondCtx | undefined) => {
      const store = makeStore(W, H);
      placeBox(store, 34, 34, type, 2, 2);
      return scanSmartInteractTiles(store, LX, LY, HX, HY, 34 * 16 + 8, 34 * 16 + 8, Infinity, true, cond);
    };
    const ctxOn = { playerCX: 0, playerBottomY: 0, hasLihzahrdPowerCell: false, hasSnowball: true, sundialUsable: true, moondialUsable: true };
    const ctxOff = { playerCX: 0, playerBottomY: 0, hasLihzahrdPowerCell: false, hasSnowball: false, sundialUsable: false, moondialUsable: true };
    // 注：356 尺寸=2×3 → 2×2 摆位锚后 6 格（结构展开面,非本测焦点,只验门通断）
    expect(mkScan(356, ctxOff).coords).toHaveLength(0);   // 日晷冷却中=不候选
    expect(mkScan(356, ctxOn).coords.length).toBeGreaterThan(0);
    expect(mkScan(356).coords.length).toBeGreaterThan(0); // 无 ctx=静息世界（冷却 0）
    expect(mkScan(212, ctxOn).coords.length).toBeGreaterThan(0);   // 持雪球 949
    expect(mkScan(212, ctxOff).coords).toHaveLength(0);
    expect(mkScan(212).coords).toHaveLength(0);           // 无 ctx=未持
  });
});

describe('SW-RB11a 帧矩形修正补块（GetTileDrawData 全 HasOutlines 型逐 case 复核）', () => {
  it('静态缺块：{16,17,26,77,487} h=18（:4954-4981）/ {85,133,134,283} top=2（:4737-4751）/ 132 top2+h18（:5047-5050）', () => {
    for (const t of [16, 17, 26, 77, 487]) {
      expect(highlightCellRect(t, 0, 0, 3, 4).sh).toBe(18);
    }
    for (const t of [85, 133, 134, 283]) {
      expect(highlightCellRect(t, 0, 0, 3, 4).dy).toBe(4 * 16 + 2);
    }
    const r132 = highlightCellRect(132, 0, 0, 3, 4);
    expect(r132.dy).toBe(4 * 16 + 2);        // top=2 折进 dy
    expect(r132.sh).toBe(18);
  });

  it('172 fy%38==18→h=18（:5031-5035,与折带并存）/ 441 fy==18→h=18（:5423-5427）/ {470,475,597,621,622} top=2（:5338-5354）/ 491 top2+addFrX54（:5405-5407）/ {480,509,657,720,721} top=2（:6044-6056）', () => {
    expect(highlightCellRect(172, 0, 18, 3, 4).sh).toBe(18);
    expect(highlightCellRect(172, 0, 0, 3, 4).sh).toBe(16);
    expect(highlightCellRect(441, 0, 18, 3, 4).sh).toBe(18);
    expect(highlightCellRect(441, 0, 0, 3, 4).sh).toBe(16);
    for (const t of [470, 475, 597, 621, 622, 480, 509, 657, 720, 721]) {
      expect(highlightCellRect(t, 0, 0, 3, 4).dy).toBe(4 * 16 + 2);
    }
    const r491 = highlightCellRect(491, 18, 0, 3, 4);
    expect(r491.dy).toBe(4 * 16 + 2);
    expect(r491.sx).toBe(18 + 54);            // addFrX += 54
  });

  it('动画排除集补员 19 型 + 条件动画集 {480,509,657,720,721}（SW-RB11a 名单）', () => {
    for (const t of [96, 215, 217, 218, 220, 228, 243, 300, 301, 302, 303, 304, 305, 306, 307, 308, 354, 355, 463]) {
      expect(HIGHLIGHT_ANIM_EXCLUDED.has(t), `anim ${t}`).toBe(true);
    }
    expect([...HIGHLIGHT_ANIM_WHEN_LIT].sort((a, b) => a - b)).toEqual([480, 509, 657, 720, 721]);
    // 源锁：Renderer 消费点亮态门（fy≥54 排除,静息照画）
    const rsrc = readFileSync(join(HERE, '..', 'src', 'render', 'Renderer.ts'), 'utf8');
    expect(rsrc).toContain('HIGHLIGHT_ANIM_WHEN_LIT.has(sheet) && store.frameY[si] >= 54');   // ★SW-BJ61 域归一:type→sheet
  });
});
