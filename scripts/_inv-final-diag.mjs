// 一次性:背包面板终验(2026-08-27)——
//  ①默认关闭(display none);②E 开:左缘=热键栏首格 inline left(±2px)、顶=槽底+8±4;
//  ③背景 alpha 覆写生效且无面板级 opacity;④边框弱化 rgba。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 300; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓');
  btn?.click();
});
await new Promise((r) => setTimeout(r, 800));
const closed = await page.evaluate(() => ({
  invClosedByDefault: !window.__swUI.inventoryOpen,
  displayNone: window.__swUI.invPanel.style.display === 'none',
}));
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 400));
const open = await page.evaluate(() => {
  const ip = window.__swUI.invPanel;
  const hb0 = window.__swUI.hotbarEl.querySelector('.sw-slot');
  const hbLeft = parseFloat(hb0?.style.left ?? '');
  const hbTop = parseFloat(hb0?.style.top ?? '');
  const pr = ip.getBoundingClientRect();
  return {
    invOpen: window.__swUI.inventoryOpen,
    leftDelta: Number.isFinite(hbLeft) ? +(pr.left - hbLeft).toFixed(1) : null,
    topGap: Number.isFinite(hbTop) ? +(pr.top - (hbTop + 52)).toFixed(0) : null,
    bgAlpha: (ip.style.background.match(/rgba\(38,\s*50,\s*90,\s*([\d.]+)\)/) ?? [])[1] ?? null,
    noPanelOpacity: (ip.style.opacity ?? '') === '',
    borderColor: ip.style.borderColor,
  };
});
console.log(JSON.stringify({ ...closed, ...open }, null, 1));
await page.screenshot({ path: '/tmp/inv-final.png' });
await browser.close();
