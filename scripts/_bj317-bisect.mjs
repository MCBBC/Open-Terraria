import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
await bootstrap(page, 'http://localhost:5201');
await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
await pump(page, 30);
const raf = async (n) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r))); };
const snap = async (label) => {
  await raf(6);
  const info = await page.evaluate(() => {
    const g = window.__swGame, cam = g.camera;
    // 画布下半屏非天空像素率（天空=蓝渐变,R 通道 < B 通道且平滑;粗判:取 y=600 行的色样）
    const cv = g.renderer.canvas;
    const sc = document.createElement('canvas'); sc.width = 64; sc.height = 8;
    const c2 = sc.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, cv.height - 100, 256, 40, 0, 0, 64, 8);
    const d = c2.getImageData(0, 0, 64, 8).data;
    let ground = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 1] < 140 && d[i] < 160) ground++; }   // 泥土棕绿
    return { camX: Math.round(cam.x), camY: Math.round(cam.y), groundPx: ground };
  });
  console.log(`[bisect] ${label}: cam=(${info.camX},${info.camY}) groundPx=${info.groundPx}/512`);
};
await snap('0. baseline-spawn');
await page.evaluate(() => window.__swGame.world.clock.tick = () => {});
await snap('1. clockFrozen(manual)');
await page.evaluate(() => { window.__swGame.camera.follow = () => {}; });
await snap('2. followNoop');
await page.evaluate(() => { const c = window.__swGame.camera; c.x = 34376; c.y = 4528; });
await snap('3. camTeleport');
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const bx = 2099, by = 280;
  for (let dx = -70; dx <= 70; dx++) for (let dy = -24; dy <= 20; dy++) st.setTile(bx + dx, by + dy, 0);
  for (let dx = -70; dx <= 70; dx++) for (let dy = 6; dy <= 16; dy++) st.setTile(bx + dx, by + dy, 1);
});
await raf(60);
await snap('4. sceneBuilt+raf60');
await browser.close();
