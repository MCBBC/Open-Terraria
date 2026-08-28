// 游戏 HUD 手机适配档位体系(mobile-adaptation-plan docs/mobile-adaptation-plan.md
// 模块③,P0)。离散四档而非连续缩放:小屏连续值会露"面板悬空 3px"缝隙类缺陷,
// 离散步进可控——D0=桌面(coarse=false,一切恒等改造前字节不变)/T1=iPad(min 边
// ≥700,沿用桌面几何)/T2=手机横屏/T3=手机竖屏(布局重排档)。
//
// 分工铁则(方案 §2.3):JS 会重写的几何(refreshHotbar/positionInvPanel 写点)
// 走 hudTier() 分支算数;纯静态定位 CSS 块吃 var(--huds) 乘法;同一元素禁止两处
// 都管(refreshHotbar 每 ~40ms 重写 inline,与之打架必错位)。
import { options } from '../core/Options';
import { isTouchDevice } from '../core/input/touchDevice';

export type HudTier = 'd0' | 't1' | 't2' | 't3';

let tierCache: HudTier | null = null;
let lastW = 0, lastH = 0;
let probeEl: HTMLElement | null = null;

/** 安全区 insets(px,CSS 逻辑像素)。canvas 读不到 env(),由探针 div 计算——
 *  DOM 侧 hotbar/buff/chatbox 直接吃 var(--sw-sat...) 惯例同名变量 */
export const safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function ensureProbe(): void {
  if (probeEl || typeof document === 'undefined') return;
  probeEl = document.createElement('div');
  probeEl.setAttribute('aria-hidden', 'true');
  probeEl.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;'
    + 'visibility:hidden;pointer-events:none;border:0 solid transparent;'
    + 'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);'
    + 'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)';
  document.body.appendChild(probeEl);
}

function readSafeInsets(): void {
  ensureProbe();
  if (!probeEl) return;
  const cs = getComputedStyle(probeEl);
  safeInsets.top = parseFloat(cs.paddingTop) || 0;
  safeInsets.right = parseFloat(cs.paddingRight) || 0;
  safeInsets.bottom = parseFloat(cs.paddingBottom) || 0;
  safeInsets.left = parseFloat(cs.paddingLeft) || 0;
}

function computeTier(w: number, h: number): HudTier {
  const pinned = options.data.hudScaleMode;
  if (pinned !== 'auto') return pinned;            // 设置页手动钉档(仅触屏会话有意义)
  if (!isTouchDevice()) return 'd0';
  if (Math.min(w, h) >= 700) return 't1';
  return w >= h ? 't2' : 't3';
}

const debounceTimers: ReturnType<typeof setTimeout>[] = [];

/** 重算档位并写 documentElement(data-huds + --huds/--sw-sa* 变量)。
 *  触发:首次 hudTier() 调用惰性挂载 + resize/orientationchange/vv resize
 *  (200ms debounce、同尺寸短路——iOS 工具栏伸缩抖动防护,B 方案 §5.2)。
 *  D0 变更照写变量(值=1/0)——桌面无消费者,diff 为空 */
export function refreshHudScale(immediate = false): void {
  const run = () => {
    const w = window.innerWidth, h = window.innerHeight;
    lastW = w; lastH = h;
    readSafeInsets();
    tierCache = computeTier(w, h);
    const f = options.data.hudScaleFactor;
    const st = document.documentElement.style;
    document.documentElement.dataset.huds = tierCache;
    st.setProperty('--huds', String(hudFactorFor(tierCache) * (tierCache === 'd0' ? 1 : f)));
    st.setProperty('--sw-sat', `${safeInsets.top}px`);
    st.setProperty('--sw-sar', `${safeInsets.right}px`);
    st.setProperty('--sw-sab', `${safeInsets.bottom}px`);
    st.setProperty('--sw-sal', `${safeInsets.left}px`);
  };
  if (immediate) { run(); return; }
  const t = setTimeout(run, 150);
  debounceTimers.push(t);
}

function armListenersOnce(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('resize', () => refreshHudScale());
  window.addEventListener('orientationchange', () => refreshHudScale());
  window.visualViewport?.addEventListener?.('resize', () => refreshHudScale());
}

let armed = false;

/** 当前 HUD 档位(惰性初始化;消费方每帧读缓存零开销) */
export function hudTier(): HudTier {
  if (!armed) {
    armed = true;
    armListenersOnce();
    refreshHudScale(true);
  }
  if (tierCache === null || (Math.abs(window.innerWidth - lastW) > 1 || Math.abs(window.innerHeight - lastH) > 1)) {
    // 极端窗口期(resize 监听未及):现场重算,不等 debounce
    refreshHudScale(true);
  }
  return tierCache ?? 'd0';
}

/** 各档渲染型 HUD 缩放因子(canvas 侧 minimap/资源条/mobileUiScale 读数):
 *  T2=0.7(与历史移动端值一致)、T3=0.62(C 方案表)、D0/T1=1(桌面 byte 级原样) */
export function hudFactorFor(tier: HudTier): number {
  switch (tier) {
    case 't3': return 0.62;
    case 't2': return 0.7;
    default: return 1;                // d0/t1
  }
}
