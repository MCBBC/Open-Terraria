// BJ471（2026-09-23）床智能光标高亮「只包左半」——定谳 = 原版同款（销案,本测试 = 判谳锁）
//
// 【用户实报】史莱姆床智能光标黄色描边只包左半,光标移到右侧才变（疑=多格高亮矩形按 frame 半格算）。
//
// 【原版定谳（1457 亲读）】
//  · 床 tile 79 本体 = 4 宽 × 2 高：TileObjectData.cs addTile(79)（:2646）← CopyFrom(Style4x2)
//    （Width=4/Height=2/CoordinateWidth=16/CoordinatePadding=2/StyleHorizontal）+
//    CoordinateHeights={16,18}（:2610 区段）+ CoordinatePaddingFix=(0,-2)——其后 4×3 块
//    （Origin(1,2)/AnchorBottom(2,1)）属 addTile(209)（:2662）非床。
//  · 智能交互高亮尺寸表 = TileSmartInteractCandidateProvider.cs:176-183：
//      case 79/139/510/511 → num7=2, num8=2, num11=0
//    ——139 音乐盒/510/511 箭头牌本体 2×2 = 全件;唯 4 宽的床被同组收成【悬停半边】。
//  · 帧布局：frameX = 方向带*72 + 列*18（Player.cs:33589-33597 IsHoveringOverABottomSideOfABed
//    = frameX/72==1 翻转 frameX%72<36）;frameY = style*36 + 行*18（Player.cs:33873
//    style = frameY/36;SlimeBed = ItemID.cs:6682 = 2568 ← WorldGen.cs:40355 GetItemDrop_Beds
//    case 25 → 2568,即史莱姆床 = style 25,frameY 基 900）。
//  · 锚回溯（provider :325-326）：ax = tx - frameX%(18*2)/18 —— frameX%36 ∈ {0,18} →
//    列 0/1 → 锚列 0（左半）,列 2/3 → 锚列 2（右半）;ay = ty - frameY%(36)/18 → 行 0/1
//    → 锚行 0（全高）。高亮盒 = 2 宽 × 2 高 = 【光标所在半边 × 全高】。
//  · 黄/白两态：selected（黄调 GetSelectionGlowColor(true)）= 含最近目标格的首件整件盒
//    （provider :337-353 flag/flag2 首件保位）= 悬停半边;另一 半边经 FullInteraction=true
//    （Player.cs:17506 PC 恒 true）仍入 coords = 白调 (avg/2,avg/2,avg/2)。
//  · 渲染 = TileDrawing.cs:4518-4529 GetTileOutlineInfo 逐格 HighlightMask[type] +
//    Colors.GetSelectionGlowColor（Colors.cs:127-130）——黄描边恒只罩光标所在半边,
//    移到另一半才移过去 = 【用户实报即原版行为】。
//  · 本仓 = SmartInteractTiles.ts CANDIDATE_TILE_DIMS [79,139,510,511]→[2,2,0]（:103）+
//    同式锚回溯（:330-331）+ 首件保位（:336）——SW-BJ54 链 1:1,Game.tickSmartInteractTiles
//    （Game.ts:37147）接线同式。销案,无落刀面。
//
// 【普查】全件组（尺寸表=本体全尺寸）:箱 21 2×2/门 10 1×3/梳妆台 88 3×1/工作台 18 2×1/
//  熔炉 17 3×2/铁砧 16 2×1（后三型经 Recipe.TileUsedInRecipes 入候选）——selected 恒全件;
//  单格 136 开关/494 高尔夫球座 1×1 不回归;同组 139 不因床半边语义误伤。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import { scanSmartInteractTiles, CANDIDATE_TILE_DIMS } from '../src/core/SmartInteractTiles';
import { TILE_DEFS } from '../src/data/tiles';

const HERE = dirname(fileURLToPath(import.meta.url));

/** ★SW-BJ61 域归一：夹具入参 vanilla sheet 域,写 store 转内部 id（生产链同式） */
function internalOfSheet(sheet: number): number {
  const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  return i >= 0 ? i : sheet;
}

