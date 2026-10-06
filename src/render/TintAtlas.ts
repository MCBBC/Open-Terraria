// TintAtlas——染色变体图集(2026-08-19 双开 IOSurface 再爆的合并根治):
// 染色精灵家族(敌怪/掉落物/NPC 光照染色、血条、glow、lerp 变体…)旧实现
// 每个变体一张独立 canvas,tintCache 上限 1024 条 = 战斗态一页可冲上千张
// 画布;GPU 侧画布按【张数】吃 IOSurface(16×16 也占一张)——双开直接打爆。
// 本类把全部变体收进少数共享页(512² × ≤4 张 = 4MB/4 张表面):
//  - shelf 行打包 + 空位 free-list(最优适应+分裂)
//  - LRU 键淘汰:装不下先逐出最冷 16 条再试
//  - bake 回调在【私有 scratch】上作画再整块 blit 进页——调用方可以任意使用
//    multiply/destination-in 等全局语义 gCO(destination-in 会清掉整画布其余
//    内容,绝不能直接在共享页上做;lerp 的 getImageData/putImageData 同理)
// ★纪元换键（2026-09-27 变体①终扫）:页矩形是回收复用的（evictCold/drop→free-list）
//  ——回收矩形上的再烘焙=共享页画布【原地覆写】,GL shim 按 (texId,矩形) 身份
//  缓存的区域纹理不换键就永远命中旧字节=生命水晶案同族（首帧内容冻结）。
//  修复=回收矩形 blit 后失效其 GL 缓存。失效粒度两档:
//  ①【精确失效】（2026-10-06 E51 刀A,缺省）:Renderer 启动期注入 invalidateRect
//    钩子→GLShimExecutor.invalidateTintRect 仅删除【被覆写矩形】的 texCache 条目
//    +层内 dropTexture——该矩形下一绘 miss 重传（内容真变,合法）;页上其余矩形
//    内容未变,键不变零重传。背景=E51 512² epoch 追新案定谳:页级 bump 使该页
//    全部矩形换键,再绘时全部重传（内容未变=保险性追新税;活机 atk8/9 实测
//    1200 帧 1381 次 bump→2023 笔受累重传 156MB,2D 降级窗回切时全页风暴）。
//  ②【页级 bump 兜底】（fail-closed）:钩子未注入（测试/隔离 shim/早期帧）时仍
//    bumpTexEpoch(page.cv)——保守正确,与 2026-09-27 原语义逐位同。2D/无 shim
//    会话两者皆无消费方（无 er: 键）,行为零差。
import { bumpTexEpoch } from './texId';

/** ★E51 刀A:回收矩形精确失效钩子（Renderer 启动期注入;null=页级 bump 兜底）。 */
let invalidateRect: ((cv: HTMLCanvasElement, x: number, y: number, w: number, h: number) => void) | null = null;
export function setTintAtlasInvalidateRect(
  fn: ((cv: HTMLCanvasElement, x: number, y: number, w: number, h: number) => void) | null,
): void { invalidateRect = fn; }

export interface TintRect { c: HTMLCanvasElement; x: number; y: number; w: number; h: number; }


interface Page { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; rows: { y: number; h: number; w: number }[]; free: { x: number; y: number; w: number; h: number }[]; }
interface Entry { rect: TintRect; page: Page; }

const PAGE = 512;
const MAX_PAGES = 4;
/** 单变体上限:超过(超大精灵)不进图集,返回 null 由调用方走未缓存路径 */
const MAX_ENTRY = 256;

export class TintAtlas {
  private pages: Page[] = [];
  private entries = new Map<string, Entry>(); // 插入序 = LRU 序(命中重插到尾)
  private scratchCv: HTMLCanvasElement | null = null;

