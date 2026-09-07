// SW-BJ11 2026-09-07 端到端流程复现:真实 鉴角→进世界 链路,检测在途烘焙毒化
//  毒化指纹:女变体4 烘焙帧 chest(20-25,30-31)/hem(18-25,38-41) 缺失 + 腿(12-15,44-53) 多余
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/swbj11';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5210';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj11-e2e-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等主菜单出现(标题界面有开始按钮)
await sleep(4000);
// 快速通道:直接调 mainFlow 的开世界 API?先看主菜单按钮
const ui1 = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [class*=btn], [role=button]')].map((b) => (b.textContent || '').trim()).filter(Boolean);
  return { btns: btns.slice(0, 20), hasFlow: !!window.__swFlow, hasGame: !!window.__swGame };
});
console.log('MENU:', JSON.stringify(ui1));
console.log('E2E-MENU-DONE');
await browser.close();
