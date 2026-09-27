// ★BJ366（2026-09-27）巨型龙蛋（tile 752）绘制面判别——用户实报「实机蛋只画出
// 18×18 粉色残片，不是完整的蛋+巢」定谳收口。
//
// 原版锚（Terarria1457）：
//   · 请求面：TileDrawing.cs:4577-4581 case 752 `tileWidth=36/tileHeight=38/tileTop=2`
//     verbatim；绘制门 :1042-1048 仅锚点帧（frameX==0&&frameY==0），锚偏移 vector.X+=8。
//   · 表面：Tiles_752.png 38×36（与 terraria-assets Images/Tiles_752.png md5 全等
//     c372ea99f25abe31c9e87a6d5dc8e950，非提取伪影；内容列 0..35、行 2..35，
//     35 行=巢底 26px 不透明）。
//   · FNA 语义：SpriteBatch.cs PushSprite 对 source 矩形 UV 直传 source/texSize
//     （无 CPU 钳制），SamplerState.*Clamp=CLAMP_TO_EDGE ⇒ 请求底 2 行越界带采样
//     贴图边缘行（35 行）平铺、dst 仍 38 行高（BJ365 曾断言「dst 等比裁剪成 36 行」
//     ——那是 canvas drawImage 的语义，FNA 机制不符已翻案；可见主体同为
//     「蛋+巢 36 行完整」，差异仅底部 2px 边缘带）。
//
// 旧病灶：drawAdjust case 752 `fit(fx,fy,36,38)` 恒败（fy+38=38>imgH=36）→ 静默
// 回退 18×18 格元（BJ365 隔离重画实测 152 opaque/32 粉像素=蛋顶残片）。
//
// 修法：src 钳到表界（sh=min(38,imgH-fy)=36）+ clampBand=2 记越界带高，绘制尾部
// 以 src 最末行 1:1 平铺补画（与 FNA PointClamp 采样逐像素等价）。
//
// 变异证红映射：
//   M1 case 752 回滚旧 `fit(36×38)` 恒败态   → T1 红（sw/sh 回 18×18 无 band）
//                                              → T3 红（drawImage 回 18×18 格元残片）
//   M2 摘尾部 clampBand 补画支               → T3 红（缺 dst 38 行处边缘带记录）
//   M3 band 源行错用首行（sy=0 非 ash-1=35） → T3 红（band 记录 sy≠35）
//   M4 摘锚点帧门（非锚格也画）              → T4 红（非锚格出现 drawImage 记录）
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { drawAdjust, drawVanillaCell } from '../src/render/VanillaTiler';

const E752 = TILE_INTERNAL_BY_SHEET.get(752)!;

/** 38×36 假贴图（尺寸面即可；几何契约=drawImage 六/九参记录） */
const FAKE_IMG = { width: 38, height: 36 } as unknown as HTMLImageElement;

/** 最小 atlas 桩：752 走 style 零帧重建 → vframeAt(752,0,0)=18×18 格元 */
function mkAtlas() {
  const img = FAKE_IMG;
  return {
    vframeAt: (_s: number, ofx: number, ofy: number) =>
      ofx === 0 && ofy === 0 ? { img, sx: 0, sy: 0, sw: 18, sh: 18 } : null,
    vmeta: (_s: number) => ({ grid: [18, 18], rows: 2 }),
    vframe: () => null,
    ensureVImage: () => img,
    vImageFailed: () => false,
  } as never;
}

/** 记录桩 ctx：只收 drawImage 全参 */
function mkCtx() {
  const recs: number[][] = [];
  const ctx = {
    drawImage: (...a: number[]) => recs.push(a.slice(1) as unknown as number[]),
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    globalAlpha: 1,
    filter: 'none',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, recs };
}

/** 2×2 蛋 @ (30,30)：锚 (0,0)、右列 18、下行 18（wld 多格帧位惯例） */
function mkStore(): TileStore {
  const st = new TileStore(64, 64);
  const frames = [[0, 0], [18, 0], [0, 18], [18, 18]];
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const x = 30 + dx, y = 30 + dy;
      st.setTile(x, y, E752);
      const i = st.idx(x, y);
      st.frameX[i] = frames[dy * 2 + dx][0];
      st.frameY[i] = frames[dy * 2 + dx][1];
    }
  }
  return st;
}

describe('BJ366: tile 752 巨型龙蛋绘制面', () => {
  it('T1 drawAdjust(752)：src 钳到表界 36×36 + clampBand=2（旧态=恒败回退无覆写）', () => {
    const st = new TileStore(8, 8);
    const adj = drawAdjust(752, 0, 0, 0, 0, 38, 36, st, 64);
    expect(adj.sw).toBe(36);
    expect(adj.sh).toBe(36);
    expect(adj.clampBand).toBe(2);
    expect(adj.sx).toBeUndefined();          // 源 XY 仍走格元 (0,0)
    expect(adj.sy).toBeUndefined();
  });

  it('T1b 越界带钳制只对本例生效：未越界的 751（56×46 于 56×322 表）无 band、覆写不变', () => {
    const st = new TileStore(8, 8);
    const adj = drawAdjust(751, 0, 0, 0, 0, 56, 322, st, 64);
    expect(adj.sw).toBe(56);
    expect(adj.sh).toBe(46);
    expect(adj.clampBand).toBeUndefined();   // 正常未越界 tile 零变化
  });

  it('T3 锚格绘制 = 蛋 36 行 + FNA 边缘带 2px（dst 逐像素对齐原版 anchor 公式）', () => {
    const st = mkStore();
    const atlas = mkAtlas();
    const { ctx, recs } = mkCtx();
    const i = st.idx(30, 30);
    drawVanillaCell(ctx, atlas, 752, 'style', 2, 2, st, 30, 30, E752,
      () => true, 0, 0, st.frameX[i], st.frameY[i]);
    // 恰两条记录：主体 + 边缘带（无 OOB 守卫拦截、无其他绘制支）
    expect(recs.length).toBe(2);
    // 主体：src 钳制 (0,0,36,36)；dst X = 0-(36-16)/2+8 = -2（:1019 num5+vector.X+=8）、
    //       dst Y = 0+tileTop(2)（DRAW_Y_OFFSET[752]=2）——与原版 anchor 公式逐像素同位
    const [m] = recs;
    expect(m).toEqual([0, 0, 36, 36, -2, 2, 36, 36]);
    // 边缘带：src 最末行 (0,35,36,1) 于 dst 38 行位平铺 2px（FNA CLAMP_TO_EDGE 语义）
    expect(recs[1]).toEqual([0, 35, 36, 1, -2, 38, 36, 2]);
  });

  it('T4 非锚格（frameX=18）整格跳过（TileDrawing.cs:1042-1048 绘制门）', () => {
    const st = mkStore();
    const atlas = mkAtlas();
    const { ctx, recs } = mkCtx();
    const i = st.idx(31, 30);
    drawVanillaCell(ctx, atlas, 752, 'style', 2, 2, st, 31, 30, E752,
      () => true, 0, 0, st.frameX[i], st.frameY[i]);
    expect(recs.length).toBe(0);
  });
});
