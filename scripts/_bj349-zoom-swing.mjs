// BJ349 放大特写对拍:挥砍中段紧框玩家 4x 特写,肉眼判定武器贴图存在性/朝向/位置
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4173';
const TAG = process.env.SW_TAG ?? 'x';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--force-device-scale-factor=4'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 3000));
// 触发挥砍(mouse 右偏上)并返回玩家屏幕位置(用 game 的相机换算面)
const info = await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = 1360 - 200; g.input.mouseY = Math.round(860 / 2) - 60;
  g.input.mouseDown = true;
  for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  // 玩家屏幕 px:探针页面不引模块,用 renderer 内部换算若可;否则用 camera 字段族
  const cam = g.renderer?.camera ?? g.camera ?? {};
  const cands = {};
  for (const k of ['x', 'y', 'px', 'worldX']) if (typeof cam[k] === 'number') cands[k] = +cam[k].toFixed(1);
  return { cam: cands, playerCx: g.player.cx, playerCy: g.player.cy, vw: 1360, vh: 860 };
});
// 玩家在屏幕中心(相机跟随):clip 中心=视口中心
const cx = info.vw / 2, cy = info.vh / 2;
// 轮询挥砍 t=5..8 抓特写
let shotInfo = null;
for (let tries = 0; tries < 60; tries++) {
  const t = await page.evaluate(() => window.__swGame?.swing?.t ?? -1);
  if (t >= 4 && t <= 8) {
    const shot = await page.screenshot({ clip: { x: cx - 90, y: cy - 90, width: 180, height: 180 } });
    writeFileSync(`/tmp/bj349-zoom-${TAG}.png`, shot);
    shotInfo = { t };
    break;
  }
  if (t < 0) break;
  await new Promise(r => setTimeout(r, 6));
}
console.log('ZOOM=' + TAG + ' info=' + JSON.stringify(info) + ' shot=' + JSON.stringify(shotInfo));
await browser.close();
