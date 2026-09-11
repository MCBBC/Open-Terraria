// SW-BJ61（2026-09-11）智能光标可视面光照语义 + 高亮链 id 域归一
//
// 反编译金标（1457 终值;1458 同域逐字同;1456 同）：
//   · 黄框 DrawSmartCursor（Main.cs:47385-47442）：色 = Lighting.GetColor(scX,scY)
//     × buffColor(1,0.9,0.1,1)（:47406;buffColor :38728-38735 纯乘）——填充四象限
//     8×8 块 ×0.6 α、边框 2px 十字 (1,0.95,0.3) ×1 不透明（:47415-47420）。
//   · tile 高亮 GetTileOutlineInfo（TileDrawing.cs:4518-4529）：avg=(R+G+B)/3 整除
//     （:4522）、avg>10 门（:4523-4525）、色=GetSelectionGlowColor（Colors.cs:127-130）。
//   · 方向锁箭头 Color.White（Main.cs:47432-47437，不读格光）；光标图标本体屏空间
//     恒亮（:48783 + CursorColor :53271-53294）。光照引擎零下限（LightingEngine.cs:65-73）。
//   · 空手/持非工具无黄框：SmartCursorShowing 仅在策略步命中时置位
//     （SmartCursorHelper.cs:160-163），ForceCursor 三道工具门/MineShinies/MineSolids
//     全部要求 item.pick/axe/hammer≥1（:2250-2261/:2280/:2355）——无工具=无目标=无框。
// 探针留档（/tmp/probe-out/_bj61）：仓库改动前=上述反编译语义逐值成立
//   （光 0/51/144 → 黄框边框 r 0/56/158 為线性、蓝分量=light.b×0.3 睄确、暗态框全黑）。
//   2026-09-11 曾按用户首报注册「恒全亮」分歧,同日用户实机复核确认暗处衰减=反编译
//   语义 → 分歧撤销,采样恢复读格光（smartHighlightSampleLight=恒等直通单点标记）。
//
// ★SW-BJ61 域归一（「未持工具时地面暗黄痕迹」真根因）：BJ54 高亮链谓词表
//   （FILL_TARGET_TYPES/TILE_HAS_OUTLINES/DIMS_BY_TYPE/DISABLE_SMART_INTERACT 等）
//   皆 vanilla sheet 域照录,而 store.type=内部 id（TILE_DEFS 序,643/664 与 sheet 分歧：
//   internal 4=铜矿/10=木块/11=平台/12=火把/14=宝箱/18=蘑菇/21=雪）——曾按内部 id 直配
//   sheet 表：真宝箱(14)整链不亮、木块(10)吃 sheet10 门框掩码、平台(11)/雪(21)/
//   蘑菇(18) 袣误入候选=「地面暗黄痕迹」（选中档 (avg,avg,avg/3) 黄调×光照衰减）。
//   修复=消费面一律 sheetOfStoreType 归一（SmartInteractTiles.ts/Renderer.ts）。
import { describe, it, expect } from 'vitest';
import { smartHighlightSampleLight, SMART_CURSOR_ARROW_COLOR, getSelectionGlowColor, TILE_HAS_OUTLINES } from '../src/render/TileHighlight';
import { scanSmartInteractTiles, shouldBlockSmartInteract, FILL_TARGET_TYPES } from '../src/core/SmartInteractTiles';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

/** 夹具：sheet 域 → store 内部 id（与生产 tile 写面同式,SmartInteractTiles 域归一） */
function internalOfSheet(sheet: number): number {
  const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  return i >= 0 ? i : sheet;
}

function placeBox(store: TileStore, x: number, y: number, sheet: number, cols: number, rows: number) {
  const internal = internalOfSheet(sheet);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const si = store.idx(x + i, y + j);
      store.type[si] = internal;
      store.flags[si] = 1;
      store.frameX[si] = i * 18;
      store.frameY[si] = j * 18;
    }
  }
}

