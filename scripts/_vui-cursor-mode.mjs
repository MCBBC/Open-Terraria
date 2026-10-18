// #2 光标独占模式验证:游戏内 ui-canvas 80×dpr + transform 跟鼠标 + 光标像素非空。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/vuicur-profile'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));
await page.mouse.move(640, 400);
await new Promise((r) => setTimeout(r, 600));
const s1 = await page.evaluate(() => {
  const VUI = window.__swVUI;
  const c = document.getElementById('ui-canvas');
  return { size: `${c.width}x${c.height}`, css: c.style.width, transform: c.style.transform,
    cursorOnly: VUI.cursorOnly };
});
await page.mouse.move(300, 200);
await new Promise((r) => setTimeout(r, 400));
const s2 = await page.evaluate(() => {
  const c = document.getElementById('ui-canvas');
  // 光标像素:画布中心附近应有非零 alpha(光标画在局部 PAD 处)
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaque++;
  return { transform: c.style.transform, opaquePx: opaque };
});
console.log(JSON.stringify({ at640: s1, at300: s2 }));
await browser.close();
