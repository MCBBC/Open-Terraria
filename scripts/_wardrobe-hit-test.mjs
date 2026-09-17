// 衣柜(梳妆台更衣窗)面板鼠标事件吞层取证探针(2026-09-16 用户实报:面板打开后
// 悬停无高亮/点击无响应)。取样三问:
//   ① elementFromPoint(面板中心/页签/底部按钮)=谁?
//   ② .sw-char-panel computed pointer-events=?
//   ③ 点击「取消更改」沿 window mousedown 门(isDomUiTarget)是否漏成世界输入
//      (RB28 分离子树家族:close() 在 click 派发中途同步 remove 面板)。
// 跑法:SW_ORIGIN=http://localhost:5260 node tools/run-diag.mjs scripts/_wardrobe-hit-test.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5260';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

await page.goto(ORIGIN + (process.env.SW_PAGE ?? '/?play=small'), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await sleep(800);
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
await sleep(300);

// 真实开链:Game 梳妆台右键支(Game.ts:25644)→ cb.onClothesWindow → mainFlow → UI.showClothesWindow
const opened = await page.evaluate(() => {
  const g = window.__swGame;
  g.cb.onClothesWindow?.(g.player.appearance);
  const p = document.querySelector('.sw-char-panel');
  if (!p) return { opened: false };
  const r = p.getBoundingClientRect();
  return {
    opened: true,
    parentClass: p.parentElement?.className ?? '(detached)',
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    pointerEvents: getComputedStyle(p).pointerEvents,
    rootPointerEvents: getComputedStyle(p.closest('.sw-root') ?? document.body).pointerEvents,
  };
});
console.log('open:', JSON.stringify(opened));
ok(opened.opened, '衣柜面板已挂载');
ok(opened.parentClass === 'sw-root', '面板挂于 .sw-root');

const sample = await page.evaluate(() => {
  const p = document.querySelector('.sw-char-panel');
  const pts = {};
  const probe = (name, el) => {
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    pts[name] = {
      expect: el.className?.toString().slice(0, 40) || el.tagName,
      hit: hit ? (hit.className?.toString().slice(0, 60) || hit.tagName) : 'null',
      hitIsInsidePanel: !!hit && p.contains(hit),
      hitPointerEvents: hit ? getComputedStyle(hit).pointerEvents : '-',
    };
  };
  const body = p.querySelector('.sw-char-body');
  probe('panelBodyCenter', body);
  const tab = p.querySelector('.sw-cc-tab');
  if (tab) probe('tabButton', tab);
  const back = p.querySelector('[data-act=back]');
  if (back) probe('cancelButton', back);
  const create = p.querySelector('[data-act=create]');
  if (create) probe('confirmButton', create);
  return pts;
});
for (const [k, v] of Object.entries(sample)) {
  console.log(`  ${k}: expect=[${v.expect}] hit=[${v.hit}] insidePanel=${v.hitIsInsidePanel} hitPE=${v.hitPointerEvents}`);
  ok(v.hitIsInsidePanel, `elementFromPoint(${k}) 命中面板内部`);
}
ok(opened.pointerEvents === 'auto', '.sw-char-panel computed pointer-events=auto');

// 悬停高亮面:真实 mousemove 到页签上,看 :hover 是否可达(有 hover 态类/伪类生效)
const hoverProbe = await page.evaluate(() => {
  const tab = document.querySelector('.sw-cc-tab');
  const r = tab.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.mouse.move(hoverProbe.cx, hoverProbe.cy);
await sleep(150);
const hoverCheck = await page.evaluate(() => {
  const tab = document.querySelector('.sw-cc-tab');
  return { hovered: tab.matches(':hover'), anyHoverInPanel: !!document.querySelector('.sw-char-panel :hover') };
});
console.log('hover:', JSON.stringify(hoverCheck));
ok(hoverCheck.hovered && hoverCheck.anyHoverInPanel, '页签 :hover 可达(悬停高亮面)');

// ③ 取消更改点击:window mousedown 门是否漏(isDomUiTarget)。
//    不真点(会关面板),只模拟 click 派发中途面板被 remove 后的 window mousedown 判定:
const detachGate = await page.evaluate(async () => {
  const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
  const p = document.querySelector('.sw-char-panel');
  // 构造 detached target:克隆面板摘下来,以按钮为 target 派发(等价于 click 同步 remove 后冒泡到 window 的 target 态)
  const clone = p.cloneNode(true);
  document.body.appendChild(clone);
  const cbtn = clone.querySelector('[data-act=back]');
  let captured = null;
  const onMd = (e) => { captured = { isDomUi: isDomUiTarget(e.target), closestRoot: !!e.target.closest?.('.sw-root') }; };
  window.addEventListener('mousedown', onMd, { once: true });
  cbtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  clone.remove();
  return captured;
});
console.log('detached-gate:', JSON.stringify(detachGate));
ok(detachGate?.isDomUi === true, '分离态按钮 target 经 Input 门判为 UI(不漏世界输入)');

// ④ 真实交互断言:页签点击切内容 + 真实鼠标点击「取消更改」关面板且不漏世界输入
//    (更衣窗初始页即 look,点 look=同页 no-op——改点 shirt 色页签验证真切换)
const tabClick = await page.evaluate(() => {
  const before = document.querySelector('.sw-char-content').childElementCount;
  const beforeTab = document.querySelector('.sw-cc-tab.active')?.dataset.tab;
  const shirt = document.querySelector('.sw-cc-tab[data-tab=shirt]');
  const r = shirt.getBoundingClientRect();
  return { before, beforeTab, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.mouse.click(tabClick.cx, tabClick.cy);
await sleep(250);
const tabAfter = await page.evaluate(() => ({
  activeTab: document.querySelector('.sw-cc-tab.active')?.dataset.tab,
  contentChildren: document.querySelector('.sw-char-content').childElementCount,
}));
console.log('tab-click:', JSON.stringify({ ...tabClick, ...tabAfter }));
ok(tabClick.beforeTab === 'look' && tabAfter.activeTab === 'shirt', '真实点击页签生效(look→shirt 切页)');
// 真实鼠标点击「取消更改」:面板应关闭,且 input.mouseDown 不得置位(点击不穿透成世界输入)
const mouseDownBefore = await page.evaluate(() => window.__swGame.input.mouseDown);
const cancelBtn = await page.evaluate(() => {
  const b = document.querySelector('.sw-char-panel [data-act=back]');
  const r = b.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.mouse.click(cancelBtn.cx, cancelBtn.cy);
await sleep(250);
const cancelAfter = await page.evaluate(() => ({
  panelGone: !document.querySelector('.sw-char-panel'),
  mouseDown: window.__swGame.input.mouseDown,
  mouseHeld: window.__swGame.input.mouseHeld,
}));
console.log('cancel-click:', JSON.stringify({ mouseDownBefore, ...cancelAfter }));
ok(cancelAfter.panelGone, '真实点击「取消更改」关闭面板');
ok(!cancelAfter.mouseDown && !cancelAfter.mouseHeld, '取消点击未漏成世界输入(mouseDown=0)');

await page.screenshot({ path: '/tmp/sw-wardrobe-probe.png' });
console.log('pageerrors:', errs.length ? errs : 'none');
ok(errs.length === 0, '零页面异常');
await browser.close();
console.log(fails.length ? `RESULT: ${fails.length} FAIL` : 'RESULT: ALL PASS');
process.exit(fails.length ? 1 : 0);
