// SW-BJ63（2026-09-11）宝箱智能交互高亮链路回归 —— 用户实报"靠近宝箱光标移到宝箱,
// 宝箱贴图周围没有框发光高亮"。取证结论（探针 _bj63/_bj63-real + 1457 源锚）:
//   链路本身无断（真世界手摆箱/世界生成箱 × Ctrl 智能光标 → tileWon+候选 4 格+
//   绘制调用+像素 diff 2907 字节可视）;触发面=Main.SmartCursorIsUsed（Main.cs:2985
//   => SmartCursorWanted;Player.cs:17497-17499 门——纯鼠标无高亮=原版本相）,
//   且 1457 缺省 cSmartCursorModeIsToggleAndNotHold=true（Main.cs:67589,TOGGLE 模式
//   ——按 Ctrl 开/关,松键不清;仓库 SmartCursor.ts:161 toggleMode:true 1:1）。
// 本测试把链路逐环钉死（域归一/候选/块门/姿态带矩形/mask 素材在库/排除集/源锚接线）,
// 任何一环断裂即红（变异证红见文件尾注）。
//
// 【1457 锚】
//  - Player.cs:17492 SmartInteractLookup → :17497-17499 门（SmartCursorIsUsed ∧
//    mouseItem.IsAir）→ :17501-17523 PrepareCommonlyUsedInfo+RunQuery
//  - SmartInteractSystem.RunQuery → TileSmartInteractCandidateProvider.ProvideCandidate
//  - Main.cs:2985 SmartCursorIsUsed => SmartCursorWanted;:67589 toggle 缺省 true
//  - TileDrawing.cs:902-905 HasOutlines 门 → :4518-4530 GetTileOutlineInfo
//    （avg=(R+G+B)/3 整除、>10 门、HighlightMask[type]+GetSelectionGlowColor）
//  - TileDrawing.cs:4319-4360 CacheSpecialDraws_Part2 宝箱姿态带（chest[].frame
//    0/1/2 → addFrY +0/38/76;底行 tileHeight=18）
//  - AssetInitializer.cs:655-660 HighlightMask 素材 = Images/Misc/TileOutlines/Tiles_<type>
//  - 1458 核对：Terarria1458 同域零变更（Player.cs:17490-17512 逐句同）
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import {
  scanSmartInteractTiles,
  shouldBlockSmartInteract,
  FILL_TARGET_TYPES,
  clearSmartInteractTileFrame,
  smartInteractTileFrame,
} from '../src/core/SmartInteractTiles';
import {
  TILE_HAS_OUTLINES,
  HIGHLIGHT_ANIM_EXCLUDED,
  getSelectionGlowColor,
  highlightCellRect,
  loadHighlightMask,
} from '../src/render/TileHighlight';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUB = join(HERE, '..', 'public');

/** ★SW-BJ61 域归一锚（全链依赖）:真宝箱 = internal 16 → vanilla sheet 21;
 *  internal 21 是高草（sheet 3）——若映射回退（内部 id 直配 sheet 表）,
 *  宝箱高亮将取 Tiles_16（铁砧 mask）/草吃宝箱候选,双错。 */
const CHEST = TILE_BY_KEY['chest'];
const CHEST_SHEET = TILE_DEFS[CHEST]?.vanilla?.sheet;

function makeScene(): { store: TileStore; cx: number; cy: number } {
  const store = new TileStore(48, 48);
  // 石地板 + 宝箱 2×2 @ (24,20),frameX=0/18 frameY=0/18（style0 木箱原版帧值）
  for (let x = 18; x <= 32; x++) store.setTileSilent(x, 24, 1, 0, 0);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    store.setTileSilent(24 + i, 20 + j, CHEST, i * 18, j * 18);
  }
  return { store, cx: 24, cy: 20 };
}

