// 一次性:竖列排序/尺寸统一/堆叠居中/面板透明 验证(2026-09-02 第四批)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 300)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const holder = [...document.querySelectorAll('div')].filter((d) => d.textContent?.includes('欢迎来到') && d.textContent.length < 3000);
  const top = holder[holder.length - 1];
  let n = top; while (n && n.parentElement && n.parentElement !== document.body && !(n.style?.position === 'fixed' && n.style?.inset)) n = n.parentElement;
  (n ?? top)?.remove();
  window.__swUI.openInventory();
});
await new Promise((r) => setTimeout(r, 400));
const out = await page.evaluate(() => {
  const ui = window.__swUI, panel = document.querySelector('.sw-panel');
  const col = panel.querySelector('[style*="margin-top:10px"]');   // sideCol
  const kids = col ? [...col.children].map((c) => c.title || c.className || c.tagName) : null;
  const emote = panel.querySelector('[style*="UI_Emotes"]');
  const qs = ui.quickStackBtn;
  const qsRow = qs.parentElement;
  const cs = panel ? getComputedStyle(panel) : null;
  const sizes = {};
  for (const sel of ['UI_Emotes', 'UI_Bestiary', 'UI_DisplaySlots_4']) {
    const b = panel.querySelector(`[style*="${sel}"]`);
    if (b) { const r = b.getBoundingClientRect(); sizes[sel] = `${Math.round(r.width)}x${Math.round(r.height)}`; }
  }
  return {
    sideColOrder: kids,
    iconSizes: sizes,
    clusterJustify: qsRow ? getComputedStyle(qsRow).justifyContent : null,
    qsCentered: qsRow && qs ? Math.abs((qsRow.getBoundingClientRect().left + qsRow.getBoundingClientRect().width / 2) - (qs.getBoundingClientRect().left + qs.getBoundingClientRect().width / 2)) < 2 : null,
    panelBg: cs?.backgroundColor + '|' + cs?.backgroundImage,
    panelBorder: cs?.borderStyle + '/' + cs?.borderWidth,
    panelShadow: cs?.boxShadow,
    invClass: panel.className,
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('PAGE_ERRORS:', JSON.stringify(errs.slice(0, 5), null, 1));
await page.screenshot({ path: 'shots/transparent-panel.png' });
await browser.close();
