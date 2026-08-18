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