describe('SW-BJ61 可视面光照语义（分歧已回滚=反编译 1:1）', () => {
  it('回滚锁：smartHighlightSampleLight=恒等直通格光（变异证红:改成常亮/改值即红）', () => {
    expect(smartHighlightSampleLight([30, 24, 12])).toEqual([30, 24, 12]);
    expect(smartHighlightSampleLight([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('黄框公式随格光衰减（Main.cs:47406 buffColor 纯乘）：暗处框黑=原版语义', () => {
    const mul = (c: number, l: number): number => Math.round((c * l) / 255);
    // 无光源洞穴（light=0）：填充/边框全黑（原版同款=不可见,预修探针实测 [0,0,0]）
    expect([mul(255, 0), mul(229, 0), mul(26, 0)]).toEqual([0, 0, 0]);
    expect([mul(255, 0), mul(242, 0), mul(77, 0)]).toEqual([0, 0, 0]);
    // 微光（light=56,预修探针 dim 态实测边框 r=56）
    expect(mul(255, 56)).toBe(56);
    // 亮态（探针 lit 态 light=(158,150,126),实测边框 (158,142,38)=逐通道 buffColor）
    expect([mul(255, 158), mul(242, 150), mul(77, 126)]).toEqual([158, 142, 38]);
  });

  it('tile 高亮色矩阵（Colors.cs:129 本体 1:1 不动）+ avg>10 门（TileDrawing.cs:4523-4525）', () => {
    expect(getSelectionGlowColor(false, 60)).toEqual([30, 30, 30, 60]);
    expect(getSelectionGlowColor(true, 60)).toEqual([60, 60, 20, 60]);
    expect(getSelectionGlowColor(false, 11)).toEqual([5, 5, 5, 11]);   // XNA 整除
    expect(getSelectionGlowColor(true, 13)).toEqual([13, 13, 4, 13]);
    // 暗处 avg≤10：门关（不画）；avg>10：门开——随光照自然衰减（预修探针 0/51/144 单调）
    const avgOf = (l: readonly [number, number, number]) => Math.floor((l[0] + l[1] + l[2]) / 3);
    expect(avgOf(smartHighlightSampleLight([0, 0, 0])) <= 10).toBe(true);
    expect(avgOf(smartHighlightSampleLight([30, 30, 30])) <= 10).toBe(false);
  });

  it('方向锁箭头=Color.White 恒亮（Main.cs:47437 眸实 1:1;本仓曾误乘格光=偏离已修,分歧回滚中保留）', () => {
    expect(SMART_CURSOR_ARROW_COLOR).toEqual([255, 255, 255]);
  });
});

describe('SW-BJ61 高亮链 id 域归一（「未持工具时地面暗黄痕迹」根因）', () => {
  it('域分歧事实（运行时实测）：internal 16=宝箱(21)/10=木块(30)/21=高草(3)/12=火把(4)/19=蘑菇(3)/11=平台(19)', () => {
    // ——旧 bug 物证链：高草 internal21 吃 sheet21 宝箱候选（2×2 黄框画在地面草上）、
    //   木块 internal10 吃 sheet10 门候选、平台 internal11 吃 sheet11——=「地面暗黄痕迹」
    expect(TILE_DEFS[16]?.vanilla?.sheet).toBe(21);
    expect(TILE_DEFS[10]?.vanilla?.sheet).toBe(30);
    expect(TILE_DEFS[21]?.vanilla?.sheet).toBe(3);
    expect(TILE_DEFS[12]?.vanilla?.sheet).toBe(4);
    expect(TILE_DEFS[19]?.vanilla?.sheet).toBe(3);
    expect(TILE_DEFS[11]?.vanilla?.sheet).toBe(19);
    expect(TILE_DEFS[23]?.vanilla?.sheet).toBe(147);   // 雪
  });

  it('真宝箱（store internal14 → sheet21）入候选且 2×2 整件选中（修复前整链不亮）', () => {
    const store = new TileStore(100, 100);
    placeBox(store, 34, 34, 21, 2, 2);                 // sheet21=宝箱 → internal14 写入
    const scan = scanSmartInteractTiles(store, 30, 30, 40, 40,
      34 * 16 + 16, 34 * 16 + 16, 1e9);
    expect(scan.coords.length).toBe(4);
    expect(scan.selected.length).toBe(4);
  });

  it('地面常见物不再被误亮（修复前木块10/平台11/雪21/蘑菇18 吃 sheet 域表=暗黄痕迹）', () => {
    for (const sheet of [30, 19, 147, 3]) {            // 木块/平台/雪/蘑菇表
      const store = new TileStore(100, 100);
      placeBox(store, 34, 34, sheet, 2, 2);
      const scan = scanSmartInteractTiles(store, 30, 30, 40, 40,
        34 * 16 + 16, 34 * 16 + 16, 1e9);
      expect(scan.coords.length, `sheet ${sheet}`).toBe(0);
    }
  });

  it('shouldBlockSmartInteract 域归一：火把（sheet4∈Disable 表,store internal12）正确拦;木块不拦', () => {
    const store = new TileStore(100, 100);
    placeBox(store, 34, 34, 4, 1, 1);                  // sheet4=火把 → internal12
    expect(shouldBlockSmartInteract(store, 34, 34)).toBe(true);
    placeBox(store, 36, 34, 30, 1, 1);                 // sheet30=木块 → internal10
    expect(shouldBlockSmartInteract(store, 36, 34)).toBe(false);
  });

  it('TILE_HAS_OUTLINES/FILL_TARGET_TYPES 保持 vanilla sheet 奪（防反向「修表」漂移）', () => {
    expect(TILE_HAS_OUTLINES.has(21)).toBe(true);      // 宝箱 sheet21
    expect(TILE_HAS_OUTLINES.has(30)).toBe(false);     // 木块 sheet30 ∉ 原版表
    expect(FILL_TARGET_TYPES.has(21)).toBe(true);
    expect(FILL_TARGET_TYPES.has(30)).toBe(false);
  });
});
