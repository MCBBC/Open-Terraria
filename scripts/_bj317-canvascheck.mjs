import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { writeFileSync } from 'node:fs';
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
await bootstrap(page, 'http://localhost:5201');
await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
await pump(page, 30);
for (let i = 0; i < 30; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
const info = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  return { cw: cv.width, ch: cv.height, canvases: [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, id: c.id, cls: c.className, z: getComputedStyle(c).zIndex, pos: getComputedStyle(c).position })) };
});
console.log('[check]', JSON.stringify(info, null, 1));
const b64 = await page.evaluate(() => window.__swGame.renderer.canvas.toDataURL('image/png'));
writeFileSync('/tmp/bj317-out/canvas-direct.png', Buffer.from(b64.split(',')[1], 'base64'));
await page.screenshot({ path: '/tmp/bj317-out/page-composite.png' });
await browser.close();
