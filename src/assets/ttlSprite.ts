// 模块级懒加载精灵的 TTL 自愈装载器(2026-08-25 同类扫描收敛,43 站点审计产物)。
// 目标 bug 类=「tried 布尔锁 + 无 onerror + 坏元素驻缓存」:冷缓存窗口(暖缓存
// 未到 sprites/vanilla)一次失败=整会话缺贴图。本装载器:失败记 10s TTL,期内
// 不再发请求(有界,防逐帧 404 风暴),过期自动重试(暖缓存到位即自愈);成功
// 走 upgradeToBitmap,与各站点原升级链一致。范式源头=SpriteAtlas.ensureVImage
// 的「TTL 负缓存 + SW 条目驱逐」三件套。
import { upgradeToBitmap } from './SpriteAtlas';

const TTL_MS = 10_000;

export class TtlSprite {
  private img: ImageBitmap | HTMLImageElement | null = null;
  private failAt = 0;

  constructor(private readonly src: string) {}

  /** 就绪返回位图;半加载窗返回未完 Image(消费方按 width 判空,与原站点语义一致);
   *  TTL 内失败返回 null;TTL 过期自动重发。 */
  get(): ImageBitmap | HTMLImageElement | null {
    if (this.img) return this.img;
    if (typeof Image === 'undefined') return null;
    if (this.failAt && Date.now() - this.failAt < TTL_MS) return null;
    const im = new Image();
    im.onload = () => upgradeToBitmap(im, (b) => { this.img = b; });
    im.onerror = () => { this.failAt = Date.now(); this.img = null; };
    im.src = this.src;
    this.img = im;
    return im;
  }
}

/** 按名懒加载族(Chain_N/Extra_N 等多键站点):键 → TtlSprite 惰性建 */
export class TtlSpriteMap {
  private map = new Map<string, TtlSprite>();
  constructor(private readonly mkSrc: (key: string) => string) {}
  get(key: string): ImageBitmap | HTMLImageElement | null {
    let s = this.map.get(key);
    if (!s) { s = new TtlSprite(this.mkSrc(key)); this.map.set(key, s); }
    return s.get();
  }
}
