// hover 型信息的触屏等价物(mobile-adaptation-plan docs/mobile-adaptation-plan.md
// 模块④,P0)。fine 指针保持原生 mouseenter 逐字节不变;coarse 会话改为
// touchstart 起 touchLongPressMs 计时的长按通道——move>8px 视为滚动取消,
// 未满时长的短触不拦截,转交浏览器合成的原生 click/mousedown 语义。
import { options } from '../core/Options';
import { resolveTouchMode } from '../core/input/touchMode';

export function bindHint(el: HTMLElement, fn: () => void): () => void {
  if (resolveTouchMode() !== 'touch') {
    el.addEventListener('mouseenter', fn);
    return () => el.removeEventListener('mouseenter', fn);
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sx = 0, sy = 0;
  const cancel = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
  const ts = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    sx = t.clientX; sy = t.clientY;
    cancel();
    timer = setTimeout(fn, Math.max(200, options.data.touchLongPressMs));
  };
  const tm = (e: TouchEvent) => {
    if (timer === null) return;
    const t = e.changedTouches[0];
    // 手指漂移=用户在做滚动/拖拽手势,不是要看说明
    if (Math.hypot(t.clientX - sx, t.clientY - sy) > 8) cancel();
  };
  el.addEventListener('touchstart', ts, { passive: true });
  el.addEventListener('touchmove', tm, { passive: true });
  el.addEventListener('touchend', cancel, { passive: true });
  el.addEventListener('touchcancel', cancel, { passive: true });
  return () => {
    cancel();
    el.removeEventListener('touchstart', ts);
    el.removeEventListener('touchmove', tm);
    el.removeEventListener('touchend', cancel);
    el.removeEventListener('touchcancel', cancel);
  };
}