describe('SW-BJ63 宝箱智能交互高亮链路', () => {
  it('环① 域归一:TILE_BY_KEY.chest=16 → sheet 21;internal 21 非宝箱', () => {
    expect(CHEST).toBe(16);
    expect(CHEST_SHEET).toBe(21);
    expect(TILE_DEFS[21]?.vanilla?.sheet).not.toBe(21);
    expect(TILE_DEFS[21]?.key).toBe('tallgrass');
  });

  it('环② 候选:真宝箱 internal16 入 targets（FILL 谓词）,整件展开=2×2 全 4 格', () => {
    const { store, cx, cy } = makeScene();
    expect(FILL_TARGET_TYPES.has(CHEST_SHEET!)).toBe(true);      // provider :385-445 case 21
    // 光标对准宝箱格心,扫描域覆盖玩家周身
    const scan = scanSmartInteractTiles(store, 10, 10, 38, 38, cx * 16 + 8, cy * 16 + 8, Infinity, true, undefined);
    expect(scan.coords.length).toBe(4);
    expect(scan.selected.length).toBe(4);
    const keys = scan.coords.map((c) => `${c.x},${c.y}`).sort();
    expect(keys).toEqual(['24,20', '24,21', '25,20', '25,21']);
    expect(scan.winDist).toBeGreaterThanOrEqual(0);
  });

  it('环②b 块门:宝箱格非 DisableSmartInteract（:12-25 不拦）', () => {
    const { store, cx, cy } = makeScene();
    expect(shouldBlockSmartInteract(store, cx, cy)).toBe(false);
  });

  it('环③ 姿态带矩形:CacheSpecialDraws_Part2 1:1——closed +0、开盖 +38/+76、底行 h=18', () => {
    // style0 顶行 (fx=0,fy=0):closed
    expect(highlightCellRect(21, 0, 0, 24, 20, 0)).toMatchObject({ sx: 0, sy: 0, sw: 16, sh: 16 });
    // 底行 (fx=18,fy=18):h=18、sy=18
    expect(highlightCellRect(21, 18, 18, 25, 21, 0)).toMatchObject({ sx: 18, sy: 18, sw: 16, sh: 18 });
    // 开盖姿态带:chest[].frame=1 → sy+38;frame=2 → sy+76
    expect(highlightCellRect(21, 0, 0, 24, 20, 1).sy).toBe(38);
    expect(highlightCellRect(21, 0, 0, 24, 20, 2).sy).toBe(76);
    // 金箱族 467 同带
    expect(highlightCellRect(467, 0, 0, 0, 0, 1).sy).toBe(38);
  });

  it('环④ mask 素材在库:HasOutlines 全 95 型 png 盘上存在（图集事故/prune 丢失即红）', () => {
    expect(TILE_HAS_OUTLINES.has(21)).toBe(true);
    expect(TILE_HAS_OUTLINES.has(467)).toBe(true);
    for (const sheet of TILE_HAS_OUTLINES) {
      const p = join(PUB, 'sprites', 'vanilla', `Misc_TileOutlines_Tiles_${sheet}.png`);
      if (!existsSync(p)) throw new Error(`HighlightMask 素材丢失: ${p}`);
    }
    // 宝箱 mask 非空文件
    const st = readFileSync(join(PUB, 'sprites', 'vanilla', 'Misc_TileOutlines_Tiles_21.png'));
    expect(st.length).toBeGreaterThan(1000);
  });

  it('环④b mask 加载通道:直读文件路径（非 vui 键——UI_Camera 丢失同款风险不适用）', () => {
    // loadHighlightMask 的 src 模板必须仍指向 sprites/vanilla 直读路径;
    // 若被改走 vanilla-ui.json vui() 键,图集键位事故会整链静默断（键在册性随链审计）。
    const src = readFileSync(join(HERE, '..', 'src', 'render', 'TileHighlight.ts'), 'utf8');
    expect(src).toContain('`sprites/vanilla/Misc_TileOutlines_Tiles_${type}.png`');
    // vitest(node) 无 Image:懒加载须返回 null 而非抛错（渲染侧 `if (!mask) continue` 消费）
    expect(loadHighlightMask(21)).toBeNull();
    expect(loadHighlightMask(467)).toBeNull();
  });

  it('环⑤ 排除集:宝箱 21/467 不在动画排除集（画高亮）', () => {
    expect(HIGHLIGHT_ANIM_EXCLUDED.has(21)).toBe(false);
    expect(HIGHLIGHT_ANIM_EXCLUDED.has(467)).toBe(false);
  });

  it('环⑥ 色彩:GetSelectionGlowColor（Colors.cs:127-130）白/黄两态', () => {
    expect(getSelectionGlowColor(false, 255)).toEqual([127, 127, 127, 255]);
    expect(getSelectionGlowColor(true, 255)).toEqual([255, 255, 85, 255]);
  });

  it('环⑦ 源锚:触发面门序（Game.tickSmartInteractTiles）与渲染挂点（Renderer 7b-bis）在链', () => {
    const game = readFileSync(join(HERE, '..', 'src', 'core', 'Game.ts'), 'utf8');
    // 门:Main.SmartCursorIsUsed ∧ mouseItem.IsAir（Player.cs:17497-17499）——
    // 纯鼠标（智能光标未激活）无高亮=原版本相,不得改成无条件扫描
    expect(game).toMatch(/if \(!this\.smartCursor\.wanted \|\| this\.player\.dead\) return;/);
    expect(game).toMatch(/if \(this\.uiHeldItemRef\?\.\(\)\) return;/);
    expect(game).toMatch(/smartInteractTileFrame\.tileWon = true/);
    const renderer = readFileSync(join(HERE, '..', 'src', 'render', 'Renderer.ts'), 'utf8');
    expect(renderer).toContain('this.drawSmartInteractTileHighlights(');
    // avg>10 门（TileDrawing.cs:4523-4525）+ mask 就绪门在渲染体
    expect(renderer).toMatch(/if \(avg <= 10\) continue;/);
    expect(renderer).toMatch(/if \(!mask\) continue;/);
  });

  it('环⑧ 帧态:clearSmartInteractTileFrame 每帧清空（Main.ClearSmartInteract :48855-48863 tile 半边）', () => {
    smartInteractTileFrame.tileWon = true;
    (smartInteractTileFrame.coords as unknown as unknown[]) = [{ x: 1, y: 1 }];
    smartInteractTileFrame.selected = new Set(['1,1']);
    clearSmartInteractTileFrame();
    expect(smartInteractTileFrame.tileWon).toBe(false);
    expect(smartInteractTileFrame.coords.length).toBe(0);
    expect(smartInteractTileFrame.selected.size).toBe(0);
  });
});

/* 【变异证红（2026-09-11 实跑,vitest run tests/sw-bj63-chest-highlight-chain）】
 *  M1 SmartInteractTiles.sheetOfStoreType 撤域归一（return type 直配）→ 环②红
 *     （1 failed/9 passed——宝箱候选查 sheet 表错位,BJ61 前历史病灶）。
 *  M3 TileHighlight.highlightCellRect BASIC_CHEST num5 38→36 → 环③红
 *     （1 failed/9 passed——开盖姿态带错位）。
 *  M2 FILL_TARGET_TYPES 删 21 → 环②红（宝箱无配方站资格,唯一入集通道=Fill case,直判）。
 *  M4 Renderer 渲染体删 `if (avg <= 10) continue;` → 环⑦红（源锚正则失配,直判）。
 *  全部变异还原后本文件全绿（10/10）;族内 bj54/bj61/fx28/fx30 同批 109/109。 */
