// ★BJ-C4-F3/F5（2026-10-06 R4 UI 批清偿）——MouseText 自绘气泡族单源。
//
// 原版面：面板内悬停文本 = Main.instance.MouseText(text, 0, 0)（Main.cs:20321 →
// MouseTextInner :20365-20425,1458 :20371-20431）——XNA 侧逐帧画在屏幕坐标
// X=mouse+14+6（ThickMouse 默认档,MouseBorderColor :276 非透明 → :2684 恒开）
// +34（光标持物 :20390-20392）/ Y=mouse+14+6,MeasureString 全串盒右/下缘 40px
// 收边（:20412-20419）。本模块 = 该面的 DOM 覆层替身族单源：
//   · F3：原 BestiaryPanel.bindTip 私有面（自创固定偏移 +16/+20,无屏缘钳、无
//     持物 +34 臂）升格共享走 Renderer.mouseTextAnchor 公式（Main.cs:20379-20419
//     1:1）——图鉴悬停名/属性名/筛选名原版全走 Main.instance.MouseText
//     （UIBestiaryEntryButton.cs:147 / UIBestiaryFilteringOptionsGrid.cs:223 同面）。
//   · F5：表情钮（EmoteButton.cs:79-84 DrawSelf hovered → MouseText("/"+EmojiName)）
//     与住房条（Main.cs:41513 MouseText(GetNPCHouseBannerText)）原为原生
//     browser title（OS 级延迟气泡,非 MouseText 形态语言）→ 统一改道本族。
// 样式族 = 原 .sw-bst-tip 形态（12px 白字 + 四向 1px 字影 + nowrap——仓内面板
// MouseText 替身既定形态语言）。node/无 DOM 环境不可达（面板打开才有消费）。
import { mouseTextAnchor } from '../render/Renderer';

let tipEl: HTMLElement | null = null;

const TIP_CSS = `
/* MouseText 替代悬浮提示族（★BJ-C4-F3/F5 共享单源——Main.instance.MouseText 面;
   z-index 1300 = 覆层面板顶层语境之上:表情窗 1150/搜索首用门 1250 之上） */
.sw-mt-tip { position:fixed; z-index:1300; pointer-events:none; font-size:12px; color:#fff;
  text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;
  white-space:nowrap; display:none; }
`;

function ensureTip(): HTMLElement {
  if (tipEl) return tipEl;
  if (!document.getElementById('sw-mt-tip-style')) {
    const style = document.createElement('style');
    style.id = 'sw-mt-tip-style';
    style.textContent = TIP_CSS;
    document.head.appendChild(style);
  }
  tipEl = document.createElement('div');
  tipEl.className = 'sw-mt-tip';
  document.body.appendChild(tipEl);
  return tipEl;
}

/** 显气泡（MouseTextInner 锚式 1:1：Renderer.mouseTextAnchor 公式+40px 屏缘钳;
 *  SW-TT1 同式——量测先清旧 left/top,shrink-to-fit 宽受残留 left 约束会挤窄） */
export function showMouseTextTip(
  text: string, clientX: number, clientY: number,
  opts?: { heldOnCursor?: boolean },
): void {
  const el = ensureTip();
  el.textContent = text;
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.display = 'block';
  const anchor = mouseTextAnchor(clientX, clientY, el.offsetWidth, el.offsetHeight,
    window.innerWidth, window.innerHeight,
    { heldOnCursor: !!opts?.heldOnCursor });
  el.style.left = `${anchor.x}px`;
  el.style.top = `${anchor.y}px`;
}

/** 隐气泡（单例 display:none——面板关/悬停离场/面板销毁三消费面共用） */
export function hideMouseTextTip(): void {
  if (!tipEl) return;
  tipEl.style.display = 'none';
}

/** 元素级绑定：mousemove 随鼠标重锚+textFn 取词（空串/null=隐）,mouseleave 隐。
 *  替代原生 `el.title = ...`（OS 延迟气泡）——MouseText 家族语义（悬停即现、
 *  随动、形态同面板文字）。 */
export function bindMouseTextTip(
  el: HTMLElement,
  textFn: () => string,
  opts?: { heldOnCursor?: () => boolean },
): void {
  el.addEventListener('mousemove', (e) => {
    const t = textFn();
    if (!t) { hideMouseTextTip(); return; }
    showMouseTextTip(t, e.clientX, e.clientY,
      opts?.heldOnCursor ? { heldOnCursor: opts.heldOnCursor() } : undefined);
  });
  el.addEventListener('mouseleave', () => hideMouseTextTip());
}