  /** 命中返回既有矩形(并 LRU 续期);未命中分配矩形、在 scratch 上执行 paint
   *  (0,0,w,h) 后 blit 进页。返回 null = 尺寸超限或页满且无可逐出(调用方兜底)。 */
  bake(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): TintRect | null {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);   // LRU 续期
      return hit.rect;
    }
    if (w <= 0 || h <= 0 || w > MAX_ENTRY || h > MAX_ENTRY) return null;
    const spot = this.alloc(w, h);
    if (!spot) return null;
    const [page, x, y, recycled] = spot;
    // 私有 scratch 烘焙(全局 gCO 语义安全),再整块搬进页
    if (!this.scratchCv) this.scratchCv = document.createElement('canvas');
    if (this.scratchCv.width < w || this.scratchCv.height < h) {
      // 只增不减,对齐 16 减少重分配
      this.scratchCv.width = Math.min(MAX_ENTRY, Math.max(16, Math.ceil(w / 16) * 16));
      this.scratchCv.height = Math.min(MAX_ENTRY, Math.max(16, Math.ceil(h / 16) * 16));
    }
    // willReadFrequently:烘焙 scratch 纯 CPU 用途(从不进合成),SHM 后备不占 IOSurface
    const sc = this.scratchCv.getContext('2d', { willReadFrequently: true })!;
    sc.clearRect(0, 0, w, h);
    paint(sc);
    // ★FX24 2026-09-14 勘误：页矩形是【回收复用】的(evictCold/drop → free-list)，
    //  旧占主留下的像素未被清过；blit 走 source-over 时【透明像素不覆写目标】，
    //  新烘焙在自己透明区里透出上一任的内容——鹿角怪 668 实报"行走半透明/攻击帧
    //  花屏"根因(lai3 渐变窗 tq 键高频 churn → 大量 220×242 矩形回收，新帧透明区
    //  透出旧 tq 紫色帧残影)。目标矩形先 clearRect 再 blit 即根治(全 tint 族受益)。
    page.ctx.clearRect(x, y, w, h);
    page.ctx.drawImage(this.scratchCv, 0, 0, w, h, x, y, w, h);
    // ★纪元换键:回收矩形=对既有矩形区的原地覆写——必须失效其 GL 缓存
    //  （FX24 clearRect 修复只清了页内残影,GL 缓存层此案由纪元键收口）。
    //  ★E51 刀A（2026-10-06）:钩子在场走【精确失效】（仅被覆写矩形,页上其余
    //  矩形零追新）;否则页级 bump 兜底（fail-closed,2026-09-27 原语义）。
    if (recycled) {
      if (invalidateRect) invalidateRect(page.cv, x, y, w, h);
      else bumpTexEpoch(page.cv);
    }
    const rect: TintRect = { c: page.cv, x, y, w, h };
    this.entries.set(key, { rect, page });
    return rect;
  }

  /** 显式丢弃(如贴图重载);不存在则无操作 */
  drop(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    e.page.free.push({ x: e.rect.x, y: e.rect.y, w: e.rect.w, h: e.rect.h });
  }

  get size(): number { return this.entries.size; }
  get pageCount(): number { return this.pages.length; }

  /** 释放全部页(换世界/渲染器销毁;画布 width=0 即还回表面) */
  dispose(): void {
    for (const p of this.pages) { p.cv.width = 0; p.cv.height = 0; }
    this.pages = [];
    this.entries.clear();
  }

  private evictCold(n: number): void {
    for (const k of this.entries.keys()) {
      if (n-- <= 0) break;
      const e = this.entries.get(k)!;
      this.entries.delete(k);
      e.page.free.push({ x: e.rect.x, y: e.rect.y, w: e.rect.w, h: e.rect.h });
    }
  }

  /** 返回 [page, x, y, recycled]——recycled=true=该矩形来自 free-list（回收复用,
   *  覆写既有像素区;调用方须 bump 页纪元）。shelf 新行/新页=纯新区恒 false。 */
  private alloc(w: number, h: number): [Page, number, number, boolean] | null {
    for (let attempt = 0; attempt < 2; attempt++) {
      // ① 既有页:free-list 最优适应(能放下里的最小面积)→ 分裂余量
      let best: { page: Page; i: number; area: number } | null = null;
      for (const page of this.pages) {
        for (let i = 0; i < page.free.length; i++) {
          const f = page.free[i];
          if (f.w >= w && f.h >= h) {
            const area = f.w * f.h;
            if (!best || area < best.area) best = { page, i, area };
          }
        }
      }
      if (best) {
        const f = best.page.free.splice(best.i, 1)[0];
        const x = f.x, y = f.y;
        if (f.w > w) best.page.free.push({ x: x + w, y, w: f.w - w, h });
        if (f.h > h) best.page.free.push({ x, y: y + h, w, h: f.h - h });
        return [best.page, x, y, true];
      }
      // ② 各页 shelf:追加新行(行高 = h,现有行尾放得下优先)
      for (const page of this.pages) {
        for (const row of page.rows) {
          if (row.h >= h && PAGE - row.w >= w) {
            const x = row.w, y = row.y;
            row.w += w;
            return [page, x, y, false];
          }
        }
        // 新行
        let used = 0;
        for (const row of page.rows) used += row.h;
        if (used + h <= PAGE && w <= PAGE) {
          const row = { y: used, h, w };
          page.rows.push(row);
          const x = 0;
          row.w = w;
          return [page, x, row.y, false];
        }
      }
      // ③ 新页
      if (this.pages.length < MAX_PAGES) {
        const cv = document.createElement('canvas');
        cv.width = PAGE; cv.height = PAGE;
        const ctx = cv.getContext('2d')!;
        const page: Page = { cv, ctx, rows: [{ y: 0, h, w }], free: [] };
        this.pages.push(page);
        return [page, 0, 0, false];
      }
      // ④ 页满:逐出最冷 16 条重试一轮
      if (attempt === 0) this.evictCold(16);
    }
    return null;
  }
}
