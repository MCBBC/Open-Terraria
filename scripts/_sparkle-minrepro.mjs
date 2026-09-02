// 最小复现：纯 canvas（无游戏依赖）复刻 prettyStarSparkle 三代实现 × 合成路径，
// 逐面板对"参考背景"做逐像素 diff —— 判定 'lighter' 下是否可能产出暗底。
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const DIR = '/tmp/sparkle-repro';
const MIME = { '.html': 'text/html', '.png': 'image/png' };
const server = createServer((req, res) => {
  const f = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const body = readFileSync(DIR + f);
    res.writeHead(200, { 'content-type': MIME[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({
  protocolTimeout: 240000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1380, height: 700 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 160)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 30000 });
const results = await page.evaluate(() => window.runRepro());
await page.screenshot({ path: '/tmp/sparkle-repro/stage.png' });
console.log(JSON.stringify(results, null, 1));
const dark = results.filter((r) => r.darker > r.samples * 0.001);
console.log(dark.length ? 'DARK-PANELS: ' + dark.map((d) => d.label).join(' | ') : 'NO DARK PANELS');
await browser.close();
server.close();
