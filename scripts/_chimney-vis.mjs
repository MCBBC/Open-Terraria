// 烟囱视觉取证:进入世界→截屏循环→保存连续帧直接看
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || '/Users/vinlic/Downloads/map-FTW_V2 (10).json';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, defaultViewport: { width: 640, height: 480 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate((t) => window.__swFlow.loadJson(t), fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
// 设白天
await page.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0.35; });
// 传送
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 4131 * 16 + 8; g.player.y = (437 - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 2500));
fs.mkdirSync('/tmp/chimvis', { recursive: true });
for (let k = 0; k < 60; k++) {
  const buf = await page.screenshot({ type: 'png', clip: { x: 184, y: 160, width: 320, height: 220 } });
  fs.writeFileSync(`/tmp/chimvis/f${String(k).padStart(3,'0')}.png`, buf);
  await new Promise((r) => setTimeout(r, 67));   // 15fps 截频
}
console.log('saved 60');
await browser.close();
