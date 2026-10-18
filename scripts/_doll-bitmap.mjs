// #4 验证:compositePaperDoll 首取 canvas,异步升格后二取 ImageBitmap;玩家像素在画。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/dollbm-profile'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/player/PaperDoll.ts');
  const a = g.player.appearance ?? { name: 'probe', hair: 1, skinVariant: 0,
    hairColor: { r: 120, g: 80, b: 40 }, skinColor: { r: 255, g: 219, b: 172 },
    eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 187, g: 79, b: 60 },
    undershirtColor: { r: 130, g: 130, b: 130 }, pantsColor: { r: 95, g: 105, b: 200 },
    shoeColor: { r: 150, g: 110, b: 80 }, difficulty: 0 };
  let d1 = null;
  for (let k = 0; k < 6 && !d1; k++) {
    d1 = m.compositePaperDoll(a);
    if (!d1) await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 900));
  const d2 = m.compositePaperDoll(a);
  // 玩家像素:主画布玩家位置非全空
  const r = g.renderer, cam = g.camera, z = cam.zoom;
  const sx = Math.round(r.canvas.width / 2 + (g.player.x - 8 - cam.x) * z);
  const sy = Math.round(r.canvas.height / 2 + (g.player.y - 40 - cam.y) * z);
  const d = r.ctx.getImageData(sx, sy, 16, 40).data;
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 40) opaque++;
  return { first: d1?.constructor.name, second: d2?.constructor.name, playerPx: opaque };
}).catch((e) => ({ err: String(e).slice(0, 300) }));
console.log(JSON.stringify(out));
await browser.close();
