/** ★BJ691（2026-10-17 用户明令「导入后不要 alert，直接通过消息提示显示」）：菜单层 toast。
 *  ui.toast 落 .sw-root（z-index:10，UI.ts CSS）会被选择面板覆盖层（holder z22 /
 *  .sw-vsel z20）盖住 → 本助手直挂 document.body + inline z-index:1000 逃逸全部
 *  菜单层叠；样式类复用 UI.ts .sw-toast（UI 构造期已注入 <style>，菜单流程恒在场）。
 *  生命周期同 ui.toast（2500ms 后 0.4s 淡出移除）。node 测试域无 document=静默跳过。 */
export function menuToast(msg: string, ms = 2500): void {
  if (typeof document === 'undefined') return;
  const t = document.createElement('div');
  t.className = 'sw-toast';
  t.style.zIndex = '1000';
  t.textContent = msg;
  document.body.appendChild(t);
  window.setTimeout(() => {
    t.style.opacity = '0';
    window.setTimeout(() => t.remove(), 500);
  }, ms);
}
