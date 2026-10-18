// 原版化落地四时刻视觉验证:晨(t.275)/午(t.5)/昏(t.72)/夜(t.05)
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const OUT = join(HOME, '.claude/jobs/8405c930/tmp/wl-horizon');
fs.mkdirSync(OUT, { recursive: true });
const B = process.env.T || 'http://localhost:4173';
const TIMES = [['dawn', 0.275], ['noon', 0.5], ['dusk', 0.72], ['night', 0.05]];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wlhz'),
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
for (const [tag, tod] of TIMES) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', tag, String(e.message).slice(0, 120)));
  page.setDefaultTimeout(200000);
  await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
  await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
  await page.evaluate((t) => {
    const g = window.__swGame;
    g.player.x = 383 * 16; g.player.y = 228 * 16; g.player.debugGod = true;
    const c = g.world.clock; if (c) c.timeOfDay = t;
  }, tod);
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const st = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    const W = r.canvas.width, H = r.canvas.height, ctx = r.ctx;
    const avg = (x, y, w, h) => {
      const d = ctx.getImageData(x, y, w, h).data;
      let R = 0, G = 0, Bv = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; Bv += d[i + 2]; n++; }
      return [Math.round(R / n), Math.round(G / n), Math.round(Bv / n)];
    };
    // 太阳附近最亮像素(日色/光斑验证)
    const sun = r.sky.sunScreen, moon = r.sky.moonScreen;
    let sunPx = null;
    if (sun) {
      const d = ctx.getImageData(Math.max(0, sun.x - 40) | 0, Math.max(0, sun.y - 40) | 0, 80, 80).data;
      let best = 0, bi = 0;
      for (let i = 0; i < d.length; i += 4) { const s = d[i] + d[i + 1] + d[i + 2]; if (s > best) { best = s; bi = i; } }
      sunPx = [d[bi], d[bi + 1], d[bi + 2]];
    }
    return {
      wl: r.worldLayerActive, gl: !!(r.worldLight && !r.worldLight.diedAt),
      cots: r.colorOfTheSkies.map(Math.round),
      horizon: r.sky.horizonVis, phase: r.sky.horizonPhase,
      sun: sun ? { x: Math.round(sun.x), y: Math.round(sun.y) } : null, sunPx,
      moon: moon ? [Math.round(moon.x), Math.round(moon.y)] : null,
      skyTop: avg(W / 2 - 100 | 0, 4, 200, 30),
      skyMid: avg(W / 2 - 100 | 0, H / 2 - 60, 200, 30),
    };
  });
  console.log(tag, JSON.stringify(st));
  await page.close();
}
await browser.close();
console.log('DONE →', OUT);
