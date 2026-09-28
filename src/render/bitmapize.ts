// 画布缓存异步升格 ImageBitmap(2026-08-19 渲染侧审计 #1/#4):
// 写一次烘焙缓存(hardAlpha 表/PaperDoll 合成/AutoTiler 旋转填补件…)从持久
// canvas 后备 → CPU 常驻 bitmap(绘制同走硬件、GPU 拷贝由浏览器托管且可驱逐
// = 零持久面,与 vimages 350 张同形态)。竞态守卫:仍是同一对象才替换;失败
// 静默保持 canvas(形态等价,只是多一张后备)。

/** 适合放进烘焙缓存的值形态(升格前后同一表内共存)。
 *  ★C4（2026-09-28）：+OffscreenCanvas——烘焙 worker 侧（AutoTiler 旋转/填补件）
 *  合成件为 OffscreenCanvas 形态；worker 全局无 HTMLCanvasElement 构造器，
 *  bitmapize 的 instanceof 门必须 typeof 守卫（ReferenceError 防）。 */
export type Baked = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

export function bitmapize(map: Map<string, Baked>, key: string): void {
  const c = map.get(key);
  if (typeof HTMLCanvasElement !== 'undefined'
    && !(c instanceof HTMLCanvasElement)) return;
  if (typeof HTMLCanvasElement === 'undefined'
    && !(typeof OffscreenCanvas !== 'undefined' && c instanceof OffscreenCanvas)) return;
  if (typeof createImageBitmap !== 'function' || !c) return;
  createImageBitmap(c).then((b) => {
    if (map.get(key) === c) map.set(key, b);
  }).catch(() => { /* 保持 canvas */ });
}

/** 淘汰/清空缓存：**纯弃引用**，交 GC 释放（2026-08-24 二次修）。
 *  ①ImageBitmap 不 close()：close 后位图 detach，而缓存条目可能仍被外部持有
 *   （角色创建预览 rAF 持 compositePaperDoll 返回值——拖色触发 tintCache 满清 →
 *   预览每帧 drawImage 爆 InvalidStateError + 人物消失，用户实报）；
 *  ②canvas 也不置 width=0：置 0 清空内容，外部持引用时 drawImage 画出**空白**
 *   （静默同症状，不抛错更难查）。GC 对两者均可回收，仅释放延迟。 */
export function freeBaked(v: Baked | undefined | null): void {
  /* 纯弃引用——调用方只需从缓存 Map 移除条目 */
  void v;
}
