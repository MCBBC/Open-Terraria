// M0 验收：?vuidemo=1 截图 + 无 pageerror 断言
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199/?vuidemo=1';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swVUI && window.__swVUI.ui && window.__swVUI.ui.current, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1200)); // 等字体与首帧

mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/m0-vui-demo.png' });

// 交互：点按钮一次，验证 hit-test + 点击回调
await page.mouse.click(640, 220);
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'shots/m0-vui-demo-clicked.png' });

const state = await page.evaluate(() => ({
  hasState: !!window.__swVUI.ui.current,
  logicalW: window.__swVUI.ui.current ? Math.round(window.__swVUI.ui.getDimensions().width) : 0,
}));
console.log('state:', JSON.stringify(state), 'errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length || !state.hasState) {
  console.error('VUI smoke FAILED');
  process.exit(1);
}
console.log('VUI smoke OK');
