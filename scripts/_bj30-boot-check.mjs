// SW-BJ30: newWorld 启动诊断（console 抓取 + 阶段截图）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5217';
fs.mkdirSync('/tmp/bj30', { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 832 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (!/vite|Download the React|AudioContext/.test(t)) console.log('CONSOLE:', t.slice(0, 240)); });
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 120000 });
console.log('[flow ready]');
const p = page.evaluate(async () => {
  await window.__swFlow.newWorld('424242', 1200, 400);
  return 'newWorld resolved';
});
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  const s = await page.evaluate(() => ({
    hasGame: !!window.__swGame,
    worldW: window.__swGame?.world?.store?.w,
    generating: window.__swGame?.world?.generating,
    modal: [...document.querySelectorAll('div,span,h1,h2')].map((d) => d.textContent?.trim()).filter((t) => t && t.length > 2 && t.length < 60).slice(-6),
  })).catch((e) => ({ err: String(e).slice(0, 120) }));
  console.log(`[t+${(i + 1) * 15}s]`, JSON.stringify(s));
  if (s.worldW) break;
}
const winner = await Promise.race([p, new Promise((r) => setTimeout(() => r('still-pending'), 1000))]);
console.log('[newWorld]:', winner);
await page.screenshot({ path: '/tmp/bj30/newworld-state.png' });
await browser.close();
