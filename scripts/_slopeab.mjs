import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/sab'),
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
const saveJson = fs.readFileSync(needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (7).json')), 'utf8');
await page.evaluate((txt) => window.__swFlow.loadJson(txt), saveJson);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 226 * 16 + 8; g.player.y = 231 * 16;
  g.player.debugGod = true;
  g.world.clock.timeOfDay = 0.5;
  g.camera.zoom = 2.5; g.camera.zoomTarget = 2.5;
});
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: join(HOME, '.claude/jobs/8405c930/tmp/slope-warp.png') });
// 切 2D 回退
await page.evaluate(() => { location.search = '?wwarp=2d'; });
await new Promise((r) => setTimeout(r, 5000));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 226 * 16 + 8; g.player.y = 231 * 16;
  g.player.debugGod = true;
  g.world.clock.timeOfDay = 0.5;
  g.camera.zoom = 2.5; g.camera.zoomTarget = 2.5;
});
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: join(HOME, '.claude/jobs/8405c930/tmp/slope-2d.png') });
console.log('done');
await browser.close();
