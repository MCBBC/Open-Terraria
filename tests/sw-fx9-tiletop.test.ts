// ===========================================================================
// SW-FX9（2026-09-10）tileTop 偏移审计收口钉（登记债 rotation-parity-ledger.md 附段
// 2026-08-21 统一登记 21 tile + 苗类源矩形高）。
// ★现状定谳（对盘）：21 tile 偏移与苗类源矩形高已由 2026-08-28「全量对账补遗」
//   （DRAW_Y_OFFSET 补 27 项 + HEIGHT_18 补 19 项）与 2026-08-27/28 ChunkCache 底缝
//   补绘推广先期清偿——本批不复刻修复,以金标钉固化（逐偏移值直对 1457 反编译
//   GetTileDrawData/TileDrawing.cs 行号）,变异证红=任一表值漂移即红。
//   金标锚（Terarria1457/Terraria.GameContent.Drawing/TileDrawing.cs）：
//     正 2 组:652:4751-4753 100:4754-4760 530:4761-4781 705:4782-4784 485:4785-4796
//             489:4797-4811 490:4812-4830 143(=80/142/143 组):5088-5091 139:5092+
//             571:4627-4634 135:5048-5053 494:5071-5073
//     条件:136:4642-4646(frameX==0→2) 443:4617-4627(frameX/36>=2→−2 else 2)
//     负:529:4918(-14) 113:5103-5105(-12) 646:4896-4899(-4) 84:5054-5057(-2)
//        324:5062-5065(-2) 638(=52/62/…/638 组):5078-5087(-2) 561:4648(-2)
//     苗类源矩形高:20/590/595/615=tileHeight 18(:4938-4950) 476=20×18(:4717-4720)
//        589/596/616/634=20×20(:4710-4715,树干 blit 消费)
// ===========================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tileTopOf, drawVanillaCell } from '../src/render/VanillaTiler';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { SpriteAtlas, DrawRect } from '../src/assets/SpriteAtlas';

describe('SW-FX9 tileTop 金标钉（21 tile,GetTileDrawData 逐值）', () => {
  // 正偏移 13（正=下移插沙,贴图比无偏移低 2px）
  const POS: ReadonlyArray<readonly [number, number]> = [
    [571, 2], [530, 2], [135, 2], [494, 2], [143, 2], [139, 2], [652, 2],
    [100, 2], [705, 2], [485, 2], [489, 2], [490, 2],
  ];
  it.each(POS)('正偏移 tile %i → tileTop %i', (sheet, top) => {
    expect(tileTopOf(sheet, 0, 0)).toBe(top);
  });

  it('座钟 136 条件档：frameX==0 → 2,frameX=18(摆锤列) → 0（:4642-4646）', () => {
    expect(tileTopOf(136, 0, 0)).toBe(2);
    expect(tileTopOf(136, 18, 0)).toBe(0);
    expect(tileTopOf(136, 36, 0)).toBe(0);
  });

  it('间歇泉 443 条件档：frameX/36>=2 → -2,否则 2（:4617-4627）', () => {
    expect(tileTopOf(443, 0, 0)).toBe(2);
    expect(tileTopOf(443, 36, 0)).toBe(2);
    expect(tileTopOf(443, 72, 0)).toBe(-2);
    expect(tileTopOf(443, 108, 0)).toBe(-2);
  });

  // 负偏移 8（负=上移对齐）
  const NEG: ReadonlyArray<readonly [number, number, number]> = [
    [529, -14, 0], [113, -12, 0], [646, -4, 0],
    [84, -2, 0], [324, -2, 0], [638, -2, 0], [561, -2, 0],
  ];
  it.each(NEG)('负偏移 tile %i → tileTop %i', (sheet, top) => {
    expect(tileTopOf(sheet, 0, 0)).toBe(top);
  });
});

