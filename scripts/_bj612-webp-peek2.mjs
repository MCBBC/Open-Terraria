// BJ612 一次性 v2:元素级截图(只截 demo 图),40 张密集采样
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const b64 = readFileSync('/tmp/qs-demo.webp').toString('base64');
const browser = await launchBrowser({});
const page = await openPage(browser, {});
mkdirSync('/tmp/bj612-peek2', { recursive: true });
await page.setContent(`<body style="margin:0;background:#0f0">
<img id="d" style="width:960px;image-rendering:pixelated;display:block" src="data:image/webp;base64,${b64}"></body>`);
const el = await page.$('#d');
const N = 40, TOTAL = 17000;
for (let k = 0; k < N; k++) {
  await new Promise(r => setTimeout(r, TOTAL / N));
  await el.screenshot({ path: `/tmp/bj612-peek2/e${String(k).padStart(2, '0')}.png` });
}
console.log('done');
await browser.close();
process.exit(0);
