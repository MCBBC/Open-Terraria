// BJ344 快速判定：quit 后 __swNatureParticles.onDripSplash / wiring 全局态
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('[page]', m.text().slice(0, 120)); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const s = document.querySelector('select'); if (s) { s.selectedIndex = 0; s.parentElement.querySelector('button').click(); } });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const quitErr = await page.evaluate(async () => {
  try { await window.__swFlow.quitToMenu(); return null; } catch (e) { return String(e); }
});
console.log('quit err:', quitErr);
await new Promise((r) => setTimeout(r, 2500));
const st = await page.evaluate(() => ({
  onDrip: typeof window.__swNatureParticles?.onDripSplash,
  st: !!window.__swNatureParticles?.st,
  swGame: !!window.__swGame,
}));
console.log('after quit:', JSON.stringify(st));
await browser.close();
