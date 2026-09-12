// ★SW-FX51 探针：热栏滚轮切换 + 全屏图缩放复利——浏览器级证据（真 WheelEvent →
// Input 入账 → tick 消费 → 槽位/zoom）。断言失败 exit 2,全绿 exit 0。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && window.__swUI; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, ui = window.__swUI;
  const el = g.input.el ?? document.querySelector('canvas');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wheel = (dY) => el.dispatchEvent(new WheelEvent('wheel', { deltaY: dY, cancelable: true, bubbles: true }));
  const dbg = (tag) => results.push({ name: 'DBG ' + tag, got: `wd=${g.input.wheelDelta} carry=${g.input._wheelPxCarry} tick=${g.tickCount} invOpen=${window.__swUI?.inventoryOpen} uiB=${g.input.uiBlocking} paused=${g.paused} mapOpen=${g.renderer.fullMap.open} spec=${g.spectatingSlot}`, want: '-', ok: true });
  const results = [];
  const check = (name, got, want) => results.push({ name, got, want, ok: Object.is(got, want) });
  const checkF = (name, got, want, eps = 1e-9) => results.push({ name, got, want, ok: Math.abs(got - want) < eps });
  const sel = () => p.inv.selected;

  // 归零到槽 1（index 0）
  p.inv.selected = 0;
  await sleep(80);

  const zeroCarry = () => { g.input.wheelDelta = 0; g.input._wheelPxCarry = 0; };
  // ① 上滚一档=上一格（0→9 环绕;/-120 语义）
  zeroCarry(); wheel(-120); await sleep(160);
  check('① 上滚 0→9（环绕/上滚=上一格）', sel(), 9);
  // ② 下滚一档=下一格（9→0）
  zeroCarry(); wheel(120); await sleep(160);
  check('② 下滚 9→0（环绕回）', sel(), 0);
  // ③ 同拍双档：两事件同帧内 → +2
  zeroCarry(); wheel(120); wheel(120); await sleep(200);
  check('③ 同拍双档 0→2（一帧多档直走）', sel(), 2);
  // ④ 子档拍（±100px Chrome 档面）：余数留置——两事件=1 档
  p.inv.selected = 0; await sleep(80);
  zeroCarry();
  wheel(-100); await sleep(160);
  const subMid = sel();
  dbg('④ 段内 carry 状态');
  wheel(-100); await sleep(160);
  check('④a 子档首拍 0→0（余数留置不发布）', subMid, 0);
  check('④b 子档次拍 0→9（累计满档补发=环绕）', sel(), 9);

  // ⑤ 全屏图：缩放复利,槽位不动
  const fm = g.renderer.fullMap;
  fm.zoom = 2; fm.zoomTarget = 2; fm.open = true;
  p.inv.selected = 3; await sleep(80);
  zeroCarry(); wheel(-120); await sleep(100);
  const z1 = fm.zoomTarget;
  zeroCarry(); wheel(-120); await sleep(100);
  const z2 = fm.zoomTarget;
  checkF('⑤a 上滚一档 zoomTarget=2×1.3', z1, 2.6, 1e-9);
  checkF('⑤b 连滚两拍复利=2×1.3²', z2, 3.38, 1e-9);
  check('⑤c 地图开态槽位不动', sel(), 3);
  zeroCarry(); dbg('⑤d 前状态'); wheel(120); await sleep(100);
  checkF('⑤d 下滚 ×0.7（3.38×0.7）', fm.zoomTarget, 2.366, 1e-9);
  fm.open = false;

  // ⑥ 背包开态：热栏不切（:25404 playerInventory 支）
  ui.openInventory(); await sleep(120);
  p.inv.selected = 5; await sleep(60);
  zeroCarry(); wheel(-120); await sleep(160);
  check('⑥ 背包开态滚轮不切槽（仍 5）', sel(), 5);
  ui.closeInventory(); await sleep(120);
  // 关包后恢复切换（门=活取非滞留）
  zeroCarry(); wheel(-120); await sleep(160);
  check('⑥b 关包恢复滚轮（5→4）', sel(), 4);

  // ⑦ 暂停浮层（paused=inFancyUI/ingameOptionsWindow 等价）：不切
  g.paused = true; await sleep(60);
  zeroCarry(); wheel(-120); await sleep(160);
  check('⑦ paused 态不切槽（仍 4）', sel(), 4);
  dbg('⑦ paused 期 wheelDelta 是否滞留');
  g.paused = false; await sleep(200);
  check('⑦b 恢复后无滞留消费（仍 4）', sel(), 4);
  // ⑧ 拍照模式：不切（分支序 ②支）
  g.renderer.captureMode.active = true; await sleep(60);
  zeroCarry(); wheel(-120); await sleep(160);
  check('⑧ captureMode 态不切槽（仍 4）', sel(), 4);
  dbg('⑧ capture 期 Input 是否被 main.ts 拦截');
  g.renderer.captureMode.active = false;

  await sleep(100);
  return results;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
const bad = out.filter((r) => !r.ok);
if (bad.length) { console.error(`FX51 PROBE RED: ${bad.length} 项失败`); process.exit(2); }
console.log('FX51 PROBE GREEN');
