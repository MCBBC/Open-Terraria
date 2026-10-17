// 一次性诊断:烘焙沉降门内部状态(与 features 探针同流程前段)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5211/?play=small', { waitUntil: 'domcontentloaded', timeout: 180000 });
let inGame = false;
for (let i = 0; i < 300 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.world)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(async () => { await window.__swGame.newWorld('05162020', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 300 && !ready; i++) {
  ready = await page.evaluate(() => window.__swGame?.world?.store?.w === 4200).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => { window.__swGame.paused = true; });
await new Promise((r) => setTimeout(r, 1500));
const dump = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.chunks;
  const v = c.animView;
  const vis = { total: 0, missing: 0, placeholder: 0 };
  if (v) {
    for (let cy = Math.floor(v.y0 / 256); cy <= Math.floor(v.y1 / 256); cy++) {
      for (let cx = Math.floor(v.x0 / 256); cx <= Math.floor(v.x1 / 256); cx++) {
        if (cx < 0 || cy < 0) continue;
        vis.total++;
        const p = c.chunks.get(((cx & 0xffff) | ((cy & 0xffff) << 16)));
        if (!p) vis.missing++;
        else if (p.placeholder) vis.placeholder++;
      }
    }
  }
  return {
    wbake: !!window.__swBakeFlags?.enabled, client: !!c.bakeClient,
    viewportCovered: c.viewportCovered(), animView: v,
    workerAwaiting: c.workerAwaiting.size, budgetAwaiting: c.budgetAwaiting.size,
    dirtyQueue: c.dirtyQueue.length, vis,
  };
});
console.log(JSON.stringify(dump, null, 1));
await browser.close();
