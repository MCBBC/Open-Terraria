// 指定格 fullbright 截图(放大观察)
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const MAP = needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (2).json'));
const mapStr = readFileSync(MAP, 'utf8');
const marksJson = JSON.parse(readFileSync(needInput(join(DOWNLOADS, 'marks-浮夸的羡慕顶峰 (1).json')), 'utf8'));
const byNo = new Map(marksJson.marks.map((m) => [m.no, m]));
const picks = process.env.SW_PICKS ? process.env.SW_PICKS.split(',').map(Number) : [1];
const OUT = join(HOME, '.claude/jobs/8405c930/tmp/wetslope');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wetslope-profile4'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

for (const no of picks) {
  const m = byNo.get(no);
  await page.evaluate((mx, my) => {
    const g = window.__swGame;
    g.player.debugGod = true;
    g.player.x = mx * 16 + 8; g.player.y = my * 16 + 8;
    g.camera.setZoomTarget(2); g.camera.zoom = 2;
    g.camera.x = mx * 16 + 8; g.camera.y = my * 16 + 8;
    if (g.world.clock) g.world.clock.timeOfDay = 0.35;
    if (g.renderer) g.renderer.fullbright = true;
  }, m.x, m.y);
  await new Promise((r) => setTimeout(r, 2600));
  const path = `${OUT}/fb-${no}.png`;
  await page.screenshot({ path, clip: { x: 1280 / 2 - 120, y: 800 / 2 - 120, width: 240, height: 240 } });
  console.log('[shot]', path, `#${no}`, m.typeKey, `(${m.x},${m.y})`);
}
await browser.close();
