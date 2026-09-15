// DOM 普查:开包态哪些元素 pointer-events:auto 且面积大(可吞世界点击)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
await sleep(1200);
const out = await page.evaluate(() => {
  document.getElementById('sw-welcome-announce')?.remove();
  const ui = window.__swUI;
  ui.openInventory(true);
  const vw = innerWidth, vh = innerHeight;
  const rows = [];
  const els = document.querySelectorAll('body *');
  for (const e of els) {
    const cs = getComputedStyle(e);
    if (cs.pointerEvents === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const area = r.width * r.height;
    if (area < vw * vh * 0.10) continue;   // 只看 ≥10% 视口的大元素
    rows.push({
      tag: e.tagName, cls: String(e.className).slice(0, 60), id: e.id,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      pct: Math.round(area / (vw * vh) * 100), z: cs.zIndex, pe: cs.pointerEvents,
    });
  }
  return { vw, vh, rows, vinvRootPE: getComputedStyle(document.querySelector('.sw-vinv')).pointerEvents };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
