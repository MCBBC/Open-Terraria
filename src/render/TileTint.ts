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
import { mkCanvas, type AnyCanvas } from './canvasEnv';

// ★C4（2026-09-28）：document 触点换环境感知工厂（worker 侧 OffscreenCanvas；
// node=null 与旧桩同形）。主线程 document 画布路径逐位不变。
const tintCanvas = mkCanvas(TILE, TILE) as AnyCanvas | null;
// ★2026-09-01 定谳（实测推翻登记取舍）：Chrome willReadFrequently 警告的读方=
// 本函数 L27 的 src.getContext('2d').getImageData(16×16)。被读对象是 GPU 后备的
// atlas/wall 页——实测该页【保持 GPU 是最快形态】：16×16 小区读回 2.8µs/次,
// 而 CPU(flag) 后备同尺寸反而 14.7µs(5 倍,内存跨 stride 取小块不划算);且按
// Chrome 建议挂 flag 会同时伤每帧 drawImage 纹理采样(CPU_RENDER=false 既定取舍)。
// 故本警告在本场景为【误报】:300 个油漆格合计仅 ~0.9ms、800 格 ~2.2ms,深藏在
// 世界加载烘焙洪峰内。微基准见 memory canvas-readback-flag-policy(含全屏过滤器
 // 与缓存画布两类形态的对照数据)。
const tintCtx = tintCanvas ? tintCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D : null;  // 纯 CPU scratch:SHM 后备不占 IOSurface(第六场双开 16x16 失败的当事画布)

/** 对 canvas 的 (readX,readY) 16×16 区域按 paint 逐像素着色,回写到 ctx 的 (writeX,writeY)。
 *  ★读/写坐标分离(2026-08-18 atlas 化 review 修):atlas 页路径读=页内绝对、写=cell 内
 *  局部(ctx 挂 translate(ox,oy));旧签名读写同参 → 回写落 (ox+px,oy+py) 双重偏移,
 *  ox>0 的 cell 油漆被 clip 挡掉 = 静默丢失(新世界无油漆的对拍探针抓不到)。
 *  isWall=true → 墙档(负相 30 走 Pass44 陡化反转;GetWallSettings 恒 DefaultNoSpecial
 *  Groups_ForWalls,墙无特判组);special=特判组设置(特判表类型 + paint 1-12 生效,
 *  函数内自带 paint 域守卫)。只写 RGB 不动 alpha:透明像素跳过 = 旧 destination-in
 *  裁回语义。putImageData 无视 transform/clip → 经 scratch 中转再 drawImage 回写。
 *  返回着色后的 16×16 画布（调用方 drawImage 回贴）;node/无画布环境 null（调用方
 *  直绘路径不受影响——着色仅油漆格触发）。★C4 ctx/src 类型加宽（worker OffscreenCanvas 同源）。 */
export function tintRegion(ctx: import('./canvasEnv').Ctx2D, src: import('./canvasEnv').AnyCanvas, readX: number, readY: number, paint: number,
  writeX = readX, writeY = readY, isWall = false, special?: LeafPaintSettings): AnyCanvas | null {
  if (!tintCanvas || !tintCtx) return null;
  const img = (src.getContext('2d') as import('./canvasEnv').Ctx2D).getImageData(readX, readY, TILE, TILE);
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

// ---- 任意尺寸源区域染色（★IIIII227 四涂装世界：树冠/树枝/棕榈冠等大精灵路径）----
// 树族大贴图（Tree_Tops 80×80 / Tree_Branches 40×40 / Shroom_Tops 60×42 / 棕榈
// Tree_Tops_21 114×98）不进 chunk 烘焙（WindSway 摆动层逐帧画），烘焙油漆 pass
// 染不到；绘制时按【源矩形】染色后回贴（与 tintRegion 同一 applyPaintTint 真值，
// 16×16 tileTint 通道的放大版）。缓存键 = 图像身份|源矩形|paint——帧定内容,
// 同一树冠变体全屏共享（LRU 上限淘汰最旧,勿整表 clear）。
const regionTintCache = new Map<string, AnyCanvas>();
const regionImgIds = new WeakMap<object, number>();
let regionNextImgId = 1;
/** 特判组设置对象身份 id（SPECIAL_PAINT_SETTINGS 表对象稳定复用，WeakMap 分配）——
 *  ★SW-FX12：缓存键必须含 special 身份，否则同一 (图,矩形,paint) 的普通组与特判组
 *  结果会互相污染（首个调用方定型，后者错拿前者画布）。 */
const regionSpecialIds = new WeakMap<object, number>();

/** 源图像身份 id（ImageBitmap/HTMLImageElement 无getId,WeakMap 稳定分配） */
function sourceImgId(img: CanvasImageSource): number {
  let id = regionImgIds.get(img as object);
  if (id === undefined) {
    id = regionNextImgId++;
    regionImgIds.set(img as object, id);
  }
  return id;
}

/** 把 img 的 (sx,sy,sw,sh) 区域按 paint 逐像素染色,返回染色后的独立画布。
 *  paint<=0 / 文档环境缺失 / 读回失败 → null（调用方回落原图）。isWall=false
 *  （树族无墙档;负相 30 墙 hack 只在 wall bake 路径）。special=特判组设置（paint
 *  1-12 生效,函数内自带 paint 域守卫;★缓存键含 special 身份）。 */
export function tintedVanillaRegion(
  img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, paint: number,
  isWall = false, special?: LeafPaintSettings,
): AnyCanvas | null {
  if (paint <= 0 || paint > 30 || sw <= 0 || sh <= 0) return null;
  const cv = mkCanvas(sw, sh);
  if (!cv) return null;
  let spId = 0;
  if (special) {
    spId = regionSpecialIds.get(special as object) ?? 0;
    if (spId === 0) {
      spId = regionNextImgId++;
      regionSpecialIds.set(special as object, spId);
    }
  }
  const key = `${sourceImgId(img)}|${sx}|${sy}|${sw}|${sh}|${paint}|${isWall ? 1 : 0}|${spId}`;
  const hit = regionTintCache.get(key);
  if (hit) return hit;
  const cctx = cv.getContext('2d', { willReadFrequently: true }) as import('./canvasEnv').Ctx2D | null;
  if (!cctx) return null;
  cctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const data = cctx.getImageData(0, 0, sw, sh);
  const d = data.data;
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
  cctx.putImageData(data, 0, 0);
  if (regionTintCache.size > 512) {
    const k0 = regionTintCache.keys().next().value;
    if (k0 !== undefined) regionTintCache.delete(k0);
  }
  regionTintCache.set(key, cv);
  return cv;
}
