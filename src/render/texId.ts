// 贴图实例 id 助手(2026-08-18):缓存键统一安全化。
// 背景:ImageBitmap 无 .src——键里裸读 `(tex as HTMLImageElement).src` 恒
// undefined,同尺寸/同色桶的跨纹理键碰撞 = 画错图/串色(bitmap 迁移时代已中
// 四枪:cloudTint/TileFlames/BiomeBackground/镜头光斑;PaperDoll 与
// UISpriteBatch 是先行同款)。凡"按贴图身份缓存染色副本"的键一律用 texId()。
const ids = new WeakMap<object, number>();
let seq = 0;
export function texId(img: object): number {
  let v = ids.get(img);
  if (v === undefined) { v = ++seq; ids.set(img, v); }
  return v;
}

/** 贴图可绘就绪守卫（2026-08-24 光斑"方片"竞态终案，用户多份截图实报）：
 *  HTMLImageElement 在 HTTP 元数据到达后 `.width` 即 >0，但主体未传完/未解码时
 *  drawImage 画不出内容——旧守卫只查 width>0 挡不住这个半加载窗。该窗内烘焙
 *  乘色副本 = "画空气 → multiply 全画布平涂 → destination-in 再画空气 →
 *  α=max(rgb) 全图平色"，平色矩形被按 texId 键**永久缓存**：镜头光斑每元素
 *  一个淡色方片（方片尺寸=各元素贴图矩形,位置沿太阳↔屏心轴,刷新自愈=二次
 *  进页贴图已有磁盘缓存）。凡"烘焙染色副本进缓存"的路径入口一律先过本守卫；
 *  位图（ImageBitmap）构造即解码完成、画布内容同步,查 width 即可。 */
export function texReady(tex: ImageBitmap | HTMLImageElement | HTMLCanvasElement): boolean {
  // Node 测试环境无 HTMLImageElement 全局——typeof 守卫后再 instanceof
  if (typeof HTMLImageElement !== 'undefined' && tex instanceof HTMLImageElement) {
    return tex.complete && tex.naturalWidth > 0;
  }
  return tex.width > 0;
}
