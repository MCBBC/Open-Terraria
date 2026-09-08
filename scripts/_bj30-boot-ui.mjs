// SW-BJ30: 走真实 UI 建世界（单人模式 → 世界创建面板 → 小/创建新世界）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5217';
fs.mkdirSync('/tmp/bj30', { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 832 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (!/vite|Download the React|AudioContext/.test(t)) console.log('CONSOLE:', t.slice(0, 200)); });
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));

const clickText = async (txt) => {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === t && e.offsetParent);
    if (!els.length) return false;
    els[els.length - 1].click();
    return true;
  }, txt);
  console.log(`[click ${txt}]`, ok);
  return ok;
};

await clickText('单人模式');
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: '/tmp/bj30/ui-1-singleplayer.png' });
// 世界创建面板：可能直接有 创建新世界 按钮（小/中/大 是尺寸选择）
await clickText('小');
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/bj30/ui-2-create.png' });
await clickText('创建新世界');
console.log('[clicked 创建新世界] waiting world...');
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const s = await page.evaluate(() => ({
    hasGame: !!window.__swGame,
    worldW: window.__swGame?.world?.store?.w,
    generating: window.__swGame?.world?.generating,
  })).catch((e) => ({ err: String(e).slice(0, 120) }));
  console.log(`[t+${(i + 1) * 10}s]`, JSON.stringify(s));
  if (s.worldW) break;
}
await page.screenshot({ path: '/tmp/bj30/ui-3-result.png' });
const finalState = await page.evaluate(() => ({
  hasGame: !!window.__swGame,
  worldW: window.__swGame?.world?.store?.w,
  playerOk: !!window.__swGame?.player,
}));
console.log('[final]', JSON.stringify(finalState));
await browser.close();
