import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 140)));
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 5000));
await p.evaluate(async () => { const r = await fetch('/tmp-glpar-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 6000));
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.75;
  g.player.x = (g.world.spawnX - 2) * 16; g.player.y = (g.world.spawnY - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = true;
});
await new Promise(r => setTimeout(r, 2000));
await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: join(HOME, '.claude/jobs/8405c930/tmp/bg_gl.png') });
await p.evaluate(() => { window.__swGame.renderer.bgGlEnabled = false; });
await new Promise(r => setTimeout(r, 800));
await p.screenshot({ path: join(HOME, '.claude/jobs/8405c930/tmp/bg_2d.png') });
console.log('截图完成');
await b.close(); process.exit(0);
