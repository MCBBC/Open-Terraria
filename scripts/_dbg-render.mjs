import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: 'new', protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pe]', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));
const r = await page.evaluate(async () => {
  try { const m = await import('/src/render/Renderer.ts'); return { ok: true, hasFn: typeof m.npcFootFlushOn }; }
  catch (e) { return { ok: false, err: String(e).slice(0, 300) }; }
});
console.log(JSON.stringify(r));
await browser.close();