function makeStore(w: number, h: number): TileStore {
  return new TileStore(w, h);
}

/** 按 vanilla 帧布局摆件：frameX = baseFx + 列*18,frameY = baseFy + 行*18 */
function placeBox(store: TileStore, x: number, y: number, sheet: number, cols: number, rows: number, baseFx = 0, baseFy = 0) {
  const internal = internalOfSheet(sheet);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const si = store.idx(x + i, y + j);
      store.type[si] = internal;
      store.flags[si] = 1;
      store.frameX[si] = baseFx + i * 18;
      store.frameY[si] = baseFy + j * 18;
    }
  }
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function sortedOf(scan: { coords: Array<{ x: number; y: number }>; selected: Array<{ x: number; y: number }> }) {
  return {
    coords: scan.coords.map((c) => key(c.x, c.y)).sort(),
    selected: scan.selected.map((c) => key(c.x, c.y)).sort(),
  };
}

const W = 100, H = 100;
const LX = 30, LY = 30, HX = 40, HY = 40;   // 扫描域（避开 clamp 边）
const hover = (tx: number, ty: number) => [tx * 16 + 8, ty * 16 + 8] as const;

/** 床标准位：(34,34)..(37,35) 4×2;style 0、方向带 0（frameX 0/18/36/54,frameY 0/18） */
function bedStore(): { store: TileStore; scan: (tx: number, ty: number) => ReturnType<typeof scanSmartInteractTiles> } {
  const store = makeStore(W, H);
  placeBox(store, 34, 34, 79, 4, 2);
  return { store, scan: (tx, ty) => { const [mx, my] = hover(tx, ty); return scanSmartInteractTiles(store, LX, LY, HX, HY, mx, my, Infinity); } };
}

const LEFT_HALF = ['34,34', '34,35', '35,34', '35,35'];
const RIGHT_HALF = ['36,34', '36,35', '37,34', '37,35'];
const WHOLE_BED = [...LEFT_HALF, ...RIGHT_HALF].sort();

describe('BJ471 床智能交互高亮 = 悬停半边（原版 TileSmartInteractCandidateProvider.cs:176-183 判谳锁）', () => {
  it('尺寸表照录：[79,139,510,511] → [2,2,0]（num11 显式 0,provider :176-183）', () => {
    const got = CANDIDATE_TILE_DIMS.filter(([t]) => [79, 139, 510, 511].includes(t)).map(([, c, r, e]) => [c, r, e]);
    expect(got).toEqual([[2, 2, 0], [2, 2, 0], [2, 2, 0], [2, 2, 0]]);
  });

  it('本体尺寸同源：tiles.ts 床 = w:4,h:2（TileObjectData CopyFrom(Style4x2)+CoordinateHeights{16,18}）', () => {
    const bed = TILE_DEFS.find((d) => d?.vanilla?.sheet === 79);
    expect(bed?.vanilla).toMatchObject({ sheet: 79, fw: 4, fh: 2 });
    const src = readFileSync(join(HERE, '..', 'src', 'data', 'tiles.ts'), 'utf8');
    expect(src).toMatch(/key: 'bed'.*w: 4, h: 2/);
  });

  it('左半悬停（列 0/列 1）→ selected 恒左半 2×2;coords = 整件 8 格（FullInteraction 白调另半）', () => {
    const { scan } = bedStore();
    for (const tx of [34, 35]) {
      const s = scan(tx, 34);
      expect(s.winX).toBe(tx);
      const { coords, selected } = sortedOf(s);
      expect(coords).toEqual(WHOLE_BED);
      expect(selected).toEqual(LEFT_HALF);
    }
  });

  it('右半悬停（列 2/列 3）→ selected 移到右半 2×2（描边跟随半边 = 用户实报行为）', () => {
    const { scan } = bedStore();
    for (const tx of [36, 37]) {
      const s = scan(tx, 34);
      expect(s.winX).toBe(tx);
      const { coords, selected } = sortedOf(s);
      expect(coords).toEqual(WHOLE_BED);
      expect(selected).toEqual(RIGHT_HALF);
    }
  });

  it('下行悬停（frameY=18,frameY%36/18=1）→ 锚折回顶行 = 全高两行（原版全高半宽）', () => {
    const { scan } = bedStore();
    const s = scan(35, 35);                                   // 左半下行格
    const { selected } = sortedOf(s);
    expect(selected).toEqual(LEFT_HALF);
  });

  it('史莱姆床（style 25,frameY 基 900）+ 方向带 1（frameX 基 72）：col3（fx=126）悬停 → 右半 2×2（style/朝向无关）', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 79, 4, 2, 72, 900);               // frameX 72/90/108/126,frameY 900/918
    const [mx, my] = hover(37, 34);                           // col3
    const s = scanSmartInteractTiles(store, LX, LY, HX, HY, mx, my, Infinity);
    expect(s.winX).toBe(37);
    const { coords, selected } = sortedOf(s);
    expect(coords).toEqual(WHOLE_BED);
    expect(selected).toEqual(RIGHT_HALF);                     // 126%36=18 → 锚 37-1=36（右半）
    // 同件左半（col1,fx=90）
    const [mx2, my2] = hover(35, 34);
    const s2 = scanSmartInteractTiles(store, LX, LY, HX, HY, mx2, my2, Infinity);
    expect(sortedOf(s2).selected).toEqual(LEFT_HALF);         // 90%36=18 → 锚 35-1=34（左半）
  });
});

