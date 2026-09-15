// 输入首击被吞三症状复现探针(用户实报 2026-09-15):
//   ①全屏地图开启的那次按压拖不动(需再点一下) ②选快捷栏物品后首击不使用
//   ③窗口失焦回焦后首击无效
// 运行:SW_ORIGIN=http://localhost:5225 node tools/run-diag.mjs scripts/_inp-firstclick-repro.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5225';
const fails = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 300)));

await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await sleep(800);
await page.evaluate(() => {
  document.getElementById('sw-welcome-announce')?.remove();
  window.__swUI.closeInventory();
  // useSwing 计数(私有方法运行时可见)
  const g = window.__swGame;
  window.__useN = 0;
  const orig = g.useSwing.bind(g);
  g.useSwing = function (...a) { window.__useN++; return orig(...a); };
});
await sleep(200);

/** 等全屏地图缩放缓动落定(zoom≈zoomTarget) */
async function waitMapSettled() {
  await page.waitForFunction(() => {
    const fm = window.__swGame.renderer.fullMap;
    return fm.open && Math.abs(fm.zoom - fm.zoomTarget) < 0.02;
  }, { timeout: 8000, polling: 50 }).catch(() => {});
  await sleep(120);
}

/** 按住并拖动(不松开期间采样 pan) */
async function pressDragSamplePan() {
  const pan0 = await page.evaluate(() => { const fm = window.__swGame.renderer.fullMap; return { x: fm.panX, y: fm.panY }; });
  await page.mouse.move(800, 500);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.move(880, 560, { steps: 8 });
  await sleep(160);
  const pan1 = await page.evaluate(() => { const fm = window.__swGame.renderer.fullMap; return { x: fm.panX, y: fm.panY, dragging: true }; });
  await page.mouse.up();
  await sleep(80);
  return { pan0, pan1, dx: pan1.x - pan0.x, dy: pan1.y - pan0.y };
}

// ================= 症状①A:M 键开图 → 首次按压拖动 =================
{
  await page.keyboard.press('KeyM');
  await sleep(150);
  await waitMapSettled();
  const open = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
  const r = await pressDragSamplePan();
  ok(open, '①A-pre: M 键开图成功');
  ok(Math.abs(r.dx) + Math.abs(r.dy) > 0, '①A: M 开图后首次按压拖动位移>0', `dx=${r.dx.toFixed(1)} dy=${r.dy.toFixed(1)}`);
  await page.keyboard.press('KeyM'); // 关图
  await sleep(150);
}

// ================= 症状①B:小地图点击开图 → 首次按压拖动 =================
{
  const mm = await page.evaluate(() => {
    const r = window.__swGame.renderer.minimapRect;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  });
  await page.mouse.click(mm.x, mm.y);
  await sleep(150);
  const open = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
  await waitMapSettled();
  const r = await pressDragSamplePan();
  ok(open, '①B-pre: 小地图点击开图成功');
  ok(Math.abs(r.dx) + Math.abs(r.dy) > 0, '①B: 小地图开图后首次按压拖动位移>0', `dx=${r.dx.toFixed(1)} dy=${r.dy.toFixed(1)}`);
  await page.keyboard.press('KeyM');
  await sleep(150);
}

// ================= 症状②:快捷栏选中 → 单次点击使用 =================
{
  const slot = await page.evaluate(() => {
    const el = document.querySelector('.sw-hotbar .sw-slot[data-idx="0"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, item: window.__swGame.player.inv.slots[0]?.id ?? -1 };
  });
  ok(slot && slot.item > 0, '②-pre: 槽 0 有物品', `id=${slot?.item}`);
  if (slot) {
    await page.mouse.click(slot.x, slot.y);   // 选中槽 0
    await sleep(120);
    const sel = await page.evaluate(() => window.__swGame.player.inv.selected);
    ok(sel === 0, '②-pre: 点击槽 0 已选中', `selected=${sel}`);
    const n0 = await page.evaluate(() => window.__useN);
    await page.mouse.move(800, 500);
    await page.mouse.down();   // 单次点击世界
    await sleep(80);
    await page.mouse.up();
    await sleep(120);
    const n1 = await page.evaluate(() => window.__useN);
    ok(n1 > n0, '②: 选中后单次点击即触发使用', `useN ${n0}->${n1}`);
  }
}

// ================= 症状③:失焦 → 回焦 → 首击 =================
{
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(120);
  const flag = await page.evaluate(() => window.__swGame.input.delayUseItem);
  ok(flag === true, '③-pre: blur 后 delayUseItem 已置位');
  // 首击(使用)
  const n0 = await page.evaluate(() => window.__useN);
  await page.mouse.move(700, 450);
  await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(120);
  const n1 = await page.evaluate(() => window.__useN);
  ok(n1 > n0, '③A: 回焦后首击即触发使用(原版=鼠标已松时 flag 首帧即清)', `useN ${n0}->${n1}`);
  // 第二击(确认恢复)
  const n2v = await page.evaluate(() => window.__useN);
  await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(120);
  const n3 = await page.evaluate(() => window.__useN);
  ok(n3 > n2v, '③A2: 第二击正常(对照)', `useN ${n2v}->${n3}`);
  // 地图拖动面:blur → M 开图 → 首次按压拖动
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(100);
  await page.keyboard.press('KeyM');
  await sleep(150);
  await waitMapSettled();
  const r = await pressDragSamplePan();
  ok(Math.abs(r.dx) + Math.abs(r.dy) > 0, '③B: 回焦后首击可拖动全屏地图(原版 mouseLeft 电平门)', `dx=${r.dx.toFixed(1)} dy=${r.dy.toFixed(1)}`);
  await page.keyboard.press('KeyM');
  await sleep(120);
}

console.log('---- page errors ----');
for (const e of errs.slice(0, 8)) console.log(e);
console.log(fails.length === 0 ? 'ALL PASS' : `FAILURES: ${fails.length}`);
await browser.close();
process.exit(fails.length === 0 ? 0 : 1);
