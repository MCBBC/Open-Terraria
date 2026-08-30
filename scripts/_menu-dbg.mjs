// 取证：torch 图标解析链（干净版）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r=>setTimeout(r,1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const modUI = await import('/src/ui/UI.ts');
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
  const k = VANILLA_ITEM_KEY_BY_ID[8];
  const iid = ITEM_BY_KEY[k];
  const url = modUI.iconUrl(g, iid);
  return { k, iid, urlHead: String(url ?? '').slice(0, 50) };
});
console.log(JSON.stringify(out));
await browser.close();
