// BJ620 件6 #2 复核（插桩中立性）：Browser.setDownloadBehavior behavior:'default'
// （不放宽自动下载策略,仅挂事件监听）——Chrome 多重自动下载拦截原生面复测。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5202');
const DL_DIR = '/tmp/bj620-dl-default';
mkdirSync(DL_DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 1280, height: 800 } });
const page = (await browser.pages())[0] ?? await browser.newPage();
await page.goto(URL + '/?seedkv=dldef' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000, polling: 300 });
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'default', downloadPath: DL_DIR, eventsEnabled: true });
const began = [];
const progress = [];
cdp.on('Browser.downloadWillBegin', (e) => began.push(e.suggestedFilename));
cdp.on('Browser.downloadProgress', (e) => progress.push({ file: e.guid, state: e.state }));
for (let i = 0; i < 6; i++) {
  await page.evaluate((i) => {
    const blob = new Blob([JSON.stringify({ probe: 'bj620-dl-def', i })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bj620def-${i}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }, i);
  await new Promise((r) => setTimeout(r, 400));
}
await new Promise((r) => setTimeout(r, 3000));
console.log(`behavior:default 下 downloadWillBegin ${began.length}/6：`, began.join(', ') || '（全拦）');
console.log('progress:', progress.map((p) => p.state).join(',') || '（零事件=全拦）');
await browser.close();
console.log('==== #2 default 复核完 ====');
