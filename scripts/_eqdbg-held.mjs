// 一次性:第七批验证(格距实测对齐/物品不随半透/卡贴格/去标签/弹药钱币垃圾桶半透)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await page.waitForFunction(() => window.__swUI?.quickStackBtn, { timeout: 60000, polling: 200 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => { try { window.__swUI.openInventory(); } catch {} });
await new Promise((r) => setTimeout(r, 400));
const out = await page.evaluate(() => {
  const ui = window.__swUI, panel = document.querySelector('.sw-panel');
  const ig = panel.querySelector('.sw-invgrid');
  const s10 = ig.querySelector('.sw-slot[data-idx="10"]');
  const s11 = ig.querySelector('.sw-slot[data-idx="11"]');
  const s20 = ig.querySelector('.sw-slot[data-idx="20"]');
  const r10 = s10.getBoundingClientRect(), r11 = s11.getBoundingClientRect(), r20 = s20.getBoundingClientRect();
  // 热键栏实测节距(未选中相邻槽 5,6)
  const h5 = document.querySelector('.sw-hotbar .sw-slot[data-idx="5"]').getBoundingClientRect();
  const h6 = document.querySelector('.sw-hotbar .sw-slot[data-idx="6"]').getBoundingClientRect();
  const hotPitch = Math.round((h6.left - h5.left) * 100) / 100;
  const after10 = getComputedStyle(s10, '::after');
  const img = s10.querySelector('img');
  const coin = panel.querySelector('.sw-slot.sm[data-idx="50"]') || panel.querySelector('.sw-slot.sm');
  const trash = panel.querySelector('.sw-trash');
  const card = panel.querySelector('.sw-ach-advisor');
  const cluster = ui.quickStackBtn.parentElement.getBoundingClientRect();
  const label = [...panel.querySelectorAll('.sw-lbl')].map((l) => l.textContent);
  return {
    gridPitchX: Math.round((r11.left - r10.left) * 100) / 100,
    hotPitch,
    pitchMatch: Math.abs((r11.left - r10.left) - (h6.left - h5.left)) < 1.5,
    gridPitchY: Math.round((r20.top - r10.top) * 100) / 100,
    gridSlotOpacity: getComputedStyle(s10).opacity,        // 期望 1(物品全亮)
    gridAfterOpacity: after10.opacity,                     // 期望 0.575(只有格底半透)
    gridAfterBg: after10.backgroundImage.includes('Back20'),
    gridVisW: Math.round(r10.width),
    coinAfter: coin ? getComputedStyle(coin, '::after').opacity : null,
    trashAfter: trash ? getComputedStyle(trash, '::after').opacity : null,
    cardGap: card ? Math.round(card.getBoundingClientRect().top - cluster.bottom) : 'no-card',
    backpackLabelGone: !label.includes('背包'),
    labels: label.slice(0, 6),
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('ERRS', JSON.stringify(errs.slice(0, 3)));
await page.screenshot({ path: 'shots/batch7-final.png' });
await browser.close();
