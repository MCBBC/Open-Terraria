// BJ349 逐帧对拍:挥砍中段(轮询 swing.t)精确截图,对照武器贴图是否出现/朝向/位置
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4173';
const TAG = process.env.SW_TAG ?? 'x';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 3000));
const vw = 1360, vh = 860;
const clip = { x: vw / 2 - 300, y: vh / 2 - 200, width: 600, height: 380 };
// 触发一次挥砍(mouse 右),在 swing.t 处于 [3..7] 与 [8..11] 两个窗口各截一帧
const meta = await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = 1360 - 200; g.input.mouseY = Math.round(860 / 2) - 60;  // 右侧偏上
  g.input.mouseDown = true;
  for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  return { swing: g.swing ? { t: g.swing.t, dur: g.swing.dur } : null, facing: g.player.facing };
});
// 轮询抓帧
async function snapAt(lo, hi, path) {
  for (let tries = 0; tries < 40; tries++) {
    const t = await page.evaluate(() => window.__swGame?.swing?.t ?? -1);
    if (t >= lo && t <= hi) {
      const shot = await page.screenshot({ clip });
      writeFileSync(path, shot);
      return { t, ok: true };
    }
    if (t < 0) return { t, ok: false };
    await new Promise(r => setTimeout(r, 8));
  }
  return { t: -2, ok: false };
}
const a = await snapAt(3, 6, `/tmp/bj349-seq-${TAG}-early.png`);
const b = await snapAt(8, 11, `/tmp/bj349-seq-${TAG}-mid.png`);
console.log('META=' + JSON.stringify(meta));
console.log('A=' + JSON.stringify(a) + ' B=' + JSON.stringify(b));
await browser.close();
