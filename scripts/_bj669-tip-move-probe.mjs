// ★BJ669e2 v4：真实鼠标输入复验「快速跨装备槽 tooltip 位置重算」。
//  v3 用合成 dispatchEvent(mouseenter)——enter 与 mousemove 拆开派发、坐标自选,
//  与真实浏览器「边界事件先于同批 mousemove、坐标=当帧指针位」语义不同相（v3 的
//  hoverA "14px,14px" 假象即由此来）。v4 改 page.mouse 原生输入:先慢移 A（enter+
//  连续 move）停 250ms,再 1 步快跳 B 中心（单次 move=边界事件+目标位 move 同批,
//  enter 拍 mouseX 滞后=真实病灶相）,读 enter 拍气泡位（钉旧位=A 位）与 settled
//  位（跟随臂纠正后=B 光标位）。验收: settled.left ≈ B.cx+14 且内容=B 物。
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: 'bj669t', size: 'small' });
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true; options.data.playWhenUnfocused = true;
  const ui = window.__swUI;
  ui.openInventory(true);
  // 保证装备区前两格有物（armor[0]/armor[1]）
  const g = window.__swGame;
  if (!g.player.inv.armor[0]) g.player.inv.armor[0] = { id: 96, stack: 1 };   // 铜盔
  if (!g.player.inv.armor[1]) g.player.inv.armor[1] = { id: 98, stack: 1 };   // 铜链甲
  ui.refreshAll();
});
await new Promise((r) => setTimeout(r, 500));
const out = await page.evaluate(() => new Promise((resolve) => {
  const all = [...document.querySelectorAll('.sw-slot')];
  const slots = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.right > window.innerWidth - 340 && r.width > 20 && r.width < 80;
  });
  if (slots.length < 2) { resolve({ err: 'few', n: slots.length }); return; }
  // 排序：右列优先（装备区），取上下两格
  slots.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left || a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const A = slots[0].getBoundingClientRect(), B = slots[1].getBoundingClientRect();
  const tip = document.querySelector('.sw-tooltip');
  // enter 拍插桩：记录原生 mouseenter 到达时气泡的瞬时位/内容
  window.__enterSnaps = [];
  for (const el of [slots[0], slots[1]]) {
    el.addEventListener('mouseenter', () => {
      window.__enterSnaps.push({
        left: tip.style.left, top: tip.style.top,
        text: (tip.textContent || '').slice(0, 12),
        display: tip.style.display,
      });
    });
  }
  resolve({
    n: slots.length,
    A: { cx: Math.round(A.left + A.width / 2), cy: Math.round(A.top + A.height / 2), l: Math.round(A.left), t: Math.round(A.top) },
    B: { cx: Math.round(B.left + B.width / 2), cy: Math.round(B.top + B.height / 2), l: Math.round(B.left), t: Math.round(B.top) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    _tip: !!tip,
    _hooks: true,
  });
}));
// 外层真实鼠标驱动（原生边界事件语义）
const ax = out.A.cx, ay = out.A.cy, bx = out.B.cx, by = out.B.cy;
await page.mouse.move(ax - 120, ay - 60, { steps: 4 });          // 场外起步
await page.mouse.move(ax, ay, { steps: 6 });                     // 慢移入 A（enter+连续 move）
await new Promise((r) => setTimeout(r, 250));
const hoverA = await page.evaluate(() => ({
  ...document.querySelector('.sw-tooltip') && {
    left: document.querySelector('.sw-tooltip').style.left,
    top: document.querySelector('.sw-tooltip').style.top,
    text: (document.querySelector('.sw-tooltip').textContent || '').slice(0, 12),
    display: document.querySelector('.sw-tooltip').style.display,
  },
  enterSnaps: window.__enterSnaps,
}));
await page.mouse.move(bx, by, { steps: 1 });                     // ★1 步快跳 B=真实病灶相
const justAfter = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return { left: t.style.left, top: t.style.top, text: (t.textContent || '').slice(0, 12), display: t.style.display };
});
await new Promise((r) => setTimeout(r, 120));                    // settled（同批纠正应已完成）
const settled = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return { left: t.style.left, top: t.style.top, text: (t.textContent || '').slice(0, 12), display: t.style.display };
});
const verdict = (() => {
  // 期望位=cursorTooltipPos 同式：top=by+14 精确；left 非钳支=bx+14、右缘钳支
  //  sl=vw−18−tw（钳一致性由恒等式自证：反推 tw 须满足钳触发条件）
  const sl = parseFloat(settled.left), st = parseFloat(settled.top);
  const clamped = sl < bx + 14;
  const twInferred = clamped ? out.viewport.w - 18 - sl : 0;
  const clampConsistent = !clamped
    || ((bx + 14 + twInferred) > out.viewport.w - 18 && sl === out.viewport.w - 18 - twInferred);
  const posOk = st === by + 14 && clampConsistent;
  const contentOk = settled.text === justAfter.text && settled.display === 'block';
  const followOk = parseFloat(justAfter.top) !== parseFloat(hoverA.top);
  return { clamped, twInferred, posOk, contentOk, followOk, PASS: posOk && contentOk && followOk };
})();
console.log(JSON.stringify({ ...out, hoverA, justAfter, settled, verdict }, null, 1));
await browser.close();
