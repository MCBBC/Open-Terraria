// 录制 页面进入→主菜单 的 DevTools trace(dev bundle=真名符号):
//   tracing 在 goto 前启动;主菜单可见+splash 消失后延迟 1.5s 停止。
// 用法:SW_ORIGIN=http://localhost:5201 node scripts/_boot-trace-probe.mjs [out]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5201');
const OUT = process.argv[2] || '/tmp/boot-trace.json';
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
await page.tracing.start({ path: OUT, categories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline', 'disabled-by-default-v8.cpu_profiler'] });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('.sw-title-menu', { timeout: 150000, polling: 500 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 }).catch(() => {});
await new Promise((r) => setTimeout(r, 1500));
await page.tracing.stop();
console.log('trace saved', OUT, fs.statSync(OUT).size);
await browser.close();
