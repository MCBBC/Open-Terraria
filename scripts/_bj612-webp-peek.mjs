// BJ612 一次性:浏览器渲染 wiki demo 动画 webp,定时截图取原版蜘蛛观感
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const b64 = readFileSync('/tmp/qs-demo.webp').toString('base64');
const browser = await launchBrowser({});
const page = await openPage(browser, {});
mkdirSync('/tmp/bj612-peek', { recursive: true });
await page.setContent(`<body style="margin:0;background:#222">
<img id="d" style="width:960px;image-rendering:pixelated" src="data:image/webp;base64,${b64}"></body>`);
// 动画约 778 帧×20ms≈16s;每隔 1.2s 截一张,共 14 张
for (let k = 0; k < 14; k++) {
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: `/tmp/bj612-peek/t${String(k).padStart(2, '0')}.png` });
}
console.log('done');
await browser.close();
process.exit(0);
