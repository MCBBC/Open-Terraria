// 画布缓存异步升格 ImageBitmap(2026-08-19 渲染侧审计 #1/#4):
// 写一次烘焙缓存(hardAlpha 表/PaperDoll 合成/AutoTiler 旋转填补件…)从持久
// canvas 后备 → CPU 常驻 bitmap(绘制同走硬件、GPU 拷贝由浏览器托管且可驱逐
// = 零持久面,与 vimages 350 张同形态)。竞态守卫:仍是同一对象才替换;失败
// 静默保持 canvas(形态等价,只是多一张后备)。

/** 适合放进烘焙缓存的值形态(升格前后同一表内共存) */
export type Baked = HTMLCanvasElement | ImageBitmap;

export function bitmapize(map: Map<string, Baked>, key: string): void {
  const c = map.get(key);
  if (!(c instanceof HTMLCanvasElement) || typeof createImageBitmap !== 'function') return;
  createImageBitmap(c).then((b) => {
    if (map.get(key) === c) map.set(key, b);
  }).catch(() => { /* 保持 canvas */ });
}

/** 淘汰/清空缓存时按类型释放:canvas width=0 即还回后备。
 *  ★ImageBitmap 不 close()（2026-08-24 用户实报）：close 后位图 detach，而缓存条目
 *  可能仍被外部持有（角色创建预览 rAF 持 compositePaperDoll 返回值——拖色触发
 *  tintCache 满清/close → 预览每帧 drawImage 爆 InvalidStateError + 人物消失）。
 *  弃引用交 GC 释放即可（ImageBitmap 无显式 close 也可回收，仅延迟） */
export function freeBaked(v: Baked | undefined | null): void {
  if (!v) return;
  if (v instanceof HTMLCanvasElement) { v.width = 0; v.height = 0; }
}
