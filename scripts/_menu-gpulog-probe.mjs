// 菜单期 gpulog 覆盖验证:纯菜单停留 10s,应捕获 [gpulog] 行且含 menubg 记账
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5206';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const logs = [];
page.on('console', m => { const t = m.text(); if (t.includes('[gpulog]') || t.includes('驻留=')) logs.push(t); });
await page.goto(ORIGIN + '/?gpulog=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await new Promise(r => setTimeout(r, 10000));
const gl = await page.evaluate(() => window.__swGPULog?.snapshot?.() ?? null);
console.log('console [gpulog] lines:', logs.length);
for (const l of logs.slice(-3)) console.log(l);
console.log('snapshot ctxs:', gl ? Object.keys(gl.ctxs) : null, '| menubg liveMB:', gl?.ctxs?.menubg?.liveMB);
await browser.close();
const ok = logs.length > 0 && gl && gl.ctxs['menubg'];
console.log(ok ? '=== MENU COVERAGE PASS' : '=== FAIL');
process.exit(ok ? 0 : 3);
