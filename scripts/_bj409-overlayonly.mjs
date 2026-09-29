// BJ409：隐藏世界画布,纯 overlay 内容截图（final 场 t=bgT+240）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5380';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false) && i > 8) break;
}
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /我已知晓|Got it/.test(x.textContent ?? ''));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 800));
const info = await page.evaluate(async () => {
  const cr = await import('/src/world/CreditsRoll.ts');
  const comp = await import('/src/world/creditsRollComposer.ts');
  const fill = comp.getCreditsRollFill(true);
  const bgSeg = fill.segments.find((s) => s.k === 'spr' && s.tex === 'Extra_241');
  cr.creditsRoll.tryStarting(fill.endTime);
  // 隐藏世界与 UI 画布（body 直挂 canvas 全藏,只留 overlay）
  const style = document.createElement('style');
  style.id = '__bj409hide';
  style.textContent = 'canvas:not(.sw-credits){visibility:hidden!important}';
  document.head.appendChild(style);
  return { bgT: bgSeg.t, endTime: fill.endTime };
});
await page.evaluate(async (t) => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1; inst.t = t;
}, info.bgT + 240);
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: '/tmp/bj409/overlay-only-final.png' });
await page.evaluate(async (t) => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1; inst.t = t;
}, info.bgT + 620);
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: '/tmp/bj409/overlay-only-late.png' });
console.log(JSON.stringify(info));
await browser.close();
process.exit(0);
