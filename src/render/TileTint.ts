// ---- 油漆逐像素着色（共享模块：ChunkCache 静态烘焙 + WindSway 摆动件绘制时染色） ----
// 原版走 GPU shader（TilePaintSystemV2.cs:69-82 PrepareShader → TileShader.cso 45 pass）；
// Canvas 2D 等价 = applyPaintTint/applyPaintTintSpecial 逐像素调制（min/max 排序槽，
// 2026-08-20 接线替换旧 multiply 乘色三段合成）。chunk 烘焙非每帧，ImageData 循环
// 成本可接受；fround 序与 UNORM 取整已在函数内做，循环只搬运字节、不重算。
// 2026-08-23 自 ChunkCache 迁出为共享模块：摆动件（WindSway 动态绘制，不在烘焙层）
// 原版同样吃油漆（vine 路径经 GetTileDrawTexture → TilePaintSystemV2 按 tile.color()
// 出染色变体，TileDrawing.cs:9650 系）——绘制时染色须复用同一 tintRegion 防漂移。
import { TILE } from '../core/constants';
import { applyPaintTint, applyPaintTintSpecial, type LeafPaintSettings } from '../world/Paint';

const tintCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (tintCanvas) { tintCanvas.width = TILE; tintCanvas.height = TILE; }
const tintCtx = tintCanvas ? tintCanvas.getContext('2d', { willReadFrequently: true }) : null;  // 纯 CPU scratch:SHM 后备不占 IOSurface(第六场双开 16x16 失败的当事画布)

/** 对 canvas 的 (readX,readY) 16×16 区域按 paint 逐像素着色,回写到 ctx 的 (writeX,writeY)。
 *  ★读/写坐标分离(2026-08-18 atlas 化 review 修):atlas 页路径读=页内绝对、写=cell 内
 *  局部(ctx 挂 translate(ox,oy));旧签名读写同参 → 回写落 (ox+px,oy+py) 双重偏移,
 *  ox>0 的 cell 油漆被 clip 挡掉 = 静默丢失(新世界无油漆的对拍探针抓不到)。
 *  isWall=true → 墙档(负相 30 走 Pass44 陡化反转;GetWallSettings 恒 DefaultNoSpecial
 *  Groups_ForWalls,墙无特判组);special=特判组设置(特判表类型 + paint 1-12 生效,
 *  函数内自带 paint 域守卫)。只写 RGB 不动 alpha:透明像素跳过 = 旧 destination-in
 *  裁回语义。putImageData 无视 transform/clip → 经 scratch 中转再 drawImage 回写。
 *  返回着色后的 16×16 画布（调用方 drawImage 回贴）。 */
export function tintRegion(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, readX: number, readY: number, paint: number,
  writeX = readX, writeY = readY, isWall = false, special?: LeafPaintSettings): HTMLCanvasElement {
  const img = (src.getContext('2d') as CanvasRenderingContext2D).getImageData(readX, readY, TILE, TILE);
  const d = img.data;
  if (special) {
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] === 0) continue;
      const c = applyPaintTintSpecial(d[p], d[p + 1], d[p + 2], paint, special);
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2];
    }
  } else {
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] === 0) continue;
      const c = applyPaintTint(d[p], d[p + 1], d[p + 2], paint, isWall);
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2];
    }
  }
  tintCtx!.putImageData(img, 0, 0);
  // 不 clearRect 直接覆盖回写：着色像素与本区域原内容 alpha 完全一致，
  // source-over 叠加即替换色值；clearRect 反而会打穿邻格溢出的跨格精灵
  ctx.drawImage(tintCanvas!, writeX, writeY);
  return tintCanvas!;
}
