// BJ363 探针②:背包开(icon strip 态)信息栏——原版语义=横排图标无文本。
// 断言:①strip 模式下首图标=UI_InfoIcon_0(表) ②DOM 装备页配饰槽(贝壳电话)与
// strip 的几何关系 ③截图目检。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.keyboard.type('BJ363');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('363363');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// 入包贝壳电话(背包 40) + 装备到配饰槽 3
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.armor[3] = { id: window.__swItems['vi_5358_shellphone'], stack: 1 };
  g.cb?.onInventoryChanged?.();
});
await new Promise((r) => setTimeout(r, 900));

// 开背包(Escape)
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 900));

const state = await page.evaluate(() => {
  const g = window.__swGame;
  const inv = g.renderer.playerInventory ?? g.playerInventory;
  const rows = (g.renderer.infoAccs?.state?.rows ?? []).map((r) => ({ icon: r.icon, text: r.text.slice(0, 12) }));
  const rects = (g.renderer.infoAccs?.state?.iconRects ?? []).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), icon: r.row.icon }));
  return { invOpen: inv, rows, rects, W: g.renderer.canvas.width, H: g.renderer.canvas.height, cssW: g.renderer.canvas.clientWidth, cssH: g.renderer.canvas.clientHeight };
});
console.log('invOpen=', state.invOpen, 'canvas=', state.cssW, 'x', state.cssH, '(buf', state.W, 'x', state.H, ')');
console.log('rows(icon strip):', JSON.stringify(state.rows));
console.log('iconRects:', JSON.stringify(state.rects.slice(0, 12)));

// DOM 装备页配饰槽几何(找贝壳电话的槽)
const dom = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('[class*=acc], [class*=equip], [class*=slot]').forEach((el) => {
    const t = (el.title || el.getAttribute('aria-label') || el.textContent || '').trim();
    if (t.includes('贝壳') || t.includes('Shellphone')) {
      const r = el.getBoundingClientRect();
      out.push({ cls: el.className.slice(0, 40), title: t.slice(0, 20), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    }
  });
  return out;
});
console.log('DOM 贝壳槽:', JSON.stringify(dom).slice(0, 400));

await page.screenshot({ path: '/tmp/bj363-720-full.png' });
await page.screenshot({ path: '/tmp/bj363-720-strip.png', clip: { x: 880, y: 0, width: 400, height: 560 } });

// 再按 Escape 关包,截同域竖排态作对拍
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: '/tmp/bj363-720-closed.png', clip: { x: 880, y: 0, width: 400, height: 560 } });

console.log(`errors=${errors.length}`);
errors.slice(0, 4).forEach((e) => console.log('  ' + e.slice(0, 180)));
await browser.close();
process.exit(0);
