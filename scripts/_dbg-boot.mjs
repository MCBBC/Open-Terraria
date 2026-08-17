import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 400_000 });
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (!t.includes('[rload]') && !t.includes('AudioContext')) console.log('[page]', t.slice(0, 160)); });
page.on('pageerror', (e) => console.log('[PAGEERROR]', String(e).slice(0, 300)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
await page.waitForSelector('select', { timeout: 180000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
const t0 = Date.now();
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 240000 })
  .then(() => console.log('world ready in', ((Date.now() - t0) / 1000).toFixed(1), 's'))
  .catch(() => console.log('WORLD TIMEOUT'));
const st2 = await page.evaluate(() => ({ tick: window.__swGame?.tickCount, hasPlayer: !!window.__swGame?.player, hasWorld: !!window.__swGame?.world })).catch(() => ({}));
console.log('st2:', JSON.stringify(st2));
await browser.close();
