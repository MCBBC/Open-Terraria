// 一次性探针：创建世界预览四层合成（UIWorldCreationPreview.cs DrawSelf 1:1）自验。
// 直挂 WorldCreationPanel（不等菜单流），遍历 4 档难度 × 猩红/大，导出预览画布 PNG——
// 核对：①背景层 PreviewDifficulty*1 在（大师=黑日食图，曾整层漏移植"缺太阳"）；
// ②专家/大师 Size/Evil/Bunny 三层 DarkGray(0.5) 压暗、大师兔子层 0.6；③经典档全亮。
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 900, height: 700 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

const shots = await page.evaluate(async () => {
  const mod = await import('/src/ui/WorldCreation.ts?t=' + Date.now());
  const root = document.createElement('div');
  document.body.appendChild(root);
  new mod.WorldCreationPanel(root, { onCreate() {}, onCancel() {} });
  const p = document.querySelector('.sw-wc-panel');
  p.style.zoom = '2';
  const clickGroup = (g, i) => p.querySelector(`[data-g=${g}]`).children[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const grab = async (size, diff, evil) => {
    clickGroup('size', size); clickGroup('diff', diff); clickGroup('evil', evil);
    await new Promise((r) => setTimeout(r, 1200)); // 等 onload 全层就位
    const cv = p.querySelector('.sw-wc-preview');
    const ctx = cv.getContext('2d');
    const img = ctx.getImageData(4, 4, 76, 76).data;
    let opaque = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 0) opaque++;
    return { opaqueRatio: +(opaque / (76 * 76)).toFixed(3), url: cv.toDataURL('image/png') };
  };
  const out = {};
  out.masterCrimson = await grab(2, 2, 2);   // 大/大师/猩红——用户对照场景（黑日食）
  out.classicCrimson = await grab(2, 0, 2);  // 大/经典/猩红——Normal1 背景（蓝天白日）
  out.expertCorrupt = await grab(2, 1, 1);   // 大/专家/腐化——Expert1 背景 + 0.5 压暗
  out.journeyRandom = await grab(2, 3, 0);   // 大/旅程/随机——Normal1 背景 + Creative2 兔
  return out;
});

for (const [k, v] of Object.entries(shots)) {
  writeFileSync(new URL(`../../${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}.png`, import.meta.url).pathname.replace(/^\/private/, ''), Buffer.from(v.url.split(',')[1], 'base64'));
  console.log(k, 'opaqueRatio=', v.opaqueRatio);
}
await browser.close();
console.log('DONE');
