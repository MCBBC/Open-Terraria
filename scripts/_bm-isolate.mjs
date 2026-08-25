// 一次性:血月世界层本底取证——彻底关滤镜链(GL+2D),量月亮/天空/地面像素
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.8125 + (16200 / 32400) * 0.375 - 0.0005;
  g.world.clock.moonPhase = 0;
  g.world.clock.bloodMoon = true;
  const pl = g.player;
  pl.x = g.world.store.w * 16 / 2;
  pl.vx = 0;
});
await sleep(3000);
// 彻底关滤镜:GL 层禁用(回落 2D)+2D 血月强度钉 0(每帧)
await p.evaluate(() => {
  const r = window.__swGame.renderer;
  r.screenFxEnabled = false;
  r.__kill = setInterval(() => {
    if (r.monoFilters) r.monoFilters.bloodMoonUseOpacity = 0;
  }, 30);
});
await sleep(1200);
const st = await p.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const cv = g.renderer.canvas ?? document.querySelector('.sw-root canvas');
  const ctx = cv.getContext('2d');
  const moon = sky.moonScreen;
  const px = (x, y, w, h) => {
    const d = ctx.getImageData(Math.max(0, x), Math.max(0, y), w, h).data;
    let r = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    return [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)];
  };
  return {
    moonScreen: moon ? { x: Math.round(moon.x), y: Math.round(moon.y), r: Math.round(moon.r) } : null,
    moonPx: moon ? px(Math.round(moon.x) - 2, Math.round(moon.y) - 2, 5, 5) : null,
    moonAround: moon ? px(Math.round(moon.x) - 70, Math.round(moon.y), 20, 10) : null,
    skyTop: px(200, 5, 60, 20),
    groundMid: px(500, 430, 60, 20),
    cots: g.renderer.colorOfTheSkies.map((v) => Math.round(v)),
    fullbright: !!g.renderer.fullbright
  };
});
await p.screenshot({ path: `${OUT}/bm-worldonly.png` });
console.log('WORLD_ONLY(无滤镜):', JSON.stringify(st));
await p.evaluate(() => { const r = window.__swGame.renderer; if (r.__kill) clearInterval(r.__kill); });
await b.close();
console.log('DONE');