// ---------------------------------------------------------------------------
// 苗类源矩形高（tileHeight 18/20 组）——经 drawVanillaCell 真管线断言源矩形
// ---------------------------------------------------------------------------
function recCtx() {
  const calls: Array<{ m: string; a: unknown[] }> = [];
  const ctx = {
    drawImage: (...a: unknown[]) => { calls.push({ m: 'drawImage', a }); },
    save: (...a: unknown[]) => { calls.push({ m: 'save', a }); },
    restore: (...a: unknown[]) => { calls.push({ m: 'restore', a }); },
    translate: (...a: unknown[]) => { calls.push({ m: 'translate', a }); },
    scale: (...a: unknown[]) => { calls.push({ m: 'scale', a }); },
    imageSmoothingEnabled: false,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  return { calls, ctx };
}

function mockAtlas(sheet: number, iw = 128, ih = 512): SpriteAtlas {
  const fakeImg = { width: iw, height: ih };
  const meta = {
    sheet: `Tiles_${sheet}.png`, name: `T${sheet}`, key: `t${sheet}`,
    grid: [16, 16], stride: [18, 18], cols: Math.floor(iw / 18), rows: Math.floor(ih / 18),
  };
  return {
    vmeta: (s: number) => (s === sheet ? meta : null),
    ensureVImage: () => fakeImg as unknown as HTMLImageElement,
    vframeAt: (_s: number, x: number, y: number): DrawRect =>
      ({ img: fakeImg as unknown as HTMLImageElement, sx: x, sy: y, sw: 16, sh: 16 }),
    vframe: (_s: number, x: number, y: number): DrawRect =>
      ({ img: fakeImg as unknown as HTMLImageElement, sx: x * 18, sy: y * 18, sw: 16, sh: 16 }),
    vImageFailed: () => false,
  } as unknown as SpriteAtlas;
}

/** 放单格 style 帧并跑 drawVanillaCell,返回全部记录调用 */
function drawOneCellAll(sheet: number, key: string, fx: number, fy: number) {
  const type = TILE_BY_KEY[key]!;
  const st = new TileStore(32, 32);
  st.setTileSilent(10, 10, type, fx, fy);
  const def = TILE_DEFS[type]!;
  const { ctx, calls } = recCtx();
  drawVanillaCell(ctx, mockAtlas(sheet), sheet, def.vanilla!.frame as 'style',
    def.vanilla!.fw!, def.vanilla!.fh!, st, 10, 10, type,
    () => true, 0, 0, fx, fy);
  return calls;
}

/** 放单格 style 帧并跑 drawVanillaCell,返回 9 参 drawImage 调用 */
function drawOneCell(sheet: number, key: string, fx: number, fy: number) {
  return drawOneCellAll(sheet, key, fx, fy)
    .filter((c) => c.m === 'drawImage' && c.a.length === 9);
}

describe('SW-FX9 苗类源矩形高（tileHeight 18/20 组,真管线消费钉）', () => {
  it.each([20, 590, 595, 615])('苗类 sheet %i：源矩形 16×18（:4938-4950 tileHeight=18）', (sheet) => {
    const key = { 20: 'acorn_sapling', 590: 'v_590_gem_saplings', 595: 'v_595_sakura_sapling', 615: 'v_615_yellow_willow_sapling' }[sheet]!;
    const imgs = drawOneCell(sheet, key, 0, 0);
    expect(imgs.length, '恰一次本体 drawImage').toBe(1);
    const a = imgs[0]!.a as number[];
    // drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)——源矩形 = a[1..4]
    expect(a[1], 'sx').toBe(0);
    expect(a[2], 'sy').toBe(0);
    expect(a[3], 'sw=16').toBe(16);
    expect(a[4], 'sh=18（苗类源高,底部 2px 不再丢）').toBe(18);
  });

  it('苗类 sheet 20 偶数格镜像（:4939-4943 x%2==0 → FlipHorizontally）', () => {
    const calls = drawOneCellAll(20, 'acorn_sapling', 0, 0);
    expect(calls.some((c) => c.m === 'scale' && (c.a as number[])[0] === -1),
      'scale(-1,1) 镜像档在位').toBe(true);
  });

  it('高尔夫球洞 476：源矩形 20×18（:4717-4720）+ X 居中 -2、tileTop 0', () => {
    const imgs = drawOneCell(476, 'v_476_golfhole', 0, 0);
    expect(imgs.length).toBe(1);
    const a = imgs[0]!.a as number[];
    expect(a[3]).toBe(20);
    expect(a[4]).toBe(18);
    expect(a[5], 'dx = px-(20-16)/2 = -2').toBe(-2);
    expect(a[6], 'dy = py + tileTop(0)（case 476 无 tileTop）').toBe(0);
  });

  it.each([589, 596, 616, 634])('树族 sheet %i：树干 blit 20×20（:4710-4715 + :4688-4694 锚式）', (sheet) => {
    const key = { 589: 'v_589_amber_tree', 596: 'v_596_vanity_tree_sakura', 616: 'v_616_vanity_tree_yellow_willow', 634: 'v_634_ash_tree' }[sheet]!;
    const imgs = drawOneCell(sheet, key, 0, 0);
    expect(imgs.length, '树干段恰一次 blit').toBe(1);
    const a = imgs[0]!.a as number[];
    expect(a[3], 'sw=20').toBe(20);
    expect(a[4], 'sh=20').toBe(20);
    expect(a[5], 'dx = px-2（X 居中,顶锚定下溢 4px 合缝）').toBe(-2);
    expect(a[6], 'dy = py（顶锚定）').toBe(0);
  });
});

describe('SW-FX9 ChunkCache 底缝补绘门（正偏移族跨 chunk 溢出带）', () => {
  it('tileDrawYOffsetOf 与 tileTopOf 同源（补绘门取值一致,2026-09-01 缝终修）', async () => {
    const { tileDrawYOffsetOf } = await import('../src/render/VanillaTiler');
    for (const [sheet, fx, fy] of [[571, 0, 0], [529, 0, 0], [136, 0, 0], [443, 72, 0], [485, 0, 0]] as const) {
      expect(tileDrawYOffsetOf(sheet, fx, fy)).toBe(tileTopOf(sheet, fx, fy));
    }
  });
});

describe('SW-FX9 资产面：Item_75.png 入库（764 陨星覆绘解锁）', () => {
  it('vanilla/Item_75.png 在库且几何 22×208（Frame(1,8) → 单帧 22×26）', () => {
    const path = new URL('../public/sprites/vanilla/Item_75.png', import.meta.url);
    const buf = readFileSync(path);
    // PNG IHDR: 宽 @16..19、高 @20..23（大端）
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    expect(w).toBe(22);
    expect(h).toBe(208);
    expect(h / 8, 'Frame(1,8) 帧高=26（Main.cs:38327）').toBe(26);
  });

  it('追加通道自验：既有键零改动（atlas-append 幂等闸门仍绿）', async () => {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('node', ['scripts/atlas-append-1457.mjs'], {
      cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8',
    });
    expect(out, '幂等重跑：单图拷贝 0 张（已入库跳过）').toContain('单图拷贝: 0 张');
    expect(out).toContain('OK');
  });
});
