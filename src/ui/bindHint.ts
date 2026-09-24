// hover 型信息的触屏等价物(mobile-adaptation-plan docs/mobile-adaptation-plan.md
// 模块④,P0)。fine 指针保持原生 mouseenter 逐字节不变;coarse 会话改为
// touchstart 起 touchLongPressMs 计时的长按通道——move>8px 视为滚动取消,
// 未满时长的短触不拦截,转交浏览器合成的原生 click/mousedown 语义。
// ★BJ328（2026-09-24）：①fn 改为回传宿主元素（形参注入）——调用方闭包不再词法
//  自捕宿主（makeSlotEl 的 s 等）；②本函数体内【任何闭包都不得静态捕获 el 参数】
//  ——参数一旦被任一闭包捕获就进函数级 Context，注册在其上的所有闭包（含 fine 路
//  的 mouseenter 处理器）共享该 Context，Context 持 el=宿主元素 → 注册↔闭包↔宿主
//  构成跨组件环，元素游离后 Oilpan 不收=每轮进世界整批滞留（探针堆快照定谳：
//  游离 sw-slot 的持有者 Context 槽表=fn/el/timer/sx/sy/cancel/arm/ts/tm，即本
//  函数作用域全貌）。el 的一切延迟访问走 WeakRef；无 WeakRef 的老引擎降级为
//  「不挂长按/订阅不摘」（2021+ 引擎全支持 WeakRef，回落分支仅理论路径）。
import { options } from '../core/Options';
import { resolveTouchMode } from '../core/input/touchMode';

type WeakRefLike = { deref(): HTMLElement | undefined };
const WRCtor: (new (t: object) => WeakRefLike) | undefined =
  (globalThis as unknown as { WeakRef?: new (t: object) => WeakRefLike }).WeakRef;

export function bindHint(el: HTMLElement, fn: (host: HTMLElement) => void): () => void {
  if (resolveTouchMode() !== 'touch') {
    const h = (ev: Event): void => {
      const host = ev.currentTarget;
      if (host instanceof HTMLElement) fn(host);
    };
    el.addEventListener('mouseenter', h);
    if (WRCtor) {
      const ref = new WRCtor(el);
      return () => {
        const e2 = ref.deref();
        if (e2) e2.removeEventListener('mouseenter', h);
      };
    }
    return () => { /* 老引擎：不摘（无 WeakRef，摘除闭包会捕宿主回退旧泄漏形态） */ };
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sx = 0, sy = 0;
  const cancel = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
  // 长按回调异步触发拿不到事件——WeakRef 取宿主（不挽留）。无 WeakRef 引擎：
  // 不 arm（长按提示降级为无），绝不直捕 el。
  const arm: ((ms: number) => void) | null = WRCtor
    ? (() => { const ref = new WRCtor(el); return (ms: number) => { timer = setTimeout(() => { const h2 = ref.deref(); if (h2) fn(h2); }, ms); }; })()
    : null;
  const ts = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    sx = t.clientX; sy = t.clientY;
    cancel();
    arm?.(Math.max(200, options.data.touchLongPressMs));
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
  if (WRCtor) {
    const ref = new WRCtor(el);
    return () => {
      cancel();
      const e2 = ref.deref();
      if (e2) {
        e2.removeEventListener('touchstart', ts);
        e2.removeEventListener('touchmove', tm);
        e2.removeEventListener('touchend', cancel);
        e2.removeEventListener('touchcancel', cancel);
      }
    };
  }
  return () => cancel();   // 老引擎：至少清计时器（监听随宿主消亡）
}