describe('BJ471 普查——全件组 selected 恒整件（尺寸表=本体全尺寸,无床式半边）', () => {
  const cases: Array<[string, number, number, number, number]> = [
    ['宝箱 21（2×2）', 21, 2, 2, 0],
    ['门 10（1×3）', 10, 1, 3, 0],
    ['梳妆台 88（3×1）', 88, 3, 1, 0],
    ['工作台 18（2×1,配方站入候选）', 18, 2, 1, 0],
    ['熔炉 17（3×2,配方站入候选）', 17, 3, 2, 0],
    ['铁砧 16（2×1,配方站入候选）', 16, 2, 1, 0],
  ];
  for (const [name, sheet, cols, rows] of cases) {
    it(`${name}：hover 首格 → selected = 整件 ${cols}×${rows}`, () => {
      const store = makeStore(W, H);
      placeBox(store, 34, 34, sheet, cols, rows);
      const [mx, my] = hover(34, 34);
      const s = scanSmartInteractTiles(store, LX, LY, HX, HY, mx, my, Infinity);
      const { coords, selected } = sortedOf(s);
      const whole: string[] = [];
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) whole.push(key(34 + i, 34 + j));
      expect(coords.sort()).toEqual(whole.sort());
      expect(selected).toEqual(whole.sort());
    });
  }

  it('同组不误伤：音乐盒 139（本体 2×2）selected = 整件（床半边语义仅床本体尺寸所致）', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 139, 2, 2);
    const [mx, my] = hover(34, 34);
    const s = scanSmartInteractTiles(store, LX, LY, HX, HY, mx, my, Infinity);
    const { coords, selected } = sortedOf(s);
    expect(coords).toEqual(['34,34', '34,35', '35,34', '35,35']);
    expect(selected).toEqual(['34,34', '34,35', '35,34', '35,35']);
  });
});

describe('BJ471 单格不回归', () => {
  it('开关 136（1×1）：hover → coords/selected = 单格', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 136, 1, 1);
    const [mx, my] = hover(34, 34);
    const s = scanSmartInteractTiles(store, LX, LY, HX, HY, mx, my, Infinity);
    expect(s.winX).toBe(34);
    expect(s.winY).toBe(34);
    expect(sortedOf(s)).toEqual({ coords: ['34,34'], selected: ['34,34'] });
  });

  it('高尔夫球座 494（1×1）：同上', () => {
    const store = makeStore(W, H);
    placeBox(store, 34, 34, 494, 1, 1);
    const [mx, my] = hover(34, 34);
    const s = scanSmartInteractTiles(store, LX, LY, HX, HY, mx, my, Infinity);
    expect(sortedOf(s)).toEqual({ coords: ['34,34'], selected: ['34,34'] });
  });
});
